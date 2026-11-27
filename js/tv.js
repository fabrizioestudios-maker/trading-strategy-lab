/* Motor compatible con TradingView (corre en el navegador, en el trabajador y en Node).
 *
 * - ta: las funciones ta.* de Pine Script con las mismas fórmulas que su documentación (EMA con semilla en el primer valor,
 *   RMA con semilla SMA, desvío estándar poblacional, RSI, ATR, DMI/ADX, Supertrend, SAR, pivotes, etc.). Trabajan sobre
 *   series enteras (Float64Array) y devuelven series del mismo largo con NaN donde Pine devuelve na.
 * - security: valores de otra temporalidad sin repintado ([1] + lookahead_on) o con la semántica histórica de lookahead_off.
 * - sesion: pertenencia a una sesión "HHMM-HHMM" en hora de Nueva York (como time(timeframe.period, sesión, zona)).
 * - Broker: emulador de órdenes como el Strategy Tester: el script corre al cierre de cada vela; las órdenes se ejecutan desde
 *   la vela siguiente (mercado en su apertura, límite/stop cuando el precio las cruza, en la apertura si hay hueco). Dentro de
 *   cada vela el precio recorre apertura → extremo más cercano → el otro extremo → cierre (regla de TradingView). Con la lupa
 *   de barras ese recorrido se hace minuto a minuto con las velas de 1 minuto. Modo "laboratorio": el peor recorrido para la
 *   posición abierta y, en el minuto de la entrada, solo el stop (las reglas de trading-strategy-lab).
 */
