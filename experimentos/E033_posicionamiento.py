"""
E033 — Posicionamiento (COT por tipo de participante) e intermercado, con datos gratuitos (BITACORA, entrada 27).

Señales por mercado (lab/flujo.py), con la fecha real de publicación (lab/externos.py):
  F1 = z (156 semanas) de la posición neta/OI de los fondos → se espera IC < 0 (contraria);
  F2 = z de los comerciales → IC > 0;   F3 = cambio semanal de los fondos → IC > 0.
Retorno: log a 1 y 4 semanas desde el primer cierre diario (17:00 NY) posterior a la publicación.
Prueba principal: IC promedio entre los 8 mercados (bootstrap de bloques de 8 semanas), Holm entre las 6 pruebas.
Pasa: signo esperado con p < 0,05 (Holm) en desarrollo (publicado 15/11/2010–14/11/2021) y el mismo signo con
p < 0,10 en la confirmación (15/11/2021–13/11/2026).
Intermercado del oro (diario): cambio del rendimiento real (DFII10, conocido el día hábil siguiente) → IC < 0
esperado; cambio del log del GVZ (16:15 NY) → prueba de dos colas. Retorno del día siguiente.
La prueba de volumen de futuros (GC=F) no se puede hacer: el volumen de Yahoo no sirve antes de 2020.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import benchmarks as BM, externos as X, flujo as FL, multiples as MT, registro  # noqa: E402

SAL = "resultados/E033"
MERCADOS = {"oro": ("XAUUSD", 1), "plata": ("XAGUSD", 1), "euro": ("EURUSD", 1), "libra": ("GBPUSD", 1), "yen": ("USDJPY", -1),
            "dolar_australiano": ("AUDUSD", 1), "sp500_emini": ("SPXUSD", 1), "nasdaq_emini": ("NSXUSD", 1)}
SIGNO = {"F1": -1, "F2": 1, "F3": 1}
DEV = (pd.Timestamp("2010-11-15", tz="UTC"), pd.Timestamp("2021-11-15", tz="UTC"))
CONF = (pd.Timestamp("2021-11-15", tz="UTC"), pd.Timestamp("2026-11-14", tz="UTC"))


def ms(ts):
    return ts.value // 10**6


def paneles():
    out = {}
    for nombre, (instr, signo) in MERCADOS.items():
        df = X.cot(nombre)
        tipo = X.COT[nombre][2]
        s = FL.senales_cot(df, tipo)
        d1 = BM.cierres_diarios(instr)
        for h in (1, 4):
            s[f"y{h}"] = FL.retorno_futuro(d1, s.disponible_ms.values, h)
        for f in ("F1", "F2", "F3"):
            s[f] = s[f] * signo  # el yen cotiza al revés que USDJPY
        out[nombre] = s
    return out


def panel_de(P, feat, h, a, b):
    return {m: s[(s.disponible_ms >= ms(a)) & (s.disponible_ms < ms(b))].set_index("fecha")[[feat, f"y{h}"]].rename(
        columns={feat: "x", f"y{h}": "y"}) for m, s in P.items()}


def ic_diario(x, y, signo, a, b, bloque=20, B=2000, semilla=0):
    df = pd.DataFrame(dict(x=x, y=y)).dropna()
    df = df[(df.index >= a.tz_localize(None)) & (df.index < b.tz_localize(None))]
    return FL.ic_panel({"oro": df}, signo=signo, B=B, bloque=bloque, semilla=semilla)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    P = paneles()
    filas = []
    for feat in ("F1", "F2", "F3"):
        for h in (1, 4):
            dev = FL.ic_panel(panel_de(P, feat, h, *DEV), signo=SIGNO[feat], B=2000, bloque=8)
            conf = FL.ic_panel(panel_de(P, feat, h, *CONF), signo=SIGNO[feat], B=2000, bloque=8, semilla=1)
            filas.append(dict(prueba=f"{feat} {h} sem", signo_esperado=SIGNO[feat], ic_dev=dev["ic"], p_dev=dev["p"],
                              ic_conf=conf["ic"], p_conf=conf["p"],
                              **{f"dev_{m}": v for m, v in dev["ic_por_mercado"].items()}))
            print(filas[-1]["prueba"], round(dev["ic"], 4), round(dev["p"], 3), "| conf", round(conf["ic"], 4), round(conf["p"], 3), flush=True)
    t = pd.DataFrame(filas)
    holm = MT.holm(t.p_dev.values, 0.05)
    t["holm_dev"] = holm
    t["pasa"] = holm & (np.sign(t.ic_conf) == t.signo_esperado) & (t.p_conf < 0.10)
    t.to_csv(f"{SAL}/cot.csv", index=False)
    # intermercado del oro
    oro = BM.cierres_diarios("XAUUSD")
    v = dict(t=oro.t.values)
    y_sig = np.log(oro.c.shift(-1) / oro.c).values  # retorno del cierre de hoy al de mañana
    dfii = X.a_velas(X.fred("DFII10"), v)
    gvz = X.a_velas(X.fred("GVZCLS"), v)
    x_ry = pd.Series(dfii, index=oro.index).diff()
    x_gvz = pd.Series(np.log(gvz), index=oro.index).diff()
    y = pd.Series(y_sig, index=oro.index)
    im = []
    for nombre, x, signo in (("Δ rendimiento real (DFII10)", x_ry, -1), ("Δ log GVZ", x_gvz, 1)):
        d = ic_diario(x, y, signo, *DEV)
        c = ic_diario(x, y, signo, *CONF, semilla=1)
        dos_colas = nombre.startswith("Δ log")
        p_d = 2 * min(d["p"], 1 - d["p"]) if dos_colas else d["p"]
        p_c = 2 * min(c["p"], 1 - c["p"]) if dos_colas else c["p"]
        im.append(dict(prueba=nombre, ic_dev=d["ic"], p_dev=p_d, ic_conf=c["ic"], p_conf=p_c,
                       pasa=bool(p_d < 0.05 and np.sign(c["ic"]) == np.sign(d["ic"]) and p_c < 0.10)))
        print(im[-1], flush=True)
    ti = pd.DataFrame(im)
    ti.to_csv(f"{SAL}/intermercado_oro.csv", index=False)
    print(t[["prueba", "ic_dev", "p_dev", "holm_dev", "ic_conf", "p_conf", "pasa"]].round(4).to_string(index=False))
    print(ti.round(4).to_string(index=False))
    registro.registrar("E033", __file__, hipotesis="El posicionamiento del COT y el intermercado predicen retornos",
                       n_variantes=len(t) + len(ti), resultados=dict(cot=t, intermercado=ti))
