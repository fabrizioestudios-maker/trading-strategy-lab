"""Pruebas del motor: casos a mano y el caso teórico del paseo al azar."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import motor  # noqa: E402


def m1(o, h, l, c):
    n = len(o)
    return dict(t=np.arange(n, dtype=np.int64) * 60000, o=np.array(o, float), h=np.array(h, float), l=np.array(l, float), c=np.array(c, float))


def test_tp_y_sl_en_el_mismo_minuto_cuenta_sl():
    d = m1([100, 100], [100, 110], [100, 90], [100, 100])
    r = motor.simular(d, [0], [1], [95], [110], [0.0])
    assert r["motivo"][0] == -1 and abs(r["r"][0] + 1) < 1e-12


def test_hueco_contra_sale_en_la_apertura():
    d = m1([100, 100, 90], [100, 101, 91], [99.5, 99.5, 89], [100, 100, 90])
    r = motor.simular(d, [0], [1], [95], [110], [0.0])
    assert r["motivo"][0] == -1 and abs(r["r"][0] - (90 - 100) / 5) < 1e-12


def test_venta_tp_y_costo():
    d = m1([100, 100, 100], [100, 101, 100], [100, 99, 89], [100, 100, 90])
    r = motor.simular(d, [0], [-1], [105], [90], [1.0])
    assert r["motivo"][0] == 1 and abs(r["r"][0] - (10 - 1) / 5) < 1e-12


def test_no_superpone():
    d = m1([100] * 6, [100, 100, 111, 100, 111, 100], [100] * 6, [100] * 6)
    r = motor.simular(d, [0, 1, 3], [1, 1, 1], [95, 95, 95], [110, 110, 110], [0.0, 0.0, 0.0])
    assert len(r["r"]) == 2 and list(r["ie"]) == [0, 3]


def _paseo(n, deriva, sigma, semilla):
    rng = np.random.default_rng(semilla)
    pasos = rng.normal(deriva, sigma, n)
    c = 1000 + np.cumsum(pasos)
    o = np.concatenate([[1000], c[:-1]])
    # rango dentro del minuto: sub-pasos para que h/l sean realistas
    sub = rng.normal(0, sigma / 2, (n, 4)).cumsum(axis=1)
    h = np.maximum(o, c) + np.abs(sub).max(axis=1) * 0.0
    l = np.minimum(o, c) - np.abs(sub).max(axis=1) * 0.0
    return m1(o, h, l, c)


def test_paseo_al_azar_da_un_tercio():
    d = _paseo(400_000, 0.0, 1.0, 1)
    rng = np.random.default_rng(2)
    ie = np.sort(rng.choice(np.arange(1000, 300_000), 3000, replace=False))
    dirs = rng.choice([-1, 1], len(ie))
    a = 15.0
    ent = d["o"][ie]
    r = motor.simular(d, ie, dirs, ent - dirs * a, ent + dirs * 2 * a, np.zeros(len(ie)), superponer=True)
    wr = (r["r"] > 0).mean()
    assert abs(wr - 1 / 3) < 0.03, wr


def test_paseo_con_deriva_coincide_con_la_formula():
    mu, s, a = 0.02, 1.0, 12.0
    d = _paseo(600_000, mu, s, 3)
    rng = np.random.default_rng(4)
    ie = np.sort(rng.choice(np.arange(1000, 450_000), 3000, replace=False))
    ent = d["o"][ie]
    r = motor.simular(d, ie, np.ones(len(ie), int), ent - a, ent + 2 * a, np.zeros(len(ie)), superponer=True)
    th = 2 * mu * a / s**2
    p = (1 - math.exp(th)) / (math.exp(-2 * th) - math.exp(th))
    wr = (r["r"] > 0).mean()
    assert abs(wr - p) < 0.04, (wr, p)
