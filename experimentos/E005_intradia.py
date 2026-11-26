"""
E005 — Barrido intradía (solo selección, < 2022), una operación a la vez, TP = 2,1·SL, con costos.
Familias:
  A. Ruptura del rango de apertura de NY (09:30–10:00 NY): cierre de M5 fuera del rango entre 10:00 y 12:00 → a favor;
     SL en el otro lado del rango (o 1 ATR H1 si el rango es menor). Un intento por día.
  B. Ruptura del rango asiático (19:00–00:00 NY) entre 02:00 y 05:00 NY (Londres); SL en el otro lado.
  C. NR7 e inside bar diarios: al día siguiente, primer cierre de M5 fuera del máximo o mínimo; SL en el otro lado de la vela.
  D. RSI(14) H1 < 30 / > 70 en contra, SL 1,5 ATR H1.
  E. Bollinger(20, 2) H1: cierre fuera de la banda, en contra, SL 1,5 ATR H1.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, motor, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

INSTR = sys.argv[1].split(",")
RR = 2.1
CORTE = estrategia.CORTE


def min_ny(t):
    ny = pd.to_datetime(t, unit="ms", utc=True).tz_convert("America/New_York")
    return (ny.hour * 60 + ny.minute).values, ny.normalize().tz_localize(None).values.astype("datetime64[D]")


def rango_ruptura(m1, v5, ini, fin, desde, hasta, min_riesgo):
    """Rango de minutos [ini, fin) del día NY; rupturas por cierre de M5 entre desde y hasta. Devuelve ie, d, sl, tp."""
    mn, dia = min_ny(v5["t"])
    # minutos que cruzan medianoche (rango asiático 19:00–24:00): se asignan al día siguiente
    dia_ses = dia.copy()
    if ini > fin:
        dia_ses = np.where(mn >= ini, dia + np.timedelta64(1, "D"), dia)
    out = []
    df = pd.DataFrame(dict(mn=mn, dia=dia_ses, h=v5["h"], l=v5["l"], c=v5["c"], k=np.arange(len(mn))))
    en_rango = (mn >= ini) & (mn < fin) if ini < fin else ((mn >= ini) | (mn < fin))
    rng = df[en_rango].groupby("dia").agg(h=("h", "max"), l=("l", "min"))
    ventana = df[(mn >= desde) & (mn < hasta)]
    for dia_v, g in ventana.groupby("dia"):
        if dia_v not in rng.index:
            continue
        H, L = rng.loc[dia_v, "h"], rng.loc[dia_v, "l"]
        for _, f in g.iterrows():
            if f.c > H or f.c < L:
                d = 1 if f.c > H else -1
                ie = v5["i1"][int(f.k)] + 1
                if ie >= len(m1["o"]):
                    break
                ent = m1["o"][ie]
                riesgo = max(ent - L if d == 1 else H - ent, min_riesgo)
                out.append((ie, d, ent - d * riesgo, ent + d * RR * riesgo))
                break
    if not out:
        return None
    a = np.array(out)
    return a[:, 0].astype(np.int64), a[:, 1].astype(np.int64), a[:, 2], a[:, 3]


def vela_ruptura(m1, v1d, v5, cond):
    """Al día siguiente de una vela diaria que cumple `cond`, primer cierre de M5 fuera de su máximo o mínimo."""
    out = []
    k5 = 0
    for k in np.flatnonzero(cond[:-1]):
        H, L = v1d["h"][k], v1d["l"][k]
        t0, t1 = v1d["t"][k + 1], (v1d["t"][k + 2] if k + 2 < len(v1d["t"]) else v1d["t"][k + 1] + 86400000)
        a, b = np.searchsorted(v5["t"], t0), np.searchsorted(v5["t"], t1)
        c = v5["c"][a:b]
        hit = np.flatnonzero((c > H) | (c < L))
        if len(hit) == 0:
            continue
        j = a + hit[0]
        d = 1 if v5["c"][j] > H else -1
        ie = v5["i1"][j] + 1
        if ie >= len(m1["o"]):
            continue
        ent = m1["o"][ie]
        riesgo = ent - L if d == 1 else H - ent
        if riesgo <= 0:
            continue
        out.append((ie, d, ent - d * riesgo, ent + d * RR * riesgo))
    if not out:
        return None
    a = np.array(out)
    return a[:, 0].astype(np.int64), a[:, 1].astype(np.int64), a[:, 2], a[:, 3]


def evento_h1(m1, vh, ev, k=1.5):
    a = datos.atr(vh, 14)
    idx = np.flatnonzero((ev != 0) & ~np.isnan(a))
    idx = idx[idx < len(vh["t"]) - 1]
    ie = vh["i1"][idx] + 1
    d = ev[idx]
    ent = m1["o"][ie]
    return ie, d, ent - d * k * a[idx], ent + d * RR * k * a[idx]


filas = []
for instr in INSTR:
    m1 = datos.cargar(instr)
    sel = m1["t"] < CORTE
    m1 = {k: v[sel] for k, v in m1.items()}
    v5, vh, vd = datos.velas(m1, 5), datos.velas(m1, 60), datos.velas(m1, 1440)
    ah = datos.atr(vh, 14)
    min_r = np.nanmedian(ah) * 0.5
    rng_d = vd["h"] - vd["l"]
    nr7 = rng_d <= pd.Series(rng_d).rolling(7).min().values
    inside = (vd["h"] < np.concatenate([[np.inf], vd["h"][:-1]])) & (vd["l"] > np.concatenate([[-np.inf], vd["l"][:-1]]))
    familias = {
        "A. ruptura rango apertura NY (09:30–10:00)": lambda: rango_ruptura(m1, v5, 570, 600, 600, 720, min_r),
        "B. ruptura rango asiático en Londres": lambda: rango_ruptura(m1, v5, 1140, 0, 120, 300, min_r),
        "C1. ruptura tras NR7 diario": lambda: vela_ruptura(m1, vd, v5, nr7),
        "C2. ruptura tras inside bar diario": lambda: vela_ruptura(m1, vd, v5, inside),
        "D. RSI14 H1 <30/>70 en contra": lambda: evento_h1(m1, vh, np.where(S.rsi(vh["c"], 14) < 30, 1, np.where(S.rsi(vh["c"], 14) > 70, -1, 0))),
        "E. Bollinger 20,2 H1 en contra": lambda: evento_h1(m1, vh, (lambda m, sd: np.where(vh["c"] < m - 2 * sd, 1, np.where(vh["c"] > m + 2 * sd, -1, 0)))(S.sma(vh["c"], 20), pd.Series(vh["c"]).rolling(20).std().values)),
    }
    for nombre, fn in familias.items():
        res = fn()
        if res is None:
            continue
        ie, d, sl, tp = res
        ent = m1["o"][ie]
        for etiqueta, cst in (("con costos", datos.costo(instr, ent)), ("sin costos", np.zeros(len(ie)))):
            ops = motor.simular(m1, ie, d, sl, tp, cst, superponer=False)
            fin = ops["motivo"] != 3
            s = resumen(ops["r"][fin])
            filas.append(dict(instr=instr, familia=nombre, costos=etiqueta, n=s.get("n", 0), wr=s.get("wr", np.nan), payoff=s.get("payoff", np.nan), expectancy=s.get("expectancy", np.nan),
                              riesgo_mediano=float(np.median(np.abs(ent - sl)))))
    print(instr, "listo", flush=True)
df = pd.DataFrame(filas)
os.makedirs("resultados/E005", exist_ok=True)
df.to_csv(f"resultados/E005/intradia_{'_'.join(INSTR)}.csv", index=False)
x = df.copy(); x["wr"] = (x.wr * 100).round(1); x["expectancy"] = x.expectancy.round(3); x["payoff"] = x.payoff.round(2)
print(x.pivot_table(index=["instr", "familia"], columns="costos", values=["n", "wr", "expectancy"]).to_string())
