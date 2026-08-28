// Implementación en memoria del contrato de datos.
//
// Es la que corre en la demo: cero dependencias externas, cero latencia, cero
// riesgo de que una caída de red mate la presentación. Los datos salen de
// src/datos/semillas.mjs (el archivo que se edita con la información real).
//
// Al arrancar, emite el Sello Llanero de los ítems que traen `certificacion`
// en las semillas, así el verificador tiene cadena real desde el segundo cero.
//
// La data sale de fuente.mjs: la importada real si existe, o los ejemplos.

import { NEGOCIOS, ITEMS } from './fuente.mjs';
import { generarId } from '../nucleo/id.mjs';
import { emitirSello, raizDeCadena } from '../nucleo/sello.mjs';

const ahora = () => new Date().toISOString();

export function crearRepositorioMemoria() {
  // La data existente (importada o curada) nace aprobada; los registros nuevos
  // desde la app nacen 'pendiente' y esperan la aprobación del admin.
  const negocios = JSON.parse(JSON.stringify(NEGOCIOS)).map((n) => ({ activo: true, estado: 'aprobado', ...n }));
  const items = JSON.parse(JSON.stringify(ITEMS)).map((i) => ({
    activo: true,
    codigoSello: null,
    ...i,
  }));
  const solicitudes = [];
  const sellos = [];
  const favoritos = []; // { usuarioId, itemId }
  // Usuarios sembrados: un admin y un cliente listos para probar.
  const usuarios = [
    { id: 'usr_admin', rol: 'admin', nombre: 'Administrador CIMARRÓN', email: 'admin@cimarron.co', telefono: '3000000000', direccion: null, creadoEn: ahora() },
    { id: 'usr_cliente', rol: 'cliente', nombre: 'Cliente Demo', email: 'cliente@cimarron.co', telefono: '3123066140', direccion: null, creadoEn: ahora() },
  ];
  let consecutivo = 1000;
  let secuenciaUsr = 0;

  const clon = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
  const coincide = (texto, b) =>
    !b || String(texto || '').toLowerCase().includes(String(b).toLowerCase());
  const negocioDe = (id) => negocios.find((n) => n.id === id);

  const enriquecer = (item) => {
    const n = negocioDe(item.negocioId);
    return clon({
      ...item,
      negocioNombre: n?.nombre,
      municipio: n?.municipio,
      sector: n?.sector,
      radioCoberturaKm: n?.radioCoberturaKm ?? 0,
    });
  };

  // ----- sellos de las semillas: cadena real desde el arranque -----
  for (const item of items) {
    if (!item.certificacion) continue;
    const n = negocioDe(item.negocioId);
    const sello = emitirSello(
      {
        producto: item.nombre,
        negocio: n?.nombre,
        municipio: n?.municipio,
        ...item.certificacion,
      },
      raizDeCadena(sellos),
    );
    sellos.push(sello);
    item.codigoSello = sello.codigo;
    delete item.certificacion;
  }

  return {
    // ----- usuarios / cuentas -----
    async crearUsuario(datos) {
      const usuario = {
        id: datos.id || `usr_${Date.now().toString(36)}${secuenciaUsr++}`,
        rol: datos.rol || 'cliente',
        nombre: datos.nombre,
        email: datos.email ? String(datos.email).toLowerCase().trim() : null,
        telefono: datos.telefono ? String(datos.telefono).replace(/\D/g, '') : null,
        direccion: datos.direccion || null,
        municipio: datos.municipio || null,
        password: datos.password || null,
        creadoEn: ahora(),
      };
      usuarios.push(usuario);
      return clon(usuario);
    },
    async buscarUsuario({ email, telefono }) {
      const e = email ? String(email).toLowerCase().trim() : null;
      const t = telefono ? String(telefono).replace(/\D/g, '') : null;
      return clon(usuarios.find((u) => (e && u.email === e) || (t && u.telefono === t)) ?? null);
    },
    async obtenerUsuario(id) {
      return clon(usuarios.find((u) => u.id === id) ?? null);
    },
    async actualizarUsuario(id, cambios) {
      const u = usuarios.find((x) => x.id === id);
      if (!u) throw new Error('Usuario no encontrado');
      Object.assign(u, cambios);
      return clon(u);
    },
    async listarUsuarios(filtro = {}) {
      return clon(usuarios.filter((u) => !filtro.rol || u.rol === filtro.rol));
    },
    async aprobarNegocio(id, estado) {
      const n = negocioDe(id);
      if (!n) throw new Error('Negocio no encontrado');
      n.estado = estado; // 'aprobado' | 'rechazado' | 'suspendido'
      return clon(n);
    },

    // ----- favoritos -----
    async agregarFavorito(usuarioId, itemId) {
      if (!favoritos.some((f) => f.usuarioId === usuarioId && f.itemId === itemId)) {
        favoritos.push({ usuarioId, itemId });
      }
      return { ok: true };
    },
    async quitarFavorito(usuarioId, itemId) {
      const i = favoritos.findIndex((f) => f.usuarioId === usuarioId && f.itemId === itemId);
      if (i >= 0) favoritos.splice(i, 1);
      return { ok: true };
    },
    async listarFavoritos(usuarioId) {
      const ids = favoritos.filter((f) => f.usuarioId === usuarioId).map((f) => f.itemId);
      return items.filter((i) => ids.includes(i.id)).map(enriquecer);
    },

    // ----- negocios -----
    async listarNegocios(filtro = {}) {
      return clon(
        negocios.filter(
          (n) =>
            n.activo &&
            (filtro.incluirTodos || (filtro.estado ? n.estado === filtro.estado : n.estado === 'aprobado')) &&
            (!filtro.ownerId || n.ownerId === filtro.ownerId) &&
            (!filtro.sector || n.sector === filtro.sector) &&
            (coincide(n.nombre, filtro.busqueda) ||
              coincide(n.descripcion, filtro.busqueda) ||
              coincide(n.municipio, filtro.busqueda)),
        ),
      );
    },

    async obtenerNegocio(id) {
      return clon(negocioDe(id) ?? null);
    },

    async crearNegocio(datos) {
      // Un registro nuevo desde la app nace pendiente de aprobación.
      const negocio = { id: generarId('neg'), activo: true, radioCoberturaKm: 10, estado: 'pendiente', ...datos };
      negocios.push(negocio);
      return clon(negocio);
    },

    // ----- items -----
    async listarItems(filtro = {}) {
      const porSector = filtro.sector
        ? new Set(negocios.filter((n) => n.sector === filtro.sector).map((n) => n.id))
        : null;
      // Solo ítems de negocios aprobados salen al público (salvo incluirTodos o negocioId directo).
      const aprobados = new Set(negocios.filter((n) => n.estado === 'aprobado').map((n) => n.id));
      const visible = (id) => filtro.incluirTodos || filtro.negocioId === id || aprobados.has(id);

      const muni = filtro.municipio ? String(filtro.municipio).toLowerCase().trim() : null;
      return items
        .filter((i) => {
          const neg = negocioDe(i.negocioId);
          return (
            i.activo &&
            visible(i.negocioId) &&
            (!filtro.negocioId || i.negocioId === filtro.negocioId) &&
            (!filtro.tipo || i.tipo === filtro.tipo) &&
            (!filtro.categoria || i.categoria === filtro.categoria) &&
            (!porSector || porSector.has(i.negocioId)) &&
            (!muni || String(neg?.municipio || '').toLowerCase().includes(muni)) &&
            // La búsqueda libre también matchea el nombre y el municipio del negocio.
            (coincide(i.nombre, filtro.busqueda) ||
              coincide(i.descripcion, filtro.busqueda) ||
              coincide(i.categoria, filtro.busqueda) ||
              coincide(neg?.nombre, filtro.busqueda) ||
              coincide(neg?.municipio, filtro.busqueda))
          );
        })
        .map(enriquecer);
    },

    async obtenerItem(id) {
      const i = items.find((x) => x.id === id);
      return i ? enriquecer(i) : null;
    },

    async crearItem(datos) {
      const item = { id: generarId('itm'), activo: true, codigoSello: null, ...datos };
      items.push(item);
      return enriquecer(item);
    },

    async actualizarItem(id, cambios) {
      const i = items.find((x) => x.id === id);
      if (!i) throw new Error(`Ítem no encontrado: ${id}`);
      Object.assign(i, cambios);
      return enriquecer(i);
    },

    // ----- solicitudes -----
    async crearSolicitud(datos) {
      const solicitud = {
        id: generarId('sol'),
        numero: ++consecutivo,
        pagado: false,
        creadoEn: ahora(),
        ...datos,
      };
      solicitudes.push(solicitud);
      return clon(solicitud);
    },

    async obtenerSolicitud(id) {
      return clon(
        solicitudes.find((s) => s.id === id || String(s.numero) === String(id)) ?? null,
      );
    },

    async actualizarSolicitud(id, cambios) {
      const s = solicitudes.find((x) => x.id === id || String(x.numero) === String(id));
      if (!s) throw new Error(`Solicitud no encontrada: ${id}`);
      Object.assign(s, cambios);
      return clon(s);
    },

    async listarSolicitudes(filtro = {}) {
      return solicitudes
        .filter(
          (s) =>
            (!filtro.telefono || s.telefono === String(filtro.telefono).trim()) &&
            (!filtro.negocioId || s.negocioId === filtro.negocioId),
        )
        .map((s) => {
          const item = items.find((i) => i.id === s.itemId);
          const n = negocioDe(s.negocioId);
          return clon({ ...s, itemNombre: item?.nombre, negocioNombre: n?.nombre });
        })
        .reverse();
    },

    // ----- sellos (cadena de hashes) -----
    async listarSellos() {
      return clon(sellos);
    },

    async obtenerSello(codigo) {
      return clon(sellos.find((s) => s.codigo === String(codigo).toUpperCase()) ?? null);
    },

    async guardarSello(sello) {
      sellos.push(sello);
      return clon(sello);
    },
  };
}
