// Interfaz de CIMARRÓN — plataforma de tres sectores.
//
// Funciona en DOS modos con el mismo código:
//   · Con servidor (localhost / node servidor.mjs): usa la API REST y el
//     agente de IA. La llave de la API vive solo en el servidor.
//   · Estático (GitHub Pages): si existe window.CIMARRON_DATOS (lo inyecta
//     datos.js, generado por scripts/build-docs.mjs), el catálogo, los flujos,
//     el pago Bre-B y la verificación del sello corren en el navegador. El
//     agente en vivo no está disponible en estático (necesita servidor + llave).

const $ = (id) => document.getElementById(id);

/* ================================================================ */
/* Backend: REST (servidor) o en memoria (estático)                 */
/* ================================================================ */

const DATOS = typeof window !== 'undefined' ? window.CIMARRON_DATOS : null;
const ESTATICO = !!DATOS;

/* --- Lógica pura reimplementada para el modo estático --- */
function _haversineKm(a, b) {
  const R = 6371, rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function _normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function _resolverLugar(texto) {
  const t = _normalizar(texto);
  if (!t || !DATOS) return null;
  for (const [clave, c] of Object.entries(DATOS.referencias)) {
    if (t.includes(_normalizar(clave))) return { ...c, referencia: clave };
  }
  return null;
}
function _cop(v) {
  const e = Math.round(Number(v) || 0);
  return `${e < 0 ? '-' : ''}$ ${Math.abs(e).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
function _numero(tipo, n) {
  const p = { pedido: 'P', reserva: 'R', agendamiento: 'A' }[tipo] || 'S';
  return `#${p}-${String(n).padStart(6, '0')}`;
}
// Verificación del sello con SubtleCrypto: el MISMO algoritmo que el servidor.
function _serializarCanonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(_serializarCanonico).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${_serializarCanonico(v[k])}`).join(',')}}`;
}
async function _sha256(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function _verificarCadenaEstatico() {
  const GEN = '0'.repeat(64);
  let anterior = GEN;
  for (const s of DATOS.sellos) {
    if (s.hashAnterior !== anterior) return { valida: false, motivo: `El sello ${s.codigo} no engancha con el anterior.` };
    const { hash, hashAnterior, ...contenido } = s;
    if ((await _sha256(hashAnterior + _serializarCanonico(contenido))) !== hash)
      return { valida: false, motivo: `El contenido del sello ${s.codigo} fue alterado.` };
    anterior = s.hash;
  }
  return { valida: true, longitud: DATOS.sellos.length };
}
const _solicitudesEstatico = [];
let _consecutivo = 1000;

/* --- Enrutador: mismas firmas en los dos modos --- */
const API = {
  async estado() {
    if (ESTATICO) return { estatico: true, origen_datos: 'estático (navegador)', llave_configurada: false };
    return (await fetch('/api/estado')).json();
  },

  async catalogo(params) {
    if (!ESTATICO) {
      const q = new URLSearchParams();
      if (params.sector) q.set('sector', params.sector);
      if (params.tipo) q.set('tipo', params.tipo);
      if (params.categoria) q.set('categoria', params.categoria);
      if (params.q) q.set('q', params.q);
      return (await (await fetch(`/api/catalogo?${q}`)).json()).items || [];
    }
    const b = _normalizar(params.q);
    return DATOS.items.filter((i) =>
      i.activo &&
      (!params.sector || i.sector === params.sector) &&
      (!params.tipo || i.tipo === params.tipo) &&
      (!params.categoria || i.categoria === params.categoria) &&
      (!b || _normalizar(`${i.nombre} ${i.descripcion} ${i.categoria}`).includes(b)));
  },

  async crearSolicitud(cuerpo) {
    if (!ESTATICO) {
      const r = await fetch('/api/solicitudes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      return { ok: r.ok, datos: await r.json() };
    }
    return { ok: true, datos: _crearSolicitudLocal(cuerpo) };
  },

  async misSolicitudes(telefono) {
    if (!ESTATICO) return (await (await fetch(`/api/solicitudes?telefono=${telefono}`)).json()).solicitudes || [];
    return _solicitudesEstatico.filter((s) => s.telefono === telefono).reverse();
  },

  async verificarSello(codigo) {
    if (!ESTATICO) return (await fetch(`/api/sello/${encodeURIComponent(codigo)}`)).json();
    const sello = DATOS.sellos.find((s) => s.codigo === codigo.toUpperCase());
    if (!sello) return { valido: false, motivo: 'No existe ningún Sello Llanero con ese código.' };
    const cadena = await _verificarCadenaEstatico();
    return {
      valido: cadena.valida, codigo: sello.codigo, producto: sello.producto, negocio: sello.negocio,
      municipio: sello.municipio, departamento: sello.departamento, origen: sello.origen,
      tecnica: sello.tecnica, materiales: sello.materiales, sostenibilidad: sello.sostenibilidad,
      emitidoEn: sello.emitidoEn, hash: sello.hash,
      integridadCadena: cadena.valida ? 'intacta' : cadena.motivo, sellosEnCadena: DATOS.sellos.length,
    };
  },

  async negocios(sector) {
    if (!ESTATICO) {
      const q = sector ? `?sector=${sector}` : '';
      return (await (await fetch(`/api/negocios${q}`)).json()).negocios || [];
    }
    return DATOS.negocios.filter((n) => !sector || n.sector === sector);
  },

  // Un negocio con sus ítems: la hoja del negocio.
  async negocio(id) {
    if (!ESTATICO) return (await fetch(`/api/negocio/${encodeURIComponent(id)}`)).json();
    const negocio = DATOS.negocios.find((n) => n.id === id);
    if (!negocio) return { error: 'Negocio no encontrado' };
    const items = DATOS.items
      .filter((i) => i.negocioId === id && i.activo !== false)
      .map((i) => ({ ...i, precio: i.precioCop == null ? 'A convenir' : _cop(i.precioCop) }));
    return { negocio, items };
  },

  async taxonomia() {
    if (!ESTATICO) return (await fetch('/api/taxonomia')).json();
    return { municipios: DATOS.municipios || {}, sectores: DATOS.categorias || {}, mapa: DATOS.mapa };
  },
};

function _crearSolicitudLocal(c) {
  const item = DATOS.items.find((i) => i.id === c.itemId);
  if (!item) return { error: 'Ese ítem no existe.' };
  const telefono = String(c.telefono || '').replace(/\D/g, '');
  if (!c.cliente) return { error: 'Falta tu nombre.' };
  if (!/^\d{7,12}$/.test(telefono)) return { error: 'Falta un teléfono válido (solo dígitos).' };

  const tipo = item.flujo;
  const cantidad = Math.max(1, Math.round(Number(c.cantidad) || 1));
  const avisos = [];
  const negocio = DATOS.negocios.find((n) => n.id === item.negocioId);

  const evaluar = (lugar) => {
    const destino = _resolverLugar(lugar);
    if (!destino) return { error: 'No reconozco ese lugar. Indica el barrio, vereda o municipio.' };
    const dist = Math.round(_haversineKm(negocio.ubicacion, destino) * 100) / 100;
    return { dist, dentro: dist <= (negocio.radioCoberturaKm || 0) };
  };

  if (tipo === 'pedido' && c.entrega !== 'recoger') {
    if (!c.lugar) return { error: 'Falta tu dirección para el envío (barrio o municipio).' };
    const e = evaluar(c.lugar);
    if (e.error) return e;
    if (!e.dentro) avisos.push(`Queda a ${e.dist} km y el radio de entrega es ${negocio.radioCoberturaKm} km: se recoge en el punto o se coordina envío.`);
  }
  if (tipo === 'reserva') {
    if (!c.fechaInicio) return { error: 'Falta la fecha de inicio.' };
    if (item.categoria === 'alojamiento' && !c.fechaFin) return { error: 'Falta la fecha de salida.' };
  }
  if (tipo === 'agendamiento') {
    if (!c.fecha) return { error: 'Falta la fecha deseada.' };
    if (item.modalidad === 'a_domicilio') {
      if (!c.lugarServicio) return { error: 'Falta el lugar del servicio (finca, vereda o municipio).' };
      const e = evaluar(c.lugarServicio);
      if (!e.error && !e.dentro) avisos.push(`El lugar queda a ${e.dist} km y el radio es ${negocio.radioCoberturaKm} km: la visita queda sujeta a coordinación.`);
    }
  }

  // Entrega para comercio: enviar a la dirección del cliente o recoger en el local.
  if (tipo === 'pedido' && c.entrega === 'domicilio' && !c.lugar) {
    return { error: 'Para envío a domicilio indica tu dirección (barrio o municipio).' };
  }

  const numero = ++_consecutivo;
  const total = item.precioCop == null ? null : item.precioCop * cantidad;
  const referencia = `CIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const montoTxt = total == null ? 'A convenir con el negocio' : _cop(total);
  const sol = {
    id: `sol_${numero}`, numero, tipo, itemId: item.id, itemNombre: item.nombre,
    negocioNombre: item.negocioNombre, cantidad, totalCop: total, cliente: c.cliente,
    telefono, entrega: c.entrega || null, direccion: c.lugar || null,
    estado: { pedido: 'creado', reserva: 'solicitada', agendamiento: 'solicitado' }[tipo],
    referenciaPago: referencia, creadoEn: new Date().toISOString(),
  };
  _solicitudesEstatico.push(sol);

  return {
    solicitud: { ...sol, numeroLegible: _numero(tipo, numero), total: montoTxt, codigoSello: item.codigoSello },
    pago: {
      metodo: 'Bre-B', llave: DATOS.config.llave, titular: DATOS.config.titular, qr_url: DATOS.config.qr,
      monto: montoTxt, montoCop: total, referencia, whatsappSoporte: null,
      contraentrega: (DATOS.negocios.find((n) => n.id === item.negocioId)?.pago?.contraentrega) || false,
    },
    avisos,
  };
}

/* ================================================================ */
/* Estado                                                           */
/* ================================================================ */

const estado = {
  sector: '',
  tipo: '',
  categoria: '',
  busqueda: '',
  items: [],
  negocios: [],
  vista: 'explorar',
  historial: [],
  chatOcupado: false,
};

const EMOJI_SECTOR = { comercio: '🧺', turismo: '🌄', agro: '🐂' };

const EMOJI_CATEGORIA = {
  artesania: '🧵', gastronomia: '🍖', viveres: '🧀',
  alojamiento: '🛏️', planes: '🌄', pasadias: '🏞️', consumibles: '🧺',
  insumos: '🌱', veterinaria: '🐕', genetica: '🐄', servicios_campo: '🚁',
};

const LABEL_CANTIDAD = {
  unidad: 'Cantidad', porcion: 'Porciones', libra: 'Libras', kg: 'Kilos',
  bulto: 'Bultos', litro: 'Litros', persona: 'Personas', noche: 'Noches',
  hectarea: 'Hectáreas', animal: 'Animales', visita: 'Visitas', servicio: 'Servicios',
};

const NOMBRE_FLUJO = { pedido: 'Pedido', reserva: 'Reserva', agendamiento: 'Agendar' };

/* ================================================================ */
/* Navegación entre vistas                                          */
/* ================================================================ */

function irA(vista) {
  estado.vista = vista;
  document.querySelectorAll('.vista').forEach((v) => v.classList.remove('activa'));
  $(`vista-${vista}`).classList.add('activa');

  document.querySelectorAll('.nav-boton, .nav-movil button').forEach((b) => {
    b.classList.toggle('activo', b.dataset.vista === vista);
  });
  $('flotante').style.display = vista === 'asistente' ? 'none' : '';
  if (vista === 'asistente') $('mensaje').focus();
  if (vista === 'mapa') iniciarMapa();
  if (vista === 'admin') cargarAdmin();
}

document.querySelectorAll('[data-vista]').forEach((b) => {
  b.addEventListener('click', () => irA(b.dataset.vista));
});

/* ================================================================ */
/* Catálogo                                                         */
/* ================================================================ */

async function cargarCatalogo() {
  try {
    estado.items = await API.catalogo({
      sector: estado.sector || undefined,
      tipo: estado.tipo || undefined,
      categoria: estado.categoria || undefined,
      q: estado.busqueda || undefined,
    });
  } catch {
    estado.items = [];
  }
  pintarRejilla();
}

// Llena el selector de categorías con las categorías presentes en el sector activo.
async function poblarCategorias() {
  const sel = $('filtro-categoria');
  const items = await API.catalogo({ sector: estado.sector || undefined });
  const cats = [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las categorías</option>';
  for (const c of cats) {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  }
  estado.categoria = '';
}

function pintarRejilla() {
  const rejilla = $('rejilla');
  rejilla.innerHTML = '';

  if (!estado.items.length) {
    rejilla.innerHTML = '<div class="nada">No hay resultados. Prueba otra búsqueda o pregúntale al asistente.</div>';
    return;
  }

  for (const item of estado.items) {
    const t = document.createElement('button');
    t.className = 'tarjeta';
    t.innerHTML = `
      <div class="portada ${item.sector}">
        ${EMOJI_CATEGORIA[item.categoria] || '🌾'}
        ${item.codigoSello ? '<span class="insignia-sello">🛡 Sello</span>' : ''}
      </div>
      <div class="cuerpo">
        <h3></h3>
        <div class="quien"></div>
        <div class="pie">
          <span class="precio">${item.precio} <small>/ ${item.unidad}</small></span>
          <span class="etiqueta-flujo ${item.flujo}">${NOMBRE_FLUJO[item.flujo]}</span>
        </div>
      </div>`;
    t.querySelector('h3').textContent = item.nombre;
    t.querySelector('.quien').textContent = `${item.negocioNombre} · ${item.municipio}`;
    t.addEventListener('click', () => abrirModal(item));
    rejilla.appendChild(t);
  }
}

/* ================================================================ */
/* Vitrina de NEGOCIOS + hoja del negocio                           */
/* ================================================================ */

async function cargarNegocios() {
  let negs = [];
  try {
    negs = await API.negocios(estado.sector || undefined);
  } catch { negs = []; }

  const b = _normalizar(estado.busqueda);
  estado.negocios = negs.filter((n) =>
    (!estado.categoria || n.categoria === estado.categoria) &&
    (!b || _normalizar(`${n.nombre} ${n.categoria} ${n.municipio} ${n.descripcion || ''}`).includes(b)));
  pintarNegocios();
}

function pintarNegocios() {
  const rejilla = $('rejilla');
  rejilla.innerHTML = '';
  if (!estado.negocios.length) {
    rejilla.innerHTML = '<div class="nada">No hay negocios con ese filtro. Prueba otra búsqueda o el asistente.</div>';
    return;
  }
  for (const n of estado.negocios) {
    const t = document.createElement('button');
    t.className = 'tarjeta tarjeta-negocio';
    const portada = n.imagenUrl
      ? `<div class="portada-img" style="background-image:url('${n.imagenUrl.replace(/'/g, "%27")}')">
           <span class="chip-sector">${EMOJI_SECTOR[n.sector] || ''}</span>
         </div>`
      : `<div class="portada ${n.sector}">${EMOJI_SECTOR[n.sector] || '🏪'}</div>`;
    t.innerHTML = `
      ${portada}
      <div class="cuerpo">
        <h3></h3>
        <div class="quien"></div>
        <div class="pie">
          <span class="categoria-pill"></span>
          ${n.rating ? `<span class="rating">★ ${n.rating}</span>` : ''}
        </div>
      </div>`;
    t.querySelector('h3').textContent = n.nombre;
    t.querySelector('.quien').textContent = n.municipio + (n.direccion ? ` · ${n.direccion.split(',')[0]}` : '');
    t.querySelector('.categoria-pill').textContent = n.categoria || n.sector;
    t.addEventListener('click', () => abrirNegocio(n.id));
    rejilla.appendChild(t);
  }
}

const NOMBRE_ACCION = { pedido: 'Pedir', reserva: 'Reservar', agendamiento: 'Agendar' };

async function abrirNegocio(id) {
  const modal = $('modal');
  modal.innerHTML = '<p class="texto-tenue" style="padding:20px">Cargando el negocio...</p>';
  $('velo').hidden = false;

  const { negocio: n, items, error } = await API.negocio(id);
  if (error || !n) {
    modal.innerHTML = `<div class="encabezado"><h3>No se pudo abrir</h3><button class="cerrar">✕</button></div>`;
    modal.querySelector('.cerrar').addEventListener('click', cerrarModal);
    return;
  }

  const badges = [];
  if (n.entrega?.domicilio) badges.push('🛵 Domicilio');
  if (n.entrega?.recoger) badges.push('🏬 Recoger en el local');
  if (n.pago?.breb) badges.push('📲 Pago Bre-B');
  if (n.pago?.contraentrega) badges.push('💵 Contra entrega');

  const portada = n.imagenUrl
    ? `<div class="hoja-portada" style="background-image:url('${n.imagenUrl.replace(/'/g, "%27")}')"></div>`
    : `<div class="hoja-portada sinimg ${n.sector}">${EMOJI_SECTOR[n.sector] || '🏪'}</div>`;

  const filasItems = items.length
    ? items.map((it) => `
        <div class="hoja-item" data-item="${it.id}">
          <div class="hoja-item-info">
            <div class="hoja-item-nombre"></div>
            <div class="hoja-item-desc"></div>
          </div>
          <div class="hoja-item-accion">
            <span class="hoja-precio">${it.precio}${it.precioCop != null ? ` <small>/ ${it.unidad}</small>` : ''}</span>
            <button class="boton-mini" data-item="${it.id}">${NOMBRE_ACCION[it.flujo] || 'Solicitar'}</button>
          </div>
        </div>`).join('')
    : '<p class="texto-tenue">Este negocio aún no tiene productos o servicios publicados.</p>';

  modal.innerHTML = `
    <button class="cerrar cerrar-flotante" aria-label="Cerrar">✕</button>
    ${portada}
    <div class="hoja-cuerpo">
      <div class="hoja-cabecera">
        <h3></h3>
        ${n.rating ? `<span class="rating grande">★ ${n.rating}</span>` : ''}
      </div>
      <div class="hoja-meta">
        <span class="categoria-pill"></span>
        <span class="hoja-muni">📍 <span class="muni-txt"></span></span>
      </div>
      <p class="hoja-desc"></p>
      <div class="hoja-datos"></div>
      ${badges.length ? `<div class="hoja-badges">${badges.map((b) => `<span>${b}</span>`).join('')}</div>` : ''}
      <h4 class="hoja-titulo-items">${n.sector === 'turismo' ? 'Disponibilidad' : n.sector === 'agro' ? 'Servicios e insumos' : 'Productos y servicios'}</h4>
      <div class="hoja-items">${filasItems}</div>
    </div>`;

  modal.querySelector('h3').textContent = n.nombre;
  modal.querySelector('.categoria-pill').textContent = n.categoria || n.sector;
  modal.querySelector('.muni-txt').textContent = `${n.municipio}, Casanare` + (n.direccion ? ` · ${n.direccion}` : '');
  modal.querySelector('.hoja-desc').textContent = n.descripcion || '';
  const datos = [];
  if (n.telefono) datos.push(`📞 ${n.telefono}`);
  if (n.sitioWeb) datos.push(`🌐 ${n.sitioWeb}`);
  if (n.habitaciones) datos.push(`🛏️ ${n.habitaciones} habitaciones`);
  modal.querySelector('.hoja-datos').textContent = datos.join('   ');
  items.forEach((it, k) => {
    const fila = modal.querySelectorAll('.hoja-item')[k];
    if (!fila) return;
    fila.querySelector('.hoja-item-nombre').textContent = it.nombre;
    fila.querySelector('.hoja-item-desc').textContent = it.descripcion || '';
  });

  modal.querySelector('.cerrar').addEventListener('click', cerrarModal);
  modal.querySelectorAll('.boton-mini').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = items.find((x) => x.id === btn.dataset.item);
      if (it) abrirModal(it, n);
    });
  });
}

// filtros
document.querySelectorAll('.sector').forEach((b) => {
  b.addEventListener('click', async () => {
    document.querySelector('.sector.activo')?.classList.remove('activo');
    b.classList.add('activo');
    estado.sector = b.dataset.sector;
    estado.categoria = '';
    await poblarCategorias();
    cargarNegocios();
  });
});

$('filtro-categoria').addEventListener('change', (e) => {
  estado.categoria = e.target.value;
  cargarNegocios();
});

document.querySelectorAll('#chips-tipo .chip').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelector('#chips-tipo .chip.activo')?.classList.remove('activo');
    b.classList.add('activo');
    estado.tipo = b.dataset.tipo;
    cargarNegocios();
  });
});

let temporizadorBusqueda;
$('buscar').addEventListener('input', (e) => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => {
    estado.busqueda = e.target.value.trim();
    cargarNegocios();
  }, 250);
});

/* ================================================================ */
/* Modal de ítem: detalle + formulario por flujo + pago             */
/* ================================================================ */

function cerrarModal() {
  $('velo').hidden = true;
  $('modal').innerHTML = '';
}
$('velo').addEventListener('click', (e) => {
  if (e.target === $('velo')) cerrarModal();
});

function campo(id, etiqueta, tipo = 'text', extra = '') {
  return `<div class="campo"><label for="${id}">${etiqueta}</label>
    <input id="${id}" type="${tipo}" ${extra} /></div>`;
}

function formularioPara(item, negocio) {
  const etiquetaCantidad = LABEL_CANTIDAD[item.unidad] || 'Cantidad';
  const comunes =
    campo('f-nombre', 'Tu nombre') +
    campo('f-telefono', 'Teléfono (para seguimiento)', 'tel', 'inputmode="numeric"');

  if (item.flujo === 'pedido') {
    const esComercio = (negocio?.sector || item.sector) === 'comercio';
    const entrega = esComercio
      ? `<div class="campo"><label>¿Cómo lo quieres recibir?</label>
           <div class="entrega-opciones">
             <label class="radio"><input type="radio" name="entrega" value="recoger" checked/> Recoger en el local</label>
             <label class="radio"><input type="radio" name="entrega" value="domicilio"/> Enviar a mi dirección</label>
           </div></div>
         <div class="campo" id="campo-direccion" hidden>${campo('f-lugar', 'Tu dirección (barrio o municipio)')}</div>`
      : `<div class="campo">${campo('f-lugar', 'Barrio o municipio de entrega')}</div>`;
    return (
      campo('f-cantidad', etiquetaCantidad, 'number', 'min="1" value="1"') +
      entrega +
      comunes
    );
  }
  if (item.flujo === 'reserva') {
    const fechas =
      item.categoria === 'alojamiento'
        ? `<div class="dos-columnas">${campo('f-inicio', 'Llegada', 'date')}${campo('f-fin', 'Salida', 'date')}</div>` +
          `<div class="dos-columnas">${campo('f-cantidad', etiquetaCantidad, 'number', 'min="1" value="1"')}${campo('f-personas', 'Personas', 'number', 'min="1" value="2"')}</div>`
        : `<div class="dos-columnas">${campo('f-inicio', 'Fecha', 'date')}${campo('f-cantidad', etiquetaCantidad, 'number', 'min="1" value="2"')}</div>`;
    return fechas + comunes;
  }
  // agendamiento
  const lugar =
    item.modalidad === 'a_domicilio' ? campo('f-lugar-servicio', 'Finca, vereda o municipio') : '';
  return (
    `<div class="dos-columnas">${campo('f-fecha', 'Fecha deseada', 'date')}${campo('f-cantidad', etiquetaCantidad, 'number', 'min="1" value="1"')}</div>` +
    lugar +
    comunes
  );
}

function abrirModal(item, negocio) {
  const modal = $('modal');
  const precioUnidad = item.precioCop != null ? ` <small>/ ${item.unidad}</small>` : '';
  modal.innerHTML = `
    <div class="encabezado">
      <div>
        <h3></h3>
        <div class="quien"></div>
      </div>
      <button class="cerrar" aria-label="Cerrar">✕</button>
    </div>
    <p class="descripcion"></p>
    ${item.codigoSello ? `<div class="dato-sello">🛡 Sello Llanero <b>${item.codigoSello}</b> · autenticidad verificable en la pestaña Sello</div>` : ''}
    <div class="precio-grande">${item.precio || 'A convenir'}${precioUnidad}${item.modalidad === 'a_domicilio' ? ' · a domicilio' : ''}${item.modalidad === 'en_sitio' ? ' · en el sitio' : ''}</div>
    <form class="formulario-flujo" id="form-flujo">
      ${formularioPara(item, negocio)}
      <div class="error-form" id="error-flujo"></div>
      <button class="boton-principal" type="submit">
        ${item.flujo === 'pedido' ? 'Pedir y ver el pago' : item.flujo === 'reserva' ? 'Reservar y ver el pago' : 'Agendar y ver el pago'}
      </button>
    </form>`;

  modal.querySelector('h3').textContent = item.nombre;
  modal.querySelector('.quien').textContent =
    `${item.negocioNombre} · ${item.municipio} · ${item.tipo === 'producto' ? 'Producto' : 'Servicio'}`;
  modal.querySelector('.descripcion').textContent = item.descripcion || '';
  // Cerrar vuelve a la hoja del negocio si venimos de ella.
  modal.querySelector('.cerrar').addEventListener('click', () =>
    negocio ? abrirNegocio(negocio.id) : cerrarModal());

  // Entrega a domicilio: muestra el campo de dirección solo si se elige envío.
  const radios = modal.querySelectorAll('input[name="entrega"]');
  radios.forEach((r) => r.addEventListener('change', () => {
    const dir = modal.querySelector('#campo-direccion');
    if (dir) dir.hidden = modal.querySelector('input[name="entrega"]:checked')?.value !== 'domicilio';
  }));

  modal.querySelector('#form-flujo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => modal.querySelector(`#${id}`)?.value?.trim();
    const boton = modal.querySelector('.boton-principal');
    boton.disabled = true;
    $('error-flujo').textContent = '';

    const entrega = modal.querySelector('input[name="entrega"]:checked')?.value;
    const cuerpo = {
      itemId: item.id,
      cantidad: Number(v('f-cantidad') || 1),
      cliente: v('f-nombre'),
      telefono: (v('f-telefono') || '').replace(/\D/g, ''),
      entrega,
      lugar: v('f-lugar'),
      fechaInicio: v('f-inicio'),
      fechaFin: v('f-fin'),
      personas: v('f-personas') ? Number(v('f-personas')) : undefined,
      fecha: v('f-fecha'),
      lugarServicio: v('f-lugar-servicio'),
    };

    try {
      const { ok, datos } = await API.crearSolicitud(cuerpo);
      if (!ok || datos.error) {
        $('error-flujo').textContent = datos.error + (datos.sugerencia ? ` ${datos.sugerencia}` : '');
        boton.disabled = false;
        return;
      }
      mostrarPago(datos);
    } catch (err) {
      $('error-flujo').textContent = `No se pudo crear la solicitud: ${err.message}`;
      boton.disabled = false;
    }
  });

  $('velo').hidden = false;
}

