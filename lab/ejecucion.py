"""
Motor de ejecución 2.0 (fase 4, E030): perfiles de costos y deslizamiento aplicados a listas de operaciones ya
simuladas. No cambia las señales ni el motor; recalcula el R de cada operación con otro costo:
    R' = (movimiento bruto − costo') / riesgo,   movimiento bruto = dir · (salida − entrada).

Componentes del costo de una operación (en precio):
1. Spread: fracción `parte_spread` del costo ida y vuelta de docs/costos.md × multiplicador de la sesión (promedio de
   entrada y salida) × multiplicador de volatilidad (σ₆₀ / mediana)^0,5 × escala del perfil.
2. Deslizamiento: k_entrada · σ₁ₘ en entradas a mercado (0 en órdenes límite) y k_stop · σ₁ₘ en salidas por SL
   (y por tiempo), × factor del perfil. El TP es una orden límite: no desliza.
3. Latencia: σ₁ₘ · √(latencia / 60 s) por cada pierna a mercado, en contra.
4. Impacto de mercado (raíz cuadrada): k · σ_diario · √(tamaño / volumen diario). Sin datos de volumen, con un volumen
   supuesto y tamaños minoristas da < 0,1 % del costo: se informa como 0 y se documenta.
5. Swaps: escenarios por clase de activo (% del nominal por noche, miércoles triple), con lab/financiacion.py.
σ₁ₘ y σ₆₀: desvío de los cambios de precio de 1 minuto en los 60 minutos previos a cada punto.

Los multiplicadores de sesión y las fracciones son SUPUESTOS documentados (no hay datos gratuitos de spreads
históricos del bróker). Se pueden calibrar con un export de MT5 de Fabrizio (columna <SPREAD> por vela).
"""
import numpy as np
import pandas as pd

from lab import datos, financiacion

# Multiplicador del spread por franja horaria de Nueva York [desde, hasta) en minutos; Londres = referencia.
SESION_MULT = [
    (17 * 60, 17 * 60 + 10, 4.0),   # cambio de día: los spreads se abren varias veces
    (17 * 60 + 10, 19 * 60, 1.6),
    (19 * 60, 24 * 60, 1.4),        # Asia
    (0, 2 * 60, 1.4),
    (2 * 60, 8 * 60, 1.0),          # Londres
    (8 * 60, 12 * 60, 0.9),         # Nueva York
    (12 * 60, 17 * 60, 1.1),        # tarde de Nueva York
]

PERFILES = {
    "sin_costos": dict(escala=0.0, desliz=0.0, latencia_ms=0, sesion=False, vol=False, swap=None),
    "optimista": dict(escala=0.75, desliz=0.0, latencia_ms=0, sesion=False, vol=False, swap="base"),
    "base": dict(escala=1.0, desliz=1.0, latencia_ms=100, sesion=True, vol=True, swap="base"),
    "conservador": dict(escala=1.5, desliz=1.5, latencia_ms=250, sesion=True, vol=True, swap="adverso"),
    "estres": dict(escala=3.0, desliz=3.0, latencia_ms=500, sesion=True, vol=True, swap="adverso"),
}
PARTE_SPREAD = 0.7     # del costo ida y vuelta de costos.md
K_ENTRADA = 0.10       # × σ₁ₘ en entradas a mercado
K_STOP = 0.25          # × σ₁ₘ en salidas por stop o por tiempo

# Swaps en % del nominal por noche (negativo = se paga): (largo, corto).
SWAPS = {
    "metales": {"base": (-0.015, -0.005), "adverso": (-0.03, -0.015)},
    "indices": {"base": (-0.02, -0.005), "adverso": (-0.035, -0.01)},
    "forex": {"base": (-0.005, -0.005), "adverso": (-0.01, -0.01)},
}
CLASE = {"XAUUSD": "metales", "XAGUSD": "metales", "WTIUSD": "metales",
         "EURUSD": "forex", "GBPUSD": "forex", "USDJPY": "forex", "AUDUSD": "forex", "USDCAD": "forex"}


def clase(instr):
    return CLASE.get(instr, "indices")


def mult_sesion(t_ms):
    ny = pd.to_datetime(np.asarray(t_ms, np.int64), unit="ms", utc=True).tz_convert("America/New_York")
    m = np.asarray(ny.hour * 60 + ny.minute)
    out = np.ones(len(m))
    for a, b, k in SESION_MULT:
        out[(m >= a) & (m < b)] = k
    return out


