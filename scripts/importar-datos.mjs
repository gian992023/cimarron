// importar-datos.mjs — CLI de ingesta.
//
// Lee datos_recolectada/{comercio,turismo,agro}.csv, valida, descarta lo
// incompleto y escribe src/datos/generado.mjs (que la app prefiere sobre la
// data de ejemplo). Imprime el reporte de lo integrado y lo descartado.
//
// Uso:  npm run importar

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importar } from '../src/datos/importar.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'datos_recolectada');

const leer = (nombre) => {
  const ruta = join(DIR, nombre);
  return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
};

const csvs = {
  comercio: leer('comercio.csv'),
  turismo: leer('turismo.csv'),
  agro: leer('agro.csv'),
};

if (!csvs.comercio && !csvs.turismo && !csvs.agro) {
  console.error('No se encontró ningún CSV en datos_recolectada/. Revisa el README de esa carpeta.');
  process.exit(1);
}

const { negocios, items, reporte } = importar(csvs);

const salida = join(ROOT, 'src', 'datos', 'generado.mjs');
writeFileSync(
  salida,
  `// Generado por scripts/importar-datos.mjs desde datos_recolectada/. No editar a mano.\n` +
    `// Vuelve a correr "npm run importar" para regenerarlo.\n` +
    `export const NEGOCIOS = ${JSON.stringify(negocios, null, 2)};\n\n` +
    `export const ITEMS = ${JSON.stringify(items, null, 2)};\n`,
);

console.log('');
console.log('  Ingesta de data recolectada');
console.log('  ───────────────────────────');
for (const s of ['comercio', 'turismo', 'agro']) {
  console.log(`  ${s.padEnd(9)} total ${String(reporte.total[s]).padStart(4)}   integrados ${String(reporte.integrados[s]).padStart(4)}   descartados ${String(reporte.descartados[s]).padStart(4)}`);
}
console.log(`  ──> negocios: ${reporte.resumen.negocios} · ítems: ${reporte.resumen.items} · descartados: ${reporte.resumen.descartadosTotal}`);
console.log('');
if (reporte.motivos.length) {
  console.log('  Filas descartadas (primeras 40):');
  reporte.motivos.slice(0, 40).forEach((m) =>
    console.log(`   - [${m.sector}] fila ${m.fila} "${m.nombre}": ${m.motivo}`));
  if (reporte.motivos.length > 40) console.log(`   ... y ${reporte.motivos.length - 40} más`);
  console.log('');
}
console.log(`  Escrito: ${salida}`);
console.log(`  Ahora corre  npm run build:docs  para reflejarlo en GitHub Pages.`);