function mostrarPago({ solicitud, pago, avisos }) {
  const modal = $('modal');
  const textoWa = encodeURIComponent(
    `Hola, hice la solicitud ${solicitud.numeroLegible} (${solicitud.itemNombre}). ` +
      `Transferí ${pago.monto} por Bre-B con la referencia ${pago.referencia}. Adjunto comprobante.`,
  );
  modal.innerHTML = `
    <div class="encabezado">
      <div><h3>¡Listo! Ahora el pago</h3></div>
      <button class="cerrar" aria-label="Cerrar">✕</button>
    </div>
    <div class="pago-exitoso">
      <div class="numero">Solicitud <b>${solicitud.numeroLegible}</b> · ${solicitud.itemNombre}</div>
      <div class="total">${pago.monto}</div>
      <img src="${pago.qr_url}" alt="QR Bre-B"
           onerror="this.outerHTML='<div class=&quot;sin-qr&quot;>El QR de Bre-B aún no está cargado.</div>'" />
      <div class="texto-tenue" style="margin:6px 0 2px">Escanea este QR para pagar por Bre-B</div>
      <div>Referencia obligatoria:</div>
      <div class="referencia">${pago.referencia}</div>
      <div class="texto-tenue">Escanea desde Nequi, Bancolombia o tu banco. Escribe la referencia en el mensaje de la transferencia.</div>
      ${(avisos || []).map((a) => `<div class="aviso">⚠ ${a}</div>`).join('')}
      ${pago.whatsappSoporte ? `<a class="enlace-wa" target="_blank" href="${pago.whatsappSoporte}?text=${textoWa}">📱 Enviar comprobante por WhatsApp</a>` : ''}
    </div>`;
  modal.querySelector('.cerrar').addEventListener('click', cerrarModal);
}

