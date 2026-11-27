"""
Walk-forward con purga para muchas configuraciones a la vez (fase 4, E028).

Las operaciones de todas las configuraciones se guardan en formato CSR (`Operaciones`): ordenadas por configuración
y por entrada, con `off[k]:off[k+1]` las de la configuración k. Las estadísticas de una ventana se calculan con numba
para todas las configuraciones juntas.

Pliegues (años de laboratorio que empiezan el 15/11):
  entrenamiento [a, b) → purga de `purga_dias` días → prueba [b + purga, c).
  En el entrenamiento solo cuentan operaciones que entran en [a, b) y salen antes de b (sin cruzar a la prueba).
  En la prueba, las que entran en [b + purga, c).

Reglas de elección (solo con el entrenamiento; `docs`: BITACORA entrada 27):
  R1: máximo de media − 1 error estándar, con n ≥ n_min.
  R2: GT-Score (lab/objetivos.py), con n_min.
  R3: meseta (α) → veto de acantilado (τ relativo) → mayor espesor (AlgoXpert), con n ≥ n_min.
Razón de generalización (GR) = expectancy media de prueba / expectancy media de entrenamiento de las elegidas.
"""
import numpy as np
import pandas as pd
from numba import njit

from lab import objetivos

DIA = 86400000


def ms(f):
    return pd.Timestamp(f, tz="UTC").value // 10**6


def anio_lab(y):
    return ms(f"{y}-11-15")


class Operaciones:
    def __init__(self, cfg, t, t_salida, r):
        cfg = np.asarray(cfg, np.int64)
        orden = np.lexsort((np.asarray(t, np.int64), cfg))
        self.cfg = cfg[orden]
        self.t = np.asarray(t, np.int64)[orden]
        self.ts = np.asarray(t_salida, np.int64)[orden]
        self.r = np.asarray(r, float)[orden]
        k = int(self.cfg.max()) + 1 if len(cfg) else 0
        self.K = k
        self.off = np.searchsorted(self.cfg, np.arange(k + 1)).astype(np.int64)

    def de(self, k):
        a, b = self.off[k], self.off[k + 1]
        return pd.DataFrame(dict(t=self.t[a:b], t_salida=self.ts[a:b], r=self.r[a:b]))

    def ventana(self, k, a, b, salida_max=None):
        x = self.de(k)
        m = (x.t >= a) & (x.t < b)
        if salida_max is not None:
            m &= x.t_salida < salida_max
        return x[m]


@njit(cache=True)
def _stats(off, t, ts, r, a, b, smax):
    K = len(off) - 1
    n_ = np.zeros(K, np.int64)
    mu = np.full(K, np.nan)
    sd = np.full(K, np.nan)
    sdb = np.full(K, np.nan)
    r2 = np.full(K, np.nan)
    for k in range(K):
        n = 0
        s = 0.0
        s2 = 0.0
        sb = 0.0
        cum = 0.0
        sx = 0.0
        sy = 0.0
        sxy = 0.0
        sxx = 0.0
        syy = 0.0
        for j in range(off[k], off[k + 1]):
            if t[j] < a:
                continue
            if t[j] >= b:
                break
            if ts[j] >= smax:
                continue
            x = r[j]
            n += 1
            s += x
            s2 += x * x
            if x < 0:
                sb += x * x
            cum += x
            X = float(n)
            sx += X
            sy += cum
            sxy += X * cum
            sxx += X * X
            syy += cum * cum
        n_[k] = n
        if n > 0:
            mu[k] = s / n
            sdb[k] = np.sqrt(sb / n)
        if n > 1:
            v = (s2 - s * s / n) / (n - 1)
            sd[k] = np.sqrt(v) if v > 0 else 0.0
        if n > 2:
            num = n * sxy - sx * sy
            d1 = n * sxx - sx * sx
            d2 = n * syy - sy * sy
            r2[k] = (num * num) / (d1 * d2) if d1 > 0 and d2 > 0 else 0.0
    return n_, mu, sd, sdb, r2


def estadisticas(ops, a, b, salida_max=None):
    smax = np.int64(salida_max if salida_max is not None else 1 << 62)
    n, mu, sd, sdb, r2 = _stats(ops.off, ops.t, ops.ts, ops.r, np.int64(a), np.int64(b), smax)
    with np.errstate(divide="ignore", invalid="ignore"):
        ee = sd / np.sqrt(n)
        sr = mu / sd
    return pd.DataFrame(dict(n=n, mu=mu, sd=sd, sd_baja=sdb, r2=r2, ee=ee, sr=sr))


