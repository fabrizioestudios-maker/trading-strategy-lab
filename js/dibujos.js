/* Herramientas de dibujo (como en TradingView): líneas, canales, Fibonacci, rectángulos, posiciones larga/corta,
 * texto, marcas, medición y pincel. Se dibujan con una primitiva de Lightweight Charts y se guardan en la sesión. */
(() => {
  'use strict';
  const R = window.REP;
  const { $, LS, aviso, f2, css } = R;

  const ICONO = {
    cursor: 'M5 3l12 7-5.2 1.3L14.5 17l-2.2 1-2.7-5.6L5 16z',
    tendencia: 'M4 18L18 5M4 18m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M18 5m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    rayo: 'M4 18L20 3M4 18m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M10 12.3m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    extendida: 'M2 20L20 2M8 14m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M14 8m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    flecha: 'M4 18L17 5M11 5h6v6',
    horizontal: 'M2 11h18M11 11m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    rayoH: 'M6 11h15M6 11m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    vertical: 'M11 2v18M11 11m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    cruz: 'M2 11h18M11 2v18',
    canal: 'M3 15L15 4M7 19L19 8M5 17l12-11',
    rectangulo: 'M4 6h14v10H4z',
    fibo: 'M3 4h16M3 8h16M3 11h16M3 15h16M3 18h16M4 18L18 4',
    fiboExt: 'M3 5h16M3 9h16M3 13h16M4 19l5-10 5 6',
    larga: 'M4 4h14v7H4zM4 11h14v6H4zM4 11h14',
    corta: 'M4 5h14v6H4zM4 11h14v7H4zM4 11h14',
    rango: 'M4 18V4M18 18V4M4 11h14M8 7l-4 4 4 4M14 7l4 4-4 4',
    texto: 'M5 5h12M11 5v13M8 18h6',
    marcaArriba: 'M11 4l6 7h-4v7H9v-7H5z',
    marcaAbajo: 'M11 18l6-7h-4V4H9v7H5z',
    pincel: 'M3 17c3-1 3-5 6-5s2 4 5 4 3-6 5-8',
    iman: 'M6 4v7a5 5 0 0 0 10 0V4M6 4h3v7a2 2 0 0 0 4 0V4h3M6 7h3M13 7h3',
    seguir: 'M4 16l9-9 3 3-9 9H4zM13 7l2-2 3 3-2 2',
    candado: 'M6 10h10v8H6zM8 10V7a3 3 0 0 1 6 0v3',
    ojo: 'M2 11s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM11 11m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    tacho: 'M4 6h14M8 6V4h6v2M6 6l1 13h8l1-13M9 9v7M13 9v7',
    deshacer: 'M8 8H4V4M4 8a8 8 0 1 1 2 6',
    rehacer: 'M14 8h4V4M18 8a8 8 0 1 0-2 6',
  };
  const HERR = {
    tendencia: { nombre: 'Línea de tendencia', puntos: 2, atajo: 'KeyT', color: '#FFB080' },
    rayo: { nombre: 'Rayo', puntos: 2, color: '#FFB080' },
    extendida: { nombre: 'Línea extendida', puntos: 2, color: '#FFB080' },
    flecha: { nombre: 'Flecha', puntos: 2, color: '#FFB080' },
    horizontal: { nombre: 'Línea horizontal', puntos: 1, atajo: 'KeyH', color: '#FFB080' },
    rayoH: { nombre: 'Rayo horizontal', puntos: 1, atajo: 'KeyJ', color: '#FFB080' },
    vertical: { nombre: 'Línea vertical', puntos: 1, atajo: 'KeyV', color: '#FFB080' },
    cruz: { nombre: 'Línea en cruz', puntos: 1, atajo: 'KeyC', color: '#FFB080' },
    canal: { nombre: 'Canal paralelo', puntos: 3, color: '#FFB080' },
    fibo: { nombre: 'Retroceso de Fibonacci', puntos: 2, atajo: 'KeyF', color: '#9099AC' },
    fiboExt: { nombre: 'Extensión de Fibonacci (por tendencia)', puntos: 3, color: '#9099AC' },
    rectangulo: { nombre: 'Rectángulo', puntos: 2, atajo: 'KeyR', color: '#C792EA' },
    pincel: { nombre: 'Pincel', puntos: 0, color: '#FF6A2B' },
    larga: { nombre: 'Posición larga', puntos: 1, color: '#3FCF8E' },
    corta: { nombre: 'Posición corta', puntos: 1, color: '#FF5C5C' },
    rango: { nombre: 'Medir (rango de precio y fecha)', puntos: 2, atajo: 'KeyM', color: '#FFB080' },
    texto: { nombre: 'Texto', puntos: 1, color: '#FFB080' },
    marcaArriba: { nombre: 'Flecha hacia arriba', puntos: 1, color: '#3FCF8E' },
    marcaAbajo: { nombre: 'Flecha hacia abajo', puntos: 1, color: '#FF5C5C' },
  };
  const GRUPOS = [
    { id: 'lineas', nombre: 'Líneas', tools: ['tendencia', 'rayo', 'extendida', 'flecha', 'horizontal', 'rayoH', 'vertical', 'cruz'] },
    { id: 'canales', nombre: 'Canales', tools: ['canal'] },
    { id: 'fib', nombre: 'Fibonacci', tools: ['fibo', 'fiboExt'] },
    { id: 'formas', nombre: 'Formas', tools: ['rectangulo', 'pincel'] },
    { id: 'pos', nombre: 'Posición y medición', tools: ['larga', 'corta', 'rango'] },
    { id: 'notas', nombre: 'Anotaciones', tools: ['texto', 'marcaArriba', 'marcaAbajo'] },
  ];
  const FIB_NIVELES = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1, 1.272, 1.618];
  const FIBEXT_NIVELES = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];
  const FIB_COL = ['#9099AC', '#FF5C5C', '#ff9800', '#4caf50', '#3FCF8E', '#00bcd4', '#8AB4FF', '#787b86', '#9c27b0', '#e91e63', '#673ab7'];
  const PALETA = ['#FF6A2B', '#FFB080', '#3FCF8E', '#FF5C5C', '#8AB4FF', '#C792EA', '#9099AC', '#F5F6F8'];
  const LINEALES = new Set(['tendencia', 'rayo', 'extendida', 'flecha']);

  let herramienta = null, seleccion = null, enCurso = null, arrastre = null, sobre = null;
  let iman = LS.get('iman', false), seguir = LS.get('seguirDibujando', false), todosBloq = false, todosOcultos = false;
  let deshacer = [], rehacer = [];
  let ru = null;
  const ultimoDeGrupo = LS.get('grupoUlt', {});
  const extra = new WeakMap(); // datos de pantalla (cajas de texto)
  const lista = () => (R.sesion ? (R.sesion.dibujos = R.sesion.dibujos || []) : []);
  const buscar = (id) => lista().find((d) => d.id === id) || (enCurso && enCurso.d.id === id ? enCurso.d : null);
  const nuevoId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const redibujar = () => { if (ru) ru(); };

  // ---------- conversión tiempo/precio ↔ pantalla ----------
  function escalaX() {
    const ts = R.chart.timeScale();
    const a = ts.logicalToCoordinate(0), b = ts.logicalToCoordinate(1);
    if (a == null || b == null || b === a) return null;
    return { x0: a, esp: b - a };
  }
  function LDeT(t) {
    const v = R.velas, n = v.length;
    if (!n) return null;
    const m = R.tfMs();
    if (t <= v[0]._b) return (t - v[0]._b) / m;
    if (t >= v[n - 1]._b) return n - 1 + (t - v[n - 1]._b) / m;
    let a = 0, z = n - 1;
    while (z - a > 1) { const k = (a + z) >> 1; if (v[k]._b <= t) a = k; else z = k; }
    return a + Math.min(0.999, (t - v[a]._b) / m);
  }
  function TDeL(L) {
    const v = R.velas, n = v.length, m = R.tfMs();
    if (!n) return null;
    if (L <= 0) return Math.round(v[0]._b + L * m);
    if (L >= n - 1) return Math.round(v[n - 1]._b + (L - (n - 1)) * m);
    const k = Math.floor(L);
    return Math.round(v[k]._b + (L - k) * m);
  }
  function xDeT(t, E) { const L = LDeT(t); return L == null || !E ? null : E.x0 + L * E.esp; }
  const yDeP = (p) => { const y = R.serie.priceToCoordinate(p); return y == null ? null : y; };
  const pDeY = (y) => R.serie.coordinateToPrice(y);
  function puntoDesde(x, y, libre) {
    const E = escalaX();
    if (!E) return null;
    let L = (x - E.x0) / E.esp;
    if (!libre) L = Math.round(L);
    let p = pDeY(y);
    if (p == null) return null;
    if (iman && !libre) {
      const v = R.velas[Math.max(0, Math.min(R.velas.length - 1, Math.round(L)))];
      if (v) { let mejor = null, dm = Infinity; for (const q of [v.open, v.high, v.low, v.close]) { const d = Math.abs(yDeP(q) - y); if (d < dm) { dm = d; mejor = q; } } if (mejor != null) p = mejor; }
    }
    return { t: TDeL(L), p: Math.round(p * 100) / 100, L };
  }

  // ---------- geometría ----------
  function extender(x1, y1, x2, y2, izq, der, w) {
    if (x1 === x2) return [x1, y1, x2, y2];
    const m = (y2 - y1) / (x2 - x1);
    let a = [x1, y1], b = [x2, y2];
    const haciaDer = x2 > x1;
    const extremo = (x) => [x, y1 + m * (x - x1)];
    if (der) b = extremo(haciaDer ? w + 50 : -50);
    if (izq) a = extremo(haciaDer ? -50 : w + 50);
    return [a[0], a[1], b[0], b[1]];
  }
  function distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  const conAlfa = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const guiones = (e) => (e === 1 ? [6, 4] : e === 2 ? [2, 3] : []);

  // Geometría en pantalla de cada dibujo: segmentos (para dibujar y tocar), cajas y manijas.
  function geo(d, E, w, h) {
    const P = d.pts.map((q) => ({ x: xDeT(q.t, E), y: yDeP(q.p) }));
    if (P.some((q) => q.x == null || q.y == null)) return null;
    const g = { seg: [], cajas: [], manijas: [], P };
    const tipo = d.tipo;
    if (LINEALES.has(tipo)) {
      const izq = tipo === 'extendida' || !!d.extIzq, der = tipo === 'extendida' || tipo === 'rayo' || !!d.extDer;
      g.seg.push(extender(P[0].x, P[0].y, P[1].x, P[1].y, izq, der, w));
      g.manijas = [['p0', P[0]], ['p1', P[1]]];
    } else if (tipo === 'horizontal') { g.seg.push([-10, P[0].y, w + 10, P[0].y]); g.manijas = [['p0', { x: Math.max(10, Math.min(w - 10, P[0].x)), y: P[0].y }]]; }
    else if (tipo === 'rayoH') { g.seg.push([P[0].x, P[0].y, w + 10, P[0].y]); g.manijas = [['p0', P[0]]]; }
    else if (tipo === 'vertical') { g.seg.push([P[0].x, -10, P[0].x, h + 10]); g.manijas = [['p0', { x: P[0].x, y: Math.max(10, Math.min(h - 10, P[0].y)) }]]; }
    else if (tipo === 'cruz') { g.seg.push([-10, P[0].y, w + 10, P[0].y], [P[0].x, -10, P[0].x, h + 10]); g.manijas = [['p0', P[0]]]; }
    else if (tipo === 'canal') {
      const dx = P[1].x - P[0].x;
      const yLinea = dx ? P[0].y + ((P[1].y - P[0].y) * (P[2].x - P[0].x)) / dx : P[0].y;
      const off = P[2].y - yLinea;
      const a = extender(P[0].x, P[0].y, P[1].x, P[1].y, !!d.extIzq, !!d.extDer, w);
      const b = extender(P[0].x, P[0].y + off, P[1].x, P[1].y + off, !!d.extIzq, !!d.extDer, w);
      g.seg.push(a, b);
      g.medio = extender(P[0].x, P[0].y + off / 2, P[1].x, P[1].y + off / 2, !!d.extIzq, !!d.extDer, w);
      g.poli = [[a[0], a[1]], [a[2], a[3]], [b[2], b[3]], [b[0], b[1]]];
      g.manijas = [['p0', P[0]], ['p1', P[1]], ['p2', { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 + off }]];
    } else if (tipo === 'rectangulo' || tipo === 'rango') {
      const x1 = Math.min(P[0].x, P[1].x), x2 = d.extDer ? w + 10 : Math.max(P[0].x, P[1].x), y1 = Math.min(P[0].y, P[1].y), y2 = Math.max(P[0].y, P[1].y);
      g.cajas.push([x1, y1, x2, y2]);
      g.seg.push([x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]);
      g.manijas = [['p0', P[0]], ['p1', P[1]], ['p2', { x: P[0].x, y: P[1].y }], ['p3', { x: P[1].x, y: P[0].y }]];
    } else if (tipo === 'fibo' || tipo === 'fiboExt') {
      const niveles = d.niveles || (tipo === 'fibo' ? FIB_NIVELES : FIBEXT_NIVELES);
      let xa, xb;
      if (tipo === 'fibo') { xa = Math.min(P[0].x, P[1].x); xb = Math.max(P[0].x, P[1].x); }
      else { xa = P[2].x; xb = P[2].x + Math.max(60, Math.abs(P[1].x - P[0].x)); }
      if (d.extDer) xb = w + 10;
      if (d.extIzq) xa = -10;
      g.niveles = niveles.map((n, k) => {
        const precio = tipo === 'fibo' ? d.pts[1].p + (d.pts[0].p - d.pts[1].p) * n : d.pts[2].p + (d.pts[1].p - d.pts[0].p) * n;
        const y = yDeP(precio);
        return { n, precio, y, k };
      }).filter((q) => q.y != null);
      for (const q of g.niveles) g.seg.push([xa, q.y, xb, q.y]);
      g.xa = xa; g.xb = xb;
      g.guia = tipo === 'fibo' ? [[P[0].x, P[0].y, P[1].x, P[1].y]] : [[P[0].x, P[0].y, P[1].x, P[1].y], [P[1].x, P[1].y, P[2].x, P[2].y]];
      g.seg.push(...g.guia);
      g.manijas = P.map((q, k) => ['p' + k, q]);
    } else if (tipo === 'larga' || tipo === 'corta') {
      const x1 = P[0].x, x2 = xDeT(d.fin, E);
      const ye = P[0].y, ytp = yDeP(d.tp), ysl = yDeP(d.sl);
      if (x2 == null || ytp == null || ysl == null) return null;
      g.cajas.push([Math.min(x1, x2), Math.min(ye, ytp), Math.max(x1, x2), Math.max(ye, ytp)], [Math.min(x1, x2), Math.min(ye, ysl), Math.max(x1, x2), Math.max(ye, ysl)]);
      g.seg.push([x1, ye, x2, ye]);
      g.pos = { x1, x2, ye, ytp, ysl };
      g.manijas = [['entrada', { x: x1, y: ye }], ['tp', { x: x1, y: ytp }], ['sl', { x: x1, y: ysl }], ['fin', { x: x2, y: ye }]];
    } else if (tipo === 'texto') {
      const ex = extra.get(d) || { w: 60, h: 16 };
      g.cajas.push([P[0].x - 2, P[0].y - ex.h, P[0].x + ex.w + 2, P[0].y + 4]);
      g.manijas = [['p0', P[0]]];
    } else if (tipo === 'marcaArriba' || tipo === 'marcaAbajo') {
      g.cajas.push([P[0].x - 9, P[0].y - 12, P[0].x + 9, P[0].y + 12]);
      g.manijas = [['p0', P[0]]];
    } else if (tipo === 'pincel') {
      for (let k = 1; k < P.length; k++) g.seg.push([P[k - 1].x, P[k - 1].y, P[k].x, P[k].y]);
    }
    return g;
  }

  // ---------- pintura ----------
  function textoConFondo(ctx, txt, x, y, color, fondo, alinear = 'left') {
    ctx.font = '11px ' + css('--fuente');
    const w = ctx.measureText(txt).width + 8;
    const x0 = alinear === 'center' ? x - w / 2 : alinear === 'right' ? x - w : x;
    ctx.fillStyle = fondo; ctx.fillRect(x0, y - 9, w, 18);
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(txt, x0 + 4, y);
  }
  function linea(ctx, s) { ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }
  function riesgoPos(d) {
    const ent = d.pts[0].p, dir = d.tipo === 'larga' ? 1 : -1;
    const slDist = (ent - d.sl) * dir, tpDist = (d.tp - ent) * dir;
    const riesgo = R.saldo() * R.riesgoPct() / 100;
    const lotes = slDist > 0 ? riesgo / (slDist * 100) : 0;
    return { ent, dir, slDist, tpDist, riesgo, lotes, rr: slDist > 0 ? tpDist / slDist : 0 };
  }
  function pintarDibujo(ctx, d, g, w, h, sel) {
    const col = d.color || HERR[d.tipo].color;
    ctx.strokeStyle = col; ctx.lineWidth = d.ancho || 1; ctx.setLineDash(guiones(d.estilo));
    const tipo = d.tipo;
    if (LINEALES.has(tipo) || ['horizontal', 'rayoH', 'vertical', 'cruz'].includes(tipo)) {
      for (const s of g.seg) linea(ctx, s);
      if (tipo === 'flecha') {
        const s = g.seg[0], ang = Math.atan2(s[3] - s[1], s[2] - s[0]), L = 10 + (d.ancho || 1) * 2;
        ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(s[2], s[3]); ctx.lineTo(s[2] - L * Math.cos(ang - 0.45), s[3] - L * Math.sin(ang - 0.45)); ctx.lineTo(s[2] - L * Math.cos(ang + 0.45), s[3] - L * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      }
      if (d.texto) { ctx.setLineDash([]); ctx.font = '12px ' + css('--fuente'); ctx.fillStyle = col; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; const s = g.seg[0]; const x = tipo === 'horizontal' ? 8 : (s[0] + s[2]) / 2; ctx.fillText(d.texto, Math.max(4, Math.min(w - 120, x)), (tipo === 'horizontal' ? s[1] : (s[1] + s[3]) / 2) - 3); }
    } else if (tipo === 'canal') {
      ctx.fillStyle = conAlfa(col, 0.12); ctx.beginPath(); g.poli.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill();
      for (const s of g.seg) linea(ctx, s);
      ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.6; linea(ctx, g.medio); ctx.globalAlpha = 1;
    } else if (tipo === 'rectangulo') {
      const [x1, y1, x2, y2] = g.cajas[0];
      if (d.relleno !== false) { ctx.fillStyle = conAlfa(col, 0.15); ctx.fillRect(x1, y1, x2 - x1, y2 - y1); }
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      if (d.texto) { ctx.setLineDash([]); ctx.font = '12px ' + css('--fuente'); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(d.texto, x1 + 4, y1 + 3); }
    } else if (tipo === 'rango') {
      const [x1, y1, x2, y2] = g.cajas[0];
      const sube = d.pts[1].p >= d.pts[0].p;
      const c = sube ? '#8AB4FF' : '#FF5C5C';
      ctx.fillStyle = conAlfa(c, 0.12); ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = c; ctx.setLineDash([]);
      const xm = (x1 + x2) / 2, ym = (y1 + y2) / 2;
      linea(ctx, [xm, g.P[0].y, xm, g.P[1].y]); linea(ctx, [g.P[0].x, ym, g.P[1].x, ym]);
      const dp = d.pts[1].p - d.pts[0].p, pct = (dp / d.pts[0].p) * 100;
      const L0 = LDeT(d.pts[0].t), L1 = LDeT(d.pts[1].t);
      const barras = Math.round(Math.abs(L1 - L0));
      const min = Math.abs(d.pts[1].t - d.pts[0].t) / 60000;
      const dur = min >= 1440 ? `${Math.floor(min / 1440)} d ${Math.round((min % 1440) / 60)} h` : min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`;
      const txt = `${dp >= 0 ? '+' : ''}${dp.toFixed(2)} USD (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${barras} velas · ${dur}`;
      textoConFondo(ctx, txt, xm, (sube ? y1 - 14 : y2 + 14), '#ffffff', c, 'center');
    } else if (tipo === 'fibo' || tipo === 'fiboExt') {
      const niv = g.niveles.slice().sort((a, b) => a.y - b.y);
      for (let k = 1; k < niv.length; k++) { ctx.fillStyle = conAlfa(FIB_COL[niv[k].k % FIB_COL.length], 0.07); ctx.fillRect(g.xa, niv[k - 1].y, g.xb - g.xa, niv[k].y - niv[k - 1].y); }
      ctx.setLineDash([4, 4]); ctx.strokeStyle = conAlfa(col, 0.6); for (const s of g.guia) linea(ctx, s);
      ctx.setLineDash(guiones(d.estilo));
      ctx.font = '11px ' + css('--fuente'); ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      for (const q of g.niveles) {
        const c = FIB_COL[q.k % FIB_COL.length];
        ctx.strokeStyle = c; linea(ctx, [g.xa, q.y, g.xb, q.y]);
        ctx.fillStyle = c; ctx.fillText(`${q.n} (${q.precio.toFixed(2)})`, Math.max(2, g.xa) + 2, q.y - 1);
      }
    } else if (tipo === 'larga' || tipo === 'corta') {
      const { x1, x2, ye, ytp, ysl } = g.pos;
      const xa = Math.min(x1, x2), ancho = Math.abs(x2 - x1);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(63,207,142,0.18)'; ctx.fillRect(xa, Math.min(ye, ytp), ancho, Math.abs(ytp - ye));
      ctx.fillStyle = 'rgba(255,92,92,0.18)'; ctx.fillRect(xa, Math.min(ye, ysl), ancho, Math.abs(ysl - ye));
      ctx.strokeStyle = css('--texto-2'); ctx.lineWidth = 1; linea(ctx, [xa, ye, xa + ancho, ye]);
      const r = riesgoPos(d);
      const xm = xa + ancho / 2;
      const usd = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + ' USD';
      if (sel || ancho > 90) {
        textoConFondo(ctx, `Objetivo ${r.tpDist.toFixed(2)} (${((r.tpDist / r.ent) * 100).toFixed(2)}%) · ${usd(r.riesgo * r.rr)}`, xm, ytp + (ytp < ye ? -12 : 12), '#ffffff', '#3FCF8E', 'center');
        textoConFondo(ctx, `Stop ${r.slDist.toFixed(2)} (${((r.slDist / r.ent) * 100).toFixed(2)}%) · ${usd(-r.riesgo)} · ${r.lotes.toFixed(2)} lotes`, xm, ysl + (ysl < ye ? -12 : 12), '#ffffff', '#FF5C5C', 'center');
        textoConFondo(ctx, `R:R ${r.rr.toFixed(2)}`, xm, ye, '#ffffff', css('--texto-2'), 'center');
      }
    } else if (tipo === 'texto') {
      const tam = [12, 12, 14, 18, 24][d.ancho || 1] || 14;
      ctx.font = `${tam}px ` + css('--fuente');
      const txt = d.texto || 'Texto';
      const m = ctx.measureText(txt);
      extra.set(d, { w: m.width, h: tam + 2 });
      ctx.fillStyle = col; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(txt, g.P[0].x, g.P[0].y);
    } else if (tipo === 'marcaArriba' || tipo === 'marcaAbajo') {
      const { x, y } = g.P[0], s = tipo === 'marcaArriba' ? 1 : -1;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x, y - 11 * s); ctx.lineTo(x + 8, y - 2 * s); ctx.lineTo(x + 3, y - 2 * s); ctx.lineTo(x + 3, y + 11 * s); ctx.lineTo(x - 3, y + 11 * s); ctx.lineTo(x - 3, y - 2 * s); ctx.lineTo(x - 8, y - 2 * s); ctx.closePath(); ctx.fill();
      if (d.texto) { ctx.font = '11px ' + css('--fuente'); ctx.textAlign = 'center'; ctx.textBaseline = s === 1 ? 'top' : 'bottom'; ctx.fillText(d.texto, x, y + 13 * s); }
    } else if (tipo === 'pincel') {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = (d.ancho || 2);
      ctx.beginPath(); g.P.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.setLineDash([]);
    if (sel) {
      for (const [, q] of g.manijas) { ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fillStyle = css('--bg'); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke(); }
      if (tipo === 'pincel' && g.P.length) { const xs = g.P.map((q) => q.x), ys = g.P.map((q) => q.y); ctx.setLineDash([3, 3]); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...ys) - Math.min(...ys) + 8); ctx.setLineDash([]); }
    }
  }
  function visibles() { const l = lista().filter((d) => !d.oculto && !todosOcultos); if (enCurso && !l.includes(enCurso.d)) l.push(enCurso.d); return l; }
  function pintar(ctx, w, h) {
    const E = escalaX();
    if (!E) return;
    for (const d of visibles()) {
      const g = geo(d, E, w, h);
      if (!g) continue;
      ctx.save();
      try { pintarDibujo(ctx, d, g, w, h, d.id === seleccion || d.id === (sobre && sobre.id) || (enCurso && enCurso.d === d)); } catch (e) { console.error(e); }
      ctx.restore();
    }
  }

  // ---------- primitiva ----------
  const vista = { zOrder: () => 'top', renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => pintar(context, mediaSize.width, mediaSize.height)) }) };
  function etiquetasPrecio() {
    const out = [];
    const add = (p, color) => { const y = yDeP(p); if (y == null) return; out.push({ coordinate: () => y, text: () => p.toFixed(2), textColor: () => '#ffffff', backColor: () => color, visible: () => true, tickVisible: () => true }); };
    for (const d of visibles()) {
      const sel = d.id === seleccion;
      const col = d.color || HERR[d.tipo].color;
      if (['horizontal', 'rayoH', 'cruz'].includes(d.tipo)) add(d.pts[0].p, col);
      else if (sel && (d.tipo === 'larga' || d.tipo === 'corta')) { add(d.pts[0].p, '#787b86'); add(d.tp, '#3FCF8E'); add(d.sl, '#FF5C5C'); }
      else if (sel && d.tipo !== 'pincel') for (const q of d.pts) add(q.p, col);
    }
    return out;
  }
  function etiquetasTiempo() {
    const out = [];
    const E = escalaX();
    if (!E) return out;
    for (const d of visibles()) {
      if (!(['vertical', 'cruz'].includes(d.tipo) || d.id === seleccion) || d.tipo === 'pincel') continue;
      const col = d.color || HERR[d.tipo].color;
      for (const q of d.tipo === 'vertical' || d.tipo === 'cruz' || d.id === seleccion ? d.pts.slice(0, d.tipo === 'larga' || d.tipo === 'corta' ? 1 : 3) : []) {
        const x = xDeT(q.t, E);
        if (x == null) continue;
        out.push({ coordinate: () => x, text: () => R.textoHora(q.t, false), textColor: () => '#ffffff', backColor: () => col, visible: () => true, tickVisible: () => true });
      }
    }
    return out;
  }
  class Capa {
    attached(p) { ru = p.requestUpdate; }
    detached() { ru = null; }
    updateAllViews() {}
    paneViews() { return [vista]; }
    priceAxisViews() { return etiquetasPrecio(); }
    timeAxisViews() { return etiquetasTiempo(); }
  }
  R.on('serie', (s) => { s.attachPrimitive(new Capa()); });
  R.on('velas', redibujar);
  R.on('tema', redibujar);

  // ---------- toque y arrastre ----------
  function hitDibujo(d, g, x, y, tol) {
    for (const [parte, q] of g.manijas) if (d.id === seleccion && Math.hypot(q.x - x, q.y - y) <= tol + 2) return parte;
    for (const s of g.seg) if (distSeg(x, y, s[0], s[1], s[2], s[3]) <= tol) return 'cuerpo';
    for (const c of g.cajas) if (x >= c[0] - 2 && x <= c[2] + 2 && y >= c[1] - 2 && y <= c[3] + 2) return 'cuerpo';
    if (g.poli && x >= Math.min(...g.poli.map((q) => q[0])) && x <= Math.max(...g.poli.map((q) => q[0]))) {
      const [a, , , b] = [g.poli[0], g.poli[1], g.poli[2], g.poli[3]];
      const s1 = g.seg[0], s2 = g.seg[1];
      const yA = s1[1] + ((s1[3] - s1[1]) * (x - s1[0])) / ((s1[2] - s1[0]) || 1), yB = s2[1] + ((s2[3] - s2[1]) * (x - s2[0])) / ((s2[2] - s2[0]) || 1);
      if (y >= Math.min(yA, yB) && y <= Math.max(yA, yB) && a && b) return 'cuerpo';
    }
    return null;
  }
  function hitTodo(x, y, tol) {
    const E = escalaX();
    if (!E) return null;
    const ps = R.chart.paneSize();
    const l = visibles();
    // primero el seleccionado (manijas), luego de arriba hacia abajo
    const orden = l.slice().sort((a, b) => (a.id === seleccion ? -1 : b.id === seleccion ? 1 : 0));
    for (const d of orden) {
      const g = geo(d, E, ps.width, ps.height);
      if (!g) continue;
      const parte = hitDibujo(d, g, x, y, tol);
      if (parte) return { d, parte };
    }
    return null;
  }
  const cont = () => $('lienzo');
  function local(cx, cy) {
    const r = cont().getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    const ps = R.chart.paneSize();
    return { x, y, enPanel: x >= 0 && y >= 0 && x < ps.width && y < ps.height };
  }
  function foto() { return JSON.stringify(lista()); }
  function guardarHistoria(antes) { deshacer.push(antes); if (deshacer.length > 60) deshacer.shift(); rehacer = []; }
  function cambio() { R.guardarPronto(); redibujar(); renderProps(); renderObjetos(); }

  function crearEn(p, tipoPuntero) {
    const q = puntoDesde(p.x, p.y, herramienta === 'pincel');
    if (!q) return;
    const spec = HERR[herramienta];
    const pt = { t: q.t, p: q.p };
    if (!enCurso) {
      const d = { id: nuevoId(), tipo: herramienta, color: spec.color, ancho: herramienta === 'pincel' ? 2 : 1, estilo: 0, pts: [] };
      if (herramienta === 'pincel') { d.pts = [pt]; enCurso = { d, k: 1, x0: p.x, y0: p.y, pincel: true, ultimo: p }; redibujar(); return; }
      if (herramienta === 'larga' || herramienta === 'corta') {
        const dir = herramienta === 'larga' ? 1 : -1, sl = R.num('sl-usd', 5), rr = R.num('rr', 2);
        d.pts = [pt]; d.sl = Math.round((pt.p - dir * sl) * 100) / 100; d.tp = Math.round((pt.p + dir * sl * rr) * 100) / 100; d.fin = TDeL(q.L + 25);
        terminar(d); return;
      }
      if (spec.puntos === 1) {
        d.pts = [pt];
        if (herramienta === 'texto') d.texto = 'Texto';
        terminar(d);
        if (d.tipo === 'texto') { const foco = () => { const i = $('prop-texto'); if (i) { i.focus(); i.select(); } }; foco(); setTimeout(foco, 30); }
        return;
      }
      d.pts = Array.from({ length: spec.puntos }, () => ({ ...pt }));
      enCurso = { d, k: 1, x0: p.x, y0: p.y, tipoPuntero };
      mostrarAyuda();
      redibujar();
      return;
    }
    const e = enCurso;
    e.d.pts[e.k] = pt;
    for (let j = e.k + 1; j < e.d.pts.length; j++) e.d.pts[j] = { ...pt };
    e.k++;
    if (e.k >= e.d.pts.length) terminar(e.d); else { mostrarAyuda(); redibujar(); }
  }
  function mostrarAyuda() {
    if (!enCurso) { R.mostrarModo(herramienta ? HERR[herramienta].nombre + ': hacé clic en el gráfico' : ''); return; }
    const n = enCurso.d.pts.length;
    R.mostrarModo(`${HERR[enCurso.d.tipo].nombre}: punto ${enCurso.k + 1} de ${n}`);
  }
  function terminar(d) {
    const antes = foto();
    enCurso = null;
    if (d.tipo === 'pincel' && d.pts.length < 2) { redibujar(); return; }
    lista().push(d);
    guardarHistoria(antes);
    seleccion = d.id;
    if (!seguir) ponerHerramienta(null); else mostrarAyuda();
    cambio();
  }
  function cancelarCreacion() { enCurso = null; mostrarAyuda(); redibujar(); }

  function abajo(cx, cy, tipoPuntero) {
    if (!R.chart || !R.velas.length) return false;
    const p = local(cx, cy);
    if (!p.enPanel) return false;
    if (herramienta) { crearEn(p, tipoPuntero); return true; }
    const h = hitTodo(p.x, p.y, tipoPuntero === 'touch' ? 12 : 6);
    if (h) {
      seleccionar(h.d.id);
      if (h.d.bloqueado || todosBloq) return false;
      arrastre = { d: h.d, parte: h.parte, x0: p.x, y0: p.y, orig: JSON.parse(JSON.stringify(h.d)), antes: foto(), movio: false };
      return true;
    }
    if (seleccion) seleccionar(null);
    return false;
  }
  function mover(cx, cy, tipoPuntero) {
    if (!R.chart || !R.velas.length) return;
    const p = local(cx, cy);
    if (enCurso) {
      const e = enCurso;
      if (e.pincel) {
        if (Math.hypot(p.x - e.ultimo.x, p.y - e.ultimo.y) >= 3 && e.d.pts.length < 400) { const q = puntoDesde(p.x, p.y, true); if (q) { e.d.pts.push({ t: q.t, p: q.p }); e.ultimo = p; redibujar(); } }
        return;
      }
      const q = puntoDesde(p.x, p.y, false);
      if (q) { for (let j = e.k; j < e.d.pts.length; j++) e.d.pts[j] = { t: q.t, p: q.p }; redibujar(); }
      return;
    }
    if (arrastre) { arrastrar(p); return; }
    if (tipoPuntero !== 'mouse' || !p.enPanel) { if (sobre) { sobre = null; redibujar(); } return; }
    const h = herramienta ? null : hitTodo(p.x, p.y, 6);
    const nuevo = h ? h.d : null;
    cont().style.cursor = herramienta ? 'crosshair' : h ? (h.parte === 'cuerpo' ? (h.d.bloqueado || todosBloq ? 'default' : 'move') : 'pointer') : '';
    if ((nuevo && nuevo.id) !== (sobre && sobre.id)) { sobre = nuevo; redibujar(); }
  }
  function arrastrar(p) {
    const a = arrastre, d = a.d, o = a.orig;
    const E = escalaX();
    if (!E) return;
    if (!a.movio && Math.hypot(p.x - a.x0, p.y - a.y0) < 3) return;
    a.movio = true;
    const q = puntoDesde(p.x, p.y, d.tipo === 'pincel');
    if (!q) return;
    const dL = Math.round((p.x - a.x0) / E.esp);
    const p0 = pDeY(a.y0), p1 = pDeY(p.y);
    const dP = p0 != null && p1 != null ? p1 - p0 : 0;
    const movT = (t) => TDeL(LDeT(t) + dL);
    const redo = (x) => Math.round(x * 100) / 100;
    if (a.parte === 'cuerpo') {
      d.pts = o.pts.map((pt) => ({ t: d.tipo === 'horizontal' ? pt.t : movT(pt.t), p: redo(pt.p + (d.tipo === 'vertical' ? 0 : dP)) }));
      if (d.tipo === 'larga' || d.tipo === 'corta') { d.tp = redo(o.tp + dP); d.sl = redo(o.sl + dP); d.fin = movT(o.fin); }
    } else if (a.parte === 'tp') d.tp = q.p;
    else if (a.parte === 'sl') d.sl = q.p;
    else if (a.parte === 'fin') d.fin = q.t;
    else if (a.parte === 'entrada') { d.pts[0] = { t: q.t, p: q.p }; d.fin = TDeL(LDeT(o.fin) + (LDeT(q.t) - LDeT(o.pts[0].t))); }
    else if (a.parte.startsWith('p')) {
      const k = Number(a.parte.slice(1));
      if ((d.tipo === 'rectangulo' || d.tipo === 'rango') && k >= 2) {
        if (k === 2) { d.pts[0] = { t: q.t, p: d.pts[0].p }; d.pts[1] = { t: d.pts[1].t, p: q.p }; }
        else { d.pts[1] = { t: q.t, p: d.pts[1].p }; d.pts[0] = { t: d.pts[0].t, p: q.p }; }
      } else if (d.tipo === 'canal' && k === 2) {
        d.pts[2] = { t: TDeL((LDeT(d.pts[0].t) + LDeT(d.pts[1].t)) / 2), p: redo((o.pts[0].p + o.pts[1].p) / 2 + (pDeY(p.y) - (o.pts[0].p + o.pts[1].p) / 2)) };
      } else if (d.tipo === 'horizontal' || d.tipo === 'rayoH') d.pts[0] = { t: d.tipo === 'horizontal' ? d.pts[0].t : q.t, p: q.p };
      else if (d.tipo === 'vertical') d.pts[0] = { t: q.t, p: d.pts[0].p };
      else d.pts[k] = { t: q.t, p: q.p };
    }
    redibujar();
    renderProps();
  }
  function soltar(cx, cy) {
    if (enCurso && !enCurso.pincel && enCurso.k === 1) {
      const p = local(cx, cy);
      if (Math.hypot(p.x - enCurso.x0, p.y - enCurso.y0) > 8) crearEn(p, enCurso.tipoPuntero); // creación arrastrando
      return;
    }
    if (enCurso && enCurso.pincel) { terminar(enCurso.d); return; }
    if (arrastre) {
      const a = arrastre;
      arrastre = null;
      if (a.movio) { guardarHistoria(a.antes); cambio(); }
    }
  }
  function instalarEventos() {
    const c = cont();
    let tocando = false;
    c.addEventListener('mousedown', (e) => { if (e.button !== 0) return; if (abajo(e.clientX, e.clientY, 'mouse')) { e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener('mousemove', (e) => mover(e.clientX, e.clientY, 'mouse'));
    document.addEventListener('mouseup', (e) => soltar(e.clientX, e.clientY));
    c.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (abajo(t.clientX, t.clientY, 'touch')) { tocando = true; e.stopPropagation(); e.preventDefault(); }
    }, { capture: true, passive: false });
    document.addEventListener('touchmove', (e) => { if (!tocando) return; e.preventDefault(); const t = e.touches[0]; mover(t.clientX, t.clientY, 'touch'); }, { passive: false });
    document.addEventListener('touchend', (e) => { if (!tocando) return; tocando = false; const t = e.changedTouches[0]; soltar(t.clientX, t.clientY); });
    c.addEventListener('mouseleave', () => { if (sobre) { sobre = null; redibujar(); } });
    c.addEventListener('dblclick', (e) => { const p = local(e.clientX, e.clientY); const h = hitTodo(p.x, p.y, 6); if (h) { e.stopPropagation(); seleccionar(h.d.id); setTimeout(() => { const i = $('prop-texto'); if (i) { i.focus(); i.select(); } }, 30); } }, true);
  }

  // ---------- selección, acciones y propiedades ----------
  function seleccionar(id) { seleccion = id; renderProps(); renderObjetos(); redibujar(); }
  function borrar(id) {
    const d = buscar(id);
    if (!d) return;
    if (d.bloqueado) { aviso('El dibujo está bloqueado: desbloquealo para borrarlo.'); return; }
    const antes = foto();
    R.sesion.dibujos = lista().filter((x) => x.id !== id);
    guardarHistoria(antes);
    if (seleccion === id) seleccion = null;
    cambio();
  }
  function clonar(id) {
    const d = buscar(id);
    if (!d) return;
    const antes = foto();
    const c = JSON.parse(JSON.stringify(d));
    c.id = nuevoId(); c.bloqueado = false;
    const m = R.tfMs() * 3;
    c.pts = c.pts.map((q) => ({ t: q.t + m, p: q.p }));
    if (c.fin) c.fin += m;
    lista().push(c);
    guardarHistoria(antes);
    seleccion = c.id;
    cambio();
  }
  function deshacerUno() { if (!deshacer.length || !R.sesion) return; rehacer.push(foto()); R.sesion.dibujos = JSON.parse(deshacer.pop()); seleccion = null; cambio(); }
  function rehacerUno() { if (!rehacer.length || !R.sesion) return; deshacer.push(foto()); R.sesion.dibujos = JSON.parse(rehacer.pop()); seleccion = null; cambio(); }
  function ponerHerramienta(t) {
    if (enCurso) cancelarCreacion();
    herramienta = t;
    for (const b of document.querySelectorAll('[data-grupo]')) {
      const g = GRUPOS.find((x) => x.id === b.dataset.grupo);
      const act = g.tools.includes(herramienta);
      b.setAttribute('aria-pressed', String(act));
    }
    $('h-cursor').setAttribute('aria-pressed', String(!herramienta));
    cont().style.cursor = herramienta ? 'crosshair' : '';
    if (t) seleccionar(null);
    mostrarAyuda();
  }
  function iconoSVG(nombre) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 22 22'); s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONO[nombre]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.5'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }
  const ATAJOS = { KeyT: 'Alt+T', KeyH: 'Alt+H', KeyJ: 'Alt+J', KeyV: 'Alt+V', KeyC: 'Alt+C', KeyF: 'Alt+F', KeyR: 'Alt+R', KeyM: 'Alt+M' };
  let menuAbierto = null;
  function cerrarMenu() { if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; } }
  function construirBarra() {
    const nav = $('herramientas');
    nav.replaceChildren();
    const boton = (id, icono, titulo, fn) => { const b = document.createElement('button'); b.className = 'herr'; if (id) b.id = id; b.title = titulo; b.setAttribute('aria-label', titulo); b.appendChild(iconoSVG(icono)); b.addEventListener('click', fn); nav.appendChild(b); return b; };
    boton('h-cursor', 'cursor', 'Cursor (Esc)', () => ponerHerramienta(null)).setAttribute('aria-pressed', 'true');
    for (const g of GRUPOS) {
      const actual = g.tools.includes(ultimoDeGrupo[g.id]) ? ultimoDeGrupo[g.id] : g.tools[0];
      const caja = document.createElement('div'); caja.className = 'herr-grupo';
      const b = document.createElement('button'); b.className = 'herr'; b.dataset.grupo = g.id; b.setAttribute('aria-pressed', 'false');
      const pintarBoton = (t) => { b.replaceChildren(iconoSVG(t)); const at = HERR[t].atajo ? ` (${ATAJOS[HERR[t].atajo]})` : ''; b.title = HERR[t].nombre + at; b.setAttribute('aria-label', HERR[t].nombre); b.dataset.tool = t; };
      pintarBoton(actual);
      b.addEventListener('click', () => ponerHerramienta(herramienta === b.dataset.tool ? null : b.dataset.tool));
      caja.appendChild(b);
      if (g.tools.length > 1) {
        const m = document.createElement('button'); m.className = 'herr-mas'; m.title = 'Más herramientas: ' + g.nombre; m.setAttribute('aria-label', 'Más herramientas: ' + g.nombre); m.setAttribute('aria-haspopup', 'menu'); m.textContent = '▸';
        m.addEventListener('click', (e) => {
          e.stopPropagation();
          if (menuAbierto && menuAbierto.dataset.g === g.id) { cerrarMenu(); return; }
          cerrarMenu();
          const menu = document.createElement('div'); menu.className = 'menu-herr'; menu.setAttribute('role', 'menu'); menu.dataset.g = g.id;
          for (const t of g.tools) {
            const it = document.createElement('button'); it.setAttribute('role', 'menuitem'); it.className = 'item-herr';
            it.appendChild(iconoSVG(t));
            const s = document.createElement('span'); s.textContent = HERR[t].nombre; it.appendChild(s);
            if (HERR[t].atajo) { const k = document.createElement('kbd'); k.textContent = ATAJOS[HERR[t].atajo]; it.appendChild(k); }
            it.addEventListener('click', () => { ultimoDeGrupo[g.id] = t; LS.set('grupoUlt', ultimoDeGrupo); pintarBoton(t); cerrarMenu(); ponerHerramienta(t); });
            menu.appendChild(it);
          }
          const r = caja.getBoundingClientRect(), rr = $('cuerpo').getBoundingClientRect();
          menu.style.left = (r.right - rr.left + 4) + 'px'; menu.style.top = (r.top - rr.top) + 'px';
          if (matchMedia('(max-width: 900px)').matches) { menu.style.left = Math.max(0, r.left - rr.left) + 'px'; menu.style.top = (r.bottom - rr.top + 4) + 'px'; }
          $('cuerpo').appendChild(menu);
          menuAbierto = menu;
        });
        caja.appendChild(m);
      }
      nav.appendChild(caja);
    }
    const sep = () => { const s = document.createElement('span'); s.className = 'herr-sep'; nav.appendChild(s); };
    sep();
    const bIman = boton('h-iman', 'iman', 'Imán: pega los puntos a la apertura, máximo, mínimo o cierre de la vela', () => { iman = !iman; LS.set('iman', iman); bIman.setAttribute('aria-pressed', String(iman)); });
    bIman.setAttribute('aria-pressed', String(iman));
    const bSeg = boton('h-seguir', 'seguir', 'Seguir dibujando (no vuelve al cursor después de cada dibujo)', () => { seguir = !seguir; LS.set('seguirDibujando', seguir); bSeg.setAttribute('aria-pressed', String(seguir)); });
    bSeg.setAttribute('aria-pressed', String(seguir));
    const bBloq = boton('h-bloq', 'candado', 'Bloquear todos los dibujos', () => { todosBloq = !todosBloq; bBloq.setAttribute('aria-pressed', String(todosBloq)); });
    bBloq.setAttribute('aria-pressed', 'false');
    const bOcu = boton('h-ocultar', 'ojo', 'Ocultar todos los dibujos', () => { todosOcultos = !todosOcultos; bOcu.setAttribute('aria-pressed', String(todosOcultos)); redibujar(); });
    bOcu.setAttribute('aria-pressed', 'false');
    boton('h-borrar', 'tacho', 'Borrar todos los dibujos', () => {
      if (!lista().length) return;
      const caja = $('confirmar-dibujos'); caja.hidden = false;
    });
    sep();
    boton('h-deshacer', 'deshacer', 'Deshacer (Ctrl+Z)', deshacerUno);
    boton('h-rehacer', 'rehacer', 'Rehacer (Ctrl+Y)', rehacerUno);
  }
  document.addEventListener('click', (e) => { if (menuAbierto && !menuAbierto.contains(e.target)) cerrarMenu(); });

  function campo(etq, el) { const l = document.createElement('label'); l.className = 'prop'; const s = document.createElement('span'); s.textContent = etq; l.append(s, el); return l; }
  function renderProps() {
    const caja = $('props');
    const d = seleccion ? buscar(seleccion) : null;
    if (!d) { caja.hidden = true; caja.replaceChildren(); return; }
    if (caja.dataset.id === d.id && !caja.hidden && caja.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') return;
    caja.dataset.id = d.id;
    caja.hidden = false;
    caja.replaceChildren();
    const modificar = (fn) => { const antes = foto(); fn(); guardarHistoria(antes); R.guardarPronto(); redibujar(); renderObjetos(); };
    const titulo = document.createElement('b'); titulo.textContent = HERR[d.tipo].nombre; caja.appendChild(titulo);
    if (!['larga', 'corta', 'rango'].includes(d.tipo)) {
      const sw = document.createElement('div'); sw.className = 'paleta';
      for (const c of PALETA) {
        const b = document.createElement('button'); b.className = 'color'; b.style.background = c; b.title = 'Color ' + c; b.setAttribute('aria-label', 'Color ' + c);
        b.setAttribute('aria-pressed', String((d.color || HERR[d.tipo].color) === c));
        b.addEventListener('click', () => { modificar(() => { d.color = c; }); renderProps(); });
        sw.appendChild(b);
      }
      caja.appendChild(sw);
      if (!['texto', 'marcaArriba', 'marcaAbajo'].includes(d.tipo)) {
        const anc = document.createElement('select');
        for (const n of [1, 2, 3, 4]) anc.appendChild(new Option(n + ' px', n));
        anc.value = d.ancho || 1; anc.addEventListener('change', () => modificar(() => { d.ancho = Number(anc.value); }));
        caja.appendChild(campo('Grosor', anc));
        if (d.tipo !== 'pincel') {
          const est = document.createElement('select');
          ['Sólida', 'Guiones', 'Puntos'].forEach((n, k) => est.appendChild(new Option(n, k)));
          est.value = d.estilo || 0; est.addEventListener('change', () => modificar(() => { d.estilo = Number(est.value); }));
          caja.appendChild(campo('Estilo', est));
        }
      } else if (d.tipo === 'texto') {
        const tam = document.createElement('select');
        [['Chico', 1], ['Mediano', 2], ['Grande', 3], ['Muy grande', 4]].forEach(([n, k]) => tam.appendChild(new Option(n, k)));
        tam.value = d.ancho || 2; tam.addEventListener('change', () => modificar(() => { d.ancho = Number(tam.value); }));
        caja.appendChild(campo('Tamaño', tam));
      }
    }
    const check = (etq, clave, fn) => { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!d[clave]; i.addEventListener('change', () => modificar(() => { d[clave] = i.checked; if (fn) fn(); })); const l = document.createElement('label'); l.className = 'prop chk'; l.append(i, document.createTextNode(' ' + etq)); caja.appendChild(l); };
    if (['tendencia', 'canal', 'fibo', 'fiboExt'].includes(d.tipo)) check('Ext. izq.', 'extIzq');
    if (['tendencia', 'canal', 'fibo', 'fiboExt', 'rectangulo'].includes(d.tipo)) check('Ext. der.', 'extDer');
    if (d.tipo === 'rectangulo') { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = d.relleno !== false; i.addEventListener('change', () => modificar(() => { d.relleno = i.checked; })); const l = document.createElement('label'); l.className = 'prop chk'; l.append(i, document.createTextNode(' Relleno')); caja.appendChild(l); }
    if (['horizontal', 'rayoH'].includes(d.tipo)) check('Alerta (pausa el replay)', 'alerta');
    if (['horizontal', 'rayoH', 'tendencia', 'rayo', 'extendida', 'flecha', 'rectangulo', 'texto', 'marcaArriba', 'marcaAbajo'].includes(d.tipo)) {
      const t = document.createElement('input'); t.type = 'text'; t.id = 'prop-texto'; t.value = d.texto || ''; t.placeholder = 'Texto'; t.maxLength = 80;
      let antes = null;
      t.addEventListener('focus', () => { antes = foto(); });
      t.addEventListener('input', () => { d.texto = t.value; redibujar(); });
      t.addEventListener('change', () => { if (antes) guardarHistoria(antes); antes = null; R.guardarPronto(); renderObjetos(); });
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); t.blur(); } });
      caja.appendChild(campo('Texto', t));
    }
    if (d.tipo === 'fibo' || d.tipo === 'fiboExt') {
      const t = document.createElement('input'); t.type = 'text'; t.value = (d.niveles || (d.tipo === 'fibo' ? FIB_NIVELES : FIBEXT_NIVELES)).join(' ; ');
      t.title = 'Niveles separados por punto y coma, por ejemplo 0 ; 0.5 ; 0.618 ; 1';
      t.addEventListener('change', () => { const n = t.value.split(/[;\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => isFinite(x)); if (n.length) modificar(() => { d.niveles = n; }); });
      caja.appendChild(campo('Niveles', t));
    }
    if (d.tipo === 'larga' || d.tipo === 'corta') {
      const r = riesgoPos(d);
      const info = document.createElement('span'); info.className = 'mini'; info.textContent = `Entrada ${f2(r.ent)} · SL ${f2(d.sl)} · TP ${f2(d.tp)} · R:R ${r.rr.toFixed(2)}`;
      caja.appendChild(info);
      const b = document.createElement('button'); b.textContent = 'Colocar como orden'; b.title = 'Crea la orden en el simulador con esta entrada, SL y TP (limit o stop según el precio actual; a mercado si coincide)';
      b.addEventListener('click', () => { if (r.slDist <= 0 || r.tpDist <= 0) { aviso('Revisá el SL y el TP de la herramienta.'); return; } R.colocarOrden({ dir: r.dir, precio: r.ent, tipo: 'auto', slPrecio: d.sl, tpPrecio: d.tp, etiqueta: 'Herramienta de posición' }); });
      caja.appendChild(b);
    }
    const acciones = document.createElement('div'); acciones.className = 'botones';
    const bl = document.createElement('button'); bl.textContent = d.bloqueado ? 'Desbloquear' : 'Bloquear'; bl.addEventListener('click', () => { modificar(() => { d.bloqueado = !d.bloqueado; }); renderProps(); });
    const cl = document.createElement('button'); cl.textContent = 'Clonar'; cl.addEventListener('click', () => clonar(d.id));
    const oc = document.createElement('button'); oc.textContent = 'Ocultar'; oc.addEventListener('click', () => { modificar(() => { d.oculto = true; }); seleccionar(null); });
    const br = document.createElement('button'); br.textContent = 'Borrar'; br.className = 'peligro'; br.addEventListener('click', () => borrar(d.id));
    acciones.append(bl, cl, oc, br);
    caja.appendChild(acciones);
  }
  function irAlDibujo(d) {
    const L = LDeT(d.pts[0].t);
    if (L == null) return;
    const ts = R.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    const ancho = r ? r.to - r.from : 120;
    ts.setVisibleLogicalRange({ from: L - ancho / 2, to: L + ancho / 2 });
  }
  function renderObjetos() {
    const ul = $('obj-dib');
    if (!ul) return;
    ul.replaceChildren();
    const l = lista();
    $('obj-dib-vacio').hidden = l.length > 0;
    for (const d of l.slice().reverse()) {
      const li = document.createElement('li');
      if (d.id === seleccion) li.className = 'sel';
      const n = document.createElement('button'); n.className = 'obj-nombre';
      const sw = document.createElement('i'); sw.style.background = d.color || HERR[d.tipo].color;
      const txt = document.createElement('span'); txt.textContent = HERR[d.tipo].nombre + (d.texto ? ' · ' + d.texto : '') + ' · ' + R.textoHora(d.pts[0].t, false);
      n.append(sw, txt);
      n.addEventListener('click', () => { if (d.oculto) { d.oculto = false; R.guardarPronto(); } seleccionar(d.id); irAlDibujo(d); });
      const v = document.createElement('button'); v.textContent = d.oculto ? 'Mostrar' : 'Ocultar'; v.addEventListener('click', () => { d.oculto = !d.oculto; if (d.oculto && seleccion === d.id) seleccion = null; cambio(); });
      const b = document.createElement('button'); b.textContent = d.bloqueado ? 'Bloqueado' : 'Borrar'; b.disabled = !!d.bloqueado; b.addEventListener('click', () => borrar(d.id));
      li.append(n, v, b);
      ul.appendChild(li);
    }
  }

  // Alertas de líneas horizontales durante la reproducción.
  R.ganchosVela.push((i) => {
    if (!R.sesion || i < 1) return null;
    const D = R.D;
    for (const d of lista()) {
      if (!d.alerta || d.oculto || !(d.tipo === 'horizontal' || d.tipo === 'rayoH')) continue;
      if (d.tipo === 'rayoH' && D.T[i] < d.pts[0].t) continue;
      const p = d.pts[0].p;
      const toca = D.H[i] >= p && D.L[i] <= p, antes = D.H[i - 1] >= p && D.L[i - 1] <= p;
      if (toca && !antes) return { pausar: true, motivo: `Alerta: el precio tocó ${f2(p)}${d.texto ? ' (' + d.texto + ')' : ''}` };
    }
    return null;
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.target.isContentEditable) return;
    if (document.querySelector('dialog[open]')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); deshacerUno(); return; }
    if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); rehacerUno(); return; }
    if (e.altKey && !ctrl) {
      const t = Object.keys(HERR).find((k) => HERR[k].atajo === e.code);
      if (t) { e.preventDefault(); ponerHerramienta(t); return; }
    }
    if (e.key === 'Escape') { if (enCurso) cancelarCreacion(); else if (herramienta) ponerHerramienta(null); else if (seleccion) seleccionar(null); cerrarMenu(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && seleccion) { e.preventDefault(); borrar(seleccion); }
  });

  R.on('listo', () => {
    construirBarra();
    instalarEventos();
    $('dib-borrar-si').addEventListener('click', () => { $('confirmar-dibujos').hidden = true; const antes = foto(); const quedan = lista().filter((d) => d.bloqueado); R.sesion.dibujos = quedan; guardarHistoria(antes); seleccion = null; cambio(); aviso(quedan.length ? 'Borré los dibujos (quedaron los bloqueados).' : 'Borré todos los dibujos.'); });
    $('dib-borrar-no').addEventListener('click', () => { $('confirmar-dibujos').hidden = true; });
  });
  R.on('sesion', () => { seleccion = null; enCurso = null; deshacer = []; rehacer = []; renderProps(); renderObjetos(); redibujar(); });
  R.on('pestana', (n) => { if (n === 'objetos') renderObjetos(); });
  R.on('ticket', redibujar);

  R.dibujos = { LDeT, TDeL, escalaX, yDeP, ponerHerramienta, get seleccion() { return seleccion; }, HERR };
})();
