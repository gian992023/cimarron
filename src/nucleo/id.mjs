// Generador de IDs legibles con prefijo.
// PORTADO DE COMPY: src/utils/id.ts.

export function generarId(prefijo = 'id') {
  const tiempo = Date.now().toString(36);
  const azar = Math.random().toString(36).slice(2, 8);
  return `${prefijo}_${tiempo}${azar}`;
}

/** Referencia de pago legible para Bre-B: "CIM-K3F9A2". */
export function generarReferenciaPago() {
  const azar = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CIM-${azar}`;
}
