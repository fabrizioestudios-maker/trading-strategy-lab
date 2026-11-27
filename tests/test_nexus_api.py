"""
NEXUS · API: contratos, errores honestos, riesgo y trabajos con estados reales. Datos sintéticos, sin red.
"""
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

from nexus_api import riesgo
from nexus_api.app import crear_app
from nexus_api.datos import ServicioDatos
from nexus_api.trabajos import GestorTrabajos

from _nexus_util import m1_sintetico

M1 = m1_sintetico(dias=30, semilla=5)


@pytest.fixture()
def cliente(tmp_path):
    svc = ServicioDatos(carpeta=str(tmp_path), m1_inyectado={"XAUUSD": M1})
    return TestClient(crear_app(svc, GestorTrabajos(svc, carpeta=str(tmp_path / "corridas"))))


def test_salud_e_instrumentos(cliente):
    s = cliente.get("/api/v1/salud").json()
    assert s["contrato"] == "nexus.v1" and "XAUUSD" in s["datos"]["instrumentos_disponibles"]
    ins = {i["simbolo"]: i for i in cliente.get("/api/v1/instrumentos").json()}
    assert ins["XAUUSD"]["disponible"] and ins["XAUUSD"]["tamano_contrato"] == 100
    assert not ins["EURUSD"]["disponible"]  # en esta carpeta temporal no hay datos: no se inventan


def test_cuadro_de_replay(cliente):
    ini = cliente.get("/api/v1/replay/inicio").json()
    r = cliente.get("/api/v1/replay/cuadro", params=dict(tf=15, limite_ms=ini["limite_ms"], cantidad=50))
    assert r.status_code == 200
    c = r.json()
    assert c["contrato"] == "nexus.v1" and len(c["velas"]) == 50
    assert all(v["t"] <= c["limite"]["limite_ms"] for v in c["velas"])
    assert all(s["desde_ms"] <= c["limite"]["limite_ms"] for s in c["sesiones"])
    assert c["limite"]["limite_ny"].endswith("NY")
    assert c["decision"]["decision"] in ("compra", "venta", "espera", "sin_datos")


def test_errores_honestos(cliente):
    lim = int(M1["t"][-1])
    assert cliente.get("/api/v1/replay/cuadro", params=dict(tf=7, limite_ms=lim)).status_code == 422
    assert cliente.get("/api/v1/replay/paso", params=dict(tf=15, limite_ms=lim, unidad="horas")).status_code == 422
    r = cliente.get("/api/v1/replay/cuadro", params=dict(simbolo="EURUSD", tf=15, limite_ms=lim))
    assert r.status_code == 503 and r.json()["error"] == "datos_no_disponibles"
    assert "/home/" not in r.json()["detalle"]  # sin rutas absolutas del servidor
    assert cliente.get("/api/v1/replay/cuadro", params=dict(simbolo="ZZZ", tf=15, limite_ms=lim)).status_code == 404


def test_riesgo_redondea_hacia_abajo_y_cobra_costos():
    r = riesgo.calcular("XAUUSD", 10000, 1, 4000, 3995, 4010)
    assert r["lado"] == "compra" and r["riesgo_moneda"] == 100 and r["lotes"] == pytest.approx(0.2)
    assert r["costo_ida_vuelta_moneda"] == pytest.approx(10.0)  # 0,0125 % × 4000 = 0,50 USD por onza × 100 × 0,2
    assert r["costo_en_r"] == pytest.approx(0.1) and r["rr"] == 2.0 and r["ganancia_objetivo_moneda"] == pytest.approx(200)
    r2 = riesgo.calcular("XAUUSD", 10000, 1, 4000, 3993)  # 100 / (7 × 100) = 0,1428… → 0,14
    assert r2["lotes"] == pytest.approx(0.14) and r2["riesgo_real_moneda"] <= 100
    assert riesgo.calcular("XAUUSD", 100, 0.5, 4000, 3990)["avisos"]  # no alcanza para 0,01 lote
    with pytest.raises(ValueError):
        riesgo.calcular("XAUUSD", 10000, 1, 4000, 4000)
    with pytest.raises(ValueError):
        riesgo.calcular("XAUUSD", 10000, 1, 4000, 3990, 3980)


