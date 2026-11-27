"""
NEXUS · replay sin futuro (MASTER_PROMPT §5B y §6). Datos sintéticos: no requieren data/*.npz.

Invariantes:
1. Ninguna vela devuelta contiene minutos posteriores al límite.
2. Prefijo: el cuadro con todos los datos es idéntico al cuadro con los datos truncados en el límite (lo que se ve no
   depende de nada posterior, ni siquiera a través de la agregación).
3. Las velas coinciden con la agregación del laboratorio (`lab.datos.velas`), y la vela en formación con la agregación
   de los minutos revelados.
4. Los pasos son deterministas y reversibles.
"""
import numpy as np
import pytest

from lab import datos as LD
from nexus_api.datos import ServicioDatos

from _nexus_util import m1_sintetico, truncar

M1 = m1_sintetico(dias=30, semilla=1)


@pytest.fixture(scope="module")
def svc():
    return ServicioDatos(m1_inyectado={"XAUUSD": M1})


def _limites(n=40, semilla=2):
    rng = np.random.default_rng(semilla)
    idx = rng.integers(3000, len(M1["t"]) - 10, n)
    return [int(M1["t"][j]) for j in idx]


@pytest.mark.parametrize("tf", [1, 5, 15, 60, 240, 1440])
def test_ninguna_vela_mira_el_futuro(svc, tf):
    for lim in _limites():
        velas, _ = svc.velas_hasta("XAUUSD", tf, lim, 200)
        j = svc.indice_limite("XAUUSD", lim)
        assert velas[-1]["t"] <= lim
        # la vela en formación sale solo de minutos ≤ límite
        u = velas[-1]
        dentro = (M1["t"] >= u["t"]) & (np.arange(len(M1["t"])) <= j)
        if tf > 1:
            v = LD.velas(M1, tf)
            k = int(np.searchsorted(v["i0"], j, side="right")) - 1
            dentro = (np.arange(len(M1["t"])) >= v["i0"][k]) & (np.arange(len(M1["t"])) <= j)
        assert u["h"] == pytest.approx(round(float(M1["h"][dentro].max()), 2))
        assert u["l"] == pytest.approx(round(float(M1["l"][dentro].min()), 2))
        assert u["c"] == pytest.approx(round(float(M1["c"][j]), 2))


@pytest.mark.parametrize("tf", [1, 15, 240, 1440])
def test_prefijo_identico_con_datos_truncados(svc, tf):
    for lim in _limites(15, semilla=3):
        j = svc.indice_limite("XAUUSD", lim)
        corto = ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)})
        a, _ = svc.velas_hasta("XAUUSD", tf, lim, 150)
        b, _ = corto.velas_hasta("XAUUSD", tf, lim, 150)
        assert a == b


def test_velas_completas_iguales_al_laboratorio(svc):
    v = LD.velas(M1, 60)
    lim = int(M1["t"][-1])
    velas, _ = svc.velas_hasta("XAUUSD", 60, lim, 50)
    for x in velas:
        k = int(np.searchsorted(v["t"], x["t"]))
        assert (x["o"], x["h"], x["l"], x["c"]) == pytest.approx((v["o"][k], v["h"][k], v["l"][k], v["c"][k]))


def test_pasos_deterministas_y_reversibles(svc):
    lim = _limites(1, semilla=4)[0]
    a, _, _ = svc.siguiente_limite("XAUUSD", 15, lim, 3)
    b, _, _ = svc.siguiente_limite("XAUUSD", 15, lim, 3)
    assert a == b and a > lim
    # tres pasos adelante y tres atrás terminan en el cierre de la vela anterior a la de partida (o en ella si cerró)
    atras, _, _ = svc.siguiente_limite("XAUUSD", 15, a, -3)
    assert atras <= lim
    # un paso desde una vela en formación la completa
    velas, _ = svc.velas_hasta("XAUUSD", 15, lim, 1)
    if velas[-1]["parcial"]:
        c, _, _ = svc.siguiente_limite("XAUUSD", 15, lim, 1)
        v2, _ = svc.velas_hasta("XAUUSD", 15, c, 1)
        assert v2[-1]["t"] == velas[-1]["t"] and not v2[-1]["parcial"]
    m, mins, _ = svc.siguiente_limite("XAUUSD", 15, lim, 7, "minutos")
    assert mins == 7 and m > lim


