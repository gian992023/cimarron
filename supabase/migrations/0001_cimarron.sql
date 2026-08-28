-- ============================================================
-- CIMARRÓN — esquema base (Supabase / Postgres)
-- Tres roles (cliente, negocio, admin), aprobación de negocios,
-- catálogo, solicitudes y cadena del Sello Llanero.
--
-- Cómo aplicarlo (cuando conectes tu proyecto):
--   supabase db push          (o pega este archivo en el SQL Editor)
-- Requiere las extensiones estándar de Supabase (pgcrypto ya viene).
-- ============================================================

-- ---------- enums ----------
create type rol_usuario     as enum ('cliente', 'negocio', 'admin');
create type sector_negocio  as enum ('comercio', 'turismo', 'agro');
create type estado_negocio  as enum ('pendiente', 'aprobado', 'rechazado', 'suspendido');
create type tipo_item       as enum ('producto', 'servicio');
create type tipo_solicitud  as enum ('pedido', 'reserva', 'agendamiento');

-- ---------- perfiles (extiende auth.users) ----------
create table perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  rol         rol_usuario not null default 'cliente',
  nombre      text not null,
  email       text,
  telefono    text,
  -- dirección del cliente, para el domicilio en comercio/agro
  direccion   text,
  municipio   text,
  ubicacion_lat double precision,
  ubicacion_lng double precision,
  creado_en   timestamptz not null default now()
);

-- ---------- negocios ----------
create table negocios (
  id            text primary key,
  owner_id      uuid references perfiles (id) on delete set null,
  sector        sector_negocio not null,
  nombre        text not null,
  categoria     text,
  responsable   text,
  municipio     text not null,
  ubicacion_lat double precision not null,
  ubicacion_lng double precision not null,
  direccion     text,
  telefono      text,
  sitio_web     text,
  imagen_url    text,
  descripcion   text,
  rating        numeric(2,1),
  habitaciones  int,
  radio_cobertura_km int not null default 10,
  -- pago: cada negocio maneja su Bre-B; contraentrega solo aplica a comercio
  pago_breb          boolean not null default true,
  pago_contraentrega boolean not null default false,
  qr_url        text,
  estado        estado_negocio not null default 'pendiente',
  creado_en     timestamptz not null default now()
);
create index on negocios (sector);
create index on negocios (estado);
create index on negocios (municipio);

-- ---------- ítems (productos y servicios del negocio) ----------
create table items (
  id          text primary key,
  negocio_id  text not null references negocios (id) on delete cascade,
  tipo        tipo_item not null,
  nombre      text not null,
  precio_cop  int,                 -- null = "a convenir con el negocio"
  unidad      text not null default 'unidad',
  categoria   text,
  modalidad   text,                -- 'en_sitio' | 'a_domicilio' (solo servicios)
  descripcion text,
  codigo_sello text,
  activo      boolean not null default true
);
create index on items (negocio_id);

-- ---------- solicitudes (pedido / reserva / agendamiento) ----------
create sequence solicitud_numero_seq start 1001;
create table solicitudes (
  id            text primary key,
  numero        bigint not null default nextval('solicitud_numero_seq'),
  tipo          tipo_solicitud not null,
  negocio_id    text not null references negocios (id) on delete cascade,
  item_id       text references items (id) on delete set null,
  cliente_id    uuid references perfiles (id) on delete set null,
  cliente_nombre text not null,
  telefono      text not null,
  cantidad      int not null default 1,
  total_cop     int,               -- null = a convenir
  -- pedido: entrega ('domicilio'|'recoger') + direccion
  entrega       text,
  direccion     text,
  -- reserva: fechas y personas ; agendamiento: fecha
  fecha_inicio  date,
  fecha_fin     date,
  personas      int,
  fecha         date,
  estado        text not null,
  referencia_pago text,
  pagado        boolean not null default false,
  creado_en     timestamptz not null default now()
);
create index on solicitudes (telefono);
create index on solicitudes (negocio_id);
create index on solicitudes (cliente_id);

-- ---------- sellos (cadena de certificación) ----------
create table sellos (
  codigo        text primary key,
  hash          text not null,
  hash_anterior text not null,
  contenido     jsonb not null,    -- producto, negocio, municipio, origen, tecnica...
  emitido_en    timestamptz not null default now()
);

-- ============================================================
-- Trigger: crear el perfil al registrarse (rol viene en metadata)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, rol, nombre, email, telefono)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'rol')::rol_usuario, 'cliente'),
    coalesce(new.raw_user_meta_data ->> 'nombre', 'Usuario'),
    new.email,
    new.raw_user_meta_data ->> 'telefono'
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
