/* Motores de cálculo del reproductor (sin dependencias; navegador y Node).
 * - Estructura de mercado (mismo motor que el bot de señales: giros, BOS/CHoCH, rango).
 * - Bias Toolkit V4 (lógica del bot: LQ, PROTEGIDO/OBJETIVO, zona 0.618, plan).
 * - ICT Silver Bullet (reproducción del indicador de LuxAlgo, modo Super-Strict) y Silver Bullet TI (especificación del EA).
 * - Indicadores (EMA, SMA, RSI, ATR, MACD, Bollinger, pivotes) y simulador de órdenes en velas de 1 minuto.
 * Todo es causal: el valor en la vela i usa solo velas hasta i.
 */
(function (raiz) {
  'use strict';

  // ---------------- utilidades de tiempo (hora de Nueva York) ----------------
  const fmtNY = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const cacheNY = new Map();
  function offNY(ms) {
    const k = Math.floor(ms / 3600000);
    let v = cacheNY.get(k);
    if (v !== undefined) return v;
    const p = {};
    for (const x of fmtNY.formatToParts(new Date(k * 3600000))) p[x.type] = x.value;
    v = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - k * 3600000) / 60000);
    cacheNY.set(k, v);
    return v;
  }
  const minNY = (ms) => { const m = Math.floor(ms / 60000) + offNY(ms); return ((m % 1440) + 1440) % 1440; };
  const diaNY = (ms) => Math.floor((ms + offNY(ms) * 60000 - 17 * 3600000) / 86400000); // día de trading (cierre 17:00 NY)
  const SB = [[180, 240], [600, 660], [840, 900]];
  const ventanaSB = (ms) => { const m = minNY(ms); for (let k = 0; k < 3; k++) if (m >= SB[k][0] && m < SB[k][1]) return k + 1; return 0; };

  // Agrupa velas de 1 minuto (arrays T,O,H,L,C) en velas de `tf` minutos. Devuelve {t,o,h,l,c, ini, fin} (ini/fin = índices de 1 minuto).
  function cubetaTf(ms, tf) {
    if (tf <= 60) return Math.floor(ms / (tf * 60000)) * tf * 60000;
    const off = offNY(ms) * 60000;
    const local = ms + off;
    const inicioDia = Math.floor((local - 17 * 3600000) / 86400000) * 86400000 + 17 * 3600000;
    if (tf >= 1440) return inicioDia - off;
    return inicioDia + Math.floor((local - inicioDia) / (tf * 60000)) * tf * 60000 - off;
  }
  function agrupar(M, tf, hasta) {
    const n = hasta === undefined ? M.T.length : Math.min(M.T.length, hasta + 1);
    if (tf === 1) {
      const corta = (a) => (n === a.length ? a : a.subarray ? a.subarray(0, n) : a.slice(0, n));
      return { t: corta(M.T), o: corta(M.O), h: corta(M.H), l: corta(M.L), c: corta(M.C), ini: null, fin: null, length: n };
    }
    const t = [], o = [], h = [], l = [], c = [], ini = [], fin = [];
    let b = null;
    for (let i = 0; i < n; i++) {
      const bi = cubetaTf(M.T[i], tf);
      if (bi !== b) {
        b = bi; t.push(bi); o.push(M.O[i]); h.push(M.H[i]); l.push(M.L[i]); c.push(M.C[i]); ini.push(i); fin.push(i);
      } else {
        const k = t.length - 1;
        if (M.H[i] > h[k]) h[k] = M.H[i];
        if (M.L[i] < l[k]) l[k] = M.L[i];
        c[k] = M.C[i]; fin[k] = i;
      }
    }
    return { t, o, h, l, c, ini, fin, length: t.length };
  }

  // ---------------- indicadores ----------------
  function ema(x, n) { const out = new Array(x.length).fill(NaN); const k = 2 / (n + 1); let e = NaN; for (let i = 0; i < x.length; i++) { const v = x[i]; if (isNaN(v)) continue; e = isNaN(e) ? v : v * k + e * (1 - k); out[i] = e; } return out; }
  function sma(x, n) { const out = new Array(x.length).fill(NaN); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; if (i >= n - 1) out[i] = s / n; } return out; }
  function rma(x, n) { const out = new Array(x.length).fill(NaN); let r = NaN, s = 0; for (let i = 0; i < x.length; i++) { if (i < n) { s += x[i]; if (i === n - 1) { r = s / n; out[i] = r; } } else { r = (r * (n - 1) + x[i]) / n; out[i] = r; } } return out; }
  function rsi(c, n = 14) { const up = [], dn = []; for (let i = 0; i < c.length; i++) { const d = i ? c[i] - c[i - 1] : 0; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); } const u = rma(up, n), w = rma(dn, n); return u.map((v, i) => (isNaN(v) ? NaN : w[i] === 0 ? 100 : 100 - 100 / (1 + v / w[i]))); }
  function atr(h, l, c, n = 14) { const tr = h.map((x, i) => (i ? Math.max(x - l[i], Math.abs(x - c[i - 1]), Math.abs(l[i] - c[i - 1])) : x - l[i])); return rma(tr, n); }
  function macd(c, f = 12, s = 26, g = 9) { const a = ema(c, f), b = ema(c, s); const m = a.map((v, i) => v - b[i]); const sg = ema(m, g); return { macd: m, senal: sg, hist: m.map((v, i) => v - sg[i]) }; }
  function bollinger(c, n = 20, k = 2) { const m = sma(c, n); const sup = [], inf = []; for (let i = 0; i < c.length; i++) { if (isNaN(m[i])) { sup.push(NaN); inf.push(NaN); continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - m[i]) ** 2; const d = Math.sqrt(s / n); sup.push(m[i] + k * d); inf.push(m[i] - k * d); } return { media: m, sup, inf }; }
  // Pivote confirmado en la vela i (el pivote está en i - der): ta.pivothigh(izq, der).
  function pivotes(h, l, izq = 5, der = 1) {
    const ph = new Float64Array(h.length).fill(NaN), pl = new Float64Array(h.length).fill(NaN);
    for (let i = izq + der; i < h.length; i++) {
      const p = i - der;
      let esH = true, esL = true;
      for (let j = p - izq; j < p; j++) { if (!(h[p] > h[j])) esH = false; if (!(l[p] < l[j])) esL = false; }
      for (let j = p + 1; j <= i; j++) { if (!(h[p] > h[j])) esH = false; if (!(l[p] < l[j])) esL = false; }
      if (esH) ph[i] = h[p];
      if (esL) pl[i] = l[p];
    }
    return { ph, pl };
  }

  // ---------------- estructura (mismo motor que el bot) ----------------
  const nuevoNivel = () => ({ precio: null, anterior: null, usado: false, vela: null });
  const Estructura = {
    nuevoMotor(largo) { return { largo, espera: 'bajo', maximo: nuevoNivel(), minimo: nuevoNivel(), tendencia: 0, techo: null, piso: null }; },
    extenderRango(m, v) { if (m.techo !== null && v.high >= m.techo) m.techo = v.high; if (m.piso !== null && v.low <= m.piso) m.piso = v.low; },
    confirmarGiro(m, V, i) {
      const base = i - m.largo;
      if (base < 0) return null;
      let mayor = -Infinity, menor = Infinity;
      for (let k = base + 1; k <= i; k++) { if (V.h[k] > mayor) mayor = V.h[k]; if (V.l[k] < menor) menor = V.l[k]; }
      if (V.h[base] > mayor) { const toca = m.espera === 'alto'; m.espera = 'bajo'; if (!toca) return null; Object.assign(m.maximo, { precio: V.h[base], usado: false, vela: base }); m.techo = V.h[base]; return 'alto'; }
      if (V.l[base] < menor) { const toca = m.espera === 'bajo'; m.espera = 'alto'; if (!toca) return null; Object.assign(m.minimo, { precio: V.l[base], usado: false, vela: base }); m.piso = V.l[base]; return 'bajo'; }
      return null;
    },
    cruzo(n, c, ca, arriba) { if (n.precio === null || n.anterior === null || ca === null) return false; return arriba ? c > n.precio && ca <= n.anterior : c < n.precio && ca >= n.anterior; },
    evaluarRupturas(m, c, ca, permitir = { alcista: true, bajista: true }) {
      const r = [];
      if (Estructura.cruzo(m.maximo, c, ca, true) && !m.maximo.usado && permitir.alcista) { r.push({ sentido: 1, tipo: m.tendencia === -1 ? 'CHoCH' : 'BOS', precio: m.maximo.precio, desde: m.maximo.vela }); m.maximo.usado = true; m.tendencia = 1; }
      if (Estructura.cruzo(m.minimo, c, ca, false) && !m.minimo.usado && permitir.bajista) { r.push({ sentido: -1, tipo: m.tendencia === 1 ? 'CHoCH' : 'BOS', precio: m.minimo.precio, desde: m.minimo.vela }); m.minimo.usado = true; m.tendencia = -1; }
      return r;
    },
    cerrarVela(m) { m.maximo.anterior = m.maximo.precio; m.minimo.anterior = m.minimo.precio; },
  };

  // Bias Toolkit V4 sobre velas agrupadas V (arrays). htfBias(i) → tendencia del timeframe superior para la vela i (o null si no aplica).
  const CFG_BIAS = { swingLen: 50, internalLen: 5, lqMax: 10, lqWindow: 30, lqCierre: false, planInterno: false, entradaFib: false, tpObjetivo: false, entryRatio: 0.7, fib2: 0.618, slBuffer: 0, fAlinear: true, fHtf: true, fZona: true };
  function biasV4(V, cfg = {}, htfBias = null) {
    cfg = Object.assign({}, CFG_BIAS, cfg);
    const n = V.length;
    const swing = Estructura.nuevoMotor(cfg.swingLen), interna = Estructura.nuevoMotor(cfg.internalLen);
    const lqs = [];
    const rupturas = [];
    const tendSw = new Array(n), tendIn = new Array(n);
    let roleOverride = 0, lqHighBar = null, lqLowBar = null, zoneTouched = false, planBias = 0, planTop = null, planBottom = null;
    let dir = 0, hi = null, lo = null;
    const vela = (i) => ({ high: V.h[i], low: V.l[i] });
    const addLq = (nivel, esAlto, i) => {
      const ultimo = esAlto ? lqHighBar : lqLowBar;
      if (nivel.precio !== null && nivel.vela !== null && (ultimo == null ? -1 : ultimo) !== nivel.vela) {
        lqs.push({ lvl: nivel.precio, side: esAlto ? 1 : -1, neut: -1, desde: nivel.vela, creado: i });
        while (lqs.length > cfg.lqMax) lqs.shift();
        if (esAlto) lqHighBar = nivel.vela; else lqLowBar = nivel.vela;
      }
    };
    for (let i = 0; i < n; i++) {
      const cp = i > 0 ? V.c[i - 1] : null;
      Estructura.extenderRango(swing, vela(i)); Estructura.extenderRango(interna, vela(i));
      Estructura.confirmarGiro(swing, V, i); Estructura.confirmarGiro(interna, V, i);
      const ri = Estructura.evaluarRupturas(interna, V.c[i], cp, { alcista: interna.maximo.precio !== swing.maximo.precio, bajista: interna.minimo.precio !== swing.minimo.precio });
      for (const r of ri) {
        rupturas.push(Object.assign({ estructura: 'interna', hasta: i }, r));
        if (r.tipo === 'BOS') { roleOverride = r.sentido; addLq(r.sentido === 1 ? interna.minimo : interna.maximo, r.sentido === -1, i); } else roleOverride = 0;
      }
      const rs = Estructura.evaluarRupturas(swing, V.c[i], cp);
      for (const r of rs) rupturas.push(Object.assign({ estructura: 'swing', hasta: i }, r));
      if (rs.length) roleOverride = 0;
      for (const q of lqs) { if (q.neut >= 0) continue; const alto = q.side === 1; const b = cfg.lqCierre ? (alto ? V.c[i] > q.lvl : V.c[i] < q.lvl) : alto ? V.h[i] > q.lvl : V.l[i] < q.lvl; if (b) q.neut = i; }
      const roleBias = roleOverride !== 0 ? roleOverride : swing.tendencia;
      dir = cfg.planInterno ? interna.tendencia : roleBias;
      hi = cfg.planInterno ? interna.techo : swing.techo;
      lo = cfg.planInterno ? interna.piso : swing.piso;
      if (dir !== planBias || (hi == null ? -1 : hi) !== (planTop == null ? -1 : planTop) || (lo == null ? -1 : lo) !== (planBottom == null ? -1 : planBottom)) { zoneTouched = false; planBias = dir; planTop = hi; planBottom = lo; }
      if (dir !== 0 && hi !== null && lo !== null && hi > lo) { const rng = hi - lo, ratio = Math.min(cfg.fib2, cfg.entryRatio); zoneTouched = zoneTouched || (dir === 1 ? V.l[i] <= hi - rng * ratio : V.h[i] >= lo + rng * ratio); }
      tendSw[i] = swing.tendencia; tendIn[i] = interna.tendencia;
      Estructura.cerrarVela(swing); Estructura.cerrarVela(interna);
    }
    const est = { swBias: swing.tendencia, inBias: interna.tendencia, roleBias: roleOverride !== 0 ? roleOverride : swing.tendencia, dir, hi, lo, swHi: swing.techo, swLo: swing.piso, inHi: interna.techo, inLo: interna.piso, zoneTouched, lqs, swMax: Object.assign({}, swing.maximo), swMin: Object.assign({}, swing.minimo) };
    const htf = htfBias == null ? { disponible: false, bias: 0 } : { disponible: true, bias: htfBias };
    const plan = n ? planV4(est, V, n - 1, cfg, htf) : null;
    return { est, plan, rupturas, tendSw, tendIn };
  }
  function planV4(est, V, ult, cfg, htf) {
    cfg = Object.assign({}, CFG_BIAS, cfg);
    const cierre = V.c[ult];
    const { dir, hi, lo } = est;
    const alineadas = est.swBias !== 0 && est.swBias === est.inBias;
    const swingFavor = est.swBias !== 0 && est.swBias === dir;
    const r = { okAlin: !cfg.fAlinear || (cfg.entradaFib ? alineadas : swingFavor), okHtf: !cfg.fHtf || !htf.disponible || (htf.bias !== 0 && htf.bias === dir), okZona: !cfg.fZona || est.zoneTouched, lq: null, plan: null };
    if (dir === 0 || hi === null || lo === null || !(hi > lo)) return r;
    const largo = dir === 1;
    const sl = largo ? lo - cfg.slBuffer : hi + cfg.slBuffer;
    const tp = cfg.tpObjetivo ? (largo ? hi : lo) : (hi + lo) / 2;
    const enRango = (lv) => (largo ? lv > sl && lv < tp : lv < sl && lv > tp);
    let entrada = null, activada = false;
    if (!cfg.entradaFib) {
      const lado = largo ? -1 : 1;
      let mejor = -1, mejorNb = -1;
      est.lqs.forEach((q, k) => { if (q.side === lado && q.neut >= 0 && ult - q.neut <= cfg.lqWindow && enRango(q.lvl) && q.neut > mejorNb) { mejor = k; mejorNb = q.neut; } });
      if (mejor === -1) { let md = null; est.lqs.forEach((q, k) => { if (q.side === lado && q.neut < 0 && enRango(q.lvl)) { const d = Math.abs(q.lvl - cierre); if (md === null || d < md) { mejor = k; md = d; } } }); }
      r.lq = mejor >= 0;
      if (mejor >= 0) { entrada = est.lqs[mejor].lvl; activada = est.lqs[mejor].neut >= 0; }
    } else { entrada = largo ? hi - (hi - lo) * cfg.entryRatio : lo + (hi - lo) * cfg.entryRatio; activada = largo ? cierre <= entrada : cierre >= entrada; }
    if (entrada !== null && enRango(entrada)) r.plan = { dir, entrada, sl, tp, activada };
    return r;
  }
  // Tendencia del timeframe superior al cierre de cada una de sus velas.
  function tendenciasHtf(V, largo) {
    const m = Estructura.nuevoMotor(largo), out = new Array(V.length);
    for (let i = 0; i < V.length; i++) { Estructura.confirmarGiro(m, V, i); Estructura.evaluarRupturas(m, V.c[i], i ? V.c[i - 1] : null); Estructura.cerrarVela(m); out[i] = m.tendencia; }
    return out;
  }

  // ---------------- ICT Silver Bullet (LuxAlgo, Super-Strict) ----------------
  // Devuelve FVG (con estados), retesteos, confirmaciones al cierre de la sesión, tendencia MSS y objetivos de liquidez.
  function luxSB(V, opc = {}) {
    const izq = opc.izq || 5, conObjetivos = opc.objetivos !== false;
    const n = V.length;
    const enSB = new Int8Array(n); for (let i = 0; i < n; i++) enSB[i] = ventanaSB(V.t[i]);
    const { ph, pl } = pivotes(V.h, V.l, izq, 1);
    const zd = [0, 0, 0, 0], zy = [NaN, NaN, NaN, NaN];
    const regla = (T, c) => { const iH = zd[2] === 1 ? 2 : 1, iL = zd[2] === -1 ? 2 : 1; if (zd[iH] === 1 && c > zy[iH] && T < 1) return 1; if (zd[iL] === -1 && c < zy[iL] && T > -1) return -1; return T; };
    let T = 0;
    const fvgs = [], vivos = [], retesteos = [], confirmadas = [], tend = new Int8Array(n), objetivos = [], objActivos = [];
    // Objetivos (previous session similar): giros acumulados por tipo de sesión desde el fin de la anterior.
    const giros = { 1: { H: [], L: [] }, 2: { H: [], L: [] }, 3: { H: [], L: [] } };
    let sesId = 0;
    for (let i = 0; i < n; i++) {
      const sb = enSB[i] > 0, sbPrev = i > 0 && enSB[i - 1] > 0;
      const strSb = sb && !sbPrev, endSb = !sb && sbPrev;
      const tipoFin = endSb ? enSB[i - 1] : 0;
      const Tf = regla(T, V.c[i]);
      if (strSb) { sesId++; for (const f of vivos) f.vigente = false; }
      if (sb && i >= 2) {
        if (Tf === 1) { if (V.l[i] > V.h[i - 2]) { const f = { dir: 1, top: V.l[i], bot: V.h[i - 2], c1: V.l[i - 2], i, ses: sesId, ventana: enSB[i], activo: false, vigente: true, anulado: -1, activado: -1, valido: false, fin: -1 }; fvgs.push(f); vivos.push(f); } }
        else if (V.h[i] < V.l[i - 2]) { const f = { dir: -1, top: V.l[i - 2], bot: V.h[i], c1: V.h[i - 2], i, ses: sesId, ventana: enSB[i], activo: false, vigente: true, anulado: -1, activado: -1, valido: false, fin: -1 }; fvgs.push(f); vivos.push(f); }
      }
      const validosFin = [];
      for (const f of vivos) {
        if (!f.vigente) continue;
        if (sb) {
          if (f.dir === 1) {
            if (V.c[i] < f.bot) { f.vigente = false; f.activo = false; f.anulado = i; continue; }
            if (!f.activo && V.l[i] < f.top && V.c[i] > f.bot) { f.activo = true; f.activado = i; retesteos.push({ i, dir: 1, f }); }
          } else {
            if (V.c[i] > f.top) { f.vigente = false; f.activo = false; f.anulado = i; continue; }
            if (!f.activo && V.h[i] > f.bot && V.c[i] < f.top) { f.activo = true; f.activado = i; retesteos.push({ i, dir: -1, f }); }
          }
        }
        if (endSb && f.activo) { if (f.dir === 1 ? V.c[i] > f.top : V.c[i] < f.bot) { f.valido = true; validosFin.push(f); } f.vigente = false; f.fin = i; }
        else if (endSb) { f.vigente = false; f.fin = i; }
      }
      if (validosFin.length) confirmadas.push({ i, f: validosFin[validosFin.length - 1] });
      for (let k = vivos.length - 1; k >= 0; k--) if (!vivos[k].vigente) vivos.splice(k, 1);
      // giros para objetivos (se acumulan todo el tiempo)
      if (conObjetivos && !isNaN(ph[i])) for (const g of Object.values(giros)) { g.H = g.H.filter((x) => x.p > ph[i]); g.H.unshift({ i: i - 1, p: ph[i] }); }
      if (conObjetivos && !isNaN(pl[i])) for (const g of Object.values(giros)) { g.L = g.L.filter((x) => x.p < pl[i]); g.L.unshift({ i: i - 1, p: pl[i] }); }
      if (endSb && conObjetivos) {
        const g = giros[tipoFin];
        const alc = fvgs.filter((f) => f.ses === sesId && f.valido && f.dir === 1), baj = fvgs.filter((f) => f.ses === sesId && f.valido && f.dir === -1);
        if (alc.length) { const mn = Math.min(...alc.map((f) => f.bot)); for (const x of g.H) if (x.p > mn) { const ob = { desde: x.i, p: x.p, lado: 1, creado: i, hasta: -1 }; objetivos.push(ob); objActivos.push(ob); } }
        if (baj.length) { const mx = Math.max(...baj.map((f) => f.top)); for (const x of g.L) if (x.p < mx) { const ob = { desde: x.i, p: x.p, lado: -1, creado: i, hasta: -1 }; objetivos.push(ob); objActivos.push(ob); } }
        g.H = []; g.L = [];
      }
      if (objActivos.length) { let w = 0; for (const o of objActivos) { if (i > o.creado && (o.lado === 1 ? V.h[i] > o.p : V.l[i] < o.p)) o.hasta = i; else objActivos[w++] = o; } objActivos.length = w; }
      // zigzag
      if (!isNaN(ph[i])) { if (zd[0] < 1) { zd.unshift(1); zy.unshift(V.h[i - 1]); zd.pop(); zy.pop(); } else if (ph[i] > zy[0]) zy[0] = V.h[i - 1]; }
      if (!isNaN(pl[i])) { if (zd[0] > -1) { zd.unshift(-1); zy.unshift(V.l[i - 1]); zd.pop(); zy.pop(); } else if (pl[i] < zy[0]) zy[0] = V.l[i - 1]; }
      T = regla(T, V.c[i]);
      tend[i] = T;
    }
    return { fvgs, retesteos, confirmadas, tend, objetivos, enSB };
  }

  // ---------------- estrategias (generadores de señales) ----------------
  // Señal: {t (ms de decisión = cierre de la vela), dir, tipo: 'mercado'|'limit', precio, sl, tp, expira, anula: {dir, nivel}, etiqueta}
  const DUR = (tf) => (tf >= 1440 ? 86400000 : tf * 60000);
  function senalesLuxSB(M, p) {
    const V = agrupar(M, p.tf);
    const r = luxSB(V, { objetivos: false });
    const fin = (i) => V.t[i] + DUR(p.tf);
    const out = [];
    const lista = p.entrada === 'confirmada' ? r.confirmadas : r.retesteos;
    for (const e of lista) {
      const f = e.f;
      let sl = p.stop === 'vela1' ? f.c1 : f.dir === 1 ? f.bot : f.top;
      if (p.stop === 'usd') sl = null;
      out.push({ t: fin(e.i), dir: f.dir, tipo: 'mercado', slPrecio: sl, slUsd: p.stop === 'usd' ? p.slUsd : null, rr: p.rr, etiqueta: `SB ${['', 'Londres', 'AM', 'PM'][f.ventana]} · FVG ${f.dir === 1 ? 'alcista' : 'bajista'}` });
    }
    return out;
  }
  function senalesSbTI(M, p) {
    // Especificación del EA Silver Bullet TI v1.00: M1, tendencia por MSS (giros 5/1), primer FVG válido de la ventana a favor,
    // limit en el borde del FVG, cancelación al fin de la ventana o si el FVG se anula, SL en el swing del movimiento ± spread, TP 2R.
    const V = agrupar(M, p.tf || 1);
    const r = luxSB(V, { objetivos: false });
    const { pl, ph } = pivotes(V.h, V.l, 5, 1);
    const out = [];
    const usadas = new Set();
    let ultMin = -1, ultMax = -1;
    const minimos = new Int32Array(V.length), maximos = new Int32Array(V.length);
    for (let i = 0; i < V.length; i++) { if (!isNaN(pl[i])) ultMin = i - 1; if (!isNaN(ph[i])) ultMax = i - 1; minimos[i] = ultMin; maximos[i] = ultMax; }
    for (const f of r.fvgs) {
      const clave = f.ses;
      if (usadas.has(clave)) continue;
      usadas.add(clave);
      // fin de la ventana: primera vela fuera de la sesión
      let finV = f.i; while (finV < V.length && r.enSB[finV] > 0) finV++;
      const desde = f.dir === 1 ? minimos[f.i - 2] : maximos[f.i - 2];
      let ext = f.dir === 1 ? Infinity : -Infinity;
      for (let k = Math.max(0, desde); k <= f.i - 2; k++) ext = f.dir === 1 ? Math.min(ext, V.l[k]) : Math.max(ext, V.h[k]);
      if (!isFinite(ext)) ext = f.c1;
      const margen = p.spread || 0;
      out.push({ t: V.t[f.i] + DUR(p.tf || 1), dir: f.dir, tipo: 'limit', precio: f.dir === 1 ? f.top : f.bot, slPrecio: f.dir === 1 ? ext - margen : ext + margen, rr: p.rr, expira: finV < V.length ? V.t[finV] : null, anula: { dir: f.dir, nivel: f.dir === 1 ? f.bot : f.top }, slMin: p.slMin || 0, etiqueta: `SB TI ${['', 'Londres', 'AM', 'PM'][f.ventana]}` });
    }
    return out;
  }
  function senalesBias(M, p) {
    const V = agrupar(M, p.tf);
    const htfTf = p.htf || 15;
    const VH = agrupar(M, htfTf);
    const tH = tendenciasHtf(VH, p.htfInterno === false ? CFG_BIAS.swingLen : CFG_BIAS.internalLen);
    const out = [];
    let ultimo = '';
    let jh = 0;
    // Se recorre vela a vela con el motor incremental (equivale a biasV4 sobre V[0..i]).
    const cfg = Object.assign({}, CFG_BIAS, p.cfg || {});
    const st = biasIncremental(cfg);
    for (let i = 0; i < V.length; i++) {
      st.paso(V, i);
      let htf = null;
      if (p.tf <= htfTf) {
        const b = cubetaTf(V.t[i], htfTf);
        while (jh + 1 < VH.length && VH.t[jh + 1] <= b) jh++;
        htf = VH.t[jh] === b && jh > 0 ? tH[jh - 1] : 0;
      }
      const pr = planV4(st.estado(), V, i, cfg, htf == null ? { disponible: false, bias: 0 } : { disponible: true, bias: htf });
      const plan = pr.okAlin && pr.okHtf && pr.okZona ? pr.plan : null;
      const clave = plan ? [plan.dir, plan.entrada.toFixed(2), plan.sl.toFixed(2), plan.tp.toFixed(2)].join('|') : '';
      if (plan && clave !== ultimo) {
        const riesgo = Math.abs(plan.entrada - plan.sl), rr = Math.abs(plan.tp - plan.entrada) / riesgo;
        if (!(p.rrMin && rr < p.rrMin)) out.push({ t: V.t[i] + DUR(p.tf), dir: plan.dir, tipo: plan.activada ? 'mercado' : 'limit', precio: plan.entrada, slPrecio: plan.sl, tpPrecio: plan.tp, reemplaza: true, etiqueta: `Bias V4 · R:R ${rr.toFixed(2)}` });
      }
      if (!plan && ultimo) out.push({ t: V.t[i] + DUR(p.tf), cancelar: true });
      ultimo = clave;
    }
    return out;
  }
  function biasIncremental(cfg) {
    const swing = Estructura.nuevoMotor(cfg.swingLen), interna = Estructura.nuevoMotor(cfg.internalLen);
    const lqs = [];
    let roleOverride = 0, lqHighBar = null, lqLowBar = null, zoneTouched = false, planBias = 0, planTop = null, planBottom = null, dir = 0, hi = null, lo = null;
    const addLq = (nivel, esAlto) => { const u = esAlto ? lqHighBar : lqLowBar; if (nivel.precio !== null && nivel.vela !== null && (u == null ? -1 : u) !== nivel.vela) { lqs.push({ lvl: nivel.precio, side: esAlto ? 1 : -1, neut: -1 }); while (lqs.length > cfg.lqMax) lqs.shift(); if (esAlto) lqHighBar = nivel.vela; else lqLowBar = nivel.vela; } };
    return {
      paso(V, i) {
        const cp = i > 0 ? V.c[i - 1] : null, v = { high: V.h[i], low: V.l[i] };
        Estructura.extenderRango(swing, v); Estructura.extenderRango(interna, v);
        Estructura.confirmarGiro(swing, V, i); Estructura.confirmarGiro(interna, V, i);
        for (const r of Estructura.evaluarRupturas(interna, V.c[i], cp, { alcista: interna.maximo.precio !== swing.maximo.precio, bajista: interna.minimo.precio !== swing.minimo.precio })) { if (r.tipo === 'BOS') { roleOverride = r.sentido; addLq(r.sentido === 1 ? interna.minimo : interna.maximo, r.sentido === -1); } else roleOverride = 0; }
        if (Estructura.evaluarRupturas(swing, V.c[i], cp).length) roleOverride = 0;
        for (const q of lqs) { if (q.neut >= 0) continue; const alto = q.side === 1; if (cfg.lqCierre ? (alto ? V.c[i] > q.lvl : V.c[i] < q.lvl) : alto ? V.h[i] > q.lvl : V.l[i] < q.lvl) q.neut = i; }
        const roleBias = roleOverride !== 0 ? roleOverride : swing.tendencia;
        dir = cfg.planInterno ? interna.tendencia : roleBias; hi = cfg.planInterno ? interna.techo : swing.techo; lo = cfg.planInterno ? interna.piso : swing.piso;
        if (dir !== planBias || (hi == null ? -1 : hi) !== (planTop == null ? -1 : planTop) || (lo == null ? -1 : lo) !== (planBottom == null ? -1 : planBottom)) { zoneTouched = false; planBias = dir; planTop = hi; planBottom = lo; }
        if (dir !== 0 && hi !== null && lo !== null && hi > lo) { const rng = hi - lo, ratio = Math.min(cfg.fib2, cfg.entryRatio); zoneTouched = zoneTouched || (dir === 1 ? V.l[i] <= hi - rng * ratio : V.h[i] >= lo + rng * ratio); }
        Estructura.cerrarVela(swing); Estructura.cerrarVela(interna);
      },
      estado() { return { swBias: swing.tendencia, inBias: interna.tendencia, dir, hi, lo, zoneTouched, lqs }; },
    };
  }

  // Estrategia propia escrita en JavaScript por el usuario. `codigo` define function estrategia(v, i, ta, estado).
  function compilarPropia(codigo) {
    // eslint-disable-next-line no-new-func
    const fabrica = new Function('"use strict";\n' + codigo + '\n;return typeof estrategia === "function" ? estrategia : null;');
    const fn = fabrica();
    if (!fn) throw new Error('El código tiene que definir function estrategia(v, i, ta, estado) { ... }');
    return fn;
  }
  function senalesPropia(M, p) {
    const fn = compilarPropia(p.codigo);
    const V = agrupar(M, p.tf);
    const F = { t: Float64Array.from(V.t), o: Float64Array.from(V.o), h: Float64Array.from(V.h), l: Float64Array.from(V.l), c: Float64Array.from(V.c) };
    const cache = new Map();
    const serie = (clave, calc) => { if (!cache.has(clave)) cache.set(clave, Float64Array.from(calc())); return cache.get(clave); };
    const fuente = (x) => (x === 'o' || x === 'h' || x === 'l' || x === 'c' ? F[x] : x);
    const out = [];
    const estado = {};
    for (let i = 0; i < V.length; i++) {
      const corte = (a) => a.subarray(0, i + 1);
      const v = { t: corte(F.t), o: corte(F.o), h: corte(F.h), l: corte(F.l), c: corte(F.c), length: i + 1, minutoNY: (k) => minNY(F.t[k]), ventanaSB: (k) => ventanaSB(F.t[k]) };
      const ta = {
        ema: (n, s = 'c') => corte(serie('ema' + n + s, () => ema(Array.from(fuente(s)), n))),
        sma: (n, s = 'c') => corte(serie('sma' + n + s, () => sma(Array.from(fuente(s)), n))),
        rsi: (n = 14) => corte(serie('rsi' + n, () => rsi(Array.from(F.c), n))),
        atr: (n = 14) => corte(serie('atr' + n, () => atr(Array.from(F.h), Array.from(F.l), Array.from(F.c), n))),
        maximo: (n, k = i) => { let m = -Infinity; for (let j = Math.max(0, k - n + 1); j <= k; j++) m = Math.max(m, F.h[j]); return m; },
        minimo: (n, k = i) => { let m = Infinity; for (let j = Math.max(0, k - n + 1); j <= k; j++) m = Math.min(m, F.l[j]); return m; },
        cruzaArriba: (a, b) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1],
        cruzaAbajo: (a, b) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1],
      };
      let r;
      try { r = fn(v, i, ta, estado); } catch (e) { throw new Error('Error en tu estrategia en la vela ' + i + ': ' + e.message); }
      if (!r) continue;
      const lista = Array.isArray(r) ? r : [r];
      for (const s of lista) {
        if (s.cancelar) { out.push({ t: F.t[i] + DUR(p.tf), cancelar: true }); continue; }
        const dir = s.lado === 'venta' || s.dir === -1 ? -1 : 1;
        out.push({ t: F.t[i] + DUR(p.tf), dir, tipo: s.tipo === 'limit' || s.tipo === 'stop' ? s.tipo : 'mercado', precio: s.precio, slPrecio: s.sl, slUsd: s.slUsd, tpPrecio: s.tp, rr: s.rr || p.rr, expira: s.expiraMin ? F.t[i] + DUR(p.tf) + s.expiraMin * 60000 : null, etiqueta: s.nota || 'Propia' });
      }
    }
    return out;
  }

  // ---------------- simulador (velas de 1 minuto) ----------------
  // costos: {spread, desliz} en USD. Una posición a la vez; una orden pendiente a la vez (una nueva reemplaza si `reemplaza`).
  function simular(M, senales, opc = {}) {
    const spBase = opc.spread || 0, dsBase = opc.desliz || 0, maxMin = opc.maxMin || 0, propo = !!opc.proporcional;
    // riesgoMin: stop mínimo en USD (a precio 4000 si es proporcional). Evita operaciones con el stop dentro del spread.
    const rmBase = opc.riesgoMin || 0;
    let rMin = rmBase;
    let sp = spBase, ds = dsBase;
    const n = M.T.length;
    const ops = [];
    let k = 0, pos = null, pend = null;
    const ord = senales.slice().sort((a, b) => a.t - b.t);
    let j = 0;
    const cerrar = (i, precio, motivo) => {
      const riesgo = Math.abs(pos.entrada - pos.sl);
      ops.push({ dir: pos.dir, tEntrada: pos.t, entrada: pos.entrada, sl: pos.sl, tp: pos.tp, tSalida: M.T[i] + 60000, salida: precio, r: ((precio - pos.entrada) * pos.dir) / riesgo, motivo, etiqueta: pos.etiqueta, min: Math.round((M.T[i] + 60000 - pos.t) / 60000) });
      pos = null;
    };
    const abrir = (s, i, fill) => {
      let sl = s.slPrecio != null ? s.slPrecio : fill - s.dir * s.slUsd;
      const riesgo = (fill - sl) * s.dir;
      if (!(riesgo > 0) || riesgo < rMin || (s.slMin && riesgo < s.slMin)) return false;
      const tp = s.tpPrecio != null ? s.tpPrecio : fill + s.dir * riesgo * (s.rr || 2);
      if ((tp - fill) * s.dir <= 0) return false;
      pos = { dir: s.dir, entrada: fill, sl, tp, t: M.T[i], etiqueta: s.etiqueta };
      return true;
    };
    for (let i = 0; i < n; i++) {
      const t = M.T[i];
      // señales decididas antes de la apertura de esta vela
      while (j < ord.length && ord[j].t <= t) {
        const s = ord[j++];
        if (s.cancelar) { if (pend) pend = null; continue; }
        if (pos) continue;
        if (pend && !s.reemplaza) continue;
        pend = s;
      }
      const o = M.O[i], h = M.H[i], l = M.L[i], c = M.C[i];
      if (propo) { sp = (spBase * o) / 4000; ds = (dsBase * o) / 4000; rMin = (rmBase * o) / 4000; }
      let entro = false;
      if (pend && !pos) {
        const s = pend;
        if (s.expira != null && t >= s.expira) pend = null;
        else {
          let fill = null;
          if (s.tipo === 'mercado') fill = s.dir === 1 ? o + sp + ds : o - ds;
          else if (s.tipo === 'limit') { if (s.dir === 1 && l + sp <= s.precio) fill = Math.min(s.precio, o + sp); if (s.dir === -1 && h >= s.precio) fill = Math.max(s.precio, o); }
          else if (s.tipo === 'stop') { if (s.dir === 1 && h + sp >= s.precio) fill = Math.max(s.precio, o + sp) + ds; if (s.dir === -1 && l <= s.precio) fill = Math.min(s.precio, o) - ds; }
          if (fill !== null) { pend = null; if (abrir(s, i, fill)) entro = s.tipo !== 'mercado'; }
          else if (s.anula && (s.anula.dir === 1 ? c < s.anula.nivel : c > s.anula.nivel)) pend = null;
        }
      }
      if (pos) {
        const p = pos;
        if (p.dir === 1) {
          if (!entro && o <= p.sl) cerrar(i, o - ds, 'SL');
          else if (l <= p.sl) cerrar(i, p.sl - ds, 'SL');
          else if (!entro && h >= p.tp) cerrar(i, Math.max(p.tp, o), 'TP');
          else if (maxMin && (t + 60000 - p.t) / 60000 >= maxMin) cerrar(i, c, 'Tiempo');
        } else {
          if (!entro && o + sp >= p.sl) cerrar(i, o + sp + ds, 'SL');
          else if (h + sp >= p.sl) cerrar(i, p.sl + ds, 'SL');
          else if (!entro && l + sp <= p.tp) cerrar(i, Math.min(p.tp, o + sp), 'TP');
          else if (maxMin && (t + 60000 - p.t) / 60000 >= maxMin) cerrar(i, c + sp, 'Tiempo');
        }
      }
    }
    if (pos) cerrar(n - 1, pos.dir === 1 ? M.C[n - 1] : M.C[n - 1] + sp, 'Fin de datos');
    return ops;
  }
  function resumen(ops, riesgoPct = 1) {
    const n = ops.length;
    const g = ops.filter((o) => o.r > 0), p = ops.filter((o) => o.r <= 0);
    const sum = (a) => a.reduce((s, o) => s + o.r, 0);
    let eq = 0, pico = 0, dd = 0, racha = 0, peor = 0, capital = 1, picoCap = 1, ddPct = 0;
    for (const o of ops) { eq += o.r; pico = Math.max(pico, eq); dd = Math.max(dd, pico - eq); racha = o.r <= 0 ? racha + 1 : 0; peor = Math.max(peor, racha); capital *= 1 + (riesgoPct / 100) * o.r; picoCap = Math.max(picoCap, capital); ddPct = Math.max(ddPct, 1 - capital / picoCap); }
    const perd = -sum(p);
    return { n, acierto: n ? g.length / n : 0, rTotal: sum(ops), rProm: n ? sum(ops) / n : 0, pf: perd > 0 ? sum(g) / perd : null, ddR: dd, peorRacha: peor, capitalPct: (capital - 1) * 100, ddPct: ddPct * 100, minProm: n ? ops.reduce((s, o) => s + o.min, 0) / n : 0 };
  }

  const API = { offNY, minNY, diaNY, ventanaSB, cubetaTf, agrupar, ema, sma, rsi, atr, macd, bollinger, pivotes, Estructura, biasV4, planV4, tendenciasHtf, luxSB, senalesLuxSB, senalesSbTI, senalesBias, senalesPropia, compilarPropia, simular, resumen, CFG_BIAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.REPM = API;
})(typeof window !== 'undefined' ? window : globalThis);
