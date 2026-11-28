"""NEXUS · cuentas de usuario, sesiones, Google y panel de administración (base en memoria, Google simulado)."""
import pytest
from fastapi.testclient import TestClient

from nexus_api.app import crear_app
from nexus_api.datos import ServicioDatos
from nexus_api.usuarios import Usuarios

from _nexus_util import m1_sintetico

M1 = m1_sintetico(dias=10, semilla=3)


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("NEXUS_ADMIN_EMAILS", "jefa@nexus.test")
    u = Usuarios(":memory:")
    a = crear_app(ServicioDatos(m1_inyectado={"XAUUSD": M1}), login=True, usuarios=u, google_client_id="cliente-de-prueba")
    a.state.cuentas = u
    return a


def _cliente(app):
    return TestClient(app)


def test_sin_sesion_solo_lo_publico(app):
    c = _cliente(app)
    assert c.get("/api/v1/salud").status_code == 200
    assert c.get("/api/v1/auth/config").json()["login_requerido"] is True
    assert c.get("/api/v1/instrumentos").status_code == 401
    assert c.get("/api/v1/admin/resumen").status_code == 401


def test_registro_ingreso_y_salida(app):
    c = _cliente(app)
    r = c.post("/api/v1/auth/registro", json=dict(email="Ana@Ejemplo.com", nombre="Ana", contrasena="una-clave-larga"))
    assert r.status_code == 200 and r.json()["email"] == "ana@ejemplo.com" and r.json()["rol"] == "usuario"
    galleta = r.headers["set-cookie"].lower()
    assert "httponly" in galleta and "samesite=lax" in galleta
    assert c.get("/api/v1/instrumentos").status_code == 200
    assert c.get("/api/v1/admin/resumen").status_code == 403
    assert c.post("/api/v1/auth/salir", json={}).status_code == 200
    assert c.get("/api/v1/instrumentos").status_code == 401
    d = _cliente(app)
    assert d.post("/api/v1/auth/ingresar", json=dict(email="ana@ejemplo.com", contrasena="mal")).status_code == 401
    assert d.post("/api/v1/auth/ingresar", json=dict(email="ana@ejemplo.com", contrasena="una-clave-larga")).status_code == 200
    assert d.get("/api/v1/auth/yo").json()["nombre"] == "Ana"
    # la contraseña no queda en claro en la base
    filas = app.state.cuentas._q("SELECT hash FROM usuarios")
    assert all("una-clave-larga" not in f[0] and f[0].startswith("scrypt$") for f in filas)


def test_validaciones_y_limites(app):
    c = _cliente(app)
    assert c.post("/api/v1/auth/registro", json=dict(email="x@y.com", nombre="X", contrasena="corta")).status_code == 422
    assert c.post("/api/v1/auth/registro", json=dict(email="no-es-correo", nombre="X", contrasena="una-clave-larga")).status_code == 422
    assert c.post("/api/v1/auth/registro", json=dict(email="x@y.com", nombre="X", contrasena="una-clave-larga")).status_code == 200
    assert c.post("/api/v1/auth/registro", json=dict(email="X@y.com", nombre="X", contrasena="una-clave-larga")).status_code == 409
    d = _cliente(app)
    codigos = [d.post("/api/v1/auth/ingresar", json=dict(email="x@y.com", contrasena=f"mal-{i}")).status_code for i in range(11)]
    assert codigos[:10] == [401] * 10 and codigos[10] == 429
    assert d.post("/api/v1/auth/ingresar", content="email=x", headers={"content-type": "application/x-www-form-urlencoded"}).status_code == 415


def test_administracion(app):
    jefa = _cliente(app)
    assert jefa.post("/api/v1/auth/registro", json=dict(email="jefa@nexus.test", nombre="Jefa", contrasena="otra-clave-larga")).json()["rol"] == "admin"
    ana = _cliente(app)
    uid = ana.post("/api/v1/auth/registro", json=dict(email="ana@ejemplo.com", nombre="Ana", contrasena="una-clave-larga")).json()["id"]
    res = jefa.get("/api/v1/admin/resumen").json()
    assert res["usuarios"]["usuarios"] == 2 and res["configuracion"]["login"] is True and res["licencias"]
    assert {u["email"] for u in jefa.get("/api/v1/admin/usuarios").json()} == {"jefa@nexus.test", "ana@ejemplo.com"}
    assert jefa.patch(f"/api/v1/admin/usuarios/{uid}", json=dict(activo=False)).json()["activo"] is False
    assert ana.get("/api/v1/instrumentos").status_code == 401  # su sesión se cerró
    yo = jefa.get("/api/v1/auth/yo").json()["id"]
    assert jefa.patch(f"/api/v1/admin/usuarios/{yo}", json=dict(rol="usuario")).status_code == 422
    tipos = [e["tipo"] for e in jefa.get("/api/v1/admin/eventos").json()]
    assert "registro" in tipos and "cambio_estado" in tipos
    docs = jefa.get("/api/v1/admin/documentos").json()
    assert any(d["ruta"] == "README.md" for d in docs)
    assert jefa.get("/api/v1/admin/documento", params=dict(ruta="README.md")).json()["texto"]
    assert jefa.get("/api/v1/admin/documento", params=dict(ruta="../etc/passwd")).status_code == 404


def test_google(app):
    claims = dict(sub="g-123", email="Leo@Gmail.com", email_verified=True, name="Leo")
    app.state.verificar_google = lambda cred, cid: claims if cred == "token-valido" and cid == "cliente-de-prueba" else (_ for _ in ()).throw(ValueError("firma"))
    c = _cliente(app)
    r = c.post("/api/v1/auth/google", json=dict(credencial="token-valido"))
    assert r.status_code == 200 and r.json()["google"] is True and r.json()["email"] == "leo@gmail.com"
    assert c.get("/api/v1/instrumentos").status_code == 200
    claims["email_verified"] = False
    assert _cliente(app).post("/api/v1/auth/google", json=dict(credencial="token-valido")).status_code == 401


def test_sin_login_todo_es_local(monkeypatch):
    c = TestClient(crear_app(ServicioDatos(m1_inyectado={"XAUUSD": M1}), login=False, usuarios=Usuarios(":memory:")))
    assert c.get("/api/v1/auth/yo").json()["rol"] == "admin"
    assert c.get("/api/v1/admin/resumen").status_code == 200
    assert c.post("/api/v1/auth/registro", json=dict(email="a@b.com", nombre="A", contrasena="una-clave-larga")).status_code == 409
