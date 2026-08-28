// CUENTAS — registro de usuarios (cliente y negocio), login y administración.
//
// En modo memoria funciona de una vez para probar. En producción, el registro
// de usuarios pasa por Supabase Auth (ver supabase/migrations y scripts/
// sembrar-supabase.mjs); esta capa mantiene la misma forma de datos.
//
// El "login" de la demo es liviano a propósito: identifica por correo o teléfono
// (sin contraseña), porque el reto pide que el cliente quede registrado solo con
// correo, nombre o número. El admin se siembra directo en la base.

import { repositorio } from '../datos/index.mjs';
import { generarId } from '../nucleo/id.mjs';
import { municipioCanonico, MUNICIPIOS } from '../nucleo/taxonomia.mjs';

const sesion = (u) => ({ id: u.id, rol: u.rol, nombre: u.nombre, email: u.email, telefono: u.telefono, direccion: u.direccion });

/** Registra (o recupera) un usuario cliente. Basta correo, nombre y teléfono. */
export async function registrarCliente({ nombre, email, telefono, direccion }) {
  const db = repositorio();
  if (!nombre || (!email && !telefono)) {
    return { error: 'Para registrarte necesito tu nombre y un correo o un teléfono.' };
  }
  const existe = await db.buscarUsuario({ email, telefono });
  if (existe) {
    if (existe.rol !== 'cliente') return { error: 'Ese correo o teléfono ya está registrado con otro rol.' };
    if (direccion && !existe.direccion) await db.actualizarUsuario(existe.id, { direccion });
    return { ok: true, yaExistia: true, sesion: sesion(existe) };
  }
  const u = await db.crearUsuario({ rol: 'cliente', nombre, email, telefono, direccion });
  return { ok: true, sesion: sesion(u) };
}

/**
 * Registra un negocio: crea el usuario dueño (rol negocio) y el negocio en estado
 * pendiente, con los campos que exige su sector. Devuelve la sesión del dueño.
 */
export async function registrarNegocio(datos) {
  const db = repositorio();
  const { nombre, sector, responsable, telefono, email, municipio, categoria, direccion, qrUrl } = datos;

  if (!nombre || !sector || !responsable || !municipio) {
    return { error: 'Faltan datos: nombre del negocio, sector, responsable y municipio.' };
  }
  if (!['comercio', 'turismo', 'agro'].includes(sector)) return { error: 'Sector inválido.' };
  if (!email && !telefono) return { error: 'Deja un contacto: correo o teléfono.' };

  const muni = municipioCanonico(municipio);
  if (!muni) return { error: `"${municipio}" no es un municipio de Casanare.` };

  // Campos obligatorios propios de cada sector (según la estructura de recolección).
  if (sector === 'comercio' && !categoria) return { error: 'En comercio indica la categoría (restaurantes, ferreterías, farmacias, ...).' };

  const existe = await db.buscarUsuario({ email, telefono });
  let owner = existe;
  if (existe && existe.rol === 'cliente') {
    return { error: 'Ese contacto ya está registrado como cliente. Usa otro correo o teléfono para el negocio.' };
  }
  if (!owner) {
    owner = await db.crearUsuario({ rol: 'negocio', nombre: responsable, email, telefono });
  }

  const ubic = datos.lat && datos.lng ? { lat: Number(datos.lat), lng: Number(datos.lng) } : MUNICIPIOS[muni];
  const negocio = await db.crearNegocio({
    id: generarId('neg'),
    ownerId: owner.id,
    sector,
    nombre,
    categoria: categoria || null,
    responsable,
    municipio: muni,
    telefono: telefono || null,
    direccion: direccion || null,
    ubicacion: ubic,
    radioCoberturaKm: sector === 'turismo' ? 0 : sector === 'agro' ? 40 : 8,
    pago: { breb: true, contraentrega: sector === 'comercio' },
    qrUrl: qrUrl || null,
    descripcion: datos.descripcion || `${nombre} en ${muni}, Casanare.`,
  });

  // Un ítem inicial para que el negocio tenga algo publicable al aprobarse.
  await db.crearItem({
    negocioId: negocio.id,
    tipo: sector === 'turismo' ? 'servicio' : 'producto',
    nombre: datos.itemNombre || (sector === 'turismo' ? 'Habitación' : 'Pedido'),
    precioCop: datos.itemPrecio ? Number(datos.itemPrecio) : null,
    unidad: sector === 'turismo' ? 'noche' : 'unidad',
    categoria: categoria || sector,
    modalidad: sector === 'turismo' ? 'en_sitio' : undefined,
    descripcion: datos.itemDescripcion || null,
  });

  return {
    ok: true,
    estado: 'pendiente',
    negocioId: negocio.id,
    sesion: sesion(owner),
    nota: 'Tu negocio quedó registrado y pasa a revisión del administrador antes de aparecer en la plataforma.',
  };
}

/** Login liviano por correo o teléfono. */
export async function login({ email, telefono }) {
  const db = repositorio();
  const u = await db.buscarUsuario({ email, telefono });
  if (!u) return { error: 'No encontramos una cuenta con ese correo o teléfono. Regístrate primero.' };
  return { ok: true, sesion: sesion(u) };
}

/* ------------------------- administración ------------------------- */

export async function panelAdmin() {
  const db = repositorio();
  const negocios = await db.listarNegocios({ incluirTodos: true });
  const usuarios = await db.listarUsuarios({});
  return {
    pendientes: negocios.filter((n) => n.estado === 'pendiente'),
    negocios: negocios.map((n) => ({ id: n.id, nombre: n.nombre, sector: n.sector, municipio: n.municipio, estado: n.estado })),
    clientes: usuarios.filter((u) => u.rol === 'cliente').map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono })),
    duenos: usuarios.filter((u) => u.rol === 'negocio').length,
    resumen: {
      negocios: negocios.length,
      aprobados: negocios.filter((n) => n.estado === 'aprobado').length,
      pendientes: negocios.filter((n) => n.estado === 'pendiente').length,
      clientes: usuarios.filter((u) => u.rol === 'cliente').length,
    },
  };
}

export async function decidirNegocio(negocioId, decision) {
  const db = repositorio();
  const estado = decision === 'aprobar' ? 'aprobado' : 'rechazado';
  const n = await db.aprobarNegocio(negocioId, estado);
  return { ok: true, id: n.id, estado: n.estado };
}
