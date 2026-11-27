"""
NEXUS · E022 definida una sola vez.
- Panel de decisión y eventos sin futuro: idénticos con datos completos y con datos truncados en el límite.
- Regresión con datos reales (se salta si no está data/XAUUSD.npz): mismas cifras que experimentos/E042.
"""
import os

import numpy as np
import pandas as pd
import pytest

from nexus_api import estrategias as E
from nexus_api.datos import DATA, ServicioDatos

from _nexus_util import m1_sintetico, truncar

M1 = m1_sintetico(dias=330, semilla=7, inicio="2024-01-07 23:00")


@pytest.fixture(scope="module")
def svc():
    return ServicioDatos(m1_inyectado={"XAUUSD": M1})


def test_panel_y_eventos_no_dependen_del_futuro(svc):
    rng = np.random.default_rng(0)
    d1 = svc.serie("XAUUSD", 1440)
    assert len(d1.t) > 230
    for j in rng.integers(int(d1.i1[215]), len(M1["t"]) - 1, 12):
        lim = int(M1["t"][j])
        corto = ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, int(j))})
        assert E.panel(svc, "XAUUSD", lim) == E.panel(corto, "XAUUSD", lim)
        desde = int(M1["t"][0])
        assert E.eventos(svc, "XAUUSD", desde, lim) == E.eventos(corto, "XAUUSD", desde, lim)


def test_senales_causales():
    v = __import__("lab.datos", fromlist=["velas"]).velas(M1, 1440)
    s = E.senales(v)
    for b in (210, 250, 300):
        corto = {k: v[k][: b + 1] for k in ("t", "o", "h", "l", "c")}
        assert np.array_equal(E.senales(corto), s[: b + 1])


def test_panel_sin_suficientes_velas():
    corto = ServicioDatos(m1_inyectado={"XAUUSD": m1_sintetico(dias=20, semilla=3)})
    p = E.panel(corto, "XAUUSD", int(corto.m1("XAUUSD")["t"][-1]))
    assert p["decision"] == "sin_datos" and "200" in p["explicacion"]


@pytest.mark.skipif(not os.path.exists(os.path.join(DATA, "XAUUSD.npz")), reason="sin data/XAUUSD.npz (git-ignored)")
def test_regresion_contra_e042():
    real = ServicioDatos()
    m = {k: np.asarray(real.m1("XAUUSD")[k]) for k in ("t", "o", "h", "l", "c")}
    ms = lambda x: pd.Timestamp(x, tz="UTC").value // 10**6  # noqa: E731
    ref = pd.read_csv(os.path.join(os.path.dirname(DATA), "resultados", "E042", "resumen.csv")).set_index("entrada")
    for entrada, fila in (("18:15", "18:15"), ("reapertura", "original (reapertura)")):
        ops = E.operaciones(m, entrada, ms("2011-11-15"), ms("2026-11-14"))
        assert len(ops) == int(ref.loc[fila, "n"])
        assert ops.r.mean() == pytest.approx(ref.loc[fila, "exp_costosmd"], abs=1e-9)
