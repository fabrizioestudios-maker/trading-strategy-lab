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
