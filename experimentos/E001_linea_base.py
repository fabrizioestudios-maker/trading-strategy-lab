"""
E001 — Línea de base: acierto de entradas "a ciegas" con RR 1:2.

Cada cierre de vela de la temporalidad (H1, H4, D1) es una entrada, en las dos direcciones, con SL = k × ATR(14) de esa
temporalidad y TP = 2 × SL. Se permite superponer operaciones: no es una estrategia, es la probabilidad incondicional
P(TP antes que SL), que mide cuánta deriva hay. Sin deriva da 33,3 %.
Muestras: selección (< 2022) y validación (>= 2022), por separado.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, motor  # noqa: E402

INSTR = [x for x in ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "SPXUSD", "NSXUSD", "GRXEUR"] if os.path.exists(os.path.join(datos.RAIZ, x + ".npz"))]
if len(sys.argv) > 1:
    INSTR = sys.argv[1].split(",")
TFS = [60, 240, 1440]
KS = [0.5, 1.0, 2.0, 3.0]
CORTE = pd.Timestamp("2022-01-01", tz="UTC").value // 10**6

filas = []
for instr in INSTR:
    m1 = datos.cargar(instr)
    for tf in TFS:
        v = datos.velas(m1, tf)
        a = datos.atr(v, 14)
        ks = np.arange(len(v["t"]) - 1)
        ks = ks[~np.isnan(a[ks])]
        ie = v["i1"][ks] + 1
        ent = m1["o"][np.clip(ie, 0, len(m1["o"]) - 1)]
        for k in KS:
            for d in (1, -1):
                riesgo = k * a[ks]
                sl = ent - d * riesgo
                tp = ent + d * 2 * riesgo
                cst = datos.costo(instr, ent)
                for etiqueta, cc in (("con costos", cst), ("sin costos", np.zeros(len(ie)))):
                    r = motor.simular(m1, ie, np.full(len(ie), d), sl, tp, cc, superponer=True)
                    t = r["t"]
                    for muestra, msk in (("seleccion", t < CORTE), ("validacion", t >= CORTE)):
                        rr = r["r"][msk]
                        # se excluyen las que llegaron al fin de datos sin resolverse
                        rr = rr[r["motivo"][msk] != 3]
                        filas.append(dict(instr=instr, tf=tf, k_atr=k, dir="largo" if d == 1 else "corto", costos=etiqueta, muestra=muestra,
                                          n=len(rr), wr=float((rr > 0).mean()) if len(rr) else np.nan, expectancy=float(rr.mean()) if len(rr) else np.nan))
        print(instr, tf, "listo", flush=True)
df = pd.DataFrame(filas)
os.makedirs("resultados/E001", exist_ok=True)
nombre = "resultados/E001/linea_base" + ("_" + "_".join(INSTR) if len(sys.argv) > 1 else "") + ".csv"
df.to_csv(nombre, index=False)
p = df[df.costos == "con costos"].pivot_table(index=["instr", "tf", "k_atr"], columns=["muestra", "dir"], values="wr")
print((p * 100).round(1).to_string())
