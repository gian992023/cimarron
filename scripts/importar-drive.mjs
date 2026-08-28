// importar-drive.mjs — limpia la data real recolectada (Google Maps / scrapes)
// y produce src/datos/generado.mjs, respetando la forma propia de cada sector.
//
// Comercio y turismo traen data buena (imagen, dirección, teléfono, rating);
// agro (insumos.csv) viene sin ubicación y con categorías ruidosas, así que para
// agro se conservan los negocios curados reales (con su ubicación y sus sellos).
//
// Uso:  node scripts/importar-drive.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearCSV } from '../src/datos/importar.mjs';
import { NEGOCIOS as CURADOS_NEG, ITEMS as CURADOS_ITM } from '../src/datos/semillas.mjs';
import { municipioCanonico, dentroDeCasanare, normalizar } from '../src/nucleo/taxonomia.mjs';
import { generarId } from '../src/nucleo/id.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRIVE = join(ROOT, 'datos_recolectada', 'drive');
const LIMITE = 100; // por sector con data real

const leer = (n) => (existsSync(join(DRIVE, n)) ? readFileSync(join(DRIVE, n), 'utf8') : '');
const num = (v) => { const n = Number(String(v).replace(',', '.').trim()); return Number.isFinite(n) ? n : null; };

/* Normaliza la categoría cruda de comercio a uno de los 8 buckets del filtro. */
function categoriaComercio(cruda) {
  const c = normalizar(cruda);
  if (/restaurante|comida|parrilla|asadero|pizzer|comida rapida/.test(c)) return 'restaurantes';
  if (/farmacia|drogueria|droguer/.test(c)) return 'farmacias';
  if (/ropa|boutique|moda|calzado|zapat/.test(c)) return 'tiendas de ropa';
  if (/ferreter|herramient|material|construc|electric/.test(c)) return 'ferreterías';
  if (/supermercado|alimentacion|comestible|viveres|mercado|minimercado|general|abarrote/.test(c)) return 'supermercados';
  if (/papeler|libreria|utiles/.test(c)) return 'papelerías';
  if (/taller|mecanic|automovil|autos|llanta|montallanta|lubricadora/.test(c)) return 'talleres mecánicos';
  if (/hotel|hospedaje|alojamiento/.test(c)) return 'hoteles';
  return null; // no cae en los 8 buckets: se omite para mantener el filtro limpio
}

/* Deriva el modo de entrega a partir del campo servicios de Google Maps. */
function fulfillment(servicios) {
  const s = normalizar(servicios);
  return {
    domicilio: /domicilio|entrega|sin contacto/.test(s),
    recoger: /tienda|puerta|lugar|llevar|retiro|automovil/.test(s) || !s,
  };
}

const negocios = [];
const items = [];
const reporte = { comercio: { ok: 0, no: 0 }, turismo: { ok: 0, no: 0 }, agro: { ok: 0, no: 0 } };

/* ----------------------------- COMERCIO ----------------------------- */
for (const f of parsearCSV(leer('comercio.csv'))) {
  if (reporte.comercio.ok >= LIMITE) break;
  const lat = num(f.latitud), lng = num(f.longitud);
  const muni = municipioCanonico(f.ciudad);
  const cat = categoriaComercio(f.categoria);
  if (!f.nombre || !muni || !dentroDeCasanare(lat, lng) || !cat) { reporte.comercio.no++; continue; }

  const id = generarId('neg');
  const ff = fulfillment(f.servicios);
  negocios.push({
    id, sector: 'comercio', nombre: f.nombre.trim(), categoria: cat, municipio: muni,
    ubicacion: { lat, lng }, direccion: f.direccion?.trim() || null,
    telefono: f.telefono?.trim() || null, sitioWeb: f.sitio_web?.trim() || null,
    imagenUrl: f.imagen_url?.startsWith('http') ? f.imagen_url.trim() : null,
    descripcion: `${f.nombre.trim()} en ${muni}, Casanare.`,
    radioCoberturaKm: 8, entrega: ff,
    pago: { breb: true, contraentrega: true },
  });
  items.push({
    id: generarId('itm'), negocioId: id, tipo: 'producto',
    nombre: `Pedido en ${f.nombre.trim()}`, precioCop: null, unidad: 'pedido',
    categoria: cat, descripcion: 'Haz tu pedido; el negocio confirma disponibilidad y precio.',
    codigoSello: null, activo: true,
  });
  reporte.comercio.ok++;
}

