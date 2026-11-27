"""
Tipos TypeScript de la interfaz generados desde el contrato OpenAPI de la API (una sola fuente de verdad):

    python -m nexus_api.tipos_ts      →  nexus_web/src/api/contrato.gen.ts

tests/test_nexus_api.py verifica que el archivo generado esté al día con el contrato.
"""
from __future__ import annotations

import json
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "nexus_web", "src", "api", "contrato.gen.ts")


def _nombre(ref: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", ref.split("/")[-1])


def _lit(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def _tipo(s: dict, sangria: str = "") -> str:
    if not s:
        return "unknown"
    if "$ref" in s:
        return _nombre(s["$ref"])
    if "anyOf" in s:
        return " | ".join(dict.fromkeys(_tipo(x, sangria) for x in s["anyOf"]))
    if "const" in s:
        return _lit(s["const"])
    if "enum" in s:
        return " | ".join(_lit(v) for v in s["enum"])
    t = s.get("type")
    if isinstance(t, list):
        return " | ".join(_tipo(dict(s, type=x), sangria) for x in t)
    if t == "null":
        return "null"
    if t in ("integer", "number"):
        return "number"
    if t == "string":
        return "string"
    if t == "boolean":
        return "boolean"
    if t == "array":
        return f"Array<{_tipo(s.get('items', {}), sangria)}>"
    if t == "object":
        if s.get("properties"):
            return "{\n" + _campos(s, sangria + "  ") + sangria + "}"
        ap = s.get("additionalProperties")
        if isinstance(ap, dict) and ap:
            return f"Record<string, {_tipo(ap, sangria)}>"
        return "Record<string, unknown>"
    return "unknown"


def _campos(s: dict, sangria: str) -> str:
    req = set(s.get("required", []))
    out = []
    for k, v in s.get("properties", {}).items():
        if v.get("description"):
            out.append(f"{sangria}/** {v['description']} */")
        out.append(f"{sangria}{k}{'' if k in req else '?'}: {_tipo(v, sangria)};")
    return "\n".join(out) + "\n"


def generar(esquema: dict) -> str:
    partes = ["// Generado por `python -m nexus_api.tipos_ts` desde el contrato OpenAPI. No editar a mano.",
              f"// Contrato: {esquema['info']['description'].split('.')[0]}. Versión de la API: {esquema['info']['version']}.", ""]
    for nombre, s in sorted(esquema["components"]["schemas"].items()):
        n = _nombre(nombre)
        if s.get("description"):
            partes.append("/** " + " ".join(s["description"].split()) + " */")
        if s.get("type") == "object" or "properties" in s:
            partes.append(f"export interface {n} {{\n{_campos(s, '  ')}}}\n")
        else:
            partes.append(f"export type {n} = {_tipo(s)};\n")
    return "\n".join(partes)


def esquema_actual() -> dict:
    from .app import crear_app
    from .datos import ServicioDatos
    return crear_app(ServicioDatos(m1_inyectado={})).openapi()


if __name__ == "__main__":
    os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
    with open(DESTINO, "w", encoding="utf-8") as f:
        f.write(generar(esquema_actual()))
    print("escrito", DESTINO)
