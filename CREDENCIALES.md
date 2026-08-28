# CIMARRÓN — Credenciales de acceso (demo)

Estas cuentas están sembradas en la base de datos real (Supabase) para el pitch.
El login es por **correo + contraseña** (la lógica valida la contraseña contra
la tabla `perfiles`). También aparecen en la pantalla de "Iniciar sesión".

| Rol | Correo | Contraseña | Qué ve al entrar |
|-----|--------|------------|------------------|
| **Administrador** | `admin@cimarron.co` | `Cimarron.Admin.2026` | Panel: aprueba/rechaza negocios, ve clientes y el resumen de la plataforma |
| **Cliente** | `cliente@cimarron.co` | `Cimarron.Cliente.2026` | Su perfil con favoritos y sus solicitudes (pedidos/reservas/agendamientos) |
| **Negocio** | `negocio@cimarron.co` | `Cimarron.Negocio.2026` | Su negocio (Crocante Yopal Restaurante) con sus ítems y las solicitudes recibidas |

## Cómo funciona el ingreso (real)

1. En la web → **Cuenta** → pestaña **Iniciar sesión**.
2. Escribe el correo (o teléfono) y la contraseña → `POST /api/login`.
3. El servidor busca el usuario en `perfiles` y valida la contraseña.
4. La sesión se guarda en el navegador (`localStorage`) y se envía en cada
   petición como cabecera `x-usuario-id`.
5. Según el rol, la vista **Cuenta** carga el perfil desde `GET /api/perfil`:
   - cliente → favoritos + solicitudes
   - negocio → sus negocios (con ítems) + solicitudes recibidas
   - admin → resumen + acceso al panel

## Registro de nuevos usuarios

- **Cliente**: nombre, correo o teléfono, dirección de residencia, **ciudad
  (debe ser un municipio de Casanare)**, teléfono de contacto y contraseña.
- **Negocio**: nombre, sector, responsable, municipio, categoría; nace
  **pendiente** hasta que el administrador lo aprueba.

## Contacto

Todos los botones "Contactar por WhatsApp" (cliente ↔ negocio, y el
administrador) enrutan al número **313 306 6149** (`wa.me/573123066149`).

> Nota: son cuentas de demostración. Cambia las contraseñas antes de un uso real
> corriendo el seed con otros valores en `scripts/sembrar-supabase.mjs`.
