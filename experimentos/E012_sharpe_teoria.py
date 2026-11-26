"""
E012 — Sharpe realizado por instrumento (D1) en selección y validación, y el acierto que predice la teoría para comprar
siempre con 1:2 y un stop de k desvíos diarios: θ = 2·k·Sharpe_diario, P = (1 − e^θ) / (e^(−2θ) − e^θ).
Sirve para entender qué activos pueden llegar a 50 % con stops anchos y cuáles no.
"""
import math
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia  # noqa: E402

TODOS = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "WTIUSD", "SPXUSD", "NSXUSD", "GRXEUR", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD"]


def p_teorica(sr_d, k):
    th = 2 * k * sr_d
    if abs(th) < 1e-9:
        return 1 / 3
    return (1 - math.exp(th)) / (math.exp(-2 * th) - math.exp(th))


filas = []
for instr in TODOS:
    if not os.path.exists(os.path.join(datos.RAIZ, instr + ".npz")):
        continue
    v = datos.velas(datos.cargar(instr), 1440)
    r = np.diff(np.log(v["c"]))
    t = v["t"][1:]
    for mu_n, m in (("selección", t < estrategia.CORTE), ("validación", t >= estrategia.CORTE)):
        x = r[m]
        sr_d = x.mean() / x.std()
        filas.append(dict(instr=instr, muestra=mu_n, anios=round(len(x) / 252, 1), ret_anual=round(x.mean() * 252 * 100, 1), vol_anual=round(x.std() * math.sqrt(252) * 100, 1),
                          sharpe=round(sr_d * math.sqrt(252), 2), p_k3=round(p_teorica(sr_d, 3) * 100, 1), p_k5=round(p_teorica(sr_d, 5) * 100, 1)))
df = pd.DataFrame(filas)
os.makedirs("resultados/E012", exist_ok=True)
df.to_csv("resultados/E012/sharpe_y_teoria.csv", index=False)
print(df.pivot_table(index="instr", columns="muestra", values=["sharpe", "p_k3", "p_k5"]).to_string())
