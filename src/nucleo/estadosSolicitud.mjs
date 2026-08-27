// Máquinas de estado por tipo de solicitud.
// ADAPTADO DE COMPY (src/services/orderStateMachine.ts): misma idea de
// transiciones explícitas, pero aquí hay tres flujos porque cada sector
// tiene su propia realidad operativa.
//
//   pedido        (comercio, y productos de cualquier sector)
//   reserva       (servicios de turismo)
//   agendamiento  (servicios agro y de campo)

export const FLUJOS = {
  pedido: {
    creado: ['confirmado', 'cancelado'],
    confirmado: ['preparando', 'cancelado'],
    preparando: ['en_camino', 'cancelado'],
    en_camino: ['entregado', 'cancelado'],
    entregado: [],
    cancelado: [],
  },
  reserva: {
    solicitada: ['confirmada', 'cancelada'],
    confirmada: ['completada', 'cancelada'],
    completada: [],
    cancelada: [],
  },
  agendamiento: {
    solicitado: ['confirmado', 'cancelado'],
    confirmado: ['en_ruta', 'cancelado'],
    en_ruta: ['realizado', 'cancelado'],
    realizado: [],
    cancelado: [],
  },
};

export const ETIQUETAS = {
  creado: 'Creado',
  confirmado: 'Confirmado',
  preparando: 'En preparación',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  solicitada: 'Solicitada',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  solicitado: 'Solicitado',
  en_ruta: 'En ruta',
  realizado: 'Realizado',
};

export function estadoInicial(tipo) {
  return { pedido: 'creado', reserva: 'solicitada', agendamiento: 'solicitado' }[tipo];
}

export function transicionValida(tipo, desde, hacia) {
  return (FLUJOS[tipo]?.[desde] ?? []).includes(hacia);
}

export function esFinal(tipo, estado) {
  return (FLUJOS[tipo]?.[estado] ?? []).length === 0;
}
