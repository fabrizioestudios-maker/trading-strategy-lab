"""
Motor de backtest: operaciones con SL y TP fijos resueltas minuto a minuto (M1).

Reglas (docs/criterios.md):
- Entrada a mercado en la apertura del minuto `ie` (el primero después del cierre de la vela de señal).
- SL y TP fijos. Si los dos caen en el mismo minuto, cuenta el SL. Si un minuto abre más allá del SL (hueco), se sale
  en esa apertura; si abre más allá del TP, se sale en el TP (supuesto conservador: no se cobra el hueco a favor).
- Una operación a la vez por estrategia e instrumento (`superponer=False`): las señales que llegan con una abierta se ignoran.
- Tiempo máximo opcional (en minutos): se cierra al cierre del último minuto.
- R = (movimiento a favor − costo ida y vuelta) / riesgo.
"""
import numpy as np
from numba import njit


@njit(cache=True)
def _simular(o, h, l, c, ie, dirs, sl, tp, costo, max_min, superponer):
    n = len(ie)
    salida_i = np.full(n, -1, np.int64)
    salida_p = np.full(n, np.nan)
    motivo = np.zeros(n, np.int8)  # 1 TP, -1 SL, 2 tiempo, 3 fin de datos, 0 no operada
    r = np.full(n, np.nan)
    libre_desde = -1
    N = len(o)
    for k in range(n):
        i = ie[k]
        if i < 0 or i >= N:
            continue
        if not superponer and i <= libre_desde:
            continue
        d = dirs[k]
        ent = o[i]
        riesgo = (ent - sl[k]) * d
        if riesgo <= 0 or (tp[k] - ent) * d <= 0:
            continue  # el precio de apertura ya pasó el SL o el TP: la orden no tiene sentido
        fin = N - 1 if max_min <= 0 else min(N - 1, i + max_min - 1)
        j = i
        res = 0
        px = np.nan
        while j <= fin:
            if d == 1:
                if j > i and o[j] <= sl[k]:
                    res = -1; px = o[j]; break
                if l[j] <= sl[k]:
                    res = -1; px = sl[k]; break
                if h[j] >= tp[k]:
                    res = 1; px = tp[k]; break
            else:
                if j > i and o[j] >= sl[k]:
                    res = -1; px = o[j]; break
                if h[j] >= sl[k]:
                    res = -1; px = sl[k]; break
                if l[j] <= tp[k]:
                    res = 1; px = tp[k]; break
            j += 1
        if res == 0:
            j = fin
            px = c[j]
            res = 2 if max_min > 0 and fin < N - 1 else 3
        salida_i[k] = j
        salida_p[k] = px
        motivo[k] = res
        r[k] = ((px - ent) * d - costo[k]) / riesgo
        libre_desde = j
    return salida_i, salida_p, motivo, r


def simular(m1, ie, dirs, sl, tp, costo, max_min=0, superponer=False):
    """Simula operaciones ordenadas por entrada. Devuelve dict con arrays (solo las operadas)."""
    ie = np.asarray(ie, np.int64)
    orden = np.argsort(ie, kind="stable")
    ie, dirs, sl, tp, costo = ie[orden], np.asarray(dirs, np.int64)[orden], np.asarray(sl, float)[orden], np.asarray(tp, float)[orden], np.asarray(costo, float)[orden]
    si, sp, mo, r = _simular(m1["o"], m1["h"], m1["l"], m1["c"], ie, dirs, sl, tp, costo, int(max_min), bool(superponer))
    ok = mo != 0
    ent = m1["o"][np.clip(ie, 0, len(m1["o"]) - 1)]
    return dict(
        ie=ie[ok], dir=dirs[ok], entrada=ent[ok], sl=sl[ok], tp=tp[ok], salida_i=si[ok], salida=sp[ok], motivo=mo[ok], r=r[ok],
        t=m1["t"][ie[ok]], t_salida=m1["t"][si[ok]], rr_nominal=np.abs(tp[ok] - ent[ok]) / np.abs(ent[ok] - sl[ok]),
        idx_senal=orden[ok],
    )


def entrada_tras_cierre(v, k):
    """Índice M1 de entrada para una señal al cierre de la vela k de `v` (el minuto siguiente a su último minuto)."""
    return v["i1"][k] + 1
