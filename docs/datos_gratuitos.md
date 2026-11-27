# Datos sin costo (27/11/2026)

Fabrizio pidió hacer todo sin gastar dinero. Esto es lo que se consigue gratis, cómo se usa sin mirar adelante y qué no se puede reemplazar.

| Necesidad | Fuente gratuita | Estado | Módulo |
| --- | --- | --- | --- |
| Velas M1 (bid) 2010–2026 | HistData | En uso desde la fase 1 | `lab/descarga_histdata.py` |
| Oro reciente, bid y ask (spreads reales) | Dukascopy | Responde 429 (límite de pedidos) desde este servidor: no se insiste | — |
| Historia diaria larga de índices (1990–2009) | Yahoo | Funciona con límite de pedidos; **no reproduce HistData en el solape** (E018) | `lab/descarga_yahoo.py`, `lab/externos.yahoo` |
| Oro antes de 2010 | Yahoo GLD (ETF) | Bloqueado por 429 al 27/11; E037 listo para correr | `experimentos/E037_oro_remoto_gld.py` |
| COT por tipo de participante | CFTC (Socrata): desagregado y TFF | 11 mercados, 2006–2026 | `lab/externos.cot` |
| Tasas, tasa real, inflación esperada, VIX, GVZ, OVX | FRED | 8 series | `lab/externos.fred` |
| Volumen real de futuros de oro | Yahoo GC=F | **Inservible antes de 2020** (56–198 contratos por día contra ~200.000 reales) | — |
| Order flow (delta, CVD, libro) | **No hay fuente gratuita** con historia | — | — |
| Opciones (skew, gamma) | **No hay fuente gratuita** con historia | Se usa GVZ (volatilidad implícita) como sustituto | — |

**Disponibilidad real** (`disponible_ms` en `lab/externos.py`):
- **VIX y GVZ:** 16:15 NY del mismo día.
- **Tesoro (H.15):** día hábil siguiente, 17:00 NY.
- **COT:** viernes 17:00 NY; lunes si hubo feriado; fechas posteriores a la recuperación en los cierres del gobierno de 2013, 2018–19 y 2025.

**Lo que sí puede aportar Fabrizio gratis:**
1. **Export de MT5 de su bróker:** velas M1 con la columna `<SPREAD>`. Calibra el spread por sesión de `lab/ejecucion.py` con su bróker real y suma US30.
2. **Export de la lista de operaciones del Strategy Tester de TradingView:** cierra la paridad del tercer tramo con `herramientas/comparar_tradingview.py`.

**Sin dinero, lo que se pierde:**
- order flow e historial de opciones;
- spreads reales históricos, que se modelan con perfiles y se estresan (E030).

Ninguna conclusión de la fase 4b depende de esos datos: las que fallaron, fallaron con datos de precio limpios.
