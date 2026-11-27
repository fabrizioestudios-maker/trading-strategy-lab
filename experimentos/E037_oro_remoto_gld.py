"""
E037 — Historia remota del oro D1 (E022) con otro instrumento: GLD diario de Yahoo, 2005–2011 (BITACORA, entrada 27).

1) Calibración (antes de mirar 2005–2011): GLD en 15/11/2011–13/11/2026 con las reglas de E022 sobre velas diarias
   (entrada en la apertura siguiente; si el SL y el TP caen el mismo día cuenta el SL; costo 0,02 % ida y vuelta) debe
   quedar a ± 0,25 R del spot (+0,407 R) y ≥ 70 % de sus operaciones deben coincidir (± 1 día, misma dirección) con las
   del spot. Si no calibra, el resultado remoto es "no comparable".
2) Remota: señales desde que hay 200 velas hasta el 14/11/2011. Pasa: n ≥ 30, expectancy > 0 y p < 0,10 (t de una
   cola). Se informa también la cota optimista (TP primero si los dos caen el mismo día).
Uso: python experimentos/E037_oro_remoto_gld.py      (necesita que Yahoo responda; baja data/externo/yahoo/gld_1d.json)
"""
import os
import sys

import numpy as np
import pandas as pd
from numba import njit
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import candidatas as C  # noqa: E402
from lab import datos, externos as X, registro, senales as S  # noqa: E402

SAL = "resultados/E037"
COSTO = 0.0002


@njit(cache=True)
def simular_diario(o, h, l, c, ie, d, sl, tp, costo, tp_primero):
    n = len(ie)
    N = len(o)
    r = np.full(n, np.nan)
    salida = np.full(n, -1, np.int64)
    libre = -1
    for k in range(n):
        i = ie[k]
        if i >= N or i <= libre:
            continue
        ent = o[i]
        dd = d[k]
        riesgo = (ent - sl[k]) * dd
        if riesgo <= 0 or (tp[k] - ent) * dd <= 0:
            continue
        j = i
        px = np.nan
        while j < N:
            if j > i and ((dd == 1 and o[j] <= sl[k]) or (dd == -1 and o[j] >= sl[k])):
                px = o[j]
                break
            toca_sl = (l[j] <= sl[k]) if dd == 1 else (h[j] >= sl[k])
            toca_tp = (h[j] >= tp[k]) if dd == 1 else (l[j] <= tp[k])
            if toca_sl and toca_tp:
                px = tp[k] if tp_primero else sl[k]
                break
            if toca_sl:
                px = sl[k]
                break
            if toca_tp:
                px = tp[k]
                break
            j += 1
        if np.isnan(px):
            continue
        r[k] = ((px - ent) * dd - costo[k]) / riesgo
        salida[k] = j
        libre = j
    return r, salida


def bollinger_ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    return np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))


def operar(df, desde, hasta, tp_primero=False):
    v = dict(o=df.open.values, h=df.high.values, l=df.low.values, c=df.close.values)
    s = bollinger_ruptura(v["c"])
    s = np.where(s == S.sobre_sma(v, 200), s, 0)
    a = datos.atr(v, 14)
    f = df.fecha.values
    sel = np.flatnonzero((s != 0) & ~np.isnan(a) & (f >= np.datetime64(desde)) & (f < np.datetime64(hasta)) & (np.arange(len(f)) < len(f) - 1))
    ie = sel + 1
    d = s[sel].astype(np.int64)
    ent = v["o"][ie]
    riesgo = 0.5 * a[sel]
    r, sal = simular_diario(v["o"], v["h"], v["l"], v["c"], ie.astype(np.int64), d, ent - d * riesgo, ent + 2 * d * riesgo,
                            COSTO * ent, tp_primero)
    ok = ~np.isnan(r)
    return pd.DataFrame(dict(fecha_senal=f[sel][ok], dir=d[ok], r=r[ok]))


def estad(r):
    r = np.asarray(r)
    n = len(r)
    t = r.mean() / (r.std(ddof=1) / np.sqrt(n)) if n > 2 else np.nan
    return dict(n=n, wr=float((r > 0).mean()) if n else np.nan, exp=float(r.mean()) if n else np.nan,
                p=float(stats.t.sf(t, n - 1)) if n > 2 else np.nan)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    gld = X.yahoo("gld")
    gld = gld[["fecha", "open", "high", "low", "close"]].dropna().reset_index(drop=True)
    # calibración
    cal = operar(gld, "2011-11-15", "2026-11-14")
    spot = C.e022()
    ny = pd.to_datetime(spot.t, unit="ms", utc=True).dt.tz_convert("America/New_York")
    spot_dia = (ny - pd.Timedelta(hours=7)).dt.tz_localize(None).dt.normalize()  # día de la vela de señal (cierre 17:00 NY)
    coinciden = 0
    for fs, d in zip(pd.to_datetime(cal.fecha_senal), cal.dir):
        if ((spot.dir.values == d) & (np.abs((spot_dia - fs).dt.days.values) <= 1)).any():
            coinciden += 1
    c = estad(cal.r)
    c.update(coincidencia=coinciden / max(len(cal), 1), dif_exp=c["exp"] - 0.407)
    calibra = abs(c["dif_exp"]) <= 0.25 and c["coincidencia"] >= 0.70
    print("calibración 2011–2026:", {k: round(v, 3) for k, v in c.items()}, "→", "calibra" if calibra else "NO calibra", flush=True)
    rem = operar(gld, "2004-01-01", "2011-11-15")
    rem_opt = operar(gld, "2004-01-01", "2011-11-15", tp_primero=True)
    e, eo = estad(rem.r), estad(rem_opt.r)
    pasa = calibra and e["n"] >= 30 and e["exp"] > 0 and e["p"] < 0.10
    print("remota 2005–2011 (SL primero):", {k: round(v, 3) for k, v in e.items()}, "| optimista:", {k: round(v, 3) for k, v in eo.items()},
          "→", "PASA" if pasa else ("no comparable" if not calibra else "NO PASA"), flush=True)
    rem.to_csv(f"{SAL}/operaciones_remotas.csv", index=False)
    cal.to_csv(f"{SAL}/operaciones_calibracion.csv", index=False)
    t = pd.DataFrame([dict(tramo="calibración 2011–2026", **c, calibra=calibra), dict(tramo="remota (SL primero)", **e, pasa=pasa),
                      dict(tramo="remota (TP primero, cota optimista)", **eo)])
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    registro.registrar("E037", __file__, hipotesis="E022 funciona en la historia remota del oro (GLD 2005–2011)", n_variantes=1,
                       resultados=t, estado="pasa" if pasa else ("no comparable" if not calibra else "no pasa"))
