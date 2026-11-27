"""
E028 — Walk-forward con purga (BITACORA, entrada 27).

Uso:
  python experimentos/E028_walkforward.py a     # familia del oro D1 (720 configuraciones, motor M1)
  python experimentos/E028_walkforward.py b     # universo D1 de E019 (13 activos), re-simulado en 2010–2026

a) Ruptura de Bollinger en XAUUSD D1: n ∈ {10,15,20,25,30}, desvíos ∈ {1,5; 2; 2,5}, filtro SMA ∈ {0 (ninguno), 100, 200},
   SL ∈ {0,25; 0,5; 0,75; 1} ATR(14), RR ∈ {1,5; 2; 2,5; 3}. Señal en el cierre de la vela diaria (17:00 NY), entrada en el
   minuto siguiente; costos de docs/costos.md; una operación a la vez. (20, 2, 200, 0,5, 2) es E022.
b) Todas las combinaciones D1 de E019 (familia, parámetros, modo, filtro, dirección, k), RR 2, en 2010-11-15 → 2026-11-14.
Esquemas 3/1 (principal), 5/1, 5/2 y expansivo/1; purga de 5 días; reglas R1 (media − EE), R2 (GT-Score), R3 (meseta y
acantilado). Resultados en resultados/E028/.
"""
import os
import sys
import time
from multiprocessing import Pool

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, grilla, motor, objetivos, registro, senales as S, validacion as V, walkforward as wf  # noqa: E402

SAL = "resultados/E028"
DESDE = wf.ms("2010-11-15")
FIN = wf.ms("2026-11-14")
ESQUEMAS = ["3/1", "5/1", "5/2", "exp/1"]
REGLAS = ["R1", "R2", "R3"]


# ------------------------------------------------------------------ a) familia del oro D1
def bollinger_ruptura(c, n, k):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    arriba = (c > bs) & ~(prev(c) > prev(bs))
    abajo = (c < bi) & ~(prev(c) < prev(bi))
    return np.where(arriba, 1, np.where(abajo, -1, 0)).astype(np.int8)


def familia_oro():
    m1 = datos.cargar("XAUUSD")
    v = datos.velas(m1, 1440)
    atr = datos.atr(v, 14)
    nb = len(v["t"])
    filas, partes = [], []
    cid = 0
    for n in (10, 15, 20, 25, 30):
        for kb in (1.5, 2.0, 2.5):
            base = bollinger_ruptura(v["c"], n, kb)
            for sma in (0, 100, 200):
                s = base if sma == 0 else np.where(base == S.sobre_sma(v, sma), base, 0)
                ok = (s != 0) & ~np.isnan(atr) & (v["t"] >= DESDE) & (np.arange(nb) < nb - 1)
                sel = np.flatnonzero(ok)
                ie = v["i1"][sel] + 1
                d = s[sel].astype(np.int64)
                ent = m1["o"][ie]
                for ka in (0.25, 0.5, 0.75, 1.0):
                    for rr in (1.5, 2.0, 2.5, 3.0):
                        riesgo = ka * atr[sel]
                        o = motor.simular(m1, ie, d, ent - d * riesgo, ent + d * rr * riesgo, datos.costo("XAUUSD", ent))
                        m = o["motivo"] != 3
                        partes.append(pd.DataFrame(dict(cfg=cid, t=o["t"][m], t_salida=o["t_salida"][m], dir=o["dir"][m],
                                                        entrada=o["entrada"][m], salida=o["salida"][m], sl=o["sl"][m],
                                                        motivo=o["motivo"][m], r=o["r"][m])))
                        filas.append(dict(cfg=cid, n=n, k_bb=kb, sma=sma, k_atr=ka, rr=rr))
                        cid += 1
    return pd.DataFrame(filas), pd.concat(partes, ignore_index=True)


