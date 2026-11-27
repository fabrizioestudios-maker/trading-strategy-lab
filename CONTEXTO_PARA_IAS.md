# Contexto del proyecto (para pedir opinión a otras IAs)

Este documento resume en una página lo que estamos construyendo e investigando. El detalle completo, con fechas, números y decisiones, está en `BITACORA.md` (entradas 1 a 24) y en `docs/conclusiones.md`.

## Quiénes y qué
Fabrizio opera y da señales de trading (servicio de señales VIP). Sus activos son XAUUSD, EURUSD, GBPUSD, USDCAD, US100, US30 y US500. Busca una estrategia **rentable con win rate ≥ 50 % y RR 1:2**, preferiblemente probada en los **últimos 5 años**, para scalping o daytrading.

## Herramientas
- **Laboratorio** (`lab/`, `experimentos/`, Python + numba). Simula con velas de 1 minuto de 2010–2026 (HistData y Dukascopy), costos realistas, SL primero si el SL y el TP caen en el mismo minuto, y una operación a la vez.
- **Método:**
  - criterios fijados antes de probar (`docs/criterios.md`);
  - elección en 15/11/2021–14/11/2024 y confirmación en 15/11/2024–13/11/2026;
  - prueba aparte en 2011–2021;
  - comparación contra "comprar siempre" (la deriva).
- **Reproductor de velas** (página web, JavaScript; código en el repo `senales-vip`, `backtest/reproductor`):
  - bar replay estilo TradingView con datos de oro en M1 de 2018 a 2026;
  - motor compatible con TradingView: funciones `ta.*`, `request.security` y un emulador de órdenes con lupa de 1 minuto;
  - probador con las 5 mejores estrategias;
  - traducción de estrategias e indicadores desde Pine Script.
  - Link público: https://claude.ai/artifact/PErYePwzYdNSR5EaHavBh2

## Qué se probó y qué dio (resumen honesto)
| Búsqueda | Tamaño | Resultado |
| --- | --- | --- |
| Indicadores clásicos, momentum, retrocesos, reversión, intradía, divergencias, multi-temporalidad, aprendizaje automático, COT, estacionalidad | ~1.560 configuraciones, 2010–2021 | Con stops chicos, el acierto con 1:2 ronda el 33 % (el azar). Solo los stops muy anchos en activos con deriva alcista llegan a 50 %, y comprar siempre da lo mismo. |
| Búsqueda exhaustiva en los últimos 5 años (E019) | 185.367 combinaciones, 13 activos, M5 a D1 | 11 pasan elección y confirmación; 10 caen al azar en 2011–2021. |
| Setup SMC de Fabrizio (barrido → cambio de estructura → descuento → FVG/OB, con sesgo de temporalidad mayor) | 171.072 variantes, 6 activos, 1H–5M, 4H–15M y 15M–1M | Promedio de 33 % de acierto. La versión literal pierde. Las elegidas en 2021–2024 dieron −0,10 R en 2024–2026. |
| 5 setups ICT (prompt de Google: barrido a OB/FVG, breaker, continuación FVG, AMD, sesgo mayor en NY) | 19.908 pruebas | Pierden con la configuración del prompt. Ninguno llega a 50 % de forma estable. |

**La única estrategia con ventaja sostenida:** oro D1.
- **Reglas:** primera vela que cierra fuera de la banda de Bollinger (20, 2) a favor de la SMA 200. SL de 0,5 ATR(14), TP 2R, entrada en la apertura siguiente.
- **Últimos 5 años:** 58 operaciones, 55,2 % de acierto, +0,63 R.
- **2011–2021:** 43,6 % de acierto, +0,29 R.
- Solo funciona en oro.

**Explicación teórica.** Con RR 1:2, un precio al azar acierta 1/3. Para llegar al 50 % hace falta Sharpe diario × (stop en desvíos diarios) ≥ 0,24. Con stops intradía eso exige un Sharpe anual de ~4, que casi ninguna señal técnica tiene.

## Preguntas para otras IAs
1. ¿Ven errores de método (sesgo de mirar adelante, sobreajuste, costos, datos) en `lab/motor.py`, `lab/smc.py`, `lab/ict.py` o en la regla de elección?
2. ¿Qué familia de ideas **no** probamos que tenga fundamento para superar el 50 % con 1:2 en intradía? Por ejemplo, datos que no sean precio: volumen real, order book, opciones o noticias.
3. ¿Conviene cambiar el objetivo a expectancy y profit factor (40 % de acierto con 1:2 ya es rentable) en lugar de exigir 50 %?
4. ¿Cómo harían más robusta la estrategia de oro D1 (sizing, filtros de régimen, cartera con otras ideas)?
5. ¿Qué le falta al reproductor para replicar exactamente el Strategy Tester de TradingView?

## Dónde mirar
- `BITACORA.md`: historia completa, con fechas.
- `docs/conclusiones.md`: conclusiones.
- `docs/criterios.md`: criterios fijados de antemano.
- `experimentos/E019`–`E025` y `resultados/`: búsquedas de los últimos 5 años, con todos los números.
- `pine/`: versiones en Pine Script de la estrategia de oro D1, el setup SMC y los 5 setups ICT.
