"""
E004 — Retrocesos dentro de la tendencia y reversión de corto plazo (D1), solo selección (< 2022).
Paso 1: acierto condicionado (entradas superpuestas) con SL = k·ATR y TP = 2,1·SL.
Paso 2: las mismas reglas como estrategia operable (una a la vez), para los eventos con n suficiente.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, motor, senales as S  # noqa: E402

INSTR = sys.argv[1].split(",")
CORTE = estrategia.CORTE
RR = 2.1


def eventos(v):
    t200 = S.tendencia(v, 200)
    t100 = S.tendencia(v, 100)
    return {
        "retroceso RSI2<10 en tendencia 200": S.retroceso_rsi(v, 2, 10, 90, t200),
        "retroceso RSI2<25 en tendencia 200": S.retroceso_rsi(v, 2, 25, 75, t200),
        "retroceso RSI2<10 en tendencia 100": S.retroceso_rsi(v, 2, 10, 90, t100),
        "cierre mínimo 5d en tendencia 200": S.retroceso_minimo(v, 5, t200),
        "cierre mínimo 10d en tendencia 200": S.retroceso_minimo(v, 10, t200),
        "toque EMA20 en tendencia 200": S.toque_media(v, 20, t200),
        "toque EMA50 en tendencia 200": S.toque_media(v, 50, t200),
        "reversión RSI2 <5 / >95": S.reversion_rsi(v, 2, 5, 95),
        "día extremo (>2 ATR) contra": S.dia_extremo(v, 2.0),
        "tendencia 200 (todas las velas)": t200,
    }


filas = []
for instr in INSTR:
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    a = datos.atr(v, 14)
    idx = np.arange(len(v["t"]) - 1)
    idx = idx[(~np.isnan(a[idx])) & (v["t"][idx] < CORTE)]
    for nombre, ev in eventos(v).items():
        for d in (1, -1):
            sel = idx[ev[idx] == d]
            if len(sel) < 20:
                continue
            ie = v["i1"][sel] + 1
            ent = m1["o"][ie]
            for k in (1.0, 1.5, 2.0, 3.0):
                rsk = k * a[sel]
                r = motor.simular(m1, ie, np.full(len(ie), d), ent - d * rsk, ent + d * RR * rsk, datos.costo(instr, ent), superponer=True)
                rr = r["r"][r["motivo"] != 3]
                # operable: una a la vez
                ops = estrategia.operaciones(instr, m1, v, np.where(ev == d, d, 0), k, rr=RR, modo="estado", lados=(d,))
                rs = estrategia.resumen_muestras(ops)["sel"]
                filas.append(dict(instr=instr, evento=nombre, dir="largo" if d == 1 else "corto", k_atr=k, n_eventos=len(rr), wr_eventos=float((rr > 0).mean()),
                                  n_oper=rs.get("n", 0), wr_oper=rs.get("wr", np.nan), payoff_oper=rs.get("payoff", np.nan), exp_oper=rs.get("expectancy", np.nan)))
    print(instr, "listo", flush=True)
df = pd.DataFrame(filas)
os.makedirs("resultados/E004", exist_ok=True)
df.to_csv(f"resultados/E004/retrocesos_{'_'.join(INSTR)}.csv", index=False)
x = df.copy()
x["wr_eventos"] = (x.wr_eventos * 100).round(1)
x["wr_oper"] = (x.wr_oper * 100).round(1)
x["exp_oper"] = x.exp_oper.round(2)
print(x[(x.n_oper >= 20)].sort_values("wr_oper", ascending=False).head(30)[["instr", "evento", "dir", "k_atr", "n_eventos", "wr_eventos", "n_oper", "wr_oper", "exp_oper"]].to_string(index=False))
