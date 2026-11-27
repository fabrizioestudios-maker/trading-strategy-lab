"""
E036 — Línea B: tendencia de series de tiempo (momentum de 12 meses) con volatilidad objetivo (BITACORA, entrada 27).

Reglas: cada viernes (cierre diario de las 17:00 NY) la posición de cada activo es el signo de su retorno de 252 días ×
(objetivo por activo / volatilidad EWMA λ = 0,94), con objetivo por activo = 10 % / √N y tope de 3×; se aplica desde el
día siguiente y se mantiene la semana. Costo: la mitad del ida y vuelta de docs/costos.md por unidad de rotación.
Universo: 13 instrumentos con M1 (velas diarias de HistData), 2010-11-15 → 2026-11-14; historia remota: 7 índices de
Yahoo (contado), 1990–2010. Benchmark: risk parity solo compras (7 índices + oro), mismos costos (E029).
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import benchmarks as BM, datos, diario, registro  # noqa: E402

SAL = "resultados/E036"
INSTR = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR",
         "AUXAUD", "HKXHKD"]
INDICES = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "HKXHKD"]
DEV, CONF, FIN = "2010-11-15", "2021-11-15", "2026-11-14"


def costo_rotacion(instr, precio):
    tipo, v = datos.COSTOS[instr]
    return (v if tipo == "pct" else v / precio) / 2


def closes_histdata(instrs):
    cs = {}
    for i in instrs:
        d = BM.cierres_diarios(i)
        cs[i] = d.c
    return pd.DataFrame(cs).sort_index()


def closes_yahoo(instrs):
    cs = {}
    for i in instrs:
        s = diario.desde_csv(diario.archivo(i))
        cs[i] = pd.Series(s["c"], index=s["fecha"])
    return pd.DataFrame(cs).sort_index()


def tsmom(C, objetivo=0.10, lam=0.94, tope=3.0, lookback=252):
    """C: cierres diarios (fechas × activos). Devuelve retornos diarios de la cartera, pesos y rotación."""
    R = C.pct_change()
    vol = np.sqrt(R.pow(2).ewm(alpha=1 - lam, adjust=False).mean() * 252)
    mom = C / C.shift(lookback) - 1
    viernes = C.index.dayofweek == 4
    activos = R.notna() & mom.notna() & (vol > 0)
    N = activos.sum(axis=1).clip(lower=1)
    obj = objetivo / np.sqrt(N)
    W = np.sign(mom).mul(obj, axis=0).div(vol).clip(-tope, tope).where(activos)
    W = W.where(pd.Series(viernes, index=C.index), np.nan).ffill().fillna(0.0)
    Wl = W.shift(1).fillna(0.0)
    costos = pd.DataFrame({i: [costo_rotacion(i, p) for p in C[i].ffill().bfill().values] for i in C.columns}, index=C.index)
    rot = (W.diff().abs().fillna(W.abs()) * costos).sum(axis=1).shift(1).fillna(0.0)
    bruto = (Wl * R.fillna(0.0)).sum(axis=1)
    return bruto - rot, W, rot


def tramo(r, a, b):
    x = r[(r.index >= a) & (r.index < b)]
    return BM.metricas_serie(x)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    C = closes_histdata(INSTR)
    C = C[C.index >= pd.Timestamp("2009-11-01")]
    r, W, rot = tsmom(C)
    r = r[r.index >= DEV]
    r = r[r.index < FIN]
    r.to_csv(f"{SAL}/retornos_diarios.csv", header=["r"])
    filas = [dict(tramo="desarrollo 2010-11 a 2021-11", **tramo(r, DEV, CONF)),
             dict(tramo="confirmación 2021-11 a 2026-11", **tramo(r, CONF, FIN)),
             dict(tramo="todo 2010-11 a 2026-11", **tramo(r, DEV, FIN))]
    # benchmark: risk parity solo compras, 7 índices + oro, mismos costos
    rp_cols = INDICES + ["XAUUSD"]
    Rb = C[rp_cols].pct_change()
    costos = {i: costo_rotacion(i, float(C[i].dropna().iloc[-1])) for i in rp_cols}
    rb, Wb = BM.risk_parity(Rb, costos=costos)
    rb = rb.reindex(r.index).fillna(0.0)
    rb.to_csv(f"{SAL}/risk_parity_diario.csv", header=["r"])
    filas.append(dict(tramo="benchmark risk parity 2010-11 a 2026-11", **BM.metricas_serie(rb)))
    tas = BM.tasacion(r, rb)
    # historia remota: 7 índices de Yahoo, 1990–2010
    Cy = closes_yahoo(INDICES)
    Cy = Cy[(Cy.index >= "1989-01-01") & (Cy.index < "2010-11-15")]
    ry, _, _ = tsmom(Cy)
    ry = ry[(ry.index >= "1990-01-01") & (ry.index < "2010-01-01")]
    ry.to_csv(f"{SAL}/retornos_remotos_1990_2009.csv", header=["r"])
    filas.append(dict(tramo="remota 1990–2009 (7 índices, Yahoo)", **BM.metricas_serie(ry)))
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    print(t.round(3).to_string(index=False))
    print("tasación contra risk parity (2010-11 a 2026-11):", {k: round(v, 3) for k, v in tas.items()})
    conf_sh = t.iloc[1].sharpe
    pasa = conf_sh > 0 and tas["ir_tasacion"] >= 0.3 and tas["p_alfa"] < 0.05 and t.iloc[4].sharpe > 0.3
    print("PASA" if pasa else "NO PASA", flush=True)
    pd.Series(tas).to_csv(f"{SAL}/tasacion.csv")
    registro.registrar("E036", __file__, hipotesis="Tendencia de 12 meses con volatilidad objetivo agrega alfa sobre risk parity",
                       universo="13 instrumentos D1; remota 7 índices 1990–2009", n_variantes=1, resultados=t, benchmark=tas,
                       estado="pasa" if pasa else "no pasa")
