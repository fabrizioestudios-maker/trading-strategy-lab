"""
E025 — Los 5 setups ICT del prompt de Google, en los últimos 5 años (BITACORA entrada 22).

Uso:
  python experimentos/E025_ict_cinco_setups.py grilla      # → resultados/E025/grilla_<INSTR>_<TF>.csv.gz
  python experimentos/E025_ict_cinco_setups.py informe     # → resultados/E025/*.csv y resumen en pantalla
"""
import importlib.util
import os
import sys
import time
from itertools import product
from multiprocessing import Pool

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from lab import datos, ict, smc  # noqa: E402

_spec = importlib.util.spec_from_file_location("e023", os.path.join(RAIZ, "experimentos", "E023_smc_grilla.py"))
E23 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(E23)
medir, ms = E23.medir, E23.ms

INSTR = ["XAUUSD", "EURUSD", "GBPUSD", "USDCAD", "NSXUSD", "SPXUSD"]
TFS = [("1M", 1, 15), ("5M", 5, 60), ("15M", 15, 240)]  # ejecución, mayor (minutos)
RR, MARGEN, MAX_DIA, MAX_PERD, CIERRE = 2.0, 0.1, 2, 2, 16 * 60
CARGA = ms("2021-01-01")
SAL = "resultados/E025"
KZ = {"Londres+NY": 3, "Londres": 1, "NY": 2}


def preparar(instr, tf, tf_mayor):
    m1 = datos.cargar(instr)
    a = np.searchsorted(m1["t"], CARGA)
    m1 = {k: v[a:] for k, v in m1.items()}
    v = datos.velas(m1, tf)
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    mn = (ny.hour * 60 + ny.minute).values
    dia = (ny.tz_localize(None).normalize().values.astype("datetime64[D]").astype(np.int64))
    kz = np.where((mn >= 120) & (mn < 300), 1, np.where((mn >= 510) & (mn < 660), 2, 0)).astype(np.int8)
    nb = len(kz)
    kzfin = np.full(nb, -1, np.int64)
    i = 0
    while i < nb:
        if kz[i] == 0:
            i += 1
            continue
        j = i
        while j + 1 < nb and kz[j + 1] == kz[i] and dia[j + 1] == dia[i]:
            j += 1
        kzfin[i:j + 1] = j
        i = j + 1
    # rango asiático 20:00–00:00 del día anterior
    asia = pd.DataFrame(dict(dia=dia + 1, h=v["h"], l=v["l"]))[mn >= 1200].groupby("dia").agg(H=("h", "max"), L=("l", "min"))
    asia_h = pd.Series(dia).map(asia.H).values.astype(float)
    asia_l = pd.Series(dia).map(asia.L).values.astype(float)
    hv = datos.velas(m1, tf_mayor)
    q = smc.mapear_mayor(v["t"], hv["t"])
    ok = q >= 0
    qc = np.clip(q, 0, None)
    hph, hpl = smc.pivotes(hv["h"], hv["l"], 3)
    sesgos = {
        "ema50": np.where(ok, np.sign(hv["c"] - smc.ema(hv["c"], 50))[qc], 0).astype(np.int8),
        "ema200": np.where(ok, np.sign(hv["c"] - smc.ema(hv["c"], 200))[qc], 0).astype(np.int8),
        "vela": np.where(ok, np.sign(hv["c"] - hv["o"])[qc], 0).astype(np.int8),
        "estructura": np.where(ok, smc.estado_estructura(hv["c"], hph, hpl)[qc], 0).astype(np.int8),
    }
    piv = {L: smc.pivotes(v["h"], v["l"], L) for L in (2, 3, 5)}
    nym = pd.to_datetime(m1["t"], unit="ms", utc=True).tz_convert("America/New_York")
    dia_m1 = nym.tz_localize(None).normalize().values.astype("datetime64[D]").astype(np.int64)
    mdia_m1 = (nym.hour * 60 + nym.minute).values.astype(np.int64)
    return dict(m1=m1, v=v, atr=datos.atr(v, 14), kz=kz, kzfin=kzfin, dia=dia, asia_h=asia_h, asia_l=asia_l, sesgos=sesgos,
                piv=piv, dia_m1=dia_m1, mdia_m1=mdia_m1)