# ------------------------------------------------------------------ b) universo D1 de E019
def _universo_instr(instr):
    m1 = datos.cargar(instr)
    v = datos.velas(m1, 1440)
    nb = len(v["t"])
    atr = datos.atr(v, 14)
    f200 = S.sobre_sma(v, 200)
    g = pd.read_csv(f"resultados/E019/grilla_{instr}.csv.gz")
    g = g[g.tf == "D1"].reset_index(drop=True)
    sig = {(f, p): s for f, p, _, s in grilla.variantes(v, 1440)}
    partes = []
    valido = ~np.isnan(atr) & (v["t"] >= DESDE) & (np.arange(nb) < nb - 1)
    for j, row in g.iterrows():
        s = sig[(row.familia, str(row.param))]
        if row.familia == "siempre":
            s = np.ones(nb, np.int8) if row.dir == "largos" else -np.ones(nb, np.int8)
        if row.modo == "cambio":
            s = np.where(s != np.concatenate([[0], s[:-1]]), s, 0)
        if row.filtro == "sma200":
            s = np.where(s == f200, s, 0)
        if row.dir == "largos":
            s = np.where(s == 1, s, 0)
        elif row.dir == "cortos":
            s = np.where(s == -1, s, 0)
        sel = np.flatnonzero((s != 0) & valido)
        if not len(sel):
            continue
        ie = v["i1"][sel] + 1
        d = s[sel].astype(np.int64)
        ent = m1["o"][ie]
        riesgo = row.k * atr[sel]
        o = motor.simular(m1, ie, d, ent - d * riesgo, ent + d * 2.0 * riesgo, datos.costo(instr, ent))
        m = o["motivo"] != 3
        partes.append(pd.DataFrame(dict(fila=j, t=o["t"][m], t_salida=o["t_salida"][m], r=o["r"][m].astype(np.float32))))
    ops = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=["fila", "t", "t_salida", "r"])
    g["instr"] = instr
    return instr, g[["instr", "familia", "param", "modo", "filtro", "dir", "k"]], ops


# ------------------------------------------------------------------ walk-forward
def correr_wf(cfgs, ops, columnas_vec, top=1, n_min=15, etiqueta=""):
    O = wf.Operaciones(ops.cfg.values, ops.t.values, ops.t_salida.values, ops.r.values)
    vec = objetivos.vecinos(cfgs, columnas_vec)
    filas, tablas = [], {}
    for esq in ESQUEMAS:
        folds = wf.pliegues(esq, fin=FIN)
        for regla in REGLAS:
            t0 = time.time()
            tab, te = wf.correr(O, folds, regla, top=top, n_min=n_min, vecinos_idx=vec)
            res = wf.resumen_wf(tab, te)
            res.update(esquema=esq, regla=regla, segundos=round(time.time() - t0, 1))
            if top > 1:
                elegidas = tab[tab.n_te > 0]
                res["supervivencia"] = float((elegidas.exp_te > 0).mean()) if len(elegidas) else np.nan
            filas.append(res)
            tablas[(esq, regla)] = tab
            print(etiqueta, esq, regla, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in res.items()}, flush=True)
    return pd.DataFrame(filas), tablas, O


def referencia_fija(O, k, folds):
    """Resultado fuera de muestra de una configuración fija en las ventanas de prueba de los pliegues."""
    r = []
    for f in folds:
        x = O.ventana(k, f["test_a"], f["test_b"])
        r.append(x.r.values)
    r = np.concatenate(r) if r else np.array([])
    lo, hi = V.bootstrap_ic(r) if len(r) > 2 else (np.nan, np.nan)
    return dict(n=len(r), exp=float(r.mean()) if len(r) else np.nan, ic_lo=lo, ic_hi=hi)


def azar(O, folds):
    """Expectancy de prueba promedio entre todas las configuraciones (elegir al azar)."""
    vals = []
    for f in folds:
        st = wf.estadisticas(O, f["test_a"], f["test_b"])
        vals.append(np.nanmean(st.mu.values))
    return float(np.nanmean(vals))


