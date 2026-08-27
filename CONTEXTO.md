# CONTEXTO.md — Fuente única de verdad del proyecto

> Léelo completo antes de tocar código. Este archivo reemplaza cualquier suposición.
>
> **Proyecto:** CIMARRÓN · **Evento:** Hackathon Regional Casanare (Colombia 5.0, MinTIC + TEVEANDINA + Universidad Distrital)
> **Fechas:** 27 y 28 de agosto de 2026 · Unitrópico, Yopal · **Estado:** base técnica armada, pendiente QR Bre-B real

---

## 1. El reto (textual, de la carta oficial)

**"Casanare Diversifica: Agentes de IA para la Cadena Productiva y Cultural del Llano."**

Diseñar y desarrollar un agente de IA que actúe como **facilitador autónomo de un eslabón real** de la cadena productiva **no petrolera** de Casanare, desde la producción hasta la venta o la experiencia final del cliente, haciendo ese negocio más competitivo, visible o rentable. Cuando el reto lo amerite, integrar **blockchain** para certificar origen, autenticidad cultural o sostenibilidad.

### Capacidades técnicas exigidas y dónde las cumplimos

| Exigencia de la carta | Dónde se cumple en CIMARRÓN |
|---|---|
| Agente de IA conversacional o flujo de automatización sobre un eslabón real | Agente con 9 herramientas reales sobre Claude Opus 5 (`src/agente/`) |
| Integración con canales digitales de venta o reserva (WhatsApp Business, redes, Nequi, **Bre-B**) | Pago por **llave Bre-B con QR** (`generar_pago_breb`) + salida a WhatsApp por `wa.me` |
| Módulo de trazabilidad o certificación blockchain | **Sello Llanero**: cadena de hashes SHA-256 verificable (`src/nucleo/sello.mjs`) |
| Visibilidad y posicionamiento digital con contenido generado por IA | `generar_contenido_promo` (post listo para redes) |

### Entregables obligatorios

1. **Solución tecnológica**: prototipo funcional que evidencie cómo opera.
2. **Pitch de 5 minutos**: problemática, solución, impacto en Casanare, viabilidad con actores de la región.

### Rúbrica (pesos) y cómo la atacamos

| # | Criterio | Peso | Nuestra jugada |
|---|---|---|---|
| 1 | Pertinencia Territorial | **25%** | Yopal es territorio ya trabajado (Compy). Datos, actores y sectores reales, no genéricos. |
| 2 | Innovación y Creatividad | 20% | La IA es el motor, no un adorno. El giro: **un solo agente opera tres sectores con tres flujos distintos** (pedido, reserva, agendamiento) y atiende los dos lados de la cadena, emitiendo el sello de autenticidad en el mismo flujo. |
| 3 | Viabilidad Técnica | 20% | Corre en un portátil sin Docker ni build. Modo memoria = demo garantizada sin conectividad a base de datos. |
| 4 | Impacto Potencial | 20% | Indicadores concretos definidos en `ARQUITECTURA.md` §7. |
| 5 | Presentación y Comunicación | 15% | Flujo explicable paso a paso, sin cajas negras. |

**Nota crítica de la rúbrica:** si la IA no es el componente central, el criterio de Innovación queda topado en 50 puntos. Por eso el agente es el producto, no una función lateral.

---

## 2. Qué es CIMARRÓN

**CIMARRÓN es la plataforma web de la cadena productiva no petrolera de Casanare, operada por un agente de IA.** Es la evolución del modelo de Compy (e-commerce de tiendas de Yopal) llevada a los **tres sectores priorizados en la propia carta del reto** ("el comercio, el turismo, los servicios y la cultura llanera"):

| Sector | Qué cubre | Flujo propio |
|---|---|---|
| 🧺 **Comercio** | Tiendas y oficios: artesanía, gastronomía, víveres | **Pedido** con domicilio por geocerca (el modelo Compy original; el domiciliario existe solo aquí) |
| 🌄 **Turismo** | Alojamiento (hotel y hato), planes, pasadías y consumibles del plan | **Reserva** con fechas y personas (el eslabón completo: desde dónde dormir hasta la experiencia) |
| 🐂 **Agro** | Insumos agrícolas/veterinarios y servicios de campo: fumigación, inseminación, esterilización, consulta en finca | **Agendamiento** con fecha; si el servicio va a la finca, aplica la geocerca de cobertura |

La regla que unifica los tres: **todo ítem es `producto` o `servicio`**. Producto → pedido (en cualquier sector). Servicio de turismo → reserva. Servicio agro → agendamiento. Un servicio es `en_sitio` (el cliente va) o `a_domicilio` (el negocio va a la casa o finca, con radio de cobertura).

El agente opera los dos extremos: al **productor** lo registra hablando, le redacta la descripción, le emite el **Sello Llanero** y le arma el contenido para redes; al **cliente** le consulta, valida cobertura, crea la solicitud correcta y le genera el **pago Bre-B**. La web (móvil primero) permite hacer lo mismo con clics: dos puertas, una sola lógica.

El nombre es llanero: *cimarrón* es el ganado que anda libre, sin marca. El proyecto le pone marca verificable a lo que hoy anda suelto y sin certificar.

### El problema real que ataca

El productor no petrolero de Casanare tiene tres cuellos de botella al mismo tiempo:

1. **No está en digital.** Vender implica saber armar catálogo, redactar, fotografiar y publicar. Es una barrera de alfabetización digital, no de voluntad.
2. **No puede probar que su producto es del llano.** Sin certificación de origen, la artesanía llanera compite contra imitación industrial y pierde por precio.
3. **Cobrar es fricción.** Efectivo o transferencia informal, sin trazabilidad ni referencia.

