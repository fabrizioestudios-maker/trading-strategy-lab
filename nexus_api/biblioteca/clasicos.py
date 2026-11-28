"""Indicadores clásicos (análisis técnico tradicional). Fórmulas estándar, como las de Pine/TradingView."""
from __future__ import annotations

import numpy as np

from .base import Definicion, Parametro, Salida, desvio, ema, lista, maximo, minimo, rango_verdadero, rma, sma, wma

ORO, AZUL, VIOLETA, VERDE, ROJO, GRIS, CIAN = "#e8a83a", "#5b9cf6", "#b07cf0", "#45c17e", "#e0533a", "#a9b2c1", "#3fc1c9"
FUENTES = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"]


def fuente(v, nombre):
    o, h, l, c = v["o"], v["h"], v["l"], v["c"]
    return {"close": c, "open": o, "high": h, "low": l, "hl2": (h + l) / 2, "hlc3": (h + l + c) / 3, "ohlc4": (o + h + l + c) / 4}[nombre]


def P(id, nombre, tipo, defecto, **kw):
    return Parametro(id=id, nombre=nombre, tipo=tipo, defecto=defecto, **kw)


def _fuente_param():
    return P("fuente", "Fuente", "opcion", "close", opciones=FUENTES, grupo="Entrada")


# ------------------------------------------------------------------ superpuestos al precio
def _ma(fn, corto):
    def calc(v, p):
        return Salida().linea(corto, lista(fn(fuente(v, p["fuente"]), p["periodo"])), p.get("color", ORO), 2)
    return calc


def _bb(v, p):
    x = fuente(v, p["fuente"])
    m, d = sma(x, p["periodo"]), desvio(x, p["periodo"])
    s = Salida().linea("Media", lista(m), ORO).linea("Superior", lista(m + p["desvios"] * d), AZUL).linea("Inferior", lista(m - p["desvios"] * d), AZUL)
    return s


def _donchian(v, p):
    a, b = maximo(v["h"], p["periodo"]), minimo(v["l"], p["periodo"])
    return Salida().linea("Superior", lista(a), AZUL).linea("Inferior", lista(b), AZUL).linea("Media", lista((a + b) / 2), ORO, 1, "guiones")


def _keltner(v, p):
    m = ema(v["c"], p["periodo"])
    a = rma(rango_verdadero(v["h"], v["l"], v["c"]), p["atr"])
    return Salida().linea("Media", lista(m), ORO).linea("Superior", lista(m + p["mult"] * a), AZUL).linea("Inferior", lista(m - p["mult"] * a), AZUL)


def _psar(v, p):
    h, l = v["h"], v["l"]
    n = len(h)
    out = np.full(n, np.nan)
    if n < 2:
        return Salida()
    alcista = h[1] >= h[0]
    sar = l[0] if alcista else h[0]
    ep = h[1] if alcista else l[1]
    af = p["inicio"]
    out[1] = sar
    for i in range(2, n):
        sar = sar + af * (ep - sar)
        if alcista:
            sar = min(sar, l[i - 1], l[i - 2])
            if l[i] < sar:
                alcista, sar, ep, af = False, ep, l[i], p["inicio"]
            elif h[i] > ep:
                ep, af = h[i], min(af + p["incremento"], p["maximo"])
        else:
            sar = max(sar, h[i - 1], h[i - 2])
            if h[i] > sar:
                alcista, sar, ep, af = True, ep, h[i], p["inicio"]
            elif l[i] < ep:
                ep, af = l[i], min(af + p["incremento"], p["maximo"])
        out[i] = sar
    return Salida().linea("SAR", lista(out), GRIS, 1, "puntos")


