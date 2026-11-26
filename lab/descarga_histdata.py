#!/usr/bin/env python3
"""
Baja velas de 1 minuto de HistData.com (formato ASCII, precios bid, hora EST fija = UTC-5 sin horario de verano)
y las guarda normalizadas a UTC en data/<INSTRUMENTO>.npz (arrays t [ms UTC], o, h, l, c).

Uso: python -m lab.descarga_histdata EURUSD GBPUSD ... [--desde 2016] [--hasta 2026]
Pide un archivo por año (y por mes para el año en curso), con pausa entre pedidos.
"""
import argparse
import io
import os
import re
import sys
import time
import zipfile
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

import numpy as np

BASE = "https://www.histdata.com"
RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
CRUDO = os.path.join(RAIZ, "crudo")
AGENTE = "Mozilla/5.0 (X11; Linux x86_64) trading-strategy-lab"


def _abridor():
    cj = CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def bajar_zip(op, par, anio, mes=None, pausa=2.0):
    """Devuelve los bytes del zip o None si no hay datos para ese período."""
    ruta = f"/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/{par.lower()}/{anio}" + (f"/{mes}" if mes else "")
    req = urllib.request.Request(BASE + ruta, headers={"User-Agent": AGENTE})
    html = op.open(req, timeout=60).read().decode("utf-8", "ignore")
    campos = dict(re.findall(r'<input type="hidden" name="(\w+)" id="\w+" value="([^"]*)"', html))
    if "tk" not in campos:
        return None
    datos = urllib.parse.urlencode({k: campos[k] for k in ("tk", "date", "datemonth", "platform", "timeframe", "fxpair") if k in campos}).encode()
    req = urllib.request.Request(BASE + "/get.php", data=datos, headers={"User-Agent": AGENTE, "Referer": BASE + ruta, "Content-Type": "application/x-www-form-urlencoded"})
    z = op.open(req, timeout=180).read()
    time.sleep(pausa)
    return z if z[:2] == b"PK" else None


def leer_zip(z):
    """Lee el CSV de HistData: 'YYYYMMDD HHMMSS;o;h;l;c;v' en EST fijo. Devuelve arrays con hora UTC en ms."""
    with zipfile.ZipFile(io.BytesIO(z)) as zf:
        nombre = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        txt = zf.read(nombre).decode("ascii", "ignore")
    filas = [l.split(";") for l in txt.splitlines() if l.strip()]
    ts = np.array([np.datetime64(f"{f[0][0:4]}-{f[0][4:6]}-{f[0][6:8]}T{f[0][9:11]}:{f[0][11:13]}:{f[0][13:15]}") for f in filas], dtype="datetime64[ms]")
    t = ts.astype(np.int64) + 5 * 3600 * 1000  # EST fijo (UTC-5) -> UTC
    v = np.array([[float(x) for x in f[1:5]] for f in filas])
    return t, v[:, 0], v[:, 1], v[:, 2], v[:, 3]


def instrumento(par, desde, hasta, anio_actual, mes_actual):
    os.makedirs(CRUDO, exist_ok=True)
    op = _abridor()
    partes = []
    periodos = [(a, None) for a in range(desde, min(hasta, anio_actual - 1) + 1)]
    if hasta >= anio_actual:
        periodos += [(anio_actual, m) for m in range(1, mes_actual + 1)]
    for anio, mes in periodos:
        nombre = os.path.join(CRUDO, f"{par}_{anio}{'' if mes is None else f'{mes:02d}'}.zip")
        if not os.path.exists(nombre):
            for intento in range(3):
                try:
                    z = bajar_zip(op, par, anio, mes)
                    break
                except Exception as ex:  # red inestable: reintento con espera
                    print(f"  {par} {anio} {mes}: {ex}; reintento", flush=True)
                    time.sleep(10 * (intento + 1))
                    z = None
            if z is None:
                print(f"  {par} {anio}{'' if mes is None else '-%02d' % mes}: sin datos", flush=True)
                continue
            with open(nombre, "wb") as f:
                f.write(z)
        with open(nombre, "rb") as f:
            partes.append(leer_zip(f.read()))
        print(f"  {par} {anio}{'' if mes is None else '-%02d' % mes}: {len(partes[-1][0])} velas", flush=True)
    if not partes:
        return None
    t = np.concatenate([p[0] for p in partes])
    orden = np.argsort(t, kind="stable")
    t = t[orden]
    unico = np.concatenate([[True], np.diff(t) > 0])
    cols = [np.concatenate([p[k] for p in partes])[orden][unico] for k in range(1, 5)]
    salida = os.path.join(RAIZ, f"{par}.npz")
    np.savez_compressed(salida, t=t[unico], o=cols[0], h=cols[1], l=cols[2], c=cols[3])
    return salida, int(unico.sum())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pares", nargs="+")
    ap.add_argument("--desde", type=int, default=2016)
    ap.add_argument("--hasta", type=int, default=2026)
    ap.add_argument("--anio-actual", type=int, default=2026)
    ap.add_argument("--mes-actual", type=int, default=10)
    a = ap.parse_args()
    for par in a.pares:
        r = instrumento(par.upper(), a.desde, a.hasta, a.anio_actual, a.mes_actual)
        print(par, "->", r, flush=True)
