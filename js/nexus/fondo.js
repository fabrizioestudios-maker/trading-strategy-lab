// NEXUS · NeuralNetworkBackground: fondo animado de red neuronal (solo visual).
// No analiza el mercado ni decide nada: es una representación decorativa. Vive en un canvas fijo detrás de los paneles,
// con pointer-events: none (nunca bloquea el gráfico ni los controles) y el gráfico tiene fondo opaco encima.
// - 3 capas de profundidad (lejos, medio, cerca) con nodos que derivan, enlaces por distancia, pulsos que viajan por
//   los enlaces, partículas sueltas y ondas (ripples). Paralaje suave con el puntero en escritorio.
// - Más activo mientras el replay avanza (cada vela nueva dispara un pulso y una onda).
// - Siempre activo y con intensidad ALTA (pedido de Fabrizio, 27/11/2026): no se apaga desde Ajustes.
// - Rendimiento: ~30 cuadros por segundo, DPR ≤ 1,5, cancela el requestAnimationFrame con la pestaña oculta.
//   Con «reducir movimiento» del sistema sigue animado, pero más lento y sin ondas ni partículas.
(function () {
  'use strict';
  const R = window.REP;
  const LS = (R && R.LS) || { get: (k, d) => d, set() {} };
  const COLORES = ['#22D3EE', '#2563EB', '#8B5CF6'];
  const CAPAS = [ // profundidad: escala, velocidad, alfa, distancia de enlace, paralaje
    { z: 0.45, vel: 0.05, alfa: 0.45, lim: 115, par: 6, r: [0.6, 1.1] },
    { z: 0.75, vel: 0.09, alfa: 0.7, lim: 145, par: 14, r: [0.9, 1.6] },
    { z: 1.0, vel: 0.14, alfa: 1, lim: 175, par: 26, r: [1.2, 2.2] },
  ];
  const INTENSIDAD = { baja: 0.55, media: 1, alta: 1.45 };
  const suave = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const quieto = () => false; // siempre animado
  const F = {
    c: null, g: null, w: 0, h: 0, dpr: 1, raf: 0, ultimo: 0, capas: [], pulsos: [], ondas: [], chispas: [],
    activo: true, intensidad: 'alta', px: 0, py: 0, tx: 0, ty: 0, energia: 0,
  };
  function leer() {
    F.activo = true; // siempre activo, sin importar lo que haya guardado una versión anterior
    F.intensidad = 'alta';
  }
  function azar(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function medir() {
    if (!F.c) return;
    F.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    F.w = innerWidth; F.h = innerHeight;
    F.c.width = Math.round(F.w * F.dpr); F.c.height = Math.round(F.h * F.dpr);
    const k = INTENSIDAD[F.intensidad];
    const base = Math.min(110, Math.max(24, (F.w * F.h) / 18000)) * k;
    const rnd = azar(11);
    F.capas = CAPAS.map((cfg, j) => {
      const n = Math.round(base * [1, 0.7, 0.45][j]);
      return {
        cfg,
        nodos: Array.from({ length: n }, () => ({
          x: rnd() * F.w, y: rnd() * F.h, vx: (rnd() - 0.5) * cfg.vel * 2, vy: (rnd() - 0.5) * cfg.vel * 2,
          r: cfg.r[0] + rnd() * (cfg.r[1] - cfg.r[0]), fase: rnd() * 6.283, col: COLORES[Math.floor(rnd() * 3)],
        })),
      };
    });
    F.pulsos = []; F.ondas = []; F.chispas = [];
    dibujar(performance.now(), true);
  }
  function alfa(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a < 0 ? 0 : a > 1 ? 1 : a})`;
  }
  // un pulso viaja por un enlace de la capa cercana o media
  function nuevoPulso(fuerte) {
    const capa = F.capas[fuerte ? 2 : 1 + Math.round(Math.random())];
    if (!capa || capa.nodos.length < 2) return;
    const N = capa.nodos, a = N[Math.floor(Math.random() * N.length)];
    let mejor = null, dm = capa.cfg.lim;
    for (const b of N) { if (b === a) continue; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < dm && Math.random() < 0.6) { dm = d; mejor = b; } }
    if (!mejor) return;
    F.pulsos.push({ capa, a, b: mejor, k: 0, v: (fuerte ? 0.035 : 0.018) + Math.random() * 0.012, col: fuerte ? '#22D3EE' : COLORES[Math.floor(Math.random() * 3)] });
    if (F.pulsos.length > 40) F.pulsos.shift();
  }
  function nuevaOnda(x, y, col) {
    F.ondas.push({ x, y, r: 0, max: 60 + Math.random() * 70, col: col || '#22D3EE' });
    if (F.ondas.length > 8) F.ondas.shift();
  }
  function nuevaChispa() {
    F.chispas.push({ x: Math.random() * F.w, y: F.h + 4, vy: -(0.15 + Math.random() * 0.35), vida: 1, col: COLORES[Math.floor(Math.random() * 3)] });
    if (F.chispas.length > 30) F.chispas.shift();
  }
  function jugando() { return !!(R && R.jugando); }
  function dibujar(ts, estatico) {
    const g = F.g;
    if (!g) return;
    g.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
    g.clearRect(0, 0, F.w, F.h);
    if (!F.activo) return;
    const mover = !estatico;
    const act = jugando();
    F.energia += ((act ? 1 : 0) - F.energia) * 0.04;
    F.px += (F.tx - F.px) * 0.05; F.py += (F.ty - F.py) * 0.05;
    for (const capa of F.capas) {
      const { cfg, nodos } = capa, ox = F.px * cfg.par, oy = F.py * cfg.par, lim = cfg.lim, vel = (1 + F.energia * 1.4) * (suave() ? 0.35 : 1);
      if (mover) for (const p of nodos) {
        p.x += p.vx * vel; p.y += p.vy * vel;
        if (p.x < -20 || p.x > F.w + 20) p.vx *= -1;
        if (p.y < -20 || p.y > F.h + 20) p.vy *= -1;
      }
      g.lineWidth = 0.5 + cfg.z * 0.5;
      for (let i = 0; i < nodos.length; i++) {
        const a = nodos[i];
        for (let j = i + 1; j < nodos.length; j++) {
          const b = nodos[j], dx = a.x - b.x, dy = a.y - b.y;
          if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > lim) continue;
          g.strokeStyle = alfa(a.col, (1 - d / lim) * 0.38 * cfg.alfa * (1 + F.energia * 0.6));
          g.beginPath(); g.moveTo(a.x + ox, a.y + oy); g.lineTo(b.x + ox, b.y + oy); g.stroke();
        }
      }
      for (const p of nodos) {
        const brillo = (0.6 + 0.3 * Math.sin(ts / 1500 + p.fase)) * cfg.alfa;
        const x = p.x + ox, y = p.y + oy;
        if (cfg.z >= 0.75) { g.fillStyle = alfa(p.col, brillo * 0.14); g.beginPath(); g.arc(x, y, p.r * 4.5 * cfg.z, 0, 6.283); g.fill(); }
        g.fillStyle = alfa(p.col, brillo);
        g.beginPath(); g.arc(x, y, p.r * cfg.z + 0.4, 0, 6.283); g.fill();
      }
    }
    if (estatico || suave()) return;
    // pulsos por los enlaces
    const k = INTENSIDAD[F.intensidad];
    if (Math.random() < (0.08 + F.energia * 0.16) * k) nuevoPulso(false);
    for (const p of F.pulsos) {
      p.k += p.v * (1 + F.energia);
      const { cfg } = p.capa, ox = F.px * cfg.par, oy = F.py * cfg.par;
      const x = p.a.x + (p.b.x - p.a.x) * p.k + ox, y = p.a.y + (p.b.y - p.a.y) * p.k + oy;
      g.fillStyle = alfa(p.col, 0.18); g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
      g.fillStyle = alfa(p.col, 0.9); g.beginPath(); g.arc(x, y, 1.6, 0, 6.283); g.fill();
      if (p.k >= 1 && Math.random() < 0.35) nuevaOnda(p.b.x + ox, p.b.y + oy, p.col);
    }
    F.pulsos = F.pulsos.filter((p) => p.k < 1);
    // ondas
    for (const o of F.ondas) {
      o.r += 0.9 + F.energia * 0.8;
      g.strokeStyle = alfa(o.col, 0.28 * (1 - o.r / o.max)); g.lineWidth = 1;
      g.beginPath(); g.arc(o.x, o.y, o.r, 0, 6.283); g.stroke();
    }
    F.ondas = F.ondas.filter((o) => o.r < o.max);
    // partículas que suben despacio
    if (Math.random() < 0.04 * k) nuevaChispa();
    for (const s of F.chispas) {
      s.y += s.vy * (1 + F.energia); s.vida -= 0.002;
      g.fillStyle = alfa(s.col, 0.5 * s.vida); g.beginPath(); g.arc(s.x, s.y, 0.9, 0, 6.283); g.fill();
    }
    F.chispas = F.chispas.filter((s) => s.vida > 0 && s.y > -4);
  }
  function pedir() { if (!F.raf && F.activo && !document.hidden && !quieto()) F.raf = requestAnimationFrame(bucle); }
  function cancelar() { if (F.raf) cancelAnimationFrame(F.raf); F.raf = 0; }
  function bucle(ts) {
    F.raf = 0;
    if (!F.activo || document.hidden || quieto()) return;
    if (ts - F.ultimo >= 33) { F.ultimo = ts; dibujar(ts, false); }
    pedir();
  }
  function aplicar() {
    cancelar();
    if (!F.activo) { dibujar(0, true); return; }
    if (quieto()) { dibujar(performance.now(), true); return; }
    pedir();
  }
  function iniciar() {
    F.c = document.getElementById('fondo-neuronal');
    if (!F.c || !F.c.getContext) return;
    F.g = F.c.getContext('2d');
    leer();
    medir();
    let tm = 0;
    addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(medir, 150); });
    document.addEventListener('visibilitychange', () => (document.hidden ? cancelar() : aplicar()));
    if (window.matchMedia) { const mq = matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) mq.addEventListener('change', aplicar); }
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; F.tx = e.clientX / Math.max(1, F.w) - 0.5; F.ty = e.clientY / Math.max(1, F.h) - 0.5; }, { passive: true });
    if (R && R.on) R.on('avance', () => { if (!F.activo || suave()) return; nuevoPulso(true); const c = F.capas[2]; if (c && c.nodos.length && Math.random() < 0.5) { const p = c.nodos[Math.floor(Math.random() * c.nodos.length)]; nuevaOnda(p.x, p.y); } });
    aplicar();
  }
  window.NXFONDO = {
    get activo() { return F.activo; },
    get intensidad() { return F.intensidad; },
    get reducido() { return quieto(); },
    activar() { F.activo = true; aplicar(); }, // siempre activo
    ponerIntensidad() { F.intensidad = 'alta'; }, // siempre en alta
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
