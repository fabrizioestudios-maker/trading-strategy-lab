# Bitácora — trading-strategy-lab

Misión: encontrar y validar una estrategia con **win rate ≥ 50 %, RR real ≥ 1:2, expectancy positiva y robustez**, o demostrar por qué no aparece con el enfoque usado.

Cómo retomar:
- Leé esta bitácora de abajo hacia arriba: la entrada más nueva está al final.
- Después leé `docs/criterios.md` (las reglas no se cambian para hacer pasar una estrategia) y `docs/plan.md`.
- Los datos se bajan con `lab/descarga_histdata.py`; lo explica `data/README.md`.

---

## 2026-11-26 18:35 UTC — Entrada 1: arranque, criterios y plan

**Qué se hizo**
- Se creó el repositorio local `trading-strategy-lab` con la estructura `lab/` (código), `experimentos/` (un script por experimento), `resultados/` y `docs/`.
- Se fijaron los criterios de aceptación **antes** de mirar cualquier resultado (`docs/criterios.md`):
  - Selección hasta 2021 y validación 2022–2026.
  - WR ≥ 50 % y payoff real ≥ 2 en las dos muestras.
  - Al menos 100 operaciones.
  - SL y TP fijos, con costos.
  - Si el SL y el TP caen en el mismo minuto, cuenta el SL.
- Se escribió el plan (`docs/plan.md`).

**Qué se descubrió (análisis previo)**
- En un paseo al azar, 1:2 da 33,3 % de acierto. Para llegar al 50 % hace falta una deriva a favor con θ = 2·μ·a/σ² ≈ 0,48, donde `a` es la distancia al stop.
- Por eso conviene buscar en temporalidades altas, con stops anchos y en contextos de tendencia, y hay que desconfiar de los stops chicos, donde mandan los costos.
- Antecedentes en noticias-bot: 1.584 combinaciones de LuxAlgo con máximo 44 %, Setup A+ con máximo 42 % y scalping en el oro sin éxito.

**Resultados numéricos:** ninguno todavía.

**Limitación:** desde la sesión de Claude no se pueden crear repositorios nuevos en GitHub. Fabrizio tiene que crear `trading-strategy-lab` vacío. Mientras tanto la historia se respalda en la rama `ccr-47b7af70-05ostp` de `senales-vip`.

**Próximos pasos**
1. Descargar M1 de HistData para EURUSD, GBPUSD, USDJPY, AUDUSD, SPXUSD, NSXUSD y GRXEUR (2016–2026) y normalizar a UTC.
2. Motor de backtest en numba y prueba contra el caso teórico.
3. Línea de base empírica (entradas al azar por instrumento, dirección y stop).

---

## 2026-11-26 18:55 UTC — Entrada 2: infraestructura lista y línea de base (E001)

**Qué se hizo**
- `lab/descarga_histdata.py`: descarga de HistData (M1, bid, EST fijo → UTC). Corre de fondo para EURUSD, SPXUSD, GBPUSD, NSXUSD, USDJPY, GRXEUR y AUDUSD, 2016–nov 2026.
- `lab/datos.py`: carga, velas de cualquier temporalidad (H4 y D1 cierran a las 17:00 de Nueva York), ATR de Wilder y costos.
- El oro 2018–2026 (3,1 millones de minutos) se tomó del reproductor del proyecto.
- Corrección: con pandas 3, la conversión de horario cambió de unidad y cada minuto quedaba como una vela diaria. Se detectó al verificar y se corrigió antes de usar los datos.
- `lab/motor.py`: motor numba. Reglas:
  - entrada en la apertura siguiente al cierre de la señal;
  - SL y TP en M1;
  - SL primero si los dos caen en el mismo minuto;
  - salida en la apertura cuando hay hueco en contra;
  - costos ida y vuelta.
- `lab/metricas.py`: WR con intervalo de Wilson, payoff, PF, expectancy, max DD y resultados por año.
- `tests/test_motor.py` (6 pruebas, todas pasan):
  - casos a mano (mismo minuto, hueco, costos, sin superponer);
  - paseo al azar: con 1:2 da 1/3;
  - con deriva coincide con la fórmula teórica.
- E001 (`experimentos/E001_linea_base.py`): se entra en cada cierre de H1, H4 y D1, en las dos direcciones, con SL = k·ATR (k de 0,5 a 3) y TP = 2·SL, permitiendo superposición. Mide P(TP antes que SL) sin ninguna señal.

**Resultados (con costos, WR %)**

