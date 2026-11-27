# Auditoría integral · fase 0 (27/11/2026)

Hecha a partir de los tres prompts que Fabrizio trajo de otras IAs. Cada afirmación se verificó contra el código, los datos y los resultados del repositorio (rama `phase-4-quantitative-research`). Los experimentos E026 y E027 se registraron antes de correrlos (`BITACORA.md`, entrada 25).

## A. Resumen ejecutivo

- **El laboratorio es sólido en lo mecánico.**
  - Datos íntegros: sin duplicados, sin desorden temporal y sin velas OHLC incoherentes en los 17 archivos.
  - El motor es reproducible: una reimplementación independiente en JavaScript (el reproductor) da las mismas operaciones.
  - Hay criterios fijados de antemano y una bitácora completa.
- **Tenía un problema serio de proceso.** La muestra de confirmación intervino en el orden final de las candidatas (E019, E023), y la estrategia recomendada (E022) se eligió mirando 2011–2021. Para el oro D1 ya no queda ningún período de 2010–2026 sin usar.
- **El espacio de hipótesis "reglas de precio" está agotado.**
  - En SMC e ICT, elegir por el pasado no predice el futuro: las 10 mejores por elección dan −0,15 R (SMC) y −0,05 R (ICT) en la confirmación.
  - La probabilidad de sobreajuste (PBO) da 0,33–0,50 en SMC y llega a 1,0 en el setup AMD.
- **E022 (oro D1) es la mejor evidencia de ventaja del laboratorio, pero queda en categoría B.**
  - Le gana a entradas al azar del lado de la SMA 200 con p = 0,0005 en 15 años.
  - Su intervalo de 15 años está arriba de cero y resiste swaps y costos triples.
  - No pasa el Deflated Sharpe con el tamaño de la búsqueda que la eligió (0,24) y no tiene período limpio.
  - **Solo una prueba a futuro la puede llevar a A.**

## B. Arquitectura real

| Capa | Archivos | Estado |
| --- | --- | --- |
| Datos | `lab/datos.py`, `lab/descarga_histdata.py`, `lab/descarga_yahoo.py`, `lab/diario.py`, `lab/cot.py`; `data/` fuera de git, ahora con `data/MANIFIESTO.csv` (sha256) | HistData en M1 (bid) desde 2010 en 17 instrumentos; oro reciente de Dukascopy; COT de la CFTC; Yahoo diario para la fase 3 (pausada) |
| Señales | `lab/senales.py`, `lab/grilla.py` (40 familias), `lab/smc.py`, `lab/ict.py` | Sin mirar adelante: pivotes confirmados, temporalidad mayor con la última vela cerrada (comprobado también en el reproductor) |
| Simulación | `lab/motor.py` (genérico), `smc.simular_ordenes`, `ict.simular` (órdenes límite, límites diarios) | Resolución M1, SL primero, huecos en la apertura, una operación a la vez |
| Métricas y política | `lab/metricas.py`, **nuevo** `lab/validacion.py` (PSR, DSR, PBO/CSCV, bootstrap), **nuevo** `lab/politica.py`, **nuevo** `lab/financiacion.py` | |
| Experimentos | `experimentos/E000`–`E027`, con sus salidas en `resultados/` | |
| Pruebas | `tests/test_motor.py` (6), **nuevo** `tests/test_fase4.py` (6) | 12 pasan. Sin integración continua |
| Pine | `pine/*.pine` | Sin compilar: el validador quedó bloqueado por la red. La implementación verificada es el reproductor (`senales-vip/backtest/reproductor/js/tv.js`) |

## C. Hallazgos

