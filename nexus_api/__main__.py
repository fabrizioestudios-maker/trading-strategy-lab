"""Arranca NEXUS: python -m nexus_api [--host 127.0.0.1] [--puerto 8800]"""
import argparse

import uvicorn

from .app import crear_app

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--puerto", type=int, default=8800)
    a = ap.parse_args()
    uvicorn.run(crear_app(), host=a.host, port=a.puerto, log_level="info")
