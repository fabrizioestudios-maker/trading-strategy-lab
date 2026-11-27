"""
Benchmarks pasivos y alfa incremental (fase 4, E029 y E036).

- diario_mtm: convierte una lista de operaciones en un resultado diario en R marcado a mercado con los cierres
  diarios (17:00 NY). La suma de los días de una operación es su R (incluido el costo, que se cobra el día de salida).
- vol_objetivo: comprar y mantener con volatilidad objetivo (EWMA λ = 0,94, peso con un día de rezago, tope).
- risk_parity: cartera solo compras con pesos inversos a la volatilidad, escalada a un objetivo, rebalanceo mensual.
- tendencia_simple: comprado si el cierre está sobre la SMA 200 (señal de ayer), con volatilidad objetivo.
- tasacion: regresión r_estrategia = α + β·r_benchmark + ε. IR de tasación = α / σ_ε · √252; t de α con errores de
  Newey-West. No depende del tamaño de posición: es la mejora del Sharpe de la cartera al sumar la estrategia
  (Sharpe² combinado = Sharpe²_benchmark + IR²). También el IR activo del prompt 1: media(r_s − r_b)/σ(r_s − r_b).
Costos de rotación: fracción del nocional por unidad de cambio de peso (la mitad del costo ida y vuelta de costos.md).
"""
import numpy as np
import pandas as pd
from numba import njit
from scipy import stats

from lab import datos


def cierres_diarios(instr, desde_ms=None, m1=None):
    """Velas diarias (17:00 NY) del M1 del laboratorio, con índice de fechas (día de operación)."""
    m1 = m1 if m1 is not None else datos.cargar(instr)
    v = datos.velas(m1, 1440)
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    fecha = (ny + pd.Timedelta(hours=7)).tz_localize(None).normalize()
    df = pd.DataFrame(dict(t=v["t"], o=v["o"], h=v["h"], l=v["l"], c=v["c"]), index=pd.DatetimeIndex(fecha, name="fecha"))
    df = df[~df.index.duplicated(keep="last")]
    if desde_ms is not None:
        df = df[df.t >= desde_ms]
    return df


@njit(cache=True)
def _mtm(t_bar, c_bar, t_in, t_out, d, ent, sal, riesgo, costo, out):
    nb = len(t_bar)
    for k in range(len(t_in)):
        i0 = np.searchsorted(t_bar, t_in[k], side="right") - 1
        i1 = np.searchsorted(t_bar, t_out[k], side="right") - 1
        if i0 < 0:
            i0 = 0
        if i1 < i0:
            i1 = i0
        ref = ent[k]
        for i in range(i0, min(i1, nb - 1) + 1):
            px = sal[k] if i == i1 else c_bar[i]
            out[i] += d[k] * (px - ref) / riesgo[k]
            ref = px
        if i1 < nb:
            out[i1] -= costo[k] / riesgo[k]


def diario_mtm(ops, d1):
    """
    ops: DataFrame con t, t_salida, dir, entrada, salida, sl y r. d1: velas diarias (columnas t, c).
    El costo se reconstruye de r: costo/riesgo = movimiento bruto/riesgo − r.
    """
    t_bar = d1.t.values.astype(np.int64)
    out = np.zeros(len(t_bar))
    if len(ops):
        riesgo = np.abs(ops.entrada.values - ops.sl.values)
        bruto = ops.dir.values * (ops.salida.values - ops.entrada.values) / riesgo
        costo = (bruto - ops.r.values) * riesgo
        _mtm(t_bar, d1.c.values.astype(float), ops.t.values.astype(np.int64), ops.t_salida.values.astype(np.int64),
             ops.dir.values.astype(np.int64), ops.entrada.values.astype(float), ops.salida.values.astype(float),
             riesgo.astype(float), costo.astype(float), out)
    return pd.Series(out, index=d1.index, name="r_dia")


def posiciones_abiertas(ops, d1):
    """Cantidad de operaciones abiertas al cierre de cada día."""
    t_bar = d1.t.values.astype(np.int64)
    i0 = np.searchsorted(t_bar, ops.t.values, side="right") - 1
    i1 = np.searchsorted(t_bar, ops.t_salida.values, side="right") - 1
    cuenta = np.zeros(len(t_bar) + 1)
    np.add.at(cuenta, np.clip(i0, 0, None), 1)
    np.add.at(cuenta, np.clip(i1, 0, None) + 1, -1)
    return pd.Series(np.cumsum(cuenta)[:-1], index=d1.index)


def retornos(d1):
    return d1.c.pct_change().fillna(0.0)


def vol_ewma(r, lam=0.94, anual=252):
    v = r.pow(2).ewm(alpha=1 - lam, adjust=False).mean()
    return np.sqrt(v * anual)


def vol_objetivo(r, objetivo=0.10, lam=0.94, tope=3.0, costo_rotacion=0.0, calentamiento=60):
    """Retorno diario de comprar y mantener con volatilidad objetivo (peso de ayer)."""
    vol = vol_ewma(r, lam)
    w = (objetivo / vol).clip(upper=tope).shift(1)
    w.iloc[:calentamiento] = np.nan
    w = w.fillna(0.0)
    return w * r - costo_rotacion * w.diff().abs().fillna(w.abs()), w


