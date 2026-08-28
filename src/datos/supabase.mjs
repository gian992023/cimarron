// Implementación Supabase del contrato de datos.
//
// Se activa con CIMARRON_ORIGEN_DATOS=supabase (y SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY en .env). El agente, los endpoints y la web no
// cambian: hablan con el mismo contrato de src/datos/interfaces.mjs.
//
// El service_role vive SOLO en el servidor. La web nunca lo ve.

import { createClient } from '@supabase/supabase-js';

let db = null;
function cliente() {
  if (db) return db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env para usar el origen supabase.');
  }
  db = createClient(url, key, { auth: { persistSession: false } });
  return db;
}

/* Mapeo columnas (snake_case) <-> dominio (camelCase). */
const negDeFila = (n) => n && ({
  id: n.id, sector: n.sector, nombre: n.nombre, categoria: n.categoria,
  responsable: n.responsable, municipio: n.municipio,
  ubicacion: { lat: n.ubicacion_lat, lng: n.ubicacion_lng },
  direccion: n.direccion, telefono: n.telefono, sitioWeb: n.sitio_web,
  imagenUrl: n.imagen_url, descripcion: n.descripcion, rating: n.rating,
  habitaciones: n.habitaciones, radioCoberturaKm: n.radio_cobertura_km,
  pago: { breb: n.pago_breb, contraentrega: n.pago_contraentrega },
  qrUrl: n.qr_url, estado: n.estado, ownerId: n.owner_id,
});
const negAFila = (d) => ({
  id: d.id, owner_id: d.ownerId ?? null, sector: d.sector, nombre: d.nombre,
  categoria: d.categoria ?? null, responsable: d.responsable ?? null, municipio: d.municipio,
  ubicacion_lat: d.ubicacion.lat, ubicacion_lng: d.ubicacion.lng, direccion: d.direccion ?? null,
  telefono: d.telefono ?? null, sitio_web: d.sitioWeb ?? null, imagen_url: d.imagenUrl ?? null,
  descripcion: d.descripcion ?? null, rating: d.rating ?? null, habitaciones: d.habitaciones ?? null,
  radio_cobertura_km: d.radioCoberturaKm ?? 10,
  pago_breb: d.pago?.breb ?? true, pago_contraentrega: d.pago?.contraentrega ?? false,
  qr_url: d.qrUrl ?? null, estado: d.estado ?? 'pendiente',
});
const itemDeFila = (i) => i && ({
  id: i.id, negocioId: i.negocio_id, tipo: i.tipo, nombre: i.nombre, precioCop: i.precio_cop,
  unidad: i.unidad, categoria: i.categoria, modalidad: i.modalidad, descripcion: i.descripcion,
  codigoSello: i.codigo_sello, activo: i.activo,
});
const itemAFila = (d) => ({
  id: d.id, negocio_id: d.negocioId, tipo: d.tipo, nombre: d.nombre, precio_cop: d.precioCop ?? null,
  unidad: d.unidad ?? 'unidad', categoria: d.categoria ?? null, modalidad: d.modalidad ?? null,
  descripcion: d.descripcion ?? null, codigo_sello: d.codigoSello ?? null, activo: d.activo ?? true,
});
const solAFila = (d) => ({
  id: d.id, tipo: d.tipo, negocio_id: d.negocioId, item_id: d.itemId ?? null,
  cliente_id: d.clienteId ?? null, cliente_nombre: d.cliente, telefono: d.telefono,
  cantidad: d.cantidad ?? 1, total_cop: d.totalCop ?? null, entrega: d.entrega ?? null,
  direccion: d.direccion ?? null, fecha_inicio: d.fechaInicio ?? null, fecha_fin: d.fechaFin ?? null,
  personas: d.personas ?? null, fecha: d.fecha ?? null, estado: d.estado,
  referencia_pago: d.referenciaPago ?? null, pagado: d.pagado ?? false,
});

