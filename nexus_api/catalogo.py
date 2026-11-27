"""
Catálogo de estrategias e hipótesis para el Strategy Lab, con su fuente. No reinterpreta resultados: los estados salen
de la bitácora, de docs/fichas.md y del registro de experimentos (`registro/experimentos/*.json`).
"""
from __future__ import annotations

import csv
import json
import os

from . import estrategias as E022

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Estrategias documentadas que no se pueden correr todavía desde NEXUS (se muestran con su estado real).
OTRAS = [
    dict(id="ict5", version="E025", nombre="ICT setup 5 en oro 15M", nivel="A",
         nivel_texto="Exploratoria: en la historia limpia 2010–2021 dio +0,035 R (p 0,36). No pasó.",
         hipotesis="Sesgo de estructura de 4H, barrido interno y FVG en la killzone de Nueva York.",
         temporalidad="15M con sesgo de 4H", fuentes=["docs/fichas.md", "BITACORA.md entrada 30", "E038"]),
    dict(id="smc_oro", version="E024", nombre="SMC mejor en oro 4H–15M", nivel="R",
         nivel_texto="Rechazada en su historia limpia: 613 operaciones, 33,9 %, −0,027 R (E038).",
         hipotesis="Barrido de liquidez → cambio de estructura → entrada en zona de descuento.",
         temporalidad="15M con estructura de 4H", fuentes=["docs/fichas.md", "E023/E024", "E038"]),
    dict(id="e009", version="E009", nombre="Tendencia 200, solo compras, 6 ATR", nivel="A",
         nivel_texto="Exploratoria: es beta; no operable en CFD por los swaps (−0,35 R conservador).",
         hipotesis="Seguir la tendencia larga con stops amplios.", temporalidad="D1",
         fuentes=["docs/fichas.md", "E009", "E030"]),
]


def estrategias() -> list[dict]:
    out = [E022.definicion()]
    for o in OTRAS:
        out.append(dict(o, parametros=[], reglas=[], evidencia=[], limitaciones=["No se puede correr desde NEXUS todavía."], ejecutable=False))
    return out


def _estado(corrida: dict) -> str:
    crit = corrida.get("criterios")
    if isinstance(crit, dict) and crit:
        vals = [v for v in crit.values() if isinstance(v, bool)]
        if vals:
            return "pasa" if all(vals) else "falla"
    return "informativo"


def hipotesis() -> list[dict]:
    carpeta = os.path.join(RAIZ, "registro", "experimentos")
    out = []
    if os.path.isdir(carpeta):
        for f in sorted(os.listdir(carpeta)):
            if not f.endswith(".json"):
                continue
            try:
                d = json.load(open(os.path.join(carpeta, f), encoding="utf-8"))
            except Exception:
                continue
            c = (d.get("corridas") or [{}])[-1]
            out.append(dict(id=d.get("id", f[:-5]), titulo=str(c.get("hipotesis") or d.get("id")), fecha=c.get("fecha_utc"),
                            estado=_estado(c), resumen=f"Universo: {c.get('universo', '—')}. Commit {str(c.get('commit') or '')[:7]}.",
                            fuente=f"registro/experimentos/{f}"))
    return out


def presupuesto_pruebas() -> list[dict]:
    ruta = os.path.join(RAIZ, "registro", "presupuesto_pruebas.csv")
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def pruebas_a_futuro() -> list[dict]:
    carpeta = os.path.join(RAIZ, "registro", "forward")
    out = []
    for f in ("F001.json", "F002.json"):
        ruta = os.path.join(carpeta, f)
        if not os.path.exists(ruta):
            continue
        d = json.load(open(ruta, encoding="utf-8"))
        estado_ruta = os.path.join(carpeta, f.replace(".json", "_estado.json"))
        estado = json.load(open(estado_ruta, encoding="utf-8")) if os.path.exists(estado_ruta) else None
        out.append(dict(id=d.get("id"), sellado_utc=d.get("sellado_utc"), inicio_utc=d.get("inicio_utc"),
                        decision=d.get("decision"), variantes=d.get("variantes") or d.get("estrategias"),
                        estado=estado, fuente=f"registro/forward/{f}"))
    return out
