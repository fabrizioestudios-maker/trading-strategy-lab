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

---

## 2026-11-26 21:50 UTC — Entrada 8: regla de elección de candidatas (escrita antes de verlas)

Se escribe antes de correr las dos familias en el universo completo y antes de mirar cualquier dato de validación.

**Familias candidatas**
- **A. Retrocesos en tendencia alcista:**
  - Universo: los 7 índices (SPX500, NAS100, DAX, Nikkei, FTSE, CAC, ASX).
  - Eventos: cierre en el mínimo de 10 días, cierre en el mínimo de 5 días o RSI2 < 25, dentro de la tendencia 200 (cierre sobre la SMA 200 y la SMA subiendo).
  - k de 2,5 a 5 ATR.
- **B. Solo compras con stops anchos en activos con deriva:**
  - Universo: los 7 índices más el oro y la plata.
  - Señal: tendencia 200 o momentum de 252 días positivo.
  - k de 4 a 6 ATR.
- En las dos: TP = 2,1·SL y una operación a la vez por instrumento.

**Regla de elección (solo con la selección 2010–2021)**
1. Cartera con al menos 100 operaciones en selección.
2. WR ≥ 50 % y payoff ≥ 2 en selección.
3. Meseta: los vecinos en k (±0,5 ATR) tienen WR ≥ 47 %.
4. Entre las que cumplen, se elige la de mayor WR en selección. Una por familia, como máximo dos candidatas.
5. Las elegidas se validan una sola vez con E009 (2022–2026). Si la validación falla, no se busca otra configuración mirando la validación: la familia queda descartada con ese enfoque.

---

## 2026-11-26 22:15 UTC — Entrada 9: control de calidad de datos (E000); se excluyen DAX y WTI

**Qué se hizo**
- E000 (`experimentos/E000_calidad_datos.py`) revisa en cada instrumento:
  - saltos diarios mayores al 15 %;
  - huecos;
  - precios no positivos.
- E012 calcula el Sharpe realizado por instrumento y el acierto que predice la teoría para comprar siempre con 1:2.

**Qué se descubrió**
- **DAX (GRXEUR) corrupto:** entre el 14/06/2020 y el 01/12/2023, HistData trae otra serie, que parece el Euro Stoxx 50 (3.178–4.424 cuando el DAX estaba en 12.000–16.600). Hay saltos de −132,9 % y +131,2 %.
  - **Los resultados del DAX en E001, E004, E006 y E007 no valen** desde junio de 2020; los de 2010–2019 sí. El mal resultado del DAX en E006 puede deberse en parte a esto.
  - Se excluye el DAX del universo.
- **WTI:** tiene un hueco de 940 días y saltos de −50 %, +21 % y −32 % en marzo y abril de 2020, cuando el petróleo cotizó negativo. Se excluye; afecta un poco a E008 y E010, que lo incluían.
- **Plata:** caídas de −30,8 % y −21,8 % a fines de enero y principios de febrero de 2026. No se pudieron verificar con otra fuente. Se mantiene y se anota.
- El resto (oro, forex, SPX500, NAS100, Nikkei, FTSE) no tiene saltos imposibles.
- Sharpe realizado por instrumento (E012) y acierto teórico de comprar siempre con 1:2 y stop de 5 σ diarios:

| | SPX500 | NAS100 | Nikkei | Oro | EURUSD |
| --- | --- | --- | --- | --- | --- |
| Sharpe selección | 0,69 | 0,88 | 0,41 | 0,25 | −0,22 |
| Sharpe validación | 0,52 | 0,45 | 0,63 | 0,71 | −0,08 |
| Teoría con 5 σ, selección | 48,3 % | 52,5 % | 42,3 % | 38,7 % | 28,9 % |

  Esto confirma que el 50 % con stops anchos solo lo da un activo con Sharpe cerca de 0,8 o más en ese período.

**Próximos pasos:** E011 con los índices limpios (SPX500, NAS100, Nikkei, FTSE, CAC y ASX) más oro y plata.

---

## 2026-11-26 23:00 UTC — Entrada 10: elección (E011) y validación de la única candidata (E009, E013)

**Qué se hizo**
- Se bajaron Nikkei, FTSE, CAC y ASX 2010–2026 (pasan el control de calidad).
- E010 se repitió con el universo limpio, sin WTI ni DAX: mejores 5–20 % con 30,5–35,7 % contra una tasa base de 32,4 %. El aprendizaje automático sigue sin ventaja.
- E011 aplicó la regla de la entrada 8 a las dos familias con la selección 2010–2021:
  - Universo A: 6 índices (SPX500, NAS100, Nikkei, FTSE, CAC, ASX).
  - Universo B: esos 6 más oro y plata.
- E009 validó **una sola vez** la candidata elegida (2022–2026).
- E013 graficó la curva de la candidata contra comprar siempre.

**Resultados de la elección (selección 2010–2021)**
- **Familia A, retrocesos en índices: ninguna elegible.** Da 37,9–45,5 % en las 18 configuraciones.
  - El efecto existe solo en EE.UU.: SPX500 50,7–59,4 % y NAS100 45,5–53,8 %.
  - En Nikkei, FTSE, CAC y ASX da 25–47 %. No se generaliza: **se descarta.**
- **Familia B, solo compras en tendencia con stops anchos: una elegible.**
  - Señal: tendencia 200. Stop de 6 ATR (el mayor probado), TP = 2,1·SL.
  - 51,0 %, n = 102, PF 2,16. El vecino de 5,5 ATR da 49,2 %.
  - Con momentum 252 d y 6 ATR: 50,5 %, pero n = 99 (menos de 100).

**Validación de la candidata B (E009)** — tendencia 200, solo compras, SL 6 ATR(14) diario, TP 2,1·SL, una operación a la vez en 8 activos:

| | n | WR [IC 95 %] | Payoff | PF | Expectancy | Max DD | Duración media |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selección 2010–21 | 102 | 51,0 % [41,4–60,5] | 2,08 | 2,16 | +0,57 R | 7,0 R | 250 días |
| Validación 2022–26 | 45 | 55,6 % [41,2–69,1] | 2,06 | 2,57 | +0,71 R | 6,2 R | 186 días |
| Comprar siempre, mismo SL/TP (selección) | 103 | 49,5 % | 2,09 | 2,05 | +0,53 R | 10,0 R | |
| Comprar siempre, mismo SL/TP (validación) | 49 | 57,1 % | 2,09 | 2,79 | +0,77 R | 6,0 R | |

- Años positivos: 13 de 17 (76 %). Drawdown por Monte Carlo: mediana 6,2 R, percentil 95 de 10,1 R.
- Por activo en validación:
  - Ganan: Nikkei 57 %, NAS100 57 %, SPX500 50 %, oro 75 %, plata 71 %.
  - Pierden: CAC 25 %, FTSE 40 %, ASX 0 de 1.
- Vecinos (±20 % en k):
  - 4,8 ATR: selección 45,8 %, validación 50,7 %.
  - 7,2 ATR: selección 47,8 %, validación 63,9 %.

**Veredicto sobre los criterios (`docs/criterios.md`)**
- Criterios mínimos de la misión: **CUMPLE.** WR ≥ 50 % y payoff ≥ 2 en las dos muestras, expectancy positiva y 147 operaciones (45 en validación).
- Robustez:
  - ✅ años positivos ≥ 70 %;
  - ✅ funciona en más de un instrumento de la clase;
  - ❌ **vecinos:** con 4,8 ATR la selección baja a 45,8 % (se pedía 47 % o más);
  - ❌ **contra el azar:** el límite inferior de Wilson de la validación (41,2 %) no supera el 57,1 % de comprar siempre con el mismo SL/TP.

**Qué se descubrió**
1. **La única estrategia que cumple los números de la misión no tiene una ventaja propia.**
   - Gana lo mismo que comprar siempre esos activos con stops de 6 ATR y TP de 12,6 ATR: +90,6 R contra +92,3 R en 16 años (gráfico `resultados/E013/curva_candidata_B.png`).
   - El filtro de tendencia solo suaviza las caídas (2020, 2022).
   - Lo que paga es la deriva alcista de los índices y los metales en 2010–2026, tomada con stops tan anchos que cada operación dura 6–8 meses.
2. Es lo que anticipaba la teoría de la entrada 2. Con un Sharpe de 0,5–0,9 por activo, el 50 % con 1:2 solo aparece con stops de 5–6 σ diarios. Así la "estrategia" se parece más a una inversión con stop que a un sistema de trading.
3. **Riesgo principal:** depende de que esos activos sigan subiendo. Fuera de 2010–2026 (por ejemplo, las acciones en 2000–2009 o el oro en 2011–2015) no hay evidencia; en el oro 2011–2015 el filtro de tendencia la habría tenido casi siempre afuera.

**Próximos pasos**
1. Completar las familias que faltan del pedido original: divergencias (E014) y multi-temporalidad (H4 dentro de la tendencia D1).
2. Conclusiones finales.

---

## 2026-11-26 23:55 UTC — Entrada 11: divergencias y multi-temporalidad (E014)

**Qué se hizo**
- E014, en 12 instrumentos limpios (4 de forex, 6 índices, oro y plata), solo selección, una operación a la vez, TP = 2,1·SL:
  - Divergencias de RSI(14) en D1 y H4: pivotes 5/5, el segundo giro más extremo con el RSI en contra y como mucho 60 velas entre giros. SL en la estructura (giro ± 0,25 ATR) o a 2 ATR.
  - Multi-temporalidad: tendencia diaria (SMA 200 con pendiente) y retroceso en H4 (RSI2 < 10 o mínimo de 10 velas). SL a 3, 4 o 6 ATR de H4. En ambos lados o solo compras en activos con deriva.

**Resultados (cartera, selección)**
- Divergencias:
  - D1 con SL a 2 ATR: 37,8 % (n = 476).
  - D1 con SL en la estructura: 30,0 %.
  - H4: 30,3–31,8 %.
- Multi-temporalidad:
  - Ambos lados: 32,5–33,2 % (n de 760 a 3.066), expectancy ≈ 0.
  - Solo compras en activos con deriva: 34,9–40,4 %. El mejor es mínimo de 10 velas H4 con 6 ATR: 40,4 %, n = 381, PF 1,41.

**Qué se descubrió**
- Ni las divergencias ni la combinación de temporalidades se acercan al 50 % con 1:2.
- Operada en las dos direcciones, la combinación de temporalidades queda en el azar (33 %). Solo compras toma algo de deriva (40 %).
- Con esto quedan probadas todas las familias que se pueden probar con estos datos: indicadores clásicos, price action, estructura, divergencias, multi-temporalidad, medias, momentum, retrocesos, reversión, sesiones, compresión y ruptura, y aprendizaje automático.
- Volumen, volume profile y order flow no se pueden probar: HistData no trae volumen.

**Próximos pasos:** conclusiones finales.

---

## 2026-11-27 00:05 UTC — Entrada 12: conclusiones finales

**Qué se hizo:** se escribió `docs/conclusiones.md` con:
- la estrategia definida;
- los resultados de selección y validación;
- el veredicto de robustez;
- la tabla de todas las familias probadas;
- la explicación teórica;
- los límites del estudio y las recomendaciones.

**Resultado de la misión**
- **Se encontró una estrategia que cumple los criterios mínimos**: tendencia de largo plazo, solo compras, SL de 6 ATR y TP de 2,1·SL en 6 índices, oro y plata.
  - Selección: 51,0 %, payoff 2,08, PF 2,16, n = 102.
  - Validación: 55,6 %, payoff 2,06, PF 2,57, n = 45.
- **No es robusta como ventaja:**
  - es igual a comprar siempre con el mismo SL/TP (+90,6 R contra +92,3 R);
  - es sensible al stop (4,8 ATR da 45,8 %);
  - depende de la deriva alcista de 2010–2026;
  - dura 6–8 meses por operación;
  - en CFD pagaría financiación, que no se modeló.
- **Con señales técnicas no aparece 50 % con 1:2**: 27–45 % en unas 1.400 configuraciones del laboratorio, más unas 1.600 anteriores.
- La teoría lo explica: hace falta Sharpe_diario × stop (en σ diarios) ≥ 0,24. Eso es imposible con stops chicos, y con stops grandes solo lo da la deriva del activo.

