// SELLO LLANERO — certificación de origen y autenticidad cultural.
//
// Es una cadena de bloques en su forma esencial: un libro de solo-anexado donde
// cada registro incluye el hash del registro anterior. Alterar un sello cambia su
// hash, lo que invalida todos los sellos posteriores. La manipulación es
// detectable sin confiar en ninguna autoridad: se recalcula y se compara.
//
// El anclaje en cadena pública (Polygon) queda tras un adaptador al final del
// archivo: en producción se publica la raíz de la cadena cada N sellos y así se
// hereda la inmutabilidad de una cadena pública sin pagar gas por cada emisión.

import { createHash, randomBytes } from 'node:crypto';

/** Hash génesis: el ancla del primer sello de la cadena. */
export const HASH_GENESIS = '0'.repeat(64);

/**
 * Serializa un objeto de forma canónica: claves ordenadas alfabéticamente y sin
 * espacios. Sin esto, dos objetos iguales con distinto orden de claves darían
 * hashes distintos y la verificación sería inútil.
 */
export function serializarCanonico(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(',')}]`;
  const claves = Object.keys(valor).sort();
  const pares = claves.map((k) => `${JSON.stringify(k)}:${serializarCanonico(valor[k])}`);
  return `{${pares.join(',')}}`;
}

function sha256(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/**
 * Calcula el hash de un sello a partir de su contenido y del hash del anterior.
 * Esta es la operación que encadena el libro.
 */
export function calcularHashSello(contenido, hashAnterior) {
  return sha256(`${hashAnterior}${serializarCanonico(contenido)}`);
}

/** Código legible que se le entrega al comprador: "LLA-7K3F9A". */
export function generarCodigoSello() {
  const azar = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `LLA-${azar}`;
}

/**
 * Construye un sello nuevo encadenado al último de la cadena.
 *
 * @param {object} datos            Lo que se certifica (producto, negocio, origen, técnica...)
 * @param {string} hashAnterior     Hash del último sello emitido, o HASH_GENESIS
 * @returns {object} El sello completo, listo para guardar
 */
export function emitirSello(datos, hashAnterior = HASH_GENESIS) {
  const contenido = {
    codigo: generarCodigoSello(),
    emitidoEn: new Date().toISOString(),
    producto: datos.producto,
    negocio: datos.negocio,
    municipio: datos.municipio,
    departamento: 'Casanare',
    pais: 'Colombia',
    origen: datos.origen ?? null,
    tecnica: datos.tecnica ?? null,
    materiales: datos.materiales ?? null,
    sostenibilidad: datos.sostenibilidad ?? null,
  };

  return {
    ...contenido,
    hashAnterior,
    hash: calcularHashSello(contenido, hashAnterior),
  };
}

/**
 * Verifica un sello individual: recalcula su hash desde el contenido y lo compara
 * con el guardado. Si alguien alteró un solo carácter, no coincide.
 */
export function verificarSello(sello) {
  const { hash, hashAnterior, ...contenido } = sello;
  const recalculado = calcularHashSello(contenido, hashAnterior);
  return {
    valido: recalculado === hash,
    hashGuardado: hash,
    hashRecalculado: recalculado,
  };
}

/**
 * Verifica la cadena completa: que cada sello sea íntegro y que su hashAnterior
 * corresponda al hash real del sello previo.
 *
 * @returns {{valida: boolean, longitud: number, rotaEn: number|null, motivo: string|null}}
 */
export function verificarCadena(sellos) {
  let anterior = HASH_GENESIS;

  for (let i = 0; i < sellos.length; i++) {
    const sello = sellos[i];

    if (sello.hashAnterior !== anterior) {
      return {
        valida: false,
        longitud: sellos.length,
        rotaEn: i,
        motivo: `El sello ${sello.codigo} no engancha con el anterior.`,
      };
    }

    const { valido } = verificarSello(sello);
    if (!valido) {
      return {
        valida: false,
        longitud: sellos.length,
        rotaEn: i,
        motivo: `El contenido del sello ${sello.codigo} fue alterado después de emitirse.`,
      };
    }

    anterior = sello.hash;
  }

  return { valida: true, longitud: sellos.length, rotaEn: null, motivo: null };
}

/** Raíz de la cadena: el hash del último sello. Es lo que se ancla en cadena pública. */
export function raizDeCadena(sellos) {
  return sellos.length ? sellos[sellos.length - 1].hash : HASH_GENESIS;
}

// ---------------------------------------------------------------------------
// Adaptador de anclaje en cadena pública.
//
// En la demo no se ancla (no hay billetera ni gas y la red del sitio es un riesgo).
// En producción se implementa esta función publicando `raiz` en un contrato de
// Polygon y devolviendo el hash de la transacción. El resto del sistema no cambia:
// esa es la razón de aislarlo detrás de una sola función.
// ---------------------------------------------------------------------------
export async function anclarEnCadenaPublica(raiz) {
  return {
    anclado: false,
    raiz,
    red: 'polygon-amoy',
    nota: 'Anclaje diseñado y aislado tras este adaptador. No se ejecuta en la demo.',
  };
}
