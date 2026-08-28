// fuente.mjs — de dónde salen los negocios e ítems.
//
// Prefiere la data importada real (src/datos/generado.mjs, que produce el
// comando "npm run importar") y cae a la data de ejemplo (semillas.mjs) si aún
// no se ha importado nada. Así el equipo trabaja con ejemplos hasta que llega la
// data real, sin tocar código.

import { enriquecerItems } from './enriquecer.mjs';

let NEGOCIOS, ITEMS, ORIGEN;

try {
  ({ NEGOCIOS, ITEMS } = await import('./generado.mjs'));
  ORIGEN = 'importada';
} catch {
  ({ NEGOCIOS, ITEMS } = await import('./semillas.mjs'));
  ORIGEN = 'ejemplo';
}

// Cada comercio y hotel con solo ítems genéricos recibe un producto/servicio
// real (con precio y descripción). Determinista: memoria y Supabase coinciden.
ITEMS = enriquecerItems(NEGOCIOS, ITEMS);

export { NEGOCIOS, ITEMS, ORIGEN };
