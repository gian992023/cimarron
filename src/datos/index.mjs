// Selector de implementación de la capa de datos.
//
// PORTADO DE COMPY: allá el swap entre mock y Supabase fue una sola línea
// condicional y la interfaz de usuario no se tocó. Aquí es lo mismo: el agente
// nunca sabe contra qué está hablando.

import { validarRepositorio } from './interfaces.mjs';
import { crearRepositorioMemoria } from './memoria.mjs';

let instancia = null;

/**
 * Inicializa el origen de datos. Llamar al arrancar el servidor.
 * Para 'memoria' no es obligatorio (repositorio() lo crea al vuelo), pero
 * 'supabase' sí lo requiere porque carga su cliente de forma diferida.
 */
export async function inicializarDatos() {
  if (instancia) return instancia;
  if (origenActual() === 'supabase') {
    const { crearRepositorioSupabase } = await import('./supabase.mjs');
    instancia = validarRepositorio(crearRepositorioSupabase(), 'supabase');
  } else {
    instancia = validarRepositorio(crearRepositorioMemoria(), 'memoria');
  }
  return instancia;
}

export function repositorio() {
  if (instancia) return instancia;
  if (origenActual() === 'supabase') {
    throw new Error('El origen supabase requiere await inicializarDatos() al arrancar el servidor.');
  }
  instancia = validarRepositorio(crearRepositorioMemoria(), 'memoria');
  return instancia;
}

export function origenActual() {
  return (process.env.CIMARRON_ORIGEN_DATOS || 'memoria').toLowerCase();
}
