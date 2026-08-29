// EL AGENTE — bucle de tool use con proveedor de IA CONMUTABLE.
//
// Igual que la capa de datos cambia memoria↔supabase con una variable, aquí el
// "cerebro" cambia claude↔ollama con CIMARRON_IA, sin tocar la web ni las
// herramientas. Ambos proveedores exponen el MISMO conversar(mensajes).
//
//   CIMARRON_IA=claude  (por defecto) → API de Anthropic (nube, de pago/plan).
//   CIMARRON_IA=ollama                → modelo LOCAL vía Ollama ($0), ej. qwen2.5:7b.
//                                       Requiere OLLAMA_URL (por defecto localhost:11434).
//
// El patrón de tool use es el mismo en los dos: se envían mensajes + herramientas,
// el modelo pide una herramienta, el servidor la ejecuta DE VERDAD, y el resultado
// vuelve hasta que el modelo cierra el turno. La `traza` muestra lo que hizo.

import Anthropic from '@anthropic-ai/sdk';
import { HERRAMIENTAS, ejecutarHerramienta } from './herramientas.mjs';
import { construirPrompt } from './prompt.mjs';

const MAX_VUELTAS = 8;

/** Proveedor de IA activo. */
export function proveedorIA() {
  return (process.env.CIMARRON_IA || 'claude').toLowerCase();
}

// Dos formas de autenticar Claude (la que pongas en .env):
//   1. ANTHROPIC_API_KEY        → API de pago por uso.
//   2. CLAUDE_CODE_OAUTH_TOKEN  → tu plan de Claude, $0 (patrón NEXO).
// Con CIMARRON_IA=ollama no se necesita credencial (corre local).
export function metodoAuth() {
  if (proveedorIA() === 'ollama') return 'ollama';
  if (process.env.ANTHROPIC_API_KEY) return 'api_key';
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN) return 'oauth';
  return null;
}

/** Etiqueta del modelo activo, para /api/estado. */
export function modeloActivo() {
  if (proveedorIA() === 'ollama') return `${process.env.OLLAMA_MODELO || 'qwen2.5:7b'} (ollama local)`;
  return process.env.CIMARRON_MODELO || 'claude-haiku-4-5';
}

/* ================================================================ */
/* Proveedor CLAUDE (Anthropic)                                     */
/* ================================================================ */

