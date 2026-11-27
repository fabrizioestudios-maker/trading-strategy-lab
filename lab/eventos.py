"""
Estudio de eventos con placebo: ¿un barrido de liquidez agrega información? (fase 4, E035b)

Para cada día (vela diaria de 17:00 a 17:00 NY) y cada nivel:
  PD = máximo/mínimo del día anterior; PW = de la semana anterior; ASIA = rango 20:00–00:00 NY del día;
  LONDRES = rango 02:00–05:00 NY del día.
Ventana de eventos (velas M5 que empiezan): 02:00–12:00 NY (LONDRES: 05:00–12:00).
Evento = la primera vela M5 de la ventana que pasa el nivel (máximo > nivel alto, o mínimo < nivel bajo).
Clasificación con esa vela y las 5 siguientes (6 velas):
  "barrido"     = una vela cierra de vuelta del lado de adentro antes de dos cierres seguidos afuera → se opera la reversión;
  "aceptacion"  = dos cierres seguidos afuera antes de volver → se opera la continuación.
Operación: entrada en la apertura del minuto siguiente al cierre de la vela que clasifica; SL = 0,25·ATR(14) diario
del día anterior; TP = 2·SL; cierre a las 16:00 NY. Mismo motor de M1: SL primero, huecos en la apertura.
Placebo: 20 velas M5 al azar del mismo día con inicio a ± 60 minutos de la vela que clasifica (sin ella), entre las
02:00 y las 15:00 NY, misma dirección, mismo SL/TP y mismo cierre. Cada evento y cada placebo es independiente
(no se aplica "una operación a la vez": se mide información, no una estrategia).
"""
import numpy as np
import pandas as pd
from numba import njit

from lab import datos

NIVELES = ("PD", "PW", "ASIA", "LONDRES")


@njit(cache=True)
def simular_hasta(o, h, l, c, ie, d, sl, tp, costo, fin):
    """Operaciones independientes con cierre forzado en el minuto `fin` (al cierre). Devuelve R y motivo."""
    n = len(ie)
    r = np.full(n, np.nan)
    mot = np.zeros(n, np.int8)
    N = len(o)
    for k in range(n):
        i = ie[k]
        if i < 0 or i >= N or fin[k] < i:
            continue
        ent = o[i]
        dd = d[k]
        riesgo = (ent - sl[k]) * dd
        if riesgo <= 0 or (tp[k] - ent) * dd <= 0:
            continue
        px = np.nan
        res = 0
        j = i
        while j <= fin[k]:
            if dd == 1:
                if j > i and o[j] <= sl[k]:
                    res = -1
                    px = o[j]
                    break
                if l[j] <= sl[k]:
                    res = -1
                    px = sl[k]
                    break
                if h[j] >= tp[k]:
                    res = 1
                    px = tp[k]
                    break
            else:
                if j > i and o[j] >= sl[k]:
                    res = -1
                    px = o[j]
                    break
                if h[j] >= sl[k]:
                    res = -1
                    px = sl[k]
                    break
                if l[j] <= tp[k]:
                    res = 1
                    px = tp[k]
                    break
            j += 1
        if res == 0:
            px = c[fin[k]]
            res = 2
        r[k] = ((px - ent) * dd - costo[k]) / riesgo
        mot[k] = res
    return r, mot


def minuto_ny(t_ms):
    ny = pd.to_datetime(np.asarray(t_ms, np.int64), unit="ms", utc=True).tz_convert("America/New_York")
    return np.asarray(ny.hour * 60 + ny.minute)