| # | Componente | Problema (evidencia) | Gravedad | Tipo | Solución |
| --- | --- | --- | --- | --- | --- |
| 1 | Proceso de selección | E019 ordenó por Wilson de 5 años (`elegir()`, línea 154) y E023 por la expectancy de 5 años: la confirmación ordenó. E022 se eligió con 2011–2021 (E020/E021). | **CRÍTICO** | Comprobado | Regla nueva: ordenar solo con la elección (`docs/criterios_v2.md`). Prueba a futuro desde el 27/11/2026. |
| 2 | Generalización SMC/ICT | Las 10 mejores por elección dan −0,145 R en la confirmación (E023, 2 de 10 positivas) y −0,050 R (E025, 4 de 10). PBO de 0,33–0,50 (SMC) y 1,0 (AMD). | **CRÍTICO** | Comprobado (E026) | No más búsquedas masivas en ese espacio; cambiar de hipótesis (sección E). |
| 3 | Pruebas múltiples | Unas 380.000 configuraciones (`registro/presupuesto_pruebas.csv`) sin corrección. DSR de E022 = 0,24 con N efectivo 4.098. | ALTO | Comprobado (E027) | DSR y PBO obligatorios (`lab/validacion.py`). |
| 4 | Simuladores SMC/ICT | Una orden límite llenada con hueco más allá de su stop sale en el stop, que es optimista. Cambian 39.252 de 91.687 configuraciones de E023: −0,006 R en promedio y −0,22 R en el peor caso. | ALTO | Comprobado (E026-C) | Opción `realista=True`, apagada por defecto para no alterar la historia; usarla en todo experimento nuevo. |
| 5 | Financiación | Ningún resultado incluía swaps. E022: −0,02 a −0,04 R (pasa menos de una noche en promedio). La candidata B (186–250 días por operación) pagaría mucho más. | ALTO | Comprobado en E022 | `lab/financiacion.py` con escenarios explícitos. |
| 6 | Pine | Los `.pine` no se compilaron, y hay diferencias conocidas con el lab: empates de pivotes, `[1]` en el filtro diario y camino intrabar de TradingView. | ALTO | Riesgo | Usar el reproductor, validado operación por operación contra el lab, como implementación operativa. |
| 7 | Costos | Ida y vuelta fija por instrumento, sobre una sola serie (bid). Sin spread por sesión, noticias o volatilidad. | MEDIO | Simplificación | Escenarios de estrés (× 1,5 a × 3) en cada candidata; spread por sesión cuando haya datos de ask. |
| 8 | Reglas del minuto de entrada | `motor.py` permite el TP en el minuto de la entrada; `smc` e `ict` no. Afecta 1 operación de 58 en E022, con el mismo R. | MEDIO | Comprobado | Documentado; unificar en el motor 2.0. |
| 9 | Pruebas automáticas | Solo cubrían el motor; `smc`, `ict`, `grilla` y `diario` se validaron indirectamente con la reimplementación del reproductor. Sin integración continua. | MEDIO | Comprobado | Pruebas por módulo y un workflow de GitHub Actions con datos sintéticos. |
| 10 | Reproducibilidad | Dependencias sin fijar y datos sin huella: HistData no garantiza servir los mismos archivos. | MEDIO | Corregido | `requirements.txt` con versiones fijas y `data/MANIFIESTO.csv`. |
| 11 | Datos | CFD de índices con huecos de más de 4 días (Hang Seng 39, ASX 25, CAC 21, FTSE 18). DAX y WTI rotos (excluidos). Sin volumen. Sin US30. USDCAD solo desde 2020. | MEDIO | Comprobado | Documentado; no sirven para microestructura. |
| 12 | Régimen histórico | 2010–2026 no tiene un mercado bajista largo de acciones. | MEDIO | Comprobado | Fase 3: los índices de Yahoo desde 1990 sirven; el oro anterior a 2012 no. |
| 13 | Operaciones abiertas al final | Se excluyen (`motivo == 3`). | BAJO | Comprobado | Informarlas aparte. |
| 14 | Regla de empates de pivotes | No se verificó contra `ta.pivothigh` de TradingView. | BAJO | Riesgo | Verificar con un export de TradingView. |

## D. Lo que los prompts dicen y el repositorio no

- **"El único superviviente de E019 es indistinguible de comprar y mantener."** Mezcla dos cosas.
  - La estrategia de stop de 6 ATR que empata con comprar siempre es la candidata B de **E009**.
  - La superviviente de E019 en 2011–2021 es **E022**, y E027 muestra que **no es solo deriva**: le gana con p = 0,0005 a entradas al azar del mismo lado de la SMA 200, con el mismo SL/TP y la misma frecuencia.
- **"13 activos, incluido US30."** No hay datos de US30.
- **"Pruebas automatizadas y workflows."** Había 6 pruebas del motor y ningún workflow.
- **Citas a "AlgoXpert (2026)" y "GT-Score (2026)".** No las pude verificar. En su lugar se implementaron métodos establecidos y documentados: PSR y DSR (Bailey y López de Prado, 2012 y 2014) y PBO con CSCV (Bailey, Borwein, López de Prado y Zhu, 2015). Si aparecen las referencias, GT-Score puede sumarse como objetivo alternativo.
- **La crítica a E016 (COT) es válida en parte.** Usó un índice de 3 años del posicionamiento de los especuladores en 9 mercados. No separó comerciales de swap dealers ni probó cambios semanales o extremos.

## E. Diagnóstico

1. **El problema no es técnico, es el espacio de hipótesis.**
   - En velas de 1 minuto a 15 minutos, las reglas de precio rinden lo que el azar con RR 1:2, como predice la teoría de la bitácora (Sharpe diario × stop en desvíos ≥ 0,24).
   - Seguir buscando ahí produce falsos positivos: PBO alto y selección que no generaliza.
2. **La única ventaja medible está en el oro diario (E022).** Es momentum de corto plazo tras rupturas de volatilidad a favor de la tendencia: no es el azar ni solo la deriva. La evidencia es moderada (DSR 0,24 por la búsqueda; 0,80 en 2011–2021 con N = 11), es específica del oro y no tiene período limpio.
3. **El win rate ≥ 50 % no es el objetivo correcto para medir ventaja.** Se conserva como "Misión A" (referencia de Trading Institucional), pero las candidatas se evalúan por expectancy, contra el azar y con DSR y PBO (categorías A/B/C).

