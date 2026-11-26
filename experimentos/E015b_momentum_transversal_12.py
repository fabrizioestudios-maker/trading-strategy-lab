"""
E015b — Momentum de corte transversal en los 12 instrumentos limpios (8 con deriva + 4 de forex). Solo selección.
A fin de mes se eligen los N con mayor retorno de 126 o 252 días (y retorno > 0). Durante el mes siguiente se compran
solo esos (una operación a la vez por activo, SL k·ATR, TP 2,1·SL). Variante con ventas: además se venden los N peores
con retorno < 0. Comparación: comprar siempre en el mismo universo.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia  # noqa: E402
from lab.metricas import resumen  # noqa: E402

UNIV = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD"]
RR = 2.1
cache = {}
for i in UNIV:
    m1 = datos.cargar(i)
    v = datos.velas(m1, 1440)
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    cache[i] = dict(m1=m1, v=v, periodo=(ny + pd.Timedelta(hours=7)).tz_localize(None).to_period("M"))


def tabla_mom(lb):
    t = {}
    for i, d in cache.items():
        c = pd.Series(d["v"]["c"], index=d["periodo"])
        t[i] = c.groupby(level=0).last() / c.shift(lb).groupby(level=0).last() - 1
    return pd.DataFrame(t)


def senales(lb, top, ventas):
    df = tabla_mom(lb)
    arriba = ((df.rank(axis=1, ascending=False) <= top) & (df > 0)).shift(1).fillna(False)
    abajo = ((df.rank(axis=1, ascending=True) <= top) & (df < 0)).shift(1).fillna(False)
    out = {}
    for i, d in cache.items():
        a = arriba[i].reindex(d["periodo"]).fillna(False).values.astype(bool)
        b = abajo[i].reindex(d["periodo"]).fillna(False).values.astype(bool) if ventas else np.zeros(len(a), bool)
        out[i] = np.where(a, 1, np.where(b, -1, 0))
    return out


def cartera(sen, k, lados):
    rs = []
    for i, d in cache.items():
        ops = estrategia.operaciones(i, d["m1"], d["v"], sen[i], k, rr=RR, lados=lados)
        if ops is None:
            continue
        m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
        rs.append(ops["r"][m])
    return resumen(np.concatenate(rs))


filas = []
siempre = {i: np.ones(len(d["v"]["c"]), int) for i, d in cache.items()}
for k in (4.0, 5.0, 6.0):
    s = cartera(siempre, k, (1,))
    filas.append(dict(variante="comprar siempre (12 activos)", lookback="-", top="-", k_atr=k, **{c: s[c] for c in ("n", "wr", "wr_lo", "payoff", "pf", "expectancy", "max_dd")}))
for lb in (126, 252):
    for top in (2, 3, 4):
        for ventas in (False, True):
            sen = senales(lb, top, ventas)
            for k in (4.0, 5.0, 6.0):
                s = cartera(sen, k, (1, -1) if ventas else (1,))
                filas.append(dict(variante="mejores comprados + peores vendidos" if ventas else "mejores comprados", lookback=lb, top=top, k_atr=k,
                                  **{c: s[c] for c in ("n", "wr", "wr_lo", "payoff", "pf", "expectancy", "max_dd")}))
        print(lb, top, "listo", flush=True)
df = pd.DataFrame(filas)
base = df[df.variante.str.startswith("comprar")].set_index("k_atr")
df["wr_vs_siempre"] = df.apply(lambda f: f.wr - base.loc[f.k_atr, "wr"], axis=1)
df["exp_vs_siempre"] = df.apply(lambda f: f.expectancy - base.loc[f.k_atr, "expectancy"], axis=1)
df["vecinos_ok"] = False
for idx, f in df.iterrows():
    vec = df[(df.variante == f.variante) & (df.lookback == f.lookback) & (df.top == f.top) & (np.abs(df.k_atr - f.k_atr) == 1.0)]
    df.loc[idx, "vecinos_ok"] = len(vec) > 0 and bool((vec.wr >= 0.47).all())
df["elegible"] = (df.n >= 100) & (df.wr >= 0.5) & (df.payoff >= 2) & df.vecinos_ok & (df.wr_vs_siempre >= 0.03) & (df.exp_vs_siempre > 0) & ~df.variante.str.startswith("comprar")
os.makedirs("resultados/E015", exist_ok=True)
df.to_csv("resultados/E015/momentum_transversal_12.csv", index=False)
o = df.copy()
for c in ("wr", "wr_lo", "wr_vs_siempre"):
    o[c] = (o[c] * 100).round(1)
print(o.round(3).to_string(index=False))
el = df[df.elegible].sort_values("wr", ascending=False)
print("\nELEGIBLES:", "ninguna" if el.empty else el[["variante", "lookback", "top", "k_atr", "n", "wr", "expectancy"]].to_dict("records"))
