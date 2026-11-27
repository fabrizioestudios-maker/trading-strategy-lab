"""
Corridas de investigación de NEXUS: ejecutan una estrategia registrada con una configuración inmutable y devuelven
métricas con su período, su tamaño de muestra, el perfil de costos y la definición de cada número.

No hay optimización: los parámetros son los de la definición registrada. La muestra de elección y la de confirmación
se informan por separado y nunca se usan para elegir nada desde la interfaz.
"""
from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd

from lab import ejecucion as EJ, ficha as FI, multiples as MU, validacion as VA

from . import estrategias as E022, robustez as ROB

DEF = {
    "n": ("Operaciones", "", "Cantidad de operaciones cerradas en la muestra"),
    "wr": ("Acierto", "%", "Operaciones con resultado > 0 después de costos / total"),
    "expectancy": ("Expectativa", "R", "Resultado medio por operación en múltiplos del riesgo, después de costos"),
    "ic_lo": ("IC 95 % inferior", "R", "Bootstrap de la media (10.000 remuestreos, semilla 0)"),
    "ic_hi": ("IC 95 % superior", "R", "Bootstrap de la media (10.000 remuestreos, semilla 0)"),
    "p": ("p (media > 0)", "", "t de Student de una cola sobre los R por operación"),
    "pf": ("Factor de beneficio", "", "Suma de ganancias / suma de pérdidas (en R)"),
    "payoff": ("Payoff", "", "Ganancia media / pérdida media"),
    "max_dd": ("Drawdown máximo", "R", "Mayor caída de la curva acumulada en R"),
    "r_total": ("R total", "R", "Suma de los R de la muestra"),
    "duracion_media_h": ("Duración media", "h", "Horas entre la entrada y la salida"),
}
PERFILES = ("sin_costos", "optimista", "costos_md", "base", "conservador", "estres")