# ------------------------------------------------------------------ osciladores (panel propio)
def _rsi(v, p):
    x = fuente(v, p["fuente"])
    d = np.diff(x, prepend=np.nan)
    sube, baja = rma(np.where(np.isnan(d), np.nan, np.maximum(d, 0)), p["periodo"]), rma(np.where(np.isnan(d), np.nan, np.maximum(-d, 0)), p["periodo"])
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.where(baja == 0, 100.0, 100 - 100 / (1 + sube / baja))
    s = Salida().linea("RSI", lista(r, 4), VIOLETA)
    s.niveles = [dict(valor=p["sobrecompra"], color=GRIS), dict(valor=50, color="#5d606b"), dict(valor=p["sobreventa"], color=GRIS)]
    return s


def _macd(v, p):
    x = fuente(v, p["fuente"])
    m = ema(x, p["rapida"]) - ema(x, p["lenta"])
    s = _ema_desde(m, p["senal"])
    h = m - s
    out = Salida()
    colores = []
    for i, val in enumerate(h):
        if not np.isfinite(val):
            colores.append(None)
            continue
        prev = h[i - 1] if i and np.isfinite(h[i - 1]) else val
        colores.append(("#26a69a" if val >= prev else "#b2dfdb") if val >= 0 else ("#ffcdd2" if val >= prev else "#ff5252"))
    out.histogramas.append(dict(nombre="Histograma", valores=lista(h, 6), colores=colores))
    out.linea("MACD", lista(m), AZUL).linea("Señal", lista(s), ORO)
    out.niveles = [dict(valor=0, color="#5d606b")]
    return out


