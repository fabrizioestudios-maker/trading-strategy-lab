"""
E027 — Validación a fondo de E022 (oro D1, ruptura de Bollinger 20/2 a favor de la SMA 200, SL 0,5 ATR, TP 2R),
con los criterios fijados en la BITACORA, entrada 25.
1) Contra 2.000 simulaciones con entradas al azar del lado de la SMA 200 (mismo año, misma cantidad de compras y ventas,
   mismo SL/TP y costos) y, como referencia, al azar sin filtro de tendencia.
2) IC 95 % bootstrap de la expectancy (15 años y 5 años).  3) Deflated Sharpe Ratio.  4) Swaps.  5) Costos × 3.
6) Clasificación con lab/politica.py.
"""
import os
import sys

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from lab import datos, financiacion, grilla, motor, politica, senales as S, validacion as V  # noqa: E402
from lab.metricas import resumen  # noqa: E402

ms = lambda f: pd.Timestamp(f, tz="UTC").value // 10**6  # noqa: E731
CFG = ("XAUUSD", "D1", "bollinger_ruptura", "20/2", "evento", "sma200", "ambos", 0.5)
H0, T5, FIN = ms("2011-11-15"), ms("2021-11-15"), None
SAL = os.path.join(RAIZ, "resultados", "E027")
os.makedirs(SAL, exist_ok=True)
rng = np.random.default_rng(27)
NSIM = 2000

m1 = datos.cargar("XAUUSD")
o15 = grilla.operaciones_config(*CFG, H0, m1=m1)
a = np.searchsorted(m1["t"], ms("2020-01-01"))
o5 = grilla.operaciones_config(*CFG, T5, m1={k: v[a:] for k, v in m1.items()})
out = {}
for nombre, o in (("15 años", o15), ("5 años", o5)):
    s = resumen(o.r.values)
    lo, hi = V.bootstrap_ic(o.r.values, n=20000)
    out[nombre] = dict(n=s["n"], wr=s["wr"], exp=s["expectancy"], pf=s["pf"], ic=(lo, hi))
    print(f"{nombre}: n={s['n']} WR={100 * s['wr']:.1f}% exp={s['expectancy']:+.3f}R PF={s['pf']:.2f} · IC95 expectancy [{lo:+.3f}, {hi:+.3f}]")

# 1) entradas al azar
v = datos.velas(m1, 1440)
atr = datos.atr(v, 14)
tend = S.sobre_sma(v, 200)
anio = pd.to_datetime(v["t"], unit="ms", utc=True).year.values
nb = len(v["t"])
valido = ~np.isnan(atr) & (np.arange(nb) < nb - 1)


def simular_azar(o, filtrar_tendencia):
    ao = pd.to_datetime(o.senal_t, unit="ms", utc=True).dt.year.values
    medias = np.empty(NSIM)
    grupos = []
    for y in np.unique(ao):
        for d in (1, -1):
            k = int(((ao == y) & (o.dir.values == d)).sum())
            if not k:
                continue
            base = valido & (anio == y) & (v["t"] >= o.senal_t.min())
            pool = np.flatnonzero(base & (tend == d)) if filtrar_tendencia else np.flatnonzero(base)
            grupos.append((pool, k, d))
    for s in range(NSIM):
        sel, dd = [], []
        for pool, k, d in grupos:
            if len(pool) == 0:
                continue
            x = rng.choice(pool, size=k, replace=len(pool) < k)
            sel.append(x); dd.append(np.full(k, d))
        sel = np.concatenate(sel); dd = np.concatenate(dd)
        ie = v["i1"][sel] + 1
        ent = m1["o"][ie]
        r = 0.5 * atr[sel]
        ops = motor.simular(m1, ie, dd, ent - dd * r, ent + dd * 2 * r, datos.costo("XAUUSD", ent), superponer=True)
        m = ops["motivo"] != 3
        medias[s] = ops["r"][m].mean()
    return medias


