// build-docs.mjs — genera la versión ESTÁTICA para GitHub Pages en /docs.
//
// Toma UNA sola fuente de verdad (src/datos/semillas.mjs) y produce datos.js con
// los negocios, ítems y la cadena de sellos ya calculada. Copia la interfaz tal
// cual (estilos.css, app.js) y arma un index.html con rutas relativas para que
// funcione bajo https://usuario.github.io/cimarron/.
//
// Uso:  npm run build:docs   (y luego git add docs && git commit && git push)
//
// El agente de IA en vivo NO va en Pages (necesita servidor + llave secreta):
// en la web pública el catálogo, los tres flujos, el pago Bre-B y la verificación
// del sello corren en el navegador; el agente conversacional corre en localhost.

import { writeFileSync, mkdirSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NEGOCIOS, ITEMS } from '../src/datos/semillas.mjs';
import { emitirSello, raizDeCadena } from '../src/nucleo/sello.mjs';
import { REFERENCIAS_CASANARE } from '../src/nucleo/geocerca.mjs';
import { formatearCOP } from '../src/nucleo/formato.mjs';
import { tipoSolicitudParaItem } from '../src/servicios/flujo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const DOCS = join(ROOT, 'docs');

mkdirSync(DOCS, { recursive: true });
mkdirSync(join(DOCS, 'assets'), { recursive: true });

/* 1. Reconstruye negocios, ítems y la cadena de sellos igual que hace el
      servidor en memoria al arrancar, para que los códigos y hashes sean reales. */
const negocios = NEGOCIOS.map((n) => ({ activo: true, ...n }));
const items = ITEMS.map((i) => ({ activo: true, codigoSello: null, ...i }));
const negocioDe = (id) => negocios.find((n) => n.id === id);

const sellos = [];
for (const item of items) {
  if (!item.certificacion) continue;
  const n = negocioDe(item.negocioId);
  const sello = emitirSello(
    { producto: item.nombre, negocio: n?.nombre, municipio: n?.municipio, ...item.certificacion },
    raizDeCadena(sellos),
  );
  sellos.push(sello);
  item.codigoSello = sello.codigo;
  delete item.certificacion;
}

/* 2. Enriquece los ítems para el catálogo (precio formateado y flujo). */
const itemsWeb = items.map((i) => {
  const n = negocioDe(i.negocioId);
  const enriquecido = {
    ...i,
    negocioNombre: n?.nombre,
    municipio: n?.municipio,
    sector: n?.sector,
    radioCoberturaKm: n?.radioCoberturaKm ?? 0,
    precio: formatearCOP(i.precioCop),
  };
  enriquecido.flujo = tipoSolicitudParaItem(enriquecido);
  return enriquecido;
});

/* 3. Escribe datos.js (global que consume app.js en modo estático). */
const datos = {
  negocios,
  items: itemsWeb,
  sellos,
  referencias: REFERENCIAS_CASANARE,
  config: { llave: '@cimarron', titular: 'CIMARRON', qr: 'assets/qr-breb.png' },
};
writeFileSync(
  join(DOCS, 'datos.js'),
  `// Generado por scripts/build-docs.mjs — no editar a mano.\nwindow.CIMARRON_DATOS = ${JSON.stringify(datos, null, 2)};\n`,
);

/* 4. Copia la interfaz sin cambios. */
copyFileSync(join(WEB, 'estilos.css'), join(DOCS, 'estilos.css'));
copyFileSync(join(WEB, 'app.js'), join(DOCS, 'app.js'));

/* 5. index.html con rutas relativas + carga de datos.js antes de app.js. */
let html = readFileSync(join(WEB, 'index.html'), 'utf8')
  .replace('href="/estilos.css"', 'href="estilos.css"')
  .replace('<script src="/app.js"></script>', '<script src="datos.js"></script>\n<script src="app.js"></script>');
writeFileSync(join(DOCS, 'index.html'), html);

/* 6. Copia el QR de Bre-B si ya existe en assets/. */
const qrOrigen = join(ROOT, 'assets', 'qr-breb.png');
if (existsSync(qrOrigen)) copyFileSync(qrOrigen, join(DOCS, 'assets', 'qr-breb.png'));

/* 7. .nojekyll para que Pages sirva todo tal cual. */
writeFileSync(join(DOCS, '.nojekyll'), '');

console.log(
  `docs/ generado: ${negocios.length} negocios, ${itemsWeb.length} ítems, ${sellos.length} sellos en cadena.`,
);