def detectar(P, setup, p):
    v, atr = P["v"], P["atr"]
    o, h, l, c = v["o"], v["h"], v["l"], v["c"]
    mk = KZ[p["kz"]]
    if setup == 1:
        ph, pl = P["piv"][p["L"]]
        return ict.s1_barrido(o, h, l, c, atr, ph, pl, P["kz"], P["kzfin"], mk, p["N"], p["V"], p["minfvg"], p["zona"], p["ce"], MARGEN)
    if setup == 2:
        return ict.s2_breaker(o, h, l, c, atr, p["L"], P["kz"], P["kzfin"], mk, p["V"], p["ce"], MARGEN)
    if setup == 3:
        return ict.s3_continuacion(o, h, l, c, atr, P["sesgos"][p["sesgo"]], P["kz"], P["kzfin"], mk, p["V"], p["minfvg"], p["ce"], MARGEN)
    if setup == 4:
        ph, pl = P["piv"][p["L"]]
        return ict.s4_amd(o, h, l, c, atr, ph, pl, P["dia"], P["asia_h"], P["asia_l"], P["kz"], P["kzfin"], mk, p["N"], p["V"],
                          p["minfvg"], p["ce"], MARGEN)
    ph3, pl3 = P["piv"][3]
    return ict.s5_sesgo_mayor(o, h, l, c, atr, P["sesgos"][p["sesgo"]], ph3, pl3, P["kz"], P["kzfin"], mk, p["N"], p["V"], p["minfvg"], p["ce"], MARGEN)


def ordenes(instr, P, det, tp_asia=False):
    B, D, E, S, T, X = det
    v = P["v"]
    dentro = v["t"][B] >= E23.T_INI  # 2021 hasta el 15/11 solo calienta los indicadores
    B, D, E, S, T, X = B[dentro], D[dentro], E[dentro], S[dentro], T[dentro], X[dentro]
    riesgo = (E - S) * D
    costo = datos.costo(instr, E)
    tp = T.copy() if tp_asia else E + D * RR * riesgo
    ok = (riesgo > 0) & (riesgo >= 3 * costo) & ~np.isnan(tp) & ((tp - E) * D > 0)
    return v["i1"][B[ok]] + 1, v["i1"][X[ok]], D[ok].astype(np.int64), E[ok], S[ok], tp[ok], costo[ok]


def correr(instr, P, lista_det, cierre, tp_asia=False):
    """lista_det: detecciones de uno o más setups; se juntan en orden de creación (una posición a la vez)."""
    partes = [ordenes(instr, P, d, tp_asia) for d in lista_det]
    crea = np.concatenate([x[0] for x in partes])
    orden = np.argsort(crea, kind="stable")
    crea, vence, d, e, s, tp, costo = (np.concatenate([x[j] for x in partes])[orden] for j in range(7))
    m1 = P["m1"]
    est, r, t_in, t_out = ict.simular(m1["o"], m1["h"], m1["l"], m1["c"], P["dia_m1"], P["mdia_m1"], crea, vence, d, e, s, tp, costo,
                                     MAX_DIA, MAX_PERD, CIERRE if cierre else -1)
    hecho = (est == 1) | (est == -1) | (est == 2)
    return m1["t"][t_in[hecho]], r[hecho], d[hecho], est[hecho]


