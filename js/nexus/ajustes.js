// NEXUS · ajustes y accesos del header: diálogo de ajustes (telemetría; el fondo neuronal está siempre activo) y el botón de
// estadísticas (abre la pestaña Diario). Pantalla completa sigue siendo el botón #pantalla del núcleo.
(function () {
  'use strict';
  const R = window.REP;
  if (!R) return;
  const $ = (id) => document.getElementById(id);
  function telemetria(on) {
    const t = $('nx-telemetria');
    if (t) t.hidden = !on;
    try { R.LS.set('nx_tele', !!on); } catch (e) { /* nada */ }
  }
  function iniciar() {
    const dlg = $('dlg-nx');
    let tele = true;
    try { tele = R.LS.get('nx_tele', true) !== false; } catch (e) { tele = true; }
    telemetria(tele);
    const bAj = $('nx-ajustes');
    if (bAj && dlg) bAj.addEventListener('click', () => {
      $('nx-tele-on').checked = !$('nx-telemetria').hidden;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    });
    const te = $('nx-tele-on');
    if (te) te.addEventListener('change', () => telemetria(te.checked));
    const bSt = $('nx-stats');
    if (bSt) bSt.addEventListener('click', () => {
      R.pestana('diario');
      const p = document.querySelector('.panel');
      if (p && p.getBoundingClientRect().top > innerHeight - 80) p.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    // el botón de pantalla completa refleja el estado real
    const bP = $('pantalla');
    const marcar = () => { if (bP) bP.setAttribute('aria-pressed', String(!!document.fullscreenElement)); };
    document.addEventListener('fullscreenchange', marcar);
    marcar();
  }
  R.on('listo', iniciar);
})();
