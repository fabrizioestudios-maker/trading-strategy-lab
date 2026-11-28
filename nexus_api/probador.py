"""
Probador de estrategias de NEXUS: el usuario arma reglas con indicadores clásicos y el laboratorio las prueba con el
mismo rigor que sus propias hipótesis.

Ejecución (igual que lab/motor.py):
- la señal se evalúa al CIERRE de la vela k; la entrada es a mercado en la apertura del minuto siguiente;
- stop = entrada ∓ k·ATR(n) de la vela de la señal; objetivo = entrada ± RR·distancia del stop;
- si el stop y el objetivo caen en el mismo minuto, cuenta el stop; una operación a la vez;
- costos por perfil (lab/ejecucion.py: spread, deslizamiento y swaps).

Validación:
- la última parte del período (por defecto 30 %) es la muestra de VALIDACIÓN: se informa aparte y no se usa para nada;
- intervalo bootstrap de la media, p de la media > 0;
- contra el azar: 300 juegos de entradas al azar del mismo lado, con el mismo stop y objetivo;
- Deflated Sharpe con la cantidad de pruebas que lleva este usuario (cada configuración distinta cuenta una vez);
- Monte Carlo por bloques del riesgo de drawdown y sensibilidad a los perfiles de costos.
Todo con velas hasta `hasta`: nada de lo posterior entra en el cálculo.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time

import numpy as np
import pandas as pd

from lab import datos as LD, ejecucion as EJ, montecarlo as MC, motor as MO, validacion as VA

from . import biblioteca as B
from .biblioteca.base import rango_verdadero, rma
from .investigacion import PERFILES, _metricas, _ms

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "registro", "nexus", "probador")
TF_PERMITIDAS = (15, 60, 240, 1440)
N_AZAR = 300
_cerrojo = threading.Lock()


def _operando(o: dict, v: dict, cache: dict) -> np.ndarray:
    tipo = o.get("tipo")
    if tipo == "valor":
        return np.full(len(v["c"]), float(o["valor"]))
    if tipo == "precio":
        campo = o.get("campo", "close")
        x = {"close": v["c"], "open": v["o"], "high": v["h"], "low": v["l"]}.get(campo)
        if x is None:
            raise ValueError(f"precio: campo inválido {campo}")
        return np.asarray(x, float)
    if tipo == "indicador":
        d = B.CATALOGO.get(o.get("id"))
        if d is None:
            raise KeyError(f"indicador {o.get('id')}")
        if d.id == "luxalgo_smc":
            raise ValueError("Smart Money Concepts es descriptivo y de uso no comercial: no se usa en reglas del probador")
        p = B.parametros(d, o.get("parametros"))
        clave = json.dumps([d.id, p], sort_keys=True)
        if clave not in cache:
            cache[clave] = d.calcular(v, p)
        s = cache[clave]
        series = {ln["nombre"]: ln["valores"] for ln in s.lineas} | {h["nombre"]: h["valores"] for h in s.histogramas}
        nombre = o.get("linea") or next(iter(series))
        if nombre not in series:
            raise ValueError(f"{d.nombre}: no tiene la línea «{nombre}» (tiene {', '.join(series)})")
        return np.array([np.nan if x is None else x for x in series[nombre]], float)
    raise ValueError("operando: tipo indicador, precio o valor")


def _condicion(c: dict, v: dict, cache: dict) -> np.ndarray:
    a, b = _operando(c["izq"], v, cache), _operando(c["der"], v, cache)
    a1, b1 = np.r_[np.nan, a[:-1]], np.r_[np.nan, b[:-1]]
    with np.errstate(invalid="ignore"):
        op = c["op"]
        if op == "cruza_arriba":
            return (a > b) & (a1 <= b1)
        if op == "cruza_abajo":
            return (a < b) & (a1 >= b1)
        if op == "mayor":
            return a > b
        if op == "menor":
            return a < b
    raise ValueError(f"operador inválido {op}")


def _senales(conds: list[dict], v: dict, cache: dict) -> np.ndarray:
    if not conds:
        return np.zeros(len(v["c"]), bool)
    m = np.ones(len(v["c"]), bool)
    for c in conds:
        m &= _condicion(c, v, cache)
    return m


def _registro(usuario: str) -> str:
    seguro = hashlib.sha256(usuario.encode()).hexdigest()[:24]
    return os.path.join(CARPETA, f"{seguro}.jsonl")


def contar_prueba(usuario: str, huella: str, sharpe: float | None) -> tuple[int, float | None]:
    """Agrega la prueba al registro del usuario (una vez por configuración) y devuelve (pruebas, varianza de los Sharpe)."""
    os.makedirs(CARPETA, exist_ok=True)
    ruta = _registro(usuario)
    with _cerrojo:
        filas = []
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as f:
                filas = [json.loads(x) for x in f if x.strip()]
        if huella not in {x["huella"] for x in filas}:
            fila = dict(huella=huella, sharpe=sharpe, t=int(time.time()))
            filas.append(fila)
            with open(ruta, "a", encoding="utf-8") as f:
                f.write(json.dumps(fila) + "\n")
    srs = [x["sharpe"] for x in filas if x.get("sharpe") is not None and np.isfinite(x["sharpe"])]
    return len(filas), (float(np.var(srs, ddof=1)) if len(srs) >= 2 else None)


def _ops(sim: dict) -> pd.DataFrame:
    return pd.DataFrame(dict(t=sim["t"], t_salida=sim["t_salida"], dir=sim["dir"], entrada=sim["entrada"], sl=sim["sl"], tp=sim["tp"],
                             salida=sim["salida"], motivo=sim["motivo"], r=sim["r"]))


def correr(svc, cfg: dict, usuario: str = "local") -> dict:
    t0 = time.time()
    simbolo, tf = cfg["simbolo"], int(cfg["tf"])
    if tf not in TF_PERMITIDAS:
        raise ValueError(f"Temporalidad del probador: {', '.join(map(str, TF_PERMITIDAS))} minutos")
    if not cfg.get("compra") and not cfg.get("venta"):
        raise ValueError("Agregá al menos una condición de compra o de venta")
    desde, hasta = _ms(cfg["desde"]), _ms(cfg["hasta"])
    if hasta <= desde:
        raise ValueError("El final del período tiene que ser posterior al inicio")
    frac = float(cfg.get("fraccion_validacion", 0.3))
    corte = int(desde + (hasta - desde) * (1 - frac))

    m = svc.m1(simbolo)
    t_all = np.asarray(m["t"])
    # calentamiento: 1500 velas de la temporalidad antes del inicio (con fines de semana de por medio)
    i_a = int(np.searchsorted(t_all, desde - 1500 * tf * 60_000 * 1.6))
    i_b = int(np.searchsorted(t_all, hasta))
    if i_b - i_a < 1000:
        raise ValueError("No hay datos suficientes en ese período")
    m1 = {k: np.asarray(m[k][i_a:i_b]) for k in ("t", "o", "h", "l", "c")}
    v = LD.velas(m1, tf)
    v = {k: np.asarray(x) for k, x in v.items()}
    cache: dict = {}
    s_compra = _senales(cfg.get("compra", []), v, cache)
    s_venta = _senales(cfg.get("venta", []), v, cache)
    en_periodo = (v["t"] >= desde) & (v["t"] < hasta)
    # la vela de la señal tiene que haber cerrado antes del final, y la entrada existir en los datos
    validas = en_periodo & (v["i1"] + 1 < len(m1["t"]))
    atr = rma(rango_verdadero(v["h"], v["l"], v["c"]), int(cfg.get("atr_n", 14)))
    k_sl, rr = float(cfg.get("sl_atr", 1.5)), float(cfg.get("rr", 2.0))

    def preparar(idx_compra, idx_venta):
        ks = np.r_[idx_compra, idx_venta].astype(np.int64)
        dirs = np.r_[np.ones(len(idx_compra), np.int64), -np.ones(len(idx_venta), np.int64)]
        ok = np.isfinite(atr[ks]) & (atr[ks] > 0)
        ks, dirs = ks[ok], dirs[ok]
        ie = v["i1"][ks] + 1
        ent = m1["o"][ie]
        dist = k_sl * atr[ks]
        return ie, dirs, ent - dirs * dist, ent + dirs * rr * dist

    kc, kv = np.flatnonzero(s_compra & validas), np.flatnonzero(s_venta & validas)
    ie, dirs, sl, tp = preparar(kc, kv)
    max_min = int(cfg.get("max_velas", 0)) * tf
    sim = MO.simular(m1, ie, dirs, sl, tp, np.zeros(len(ie)), max_min=max_min)
    ops = _ops(sim)
    if len(ops) == 0:
        raise ValueError("Las reglas no generaron ninguna operación en el período")
    vol = EJ.Volatilidad(m1)
    perfil = cfg.get("perfil_costos", "base")
    if perfil not in PERFILES:
        raise ValueError("perfil de costos inválido")
    r_perfil = {}
    for p in PERFILES:
        r_perfil[p] = EJ.aplicar(ops, simbolo, vol, "costos_md" if p == "costos_md" else p).r.values if p != "costos_md" else _costos_md(ops, simbolo)
    r = r_perfil[perfil]
    t = ops.t.values
    sel_e, sel_v = t < corte, t >= corte
    fmt = lambda ms: pd.Timestamp(ms, unit="ms", tz="UTC").strftime("%Y-%m-%d")  # noqa: E731
    muestras = {"eleccion": (sel_e, f"{cfg['desde']} → {fmt(corte)}"), "validacion": (sel_v, f"{fmt(corte)} → {cfg['hasta']}"),
                "total": (np.ones(len(r), bool), f"{cfg['desde']} → {cfg['hasta']}")}
    metricas = {k: _metricas(r[s], ops[s], per, perfil) for k, (s, per) in muestras.items()}

    # ---------------------------------------------------------------- contra el azar
    rng = np.random.default_rng(0)
    elegibles = np.flatnonzero(validas & np.isfinite(atr))
    medias_azar = []
    if len(elegibles) > 10:
        nc, nv = int((ops.dir > 0).sum()), int((ops.dir < 0).sum())
        for _ in range(N_AZAR):
            a = np.sort(rng.choice(elegibles, size=min(len(elegibles), nc), replace=False)) if nc else np.array([], np.int64)
            b = np.sort(rng.choice(elegibles, size=min(len(elegibles), nv), replace=False)) if nv else np.array([], np.int64)
            ie2, d2, sl2, tp2 = preparar(a, b)
            s2 = MO.simular(m1, ie2, d2, sl2, tp2, np.zeros(len(ie2)), max_min=max_min)
            if len(s2["r"]):
                medias_azar.append(float(np.mean(s2["r"])))
    # la comparación es en R brutos (sin costos) en los dos lados: el costo por operación es parecido y así no se repite
    media = float(np.mean(r))
    media_bruta = float(np.mean(r_perfil["sin_costos"]))
    p_azar = float((np.sum(np.array(medias_azar) >= media_bruta) + 1) / (len(medias_azar) + 1)) if medias_azar else None

    # ---------------------------------------------------------------- pruebas múltiples
    huella = hashlib.sha256(json.dumps({k: cfg[k] for k in sorted(cfg) if k not in ("nombre",)}, sort_keys=True).encode()).hexdigest()[:16]
    sr = VA.sharpe(r[sel_e]) if sel_e.sum() > 2 else float("nan")
    n_pruebas, var_sr = contar_prueba(usuario, huella, sr if np.isfinite(sr) else None)
    var_ref = var_sr if var_sr is not None else 0.5 / max(sel_e.sum(), 1)  # sin historia: varianza de un Sharpe nulo con n operaciones
    dsr = VA.dsr(r[sel_e], n_pruebas, var_ref) if sel_e.sum() > 2 else float("nan")

    # ---------------------------------------------------------------- Monte Carlo y costos
    anios = max((hasta - desde) / (365.25 * 86_400_000), 0.1)
    mc = MC.tabla_riesgo(r, len(r) / anios, anios=5, n_sim=4000)
    sens = [dict(perfil=p, **{k: (round(float(r_perfil[p][s].mean()), 4) if s.any() else None) for k, (s, _) in muestras.items()}) for p in PERFILES]
    anio = pd.to_datetime(ops.t, unit="ms", utc=True).dt.year.values
    por_anio = [dict(anio=int(y), n=int((anio == y).sum()), acierto=round(float((r[anio == y] > 0).mean() * 100), 1),
                     expectativa=round(float(r[anio == y].mean()), 4), r_total=round(float(r[anio == y].sum()), 3),
                     muestra="eleccion" if (t[anio == y] < corte).all() else "validacion" if (t[anio == y] >= corte).all() else "mixta")
                for y in sorted(set(anio))]
    motivo = {1: "TP", -1: "SL", 2: "tiempo", 3: "fin"}
    operaciones = [dict(entrada_ms=int(x.t), salida_ms=int(x.t_salida), lado="compra" if x.dir > 0 else "venta",
                        precio_entrada=round(float(x.entrada), 5), precio_salida=round(float(x.salida), 5), sl=round(float(x.sl), 5),
                        tp=round(float(x.tp), 5), motivo=motivo.get(int(x.motivo), "fin"), r=round(float(rv), 4),
                        muestra="eleccion" if x.t < corte else "validacion")
                   for x, rv in zip(ops.itertuples(), r)]

    val = metricas["validacion"]
    g = {x["clave"]: x["valor"] for x in val}
    criterios = [
        dict(nombre="Hay suficientes operaciones en validación (≥ 30)", ok=(g["n"] or 0) >= 30),
        dict(nombre="Validación positiva después de costos", ok=(g.get("expectancy") or -1) > 0),
        dict(nombre="IC 95 % de la validación por encima de 0", ok=(g.get("ic_lo") or -1) > 0),
        dict(nombre="Le gana al azar del mismo lado (p < 0,05)", ok=p_azar is not None and p_azar < 0.05),
        dict(nombre=f"Deflated Sharpe ≥ 0,95 con {n_pruebas} pruebas", ok=bool(np.isfinite(dsr) and dsr >= 0.95)),
        dict(nombre="Sigue positiva con costos conservadores", ok=bool(r_perfil["conservador"].mean() > 0)),
    ]
    pasa = sum(c["ok"] for c in criterios)
    veredicto = ("Supera todos los controles: candidata para una prueba a futuro (no es una garantía)." if pasa == len(criterios) else
                 f"No supera {len(criterios) - pasa} de {len(criterios)} controles: no hay evidencia de ventaja.")
    return dict(
        huella=huella, simbolo=simbolo, temporalidad=tf, perfil_costos=perfil, corte_validacion=fmt(corte),
        metricas=metricas, por_anio=por_anio, sensibilidad_costos=sens, operaciones=operaciones[-3000:],
        azar=dict(simulaciones=len(medias_azar), media_observada=round(media_bruta, 4),
                  media_azar=round(float(np.mean(medias_azar)), 4) if medias_azar else None,
                  p95_azar=round(float(np.quantile(medias_azar, 0.95)), 4) if medias_azar else None, p=p_azar),
        pruebas=dict(acumuladas=n_pruebas, sharpe_eleccion=round(float(sr), 4) if np.isfinite(sr) else None,
                     deflated_sharpe=round(float(dsr), 4) if np.isfinite(dsr) else None,
                     varianza_usada=round(float(var_ref), 6), fuente_varianza="tus pruebas" if var_sr is not None else "Sharpe nulo (primera prueba)"),
        montecarlo=[{k: (round(float(x), 4) if isinstance(x, (float, np.floating)) else int(x)) for k, x in fila.items()} for fila in mc.to_dict("records")],
        criterios=criterios, veredicto=veredicto, segundos=round(time.time() - t0, 2),
        avisos=[
            "Contra el azar se compara en R sin costos (los dos lados pagarían costos parecidos).",
            "Precios bid de 1 minuto; spread, deslizamiento y swaps se cobran según el perfil de costos.",
            "La muestra de validación no se usa para nada: si mirás sus resultados y cambiás las reglas, deja de ser limpia (y la prueba cuenta igual).",
            "Cada configuración distinta que probás suma una prueba: el Deflated Sharpe castiga probar muchas variantes.",
        ],
    )


def _costos_md(ops: pd.DataFrame, simbolo: str) -> np.ndarray:
    """Costo fijo de docs/costos.md (como el motor del laboratorio con costo de referencia)."""
    riesgo = np.abs(ops.entrada.values - ops.sl.values)
    c = np.asarray(LD.costo(simbolo, ops.entrada.values), float)
    return (ops.dir.values * (ops.salida.values - ops.entrada.values) - c) / riesgo
