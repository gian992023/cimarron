// sembrar-supabase.mjs — deja la base de datos lista para usar.
//
// Crea los usuarios sembrados (1 admin + 1 cliente) y carga los negocios, ítems
// y sellos actuales (aprobados) en Supabase. Correr UNA vez, después de aplicar
// las migraciones de supabase/migrations/.
//
// Requiere en .env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Uso:  node scripts/sembrar-supabase.mjs

import { createClient } from '@supabase/supabase-js';
import { crearRepositorioMemoria } from '../src/datos/memoria.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const USUARIOS = [
  { email: 'admin@cimarron.co', password: 'Cimarron.Admin.2026', rol: 'admin', nombre: 'Administrador CIMARRÓN', telefono: '3000000000' },
  { email: 'cliente@cimarron.co', password: 'Cimarron.Cliente.2026', rol: 'cliente', nombre: 'Cliente Demo', telefono: '3123066140' },
];

async function crearUsuario(u) {
  const { data, error } = await db.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
    user_metadata: { rol: u.rol, nombre: u.nombre, telefono: u.telefono },
  });
  if (error) {
    if (/already/i.test(error.message)) { console.log(`  = ${u.rol} ya existía (${u.email})`); return; }
    throw error;
  }
  console.log(`  + ${u.rol} creado: ${u.email}  (contraseña: ${u.password})`);
  return data.user;
}

async function main() {
  console.log('Sembrando usuarios...');
  for (const u of USUARIOS) await crearUsuario(u);

  console.log('Cargando negocios, ítems y sellos (aprobados)...');
  const repo = crearRepositorioMemoria();
  const negocios = await repo.listarNegocios({ incluirTodos: true });
  const sellos = await repo.listarSellos();

  for (const n of negocios) {
    const fila = {
      id: n.id, sector: n.sector, nombre: n.nombre, categoria: n.categoria ?? null,
      responsable: n.responsable ?? null, municipio: n.municipio,
      ubicacion_lat: n.ubicacion.lat, ubicacion_lng: n.ubicacion.lng,
      direccion: n.direccion ?? null, telefono: n.telefono ?? null, sitio_web: n.sitioWeb ?? null,
      imagen_url: n.imagenUrl ?? null, descripcion: n.descripcion ?? null, rating: n.rating ?? null,
      habitaciones: n.habitaciones ?? null, radio_cobertura_km: n.radioCoberturaKm ?? 10,
      pago_breb: n.pago?.breb ?? true, pago_contraentrega: n.pago?.contraentrega ?? (n.sector === 'comercio'),
      estado: 'aprobado',
    };
    const { error } = await db.from('negocios').upsert(fila);
    if (error) throw error;
    const items = await repo.listarItems({ negocioId: n.id });
    for (const i of items) {
      await db.from('items').upsert({
        id: i.id, negocio_id: n.id, tipo: i.tipo, nombre: i.nombre, precio_cop: i.precioCop ?? null,
        unidad: i.unidad ?? 'unidad', categoria: i.categoria ?? null, modalidad: i.modalidad ?? null,
        descripcion: i.descripcion ?? null, codigo_sello: i.codigoSello ?? null, activo: true,
      });
    }
  }

  for (const s of sellos) {
    const { hash, hashAnterior, codigo, ...contenido } = s;
    await db.from('sellos').upsert({ codigo, hash, hash_anterior: hashAnterior, contenido });
  }

  console.log(`Listo: ${negocios.length} negocios y ${sellos.length} sellos cargados.`);
  console.log('Entra con  admin@cimarron.co  o  cliente@cimarron.co  (contraseñas arriba).');
}

main().catch((e) => { console.error(e); process.exit(1); });
