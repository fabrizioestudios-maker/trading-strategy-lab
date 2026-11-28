"""
Piezas comunes de la biblioteca de indicadores: parámetros, salida y funciones de series (estilo Pine).

Salida de un indicador (todo alineado con las velas que devuelve la API, en ms de apertura):
- lineas:      series de valores (None donde no hay valor), con color, ancho y estilo;
- histogramas: barras con color por valor;
- niveles:     líneas horizontales fijas del panel (por ejemplo 70/30 del RSI);
- cajas:       rectángulos (t0, t1, arriba, abajo); t1 = None llega hasta la última vela;
- segmentos:   líneas entre dos puntos (t0, p0) → (t1, p1), con texto opcional;
- etiquetas:   textos en (t, precio);
- colores_velas: color por vela (None = el normal).
Nada usa velas posteriores al límite: el servicio solo entrega velas hasta ahí.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd


@dataclass
class Parametro:
    id: str
    nombre: str
    tipo: str  # entero | decimal | booleano | opcion
    defecto: Any
    minimo: float | None = None
    maximo: float | None = None
    paso: float | None = None
    opciones: list[str] | None = None
    grupo: str | None = None
    ayuda: str | None = None

    def validar(self, v: Any) -> Any:
        if v is None:
            return self.defecto
        if self.tipo == "booleano":
            return bool(v)
        if self.tipo == "opcion":
            if v not in (self.opciones or []):
                raise ValueError(f"{self.nombre}: opción inválida")
            return v
        x = float(v)
        if not math.isfinite(x):
            raise ValueError(f"{self.nombre}: valor inválido")
        if self.minimo is not None and x < self.minimo or self.maximo is not None and x > self.maximo:
            raise ValueError(f"{self.nombre}: fuera de rango ({self.minimo} a {self.maximo})")
        return int(round(x)) if self.tipo == "entero" else x


@dataclass
class Definicion:
    id: str
    nombre: str
    corto: str
    categoria: str
    superpuesto: bool
    descripcion: str
    parametros: list[Parametro]
    calcular: Callable[..., "Salida"]
    calentamiento: Callable[[dict], int] = lambda p: 300
    autor: str = "NEXUS"
    licencia: str | None = None
    fuente: str | None = None
    rango: tuple[float, float] | None = None

    def nombre_con(self, p: dict) -> str:
        visibles = [str(p[x.id]) for x in self.parametros if x.tipo in ("entero", "decimal") and x.grupo is None]
        return f"{self.corto} {' '.join(visibles)}".strip()

    def publica(self) -> dict:
        return dict(id=self.id, nombre=self.nombre, corto=self.corto, categoria=self.categoria, superpuesto=self.superpuesto,
                    descripcion=self.descripcion, autor=self.autor, licencia=self.licencia, fuente=self.fuente,
                    parametros=[dict(id=x.id, nombre=x.nombre, tipo=x.tipo, defecto=x.defecto, minimo=x.minimo, maximo=x.maximo,
                                     paso=x.paso, opciones=x.opciones, grupo=x.grupo, ayuda=x.ayuda) for x in self.parametros])


@dataclass
class Salida:
    lineas: list[dict] = field(default_factory=list)
    histogramas: list[dict] = field(default_factory=list)
    niveles: list[dict] = field(default_factory=list)
    cajas: list[dict] = field(default_factory=list)
    segmentos: list[dict] = field(default_factory=list)
    etiquetas: list[dict] = field(default_factory=list)
    colores_velas: list | None = None

    def linea(self, nombre: str, valores, color: str, ancho: int = 1, estilo: str = "solida"):
        self.lineas.append(dict(nombre=nombre, color=color, ancho=ancho, estilo=estilo, valores=valores))
        return self


def lista(x, dec: int = 6) -> list:
    return [None if v is None or not np.isfinite(v) else round(float(v), dec) for v in np.asarray(x, float)]


# ------------------------------------------------------------------ funciones de series (como las de Pine)
def sma(x, n):
    return pd.Series(x).rolling(n, min_periods=n).mean().values


def ema(x, n):
    return pd.Series(x).ewm(span=n, adjust=False, min_periods=n).mean().values


def wma(x, n):
    w = np.arange(1, n + 1, dtype=float)
    return pd.Series(x).rolling(n, min_periods=n).apply(lambda a: float(np.dot(a, w) / w.sum()), raw=True).values


def rma(x, n):
    """Media de Wilder como ta.rma de Pine: arranca con la media simple de los primeros n valores válidos."""
    x = np.asarray(x, float)
    out = np.full(len(x), np.nan)
    validos = np.flatnonzero(np.isfinite(x))
    if len(validos) < n:
        return out
    i0 = validos[n - 1]
    out[i0] = np.nanmean(x[validos[0]:i0 + 1])
    for i in range(i0 + 1, len(x)):
        v = x[i] if np.isfinite(x[i]) else out[i - 1]
        out[i] = out[i - 1] + (v - out[i - 1]) / n
    return out


def rango_verdadero(h, l, c):
    prev = np.r_[np.nan, c[:-1]]
    tr = np.fmax(h - l, np.fmax(np.abs(h - prev), np.abs(l - prev)))
    tr[0] = h[0] - l[0]
    return tr


def maximo(x, n):
    return pd.Series(x).rolling(n, min_periods=n).max().values


def minimo(x, n):
    return pd.Series(x).rolling(n, min_periods=n).min().values


def desvio(x, n):
    return pd.Series(x).rolling(n, min_periods=n).std(ddof=0).values
