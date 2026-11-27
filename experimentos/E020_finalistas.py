"""
E020 — Pruebas de las finalistas de E019 (BITACORA, entrada 18, punto 4).

Para cada una de las primeras N de resultados/E019/elegidas.csv (sin los controles "comprar/vender siempre"):
- resultados año por año en los 5 años (noviembre a noviembre);
- los mismos parámetros en 2011–2021 (diez años que no se usaron para nada);
- con costos dobles y con TP = 2,1 × SL (los 5 años);
- comparación con comprar o vender siempre (mismo instrumento, temporalidad, dirección y k).

Uso: python experimentos/E020_finalistas.py [N]   (por defecto 15)
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, grilla  # noqa: E402
from lab.metricas import resumen  # noqa: E402


def ms(f):
    return pd.Timestamp(f, tz="UTC").value // 10**6


T_INI, CARGA = ms("2021-11-15"), ms("2020-01-01")
ANIOS = [(ms(f"{y}-11-15"), ms(f"{y + 1}-11-15")) for y in range(2021, 2026)]
HIST = (ms("2011-11-15"), ms("2021-11-15"))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 15

el = pd.read_csv("resultados/E019/elegidas.csv")
el = el[el.familia != "siempre"].head(N).reset_index(drop=True)
cache = {}


def m1_de(instr, recorte):
    if (instr, recorte) not in cache:
        m = datos.cargar(instr)
        if recorte:
            a = np.searchsorted(m["t"], CARGA)
            m = {k: v[a:] for k, v in m.items()}
        cache[(instr, recorte)] = m
    return cache[(instr, recorte)]


def corto(s):
    return dict(n=s.get("n", 0), wr=round(100 * s.get("wr", np.nan), 1) if s.get("n") else np.nan,
                exp=round(s.get("expectancy", np.nan), 3) if s.get("n") else np.nan,
                pf=round(s.get("pf", np.nan), 2) if s.get("n") else np.nan, dd=round(s.get("max_dd", np.nan), 1) if s.get("n") else np.nan)


filas = []
for i, f in el.iterrows():
    args = (f.instr, f.tf, f.familia, str(f.param), f.modo, f.filtro, f["dir"], float(f.k))
    o5 = grilla.operaciones_config(*args, T_INI, m1=m1_de(f.instr, True))
    oh = grilla.operaciones_config(*args, HIST[0], HIST[1], m1=m1_de(f.instr, False))
    oc2 = grilla.operaciones_config(*args, T_INI, costo_mult=2.0, m1=m1_de(f.instr, True))
    o21 = grilla.operaciones_config(*args, T_INI, rr=2.1, m1=m1_de(f.instr, True))
    fila = dict(rango=i + 1, instr=f.instr, tf=f.tf, familia=f.familia, param=f.param, modo=f.modo, filtro=f.filtro, dir=f["dir"], k=f.k)
    for nombre, o in (("5a", o5), ("2011_21", oh), ("costo2", oc2), ("tp21", o21)):
        for kk, vv in corto(resumen(o.r.values)).items():
            fila[f"{kk}_{nombre}"] = vv
    for j, (a, b) in enumerate(ANIOS):
        m = (o5.t >= a) & (o5.t < b)
        fila[f"wr_a{j + 1}"] = round(100 * (o5.r[m] > 0).mean(), 1) if m.sum() else np.nan
        fila[f"n_a{j + 1}"] = int(m.sum())
    fila["wr_siempre_5a"] = round(100 * f.wr_siempre, 1) if pd.notna(f.wr_siempre) else np.nan
    filas.append(fila)
    print(f"{i + 1}. {f.instr} {f.tf} {f.familia} {f.param} {f.modo} {f.filtro} {f['dir']} k={f.k}: "
          f"5a {fila['wr_5a']}% n={fila['n_5a']} · 2011–21 {fila['wr_2011_21']}% n={fila['n_2011_21']} exp={fila['exp_2011_21']} · "
          f"costos x2 {fila['wr_costo2']}% exp={fila['exp_costo2']} · TP 2,1 {fila['wr_tp21']}% · siempre {fila['wr_siempre_5a']}%", flush=True)
out = pd.DataFrame(filas)
os.makedirs("resultados/E020", exist_ok=True)
out.to_csv("resultados/E020/finalistas.csv", index=False)
print("\n" + out.to_string(index=False))
