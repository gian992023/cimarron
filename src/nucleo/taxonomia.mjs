// TAXONOMÍA — municipios de Casanare y categorías por sector.
//
// Fuente única de las listas que gobiernan filtros, mapa y validación de ingesta.
// Editar aquí se refleja en la web, el agente y el importador de datos.

/**
 * Los 15 municipios de Casanare que maneja la plataforma, con su coordenada de
 * referencia (cabecera municipal). Sirven para: centrar el mapa, ubicar un
 * negocio cuando solo trae ciudad, y validar que una coordenada caiga en la zona.
 */
export const MUNICIPIOS = {
  'Yopal': { lat: 5.3378, lng: -72.3959 },
  'Aguazul': { lat: 5.1725, lng: -72.5470 },
  'Villanueva': { lat: 4.6103, lng: -72.9281 },
  'Tauramena': { lat: 5.0180, lng: -72.7472 },
  'Monterrey': { lat: 4.8783, lng: -72.8917 },
  'Paz de Ariporo': { lat: 5.8797, lng: -71.8917 },
  'Trinidad': { lat: 5.4114, lng: -71.6633 },
  'Orocué': { lat: 4.7906, lng: -71.3392 },
  'San Luis de Palenque': { lat: 5.4239, lng: -71.7314 },
  'Pore': { lat: 5.7281, lng: -71.9942 },
  'Nunchía': { lat: 5.6367, lng: -72.1953 },
  'Maní': { lat: 4.8172, lng: -72.2842 },
  'Sabanalarga': { lat: 4.8556, lng: -73.0389 },
  'Támara': { lat: 5.8300, lng: -72.1631 },
  'Hato Corozal': { lat: 6.1553, lng: -71.7647 },
  // Los otros 4 municipios de Casanare (completan los 19), presentes en la data:
  'Chámeza': { lat: 5.2144, lng: -72.8722 },
  'La Salina': { lat: 6.1281, lng: -72.3383 },
  'Sácama': { lat: 6.0989, lng: -72.2472 },
  'Recetor': { lat: 5.2292, lng: -72.7614 },
};

/** Límites aproximados de Casanare, para descartar coordenadas fuera del departamento. */
export const LIMITES_CASANARE = { latMin: 4.0, latMax: 6.6, lngMin: -73.3, lngMax: -70.3 };

/** Centro y zoom sugeridos para el mapa. */
export const MAPA_CASANARE = { centro: { lat: 5.35, lng: -71.9 }, zoom: 8 };

/**
 * Categorías del sector Comercio. El comercio es el sector con más variedad de
 * filtros: por eso su taxonomía es amplia y propia.
 */
export const CATEGORIAS_COMERCIO = [
  'restaurantes',
  'ferreterías',
  'farmacias',
  'supermercados',
  'hoteles',
  'talleres mecánicos',
  'tiendas de ropa',
  'papelerías',
];

/** Categorías de referencia por sector (turismo y agro son más acotados). */
export const CATEGORIAS_TURISMO = [
  'alojamiento',
  'planes',
  'pasadias',
  'agencias',
  'gastronomia',
];

export const CATEGORIAS_AGRO = [
  'insumos',
  'veterinaria',
  'genetica',
  'servicios_campo',
  'maquinaria',
];

/** Metadatos de cada sector, para UI y para el prompt del agente. */
export const SECTORES_META = {
  comercio: { nombre: 'Comercio', emoji: '🧺', categorias: CATEGORIAS_COMERCIO },
  turismo: { nombre: 'Turismo', emoji: '🌄', categorias: CATEGORIAS_TURISMO },
  agro: { nombre: 'Agropecuario', emoji: '🐂', categorias: CATEGORIAS_AGRO },
};

/** Normaliza texto (minúsculas, sin tildes) para comparar ciudades y categorías. */
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Resuelve el nombre canónico de un municipio de Casanare, o null si no aplica. */
export function municipioCanonico(ciudad) {
  const c = normalizar(ciudad);
  if (!c) return null;
  for (const nombre of Object.keys(MUNICIPIOS)) {
    if (normalizar(nombre) === c) return nombre;
  }
  // coincidencia parcial (por si viene "Yopal, Casanare")
  for (const nombre of Object.keys(MUNICIPIOS)) {
    if (c.includes(normalizar(nombre))) return nombre;
  }
  return null;
}

/** ¿La coordenada cae dentro de Casanare? */
export function dentroDeCasanare(lat, lng) {
  const { latMin, latMax, lngMin, lngMax } = LIMITES_CASANARE;
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax
  );
}
