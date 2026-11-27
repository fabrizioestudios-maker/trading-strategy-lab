// NEXUS · analíticas del diario: lee las operaciones ya guardadas de la sesión (REP.sesion.operaciones) y las agrupa.
// No cambia el almacenamiento ni los cálculos del núcleo: R y USD son los que guardó el reproductor al cerrar cada operación.
// - Filtro por lado (todas, compras, ventas) y por sesión de mercado; el filtro también oculta filas de la tabla del diario.
// - Distribución compras/ventas, tabla por sesión (hora de Nueva York) y curva de saldo con su drawdown.
// Sesiones (hora de NY de la entrada): Asia 18:00–02:00 · Londres 02:00–08:00 · Nueva York 08:00–17:00 · Cierre 17:00–18:00.
(function () {
  'use strict';
  const R = window.REP;
  if (!R) return;
  const $ = (id) => document.getElementById(id);
  const SESIONES = [['asia', 'Asia'], ['londres', 'Londres'], ['ny', 'Nueva York'], ['cierre', 'Cierre (17–18)']];
  const NOMBRE = Object.fromEntries(SESIONES);
  const F = { lado: 'todas', ses: '' };
  try { const g = R.LS.get('nx_filtro', null); if (g && typeof g === 'object') { F.lado = g.lado || 'todas'; F.ses = g.ses || ''; } } catch (e) { /* nada */ }

  function sesionDe(t) {
    const m = R.minNY(t); // minuto del día en Nueva York
    if (m >= 1080 || m < 120) return 'asia';
    if (m < 480) return 'londres';
    if (m < 1020) return 'ny';
    return 'cierre';
  }
  const pasa = (o) => (F.lado === 'todas' || (F.lado === 'compras' ? o.dir === 1 : o.dir === -1)) && (!F.ses || sesionDe(o.tEntrada) === F.ses);
  const sig = (x, d = 2) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(d));
  const pct = (x) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(1) + '%');
  function resumen(xs) {
    const n = xs.length, g = xs.filter((o) => o.r > 0);
    const sumR = xs.reduce((a, o) => a + o.r, 0);
    const pg = g.reduce((a, o) => a + o.usd, 0), pp = -xs.filter((o) => o.r <= 0).reduce((a, o) => a + o.usd, 0);
    return { n, gan: g.length, acierto: n ? g.length / n : null, sumR, rProm: n ? sumR / n : null, pf: pp > 0 ? pg / pp : n && pg > 0 ? Infinity : null, usd: xs.reduce((a, o) => a + o.usd, 0) };
  }

  function pintar() {
    const caja = $('nx-analitica');
    if (!caja) return;
    const s = R.sesion, ops = s ? s.operaciones : [];
    const xs = ops.filter(pasa);
    for (const b of caja.querySelectorAll('[data-nxf]')) b.setAttribute('aria-pressed', String(b.dataset.nxf === F.lado));
    const selS = $('nx-f-sesion');
    if (selS && selS.value !== F.ses) selS.value = F.ses;
    // resumen del filtro
    const r = resumen(xs);
    $('nx-filtro-txt').textContent = ops.length
      ? `${xs.length} de ${ops.length} operaciones · acierto ${pct(r.acierto)} · ${sig(r.sumR)} R · ${sig(r.usd, 0)} USD`
      : 'Todavía no hay operaciones en esta sesión.';
    // distribución compras / ventas (sobre el filtro de sesión, sin el de lado)
    const base = ops.filter((o) => !F.ses || sesionDe(o.tEntrada) === F.ses);
    const c = resumen(base.filter((o) => o.dir === 1)), v = resumen(base.filter((o) => o.dir === -1));
    const tot = c.n + v.n;
    $('nx-dist-c').style.width = tot ? (c.n / tot) * 100 + '%' : '0';
    $('nx-dist-v').style.width = tot ? (v.n / tot) * 100 + '%' : '0';
    $('nx-dist-ctxt').textContent = `BUY ${c.n} · ${pct(c.acierto)} · ${sig(c.sumR)} R`;
    $('nx-dist-vtxt').textContent = `SELL ${v.n} · ${pct(v.acierto)} · ${sig(v.sumR)} R`;
    // tabla por sesión (sobre el filtro de lado)
    const tb = $('nx-ses-cuerpo');
    tb.replaceChildren();
    const porLado = ops.filter((o) => F.lado === 'todas' || (F.lado === 'compras' ? o.dir === 1 : o.dir === -1));
    for (const [k, nombre] of SESIONES) {
      const g = resumen(porLado.filter((o) => sesionDe(o.tEntrada) === k));
      if (!g.n && k === 'cierre') continue;
      const tr = tb.insertRow();
      if (F.ses === k) tr.className = 'nx-sel';
      const celdas = [nombre, g.n, pct(g.acierto), sig(g.sumR), sig(g.rProm), g.pf == null ? '—' : g.pf === Infinity ? '∞' : g.pf.toFixed(2)];
      celdas.forEach((x, j) => { const td = tr.insertCell(); td.textContent = String(x); if (j >= 3 && j <= 4 && g.n) td.className = g.sumR >= 0 ? 'pnl-pos' : 'pnl-neg'; });
    }
    curva(xs, s ? s.saldoInicial : 0);
    filtrarTabla(ops);
  }
  // curva de saldo (USD) del filtro, con el drawdown como área debajo
  function curva(xs, ini) {
    const svg = $('nx-curva');
    if (!svg) return;
    svg.replaceChildren();
    const W = 300, H = 96, HD = 26, ns = 'http://www.w3.org/2000/svg';
    const eq = [ini], dd = [0];
    let e = ini, pico = ini, ddMax = 0;
    for (const o of xs) { e += o.usd; eq.push(e); pico = Math.max(pico, e); const d = pico > 0 ? (pico - e) / pico : 0; dd.push(d); ddMax = Math.max(ddMax, d); }
    $('nx-dd-txt').textContent = xs.length ? `Saldo ${Math.round(e).toLocaleString('es-AR')} USD · drawdown máx. ${(ddMax * 100).toFixed(1)}%` : '';
    if (eq.length < 2) return;
    const min = Math.min(...eq), max = Math.max(...eq), rg = max - min || 1, x = (i) => (i / (eq.length - 1)) * W;
    const y = (v) => H - HD - 4 - ((v - min) / rg) * (H - HD - 10);
    const el = (tag, at) => { const n = document.createElementNS(ns, tag); for (const k in at) n.setAttribute(k, at[k]); return n; };
    const grad = el('linearGradient', { id: 'nx-gr', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.append(el('stop', { offset: '0', 'stop-color': '#22D3EE', 'stop-opacity': '.28' }), el('stop', { offset: '1', 'stop-color': '#22D3EE', 'stop-opacity': '0' }));
    const defs = el('defs', {}); defs.append(grad);
    const pts = eq.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const area = el('polygon', { points: `0,${H - HD - 4} ${pts} ${W},${H - HD - 4}`, fill: 'url(#nx-gr)' });
    const linea = el('polyline', { points: pts, fill: 'none', stroke: e >= ini ? '#22C55E' : '#EF4444', 'stroke-width': '1.6', 'vector-effect': 'non-scaling-stroke' });
    const y0 = y(ini);
    const base = el('line', { x1: 0, x2: W, y1: y0, y2: y0, stroke: 'rgba(148,163,184,.25)', 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' });
    const top = H - HD + 2, esc = ddMax || 1;
    const ddPts = dd.map((d, i) => `${x(i)},${top + (d / esc) * (HD - 4)}`).join(' ');
    const ddArea = el('polygon', { points: `0,${top} ${ddPts} ${W},${top}`, fill: 'rgba(239,68,68,.28)', stroke: '#EF4444', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' });
    const sep = el('line', { x1: 0, x2: W, y1: top, y2: top, stroke: 'rgba(148,163,184,.18)', 'vector-effect': 'non-scaling-stroke' });
    svg.append(defs, area, base, linea, sep, ddArea);
  }
  // oculta en la tabla del diario las filas que no pasan el filtro (la tabla la arma el núcleo, en orden inverso)
  function filtrarTabla(ops) {
    const tb = $('diario');
    if (!tb) return;
    const porN = new Map(ops.map((o) => [String(o.n), o]));
    for (const tr of tb.rows) { const o = porN.get(tr.cells[0] && tr.cells[0].textContent); tr.hidden = !!o && !pasa(o); }
  }
  function guardarFiltro() { try { R.LS.set('nx_filtro', F); } catch (e) { /* nada */ } }

  let pend = 0;
  const pronto = () => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; pintar(); }); };
  function iniciar() {
    const caja = $('nx-analitica');
    if (!caja) return;
    for (const b of caja.querySelectorAll('[data-nxf]')) b.addEventListener('click', () => { F.lado = b.dataset.nxf; guardarFiltro(); pintar(); });
    const selS = $('nx-f-sesion');
    if (selS) selS.addEventListener('change', () => { F.ses = selS.value; guardarFiltro(); pintar(); });
    const tb = $('diario');
    if (tb) new MutationObserver(pronto).observe(tb, { childList: true });
    for (const ev of ['sesion', 'orden', 'zona', 'pestana']) R.on(ev, pronto);
    pintar();
  }
  R.on('listo', iniciar);
  window.NXANALITICA = { sesionDe, NOMBRE };
})();