def preparar(m1):
    d1 = datos.velas(m1, 1440)
    m5 = datos.velas(m1, 5)
    atr = datos.atr(d1, 14)
    dia_m1 = np.searchsorted(d1["t"], m1["t"], side="right") - 1
    dia_m5 = np.searchsorted(d1["t"], m5["t"], side="right") - 1
    mny1 = minuto_ny(m1["t"])
    mny5 = minuto_ny(m5["t"])
    # semana de operación: la del día de cierre (fecha NY de la vela diaria + 7 h)
    ny = pd.to_datetime(d1["t"], unit="ms", utc=True).tz_convert("America/New_York")
    fecha = (ny + pd.Timedelta(hours=7)).tz_localize(None).normalize()
    semana = (fecha - pd.to_timedelta(fecha.weekday, unit="D")).values
    sem_df = pd.DataFrame(dict(sem=semana, h=d1["h"], l=d1["l"]))
    agg = sem_df.groupby("sem").agg(h=("h", "max"), l=("l", "min"))
    prev = agg.shift(1)
    pwh = prev.h.reindex(semana).values
    pwl = prev.l.reindex(semana).values
    nd = len(d1["t"])
    # rangos de Asia (20:00–24:00) y Londres (02:00–05:00) de cada día con el M1
    def rango(mask):
        hi = np.full(nd, np.nan)
        lo = np.full(nd, np.nan)
        dm = dia_m1[mask]
        if len(dm):
            s = pd.DataFrame(dict(d=dm, h=m1["h"][mask], l=m1["l"][mask])).groupby("d").agg(h=("h", "max"), l=("l", "min"))
            hi[s.index.values] = s.h.values
            lo[s.index.values] = s.l.values
        return hi, lo
    asia_h, asia_l = rango((mny1 >= 1200) & (mny1 < 1440))
    lon_h, lon_l = rango((mny1 >= 120) & (mny1 < 300))
    pdh = np.concatenate([[np.nan], d1["h"][:-1]])
    pdl = np.concatenate([[np.nan], d1["l"][:-1]])
    atr_prev = np.concatenate([[np.nan], atr[:-1]])
    # último minuto antes de las 16:00 NY de cada día
    fin_dia = np.full(nd, -1, np.int64)
    sel = np.flatnonzero((mny1 < 960) & (mny1 >= 0))
    s = pd.Series(sel, index=dia_m1[sel])
    ult = s.groupby(level=0).max()
    fin_dia[ult.index.values] = ult.values
    niveles = {"PD": (pdh, pdl), "PW": (pwh, pwl), "ASIA": (asia_h, asia_l), "LONDRES": (lon_h, lon_l)}
    return dict(d1=d1, m5=m5, dia_m5=dia_m5, mny5=mny5, niveles=niveles, atr_prev=atr_prev, fin_dia=fin_dia)


def detectar(P, nivel, desde_dia=0):
    """Eventos de un tipo de nivel. Devuelve DataFrame (dia, lado, tipo, barra M5 que clasifica, dir)."""
    m5, dia5, mny5 = P["m5"], P["dia_m5"], P["mny5"]
    alto, bajo = P["niveles"][nivel]
    ini = 300 if nivel == "LONDRES" else 120
    en_ventana = (mny5 >= ini) & (mny5 < 720)
    filas = []
    idx_v = np.flatnonzero(en_ventana & (dia5 >= desde_dia))
    df = pd.DataFrame(dict(b=idx_v, d=dia5[idx_v]))
    for d, g in df.groupby("d"):
        barras = g.b.values
        for lado, H in (("alto", alto[d]), ("bajo", bajo[d])):
            if not np.isfinite(H):
                continue
            if lado == "alto":
                cruza = barras[m5["h"][barras] > H]
            else:
                cruza = barras[m5["l"][barras] < H]
            if not len(cruza):
                continue
            j = int(cruza[0])
            seguidas = 0
            tipo, bc = None, -1
            for b in range(j, min(j + 6, len(m5["c"]))):
                if dia5[b] != d:
                    break
                afuera = m5["c"][b] > H if lado == "alto" else m5["c"][b] < H
                if afuera:
                    seguidas += 1
                    if seguidas >= 2:
                        tipo, bc = "aceptacion", b
                        break
                else:
                    tipo, bc = "barrido", b
                    break
            if tipo is None:
                continue
            arriba = lado == "alto"
            direc = (-1 if arriba else 1) if tipo == "barrido" else (1 if arriba else -1)
            filas.append(dict(dia=d, nivel=nivel, lado=lado, tipo=tipo, barra=bc, dir=direc))
    return pd.DataFrame(filas)


