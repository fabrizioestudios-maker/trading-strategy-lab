"""
E044 — E022 con salida por tiempo (informativo; BITACORA, entrada 36).
E022 (ruptura de Bollinger D1 a favor de la SMA 200 diaria) con entrada a las 18:15 NY (E042) y SL 0,5·ATR(14) diario.
Sin TP: salida a las 16:55 NY después de 1, 2 o 5 días de operación. Se compara con el TP fijo (2·SL) de la misma entrada.
Operaciones independientes (las señales de E022 casi nunca se superponen). Costos base (principal), costos.md y conservador.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, ejecucion as EJ, eventos as EV, multiples as MU, registro, senales as S  # noqa: E402

SAL = "resultados/E044"
DEV = ("2010-11-15", "2021-11-15")
CONF = ("2021-11-15", "2026-11-14")
ms = lambda x: pd.Timestamp(x, tz="UTC").value // 10**6  # noqa: E731


def ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    return np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    o, h, l, c, t = m1["o"], m1["h"], m1["l"], m1["c"], m1["t"]
    tm = (EV.minuto_ny(t) - 1020) % 1440
    vol = EJ.Volatilidad(m1)
    v = datos.velas(m1, 1440)
    atr = datos.atr(v, 14)
    s = ruptura(v["c"])
    s = np.where(s == S.sobre_sma(v, 200), s, 0)
    nb = len(v["t"])
    sel = np.flatnonzero((s != 0) & ~np.isnan(atr) & (v["t"] >= ms(DEV[0])) & (v["t"] < ms(CONF[1])) & (np.arange(nb) < nb - 6))
    ie = []
    for k in sel:  # primer minuto desde las 18:15 NY después del cierre de la vela diaria k
        i = v["i1"][k] + 1
        vent = tm[i:i + 2000] >= 75
        ie.append(i + int(np.argmax(vent)) if vent.any() else i)
    ie = np.array(ie, np.int64)
    d = s[sel].astype(np.int64)
    ent = o[ie]
    riesgo = 0.5 * atr[sel]
    sl = ent - d * riesgo
    costo = datos.costo("XAUUSD", ent)
    jd = np.searchsorted(v["i0"], ie, side="right") - 1  # vela diaria que contiene la entrada
    filas = []
    for nombre, dias, tp in (("TP fijo 2·SL", None, ent + d * 2 * riesgo), ("1 día", 1, None), ("2 días", 2, None), ("5 días", 5, None)):
        if dias is None:
            fin = np.full(len(ie), len(o) - 1, np.int64)
        else:
            jf = np.clip(jd + dias - 1, 0, nb - 1)
            objetivo = t[v["i1"][jf]] - 4 * 60000  # 16:55 NY (la vela diaria termina a las 16:59)
            fin = np.searchsorted(t, objetivo, side="right") - 1
            tp = ent + d * 1e6
        r, mot, js = EV.simular_hasta_salida(o, h, l, c, ie, d, sl, tp, costo, fin)
        ok = ~np.isnan(r) & (js >= 0)
        salida = ent + d * (r * riesgo + costo)  # precio de salida reconstruido desde R
        ops = pd.DataFrame(dict(t=t[ie][ok], t_salida=t[np.clip(js, 0, None)][ok], dir=d[ok], entrada=ent[ok], salida=salida[ok],
                                sl=sl[ok], motivo=mot[ok], r=r[ok]))
        base, cons = EJ.aplicar(ops, "XAUUSD", vol, "base"), EJ.aplicar(ops, "XAUUSD", vol, "conservador")
        f = dict(salida=nombre)
        for mu, (a, b) in (("dev", DEV), ("conf", CONF)):
            m = (ops.t >= ms(a)) & (ops.t < ms(b))
            rb = base.r[m].values
            f.update({f"{mu}_n": int(m.sum()), f"{mu}_wr": float((rb > 0).mean()), f"{mu}_exp_base": float(rb.mean()),
                      f"{mu}_p_base": float(MU.p_media_positiva(rb.mean(), rb.std(ddof=1), len(rb))),
                      f"{mu}_exp_costosmd": float(ops.r[m].mean()), f"{mu}_exp_cons": float(cons.r[m].mean()),
                      f"{mu}_horas": float(((ops.t_salida - ops.t)[m] / 3.6e6).mean())})
        filas.append(f)
        print({k: (round(x, 4) if isinstance(x, float) else x) for k, x in f.items()}, flush=True)
    tabla = pd.DataFrame(filas)
    ref = tabla.iloc[0]
    tabla["mejor_que_tp_en_ambas"] = (tabla.dev_exp_base > ref.dev_exp_base) & (tabla.conf_exp_base > ref.conf_exp_base)
    tabla.to_csv(f"{SAL}/resumen.csv", index=False)
    print(tabla[["salida", "dev_n", "dev_exp_base", "dev_p_base", "conf_n", "conf_exp_base", "conf_p_base", "conf_exp_cons", "conf_horas",
                 "mejor_que_tp_en_ambas"]].to_string())
    registro.registrar("E044", __file__, hipotesis="E022 con salida por tiempo (informativo)", universo="XAUUSD", resultados=tabla)
