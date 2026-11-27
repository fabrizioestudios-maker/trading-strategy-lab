"""
E024 — Finalistas del setup SMC (E023, BITACORA entrada 20, punto 4): la mejor combinación de cada activo que pasa la
regla, la mejor con los mismos parámetros en los 6 activos y la versión literal del setup. Para cada una:
año por año (5 años), compras contra ventas, costos × 1,5 y vecinos (L y W).

Uso: python experimentos/E024_smc_finalistas.py
"""
import importlib.util
import os
import sys

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from lab import smc  # noqa: E402
from lab.metricas import resumen  # noqa: E402

spec = importlib.util.spec_from_file_location("e023", os.path.join(RAIZ, "experimentos", "E023_smc_grilla.py"))
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)
PAR = {p[0]: p for p in E.PARES}
ANIOS5 = [(E.ms(f"{y}-11-15"), E.ms(f"{y + 1}-11-15")) for y in range(2021, 2026)]
_cache = {}


def preparado(instr, par):
    if (instr, par) not in _cache:
        _, tf_mayor, tf_ej = PAR[par]
        _cache[(instr, par)] = E.preparar(instr, tf_mayor, tf_ej)
    return _cache[(instr, par)]


def operaciones(instr, par, L, fuente, W, recupera, sesgo, entrada, V, sesion, liquidez, costo_mult=1.0):
    P = preparado(instr, par)
    v, m1 = P["v"], P["m1"]
    nb = len(v["t"])
    ph, pl = smc.pivotes(v["h"], v["l"], int(L))
    if fuente == "swing":
        ref_lo, ref_hi = np.concatenate([[np.nan], pl[:-1]]), np.concatenate([[np.nan], ph[:-1]])
    elif fuente == "mayor":
        ref_lo, ref_hi = P["liq_lo"], P["liq_hi"]
    else:
        ref_lo, ref_hi = P["pdl"], P["pdh"]
    D, S_, M, EXT, OPU, F1, F2, OB = smc.detectar(v["o"], v["h"], v["l"], v["c"], ref_lo, ref_hi, ph, pl, int(W), bool(recupera))
    sel = (v["t"][M] >= E.T_INI) & (M < nb - 1)
    st = dict(d=D[sel].astype(np.int64), m=M[sel], ext=EXT[sel], opu=OPU[sel], f1=F1[sel], f2=F2[sel], ob=OB[sel])
    crea, vence, d, ent, sl, tp, costo = E.ordenes(instr, P, st, entrada, sesgo, int(V) if V else 12, sesion, bool(liquidez))
    est, r, t_in, t_out = smc.simular_ordenes(m1["o"], m1["h"], m1["l"], m1["c"], crea, vence, d, ent, sl, tp, costo * costo_mult,
                                             entrada == "mercado", E.RR)
    ok = (est == 1) | (est == -1)
    return pd.DataFrame(dict(t=m1["t"][t_in[ok]], t_out=m1["t"][t_out[ok]], d=d[ok], r=r[ok]))


def corto(r):
    s = resumen(np.asarray(r))
    if not s.get("n"):
        return "n=0"
    return f"n={s['n']} WR={100 * s['wr']:.1f}% exp={s['expectancy']:+.3f}R PF={s['pf']:.2f} DD={s['max_dd']:.1f}R"


