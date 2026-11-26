"""Señales de dirección (filtros) calculadas sobre velas cerradas. Cada función devuelve un array +1 / -1 / 0 por vela."""
import numpy as np
import pandas as pd


def sma(x, n):
    return pd.Series(x).rolling(n, min_periods=n).mean().values


def ema(x, n):
    return pd.Series(x).ewm(span=n, adjust=False, min_periods=n).mean().values


def sobre_sma(v, n):
    m = sma(v["c"], n)
    return np.where(np.isnan(m), 0, np.sign(v["c"] - m)).astype(int)


def pendiente_sma(v, n, paso=20):
    m = sma(v["c"], n)
    d = m - np.concatenate([np.full(paso, np.nan), m[:-paso]])
    return np.where(np.isnan(d), 0, np.sign(d)).astype(int)


def momentum(v, l):
    c = v["c"]
    prev = np.concatenate([np.full(l, np.nan), c[:-l]])
    r = c / prev - 1
    return np.where(np.isnan(r), 0, np.sign(r)).astype(int)


def cruce_medias(v, rapida, lenta):
    a, b = sma(v["c"], rapida), sma(v["c"], lenta)
    return np.where(np.isnan(b), 0, np.sign(a - b)).astype(int)


def donchian_estado(v, l):
    """+1 desde que el cierre supera el máximo de las l velas anteriores hasta que perfora el mínimo; -1 al revés."""
    h = pd.Series(v["h"]).rolling(l).max().shift(1).values
    lo = pd.Series(v["l"]).rolling(l).min().shift(1).values
    out = np.zeros(len(v["c"]), int)
    s = 0
    for i in range(len(out)):
        if not np.isnan(h[i]):
            if v["c"][i] > h[i]:
                s = 1
            elif v["c"][i] < lo[i]:
                s = -1
        out[i] = s
    return out


def donchian_ruptura(v, l):
    """Solo la vela de la ruptura: +1 si el cierre supera el máximo de las l anteriores, -1 si perfora el mínimo."""
    h = pd.Series(v["h"]).rolling(l).max().shift(1).values
    lo = pd.Series(v["l"]).rolling(l).min().shift(1).values
    c = v["c"]
    return np.where(c > h, 1, np.where(c < lo, -1, 0)).astype(int)


def combinar(*filtros):
    """+1 si todos son +1, -1 si todos son -1, 0 si no coinciden."""
    f = np.vstack(filtros)
    return np.where((f == 1).all(axis=0), 1, np.where((f == -1).all(axis=0), -1, 0))


def rsi(c, n):
    d = np.diff(c, prepend=c[0])
    up = pd.Series(np.maximum(d, 0)).ewm(alpha=1 / n, adjust=False).mean().values
    dn = pd.Series(np.maximum(-d, 0)).ewm(alpha=1 / n, adjust=False).mean().values
    with np.errstate(divide="ignore", invalid="ignore"):
        r = 100 - 100 / (1 + up / dn)
    r[:n] = np.nan
    return r


def tendencia(v, n=200, paso=20):
    """+1 si cierre > SMA(n) y la SMA sube en `paso` velas; -1 al revés; 0 si no."""
    return combinar(sobre_sma(v, n), pendiente_sma(v, n, paso))


def retroceso_rsi(v, n_rsi=2, bajo=10, alto=90, tend=None):
    """Evento: RSI(n) < bajo dentro de tendencia alcista → +1; RSI > alto en tendencia bajista → -1."""
    t = tendencia(v) if tend is None else tend
    r = rsi(v["c"], n_rsi)
    return np.where((t == 1) & (r < bajo), 1, np.where((t == -1) & (r > alto), -1, 0))


def retroceso_minimo(v, l=5, tend=None):
    """Evento: cierre en el mínimo de l velas dentro de tendencia alcista → +1 (al revés en bajista)."""
    t = tendencia(v) if tend is None else tend
    mn = pd.Series(v["c"]).rolling(l).min().values
    mx = pd.Series(v["c"]).rolling(l).max().values
    return np.where((t == 1) & (v["c"] <= mn), 1, np.where((t == -1) & (v["c"] >= mx), -1, 0))


def toque_media(v, n=20, tend=None):
    """Evento: la vela toca la EMA(n) y cierra del lado de la tendencia."""
    t = tendencia(v) if tend is None else tend
    e = ema(v["c"], n)
    return np.where((t == 1) & (v["l"] <= e) & (v["c"] > e), 1, np.where((t == -1) & (v["h"] >= e) & (v["c"] < e), -1, 0))


def reversion_rsi(v, n_rsi=2, bajo=5, alto=95):
    r = rsi(v["c"], n_rsi)
    return np.where(r < bajo, 1, np.where(r > alto, -1, 0))


def dia_extremo(v, mult=2.0, atr_v=None):
    """Evento: vela con caída > mult·ATR → +1 (rebote); subida > mult·ATR → -1."""
    from lab.datos import atr as _atr
    a = _atr(v, 14) if atr_v is None else atr_v
    prev = np.concatenate([[np.nan], a[:-1]])
    mov = v["c"] - v["o"]
    return np.where(mov < -mult * prev, 1, np.where(mov > mult * prev, -1, 0))