**Próximos pasos posibles (decisión de Fabrizio)**
1. Aceptar otra métrica de éxito (expectancy y PF con 35–45 % de acierto), donde sí hay candidatas.
2. Buscar fuentes de datos que no sean precio (COT, posicionamiento en opciones, fundamentales) para un estudio nuevo.
3. Llevar la candidata B a demo, sabiendo que es "comprar índices y metales en tendencia con stops amplios".

---

## 2026-11-27 00:20 UTC — Entrada 13: fase 2, hipótesis nuevas y un criterio más (escrito antes de probar)

**Contexto:** Fabrizio pidió continuar. La única candidata (B) cumple los números, pero no le gana a comprar siempre con el mismo SL/TP. La fase 2 busca señales que **agreguen algo sobre la deriva**.

**Criterio adicional desde ahora (aprendido con la candidata B)**
- En la muestra de selección, la estrategia tiene que superar a "comprar siempre" (mismos activos, mismo SL/TP, una operación a la vez) por **al menos 3 puntos de WR y con mayor expectancy**.
- En validación, el límite inferior de Wilson de su WR tiene que superar el WR de comprar siempre (ya estaba en `docs/criterios.md`, ahora es excluyente).

**Hipótesis de precio (E015), con economía detrás**
1. **Máximos de 52 semanas:** comprar cuando el cierre marca máximo de 252 días. La literatura muestra que los activos en máximos anuales siguen rindiendo más (anclaje de los inversores).
2. **Momentum de corte transversal:** cada mes se compran solo los 2–3 activos con mejor retorno de 6 o 12 meses (y retorno positivo) entre los 8 con deriva. Concentra la exposición donde la deriva es mayor.
3. **Estacionalidad:** solo operar compras en noviembre–abril, el "efecto Halloween" de los índices.

Para las tres: TP = 2,1·SL, k de 3 a 6 ATR, la misma regla de elección de la entrada 8 más el criterio nuevo, y la validación se mira una sola vez.

**Hipótesis con datos que no son precio (E016)**
- **Posicionamiento del COT (CFTC):** extremos del posicionamiento neto de los especuladores como señal contraria o de continuación en oro, índices y forex, en horizontes de semanas.
- Necesita habilitar `publicreporting.cftc.gov` en el entorno. Es la misma fuente oficial que ya usa el bot del calendario.

---

## 2026-11-27 01:20 UTC — Entrada 14: fase 2, máximos, momentum transversal, estacionalidad (E015) y COT (E016)

**Qué se hizo**
- E015 (8 activos con deriva, solo selección, solo compras, SL de 3 a 6 ATR, TP 2,1·SL). Se compararon con "comprar siempre" (mismo universo, mismo SL/TP) estas señales:
  - máximo de 252 y 126 días;
  - momentum de corte transversal (los 2 o 3 mejores de 126 o 252 días con retorno positivo, elegidos a fin de mes);
  - estacionalidad noviembre–abril, con y sin tendencia.
- E015b: momentum de corte transversal en los 12 instrumentos limpios (sumando forex), quedándose con los 2, 3 o 4 mejores, y una variante que además vende los peores.
- Se habilitó `publicreporting.cftc.gov` (aprobado) y se escribió `lab/cot.py`:
  - historial semanal 2006–2026 de 9 mercados;
  - TFF "leveraged money" para forex e índices, Disaggregated "managed money" para oro y plata;
  - el reporte rige desde el cierre del viernes de publicación.
- E016: 4 hipótesis del COT registradas antes de ver resultados.
- **Error detectado y corregido antes de concluir:** la conversión de fechas del COT a velas diarias asumía nanosegundos (pandas 3 usa otra unidad) y todas las velas tomaban el último valor. Se corrigió y se verificó con un caso puntual: el lunes 23/03/2020 rige el reporte del 17/03. La primera corrida de E016 se descartó.
- Euro Stoxx 50 (ETXEUR): HistData no tiene datos desde 2020, no sirve. Hang Seng (HKXHKD) se bajó completo.

**Resultados (selección)**
- Comprar siempre en los 8 activos con deriva: 40,0 / 44,2 / 45,8 / 49,5 % con k = 3 / 4 / 5 / 6.
- Máximos de 52 y 26 semanas: **peores** que comprar siempre (−0 a −5,5 puntos). Rechazada.
- Estacionalidad noviembre–abril: sin mejora (−5,4 a +1,1 puntos). Rechazada.
- **Momentum de corte transversal, top 2 de 252 días:**
  - k = 5: 51,2 % (n = 86), +5,4 puntos sobre comprar siempre;
  - k = 6: 56,2 % (n = 64), +6,7 puntos.
  - Top 3, k = 6: 51,9 % (n = 77).
  - Ninguna llega a 100 operaciones, así que ninguna es elegible.
- Momentum de corte transversal en 12 instrumentos: le gana a comprar siempre por 2 a 8,6 puntos en casi todas las variantes de solo compras, pero el máximo es 48,9 % (n = 88). Vender los peores empeora (33–44 %).
- COT (9 mercados, comprar siempre = 35–39 %):

| Hipótesis | k | n | WR | Expectancy |
| --- | --- | --- | --- | --- |
| H1 extremos en contra | 2–4 | 158–381 | 31,4–32,8 % | −0,03 a +0,01 R |
| H2 flujo de 4 semanas a favor | 2–4 | 363–1.464 | 31,7–35,4 % | −0,02 a +0,09 R |
| H3 tendencia + poco cargados | 2 | 192 | **41,7 %** | +0,28 R |
| H4 tendencia + muy cargados | 2–4 | 202–618 | 33,2–35,1 % | +0,02 a +0,08 R |

**Qué se descubrió**
1. **El momentum de corte transversal es la primera señal que le gana a la deriva** de forma consistente (+2 a +9 puntos en casi todas las variantes). Cumple lo que dice la literatura: elegir los activos con más impulso concentra la exposición donde la deriva es mayor. Pasa del 50 % solo en el universo de 8 activos con deriva y stops de 5–6 ATR, con menos de 100 operaciones.
2. **El COT no da una ventaja usable.** La mejor combinación (tendencia + especuladores poco cargados) sube a 41,7 %, lejos del 50 %.

**Próximos pasos**
1. Sumar el Hang Seng (9 activos con deriva) para que el momentum transversal tenga más operaciones.
2. Si una configuración pasa la regla con 100 o más operaciones y le gana a comprar siempre, validarla una sola vez.

---

## 2026-11-27 01:45 UTC — Entrada 15: Hang Seng sumado (E015c) e hipótesis combinada (registrada antes de probar)

**E015c (9 activos con deriva, con el Hang Seng)**
- El Hang Seng pasa el control de calidad. El −16,2 % del 06/04/2025 corresponde a la caída por aranceles.
- Momentum transversal:
  - top 2 de 252 días con k = 6: 50,7 % (n = 69);
  - top 3 con k = 6: 52,4 % (n = 82).
- Ninguna llega a 100 operaciones y ninguna es elegible. Con un activo más el resultado baja: **depende de qué activos entran en el universo**, una señal más de fragilidad.

**Hipótesis E017 (escrita antes de probar):** los dos efectos parciales que aparecieron se combinan.
- Los efectos: retrocesos en tendencia (+3–5 puntos en EE.UU.) y momentum transversal (+3–7 puntos).
- La regla: comprar el retroceso (cierre en el mínimo de 10 días o RSI2 < 25) **solo en los 3 activos con mejor momentum de 252 días** entre los 9 con deriva.
- SL de 3 a 6 ATR, TP 2,1·SL, misma regla de elección (n ≥ 100, WR ≥ 50 %, vecinos ≥ 47 %, +3 puntos y más expectancy que comprar siempre).

---

## 2026-11-27 02:05 UTC — Entrada 16: retroceso en los líderes (E017) y cierre de la fase 2

**Resultados E017 (selección, 9 activos con deriva; comprar siempre = 39,6 / 42,9 / 44,4 / 47,0 % con k = 3 / 4 / 5 / 6)**

| Señal | Top | k | n | WR | Sobre comprar siempre | Vecinos |
| --- | --- | --- | --- | --- | --- | --- |
| Líder + mínimo 10d | 3 | 5 | 100 | **50,0 %** | +5,6 | k = 4: 44,2 % ❌ |
| Líder + RSI2 < 25 | 4 | 6 | 101 | **52,5 %** | +5,5 | k = 5: 46,7 % ❌ |
| Líder + RSI2 < 25 | 3 | 6 | 82 | 54,9 % | +7,9 | n < 100 ❌ |
| Líder, cualquier vela | 3 | 6 | 82 | 52,4 % | +5,4 | n < 100 ❌ |

**Ninguna es elegible:** siempre falla el tamaño de la muestra o la estabilidad con los parámetros vecinos. **No se miró la validación** de estas casi-candidatas. La regla lo impide y así la muestra 2022–2026 queda limpia para estudios futuros.

**Conclusión de la fase 2**
1. Hay una señal real que **le gana a la deriva**: elegir los activos con mejor momentum de 6–12 meses (y comprar sus retrocesos) suma 2–9 puntos de acierto sobre comprar siempre, de forma bastante consistente.
2. Aun así, **50 % con 1:2 aparece solo con los stops más anchos (5–6 ATR)**, con unas 80–100 operaciones en 11 años y con parámetros vecinos que caen a 44–47 %. No pasa la regla de robustez fijada de antemano.
3. El COT (posicionamiento de los especuladores) no aporta una ventaja usable: máximo 41,7 %.
4. Máximos de 52 semanas y estacionalidad: rechazados.
5. Configuraciones probadas en el laboratorio: unas 1.560 (unas 165 en la fase 2).

**Veredicto general (sin cambios respecto de la entrada 12, con más evidencia):** la candidata B sigue siendo la única que cumple los criterios mínimos, sin ventaja propia. Lo más cerca de una ventaja real es el momentum de corte transversal con stops anchos, que no alcanza la robustez exigida con estos datos (2010–2026, 9 activos).

---

## 2026-11-27 00:02 UTC — Entrada 17: fase 3, prueba en otras condiciones de mercado (registrada antes de ver los datos)

**Nota sobre las horas.** Las horas de las entradas 1–16 son aproximadas. El reloj del contenedor saltó durante la sesión y no coincide con las horas de los commits. El orden de las entradas sí es el real. Desde esta entrada la hora sale de `date -u` al escribirla.

**Por qué.** La misión pide que lo prometedor se pruebe en "diferentes condiciones de mercado". Los datos de 2010–2026 son casi todos de un mercado alcista de acciones. La candidata B y las casi-candidatas de la fase 2 nunca vieron un mercado bajista largo. La prueba más fuerte sin tocar la validación 2022–2026 es correrlas, **con los parámetros ya fijados**, en la historia diaria de **1990–2009**. Ese período tiene el Nikkei cayendo de 39.000 a 7.000, las caídas de 2000–2003 y 2007–2009 y el mercado alcista del oro de 2001–2011. Ningún dato de ese período se usó para diseñar nada.

**Datos.** Velas diarias OHLC de Stooq para S&P 500, Nasdaq 100, Nikkei 225, FTSE 100, CAC 40, índice australiano (ASX 200, o All Ordinaries antes de 2000), Hang Seng, oro y plata. Primero va un control de calidad: velas con apertura, máximo, mínimo y cierre reales, huecos y comparación con HistData en 2010–2021.

**Simulación.** Es el mismo motor, pero sobre velas diarias en lugar de M1: entrada en la apertura siguiente, gap a la apertura y, si el SL y el TP caen el mismo día, cuenta el SL. Con stops de 5–6 ATR y TP de 10–13 ATR, eso casi no pasa. Los costos son los de `docs/costos.md`. Para comprobar el método, primero se corre la candidata B en 2010–2021 con velas diarias de Stooq y se compara con el 51,0 % de HistData en M1.

**Configuraciones (fijas, sin búsqueda).**

| # | Configuración | Universo | k (ATR) | RR |
| --- | --- | --- | --- | --- |
| 1 | Candidata B: cierre > SMA200 y SMA200 subiendo (20 velas), solo compras | 8 activos (sin Hang Seng) | 6 | 2,1 |
| 2 | Control: comprar siempre | 8 activos | 6 | 2,1 |
| 3 | Líder top 3 (momentum 252 días, mensual) + mínimo de 10 días | 9 activos | 5 | 2,1 |
| 4 | Líder top 4 + RSI2 < 25 | 9 activos | 6 | 2,1 |
| 5 | Líder top 3 + RSI2 < 25 | 9 activos | 6 | 2,1 |
| 6 | Líder top 3, cualquier vela | 9 activos | 6 | 2,1 |
| 7–8 | Control: comprar siempre | 9 activos | 5 y 6 | 2,1 |

