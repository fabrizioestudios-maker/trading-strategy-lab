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
