-- ============================================================
-- CIMARRÓN 0003 — cuentas propias (sin depender de auth.users) + favoritos.
-- El login de la app es liviano (correo/teléfono + password opcional), igual que
-- en memoria. Desacoplamos perfiles de auth para poder registrar clientes y
-- negocios directo. El servidor usa la secret key (bypassa RLS).
-- ============================================================

-- 1) perfiles deja de depender de auth.users
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
alter table perfiles drop constraint if exists perfiles_id_fkey;
alter table perfiles alter column id set default gen_random_uuid();
alter table perfiles add column if not exists password text;

-- 2) favoritos: cada usuario guarda ítems para elegirlos luego
create table if not exists favoritos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  item_id    text not null references items (id) on delete cascade,
  creado_en  timestamptz not null default now(),
  unique (usuario_id, item_id)
);
create index if not exists favoritos_usuario_idx on favoritos (usuario_id);

alter table favoritos enable row level security;
create policy favoritos_propio on favoritos for all
  using (usuario_id = auth.uid() or public.es_admin())
  with check (usuario_id = auth.uid() or public.es_admin());
