"""
E008 — Cartera de tendencia (momentum de series de tiempo) en todo el universo, reglas idénticas en todos los
instrumentos y en las dos direcciones. Variante "solo compras en activos con deriva de largo plazo" (índices y metales).
SL = k·ATR(14) diario, TP = 2,1·SL. Solo selección (< 2022).
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

INSTR = sys.argv[1].split(",")
DERIVA = {"SPXUSD", "NSXUSD", "GRXEUR", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "XAUUSD", "XAGUSD"}
RR = 2.1
FILTROS = {
    "momentum 126d": lambda v: S.momentum(v, 126),
    "momentum 252d": lambda v: S.momentum(v, 252),
    "pendiente SMA100": lambda v: S.pendiente_sma(v, 100),
    "Donchian 100 (estado)": lambda v: S.donchian_estado(v, 100),
    "tendencia 200 (cierre y pendiente)": lambda v: S.tendencia(v, 200),
}
acum, filas = {}, []
for instr in INSTR:
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    for nf, fn in FILTROS.items():
        s = fn(v)
        for k in (3.0, 4.0, 5.0):
            for var, lados in (("ambos lados, todo el universo", (1, -1)), ("solo compras, activos con deriva", (1,))):
                if var.startswith("solo") and instr not in DERIVA:
                    continue
                ops = estrategia.operaciones(instr, m1, v, s, k, rr=RR, modo="estado", lados=lados)
                if ops is None:
                    continue
                m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
                acum.setdefault((nf, k, var), []).append(ops["r"][m])
                st = resumen(ops["r"][m])
                filas.append(dict(instr=instr, filtro=nf, k_atr=k, variante=var, n=st.get("n", 0), wr=st.get("wr", np.nan), expectancy=st.get("expectancy", np.nan)))
    print(instr, "listo", flush=True)
cart = []
for (nf, k, var), lst in acum.items():
    st = resumen(np.concatenate(lst))
    cart.append(dict(variante=var, filtro=nf, k_atr=k, n=st["n"], wr=round(st["wr"] * 100, 1), wr_lo=round(st["wr_lo"] * 100, 1), payoff=round(st["payoff"], 2), pf=round(st["pf"], 2), expectancy=round(st["expectancy"], 3), max_dd=round(st["max_dd"], 1)))
dc = pd.DataFrame(cart).sort_values(["variante", "wr"], ascending=[True, False])
os.makedirs("resultados/E008", exist_ok=True)
dc.to_csv("resultados/E008/cartera.csv", index=False)
pd.DataFrame(filas).to_csv("resultados/E008/por_instrumento.csv", index=False)
print(dc.to_string(index=False))
