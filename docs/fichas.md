# Fichas de estrategias (27/11/2026)

Cada ficha resume hipótesis, reglas, resultados, riesgos, limitaciones, validación, estado e historial. Los números salen de `resultados/` y de la bitácora.

## Oro D1 · ruptura de Bollinger a favor de la SMA 200 (E022) — nivel B, candidata

- **Hipótesis:** después de una ruptura de volatilidad a favor de la tendencia larga, el oro tiene momentum de corto plazo.
- **Reglas:**
  - vela diaria de cierre 17:00 NY;
  - primer cierre fuera de Bollinger (20, 2) del lado de la SMA 200;
  - entrada en la apertura siguiente;
  - SL 0,5·ATR(14) y TP 2·SL;
  - una operación a la vez.
  - Código: `pine/oro_d1_bollinger_sma200.pine` y el reproductor (`oro_bb_d1`).
- **Resultados:**
  - 2011–2026: 168 operaciones, 47,6 %, +0,41 R, IC [+0,18; +0,64], PF 1,76; 12 de 14 años positivos.
  - 2021–2026: 58, 55,2 %, +0,63 R.
- **Validación:**
  - contra el azar del mismo lado: p = 0,0005;
  - alfa sobre comprar y mantener el oro: IR 0,85 (p 0,001), correlación 0,03;
  - walk-forward 3/1: +0,53 R fuera de muestra, pero GR 0,34;
  - la familia entera es positiva (+0,22 R al azar).
- **Riesgos:**
  - con costos conservadores, +0,33 R;
  - con 1 % de riesgo, drawdown p95 de 11,7 % en 5 años;
  - racha perdedora p95: 8 operaciones.
- **Limitaciones:**
  - DSR 0,24 por la búsqueda que la eligió;
  - sin período limpio (E037 bloqueado);
  - solo oro;
  - unas 11 operaciones por año, así que la prueba a futuro tarda unos 3 años en llegar a 30.
- **Historial:** E019 (#2) → E020/E021 → E022 → E027 → E028–E032 → F001.

## ICT setup 5 en oro 15M — nivel A, exploratoria
- **Reglas:** sesgo de estructura de 4H; killzone de NY; barrido interno y FVG ≥ 0,25 ATR; límite al 50 %; TP 2R.
- **Resultados:**
  - 2021–2026: 82 operaciones, 45,1 %, +0,30 R;
  - **historia limpia 2010–2021: 215, 36,3 %, +0,035 R (p 0,36). No pasó.**
- **Validación:** con régimen de volatilidad alta mejora (E034, p 0,0495 en 4 pruebas); evidencia débil.
- **Estado:** sigue en F001 porque estaba registrada.

## SMC mejor en oro 4H–15M — nivel R en su historia limpia
- **Resultados:** 2021–2026: 302 operaciones, 43,4 %, +0,26 R. **Historia limpia 2010–2021: 613, 33,9 %, −0,027 R.**
- **Lo que enseña E035a sobre el setup:**
  - suman la liquidez del día anterior (+0,09 R) y las killzones (+0,03 R);
  - restan las entradas en FVG, OB u OTE (−0,05 a −0,08 R).
- **Lo que enseña E035b:** el barrido no predice la reversión.

## Candidata B · tendencia 200, solo compras, 6 ATR (E009) — nivel A
- **Resultados:**
  - 51,0 % y 55,6 % (fases 1–2), igual que comprar siempre;
  - IR 0,10 contra risk parity: es beta.
- **Costos:** +0,60 R sin costos, pero +0,07 R base y −0,35 R conservador por los swaps de ~250 días. **No operable en CFD.**

## Líderes de momentum + mínimo de 10 días (E017) — nivel A
- **Resultados:** IR 0,37 (p 0,11) hasta 2021; frágil por los swaps.
- **Validación pendiente:** su validación 2022–2026 sigue sin tocar y queda como holdout.

## Tendencia multiactivo con volatilidad objetivo (E036) — nivel A
- **Resultados:**
  - Sharpe 0,21 en 2010–2026, contra 0,61 del risk parity;
  - 0,94 en 1990–2009 con índices de Yahoo (fuente no validada para niveles absolutos).
