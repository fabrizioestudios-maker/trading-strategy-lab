/* Biblioteca de indicadores de LuxAlgo (SMC e ICT) para backtesting y para el reproductor.
 * Cada función recibe velas V = {t, o, h, l, c, length} de una temporalidad y es causal: lo que devuelve para la vela i
 * usa solo velas hasta i. Los scripts originales son de LuxAlgo (TradingView, licencia CC BY-NC-SA 4.0): esto es una
 * reproducción para backtesting personal, no comercial. "Fidelidad" indica qué tan seguro es el parecido con el código:
 *   alta = reproducido del código conocido; media = de la descripción oficial y la lógica conocida; baja = aproximación;
 *   verificada = comparada con el código fuente de la biblioteca de LuxAlgo (recibido por su conector el 26/11/2026).
 */
(function (raiz) {
  'use strict';
  const M = typeof module !== 'undefined' && module.exports ? require('./motores.js') : raiz.REPM;

  // ---------- utilidades ----------
  function atrRma(V, n) { // ta.atr(n): RMA del rango verdadero (NaN hasta tener n velas)
    const out = new Float64Array(V.length).fill(NaN);
    let s = 0, r = NaN;
    for (let i = 0; i < V.length; i++) {
      const tr = i ? Math.max(V.h[i] - V.l[i], Math.abs(V.h[i] - V.c[i - 1]), Math.abs(V.l[i] - V.c[i - 1])) : V.h[i] - V.l[i];
      if (i < n) { s += tr; if (i === n - 1) { r = s / n; out[i] = r; } } else { r = (r * (n - 1) + tr) / n; out[i] = r; }
    }
    return out;
  }
  // Máximo / mínimo de las últimas n velas incluyendo la actual (ta.highest / ta.lowest), con cola monótona.
  function maxVentana(x, n) {
    const out = new Float64Array(x.length), q = new Int32Array(x.length); let a = 0, b = 0;
    for (let i = 0; i < x.length; i++) { while (b > a && x[q[b - 1]] <= x[i]) b--; q[b++] = i; if (q[a] <= i - n) a++; out[i] = x[q[a]]; }
    return out;
  }
  function minVentana(x, n) {
    const out = new Float64Array(x.length), q = new Int32Array(x.length); let a = 0, b = 0;
    for (let i = 0; i < x.length; i++) { while (b > a && x[q[b - 1]] >= x[i]) b--; q[b++] = i; if (q[a] <= i - n) a++; out[i] = x[q[a]]; }
    return out;
  }
  const nuevoPivote = () => ({ cur: NaN, ant: NaN, cruzado: false, idx: -1, prev: NaN });

  // =====================================================================================================
  // Smart Money Concepts (SMC) [LuxAlgo] — versión 2024. Fidelidad: verificada con el código (26/11/2026).
  // Estructura interna (largo 5) y de swing (largo 50) por "piernas": un máximo de swing se confirma cuando high[size]
  // supera los máximos de las últimas size velas y la pierna pasa de alcista a bajista. BOS/CHoCH cuando el cierre cruza
  // el último nivel. En cada ruptura se guarda el Order Block: la vela con el mínimo (o máximo) "procesado" entre el
  // giro y la ruptura (las velas muy volátiles, rango >= 2 ATR(200), se invierten). FVG con umbral automático.
  // =====================================================================================================
  function smc(V, o = {}) {
    const n = V.length;
    const swingLen = o.swingLen || 50, intLen = o.intLen || 5, eqLen = o.eqLen || 3, eqThr = o.eqThr == null ? 0.1 : o.eqThr;
    const mitigCierre = o.mitigacion === 'cierre', filtroCmr = o.filtro === 'cmr', confluencia = !!o.confluencia, fvgAuto = o.fvgAuto !== false;
    const atr = atrRma(V, 200);
    const pH = new Float64Array(n), pL = new Float64Array(n);
    let cumTr = 0;
    const hmax = {}, lmin = {};
    for (const s of [swingLen, intLen, eqLen]) { hmax[s] = maxVentana(V.h, s); lmin[s] = minVentana(V.l, s); }
    const legs = {}, legPrev = {};
    for (const s of [swingLen, intLen, eqLen]) { legs[s] = 0; legPrev[s] = 0; }
    const swH = nuevoPivote(), swL = nuevoPivote(), inH = nuevoPivote(), inL = nuevoPivote(), eqH = nuevoPivote(), eqL = nuevoPivote();
    const tendSw = new Int8Array(n), tendIn = new Int8Array(n);
    let biasSw = 0, biasIn = 0;
    const estructuras = [], obs = [], fvgs = [], eqs = [], giros = [];
    const obVivos = { int: [], sw: [] };
    let fvgVivos = [];
    let cumDelta = 0;
    const trailing = { top: NaN, bot: NaN, topI: -1, botI: -1 };
    const evento = new Int8Array(n); // marca de rupturas para consultas rápidas
    function giro(size, tipoEq, interno, i) {
      const k = i - size;
      let leg = legs[size];
      if (k >= 0) {
        if (V.h[k] > hmax[size][i]) leg = 0; else if (V.l[k] < lmin[size][i]) leg = 1;
      }
      const cambio = leg - legPrev[size];
      legs[size] = leg; legPrev[size] = leg;
      if (cambio === 0 || k < 0) return;
      if (cambio === 1) { // mínimo confirmado en k
        const p = tipoEq ? eqL : interno ? inL : swL;
        if (tipoEq && !isNaN(p.cur) && Math.abs(p.cur - V.l[k]) < eqThr * atr[i]) eqs.push({ tipo: 'EQL', dir: -1, nivel: Math.min(p.cur, V.l[k]), p1: p.cur, p2: V.l[k], i1: p.idx, i2: k, i, usado: false });
        p.ant = p.cur; p.cur = V.l[k]; p.cruzado = false; p.idx = k;
        if (!tipoEq && !interno) { trailing.bot = p.cur; trailing.botI = k; giros.push({ i: k, conf: i, p: p.cur, alto: false, tipo: isNaN(p.ant) ? 'L' : p.cur < p.ant ? 'LL' : 'HL' }); }
      } else {
        const p = tipoEq ? eqH : interno ? inH : swH;
        if (tipoEq && !isNaN(p.cur) && Math.abs(p.cur - V.h[k]) < eqThr * atr[i]) eqs.push({ tipo: 'EQH', dir: 1, nivel: Math.max(p.cur, V.h[k]), p1: p.cur, p2: V.h[k], i1: p.idx, i2: k, i, usado: false });
        p.ant = p.cur; p.cur = V.h[k]; p.cruzado = false; p.idx = k;
        if (!tipoEq && !interno) { trailing.top = p.cur; trailing.topI = k; giros.push({ i: k, conf: i, p: p.cur, alto: true, tipo: isNaN(p.ant) ? 'H' : p.cur > p.ant ? 'HH' : 'LH' }); }
      }
    }
    function guardarOB(p, interno, dir, i) {
      if (p.idx < 0 || p.idx >= i) return null;
      let mejor = p.idx;
      for (let k = p.idx + 1; k < i; k++) if (dir === 1 ? pL[k] < pL[mejor] : pH[k] > pH[mejor]) mejor = k;
      const ob = { interno, dir, top: pH[mejor], bot: pL[mejor], i0: mejor, creado: i, mitigado: -1 };
      obs.push(ob);
      const l = interno ? obVivos.int : obVivos.sw;
      l.unshift(ob); if (l.length > 100) l.pop();
      return ob;
    }
    function estructura(interno, i) {
      const pHh = interno ? inH : swH, pLl = interno ? inL : swL;
      let bullBar = true, bearBar = true;
      if (interno && confluencia) { const top = V.h[i] - Math.max(V.c[i], V.o[i]), bot = Math.min(V.c[i], V.o[i] - V.l[i]); bullBar = top > bot; bearBar = top < bot; }
      const extraAl = interno ? pHh.cur !== swH.cur && bullBar : true;
      const extraBa = interno ? pLl.cur !== swL.cur && bearBar : true;
      if (i > 0 && V.c[i] > pHh.cur && V.c[i - 1] <= pHh.prev && !pHh.cruzado && extraAl) {
        const bias = interno ? biasIn : biasSw;
        const tipo = bias === -1 ? 'CHoCH' : 'BOS';
        pHh.cruzado = true;
        if (interno) biasIn = 1; else biasSw = 1;
        const ob = guardarOB(pHh, interno, 1, i);
        estructuras.push({ i, dir: 1, tipo, nivel: pHh.cur, desde: pHh.idx, interno, ob });
        evento[i] |= interno ? 1 : 4;
      }
      if (i > 0 && V.c[i] < pLl.cur && V.c[i - 1] >= pLl.prev && !pLl.cruzado && extraBa) {
        const bias = interno ? biasIn : biasSw;
        const tipo = bias === 1 ? 'CHoCH' : 'BOS';
        pLl.cruzado = true;
        if (interno) biasIn = -1; else biasSw = -1;
        const ob = guardarOB(pLl, interno, -1, i);
        estructuras.push({ i, dir: -1, tipo, nivel: pLl.cur, desde: pLl.idx, interno, ob });
        evento[i] |= interno ? 2 : 8;
      }
    }
    for (let i = 0; i < n; i++) {
      const tr = i ? Math.max(V.h[i] - V.l[i], Math.abs(V.h[i] - V.c[i - 1]), Math.abs(V.l[i] - V.c[i - 1])) : V.h[i] - V.l[i];
      cumTr += tr;
      const vol = filtroCmr ? (i ? cumTr / i : NaN) : atr[i];
      const alta = V.h[i] - V.l[i] >= 2 * vol;
      pH[i] = alta ? V.l[i] : V.h[i]; pL[i] = alta ? V.h[i] : V.l[i];
      giro(swingLen, false, false, i);
      giro(intLen, false, true, i);
      giro(eqLen, true, false, i);
      estructura(true, i);
      estructura(false, i);
      // mitigación de order blocks
      for (const clave of ['int', 'sw']) {
        const l = obVivos[clave];
        for (let j = l.length - 1; j >= 0; j--) {
          const ob = l[j];
          const fuera = ob.dir === -1 ? (mitigCierre ? V.c[i] : V.h[i]) > ob.top : (mitigCierre ? V.c[i] : V.l[i]) < ob.bot;
          if (fuera) { ob.mitigado = i; l.splice(j, 1); }
        }
      }
      // fair value gaps
      if (fvgVivos.length) {
        const quedan = [];
        for (const f of fvgVivos) { if ((f.dir === 1 && V.l[i] < f.bot) || (f.dir === -1 && V.h[i] > f.top)) f.mitigado = i; else quedan.push(f); }
        fvgVivos = quedan;
      }
      const delta = i >= 1 ? (V.c[i - 1] - V.o[i - 1]) / (V.o[i - 1] * 100) : 0;
      cumDelta += Math.abs(delta);
      if (i >= 2) {
        const umbral = fvgAuto ? (cumDelta / i) * 2 : 0;
        if (V.l[i] > V.h[i - 2] && V.c[i - 1] > V.h[i - 2] && delta > umbral) { const f = { dir: 1, top: V.l[i], bot: V.h[i - 2], i, mitigado: -1 }; fvgs.push(f); fvgVivos.unshift(f); }
        if (V.h[i] < V.l[i - 2] && V.c[i - 1] < V.l[i - 2] && -delta > umbral) { const f = { dir: -1, top: V.l[i - 2], bot: V.h[i], i, mitigado: -1 }; fvgs.push(f); fvgVivos.unshift(f); }
        if (fvgVivos.length > 500) fvgVivos.length = 500;
      }
      // extremos para premium/discount
      if (!isNaN(trailing.top) && V.h[i] > trailing.top) { trailing.top = V.h[i]; trailing.topI = i; }
      if (!isNaN(trailing.bot) && V.l[i] < trailing.bot) { trailing.bot = V.l[i]; trailing.botI = i; }
      tendSw[i] = biasSw; tendIn[i] = biasIn;
      for (const p of [swH, swL, inH, inL]) p.prev = p.cur;
    }
    return { estructuras, obs, fvgs, eqs, giros, tendSw, tendIn, trailing, evento, obVivos, fvgVivos, atr };
  }

  // =====================================================================================================
  // Fair Value Gap [LuxAlgo]. Fidelidad: verificada con el código (26/11/2026).
  // Alcista: low > high[2], close[1] > high[2] y (low - high[2]) / high[2] > umbral. Bajista al revés.
  // Umbral: 0 % por defecto (como el indicador); con auto, promedio acumulado de (high - low) / low.
  // Mitigado cuando el cierre pasa el extremo opuesto.
  // =====================================================================================================
  function fvgLux(V, o = {}) {
    const n = V.length, auto = !!o.auto, umbralFijo = (o.umbralPct || 0) / 100;
    const out = [];
    let vivos = [], cum = 0;
    for (let i = 0; i < n; i++) {
      cum += (V.h[i] - V.l[i]) / V.l[i];
      const umbral = auto ? (i ? cum / i : Infinity) : umbralFijo;
      if (vivos.length) {
        const q = [];
        for (const f of vivos) { if ((f.dir === 1 && V.c[i] < f.bot) || (f.dir === -1 && V.c[i] > f.top)) f.mitigado = i; else q.push(f); }
        vivos = q;
      }
      if (i < 2) continue;
      if (V.l[i] > V.h[i - 2] && V.c[i - 1] > V.h[i - 2] && (V.l[i] - V.h[i - 2]) / V.h[i - 2] > umbral) { const f = { dir: 1, top: V.l[i], bot: V.h[i - 2], i, mitigado: -1 }; out.push(f); vivos.push(f); }
      if (V.h[i] < V.l[i - 2] && V.c[i - 1] < V.l[i - 2] && (V.l[i - 2] - V.h[i]) / V.h[i] > umbral) { const f = { dir: -1, top: V.l[i - 2], bot: V.h[i], i, mitigado: -1 }; out.push(f); vivos.push(f); }
      if (vivos.length > 500) vivos.splice(0, vivos.length - 500);
    }
    return { fvgs: out };
  }

  // =====================================================================================================
  // Order Blocks & Breaker Blocks [LuxAlgo]. Fidelidad: verificada con el código (26/11/2026).
  // Giros por "os" (high[len] > máximo de las últimas len velas). Al cerrar por encima del último máximo de giro se crea
  // un OB alcista: la vela con el mínimo más bajo entre el giro y la ruptura. Se vuelve breaker cuando el cuerpo cierra
  // debajo del OB y se borra cuando un cierre vuelve a superar su techo (al revés para los bajistas).
  // =====================================================================================================
  function obBreaker(V, o = {}) {
    const n = V.length, len = o.largo || 10, cuerpo = !!o.cuerpo;
    const hm = maxVentana(V.h, len), lm = minVentana(V.l, len);
    const mx = new Float64Array(n), mn = new Float64Array(n);
    for (let i = 0; i < n; i++) { mx[i] = cuerpo ? Math.max(V.c[i], V.o[i]) : V.h[i]; mn[i] = cuerpo ? Math.min(V.c[i], V.o[i]) : V.l[i]; }
    let os = 0, osPrev = 0;
    let topY = NaN, topX = -1, topCruz = true, btmY = NaN, btmX = -1, btmCruz = true;
    const todos = [], alc = [], baj = [];
    for (let i = 0; i < n; i++) {
      if (i >= len) { if (V.h[i - len] > hm[i]) os = 0; else if (V.l[i - len] < lm[i]) os = 1; }
      const top = os === 0 && osPrev !== 0 && i >= len ? V.h[i - len] : 0;
      const btm = os === 1 && osPrev !== 1 && i >= len ? V.l[i - len] : 0;
      osPrev = os;
      if (top) { topCruz = false; topY = top; topX = i - len; }
      if (btm) { btmCruz = false; btmY = btm; btmX = i - len; }
      if (V.c[i] > topY && !topCruz) {
        topCruz = true;
        let minima = Infinity, maxima = NaN, loc = i - 1;
        for (let k = 1; k <= i - topX - 1; k++) { if (mn[i - k] <= minima) { minima = mn[i - k]; maxima = mx[i - k]; loc = i - k; } }
        if (isFinite(minima)) { const ob = { dir: 1, top: maxima, btm: minima, i0: loc, creado: i, breaker: false, rotura: -1, borrado: -1 }; todos.push(ob); alc.unshift(ob); }
      }
      if (V.c[i] < btmY && !btmCruz) {
        btmCruz = true;
        let maxima = -Infinity, minima = NaN, loc = i - 1;
        for (let k = 1; k <= i - btmX - 1; k++) { if (mx[i - k] >= maxima) { maxima = mx[i - k]; minima = mn[i - k]; loc = i - k; } }
        if (isFinite(maxima)) { const ob = { dir: -1, top: maxima, btm: minima, i0: loc, creado: i, breaker: false, rotura: -1, borrado: -1 }; todos.push(ob); baj.unshift(ob); }
      }
      for (let j = alc.length - 1; j >= 0; j--) {
        const e = alc[j];
        if (!e.breaker) { if (Math.min(V.c[i], V.o[i]) < e.btm) { e.breaker = true; e.rotura = i; } }
        else if (V.c[i] > e.top) { e.borrado = i; alc.splice(j, 1); }
      }
      for (let j = baj.length - 1; j >= 0; j--) {
        const e = baj[j];
        if (!e.breaker) { if (Math.max(V.c[i], V.o[i]) > e.top) { e.breaker = true; e.rotura = i; } }
        else if (V.c[i] < e.btm) { e.borrado = i; baj.splice(j, 1); }
      }
      if (alc.length > 200) alc.length = 200;
      if (baj.length > 200) baj.length = 200;
    }
    return { obs: todos };
  }

  // =====================================================================================================
  // Market Structure CHoCH/BOS (Fractal) [LuxAlgo]. Fidelidad: verificada con el código (26/11/2026).
  // Fractal superior de largo L (p = L/2): p velas con máximos crecientes, el central como máximo de las L velas y p velas
  // con máximos decrecientes. Cierre por encima del último fractal superior = estructura alcista (CHoCH si venía bajista,
  // BOS si no) y soporte en el mínimo del intervalo. Al revés para el inferior.
  // =====================================================================================================
  function msFractal(V, o = {}) {
    const n = V.length, L = o.largo || 5, p = Math.floor(L / 2);
    const hm = maxVentana(V.h, L), lm = minVentana(V.l, L);
    const sgH = new Int8Array(n), sgL = new Int8Array(n);
    for (let i = 1; i < n; i++) { sgH[i] = Math.sign(V.h[i] - V.h[i - 1]); sgL[i] = Math.sign(V.l[i] - V.l[i - 1]); }
    const dh = new Int32Array(n), dl = new Int32Array(n);
    let sH = 0, sL = 0;
    for (let i = 0; i < n; i++) { sH += sgH[i]; sL += sgL[i]; if (i >= p) { sH -= sgH[i - p]; sL -= sgL[i - p]; } dh[i] = sH; dl[i] = sL; }
    const arriba = { v: NaN, loc: -1, cruzado: true }, abajo = { v: NaN, loc: -1, cruzado: true };
    let os = 0;
    const estructuras = [], niveles = [];
    let sop = null, res = null;
    for (let i = 0; i < n; i++) {
      if (i >= L && dh[i] === -p && dh[i - p] === p && V.h[i - p] === hm[i]) { arriba.v = V.h[i - p]; arriba.loc = i - p; arriba.cruzado = false; }
      if (i >= L && dl[i] === p && dl[i - p] === -p && V.l[i - p] === lm[i]) { abajo.v = V.l[i - p]; abajo.loc = i - p; abajo.cruzado = false; }
      if (i > 0 && V.c[i] > arriba.v && V.c[i - 1] <= arriba.v && !arriba.cruzado) {
        let mn = V.l[i - 1], k = 1;
        for (let j = 2; j <= i - arriba.loc - 1; j++) if (V.l[i - j] <= mn) { mn = V.l[i - j]; k = j; }
        const tipo = os === -1 ? 'CHoCH' : 'BOS';
        sop = { tipo: 'soporte', p: mn, i0: i - k, roto: -1 }; niveles.push(sop);
        estructuras.push({ i, dir: 1, tipo, nivel: arriba.v, desde: arriba.loc, sr: mn });
        os = 1; arriba.cruzado = true;
      } else if (sop && sop.roto < 0 && V.c[i] < sop.p) sop.roto = i;
      if (i > 0 && V.c[i] < abajo.v && V.c[i - 1] >= abajo.v && !abajo.cruzado) {
        let mx = V.h[i - 1], k = 1;
        for (let j = 2; j <= i - abajo.loc - 1; j++) if (V.h[i - j] >= mx) { mx = V.h[i - j]; k = j; }
        const tipo = os === 1 ? 'CHoCH' : 'BOS';
        res = { tipo: 'resistencia', p: mx, i0: i - k, roto: -1 }; niveles.push(res);
        estructuras.push({ i, dir: -1, tipo, nivel: abajo.v, desde: abajo.loc, sr: mx });
        os = -1; abajo.cruzado = true;
      } else if (res && res.roto < 0 && V.c[i] > res.p) res.roto = i;
    }
    return { estructuras, niveles };
  }

  // =====================================================================================================
  // Inversion Fair Value Gaps (IFVG) [LuxAlgo]. Fidelidad: verificada con el código (26/11/2026).
  // FVG alcista: low > high[2], close[1] > high[2] y ancho > ATR(200) × 0,25 (antes de tener ATR: rango promedio).
  // Se invierte cuando el cuerpo de una vela queda entero debajo del FVG (mín(apertura, cierre) < piso); uno bajista,
  // cuando el cuerpo queda entero arriba. La vela de la inversión no da señal. Señal (por defecto "Close"): el cierre sale
  // de la zona invertida en la dirección nueva y el cierre anterior (o la mecha, en modo "Wick") estaba dentro de la zona.
  // La zona se borra cuando el cuerpo la atraviesa del otro lado. Hasta 100 FVG y 100 inversiones por lado.
  // =====================================================================================================
  function ifvg(V, o = {}) {
    const n = V.length, mult = o.atrMult == null ? 0.25 : o.atrMult, porMecha = o.senal === 'mecha', BUF = 100;
    const atr = atrRma(V, 200);
    const fv = { 1: [], '-1': [] }, inv = { 1: [], '-1': [] };
    const inversiones = [], senales = [];
    let cumR = 0;
    for (let i = 0; i < n; i++) {
      cumR += V.h[i] - V.l[i];
      const a = isNaN(atr[i]) ? cumR / (i + 1) : atr[i] * mult;
      const cTop = Math.max(V.o[i], V.c[i]), cBot = Math.min(V.o[i], V.c[i]);
      if (i >= 2) {
        if (V.l[i] > V.h[i - 2] && V.c[i - 1] > V.h[i - 2] && Math.abs(V.l[i] - V.h[i - 2]) > a) fv[1].push({ top: V.l[i], bot: V.h[i - 2], i0: i });
        if (V.h[i] < V.l[i - 2] && V.c[i - 1] < V.l[i - 2] && Math.abs(V.l[i - 2] - V.h[i]) > a) fv[-1].push({ top: V.l[i - 2], bot: V.h[i], i0: i });
      }
      for (const d of [1, -1]) {
        const ar = fv[d];
        if (ar.length >= BUF) ar.shift();
        for (let k = ar.length - 1; k >= 0; k--) {
          const f = ar[k];
          if ((d === 1 && cBot < f.bot) || (d === -1 && cTop > f.top)) {
            ar.splice(k, 1);
            const z = { dir: -d, top: f.top, bot: f.bot, i0: f.i0, desde: i, fin: -1, estado: 0 };
            inv[d].push(z); inversiones.push(z);
          }
        }
      }
      for (const d of [1, -1]) {
        const ar = inv[d];
        if (ar.length >= BUF) ar.shift();
        let disparo = false;
        for (let k = ar.length - 1; k >= 0; k--) {
          const z = ar[k];
          if (z.estado === 0) { z.estado = 1; continue; }
          const ref = porMecha ? (z.dir === -1 ? V.h[i] : V.l[i]) : V.c[i - 1];
          if (z.dir === -1 && V.c[i] < z.bot && ref >= z.bot && ref < z.top) { if (!disparo) senales.push({ i, dir: -1, z }); disparo = true; }
          if (z.dir === 1 && V.c[i] > z.top && ref <= z.top && ref > z.bot) { if (!disparo) senales.push({ i, dir: 1, z }); disparo = true; }
          if ((z.dir === -1 && cTop > z.top) || (z.dir === 1 && cBot < z.bot)) { z.fin = i; ar.splice(k, 1); }
        }
      }
    }
    return { inversiones, senales };
  }

  // =====================================================================================================
  // Liquidity Sweeps [LuxAlgo]. Fidelidad: verificada con el código (26/11/2026) en los modos "Only Wicks" y "Only Outbreaks & Retest".
  // Niveles de liquidez = pivotes (largo L a cada lado). Barrida por mecha: el máximo pasa el nivel y el cierre queda
  // debajo (bajista); al revés en mínimos. Ruptura y retesteo: un cierre rompe el nivel y después una vela lo retestea
  // con mecha y cierra del lado de la ruptura.
  // =====================================================================================================
  function liqSweeps(V, o = {}) {
    const n = V.length, L = o.largo || 5, modo = o.modo || 'mechas';
    const { ph, pl } = M.pivotes(V.h, V.l, L, L);
    const niveles = [], barridas = [];
    let vivos = [];
    for (let i = 0; i < n; i++) {
      if (!isNaN(ph[i])) { const z = { alto: true, p: ph[i], i0: i - L, roto: false, fin: -1 }; niveles.push(z); vivos.push(z); }
      if (!isNaN(pl[i])) { const z = { alto: false, p: pl[i], i0: i - L, roto: false, fin: -1 }; niveles.push(z); vivos.push(z); }
      const q = [];
      for (const z of vivos) {
        if (z.i0 + L >= i) { q.push(z); continue; }
        let usado = false;
        if (z.alto) {
          if (!z.roto) {
            if (V.h[i] > z.p && V.c[i] < z.p && (modo !== 'retesteo')) { barridas.push({ i, dir: -1, nivel: z.p, extremo: V.h[i], tipo: 'mecha' }); usado = true; }
            else if (V.c[i] > z.p) z.roto = true;
          } else if (modo !== 'mechas' && V.l[i] < z.p && V.c[i] > z.p) { barridas.push({ i, dir: 1, nivel: z.p, extremo: V.l[i], tipo: 'retesteo' }); usado = true; }
          else if (z.roto && V.c[i] < z.p) usado = true;
        } else {
          if (!z.roto) {
            if (V.l[i] < z.p && V.c[i] > z.p && (modo !== 'retesteo')) { barridas.push({ i, dir: 1, nivel: z.p, extremo: V.l[i], tipo: 'mecha' }); usado = true; }
            else if (V.c[i] < z.p) z.roto = true;
          } else if (modo !== 'mechas' && V.h[i] > z.p && V.c[i] < z.p) { barridas.push({ i, dir: -1, nivel: z.p, extremo: V.h[i], tipo: 'retesteo' }); usado = true; }
          else if (z.roto && V.c[i] > z.p) usado = true;
        }
        if (usado) z.fin = i; else q.push(z);
      }
      vivos = q.length > 300 ? q.slice(-300) : q;
    }
    return { niveles, barridas };
  }

  // =====================================================================================================
  // Pure Price Action Structures [LuxAlgo] (giros de corto, mediano y largo plazo de ICT). Fidelidad: verificada con el código (26/11/2026).
  // Máximo de corto plazo: vela con máximo mayor que la anterior y la siguiente. Mediano plazo: máximo de corto plazo
  // con máximos de corto plazo menores a cada lado; largo plazo: igual con los de mediano plazo.
  // MSS si el cierre cruza el último giro de ese nivel en contra de la tendencia; BOS si es a favor.
  // =====================================================================================================
  function ppaEstructuras(V) {
    const n = V.length;
    const niv = [0, 1, 2].map(() => ({ altos: [], bajos: [], ultAlto: null, ultBajo: null, tend: 0 }));
    const estructuras = [], giros = [];
    function agregar(nivel, alto, g, i) {
      const N = niv[nivel];
      const lista = alto ? N.altos : N.bajos;
      lista.push(g);
      if (alto) N.ultAlto = Object.assign({ cruzado: false }, g); else N.ultBajo = Object.assign({ cruzado: false }, g);
      giros.push({ nivel, alto, i: g.i, conf: i, p: g.p });
      if (nivel < 2 && lista.length >= 3) {
        const a = lista[lista.length - 3], b = lista[lista.length - 2], c = lista[lista.length - 1];
        if (alto ? b.p > a.p && b.p >= c.p : b.p < a.p && b.p <= c.p) agregar(nivel + 1, alto, b, i);
      }
    }
    for (let i = 2; i < n; i++) {
      if (V.l[i - 1] < V.l[i - 2] && V.l[i - 1] <= V.l[i]) agregar(0, false, { i: i - 1, p: V.l[i - 1] }, i);
      if (V.h[i - 1] > V.h[i - 2] && V.h[i - 1] >= V.h[i]) agregar(0, true, { i: i - 1, p: V.h[i - 1] }, i);
      for (let nivel = 0; nivel < 3; nivel++) {
        const N = niv[nivel];
        if (N.ultBajo && !N.ultBajo.cruzado && V.c[i] < N.ultBajo.p) {
          N.ultBajo.cruzado = true;
          estructuras.push({ i, nivel, dir: -1, tipo: N.tend === 1 ? 'MSS' : 'BOS', nivel_p: N.ultBajo.p, desde: N.ultBajo.i, sl: N.ultAlto ? N.ultAlto.p : NaN });
          N.tend = -1;
        }
        if (N.ultAlto && !N.ultAlto.cruzado && V.c[i] > N.ultAlto.p) {
          N.ultAlto.cruzado = true;
          estructuras.push({ i, nivel, dir: 1, tipo: N.tend === -1 ? 'MSS' : 'BOS', nivel_p: N.ultAlto.p, desde: N.ultAlto.i, sl: N.ultBajo ? N.ultBajo.p : NaN });
          N.tend = 1;
        }
      }
    }
    return { estructuras, giros };
  }

  // =====================================================================================================
  // Setups de la biblioteca de LuxAlgo (código completo recibido por el conector el 26/11/2026; reglas verificadas).
  // =====================================================================================================

  // 3-Step Institutional Trap. Paso 1: el mínimo perfora el mínimo de las 20 velas anteriores. Paso 2: dentro de 3 velas
  // (contando la de la barrida) una vela cierra de vuelta por encima del nivel; su máximo es el gatillo. Paso 3: dentro de
  // las 10 velas siguientes el cierre cruza el gatillo → compra. Al revés para ventas. El indicador no trae SL ni TP: para
  // el backtest el SL va detrás del extremo de la trampa (el mínimo más bajo desde la barrida).
  function trampa3(V, o = {}) {
    const n = V.length, lb = o.lookback || 20, w2 = o.paso2 || 3, w3 = o.paso3 || 10;
    const hmax = maxVentana(V.h, lb), lmin = minVentana(V.l, lb);
    const senales = [];
    const L = { st: 0, tm: 0, lvl: NaN, trig: NaN, ant: NaN, ext: NaN, i0: -1 };
    const S = { st: 0, tm: 0, lvl: NaN, trig: NaN, ant: NaN, ext: NaN, i0: -1 };
    for (let i = lb; i < n; i++) {
      const rH = hmax[i - 1], rL = lmin[i - 1];
      if (V.l[i] < rL && L.st === 0) { L.st = 1; L.lvl = rL; L.tm = w2; L.ext = V.l[i]; L.i0 = i; }
      if (L.st > 0) L.ext = Math.min(L.ext, V.l[i]);
      if (L.st === 1 && L.tm > 0) {
        if (V.c[i] > L.lvl) { L.st = 2; L.tm = w3; L.trig = V.h[i]; } else L.trig = Math.max(isNaN(L.trig) ? 0 : L.trig, V.h[i]);
      }
      if (L.st === 2 && L.tm > 0 && V.c[i] > L.trig && V.c[i - 1] <= L.ant) {
        senales.push({ i, dir: 1, nivel: L.lvl, gatillo: L.trig, extremo: L.ext, iBarrida: L.i0 }); L.st = 0; L.tm = 0;
      }
      L.tm = L.tm > 0 ? L.tm - 1 : 0; if (L.tm === 0) L.st = 0;
      L.ant = L.trig;
      if (V.h[i] > rH && S.st === 0) { S.st = 1; S.lvl = rH; S.tm = w2; S.ext = V.h[i]; S.i0 = i; }
      if (S.st > 0) S.ext = Math.max(S.ext, V.h[i]);
      if (S.st === 1 && S.tm > 0) {
        if (V.c[i] < S.lvl) { S.st = 2; S.tm = w3; S.trig = V.l[i]; } else S.trig = Math.min(isNaN(S.trig) ? 1e10 : S.trig, V.l[i]);
      }
      if (S.st === 2 && S.tm > 0 && V.c[i] < S.trig && V.c[i - 1] >= S.ant) {
        senales.push({ i, dir: -1, nivel: S.lvl, gatillo: S.trig, extremo: S.ext, iBarrida: S.i0 }); S.st = 0; S.tm = 0;
      }
      S.tm = S.tm > 0 ? S.tm - 1 : 0; if (S.tm === 0) S.st = 0;
      S.ant = S.trig;
    }
    return { senales };
  }

  // MSS Sweep Fib Retrace. Giros con pivotes 5/5. Compra: con máximos de giro descendentes (y cierre bajo la EMA 200 si el
  // filtro macro está activo), una vela perfora el último mínimo de giro y cierra arriba (barrida). El MSS es un cierre
  // por encima del último máximo de giro con al menos 3 velas alcistas seguidas; si cierra arriba sin ese impulso, el
  // setup se cancela. Entrada limit en el 50 % del tramo (mínimo de la barrida → máximo del tramo hasta el MSS). Se cancela
  // si el precio perfora el mínimo de la barrida. SL y TP del indicador: 1,5 y 2 ATR(14) desde la entrada (se usa el ATR
  // de la vela del MSS, el que se conoce al poner la orden). Al revés para ventas.
  function mssFib(V, o = {}) {
    const n = V.length, izq = o.izq || 5, der = o.der || 5, macro = o.macro !== false, mom = o.momentum == null ? 3 : o.momentum;
    const kSl = o.slAtr || 1.5, kTp = o.tpAtr || 2, vig = o.vigencia || Infinity; // vigencia: velas máximas por fase (el original no tiene)
    const ema = M.ema(V.c, o.ema || 200), atr = atrRma(V, o.atr || 14);
    const { ph, pl } = M.pivotes(V.h, V.l, izq, der);
    let prevPh = NaN, lastPh = NaN, prevPl = NaN, lastPl = NaN;
    let st = 0, swH = NaN, swL = NaN, legH = NaN, legL = NaN, mss = NaN, iMss = -1, iSw = -1, alc = 0, baj = 0;
    const setups = [];
    for (let i = 0; i < n; i++) {
      if (!isNaN(ph[i])) { prevPh = lastPh; lastPh = ph[i]; }
      if (!isNaN(pl[i])) { prevPl = lastPl; lastPl = pl[i]; }
      const bajista = !isNaN(prevPh) && !isNaN(lastPh) && lastPh < prevPh;
      const alcista = !isNaN(prevPl) && !isNaN(lastPl) && lastPl > prevPl;
      alc = V.c[i] > V.o[i] ? alc + 1 : 0; baj = V.c[i] < V.o[i] ? baj + 1 : 0;
      if (bajista && (!macro || V.c[i] < ema[i]) && !isNaN(lastPl) && V.l[i] < lastPl && V.c[i] > lastPl && st === 0) { st = 2; swL = V.l[i]; iSw = i; mss = lastPh; legL = V.l[i]; legH = V.h[i]; }
      if (alcista && (!macro || V.c[i] > ema[i]) && !isNaN(lastPh) && V.h[i] > lastPh && V.c[i] < lastPh && st === 0) { st = 1; swH = V.h[i]; iSw = i; mss = lastPl; legH = V.h[i]; legL = V.l[i]; }
      if (st === 1) { if (V.l[i] <= legL) legL = V.l[i]; if (V.h[i] > swH) st = 0; }
      if (st === 2) { if (V.h[i] >= legH) legH = V.h[i]; if (V.l[i] < swL) st = 0; }
      if (st === 1 && !isNaN(mss) && V.c[i] < mss) { if (baj >= mom) { st = -1; iMss = i; } else st = 0; }
      if (st === 2 && !isNaN(mss) && V.c[i] > mss) { if (alc >= mom) { st = -2; iMss = i; } else st = 0; }
      if (st === -1 && i > iMss) {
        const f = swH - (swH - legL) * 0.5;
        if (V.h[i] >= f) { st = 0; const a = atr[iMss]; setups.push({ iSw, iMss, iEnt: i, dir: -1, fib: f, sl: f + a * kSl, tp: f - a * kTp, extremo: swH }); }
      }
      if (st === -2 && i > iMss) {
        const f = swL + (legH - swL) * 0.5;
        if (V.l[i] <= f) { st = 0; const a = atr[iMss]; setups.push({ iSw, iMss, iEnt: i, dir: 1, fib: f, sl: f - a * kSl, tp: f + a * kTp, extremo: swL }); }
      }
      if (st === -1 && V.h[i] > swH) st = 0;
      if (st === -2 && V.l[i] < swL) st = 0;
      if ((st === 1 || st === 2) && i - iSw >= vig) st = 0;
      if ((st === -1 || st === -2) && i - iMss >= vig) st = 0;
    }
    return { setups };
  }

  // AMD FVG Trade Setup. Acumulación: rango de las últimas 30 velas <= 0,2 % dentro de la sesión (Nueva York 08:00–17:00
  // por defecto). Manipulación: dentro de las 10 velas siguientes al fin de la acumulación el precio rompe un extremo del
  // rango. Distribución: aparece un FVG en contra de la ruptura (ancho > 0,1 ATR(14)) con el cierre de vuelta dentro del
  // rango → entrada al cierre. SL a 2 ATR y TP a 2 veces el riesgo. No abre otra mientras la anterior sigue viva.
  function amdFvg(V, o = {}) {
    const n = V.length, acc = o.acumulacion || 30, ancho = o.ancho == null ? 0.2 : o.ancho, ventana = o.ventana || 10;
    const kSl = o.slAtr || 2, rr = o.rrIndicador || 2, fvgAtr = o.fvgAtr == null ? 0.1 : o.fvgAtr;
    const ses = o.sesiones || [[480, 1020]]; // minutos de Nueva York: 08:00–17:00
    const enSes = (i) => { const m = M.minNY(V.t[i]); return ses.some(([a, b]) => (a < b ? m >= a && m < b : m >= a || m < b)); };
    const hmax = maxVentana(V.h, acc), lmin = minVentana(V.l, acc), atr = atrRma(V, 14);
    let accH = NaN, accL = NaN, accFin = -1, mH = false, mL = false, activo = false, dA = 0, slA = NaN, tpA = NaN;
    const senales = [];
    for (let i = 2; i < n; i++) {
      const sesion = enSes(i);
      const acum = i >= acc - 1 && ((hmax[i] - lmin[i]) / lmin[i]) * 100 <= ancho && sesion;
      if (acum) { accH = hmax[i]; accL = lmin[i]; accFin = i; mH = false; mL = false; }
      if (activo) { if (dA === 1 ? V.l[i] <= slA || V.h[i] >= tpA : V.h[i] >= slA || V.l[i] <= tpA) activo = false; }
      if (!acum && !isNaN(accH) && i <= accFin + ventana && sesion) {
        if (!mH && !mL && V.h[i] > accH) mH = true;
        if (mH && V.l[i - 2] - V.h[i] > atr[i] * fvgAtr && V.c[i] < accH && !activo) {
          const d = atr[i] * kSl; slA = V.c[i] + d; tpA = V.c[i] - d * rr; activo = true; dA = -1;
          senales.push({ i, dir: -1, sl: slA, tp: tpA, rango: [accL, accH] }); accH = NaN; mH = false;
        }
        if (!mL && !mH && V.l[i] < accL) mL = true;
        if (mL && V.l[i] - V.h[i - 2] > atr[i] * fvgAtr && V.c[i] > accL && !activo) {
          const d = atr[i] * kSl; slA = V.c[i] - d; tpA = V.c[i] + d * rr; activo = true; dA = 1;
          senales.push({ i, dir: 1, sl: slA, tp: tpA, rango: [accL, accH] }); accH = NaN; mL = false;
        }
      }
    }
    return { senales };
  }

  // FVG + Liquidity Sweep + CISD. FVG de 15 minutos con ancho > 0,5 ATR(14) de 15m (vigente 20 velas o hasta que un cierre
  // lo atraviese). Con el precio dentro de un FVG bajista, una vela barre el máximo de las 20 anteriores y cierra debajo;
  // su mínimo es el gatillo del CISD. Un cierre debajo del gatillo confirma el CISD y la entrada llega con el primer FVG
  // bajista del gráfico. Al revés para compras. El original lee la vela de 15m en formación (repinta en el historial):
  // acá el FVG cuenta desde que cierra la vela de 15m que lo completa. SL detrás del extremo de la barrida.
  function fvgBarridaCisd(V, VH, o = {}) {
    const n = V.length, vm = o.volMult == null ? 0.5 : o.volMult, maxLen = o.maxLen || 20, lb = o.lookback || 20;
    const durH = (o.htf || 15) * 60000, atrH = atrRma(VH, 14);
    const hf = [];
    for (let k = 2; k < VH.length; k++) {
      const gB = VH.l[k - 2] - VH.h[k], gA = VH.l[k] - VH.h[k - 2];
      if (gB > atrH[k] * vm) hf.push({ t: VH.t[k] + durH, top: VH.l[k - 2], bot: VH.h[k], alc: false });
      else if (gA > atrH[k] * vm) hf.push({ t: VH.t[k] + durH, top: VH.l[k], bot: VH.h[k - 2], alc: true });
    }
    const hmax = maxVentana(V.h, lb), lmin = minVentana(V.l, lb);
    let activos = [], q = 0, barrida = false, gat = NaN, bajista = false, esperando = false, ext = NaN;
    const senales = [];
    for (let i = 2; i < n; i++) {
      while (q < hf.length && hf[q].t <= V.t[i]) { activos.push(Object.assign({ ini: i, mit: false }, hf[q])); q++; }
      let cur = null;
      for (let j = activos.length - 1; j >= 0; j--) {
        const f = activos[j]; if (f.mit) continue;
        if ((f.alc && V.c[i] < f.bot) || (!f.alc && V.c[i] > f.top) || i >= f.ini + maxLen) f.mit = true; else cur = f;
      }
      const dentro = cur && V.h[i] >= cur.bot && V.l[i] <= cur.top;
      if (dentro && !cur.alc && V.h[i] > hmax[i - 1] && V.c[i] < hmax[i - 1]) { barrida = true; gat = V.l[i]; bajista = true; ext = V.h[i]; }
      if (dentro && cur.alc && V.l[i] < lmin[i - 1] && V.c[i] > lmin[i - 1]) { barrida = true; gat = V.h[i]; bajista = false; ext = V.l[i]; }
      if (barrida || esperando) ext = bajista ? Math.max(ext, V.h[i]) : Math.min(ext, V.l[i]);
      if (barrida) { if (bajista && V.c[i] < gat) { barrida = false; esperando = true; } else if (!bajista && V.c[i] > gat) { barrida = false; esperando = true; } }
      if (esperando) {
        if (bajista && V.l[i - 2] > V.h[i] && V.c[i - 1] < V.l[i - 2]) { senales.push({ i, dir: -1, extremo: ext, fvgTop: V.l[i - 2], fvgBot: V.h[i] }); esperando = false; }
        else if (!bajista && V.h[i - 2] < V.l[i] && V.c[i - 1] > V.h[i - 2]) { senales.push({ i, dir: 1, extremo: ext, fvgTop: V.l[i], fvgBot: V.h[i - 2] }); esperando = false; }
      }
      if (activos.length > 50) activos.shift();
    }
    return { senales };
  }

  // HTF Sweep Signals. En la temporalidad mayor (4H por defecto): compra si la vela perfora el mínimo de la anterior y
  // cierra por encima del cierre anterior (con "Trend Signals", además la vela anterior tiene que ser alcista). La señal
  // se ve al abrir la vela siguiente. Al revés para ventas. SL en el extremo de la vela que barrió.
  function htfBarrida(VH, o = {}) {
    const tend = !!o.tendencia, senales = [];
    for (let k = 1; k < VH.length; k++) {
      if (VH.l[k] < VH.l[k - 1] && VH.c[k] > VH.c[k - 1] && (!tend || VH.c[k - 1] > VH.o[k - 1])) senales.push({ i: k, dir: 1, extremo: VH.l[k] });
      if (VH.h[k] > VH.h[k - 1] && VH.c[k] < VH.c[k - 1] && (!tend || VH.c[k - 1] < VH.o[k - 1])) senales.push({ i: k, dir: -1, extremo: VH.h[k] });
    }
    return { senales };
  }

  // =====================================================================================================
  // Generadores de señales (estrategias). Una señal = {t, dir, tipo, precio, slPrecio, rr, expira, anula, reemplaza, etiqueta}.
  // t = cierre de la vela que la genera; las órdenes a mercado entran en la apertura siguiente.
  // =====================================================================================================
  const DUR = (tf) => (tf >= 1440 ? 86400000 : tf * 60000);
  // Memoria por juego de datos: las velas y los indicadores se calculan una vez por temporalidad y configuración.
  const memo = new WeakMap();
  function cacheDe(M1) { let c = memo.get(M1); if (!c) { c = new Map(); memo.set(M1, c); } return c; }
  function velas(M1, tf) { const c = cacheDe(M1), k = 'V' + tf; if (!c.has(k)) c.set(k, M.agrupar(M1, tf)); return c.get(k); }
  function calc(M1, tf, nombre, fn, cfg) { const c = cacheDe(M1), k = nombre + ':' + tf + ':' + JSON.stringify(cfg || {}); if (!c.has(k)) c.set(k, fn(velas(M1, tf), cfg || {})); return c.get(k); }
  const KZ = [[120, 300], [420, 600]]; // kill zones de Londres y Nueva York (hora de NY)
  const enKZ = (ms) => { const m = M.minNY(ms); return (m >= 120 && m < 300) || (m >= 420 && m < 600); };
  function filtrar(V, p, i) { if (p.sesion === 'kz' && !enKZ(V.t[i] + DUR(p.tf))) return false; return true; }
  const fin = (V, p, i) => V.t[i] + DUR(p.tf);

  const GEN = {
    // SMC: retesteo del Order Block (interno o de swing). Limit en el borde del OB, SL del otro lado, TP a R:R.
    smc_ob(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'smc', smc, p.cfg);
      const out = [];
      for (const e of r.estructuras) {
        if (!e.ob || e.interno !== (p.ob !== 'swing')) continue;
        if (p.estructura && e.tipo !== p.estructura) continue;
        if (p.aFavor && e.interno && r.tendSw[e.i] !== e.dir) continue;
        if (!filtrar(V, p, e.i)) continue;
        const ob = e.ob; if (!(ob.top > ob.bot)) continue;
        const precio = e.dir === 1 ? ob.top : ob.bot, sl = e.dir === 1 ? ob.bot : ob.top;
        if ((V.c[e.i] - precio) * e.dir <= 0) continue;
        out.push({ t: fin(V, p, e.i), dir: e.dir, tipo: 'limit', precio, slPrecio: sl, rr: p.rr, expira: fin(V, p, e.i) + (p.expira || 50) * DUR(p.tf), anula: { dir: e.dir, nivel: sl }, reemplaza: true, etiqueta: `SMC OB ${e.interno ? 'interno' : 'swing'} ${e.tipo}` });
      }
      return out;
    },
    // SMC: entrada a mercado en la ruptura (BOS/CHoCH). SL en el borde lejano del OB de esa ruptura.
    smc_ruptura(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'smc', smc, p.cfg);
      const out = [];
      for (const e of r.estructuras) {
        if (e.interno !== (p.estr !== 'swing') || !e.ob) continue;
        if (p.estructura && e.tipo !== p.estructura) continue;
        if (p.aFavor && e.interno && r.tendSw[e.i] !== e.dir) continue;
        if (!filtrar(V, p, e.i)) continue;
        const sl = e.dir === 1 ? Math.min(e.ob.bot, e.ob.top) : Math.max(e.ob.top, e.ob.bot);
        out.push({ t: fin(V, p, e.i), dir: e.dir, tipo: 'mercado', slPrecio: sl, rr: p.rr, etiqueta: `SMC ${e.tipo} ${e.interno ? 'interno' : 'swing'}` });
      }
      return out;
    },
    // SMC: retesteo del FVG a favor de la tendencia interna (o de swing).
    smc_fvg(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'smc', smc, p.cfg);
      const out = [];
      for (const f of r.fvgs) {
        const tend = p.tendencia === 'swing' ? r.tendSw[f.i] : r.tendIn[f.i];
        if (p.tendencia !== 'ninguna' && tend !== f.dir) continue;
        if (!filtrar(V, p, f.i)) continue;
        const precio = f.dir === 1 ? f.top : f.bot, sl = f.dir === 1 ? f.bot : f.top;
        out.push({ t: fin(V, p, f.i), dir: f.dir, tipo: 'limit', precio, slPrecio: sl, rr: p.rr, expira: fin(V, p, f.i) + (p.expira || 30) * DUR(p.tf), anula: { dir: f.dir, nivel: sl }, reemplaza: true, etiqueta: 'SMC FVG' });
      }
      return out;
    },
    // SMC: barrida de máximos o mínimos iguales (EQH/EQL): mecha que pasa el nivel y cierre de vuelta → contra la barrida.
    smc_eq(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'smc', smc, p.cfg);
      const out = [];
      const vigencia = p.vigencia || 200;
      for (const e of r.eqs) {
        for (let i = e.i + 1; i < Math.min(V.length, e.i + vigencia); i++) {
          if (e.dir === 1) { if (V.c[i] > e.nivel) break; if (V.h[i] > e.nivel && V.c[i] < e.nivel) { if (filtrar(V, p, i)) out.push({ t: fin(V, p, i), dir: -1, tipo: 'mercado', slPrecio: V.h[i], rr: p.rr, etiqueta: 'SMC barrida EQH' }); break; } }
          else { if (V.c[i] < e.nivel) break; if (V.l[i] < e.nivel && V.c[i] > e.nivel) { if (filtrar(V, p, i)) out.push({ t: fin(V, p, i), dir: 1, tipo: 'mercado', slPrecio: V.l[i], rr: p.rr, etiqueta: 'SMC barrida EQL' }); break; } }
        }
      }
      return out.sort((a, b) => a.t - b.t);
    },
    // Fair Value Gap [LuxAlgo]: retesteo del FVG (limit en el borde, SL del otro lado) o entrada directa al detectarlo.
    fvg(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'fvg', fvgLux, p.cfg);
      const out = [];
      for (const f of r.fvgs) {
        if (!filtrar(V, p, f.i)) continue;
        const sl = f.dir === 1 ? f.bot : f.top;
        if (p.modo === 'directo') out.push({ t: fin(V, p, f.i), dir: f.dir, tipo: 'mercado', slPrecio: sl, rr: p.rr, etiqueta: 'FVG directo' });
        else out.push({ t: fin(V, p, f.i), dir: f.dir, tipo: 'limit', precio: f.dir === 1 ? f.top : f.bot, slPrecio: sl, rr: p.rr, expira: fin(V, p, f.i) + (p.expira || 30) * DUR(p.tf), anula: { dir: f.dir, nivel: sl }, reemplaza: true, etiqueta: 'FVG retesteo' });
      }
      return out;
    },
    // Order Blocks & Breaker Blocks [LuxAlgo]: retesteo del OB o del breaker (polaridad invertida).
    obbb(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'obbb', obBreaker, p.cfg);
      const out = [];
      for (const ob of r.obs) {
        if (!(ob.top > ob.btm)) continue;
        if (p.modo === 'breaker') {
          if (ob.rotura < 0 || !filtrar(V, p, ob.rotura)) continue;
          const dir = -ob.dir; // un OB alcista roto pasa a ser resistencia
          const precio = dir === -1 ? ob.btm : ob.top, sl = dir === -1 ? ob.top : ob.btm;
          if ((V.c[ob.rotura] - precio) * dir <= 0) continue;
          out.push({ t: fin(V, p, ob.rotura), dir, tipo: 'limit', precio, slPrecio: sl, rr: p.rr, expira: fin(V, p, ob.rotura) + (p.expira || 50) * DUR(p.tf), anula: { dir, nivel: sl }, reemplaza: true, etiqueta: 'Breaker block' });
        } else {
          if (!filtrar(V, p, ob.creado)) continue;
          const precio = ob.dir === 1 ? ob.top : ob.btm, sl = ob.dir === 1 ? ob.btm : ob.top;
          if ((V.c[ob.creado] - precio) * ob.dir <= 0) continue;
          out.push({ t: fin(V, p, ob.creado), dir: ob.dir, tipo: 'limit', precio, slPrecio: sl, rr: p.rr, expira: fin(V, p, ob.creado) + (p.expira || 50) * DUR(p.tf), anula: { dir: ob.dir, nivel: sl }, reemplaza: true, etiqueta: 'Order block' });
        }
      }
      return out.sort((a, b) => a.t - b.t);
    },
    // Market Structure (Fractal) [LuxAlgo]: a mercado en el CHoCH/BOS o retesteo del nivel roto. SL en el soporte/resistencia.
    msf(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'msf', msFractal, p.cfg);
      const out = [];
      for (const e of r.estructuras) {
        if (p.estructura && e.tipo !== p.estructura) continue;
        if (!filtrar(V, p, e.i)) continue;
        if (p.modo === 'retesteo') out.push({ t: fin(V, p, e.i), dir: e.dir, tipo: 'limit', precio: e.nivel, slPrecio: e.sr, rr: p.rr, expira: fin(V, p, e.i) + (p.expira || 30) * DUR(p.tf), anula: { dir: e.dir, nivel: e.sr }, reemplaza: true, etiqueta: `Fractal ${e.tipo} retesteo` });
        else out.push({ t: fin(V, p, e.i), dir: e.dir, tipo: 'mercado', slPrecio: e.sr, rr: p.rr, etiqueta: `Fractal ${e.tipo}` });
      }
      return out;
    },
    // IFVG [LuxAlgo]: señal de rechazo en la zona invertida; SL del otro lado de la zona.
    ifvg(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'ifvg', ifvg, p.cfg);
      const out = [];
      for (const s of r.senales) {
        if (!filtrar(V, p, s.i)) continue;
        out.push({ t: fin(V, p, s.i), dir: s.dir, tipo: 'mercado', slPrecio: s.dir === 1 ? s.z.bot : s.z.top, rr: p.rr, etiqueta: 'IFVG rechazo' });
      }
      return out;
    },
    // Liquidity Sweeps [LuxAlgo]: contra la barrida, SL detrás de la mecha.
    lsw(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'lsw', liqSweeps, p.cfg);
      const out = [];
      for (const b of r.barridas) {
        if (!filtrar(V, p, b.i)) continue;
        out.push({ t: fin(V, p, b.i), dir: b.dir, tipo: 'mercado', slPrecio: b.extremo, rr: p.rr, etiqueta: 'Barrida ' + b.tipo });
      }
      return out;
    },
    // Pure Price Action: MSS/BOS de mediano plazo a mercado; SL en el último giro opuesto del mismo nivel.
    ppa(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'ppa', ppaEstructuras, null);
      const out = [];
      for (const e of r.estructuras) {
        if (e.nivel !== (p.nivel == null ? 1 : p.nivel)) continue;
        if (p.estructura && e.tipo !== p.estructura) continue;
        if (isNaN(e.sl) || (V.c[e.i] - e.sl) * e.dir <= 0) continue;
        if (!filtrar(V, p, e.i)) continue;
        out.push({ t: fin(V, p, e.i), dir: e.dir, tipo: 'mercado', slPrecio: e.sl, rr: p.rr, etiqueta: `PPA ${['corto', 'mediano', 'largo'][e.nivel]} ${e.tipo}` });
      }
      return out;
    },
    // 3-Step Institutional Trap: a mercado en la ruptura del gatillo. SL detrás del extremo de la trampa.
    trampa3(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'trampa3', trampa3, p.cfg);
      return r.senales.filter((s) => filtrar(V, p, s.i)).map((s) => ({ t: fin(V, p, s.i), dir: s.dir, tipo: 'mercado', slPrecio: s.extremo, rr: p.rr, etiqueta: '3-Step Trap' }));
    },
    // MSS Sweep Fib Retrace: limit en el 50 % del tramo. Salida del indicador (SL 1,5 ATR, TP 2 ATR) o SL en la barrida y R:R.
    mssFib(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'mssFib', mssFib, p.cfg);
      const out = [];
      for (const s of r.setups) {
        if (!filtrar(V, p, s.iMss)) continue;
        const base = { t: fin(V, p, s.iMss), dir: s.dir, tipo: 'limit', precio: s.fib, expira: fin(V, p, s.iEnt), reemplaza: true, etiqueta: 'MSS Sweep Fib' };
        out.push(Object.assign(base, p.salida === 'estructura' ? { slPrecio: s.extremo, rr: p.rr } : { slPrecio: s.sl, tpPrecio: s.tp }));
      }
      return out;
    },
    // AMD FVG Trade Setup: a mercado en el FVG de la distribución. Salida del indicador (2 ATR, 1:2) o el mismo SL con otro R:R.
    amd(M1, p) {
      const V = velas(M1, p.tf), r = calc(M1, p.tf, 'amd', amdFvg, p.cfg);
      return r.senales.filter((s) => filtrar(V, p, s.i)).map((s) => Object.assign({ t: fin(V, p, s.i), dir: s.dir, tipo: 'mercado', slPrecio: s.sl, etiqueta: 'AMD FVG' }, p.salida === 'rr' ? { rr: p.rr } : { tpPrecio: s.tp }));
    },
    // FVG de 15m + barrida + CISD: a mercado al formarse el FVG que confirma, o limit en su borde (retesteo). SL en la barrida.
    fvgCisd(M1, p) {
      const htf = p.htf || 15, V = velas(M1, p.tf), VH = velas(M1, htf), cfg = Object.assign({ htf }, p.cfg || {});
      const c = cacheDe(M1), k = 'fvgCisd:' + p.tf + ':' + JSON.stringify(cfg);
      if (!c.has(k)) c.set(k, fvgBarridaCisd(V, VH, cfg));
      const out = [];
      for (const s of c.get(k).senales) {
        if (!filtrar(V, p, s.i)) continue;
        if (p.modo === 'retesteo') out.push({ t: fin(V, p, s.i), dir: s.dir, tipo: 'limit', precio: s.dir === 1 ? s.fvgTop : s.fvgBot, slPrecio: s.extremo, rr: p.rr, expira: fin(V, p, s.i) + (p.expira || 20) * DUR(p.tf), anula: { dir: s.dir, nivel: s.extremo }, reemplaza: true, etiqueta: 'FVG + barrida + CISD (retesteo)' });
        else out.push({ t: fin(V, p, s.i), dir: s.dir, tipo: 'mercado', slPrecio: s.extremo, rr: p.rr, etiqueta: 'FVG + barrida + CISD' });
      }
      return out;
    },
    // HTF Sweep Signals: a mercado en la apertura de la vela HTF siguiente. SL en el extremo de la vela que barrió.
    htfSweep(M1, p) {
      const htf = p.htf || 240, VH = velas(M1, htf), r = calc(M1, htf, 'htfSweep', htfBarrida, p.cfg);
      const out = [];
      for (const s of r.senales) {
        const t = VH.t[s.i] + DUR(htf);
        if (p.sesion === 'kz' && !enKZ(t)) continue;
        out.push({ t, dir: s.dir, tipo: 'mercado', slPrecio: s.extremo, rr: p.rr, etiqueta: 'HTF Sweep ' + (htf >= 60 ? htf / 60 + 'H' : htf + 'm') });
      }
      return out;
    },
    // ICT Silver Bullet [LuxAlgo] (del código original, ya validado).
    sb(M1, p) { return M.senalesLuxSB(M1, { tf: p.tf, entrada: p.entrada || 'retesteo', stop: p.stop || 'fvg', rr: p.rr }); },
  };

  // Modelos listos para el probador y el reproductor (id → generador y parámetros).
  const MODELOS = {
    smc_choch_sw: { gen: 'smc_ruptura', nombre: 'SMC · CHoCH de swing a mercado', p: { estr: 'swing', estructura: 'CHoCH' } },
    smc_ruptura_int: { gen: 'smc_ruptura', nombre: 'SMC · ruptura interna a favor del swing', p: { estr: 'interno', aFavor: true } },
    smc_ob_sw: { gen: 'smc_ob', nombre: 'SMC · retesteo del OB de swing', p: { ob: 'swing' } },
    smc_ob_int: { gen: 'smc_ob', nombre: 'SMC · retesteo del OB interno', p: { ob: 'interno' } },
    smc_ob_int_fav: { gen: 'smc_ob', nombre: 'SMC · OB interno a favor del swing', p: { ob: 'interno', aFavor: true } },
    smc_fvg: { gen: 'smc_fvg', nombre: 'SMC · FVG a favor de la estructura interna', p: { tendencia: 'interna' } },
    smc_eq: { gen: 'smc_eq', nombre: 'SMC · barrida de EQH / EQL', p: {} },
    fvg_retesteo: { gen: 'fvg', nombre: 'Fair Value Gap · retesteo', p: { modo: 'retesteo' } },
    fvg_directo: { gen: 'fvg', nombre: 'Fair Value Gap · entrada directa', p: { modo: 'directo' } },
    obbb_ob: { gen: 'obbb', nombre: 'OB & Breaker · retesteo del OB', p: { modo: 'ob' } },
    obbb_breaker: { gen: 'obbb', nombre: 'OB & Breaker · retesteo del breaker', p: { modo: 'breaker' } },
    msf_choch: { gen: 'msf', nombre: 'Estructura fractal · CHoCH', p: { estructura: 'CHoCH' } },
    msf_bos: { gen: 'msf', nombre: 'Estructura fractal · BOS', p: { estructura: 'BOS' } },
    msf_retesteo: { gen: 'msf', nombre: 'Estructura fractal · retesteo del nivel roto', p: { modo: 'retesteo' } },
    ifvg: { gen: 'ifvg', nombre: 'IFVG · rechazo de la zona invertida', p: {} },
    lsw_mecha: { gen: 'lsw', nombre: 'Liquidity Sweeps · barrida por mecha', p: { cfg: { modo: 'mechas' } } },
    lsw_retesteo: { gen: 'lsw', nombre: 'Liquidity Sweeps · ruptura y retesteo', p: { cfg: { modo: 'retesteo' } } },
    ppa_mss_mp: { gen: 'ppa', nombre: 'Pure Price Action · MSS de mediano plazo', p: { nivel: 1, estructura: 'MSS' } },
    ppa_bos_mp: { gen: 'ppa', nombre: 'Pure Price Action · BOS de mediano plazo', p: { nivel: 1, estructura: 'BOS' } },
    ppa_mss_cp: { gen: 'ppa', nombre: 'Pure Price Action · MSS de corto plazo', p: { nivel: 0, estructura: 'MSS' } },
    trampa3: { gen: 'trampa3', nombre: '3-Step Institutional Trap', p: {} },
    mss_fib: { gen: 'mssFib', nombre: 'MSS Sweep Fib Retrace (salida del indicador)', p: {} },
    mss_fib_est: { gen: 'mssFib', nombre: 'MSS Sweep Fib Retrace · SL en la barrida', p: { salida: 'estructura' } },
    amd_fvg: { gen: 'amd', nombre: 'AMD FVG Trade Setup (salida del indicador)', p: {} },
    fvg_cisd: { gen: 'fvgCisd', nombre: 'FVG 15m + barrida + CISD', p: {} },
    htf_sweep: { gen: 'htfSweep', nombre: 'HTF Sweep Signals (4H)', p: { htf: 240 } },
  };
  function senales(M1, p) {
    const m = MODELOS[p.modelo];
    if (!m) throw new Error('Modelo desconocido: ' + p.modelo);
    return GEN[m.gen](M1, Object.assign({}, m.p, p));
  }

  const API = { MODELOS, senales, velas, limpiar: (M1) => memo.delete(M1), atrRma, maxVentana, minVentana, smc, fvgLux, obBreaker, msFractal, ifvg, liqSweeps, ppaEstructuras, trampa3, mssFib, amdFvg, fvgBarridaCisd, htfBarrida, GEN, enKZ };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.LUX = API;
})(typeof window !== 'undefined' ? window : globalThis);
