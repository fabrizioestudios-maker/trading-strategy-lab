"""Pruebas de los módulos de la fase 4b (entrada 27) con datos sintéticos."""
import numpy as np
import pandas as pd
import pytest

from lab import benchmarks, ejecucion, eventos, externos, ficha, flujo, montecarlo, multiples, objetivos, politica, regimen
from lab import walkforward as wf


def test_ficha_basico():
    ops = pd.DataFrame(dict(t=np.arange(6) * 86400000, t_salida=np.arange(6) * 86400000 + 3600000, dir=[1, -1, 1, 1, -1, 1],
                            r=[2.0, -1.0, -1.0, -1.0, 2.0, 2.0]))
    f = ficha.ficha(ops)
    assert f["n"] == 6 and f["wr"] == pytest.approx(0.5)
    assert f["payoff"] == pytest.approx(2.0)
    assert f["max_dd"] == pytest.approx(3.0)
    assert f["racha_perdedora"] == 3 and f["racha_ganadora"] == 2
    assert f["duracion_media_h"] == pytest.approx(1.0)


def test_gt_score_por_partes():
    rng = np.random.default_rng(0)
    malo = rng.normal(-0.2, 1.0, 200)
    bueno = rng.normal(0.4, 1.0, 200)
    assert objetivos.gt_perdida(malo) >= 100
    assert objetivos.gt_perdida(bueno) < 0
    assert objetivos.gt_perdida(bueno[:20], n_min=50) == objetivos.PENALIDAD_N
    assert objetivos.r2_curva(np.ones(50)) == pytest.approx(1.0)


def test_meseta_y_acantilado():
    g = pd.DataFrame(dict(a=[1, 2, 3, 4, 5, 6, 7]))
    sr = np.array([0.1, 0.12, 0.11, 0.6, 0.1, 0.45, 0.44])  # pico aislado en 4; meseta en 6–7
    vec = objetivos.vecinos(g, ["a"])
    assert vec[0] == [1] and sorted(vec[3]) == [2, 4]
    veto = objetivos.acantilado(sr, vec, tau_rel=0.5)
    assert veto[3] and not veto[6]
    k = objetivos.elegir_meseta(sr, vec, alpha=0.7, tau_rel=0.5)
    assert k in (5, 6)


def test_walkforward_estadisticas_y_pliegues():
    rng = np.random.default_rng(1)
    n = 400
    cfg = rng.integers(0, 5, n)
    t = np.sort(rng.integers(wf.ms("2010-11-15"), wf.ms("2026-11-01"), n))
    r = rng.normal(0, 1, n)
    ops = wf.Operaciones(cfg, t, t + 3600000, r)
    a, b = wf.ms("2013-11-15"), wf.ms("2016-11-15")
    st = wf.estadisticas(ops, a, b, salida_max=b)
    for k in range(5):
        m = (cfg == k) & (t >= a) & (t < b)
        assert st.n[k] == m.sum()
        if m.sum() > 1:
            assert st.mu[k] == pytest.approx(r[m].mean())
            assert st.sd[k] == pytest.approx(r[m].std(ddof=1))
    assert len(wf.pliegues("3/1")) == 13
    assert len(wf.pliegues("5/1")) == 11
    assert len(wf.pliegues("5/2")) == 6
    f = wf.pliegues("3/1")[0]
    assert f["test_a"] - f["train_b"] == 5 * wf.DIA


def test_multiples():
    p = np.array([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216])
    assert multiples.bonferroni(p, 0.05).sum() == 1
    assert multiples.holm(p, 0.05).sum() == 1  # 0,008 > 0,05/9
    assert multiples.bh(p, 0.05).sum() == 2
    assert multiples.by(p, 0.05).sum() <= multiples.bh(p, 0.05).sum()


def test_spa_ruido_y_senal():
    rng = np.random.default_rng(2)
    T, K = 1500, 40
    X = rng.normal(0, 1, (T, K))
    r0 = multiples.spa(X, B=300, L=10, semilla=1)
    assert r0["p_consistente"] > 0.05
    X[:, 7] += 0.15
    r1 = multiples.spa(X, B=300, L=10, semilla=1)
    assert r1["p_consistente"] < 0.05 and r1["mejor"] == 7
    assert r1["p_inferior"] <= r1["p_consistente"] <= r1["p_superior"] + 1e-12


def test_mtm_suma_el_r():
    dias = pd.date_range("2024-01-01", periods=10, freq="D")
    d1 = pd.DataFrame(dict(t=(dias.values.astype("datetime64[ms]").astype(np.int64)), c=np.linspace(100, 109, 10)), index=dias)
    ops = pd.DataFrame(dict(t=[d1.t.iloc[1] + 60000], t_salida=[d1.t.iloc[5] + 3600000], dir=[1], entrada=[101.0],
                            salida=[105.5], sl=[100.0], r=[4.3]))
    s = benchmarks.diario_mtm(ops, d1)
    assert s.sum() == pytest.approx(4.3)


