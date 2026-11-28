"""
NEXUS · biblioteca de indicadores del gráfico (clásicos y Smart Money Concepts [LuxAlgo]). Datos sintéticos.

1. Ningún indicador depende de minutos posteriores al límite (prefijo idéntico con los datos truncados).
2. Las series vienen alineadas con las velas visibles del cuadro.
3. Los clásicos coinciden con las fórmulas de referencia; el SMC respeta sus propias reglas (BOS/CHoCH con la
   tendencia, order blocks vigentes sin mitigar, FVG con hueco real).
4. Los parámetros se validan (422) y un indicador desconocido es 404.
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from lab import senales as S
from nexus_api import biblioteca as B
from nexus_api.app import crear_app
from nexus_api.datos import ServicioDatos

from _nexus_util import m1_sintetico, truncar

M1 = m1_sintetico(dias=40, semilla=5)
TODOS = [dict(instancia=d["id"], id=d["id"], parametros={}) for d in B.catalogo()]
SMC_TODO = dict(instancia="smc", id="luxalgo_smc", parametros=dict(fvg=True, premium=True, ob_swing=True, puntos=True, velas_color=True, largo_swing=20))


@pytest.fixture(scope="module")
def svc():
    return ServicioDatos(m1_inyectado={"XAUUSD": M1})


def _limites(n, semilla):
    rng = np.random.default_rng(semilla)
    return [int(M1["t"][j]) for j in rng.integers(20000, len(M1["t"]) - 10, n)]


@pytest.mark.parametrize("tf", [5, 15, 60])
def test_ningun_indicador_depende_del_futuro(svc, tf):
    for lim in _limites(4, tf):
        a = B.calcular(svc, "XAUUSD", tf, lim, 200, TODOS + [SMC_TODO])
        j = svc.indice_limite("XAUUSD", lim)
        b = B.calcular(ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)}), "XAUUSD", tf, lim, 200, TODOS + [SMC_TODO])
        assert a == b
        fin = lim + 60_000
        for r in a["resultados"]:
            for ln in r["lineas"] + r["histogramas"]:
                assert len(ln["valores"]) == len(a["tiempos"])
            for x in r["cajas"]:
                assert x["t0"] < fin
            for x in r["segmentos"]:
                assert x["t0"] < fin and x["t1"] >= x["t0"]
            for x in r["etiquetas"]:
                assert x["t"] < fin


def test_series_alineadas_con_el_cuadro(svc):
    lim = int(M1["t"][-500])
    velas, _ = svc.velas_hasta("XAUUSD", 15, lim, 200)
    r = B.calcular(svc, "XAUUSD", 15, lim, 200, [dict(instancia="x", id="sma", parametros=dict(periodo=10))])
    assert r["tiempos"] == [v["t"] for v in velas]
    cierres = np.array([v["c"] for v in svc.velas_hasta("XAUUSD", 15, lim, 400)[0]])
    esperado = np.convolve(cierres, np.ones(10) / 10, "valid")[-200:]
    assert np.allclose(r["resultados"][0]["lineas"][0]["valores"], esperado, atol=1e-6)


def test_rsi_y_macd_como_el_laboratorio_despues_del_calentamiento(svc):
    lim = int(M1["t"][-1])
    r = B.calcular(svc, "XAUUSD", 15, lim, 100, [dict(instancia="r", id="rsi", parametros={}), dict(instancia="m", id="macd", parametros={})])
    c = np.array([v["c"] for v in svc.velas_hasta("XAUUSD", 15, lim, 100 + 2000)[0]])
    rsi = S.rsi(c, 14)[-100:]
    assert np.allclose(r["resultados"][0]["lineas"][0]["valores"], rsi, atol=1e-3)
    macd = (S.ema(c, 12) - S.ema(c, 26))[-100:]
    assert np.allclose(r["resultados"][1]["lineas"][0]["valores"], macd, atol=1e-4)


def test_smc_respeta_sus_reglas(svc):
    lim = int(M1["t"][-1])
    r = B.calcular(svc, "XAUUSD", 15, lim, 600, [SMC_TODO])["resultados"][0]
    velas = [v for v in svc.velas_hasta("XAUUSD", 15, lim, 600 + 1500)[0] if not v["parcial"]]
    por_t = {v["t"]: i for i, v in enumerate(velas)}
    estructuras = [s for s in r["segmentos"] if s["texto"] in ("BOS", "CHoCH")]
    assert estructuras, "la ventana sintética debería tener estructura"
    for s in estructuras:
        v = velas[por_t[s["t1"]]]
        previa = velas[por_t[s["t1"]] - 1]
        # la vela de la ruptura cruza el nivel por cierre
        assert (v["c"] > s["p0"] >= previa["c"]) or (v["c"] < s["p0"] <= previa["c"])
    obs = [c for c in r["cajas"] if c["t1"] is None and c["texto"] is None]
    assert obs, "debería haber order blocks vigentes"
    for b in obs:
        k = por_t[b["t0"]]
        posteriores = velas[k + 1:]
        # vigente: ninguna vela posterior lo atravesó del lado de la mitigación (máx./mín.)
        assert all(x["h"] <= b["arriba"] for x in posteriores) or all(x["l"] >= b["abajo"] for x in posteriores)
    assert any(c["texto"] == "Premium" for c in r["cajas"]) and any(c["texto"] == "Discount" for c in r["cajas"])
    assert r["colores_velas"] and len(r["colores_velas"]) == 600
    assert r["licencia"] and "CC BY-NC-SA" in r["licencia"]


def test_api_valida_parametros_y_licencia():
    c = TestClient(crear_app(ServicioDatos(m1_inyectado={"XAUUSD": M1})))
    cat = c.get("/api/v1/indicadores/catalogo").json()
    smc = next(d for d in cat if d["id"] == "luxalgo_smc")
    assert smc["autor"] == "LuxAlgo" and "no comercial" in smc["licencia"]
    lim = int(M1["t"][-1])
    ok = c.post("/api/v1/indicadores/calcular", json=dict(limite_ms=lim, indicadores=[dict(instancia="a", id="ema", parametros=dict(periodo=9))]))
    assert ok.status_code == 200 and ok.json()["resultados"][0]["nombre"] == "EMA 9"
    assert c.post("/api/v1/indicadores/calcular", json=dict(limite_ms=lim, indicadores=[dict(instancia="a", id="ema", parametros=dict(periodo=0))])).status_code == 422
    assert c.post("/api/v1/indicadores/calcular", json=dict(limite_ms=lim, indicadores=[dict(instancia="a", id="ema", parametros=dict(x=1))])).status_code == 422
    assert c.post("/api/v1/indicadores/calcular", json=dict(limite_ms=lim, indicadores=[dict(instancia="a", id="nada", parametros={})])).status_code == 404