export function crearRepositorioSupabase() {
  const c = cliente();
  const enriquecer = async (item) => {
    const { data: n } = await c.from('negocios').select('nombre, municipio, sector, radio_cobertura_km').eq('id', item.negocioId).single();
    return { ...item, negocioNombre: n?.nombre, municipio: n?.municipio, sector: n?.sector, radioCoberturaKm: n?.radio_cobertura_km ?? 0 };
  };

  return {
    async listarNegocios(f = {}) {
      let q = c.from('negocios').select('*');
      if (!f.incluirTodos) q = q.eq('estado', 'aprobado');
      if (f.sector) q = q.eq('sector', f.sector);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(negDeFila);
    },
    async obtenerNegocio(id) {
      const { data } = await c.from('negocios').select('*').eq('id', id).single();
      return negDeFila(data);
    },
    async crearNegocio(d) {
      const fila = negAFila({ id: d.id || `neg_${Date.now().toString(36)}`, ...d });
      const { data, error } = await c.from('negocios').insert(fila).select('*').single();
      if (error) throw error;
      return negDeFila(data);
    },
    async actualizarNegocio(id, cambios) {
      const parcial = negAFila({ ubicacion: { lat: 0, lng: 0 }, ...cambios });
      const limpio = Object.fromEntries(Object.entries(parcial).filter(([k]) => k in cambiosPermitidos(cambios)));
      const { data, error } = await c.from('negocios').update(limpio).eq('id', id).select('*').single();
      if (error) throw error;
      return negDeFila(data);
    },
    async listarItems(f = {}) {
      let q = c.from('items').select('*').eq('activo', true);
      if (f.negocioId) q = q.eq('negocio_id', f.negocioId);
      if (f.tipo) q = q.eq('tipo', f.tipo);
      if (f.categoria) q = q.eq('categoria', f.categoria);
      const { data, error } = await q;
      if (error) throw error;
      let items = (data || []).map(itemDeFila);
      if (f.sector || f.busqueda) {
        const enr = await Promise.all(items.map(enriquecer));
        items = enr.filter((i) =>
          (!f.sector || i.sector === f.sector) &&
          (!f.busqueda || `${i.nombre} ${i.descripcion || ''}`.toLowerCase().includes(f.busqueda.toLowerCase())));
        return items;
      }
      return Promise.all(items.map(enriquecer));
    },
    async obtenerItem(id) {
      const { data } = await c.from('items').select('*').eq('id', id).single();
      return data ? enriquecer(itemDeFila(data)) : null;
    },
    async crearItem(d) {
      const { data, error } = await c.from('items').insert(itemAFila({ id: d.id || `itm_${Date.now().toString(36)}`, ...d })).select('*').single();
      if (error) throw error;
      return enriquecer(itemDeFila(data));
    },
    async actualizarItem(id, cambios) {
      const { data, error } = await c.from('items').update(itemAFila({ negocioId: '', ...cambios })).eq('id', id).select('*').single();
      if (error) throw error;
      return enriquecer(itemDeFila(data));
    },
    async crearSolicitud(d) {
      const { data, error } = await c.from('solicitudes').insert(solAFila({ id: d.id || `sol_${Date.now().toString(36)}`, ...d })).select('*').single();
      if (error) throw error;
      return { ...d, id: data.id, numero: data.numero, creadoEn: data.creado_en };
    },
    async obtenerSolicitud(id) {
      const col = /^\d+$/.test(String(id)) ? 'numero' : 'id';
      const { data } = await c.from('solicitudes').select('*').eq(col, id).single();
      return data ? { ...data, negocioId: data.negocio_id, itemId: data.item_id, totalCop: data.total_cop, referenciaPago: data.referencia_pago, numeroLegible: data.numero } : null;
    },
    async actualizarSolicitud(id, cambios) {
      const col = /^\d+$/.test(String(id)) ? 'numero' : 'id';
      const parcial = {};
      if ('referenciaPago' in cambios) parcial.referencia_pago = cambios.referenciaPago;
      if ('estado' in cambios) parcial.estado = cambios.estado;
      if ('pagado' in cambios) parcial.pagado = cambios.pagado;
      const { data, error } = await c.from('solicitudes').update(parcial).eq(col, id).select('*').single();
      if (error) throw error;
      return { ...data, negocioId: data.negocio_id, totalCop: data.total_cop, referenciaPago: data.referencia_pago };
    },
    async listarSolicitudes(f = {}) {
      let q = c.from('solicitudes').select('*').order('numero', { ascending: false });
      if (f.telefono) q = q.eq('telefono', f.telefono);
      if (f.negocioId) q = q.eq('negocio_id', f.negocioId);
      const { data } = await q;
      return (data || []).map((s) => ({ ...s, negocioId: s.negocio_id, itemNombre: null, totalCop: s.total_cop, referenciaPago: s.referencia_pago }));
    },
    async listarSellos() {
      const { data } = await c.from('sellos').select('*').order('emitido_en');
      return (data || []).map((s) => ({ codigo: s.codigo, hash: s.hash, hashAnterior: s.hash_anterior, ...s.contenido }));
    },
    async obtenerSello(codigo) {
      const { data } = await c.from('sellos').select('*').eq('codigo', String(codigo).toUpperCase()).single();
      return data ? { codigo: data.codigo, hash: data.hash, hashAnterior: data.hash_anterior, ...data.contenido } : null;
    },
    async guardarSello(sello) {
      const { hash, hashAnterior, codigo, ...contenido } = sello;
      const { error } = await c.from('sellos').insert({ codigo, hash, hash_anterior: hashAnterior, contenido });
      if (error) throw error;
      return sello;
    },
  };
}

function cambiosPermitidos(cambios) {
  const map = { estado: 'estado', descripcion: 'descripcion', qrUrl: 'qr_url', rating: 'rating' };
  const out = {};
  for (const k of Object.keys(cambios)) if (map[k]) out[map[k]] = true;
  return out;
}
