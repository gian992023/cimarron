// FLUJO — la lógica de negocio compartida.
//
// PATRÓN PORTADO DE COMPY: servicios puros separados de la interfaz. Aquí vive
// la única implementación de catálogo, solicitudes, pago Bre-B y sello. La
// consumen DOS puertas con el mismo comportamiento:
//   1. Las herramientas del agente de IA (src/agente/herramientas.mjs)
//   2. Los endpoints REST de la interfaz web (servidor.mjs)
// Así lo que el agente hace y lo que la web hace nunca se desincroniza.

import { repositorio } from '../datos/index.mjs';
import { evaluarCobertura, resolverLugar } from '../nucleo/geocerca.mjs';
import {
  formatearCOP,
  formatearDistanciaKm,
  formatearNumeroSolicitud,
} from '../nucleo/formato.mjs';
import { generarReferenciaPago } from '../nucleo/id.mjs';
import { estadoInicial } from '../nucleo/estadosSolicitud.mjs';
import {
  emitirSello,
  verificarSello,
  verificarCadena,
  raizDeCadena,
  HASH_GENESIS,
} from '../nucleo/sello.mjs';

const configPago = () => ({
  llave: process.env.BREB_LLAVE || '@cimarron',
  titular: process.env.BREB_TITULAR || 'CIMARRON',
  qr: process.env.BREB_QR_URL || '/assets/qr-breb.png',
  soporte: process.env.WHATSAPP_SOPORTE || '',
});

/**
 * Regla central de los tres sectores: qué flujo le corresponde a un ítem.
 *   producto (cualquier sector)  → pedido
 *   servicio en turismo          → reserva
 *   servicio en agro/comercio    → agendamiento
 */