def test_tasacion_detecta_alfa():
    rng = np.random.default_rng(3)
    x = rng.normal(0.0003, 0.01, 3000)
    y = 0.0006 + 0.5 * x + rng.normal(0, 0.005, 3000)
    t = benchmarks.tasacion(pd.Series(y), pd.Series(x))
    assert t["beta"] == pytest.approx(0.5, abs=0.05)
    assert t["ir_tasacion"] > 1.0 and t["p_alfa"] < 0.01


def test_perfiles_de_ejecucion():
    n = 2000
    t0 = pd.Timestamp("2024-03-01", tz="UTC").value // 10**6
    m1 = dict(t=t0 + np.arange(n) * 60000, o=np.full(n, 2000.0), h=np.full(n, 2000.5), l=np.full(n, 1999.5), c=2000 + np.sin(np.arange(n)) * 0.3)
    vol = ejecucion.Volatilidad(m1, fin_desarrollo_ms=t0 + n * 60000)
    ops = pd.DataFrame(dict(t=m1["t"][[100, 500]], t_salida=m1["t"][[200, 900]], dir=[1, -1], entrada=[2000.0, 2000.0],
                            salida=[2010.0, 2005.0], sl=[1995.0, 2005.0], motivo=[1, -1]))
    ops["r"] = ops.dir * (ops.salida - ops.entrada) / (ops.entrada - ops.sl).abs()
    s = ejecucion.aplicar(ops, "XAUUSD", vol, "sin_costos")
    assert np.allclose(s.r, s.r_bruto)
    b = ejecucion.aplicar(ops, "XAUUSD", vol, "base")
    e = ejecucion.aplicar(ops, "XAUUSD", vol, "estres")
    assert (b.costo_r > 0).all() and (e.costo_r > b.costo_r).all()


def test_montecarlo():
    M = montecarlo.bootstrap_bloques(np.array([1.0, 1.0, 1.0]), 50, n_sim=10)
    assert M.shape == (10, 50)
    rg = montecarlo.riesgo(M, 0.01)
    assert rg["dd_mediana"] == 0 and rg["ruina"] == 0


def test_hmm_filtrado_recupera_regimenes():
    rng = np.random.default_rng(4)
    estados = np.repeat([0, 1, 0, 1, 0], 300)
    x = np.where(estados == 0, rng.normal(0, 0.5, len(estados)), rng.normal(2.0, 0.5, len(estados)))
    m = regimen.HMMGaussiano(k=2, n_init=3, semilla=0).ajustar(x[:, None])
    p = m.filtrar(x[:, None])
    acierto = (p.argmax(axis=1) == estados).mean()
    assert acierto > 0.95
    # el filtrado no mira adelante: cambiar el futuro no cambia el pasado
    x2 = x.copy()
    x2[1000:] += 5
    p2 = m.filtrar(x2[:, None])
    assert np.allclose(p[:1000], p2[:1000])


def test_z_movil_causal_y_disponibilidad():
    x = np.arange(200, dtype=float) + np.random.default_rng(5).normal(0, 1, 200)
    z1 = flujo.z_movil(x)
    z2 = flujo.z_movil(np.concatenate([x, [1e6]]))
    assert np.allclose(z1[~np.isnan(z1)], z2[:200][~np.isnan(z1)])
    serie = pd.DataFrame(dict(valor=[1.0, 2.0], disponible_ms=[3000, 5000]))
    v = dict(t=np.array([0, 2000, 4000, 6000]))
    a = externos.a_velas(serie, v)
    assert np.isnan(a[0]) and a[1] == 1.0 and a[2] == 2.0  # [0, 2000) cierra antes de 3000; [4000, 6000) cierra a las 6000 ≥ 5000


def test_disponibilidad_cot():
    # martes 2023-07-04 es feriado → el reporte del martes 2023-07-04 sale el lunes siguiente
    normal = externos.disponible_cot(pd.to_datetime(["2023-06-27"]))[0]
    feriado = externos.disponible_cot(pd.to_datetime(["2023-07-04"]))[0]
    cierre = externos.disponible_cot(pd.to_datetime(["2019-01-08"]))[0]
    f = lambda x: pd.Timestamp(x, unit="ms", tz="UTC").tz_convert("America/New_York")  # noqa: E731
    assert f(normal).weekday() == 4 and f(normal).hour == 17
    assert f(feriado).weekday() == 0
    assert f(cierre) >= pd.Timestamp("2019-03-08 17:00", tz="America/New_York")


def test_simular_hasta_cierre_forzado():
    o = np.array([100.0, 100.0, 100.2, 100.1, 100.3])
    h = o + 0.1
    l = o - 0.1
    c = o.copy()
    r, mot = eventos.simular_hasta(o, h, l, c, np.array([0]), np.array([1]), np.array([99.0]), np.array([102.0]),
                                   np.array([0.0]), np.array([3]))
    assert mot[0] == 2 and r[0] == pytest.approx(0.1)


def test_politica_niveles():
    assert politica.nivel(dict(exp_conf=-0.1))[0] == "R"
    assert politica.nivel(dict(exp_is=0.1, exp_conf=0.1, n=20))[0] == "A"
    assert politica.nivel(dict(exp_is=0.4, exp_conf=0.6, n=168, p_azar=0.0005))[0] == "B"
