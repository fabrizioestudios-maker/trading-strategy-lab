"""
E023 — El setup SMC de Fabrizio en los últimos 5 años (BITACORA, entrada 20).

Uso:
  python experimentos/E023_smc_grilla.py grilla [INSTR,...]   # → resultados/E023/grilla_<INSTR>_<PAR>.csv.gz
  python experimentos/E023_smc_grilla.py elegir                # regla registrada → resultados/E023/elegidas.csv
"""
import os
import sys
import time
from itertools import product
from multiprocessing import Pool

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, smc  # noqa: E402

INSTR = ["XAUUSD", "EURUSD", "GBPUSD", "USDCAD", "NSXUSD", "SPXUSD"]
PARES = [("1H-5M", 60, 5), ("4H-15M", 240, 15), ("15M-1M", 15, 1)]
LS, FUENTES, WS, RECUPERA = [2, 3, 5], ["swing", "mayor", "dia"], [12, 24, 48], [True, False]
SESGOS = ["ninguno", "ema50_200", "precio_ema200", "estructura"]
ENTRADAS = ["mercado", "eq", "ote", "fvg", "fvg50", "ob"]
VS, SESIONES, LIQ = [12, 36], ["todas", "killzones"], [False, True]
RR = 2.0


def ms(f):
    return pd.Timestamp(f, tz="UTC").value // 10**6


CARGA, T_INI, T_OOS = ms("2021-01-01"), ms("2021-11-15"), ms("2024-11-15")
ANIOS = [(ms("2021-11-15"), ms("2022-11-15")), (ms("2022-11-15"), ms("2023-11-15")), (ms("2023-11-15"), ms("2024-11-15"))]
SAL = "resultados/E023"


def medir(t, r):
    f = {}
    for nombre, (a, b) in [("is", (T_INI, T_OOS)), ("oos", (T_OOS, 1 << 62))] + [(f"a{j + 1}", p) for j, p in enumerate(ANIOS)]:
        m = (t >= a) & (t < b)
        rr = r[m]
        f[f"n_{nombre}"] = len(rr)
        f[f"wr_{nombre}"] = (rr > 0).mean() if len(rr) else np.nan
        f[f"exp_{nombre}"] = rr.mean() if len(rr) else np.nan
    n = len(r)
    f["n_tot"] = n
    if n:
        g, p = r[r > 0], r[r <= 0]
        f["wr_tot"] = len(g) / n
        f["exp_tot"] = r.mean()
        f["sd_tot"] = r.std()
        f["pf_tot"] = g.sum() / -p.sum() if len(p) and p.sum() < 0 else np.nan
        curva = np.concatenate([[0.0], np.cumsum(r)])
        f["dd_tot"] = float(np.max(np.maximum.accumulate(curva) - curva))
        f["r_tot"] = r.sum()
    return f


def preparar(instr, tf_mayor, tf_ej):
    m1 = datos.cargar(instr)
    a = np.searchsorted(m1["t"], CARGA)
    m1 = {k: v[a:] for k, v in m1.items()}
    v = datos.velas(m1, tf_ej)
    hv = datos.velas(m1, tf_mayor)
    d1 = datos.velas(m1, 1440)
    q = smc.mapear_mayor(v["t"], hv["t"])
    ok = q >= 0
    qc = np.clip(q, 0, None)
    e50, e200 = smc.ema(hv["c"], 50), smc.ema(hv["c"], 200)
    hph, hpl = smc.pivotes(hv["h"], hv["l"], 3)
    sesgos = {
        "ninguno": None,
        "ema50_200": np.where(ok, np.sign(e50 - e200)[qc], 0).astype(np.int8),
        "precio_ema200": np.where(ok, np.sign(hv["c"] - e200)[qc], 0).astype(np.int8),
        "estructura": np.where(ok, smc.estado_estructura(hv["c"], hph, hpl)[qc], 0).astype(np.int8),
    }
    liq_hi = np.where(ok, hph[qc], np.nan)
    liq_lo = np.where(ok, hpl[qc], np.nan)
    qd = smc.mapear_mayor(v["t"], d1["t"])
    okd = qd >= 0
    pdh = np.where(okd, d1["h"][np.clip(qd, 0, None)], np.nan)
    pdl = np.where(okd, d1["l"][np.clip(qd, 0, None)], np.nan)
    return dict(m1=m1, v=v, atr=datos.atr(v, 14), sesgos=sesgos, liq_hi=liq_hi, liq_lo=liq_lo, pdh=pdh, pdl=pdl,
                kz=smc.killzones(v["t"]))


