"""
E031 — Pruebas múltiples sobre las grandes búsquedas (BITACORA, entrada 27).

Uso:
  python experimentos/E031_pruebas_multiples.py fdr   # Bonferroni, Holm, BH y BY en E019, E023 y E025 (muestra de elección)
  python experimentos/E031_pruebas_multiples.py spa   # SPA de Hansen sobre el universo D1 re-simulado en E028b (15 años)

Valor p de cada configuración: t de una cola para expectancy > 0 en la muestra de elección.
- E019: desvío de dos resultados (RR 2): 3·√(p(1−p)), con p el acierto de la elección.
- E023 y E025: el desvío total de la grilla (sd_tot) como aproximación del desvío de la elección.
Replicación: fracción con expectancy > 0 en la confirmación (n ≥ 10) entre descubiertas y no descubiertas.
"""
import glob
import os
import sys

import numpy as np
import pandas as pd
from scipy import sparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import multiples as MT, registro, walkforward as wf  # noqa: E402

SAL = "resultados/E031"


def grillas():
    g19 = pd.concat([pd.read_csv(f) for f in glob.glob("resultados/E019/grilla_*.csv.gz")], ignore_index=True)
    g19["sd_is"] = 3 * np.sqrt(g19.wr_is * (1 - g19.wr_is))
    g23 = pd.read_csv("resultados/E023/todas_resumen.csv.gz")
    g23["sd_is"] = g23.sd_tot
    g25 = pd.concat([pd.read_csv(f) for f in glob.glob("resultados/E025/grilla_*.csv.gz")], ignore_index=True)
    g25["sd_is"] = g25.sd_tot
    return {"E019": g19, "E023": g23, "E025": g25}


def modo_fdr():
    os.makedirs(SAL, exist_ok=True)
    filas = []
    for nombre, g in grillas().items():
        g = g[(g.n_is >= 10) & g.exp_is.notna()].copy()
        p = MT.p_media_positiva(g.exp_is, g.sd_is, g.n_is)
        conf = (g.n_oos >= 10) & g.exp_oos.notna()
        rep = (g.exp_oos > 0) & conf
        base = dict(busqueda=nombre, configuraciones=len(g), p_menor_005=int((p < 0.05).sum()),
                    esperadas_por_azar_005=round(0.05 * np.isfinite(p).sum(), 1),
                    replica_no_descubiertas=float(rep[conf & ~(p < 0.05)].mean()))
        for metodo, mask in (("Bonferroni 5 %", MT.bonferroni(p, 0.05)), ("Holm 5 %", MT.holm(p, 0.05)),
                             ("BH 5 %", MT.bh(p, 0.05)), ("BH 10 %", MT.bh(p, 0.10)), ("BY 5 %", MT.by(p, 0.05)),
                             ("sin corrección p < 0,05", p < 0.05)):
            d = mask & conf
            filas.append(dict(base, metodo=metodo, descubiertas=int(mask.sum()),
                              con_confirmacion=int(d.sum()), replica_en_confirmacion=float(rep[d].mean()) if d.any() else np.nan,
                              exp_conf_descubiertas=float(g.exp_oos[d].mean()) if d.any() else np.nan))
        g.assign(p=p).sort_values("p").head(200).to_csv(f"{SAL}/{nombre}_200_menores_p.csv", index=False)
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/fdr.csv", index=False)
    print(t.round(3).to_string(index=False))
    registro.registrar("E031-fdr", __file__, hipotesis="¿Cuántas configuraciones sobreviven a la corrección por pruebas múltiples?",
                       n_variantes=int(t.groupby("busqueda").configuraciones.first().sum()), resultados=t)


def modo_spa():
    os.makedirs(SAL, exist_ok=True)
    z = np.load("resultados/E028/b_operaciones.npz")
    cfgs = pd.read_csv("resultados/E028/b_configuraciones.csv.gz")
    a, b = wf.ms("2011-11-15"), wf.ms("2026-11-14")
    m = (z["t"] >= a) & (z["t"] < b)
    cfg, ts, r = z["cfg"][m], z["t_salida"][m], z["r"][m].astype(float)
    dias = pd.bdate_range("2011-11-15", "2026-11-13")
    d_ms = dias.values.astype("datetime64[ms]").astype(np.int64)
    fila = np.clip(np.searchsorted(d_ms, ts, side="right") - 1, 0, len(dias) - 1)
    K = int(cfgs.cfg.max()) + 1
    X = sparse.coo_matrix((r, (fila, cfg)), shape=(len(dias), K)).tocsc()
    X.sum_duplicates()
    ntr = np.bincount(cfg, minlength=K)
    usar = np.flatnonzero(ntr >= 30)
    res = MT.spa(X[:, usar], B=2000, L=20.0, semilla=0)
    mejor = cfgs.iloc[usar[res["mejor"]]].to_dict()
    res["mejor_config"] = {k: (v if not isinstance(v, (np.integer, np.floating)) else float(v)) for k, v in mejor.items()}
    res["mejor_n"] = int(ntr[usar[res["mejor"]]])
    print(res)
    pd.Series({k: v for k, v in res.items() if k != "mejor_config"}).to_csv(f"{SAL}/spa.csv")
    pd.Series(res["mejor_config"]).to_csv(f"{SAL}/spa_mejor.csv")
    registro.registrar("E031-spa", __file__, hipotesis="La mejor regla D1 supera a no operar tras corregir por la búsqueda",
                       universo="13 activos D1 (E019 re-simulado)", n_variantes=len(usar), resultados=res)


if __name__ == "__main__":
    {"fdr": modo_fdr, "spa": modo_spa}[sys.argv[1]]()
