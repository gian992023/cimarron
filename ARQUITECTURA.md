# ARQUITECTURA.md — Flujo real, explicable

> Este documento existe porque la rúbrica pregunta explícitamente: *"¿El equipo puede explicar el mecanismo creativo que hace funcionar su propuesta?"* y *"¿El prototipo funciona? ¿Pudieron demostrarlo?"*. Aquí está la respuesta, sin cajas negras.

---

## 1. Vista general

```
   PRODUCTOR                        COMPRADOR                    CUALQUIERA
   (artesano, cocinera,             (turista, comprador          (verifica un
    guía, finca)                     local, mayorista)            sello por QR)
        │                                 │                           │
        └────────────┬────────────────────┘                           │
                     ▼                                                ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  INTERFAZ WEB  ·  una página, sin build  ·  web/               │
        └────────────────────────────┬───────────────────────────────────┘
                                     │  POST /api/agente { mensajes: [...] }
                                     ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  SERVIDOR  ·  servidor.mjs  (Node ESM)                          │
        │  Único lugar donde vive ANTHROPIC_API_KEY. Nunca va al navegador.│
        └────────────────────────────┬───────────────────────────────────┘
                                     ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  AGENTE  ·  src/agente/                                         │
        │  Claude Opus 5 + bucle de tool use (máx. 8 vueltas)             │
        │                                                                 │
        │   ┌──────────────────── 9 HERRAMIENTAS ────────────────────┐    │
        │   │ CATÁLOGO      consultar_catalogo                       │    │
        │   │ PRODUCCIÓN    registrar_negocio · publicar_producto    │    │
        │   │ LOGÍSTICA     evaluar_cobertura   ← geocerca de Compy  │    │
        │   │ VENTA         crear_pedido · generar_pago_breb         │    │
        │   │ CERTIFICACIÓN certificar_origen · verificar_sello      │    │
        │   │ PROMOCIÓN     generar_contenido_promo                  │    │
        │   └────────────────────────────────────────────────────────┘    │
        └────────────────────────────┬───────────────────────────────────┘
                                     ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  DATOS  ·  src/datos/  ·  patrón Repository (portado de Compy) │
        │    memoria.mjs   → demo, semillas de Casanare, cero dependencias│
        │    supabase.mjs  → producción, Postgres + RLS                   │
        │  Se cambia con una variable de entorno. El agente no se entera. │
        └────────────────────────────────────────────────────────────────┘
```

**La idea de una sola frase:** un agente que habla con el productor para meterlo al mundo digital, habla con el comprador para venderle, y firma criptográficamente que lo vendido es auténtico del llano.

---

## 2. El mecanismo: qué hace que esto sea un agente y no un chatbot

Un chatbot genera texto. Un agente **decide qué herramienta ejecutar, la ejecuta contra datos reales, lee el resultado y decide el siguiente paso**. El bucle está en `src/agente/index.mjs`:

```
1. Se envía a Claude: el historial + el catálogo de 9 herramientas.
2. Claude responde con stop_reason = "tool_use" e indica cuál usar y con qué argumentos.
3. El servidor ejecuta esa herramienta de verdad (consulta datos, calcula geocerca, firma un hash).
4. El resultado vuelve a Claude como tool_result.
5. Claude lee el resultado y decide: ¿otra herramienta, o ya respondo?
6. Se repite hasta stop_reason = "end_turn" (tope de 8 vueltas).
```

Consecuencia práctica que el jurado puede comprobar en vivo: **el agente no puede inventar un precio, un stock ni un código de sello**, porque el prompt le prohíbe responder sin consultar y los datos salen de la capa de datos, no del modelo.

---

## 3. Los tres recorridos que se demuestran

### Recorrido A · El productor entra al mundo digital (eslabón: producción y promoción)

| Paso | Lo que dice la persona | Lo que hace el agente |
|---|---|---|
| 1 | "Soy Ana, tejo chinchorros en Yopal" | `registrar_negocio` crea el negocio con sector, ubicación y radio de entrega |
| 2 | "Un chinchorro de moriche, me demoro dos semanas, lo vendo en 180 mil" | `publicar_producto` crea el producto **y redacta la descripción comercial** |
| 3 | (automático) | `certificar_origen` emite el **Sello Llanero** y devuelve el código verificable |
| 4 | "Necesito publicarlo" | `generar_contenido_promo` entrega el post listo para Facebook, Instagram o WhatsApp |

Ana pasó de no estar en internet a tener catálogo, descripción, certificado de origen y contenido promocional, **hablando**. No llenó un formulario.

### Recorrido B · El comprador compra y paga (eslabón: comercialización y logística)

| Paso | Lo que dice la persona | Lo que hace el agente |
|---|---|---|
| 1 | "Busco artesanía llanera auténtica" | `consultar_catalogo` trae productos reales con precio real |
| 2 | "Me interesa el chinchorro, estoy en el barrio El Triunfo" | `evaluar_cobertura` calcula la distancia con **Haversine** y dice si hay entrega |
| 3 | "Lo llevo" | `crear_pedido` crea el pedido con número legible y estado inicial |
| 4 | (automático) | `generar_pago_breb` devuelve **QR de la llave Bre-B + monto exacto + referencia** |
| 5 | El comprador escanea desde Nequi o Bancolombia y paga | El agente entrega el código del Sello para verificar autenticidad |

### Recorrido C · Cualquiera verifica el sello (eslabón: confianza)

Se escribe el código `LLA-XXXXXX` en el verificador. El sistema recalcula el hash del registro y lo compara con el guardado, y valida el encadenamiento con el sello anterior. Si alguien alteró un solo carácter del origen, la verificación falla. Esa es la certificación de autenticidad cultural que pide la carta.

---

