"""E013 — Curva de resultados (R acumulado) de la candidata B frente a comprar siempre con el mismo SL/TP."""
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402

UNIV = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "XAUUSD", "XAGUSD"]


def curva(fn, k=6.0):
    filas = []
    for i in UNIV:
        m1 = datos.cargar(i)
        v = datos.velas(m1, 1440)
        ops = estrategia.operaciones(i, m1, v, fn(v), k, rr=2.1, lados=(1,))
        m = ops["motivo"] != 3
        filas.append(pd.DataFrame(dict(t=ops["t_salida"][m], r=ops["r"][m])))
    d = pd.concat(filas).sort_values("t")
    return pd.to_datetime(d.t, unit="ms", utc=True), d.r.cumsum().values


t1, c1 = curva(lambda v: np.where(S.tendencia(v, 200) == 1, 1, 0))
t2, c2 = curva(lambda v: np.ones(len(v["c"]), int))
fig, ax = plt.subplots(figsize=(10, 4.5), dpi=130)
ax.axvspan(pd.Timestamp("2022-01-01", tz="UTC"), t1.max(), color="#f3ead8", label="validación (2022–2026)")
ax.plot(t1, c1, color="#d9480f", lw=2, label="Candidata B: tendencia 200, solo compras, SL 6 ATR, TP 2,1×")
ax.plot(t2, c2, color="#6c757d", lw=1.4, ls="--", label="Comprar siempre, mismo SL y TP")
ax.set_ylabel("R acumulado (con costos)")
ax.set_title("8 activos con deriva (6 índices, oro y plata), una operación a la vez por activo")
ax.grid(alpha=0.3)
ax.legend(loc="upper left", fontsize=8, frameon=False)
fig.tight_layout()
os.makedirs("resultados/E013", exist_ok=True)
fig.savefig("resultados/E013/curva_candidata_B.png")
print("ok", round(c1[-1], 1), round(c2[-1], 1))
