"""
Calendario de sesiones del oro en hora de Nueva York (con horario de verano), para el replay y los informes.

Sesiones (minutos de Nueva York, como `lab/ficha.py` y la bitácora):
  Asia 18:00–02:00 · Londres 02:00–08:00 · Nueva York 08:00–17:00 · Cierre 17:00–18:00 (mercado cerrado).
Reapertura 18:00–18:15: el bid de la reapertura está deprimido por el spread (BITACORA entradas 34–35, E041/E042);
se marca como aviso y las estrategias entran desde las 18:15.

Las ventanas son hechos del calendario: no dependen de precios, así que mostrarlas no filtra información del futuro.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
UTC = timezone.utc

ASIA = (18 * 60, 26 * 60)  # 18:00 → 02:00 del día siguiente
LONDRES = (2 * 60, 8 * 60)
NUEVA_YORK = (8 * 60, 17 * 60)
CIERRE = (17 * 60, 18 * 60)
REAPERTURA = (18 * 60, 18 * 60 + 15)


def a_ny(t_ms: int) -> datetime:
    return datetime.fromtimestamp(t_ms / 1000, tz=UTC).astimezone(NY)


def minuto_ny(t_ms: int) -> int:
    d = a_ny(t_ms)
    return d.hour * 60 + d.minute


def sesion(t_ms: int) -> str:
    m = minuto_ny(t_ms)
    if m >= ASIA[0] or m < LONDRES[0]:
        return "Asia"
    if m < LONDRES[1]:
        return "Londres"
    if m < NUEVA_YORK[1]:
        return "Nueva York"
    return "Cierre"


def en_reapertura(t_ms: int) -> bool:
    m = minuto_ny(t_ms)
    return REAPERTURA[0] <= m < REAPERTURA[1]


def texto_ny(t_ms: int) -> str:
    d = a_ny(t_ms)
    return d.strftime("%Y-%m-%d %H:%M") + " NY"


def iso(t_ms: int) -> str:
    return datetime.fromtimestamp(t_ms / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ms(d: datetime) -> int:
    return int(d.timestamp() * 1000)


def ventanas(desde_ms: int, hasta_ms: int) -> list[dict]:
    """Ventanas de sesión que se cruzan con [desde_ms, hasta_ms]. Fines de semana sin Asia/Londres/NY."""
    out = []
    dia = (a_ny(desde_ms) - timedelta(days=1)).date()
    fin = a_ny(hasta_ms).date() + timedelta(days=1)
    while dia <= fin:
        base = datetime(dia.year, dia.month, dia.day, tzinfo=NY)
        def en(m):  # minuto del día de NY → datetime con la zona aplicada en esa fecha (DST correcto)
            d = base + timedelta(minutes=m)
            return datetime(d.year, d.month, d.day, d.hour, d.minute, tzinfo=NY)
        wd = dia.weekday()  # 0 = lunes
        tramos = []
        if wd in (6, 0, 1, 2, 3):  # domingo a jueves por la tarde abre Asia
            tramos.append(("Reapertura", en(REAPERTURA[0]), en(REAPERTURA[1]), "Bid deprimido por el spread de la reapertura: no operar antes de las 18:15 NY (E041, E042)."))
            tramos.append(("Asia", en(ASIA[0]), en(ASIA[1]), None))
        if wd in (0, 1, 2, 3, 4):
            tramos.append(("Londres", en(LONDRES[0]), en(LONDRES[1]), None))
            tramos.append(("Nueva York", en(NUEVA_YORK[0]), en(NUEVA_YORK[1]), None))
            tramos.append(("Cierre", en(CIERRE[0]), en(CIERRE[1]), "Mercado cerrado (pausa diaria)."))
        for nombre, a, b, aviso in tramos:
            a_ms, b_ms = _ms(a), _ms(b)
            if b_ms > desde_ms and a_ms <= hasta_ms:
                out.append(dict(nombre=nombre, desde_ms=a_ms, hasta_ms=b_ms, aviso=aviso))
        dia += timedelta(days=1)
    out.sort(key=lambda x: x["desde_ms"])
    return out


DIAS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


def proxima_entrada_1815(t_ms: int) -> str:
    """Próximas 18:15 NY en o después de t_ms (día hábil), en texto."""
    d = a_ny(t_ms)
    c = datetime(d.year, d.month, d.day, 18, 15, tzinfo=NY)
    if c < d:
        c = c + timedelta(days=1)
    while c.weekday() in (4, 5):  # viernes 18:15 y sábado no hay mercado
        c = c + timedelta(days=1)
    c = datetime(c.year, c.month, c.day, 18, 15, tzinfo=NY)
    return f"{DIAS[c.weekday()]} {c:%Y-%m-%d} 18:15 NY"


def estado_mercado(ahora_ms: int) -> dict:
    """
    Horario del oro al contado (y del FX): abre el domingo 18:00 NY y cierra el viernes 17:00 NY, con una pausa diaria de
    17:00 a 18:00 NY de lunes a jueves. No considera feriados (se avisa).
    """
    d = a_ny(ahora_ms)
    m = d.hour * 60 + d.minute
    wd = d.weekday()  # 0 = lunes
    def en(dias, hh):
        base = datetime(d.year, d.month, d.day, tzinfo=NY) + timedelta(days=dias)
        return int(datetime(base.year, base.month, base.day, hh, 0, tzinfo=NY).timestamp() * 1000)
    if wd == 5 or (wd == 4 and m >= 17 * 60) or (wd == 6 and m < 18 * 60):
        dias = {4: 2, 5: 1, 6: 0}[wd]
        abierto, prox, cuando = False, "apertura", en(dias, 18)
        motivo = "fin de semana"
    elif 17 * 60 <= m < 18 * 60:
        abierto, prox, cuando, motivo = False, "apertura", en(0, 18), "pausa diaria"
    else:
        abierto, prox, motivo = True, "cierre", None
        cuando = en(0, 17) if m < 17 * 60 else en(1, 17)
        if wd == 4 or (wd == 3 and m >= 18 * 60):
            motivo = "cierra el viernes"
    falta = max(0, cuando - ahora_ms)
    h, mi = falta // 3600000, (falta % 3600000) // 60000
    texto = f"{'Abierto' if abierto else 'Cerrado'}: {'cierra' if abierto else 'abre'} en {h} h {mi} min ({SE_hora(cuando)})"
    return dict(abierto=abierto, motivo=motivo, proximo=prox, proximo_ms=cuando, texto=texto, ahora_ms=ahora_ms,
                nota="Horario de referencia del oro y el FX. No considera feriados.")


def SE_hora(t_ms: int) -> str:
    return DIAS[a_ny(t_ms).weekday()] + " " + a_ny(t_ms).strftime("%H:%M") + " NY"
