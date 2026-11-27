"""
Monte Carlo de trayectorias y riesgo de ruina (fase 4, E032).

bootstrap_bloques: remuestrea la secuencia de R por bloques contiguos (circulares) de largo `bloque`, para conservar
la dependencia corta entre operaciones (rachas). Con bloque = 1 es el bootstrap simple (supone independencia).
riesgo: curvas con riesgo fijo por operación sobre el capital del momento (interés compuesto):
    E_{k+1} = E_k · (1 + f · R_k)
y de ahí el drawdown máximo, la probabilidad de superar un drawdown, la ruina (capital < 50 %), las rachas y el
tiempo de recuperación (operaciones hasta volver al máximo anterior).
"""
import numpy as np
import pandas as pd


def bootstrap_bloques(r, n_ops, n_sim=10000, bloque=5, semilla=0):
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    n = len(r)
    rng = np.random.default_rng(semilla)
    nb = int(np.ceil(n_ops / bloque))
    inicios = rng.integers(0, n, size=(n_sim, nb))
    idx = (inicios[:, :, None] + np.arange(bloque)[None, None, :]) % n
    return r[idx.reshape(n_sim, -1)[:, :n_ops]]


def _racha_max_perdedora(M):
    pierde = M <= 0
    out = np.zeros(M.shape[0], np.int64)
    cur = np.zeros(M.shape[0], np.int64)
    for j in range(M.shape[1]):
        cur = np.where(pierde[:, j], cur + 1, 0)
        out = np.maximum(out, cur)
    return out


def riesgo(M, f, umbrales_dd=(0.10, 0.20, 0.30), ruina=0.5):
    """M: matriz simulaciones × operaciones (R). f: fracción arriesgada por operación (0,01 = 1 %)."""
    eq = np.cumprod(1.0 + f * M, axis=1)
    eq = np.concatenate([np.ones((M.shape[0], 1)), eq], axis=1)
    pico = np.maximum.accumulate(eq, axis=1)
    dd = 1.0 - eq / pico
    dd_max = dd.max(axis=1)
    out = dict(riesgo_pct=100 * f, dd_mediana=float(np.median(dd_max)), dd_p95=float(np.quantile(dd_max, 0.95)),
               final_mediana=float(np.median(eq[:, -1]) - 1), final_p5=float(np.quantile(eq[:, -1], 0.05) - 1),
               ruina=float((eq.min(axis=1) < ruina).mean()))
    for u in umbrales_dd:
        out[f"p_dd_{int(100 * u)}"] = float((dd_max > u).mean())
    rp = _racha_max_perdedora(M)
    out["racha_perdedora_mediana"] = float(np.median(rp))
    out["racha_perdedora_p95"] = float(np.quantile(rp, 0.95))
    # tiempo de recuperación más largo (en operaciones) dentro de cada simulación
    bajo = dd > 1e-12
    largo = np.zeros(M.shape[0], np.int64)
    cur = np.zeros(M.shape[0], np.int64)
    for j in range(bajo.shape[1]):
        cur = np.where(bajo[:, j], cur + 1, 0)
        largo = np.maximum(largo, cur)
    out["recuperacion_p50_ops"] = float(np.median(largo))
    out["recuperacion_p95_ops"] = float(np.quantile(largo, 0.95))
    return out


def tabla_riesgo(r, ops_por_anio, anios=5, riesgos=(0.0025, 0.005, 0.01), n_sim=10000, bloque=5, semilla=0):
    n_ops = max(1, int(round(ops_por_anio * anios)))
    M = bootstrap_bloques(r, n_ops, n_sim, bloque, semilla)
    filas = [dict(anios=anios, n_ops=n_ops, **riesgo(M, f)) for f in riesgos]
    return pd.DataFrame(filas)


def riesgo_sugerido(tabla, p_max=0.05):
    """Mayor riesgo con P(DD > 20 %) < p_max (regla descriptiva de la entrada 27); NaN si ninguno."""
    ok = tabla[tabla.p_dd_20 < p_max]
    return float(ok.riesgo_pct.max()) if len(ok) else np.nan
