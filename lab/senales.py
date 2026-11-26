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
