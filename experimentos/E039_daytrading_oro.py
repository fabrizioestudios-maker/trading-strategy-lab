"""
E039 — Daytrading del oro a favor del sesgo diario (BITACORA, entrada 32) y E040 — deriva por hora del día.

Uso:
  python experimentos/E039_daytrading_oro.py e039
  python experimentos/E039_daytrading_oro.py e040

E039: sesgo del día t con la vela diaria t−1 (S1: señal de E022 en las últimas 5 velas; S2: tendencia de 200 y 20 días);
gatillo en M15 entre las 02:00 y las 12:00 NY (T1: el cierre vuelve a cruzar la EMA 20 a favor; T2: primer cierre fuera
del rango de Asia 20:00–00:00 a favor); una operación por día; entrada en el minuto siguiente; SL 1·ATR(14) de M15;
TP 2·SL; cierre a las 16:00 NY. Costos: perfil base de lab/ejecucion.py (y conservador, y docs/costos.md).
E040: entrar al inicio y salir al final de cada bloque de 4 h del día de operación (NY), todos los días, en las dos
direcciones; resultado en % del precio neto de costos.
Desarrollo 15/11/2010–14/11/2021; confirmación (últimos 5 años) 15/11/2021–13/11/2026.
"""
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, ejecucion as EJ, eventos as EV, multiples as MT, registro, senales as S  # noqa: E402

