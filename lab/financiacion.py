"""
Financiación (swap) de posiciones que pasan la noche, aplicada después de simular (no cambia el motor ni los resultados
históricos). No hay datos históricos de swaps del bróker: se usan escenarios explícitos en % del nominal por noche.
Noche = cada cierre de las 17:00 de Nueva York que la operación atraviesa; el miércoles cuenta triple (fin de semana
de metales y forex en la mayoría de los brókers).
"""
import numpy as np
import pandas as pd


def noches(t_entrada_ms, t_salida_ms):
    """Cantidad de noches cobradas (17:00 NY) entre entrada y salida, con el miércoles triple."""
    e = pd.to_datetime(np.asarray(t_entrada_ms), unit="ms", utc=True).tz_convert("America/New_York")
    s = pd.to_datetime(np.asarray(t_salida_ms), unit="ms", utc=True).tz_convert("America/New_York")
    out = np.zeros(len(e))
    for k, (a, b) in enumerate(zip(e, s)):
        dia = (a - pd.Timedelta(hours=17)).normalize() + pd.Timedelta(hours=17)  # último corte de las 17:00 antes de la entrada
        corte = dia + pd.Timedelta(days=1)
        n = 0.0
        while corte <= b:
            n += 3.0 if corte.weekday() == 2 else (0.0 if corte.weekday() >= 5 else 1.0)
            corte += pd.Timedelta(days=1)
        out[k] = n
    return out


def r_con_swap(r, d, entrada, riesgo, t_entrada_ms, t_salida_ms, pct_largo, pct_corto):
    """R ajustado: swap (% del nominal por noche; negativo = costo) × precio × noches / riesgo por unidad."""
    nn = noches(t_entrada_ms, t_salida_ms)
    pct = np.where(np.asarray(d) == 1, pct_largo, pct_corto) / 100.0
    return np.asarray(r) + pct * np.asarray(entrada) * nn / np.asarray(riesgo), nn
