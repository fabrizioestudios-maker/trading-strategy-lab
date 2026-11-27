/**
 * Graba las respuestas de la API de NEXUS para la versión publicada sin servidor (VITE_ESTATICO=1).
 * Recorre la interfaz contra una API real (python -m nexus_api) y guarda cada respuesta 200 en
 * <salida>/instantanea/<clave>.json, con la misma clave que src/api/clave.ts.
 *
 *   node scripts/grabar-instantanea.mjs http://127.0.0.1:8800 <salida> [pasos]
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// copia de src/api/clave.ts (la prueba clave.test.ts fija los valores)
function cyrb53(s, semilla = 0) {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
const clave = (m, ruta, cuerpo) => cyrb53(`${m.toUpperCase()} ${ruta}\n${cuerpo ?? ''}`);
if (cyrb53('') !== '0bdcb81aee8d83') throw new Error('cyrb53 no coincide con src/api/clave.ts');

const [, , API = 'http://127.0.0.1:8800', SALIDA = 'dist-estatico', PASOS = '200'] = process.argv;
const DIR = join(SALIDA, 'instantanea');
mkdirSync(DIR, { recursive: true });

const grabadas = new Map();
const pendientes = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
p.on('response', (r) => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith('/api/') || r.status() !== 200) return;
  const req = r.request();
  const k = clave(req.method(), u.pathname + u.search, req.postData());
  if (grabadas.has(k)) return;
  grabadas.set(k, `${req.method()} ${u.pathname}${u.search}`);
  // si la página ya descartó el cuerpo (recarga o navegación), se vuelve a pedir igual desde acá
  const repedir = () =>
    fetch(r.url(), { method: req.method(), body: req.postData() ?? undefined, headers: { Accept: 'application/json', ...(req.postData() ? { 'Content-Type': 'application/json' } : {}) } }).then((x) => {
      if (!x.ok) throw new Error(`${x.status} ${u.pathname}`);
      return x.arrayBuffer().then((a) => Buffer.from(a));
    });
  pendientes.push(
    r
      .body()
      .catch(repedir)
      .then((cuerpo) => writeFileSync(join(DIR, `${k}.json`), cuerpo))
      .catch((e) => {
        grabadas.delete(k);
        console.log(`sin grabar: ${e}`);
      }),
  );
});

const quieto = () => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(250));
const ir = async (hash) => {
  await p.goto(`${API}/${hash}`);
  await quieto();
};
// todas las capas activas, para que el replay grabado tenga estructura, FVG, barridos y order blocks
// (la app lee el espacio al cargar: se recarga la página después de escribirlo)
const espacio = async (extra) => {
  await p.evaluate((e) => localStorage.setItem('nexus.espacio.v1', JSON.stringify(e)), {
    prefs: { capas: { sesiones: true, niveles: true, ordenes: true, senales: true, estructura: true, fvg: true, barridos: true, ob: true, ifvg: true, ote: true, rsi: true, macd: true } },
    ...extra,
  });
  await p.reload();
  await quieto();
};

await ir('#/resumen');
const instrumentos = (await (await fetch(`${API}/api/v1/instrumentos`)).json()).filter((i) => i.disponible).map((i) => i.simbolo);
for (const s of instrumentos) {
  await espacio({ simbolo: s });
  for (const m of ['resumen', 'datos']) await ir(`#/${m}`);
}
await espacio({ simbolo: 'XAUUSD' });
for (const m of ['laboratorio', 'herramientas', 'ejecucion', 'analitica', 'ajustes']) await ir(`#/${m}`);
// cada corrida guardada (Analítica permite elegirla)
const trabajos = await (await fetch(`${API}/api/v1/trabajos`)).json();
await p.evaluate(async (ids) => {
  for (const id of ids) await fetch(`/api/v1/trabajos/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
}, trabajos.map((t) => t.id));
for (const r of ['/estrategias', '/hipotesis', '/investigacion/contexto', '/referencias', '/mercado/horario']) await p.evaluate((u) => fetch(u, { headers: { Accept: 'application/json' } }), `/api/v1${r}`);

// replay de XAUUSD 15m: desde el inicio, paso a paso, con el paso hacia atrás también grabado
await ir('#/replay');
await p.waitForSelector('.terminal', { timeout: 60_000 });
await quieto();
const n = Number(PASOS);
for (let i = 0; i < n; i++) {
  await p.keyboard.press('ArrowRight');
  await quieto();
  if (i > 0 && i % 1 === 0) {
    await p.keyboard.press('ArrowLeft');
    await quieto();
    await p.keyboard.press('ArrowRight');
    await quieto();
  }
  if (i % 25 === 0) console.log(`paso ${i}/${n}, ${grabadas.size} respuestas`);
}
const limite = await p.evaluate(() => JSON.parse(localStorage.getItem('nexus.espacio.v1') ?? '{}').replay?.limites?.XAUUSD);
await Promise.all(pendientes);
// se suma a una grabación anterior en la misma carpeta
const MANIFIESTO = join(SALIDA, 'instantanea.json');
const previo = existsSync(MANIFIESTO) ? JSON.parse(readFileSync(MANIFIESTO, 'utf8')) : { rutas: [] };
const rutas = [...new Set([...previo.rutas, ...grabadas.values()])].sort();
const fin = n > 0 ? limite : previo.replay_fin_ms;
writeFileSync(MANIFIESTO, JSON.stringify({ grabado: new Date().toISOString(), respuestas: rutas.length, replay_fin_ms: fin, rutas }, null, 1));
console.log(`listo: ${grabadas.size} respuestas, replay hasta ${limite}`, errores.length ? `errores de página: ${errores.join(' | ')}` : 'sin errores de página');
await b.close();
