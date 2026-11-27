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


# ------------------------------------------------------------------ capas del toolkit (estructura y FVG)
@pytest.mark.parametrize("tf", [5, 15, 60])
def test_capas_sin_futuro_y_prefijo_identico(svc, tf):
    from nexus_api import capas as CA

    for lim in _limites(8, semilla=11):
        a = CA.capas(svc, "XAUUSD", tf, lim, 200)
        j = svc.indice_limite("XAUUSD", lim)
        b = CA.capas(ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)}), "XAUUSD", tf, lim, 200)
        assert a == b  # lo que se dibuja no depende de minutos posteriores al límite
        fin = lim + 60_000
        assert all(p["confirmado_ms"] <= fin and p["t"] < p["confirmado_ms"] for p in a["pivotes"])
        assert all(r["t"] + tf * 60_000 <= fin for r in a["rupturas"])
        assert all(z["conocido_ms"] <= fin and (z["mitigada_ms"] is None or z["mitigada_ms"] <= fin) for z in a["fvg"])
        assert all(z["arriba"] > z["abajo"] for z in a["fvg"])


def test_pivotes_iguales_a_los_del_laboratorio():
    from nexus_api import capas as CA

    v = LD.velas(M1, 15)
    assert CA.coincide_con_laboratorio(np.asarray(v["h"][:3000], float), np.asarray(v["l"][:3000], float))


def test_rupturas_alternan_bos_y_choch_con_el_estado():
    from nexus_api import capas as CA

    svc = ServicioDatos(m1_inyectado={"XAUUSD": M1})
    r = CA.capas(svc, "XAUUSD", 15, int(M1["t"][-1]), 800)["rupturas"]
    assert r, "la ventana sintética debería tener rupturas"
    estado = None  # la primera ruptura de la ventana puede ser CHOCH respecto de un estado anterior a la ventana
    for x in r:
        nuevo = 1 if x["lado"] == "alcista" else -1
        if estado is not None:
            assert (x["tipo"] == "CHOCH") == (estado != nuevo)
        estado = nuevo


def test_ordenes_limite_sin_futuro_y_como_el_laboratorio(svc):
    from lab import smc
    from nexus_api import simulacion as SIM

    j0 = 6000
    t0 = int(M1["t"][j0])
    ref = float(M1["c"][j0])
    ordenes = [dict(id="lc", lado="compra", tipo="limite", entrada=ref - 1.5, creada_limite_ms=t0, sl=ref - 5, tp=ref + 6, vence_minutos=600),
               dict(id="lv", lado="venta", tipo="limite", entrada=ref + 1.5, creada_limite_ms=t0, sl=ref + 5, tp=ref - 6, vence_minutos=600)]
    vistos = set()
    for j in (j0 + 1, j0 + 20, j0 + 200, j0 + 900, j0 + 3000):
        lim = int(M1["t"][j])
        a = SIM.estados(svc, "XAUUSD", lim, ordenes)
        corto = ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)})
        assert a == SIM.estados(corto, "XAUUSD", lim, ordenes)  # no depende de minutos posteriores al límite
        for o in a:
            vistos.add(o["estado"])
            assert o["entrada_ms"] is None or o["entrada_ms"] <= lim
            assert o["salida_ms"] is None or o["salida_ms"] <= lim
    assert vistos & {"abierta", "cerrada", "cancelada", "vencida"}
    # con todos los datos, el resultado es el del simulador del laboratorio
    fin = SIM.estados(svc, "XAUUSD", int(M1["t"][-1]), ordenes[:1])[0]
    est, r, _, _ = smc.simular_ordenes(M1["o"], M1["h"], M1["l"], M1["c"], np.array([j0 + 1]), np.array([j0 + 600]), np.array([1]),
                                       np.array([ref - 1.5]), np.array([ref - 5]), np.array([ref + 6]),
                                       np.array([float(LD.costo("XAUUSD", ref - 1.5))]), False, 2.0)
    esperado = {1: "cerrada", -1: "cerrada", 2: "cancelada", 3: "vencida", 4: "abierta"}[int(est[0])]
    assert fin["estado"] == esperado
    if fin["r"] is not None:
        assert fin["r"] == pytest.approx(round(float(r[0]), 4))


