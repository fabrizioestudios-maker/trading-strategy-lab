"""
Servicio de datos de NEXUS: catálogo de instrumentos, velas por ventanas y límite de replay sin futuro.

Reglas que este módulo garantiza (y prueban tests/test_nexus_replay.py):
- El límite de replay es la apertura del último minuto revelado (`limite_ms`). Nunca se devuelve un minuto posterior.
- Las velas completas de cualquier temporalidad contienen solo minutos anteriores al límite; la vela en formación se
  arma solo con los minutos revelados (`parcial=True`). Mismas reglas de agregación que `lab.datos.velas`
  (H4 y D1 alineadas a las 17:00 de Nueva York).
- Al navegador se le mandan ventanas, nunca la historia completa en M1.

Los datos son los del laboratorio (`data/<INSTRUMENTO>.npz`, git-ignored). Si no están, el servicio lo dice: no
inventa precios. Se cachean descomprimidos en `data/.cache_nexus/` para abrirlos con mmap.
"""
from __future__ import annotations

import csv
import os
import threading
import time
from dataclasses import dataclass

import numpy as np

from lab import datos as LD

from .sintetico import FUENTE as FUENTE_SINTETICA  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "data")

TEMPORALIDADES = (1, 5, 15, 60, 240, 1440)

META = {
    "XAUUSD": dict(nombre="Oro / dólar", clase="metal", moneda="USD", decimales=2, contrato=100.0),
    "XAGUSD": dict(nombre="Plata / dólar", clase="metal", moneda="USD", decimales=3, contrato=5000.0),
    "EURUSD": dict(nombre="Euro / dólar", clase="forex", moneda="USD", decimales=5, contrato=100000.0),
    "GBPUSD": dict(nombre="Libra / dólar", clase="forex", moneda="USD", decimales=5, contrato=100000.0),
    "USDJPY": dict(nombre="Dólar / yen", clase="forex", moneda="JPY", decimales=3, contrato=100000.0),
    "AUDUSD": dict(nombre="Dólar australiano / dólar", clase="forex", moneda="USD", decimales=5, contrato=100000.0),
    "USDCAD": dict(nombre="Dólar / dólar canadiense", clase="forex", moneda="CAD", decimales=5, contrato=100000.0),
    "SPXUSD": dict(nombre="S&P 500", clase="indice", moneda="USD", decimales=2, contrato=1.0),
    "NSXUSD": dict(nombre="Nasdaq 100", clase="indice", moneda="USD", decimales=2, contrato=1.0),
}
FUENTE = {
    "XAUUSD": "HistData M1 (bid) hasta el 13/11/2026 y Dukascopy después; ver data/README.md",
}
FUENTE_DEFECTO = "HistData M1 (bid), hora EST fija convertida a UTC; ver data/README.md"


def _costo_texto(simbolo: str) -> str:
    if simbolo not in LD.COSTOS:
        return "sin costo de referencia"
    tipo, v = LD.COSTOS[simbolo]
    # formato en español, como el resto de la interfaz: «0,0125 % del precio», «0,00014 en precio»
    txt = f"{v * 100:.4f}".rstrip("0").rstrip(".") if tipo == "pct" else f"{v:.10f}".rstrip("0").rstrip(".")
    txt = txt.replace(".", ",")
    return f"{txt} % del precio" if tipo == "pct" else f"{txt} en precio"


@dataclass
class Serie:
    t: np.ndarray
    o: np.ndarray
    h: np.ndarray
    l: np.ndarray
    c: np.ndarray
    i0: np.ndarray
    i1: np.ndarray


class DatosNoDisponibles(Exception):
    pass


