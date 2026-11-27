// NEXUS · Pulso del mercado: el precio real de los últimos 180 minutos del replay, dibujado como un osciloscopio
// (línea luminosa, área con degradé, haz de barrido y una onda en cada vela nueva). Usa solo velas ya reveladas
// (REP.D hasta REP.cur) y no calcula señales: es una vista del precio, no un análisis.
(function () {
  'use strict';
  const R = window.REP;
  if (!R) return;
  const $ = (id) => document.getElementById(id);
  const N = 180;
  const P = { c: null, g: null, w: 0, h: 0, dpr: 1, raf: 0, serie: null, onda: 0, ondaT: 0, visible: true, fase: 0 };
  const quieto = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const f2 = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(2));

  function sesion(t) {
    const m = R.minNY(t);
    if (m >= 1080 || m < 120) return 'ASIA';
    if (m < 480) return 'LONDRES';
    if (m < 1020) return 'NUEVA YORK';
    return 'CIERRE';
  }
  function leer() {
    const D = R.D, cur = R.cur;
    if (!D || !D.C || cur < 1) { P.serie = null; return; }
    const a = Math.max(0, cur - N + 1);
    P.serie = { c: Array.from(D.C.subarray(a, cur + 1)), h: Array.from(D.H.subarray(a, cur + 1)), l: Array.from(D.L.subarray(a, cur + 1)), t: D.T[cur] };
    const c = P.serie.c, ult = c[c.length - 1], ref = D.C[Math.max(0, cur - 60)];
    const var60 = ult - ref, hi = Math.max(...P.serie.h.slice(-60)), lo = Math.min(...P.serie.l.slice(-60));
    $('nx-pulso-precio').textContent = f2(ult);
    const v = $('nx-pulso-var');
    v.textContent = (var60 >= 0 ? '+' : '') + f2(var60) + ' · 60 min';
    v.className = var60 >= 0 ? 'sube' : 'baja';
    $('nx-pulso-rango').textContent = 'rango 60 min ' + f2(hi - lo);
    $('nx-pulso-sesion').textContent = sesion(D.T[cur] + 60000);
  }
  function medir() {
    if (!P.c) return;
    const caja = P.c.parentElement;
    P.dpr = Math.min(2, window.devicePixelRatio || 1);
    P.w = Math.max(200, caja.clientWidth);
    P.h = 74;
    P.c.width = Math.round(P.w * P.dpr);
    P.c.height = Math.round(P.h * P.dpr);
    P.c.style.height = P.h + 'px';
    dibujar(performance.now());
  }
  function dibujar(ts) {
    const g = P.g;
    if (!g || !P.w) return;
    g.setTransform(P.dpr, 0, 0, P.dpr, 0, 0);
    g.clearRect(0, 0, P.w, P.h);
    // grilla tenue
    g.strokeStyle = 'rgba(148,163,184,.07)';
    g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { const y = Math.round((P.h * k) / 4) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(P.w, y); g.stroke(); }
    for (let k = 1; k < 12; k++) { const x = Math.round((P.w * k) / 12) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, P.h); g.stroke(); }
    const s = P.serie;
    if (!s || s.c.length < 2) return;
    const c = s.c, n = c.length, min = Math.min(...c), max = Math.max(...c), rg = max - min || 1, pad = 8;
    const X = (i) => 2 + (i / (N - 1)) * (P.w - 14), Y = (v) => P.h - pad - ((v - min) / rg) * (P.h - 2 * pad);
    const off = N - n;
    // área con degradé
    const gr = g.createLinearGradient(0, 0, 0, P.h);
    gr.addColorStop(0, 'rgba(34,211,238,.28)');
    gr.addColorStop(1, 'rgba(37,99,235,0)');
    g.beginPath();
    g.moveTo(X(off), P.h);
    for (let i = 0; i < n; i++) g.lineTo(X(off + i), Y(c[i]));
    g.lineTo(X(off + n - 1), P.h);
    g.closePath();
    g.fillStyle = gr;
    g.fill();
    // línea luminosa (degradé cian → violeta)
    const gl = g.createLinearGradient(0, 0, P.w, 0);
    gl.addColorStop(0, '#2563EB');
    gl.addColorStop(0.55, '#22D3EE');
    gl.addColorStop(1, '#8B5CF6');
    g.save();
    g.shadowColor = 'rgba(34,211,238,.75)';
    g.shadowBlur = 10;
    g.strokeStyle = gl;
    g.lineWidth = 1.8;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < n; i++) { const x = X(off + i), y = Y(c[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.restore();
    // haz de barrido (solo con el replay en marcha)
    const anima = !quieto();
    if (anima && R.jugando) {
      P.fase = (ts / 2600) % 1;
      const bx = P.fase * P.w;
      const hz = g.createLinearGradient(bx - 60, 0, bx, 0);
      hz.addColorStop(0, 'rgba(34,211,238,0)');
      hz.addColorStop(1, 'rgba(34,211,238,.16)');
      g.fillStyle = hz;
      g.fillRect(bx - 60, 0, 60, P.h);
    }
    // último punto con halo y onda en cada vela nueva
    const lx = X(off + n - 1), ly = Y(c[n - 1]);
    if (anima && P.onda > 0) {
      const k = 1 - P.onda;
      g.strokeStyle = `rgba(34,211,238,${0.55 * P.onda})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(lx, ly, 4 + 22 * k, 0, 6.283); g.stroke();
    }
    g.fillStyle = 'rgba(34,211,238,.22)';
    g.beginPath(); g.arc(lx, ly, 7, 0, 6.283); g.fill();
    g.fillStyle = '#F1F5F9';
    g.beginPath(); g.arc(lx, ly, 2.6, 0, 6.283); g.fill();
  }
  function bucle(ts) {
    P.raf = 0;
    if (!P.visible || document.hidden) return;
    if (P.onda > 0) P.onda = Math.max(0, P.onda - (ts - (P.ondaT || ts)) / 900);
    P.ondaT = ts;
    dibujar(ts);
    if (!quieto() && (R.jugando || P.onda > 0)) P.raf = requestAnimationFrame(bucle);
  }
  function pedir() { if (!P.raf) P.raf = requestAnimationFrame(bucle); }
  function refrescar(nueva) {
    leer();
    if (nueva && !quieto()) { P.onda = 1; P.ondaT = 0; }
    pedir();
  }
  R.on('listo', () => {
    P.c = $('nx-pulso-lienzo');
    if (!P.c) return;
    P.g = P.c.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(medir).observe(P.c.parentElement);
    if (window.IntersectionObserver) new IntersectionObserver((es) => { P.visible = es[0].isIntersecting; if (P.visible) pedir(); }).observe(P.c);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pedir(); });
    const play = $('play');
    if (play && window.MutationObserver) new MutationObserver(pedir).observe(play, { attributes: true, attributeFilter: ['aria-pressed'] });
    medir();
    refrescar(false);
  });
  R.on('avance', () => refrescar(true));
  for (const ev of ['cursor', 'datos', 'velas']) R.on(ev, () => refrescar(false));
})();
