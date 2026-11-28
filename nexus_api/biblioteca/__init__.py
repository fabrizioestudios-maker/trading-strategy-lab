"""
Biblioteca de indicadores del gráfico de NEXUS (como la de una plataforma de gráficos): cada indicador tiene su
definición (nombre, categoría, parámetros, autor y licencia) y se calcula en la API solo con velas hasta el límite.
Los conceptos SMC/ICT vienen únicamente de su indicador (Smart Money Concepts [LuxAlgo]), no como capas sueltas.
"""
from __future__ import annotations

import numpy as np

from .base import Definicion
from . import clasicos, luxalgo_smc

CATALOGO: dict[str, Definicion] = {d.id: d for d in [*clasicos.DEFINICIONES, luxalgo_smc.DEFINICION]}
MAX_POR_PEDIDO = 20


def catalogo() -> list[dict]:
    return [d.publica() for d in CATALOGO.values()]


def parametros(d: Definicion, crudos: dict | None) -> dict:
    crudos = crudos or {}
    desconocidos = set(crudos) - {x.id for x in d.parametros}
    if desconocidos:
        raise ValueError(f"{d.nombre}: parámetros desconocidos {sorted(desconocidos)}")
    return {x.id: x.validar(crudos.get(x.id)) for x in d.parametros}


def calcular(svc, simbolo: str, tf: int, limite_ms: int, cantidad: int, pedidos: list[dict]) -> dict:
    if len(pedidos) > MAX_POR_PEDIDO:
        raise ValueError(f"Máximo {MAX_POR_PEDIDO} indicadores por pedido")
    preparados = []
    for x in pedidos:
        d = CATALOGO.get(x.get("id"))
        if d is None:
            raise KeyError(f"indicador {x.get('id')}")
        preparados.append((x.get("instancia") or d.id, d, parametros(d, x.get("parametros"))))
    calentamiento = max([d.calentamiento(p) for _, d, p in preparados] + [0])
    velas, _ = svc.velas_hasta(simbolo, tf, limite_ms, cantidad + calentamiento)
    vis = velas[-cantidad:]
    tiempos = [v["t"] for v in vis]
    resultados = []
    for inst, d, p in preparados:
        # los indicadores de estado (SMC) usan solo velas cerradas; los clásicos incluyen la vela en formación
        usar = [v for v in velas if not v["parcial"]] if d.id == "luxalgo_smc" else velas
        arr = {k: np.array([v[k] for v in usar], float) for k in ("o", "h", "l", "c")}
        arr["t"] = np.array([v["t"] for v in usar], np.int64)
        arr["desde_ms"] = tiempos[0] if tiempos else 0
        s = d.calcular(arr, p)
        # las series se recortan a las velas visibles (alineadas por tiempo)
        idx = {int(tt): k for k, tt in enumerate(arr["t"])}
        pos = [idx.get(int(tt)) for tt in tiempos]
        recorta = lambda vals: [None if k is None else vals[k] for k in pos]  # noqa: E731
        resultados.append(dict(
            instancia=inst, id=d.id, nombre=d.nombre_con(p), superpuesto=d.superpuesto, parametros=p,
            rango=list(d.rango) if d.rango else None, licencia=d.licencia,
            lineas=[{**ln, "valores": recorta(ln["valores"])} for ln in s.lineas],
            histogramas=[{**hg, "valores": recorta(hg["valores"]), "colores": recorta(hg["colores"]) if hg.get("colores") else None} for hg in s.histogramas],
            niveles=s.niveles, cajas=s.cajas, segmentos=s.segmentos, etiquetas=s.etiquetas,
            colores_velas=recorta(s.colores_velas) if s.colores_velas else None,
        ))
    return dict(simbolo=simbolo, temporalidad=tf, limite_ms=limite_ms, tiempos=tiempos, resultados=resultados)