def _ema_desde(x, n):
    """EMA de una serie que empieza con NaN (como ta.ema sobre el MACD en Pine): arranca en el primer valor válido."""
    x = np.asarray(x, float)
    out = np.full(len(x), np.nan)
    ok = np.flatnonzero(np.isfinite(x))
    if len(ok) < n:
        return out
    a = 2 / (n + 1)
    i0 = ok[n - 1]
    out[i0] = np.mean(x[ok[0]:i0 + 1])
    for i in range(i0 + 1, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def _estocastico(v, p):
    hh, ll = maximo(v["h"], p["periodo"]), minimo(v["l"], p["periodo"])
    with np.errstate(divide="ignore", invalid="ignore"):
        k0 = 100 * (v["c"] - ll) / (hh - ll)
    k = sma(k0, p["suavizado_k"])
    d = sma(k, p["suavizado_d"])
    s = Salida().linea("%K", lista(k, 4), AZUL).linea("%D", lista(d, 4), ORO)
    s.niveles = [dict(valor=80, color=GRIS), dict(valor=20, color=GRIS)]
    return s


def _atr(v, p):
    return Salida().linea("ATR", lista(rma(rango_verdadero(v["h"], v["l"], v["c"]), p["periodo"])), ROJO)


def _adx(v, p):
    h, l, c = v["h"], v["l"], v["c"]
    arriba = np.r_[np.nan, h[1:] - h[:-1]]
    abajo = np.r_[np.nan, l[:-1] - l[1:]]
    mas = np.where((arriba > abajo) & (arriba > 0), arriba, 0.0)
    menos = np.where((abajo > arriba) & (abajo > 0), abajo, 0.0)
    mas[0] = menos[0] = np.nan
    tr = rma(rango_verdadero(h, l, c), p["periodo"])
    with np.errstate(divide="ignore", invalid="ignore"):
        di_mas = 100 * rma(mas, p["periodo"]) / tr
        di_menos = 100 * rma(menos, p["periodo"]) / tr
        suma = di_mas + di_menos
        dx = 100 * np.abs(di_mas - di_menos) / np.where(suma == 0, 1, suma)
    adx = rma(dx, p["suavizado"])
    s = Salida().linea("ADX", lista(adx, 4), ROJO, 2).linea("+DI", lista(di_mas, 4), VERDE).linea("−DI", lista(di_menos, 4), "#f77c80")
    s.niveles = [dict(valor=25, color=GRIS)]
    return s


def _cci(v, p):
    tp = fuente(v, p["fuente"])
    m = sma(tp, p["periodo"])
    n = p["periodo"]
    md = np.full(len(tp), np.nan)
    if len(tp) >= n:
        ventanas = np.lib.stride_tricks.sliding_window_view(tp, n)
        md[n - 1:] = np.mean(np.abs(ventanas - ventanas.mean(axis=1, keepdims=True)), axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        cci = (tp - m) / (0.015 * md)
    s = Salida().linea("CCI", lista(cci, 4), CIAN)
    s.niveles = [dict(valor=100, color=GRIS), dict(valor=0, color="#5d606b"), dict(valor=-100, color=GRIS)]
    return s


def _williams(v, p):
    hh, ll = maximo(v["h"], p["periodo"]), minimo(v["l"], p["periodo"])
    with np.errstate(divide="ignore", invalid="ignore"):
        r = 100 * (v["c"] - hh) / (hh - ll)
    s = Salida().linea("%R", lista(r, 4), VIOLETA)
    s.niveles = [dict(valor=-20, color=GRIS), dict(valor=-80, color=GRIS)]
    return s


def _roc(v, p):
    x = fuente(v, p["fuente"])
    n = p["periodo"]
    prev = np.r_[np.full(n, np.nan), x[:-n]] if len(x) > n else np.full(len(x), np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        r = 100 * (x / prev - 1)
    s = Salida().linea("ROC", lista(r, 4), AZUL)
    s.niveles = [dict(valor=0, color="#5d606b")]
    return s


def _ent(id, nombre, defecto, mn, mx):
    return P(id, nombre, "entero", defecto, minimo=mn, maximo=mx)


def _dec(id, nombre, defecto, mn, mx, paso=0.1):
    return P(id, nombre, "decimal", defecto, minimo=mn, maximo=mx, paso=paso)


DEFINICIONES = [
    Definicion("sma", "Media móvil simple", "SMA", "Medias móviles", True, "Promedio de los últimos N cierres.",
               [_ent("periodo", "Longitud", 20, 1, 500), _fuente_param()], _ma(sma, "SMA"), lambda p: p["periodo"] + 5),
    Definicion("ema", "Media móvil exponencial", "EMA", "Medias móviles", True, "Media que pesa más los precios recientes.",
               [_ent("periodo", "Longitud", 50, 1, 500), _fuente_param()], _ma(ema, "EMA"), lambda p: max(300, 6 * p["periodo"])),
    Definicion("wma", "Media móvil ponderada", "WMA", "Medias móviles", True, "Media con pesos lineales (la vela más nueva pesa N).",
               [_ent("periodo", "Longitud", 20, 1, 500), _fuente_param()], _ma(wma, "WMA"), lambda p: p["periodo"] + 5),
    Definicion("bb", "Bandas de Bollinger", "BB", "Volatilidad", True, "Media simple ± N desvíos estándar.",
               [_ent("periodo", "Longitud", 20, 2, 500), _dec("desvios", "Desvíos", 2.0, 0.1, 10), _fuente_param()], _bb, lambda p: p["periodo"] + 5),
    Definicion("donchian", "Canales de Donchian", "DC", "Volatilidad", True, "Máximo y mínimo de las últimas N velas.",
               [_ent("periodo", "Longitud", 20, 2, 500)], _donchian, lambda p: p["periodo"] + 5),
    Definicion("keltner", "Canales de Keltner", "KC", "Volatilidad", True, "EMA ± múltiplo del ATR.",
               [_ent("periodo", "Longitud", 20, 2, 500), _dec("mult", "Multiplicador", 2.0, 0.1, 10), _ent("atr", "Longitud ATR", 10, 1, 200)], _keltner,
               lambda p: max(300, 6 * p["periodo"])),
    Definicion("psar", "SAR parabólico", "SAR", "Tendencia", True, "Puntos que siguen la tendencia y se dan vuelta al perforarse.",
               [_dec("inicio", "Inicio", 0.02, 0.001, 1, 0.01), _dec("incremento", "Incremento", 0.02, 0.001, 1, 0.01), _dec("maximo", "Máximo", 0.2, 0.01, 1, 0.01)],
               _psar, lambda p: 300),
    Definicion("rsi", "Índice de fuerza relativa", "RSI", "Osciladores", False, "Fuerza de las subas frente a las bajas (0 a 100), con medias de Wilder.",
               [_ent("periodo", "Longitud", 14, 1, 200), P("sobrecompra", "Sobrecompra", "entero", 70, minimo=50, maximo=100, grupo="Niveles"), P("sobreventa", "Sobreventa", "entero", 30, minimo=0, maximo=50, grupo="Niveles"), _fuente_param()],
               _rsi, lambda p: max(300, 10 * p["periodo"]), rango=(0, 100)),
    Definicion("macd", "MACD", "MACD", "Osciladores", False, "Diferencia entre dos EMA, su señal y el histograma.",
               [_ent("rapida", "Rápida", 12, 1, 200), _ent("lenta", "Lenta", 26, 1, 400), _ent("senal", "Señal", 9, 1, 200), _fuente_param()],
               _macd, lambda p: max(300, 6 * p["lenta"])),
    Definicion("estocastico", "Estocástico", "Stoch", "Osciladores", False, "Posición del cierre en el rango de N velas (%K y %D).",
               [_ent("periodo", "%K longitud", 14, 1, 200), _ent("suavizado_k", "%K suavizado", 3, 1, 50), _ent("suavizado_d", "%D suavizado", 3, 1, 50)],
               _estocastico, lambda p: p["periodo"] + 60, rango=(0, 100)),
    Definicion("cci", "Índice del canal de materias primas", "CCI", "Osciladores", False, "Distancia del precio típico a su media, en desvíos medios.",
               [_ent("periodo", "Longitud", 20, 2, 300), P("fuente", "Fuente", "opcion", "hlc3", opciones=FUENTES, grupo="Entrada")], _cci, lambda p: p["periodo"] + 5),
    Definicion("williams", "%R de Williams", "%R", "Osciladores", False, "Cierre frente al máximo de N velas (−100 a 0).",
               [_ent("periodo", "Longitud", 14, 1, 300)], _williams, lambda p: p["periodo"] + 5, rango=(-100, 0)),
    Definicion("roc", "Tasa de cambio", "ROC", "Osciladores", False, "Variación porcentual contra N velas atrás.",
               [_ent("periodo", "Longitud", 12, 1, 300), _fuente_param()], _roc, lambda p: p["periodo"] + 5),
    Definicion("atr", "Rango verdadero medio", "ATR", "Volatilidad", False, "Promedio de Wilder del rango verdadero.",
               [_ent("periodo", "Longitud", 14, 1, 300)], _atr, lambda p: max(300, 10 * p["periodo"])),
    Definicion("adx", "Índice direccional medio", "ADX", "Tendencia", False, "Fuerza de la tendencia (ADX) con +DI y −DI.",
               [_ent("periodo", "Longitud DI", 14, 1, 200), _ent("suavizado", "Suavizado ADX", 14, 1, 200)], _adx, lambda p: max(300, 10 * (p["periodo"] + p["suavizado"]))),
]


LINEAS = {"sma": ["SMA"], "ema": ["EMA"], "wma": ["WMA"], "bb": ["Media", "Superior", "Inferior"], "donchian": ["Superior", "Inferior", "Media"],
          "keltner": ["Media", "Superior", "Inferior"], "psar": ["SAR"], "rsi": ["RSI"], "macd": ["MACD", "Señal", "Histograma"],
          "estocastico": ["%K", "%D"], "cci": ["CCI"], "williams": ["%R"], "roc": ["ROC"], "atr": ["ATR"], "adx": ["ADX", "+DI", "−DI"]}
for _d in DEFINICIONES:
    _d.lineas = LINEAS[_d.id]
