"""
Los 5 setups ICT del prompt de Google (E025, BITACORA entrada 22) y el simulador con las reglas globales.

Cada detector recorre las velas de ejecución y devuelve órdenes límite: vela en que se completa el setup, dirección,
precio de entrada, SL, TP alternativo (NaN si no hay) y última vela de validez. Todo con velas cerradas:
- swings con pivotes de L velas (lab/smc.pivotes), conocidos L velas después;
- kz[i]: 1 = killzone de Londres, 2 = killzone de NY, 0 = fuera; kzfin[i] = última vela de esa killzone;
- mascara: killzones habilitadas (1 Londres, 2 NY, 3 las dos). La orden se crea solo si el setup se completa dentro de
  una killzone habilitada y vence a las V velas o al final de esa killzone.
"""
import numpy as np
from numba import njit


@njit(cache=True)
def _fvg_alc(o, h, l, c, atr, j, minfvg):
    return l[j] > h[j - 2] and c[j - 1] > o[j - 1] and (l[j] - h[j - 2]) >= minfvg * atr[j]


@njit(cache=True)
def _fvg_baj(o, h, l, c, atr, j, minfvg):
    return h[j] < l[j - 2] and c[j - 1] < o[j - 1] and (l[j - 2] - h[j]) >= minfvg * atr[j]


@njit(cache=True)
def _nuevo(n):
    return (np.zeros(n, np.int64), np.zeros(n, np.int8), np.zeros(n), np.zeros(n), np.full(n, np.nan), np.zeros(n, np.int64))


@njit(cache=True)
def s1_barrido(o, h, l, c, atr, ph, pl, kz, kzfin, mascara, N, V, minfvg, zona, ce, margen):
    """Setup 1: barrido con cierre de vuelta → MSS en N velas → límite en el FVG del tramo (o en el OB). zona: 0 FVG y si no OB, 1 solo FVG, 2 solo OB."""
    n = len(c)
    B, D, E, S, T, X = _nuevo(n)
    k = 0
    armU = False
    sU = 0
    extU = 0.0
    nivU = 0.0
    usoU = np.nan
    armD = False
    sD = 0
    extD = 0.0
    nivD = 0.0
    usoD = np.nan
    for i in range(1, n):
        rl = pl[i - 1]
        nuevo = False
        if not np.isnan(rl) and rl != usoU and l[i] < rl and c[i] > rl and not np.isnan(ph[i]) and ph[i] > c[i]:
            armU = True
            sU = i
            extU = l[i]
            nivU = ph[i]
            usoU = rl
            nuevo = True
        if armU and not nuevo:
            if l[i] < extU:
                extU = l[i]
            if i - sU > N:
                armU = False
            elif c[i] > nivU:
                armU = False
                if kz[i] > 0 and (mascara & kz[i]) != 0:
                    hallado = False
                    tope = 0.0
                    base = 0.0
                    if zona != 2:
                        for j in range(i, sU + 1, -1):
                            if _fvg_alc(o, h, l, c, atr, j, minfvg):
                                tope = l[j]
                                base = h[j - 2]
                                hallado = True
                                break
                    if not hallado and zona != 1:
                        for j in range(i, sU - 1, -1):
                            if c[j] < o[j]:
                                tope = h[j]
                                base = l[j]
                                hallado = True
                                break
                    if hallado:
                        e = tope if ce == 0 else (tope + base) / 2
                        sl = extU - margen * atr[i]
                        if e < c[i] and e > sl:
                            B[k] = i
                            D[k] = 1
                            E[k] = e
                            S[k] = sl
                            X[k] = min(i + V, kzfin[i])
                            k += 1
        rh = ph[i - 1]
        nuevo = False
        if not np.isnan(rh) and rh != usoD and h[i] > rh and c[i] < rh and not np.isnan(pl[i]) and pl[i] < c[i]:
            armD = True
            sD = i
            extD = h[i]
            nivD = pl[i]
            usoD = rh
            nuevo = True
        if armD and not nuevo:
            if h[i] > extD:
                extD = h[i]
            if i - sD > N:
                armD = False
            elif c[i] < nivD:
                armD = False
                if kz[i] > 0 and (mascara & kz[i]) != 0:
                    hallado = False
                    piso = 0.0
                    techo = 0.0
                    if zona != 2:
                        for j in range(i, sD + 1, -1):
                            if _fvg_baj(o, h, l, c, atr, j, minfvg):
                                piso = h[j]
                                techo = l[j - 2]
                                hallado = True
                                break
                    if not hallado and zona != 1:
                        for j in range(i, sD - 1, -1):
                            if c[j] > o[j]:
                                piso = l[j]
                                techo = h[j]
                                hallado = True
                                break
                    if hallado:
                        e = piso if ce == 0 else (piso + techo) / 2
                        sl = extD + margen * atr[i]
                        if e > c[i] and e < sl:
                            B[k] = i
                            D[k] = -1
                            E[k] = e
                            S[k] = sl
                            X[k] = min(i + V, kzfin[i])
                            k += 1
    return B[:k], D[:k], E[:k], S[:k], T[:k], X[:k]