export function tipoSolicitudParaItem(item) {
  if (item.tipo === 'producto') return 'pedido';
  if (item.sector === 'turismo') return 'reserva';
  return 'agendamiento';
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

export async function catalogo(filtro = {}) {
  const db = repositorio();
  const items = await db.listarItems(filtro);
  return items.map((i) => ({
    ...i,
    precio: formatearCOP(i.precioCop),
    flujo: tipoSolicitudParaItem(i),
  }));
}

/* ------------------------------------------------------------------ */
/* Cobertura                                                           */
/* ------------------------------------------------------------------ */

export async function cobertura(negocioId, lugar) {
  const db = repositorio();
  const negocio = await db.obtenerNegocio(negocioId);
  if (!negocio) return { error: 'Ese negocio no existe.' };

  const destino = resolverLugar(lugar);
  if (!destino) {
    return {
      error: 'No reconozco ese lugar.',
      sugerencia: 'Indica el barrio, la vereda o el municipio de Casanare.',
    };
  }

  const r = evaluarCobertura(negocio, destino);
  return {
    dentro: r.dentro,
    distanciaKm: r.distanciaKm,
    distancia: formatearDistanciaKm(r.distanciaKm),
    radioKm: negocio.radioCoberturaKm,
    referencia: destino.referencia,
  };
}

/* ------------------------------------------------------------------ */
/* Solicitudes (pedido / reserva / agendamiento)                       */
/* ------------------------------------------------------------------ */

/**
 * Crea la solicitud correcta según el ítem y valida lo que cada flujo exige.
 * Devuelve { solicitud, pago, avisos } o { error, ... }.
 */
export async function crearSolicitudCompleta(entrada) {
  const db = repositorio();
  const item = await db.obtenerItem(entrada.itemId);
  if (!item || !item.activo) {
    return { error: 'Ese ítem no existe en el catálogo. Consulta el catálogo primero.' };
  }

  const cantidad = Math.max(1, Math.round(Number(entrada.cantidad) || 1));
  const cliente = String(entrada.cliente || '').trim();
  const telefono = String(entrada.telefono || '').trim();
  if (!cliente) return { error: 'Falta el nombre de quien solicita.' };
  if (!/^\d{7,12}$/.test(telefono)) {
    return { error: 'Falta un teléfono válido (solo dígitos) para hacer seguimiento.' };
  }

  const tipo = tipoSolicitudParaItem(item);
  const avisos = [];
  const extras = {};

  if (tipo === 'pedido') {
    const lugar = String(entrada.lugar || '').trim();
    if (!lugar) return { error: 'Falta el lugar de entrega (barrio o municipio).' };
    const c = await cobertura(item.negocioId, lugar);
    if (c.error) return c;
    extras.lugar = lugar;
    extras.distanciaKm = c.distanciaKm;
    extras.recogerEnPunto = !c.dentro;
    if (!c.dentro) {
      avisos.push(
        `Queda a ${c.distancia} y el radio de entrega es ${c.radioKm} km: se recoge en el punto del negocio o se coordina envío.`,
      );
    }
  }

  if (tipo === 'reserva') {
    if (!entrada.fechaInicio) return { error: 'Falta la fecha de inicio de la reserva.' };
    extras.fechaInicio = entrada.fechaInicio;
    if (item.categoria === 'alojamiento') {
      if (!entrada.fechaFin) return { error: 'Falta la fecha de salida del alojamiento.' };
      extras.fechaFin = entrada.fechaFin;
    }
    if (entrada.personas) extras.personas = Math.max(1, Math.round(Number(entrada.personas)));
  }

  if (tipo === 'agendamiento') {
    if (!entrada.fecha) return { error: 'Falta la fecha deseada para el servicio.' };
    extras.fecha = entrada.fecha;
    if (item.modalidad === 'a_domicilio') {
      const lugarServicio = String(entrada.lugarServicio || '').trim();
      if (!lugarServicio) {
        return { error: 'Falta el lugar del servicio (finca, vereda o municipio).' };
      }
      extras.lugarServicio = lugarServicio;
      const c = await cobertura(item.negocioId, lugarServicio);
      if (!c.error) {
        extras.distanciaKm = c.distanciaKm;
        if (!c.dentro) {
          avisos.push(
            `El lugar queda a ${c.distancia} y el radio de cobertura es ${c.radioKm} km: la visita queda sujeta a coordinación con el negocio.`,
          );
        }
      }
    }
  }

  const solicitud = await db.crearSolicitud({
    tipo,
    negocioId: item.negocioId,
    itemId: item.id,
    cantidad,
    totalCop: item.precioCop * cantidad,
    cliente,
    telefono,
    estado: estadoInicial(tipo),
    ...extras,
  });

  return {
    solicitud: {
      ...solicitud,
      numeroLegible: formatearNumeroSolicitud(tipo, solicitud.numero),
      itemNombre: item.nombre,
      negocioNombre: item.negocioNombre,
      total: formatearCOP(solicitud.totalCop),
      codigoSello: item.codigoSello,
    },
    pago: await instruccionPagoBreB(solicitud.id),
    avisos,
  };
}

/** Genera (o recupera) la instrucción de pago Bre-B de una solicitud. */
export async function instruccionPagoBreB(solicitudId) {
  const db = repositorio();
  const s = await db.obtenerSolicitud(solicitudId);
  if (!s) return { error: 'Esa solicitud no existe.' };

  const referencia = s.referenciaPago || generarReferenciaPago();
  if (!s.referenciaPago) await db.actualizarSolicitud(s.id, { referenciaPago: referencia });

  const c = configPago();
  return {
    metodo: 'Bre-B',
    llave: c.llave,
    titular: c.titular,
    qr_url: c.qr,
    monto: formatearCOP(s.totalCop),
    montoCop: s.totalCop,
    referencia,
    numeroLegible: formatearNumeroSolicitud(s.tipo, s.numero),
    instruccion:
      `Escanea el QR desde Nequi, Bancolombia o tu banco, o busca la llave ${c.llave}. ` +
      `Transfiere ${formatearCOP(s.totalCop)} y escribe la referencia ${referencia} en el mensaje.`,
    whatsappSoporte: c.soporte ? `https://wa.me/${c.soporte}` : null,
  };
}

/* ------------------------------------------------------------------ */
/* Sello Llanero                                                       */
/* ------------------------------------------------------------------ */

export async function certificarItem(itemId, datos) {
  const db = repositorio();
  const item = await db.obtenerItem(itemId);
  if (!item) return { error: 'Ese ítem no existe.' };
  if (item.codigoSello) {
    return { yaCertificado: true, codigo: item.codigoSello };
  }

  const cadena = await db.listarSellos();
  const sello = emitirSello(
    {
      producto: item.nombre,
      negocio: item.negocioNombre,
      municipio: item.municipio,
      origen: datos.origen,
      tecnica: datos.tecnica,
      materiales: datos.materiales,
      sostenibilidad: datos.sostenibilidad,
    },
    raizDeCadena(cadena),
  );

  await db.guardarSello(sello);
  await db.actualizarItem(item.id, { codigoSello: sello.codigo });

  return {
    codigo: sello.codigo,
    hash: sello.hash,
    hashAnterior: sello.hashAnterior,
    posicion: cadena.length + 1,
    esElPrimero: sello.hashAnterior === HASH_GENESIS,
    emitidoEn: sello.emitidoEn,
  };
}

export async function verificarSelloCompleto(codigo) {
  const db = repositorio();
  const sello = await db.obtenerSello(String(codigo || '').trim().toUpperCase());
  if (!sello) {
    return { valido: false, motivo: 'No existe ningún Sello Llanero con ese código.' };
  }

  const individual = verificarSello(sello);
  const cadena = await db.listarSellos();
  const integridad = verificarCadena(cadena);

  return {
    valido: individual.valido && integridad.valida,
    codigo: sello.codigo,
    producto: sello.producto,
    negocio: sello.negocio,
    municipio: sello.municipio,
    departamento: sello.departamento,
    origen: sello.origen,
    tecnica: sello.tecnica,
    materiales: sello.materiales,
    sostenibilidad: sello.sostenibilidad,
    emitidoEn: sello.emitidoEn,
    hash: sello.hash,
    integridadCadena: integridad.valida ? 'intacta' : integridad.motivo,
    sellosEnCadena: integridad.longitud,
  };
}
