"""
Capas descriptivas del Institutional Toolkit, calculadas SOLO con velas cerradas hasta el límite del replay.

Son descripciones del precio, no evidencia de ventaja: E038 encontró que los modelos SMC/ICT del laboratorio rinden
como el azar después de costos, y E031 que ninguna regla sobrevive a las correcciones por pruebas múltiples.

Definiciones (las de lab/smc.py y lab/ict.py, reproducibles en Pine):
- Pivote alto en j: h[j] > h[j-k] y h[j] >= h[j+k] para k = 1..L. Se conoce al cierre de la vela j + L. (Bajo, espejado.)
- Ruptura: el cierre de una vela supera el último pivote alto conocido en la vela anterior (alcista) o perfora el último
  pivote bajo (bajista). Cada pivote se rompe una sola vez. BOS si va a favor del estado previo de la estructura (o si no
  había estado), CHOCH si lo da vuelta.
- FVG alcista en j: l[j] > h[j-2], vela j-1 alcista y hueco >= 0,25 · ATR(14) de Wilder (lab/ict.py). Bajista, espejado.
  Queda mitigado cuando una vela cerrada posterior vuelve a tocar el hueco.
La ventana usa las últimas `cantidad` velas cerradas más un margen; al principio de la ventana el estado de la estructura
puede diferir del que daría una historia más larga (se informa en la nota).
"""
from __future__ import annotations

import numpy as np

from lab import smc as SMC

L_PIVOTE = 3
MIN_FVG_ATR = 0.25
MARGEN = 60


def _atr_wilder(h, l, c, n=14):
    tr = np.maximum(h - l, np.maximum(np.abs(h - np.r_[c[0], c[:-1]]), np.abs(l - np.r_[c[0], c[:-1]])))
    atr = np.full(len(tr), np.nan)
    if len(tr) >= n:
        atr[n - 1] = tr[:n].mean()
        for i in range(n, len(tr)):
            atr[i] = atr[i - 1] + (tr[i] - atr[i - 1]) / n
    return atr


def pivotes_con_posicion(h, l, L):
    """Pivotes con su vela (j) y la vela que los confirma (j + L). Misma definición que lab.smc.pivotes."""
    out = []
    for j in range(L, len(h) - L):
        if all(h[j] > h[j - k] for k in range(1, L + 1)) and all(h[j] >= h[j + k] for k in range(1, L + 1)):
            out.append((j, "alto", float(h[j])))
        if all(l[j] < l[j - k] for k in range(1, L + 1)) and all(l[j] <= l[j + k] for k in range(1, L + 1)):
            out.append((j, "bajo", float(l[j])))
    return out


