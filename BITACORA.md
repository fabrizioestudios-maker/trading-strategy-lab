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
