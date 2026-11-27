/* Las mejores estrategias de trading-strategy-lab, escritas para el motor compatible con TradingView (js/tv.js).
 * Cada una reproduce las reglas exactas del laboratorio (E022, E023/E024 y E025) y trae sus resultados de los últimos 5 años.
 * Formato: { id, nombre, desc, tf (minutos o función de p), calentamientoDias, params, preparar(ctx, p) → (i) => {...} }. */
(function (raiz) {
  'use strict';
  const TV = raiz.TV || (typeof require !== 'undefined' ? require('./tv.js') : null);
  const { ta } = TV;
  const N = (n) => new Float64Array(n).fill(NaN);

  // Último pivote confirmado al cierre de cada vela (regla de trading-strategy-lab: mayor estricto a la izquierda, ≥ a la derecha).
  function pivotesUlt(h, l, L) {
    const a = ta.pivothigh(h, L, L), b = ta.pivotlow(l, L, L), ph = N(h.length), pl = N(h.length);
    let x = NaN, y = NaN;
    for (let i = 0; i < h.length; i++) { if (a[i] === a[i]) x = a[i]; if (b[i] === b[i]) y = b[i]; ph[i] = x; pl[i] = y; }
    return { ph, pl };
  }
  function estadoEstructura(c, ph, pl) {
    const o = new Int8Array(c.length);
    let s = 0;
    for (let i = 1; i < c.length; i++) { if (ph[i - 1] === ph[i - 1] && c[i] > ph[i - 1]) s = 1; else if (pl[i - 1] === pl[i - 1] && c[i] < pl[i - 1]) s = -1; o[i] = s; }
    return o;
  }
  const signo = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const mapa = (q, arr, def = NaN) => Float64Array.from(q, (k) => (k >= 0 ? arr[k] : def));
  const ventanaKz = (t, minutoNY) => { const m = minutoNY(t); return m >= 120 && m < 300 ? 1 : m >= 510 && m < 660 ? 2 : 0; };

  // SMC (E023): barrido → cambio de estructura. Devuelve los setups por vela.
  function detectarSMC(o, h, l, c, refLo, refHi, ph, pl, W, recupera) {
    const n = c.length, out = [];
    let armU = false, sU = 0, extU = 0, nivU = 0, usoU = NaN, armD = false, sD = 0, extD = 0, nivD = 0, usoD = NaN;
    for (let i = 1; i < n; i++) {
      let nuevo = false;
      const rl = refLo[i];
      if (rl === rl && rl !== usoU && l[i] < rl && (!recupera || c[i] > rl)) {
        const m = ph[i];
        if (m === m && m > c[i]) { armU = true; sU = i; extU = l[i]; nivU = m; usoU = rl; nuevo = true; }
      }
      if (armU && !nuevo) {
        if (l[i] < extU) extU = l[i];
        if (i - sU > W) armU = false;
        else if (c[i] > nivU) {
          let tope = h[sU]; for (let j = sU; j <= i; j++) if (h[j] > tope) tope = h[j];
          let f1 = NaN, f2 = NaN, ob = NaN;
          for (let j = i; j > sU + 1; j--) if (l[j] > h[j - 2]) { f1 = l[j]; f2 = h[j - 2]; break; }
          for (let j = i; j >= sU; j--) if (c[j] < o[j]) { ob = h[j]; break; }
          out.push({ d: 1, m: i, ext: extU, opu: tope, f1, f2, ob });
          armU = false;
        }
      }
      nuevo = false;
      const rh = refHi[i];
      if (rh === rh && rh !== usoD && h[i] > rh && (!recupera || c[i] < rh)) {
        const m = pl[i];
        if (m === m && m < c[i]) { armD = true; sD = i; extD = h[i]; nivD = m; usoD = rh; nuevo = true; }
      }
      if (armD && !nuevo) {
        if (h[i] > extD) extD = h[i];
        if (i - sD > W) armD = false;
        else if (c[i] < nivD) {
          let piso = l[sD]; for (let j = sD; j <= i; j++) if (l[j] < piso) piso = l[j];
          let f1 = NaN, f2 = NaN, ob = NaN;
          for (let j = i; j > sD + 1; j--) if (h[j] < l[j - 2]) { f1 = h[j]; f2 = l[j - 2]; break; }
          for (let j = i; j >= sD; j--) if (c[j] > o[j]) { ob = l[j]; break; }
          out.push({ d: -1, m: i, ext: extD, opu: piso, f1, f2, ob });
          armD = false;
        }
      }
    }
    return out;
  }

  // ICT (E025): FVG con la vela del medio a favor y tamaño mínimo en ATR.
  const fvgAlc = (o, h, l, c, atr, j, mn) => l[j] > h[j - 2] && c[j - 1] > o[j - 1] && l[j] - h[j - 2] >= mn * atr[j];
  const fvgBaj = (o, h, l, c, atr, j, mn) => h[j] < l[j - 2] && c[j - 1] < o[j - 1] && l[j - 2] - h[j] >= mn * atr[j];

  function ictS1(o, h, l, c, atr, ph, pl, kz, kzfin, mascara, N1, V, minfvg, zona, ce, margen) {
    const n = c.length, out = [];
    let armU = false, sU = 0, extU = 0, nivU = 0, usoU = NaN, armD = false, sD = 0, extD = 0, nivD = 0, usoD = NaN;
    for (let i = 1; i < n; i++) {
      let nuevo = false;
      const rl = pl[i - 1];
      if (rl === rl && rl !== usoU && l[i] < rl && c[i] > rl && ph[i] === ph[i] && ph[i] > c[i]) { armU = true; sU = i; extU = l[i]; nivU = ph[i]; usoU = rl; nuevo = true; }
      if (armU && !nuevo) {
        if (l[i] < extU) extU = l[i];
        if (i - sU > N1) armU = false;
        else if (c[i] > nivU) {
          armU = false;
          if (kz[i] > 0 && (mascara & kz[i]) !== 0) {
            let tope = NaN, base = NaN;
            if (zona !== 2) for (let j = i; j > sU + 1; j--) if (fvgAlc(o, h, l, c, atr, j, minfvg)) { tope = l[j]; base = h[j - 2]; break; }
            if (tope !== tope && zona !== 1) for (let j = i; j >= sU; j--) if (c[j] < o[j]) { tope = h[j]; base = l[j]; break; }
            if (tope === tope) {
              const e = ce === 0 ? tope : (tope + base) / 2, sl = extU - margen * atr[i];
              if (e < c[i] && e > sl) out.push({ m: i, d: 1, e, sl, x: Math.min(i + V, kzfin[i]) });
            }
          }
        }
      }
      nuevo = false;
      const rh = ph[i - 1];
      if (rh === rh && rh !== usoD && h[i] > rh && c[i] < rh && pl[i] === pl[i] && pl[i] < c[i]) { armD = true; sD = i; extD = h[i]; nivD = pl[i]; usoD = rh; nuevo = true; }
      if (armD && !nuevo) {
        if (h[i] > extD) extD = h[i];
        if (i - sD > N1) armD = false;
        else if (c[i] < nivD) {
          armD = false;
          if (kz[i] > 0 && (mascara & kz[i]) !== 0) {
            let piso = NaN, techo = NaN;
            if (zona !== 2) for (let j = i; j > sD + 1; j--) if (fvgBaj(o, h, l, c, atr, j, minfvg)) { piso = h[j]; techo = l[j - 2]; break; }
            if (piso !== piso && zona !== 1) for (let j = i; j >= sD; j--) if (c[j] > o[j]) { piso = l[j]; techo = h[j]; break; }
            if (piso === piso) {
              const e = ce === 0 ? piso : (piso + techo) / 2, sl = extD + margen * atr[i];
              if (e > c[i] && e < sl) out.push({ m: i, d: -1, e, sl, x: Math.min(i + V, kzfin[i]) });
            }
          }
        }
      }
    }
    return out;
  }
  function ictS5(o, h, l, c, atr, sesgo, ph3, pl3, kz, kzfin, mascara, N5, V, minfvg, ce, margen) {
    const n = c.length, out = [];
    let armU = false, sU = 0, extU = 0, usoU = NaN, armD = false, sD = 0, extD = 0, usoD = NaN;
    for (let i = 2; i < n; i++) {
      const enKz = kz[i] > 0 && (mascara & kz[i]) !== 0;
      if (!enKz || sesgo[i] !== 1) armU = false;
      else {
        const rl = pl3[i - 1];
        if (rl === rl && rl !== usoU && l[i] < rl) { armU = true; sU = i; extU = l[i]; usoU = rl; }
        else if (armU) {
          if (l[i] < extU) extU = l[i];
          if (i - sU > N5) armU = false;
          else if (i - 2 >= sU && fvgAlc(o, h, l, c, atr, i, minfvg)) {
            const e = ce === 0 ? l[i] : (l[i] + h[i - 2]) / 2, sl = extU - margen * atr[i];
            if (e < c[i] && e > sl) out.push({ m: i, d: 1, e, sl, x: Math.min(i + V, kzfin[i]) });
            armU = false;
          }
        }
      }
      if (!enKz || sesgo[i] !== -1) armD = false;
      else {
        const rh = ph3[i - 1];
        if (rh === rh && rh !== usoD && h[i] > rh) { armD = true; sD = i; extD = h[i]; usoD = rh; }
        else if (armD) {
          if (h[i] > extD) extD = h[i];
          if (i - sD > N5) armD = false;
          else if (i - 2 >= sD && fvgBaj(o, h, l, c, atr, i, minfvg)) {
            const e = ce === 0 ? h[i] : (h[i] + l[i - 2]) / 2, sl = extD + margen * atr[i];
            if (e > c[i] && e < sl) out.push({ m: i, d: -1, e, sl, x: Math.min(i + V, kzfin[i]) });
            armD = false;
          }
        }
      }
    }
    return out;
  }

  // Sesgo de la temporalidad mayor (última vela mayor cerrada) alineado con las velas de ejecución.
  function sesgoMayor(ctx, tfMayor, tipo) {
    if (tipo === 'ninguno') return null;
    const hv = ctx.velas(tfMayor), q = ctx.mapearMayor(tfMayor);
    let s;
    if (tipo === 'ema50_200') { const a = ta.ema(hv.c, 50), b = ta.ema(hv.c, 200); s = Float64Array.from(a, (x, k) => signo(x - b[k])); }
    else if (tipo === 'precio_ema200') { const b = ta.ema(hv.c, 200); s = Float64Array.from(hv.c, (x, k) => signo(x - b[k])); }
    else if (tipo === 'vela') s = Float64Array.from(hv.c, (x, k) => signo(x - hv.o[k]));
    else if (tipo === 'ema50') { const b = ta.ema(hv.c, 50); s = Float64Array.from(hv.c, (x, k) => signo(x - b[k])); }
    else { const p = pivotesUlt(hv.h, hv.l, 3); s = Float64Array.from(estadoEstructura(hv.c, p.ph, p.pl)); }
    return Int8Array.from(q, (k) => (k >= 0 ? s[k] : 0));
  }
  const desdeDe = (p) => (p._desde != null ? p._desde : -Infinity);
  const libre = (st) => st.position_size === 0 && st.pendientes === 0;

  // ---------------- 1) Oro D1 · Bollinger + SMA 200 ----------------
  const oroBB = {
    id: 'oro_bb_d1', tf: 1440, calentamientoDias: 420, opciones: { labTpEntrada: true }, // como lab/motor.py (E022)
    nombre: '★ Oro D1 · Ruptura de Bollinger a favor de la SMA 200 (RR 1:2)',
    desc: 'La única estrategia de toda la investigación con ventaja sostenida (E022). Compra cuando una vela diaria cierra por primera vez sobre la banda superior de Bollinger (20, 2) con el cierre sobre la SMA 200; vende al revés. Entrada a mercado en la apertura siguiente, SL a 0,5 × ATR(14) de la entrada y TP a 2 × SL. Una operación a la vez. Laboratorio, últimos 5 años: 58 operaciones, 55,2 % de acierto, +0,63 R por operación (PF 2,38). En 2011–2021: 43,6 % y +0,29 R. Solo funciona en oro.',
    params: [['largo', 'Bollinger: largo', 20], ['desv', 'Bollinger: desvíos', 2], ['sma', 'Filtro de tendencia: SMA', 200], ['k', 'SL = k × ATR(14)', 0.5], ['rr', 'TP = RR × SL', 2], ['dir', 'Dirección', 'ambas', [['ambas', 'Compras y ventas'], ['largos', 'Solo compras'], ['cortos', 'Solo ventas']]]],
    preparar(ctx, p) {
      const { high: h, low: l, close: c, time: t } = ctx, st = ctx.strategy, tick = ctx.syminfo.mintick;
      const b = ta.bb(c, p.largo, p.desv), tend = ta.sma(c, p.sma), atr = ta.atr(h, l, c, 14), desde = desdeDe(p);
      return (i) => {
        if (i < 1 || t[i] < desde || i >= c.length - 1 || !libre(st) || !(atr[i] === atr[i])) return;
        const arriba = c[i] > b.sup[i] && !(c[i - 1] > b.sup[i - 1]), abajo = c[i] < b.inf[i] && !(c[i - 1] < b.inf[i - 1]);
        let d = 0;
        if (arriba && c[i] > tend[i] && p.dir !== 'cortos') d = 1;
        else if (abajo && c[i] < tend[i] && p.dir !== 'largos') d = -1;
        if (!d) return;
        const r = p.k * atr[i];
        st.entry('E', d, { comment: d === 1 ? 'Ruptura BB arriba' : 'Ruptura BB abajo' });
        st.exit('X', 'E', { loss: r / tick, profit: (p.rr * r) / tick });
      };
    },
  };

  // ---------------- 1b) E022 con entrada a las 18:15 NY y salida a elección (E042, E044 y prueba a futuro F002) ----------------
  // Corre en velas de 5 minutos con los valores de la vela diaria ya cerrada: la señal es la de E022 y la orden se llena en la
  // apertura de las 18:15 NY (después de la reapertura, con el spread normal). Salida: TP fijo 2·SL, o a las 16:55 NY del
  // primer o del quinto día de operación (siempre con el SL de protección).
  const oroBB1815 = {
    id: 'oro_bb_1815', tf: 5, redTf: 1440, calentamientoDias: 420, opciones: { labTpEntrada: true },
    nombre: '★ Oro D1 · E022 con entrada 18:15 NY (salida TP, 1 día o 5 días)',
    desc: 'La misma señal de E022 (primer cierre diario fuera de Bollinger 20/2 a favor de la SMA 200), pero la entrada es a las 18:15 NY, cuando el spread ya se normalizó después de la reapertura (E042). SL a 0,5 × ATR(14) diario. Salida a elección: TP fijo 2 × SL, o a las 16:55 NY después de 1 o de 5 días de operación (E044). Laboratorio 2010–2026 con costos base (181 operaciones): TP fijo +0,32 R, 1 día +0,26 R (≈ 18 h por operación), 5 días +0,60 R. Últimos 5 años: +0,49 R, +0,41 R y +0,73 R. Las tres están en la prueba a futuro F002 desde el 27/11/2026.',
    params: [['largo', 'Bollinger: largo', 20], ['desv', 'Bollinger: desvíos', 2], ['sma', 'Filtro de tendencia: SMA', 200], ['k', 'SL = k × ATR(14) diario', 0.5], ['rr', 'TP = RR × SL (salida TP)', 2],
      ['salida', 'Salida', 'tp', [['tp', 'TP fijo (RR × SL)'], ['1', '16:55 NY del día siguiente (1 día)'], ['5', '16:55 NY del quinto día (5 días)']]],
      ['dir', 'Dirección', 'ambas', [['ambas', 'Compras y ventas'], ['largos', 'Solo compras'], ['cortos', 'Solo ventas']]]],
    preparar(ctx, p) {
      const { time: t } = ctx, st = ctx.strategy, tick = ctx.syminfo.mintick, desde = desdeDe(p);
      const d1 = ctx.velas(1440), q = ctx.mapearMayor(1440), c = d1.c;
      const b = ta.bb(c, p.largo, p.desv), tend = ta.sma(c, p.sma), atr = ta.atr(d1.h, d1.l, c, 14);
      const dias = p.salida === 'tp' ? 0 : Number(p.salida);
      let hecho = -1, diaSalida = -1;
      return (i) => {
        const j = q[i], m = TV.minutoNY(t[i]);
        // salida por tiempo: la vela de 5 min que empieza a las 16:50 NY (o la primera después) del día de salida
        if (dias && st.position_size !== 0 && diaSalida >= 0 && (j + 1 > diaSalida || (j + 1 === diaSalida && m >= 1010 && m < 1020))) {
          st.close('E', { comment: dias === 1 ? 'Salida 1 día' : 'Salida 5 días' });
          diaSalida = -1;
          return;
        }
        // entrada: la vela de 5 min de las 18:10 NY cierra a las 18:14 → la orden se llena en la apertura de las 18:15
        if (j < 1 || j === hecho || m < 1090 || m >= 1200 || i >= t.length - 1) return;
        if (t[i] < desde || !libre(st) || !(atr[j] === atr[j]) || !(tend[j] === tend[j])) return;
        hecho = j;
        const arriba = c[j] > b.sup[j] && !(c[j - 1] > b.sup[j - 1]), abajo = c[j] < b.inf[j] && !(c[j - 1] < b.inf[j - 1]);
        let d = 0;
        if (arriba && c[j] > tend[j] && p.dir !== 'cortos') d = 1;
        else if (abajo && c[j] < tend[j] && p.dir !== 'largos') d = -1;
        if (!d) return;
        const r = p.k * atr[j];
        st.entry('E', d, { comment: d === 1 ? 'Ruptura BB arriba · 18:15' : 'Ruptura BB abajo · 18:15' });
        if (dias) { st.exit('X', 'E', { loss: r / tick }); diaSalida = j + dias; }
        else st.exit('X', 'E', { loss: r / tick, profit: (p.rr * r) / tick });
      };
    },
  };

  // ---------------- 2 y 3) Setup SMC (barrido → cambio de estructura) ----------------
  function scriptSMC(def) {
    return {
      id: def.id, nombre: def.nombre, desc: def.desc, calentamientoDias: 120, tf: (p) => Number(p.tf),
      params: [
        ['tf', 'Temporalidad de ejecución', def.tf, [[5, '5 minutos'], [15, '15 minutos'], [1, '1 minuto']]],
        ['tfMayor', 'Temporalidad mayor', def.tfMayor, [[60, '1 hora'], [240, '4 horas'], [15, '15 minutos']]],
        ['L', 'Swing: velas a cada lado', def.L], ['fuente', 'Liquidez que se barre', def.fuente, [['swing', 'Swing de ejecución'], ['mayor', 'Swing de la temporalidad mayor'], ['dia', 'Máximo/mínimo del día anterior']]],
        ['W', 'Velas máximas entre barrido y cambio de estructura', def.W], ['recupera', 'El barrido debe cerrar de vuelta', def.recupera],
        ['sesgo', 'Dirección (temporalidad mayor)', def.sesgo, [['ninguno', 'Sin filtro'], ['ema50_200', 'EMA 50 sobre EMA 200'], ['precio_ema200', 'Precio sobre EMA 200'], ['estructura', 'Estructura']]],
        ['entrada', 'Entrada', def.entrada, [['mercado', 'A mercado al romper la estructura'], ['eq', 'Límite en el 50 %'], ['ote', 'Límite en OTE 61,8 %'], ['fvg', 'Límite en el FVG (borde)'], ['fvg50', 'Límite en el FVG (50 %)'], ['ob', 'Límite en el order block']]],
        ['V', 'Validez de la orden límite (velas)', def.V], ['sesion', 'Sesión', def.sesion, [['todas', 'Todas las horas'], ['killzones', 'Killzones Londres y NY']]],
        ['liquidez', 'Descartar si hay un swing mayor antes del TP', def.liquidez], ['rr', 'TP = RR × riesgo', 2],
      ],
      preparar(ctx, p) {
        const { open: o, high: h, low: l, close: c, time: t } = ctx, v = ctx.v, st = ctx.strategy, n = c.length;
        const tfM = Number(p.tfMayor), hv = ctx.velas(tfM), q = ctx.mapearMayor(tfM);
        const hp = pivotesUlt(hv.h, hv.l, 3), liqHi = mapa(q, hp.ph), liqLo = mapa(q, hp.pl);
        const d1 = ctx.velas(1440), qd = TV.mapearMayor(t, d1.t), pdh = mapa(qd, d1.h), pdl = mapa(qd, d1.l);
        const sesgo = sesgoMayor(ctx, tfM, p.sesgo);
        const kz = Uint8Array.from(t, (x) => (ventanaKz(x, TV.minutoNY) === 1 || (TV.minutoNY(x) >= 420 && TV.minutoNY(x) < 660) ? 1 : 0));
        const piv = pivotesUlt(h, l, Number(p.L));
        let refLo, refHi;
        if (p.fuente === 'swing') { refLo = N(n); refHi = N(n); for (let i = 1; i < n; i++) { refLo[i] = piv.pl[i - 1]; refHi[i] = piv.ph[i - 1]; } }
        else if (p.fuente === 'mayor') { refLo = liqLo; refHi = liqHi; } else { refLo = pdl; refHi = pdh; }
        const setups = detectarSMC(o, h, l, c, refLo, refHi, piv.ph, piv.pl, Number(p.W), !!p.recupera);
        const porVela = new Map();
        for (const s of setups) { if (!porVela.has(s.m)) porVela.set(s.m, []); porVela.get(s.m).push(s); }
        const atr = ta.atr(h, l, c, 14), desde = desdeDe(p), M1T = ctx.M1.T;
        const costoRT = (x) => 2 * ctx.costoUnidad(x);
        return (i) => {
          const lista = porVela.get(i);
          if (!lista || t[i] < desde || i >= n - 1) return;
          for (const s of lista) {
            if (!libre(st)) return;
            const d = s.d;
            if (sesgo && sesgo[i] !== d) continue;
            if (p.sesion === 'killzones' && !kz[i]) continue;
            const eq = s.opu + (s.ext - s.opu) * 0.5;
            let e;
            if (p.entrada === 'mercado') e = c[i];
            else if (p.entrada === 'eq') e = eq;
            else if (p.entrada === 'ote') e = s.opu + (s.ext - s.opu) * 0.618;
            else if (p.entrada === 'fvg') e = s.f1;
            else if (p.entrada === 'fvg50') e = (s.f1 + s.f2) / 2;
            else e = s.ob;
            const sl = s.ext - d * 0.1 * atr[i];
            const riesgo = (e - sl) * d, costo = costoRT(e === e ? e : c[i]);
            if (!(e === e) || !(atr[i] === atr[i]) || !(riesgo >= 3 * costo)) continue;
            if (p.entrada !== 'mercado' && !(d * (eq - e) >= 0 && d * (c[i] - e) > 0)) continue;
            const tp = e + d * p.rr * riesgo;
            if (p.liquidez) { const ob = d === 1 ? liqHi[i] : liqLo[i]; if (ob === ob && (d === 1 ? ob > e && ob < tp : ob < e && ob > tp)) continue; }
            if (p.entrada === 'mercado') {
              st.entry('E', d, { riesgoMin: 3 * costo, comment: 'SMC a mercado' });
              st.exit('X', 'E', { stop: sl, rr: p.rr });
            } else {
              const vence = v.fin[Math.min(i + Number(p.V), n - 1)];
              st.entry('E', d, { limit: e, venceMin: vence, anulaEn: tp, comment: 'SMC límite' });
              st.exit('X', 'E', { stop: sl, limit: tp });
            }
            void M1T;
          }
        };
      },
    };
  }
  const smcComun = scriptSMC({
    id: 'smc_comun', tf: 15, tfMayor: 240, L: 5, fuente: 'dia', W: 24, recupera: false, sesgo: 'ninguno', entrada: 'mercado', V: 12, sesion: 'killzones', liquidez: false,
    nombre: 'SMC · configuración común a los 6 activos (15M / 4H)',
    desc: 'Tu setup llevado a reglas (E023): barrido del máximo o mínimo del día anterior, cambio de estructura con un cierre más allá del último swing (pivote de 5) dentro de 24 velas, entrada a mercado al romper, SL detrás del barrido (+0,1 ATR) y TP 2R, solo en las killzones de Londres y NY. Es la única configuración positiva en los 6 activos: 511 operaciones, 38,6 % de acierto y +0,12 R por operación en los últimos 5 años (en oro: 84 operaciones, 40,5 %, +0,19 R). Ventaja chica.',
  });
  const smcOro = scriptSMC({
    id: 'smc_oro', tf: 15, tfMayor: 240, L: 5, fuente: 'swing', W: 12, recupera: true, sesgo: 'estructura', entrada: 'mercado', V: 12, sesion: 'todas', liquidez: true,
    nombre: 'SMC · mejor en oro (15M / 4H, estructura 4H)',
    desc: 'La mejor variante del setup SMC en oro (E024): barrido del último swing de 15M (pivote de 5) con cierre de vuelta, cambio de estructura en 12 velas a favor de la estructura de 4H, entrada a mercado, SL detrás del barrido y TP 2R, descartando si hay un swing de 4H antes del TP. Últimos 5 años: 302 operaciones, 43,4 % de acierto, +0,26 R (PF 1,43). Elegida mirando los 5 años: lo realista a futuro está cerca del empate.',
  });

  // ---------------- 4 y 5) Setups ICT del prompt ----------------
  function scriptICT(def) {
    return {
      id: def.id, nombre: def.nombre, desc: def.desc, calentamientoDias: 120, tf: () => 15,
      params: def.params,
      preparar(ctx, p) {
        const { open: o, high: h, low: l, close: c, time: t } = ctx, v = ctx.v, st = ctx.strategy, n = c.length;
        const kz = Int8Array.from(t, (x) => ventanaKz(x, TV.minutoNY));
        const fecha = Int32Array.from(t, (x) => TV.fechaNY(x));
        const kzfin = new Int32Array(n).fill(-1);
        for (let i = 0; i < n;) { if (!kz[i]) { i++; continue; } let j = i; while (j + 1 < n && kz[j + 1] === kz[i] && fecha[j + 1] === fecha[i]) j++; for (let k = i; k <= j; k++) kzfin[k] = j; i = j + 1; }
        const atr = ta.atr(h, l, c, 14), mascara = { londres: 1, ny: 2, ambas: 3 }[p.kz];
        let cand;
        if (def.setup === 5) {
          const s = sesgoMayor(ctx, 240, p.sesgo), pv = pivotesUlt(h, l, 3);
          cand = ictS5(o, h, l, c, atr, s, pv.ph, pv.pl, kz, kzfin, mascara, Number(p.N), Number(p.V), Number(p.minfvg), p.ce === 'ce' ? 1 : 0, 0.1);
        } else {
          const pv = pivotesUlt(h, l, Number(p.L));
          cand = ictS1(o, h, l, c, atr, pv.ph, pv.pl, kz, kzfin, mascara, Number(p.N), Number(p.V), Number(p.minfvg), { fvg_ob: 0, fvg: 1, ob: 2 }[p.zona], p.ce === 'ce' ? 1 : 0, 0.1);
        }
        const porVela = new Map();
        for (const s of cand) { if (!porVela.has(s.m)) porVela.set(s.m, []); porVela.get(s.m).push(s); }
        // límites diarios del prompt: 2 operaciones por día y corte tras 2 pérdidas seguidas (fecha de NY)
        let diaAct = -1, ops = 0, perd = 0;
        st.alLlenar(() => { ops++; });
        st.alCerrar((x) => { perd = x.r <= 0 ? perd + 1 : 0; });
        const desde = desdeDe(p), M1T = ctx.M1.T;
        return (i) => {
          const lista = porVela.get(i);
          if (!lista || t[i] < desde) return;
          for (const s of lista) {
            if (!libre(st)) return;
            const riesgo = (s.e - s.sl) * s.d, costo = 2 * ctx.costoUnidad(s.e), tp = s.e + s.d * 2 * riesgo;
            if (!(riesgo > 0) || riesgo < 3 * costo) continue;
            const crea = v.fin[i] + 1;
            if (crea >= M1T.length) return;
            const dia = TV.fechaNY(M1T[crea]);
            if (dia !== diaAct) { diaAct = dia; ops = 0; perd = 0; }
            if (ops >= 2 || perd >= 2) continue;
            st.entry('E', s.d, { limit: s.e, venceMin: v.fin[s.x], anulaEn: tp, comment: def.etiqueta });
            st.exit('X', 'E', { stop: s.sl, limit: tp });
          }
        };
      },
    };
  }
  const ictS5Oro = scriptICT({
    id: 'ict5_oro', setup: 5, etiqueta: 'ICT 5 · NY',
    nombre: 'ICT setup 5 · sesgo 4H + barrido interno + FVG en la killzone de NY (oro 15M)',
    desc: 'El mejor de los 5 setups del prompt de Google (E025). Con la estructura de 4H a favor y dentro de la killzone de NY (08:30–11:00): barrido del último swing interno (pivote de 3) y, en 10 velas, un FVG a favor de al menos 0,25 ATR; orden límite al 50 % del FVG, SL detrás del barrido (+0,1 ATR) y TP 2R; máximo 2 operaciones por día y corte tras 2 pérdidas. Últimos 5 años: 82 operaciones, 45,1 % de acierto, +0,30 R (PF 1,52). Elección 47,9 %, confirmación 41,2 %.',
    params: [['sesgo', 'Sesgo de 4H', 'estructura', [['estructura', 'Estructura'], ['vela', 'Vela anterior'], ['ema50', 'Precio sobre EMA 50']]], ['kz', 'Killzone', 'ny', [['ny', 'Nueva York 08:30–11:00'], ['londres', 'Londres 02:00–05:00'], ['ambas', 'Las dos']]], ['N', 'Velas máximas entre barrido y FVG', 10], ['V', 'Validez de la orden (velas)', 10], ['minfvg', 'Tamaño mínimo del FVG (× ATR)', 0.25], ['ce', 'Entrada', 'ce', [['ce', '50 % del FVG (CE)'], ['borde', 'Borde proximal']]]],
  });
  const ictS1Oro = scriptICT({
    id: 'ict1_oro', setup: 1, etiqueta: 'ICT 1 · Londres',
    nombre: 'ICT setup 1 · barrido → MSS → order block en la killzone de Londres (oro 15M)',
    desc: 'La segunda mejor variante de los setups del prompt (E025). Una vela perfora el último swing (pivote de 3) y cierra de vuelta; dentro de 20 velas hay un cierre más allá del swing opuesto (MSS) en la killzone de Londres (02:00–05:00); orden límite en el borde del order block del tramo, SL detrás del barrido (+0,1 ATR) y TP 2R; 2 operaciones por día como máximo. Últimos 5 años: 144 operaciones, 45,1 % de acierto, +0,28 R (PF 1,48). Elección 47,1 %, confirmación 40,5 %.',
    params: [['L', 'Swing: velas a cada lado', 3], ['N', 'Velas máximas entre barrido y MSS', 20], ['V', 'Validez de la orden (velas)', 10], ['zona', 'Zona de entrada', 'ob', [['ob', 'Order block'], ['fvg_ob', 'FVG y si no OB'], ['fvg', 'Solo FVG']]], ['minfvg', 'Tamaño mínimo del FVG (× ATR)', 0], ['ce', 'Entrada', 'borde', [['borde', 'Borde proximal'], ['ce', '50 % de la zona']]], ['kz', 'Killzone', 'londres', [['londres', 'Londres 02:00–05:00'], ['ny', 'Nueva York 08:30–11:00'], ['ambas', 'Las dos']]]],
  });

  const LISTA = [oroBB, oroBB1815, smcOro, smcComun, ictS5Oro, ictS1Oro];
  const API = { LISTA, porId: Object.fromEntries(LISTA.map((x) => [x.id, x])), pivotesUlt, estadoEstructura, detectarSMC };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.TVEST = API;
})(typeof window !== 'undefined' ? window : globalThis);
