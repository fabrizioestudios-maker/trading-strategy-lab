"""
Órdenes simuladas dentro del replay (Execution Engine). Sin bróker: NEXUS no envía órdenes reales.

Cada orden se crea en un límite de replay (el último minuto revelado cuando el usuario la pidió). Su estado en otro
límite se calcula con el MISMO motor del laboratorio (`lab.motor.simular`) alimentado solo con los minutos revelados
hasta ese límite, así que:
- se llena a mercado en la apertura del minuto siguiente a su creación (como las estrategias del laboratorio);
- si en un minuto se tocan el SL y el TP, cuenta el SL;
- si la apertura de llenado ya pasó el SL o el TP, la orden se rechaza (regla del motor);
- mientras no toque nada, está abierta y su R no realizado se mide al cierre del último minuto revelado.
El cálculo es determinista y sin estado: el mismo pedido da siempre la misma respuesta.
"""
from __future__ import annotations

import numpy as np

from lab import datos as LD, motor

from . import sesiones as SE


def estados(svc, simbolo: str, limite_ms: int, ordenes: list[dict]) -> list[dict]:
    m = svc.m1(simbolo)
    j = svc.indice_limite(simbolo, limite_ms)
    out = []
    for o in ordenes:
        base = dict(id=o["id"], estado="posterior_al_limite", entrada_ms=None, precio_entrada=None, salida_ms=None,
                    precio_salida=None, motivo=None, r=None, costo_r=None, explicacion="")
        j0 = svc.indice_limite(simbolo, int(o["creada_limite_ms"]))
        d = 1 if o["lado"] == "compra" else -1
        if j0 < 0 or j0 > j:
            out.append(dict(base, explicacion="La orden se creó después del límite actual (se retrocedió el replay)."))
            continue
        if j < j0 + 1:
            out.append(dict(base, estado="esperando_llenado", explicacion="Se llena a mercado en la apertura del próximo minuto."))
            continue
        trunc = {k: np.asarray(m[k][: j + 1]) for k in ("t", "o", "h", "l", "c")}
        ent = float(trunc["o"][j0 + 1])
        costo = np.array([float(LD.costo(simbolo, ent))]) if simbolo in LD.COSTOS else np.array([0.0])
        r = motor.simular(trunc, np.array([j0 + 1]), np.array([d]), np.array([float(o["sl"])]), np.array([float(o["tp"])]), costo)
        if len(r["r"]) == 0:
            out.append(dict(base, estado="rechazada", entrada_ms=int(trunc["t"][j0 + 1]), precio_entrada=round(ent, 2),
                            explicacion="La apertura de llenado ya estaba más allá del stop o del objetivo (regla del motor)."))
            continue
        riesgo = abs(ent - float(o["sl"]))
        fila = dict(base, entrada_ms=int(trunc["t"][j0 + 1]), precio_entrada=round(ent, 2), r=round(float(r["r"][0]), 4),
                    costo_r=round(float(costo[0]) / riesgo, 4) if riesgo > 0 else None)
        if SE.en_reapertura(int(trunc["t"][j0 + 1])):
            fila["explicacion"] = "Llenada en la reapertura (18:00–18:15 NY): el bid está deprimido por el spread y el precio es poco representativo (E041). "
        mot = int(r["motivo"][0])
        if mot in (1, -1):
            si = int(r["salida_i"][0])
            out.append(dict(fila, estado="cerrada", salida_ms=int(trunc["t"][si]), precio_salida=round(float(r["salida"][0]), 2),
                            motivo="TP" if mot == 1 else "SL",
                            explicacion=fila["explicacion"] + f"Cerrada en {'el objetivo' if mot == 1 else 'el stop'} el {SE.texto_ny(int(trunc['t'][si]))}."))
        else:
            out.append(dict(fila, estado="abierta", precio_salida=round(float(trunc["c"][j]), 2),
                            explicacion=fila["explicacion"] + "Abierta: el R no realizado se mide al cierre del último minuto revelado."))
    return out
