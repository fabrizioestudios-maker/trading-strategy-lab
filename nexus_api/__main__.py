"""
Arranca NEXUS: python -m nexus_api [--host 127.0.0.1] [--puerto 8800]

--sintetico   usa datos SINTÉTICOS de XAUUSD (paseo al azar) y guarda las corridas en una carpeta temporal. Sirve para
              las pruebas de punta a punta y para mostrar la interfaz sin data/. La interfaz lo avisa en todas las pantallas.
"""
import argparse
import tempfile

import uvicorn

from .app import crear_app

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--puerto", type=int, default=8800)
    ap.add_argument("--sintetico", action="store_true", help="datos sintéticos de prueba (no es mercado real)")
    ap.add_argument("--dias", type=int, default=680, help="días de datos sintéticos (680: 2025-01 a 2026-11, alcanza para la SMA 200 diaria)")
    a = ap.parse_args()
    if a.sintetico:
        from .datos import ServicioDatos
        from .sintetico import m1_sintetico
        from .trabajos import GestorTrabajos

        tmp = tempfile.mkdtemp(prefix="nexus-sintetico-")
        svc = ServicioDatos(carpeta=tmp, m1_inyectado={"XAUUSD": m1_sintetico(dias=a.dias, semilla=7, inicio="2025-01-05 23:00")})
        svc.sintetico = True
        app = crear_app(svc, GestorTrabajos(svc, carpeta=f"{tmp}/corridas"))
    else:
        app = crear_app()
    uvicorn.run(app, host=a.host, port=a.puerto, log_level="info")
