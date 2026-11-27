"""
Fichas de mercado para el Resumen (una por instrumento), con datos históricos y definiciones del laboratorio.

- Sesgo: tendencia de lab/senales.py (cierre sobre/bajo la SMA 200 diaria y pendiente de la SMA en 20 velas).
  Es una descripción del precio, no una predicción: ninguna regla de tendencia superó las pruebas del laboratorio sola.
- Posición en el rango de 52 semanas: dónde está el cierre entre el mínimo y el máximo de las últimas 252 velas diarias.
- El texto se arma con esos números; no hay noticias ni modelos de lenguaje.
"""
from __future__ import annotations

import numpy as np

from lab import senales as S

from . import sesiones as SE

SESGO = {1: "alcista", -1: "bajista", 0: "neutral"}


def _es(x: float, dec: int) -> str:
    """Número con formato es-AR (punto de miles, coma decimal) para los textos."""
    return f"{x:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _r(x, d=4):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


def ficha(svc, simbolo: str) -> dict:
    meta = svc.meta(simbolo)
    _, fin = svc.extremos(simbolo)
    d1, _ = svc.velas_hasta(simbolo, 1440, fin, 260)
    c = np.array([v["c"] for v in d1], float)
    h = np.array([v["h"] for v in d1], float)
    lo = np.array([v["l"] for v in d1], float)
    ult, prev = c[-1], (c[-2] if len(c) > 1 else np.nan)
    sesgo = int(S.tendencia({"c": c})[-1]) if len(c) >= 221 else 0
    sma = S.sma(c, 200)
    sma_ult = sma[-1] if len(c) >= 200 else np.nan
    pendiente = sma[-1] - sma[-21] if len(c) >= 221 else np.nan
    dist = (ult / sma_ult - 1) * 100 if np.isfinite(sma_ult) else np.nan
    m52, n52 = h[-252:].max(), lo[-252:].min()
    pos = (ult - n52) / (m52 - n52) * 100 if m52 > n52 else np.nan
    dec = int(meta["decimales"])
    partes = []
    if np.isfinite(dist):
        partes.append(f"Cierre {_es(abs(dist), 1)} % {'sobre' if dist >= 0 else 'bajo'} la SMA 200 diaria, que {'sube' if pendiente > 0 else 'baja'} en las últimas 20 sesiones.")
    partes.append(f"Está al {pos:.0f} % de su rango de 52 semanas ({_es(n52, dec)} a {_es(m52, dec)}).")
    return dict(
        simbolo=simbolo, nombre=meta["nombre"], decimales=dec, ultimo_ms=int(fin), ultimo_ny=SE.texto_ny(int(fin)),
        ultimo=_r(ult, dec), cambio=_r(ult - prev, dec), cambio_pct=_r((ult / prev - 1) * 100, 3),
        sesgo=SESGO[sesgo], sma200=_r(sma_ult, dec), distancia_sma_pct=_r(dist, 2), maximo_52s=_r(m52, dec), minimo_52s=_r(n52, dec),
        posicion_rango_pct=_r(pos, 1), cierres=[_r(x, dec) for x in c[-60:]], texto=" ".join(partes),
        nota="Descriptivo: el sesgo de tendencia no es una predicción (lab/senales.py, BITACORA).",
    )