**Criterios (fijados ahora).**
- **Pasa en otras condiciones:** en 1990–2009, win rate ≥ 50 %, payoff ≥ 2,0, expectancy > 0 y al menos 30 operaciones.
- **Tiene ventaja propia** (solo las configuraciones 1 y 3–6): win rate ≥ comprar siempre + 3 puntos y expectancy mayor, con el mismo k y el mismo universo.
- Se informan también 1990–1999 y 2000–2009 por separado, y los vecinos k ± 1 (deben quedar ≥ 47 %).

**Decisión (fijada ahora).**
- Si una configuración de la fase 2 (3–6) pasa los dos criterios, se mira **una sola vez** su validación 2022–2026, que sigue sin tocar.
- Si la candidata B no pasa en 1990–2009, su estado baja a "cumple solo en 2010–2026".
- Si nada pasa, la conclusión "muy difícil con este enfoque" queda confirmada con 36 años de datos.

**Próximo paso:** pedir permiso de red para stooq.com (el proxy lo bloqueó con 403), bajar los datos y hacer el control de calidad.

---

## 2026-11-27 00:20 UTC — Entrada 18: nuevo foco pedido por el usuario y búsqueda exhaustiva en los últimos 5 años (registrada antes de correrla)

**Pedido de Fabrizio (27/11/2026):** no desviarse del objetivo, que es una estrategia rentable con win rate ≥ 50 % y RR 1:2, preferiblemente en los últimos 5 años. Probar todas las combinaciones y entregar los parámetros para configurar el probador de estrategias.

**Qué cambia**
- **La fase 3 (1990–2009) queda pausada.** Hasta dónde llegó:
  - Stooq no responde desde este entorno; Yahoo sí.
  - Los índices de Yahoo tienen velas OHLC buenas desde 1990 (Nikkei desde 1989, Hang Seng desde 1990).
  - El oro y la plata de Yahoo (futuros GC=F y SI=F) no sirven antes de 2012: entre el 35 % y el 50 % de las velas no tienen rango o son incoherentes (`resultados/E018/calidad.csv`).
  - El método con velas diarias quedó validado: reproduce exactamente el motor M1 (`lab/diario.py`, `lab/descarga_yahoo.py`, E018).
- **2022–2026 deja de ser una validación intacta: ahora es el período objetivo.** Para no elegir por azar, los 5 años se parten en dos:
  - elección: 15/11/2021–14/11/2024 (3 años);
  - confirmación: 15/11/2024–13/11/2026 (2 años). Se mira solo para las combinaciones que pasan la elección, y se informan todas.
- **RR 1:2 = TP a 2 × la distancia del SL**, como se configura en un probador. Los costos se descuentan, así que el payoff real queda apenas debajo de 2.

**Grilla (E019)**
- **Instrumentos (13):** oro, plata, EURUSD, GBPUSD, USDJPY, AUDUSD, S&P 500, Nasdaq 100, Nikkei 225, FTSE 100, CAC 40, ASX 200 y Hang Seng. El DAX y el WTI quedan afuera porque tienen datos rotos dentro del período (el WTI, un hueco de 940 días desde diciembre de 2023).
- **Temporalidades:** M5, M15, H1, H4 y D1. La señal se toma al cierre de la vela y la entrada es en la apertura de la siguiente.
- **Familias de estado.** Se prueban en modo "estado" (entra cada vez que está sin posición y la condición sigue) y en modo "cambio" (solo cuando la condición cambia):
  - precio sobre la SMA 20/50/100/200;
  - tendencia: cierre sobre la SMA 50/200 y la SMA subiendo 20 velas;
  - cruce de EMA 9/21, 20/50 y 50/200;
  - momentum de 10/20/60/120 velas;
  - estado de Donchian 20/55;
  - ADX(14) > 25 a favor del +DI o del −DI;
  - Supertrend (10, 3).
- **Familias de evento:**
  - ruptura de Donchian 10/20/55;
  - RSI(2) < 5/10/25 a favor de la SMA 200;
  - RSI(14) que vuelve de 30/70 o de 20/80;
  - Bollinger (20, 2) en contra (reversión) y a favor (ruptura);
  - cierre en el mínimo de 3/5/10 velas a favor de la SMA 200;
  - inside bar y NR7 a favor de la SMA 50;
  - vela envolvente;
  - martillo y estrella fugaz;
  - tres cierres en contra dentro de la tendencia;
  - cruce de MACD (12, 26, 9);
  - estocástico (14, 3) que sale de 20/80;
  - solo en M5 y M15: ruptura del rango de apertura de Nueva York (09:30–10:00 NY) y del rango asiático (19:00–00:00 NY).
- **Control:** comprar siempre y vender siempre. Mide cuánto aporta la deriva sola.
- **Filtros:**
  - ninguno;
  - SMA 200 de la misma temporalidad a favor;
  - tendencia diaria (cierre diario sobre la SMA 200 diaria, última vela cerrada), para M5–H4.
- **Dirección:** ambas, solo compras o solo ventas.
- **Salidas:** SL = k × ATR(14) de la temporalidad, con k ∈ {0,5; 1; 1,5; 2; 3; 4; 6}. TP = 2 × SL. Una operación a la vez por instrumento, sin break-even, parciales ni trailing.

**Regla de elección (fijada antes de correr)**
1. **Elección** (15/11/2021–14/11/2024):
   - al menos 30 operaciones;
   - win rate ≥ 50 % y expectancy > 0;
   - en cada uno de los 3 años, al menos 5 operaciones y win rate ≥ 40 %;
   - con los k vecinos de la grilla, win rate ≥ 45 %.
2. **Confirmación** (15/11/2024–13/11/2026), para todas las que pasan el paso 1: al menos 15 operaciones, win rate ≥ 50 % y expectancy > 0.
3. **Orden final** de las que pasan los dos pasos: límite inferior de Wilson del win rate de los 5 años. A igualdad, gana la más simple y después la de mayor expectancy.
4. **Siempre se informan:**
   - cuántas combinaciones se probaron y cuántas pasaron cada paso;
   - la comparación con comprar o vender siempre (mismo instrumento, temporalidad, dirección y k);
   - para las finalistas, el resultado en 2010–2021, con costos dobles y con TP 2,1.

**Advertencia registrada de antemano.** Con decenas de miles de combinaciones, algunas pasan la elección por azar. Además, el oro y los índices subieron mucho en este período, lo que favorece a las compras. Por eso se exige la confirmación en 2 años que no se usaron para elegir, la comparación con comprar siempre y la prueba de las finalistas en 2010–2021.

**Entregables:** parámetros para configurar el probador de estrategias y la estrategia en Pine Script (TradingView).

---

## 2026-11-27 00:32 UTC — Entrada 19: resultados de la búsqueda exhaustiva (E019–E022) y estrategia recomendada

**Grilla (E019).** Se probaron 185.367 combinaciones: 171.850 simuladas y 13.517 descartadas porque tenían menos de 45 entradas posibles. Tardó 3 minutos con 4 procesos.
- **Paso 1** (elección, 15/11/2021–14/11/2024): pasan 98. Por temporalidad: 62 en H4, 21 en H1 y 15 en D1. 80 son solo compras.
- **Paso 2** (confirmación, 15/11/2024 en adelante): pasan 11. Son 9 en oro (8 de compras y 1 de ambas direcciones) y 2 en USDJPY (compras). Ningún control "comprar siempre" pasa.

**Prueba en 2011–2021 (E020).** Son diez años que no se usaron para nada.

| # | Combinación | Últimos 5 años | 2011–2021 |
| --- | --- | --- | --- |
| 1 | USDJPY H4, momentum 60 al cambiar, compras, k = 3 | 58,2 % (55) | 31,0 % (142), −0,09 R |
| 2 | **Oro D1, ruptura de Bollinger (20, 2) a favor de la SMA 200, ambas, k = 0,5** | **55,2 % (58)** | **43,6 % (110), +0,29 R** |
| 3 | Oro H4, cierre en el mínimo de 5 velas, filtro diario, compras, k = 4 | 55,6 % (54) | 33,3 % (69), −0,01 R |
| 4 | USDJPY H4, momentum 60 al cambiar, compras, k = 4 | 56,2 % (48) | 32,0 % (100), −0,05 R |
| 5 | Oro H4, mínimo de 5 velas, compras, k = 4 | 54,2 % (59) | 33,0 % (97), −0,02 R |
| 6 | Oro D1, sobre la SMA 100, compras, k = 1,5 | 51,7 % (87) | 34,6 % (127), +0,03 R |
| 7 | Oro D1, estado de Donchian 55, compras, k = 1,5 | 51,7 % (87) | 31,3 % (115), −0,07 R |
| 8 | Oro H1, mínimo de 10 velas, filtro diario, compras, k = 6 | 51,7 % (87) | 33,3 % (108), −0,01 R |
| 9 | Oro H4, tres cierres en contra, compras, k = 4 | 55,1 % (49) | 30,6 % (98), −0,09 R |
| 10 | Oro H4, mínimo de 10 velas, filtro diario, compras, k = 4 | 54,2 % (48) | 34,4 % (61), +0,03 R |
| 11 | Oro H1, tres cierres en contra, filtro diario, compras, k = 6 | 50,7 % (75) | 31,8 % (110), −0,06 R |

**10 de las 11 caen al nivel del azar (31–35 %) en 2011–2021.** Su resultado de los últimos 5 años viene de las subas del oro (2023–2025) y del USDJPY (2021–2024), no de una ventaja que se repita. Con costos dobles y con TP 2,1 casi no cambian (resultados/E020/finalistas.csv). **La única que conserva ventaja en 2011–2021 es la #2.**

**Sensibilidad de la #2 (E021).**
- En oro, la misma regla da 53–69 % en los 5 años con k de 0,5 a 2. En 2011–2021 da 40–44 % con k de 0,5 a 1; con k más grande se acerca al azar.
- Con otras bandas: (20; 1,5), (15; 2) y (30; 2) son más débiles; (20; 2,5) da algo parecido con menos operaciones.
- **En los otros 12 instrumentos no funciona:** 21–48 % en los 5 años. Es un comportamiento del oro (las rupturas de volatilidad a favor de la tendencia siguen), no una regla general.

**Estrategia recomendada (E022, `pine/oro_d1_bollinger_sma200.pine`).**
- **Mercado y velas:** oro (XAUUSD), velas diarias que cierran a las 17:00 de Nueva York.
- **Compra:** primera vela diaria que cierra sobre la banda superior de Bollinger (20, 2), con el cierre sobre la SMA 200.
- **Venta:** primera vela que cierra bajo la banda inferior, con el cierre bajo la SMA 200.
- **Entrada:** a mercado en la apertura siguiente. Una operación a la vez.
- **Salida:** SL = 0,5 × ATR(14) de la vela de la señal; TP = 2 × SL = 1 × ATR. Sin break-even ni trailing.

| Período | Operaciones | Win rate [IC 95 %] | Payoff | PF | Expectancy | Max DD |
| --- | --- | --- | --- | --- | --- | --- |
| Últimos 5 años (15/11/2021–26/11/2026) | 58 | **55,2 %** [42,5–67,3] | 1,93 | 2,38 | +0,63 R | 5,1 R |
| · elección / confirmación | 32 / 26 | 56,2 % / 53,8 % | | | | |
| 2011–2021 | 110 | 43,6 % [34,7–53,0] | 1,94 | 1,50 | +0,29 R | 9,5 R |
| 15 años seguidos | 168 | 47,6 % [40,2–55,1] | 1,94 | 1,76 | +0,41 R | 9,5 R |

- Son 11–12 operaciones por año, con una duración media de 1,6 días.
- Hubo 12 de 14 años completos positivos y una racha máxima de 6 SL seguidos.
- Con costos dobles da +0,62 R por operación en los 5 años.
- Con 1 % de riesgo compuesto, 10.000 pasan a unos 14.300 en los 5 años.
- Comprar siempre en oro D1 con el mismo SL y TP da 39,5 % en los 5 años.

