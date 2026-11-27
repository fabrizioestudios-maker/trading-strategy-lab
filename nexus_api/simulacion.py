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

from lab import datos as LD, motor, smc

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
            texto = ("Pendiente: se llena si el precio toca la entrada." if o.get("tipo") == "limite"
                     else "Se llena a mercado en la apertura del próximo minuto.")
            out.append(dict(base, estado="esperando_llenado", explicacion=texto))
            continue
        trunc = {k: np.asarray(m[k][: j + 1]) for k in ("t", "o", "h", "l", "c")}
        if o.get("tipo", "mercado") == "limite":
            out.append(_limite(simbolo, o, base, trunc, j0, j))
            continue
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


def validar_limite(o: dict) -> None:
    e, sl, tp = o.get("entrada"), float(o["sl"]), float(o["tp"])
    if not e:
        raise ValueError(f"Orden {o['id']}: una orden límite necesita precio de entrada")
    if o["lado"] == "compra" and not (sl < e < tp):
        raise ValueError(f"Orden {o['id']}: en una compra límite el stop va debajo de la entrada y el objetivo arriba")
    if o["lado"] == "venta" and not (tp < e < sl):
        raise ValueError(f"Orden {o['id']}: en una venta límite el stop va arriba de la entrada y el objetivo debajo")


def _limite(simbolo, o, base, trunc, j0, j):
    """Orden límite con el simulador del laboratorio (lab/smc.simular_ordenes), solo con minutos revelados."""
    d = 1 if o["lado"] == "compra" else -1
    ent = float(o["entrada"])
    crea = j0 + 1
    vence = crea + int(o.get("vence_minutos", 240)) - 1
    costo = float(LD.costo(simbolo, ent)) if simbolo in LD.COSTOS else 0.0
    est, r, t_in, t_out = smc.simular_ordenes(
        trunc["o"], trunc["h"], trunc["l"], trunc["c"], np.array([crea]), np.array([vence]), np.array([d]), np.array([ent]),
        np.array([float(o["sl"])]), np.array([float(o["tp"])]), np.array([costo]), False, 2.0)
    e = int(est[0])
    riesgo = abs(ent - float(o["sl"]))
    costo_r = round(costo / riesgo, 4) if riesgo > 0 else None
    if e == 2:
        return dict(base, estado="cancelada", explicacion="Cancelada: el precio llegó al objetivo antes de tocar la entrada (regla del laboratorio).")
    if e == 3:
        if vence > j:  # todavía no venció: los minutos que faltan no se revelaron
            return dict(base, estado="esperando_llenado", explicacion=f"Pendiente en {ent:.2f}: vence a los {int(o.get('vence_minutos', 240))} minutos de mercado.")
        return dict(base, estado="vencida", explicacion="Vencida sin llenarse.")
    if e == 0:
        return dict(base, estado="rechazada", explicacion="No se pudo evaluar la orden.")
    ii, io = int(t_in[0]), int(t_out[0])
    px_in = min(ent, float(trunc["o"][ii])) if d == 1 else max(ent, float(trunc["o"][ii]))
    fila = dict(base, entrada_ms=int(trunc["t"][ii]), precio_entrada=round(px_in, 2), r=round(float(r[0]), 4), costo_r=costo_r)
    if e == 4:
        return dict(fila, estado="abierta", precio_salida=round(float(trunc["c"][j]), 2),
                    explicacion="Llenada al tocar la entrada. Abierta: el R no realizado se mide al cierre del último minuto revelado.")
    # precio de salida reconstruido de r = ((salida − llenado)·d − costo) / riesgo (el stop puede llenarse peor por hueco)
    salida = px_in + d * (float(r[0]) * riesgo + costo)
    return dict(fila, estado="cerrada", salida_ms=int(trunc["t"][io]), motivo="TP" if e == 1 else "SL", precio_salida=round(salida, 2),
                explicacion=f"Llenada al tocar la entrada; cerrada en {'el objetivo' if e == 1 else 'el stop'} el {SE.texto_ny(int(trunc['t'][io]))}.")


def cuenta(svc, simbolo: str, limite_ms: int, capital: float, apalancamiento: float, ordenes: list[dict]) -> dict:
    """Cuenta simulada en el límite: resultado en dinero de cada orden con lotes, equidad y margen supuesto."""
    est = estados(svc, simbolo, limite_ms, ordenes)
    contrato = float(svc.meta(simbolo)["contrato"])
    realizado = abierto = margen = 0.0
    abiertas = cerradas = sin = 0
    por = []
    for o, e in zip(ordenes, est):
        lot = o.get("lotes")
        dinero = None
        if not lot:
            sin += 1
        elif e["r"] is not None and e["precio_entrada"] is not None:
            entrada_plan = float(o["entrada"]) if o.get("tipo") == "limite" else float(e["precio_entrada"])
            dinero = float(e["r"]) * abs(entrada_plan - float(o["sl"])) * float(lot) * contrato
            if e["estado"] == "cerrada":
                realizado += dinero
                cerradas += 1
            elif e["estado"] == "abierta":
                abierto += dinero
                abiertas += 1
                margen += float(e["precio_entrada"]) * float(lot) * contrato / apalancamiento
        por.append(dict(id=e["id"], estado=e["estado"], resultado_moneda=None if dinero is None else round(dinero, 2)))
    equidad = capital + realizado + abierto
    return dict(capital=round(capital, 2), realizado=round(realizado, 2), abierto=round(abierto, 2), equidad=round(equidad, 2),
                margen=round(margen, 2), margen_libre=round(equidad - margen, 2),
                nivel_margen_pct=round(equidad / margen * 100, 2) if margen > 0 else None, apalancamiento=apalancamiento,
                abiertas=abiertas, cerradas=cerradas, sin_tamano=sin, por_orden=por,
                supuestos=[f"Apalancamiento supuesto 1:{apalancamiento:g} (FTMO usa 1:50 en metales; cambialo en Ajustes).",
                           "Resultados con los costos de docs/costos.md, el mismo motor que las órdenes (SL primero).",
                           f"Contrato de {contrato:g} unidades por lote. Sin swaps: el replay no cobra financiación nocturna."])
