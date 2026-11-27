/* Estrategias: probador (como el Strategy Tester de TradingView), ejecución automática dentro del reproductor
 * y editor de estrategias propias en JavaScript (con traducción desde Pine Script usando Claude, si está disponible). */
(() => {
  'use strict';
  const R = window.REP;
  const M = R.M;
  const { $, LS, aviso, f2, sig, css } = R;
  const P = (k, n, def, extra = {}) => Object.assign({ k, n, def, tipo: typeof def === 'boolean' ? 'bool' : 'num' }, extra);
  const SEL = (k, n, def, opciones) => ({ k, n, def, tipo: 'sel', opciones });
  const TF_OPC = [[1, '1 minuto'], [3, '3 minutos'], [5, '5 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [240, '4 horas'], [1440, 'Diario']];

  const PLANTILLAS = {
    tv: `// Formato TradingView del reproductor: se escribe como Pine Script y corre en el mismo motor que TradingView.
// Cruce de EMAs: compra cuando la EMA 9 cruza arriba de la EMA 21 y vende al revés. SL en el mínimo o máximo de 10 velas, TP 2R.
function preparar(ctx, p) {
  const { close, high, low, ta, strategy } = ctx;
  const rapida = ta.ema(close, 9), lenta = ta.ema(close, 21), minimo = ta.lowest(low, 10), maximo = ta.highest(high, 10);
  return (i) => {
    if (strategy.position_size !== 0) return;
    if (ta.crossover(rapida, lenta, i)) {
      strategy.entry('Compra', 'long');
      strategy.exit('Salida', 'Compra', { stop: minimo[i], rr: 2 });
    } else if (ta.crossunder(rapida, lenta, i)) {
      strategy.entry('Venta', 'short');
      strategy.exit('Salida', 'Venta', { stop: maximo[i], rr: 2 });
    }
  };
}`,
    ema: `// Cruce de medias: compra cuando la EMA 9 cruza hacia arriba la EMA 21 y vende al revés.
// SL en el mínimo (o máximo) de las últimas 10 velas. TP a 2R.
function estrategia(v, i, ta, estado) {
  const rapida = ta.ema(9), lenta = ta.ema(21);
  if (ta.cruzaArriba(rapida, lenta)) return { lado: 'compra', sl: ta.minimo(10), rr: 2, nota: 'Cruce alcista' };
  if (ta.cruzaAbajo(rapida, lenta)) return { lado: 'venta', sl: ta.maximo(10), rr: 2, nota: 'Cruce bajista' };
  return null;
}`,
    asia: `// Ruptura del rango de Asia (20:00 a 00:00 de Nueva York).
// Entre las 02:00 y las 11:00 opera la primera vela que cierra fuera del rango. SL en la mitad del rango, TP a 2R.
function estrategia(v, i, ta, estado) {
  const m = v.minutoNY(i);
  if (m >= 1200) {
    if (!estado.enAsia) { estado.enAsia = true; estado.alto = -Infinity; estado.bajo = Infinity; estado.operado = false; }
    estado.alto = Math.max(estado.alto, v.h[i]);
    estado.bajo = Math.min(estado.bajo, v.l[i]);
    return null;
  }
  estado.enAsia = false;
  if (estado.operado || !isFinite(estado.alto) || m < 120 || m >= 660) return null;
  const mitad = (estado.alto + estado.bajo) / 2;
  if (v.c[i] > estado.alto) { estado.operado = true; return { lado: 'compra', sl: mitad, rr: 2, nota: 'Ruptura Asia arriba' }; }
  if (v.c[i] < estado.bajo) { estado.operado = true; return { lado: 'venta', sl: mitad, rr: 2, nota: 'Ruptura Asia abajo' }; }
  return null;
}`,
    vacia: `// Escribí tu estrategia acá. Se ejecuta al cierre de cada vela (i = índice de la vela).
function estrategia(v, i, ta, estado) {
  return null;
}`,
  };

  const MOTOR_OPC = [['lab', 'Reglas del laboratorio (el peor recorrido dentro del minuto)'], ['lupa', 'Como TradingView, con lupa de barras de 1 minuto'], ['velas', 'Como TradingView, sin lupa (solo las velas del gráfico)']];
  // Solo las mejores estrategias de trading-strategy-lab (js/estrategias_tv.js), más la estrategia propia.
  const ESTR = {};
  const convertir = (q) => (Array.isArray(q[3]) ? SEL(q[0], q[1], q[2], q[3]) : P(q[0], q[1], q[2], typeof q[2] === 'number' ? { min: 0, paso: Number.isInteger(q[2]) ? 1 : 0.05 } : {}));
  for (const s of (window.TVEST ? window.TVEST.LISTA : [])) {
    ESTR[s.id] = { nombre: s.nombre, desc: s.desc, tv: true, calentamiento: (s.calentamientoDias || 30) * 86400000, params: [...s.params.map(convertir), SEL('motor', 'Ejecución de las órdenes', 'lab', MOTOR_OPC)], tf: (p) => Number(typeof s.tf === 'function' ? s.tf(p) : s.tf) };
  }
  ESTR.propia = {
    nombre: 'Mi estrategia (código propio o traducida de Pine)', gen: 'propia',
    desc: 'Tu propia estrategia. En el formato TradingView del reproductor (function preparar) se escribe como Pine Script y corre en el mismo motor que TradingView; el botón Pine la traduce desde TradingView. También acepta el formato anterior (function estrategia).',
    params: [SEL('tf', 'Temporalidad', 5, TF_OPC), P('rr', 'R:R si la señal no lo dice (formato anterior)', 2, { min: 0.5, max: 20, paso: 0.1 }), SEL('motor', 'Ejecución de las órdenes (formato TradingView)', 'lupa', MOTOR_OPC)],
    tf: (p) => p.tf,
  };
  const esTVCodigo = (c) => !!(window.TV && window.TV.esFormatoTV(c));
  const compilarCodigo = (c) => (esTVCodigo(c) ? window.TV.compilar(c) : M.compilarPropia(c));
  const usaTV = (id) => (ESTR[id] && ESTR[id].tv) || (id === 'propia' && esTVCodigo(cfg.codigo));
  const scriptDe = (id, p) => (id === 'propia' ? { tf: Number(p.tf), preparar: window.TV.compilar(cfg.codigo) } : window.TVEST.porId[id]);
  function opcionesBroker(p) {
    const rt = (Number(cfg.costos.spread) || 0) + (Number(cfg.costos.desliz) || 0), motor = p.motor || 'lupa';
    return { comisionPct: cfg.costos.proporcional ? (rt / 4000 / 2) * 100 : 0, comisionUnidad: cfg.costos.proporcional ? 0 : rt / 2, modo: motor === 'lab' ? 'lab' : 'tv', lupa: motor !== 'velas', mintick: 0.01, riesgoPct: cfg.riesgo, capital: cfg.capital };
  }
  function paramsMotor(id, p, codigo) {
    if (id === 'bias') return { tf: p.tf, htf: p.htf, rrMin: p.rrMin, cfg: { fZona: p.fZona, fAlinear: p.fAlinear, fHtf: p.fHtf, entradaFib: p.entradaFib, tpObjetivo: p.tpObjetivo } };
    if (id === 'sbti') return { tf: 1, rr: p.rr, spread: p.spread, slMin: p.slMin };
    if (id === 'propia') return { tf: p.tf, rr: p.rr, codigo };
    if (id === 'setupA') { const [a, b] = String(p.fib).split('-').map(Number); return Object.assign({}, p, { fibMin: a, fibMax: b }); }
    return Object.assign({}, p);
  }
  const GEN = { propia: M.senalesPropia };

  // ---------- configuración persistente ----------
  const defaults = (id) => Object.fromEntries(ESTR[id].params.map((q) => [q.k, q.def]));
  let cfg = LS.get('estrategiaCfg', null) || {};
  cfg = Object.assign({ id: 'oro_bb_d1', params: {}, costos: { spread: 0.4, desliz: 0.1, proporcional: true }, capital: 10000, riesgo: 1, maxMin: 0, codigo: PLANTILLAS.tv, rango: null, enGrafico: true, vivo: false, modoVivo: 'auto' }, cfg);
  if (!ESTR[cfg.id]) cfg.id = 'oro_bb_d1'; // las estrategias anteriores se retiraron del probador
  for (const id of Object.keys(ESTR)) cfg.params[id] = Object.assign(defaults(id), cfg.params[id] || {});
  cfg.vivo = false; // la ejecución automática siempre arranca apagada
  const guardarCfg = () => { LS.set('estrategiaCfg', cfg); if (R.sesion) { R.sesion.codigoPropio = cfg.codigo; R.guardarPronto(); } };

  // ---------- trabajador en segundo plano ----------
  let trabajador; // undefined = sin probar, null = no disponible
  async function obtenerTrabajador() {
    if (trabajador !== undefined) return trabajador;
    try {
      const src = (await (await fetch('js/motores.js')).text()) + '\n' + (await (await fetch('js/tv.js')).text()) + '\n' + (await (await fetch('js/estrategias_tv.js')).text());
      const manejador = `
self.onmessage = (e) => {
  const d = e.data;
  if (d.ping) { self.postMessage({ pong: true }); return; }
  try {
    const X = self.REPM;
    const v = (x) => new Float64Array(x.b, x.o, x.n);
    const MM = { T: v(d.M.T), O: v(d.M.O), H: v(d.M.H), L: v(d.M.L), C: v(d.M.C) };
    if (d.tv) {
      const sc = d.codigo ? { tf: Number(d.p.tf), preparar: self.TV.compilar(d.codigo) } : self.TVEST.porId[d.id];
      const r = self.TV.correr(MM, sc, d.p, d.op);
      self.postMessage({ ok: true, ops: r.ops, n: r.n });
      return;
    }
    const f = { propia: X.senalesPropia }[d.gen];
    const s = f(MM, d.p);
    const ops = X.simular(MM, s, d.costos);
    self.postMessage({ ok: true, ops, n: s.length });
  } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err) }); }
};`;
      const url = URL.createObjectURL(new Blob([src, '\n', manejador], { type: 'text/javascript' }));
      const w = new Worker(url);
      const ok = await new Promise((res) => {
        const t = setTimeout(() => res(false), 4000);
        w.onmessage = (e) => { if (e.data && e.data.pong) { clearTimeout(t); res(true); } };
        w.onerror = () => { clearTimeout(t); res(false); };
        w.postMessage({ ping: true });
      });
      trabajador = ok ? w : null;
      if (!ok) w.terminate();
    } catch { trabajador = null; }
    return trabajador;
  }
  function enTrabajador(w, msg, transfer) {
    return new Promise((res, rej) => {
      w.onmessage = (e) => (e.data.ok ? res(e.data) : rej(new Error(e.data.error)));
      w.onerror = (e) => rej(new Error(e.message || 'error en el cálculo'));
      w.postMessage(msg, transfer);
    });
  }

  // ---------- probador ----------
  let resultado = null; // {ops, desde, hasta, id, nombre, stats}
  let corriendo = false;
  function rangoActual() {
    const meses = R.INDICE.meses;
    const fin = meses[meses.length - 1].hasta + 60000;
    const r = cfg.rango || { desde: fin - 5 * 365 * 86400000, hasta: fin }; // por defecto los últimos 5 años
    return { desde: Math.max(meses[0].desde, r.desde), hasta: Math.min(fin, r.hasta) };
  }
  async function probar() {
    if (corriendo) return;
    const id = cfg.id, p = cfg.params[id];
    if (id === 'propia') { try { compilarCodigo(cfg.codigo); } catch (e) { mostrarError('Tu código tiene un error: ' + e.message); return; } }
    const conTV = usaTV(id);
    const { desde, hasta } = rangoActual();
    if (!(hasta > desde)) { mostrarError('El rango de fechas no es válido.'); return; }
    corriendo = true;
    $('pr-probar').disabled = true;
    mostrarError('');
    const prog = $('pr-progreso');
    prog.hidden = false;
    const estado = (txt, x) => { $('pr-estado').textContent = txt; if (x != null) $('pr-barra').value = x; };
    try {
      const calentamiento = ESTR[id].tv ? ESTR[id].calentamiento : conTV ? 60 * 86400000 : 5 * 86400000;
      estado('Cargando datos…', 0);
      const datos = await R.cargarRango(desde - calentamiento, hasta, (x, mes) => estado('Cargando datos ' + mes + '…', x * 0.7));
      estado('Calculando la estrategia…', 0.75);
      // Stop mínimo = el spread: una operación con el stop dentro del spread no se puede ejecutar.
      const costos = { spread: cfg.costos.spread, desliz: cfg.costos.desliz, proporcional: cfg.costos.proporcional, maxMin: cfg.maxMin, riesgoMin: cfg.costos.spread };
      const pm = paramsMotor(id, p, cfg.codigo);
      const w = await obtenerTrabajador();
      let r;
      const t0 = performance.now();
      const pTV = Object.assign({}, p, { _desde: desde }), op = opcionesBroker(p);
      if (w) {
        const parte = (a) => ({ b: a.buffer, o: a.byteOffset, n: a.length });
        const enviar = { T: parte(datos.T), O: parte(datos.O), H: parte(datos.H), L: parte(datos.L), C: parte(datos.C) };
        const msg = conTV ? { M: enviar, tv: true, id, codigo: id === 'propia' ? cfg.codigo : null, p: pTV, op } : { M: enviar, gen: ESTR[id].gen, p: pm, costos };
        r = await enTrabajador(w, msg, [...new Set([datos.T.buffer, datos.O.buffer, datos.H.buffer, datos.L.buffer, datos.C.buffer])]);
      } else if (conTV) {
        await new Promise((res) => setTimeout(res, 30));
        const x = window.TV.correr(datos, scriptDe(id, p), pTV, op);
        r = { ops: x.ops, n: x.n };
      } else {
        await new Promise((res) => setTimeout(res, 30));
        const s = GEN[ESTR[id].gen](datos, pm);
        r = { ops: M.simular(datos, s, costos), n: s.length };
      }
      const ops = r.ops.filter((o) => o.tEntrada >= desde && o.tEntrada < hasta);
      for (const o of ops) o.ventana = R.ventanaSB(o.tEntrada);
      resultado = { ops, desde, hasta, id, nombre: ESTR[id].nombre, senales: r.n, p: JSON.parse(JSON.stringify(p)), costos, seg: (performance.now() - t0) / 1000 };
      resultado.stats = estadisticas(ops);
      estado(`Listo: ${ops.length} operaciones (${resultado.seg.toFixed(1)} s${w ? '' : ', sin segundo plano'})`, 1);
      renderResultados();
      redibujar();
    } catch (e) {
      mostrarError('No se pudo completar la prueba: ' + e.message);
      estado('', 0);
    } finally {
      corriendo = false;
      $('pr-probar').disabled = false;
      setTimeout(() => { prog.hidden = true; }, 2500);
    }
  }
  function mostrarError(t) { const e = $('pr-error'); e.textContent = t; e.hidden = !t; }

  function estadisticas(ops) {
    const riesgo = cfg.riesgo / 100, cap0 = cfg.capital;
    let eq = cap0, pico = cap0, ddUsd = 0, ddPct = 0, rAcum = 0, picoR = 0, ddR = 0, racha = 0, peorRacha = 0, rachaG = 0, mejorRacha = 0;
    const curva = [cap0];
    for (const o of ops) {
      o.usd = eq * riesgo * o.r;
      eq += o.usd;
      o.saldo = eq;
      curva.push(eq);
      pico = Math.max(pico, eq); ddUsd = Math.max(ddUsd, pico - eq); ddPct = Math.max(ddPct, (pico - eq) / pico);
      rAcum += o.r; picoR = Math.max(picoR, rAcum); ddR = Math.max(ddR, picoR - rAcum);
      if (o.r > 0) { rachaG++; racha = 0; } else { racha++; rachaG = 0; }
      peorRacha = Math.max(peorRacha, racha); mejorRacha = Math.max(mejorRacha, rachaG);
    }
    const grupo = (fn) => { const g = new Map(); for (const o of ops) { const k = fn(o); if (!g.has(k)) g.set(k, []); g.get(k).push(o); } return [...g.entries()].map(([k, xs]) => ({ k, ...basico(xs) })); };
    const anio = (o) => new Date(o.tEntrada).getUTCFullYear();
    return {
      ...basico(ops), neto: eq - cap0, netoPct: (eq / cap0 - 1) * 100, ddUsd, ddPct: ddPct * 100, ddR, peorRacha, mejorRacha, curva,
      porAnio: grupo(anio).sort((a, b) => a.k - b.k),
      porVentana: grupo((o) => o.ventana).sort((a, b) => String(a.k).localeCompare(String(b.k))),
      porLado: grupo((o) => (o.dir === 1 ? 'Compras' : 'Ventas')),
      porMes: grupo((o) => { const d = new Date(o.tEntrada); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; }),
      porDia: grupo((o) => new Date(o.tEntrada + R.offNY(o.tEntrada) * 60000).getUTCDay()).sort((a, b) => a.k - b.k),
    };
  }
  function basico(xs) {
    const n = xs.length, g = xs.filter((o) => o.r > 0), pr = xs.filter((o) => o.r <= 0);
    const sg = g.reduce((a, o) => a + o.r, 0), sp = -pr.reduce((a, o) => a + o.r, 0);
    return { n, acierto: n ? g.length / n : 0, rTotal: sg - sp, rProm: n ? (sg - sp) / n : 0, pf: sp > 0 ? sg / sp : null, ganProm: g.length ? sg / g.length : 0, perdProm: pr.length ? sp / pr.length : 0, minProm: n ? xs.reduce((a, o) => a + o.min, 0) / n : 0, usd: xs.reduce((a, o) => a + (o.usd || 0), 0), tp: xs.filter((o) => o.motivo === 'TP').length };
  }

  // ---------- resultados ----------
  const pct = (x, d = 1) => (x * 100).toFixed(d).replace('.', ',') + '%';
  const num = (x, d = 2) => (x == null || !isFinite(x) ? '—' : x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const usd = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + ' USD';
  let pagina = 1;
  function tarjeta(etq, valor, clase, sub) {
    const d = document.createElement('div'); d.className = 'stat';
    const s = document.createElement('span'); s.textContent = etq;
    const b = document.createElement('b'); b.textContent = valor; if (clase) b.className = clase;
    d.append(s, b);
    if (sub) { const m = document.createElement('small'); m.textContent = sub; d.appendChild(m); }
    return d;
  }
  function tablaGrupos(filas, titulo, fmtK) {
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th></th><th>Ops.</th><th>Acierto</th><th>R total</th><th>R prom.</th><th>F. ben.</th><th>USD</th></tr></thead>';
    t.querySelector('th').textContent = titulo;
    const tb = document.createElement('tbody');
    for (const f of filas) {
      const tr = tb.insertRow();
      [fmtK ? fmtK(f.k) : f.k, f.n, pct(f.acierto), sig(f.rTotal, 1), sig(f.rProm, 3), f.pf == null ? '—' : f.pf.toFixed(2), usd(f.usd)].forEach((c, j) => { const td = tr.insertCell(); td.textContent = String(c); if (j >= 3 && j !== 5) td.className = f.rTotal >= 0 ? 'pnl-pos' : 'pnl-neg'; });
    }
    t.appendChild(tb);
    const w = document.createElement('div'); w.className = 'tabla-scroll'; w.appendChild(t);
    return w;
  }
  function renderResultados() {
    const r = resultado;
    $('pr-vacio').hidden = !!r;
    $('pr-res').hidden = !r;
    if (!r) return;
    const s = r.stats;
    $('pr-titulo').textContent = `${r.nombre} · ${R.textoHora(r.desde, false).slice(0, 10)} a ${R.textoHora(r.hasta - 60000, false).slice(0, 10)}`;
    const cards = $('pr-cards');
    const ganadas = r.ops.filter((o) => o.r > 0).length; // misma regla que basico(): R > 0 es ganadora
    cards.replaceChildren(
      tarjeta('Beneficio neto', usd(s.neto), s.neto >= 0 ? 'pnl-pos' : 'pnl-neg', sig(s.netoPct, 1) + '% · riesgo ' + cfg.riesgo + '%'),
      tarjeta('Operaciones', String(s.n), '', `${r.senales} señales`),
      tarjeta('Ganadoras / perdedoras', `${ganadas} / ${s.n - ganadas}`, '', `R > 0 gana · R ≤ 0 pierde (incluye BE)`),
      tarjeta('Acierto', pct(s.acierto), '', `${s.tp} llegaron al TP`),
      tarjeta('Factor de beneficio', s.pf == null ? '—' : s.pf.toFixed(2), s.pf != null && s.pf >= 1 ? 'pnl-pos' : 'pnl-neg'),
      tarjeta('Expectativa', sig(s.rProm, 3) + ' R', s.rProm >= 0 ? 'pnl-pos' : 'pnl-neg', 'por operación · R total ' + sig(s.rTotal, 1)),
      tarjeta('Drawdown máximo', num(s.ddPct, 1) + '%', 'pnl-neg', num(s.ddR, 1) + ' R · ' + usd(-s.ddUsd)),
      tarjeta('Peor racha', s.peorRacha + ' pérdidas', '', 'mejor: ' + s.mejorRacha + ' ganadoras'),
      tarjeta('Duración promedio', s.minProm >= 60 ? (s.minProm / 60).toFixed(1).replace('.', ',') + ' h' : Math.round(s.minProm) + ' min', ''),
    );
    R.curvaSVG($('pr-curva'), s.curva, 120);
    $('pr-curva-ini').textContent = usd(0).replace('+0', num(cfg.capital, 0));
    $('pr-curva-fin').textContent = num(s.curva[s.curva.length - 1], 0) + ' USD';
    const rend = $('pr-rend');
    rend.replaceChildren(tablaGrupos(s.porLado, 'Lado'), tablaGrupos(s.porVentana, 'Ventana'), tablaGrupos(s.porAnio, 'Año'), tablaGrupos(s.porDia, 'Día (NY)', (k) => ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][k]));
    renderMeses(s);
    pagina = 1;
    renderOps();
  }
  function renderMeses(s) {
    const cont = $('pr-meses');
    cont.replaceChildren();
    if (!s.porMes.length) return;
    const t = document.createElement('table'); t.className = 'meses';
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const th = t.createTHead().insertRow();
    for (const x of ['Año', ...meses, 'Total']) { const c = document.createElement('th'); c.textContent = x; th.appendChild(c); }
    const mapa = new Map(s.porMes.map((f) => [f.k, f]));
    const tb = t.createTBody();
    for (const a of s.porAnio) {
      const tr = tb.insertRow();
      tr.insertCell().textContent = a.k;
      for (let m = 1; m <= 12; m++) {
        const f = mapa.get(a.k * 100 + m), td = tr.insertCell();
        if (!f) { td.textContent = ''; continue; }
        td.textContent = sig(f.rTotal, 1);
        const int = Math.min(1, Math.abs(f.rTotal) / 10);
        td.style.background = f.rTotal >= 0 ? `rgba(63,207,142,${0.08 + 0.4 * int})` : `rgba(255,92,92,${0.08 + 0.4 * int})`;
        td.title = `${f.n} operaciones · acierto ${pct(f.acierto)}`;
      }
      const tot = tr.insertCell(); tot.textContent = sig(a.rTotal, 1); tot.className = a.rTotal >= 0 ? 'pnl-pos' : 'pnl-neg';
    }
    cont.appendChild(t);
  }
  function renderOps() {
    const r = resultado;
    const tb = $('pr-ops');
    tb.replaceChildren();
    if (!r) return;
    const lista = r.ops.slice().reverse().slice(0, pagina * 200);
    for (const o of lista) {
      const tr = tb.insertRow();
      const k = r.ops.indexOf(o) + 1;
      const celdas = [k, o.dir === 1 ? 'Compra' : 'Venta', o.etiqueta || o.ventana, R.textoHora(o.tEntrada, false), f2(o.entrada), R.textoHora(o.tSalida, false), f2(o.salida), o.motivo, sig(o.r), usd(o.usd)];
      celdas.forEach((c, j) => { const td = tr.insertCell(); td.textContent = String(c); if (j >= 8) td.className = o.r > 0 ? 'pnl-pos' : 'pnl-neg'; });
      const td = tr.insertCell();
      const b = document.createElement('button'); b.className = 'mini-btn'; b.textContent = 'Ver'; b.title = 'Ir a esta operación en el reproductor';
      b.addEventListener('click', () => verOperacion(o));
      td.appendChild(b);
    }
    $('pr-mas').hidden = r.ops.length <= pagina * 200;
  }
  async function verOperacion(o) {
    if (R.posicion || R.pendiente) { aviso('Cerrá la posición o cancelá la orden antes de saltar a otra fecha.'); return; }
    const tfE = ESTR[resultado.id].tf(resultado.p);
    if (R.tf !== tfE) await R.cambiarTf(tfE);
    cfg.enGrafico = true; $('pr-engrafico').checked = true;
    const ok = await R.irA(o.tEntrada - R.tfMs() * 40);
    if (ok) {
      try { document.querySelector('.grafico').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch { /* sin desplazamiento */ }
      aviso('Avanzá con → o ▶ para ver cómo se desarrolla la operación.', 5000);
    }
  }
  function csvOps() {
    const r = resultado;
    const filas = [['n', 'lado', 'senal', 'ventana', 'entrada_' + R.zona, 'precio_entrada', 'sl', 'tp', 'salida_' + R.zona, 'precio_salida', 'motivo', 'r', 'usd', 'saldo', 'minutos']];
    r.ops.forEach((o, k) => filas.push([k + 1, o.dir === 1 ? 'compra' : 'venta', o.etiqueta || '', o.ventana, R.textoHora(o.tEntrada, false), f2(o.entrada), f2(o.sl), f2(o.tp), R.textoHora(o.tSalida, false), f2(o.salida), o.motivo, o.r.toFixed(3), o.usd.toFixed(2), o.saldo.toFixed(2), o.min]));
    return filas.map((f) => f.map(R.csvCampo).join(',')).join('\n');
  }
  function textoResumen() {
    const r = resultado, s = r.stats;
    const p = Object.entries(r.p).map(([k, v]) => `${k}=${v}`).join(', ');
    return [`${r.nombre} (${p})`, `Período: ${R.textoHora(r.desde, false).slice(0, 10)} a ${R.textoHora(r.hasta - 60000, false).slice(0, 10)}`,
      `Costos: spread ${r.costos.spread} + deslizamiento ${r.costos.desliz} USD${r.costos.proporcional ? ' (a precio 4000, proporcional)' : ''}`,
      `Operaciones: ${s.n} · Acierto: ${pct(s.acierto)} · R total: ${sig(s.rTotal, 1)} · R promedio: ${sig(s.rProm, 3)} · Factor de beneficio: ${s.pf == null ? '—' : s.pf.toFixed(2)}`,
      `Capital ${cfg.capital} USD con riesgo ${cfg.riesgo}%: ${usd(s.neto)} (${sig(s.netoPct, 1)}%) · Drawdown máximo ${num(s.ddPct, 1)}%`,
      ...s.porAnio.map((a) => `  ${a.k}: ${a.n} ops · ${pct(a.acierto)} · ${sig(a.rTotal, 1)} R`)].join('\n');
  }

  // ---------- operaciones del probador en el gráfico ----------
  let ru = null;
  const redibujar = () => { if (ru) ru(); };
  function pintar(ctx, w) {
    if (!resultado || !cfg.enGrafico || !R.velas.length || R.cur < 0) return;
    const DB = R.dibujos, E = DB.escalaX();
    if (!E) return;
    const ahora = R.D.T[R.cur] + 60000;
    const v = R.velas, t0 = v[0]._b;
    const ops = resultado.ops;
    let a = 0, z = ops.length;
    while (a < z) { const m = (a + z) >> 1; if (ops[m].tSalida < t0) a = m + 1; else z = m; }
    ctx.font = '10px ' + css('--fuente');
    for (let k = a; k < ops.length; k++) {
      const o = ops[k];
      if (o.tEntrada >= ahora) break;
      const x1 = E.x0 + DB.LDeT(R.cubeta(o.tEntrada)) * E.esp, y1 = DB.yDeP(o.entrada);
      if (y1 == null || x1 > w + 10) continue;
      const cerrada = o.tSalida <= ahora;
      const color = o.dir === 1 ? '#3FCF8E' : '#FF5C5C';
      if (!cerrada) {
        const x2 = E.x0 + DB.LDeT(R.cubeta(ahora - 60000)) * E.esp;
        ctx.setLineDash([3, 3]);
        for (const [pp, c] of [[o.sl, '#FF5C5C'], [o.tp, '#3FCF8E']]) { const y = DB.yDeP(pp); if (y == null) continue; ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(Math.max(x2, x1 + 20), y); ctx.stroke(); }
        ctx.setLineDash([]);
      } else {
        const x2 = E.x0 + DB.LDeT(R.cubeta(o.tSalida - 60000)) * E.esp, y2 = DB.yDeP(o.salida);
        if (y2 != null) {
          ctx.setLineDash([4, 3]); ctx.strokeStyle = o.r > 0 ? '#3FCF8E' : '#FF5C5C'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = o.r > 0 ? '#3FCF8E' : '#FF5C5C';
          ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(sig(o.r, 1) + 'R', x2 + 5, y2);
        }
      }
      ctx.fillStyle = color;
      const s = o.dir === 1 ? 1 : -1, ym = y1 + 10 * s;
      ctx.beginPath(); ctx.moveTo(x1, y1 + 2 * s); ctx.lineTo(x1 - 5, ym + 4 * s); ctx.lineTo(x1 + 5, ym + 4 * s); ctx.closePath(); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = s === 1 ? 'top' : 'bottom';
      ctx.fillText(o.dir === 1 ? 'Compra' : 'Venta', x1, ym + 6 * s);
    }
  }
  const vista = { zOrder: () => 'top', renderer: () => ({ draw: (t) => t.useMediaCoordinateSpace(({ context, mediaSize }) => pintar(context, mediaSize.width)) }) };
  class Capa { attached(p) { ru = p.requestUpdate; } detached() { ru = null; } updateAllViews() {} paneViews() { return [vista]; } }
  R.on('serie', (s) => s.attachPrimitive(new Capa()));
  R.on('velas', redibujar);

  // ---------- estrategia en vivo dentro del reproductor ----------
  let senalesVivo = [], idxVivo = 0, calculandoVivo = false, senalAviso = null;
  function calcularVivo() {
    if (!cfg.vivo || calculandoVivo) return;
    calculandoVivo = true;
    setTimeout(() => {
      try {
        const D = R.D, MM = { T: D.T, O: D.O, H: D.H, L: D.L, C: D.C }, p = cfg.params[cfg.id];
        const s = usaTV(cfg.id) ? window.TV.correr(MM, scriptDe(cfg.id, p), p, opcionesBroker(p)).senales : GEN[ESTR[cfg.id].gen](MM, paramsMotor(cfg.id, p, cfg.codigo));
        senalesVivo = s.sort((a, b) => a.t - b.t);
        posicionarVivo();
        $('vivo-estado').textContent = `${ESTR[cfg.id].nombre}: ${senalesVivo.filter((x) => !x.cancelar).length} señales en los datos cargados.`;
      } catch (e) { cfg.vivo = false; $('vivo').checked = false; mostrarError('La estrategia en vivo se apagó: ' + e.message); }
      finally { calculandoVivo = false; }
    }, 20);
  }
  function posicionarVivo() {
    const ahora = R.cur >= 0 ? R.D.T[R.cur] : 0;
    let a = 0, z = senalesVivo.length;
    while (a < z) { const m = (a + z) >> 1; if (senalesVivo[m].t <= ahora) a = m + 1; else z = m; }
    idxVivo = a;
  }
  function ordenDe(s) {
    const o = { dir: s.dir, etiqueta: s.etiqueta || ESTR[cfg.id].nombre, origen: 'estrategia', expira: s.expira || null, anula: s.anula || null };
    if (s.slPrecio != null) o.slPrecio = s.slPrecio; else o.slDist = s.slUsd || R.num('sl-usd', 5);
    if (s.tpPrecio != null) o.tpPrecio = s.tpPrecio; else o.rr = s.rr || 2;
    if (s.tipo === 'mercado') { o.tipo = 'mercado'; o.precio = 0; } else { o.tipo = s.tipo; o.precio = s.precio; }
    return o;
  }
  R.ganchosVela.push((i) => {
    if (!cfg.vivo || !senalesVivo.length) return null;
    const t = R.D.T[i];
    let res = null;
    while (idxVivo < senalesVivo.length && senalesVivo[idxVivo].t <= t) {
      const s = senalesVivo[idxVivo++];
      if (s.cancelar) { if (R.pendiente && R.pendiente.origen === 'estrategia') R.cancelarPendiente(true); continue; }
      if (R.posicion) continue;
      if (R.pendiente && !(R.pendiente.origen === 'estrategia' && s.reemplaza)) continue;
      const o = ordenDe(s);
      if (cfg.modoVivo === 'auto') {
        if (R.pendiente) R.cancelarPendiente(true);
        if (o.tipo === 'mercado') { o.enApertura = true; o.precio = R.D.O[i]; }
        R.colocarOrden(o);
      } else {
        senalAviso = o;
        mostrarSenal(o);
        res = { pausar: true, motivo: 'Señal de ' + ESTR[cfg.id].nombre };
      }
    }
    return res;
  });
  function mostrarSenal(o) {
    const caja = $('senal-caja');
    caja.hidden = false;
    const txt = o.tipo === 'mercado' ? 'a mercado' : `${o.tipo} a ${f2(o.precio)}`;
    const sl = o.slPrecio != null ? f2(o.slPrecio) : o.slDist + ' USD';
    const tp = o.tpPrecio != null ? f2(o.tpPrecio) : 'R:R ' + o.rr;
    $('senal-texto').textContent = `${o.dir === 1 ? 'Compra' : 'Venta'} ${txt} · SL ${sl} · TP ${tp} · ${o.etiqueta}`;
    R.pestana('operar');
  }
  R.on('cursor', () => { posicionarVivo(); $('senal-caja').hidden = true; senalAviso = null; redibujar(); });
  R.on('datos', () => { if (cfg.vivo) calcularVivo(); });

  // ---------- traducción desde Pine Script ----------
  let muestra = null;
  const API_COMUN = `Se escribe como Pine Script. Todo corre sobre las velas cerradas de la temporalidad elegida, sin ver el futuro.
- Series (Float64Array; el índice es la vela; NaN = na): ctx.open, ctx.high, ctx.low, ctx.close, ctx.time (ms UTC de apertura). x[i-1] equivale a x[1] de Pine. No hay volumen: volume, vwap, obv, mfi y vwma no existen (dejá un comentario si el Pine los usa).
- ctx.ta (mismas fórmulas que TradingView, sobre series enteras): sma(x,n), ema, rma, wma, hma, alma(x,n,offset,sigma), stdev(x,n), variance, dev, tr(h,l,c), atr(h,l,c,n), rsi(x,n), macd(x,rapida,lenta,senal) → {macd, senal, hist}, bb(x,n,mult) → {medio, sup, inf}, kc(x,h,l,c,n,mult) → {medio, sup, inf}, stoch(x,h,l,n), cci(x,n), wpr(h,l,c,n), dmi(h,l,c,diLen,adxLen) → {mas, menos, adx}, supertrend(h,l,c,factor,n) → {valor, direccion} (direccion -1 = alcista, como TradingView), sar(h,l,c,inicio,inc,max), highest(x,n), lowest(x,n), highestbars, lowestbars, change(x,n), mom, roc, cum, pivothigh(x,izq,der) y pivotlow (valor en la vela de confirmación, NaN si no hay), linreg(x,n,offset), correlation(a,b,n), percentrank, median, cmo, tsi, valuewhen(cond,src,k), barssince(cond), rising(x,n), falling(x,n); por vela: crossover(a,b,i), crossunder(a,b,i), cross(a,b,i); ctx.nz(x,y), ctx.na(x).
- request.security: ctx.security(tf, (v) => serie calculada con v.o, v.h, v.l, v.c, v.t y v.ta, modo) devuelve la serie alineada con las velas del gráfico. tf en minutos (15, 60, 240, 1440). modo 'cerrada' (por defecto) = valor de la última vela mayor cerrada, igual que [1] con lookahead_on; modo 'tv' = lookahead_off.
- Sesiones: ctx.sesion('0830-1100') → arreglo 1/0 (apertura de la vela dentro de la sesión, hora de Nueva York). ctx.minutoNY(i). ctx.syminfo.mintick = 0.01 (oro).`;
  const API_TEXTO = `Formato de estrategia: function preparar(ctx, p) { ...cálculo de series...; return (i) => { ...lógica al cierre de la vela i... }; }
${API_COMUN}
- Órdenes (como strategy.*): ctx.strategy.entry(id, 'long' | 'short', { limit, stop, qty, comment }); ctx.strategy.exit(id, desdeId, { stop, limit, loss, profit (en ticks), rr (TP = rr × riesgo desde el llenado) }); ctx.strategy.close(id); close_all(); cancel(id); cancel_all(); position_size (positivo comprado, negativo vendido); opentrades; closedtrades; pendientes (entradas sin llenar).
- Las órdenes se ejecutan desde la vela siguiente, como en TradingView: a mercado en su apertura, límite o stop cuando el precio las cruza (en la apertura si hay hueco). Una posición a la vez (pyramiding 1). p = parámetros del probador.`;
  const API_IND = `Formato de indicador: function indicador(ctx, p) { ...; ctx.plot(serie, 'título', '#color'); }
${API_COMUN}
- ctx.plot(serie, título, color) dibuja una línea por cada llamada (plot de Pine). No hay órdenes.`;
  async function traducirPine() {
    if (!muestra) return;
    const pine = $('pine-codigo').value.trim();
    if (pine.length < 20) { aviso('Pegá el código Pine Script completo.'); return; }
    const esInd = ($('pine-modo') && $('pine-modo').value === 'indicador') || (/^\s*(\/\/@version=\d+\s*)?indicator\s*\(/m.test(pine) && !/strategy\s*\(/.test(pine));
    const btn = $('pine-traducir');
    btn.disabled = true;
    $('pine-estado').textContent = 'Claude está traduciendo tu ' + (esInd ? 'indicador' : 'estrategia') + '…';
    try {
      const prompt = `Traducí este ${esInd ? 'indicador' : 'estrategia'} de Pine Script (TradingView) a JavaScript para el reproductor de velas de XAUUSD. El reproductor tiene las mismas funciones ta.* y las mismas reglas de órdenes que TradingView, así que la traducción tiene que ser exacta, función por función.\n\n${esInd ? API_IND : API_TEXTO}\n\nReglas:\n- Respondé SOLO con el código JavaScript (sin explicaciones ni bloques de markdown).\n- Calculá las series una sola vez (fuera de la función por vela) con ctx.ta y usá índices [i], [i-1] para el historial.\n- Las variables "var" de Pine van como variables de JavaScript dentro de ${esInd ? 'la función' : 'preparar, fuera de la función por vela'}.\n- Mantené los mismos parámetros por defecto del Pine como constantes al inicio.\n- Si algo no existe en el reproductor (volumen, dibujos, alertas), dejá un comentario breve.\n- Comentarios breves en español.\n\nCódigo Pine Script:\n${pine}`;
      const r = await muestra(prompt, { modelTier: 'complex', onText: ({ text }) => { $('pine-estado').textContent = 'Recibiendo el código… (' + text.length + ' caracteres)'; } });
      const codigo = (r.text || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
      if (esInd) {
        window.TV.compilarIndicador(codigo);
        const titulo = (/indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(pine) || [])[1] || 'Indicador de TradingView';
        R.indicadores.agregar('propio', { nombre: titulo, codigo, panel: !/overlay\s*=\s*true/.test(pine) });
        $('dlg-pine').close();
        aviso('Listo: agregué el indicador "' + titulo + '". Lo podés editar en Configurar.', 6000);
      } else {
        window.TV.compilar(codigo);
        cfg.codigo = codigo; cfg.id = 'propia'; guardarCfg();
        $('pr-codigo').value = codigo;
        $('pr-estrategia').value = 'propia';
        renderParams();
        $('dlg-pine').close();
        aviso('Listo: revisá el código traducido y probalo.', 5000);
      }
    } catch (e) {
      $('pine-estado').textContent = e && e.code === 'not_granted' ? 'No se dio permiso para usar Claude desde esta página.' : 'No se pudo traducir: ' + ((e && e.message) || e);
    } finally { btn.disabled = false; }
  }

  // ---------- interfaz ----------
  function renderParams() {
    const id = cfg.id;
    $('pr-desc').textContent = ESTR[id].desc;
    const leer = R.indicadores.formParams($('pr-params'), ESTR[id].params, cfg.params[id]);
    for (const el of $('pr-params').querySelectorAll('input,select')) el.addEventListener('change', () => { cfg.params[id] = leer(); guardarCfg(); if (cfg.vivo) calcularVivo(); });
    $('pr-editor').hidden = id !== 'propia';
  }
  function fechaInput(ms) { return R.utcALocalInput(ms, true); }
  function renderRango() {
    const { desde, hasta } = rangoActual();
    $('pr-desde').value = fechaInput(desde);
    $('pr-hasta').value = fechaInput(hasta - 60000);
  }
  function leerRango() {
    const d = R.localAUtc($('pr-desde').value), h = R.localAUtc($('pr-hasta').value);
    if (d == null || h == null) return;
    cfg.rango = { desde: d, hasta: h + 86400000 };
    guardarCfg();
  }
  function preset(n) {
    const meses = R.INDICE.meses;
    const fin = meses[meses.length - 1].hasta + 60000;
    if (n === 'todo') cfg.rango = { desde: meses[0].desde, hasta: fin };
    else if (/^\d{4}$/.test(n)) cfg.rango = { desde: R.localAUtc(n + '-01-01'), hasta: R.localAUtc(+n + 1 + '-01-01') };
    else cfg.rango = { desde: fin - Number(n) * 30.44 * 86400000, hasta: fin };
    guardarCfg(); renderRango();
  }
  function iniciarUI() {
    const sel = $('pr-estrategia');
    for (const [k, e] of Object.entries(ESTR)) sel.appendChild(new Option(e.nombre, k));
    sel.value = cfg.id;
    sel.addEventListener('change', () => { cfg.id = sel.value; guardarCfg(); renderParams(); if (cfg.vivo) calcularVivo(); });
    renderParams();
    $('pr-codigo').value = cfg.codigo;
    $('pr-codigo').addEventListener('input', () => { cfg.codigo = $('pr-codigo').value; });
    $('pr-codigo').addEventListener('change', () => { guardarCfg(); try { compilarCodigo(cfg.codigo); mostrarError(''); if (cfg.vivo) calcularVivo(); } catch (e) { mostrarError('Tu código tiene un error: ' + e.message); } });
    $('pr-codigo').addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target, a = t.selectionStart; t.setRangeText('  ', a, t.selectionEnd, 'end'); } });
    $('pr-plantilla').addEventListener('change', () => { const k = $('pr-plantilla').value; if (!k) return; cfg.codigo = PLANTILLAS[k]; $('pr-codigo').value = cfg.codigo; guardarCfg(); $('pr-plantilla').value = ''; });
    $('pr-api').textContent = API_TEXTO + '\n\nFormato anterior (sigue funcionando): function estrategia(v, i, ta, estado) que devuelve { lado, tipo, precio, sl, tp, rr, nota }.\n\nIndicadores: ' + API_IND;
    for (const [id, k] of [['pr-spread', 'spread'], ['pr-desliz', 'desliz']]) { $(id).value = cfg.costos[k]; $(id).addEventListener('change', () => { cfg.costos[k] = Math.max(0, Number($(id).value) || 0); guardarCfg(); }); }
    $('pr-propo').checked = cfg.costos.proporcional;
    $('pr-propo').addEventListener('change', () => { cfg.costos.proporcional = $('pr-propo').checked; guardarCfg(); });
    $('pr-capital').value = cfg.capital; $('pr-capital').addEventListener('change', () => { cfg.capital = Math.max(100, Number($('pr-capital').value) || 10000); guardarCfg(); if (resultado) { resultado.stats = estadisticas(resultado.ops); renderResultados(); } });
    $('pr-riesgo').value = cfg.riesgo; $('pr-riesgo').addEventListener('change', () => { cfg.riesgo = Math.min(10, Math.max(0.1, Number($('pr-riesgo').value) || 1)); guardarCfg(); if (resultado) { resultado.stats = estadisticas(resultado.ops); renderResultados(); } });
    $('pr-maxmin').value = cfg.maxMin; $('pr-maxmin').addEventListener('change', () => { cfg.maxMin = Math.max(0, Number($('pr-maxmin').value) || 0); guardarCfg(); });
    renderRango();
    $('pr-desde').addEventListener('change', leerRango);
    $('pr-hasta').addEventListener('change', leerRango);
    for (const b of document.querySelectorAll('[data-preset]')) b.addEventListener('click', () => preset(b.dataset.preset));
    $('pr-probar').addEventListener('click', probar);
    $('pr-engrafico').checked = cfg.enGrafico;
    $('pr-engrafico').addEventListener('change', () => { cfg.enGrafico = $('pr-engrafico').checked; guardarCfg(); redibujar(); });
    $('pr-mas').addEventListener('click', () => { pagina++; renderOps(); });
    $('pr-copiar').addEventListener('click', () => { if (resultado) R.copiarTexto(textoResumen(), $('pr-respaldo')); });
    $('pr-csv').addEventListener('click', () => { if (resultado) R.ofrecerArchivo(`probador-${resultado.id}.csv`, csvOps()).then((ok) => { if (!ok) R.copiarTexto(csvOps(), $('pr-respaldo')); }); });
    for (const b of document.querySelectorAll('[data-prtab]')) b.addEventListener('click', () => {
      for (const x of document.querySelectorAll('[data-prtab]')) x.setAttribute('aria-selected', String(x === b));
      for (const s of document.querySelectorAll('[data-prcont]')) s.hidden = s.dataset.prcont !== b.dataset.prtab;
    });
    const plegar = () => { const abierto = LS.get('probadorAbierto', true); $('probador-cuerpo').hidden = !abierto; $('pr-plegar').textContent = abierto ? 'Ocultar' : 'Mostrar'; $('pr-plegar').setAttribute('aria-expanded', String(abierto)); };
    $('pr-plegar').addEventListener('click', () => { LS.set('probadorAbierto', !LS.get('probadorAbierto', true)); plegar(); });
    plegar();
    // en vivo
    $('vivo').checked = false;
    $('vivo-modo').value = cfg.modoVivo;
    $('vivo').addEventListener('change', () => {
      cfg.vivo = $('vivo').checked;
      if (cfg.vivo) {
        if (cfg.id === 'propia') { try { compilarCodigo(cfg.codigo); } catch (e) { mostrarError('Tu código tiene un error: ' + e.message); cfg.vivo = false; $('vivo').checked = false; return; } }
        calcularVivo();
        const tfE = ESTR[cfg.id].tf(cfg.params[cfg.id]);
        $('vivo-tf').hidden = R.tf === tfE; $('vivo-tf').textContent = 'Ver el gráfico en ' + R.TFS[tfE];
      } else { $('vivo-estado').textContent = 'Apagada.'; $('vivo-tf').hidden = true; }
      $('vivo-indicador').hidden = !cfg.vivo;
      $('vivo-indicador').textContent = 'Estrategia en vivo: ' + ESTR[cfg.id].nombre;
    });
    $('vivo-modo').addEventListener('change', () => { cfg.modoVivo = $('vivo-modo').value; guardarCfg(); });
    $('vivo-tf').addEventListener('click', () => { R.cambiarTf(ESTR[cfg.id].tf(cfg.params[cfg.id])); $('vivo-tf').hidden = true; });
    $('senal-ejecutar').addEventListener('click', () => {
      const o = senalAviso;
      $('senal-caja').hidden = true; senalAviso = null;
      if (!o) return;
      if (o.tipo === 'mercado') R.mercado(o.dir, o); else R.colocarOrden(o);
    });
    $('senal-ignorar').addEventListener('click', () => { $('senal-caja').hidden = true; senalAviso = null; });
    // Pine
    (async () => {
      try { muestra = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch { muestra = null; }
      $('pr-pine').hidden = !muestra;
    })();
    $('pr-pine').addEventListener('click', () => { $('pine-estado').textContent = ''; $('dlg-pine').showModal(); $('pine-codigo').focus(); });
    $('pine-traducir').addEventListener('click', (e) => { e.preventDefault(); traducirPine(); });
    renderResultados();
  }
  R.on('listo', iniciarUI);
  R.on('sesion', (s) => { if (s && s.codigoPropio && s.codigoPropio !== cfg.codigo) { cfg.codigo = s.codigoPropio; const el = $('pr-codigo'); if (el) el.value = cfg.codigo; } });
  R.estrategias = { ESTR, estadisticas, get resultado() { return resultado; } };
})();
