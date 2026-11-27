"""
E030 — Perfiles de ejecución 2.0 sobre las candidatas (BITACORA, entrada 27).

Para cada candidata: expectancy sin costos, optimista, base, conservador (~P75) y estrés (lab/ejecucion.py), costo de
equilibrio C_max (AlgoXpert) y estado: "no operable" si pierde con el perfil base, "frágil" si pierde con el conservador.
Las entradas a mercado pagan deslizamiento y latencia; las límite (ICT 5) no. Swaps por clase de activo.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import candidatas as C  # noqa: E402
from lab import datos, ejecucion as EJ, registro  # noqa: E402

SAL = "resultados/E030"

if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    cands = {
        "E022 oro D1": (C.e022(), False),
        "candidata B (8 activos)": (C.candidata_b(), False),
        "líderes (hasta 2021)": (C.lideres(), False),
        "ICT 5 oro (2010–2026)": (pd.concat([C.ict5_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.ict5_oro()]), True),
        "SMC oro (2010–2026)": (pd.concat([C.smc_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.smc_oro()]), False),
    }
    vols = {}
    tablas, filas = [], []
    for nombre, (ops, limite) in cands.items():
        partes = []
        for instr, o in ops.groupby("instr"):
            if instr not in vols:
                vols[instr] = EJ.Volatilidad(datos.cargar(instr))
            t, info = EJ.tabla_perfiles(o.reset_index(drop=True), instr, vols[instr], entrada_limite=limite)
            partes.append(t.assign(instr=instr, n_instr=len(o)))
        tt = pd.concat(partes)
        # agregado de la candidata (ponderado por operaciones)
        agg = tt.groupby("perfil", sort=False).apply(lambda g: pd.Series(dict(
            n=g.n.sum(), exp=np.average(g.exp, weights=g.n), wr=np.average(g.wr, weights=g.n),
            costo_medio_r=np.average(g.costo_medio_r, weights=g.n)))).reset_index()
        exp = dict(zip(agg.perfil, agg.exp))
        bruto = exp["sin_costos"]
        estado = "no operable" if exp["base"] <= 0 else ("frágil" if exp["conservador"] <= 0 else "operable")
        base_cost = float(agg[agg.perfil == "base"].costo_medio_r.iloc[0])
        filas.append(dict(estrategia=nombre, n=int(agg.n.iloc[0]), **{f"exp_{k}": v for k, v in exp.items()},
                          c_max_r=bruto, costo_base_r=base_cost, margen_costos=bruto / base_cost if base_cost > 0 else np.nan,
                          estado=estado))
        tablas.append(agg.assign(estrategia=nombre))
        print(nombre, {k: round(v, 3) for k, v in exp.items()}, "C_max", round(bruto, 3), "costo base", round(base_cost, 3), estado, flush=True)
    res = pd.DataFrame(filas)
    res.to_csv(f"{SAL}/resumen.csv", index=False)
    pd.concat(tablas).to_csv(f"{SAL}/perfiles.csv", index=False)
    print(res.round(3).to_string(index=False))
    registro.registrar("E030", __file__, hipotesis="La ventaja resiste costos realistas por sesión y volatilidad",
                       n_variantes=len(cands), resultados=res,
                       costos=dict(perfiles=EJ.PERFILES, sesiones=EJ.SESION_MULT, parte_spread=EJ.PARTE_SPREAD,
                                   k_entrada=EJ.K_ENTRADA, k_stop=EJ.K_STOP, swaps=EJ.SWAPS))