def ordenes(instr, P, st, entrada, sesgo, V, sesion, liq):
    """Arma las órdenes de una combinación a partir de los setups detectados (dict de arrays)."""
    v, atr = P["v"], P["atr"]
    nb = len(v["t"])
    d, M, ext, opu = st["d"], st["m"], st["ext"], st["opu"]
    ok = np.ones(len(d), bool)
    if sesgo != "ninguno":
        ok &= P["sesgos"][sesgo][M] == d
    if sesion == "killzones":
        ok &= P["kz"][M]
    eq = opu + (ext - opu) * 0.5
    if entrada == "mercado":
        ent = v["c"][M]  # aproximación para filtros; el motor llena en la apertura siguiente
    elif entrada == "eq":
        ent = eq
    elif entrada == "ote":
        ent = opu + (ext - opu) * 0.618
    elif entrada == "fvg":
        ent = st["f1"]
    elif entrada == "fvg50":
        ent = (st["f1"] + st["f2"]) / 2
    else:
        ent = st["ob"]
    sl = ext - d * 0.1 * atr[M]
    riesgo = (ent - sl) * d
    costo = datos.costo(instr, np.where(np.isnan(ent), v["c"][M], ent))
    ok &= ~np.isnan(ent) & ~np.isnan(atr[M]) & (riesgo >= 3 * costo)
    if entrada != "mercado":
        ok &= (d * (eq - ent) >= 0) & (d * (v["c"][M] - ent) > 0)  # en descuento (premium) y del lado correcto del precio
    tp = ent + d * RR * riesgo
    if liq:
        obst = np.where(d == 1, P["liq_hi"][M], P["liq_lo"][M])
        entre = np.where(d == 1, (obst > ent) & (obst < tp), (obst < ent) & (obst > tp))
        ok &= ~(entre & ~np.isnan(obst))
    idx = np.flatnonzero(ok)
    crea = v["i1"][M[idx]] + 1
    vence = v["i1"][np.minimum(M[idx] + V, nb - 1)]
    return crea, vence, d[idx].astype(np.int64), ent[idx], sl[idx], tp[idx], costo[idx]


def trabajar(tarea):
    instr, (par, tf_mayor, tf_ej) = tarea
    t0 = time.time()
    P = preparar(instr, tf_mayor, tf_ej)
    v, m1 = P["v"], P["m1"]
    nb = len(v["t"])
    filas = []
    for L in LS:
        ph, pl = smc.pivotes(v["h"], v["l"], L)
        for fuente in FUENTES:
            if fuente == "swing":
                ref_lo, ref_hi = np.concatenate([[np.nan], pl[:-1]]), np.concatenate([[np.nan], ph[:-1]])
            elif fuente == "mayor":
                ref_lo, ref_hi = P["liq_lo"], P["liq_hi"]
            else:
                ref_lo, ref_hi = P["pdl"], P["pdh"]
            for W, rec in product(WS, RECUPERA):
                D, S_, M, EXT, OPU, F1, F2, OB = smc.detectar(v["o"], v["h"], v["l"], v["c"], ref_lo, ref_hi, ph, pl, W, rec)
                sel = (v["t"][M] >= T_INI) & (M < nb - 1)
                st = dict(d=D[sel].astype(np.int64), m=M[sel], ext=EXT[sel], opu=OPU[sel], f1=F1[sel], f2=F2[sel], ob=OB[sel])
                for sesgo, entrada, sesion, liq in product(SESGOS, ENTRADAS, SESIONES, LIQ):
                    for V in (VS if entrada != "mercado" else [12]):
                        crea, vence, d, ent, sl, tp, costo = ordenes(instr, P, st, entrada, sesgo, V, sesion, liq)
                        f = dict(instr=instr, par=par, L=L, fuente=fuente, W=W, recupera=rec, sesgo=sesgo, entrada=entrada,
                                 V=V if entrada != "mercado" else 0, sesion=sesion, liquidez=liq, setups=len(crea))
                        if len(crea):
                            est, r, t_in, t_out = smc.simular_ordenes(m1["o"], m1["h"], m1["l"], m1["c"], crea, vence, d, ent, sl, tp,
                                                                      costo, entrada == "mercado", RR)
                            hecho = (est == 1) | (est == -1)
                            f["llenadas"] = int(hecho.sum())
                            f.update(medir(m1["t"][t_in[hecho]], r[hecho]))
                        filas.append(f)
    df = pd.DataFrame(filas)
    os.makedirs(SAL, exist_ok=True)
    df.to_csv(f"{SAL}/grilla_{instr}_{par}.csv.gz", index=False)
    print(f"{instr} {par}: {len(df)} combinaciones, {time.time() - t0:.0f} s", flush=True)
    return len(df)


