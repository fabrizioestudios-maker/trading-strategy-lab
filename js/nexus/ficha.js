// NEXUS · veredicto del laboratorio en el probador (antes vivía en js/red.js, que se retiró el 27/11/2026).
// Muestra la ficha de js/fichas.js (nivel R/A/B/C/D/E con su evidencia) de la estrategia elegida.
(function () {
  'use strict';
  const R = window.REP;
  if (!R) return;
  const $ = (id) => document.getElementById(id);
  function pintar(id) {
    const caja = $('pr-ficha');
    if (!caja) return;
    const f = window.FICHAS && window.FICHAS[id];
    caja.hidden = !f;
    if (!f) return;
    caja.replaceChildren();
    const cab = document.createElement('div');
    cab.className = 'ficha-cab';
    const chip = document.createElement('span');
    chip.className = 'nivel nivel-' + f.nivel;
    chip.textContent = `Nivel ${f.nivel} · ${f.nombre}`;
    const fuente = document.createElement('span');
    fuente.className = 'mini';
    fuente.textContent = 'Veredicto del laboratorio · 27/11/2026';
    cab.append(chip, fuente);
    const ul = document.createElement('ul');
    for (const t of f.puntos) { const li = document.createElement('li'); li.textContent = t; ul.append(li); }
    const falta = document.createElement('p');
    falta.className = 'mini';
    const b = document.createElement('b');
    b.textContent = 'Falta: ';
    falta.append(b, document.createTextNode(f.falta));
    caja.append(cab, ul, falta);
  }
  R.on('listo', () => {
    const sel = $('pr-estrategia');
    if (!sel) return;
    sel.addEventListener('change', () => pintar(sel.value));
    pintar(sel.value);
  });
})();