def test_orden_limite_del_lado_equivocado_se_rechaza_con_422():
    from fastapi.testclient import TestClient

    from nexus_api.app import crear_app

    c = TestClient(crear_app(ServicioDatos(m1_inyectado={"XAUUSD": M1})))
    t = int(M1["t"][5000])
    mala = dict(id="x", lado="compra", tipo="limite", entrada=2000, creada_limite_ms=t, sl=2010, tp=2020)
    r = c.post("/api/v1/replay/ordenes/estado", json=dict(limite_ms=t, ordenes=[mala]))
    assert r.status_code == 422 and "stop va debajo" in r.json()["detalle"]


# ------------------------------------------------------------------ indicadores, sesión del día y cuenta simulada
@pytest.mark.parametrize("tf", [5, 15, 60])
def test_indicadores_sin_futuro_alineados_y_como_el_laboratorio(svc, tf):
    from lab import senales as S
    from nexus_api import indicadores as IND

    for lim in _limites(6, semilla=21):
        a = IND.calcular(svc, "XAUUSD", tf, lim, 200)
        j = svc.indice_limite("XAUUSD", lim)
        assert a == IND.calcular(ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)}), "XAUUSD", tf, lim, 200)
        velas, _ = svc.velas_hasta("XAUUSD", tf, lim, 200)
        assert len(a["rsi"]) == len(a["macd"]) == len(a["histograma"]) == len(velas)
    # con todas las velas, el RSI es el de lab/senales.py
    todas, _ = svc.velas_hasta("XAUUSD", 15, int(M1["t"][-1]), 2000)
    c = np.array([v["c"] for v in todas], float)
    ref = S.rsi(c, 14)[-100:]
    got = IND.calcular(svc, "XAUUSD", 15, int(M1["t"][-1]), 100)["rsi"]
    assert np.allclose(np.array(got, float), np.round(ref, 4), atol=1e-6)


def test_el_calentamiento_hace_que_el_valor_no_dependa_de_cuantas_velas_se_piden(svc):
    from nexus_api import indicadores as IND

    lim = int(M1["t"][-500])
    a = IND.calcular(svc, "XAUUSD", 15, lim, 300)
    b = IND.calcular(svc, "XAUUSD", 15, lim, 120)
    assert a["macd"][-120:] == pytest.approx(b["macd"], abs=1e-3)
    assert a["rsi"][-120:] == pytest.approx(b["rsi"], abs=1e-3)


def test_sesion_del_dia_solo_con_lo_revelado(svc):
    from nexus_api import indicadores as IND

    for lim in _limites(10, semilla=22):
        a = IND.sesion_dia(svc, "XAUUSD", lim)
        j = svc.indice_limite("XAUUSD", lim)
        assert a == IND.sesion_dia(ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)}), "XAUUSD", lim)
        assert a["apertura_ms"] <= lim and a["minimo"] <= a["ultimo"] <= a["maximo"]
        assert a["ultimo"] == pytest.approx(round(float(M1["c"][j]), 2))


def test_cuenta_simulada_suma_el_resultado_de_las_ordenes(svc):
    from nexus_api import simulacion as SIM

    j0 = 5000
    t0 = int(M1["t"][j0])
    ref = float(M1["c"][j0])
    ordenes = [dict(id="a", lado="compra", creada_limite_ms=t0, sl=ref - 3, tp=ref + 6, lotes=0.5),
               dict(id="b", lado="venta", creada_limite_ms=t0, sl=ref + 3, tp=ref - 6, lotes=0.2),
               dict(id="c", lado="compra", creada_limite_ms=t0, sl=ref - 3, tp=ref + 6)]
    for j in (j0, j0 + 40, j0 + 3000):
        lim = int(M1["t"][j])
        cta = SIM.cuenta(svc, "XAUUSD", lim, 10_000, 50, ordenes)
        est = {e["id"]: e for e in SIM.estados(svc, "XAUUSD", lim, ordenes)}
        esperado = {"cerrada": 0.0, "abierta": 0.0}
        for o in ordenes[:2]:
            e = est[o["id"]]
            if e["r"] is not None and e["estado"] in esperado:
                esperado[e["estado"]] += e["r"] * abs(e["precio_entrada"] - o["sl"]) * o["lotes"] * 100
        assert cta["realizado"] == pytest.approx(esperado["cerrada"], abs=0.02)
        assert cta["abierto"] == pytest.approx(esperado["abierta"], abs=0.02)
        assert cta["equidad"] == pytest.approx(10_000 + cta["realizado"] + cta["abierto"], abs=0.02)
        assert cta["sin_tamano"] == 1 and cta["margen_libre"] == pytest.approx(cta["equidad"] - cta["margen"], abs=0.02)
        if cta["abiertas"] == 0:
            assert cta["margen"] == 0 and cta["nivel_margen_pct"] is None
