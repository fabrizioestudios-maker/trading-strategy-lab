"""
Datos externos gratuitos, cada uno con el momento real en que se conocía (fase 4; E033 en adelante).

Fuentes (todas sin costo):
- FRED (fred.stlouisfed.org, CSV sin clave): rendimientos del Tesoro, rendimiento real, inflación esperada, VIX,
  volatilidad implícita del oro (GVZ) y del petróleo (OVX), diferencial high yield.
- CFTC (publicreporting.cftc.gov, Socrata): COT desagregado (commodities) y TFF (financieros), todas las categorías.
- Yahoo Finance (query1.finance.yahoo.com, API v8): ETF del oro (GLD), índice dólar (DX-Y.NYB) y futuros con volumen
  centralizado (GC=F, SI=F, CL=F).

Cada serie se guarda cruda en data/externo/<fuente>/ y se lee como DataFrame con una columna `disponible_ms`
(milisegundos UTC): el primer instante en que el dato era público. Esa columna es la defensa contra mirar adelante:
`a_velas()` solo asigna a una vela los datos con `disponible_ms` <= cierre de la vela.

Reglas de disponibilidad (conservadoras):
- Índices de volatilidad de CBOE (VIXCLS, GVZCLS, OVXCLS): el cierre de las 16:15 de Nueva York del mismo día.
- H.15 del Tesoro y derivados (DGS10, DGS2, DFII10, T10YIE) y el diferencial high yield: día hábil siguiente, 17:00 NY.
- COT: el reporte es del martes y sale el viernes a las 15:30 NY. Se usa desde el viernes 17:00 NY; si en la semana
  hay un feriado federal, desde el lunes siguiente 17:00 NY. En los cierres del gobierno (2013, 2018–2019, 2025) los
  reportes salieron con semanas de atraso: se usan desde una fecha posterior al fin de la recuperación (ver CIERRES).
- Yahoo diario: el cierre del día de la bolsa (16:00 NY para GLD; 17:00 NY para futuros y el índice dólar).
"""
import io
import json
import os
import time
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd
from pandas.tseries.holiday import USFederalHolidayCalendar

from lab.datos import RAIZ

EXT = os.path.join(RAIZ, "externo")
NY = "America/New_York"

# ---------------------------------------------------------------- FRED
FRED = {
    # id: (descripción, regla de disponibilidad)
    "DGS10": ("Rendimiento del Tesoro a 10 años (%)", "h15"),
    "DGS2": ("Rendimiento del Tesoro a 2 años (%)", "h15"),
    "DFII10": ("Rendimiento real a 10 años, TIPS (%)", "h15"),
    "T10YIE": ("Inflación esperada a 10 años (breakeven, %)", "h15"),
    "VIXCLS": ("VIX, cierre", "cboe"),
    "GVZCLS": ("Volatilidad implícita del oro (GVZ), cierre", "cboe"),
    "OVXCLS": ("Volatilidad implícita del petróleo (OVX), cierre", "cboe"),
    "BAMLH0A0HYM2": ("Diferencial high yield de EE. UU. (OAS, %)", "h15"),
}


def _get(url, intentos=4, espera=5, agente="trading-strategy-lab"):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": agente})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as ex:
            if ex.code == 429 or i == intentos - 1:  # límite de pedidos: no se insiste
                raise
            time.sleep(espera * (i + 1))
        except Exception:
            if i == intentos - 1:
                raise
            time.sleep(espera * (i + 1))


def _ms(ts):
    """Timestamp con zona (o serie) -> ms UTC."""
    s = pd.DatetimeIndex(ts)
    return s.tz_convert("UTC").tz_localize(None).values.astype("datetime64[ms]").astype(np.int64)


def _feriados(desde="1980-01-01", hasta="2030-12-31"):
    return set(USFederalHolidayCalendar().holidays(desde, hasta).date)


def _habil_siguiente(fechas):
    """Día hábil siguiente (lunes a viernes, sin feriados federales)."""
    fer = _feriados()
    out = []
    for f in pd.DatetimeIndex(fechas):
        d = f + pd.Timedelta(days=1)
        while d.weekday() >= 5 or d.date() in fer:
            d += pd.Timedelta(days=1)
        out.append(d)
    return pd.DatetimeIndex(out)


def disponible_fred(fechas, regla):
    f = pd.DatetimeIndex(fechas).normalize()
    if regla == "cboe":
        loc = (f + pd.Timedelta(hours=16, minutes=15)).tz_localize(NY)
    elif regla == "h15":
        loc = (_habil_siguiente(f) + pd.Timedelta(hours=17)).tz_localize(NY)
    else:
        raise ValueError(regla)
    return _ms(loc)