def test_riesgo_por_api_valida_entradas(cliente):
    assert cliente.post("/api/v1/riesgo", json=dict(capital=10000, riesgo_pct=1, entrada=4000, stop=3995)).status_code == 200
    assert cliente.post("/api/v1/riesgo", json=dict(capital=-5, riesgo_pct=1, entrada=4000, stop=3995)).status_code == 422
    assert cliente.post("/api/v1/riesgo", json=dict(capital=1000, riesgo_pct=50, entrada=4000, stop=3995)).status_code == 422


def _esperar(c, id, estados, s=10):
    fin = time.time() + s
    while time.time() < fin:
        tr = c.get(f"/api/v1/trabajos/{id}").json()
        if tr["estado"] in estados:
            return tr
        time.sleep(0.05)
    raise AssertionError(f"el trabajo no llegó a {estados}: {tr['estado']}")


def test_trabajo_con_estados_reales_y_sin_duplicar(cliente, monkeypatch):
    from nexus_api import investigacion

    def falso(svc, cfg, etapa, cancelado):
        etapa("Etapa única de prueba")
        return dict(metricas={}, por_anio=[], sensibilidad_costos=[], operaciones=[], avisos=["prueba"])

    monkeypatch.setattr(investigacion, "correr", falso)
    tr = cliente.post("/api/v1/trabajos", json=dict(estrategia="e022")).json()
    assert tr["estado"] in ("en_cola", "corriendo", "terminado")
    fin = _esperar(cliente, tr["id"], ("terminado",))
    textos = [e["texto"] for e in fin["registro"]]
    assert textos[0].startswith("Trabajo recibido") and "Etapa única de prueba" in textos and textos[-1] == "Terminado"
    otra = cliente.post("/api/v1/trabajos", json=dict(estrategia="e022")).json()
    assert otra["id"] == tr["id"]  # misma configuración, código y datos: no se duplica
    distinta = cliente.post("/api/v1/trabajos", json=dict(estrategia="e022", perfil_costos="conservador")).json()
    assert distinta["id"] != tr["id"]
    _esperar(cliente, distinta["id"], ("terminado",))


def test_trabajo_fallido_queda_registrado(cliente, monkeypatch):
    from nexus_api import investigacion

    def rompe(svc, cfg, etapa, cancelado):
        raise RuntimeError("falla de prueba")

    monkeypatch.setattr(investigacion, "correr", rompe)
    tr = cliente.post("/api/v1/trabajos", json=dict(estrategia="e022", perfil_costos="estres")).json()
    fin = _esperar(cliente, tr["id"], ("fallido",))
    assert "falla de prueba" in fin["error"]


def test_trabajos_interrumpidos_quedan_fallidos_al_reiniciar(tmp_path):
    carpeta = tmp_path / "corridas"
    carpeta.mkdir()
    (carpeta / "x.json").write_text(json.dumps(dict(id="x", estado="corriendo", creado_ms=1, registro=[], huella_config="h")))
    g = GestorTrabajos(ServicioDatos(carpeta=str(tmp_path), m1_inyectado={"XAUUSD": M1}), carpeta=str(carpeta))
    assert g.obtener("x")["estado"] == "fallido"


def test_contrato_openapi_sin_cambios_silenciosos(cliente):
    ruta = os.path.join(os.path.dirname(os.path.dirname(__file__)), "nexus_api", "openapi.v1.json")
    actual = cliente.get("/openapi.json").json()
    guardado = json.load(open(ruta, encoding="utf-8"))
    assert sorted(actual["paths"]) == sorted(guardado["paths"]), "cambió una ruta: regenerar con python -m nexus_api.openapi"
    assert sorted(actual["components"]["schemas"]) == sorted(guardado["components"]["schemas"])
    for nombre, esquema in guardado["components"]["schemas"].items():
        assert sorted(actual["components"]["schemas"][nombre].get("properties", {})) == sorted(esquema.get("properties", {})), nombre
