"""
E043 — La regla de E022 (ruptura de Bollinger a favor de la tendencia) en H4 y H1 (BITACORA, entrada 36).

Variantes (sin grilla): H4·FD, H4·FX y H1·FD.
  FD = último cierre diario completo (velas de 17:00 NY) contra la SMA 200 diaria; FX = cierre de la vela contra la SMA 200 de X.
Entrada: minuto siguiente al cierre de la vela; si cae entre 17:00 y 18:15 NY, primer minuto desde las 18:15 NY.
SL 0,5·ATR(14) de X, TP 2·SL desde la entrada real, una operación a la vez, sin cierre por tiempo.
Desarrollo 15/11/2010–14/11/2021; confirmación (últimos 5 años) 15/11/2021–13/11/2026. Costos base (principal), costos.md y
conservador. Si una variante pasa: meseta (Bollinger 1,8/2,2; SL 0,4/0,6·ATR) y placebo de 200 juegos de entradas al azar.

Uso: python3 experimentos/E043_e022_intradia.py
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, ejecucion as EJ, eventos as EV, motor, multiples as MU, registro, senales as S  # noqa: E402

SAL = "resultados/E043"
DEV = ("2010-11-15", "2021-11-15")
CONF = ("2021-11-15", "2026-11-14")
ms = lambda x: pd.Timestamp(x, tz="UTC").value // 10**6  # noqa: E731


def ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    return np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))


class Contexto:
    def __init__(self):
        self.m1 = datos.cargar("XAUUSD")
        self.tm = (EV.minuto_ny(self.m1["t"]) - 1020) % 1440  # minutos desde las 17:00 NY
        self.vol = EJ.Volatilidad(self.m1)
        vd = datos.velas(self.m1, 1440)
        sma_d = S.sma(vd["c"], 200)
        self.vd, self.tend_d = vd, np.where(np.isnan(sma_d), 0, np.sign(vd["c"] - sma_d)).astype(int)
        self.v = {tf: datos.velas(self.m1, tf) for tf in (240, 60)}
        self.atr = {tf: datos.atr(v, 14) for tf, v in self.v.items()}

    def entrada(self, i1):
        """Minuto de entrada tras el cierre (índice M1 i1): el siguiente; si cae antes de las 18:15 NY tras la reapertura, se retrasa."""
        ie = np.asarray(i1, np.int64) + 1
        ie = ie[ie < len(self.m1["t"])]
        malo = self.tm[ie] < 75
        for j in np.flatnonzero(malo):
            k = ie[j]
            vent = self.tm[k:k + 2000] >= 75
            ie[j] = k + int(np.argmax(vent)) if vent.any() else k
        return ie

    def tendencia_diaria(self, i1):
        """Tendencia del último cierre diario completo al momento del cierre de la vela (sin mirar adelante)."""
        j = np.searchsorted(self.vd["i1"], i1, side="right") - 1
        return np.where(j >= 0, self.tend_d[np.clip(j, 0, None)], 0)


def senales(C, tf, filtro, k_bb=2.0):
    v = C.v[tf]
    s = ruptura(v["c"], 20, k_bb)
    if filtro == "FD":
        t = C.tendencia_diaria(v["i1"])
    else:
        t = S.sobre_sma(v, 200)
    s = np.where((s == t) & (t != 0), s, 0)
    ok = (s != 0) & ~np.isnan(C.atr[tf]) & (np.arange(len(s)) < len(s) - 1)
    return np.flatnonzero(ok), s


def simular(C, tf, idx, d, k_sl=0.5):
    v = C.v[tf]
    ie = C.entrada(v["i1"][idx])
    idx, d = idx[:len(ie)], d[:len(ie)]
    m1 = C.m1
    ent = m1["o"][ie]
    riesgo = k_sl * C.atr[tf][idx]
    o = motor.simular(m1, ie, d.astype(np.int64), ent - d * riesgo, ent + d * 2 * riesgo, datos.costo("XAUUSD", ent))
    m = o["motivo"] != 3
    return pd.DataFrame({k: o[k][m] for k in ("t", "t_salida", "dir", "entrada", "salida", "sl", "motivo", "r")})


def evaluar(C, ops):
    """Resumen por muestra y perfil de costos. ops.r ya trae los costos de docs/costos.md."""
    base, cons = EJ.aplicar(ops, "XAUUSD", C.vol, "base"), EJ.aplicar(ops, "XAUUSD", C.vol, "conservador")
    out = {}
    for nom, (a, b) in (("dev", DEV), ("conf", CONF)):
        m = (ops.t >= ms(a)) & (ops.t < ms(b))
        rb, rc, rm = base.r[m].values, cons.r[m].values, ops.r[m].values
        n = len(rb)
        out[nom] = dict(n=n, wr=float((rb > 0).mean()) if n else np.nan, exp_base=float(rb.mean()) if n else np.nan,
                        p_base=float(MU.p_media_positiva(rb.mean(), rb.std(ddof=1), n)) if n > 2 else np.nan,
                        exp_costosmd=float(rm.mean()) if n else np.nan, exp_cons=float(rc.mean()) if n else np.nan,
                        compras=float(rb[ops.dir[m].values == 1].mean()) if (ops.dir[m] == 1).any() else np.nan,
                        ventas=float(rb[ops.dir[m].values == -1].mean()) if (ops.dir[m] == -1).any() else np.nan)
    # años de laboratorio de la confirmación (15/11 a 14/11)
    m = (ops.t >= ms(CONF[0])) & (ops.t < ms(CONF[1]))
    t = pd.DatetimeIndex(pd.to_datetime(ops.t[m].values, unit="ms", utc=True))
    anio_lab = np.where((t.month > 11) | ((t.month == 11) & (t.day >= 15)), t.year, t.year - 1)
    por_anio = pd.Series(base.r[m].values).groupby(anio_lab).agg(["mean", "size"])
    out["conf"]["anios"] = {int(a): (round(float(x["mean"]), 3), int(x["size"])) for a, x in por_anio.iterrows()}
    out["conf"]["anios_pos"] = int((por_anio["mean"] > 0).sum())
    out["conf"]["anios_n"] = int(len(por_anio))
    return out, base


def placebo(C, tf, filtro, n_ops, muestra, B=200, semilla=0):
    """Entradas al azar en cierres de velas de tf de la muestra, en la dirección del filtro; mismas reglas de SL/TP."""
    v = C.v[tf]
    t = C.tendencia_diaria(v["i1"]) if filtro == "FD" else S.sobre_sma(v, 200)
    a, b = (ms(x) for x in muestra)
    cand = np.flatnonzero((t != 0) & ~np.isnan(C.atr[tf]) & (v["t"] >= a) & (v["t"] < b) & (np.arange(len(t)) < len(t) - 1))
    rng = np.random.default_rng(semilla)
    res = []
    for _ in range(B):
        idx = np.sort(rng.choice(cand, size=min(len(cand), n_ops), replace=False))
        ops = simular(C, tf, idx, t[idx])
        ops = EJ.aplicar(ops, "XAUUSD", C.vol, "base")
        res.append(float(ops.r.mean()))
    return np.array(res)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    C = Contexto()
    filas, detalle = [], {}
    for tf, filtro in ((240, "FD"), (240, "FX"), (60, "FD")):
        nombre = f"{'H4' if tf == 240 else 'H1'}·{filtro}"
        idx, s = senales(C, tf, filtro)
        ops = simular(C, tf, idx, s[idx])
        res, base = evaluar(C, ops)
        base.to_csv(f"{SAL}/ops_{nombre.replace('·', '_')}.csv", index=False)
        detalle[nombre] = res
        f = dict(variante=nombre, **{f"dev_{k}": x for k, x in res["dev"].items()},
                 **{f"conf_{k}": x for k, x in res["conf"].items() if k != "anios"}, conf_anios=str(res["conf"]["anios"]))
        filas.append(f)
        print(nombre, {m: {k: (round(x, 4) if isinstance(x, float) else x) for k, x in r.items()} for m, r in res.items()}, flush=True)
    t = pd.DataFrame(filas)
    t["holm_dev"] = MU.holm(t.dev_p_base.values, 0.05)
    t["pasa"] = (t.holm_dev & (t.dev_exp_base > 0) & (t.conf_exp_base > 0) & (t.conf_p_base < 0.10) & (t.conf_anios_pos >= 4)
                 & (t.conf_n >= 100) & (t.dev_exp_cons > 0) & (t.conf_exp_cons > 0))
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    print(t[["variante", "dev_n", "dev_exp_base", "dev_p_base", "holm_dev", "conf_n", "conf_exp_base", "conf_p_base", "conf_anios_pos",
             "dev_exp_cons", "conf_exp_cons", "pasa"]].to_string(), flush=True)
    extra = {}
    for _, f in t[t.pasa].iterrows():
        tf, filtro = (240 if f.variante.startswith("H4") else 60), f.variante.split("·")[1]
        mes = {}
        for kb, ks in ((1.8, 0.5), (2.2, 0.5), (2.0, 0.4), (2.0, 0.6)):
            idx, s = senales(C, tf, filtro, kb)
            r, _ = evaluar(C, simular(C, tf, idx, s[idx], ks))
            mes[f"bb{kb}_sl{ks}"] = (round(r["dev"]["exp_base"], 4), round(r["conf"]["exp_base"], 4))
        pl = placebo(C, tf, filtro, int(f.conf_n), CONF)
        extra[f.variante] = dict(meseta=mes, meseta_ok=all(a > 0 and b > 0 for a, b in mes.values()),
                                 placebo_p95=float(np.percentile(pl, 95)), placebo_media=float(pl.mean()),
                                 placebo_ok=bool(f.conf_exp_base > np.percentile(pl, 95)))
        print("SOLIDEZ", f.variante, extra[f.variante], flush=True)
    registro.registrar("E043", __file__, hipotesis="La regla de E022 en H4/H1 a favor de la tendencia", universo="XAUUSD",
                       resultados=t, detalle=detalle, solidez=extra)
