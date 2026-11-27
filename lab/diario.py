"""
Series diarias para la fase 3: la vela diaria es la serie base del motor (en lugar del M1).

- desde_histdata(instr): velas diarias (cierre 17:00 NY) armadas con el M1 de HistData. Sirve para comprobar que
  simular sobre velas diarias da lo mismo que sobre M1 cuando los stops son anchos (E018 metodo).
- desde_csv(ruta): CSV diario con columnas Date, Open, High, Low, Close (formato de Stooq; también acepta el de Yahoo).

El motor recibe la misma serie como "M1" y como velas de señal (i0 = i1 = índice de la vela). La entrada es la apertura
de la vela siguiente a la señal. Si el SL y el TP caen en la misma vela, cuenta el SL; si una vela abre más allá del SL,
se sale en esa apertura (las mismas reglas de lab/motor.py, aplicadas a velas diarias).
"""
import glob
import os

import numpy as np
import pandas as pd

from lab import datos

RAIZ_EXT = os.path.join(datos.RAIZ, "stooq")

# Instrumento del laboratorio (costos de docs/costos.md) -> símbolos posibles en archivos externos.
SIMBOLOS = {
    "SPXUSD": ["^spx", "spx", "^gspc", "gspc"],
    "NSXUSD": ["^ndx", "ndx"],
    "JPXJPY": ["^nkx", "nkx", "^n225", "n225"],
    "UKXGBP": ["^ukx", "ukx", "^ftse", "ftse"],
    "FRXEUR": ["^cac", "cac", "^fchi", "fchi"],
    "AUXAUD": ["^aor", "aor", "^aord", "aord", "^axjo", "axjo", "^xjo", "xjo"],
    "HKXHKD": ["^hsi", "hsi"],
    "XAUUSD": ["xauusd", "xau"],
    "XAGUSD": ["xagusd", "xag"],
}


def _serie(t, o, h, l, c, fecha):
    n = len(t)
    idx = np.arange(n)
    return dict(t=np.asarray(t, np.int64), o=np.asarray(o, float), h=np.asarray(h, float), l=np.asarray(l, float),
                c=np.asarray(c, float), i0=idx, i1=idx, fecha=pd.DatetimeIndex(fecha))


def desde_histdata(instr):
    v = datos.velas(datos.cargar(instr), 1440)
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    fecha = (ny + pd.Timedelta(hours=7)).tz_localize(None).normalize()  # día de operación de la vela 17:00–17:00
    return _serie(v["t"], v["o"], v["h"], v["l"], v["c"], fecha)


def desde_csv(ruta):
    df = pd.read_csv(ruta)
    df.columns = [str(c).strip().lower() for c in df.columns]
    df = df.rename(columns={"data": "date", "otwarcie": "open", "najwyzszy": "high", "najnizszy": "low", "zamkniecie": "close"})
    for col in ("open", "high", "low", "close"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "open", "high", "low", "close"])
    df = df[(df[["open", "high", "low", "close"]] > 0).all(axis=1)].sort_values("date").drop_duplicates("date")
    fecha = pd.DatetimeIndex(df["date"].values).normalize()
    t = fecha.values.astype("datetime64[ms]").astype(np.int64)
    return _serie(t, df["open"].values, df["high"].values, df["low"].values, df["close"].values, fecha)


def archivo(instr, carpeta=RAIZ_EXT):
    """Busca data/stooq/<instr>.csv o un archivo con alguno de sus símbolos (p. ej. ^spx_d.csv)."""
    cand = [os.path.join(carpeta, f"{instr}.csv")]
    for s in SIMBOLOS[instr]:
        cand += [os.path.join(carpeta, f"{s}_d.csv"), os.path.join(carpeta, f"{s}.csv")]
    for c in cand:
        if os.path.exists(c):
            return c
    for c in glob.glob(os.path.join(carpeta, "*.csv")):
        base = os.path.basename(c).lower().replace("_d.csv", "").replace(".csv", "")
        if base in SIMBOLOS[instr]:
            return c
    return None


def calidad(s):
    """Indicadores de calidad por año: velas, % sin rango (H == L), % OHLC iguales, % incoherentes, huecos, saltos > 20 %."""
    o, h, l, c = s["o"], s["h"], s["l"], s["c"]
    anio = s["fecha"].year
    gap = np.concatenate([[1.0], np.diff(s["t"]) / 86400000.0])
    ret = np.concatenate([[0.0], np.abs(np.diff(np.log(c)))])
    df = pd.DataFrame(dict(
        anio=anio,
        sin_rango=(h == l),
        ohlc_igual=(o == h) & (h == l) & (l == c),
        incoherente=(h < np.maximum(o, c) * (1 - 1e-9)) | (l > np.minimum(o, c) * (1 + 1e-9)),
        hueco_10d=gap > 10,
        salto_20=ret > np.log(1.2),
    ))
    g = df.groupby("anio")
    out = g.size().to_frame("velas")
    for col in ("sin_rango", "ohlc_igual", "incoherente"):
        out["pct_" + col] = (g[col].mean() * 100).round(1)
    out["huecos_10d"] = g["hueco_10d"].sum()
    out["saltos_20pct"] = g["salto_20"].sum()
    return out
