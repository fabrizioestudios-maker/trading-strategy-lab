"""
E010 — Aprendizaje automático (gradient boosting) para estimar P(TP antes que SL) con 1:2,1 en D1.

- Muestras: cada vela diaria de cada instrumento, en las dos direcciones, con SL = k·ATR(14) y TP = 2,1·SL.
  Etiqueta = ganó (TP antes que SL, con costos).
- Variables (todas con velas cerradas, ajustadas por dirección): retornos de 1 a 252 días en ATR, distancia a las
  SMA 20/50/200, pendientes, RSI 2 y 14, posición en el rango de 20/55/100 días, régimen de volatilidad, día de la
  semana, mes y clase de activo.
- Walk-forward dentro de la selección: para cada año Y de 2013 a 2021 se entrena con operaciones que TERMINARON antes
  del 1/1/Y (sin filtración) y se predice Y. El umbral de operación es un cuantil de las predicciones sobre el propio
  entrenamiento (no del año evaluado). Se opera una a la vez por instrumento.
- Solo si el walk-forward de selección da WR >= 50 % se entrena con toda la selección y se mira 2022–2026.
"""
import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, motor, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

INSTR = sys.argv[1].split(",")
K = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0
RR = 2.1
CLASE = {"SPXUSD": "indice", "NSXUSD": "indice", "GRXEUR": "indice", "JPXJPY": "indice", "UKXGBP": "indice", "FRXEUR": "indice", "AUXAUD": "indice",
         "XAUUSD": "metal", "XAGUSD": "metal", "WTIUSD": "energia", "EURUSD": "fx", "GBPUSD": "fx", "USDJPY": "fx", "AUDUSD": "fx"}


def variables(v):
    c, h, l = v["c"], v["h"], v["l"]
    a = datos.atr(v, 14)
    a5, a20 = datos.atr(v, 5), datos.atr(v, 20)
    X = {}
    for L in (1, 5, 10, 21, 63, 126, 252):
        prev = np.concatenate([np.full(L, np.nan), c[:-L]])
        X[f"ret{L}"] = (c - prev) / (a * np.sqrt(L))
    for n in (20, 50, 200):
        X[f"dsma{n}"] = (c - S.sma(c, n)) / a
    s50, s200 = S.sma(c, 50), S.sma(c, 200)
    X["pend50"] = (s50 - np.concatenate([np.full(10, np.nan), s50[:-10]])) / a
    X["pend200"] = (s200 - np.concatenate([np.full(20, np.nan), s200[:-20]])) / a
    X["rsi2"] = S.rsi(c, 2) - 50
    X["rsi14"] = S.rsi(c, 14) - 50
    for n in (20, 55, 100):
        mx = pd.Series(h).rolling(n).max().values
        mn = pd.Series(l).rolling(n).min().values
        X[f"pos{n}"] = (c - mn) / (mx - mn) - 0.5
    X["vol_ratio"] = a5 / a20
    rel = a / c
    X["vol_pct"] = pd.Series(rel).rolling(252, min_periods=126).rank(pct=True).values
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    X["dow"] = ny.dayofweek.values.astype(float)
    X["mes"] = ny.month.values.astype(float)
    return pd.DataFrame(X), a


DIRECCIONALES = [f"ret{L}" for L in (1, 5, 10, 21, 63, 126, 252)] + ["dsma20", "dsma50", "dsma200", "pend50", "pend200", "rsi2", "rsi14", "pos20", "pos55", "pos100"]

filas = []
datos_m1 = {}
for instr in INSTR:
    m1 = datos.cargar(instr)
    datos_m1[instr] = m1
    v = datos.velas(m1, 1440)
    X, a = variables(v)
    idx = np.arange(len(v["t"]) - 1)
    ok = (~X.iloc[idx].isna().any(axis=1).values) & ~np.isnan(a[idx])
    idx = idx[ok]
    ie = v["i1"][idx] + 1
    ent = m1["o"][ie]
    for d in (1, -1):
        r = motor.simular(m1, ie, np.full(len(ie), d), ent - d * K * a[idx], ent + d * RR * K * a[idx], datos.costo(instr, ent), superponer=True)
        Xi = X.iloc[idx[r["idx_senal"]]].copy()
        for col in DIRECCIONALES:
            Xi[col] = Xi[col] * d
        Xi["dir"] = d
        for cl in ("indice", "metal", "energia", "fx"):
            Xi["clase_" + cl] = float(CLASE.get(instr) == cl)
        Xi["instr"] = instr
        Xi["ie"] = r["ie"]
        Xi["t"] = r["t"]
        Xi["t_salida"] = r["t_salida"]
        Xi["fin"] = r["motivo"] != 3
        Xi["gano"] = (r["r"] > 0).astype(int)
        Xi["r"] = r["r"]
        Xi["sl"] = r["sl"]
        Xi["tp"] = r["tp"]
        filas.append(Xi)
    print(instr, "muestras listas", flush=True)
D = pd.concat(filas, ignore_index=True)
D = D[D.fin]
COLS = [c for c in D.columns if c not in ("instr", "ie", "t", "t_salida", "fin", "gano", "r", "sl", "tp")]
anio = pd.to_datetime(D.t, unit="ms", utc=True).dt.year
resultados = []
predicciones = []
for Y in range(2013, 2022):
    inicio = pd.Timestamp(f"{Y}-01-01", tz="UTC").value // 10**6
    fin_y = pd.Timestamp(f"{Y + 1}-01-01", tz="UTC").value // 10**6
    tr = D[D.t_salida < inicio]
    te = D[(D.t >= inicio) & (D.t < fin_y)]
    if len(tr) < 2000 or len(te) == 0:
        continue
    mod = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=250, l2_regularization=1.0, min_samples_leaf=200, random_state=0)
    mod.fit(tr[COLS], tr.gano)
    p_tr = mod.predict_proba(tr[COLS])[:, 1]
    p_te = mod.predict_proba(te[COLS])[:, 1]
    predicciones.append(te.assign(p=p_te, q90=np.quantile(p_tr, 0.9), q95=np.quantile(p_tr, 0.95), q80=np.quantile(p_tr, 0.8)))
    print(Y, "entrenado con", len(tr), "| tasa base", round(tr.gano.mean(), 3), flush=True)
P = pd.concat(predicciones, ignore_index=True)
out = []
for q in ("q80", "q90", "q95"):
    elegidas = P[P.p >= P[q]]
    # una a la vez por instrumento: simulación con superposición prohibida
    rs = []
    for instr, g in elegidas.groupby("instr"):
        m1 = datos_m1[instr]
        g = g.sort_values("ie")
        ent = m1["o"][g.ie.values]
        ops = motor.simular(m1, g.ie.values, g.dir.values.astype(int), g.sl.values, g.tp.values, datos.costo(instr, ent), superponer=False)
        rs.append(ops["r"][ops["motivo"] != 3])
    s = resumen(np.concatenate(rs)) if rs else dict(n=0)
    s_sup = resumen(elegidas.r.values)
    out.append(dict(umbral=q, n_operable=s.get("n", 0), wr_operable=s.get("wr"), wr_lo=s.get("wr_lo"), expectancy=s.get("expectancy"), payoff=s.get("payoff"),
                    n_superpuestas=s_sup["n"], wr_superpuestas=s_sup["wr"], tasa_base_test=P.gano.mean()))
res = pd.DataFrame(out)
os.makedirs("resultados/E010", exist_ok=True)
res.to_csv(f"resultados/E010/walkforward_k{K}.csv", index=False)
print(res.round(3).to_string(index=False))