@njit(cache=True)
def s2_breaker(o, h, l, c, atr, L, kz, kzfin, mascara, V, ce, margen):
    """Setup 2: OB bajista (última vela alcista en las 3 velas antes del máximo de swing previo a un mínimo más bajo); un cierre
    sobre su máximo lo convierte en breaker alcista → límite en su borde superior (o 50 %), SL bajo su mínimo."""
    n = len(c)
    B, D, E, S, T, X = _nuevo(n)
    k = 0
    ph_v = np.nan
    ph_b = -1
    pl_v = np.nan
    pl_b = -1
    obB = False
    obB_h = 0.0
    obB_l = 0.0
    obA = False
    obA_h = 0.0
    obA_l = 0.0
    for i in range(n):
        j = i - L
        if j - L >= 0:
            es_h = True
            es_l = True
            for q in range(1, L + 1):
                if not (h[j] > h[j - q]) or not (h[j] >= h[j + q]):
                    es_h = False
                if not (l[j] < l[j - q]) or not (l[j] <= l[j + q]):
                    es_l = False
            if es_h:
                if not np.isnan(ph_v) and h[j] > ph_v and pl_b >= 0:
                    for q in range(pl_b, max(pl_b - 3, 0) - 1, -1):
                        if c[q] < o[q]:
                            obA = True
                            obA_h = h[q]
                            obA_l = l[q]
                            break
                ph_v = h[j]
                ph_b = j
            if es_l:
                if not np.isnan(pl_v) and l[j] < pl_v and ph_b >= 0:
                    for q in range(ph_b, max(ph_b - 3, 0) - 1, -1):
                        if c[q] > o[q]:
                            obB = True
                            obB_h = h[q]
                            obB_l = l[q]
                            break
                pl_v = l[j]
                pl_b = j
        if obB and c[i] > obB_h:
            obB = False
            if kz[i] > 0 and (mascara & kz[i]) != 0:
                e = obB_h if ce == 0 else (obB_h + obB_l) / 2
                sl = obB_l - margen * atr[i]
                if e < c[i] and e > sl:
                    B[k] = i
                    D[k] = 1
                    E[k] = e
                    S[k] = sl
                    X[k] = min(i + V, kzfin[i])
                    k += 1
        if obA and c[i] < obA_l:
            obA = False
            if kz[i] > 0 and (mascara & kz[i]) != 0:
                e = obA_l if ce == 0 else (obA_h + obA_l) / 2
                sl = obA_h + margen * atr[i]
                if e > c[i] and e < sl:
                    B[k] = i
                    D[k] = -1
                    E[k] = e
                    S[k] = sl
                    X[k] = min(i + V, kzfin[i])
                    k += 1
    return B[:k], D[:k], E[:k], S[:k], T[:k], X[:k]


@njit(cache=True)
def s3_continuacion(o, h, l, c, atr, sesgo, kz, kzfin, mascara, V, minfvg, ce, margen):
    """Setup 3: con el sesgo de la temporalidad mayor, cada FVG a favor → límite en el borde (o 50 %), SL detrás de la vela 1."""
    n = len(c)
    B, D, E, S, T, X = _nuevo(n)
    k = 0
    for i in range(2, n):
        if kz[i] == 0 or (mascara & kz[i]) == 0:
            continue
        if sesgo[i] == 1 and _fvg_alc(o, h, l, c, atr, i, minfvg):
            e = l[i] if ce == 0 else (l[i] + h[i - 2]) / 2
            sl = l[i - 2] - margen * atr[i]
            if e < c[i] and e > sl:
                B[k] = i
                D[k] = 1
                E[k] = e
                S[k] = sl
                X[k] = min(i + V, kzfin[i])
                k += 1
        elif sesgo[i] == -1 and _fvg_baj(o, h, l, c, atr, i, minfvg):
            e = h[i] if ce == 0 else (h[i] + l[i - 2]) / 2
            sl = h[i - 2] + margen * atr[i]
            if e > c[i] and e < sl:
                B[k] = i
                D[k] = -1
                E[k] = e
                S[k] = sl
                X[k] = min(i + V, kzfin[i])
                k += 1
    return B[:k], D[:k], E[:k], S[:k], T[:k], X[:k]


