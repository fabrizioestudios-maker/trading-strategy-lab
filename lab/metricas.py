"""Métricas de una lista de operaciones (en R)."""
import math

import numpy as np
import pandas as pd


def wilson(k, n, z=1.96):
    """Intervalo de confianza de Wilson (95 %) para una proporción k/n."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    den = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / den
    medio = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (centro - medio, centro + medio)


def resumen(r, t=None, t_salida=None):
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    n = len(r)
    if n == 0:
        return dict(n=0)
    gan, per = r[r > 0], r[r <= 0]
    wr = len(gan) / n
    pg, pp = gan.mean() if len(gan) else 0.0, -per.mean() if len(per) else 0.0
    curva = np.cumsum(r)
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], curva])) - np.concatenate([[0], curva])))
    lo, hi = wilson(len(gan), n)
    out = dict(
        n=n, wr=wr, wr_lo=lo, wr_hi=hi, ganancia_media=pg, perdida_media=pp, payoff=(pg / pp) if pp > 0 else float("inf"),
        pf=(gan.sum() / -per.sum()) if per.sum() < 0 else float("inf"), expectancy=r.mean(), r_total=r.sum(), max_dd=dd,
    )
    if t is not None and t_salida is not None:
        out["horas_media"] = float(np.mean((np.asarray(t_salida) - np.asarray(t)) / 3.6e6))
    return out


def por_anio(ops):
    if len(ops["r"]) == 0:
        return pd.DataFrame()
    a = pd.to_datetime(ops["t"], unit="ms", utc=True).year
    filas = []
    for y in sorted(set(a)):
        m = a == y
        s = resumen(ops["r"][m])
        s["anio"] = y
        filas.append(s)
    return pd.DataFrame(filas).set_index("anio")


def cumple(s_sel, s_val, min_total=100, min_val=30):
    """Criterios de la misión (docs/criterios.md) sobre los resúmenes de selección y validación."""
    if s_sel.get("n", 0) + s_val.get("n", 0) < min_total or s_val.get("n", 0) < min_val:
        return "no concluyente"
    ok = all(s.get("wr", 0) >= 0.5 and s.get("payoff", 0) >= 2.0 and s.get("expectancy", 0) > 0 for s in (s_sel, s_val))
    return "CUMPLE" if ok else "no cumple"
