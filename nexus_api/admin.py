"""Panel de administración: un resumen de todo el proyecto (cuentas, datos, laboratorio, probador, sistema, licencias)."""
from __future__ import annotations

import glob
import os
import platform
import shutil
import sys
import time

from . import VERSION, biblioteca

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCUMENTOS = ["README.md", "BITACORA.md", "docs/*.md", "NEXUS/*.md", "nexus_web/README.md", "nexus_api/biblioteca/LICENCIA_LUXALGO.md"]


def _memoria_mb() -> float | None:
    try:
        with open("/proc/self/status", encoding="utf-8") as f:
            for linea in f:
                if linea.startswith("VmRSS:"):
                    return round(int(linea.split()[1]) / 1024, 1)
    except OSError:
        return None
    return None


def documentos() -> list[dict]:
    out = []
    for patron in DOCUMENTOS:
        for ruta in sorted(glob.glob(os.path.join(RAIZ, patron))):
            rel = os.path.relpath(ruta, RAIZ)
            with open(ruta, encoding="utf-8", errors="replace") as f:
                primera = next((x.strip("# \n") for x in f if x.strip()), rel)
            st = os.stat(ruta)
            out.append(dict(ruta=rel, titulo=primera[:120], bytes=st.st_size, modificado_ms=int(st.st_mtime * 1000)))
    return out


def documento(ruta: str) -> dict:
    """Solo documentos de la lista (nada de rutas arbitrarias)."""
    permitidos = {d["ruta"]: d for d in documentos()}
    if ruta not in permitidos:
        raise KeyError(f"documento {ruta}")
    with open(os.path.join(RAIZ, ruta), encoding="utf-8", errors="replace") as f:
        texto = f.read(2_000_000)
    return dict(permitidos[ruta], texto=texto)


def resumen(svc, gestor, usuarios, procedencia: dict, login: bool, google_id: str | None, inicio: float) -> dict:
    inst = svc.instrumentos()
    datos_dir = os.path.join(RAIZ, "data")
    tam = sum(os.path.getsize(p) for p in glob.glob(os.path.join(datos_dir, "*.npz"))) if os.path.isdir(datos_dir) else 0
    trabajos = gestor.listar()
    por_estado: dict[str, int] = {}
    for t in trabajos:
        por_estado[t["estado"]] = por_estado.get(t["estado"], 0) + 1
    from . import probador

    registros = glob.glob(os.path.join(probador.CARPETA, "*.jsonl"))
    pruebas = 0
    for r in registros:
        with open(r, encoding="utf-8") as f:
            pruebas += sum(1 for x in f if x.strip())
    disco = shutil.disk_usage(RAIZ)
    bit = os.path.join(RAIZ, "BITACORA.md")
    entradas = 0
    if os.path.exists(bit):
        with open(bit, encoding="utf-8") as f:
            entradas = sum(1 for x in f if x.startswith("## "))
    return dict(
        version=VERSION, commit=procedencia.get("commit"), python=sys.version.split()[0], plataforma=platform.platform(terse=True),
        activo_desde_ms=int(inicio * 1000),
        configuracion=dict(login=login, google=bool(google_id), admins_configurados=len([x for x in os.environ.get("NEXUS_ADMIN_EMAILS", "").split(",") if x.strip()]),
                           cookie_segura=os.environ.get("NEXUS_COOKIE_SEGURA") == "1", datos_sinteticos=bool(svc.sintetico)),
        usuarios=usuarios.estadisticas() if usuarios else dict(usuarios=0),
        datos=dict(instrumentos=len(inst), con_datos=sum(1 for i in inst if i["disponible"]), velas_m1=sum(i.get("velas_m1") or 0 for i in inst),
                   tamano_mb=round(tam / 2**20, 1), hasta=max((i.get("cobertura_hasta") or "" for i in inst), default="")),
        laboratorio=dict(corridas=len(trabajos), **{f"corridas_{k}": v for k, v in por_estado.items()}, entradas_bitacora=entradas,
                         experimentos=len(glob.glob(os.path.join(RAIZ, "resultados", "E*"))), indicadores=len(biblioteca.CATALOGO)),
        probador=dict(pruebas=pruebas, usuarios_que_probaron=len(registros)),
        sistema=dict(memoria_mb=_memoria_mb(), cpus=os.cpu_count(), disco_libre_gb=round(disco.free / 2**30, 1), disco_total_gb=round(disco.total / 2**30, 1),
                     segundos_activo=int(time.time() - inicio)),
        licencias=[
            dict(nombre="Smart Money Concepts [LuxAlgo]", licencia="CC BY-NC-SA 4.0", nota="Uso no comercial. Para un servicio pago hace falta licencia de LuxAlgo o quitar el indicador."),
            dict(nombre="TradingView Lightweight Charts", licencia="Apache 2.0", nota="Atribución visible debajo de los gráficos."),
            dict(nombre="Datos HistData / Dukascopy", licencia="Términos del proveedor", nota="Ver data/README.md antes de redistribuir datos."),
        ],
    )