def bajar_fred(serie):
    """FRED corta las conexiones de urllib; con curl responde normalmente."""
    import subprocess
    os.makedirs(os.path.join(EXT, "fred"), exist_ok=True)
    ruta = os.path.join(EXT, "fred", f"{serie}.csv")
    subprocess.run(["curl", "-sSf", "--retry", "3", "--max-time", "90", "-o", ruta,
                    f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={serie}"], check=True)
    return ruta


def fred(serie):
    ruta = os.path.join(EXT, "fred", f"{serie}.csv")
    if not os.path.exists(ruta):
        bajar_fred(serie)
    df = pd.read_csv(ruta)
    df.columns = ["fecha", "valor"]
    df["fecha"] = pd.to_datetime(df.fecha)
    df["valor"] = pd.to_numeric(df.valor, errors="coerce")  # FRED marca los días sin dato con "."
    df = df.dropna().reset_index(drop=True)
    df["disponible_ms"] = disponible_fred(df.fecha, FRED[serie][1])
    return df


# ---------------------------------------------------------------- CFTC (COT)
SOCRATA = "https://publicreporting.cftc.gov/resource/{}.json"
COT = {
    # nombre: (dataset, código del contrato, tipo)   desagregado = commodities; tff = financieros
    "oro": ("72hh-3qpy", "088691", "desagregado"),
    "plata": ("72hh-3qpy", "084691", "desagregado"),
    "crudo": ("72hh-3qpy", "067651", "desagregado"),
    "euro": ("gpe5-46if", "099741", "tff"),
    "libra": ("gpe5-46if", "096742", "tff"),
    "yen": ("gpe5-46if", "097741", "tff"),
    "dolar_canadiense": ("gpe5-46if", "090741", "tff"),
    "dolar_australiano": ("gpe5-46if", "232741", "tff"),
    "sp500_emini": ("gpe5-46if", "13874A", "tff"),
    "nasdaq_emini": ("gpe5-46if", "209742", "tff"),
    "dow_emini": ("gpe5-46if", "124603", "tff"),
}
CATEGORIAS = {
    # categoría: (columna de largos, columna de cortos) en Socrata
    "desagregado": {
        "productores": ("prod_merc_positions_long", "prod_merc_positions_short"),
        "swap": ("swap_positions_long_all", "swap__positions_short_all"),
        "fondos": ("m_money_positions_long_all", "m_money_positions_short_all"),
        "otros": ("other_rept_positions_long", "other_rept_positions_short"),
        "no_reportables": ("nonrept_positions_long_all", "nonrept_positions_short_all"),
    },
    "tff": {
        "dealers": ("dealer_positions_long_all", "dealer_positions_short_all"),
        "gestores": ("asset_mgr_positions_long", "asset_mgr_positions_short"),
        "fondos": ("lev_money_positions_long", "lev_money_positions_short"),
        "otros": ("other_rept_positions_long", "other_rept_positions_short"),
        "no_reportables": ("nonrept_positions_long_all", "nonrept_positions_short_all"),
    },
}
# Cierres del gobierno de EE. UU.: reportes publicados con atraso. Los de [desde, hasta] se usan desde `uso`.
CIERRES = [
    ("2013-10-01", "2013-11-12", "2013-11-22"),
    ("2018-12-24", "2019-02-26", "2019-03-08"),
    ("2025-09-30", "2025-12-30", "2026-01-30"),
]


def bajar_cot(nombre):
    ds, cod, tipo = COT[nombre]
    os.makedirs(os.path.join(EXT, "cftc"), exist_ok=True)
    filas, off = [], 0
    while True:
        q = urllib.parse.urlencode({"$where": f"cftc_contract_market_code='{cod}'", "$order": "report_date_as_yyyy_mm_dd",
                                    "$limit": "5000", "$offset": str(off)}, quote_via=urllib.parse.quote)
        lote = json.loads(_get(SOCRATA.format(ds) + "?" + q).decode())
        filas += lote
        if len(lote) < 5000:
            break
        off += 5000
    ruta = os.path.join(EXT, "cftc", f"{nombre}.json")
    with open(ruta, "w") as f:
        json.dump(filas, f)
    return ruta


def disponible_cot(fechas_reporte):
    """Instante (ms UTC) desde el que se conocía cada reporte del martes."""
    fer = _feriados()
    out = []
    for f in pd.DatetimeIndex(fechas_reporte).normalize():
        semana = [f + pd.Timedelta(days=d) for d in range(0, 4)]  # martes a viernes
        dia = f + pd.Timedelta(days=3)
        if any(x.date() in fer for x in semana):
            dia = f + pd.Timedelta(days=6)  # lunes siguiente
        for a, b, uso in CIERRES:
            if pd.Timestamp(a) <= f <= pd.Timestamp(b):
                dia = max(dia, pd.Timestamp(uso))
        out.append(dia + pd.Timedelta(hours=17))
    return _ms(pd.DatetimeIndex(out).tz_localize(NY))


def _num(df, col):
    return pd.to_numeric(df[col], errors="coerce") if col in df else np.nan


def cot(nombre):
    """Posiciones por categoría (largos, cortos, neto y neto/OI) con su disponibilidad. Una fila por martes."""
    ds, cod, tipo = COT[nombre]
    ruta = os.path.join(EXT, "cftc", f"{nombre}.json")
    if not os.path.exists(ruta):
        bajar_cot(nombre)
    df = pd.DataFrame(json.load(open(ruta)))
    out = pd.DataFrame({"fecha": pd.to_datetime(df.report_date_as_yyyy_mm_dd.str[:10]), "oi": _num(df, "open_interest_all")})
    for cat, (lg, ct) in CATEGORIAS[tipo].items():
        out[f"{cat}_largos"] = _num(df, lg)
        out[f"{cat}_cortos"] = _num(df, ct)
        out[f"{cat}_neto"] = out[f"{cat}_largos"] - out[f"{cat}_cortos"]
        out[f"{cat}_neto_oi"] = out[f"{cat}_neto"] / out.oi
    out = out.dropna(subset=["fecha"]).drop_duplicates("fecha").sort_values("fecha").reset_index(drop=True)
    out["disponible_ms"] = disponible_cot(out.fecha)
    return out


# ---------------------------------------------------------------- Yahoo
YAHOO = {
    # nombre: (símbolo, hora de cierre en NY)
    "gld": ("GLD", 16),
    "dolar": ("DX-Y.NYB", 17),
    "oro_futuro": ("GC=F", 17),
    "plata_futuro": ("SI=F", 17),
    "crudo_futuro": ("CL=F", 17),
    "tip": ("TIP", 16),
    "ief": ("IEF", 16),
}


def bajar_yahoo(nombre, intervalo="1d", rango=None):
    sim = YAHOO[nombre][0]
    if rango:
        q = urllib.parse.urlencode(dict(range=rango, interval=intervalo))
    else:
        q = urllib.parse.urlencode(dict(period1=-1325583000, period2=int(time.time()), interval=intervalo, events="history"))
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sim)}?{q}"
    raw = _get(url, agente="Mozilla/5.0")
    os.makedirs(os.path.join(EXT, "yahoo"), exist_ok=True)
    ruta = os.path.join(EXT, "yahoo", f"{nombre}_{intervalo}.json")
    with open(ruta, "wb") as f:
        f.write(raw)
    return ruta


