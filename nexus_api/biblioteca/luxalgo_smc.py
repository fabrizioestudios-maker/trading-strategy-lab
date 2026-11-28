"""
Smart Money Concepts [LuxAlgo], portado de Pine Script a Python para el gráfico de NEXUS.

Original: «Smart Money Concepts» © LuxAlgo, https://www.luxalgo.com/library/indicator/smart-money-concepts-smc/
Licencia del original y de este port: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
(CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/). Uso NO comercial; cualquier cambio se
comparte con la misma licencia. Código fuente original: pine/terceros/luxalgo_smart_money_concepts.pine.

El port sigue la lógica vela por vela del original (piernas con `leg(size)`, pivotes, cruces del cierre, order
blocks con el filtro de velas volátiles, EQH/EQL con ATR(200), FVG con umbral automático, extremos móviles y zonas
premium/discount). Diferencias:
- se calcula solo sobre velas cerradas hasta el límite del replay (no hay vela en tiempo real);
- los niveles MTF (día/semana/mes anteriores) no se repiten: NEXUS ya los muestra (PDH/PDL/PWH/PWL);
- los order blocks mitigados se quitan todos en la misma vela (el original, al borrar dentro del bucle, puede
  dejar uno para la vela siguiente);
- los colores son los del original y no se editan.
"""
from __future__ import annotations

import math

import numpy as np

from .base import Definicion, Parametro, Salida, rango_verdadero, rma

LICENCIA = "CC BY-NC-SA 4.0 (uso no comercial) · © LuxAlgo"
FUENTE = "https://www.luxalgo.com/library/indicator/smart-money-concepts-smc/"

VERDE, ROJO, AZUL, GRIS = "#089981", "#F23645", "#2157f3", "#878b94"
MONO_ALZA, MONO_BAJA = "#b2b5be", "#5d606b"
ALCISTA, BAJISTA = 1, -1
PIERNA_ALCISTA, PIERNA_BAJISTA = 1, 0


def _rgba(hexa: str, transparencia: int) -> str:
    """Color de Pine con transparencia 0–100 (100 = invisible) a rgba."""
    h = hexa.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{round(1 - transparencia / 100, 2)})"


def _ok(x) -> bool:
    return x is not None and not (isinstance(x, float) and math.isnan(x))


class _Pivote:
    __slots__ = ("actual", "anterior", "cruzado", "t", "i")

    def __init__(self, t0):
        self.actual = math.nan
        self.anterior = math.nan
        self.cruzado = False
        self.t = t0
        self.i = 0


def _P(id, nombre, tipo, defecto, grupo, **kw):
    return Parametro(id=id, nombre=nombre, tipo=tipo, defecto=defecto, grupo=grupo, **kw)


TODO, BOS, CHOCH = "Todas", "BOS", "CHoCH"
PARAMETROS = [
    _P("modo", "Modo", "opcion", "Histórico", "Smart Money Concepts", opciones=["Histórico", "Presente"], ayuda="Toda la estructura o solo la más reciente"),
    _P("estilo", "Estilo", "opcion", "Color", "Smart Money Concepts", opciones=["Color", "Monocromo"]),
    _P("velas_color", "Colorear velas", "booleano", False, "Smart Money Concepts", ayuda="Velas con el color de la tendencia interna"),
    _P("interna", "Estructura interna", "booleano", True, "Estructura interna"),
    _P("interna_alza", "Estructura alcista", "opcion", TODO, "Estructura interna", opciones=[TODO, BOS, CHOCH]),
    _P("interna_baja", "Estructura bajista", "opcion", TODO, "Estructura interna", opciones=[TODO, BOS, CHOCH]),
    _P("confluencia", "Filtro de confluencia", "booleano", False, "Estructura interna", ayuda="Quita rupturas internas poco significativas"),
    _P("swing", "Estructura swing", "booleano", True, "Estructura swing"),
    _P("swing_alza", "Estructura alcista", "opcion", TODO, "Estructura swing", opciones=[TODO, BOS, CHOCH]),
    _P("swing_baja", "Estructura bajista", "opcion", TODO, "Estructura swing", opciones=[TODO, BOS, CHOCH]),
    _P("puntos", "Puntos swing (HH/HL/LH/LL)", "booleano", False, "Estructura swing"),
    _P("largo_swing", "Longitud swing", "entero", 50, "Estructura swing", minimo=10, maximo=200),
    _P("fuertes", "Máximos/mínimos fuertes y débiles", "booleano", True, "Estructura swing"),
    _P("ob_internos", "Order blocks internos", "booleano", True, "Order blocks"),
    _P("cant_ob_internos", "Cantidad internos", "entero", 5, "Order blocks", minimo=1, maximo=20),
    _P("ob_swing", "Order blocks swing", "booleano", False, "Order blocks"),
    _P("cant_ob_swing", "Cantidad swing", "entero", 5, "Order blocks", minimo=1, maximo=20),
    _P("filtro_ob", "Filtro de order blocks", "opcion", "ATR", "Order blocks", opciones=["ATR", "Rango medio acumulado"]),
    _P("mitigacion_ob", "Mitigación", "opcion", "Máx./Mín.", "Order blocks", opciones=["Cierre", "Máx./Mín."]),
    _P("iguales", "Máximos/mínimos iguales", "booleano", True, "EQH/EQL"),
    _P("conf_iguales", "Velas de confirmación", "entero", 3, "EQH/EQL", minimo=1, maximo=50),
    _P("umbral_iguales", "Umbral", "decimal", 0.1, "EQH/EQL", minimo=0, maximo=0.5, paso=0.1),
    _P("fvg", "Fair value gaps", "booleano", False, "Fair value gaps"),
    _P("fvg_auto", "Umbral automático", "booleano", True, "Fair value gaps"),
    _P("fvg_extender", "Extender (velas)", "entero", 1, "Fair value gaps", minimo=0, maximo=500),
    _P("premium", "Zonas premium/discount", "booleano", False, "Premium/discount"),
]


