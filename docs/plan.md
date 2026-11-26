# Plan de ataque

## Punto de partida: por qué 50 % con 1:2 es exigente

Si el precio fuera un paseo al azar sin tendencia, la probabilidad de tocar un TP a 2 unidades antes que un SL a 1 unidad es exactamente 1/3 (33,3 %). Para llegar al 50 % hace falta que, en el momento de entrar, el precio tenga una deriva a favor fuerte comparada con su volatilidad.

Para un movimiento browniano con deriva μ y volatilidad σ, con el SL a distancia `a` y el TP a `2a`:

- P(TP antes que SL) = (1 − e^θ) / (e^(−2θ) − e^θ), con θ = 2·μ·a / σ².
- P = 50 % cuando θ = ln(1,618) ≈ 0,48.

Consecuencias que guían la búsqueda:

1. **El costo mata a los stops chicos.** Con stops chicos, el spread y el deslizamiento se comen la ventaja (ya se vio en XAUUSD M1: ninguna estrategia de scalping llegó a 1:2 con 50 %).
2. **La deriva rinde más con stops anchos.** θ crece con `a`: una misma deriva da más acierto con stops más anchos. Eso apunta a temporalidades altas (H4, diario) y a contextos de tendencia persistente.
3. **La señal tiene que predecir dirección.** Una señal sirve si identifica momentos con mucha deriva por unidad de varianza. Sin eso, ningún filtro de price action la va a sacar del ~33–40 %.

Antecedentes en este proyecto, en `noticias-bot/docs/estrategias`:
- **LuxAlgo:** 1.584 combinaciones, máximo 44 % con 1:2.
- **Setup A+:** máximo 42 %.
- **Scalping en el oro:** nada llegó a 1:2 con 50 %.

## Universo

| Clase | Instrumentos | Fuente | Período |
| --- | --- | --- | --- |
| Metales | XAUUSD (oro) | HistData + Dukascopy (ya bajado) | 2018–2026 |
| Forex mayores | EURUSD, GBPUSD, USDJPY, AUDUSD | HistData | 2016–2026 |
| Índices | SPX500 (SPXUSD), NAS100 (NSXUSD), DAX (GRXEUR) | HistData | 2016–2026 |
| Cripto | BTCUSD | pendiente: HistData no lo tiene; se agrega si hay una fuente accesible | — |

Temporalidades: M15, H1, H4 y diario para las señales. Las salidas se resuelven siempre en M1.

## Fases

1. **Infraestructura:** descarga y normalización de datos (UTC), motor de backtest en numba (SL/TP en M1, costos), métricas y prueba del motor contra el caso teórico (entradas al azar ⇒ ~33 % con 1:2).
2. **Línea de base empírica:** para cada instrumento, dirección y tamaño de stop (múltiplos del ATR), medir el acierto de entradas al azar con 1:2. Esto mide cuánta deriva hay y dónde: la vara contra la que se compara cada señal.
3. **Barrido de hipótesis por familia** (selección 2016–2021). Cada señal se evalúa por cuánto mejora el acierto respecto de la línea de base:
   - Tendencia y momentum: cruces de medias, ruptura de Donchian, momentum de N días, ADX, pendiente de la media de 200.
   - Pullbacks en tendencia (multi-temporalidad): retroceso a la media o RSI bajo dentro de tendencia alcista.
   - Ruptura tras compresión: NR7, inside bar, squeeze de Bollinger/Keltner, rango asiático.
   - Reversión a la media: RSI y Bollinger extremos, z-score, barridas de liquidez (ya probadas con SMC).
   - Tiempo: hora del día, día de la semana, comienzo y fin de mes, apertura de sesiones.
   - Estructura: rupturas de máximos y mínimos de giro, máximos y mínimos del día y la semana anteriores.
   - Volumen y order flow: los datos M1 de HistData no traen volumen. Se documenta como límite y se prueba solo si aparece una fuente con volumen.
4. **Profundizar** solo en lo que pase los criterios en selección: validación 2022–2026, walk-forward, parámetros vecinos, otros instrumentos, Monte Carlo del drawdown.
5. **Conclusión honesta:** la estrategia, o la demostración de por qué no aparece con este enfoque.

## Cómo se registra

- Cada paso significativo lleva una entrada en `BITACORA.md` y un commit.
- Cada experimento tiene su script en `experimentos/` y sus resultados en `resultados/` (CSV y resumen), para que se pueda reproducir.