**Lectura honesta**
- **Cumple el objetivo en los últimos 5 años:** win rate ≥ 50 % con RR 1:2, expectancy positiva, y en las dos mitades por separado.
- En los 10 años anteriores también ganó, pero con 43,6 % de acierto. El 55 % reciente se apoya en un período muy bueno para el oro. Si el patrón sigue, lo esperable está más cerca de 45–50 % de acierto con expectancy positiva.
- La muestra es chica: 58 operaciones en 5 años, con un intervalo de 42 % a 67 %.
- Se probaron 185.367 combinaciones. La confirmación y la prueba en 2011–2021 bajan el riesgo de que sea suerte, pero no lo eliminan.

**Próximos pasos**
- Correr la estrategia en el probador de TradingView (OANDA:XAUUSD, 1D) y comparar operación por operación con `resultados/E022/operaciones_5a.csv`.
- Si se usa MT5, escribir el EA.
- Seguirla en demo antes de usar dinero real.

---

## 2026-11-27 00:47 UTC — Entrada 20: el setup SMC de Fabrizio para scalping y daytrading (registrada antes de correr)

**Pedido.** Encontrar los parámetros correctos para hacer scalping o daytrading con el setup de Fabrizio:
- **Pasos:** barrido, cambio de estructura, zona de descuento, zona de reacción y liquidez, a veces con EMA 50/200.
- **Dirección y ejecución:** dirección en 1H con ejecución en 5M, 4H con 15M, o 15M con 1M.
- **Activos:** XAUUSD, EURUSD, GBPUSD, USDCAD, US100, US30 y US500.
- **Condiciones:** RR 1:2 y todas las pruebas en los **últimos 5 años**.

**Datos**
- USDCAD se baja de HistData (2020–2026).
- **US30 no está disponible:** HistData no lo tiene, y Dukascopy y Stooq cortan la conexión desde este entorno. Queda pendiente: se puede sumar con un export de M1 del MT5 de Fabrizio.
- US100 = NSXUSD y US500 = SPXUSD (CFD de HistData).

**El setup como reglas exactas (alcistas; las bajistas son el espejo)**
1. **Liquidez a barrer** (`fuente`), según el caso:
   - el último mínimo de swing confirmado de la temporalidad de ejecución (pivote de L velas a cada lado);
   - el último mínimo de swing de la temporalidad mayor (pivote de 3);
   - el mínimo del día anterior.
2. **Barrido:** una vela perfora ese nivel. Con `recupera = sí`, además tiene que cerrar de vuelta por encima. Cada nivel se usa una sola vez.
3. **Cambio de estructura:** dentro de las W velas siguientes, un cierre por encima del último máximo de swing (pivote de L) confirmado al momento del barrido.
4. **Rango:** desde el extremo del barrido hasta el máximo del tramo. **Descuento** = por debajo del 50 % del rango.
5. **Zona de reacción y entrada** (orden límite dentro del descuento, válida V velas; se cancela si antes toca el TP):
   - FVG del tramo (borde o 50 %);
   - order block (máximo de la última vela bajista del tramo);
   - OTE 61,8 %;
   - equilibrio 50 %.
   - Control: entrada a mercado en la apertura siguiente al cambio de estructura, sin esperar el descuento.
6. **SL y TP:** SL debajo del extremo del barrido, con un margen de 0,1 × ATR(14). TP = entrada + 2 × riesgo (RR 1:2). Se descartan los setups con un riesgo menor a 3 veces el costo.
7. **Liquidez a favor** (`liquidez = sí`): se descarta el setup si hay un máximo de swing de la temporalidad mayor entre la entrada y el TP.
8. **Dirección** (`sesgo`) en la temporalidad mayor, con su última vela cerrada:
   - EMA 50 sobre EMA 200;
   - precio sobre EMA 200;
   - estructura (último quiebre de swing de la temporalidad mayor);
   - control: sin sesgo.
9. **Sesión:** todas las horas, o solo las killzones de Londres (02:00–05:00 NY) y Nueva York (07:00–11:00 NY).
10. Una operación a la vez, con salidas en M1 y costos de `docs/costos.md`.

**Grilla (E023).** Pares de temporalidades: 1H–5M, 4H–15M y 15M–1M. Por cada par se combinan:
- L ∈ {2, 3, 5};
- fuente ∈ {swing de ejecución, swing mayor, día anterior};
- W ∈ {12, 24, 48};
- recupera ∈ {sí, no};
- sesgo ∈ {4 opciones};
- entrada ∈ {mercado, 50 %, OTE, FVG, FVG 50 %, OB};
- V ∈ {12, 36};
- sesión ∈ {todas, killzones};
- liquidez ∈ {no, sí}.

Son unas 9.500 combinaciones por activo y par, unas 171.000 en total.

**Regla de elección (fijada antes de correr)**
1. **Elección** (15/11/2021–14/11/2024):
   - al menos 60 operaciones y expectancy > 0;
   - expectancy > 0 en cada uno de los 3 años, con al menos 10 operaciones por año;
   - al menos un vecino de W con expectancy > 0.
2. **Confirmación** (15/11/2024–13/11/2026): al menos 30 operaciones y expectancy > 0.
3. **Orden:** límite inferior (95 %) de la expectancy de los 5 años. Se marca aparte la que llegue a win rate ≥ 50 %.
4. **Siempre se informan:**
   - la versión más literal del setup de Fabrizio (1H–5M, EMA 50/200, barrido de swing, cambio de estructura y entrada en el FVG en descuento);
   - la mejor combinación por activo;
   - los parámetros que funcionan en más activos a la vez.

**Antecedente que se registra.** Los 1.584 modelos SMC/ICT de LuxAlgo y el Setup A+ ya probados en oro dieron como máximo 44 % y 42 % de acierto. Con stops intradía chicos, la teoría pide una ventaja muy grande para llegar a 50 % con 1:2.

---

## 2026-11-27 00:57 UTC — Entrada 21: resultados del setup SMC (E023–E024)

**Grilla (E023).** Se probaron 171.072 combinaciones: 6 activos × 3 pares de temporalidades × 9.504. Tardó 60 segundos. US30 queda pendiente por falta de datos.
- **Paso 1** (elección): pasan 767.
- **Paso 2** (confirmación): pasan 219.
- **Con win rate ≥ 50 % en los 5 años: ninguna.**

Mejor win rate de los 5 años por activo y par, entre las combinaciones con al menos 100 operaciones:

| Activo | 15M–1M | 1H–5M | 4H–15M |
| --- | --- | --- | --- |
| XAUUSD | 43,1 % | 44,6 % | 48,5 % |
| EURUSD | 42,5 % | 43,3 % | 48,0 % |
| GBPUSD | 45,5 % | 47,1 % | 46,8 % |
| USDCAD | 45,3 % | 45,6 % | 40,4 % |
| US100 | 42,6 % | 46,5 % | 42,2 % |
| US500 | 46,6 % | 45,7 % | 46,1 % |

**La prueba que decide.** Las 680 combinaciones que la elección deja como ganadoras (con al menos 30 operaciones en la confirmación) daban +0,156 R por operación en 2021–2024. En 2024–2026 dieron **−0,096 R en promedio**, con 33–35 % de acierto. Todas las combinaciones juntas dieron −0,172 R. Elegir los parámetros por el pasado mejora algo, pero no alcanza para ganar después. Por tipo de entrada, solo la entrada a mercado queda cerca del empate (−0,001 R; la mitad positivas); por activo, solo el oro (+0,010 R).

**Qué ingrediente ayuda** (promedio de las 61.389 combinaciones con al menos 100 operaciones):
- **En general:** 33,0 % de acierto, lo mismo que entrar al azar con RR 1:2, y −0,17 R por operación (los costos).

| Ingrediente | Mejor | Peor |
| --- | --- | --- |
| Par de temporalidades | 4H–15M: −0,10 R | 15M–1M: −0,23 R |
| Entrada | A mercado al romper la estructura: −0,12 R | OB −0,20 R; OTE −0,19 R |
| Liquidez barrida | Día anterior: −0,09 R | Swing de ejecución: −0,17 R |
| L (tamaño del swing) | 5: −0,16 R | 2: −0,18 R |
| Sesgo, killzones, recuperar el nivel, filtro de liquidez | Sin diferencia (±0,01 R) | |

**Versión literal del setup** (1H–5M, EMA 50/200, barrido de swing, cambio de estructura, FVG en descuento, L 3, W 24, V 12):

| Activo | Operaciones | Win rate | Expectancy | Max DD |
| --- | --- | --- | --- | --- |
| XAUUSD | 290 | 35,2 % | −0,09 R | 36,9 R |
| EURUSD | 257 | 32,3 % | −0,21 R | 63,2 R |
| GBPUSD | 254 | 36,2 % | −0,10 R | 38,0 R |
| USDCAD | 187 | 40,6 % | +0,02 R | 23,0 R |
| US100 | 245 | 34,7 % | −0,09 R | 33,6 R |
| US500 | 218 | 30,3 % | −0,25 R | 61,9 R |

**Mejor combinación de cada activo** (pasa los dos pasos; E024):

| Activo | Par | Configuración | Ops | Win rate | Expectancy | PF | Max DD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GBPUSD | 4H–15M | L 5, swing de 4H, W 24, recupera, sin sesgo, a mercado, todas las horas | 139 | 46,8 % | +0,36 R | 1,65 | 7,2 R |
| US500 | 4H–15M | L 3, swing de 15M, W 12, recupera, precio vs EMA 200, FVG (borde), V 12 | 94 | 46,8 % | +0,31 R | 1,52 | 8,6 R |
| US100 | 1H–5M | L 5, swing de 5M, W 24, recupera, precio vs EMA 200, order block, V 12, killzones | 101 | 46,5 % | +0,30 R | 1,51 | 7,2 R |
| XAUUSD | 4H–15M | L 5, swing de 15M, W 12, recupera, estructura 4H, a mercado, filtro de liquidez | 302 | 43,4 % | +0,26 R | 1,43 | 12,8 R |
| EURUSD | 4H–15M | L 5, swing de 15M, W 24, sin recuperar, EMA 50/200, a mercado, killzones, filtro de liquidez | 211 | 43,6 % | +0,26 R | 1,43 | 7,2 R |
| USDCAD | 1H–5M | L 2, swing de 1H, W 12, sin recuperar, EMA 50/200, a mercado, killzones | 107 | 43,9 % | +0,23 R | 1,39 | 8,9 R |

- Todas ganan en los 5 años y siguen positivas con costos × 1,5. Sus vecinos de L y W dan entre −0,05 R y +0,40 R.
- Ojo: se eligieron mirando los 5 años completos (pasos 1 y 2, más el orden). Por la prueba anterior, lo esperable a futuro está cerca del empate, no en +0,3 R.

**Mismos parámetros en los 6 activos.** Es la única combinación positiva en todos con al menos 60 operaciones por activo:
- **Parámetros:** 4H–15M, L 5, barrido del máximo o mínimo del día anterior, W 24, sin recuperar, sin sesgo, a mercado, killzones.
- **Resultado:** 511 operaciones, 38,6 % de acierto y +0,12 R por operación. Da +0,10 R en la elección y +0,15 R en la confirmación.
- **Por activo cambia de signo según el período:** US500 y USDCAD pierden en la confirmación; GBPUSD y US100 pierden en la elección.

**Conclusión**
- El setup, llevado a reglas, **no muestra una ventaja que se sostenga con RR 1:2** en los últimos 5 años. El acierto promedio es el del azar (33 %), y los costos lo vuelven perdedor.
- Ninguna variante llega a 50 %. Las mejores (43–47 %) son, en buena parte, la cola afortunada de una distribución centrada debajo de cero.
- Lo que más ayuda es estructural: temporalidades más grandes (menos costo por R), entrar al romper la estructura en vez de esperar el retroceso (las órdenes límite se llenan sobre todo cuando el movimiento falla) y usar la liquidez del día anterior.

**Entregable:** `pine/smc_barrido_estructura.pine`, con todo el setup configurable y cargado por defecto con la configuración común a los 6 activos.

**Pendiente:** US30, si Fabrizio exporta 5 años de M1 desde su MT5.

---

## 2026-11-27 01:01 UTC — Entrada 22: los 5 setups ICT del prompt de Google (registrada antes de correr)

**Pedido.** Fabrizio pasó un prompt que Google le generó y pidió probarlo. El prompt describe 5 setups ICT activables o combinables en un único script, con killzones, cierre forzoso, riesgo fijo, un máximo de operaciones por día y un stop diario.