def risk_parity(rets, objetivo=0.10, lam=0.94, tope=3.0, costos=None, ventana_cov=60, calentamiento=60):
    """
    rets: DataFrame de retornos diarios (columnas = activos), alineados por fecha (NaN = sin dato ese día → 0).
    Pesos inversos a la volatilidad, escalados para que la volatilidad de la cartera (con la covarianza de 60 días)
    sea el objetivo; se rebalancea el primer día hábil de cada mes con datos hasta el día anterior.
    """
    R = rets.fillna(0.0)
    vol = np.sqrt(R.pow(2).ewm(alpha=1 - lam, adjust=False).mean() * 252)
    meses = R.index.to_period("M")
    primer = ~pd.Series(meses, index=R.index).duplicated().values
    W = pd.DataFrame(np.nan, index=R.index, columns=R.columns)
    for i in np.flatnonzero(primer):
        if i < calentamiento:
            continue
        v = vol.iloc[i - 1]
        activos = v[(v > 0) & rets.iloc[max(0, i - ventana_cov):i].notna().all()].index
        if len(activos) == 0:
            continue
        w = 1.0 / v[activos]
        w = w / w.sum()
        cov = R[activos].iloc[i - ventana_cov:i].cov().values * 252
        vp = float(np.sqrt(w.values @ cov @ w.values))
        esc = min(tope, objetivo / vp) if vp > 0 else 0.0
        W.loc[R.index[i], :] = 0.0
        W.loc[R.index[i], activos] = (w * esc).values
    W = W.ffill().fillna(0.0)
    Wl = W.shift(1).fillna(0.0)
    bruto = (Wl * R).sum(axis=1)
    c = pd.Series(costos).reindex(R.columns).fillna(0.0) if costos is not None else 0.0
    rot = (W.diff().abs().fillna(W.abs()) * c).sum(axis=1).shift(1).fillna(0.0) if costos is not None else 0.0
    return bruto - rot, W


def tendencia_simple(r, c, n=200, objetivo=0.10, lam=0.94, tope=3.0, costo_rotacion=0.0):
    """Comprado (con volatilidad objetivo) cuando el cierre de ayer está sobre su SMA de n días."""
    sma = c.rolling(n).mean()
    sobre = (c > sma).astype(float).shift(1).fillna(0.0)
    vol = vol_ewma(r, lam)
    w = ((objetivo / vol).clip(upper=tope).shift(1).fillna(0.0)) * sobre
    w.iloc[:n] = 0.0
    return w * r - costo_rotacion * w.diff().abs().fillna(0.0), w


def newey_west(x, lags=10):
    """Varianza de largo plazo (Bartlett) de una serie."""
    x = np.asarray(x, float) - np.mean(x)
    n = len(x)
    g0 = x @ x / n
    s = g0
    for L in range(1, min(lags, n - 1) + 1):
        g = x[L:] @ x[:-L] / n
        s += 2 * (1 - L / (lags + 1)) * g
    return s


def tasacion(rs, rb, lags=10, anual=252):
    """α, β, IR de tasación (con t de Newey-West) e IR activo de una estrategia contra un benchmark (retornos diarios)."""
    df = pd.concat([rs.rename("s"), rb.rename("b")], axis=1).dropna()
    y, x = df.s.values, df.b.values
    n = len(y)
    X = np.column_stack([np.ones(n), x])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    e = y - X @ coef
    # error estándar de α con Newey-West (sandwich)
    XtX_inv = np.linalg.inv(X.T @ X / n)
    u = X * e[:, None]
    S = u.T @ u / n
    for L in range(1, lags + 1):
        G = u[L:].T @ u[:-L] / n
        S += (1 - L / (lags + 1)) * (G + G.T)
    V = XtX_inv @ S @ XtX_inv / n
    t_alfa = coef[0] / np.sqrt(V[0, 0]) if V[0, 0] > 0 else np.nan
    sd_e = e.std(ddof=2)
    ir_tas = coef[0] / sd_e * np.sqrt(anual) if sd_e > 0 else np.nan
    act = y - x
    lrv = newey_west(act, lags)
    t_act = act.mean() / np.sqrt(lrv / n) if lrv > 0 else np.nan
    ir_act = act.mean() / act.std(ddof=1) * np.sqrt(anual) if act.std() > 0 else np.nan
    sh = lambda z: z.mean() / z.std(ddof=1) * np.sqrt(anual) if z.std() > 0 else np.nan  # noqa: E731
    return dict(n_dias=n, alfa_anual=coef[0] * anual, beta=coef[1], ir_tasacion=ir_tas, t_alfa=t_alfa,
                p_alfa=float(stats.norm.sf(t_alfa)) if np.isfinite(t_alfa) else np.nan,
                tracking_error=act.std(ddof=1) * np.sqrt(anual), ir_activo=ir_act,
                p_activo=float(stats.norm.sf(t_act)) if np.isfinite(t_act) else np.nan,
                sharpe_estrategia=sh(y), sharpe_benchmark=sh(x), correlacion=float(np.corrcoef(x, y)[0, 1]))


def metricas_serie(r, anual=252):
    """Sharpe, CAGR, volatilidad y drawdown máximo de una serie de retornos diarios (compuesta)."""
    r = pd.Series(r).fillna(0.0)
    eq = (1 + r).cumprod()
    dd = 1 - eq / eq.cummax()
    anios = len(r) / anual
    return dict(sharpe=r.mean() / r.std() * np.sqrt(anual) if r.std() > 0 else np.nan,
                cagr=eq.iloc[-1] ** (1 / anios) - 1 if anios > 0 and eq.iloc[-1] > 0 else np.nan,
                vol=r.std() * np.sqrt(anual), max_dd=float(dd.max()))
