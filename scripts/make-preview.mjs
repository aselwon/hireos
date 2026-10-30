import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { seed } from '../hireos/dist/seed.js';
// Same UI source, bundled into a self-contained artifact for T3 HTML rendering.
const css = await readFile(new URL('../hireos/dist/styles.css', import.meta.url), 'utf8');
let js = await readFile(new URL('../hireos/dist/app.js', import.meta.url), 'utf8');
js = js.replace("import { seed } from './seed.js';", `const seed = ${JSON.stringify(seed)};`);
const start = js.indexOf('try {\n  const response = await fetch');
const end = js.indexOf('\nfunction toast', start);
if (start < 0 || end < 0) {
  throw new Error('Nie znaleziono granic inicjalizacji podglądu.');
}
js = js.slice(0, start) + js.slice(end);
const style = `${css.replace(/min-height:\s*100vh/g, 'min-height:0').replace(/height:\s*100vh/g, 'height:auto')}\nhtml,body{background:transparent!important}.shell{min-height:0}.sidebar{height:auto;position:relative}.content{padding:22px}.topbar{padding:0 22px}.footer{padding-bottom:12px}*{animation:none!important}`;
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style></head><body><div id="app"></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal"></dialog><script type="module">${js}</script></body></html>`;
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/hireos-preview.html', import.meta.url), html);
process.stdout.write('Created artifacts/hireos-preview.html\n');
