"""
E035 — Línea A (XAUUSD institucional): ¿el barrido agrega información? (BITACORA, entrada 27).

a) factores: contribución de cada componente del setup SMC con las 171.072 variantes de E023 (sin correr nada nuevo).
   Para cada componente se emparejan las variantes que solo difieren en ese componente y se mide la diferencia de
   expectancy frente al nivel de referencia (el más simple). "Agrega valor": diferencia > 0 en elección y en
   confirmación y en al menos 5 de los 6 activos en la elección.
b) eventos: barrido vs aceptación en máximos/mínimos del día y la semana anteriores, Asia y Londres, contra un placebo
   (lab/eventos.py). Pasa: p < 0,05 con Holm entre las 8 pruebas en desarrollo y Δ > 0 con p < 0,10 en la confirmación.
Uso: python experimentos/E035_linea_institucional.py a|b
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, eventos as EV, multiples as MT, registro  # noqa: E402

SAL = "resultados/E035"
FACTORES = {"fuente": "swing", "recupera": False, "sesgo": "ninguno", "entrada": "mercado", "W": 12, "sesion": "todas", "liquidez": False}
TODOS = ["instr", "par", "L", "fuente", "W", "recupera", "sesgo", "entrada", "V", "sesion", "liquidez"]


def modo_a():
    g = pd.read_csv("resultados/E023/todas_resumen.csv.gz")
    g = g[g.n_is >= 10]
    filas = []
    for f, ref in FACTORES.items():
        # la validez V solo existe para órdenes límite: la entrada se compara sin V (límites con V = 12)
        otros = [c for c in TODOS if c != f and not (f == "entrada" and c == "V")]
        gb = g if f != "entrada" else g[(g.entrada == ref) | (g.V == 12)]
        base = gb[gb[f] == ref].drop_duplicates(otros).set_index(otros)
        for nivel in sorted(g[f].unique(), key=str):
            if nivel == ref:
                continue
            x = gb[gb[f] == nivel].drop_duplicates(otros).set_index(otros)
            par = x[["exp_is", "exp_oos", "n_oos"]].join(base[["exp_is", "exp_oos", "n_oos"]], rsuffix="_ref", how="inner")
            if not len(par):
                continue
            d_is = par.exp_is - par.exp_is_ref
            ok_oos = (par.n_oos >= 5) & (par.n_oos_ref >= 5)
            d_oos = (par.exp_oos - par.exp_oos_ref)[ok_oos]
            por_activo = d_is.groupby(level="instr").mean()
            filas.append(dict(componente=f, nivel=nivel, referencia=ref, pares=len(par), dif_eleccion=d_is.mean(),
                              dif_confirmacion=d_oos.mean(), activos_positivos_eleccion=int((por_activo > 0).sum()),
                              agrega_valor=bool(d_is.mean() > 0 and d_oos.mean() > 0 and (por_activo > 0).sum() >= 5),
                              **{f"eleccion_{k}": v for k, v in por_activo.round(3).items()}))
    t = pd.DataFrame(filas)
    os.makedirs(SAL, exist_ok=True)
    t.to_csv(f"{SAL}/factores_smc.csv", index=False)
    print(t[["componente", "nivel", "referencia", "pares", "dif_eleccion", "dif_confirmacion", "activos_positivos_eleccion",
             "agrega_valor"]].round(3).to_string(index=False))
    registro.registrar("E035a", __file__, hipotesis="Qué componentes del setup SMC agregan valor", n_variantes=0, resultados=t)


def modo_b():
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    P = EV.preparar(m1)
    d1 = P["d1"]
    fin_dev = pd.Timestamp("2021-11-15", tz="UTC").value // 10**6
    ini = np.searchsorted(d1["t"], pd.Timestamp("2010-11-15", tz="UTC").value // 10**6)
    todos = []
    for nivel in EV.NIVELES:
        ev = EV.detectar(P, nivel, desde_dia=ini)
        ev = EV.evaluar(P, m1, ev, n_placebo=20, semilla=0)
        todos.append(ev)
        print(nivel, len(ev), "eventos", flush=True)
    ev = pd.concat(todos, ignore_index=True)
    ev = ev[ev.t < pd.Timestamp("2026-11-14", tz="UTC").value // 10**6]
    ev.to_csv(f"{SAL}/eventos.csv.gz", index=False)
    filas = []
    for (nivel, tipo), g in ev.groupby(["nivel", "tipo"]):
        dv = EV.bootstrap_dias(g[g.t < fin_dev])
        cf = EV.bootstrap_dias(g[g.t >= fin_dev], semilla=1)
        filas.append(dict(nivel=nivel, tipo=tipo, n_dev=dv["n"], exp_dev=dv["exp_evento"], placebo_dev=dv["exp_placebo"],
                          delta_dev=dv["delta"], lo_dev=dv["lo"], hi_dev=dv["hi"], p_dev=dv["p"], wr_dev=dv.get("wr_evento"),
                          n_conf=cf["n"], exp_conf=cf["exp_evento"], placebo_conf=cf["exp_placebo"], delta_conf=cf["delta"],
                          p_conf=cf["p"]))
    t = pd.DataFrame(filas)
    t["holm_dev"] = MT.holm(t.p_dev.values, 0.05)
    t["pasa"] = t.holm_dev & (t.delta_conf > 0) & (t.p_conf < 0.10)
    t.to_csv(f"{SAL}/eventos_resumen.csv", index=False)
    print(t.round(3).to_string(index=False))
    registro.registrar("E035b", __file__, hipotesis="Un barrido de liquidez predice la reversión mejor que un placebo",
                       universo="XAUUSD M1", n_variantes=len(t), resultados=t)


def modo_b2():
    """Placebo corregido (entrada 29): otros días, misma hora y dirección. Usa los eventos de modo_b."""
    m1 = datos.cargar("XAUUSD")
    P = EV.preparar(m1)
    ev = pd.read_csv(f"{SAL}/eventos.csv.gz")
    fin_dev = pd.Timestamp("2021-11-15", tz="UTC").value // 10**6
    ini = pd.Timestamp("2010-11-15", tz="UTC").value // 10**6
    fin = pd.Timestamp("2026-11-14", tz="UTC").value // 10**6
    ev = EV.evaluar_otros_dias(P, m1, ev.drop(columns=["placebo_r", "n_placebo", "delta"]), [(ini, fin_dev), (fin_dev, fin)])
    ev.to_csv(f"{SAL}/eventos_placebo_otros_dias.csv.gz", index=False)
    from lab.validacion import bootstrap_ic
    filas = []
    for (nivel, tipo), g in ev.groupby(["nivel", "tipo"]):
        dv = EV.bootstrap_dias(g[g.t < fin_dev])
        cf = EV.bootstrap_dias(g[g.t >= fin_dev], semilla=1)
        lo_d, hi_d = bootstrap_ic(g[g.t < fin_dev].r.dropna().values)
        lo_c, hi_c = bootstrap_ic(g[g.t >= fin_dev].r.dropna().values, semilla=1)
        filas.append(dict(nivel=nivel, tipo=tipo, n_dev=dv["n"], exp_dev=dv["exp_evento"], exp_dev_lo=lo_d, exp_dev_hi=hi_d,
                          placebo_dev=dv["exp_placebo"], delta_dev=dv["delta"], p_dev=dv["p"], wr_dev=dv.get("wr_evento"),
                          n_conf=cf["n"], exp_conf=cf["exp_evento"], exp_conf_lo=lo_c, exp_conf_hi=hi_c,
                          placebo_conf=cf["exp_placebo"], delta_conf=cf["delta"], p_conf=cf["p"]))
    t = pd.DataFrame(filas)
    t["holm_dev"] = MT.holm(t.p_dev.values, 0.05)
    t["pasa_informacion"] = t.holm_dev & (t.delta_conf > 0) & (t.p_conf < 0.10)
    t["pasa_economica"] = (t.exp_dev_lo > 0) & (t.exp_conf_lo > 0)
    t.to_csv(f"{SAL}/eventos_resumen_placebo_corregido.csv", index=False)
    print(t.round(3).to_string(index=False))
    registro.registrar("E035b-corregido", __file__, hipotesis="Un barrido predice la dirección mejor que operar a la misma hora sin evento",
                       universo="XAUUSD M1", n_variantes=len(t), resultados=t)


if __name__ == "__main__":
    {"a": modo_a, "b": modo_b, "b2": modo_b2}[sys.argv[1]]()
