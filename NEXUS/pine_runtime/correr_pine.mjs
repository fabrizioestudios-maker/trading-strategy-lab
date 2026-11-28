import { PineTS } from 'pinets';
import { readFileSync, writeFileSync } from 'node:fs';
const velas = JSON.parse(readFileSync(process.argv[3] ?? 'velas.json', 'utf8'));
const t0 = Date.now();
const r = await new PineTS(velas, 'XAUUSD', '15').run(readFileSync(process.argv[2] ?? '../../pine/terceros/luxalgo_smart_money_concepts.pine', 'utf8'));
console.log('ms', Date.now() - t0, 'plots', Object.keys(r.plots ?? {}));
const out = {};
for (const h of r.fullContext._drawingHelpers) {
  for (const k of Object.keys(h)) if (k.startsWith('_') && Array.isArray(h[k])) {
    const vivos = h[k].filter((x) => !x._deleted && !x.deleted);
    out[k] = vivos.map((x) => Object.fromEntries(Object.entries(x).filter(([kk, vv]) => typeof vv !== 'object' || vv === null || Array.isArray(vv)).map(([kk, vv]) => [kk, vv])));
    console.log(k, 'total', h[k].length, 'vivos', vivos.length, vivos[0] ? JSON.stringify(out[k][0]).slice(0, 300) : '');
  }
}
writeFileSync('dibujos.json', JSON.stringify(out));
