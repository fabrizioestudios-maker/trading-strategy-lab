"""
F002 — Prueba a futuro de E022 con la entrada de las 18:15 NY (E042) y tres salidas (E044) (BITACORA, entrada 38).

  python experimentos/F002_e022_variantes.py sellar      # una sola vez: registro/forward/F002.json (reglas, huellas, intervalos)
  python experimentos/F002_e022_variantes.py actualizar  # con data/XAUUSD.npz al día: operaciones nuevas y estado

Reglas comunes (E022): vela diaria de 17:00 NY; primer cierre fuera de Bollinger (20, 2 desvíos poblacionales), a favor de
la SMA 200 diaria; entrada en el primer minuto desde las 18:15 NY después del cierre; SL 0,5·ATR(14) de Wilder.
Salidas: TP fijo 2·SL | 16:55 NY del primer día (1 día) | 16:55 NY del quinto día (5 días). Costos: perfil base.
Las operaciones cuentan desde el primer cierre diario posterior al sellado. Decisión al llegar a 30 operaciones de cada
variante: pasa si la expectancy es > 0 y cae dentro del intervalo de predicción del 95 % de la media de 30 del backtest.
Si cambia la huella de algún archivo, `actualizar` avisa y no evalúa.
"""
import datetime as dt
import hashlib
import json
import os
import sys

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from lab import datos, ejecucion as EJ, eventos as EV, senales as S  # noqa: E402

DIR = os.path.join(RAIZ, "registro", "forward")
SELLO = os.path.join(DIR, "F002.json")
ESTADO = os.path.join(DIR, "F002_estado.json")
INICIO = "2026-11-27 22:00"  # 17:00 NY (UTC−5): primer cierre diario posterior al sellado
BACKTEST = ("2010-11-15", "2026-11-14")
ARCHIVOS = ["lab/datos.py", "lab/eventos.py", "lab/ejecucion.py", "lab/senales.py", "experimentos/F002_e022_variantes.py"]
VARIANTES = {"TP fijo 2·SL": None, "1 día": 1, "5 días": 5}
ms = lambda x: pd.Timestamp(x, tz="UTC").value // 10**6  # noqa: E731


def huellas():
    return {a: hashlib.sha256(open(os.path.join(RAIZ, a), "rb").read()).hexdigest() for a in ARCHIVOS}


def ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    return np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))


def operaciones(m1, desde, hasta):
    """Operaciones de cada variante con señal en [desde, hasta) (ms UTC), con costos base. Solo las ya cerradas."""
    o, h, l, c, t = m1["o"], m1["h"], m1["l"], m1["c"], m1["t"]
    tm = (EV.minuto_ny(t) - 1020) % 1440
    vol = EJ.Volatilidad(m1)
    v = datos.velas(m1, 1440)
    atr = datos.atr(v, 14)
    s = ruptura(v["c"])
    s = np.where(s == S.sobre_sma(v, 200), s, 0)
    nb = len(v["t"])
    sel = np.flatnonzero((s != 0) & ~np.isnan(atr) & (v["t"] >= desde) & (v["t"] < hasta) & (np.arange(nb) < nb - 1))
    ie = []
    for k in sel:
        i = v["i1"][k] + 1
        vent = tm[i:i + 2000] >= 75
        ie.append(i + int(np.argmax(vent)) if vent.any() else -1)
    ie = np.array(ie, np.int64)
    ok = ie >= 0
    sel, ie = sel[ok], ie[ok]
    d = s[sel].astype(np.int64)
    ent = o[ie]
    riesgo = 0.5 * atr[sel]
    sl = ent - d * riesgo
    costo = datos.costo("XAUUSD", ent)
    jd = np.searchsorted(v["i0"], ie, side="right") - 1
    out = {}
    for nombre, dias in VARIANTES.items():
        if dias is None:
            fin, tp = np.full(len(ie), len(o) - 1, np.int64), ent + d * 2 * riesgo
        else:
            jf = jd + dias - 1
            fin = np.where(jf < nb, np.searchsorted(t, t[v["i1"][np.clip(jf, 0, nb - 1)]] - 4 * 60000, side="right") - 1, len(o) - 1)
            tp = ent + d * 1e6
        r, mot, js = EV.simular_hasta_salida(o, h, l, c, ie, d, sl, tp, costo, fin)
        if dias is None:
            cerrada = ~np.isnan(r) & np.isin(mot, (-1, 1))  # con TP: solo las que tocaron SL o TP (2 = abierta al final de los datos)
        else:
            cerrada = ~np.isnan(r) & (jf < nb - 1)  # la vela diaria de salida ya está completa
        salida = ent + d * (r * riesgo + costo)
        ops = pd.DataFrame(dict(t=t[ie][cerrada], t_salida=t[np.clip(js, 0, None)][cerrada], dir=d[cerrada], entrada=ent[cerrada],
                                salida=salida[cerrada], sl=sl[cerrada], motivo=mot[cerrada], r=r[cerrada]))
        out[nombre] = EJ.aplicar(ops, "XAUUSD", vol, "base") if len(ops) else ops
    return out


def sellar():
    if os.path.exists(SELLO):
        sys.exit("F002 ya está sellado: no se vuelve a sellar.")
    m1 = datos.cargar("XAUUSD")
    ops = operaciones(m1, ms(BACKTEST[0]), ms(BACKTEST[1]))
    est = {}
    for nombre, x in ops.items():
        r = x.r.values
        mu, sd = float(r.mean()), float(r.std(ddof=1))
        est[nombre] = dict(media_backtest=mu, sd_backtest=sd, n_backtest=len(r), ip95_media_30=[mu - 1.96 * sd / np.sqrt(30), mu + 1.96 * sd / np.sqrt(30)])
    os.makedirs(DIR, exist_ok=True)
    sello = dict(id="F002", sellado_utc=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), inicio_utc=INICIO,
                 reglas=__doc__.strip(), backtest=dict(periodo=BACKTEST, costos="perfil base de lab/ejecucion.py"), variantes=est,
                 decision="al llegar a 30 operaciones de cada variante: pasa si expectancy > 0 y dentro del IP95 de la media de 30",
                 huellas=huellas())
    json.dump(sello, open(SELLO, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(est, ensure_ascii=False, indent=1))


def actualizar():
    sello = json.load(open(SELLO))
    if sello["huellas"] != huellas():
        sys.exit("Cambió el código o las reglas desde el sellado: F002 no se evalúa.")
    m1 = datos.cargar("XAUUSD")
    ops = operaciones(m1, ms(INICIO), ms("2100-01-01"))
    estado = {}
    for nombre, x in ops.items():
        r = x.r.values if len(x) else np.array([])
        b = sello["variantes"][nombre]
        e = dict(n=len(r), expectancy=float(r.mean()) if len(r) else None)
        if len(r) >= 30:
            m = float(r[:30].mean())
            e["decision"] = "pasa" if m > 0 and b["ip95_media_30"][0] <= m <= b["ip95_media_30"][1] else "no pasa"
        estado[nombre] = e
    json.dump(dict(actualizado_utc=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), estado=estado), open(ESTADO, "w"),
              ensure_ascii=False, indent=1)
    print(json.dumps(estado, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    {"sellar": sellar, "actualizar": actualizar}[sys.argv[1]]()