| | k (ATR) | Selección (<2022) largo / corto | Validación (2022–26) largo / corto |
| --- | --- | --- | --- |
| EURUSD H1–D1 | 0,5–3 | 29–35 / 30–42 | 31–35 / 29–35 |
| XAUUSD H1 | 3 | 36,3 / 30,4 | 37,1 / 30,6 |
| XAUUSD H4 | 3 | 38,4 / 27,5 | 42,7 / 26,3 |
| XAUUSD D1 | 2 | 45,1 / 25,8 | 49,5 / 27,5 |
| XAUUSD D1 | 3 | **53,2** / 25,0 | **55,0** / 27,3 |

Oro D1, largo, k = 3: 1.022 entradas en selección (expectancy +0,59 R) y 1.261 en validación (+0,65 R). Son superpuestas: no es una estrategia operable así.

**Qué se descubrió**
- EURUSD se comporta como un paseo al azar: ~33 % con 1:2 en todas las combinaciones. Ninguna dirección tiene deriva.
- En el oro, comprar a ciegas con stops anchos (3 ATR diarios) ya supera el 50 % en las dos muestras. **Es la deriva alcista del oro 2018–2026 (de 1.300 a 3.600 USD), no una habilidad.** Vender a ciegas da 25–27 %.
- La teoría se cumple:
  - θ = 2·μ·a/σ² crece con el stop.
  - En términos de Sharpe: hace falta Sharpe_diario × (stop en σ diarios) ≥ 0,24.
  - Con stops de 1 σ diario se necesitaría un Sharpe anual ≈ 3,8, que no es realista.
  - Con stops de 3 σ basta Sharpe ≈ 1,3; con 5 σ, Sharpe ≈ 0,8.
- Conclusión de diseño: el camino realista hacia 50 % con 1:2 son **stops anchos (3–5 σ diarios) con un filtro de dirección que tenga Sharpe ≈ 0,8–1,3** (momentum o tendencia), operado en **varios instrumentos** para juntar más de 100 operaciones.
- Riesgo a vigilar: confundir la deriva de un período (beta) con una ventaja. Por eso hace falta el oro de 2010–2017, con la caída de 2011–2015.

**Próximos pasos**
1. Bajar XAUUSD 2010–2017 (archivo aparte), XAGUSD y WTIUSD 2016–2026.
2. Correr E001 en todos los instrumentos.
3. E002: filtros de tendencia y momentum (pendiente de la SMA 200, momentum de 3–12 meses, Donchian) con stops anchos, por instrumento y en cartera, solo con la muestra de selección.

---

## 2026-11-26 19:35 UTC — Entrada 3: filtros de tendencia (E002) y estrategias operables (E003)

**Qué se hizo**
- `lab/senales.py`:
  - posición del cierre respecto de la SMA 50/100/200;
  - pendiente de la SMA;
  - momentum de 21, 63, 126 y 252 días;
  - cruces 20/100 y 50/200;
  - Donchian 20/55/100 (estado y ruptura);
  - combinaciones.
- E002: acierto condicionado al filtro (entradas superpuestas, D1, SL de 2 a 5 ATR, TP 2×). Oro, EURUSD y SPX500, solo selección.
- `lab/estrategia.py` + E003: estrategias operables, con una operación a la vez, reglas idénticas en compra y venta (y variante solo compras) y modos "estado" (entra mientras dure la tendencia) y "cambio" (solo al cambiar).
- Se bajó XAUUSD 2010–2017 de HistData y se unió con 2018–2026: empalme sin hueco, 5,9 millones de minutos. La muestra de selección del oro pasa a ser **2010–2021**, que incluye la caída de 2011–2015.

**Resultados**

E002, oro, selección 2018–2021, entradas superpuestas:
- Compra con estado Donchian 100: 68,9 % con k = 3 (línea de base 53,3 %).
- Compra con pendiente de la SMA100: 63–69 % con k = 3–4.
- Venta: 3–34 % con todos los filtros.

E002, otros instrumentos, selección:
- SPX500 compra: 50–64 %; la línea de base ya daba 54 % con k = 3.
- EURUSD: solo la venta con pendiente de la SMA100 y k = 4 supera el 50 % (56,4 %); la compra se queda en 27–45 %.

E003 (operable):
- Oro 2018–2021: 51–67 %, pero con solo 3 a 43 operaciones.
- **Oro 2010–2021 (con la caída):**
  - Ambos lados: máximo **42,5 %** (pendiente SMA100 o momentum 126d, k = 4, 40 operaciones, +0,27 R).
  - Solo compras: momentum 126d con k = 2 da 45,7 % (92 operaciones, +0,36 R, max DD 10 R).
