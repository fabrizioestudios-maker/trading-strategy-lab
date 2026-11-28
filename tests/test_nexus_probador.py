"""
NEXUS · probador de estrategias (reglas con indicadores clásicos). Datos sintéticos.

1. Sin futuro: el resultado no cambia si se truncan los datos en el final del período.
2. Ejecución como el laboratorio: stop a k·ATR, objetivo a RR veces el stop, salidas en TP/SL con su R.
3. Las pruebas se cuentan una vez por configuración (Deflated Sharpe) y por usuario.
4. Validación de pedidos: sin condiciones o con el indicador SMC en reglas → 422.
"""
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from nexus_api import probador as P
from nexus_api.app import crear_app
from nexus_api.datos import ServicioDatos

from _nexus_util import m1_sintetico, truncar

M1 = m1_sintetico(dias=60, semilla=9)
FECHA = lambda ms: pd.Timestamp(int(ms), unit="ms", tz="UTC").strftime("%Y-%m-%d")  # noqa: E731
DESDE, HASTA = FECHA(M1["t"][0] + 12 * 86_400_000), FECHA(M1["t"][-1] - 86_400_000)
REGLA = dict(simbolo="XAUUSD", tf=15, desde=DESDE, hasta=HASTA, fraccion_validacion=0.3, sl_atr=1.5, rr=2.0, perfil_costos="sin_costos",
             compra=[dict(izq=dict(tipo="indicador", id="ema", parametros=dict(periodo=10)), op="cruza_arriba", der=dict(tipo="indicador", id="ema", parametros=dict(periodo=30)))],
             venta=[dict(izq=dict(tipo="indicador", id="ema", parametros=dict(periodo=10)), op="cruza_abajo", der=dict(tipo="indicador", id="ema", parametros=dict(periodo=30)))])


@pytest.fixture(autouse=True)
def carpeta(tmp_path, monkeypatch):
    monkeypatch.setattr(P, "CARPETA", str(tmp_path))


def _sin_tiempo(r):
    return {k: v for k, v in r.items() if k != "segundos"}


def test_sin_futuro():
    a = P.correr(ServicioDatos(m1_inyectado={"XAUUSD": M1}), REGLA, "u1")
    j = int(np.searchsorted(M1["t"], pd.Timestamp(HASTA, tz="UTC").value // 10**6)) - 1
    b = P.correr(ServicioDatos(m1_inyectado={"XAUUSD": truncar(M1, j)}), REGLA, "u2")
    assert _sin_tiempo(a) | {"pruebas": None} == _sin_tiempo(b) | {"pruebas": None}
    fin = pd.Timestamp(HASTA, tz="UTC").value // 10**6
    assert all(o["salida_ms"] < fin for o in a["operaciones"])


def test_ejecucion_como_el_laboratorio():
    r = P.correr(ServicioDatos(m1_inyectado={"XAUUSD": M1}), REGLA, "u")
    ops = r["operaciones"]
    assert len(ops) > 10
    for o in ops:
        d = 1 if o["lado"] == "compra" else -1
        dist = (o["precio_entrada"] - o["sl"]) * d
        assert dist > 0
        assert abs((o["tp"] - o["precio_entrada"]) * d - 2.0 * dist) < 1e-6 * max(1, abs(o["tp"]))
        if o["motivo"] == "TP":
            assert abs(o["r"] - 2.0) < 1e-3  # sin costos
        if o["motivo"] == "SL":
            assert o["r"] <= -1 + 1e-3
        assert o["salida_ms"] >= o["entrada_ms"]
    # una operación a la vez
    pares = sorted((o["entrada_ms"], o["salida_ms"]) for o in ops)
    assert all(b[0] > a[1] for a, b in zip(pares, pares[1:]))
    assert {m["clave"] for m in r["metricas"]["validacion"]} >= {"n", "expectancy", "ic_lo"}
    assert r["azar"]["simulaciones"] > 0 and len(r["criterios"]) == 6


def test_las_pruebas_se_cuentan_por_configuracion_y_usuario():
    svc = ServicioDatos(m1_inyectado={"XAUUSD": M1})
    assert P.correr(svc, REGLA, "ana")["pruebas"]["acumuladas"] == 1
    assert P.correr(svc, REGLA, "ana")["pruebas"]["acumuladas"] == 1
    otra = dict(REGLA, rr=3.0)
    assert P.correr(svc, otra, "ana")["pruebas"]["acumuladas"] == 2
    assert P.correr(svc, REGLA, "beto")["pruebas"]["acumuladas"] == 1


def test_pedidos_invalidos():
    c = TestClient(crear_app(ServicioDatos(m1_inyectado={"XAUUSD": M1})))
    assert c.post("/api/v1/probador/correr", json=dict(REGLA, compra=[], venta=[])).status_code == 422
    smc = dict(REGLA, compra=[dict(izq=dict(tipo="indicador", id="luxalgo_smc"), op="mayor", der=dict(tipo="valor", valor=0))], venta=[])
    assert c.post("/api/v1/probador/correr", json=smc).status_code == 422
    assert c.post("/api/v1/probador/correr", json=dict(REGLA, tf=7)).status_code == 422
    ok = c.post("/api/v1/probador/correr", json=REGLA)
    assert ok.status_code == 200 and ok.json()["metricas"]["total"][0]["clave"] == "n"
