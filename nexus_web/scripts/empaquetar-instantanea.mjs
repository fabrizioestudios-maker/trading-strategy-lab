/**
 * Junta las respuestas grabadas (instantanea/<clave>.json) en 16 fragmentos instantanea/<último carácter>.json,
 * que es lo que lee la versión publicada (src/api/cliente.ts). Uso: node scripts/empaquetar-instantanea.mjs <carpeta>
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , CARPETA] = process.argv;
const DIR = join(CARPETA, 'instantanea');
const frag = {};
let n = 0;
for (const f of readdirSync(DIR)) {
  if (!/^[0-9a-f]{14}\.json$/.test(f)) continue;
  (frag[f[13]] ??= {})[f.slice(0, 14)] = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  rmSync(join(DIR, f));
  n++;
}
for (const [c, m] of Object.entries(frag)) writeFileSync(join(DIR, `${c}.json`), JSON.stringify(m));
console.log(`${n} respuestas en ${Object.keys(frag).length} fragmentos`);
