/* Núcleo del reproductor: datos, gráfico (con paneles), reproducción, órdenes, sesiones y almacenamiento.
 * Expone window.REP para los módulos de dibujos, indicadores y estrategias. */
(() => {
  'use strict';
  const M = window.REPM;
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('rep_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('rep_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento local */ } },
  };
  let toastT = 0;
  function aviso(txt, ms = 3200) { const t = $('toast'); t.textContent = txt; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
  const f2 = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(2));
  const sig = (x, d = 2) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(d));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ---------- eventos entre módulos ----------
  const oyentes = {};
  const on = (ev, fn) => { (oyentes[ev] = oyentes[ev] || []).push(fn); };
  const emit = (ev, x) => { for (const fn of oyentes[ev] || []) { try { fn(x); } catch (e) { console.error(ev, e); } } };

  // ---------- zonas horarias ----------
  function hacerZona(tz) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const cache = new Map();
    return function offset(ms) {
      if (tz === 'UTC') return 0;
      const k = Math.floor(ms / 3600000);
      let v = cache.get(k);
      if (v !== undefined) return v;
      const p = {};
      for (const x of fmt.formatToParts(new Date(k * 3600000))) p[x.type] = x.value;
      v = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - k * 3600000) / 60000);
      cache.set(k, v);
      return v;
    };
  }
  const offNY = M.offNY, minNY = M.minNY;
  let zona = LS.get('zona', 'America/New_York');
  let offZona = hacerZona(zona);
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const p2 = (n) => String(n).padStart(2, '0');
  function textoHora(ms, conDia = true) {
    const d = new Date(ms + offZona(ms) * 60000);
    return (conDia ? DIAS[d.getUTCDay()] + ' ' : '') + `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  }
  function localAUtc(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(str || '');
    if (!m) return null;
    const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    let ms = base - offZona(base) * 60000;
    ms = base - offZona(ms) * 60000;
    return ms;
  }
  function utcALocalInput(ms, soloFecha = false) {
    const d = new Date(ms + offZona(ms) * 60000);
    const f = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
    return soloFecha ? f : `${f}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  }
  const SB = [[180, 240, 'SB Londres'], [600, 660, 'SB AM'], [840, 900, 'SB PM']];
  const KZ = [[1200, 1440, '--kz-asia'], [120, 300, '--kz-lon'], [420, 600, '--kz-ny'], [600, 720, '--kz-cierre']];
  const ventanaSB = (ms) => { const m = minNY(ms); for (const [a, b, n] of SB) if (m >= a && m < b) return n; return 'Fuera de SB'; };

  // ---------- datos ----------
  let INDICE = null;
  const cacheMes = new Map();
  async function decodificarMes(mes) {
    const r = await fetch('datos/' + mes + '.txt');
    if (!r.ok) throw new Error('No se pudieron bajar los datos de ' + mes + ' (' + r.status + ')');
    const b64 = (await r.text()).trim();
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    let buf = u8.buffer;
    if (u8[0] === 0x1f && u8[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const dv = new DataView(buf);
    const n = dv.getInt32(0, true);
    let t = Number(dv.getBigInt64(4, true));
    let pc = dv.getInt32(12, true);
    const T = new Float64Array(n), O = new Float64Array(n), H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n);
    let off = 16;
    for (let i = 0; i < n; i++) {
      t += dv.getUint16(off, true);
      const o = pc + dv.getInt32(off + 2, true);
      const c = o + dv.getInt16(off + 10, true);
      T[i] = t * 60000; O[i] = o / 100; H[i] = (o + dv.getUint16(off + 6, true)) / 100; L[i] = (o - dv.getUint16(off + 8, true)) / 100; C[i] = c / 100;
      pc = c; off += 12;
    }
    return { T, O, H, L, C };
  }
  function bajarMes(mes) {
    if (cacheMes.has(mes)) return cacheMes.get(mes);
    const p = decodificarMes(mes);
    cacheMes.set(mes, p);
    p.catch(() => cacheMes.delete(mes));
    return p;
  }
  const D = { T: new Float64Array(0), O: new Float64Array(0), H: new Float64Array(0), L: new Float64Array(0), C: new Float64Array(0), m0: -1, m1: -1 };
  function unir(partes) {
    const n = partes.reduce((a, p) => a + p.T.length, 0);
    const out = { T: new Float64Array(n), O: new Float64Array(n), H: new Float64Array(n), L: new Float64Array(n), C: new Float64Array(n) };
    let k = 0;
    for (const p of partes) { for (const c of ['T', 'O', 'H', 'L', 'C']) out[c].set(p[c], k); k += p.T.length; }
    return out;
  }
  function podarCache() { // conserva en memoria solo los meses de la ventana del reproductor
    const keep = new Set(INDICE.meses.slice(Math.max(0, D.m0), D.m1 + 1).map((m) => m.mes));
    for (const k of [...cacheMes.keys()]) if (!keep.has(k)) cacheMes.delete(k);
  }
  async function cargarMeses(i0, i1) {
    const partes = await Promise.all(INDICE.meses.slice(i0, i1 + 1).map((m) => bajarMes(m.mes)));
    Object.assign(D, unir(partes), { m0: i0, m1: i1 });
    podarCache();
    emit('datos');
  }
  let extendiendo = null;
  async function extenderAdelante() {
    if (D.m1 >= INDICE.meses.length - 1) return false;
    if (!extendiendo) {
      extendiendo = (async () => {
        const nuevo = await bajarMes(INDICE.meses[D.m1 + 1].mes);
        // la ventana se mantiene en ~10 meses: se descartan los más viejos
        let base = D, m0 = D.m0;
        const maxMeses = 10;
        if (D.m1 + 1 - D.m0 + 1 > maxMeses && cur > 0) {
          const corte = INDICE.meses[D.m1 + 2 - maxMeses].desde;
          let k = 0; while (k < D.T.length && D.T[k] < corte && k < cur - 200000) k++;
          if (k > 0) { base = { T: D.T.subarray(k), O: D.O.subarray(k), H: D.H.subarray(k), L: D.L.subarray(k), C: D.C.subarray(k) }; m0 = D.m1 + 2 - maxMeses; cur -= k; }
        }
        Object.assign(D, unir([base, nuevo]), { m0, m1: D.m1 + 1 });
        podarCache();
        emit('datos');
      })().finally(() => { extendiendo = null; });
    }
    await extendiendo;
    return true;
  }
  // Carga un rango de fechas completo (para el probador de estrategias) sin tocar la ventana del reproductor.
  async function cargarRango(desde, hasta, progreso) {
    const meses = INDICE.meses.filter((m) => m.hasta >= desde && m.desde <= hasta);
    const total = meses.reduce((a, m) => a + m.barras, 0);
    const out = { T: new Float64Array(total), O: new Float64Array(total), H: new Float64Array(total), L: new Float64Array(total), C: new Float64Array(total) };
    let k = 0;
    for (let j = 0; j < meses.length; j++) {
      const m = meses[j];
      const x = cacheMes.has(m.mes) ? await cacheMes.get(m.mes) : await decodificarMes(m.mes);
      for (const c of ['T', 'O', 'H', 'L', 'C']) out[c].set(x[c], k);
      k += x.T.length;
      if (progreso) progreso((j + 1) / meses.length, m.mes);
    }
    let a = 0; while (a < k && out.T[a] < desde) a++;
    let b = k; while (b > a && out.T[b - 1] > hasta) b--;
    return { T: out.T.subarray(a, b), O: out.O.subarray(a, b), H: out.H.subarray(a, b), L: out.L.subarray(a, b), C: out.C.subarray(a, b) };
  }
  const mesDe = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`; };
  function ultimoAntes(ms) {
    let a = 0, b = D.T.length - 1, r = -1;
    while (a <= b) { const m = (a + b) >> 1; if (D.T[m] < ms) { r = m; a = m + 1; } else b = m - 1; }
    return r;
  }

  // ---------- estado ----------
  const TFS = { 1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m', 60: '1H', 240: '4H', 1440: 'D' };
  let tf = LS.get('tf', 3);
  if (!TFS[tf]) tf = 3;
  let tipo = LS.get('tipoGrafico', 'velas');
  let cur = -1;
  let velas = [];
  let jugando = false, timerJuego = 0;
  let verSB = LS.get('verSB', true), verKZ = LS.get('verKZ', false);
  let modo = null;
  const tfMs = () => (tf >= 1440 ? 86400000 : tf * 60000);
  const cubeta = (ms) => (tf === 1 ? ms : M.cubetaTf(ms, tf));
  const tGrafico = (ms) => Math.floor((ms + offZona(ms) * 60000) / 1000);

  // ---------- gráfico y paneles ----------
  let chart = null, serie = null, ruSes = null;
  const paneles = []; // {id, chart, el, ref (serie para la cruz)}
  function opcionesBase() {
    return {
      autoSize: true,
      layout: { background: { type: 'solid', color: css('--bg') }, textColor: css('--texto-2'), fontFamily: css('--fuente'), fontSize: 11 },
      grid: { vertLines: { color: css('--grilla') }, horzLines: { color: css('--grilla') } },
      rightPriceScale: { borderColor: css('--borde'), minimumWidth: 76 },
      timeScale: { borderColor: css('--borde'), timeVisible: true, secondsVisible: false, rightOffset: 12 },
      crosshair: { mode: LS.get('cruzMagnetica', false) ? 1 : 0 },
      localization: { locale: 'es-AR', priceFormatter: (p) => p.toFixed(2) },
    };
  }
  function crearGrafico() {
    const LWC = window.LightweightCharts;
    if (!LWC) { $('cargando').textContent = 'No se pudo cargar la librería del gráfico. Recargá la página.'; return false; }
    chart = LWC.createChart($('lienzo'), opcionesBase());
    crearSerie();
    chart.subscribeCrosshairMove((p) => { leyenda(p); cruzEnPaneles(p, chart); emit('cruz', p); });
    chart.subscribeClick(clicGrafico);
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => sincronizar(chart, r));
    chart.priceScale('right').applyOptions({ mode: LS.get('escalaLog', false) ? 1 : 0 });
    return true;
  }
  function colores() { return { upColor: css('--sube'), downColor: css('--baja'), borderUpColor: css('--sube'), borderDownColor: css('--baja'), wickUpColor: css('--sube'), wickDownColor: css('--baja') }; }
  function crearSerie() {
    if (serie) { try { chart.removeSeries(serie); } catch { /* ya no existe */ } }
    const pf = { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } };
    if (tipo === 'barras') serie = chart.addBarSeries({ upColor: css('--sube'), downColor: css('--baja'), thinBars: false, ...pf });
    else if (tipo === 'linea') serie = chart.addLineSeries({ color: css('--acento'), lineWidth: 2, ...pf });
    else if (tipo === 'area') serie = chart.addAreaSeries({ lineColor: css('--acento'), topColor: 'rgba(255,106,43,0.28)', bottomColor: 'rgba(255,106,43,0.02)', lineWidth: 2, ...pf });
    else if (tipo === 'huecas') serie = chart.addCandlestickSeries({ ...colores(), upColor: 'rgba(0,0,0,0)', ...pf });
    else serie = chart.addCandlestickSeries({ ...colores(), ...pf });
    lineasPrecio = [];
    serie.attachPrimitive(new CapaSesiones());
    emit('serie', serie);
  }
  // Velas de Heikin Ashi (solo para mostrar: las órdenes usan siempre el precio real).
  let ha = [];
  function datoVela(k) {
    const v = velas[k];
    if (tipo === 'linea' || tipo === 'area') return { time: v.time, value: v.close };
    if (tipo === 'heikin') {
      const c = (v.open + v.high + v.low + v.close) / 4;
      const o = k > 0 && ha[k - 1] ? (ha[k - 1].open + ha[k - 1].close) / 2 : (v.open + v.close) / 2;
      ha[k] = { time: v.time, open: o, high: Math.max(v.high, o, c), low: Math.min(v.low, o, c), close: c };
      return ha[k];
    }
    return { time: v.time, open: v.open, high: v.high, low: v.low, close: v.close };
  }
  function aplicarTema() {
    if (!chart) return;
    const o = opcionesBase();
    for (const c of [chart, ...paneles.map((p) => p.chart)]) c.applyOptions({ layout: o.layout, grid: o.grid, rightPriceScale: { borderColor: o.rightPriceScale.borderColor }, timeScale: { borderColor: o.timeScale.borderColor } });
    if (tipo === 'velas' || tipo === 'heikin') serie.applyOptions(colores());
    else if (tipo === 'huecas') serie.applyOptions({ ...colores(), upColor: 'rgba(0,0,0,0)' });
    else if (tipo === 'barras') serie.applyOptions({ upColor: css('--sube'), downColor: css('--baja') });
    else serie.applyOptions(tipo === 'linea' ? { color: css('--acento') } : { lineColor: css('--acento') });
    redibujarCapas();
    dibujarLineas();
    emit('tema');
  }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(aplicarTema, 30)); } catch { /* navegador viejo */ }
  new MutationObserver(() => setTimeout(aplicarTema, 30)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Paneles inferiores (osciladores) sincronizados con el gráfico principal.
  let sincronizando = false, panelActivo = null;
  // El gráfico principal manda; un panel inferior solo arrastra a los demás mientras el usuario lo está usando.
  function sincronizar(origen, r) {
    if (sincronizando || !r) return;
    if (origen !== chart && origen !== panelActivo) return;
    sincronizando = true;
    try { for (const c of [chart, ...paneles.map((p) => p.chart)]) if (c !== origen) c.timeScale().setVisibleLogicalRange(r); } finally { sincronizando = false; }
  }
  function cruzEnPaneles(p, origen) {
    const todos = [{ chart, ref: serie }, ...paneles];
    for (const x of todos) {
      if (x.chart === origen || !x.ref) continue;
      try {
        if (!p || p.logical == null || p.time === undefined) { x.chart.clearCrosshairPosition(); continue; }
        const d = x.ref.dataByIndex(Math.round(p.logical));
        const val = d ? (d.value !== undefined ? d.value : d.close) : undefined;
        if (val === undefined || !isFinite(val)) { x.chart.clearCrosshairPosition(); continue; }
        x.chart.setCrosshairPosition(val, d.time, x.ref);
      } catch { /* sin dato */ }
    }
  }
  function ejesTiempo() {
    const ultimo = paneles.length ? paneles[paneles.length - 1].chart : chart;
    for (const c of [chart, ...paneles.map((p) => p.chart)]) c.applyOptions({ timeScale: { visible: c === ultimo } });
  }
  function nuevoPanel(id, titulo) {
    let p = paneles.find((x) => x.id === id);
    if (p) return p;
    const el = document.createElement('div');
    el.className = 'subpanel';
    el.dataset.panel = id;
    const lz = document.createElement('div'); lz.className = 'lienzo-sub';
    const ley = document.createElement('div'); ley.className = 'leyenda leyenda-sub';
    el.append(lz, ley);
    $('paneles').appendChild(el);
    const c = window.LightweightCharts.createChart(lz, { ...opcionesBase(), layout: { ...opcionesBase().layout, attributionLogo: false }, rightPriceScale: { borderColor: css('--borde'), minimumWidth: 76, scaleMargins: { top: 0.1, bottom: 0.08 } } });
    p = { id, chart: c, el, leyenda: ley, ref: null, titulo };
    paneles.push(p);
    c.timeScale().subscribeVisibleLogicalRangeChange((r) => sincronizar(c, r));
    c.subscribeCrosshairMove((x) => { cruzEnPaneles(x, c); emit('cruz', x); });
    const activar = () => { panelActivo = c; };
    el.addEventListener('pointerenter', activar);
    el.addEventListener('pointerdown', activar);
    el.addEventListener('pointerleave', () => { if (panelActivo === c) panelActivo = null; });
    ejesTiempo();
    const r = chart.timeScale().getVisibleLogicalRange();
    if (r) setTimeout(() => c.timeScale().setVisibleLogicalRange(r), 0);
    return p;
  }
  function alinearPaneles() {
    const r = chart && chart.timeScale().getVisibleLogicalRange();
    if (!r) return;
    sincronizando = true;
    try { for (const p of paneles) p.chart.timeScale().setVisibleLogicalRange(r); } finally { sincronizando = false; }
  }
  function quitarPanel(id) {
    const k = paneles.findIndex((x) => x.id === id);
    if (k < 0) return;
    const p = paneles[k];
    paneles.splice(k, 1);
    p.chart.remove();
    p.el.remove();
    ejesTiempo();
  }

  // Ventanas del Silver Bullet y kill zones: bloques de fondo continuos detrás de las velas.
  function pintarSesiones(ctx, w, h) {
    if ((!verSB && !verKZ) || tf > 60 || !velas.length) return;
    const ts = chart.timeScale(), r = ts.getVisibleLogicalRange();
    const x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1);
    if (!r || x0 == null || x1 == null) return;
    const esp = x1 - x0;
    const a = Math.max(0, Math.floor(r.from) - 1), b = Math.min(velas.length - 1, Math.ceil(r.to) + 1);
    const capas = [];
    if (verKZ) capas.push(KZ.map(([ini, fin, c]) => [ini, fin, css(c)]));
    if (verSB) capas.push(SB.map(([ini, fin]) => [ini, fin, css('--sb')]));
    for (const zonas of capas) {
      let k0 = -1, color = null;
      const cerrar = (k1) => { if (k0 < 0) return; const xa = x0 + (k0 - 0.5) * esp, xb = x0 + (k1 + 0.5) * esp; ctx.fillStyle = color; ctx.fillRect(xa, 0, xb - xa, h); k0 = -1; };
      for (let k = a; k <= b; k++) {
        const m = minNY(velas[k]._b);
        let c = null;
        for (const [ini, fin, col] of zonas) if (m >= ini && m < fin) { c = col; break; }
        const continua = k0 >= 0 && c === color && velas[k]._b - velas[k - 1]._b <= tfMs() * 2;
        if (!continua) { cerrar(k - 1); if (c) { k0 = k; color = c; } }
      }
      cerrar(b);
    }
  }
  const vistaSesiones = { zOrder: () => 'bottom', renderer: () => ({ draw: (t) => t.useMediaCoordinateSpace(({ context, mediaSize }) => pintarSesiones(context, mediaSize.width, mediaSize.height)) }) };
  class CapaSesiones { attached(p) { ruSes = p.requestUpdate; } detached() { ruSes = null; } updateAllViews() {} paneViews() { return [vistaSesiones]; } }
  function redibujarCapas() { if (ruSes) ruSes(); }

  function construir() {
    velas = []; ha = [];
    if (cur < 0) { serie.setData([]); redibujarCapas(); emit('velas'); return; }
    const i0 = Math.max(0, cur - (tf <= 5 ? 40000 : tf <= 60 ? 160000 : 400000));
    let v = null, ultT = -Infinity;
    for (let i = i0; i <= cur; i++) {
      const b = cubeta(D.T[i]);
      if (!v || b !== v._b) {
        if (v) velas.push(v);
        let t = tGrafico(b);
        if (t <= ultT) t = ultT + 1;
        ultT = t;
        v = { time: t, open: D.O[i], high: D.H[i], low: D.L[i], close: D.C[i], _b: b, _i0: i };
      } else {
        if (D.H[i] > v.high) v.high = D.H[i];
        if (D.L[i] < v.low) v.low = D.L[i];
        v.close = D.C[i];
      }
    }
    if (v) velas.push(v);
    serie.setData(velas.map((_, k) => datoVela(k)));
    redibujarCapas();
    dibujarMarcas();
    dibujarLineas();
    refrescarInfo();
    emit('velas');
  }

  // Ganchos por vela de 1 minuto (estrategias en vivo, alertas): devuelven {pausar, motivo} para frenar.
  const ganchosVela = [];
  function revelar(hasta) {
    let tocada = null, nuevas = 0;
    const empujar = (k) => serie.update(datoVela(k));
    let frenar = false, cerro = false;
    for (let i = cur + 1; i <= hasta && i < D.T.length; i++) {
      cur = i;
      for (const g of ganchosVela) { const r = g(i); if (r && r.pausar) { frenar = true; if (r.motivo) aviso(r.motivo); } }
      if (procesarOrdenes(i)) cerro = true;
      const b = cubeta(D.T[i]);
      let v = velas[velas.length - 1];
      if (!v || b !== v._b) {
        if (tocada != null) empujar(tocada);
        let t = tGrafico(b);
        if (v && t <= v.time) t = v.time + 1;
        v = { time: t, open: D.O[i], high: D.H[i], low: D.L[i], close: D.C[i], _b: b, _i0: i };
        velas.push(v);
        nuevas++;
      } else {
        if (D.H[i] > v.high) v.high = D.H[i];
        if (D.L[i] < v.low) v.low = D.L[i];
        v.close = D.C[i];
      }
      tocada = velas.length - 1;
      if ((cerro && $('pausar-cierre').checked) || frenar) break;
    }
    if (tocada != null) empujar(tocada);
    if (cerro || marcasPendientes) { marcasPendientes = false; dibujarMarcas(); }
    if (cerro) { renderDiario(); guardarPronto(); }
    refrescarInfo();
    emit('avance', { nuevas });
    return cerro || frenar;
  }

  async function asegurarAdelante(n) {
    while (D.T.length - 1 - cur < n) { if (!(await extenderAdelante())) return false; }
    return true;
  }
  async function pasoAdelante() {
    await asegurarAdelante(3000);
    if (cur >= D.T.length - 1) { parar(); aviso('Llegaste al final de los datos.'); return false; }
    let hasta = cur + 1;
    if ($('paso').value === 'vela') {
      const b = cubeta(D.T[cur + 1]);
      while (hasta + 1 < D.T.length && cubeta(D.T[hasta + 1]) === b) hasta++;
    }
    const freno = revelar(hasta);
    if (freno && jugando) parar();
    return true;
  }
  function pasoAtras() {
    if (posicion || pendiente) { aviso('Cerrá la posición o cancelá la orden antes de retroceder.'); return; }
    if (velas.length < 2) return;
    const ultima = velas[velas.length - 1];
    const objetivo = ultimoAntes(ultima._b);
    if (objetivo < 0) return;
    cur = objetivo;
    construir();
    emit('cursor');
  }
  function jugar() {
    if (jugando) return;
    jugando = true;
    $('play').textContent = '⏸'; $('play').setAttribute('aria-label', 'Pausar'); $('play').setAttribute('aria-pressed', 'true');
    const tick = async () => {
      if (!jugando) return;
      const ok = await pasoAdelante();
      if (!ok || !jugando) return;
      timerJuego = setTimeout(tick, 1000 / Number($('velocidad').value));
    };
    tick();
  }
  function parar() {
    jugando = false;
    clearTimeout(timerJuego);
    $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Reproducir'); $('play').setAttribute('aria-pressed', 'false');
    guardarPronto();
  }
  async function proximaVentanaSB() {
    parar();
    const enVentana = (ms) => { const m = minNY(ms); for (const [a] of SB) if (m >= a - 10 && m < a + 60) return a; return -1; };
    let j = cur + 1;
    const actual = cur >= 0 ? enVentana(D.T[cur]) : -1;
    for (;;) {
      if (j >= D.T.length) { if (!(await extenderAdelante())) { aviso('Llegaste al final de los datos.'); return; } continue; }
      const w = enVentana(D.T[j]);
      if (w >= 0 && (w !== actual || D.T[j] - D.T[cur] > 3 * 3600000)) break;
      j++;
      if (j - cur > 6 * 1440) { aviso('No encontré otra ventana en los próximos días.'); return; }
    }
    revelar(j);
  }
  // Avanza hasta el próximo día de trading (17:00 de Nueva York).
  async function proximoDia() {
    parar();
    if (cur < 0) return;
    const dia = M.diaNY(D.T[cur]);
    let j = cur + 1;
    for (;;) {
      if (j >= D.T.length) { if (!(await extenderAdelante())) { aviso('Llegaste al final de los datos.'); return; } continue; }
      if (M.diaNY(D.T[j]) !== dia) break;
      j++;
    }
    revelar(j - 1);
  }

  async function irA(ms, opc = {}) {
    parar();
    if ((posicion || pendiente) && !opc.forzar) { aviso('Cerrá la posición o cancelá la orden antes de saltar a otra fecha.'); return false; }
    $('cargando').hidden = false;
    $('cargando').textContent = 'Cargando datos del oro…';
    try {
      const meses = INDICE.meses;
      let k = meses.findIndex((m) => m.mes === mesDe(ms));
      if (k < 0) k = ms < meses[0].desde ? 0 : meses.length - 1;
      const atras = tf >= 240 ? 6 : 2;
      await cargarMeses(Math.max(0, k - atras), Math.min(meses.length - 1, k + 1));
      cur = ultimoAntes(ms);
      if (cur < 0) cur = Math.min(D.T.length - 1, 500);
      construir();
      $('fecha').value = utcALocalInput(D.T[cur] + 60000);
      chart.timeScale().scrollToRealTime();
      $('cargando').hidden = true;
      if (sesion) { sesion.cursorT = D.T[cur]; guardarPronto(); }
      emit('cursor');
      return true;
    } catch (e) {
      $('cargando').textContent = 'No se pudieron cargar los datos: ' + e.message;
      return false;
    }
  }

  // ---------- leyenda e info ----------
  let ultimoParamLeyenda = null;
  function leyenda(param) {
    ultimoParamLeyenda = param;
    const el = $('leyenda-precio');
    let k = velas.length - 1;
    if (param && param.logical != null && param.time !== undefined) k = Math.max(0, Math.min(velas.length - 1, Math.round(param.logical)));
    const v = velas[k];
    el.replaceChildren();
    const b = document.createElement('b'); b.textContent = 'XAUUSD · ' + TFS[tf] + ' · HistData'; el.appendChild(b);
    if (!v) return;
    const d = tipo === 'heikin' && ha[k] ? ha[k] : v;
    const subir = d.close >= d.open;
    for (const [n, x] of [['A', d.open], ['M', d.high], ['m', d.low], ['C', d.close]]) {
      const s = document.createElement('span'); s.textContent = n + ' ';
      const i = document.createElement('span'); i.className = subir ? 'v sube' : 'v baja'; i.textContent = f2(x);
      s.appendChild(i); el.appendChild(s);
    }
    const ch = d.close - d.open;
    const s = document.createElement('span'); s.className = subir ? 'sube' : 'baja'; s.textContent = sig(ch) + ' (' + sig((ch / d.open) * 100) + '%)';
    el.appendChild(s);
    emit('leyenda', k);
  }
  function refrescarInfo() {
    if (cur < 0) return;
    const t = D.T[cur] + 60000;
    $('reloj').textContent = textoHora(t) + ' · ' + ventanaSB(D.T[cur]);
    const sp = spread();
    $('bid').textContent = f2(D.C[cur]);
    $('ask').textContent = f2(D.C[cur] + sp);
    if (!ultimoParamLeyenda || ultimoParamLeyenda.time === undefined) leyenda(null);
    renderPosicion();
  }

  // ---------- trading ----------
  let posicion = null, pendiente = null, marcasPendientes = false;
  const spread = () => Math.max(0, Number($('spread').value) || 0);
  const num = (id, d) => { const x = Number($(id).value); return isFinite(x) && x > 0 ? x : d; };
  const riesgoPct = () => num('riesgo', 1);
  function saldo() { return sesion ? sesion.saldoInicial + sesion.operaciones.reduce((a, o) => a + o.usd, 0) : 10000; }

  // ord: {slDist, rr} o {slPrecio, tpPrecio|rr}; etiqueta, origen
  function abrir(dir, precio, t, ord) {
    const sl = ord.slPrecio != null ? ord.slPrecio : precio - dir * ord.slDist;
    const slDist = (precio - sl) * dir;
    if (!(slDist > 0)) { aviso('La orden no se abrió: el SL quedó del lado equivocado del precio de entrada.'); return false; }
    const tp = ord.tpPrecio != null ? ord.tpPrecio : precio + dir * slDist * (ord.rr || 2);
    if (!((tp - precio) * dir > 0)) { aviso('La orden no se abrió: el TP quedó del lado equivocado del precio de entrada.'); return false; }
    const riesgoUSD = saldo() * riesgoPct() / 100;
    let lotes = Math.floor((riesgoUSD / (slDist * 100)) * 100) / 100;
    if (lotes < 0.01) { lotes = 0.01; aviso('El riesgo pedido es menor que 0,01 lotes: uso 0,01.'); }
    posicion = { dir, entrada: precio, sl, tp, lotes, riesgoUSD: lotes * 100 * slDist, t, etiqueta: ord.etiqueta || '', origen: ord.origen || 'manual' };
    marcasPendientes = true;
    dibujarLineas(); dibujarMarcas(); renderPosicion(); guardarPronto();
    emit('orden', { tipo: 'abierta', posicion });
    return true;
  }
  function cerrar(precio, t, motivo) {
    const p = posicion;
    const usd = (precio - p.entrada) * p.dir * p.lotes * 100;
    const op = {
      n: sesion.operaciones.length + 1, dir: p.dir, tEntrada: p.t, entrada: p.entrada, sl: p.sl, tp: p.tp, tSalida: t, salida: precio,
      lotes: p.lotes, riesgo: p.riesgoUSD, usd, r: usd / p.riesgoUSD, motivo, ventana: ventanaSB(p.t - 60000), tf, etiqueta: p.etiqueta || '', origen: p.origen || 'manual',
    };
    sesion.operaciones.push(op);
    posicion = null;
    dibujarLineas(); dibujarMarcas(); renderDiario(); renderPosicion(); guardarPronto();
    aviso(`${motivo}: ${sig(op.r)} R (${sig(usd)} USD)`);
    emit('orden', { tipo: 'cerrada', op });
  }
  function procesarOrdenes(i) {
    const o = D.O[i], h = D.H[i], l = D.L[i], c = D.C[i], sp = spread(), t = D.T[i];
    let entroAhora = false;
    if (pendiente && !posicion) {
      const pd = pendiente, P = pd.precio;
      if (pd.expira != null && t >= pd.expira) { pendiente = null; dibujarLineas(); renderPosicion(); aviso('La orden pendiente venció.'); }
      else {
        let fill = null;
        if (pd.tipo === 'mercado') fill = pd.dir === 1 ? o + sp : o;
        else if (pd.dir === 1) {
          if (pd.tipo === 'limit' && l + sp <= P) fill = Math.min(P, o + sp);
          if (pd.tipo === 'stop' && h + sp >= P) fill = Math.max(P, o + sp);
        } else {
          if (pd.tipo === 'limit' && h >= P) fill = Math.max(P, o);
          if (pd.tipo === 'stop' && l <= P) fill = Math.min(P, o);
        }
        if (fill !== null) {
          pendiente = null;
          if (abrir(pd.dir, fill, t, pd)) { entroAhora = pd.tipo !== 'mercado'; if (pd.tipo !== 'mercado') aviso(`Orden ${pd.tipo} llenada a ${f2(fill)}`); }
          else { dibujarLineas(); renderPosicion(); }
        } else if (pd.anula && (pd.anula.dir === 1 ? c < pd.anula.nivel : c > pd.anula.nivel)) {
          pendiente = null; dibujarLineas(); renderPosicion(); aviso('La orden se canceló: el FVG quedó anulado.');
        }
      }
    }
    if (!posicion) return false;
    const p = posicion, tc = t + 60000;
    if (p.dir === 1) {
      if (!entroAhora && o <= p.sl) { cerrar(o, tc, 'SL'); return true; }
      if (l <= p.sl) { cerrar(p.sl, tc, p.sl >= p.entrada ? 'BE' : 'SL'); return true; }
      if (!entroAhora && h >= p.tp) { cerrar(Math.max(p.tp, o), tc, 'TP'); return true; }
    } else {
      if (!entroAhora && o + sp >= p.sl) { cerrar(o + sp, tc, 'SL'); return true; }
      if (h + sp >= p.sl) { cerrar(p.sl, tc, p.sl <= p.entrada ? 'BE' : 'SL'); return true; }
      if (!entroAhora && l + sp <= p.tp) { cerrar(Math.min(p.tp, o + sp), tc, 'TP'); return true; }
    }
    return false;
  }
  function mercado(dir, opc = {}) {
    if (!sesion || cur < 0) return false;
    if (posicion) { aviso('Ya hay una posición abierta: cerrala primero.'); return false; }
    const precio = dir === 1 ? D.C[cur] + spread() : D.C[cur];
    const ord = Object.assign({ slDist: num('sl-usd', 5), rr: num('rr', 2) }, opc);
    if (!abrir(dir, precio, D.T[cur] + 60000, ord)) return false;
    aviso(`${dir === 1 ? 'Compra' : 'Venta'} a ${f2(precio)} · SL ${f2(posicion.sl)} · TP ${f2(posicion.tp)}`);
    return true;
  }
  // o: {dir, precio, tipo?('limit'|'stop'|'mercado'), slDist|slPrecio, tpPrecio|rr, expira, anula, etiqueta, origen}
  function colocarOrden(o) {
    if (!sesion || cur < 0) return false;
    if (posicion) { aviso('Ya hay una posición abierta.'); return false; }
    const ref = o.dir === 1 ? D.C[cur] + spread() : D.C[cur];
    let t = o.tipo;
    if (!t || t === 'auto') t = Math.abs(o.precio - ref) < 0.005 ? 'mercado' : (o.dir === 1) === (o.precio < ref) ? 'limit' : 'stop';
    if (t === 'mercado' && !o.enApertura) return mercado(o.dir, o);
    pendiente = Object.assign({ slDist: num('sl-usd', 5), rr: num('rr', 2) }, o, { tipo: t });
    dibujarLineas(); renderPosicion(); guardarPronto();
    aviso(`${o.dir === 1 ? 'Compra' : 'Venta'} ${t} a ${f2(o.precio)}`);
    emit('orden', { tipo: 'pendiente', pendiente });
    return true;
  }
  function cancelarPendiente(silencio) {
    if (!pendiente) return;
    pendiente = null; dibujarLineas(); renderPosicion(); guardarPronto();
    if (!silencio) aviso('Orden cancelada.');
  }
  function crearPendiente() {
    const P = Number($('pend-precio').value);
    if (!isFinite(P) || P <= 0) { aviso('Escribí el precio de la orden.'); return; }
    colocarOrden({ dir: Number($('pend-lado').value), precio: P, tipo: 'auto' });
  }
  function renderPosicion() {
    const p = posicion;
    $('pos-detalle').hidden = !p;
    $('pos-estado').textContent = p ? 'Abierta' : pendiente ? `Orden ${pendiente.tipo} ${pendiente.dir === 1 ? 'de compra' : 'de venta'} a ${f2(pendiente.precio)}` : 'Sin posición';
    $('saldo-chico').textContent = sesion ? 'Saldo ' + saldo().toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' USD' : '—';
    if (!p || cur < 0) return;
    $('pos-dir').textContent = (p.dir === 1 ? 'Compra' : 'Venta') + (p.etiqueta ? ' · ' + p.etiqueta : '');
    $('pos-dir').className = p.dir === 1 ? 'pnl-pos' : 'pnl-neg';
    $('pos-entrada').textContent = f2(p.entrada);
    $('pos-lotes').textContent = p.lotes.toFixed(2) + ' (riesgo ' + p.riesgoUSD.toFixed(2) + ' USD)';
    const salida = p.dir === 1 ? D.C[cur] : D.C[cur] + spread();
    const usd = (salida - p.entrada) * p.dir * p.lotes * 100;
    const el = $('pos-pnl');
    el.textContent = `${sig(usd)} USD · ${sig(usd / p.riesgoUSD)} R`;
    el.className = usd >= 0 ? 'pnl-pos' : 'pnl-neg';
    if (document.activeElement !== $('pos-sl')) $('pos-sl').value = p.sl.toFixed(2);
    if (document.activeElement !== $('pos-tp')) $('pos-tp').value = p.tp.toFixed(2);
  }

  let lineasPrecio = [];
  function dibujarLineas() {
    if (!serie) return;
    for (const l of lineasPrecio) { try { serie.removePriceLine(l); } catch { /* serie nueva */ } }
    lineasPrecio = [];
    const add = (price, color, title, style = 0) => lineasPrecio.push(serie.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    if (posicion) {
      add(posicion.entrada, css('--texto-2'), posicion.dir === 1 ? 'Compra' : 'Venta', 2);
      add(posicion.sl, css('--baja'), 'SL');
      add(posicion.tp, css('--sube'), 'TP');
    }
    if (pendiente) {
      add(pendiente.precio, css('--pend'), (pendiente.dir === 1 ? 'Compra ' : 'Venta ') + pendiente.tipo, 2);
      if (pendiente.slPrecio != null) add(pendiente.slPrecio, css('--baja'), 'SL', 2);
      if (pendiente.tpPrecio != null) add(pendiente.tpPrecio, css('--sube'), 'TP', 2);
    }
  }
  function dibujarMarcas() {
    if (!serie || !sesion) return;
    if (!velas.length) { serie.setMarkers([]); return; }
    const t0 = velas[0]._b, t1 = velas[velas.length - 1]._b;
    const enVista = (ms) => { const b = cubeta(ms); return b >= t0 && b <= t1; };
    const tDe = (ms) => { const b = cubeta(ms); const k = buscarVela(b); return k >= 0 ? velas[k].time : tGrafico(b); };
    const m = [];
    for (const o of sesion.operaciones) {
      if (enVista(o.tEntrada)) m.push({ time: tDe(o.tEntrada), position: o.dir === 1 ? 'belowBar' : 'aboveBar', color: o.dir === 1 ? css('--sube') : css('--baja'), shape: o.dir === 1 ? 'arrowUp' : 'arrowDown', text: '#' + o.n });
      if (enVista(o.tSalida - 60000)) m.push({ time: tDe(o.tSalida - 60000), position: o.dir === 1 ? 'aboveBar' : 'belowBar', color: o.r > 0 ? css('--sube') : css('--baja'), shape: 'circle', text: sig(o.r, 1) + 'R' });
    }
    if (posicion && enVista(posicion.t)) m.push({ time: tDe(posicion.t), position: posicion.dir === 1 ? 'belowBar' : 'aboveBar', color: css('--acento'), shape: posicion.dir === 1 ? 'arrowUp' : 'arrowDown', text: 'abierta' });
    m.sort((a, b) => a.time - b.time);
    try { serie.setMarkers(m); } catch { serie.setMarkers([]); }
  }
  function buscarVela(b) { // índice de la vela con _b === b (o -1)
    let a = 0, z = velas.length - 1;
    while (a <= z) { const k = (a + z) >> 1; if (velas[k]._b === b) return k; if (velas[k]._b < b) a = k + 1; else z = k - 1; }
    return -1;
  }

  function clicGrafico(param) {
    if (!param || !param.point) return;
    if (modo === 'inicio') {
      const idx = param.logical != null ? Math.round(param.logical) : -1;
      const v = velas[Math.max(0, Math.min(velas.length - 1, idx))];
      if (!v) return;
      ponerModo(null);
      if (posicion || pendiente) { aviso('Cerrá la posición o cancelá la orden antes de elegir otro inicio.'); return; }
      const fin = v._b + tfMs();
      cur = ultimoAntes(fin);
      construir();
      emit('cursor');
      if (sesion) { sesion.cursorT = D.T[cur]; guardarPronto(); }
      aviso('Inicio: ' + textoHora(D.T[cur] + 60000));
    }
  }
  function ponerModo(m) {
    modo = modo === m ? null : m;
    $('elegir').setAttribute('aria-pressed', String(modo === 'inicio'));
    mostrarModo(modo === 'inicio' ? 'Clic en la vela de inicio' : '');
  }
  function mostrarModo(txt) { const el = $('modo'); el.hidden = !txt; el.textContent = txt || ''; }

  // ---------- sesiones y almacenamiento ----------
  let sesion = null, sesiones = [];
  const ALM = { db: null, uid: null, nube: false };
  async function iniciarAlmacen() {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        const uid = user ? await user.id() : null;
        if (db && uid) { ALM.db = db; ALM.uid = uid; ALM.nube = true; }
      }
    } catch { /* sin nube */ }
    $('almacen').textContent = ALM.nube ? 'Guardado en tu cuenta' : 'Guardado solo en este navegador';
  }
  const refSesion = (id) => ALM.db.doc('data/users/' + ALM.uid + '/sesion-' + id);
  async function leerSesiones() {
    if (ALM.nube) {
      try {
        const snap = await ALM.db.collection('data/users/' + ALM.uid).get();
        const out = [];
        for (const d of snap.docs) if (d.id.startsWith('sesion-') && d.exists) out.push(structuredClone(d.data()));
        return out;
      } catch { return []; }
    }
    return LS.get('sesiones', []);
  }
  let guardando = false, sucio = false, timerGuardar = 0;
  function guardarPronto() { if (!sesion) return; sucio = true; clearTimeout(timerGuardar); timerGuardar = setTimeout(guardar, 1500); }
  async function guardar() {
    if (!sesion || guardando || !sucio) return;
    guardando = true; sucio = false;
    if (cur >= 0) { sesion.cursorT = D.T[cur]; sesion.tf = tf; }
    sesion.posicion = posicion; sesion.pendiente = pendiente;
    emit('guardar', sesion);
    const copia = JSON.parse(JSON.stringify(sesion));
    try {
      const tam = JSON.stringify(copia).length;
      if (ALM.nube) {
        await refSesion(sesion.id).set(copia);
        if (tam > 230000) aviso('La sesión está cerca del límite de tamaño: conviene empezar una nueva o borrar dibujos a mano alzada.');
      } else {
        const todas = LS.get('sesiones', []).filter((s) => s.id !== copia.id);
        todas.push(copia);
        LS.set('sesiones', todas);
      }
      LS.set('sesionActiva', sesion.id);
    } catch (e) {
      aviso('No se pudo guardar: ' + (e && e.code === 'quota_exceeded' ? 'se llenó el espacio, borrá sesiones viejas.' : 'probá de nuevo en un momento.'));
      sucio = true;
    } finally {
      guardando = false;
      if (sucio) { clearTimeout(timerGuardar); timerGuardar = setTimeout(guardar, 2500); }
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardar(); });

  function nuevaSesionObj(nombre, saldoIni) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return { id, nombre: nombre || 'Sesión ' + new Date().toLocaleDateString('es-AR'), creada: Date.now(), saldoInicial: saldoIni, cursorT: null, tf, operaciones: [], dibujos: [], indicadores: null, posicion: null, pendiente: null };
  }
  function llenarSelector() {
    const sel = $('sesion');
    sel.replaceChildren(...sesiones.sort((a, b) => b.creada - a.creada).map((s) => new Option(`${s.nombre} (${s.operaciones.length} op.)`, s.id)));
    if (sesion) sel.value = sesion.id;
  }
  function migrar(s) {
    s.dibujos = s.dibujos || [];
    if (s.lineas && s.lineas.length) { for (const p of s.lineas) s.dibujos.push({ id: 'l' + Math.random().toString(36).slice(2, 8), tipo: 'horizontal', pts: [{ t: s.cursorT || Date.now(), p }], color: '#9c27b0', ancho: 1, estilo: 0 }); }
    delete s.lineas;
    return s;
  }
  async function activarSesion(s) {
    parar();
    migrar(s);
    sesion = s;
    posicion = null; pendiente = null;
    if (s.tf && TFS[s.tf]) { tf = s.tf; marcarTf(); }
    llenarSelector();
    renderDiario();
    emit('sesion', s);
    const destino = s.cursorT ? s.cursorT + 60000 : DEFAULT_INICIO;
    await irA(destino);
    posicion = s.posicion || null; pendiente = s.pendiente || null;
    dibujarLineas(); dibujarMarcas(); renderPosicion();
    LS.set('sesionActiva', s.id);
  }

  // ---------- diario y estadísticas ----------
  function renderDiario() {
    const ops = sesion ? sesion.operaciones : [];
    const tb = $('diario');
    tb.replaceChildren();
    for (const o of ops.slice().reverse()) {
      const tr = tb.insertRow();
      const celdas = [o.n, textoHora(o.tEntrada, false), o.dir === 1 ? 'Compra' : 'Venta', o.etiqueta || o.ventana, f2(o.entrada), f2(o.salida), o.motivo, sig(o.r), sig(o.usd)];
      celdas.forEach((c, k) => { const td = tr.insertCell(); td.textContent = String(c); if (k >= 7) td.className = o.usd >= 0 ? 'pnl-pos' : 'pnl-neg'; });
    }
    const n = ops.length;
    const gan = ops.filter((o) => o.r > 0), per = ops.filter((o) => o.r <= 0);
    const sumR = ops.reduce((a, o) => a + o.r, 0);
    const pg = gan.reduce((a, o) => a + o.usd, 0), pp = -per.reduce((a, o) => a + o.usd, 0);
    let eq = sesion ? sesion.saldoInicial : 0, pico = eq, dd = 0;
    const curva = [eq];
    for (const o of ops) { eq += o.usd; curva.push(eq); pico = Math.max(pico, eq); dd = Math.max(dd, (pico - eq) / pico); }
    $('st-n').textContent = String(n);
    $('st-acierto').textContent = n ? ((gan.length / n) * 100).toFixed(1) + '%' : '—';
    $('st-r').textContent = n ? sig(sumR) : '0';
    $('st-rprom').textContent = n ? sig(sumR / n) : '—';
    $('st-pf').textContent = pp > 0 ? (pg / pp).toFixed(2) : n ? '∞' : '—';
    $('st-dd').textContent = n ? (dd * 100).toFixed(1) + '%' : '—';
    REP.curvaSVG($('curva'), curva);
    renderPosicion();
    if (sesion) { const o = $('sesion').selectedOptions[0]; if (o) o.textContent = `${sesion.nombre} (${n} op.)`; }
  }
  function curvaSVG(svg, curva, alto = 60) {
    svg.replaceChildren();
    if (curva.length < 2) return;
    const min = Math.min(...curva), max = Math.max(...curva), rango = max - min || 1;
    const pts = curva.map((v, i) => `${(i / (curva.length - 1)) * 300},${alto - 2 - ((v - min) / rango) * (alto - 4)}`).join(' ');
    const ns = 'http://www.w3.org/2000/svg';
    const base = document.createElementNS(ns, 'line');
    const yb = alto - 2 - ((curva[0] - min) / rango) * (alto - 4);
    base.setAttribute('x1', '0'); base.setAttribute('x2', '300'); base.setAttribute('y1', yb); base.setAttribute('y2', yb);
    base.setAttribute('stroke', css('--borde')); base.setAttribute('stroke-dasharray', '3 3'); base.setAttribute('vector-effect', 'non-scaling-stroke');
    const pl = document.createElementNS(ns, 'polyline');
    pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', curva[curva.length - 1] >= curva[0] ? css('--sube') : css('--baja')); pl.setAttribute('stroke-width', '1.5'); pl.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(base, pl);
  }
  const csvCampo = (x) => (/[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x));
  function csv() {
    const filas = [['n', 'entrada_' + zona, 'salida_' + zona, 'lado', 'ventana', 'estrategia', 'temporalidad_min', 'precio_entrada', 'sl', 'tp', 'precio_salida', 'lotes', 'riesgo_usd', 'resultado_usd', 'r', 'motivo']];
    for (const o of sesion.operaciones) filas.push([o.n, textoHora(o.tEntrada, false), textoHora(o.tSalida, false), o.dir === 1 ? 'compra' : 'venta', o.ventana, o.etiqueta || '', o.tf, f2(o.entrada), f2(o.sl), f2(o.tp), f2(o.salida), o.lotes.toFixed(2), o.riesgo.toFixed(2), o.usd.toFixed(2), o.r.toFixed(3), o.motivo]);
    return filas.map((f) => f.map(csvCampo).join(',')).join('\n');
  }
  let descargas = null;
  async function ofrecerArchivo(nombre, data) {
    if (descargas) {
      try { await descargas.save({ filename: nombre, data }); return true; }
      catch (e) { if (e && e.code !== 'declined') aviso('No se pudo descargar: ' + (e.message || e.code)); return false; }
    }
    return false;
  }

  // ---------- controles ----------
  function marcarTf() { for (const b of document.querySelectorAll('[data-tf]')) b.setAttribute('aria-pressed', String(Number(b.dataset.tf) === tf)); }
  async function cambiarTf(nuevo) {
    if (nuevo === tf || !TFS[nuevo]) return;
    tf = nuevo; LS.set('tf', tf); marcarTf();
    if (tf >= 240 && cur >= 0 && D.m0 > 0 && !posicion && !pendiente) await irA(D.T[cur] + 60000);
    else construir();
    chart.timeScale().scrollToRealTime();
    emit('tf', tf);
    guardarPronto();
  }
  for (const b of document.querySelectorAll('[data-tf]')) b.addEventListener('click', () => cambiarTf(Number(b.dataset.tf)));
  $('tipo-grafico').value = tipo;
  $('tipo-grafico').addEventListener('change', () => { tipo = $('tipo-grafico').value; LS.set('tipoGrafico', tipo); crearSerie(); construir(); });
  $('zona').value = zona;
  $('zona').addEventListener('change', () => { zona = $('zona').value; LS.set('zona', zona); offZona = hacerZona(zona); construir(); renderDiario(); if (cur >= 0) $('fecha').value = utcALocalInput(D.T[cur] + 60000); emit('zona'); });
  $('ver-sb').setAttribute('aria-pressed', String(verSB));
  $('ver-kz').setAttribute('aria-pressed', String(verKZ));
  $('ver-sb').addEventListener('click', () => { verSB = !verSB; LS.set('verSB', verSB); $('ver-sb').setAttribute('aria-pressed', String(verSB)); redibujarCapas(); });
  $('ver-kz').addEventListener('click', () => { verKZ = !verKZ; LS.set('verKZ', verKZ); $('ver-kz').setAttribute('aria-pressed', String(verKZ)); redibujarCapas(); });
  $('escala-log').setAttribute('aria-pressed', String(LS.get('escalaLog', false)));
  $('escala-log').addEventListener('click', () => { const v = !LS.get('escalaLog', false); LS.set('escalaLog', v); $('escala-log').setAttribute('aria-pressed', String(v)); chart.priceScale('right').applyOptions({ mode: v ? 1 : 0 }); });
  $('escala-auto').addEventListener('click', () => { chart.priceScale('right').applyOptions({ autoScale: true }); chart.timeScale().scrollToRealTime(); });
  $('captura').addEventListener('click', async () => {
    try {
      const lienzo = chart.takeScreenshot();
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
      if (!(await ofrecerArchivo(`XAUUSD-${TFS[tf]}-${utcALocalInput(D.T[cur] + 60000).replace(/[:T]/g, '-')}.png`, blob))) {
        const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch { aviso('No se pudo sacar la captura.'); }
  });
  $('pantalla').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.app').requestFullscreen(); }
    catch { aviso('Este navegador no permite pantalla completa acá.'); }
  });
  $('elegir').addEventListener('click', () => { parar(); ponerModo('inicio'); });
  $('ir').addEventListener('click', () => { const ms = localAUtc($('fecha').value); if (ms == null) { aviso('Elegí una fecha y hora.'); return; } irA(ms); });
  $('atras').addEventListener('click', () => { parar(); pasoAtras(); });
  $('adelante').addEventListener('click', () => { parar(); pasoAdelante(); });
  $('play').addEventListener('click', () => (jugando ? parar() : jugar()));
  $('prox-sb').addEventListener('click', proximaVentanaSB);
  $('prox-dia').addEventListener('click', proximoDia);
  $('comprar').addEventListener('click', () => mercado(1));
  $('vender').addEventListener('click', () => mercado(-1));
  $('pend-crear').addEventListener('click', crearPendiente);
  $('pend-cancelar').addEventListener('click', () => cancelarPendiente());
  $('pos-cerrar').addEventListener('click', () => { if (posicion && cur >= 0) cerrar(posicion.dir === 1 ? D.C[cur] : D.C[cur] + spread(), D.T[cur] + 60000, 'Manual'); });
  $('pos-be').addEventListener('click', () => { if (posicion) { posicion.sl = posicion.entrada; dibujarLineas(); renderPosicion(); guardarPronto(); } });
  $('pos-aplicar').addEventListener('click', () => {
    if (!posicion) return;
    const sl = Number($('pos-sl').value), tp = Number($('pos-tp').value), d = posicion.dir;
    const ref = d === 1 ? D.C[cur] : D.C[cur] + spread();
    if (!(isFinite(sl) && isFinite(tp))) return;
    if ((d === 1 && (sl >= ref || tp <= ref)) || (d === -1 && (sl <= ref || tp >= ref))) { aviso('El SL tiene que quedar del lado de la pérdida y el TP del de la ganancia.'); return; }
    posicion.sl = sl; posicion.tp = tp; dibujarLineas(); guardarPronto(); aviso('SL y TP actualizados.');
  });
  for (const id of ['riesgo', 'sl-usd', 'rr', 'spread']) {
    const v = LS.get('in_' + id, null);
    if (v !== null) $(id).value = v;
    $(id).addEventListener('change', () => { LS.set('in_' + id, $(id).value); refrescarInfo(); emit('ticket'); });
  }
  $('pausar-cierre').checked = LS.get('pausarCierre', true);
  $('pausar-cierre').addEventListener('change', () => LS.set('pausarCierre', $('pausar-cierre').checked));
  $('velocidad').value = LS.get('velocidad', '3');
  $('velocidad').addEventListener('change', () => LS.set('velocidad', $('velocidad').value));
  $('paso').value = LS.get('paso', 'vela');
  $('paso').addEventListener('change', () => LS.set('paso', $('paso').value));
  $('sesion').addEventListener('change', async () => { if (posicion || pendiente) { aviso('Cerrá la posición o cancelá la orden antes de cambiar de sesión.'); $('sesion').value = sesion.id; return; } await guardar(); const s = sesiones.find((x) => x.id === $('sesion').value); if (s) activarSesion(s); });
  $('nueva-sesion').addEventListener('click', () => { $('form-nueva').hidden = false; $('nueva-nombre').focus(); });
  $('nueva-cancelar').addEventListener('click', () => { $('form-nueva').hidden = true; });
  $('nueva-crear').addEventListener('click', async () => {
    if (posicion || pendiente) { aviso('Cerrá la posición o cancelá la orden antes de cambiar de sesión.'); return; }
    await guardar();
    const s = nuevaSesionObj($('nueva-nombre').value.trim(), Math.max(100, Number($('nueva-saldo').value) || 10000));
    s.cursorT = cur >= 0 ? D.T[cur] : null;
    s.indicadores = sesion && sesion.indicadores ? JSON.parse(JSON.stringify(sesion.indicadores)) : null;
    sesiones.push(s);
    $('form-nueva').hidden = true; $('nueva-nombre').value = '';
    sesion = s; llenarSelector(); renderDiario(); dibujarLineas(); dibujarMarcas(); sucio = true; guardar();
    emit('sesion', s);
    aviso('Sesión creada.');
  });
  $('borrar-sesion').addEventListener('click', () => { $('confirmar-borrar').hidden = false; });
  $('borrar-no').addEventListener('click', () => { $('confirmar-borrar').hidden = true; });
  $('borrar-si').addEventListener('click', async () => {
    $('confirmar-borrar').hidden = true;
    if (!sesion) return;
    const id = sesion.id;
    try {
      if (ALM.nube) await refSesion(id).delete();
      else LS.set('sesiones', LS.get('sesiones', []).filter((s) => s.id !== id));
    } catch { aviso('No se pudo borrar. Probá de nuevo.'); return; }
    sesiones = sesiones.filter((s) => s.id !== id);
    posicion = null; pendiente = null;
    if (!sesiones.length) { const s = nuevaSesionObj('Mi backtest', 10000); s.cursorT = cur >= 0 ? D.T[cur] : null; sesiones.push(s); sesion = s; sucio = true; guardar(); llenarSelector(); renderDiario(); dibujarLineas(); dibujarMarcas(); emit('sesion', s); }
    else await activarSesion(sesiones[0]);
    aviso('Sesión borrada.');
  });
  function copiarTexto(txt, ta) {
    navigator.clipboard.writeText(txt).then(() => aviso('Copiado.'), () => { ta.hidden = false; ta.value = txt; ta.select(); aviso('Seleccioné el texto: copialo con el menú.'); });
  }
  $('copiar-csv').addEventListener('click', () => { if (sesion) copiarTexto(csv(), $('csv-respaldo')); });
  $('bajar-csv').addEventListener('click', () => { if (sesion) ofrecerArchivo(`backtest-${sesion.nombre.replace(/[^\w-]+/g, '_')}.csv`, csv()); });

  // Pestañas del panel derecho.
  function pestana(nombre) {
    for (const b of document.querySelectorAll('[data-pestana]')) b.setAttribute('aria-selected', String(b.dataset.pestana === nombre));
    for (const s of document.querySelectorAll('[data-contenido]')) s.hidden = s.dataset.contenido !== nombre;
    LS.set('pestana', nombre);
    emit('pestana', nombre);
  }
  for (const b of document.querySelectorAll('[data-pestana]')) b.addEventListener('click', () => pestana(b.dataset.pestana));

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k === 'ArrowRight') { e.preventDefault(); parar(); pasoAdelante(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); parar(); pasoAtras(); }
    else if (k === ' ') { e.preventDefault(); jugando ? parar() : jugar(); }
    else if (k === 'b' || k === 'B') mercado(1);
    else if (k === 's' || k === 'S' || k === 'v' || k === 'V') mercado(-1);
    else if ((k === 'c' || k === 'C') && posicion) $('pos-cerrar').click();
    else if (k === 'n' || k === 'N') proximaVentanaSB();
    else if (k === 'Escape') ponerModo(null);
  });

  const DEFAULT_INICIO = Date.UTC(2026, 10, 17, 7, 30);
  async function arrancar() {
    marcarTf();
    if (!crearGrafico()) return;
    try {
      const r = await fetch('datos/indice.json');
      if (!r.ok) throw new Error('índice ' + r.status);
      INDICE = await r.json();
    } catch (e) { $('cargando').textContent = 'No se pudo leer el índice de datos: ' + e.message; return; }
    $('fecha').min = utcALocalInput(INDICE.meses[0].desde);
    $('fecha').max = utcALocalInput(INDICE.meses[INDICE.meses.length - 1].hasta);
    pestana(LS.get('pestana', 'operar'));
    try { descargas = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch { descargas = null; }
    $('bajar-csv').hidden = !descargas;
    emit('listo');
    await iniciarAlmacen();
    sesiones = await leerSesiones();
    if (!sesiones.length) sesiones.push(nuevaSesionObj('Mi backtest', 10000));
    const activa = sesiones.find((s) => s.id === LS.get('sesionActiva', '')) || sesiones.slice().sort((a, b) => b.creada - a.creada)[0];
    await activarSesion(activa);
    $('fecha').value = utcALocalInput(D.T[Math.max(cur, 0)] + 60000);
  }

  const REP = (window.REP = {
    $, LS, aviso, f2, sig, css, on, emit, TFS, SB, M,
    get D() { return D; }, get cur() { return cur; }, get tf() { return tf; }, get velas() { return velas; }, get chart() { return chart; }, get serie() { return serie; },
    get sesion() { return sesion; }, get posicion() { return posicion; }, get pendiente() { return pendiente; }, get jugando() { return jugando; }, get INDICE() { return INDICE; }, get zona() { return zona; },
    tfMs, cubeta, tGrafico, textoHora, utcALocalInput, localAUtc, minNY, offNY, ventanaSB, buscarVela,
    ganchosVela, guardarPronto, guardar, parar, irA, revelar, construir, cambiarTf, mostrarModo,
    colocarOrden, mercado, cancelarPendiente, saldo, riesgoPct, spread, num,
    nuevoPanel, quitarPanel, alinearPaneles, get paneles() { return paneles; }, cargarRango, curvaSVG, ofrecerArchivo, copiarTexto, csvCampo, pestana,
    arrancar,
  });
})();
