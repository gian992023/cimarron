# CONTEXTO MAESTRO — CIMARRÓN (handoff)

> **Léelo completo antes de tocar nada.** Es el punto de continuación del proyecto.
> Fecha del handoff: 28 de agosto de 2026. Autor del proyecto: Gian (gian992023).
> Documentos de apoyo en esta misma carpeta: `CONTEXTO.md`, `ARQUITECTURA.md`,
> `README.md`, `supabase/README.md`. Este archivo manda sobre los demás si hay dudas.

---

## 0. En una frase

CIMARRÓN es una **plataforma web (móvil primero) operada por un agente de IA** que
conecta los negocios no petroleros de Casanare (Comercio, Turismo, Agro) con sus
clientes. Es para la **Hackathon Regional Casanare (Colombia 5.0)**. Reto: *Casanare
Diversifica: agentes de IA para la cadena productiva y cultural del llano*.

---

## 1. Estado actual (qué funciona HOY)

Corre en localhost (`node servidor.mjs`) y en GitHub Pages estático. **Verificado.**

- **Data real de Casanare** (ingerida del Drive de Gian, limpia): 100 comercios + 100
  hoteles reales con imagen/dirección/teléfono/rating, + curados con Sello. Agro son
  3 servicios curados reales (la data de insumos no traía coordenadas → pendiente).
  Total: **206 negocios, 214 ítems, 3 sellos**.
- **Vitrina + hoja del negocio**: se toca un negocio y se abre SU vista real (foto,
  datos, badges de entrega/pago, sus productos/servicios). El pedido/reserva se hace
  desde ahí.
- **Tres sectores, tres flujos**: comercio→pedido (domicilio/recoger + geocerca),
  turismo→reserva (fechas/personas), agro→agendamiento.
- **Pago**: QR Bre-B (recortado, solo el código) + referencia única; contra entrega
  solo en comercio. El QR real está en `assets/qr-breb.png`.
- **Mapa** Leaflet+OSM de Casanare: clic en un negocio → su hoja.
- **Sello Llanero**: cadena de hashes SHA-256, verificable, detecta manipulación.
- **Cuentas (3 roles) funcionando en memoria**: registro de cliente (correo/tel +
  dirección), registro de negocio por sector (nace **pendiente**), login, y **panel
  de admin** que aprueba/rechaza negocios y ve clientes. Usuarios sembrados:
  `admin@cimarron.co` y `cliente@cimarron.co`.
- **Agente de IA** (Claude Opus 5, tool use, 9 herramientas) listo, con doble auth
  (`ANTHROPIC_API_KEY` **o** `CLAUDE_CODE_OAUTH_TOKEN`). **Falta la credencial en `.env`
  para que responda** (ver §5).

**URLs:** repo `https://github.com/gian992023/cimarron` · Pages
`https://gian992023.github.io/cimarron/`

---

## 2. EL PASO CRÍTICO QUE SIGUE (infra con los conectores)

En la sesión del handoff quedaron disponibles los conectores de **Render, GitHub y
Supabase (MCP)**. El objetivo de Gian es **montar la infra real** para que el registro
persista y el agente funcione en una URL pública. Orden recomendado:

### A) Supabase (base de datos real) — todo está construido, falta conectar
El esquema, las migraciones, el repositorio y el seed **ya existen**. Con el conector
de Supabase (herramientas `mcp__…__create_project`, `apply_migration`, `execute_sql`,
`get_project_url`, `get_publishable_keys`):
1. `list_organizations` / `create_project` (región cercana, nombre "cimarron").
2. `apply_migration` con el contenido de `supabase/migrations/0001_cimarron.sql` y luego
   `0002_rls.sql`.
3. Crear los usuarios sembrados: correr `node scripts/sembrar-supabase.mjs` (necesita
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en `.env`), o replicar su lógica con
   `execute_sql` + la Admin API. Carga admin+cliente y los 206 negocios/ítems/sellos.
4. En `.env`: `CIMARRON_ORIGEN_DATOS=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_ANON_KEY`. El selector `src/datos/index.mjs` ya cambia solo.
   Guía detallada: `supabase/README.md`.

### B) Render (servidor completo con el agente en URL pública)
Con el conector de Render (`mcp__…__create_web_service`, `update_environment_variables`,
`trigger_deploy`) o el `render.yaml` que ya está en la raíz:
1. `create_web_service` desde el repo `gian992023/cimarron`, build `npm install`,
   start `node servidor.mjs`.
