// Servidor de CIMARRÓN.
//
// Un solo proceso: sirve la interfaz web y expone el agente. Sin framework, sin
// build, sin Docker. `node servidor.mjs` y listo. En hackathon, cada paso de
// arranque que se elimina es un riesgo de demo que desaparece.
//
// La ANTHROPIC_API_KEY vive SOLO aquí. Nunca se envía al navegador.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const RAIZ = dirname(fileURLToPath(import.meta.url));

/* --------- carga de .env sin dependencias --------- */
function cargarEnv() {
  const ruta = join(RAIZ, '.env');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i < 1) continue;
    const clave = limpia.slice(0, i).trim();
    const valor = limpia.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}
cargarEnv();

// La importación va después de cargar .env: el agente lee variables al construirse.
const { conversar, metodoAuth, modeloActivo, proveedorIA } = await import('./src/agente/index.mjs');
const { origenActual, repositorio, inicializarDatos } = await import('./src/datos/index.mjs');
await inicializarDatos(); // deja listo el origen (memoria o supabase) antes de servir
const { catalogo, crearSolicitudCompleta, verificarSelloCompleto } = await import(
  './src/servicios/flujo.mjs'
);
const { registrarCliente, registrarNegocio, login, panelAdmin, decidirNegocio, perfilDe } = await import(
  './src/servicios/cuentas.mjs'
);
const { formatearCOP, formatearNumeroSolicitud, formatearFechaHora } = await import(
  './src/nucleo/formato.mjs'
);
const { ETIQUETAS } = await import('./src/nucleo/estadosSolicitud.mjs');
const { MUNICIPIOS, SECTORES_META, MAPA_CASANARE } = await import('./src/nucleo/taxonomia.mjs');

const PUERTO = Number(process.env.PORT || process.env.PUERTO || 8787);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// CORS abierto en /api: el frente en GitHub Pages (otro origen) debe poder
// llamar al agente cuando el backend corre en Render.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function responder(res, codigo, cuerpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(codigo, { 'Content-Type': tipo, 'Cache-Control': 'no-store', ...CORS });
  res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo));
}

async function leerCuerpo(req, limiteBytes = 1_000_000) {
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > limiteBytes) throw new Error('Cuerpo de la petición demasiado grande.');
    trozos.push(t);
  }
  return JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}');
}

