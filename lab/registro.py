"""
Registro de experimentos reproducible (fase 4; prompt maestro, sección 12).

registrar() escribe registro/experimentos/<id>.json con la hipótesis, el universo, los datos, el período, los
parámetros, la cantidad de variantes, el protocolo, los resultados, el benchmark, los costos, el estado y las
limitaciones, más la huella del código (sha256 del script y de los módulos de lab/), el commit de git y la huella del
manifiesto de datos. No sobrescribe: si el archivo existe, agrega una versión nueva (lista "corridas").
"""
import datetime as dt
import hashlib
import json
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "registro", "experimentos")


def sha256(ruta):
    with open(ruta, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def huella_codigo(script):
    archivos = [script] + sorted(os.path.join(RAIZ, "lab", f) for f in os.listdir(os.path.join(RAIZ, "lab")) if f.endswith(".py"))
    return {os.path.relpath(a, RAIZ): sha256(a) for a in archivos if os.path.exists(a)}


def commit():
    try:
        return subprocess.run(["git", "-C", RAIZ, "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def _json(x):
    try:
        import numpy as np
        import pandas as pd
        if isinstance(x, (np.integer,)):
            return int(x)
        if isinstance(x, (np.floating,)):
            return None if np.isnan(x) else float(x)
        if isinstance(x, pd.DataFrame):
            return x.reset_index().to_dict(orient="records")
        if isinstance(x, (pd.Timestamp, dt.date)):
            return str(x)
    except Exception:
        pass
    return str(x)


def registrar(id, script, **campos):
    os.makedirs(CARPETA, exist_ok=True)
    ruta = os.path.join(CARPETA, f"{id}.json")
    man = os.path.join(RAIZ, "data", "MANIFIESTO.csv")
    corrida = dict(fecha_utc=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), commit=commit(),
                   codigo=huella_codigo(script), manifiesto_datos=sha256(man) if os.path.exists(man) else None, **campos)
    previo = json.load(open(ruta)) if os.path.exists(ruta) else dict(id=id, corridas=[])
    previo["corridas"].append(corrida)
    with open(ruta, "w") as f:
        json.dump(previo, f, ensure_ascii=False, indent=1, default=_json)
    return ruta
