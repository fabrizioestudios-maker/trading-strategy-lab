"""
E021 — Sensibilidad de la única finalista que no se cae en 2011–2021 (E020 #2): ruptura de Bollinger a favor de la SMA 200.

Regla: primera vela diaria que cierra fuera de la banda de Bollinger (n, m); compra si cierra arriba de la banda superior y
el cierre está sobre la SMA 200; vende si cierra abajo de la inferior y está bajo la SMA 200. Entrada en la apertura
siguiente, SL = k·ATR(14) diario, TP = 2·SL, una operación a la vez.

Esto NO elige parámetros: mide qué tan estable es el resultado alrededor de los elegidos por la regla (20, 2, k = 0,5),
en los 5 años (15/11/2021 en adelante) y en 2011–2021, y si la idea funciona en otros instrumentos.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, motor, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402


def ms(f):
    return pd.Timestamp(f, tz="UTC").value // 10**6


PER = {"5 años": (ms("2021-11-15"), None), "2011–2021": (ms("2011-11-15"), ms("2021-11-15"))}
INSTR = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "HKXHKD"]


def senal(v, n=20, m=2.0, filtro="sma200"):
    c = v["c"]
    base = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    sup, inf = base + m * sd, base - m * sd
    pc = np.concatenate([[np.nan], c[:-1]])
    psup, pinf = np.concatenate([[np.nan], sup[:-1]]), np.concatenate([[np.nan], inf[:-1]])
    arriba = (c > sup) & ~(pc > psup)
    abajo = (c < inf) & ~(pc < pinf)
    s = np.where(arriba, 1, np.where(abajo, -1, 0))
    if filtro == "sma200":
        s = np.where(s == S.sobre_sma(v, 200), s, 0)
    return s


def correr(instr, m1, v, atr, s, k, desde, hasta, direccion="ambos", rr=2.0):
    if direccion == "largos":
        s = np.where(s == 1, s, 0)
    elif direccion == "cortos":
        s = np.where(s == -1, s, 0)
    nb = len(v["t"])
    ok = (s != 0) & ~np.isnan(atr) & (v["t"] >= desde) & (np.arange(nb) < nb - 1)
    if hasta is not None:
        ok &= v["t"] < hasta
    sel = np.flatnonzero(ok)
    ie = v["i1"][sel] + 1
    d = s[sel].astype(np.int64)
    ent = m1["o"][ie]
    rg = k * atr[sel]
    ops = motor.simular(m1, ie, d, ent - d * rg, ent + d * rr * rg, datos.costo(instr, ent))
    m = ops["motivo"] != 3
    return ops["r"][m], ops["dir"][m]


def fila(r):
    s = resumen(r)
    if not s.get("n"):
        return dict(n=0, wr=np.nan, exp=np.nan, pf=np.nan, dd=np.nan)
    return dict(n=s["n"], wr=round(100 * s["wr"], 1), exp=round(s["expectancy"], 3), pf=round(s["pf"], 2), dd=round(s["max_dd"], 1))


if __name__ == "__main__":
    os.makedirs("resultados/E021", exist_ok=True)
    cache = {}
    for i in INSTR:
        m1 = datos.cargar(i)
        v = datos.velas(m1, 1440)
        cache[i] = (m1, v, datos.atr(v, 14))
    # 1) oro: parámetros vecinos
    m1, v, atr = cache["XAUUSD"]
    filas = []
    for (n, mm) in [(20, 2.0), (20, 1.5), (20, 2.5), (15, 2.0), (30, 2.0)]:
        for filtro in ("sma200", "ninguno"):
            s = senal(v, n, mm, filtro)
            for direccion in ("ambos", "largos", "cortos"):
                for k in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0):
                    f = dict(bandas=f"{n}/{mm}", filtro=filtro, dir=direccion, k=k)
                    for p, (a, b) in PER.items():
                        r, _ = correr("XAUUSD", m1, v, atr, s, k, a, b, direccion)
                        f.update({f"{x}_{p}": y for x, y in fila(r).items()})
                    filas.append(f)
    oro = pd.DataFrame(filas)
    oro.to_csv("resultados/E021/oro_vecinos.csv", index=False)
    print("== Oro D1: bandas, filtro, dirección y k (5 años | 2011–2021) ==")
    print(oro.to_string(index=False))
    # 2) la misma regla (20, 2, SMA 200, ambas direcciones) en los otros instrumentos
    filas = []
    for i in INSTR:
        m1, v, atr = cache[i]
        s = senal(v, 20, 2.0, "sma200")
        for k in (0.5, 1.0, 1.5):
            f = dict(instr=i, k=k)
            for p, (a, b) in PER.items():
                r, _ = correr(i, m1, v, atr, s, k, a, b)
                f.update({f"{x}_{p}": y for x, y in fila(r).items()})
            filas.append(f)
    otros = pd.DataFrame(filas)
    otros.to_csv("resultados/E021/otros_instrumentos.csv", index=False)
    print("\n== Bollinger (20, 2) + SMA 200, ambas direcciones, D1, en cada instrumento ==")
    print(otros.to_string(index=False))
