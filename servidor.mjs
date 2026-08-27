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
const { conversar } = await import('./src/agente/index.mjs');
const { origenActual, repositorio } = await import('./src/datos/index.mjs');
const { catalogo, crearSolicitudCompleta, verificarSelloCompleto } = await import(
  './src/servicios/flujo.mjs'
);
const { formatearCOP, formatearNumeroSolicitud, formatearFechaHora } = await import(
  './src/nucleo/formato.mjs'
);
const { ETIQUETAS } = await import('./src/nucleo/estadosSolicitud.mjs');

const PUERTO = Number(process.env.PUERTO || 8787);

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

function responder(res, codigo, cuerpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(codigo, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
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

  // --- API: estado del sistema ---
  if (ruta === '/api/estado') {
    return responder(res, 200, {
      ok: true,
      proyecto: 'CIMARRÓN',
      modelo: process.env.CIMARRON_MODELO || 'claude-opus-5',
      esfuerzo: process.env.CIMARRON_ESFUERZO || 'medium',
      origen_datos: origenActual(),
      llave_configurada: Boolean(process.env.ANTHROPIC_API_KEY),
      breb_llave: process.env.BREB_LLAVE || '(sin configurar)',
      qr_disponible: existsSync(join(RAIZ, 'assets', 'qr-breb.png')),
    });
  }

  // --- API: catálogo de los tres sectores ---
  if (ruta === '/api/catalogo' && req.method === 'GET') {
    try {
      const items = await catalogo({
        sector: url.searchParams.get('sector') || undefined,
        tipo: url.searchParams.get('tipo') || undefined,
        categoria: url.searchParams.get('categoria') || undefined,
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
  console.log(`  Modelo:        ${process.env.CIMARRON_MODELO || 'claude-opus-5'}`);
  console.log(`  Origen datos:  ${origenActual()}`);
  console.log(`  Llave API:     ${listo ? 'configurada' : 'FALTA (revisa .env)'}`);
  console.log('');
});
