"""
Trabajos de investigación con estados reales y persistidos: enviado → en_cola → corriendo → terminado / fallido /
cancelado. Cada trabajo guarda su configuración inmutable, su huella, la procedencia (commit, huellas del código y de
los datos) y un registro de etapas con hora. No hay barras de progreso inventadas: solo etapas que ocurrieron.

Persistencia: un JSON por trabajo en `registro/nexus/corridas/`. Una configuración ya terminada con el mismo código y
los mismos datos no se vuelve a correr: se devuelve la existente (sin duplicar ni mutar resultados).
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor

from lab import registro as REG

from . import investigacion

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "registro", "nexus", "corridas")
CODIGO = ["lab/motor.py", "lab/datos.py", "lab/ejecucion.py", "lab/ficha.py", "lab/senales.py",
          "nexus_api/estrategias.py", "nexus_api/investigacion.py"]


def _ahora() -> int:
    return int(time.time() * 1000)


def huella_config(cfg: dict) -> str:
    return hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:16]


def procedencia(svc) -> dict:
    cod = {a: REG.sha256(os.path.join(RAIZ, a)) for a in CODIGO if os.path.exists(os.path.join(RAIZ, a))}
    datos = next((i.get("huella_sha256") for i in svc.instrumentos() if i["simbolo"] == "XAUUSD"), None)
    return dict(commit=REG.commit(), codigo=cod, datos_xauusd_sha256=datos,
                huella_codigo=hashlib.sha256(json.dumps(cod, sort_keys=True).encode()).hexdigest()[:16])


def _resumen(tr: dict) -> dict | None:
    res = tr.get("resultado")
    if not res or not res.get("metricas", {}).get("total"):
        return None
    m = {x["clave"]: x for x in res["metricas"]["total"]}
    e = m.get("expectancy", {})
    return dict(n=e.get("n"), expectativa=e.get("valor"), ic_lo=m.get("ic_lo", {}).get("valor"), ic_hi=m.get("ic_hi", {}).get("valor"),
                acierto=m.get("wr", {}).get("valor"), periodo=e.get("periodo"), perfil_costos=e.get("perfil_costos"))


class GestorTrabajos:
    def __init__(self, svc, carpeta: str = CARPETA, ejecutor: ThreadPoolExecutor | None = None):
        self.svc = svc
        self.carpeta = carpeta
        os.makedirs(carpeta, exist_ok=True)
        self._pool = ejecutor or ThreadPoolExecutor(max_workers=1, thread_name_prefix="nexus-trabajo")
        self._lock = threading.Lock()
        self._cancelar: set[str] = set()
        self._trabajos: dict[str, dict] = {}
        for f in sorted(os.listdir(carpeta)):
            if f.endswith(".json"):
                try:
                    tr = json.load(open(os.path.join(carpeta, f), encoding="utf-8"))
                    if tr["estado"] in ("enviado", "en_cola", "corriendo"):
                        tr["estado"], tr["error"] = "fallido", "El servidor se reinició mientras corría: se puede volver a enviar."
                    self._trabajos[tr["id"]] = tr
                except Exception:  # un archivo roto no tumba el servidor
                    continue

    # ------------------------------------------------------------------ estado
    def _guardar(self, tr: dict):
        tr["actualizado_ms"] = _ahora()
        tmp = os.path.join(self.carpeta, tr["id"] + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(tr, f, ensure_ascii=False)
        os.replace(tmp, os.path.join(self.carpeta, tr["id"] + ".json"))

    def _evento(self, tr: dict, texto: str, etapa: str | None = None):
        tr["registro"].append(dict(t=_ahora(), texto=texto))
        if etapa is not None:
            tr["etapa"] = etapa
        self._guardar(tr)

    def listar(self) -> list[dict]:
        """Listado liviano: sin el resultado completo, con las métricas clave de la muestra total."""
        return sorted((dict(t, resultado=None, resumen=_resumen(t)) for t in self._trabajos.values()), key=lambda t: -t["creado_ms"])

    def obtener(self, id: str) -> dict | None:
        return self._trabajos.get(id)

    # ------------------------------------------------------------------ ciclo de vida
    def enviar(self, cfg: dict) -> dict:
        proc = procedencia(self.svc)
        huella = huella_config(dict(cfg, _codigo=proc["huella_codigo"], _datos=proc["datos_xauusd_sha256"]))
        with self._lock:
            for t in self._trabajos.values():
                if t["huella_config"] == huella and t["estado"] in ("terminado", "corriendo", "en_cola", "enviado"):
                    return t  # misma configuración, mismo código y mismos datos: no se duplica
            tr = dict(contrato="nexus.v1", id=time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6], tipo="investigacion",
                      estado="enviado", config=cfg, huella_config=huella, creado_ms=_ahora(), actualizado_ms=_ahora(),
                      etapa=None, registro=[], procedencia=proc, resultado=None, error=None)
            self._trabajos[tr["id"]] = tr
            self._evento(tr, "Trabajo recibido con su configuración inmutable")
            tr["estado"] = "en_cola"
            self._evento(tr, "En cola (un trabajo a la vez)")
        self._pool.submit(self._correr, tr["id"])
        return tr

    def cancelar(self, id: str) -> dict | None:
        tr = self._trabajos.get(id)
        if not tr:
            return None
        if tr["estado"] in ("enviado", "en_cola"):
            tr["estado"] = "cancelado"
            self._evento(tr, "Cancelado antes de empezar")
        elif tr["estado"] == "corriendo":
            self._cancelar.add(id)
            self._evento(tr, "Cancelación pedida: se detiene al terminar la etapa actual")
        return tr

    def _correr(self, id: str):
        tr = self._trabajos[id]
        if tr["estado"] == "cancelado":
            return
        tr["estado"] = "corriendo"
        self._evento(tr, "Empezó a correr")
        try:
            res = investigacion.correr(self.svc, tr["config"], etapa=lambda e: self._evento(tr, e, etapa=e),
                                       cancelado=lambda: id in self._cancelar)
            if id in self._cancelar:
                tr["estado"] = "cancelado"
                self._evento(tr, "Cancelado: no se guardaron resultados parciales")
                return
            tr["resultado"] = res
            tr["estado"] = "terminado"
            self._evento(tr, "Terminado", etapa=None)
        except Exception as e:  # el error queda registrado con su causa, sin secretos
            tr["estado"] = "fallido"
            tr["error"] = f"{type(e).__name__}: {e}"
            tr["registro"].append(dict(t=_ahora(), texto="Falló", detalle=traceback.format_exc(limit=3)[-1500:]))
            self._guardar(tr)
        finally:
            self._cancelar.discard(id)