/* ================================================================ */
/* Asistente (agente de IA)                                         */
/* ================================================================ */

const SUGERENCIAS = [
  'Busco artesanía llanera auténtica',
  'Quiero un plan de turismo para el fin de semana',
  'Necesito fumigar 15 hectáreas en mi finca',
  'Soy productor y quiero vender en la plataforma',
];

const ETIQUETAS_HERRAMIENTA = {
  consultar_catalogo: 'Consultó el catálogo real',
  registrar_negocio: 'Registró el negocio',
  publicar_item: 'Publicó el ítem y redactó su descripción',
  evaluar_cobertura: 'Calculó la cobertura con Haversine',
  crear_solicitud: 'Creó la solicitud (pedido, reserva o agendamiento)',
  generar_pago_breb: 'Generó el pago Bre-B',
  certificar_origen: 'Emitió el Sello Llanero en la cadena de hashes',
  verificar_sello: 'Verificó la firma criptográfica del sello',
  generar_contenido_promo: 'Empaquetó el contenido para redes',
};

function burbuja(texto, clase) {
  const div = document.createElement('div');
  div.className = `burbuja ${clase}`;
  div.textContent = texto;
  $('chat').appendChild(div);
  $('chat').scrollTop = $('chat').scrollHeight;
  return div;
}

