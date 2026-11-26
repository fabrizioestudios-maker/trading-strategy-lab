# Costos por operación

Se descuentan en cada operación, ida y vuelta (spread + deslizamiento de entrada y salida), del resultado en precio:
`R = (movimiento a favor − costo) / riesgo`.

Los datos de HistData son precios bid. SL y TP se evalúan sobre esos precios y el costo completo se cobra aparte. Es equivalente a operar con spread, con un error menor que el del supuesto pesimista de SL antes que TP en el mismo minuto.

| Instrumento | Costo ida y vuelta | Referencia |
| --- | --- | --- |
| XAUUSD | 0,0125 % del precio (0,50 USD a precio 4000) | Exness Standard: spread ~0,40 + deslizamiento |
| EURUSD | 1,0 pip (0,00010) | spread ECN ~0,2–0,8 pip + comisión + deslizamiento |
| GBPUSD | 1,4 pip | |
| USDJPY | 1,0 pip (0,010) | |
| AUDUSD | 1,2 pip | |
| SPX500 | 0,015 % del precio (~0,9 puntos a 6000) | CFD típico: spread 0,5 punto + deslizamiento |
| NAS100 | 0,012 % del precio (~2,5 puntos a 21000) | CFD típico: spread 1–1,5 punto + deslizamiento |
| DAX (GER40) | 0,012 % del precio (~2,8 puntos a 23000) | CFD típico: spread 1–1,5 punto + deslizamiento |

Son costos de broker minorista razonables, algo conservadores. Las estrategias con stops chicos dependen mucho de este número: se reporta siempre también el resultado sin costos.
