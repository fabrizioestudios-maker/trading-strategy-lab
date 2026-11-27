"""
E019 — Búsqueda exhaustiva en los últimos 5 años (BITACORA, entrada 18).

Uso:
  python experimentos/E019_busqueda_5_anios.py grilla [INSTR,...]   # corre la grilla (4 procesos) → resultados/E019/grilla_<INSTR>.csv.gz
  python experimentos/E019_busqueda_5_anios.py elegir                # aplica la regla registrada → resultados/E019/elegidas.csv

Períodos: elección 15/11/2021–14/11/2024, confirmación 15/11/2024 en adelante (datos hasta 13/11/2026).
Entrada en la apertura de la vela siguiente a la señal. SL = k·ATR(14) de la temporalidad, TP = 2·SL, costos de
docs/costos.md, una operación a la vez por instrumento y combinación, salidas resueltas en M1.
"""
import os
import sys
import time
from multiprocessing import Pool

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, grilla, motor, senales as S  # noqa: E402
from lab.metricas import wilson  # noqa: E402

INSTR = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "HKXHKD"]
TFS = [("M5", 5), ("M15", 15), ("H1", 60), ("H4", 240), ("D1", 1440)]
KS = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0]
RR = 2.0


def ms(f):
    return pd.Timestamp(f, tz="UTC").value // 10**6


CARGA = ms("2020-01-01")
T_INI, T_OOS = ms("2021-11-15"), ms("2024-11-15")
ANIOS = [(ms("2021-11-15"), ms("2022-11-15")), (ms("2022-11-15"), ms("2023-11-15")), (ms("2023-11-15"), ms("2024-11-15"))]
SALIDA = "resultados/E019"


def medir(t, r, dur_dias):
    f = {}
    for nombre, (a, b) in [("is", (T_INI, T_OOS)), ("oos", (T_OOS, 1 << 62))] + [(f"a{j + 1}", p) for j, p in enumerate(ANIOS)]:
        m = (t >= a) & (t < b)
        rr = r[m]
        f[f"n_{nombre}"] = len(rr)
        f[f"wr_{nombre}"] = (rr > 0).mean() if len(rr) else np.nan
        if nombre in ("is", "oos"):
            f[f"exp_{nombre}"] = rr.mean() if len(rr) else np.nan
    n = len(r)
    f["n_tot"] = n
    if n:
        g, p = r[r > 0], r[r <= 0]
        f["wr_tot"] = len(g) / n
        f["exp_tot"] = r.mean()
        f["payoff_tot"] = g.mean() / -p.mean() if len(g) and len(p) and p.mean() < 0 else np.nan
        f["pf_tot"] = g.sum() / -p.sum() if len(p) and p.sum() < 0 else np.nan
        curva = np.concatenate([[0.0], np.cumsum(r)])
        f["dd_tot"] = float(np.max(np.maximum.accumulate(curva) - curva))
        f["r_tot"] = r.sum()
        f["dias"] = dur_dias.mean()
    return f


def trabajar(instr):
    t0 = time.time()
    m1 = datos.cargar(instr)
    a = np.searchsorted(m1["t"], CARGA)
    m1 = {k: v[a:] for k, v in m1.items()}
    d1 = datos.velas(m1, 1440)
    tend_d1 = S.sobre_sma(d1, 200)
    filas, sin_senales = [], 0
    for tfn, tf in TFS:
        v = datos.velas(m1, tf)
        nb = len(v["t"])
        atr = datos.atr(v, 14)
        f200 = S.sobre_sma(v, 200)
        if tf < 1440:
            q = np.searchsorted(d1["i1"], v["i1"], side="right") - 1
            fd1 = np.where(q >= 0, tend_d1[np.clip(q, 0, None)], 0)
        valido = ~np.isnan(atr) & (v["t"] >= T_INI) & (np.arange(nb) < nb - 1)
        ie_todas = v["i1"] + 1
        for fam, par, tipo, s in grilla.variantes(v, tf):
            modos = ["estado", "cambio"] if tipo == "estado" else (["evento"] if tipo == "evento" else ["estado"])
            filtros = ["ninguno"] + ([] if fam in grilla.USA_SMA200 or fam == "siempre" else ["sma200"]) + (["d1"] if tf < 1440 else [])
            dirs = ["largos", "cortos"] if fam == "siempre" else ["ambos", "largos", "cortos"]
            for modo in modos:
                base = s if modo != "cambio" else np.where(s != np.concatenate([[0], s[:-1]]), s, 0)
                for filtro in filtros:
                    sf = base if filtro == "ninguno" else np.where(base == (f200 if filtro == "sma200" else fd1), base, 0)
                    for dr in dirs:
                        if fam == "siempre":
                            sd = (np.ones(nb, np.int8) if dr == "largos" else -np.ones(nb, np.int8))
                            if filtro == "d1":
                                sd = np.where(sd == fd1, sd, 0)
                        else:
                            sd = sf if dr == "ambos" else np.where(sf == (1 if dr == "largos" else -1), sf, 0)
                        sel = np.flatnonzero((sd != 0) & valido)
                        if len(sel) < 45:
                            sin_senales += len(KS)
                            continue
                        ie = ie_todas[sel]
                        d = sd[sel].astype(np.int64)
                        ent = m1["o"][ie]
                        costo = datos.costo(instr, ent)
                        for k in KS:
                            riesgo = k * atr[sel]
                            ops = motor.simular(m1, ie, d, ent - d * riesgo, ent + d * RR * riesgo, costo)
                            m = ops["motivo"] != 3
                            f = dict(instr=instr, tf=tfn, familia=fam, param=par, modo=modo, filtro=filtro, dir=dr, k=k)
                            f.update(medir(ops["t"][m], ops["r"][m], (ops["t_salida"][m] - ops["t"][m]) / 86400000.0))
                            filas.append(f)
        print(f"{instr} {tfn} listo ({len(filas)} filas, {time.time() - t0:.0f} s)", flush=True)
    return pd.DataFrame(filas), sin_senales


