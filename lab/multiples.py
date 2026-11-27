"""
Corrección por pruebas múltiples y prueba SPA (fase 4, E031).

- bonferroni, holm: controlan la probabilidad de al menos un falso positivo (FWER). Holm es uniformemente más potente.
- bh (Benjamini–Hochberg): controla la tasa de falsos descubrimientos (FDR) con pruebas independientes o con
  dependencia positiva. by (Benjamini–Yekutieli): FDR con cualquier dependencia (más conservadora).
- spa (Hansen, 2005, "A Test for Superior Predictive Ability"): ¿la mejor de K estrategias supera al benchmark,
  teniendo en cuenta que se eligió entre K? Usa el bootstrap estacionario de Politis y Romano (1994), que conserva la
  dependencia temporal, y el recentrado "consistente" de Hansen. X es la diferencia de rendimiento contra el benchmark
  (T días × K estrategias); con benchmark "no operar", X es el resultado diario de cada estrategia.
Supuestos y límites: las p de entrada deben ser válidas una por una; con miles de estrategias muy correlacionadas,
Bonferroni y Holm son demasiado conservadoras, y por eso se informa también la SPA, que usa la correlación real.
"""
import numpy as np
from scipy import sparse, stats


def p_media_positiva(mu, sd, n):
    """p de una cola para H0: media ≤ 0 (t de Student)."""
    mu, sd, n = np.asarray(mu, float), np.asarray(sd, float), np.asarray(n, float)
    with np.errstate(divide="ignore", invalid="ignore"):
        t = mu / (sd / np.sqrt(n))
    p = stats.t.sf(t, np.maximum(n - 1, 1))
    return np.where(np.isfinite(t) & (n >= 2), p, np.nan)


def _limpio(p):
    p = np.asarray(p, float)
    ok = np.isfinite(p)
    return p, ok


def bonferroni(p, alfa=0.05):
    p, ok = _limpio(p)
    m = ok.sum()
    return ok & (p <= alfa / max(m, 1))


def holm(p, alfa=0.05):
    p, ok = _limpio(p)
    idx = np.flatnonzero(ok)
    m = len(idx)
    out = np.zeros(len(p), bool)
    orden = idx[np.argsort(p[idx], kind="stable")]
    for j, i in enumerate(orden):
        if p[i] <= alfa / (m - j):
            out[i] = True
        else:
            break
    return out


def bh(p, q=0.05, dependencia_arbitraria=False):
    p, ok = _limpio(p)
    idx = np.flatnonzero(ok)
    m = len(idx)
    out = np.zeros(len(p), bool)
    if m == 0:
        return out
    c = np.sum(1.0 / np.arange(1, m + 1)) if dependencia_arbitraria else 1.0
    orden = idx[np.argsort(p[idx], kind="stable")]
    umbral = q * np.arange(1, m + 1) / (m * c)
    pasa = p[orden] <= umbral
    if pasa.any():
        kmax = np.flatnonzero(pasa).max()
        out[orden[:kmax + 1]] = True
    return out


def by(p, q=0.05):
    return bh(p, q, dependencia_arbitraria=True)


def indices_estacionario(T, B, L, rng):
    """B remuestreos del bootstrap estacionario (bloques de largo geométrico con media L). Matriz B × T de índices."""
    p = 1.0 / L
    idx = np.empty((B, T), np.int64)
    inicio = rng.integers(0, T, size=B)
    idx[:, 0] = inicio
    nuevo = rng.random((B, T)) < p
    saltos = rng.integers(0, T, size=(B, T))
    for t in range(1, T):
        idx[:, t] = np.where(nuevo[:, t], saltos[:, t], (idx[:, t - 1] + 1) % T)
    return idx


def spa(X, B=2000, L=20.0, semilla=0, lote=200):
    """
    X: matriz T × K (densa o dispersa de scipy) con el rendimiento de cada estrategia menos el benchmark, por período.
    Devuelve dict con el estadístico, p consistente (Hansen), p "inferior" y "superior", y la mejor estrategia.
    """
    rng = np.random.default_rng(semilla)
    Xs = sparse.csc_matrix(X) if not sparse.issparse(X) else X.tocsc()
    T, K = Xs.shape
    media = np.asarray(Xs.mean(axis=0)).ravel()
    sum_b = np.zeros(K)
    sum_b2 = np.zeros(K)
    medias_b = np.empty((B, K), np.float32)
    Xt = Xs.T.tocsr()
    for a in range(0, B, lote):
        nb = min(lote, B - a)
        idx = indices_estacionario(T, nb, L, rng)
        W = np.zeros((T, nb), np.float32)
        for j in range(nb):
            W[:, j] = np.bincount(idx[j], minlength=T)
        mb = (Xt @ W).T / T  # nb × K
        medias_b[a:a + nb] = mb
        sum_b += mb.sum(axis=0)
        sum_b2 += (mb.astype(float) ** 2).sum(axis=0)
    var_b = sum_b2 / B - (sum_b / B) ** 2
    omega = np.sqrt(np.maximum(var_b, 1e-18) * T)  # desvío de √T · media
    t_obs = np.sqrt(T) * media / omega
    estad = max(0.0, float(np.max(t_obs)))
    umbral = -np.sqrt(2 * np.log(np.log(T)))
    # Hansen (2005): Z*_k = media*_k − g(media_k); T*_b = max(0, max_k √T Z*_k / ω_k)
    g = {"p_consistente": np.where(t_obs >= umbral, media, 0.0),  # las muy malas no se recentran
         "p_inferior": np.maximum(media, 0.0),
         "p_superior": media}  # = Reality Check de White (la más conservadora)
    out = {}
    for nombre, gk in g.items():
        tb = np.sqrt(T) * (medias_b - gk[None, :]) / omega[None, :]
        out[nombre] = float(np.mean(np.maximum(0.0, tb.max(axis=1)) >= estad))
    k = int(np.argmax(t_obs))
    out.update(estadistico=estad, mejor=k, t_mejor=float(t_obs[k]), media_mejor=float(media[k]), T=T, K=K, B=B, L=L)
    return out
