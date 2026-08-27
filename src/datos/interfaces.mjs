// Contrato de la capa de datos.
//
// DECISIÓN ARQUITECTÓNICA PORTADA DE COMPY: patrón Repository.
// El agente, los endpoints REST y la interfaz nunca conocen la implementación
// concreta; solo este contrato. Cambiar de la demo en memoria a Postgres es una
// variable de entorno, no una reescritura.
//
// Dominio (tres sectores: comercio, turismo, agro):
//
// Negocio   { id, sector, nombre, responsable, municipio, telefono?,
//             ubicacion{lat,lng}, radioCoberturaKm, descripcion?, activo }
//
// Item      { id, negocioId, tipo: 'producto'|'servicio', nombre, precioCop,
//             unidad, categoria, descripcion,
//             modalidad?: 'en_sitio'|'a_domicilio'   (solo servicio),
//             diasElaboracion?, codigoSello?, activo }
//
// Solicitud { id, numero, tipo: 'pedido'|'reserva'|'agendamiento',
//             negocioId, itemId, cantidad, totalCop, cliente, telefono,
//             estado, referenciaPago?, pagado, creadoEn,
//             // pedido:       lugar, distanciaKm?, recogerEnPunto?
//             // reserva:      fechaInicio, fechaFin?, personas?
//             // agendamiento: fecha, lugarServicio?, distanciaKm? }
//
// Sello     { codigo, hash, hashAnterior, emitidoEn, ...contenido certificado }

export const METODOS_REQUERIDOS = [
  'listarNegocios', 'obtenerNegocio', 'crearNegocio',
  'listarItems', 'obtenerItem', 'crearItem', 'actualizarItem',
  'crearSolicitud', 'obtenerSolicitud', 'actualizarSolicitud', 'listarSolicitudes',
  'listarSellos', 'obtenerSello', 'guardarSello',
];

/** Falla temprano si una implementación no cumple el contrato. */
export function validarRepositorio(repo, nombre) {
  const faltantes = METODOS_REQUERIDOS.filter((m) => typeof repo[m] !== 'function');
  if (faltantes.length) {
    throw new Error(
      `El repositorio "${nombre}" no cumple el contrato. Faltan: ${faltantes.join(', ')}`,
    );
  }
  return repo;
}
