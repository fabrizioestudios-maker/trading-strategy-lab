"""
Cuentas de usuario de NEXUS: registro con correo y contraseña, ingreso con Google, sesiones y auditoría.

Seguridad:
- contraseñas con scrypt (sal aleatoria de 16 bytes, n = 2^14, r = 8, p = 1); nunca se guardan ni se registran en claro;
- la sesión es un token aleatorio de 256 bits en una cookie HttpOnly y SameSite=Lax (Secure con HTTPS); en la base solo
  queda su SHA-256, así que una copia de la base no sirve para entrar;
- Google: se verifica la firma, la audiencia (el client ID configurado) y que el correo esté verificado;
- intentos fallidos limitados por correo e IP (10 cada 15 minutos);
- los administradores son los correos de NEXUS_ADMIN_EMAILS o los que se promueven con
  `python -m nexus_api.usuarios admin <correo>`; no hay contraseñas por defecto.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import uuid

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_DB = os.environ.get("NEXUS_DB") or os.path.join(RAIZ, "registro", "nexus", "usuarios.sqlite")
COOKIE = "nexus_sesion"
DURACION_S = 30 * 86_400
MIN_CONTRASENA = 10
CORREO = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")
_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def hash_contrasena(c: str) -> str:
    sal = os.urandom(16)
    h = hashlib.scrypt(c.encode(), salt=sal, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(sal)}${_b64(h)}"


def verificar_contrasena(c: str, guardado: str | None) -> bool:
    if not guardado or not guardado.startswith("scrypt$"):
        # mismo trabajo aunque no haya cuenta: no se distingue por tiempo si el correo existe
        hashlib.scrypt(c.encode(), salt=b"0" * 16, **_SCRYPT)
        return False
    _, n, r, p, sal, h = guardado.split("$")
    calc = hashlib.scrypt(c.encode(), salt=base64.b64decode(sal), n=int(n), r=int(r), p=int(p), dklen=len(base64.b64decode(h)))
    return hmac.compare_digest(calc, base64.b64decode(h))


def _admins() -> set[str]:
    return {x.strip().lower() for x in os.environ.get("NEXUS_ADMIN_EMAILS", "").split(",") if x.strip()}


class ErrorAuth(Exception):
    def __init__(self, codigo: int, detalle: str):
        super().__init__(detalle)
        self.codigo, self.detalle = codigo, detalle


class Usuarios:
    def __init__(self, ruta: str = RUTA_DB):
        if ruta != ":memory:":
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
        self._c = sqlite3.connect(ruta, check_same_thread=False)
        self._c.row_factory = sqlite3.Row
        self._l = threading.Lock()
        self._fallos: dict[str, list[float]] = {}
        self.inicio = time.time()
        with self._l, self._c:
            self._c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS usuarios (
              id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, hash TEXT, google_sub TEXT UNIQUE,
              rol TEXT NOT NULL DEFAULT 'usuario', activo INTEGER NOT NULL DEFAULT 1, creado INTEGER NOT NULL, ultimo_acceso INTEGER);
            CREATE TABLE IF NOT EXISTS sesiones (
              token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, creada INTEGER NOT NULL, expira INTEGER NOT NULL, ip TEXT, agente TEXT);
            CREATE TABLE IF NOT EXISTS eventos (
              id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, usuario_id TEXT, tipo TEXT NOT NULL, detalle TEXT, ip TEXT);
            CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones(usuario_id);
            """)

    # ------------------------------------------------------------------ utilidades
    def _q(self, sql: str, args=()):
        with self._l, self._c:
            return self._c.execute(sql, args).fetchall()

    def evento(self, tipo: str, usuario_id: str | None = None, detalle: str | None = None, ip: str | None = None):
        self._q("INSERT INTO eventos (t, usuario_id, tipo, detalle, ip) VALUES (?,?,?,?,?)", (int(time.time() * 1000), usuario_id, tipo, (detalle or "")[:300], ip))

    @staticmethod
    def publico(u) -> dict:
        return dict(id=u["id"], email=u["email"], nombre=u["nombre"], rol=u["rol"], activo=bool(u["activo"]), google=bool(u["google_sub"]),
                    contrasena=bool(u["hash"]), creado_ms=u["creado"] * 1000, ultimo_acceso_ms=(u["ultimo_acceso"] or 0) * 1000 or None)

    def _por_email(self, email: str):
        r = self._q("SELECT * FROM usuarios WHERE email = ?", (email.lower(),))
        return r[0] if r else None

    def _limitar(self, clave: str):
        ahora = time.time()
        f = [x for x in self._fallos.get(clave, []) if ahora - x < 900]
        self._fallos[clave] = f
        if len(f) >= 10:
            raise ErrorAuth(429, "Demasiados intentos fallidos. Probá de nuevo en 15 minutos.")

    def _fallo(self, clave: str):
        self._fallos.setdefault(clave, []).append(time.time())

    def _rol_inicial(self, email: str) -> str:
        return "admin" if email.lower() in _admins() else "usuario"

    # ------------------------------------------------------------------ cuentas
    def registrar(self, email: str, nombre: str, contrasena: str, ip: str | None = None) -> dict:
        email = email.strip().lower()
        nombre = nombre.strip()[:80]
        if not CORREO.match(email):
            raise ErrorAuth(422, "Correo inválido")
        if not nombre:
            raise ErrorAuth(422, "Falta el nombre")
        if len(contrasena) < MIN_CONTRASENA:
            raise ErrorAuth(422, f"La contraseña necesita al menos {MIN_CONTRASENA} caracteres")
        if contrasena.lower() in (email, nombre.lower()):
            raise ErrorAuth(422, "La contraseña no puede ser tu correo ni tu nombre")
        if self._por_email(email):
            raise ErrorAuth(409, "Ya hay una cuenta con ese correo. Ingresá o usá Google.")
        uid = uuid.uuid4().hex
        self._q("INSERT INTO usuarios (id, email, nombre, hash, rol, creado) VALUES (?,?,?,?,?,?)",
                (uid, email, nombre, hash_contrasena(contrasena), self._rol_inicial(email), int(time.time())))
        self.evento("registro", uid, "correo", ip)
        return self.publico(self._por_email(email))

    def ingresar(self, email: str, contrasena: str, ip: str | None = None) -> dict:
        email = email.strip().lower()
        clave = f"{email}|{ip}"
        self._limitar(clave)
        u = self._por_email(email)
        if not verificar_contrasena(contrasena, u["hash"] if u else None) or not u["activo"]:
            self._fallo(clave)
            self.evento("ingreso_fallido", u["id"] if u else None, email if not u else None, ip)
            raise ErrorAuth(401, "Correo o contraseña incorrectos")
        self._fallos.pop(clave, None)
        self.evento("ingreso", u["id"], "correo", ip)
        return self.publico(u)

    def ingresar_google(self, datos: dict, ip: str | None = None) -> dict:
        """`datos`: claims ya verificados del ID token de Google (sub, email, email_verified, name)."""
        if not datos.get("email_verified"):
            raise ErrorAuth(401, "Google no confirmó el correo de esa cuenta")
        email, sub = str(datos["email"]).lower(), str(datos["sub"])
        r = self._q("SELECT * FROM usuarios WHERE google_sub = ?", (sub,))
        u = r[0] if r else self._por_email(email)
        if u is None:
            uid = uuid.uuid4().hex
            self._q("INSERT INTO usuarios (id, email, nombre, google_sub, rol, creado) VALUES (?,?,?,?,?,?)",
                    (uid, email, str(datos.get("name") or email.split("@")[0])[:80], sub, self._rol_inicial(email), int(time.time())))
            self.evento("registro", uid, "google", ip)
            u = self._por_email(email)
        elif not u["google_sub"]:
            self._q("UPDATE usuarios SET google_sub = ? WHERE id = ?", (sub, u["id"]))
            u = self._por_email(email)
        if not u["activo"]:
            raise ErrorAuth(403, "Esta cuenta está desactivada")
        self.evento("ingreso", u["id"], "google", ip)
        return self.publico(u)

    # ------------------------------------------------------------------ sesiones
    def crear_sesion(self, usuario_id: str, ip: str | None = None, agente: str | None = None) -> str:
        token = secrets.token_urlsafe(32)
        ahora = int(time.time())
        self._q("INSERT INTO sesiones VALUES (?,?,?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), usuario_id, ahora, ahora + DURACION_S, ip, (agente or "")[:200]))
        self._q("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?", (ahora, usuario_id))
        return token

    def de_sesion(self, token: str | None) -> dict | None:
        if not token or len(token) > 100:
            return None
        r = self._q("SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira > ? AND u.activo = 1",
                    (hashlib.sha256(token.encode()).hexdigest(), int(time.time())))
        return self.publico(r[0]) if r else None

    def cerrar_sesion(self, token: str | None):
        if token:
            self._q("DELETE FROM sesiones WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))

    # ------------------------------------------------------------------ administración
    def listar(self) -> list[dict]:
        return [self.publico(u) for u in self._q("SELECT * FROM usuarios ORDER BY creado DESC")]

    def cambiar(self, admin_id: str, usuario_id: str, rol: str | None = None, activo: bool | None = None, ip: str | None = None) -> dict:
        r = self._q("SELECT * FROM usuarios WHERE id = ?", (usuario_id,))
        if not r:
            raise KeyError(f"usuario {usuario_id}")
        if usuario_id == admin_id and (rol == "usuario" or activo is False):
            raise ErrorAuth(422, "No podés quitarte el rol de administrador ni desactivar tu propia cuenta")
        if rol is not None:
            if rol not in ("usuario", "admin"):
                raise ErrorAuth(422, "Rol inválido")
            self._q("UPDATE usuarios SET rol = ? WHERE id = ?", (rol, usuario_id))
            self.evento("cambio_rol", admin_id, f"{usuario_id} → {rol}", ip)
        if activo is not None:
            self._q("UPDATE usuarios SET activo = ? WHERE id = ?", (int(activo), usuario_id))
            if not activo:
                self._q("DELETE FROM sesiones WHERE usuario_id = ?", (usuario_id,))
            self.evento("cambio_estado", admin_id, f"{usuario_id} → {'activo' if activo else 'desactivado'}", ip)
        return self.publico(self._q("SELECT * FROM usuarios WHERE id = ?", (usuario_id,))[0])

    def eventos(self, limite: int = 200) -> list[dict]:
        filas = self._q("SELECT e.*, u.email FROM eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id ORDER BY e.id DESC LIMIT ?", (limite,))
        return [dict(t=f["t"], tipo=f["tipo"], email=f["email"], detalle=f["detalle"], ip=f["ip"]) for f in filas]

    def estadisticas(self) -> dict:
        ahora = int(time.time())
        uno = lambda sql, a=(): self._q(sql, a)[0][0]  # noqa: E731
        return dict(usuarios=uno("SELECT COUNT(*) FROM usuarios"), admins=uno("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'"),
                    activos_7d=uno("SELECT COUNT(*) FROM usuarios WHERE ultimo_acceso > ?", (ahora - 7 * 86400,)),
                    con_google=uno("SELECT COUNT(*) FROM usuarios WHERE google_sub IS NOT NULL"),
                    sesiones_vigentes=uno("SELECT COUNT(*) FROM sesiones WHERE expira > ?", (ahora,)),
                    registros_30d=uno("SELECT COUNT(*) FROM eventos WHERE tipo = 'registro' AND t > ?", ((ahora - 30 * 86400) * 1000,)),
                    ingresos_fallidos_24h=uno("SELECT COUNT(*) FROM eventos WHERE tipo = 'ingreso_fallido' AND t > ?", ((ahora - 86400) * 1000,)))

    def promover(self, email: str) -> bool:
        u = self._por_email(email)
        if not u:
            return False
        self._q("UPDATE usuarios SET rol = 'admin' WHERE id = ?", (u["id"],))
        self.evento("cambio_rol", None, f"{u['id']} → admin (consola)")
        return True


def verificar_google(credencial: str, client_id: str) -> dict:
    """Verifica el ID token de Google (firma, emisor, audiencia y vencimiento) con google-auth."""
    from google.auth.transport import requests as greq
    from google.oauth2 import id_token

    try:
        return id_token.verify_oauth2_token(credencial, greq.Request(), client_id)
    except ValueError as e:
        raise ErrorAuth(401, f"No se pudo verificar el ingreso con Google: {e}") from None


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "admin":
        print("listo: ahora es administrador" if Usuarios().promover(sys.argv[2]) else "no hay una cuenta con ese correo")
    else:
        print("uso: python -m nexus_api.usuarios admin <correo>")
