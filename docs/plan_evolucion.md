# Plan de evolución (fase 4b, 27/11/2026)

Responde a los prompts de otras IAs que trajo Fabrizio:
- "Rediseño del espacio de hipótesis";
- "Re-análisis completo";
- "Auditoría forense".

La auditoría está en `docs/auditoria_fase0.md` (secciones A–K) y los números en `BITACORA.md`, entradas 27 a 30. Todo se hizo **sin gastar dinero**: datos de FRED, la CFTC y Yahoo, y papers de arXiv.

## A. Resumen ejecutivo

- **Las reglas de precio están agotadas.**
  - Ninguna de 297.354 configuraciones sobrevive a la corrección por pruebas múltiples (E031).
  - La mejor regla diaria tampoco pasa la prueba SPA de Hansen (p = 0,21).
  - Los setups SMC e ICT del oro, en su historia nunca usada (2010–2021), dan lo que da el azar con RR 1:2 (E038).
- **Lo que queda es el oro D1 (E022), nivel B · candidata.**
  - Le gana al azar (p = 0,0005).
  - Agrega alfa sobre una cartera pasiva (IR 0,85, sin correlación con el oro).
  - Resiste costos realistas (+0,33 R con el perfil conservador).
  - Toda su familia de parámetros es positiva fuera de muestra.
  - Le falta un período limpio: la prueba a futuro F001 ya corre, sellada con hash.
- **Los datos gratuitos de "flujo" no agregaron nada medible:** COT por tipo de participante, tasa real, GVZ y régimen HMM (E033, E034). El volumen gratis de futuros no sirve antes de 2020.

## B. Las mejoras que pidió el prompt 1, implementadas y medidas

| # | Mejora | Causa raíz | Módulo | Experimento | Resultado | Complejidad | Impacto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Ejecución realista (spread por sesión y volatilidad, deslizamiento, latencia, swaps, impacto) | Backtest con costo fijo | `lab/ejecucion.py` | E030 | Oro D1 aguanta hasta el estrés (+0,27 R); la candidata B y los líderes se dan vuelta por los swaps | M | A |
| 2 | Flujo y posicionamiento (COT desagregado con fecha real de publicación, intermercado) | Hipótesis solo de precio | `lab/externos.py`, `lab/flujo.py` | E033 | Sin poder predictivo (IC −0,04 a +0,02) | M | B |
| 3 | Régimen HMM sin mirar adelante | Misma lógica en todo régimen | `lab/regimen.py` | E034 | Oro D1 no lo necesita; ICT 5 mejora con volatilidad alta, con evidencia débil | M | B |
| 4 | Objetivo anti-sobreajuste: GT-Score (paper verificado), meseta y acantilado de AlgoXpert, walk-forward con purga | Elegir el máximo del pasado | `lab/objetivos.py`, `lab/walkforward.py` | E028 | GT-Score rinde igual que la regla simple; la meseta casi nunca elige; supervivencia +13 puntos sobre el azar, no alcanza | M | M |
| 5 | Benchmark risk parity / volatilidad objetivo e IR | Comparar contra comprar y mantener sin costos | `lab/benchmarks.py` | E029, E036 | Solo el oro D1 agrega alfa (IR 0,85); la regla de "giro a asignación" no se dispara | B | A |

**Además (prompts 2 y 3):**
- pruebas múltiples (`lab/multiples.py`: Bonferroni, Holm, BH, BY, SPA);
- Monte Carlo y cartera (`lab/montecarlo.py`, `lab/cartera.py`);
- ficha completa de métricas (`lab/ficha.py`);
- registro de experimentos con hash (`lab/registro.py`, `registro/experimentos/`);
- escala de estados R/A/B/C/D/E (`lab/politica.nivel`);
- estudio de eventos con placebo (`lab/eventos.py`);
- 27 pruebas automáticas.

## C. Recomendación sobre el objetivo de 50 % con RR 1:2

**Dualizar, no abandonar.**
- La **Misión A** (≥ 50 % y payoff ≥ 2) queda como referencia de la línea institucional, y se informa siempre.
- Las decisiones se toman con la **ventaja medible**: expectancy, intervalo, contra el azar, alfa sobre benchmarks, costos realistas y período limpio.
- La teoría de la bitácora explica por qué:
  - con stops intradía, 50 % a 1:2 exige un Sharpe anual cercano a 4;
  - con RR 1:2, 40 % de acierto ya deja +0,20 R por operación.
- El oro D1 hace 47,6 % en 15 años y es la única estrategia con ventaja demostrable.

## D. Plan priorizado (próximas 4–8 semanas, sin costo)

| Plazo | Qué | Dependencia |
| --- | --- | --- |
| Semana 1 | E037 (oro D1 en GLD 2005–2011) apenas Yahoo deje de limitar; informe de F001 | Yahoo |
| Semana 1 | Export de TradingView de E022 y `herramientas/comparar_tradingview.py` (paridad del tercer tramo) | Fabrizio exporta la lista |
| Semanas 1–2 | Export de MT5 de Fabrizio (M1 con columna de spread) para calibrar los perfiles de costos y sumar US30 | Fabrizio |
| Semanas 2–4 | E039: barrido de liquidez del día anterior **con entrada a mercado** en killzones. Son los dos componentes que suman en E035a. Hipótesis nueva, registrada, sin grilla | — |
| Semanas 2–4 | E040: hipótesis registrada sobre la observación no registrada de E033 (reversión a una semana tras compras de fondos en el COT) | — |
| Mensual | F001: actualizar con `experimentos/F001_prueba_a_futuro.py actualizar` | Datos nuevos |

## E. Qué no hacer
- Otra búsqueda masiva de reglas de entrada: E031 muestra que nada sobrevive a la corrección.
- Ordenar o filtrar con la confirmación, o mirar "a ver" un período y seguir llamándolo validación.
- Sumar filtros hasta que algo pase: cada filtro es otra prueba.
- Usar un placebo que conozca el futuro: E035b lo hizo y se corrigió en la entrada 29.
- Declarar "validada" una estrategia sin período limpio o prueba a futuro.

## F. Lista de control antes de declarar éxito
1. Hipótesis y criterios en la bitácora antes de correr.
2. Orden de candidatas solo con la elección.
3. Tamaño de la búsqueda registrado; DSR, PBO y corrección por pruebas múltiples.
4. Le gana al azar equivalente y agrega alfa sobre benchmarks pasivos con los mismos costos.
5. Expectancy con IC 95 % > 0 y positiva con costos conservadores y swaps.
6. Walk-forward con purga: GR ≥ 0,5 y mayoría de ventanas positivas.
7. Período nunca usado o prueba a futuro con ≥ 30 operaciones.
8. Paridad Python ↔ reproductor ↔ TradingView dentro de tolerancia.

## G. Observaciones adicionales
- **Los papers citados existen:** GT-Score (arXiv 2602.00080) y AlgoXpert (arXiv 2603.09219). Las cifras que citaban los prompts son propias de sus autores, sin réplica independiente. Con nuestros datos, GT-Score no mejoró a la regla simple.
- **Las afirmaciones del prompt 1** sobre un "HMM asimétrico con F1 de 71,3 %" no se pudieron rastrear y no se usaron.
- **El reproductor** tiene ahora una **red de decisión** que muestra, vela por vela, qué condiciones de cada estrategia están activas, y el veredicto del laboratorio en el probador.