for nombre, o in (("15 años", o15), ("5 años", o5)):
    for filtro, etq in ((True, "azar del lado de la SMA 200"), (False, "azar sin filtro")):
        med = simular_azar(o, filtro)
        p = (np.sum(med >= out[nombre]["exp"]) + 1) / (NSIM + 1)
        out[nombre]["p_" + ("tend" if filtro else "libre")] = p
        print(f"{nombre} · {etq}: expectancy media {med.mean():+.3f}R (p95 {np.quantile(med, 0.95):+.3f}) · p = {p:.4f}")

# 3) Deflated Sharpe Ratio con la búsqueda E019
import glob  # noqa: E402
g = pd.concat([pd.read_csv(x) for x in glob.glob(os.path.join(RAIZ, "resultados/E019/grilla_*.csv.gz"))], ignore_index=True)
g = g[g.n_tot >= 30]
sr = g.exp_tot / V.sd_desde_resumen(g.wr_tot, g.exp_tot, g.payoff_tot)
var_sr = float(np.nanvar(sr))
n_eff = int(g.groupby(["instr", "tf", "familia", "dir"]).ngroups)
dsrs = {n: V.dsr(o5.r.values, n, var_sr) for n in (10, 100, 1000, n_eff, len(g))}
print(f"Sharpe por operación (5 años) {V.sharpe(o5.r.values):.3f} · varianza de Sharpe en E019 {var_sr:.4f} · N efectivo {n_eff}")
print("DSR por N:", {k: round(x, 3) for k, x in dsrs.items()}, "· Sharpe máximo esperado con N efectivo", round(V.sr_max_esperado(n_eff, var_sr), 3))

# 4) swaps y 5) costos × 3
riesgo = (o15.entrada - o15.sl).abs()
for nombre, (pl, pc) in (("base", (-0.015, -0.005)), ("adverso", (-0.03, -0.015))):
    r2, nn = financiacion.r_con_swap(o15.r, o15.dir, o15.entrada, riesgo, o15.t, o15.t_salida, pl, pc)
    out["15 años"]["swap_" + nombre] = r2.mean()
    print(f"swap {nombre}: expectancy {r2.mean():+.3f}R (noches promedio {nn.mean():.2f})")
oc3 = grilla.operaciones_config(*CFG, H0, costo_mult=3.0, m1=m1)
print(f"costos × 3: expectancy {oc3.r.mean():+.3f}R")
anios = pd.to_datetime(o15.t, unit="ms", utc=True).dt.year
pa = o15.groupby(anios).r.sum()
completos = pa.loc[2012:2025]

# 6) clasificación (elección/confirmación de E019)
fila = pd.read_csv(os.path.join(RAIZ, "resultados/E019/elegidas.csv"))
f = fila[(fila.instr == "XAUUSD") & (fila.tf == "D1") & (fila.familia == "bollinger_ruptura")].iloc[0]
e15 = out["15 años"]
ev = dict(n=e15["n"], exp=e15["exp"], ic_inf=e15["ic"][0], pf=e15["pf"], p_azar=e15["p_tend"], dsr=dsrs[n_eff],
          exp_is=float(f.exp_tot) if "exp_is" not in f else float(f.exp_is), exp_oos=float(f.exp_oos), exp_costo=float(oc3.r.mean()),
          anios_pos=float((completos > 0).mean()), holdout_n=0, holdout_exp=None)
cat, fallas = politica.clasificar(ev)
print("\nClasificación:", cat, "· falla:", fallas)
print("Swap adverso ≥ 50 % de la base y > 0:", e15["swap_adverso"] > 0 and e15["swap_adverso"] >= 0.5 * e15["exp"])
pd.DataFrame([dict(ventana=k, **{x: (y if not isinstance(y, tuple) else f"{y[0]:+.3f}..{y[1]:+.3f}") for x, y in d.items()}) for k, d in out.items()]).to_csv(os.path.join(SAL, "resumen.csv"), index=False)
pd.DataFrame([dict(categoria=cat, fallas=" | ".join(fallas), **{k: v for k, v in ev.items() if k != "holdout_exp"})]).to_csv(os.path.join(SAL, "clasificacion.csv"), index=False)
