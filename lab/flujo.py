"""
Señales de posicionamiento y flujo con datos gratuitos (fase 4, E033).

- senales_cot: a partir de lab/externos.cot(), para cada martes:
    F1 = z de 156 semanas de la posición neta/OI de los fondos (managed money / leveraged funds);
    F2 = z de 156 semanas de los comerciales (productores + swap dealers en commodities; dealers en financieros);
    F3 = cambio semanal de la posición neta/OI de los fondos.
  El z usa solo el pasado y la semana actual (ventana móvil, mínimo 52 semanas).
- retorno_futuro: retorno logarítmico desde el primer cierre diario (17:00 NY) en o después de `disponible_ms`
  hasta h semanas (5·h cierres) más tarde. Así la señal se usa recién cuando era pública.
- ic_panel: IC de Spearman promedio entre mercados y su valor p por bootstrap de bloques de semanas
  (los mismos bloques para todos los mercados, para conservar la correlación entre ellos); p centrado:
  P(IC* − IC ≥ IC) para el signo esperado.
"""
import numpy as np
import pandas as pd
from scipy import stats


def z_movil(x, ventana=156, min_periodos=52):
    s = pd.Series(x, dtype=float)
    m = s.rolling(ventana, min_periods=min_periodos).mean()
    d = s.rolling(ventana, min_periods=min_periodos).std()
    return ((s - m) / d).values


def senales_cot(df, tipo):
    out = pd.DataFrame({"fecha": df.fecha, "disponible_ms": df.disponible_ms})
    out["F1"] = z_movil(df.fondos_neto_oi.values)
    if tipo == "desagregado":
        com = (df.productores_neto + df.swap_neto) / df.oi
    else:
        com = df.dealers_neto_oi
    out["F2"] = z_movil(com.values)
    out["F3"] = df.fondos_neto_oi.diff().values
    return out


def retorno_futuro(d1, t_disp, semanas):
    """d1: DataFrame con t (inicio de vela, ms) y c. Devuelve el retorno log a `semanas` semanas desde la disponibilidad."""
    t = d1.t.values.astype(np.int64)
    cierre_t = np.append(t[1:], t[-1] + 86400000)
    i0 = np.searchsorted(cierre_t, np.asarray(t_disp, np.int64), side="left")
    i1 = i0 + 5 * semanas
    c = d1.c.values.astype(float)
    ok = i1 < len(c)
    out = np.full(len(i0), np.nan)
    out[ok] = np.log(c[i1[ok]] / c[i0[ok]])
    return out


def ic(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 20:
        return np.nan
    return float(stats.spearmanr(x[m], y[m]).correlation)


def ic_panel(paneles, signo=1, B=2000, bloque=8, semilla=0):
    """
    paneles: dict mercado → DataFrame indexado por fecha con columnas x (señal) e y (retorno futuro).
    Devuelve dict con el IC promedio, los IC por mercado y el p (una cola, con el signo esperado).
    """
    fechas = sorted(set().union(*[set(p.index) for p in paneles.values()]))
    idx = pd.Index(fechas)
    X = {m: p.reindex(idx) for m, p in paneles.items()}
    ics = {m: ic(p.x.values, p.y.values) for m, p in X.items()}
    validos = [m for m, v in ics.items() if np.isfinite(v)]
    obs = float(np.mean([ics[m] for m in validos])) if validos else np.nan
    rng = np.random.default_rng(semilla)
    n = len(idx)
    nb = int(np.ceil(n / bloque))
    boot = np.empty(B)
    for b in range(B):
        ini = rng.integers(0, n - bloque + 1, size=nb)
        sel = (ini[:, None] + np.arange(bloque)[None, :]).ravel()[:n]
        vals = [ic(X[m].x.values[sel], X[m].y.values[sel]) for m in validos]
        boot[b] = np.nanmean(vals)
    centrado = boot - obs
    p = float(np.mean(signo * centrado >= signo * obs)) if np.isfinite(obs) else np.nan
    return dict(ic=obs, p=p, ic_por_mercado=ics, n_fechas=n, ic_lo=float(np.nanquantile(boot, 0.025)),
                ic_hi=float(np.nanquantile(boot, 0.975)))
