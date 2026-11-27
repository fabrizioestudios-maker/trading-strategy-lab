"""
Listas de operaciones de las candidatas, con las mismas funciones que las generaron (para E029, E030, E032, E034, E038).
Todas devuelven un DataFrame con: instr, t, t_salida (ms UTC), dir, entrada, salida, sl, motivo, r.

- e022(): oro D1, ruptura de Bollinger (20, 2) a favor de la SMA 200, SL 0,5 ATR, TP 2R (grilla.operaciones_config).
- candidata_b(): tendencia 200 (cierre > SMA 200 y SMA subiendo), solo compras, 6 ATR, RR 2,1, en 8 activos (E009).
- lideres(): líder top 3 por momentum de 252 días + mínimo de 10 días, 5 ATR, RR 2,1, 9 activos (E017/E018 config. 3),
  SIEMPRE antes de 2022: su validación 2022–2026 sigue sin tocar (entrada 28).
- ict5_oro(): setup 5 del prompt de Google en oro 15M (E025), con la configuración del reproductor.
- smc_oro(): mejor SMC en oro 4H–15M (E024), con la configuración del reproductor.
En SMC e ICT la entrada y la salida se reconstruyen del R (entrada = precio límite o apertura; salida = entrada +
dir·(R·riesgo + costo)), lo que alcanza para marcar a mercado operaciones del día.
"""
import importlib.util
import os
import sys

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from lab import datos, diario, estrategia, grilla, ict, senales as S, smc  # noqa: E402


def ms(f):
    return pd.Timestamp(f, tz="UTC").value // 10**6


def _modulo(nombre, archivo):
    if nombre in sys.modules:
        return sys.modules[nombre]
    spec = importlib.util.spec_from_file_location(nombre, os.path.join(RAIZ, "experimentos", archivo))
    m = importlib.util.module_from_spec(spec)
    sys.modules[nombre] = m
    spec.loader.exec_module(m)
    return m


CFG_E022 = ("XAUUSD", "D1", "bollinger_ruptura", "20/2", "evento", "sma200", "ambos", 0.5)
UNIV8 = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "XAUUSD", "XAGUSD"]
UNIV9 = UNIV8[:6] + ["HKXHKD"] + UNIV8[6:]
CORTE_LIDERES = ms("2022-01-01")


def _df(ops, instr):
    m = ops["motivo"] != 3
    return pd.DataFrame(dict(instr=instr, t=ops["t"][m], t_salida=ops["t_salida"][m], dir=ops["dir"][m], entrada=ops["entrada"][m],
                             salida=ops["salida"][m], sl=ops["sl"][m], motivo=ops["motivo"][m], r=ops["r"][m]))


def e022(desde="2011-11-15", hasta=None, costo_mult=1.0):
    m1 = datos.cargar("XAUUSD")
    o = grilla.operaciones_config(*CFG_E022, ms(desde), ms(hasta) if hasta else None, costo_mult=costo_mult, m1=m1)
    o["instr"] = "XAUUSD"
    return o[["instr", "t", "t_salida", "dir", "entrada", "salida", "sl", "motivo", "r"]].reset_index(drop=True)


def candidata_b(desde="2011-11-15", hasta=None):
    partes = []
    for instr in UNIV8:
        m1 = datos.cargar(instr)
        v = datos.velas(m1, 1440)
        sen = np.where(S.tendencia(v, 200) == 1, 1, 0)
        ops = estrategia.operaciones(instr, m1, v, sen, 6.0, rr=2.1, lados=(1,))
        if ops is not None:
            partes.append(_df(ops, instr))
    df = pd.concat(partes, ignore_index=True)
    df = df[df.t >= ms(desde)]
    if hasta:
        df = df[df.t < ms(hasta)]
    return df.sort_values("t").reset_index(drop=True)


def lideres(desde="2010-11-15", hasta="2022-01-01"):
    E18 = _modulo("e018", "E018_historia_larga.py")
    series = {i: diario.desde_histdata(i) for i in UNIV9}
    mom = E18.momentum_mensual(series)
    partes = []
    for i, s in series.items():
        ops = estrategia.operaciones(i, s, s, E18.senal("líder + mínimo 10d", i, s, mom, 3), 5.0, rr=2.1, lados=(1,))
        if ops is not None:
            partes.append(_df(ops, i))
    df = pd.concat(partes, ignore_index=True)
    fin = min(ms(hasta), CORTE_LIDERES)
    df = df[(df.t >= ms(desde)) & (df.t < fin) & (df.t_salida < fin)]
    return df.sort_values("t").reset_index(drop=True)