- EURUSD y SPX500 dan entre 4 y 33 operaciones por configuración: muy pocas para concluir.

**Qué se descubrió**
1. **Los 57–69 % del oro 2018–2021 eran la tendencia alcista del período.** Con 2010–2021 las mismas reglas caen a 40–46 %. La tendencia sigue dando expectancy positiva (+0,2 a +0,36 R, PF 1,4–1,7), pero con un acierto de seguidor de tendencias, no de 50 %.
2. Es lo que predice la teoría de la entrada 2: estas señales tienen un Sharpe por activo de ~0,4–0,6. Con stops de 3–5 σ diarios eso da 40–45 % con 1:2.
3. **Payoff real con TP = 2·SL: 1,98–1,99.** Los costos lo bajan un poco del 2,0 que piden los criterios. Para las candidatas finales el TP va a ser 2,1·SL. No es un cambio de criterio, es cumplirlo.
4. Con una operación a la vez y stops anchos en diario, cada instrumento da muy pocas operaciones (4–40 en 4–6 años). Para llegar a más de 100 hacen falta muchos instrumentos y más historia. Se bajan 2010–2015 de todos, más XAGUSD y WTIUSD.

**Próximos pasos**
1. E001 a E003 en el universo completo, con la selección 2010–2021.
2. E004: entradas en retroceso dentro de la tendencia, reversión de corto plazo y combinaciones, para ver si mejoran el momento de entrada.
3. E005: barrido intradía (ORB, rango asiático, NR7/inside bar, RSI) para documentar lo que no sirve con números.

---

## 2026-11-26 19:55 UTC — Entrada 4: retrocesos en tendencia y reversión (E004)

**Qué se hizo**
- Se agregaron eventos a `lab/senales.py`:
  - RSI(2) bajo o alto dentro de la tendencia;
  - cierre en el mínimo de 5 o 10 días dentro de la tendencia;
  - toque de la EMA 20/50 dentro de la tendencia;
  - reversión con RSI(2) en < 5 o > 95;
  - día extremo (más de 2 ATR) operado en contra.
- La tendencia se define como cierre sobre la SMA 200 con la SMA subiendo en 20 días.
- E004 en XAUUSD, SPX500, NAS100, EURUSD y GBPUSD (D1, solo selección): SL de 1 a 3 ATR, TP = 2,1·SL, como evento superpuesto y como estrategia operable (una a la vez).

**Resultados (operables, selección, con 20 o más operaciones)**

| Instrumento | Evento | k | Operaciones | WR | Expectancy |
| --- | --- | --- | --- | --- | --- |
| SPX500 | cierre en mínimo de 10 días en tendencia, compra | 3 | 32 | 59,4 % | +0,83 R |
| NAS100 | cierre en mínimo de 10 días en tendencia, compra | 3 | 35 | 57,1 % | +0,77 R |
| SPX500 | RSI2 < 25 en tendencia, compra | 3 | 33 | 54,5 % | +0,68 R |
| NAS100 | RSI2 < 25 en tendencia, compra | 3 | 35 | 54,3 % | +0,68 R |
| SPX500 | tendencia 200, todas las velas, compra | 3 | 37 | 48,6 % | +0,50 R |
| XAUUSD (2010–21) | RSI2 < 10 en tendencia, compra | 3 | 20 | 45,0 % | +0,39 R |
| EURUSD | mejor caso | 1,5 | 34 | 47,1 % | +0,45 R |

- Las ventas en tendencia bajista no aparecen arriba: quedaron todas por debajo de 45 %.

**Qué se descubrió**
- La única familia que supera el 50 % en selección es **comprar retrocesos de índices de acciones dentro de una tendencia alcista**, con stops anchos (3 ATR).
  - Mejora la entrada respecto de entrar en cualquier vela de tendencia: 54–59 % contra 46–49 %.
  - Tiene una explicación económica conocida: la prima de riesgo de las acciones más la reversión de corto plazo de los índices.
- En oro y forex los retrocesos no llegan al 50 %.
- **Hay que desconfiar:**
  - la selección de los índices (2016–2021) fue mayormente alcista;
  - son 32–35 operaciones por índice, y con n = 32 el intervalo de 95 % de un 59 % va de 42 % a 74 %.
  - Hace falta más historia (2010–2015) y más índices (DAX, Nikkei, FTSE, CAC, ASX) antes de mirar la validación.