**Reglas globales**
- **Killzones** (hora de Nueva York, por la apertura de la vela): Londres 02:00–05:00 y Nueva York 08:30–11:00. El rango asiático va de 20:00 a 00:00.
- **Órdenes:** solo se abren si el setup se completa dentro de una killzone habilitada. La orden límite vence a las V velas o al terminar esa killzone.
- **Cierre forzoso** (opcional) a las 16:00 NY.
- **Límites diarios:** máximo 2 operaciones por día y corte tras 2 pérdidas seguidas en el día.
- **Salidas:** SL con un margen de 0,1 × ATR(14) (el prompt lo pide en ticks; en ATR sirve igual para todos los activos). TP = 2R. Una posición u orden a la vez. Se descartan los setups con un riesgo menor a 3 veces el costo. Salidas en M1 con los costos de siempre.

**Conceptos**
- **Swing:** pivote de L velas a cada lado, confirmado L velas después.
- **FVG alcista:** low[0] > high[2] con la vela del medio alcista y tamaño mínimo opcional en ATR. El borde proximal es low[0] y el 50 % (CE) es el medio del hueco. El bajista es el espejo.
- **MSS:** cierre de cuerpo más allá del último swing opuesto.

**Los 5 setups** (compras; las ventas son el espejo)
1. **Barrido hacia OB/FVG.** Una vela perfora el último swing bajo y cierra por encima. Dentro de N velas llega un MSS. Se entra con una límite en el FVG del tramo; si no hay FVG, en el OB (última vela bajista del tramo). SL bajo el mínimo del barrido.
2. **Breaker block.** Al confirmarse un mínimo más bajo, el OB bajista es la última vela alcista en las 3 velas anteriores al máximo de swing previo. Si un cierre lo supera por arriba, pasa a ser un breaker alcista. Límite en su borde superior, SL bajo su mínimo.
3. **Continuación en FVG.** El precio está sobre la EMA de la temporalidad mayor (última vela cerrada) y aparece un FVG alcista. Límite en el FVG durante N velas. SL bajo el mínimo de la vela 1 del FVG.
4. **Poder de Tres (AMD).** Se toma el rango asiático. En killzone, el precio perfora el mínimo de Asia y vuelve a cerrar adentro. Después llega un MSS (pivote de 3) con un FVG desde la perforación. Límite en el FVG, SL bajo el mínimo de la manipulación. TP en 2R o en el máximo de Asia (variante).
5. **Sesgo mayor + entrada en la killzone de NY.** La vela anterior de la temporalidad mayor es alcista (variante: estructura). Solo en la killzone de NY: barrido del último swing bajo interno (pivote de 3) y, dentro de N velas, un FVG alcista. Límite en el FVG, SL bajo el mínimo del barrido.
- **Combinados:** los 5 activos a la vez, con una posición por vez.

**Pruebas (E025)**
- **Activos:** XAUUSD, EURUSD, GBPUSD, USDCAD, US100 y US500. US30 sigue sin datos.
- **Temporalidades de ejecución:** 1M, 5M y 15M, con mayor 15M, 1H y 4H respectivamente.
- **Período:** los últimos 5 años, partidos en elección (15/11/2021–14/11/2024) y confirmación (15/11/2024–13/11/2026), como en E023.
- **Configuración del prompt** (lo primero que se informa, por activo y temporalidad): killzones de Londres y NY, cierre forzoso, 2 operaciones por día, corte tras 2 pérdidas, entrada en el borde proximal, N = 10, V = 10, sin tamaño mínimo de FVG, L = 5 en los setups 1–2 y L = 3 en los 4–5, EMA 50 en el setup 3 y vela anterior en el 5.
- **Variantes:** borde o 50 %, tamaño mínimo de FVG (0 o 0,25 ATR), N y V (10 o 20), killzone (las dos, solo Londres o solo NY), cierre forzoso sí o no, L (3 o 5), EMA (50 o 200) y TP de Asia en el setup 4.

**Qué se informa:** el resultado de la configuración del prompt y la mejor variante de cada setup. También se mide cuánto rinden en la confirmación las variantes que mejor salen en la elección, igual que en E023.

---

## 2026-11-27 01:12 UTC — Entrada 23: resultados de los 5 setups ICT del prompt de Google (E025)

**Corrección antes de leer los números.** En la primera corrida, los totales de 5 años incluían también las operaciones del 01/01 al 14/11/2021, que solo debían calentar los indicadores. Se detectó porque el total no daba la suma de elección más confirmación. Se corrigió filtrando los setups desde el 15/11/2021 y se volvió a correr todo. Las cifras de elección y confirmación no cambiaron.

**Grilla.** 19.908 pruebas: 5 setups, más los 5 combinados, × 6 activos × 1M, 5M y 15M × variantes, con RR 1:2 y las reglas globales del prompt. Tardó 58 segundos.

**Configuración del prompt** (18 casos por setup: 6 activos × 3 temporalidades; últimos 5 años):

| Setup | Win rate | Resultado por operación | Casos positivos | Mejor caso |
| --- | --- | --- | --- | --- |
| 1 Barrido → OB/FVG | 29,4–40,0 % | −0,34 a +0,02 R | 1 de 18 | XAUUSD 15M: 40,0 %, +0,02 R (160 ops) |
| 2 Breaker block | 29,9–36,4 % | −0,30 a −0,02 R | 0 de 18 | XAUUSD 15M: 36,4 %, −0,02 R (549) |
| 3 Continuación FVG | 32,1–38,0 % | −0,30 a −0,03 R | 0 de 18 | XAUUSD 15M: 38,0 %, −0,03 R (1.164) |
| 4 Poder de Tres (AMD) | 22,6–38,4 % | −0,40 a +0,00 R | 1 de 18 | EURUSD 15M: 38,4 %, +0,00 R (112) |
| 5 Sesgo mayor + NY | 25,8–46,6 % | −0,39 a +0,07 R | 3 de 18 | XAUUSD 15M: 46,6 %, +0,07 R (58) |
| Los 5 combinados | 31,1–38,0 % | −0,33 a −0,02 R | 0 de 18 | XAUUSD 15M: 38,0 %, −0,02 R (1.449) |

**Todas las variantes**
- **Promedio:** el win rate medio por setup y temporalidad va de 28,7 % a 34,8 %, el nivel del azar con 1:2.
- **En 1M nada es positivo.** En 15M, entre el 4 % y el 24 % de las variantes da positivo.
- **Superan el 50 % con al menos 50 operaciones solo dos configuraciones:**
  - setup 4 en GBPUSD 5M con TP en el extremo de Asia: 50,0 %, pero ese TP no es 1:2;
  - setup 2 en USDCAD 15M: 57 % en la elección y 35 % en la confirmación.

**Elección → confirmación.** 179 variantes pasan la elección y en la confirmación dan −0,084 R en promedio (todas juntas: −0,169 R).
- **Setup 5:** sus elegidas siguen positivas, +0,114 R con 39,5 % de acierto (24 variantes).
- **Setup 1:** −0,12 R.
- **Setup 4:** −0,09 R.
- **Setup 2:** −0,20 R (4 variantes).

**Las mejores que pasan las dos etapas** (ojo: elegidas mirando los 5 años):

| Configuración | Ops | Win rate | Expectancy | PF | Max DD | Elección / confirmación |
| --- | --- | --- | --- | --- | --- | --- |
| Setup 5, XAUUSD 15M (mayor 4H): killzone de NY, sesgo por estructura, entrada al 50 % del FVG, FVG ≥ 0,25 ATR, sin cierre forzoso | 82 | 45,1 % | +0,30 R | 1,52 | 8,4 R | 47,9 % / 41,2 % |
| Setup 1, XAUUSD 15M: solo Londres, pivote 3, N 20, entrada en el OB (borde), sin cierre forzoso | 144 | 45,1 % | +0,28 R | 1,48 | 7,5 R | 47,1 % / 40,5 % |

**Conclusión**
- El prompt de Google, tal como está, **pierde en los 6 activos** en los últimos 5 años.
- Ninguna variante llega a 50 % con RR 1:2 de forma estable.
- Coincide con el setup SMC propio (E023), con los 1.584 modelos de LuxAlgo y con la teoría: con stops intradía, estos patrones no anticipan la dirección.
- Lo único con algo de persistencia es el setup 5 en 15M en la killzone de NY, sobre todo en oro, y queda en 41–48 % de acierto.

**Entregable:** `pine/ict_cinco_setups.pine`, con los 5 setups activables, las killzones y el cierre forzoso como inputs, tamaño por riesgo, máximo diario, stop diario y dibujos limitados a 20. Por defecto viene con la configuración del prompt.

---

## 2026-11-27 07:02 UTC — Entrada 24: el reproductor queda con las mejores estrategias y un motor compatible con TradingView

**Pedido.** Fabrizio no puede abrir archivos .pine. Pidió que todo se pruebe en el reproductor de velas, que quede solo lo mejor y que el reproductor pueda replicar estrategias e indicadores de TradingView.

**Qué se hizo** (en `senales-vip/backtest/reproductor`, rama ccr-47b7af70-05ostp-whatsapp, artefacto privado "Reproductor XAUUSD", versión 7):
- **Motor nuevo `js/tv.js`:**
  - funciones ta.* con las fórmulas de Pine;
  - request.security sin repintado;
  - sesiones en hora de Nueva York;
  - emulador de órdenes como el Strategy Tester, con lupa de 1 minuto, modo sin lupa y modo laboratorio.
- **El probador quedó con 5 estrategias**, más "Mi estrategia":
  - oro D1 Bollinger + SMA 200 (E022);
  - SMC mejor en oro y SMC común (E023/E024);
  - ICT 5 en NY e ICT 1 en Londres (E025).
  - Se retiraron Silver Bullet, Silver Bullet TI, Bias V4, Setup A+ y los 26 modelos de LuxAlgo. Sus indicadores siguen disponibles.
- **Código propio en formato TradingView:** estrategias con `function preparar` e indicadores con `function indicador`. El botón Pine traduce las dos cosas con Claude.

**Validación** (motor en modo laboratorio contra los resultados del laboratorio, oro, últimos 5 años):

| Estrategia | Resultado |
| --- | --- |
| Oro D1 | 58 de 58 operaciones con la misma entrada y salida (diferencia de R < 0,001) |
| SMC oro | 302 operaciones, 43,4 %, +0,259 R: igual |
| SMC común | 84 operaciones, 40,5 %, +0,190 R: igual |
| ICT 5 | 82 operaciones, 45,1 %, +0,304 R: igual |
| ICT 1 | 143 de 144 iguales |

**Hallazgo.** La operación distinta de ICT 1 muestra una simplificación del laboratorio. Una orden límite que se llena con hueco más allá de su propio stop se cerraba en el precio del stop (como ganadora). En la realidad y en TradingView se cierra en la apertura. Afecta muy pocas operaciones (1 de 144 acá). Con la corrección, ICT 1 da 44,4 % y +0,278 R.

**Comprobado en el navegador:** oro D1 da 58 operaciones, 55,2 % y PF 2,38; ICT 5 da 82 y 45,1 %; el indicador propio se dibuja; no hay errores de consola.

---

## 2026-11-27 07:42 UTC — Entrada 25: fase 4 · auditoría con otras IAs y experimentos E026–E027 (registrados antes de correr)

**Pedido.** Fabrizio compartió el proyecto con otras IAs y trajo tres prompts con sus propuestas. Los tres piden una auditoría del repositorio real y un plan. El tercero pide empezar por las mejoras críticas que no dependen de proveedores externos, sin alterar resultados históricos. El trabajo va en la rama `phase-4-quantitative-research`.

**Verificado contra el repositorio**
- Las 6 pruebas pasan.
- Datos: 17 archivos sin duplicados, sin tiempos desordenados y sin velas OHLC incoherentes. Los CFD de índices tienen huecos de más de 4 días: feriados y bloques faltantes de HistData; Hang Seng tiene 39.
- Tamaño de las búsquedas: E019 = 171.850 simuladas + 13.517 sin señales; E023 = 171.072; E025 = 19.908.

**Afirmaciones de los prompts que no coinciden con el repositorio**
- La estrategia de stop de 6 ATR (51,0 % / 55,6 %) es la candidata B de la fase 1 (E009), no de E019.
- US30 no tiene datos.
- No hay integración continua (workflows) y las pruebas automáticas cubren solo el motor de `lab/motor.py`.

**Hallazgo principal (confirma la sospecha del tercer prompt).** La confirmación sí intervino en la elección de las recomendadas:
- E019 ordenó a las que pasaron los dos pasos por el límite de Wilson de los **5 años completos** (elección + confirmación).
- E023 hizo lo mismo con la expectancy de los 5 años.
- E022 se eligió después de mirar 2011–2021 (E020/E021).