## 4. El Sello Llanero: qué es exactamente el blockchain aquí

Evitamos el humo. Esto es lo que hay:

Cada certificación es un registro en un **libro de solo-anexado (append-only)** donde:

```
hash_n = SHA-256( JSON canónico del sello_n  +  hash_{n-1} )
```

- Cada sello **incluye el hash del sello anterior**. Eso es literalmente lo que hace que una cadena de bloques sea una cadena.
- Alterar el sello 5 cambia su hash, lo que rompe el sello 6, que rompe el 7, y así hasta el final. **La manipulación es detectable sin confiar en nadie**: se recalcula la cadena y se compara.
- El primer sello ancla en un hash génesis fijo.

**Por qué así y no un contrato en testnet:** un contrato exige billetera, gas y red estable en el sitio. La cadena de hashes se verifica sola, offline, y no puede fallar en la demo. El anclaje en cadena pública queda como **adaptador enchufable** (`src/nucleo/sello.mjs` → `anclarEnCadenaPublica`): en producción se publica periódicamente la raíz de la cadena en Polygon, y con eso se hereda la inmutabilidad de una cadena pública sin pagar una transacción por sello. Es la arquitectura que usan los sistemas de notarización reales.

Al jurado se le dice exactamente esto. Es más fuerte que decir "usamos blockchain" sin poder explicarlo.

---

## 5. Stack tecnológico (respuesta directa a "¿qué tecnologías manejan?")

| Capa | Tecnología | Por qué esta |
|---|---|---|
| Modelo de IA | **Claude Opus 5** (`claude-opus-5`) vía API de Anthropic | Tool use nativo y confiable, que es lo que convierte esto en agente |
| Razonamiento | Thinking adaptativo (`thinking: {type:"adaptive"}`) + `effort` configurable | El modelo decide cuánto razonar; bajamos el esfuerzo para que el chat responda rápido en la demo |
| SDK | `@anthropic-ai/sdk` (oficial) | Tipos y manejo de errores del proveedor, sin HTTP a mano |
| Runtime | **Node.js 20+**, ESM puro (`.mjs`), sin build | Arranca en segundos en cualquier portátil del equipo |
| Servidor | `node:http` de la librería estándar | Cero dependencias de framework, cero superficie de fallo |
| Interfaz | HTML + CSS + JavaScript vanilla | Sin npm run build, sin bundler. Funciona abriendo el navegador |
| Capa de datos | Patrón **Repository** con dos implementaciones | Demo en memoria; producción en Postgres. Portado de Compy |
| Base de datos (producción) | **Supabase**: Postgres + RLS + Storage | Ya validado en Compy con el mismo tipo de negocio |
| Geolocalización | **Haversine** puro (portado de Compy) | Cobertura de entrega sin SDK de mapas ni costo por consulta |
| Criptografía | **SHA-256** (`node:crypto`) | Cadena de hashes del Sello Llanero |
| Pagos | **Bre-B** por llave con QR estático | Lo pide la carta; funciona desde cualquier banco del país |
| Canal | WhatsApp por enlace `wa.me` (fase 1), WhatsApp Business Cloud API (fase 2) | La fase 1 no necesita aprobación de Meta y ya sirve para el pitch |

---

## 6. Restricciones del territorio que sí consideramos

La rúbrica pregunta: *"¿Qué pasa si hay baja conectividad o no hay dispositivos de alta gama?"*. Respuestas concretas:

| Restricción real en Casanare | Cómo la absorbe el diseño |
|---|---|
| Conectividad intermitente en zona rural | La interfaz es una página estática de pocos KB. La única llamada de red es el mensaje al agente. Sin video, sin framework pesado. |
| El productor no tiene computador, solo celular gama baja | La interfaz es web responsive; el canal objetivo es WhatsApp, que ya está instalado y consume pocos datos. |
| El productor no sabe llenar formularios | No hay formulario. Se habla. Esa es la razón de ser del agente. |
| No hay quien administre un servidor en el municipio | Supabase es gestionado. Nadie de la región tiene que operar infraestructura. |
| Costo de operación | El costo por conversación es de centavos. No hay licencias ni mensualidad de pasarela. |

---

## 7. Indicadores de impacto (para el criterio de Impacto Potencial, 20%)

La rúbrica pide *"indicadores concretos"*. Se proponen estos, medibles desde el propio sistema:

| Indicador | Cómo se mide | Meta piloto (90 días) |
|---|---|---|
| Negocios no petroleros digitalizados | Conteo de `negocios` creados por el agente | 50 en Yopal |
| Tiempo de un productor hasta su primer producto publicado | Marca de tiempo entre `registrar_negocio` y `publicar_producto` | Menos de 10 minutos |
| Productos con certificación de origen | Conteo de sellos emitidos | 300 |
| Verificaciones de sello por compradores | Consultas a `verificar_sello` | 500 |
| Pedidos con pago Bre-B trazado | Pedidos con referencia de pago generada | 200 |
| Ingreso adicional atribuible | Suma de pedidos cerrados por el canal | Medible por negocio |

**Escalabilidad:** el sector y el territorio son datos, no código. Cambiar las semillas y el prompt replica el sistema en otro municipio o en otra cadena productiva. La arquitectura no cambia.

---

## 8. Qué falta y se dice honestamente

- El anclaje del sello en cadena pública está diseñado y aislado tras un adaptador, pero en la demo corre la cadena de hashes local.
- WhatsApp opera por enlace `wa.me`; la Cloud API exige verificación de negocio con Meta.
- Las semillas de negocios son ilustrativas hasta que se reemplacen por actores reales validados en el evento.

Decir esto en el pitch suma. La rúbrica premia *"respuestas directas, honestas y fundamentadas"*.
