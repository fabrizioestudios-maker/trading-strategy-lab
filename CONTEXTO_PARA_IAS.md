# Contexto del proyecto (para pedir opinión a otras IAs)

Esta página resume el proyecto al 27/11/2026 (fase 4b). El detalle, con fechas y números, está en:
- `BITACORA.md`, entradas 1 a 31;
- `docs/plan_evolucion.md`;
- `docs/auditoria_fase0.md` (secciones A–K);
- `docs/fichas.md`.

## Quiénes y qué
Fabrizio opera y da señales de trading (servicio de señales VIP) en XAUUSD, EURUSD, GBPUSD, USDCAD, US100, US30 y US500.
- **El objetivo original:** una estrategia **rentable con win rate ≥ 50 % y RR 1:2**, probada en los últimos 5 años, para scalping o daytrading.
- **Desde la fase 4:** ese objetivo se informa como "Misión A". Las decisiones se toman con la **ventaja medible**: expectancy contra el azar, alfa sobre benchmarks, costos realistas y período limpio.
- **Restricción actual:** todo sin gastar dinero.

## Herramientas
- **Laboratorio** (`lab/`, `experimentos/`, Python + numba):
  - velas de 1 minuto 2010–2026, costos por sesión y swaps, SL primero en el mismo minuto;
  - validación con DSR, PBO, FDR, SPA de Hansen y walk-forward con purga;
  - benchmarks risk parity con IR de tasación;
  - prueba a futuro sellada con hash;
  - 27 pruebas automáticas.
- **Datos gratuitos:** HistData; CFTC (COT por tipo de participante); FRED (tasas, tasa real, VIX, GVZ); Yahoo, con límite de pedidos.
- **Reproductor de velas** (repo `senales-vip`, `backtest/reproductor`):
  - bar replay estilo TradingView con oro M1 2018–2026;
  - motor compatible con TradingView, validado operación por operación contra el laboratorio;
  - **red de decisión en vivo:** muestra, vela por vela, qué condiciones de la estrategia están activas;
  - veredicto del laboratorio para cada estrategia del probador.
  - Link público: https://claude.ai/artifact/PErYePwzYdNSR5EaHavBh2
- **Tablero del laboratorio** (artifact privado): candidata, costos, niveles y experimentos.

## Qué se sabe (resumen honesto)

| Pregunta | Respuesta | Dónde |
| --- | --- | --- |
| ¿Alguna regla de precio sobrevive a corregir por la búsqueda? | No: 0 de 297.354 con Bonferroni, Holm, BH o BY; SPA de Hansen en D1 p = 0,21 | E031 |
| ¿SMC e ICT funcionan en oro? | No. En su historia nunca usada (2010–2021): SMC −0,03 R, ICT 5 +0,04 R. Igual que el azar con RR 1:2 | E038 |
| ¿Un barrido de liquidez predice la reversión? | No: contra operar a la misma hora otro día, la diferencia es ≈ 0 en PDH/PDL, semana, Asia y Londres | E035b |
| ¿Qué componentes del SMC suman? | Liquidez del día anterior (+0,09 R) y killzones (+0,03 R). Restan las entradas en FVG, OB y OTE (−0,05 a −0,08 R) | E035a |
| ¿Hay alguna ventaja? | **Oro D1** (ruptura de Bollinger a favor de la SMA 200, SL 0,5 ATR, TP 2R): ver el detalle abajo | E022, E027–E032 |
| ¿El COT, la tasa real o el GVZ predicen? | No, con los datos gratuitos | E033 |
| ¿Tendencia multiactivo con volatilidad objetivo? | Sharpe 0,21 desde 2010, contra 0,61 del risk parity | E036 |

**Oro D1, en detalle:**
- 168 operaciones en 2011–2026, 47,6 % de acierto y +0,41 R, con IC [+0,18; +0,64].
- Le gana al azar del mismo lado (p = 0,0005).
- IR de tasación 0,85 sobre el oro y el risk parity; correlación con el oro 0,03.
- +0,33 R con costos conservadores.
- Toda su familia de parámetros es positiva fuera de muestra.
- **Nivel B (candidata).**

**Qué le falta al oro D1:**
- DSR de 0,24 por la búsqueda que la eligió;
- walk-forward principal con razón prueba/elección de 0,34;
- un período limpio: prueba a futuro F001 desde el 27/11/2026 y E037 (GLD 2005–2011), bloqueado por Yahoo.

## Preguntas para otras IAs
1. ¿Ven errores en el protocolo de la fase 4b (placebo de E035b corregido, disponibilidad de datos, walk-forward con purga, SPA)?
2. Con el oro D1 como única candidata, ¿cómo acortarían la prueba a futuro sin contaminarla? Hace ~11 operaciones por año.
3. ¿Qué hipótesis **gratuita** con fundamento probarían, registrada y sin grilla? Ya hay dos en cola: barrido del día anterior con entrada a mercado en killzones, y reversión tras compras de fondos en el COT.
4. ¿Qué le falta al reproductor para replicar el Strategy Tester? El comparador con el export de TradingView ya está (`herramientas/comparar_tradingview.py`).

## Dónde mirar
- `BITACORA.md`: historia completa, con hipótesis registradas antes de cada corrida.
- `docs/plan_evolucion.md`, `docs/auditoria_fase0.md`, `docs/fichas.md`, `docs/datos_gratuitos.md` y `docs/criterios_v2.md` (propuesta de escala R/A/B/C/D/E; `docs/criterios.md` sigue siendo el criterio histórico).
- `experimentos/E028`–`E038`, `F001` y `resultados/`.
- `registro/experimentos/*.json`: cada corrida con el commit y el hash del código.
