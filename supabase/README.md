# Base de datos CIMARRÓN (Supabase)

Todo está construido para conectar cuando quieras. Mientras no conectes, la app
corre en memoria (`CIMARRON_ORIGEN_DATOS=memoria`) con un cliente y un admin
sembrados, así que puedes probar el registro y la aprobación de una vez.

## Qué hay aquí

- `migrations/0001_cimarron.sql` — esquema: perfiles (3 roles), negocios (con
  estado de aprobación), items, solicitudes y la cadena de sellos. Incluye el
  trigger que crea el perfil al registrarse.
- `migrations/0002_rls.sql` — seguridad por rol (Row Level Security): el cliente
  ve lo suyo, el negocio gestiona lo suyo, el admin ve y aprueba todo.
- `../scripts/sembrar-supabase.mjs` — crea el admin y el cliente, y carga los
  negocios, ítems y sellos actuales (aprobados).
- `../src/datos/supabase.mjs` — el repositorio que habla con Supabase (mismo
  contrato que el de memoria; el agente y la web no cambian).

## Pasos para conectar (una sola vez)

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito sirve).
2. En **SQL Editor**, pega y ejecuta primero `0001_cimarron.sql` y luego `0002_rls.sql`.
   (O con la CLI: `supabase link` y `supabase db push`.)
3. En **Project Settings → API**, copia a tu `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreto, solo servidor)
   - `SUPABASE_ANON_KEY`
4. Siembra los usuarios y la data:
   ```bash
   node scripts/sembrar-supabase.mjs
   ```
   Crea `admin@cimarron.co` y `cliente@cimarron.co` (las contraseñas se imprimen).
5. Cambia el origen y arranca:
   ```
   CIMARRON_ORIGEN_DATOS=supabase
   ```
   ```bash
   node servidor.mjs
   ```

A partir de ahí, el registro de clientes y negocios, la aprobación del admin y
las solicitudes quedan **persistentes** en Postgres, con RLS por rol.

## Roles

| Rol | Cómo se crea | Qué puede |
|---|---|---|
| `cliente` | Registro con nombre + correo o teléfono (+ dirección para domicilios) | Comprar, reservar, agendar; ver sus solicitudes |
| `negocio` | Registro por sector; nace **pendiente** de aprobación | Gestionar su negocio e ítems; ver sus solicitudes |
| `admin` | Sembrado directo en la base | Ver todo; aprobar o rechazar negocios; ver clientes |