**Próximos pasos**
1. Descargas encoladas: GRXEUR, USDJPY y AUDUSD 2010–2015; JPXJPY, UKXGBP, FRXEUR y AUXAUD 2010–2026.
2. E006: la familia de retrocesos en índices con selección 2010–2021 en 7 índices y reglas idénticas en todos, sin elegir parámetros por índice.
3. E005, en paralelo: barrido intradía para documentar.

---

## 2026-11-26 20:20 UTC — Entrada 5: barrido intradía (E005), sin candidatas

**Qué se hizo**
- E005 en XAUUSD (2010–2021), EURUSD y SPX500 (2016–2021), solo selección, una operación a la vez, TP = 2,1·SL, con y sin costos:
  - A: ruptura del rango de apertura de Nueva York (09:30–10:00, ruptura por cierre de M5 hasta las 12:00).
  - B: ruptura del rango asiático durante Londres.
  - C: ruptura al día siguiente de una vela NR7 o un inside bar diario, con SL en el otro lado de la vela.
  - D: RSI(14) H1 < 30 o > 70, operado en contra.
  - E: cierre fuera de Bollinger(20,2) H1, operado en contra.

**Resultados (WR con costos, n entre 159 y 3.903 por combinación)**

| | A | B | C NR7 | C inside | D | E |
| --- | --- | --- | --- | --- | --- | --- |
| XAUUSD | 33,6 % | 34,7 % | 33,3 % | 29,4 % | 30,4 % | 31,4 % |
| EURUSD | 30,7 % | 31,1 % | 28,0 % | 27,4 % | 31,2 % | 31,0 % |
| SPX500 | 32,3 % | 32,4 % | **37,1 %** (+0,08 R) | 32,8 % | 31,5 % | 32,8 % |

**Qué se descubrió**
- Todas las familias intradía quedan en el rango del azar (27–37 %, contra 32 % de una entrada a ciegas con 1:2,1).
- La mejor, la ruptura tras NR7 en el SPX500 (37,1 %, +0,08 R), está lejos del 50 %.
- Esto coincide con los 1.584 modelos SMC/ICT probados antes y con la teoría: con stops intradía (fracciones de un σ diario) haría falta un Sharpe imposible para llegar al 50 % con 1:2.
- Se descarta la búsqueda intradía como camino hacia el objetivo. Queda documentada.

**Próximos pasos:** E006, retrocesos en índices con más historia y más índices.

---

## 2026-11-26 20:50 UTC — Entrada 6: retrocesos en índices con más historia (E006) y régimen de volatilidad (E007)

**Qué se hizo**
- Se bajó 2010–2015 de EURUSD, GBPUSD, SPX500 y NAS100 y se unió con 2016–2026 (`lab.datos.unir_historia`).
  - Saltos en el empalme: 0,003–0,14 %, por el feriado de año nuevo.
  - SPX500 y NAS100 arrancan en noviembre de 2010, como HistData.
- E006: compra de retrocesos en índices con reglas idénticas para todos.
  - Tendencia: cierre sobre la SMA 200 y la SMA subiendo.
  - Eventos: cierre en el mínimo de 10 o 5 días, RSI2 < 25, RSI2 < 10 y un control que entra en cualquier vela en tendencia.
  - k de 2 a 3,5 y TP = 2,1·SL.
  - Una operación a la vez por índice. SPX500, NAS100 y DAX, selección 2010–2021.
- E007: los mismos retrocesos separados por régimen de volatilidad (ATR(20)/precio contra su mediana de un año).

**Resultados (selección)**

| | k | SPX500 | NAS100 | DAX | Cartera (n) | Cartera WR | Límite inferior 95 % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cierre en mínimo de 10 días | 3,0 | 54,7 % | 47,4 % | 33,3 % | 128 | 48,4 % | 40,0 % |
| Cierre en mínimo de 10 días | 3,5 | 52,5 % | 53,3 % | 38,5 % | 98 | **51,0 %** (PF 2,16, +0,57 R, 90 % de años positivos) | 41,3 % |
| RSI2 < 25 | 3,5 | 50,0 % | 55,1 % | 31,2 % | 109 | 49,5 % | 40,3 % |
| Control: cualquier vela en tendencia | 3,0 | 47,5 % | 47,8 % | 34,8 % | 151 | 45,7 % | 38,0 % |

E007 (cartera, cierre en mínimo de 10 días):

| k | Volatilidad baja | Volatilidad alta | Todos |
| --- | --- | --- | --- |
| 3 | 46,2 % (93) | 54,1 % (61) | 48,4 % |
| 3,5 | 45,6 % | 51,1 % | 51,0 % |

