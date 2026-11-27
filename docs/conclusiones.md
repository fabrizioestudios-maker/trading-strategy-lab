# Conclusiones (26/11/2026; fase 2 y búsqueda de los últimos 5 años agregadas el 27/11/2026)

**Respuesta corta.** Se encontró una estrategia que cumple los números mínimos de la misión (win rate ≥ 50 %, payoff real ≥ 2, expectancy positiva, más de 100 operaciones) en la muestra de selección y en la de validación. **No es robusta como "ventaja":** gana lo mismo que comprar siempre esos activos con el mismo stop y TP. Su resultado viene de la deriva alcista de índices y metales en 2010–2026, tomada con stops muy anchos y operaciones de 6 a 8 meses.

Con señales técnicas de corto y mediano plazo **no apareció ninguna estrategia con 50 % de acierto y 1:2** en unas 1.560 configuraciones de este laboratorio (fases 1 y 2), más las ~1.600 que ya se habían probado en el proyecto (LuxAlgo, SMC/ICT, Setup A+, scalping). La teoría y los datos explican por qué.

## Actualización (27/11/2026): estrategia para los últimos 5 años

A pedido de Fabrizio se buscó una estrategia para los **últimos 5 años**: 185.367 combinaciones (E019–E022, `BITACORA.md` entradas 18 y 19).
- **11 cumplen** win rate ≥ 50 % con RR 1:2 en la elección (2021–2024) y en la confirmación (2024–2026).
- **10 de esas 11 caen al nivel del azar (31–35 %) en 2011–2021.** Dependen de las subas recientes del oro y del USDJPY.

**Estrategia recomendada.** Oro D1, ruptura de Bollinger (20, 2) a favor de la SMA 200, ambas direcciones. Entra en la apertura siguiente con SL = 0,5 × ATR(14) y TP = 2 × SL. El código está en `pine/oro_d1_bollinger_sma200.pine`.

| Período | Operaciones | Win rate [IC 95 %] | PF | Expectancy |
| --- | --- | --- | --- | --- |
| Últimos 5 años | 58 | 55,2 % [42,5–67,3] | 2,38 | +0,63 R |
| 2011–2021 | 110 | 43,6 % [34,7–53,0] | 1,50 | +0,29 R |
| 15 años | 168 | 47,6 % [40,2–55,1] | 1,76 | +0,41 R |

Cumple el objetivo en los últimos 5 años y es la única finalista que también ganó en los 10 años anteriores, aunque con menos de 50 % de acierto. Funciona solo en oro. Lo esperable a futuro está más cerca de 45–50 % con expectancy positiva que del 55 % reciente.

## El setup SMC de Fabrizio para scalping y daytrading (27/11/2026)

Se probaron 171.072 variantes (E023–E024, `BITACORA.md` entradas 20 y 21) del setup de Fabrizio en los últimos 5 años:
- **Setup:** barrido de liquidez, cambio de estructura, entrada en una zona de reacción dentro del descuento, dirección de la temporalidad mayor y RR 1:2.
- **Activos:** XAUUSD, EURUSD, GBPUSD, USDCAD, US100 y US500. US30 queda pendiente por falta de datos.
- **Temporalidades:** 1H–5M, 4H–15M y 15M–1M.

**Resultados**
- **Ninguna llega a 50 % de acierto.** El promedio es 33 %, lo mismo que entrar al azar con 1:2, y pierde por los costos.
- **La versión literal del setup** (1H–5M, EMA 50/200, FVG en descuento) pierde en 5 de los 6 activos: 30–36 % de acierto.
- **Las mejores de cada activo** dan 43–47 % de acierto y +0,23 a +0,36 R por operación. Pero elegir así no funcionó a futuro: las ganadoras de 2021–2024 dieron −0,10 R en promedio en 2024–2026.
- **Lo que ayuda:** 4H–15M en vez de 1H–5M o 15M–1M, entrar a mercado al romper la estructura en vez de esperar el FVG, el OB o el OTE, y barrer el máximo o mínimo del día anterior. La dirección con EMA 50/200, las killzones y el filtro de liquidez no cambian el resultado.

**Estrategia para el probador:** `pine/smc_barrido_estructura.pine`, con todas las opciones como parámetros.

## La estrategia que cumple los criterios mínimos en 2010–2026 (fase 1)

