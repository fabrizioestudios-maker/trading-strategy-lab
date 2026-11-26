"""
E002 — Filtros de tendencia y momentum con stops anchos (D1), solo muestra de selección (entradas < 2022).

Para cada vela diaria donde el filtro marca dirección, se entra en esa dirección (apertura siguiente) con SL = k·ATR(14)
y TP = 2·SL, permitiendo superposición: mide P(TP antes que SL) condicionado al filtro, para comparar con la línea de
base (E001, entrar todos los días). Lo que mejore claramente la línea de base pasa a E003 (estrategia operable,
una operación a la vez).
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, motor, senales as S  # noqa: E402

INSTR = sys.argv[1].split(",") if len(sys.argv) > 1 else ["XAUUSD", "EURUSD"]
CORTE = pd.Timestamp("2022-01-01", tz="UTC").value // 10**6
KS = [2.0, 3.0, 4.0, 5.0]


def filtros(v):
    f = {
        "ninguno (largo siempre)": np.ones(len(v["c"]), int),
        "ninguno (corto siempre)": -np.ones(len(v["c"]), int),
    }
    for n in (50, 100, 200):
        f[f"cierre vs SMA{n}"] = S.sobre_sma(v, n)
        f[f"pendiente SMA{n}"] = S.pendiente_sma(v, n)
    for l in (21, 63, 126, 252):
        f[f"momentum {l}d"] = S.momentum(v, l)
    f["cruce SMA20/100"] = S.cruce_medias(v, 20, 100)
    f["cruce SMA50/200"] = S.cruce_medias(v, 50, 200)
    for l in (20, 55, 100):
        f[f"Donchian {l} (estado)"] = S.donchian_estado(v, l)
    f["momentum 252d + SMA200"] = S.combinar(S.momentum(v, 252), S.sobre_sma(v, 200))
    f["momentum 63d + 252d"] = S.combinar(S.momentum(v, 63), S.momentum(v, 252))
    return f


filas = []
for instr in INSTR:
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    a = datos.atr(v, 14)
    ks_ok = np.arange(len(v["t"]) - 1)
    ks_ok = ks_ok[(~np.isnan(a[ks_ok])) & (v["t"][ks_ok] < CORTE)]
    for nombre, f in filtros(v).items():
        for d in (1, -1):
            sel = ks_ok[f[ks_ok] == d]
            if len(sel) < 30:
                continue
            ie = v["i1"][sel] + 1
            ent = m1["o"][ie]
            for k in KS:
                riesgo = k * a[sel]
                r = motor.simular(m1, ie, np.full(len(ie), d), ent - d * riesgo, ent + d * 2 * riesgo, datos.costo(instr, ent), superponer=True)
                rr = r["r"][r["motivo"] != 3]
                filas.append(dict(instr=instr, filtro=nombre, dir="largo" if d == 1 else "corto", k_atr=k, n=len(rr),
                                  wr=float((rr > 0).mean()), expectancy=float(rr.mean()), dias_frac=len(sel) / len(ks_ok)))
    print(instr, "listo", flush=True)
df = pd.DataFrame(filas)
os.makedirs("resultados/E002", exist_ok=True)
df.to_csv(f"resultados/E002/filtros_{'_'.join(INSTR)}.csv", index=False)
for instr in INSTR:
    x = df[df.instr == instr]
    p = x.pivot_table(index=["filtro"], columns=["dir", "k_atr"], values="wr")
    print("\n====", instr, "(WR % en selección, con costos; entradas superpuestas)")
    print((p * 100).round(1).to_string())