En consecuencia, **para el oro D1 ya no queda ningún período de 2010–2026 sin tocar**. Las únicas pruebas limpias posibles son a futuro (desde el 27/11/2026) o con datos que no tenemos.

**E026 — auditoría de la selección y del sobreajuste (fijado ahora)**
- **A.** Volver a ordenar a las que pasaron el paso 2 de E019 y E023 **solo con métricas de elección**. Informar a quién habría elegido la regla corregida y cómo le fue en la confirmación. Medir el proceso honesto completo: las 10 mejores por elección, sin filtro de confirmación, y su expectancy promedio en la confirmación.
- **B.** Probabilidad de sobreajuste del backtest (PBO, con validación cruzada combinatoria simétrica, CSCV):
  - bloques: los 3 años de la elección y la confirmación, con la expectancy por bloque y al menos 10 operaciones por bloque;
  - por familia de búsqueda: E019 por temporalidad, E023 por par de temporalidades y E025 por setup;
  - **si PBO > 0,5, el proceso de búsqueda no sirve para elegir.**
- **C.** Llenado realista: si una orden límite se llena con hueco más allá de su propio stop, sale en el precio del llenado (hoy los simuladores de `lab/smc.py` y `lab/ict.py` la cierran en el stop). Va como opción `realista`, apagada por defecto, para no cambiar los resultados históricos. Se mide su efecto en las finalistas de E024 y E025.

**E027 — validación a fondo de E022 (oro D1 Bollinger + SMA 200) con criterios fijados ahora.** Categoría A (ventaja robusta) solo si cumple **todo**:
1. **Contra entradas al azar:** le gana con p < 0,05 a 2.000 simulaciones con entradas al azar en velas diarias del mismo año, con la misma cantidad de compras y ventas, del lado de la SMA 200 y con el mismo SL/TP. Aísla lo que aporta la ruptura de Bollinger por encima del filtro de tendencia.
2. **Intervalo de confianza:** el límite inferior del intervalo bootstrap del 95 % de la expectancy de 15 años (2011–2026) es mayor que 0.
3. **Deflated Sharpe Ratio ≥ 0,95**, con N efectivo igual a la cantidad de combinaciones distintas de instrumento, temporalidad, familia y dirección probadas en E019, y la varianza de los Sharpe de E019. También se informa con otros N.
4. **Swaps** (sin datos del bróker, escenarios explícitos): base de −0,015 % por noche en compras y −0,005 % en ventas, y adverso de −0,03 % y −0,015 %, con triple el miércoles. En el escenario adverso, expectancy > 0 y al menos 50 % de la base.
5. **Costos × 3:** expectancy > 0.
6. **Datos sin usar:** un período sin tocar o una prueba a futuro con al menos 30 operaciones y expectancy > 0. **No existe**, así que E022 queda como máximo en **categoría B** hasta completar la prueba a futuro.

**Además**
- Política de aceptación centralizada y versionada (`lab/politica.py`, `docs/criterios_v2.md`). La misión original (50 % y 1:2) se conserva como "Misión A". Las categorías A/B/C son la escala para ventajas con otro perfil de acierto.
- Herramientas estadísticas en `lab/validacion.py` (PSR, DSR, PBO/CSCV, bootstrap), con pruebas.
- Registro del presupuesto de pruebas, manifiesto de datos con huellas sha256 y dependencias con versiones fijas.

---

## 2026-11-27 07:50 UTC — Entrada 26: resultados de E026–E027 y auditoría de la fase 0

**E026-A · selección solo con la muestra de elección**
- **E019:** la regla corregida elige la misma primera (USDJPY H4 momentum 60). E022 fue la segunda; la contaminación vino de elegirla mirando 2011–2021.
- **Proceso honesto** (las 10 mejores por elección, sin mirar la confirmación):

| Búsqueda | En la confirmación | Positivas |
| --- | --- | --- |
| E019 | +0,098 R (38,2 % de acierto) | 6 de 10 |
| E023 | −0,145 R | 2 de 10 |
| E025 | −0,050 R | 4 de 10 |

- **E023:** con la regla corregida cambia la mejor de EURUSD, US100 y USDCAD.

**E026-B · PBO (CSCV, 4 bloques; estimación gruesa: 6 particiones)**

| Búsqueda | PBO |
| --- | --- |
| E019 | D1 0,50 · H1 0,17 · H4 0,67 · M15 0,17 · M5 0,67 (win rate por bloque) |
| E023 | 15M–1M 0,33 · 1H–5M 0,50 · 4H–15M 0,50 |
| E025 | setup 1 0,50 · 2 0,50 · 3 0,17 · 4 1,00 · 5 0,17 |

- En SMC, la elegida por elección rinde **peor que la mediana** en la confirmación (1H–5M: −0,231 contra −0,147 R).
- El setup 5 es la excepción: la elegida da +0,078 contra −0,181 R de la mediana.

**E026-C · llenado realista** (`realista=True`): cambian 39.252 de 91.687 configuraciones de E023 (−0,006 R en promedio, p5 −0,030, peor −0,223) y 3.146 de 19.322 de E025 (−0,002 R). El sesgo era real y optimista, pero ninguna conclusión cambia.

**E027 · oro D1 (E022)**
- **Resultados:**
  - 15 años (2011-11 a 2026-11): 168 operaciones, 47,6 %, +0,407 R, PF 1,76, IC 95 % [+0,175; +0,639].
  - 5 años: 58 operaciones, 55,2 %, +0,634 R, IC [+0,265; +0,999].
- **Contra entradas al azar** del lado de la SMA 200 (mismo año, lado, SL/TP y costos; 2.000 simulaciones): media +0,029 R, **p = 0,0005** (15 años); 5 años p = 0,009. Sin filtro de tendencia: p = 0,0035. **No es solo deriva.**
- **DSR** (5 años, Sharpe por operación 0,420; varianza de Sharpe en E019 0,0201): N = 10 → 0,92; 100 → 0,67; 1.000 → 0,38; **N efectivo 4.098 → 0,24**; 161.302 → 0,06. Complementario, no fijado de antemano: en 2011–2021, PSR(0) = 0,98 y DSR con N = 11 finalistas = 0,80.
- **Estrés:** swap base +0,389 R, swap adverso +0,368 R (0,96 noches de promedio) y costos × 3 +0,365 R.
- **Clasificación (`lab/politica.py`): categoría B.** Falla el DSR ≥ 0,95 y no hay período sin usar. Lo único que puede llevarla a A es una **prueba a futuro**.

**Auditoría completa:** `docs/auditoria_fase0.md` (14 hallazgos por gravedad, afirmaciones de los prompts corregidas, plan E028–E032, qué no hacer y lista de control).

**Próximo paso:** prueba a futuro de E022 y del setup 5 ICT en el reproductor desde el 27/11/2026, y E028 (walk-forward de la familia de E022).

---

## 2026-11-27 08:45 UTC — Entrada 27: fase 4 completa · experimentos E028–E037, reanudación de E018 y prueba a futuro F001 (registrados antes de correr)

**Pedido.** Fabrizio trajo tres prompts más de otras IAs y pidió hacerlo todo, sin gastar dinero y sin perder efectividad, y rediseñar la parte visual (el reproductor, con estética de redes neuronales). Respondió que no hay presupuesto para datos pagos.

**Datos gratuitos (decisión).**
- **Habilitados con su permiso:** `fred.stlouisfed.org` y `arxiv.org`.
- **Ya bajados:**
  - FRED (8 series): VIX desde 1990, GVZ desde 2008, OVX, DGS10, DGS2, DFII10 y T10YIE desde 2003;
  - COT de la CFTC por tipo de participante, de 2006 a 2026: desagregado en oro, plata y crudo, y TFF en 5 divisas y 3 índices.
- **Limitados:**
  - Yahoo responde 429 (límite de pedidos): se reintenta más tarde, sin insistir.
  - Dukascopy también responde 429 y no se insiste.
  - Stooq corta la conexión.
- **Disponibilidad real de cada dato** (`lab/externos.py`, columna `disponible_ms`):
  - VIX y GVZ: 16:15 NY del mismo día.
  - Tesoro (H.15): día hábil siguiente, 17:00 NY.
  - COT: viernes 17:00 NY; lunes si hubo feriado; cierres del gobierno de 2013, 2018–19 y 2025 con fecha posterior a la recuperación.

**Corrección a la auditoría (entrada 26).**
- Los papers citados existen y los leí: GT-Score (arXiv 2602.00080, un autor, resultados propios sin réplica) y AlgoXpert (arXiv 2603.09219).
- Se implementan sus definiciones tal cual:
  - **GT-Score** = μ·ln(z)·r²/σ_d, con z = (μ − μ_m)/(σ/√N), r² de la curva y σ_d el desvío a la baja, por partes según z. El paper exige n ≥ 50.
  - **Meseta de AlgoXpert:** Ω = {θ : SR(θ) ≥ 0,9·SR_opt}.
  - **Veto de acantilado:** se descarta θ si algún vecino a un paso pierde más de τ de Sharpe.
  - **Walk-forward con purga** de 5 días y aprobación por mayoría q = 2/3.

**Escala de estados (reemplaza la A/B/C de `docs/criterios_v2.md`, que nunca pasó a main).** Las letras siguen al prompt maestro. `docs/criterios.md` no cambia.

| Nivel | Significado | Condiciones (todas) |
| --- | --- | --- |
| R | Rechazada | Expectancy ≤ 0 en la confirmación con costos base, o solo gana sin costos |
| A | Exploratoria | Resultado interesante sin controles superados |
| B | Candidata | Expectancy > 0 en elección y confirmación; n ≥ 50; le gana al azar con p < 0,10; positiva con costos base |
| C | Validada estadísticamente | Las de B, más: expectancy ≥ +0,15 R; IC 95 % > 0; PF ≥ 1,3; n ≥ 150; azar p < 0,05; DSR ≥ 0,95 con el N efectivo; walk-forward con GR ≥ 0,5 y mayoría de ventanas positivas; positiva con costos conservadores; ≥ 70 % de años positivos; período nunca usado con ≥ 30 operaciones y expectancy > 0 |
| D | Validada a futuro | C, más una prueba a futuro con ≥ 30 operaciones, expectancy > 0 y dentro del intervalo de predicción del backtest |
| E | Operativa | D, más paridad Python ↔ reproductor ↔ TradingView dentro de tolerancia, protocolo de riesgo escrito y aprobación de Fabrizio |

La **Misión A** (≥ 50 % y payoff ≥ 2 después de costos, n ≥ 100, n_val ≥ 30) se informa siempre aparte, como marca.

**Protocolo común para hipótesis nuevas (no son búsquedas de reglas de precio).**
- **Muestras:**
  - desarrollo: 15/11/2010–14/11/2021;
  - confirmación: 15/11/2021–13/11/2026;
  - a futuro: desde el 27/11/2026.
  - Para el oro D1, ningún tramo de 2010–2026 es limpio: solo la historia remota (E037) y la prueba a futuro lo son.
- **Costos:** los de `docs/costos.md` (perfil "base" de E030), siempre también sin costos y con el perfil conservador.

### Experimentos

**E018 (reanuda la fase 3, entrada 17, sin cambiar configuraciones ni criterios).**
- Datos de Yahoo en lugar de Stooq, que sigue bloqueado.
- El oro y la plata quedan fuera de 1990–2009: sus velas de Yahoo anteriores a 2012 no tienen rango o son incoherentes (calidad, entrada 18). Por eso:
  - universo 8 → los 6 índices;
  - universo 9 → los 7 índices, con sus controles en el mismo universo.
- Primero `solape` (Yahoo frente a HistData en 2010–2021: diferencia de expectancy ≤ 0,10 R y de acierto ≤ 3 puntos, o el método no sirve), y después `prueba`.

