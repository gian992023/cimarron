# CIMARRÓN

**Agente de IA para la cadena productiva y cultural no petrolera de Casanare.**

Un solo agente conversacional que atiende los dos extremos de la cadena: mete al productor al mundo digital hablando, le vende al comprador, y firma criptográficamente que lo vendido es auténtico del llano.

Hackathon Regional Casanare · Colombia 5.0 · MinTIC, TEVEANDINA y Universidad Distrital.

---

## Arranque

Necesitas Node 20 o superior. Nada más: sin Docker, sin base de datos, sin paso de compilación.

```bash
npm install
```

Copia la plantilla de configuración y pon tu llave de la API de Anthropic:

```bash
cp .env.example .env
```

Levanta el servidor:

```bash
node servidor.mjs
```

Abre `http://localhost:8787`.

---

## Qué se puede probar en la demo

La interfaz tiene tres pestañas, una por cada tipo de persona que atiende el agente.

**Productor.** Escribe: *"Tejo chinchorros de moriche en Yopal"*. El agente te registra el negocio, publica el producto redactándote él la descripción comercial, te emite el Sello Llanero de origen y te arma el post para redes.

**Comprador.** Escribe: *"Busco artesanía llanera auténtica"*. El agente consulta el catálogo real, calcula si hay cobertura de entrega hasta tu barrio con la fórmula de Haversine, crea el pedido y genera el pago Bre-B con QR, monto exacto y referencia.

**Verificar sello.** Escribe un código `LLA-XXXXXX`. El sistema recalcula el hash del registro y valida el encadenamiento con los demás sellos. Si alguien alteró un carácter, la verificación falla.

El panel derecho muestra en vivo **cada herramienta que el agente ejecutó de verdad**. Ese panel existe para responder la pregunta del jurado: *"¿pueden explicar el mecanismo que hace funcionar su propuesta?"*.

---

## Documentación

| Archivo | Qué contiene |
|---|---|
| `CONTEXTO.md` | Fuente de verdad: el reto, la rúbrica, las decisiones tomadas y el estado del proyecto |
| `ARQUITECTURA.md` | El flujo real paso a paso, el stack completo y los indicadores de impacto. De aquí sale el pitch |
| `assets/README.md` | Dónde va el QR de Bre-B |

---

## Estructura

```
servidor.mjs           Servidor HTTP: sirve la interfaz y expone el agente
src/
  agente/              El agente: prompt, 9 herramientas y bucle de tool use
  nucleo/              Lógica pura: geocerca, formato, estados del pedido, Sello Llanero
  datos/               Patrón Repository: implementación en memoria y contrato para Postgres
web/                   Interfaz de una página, sin build
assets/                QR de Bre-B
```

## Qué se reutilizó

De **Compy** (e-commerce para tiendas de Yopal, con backend real en Supabase): la geocerca Haversine, el formato de moneda colombiana, la máquina de estados del pedido y el patrón Repository. Compy no se modificó: los archivos puros se portaron con su origen anotado en el encabezado.

De **Petraservis**: el patrón de agente con tool use, ya probado en producción.

Construir sobre lo que ya funciona es la razón por la que este prototipo se demuestra corriendo y no en diapositivas.
