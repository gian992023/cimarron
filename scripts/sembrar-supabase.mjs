// sembrar-supabase.mjs — deja la base de datos lista para el pitch.
//
// Crea 3 cuentas demo (admin, cliente, negocio) en la tabla perfiles y carga los
// negocios, ítems (ya enriquecidos con precio real) y sellos. Idempotente: se
// puede correr varias veces (upsert por id).
//
// Requiere en el entorno:  SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY)
// Uso:  node --env-file=.env scripts/sembrar-supabase.mjs

import { createClient } from '@supabase/supabase-js';
import { crearRepositorioMemoria } from '../src/datos/memoria.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Cuentas demo con id fijo (upsert idempotente). Estas son las credenciales.
const ID_ADMIN = '00000000-0000-0000-0000-0000000000a1';
const ID_CLIENTE = '00000000-0000-0000-0000-0000000000c1';
const ID_NEGOCIO = '00000000-0000-0000-0000-0000000000b1';
const PERFILES = [
  { id: ID_ADMIN, rol: 'admin', nombre: 'Administrador CIMARRÓN', email: 'admin@cimarron.co', telefono: '3123066149', password: 'Cimarron.Admin.2026', direccion: 'Calle 8 # 23-40, Centro', municipio: 'Yopal' },
  { id: ID_CLIENTE, rol: 'cliente', nombre: 'María Fernanda Ríos', email: 'cliente@cimarron.co', telefono: '3123066149', password: 'Cimarron.Cliente.2026', direccion: 'Carrera 20 # 12-45, Barrio El Bosque', municipio: 'Yopal' },
  { id: ID_NEGOCIO, rol: 'negocio', nombre: 'Dueño Demo (negocio)', email: 'negocio@cimarron.co', telefono: '3123066149', password: 'Cimarron.Negocio.2026', direccion: 'Carrera 19 # 9-15', municipio: 'Yopal' },
];

async function main() {
  console.log('Sembrando perfiles (admin, cliente, negocio)...');
  const { error: ep } = await db.from('perfiles').upsert(PERFILES, { onConflict: 'id' });
  if (ep) throw ep;
  for (const p of PERFILES) console.log(`  + ${p.rol}: ${p.email}  /  ${p.password}`);

  console.log('Cargando negocios, ítems y sellos (data real enriquecida)...');
  const repo = crearRepositorioMemoria();
  const negocios = await repo.listarNegocios({ incluirTodos: true });
  const sellos = await repo.listarSellos();

  // Al primer negocio de comercio le ponemos de dueño la cuenta demo de negocio,
  // así el perfil "negocio" muestra un negocio real con sus ítems.
  const negocioDemo = negocios.find((n) => n.sector === 'comercio') || negocios[0];

  for (const n of negocios) {
    const fila = {
      id: n.id, owner_id: n.id === negocioDemo.id ? ID_NEGOCIO : null,
      sector: n.sector, nombre: n.nombre, categoria: n.categoria ?? null,
      responsable: n.responsable ?? null, municipio: n.municipio,
      ubicacion_lat: n.ubicacion.lat, ubicacion_lng: n.ubicacion.lng,
      direccion: n.direccion ?? null, telefono: n.telefono ?? null, sitio_web: n.sitioWeb ?? null,
      imagen_url: n.imagenUrl ?? null, descripcion: n.descripcion ?? null, rating: n.rating ?? null,
      habitaciones: n.habitaciones ?? null, radio_cobertura_km: n.radioCoberturaKm ?? 10,
      pago_breb: n.pago?.breb ?? true, pago_contraentrega: n.pago?.contraentrega ?? (n.sector === 'comercio'),
      estado: 'aprobado',
    };
    const { error } = await db.from('negocios').upsert(fila, { onConflict: 'id' });
    if (error) throw error;
    const items = await repo.listarItems({ negocioId: n.id, incluirTodos: true });
    for (const i of items) {
      const { error: ei } = await db.from('items').upsert({
        id: i.id, negocio_id: n.id, tipo: i.tipo, nombre: i.nombre, precio_cop: i.precioCop ?? null,
        unidad: i.unidad ?? 'unidad', categoria: i.categoria ?? null, modalidad: i.modalidad ?? null,
        descripcion: i.descripcion ?? null, codigo_sello: i.codigoSello ?? null, activo: true,
      }, { onConflict: 'id' });
      if (ei) throw ei;
    }
  }

  for (const s of sellos) {
    const { hash, hashAnterior, codigo, ...contenido } = s;
    await db.from('sellos').upsert({ codigo, hash, hash_anterior: hashAnterior, contenido }, { onConflict: 'codigo' });
  }

  console.log(`Listo: ${negocios.length} negocios, ${sellos.length} sellos.`);
  console.log(`Negocio demo con dueño: ${negocioDemo.nombre} (${negocioDemo.id}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
