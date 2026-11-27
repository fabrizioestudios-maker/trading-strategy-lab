"""
NEXUS · API: contratos, errores honestos, riesgo y trabajos con estados reales. Datos sintéticos, sin red.
"""
import json
import os
import time

import numpy as np
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


def test_tipos_typescript_al_dia_con_el_contrato(cliente):
    from nexus_api import tipos_ts

    generado = tipos_ts.generar(cliente.get("/openapi.json").json())
    guardado = open(tipos_ts.DESTINO, encoding="utf-8").read()
    assert generado == guardado, "los tipos de la interfaz quedaron viejos: python -m nexus_api.tipos_ts"


def test_resumen_contexto_y_referencias_tipados(cliente):
    r = cliente.get("/api/v1/resumen").json()
    assert r["modo"] == "histórico" and r["ultimo_minuto"]["t"] == int(M1["t"][-1])
    assert r["sesion_del_ultimo_minuto"] in ("Asia", "Londres", "Nueva York", "Cierre", "Reapertura", "Fin de semana", "Fuera de sesión") \
        or isinstance(r["sesion_del_ultimo_minuto"], str)
    assert r["candidata"]["nivel"] == "B" and r["candidata"]["ejecutable"]
    ctx = cliente.get("/api/v1/investigacion/contexto").json()
    assert all(f["experimento"].upper() != "TOTAL" for f in ctx["presupuesto_pruebas"])
    assert ctx["total_configuraciones"]  # la fila TOTAL del registro, tal cual
    ref = cliente.get("/api/v1/referencias").json()
    assert [p["clave"] for p in ref["perfiles_costos"]][:2] == ["costos_md", "sin_costos"]
    assert {s["nombre"] for s in ref["sesiones"]} == {"Asia", "Londres", "Nueva York", "Cierre", "Reapertura"}
    assert {e["clave"] for e in ref["estados_orden"]} == {"posterior_al_limite", "esperando_llenado", "rechazada", "abierta", "cerrada"}
    assert ref["temporalidades"] == [1, 5, 15, 60, 240, 1440]


def test_listado_de_trabajos_es_liviano_y_trae_resumen(cliente):
    tr = cliente.post("/api/v1/trabajos", json=dict(estrategia="e022", perfil_costos="optimista")).json()
    for _ in range(300):
        if cliente.get(f"/api/v1/trabajos/{tr['id']}").json()["estado"] in ("terminado", "fallido"):
            break
        time.sleep(0.05)
    fila = next(t for t in cliente.get("/api/v1/trabajos").json() if t["id"] == tr["id"])
    assert fila["resultado"] is None
    completo = cliente.get(f"/api/v1/trabajos/{tr['id']}").json()
    if completo["estado"] == "terminado" and completo["resultado"]["metricas"]["total"][0]["n"]:
        assert fila["resumen"]["perfil_costos"] == "optimista" and fila["resumen"]["n"] == completo["resultado"]["metricas"]["total"][0]["n"]


def test_robustez_de_la_corrida_usa_el_laboratorio_y_no_inventa():
    import pandas as pd

    from lab import montecarlo as MC
    from nexus_api import robustez as ROB

    rng = np.random.default_rng(3)
    t = np.sort(rng.integers(1_330_000_000_000, 1_790_000_000_000, 160))
    ops = pd.DataFrame(dict(t=t, t_salida=t + 86_400_000, dir=1, entrada=2000.0, salida=2001.0, sl=1990.0, motivo=1, r=rng.normal(0.2, 1.4, 160)))
    cfg = dict(eleccion_desde="2011-11-15", confirmacion_desde="2021-11-15", confirmacion_hasta="2026-11-14")
    pl = ROB.pliegues(ops, ops.r.values, 2011, 2026, ROB.WF.ms(cfg["confirmacion_desde"]))
    assert len(pl) == 15 and sum(p["n"] for p in pl) == int(((t >= ROB.WF.ms("2011-11-15")) & (t < ROB.WF.ms("2026-11-15"))).sum())
    assert all(p["muestra"] == ("confirmacion" if p["desde"] >= "2021-11-15" else "eleccion") for p in pl)
    filas, sug = ROB.montecarlo(ops.r.values, 15.0)
    ref = MC.tabla_riesgo(ops.r.values, 160 / 15.0, anios=5, riesgos=ROB.RIESGOS, n_sim=5000, bloque=5, semilla=0)
    assert [f["p_dd_20"] for f in filas] == [round(float(x), 4) for x in ref.p_dd_20]  # mismos números que el laboratorio
    assert ROB.montecarlo(ops.r.values[:5], 15.0) == ([], None)  # con muy pocas operaciones no se calcula
    _ = cfg