class ServicioDatos:
    def __init__(self, carpeta: str = DATA, m1_inyectado: dict | None = None):
        """`m1_inyectado` ({simbolo: dict t,o,h,l,c}) permite probar sin archivos."""
        self.carpeta = carpeta
        self.sintetico = False  # True solo con `python -m nexus_api --sintetico` (datos de prueba, no de mercado)
        self._m1: dict[str, dict] = dict(m1_inyectado or {})
        self._series: dict[tuple[str, int], Serie] = {}
        self._calidad: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._manifiesto = self._leer_manifiesto()

    # ------------------------------------------------------------------ catálogo
    def _leer_manifiesto(self) -> dict:
        ruta = os.path.join(self.carpeta, "MANIFIESTO.csv")
        out = {}
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as f:
                for fila in csv.DictReader(f):
                    out[fila["archivo"]] = fila
        return out

    def disponible(self, simbolo: str) -> bool:
        return simbolo in self._m1 or os.path.exists(os.path.join(self.carpeta, f"{simbolo}.npz"))

    def instrumentos(self) -> list[dict]:
        out = []
        for s, m in META.items():
            fila = self._manifiesto.get(f"{s}.npz", {})
            disp = self.disponible(s)
            if s in self._m1:
                t = self._m1[s]["t"]
                desde, hasta, n = LD.pd.to_datetime(t[0], unit="ms").isoformat(), LD.pd.to_datetime(t[-1], unit="ms").isoformat(), len(t)
            else:
                desde, hasta = fila.get("desde") or None, fila.get("hasta") or None
                n = int(float(fila["velas"])) if fila.get("velas") else None
            out.append(dict(
                simbolo=s, nombre=m["nombre"], clase=m["clase"], moneda_cotizacion=m["moneda"], decimales=m["decimales"],
                tamano_contrato=m["contrato"], costo_referencia=_costo_texto(s), disponible=disp,
                cobertura_desde=desde, cobertura_hasta=hasta, velas_m1=n,
                fuente=FUENTE_SINTETICA if (self.sintetico and s in self._m1) else FUENTE.get(s, FUENTE_DEFECTO),
                huella_sha256=None if (self.sintetico and s in self._m1) else (fila.get("sha256") or None),
            ))
        return out

    def meta(self, simbolo: str) -> dict:
        if simbolo not in META:
            raise KeyError(simbolo)
        return META[simbolo]

    # ------------------------------------------------------------------ carga
    def m1(self, simbolo: str) -> dict:
        if simbolo in self._m1:
            return self._m1[simbolo]
        with self._lock:
            if simbolo in self._m1:
                return self._m1[simbolo]
            if simbolo not in META:
                raise KeyError(simbolo)
            ruta = os.path.join(self.carpeta, f"{simbolo}.npz")
            if not os.path.exists(ruta):
                raise DatosNoDisponibles(f"No hay datos de {simbolo} en este servidor ({os.path.relpath(ruta, RAIZ)}). "
                                         "Se regeneran con lab/descarga_histdata.py (ver data/README.md).")
            cache = os.path.join(self.carpeta, ".cache_nexus", simbolo)
            fila = self._manifiesto.get(f"{simbolo}.npz", {})
            huella = fila.get("sha256", "")
            marca = os.path.join(cache, "huella.txt")
            if not (os.path.exists(marca) and open(marca).read().strip() == huella and huella):
                z = np.load(ruta)
                os.makedirs(cache, exist_ok=True)
                for k in ("t", "o", "h", "l", "c"):
                    np.save(os.path.join(cache, f"{k}.npy"), z[k])
                with open(marca, "w") as f:
                    f.write(huella)
            self._m1[simbolo] = {k: np.load(os.path.join(cache, f"{k}.npy"), mmap_mode="r") for k in ("t", "o", "h", "l", "c")}
            return self._m1[simbolo]

    def serie(self, simbolo: str, tf: int) -> Serie:
        if tf not in TEMPORALIDADES:
            raise ValueError(f"Temporalidad no soportada: {tf}")
        clave = (simbolo, tf)
        if clave not in self._series:
            m = self.m1(simbolo)
            if tf == 1:
                n = len(m["t"])
                idx = np.arange(n)
                s = Serie(np.asarray(m["t"]), np.asarray(m["o"]), np.asarray(m["h"]), np.asarray(m["l"]), np.asarray(m["c"]), idx, idx)
            else:
                v = LD.velas({k: np.asarray(m[k]) for k in ("t", "o", "h", "l", "c")}, tf)
                s = Serie(v["t"], v["o"], v["h"], v["l"], v["c"], v["i0"], v["i1"])
            self._series[clave] = s
        return self._series[clave]

    # ------------------------------------------------------------------ límite y ventanas
    def indice_limite(self, simbolo: str, limite_ms: int) -> int:
        """Índice del último minuto revelado (t ≤ limite_ms). -1 si el límite es anterior a los datos."""
        t = self.m1(simbolo)["t"]
        return int(np.searchsorted(t, limite_ms, side="right")) - 1

    def extremos(self, simbolo: str) -> tuple[int, int]:
        t = self.m1(simbolo)["t"]
        return int(t[0]), int(t[-1])

    @staticmethod
    def cerrada_por_calendario(tf: int, inicio_vela_ms: int, limite_ms: int) -> bool:
        """La vela que empieza en inicio_vela_ms ya cerró en el límite si el minuto siguiente cae en otra vela.
        Se decide por el calendario (misma alineación que lab.datos), nunca mirando si hay datos posteriores."""
        if tf == 1:
            return True
        return int(LD._cubeta(np.array([limite_ms + 60000], np.int64), tf)[0]) != int(inicio_vela_ms)

    def velas_hasta(self, simbolo: str, tf: int, limite_ms: int, cantidad: int = 300) -> tuple[list[dict], bool]:
        """Últimas `cantidad` velas de `tf` minutos visibles en el límite. La última puede ser parcial."""
        cantidad = int(max(1, min(cantidad, 2000)))
        j = self.indice_limite(simbolo, limite_ms)
        if j < 0:
            return [], False
        s = self.serie(simbolo, tf)
        k = int(np.searchsorted(s.i0, j, side="right")) - 1  # vela que contiene el minuto j
        a = max(0, k - cantidad + 1)
        dec = self.meta(simbolo)["decimales"]
        r = lambda x: round(float(x), dec)  # noqa: E731
        out = [dict(t=int(s.t[i]), o=r(s.o[i]), h=r(s.h[i]), l=r(s.l[i]), c=r(s.c[i]), parcial=False) for i in range(a, k)]
        m = self.m1(simbolo)
        i0 = int(s.i0[k])
        t_lim = int(m["t"][j])
        if self.cerrada_por_calendario(tf, int(s.t[k]), t_lim):  # por calendario: todos sus minutos son ≤ límite
            out.append(dict(t=int(s.t[k]), o=r(s.o[k]), h=r(s.h[k]), l=r(s.l[k]), c=r(s.c[k]), parcial=False))
        else:  # en formación: solo minutos i0..j
            out.append(dict(t=int(s.t[k]), o=r(m["o"][i0]), h=r(np.max(m["h"][i0:j + 1])), l=r(np.min(m["l"][i0:j + 1])),
                            c=r(m["c"][j]), parcial=True))
        return out, a > 0

    def siguiente_limite(self, simbolo: str, tf: int, limite_ms: int, n: int = 1, unidad: str = "velas") -> tuple[int, int, bool]:
        """Nuevo límite al avanzar (n > 0) o retroceder (n < 0) n velas de `tf` o n minutos. Devuelve (limite, minutos, final)."""
        m = self.m1(simbolo)
        t = m["t"]
        ult = len(t) - 1
        j = max(0, self.indice_limite(simbolo, limite_ms))
        if unidad == "minutos":
            nj = int(np.clip(j + n, 0, ult))
        else:
            s = self.serie(simbolo, tf)
            k = int(np.searchsorted(s.i0, j, side="right")) - 1
            cerrada = j >= int(s.i1[k])
            if n > 0:
                destino = k + n - (0 if cerrada else 1)
                nj = int(s.i1[min(destino, len(s.i1) - 1)])
            elif n < 0:
                destino = k + n  # cierre de la vela n lugares antes de la actual
                nj = int(s.i1[max(destino, 0)])
            else:
                nj = j
        return int(t[nj]), int(nj - j), nj >= ult

    def limite_para_fecha(self, simbolo: str, fecha_ms: int) -> int:
        """Último minuto con t ≤ fecha (o el primero de los datos si la fecha es anterior)."""
        t = self.m1(simbolo)["t"]
        j = int(np.searchsorted(t, fecha_ms, side="right")) - 1
        return int(t[max(j, 0)])

    # ------------------------------------------------------------------ calidad
    def calidad(self, simbolo: str) -> dict:
        if simbolo in self._calidad:
            return self._calidad[simbolo]
        m = self.m1(simbolo)
        t = np.asarray(m["t"], np.int64)
        o, h, l, c = (np.asarray(m[k], float) for k in ("o", "h", "l", "c"))
        n = len(t)
        dt = np.diff(t)
        duplicados = int(np.sum(dt == 0))
        desordenados = int(np.sum(dt < 0))
        ohlc_mal = int(np.sum((h < np.maximum(o, c) - 1e-9) | (l > np.minimum(o, c) + 1e-9) | (h < l)))
        no_positivos = int(np.sum((o <= 0) | (h <= 0) | (l <= 0) | (c <= 0)))
        # huecos de más de 30 minutos que no son la pausa diaria ni el fin de semana
        hueco = np.flatnonzero(dt > 30 * 60000)
        mny = LD.pd.to_datetime(t[hueco], unit="ms", utc=True).tz_convert("America/New_York") if len(hueco) else None
        inesperados = 0
        if len(hueco):
            dia = np.asarray(mny.dayofweek)
            hora = np.asarray(mny.hour)
            pausa = (hora == 16) | (hora == 17)  # el último minuto antes de las 17:00 NY
            finde = (dia == 4) & (hora >= 16)
            inesperados = int(np.sum(~(pausa | finde)))
        anios = LD.pd.to_datetime(t, unit="ms", utc=True).year
        cob = []
        for y in np.unique(np.asarray(anios)):
            k = int(np.sum(np.asarray(anios) == y))
            cob.append(dict(anio=int(y), velas=k))
        chequeos = [
            dict(nombre="Duplicados", resultado="ok" if duplicados == 0 else "error", valor=duplicados,
                 detalle="Minutos con la misma hora de apertura"),
            dict(nombre="Orden temporal", resultado="ok" if desordenados == 0 else "error", valor=desordenados,
                 detalle="Minutos fuera de orden"),
            dict(nombre="OHLC inválido", resultado="ok" if ohlc_mal == 0 else "error", valor=ohlc_mal,
                 detalle="Máximo menor que apertura/cierre, mínimo mayor, o máximo < mínimo"),
            dict(nombre="Precios no positivos", resultado="ok" if no_positivos == 0 else "error", valor=no_positivos,
                 detalle="Algún precio ≤ 0"),
            dict(nombre="Huecos de más de 30 minutos", resultado="ok" if inesperados == 0 else "aviso", valor=inesperados,
                 detalle="Fuera de la pausa diaria (17:00 NY) y del fin de semana; feriados incluidos"),
        ]
        out = dict(simbolo=simbolo, velas_m1=n, desde=LD.pd.to_datetime(t[0], unit="ms").isoformat(),
                   hasta=LD.pd.to_datetime(t[-1], unit="ms").isoformat(), chequeos=chequeos, cobertura_anual=cob,
                   calculado_en_ms=int(time.time() * 1000))
        self._calidad[simbolo] = out
        return out