def modo_a():
    os.makedirs(SAL, exist_ok=True)
    t0 = time.time()
    cfgs, ops = familia_oro()
    print(f"familia del oro: {len(cfgs)} configuraciones, {len(ops)} operaciones, {time.time() - t0:.0f} s", flush=True)
    k22 = int(cfgs[(cfgs.n == 20) & (cfgs.k_bb == 2.0) & (cfgs.sma == 200) & (cfgs.k_atr == 0.5) & (cfgs.rr == 2.0)].cfg.iloc[0])
    x = ops[(ops.cfg == k22) & (ops.t >= wf.ms("2011-11-15"))]
    print(f"control E022 (2011-11-15 en adelante): n={len(x)} exp={x.r.mean():+.3f} (E027: 168 y +0,407)", flush=True)
    ops.to_csv(f"{SAL}/a_operaciones.csv.gz", index=False)
    cfgs.to_csv(f"{SAL}/a_configuraciones.csv", index=False)
    res, tablas, O = correr_wf(cfgs, ops, ["n", "k_bb", "sma", "k_atr", "rr"], top=1, n_min=15, etiqueta="a")
    refs = []
    for esq in ESQUEMAS:
        folds = wf.pliegues(esq, fin=FIN)
        rf = referencia_fija(O, k22, folds)
        refs.append(dict(esquema=esq, e022_n=rf["n"], e022_exp=rf["exp"], e022_ic_lo=rf["ic_lo"], azar_exp=azar(O, folds)))
    refs = pd.DataFrame(refs)
    res = res.merge(refs, on="esquema")
    res.to_csv(f"{SAL}/a_resumen.csv", index=False)
    pd.concat([t.assign(esquema=e, regla=r) for (e, r), t in tablas.items()]).merge(cfgs, on="cfg", how="left").to_csv(
        f"{SAL}/a_elegidas_por_pliegue.csv", index=False)
    principal = res[(res.esquema == "3/1") & (res.regla == "R1")].iloc[0]
    pasa = principal.exp > 0 and principal.ic_lo > 0 and principal.gr >= 0.5 and principal.pliegues_positivos >= 2 / 3
    print("\nPRINCIPAL 3/1 R1:", principal.to_dict(), "→", "PASA" if pasa else "NO PASA", flush=True)
    registro.registrar("E028a", __file__, hipotesis="La familia de E022 elegida solo con el pasado conserva ventaja",
                       universo="XAUUSD D1", n_variantes=len(cfgs), protocolo="walk-forward con purga de 5 días; R1/R2/R3",
                       resultados=res, estado="pasa" if pasa else "no pasa")