DEF = {  # configuración del prompt
    1: dict(L=5, N=10, V=10, minfvg=0.0, zona=0, ce=0, kz="Londres+NY"),
    2: dict(L=5, V=10, ce=0, kz="Londres+NY"),
    3: dict(sesgo="ema50", V=10, minfvg=0.0, ce=0, kz="Londres+NY"),
    4: dict(L=3, N=10, V=10, minfvg=0.0, ce=0, kz="Londres+NY", tp="2R"),
    5: dict(sesgo="vela", N=10, V=10, minfvg=0.0, ce=0, kz="NY"),
}
VAR = {
    1: dict(L=[3, 5], N=[10, 20], V=[10, 20], minfvg=[0.0, 0.25], zona=[0, 2], ce=[0, 1], kz=list(KZ)),
    2: dict(L=[3, 5], V=[10, 20], ce=[0, 1], kz=list(KZ)),
    3: dict(sesgo=["ema50", "ema200"], V=[10, 20], minfvg=[0.0, 0.25], ce=[0, 1], kz=list(KZ)),
    4: dict(L=[2, 3], N=[10, 20], V=[10, 20], minfvg=[0.0, 0.25], ce=[0, 1], kz=list(KZ), tp=["2R", "Asia"]),
    5: dict(sesgo=["vela", "estructura"], N=[10, 20], V=[10, 20], minfvg=[0.0, 0.25], ce=[0, 1], kz=list(KZ)),
}


def trabajar(tarea):
    instr, (tfn, tf, tfm) = tarea
    t0 = time.time()
    P = preparar(instr, tf, tfm)
    filas = []
    for setup, var in VAR.items():
        claves = list(var)
        for vals in product(*[var[x] for x in claves]):
            p = dict(zip(claves, vals))
            det = detectar(P, setup, p)
            for cierre in (True, False):
                t, r, d, est = correr(instr, P, [det], cierre, tp_asia=(p.get("tp") == "Asia"))
                f = dict(instr=instr, tf=tfn, setup=setup, cierre=cierre, **{k: p[k] for k in claves},
                         es_prompt=all(p[k] == DEF[setup][k] for k in claves) and cierre, forzados=int((est == 2).sum()))
                f.update(medir(t, r))
                f["wr_compras"] = (r[d == 1] > 0).mean() if (d == 1).any() else np.nan
                f["wr_ventas"] = (r[d == -1] > 0).mean() if (d == -1).any() else np.nan
                filas.append(f)
    # los 5 combinados con la configuración del prompt
    dets = [detectar(P, s, DEF[s]) for s in DEF]
    for cierre in (True, False):
        t, r, d, est = correr(instr, P, dets, cierre)
        f = dict(instr=instr, tf=tfn, setup=0, cierre=cierre, es_prompt=cierre, forzados=int((est == 2).sum()))
        f.update(medir(t, r))
        filas.append(f)
    df = pd.DataFrame(filas)
    os.makedirs(SAL, exist_ok=True)
    df.to_csv(f"{SAL}/grilla_{instr}_{tfn}.csv.gz", index=False)
    print(f"{instr} {tfn}: {len(df)} pruebas, {time.time() - t0:.0f} s", flush=True)
    return len(df)


NOMBRE = {0: "Los 5 combinados", 1: "1 Barrido → OB/FVG", 2: "2 Breaker block", 3: "3 Continuación FVG", 4: "4 Poder de Tres (AMD)", 5: "5 Sesgo mayor + NY"}