/* ------------------------------ TURISMO ----------------------------- */
for (const f of parsearCSV(leer('turismo.csv'))) {
  if (reporte.turismo.ok >= LIMITE) break;
  const lat = num(f.latitud), lng = num(f.longitud);
  const muni = municipioCanonico(f.ciudad);
  if (!f.nombre || !muni || !dentroDeCasanare(lat, lng)) { reporte.turismo.no++; continue; }

  const id = generarId('neg');
  const habs = num(f.habitaciones) || null;
  negocios.push({
    id, sector: 'turismo', nombre: f.nombre.trim(), categoria: 'hoteles', municipio: muni,
    ubicacion: { lat, lng }, direccion: null, telefono: null, sitioWeb: null,
    imagenUrl: f.imagen1?.startsWith('http') ? f.imagen1.trim() : null,
    descripcion: f.descripcion?.trim() || `Alojamiento en ${muni}, Casanare.`,
    rating: num(f.rating) || null, habitaciones: habs,
    radioCoberturaKm: 0, pago: { breb: true, contraentrega: false },
  });
  // El hotel se reserva por habitación (una sola vez el establecimiento, se elige al reservar).
  items.push({
    id: generarId('itm'), negocioId: id, tipo: 'servicio', modalidad: 'en_sitio',
    nombre: 'Habitación', precioCop: null, unidad: 'noche', categoria: 'alojamiento',
    descripcion: 'Reserva por noche; el hotel confirma disponibilidad y tarifa.',
    codigoSello: null, activo: true,
  });
  reporte.turismo.ok++;
}

/* -------------------------------- AGRO ------------------------------ */
// Se conservan los negocios curados reales (con ubicación y sellos) mientras
// llega data agro con coordenadas. También se arrastran los curados de comercio
// y turismo que llevan certificación, para no perder la demo del Sello Llanero.
const curadosParaConservar = CURADOS_NEG.filter((n) => n.sector === 'agro');
const idsAgro = new Set(curadosParaConservar.map((n) => n.id));
// además conservamos los 3 negocios curados con sello (aunque sean comercio/turismo)
const conSello = new Set(CURADOS_ITM.filter((i) => i.certificacion).map((i) => i.negocioId));
for (const n of CURADOS_NEG) if (conSello.has(n.id)) idsAgro.add(n.id);

for (const n of CURADOS_NEG) {
  if (!idsAgro.has(n.id)) continue;
  negocios.push(JSON.parse(JSON.stringify(n)));
  if (n.sector === 'agro') reporte.agro.ok++;
}
for (const i of CURADOS_ITM) {
  if (idsAgro.has(i.negocioId)) items.push(JSON.parse(JSON.stringify(i)));
}

/* ------------------------------ ESCRIBIR ---------------------------- */
writeFileSync(
  join(ROOT, 'src', 'datos', 'generado.mjs'),
  `// Generado por scripts/importar-drive.mjs desde datos_recolectada/drive/. No editar a mano.\n` +
    `export const NEGOCIOS = ${JSON.stringify(negocios, null, 1)};\n\n` +
    `export const ITEMS = ${JSON.stringify(items, null, 1)};\n`,
);

console.log('  Ingesta desde Drive (data real de Casanare)');
console.log('  ─────────────────────────────────────────');
console.log(`  comercio: ${reporte.comercio.ok} integrados (${reporte.comercio.no} omitidos)`);
console.log(`  turismo : ${reporte.turismo.ok} integrados (${reporte.turismo.no} omitidos)`);
console.log(`  agro    : ${reporte.agro.ok} curados conservados (data de insumos sin ubicación, pendiente)`);
console.log(`  ──> negocios: ${negocios.length} · ítems: ${items.length}`);