def modo_b():
    os.makedirs(SAL, exist_ok=True)
    t0 = time.time()
    with Pool(4) as p:
        salidas = p.map(_universo_instr, datos_instr())
    cfgs, partes, base = [], [], 0
    for instr, g, ops in salidas:
        g = g.copy()
        g["cfg"] = np.arange(base, base + len(g))
        ops = ops.assign(cfg=ops.fila + base)
        base += len(g)
        cfgs.append(g)
        partes.append(ops[["cfg", "t", "t_salida", "r"]])
    cfgs = pd.concat(cfgs, ignore_index=True)
    ops = pd.concat(partes, ignore_index=True)
    print(f"universo D1: {len(cfgs)} configuraciones, {len(ops)} operaciones, {time.time() - t0:.0f} s", flush=True)
    cfgs.to_csv(f"{SAL}/b_configuraciones.csv.gz", index=False)
    np.savez_compressed(f"{SAL}/b_operaciones.npz", cfg=ops.cfg.values, t=ops.t.values, t_salida=ops.t_salida.values,
                        r=ops.r.values.astype(np.float32))
    # vecinos: mismas columnas salvo k (un paso de k en la lista de E019)
    cfgs["k_ord"] = cfgs.k
    res, tablas, O = correr_wf(cfgs, ops, ["instr", "familia", "param", "modo", "filtro", "dir", "k_ord"], top=10, n_min=15,
                               etiqueta="b")
    filas = []
    for esq in ESQUEMAS:
        folds = wf.pliegues(esq, fin=FIN)
        vals = []
        for f in folds:
            st = wf.estadisticas(O, f["test_a"], f["test_b"])
            m = st.n > 0
            vals.append((st.mu[m] > 0).mean())
        filas.append(dict(esquema=esq, supervivencia_azar=float(np.mean(vals)), azar_exp=azar(O, folds)))
    res = res.merge(pd.DataFrame(filas), on="esquema")
    res.to_csv(f"{SAL}/b_resumen.csv", index=False)
    pd.concat([t.assign(esquema=e, regla=r) for (e, r), t in tablas.items()]).merge(
        cfgs.drop(columns=["k_ord"]), on="cfg", how="left").to_csv(f"{SAL}/b_elegidas_por_pliegue.csv.gz", index=False)
    print(res.round(3).to_string(index=False))
    registro.registrar("E028b", __file__, hipotesis="Reglas de elección con estabilidad suben la supervivencia fuera de muestra",
                       universo="13 activos D1 (E019)", n_variantes=len(cfgs), resultados=res)


def datos_instr():
    return ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR",
            "AUXAUD", "HKXHKD"]


if __name__ == "__main__" and (len(sys.argv) < 2 or sys.argv[1] in ("a", "b")):
    {"a": modo_a, "b": modo_b}[sys.argv[1] if len(sys.argv) > 1 else "a"]()


def modo_pbo():
    """PBO por CSCV con 16 bloques anuales (años de laboratorio 2010-11-15 → 2026-11-14) para el universo D1 y la familia
    del oro. Métrica por bloque: R total del bloque (0 si no operó)."""
    z = np.load(f"{SAL}/b_operaciones.npz")
    cfgs = pd.read_csv(f"{SAL}/b_configuraciones.csv.gz")
    bordes = np.array([wf.anio_lab(y) for y in range(2010, 2027)])
    filas = []

    def matriz(cfg, t, r, K):
        blo = np.searchsorted(bordes, t, side="right") - 1
        ok = (blo >= 0) & (blo < 16)
        M = np.zeros((16, K))
        np.add.at(M, (blo[ok], cfg[ok]), r[ok])
        return M

    Mb = matriz(z["cfg"], z["t"], z["r"].astype(float), int(cfgs.cfg.max()) + 1)
    for nombre, cols in (("universo D1 (13 activos)", None),) + tuple((f"D1 {i}", i) for i in sorted(cfgs.instr.unique())):
        sel = np.arange(Mb.shape[1]) if cols is None else cfgs.cfg[cfgs.instr == cols].values
        res = V.pbo_cscv(Mb[:, sel])
        filas.append(dict(conjunto=nombre, configuraciones=res["configuraciones"], particiones=res["particiones"],
                          pbo=res["pbo"], oos_elegida=res["oos_elegida"], oos_mediana=res["oos_mediana"]))
        print(filas[-1], flush=True)
    a = pd.read_csv(f"{SAL}/a_operaciones.csv.gz")
    Ma = matriz(a.cfg.values, a.t.values, a.r.values, int(a.cfg.max()) + 1)
    res = V.pbo_cscv(Ma)
    filas.append(dict(conjunto="familia del oro D1 (720)", configuraciones=res["configuraciones"], particiones=res["particiones"],
                      pbo=res["pbo"], oos_elegida=res["oos_elegida"], oos_mediana=res["oos_mediana"]))
    print(filas[-1], flush=True)
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/pbo_16_bloques.csv", index=False)
    registro.registrar("E028-pbo", __file__, hipotesis="PBO con 16 bloques anuales", resultados=t)


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "pbo":
    modo_pbo()
