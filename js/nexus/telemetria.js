// NEXUS · SystemTelemetry: el estado de cada parte del reproductor, leído de condiciones reales (nunca simulado).
// Estados: CONNECTED, DISCONNECTED, PROCESSING, IDLE, ERROR.
//   MARKET DATA        velas de 1 minuto del replay: cargando (#cargando visible), error de carga, sin red (offline) o listas.
//   HISTORICAL ENGINE  índice histórico (datos/indice.json) y cargas de rangos largos del probador (REP.cargarRango).
//   REPLAY ENGINE      reproducción en curso (#play aria-pressed) o en pausa; sin datos = desconectado.
//   STRATEGY ENGINE    prueba corriendo (#pr-progreso), error (#pr-error), estrategia en vivo (#vivo) o en espera.
//   SESSION ENGINE     sesión activa y dónde se guarda (#almacen); guardando (evento «guardar»); error de guardado.
//   TRADE EXECUTION    posición abierta u orden pendiente (REP.posicion / REP.pendiente) o sin operaciones.
// También mantiene el instrumento, la temporalidad y el estado del replay en el header y el LED de la barra de replay.
(function () {
  'use strict';
  const R = window.REP;
  if (!R) return;
  const $ = (id) => document.getElementById(id);
  const MOD = {};
  const T = { listo: false, hist: 0, histError: '', histProg: 0, guardando: 0, guardarError: false };

  function poner(mod, estado, detalle, titulo) {
    const el = MOD[mod] || (MOD[mod] = document.querySelector(`.nx-modulo[data-mod="${mod}"]`));
    if (!el) return;
    if (el.dataset.estado !== estado) el.dataset.estado = estado;
    const b = el.querySelector('b'), s = el.querySelector('small');
    if (b && b.textContent !== estado) b.textContent = estado;
    if (s) { const d = detalle || ''; if (s.textContent !== d) s.textContent = d; s.hidden = !d; }
    const nombre = el.dataset.nombre || mod;
    const t = `${nombre}: ${estado}${detalle ? ' · ' + detalle : ''}${titulo ? '\n' + titulo : ''}`;
    if (el.title !== t) { el.title = t; el.setAttribute('aria-label', t.replace('\n', '. ')); }
  }
  const visible = (id) => { const e = $(id); return !!e && !e.hidden; };
  const vel = () => { const v = $('velocidad'); return v ? v.value + '×' : ''; };

  function datos() {
    const c = $('cargando'), txt = (c && c.textContent) || '';
    const D = R.D;
    if (c && !c.hidden && /no se pud/i.test(txt)) return poner('datos', 'ERROR', '', txt);
    if (navigator.onLine === false) return poner('datos', 'DISCONNECTED', 'OFFLINE', 'Sin conexión: no se pueden bajar meses nuevos.');
    if (c && !c.hidden) return poner('datos', 'PROCESSING', 'LOADING', txt);
    if (!D || !D.T || !D.T.length) return poner('datos', T.listo ? 'IDLE' : 'DISCONNECTED', '', 'Sin velas cargadas todavía.');
    const meses = R.INDICE && R.INDICE.meses ? R.INDICE.meses.slice(D.m0, D.m1 + 1).map((m) => m.mes) : [];
    poner('datos', 'CONNECTED', 'XAUUSD M1', `Velas de 1 minuto en memoria: ${D.T.length.toLocaleString('es-AR')}${meses.length ? ` (${meses[0]} a ${meses[meses.length - 1]})` : ''}. Precio BID; las compras se llenan al ASK.`);
  }
  function hist() {
    const I = R.INDICE;
    if (T.hist > 0) return poner('hist', 'PROCESSING', T.histProg ? Math.round(T.histProg * 100) + '%' : 'LOADING', 'Cargando un rango histórico para el probador.');
    if (T.histError) return poner('hist', 'ERROR', '', T.histError);
    if (!I || !I.meses || !I.meses.length) return poner('hist', 'DISCONNECTED', '', 'Todavía no se leyó el índice de datos.');
    poner('hist', 'CONNECTED', I.meses.length + ' meses', `Índice histórico: ${I.meses[0].mes} a ${I.meses[I.meses.length - 1].mes}.`);
  }
  function replay() {
    const D = R.D, hay = D && D.T && D.T.length && R.cur >= 0;
    let estado, det, tit;
    if (!hay) { estado = 'DISCONNECTED'; det = ''; tit = 'Sin datos para reproducir.'; }
    else if (R.jugando) { estado = 'PROCESSING'; det = vel(); tit = 'Reproduciendo a ' + vel() + ' (velas por segundo).'; }
    else { estado = 'IDLE'; det = 'PAUSED'; tit = 'En pausa.'; }
    poner('replay', estado, det, tit);
    const chip = $('nx-estado-replay'), led = $('nx-led');
    const enCurso = estado === 'PROCESSING';
    const txt = !hay ? 'SIN DATOS' : enCurso ? 'EN CURSO · ' + vel() : 'EN PAUSA';
    for (const el of [chip, led]) {
      if (!el) continue;
      el.dataset.estado = enCurso ? 'reproduciendo' : hay ? 'pausa' : 'sin-datos';
      const s = el.querySelector('span');
      if (s && s.textContent !== txt) s.textContent = txt;
    }
  }
  function estrategia() {
    const vivo = $('vivo'), est = $('vivo-estado'), sel = $('pr-estrategia');
    const nombre = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/^★\s*/, '') : '';
    if (visible('pr-progreso')) return poner('estrategia', 'PROCESSING', 'BACKTEST', ($('pr-estado') && $('pr-estado').textContent) || 'Probando la estrategia.');
    if (visible('pr-error')) return poner('estrategia', 'ERROR', '', $('pr-error').textContent);
    if (vivo && vivo.checked) return poner('estrategia', 'CONNECTED', 'LIVE', `${nombre} ejecutándose en el reproductor. ${(est && est.textContent) || ''}`);
    poner('estrategia', 'IDLE', '', nombre ? `Estrategia elegida: ${nombre}. En espera.` : 'En espera.');
  }
  function sesion() {
    const s = R.sesion, alm = ($('almacen') && $('almacen').textContent) || '';
    if (!s) return poner('sesion', T.listo ? 'IDLE' : 'DISCONNECTED', '', 'Sin sesión activa.');
    const donde = /cuenta/i.test(alm) ? 'CLOUD' : /navegador/i.test(alm) ? 'LOCAL' : '';
    if (T.guardarError) return poner('sesion', 'ERROR', donde, 'No se pudo guardar la última vez; se reintenta solo.');
    if (T.guardando) return poner('sesion', 'PROCESSING', 'SAVING', `Guardando «${s.nombre}».`);
    poner('sesion', 'CONNECTED', donde, `Sesión «${s.nombre}» · ${s.operaciones.length} operaciones · ${alm}`);
  }
  function ejecucion() {
    const p = R.posicion, q = R.pendiente, D = R.D;
    if (!D || !D.T || !D.T.length) return poner('ejecucion', 'DISCONNECTED', '', 'Sin precios.');
    if (p) return poner('ejecucion', 'PROCESSING', (p.dir === 1 ? 'LONG ' : 'SHORT ') + Number(p.lotes).toFixed(2), `Posición abierta: ${p.dir === 1 ? 'compra' : 'venta'} de ${Number(p.lotes).toFixed(2)} lotes a ${R.f2(p.entrada)}.`);
    if (q) return poner('ejecucion', 'PROCESSING', 'PENDING', `Orden pendiente: ${q.dir === 1 ? 'compra' : 'venta'} a ${R.f2(q.precio)}.`);
    poner('ejecucion', 'IDLE', '', 'Sin posición ni órdenes pendientes.');
  }
  function cabecera() {
    const tf = $('nx-tf');
    if (tf) { const t = 'TF ' + (R.TFS[R.tf] || R.tf); if (tf.textContent !== t) tf.textContent = t; }
  }
  let pendiente = 0;
  function todo() {
    pendiente = 0;
    datos(); hist(); replay(); estrategia(); sesion(); ejecucion(); cabecera();
  }
  function pronto() { if (!pendiente) pendiente = requestAnimationFrame(todo); }

  // Envoltura de REP.cargarRango: el probador la llama con R.cargarRango(...), así que se puede observar sin tocar el motor.
  const original = R.cargarRango;
  if (typeof original === 'function') {
    R.cargarRango = async function (desde, hasta, progreso) {
      T.hist++; T.histError = ''; T.histProg = 0; pronto();
      try {
        return await original.call(this, desde, hasta, (x, mes) => { T.histProg = x; pronto(); if (progreso) progreso(x, mes); });
      } catch (e) {
        T.histError = 'No se pudo cargar el rango: ' + ((e && e.message) || e);
        throw e;
      } finally { T.hist--; pronto(); }
    };
  }

  function observar() {
    const mo = new MutationObserver(pronto);
    const mirar = (id, opc) => { const e = $(id); if (e) mo.observe(e, opc); };
    mirar('cargando', { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    mirar('play', { attributes: true, attributeFilter: ['aria-pressed'] });
    mirar('pr-progreso', { attributes: true, attributeFilter: ['hidden'] });
    mirar('pr-estado', { childList: true, characterData: true, subtree: true });
    mirar('pr-error', { attributes: true, attributeFilter: ['hidden'], childList: true });
    mirar('vivo-estado', { childList: true, characterData: true, subtree: true });
    mirar('almacen', { childList: true, characterData: true, subtree: true });
    mirar('pos-estado', { childList: true, characterData: true, subtree: true });
    // un aviso «No se pudo guardar» del núcleo marca el error de la sesión hasta el próximo guardado
    const toast = $('toast');
    if (toast) new MutationObserver(() => { if (!toast.hidden && /no se pudo guardar/i.test(toast.textContent)) { T.guardarError = true; pronto(); } }).observe(toast, { attributes: true, childList: true, characterData: true, subtree: true });
    for (const id of ['vivo', 'velocidad', 'pr-estrategia']) { const e = $(id); if (e) e.addEventListener('change', pronto); }
    addEventListener('online', pronto); addEventListener('offline', pronto);
  }
  let tGuardar = 0;
  R.on('guardar', () => { T.guardando = 1; T.guardarError = false; pronto(); clearTimeout(tGuardar); tGuardar = setTimeout(() => { T.guardando = 0; pronto(); }, 900); });
  for (const ev of ['datos', 'cursor', 'avance', 'tf', 'orden', 'sesion', 'pestana']) R.on(ev, pronto);
  R.on('listo', () => { T.listo = true; observar(); todo(); });
  pronto();
})();