def calcular(v: dict, p: dict) -> Salida:
    o, h, l, c, t = v["o"], v["h"], v["l"], v["c"], v["t"]
    n = len(c)
    sal = Salida()
    if n < 3:
        return sal
    mono = p["estilo"] == "Monocromo"
    presente = p["modo"] == "Presente"
    c_alza = MONO_ALZA if mono else VERDE
    c_baja = MONO_BAJA if mono else ROJO
    tf_ms = int(np.median(np.diff(t))) if n > 1 else 60_000

    tr = rango_verdadero(h, l, c)
    atr = rma(tr, 200)
    cum_tr = np.cumsum(tr)
    with np.errstate(divide="ignore", invalid="ignore"):
        vol = atr if p["filtro_ob"] == "ATR" else cum_tr / np.arange(n)
    alta_vol = np.where(np.isfinite(vol), (h - l) >= 2 * vol, False)
    p_alto = np.where(alta_vol, l, h)
    p_bajo = np.where(alta_vol, h, l)
    mit_baja = c if p["mitigacion_ob"] == "Cierre" else h
    mit_alza = c if p["mitigacion_ob"] == "Cierre" else l

    piv = {k: _Pivote(int(t[0])) for k in ("swing_alto", "swing_bajo", "int_alto", "int_bajo", "eq_alto", "eq_bajo")}
    tendencia = {"swing": 0, "interna": 0}
    piernas = {}  # tamaño → (pierna actual, pierna anterior)
    tray = dict(arriba=math.nan, abajo=math.nan, t=int(t[0]), i=0, t_arriba=int(t[0]), t_abajo=int(t[0]))
    obs = {"interna": [], "swing": []}
    fvgs = []
    estructuras, iguales, puntos = [], [], []
    prev_nivel = {}
    cum_delta = 0.0
    colores = [None] * n if p["velas_color"] else None

    def pierna(tam, i):
        actual, _ = piernas.get(tam, (PIERNA_BAJISTA, None))
        nuevo = actual
        if i >= tam:
            ventana_h, ventana_l = h[i - tam + 1:i + 1], l[i - tam + 1:i + 1]
            if h[i - tam] > ventana_h.max():
                nuevo = PIERNA_BAJISTA
            elif l[i - tam] < ventana_l.min():
                nuevo = PIERNA_ALCISTA
        previo = actual if i > 0 else None
        piernas[tam] = (nuevo, previo)
        return nuevo, previo

    def estructura_actual(tam, i, igual=False, interna=False):
        actual, previo = pierna(tam, i)
        if previo is None or actual == previo or i < tam:
            return
        j = i - tam
        if actual - previo == 1:  # empieza pierna alcista: pivote bajo
            pv = piv["eq_bajo"] if igual else piv["int_bajo"] if interna else piv["swing_bajo"]
            if igual and _ok(pv.actual) and np.isfinite(atr[i]) and abs(pv.actual - l[j]) < p["umbral_iguales"] * atr[i]:
                iguales.append(dict(tipo="EQL", t0=pv.t, p0=pv.actual, t1=int(t[j]), p1=float(l[j]), i0=pv.i, i1=j))
            pv.anterior, pv.actual, pv.cruzado, pv.t, pv.i = pv.actual, float(l[j]), False, int(t[j]), j
            if not igual and not interna:
                tray.update(abajo=pv.actual, t=pv.t, i=pv.i, t_abajo=pv.t)
                puntos.append(dict(t=pv.t, precio=pv.actual, texto="LL" if _ok(pv.anterior) and pv.actual < pv.anterior else "HL", alto=False))
        else:  # empieza pierna bajista: pivote alto
            pv = piv["eq_alto"] if igual else piv["int_alto"] if interna else piv["swing_alto"]
            if igual and _ok(pv.actual) and np.isfinite(atr[i]) and abs(pv.actual - h[j]) < p["umbral_iguales"] * atr[i]:
                iguales.append(dict(tipo="EQH", t0=pv.t, p0=pv.actual, t1=int(t[j]), p1=float(h[j]), i0=pv.i, i1=j))
            pv.anterior, pv.actual, pv.cruzado, pv.t, pv.i = pv.actual, float(h[j]), False, int(t[j]), j
            if not igual and not interna:
                tray.update(arriba=pv.actual, t=pv.t, i=pv.i, t_arriba=pv.t)
                puntos.append(dict(t=pv.t, precio=pv.actual, texto="HH" if _ok(pv.anterior) and pv.actual > pv.anterior else "LH", alto=True))

    def guardar_ob(pv, i, interna, sesgo):
        if pv.i >= i:
            return
        if sesgo == BAJISTA:
            tramo = p_alto[pv.i:i]
            k = pv.i + int(np.argmax(tramo))
        else:
            tramo = p_bajo[pv.i:i]
            k = pv.i + int(np.argmin(tramo))
        lista_ob = obs["interna" if interna else "swing"]
        if len(lista_ob) >= 100:
            lista_ob.pop()
        lista_ob.insert(0, dict(arriba=float(p_alto[k]), abajo=float(p_bajo[k]), t=int(t[k]), sesgo=sesgo, creado=int(t[i])))

    def mostrar(i, interna):
        clave = "interna" if interna else "swing"
        alza_ok = baja_ok = True
        if interna and p["confluencia"]:
            alza_ok = h[i] - max(c[i], o[i]) > min(c[i], o[i] - l[i])
            baja_ok = h[i] - max(c[i], o[i]) < min(c[i], o[i] - l[i])
        for lado in ("alto", "bajo"):
            pv = piv[("int_" if interna else "swing_") + lado]
            ref = piv["swing_" + lado]
            nivel = pv.actual
            k = (clave, lado)
            antes = prev_nivel.get(k, math.nan)
            prev_nivel[k] = nivel
            if lado == "alto":
                extra = (_ok(pv.actual) and _ok(ref.actual) and pv.actual != ref.actual and alza_ok) if interna else True
                cruce = _ok(nivel) and c[i] > nivel and i > 0 and _ok(antes) and c[i - 1] <= antes
                if cruce and not pv.cruzado and extra:
                    tag = CHOCH if tendencia[clave] == BAJISTA else BOS
                    pv.cruzado = True
                    tendencia[clave] = ALCISTA
                    filtro = p["interna_alza" if interna else "swing_alza"]
                    if (p["interna"] if interna else p["swing"]) and (filtro == TODO or filtro == tag):
                        estructuras.append(dict(interna=interna, alza=True, tag=tag, t0=pv.t, t1=int(t[i]), nivel=nivel, i0=pv.i, i1=i))
                    if p["ob_internos" if interna else "ob_swing"]:
                        guardar_ob(pv, i, interna, ALCISTA)
            else:
                extra = (_ok(pv.actual) and _ok(ref.actual) and pv.actual != ref.actual and baja_ok) if interna else True
                cruce = _ok(nivel) and c[i] < nivel and i > 0 and _ok(antes) and c[i - 1] >= antes
                if cruce and not pv.cruzado and extra:
                    tag = CHOCH if tendencia[clave] == ALCISTA else BOS
                    pv.cruzado = True
                    tendencia[clave] = BAJISTA
                    filtro = p["interna_baja" if interna else "swing_baja"]
                    if (p["interna"] if interna else p["swing"]) and (filtro == TODO or filtro == tag):
                        estructuras.append(dict(interna=interna, alza=False, tag=tag, t0=pv.t, t1=int(t[i]), nivel=nivel, i0=pv.i, i1=i))
                    if p["ob_internos" if interna else "ob_swing"]:
                        guardar_ob(pv, i, interna, BAJISTA)

    for i in range(n):
        # extremos móviles (strong/weak high/low y premium/discount)
        if p["fuertes"] or p["premium"]:
            if _ok(tray["arriba"]):
                tray["arriba"] = max(h[i], tray["arriba"])
                if tray["arriba"] == h[i]:
                    tray["t_arriba"] = int(t[i])
            if _ok(tray["abajo"]):
                tray["abajo"] = min(l[i], tray["abajo"])
                if tray["abajo"] == l[i]:
                    tray["t_abajo"] = int(t[i])
        # FVG mitigados se borran antes de buscar nuevos
        if p["fvg"]:
            fvgs[:] = [z for z in fvgs if not ((z["sesgo"] == ALCISTA and l[i] < z["abajo"]) or (z["sesgo"] == BAJISTA and h[i] > z["arriba"]))]
        estructura_actual(p["largo_swing"], i)
        estructura_actual(5, i, interna=True)
        if p["iguales"]:
            estructura_actual(p["conf_iguales"], i, igual=True)
        if p["interna"] or p["ob_internos"] or p["velas_color"]:
            mostrar(i, True)
        if p["swing"] or p["ob_swing"] or p["fuertes"]:
            mostrar(i, False)
        for clave in ("interna", "swing"):
            obs[clave][:] = [b for b in obs[clave] if not ((b["sesgo"] == BAJISTA and mit_baja[i] > b["arriba"]) or (b["sesgo"] == ALCISTA and mit_alza[i] < b["abajo"]))]
        if p["fvg"] and i >= 1:
            # ta.cum del original suma desde la vela 1 (en la 0 el valor es na)
            delta = (c[i - 1] - o[i - 1]) / (o[i - 1] * 100)
            cum_delta += abs(delta)
        if p["fvg"] and i >= 2:
            umbral = cum_delta / i * 2 if p["fvg_auto"] else 0
            fin = int(t[i]) + p["fvg_extender"] * tf_ms
            if l[i] > h[i - 2] and c[i - 1] > h[i - 2] and delta > umbral:
                fvgs.insert(0, dict(sesgo=ALCISTA, arriba=float(l[i]), abajo=float(h[i - 2]), t0=int(t[i - 1]), t1=fin))
            if h[i] < l[i - 2] and c[i - 1] < l[i - 2] and -delta > umbral:
                fvgs.insert(0, dict(sesgo=BAJISTA, arriba=float(h[i]), abajo=float(l[i - 2]), t0=int(t[i - 1]), t1=fin))
        if colores is not None:
            colores[i] = c_alza if tendencia["interna"] == ALCISTA else c_baja

    # ------------------------------------------------------------------ dibujo (solo lo que sigue a la vista)
    desde = int(v.get("desde_ms", t[0]))
    medio = lambda i0, i1: int(t[min(n - 1, round(0.5 * (i0 + i1)))])  # noqa: E731
    if presente:
        ult = {}
        for e in estructuras:
            ult[(e["interna"], e["alza"])] = e
        estructuras = list(ult.values())
    for e in estructuras:
        if e["t1"] < desde:
            continue
        color = c_alza if e["alza"] else c_baja
        if e["interna"] and not mono:
            color = VERDE if e["alza"] else ROJO
        sal.segmentos.append(dict(t0=e["t0"], p0=e["nivel"], t1=e["t1"], p1=e["nivel"], color=color, estilo="guiones" if e["interna"] else "solida",
                                  texto=e["tag"], t_texto=medio(e["i0"], e["i1"]), posicion="arriba" if e["alza"] else "abajo",
                                  tamano="chico" if e["interna"] else "normal"))
    if p["puntos"]:
        pts = puntos
        if presente:
            pts = [x for x in (next((y for y in reversed(puntos) if y["alto"]), None), next((y for y in reversed(puntos) if not y["alto"]), None)) if x]
        for x in pts:
            if x["t"] >= desde:
                sal.etiquetas.append(dict(t=x["t"], precio=x["precio"], texto=x["texto"], color=c_baja if x["alto"] else c_alza, posicion="arriba" if x["alto"] else "abajo"))
    if p["iguales"]:
        eqs = iguales
        if presente:
            eqs = [x for x in (next((y for y in reversed(iguales) if y["tipo"] == "EQH"), None), next((y for y in reversed(iguales) if y["tipo"] == "EQL"), None)) if x]
        for x in eqs:
            if x["t1"] < desde:
                continue
            alto = x["tipo"] == "EQH"
            sal.segmentos.append(dict(t0=x["t0"], p0=x["p0"], t1=x["t1"], p1=x["p1"], color=c_baja if alto else c_alza, estilo="puntos", texto=x["tipo"],
                                      t_texto=medio(x["i0"], x["i1"]), posicion="arriba" if alto else "abajo", tamano="chico"))
    for clave, mostrar_ob, cant in (("interna", p["ob_internos"], p["cant_ob_internos"]), ("swing", p["ob_swing"], p["cant_ob_swing"])):
        if not mostrar_ob:
            continue
        for b in obs[clave][:cant]:
            if mono:
                color = _rgba(MONO_BAJA if b["sesgo"] == BAJISTA else MONO_ALZA, 80)
            elif clave == "interna":
                color = _rgba("#f77c80" if b["sesgo"] == BAJISTA else "#3179f5", 80)
            else:
                color = _rgba("#b22833" if b["sesgo"] == BAJISTA else "#1848cc", 80)
            sal.cajas.append(dict(t0=b["t"], t1=None, arriba=b["arriba"], abajo=b["abajo"], color=color, borde=None if clave == "interna" else color,
                                  texto=None))
    if p["fvg"]:
        for z in fvgs:
            if z["t1"] < desde:
                continue
            color = _rgba(MONO_ALZA if mono and z["sesgo"] == ALCISTA else MONO_BAJA if mono else "#00ff68" if z["sesgo"] == ALCISTA else "#ff0008", 70)
            m = (z["arriba"] + z["abajo"]) / 2
            sal.cajas.append(dict(t0=z["t0"], t1=z["t1"], arriba=z["arriba"], abajo=m, color=color, borde=color, texto=None))
            sal.cajas.append(dict(t0=z["t0"], t1=z["t1"], arriba=m, abajo=z["abajo"], color=color, borde=color, texto=None))
    fin_t = int(t[-1]) + 20 * tf_ms
    if p["fuertes"] and _ok(tray["arriba"]) and _ok(tray["abajo"]):
        sesgo = tendencia["swing"]
        sal.segmentos.append(dict(t0=tray["t_arriba"], p0=tray["arriba"], t1=fin_t, p1=tray["arriba"], color=c_baja, estilo="solida",
                                  texto="Strong High" if sesgo == BAJISTA else "Weak High", t_texto=fin_t, posicion="arriba", tamano="chico"))
        sal.segmentos.append(dict(t0=tray["t_abajo"], p0=tray["abajo"], t1=fin_t, p1=tray["abajo"], color=c_alza, estilo="solida",
                                  texto="Strong Low" if sesgo == ALCISTA else "Weak Low", t_texto=fin_t, posicion="abajo", tamano="chico"))
    if p["premium"] and _ok(tray["arriba"]) and _ok(tray["abajo"]):
        a, b = tray["arriba"], tray["abajo"]
        prem, desc = (MONO_BAJA, MONO_ALZA) if mono else (ROJO, VERDE)
        sal.cajas.append(dict(t0=tray["t"], t1=None, arriba=a, abajo=0.95 * a + 0.05 * b, color=_rgba(prem, 80), borde=None, texto="Premium", posicion="arriba", color_texto=prem))
        sal.cajas.append(dict(t0=tray["t"], t1=None, arriba=0.525 * a + 0.475 * b, abajo=0.525 * b + 0.475 * a, color=_rgba(GRIS, 80), borde=None, texto="Equilibrium",
                              posicion="izq", color_texto=GRIS))
        sal.cajas.append(dict(t0=tray["t"], t1=None, arriba=0.95 * b + 0.05 * a, abajo=b, color=_rgba(desc, 80), borde=None, texto="Discount", posicion="abajo", color_texto=desc))
    if colores is not None:
        sal.colores_velas = colores
    return sal


DEFINICION = Definicion(
    "luxalgo_smc", "Smart Money Concepts [LuxAlgo]", "SMC", "Smart Money (LuxAlgo)", True,
    "Estructura interna y swing con BOS/CHoCH, order blocks, máximos y mínimos iguales (EQH/EQL), fair value gaps, "
    "máximos/mínimos fuertes y débiles, y zonas premium/discount. Port del indicador gratuito de LuxAlgo.",
    PARAMETROS, calcular, calentamiento=lambda p: 1500, autor="LuxAlgo", licencia=LICENCIA, fuente=FUENTE,
)