def capas(svc, simbolo: str, tf: int, limite_ms: int, cantidad: int = 300) -> dict:
    velas, _ = svc.velas_hasta(simbolo, tf, limite_ms, cantidad + MARGEN)
    cerr = [v for v in velas if not v["parcial"]]
    tf_ms = tf * 60_000
    j_lim = svc.indice_limite(simbolo, limite_ms)
    t_lim = int(svc.m1(simbolo)["t"][j_lim]) if j_lim >= 0 else limite_ms
    base = dict(simbolo=simbolo, temporalidad=tf, limite_ms=t_lim, pivotes=[], rupturas=[], estado_estructura=0, fvg=[],
                definiciones=[
                    f"Pivote: extremo con {L_PIVOTE} velas a cada lado; se conoce al cierre de la vela {L_PIVOTE} posterior.",
                    "BOS: el cierre rompe el último pivote a favor de la estructura. CHOCH: lo rompe en contra y la da vuelta.",
                    f"FVG: hueco entre la vela 1 y la 3 de al menos {MIN_FVG_ATR:g} × ATR(14), con la vela del medio a favor.",
                ],
                nota="Descriptivo. E038: los modelos SMC/ICT del laboratorio rinden como el azar después de costos.")
    n = len(cerr)
    if n < 2 * L_PIVOTE + 3:
        return base
    t = np.array([v["t"] for v in cerr], np.int64)
    o, h, l, c = (np.array([v[k] for v in cerr], float) for k in ("o", "h", "l", "c"))
    desde = t[max(0, n - cantidad)]

    piv = pivotes_con_posicion(h, l, L_PIVOTE)
    confirmados: dict[int, list] = {}
    for j, tipo, precio in piv:
        confirmados.setdefault(j + L_PIVOTE, []).append((j, tipo, precio))
    estado, alto, bajo, rupturas = 0, None, None, []
    for i in range(n):
        if alto is not None and not alto["roto"] and c[i] > alto["precio"]:
            rupturas.append(dict(t=int(t[i]), tipo="CHOCH" if estado == -1 else "BOS", lado="alcista", nivel=alto["precio"], pivote_t=alto["t"]))
            alto["roto"], estado = True, 1
        elif bajo is not None and not bajo["roto"] and c[i] < bajo["precio"]:
            rupturas.append(dict(t=int(t[i]), tipo="CHOCH" if estado == 1 else "BOS", lado="bajista", nivel=bajo["precio"], pivote_t=bajo["t"]))
            bajo["roto"], estado = True, -1
        for j, tipo, precio in confirmados.get(i, []):
            p = dict(t=int(t[j]), precio=round(precio, 5), roto=False)
            if tipo == "alto":
                alto = p
            else:
                bajo = p

    atr = _atr_wilder(h, l, c)
    fvg = []
    for j in range(2, n):
        if not np.isfinite(atr[j]):
            continue
        lado = None
        if l[j] > h[j - 2] and c[j - 1] > o[j - 1] and (l[j] - h[j - 2]) >= MIN_FVG_ATR * atr[j]:
            lado, abajo, arriba = "alcista", h[j - 2], l[j]
        elif h[j] < l[j - 2] and c[j - 1] < o[j - 1] and (l[j - 2] - h[j]) >= MIN_FVG_ATR * atr[j]:
            lado, abajo, arriba = "bajista", h[j], l[j - 2]
        if lado is None:
            continue
        mitigada = None
        for i in range(j + 1, n):
            if (lado == "alcista" and l[i] <= arriba) or (lado == "bajista" and h[i] >= abajo):
                mitigada = int(t[i] + tf_ms)
                break
        fvg.append(dict(t=int(t[j]), lado=lado, arriba=round(float(arriba), 5), abajo=round(float(abajo), 5), conocido_ms=int(t[j] + tf_ms), mitigada_ms=mitigada))

    base.update(
        pivotes=[dict(t=int(t[j]), tipo=tipo, precio=round(precio, 5), confirmado_ms=int(t[j + L_PIVOTE] + tf_ms)) for j, tipo, precio in piv if t[j] >= desde],
        rupturas=[r for r in rupturas if r["t"] >= desde],
        estado_estructura=estado,
        fvg=[z for z in fvg if z["t"] >= desde],
    )
    return base


def coincide_con_laboratorio(h, l, L=L_PIVOTE) -> bool:
    """El último pivote conocido en cada vela coincide con lab.smc.pivotes (prueba de equivalencia)."""
    ph, pl = SMC.pivotes(np.asarray(h, float), np.asarray(l, float), L)
    ult_h = ult_l = np.nan
    piv = pivotes_con_posicion(h, l, L)
    por_conf: dict[int, list] = {}
    for j, tipo, precio in piv:
        por_conf.setdefault(j + L, []).append((tipo, precio))
    for i in range(len(h)):
        for tipo, precio in por_conf.get(i, []):
            if tipo == "alto":
                ult_h = precio
            else:
                ult_l = precio
        if not (np.isnan(ph[i]) and np.isnan(ult_h)) and ph[i] != ult_h:
            return False
        if not (np.isnan(pl[i]) and np.isnan(ult_l)) and pl[i] != ult_l:
            return False
    return True
