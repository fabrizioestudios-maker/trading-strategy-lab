"""
E016 — Posicionamiento del COT como señal (hipótesis registradas antes de ver resultados). Solo selección (< 2022).
Índice COT = percentil de la posición neta de los especuladores (leveraged money / managed money) en 156 semanas.
El reporte rige desde el cierre diario del viernes de publicación. SL = k·ATR(14) diario, TP = 2,1·SL, una a la vez.
H1 contraria: índice < 0,10 → compra; > 0,90 → venta.
H2 flujo: cambio de 4 semanas de la posición neta (sobre el open interest) > 0 → compra; < 0 → venta.
H3 tendencia + poco cargados: tendencia 200 alcista e índice < 0,30 → compra; bajista e índice > 0,70 → venta.
H4 tendencia + muy cargados: tendencia alcista e índice > 0,70 → compra; bajista e índice < 0,30 → venta.
Comparación: comprar siempre / vender siempre en los mismos 9 instrumentos.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import cot, datos, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

UNIV = list(cot.MERCADOS)
RR = 2.1
cache = {}
for i in UNIV:
    m1 = datos.cargar(i)
    v = datos.velas(m1, 1440)
    df = cot.cargar(i)
    idx = cot.a_velas_diarias(df, cot.indice_cot(df), v)
    flujo = cot.a_velas_diarias(df, (df.neto - df.neto.shift(4)) / df.oi, v)
    cache[i] = dict(m1=m1, v=v, idx=idx, flujo=flujo, t200=S.tendencia(v, 200))


def senal(nombre, d):
    idx, fl, t = d["idx"], d["flujo"], d["t200"]
    n = len(t)
    if nombre == "comprar siempre":
        return np.ones(n, int)
    if nombre == "vender siempre":
        return -np.ones(n, int)
    if nombre == "H1 contraria extremos":
        return np.where(idx < 0.10, 1, np.where(idx > 0.90, -1, 0))
    if nombre == "H2 flujo 4 semanas":
        return np.where(fl > 0, 1, np.where(fl < 0, -1, 0))
    if nombre == "H3 tendencia + poco cargados":
        return np.where((t == 1) & (idx < 0.30), 1, np.where((t == -1) & (idx > 0.70), -1, 0))
    if nombre == "H4 tendencia + muy cargados":
        return np.where((t == 1) & (idx > 0.70), 1, np.where((t == -1) & (idx < 0.30), -1, 0))
    raise ValueError(nombre)


filas = []
for nombre in ["comprar siempre", "vender siempre", "H1 contraria extremos", "H2 flujo 4 semanas", "H3 tendencia + poco cargados", "H4 tendencia + muy cargados"]:
    for k in (2.0, 3.0, 4.0):
        por_lado = {1: [], -1: []}
        for i, d in cache.items():
            s = senal(nombre, d)
            ops = estrategia.operaciones(i, d["m1"], d["v"], s, k, rr=RR, lados=(1, -1))
            if ops is None:
                continue
            m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
            for lado in (1, -1):
                por_lado[lado].append(ops["r"][m & (ops["dir"] == lado)])
        todo = np.concatenate(por_lado[1] + por_lado[-1])
        s_all = resumen(todo)
        s_l, s_c = resumen(np.concatenate(por_lado[1])), resumen(np.concatenate(por_lado[-1]))
        filas.append(dict(senal=nombre, k_atr=k, n=s_all["n"], wr=s_all.get("wr"), wr_lo=s_all.get("wr_lo"), payoff=s_all.get("payoff"), pf=s_all.get("pf"), expectancy=s_all.get("expectancy"),
                          n_largos=s_l.get("n", 0), wr_largos=s_l.get("wr"), n_cortos=s_c.get("n", 0), wr_cortos=s_c.get("wr")))
    print(nombre, "listo", flush=True)
df = pd.DataFrame(filas)
os.makedirs("resultados/E016", exist_ok=True)
df.to_csv("resultados/E016/cot_seleccion.csv", index=False)
o = df.copy()
for c in ("wr", "wr_lo", "wr_largos", "wr_cortos"):
    o[c] = (o[c] * 100).round(1)
print(o.round(3).to_string(index=False))