function pintarSugerencias() {
  const caja = $('sugerencias');
  caja.innerHTML = '';
  for (const texto of SUGERENCIAS) {
    const b = document.createElement('button');
    b.className = 'sugerencia';
    b.type = 'button';
    b.textContent = texto;
    b.onclick = () => {
      $('mensaje').value = texto;
      $('formulario-chat').requestSubmit();
    };
    caja.appendChild(b);
  }
}

function pintarTraza(pasos) {
  if (!pasos?.length) return;
  const traza = $('traza');
  traza.querySelector('.vacia')?.remove();
  for (const paso of pasos) {
    const li = document.createElement('li');
    if (!paso.exito) li.classList.add('fallo');
    const argumentos = Object.entries(paso.entrada || {})
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
    li.innerHTML = `<span class="nombre">${paso.herramienta}</span>
      <div class="args"></div>`;
    li.querySelector('.args').textContent =
      (ETIQUETAS_HERRAMIENTA[paso.herramienta] || 'Ejecutó una herramienta') +
      (argumentos ? ` — ${argumentos}` : '');
    traza.appendChild(li);
  }
  traza.scrollTop = traza.scrollHeight;
}

// Base del backend del agente: mismo origen con servidor; la URL de Render (si
// está configurada en datos.js) cuando la web es estática en GitHub Pages.
const AGENTE_BASE = ESTATICO ? ((DATOS.config && DATOS.config.apiBase) || '') : '';
const AGENTE_DISPONIBLE = !ESTATICO || !!AGENTE_BASE;

