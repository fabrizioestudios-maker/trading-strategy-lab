"""
E042 — ¿La ventaja de E022 depende del precio bid de la reapertura de las 18:00 NY? (BITACORA, entrada 34)
Repite E022 (2011-11-15 → 2026-11-13) con la entrada retrasada al primer minuto en o después de 18:05, 18:15, 18:30 y
19:00 NY del día siguiente a la señal; SL 0,5·ATR(14) y TP 2·SL desde la nueva entrada; costos de docs/costos.md y base.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, ejecucion as EJ, eventos as EV, motor, registro, senales as S, validacion as V  # noqa: E402

SAL = "resultados/E042"


def bollinger_ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    return np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    v = datos.velas(m1, 1440)
    atr = datos.atr(v, 14)
    s = bollinger_ruptura(v["c"])
    s = np.where(s == S.sobre_sma(v, 200), s, 0)
    nb = len(v["t"])
    desde, hasta = (pd.Timestamp(x, tz="UTC").value // 10**6 for x in ("2011-11-15", "2026-11-14"))
    sel = np.flatnonzero((s != 0) & ~np.isnan(atr) & (v["t"] >= desde) & (v["t"] < hasta) & (np.arange(nb) < nb - 1))
    ie0 = v["i1"][sel] + 1
    mny = EV.minuto_ny(m1["t"])
    tm = (mny - 1020) % 1440  # minutos desde las 17:00 NY
    vol = EJ.Volatilidad(m1)
    filas = []
    for nombre, retraso in (("original (reapertura)", None), ("18:05", 65), ("18:15", 75), ("18:30", 90), ("19:00", 120)):
        if retraso is None:
            ie = ie0.copy()
        else:
            ie = np.array([i + int(np.argmax(tm[i:i + 600] >= retraso)) if (tm[i:i + 600] >= retraso).any() else i for i in ie0])
        d = s[sel].astype(np.int64)
        ent = m1["o"][ie]
        riesgo = 0.5 * atr[sel]
        o = motor.simular(m1, ie, d, ent - d * riesgo, ent + d * 2 * riesgo, datos.costo("XAUUSD", ent))
        m = o["motivo"] != 3
        ops = pd.DataFrame({k: o[k][m] for k in ("t", "t_salida", "dir", "entrada", "salida", "sl", "motivo", "r")})
        base = EJ.aplicar(ops, "XAUUSD", vol, "base")
        lo, hi = V.bootstrap_ic(ops.r.values)
        f = dict(entrada=nombre, n=len(ops), wr=float((ops.r > 0).mean()), exp_costosmd=float(ops.r.mean()), ic_lo=lo, ic_hi=hi,
                 exp_base=float(base.r.mean()), compras_exp=float(ops[ops.dir == 1].r.mean()), compras_n=int((ops.dir == 1).sum()),
                 ventas_exp=float(ops[ops.dir == -1].r.mean()), ventas_n=int((ops.dir == -1).sum()),
                 minuto_ny_entrada_mediano=float(np.median(mny[ie])))
        filas.append(f)
        print({k: (round(x, 3) if isinstance(x, float) else x) for k, x in f.items()}, flush=True)
    t = pd.DataFrame(filas)
    orig = t.exp_costosmd.iloc[0]
    r = t.set_index("entrada")
    criterios = {"todas > 0": bool((t.exp_costosmd > 0).all()),
                 "18:15 y 19:00 ≥ la mitad": bool(r.loc["18:15", "exp_costosmd"] >= orig / 2 and r.loc["19:00", "exp_costosmd"] >= orig / 2),
                 "IC de 18:15 > 0": bool(r.loc["18:15", "ic_lo"] > 0)}
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    print("CRITERIOS:", criterios, "→", "PASA" if all(criterios.values()) else "NO PASA")
    registro.registrar("E042", __file__, hipotesis="E022 no depende del precio de reapertura", universo="XAUUSD", resultados=t, criterios=criterios)
