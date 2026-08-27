// CONOCIMIENTO SECTORIAL — la segunda mitad del "entrenamiento" del agente.
//
// Aquí se describe cómo opera cada sector: qué se vende, cómo se cobra, qué
// flujo de solicitud aplica y qué preguntas hace la gente. Este texto entra al
// prompt del sistema, así que editar este archivo cambia el comportamiento del
// agente sin tocar código. Junto con src/datos/semillas.mjs forman todo lo que
// el agente "sabe" del territorio.

export const SECTORES = {
  comercio: {
    nombre: 'Comercio',
    emoji: '🧺',
    flujo: 'pedido',
    resumen: 'Tiendas y oficios locales: artesanía, gastronomía, víveres.',
    reglas: `
- Lo que se vende son PRODUCTOS que se entregan. El flujo es el PEDIDO.
- La entrega a domicilio solo existe dentro del radio de cobertura del negocio
  (geocerca Haversine). Fuera del radio, el cliente recoge en el punto.
- El domiciliario existe SOLO en este sector.
- Pregunta típica: "¿me lo llevan hasta tal barrio?" → evaluar_cobertura antes de prometer.
- La artesanía y el producto de finca son candidatos naturales al Sello Llanero.`,
  },

  turismo: {
    nombre: 'Turismo',
    emoji: '🌄',
    flujo: 'reserva',
    resumen:
      'Alojamiento (hoteles y hatos), planes, pasadías y consumibles del plan. El eslabón completo: desde conseguir dónde dormir hasta la experiencia.',
    reglas: `
- Lo principal son SERVICIOS que el turista disfruta en el sitio. El flujo es la RESERVA:
  siempre pide fecha de inicio y número de personas; en alojamiento pide también fecha
  de salida (la cantidad son las noches).
- No hay domicilio ni geocerca: el turista va al lugar. Entrega indicaciones de llegada.
- El sector también vende PRODUCTOS (consumibles del plan, recuerdos): esos van como pedido.
- Ayuda a armar el plan completo: si reservan safari en un hato lejano, ofrece la noche
  en el hato; si reservan hotel en Yopal, ofrece pasadías y planes cercanos.
- La experiencia cultural auténtica (hato, faena, gastronomía) merece Sello Llanero,
  sobre todo si tiene práctica de conservación o sostenibilidad.`,
  },

  agro: {
    nombre: 'Agropecuario',
    emoji: '🐂',
    flujo: 'agendamiento',
    resumen:
      'Insumos agrícolas y veterinarios, y servicios de campo: fumigación, inseminación, esterilización, consulta en finca.',
    reglas: `
- Vende INSUMOS (productos: sal, semilla, medicamentos) que van como pedido, y
  SERVICIOS de campo que van como AGENDAMIENTO: siempre pide la fecha deseada.
- Un servicio 'a_domicilio' (fumigación, inseminación, consulta en finca) se presta en la
  finca del cliente: pide la vereda o el municipio y valida la cobertura con la geocerca.
  Si queda fuera del radio, dilo y deja la solicitud sujeta a coordinación con el negocio.
- Un servicio 'en_sitio' (esterilización en clínica) se presta en el punto: solo fecha.
- La cantidad depende de la unidad: hectáreas a fumigar, animales a inseminar, visitas.
- Habla el idioma del campo casanareño: potrero, sabana, ordeño, vereda, hato.`,
  },
};

/** Bloque de texto que se inyecta al prompt del sistema. */
export function conocimientoParaPrompt() {
  return Object.entries(SECTORES)
    .map(
      ([clave, s]) =>
        `### Sector ${s.nombre} (${clave}) → flujo: ${s.flujo}\n${s.resumen}\n${s.reglas.trim()}`,
    )
    .join('\n\n');
}

/** Etiquetas de unidad para hablar y para la interfaz. */
export const UNIDADES = {
  unidad: { singular: 'unidad', plural: 'unidades', pregunta: '¿Cuántas unidades?' },
  porcion: { singular: 'porción', plural: 'porciones', pregunta: '¿Cuántas porciones?' },
  libra: { singular: 'libra', plural: 'libras', pregunta: '¿Cuántas libras?' },
  kg: { singular: 'kilo', plural: 'kilos', pregunta: '¿Cuántos kilos?' },
  bulto: { singular: 'bulto', plural: 'bultos', pregunta: '¿Cuántos bultos?' },
  litro: { singular: 'litro', plural: 'litros', pregunta: '¿Cuántos litros?' },
  persona: { singular: 'persona', plural: 'personas', pregunta: '¿Para cuántas personas?' },
  noche: { singular: 'noche', plural: 'noches', pregunta: '¿Cuántas noches?' },
  hectarea: { singular: 'hectárea', plural: 'hectáreas', pregunta: '¿Cuántas hectáreas?' },
  animal: { singular: 'animal', plural: 'animales', pregunta: '¿Cuántos animales?' },
  visita: { singular: 'visita', plural: 'visitas', pregunta: '¿Cuántas visitas?' },
  servicio: { singular: 'servicio', plural: 'servicios', pregunta: '¿Cuántos servicios?' },
};
