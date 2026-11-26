"""
E000 — Control de calidad de los datos: saltos diarios imposibles (|retorno| > 15 % entre cierres diarios consecutivos),
huecos largos y precios no positivos. Un instrumento con cambios de escala se excluye del universo.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos  # noqa: E402

TODOS = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "WTIUSD", "SPXUSD", "NSXUSD", "GRXEUR", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD"]
filas = []
for instr in TODOS:
    if not os.path.exists(os.path.join(datos.RAIZ, instr + ".npz")):
        continue
    m = datos.cargar(instr)
    v = datos.velas(m, 1440)
    r = np.diff(np.log(v["c"]))
    t = pd.to_datetime(v["t"][1:], unit="ms", utc=True)
    saltos = [(str(t[j].date()), round(float(r[j]) * 100, 1)) for j in np.flatnonzero(np.abs(r) > 0.15)]
    huecos = np.diff(m["t"]) / 86400000
    filas.append(dict(instr=instr, desde=str(pd.to_datetime(m["t"][0], unit="ms").date()), hasta=str(pd.to_datetime(m["t"][-1], unit="ms").date()), minutos=len(m["t"]),
                      precios_no_positivos=int((m["l"] <= 0).sum()), hueco_max_dias=round(float(huecos.max()), 1), saltos_mayores_15pct=saltos))
df = pd.DataFrame(filas)
os.makedirs("resultados/E000", exist_ok=True)
df.to_csv("resultados/E000/calidad.csv", index=False)
print(df.to_string(index=False))
