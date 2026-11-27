"""
E022 — Estrategia recomendada (E019 #2, la única de las 11 finalistas que conserva ventaja en 2011–2021).

Oro D1: ruptura de Bollinger (20, 2) a favor de la SMA 200, ambas direcciones, SL = 0,5·ATR(14), TP = 2·SL.
Escribe:
- resultados/E022/operaciones_5a.csv   lista de operaciones 15/11/2021–13/11/2026 (para comparar con el probador);
- resultados/E022/operaciones_2011_2021.csv;
- resultados/E022/por_anio.csv          resultados por año calendario 2011–2026;
- resultados/E022/curva.png             curva en R de 2011 a 2026, con el corte de los últimos 5 años.
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


CFG = ("XAUUSD", "D1", "bollinger_ruptura", "20/2", "evento", "sma200", "ambos", 0.5)
T5, H0 = ms("2021-11-15"), ms("2011-11-15")
SAL = "resultados/E022"
os.makedirs(SAL, exist_ok=True)

m1_todo = datos.cargar("XAUUSD")
a = np.searchsorted(m1_todo["t"], ms("2020-01-01"))
m1_rec = {k: v[a:] for k, v in m1_todo.items()}
o5 = grilla.operaciones_config(*CFG, T5, m1=m1_rec)               # igual que la grilla (carga desde 2020)
oh = grilla.operaciones_config(*CFG, H0, T5, m1=m1_todo)          # 2011–2021 con toda la historia
olargo = grilla.operaciones_config(*CFG, H0, m1=m1_todo)          # 2011–2026 seguida, para la curva


def tabla(o):
    f = lambda x: pd.to_datetime(x, unit="ms", utc=True).dt.strftime("%Y-%m-%d %H:%M")  # noqa: E731
    return pd.DataFrame(dict(
        dia_senal=(pd.to_datetime(o.senal_t, unit="ms", utc=True).dt.tz_convert("America/New_York")
                   + pd.Timedelta(hours=7)).dt.strftime("%Y-%m-%d"),  # día de la vela diaria que cierra a las 17:00 NY
        entrada_utc=f(o.t), direccion=np.where(o.dir == 1, "compra", "venta"), precio_entrada=o.entrada.round(2),
        atr14=o.atr.round(2), sl=o.sl.round(2), tp=o.tp.round(2), salida_utc=f(o.t_salida), precio_salida=o.salida.round(2),
        resultado=np.select([o.motivo == 1, o.motivo == -1], ["TP", "SL"], "otro"), r=o.r.round(3)))


tabla(o5).to_csv(f"{SAL}/operaciones_5a.csv", index=False)
tabla(oh).to_csv(f"{SAL}/operaciones_2011_2021.csv", index=False)
for nombre, o in (("5 años (15/11/2021–26/11/2026, fin de los datos del oro)", o5), ("2011–2021", oh)):
    s = resumen(o.r.values)
    lc = o[o.dir == 1].r.values
    vc = o[o.dir == -1].r.values
    print(f"{nombre}: n={s['n']} WR={100 * s['wr']:.1f}% [IC95 {100 * s['wr_lo']:.1f}–{100 * s['wr_hi']:.1f}] payoff={s['payoff']:.2f} "
          f"PF={s['pf']:.2f} exp={s['expectancy']:+.3f}R total={s['r_total']:+.1f}R maxDD={s['max_dd']:.1f}R · "
          f"compras {len(lc)} ({100 * (lc > 0).mean():.1f}%) · ventas {len(vc)} ({100 * (vc > 0).mean():.1f}%)")
    dur = (o.t_salida - o.t) / 86400000
    print(f"   duración media {dur.mean():.1f} días, mediana {dur.median():.1f}; operaciones por año {s['n'] / (5 if o is o5 else 10):.1f}")
anio = pd.to_datetime(olargo.t, unit="ms", utc=True).dt.year
pa = olargo.groupby(anio).r.agg(n="size", wr=lambda r: round(100 * (r > 0).mean(), 1), r_total=lambda r: round(r.sum(), 2))
pa.to_csv(f"{SAL}/por_anio.csv")
print("\nPor año (2011–2026, una sola corrida):")
print(pa.T.to_string())

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
fig, ax = plt.subplots(figsize=(10, 4.2), dpi=150)
fechas = pd.to_datetime(olargo.t_salida, unit="ms", utc=True)
ax.plot(fechas, olargo.r.cumsum().values, color="#1f6f8b", lw=1.6)
ax.axvline(pd.Timestamp("2021-11-15", tz="UTC"), color="#b5651d", ls="--", lw=1)
ax.text(pd.Timestamp("2021-12-15", tz="UTC"), ax.get_ylim()[0] + 1, "últimos 5 años", color="#b5651d", fontsize=9)
ax.set_title("Oro D1 · ruptura de Bollinger (20, 2) a favor de la SMA 200 · SL 0,5 ATR, TP 1 ATR (RR 1:2), con costos", fontsize=10)
ax.set_ylabel("Resultado acumulado (R)")
ax.grid(alpha=0.25)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)
fig.tight_layout()
fig.savefig(f"{SAL}/curva.png")
print(f"\ncurva: {SAL}/curva.png")
