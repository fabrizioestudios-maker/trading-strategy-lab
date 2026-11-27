"""
Capas descriptivas del Institutional Toolkit, calculadas SOLO con velas cerradas hasta el límite del replay.

Son descripciones del precio, no evidencia de ventaja: E038 encontró que los modelos SMC/ICT del laboratorio rinden
como el azar después de costos, y E031 que ninguna regla sobrevive a las correcciones por pruebas múltiples.

Definiciones (las de lab/smc.py y lab/ict.py, reproducibles en Pine):
- Pivote alto en j: h[j] > h[j-k] y h[j] >= h[j+k] para k = 1..L. Se conoce al cierre de la vela j + L. (Bajo, espejado.)
- Ruptura: el cierre de una vela supera el último pivote alto conocido en la vela anterior (alcista) o perfora el último
  pivote bajo (bajista). Cada pivote se rompe una sola vez. BOS si va a favor del estado previo de la estructura (o si no
  había estado), CHOCH si lo da vuelta.
- Barrido: una vela cerrada supera el último pivote conocido pero cierra de vuelta (no lo rompe). Cada pivote, una vez.
- Order block: en cada ruptura, la última vela contraria de las 10 anteriores; queda mitigado cuando el precio vuelve.
- FVG alcista en j: l[j] > h[j-2], vela j-1 alcista y hueco >= 0,25 · ATR(14) de Wilder (lab/ict.py). Bajista, espejado.
  Queda mitigado cuando una vela cerrada posterior vuelve a tocar el hueco.
- iFVG: un FVG que una vela cerrada posterior atraviesa por cierre (alcista: cierre bajo su piso; bajista: cierre sobre
  su techo). Desde ese cierre la zona se lee del lado contrario. Queda invalidado si otro cierre la atraviesa de vuelta.
- BPR: la superposición de un FVG con uno de sentido contrario formado hasta 20 velas antes. Lado: el del FVG más nuevo.
  Queda invalidado cuando un cierre lo atraviesa en contra de su lado.
- Rango (premium/discount): con estructura alcista, desde el último pivote bajo confirmado hasta el máximo alcanzado
  después; bajista, desde el último pivote alto hasta el mínimo posterior; sin rupturas, entre los dos últimos pivotes.
  Equilibrio al 50 %. OTE: retroceso de 62 % a 79 % del tramo en el sentido de la estructura (alcista: medido desde el alto hacia
  abajo; bajista, desde el bajo hacia arriba). Sin rupturas en la ventana no hay OTE.
La ventana usa las últimas `cantidad` velas cerradas más un margen; al principio de la ventana el estado de la estructura
puede diferir del que daría una historia más larga (se informa en la nota).
"""
from __future__ import annotations

import numpy as np

from lab import smc as SMC