def _reconstruir(instr, m1, est, r, t_in, t_out, d, ent, sl, costo, filtro_t):
    ok = ((est == 1) | (est == -1) | (est == 2)) & (t_in >= 0)
    riesgo = (ent - sl) * d
    sal = ent + d * (r * riesgo + costo)
    motivo = np.where(est == 2, 2, est)
    df = pd.DataFrame(dict(instr=instr, t=m1["t"][t_in[ok]], t_salida=m1["t"][t_out[ok]], dir=d[ok], entrada=ent[ok], salida=sal[ok],
                           sl=sl[ok], motivo=motivo[ok], r=r[ok]))
    return df[filtro_t(df.t)].reset_index(drop=True)


def ict5_oro(desde="2021-11-15", hasta=None, realista=False, carga="2021-01-01"):
    E25 = _modulo("e025", "E025_ict_cinco_setups.py")
    E25.CARGA = ms(carga)
    E25.E23.T_INI = ms(desde)
    P = E25.preparar("XAUUSD", 15, 240)
    p = dict(sesgo="estructura", N=10, V=10, minfvg=0.25, ce=1, kz="NY")
    det = E25.detectar(P, 5, p)
    crea, vence, d, e, s, tp, costo = E25.ordenes("XAUUSD", P, det)
    orden = np.argsort(crea, kind="stable")
    crea, vence, d, e, s, tp, costo = (x[orden] for x in (crea, vence, d, e, s, tp, costo))
    m1 = P["m1"]
    est, r, t_in, t_out = ict.simular(m1["o"], m1["h"], m1["l"], m1["c"], P["dia_m1"], P["mdia_m1"], crea, vence, d, e, s, tp, costo,
                                      E25.MAX_DIA, E25.MAX_PERD, -1, realista)
    fin = ms(hasta) if hasta else 1 << 62
    return _reconstruir("XAUUSD", m1, est, r, t_in, t_out, d, e, s, costo, lambda t: (t >= ms(desde)) & (t < fin))


def smc_oro(desde="2021-11-15", hasta=None, realista=False, carga="2021-01-01"):
    E23 = _modulo("e023", "E023_smc_grilla.py")
    E23.CARGA = ms(carga)
    E23.T_INI = ms(desde)
    _, tf_mayor, tf_ej = [p for p in E23.PARES if p[0] == "4H-15M"][0]
    P = E23.preparar("XAUUSD", tf_mayor, tf_ej)
    v, m1 = P["v"], P["m1"]
    nb = len(v["t"])
    ph, pl = smc.pivotes(v["h"], v["l"], 5)
    ref_lo, ref_hi = np.concatenate([[np.nan], pl[:-1]]), np.concatenate([[np.nan], ph[:-1]])
    D, S_, M, EXT, OPU, F1, F2, OB = smc.detectar(v["o"], v["h"], v["l"], v["c"], ref_lo, ref_hi, ph, pl, 12, True)
    sel = (v["t"][M] >= E23.T_INI) & (M < nb - 1)
    st = dict(d=D[sel].astype(np.int64), m=M[sel], ext=EXT[sel], opu=OPU[sel], f1=F1[sel], f2=F2[sel], ob=OB[sel])
    crea, vence, d, ent, sl, tp, costo = E23.ordenes("XAUUSD", P, st, "mercado", "estructura", 12, "todas", True)
    est, r, t_in, t_out = smc.simular_ordenes(m1["o"], m1["h"], m1["l"], m1["c"], crea, vence, d, ent, sl, tp, costo, True, E23.RR,
                                              realista)
    ent_real = np.where(t_in >= 0, m1["o"][np.clip(t_in, 0, None)], ent)  # a mercado: la apertura del minuto de entrada
    fin = ms(hasta) if hasta else 1 << 62
    return _reconstruir("XAUUSD", m1, est, r, t_in, t_out, d, ent_real, sl, costo, lambda t: (t >= ms(desde)) & (t < fin))
