// IMPORTAR — ingesta ordenada de la data recolectada de cada sector.
//
// Cada sector llega con SU PROPIA estructura de columnas. Este módulo:
//   1. parsea el CSV respetando comillas (comercio trae comas dentro de servicios),
//   2. valida fila por fila contra las columnas obligatorias del sector,
//   3. DESCARTA lo incompleto o inválido (no se integra data a medias),
//   4. normaliza al modelo interno (negocios + ítems) que consume el agente.
//
// Estructuras esperadas (encabezados exactos, en minúscula, sin tildes obligatorio):
//   comercio: nombre,categoria,ciudad,latitud,longitud,direccion,telefono,sitio_web,imagen_url,servicios
//   turismo:  nombre,categoria,latitud,longitud,servicios,ciudad
//   agro:     nombre,latitud,longitud,servicios,ciudad
//
// Regla de oro: todo esto termina alimentando a una IA. Por eso solo entra data
// completa y con estructura respetada; lo demás se reporta y se deja fuera.

import { generarId } from '../nucleo/id.mjs';
import {
  municipioCanonico, dentroDeCasanare, MUNICIPIOS, normalizar,
} from '../nucleo/taxonomia.mjs';

/* ------------------------------------------------------------------ */
/* Parser CSV (respeta comillas dobles y saltos de línea dentro de campo) */
/* ------------------------------------------------------------------ */
export function parsearCSV(texto) {
  const filas = [];
  let campo = '';
  let fila = [];
  let enComillas = false;
  const t = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(campo); campo = '';
    } else if (c === '\n') {
      fila.push(campo); filas.push(fila); campo = ''; fila = [];
    } else campo += c;
  }
  if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }

  // primera fila = encabezados; el resto, objetos
  if (!filas.length) return [];
  const encabezados = filas[0].map((h) => normalizar(h).replace(/\s+/g, '_'));
  return filas.slice(1)
    .filter((f) => f.some((v) => String(v).trim() !== ''))
    .map((f) => Object.fromEntries(encabezados.map((h, j) => [h, (f[j] ?? '').trim()])));
}