CIMARRÓN colapsa los tres en una sola conversación.

---

## 3. Decisiones tomadas (y por qué)

| Decisión | Justificación | Alternativa descartada |
|---|---|---|
| **JavaScript ESM puro (`.mjs`), sin build** | Arranca con `node servidor.mjs` en 5 segundos. En hackathon, un paso de compilación es un riesgo de demo. | TypeScript con bundler |
| **Servidor Node local como runtime primario** | No exige Docker ni CLI de Supabase. La demo no depende de desplegar nada. | Edge Function como único runtime |
| **Patrón Repository con dos implementaciones** | Portado de Compy, donde ya está validado en producción. `memoria` para la demo, `supabase` para escalar. Cambiar de una a otra es una variable de entorno. | Acceso directo a la base desde las herramientas |
| **Lógica pura portada, no importada** | Compy **no se toca ni se modifica**. Copiamos los archivos puros (geocerca, formato, estados) a `src/nucleo/`, con su origen anotado en el encabezado. | Monorepo o dependencia entre proyectos |
| **Blockchain como cadena de hashes propia + adaptador de anclaje** | Es blockchain real y verificable (cada sello encadena el hash del anterior), corre sin billetera ni gas, y el adaptador deja lista el anclaje en cadena pública. Honesto y demostrable. | Contrato en testnet como única vía (riesgo de red y llaves en vivo) |
| **Claude Opus 5 con tool use** | El agente no responde texto: ejecuta herramientas contra datos reales. Es lo que separa "chatbot" de "agente". | Prompt sin herramientas |
| **Bre-B por QR estático de llave + referencia** | Es exactamente el flujo que pide la carta y funciona desde Nequi, Bancolombia o cualquier banco. Sin integración de pasarela. | Pasarela (Wompi) que exige comercio registrado |

---

## 4. Qué se reutiliza de Compy (y qué no)

**Compy** (`C:\migracion\Proyectos_Propios\Compy`) es el e-commerce móvil para tiendas de Yopal, con backend real en Supabase. **No se modifica en absoluto.** De ahí tomamos lo que ya está probado:

| Pieza tomada | Archivo destino | Qué aporta |
|---|---|---|
| Geocerca Haversine | `src/nucleo/geocerca.mjs` | Decide si hay cobertura de entrega. Lógica pura, ya testeada. |
| Formato COP y distancias | `src/nucleo/formato.mjs` | `12500 → "$ 12.500"`, `1.2 → "1,2 km"`. Sin `Intl`. |
| Máquina de estados del pedido | `src/nucleo/estadosPedido.mjs` | Transiciones válidas del pedido. |
| Generador de IDs | `src/nucleo/id.mjs` | IDs legibles con prefijo. |
| **Patrón Repository** (la decisión, no el código) | `src/datos/` | Permite demo en memoria y producción en Supabase con el mismo agente. |

**Lo que NO se toma:** la app React Native, los repositorios de Supabase de Compy, Wompi, la facturación DIAN, los roles de Compy. CIMARRÓN es un proyecto nuevo con su propio dominio.

**Qué se reutiliza de Petraservis** (`C:\migracion\Proyectos_Propios\Petraservis`): el patrón de agente con tool use de `supabase/functions/chat-ia/index.ts`, ya probado en producción. El bucle, la separación de herramientas y el principio de que la API key nunca toca el navegador vienen de ahí.

---

## 5. Estado actual

**Hecho:**
- Plataforma web de tres sectores (Comercio / Turismo / Agro) con los tres flujos: pedido, reserva y agendamiento. Móvil primero, sin build.
- El "entrenamiento" del agente en dos archivos editables: `src/datos/semillas.mjs` (9 negocios, 19 ítems reales de ejemplo) y `src/agente/conocimiento.mjs` (reglas de cada sector, entran al prompt). Editar esos archivos reentrena al agente al instante, sin tocar código.
- Capa de servicios compartida (`src/servicios/flujo.mjs`): la misma lógica sirve al agente y a los endpoints REST de la web; nunca se desincronizan.
- Agente con 9 herramientas y bucle de tool use sobre Claude Opus 5.
- Sello Llanero con cadena sembrada desde el arranque (3 sellos: chinchorro, queso, safari) y verificador público en la web.
- Verificado de punta a punta: los 3 flujos con sus validaciones por tipo, avisos de cobertura (Haversine), pago Bre-B con referencia única, y verificación del sello desde la interfaz real.

**Pendiente:**
1. **QR de la llave Bre-B** (lo entrega Gian). Va en `assets/qr-breb.png` y la llave en `.env`. Ver `assets/README.md`.
2. `ANTHROPIC_API_KEY` en `.env` (sin ella la web funciona; el chat del agente no).
3. Sustituir las semillas por **negocios reales de Casanare** con nombre y contacto verificados (editar `src/datos/semillas.mjs`). Es lo que sube Pertinencia Territorial (25%) de "Bueno" a "Excelente".
4. Guion del pitch de 5 minutos.
5. Opcional: anclaje del sello en cadena pública y WhatsApp Business Cloud API.

---

## 6. Cómo se corre

```bash
npm install
cp .env.example .env   # y llenar ANTHROPIC_API_KEY
node servidor.mjs
```

Abre `http://localhost:8787`. Sin base de datos, sin Docker, sin build.

---

## 7. Relacionados

- `ARQUITECTURA.md`: el flujo real paso a paso, el stack y los indicadores de impacto. Es el documento del que sale el pitch.
- `README.md`: arranque rápido.
- `assets/README.md`: dónde va el QR de Bre-B.