def test_salto_de_fecha_y_bordes(svc):
    primero, ultimo = int(M1["t"][0]), int(M1["t"][-1])
    assert svc.limite_para_fecha("XAUUSD", primero - 10**9) == primero
    assert svc.limite_para_fecha("XAUUSD", ultimo + 10**9) == ultimo
    lim, _, fin = svc.siguiente_limite("XAUUSD", 15, ultimo, 5)
    assert lim == ultimo and fin
    assert svc.velas_hasta("XAUUSD", 15, primero - 1, 10) == ([], False)


# ------------------------------------------------------------------ niveles y órdenes simuladas (sin futuro)
def test_niveles_no_dependen_del_futuro():
    from nexus_api import estrategias as E

    largo = m1_sintetico(dias=60, semilla=9)
    svc = ServicioDatos(m1_inyectado={"XAUUSD": largo})
    rng = np.random.default_rng(1)
    for j in rng.integers(20000, len(largo["t"]) - 1, 10):
        lim = int(largo["t"][j])
        corto = ServicioDatos(m1_inyectado={"XAUUSD": truncar(largo, int(j))})
        a, b = E.niveles(svc, "XAUUSD", lim), E.niveles(corto, "XAUUSD", lim)
        assert a == b and {x["clave"] for x in a} >= {"pdh", "pdl"}
        assert all(x["conocido_desde_ms"] <= lim + 60000 for x in a)


def test_ordenes_simuladas_deterministas_y_sin_futuro(svc):
    from nexus_api import simulacion as SIM

    j0 = 5000
    t0 = int(M1["t"][j0])
    ref = float(M1["c"][j0])
    ordenes = [dict(id="c", lado="compra", creada_limite_ms=t0, sl=ref - 3, tp=ref + 6),
               dict(id="v", lado="venta", creada_limite_ms=t0, sl=ref + 3, tp=ref - 6)]
    assert [o["estado"] for o in SIM.estados(svc, "XAUUSD", t0, ordenes)] == ["esperando_llenado"] * 2
    antes = int(M1["t"][j0 - 10])
    assert {o["estado"] for o in SIM.estados(svc, "XAUUSD", antes, ordenes)} == {"posterior_al_limite"}
    for j in (j0 + 1, j0 + 30, j0 + 400, j0 + 3000):
        lim = int(M1["t"][j])
        a = SIM.estados(svc, "XAUUSD", lim, ordenes)
        corto = ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)})
        assert a == SIM.estados(corto, "XAUUSD", lim, ordenes)  # el estado no depende de minutos posteriores
        for o in a:
            assert o["estado"] in ("abierta", "cerrada", "rechazada")
            if o["estado"] == "cerrada":
                assert o["salida_ms"] <= lim and o["motivo"] in ("TP", "SL")
                assert o["r"] == pytest.approx((2 if o["motivo"] == "TP" else -1) - o["costo_r"], abs=0.05) or o["motivo"] == "SL"


def test_salto_en_hora_de_nueva_york():
    from fastapi.testclient import TestClient

    from nexus_api.app import crear_app

    svc = ServicioDatos(m1_inyectado={"XAUUSD": M1})
    c = TestClient(crear_app(svc))
    t = int(M1["t"][20000])
    from nexus_api import sesiones as SE
    ny = SE.a_ny(t).strftime("%Y-%m-%dT%H:%M")
    r = c.get("/api/v1/replay/fecha", params=dict(fecha_ny=ny)).json()
    assert r["limite_ms"] == t
    assert c.get("/api/v1/replay/fecha", params=dict(fecha_ny="27/11/2026")).status_code == 422
