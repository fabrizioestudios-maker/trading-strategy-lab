"""
E026 — Auditoría de la selección y del sobreajuste (BITACORA, entrada 25).

A. Volver a ordenar las búsquedas E019, E023 y E025 SOLO con métricas de elección y medir el proceso honesto
   (las 10 mejores por elección → su resultado en la confirmación).
B. PBO por CSCV con 4 bloques (los 3 años de elección y la confirmación), por familia de búsqueda.
C. Llenado realista (orden límite llenada más allá de su stop → sale en el precio del llenado): vuelve a correr
   las grillas E023 y E025 completas con realista=True y compara.
Uso: python experimentos/E026_auditoria_seleccion.py [A|B|C ...]   (sin argumentos, las tres)
"""
import glob
import importlib.util
import os
import sys

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from lab import validacion as V  # noqa: E402
from lab.metricas import wilson  # noqa: E402

SAL = os.path.join(RAIZ, "resultados", "E026")
os.makedirs(SAL, exist_ok=True)
partes = sys.argv[1:] or ["A", "B", "C"]


def cargar(patron):
    return pd.concat([pd.read_csv(x) for x in sorted(glob.glob(os.path.join(RAIZ, patron)))], ignore_index=True)


def modulo(nombre, archivo):
    spec = importlib.util.spec_from_file_location(nombre, os.path.join(RAIZ, "experimentos", archivo))
    m = importlib.util.module_from_spec(spec)
    sys.modules[nombre] = m  # los procesos hijos lo necesitan para recibir sus funciones
    spec.loader.exec_module(m)
    return m


def t_is(g):  # estadístico t de la expectancy en elección (usa el desvío de los 5 años: sd_is no se guardó)
    return g.exp_is * np.sqrt(g.n_is) / g.sd_tot


if "A" in partes:
    print("== A. Selección solo con la muestra de elección ==")
    p1 = pd.read_csv(os.path.join(RAIZ, "resultados/E019/paso1.csv"))
    p1["wilson_is"] = [wilson(int(round(w * n)), int(n))[0] for w, n in zip(p1.wr_is, p1.n_is)]
    cols = ["instr", "tf", "familia", "param", "modo", "filtro", "dir", "k", "n_is", "wr_is", "n_oos", "wr_oos", "exp_oos", "wr_tot", "exp_tot"]
    p2 = p1[p1.paso2]
    orig = p2.sort_values(["wilson_tot", "simple", "exp_tot"], ascending=False).iloc[0]
    corr = p2.sort_values(["wilson_is", "simple"], ascending=False).iloc[0]
    print("E019 · regla original (Wilson de 5 años):", orig[cols[:8]].to_dict())
    print("E019 · regla corregida (Wilson de elección):", corr[cols[:8]].to_dict(), "· confirmación", round(100 * corr.wr_oos, 1), "%")
    top = p1.sort_values("wilson_is", ascending=False).head(10)
    print(f"E019 · proceso honesto (10 mejores por elección, sin mirar la confirmación): expectancy media en confirmación {top.exp_oos.mean():+.3f} R, "
          f"{int((top.exp_oos > 0).sum())}/10 positivas, win rate medio {100 * top.wr_oos.mean():.1f} %")
    filas = [dict(busqueda="E019", proceso="10 mejores por elección", exp_conf=top.exp_oos.mean(), positivas=int((top.exp_oos > 0).sum()), wr_conf=top.wr_oos.mean())]
    for nombre, pat in (("E023", "resultados/E023/todas_resumen.csv.gz"), ("E025", "resultados/E025/grilla_*.csv.gz")):
        g = cargar(pat)
        g = g[(g.n_is >= 60 if nombre == "E023" else g.n_is >= 40) & (g.n_oos >= 20)].copy()
        g["t_is"] = t_is(g)
        top = g.sort_values("t_is", ascending=False).head(10)
        print(f"{nombre} · 10 mejores por elección: expectancy en elección {top.exp_is.mean():+.3f} R → en confirmación {top.exp_oos.mean():+.3f} R, {int((top.exp_oos > 0).sum())}/10 positivas")
        filas.append(dict(busqueda=nombre, proceso="10 mejores por elección", exp_conf=top.exp_oos.mean(), positivas=int((top.exp_oos > 0).sum()), wr_conf=top.wr_oos.mean()))
        top.to_csv(os.path.join(SAL, f"A_top10_eleccion_{nombre}.csv"), index=False)
    pd.DataFrame(filas).to_csv(os.path.join(SAL, "A_proceso_honesto.csv"), index=False)
    if "paso2" in g.columns or True:
        e23 = cargar("resultados/E023/todas_resumen.csv.gz")
        p2 = e23[e23.paso2].copy()
        p2["t_is"] = t_is(p2)
        a = p2.sort_values("lb_exp", ascending=False).groupby("instr").head(1).set_index("instr")
        b = p2.sort_values("t_is", ascending=False).groupby("instr").head(1).set_index("instr")
        k = ["par", "L", "fuente", "W", "recupera", "sesgo", "entrada", "V", "sesion", "liquidez"]
        print("E023 · ¿la mejor por activo cambia con la regla corregida?", {i: bool((a.loc[i, k] == b.loc[i, k]).all()) for i in a.index})