def evaluar(P, m1, ev, instr="XAUUSD", n_placebo=20, semilla=0):
    """Agrega r del evento y r medio de sus placebos."""
    if not len(ev):
        return ev
    rng = np.random.default_rng(semilla)
    m5, dia5, mny5 = P["m5"], P["dia_m5"], P["mny5"]
    ev = ev.copy()
    ev = ev[np.isfinite(P["atr_prev"][ev.dia.values]) & (P["fin_dia"][ev.dia.values] >= 0)].reset_index(drop=True)
    ie = m5["i1"][ev.barra.values] + 1
    ent = m1["o"][np.clip(ie, 0, len(m1["o"]) - 1)]
    dist = 0.25 * P["atr_prev"][ev.dia.values]
    d = ev.dir.values.astype(np.int64)
    fin = P["fin_dia"][ev.dia.values]
    costo = np.asarray(datos.costo(instr, ent), float)
    r, mot = simular_hasta(m1["o"], m1["h"], m1["l"], m1["c"], ie.astype(np.int64), d, ent - d * dist, ent + 2 * d * dist,
                           costo, fin.astype(np.int64))
    ev["t"] = m1["t"][np.clip(ie, 0, len(m1["t"]) - 1)]
    ev["r"] = r
    ev["motivo"] = mot
    # placebos
    pl_ie, pl_k = [], []
    t5 = m5["t"]
    for k, (b, dia) in enumerate(zip(ev.barra.values, ev.dia.values)):
        cand = np.flatnonzero((dia5 == dia) & (np.abs(t5 - t5[b]) <= 3600000) & (mny5 >= 120) & (mny5 < 900))
        cand = cand[cand != b]
        if not len(cand):
            continue
        pick = rng.choice(cand, size=n_placebo, replace=len(cand) < n_placebo)
        pl_ie.append(m5["i1"][pick] + 1)
        pl_k.append(np.full(len(pick), k))
    if pl_ie:
        pie = np.concatenate(pl_ie).astype(np.int64)
        pk = np.concatenate(pl_k)
        pent = m1["o"][np.clip(pie, 0, len(m1["o"]) - 1)]
        pd_ = d[pk]
        pdist = dist[pk]
        pr, _ = simular_hasta(m1["o"], m1["h"], m1["l"], m1["c"], pie, pd_, pent - pd_ * pdist, pent + 2 * pd_ * pdist,
                              np.asarray(datos.costo(instr, pent), float), fin[pk].astype(np.int64))
        s = pd.DataFrame(dict(k=pk, r=pr)).dropna().groupby("k").r.agg(["mean", "size"])
        ev["placebo_r"] = s["mean"].reindex(range(len(ev))).values
        ev["n_placebo"] = s["size"].reindex(range(len(ev))).fillna(0).values
    else:
        ev["placebo_r"] = np.nan
        ev["n_placebo"] = 0
    ev["delta"] = ev.r - ev.placebo_r
    return ev


def bootstrap_dias(ev, B=5000, semilla=0):
    """Δ medio (evento − placebo), IC 95 % y p de una cola (H0: Δ ≤ 0) remuestreando días."""
    x = ev.dropna(subset=["delta"])
    if len(x) < 10:
        return dict(n=len(x), delta=np.nan, lo=np.nan, hi=np.nan, p=np.nan, exp_evento=np.nan, exp_placebo=np.nan)
    g = x.groupby("dia").delta.agg(["sum", "size"])
    s, c = g["sum"].values, g["size"].values
    rng = np.random.default_rng(semilla)
    idx = rng.integers(0, len(g), size=(B, len(g)))
    boot = s[idx].sum(axis=1) / c[idx].sum(axis=1)
    obs = s.sum() / c.sum()
    return dict(n=len(x), delta=float(obs), lo=float(np.quantile(boot, 0.025)), hi=float(np.quantile(boot, 0.975)),
                p=float(np.mean(boot - obs >= obs)), exp_evento=float(x.r.mean()), exp_placebo=float(x.placebo_r.mean()),
                wr_evento=float((x.r > 0).mean()))
