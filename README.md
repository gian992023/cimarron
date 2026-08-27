# CIMARRÓN

**Agente de IA para la cadena productiva y cultural no petrolera de Casanare.**

Plataforma web de tres sectores (Comercio, Turismo y Agropecuario) operada por un agente conversacional que mete al productor al mundo digital hablando, le vende al cliente y firma criptográficamente que lo vendido es auténtico del llano.

Hackathon Regional Casanare · Colombia 5.0 · MinTIC, TEVEANDINA y Universidad Distrital.

---

## Cómo arrancar el localhost (para ver la app y la demo del agente)

Necesitas **Node 20 o superior**. Nada más: sin Docker, sin base de datos, sin build.

```bash
npm install
```

Copia la plantilla de configuración y pon tu llave de la API de Anthropic:

```bash
cp .env.example .env
```

Abre `.env` y llena `ANTHROPIC_API_KEY` (la web funciona sin ella; el chat del agente no).

Levanta el servidor:

```bash
npm start
```

Abre **`http://localhost:8787`** en el navegador.

**Desde el celular:** conéctalo al mismo WiFi del PC y entra a `http://IP-DEL-PC:8787` (mira la IP con `ipconfig`). La interfaz es móvil primero, con navegación inferior tipo app.

---

## Los tres sectores y sus flujos

| Sector | Qué cubre | Flujo |
|---|---|---|
| 🧺 **Comercio** | Tiendas y oficios: artesanía, gastronomía, víveres | **Pedido** con domicilio por geocerca |
| 🌄 **Turismo** | Alojamiento, planes, pasadías, consumibles del plan | **Reserva** con fechas y personas |
| 🐂 **Agro** | Insumos agrícolas/veterinarios y servicios de campo | **Agendamiento** con fecha; servicios a finca usan geocerca |

Regla que unifica todo: **producto → pedido**, **servicio de turismo → reserva**, **servicio agro → agendamiento**.

---

## Qué se puede probar

- **Explorar:** catálogo real de los tres sectores, con buscador y filtros.
- **Asistente IA:** dile qué necesitas ("busco artesanía", "quiero fumigar 15 hectáreas", "soy productor y quiero vender") y el agente lo hace, consultando datos reales. El panel de traza muestra cada herramienta que ejecutó.
- **Sello:** escribe un código `LLA-XXXXXX` y verifica su autenticidad; si alguien alteró el registro, la cadena de hashes lo delata.
- **Mis solicitudes:** consulta pedidos, reservas y agendamientos por teléfono.

---

## El "entrenamiento" del agente: dos archivos editables

El agente no se reentrena. Lee datos por sus herramientas, así que editar estos archivos cambia lo que sabe al instante:

- `src/datos/semillas.mjs` — los negocios y los ítems (aquí va la **información real** de cada registro).
- `src/agente/conocimiento.mjs` — las reglas de cada sector (entran al prompt).

---

## GitHub Pages (versión pública estática)

GitHub Pages solo sirve archivos estáticos, así que **no corre el servidor Node ni el agente de IA** (que necesita la llave secreta, la cual nunca va en una página pública). Para tener una URL pública que sí funcione, se genera una versión estática en `docs/` donde el catálogo, los tres flujos, el pago Bre-B y la verificación de sello corren **en el navegador**:

```bash
npm run build:docs
git add docs && git commit -m "Actualiza demo pública" && git push
```

Pages queda publicado desde la carpeta `/docs` de la rama `main`. La demo conversacional del agente se hace en localhost.

Cuando actualices las semillas con información real, vuelve a correr `npm run build:docs` para que Pages se actualice.

---

## Desplegar el servidor COMPLETO con IA (Render)

Para tener la lógica original (agente de IA incluido) en una URL pública, el proyecto trae `render.yaml`:

1. En [dashboard.render.com](https://dashboard.render.com): **New → Blueprint** → conectar `gian992023/cimarron`.
2. Agregar la variable secreta `ANTHROPIC_API_KEY` en el dashboard.
3. Listo: Render corre `node servidor.mjs` tal cual (proceso persistente, el mock en memoria funciona).

Vercel y Netlify son serverless: cada petición puede caer en una instancia nueva y las solicitudes/sellos creados en vivo se perderían. Serán la opción correcta **cuando los datos pasen a Supabase** (ver hoja de ruta en `CONTEXTO.md`).

Nota del plan gratuito de Render: el servicio se duerme tras ~15 min sin tráfico; abrir la URL unos minutos antes del pitch.

---

## Estructura

```
servidor.mjs              Servidor: interfaz + API REST + agente (solo localhost)
scripts/build-docs.mjs    Genera la versión estática de Pages en /docs
src/
  agente/                 Prompt, conocimiento sectorial, 9 herramientas, bucle de tool use
  servicios/flujo.mjs     Lógica de negocio compartida (agente y REST usan la misma)
  nucleo/                 Lógica pura: geocerca, formato, estados, Sello Llanero
  datos/                  Patrón Repository + semillas (la data editable)
web/                      Interfaz (funciona con servidor y, si hay datos.js, estática)
docs/                     Salida estática para GitHub Pages (generada)
assets/                   QR de Bre-B
```

## Qué se reutilizó

De **Compy** (e-commerce para tiendas de Yopal, backend real en Supabase): geocerca Haversine, formato de moneda, máquina de estados y el patrón Repository. Compy no se modificó: los archivos puros se portaron con su origen anotado.

De **Petraservis**: el patrón de agente con tool use, ya probado en producción.