(function (raiz) {
  'use strict';
  const Rm = raiz.REPM || (typeof require !== 'undefined' ? require('./motores.js') : null);

  // ---------------- ta ----------------
  const N = (n) => new Float64Array(n).fill(NaN);
  const esNa = (x) => x !== x;
  const nz = (x, y = 0) => (x !== x ? y : x);
  const comoSerie = (x, n) => (typeof x === 'number' ? new Float64Array(n).fill(x) : x);

  function sma(x, n) {
    const L = x.length, o = N(L);
    let s = 0, malos = 0;
    for (let i = 0; i < L; i++) {
      if (esNa(x[i])) malos++; else s += x[i];
      if (i >= n) { if (esNa(x[i - n])) malos--; else s -= x[i - n]; }
      if (i >= n - 1 && malos === 0) o[i] = s / n;
    }
    // recalcular la suma exacta cada tanto evita el error acumulado de la suma móvil
    if (L > 5000) for (let i = n - 1; i < L; i += 2000) { let t = 0, ok = true; for (let k = i - n + 1; k <= i; k++) { if (esNa(x[k])) { ok = false; break; } t += x[k]; } if (ok) o[i] = t / n; }
    return o;
  }
  function ema(x, n) { // pine_ema: sum := na(sum[1]) ? src : alpha * src + (1 - alpha) * nz(sum[1])
    const L = x.length, o = N(L), a = 2 / (n + 1);
    let prev = NaN;
    for (let i = 0; i < L; i++) { const v = esNa(prev) ? x[i] : a * x[i] + (1 - a) * prev; o[i] = v; prev = v; }
    return o;
  }
  function rma(x, n) { // pine_rma: sum := na(sum[1]) ? ta.sma(src, length) : alpha * src + (1 - alpha) * nz(sum[1])
    const L = x.length, o = N(L), a = 1 / n, s = sma(x, n);
    let prev = NaN;
    for (let i = 0; i < L; i++) { const v = esNa(prev) ? s[i] : a * x[i] + (1 - a) * prev; o[i] = v; prev = v; }
    return o;
  }
  function wma(x, n) {
    const L = x.length, o = N(L), den = (n * (n + 1)) / 2;
    for (let i = n - 1; i < L; i++) { let s = 0; for (let k = 0; k < n; k++) s += x[i - k] * (n - k); o[i] = s / den; }
    return o;
  }
  function hma(x, n) {
    const a = wma(x, Math.floor(n / 2)), b = wma(x, n), d = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) d[i] = 2 * a[i] - b[i];
    return wma(d, Math.round(Math.sqrt(n)));
  }
  function alma(x, n, offset = 0.85, sigma = 6) {
    const L = x.length, o = N(L), m = offset * (n - 1), s = n / sigma, w = [];
    let norm = 0;
    for (let i = 0; i < n; i++) { w.push(Math.exp(-((i - m) ** 2) / (2 * s * s))); norm += w[i]; }
    for (let j = n - 1; j < L; j++) { let t = 0; for (let i = 0; i < n; i++) t += x[j - (n - 1 - i)] * w[i]; o[j] = t / norm; }
    return o;
  }
  function stdev(x, n, sesgado = true) {
    const L = x.length, o = N(L), m = sma(x, n);
    for (let i = n - 1; i < L; i++) {
      if (esNa(m[i])) continue;
      let s = 0;
      for (let k = 0; k < n; k++) { const d = x[i - k] - m[i]; s += d * d; }
      o[i] = Math.sqrt(s / (sesgado ? n : n - 1));
    }
    return o;
  }
  function variance(x, n, sesgado = true) { const s = stdev(x, n, sesgado); for (let i = 0; i < s.length; i++) s[i] *= s[i]; return s; }
  function dev(x, n) {
    const L = x.length, o = N(L), m = sma(x, n);
    for (let i = n - 1; i < L; i++) { let s = 0; for (let k = 0; k < n; k++) s += Math.abs(x[i - k] - m[i]); o[i] = s / n; }
    return o;
  }
  function tr(h, l, c, manejarNa = true) {
    const L = h.length, o = N(L);
    for (let i = 0; i < L; i++) {
      if (i === 0) { o[i] = manejarNa ? h[i] - l[i] : NaN; continue; }
      o[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    }
    return o;
  }
  const atr = (h, l, c, n) => rma(tr(h, l, c, true), n);
  function rsi(x, n) {
    const L = x.length, u = N(L), d = N(L);
    for (let i = 1; i < L; i++) { u[i] = Math.max(x[i] - x[i - 1], 0); d[i] = Math.max(x[i - 1] - x[i], 0); }
    const ru = rma(u, n), rd = rma(d, n), o = N(L);
    for (let i = 0; i < L; i++) o[i] = 100 - 100 / (1 + ru[i] / rd[i]);
    return o;
  }
  function highest(x, n) { const L = x.length, o = N(L); for (let i = n - 1; i < L; i++) { let m = -Infinity; for (let k = 0; k < n; k++) if (x[i - k] > m) m = x[i - k]; o[i] = m; } return o; }
  function lowest(x, n) { const L = x.length, o = N(L); for (let i = n - 1; i < L; i++) { let m = Infinity; for (let k = 0; k < n; k++) if (x[i - k] < m) m = x[i - k]; o[i] = m; } return o; }
  function highestbars(x, n) { const L = x.length, o = N(L); for (let i = n - 1; i < L; i++) { let m = -Infinity, b = 0; for (let k = 0; k < n; k++) if (x[i - k] > m) { m = x[i - k]; b = -k; } o[i] = b; } return o; }
  function lowestbars(x, n) { const L = x.length, o = N(L); for (let i = n - 1; i < L; i++) { let m = Infinity, b = 0; for (let k = 0; k < n; k++) if (x[i - k] < m) { m = x[i - k]; b = -k; } o[i] = b; } return o; }
  function change(x, n = 1) { const L = x.length, o = N(L); for (let i = n; i < L; i++) o[i] = x[i] - x[i - n]; return o; }
  function roc(x, n) { const L = x.length, o = N(L); for (let i = n; i < L; i++) o[i] = (100 * (x[i] - x[i - n])) / x[i - n]; return o; }
  function cum(x) { const o = new Float64Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += nz(x[i]); o[i] = s; } return o; }
  function macd(x, rapida, lenta, senal) {
    const a = ema(x, rapida), b = ema(x, lenta), m = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) m[i] = a[i] - b[i];
    const s = ema(m, senal), hgr = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) hgr[i] = m[i] - s[i];
    return { macd: m, senal: s, hist: hgr };
  }
  function bb(x, n, mult) {
    const m = sma(x, n), s = stdev(x, n), sup = new Float64Array(x.length), inf = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) { sup[i] = m[i] + mult * s[i]; inf[i] = m[i] - mult * s[i]; }
    return { medio: m, sup, inf };
  }
  function kc(x, h, l, c, n, mult, usarTr = true) {
    const base = ema(x, n), rango = usarTr ? tr(h, l, c, true) : Float64Array.from(h, (v, i) => v - l[i]), re = ema(rango, n);
    return { medio: base, sup: base.map((v, i) => v + re[i] * mult), inf: base.map((v, i) => v - re[i] * mult) };
  }
  function stoch(src, h, l, n) {
    const hh = highest(h, n), ll = lowest(l, n), o = N(src.length);
    for (let i = 0; i < src.length; i++) o[i] = (100 * (src[i] - ll[i])) / (hh[i] - ll[i]);
    return o;
  }
  function cci(x, n) { const m = sma(x, n), d = dev(x, n), o = N(x.length); for (let i = 0; i < x.length; i++) o[i] = (x[i] - m[i]) / (0.015 * d[i]); return o; }
  function wpr(h, l, c, n) { const hh = highest(h, n), ll = lowest(l, n), o = N(c.length); for (let i = 0; i < c.length; i++) o[i] = (100 * (c[i] - hh[i])) / (hh[i] - ll[i]); return o; }
  function dmi(h, l, c, diLen, adxLen) {
    const L = h.length, mas = N(L), menos = N(L);
    const pdm = N(L), mdm = N(L);
    for (let i = 1; i < L; i++) {
      const up = h[i] - h[i - 1], dn = -(l[i] - l[i - 1]);
      pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0;
    }
    const trur = rma(tr(h, l, c, true), diLen), rp = rma(pdm, diLen), rm = rma(mdm, diLen);
    let ulP = NaN, ulM = NaN; // fixnan
    for (let i = 0; i < L; i++) {
      const p = (100 * rp[i]) / trur[i], m = (100 * rm[i]) / trur[i];
      if (!esNa(p) && isFinite(p)) ulP = p; if (!esNa(m) && isFinite(m)) ulM = m;
      mas[i] = ulP; menos[i] = ulM;
    }
    const x = N(L);
    for (let i = 0; i < L; i++) { const s = mas[i] + menos[i]; x[i] = Math.abs(mas[i] - menos[i]) / (s === 0 ? 1 : s); }
    const adx = rma(x, adxLen);
    for (let i = 0; i < L; i++) adx[i] *= 100;
    return { mas, menos, adx };
  }
  function supertrend(h, l, c, factor, n) { // direccion -1 = alcista, como en TradingView
    const L = c.length, a = atr(h, l, c, n), valor = N(L), direccion = N(L);
    let supPrev = NaN, infPrev = NaN, stPrev = NaN;
    for (let i = 0; i < L; i++) {
      const src = (h[i] + l[i]) / 2;
      let sup = src + factor * a[i], inf = src - factor * a[i];
      const pInf = nz(infPrev), pSup = nz(supPrev);
      inf = inf > pInf || (i > 0 && c[i - 1] < pInf) ? inf : pInf;
      sup = sup < pSup || (i > 0 && c[i - 1] > pSup) ? sup : pSup;
      let d;
      if (i === 0 || esNa(a[i - 1])) d = 1;
      else if (stPrev === supPrev) d = c[i] > sup ? -1 : 1;
      else d = c[i] < inf ? 1 : -1;
      const st = d === -1 ? inf : sup;
      valor[i] = esNa(a[i]) ? NaN : st; direccion[i] = esNa(a[i]) ? NaN : d;
      supPrev = sup; infPrev = inf; stPrev = st;
    }
    return { valor, direccion };
  }
  function sar(h, l, c, inicio, inc, max) {
    const L = c.length, o = N(L);
    let r = NaN, mm = NaN, ac = NaN, abajo = false;
    for (let i = 1; i < L; i++) {
      let primera = false;
      if (i === 1) { if (c[1] > c[0]) { abajo = true; mm = h[1]; r = l[0]; } else { abajo = false; mm = l[1]; r = h[0]; } primera = true; ac = inicio; }
      r = r + ac * (mm - r);
      if (abajo) { if (r > l[i]) { primera = true; abajo = false; r = Math.max(h[i], mm); mm = l[i]; ac = inicio; } }
      else if (r < h[i]) { primera = true; abajo = true; r = Math.min(l[i], mm); mm = h[i]; ac = inicio; }
      if (!primera) {
        if (abajo) { if (h[i] > mm) { mm = h[i]; ac = Math.min(ac + inc, max); } }
        else if (l[i] < mm) { mm = l[i]; ac = Math.min(ac + inc, max); }
      }
      if (abajo) { r = Math.min(r, l[i - 1]); if (i > 1) r = Math.min(r, l[i - 2]); }
      else { r = Math.max(r, h[i - 1]); if (i > 1) r = Math.max(r, h[i - 2]); }
      o[i] = r;
    }
    return o;
  }
  // Pivotes: valor en la vela de confirmación (centro + derecha), NaN si no hay. Centro mayor estricto que la izquierda y
  // mayor o igual que la derecha (misma regla que el laboratorio).
  function pivothigh(x, izq, der) {
    const L = x.length, o = N(L);
    for (let i = izq + der; i < L; i++) {
      const j = i - der, v = x[j];
      let ok = true;
      for (let k = 1; k <= izq && ok; k++) if (!(v > x[j - k])) ok = false;
      for (let k = 1; k <= der && ok; k++) if (!(v >= x[j + k])) ok = false;
      if (ok) o[i] = v;
    }
    return o;
  }
  function pivotlow(x, izq, der) {
    const L = x.length, o = N(L);
    for (let i = izq + der; i < L; i++) {
      const j = i - der, v = x[j];
      let ok = true;
      for (let k = 1; k <= izq && ok; k++) if (!(v < x[j - k])) ok = false;
      for (let k = 1; k <= der && ok; k++) if (!(v <= x[j + k])) ok = false;
      if (ok) o[i] = v;
    }
    return o;
  }
  const crossover = (a, b, i) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
  const crossunder = (a, b, i) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
  const cross = (a, b, i) => crossover(a, b, i) || crossunder(a, b, i);
  function rising(x, n) { const o = new Uint8Array(x.length); for (let i = n; i < x.length; i++) { let ok = true; for (let k = 1; k <= n; k++) if (!(x[i] > x[i - k])) { ok = false; break; } o[i] = ok ? 1 : 0; } return o; }
  function falling(x, n) { const o = new Uint8Array(x.length); for (let i = n; i < x.length; i++) { let ok = true; for (let k = 1; k <= n; k++) if (!(x[i] < x[i - k])) { ok = false; break; } o[i] = ok ? 1 : 0; } return o; }
  function barssince(cond) { const o = N(cond.length); let u = -1; for (let i = 0; i < cond.length; i++) { if (cond[i]) u = i; o[i] = u < 0 ? NaN : i - u; } return o; }
  function valuewhen(cond, src, ocurrencia = 0) {
    const o = N(cond.length), hist = [];
    for (let i = 0; i < cond.length; i++) { if (cond[i]) hist.push(src[i]); o[i] = hist.length > ocurrencia ? hist[hist.length - 1 - ocurrencia] : NaN; }
    return o;
  }
  function linreg(x, n, offset = 0) {
    const L = x.length, o = N(L);
    for (let i = n - 1; i < L; i++) {
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (let k = 0; k < n; k++) { const xx = k, yy = x[i - n + 1 + k]; sx += xx; sy += yy; sxy += xx * yy; sxx += xx * xx; }
      const pend = (n * sxy - sx * sy) / (n * sxx - sx * sx), ord = (sy - pend * sx) / n;
      o[i] = ord + pend * (n - 1 - offset);
    }
    return o;
  }
  function correlation(a, b, n) {
    const L = a.length, o = N(L);
    for (let i = n - 1; i < L; i++) {
      let ma = 0, mb = 0; for (let k = 0; k < n; k++) { ma += a[i - k]; mb += b[i - k]; } ma /= n; mb /= n;
      let c = 0, va = 0, vb = 0; for (let k = 0; k < n; k++) { const x = a[i - k] - ma, y = b[i - k] - mb; c += x * y; va += x * x; vb += y * y; }
      o[i] = c / Math.sqrt(va * vb);
    }
    return o;
  }
  function percentrank(x, n) { const o = N(x.length); for (let i = n; i < x.length; i++) { let k = 0; for (let j = 1; j <= n; j++) if (x[i - j] <= x[i]) k++; o[i] = (100 * k) / n; } return o; }
  function median(x, n) { const o = N(x.length); for (let i = n - 1; i < x.length; i++) { const w = Array.from(x.subarray(i - n + 1, i + 1)).sort((p, q) => p - q); o[i] = n % 2 ? w[(n - 1) / 2] : (w[n / 2 - 1] + w[n / 2]) / 2; } return o; }
  function cmo(x, n) {
    const m = change(x), up = m.map((v) => (v >= 0 ? v : 0)), dn = m.map((v) => (v >= 0 ? 0 : -v)), o = N(x.length);
    for (let i = n; i < x.length; i++) { let a = 0, b = 0; for (let k = 0; k < n; k++) { a += up[i - k]; b += dn[i - k]; } o[i] = (100 * (a - b)) / (a + b); }
    return o;
  }
  function tsi(x, corto, largo) {
    const pc = change(x), apc = pc.map(Math.abs), ds = (s) => ema(ema(s, largo), corto), a = ds(pc), b = ds(apc);
    return a.map((v, i) => v / b[i]);
  }

  const ta = { sma, ema, rma, wma, hma, alma, stdev, variance, dev, tr, atr, rsi, highest, lowest, highestbars, lowestbars, change, mom: change, roc, cum, macd, bb, kc, stoch, cci, wpr, dmi, supertrend, sar, pivothigh, pivotlow, crossover, crossunder, cross, rising, falling, barssince, valuewhen, linreg, correlation, percentrank, median, cmo, tsi, nz };

  // ---------------- tiempo, sesiones y otras temporalidades ----------------
  const offNY = (ms) => Rm.offNY(ms);
  const minutoNY = (ms) => Rm.minNY(ms);
  const fechaNY = (ms) => Math.floor((ms + offNY(ms) * 60000) / 86400000); // día calendario en Nueva York
  function parseSesion(s) {
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(String(s).trim());
    if (!m) throw new Error('Sesión inválida: ' + s);
    return { a: +m[1] * 60 + +m[2], b: +m[3] * 60 + +m[4] };
  }
  function enSesion(ms, ses) { // como time(timeframe.period, sesión, "America/New_York"): la apertura de la vela dentro de [a, b)
    const { a, b } = typeof ses === 'string' ? parseSesion(ses) : ses;
    const m = minutoNY(ms);
    return a < b ? m >= a && m < b : b === 0 ? m >= a : m >= a || m < b;
  }
  // Índice de la vela mayor anterior a la que contiene el inicio de cada vela menor ([1] + lookahead_on, sin repintado).
  function mapearMayor(tMenor, tMayor) {
    const q = new Int32Array(tMenor.length);
    let j = 0;
    for (let i = 0; i < tMenor.length; i++) { while (j + 1 < tMayor.length && tMayor[j + 1] <= tMenor[i]) j++; q[i] = tMayor[0] <= tMenor[i] ? j - 1 : -2; }
    return q;
  }
  // lookahead_off en velas históricas: el valor de la última vela mayor que ya cerró al cierre de la vela menor.
  function mapearMayorOff(menor, mayor) {
    const q = new Int32Array(menor.length);
    let j = -1;
    for (let i = 0; i < menor.length; i++) { const finMenor = menor.finT[i]; while (j + 1 < mayor.length && mayor.finT[j + 1] <= finMenor) j++; q[i] = j; }
    return q;
  }
  function velas(M1, tf) {
    const v = Rm.agrupar(M1, tf);
    const n = v.length;
    const ini = v.ini ? Int32Array.from(v.ini) : Int32Array.from({ length: n }, (_, i) => i);
    const fin = v.fin ? Int32Array.from(v.fin) : Int32Array.from({ length: n }, (_, i) => i);
    const finT = new Float64Array(n);
    for (let i = 0; i < n; i++) finT[i] = M1.T[fin[i]] + 60000;
    return { t: Float64Array.from(v.t), o: Float64Array.from(v.o), h: Float64Array.from(v.h), l: Float64Array.from(v.l), c: Float64Array.from(v.c), ini, fin, finT, length: n, tf };
  }
  function security(menor, mayor, serie, modo = 'cerrada') {
    const q = modo === 'tv' ? mapearMayorOff(menor, mayor) : mapearMayor(menor.t, mayor.t);
    const o = N(menor.length);
    for (let i = 0; i < menor.length; i++) if (q[i] >= 0) o[i] = serie[q[i]];
    return o;
  }

  // ---------------- emulador de órdenes ----------------
  class Broker {
    constructor(M1, v, op) {
      this.M = M1; this.v = v;
      this.op = Object.assign({ capital: 10000, comisionPct: 0, comisionUnidad: 0, deslizTicks: 0, mintick: 0.01, valorPunto: 1, lupa: true, modo: 'tv', pyramiding: 1, cierreDiario: -1, riesgoPct: 1 }, op || {});
      this.equity = this.op.capital;
      this.pend = []; this.abiertas = []; this.cerradas = []; this.ordenes = []; this.eventos = { lleno: [], cerro: [] };
      this.seq = 0;
    }
    costoUnidad(precio) { return (this.op.comisionPct / 100) * precio + this.op.comisionUnidad; }
    get posicion() { return this.abiertas.reduce((s, t) => s + t.dir * t.qty, 0); }
    // ---- API del script (como strategy.*) ----
    entry(id, dir, o = {}, b) {
      const d = dir === 'long' || dir === 1 ? 1 : -1;
      if (this.abiertas.length && this.abiertas[0].dir === d && this.abiertas.length >= this.op.pyramiding) return null;
      this.pend = this.pend.filter((x) => !(x.clase === 'entrada' && x.id === id));
      const ord = { clase: 'entrada', id, dir: d, qty: o.qty, tipo: o.limit != null ? 'limit' : o.stop != null ? 'stop' : 'mercado', precio: o.limit != null ? o.limit : o.stop, desde: this.v.fin[b] + 1, vence: o.venceMin != null ? o.venceMin : null, anulaEn: o.anulaEn != null ? o.anulaEn : null, riesgoMin: o.riesgoMin || 0, etiqueta: o.comment || id, barra: b, seq: this.seq++ };
      this.pend.push(ord);
      this.ordenes.push(ord);
      return ord;
    }
    exit(id, desdeId, o = {}, b) {
      this.pend = this.pend.filter((x) => !(x.clase === 'salida' && x.id === id));
      const ord = { clase: 'salida', id, desdeId, stop: o.stop, limit: o.limit, loss: o.loss, profit: o.profit, rr: o.rr, desde: this.v.fin[b] + 1, seq: this.seq++ };
      this.pend.push(ord);
      for (const t of this.abiertas) if (!desdeId || t.id === desdeId) this.armarSalida(t, ord, ord.desde);
      const e = this.pend.find((x) => x.clase === 'entrada' && (!desdeId || x.id === desdeId));
      if (e) {
        const base = e.precio != null ? e.precio : this.v.c[b], tick = this.op.mintick;
        e.slVivo = o.stop != null ? o.stop : o.loss != null ? base - e.dir * o.loss * tick : null;
        e.tpVivo = o.limit != null ? o.limit : o.profit != null ? base + e.dir * o.profit * tick : null;
      }
      return ord;
    }
    close(id, b, motivo = 'Cierre') { this.pend.push({ clase: 'cierre', id, desde: this.v.fin[b] + 1, motivo, seq: this.seq++ }); }
    closeAll(b, motivo = 'Cierre') { this.close(null, b, motivo); }
    cancel(id) { this.pend = this.pend.filter((x) => !(x.clase === 'entrada' && x.id === id)); }
    cancelAll() { this.pend = this.pend.filter((x) => x.clase !== 'entrada'); }
    pendientes() { return this.pend.filter((x) => x.clase === 'entrada'); }
    // ---- interno ----
    armarSalida(t, ord, desde) {
      const tick = this.op.mintick;
      t.sl = ord.stop != null ? ord.stop : ord.loss != null ? t.entrada - t.dir * ord.loss * tick : t.sl;
      t.tp = ord.limit != null ? ord.limit : ord.profit != null ? t.entrada + t.dir * ord.profit * tick : ord.rr != null && t.sl != null ? t.entrada + t.dir * ord.rr * Math.abs(t.entrada - t.sl) : t.tp;
      t.salidaDesde = Math.max(t.salidaDesde || 0, desde);
    }
    abrir(ord, j, precio) {
      const t = { id: ord.id, dir: ord.dir, qty: ord.qty || 1, entrada: precio, i: j, t: this.M.T[j], sl: null, tp: null, salidaDesde: j, etiqueta: ord.etiqueta, plan: ord.precio != null ? ord.precio : precio, minutoEntrada: j };
      if (this.abiertas.length && this.abiertas[0].dir !== t.dir) for (const x of this.abiertas.slice()) this.cerrarTrade(x, j, precio, 'Reversa');
      for (const s of this.pend) if (s.clase === 'salida' && (!s.desdeId || s.desdeId === t.id)) this.armarSalida(t, s, j);
      this.abiertas.push(t);
      for (const f of this.eventos.lleno) f(t);
      return t;
    }
    cerrarTrade(t, j, precio, motivo) {
      this.abiertas = this.abiertas.filter((x) => x !== t);
      const cu = this.costoUnidad(t.entrada) + this.costoUnidad(precio);
      const riesgo = t.sl != null ? Math.abs(t.plan - t.sl) : NaN;
      const mov = (precio - t.entrada) * t.dir;
      const r = riesgo > 0 ? (mov - cu) / riesgo : NaN;
      const usd = isFinite(r) ? this.equity * (this.op.riesgoPct / 100) * r : (mov - cu) * t.qty * this.op.valorPunto;
      this.equity += usd;
      const c = { id: t.id, dir: t.dir, tEntrada: t.t, entrada: t.entrada, sl: t.sl, tp: t.tp, tSalida: this.M.T[j] + 60000, salida: precio, r, usd, motivo, etiqueta: t.etiqueta, min: Math.round((this.M.T[j] + 60000 - t.t) / 60000) };
      this.cerradas.push(c);
      for (const f of this.eventos.cerro) f(c);
      if (!this.abiertas.length) this.pend = this.pend.filter((x) => x.clase !== 'salida' || x.desdeId === null);
    }
    // Procesa los minutos de la vela b con las órdenes vigentes.
    procesarVela(b) {
      const v = this.v, M = this.M;
      const ini = v.ini[b], fin = v.fin[b];
      if (this.op.lupa) for (let j = ini; j <= fin; j++) this.procesarTramo(j, M.O[j], M.H[j], M.L[j], M.C[j], j, j);
      else this.procesarTramo(ini, v.o[b], v.h[b], v.l[b], v.c[b], ini, fin);
    }
    camino(o, h, l, c, dirPos) {
      if (this.op.modo === 'lab' && dirPos) return dirPos === 1 ? [o, l, h, c] : [o, h, l, c];
      return h - o < o - l ? [o, h, l, c] : [o, l, h, c];
    }
    procesarTramo(j, o, h, l, c, jIni, jFin) {
      if (!this.pend.length && !this.abiertas.length) return;
      const M = this.M;
      // cierre diario forzoso (hora NY)
      if (this.op.cierreDiario >= 0 && this.abiertas.length) {
        const mNY = minutoNY(M.T[jIni]);
        for (const t of this.abiertas.slice()) if (fechaNY(M.T[jIni]) !== fechaNY(t.t) || (mNY >= this.op.cierreDiario && t.i < jIni)) this.cerrarTrade(t, jIni, o, 'Cierre diario');
      }
      // vencimientos
      this.pend = this.pend.filter((x) => !(x.clase === 'entrada' && x.vence != null && jIni > x.vence));
      // cierres a mercado
      for (const x of this.pend.filter((y) => y.clase === 'cierre' && y.desde <= jIni)) {
        for (const t of this.abiertas.slice()) if (!x.id || t.id === x.id) this.cerrarTrade(t, jIni, o, x.motivo);
        this.pend = this.pend.filter((y) => y !== x);
      }
      // entradas a mercado
      for (const x of this.pend.filter((y) => y.clase === 'entrada' && y.tipo === 'mercado' && y.desde <= jIni)) {
        this.pend = this.pend.filter((y) => y !== x);
        const precio = o + x.dir * this.op.deslizTicks * this.op.mintick;
        const sl0 = this.slPrevisto(x, precio);
        if (x.riesgoMin && sl0 != null && (precio - sl0) * x.dir <= x.riesgoMin) continue;
        this.abrir(x, jIni, precio);
      }
      // recorrido dentro de la vela (o del minuto con la lupa)
      const dirPos = this.abiertas.length ? this.abiertas[0].dir : this.pend.find((y) => y.clase === 'entrada' && y.desde <= jIni) ? this.pend.find((y) => y.clase === 'entrada' && y.desde <= jIni).dir : 0;
      const pts = this.camino(o, h, l, c, dirPos);
      for (let s = 0; s < pts.length; s++) {
        const a = s === 0 ? pts[0] : pts[s - 1], z = pts[s];
        // eventos posibles en el tramo a→z (en el primer punto, los niveles ya cruzados se llenan en la apertura)
        for (let guard = 0; guard < 20; guard++) {
          const ev = this.proximoEvento(a, z, s === 0, jIni);
          if (!ev) break;
          if (ev.tipo === 'entrada') {
            this.pend = this.pend.filter((y) => y !== ev.ord);
            this.abrir(ev.ord, jIni, ev.precio);
          } else if (ev.tipo === 'anula') this.pend = this.pend.filter((y) => y !== ev.ord);
          else this.cerrarTrade(ev.trade, jIni, ev.precio, ev.motivo);
        }
      }
      void jFin;
    }
    slPrevisto(ord, precio) {
      const s = this.pend.find((y) => y.clase === 'salida' && (!y.desdeId || y.desdeId === ord.id));
      if (!s) return null;
      return s.stop != null ? s.stop : s.loss != null ? precio - ord.dir * s.loss * this.op.mintick : null;
    }
    // El próximo nivel que toca el precio al ir de a a z. En el primer punto (apertura) se llenan los ya cruzados.
    proximoEvento(a, z, enApertura, j) {
      const lab = this.op.modo === 'lab', sube = z >= a;
      let mejor = null;
      const considerar = (precioNivel, ev) => {
        let p;
        if (enApertura) { if (!ev.yaCruzado(a)) return; p = ev.precioGap(a); }
        else { if (!(sube ? precioNivel > a + 1e-12 && precioNivel <= z + 1e-12 : precioNivel < a - 1e-12 && precioNivel >= z - 1e-12)) return; if (!ev.cruza(z)) return; p = ev.precio; }
        const dist = enApertura ? -1 : Math.abs(precioNivel - a);
        if (!mejor || dist < mejor.dist) mejor = Object.assign({}, ev, { dist, precio: p });
      };
      for (const t of this.abiertas) {
        if (t.salidaDesde > j) continue;
        const d = t.dir;
        if (t.sl != null) considerar(t.sl, { tipo: 'salida', motivo: 'SL', trade: t, precio: t.sl - d * this.op.deslizTicks * this.op.mintick, yaCruzado: (x) => (d === 1 ? x <= t.sl : x >= t.sl), cruza: (x) => (d === 1 ? x <= t.sl : x >= t.sl), precioGap: (x) => x - d * this.op.deslizTicks * this.op.mintick });
        if (t.tp != null && !(lab && !this.op.labTpEntrada && t.minutoEntrada === j)) considerar(t.tp, { tipo: 'salida', motivo: 'TP', trade: t, precio: t.tp, yaCruzado: (x) => (d === 1 ? x >= t.tp : x <= t.tp), cruza: (x) => (d === 1 ? x >= t.tp : x <= t.tp), precioGap: (x) => (lab ? t.tp : x) });
      }
      if (!this.abiertas.length || this.op.pyramiding > this.abiertas.length) {
        for (const x of this.pend) {
          if (x.clase !== 'entrada' || x.tipo === 'mercado' || x.desde > j) continue;
          const d = x.dir, P = x.precio;
          if (x.tipo === 'limit') considerar(P, { tipo: 'entrada', ord: x, precio: P, yaCruzado: (y) => (d === 1 ? y <= P : y >= P), cruza: (y) => (d === 1 ? y <= P : y >= P), precioGap: (y) => y });
          else considerar(P, { tipo: 'entrada', ord: x, precio: P + d * this.op.deslizTicks * this.op.mintick, yaCruzado: (y) => (d === 1 ? y >= P : y <= P), cruza: (y) => (d === 1 ? y >= P : y <= P), precioGap: (y) => y + d * this.op.deslizTicks * this.op.mintick });
          if (x.anulaEn != null) { const A = x.anulaEn; considerar(A, { tipo: 'anula', ord: x, precio: A, yaCruzado: (y) => (d === 1 ? y >= A : y <= A) && !(d === 1 ? y <= P : y >= P), cruza: (y) => (d === 1 ? y >= A : y <= A), precioGap: (y) => y }); }
        }
      }
      return mejor;
    }
  }

  // ---------------- ejecución de un script ----------------
  // script: { tf, preparar(ctx, p) → función por vela (i) }. Devuelve { ops, senales, n }.
  function correr(M1, script, p, op) {
    const tf = typeof script.tf === 'function' ? script.tf(p) : script.tf;
    const v = velas(M1, tf);
    const br = new Broker(M1, v, Object.assign({}, script.opciones || {}, op || {}));
    const cache = new Map();
    const ctx = {
      v, M1, p, tf, ta,
      time: v.t, open: v.o, high: v.h, low: v.l, close: v.c, bar_count: v.length,
      syminfo: { mintick: br.op.mintick, pointvalue: br.op.valorPunto },
      costoUnidad: (precio) => br.costoUnidad(precio),
      velas: (tf2) => { if (!cache.has(tf2)) cache.set(tf2, velas(M1, tf2)); return cache.get(tf2); },
      security: (tf2, fn, modo = 'cerrada') => { const may = ctx.velas(tf2); return security(v, may, fn(Object.assign({ ta }, may)), modo); },
      mapearMayor: (tf2) => mapearMayor(v.t, ctx.velas(tf2).t),
      sesion: (s) => { const ses = parseSesion(s), o = new Uint8Array(v.length); for (let i = 0; i < v.length; i++) o[i] = enSesion(v.t[i], ses) ? 1 : 0; return o; },
      minutoNY: (i) => minutoNY(v.t[i]), fechaNY: (i) => fechaNY(v.t[i]), fechaNYms: fechaNY, minutoNYms: minutoNY,
      nz, na: esNa,
      strategy: null,
    };
    let bActual = 0;
    const st = {
      entry: (id, dir, o) => br.entry(id, dir, o, bActual),
      exit: (id, desdeId, o) => br.exit(id, desdeId, o, bActual),
      close: (id, o) => br.close(id, bActual, (o && o.comment) || 'Cierre'),
      close_all: (o) => br.closeAll(bActual, (o && o.comment) || 'Cierre'),
      cancel: (id) => br.cancel(id), cancel_all: () => br.cancelAll(),
      get position_size() { return br.posicion; },
      get opentrades() { return br.abiertas.length; },
      get closedtrades() { return br.cerradas.length; },
      get pendientes() { return br.pendientes().length; },
      cerradas: br.cerradas, abiertas: () => br.abiertas,
      alLlenar: (f) => br.eventos.lleno.push(f), alCerrar: (f) => br.eventos.cerro.push(f),
    };
    ctx.strategy = st;
    const porVela = script.preparar(ctx, p);
    for (let b = 0; b < v.length; b++) {
      bActual = b;
      if (b > 0) br.procesarVela(b);
      bActual = b;
      porVela(b);
    }
    const senales = br.ordenes.map((x) => {
      const t = x.desde < M1.T.length ? M1.T[x.desde] : M1.T[M1.T.length - 1] + 60000;
      return { t, dir: x.dir, tipo: x.tipo, precio: x.precio, slPrecio: x.slVivo, tpPrecio: x.tpVivo, expira: x.vence != null && x.vence < M1.T.length ? M1.T[x.vence] + 60000 : null, etiqueta: x.etiqueta };
    });
    return { ops: br.cerradas, senales, n: br.ordenes.length, broker: br, v };
  }

  // Estrategias propias en este formato (código traducido desde Pine o escrito a mano).
  function compilar(codigo) {
    const f = new Function('"use strict";\n' + codigo + '\n;return typeof preparar === "function" ? preparar : null;')();
    if (!f) throw new Error('El código tiene que definir function preparar(ctx, p) { ...; return (i) => { ... }; }');
    return f;
  }

  // Indicadores propios: function indicador(ctx, p) { ... ctx.plot(serie, 'título', '#color'); }
  function compilarIndicador(codigo) {
    const f = new Function('"use strict";\n' + codigo + '\n;return typeof indicador === "function" ? indicador : null;')();
    if (!f) throw new Error('El código tiene que definir function indicador(ctx, p) { ...; ctx.plot(serie, "título", "#color"); }');
    return f;
  }
  const esFormatoTV = (codigo) => /function\s+preparar\s*\(/.test(codigo || '');

  const API = { ta, nz, esNa, velas, security, mapearMayor, mapearMayorOff, enSesion, parseSesion, minutoNY, fechaNY, Broker, correr, compilar, compilarIndicador, esFormatoTV };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.TV = API;
})(typeof window !== 'undefined' ? window : globalThis);