**E028 · walk-forward con purga (familia del oro D1 y universo D1 de E019).**
- **a) Familia de E022:** XAUUSD D1, ruptura de Bollinger.
  - Parámetros: n ∈ {10, 15, 20, 25, 30}, desvíos ∈ {1,5; 2; 2,5}, filtro SMA ∈ {ninguno, 100, 200}, SL ∈ {0,25; 0,5; 0,75; 1} ATR y RR ∈ {1,5; 2; 2,5; 3}: **720 configuraciones**, motor M1.
  - Esquemas: 3 años de entrenamiento / 1 de prueba (principal), 5/1, 5/2 y expansivo/1. Años de laboratorio desde el 15/11, con purga de 5 días hábiles y sin operaciones de entrenamiento que crucen al tramo de prueba.
  - **Reglas de elección** (solo con el entrenamiento):
    - R1: máximo de media − 1 EE, con n ≥ 15;
    - R2: GT-Score del paper, con μ_m = 0 en R y n_min = 15 (el paper usa 50; el oro D1 hace ~11 por año: desvío documentado);
    - R3: meseta y acantilado de AlgoXpert, con α = 0,9, τ = 50 % del Sharpe de θ y vecinos a un paso en cada parámetro; entre las que quedan, gana el mayor Sharpe promedio de θ y sus vecinos.
  - **Referencias:** E022 fija (contaminada) y la media de las 720 (elegir al azar).
  - **Pasa (3/1 con R1):** expectancy fuera de muestra > 0 con el límite inferior del IC 95 % > 0, **GR = prueba/entrenamiento ≥ 0,5** y ≥ 2/3 de ventanas positivas.
- **b) Universo D1 de E019:** 13 activos, unas 15.900 configuraciones, de nuevo en 2010–2026 y guardadas por año de laboratorio (16 bloques).
  - PBO por CSCV con 16 bloques: reemplaza la estimación de 4 bloques de E026.
  - Walk-forward 3/1 con R1, R2 y R3: las 10 mejores por ventana y su "supervivencia" (expectancy > 0 al año siguiente).
  - **Una regla sirve si** su supervivencia supera en ≥ 15 puntos a la de configuraciones al azar **y** sus elegidas suman expectancy > 0 con IC > 0. Es la pregunta del prompt 1 ("¿sube la supervivencia a ≥ 40 %?").

**E029 · benchmarks y alfa incremental.**
- **Benchmarks diarios con los mismos costos:**
  - comprar y mantener;
  - comprar y mantener con volatilidad objetivo del 10 % (EWMA, peso con un día de rezago, tope 3×);
  - risk parity solo compras (7 índices + oro, inverso de la volatilidad, 10 % objetivo, mensual);
  - tendencia simple (precio > SMA 200, misma volatilidad objetivo).
- **Estrategias:** E022, la candidata B (E009), el momentum de líderes (E017), el setup 5 ICT en oro (E025) y la cartera de E036. Se miden con su resultado diario marcado a mercado.
- **Métrica principal:** el **information ratio de tasación** (α/σ_ε·√252 de la regresión contra el benchmark, error estándar de Newey-West con 10 rezagos), que no depende del tamaño de posición. También se informan el IR activo del prompt, el tracking error y la beta.
- **Pasa:** IR ≥ 0,3 con p < 0,05.
- **Si nada pasa:** el prompt 1 propone girar a "asignación con overlays tácticos". Eso **cambia la misión**: queda como recomendación para Fabrizio, no se ejecuta.

**E030 · perfiles de ejecución (motor de ejecución 2.0, aplicado sobre listas de operaciones ya simuladas).**
- **Perfiles:** optimista, base, conservador (~P75) y estrés.
- **Qué modela cada uno:**
  - spread por sesión: Asia ×1,5, Londres ×1, NY ×0,9, tarde de NY ×1,1, cambio de día ×4;
  - spread por volatilidad: (ATR1h/mediana)^0,5;
  - deslizamiento: entradas a mercado y salidas por SL, proporcional al σ de 1 minuto; el TP límite no desliza;
  - latencia: σ₁ₘ·√(L/60 s);
  - comisión y swaps (`lab/financiacion.py`);
  - impacto: raíz cuadrada con volumen supuesto. Para tamaños minoristas es despreciable y así se documenta.
- **Costo de equilibrio por operación** (C_max de AlgoXpert): si es menor que el costo base, la estrategia es frágil.
- **Clasificación:**
  - no operable: expectancy ≤ 0 con el perfil base;
  - frágil: ≤ 0 con el conservador.

**E031 · pruebas múltiples.**
- Sobre las grillas de E019, E023 y E025 (muestra de elección):
  - valor p de expectancy > 0, con desvío de dos resultados 3·√(p(1−p)) en E019;
  - Bonferroni, Holm, Benjamini–Hochberg (FDR 5 % y 10 %) y Benjamini–Yekutieli;
  - cuántos "descubrimientos" hay y qué fracción replica en la confirmación, frente a los no descubiertos.
- **Prueba SPA de Hansen (2005)** sobre el universo D1 de E028b en 15 años: resultado diario en R, bootstrap estacionario con bloques medios de 20 días y 2.000 repeticiones. ¿La mejor regla D1 supera a no operar después de corregir por toda la búsqueda?

**E032 · Monte Carlo, riesgo y cartera.**
- **Bootstrap por bloques** (5 operaciones) de cada candidata: distribución del drawdown máximo, rachas, tiempo de recuperación, probabilidad de caer 20 % y de ruina (−50 %) en 10 años, con riesgos de 0,25, 0,5 y 1 % por operación.
- **Cartera** E022 + ICT 5 + E036: correlaciones diarias, riesgo simultáneo, drawdown conjunto y ratio de diversificación.
- **Regla descriptiva** (Fabrizio decide): el riesgo sugerido es el mayor con P(DD > 20 % en 5 años) < 5 % con costos conservadores.

**E033 · posicionamiento y flujo (datos gratuitos).**
- **Señales por mercado** (8 mercados con precio en el lab), siempre con su `disponible_ms`:
  - F1: z de 156 semanas de la posición neta/OI de los fondos (managed money / leveraged funds). Contraria: se espera IC < 0.
  - F2: z de los comerciales (productores + swap; dealers en TFF). Se espera IC > 0.
  - F3: cambio semanal de la posición de los fondos. Se espera IC > 0.
- **Medida:**
  - IC de Spearman con el retorno a 1 y 4 semanas;
  - la prueba principal es el IC promedio entre mercados (6 pruebas: 3 señales × 2 horizontes);
  - error estándar por bootstrap de bloques de semanas, Holm entre las 6.
- **Intermercado para el oro** (diario): cambio del rendimiento real y del GVZ frente al retorno del día siguiente.
- **Volumen real de futuros** (GC=F de Yahoo, con roles): ¿las rupturas de E022 con volumen relativo alto rinden más? Se adopta solo si la diferencia en desarrollo da p < 0,05 (permutación) y sigue positiva en la confirmación.
- **Pasa:** signo esperado con p < 0,05 en desarrollo y el mismo signo con p < 0,10 en la confirmación.

**E034 · régimen con HMM causal.**
- **Modelo:** HMM gaussiano de 2 y 3 estados sobre log de la volatilidad realizada diaria del oro (retornos de 5 minutos) y log del GVZ. Se entrena solo con el desarrollo y se congela.
- **Estado de cada día:** probabilidad **filtrada** (algoritmo forward, solo pasado), nunca suavizada ni Viterbi sobre toda la muestra.
- **Uso:** E022 y el setup 5 ICT. Se permiten los estados con expectancy > 0 en desarrollo **solo si** la diferencia entre estados da p < 0,05 (permutación); si no, no hay filtro.
- **En la confirmación:**
  - expectancy filtrada ≥ 0,9 × la sin filtro;
  - se informa la varianza del acierto entre regímenes (la métrica del prompt).

**E035 · línea A, institucional en XAUUSD: ¿el barrido agrega información?**
- **a) Análisis de factores de las 171.072 variantes de E023**, sin correr nada nuevo.
  - Para cada componente (fuente de liquidez, recuperación, sesgo, entrada FVG/OB/OTE/mercado, ventana, sesión, liquidez), se mide la expectancy marginal frente a su nivel de referencia, en elección y en confirmación.
  - **"Agrega valor"** si es > 0 en las dos muestras y en al menos 5 de los 6 activos en la elección.
- **b) Estudio de eventos con placebo en XAUUSD M1:**
  - **Niveles:** máximo y mínimo del día anterior, de la semana anterior, de Asia (20:00–00:00 NY) y de Londres (02:00–05:00 NY).
  - **Evento:** primera excursión del día entre las 02:00 y las 12:00 NY.
  - **Clasificación** en las 6 velas M5 siguientes:
    - "barrido": cierre de vuelta dentro del nivel. Se opera la reversión.
    - "aceptación": dos cierres afuera sin volver. Se opera la continuación.
  - **Operación:** SL 0,25 ATR(14) diario, TP 2·SL, cierre a las 16:00 NY.
  - **Placebo:** misma dirección, en velas M5 al azar del mismo día a ± 60 min (20 por evento).
  - **Medida:** diferencia de expectancy evento − placebo, con IC por bootstrap de días.
  - **Pasa:** p < 0,05 en desarrollo con Holm entre 8 pruebas y diferencia > 0 con p < 0,10 en la confirmación.

**E036 · línea B, cuantitativa multiactivo: tendencia de series de tiempo con volatilidad objetivo.**
- **Universo:** 13 instrumentos con M1 (sin DAX, WTI ni USDCAD).
- **Reglas:** signo del retorno de 12 meses, cada activo a 10 %/√N de volatilidad, rebalanceo semanal con costos por rotación.
- **Benchmark:** el risk parity de E029.
- **Historia remota limpia:** los 7 índices de Yahoo en 1990–2010.
- **Pasa:**
  - Sharpe > 0 en la confirmación;
  - IR de tasación ≥ 0,3 con p < 0,05 en 2010–2026;
  - Sharpe > 0,3 en 1990–2010.

**E037 · historia remota del oro D1 con otro instrumento: GLD de Yahoo, 2005–2011.**
- **Por qué es limpia:** antes del 15/11/2011 ninguna operación de E022 se miró. El M1 de 2010–2011 solo sirvió de calentamiento.
- **Simulación:**
  - velas diarias de GLD (cierre 16:00 NY), mismas reglas de E022, entrada en la apertura siguiente;
  - si el SL y el TP caen el mismo día cuenta el SL (principal); con TP primero se informa la cota optimista;
  - costo 0,02 % ida y vuelta.
- **Calibración antes de mirar 2005–2011:**
  - GLD en 2011-11 a 2026-11 debe quedar a ± 0,25 R de la expectancy del spot (+0,407 R);
  - ≥ 70 % de sus operaciones deben coincidir en el día (± 1) con las del spot.
  - Si no calibra, el resultado remoto se informa como "no comparable".
- **Pasa (cuenta como "período nunca usado" del nivel C):** ≥ 30 operaciones, expectancy > 0 y p < 0,10 (t de una cola).

**F001 · prueba a futuro registrada hoy.**
- **Estrategias:** E022 y el setup 5 ICT en oro, con los parámetros exactos de `resultados/E022` y `resultados/E025`.
- **Compromiso sellado:** hash sha256 del código y de los parámetros en `registro/forward/F001.json`. Cuentan las señales desde el primer cierre diario posterior a este commit.
- **Datos:** HistData mensual + Dukascopy cuando responda.
- **Evaluación:**
  - informe trimestral;
  - decisión al llegar a 30 operaciones de cada una. A ~11 por año, E022 tarda unos 3 años: así se dice.

**Presupuesto de pruebas nuevo** (se suma a `registro/presupuesto_pruebas.csv`):

| Experimento | Configuraciones |
| --- | --- |
| E028a | 720 |
| E028b | ~15.900, re-simulación de E019 |
| E033 | 3 × 2 × 8 + intermercado |
| E034 | 2 modelos × 2 estrategias |
| E035b | 8 pruebas |
| E036 | 1 |
| E037 | 1 |

E031 no agrega configuraciones.

**Lo que no se hace:**
- tocar los resultados de E000–E027;
- ordenar con la confirmación;
- agregar filtros después de mirar.

---

## 2026-11-27 09:01 UTC — Entrada 28: agregado al registro · E038, historia nunca usada de los dos setups intradía del oro (registrado antes de correr)

**Por qué.** E023 (SMC) y E025 (ICT) cargaron datos desde 2021: ninguna operación de esas estrategias en 2010–2021 se miró nunca. Es un período limpio para las dos candidatas intradía del oro, como E037 lo es para E022.

**Configuraciones (fijas, las del reproductor y de F001):**
- **ICT setup 5 en oro 15M (E025):**
  - sesgo de estructura de 4H, killzone de NY;
  - N = 10, V = 10, FVG mínimo 0,25 ATR, entrada al 50 % del FVG;
  - sin cierre forzado; máximo 2 por día y corte tras 2 pérdidas.
  - Referencia 2021–2026: 82 operaciones, 45,1 %, +0,304 R.
