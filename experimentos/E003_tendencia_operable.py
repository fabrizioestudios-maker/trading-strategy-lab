"""
E003 — Tendencia operable: una operación a la vez por instrumento, reglas idénticas en compra y venta (y variante solo
compras), SL = k·ATR(14) diario, TP = 2·SL. Se reporta SOLO la muestra de selección; la validación queda guardada en el
CSV pero no se mira hasta elegir candidatas (E005).
Uso: python experimentos/E003_tendencia_operable.py INSTR1,INSTR2,...
"""
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402

INSTR = sys.argv[1].split(",")
FILTROS = {
    "Donchian 100 (estado)": lambda v: S.donchian_estado(v, 100),
    "pendiente SMA100": lambda v: S.pendiente_sma(v, 100),
    "cierre vs SMA200": lambda v: S.sobre_sma(v, 200),
    "momentum 126d": lambda v: S.momentum(v, 126),
    "momentum 63d + 252d": lambda v: S.combinar(S.momentum(v, 63), S.momentum(v, 252)),
}
filas, ops_guardadas = [], {}
for instr in INSTR:
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    for nf, fn in FILTROS.items():
        s = fn(v)
        for k in (2.0, 3.0, 4.0):
            for modo in ("estado", "cambio"):
                for lados, nl in (((1, -1), "ambos"), ((1,), "solo compras")):
                    ops = estrategia.operaciones(instr, m1, v, s, k, modo=modo, lados=lados)
                    rs = estrategia.resumen_muestras(ops)
                    fila = dict(instr=instr, filtro=nf, k_atr=k, modo=modo, lados=nl)
                    for mu in ("sel", "val"):
                        for c in ("n", "wr", "payoff", "pf", "expectancy", "max_dd", "horas_media"):
                            fila[f"{mu}_{c}"] = rs[mu].get(c, np.nan)
                    filas.append(fila)
    print(instr, "listo", flush=True)
df = pd.DataFrame(filas)
os.makedirs("resultados/E003", exist_ok=True)
df.to_csv(f"resultados/E003/tendencia_{'_'.join(INSTR)}.csv", index=False)
x = df[["instr", "filtro", "k_atr", "modo", "lados", "sel_n", "sel_wr", "sel_payoff", "sel_pf", "sel_expectancy", "sel_max_dd", "sel_horas_media"]].copy()
x["sel_wr"] = (x.sel_wr * 100).round(1)
for c in ("sel_payoff", "sel_pf", "sel_expectancy", "sel_max_dd"):
    x[c] = x[c].round(2)
x["sel_dias"] = (x.sel_horas_media / 24).round(0)
print(x.drop(columns="sel_horas_media").sort_values(["instr", "sel_wr"], ascending=[True, False]).groupby("instr").head(12).to_string(index=False))