L_PIVOTE = 3
MIN_FVG_ATR = 0.25
MARGEN = 60
BPR_VELAS = 20
OTE = (0.62, 0.79)


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
    base = dict(simbolo=simbolo, temporalidad=tf, limite_ms=t_lim, pivotes=[], rupturas=[], estado_estructura=0, fvg=[], barridos=[], order_blocks=[], ifvg=[], bpr=[], rango=None,
                definiciones=[
                    f"Pivote: extremo con {L_PIVOTE} velas a cada lado; se conoce al cierre de la vela {L_PIVOTE} posterior.",
                    "BOS: el cierre rompe el último pivote a favor de la estructura. CHOCH: lo rompe en contra y la da vuelta.",
                    f"FVG: hueco entre la vela 1 y la 3 de al menos {MIN_FVG_ATR:g} × ATR(14), con la vela del medio a favor.",
                    "Barrido: una vela pasa el último pivote sin romperlo por cierre (cierra de vuelta del otro lado).",
                    "Order block: la última vela contraria en las 10 velas previas a una ruptura; mitigado cuando el precio vuelve a tocarlo.",
                    "iFVG: un FVG atravesado por cierre; desde ahí se lee del lado contrario. Invalidado si otro cierre lo atraviesa de vuelta.",
                    f"BPR: superposición de dos FVG de sentido contrario formados con hasta {BPR_VELAS} velas de diferencia.",
                    "Premium/discount: mitad del tramo vigente (último pivote a favor de la estructura hasta el extremo posterior). OTE: retroceso de 62 % a 79 % de ese tramo.",
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
    estado, alto, bajo, rupturas, barridos, obs = 0, None, None, [], [], []

    def bloque(i, lado):
        """Order block: la última vela contraria (bajista para una ruptura alcista) en las 10 velas previas a la ruptura."""
        for k in range(i - 1, max(-1, i - 11), -1):
            if (lado == "alcista" and c[k] < o[k]) or (lado == "bajista" and c[k] > o[k]):
                return k
        return None

    for i in range(n):
        if alto is not None and not alto["roto"] and c[i] > alto["precio"]:
            rupturas.append(dict(t=int(t[i]), tipo="CHOCH" if estado == -1 else "BOS", lado="alcista", nivel=alto["precio"], pivote_t=alto["t"]))
            alto["roto"], estado = True, 1
            k = bloque(i, "alcista")
            if k is not None:
                obs.append(dict(t=int(t[k]), lado="alcista", arriba=round(float(h[k]), 5), abajo=round(float(l[k]), 5), ruptura_t=int(t[i]), k=k, i=i))
        elif bajo is not None and not bajo["roto"] and c[i] < bajo["precio"]:
            rupturas.append(dict(t=int(t[i]), tipo="CHOCH" if estado == 1 else "BOS", lado="bajista", nivel=bajo["precio"], pivote_t=bajo["t"]))
            bajo["roto"], estado = True, -1
            k = bloque(i, "bajista")
            if k is not None:
                obs.append(dict(t=int(t[k]), lado="bajista", arriba=round(float(h[k]), 5), abajo=round(float(l[k]), 5), ruptura_t=int(t[i]), k=k, i=i))
        else:
            # barrido: la vela pasa el pivote y cierra de vuelta del otro lado (cada pivote se barre una vez)
            if alto is not None and not alto["roto"] and not alto.get("barrido") and h[i] > alto["precio"] >= c[i]:
                barridos.append(dict(t=int(t[i]), lado="arriba", nivel=alto["precio"], pivote_t=alto["t"]))
                alto["barrido"] = True
            if bajo is not None and not bajo["roto"] and not bajo.get("barrido") and l[i] < bajo["precio"] <= c[i]:
                barridos.append(dict(t=int(t[i]), lado="abajo", nivel=bajo["precio"], pivote_t=bajo["t"]))
                bajo["barrido"] = True
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
        fvg.append(dict(t=int(t[j]), lado=lado, arriba=round(float(arriba), 5), abajo=round(float(abajo), 5), conocido_ms=int(t[j] + tf_ms), mitigada_ms=mitigada, j=j))

    def cierre_en_contra(desde_i, lado, arriba, abajo):
        """Primera vela cerrada desde `desde_i` que cierra del otro lado de la zona (en contra de `lado`)."""
        for q in range(desde_i, n):
            if (lado == "alcista" and c[q] < abajo) or (lado == "bajista" and c[q] > arriba):
                return q
        return None

    ifvg = []
    for z in fvg:
        q = cierre_en_contra(z["j"] + 1, z["lado"], z["arriba"], z["abajo"])
        if q is None:
            continue
        nuevo = "bajista" if z["lado"] == "alcista" else "alcista"
        inv = cierre_en_contra(q + 1, nuevo, z["arriba"], z["abajo"])
        ifvg.append(dict(t=int(t[q]), lado=nuevo, arriba=z["arriba"], abajo=z["abajo"], fvg_t=z["t"], conocido_ms=int(t[q] + tf_ms),
                         invalidado_ms=None if inv is None else int(t[inv] + tf_ms)))

    bpr, usados = [], set()
    for b in fvg:
        for a in reversed([x for x in fvg if x["lado"] != b["lado"] and b["j"] - BPR_VELAS <= x["j"] < b["j"] and x["t"] not in usados]):
            arriba, abajo = min(a["arriba"], b["arriba"]), max(a["abajo"], b["abajo"])
            if arriba > abajo:
                usados.add(a["t"])
                inv = cierre_en_contra(b["j"] + 1, b["lado"], arriba, abajo)
                bpr.append(dict(t=b["t"], lado=b["lado"], arriba=arriba, abajo=abajo, fvg_previo_t=a["t"], conocido_ms=b["conocido_ms"],
                                invalidado_ms=None if inv is None else int(t[inv] + tf_ms)))
                break

    rango = None
    if alto is not None and bajo is not None:
        # el tramo vigente: desde el último pivote confirmado a favor de la estructura hasta el extremo alcanzado después
        a_, a_t, b_, b_t = alto["precio"], alto["t"], bajo["precio"], bajo["t"]
        if estado == 1:
            jb = int(np.searchsorted(t, b_t))
            k = jb + int(np.argmax(h[jb:]))
            a_, a_t = float(h[k]), int(t[k])
        elif estado == -1:
            ja = int(np.searchsorted(t, a_t))
            k = ja + int(np.argmin(l[ja:]))
            b_, b_t = float(l[k]), int(t[k])
        if a_ > b_:
            d = a_ - b_
            ote = (a_ - OTE[1] * d, a_ - OTE[0] * d) if estado == 1 else (b_ + OTE[0] * d, b_ + OTE[1] * d) if estado == -1 else None
            eq = (a_ + b_) / 2
            rango = dict(alto=round(a_, 5), alto_t=a_t, bajo=round(b_, 5), bajo_t=b_t, equilibrio=round(eq, 5),
                         ote_abajo=None if ote is None else round(ote[0], 5), ote_arriba=None if ote is None else round(ote[1], 5),
                         sentido="alcista" if estado == 1 else "bajista" if estado == -1 else None,
                         zona_precio="premium" if c[-1] > eq else "discount" if c[-1] < eq else "equilibrio")

    order_blocks = []
    for b in obs:
        mit = None
        for q in range(b["i"] + 1, n):
            if (b["lado"] == "alcista" and l[q] <= b["arriba"]) or (b["lado"] == "bajista" and h[q] >= b["abajo"]):
                mit = int(t[q] + tf_ms)
                break
        order_blocks.append(dict(t=b["t"], lado=b["lado"], arriba=b["arriba"], abajo=b["abajo"], ruptura_t=b["ruptura_t"],
                                 conocido_ms=int(b["ruptura_t"] + tf_ms), mitigado_ms=mit))
    base.update(
        barridos=[x for x in barridos if x["t"] >= desde],
        order_blocks=[x for x in order_blocks if x["t"] >= desde],
        pivotes=[dict(t=int(t[j]), tipo=tipo, precio=round(precio, 5), confirmado_ms=int(t[j + L_PIVOTE] + tf_ms)) for j, tipo, precio in piv if t[j] >= desde],
        rupturas=[r for r in rupturas if r["t"] >= desde],
        estado_estructura=estado,
        fvg=[{k: v for k, v in z.items() if k != "j"} for z in fvg if z["t"] >= desde],
        ifvg=sorted((z for z in ifvg if z["t"] >= desde), key=lambda z: z["t"]),
        bpr=[z for z in bpr if z["t"] >= desde],
        rango=rango,
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
