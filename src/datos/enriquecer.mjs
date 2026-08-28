// ENRIQUECIMIENTO DE CATÁLOGO.
//
// La data real importada del Drive trae, para cada comercio y hotel, un ítem
// genérico sin precio ("Pedido en X", "Habitación"). Para que el usuario vea un
// producto o servicio CONCRETO al abrir la hoja del negocio, aquí generamos por
// cada negocio un ítem realista, con precio y descripción, según su categoría.
//
// Es determinista (depende solo del id del negocio): memoria y Supabase quedan
// idénticas, y re-sembrar produce exactamente los mismos ítems.

// Hash entero estable a partir de un texto (para elegir plantilla y precio).
function hash(txt) {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const redondear = (n) => Math.round(n / 500) * 500;

// Precio determinista dentro de un rango [min, max], en pasos de 500.
function precio(id, min, max) {
  const pasos = Math.max(1, Math.floor((max - min) / 500));
  return redondear(min + (hash(id + '#p') % (pasos + 1)) * 500);
}

// Plantillas por categoría. Cada una: varias opciones; se elige una por negocio.
const PLANTILLAS = {
  restaurantes: [
    { tipo: 'producto', nombre: 'Bandeja llanera', unidad: 'porcion', min: 22000, max: 32000, d: (n) => `Plato insignia de ${n}: mamona, yuca, plátano y arroz llanero. Porción generosa.` },
    { tipo: 'producto', nombre: 'Mamona a la llanera (porción)', unidad: 'porcion', min: 20000, max: 30000, d: (n) => `Ternera asada a la estaca al estilo del llano, servida en ${n} con guarnición.` },
    { tipo: 'producto', nombre: 'Ternera a la llanera con yuca', unidad: 'porcion', min: 21000, max: 31000, d: (n) => `Corte de ternera asado lento, yuca y ají criollo. Especialidad de ${n}.` },
    { tipo: 'producto', nombre: 'Hayaca llanera (unidad)', unidad: 'unidad', min: 8000, max: 14000, d: (n) => `Hayaca tradicional envuelta en hoja de plátano, receta casera de ${n}.` },
  ],
  ferreterías: [
    { tipo: 'producto', nombre: 'Bulto de cemento gris 50 kg', unidad: 'bulto', min: 28000, max: 38000, d: (n) => `Cemento gris uso general, 50 kg. Disponible para entrega desde ${n}.` },
    { tipo: 'producto', nombre: 'Galón de pintura vinilo tipo 1', unidad: 'unidad', min: 55000, max: 85000, d: (n) => `Pintura vinilo lavable tipo 1, rendimiento alto. Varios colores en ${n}.` },
    { tipo: 'producto', nombre: 'Kit de herramienta básica', unidad: 'unidad', min: 45000, max: 95000, d: (n) => `Juego básico para hogar: martillo, alicate, destornilladores y metro. En ${n}.` },
  ],
  farmacias: [
    { tipo: 'producto', nombre: 'Acetaminofén 500 mg x 20 tabletas', unidad: 'unidad', min: 4000, max: 9000, d: (n) => `Analgésico y antipirético, caja x 20 tabletas. Disponible en ${n}.` },
    { tipo: 'producto', nombre: 'Alcohol antiséptico 700 ml', unidad: 'unidad', min: 6000, max: 12000, d: (n) => `Alcohol antiséptico para desinfección, frasco de 700 ml. En ${n}.` },
    { tipo: 'producto', nombre: 'Suero oral hidratante x 500 ml', unidad: 'unidad', min: 3500, max: 8000, d: (n) => `Sales de rehidratación oral, botella de 500 ml. Domicilio desde ${n}.` },
  ],
  supermercados: [
    { tipo: 'producto', nombre: 'Mercado básico familiar (canasta)', unidad: 'unidad', min: 45000, max: 90000, d: (n) => `Canasta con arroz, aceite, panela, granos y aseo. Armada en ${n} para su hogar.` },
    { tipo: 'producto', nombre: 'Arroz llano 5 kg', unidad: 'unidad', min: 14000, max: 22000, d: (n) => `Arroz de la región, presentación 5 kg. Precio de ${n}.` },
    { tipo: 'producto', nombre: 'Aceite vegetal 3000 ml', unidad: 'unidad', min: 18000, max: 28000, d: (n) => `Aceite vegetal para cocina, garrafa de 3000 ml. Disponible en ${n}.` },
  ],
  'talleres mecánicos': [
    { tipo: 'servicio', nombre: 'Cambio de aceite y filtro', unidad: 'servicio', modalidad: 'en_sitio', min: 60000, max: 120000, d: (n) => `Cambio de aceite de motor y filtro, con revisión de niveles. Servicio de ${n}.` },
    { tipo: 'servicio', nombre: 'Sincronización de motor', unidad: 'servicio', modalidad: 'en_sitio', min: 80000, max: 160000, d: (n) => `Sincronización y limpieza de inyectores para mejor rendimiento. En ${n}.` },
    { tipo: 'servicio', nombre: 'Revisión y ajuste de frenos', unidad: 'servicio', modalidad: 'en_sitio', min: 45000, max: 110000, d: (n) => `Diagnóstico y ajuste del sistema de frenos, con prueba de ruta. En ${n}.` },
  ],
  'tiendas de ropa': [
    { tipo: 'producto', nombre: 'Camiseta llanera estampada', unidad: 'unidad', min: 28000, max: 55000, d: (n) => `Camiseta con estampado del llano, algodón cómodo. Tallas surtidas en ${n}.` },
    { tipo: 'producto', nombre: 'Jean clásico (dama o caballero)', unidad: 'unidad', min: 45000, max: 95000, d: (n) => `Jean de corte clásico, tela resistente. Varias tallas disponibles en ${n}.` },
    { tipo: 'producto', nombre: 'Conjunto deportivo', unidad: 'unidad', min: 50000, max: 110000, d: (n) => `Conjunto deportivo cómodo para entrenamiento o diario. En ${n}.` },
  ],
  papelerías: [
    { tipo: 'producto', nombre: 'Resma de papel carta (500 hojas)', unidad: 'unidad', min: 14000, max: 24000, d: (n) => `Resma de papel tamaño carta, 75 g, 500 hojas. Disponible en ${n}.` },
    { tipo: 'producto', nombre: 'Kit escolar completo', unidad: 'unidad', min: 25000, max: 60000, d: (n) => `Cuadernos, lápices, colores y útiles básicos para el año escolar. Armado en ${n}.` },
    { tipo: 'servicio', nombre: 'Impresión y fotocopias (x100)', unidad: 'servicio', modalidad: 'en_sitio', min: 8000, max: 20000, d: (n) => `Paquete de 100 impresiones o fotocopias en blanco y negro. Servicio de ${n}.` },
  ],
  // Comercios sin categoría reconocida: pedido genérico pero con precio de referencia.
  _comercio: [
    { tipo: 'producto', nombre: 'Producto destacado del negocio', unidad: 'unidad', min: 15000, max: 45000, d: (n) => `Producto destacado de ${n}. Escribe al negocio para ver más opciones y disponibilidad.` },
  ],
  _turismo: [
    { tipo: 'servicio', nombre: 'Habitación estándar (noche)', unidad: 'noche', modalidad: 'en_sitio', min: 90000, max: 150000, d: (n, m) => `Habitación estándar en ${n}, ${m}. Cómoda y limpia, ideal para descansar tras el viaje.` },
    { tipo: 'servicio', nombre: 'Habitación doble con desayuno (noche)', unidad: 'noche', modalidad: 'en_sitio', min: 120000, max: 190000, d: (n, m) => `Habitación doble con desayuno incluido en ${n}, ${m}. Reserva por noche.` },
  ],
};

// ¿Es un ítem genérico de importación (sin valor real para el usuario)?
function esPlaceholder(item) {
  return (
    (/^Pedido en /i.test(item.nombre || '') || /^Habitaci[oó]n$/i.test(item.nombre || '')) &&
    (item.precioCop === null || item.precioCop === undefined)
  );
}

function plantillaPara(negocio) {
  if (negocio.sector === 'turismo') return PLANTILLAS._turismo;
  const cat = (negocio.categoria || '').toLowerCase();
  return PLANTILLAS[cat] || PLANTILLAS._comercio;
}

/**
 * Devuelve una copia de `items` en la que cada comercio/hotel con solo ítems
 * genéricos recibe un producto o servicio realista (con precio y descripción).
 * No toca agro ni los artesanos: ya traen ítems curados con precio.
 */
export function enriquecerItems(negocios, items) {
  const porNegocio = new Map();
  for (const n of negocios) porNegocio.set(n.id, n);

  const resultado = items.map((i) => ({ ...i }));
  // Índice del primer ítem por negocio, para transformarlo en el ítem real.
  const primerIdx = new Map();
  resultado.forEach((i, idx) => {
    if (!primerIdx.has(i.negocioId)) primerIdx.set(i.negocioId, idx);
  });

  // Negocios cuyos ítems son TODOS placeholder.
  const negociosItems = new Map();
  for (const i of resultado) {
    (negociosItems.get(i.negocioId) || negociosItems.set(i.negocioId, []).get(i.negocioId)).push(i);
  }

  for (const [negId, its] of negociosItems) {
    const negocio = porNegocio.get(negId);
    if (!negocio) continue;
    if (!its.every(esPlaceholder)) continue; // ya tiene algo real

    const opciones = plantillaPara(negocio);
    const elegido = opciones[hash(negId) % opciones.length];
    const idx = primerIdx.get(negId);
    const it = resultado[idx];
    it.tipo = elegido.tipo;
    it.nombre = elegido.nombre;
    it.precioCop = precio(negId, elegido.min, elegido.max);
    it.unidad = elegido.unidad;
    it.categoria = negocio.categoria || (negocio.sector === 'turismo' ? 'alojamiento' : negocio.sector);
    it.descripcion = elegido.d(negocio.nombre, negocio.municipio);
    if (elegido.modalidad) it.modalidad = elegido.modalidad;
  }

  return resultado;
}