@njit(cache=True)
def s4_amd(o, h, l, c, atr, ph, pl, dia, asia_h, asia_l, kz, kzfin, mascara, N, V, minfvg, ce, margen):
    """Setup 4: en killzone, perforación de un extremo de Asia y cierre de vuelta adentro; MSS (pivote) en N velas desde la
    perforación con un FVG formado desde la recuperación → límite en el FVG, SL detrás de la manipulación, TP alternativo
    en el extremo opuesto de Asia. Un setup por día y dirección."""
    n = len(c)
    B, D, E, S, T, X = _nuevo(n)
    k = 0
    dia_act = -1
    eU = 0
    usadoU = False
    sU = 0
    rU = 0
    manU = 0.0
    nivU = 0.0
    eD = 0
    usadoD = False
    sD = 0
    rD = 0
    manD = 0.0
    nivD = 0.0
    for i in range(2, n):
        if dia[i] != dia_act:
            dia_act = dia[i]
            eU = 0
            usadoU = False
            eD = 0
            usadoD = False
        if np.isnan(asia_l[i]):
            continue
        en_kz = kz[i] > 0 and (mascara & kz[i]) != 0
        # alcista: perfora el mínimo de Asia
        if not usadoU:
            if eU == 0:
                if en_kz and l[i] < asia_l[i] and not np.isnan(ph[i]) and ph[i] > c[i]:
                    eU = 1
                    sU = i
                    manU = l[i]
                    nivU = ph[i]
                    if c[i] > asia_l[i]:
                        eU = 2
                        rU = i
            else:
                if l[i] < manU:
                    manU = l[i]
                if eU == 1 and c[i] > asia_l[i]:
                    eU = 2
                    rU = i
                if i - sU > N:
                    eU = 0
                elif eU == 2 and c[i] > nivU:
                    usadoU = True
                    eU = 0
                    if en_kz:
                        for j in range(i, max(rU, 2) - 1, -1):
                            if _fvg_alc(o, h, l, c, atr, j, minfvg):
                                e = l[j] if ce == 0 else (l[j] + h[j - 2]) / 2
                                sl = manU - margen * atr[i]
                                if e < c[i] and e > sl:
                                    B[k] = i
                                    D[k] = 1
                                    E[k] = e
                                    S[k] = sl
                                    T[k] = asia_h[i]
                                    X[k] = min(i + V, kzfin[i])
                                    k += 1
                                break
        # bajista: perfora el máximo de Asia
        if not usadoD:
            if eD == 0:
                if en_kz and h[i] > asia_h[i] and not np.isnan(pl[i]) and pl[i] < c[i]:
                    eD = 1
                    sD = i
                    manD = h[i]
                    nivD = pl[i]
                    if c[i] < asia_h[i]:
                        eD = 2
                        rD = i
            else:
                if h[i] > manD:
                    manD = h[i]
                if eD == 1 and c[i] < asia_h[i]:
                    eD = 2
                    rD = i
                if i - sD > N:
                    eD = 0
                elif eD == 2 and c[i] < nivD:
                    usadoD = True
                    eD = 0
                    if en_kz:
                        for j in range(i, max(rD, 2) - 1, -1):
                            if _fvg_baj(o, h, l, c, atr, j, minfvg):
                                e = h[j] if ce == 0 else (h[j] + l[j - 2]) / 2
                                sl = manD + margen * atr[i]
                                if e > c[i] and e < sl:
                                    B[k] = i
                                    D[k] = -1
                                    E[k] = e
                                    S[k] = sl
                                    T[k] = asia_l[i]
                                    X[k] = min(i + V, kzfin[i])
                                    k += 1
                                break
    return B[:k], D[:k], E[:k], S[:k], T[:k], X[:k]


