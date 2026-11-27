/* Setup A+ de Trading Institucional (Manual, módulo 02 "Sweep Institucional"):
 *   1. Sweep: la mecha de una vela de la temporalidad mayor (1H) pasa una liquidez pendiente (swing de 1H, máximo o mínimo de
 *      una sesión anterior, del día anterior o EQH/EQL) y el cuerpo cierra de vuelta.
 *   2. CDE (cambio de estructura) en la temporalidad de entrada (M5 o M1): cierre de cuerpo más allá del último fractal.
 *   3. OTE / Golden zone: Fibonacci del tramo interno (extremo del sweep → extremo del impulso), zona 0,618–0,7.
 *   4. Zona de reacción dentro de esa zona: FVG, BPR, iFVG u Order Block.
 *   5. LQ: el objetivo es la liquidez pendiente del lado opuesto (swing de 1H o la liquidez más cercana). SL detrás del sweep.
 * Filtros: dirección por estructura fractal de una temporalidad mayor y sesión (Londres 02–05 / Nueva York 07–10, hora de NY).
 * Todo es causal: una orden se coloca solo con lo que se sabía al cerrar la vela anterior.
 */
(function (raiz) {
  'use strict';
  const esNode = typeof module !== 'undefined' && module.exports;
  const M = esNode ? require('./motores.js') : raiz.REPM;
  const LUX = esNode ? require('./luxalgo.js') : raiz.LUX;

  const SESIONES = { lnd: [[120, 300]], ny: [[420, 600]], ambas: [[120, 300], [420, 600]], nyAmplia: [[420, 720]], todo: [[0, 1440]] };
  const enSesion = (ms, s) => { const m = M.minNY(ms); return (SESIONES[s] || SESIONES.todo).some(([a, b]) => m >= a && m < b); };

  // Fractal de 5 velas (Williams): el central es el máximo (o mínimo) estricto de las cinco. Se confirma 2 velas después.
  function fractales(V) {
    const n = V.length, alto = new Uint8Array(n), bajo = new Uint8Array(n);
    for (let k = 2; k < n - 2; k++) {
      if (V.h[k] > V.h[k - 1] && V.h[k] > V.h[k - 2] && V.h[k] > V.h[k + 1] && V.h[k] > V.h[k + 2]) alto[k] = 1;
      if (V.l[k] < V.l[k - 1] && V.l[k] < V.l[k - 2] && V.l[k] < V.l[k + 1] && V.l[k] < V.l[k + 2]) bajo[k] = 1;
    }
    return { alto, bajo };
  }
  // Espejo de las velas (precio → −precio) para usar la misma lógica en los setups bajistas.
  const espejo = (V) => ({ t: V.t, o: Float64Array.from(V.o, (x) => -x), h: Float64Array.from(V.l, (x) => -x), l: Float64Array.from(V.h, (x) => -x), c: Float64Array.from(V.c, (x) => -x), length: V.length });
  function primeroDesde(t, ms) { let a = 0, b = t.length; while (a < b) { const m = (a + b) >> 1; if (t[m] < ms) a = m + 1; else b = m; } return a; }

  // Liquidez pendiente en el espacio original. lado 1 = máximos (buy-side), −1 = mínimos (sell-side).
  function liquidez(M1, VH, htfMs, p) {
    const usar = 'todas';
    const out = [];
    if (usar === 'todas' || usar === 'swing') {
      const f = fractales(VH);
      for (let k = 2; k < VH.length - 2; k++) {
        const t = VH.t[k + 2] + htfMs;
        if (f.alto[k]) out.push({ p: VH.h[k], lado: 1, tipo: 'swing', t });
        if (f.bajo[k]) out.push({ p: VH.l[k], lado: -1, tipo: 'swing', t });
      }
    }
    if (usar === 'todas' || usar === 'sesiones') {
      // Asia 20–00, Londres 02–05, Nueva York 07–16 (hora de NY) y día de trading completo (máximo/mínimo del día anterior).
      const ses = [['asia', 1200, 1440], ['londres', 120, 300], ['ny', 420, 960]];
      let dia = null, d = null;
      const abiertas = {};
      const cerrar = (x, tipo) => { if (x && isFinite(x.h)) { out.push({ p: x.h, lado: 1, tipo, t: x.fin }); out.push({ p: x.l, lado: -1, tipo, t: x.fin }); } };
      const n = M1.T.length;
      for (let i = 0; i < n; i++) {
        const t = M1.T[i], m = M.minNY(t), dd = M.diaNY(t);
        if (dd !== dia) { cerrar(d, 'dia'); dia = dd; d = { h: -Infinity, l: Infinity, fin: 0 }; }
        d.h = Math.max(d.h, M1.H[i]); d.l = Math.min(d.l, M1.L[i]); d.fin = t + 60000;
        for (const [nom, a, b] of ses) {
          const dentro = m >= a && m < b;
          const x = abiertas[nom];
          if (dentro) { if (!x || x.dia !== dd) { if (x) cerrar(x, nom); abiertas[nom] = { dia: dd, h: M1.H[i], l: M1.L[i], fin: t + 60000 }; } else { x.h = Math.max(x.h, M1.H[i]); x.l = Math.min(x.l, M1.L[i]); x.fin = t + 60000; } }
          else if (x) { cerrar(x, nom); abiertas[nom] = null; }
        }
      }
    }
    if (usar === 'todas' || usar === 'eq') {
      const r = LUX.smc(VH, {});
      for (const e of r.eqs) out.push({ p: e.nivel, lado: e.dir === 1 ? 1 : -1, tipo: 'eq', t: VH.t[e.i] + htfMs });
    }
    out.sort((a, b) => a.t - b.t);
    // Momento en que cada nivel deja de estar pendiente (el precio lo supera) según velas de la temporalidad mayor.
    for (const z of out) {
      let k = primeroDesde(VH.t, z.t);
      z.tomado = Infinity;
      for (; k < VH.length; k++) if (z.lado === 1 ? VH.h[k] > z.p : VH.l[k] < z.p) { z.tomado = VH.t[k]; break; }
    }
    return out;
  }

  // Dirección por estructura fractal (LuxAlgo Market Structure Fractal) en la temporalidad pedida: +1, −1 o 0 en el instante t.
  function direccion(M1, tf) {
    const V = LUX.velas(M1, tf), r = LUX.msFractal(V, { largo: 5 });
    const tfMs = tf >= 1440 ? 86400000 : tf * 60000;
    const tiempos = r.estructuras.map((e) => V.t[e.i] + tfMs), dirs = r.estructuras.map((e) => e.dir);
    return (t) => { let a = 0, b = tiempos.length; while (a < b) { const m = (a + b) >> 1; if (tiempos[m] <= t) a = m + 1; else b = m; } return a ? dirs[a - 1] : 0; };
  }

  // Busca los setups alcistas sobre velas (posiblemente espejadas). niveles: los de lado −1 (mínimos a barrer) y +1 (objetivos).
  function buscarAlcistas(VH, VL, htfMs, ltfMs, niveles, p, dirEn, sgn) {
    const setups = [];
    const fib0 = p.fibMin == null ? 0.618 : p.fibMin, fib1 = p.fibMax == null ? 0.7 : p.fibMax;
    const zonasOk = new Set(p.zonas === 'ninguna' ? [] : (p.zonas || 'fvg,bpr,ifvg,ob').split(','));
    const ventanaCde = p.ventanaCde || Math.round((3 * htfMs) / ltfMs);
    const vence = p.vence || Math.round((3 * htfMs) / ltfMs);
    const buffer = p.buffer == null ? 2 : p.buffer;
    const fl = fractales(VL);
    // último fractal alto confirmado al cierre de cada vela de entrada (pivote k confirmado en k+2)
    const n = VL.length;
    const ultFH = new Float64Array(n).fill(NaN), ultFHi = new Int32Array(n).fill(-1);
    for (let j = 0; j < n; j++) {
      if (j > 0) { ultFH[j] = ultFH[j - 1]; ultFHi[j] = ultFHi[j - 1]; }
      const k = j - 2;
      if (k >= 2 && fl.alto[k]) { ultFH[j] = VL.h[k]; ultFHi[j] = k; }
    }
    const pendientes = [];
    let q = 0;
    const barrer = p.niveles && p.niveles !== 'todas' ? new Set(p.niveles === 'sesiones' ? ['asia', 'londres', 'ny', 'dia'] : [p.niveles]) : null;
    const bajos = niveles.filter((z) => z.lado === -1 && (!barrer || barrer.has(z.tipo))), altos = niveles.filter((z) => z.lado === 1);
    for (let i = 0; i < VH.length; i++) {
      while (q < bajos.length && bajos[q].t <= VH.t[i]) pendientes.push(bajos[q++]);
      let barridos = [];
      for (let x = pendientes.length - 1; x >= 0; x--) {
        const z = pendientes[x];
        if (VH.l[i] < z.p) { if (VH.c[i] > z.p) barridos.push(z); pendientes.splice(x, 1); }
      }
      if (!barridos.length) continue;
      const tSweep = VH.t[i], tConf = VH.t[i] + htfMs;
      const nivelBarrido = Math.max(...barridos.map((z) => z.p));
      // dirección
      const d = dirEn ? dirEn(tConf) * sgn : 1;
      if (p.direccion && p.direccion !== 'ninguna' && d !== 1) continue;
      // cambio de estructura en la temporalidad de entrada
      let j = primeroDesde(VL.t, tSweep);
      const j0 = j;
      let ext = Infinity, extI = -1, cde = -1, nivelCde = NaN;
      for (; j < Math.min(n, j0 + ventanaCde); j++) {
        if (VL.l[j] < ext) { ext = VL.l[j]; extI = j; }
        if (VL.t[j] >= tConf && VL.c[j] < nivelBarrido) break; // cerró del otro lado: no fue sweep
        const nivel = ultFH[j - 1 >= 0 ? j - 1 : 0];
        if (j > j0 && extI >= 0 && isFinite(nivel) && nivel > ext && ultFHi[j - 1] < j && VL.c[j] > nivel && VL.c[j - 1] <= nivel) { cde = j; nivelCde = nivel; break; }
      }
      if (cde < 0) continue;
      const tCde = VL.t[cde] + ltfMs;
      if (p.sesion && p.sesion !== 'todo' && !enSesion(tCde, p.sesion)) continue;
      // entrada: a partir del cierre del CDE y del cierre del sweep en 1H
      const desde = Math.max(tCde, tConf);
      let m = primeroDesde(VL.t, desde);
      const mFin = Math.min(n, cde + 1 + vence);
      const sl = ext - buffer;
      const setup = { dir: sgn, tSweep, tConf, tCde, ext: ext, extI, nivelBarrido, nivelCde, tExt: VL.t[extI], tipos: [...new Set(barridos.map((z) => z.tipo))], cde, ordenes: [], fin: -1, motivo: '' };
      let H = -Infinity;
      for (let k = extI; k < m; k++) H = Math.max(H, VL.h[k]);
      let ultimaClave = '';
      // zonas de reacción, ingeridas vela a vela a medida que se conocen
      const ini = Math.max(2, extI - 30);
      const alcF = [], bajF = [];
      let u = ini;
      const ingerir = (hasta) => {
        for (; u < hasta; u++) {
          for (const f of alcF) if (!f.mit && VL.l[u] < f.bot) f.mit = true;
          for (const b of bajF) { if (b.inv < 0) { if (VL.c[u] > b.top) b.inv = u; } else if (!b.roto && VL.c[u] < b.bot) b.roto = true; }
          if (u >= extI && VL.l[u] > VL.h[u - 2]) alcF.push({ top: VL.l[u], bot: VL.h[u - 2], k: u, mit: false });
          if (VL.h[u] < VL.l[u - 2]) bajF.push({ top: VL.l[u - 2], bot: VL.h[u], k: u, inv: -1, roto: false });
        }
      };
      let obZona = null;
      for (let k = extI; k >= Math.max(0, extI - 5); k--) if (VL.c[k] < VL.o[k]) { obZona = { top: VL.h[k], bot: VL.l[k] }; break; }
      for (; m < mFin; m++) {
        ingerir(m);
        // zona con lo conocido al cierre de m−1
        const rango = H - ext;
        if (!(rango > 0)) { H = Math.max(H, VL.h[m]); continue; }
        const zHi = H - fib0 * rango, zLo = H - fib1 * rango;
        let entrada = NaN, tipo = '';
        const cand = (top, bot, t) => { if (top >= zLo && bot <= zHi) { const e = Math.min(top, zHi); if (!(e <= entrada)) { entrada = e; tipo = t; } } };
        if (zonasOk.size === 0) { entrada = zHi; tipo = 'fib'; }
        else {
          for (const f of alcF) {
            if (f.mit) continue;
            if (zonasOk.has('fvg')) cand(f.top, f.bot, 'FVG');
            if (zonasOk.has('bpr')) for (const b of bajF) { if (b.k >= f.k) continue; const t2 = Math.min(f.top, b.top), b2 = Math.max(f.bot, b.bot); if (t2 > b2) cand(t2, b2, 'BPR'); }
          }
          if (zonasOk.has('ifvg')) for (const b of bajF) if (b.inv >= 0 && !b.roto) cand(b.top, b.bot, 'iFVG');
          if (zonasOk.has('ob') && obZona) cand(obZona.top, obZona.bot, 'OB');
        }
        // objetivo
        let tp = NaN;
        const riesgo = entrada - sl;
        if (p.tp === '2r' || p.tp === '3r') tp = entrada + (p.tp === '3r' ? 3 : 2) * riesgo;
        else {
          const t = VL.t[m];
          let mejor = Infinity;
          for (const z of altos) { if (z.t > t || z.tomado <= t || z.p <= H) continue; if (p.tp !== 'lq' && z.tipo !== 'swing') continue; if (z.p < mejor) mejor = z.p; }
          if (isFinite(mejor)) tp = mejor;
        }
        const rr = (tp - entrada) / riesgo;
        if (isFinite(entrada) && riesgo > 0 && isFinite(tp) && rr >= (p.rrMin || 1) && (!p.rrMax || rr <= p.rrMax)) {
          const clave = entrada.toFixed(2) + '|' + tp.toFixed(2);
          if (clave !== ultimaClave) { setup.ordenes.push({ t: VL.t[m], entrada, sl, tp, rr, tipo, zHi, zLo, H }); ultimaClave = clave; }
        } else if (ultimaClave) { setup.ordenes.push({ t: VL.t[m], cancelar: true }); ultimaClave = ''; }
        // ¿qué pasó en la vela m?
        const o = setup.ordenes[setup.ordenes.length - 1];
        if (ultimaClave && o && !o.cancelar && VL.l[m] <= o.entrada) { setup.fin = m; setup.motivo = 'llenada'; break; }
        if (VL.l[m] < ext) { setup.fin = m; setup.motivo = 'invalidado'; break; }
        if (ultimaClave && o && VL.h[m] >= o.tp) { setup.fin = m; setup.motivo = 'objetivo sin entrada'; break; }
        H = Math.max(H, VL.h[m]);
      }
      if (setup.fin < 0) { setup.fin = Math.min(n - 1, mFin); setup.motivo = 'vencido'; }
      setup.tFin = VL.t[setup.fin] + (setup.motivo === 'vencido' ? 0 : ltfMs);
      setups.push(setup);
    }
    return setups;
  }

  const memo = new WeakMap();
  function cache(M1, clave, fn) { let c = memo.get(M1); if (!c) { c = new Map(); memo.set(M1, c); } if (!c.has(clave)) c.set(clave, fn()); return c.get(clave); }
  function setupA(M1, p = {}) {
    const htf = p.htf || 60, ltf = p.ltf || 5;
    const htfMs = htf >= 1440 ? 86400000 : htf * 60000, ltfMs = ltf * 60000;
    const VH = LUX.velas(M1, htf), VL = LUX.velas(M1, ltf);
    const niveles = cache(M1, 'niv:' + htf, () => liquidez(M1, VH, htfMs, p));
    const dirTf = p.direccion && p.direccion !== 'ninguna' ? Number(p.direccion) : 0;
    const dirEn = dirTf ? cache(M1, 'dir:' + dirTf, () => direccion(M1, dirTf)) : null;
    const alc = buscarAlcistas(VH, VL, htfMs, ltfMs, niveles, p, dirEn, 1);
    const nivEsp = niveles.map((z) => ({ p: -z.p, lado: -z.lado, tipo: z.tipo, t: z.t, tomado: z.tomado }));
    const baj = buscarAlcistas(espejo(VH), espejo(VL), htfMs, ltfMs, nivEsp, p, dirEn, -1);
    for (const s of baj) {
      s.ext = -s.ext; s.nivelBarrido = -s.nivelBarrido; s.nivelCde = -s.nivelCde;
      for (const o of s.ordenes) if (!o.cancelar) { o.entrada = -o.entrada; o.sl = -o.sl; o.tp = -o.tp; o.zHi = -o.zHi; o.zLo = -o.zLo; o.H = -o.H; }
    }
    return { setups: alc.concat(baj).sort((a, b) => a.tSweep - b.tSweep), niveles };
  }

  function senales(M1, p = {}) {
    const r = setupA(M1, p);
    const out = [];
    for (const s of r.setups) {
      for (const o of s.ordenes) {
        if (o.cancelar) { out.push({ t: o.t, cancelar: true }); continue; }
        out.push({ t: o.t, dir: s.dir, tipo: 'limit', precio: o.entrada, slPrecio: o.sl, tpPrecio: o.tp, expira: s.tFin, anula: { dir: s.dir, nivel: s.ext }, reemplaza: true, etiqueta: `A+ ${s.dir === 1 ? 'alcista' : 'bajista'} · ${s.tipos.join('/')} · ${o.tipo}` });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  const API = { setupA, senales, SESIONES, enSesion, fractales, limpiar: (M1) => memo.delete(M1) };
  if (esNode) module.exports = API;
  else raiz.SETUPS = API;
})(typeof window !== 'undefined' ? window : globalThis);