**Nombre:** Tendencia de largo plazo con stop amplio, solo compras ("candidata B").

| Regla | Definición |
| --- | --- |
| Universo | S&P 500, Nasdaq 100, Nikkei 225, FTSE 100, CAC 40, ASX 200, oro y plata (CFD) |
| Señal (vela diaria, cierre 17:00 NY) | Cierre > SMA(200) **y** SMA(200) de hoy > SMA(200) de hace 20 velas |
| Entrada | Compra en la apertura siguiente si no hay una posición abierta en ese activo |
| Stop loss | Entrada − 6 × ATR(14) diario |
| Take profit | Entrada + 2,1 × (distancia al stop) = 12,6 × ATR(14) |
| Gestión | SL y TP fijos, sin break-even ni trailing. Una posición por activo (hasta 8 a la vez) |
| Riesgo sugerido | 0,5–1 % del capital por operación (máximo 4–8 % abierto si están las 8) |

Resultados con costos (`resultados/E009/`, `resultados/E013/curva_candidata_B.png`):

| | Operaciones | Win rate [IC 95 %] | Payoff | PF | Expectancy | Max DD | Duración media |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selección 2010–2021 | 102 | 51,0 % [41,4–60,5] | 2,08 | 2,16 | +0,57 R | 7,0 R | 250 días |
| Validación 2022–2026 | 45 | 55,6 % [41,2–69,1] | 2,06 | 2,57 | +0,71 R | 6,2 R | 186 días |

- Total: +90,6 R en 16 años, unos 5,6 R por año. Con 1 % de riesgo por operación son unos 5,6 % anuales sin componer, con drawdowns de 7–10 %. El percentil 95 del drawdown por Monte Carlo es 10,1 R.
- Años positivos: 13 de 17.

**Por qué no es robusta:**
1. **No mejora al azar.** Comprar siempre esos activos con el mismo stop y TP da 49,5 % y 57,1 % (+92,3 R). El filtro de tendencia solo suaviza algo las caídas de 2020 y 2022.
2. **Es sensible al stop.** Con un stop 20 % más chico (4,8 ATR), la selección baja a 45,8 %.
3. **Depende del período.** Funciona porque las acciones (sobre todo de EE.UU. y Japón) y los metales subieron en 2010–2026. En un mercado bajista largo (acciones 2000–2009, oro 2011–2015) no hay evidencia de que funcione; el filtro la mantiene afuera, pero no gana.
4. **Muestra chica en validación:** 45 operaciones, con un intervalo de confianza de 41 % a 69 %.
5. Como inversión, rinde menos que tener un fondo indexado, porque la exposición promedio es baja.

## Qué se probó y qué dio (selección, con costos, RR 1:2–1:2,1)

| Familia | Experimento | Mejor win rate | Comentario |
| --- | --- | --- | --- |
| Entrada al azar (línea de base) | E001 | ~33 % sin deriva; hasta 55 % en oro largo con 3 ATR | Mide la deriva de cada activo, no es una señal |
| Tendencia y momentum (medias, Donchian, momentum, cruces) | E002, E003, E008 | 35–40 % en ambos lados; 52,5 % solo compras con 5–6 ATR | Ventaja real (PF 1,2–1,4) con el acierto de un seguidor de tendencias |
| Retrocesos dentro de la tendencia (RSI2, mínimos de 5/10 días, toque de EMA) | E004, E006, E011 | 45,5 % en 6 índices | Solo en EE.UU. llega a 50–59 %; no se generaliza |
| Reversión de corto plazo y días extremos | E004 | < 50 % | — |
| Régimen de volatilidad | E007 | sin mejora | Hipótesis rechazada |
| Intradía: ORB de NY, rango asiático, NR7, inside bar, RSI y Bollinger H1 | E005 | 27–37 % | En el rango del azar |
| Divergencias RSI(14) D1/H4 | E014 | 30–38 % | — |
| Multi-temporalidad: H4 dentro de la tendencia D1 | E014 | 33 % en ambos lados; 40 % solo compras | — |
| Aprendizaje automático (gradient boosting, 22 variables, walk-forward) | E010 | 30–36 % contra 32–33 % de base | No encuentra ventaja |
| Antecedentes en noticias-bot: 1.584 modelos SMC/ICT de LuxAlgo, Setup A+ y scalping en oro | — | 44 %, 42 % y < 50 % | — |

