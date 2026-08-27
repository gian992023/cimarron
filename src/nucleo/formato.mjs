// Formato de moneda, fechas y distancias.
// PORTADO DE COMPY: src/utils/format.ts. Implementación manual (sin Intl) para
// que el resultado sea idéntico en cualquier runtime.

/** Formatea pesos colombianos: 12500 → "$ 12.500". */
export function formatearCOP(valor) {
  const entero = Math.round(Number(valor) || 0);
  const signo = entero < 0 ? '-' : '';
  const abs = Math.abs(entero).toString();
  const conSeparador = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$ ${conSeparador}`;
}

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** Fecha corta legible: "27 ago 2026". */
export function formatearFechaCorta(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Fecha y hora legible: "27 ago, 14:30". */
export function formatearFechaHora(iso) {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${hh}:${mm}`;
}

/** Distancia legible: bajo 1 km en metros ("350 m"), si no "1,2 km". */
export function formatearDistanciaKm(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Número de pedido legible: "#000123". */
export function formatearNumeroPedido(numero) {
  return `#${String(numero).padStart(6, '0')}`;
}

/** Número de solicitud con prefijo por tipo: "#P-001042", "#R-001043", "#A-001044". */
export function formatearNumeroSolicitud(tipo, numero) {
  const prefijo = { pedido: 'P', reserva: 'R', agendamiento: 'A' }[tipo] || 'S';
  return `#${prefijo}-${String(numero).padStart(6, '0')}`;
}