def correr_grilla(instrs):
    os.makedirs(SALIDA, exist_ok=True)
    t0 = time.time()
    partes, sin = [], 0
    with Pool(4) as pool:
        for df, s in pool.imap_unordered(trabajar, instrs):
            partes.append(df)
            sin += s
            df.to_csv(f"{SALIDA}/grilla_{df.instr.iloc[0]}.csv.gz", index=False)
    g = pd.concat(partes, ignore_index=True)  # un archivo por instrumento (grilla_<INSTR>.csv.gz); elegir() los une
    print(f"\nCOMBINACIONES SIMULADAS: {len(g)} · sin señales suficientes (< 45 entradas posibles): {sin} · "
          f"total probadas: {len(g) + sin} · {time.time() - t0:.0f} s", flush=True)


CLAVE = ["instr", "tf", "familia", "param", "modo", "filtro", "dir"]


def elegir():
    archivos = sorted(x for x in os.listdir(SALIDA) if x.startswith("grilla_"))
    g = pd.concat([pd.read_csv(os.path.join(SALIDA, x)) for x in archivos], ignore_index=True)
    total = len(g)
    # vecinos de k en la grilla
    g = g.sort_values(CLAVE + ["k"]).reset_index(drop=True)
    grp = g.groupby(CLAVE, sort=False)
    g["wr_is_kmenos"] = grp["wr_is"].shift(1)
    g["wr_is_kmas"] = grp["wr_is"].shift(-1)
    paso1 = ((g.n_is >= 30) & (g.wr_is >= 0.5) & (g.exp_is > 0)
             & (g[["n_a1", "n_a2", "n_a3"]].min(axis=1) >= 5) & (g[["wr_a1", "wr_a2", "wr_a3"]].min(axis=1) >= 0.40)
             & (g.wr_is_kmenos.isna() | (g.wr_is_kmenos >= 0.45)) & (g.wr_is_kmas.isna() | (g.wr_is_kmas >= 0.45)))
    paso2 = paso1 & (g.n_oos >= 15) & (g.wr_oos >= 0.5) & (g.exp_oos > 0)
    # comparación con comprar o vender siempre (mismo instrumento, temporalidad, dirección y k; sin filtro)
    base = g[(g.familia == "siempre") & (g.filtro == "ninguno")][["instr", "tf", "dir", "k", "wr_tot", "exp_tot"]]
    base = base.rename(columns={"wr_tot": "wr_siempre", "exp_tot": "exp_siempre"})
    g = g.merge(base, on=["instr", "tf", "dir", "k"], how="left")
    g["paso1"], g["paso2"] = paso1.values, paso2.values
    lo = [wilson(int(round(w * n)), int(n))[0] if n > 0 else np.nan for w, n in zip(g.wr_tot.fillna(0), g.n_tot)]
    g["wilson_tot"] = lo
    g["simple"] = (g.filtro == "ninguno").astype(int) + (g.modo != "cambio").astype(int)
    el = g[g.paso2].sort_values(["wilson_tot", "simple", "exp_tot"], ascending=False)
    el.to_csv(f"{SALIDA}/elegidas.csv", index=False)
    g[g.paso1].to_csv(f"{SALIDA}/paso1.csv", index=False)
    print(f"combinaciones simuladas: {total}")
    print(f"pasan la elección (paso 1): {int(paso1.sum())}   ·   pasan también la confirmación (paso 2): {int(paso2.sum())}")
    print(f"de las que pasan el paso 2, controles 'siempre': {int((el.familia == 'siempre').sum())}")
    print("\npaso 1 por temporalidad y dirección:")
    print(g[g.paso1].groupby(["tf", "dir"]).size().unstack(fill_value=0).to_string())
    print("\npaso 2 por instrumento y dirección:")
    print(el.groupby(["instr", "dir"]).size().unstack(fill_value=0).to_string())
    cols = ["instr", "tf", "familia", "param", "modo", "filtro", "dir", "k", "n_is", "wr_is", "n_oos", "wr_oos", "n_tot", "wr_tot",
            "wilson_tot", "exp_tot", "payoff_tot", "pf_tot", "dd_tot", "dias", "wr_siempre"]
    o = el[cols].head(40).copy()
    for c in ("wr_is", "wr_oos", "wr_tot", "wilson_tot", "wr_siempre"):
        o[c] = (o[c] * 100).round(1)
    print("\nTOP 40 (paso 2, orden de la regla):")
    print(o.round(2).to_string(index=False))


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "grilla"
    if modo == "grilla":
        correr_grilla(sys.argv[2].split(",") if len(sys.argv) > 2 else INSTR)
    elif modo == "elegir":
        elegir()
    else:
        raise SystemExit(__doc__)
