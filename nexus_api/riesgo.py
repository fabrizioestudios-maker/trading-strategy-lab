"""
Tamaño de posición y riesgo de una orden simulada (Execution Engine). Un solo lugar para este cálculo: la interfaz no
lo repite.

- Riesgo en moneda = capital × riesgo %.
- Lotes = riesgo en moneda / (distancia al stop × tamaño del contrato), redondeado HACIA ABAJO al paso de lote (nunca
  se arriesga más de lo pedido por el redondeo).
- Costo ida y vuelta por la tabla de docs/costos.md (`lab.datos.costo`), expresado en moneda y en R.
- Moneda de cotización = moneda de la cuenta solo para instrumentos que cotizan en USD con cuenta en USD; en otro caso
  se avisa (no se convierte con un tipo de cambio inventado).
"""
from __future__ import annotations

import math

from lab import datos as LD

from .datos import META


def calcular(simbolo: str, capital: float, riesgo_pct: float, entrada: float, stop: float, objetivo: float | None = None,
             paso_lote: float = 0.01) -> dict:
    if simbolo not in META:
        raise KeyError(simbolo)
    if entrada == stop:
        raise ValueError("La entrada y el stop no pueden ser iguales")
    m = META[simbolo]
    lado = "compra" if stop < entrada else "venta"
    if objetivo is not None and ((lado == "compra" and objetivo <= entrada) or (lado == "venta" and objetivo >= entrada)):
        raise ValueError("El objetivo tiene que estar del lado de la ganancia")
    contrato = m["contrato"]
    dist = abs(entrada - stop)
    riesgo_moneda = capital * riesgo_pct / 100.0
    lotes_exactos = riesgo_moneda / (dist * contrato)
    lotes = math.floor(lotes_exactos / paso_lote + 1e-9) * paso_lote
    lotes = round(lotes, 8)
    riesgo_real = lotes * dist * contrato
    costo_precio = float(LD.costo(simbolo, entrada)) if simbolo in LD.COSTOS else 0.0
    costo_moneda = costo_precio * contrato * lotes
    out = dict(lado=lado, riesgo_moneda=round(riesgo_moneda, 2), distancia_stop=round(dist, m["decimales"]), lotes=lotes,
               riesgo_real_moneda=round(riesgo_real, 2), costo_ida_vuelta_moneda=round(costo_moneda, 2),
               costo_en_r=round(costo_precio / dist, 4), rr=None, ganancia_objetivo_moneda=None,
               supuestos=[
                   f"Tamaño del contrato: {contrato:g} unidades por lote ({simbolo}).",
                   "Lotes redondeados hacia abajo al paso de lote.",
                   "Costo ida y vuelta de docs/costos.md (spread + deslizamiento de referencia).",
                   "Simulación: NEXUS no envía órdenes a ningún bróker.",
               ], avisos=[])
    if objetivo is not None:
        out["rr"] = round(abs(objetivo - entrada) / dist, 2)
        out["ganancia_objetivo_moneda"] = round(lotes * abs(objetivo - entrada) * contrato, 2)
    if lotes == 0:
        out["avisos"].append("Con este capital y este stop no alcanza para el lote mínimo: el riesgo pedido es menor que 1 paso de lote.")
    if m["moneda"] != "USD":
        out["avisos"].append(f"{simbolo} cotiza en {m['moneda']}: los montos están en {m['moneda']}, no en la moneda de la cuenta.")
    if out["costo_en_r"] > 0.2:
        out["avisos"].append("El costo supera 0,2 R por operación: con stops tan cortos el costo se come gran parte de la ventaja.")
    return out
