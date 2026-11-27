"""
Indicadores del gráfico (RSI y MACD) calculados con lab/senales.py SOLO sobre las velas visibles en el límite.

La vela en formación usa su cierre al último minuto revelado, así que su valor cambia minuto a minuto pero nunca usa
datos posteriores. Se calcula con 300 velas previas de calentamiento: con esa ventana el arranque de las medias
exponenciales pesa menos de 1e-9 y el valor no depende de cuántas velas se piden.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from lab import senales as S

CALENTAMIENTO = 300
RSI_N = 14
MACD = (12, 26, 9)


def _lista(x: np.ndarray) -> list:
    return [None if not np.isfinite(v) else round(float(v), 4) for v in x]


def calcular(svc, simbolo: str, tf: int, limite_ms: int, cantidad: int) -> dict:
    velas, _ = svc.velas_hasta(simbolo, tf, limite_ms, cantidad + CALENTAMIENTO)
    c = np.array([v["c"] for v in velas], float)
    rapida, lenta, senal_n = MACD
    rsi = S.rsi(c, RSI_N) if len(c) else np.array([])
    macd = S.ema(c, rapida) - S.ema(c, lenta)
    senal = pd.Series(macd).ewm(span=senal_n, adjust=False, min_periods=senal_n).mean().values
    hist = macd - senal
    n = min(cantidad, len(c))
    return dict(rsi_n=RSI_N, macd_rapida=rapida, macd_lenta=lenta, macd_senal=senal_n,
                rsi=_lista(rsi[-n:]), macd=_lista(macd[-n:]), senal=_lista(senal[-n:]), histograma=_lista(hist[-n:]))


def sesion_dia(svc, simbolo: str, limite_ms: int) -> dict | None:
    """Sesión diaria (cierre 17:00 NY) que contiene el límite, con lo revelado hasta ahí, y el cierre anterior."""
    d1, _ = svc.velas_hasta(simbolo, 1440, limite_ms, 2)
    if not d1:
        return None
    hoy = d1[-1]
    previo = d1[-2]["c"] if len(d1) > 1 else None
    cambio = round(hoy["c"] - previo, 5) if previo else None
    return dict(apertura_ms=hoy["t"], apertura=hoy["o"], maximo=hoy["h"], minimo=hoy["l"], ultimo=hoy["c"], cierre_anterior=previo,
                cambio=cambio, cambio_pct=round(cambio / previo * 100, 4) if previo else None, en_formacion=bool(hoy["parcial"]))