## F. Qué se puede hacer con lo que ya hay y qué necesita datos nuevos

| Sin proveedores externos | Con datos nuevos (decisión de Fabrizio) |
| --- | --- |
| Prueba a futuro de E022 y del setup 5 ICT en el reproductor, en papel, desde el 27/11/2026: **la única validación limpia posible** | Volumen real y order flow: futuros GC y NQ/ES de CME, de pago (por ejemplo Databento o FirstRate Data). El volumen de ticks de CFD no es volumen real. |
| Walk-forward con ventanas móviles y PBO con más bloques (guardar métricas trimestrales en las grillas) | Calendario macro con dato, consenso y hora de publicación (de pago) |
| COT desagregado: comerciales, managed money, swap dealers, cambios semanales y extremos (la CFTC ya está permitida en la red) | Volatilidad implícita del oro (GVZ) y VIX diarios: gratis en FRED, pero hace falta permitir el host |
| Benchmark de volatilidad objetivo o risk parity en índices y oro, e information ratio de la candidata B y del momentum transversal | Opciones (skew, gamma): de pago |
| Filtros de régimen por volatilidad realizada (percentiles; HMM después), fijados de antemano | |
| Swaps en la candidata B; fase 3 de índices 1990–2009 con Yahoo | |

## G. Plan priorizado (4–6 semanas)

1. **Semana 1 (sin dependencias):**
   - abrir la prueba a futuro (E022 + ICT 5) en el reproductor, con un registro diario;
   - **E028**: walk-forward móvil de la familia de E022 (bandas, k, SMA) con elección solo en ventanas pasadas;
   - **E029**: swaps y risk parity como benchmark de la candidata B y del momentum transversal (information ratio).
2. **Semana 2:**
   - **E030**: COT desagregado con hipótesis registrada (extremos de managed money en oro → retorno a 1–4 semanas), con su publicación del viernes a las 17:00 NY;
   - pruebas automáticas de `smc`, `ict` y `grilla`, más un workflow.
3. **Semanas 3–4:**
   - **E031**: régimen de volatilidad realizada como capa separada para E022 e ICT 5 (reducir la varianza del acierto entre regímenes sin bajar la expectancy más de 10 %);
   - fase 3: índices 1990–2009 para la candidata B y el momentum de líderes.
4. **Semanas 5–6 (si Fabrizio aprueba datos):** **E032**, volumen y delta de futuros de oro (GC) alrededor de los barridos del día anterior. Es la hipótesis SMC con fundamento en flujo, no en la forma de la vela.
5. **Tablero de resultados** (filtros por familia, instrumento, temporalidad, PBO y categoría) como artefacto del reproductor o página aparte, cuando E028–E030 estén corriendo.

## H. Qué no hacer

- Otra búsqueda masiva de reglas de entrada sobre velas: E019, E023 y E025 ya mostraron que no generaliza.
- Ordenar, filtrar o "mirar a ver" con la confirmación o con períodos de estrés y después seguir llamándolos validación.
- Agregar filtros hasta que algo pase: cada filtro suma pruebas y baja el DSR.
- Usar stops chicos frente al costo: con un riesgo menor a 3 veces el costo, cualquier ventaja desaparece.
- Juzgar por win rate sin compararlo con entradas al azar equivalentes.
- Declarar una estrategia "aprobada" sin un período limpio o una prueba a futuro.

## I. Lista de control antes de declarar éxito

1. Hipótesis y criterios escritos en la bitácora antes de correr.
2. Orden de candidatas solo con la elección; confirmación como pasa o no pasa.
3. Tamaño de la búsqueda registrado; DSR con N efectivo; PBO por familia.
4. Le gana a entradas al azar equivalentes (p < 0,05) y a comprar o vender siempre.
5. IC 95 % de la expectancy arriba de 0; al menos 150 operaciones.
6. Costos × 1,5 a × 3, swaps y llenado realista.
7. Estable en vecinos y en al menos 70 % de los años.
8. Período nunca usado o prueba a futuro con al menos 30 operaciones.
9. Implementación operativa (reproductor) validada operación por operación contra el lab.

## J. Estado

- **Terminado:**
  - auditoría;
  - `lab/validacion.py`, `lab/politica.py` y `lab/financiacion.py`;
  - llenado realista;
  - E026 y E027;
  - criterios v2, presupuesto de pruebas, manifiesto y dependencias fijas;
  - 12 pruebas.
- **Pendiente:** prueba a futuro, E028–E032, pruebas por módulo, workflow y tablero.
- **Clasificación actual:** E022 = **B**. Los setups SMC e ICT = **C**: el setup 5 ICT tiene PBO de 0,17 y vale una prueba a futuro, pero no hay evidencia suficiente. La candidata B = **C** (no le gana a comprar siempre).
