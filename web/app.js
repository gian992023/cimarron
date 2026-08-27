// Interfaz de CIMARRÓN — plataforma de tres sectores.
// El navegador habla con los endpoints REST y con /api/agente. Nunca ve la
// llave de la API: eso vive solo en el servidor.

const $ = (id) => document.getElementById(id);

/* ================================================================ */
/* Estado                                                           */
/* ================================================================ */

const estado = {
  sector: '',
  tipo: '',
  busqueda: '',
  items: [],
  vista: 'explorar',
  historial: [],
  chatOcupado: false,
};

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
}

document.querySelectorAll('[data-vista]').forEach((b) => {
  b.addEventListener('click', () => irA(b.dataset.vista));
});

/* ================================================================ */
/* Catálogo                                                         */
/* ================================================================ */

async function cargarCatalogo() {
  const q = new URLSearchParams();
  if (estado.sector) q.set('sector', estado.sector);
  if (estado.tipo) q.set('tipo', estado.tipo);
  if (estado.busqueda) q.set('q', estado.busqueda);

  try {
    const r = await fetch(`/api/catalogo?${q}`);
    const datos = await r.json();
    estado.items = datos.items || [];
  } catch {
    estado.items = [];
  }
  pintarRejilla();
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

// filtros
document.querySelectorAll('.sector').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelector('.sector.activo')?.classList.remove('activo');
    b.classList.add('activo');
    estado.sector = b.dataset.sector;
    cargarCatalogo();
  });
});

document.querySelectorAll('#chips-tipo .chip').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelector('#chips-tipo .chip.activo')?.classList.remove('activo');
    b.classList.add('activo');
    estado.tipo = b.dataset.tipo;
    cargarCatalogo();
  });
});

let temporizadorBusqueda;
$('buscar').addEventListener('input', (e) => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => {
    estado.busqueda = e.target.value.trim();
    cargarCatalogo();
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

function formularioPara(item) {
  const etiquetaCantidad = LABEL_CANTIDAD[item.unidad] || 'Cantidad';
  const comunes =
    campo('f-nombre', 'Tu nombre') +
    campo('f-telefono', 'Teléfono (para seguimiento)', 'tel', 'inputmode="numeric"');

  if (item.flujo === 'pedido') {
    return (
      `<div class="dos-columnas">${campo('f-cantidad', etiquetaCantidad, 'number', 'min="1" value="1"')}${campo('f-lugar', 'Barrio o municipio de entrega')}</div>` +
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

function abrirModal(item) {
  const modal = $('modal');
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
    <div class="precio-grande">${item.precio} <small>/ ${item.unidad}${item.modalidad === 'a_domicilio' ? ' · servicio a domicilio' : ''}${item.modalidad === 'en_sitio' ? ' · en el sitio' : ''}</small></div>
    <form class="formulario-flujo" id="form-flujo">
      ${formularioPara(item)}
      <div class="error-form" id="error-flujo"></div>
      <button class="boton-principal" type="submit">
        ${item.flujo === 'pedido' ? 'Pedir y pagar con Bre-B' : item.flujo === 'reserva' ? 'Reservar y pagar con Bre-B' : 'Agendar y pagar con Bre-B'}
      </button>
    </form>`;

  modal.querySelector('h3').textContent = item.nombre;
  modal.querySelector('.quien').textContent =
    `${item.negocioNombre} · ${item.municipio} · ${item.tipo === 'producto' ? 'Producto' : 'Servicio'}`;
  modal.querySelector('.descripcion').textContent = item.descripcion || '';
  modal.querySelector('.cerrar').addEventListener('click', cerrarModal);

  modal.querySelector('#form-flujo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => modal.querySelector(`#${id}`)?.value?.trim();
    const boton = modal.querySelector('.boton-principal');
    boton.disabled = true;
    $('error-flujo').textContent = '';

    const cuerpo = {
      itemId: item.id,
      cantidad: Number(v('f-cantidad') || 1),
      cliente: v('f-nombre'),
      telefono: (v('f-telefono') || '').replace(/\D/g, ''),
      lugar: v('f-lugar'),
      fechaInicio: v('f-inicio'),
      fechaFin: v('f-fin'),
      personas: v('f-personas') ? Number(v('f-personas')) : undefined,
      fecha: v('f-fecha'),
      lugarServicio: v('f-lugar-servicio'),
    };

    try {
      const r = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const datos = await r.json();
      if (!r.ok || datos.error) {
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
           onerror="this.outerHTML='<div class=&quot;sin-qr&quot;>El QR de Bre-B aún no está cargado.<br>Paga con la llave de abajo.</div>'" />
      <div class="llave">Llave Bre-B: <b>${pago.llave}</b> (${pago.titular})</div>
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

async function enviarAlAgente(texto) {
  if (estado.chatOcupado || !texto.trim()) return;
  estado.chatOcupado = true;
  $('enviar').disabled = true;
  $('mensaje').value = '';
  $('sugerencias').innerHTML = '';

  burbuja(texto, 'persona');
  const esperando = burbuja('CIMARRÓN está trabajando...', 'agente pensando');
  estado.historial.push({ role: 'user', content: texto });

  try {
    const r = await fetch('/api/agente', {
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
    cargarCatalogo(); // si el agente publicó o vendió algo, la vitrina se refresca
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
/* Verificador de sello                                             */
/* ================================================================ */

$('formulario-sello').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('codigo-sello').value.trim().toUpperCase();
  if (!codigo) return;
  const caja = $('resultado-sello');
  caja.innerHTML = '<p class="texto-tenue">Recalculando la cadena...</p>';

  const r = await (await fetch(`/api/sello/${encodeURIComponent(codigo)}`)).json();

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

  const r = await (await fetch(`/api/solicitudes?telefono=${telefono}`)).json();
  const lista = r.solicitudes || [];
  if (!lista.length) {
    caja.innerHTML = '<p class="texto-tenue">No hay solicitudes con ese teléfono.</p>';
    return;
  }

  caja.innerHTML = '';
  for (const s of lista) {
    const div = document.createElement('div');
    div.className = 'item-solicitud';
    div.innerHTML = `
      <div>
        <b>${s.numeroLegible}</b> · <span class="nom"></span>
        <div class="detalle">${s.creadoLegible} · ${s.total} · ref ${s.referenciaPago ?? 'sin pago'}</div>
      </div>
      <span class="estado-pill">${s.estadoEtiqueta}</span>`;
    div.querySelector('.nom').textContent = s.itemNombre ?? s.tipo;
    caja.appendChild(div);
  }
});

/* ================================================================ */
/* Arranque                                                         */
/* ================================================================ */

(async () => {
  const insignia = $('estado');
  try {
    const datos = await (await fetch('/api/estado')).json();
    if (!datos.llave_configurada) {
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
cargarCatalogo();
