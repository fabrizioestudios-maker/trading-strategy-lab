"""
Herramientas de validación estadística (fase 4).

- psr: Probabilistic Sharpe Ratio (Bailey y López de Prado, 2012). Probabilidad de que el Sharpe verdadero supere a
  sr_ref, dado el Sharpe observado sobre n observaciones con su asimetría y curtosis. Supone observaciones independientes
  e idénticamente distribuidas (en este laboratorio, operaciones en R).
- sr_max_esperado: Sharpe máximo esperado entre n_pruebas estrategias SIN ventaja cuyos Sharpe tienen varianza var_sr
  (aproximación de valores extremos de Bailey y López de Prado, 2014).
- dsr: Deflated Sharpe Ratio = psr con sr_ref = sr_max_esperado. Penaliza haber elegido la mejor de muchas pruebas.
  El resultado depende del N efectivo (las pruebas están muy correlacionadas): por eso se informa para varios N.
- pbo_cscv: Probability of Backtest Overfitting con Combinatorially Symmetric Cross-Validation (Bailey, Borwein,
  López de Prado y Zhu, 2015). Matriz bloques × configuraciones; en cada partición, la mejor configuración en la mitad
  de "elección" se ubica en el ranking de la otra mitad; PBO = proporción de particiones en las que queda en la mitad
  inferior (logit ≤ 0). Con pocos bloques (4 → 6 particiones) la estimación es gruesa: se informa así.
- bootstrap_ic: intervalo de confianza percentil por remuestreo de operaciones (supone independencia entre operaciones).
"""
import math
from itertools import combinations

import numpy as np
from scipy import stats

EULER = 0.5772156649015329


def sharpe(r):
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    if len(r) < 2 or r.std(ddof=1) == 0:
        return float("nan")
    return float(r.mean() / r.std(ddof=1))


def psr(r, sr_ref=0.0):
    """Probabilidad de que el Sharpe (por observación) verdadero sea mayor que sr_ref."""
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    n = len(r)
    if n < 3:
        return float("nan")
    sr = sharpe(r)
    g3 = float(stats.skew(r, bias=False))
    g4 = float(stats.kurtosis(r, fisher=False, bias=False))
    den = 1 - g3 * sr + (g4 - 1) / 4 * sr * sr
    if den <= 0:
        return float("nan")
    return float(stats.norm.cdf((sr - sr_ref) * math.sqrt(n - 1) / math.sqrt(den)))


def sr_max_esperado(n_pruebas, var_sr):
    """Sharpe máximo esperado entre n_pruebas Sharpe nulos con varianza var_sr."""
    if n_pruebas <= 1:
        return 0.0
    z1 = stats.norm.ppf(1 - 1 / n_pruebas)
    z2 = stats.norm.ppf(1 - 1 / (n_pruebas * math.e))
    return float(math.sqrt(var_sr) * ((1 - EULER) * z1 + EULER * z2))


def dsr(r, n_pruebas, var_sr):
    return psr(r, sr_max_esperado(n_pruebas, var_sr))


def sd_desde_resumen(wr, exp, payoff):
    """Desvío de R por operación reconstruido de win rate, expectancy y payoff (dos resultados: +W y −L)."""
    p = np.asarray(wr, float)
    e = np.asarray(exp, float)
    k = np.asarray(payoff, float)
    with np.errstate(divide="ignore", invalid="ignore"):
        L = e / (p * k - (1 - p))
        W = k * L
        v = p * W * W + (1 - p) * L * L - e * e
    return np.sqrt(np.where(v > 0, v, np.nan))


def pbo_cscv(M, minimo_validos=None):
    """
    M: matriz (bloques S, configuraciones N) con la métrica de rendimiento (mayor = mejor); NaN = sin dato.
    Devuelve dict con pbo, cantidad de particiones, logits y la pérdida esperada (rendimiento fuera de muestra de la
    elegida, relativo a la mediana). Solo se usan configuraciones con datos en todos los bloques.
    """
    M = np.asarray(M, float)
    ok = ~np.isnan(M).any(axis=0)
    M = M[:, ok]
    S, N = M.shape
    if N < 2 or S < 2 or S % 2:
        return dict(pbo=float("nan"), particiones=0, configuraciones=int(N))
    logits, oos_elegida, oos_mediana = [], [], []
    for J in combinations(range(S), S // 2):
        Jc = [s for s in range(S) if s not in J]
        dentro = M[list(J)].mean(axis=0)
        fuera = M[Jc].mean(axis=0)
        n_est = int(np.argmax(dentro))
        rango = stats.rankdata(fuera)[n_est]  # 1 = peor, N = mejor
        w = rango / (N + 1)
        logits.append(math.log(w / (1 - w)))
        oos_elegida.append(fuera[n_est])
        oos_mediana.append(float(np.median(fuera)))
    logits = np.array(logits)
    return dict(pbo=float((logits <= 0).mean()), particiones=len(logits), configuraciones=int(N), logits=logits,
                oos_elegida=float(np.mean(oos_elegida)), oos_mediana=float(np.mean(oos_mediana)))


def bootstrap_ic(r, estadistico=np.mean, n=10000, nivel=0.95, semilla=0):
    r = np.asarray(r, float)
    r = r[~np.isnan(r)]
    rng = np.random.default_rng(semilla)
    idx = rng.integers(0, len(r), size=(n, len(r)))
    v = np.array([estadistico(r[i]) for i in idx]) if estadistico is not np.mean else r[idx].mean(axis=1)
    a = (1 - nivel) / 2
    return float(np.quantile(v, a)), float(np.quantile(v, 1 - a))