def puntaje(st, regla, n_min=15, mu_m=0.0):
    """Puntaje (mayor = mejor) de cada configuración según la regla; -inf si no es elegible."""
    n = st.n.values
    if regla == "R1":
        p = (st.mu - st.ee).values.copy()
    elif regla == "R2":
        z = ((st.mu - mu_m) / st.ee).values
        mu, r2, sdb = st.mu.values, st.r2.values, st.sd_baja.values
        with np.errstate(divide="ignore", invalid="ignore"):
            perd = np.where(z <= 0, 100.0 + 100.0 * (1.0 - np.exp(-np.abs(z - 1.0))),
                            np.where(z <= 1, 100.0 * (1.0 - np.exp(-np.abs(z - 1.0))),
                                     -(mu * np.log(np.where(z > 0, z, 1.0)) * r2) / (sdb + objetivos.EPS)))
        p = -perd
    elif regla == "R3":
        p = st.sr.values.copy()
    else:
        raise ValueError(regla)
    p = np.where((n >= n_min) & np.isfinite(p), p, -np.inf)
    return p


def elegir(st, regla, top=1, n_min=15, vecinos_idx=None, alpha=0.9, tau_rel=0.5):
    """Índices elegidos (hasta `top`) con la regla. R3 necesita `vecinos_idx`."""
    p = puntaje(st, regla, n_min)
    if regla != "R3":
        orden = np.argsort(-p, kind="stable")
        return [int(i) for i in orden[:top] if np.isfinite(p[i])]
    sr = np.where(np.isfinite(p), p, np.nan)
    ok = objetivos.meseta(sr, alpha) & ~objetivos.acantilado(sr, vecinos_idx, tau_rel)
    e = objetivos.espesor(sr, vecinos_idx)
    e = np.where(ok, e, -np.inf)
    orden = np.argsort(-e, kind="stable")
    return [int(i) for i in orden[:top] if np.isfinite(e[i])]


def pliegues(esquema, primero=2010, ultimo=2026, purga_dias=5, fin=None):
    """Lista de dicts con train_a, train_b, test_a, test_b (ms). `ultimo`: año de laboratorio donde terminan los datos."""
    fin = fin if fin is not None else ms(f"{ultimo}-11-14")
    tr, te = {"3/1": (3, 1), "5/1": (5, 1), "5/2": (5, 2), "exp/1": (None, 1)}[esquema]
    out = []
    y = primero + (tr if tr else 3)
    while anio_lab(y) < fin:
        a = anio_lab(primero) if tr is None else anio_lab(y - tr)
        b = anio_lab(y)
        c = min(anio_lab(y + te), fin)
        if c - b >= 300 * DIA:
            out.append(dict(train_a=a, train_b=b, test_a=b + purga_dias * DIA, test_b=c))
        y += te
    return out


def correr(ops, folds, regla, top=1, n_min=15, vecinos_idx=None, alpha=0.9, tau_rel=0.5):
    """Corre el walk-forward. Devuelve (tabla por pliegue y elegida, DataFrame con las operaciones de prueba)."""
    filas, pruebas = [], []
    for i, f in enumerate(folds):
        st_tr = estadisticas(ops, f["train_a"], f["train_b"], salida_max=f["train_b"])
        st_te = estadisticas(ops, f["test_a"], f["test_b"])
        elegidas = elegir(st_tr, regla, top, n_min, vecinos_idx, alpha, tau_rel)
        for rango, k in enumerate(elegidas):
            filas.append(dict(pliegue=i, prueba_desde=pd.Timestamp(f["test_a"], unit="ms").date(), cfg=k, rango=rango,
                              n_tr=int(st_tr.n[k]), exp_tr=st_tr.mu[k], n_te=int(st_te.n[k]), exp_te=st_te.mu[k]))
            x = ops.ventana(k, f["test_a"], f["test_b"])
            x = x.assign(pliegue=i, cfg=k, rango=rango)
            pruebas.append(x)
        if not elegidas:
            filas.append(dict(pliegue=i, prueba_desde=pd.Timestamp(f["test_a"], unit="ms").date(), cfg=-1, rango=0,
                              n_tr=0, exp_tr=np.nan, n_te=0, exp_te=np.nan))
    tabla = pd.DataFrame(filas)
    ops_te = pd.concat(pruebas, ignore_index=True) if pruebas else pd.DataFrame(columns=["t", "t_salida", "r"])
    return tabla, ops_te


def resumen_wf(tabla, ops_te, semilla=0):
    from lab.validacion import bootstrap_ic
    top1 = tabla[tabla.rango == 0]
    r = ops_te.r.values if len(ops_te) else np.array([])
    lo, hi = bootstrap_ic(r, semilla=semilla) if len(r) > 2 else (np.nan, np.nan)
    validos = top1[top1.n_te > 0]
    gr = validos.exp_te.mean() / validos.exp_tr.mean() if len(validos) and validos.exp_tr.mean() > 0 else np.nan
    return dict(pliegues=len(top1), n=len(r), wr=float((r > 0).mean()) if len(r) else np.nan,
                exp=float(r.mean()) if len(r) else np.nan, ic_lo=lo, ic_hi=hi, gr=gr,
                pliegues_positivos=float((validos.exp_te > 0).mean()) if len(validos) else np.nan,
                exp_tr_media=validos.exp_tr.mean() if len(validos) else np.nan)
