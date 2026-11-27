"""
Robustez de una corrida (Performance Analytics): todo con funciones ya probadas del laboratorio, sin elegir nada.

- Pliegues anuales (años de laboratorio 15/11 → 15/11, lab/walkforward.anio_lab): la regla está fija, así que cada año
  es una prueba fuera de muestra de la misma regla. Se informa cuántos años dan expectativa positiva.
- Benchmarks pasivos (lab/benchmarks.py): resultado diario marcado a mercado de la estrategia contra comprar y
  mantener oro con volatilidad objetivo y contra tendencia SMA 200; IR de tasación con t de Newey-West (no depende del
  tamaño de posición). Rotación cobrada a la mitad del costo ida y vuelta de docs/costos.md.
- Monte Carlo (lab/montecarlo.py): bootstrap por bloques de 5 operaciones de la secuencia de R, 5 años, riesgo fijo
  por operación sobre el capital del momento.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from lab import benchmarks as BM, datos as LD, montecarlo as MC, walkforward as WF

RIESGOS = (0.0025, 0.005, 0.01)


def _num(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return round(x, 4) if np.isfinite(x) else None


def pliegues(ops: pd.DataFrame, r: np.ndarray, desde_anio: int, hasta_anio: int, corte_confirmacion_ms: int) -> list[dict]:
    t = ops.t.values
    out = []
    for y in range(desde_anio, hasta_anio):
        a, b = WF.anio_lab(y), WF.anio_lab(y + 1)
        sel = (t >= a) & (t < b)
        rr = r[sel]
        out.append(dict(desde=f"{y}-11-15", hasta=f"{y + 1}-11-15", n=int(sel.sum()), expectativa=_num(rr.mean()) if len(rr) else None,
                        r_total=round(float(rr.sum()), 3), muestra="confirmacion" if a >= corte_confirmacion_ms else "eleccion"))
    return out


def benchmarks(ops: pd.DataFrame, r: np.ndarray, m1: dict, simbolo: str = "XAUUSD") -> list[dict]:
    d1 = BM.cierres_diarios(simbolo, m1=m1)
    rs = BM.diario_mtm(ops.assign(r=r), d1)
    rb = BM.retornos(d1)
    rot = float(LD.costo(simbolo, 1000.0)) / 1000.0 / 2 if simbolo in LD.COSTOS else 0.0
    desde = rs.index[int(np.argmax(rs.ne(0).values))] if rs.ne(0).any() else rs.index[0]
    filas = []
    for nombre, desc, serie in (
        ("Comprar y mantener", "Oro comprado siempre, con volatilidad objetivo del 10 % anual", BM.vol_objetivo(rb, costo_rotacion=rot)[0]),
        ("Tendencia SMA 200", "Comprado si el cierre de ayer está sobre la SMA 200, con volatilidad objetivo", BM.tendencia_simple(rb, d1.c, costo_rotacion=rot)[0]),
    ):
        x = BM.tasacion(rs[desde:], serie[desde:])
        filas.append(dict(nombre=nombre, descripcion=desc, n_dias=int(x["n_dias"]), ir_tasacion=_num(x["ir_tasacion"]), t_alfa=_num(x["t_alfa"]),
                          p_alfa=_num(x["p_alfa"]), correlacion=_num(x["correlacion"]), sharpe_estrategia=_num(x["sharpe_estrategia"]),
                          sharpe_benchmark=_num(x["sharpe_benchmark"])))
    return filas


def montecarlo(r: np.ndarray, anios_muestra: float) -> tuple[list[dict], float | None]:
    r = np.asarray(r, float)
    if len(r) < 10 or anios_muestra <= 0:
        return [], None
    tab = MC.tabla_riesgo(r, len(r) / anios_muestra, anios=5, riesgos=RIESGOS, n_sim=5000, bloque=5, semilla=0)
    filas = [{k: (int(v) if k in ("anios", "n_ops") else _num(v)) for k, v in fila.items()} for fila in tab.to_dict("records")]
    return filas, _num(MC.riesgo_sugerido(tab))


def calcular(ops: pd.DataFrame, r: np.ndarray, m1: dict, cfg: dict) -> dict:
    a_ms = WF.ms(cfg["eleccion_desde"])
    b_ms = WF.ms(cfg["confirmacion_hasta"])
    y0 = pd.Timestamp(cfg["eleccion_desde"]).year
    y1 = pd.Timestamp(cfg["confirmacion_hasta"]).year
    sel = (ops.t.values >= a_ms) & (ops.t.values < b_ms)
    ops_s, r_s = ops[sel], np.asarray(r, float)[sel]
    avisos = []
    pl = pliegues(ops_s, r_s, y0, y1, WF.ms(cfg["confirmacion_desde"]))
    con = [p for p in pl if p["n"] > 0]
    try:
        bm = benchmarks(ops_s, r_s, m1) if len(ops_s) else []
    except Exception as e:  # datos insuficientes para la regresión: se informa, no se inventa
        bm, _ = [], avisos.append(f"Benchmarks no disponibles: {e}")
    mc, sugerido = montecarlo(r_s, (b_ms - a_ms) / (365.25 * 86400000))
    if not mc:
        avisos.append("Monte Carlo no disponible: hacen falta al menos 10 operaciones.")
    avisos.append("Con unas 11 operaciones por año, cada pliegue anual tiene muy poca muestra: un año negativo o positivo dice poco por sí solo.")
    avisos.append("El Monte Carlo remuestrea la historia: no agrega información nueva ni corrige la elección entre muchas configuraciones.")
    return dict(
        pliegues=pl,
        pliegues_con_operaciones=len(con),
        pliegues_positivos=sum(1 for p in con if (p["expectativa"] or 0) > 0),
        benchmarks=bm,
        montecarlo=mc,
        riesgo_sugerido_pct=sugerido,
        definiciones=[
            "Pliegue: año de laboratorio (15/11 a 15/11). La regla no cambia entre años: cada uno es fuera de muestra.",
            "IR de tasación: alfa de la regresión contra el benchmark dividido por el desvío del residuo, anualizado; p con Newey-West.",
            "Monte Carlo: 5.000 trayectorias de 5 años remuestreando bloques de 5 operaciones; riesgo fijo sobre el capital del momento.",
            "Riesgo sugerido: el mayor riesgo con probabilidad de drawdown > 20 % menor a 5 % (regla descriptiva, BITACORA entrada 27).",
        ],
        avisos=avisos,
    )
