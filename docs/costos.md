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
| XAGUSD (plata) | 0,10 % del precio (~0,03 USD a 30) | spread típico 0,02–0,03 |
| WTIUSD (petróleo) | 0,07 % del precio (~0,05 USD a 70) | spread típico 0,03–0,05 |
| Nikkei 225 (JPXJPY) | 0,03 % del precio (~12 puntos a 40000) | CFD típico 7–10 puntos |
| FTSE 100 (UKXGBP) | 0,02 % del precio (~1,8 puntos a 9000) | CFD típico 1–1,5 punto |
| CAC 40 (FRXEUR) | 0,02 % del precio (~1,6 puntos a 8000) | CFD típico 1–1,5 punto |
| ASX 200 (AUXAUD) | 0,03 % del precio (~2,6 puntos a 8500) | CFD típico 1–2 puntos |
| Hang Seng (HKXHKD) | 0,04 % del precio (~10 puntos a 25000) | CFD típico 6–10 puntos |

Son costos de broker minorista razonables, algo conservadores. Las estrategias con stops chicos dependen mucho de este número: se reporta siempre también el resultado sin costos.