CLAVE = ["instr", "par", "L", "fuente", "recupera", "sesgo", "entrada", "V", "sesion", "liquidez"]


def lb(f):
    return f.exp_tot - 1.96 * f.sd_tot / np.sqrt(f.n_tot)


def elegir():
    g = pd.concat([pd.read_csv(os.path.join(SAL, x)) for x in sorted(os.listdir(SAL)) if x.startswith("grilla_")], ignore_index=True)
    total = len(g)
    g = g.sort_values(CLAVE + ["W"]).reset_index(drop=True)
    grp = g.groupby(CLAVE, sort=False)
    g["exp_is_wmenos"] = grp["exp_is"].shift(1)
    g["exp_is_wmas"] = grp["exp_is"].shift(-1)
    anios_ok = np.ones(len(g), bool)
    for j in (1, 2, 3):
        anios_ok &= (g[f"n_a{j}"].fillna(0) >= 10) & (g[f"exp_a{j}"] > 0)
    vecino = (g.exp_is_wmenos > 0) | (g.exp_is_wmas > 0)
    g["paso1"] = (g.n_is >= 60) & (g.exp_is > 0) & anios_ok & vecino
    g["paso2"] = g.paso1 & (g.n_oos >= 30) & (g.exp_oos > 0)
    g["lb_exp"] = lb(g)
    g.to_csv(f"{SAL}/todas_resumen.csv.gz", index=False)
    el = g[g.paso2].sort_values("lb_exp", ascending=False)
    el.to_csv(f"{SAL}/elegidas.csv", index=False)
    print(f"combinaciones: {total} · con operaciones: {int(g.n_tot.fillna(0).gt(0).sum())}")
    print(f"paso 1 (elección): {int(g.paso1.sum())} · paso 2 (confirmación): {int(g.paso2.sum())} · "
          f"de ellas con win rate ≥ 50 % en los 5 años: {int((el.wr_tot >= 0.5).sum())}")
    print("\npaso 2 por activo y par:")
    print(el.groupby(["instr", "par"]).size().unstack(fill_value=0).to_string())
    print("\nmejor win rate de los 5 años por activo y par (cualquier combinación con ≥ 100 operaciones):")
    m = g[g.n_tot >= 100]
    print(m.groupby(["instr", "par"]).wr_tot.max().unstack().mul(100).round(1).to_string())
    cols = ["instr", "par", "L", "fuente", "W", "recupera", "sesgo", "entrada", "V", "sesion", "liquidez", "n_is", "wr_is", "exp_is",
            "n_oos", "wr_oos", "exp_oos", "n_tot", "wr_tot", "exp_tot", "lb_exp", "pf_tot", "dd_tot"]
    o = el[cols].head(30).copy()
    for c in ("wr_is", "wr_oos", "wr_tot"):
        o[c] = (o[c] * 100).round(1)
    print("\nTOP 30 (paso 2, por límite inferior de la expectancy):")
    print(o.round(3).to_string(index=False))
    lit = g[(g.par == "1H-5M") & (g.fuente == "swing") & (g.sesgo == "ema50_200") & (g.entrada == "fvg") & (g.sesion == "todas") & (~g.liquidez)]
    r = lit.groupby("instr").apply(lambda x: pd.Series(dict(combinaciones=len(x), n_medio=x.n_tot.mean(), wr_medio=100 * x.wr_tot.mean(),
                                                           wr_max=100 * x.wr_tot.max(), exp_medio=x.exp_tot.mean(), exp_max=x.exp_tot.max())))
    print("\nVersión literal del setup (1H–5M, EMA 50/200, barrido de swing, cambio de estructura, FVG en descuento), "
          "todas las variantes de L, W, recupera y V:")
    print(r.round(3).to_string())


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "grilla"
    if modo == "grilla":
        instrs = sys.argv[2].split(",") if len(sys.argv) > 2 else INSTR
        tareas = [(i, p) for p in PARES for i in instrs]
        t0 = time.time()
        with Pool(4) as pool:
            tot = sum(pool.imap_unordered(trabajar, tareas))
        print(f"\nTOTAL: {tot} combinaciones en {time.time() - t0:.0f} s", flush=True)
    elif modo == "elegir":
        elegir()
    else:
        raise SystemExit(__doc__)
