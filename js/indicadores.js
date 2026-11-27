/* Indicadores: medias, Bollinger, RSI, MACD, estocástico, ATR (en paneles), niveles diarios, rango de Asia, FVG,
 * pivotes, Bias Toolkit V4 e ICT Silver Bullet [LuxAlgo]. Se calculan solo con las velas ya reveladas. */
(() => {
  'use strict';
  const R = window.REP;
  const M = R.M;
  const { $, LS, aviso, f2, css } = R;

  const PLANT_IND = `// Indicador en el formato del reproductor (se escribe como Pine Script). Se calcula solo con las velas ya reveladas.
// ctx.open, ctx.high, ctx.low, ctx.close, ctx.time: series de la temporalidad del gráfico. ctx.ta: funciones ta.* de TradingView.
function indicador(ctx, p) {
  const { close, ta } = ctx;
  ctx.plot(ta.ema(close, 9), 'EMA 9', '#FF6A2B');
  ctx.plot(ta.ema(close, 21), 'EMA 21', '#8AB4FF');
}`;
  const P = (k, n, def, extra = {}) => Object.assign({ k, n, def, tipo: typeof def === 'boolean' ? 'bool' : typeof def === 'string' && def.startsWith('#') ? 'color' : 'num' }, extra);
  const TIPOS = {
    ema: { nombre: 'Media móvil exponencial (EMA)', grupo: 'Tendencia', panel: false, params: [P('largo', 'Largo', 20, { min: 1, max: 1000 }), P('color', 'Color', '#FF6A2B')], corto: (p) => `EMA ${p.largo}` },
    sma: { nombre: 'Media móvil simple (SMA)', grupo: 'Tendencia', panel: false, params: [P('largo', 'Largo', 50, { min: 1, max: 1000 }), P('color', 'Color', '#8AB4FF')], corto: (p) => `SMA ${p.largo}` },
    bb: { nombre: 'Bandas de Bollinger', grupo: 'Tendencia', panel: false, params: [P('largo', 'Largo', 20, { min: 2, max: 500 }), P('desv', 'Desviaciones', 2, { min: 0.5, max: 5, paso: 0.1 }), P('color', 'Color', '#8AB4FF')], corto: (p) => `BB ${p.largo} ${p.desv}` },
    rsi: { nombre: 'Índice de fuerza relativa (RSI)', grupo: 'Osciladores', panel: true, params: [P('largo', 'Largo', 14, { min: 2, max: 200 }), P('sup', 'Nivel superior', 70, { min: 50, max: 100 }), P('inf', 'Nivel inferior', 30, { min: 0, max: 50 }), P('color', 'Color', '#7e57c2')], corto: (p) => `RSI ${p.largo}` },
    macd: { nombre: 'MACD', grupo: 'Osciladores', panel: true, params: [P('rapida', 'Rápida', 12, { min: 1, max: 200 }), P('lenta', 'Lenta', 26, { min: 2, max: 400 }), P('senal', 'Señal', 9, { min: 1, max: 100 })], corto: (p) => `MACD ${p.rapida} ${p.lenta} ${p.senal}` },
    esto: { nombre: 'Estocástico', grupo: 'Osciladores', panel: true, params: [P('k', '%K', 14, { min: 1, max: 200 }), P('suav', 'Suavizado %K', 3, { min: 1, max: 50 }), P('d', '%D', 3, { min: 1, max: 50 })], corto: (p) => `Estocástico ${p.k} ${p.suav} ${p.d}` },
    atr: { nombre: 'Rango verdadero promedio (ATR)', grupo: 'Osciladores', panel: true, params: [P('largo', 'Largo', 14, { min: 1, max: 200 }), P('color', 'Color', '#FF5C5C')], corto: (p) => `ATR ${p.largo}` },
    niveles: { nombre: 'Niveles diarios y semanales (PDH, PDL, apertura)', grupo: 'ICT y estructura', panel: false, params: [P('dias', 'Días a mostrar', 5, { min: 1, max: 30 }), P('apertura', 'Apertura del día', true), P('cierre', 'Cierre del día anterior', false), P('semana', 'Máximo y mínimo de la semana anterior', true), P('medianoche', 'Apertura de medianoche (NY)', false)], corto: () => 'Niveles diarios' },
    asia: { nombre: 'Rango de Asia (20:00–00:00 de Nueva York)', grupo: 'ICT y estructura', panel: false, params: [P('dias', 'Días a mostrar', 5, { min: 1, max: 30 }), P('extender', 'Extender hasta las 12:00', true), P('color', 'Color', '#9c27b0')], corto: () => 'Rango de Asia' },
    fvg: { nombre: 'Fair Value Gaps (FVG)', grupo: 'ICT y estructura', panel: false, params: [P('min', 'Tamaño mínimo (USD)', 0.5, { min: 0, max: 50, paso: 0.1 }), P('max', 'Máximo en pantalla', 30, { min: 1, max: 200 }), P('mitigados', 'Mostrar los mitigados', false), P('mitigacion', 'Mitigado cuando', 'completo', { tipo: 'sel', opciones: [['completo', 'se llena completo'], ['mitad', 'llega a la mitad'], ['toque', 'lo toca']] })], corto: (p) => `FVG ≥ ${p.min}` },
    swings: { nombre: 'Máximos y mínimos (pivotes HH, HL, LH, LL)', grupo: 'ICT y estructura', panel: false, params: [P('izq', 'Velas a la izquierda', 5, { min: 1, max: 50 }), P('der', 'Velas a la derecha', 5, { min: 1, max: 50 }), P('max', 'Máximo en pantalla', 40, { min: 4, max: 300 })], corto: (p) => `Pivotes ${p.izq}/${p.der}` },
    bias: { nombre: 'Bias Toolkit V4 (estructura, LQ, premium/discount y plan)', grupo: 'ICT y estructura', panel: false, params: [P('swingLen', 'Largo swing', 50, { min: 5, max: 200 }), P('internalLen', 'Largo interno', 5, { min: 2, max: 50 }), P('estructura', 'BOS / CHoCH', true), P('internas', 'Rupturas internas', true), P('lq', 'Niveles LQ', true), P('zonas', 'Premium / discount', true), P('plan', 'Plan de entrada', true), P('htf', 'Filtro de temporalidad mayor (min)', 15, { tipo: 'sel', opciones: [[0, 'Sin filtro'], [15, '15 minutos'], [60, '1 hora'], [240, '4 horas']] }), P('fZona', 'Exigir toque de la zona 0.618', true), P('fAlinear', 'Exigir swing a favor', true)], corto: (p) => `Bias V4 ${p.swingLen}/${p.internalLen}` },
    smc: { nombre: 'Smart Money Concepts (SMC) [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('swingLen', 'Largo de swing', 50, { min: 10, max: 200 }), P('interna', 'Estructura interna (BOS/CHoCH)', true), P('swing', 'Estructura de swing (BOS/CHoCH)', true), P('obInt', 'Order blocks internos', 5, { min: 0, max: 20 }), P('obSw', 'Order blocks de swing', 5, { min: 0, max: 20 }), P('fvg', 'Fair value gaps', true), P('eq', 'Máximos y mínimos iguales (EQH/EQL)', true), P('puntos', 'Puntos HH / HL / LH / LL', true), P('zonas', 'Premium / equilibrio / discount', true), P('extremos', 'Máximo y mínimo fuerte / débil', true), P('mitigacion', 'Mitigación de OB', 'hl', { tipo: 'sel', opciones: [['hl', 'Máximo / mínimo'], ['cierre', 'Cierre']] }), P('confluencia', 'Filtro de confluencia (interna)', false)], corto: (p) => `SMC ${p.swingLen}` },
    obbb: { nombre: 'Order Blocks & Breaker Blocks [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('largo', 'Largo de giro', 10, { min: 3, max: 100 }), P('cuantos', 'Últimos de cada lado', 3, { min: 1, max: 20 }), P('cuerpo', 'Usar el cuerpo de la vela', false)], corto: (p) => `OB & Breaker ${p.largo}` },
    msf: { nombre: 'Market Structure CHoCH/BOS (Fractal) [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('largo', 'Largo del fractal', 5, { min: 3, max: 21 }), P('sr', 'Soportes y resistencias', true), P('max', 'Estructuras en pantalla', 30, { min: 1, max: 200 })], corto: (p) => `Estructura fractal ${p.largo}` },
    fvglux: { nombre: 'Fair Value Gap [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('auto', 'Umbral automático', true), P('umbralPct', 'Umbral fijo %', 0, { min: 0, max: 5, paso: 0.01 }), P('max', 'Máximo sin mitigar', 10, { min: 1, max: 100 }), P('mitigados', 'Mostrar el nivel de los mitigados', false)], corto: () => 'FVG LuxAlgo' },
    ifvg: { nombre: 'Inversion Fair Value Gaps (IFVG) [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('atrMult', 'Ancho mínimo (× ATR 200)', 0.25, { min: 0, max: 5, paso: 0.05 }), P('max', 'Zonas en pantalla', 5, { min: 1, max: 50 }), P('senales', 'Mostrar señales', true), P('senal', 'Señal por', 'mecha', { tipo: 'sel', opciones: [['mecha', 'Mecha'], ['cierre', 'Cierre']] })], corto: () => 'IFVG' },
    lsw: { nombre: 'Liquidity Sweeps [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('largo', 'Largo de giro', 5, { min: 2, max: 50 }), P('modo', 'Detectar', 'mechas', { tipo: 'sel', opciones: [['mechas', 'Solo mechas'], ['retesteo', 'Solo ruptura y retesteo'], ['ambas', 'Mechas + ruptura y retesteo']] }), P('max', 'Barridas en pantalla', 20, { min: 1, max: 200 })], corto: (p) => `Liquidity Sweeps ${p.largo}` },
    ppa: { nombre: 'Pure Price Action Structures [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('corto', 'Corto plazo', false), P('mediano', 'Mediano plazo', true), P('largo', 'Largo plazo', true), P('max', 'Estructuras en pantalla', 30, { min: 1, max: 200 })], corto: () => 'Pure Price Action' },
    setupA: { nombre: 'Setup A+ (Sweep → CDE → OTE → FVG → LQ)', grupo: 'Trading Institucional', panel: false, params: [P('ltf', 'Temporalidad del CDE', 5, { tipo: 'sel', opciones: [[5, 'M5'], [1, 'M1']] }), P('htf', 'Temporalidad del sweep', 60, { tipo: 'sel', opciones: [[15, '15m'], [60, '1H'], [240, '4H']] }), P('sesion', 'Sesión', 'ambas', { tipo: 'sel', opciones: [['ambas', 'Londres o Nueva York'], ['lnd', 'Londres 02–05'], ['ny', 'Nueva York 07–10'], ['todo', 'Todo el día']] }), P('direccion', 'Dirección por fractales', '240', { tipo: 'sel', opciones: [['ninguna', 'Sin filtro'], ['60', '1H'], ['240', '4H'], ['1440', 'Diario']] }), P('max', 'Setups en pantalla', 6, { min: 1, max: 30 })], corto: (p) => `Setup A+ M${p.ltf}` },
    propio: { nombre: 'Indicador de TradingView (código propio o traducido de Pine)', grupo: 'TradingView', panel: false, params: [P('nombre', 'Nombre', 'Mi indicador', { tipo: 'texto' }), P('panel', 'Dibujar en un panel aparte (overlay = false)', false), P('codigo', 'Código (botón Pine en Estrategias para traducir)', PLANT_IND, { tipo: 'codigo' })], corto: (p) => p.nombre || 'Mi indicador' },
    luxsb: { nombre: 'ICT Silver Bullet [LuxAlgo]', grupo: 'LuxAlgo (SMC e ICT)', panel: false, params: [P('objetivos', 'Objetivos de liquidez', true), P('retesteos', 'Marcar retesteos', true), P('anulados', 'Mostrar FVG anulados', false)], corto: () => 'Silver Bullet LuxAlgo' },
  };

  let inst = [];
  const series = new Map(); // id → {lineas: [series], panel, prevLen}
  let items = { cajas: [], lineas: [], etiquetas: [] }; // dibujo de los indicadores de estructura
  let resumenes = new Map(); // id → texto para la leyenda
  let ru = null;
  const nuevoId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const defaults = (tipo) => Object.fromEntries(TIPOS[tipo].params.map((q) => [q.k, q.def]));
  const conAlfa = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const VERDE = '#3FCF8E', ROJO = '#FF5C5C';
  const enPanel = (x) => (x.tipo === 'propio' ? !!x.p.panel : TIPOS[x.tipo].panel);

  // ---------- series de líneas y paneles ----------
  function quitarSeries(id) {
    const s = series.get(id);
    if (!s) return;
    if (s.panel) R.quitarPanel(id);
    else for (const l of s.lineas) { try { R.chart.removeSeries(l); } catch { /* ya no existe */ } }
    series.delete(id);
  }
  function crearSeries(x) {
    quitarSeries(x.id);
    const t = TIPOS[x.tipo], p = x.p;
    const base = { lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: false, lineWidth: 1, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } };
    if (!enPanel(x)) {
      if (x.tipo === 'ema' || x.tipo === 'sma') series.set(x.id, { lineas: [R.chart.addLineSeries({ ...base, color: p.color, lineWidth: 2 })], prevLen: 0 });
      else if (x.tipo === 'bb') series.set(x.id, { lineas: [R.chart.addLineSeries({ ...base, color: p.color }), R.chart.addLineSeries({ ...base, color: conAlfa(p.color, 0.6), lineStyle: 2, lastValueVisible: false }), R.chart.addLineSeries({ ...base, color: p.color })], prevLen: 0 });
      else series.set(x.id, { lineas: [], prevLen: 0 });
      return;
    }
    const panel = R.nuevoPanel(x.id, t.corto(p));
    const c = panel.chart;
    let lineas = [];
    if (x.tipo === 'rsi') {
      const l = c.addLineSeries({ ...base, color: p.color, lineWidth: 2, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      for (const [v, e] of [[p.sup, 2], [50, 3], [p.inf, 2]]) l.createPriceLine({ price: v, color: css('--texto-2'), lineWidth: 1, lineStyle: e, axisLabelVisible: false });
      lineas = [l];
    } else if (x.tipo === 'macd') {
      lineas = [c.addHistogramSeries({ ...base, lastValueVisible: false }), c.addLineSeries({ ...base, color: '#8AB4FF', lineWidth: 2 }), c.addLineSeries({ ...base, color: '#ff9800', lineWidth: 2 })];
    } else if (x.tipo === 'esto') {
      const k = c.addLineSeries({ ...base, color: '#8AB4FF', lineWidth: 2, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      for (const [v, e] of [[80, 2], [50, 3], [20, 2]]) k.createPriceLine({ price: v, color: css('--texto-2'), lineWidth: 1, lineStyle: e, axisLabelVisible: false });
      lineas = [k, c.addLineSeries({ ...base, color: '#ff9800', lineWidth: 1 })];
    } else if (x.tipo === 'atr') lineas = [c.addLineSeries({ ...base, color: p.color, lineWidth: 2 })];
    panel.ref = lineas[lineas.length > 1 && x.tipo === 'macd' ? 1 : 0];
    series.set(x.id, { lineas, panel, prevLen: 0 });
  }

  // ---------- cálculo ----------
  function arrays() {
    const v = R.velas, n = v.length;
    const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n), t = new Float64Array(n);
    for (let k = 0; k < n; k++) { o[k] = v[k].open; h[k] = v[k].high; l[k] = v[k].low; c[k] = v[k].close; t[k] = v[k]._b; }
    return { o, h, l, c, t, length: n };
  }
  const arr = (x) => Array.from(x);
  function valoresLinea(x, A) {
    const p = x.p;
    // Mismas fórmulas que TradingView (js/tv.js).
    const T = window.TV.ta;
    if (x.tipo === 'ema') return [T.ema(A.c, p.largo)];
    if (x.tipo === 'sma') return [T.sma(A.c, p.largo)];
    if (x.tipo === 'bb') { const b = T.bb(A.c, p.largo, p.desv); return [b.sup, b.medio, b.inf]; }
    if (x.tipo === 'rsi') return [T.rsi(A.c, p.largo)];
    if (x.tipo === 'macd') { const m = T.macd(A.c, p.rapida, p.lenta, p.senal); return [m.hist, m.macd, m.senal]; }
    if (x.tipo === 'atr') return [T.atr(A.h, A.l, A.c, p.largo)];
    if (x.tipo === 'esto') { const k = T.sma(T.stoch(A.c, A.h, A.l, p.k), p.suav); return [k, T.sma(k, p.d)]; }
    void arr; void smaNaN;
    return [];
  }
  function smaNaN(x, n) { const out = new Array(x.length).fill(NaN); for (let i = 0; i < x.length; i++) { let s = 0, ok = true; for (let j = i - n + 1; j <= i; j++) { if (j < 0 || isNaN(x[j])) { ok = false; break; } s += x[j]; } if (ok) out[i] = s / n; } return out; }
  function punto(x, k, sIdx, val) {
    const time = R.velas[k].time;
    if (val == null || !isFinite(val)) return { time };
    if (x.tipo === 'macd' && sIdx === 0) return { time, value: val, color: val >= 0 ? conAlfa(VERDE, 0.6) : conAlfa(ROJO, 0.6) };
    return { time, value: val };
  }
  const ultimos = new Map(); // id → arrays de valores (para la leyenda)
  // ---------- indicador propio (traducido de Pine) ----------
  const PALETA = ['#FF6A2B', '#8AB4FF', '#3FCF8E', '#FFD166', '#C77DFF', '#FF5C5C'];
  const compilados = new Map(), coloresProp = new Map();
  function correrPropio(x, A) {
    let f = compilados.get(x.p.codigo);
    if (!f) { f = window.TV.compilarIndicador(x.p.codigo); compilados.set(x.p.codigo, f); }
    const TV = window.TV, D = R.D, h = R.cur + 1, plots = [];
    const M1 = { T: D.T.subarray(0, h), O: D.O.subarray(0, h), H: D.H.subarray(0, h), L: D.L.subarray(0, h), C: D.C.subarray(0, h) };
    const menor = { t: A.t, finT: Float64Array.from(A.t, (t, k) => (k + 1 < A.length ? A.t[k + 1] : t + R.tf * 60000)), length: A.length };
    const cache = new Map();
    const ctx = {
      time: A.t, open: A.o, high: A.h, low: A.l, close: A.c, bar_count: A.length, ta: TV.ta, nz: TV.nz, na: TV.esNa, p: x.p,
      syminfo: { mintick: 0.01 },
      plot: (serie, titulo, color, op = {}) => plots.push({ serie, titulo: titulo || 'Línea ' + (plots.length + 1), color: color || PALETA[plots.length % PALETA.length], ancho: op.ancho || 2, estilo: op.estilo || 0 }),
      velas: (tf) => { if (!cache.has(tf)) cache.set(tf, TV.velas(M1, tf)); return cache.get(tf); },
      security: (tf, fn, modo = 'cerrada') => { const may = ctx.velas(tf); return TV.security(menor, may, fn(Object.assign({ ta: TV.ta }, may)), modo); },
      sesion: (s) => Uint8Array.from(A.t, (t) => (TV.enSesion(t, s) ? 1 : 0)),
      minutoNY: (i) => TV.minutoNY(A.t[i]),
    };
    f(ctx, x.p);
    return plots;
  }
  function actualizarPropio(x, A) {
    const s = series.get(x.id);
    if (!s) return;
    let plots;
    try { plots = correrPropio(x, A); } catch (e) { if (s.error !== e.message) aviso('Indicador "' + (x.p.nombre || 'propio') + '": ' + e.message, 6000); s.error = e.message; return; }
    s.error = null;
    const destino = s.panel ? s.panel.chart : R.chart;
    if (s.lineas.length !== plots.length) {
      for (const l of s.lineas) { try { destino.removeSeries(l); } catch { /* ya no existe */ } }
      s.lineas = plots.map((q) => destino.addLineSeries({ lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: false, lineWidth: q.ancho, lineStyle: q.estilo, color: q.color, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }));
      if (s.panel) s.panel.ref = s.lineas[0];
    }
    const vals = plots.map((q) => q.serie);
    ultimos.set(x.id, vals);
    coloresProp.set(x.id, plots.map((q) => q.color));
    s.lineas.forEach((l) => l.applyOptions({ visible: !x.oculto }));
    s.lineas.forEach((l, j) => l.setData(R.velas.map((_, k) => punto(x, k, j, vals[j][k]))));
    s.prevLen = A.length;
  }
  function actualizarLineas(x, A, completo, nuevas) {
    if (x.tipo === 'propio') { actualizarPropio(x, A); return; }
    const s = series.get(x.id);
    if (!s || !s.lineas.length) return;
    const vals = valoresLinea(x, A);
    ultimos.set(x.id, vals);
    const n = A.length;
    const oculto = !!x.oculto;
    s.lineas.forEach((l, j) => l.applyOptions({ visible: !oculto }));
    if (completo || s.prevLen === 0 || n < s.prevLen || n - s.prevLen > 3) {
      s.lineas.forEach((l, j) => l.setData(R.velas.map((_, k) => punto(x, k, j, vals[j][k]))));
    } else {
      for (let k = Math.max(0, s.prevLen - 1); k < n; k++) s.lineas.forEach((l, j) => l.update(punto(x, k, j, vals[j][k])));
    }
    s.prevLen = n;
  }

  // Indicadores de estructura → cajas, líneas y etiquetas en tiempo/precio.
  const VENTANA = 4000;
  function calcularEstructura(A) {
    const out = { cajas: [], lineas: [], etiquetas: [] };
    resumenes = new Map();
    const n = A.length;
    if (!n) return out;
    const b0 = Math.max(0, n - VENTANA);
    const S = { t: A.t.subarray(b0), o: A.o.subarray(b0), h: A.h.subarray(b0), l: A.l.subarray(b0), c: A.c.subarray(b0), length: n - b0 };
    const tf = R.tf, tfm = R.tfMs();
    const fin = (k) => S.t[k] + tfm;
    for (const x of inst) {
      if (x.oculto) continue;
      const p = x.p;
      try {
        if (x.tipo === 'niveles' && tf < 1440) nivelesDiarios(S, p, out, x);
        else if (x.tipo === 'asia' && tf <= 60) rangoAsia(S, p, out, x);
        else if (x.tipo === 'fvg') fvgs(S, p, out, fin);
        else if (x.tipo === 'swings') pivotesHL(S, p, out);
        else if (x.tipo === 'bias') bias(S, p, out, x, fin);
        else if (x.tipo === 'luxsb') { if (tf <= 15) lux(S, p, out, x, fin); else resumenes.set(x.id, 'solo en 1m a 15m'); }
        else if (x.tipo === 'setupA') setupAplus(p, out, x);
        else if (LX[x.tipo]) LX[x.tipo](S, p, out, x, fin);
      } catch (e) { console.error(x.tipo, e); }
    }
    return out;
  }
  function nivelesDiarios(S, p, out) {
    const dias = [];
    for (let k = 0; k < S.length; k++) {
      const d = M.diaNY(S.t[k]);
      let u = dias[dias.length - 1];
      if (!u || u.d !== d) { u = { d, t0: S.t[k], t1: S.t[k], o: S.o[k], h: S.h[k], l: S.l[k], c: S.c[k], med: null }; dias.push(u); }
      u.t1 = S.t[k]; u.h = Math.max(u.h, S.h[k]); u.l = Math.min(u.l, S.l[k]); u.c = S.c[k];
      if (u.med == null && M.minNY(S.t[k]) === 0) u.med = S.o[k];
    }
    const tfm = R.tfMs();
    const desde = Math.max(1, dias.length - p.dias);
    for (let j = desde; j < dias.length; j++) {
      const a = dias[j - 1], u = dias[j], ult = j === dias.length - 1;
      const t2 = ult ? null : u.t1 + tfm;
      out.lineas.push({ t1: u.t0, t2, p: a.h, color: VERDE, estilo: 0, texto: 'PDH' }, { t1: u.t0, t2, p: a.l, color: ROJO, estilo: 0, texto: 'PDL' });
      if (p.apertura) out.lineas.push({ t1: u.t0, t2, p: u.o, color: css('--texto-2'), estilo: 2, texto: 'Apertura' });
      if (p.cierre) out.lineas.push({ t1: u.t0, t2, p: a.c, color: css('--texto-2'), estilo: 1, texto: 'Cierre ant.' });
      if (p.medianoche && u.med != null) out.lineas.push({ t1: u.t0, t2, p: u.med, color: '#00bcd4', estilo: 2, texto: 'Medianoche' });
    }
    if (p.semana) {
      const sem = [];
      for (const u of dias) { const w = Math.floor((u.d + 4) / 7); let s = sem[sem.length - 1]; if (!s || s.w !== w) { s = { w, t0: u.t0, h: u.h, l: u.l }; sem.push(s); } s.h = Math.max(s.h, u.h); s.l = Math.min(s.l, u.l); }
      if (sem.length >= 2) { const a = sem[sem.length - 2], u = sem[sem.length - 1]; out.lineas.push({ t1: u.t0, t2: null, p: a.h, color: '#8AB4FF', estilo: 1, texto: 'PWH' }, { t1: u.t0, t2: null, p: a.l, color: '#ff9800', estilo: 1, texto: 'PWL' }); }
    }
  }
  function rangoAsia(S, p, out) {
    const ses = [];
    for (let k = 0; k < S.length; k++) {
      const m = M.minNY(S.t[k]);
      if (m < 1200) continue;
      const d = M.diaNY(S.t[k]);
      let u = ses[ses.length - 1];
      if (!u || u.d !== d) { u = { d, t0: S.t[k], t1: S.t[k], h: S.h[k], l: S.l[k] }; ses.push(u); }
      u.t1 = S.t[k]; u.h = Math.max(u.h, S.h[k]); u.l = Math.min(u.l, S.l[k]);
    }
    const tfm = R.tfMs(), ahora = S.t[S.length - 1] + tfm;
    for (const u of ses.slice(-p.dias)) {
      const fin = u.t1 + tfm;
      out.cajas.push({ t1: u.t0, t2: Math.min(fin, ahora), p1: u.l, p2: u.h, fondo: conAlfa(p.color, 0.1), borde: conAlfa(p.color, 0.6), texto: 'Asia' });
      if (p.extender && ahora > fin) {
        const hasta = Math.min(ahora, u.t0 + 16 * 3600000);
        out.lineas.push({ t1: fin, t2: hasta >= ahora ? null : hasta, p: u.h, color: p.color, estilo: 2, texto: 'Asia H' }, { t1: fin, t2: hasta >= ahora ? null : hasta, p: u.l, color: p.color, estilo: 2, texto: 'Asia L' });
      }
    }
  }
  function fvgs(S, p, out, fin) {
    const vivos = [], hechos = [];
    for (let i = 2; i < S.length; i++) {
      for (let j = vivos.length - 1; j >= 0; j--) {
        const f = vivos[j];
        const mid = (f.top + f.bot) / 2;
        const lim = p.mitigacion === 'toque' ? (f.dir === 1 ? f.top : f.bot) : p.mitigacion === 'mitad' ? mid : f.dir === 1 ? f.bot : f.top;
        if (f.dir === 1 ? S.l[i] <= lim : S.h[i] >= lim) { f.fin = i; vivos.splice(j, 1); hechos.push(f); }
      }
      if (S.l[i] > S.h[i - 2] && S.l[i] - S.h[i - 2] >= p.min) vivos.push({ dir: 1, top: S.l[i], bot: S.h[i - 2], i0: i - 1, fin: -1 });
      if (S.h[i] < S.l[i - 2] && S.l[i - 2] - S.h[i] >= p.min) vivos.push({ dir: -1, top: S.l[i - 2], bot: S.h[i], i0: i - 1, fin: -1 });
    }
    const lista = vivos.slice(-p.max);
    if (p.mitigados) lista.push(...hechos.slice(-p.max));
    for (const f of lista) {
      const c = f.dir === 1 ? VERDE : ROJO;
      const mit = f.fin >= 0;
      out.cajas.push({ t1: S.t[f.i0], t2: mit ? fin(f.fin) : null, p1: f.bot, p2: f.top, fondo: conAlfa(c, mit ? 0.06 : 0.16), borde: conAlfa(c, mit ? 0.25 : 0.5), texto: mit ? '' : 'FVG' });
    }
  }
  function pivotesHL(S, p, out) {
    const { h, l, t } = S;
    const pts = [];
    for (let k = p.izq; k < S.length - p.der; k++) {
      let esH = true, esL = true;
      for (let j = k - p.izq; j <= k + p.der; j++) { if (j === k) continue; if (!(h[k] > h[j])) esH = false; if (!(l[k] < l[j])) esL = false; }
      if (esH) pts.push({ k, p: h[k], alto: true });
      if (esL) pts.push({ k, p: l[k], alto: false });
    }
    let uH = null, uL = null;
    const etq = [];
    for (const q of pts) {
      if (q.alto) { etq.push({ t: t[q.k], p: q.p, texto: uH == null ? 'H' : q.p > uH ? 'HH' : 'LH', color: VERDE, pos: 'arriba' }); uH = q.p; }
      else { etq.push({ t: t[q.k], p: q.p, texto: uL == null ? 'L' : q.p < uL ? 'LL' : 'HL', color: ROJO, pos: 'abajo' }); uL = q.p; }
    }
    out.etiquetas.push(...etq.slice(-p.max));
  }
  // Tendencia de la temporalidad mayor (cacheada por vela de esa temporalidad).
  let cacheHtf = { clave: '', bias: 0 };
  function biasHtf(htf) {
    if (!htf || R.tf > htf || R.cur < 0) return null;
    const D = R.D;
    const clave = htf + ':' + M.cubetaTf(D.T[R.cur], htf) + ':' + D.T.length + ':' + D.T[0];
    if (cacheHtf.clave === clave) return cacheHtf.bias;
    const desde = Math.max(0, R.cur - htf * 3000);
    const sub = { T: D.T.subarray(desde, R.cur + 1), O: D.O.subarray(desde, R.cur + 1), H: D.H.subarray(desde, R.cur + 1), L: D.L.subarray(desde, R.cur + 1), C: D.C.subarray(desde, R.cur + 1) };
    const VH = M.agrupar(sub, htf);
    const tH = M.tendenciasHtf(VH, M.CFG_BIAS.internalLen);
    const b = VH.length >= 2 ? tH[VH.length - 2] : 0; // última vela cerrada
    cacheHtf = { clave, bias: b };
    return b;
  }
  function bias(S, p, out, x, fin) {
    const cfg = { swingLen: p.swingLen, internalLen: p.internalLen, fZona: p.fZona, fAlinear: p.fAlinear, fHtf: !!p.htf };
    const r = M.biasV4(S, cfg, null);
    const htf = biasHtf(Number(p.htf));
    const est = r.est;
    const plan = M.planV4(est, S, S.length - 1, cfg, htf == null ? { disponible: false, bias: 0 } : { disponible: true, bias: htf });
    if (p.estructura) {
      const lista = r.rupturas.filter((q) => q.estructura === 'swing' || p.internas).slice(-30);
      for (const q of lista) {
        const c = q.sentido === 1 ? VERDE : ROJO;
        out.lineas.push({ t1: S.t[q.desde], t2: fin(q.hasta), p: q.precio, color: c, estilo: q.estructura === 'swing' ? 0 : 2, ancho: q.estructura === 'swing' ? 2 : 1, texto: q.tipo, centro: true });
      }
    }
    if (p.lq) {
      for (const q of est.lqs) {
        const neut = q.neut >= 0;
        out.lineas.push({ t1: S.t[q.desde], t2: neut ? fin(q.neut) : null, p: q.lvl, color: neut ? css('--texto-2') : '#ff9800', estilo: neut ? 2 : 0, texto: neut ? 'LQ ✓' : 'LQ' });
      }
    }
    if (p.zonas && est.hi != null && est.lo != null && est.hi > est.lo) {
      const k0 = Math.max(0, Math.min(est.swMax.vela == null ? 0 : est.swMax.vela, est.swMin.vela == null ? 0 : est.swMin.vela));
      const eq = (est.hi + est.lo) / 2;
      out.cajas.push({ t1: S.t[k0], t2: null, p1: eq, p2: est.hi, fondo: conAlfa(ROJO, 0.05), borde: null, texto: 'Premium' }, { t1: S.t[k0], t2: null, p1: est.lo, p2: eq, fondo: conAlfa(VERDE, 0.05), borde: null, texto: 'Discount' });
      out.lineas.push({ t1: S.t[k0], t2: null, p: eq, color: css('--texto-2'), estilo: 2, texto: 'EQ' });
      const r618 = est.dir === 1 ? est.hi - (est.hi - est.lo) * 0.618 : est.lo + (est.hi - est.lo) * 0.618;
      if (est.dir !== 0) out.lineas.push({ t1: S.t[k0], t2: null, p: r618, color: '#00bcd4', estilo: 2, texto: '0.618' });
    }
    const filtros = plan.okAlin && plan.okHtf && plan.okZona;
    if (p.plan && plan.plan) {
      const q = plan.plan, kk = Math.max(0, S.length - 12);
      const riesgo = Math.abs(q.entrada - q.sl), rr = Math.abs(q.tp - q.entrada) / riesgo;
      const op = filtros ? 1 : 0.45;
      out.cajas.push({ t1: S.t[kk], t2: null, p1: Math.min(q.entrada, q.tp), p2: Math.max(q.entrada, q.tp), fondo: `rgba(63,207,142,${0.14 * op})`, borde: null, texto: '' }, { t1: S.t[kk], t2: null, p1: Math.min(q.entrada, q.sl), p2: Math.max(q.entrada, q.sl), fondo: `rgba(255,92,92,${0.14 * op})`, borde: null, texto: '' });
      out.lineas.push({ t1: S.t[kk], t2: null, p: q.entrada, color: '#8AB4FF', estilo: 0, ancho: 2, texto: `${q.dir === 1 ? 'Compra' : 'Venta'} ${q.activada ? '(activada)' : 'limit'} · R:R ${rr.toFixed(2)}${filtros ? '' : ' · filtros sin cumplir'}` }, { t1: S.t[kk], t2: null, p: q.sl, color: ROJO, estilo: 0, texto: 'SL' }, { t1: S.t[kk], t2: null, p: q.tp, color: VERDE, estilo: 0, texto: 'TP' });
    }
    const tx = (b) => (b === 1 ? 'alcista' : b === -1 ? 'bajista' : 'neutral');
    resumenes.set(x.id, `Swing ${tx(est.swBias)} · interna ${tx(est.inBias)}${htf != null ? ' · ' + p.htf + 'm ' + tx(htf) : ''}${plan.plan ? ' · plan ' + (filtros ? 'listo' : 'en espera') : ''}`);
  }
  function lux(S, p, out, x, fin) {
    const r = M.luxSB(S);
    const ultimo = S.length - 1;
    for (const f of r.fvgs.slice(-40)) {
      if (f.anulado >= 0 && !p.anulados) continue;
      const c = f.dir === 1 ? VERDE : ROJO;
      const t2 = f.anulado >= 0 ? fin(f.anulado) : f.fin >= 0 ? fin(f.fin) : null;
      const a = f.anulado >= 0 ? 0.05 : f.activo || f.valido ? 0.28 : 0.14;
      out.cajas.push({ t1: S.t[f.i - 2], t2, p1: f.bot, p2: f.top, fondo: f.anulado >= 0 ? 'rgba(120,123,134,0.08)' : conAlfa(c, a), borde: f.anulado >= 0 ? null : conAlfa(c, 0.7), texto: f.valido ? 'SB ✓' : f.anulado >= 0 ? '' : 'SB FVG' });
    }
    if (p.retesteos) for (const e of r.retesteos.slice(-20)) out.etiquetas.push({ t: S.t[e.i], p: e.dir === 1 ? S.l[e.i] : S.h[e.i], texto: 'retesteo', color: e.dir === 1 ? VERDE : ROJO, pos: e.dir === 1 ? 'abajo' : 'arriba' });
    if (p.objetivos) for (const o of r.objetivos.slice(-12)) out.lineas.push({ t1: S.t[o.desde], t2: o.hasta >= 0 ? fin(o.hasta) : null, p: o.p, color: o.lado === 1 ? VERDE : ROJO, estilo: o.hasta >= 0 ? 2 : 0, texto: o.hasta >= 0 ? 'Objetivo ✓' : 'Objetivo' });
    const T = r.tend[ultimo];
    resumenes.set(x.id, `Tendencia MSS ${T === 1 ? 'alcista' : T === -1 ? 'bajista' : 'sin definir'}`);
  }

  // ---------- Setup A+ del Manual (js/setups.js) ----------
  // Se calcula una vez sobre los datos cargados y se muestra solo lo que ya ocurrió hasta la vela actual.
  let cacheA = { clave: '', r: null };
  function setupAplus(p, out, x) {
    if (!window.SETUPS || R.cur < 0) return;
    const D = R.D;
    const clave = [p.ltf, p.htf, p.sesion, p.direccion, D.T.length, D.T[0]].join('|');
    if (cacheA.clave !== clave) {
      const M1 = { T: D.T, O: D.O, H: D.H, L: D.L, C: D.C };
      cacheA = { clave, r: window.SETUPS.setupA(M1, { ltf: Number(p.ltf), htf: Number(p.htf), sesion: p.sesion, direccion: p.direccion, niveles: 'todas', zonas: 'fvg,bpr,ifvg,ob', tp: 'swing', rrMin: 1, buffer: 2 }) };
    }
    const ahora = D.T[R.cur] + 60000;
    const vistos = cacheA.r.setups.filter((s) => s.tCde <= ahora && s.tConf <= ahora).slice(-p.max);
    const VERDE_A = '#3FCF8E', ROJO_A = '#FF5C5C', NAR = '#FF6A2B';
    for (const s of vistos) {
      const c = s.dir === 1 ? VERDE_A : ROJO_A;
      out.lineas.push({ t1: s.tSweep - 2 * 3600000, t2: s.tConf, p: s.nivelBarrido, color: c, estilo: 2, texto: 'Sweep ' + s.tipos.join('/') });
      out.etiquetas.push({ t: s.tExt, p: s.ext, texto: 'Sweep', color: c, pos: s.dir === 1 ? 'abajo' : 'arriba' });
      if (isFinite(s.nivelCde)) out.lineas.push({ t1: s.tExt, t2: s.tCde, p: s.nivelCde, color: c, estilo: 0, texto: 'CDE', centro: true });
      const ords = s.ordenes.filter((o) => !o.cancelar && o.t <= ahora);
      const o = ords[ords.length - 1];
      if (!o) continue;
      const fin = s.tFin <= ahora ? s.tFin : null;
      out.cajas.push({ t1: s.tCde, t2: fin, p1: Math.min(o.zHi, o.zLo), p2: Math.max(o.zHi, o.zLo), fondo: 'rgba(255,106,43,0.13)', borde: 'rgba(255,106,43,0.6)', texto: 'OTE 0,618–0,7' });
      out.lineas.push({ t1: o.t, t2: fin, p: o.entrada, color: NAR, estilo: 0, ancho: 2, texto: `Entrada ${o.tipo} · R:R ${o.rr.toFixed(1)}` });
      out.lineas.push({ t1: o.t, t2: fin, p: o.sl, color: ROJO_A, estilo: 1, texto: 'SL' });
      out.lineas.push({ t1: o.t, t2: fin, p: o.tp, color: VERDE_A, estilo: 1, texto: 'TP (LQ)' });
    }
    const u = vistos[vistos.length - 1];
    resumenes.set(x.id, u ? `Último: ${u.dir === 1 ? 'alcista' : 'bajista'} · ${s_estado(u, ahora)}` : 'sin setups todavía');
  }
  function s_estado(s, ahora) { if (s.tFin > ahora) return 'en curso'; return { llenada: 'entrada tomada', invalidado: 'invalidado', vencido: 'vencido', 'objetivo sin entrada': 'se fue sin entrada' }[s.motivo] || s.motivo; }

  // ---------- indicadores de LuxAlgo (biblioteca js/luxalgo.js) ----------
  const GRIS = () => css('--texto-2');
  const LX = {
    smc(S, p, out, x, fin) {
      const r = window.LUX.smc(S, { swingLen: p.swingLen, mitigacion: p.mitigacion, confluencia: p.confluencia });
      const ult = S.length - 1;
      for (const e of r.estructuras.filter((q) => (q.interno ? p.interna : p.swing)).slice(-40)) {
        const c = e.dir === 1 ? VERDE : ROJO;
        out.lineas.push({ t1: S.t[e.desde], t2: fin(e.i), p: e.nivel, color: c, estilo: e.interno ? 1 : 0, ancho: e.interno ? 1 : 2, texto: e.tipo, centro: true });
      }
      const obs = (lista, k, interno) => lista.slice(0, k).forEach((ob) => {
        const c = ob.dir === 1 ? '#3179f5' : '#f77c80';
        out.cajas.push({ t1: S.t[ob.i0], t2: null, p1: Math.min(ob.bot, ob.top), p2: Math.max(ob.bot, ob.top), fondo: conAlfa(c, interno ? 0.16 : 0.24), borde: conAlfa(c, interno ? 0.6 : 0.9), texto: interno ? 'OB interno' : 'OB swing' });
      });
      obs(r.obVivos.int, p.obInt, true);
      obs(r.obVivos.sw, p.obSw, false);
      if (p.fvg) for (const f of r.fvgVivos.slice(0, 15)) out.cajas.push({ t1: S.t[Math.max(0, f.i - 1)], t2: Math.min(fin(Math.min(ult, f.i + 15)), fin(ult)), p1: f.bot, p2: f.top, fondo: conAlfa(f.dir === 1 ? '#00ff68' : '#ff0008', 0.12), borde: null, texto: 'FVG' });
      if (p.eq) for (const e of r.eqs.slice(-12)) {
        const c = e.dir === 1 ? ROJO : VERDE;
        out.lineas.push({ t1: S.t[e.i1], t2: S.t[e.i2] + R.tfMs(), p: e.nivel, color: c, estilo: 2, texto: e.tipo, centro: true });
      }
      if (p.puntos) for (const g of r.giros.slice(-20)) out.etiquetas.push({ t: S.t[g.i], p: g.p, texto: g.tipo, color: g.alto ? ROJO : VERDE, pos: g.alto ? 'arriba' : 'abajo' });
      const tr = r.trailing;
      if (!isNaN(tr.top) && !isNaN(tr.bot) && tr.top > tr.bot) {
        const k0 = Math.max(0, Math.min(tr.topI, tr.botI));
        const t1 = S.t[k0];
        if (p.zonas) {
          const top = tr.top, bot = tr.bot;
          out.cajas.push({ t1, t2: null, p1: 0.95 * top + 0.05 * bot, p2: top, fondo: conAlfa(ROJO, 0.1), borde: null, texto: 'Premium' });
          out.cajas.push({ t1, t2: null, p1: 0.525 * bot + 0.475 * top, p2: 0.525 * top + 0.475 * bot, fondo: 'rgba(135,139,148,0.12)', borde: null, texto: 'Equilibrio' });
          out.cajas.push({ t1, t2: null, p1: bot, p2: 0.95 * bot + 0.05 * top, fondo: conAlfa(VERDE, 0.1), borde: null, texto: 'Discount' });
        }
        if (p.extremos) {
          const b = r.tendSw[ult];
          out.lineas.push({ t1: S.t[tr.topI], t2: null, p: tr.top, color: ROJO, estilo: 0, texto: b === -1 ? 'Máximo fuerte' : 'Máximo débil' });
          out.lineas.push({ t1: S.t[tr.botI], t2: null, p: tr.bot, color: VERDE, estilo: 0, texto: b === 1 ? 'Mínimo fuerte' : 'Mínimo débil' });
        }
      }
      const tx = (b) => (b === 1 ? 'alcista' : b === -1 ? 'bajista' : 'neutral');
      resumenes.set(x.id, `Swing ${tx(r.tendSw[ult])} · interna ${tx(r.tendIn[ult])}`);
    },
    obbb(S, p, out, x, fin) {
      const r = window.LUX.obBreaker(S, { largo: p.largo, cuerpo: p.cuerpo });
      for (const dir of [1, -1]) {
        const vivos = r.obs.filter((o) => o.dir === dir && o.borrado < 0).slice(-p.cuantos);
        for (const o of vivos) {
          const c = dir === 1 ? VERDE : ROJO;
          if (!o.breaker) out.cajas.push({ t1: S.t[o.i0], t2: null, p1: o.btm, p2: o.top, fondo: conAlfa(c, 0.18), borde: conAlfa(c, 0.7), texto: dir === 1 ? 'OB alcista' : 'OB bajista' });
          else {
            out.cajas.push({ t1: S.t[o.i0], t2: fin(o.rotura), p1: o.btm, p2: o.top, fondo: conAlfa(c, 0.1), borde: null, texto: '' });
            out.cajas.push({ t1: fin(o.rotura), t2: null, p1: o.btm, p2: o.top, fondo: conAlfa(dir === 1 ? ROJO : VERDE, 0.12), borde: conAlfa(dir === 1 ? ROJO : VERDE, 0.6), texto: dir === 1 ? 'Breaker bajista' : 'Breaker alcista' });
          }
        }
      }
      resumenes.set(x.id, `${r.obs.filter((o) => o.borrado < 0 && !o.breaker).length} OB · ${r.obs.filter((o) => o.borrado < 0 && o.breaker).length} breakers vigentes`);
    },
    msf(S, p, out, x, fin) {
      const r = window.LUX.msFractal(S, { largo: p.largo });
      for (const e of r.estructuras.slice(-p.max)) out.lineas.push({ t1: S.t[e.desde], t2: fin(e.i), p: e.nivel, color: e.dir === 1 ? VERDE : ROJO, estilo: 1, texto: e.tipo, centro: true });
      if (p.sr) for (const z of r.niveles.slice(-8)) out.lineas.push({ t1: S.t[z.i0], t2: z.roto >= 0 ? fin(z.roto) : null, p: z.p, color: z.tipo === 'soporte' ? VERDE : ROJO, estilo: z.roto >= 0 ? 2 : 0, ancho: 2, texto: z.tipo === 'soporte' ? 'Soporte' : 'Resistencia' });
      const u = r.estructuras[r.estructuras.length - 1];
      resumenes.set(x.id, u ? `Última: ${u.tipo} ${u.dir === 1 ? 'alcista' : 'bajista'}` : 'sin estructura');
    },
    fvglux(S, p, out, x, fin) {
      const r = window.LUX.fvgLux(S, { auto: p.auto, umbralPct: p.umbralPct });
      const vivos = r.fvgs.filter((f) => f.mitigado < 0).slice(-p.max);
      for (const f of vivos) out.cajas.push({ t1: S.t[f.i - 2], t2: null, p1: f.bot, p2: f.top, fondo: conAlfa(f.dir === 1 ? VERDE : ROJO, 0.16), borde: null, texto: 'FVG' });
      if (p.mitigados) for (const f of r.fvgs.filter((q) => q.mitigado >= 0).slice(-p.max)) out.lineas.push({ t1: S.t[f.i - 2], t2: fin(f.mitigado), p: f.dir === 1 ? f.bot : f.top, color: GRIS(), estilo: 2, texto: '' });
      const tot = r.fvgs.length, mit = r.fvgs.filter((f) => f.mitigado >= 0).length;
      resumenes.set(x.id, `${tot} FVG · ${tot ? Math.round((mit / tot) * 100) : 0}% llenados`);
    },
    ifvg(S, p, out, x, fin) {
      const r = window.LUX.ifvg(S, { atrMult: p.atrMult, senal: p.senal });
      for (const z of r.inversiones.filter((q) => q.fin < 0).slice(-p.max)) {
        const c = z.dir === 1 ? VERDE : ROJO;
        out.cajas.push({ t1: S.t[z.i0 - 2], t2: null, p1: z.bot, p2: z.top, fondo: conAlfa(c, 0.15), borde: conAlfa(c, 0.6), texto: z.dir === 1 ? 'IFVG soporte' : 'IFVG resistencia' });
      }
      if (p.senales) for (const s of r.senales.slice(-15)) out.etiquetas.push({ t: S.t[s.i], p: s.dir === 1 ? S.l[s.i] : S.h[s.i], texto: s.dir === 1 ? '▲' : '▼', color: s.dir === 1 ? VERDE : ROJO, pos: s.dir === 1 ? 'abajo' : 'arriba' });
    },
    lsw(S, p, out, x, fin) {
      const r = window.LUX.liqSweeps(S, { largo: p.largo, modo: p.modo });
      for (const b of r.barridas.slice(-p.max)) {
        const c = b.dir === 1 ? VERDE : ROJO;
        out.cajas.push({ t1: S.t[b.i], t2: fin(Math.min(S.length - 1, b.i + 10)), p1: Math.min(b.nivel, b.extremo), p2: Math.max(b.nivel, b.extremo), fondo: conAlfa(c, 0.18), borde: null, texto: '' });
        out.etiquetas.push({ t: S.t[b.i], p: b.extremo, texto: b.tipo === 'mecha' ? 'barrida' : 'retesteo', color: c, pos: b.dir === 1 ? 'abajo' : 'arriba' });
      }
      for (const z of r.niveles.filter((q) => q.fin < 0).slice(-12)) out.lineas.push({ t1: S.t[z.i0], t2: null, p: z.p, color: z.alto ? ROJO : VERDE, estilo: 2, texto: '' });
    },
    ppa(S, p, out, x, fin) {
      const r = window.LUX.ppaEstructuras(S);
      const ver = [p.corto, p.mediano, p.largo];
      for (const e of r.estructuras.filter((q) => ver[q.nivel]).slice(-p.max)) out.lineas.push({ t1: S.t[e.desde], t2: fin(e.i), p: e.nivel_p, color: e.dir === 1 ? VERDE : ROJO, estilo: e.nivel === 2 ? 0 : e.nivel === 1 ? 1 : 2, ancho: e.nivel === 2 ? 2 : 1, texto: `${e.tipo}${e.nivel === 2 ? ' LP' : e.nivel === 1 ? ' MP' : ' CP'}`, centro: true });
      for (const g of r.giros.filter((q) => q.nivel >= 1 && ver[q.nivel]).slice(-30)) out.etiquetas.push({ t: S.t[g.i], p: g.p, texto: g.nivel === 2 ? (g.alto ? 'LTH' : 'LTL') : g.alto ? 'ITH' : 'ITL', color: g.alto ? ROJO : VERDE, pos: g.alto ? 'arriba' : 'abajo' });
    },
  };

  // ---------- primitiva de dibujo ----------
  function pintar(ctx, w, h, capa) {
    const DB = R.dibujos;
    if (!DB) return;
    const E = DB.escalaX();
    if (!E) return;
    const xDe = (t) => (t == null ? w + 2 : E.x0 + DB.LDeT(t) * E.esp);
    const fuente = '10px ' + css('--fuente');
    if (capa === 'fondo') {
      for (const c of items.cajas) {
        const x1 = xDe(c.t1), x2 = xDe(c.t2), y1 = DB.yDeP(c.p2), y2 = DB.yDeP(c.p1);
        if (y1 == null || y2 == null || x2 < 0 || x1 > w) continue;
        ctx.fillStyle = c.fondo; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        if (c.borde) { ctx.strokeStyle = c.borde; ctx.lineWidth = 1; ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1 - 1, y2 - y1 - 1); }
        if (c.texto && x2 - x1 > 34) { ctx.font = fuente; ctx.fillStyle = c.borde || css('--texto-2'); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(c.texto, Math.min(x2, w - 4) - 3, y1 + 2); }
      }
      return;
    }
    for (const l of items.lineas) {
      const x1 = xDe(l.t1), x2 = xDe(l.t2), y = DB.yDeP(l.p);
      if (y == null || x2 < 0 || x1 > w) continue;
      ctx.strokeStyle = l.color; ctx.lineWidth = l.ancho || 1; ctx.setLineDash(l.estilo === 1 ? [6, 4] : l.estilo === 2 ? [2, 3] : []);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      if (l.texto) {
        ctx.setLineDash([]); ctx.font = fuente; ctx.fillStyle = l.color; ctx.textBaseline = 'bottom';
        if (l.centro) { ctx.textAlign = 'center'; ctx.fillText(l.texto, (Math.max(0, x1) + Math.min(w, x2)) / 2, y - 1); }
        else { ctx.textAlign = 'right'; ctx.fillText(l.texto, Math.min(x2, w) - 4, y - 1); }
      }
    }
    ctx.setLineDash([]);
    for (const e of items.etiquetas) {
      const x = xDe(e.t), y = DB.yDeP(e.p);
      if (y == null || x < -20 || x > w + 20) continue;
      ctx.font = fuente; ctx.fillStyle = e.color; ctx.textAlign = 'center';
      ctx.textBaseline = e.pos === 'arriba' ? 'bottom' : 'top';
      ctx.fillText(e.texto, x, e.pos === 'arriba' ? y - 4 : y + 4);
    }
  }
  const vistaFondo = { zOrder: () => 'bottom', renderer: () => ({ draw: (t) => t.useMediaCoordinateSpace(({ context, mediaSize }) => pintar(context, mediaSize.width, mediaSize.height, 'fondo')) }) };
  const vistaFrente = { zOrder: () => 'normal', renderer: () => ({ draw: (t) => t.useMediaCoordinateSpace(({ context, mediaSize }) => pintar(context, mediaSize.width, mediaSize.height, 'frente')) }) };
  class Capa { attached(p) { ru = p.requestUpdate; } detached() { ru = null; } updateAllViews() {} paneViews() { return [vistaFondo, vistaFrente]; } }
  R.on('serie', (s) => s.attachPrimitive(new Capa()));

  // ---------- ciclo de actualización ----------
  let pedido = null;
  function programar(completo, nuevas = 0) {
    if (pedido) { pedido.completo = pedido.completo || completo; pedido.nuevas += nuevas; return; }
    pedido = { completo, nuevas };
    requestAnimationFrame(() => { const p = pedido; pedido = null; recalcular(p.completo); });
  }
  function recalcular(completo) {
    if (!R.chart) return;
    const A = arrays();
    for (const x of inst) actualizarLineas(x, A, completo);
    if (completo) R.alinearPaneles();
    items = calcularEstructura(A);
    if (ru) ru();
    leyendaInd(null);
  }
  R.on('velas', () => programar(true));
  R.on('avance', (e) => programar(false, e.nuevas));
  R.on('tema', () => { for (const x of inst) crearSeries(x); programar(true); });

  // ---------- leyenda ----------
  let ultimoK = null;
  R.on('leyenda', (k) => { ultimoK = k; leyendaInd(k); });
  function botonMini(txt, titulo, fn) { const b = document.createElement('button'); b.className = 'mini-btn'; b.textContent = txt; b.title = titulo; b.setAttribute('aria-label', titulo); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; }
  function filaLeyenda(x, k) {
    const t = TIPOS[x.tipo];
    const fila = document.createElement('div'); fila.className = 'fila-ind' + (x.oculto ? ' apagado' : '');
    const nom = document.createElement('span'); nom.className = 'nom'; nom.textContent = t.corto(x.p); fila.appendChild(nom);
    const vals = ultimos.get(x.id);
    if (vals && !x.oculto) {
      const kk = k == null ? R.velas.length - 1 : k;
      const colores = x.tipo === 'propio' ? coloresProp.get(x.id) || [] : x.tipo === 'macd' ? [null, '#8AB4FF', '#ff9800'] : x.tipo === 'esto' ? ['#8AB4FF', '#ff9800'] : vals.map(() => x.p.color);
      vals.forEach((v, j) => { const s = document.createElement('span'); s.className = 'v'; if (colores[j]) s.style.color = colores[j]; s.textContent = isFinite(v[kk]) ? v[kk].toFixed(2) : '—'; fila.appendChild(s); });
    }
    if (resumenes.has(x.id) && !x.oculto) { const s = document.createElement('span'); s.className = 'res'; s.textContent = resumenes.get(x.id); fila.appendChild(s); }
    const acc = document.createElement('span'); acc.className = 'acc';
    acc.append(botonMini(x.oculto ? '◌' : '◉', x.oculto ? 'Mostrar' : 'Ocultar', () => alternar(x.id)), botonMini('⚙', 'Configurar', () => configurar(x.id)), botonMini('×', 'Quitar', () => quitar(x.id)));
    fila.appendChild(acc);
    return fila;
  }
  function leyendaInd(k) {
    if (k == null) k = ultimoK;
    const el = $('leyenda-ind');
    el.replaceChildren();
    const plegado = LS.get('leyendaPlegada', false), nPrincipal = inst.filter((x) => !enPanel(x)).length;
    el.classList.toggle('plegado', plegado);
    const bp = $('plegar-ley');
    bp.hidden = nPrincipal === 0;
    bp.textContent = plegado ? '▸ ' + nPrincipal + ' indicadores' : '▾';

    for (const x of inst) {
      if (enPanel(x)) { const s = series.get(x.id); if (s && s.panel) { s.panel.leyenda.replaceChildren(filaLeyenda(x, k)); } continue; }
      el.appendChild(filaLeyenda(x, k));
    }
    bp.style.top = ($('leyenda-precio').offsetHeight + (plegado ? 0 : el.offsetHeight) + 10) + 'px';
  }

  // ---------- alta, baja y configuración ----------
  function persistir() {
    if (R.sesion) { R.sesion.indicadores = JSON.parse(JSON.stringify(inst)); R.guardarPronto(); }
    LS.set('indicadoresDef', inst);
    renderObjetos();
  }
  function agregar(tipo, p) {
    if (inst.length >= 12) { aviso('Llegaste al máximo de 12 indicadores.'); return; }
    const x = { id: nuevoId(), tipo, p: Object.assign(defaults(tipo), p || {}), oculto: false };
    inst.push(x);
    crearSeries(x);
    persistir();
    programar(true);
    aviso('Agregué: ' + TIPOS[tipo].nombre);
  }
  function quitar(id) { quitarSeries(id); inst = inst.filter((x) => x.id !== id); persistir(); programar(true); }
  function alternar(id) {
    const x = inst.find((q) => q.id === id);
    if (!x) return;
    x.oculto = !x.oculto;
    const s = series.get(id);
    if (s && s.panel) { s.panel.el.classList.toggle('apagado', x.oculto); s.lineas.forEach((l) => l.applyOptions({ visible: !x.oculto })); }
    persistir(); programar(true);
  }
  function cargarDeSesion() {
    for (const id of [...series.keys()]) quitarSeries(id);
    const fuente = R.sesion && Array.isArray(R.sesion.indicadores) ? R.sesion.indicadores : LS.get('indicadoresDef', []);
    inst = (fuente || []).filter((x) => TIPOS[x.tipo]).map((x) => ({ id: x.id || nuevoId(), tipo: x.tipo, p: Object.assign(defaults(x.tipo), x.p || {}), oculto: !!x.oculto }));
    for (const x of inst) crearSeries(x);
    for (const x of inst) { const s = series.get(x.id); if (s && s.panel) s.panel.el.classList.toggle('apagado', x.oculto); }
    renderObjetos();
    programar(true);
  }
  R.on('sesion', cargarDeSesion);

  function abrirSelector() {
    const dlg = $('dlg-ind');
    const lista = $('dlg-ind-lista'), q = $('dlg-ind-buscar');
    const pintarLista = () => {
      lista.replaceChildren();
      const filtro = q.value.trim().toLowerCase();
      const grupos = {};
      for (const [k, t] of Object.entries(TIPOS)) if (!filtro || t.nombre.toLowerCase().includes(filtro)) (grupos[t.grupo] = grupos[t.grupo] || []).push([k, t]);
      for (const [g, xs] of Object.entries(grupos)) {
        const h = document.createElement('h3'); h.textContent = g; lista.appendChild(h);
        for (const [k, t] of xs) {
          const b = document.createElement('button'); b.className = 'item-ind'; b.textContent = t.nombre;
          b.addEventListener('click', () => { agregar(k); dlg.close(); });
          lista.appendChild(b);
        }
      }
      if (!lista.children.length) { const p = document.createElement('p'); p.className = 'mini'; p.textContent = 'No hay indicadores con ese nombre.'; lista.appendChild(p); }
    };
    q.value = '';
    q.oninput = pintarLista;
    pintarLista();
    dlg.showModal();
    q.focus();
  }
  function formParams(cont, params, valores) {
    cont.replaceChildren();
    const leer = [];
    for (const q of params) {
      const l = document.createElement('label'); l.className = q.tipo === 'bool' ? 'chk' : '';
      let el;
      if (q.tipo === 'bool') { el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!valores[q.k]; l.append(el, document.createTextNode(' ' + q.n)); leer.push(() => [q.k, el.checked]); }
      else {
        const s = document.createElement('span'); s.textContent = q.n;
        if (q.tipo === 'sel') { el = document.createElement('select'); for (const [v, n] of q.opciones) el.appendChild(new Option(n, v)); el.value = String(valores[q.k]); leer.push(() => [q.k, typeof q.def === 'number' ? Number(el.value) : el.value]); }
        else if (q.tipo === 'color') { el = document.createElement('input'); el.type = 'color'; el.value = valores[q.k]; leer.push(() => [q.k, el.value]); }
        else if (q.tipo === 'texto') { el = document.createElement('input'); el.type = 'text'; el.value = valores[q.k]; leer.push(() => [q.k, el.value]); }
        else if (q.tipo === 'codigo') { el = document.createElement('textarea'); el.rows = 14; el.spellcheck = false; el.className = 'codigo-ind'; el.value = valores[q.k]; leer.push(() => [q.k, el.value]); }
        else { el = document.createElement('input'); el.type = 'number'; el.step = q.paso || 1; if (q.min != null) el.min = q.min; if (q.max != null) el.max = q.max; el.value = valores[q.k]; leer.push(() => { let v = Number(el.value); if (!isFinite(v)) v = q.def; if (q.min != null) v = Math.max(q.min, v); if (q.max != null) v = Math.min(q.max, v); return [q.k, v]; }); }
        l.append(s, el);
      }
      cont.appendChild(l);
    }
    return () => Object.fromEntries(leer.map((f) => f()));
  }
  function configurar(id) {
    const x = inst.find((q) => q.id === id);
    if (!x) return;
    const dlg = $('dlg-cfg');
    $('dlg-cfg-titulo').textContent = TIPOS[x.tipo].nombre;
    const leer = formParams($('dlg-cfg-campos'), TIPOS[x.tipo].params, x.p);
    $('dlg-cfg-ok').onclick = (e) => { e.preventDefault(); x.p = leer(); crearSeries(x); persistir(); programar(true); dlg.close(); };
    $('dlg-cfg-def').onclick = (e) => { e.preventDefault(); x.p = defaults(x.tipo); crearSeries(x); persistir(); programar(true); dlg.close(); };
    dlg.showModal();
  }
  function renderObjetos() {
    const ul = $('obj-ind');
    if (!ul) return;
    ul.replaceChildren();
    $('obj-ind-vacio').hidden = inst.length > 0;
    for (const x of inst) {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.className = 'obj-nombre'; n.textContent = TIPOS[x.tipo].corto(x.p);
      const v = document.createElement('button'); v.textContent = x.oculto ? 'Mostrar' : 'Ocultar'; v.addEventListener('click', () => alternar(x.id));
      const c = document.createElement('button'); c.textContent = 'Configurar'; c.addEventListener('click', () => configurar(x.id));
      const b = document.createElement('button'); b.textContent = 'Quitar'; b.addEventListener('click', () => quitar(x.id));
      li.append(n, v, c, b);
      ul.appendChild(li);
    }
  }
  R.on('listo', () => {
    $('btn-indicadores').addEventListener('click', abrirSelector);
    $('plegar-ley').addEventListener('click', () => { LS.set('leyendaPlegada', !LS.get('leyendaPlegada', false)); leyendaInd(null); });
    for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    for (const b of document.querySelectorAll('[data-cerrar]')) b.addEventListener('click', (e) => { e.preventDefault(); b.closest('dialog').close(); });
  });
  R.indicadores = { TIPOS, agregar, formParams, get lista() { return inst; } };
})();
