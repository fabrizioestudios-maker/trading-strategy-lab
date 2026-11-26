"""
Estrategias operables a partir de una señal de dirección por vela (+1 / -1 / 0).

- modo 'estado': con la posición cerrada, se entra en la apertura siguiente a cualquier vela donde la señal marque
  dirección (si la tendencia sigue, se vuelve a entrar después de cada salida).
- modo 'cambio': solo se entra en la vela en que la señal cambia de valor (nueva tendencia).
SL = k·ATR(14) de la temporalidad de la señal, TP = rr·SL. Una operación a la vez.
"""
import numpy as np
import pandas as pd

from lab import datos, motor
from lab.metricas import resumen

CORTE = pd.Timestamp("2022-01-01", tz="UTC").value // 10**6


def operaciones(instr, m1, v, senal, k, rr=2.0, modo="estado", lados=(1, -1), atr_n=14, max_min=0):
    a = datos.atr(v, atr_n)
    s = np.asarray(senal)
    idx = np.arange(len(v["t"]) - 1)
    ok = ~np.isnan(a[idx]) & np.isin(s[idx], lados)
    if modo == "cambio":
        prev = np.concatenate([[0], s[:-1]])
        ok &= s[idx] != prev[idx]
    sel = idx[ok]
    if len(sel) == 0:
        return None
    ie = v["i1"][sel] + 1
    d = s[sel]
    ent = m1["o"][ie]
    riesgo = k * a[sel]
    return motor.simular(m1, ie, d, ent - d * riesgo, ent + d * rr * riesgo, datos.costo(instr, ent), max_min=max_min, superponer=False)


def resumen_muestras(ops):
    if ops is None or len(ops["r"]) == 0:
        return dict(sel=dict(n=0), val=dict(n=0))
    fin = ops["motivo"] != 3
    m_sel = (ops["t"] < CORTE) & fin
    m_val = (ops["t"] >= CORTE) & fin
    return dict(sel=resumen(ops["r"][m_sel], ops["t"][m_sel], ops["t_salida"][m_sel]),
                val=resumen(ops["r"][m_val], ops["t"][m_val], ops["t_salida"][m_val]))