@njit(cache=True)
def s5_sesgo_mayor(o, h, l, c, atr, sesgo, ph3, pl3, kz, kzfin, mascara, N, V, minfvg, ce, margen):
    """Setup 5: con el sesgo mayor y dentro de la killzone, barrido del último swing interno (pivote 3) y, en N velas,
    un FVG a favor cuya vela 1 es posterior al barrido → límite en el FVG, SL detrás del extremo del barrido."""
    n = len(c)
    B, D, E, S, T, X = _nuevo(n)
    k = 0
    armU = False
    sU = 0
    extU = 0.0
    usoU = np.nan
    armD = False
    sD = 0
    extD = 0.0
    usoD = np.nan
    for i in range(2, n):
        en_kz = kz[i] > 0 and (mascara & kz[i]) != 0
        if not en_kz or sesgo[i] != 1:
            armU = False
        else:
            rl = pl3[i - 1]
            if not np.isnan(rl) and rl != usoU and l[i] < rl:
                armU = True
                sU = i
                extU = l[i]
                usoU = rl
            elif armU:
                if l[i] < extU:
                    extU = l[i]
                if i - sU > N:
                    armU = False
                elif i - 2 >= sU and _fvg_alc(o, h, l, c, atr, i, minfvg):
                    e = l[i] if ce == 0 else (l[i] + h[i - 2]) / 2
                    sl = extU - margen * atr[i]
                    if e < c[i] and e > sl:
                        B[k] = i
                        D[k] = 1
                        E[k] = e
                        S[k] = sl
                        X[k] = min(i + V, kzfin[i])
                        k += 1
                    armU = False
        if not en_kz or sesgo[i] != -1:
            armD = False
        else:
            rh = ph3[i - 1]
            if not np.isnan(rh) and rh != usoD and h[i] > rh:
                armD = True
                sD = i
                extD = h[i]
                usoD = rh
            elif armD:
                if h[i] > extD:
                    extD = h[i]
                if i - sD > N:
                    armD = False
                elif i - 2 >= sD and _fvg_baj(o, h, l, c, atr, i, minfvg):
                    e = h[i] if ce == 0 else (h[i] + l[i - 2]) / 2
                    sl = extD + margen * atr[i]
                    if e > c[i] and e < sl:
                        B[k] = i
                        D[k] = -1
                        E[k] = e
                        S[k] = sl
                        X[k] = min(i + V, kzfin[i])
                        k += 1
                    armD = False
    return B[:k], D[:k], E[:k], S[:k], T[:k], X[:k]


@njit(cache=True)
def simular(o, h, l, c, dia, mdia, crea, vence, d, ent, sl, tp, costo, max_dia, max_perd, hora_cierre, realista=False):
    """
    Órdenes límite con las reglas globales: una orden o posición a la vez; como máximo max_dia operaciones por día (fecha
    de NY) y ninguna más tras max_perd pérdidas seguidas en el día; cierre forzoso en el primer minuto con hora NY >=
    hora_cierre (minutos; -1 = sin cierre). Llenado y salidas como lab/smc.simular_ordenes.
    estado: 1 TP, -1 SL, 2 cierre forzoso, 3 vencida, 4 cancelada (tocó el TP antes), 5 abierta al final, 6 bloqueada por límites diarios.
    """
    n = len(crea)
    N = len(o)
    est = np.zeros(n, np.int8)
    r = np.full(n, np.nan)
    t_in = np.full(n, -1, np.int64)
    t_out = np.full(n, -1, np.int64)
    libre = -1
    dia_act = -1
    ops = 0
    perd = 0
    for k in range(n):
        i = crea[k]
        if i <= libre or i >= N:
            continue
        if dia[i] != dia_act:
            dia_act = dia[i]
            ops = 0
            perd = 0
        if ops >= max_dia or perd >= max_perd:
            est[k] = 6
            continue
        dd = d[k]
        e = ent[k]
        riesgo = (e - sl[k]) * dd
        if riesgo <= 0:
            continue
        j = i
        fin = min(vence[k], N - 1)
        lleno = False
        cancel = False
        px_in = e
        while j <= fin:
            if dd == 1:
                if l[j] <= e:
                    px_in = min(e, o[j])
                    lleno = True
                    break
                if h[j] >= tp[k]:
                    cancel = True
                    break
            else:
                if h[j] >= e:
                    px_in = max(e, o[j])
                    lleno = True
                    break
                if l[j] <= tp[k]:
                    cancel = True
                    break
            j += 1
        if not lleno:
            est[k] = 4 if cancel else 3
            libre = min(j, N - 1)
            continue
        t_in[k] = j
        ops += 1
        dia_in = dia[j]
        res = 0
        px = np.nan
        if (dd == 1 and l[j] <= sl[k]) or (dd == -1 and h[j] >= sl[k]):
            res = -1
            px = sl[k]
            # realista=True: si el llenado ya quedó más allá del stop (hueco), el stop salta enseguida al precio del llenado
            if realista and (px_in - sl[k]) * dd <= 0:
                px = px_in
        else:
            j += 1
            while j < N:
                if hora_cierre >= 0 and (dia[j] != dia_in or mdia[j] >= hora_cierre):
                    res = 2
                    px = o[j]
                    break
                if dd == 1:
                    if o[j] <= sl[k]:
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
                    if o[j] >= sl[k]:
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
            j = N - 1
            px = c[j]
            est[k] = 5
        else:
            est[k] = res
        t_out[k] = j
        r[k] = ((px - px_in) * dd - costo[k]) / riesgo
        libre = j
        if r[k] <= 0:
            perd += 1
        else:
            perd = 0
    return est, r, t_in, t_out
