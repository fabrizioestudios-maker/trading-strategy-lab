"""
Carga de datos M1 (UTC) y armado de velas de temporalidades mayores.

Cada instrumento se guarda en data/<INSTRUMENTO>.npz con arrays: t (ms UTC, apertura del minuto), o, h, l, c (bid).
Las velas H4 y diarias cierran a las 17:00 de Nueva York (convención de forex y metales, con horario de verano).
"""
import base64
import gzip
import json
import os
import struct

import numpy as np
import pandas as pd

RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# Costo ida y vuelta (docs/costos.md): ('pct', fracción del precio) o ('abs', precio).
COSTOS = {
    "XAUUSD": ("pct", 0.000125),
    "EURUSD": ("abs", 0.00010),
    "GBPUSD": ("abs", 0.00014),
    "USDJPY": ("abs", 0.010),
    "AUDUSD": ("abs", 0.00012),
    "SPXUSD": ("pct", 0.00015),
    "NSXUSD": ("pct", 0.00012),
    "GRXEUR": ("pct", 0.00012),
}


def costo(instr, precio):
    tipo, v = COSTOS[instr]
    return v * precio if tipo == "pct" else v + 0 * precio


def cargar(instr):
    z = np.load(os.path.join(RAIZ, f"{instr}.npz"))
    return {k: z[k] for k in ("t", "o", "h", "l", "c")}


def xau_desde_reproductor(carpeta, salida=None):
    """Convierte los meses del reproductor (base64 de gzip, cabecera <iqi>, velas <HiHHh> en centavos) a data/XAUUSD.npz."""
    ix = json.load(open(os.path.join(carpeta, "indice.json")))
    T, O, H, L, C = [], [], [], [], []
    for m in ix["meses"]:
        raw = base64.b64decode(open(os.path.join(carpeta, m["mes"] + ".txt")).read().strip())
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        n, t, pc = struct.unpack("<iqi", raw[:16])
        a = np.frombuffer(raw, dtype=np.dtype([("dt", "<u2"), ("do", "<i4"), ("dh", "<u2"), ("dl", "<u2"), ("dc", "<i2")]), count=n, offset=16)
        tt = t + np.cumsum(a["dt"].astype(np.int64))
        # o_k = c_{k-1} + do_k ; c_k = o_k + dc_k  => recorrido secuencial vectorizado
        inc = a["do"].astype(np.int64) + a["dc"].astype(np.int64)
        c = pc + np.cumsum(inc)
        o = c - a["dc"]
        T.append(tt * 60000); O.append(o); H.append(o + a["dh"]); L.append(o - a["dl"]); C.append(c)
    t = np.concatenate(T)
    arr = [np.concatenate(x) / 100.0 for x in (O, H, L, C)]
    salida = salida or os.path.join(RAIZ, "XAUUSD.npz")
    np.savez_compressed(salida, t=t, o=arr[0], h=arr[1], l=arr[2], c=arr[3])
    return salida, len(t)


def _cubeta(t_ms, tf):
    """Inicio de la vela de `tf` minutos que contiene cada minuto (ms UTC). H4 y D1 alineadas a las 17:00 de Nueva York."""
    if tf <= 60:
        paso = tf * 60000
        return (t_ms // paso) * paso
    ny = pd.to_datetime(t_ms, unit="ms", utc=True).tz_convert("America/New_York")
    off = ny.tz_localize(None).values.astype("datetime64[ms]").astype(np.int64) - t_ms  # ms locales - ms UTC (negativo)
    local = t_ms + off
    base = local - 17 * 3600000
    dia = (base // 86400000) * 86400000 + 17 * 3600000
    if tf >= 1440:
        return dia - off
    return dia + ((local - dia) // (tf * 60000)) * tf * 60000 - off


def velas(m1, tf):
    """Agrupa M1 en velas de tf minutos. Devuelve dict con t (inicio), o, h, l, c, i0, i1 (índices M1 de la primera y última)."""
    if tf == 1:
        n = len(m1["t"])
        return dict(t=m1["t"], o=m1["o"], h=m1["h"], l=m1["l"], c=m1["c"], i0=np.arange(n), i1=np.arange(n))
    b = _cubeta(m1["t"], tf)
    corte = np.flatnonzero(np.diff(b)) + 1
    i0 = np.concatenate([[0], corte])
    i1 = np.concatenate([corte - 1, [len(b) - 1]])
    return dict(
        t=b[i0], o=m1["o"][i0], h=np.maximum.reduceat(m1["h"], i0), l=np.minimum.reduceat(m1["l"], i0),
        c=m1["c"][i1], i0=i0, i1=i1,
    )


def atr(v, n=14):
    """ATR de Wilder (RMA del rango verdadero). NaN hasta tener n velas."""
    h, l, c = v["h"], v["l"], v["c"]
    pc = np.concatenate([[c[0]], c[:-1]])
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    out = np.full(len(tr), np.nan)
    if len(tr) < n:
        return out
    r = tr[:n].mean()
    out[n - 1] = r
    a = 1.0 / n
    for i in range(n, len(tr)):
        r = r + a * (tr[i] - r)
        out[i] = r
    return out


def anio(t_ms):
    return pd.to_datetime(t_ms, unit="ms", utc=True).year.values


def unir_historia(instr):
    """Une data/<instr>_2010.npz (historia anterior) con data/<instr>.npz. Guarda el original como <instr>_2016.npz."""
    viejo = os.path.join(RAIZ, f"{instr}_2010.npz")
    actual = os.path.join(RAIZ, f"{instr}.npz")
    respaldo = os.path.join(RAIZ, f"{instr}_2016.npz")
    if not os.path.exists(viejo):
        return None
    if not os.path.exists(respaldo):
        os.replace(actual, respaldo)
    a, b = np.load(viejo), np.load(respaldo)
    m = a["t"] < b["t"][0]
    salto = (b["o"][0] / a["c"][m][-1] - 1) * 100
    np.savez_compressed(actual, **{k: np.concatenate([a[k][m], b[k]]) for k in ("t", "o", "h", "l", "c")})
    return dict(instr=instr, antes=int(m.sum()), despues=len(b["t"]), salto_pct=round(float(salto), 3),
                desde=str(np.datetime64(int(a["t"][0]), "ms")), hasta=str(np.datetime64(int(b["t"][-1]), "ms")))
