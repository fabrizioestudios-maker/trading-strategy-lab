"""
E017 — Retroceso en los líderes: comprar el retroceso (cierre en el mínimo de 10 días o RSI2 < 25) solo en los N
activos con mejor momentum de 252 días (retorno > 0) entre los 9 con deriva, elegidos a fin de mes.
Solo selección (< 2022). SL = k·ATR(14) diario, TP = 2,1·SL. Regla de elección de la bitácora (entradas 8 y 13).
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

UNIV = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "HKXHKD", "XAUUSD", "XAGUSD"]
RR = 2.1
KS = [3.0, 4.0, 5.0, 6.0]
cache = {}
for i in UNIV:
    m1 = datos.cargar(i)
    v = datos.velas(m1, 1440)
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    cache[i] = dict(m1=m1, v=v, periodo=(ny + pd.Timedelta(hours=7)).tz_localize(None).to_period("M"))
tab = {}
for i, d in cache.items():
    c = pd.Series(d["v"]["c"], index=d["periodo"])
    tab[i] = c.groupby(level=0).last() / c.shift(252).groupby(level=0).last() - 1
mom = pd.DataFrame(tab)


def lideres(top):
    return ((mom.rank(axis=1, ascending=False) <= top) & (mom > 0)).shift(1).fillna(False)


def senal(nombre, i, top):
    d = cache[i]
    v = d["v"]
    lid = lideres(top)[i].reindex(d["periodo"]).fillna(False).values.astype(bool)
    mn10 = v["c"] <= pd.Series(v["c"]).rolling(10).min().values
    rsi = S.rsi(v["c"], 2) < 25
    if nombre == "comprar siempre":
        return np.ones(len(v["c"]), int)
    if nombre == "líder (cualquier vela)":
        return np.where(lid, 1, 0)
    if nombre == "líder + mínimo 10d":
        return np.where(lid & mn10, 1, 0)
    if nombre == "líder + RSI2<25":
        return np.where(lid & rsi, 1, 0)
    raise ValueError(nombre)


filas = []
for top in (3, 4):
    for nombre in ("comprar siempre", "líder (cualquier vela)", "líder + mínimo 10d", "líder + RSI2<25"):
        if nombre == "comprar siempre" and top == 4:
            continue
        for k in KS:
            rs = []
            for i, d in cache.items():
                ops = estrategia.operaciones(i, d["m1"], d["v"], senal(nombre, i, top), k, rr=RR, lados=(1,))
                if ops is None:
                    continue
                m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
                rs.append(ops["r"][m])
            s = resumen(np.concatenate(rs))
            filas.append(dict(senal=nombre, top=top if nombre != "comprar siempre" else "-", k_atr=k, n=s["n"], wr=s["wr"], wr_lo=s["wr_lo"], payoff=s["payoff"], pf=s["pf"], expectancy=s["expectancy"], max_dd=s["max_dd"]))
        print(top, nombre, "listo", flush=True)
df = pd.DataFrame(filas)
base = df[df.senal == "comprar siempre"].set_index("k_atr")
df["wr_vs_siempre"] = df.apply(lambda f: f.wr - base.loc[f.k_atr, "wr"], axis=1)
df["exp_vs_siempre"] = df.apply(lambda f: f.expectancy - base.loc[f.k_atr, "expectancy"], axis=1)
df["vecinos_ok"] = False
for idx, f in df.iterrows():
    vec = df[(df.senal == f.senal) & (df.top == f.top) & (np.abs(df.k_atr - f.k_atr) == 1.0)]
    df.loc[idx, "vecinos_ok"] = len(vec) > 0 and bool((vec.wr >= 0.47).all())
df["elegible"] = (df.n >= 100) & (df.wr >= 0.5) & (df.payoff >= 2) & df.vecinos_ok & (df.wr_vs_siempre >= 0.03) & (df.exp_vs_siempre > 0) & (df.senal != "comprar siempre")
os.makedirs("resultados/E017", exist_ok=True)
df.to_csv("resultados/E017/seleccion.csv", index=False)
o = df.copy()
for c in ("wr", "wr_lo", "wr_vs_siempre"):
    o[c] = (o[c] * 100).round(1)
print(o.round(3).to_string(index=False))
el = df[df.elegible].sort_values("wr", ascending=False)
print("\nELEGIBLES:", "ninguna" if el.empty else el[["senal", "top", "k_atr", "n", "wr", "expectancy"]].to_dict("records"))
