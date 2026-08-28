-- ============================================================
-- CIMARRÓN — Row Level Security por rol.
-- cliente: ve lo público y sus propias solicitudes.
-- negocio: gestiona su negocio, sus ítems y las solicitudes que le llegan.
-- admin:   ve y gestiona todo, y aprueba/rechaza negocios.
-- ============================================================

-- helper: ¿el usuario actual es admin?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin');
$$;

alter table perfiles     enable row level security;
alter table negocios     enable row level security;
alter table items        enable row level security;
alter table solicitudes  enable row level security;
alter table sellos       enable row level security;

-- ---------- perfiles ----------
create policy perfiles_lee_propio   on perfiles for select using (id = auth.uid() or es_admin());
create policy perfiles_edita_propio on perfiles for update using (id = auth.uid());

-- ---------- negocios ----------
-- público: solo negocios aprobados
create policy negocios_publico on negocios for select
  using (estado = 'aprobado' or owner_id = auth.uid() or es_admin());
-- el dueño crea su negocio (nace pendiente); el admin puede crear cualquiera
create policy negocios_inserta on negocios for insert
  with check (owner_id = auth.uid() or es_admin());
-- el dueño edita su negocio; el admin edita cualquiera (aprobar/rechazar)
create policy negocios_edita on negocios for update
  using (owner_id = auth.uid() or es_admin());

-- ---------- items ----------
create policy items_publico on items for select using (
  es_admin()
  or exists (select 1 from negocios n where n.id = items.negocio_id
             and (n.estado = 'aprobado' or n.owner_id = auth.uid()))
);
create policy items_gestiona on items for all using (
  es_admin()
  or exists (select 1 from negocios n where n.id = items.negocio_id and n.owner_id = auth.uid())
) with check (
  es_admin()
  or exists (select 1 from negocios n where n.id = items.negocio_id and n.owner_id = auth.uid())
);

-- ---------- solicitudes ----------
-- el cliente ve las suyas; el negocio ve las que le llegan; el admin todas
create policy solicitudes_lee on solicitudes for select using (
  cliente_id = auth.uid()
  or es_admin()
  or exists (select 1 from negocios n where n.id = solicitudes.negocio_id and n.owner_id = auth.uid())
);
-- cualquiera autenticado puede crear su solicitud (queda ligada a su id si lo hay)
create policy solicitudes_inserta on solicitudes for insert
  with check (cliente_id = auth.uid() or cliente_id is null or es_admin());
-- el negocio dueño (o admin) actualiza el estado de la solicitud
create policy solicitudes_actualiza on solicitudes for update using (
  es_admin()
  or exists (select 1 from negocios n where n.id = solicitudes.negocio_id and n.owner_id = auth.uid())
);

-- ---------- sellos ----------
create policy sellos_publico on sellos for select using (true);         -- verificación pública
create policy sellos_inserta on sellos for insert with check (auth.uid() is not null);
