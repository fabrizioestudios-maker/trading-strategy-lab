"""
E038 — Historia nunca usada (15/11/2010–14/11/2021) de los dos setups intradía del oro (BITACORA, entrada 28).

Primero comprueba que las funciones de experimentos/candidatas.py reproducen las referencias de 2021–2026
(ICT 5: 82 operaciones, +0,304 R; SMC: 302, +0,259 R) y después corre una sola vez el tramo limpio.
Uso: python experimentos/E038_historia_intradia_oro.py
"""
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import candidatas as C  # noqa: E402
from lab import ficha, registro, validacion as V  # noqa: E402

SAL = "resultados/E038"


def resumen(nombre, o):
    r = o.r.values
    n = len(r)
    t = r.mean() / (r.std(ddof=1) / np.sqrt(n)) if n > 2 else np.nan
    p = float(stats.t.sf(t, n - 1)) if n > 2 else np.nan
    lo, hi = V.bootstrap_ic(r) if n > 2 else (np.nan, np.nan)
    f = ficha.basico(r)
    return dict(estrategia=nombre, n=n, wr=f.get("wr"), exp=f.get("expectancy"), pf=f.get("pf"), payoff=f.get("payoff"),
                max_dd=f.get("max_dd"), ic_lo=lo, ic_hi=hi, t=t, p_una_cola=p)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    ref_ict = C.ict5_oro()
    ref_smc = C.smc_oro()
    print(f"referencia ICT 5 2021–2026: n={len(ref_ict)} exp={ref_ict.r.mean():+.3f} (esperado 82, +0,304)")
    print(f"referencia SMC   2021–2026: n={len(ref_smc)} exp={ref_smc.r.mean():+.3f} (esperado 302, +0,259)", flush=True)
    filas = []
    for realista in (False, True):
        ict_ = C.ict5_oro("2010-11-15", "2021-11-15", realista=realista, carga="2010-01-01")
        smc_ = C.smc_oro("2010-11-15", "2021-11-15", realista=realista, carga="2010-01-01")
        for nombre, o in (("ICT 5 oro", ict_), ("SMC oro", smc_)):
            f = resumen(nombre, o)
            f["llenado"] = "realista" if realista else "histórico"
            f["pasa"] = bool(f["n"] >= 30 and f["exp"] > 0 and f["p_una_cola"] < 0.10) if not realista else None
            filas.append(f)
            if not realista:
                anio = pd.to_datetime(o.t, unit="ms", utc=True).dt.year
                pa = o.groupby(anio).r.agg(n="size", wr=lambda x: (x > 0).mean(), r_total="sum")
                pa.to_csv(f"{SAL}/{nombre.split()[0].lower()}_por_anio.csv")
                o.to_csv(f"{SAL}/{nombre.split()[0].lower()}_operaciones_2010_2021.csv", index=False)
                print(nombre, "por año:\n", pa.round(2).T.to_string(), flush=True)
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    print(t.round(3).to_string(index=False))
    registro.registrar("E038", __file__, hipotesis="Los setups intradía del oro son positivos en su historia nunca usada",
                       universo="XAUUSD M1", periodo="2010-11-15 a 2021-11-14", n_variantes=2, resultados=t)
