"""Regenera el contrato publicado: python -m nexus_api.openapi  →  nexus_api/openapi.v1.json"""
import json
import os

from .app import crear_app
from .datos import ServicioDatos

if __name__ == "__main__":
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "openapi.v1.json")
    esquema = crear_app(ServicioDatos(m1_inyectado={})).openapi()
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(esquema, f, ensure_ascii=False, indent=1, sort_keys=True)
    print("escrito", ruta, len(esquema["paths"]), "rutas")