if "B" in partes:
    print("\n== B. PBO (CSCV, 4 bloques: 3 años de elección + confirmación) ==")
    filas = []
    e19 = cargar("resultados/E019/grilla_*.csv.gz")
    e19 = e19[(e19[["n_a1", "n_a2", "n_a3"]].min(axis=1) >= 10) & (e19.n_oos >= 10)]
    for tf, g in e19.groupby("tf"):  # E019 solo guardó el win rate por año: con RR fijo es monótono con la expectancy
        r = V.pbo_cscv(g[["wr_a1", "wr_a2", "wr_a3", "wr_oos"]].to_numpy().T)
        filas.append(dict(busqueda="E019", familia=tf, metrica="win rate", configuraciones=r["configuraciones"], pbo=r["pbo"], oos_elegida=r.get("oos_elegida"), oos_mediana=r.get("oos_mediana")))
    for nombre, pat, fam in (("E023", "resultados/E023/todas_resumen.csv.gz", "par"), ("E025", "resultados/E025/grilla_*.csv.gz", "setup")):
        g0 = cargar(pat)
        g0 = g0[(g0[["n_a1", "n_a2", "n_a3"]].min(axis=1) >= 10) & (g0.n_oos >= 10)]
        for f, g in g0.groupby(fam):
            r = V.pbo_cscv(g[["exp_a1", "exp_a2", "exp_a3", "exp_oos"]].to_numpy().T)
            filas.append(dict(busqueda=nombre, familia=str(f), metrica="expectancy", configuraciones=r["configuraciones"], pbo=r["pbo"], oos_elegida=r.get("oos_elegida"), oos_mediana=r.get("oos_mediana")))
    t = pd.DataFrame(filas)
    t.to_csv(os.path.join(SAL, "B_pbo.csv"), index=False)
    print(t.round(3).to_string(index=False))

if "C" in partes:
    print("\n== C. Llenado realista en las grillas completas ==")
    from multiprocessing import Pool
    from lab import ict, smc
    orig_smc, orig_ict = smc.simular_ordenes, ict.simular
    smc.simular_ordenes = lambda *a: orig_smc(*a, True)
    ict.simular = lambda *a: orig_ict(*a, True)
    filas = []
    for nombre, archivo, tareas_de in (("E023", "E023_smc_grilla.py", lambda m: [(i, p) for p in m.PARES for i in m.INSTR]),
                                      ("E025", "E025_ict_cinco_setups.py", lambda m: [(i, t) for t in m.TFS for i in m.INSTR])):
        m = modulo(nombre.lower(), archivo)
        dest = os.path.join(SAL, "C_" + nombre)
        os.makedirs(dest, exist_ok=True)
        m.SAL = dest
        with Pool(4) as pool:
            list(pool.imap_unordered(m.trabajar, tareas_de(m)))
        nuevo = cargar(os.path.relpath(os.path.join(dest, "grilla_*.csv.gz"), RAIZ))
        viejo = cargar(f"resultados/{nombre}/grilla_*.csv.gz")
        k = [c for c in viejo.columns if c in ("instr", "par", "tf", "setup", "L", "fuente", "W", "recupera", "sesgo", "entrada", "V", "sesion", "liquidez", "cierre", "N", "minfvg", "zona", "ce", "kz", "tp")]
        j = viejo.merge(nuevo, on=k, suffixes=("_hist", "_real"))
        j = j[j.n_tot_hist >= 30]
        d = j.exp_tot_real - j.exp_tot_hist
        filas.append(dict(busqueda=nombre, configuraciones=len(j), cambian=int((d.abs() > 1e-9).sum()), dif_media=d.mean(), dif_p5=d.quantile(0.05), dif_min=d.min(),
                          exp_media_hist=j.exp_tot_hist.mean(), exp_media_real=j.exp_tot_real.mean()))
        print(filas[-1])
    pd.DataFrame(filas).to_csv(os.path.join(SAL, "C_llenado_realista.csv"), index=False)
