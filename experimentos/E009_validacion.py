"""
E009 — Validación de UNA configuración congelada (elegida solo con la muestra de selección).
Imprime selección y validación (2022–2026), por año, por instrumento, vecinos de parámetros (±20 % en k y en el
largo del retroceso), intervalo de Wilson contra la línea de base (entrar en cualquier vela de tendencia con el mismo
SL/TP) y Monte Carlo del drawdown (remuestreo del orden de las operaciones).
Uso: python experimentos/E009_validacion.py INSTR1,INSTR2,... --evento minimo --largo 10 --k 3.5
"""
import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402
from lab.metricas import cumple, resumen  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("instr")
ap.add_argument("--evento", default="minimo", choices=["minimo", "rsi2", "control"])
ap.add_argument("--largo", type=int, default=10)
ap.add_argument("--umbral", type=float, default=25)
ap.add_argument("--k", type=float, default=3.5)
ap.add_argument("--rr", type=float, default=2.1)
ap.add_argument("--nombre", default="candidata")
a = ap.parse_args()
INSTR = a.instr.split(",")


def senal(v, evento, largo, umbral):
    t = S.tendencia(v, 200)
    if evento == "minimo":
        return S.retroceso_minimo(v, largo, t)
    if evento == "rsi2":
        return S.retroceso_rsi(v, 2, umbral, 100 - umbral, t)
    return t


def correr(k, largo, umbral, evento):
    todas = []
    for instr in INSTR:
        m1 = datos.cargar(instr)
        v = datos.velas(m1, 1440)
        ev = senal(v, evento, largo, umbral)
        ops = estrategia.operaciones(instr, m1, v, np.where(ev == 1, 1, 0), k, rr=a.rr, lados=(1,))
        if ops is None:
            continue
        m = ops["motivo"] != 3
        todas.append(pd.DataFrame(dict(instr=instr, t=ops["t"][m], t_salida=ops["t_salida"][m], r=ops["r"][m])))
    return pd.concat(todas, ignore_index=True).sort_values("t")


def partes(df):
    sel, val = df[df.t < estrategia.CORTE], df[df.t >= estrategia.CORTE]
    return resumen(sel.r.values, sel.t.values, sel.t_salida.values), resumen(val.r.values, val.t.values, val.t_salida.values)


base = correr(a.k, a.largo, a.umbral, a.evento)
s_sel, s_val = partes(base)
ctrl = correr(a.k, a.largo, a.umbral, "control")
c_sel, c_val = partes(ctrl)
base["anio"] = pd.to_datetime(base.t, unit="ms", utc=True).year
por_anio = base.groupby("anio").r.agg(n="count", wr=lambda x: (x > 0).mean(), r_total="sum")
por_instr = base.assign(m=np.where(base.t < estrategia.CORTE, "selección", "validación")).groupby(["instr", "m"]).r.agg(n="count", wr=lambda x: (x > 0).mean(), expectancy="mean")
vecinos = []
for dk in (0.8, 1.0, 1.2):
    for dl in ((0.8, 1.0, 1.2) if a.evento != "control" else (1.0,)):
        k2, l2, u2 = a.k * dk, max(2, int(round(a.largo * dl))), a.umbral * dl
        x = correr(k2, l2, u2, a.evento)
        ss, sv = partes(x)
        vecinos.append(dict(k=round(k2, 2), largo=l2, umbral=round(u2, 1), sel_n=ss["n"], sel_wr=ss["wr"], val_n=sv["n"], val_wr=sv["wr"], val_pf=sv.get("pf")))
rng = np.random.default_rng(0)
r_all = base.r.values
dds = []
for _ in range(2000):
    c = np.cumsum(rng.permutation(r_all))
    dds.append(np.max(np.maximum.accumulate(np.concatenate([[0], c])) - np.concatenate([[0], c])))
out = dict(config=vars(a), seleccion=s_sel, validacion=s_val, control_seleccion=c_sel, control_validacion=c_val, veredicto=cumple(s_sel, s_val),
           dd_montecarlo_p50=float(np.percentile(dds, 50)), dd_montecarlo_p95=float(np.percentile(dds, 95)),
           anios_positivos=float((por_anio.r_total > 0).mean()))
os.makedirs("resultados/E009", exist_ok=True)
base_n = f"resultados/E009/{a.nombre}"
json.dump(out, open(base_n + ".json", "w"), indent=1, default=float)
por_anio.to_csv(base_n + "_por_anio.csv")
por_instr.to_csv(base_n + "_por_instrumento.csv")
pd.DataFrame(vecinos).to_csv(base_n + "_vecinos.csv", index=False)
f = lambda s: f"n={s['n']}, WR={s['wr']*100:.1f}% [{s['wr_lo']*100:.1f}–{s['wr_hi']*100:.1f}], payoff={s['payoff']:.2f}, PF={s['pf']:.2f}, exp={s['expectancy']:+.3f}R, maxDD={s['max_dd']:.1f}R"
print("CONFIG", vars(a))
print("Selección :", f(s_sel)); print("Validación:", f(s_val))
print("Control (cualquier vela en tendencia) sel:", f(c_sel)); print("Control val:", f(c_val))
print("VEREDICTO:", out["veredicto"], "| años positivos:", round(out["anios_positivos"] * 100), "% | DD Monte Carlo p50/p95:", round(out["dd_montecarlo_p50"], 1), round(out["dd_montecarlo_p95"], 1), "R")
print(por_anio.assign(wr=(por_anio.wr * 100).round(1), r_total=por_anio.r_total.round(1)).to_string())
print(por_instr.assign(wr=(por_instr.wr * 100).round(1), expectancy=por_instr.expectancy.round(2)).to_string())
print(pd.DataFrame(vecinos).assign(sel_wr=lambda d: (d.sel_wr * 100).round(1), val_wr=lambda d: (d.val_wr * 100).round(1), val_pf=lambda d: d.val_pf.round(2)).to_string(index=False))
