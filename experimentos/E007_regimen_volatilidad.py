"""
E007 — ¿La volatilidad baja mejora los retrocesos en tendencia? Mismo E006 (cierre en mínimo de 10 días, RSI2 < 25,
control) pero solo cuando el ATR(20)/precio está por debajo de su mediana de un año. Solo selección (< 2022).
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

INSTR = sys.argv[1].split(",")
RR = 2.1
filas, acum = [], {}
for instr in INSTR:
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    t = S.tendencia(v, 200)
    vb = S.volatilidad_baja(v)
    eventos = {"cierre mínimo 10d": S.retroceso_minimo(v, 10, t), "RSI2 < 25": S.retroceso_rsi(v, 2, 25, 75, t), "cualquier vela en tendencia": t}
    for ne, ev in eventos.items():
        for regimen, mask in (("todos", np.ones(len(ev), bool)), ("volatilidad baja", vb == 1), ("volatilidad alta", vb == 0)):
            s_ev = np.where((ev == 1) & mask, 1, 0)
            for k in (2.0, 3.0, 3.5):
                ops = estrategia.operaciones(instr, m1, v, s_ev, k, rr=RR, lados=(1,))
                if ops is None:
                    continue
                m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
                acum.setdefault((ne, regimen, k), []).append(ops["r"][m])
                s = resumen(ops["r"][m])
                filas.append(dict(instr=instr, evento=ne, regimen=regimen, k_atr=k, n=s.get("n", 0), wr=s.get("wr", np.nan)))
    print(instr, "listo", flush=True)
cart = []
for (ne, reg, k), lst in acum.items():
    s = resumen(np.concatenate(lst))
    cart.append(dict(evento=ne, regimen=reg, k_atr=k, n=s["n"], wr=round(s["wr"] * 100, 1), wr_lo=round(s["wr_lo"] * 100, 1), pf=round(s["pf"], 2), expectancy=round(s["expectancy"], 2)))
dc = pd.DataFrame(cart).sort_values(["evento", "k_atr", "regimen"])
os.makedirs("resultados/E007", exist_ok=True)
dc.to_csv(f"resultados/E007/cartera_{'_'.join(INSTR)}.csv", index=False)
pd.DataFrame(filas).to_csv(f"resultados/E007/por_indice_{'_'.join(INSTR)}.csv", index=False)
print(dc.to_string(index=False))
