"""
E015 — Fase 2, hipótesis de precio (bitácora, entrada 13). Solo selección (< 2022). Universo: 8 activos con deriva
(SPX500, NAS100, Nikkei, FTSE, CAC, ASX, oro, plata). Solo compras, una operación a la vez por activo, TP = 2,1·SL.
1. Máximo de 252 (y 126) días: el cierre es el máximo de ese período.
2. Momentum de corte transversal: a fin de cada mes se eligen los N activos con mayor retorno de 6 o 12 meses
   (y retorno > 0); durante el mes siguiente solo se compran esos.
3. Estacionalidad: compras solo de noviembre a abril (con y sin la tendencia 200).
Se compara siempre con "comprar siempre" (mismo universo, mismo SL/TP).
"""
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

UNIV = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "XAUUSD", "XAGUSD"]
KS = [3.0, 4.0, 5.0, 6.0]
RR = 2.1
cache = {}
for i in UNIV:
    m1 = datos.cargar(i)
    v = datos.velas(m1, 1440)
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    # la vela D1 que abre a las 17:00 NY pertenece al día siguiente
    dia = (ny + pd.Timedelta(hours=7)).tz_localize(None)
    cache[i] = dict(m1=m1, v=v, mes=dia.month.values, periodo=dia.to_period("M"), t200=S.tendencia(v, 200))

# --- momentum de corte transversal: decisión a fin de mes con datos hasta el último cierre del mes
def elegibles(lookback, top):
    tabla = {}
    for i, d in cache.items():
        c = pd.Series(d["v"]["c"], index=d["periodo"])
        fin_mes = c.groupby(level=0).last()
        mom = fin_mes / c.shift(lookback).groupby(level=0).last() - 1
        tabla[i] = mom
    df = pd.DataFrame(tabla)
    rank = df.rank(axis=1, ascending=False)
    ok = (rank <= top) & (df > 0)
    return ok.shift(1).fillna(False)  # la elección del mes m rige durante el mes m+1


def senal_por_activo(nombre, i):
    d = cache[i]
    v = d["v"]
    if nombre == "comprar siempre":
        return np.ones(len(v["c"]), int)
    if nombre == "tendencia 200":
        return np.where(d["t200"] == 1, 1, 0)
    if nombre.startswith("máximo"):
        L = int(nombre.split()[1])
        mx = pd.Series(v["c"]).rolling(L, min_periods=L).max().values
        return np.where(v["c"] >= mx, 1, 0)
    if nombre.startswith("momentum transversal"):
        _, _, lb, top = nombre.split()
        ok = ELEG[(int(lb), int(top))][i]
        e = ok.reindex(d["periodo"]).fillna(False).values.astype(bool)
        return np.where(e, 1, 0)
    if nombre == "estacional nov–abr":
        return np.where(np.isin(d["mes"], [11, 12, 1, 2, 3, 4]), 1, 0)
    if nombre == "estacional nov–abr + tendencia 200":
        return np.where(np.isin(d["mes"], [11, 12, 1, 2, 3, 4]) & (d["t200"] == 1), 1, 0)
    raise ValueError(nombre)


ELEG = {(lb, top): elegibles(lb, top) for lb in (126, 252) for top in (2, 3)}
SENALES = ["comprar siempre", "tendencia 200", "máximo 252", "máximo 126", "momentum transversal 252 2", "momentum transversal 252 3",
           "momentum transversal 126 2", "momentum transversal 126 3", "estacional nov–abr", "estacional nov–abr + tendencia 200"]
filas = []
for nombre in SENALES:
    for k in KS:
        rs = []
        for i in UNIV:
            d = cache[i]
            ops = estrategia.operaciones(i, d["m1"], d["v"], senal_por_activo(nombre, i), k, rr=RR, lados=(1,))
            if ops is None:
                continue
            m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
            rs.append(ops["r"][m])
        s = resumen(np.concatenate(rs))
        filas.append(dict(senal=nombre, k_atr=k, n=s["n"], wr=s["wr"], wr_lo=s["wr_lo"], payoff=s["payoff"], pf=s["pf"], expectancy=s["expectancy"], max_dd=s["max_dd"]))
    print(nombre, "listo", flush=True)
df = pd.DataFrame(filas)
base = df[df.senal == "comprar siempre"].set_index("k_atr")
df["wr_vs_siempre"] = df.apply(lambda f: f.wr - base.loc[f.k_atr, "wr"], axis=1)
df["exp_vs_siempre"] = df.apply(lambda f: f.expectancy - base.loc[f.k_atr, "expectancy"], axis=1)
df["vecinos_ok"] = False
for idx, f in df.iterrows():
    vec = df[(df.senal == f.senal) & (np.abs(df.k_atr - f.k_atr) == 1.0)]
    df.loc[idx, "vecinos_ok"] = len(vec) > 0 and bool((vec.wr >= 0.47).all())
df["elegible"] = (df.n >= 100) & (df.wr >= 0.5) & (df.payoff >= 2) & df.vecinos_ok & (df.wr_vs_siempre >= 0.03) & (df.exp_vs_siempre > 0) & (df.senal != "comprar siempre")
os.makedirs("resultados/E015", exist_ok=True)
df.to_csv("resultados/E015/seleccion.csv", index=False)
out = df.copy()
for c in ("wr", "wr_lo", "wr_vs_siempre"):
    out[c] = (out[c] * 100).round(1)
print(out.round(3).to_string(index=False))
el = df[df.elegible].sort_values("wr", ascending=False)
print("\nELEGIBLES:", "ninguna" if el.empty else el[["senal", "k_atr", "n", "wr", "expectancy"]].to_dict("records"))