def informe():
    g = pd.concat([pd.read_csv(os.path.join(SAL, x)) for x in sorted(os.listdir(SAL)) if x.startswith("grilla_")], ignore_index=True)
    g["nombre"] = g.setup.map(NOMBRE)
    print(f"pruebas: {len(g)}")
    # 1) configuración del prompt, por setup, activo y temporalidad
    p = g[g.es_prompt]
    t = p.pivot_table(index=["nombre", "instr"], columns="tf", values=["wr_tot", "exp_tot", "n_tot"], aggfunc="first")
    t.to_csv(f"{SAL}/prompt_por_activo.csv")
    print("\n== Configuración del prompt: win rate (%) | resultado por operación (R) | operaciones, últimos 5 años ==")
    for (nom, ins), f in p.groupby(["nombre", "instr"]):
        celdas = []
        for tf in ("1M", "5M", "15M"):
            x = f[f.tf == tf]
            if len(x) and x.n_tot.iloc[0] > 0:
                celdas.append(f"{tf}: {100 * x.wr_tot.iloc[0]:4.1f}% {x.exp_tot.iloc[0]:+.2f}R n={int(x.n_tot.iloc[0])}")
            else:
                celdas.append(f"{tf}: sin operaciones")
        print(f"{nom:22s} {ins}  " + " | ".join(celdas))
    # 2) promedio de cada setup en todas sus variantes
    v = g[g.n_tot >= 50]
    print("\n== Promedio de todas las variantes con ≥ 50 operaciones ==")
    print(v.groupby(["nombre", "tf"]).agg(variantes=("exp_tot", "size"), wr=("wr_tot", lambda x: round(100 * x.mean(), 1)),
                                         exp=("exp_tot", "mean"), pct_positivas=("exp_tot", lambda x: round(100 * (x > 0).mean(), 1)),
                                         mejor_wr=("wr_tot", lambda x: round(100 * x.max(), 1))).round(3).to_string())
    # 3) elección → confirmación
    k = g[(g.n_is >= 40) & (g.n_oos >= 20)].copy()
    anios = np.ones(len(k), bool)
    for j in (1, 2, 3):
        anios &= (k[f"n_a{j}"].fillna(0) >= 8) & (k[f"exp_a{j}"] > 0)
    k["paso1"] = (k.exp_is > 0) & anios
    k["paso2"] = k.paso1 & (k.exp_oos > 0)
    print(f"\n== Elección → confirmación: {int(k.paso1.sum())} variantes pasan la elección; en la confirmación dan "
          f"{k[k.paso1].exp_oos.mean():+.3f} R en promedio (todas las comparables: {k.exp_oos.mean():+.3f} R); pasan las dos: {int(k.paso2.sum())}")
    print(k[k.paso1].groupby("nombre").agg(n=("exp_oos", "size"), exp_eleccion=("exp_is", "mean"), exp_confirmacion=("exp_oos", "mean"),
                                           wr_confirmacion=("wr_oos", lambda x: round(100 * x.mean(), 1))).round(3).to_string())
    k[k.paso2].sort_values("exp_tot", ascending=False).to_csv(f"{SAL}/pasan_las_dos.csv", index=False)
    cols = ["nombre", "instr", "tf", "cierre", "L", "N", "V", "minfvg", "zona", "ce", "kz", "sesgo", "tp", "n_is", "wr_is", "exp_is",
            "n_oos", "wr_oos", "exp_oos", "n_tot", "wr_tot", "exp_tot", "pf_tot", "dd_tot"]
    o = k[k.paso2].sort_values("exp_tot", ascending=False)[cols].head(15).copy()
    for col in ("wr_is", "wr_oos", "wr_tot"):
        o[col] = (o[col] * 100).round(1)
    print("\nlas 15 con mejor resultado entre las que pasan las dos:")
    print(o.round(3).to_string(index=False))
    print(f"\ncon win rate ≥ 50 % en los 5 años y ≥ 50 operaciones: {int(((g.wr_tot >= 0.5) & (g.n_tot >= 50)).sum())}")


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "grilla"
    if modo == "grilla":
        tareas = [(i, t) for t in TFS for i in INSTR]
        t0 = time.time()
        with Pool(4) as pool:
            tot = sum(pool.imap_unordered(trabajar, tareas))
        print(f"\nTOTAL: {tot} pruebas en {time.time() - t0:.0f} s", flush=True)
    elif modo == "informe":
        informe()
    else:
        raise SystemExit(__doc__)