async function enviarAlAgente(texto) {
  if (estado.chatOcupado || !texto.trim()) return;

  // Sin backend (Pages sin apiBase): el agente en vivo corre en localhost o Render.
  if (!AGENTE_DISPONIBLE) {
    burbuja(texto, 'persona');
    $('sugerencias').innerHTML = '';
    burbuja(
      'Estás viendo la versión pública (GitHub Pages), donde el catálogo, el mapa, los pedidos, ' +
        'las reservas, los agendamientos y la verificación de sello funcionan de verdad.\n\n' +
        'El asistente de IA en vivo necesita un servidor con la llave del modelo (que por seguridad ' +
        'nunca va en una página pública). Está a un paso: cuando el backend esté desplegado en Render, ' +
        'este mismo chat responde aquí. Mientras tanto corre "npm start" y entra a localhost.',
      'agente',
    );
    return;
  }

  estado.chatOcupado = true;
  $('enviar').disabled = true;
  $('mensaje').value = '';
  $('sugerencias').innerHTML = '';

  burbuja(texto, 'persona');
  const esperando = burbuja('CIMARRÓN está trabajando...', 'agente pensando');
  estado.historial.push({ role: 'user', content: texto });

  try {
    const r = await fetch(`${AGENTE_BASE}/api/agente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensajes: estado.historial }),
    });
    const datos = await r.json();
    esperando.remove();
    if (!r.ok) throw new Error(datos.error || 'Error del servidor');

    estado.historial = datos.mensajes;
    pintarTraza(datos.traza);
    burbuja(datos.respuesta, 'agente');
    cargarNegocios(); // si el agente publicó o vendió algo, la vitrina se refresca
  } catch (e) {
    esperando.remove();
    burbuja(`No pude responder: ${e.message}`, 'agente fallo');
    estado.historial.pop();
  } finally {
    estado.chatOcupado = false;
    $('enviar').disabled = false;
    $('mensaje').focus();
  }
}

$('formulario-chat').addEventListener('submit', (e) => {
  e.preventDefault();
  enviarAlAgente($('mensaje').value);
});

/* ================================================================ */
/* Mapa de Casanare (Leaflet + OpenStreetMap)                       */
/* ================================================================ */

let mapa = null;
let capaMarcadores = null;
let negociosMapa = [];
let mapaListo = false;

const COLOR_SECTOR = { comercio: 'comercio', turismo: 'turismo', agro: 'agro' };

function iconoNegocio(sector) {
  return L.divIcon({
    className: '',
    html: `<div class="marcador-punto marcador-${COLOR_SECTOR[sector] || 'comercio'}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
    popupAnchor: [0, -16],
  });
}

