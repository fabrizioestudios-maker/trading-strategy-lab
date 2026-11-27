"""
Referencias de NEXUS: definiciones que la interfaz muestra tal cual (sesiones, perfiles de costos, estados). Se arman
desde las constantes del código que las usa (nexus_api/sesiones.py y lab/ejecucion.py) para que no se desincronicen.
"""
from __future__ import annotations

from lab import ejecucion as EJ

from . import sesiones as SE
from .datos import TEMPORALIDADES


def _hhmm(m: int) -> str:
    m %= 24 * 60
    return f"{m // 60:02d}:{m % 60:02d}"


NOMBRES_PERFIL = {
    "sin_costos": ("Sin costos", "Solo el movimiento bruto: sirve para ver cuánto se come la ejecución, no para decidir."),
    "optimista": ("Optimista", "75 % del spread de referencia, sin deslizamiento ni latencia, swap base."),
    "base": ("Base", "Spread de referencia por sesión y volatilidad, deslizamiento y 100 ms de latencia, swap base."),
    "conservador": ("Conservador", "1,5 × spread y deslizamiento, 250 ms de latencia, swap adverso."),
    "estres": ("Estrés", "3 × spread y deslizamiento, 500 ms de latencia, swap adverso."),
}

ESTADOS_ORDEN = [
    ("posterior_al_limite", "La orden se creó en un límite posterior al actual (se retrocedió el replay): todavía no existe."),
    ("esperando_llenado", "Creada en el último minuto revelado: se llena a mercado en la apertura del minuto siguiente."),
    ("rechazada", "La apertura de llenado ya estaba más allá del stop o del objetivo (regla del motor)."),
    ("abierta", "Llenada y sin tocar stop ni objetivo: el R no realizado se mide al cierre del último minuto revelado."),
    ("cerrada", "Tocó el objetivo o el stop. Si los dos caen en el mismo minuto, cuenta el stop."),
]

ESTADOS_TRABAJO = [
    ("enviado", "Recibido con su configuración inmutable."),
    ("en_cola", "Esperando: corre un trabajo a la vez."),
    ("corriendo", "En ejecución; cada etapa queda en el registro con su hora."),
    ("terminado", "Resultado guardado en registro/nexus/corridas con su procedencia."),
    ("fallido", "Terminó con error (o se interrumpió al reiniciar la API). El registro dice por qué."),
    ("cancelado", "Cancelado antes de terminar; no hay resultado."),
]


def referencias() -> dict:
    sesiones = [
        dict(nombre="Asia", desde_ny=_hhmm(SE.ASIA[0]), hasta_ny=_hhmm(SE.ASIA[1]), dias="domingo a jueves (abre a la tarde)", nota=None),
        dict(nombre="Londres", desde_ny=_hhmm(SE.LONDRES[0]), hasta_ny=_hhmm(SE.LONDRES[1]), dias="lunes a viernes", nota=None),
        dict(nombre="Nueva York", desde_ny=_hhmm(SE.NUEVA_YORK[0]), hasta_ny=_hhmm(SE.NUEVA_YORK[1]), dias="lunes a viernes", nota=None),
        dict(nombre="Cierre", desde_ny=_hhmm(SE.CIERRE[0]), hasta_ny=_hhmm(SE.CIERRE[1]), dias="lunes a viernes", nota="Pausa diaria del mercado."),
        dict(nombre="Reapertura", desde_ny=_hhmm(SE.REAPERTURA[0]), hasta_ny=_hhmm(SE.REAPERTURA[1]), dias="domingo a jueves",
             nota="Dentro de Asia. Bid deprimido por el spread: el laboratorio no entra antes de las 18:15 (E041, E042)."),
    ]
    perfiles = [dict(clave="costos_md", nombre="docs/costos.md", descripcion="Costo fijo ida y vuelta de docs/costos.md (el de las fichas y E042).",
                     escala_spread=None, deslizamiento=None, latencia_ms=None, por_sesion=False, por_volatilidad=False, swap=None)]
    for k, p in EJ.PERFILES.items():
        nombre, desc = NOMBRES_PERFIL.get(k, (k, ""))
        perfiles.append(dict(clave=k, nombre=nombre, descripcion=desc, escala_spread=float(p["escala"]), deslizamiento=float(p["desliz"]),
                             latencia_ms=int(p["latencia_ms"]), por_sesion=bool(p["sesion"]), por_volatilidad=bool(p["vol"]), swap=p["swap"]))
    franjas = ", ".join(f"{_hhmm(a)}–{_hhmm(b)} × {k:g}" for a, b, k in EJ.SESION_MULT)
    swaps = "; ".join(f"{clase}: base {v['base'][0]:+.3f} / {v['base'][1]:+.3f}, adverso {v['adverso'][0]:+.3f} / {v['adverso'][1]:+.3f}"
                      for clase, v in EJ.SWAPS.items())
    supuestos = [
        f"Spread: {EJ.PARTE_SPREAD:g} del costo ida y vuelta de docs/costos.md, por la escala del perfil.",
        f"Multiplicador del spread por franja de Nueva York (Londres = 1): {franjas}.",
        f"Deslizamiento: {EJ.K_ENTRADA:g} · σ de 1 minuto en entradas a mercado y {EJ.K_STOP:g} · σ en salidas por stop; el objetivo es límite y no desliza.",
        "Latencia: σ de 1 minuto · √(latencia / 60 s) en contra, por cada pierna a mercado.",
        f"Swaps en % del nominal por noche (largo / corto), miércoles triple: {swaps}.",
        "Los multiplicadores son supuestos documentados: no hay spreads históricos gratuitos del bróker (lab/ejecucion.py).",
    ]
    return dict(temporalidades=list(TEMPORALIDADES), zona_sesiones="America/New_York", sesiones=sesiones, perfiles_costos=perfiles,
                supuestos_costos=supuestos, estados_orden=[dict(clave=k, texto=t) for k, t in ESTADOS_ORDEN],
                estados_trabajo=[dict(clave=k, texto=t) for k, t in ESTADOS_TRABAJO])
