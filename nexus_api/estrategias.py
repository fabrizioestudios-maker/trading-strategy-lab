"""
E022 (oro D1: ruptura de Bollinger a favor de la SMA 200) definida una sola vez para NEXUS.

Es la misma regla de experimentos/E022, E042 y F002 (BITACORA entradas 18–19, 34–35):
- vela diaria con cierre 17:00 de Nueva York (`lab.datos.velas(m1, 1440)`);
- compra en el primer cierre sobre la banda superior de Bollinger (20, 2 desvíos poblacionales) con el cierre sobre la
  SMA 200; venta al revés;
- entrada en el minuto siguiente al cierre o, con la lección de E042, en el primer minuto desde las 18:15 NY;
- SL 0,5·ATR(14) de Wilder y TP 2·SL; una operación a la vez; SL primero si SL y TP caen en el mismo minuto
  (`lab/motor.py`).

Para el replay, todo se calcula con velas diarias cerradas antes del límite (prefijo de la serie): nunca con datos
posteriores. tests/test_nexus_estrategias.py comprueba que el resultado no cambia al agregar datos futuros.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from lab import datos as LD, senales as S

from . import sesiones as SE

ID = "e022"
VERSION = "1.0"
PARAMS = dict(largo=20, desvios=2.0, sma=200, atr=14, k_sl=0.5, rr=2.0)
NIVEL = "B · candidata"
NIVEL_FUENTE = "docs/fichas.md y docs/criterios_v2.md (27/11/2026)"


def ruptura(c, n=20, k=2.0):
    m = S.sma(c, n)
    sd = pd.Series(c).rolling(n, min_periods=n).std(ddof=0).values
    bs, bi = m + k * sd, m - k * sd
    prev = lambda x: np.concatenate([[np.nan], x[:-1]])  # noqa: E731
    sen = np.where((c > bs) & ~(prev(c) > prev(bs)), 1, np.where((c < bi) & ~(prev(c) < prev(bi)), -1, 0))
    return sen, bs, bi, m


def senales(d1: dict) -> np.ndarray:
    """+1 / -1 / 0 por vela diaria (cerrada), con el filtro de la SMA 200. Causal: usa solo velas hasta cada una."""
    s, *_ = ruptura(np.asarray(d1["c"], float), PARAMS["largo"], PARAMS["desvios"])
    return np.where(s == S.sobre_sma(d1, PARAMS["sma"]), s, 0)


def _prefijo(serie, b: int) -> dict:
    return dict(t=serie.t[:b + 1], o=serie.o[:b + 1], h=serie.h[:b + 1], l=serie.l[:b + 1], c=np.asarray(serie.c[:b + 1], float))


def ultima_diaria_cerrada(svc, simbolo: str, limite_ms: int) -> int:
    """Índice de la última vela diaria cerrada en el límite (-1 si ninguna). Se decide por el calendario (cierre de las
    17:00 NY), nunca mirando si existen minutos posteriores en los datos."""
    j = svc.indice_limite(simbolo, limite_ms)
    if j < 0:
        return -1
    d1 = svc.serie(simbolo, 1440)
    k = int(np.searchsorted(d1.i0, j, side="right")) - 1  # vela diaria que contiene el último minuto revelado
    t_lim = int(svc.m1(simbolo)["t"][j])
    return k if svc.cerrada_por_calendario(1440, int(d1.t[k]), t_lim) else k - 1


def panel(svc, simbolo: str, limite_ms: int) -> dict:
    base = dict(estrategia="E022 · Oro D1 Bollinger + SMA 200", version=VERSION, nivel=f"{NIVEL} ({NIVEL_FUENTE})")
    if simbolo != "XAUUSD":
        return dict(base, vela_diaria_ms=None, condiciones=[], decision="sin_datos",
                    explicacion="E022 está definida y probada solo para XAUUSD.")
    b = ultima_diaria_cerrada(svc, simbolo, limite_ms)
    d1 = svc.serie(simbolo, 1440)
    if b < PARAMS["sma"]:
        return dict(base, vela_diaria_ms=int(d1.t[b]) if b >= 0 else None, condiciones=[], decision="sin_datos",
                    explicacion=f"Hacen falta {PARAMS['sma']} velas diarias cerradas para la SMA; hay {max(b + 1, 0)}.")
    p = _prefijo(d1, b)
    c = p["c"]
    s, bs, bi, _ = ruptura(c, PARAMS["largo"], PARAMS["desvios"])
    sma = S.sma(c, PARAMS["sma"])
    atr = LD.atr(p, PARAMS["atr"])
    arriba = bool(c[b] > bs[b] and not (c[b - 1] > bs[b - 1]))
    abajo = bool(c[b] < bi[b] and not (c[b - 1] < bi[b - 1]))
    sobre, bajo = bool(c[b] > sma[b]), bool(c[b] < sma[b])
    f = lambda x: f"{float(x):.2f}"  # noqa: E731
    cond = [
        dict(clave="cierre", texto="Cierre diario (17:00 NY)", cumple=None, valor=f(c[b])),
        dict(clave="ruptura_arriba", texto="Primer cierre sobre la banda superior (20, 2)", cumple=arriba, valor=f(bs[b])),
        dict(clave="ruptura_abajo", texto="Primer cierre bajo la banda inferior (20, 2)", cumple=abajo, valor=f(bi[b])),
        dict(clave="sobre_sma", texto="Cierre sobre la SMA 200", cumple=sobre, valor=f(sma[b])),
        dict(clave="bajo_sma", texto="Cierre bajo la SMA 200", cumple=bajo, valor=f(sma[b])),
        dict(clave="atr", texto="ATR(14) diario", cumple=None, valor=f(atr[b])),
    ]
    sl = PARAMS["k_sl"] * float(atr[b])
    cierre_ms = int(svc.m1(simbolo)["t"][int(d1.i1[b])]) + 60000
    if arriba and sobre:
        dec, txt = "compra", "Señal de compra al cierre diario: primer cierre sobre la banda superior, a favor de la SMA 200."
    elif abajo and bajo:
        dec, txt = "venta", "Señal de venta al cierre diario: primer cierre bajo la banda inferior, a favor de la SMA 200."
    else:
        dec, txt = "espera", "Sin señal en la última vela diaria cerrada."
    out = dict(base, vela_diaria_ms=int(d1.t[b]), condiciones=cond, decision=dec, explicacion=txt)
    if dec != "espera":
        out.update(stop_distancia=round(sl, 2), objetivo_distancia=round(PARAMS["rr"] * sl, 2),
                   entrada_prevista=SE.proxima_entrada_1815(cierre_ms))
    return out


def eventos(svc, simbolo: str, desde_ms: int, limite_ms: int) -> list[dict]:
    """Señales de E022 cuyo cierre diario ocurrió entre desde_ms y el límite (calculadas sin datos posteriores)."""
    if simbolo != "XAUUSD":
        return []
    b = ultima_diaria_cerrada(svc, simbolo, limite_ms)
    if b < PARAMS["sma"]:
        return []
    d1 = svc.serie(simbolo, 1440)
    p = _prefijo(d1, b)
    s = senales(p)
    t_m1 = svc.m1(simbolo)["t"]
    out = []
    for k in np.flatnonzero(s != 0):
        cierre = int(t_m1[int(d1.i1[k])]) + 60000
        if desde_ms <= cierre <= limite_ms + 60000:
            lado = "compra" if s[k] > 0 else "venta"
            out.append(dict(t=cierre, tipo="senal", lado=lado, titulo=f"E022 · señal de {lado}",
                            detalle=f"Cierre diario {SE.texto_ny(cierre)}. Entrada prevista: {SE.proxima_entrada_1815(cierre)}."))
    return out


def operaciones(m1: dict, entrada: str, desde_ms: int, hasta_ms: int) -> pd.DataFrame:
    """Operaciones de E022 con costos de docs/costos.md (r) — mismo cálculo que experimentos/E042 (una a la vez)."""
    from lab import eventos as EV, motor

    v = LD.velas(m1, 1440)
    atr = LD.atr(v, PARAMS["atr"])
    s = senales(v)
    nb = len(v["t"])
    sel = np.flatnonzero((s != 0) & ~np.isnan(atr) & (v["t"] >= desde_ms) & (v["t"] < hasta_ms) & (np.arange(nb) < nb - 1))
    ie = v["i1"][sel] + 1
    if entrada == "18:15":
        tm = (EV.minuto_ny(m1["t"]) - 1020) % 1440  # minutos desde las 17:00 NY
        ie = np.array([i + int(np.argmax(tm[i:i + 600] >= 75)) if (tm[i:i + 600] >= 75).any() else i for i in ie], np.int64)
    d = s[sel].astype(np.int64)
    ent = m1["o"][ie]
    riesgo = PARAMS["k_sl"] * atr[sel]
    o = motor.simular(m1, ie, d, ent - d * riesgo, ent + d * PARAMS["rr"] * riesgo, LD.costo("XAUUSD", ent))
    m = o["motivo"] != 3
    return pd.DataFrame({k: o[k][m] for k in ("t", "t_salida", "dir", "entrada", "salida", "sl", "motivo", "r")})


def definicion() -> dict:
    return dict(
        id=ID, version=VERSION, nombre="Oro D1 · ruptura de Bollinger a favor de la SMA 200 (E022)",
        hipotesis="Después de una ruptura de volatilidad a favor de la tendencia larga, el oro tiene momentum de corto plazo.",
        temporalidad="D1 (cierre 17:00 NY), ejecución con velas de 1 minuto",
        parametros=[
            dict(clave="largo", nombre="Bollinger: largo", valor=20, unidad="velas", definicion="Media y desvío de 20 cierres diarios"),
            dict(clave="desvios", nombre="Bollinger: desvíos", valor=2.0, unidad="σ", definicion="Desvío poblacional (ddof = 0)"),
            dict(clave="sma", nombre="Filtro de tendencia", valor=200, unidad="velas", definicion="Cierre sobre/bajo la SMA 200 diaria"),
            dict(clave="k_sl", nombre="Stop", valor=0.5, unidad="× ATR(14)", definicion="ATR de Wilder de 14 velas diarias"),
            dict(clave="rr", nombre="Objetivo", valor=2.0, unidad="× stop", definicion="TP fijo a 2 veces la distancia del stop"),
        ],
        reglas=[
            "Señal al cierre de la vela diaria (17:00 NY): primer cierre fuera de Bollinger (20, 2) del lado de la SMA 200.",
            "Entrada a mercado desde las 18:15 NY (E042: evita el bid deprimido de la reapertura).",
            "Stop 0,5 × ATR(14) y objetivo 2 × stop; una operación a la vez.",
            "Si el stop y el objetivo caen en el mismo minuto, cuenta el stop (supuesto pesimista).",
        ],
        nivel="B", nivel_texto="Candidata: no está validada. Le falta un período limpio (pruebas a futuro F001 y F002 desde el 27/11/2026).",
        evidencia=[
            "Con la entrada de estas reglas (18:15 NY) y costos base: 168 operaciones, 45,2 % de acierto, +0,30 R por operación (E042; es la corrida que muestran Resumen y Analítica).",
            "Definición original, entrada en la reapertura de las 17:00 NY: +0,41 R, IC 95 % [+0,18; +0,64] (docs/fichas.md). Parte de esa diferencia era el bid deprimido de la reapertura.",
            "Le gana a entradas al azar del mismo lado (p = 0,0005); IR de tasación 0,85 sobre el oro y el risk parity.",
        ],
        limitaciones=[
            "Elegida entre 185.367 configuraciones (E019): DSR 0,24.",
            "Walk-forward principal con razón prueba/elección 0,34.",
            "Unas 11 operaciones por año: la prueba a futuro tarda unos 3 años en llegar a 30.",
            "Solo oro; datos bid de HistData + Dukascopy.",
        ],
        fuentes=["BITACORA.md entradas 18–19, 34–38", "docs/fichas.md", "experimentos/E022_*.py, E042, F002", "registro/forward/F002.json"],
        ejecutable=True,
    )


def niveles(svc, simbolo: str, limite_ms: int) -> list[dict]:
    """Máximo y mínimo del día anterior (PDH/PDL) y de la semana anterior (PWH/PWL), con velas diarias cerradas.
    Semana = días de operación (cierre 17:00 NY) agrupados por semana ISO del día de operación."""
    b = ultima_diaria_cerrada(svc, simbolo, limite_ms)
    if b < 1:
        return []
    d1 = svc.serie(simbolo, 1440)
    t_m1 = svc.m1(simbolo)["t"]
    nota = "Descriptivo: un nivel dibujado no es evidencia de ventaja (E035b: el barrido no predijo la reversión)."
    cierre = lambda k: int(t_m1[int(d1.i1[k])]) + 60000  # noqa: E731
    out = [dict(clave="pdh", nombre="Máximo del día anterior", precio=round(float(d1.h[b]), 2), conocido_desde_ms=cierre(b), nota=nota),
           dict(clave="pdl", nombre="Mínimo del día anterior", precio=round(float(d1.l[b]), 2), conocido_desde_ms=cierre(b), nota=nota)]
    a = max(0, b - 15)
    dia_op = pd.to_datetime(np.asarray(d1.t[a:b + 1]) + 7 * 3600000, unit="ms", utc=True).tz_convert("America/New_York")
    semana = np.array([d.isocalendar()[0] * 100 + d.isocalendar()[1] for d in dia_op])
    t_sig = int(t_m1[svc.indice_limite(simbolo, limite_ms)])
    sem_actual = pd.Timestamp(t_sig + 7 * 3600000, unit="ms", tz="UTC").tz_convert("America/New_York").isocalendar()
    actual = sem_actual[0] * 100 + sem_actual[1]
    previas = sorted(set(semana[semana < actual]))
    if previas:
        sel = np.flatnonzero(semana == previas[-1]) + a
        ult = int(sel.max())
        out += [dict(clave="pwh", nombre="Máximo de la semana anterior", precio=round(float(d1.h[sel].max()), 2), conocido_desde_ms=cierre(ult), nota=nota),
                dict(clave="pwl", nombre="Mínimo de la semana anterior", precio=round(float(d1.l[sel].min()), 2), conocido_desde_ms=cierre(ult), nota=nota)]
    return out
