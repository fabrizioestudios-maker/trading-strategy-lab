"""
E032 — Monte Carlo, riesgo de ruina y cartera (BITACORA, entrada 27).

1) Bootstrap por bloques de 5 operaciones (10.000 trayectorias, 5 años) de cada candidata con costos CONSERVADORES
   (lab/ejecucion.py): drawdown máximo, P(DD > 10/20/30 %), ruina (−50 %), rachas y recuperación con 0,25, 0,5 y 1 %
   de riesgo por operación. Riesgo sugerido (regla descriptiva): el mayor con P(DD > 20 % en 5 años) < 5 %.
2) Cartera E022 (1 %) + ICT 5 (0,5 %) + E036 (a la mitad de su tamaño): correlaciones diarias, riesgo simultáneo,
   drawdown conjunto y ratio de diversificación, 15/11/2011–13/11/2026.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import candidatas as C  # noqa: E402
from lab import benchmarks as BM, cartera, datos, ejecucion as EJ, montecarlo as MC, registro  # noqa: E402

SAL = "resultados/E032"


def conservador(ops, limite=False):
    partes = []
    for instr, o in ops.groupby("instr"):
        vol = EJ.Volatilidad(datos.cargar(instr))
        partes.append(EJ.aplicar(o.reset_index(drop=True), instr, vol, "conservador", entrada_limite=limite))
    return pd.concat(partes).sort_values("t").reset_index(drop=True)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    ict_todo = pd.concat([C.ict5_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.ict5_oro()])
    cands = {"E022 oro D1": (C.e022(), False), "ICT 5 oro": (ict_todo, True),
             "candidata B": (C.candidata_b(), False), "líderes (≤2021)": (C.lideres(), False)}
    filas = []
    conservadas = {}
    for nombre, (ops, lim) in cands.items():
        oc = conservador(ops, lim)
        conservadas[nombre] = oc
        anios = (oc.t_salida.max() - oc.t.min()) / (365.25 * 86400000)
        tab = MC.tabla_riesgo(oc.r.values, len(oc) / anios, anios=5)
        tab.insert(0, "estrategia", nombre)
        tab["exp_conservador"] = oc.r.mean()
        tab["riesgo_sugerido_pct"] = MC.riesgo_sugerido(tab)
        filas.append(tab)
        print(nombre, f"exp conservador {oc.r.mean():+.3f}", tab[["riesgo_pct", "dd_mediana", "dd_p95", "p_dd_20", "ruina",
                                                                  "racha_perdedora_p95", "final_mediana"]].round(3).to_dict("records"), flush=True)
    t = pd.concat(filas, ignore_index=True)
    t.to_csv(f"{SAL}/montecarlo.csv", index=False)
    # cartera
    oro = BM.cierres_diarios("XAUUSD")
    r22 = BM.diario_mtm(conservadas["E022 oro D1"], oro)
    ab22 = BM.posiciones_abiertas(conservadas["E022 oro D1"], oro)
    ict = conservadas["ICT 5 oro"]
    rict = BM.diario_mtm(ict, oro)
    abict = BM.posiciones_abiertas(ict, oro)
    r36 = pd.read_csv("resultados/E036/retornos_diarios.csv", index_col=0, parse_dates=True).r
    idx = oro.index[(oro.index >= "2011-11-15") & (oro.index < "2026-11-14")]
    series = {"E022": r22.reindex(idx).fillna(0.0), "ICT5": rict.reindex(idx).fillna(0.0), "E036": (r36 / 0.01).reindex(idx).fillna(0.0)}
    abiertas = {"E022": ab22.reindex(idx).fillna(0.0), "ICT5": abict.reindex(idx).fillna(0.0), "E036": pd.Series(0.0, index=idx)}
    riesgos = {"E022": 0.01, "ICT5": 0.005, "E036": 0.005}
    res, port = cartera.resumen(series, abiertas, riesgos)
    corr = res.pop("correlaciones")
    corr.to_csv(f"{SAL}/correlaciones.csv")
    port.to_csv(f"{SAL}/cartera_diaria.csv", header=["r"])
    solo = {k: BM.metricas_serie(series[k] * riesgos[k]) for k in series}
    print("correlaciones diarias:\n", corr.round(3).to_string())
    print("cartera:", {k: round(v, 3) for k, v in res.items()})
    print("cada una sola:", {k: {kk: round(vv, 3) for kk, vv in v.items()} for k, v in solo.items()})
    pd.DataFrame([dict(componente=k, **v) for k, v in solo.items()] + [dict(componente="cartera", **{k: res[k] for k in ("sharpe", "cagr", "vol", "max_dd")})]).to_csv(
        f"{SAL}/cartera_resumen.csv", index=False)
    pd.Series(res).to_csv(f"{SAL}/cartera_riesgo.csv")
    registro.registrar("E032", __file__, hipotesis="Riesgo de ruina y cartera de las candidatas", resultados=t,
                       cartera=res, correlaciones=corr)
