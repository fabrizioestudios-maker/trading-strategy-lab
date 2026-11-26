"""
E014 — Familias que faltaban: divergencias y multi-temporalidad. Solo selección (< 2022), universo limpio.

1. Divergencia RSI(14) en D1 y H4. Giros con pivotes 5/5 sobre mínimos y máximos. Divergencia alcista: el segundo
   mínimo de giro es más bajo que el anterior (como mucho 60 velas antes) y el RSI en el segundo es más alto. La señal
   llega al confirmarse el giro (5 velas después). SL: detrás del mínimo del giro − 0,25·ATR ("estructura") o 2·ATR.
   Bajista al revés. TP = 2,1·SL. Una operación a la vez.
2. Multi-temporalidad: tendencia diaria (cierre sobre la SMA 200 con pendiente positiva) y retroceso en H4
   (RSI2 < 10 o cierre en el mínimo de 10 velas H4) → compra; en ambos lados (venta en tendencia bajista) o solo
   compras en activos con deriva. SL = k·ATR(14) de H4 con k = 3, 4, 6. TP = 2,1·SL.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, estrategia, motor, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

FX = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"]
IDX = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD"]
MET = ["XAUUSD", "XAGUSD"]
UNIV = FX + IDX + MET
DERIVA = set(IDX + MET)
RR = 2.1


def pivotes(h, l, n=5):
    """Pivote alto/bajo en i-n confirmado en i (estricto a los dos lados)."""
    N = len(h)
    ph = np.zeros(N, bool)
    pl = np.zeros(N, bool)
    for i in range(2 * n, N):
        p = i - n
        ventana_h = np.concatenate([h[p - n:p], h[p + 1:i + 1]])
        ventana_l = np.concatenate([l[p - n:p], l[p + 1:i + 1]])
        ph[i] = h[p] > ventana_h.max()
        pl[i] = l[p] < ventana_l.min()
    return ph, pl


def divergencias(v, n=5, max_sep=60):
    """Devuelve lista de (i_confirmación, dir, extremo del giro)."""
    r = S.rsi(v["c"], 14)
    ph, pl = pivotes(v["h"], v["l"], n)
    out = []
    ult_l = None
    ult_h = None
    for i in range(len(v["c"])):
        if pl[i]:
            p = i - n
            if ult_l is not None and p - ult_l <= max_sep and v["l"][p] < v["l"][ult_l] and r[p] > r[ult_l]:
                out.append((i, 1, v["l"][p]))
            ult_l = p
        if ph[i]:
            p = i - n
            if ult_h is not None and p - ult_h <= max_sep and v["h"][p] > v["h"][ult_h] and r[p] < r[ult_h]:
                out.append((i, -1, v["h"][p]))
            ult_h = p
    return out


filas, acum = [], {}
for instr in UNIV:
    m1 = datos.cargar(instr)
    vd, v4 = datos.velas(m1, 1440), datos.velas(m1, 240)
    # ---- 1. divergencias
    for tf, v in (("D1", vd), ("H4", v4)):
        a = datos.atr(v, 14)
        dv = [x for x in divergencias(v) if x[0] < len(v["t"]) - 1 and not np.isnan(a[x[0]]) and v["t"][x[0]] < estrategia.CORTE]
        if not dv:
            continue
        k_i = np.array([x[0] for x in dv])
        d = np.array([x[1] for x in dv])
        ext = np.array([x[2] for x in dv])
        ie = v["i1"][k_i] + 1
        ent = m1["o"][ie]
        for sl_tipo in ("estructura", "2 ATR"):
            if sl_tipo == "estructura":
                sl = ext - d * 0.25 * a[k_i]
            else:
                sl = ent - d * 2 * a[k_i]
            riesgo = (ent - sl) * d
            ok = riesgo > 0
            ops = motor.simular(m1, ie[ok], d[ok], sl[ok], ent[ok] + d[ok] * RR * riesgo[ok], datos.costo(instr, ent[ok]), superponer=False)
            m = ops["motivo"] != 3
            clave = ("divergencia RSI14", tf, sl_tipo, "ambos lados")
            acum.setdefault(clave, []).append(ops["r"][m])
    # ---- 2. multi-temporalidad
    tend_d = S.tendencia(vd, 200)
    fin_d = np.append(vd["t"][1:], vd["t"][-1] + 86400000)
    cierre4 = np.append(v4["t"][1:], v4["t"][-1] + 4 * 3600000)
    j = np.searchsorted(fin_d, cierre4, side="right") - 1
    tend_en_4 = np.where(j >= 0, tend_d[np.clip(j, 0, None)], 0)
    rsi4 = S.rsi(v4["c"], 2)
    mn10 = pd.Series(v4["c"]).rolling(10).min().values
    mx10 = pd.Series(v4["c"]).rolling(10).max().values
    eventos = {
        "D1 tendencia + H4 RSI2<10": np.where((tend_en_4 == 1) & (rsi4 < 10), 1, np.where((tend_en_4 == -1) & (rsi4 > 90), -1, 0)),
        "D1 tendencia + H4 mínimo 10 velas": np.where((tend_en_4 == 1) & (v4["c"] <= mn10), 1, np.where((tend_en_4 == -1) & (v4["c"] >= mx10), -1, 0)),
    }
    corte4 = v4["t"] < estrategia.CORTE
    for ne, ev in eventos.items():
        ev = np.where(corte4, ev, 0)
        for k in (3.0, 4.0, 6.0):
            for var, lados in (("ambos lados", (1, -1)), ("solo compras (activos con deriva)", (1,))):
                if var.startswith("solo") and instr not in DERIVA:
                    continue
                ops = estrategia.operaciones(instr, m1, v4, ev, k, rr=RR, lados=lados)
                if ops is None:
                    continue
                m = (ops["motivo"] != 3) & (ops["t"] < estrategia.CORTE)
                acum.setdefault((ne, "H4", f"{k} ATR H4", var), []).append(ops["r"][m])
    print(instr, "listo", flush=True)
for (fam, tf, sl, var), lst in acum.items():
    s = resumen(np.concatenate(lst))
    filas.append(dict(familia=fam, tf=tf, stop=sl, variante=var, n=s["n"], wr=round(s["wr"] * 100, 1), wr_lo=round(s["wr_lo"] * 100, 1), payoff=round(s["payoff"], 2), pf=round(s["pf"], 2), expectancy=round(s["expectancy"], 3)))
df = pd.DataFrame(filas).sort_values("wr", ascending=False)
os.makedirs("resultados/E014", exist_ok=True)
df.to_csv("resultados/E014/divergencias_mtf_seleccion.csv", index=False)
print(df.to_string(index=False))