class Volatilidad:
    """σ de los cambios de 1 minuto en los 60 minutos previos, con la mediana del desarrollo (2010-11 a 2021-11)."""

    def __init__(self, m1, fin_desarrollo_ms=None):
        c = m1["c"].astype(float)
        dc = np.diff(c, prepend=c[0])
        s = pd.Series(dc).rolling(60, min_periods=20).std().bfill().values
        self.t = m1["t"]
        self.s = s
        fin = fin_desarrollo_ms if fin_desarrollo_ms is not None else pd.Timestamp("2021-11-15", tz="UTC").value // 10**6
        dev = self.t < fin
        rel = s / np.maximum(c, 1e-12)
        self.mediana_rel = float(np.nanmedian(rel[dev])) if dev.any() else float(np.nanmedian(rel))
        self.c = c

    def en(self, t_ms):
        i = np.clip(np.searchsorted(self.t, np.asarray(t_ms, np.int64), side="right") - 2, 0, len(self.t) - 1)
        sig = self.s[i]
        rel = sig / np.maximum(self.c[i], 1e-12) / self.mediana_rel
        return sig, rel


def costos(ops, instr, vol, perfil, entrada_limite=False):
    """Costo en precio por operación con el perfil (array)."""
    P = PERFILES[perfil]
    ent = ops.entrada.values.astype(float)
    base = np.asarray(datos.costo(instr, ent), float)
    if P["escala"] == 0 and P["desliz"] == 0 and P["latencia_ms"] == 0:
        return np.zeros(len(ops))
    sig_e, rel_e = vol.en(ops.t.values)
    sig_s, rel_s = vol.en(ops.t_salida.values)
    ms_ = (mult_sesion(ops.t.values) + mult_sesion(ops.t_salida.values)) / 2 if P["sesion"] else 1.0
    mv = np.sqrt(np.clip((rel_e + rel_s) / 2, 0.25, 16)) if P["vol"] else 1.0
    spread = PARTE_SPREAD * base * ms_ * mv * P["escala"]
    if not P["sesion"] and not P["vol"]:
        spread = base * P["escala"]  # perfiles simples: el costo de costos.md escalado
    sale_mercado = np.isin(ops.motivo.values, (-1, 2))
    desliz = P["desliz"] * (0.0 if entrada_limite else K_ENTRADA * sig_e) + P["desliz"] * K_STOP * sig_s * sale_mercado
    piernas = (0 if entrada_limite else 1) + sale_mercado.astype(float)
    lat = np.sqrt(P["latencia_ms"] / 60000.0) * (sig_e + sig_s) / 2 * piernas
    return spread + desliz + lat


def aplicar(ops, instr, vol, perfil, entrada_limite=False):
    """Copia de `ops` con r recalculado (y columnas costo_r, r_bruto) según el perfil, swaps incluidos."""
    o = ops.copy()
    riesgo = np.abs(o.entrada.values - o.sl.values)
    bruto = o.dir.values * (o.salida.values - o.entrada.values)
    c = costos(o, instr, vol, perfil, entrada_limite)
    o["r_bruto"] = bruto / riesgo
    o["costo_r"] = c / riesgo
    o["r"] = (bruto - c) / riesgo
    esc = PERFILES[perfil]["swap"]
    if esc is not None:
        pl, pc = SWAPS[clase(instr)][esc]
        r2, nn = financiacion.r_con_swap(o.r.values, o.dir.values, o.entrada.values, riesgo, o.t.values,
                                         o.t_salida.values, pl, pc)
        o["swap_r"] = r2 - o.r.values
        o["costo_r"] = o.costo_r - o.swap_r
        o["r"] = r2
    return o


def costo_equilibrio(ops_base):
    """C_max de AlgoXpert en R: el costo promedio por operación que deja la expectancy en cero (= expectancy bruta)."""
    return float(ops_base.r_bruto.mean())


def tabla_perfiles(ops, instr, vol, entrada_limite=False):
    filas = []
    for p in PERFILES:
        o = aplicar(ops, instr, vol, p, entrada_limite)
        r = o.r.values
        filas.append(dict(perfil=p, n=len(r), wr=(r > 0).mean(), exp=r.mean(), costo_medio_r=o.costo_r.mean(),
                          r_total=r.sum()))
    t = pd.DataFrame(filas)
    base = aplicar(ops, instr, vol, "base", entrada_limite)
    cmax = costo_equilibrio(base)
    exp = dict(zip(t.perfil, t.exp))
    estado = "no operable" if exp["base"] <= 0 else ("frágil" if exp["conservador"] <= 0 else "operable")
    return t, dict(c_max_r=cmax, costo_base_r=float(base.costo_r.mean()), estado=estado)
