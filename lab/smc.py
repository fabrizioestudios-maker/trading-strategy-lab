"""
Setup SMC (E023): barrido de liquidez → cambio de estructura → entrada en zona de reacción dentro del descuento, RR 1:2.

Todo se calcula con velas cerradas y sin mirar adelante, con definiciones que se pueden reproducir en Pine:
- Pivote alto en j: h[j] > h[j-k] y h[j] >= h[j+k] para k = 1..L. Se conoce recién en la vela j + L (igual el bajo, espejado).
- Valores de la temporalidad mayor en una vela de ejecución: los de la última vela mayor terminada ANTES de la vela mayor
  que contiene a esa vela (lo mismo que request.security(..., expr[1], lookahead = barmerge.lookahead_on) en Pine).
- Órdenes límite resueltas en M1: se llenan cuando el precio toca el límite (o mejor, si abre del otro lado); si antes de
  llenarse el precio llega al TP, se cancelan; vencen a las V velas. En el minuto del llenado solo se mira el SL
  (supuesto conservador); después, igual que lab/motor.py (huecos a la apertura, SL primero si los dos caen en el mismo minuto).
"""
import numpy as np
import pandas as pd
from numba import njit


@njit(cache=True)
def pivotes(h, l, L):
    """Último pivote alto y bajo confirmados al cierre de cada vela (NaN hasta el primero)."""
    n = len(h)
    ph = np.full(n, np.nan)
    pl = np.full(n, np.nan)
    ult_h = np.nan
    ult_l = np.nan
    for i in range(n):
        j = i - L
        if j - L >= 0:
            ok = True
            for k in range(1, L + 1):
                if not (h[j] > h[j - k]) or not (h[j] >= h[j + k]):
                    ok = False
                    break
            if ok:
                ult_h = h[j]
            ok = True
            for k in range(1, L + 1):
                if not (l[j] < l[j - k]) or not (l[j] <= l[j + k]):
                    ok = False
                    break
            if ok:
                ult_l = l[j]
        ph[i] = ult_h
        pl[i] = ult_l
    return ph, pl


@njit(cache=True)
def estado_estructura(c, ph, pl):
    """+1 desde que un cierre supera el último pivote alto (conocido en la vela anterior); -1 al perforar el bajo."""
    n = len(c)
    out = np.zeros(n, np.int8)
    s = 0
    for i in range(1, n):
        if not np.isnan(ph[i - 1]) and c[i] > ph[i - 1]:
            s = 1
        elif not np.isnan(pl[i - 1]) and c[i] < pl[i - 1]:
            s = -1
        out[i] = s
    return out


@njit(cache=True)
def detectar(o, h, l, c, ref_lo, ref_hi, ph, pl, W, recupera):
    """
    Setups barrido → cambio de estructura. ref_lo/ref_hi: nivel de liquidez conocido ANTES de cada vela.
    Devuelve arrays: dir, vela del barrido, vela del cambio, extremo del barrido, extremo opuesto del tramo,
    FVG (borde cercano y lejano) y order block (NaN si no hay).
    """
    n = len(c)
    D = np.zeros(n, np.int8)
    S = np.zeros(n, np.int64)
    M = np.zeros(n, np.int64)
    EXT = np.zeros(n)
    OPU = np.zeros(n)
    F1 = np.full(n, np.nan)
    F2 = np.full(n, np.nan)
    OB = np.full(n, np.nan)
    k = 0
    arm_u = False
    s_u = 0
    ext_u = 0.0
    niv_u = 0.0
    usado_lo = np.nan
    arm_d = False
    s_d = 0
    ext_d = 0.0
    niv_d = 0.0
    usado_hi = np.nan
    for i in range(1, n):
        # --- alcista: barrido de un mínimo y cierre sobre el último máximo de swing
        rl = ref_lo[i]
        nuevo = False
        if not np.isnan(rl) and rl != usado_lo and l[i] < rl and ((not recupera) or c[i] > rl):
            mss = ph[i]
            if not np.isnan(mss) and mss > c[i]:
                arm_u = True
                s_u = i
                ext_u = l[i]
                niv_u = mss
                usado_lo = rl
                nuevo = True
        if arm_u and not nuevo:
            if l[i] < ext_u:
                ext_u = l[i]
            if i - s_u > W:
                arm_u = False
            elif c[i] > niv_u:
                D[k] = 1
                S[k] = s_u
                M[k] = i
                EXT[k] = ext_u
                tope = h[s_u]
                for j in range(s_u, i + 1):
                    if h[j] > tope:
                        tope = h[j]
                OPU[k] = tope
                for j in range(i, s_u + 1, -1):
                    if l[j] > h[j - 2]:
                        F1[k] = l[j]
                        F2[k] = h[j - 2]
                        break
                for j in range(i, s_u - 1, -1):
                    if c[j] < o[j]:
                        OB[k] = h[j]
                        break
                k += 1
                arm_u = False
        # --- bajista: barrido de un máximo y cierre bajo el último mínimo de swing
        rh = ref_hi[i]
        nuevo = False
        if not np.isnan(rh) and rh != usado_hi and h[i] > rh and ((not recupera) or c[i] < rh):
            mss = pl[i]
            if not np.isnan(mss) and mss < c[i]:
                arm_d = True
                s_d = i
                ext_d = h[i]
                niv_d = mss
                usado_hi = rh
                nuevo = True
        if arm_d and not nuevo:
            if h[i] > ext_d:
                ext_d = h[i]
            if i - s_d > W:
                arm_d = False
            elif c[i] < niv_d:
                D[k] = -1
                S[k] = s_d
                M[k] = i
                EXT[k] = ext_d
                piso = l[s_d]
                for j in range(s_d, i + 1):
                    if l[j] < piso:
                        piso = l[j]
                OPU[k] = piso
                for j in range(i, s_d + 1, -1):
                    if h[j] < l[j - 2]:
                        F1[k] = h[j]
                        F2[k] = l[j - 2]
                        break
                for j in range(i, s_d - 1, -1):
                    if c[j] > o[j]:
                        OB[k] = l[j]
                        break
                k += 1
                arm_d = False
    return D[:k], S[:k], M[:k], EXT[:k], OPU[:k], F1[:k], F2[:k], OB[:k]