**Qué se descubrió**
- Con 2010–2021, el SPX500 bajó de 59,4 % (2016–21) a 54,7 %. **El DAX no sigue el patrón (26–38 %).** El efecto parece de los índices de EE.UU. Y SPX500 y NAS100 están muy correlacionados: no son dos pruebas independientes.
- Esperar el retroceso suma 3–5 puntos sobre comprar cualquier vela en tendencia (48,4 % contra 45,7 % con k = 3).
- **El 51,0 % de la cartera es el mejor de 20 configuraciones.** Con prueba múltiple y un límite inferior de 41 %, no alcanza para declarar nada.
- **Hipótesis rechazada:** "la volatilidad baja mejora los retrocesos". Da igual o peor. La alta da algo más, pero dentro del ruido (n = 61).

**Próximos pasos**
1. Terminar de bajar el DAX 2010–2015, Nikkei, FTSE, CAC y ASX.
2. Correr E006 en los 7 índices, sumando k = 4 y 5. La teoría dice que el acierto sube con el stop.
3. Elegir **una** configuración con la selección y recién entonces mirar la validación 2022–2026.

---

## 2026-11-26 21:40 UTC — Entrada 7: cartera de tendencia (E008) y aprendizaje automático (E010)

**Qué se hizo**
- Se bajaron XAGUSD y WTIUSD 2010–2026 y el DAX, USDJPY y AUDUSD 2010–2015 (ya unidos). Se agregaron sus costos en `docs/costos.md`.
- E008: cartera de tendencia con reglas idénticas en todos los instrumentos.
  - Filtros: momentum 126 y 252 días, pendiente de la SMA100, Donchian 100 y tendencia 200.
  - k de 3, 4 y 5, TP = 2,1·SL.
  - Dos variantes: ambos lados en todo el universo, y solo compras en activos con deriva de largo plazo (oro, plata, índices).
  - Selección 2010–2021 en XAUUSD, XAGUSD, EURUSD, GBPUSD, SPX500, NAS100 y WTIUSD.
- E010: gradient boosting (scikit-learn), walk-forward 2013–2021.
  - Predice P(TP antes que SL) con 1:2,1 a partir de 22 variables técnicas ajustadas por dirección: retornos de 1 a 252 días, distancias y pendientes de medias, RSI, posición en rangos, volatilidad, calendario y clase de activo.
  - Sin filtración: cada año se entrena solo con operaciones ya cerradas, y el umbral sale de las predicciones de entrenamiento.
  - Se operan los mejores 20 %, 10 % y 5 %, una operación a la vez.

**Resultados**

E008 (selección, cartera):
- Ambos lados: WR 35,6–40,5 %, expectancy +0,10 a +0,25 R, PF 1,15–1,42 en las 15 configuraciones.
- Solo compras en activos con deriva:
  - k = 3: 40,8–45,4 %.
  - k = 4: 44,4–47,5 %.
  - k = 5: 44,8–**52,5 %**. El 52,5 % es tendencia 200 con 80 operaciones, límite inferior del 95 % en 41,7 %.

E010 (walk-forward, con costos):

| Stop | Mejores 20 % | Mejores 10 % | Mejores 5 % | Tasa base |
| --- | --- | --- | --- | --- |
| 2 ATR | 29,0 % (677) | 33,9 % (416) | 34,0 % (238) | 33,2 % |
| 3 ATR | 36,3 % (333) | 32,2 % (239) | 31,6 % (158) | 33,5 % |

**Qué se descubrió**
- **La tendencia operada en las dos direcciones da 35–40 % con 1:2.** Tiene ventaja (expectancy positiva y PF de 1,2 a 1,4), pero con el acierto típico de un seguidor de tendencias.
- **El 50 % solo aparece al combinar solo compras, activos con deriva y stops de 5 ATR**, con pocas operaciones (80 en 11 años de selección). Vuelve a ser la deriva más los stops anchos, como predice la teoría.
- **El modelo de aprendizaje automático no supera la tasa base.** Entre 22 variables técnicas no aparece nada que mejore de forma estable la probabilidad de 1:2 a un día vista. Es la evidencia más fuerte de que no hay una combinación de indicadores escondida que las reglas simples no hayan visto.
- Configuraciones probadas hasta ahora en este laboratorio: unas 1.700 (E002–E010). Más los 1.584 de LuxAlgo y los 43 de Setup A+ en noticias-bot.

**Próximos pasos**
1. Terminar los índices (Nikkei, FTSE, CAC, ASX).
2. Correr las dos familias candidatas en todo el universo de activos con deriva: retrocesos en tendencia (E006) y solo compras con stops anchos (E008).
3. Elegir una configuración con la selección y validarla con E009.