def yahoo(nombre, intervalo="1d"):
    ruta = os.path.join(EXT, "yahoo", f"{nombre}_{intervalo}.json")
    if not os.path.exists(ruta):
        bajar_yahoo(nombre, intervalo, "730d" if intervalo == "60m" else None)
    res = json.load(open(ruta))["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    ts = pd.to_datetime(pd.Series(res["timestamp"]), unit="s", utc=True)
    df = pd.DataFrame(dict(t_utc=ts, open=q["open"], high=q["high"], low=q["low"], close=q["close"], volume=q.get("volume")))
    df = df.dropna(subset=["open", "high", "low", "close"])
    if intervalo == "1d":
        zona = res["meta"].get("exchangeTimezoneName", NY)
        df["fecha"] = df.t_utc.dt.tz_convert(zona).dt.tz_localize(None).dt.normalize()
        df = df.drop_duplicates("fecha", keep="last").reset_index(drop=True)
        df["disponible_ms"] = _ms((df.fecha + pd.Timedelta(hours=YAHOO[nombre][1])).dt.tz_localize(NY))
    else:
        paso = pd.Timedelta(intervalo.replace("m", "min"))
        df["disponible_ms"] = _ms(df.t_utc + paso)  # la vela se conoce al cerrar
    return df


# ---------------------------------------------------------------- unión con las velas del laboratorio
def a_velas(serie, v, columna="valor"):
    """Valor vigente al cierre de cada vela de `v` (dict con t = inicio de vela, ms UTC): el último dato con
    disponible_ms <= cierre de la vela. NaN antes del primero."""
    t_disp = np.asarray(serie["disponible_ms"], np.int64)
    orden = np.argsort(t_disp, kind="stable")
    t_disp = t_disp[orden]
    vals = np.asarray(serie[columna], float)[orden]
    paso = np.median(np.diff(v["t"])) if len(v["t"]) > 1 else 86400000
    cierre = np.append(v["t"][1:], v["t"][-1] + paso)
    j = np.searchsorted(t_disp, cierre, side="right") - 1
    return np.where(j >= 0, vals[np.clip(j, 0, None)], np.nan)


def manifiesto(rutas):
    """Filas (ruta, bytes, sha256) para data/MANIFIESTO.csv."""
    import hashlib
    filas = []
    for r in rutas:
        h = hashlib.sha256(open(r, "rb").read()).hexdigest()
        filas.append(dict(archivo=os.path.relpath(r, os.path.dirname(RAIZ)), bytes=os.path.getsize(r), sha256=h))
    return pd.DataFrame(filas)