@njit(cache=True)
def simular_ordenes(o, h, l, c, crea, vence, d, entrada, sl, tp, costo, mercado, rr):
    """
    Una orden (o posición) a la vez. Para cada orden: estado 1 TP, -1 SL, 2 cancelada por tocar el TP antes,
    3 vencida, 4 abierta al final de los datos, 5 descartada (riesgo inválido), 0 ignorada (había otra activa).
    r = (movimiento a favor − costo) / riesgo planeado.
    """
    n = len(crea)
    N = len(o)
    est = np.zeros(n, np.int8)
    r = np.full(n, np.nan)
    t_in = np.full(n, -1, np.int64)
    t_out = np.full(n, -1, np.int64)
    libre = -1
    for k in range(n):
        i = crea[k]
        if i <= libre or i >= N:
            continue
        dd = d[k]
        if mercado:
            ent = o[i]
            riesgo = (ent - sl[k]) * dd
            if riesgo <= 3.0 * costo[k]:
                est[k] = 5
                continue
            tpk = ent + dd * rr * riesgo
            j = i
            px_in = ent
        else:
            ent = entrada[k]
            riesgo = (ent - sl[k]) * dd
            tpk = tp[k]
            j = i
            lleno = False
            px_in = ent
            fin = min(vence[k], N - 1)
            cancel = False
            while j <= fin:
                if dd == 1:
                    if l[j] <= ent:
                        px_in = min(ent, o[j])
                        lleno = True
                        break
                    if h[j] >= tpk:
                        cancel = True
                        break
                else:
                    if h[j] >= ent:
                        px_in = max(ent, o[j])
                        lleno = True
                        break
                    if l[j] <= tpk:
                        cancel = True
                        break
                j += 1
            if not lleno:
                est[k] = 2 if cancel else 3
                libre = min(j, N - 1)
                continue
        t_in[k] = j
        # minuto del llenado: solo el SL
        res = 0
        px = np.nan
        if (dd == 1 and l[j] <= sl[k]) or (dd == -1 and h[j] >= sl[k]):
            res = -1
            px = sl[k]
        else:
            j += 1
            while j < N:
                if dd == 1:
                    if o[j] <= sl[k]:
                        res = -1
                        px = o[j]
                        break
                    if l[j] <= sl[k]:
                        res = -1
                        px = sl[k]
                        break
                    if h[j] >= tpk:
                        res = 1
                        px = tpk
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
                    if l[j] <= tpk:
                        res = 1
                        px = tpk
                        break
                j += 1
        if res == 0:
            j = N - 1
            px = c[j]
            est[k] = 4
        else:
            est[k] = res
        t_out[k] = j
        r[k] = ((px - px_in) * dd - costo[k]) / riesgo
        libre = j
    return est, r, t_in, t_out


def mapear_mayor(t_menor, t_mayor):
    """Índice de la última vela mayor terminada antes de la vela mayor que contiene a cada vela menor (-1 si no hay)."""
    return np.searchsorted(t_mayor, t_menor, side="right") - 2


def ema(x, n):
    return pd.Series(x).ewm(span=n, adjust=False).mean().values


def minuto_ny(t_ms):
    ny = pd.to_datetime(t_ms, unit="ms", utc=True).tz_convert("America/New_York")
    return (ny.hour * 60 + ny.minute).values


def killzones(t_ms):
    m = minuto_ny(t_ms)
    return ((m >= 120) & (m < 300)) | ((m >= 420) & (m < 660))