/** Sirve un archivo estático, bloqueando cualquier salto fuera de la raíz. */
async function servirEstatico(res, rutaUrl) {
  const relativa = normalize(decodeURIComponent(rutaUrl)).replace(/^([/\\])+/, '');
  const permitida = relativa.startsWith('web') || relativa.startsWith('assets');
  if (!permitida || relativa.includes('..')) return responder(res, 404, { error: 'No encontrado' });

  const completa = join(RAIZ, relativa);
  if (!completa.startsWith(RAIZ)) return responder(res, 404, { error: 'No encontrado' });

  try {
    const contenido = await readFile(completa);
    responder(res, 200, contenido, TIPOS[extname(completa).toLowerCase()] || 'application/octet-stream');
  } catch {
    responder(res, 404, { error: 'No encontrado' });
  }
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname;

  // Preflight CORS para el agente llamado desde otro origen (Pages -> Render).
  if (req.method === 'OPTIONS' && ruta.startsWith('/api/')) {
    res.writeHead(204, CORS);
    return res.end();
  }

  // --- API: negocios (para el mapa y la vitrina) ---
  if (ruta === '/api/negocios' && req.method === 'GET') {
    const negs = await repositorio().listarNegocios({
      sector: url.searchParams.get('sector') || undefined,
    });
    return responder(res, 200, {
      negocios: negs.map((n) => ({
        id: n.id, nombre: n.nombre, sector: n.sector, categoria: n.categoria || null,
        municipio: n.municipio, telefono: n.telefono || null, sitioWeb: n.sitioWeb || null,
        direccion: n.direccion || null, ubicacion: n.ubicacion,
        imagenUrl: n.imagenUrl || null, descripcion: n.descripcion || null,
        rating: n.rating ?? null, entrega: n.entrega || null, pago: n.pago || null,
      })),
    });
  }

  // --- API: un negocio con sus ítems (la hoja del negocio) ---
  if (ruta.startsWith('/api/negocio/') && req.method === 'GET') {
    const id = decodeURIComponent(ruta.slice('/api/negocio/'.length));
    const negocio = await repositorio().obtenerNegocio(id);
    if (!negocio) return responder(res, 404, { error: 'Negocio no encontrado' });
    const items = await catalogo({ negocioId: id });
    return responder(res, 200, { negocio, items });
  }

  // --- API: taxonomía (municipios y categorías para filtros y mapa) ---
  if (ruta === '/api/taxonomia' && req.method === 'GET') {
    return responder(res, 200, { municipios: MUNICIPIOS, sectores: SECTORES_META, mapa: MAPA_CASANARE });
  }

  // --- API: estado del sistema ---
  if (ruta === '/api/estado') {
    return responder(res, 200, {
      ok: true,
      proyecto: 'CIMARRÓN',
      modelo: modeloActivo(),
      proveedor_ia: proveedorIA(),
      esfuerzo: process.env.CIMARRON_ESFUERZO || 'medium',
      origen_datos: origenActual(),
      llave_configurada: metodoAuth() !== null,
      auth: metodoAuth() || 'sin_configurar',
      breb_llave: process.env.BREB_LLAVE || '(sin configurar)',
      qr_disponible: existsSync(join(RAIZ, 'assets', 'qr-breb.png')),
      whatsapp_contacto: process.env.WHATSAPP_CONTACTO || '573123066149',
    });
  }

  // --- API: catálogo de los tres sectores ---
  if (ruta === '/api/catalogo' && req.method === 'GET') {
    try {
      const items = await catalogo({
        sector: url.searchParams.get('sector') || undefined,
        tipo: url.searchParams.get('tipo') || undefined,
        categoria: url.searchParams.get('categoria') || undefined,
        municipio: url.searchParams.get('municipio') || undefined,
        busqueda: url.searchParams.get('q') || undefined,
      });
      return responder(res, 200, { items });
    } catch (e) {
      return responder(res, 500, { error: String(e?.message || e) });
    }
  }

  // --- API: crear solicitud (pedido / reserva / agendamiento) + pago Bre-B ---
  if (ruta === '/api/solicitudes' && req.method === 'POST') {
    try {
      const cuerpo = await leerCuerpo(req);
      const r = await crearSolicitudCompleta(cuerpo);
      return responder(res, r.error ? 400 : 200, r);
    } catch (e) {
      return responder(res, 500, { error: String(e?.message || e) });
    }
  }

  // --- API: mis solicitudes por teléfono ---
  if (ruta === '/api/solicitudes' && req.method === 'GET') {
    const telefono = url.searchParams.get('telefono');
    if (!telefono) return responder(res, 400, { error: 'Falta el teléfono.' });
    const lista = await repositorio().listarSolicitudes({ telefono });
    return responder(res, 200, {
      solicitudes: lista.map((s) => ({
        ...s,
        numeroLegible: formatearNumeroSolicitud(s.tipo, s.numero),
        total: formatearCOP(s.totalCop),
        estadoEtiqueta: ETIQUETAS[s.estado] ?? s.estado,
        creadoLegible: formatearFechaHora(s.creadoEn),
      })),
    });
  }

  // --- API: verificador público del Sello Llanero ---
  if (ruta.startsWith('/api/sello/') && req.method === 'GET') {
    const codigo = decodeURIComponent(ruta.slice('/api/sello/'.length));
    return responder(res, 200, await verificarSelloCompleto(codigo));
  }

  // --- API: cuentas (registro, login) ---
  if (ruta === '/api/registro/cliente' && req.method === 'POST') {
    const r = await registrarCliente(await leerCuerpo(req));
    return responder(res, r.error ? 400 : 200, r);
  }
  if (ruta === '/api/registro/negocio' && req.method === 'POST') {
    const r = await registrarNegocio(await leerCuerpo(req));
    return responder(res, r.error ? 400 : 200, r);
  }
  if (ruta === '/api/login' && req.method === 'POST') {
    const r = await login(await leerCuerpo(req));
    return responder(res, r.error ? 400 : 200, r);
  }

  // --- API: perfil del usuario (según su rol) ---
  if (ruta === '/api/perfil' && req.method === 'GET') {
    const uid = req.headers['x-usuario-id'];
    if (!uid) return responder(res, 401, { error: 'Inicia sesión.' });
    const r = await perfilDe(uid);
    return responder(res, r.error ? 400 : 200, r);
  }

  // --- API: favoritos del usuario ---
  if (ruta === '/api/favoritos') {
    const uid = req.headers['x-usuario-id'];
    if (!uid) return responder(res, 401, { error: 'Inicia sesión para usar favoritos.' });
    const db = repositorio();
    if (req.method === 'GET') {
      return responder(res, 200, { favoritos: await db.listarFavoritos(uid) });
    }
    if (req.method === 'POST') {
      const { itemId } = await leerCuerpo(req);
      if (!itemId) return responder(res, 400, { error: 'Falta el ítem.' });
      await db.agregarFavorito(uid, itemId);
      return responder(res, 200, { ok: true, favoritos: await db.listarFavoritos(uid) });
    }
    if (req.method === 'DELETE') {
      const { itemId } = await leerCuerpo(req);
      if (!itemId) return responder(res, 400, { error: 'Falta el ítem.' });
      await db.quitarFavorito(uid, itemId);
      return responder(res, 200, { ok: true, favoritos: await db.listarFavoritos(uid) });
    }
  }

  // --- API: administración (requiere sesión de admin) ---
  if (ruta.startsWith('/api/admin/')) {
    const uid = req.headers['x-usuario-id'];
    const usuario = uid ? await repositorio().obtenerUsuario(uid) : null;
    if (!usuario || usuario.rol !== 'admin') {
      return responder(res, 403, { error: 'Solo el administrador puede acceder.' });
    }
    if (ruta === '/api/admin/panel' && req.method === 'GET') {
      return responder(res, 200, await panelAdmin());
    }
    if (ruta === '/api/admin/decidir' && req.method === 'POST') {
      const { negocioId, decision } = await leerCuerpo(req);
      return responder(res, 200, await decidirNegocio(negocioId, decision));
    }
    return responder(res, 404, { error: 'Ruta admin no encontrada' });
  }

  // --- API: el agente ---
  if (ruta === '/api/agente' && req.method === 'POST') {
    try {
      const { mensajes } = await leerCuerpo(req);
      if (!Array.isArray(mensajes) || !mensajes.length) {
        return responder(res, 400, { error: 'Se requiere un arreglo "mensajes" no vacío.' });
      }
      const resultado = await conversar(mensajes);
      return responder(res, 200, resultado);
    } catch (e) {
      console.error('[agente]', e);
      return responder(res, 500, { error: String(e?.message || e) });
    }
  }

  // --- estáticos ---
  if (ruta === '/' || ruta === '/index.html') return servirEstatico(res, 'web/index.html');
  if (ruta.startsWith('/assets/')) return servirEstatico(res, ruta.slice(1));
  return servirEstatico(res, `web${ruta}`);
});

servidor.listen(PUERTO, () => {
  const listo = process.env.ANTHROPIC_API_KEY;
  console.log('');
  console.log('  CIMARRÓN  ·  Agente de IA para la cadena productiva del llano');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  Interfaz:      http://localhost:${PUERTO}`);
  console.log(`  Modelo:        ${modeloActivo()}  (proveedor: ${proveedorIA()})`);
  console.log(`  Origen datos:  ${origenActual()}`);
  console.log(`  Llave API:     ${listo ? 'configurada' : 'FALTA (revisa .env)'}`);
  console.log('');
});