let clienteAnthropic = null;
function anthropic() {
  if (clienteAnthropic) return clienteAnthropic;
  const metodo = metodoAuth();
  if (metodo === 'api_key') {
    clienteAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } else if (metodo === 'oauth') {
    clienteAnthropic = new Anthropic({
      authToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  } else {
    throw new Error(
      'Falta credencial de Claude. En .env pon ANTHROPIC_API_KEY (pago) o ' +
        'CLAUDE_CODE_OAUTH_TOKEN (tu plan, $0), o cambia a CIMARRON_IA=ollama (local, $0).',
    );
  }
  return clienteAnthropic;
}

// Las familias 4.6+/5 aceptan thinking adaptativo + output_config.effort.
// Haiku 4.5 (y anteriores) los RECHAZAN con 400, así que no se envían.
function soportaAdaptivo(modelo) {
  return /(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable-5|mythos)/.test(modelo);
}

function paramsClaude(mensajes) {
  const modelo = process.env.CIMARRON_MODELO || 'claude-haiku-4-5';
  const base = {
    model: modelo,
    max_tokens: 8000,
    system: construirPrompt(),
    tools: HERRAMIENTAS,
    messages: mensajes,
  };
  if (soportaAdaptivo(modelo)) {
    base.thinking = { type: 'adaptive' };
    base.output_config = { effort: process.env.CIMARRON_ESFUERZO || 'medium' };
  }
  return base;
}

async function conversarClaude(mensajes) {
  const api = anthropic();
  const historial = [...mensajes];
  const traza = [];

  let respuesta = await api.messages.create(paramsClaude(historial));

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (respuesta.stop_reason !== 'tool_use') break;
    historial.push({ role: 'assistant', content: respuesta.content });

    const resultados = [];
    for (const bloque of respuesta.content) {
      if (bloque.type !== 'tool_use') continue;
      const salida = await ejecutarHerramienta(bloque.name, bloque.input);
      traza.push({ herramienta: bloque.name, entrada: bloque.input, exito: !salida?.error });
      resultados.push({
        type: 'tool_result',
        tool_use_id: bloque.id,
        content: JSON.stringify(salida),
        ...(salida?.error ? { is_error: true } : {}),
      });
    }
    historial.push({ role: 'user', content: resultados });
    respuesta = await api.messages.create(paramsClaude(historial));
  }

  historial.push({ role: 'assistant', content: respuesta.content });
  const texto = respuesta.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { respuesta: texto || RESPUESTA_VACIA, mensajes: historial, traza };
}

/* ================================================================ */
/* Proveedor OLLAMA (modelo local, ej. qwen2.5:7b, $0)              */
/* ================================================================ */

const ollamaUrl = () => (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const ollamaModelo = () => process.env.OLLAMA_MODELO || 'qwen2.5:7b';

// Convierte las herramientas (formato Anthropic) al formato de funciones que
// entienden Ollama/OpenAI. input_schema ya es un JSON Schema válido.
function herramientasOpenAI() {
  return HERRAMIENTAS.map((h) => ({
    type: 'function',
    function: { name: h.name, description: h.description, parameters: h.input_schema },
  }));
}

// Aplana contenido en bloques (por si un historial viene en formato Anthropic).
function normalizarMsg(m) {
  if (Array.isArray(m.content)) {
    const txt = m.content
      .map((b) => (typeof b === 'string' ? b : b?.text || (b?.type === 'tool_result' ? b.content : '')))
      .filter(Boolean)
      .join('\n');
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: txt };
  }
  return m;
}

async function ollamaChat(mensajes) {
  const r = await fetch(`${ollamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModelo(),
      messages: mensajes,
      tools: herramientasOpenAI(),
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`Ollama respondió ${r.status}. ¿Está corriendo en ${ollamaUrl()} y bajaste el modelo (ollama pull ${ollamaModelo()})? ${detalle.slice(0, 200)}`);
  }
  return r.json();
}

async function conversarOllama(mensajesEntrada) {
  // El prompt de sistema se antepone en CADA llamada; no se guarda en el historial
  // devuelto (para no duplicarlo cuando el frontend reenvía la conversación).
  const historial = [
    { role: 'system', content: construirPrompt() },
    ...mensajesEntrada.map(normalizarMsg),
  ];
  const traza = [];

  let data = await ollamaChat(historial);
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const msg = data.message || { role: 'assistant', content: '' };
    historial.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) break;

    for (const c of calls) {
      const nombre = c.function?.name;
      let args = c.function?.arguments ?? {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      const salida = await ejecutarHerramienta(nombre, args);
      traza.push({ herramienta: nombre, entrada: args, exito: !salida?.error });
      historial.push({ role: 'tool', name: nombre, content: JSON.stringify(salida) });
    }
    data = await ollamaChat(historial);
  }

  const texto = String(data.message?.content || '').trim();
  const mensajes = historial.filter((m) => m.role !== 'system');
  return { respuesta: texto || RESPUESTA_VACIA, mensajes, traza };
}

/* ================================================================ */
/* Entrada única: despacha al proveedor activo                       */
/* ================================================================ */

const RESPUESTA_VACIA =
  'Disculpa, no pude procesar eso. Intenta de nuevo o escríbenos por WhatsApp.';

/**
 * Procesa un turno completo. `traza` lista las herramientas ejecutadas.
 * @param {Array} mensajes  Historial (formato del proveedor activo).
 */
export async function conversar(mensajes) {
  if (proveedorIA() === 'ollama') return conversarOllama(mensajes);
  return conversarClaude(mensajes);
}
