// EL AGENTE: bucle de tool use sobre Claude Opus 5.
//
// PATRÓN TOMADO DE PETRASERVIS (supabase/functions/chat-ia/index.ts).
//
// Esto es lo que separa un agente de un chatbot:
//   1. Se envía a Claude el historial + el catálogo de herramientas.
//   2. Claude responde con stop_reason = "tool_use" y dice cuál usar.
//   3. El servidor la ejecuta DE VERDAD contra los datos.
//   4. El resultado vuelve como tool_result.
//   5. Claude lee el resultado y decide el siguiente paso.
//   6. Se repite hasta end_turn, con un tope de vueltas.

import Anthropic from '@anthropic-ai/sdk';
import { HERRAMIENTAS, ejecutarHerramienta } from './herramientas.mjs';
import { construirPrompt } from './prompt.mjs';

const MAX_VUELTAS = 8;

// Dos formas de autenticar (la que tú pongas en .env):
//   1. ANTHROPIC_API_KEY        → API de pago por uso.
//   2. CLAUDE_CODE_OAUTH_TOKEN  → tu plan de Claude, $0 (el patrón de NEXO).
//      Genera el token con:  claude setup-token
// Nunca se leen credenciales del sistema: solo lo que declares en el entorno.
let cliente = null;
export function metodoAuth() {
  if (process.env.ANTHROPIC_API_KEY) return 'api_key';
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN) return 'oauth';
  return null;
}

function anthropic() {
  if (cliente) return cliente;
  const metodo = metodoAuth();
  if (metodo === 'api_key') {
    cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } else if (metodo === 'oauth') {
    cliente = new Anthropic({
      authToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  } else {
    throw new Error(
      'Falta credencial de Claude. En .env pon ANTHROPIC_API_KEY (pago) o ' +
        'CLAUDE_CODE_OAUTH_TOKEN (tu plan, $0; genéralo con "claude setup-token").',
    );
  }
  return cliente;
}

function parametros(mensajes) {
  return {
    model: process.env.CIMARRON_MODELO || 'claude-opus-5',
    max_tokens: 16000,
    system: construirPrompt(),
    tools: HERRAMIENTAS,
    // Thinking adaptativo: el modelo decide cuánto razonar en cada turno.
    thinking: { type: 'adaptive' },
    // El esfuerzo se baja a medium para que el chat responda rápido en la demo.
    output_config: { effort: process.env.CIMARRON_ESFUERZO || 'medium' },
    messages: mensajes,
  };
}

/**
 * Procesa un turno completo de conversación.
 *
 * @param {Array} mensajes  Historial en formato de la API de Anthropic
 * @returns {Promise<{respuesta: string, mensajes: Array, traza: Array}>}
 *          `traza` lista las herramientas que se ejecutaron: sirve para
 *          mostrarle al jurado lo que el agente hizo de verdad.
 */
export async function conversar(mensajes) {
  const api = anthropic();
  const historial = [...mensajes];
  const traza = [];

  let respuesta = await api.messages.create(parametros(historial));

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (respuesta.stop_reason !== 'tool_use') break;

    historial.push({ role: 'assistant', content: respuesta.content });

    const resultados = [];
    for (const bloque of respuesta.content) {
      if (bloque.type !== 'tool_use') continue;

      const salida = await ejecutarHerramienta(bloque.name, bloque.input);
      traza.push({
        herramienta: bloque.name,
        entrada: bloque.input,
        exito: !salida?.error,
      });

      resultados.push({
        type: 'tool_result',
        tool_use_id: bloque.id,
        content: JSON.stringify(salida),
        ...(salida?.error ? { is_error: true } : {}),
      });
    }

    historial.push({ role: 'user', content: resultados });
    respuesta = await api.messages.create(parametros(historial));
  }

  historial.push({ role: 'assistant', content: respuesta.content });

  const texto = respuesta.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return {
    respuesta:
      texto ||
      'Disculpa, no pude procesar eso. Intenta de nuevo o escríbenos por WhatsApp.',
    mensajes: historial,
    traza,
  };
}