if __name__ == "__main__":
    g = pd.read_csv("resultados/E023/todas_resumen.csv.gz")
    el = g[g.paso2].sort_values("lb_exp", ascending=False)
    finalistas = el.groupby("instr").head(1).copy()
    finalistas["origen"] = "mejor del activo"
    k = ["par", "L", "fuente", "W", "recupera", "sesgo", "entrada", "V", "sesion", "liquidez"]
    c = g.groupby(k).agg(activos=("instr", "nunique"), exp_min=("exp_tot", "min"), n_min=("n_tot", "min")).reset_index()
    uni = c[(c.activos == 6) & (c.exp_min > 0) & (c.n_min >= 60)].sort_values("exp_min", ascending=False).head(1)
    filas = [f for _, f in finalistas.iterrows()]
    for _, u in uni.iterrows():
        for instr in E.INSTR:
            f = g[(g.instr == instr) & (g[k] == u[k]).all(axis=1)].iloc[0].copy()
            f["origen"] = "mismos parámetros en los 6 activos"
            filas.append(f)
    lit = g[(g.par == "1H-5M") & (g.fuente == "swing") & (g.sesgo == "ema50_200") & (g.entrada == "fvg") & (g.sesion == "todas")
            & (~g.liquidez) & (g.L == 3) & (g.W == 24) & (g.recupera) & (g.V == 12)]
    for _, f in lit.iterrows():
        f = f.copy()
        f["origen"] = "versión literal del setup"
        filas.append(f)
    salida = []
    for f in filas:
        args = (f.instr, f.par, f.L, f.fuente, f.W, f.recupera, f.sesgo, f.entrada, f.V, f.sesion, f.liquidez)
        o = operaciones(*args)
        o15 = operaciones(*args, costo_mult=1.5)
        anios = []
        for a, b in ANIOS5:
            m = (o.t >= a) & (o.t < b)
            anios.append(f"{100 * (o.r[m] > 0).mean():.0f}%/{o.r[m].sum():+.1f}R" if m.any() else "-")
        vec = []
        for dL in (-1, 1):
            Ls = [2, 3, 5]
            i = Ls.index(int(f.L)) + dL
            if 0 <= i < len(Ls):
                vv = operaciones(f.instr, f.par, Ls[i], f.fuente, f.W, f.recupera, f.sesgo, f.entrada, f.V, f.sesion, f.liquidez)
                vec.append(f"L{Ls[i]}: {vv.r.mean():+.2f}R")
        for dW in (-1, 1):
            Ws = [12, 24, 48]
            i = Ws.index(int(f.W)) + dW
            if 0 <= i < len(Ws):
                vv = operaciones(f.instr, f.par, f.L, f.fuente, Ws[i], f.recupera, f.sesgo, f.entrada, f.V, f.sesion, f.liquidez)
                vec.append(f"W{Ws[i]}: {vv.r.mean():+.2f}R")
        desc = f"{f.par} L{f.L} {f.fuente} W{f.W} {'recupera' if f.recupera else 'sin recuperar'} {f.sesgo} {f.entrada} V{f.V} {f.sesion} liq={f.liquidez}"
        print(f"\n[{f.origen}] {f.instr} · {desc}")
        print(f"  5 años: {corto(o.r)} · compras {corto(o.r[o.d == 1])} · ventas {corto(o.r[o.d == -1])}")
        print(f"  costos ×1,5: {corto(o15.r)} · años (nov–nov): {' | '.join(anios)} · vecinos: {', '.join(vec)}")
        s = resumen(o.r.values)
        salida.append(dict(origen=f.origen, instr=f.instr, par=f.par, L=f.L, fuente=f.fuente, W=f.W, recupera=f.recupera, sesgo=f.sesgo,
                           entrada=f.entrada, V=f.V, sesion=f.sesion, liquidez=f.liquidez, n=s.get("n", 0),
                           wr=round(100 * s.get("wr", np.nan), 1), exp=round(s.get("expectancy", np.nan), 3), pf=round(s.get("pf", np.nan), 2),
                           dd=round(s.get("max_dd", np.nan), 1), exp_costo15=round(o15.r.mean(), 3),
                           compras_n=int((o.d == 1).sum()), compras_wr=round(100 * (o.r[o.d == 1] > 0).mean(), 1) if (o.d == 1).any() else np.nan,
                           ventas_n=int((o.d == -1).sum()), ventas_wr=round(100 * (o.r[o.d == -1] > 0).mean(), 1) if (o.d == -1).any() else np.nan,
                           anios=" | ".join(anios), vecinos=", ".join(vec)))
    os.makedirs("resultados/E024", exist_ok=True)
    pd.DataFrame(salida).to_csv("resultados/E024/finalistas.csv", index=False)