## Por qué es tan difícil (y no un problema de buscar más)

En un precio que se mueve al azar, 1:2 da exactamente 33,3 % de acierto. Para llegar al 50 % hace falta que, al entrar, el precio tenga una deriva a favor fuerte comparada con su volatilidad. Con la fórmula del movimiento browniano con deriva, eso exige **Sharpe diario × (stop en desvíos diarios) ≥ 0,24**. Por ejemplo:

- Con un stop de 1 desvío diario (lo típico intradía o swing corto) hace falta un Sharpe anual ≈ 3,8. Ninguna señal técnica lo tiene. Los mejores fondos sistemáticos andan en 0,5–1,5.
- Con stops de 5–6 desvíos diarios alcanza un Sharpe ≈ 0,7–0,8. Eso lo tienen los índices de EE.UU. o el oro en sus buenos períodos, sin necesidad de señal. Es exactamente lo que encontró el laboratorio.

Los datos confirman la teoría en todo el universo: forex se comporta como un paseo al azar (~33 %), y solo los activos con deriva llegan al 50 % con stops muy anchos (E001, E012).

## Fase 2 (27/11/2026): lo más cerca de una ventaja real

Después de la primera conclusión se probaron señales que tenían que **ganarle a comprar siempre** (E015–E017):

| Señal (9 activos con deriva, selección) | Mejor resultado | ¿Le gana a comprar siempre? | ¿Elegible? |
| --- | --- | --- | --- |
| Máximos de 52 y 26 semanas | 49,5 % (k = 6) | No (−0 a −5 puntos) | No |
| Estacionalidad noviembre–abril | 49,4 % | No | No |
| Momentum de corte transversal (top 2–3 por 6–12 meses) | 52,4–56,2 % (k = 6, n = 64–82) | **Sí (+2 a +9 puntos)** | No: menos de 100 operaciones |
| Retroceso solo en los líderes de momentum | 50,0 % (n = 100) y 52,5 % (n = 101) | **Sí (+5,5 puntos)** | No: los vecinos caen a 44–47 % |
| COT (posicionamiento de especuladores, 9 mercados) | 41,7 % | Algo (+6 puntos) | No |

El momentum de corte transversal (comprar los activos más fuertes y sus retrocesos) es la única señal que suma algo sobre la deriva de forma consistente. **Llega a 50 % con 1:2 solo con stops de 5–6 ATR, con ~100 operaciones en 11 años y sin estabilidad en los parámetros vecinos.** Con más historia, más activos o datos de calidad institucional podría confirmarse. Con estos datos no alcanza la robustez exigida. No se miró su validación para no gastar la muestra 2022–2026.

## Límites de este estudio

- Datos de HistData y Dukascopy (precios bid, sin volumen). No se pudieron probar volumen, order flow ni volume profile.
- Desde 2010: no incluye una década bajista completa de acciones.
- Se excluyeron el DAX (HistData mezcla el Euro Stoxx 50 entre junio de 2020 y diciembre de 2023) y el WTI (hueco de 940 días). Ver E000.
- Costos de broker minorista razonables (`docs/costos.md`); sin swaps ni financiación. **Las posiciones de 6–8 meses en CFD pagan financiación diaria, que reduciría bastante el resultado de la candidata B.**
- Se probaron unas 1.560 configuraciones (unas 165 en la fase 2). Aunque la validación se miró una sola vez, el riesgo de sobreajuste en la elección del stop (6 ATR, el mayor probado) existe.

## Recomendación

1. **No usar la candidata B esperando una ventaja.** Si se quiere ese perfil (largo plazo, comprado en tendencia), es más simple y barato invertir en un ETF de índice con una regla de salida por tendencia (precio bajo la SMA 200).
2. **Para trading activo, el criterio "50 % y 1:2" conviene reemplazarlo por expectancy y profit factor.** La tendencia en cartera da PF 1,2–1,4 con 35–40 % de acierto. El MSS Sweep Fib y el Setup A+ en M5 andan en 40–45 % con R:R real 1,3–2. Son perfiles realistas.
3. **Si igual se busca 50 % con 1:2**, hace falta información que el precio solo no da: datos fundamentales, flujo de órdenes o posicionamiento (COT, opciones), en horizontes de semanas. Es otro proyecto, con otras fuentes de datos.
