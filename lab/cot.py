"""
Historial del COT (CFTC, Socrata publicreporting.cftc.gov): posiciones de los especuladores por semana.
- Financieros (TFF, gpe5-46if): grupo "leveraged money" (fondos).
- Commodities (Disaggregated, 72hh-3qpy): grupo "managed money".
El reporte es del martes y se publica el viernes a las 15:30 de Nueva York: se puede usar desde el cierre diario del
viernes (17:00 NY).
"""
import json
import os
import time
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd

from lab.datos import RAIZ

BASE = "https://publicreporting.cftc.gov/resource/{}.json"
MERCADOS = {
    # instrumento: (dataset, código CFTC, grupo, signo)  signo -1: el futuro cotiza al revés del par (yen)
    "EURUSD": ("gpe5-46if", "099741", "lev_money", 1),
    "GBPUSD": ("gpe5-46if", "096742", "lev_money", 1),
    "USDJPY": ("gpe5-46if", "097741", "lev_money", -1),
    "AUDUSD": ("gpe5-46if", "232741", "lev_money", 1),
    "SPXUSD": ("gpe5-46if", "13874A", "lev_money", 1),
    "NSXUSD": ("gpe5-46if", "209742", "lev_money", 1),
    "JPXJPY": ("gpe5-46if", "240741", "lev_money", 1),
    "XAUUSD": ("72hh-3qpy", "088691", "m_money", 1),
    "XAGUSD": ("72hh-3qpy", "084691", "m_money", 1),
}


def _get(url):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "trading-strategy-lab"})
            return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
        except Exception as ex:  # red inestable
            if i == 3:
                raise
            time.sleep(5 * (i + 1))


def bajar(instr):
    ds, cod, grupo, signo = MERCADOS[instr]
    largos = f"{grupo}_positions_long" + ("_all" if grupo == "m_money" else "")
    cortos = f"{grupo}_positions_short" + ("_all" if grupo == "m_money" else "")
    q = urllib.parse.urlencode({"$select": f"report_date_as_yyyy_mm_dd,{largos},{cortos},open_interest_all",
                                "$where": f"cftc_contract_market_code='{cod}' AND report_date_as_yyyy_mm_dd >= '2006-01-01'",
                                "$order": "report_date_as_yyyy_mm_dd", "$limit": "5000"}, quote_via=urllib.parse.quote)
    filas = _get(BASE.format(ds) + "?" + q)
    df = pd.DataFrame(filas)
    df["fecha"] = pd.to_datetime(df.report_date_as_yyyy_mm_dd.str[:10])
    df["largos"] = df[largos].astype(float)
    df["cortos"] = df[cortos].astype(float)
    df["oi"] = df.open_interest_all.astype(float)
    df["neto"] = signo * (df.largos - df.cortos)
    df = df[["fecha", "largos", "cortos", "oi", "neto"]].drop_duplicates("fecha").sort_values("fecha")
    df.to_csv(os.path.join(RAIZ, f"cot_{instr}.csv"), index=False)
    return df


def cargar(instr):
    p = os.path.join(RAIZ, f"cot_{instr}.csv")
    if not os.path.exists(p):
        return bajar(instr)
    return pd.read_csv(p, parse_dates=["fecha"])


def indice_cot(df, semanas=156):
    """Posición neta como percentil (0–1) de las últimas `semanas` (índice COT clásico)."""
    n = df.neto
    mn = n.rolling(semanas, min_periods=52).min()
    mx = n.rolling(semanas, min_periods=52).max()
    return (n - mn) / (mx - mn)


def a_velas_diarias(df, serie, v):
    """Valor vigente en cada vela diaria: el reporte del martes rige desde el cierre del viernes de publicación."""
    disponible = (df.fecha + pd.Timedelta(days=3)).dt.tz_localize("America/New_York") + pd.Timedelta(hours=17)
    t_disp = disponible.dt.tz_convert("UTC").dt.tz_localize(None).values.astype("datetime64[ms]").astype(np.int64)
    cierre = np.append(v["t"][1:], v["t"][-1] + 86400000)  # cierre de cada vela diaria
    j = np.searchsorted(t_disp, cierre, side="right") - 1
    vals = np.asarray(serie, float)
    return np.where(j >= 0, vals[np.clip(j, 0, None)], np.nan)