SAL = "resultados/E039"
INI, FIN_DEV, FIN = (pd.Timestamp(x, tz="UTC").value // 10**6 for x in ("2010-11-15", "2021-11-15", "2026-11-14"))
ANIOS_CONF = [(pd.Timestamp(f"{y}-11-15", tz="UTC").value // 10**6, pd.Timestamp(f"{y + 1}-11-15", tz="UTC").value // 10**6) for y in range(2021, 2026)]


def bollinger_ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    return np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))


def sesgos(d1):
    c = d1["c"]
    s22 = bollinger_ruptura(c)
    s22 = np.where(s22 == S.sobre_sma(d1, 200), s22, 0)
    n = len(c)
    s1 = np.zeros(n, np.int8)
    ult, cuando = 0, -999
    for k in range(n):  # sesgo del día k con la información hasta la vela k-1
        if k >= 1 and s22[k - 1] != 0:
            ult, cuando = s22[k - 1], k - 1
        s1[k] = ult if k - 1 - cuando < 5 and cuando >= 0 else 0
    sma = S.sma(c, 200)
    prev = np.concatenate([[np.nan], c[:-1]])
    prev_sma = np.concatenate([[np.nan], sma[:-1]])
    prev21 = np.concatenate([np.full(21, np.nan), c[:-21]])
    s2 = np.where((prev > prev_sma) & (prev > prev21), 1, np.where((prev < prev_sma) & (prev < prev21), -1, 0)).astype(np.int8)
    return {"S1": s1, "S2": s2}


def e039():
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    P = EV.preparar(m1)
    d1, m15 = P["d1"], datos.velas(m1, 15)
    dia15 = np.searchsorted(d1["t"], m15["t"], side="right") - 1
    mny15 = EV.minuto_ny(m15["t"])
    ema = S.ema(m15["c"], 20)
    atr15 = datos.atr(m15, 14)
    asia_h, asia_l = P["niveles"]["ASIA"]
    SG = sesgos(d1)
    ventana = (mny15 >= 120) & (mny15 < 720) & (m15["t"] >= INI) & (m15["t"] < FIN)
    prev_c = np.concatenate([[np.nan], m15["c"][:-1]])
    prev_e = np.concatenate([[np.nan], ema[:-1]])
    vol = EJ.Volatilidad(m1)
    filas, todas = [], {}
    for sn, sg in SG.items():
        d = sg[np.clip(dia15, 0, None)]
        for tn in ("T1", "T2"):
            if tn == "T1":
                gat = np.where((d == 1) & (m15["c"] > ema) & (prev_c <= prev_e), 1, np.where((d == -1) & (m15["c"] < ema) & (prev_c >= prev_e), -1, 0))
            else:
                ah, al = asia_h[np.clip(dia15, 0, None)], asia_l[np.clip(dia15, 0, None)]
                gat = np.where((d == 1) & (m15["c"] > ah), 1, np.where((d == -1) & (m15["c"] < al), -1, 0))
            cand = np.flatnonzero(ventana & (gat != 0) & np.isfinite(atr15))
            # una operación por día: la primera vela que dispara
            _, primeras = np.unique(dia15[cand], return_index=True)
            sel = cand[primeras]
            ie = m15["i1"][sel] + 1
            dd = gat[sel].astype(np.int64)
            ent = m1["o"][ie]
            dist = 1.0 * atr15[sel]
            fin = P["fin_dia"][dia15[sel]]
            ok = fin >= ie
            sel, ie, dd, ent, dist, fin = sel[ok], ie[ok], dd[ok], ent[ok], dist[ok], fin[ok]
            sl, tp = ent - dd * dist, ent + dd * 2 * dist
            r, mot, js = EV.simular_hasta_salida(m1["o"], m1["h"], m1["l"], m1["c"], ie.astype(np.int64), dd, sl, tp,
                                                 np.asarray(datos.costo("XAUUSD", ent), float), fin.astype(np.int64))
            # salida: reconstruida del R (para aplicar los perfiles de ejecución)
            riesgo = (ent - sl) * dd
            costo0 = np.asarray(datos.costo("XAUUSD", ent), float)
            sal = ent + dd * (r * riesgo + costo0)
            ts = m1["t"][np.clip(js, 0, None)]
            ops = pd.DataFrame(dict(t=m1["t"][ie], t_salida=ts, dir=dd, entrada=ent, salida=sal, sl=sl, motivo=mot, r=r)).dropna()
            base = EJ.aplicar(ops, "XAUUSD", vol, "base")
            cons = EJ.aplicar(ops, "XAUUSD", vol, "conservador")
            nombre = f"{sn}{tn}"
            todas[nombre] = base.assign(r_costosmd=ops.r.values, r_cons=cons.r.values)
            for muestra, (a, b) in (("desarrollo", (INI, FIN_DEV)), ("confirmacion", (FIN_DEV, FIN))):
                x = base[(base.t >= a) & (base.t < b)]
                xc = cons[(cons.t >= a) & (cons.t < b)]
                rr = x.r.values
                t = rr.mean() / (rr.std(ddof=1) / np.sqrt(len(rr))) if len(rr) > 2 else np.nan
                f = dict(variante=nombre, muestra=muestra, n=len(rr), wr=float((rr > 0).mean()) if len(rr) else np.nan,
                         exp_base=float(rr.mean()) if len(rr) else np.nan, p=float(stats.t.sf(t, len(rr) - 1)) if len(rr) > 2 else np.nan,
                         exp_costosmd=float(ops[(ops.t >= a) & (ops.t < b)].r.mean()), exp_conservador=float(xc.r.mean()),
                         payoff=float(rr[rr > 0].mean() / -rr[rr <= 0].mean()) if (rr > 0).any() and (rr <= 0).any() else np.nan)
                if muestra == "confirmacion":
                    anios = [x[(x.t >= ya) & (x.t < yb)].r.sum() for ya, yb in ANIOS_CONF]
                    f["anios_positivos"] = int(sum(v > 0 for v in anios))
                    f["r_por_anio"] = " / ".join(f"{v:+.1f}" for v in anios)
                filas.append(f)
            print(nombre, [(f["muestra"], f["n"], round(f["wr"], 3), round(f["exp_base"], 3), round(f["p"], 4)) for f in filas[-2:]], flush=True)
    t = pd.DataFrame(filas)
    dev = t[t.muestra == "desarrollo"].copy()
    dev["holm"] = MT.holm(dev.p.values, 0.05)
    conf = t[t.muestra == "confirmacion"].set_index("variante")
    dev["pasa"] = [bool(h and conf.loc[v, "exp_base"] > 0 and conf.loc[v, "p"] < 0.10 and conf.loc[v, "anios_positivos"] >= 4
                        and conf.loc[v, "n"] >= 100 and conf.loc[v, "exp_conservador"] > 0) for v, h in zip(dev.variante, dev.holm)]
    t = t.merge(dev[["variante", "holm", "pasa"]], on="variante", how="left")
    t.to_csv(f"{SAL}/e039_resumen.csv", index=False)
    for n, o in todas.items():
        o.to_csv(f"{SAL}/e039_operaciones_{n}.csv.gz", index=False)
    print(t.round(4).to_string(index=False))
    registro.registrar("E039", __file__, hipotesis="Daytrading del oro a favor del sesgo diario", universo="XAUUSD M1/M15",
                       n_variantes=4, resultados=t)


def e040():
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    d1 = datos.velas(m1, 1440)
    dia = np.searchsorted(d1["t"], m1["t"], side="right") - 1
    tm = ((EV.minuto_ny(m1["t"]) - 1020) % 1440).astype(np.int64)  # minutos desde las 17:00 NY
    bloques = [("18–22", 60, 300), ("22–02", 300, 540), ("02–06", 540, 780), ("06–10", 780, 1020), ("10–14", 1020, 1260), ("14–17", 1260, 1440)]
    df = pd.DataFrame(dict(dia=dia, tm=tm, i=np.arange(len(dia))))
    df = df[(m1["t"] >= INI) & (m1["t"] < FIN)]
    filas, series = [], {}
    for nombre, a, b in bloques:
        x = df[(df.tm >= a) & (df.tm < b)]
        g = x.groupby("dia").i.agg(["min", "max", "size"])
        g = g[g["size"] >= 120]  # el bloque tuvo al menos 2 h de datos ese día
        ent = m1["o"][g["min"].values]
        sal = m1["c"][g["max"].values]
        costo = np.asarray(datos.costo("XAUUSD", ent), float) / ent
        t_ent = m1["t"][g["min"].values]
        for d in (1, -1):
            ret = d * (sal / ent - 1) - costo
            s = pd.Series(ret, index=t_ent)
            series[f"{nombre} {'compra' if d == 1 else 'venta'}"] = s
            for muestra, (a2, b2) in (("desarrollo", (INI, FIN_DEV)), ("confirmacion", (FIN_DEV, FIN))):
                v = s[(s.index >= a2) & (s.index < b2)].values
                t = v.mean() / (v.std(ddof=1) / np.sqrt(len(v)))
                f = dict(bloque=nombre, dir="compra" if d == 1 else "venta", muestra=muestra, n=len(v), ret_medio_pct=100 * v.mean(),
                         wr=float((v > 0).mean()), p=float(stats.t.sf(t, len(v) - 1)))
                if muestra == "confirmacion":
                    anios = [s[(s.index >= ya) & (s.index < yb)].sum() for ya, yb in ANIOS_CONF]
                    f["anios_positivos"] = int(sum(u > 0 for u in anios))
                filas.append(f)
    t = pd.DataFrame(filas)
    dev = t[t.muestra == "desarrollo"].copy()
    dev["holm"] = MT.holm(dev.p.values, 0.05)
    conf = t[t.muestra == "confirmacion"].set_index(["bloque", "dir"])
    dev["pasa"] = [bool(h and conf.loc[(bq, dr), "ret_medio_pct"] > 0 and conf.loc[(bq, dr), "p"] < 0.10 and conf.loc[(bq, dr), "anios_positivos"] >= 4)
                   for bq, dr, h in zip(dev.bloque, dev.dir, dev.holm)]
    t = t.merge(dev[["bloque", "dir", "holm", "pasa"]], on=["bloque", "dir"], how="left")
    t.to_csv(f"{SAL}/e040_resumen.csv", index=False)
    print(t.round(4).to_string(index=False))
    registro.registrar("E040", __file__, hipotesis="Deriva del oro por hora del día", universo="XAUUSD M1", n_variantes=12, resultados=t)


if __name__ == "__main__":
    {"e039": e039, "e040": e040}[sys.argv[1]]()
