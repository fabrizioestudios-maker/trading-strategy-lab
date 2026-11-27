"""
Descarga velas diarias de Yahoo Finance (API v8 "chart") para la fase 3 (E018).

Guarda el JSON original en data/yahoo/<símbolo>.json y una versión CSV (Date, Open, High, Low, Close) en
data/externo/<INSTR>.csv. La fecha de cada vela es el día de operación en la zona horaria de la bolsa.

Uso: python -m lab.descarga_yahoo [INSTR ...]     (sin argumentos baja los 9 activos de E018)

Cobertura en Yahoo: S&P 500 desde 1928, Nasdaq 100 desde 1985, Nikkei 225 desde 1965, FTSE 100 desde 1984,
CAC 40 desde 1990, All Ordinaries desde 1984, Hang Seng desde 1986. Oro y plata solo como futuros continuos
(GC=F, SI=F) desde agosto de 2000: el oro y la plata de 1990–2000 no están.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import pandas as pd

from lab import datos

YAHOO = {
    "SPXUSD": "^GSPC",
    "NSXUSD": "^NDX",
    "JPXJPY": "^N225",
    "UKXGBP": "^FTSE",
    "FRXEUR": "^FCHI",
    "AUXAUD": "^AORD",  # All Ordinaries: cubre 1990–2009 completo (el ASX 200 empieza en 2000; ^AXJO desde 1992)
    "HKXHKD": "^HSI",
    "XAUUSD": "GC=F",
    "XAGUSD": "SI=F",
}
CRUDO = os.path.join(datos.RAIZ, "yahoo")
SALIDA = os.path.join(datos.RAIZ, "externo")


def bajar(simbolo):
    q = urllib.parse.urlencode(dict(period1=-1325583000, period2=int(time.time()), interval="1d", events="history"))
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(simbolo)}?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def a_tabla(js):
    res = js["chart"]["result"][0]
    zona = res["meta"].get("exchangeTimezoneName", "UTC")
    q = res["indicators"]["quote"][0]
    fecha = pd.to_datetime(pd.Series(res["timestamp"]), unit="s", utc=True).dt.tz_convert(zona).dt.tz_localize(None).dt.normalize()
    df = pd.DataFrame(dict(Date=fecha.dt.strftime("%Y-%m-%d"), Open=q["open"], High=q["high"], Low=q["low"], Close=q["close"]))
    return df.dropna().drop_duplicates("Date", keep="last"), res["meta"]


def main(instrs):
    os.makedirs(CRUDO, exist_ok=True)
    os.makedirs(SALIDA, exist_ok=True)
    for instr in instrs:
        sim = YAHOO[instr]
        js = bajar(sim)
        nombre = sim.replace("^", "").replace("=", "_").lower()
        with open(os.path.join(CRUDO, f"{nombre}.json"), "w") as f:
            json.dump(js, f)
        df, meta = a_tabla(js)
        df.to_csv(os.path.join(SALIDA, f"{instr}.csv"), index=False)
        print(f"{instr} {sim}: {len(df)} velas, {df.Date.iloc[0]} a {df.Date.iloc[-1]} ({meta.get('exchangeTimezoneName')})", flush=True)
        time.sleep(2)


if __name__ == "__main__":
    main(sys.argv[1:] or list(YAHOO))