def _ms(fecha: str) -> int:
    return int(pd.Timestamp(fecha, tz="UTC").value // 10**6)


def _metricas(r: np.ndarray, ops: pd.DataFrame, periodo: str, perfil: str) -> list[dict]:
    r = np.asarray(r, float)
    n = len(r)
    vals = dict(n=n)
    if n:
        b = FI.basico(r)
        vals.update(wr=b["wr"] * 100, expectancy=b["expectancy"], pf=b["pf"], payoff=b["payoff"], max_dd=b["max_dd"], r_total=b["r_total"])
        if n > 2:
            lo, hi = VA.bootstrap_ic(r)
            vals.update(ic_lo=lo, ic_hi=hi, p=float(MU.p_media_positiva(r.mean(), r.std(ddof=1), n)))
        vals["duracion_media_h"] = float(np.mean((ops.t_salida.values - ops.t.values) / 3.6e6))
    out = []
    for k, (nombre, unidad, definicion) in DEF.items():
        v = vals.get(k)
        if v is not None and (isinstance(v, float) and not np.isfinite(v)):
            v = None
        out.append(dict(clave=k, nombre=nombre, valor=None if v is None else round(float(v), 4), unidad=unidad,
                        definicion=definicion, n=n, periodo=periodo, perfil_costos=perfil))
    return out


def correr(svc, cfg: dict, etapa: Callable[[str], None], cancelado: Callable[[], bool]) -> dict:
    if cfg["estrategia"] != "e022":
        raise ValueError("Estrategia no registrada")
    etapa("Cargando velas de 1 minuto de XAUUSD")
    m = svc.m1("XAUUSD")
    m1 = {k: np.asarray(m[k]) for k in ("t", "o", "h", "l", "c")}
    if cancelado():
        return {}
    a, b = _ms(cfg["eleccion_desde"]), _ms(cfg["confirmacion_hasta"])
    etapa("Señales diarias y simulación minuto a minuto (lab/motor.py, SL primero)")
    ops = E022.operaciones(m1, cfg["entrada"], a, b)
    if cancelado():
        return {}
    etapa("Costos por perfil (lab/ejecucion.py)")
    vol = EJ.Volatilidad(m1)
    r_perfil = {"costos_md": ops.r.values}
    for p in ("sin_costos", "optimista", "base", "conservador", "estres"):
        r_perfil[p] = EJ.aplicar(ops, "XAUUSD", vol, p).r.values
    if cancelado():
        return {}
    etapa("Métricas, intervalos y desgloses")
    perfil = cfg["perfil_costos"]
    r = r_perfil[perfil]
    e_a, e_b = _ms(cfg["eleccion_desde"]), _ms(cfg["eleccion_hasta"])
    c_a, c_b = _ms(cfg["confirmacion_desde"]), _ms(cfg["confirmacion_hasta"])
    t = ops.t.values
    sel_e, sel_c = (t >= e_a) & (t < e_b), (t >= c_a) & (t < c_b)
    muestras = {
        "eleccion": (sel_e, f"{cfg['eleccion_desde']} → {cfg['eleccion_hasta']}"),
        "confirmacion": (sel_c, f"{cfg['confirmacion_desde']} → {cfg['confirmacion_hasta']}"),
        "total": (sel_e | sel_c, f"{cfg['eleccion_desde']} → {cfg['confirmacion_hasta']}"),
    }
    metricas = {k: _metricas(r[s], ops[s], per, perfil) for k, (s, per) in muestras.items()}
    anio = pd.to_datetime(ops.t, unit="ms", utc=True).dt.year.values
    por_anio = []
    for y in sorted(set(anio)):
        sel = anio == y
        rr = r[sel]
        por_anio.append(dict(anio=int(y), n=int(sel.sum()), acierto=round(float((rr > 0).mean() * 100), 1),
                             expectativa=round(float(rr.mean()), 4), r_total=round(float(rr.sum()), 3),
                             muestra="eleccion" if (t[sel] < e_b).all() else "confirmacion" if (t[sel] >= c_a).all() else "mixta"))
    sub = ops.assign(r=r)
    f = FI.ficha(sub)
    def tabla(df, nombre):
        if not isinstance(df, pd.DataFrame) or df.empty:
            return []
        return [dict({nombre: str(k)}, n=int(v["n"]), acierto=round(float(v["wr"]) * 100, 1), expectativa=round(float(v["expectancy"]), 4),
                     r_total=round(float(v["r_total"]), 3)) for k, v in df.iterrows()]
    mes = pd.to_datetime(ops.t, unit="ms", utc=True).dt.strftime("%Y-%m").values
    por_mes = [dict(mes=mm, n=int((mes == mm).sum()), r_total=round(float(r[mes == mm].sum()), 3)) for mm in sorted(set(mes))]
    desgloses = dict(por_lado=tabla(f.get("por_direccion"), "lado"), por_sesion=tabla(f.get("por_sesion"), "sesion"), por_mes=por_mes)
    sens = []
    for p in PERFILES:
        rp = r_perfil[p]
        fila = dict(perfil=p)
        for k, (s, _) in muestras.items():
            fila[k] = round(float(rp[s].mean()), 4) if s.any() else None
        sens.append(fila)
    motivo = {1: "TP", -1: "SL", 2: "tiempo", 3: "fin"}
    operaciones = [dict(entrada_ms=int(x.t), salida_ms=int(x.t_salida), lado="compra" if x.dir > 0 else "venta",
                        precio_entrada=round(float(x.entrada), 2), precio_salida=round(float(x.salida), 2), sl=round(float(x.sl), 2),
                        motivo=motivo.get(int(x.motivo), "fin"), r=round(float(rv), 4),
                        muestra="eleccion" if se else "confirmacion" if sc else "fuera")
                   for x, rv, se, sc in zip(ops.itertuples(), r, sel_e, sel_c)]
    avisos = [
        "E022 es una candidata (nivel B), no una estrategia validada: le falta un período limpio (F001 y F002 desde el 27/11/2026).",
        "Se eligió entre 185.367 configuraciones de la búsqueda E019 (registro/presupuesto_pruebas.csv): el Deflated Sharpe es 0,24.",
        "La confirmación 2021–2026 ya se miró al armar el ranking de E019: no es un holdout limpio (docs/criterios_v2.md, regla 4).",
        "Precios bid; el spread y el deslizamiento se cobran como costo según el perfil elegido.",
    ]
    if cancelado():
        return {}
    etapa("Robustez: pliegues anuales, benchmarks y Monte Carlo (lab/benchmarks.py, lab/montecarlo.py)")
    rob = ROB.calcular(ops, r, m1, cfg)
    return dict(metricas=metricas, por_anio=por_anio, desgloses=desgloses, sensibilidad_costos=sens, operaciones=operaciones, avisos=avisos,
                robustez=rob)