async function iniciarMapa() {
  if (typeof L === 'undefined') return; // Leaflet no cargó (sin conexión al CDN)
  if (!mapa) {
    const tax = await API.taxonomia();
    const centro = tax.mapa?.centro || { lat: 5.35, lng: -71.9 };
    mapa = L.map('mapa', { scrollWheelZoom: true }).setView([centro.lat, centro.lng], tax.mapa?.zoom || 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap',
    }).addTo(mapa);
    // Agrupa los pines cercanos (cluster) si el plugin cargó; si no, capa simple.
    capaMarcadores = (typeof L.markerClusterGroup === 'function')
      ? L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false })
      : L.layerGroup();
    capaMarcadores.addTo(mapa);

    // llenar el filtro de municipios
    const sel = $('mapa-municipio');
    for (const nombre of Object.keys(tax.municipios || {})) {
      const o = document.createElement('option');
      o.value = nombre; o.textContent = nombre;
      sel.appendChild(o);
    }
    $('mapa-sector').addEventListener('change', pintarMarcadores);
    $('mapa-municipio').addEventListener('change', pintarMarcadores);
    mapaListo = true;
  }
  // Leaflet necesita recalcular tamaño al mostrarse dentro de una vista oculta
  setTimeout(() => mapa.invalidateSize(), 60);
  await cargarNegociosMapa();
}

async function cargarNegociosMapa() {
  negociosMapa = await API.negocios();
  pintarMarcadores();
}

function pintarMarcadores() {
  if (!mapaListo) return;
  const sector = $('mapa-sector').value;
  const municipio = $('mapa-municipio').value;
  capaMarcadores.clearLayers();
  let n = 0;
  for (const neg of negociosMapa) {
    if (sector && neg.sector !== sector) continue;
    if (municipio && neg.municipio !== municipio) continue;
    if (!neg.ubicacion) continue;
    const m = L.marker([neg.ubicacion.lat, neg.ubicacion.lng], { icon: iconoNegocio(neg.sector) });
    const emoji = { comercio: '🧺', turismo: '🌄', agro: '🐂' }[neg.sector] || '';
    const popup = L.DomUtil.create('div', 'popup-negocio');
    popup.innerHTML =
      `<b>${neg.nombre}</b><br>` +
      `<span class="sec">${emoji} ${neg.sector}${neg.categoria ? ' · ' + neg.categoria : ''} · ${neg.municipio}</span>` +
      (neg.direccion ? `<br>${neg.direccion}` : '') +
      `<br><button class="popup-ver" type="button">Ver negocio</button>`;
    popup.querySelector('.popup-ver').addEventListener('click', () => {
      if (mapa) mapa.closePopup();
      irA('explorar');        // sale del mapa y muestra la hoja a pantalla completa
      abrirNegocio(neg.id);
    });
    m.bindPopup(popup);
    m.addTo(capaMarcadores);
    n++;
  }
  $('mapa-conteo').textContent = `${n} negocio${n === 1 ? '' : 's'} en el mapa` +
    (sector ? ` · sector ${sector}` : '') + (municipio ? ` · ${municipio}` : '');
}

