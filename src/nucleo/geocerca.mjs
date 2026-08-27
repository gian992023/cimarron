// Geocerca por Haversine.
// PORTADO DE COMPY: src/services/geofence.ts (lógica pura, ya validada en producción).
// Compy no se modifica; esta es una copia independiente adaptada a JS.

/** Radio medio de la Tierra en kilómetros. */
const RADIO_TIERRA_KM = 6371;

function gradosARadianes(grados) {
  return (grados * Math.PI) / 180;
}

/**
 * Distancia en kilómetros entre dos coordenadas {lat, lng}.
 * Precisa para las distancias urbanas y veredales de Casanare.
 */
export function distanciaHaversineKm(a, b) {
  const dLat = gradosARadianes(b.lat - a.lat);
  const dLng = gradosARadianes(b.lng - a.lng);
  const lat1 = gradosARadianes(a.lat);
  const lat2 = gradosARadianes(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  // Math.min(1, ...) protege contra errores de redondeo que sacarían a asin de su dominio.
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Evalúa si un destino cae dentro del radio de cobertura de un negocio
 * (domicilio en comercio; servicio de campo en agro). Devuelve { distanciaKm, dentro }.
 */
export function evaluarCobertura(negocio, destino) {
  const radio = negocio.radioCoberturaKm ?? negocio.radioEntregaKm ?? 0;
  const distanciaKm = distanciaHaversineKm(negocio.ubicacion, destino);
  return {
    distanciaKm: Math.round(distanciaKm * 100) / 100,
    dentro: distanciaKm <= radio,
  };
}

/**
 * Puntos de referencia de Yopal y Casanare, para poder resolver una dirección
 * hablada ("estoy por el centro", "en El Triunfo") sin depender de un servicio
 * de geocodificación con costo por consulta.
 */
export const REFERENCIAS_CASANARE = {
  'yopal centro': { lat: 5.3378, lng: -72.3959 },
  'yopal': { lat: 5.3378, lng: -72.3959 },
  'el triunfo': { lat: 5.3268, lng: -72.4103 },
  'la campiña': { lat: 5.3452, lng: -72.4025 },
  'el bosque': { lat: 5.3301, lng: -72.3872 },
  'ciudadela la bendicion': { lat: 5.3157, lng: -72.4188 },
  'aeropuerto el alcaraván': { lat: 5.3197, lng: -72.3840 },
  'unitropico': { lat: 5.3236, lng: -72.4048 },
  'aguazul': { lat: 5.1725, lng: -72.5470 },
  'tauramena': { lat: 5.0180, lng: -72.7472 },
  'villanueva': { lat: 4.6103, lng: -72.9281 },
  'monterrey': { lat: 4.8783, lng: -72.8917 },
  'paz de ariporo': { lat: 5.8797, lng: -71.8917 },
  'trinidad': { lat: 5.4114, lng: -71.6633 },
  'orocue': { lat: 4.7906, lng: -71.3392 },
  'maní': { lat: 4.8172, lng: -72.2842 },
  'pore': { lat: 5.7281, lng: -71.9942 },
  'hato corozal': { lat: 6.1553, lng: -71.7647 },
};

/** Normaliza texto para buscar en REFERENCIAS_CASANARE (sin tildes, minúsculas). */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita marcas de acento
    .trim();
}

/**
 * Resuelve un lugar dicho en lenguaje natural a coordenadas.
 * Devuelve null si no reconoce el lugar: el agente entonces pide precisión.
 */
export function resolverLugar(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  for (const [clave, coords] of Object.entries(REFERENCIAS_CASANARE)) {
    if (t.includes(normalizar(clave))) return { ...coords, referencia: clave };
  }
  return null;
}
