"""
E006 — Compra de retrocesos en índices dentro de tendencia alcista. Reglas idénticas en todos los índices (sin ajustar
por índice). Tendencia: cierre > SMA200 y SMA200 subiendo en 20 días. Una operación a la vez por índice.
SL = k·ATR(14) diario, TP = 2,1·SL. Solo muestra de selección (entradas < 2022): la validación NO se imprime.
Uso: python experimentos/E006_retrocesos_indices.py SPXUSD,NSXUSD,...
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
EVENTOS = {
    "cierre mínimo 10d": lambda v, t: S.retroceso_minimo(v, 10, t),
    "cierre mínimo 5d": lambda v, t: S.retroceso_minimo(v, 5, t),
    "RSI2 < 25": lambda v, t: S.retroceso_rsi(v, 2, 25, 75, t),
    "RSI2 < 10": lambda v, t: S.retroceso_rsi(v, 2, 10, 90, t),
    "cualquier vela en tendencia (control)": lambda v, t: t,
}
filas, ops_todas = [], {}
for instr in INSTR:
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    t = S.tendencia(v, 200)
    for ne, fe in EVENTOS.items():
        ev = fe(v, t)
        for k in (2.0, 2.5, 3.0, 3.5):
            ops = estrategia.operaciones(instr, m1, v, np.where(ev == 1, 1, 0), k, rr=RR, modo="estado", lados=(1,))
            fin = ops["motivo"] != 3
            msel = fin & (ops["t"] < estrategia.CORTE)
            s = resumen(ops["r"][msel], ops["t"][msel], ops["t_salida"][msel])
            filas.append(dict(instr=instr, evento=ne, k_atr=k, n=s["n"], wr=s["wr"], wr_lo=s["wr_lo"], payoff=s["payoff"], expectancy=s["expectancy"], max_dd=s["max_dd"], dias=s.get("horas_media", np.nan) / 24))
            ops_todas[(instr, ne, k)] = (ops["r"][msel], ops["t"][msel])
    print(instr, "listo", flush=True)
df = pd.DataFrame(filas)
# cartera: todas las operaciones de todos los índices juntas
cart = []
for ne in EVENTOS:
    for k in (2.0, 2.5, 3.0, 3.5):
        r = np.concatenate([ops_todas[(i, ne, k)][0] for i in INSTR])
        s = resumen(r)
        anios = pd.to_datetime(np.concatenate([ops_todas[(i, ne, k)][1] for i in INSTR]), unit="ms", utc=True).year
        pos = np.mean([r[anios == y].sum() > 0 for y in sorted(set(anios))])
        cart.append(dict(evento=ne, k_atr=k, n=s["n"], wr=s["wr"], wr_lo=s["wr_lo"], payoff=s["payoff"], pf=s["pf"], expectancy=s["expectancy"], max_dd=s["max_dd"], anios_positivos=pos))
dc = pd.DataFrame(cart)
os.makedirs("resultados/E006", exist_ok=True)
df.to_csv(f"resultados/E006/por_indice_{'_'.join(INSTR)}.csv", index=False)
dc.to_csv(f"resultados/E006/cartera_{'_'.join(INSTR)}.csv", index=False)
fmt = lambda x: x.assign(wr=(x.wr * 100).round(1), wr_lo=(x.wr_lo * 100).round(1)).round(2)
print("\n=== Por índice (selección)")
print(fmt(df).pivot_table(index=["evento", "k_atr"], columns="instr", values="wr").to_string())
print(fmt(df).pivot_table(index=["evento", "k_atr"], columns="instr", values="n").to_string())
print("\n=== Cartera (selección, todos los índices juntos)")
print(fmt(dc).to_string(index=False))
