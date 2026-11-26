"""
E011 — Familias candidatas A y B en todo el universo (solo selección < 2022) y aplicación automática de la regla de
elección de la bitácora (entrada 8). No imprime ni calcula nada de la validación.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

INDICES = ["SPXUSD", "NSXUSD", "GRXEUR", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD"]
METALES = ["XAUUSD", "XAGUSD"]
disp = lambda lst: [i for i in lst if os.path.exists(os.path.join(datos.RAIZ, i + ".npz"))]
RR = 2.1
FAM_A = {"mínimo 10d": lambda v, t: S.retroceso_minimo(v, 10, t), "mínimo 5d": lambda v, t: S.retroceso_minimo(v, 5, t), "RSI2 < 25": lambda v, t: S.retroceso_rsi(v, 2, 25, 75, t)}
FAM_B = {"tendencia 200": lambda v, t: t, "momentum 252d": lambda v, t: S.momentum(v, 252)}
KS_A = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
KS_B = [4.0, 4.5, 5.0, 5.5, 6.0]
cache, filas_i, filas_c = {}, [], []


def velas(instr):
    if instr not in cache:
        m1 = datos.cargar(instr)
        v = datos.velas(m1, 1440)
        cache[instr] = (m1, v, S.tendencia(v, 200))
    return cache[instr]


for fam, eventos, univ, ks in (("A", FAM_A, disp(INDICES), KS_A), ("B", FAM_B, disp(INDICES) + disp(METALES), KS_B)):
    for ne, fe in eventos.items():
        for k in ks:
            rs = []
            for instr in univ:
                m1, v, t = velas(instr)
                ev = fe(v, t)
                ops = estrategia.operaciones(instr, m1, v, np.where(ev == 1, 1, 0), k, rr=RR, lados=(1,))
                if ops is None:
                    continue
                m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
                rs.append(ops["r"][m])
                s = resumen(ops["r"][m])
                filas_i.append(dict(familia=fam, evento=ne, k_atr=k, instr=instr, n=s.get("n", 0), wr=s.get("wr", np.nan)))
            s = resumen(np.concatenate(rs))
            filas_c.append(dict(familia=fam, evento=ne, k_atr=k, n=s["n"], wr=s["wr"], wr_lo=s["wr_lo"], payoff=s["payoff"], pf=s["pf"], expectancy=s["expectancy"], max_dd=s["max_dd"]))
        print(fam, ne, "listo", flush=True)
dc = pd.DataFrame(filas_c)
di = pd.DataFrame(filas_i)
# regla de elección
dc["vecinos_ok"] = False
for i, f in dc.iterrows():
    vec = dc[(dc.familia == f.familia) & (dc.evento == f.evento) & (np.abs(dc.k_atr - f.k_atr) == 0.5)]
    dc.loc[i, "vecinos_ok"] = len(vec) > 0 and bool((vec.wr >= 0.47).all())
dc["elegible"] = (dc.n >= 100) & (dc.wr >= 0.5) & (dc.payoff >= 2.0) & dc.vecinos_ok
elegidas = {}
for fam in ("A", "B"):
    x = dc[(dc.familia == fam) & dc.elegible].sort_values("wr", ascending=False)
    elegidas[fam] = None if x.empty else x.iloc[0][["evento", "k_atr", "n", "wr", "wr_lo", "pf", "expectancy"]].to_dict()
os.makedirs("resultados/E011", exist_ok=True)
dc.to_csv("resultados/E011/cartera_seleccion.csv", index=False)
di.to_csv("resultados/E011/por_instrumento_seleccion.csv", index=False)
json.dump(dict(universo_A=disp(INDICES), universo_B=disp(INDICES) + disp(METALES), elegidas=elegidas), open("resultados/E011/elegidas.json", "w"), indent=1, default=float)
print(dc.assign(wr=(dc.wr * 100).round(1), wr_lo=(dc.wr_lo * 100).round(1)).round(2).to_string(index=False))
print("\nWR por índice (familia A, mínimo 10d):")
print(di[(di.familia == "A") & (di.evento == "mínimo 10d")].pivot_table(index="k_atr", columns="instr", values="wr").mul(100).round(1).to_string())
print("\nELEGIDAS:", json.dumps(elegidas, default=float, ensure_ascii=False))