- **SMC en oro 4H–15M (E024):**
  - pivote de 5 y barrido de swing con cierre de vuelta;
  - cambio de estructura en 12 velas, sesgo de estructura de 4H;
  - entrada a mercado, liquidez de 4H, todas las sesiones.
  - Referencia: 302 operaciones, 43,4 %, +0,259 R.

**Datos y tramo:** XAUUSD M1 desde 2010 (para calentar los indicadores); operaciones con entrada entre el 15/11/2010 y el 14/11/2021.

**Pasa (cuenta como "período nunca usado" del nivel C):** al menos 30 operaciones, expectancy > 0 y p < 0,10 (t de una cola), con llenado histórico (`realista=False`, el de la referencia). También se informan el llenado realista y el resultado por año.

**Decisión:**
- Si falla, la estrategia queda en R o A, según su expectancy en la confirmación.
- Si pasa, sigue en B hasta cumplir el resto del nivel C.

---

## 2026-11-27 09:20 UTC — Entrada 29: E035b · el placebo registrado mira adelante; placebo corregido (registrado antes de correrlo)

**Qué pasó.** Corrí E035b con el placebo de la entrada 27 (velas al azar del mismo día a ± 60 minutos del evento, con la misma dirección).

**El error.** Ese placebo tiene un sesgo de mirar adelante: los placebos anteriores al evento usan una dirección que define el evento, que todavía no ocurrió.
- Un placebo de "barrido del máximo" (venta) puesto antes de la excursión sufre primero la subida que la forma. Los placebos de barrido dan entre −0,23 y −0,41 R.
- Un placebo de "aceptación" (compra) puesto antes de la ruptura gana con ella. Dan entre +0,13 y +0,30 R.
- Por eso el resultado (barridos > placebo en los 4 niveles, aceptaciones < placebo) **no es válido** y no se usa.
- Igual informo su resultado crudo: la operación del evento en sí, sin placebo.

| Evento | Expectancy en desarrollo | Expectancy en confirmación |
| --- | --- | --- |
| Barridos | −0,05 a −0,16 R | −0,03 a −0,14 R |
| Aceptaciones | −0,06 a +0,01 R | −0,09 a +0,07 R |

**Placebo corregido (fijado ahora, antes de correrlo).**
- **Diseño:** para cada evento, 20 días al azar de la misma muestra (desarrollo o confirmación), sin el día del evento, con la misma hora de Nueva York de la entrada y la misma dirección.
- **Operación:** SL de 0,25 ATR(14) del día anterior de ese día, TP 2·SL y cierre a las 16:00 NY.
- **Qué mide:** si el evento agrega información sobre la dirección frente a operar a esa hora sin evento.
- **Pasa:** Δ > 0 con p < 0,05 con Holm entre 8 en desarrollo, y Δ > 0 con p < 0,10 en la confirmación.
- **Prueba económica:** además, la expectancy del evento con IC 95 % > 0.

---

## 2026-11-27 09:24 UTC — Entrada 30: resultados de la fase 4b (E018, E028–E038, F001)

**Resumen en una línea:** de todo lo registrado, solo el oro D1 (E022) sobrevive como candidata; todo lo intradía (SMC, ICT, barridos) es indistinguible del azar en su historia limpia.

### Resultados por experimento

| Exp. | Pregunta | Resultado | ¿Pasa? |
| --- | --- | --- | --- |
| E018 | Candidatas en 1990–2009 | **Solape:** Yahoo no reproduce HistData en 2012–2021 (Δ −0,11 a −0,19 R en 6 de 8): el criterio absoluto queda **no evaluable**. **Informativo:** la candidata B da 53,3 % y +0,65 R; en 2000–2009 la tendencia gana 50,0 % contra 37,5 % de comprar siempre (+0,39 R) | No evaluable |
| E028a | Familia del oro D1, elegida solo con el pasado | **3/1 con R1:** +0,53 R, IC [+0,16; +0,91], 77 % de ventanas positivas, pero **GR 0,34 < 0,5**. 5/1, 5/2 y expansivo: GR de 0,65 a 0,73. **Configuración al azar de la familia: +0,22 R** | No (GR) |
| E028b | ¿Elegir con estabilidad sube la supervivencia? (15.918 D1) | R1 y GT-Score: 54,6 % de supervivencia contra 41,6 % al azar (+13 puntos, < 15). La meseta de AlgoXpert (α 0,9, τ 50 %) no elige nunca | No |
| E028 PBO | 16 bloques, 12.870 particiones | Universo 0,24. Nasdaq 0,06, S&P 0,24, oro 0,29; forex y resto 0,49–0,71. Familia del oro 0,51: elegir no agrega, la familia entera es positiva | — |
| E029 | ¿Alfa sobre benchmarks pasivos? | **E022: IR de tasación 0,78–0,85 (p = 0,001) contra los cuatro benchmarks; beta ≈ 0 y correlación con el oro 0,03.** Candidata B 0,10, líderes 0,37 (p 0,11), ICT 5 0,25, SMC 0,36 (p 0,07), E036 −0,02 | **Solo E022** |
| E030 | ¿Resiste costos realistas? | **E022:** +0,37 R base, +0,33 conservador, +0,27 estrés; costo de equilibrio 7× el real. Candidata B y líderes: frágiles (los swaps de meses los dan vuelta). ICT 5 +0,08 base; SMC frágil | E022 operable |
| E031 | Corrección por pruebas múltiples | Ninguna de las 167.177 (E019), 110.373 (E023) ni 19.804 (E025) sobrevive a Bonferroni, Holm, BH 5–10 % ni BY. **SPA de Hansen en D1:** la mejor (Nasdaq en tendencia, t = 4,0) da p = 0,21 | No |
| E032 | Riesgo | **E022 con costos conservadores y 1 %:** drawdown mediano 6,4 % y p95 11,7 % en 5 años; ruina 0. **Cartera** E022 + ICT 5 + E036: correlaciones ~0, pero Sharpe 0,50 contra 0,69 de E022 sola | — |
| E033 | COT por participante e intermercado | Las 6 señales de COT no predicen (IC −0,04 a +0,02, p > 0,19). La tasa real predecía en desarrollo (p 0,02) y se dio vuelta en la confirmación. Volumen de GC=F: inservible antes de 2020 | No |
| E034 | Régimen HMM causal | E022: sin filtro, positiva en los dos regímenes. ICT 5: operar solo con volatilidad alta pasa la regla (p 0,0495; +0,35 contra +0,30 en la confirmación), pero no sobrevive a Holm entre 4 | Débil |
| E035a | ¿Qué componente del SMC suma? | **Suman:** liquidez del día anterior (+0,09 R, 6 de 6 activos), liquidez de temporalidad mayor (+0,04) y killzones (+0,03). **Restan:** entrar en FVG, OB, OTE o 50 % en vez de a mercado (−0,05 a −0,08 R en la confirmación). El sesgo mayor y el cierre de vuelta no suman | — |
| E035b | ¿El barrido predice la reversión? | El placebo registrado miraba adelante (entrada 29). Con el corregido: barridos sin información (Δ ≈ 0) y pierden (−0,04 a −0,16 R); aceptaciones con leve continuación que no sobrevive a Holm | No |
| E036 | Tendencia multiactivo con volatilidad objetivo | Sharpe 0,21 en 2010–2026 contra 0,61 del risk parity; IR 0,05. En 1990–2009 (índices): Sharpe 0,94 | No |
| E037 | Oro D1 en GLD 2005–2011 | **Bloqueado:** Yahoo responde 429 desde las 08:20 UTC. El script queda listo (`experimentos/E037_oro_remoto_gld.py`) | Pendiente |
| E038 | Historia limpia 2010–2021 de los setups intradía | **ICT 5:** 215 operaciones, 36,3 %, +0,035 R (p 0,36). **SMC:** 613, 33,9 %, −0,027 R. Lo de 2021–2026 era suerte de la búsqueda | **No** |
| F001 | Prueba a futuro | Sellada a las 09:22 UTC: `registro/forward/F001.json`, con hash del código. Intervalo de predicción de la media de 30 operaciones: E022 [−0,13; +0,94] R, ICT 5 [−0,42; +0,63] R | En curso |

### Clasificación (escala de la entrada 27)

| Estrategia | Nivel | Qué falta |
| --- | --- | --- |
| **E022 oro D1** | **B · candidata** | DSR ≥ 0,95 (da 0,24), GR del walk-forward principal (0,34) y un período limpio: E037 bloqueado y F001 en curso. **Pasa** azar (p 0,0005), IC > 0, PF 1,76, n 168, costos conservadores, alfa sobre benchmarks, la mayoría de ventanas positivas y años positivos (12 de 14 años completos, 86 %; corregido a las 09:27: la primera versión de esta fila lo daba como faltante) |
| ICT 5 oro | A · exploratoria | Falló su historia limpia (+0,035 R). Sigue en F001 porque estaba registrada |
| SMC oro | R en la historia limpia (−0,027 R); A con 2021–2026 | Sin evidencia |
| Candidata B | A | Beta pura (IR 0,10) y no operable en CFD por los swaps |
| Líderes (E017) | A | IR 0,37 con p 0,11; frágil por swaps. Su validación 2022–2026 sigue sin tocar |
| E036 | A | Sin alfa en 2010–2026 |

**Misión A (≥ 50 % con RR 1:2):** nadie la cumple de forma robusta. E022 hace 47,6 % en 15 años y 55,2 % en los últimos 5, con payoff real 1,93 < 2.

**Regla de giro del prompt 1** ("si nada supera IR 0,3 con p < 0,05 contra risk parity, pasar a asignación"): **no se dispara**, porque E022 la supera. Si F001 o E037 la bajaran, la recomendación sería esa, y la decide Fabrizio.

**Próximo paso:**
- reintentar E037 cuando Yahoo deje de limitar;
- informe trimestral de F001;
- todo nuevo experimento, con hipótesis de flujo o eventos registrada y sin búsqueda masiva.

---

## 2026-11-27 10:23 UTC — Entrada 31: parte visual, tablero, auditoría K y documentación de la fase 4b

**Reproductor** (`senales-vip`, rama `ccr-47b7af70-05ostp-whatsapp`, commit 1213a32):
- **Rediseño «red neuronal»:** cian de sinapsis para la estructura, naranja de la marca para la activación, glifo de red y fondo animado apagable.
- **Red de decisión en vivo** (`js/red.js`):
  - para la estrategia del probador dibuja entradas → condiciones → decisión → gestión con las velas ya reveladas;
  - la decisión sale de correr la estrategia exacta.
  - Verificada: el 18/11/2026 a las 17:00 NY muestra la venta del oro D1 que también da E022.
- **Veredicto del laboratorio** en el probador (`js/fichas.js`).
- **El motor no cambió:** `validar_tv.js` da lo mismo que antes (58/58, 302, 84, 82, 143/144).
- **Publicado:** privado (versión 8) y público (versión 5). La reversión está escrita en el LEEME.

**Tablero del laboratorio:**
- artifact de tipo "Data", con 4 fuentes exportadas por `herramientas/exportar_tablero.py`, que lleva su propio código en los metadatos;
- muestra la candidata, la curva de E022, los perfiles de costos, los niveles y los experimentos.

**Auditoría K** (`docs/auditoria_fase0.md`):
- criterios por documento: E019 relajó n de validación a 15 y no exigió payoff, y **E022 nunca cumplió la Misión A**;
- períodos y fugas;
- motor por tipo de orden: E022 tiene 0 operaciones con SL y TP en el mismo minuto;
- Pine v6: sin repintado; vela diaria de 17:00 NY según el feed; sin Bar Magnifier; no compilado;
- paridad: el tramo TradingView queda pendiente del export de Fabrizio (`herramientas/comparar_tradingview.py`);
- clasificación de cada estrategia.

**Documentos:**
- `docs/plan_evolucion.md`: respuesta a los prompts 1 y 2;
- `docs/criterios_v2.md`: escala R–E;
- `docs/datos_gratuitos.md`;
- `docs/fichas.md`;
- README con diagrama del flujo, conclusiones, costos (perfiles 2.0) y `CONTEXTO_PARA_IAS.md`.

**Sigue pendiente:**
- E037: Yahoo responde 429 a las 10:23 UTC;
- F001 en curso;
- paridad con TradingView, que necesita el export.
