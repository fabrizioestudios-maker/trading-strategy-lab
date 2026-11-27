// Veredicto del laboratorio (trading-strategy-lab, bitácora entrada 30, 27/11/2026) para cada estrategia del probador.
// Escala: R rechazada · A exploratoria · B candidata · C validada estadísticamente · D validada a futuro · E operativa.
(function (raiz) {
  'use strict';
  const FICHAS = {
    oro_bb_d1: {
      nivel: 'B', nombre: 'Candidata',
      puntos: [
        '15 años: 168 operaciones, 47,6 % de acierto y +0,41 R por operación (IC 95 % de +0,18 a +0,64).',
        'Le gana a entradas al azar del mismo lado (p = 0,0005) y agrega alfa sobre el oro y el risk parity (IR 0,85, p = 0,001); su correlación con el oro es 0,03.',
        'Resiste costos realistas: +0,37 R con costos base y +0,27 R con estrés. Con 1 % de riesgo, el drawdown del peor 5 % en 5 años es 11,7 %.',
      ],
      falta: 'DSR 0,24 por la búsqueda que la eligió, razón prueba/elección 0,34 en el walk-forward principal y un período limpio: la prueba a futuro F001 corre desde el 27/11/2026.',
    },
    oro_bb_1815: {
      nivel: 'B', nombre: 'Candidata',
      puntos: [
        'Misma señal que E022, con la entrada a las 18:15 NY: la ventaja no dependía del precio de la reapertura (E042, IC 95 % de +0,11 a +0,56 R).',
        'Con costos base, 2010–2026 (181 operaciones): TP fijo +0,32 R; salida a 1 día +0,26 R (≈ 18 h); salida a 5 días +0,60 R. Últimos 5 años: +0,49, +0,41 y +0,73 R (E044).',
        'La salida a 5 días le gana al TP fijo en las dos muestras, pero se eligió entre 3 salidas y acierta 33–35 %.',
      ],
      falta: 'La prueba a futuro F002 (desde el 27/11/2026): decide cada salida a las 30 operaciones.',
    },
    smc_oro: {
      nivel: 'R', nombre: 'Rechazada',
      puntos: [
        'En su historia nunca usada (2010–2021): 613 operaciones, 33,9 % de acierto y −0,03 R. Es lo que da el azar con RR 1:2.',
        'El +0,26 R de 2021–2026 fue la suerte de elegir la mejor de 171.072 variantes: ninguna sobrevive a la corrección por pruebas múltiples.',
      ],
      falta: 'Sin evidencia de ventaja.',
    },
    smc_comun: {
      nivel: 'A', nombre: 'Exploratoria',
      puntos: [
        '2021–2026: +0,12 R en los 6 activos (oro: +0,19 R), pero ninguna variante SMC sobrevive a la corrección por pruebas múltiples.',
        'Lo que suma en promedio: barrer la liquidez del día anterior (+0,09 R) y operar en killzones (+0,03 R). Lo que resta: entrar en FVG, OB u OTE en vez de a mercado (−0,05 a −0,08 R).',
        'Un barrido del máximo o mínimo del día no predice la reversión mejor que operar a esa hora otro día (E035b).',
      ],
      falta: 'Una prueba limpia: 2010–2021 no se corrió para esta configuración.',
    },
    ict5_oro: {
      nivel: 'A', nombre: 'Exploratoria',
      puntos: [
        'En su historia nunca usada (2010–2021): 215 operaciones, 36,3 % de acierto y +0,04 R (p = 0,36). No pasó.',
        'Parece funcionar solo con volatilidad alta (régimen HMM), con evidencia débil (p = 0,0495 en 4 pruebas).',
      ],
      falta: 'Sigue en la prueba a futuro F001, sin evidencia de ventaja por ahora.',
    },
    ict1_oro: {
      nivel: 'A', nombre: 'Exploratoria',
      puntos: [
        '2021–2026: 144 operaciones, 45,1 % de acierto y +0,28 R, elegida entre 19.908 pruebas ICT.',
        'Ninguna variante ICT sobrevive a la corrección por pruebas múltiples; la más parecida (setup 5) falló su historia limpia.',
      ],
      falta: 'Una prueba en historia nunca usada.',
    },
  };
  raiz.FICHAS = FICHAS;
})(typeof window !== 'undefined' ? window : globalThis);
