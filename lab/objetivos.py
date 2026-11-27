"""
Funciones objetivo y filtros de estabilidad para elegir parámetros (fase 4, E028).

- GT-Score (Sheppert, "The GT-Score: A Robust Objective Function for Reducing Overfitting in Data-Driven Trading
  Strategies", arXiv 2602.00080, 2026; ecuaciones 1–2 y algoritmo 1):
      GT = μ · ln(z) · r² / σ_d ,   z = (μ − μ_m) / (σ / √N)
  μ y σ: media y desvío por operación; μ_m: media del benchmark por observación (aquí 0 en R, es decir, no operar);
  r²: R² de la regresión lineal de la curva acumulada contra el número de operación; σ_d: desvío a la baja.
  Pérdida por partes (se minimiza): z ≤ 0 → 100 + 100·(1 − e^{−|z−1|}); 0 < z ≤ 1 → 100·(1 − e^{−|z−1|});
  z > 1 → −GT con ε = 1e-6 en el denominador. Con menos de n_min operaciones: penalidad grande (1000).
  El paper usa n_min = 50; el laboratorio lo informa cuando usa otro valor.
- Meseta y veto de acantilado (AlgoXpert Alpha Research Framework, arXiv 2603.09219, 2026; sección 3.3):
      Ω_estable = {θ : SR(θ) ≥ α · SR_opt}   (α = 0,9 por defecto; requiere SR_opt > 0)
      Cliff_SR(θ) = max_{θ' ∈ N(θ)} [SR(θ) − SR(θ')]₊ ;  θ se descarta si Cliff_SR(θ) > τ
  N(θ): los vecinos a un paso de grilla en cada dimensión, con las demás fijas. El paper deja τ al usuario;
  aquí τ es relativo: τ = tau_rel · SR(θ).
"""
import numpy as np
import pandas as pd

PENALIDAD_N = 1000.0
EPS = 1e-6


def r2_curva(r):
    """R² de la curva acumulada contra el índice de operación (consistencia)."""
    r = np.asarray(r, float)
    n = len(r)
    if n < 3:
        return np.nan
    y = np.cumsum(r)
    x = np.arange(1, n + 1, dtype=float)
    xm, ym = x.mean(), y.mean()
    sxx = ((x - xm) ** 2).sum()
    sxy = ((x - xm) * (y - ym)).sum()
    syy = ((y - ym) ** 2).sum()
    if syy == 0:
        return 0.0
    return float(sxy * sxy / (sxx * syy))


def gt_componentes(r, mu_m=0.0):
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    n = len(r)
    if n < 3:
        return dict(n=n, mu=np.nan, z=np.nan, r2=np.nan, sd_baja=np.nan)
    mu, sd = r.mean(), r.std(ddof=1)
    z = (mu - mu_m) / (sd / np.sqrt(n)) if sd > 0 else np.nan
    sd_baja = float(np.sqrt(np.mean(np.minimum(r, 0.0) ** 2)))
    return dict(n=n, mu=mu, z=z, r2=r2_curva(r), sd_baja=sd_baja)


def gt_perdida(r, mu_m=0.0, n_min=50):
    """Pérdida del GT-Score (menor = mejor), tal como el algoritmo 1 del paper."""
    c = gt_componentes(r, mu_m)
    if c["n"] < n_min or np.isnan(c["z"]):
        return PENALIDAD_N
    z = c["z"]
    if z <= 0:
        return 100.0 + 100.0 * (1.0 - np.exp(-abs(z - 1.0)))
    if z <= 1:
        return 100.0 * (1.0 - np.exp(-abs(z - 1.0)))
    return -(c["mu"] * np.log(z) * c["r2"]) / (c["sd_baja"] + EPS)


def gt_score(r, mu_m=0.0, n_min=50):
    """GT-Score (mayor = mejor) = −pérdida."""
    return -gt_perdida(r, mu_m, n_min)


def vecinos(grilla, columnas):
    """
    grilla: DataFrame con una fila por configuración y las columnas de parámetros (valores ordenables).
    Devuelve una lista: para cada fila, los índices de sus vecinos a un paso en una sola dimensión.
    """
    niveles = {c: sorted(grilla[c].dropna().unique(), key=lambda x: (str(type(x)), x)) for c in columnas}
    pos = {c: {v: i for i, v in enumerate(niveles[c])} for c in columnas}
    clave = {tuple(fila): i for i, fila in enumerate(grilla[columnas].itertuples(index=False, name=None))}
    out = []
    for fila in grilla[columnas].itertuples(index=False, name=None):
        vs = []
        for j, c in enumerate(columnas):
            p = pos[c][fila[j]]
            for q in (p - 1, p + 1):
                if 0 <= q < len(niveles[c]):
                    otra = list(fila)
                    otra[j] = niveles[c][q]
                    k = clave.get(tuple(otra))
                    if k is not None:
                        vs.append(k)
        out.append(vs)
    return out


def meseta(sr, alpha=0.9):
    """Máscara de Ω_estable. Vacía si el mejor Sharpe no es positivo (veredicto 'Refactor' del paper)."""
    sr = np.asarray(sr, float)
    if not np.isfinite(sr).any():
        return np.zeros(len(sr), bool)
    opt = np.nanmax(sr)
    if not opt > 0:
        return np.zeros(len(sr), bool)
    return np.nan_to_num(sr, nan=-np.inf) >= alpha * opt


def acantilado(sr, vecinos_idx, tau_rel=0.5):
    """Máscara de configuraciones descartadas por el veto de acantilado (Cliff_SR > tau_rel · SR(θ))."""
    sr = np.asarray(sr, float)
    veto = np.zeros(len(sr), bool)
    for i, vs in enumerate(vecinos_idx):
        if not vs or not np.isfinite(sr[i]):
            veto[i] = not vs  # sin vecinos medidos no se puede comprobar: se descarta
            continue
        caida = np.nanmax(np.maximum(sr[i] - np.nan_to_num(sr[vs], nan=-np.inf), 0.0))
        veto[i] = caida > tau_rel * abs(sr[i])
    return veto


def espesor(sr, vecinos_idx):
    """Sharpe promedio de θ y sus vecinos (para elegir dentro de la meseta)."""
    sr = np.asarray(sr, float)
    out = np.full(len(sr), np.nan)
    for i, vs in enumerate(vecinos_idx):
        vals = np.concatenate([[sr[i]], sr[vs]]) if vs else np.array([sr[i]])
        out[i] = np.nanmean(vals)
    return out


def elegir_meseta(sr, vecinos_idx, alpha=0.9, tau_rel=0.5):
    """Índice elegido por la regla R3 (meseta → veto de acantilado → mayor espesor), o -1 si no queda ninguna."""
    ok = meseta(sr, alpha) & ~acantilado(sr, vecinos_idx, tau_rel)
    if not ok.any():
        return -1
    e = espesor(sr, vecinos_idx)
    e[~ok] = -np.inf
    return int(np.argmax(e))
