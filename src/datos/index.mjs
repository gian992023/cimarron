// Selector de implementación de la capa de datos.
//
// PORTADO DE COMPY: allá el swap entre mock y Supabase fue una sola línea
// condicional y la interfaz de usuario no se tocó. Aquí es lo mismo: el agente
// nunca sabe contra qué está hablando.

import { validarRepositorio } from './interfaces.mjs';
import { crearRepositorioMemoria } from './memoria.mjs';

let instancia = null;

export function repositorio() {
  if (instancia) return instancia;

  const origen = (process.env.CIMARRON_ORIGEN_DATOS || 'memoria').toLowerCase();

  if (origen === 'supabase') {
    throw new Error(
      'La implementación de Supabase todavía no está conectada. ' +
        'Usa CIMARRON_ORIGEN_DATOS=memoria para la demo, o implementa src/datos/supabase.mjs ' +
        'cumpliendo el contrato de src/datos/interfaces.mjs.',
    );
  }

  instancia = validarRepositorio(crearRepositorioMemoria(), 'memoria');
  return instancia;
}

export function origenActual() {
  return (process.env.CIMARRON_ORIGEN_DATOS || 'memoria').toLowerCase();
}
