"""
Ficha completa de una lista de operaciones (prompt maestro, sección 4.1). No reemplaza a lab/metricas.py: lo amplía.

Entrada: DataFrame con columnas t (entrada, ms UTC), t_salida, dir (+1/-1), r (resultado en R, con costos) y,
opcionales, costo_r (costo de la operación en R) e instr.

Unidades: todo en R por operación salvo que se diga otra cosa. Sharpe y Sortino son por operación (no anualizados);
Calmar = R por año / drawdown máximo en R; Ulcer = raíz de la media de los drawdowns al cuadrado (en R);
ES 5 % = media del 5 % peor de las operaciones.
"""
import numpy as np
import pandas as pd
from scipy import stats

from lab.metricas import wilson

SESIONES = [  # minutos de Nueva York [desde, hasta)
    ("cierre_y_asia_temprana", 17 * 60, 19 * 60),
    ("asia", 19 * 60, 24 * 60 + 2 * 60),
    ("londres", 2 * 60, 8 * 60),
    ("nueva_york", 8 * 60, 12 * 60),
    ("tarde_ny", 12 * 60, 17 * 60),
]


def sesion_ny(t_ms):
    ny = pd.to_datetime(np.asarray(t_ms, np.int64), unit="ms", utc=True).tz_convert("America/New_York")
    m = np.asarray(ny.hour * 60 + ny.minute)
    out = np.empty(len(m), object)
    for nombre, a, b in SESIONES:
        if b > 24 * 60:
            sel = (m >= a) | (m < b - 24 * 60)
        else:
            sel = (m >= a) & (m < b)
        out[sel] = nombre
    return out


def rachas(r):
    """Racha ganadora y perdedora más larga."""
    g = p = mg = mp = 0
    for x in r:
        if x > 0:
            g += 1
            p = 0
        else:
            p += 1
            g = 0
        mg, mp = max(mg, g), max(mp, p)
    return mg, mp


def curva_dd(r):
    curva = np.concatenate([[0.0], np.cumsum(r)])
    pico = np.maximum.accumulate(curva)
    dd = pico - curva
    return curva, dd


def basico(r):
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    n = len(r)
    if n == 0:
        return dict(n=0)
    gan, per = r[r > 0], r[r <= 0]
    lo, hi = wilson(len(gan), n)
    curva, dd = curva_dd(r)
    sd = r.std(ddof=1) if n > 1 else np.nan
    abajo = np.sqrt(np.mean(np.minimum(r, 0.0) ** 2))
    k = max(1, int(np.ceil(0.05 * n)))
    return dict(
        n=n, wr=len(gan) / n, wr_lo=lo, wr_hi=hi,
        ganancia_media=gan.mean() if len(gan) else 0.0, perdida_media=-per.mean() if len(per) else 0.0,
        payoff=(gan.mean() / -per.mean()) if len(gan) and len(per) and per.mean() < 0 else np.nan,
        pf=(gan.sum() / -per.sum()) if per.sum() < 0 else np.inf,
        expectancy=r.mean(), r_total=r.sum(), max_dd=float(dd.max()),
        sharpe_op=r.mean() / sd if sd and sd > 0 else np.nan,
        sortino_op=r.mean() / abajo if abajo > 0 else np.nan,
        ulcer=float(np.sqrt(np.mean(dd ** 2))),
        recuperacion=r.sum() / dd.max() if dd.max() > 0 else np.inf,
        asimetria=float(stats.skew(r)) if n > 2 else np.nan,
        curtosis=float(stats.kurtosis(r, fisher=False)) if n > 3 else np.nan,
        es5=float(np.sort(r)[:k].mean()),
        racha_ganadora=rachas(r)[0], racha_perdedora=rachas(r)[1],
    )


def ficha(ops, desde=None, hasta=None):
    """Diccionario con la ficha completa y tablas por año, dirección y sesión."""
    ops = ops.sort_values("t").reset_index(drop=True)
    r = ops.r.values.astype(float)
    out = basico(r)
    if out["n"] == 0:
        return out
    dur_h = (ops.t_salida.values - ops.t.values) / 3.6e6
    out["duracion_media_h"] = float(np.mean(dur_h))
    out["duracion_mediana_h"] = float(np.median(dur_h))
    a = desde if desde is not None else ops.t.min()
    b = hasta if hasta is not None else ops.t_salida.max()
    anios = max((b - a) / (365.25 * 86400000), 1e-9)
    out["anios"] = anios
    out["ops_por_anio"] = out["n"] / anios
    out["calmar"] = (out["r_total"] / anios) / out["max_dd"] if out["max_dd"] > 0 else np.inf
    # exposición: fracción del tiempo con una posición abierta (una a la vez)
    out["exposicion"] = float(np.clip(np.sum(ops.t_salida.values - ops.t.values) / (b - a), 0, 1)) if b > a else np.nan
    if "costo_r" in ops:
        out["costo_total_r"] = float(ops.costo_r.sum())
        out["exp_sin_costos"] = float((ops.r + ops.costo_r).mean())
    anio = pd.to_datetime(ops.t, unit="ms", utc=True).dt.year
    out["por_anio"] = pd.DataFrame({y: basico(ops.r[anio == y].values) for y in sorted(anio.unique())}).T[
        ["n", "wr", "expectancy", "r_total", "max_dd"]]
    out["anios_positivos"] = float((out["por_anio"].r_total > 0).mean())
    out["por_direccion"] = pd.DataFrame({("compras" if d == 1 else "ventas"): basico(ops.r[ops.dir == d].values)
                                         for d in (1, -1) if (ops.dir == d).any()}).T[["n", "wr", "expectancy", "r_total"]]
    ses = sesion_ny(ops.t.values)
    out["por_sesion"] = pd.DataFrame({s: basico(ops.r[ses == s].values) for s in pd.unique(ses)}).T[
        ["n", "wr", "expectancy", "r_total"]]
    if "instr" in ops:
        out["por_instrumento"] = pd.DataFrame({i: basico(ops.r[ops.instr == i].values) for i in ops.instr.unique()}).T[
            ["n", "wr", "expectancy", "r_total"]]
    return out


def tabla_plana(f):
    """Solo los escalares de la ficha (para CSV)."""
    return {k: v for k, v in f.items() if not isinstance(v, pd.DataFrame)}