/** Convierte "3,5" o "3.5" o "-72,39" a número; null si no es válido. */
function aNumero(v) {
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

/** Separa el campo servicios en una lista, probando varios separadores. */
function partirServicios(v) {
  const s = String(v || '').trim();
  if (!s) return [];
  const sep = s.includes(';') ? ';' : s.includes('|') ? '|' : s.includes('\n') ? '\n' : ',';
  return s.split(sep).map((x) => x.trim()).filter(Boolean);
}

/** Ubica un negocio: usa lat/lng si son válidas; si no, la cabecera del municipio. */
function resolverUbicacion(lat, lng, municipio) {
  if (dentroDeCasanare(lat, lng)) return { lat, lng, fuente: 'coordenada' };
  if (municipio && MUNICIPIOS[municipio]) return { ...MUNICIPIOS[municipio], fuente: 'municipio' };
  return null;
}

/* ------------------------------------------------------------------ */
/* Validadores + normalizadores por sector                             */
/* ------------------------------------------------------------------ */

// Servicios es obligatorio en turismo y agro (ahí describe lo vendible). En
// comercio la fuente (Google Maps) no trae servicios confiables, así que es
// opcional: el negocio entra como directorio y su categoría genera el ítem.
const REQUERIDOS = {
  comercio: ['nombre', 'categoria', 'ciudad', 'latitud', 'longitud'],
  turismo: ['nombre', 'categoria', 'latitud', 'longitud', 'servicios', 'ciudad'],
  agro: ['nombre', 'latitud', 'longitud', 'servicios', 'ciudad'],
};

// Servicios de comercio que por su nombre son productos (se venden por pedido);
// el resto se ofrece como servicio. Heurística editable.
const PALABRAS_SERVICIO = ['servicio', 'reparacion', 'mantenimiento', 'instalacion', 'asesoria', 'consulta', 'domicilio', 'lavado', 'alquiler'];

function esServicioPorNombre(nombre) {
  const n = normalizar(nombre);
  return PALABRAS_SERVICIO.some((p) => n.includes(p));
}

/**
 * Normaliza una fila de un sector a { negocio, items } o devuelve { descartada, motivo }.
 */
function normalizarFila(sector, fila, indice) {
  const faltantes = REQUERIDOS[sector].filter((k) => !String(fila[k] ?? '').trim());
  if (faltantes.length) {
    return { descartada: true, motivo: `faltan columnas: ${faltantes.join(', ')}`, indice };
  }

  const lat = aNumero(fila.latitud);
  const lng = aNumero(fila.longitud);
  const municipio = municipioCanonico(fila.ciudad);
  const ubic = resolverUbicacion(lat, lng, municipio);

  if (!ubic) return { descartada: true, motivo: 'coordenada fuera de Casanare y ciudad no reconocida', indice };
  if (!municipio && ubic.fuente === 'municipio') {
    return { descartada: true, motivo: `ciudad no es municipio de Casanare: "${fila.ciudad}"`, indice };
  }
  const muniFinal = municipio || municipioCanonico(fila.ciudad);
  if (!muniFinal) return { descartada: true, motivo: `ciudad no reconocida: "${fila.ciudad}"`, indice };

  const negocioId = generarId('neg');
  let servicios = partirServicios(fila.servicios);
  if (!servicios.length) {
    // comercio: la categoría es el ítem del directorio; turismo/agro sí exigen servicios
    if (sector === 'comercio') servicios = [fila.categoria || 'Productos y servicios'];
    else return { descartada: true, motivo: 'sin servicios listados', indice };
  }

  const negocio = {
    id: negocioId,
    sector,
    nombre: fila.nombre.trim(),
    categoria: normalizar(fila.categoria) || undefined,
    responsable: null,
    municipio: muniFinal,
    telefono: fila.telefono?.trim() || null,
    sitioWeb: fila.sitio_web?.trim() || null,
    imagenUrl: fila.imagen_url?.trim() || null,
    direccion: fila.direccion?.trim() || null,
    ubicacion: { lat: ubic.lat, lng: ubic.lng },
    // radio de cobertura: comercio y agro entregan/visitan; turismo el cliente va
    radioCoberturaKm: sector === 'turismo' ? 0 : sector === 'agro' ? 40 : 10,
    // pago: cada negocio maneja su Bre-B; contraentrega solo aplica a comercio
    pago: {
      breb: true,
      contraentrega: sector === 'comercio',
    },
    descripcion: null, // la IA la puede enriquecer después
  };

  // Cada servicio del negocio se vuelve un ítem vendible. Sin precio en la data:
  // queda "a convenir" y la solicitud se coordina con el negocio.
  const items = servicios.map((nombreServ) => {
    let tipo, flujo;
    if (sector === 'turismo') { tipo = 'servicio'; flujo = 'reserva'; }
    else if (sector === 'agro') {
      const serv = esServicioPorNombre(nombreServ);
      tipo = serv ? 'servicio' : 'producto';
      flujo = serv ? 'agendamiento' : 'pedido';
    } else { // comercio
      const serv = esServicioPorNombre(nombreServ);
      tipo = serv ? 'servicio' : 'producto';
      flujo = serv ? 'agendamiento' : 'pedido';
    }
    return {
      id: generarId('itm'),
      negocioId,
      tipo,
      nombre: nombreServ,
      precioCop: null, // a convenir con el negocio (la data recolectada no trae precio)
      unidad: 'unidad',
      categoria: negocio.categoria || sector,
      modalidad: tipo === 'servicio' ? (sector === 'turismo' ? 'en_sitio' : 'a_domicilio') : undefined,
      descripcion: null,
      codigoSello: null,
      activo: true,
    };
  });

  return { negocio, items };
}

/* ------------------------------------------------------------------ */
/* Punto de entrada: recibe { comercio, turismo, agro } como texto CSV  */
/* ------------------------------------------------------------------ */

/**
 * @param {{comercio?:string, turismo?:string, agro?:string}} csvsPorSector
 * @returns {{negocios:Array, items:Array, reporte:object}}
 */
export function importar(csvsPorSector) {
  const negocios = [];
  const items = [];
  const reporte = { total: {}, integrados: {}, descartados: {}, motivos: [] };

  for (const sector of ['comercio', 'turismo', 'agro']) {
    const csv = csvsPorSector[sector];
    if (!csv) { reporte.total[sector] = 0; reporte.integrados[sector] = 0; reporte.descartados[sector] = 0; continue; }

    const filas = parsearCSV(csv);
    reporte.total[sector] = filas.length;
    let ok = 0, no = 0;

    filas.forEach((fila, i) => {
      const r = normalizarFila(sector, fila, i + 2); // +2: fila 1 = encabezados
      if (r.descartada) {
        no++;
        reporte.motivos.push({ sector, fila: r.indice, nombre: fila.nombre || '(sin nombre)', motivo: r.motivo });
      } else {
        negocios.push(r.negocio);
        items.push(...r.items);
        ok++;
      }
    });

    reporte.integrados[sector] = ok;
    reporte.descartados[sector] = no;
  }

  reporte.resumen = {
    negocios: negocios.length,
    items: items.length,
    descartadosTotal: Object.values(reporte.descartados).reduce((a, b) => a + b, 0),
  };
  return { negocios, items, reporte };
}