2. Variables de entorno: `ANTHROPIC_API_KEY` (o `CLAUDE_CODE_OAUTH_TOKEN`),
   `CIMARRON_ORIGEN_DATOS=supabase` + las de Supabase.
3. Al desplegar, el agente + cuentas quedan en una URL pública. Nota: plan free se
   duerme a los ~15 min; abrir antes del pitch.

### C) GitHub Pages (ya está) — la vitrina estática pública
Ya publicada. Cuando cambie la data: `npm run build:docs && git push`. Si se quiere que
el **asistente** funcione en Pages, apuntar `docs/datos.js → config.apiBase` a la URL de
Render (el código de `app.js` ya lo soporta).

---

## 3. Mapa de archivos (dónde está cada cosa)

```
servidor.mjs              Servidor: interfaz + API REST + agente + cuentas.
scripts/
  build-docs.mjs          Genera /docs (Pages) desde la data. npm run build:docs
  importar-drive.mjs      Limpia la data real del Drive → src/datos/generado.mjs
  importar-datos.mjs      Ingesta genérica de CSV con validación (npm run importar)
  sembrar-supabase.mjs    Crea admin+cliente y carga la data en Supabase
src/
  agente/                 prompt, conocimiento sectorial, 9 herramientas, bucle tool-use
  servicios/
    flujo.mjs             Lógica compartida (catálogo, solicitudes, pago, sello)
    cuentas.mjs           Registro (cliente/negocio), login, panel admin
  nucleo/                 geocerca (Haversine), formato, estados, sello, taxonomía (19
                          municipios + 8 categorías comercio)
  datos/                  Patrón Repository: interfaces + memoria + supabase + fuente +
                          semillas + generado (data real importada)
web/                      Interfaz (app.js dual: servidor o estático). index/estilos/app
docs/                     Salida estática para GitHub Pages (generada; no editar a mano)
supabase/                 migrations/0001 + 0002 + README (guía de conexión)
datos_recolectada/drive/  CSV reales (comercio, turismo, agro) fuente de la ingesta
assets/qr-breb.png        QR Bre-B recortado (solo el código)
entregables/              Word (proyecto+pitch) y Excel (todo a escala) para el jurado
```

**Regla de oro del diseño:** el agente y la web usan la MISMA capa (`flujo.mjs`) y el
MISMO contrato de datos (`src/datos/interfaces.mjs`). Cambiar memoria↔supabase es una
variable de entorno; el agente y la UI no se enteran.

---

## 4. Cómo correr en local

```bash
npm install
cp .env.example .env      # y llenar credenciales (ver §5)
node servidor.mjs         # autoPort: si 8787 está ocupado toma otro
```
Datos de prueba de cuentas: `admin@cimarron.co` (panel admin) y `cliente@cimarron.co`.

---

## 5. El agente: qué falta para que responda

El agente NO responde hasta que en `.env` haya UNA credencial:
- `ANTHROPIC_API_KEY=...`  (API de pago), **o**
- `CLAUDE_CODE_OAUTH_TOKEN=...`  (plan de Claude, $0; se genera con `claude setup-token`).

Sin eso, la web funciona completa pero el chat del asistente devuelve error pidiendo la
credencial. Es el ÚNICO bloqueo del agente. El modelo por defecto es `claude-opus-5`.

---

## 6. Pendientes (priorizados)

1. **Conectar Supabase y Render** (§2) — es el paso que Gian quiere dar con los conectores.
2. **Poner la credencial del agente** (§5) para que el asistente responda.
3. **Data agro con coordenadas** (la de insumos no sirve para el mapa; agro está en 3).
4. **Feedback del DevOps** aún sin hacer: logo, corregir ortografía de descripciones,
   manual de uso, número de contacto visible, destacar más el Sello (anti-estafa).
5. **Pitch**: el Word y el Excel ya están en `entregables/`; falta ensayar y poner el
   nombre real del equipo (no aparecía en el correo de inscripción).

---

## 7. Decisiones ya tomadas (no re-litigar)

- Node ESM puro, sin build ni Docker (arranque en segundos = menos riesgo de demo).
- Patrón Repository con memoria (demo garantizada) y Supabase (producción).
- Blockchain = cadena de hashes propia verificable (honesta), anclaje en cadena pública
  detrás de un adaptador. Se le explica así al jurado.
- Pago por Bre-B con QR (sin pasarela; funciona desde cualquier banco). Contra entrega
  solo en comercio.
- Se reutiliza lógica probada de Compy (geocerca, formato, estados, Repository) y el
  patrón de agente de Petraservis. Esos proyectos NO se modifican.
