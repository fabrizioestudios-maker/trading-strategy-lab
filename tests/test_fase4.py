import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import politica, smc, validacion as V  # noqa: E402


def test_psr_y_dsr():
    rng = np.random.default_rng(1)
    bueno = rng.normal(0.3, 1.0, 2000)
    nulo = rng.normal(0.0, 1.0, 2000)
    assert V.psr(bueno) > 0.999
    assert 0.2 < V.psr(nulo) < 0.8
    assert V.sr_max_esperado(1000, 0.01) > V.sr_max_esperado(10, 0.01) > 0
    assert V.dsr(bueno, 10, 1e-4) > V.dsr(bueno, 100000, 0.05)


def test_pbo_ruido_y_senal():
    rng = np.random.default_rng(2)
    ruido = rng.normal(0, 1, (8, 300))
    assert 0.2 < V.pbo_cscv(ruido)["pbo"] < 0.8          # elegir por el pasado no ayuda
    senal = ruido.copy(); senal[:, 0] += 10                # una configuración mejor en todos los bloques
    assert V.pbo_cscv(senal)["pbo"] == 0.0


def test_bootstrap_contiene_la_media():
    r = np.random.default_rng(3).normal(0.2, 1, 500)
    a, b = V.bootstrap_ic(r, n=2000)
    assert a < r.mean() < b


def test_sd_desde_resumen():
    p, W, L = 0.4, 2.0, 1.0
    e = p * W - (1 - p) * L
    sd = V.sd_desde_resumen(p, e, W / L)
    assert abs(sd - np.sqrt(p * W * W + (1 - p) * L * L - e * e)) < 1e-12


def test_llenado_realista_mas_alla_del_stop():
    # venta límite en 100 con stop en 101; el minuto siguiente abre en 102 (hueco por encima del stop)
    o = np.array([99.5, 102.0, 102.0]); h = np.array([99.6, 102.2, 102.1]); l = np.array([99.4, 101.8, 101.9]); c = np.array([99.5, 102.0, 102.0])
    args = (o, h, l, c, np.array([1]), np.array([2]), np.array([-1], np.int64), np.array([100.0]), np.array([101.0]), np.array([98.0]), np.array([0.0]), False, 2.0)
    est, r, _, _ = smc.simular_ordenes(*args)
    assert est[0] == -1 and abs(r[0] - 1.0) < 1e-12        # comportamiento histórico: sale en el stop (optimista)
    est, r, _, _ = smc.simular_ordenes(*args, True)
    assert est[0] == -1 and abs(r[0]) < 1e-12              # realista: sale en el precio del llenado


def test_politica():
    ev = dict(n=200, exp=0.3, ic_inf=0.05, pf=1.6, p_azar=0.01, dsr=0.97, exp_is=0.3, exp_oos=0.25, exp_costo=0.2, anios_pos=0.8, holdout_n=40, holdout_exp=0.2)
    assert politica.clasificar(ev) == ("A", [])
    cat, fallas = politica.clasificar(dict(ev, holdout_n=0))
    assert cat == "B" and any("nunca usado" in f for f in fallas)
    assert politica.clasificar(dict(ev, exp=-0.1))[0] == "C"
    assert politica.cumple_mision_a(0.55, 2.0, 0.6, 120, 40) and not politica.cumple_mision_a(0.45, 2.0, 0.3, 120, 40)
