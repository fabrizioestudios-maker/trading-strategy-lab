"""Datos sintéticos de 1 minuto para las pruebas de NEXUS (no requieren data/*.npz)."""
import numpy as np
import pandas as pd


def m1_sintetico(dias=40, semilla=0, inicio="2025-03-02 23:00"):
    """Minutos de mercado de oro (domingo 18:00 NY a viernes 17:00 NY, con la pausa diaria 17–18 NY), paseo al azar."""
    rng = np.random.default_rng(semilla)
    t0 = pd.Timestamp(inicio, tz="UTC")
    todos = pd.date_range(t0, t0 + pd.Timedelta(days=dias), freq="1min", inclusive="left")
    ny = todos.tz_convert("America/New_York")
    m = ny.hour * 60 + ny.minute
    dia = ny.dayofweek  # 0 = lunes
    abierto = ~((m >= 17 * 60) & (m < 18 * 60))  # pausa diaria
    abierto &= ~(dia == 5)  # sábado
    abierto &= ~((dia == 4) & (m >= 17 * 60))  # viernes desde las 17
    abierto &= ~((dia == 6) & (m < 18 * 60))  # domingo antes de las 18
    t = todos[abierto].as_unit("ms").asi8.astype(np.int64)
    n = len(t)
    c = 2000 + np.cumsum(rng.normal(0, 0.4, n))
    o = np.concatenate([[c[0]], c[:-1]]) + rng.normal(0, 0.05, n)
    h = np.maximum(o, c) + np.abs(rng.normal(0, 0.2, n))
    l = np.minimum(o, c) - np.abs(rng.normal(0, 0.2, n))
    return dict(t=t, o=np.round(o, 2), h=np.round(h, 2), l=np.round(l, 2), c=np.round(c, 2))


def truncar(m1, j):
    return {k: v[: j + 1] for k, v in m1.items()}