/* ================================================================ */
/* Verificador de sello                                             */
/* ================================================================ */

$('formulario-sello').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('codigo-sello').value.trim().toUpperCase();
  if (!codigo) return;
  const caja = $('resultado-sello');
  caja.innerHTML = '<p class="texto-tenue">Recalculando la cadena...</p>';

  const r = await API.verificarSello(codigo);

  if (!r.valido && r.motivo) {
    caja.innerHTML = `<div class="resultado-sello invalido">
      <div class="veredicto">✕ No verificado</div><div>${r.motivo}</div></div>`;
    return;
  }

  const filas = [
    ['Producto', r.producto], ['Negocio', r.negocio],
    ['Origen', r.origen], ['Técnica', r.tecnica],
    ['Materiales', r.materiales], ['Sostenibilidad', r.sostenibilidad],
    ['Municipio', `${r.municipio}, ${r.departamento}`],
    ['Cadena', `${r.sellosEnCadena} sellos · ${r.integridadCadena}`],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${k}</dt><dd></dd>`) // los valores van con textContent abajo
    .join('');

  caja.innerHTML = `<div class="resultado-sello ${r.valido ? 'valido' : 'invalido'}">
    <div class="veredicto">${r.valido ? `✓ Auténtico · ${r.codigo}` : '✕ La cadena está rota'}</div>
    <dl>${filas}</dl>
    <div class="hash">SHA-256: ${r.hash}</div>
  </div>`;

  const valores = [
    r.producto, r.negocio, r.origen, r.tecnica, r.materiales, r.sostenibilidad,
    `${r.municipio}, ${r.departamento}`, `${r.sellosEnCadena} sellos · ${r.integridadCadena}`,
  ].filter(Boolean);
  caja.querySelectorAll('dd').forEach((dd, i) => (dd.textContent = valores[i]));
});

/* ================================================================ */
/* Mis solicitudes                                                  */
/* ================================================================ */

$('formulario-solicitudes').addEventListener('submit', async (e) => {
  e.preventDefault();
  const telefono = $('telefono-consulta').value.replace(/\D/g, '');
  if (!telefono) return;
  const caja = $('lista-solicitudes');
  caja.innerHTML = '<p class="texto-tenue">Buscando...</p>';

  const lista = await API.misSolicitudes(telefono);
  if (!lista.length) {
    caja.innerHTML = '<p class="texto-tenue">No hay solicitudes con ese teléfono.</p>';
    return;
  }

  const ETIQ = {
    creado: 'Creado', solicitada: 'Solicitada', solicitado: 'Solicitado',
    confirmado: 'Confirmado', confirmada: 'Confirmada',
  };
  caja.innerHTML = '';
  for (const s of lista) {
    const numeroLegible = s.numeroLegible || _numero(s.tipo, s.numero);
    const total = s.total || _cop(s.totalCop);
    const estadoTxt = s.estadoEtiqueta || ETIQ[s.estado] || s.estado;
    const div = document.createElement('div');
    div.className = 'item-solicitud';
    div.innerHTML = `
      <div>
        <b>${numeroLegible}</b> · <span class="nom"></span>
        <div class="detalle">${total} · ref ${s.referenciaPago ?? 'sin pago'}</div>
      </div>
      <span class="estado-pill">${estadoTxt}</span>`;
    div.querySelector('.nom').textContent = s.itemNombre ?? s.tipo;
    caja.appendChild(div);
  }
});

/* ================================================================ */
/* Cuentas: registro, login, sesión y panel de admin               */
/* ================================================================ */

const SESION_KEY = 'cimarron_sesion';
let sesionActual = null;
try { sesionActual = JSON.parse(localStorage.getItem(SESION_KEY) || 'null'); } catch { sesionActual = null; }

async function apiCuenta(ruta, cuerpo, metodo = 'POST') {
  if (ESTATICO) return { error: 'estatico' };
  const opt = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  if (sesionActual) opt.headers['x-usuario-id'] = sesionActual.id;
  if (cuerpo) opt.body = JSON.stringify(cuerpo);
  const r = await fetch(ruta, opt);
  return { status: r.status, datos: await r.json() };
}

function guardarSesion(s) {
  sesionActual = s;
  localStorage.setItem(SESION_KEY, JSON.stringify(s));
  reflejarSesion();
}
function cerrarSesion() {
  sesionActual = null;
  localStorage.removeItem(SESION_KEY);
  reflejarSesion();
  irA('explorar');
}

function reflejarSesion() {
  const chip = $('sesion-chip');
  const navAdmin = document.querySelectorAll('.nav-admin');
  if (sesionActual) {
    chip.hidden = false;
    chip.textContent = `👤 ${sesionActual.nombre.split(' ')[0]}`;
    navAdmin.forEach((b) => (b.hidden = sesionActual.rol !== 'admin'));
    $('cuenta-sesion').hidden = false;
    $('cuenta-formularios').hidden = true;
    $('cuenta-datos').innerHTML =
      `<p><b>${sesionActual.nombre}</b> · rol: ${sesionActual.rol}</p>` +
      `<p class="texto-tenue">${sesionActual.email || ''} ${sesionActual.telefono || ''}` +
      `${sesionActual.direccion ? ' · ' + sesionActual.direccion : ''}</p>` +
      (sesionActual.rol === 'admin' ? '<p class="texto-tenue">Tienes el panel de administración en el menú.</p>' : '') +
      (sesionActual.rol === 'negocio' ? '<p class="texto-tenue">Tu negocio aparece cuando el administrador lo aprueba.</p>' : '');
  } else {
    chip.hidden = true;
    navAdmin.forEach((b) => (b.hidden = true));
    $('cuenta-sesion').hidden = true;
    $('cuenta-formularios').hidden = false;
  }
}

// Pestañas de la vista Cuenta
document.querySelectorAll('#cuenta-tabs .chip').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelector('#cuenta-tabs .chip.activo')?.classList.remove('activo');
    b.classList.add('activo');
    document.querySelectorAll('.cuenta-form').forEach((f) => (f.hidden = f.dataset.tab !== b.dataset.tab));
  });
});

if (!ESTATICO) {
  // Login
  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = $('l-contacto').value.trim();
    const cuerpo = c.includes('@') ? { email: c } : { telefono: c };
    const { datos } = await apiCuenta('/api/login', cuerpo);
    if (datos.error) { $('err-login').textContent = datos.error; return; }
    guardarSesion(datos.sesion);
    irA(datos.sesion.rol === 'admin' ? 'admin' : 'explorar');
  });

  // Registro cliente
  $('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { datos } = await apiCuenta('/api/registro/cliente', {
      nombre: $('c-nombre').value.trim(),
      email: $('c-email').value.trim() || undefined,
      telefono: $('c-telefono').value.replace(/\D/g, '') || undefined,
      direccion: $('c-direccion').value.trim() || undefined,
    });
    if (datos.error) { $('err-cliente').textContent = datos.error; return; }
    guardarSesion(datos.sesion);
    irA('explorar');
  });

  // Registro negocio
  $('form-negocio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sector = $('n-sector').value;
    const { datos } = await apiCuenta('/api/registro/negocio', {
      nombre: $('n-nombre').value.trim(),
      sector,
      responsable: $('n-responsable').value.trim(),
      telefono: $('n-telefono').value.replace(/\D/g, '') || undefined,
      municipio: $('n-municipio').value.trim(),
      categoria: sector === 'comercio' ? $('n-categoria').value : $('n-categoria').value || undefined,
      direccion: $('n-direccion').value.trim() || undefined,
      qrUrl: $('n-qr').value.trim() || undefined,
    });
    if (datos.error) { $('err-negocio').textContent = datos.error; return; }
    guardarSesion(datos.sesion);
    $('err-negocio').textContent = '';
    alert(datos.nota || 'Negocio registrado. Queda en revisión del administrador.');
    irA('explorar');
  });

  $('cerrar-sesion').addEventListener('click', cerrarSesion);
}

// Categoría del negocio según el sector elegido
async function poblarCategoriasNegocio() {
  const sel = $('n-categoria');
  if (!sel) return;
  const tax = await API.taxonomia();
  const sector = $('n-sector').value;
  const cats = tax.sectores?.[sector]?.categorias || [];
  sel.innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join('') || '<option value="">(general)</option>';
  $('campo-categoria').style.display = sector === 'comercio' ? '' : '';
}
$('n-sector')?.addEventListener('change', poblarCategoriasNegocio);

// Panel de admin
async function cargarAdmin() {
  if (ESTATICO || !sesionActual || sesionActual.rol !== 'admin') {
    $('admin-resumen').innerHTML = '<p class="texto-tenue">Entra como administrador para ver el panel.</p>';
    $('admin-pendientes').innerHTML = ''; $('admin-clientes').innerHTML = '';
    return;
  }
  const { datos: p } = await apiCuenta('/api/admin/panel', null, 'GET');
  if (!p || p.error) { $('admin-resumen').innerHTML = `<p class="texto-tenue">${p?.error || 'Error'}</p>`; return; }
  const r = p.resumen;
  $('admin-resumen').innerHTML =
    `<div class="admin-tiles">
       <div><b>${r.negocios}</b><span>negocios</span></div>
       <div><b>${r.aprobados}</b><span>aprobados</span></div>
       <div><b>${r.pendientes}</b><span>pendientes</span></div>
       <div><b>${r.clientes}</b><span>clientes</span></div>
     </div>`;
  $('admin-pendientes').innerHTML = p.pendientes.length
    ? ''
    : '<p class="texto-tenue">No hay negocios por aprobar.</p>';
  for (const n of p.pendientes) {
    const div = document.createElement('div');
    div.className = 'admin-fila';
    div.innerHTML = `
      <div><b>${n.nombre}</b><div class="detalle">${n.sector} · ${n.municipio}${n.categoria ? ' · ' + n.categoria : ''}${n.telefono ? ' · 📞 ' + n.telefono : ''}</div></div>
      <div class="admin-acciones">
        <button class="boton-mini aprobar">Aprobar</button>
        <button class="boton-mini-borde rechazar">Rechazar</button>
      </div>`;
    div.querySelector('.aprobar').addEventListener('click', () => decidir(n.id, 'aprobar'));
    div.querySelector('.rechazar').addEventListener('click', () => decidir(n.id, 'rechazar'));
    $('admin-pendientes').appendChild(div);
  }
  $('admin-clientes').innerHTML = p.clientes.length
    ? p.clientes.map((c) => `<div class="admin-fila"><div>${c.nombre}<div class="detalle">${c.email || ''} ${c.telefono || ''}</div></div></div>`).join('')
    : '<p class="texto-tenue">Aún no hay clientes registrados.</p>';
}
async function decidir(id, decision) {
  await apiCuenta('/api/admin/decidir', { negocioId: id, decision });
  cargarAdmin();
  cargarNegocios();
}

/* ================================================================ */
/* Arranque                                                         */
/* ================================================================ */

(async () => {
  const insignia = $('estado');
  try {
    const datos = await API.estado();
    if (datos.estatico) {
      insignia.textContent = 'demo pública · IA en localhost';
      insignia.className = 'estado';
    } else if (!datos.llave_configurada) {
      insignia.textContent = 'asistente sin llave API (.env)';
      insignia.className = 'estado error';
    } else {
      insignia.textContent = `IA activa · ${datos.origen_datos}`;
      insignia.className = 'estado ok';
    }
  } catch {
    insignia.textContent = 'servidor no disponible';
    insignia.className = 'estado error';
  }
})();

burbuja(
  'Soy CIMARRÓN. Te ayudo a comprar en el comercio local, reservar planes y alojamiento, ' +
    'agendar servicios de campo, o a vender lo que haces si eres productor.\n\n¿Qué necesitas?',
  'agente',
);
pintarSugerencias();
poblarCategorias();
cargarNegocios();
reflejarSesion();
poblarCategoriasNegocio();
if (ESTATICO) {
  document.querySelectorAll('.cuenta-form').forEach((f) => {
    f.querySelectorAll('input,select,button').forEach((el) => (el.disabled = true));
  });
  const aviso = document.createElement('p');
  aviso.className = 'texto-tenue';
  aviso.textContent = 'El registro y las cuentas funcionan en la versión con servidor o Supabase. En esta demo pública son solo de muestra.';
  $('cuenta-formularios').prepend(aviso);
}
