"""
Contratos públicos de NEXUS, versión `nexus.v1`. Todo lo que cruza la frontera API ↔ interfaz pasa por estos modelos.

Convenciones:
- Tiempos en milisegundos UTC (`*_ms`) y además en ISO 8601 UTC cuando ayuda a leerlos. La hora de Nueva York se manda
  aparte como texto ya formateado: la interfaz no convierte zonas horarias por su cuenta.
- Precios en la moneda de cotización del instrumento. Los datos del laboratorio son precios bid.
- Un cambio incompatible sube la versión (`nexus.v2`); los campos nuevos opcionales no.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from . import CONTRATO


class Modelo(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------------------------- instrumentos y datos
class Instrumento(Modelo):
    simbolo: str = Field(description="Código del laboratorio, p. ej. XAUUSD")
    nombre: str
    clase: Literal["metal", "forex", "indice", "otro"]
    moneda_cotizacion: str
    decimales: int
    tamano_contrato: float = Field(description="Unidades por lote (onzas para el oro)")
    costo_referencia: str = Field(description="Costo ida y vuelta de docs/costos.md, en texto")
    disponible: bool = Field(description="Hay datos locales cargables en este servidor")
    cobertura_desde: Optional[str] = None
    cobertura_hasta: Optional[str] = None
    velas_m1: Optional[int] = None
    fuente: str = Field(description="Origen de los datos")
    huella_sha256: Optional[str] = Field(default=None, description="SHA-256 del archivo de datos (data/MANIFIESTO.csv)")


class ChequeoCalidad(Modelo):
    nombre: str
    resultado: Literal["ok", "aviso", "error"]
    valor: float
    detalle: str


class InformeCalidad(Modelo):
    contrato: str = CONTRATO
    simbolo: str
    velas_m1: int
    desde: str
    hasta: str
    chequeos: list[ChequeoCalidad]
    cobertura_anual: list[dict]
    calculado_en_ms: int


# --------------------------------------------------------------------------------------------- velas y replay
class Vela(Modelo):
    t: int = Field(description="Apertura de la vela, ms UTC")
    o: float
    h: float
    l: float
    c: float
    parcial: bool = Field(default=False, description="Vela en formación: armada solo con minutos ya revelados")


class VentanaSesion(Modelo):
    nombre: Literal["Asia", "Londres", "Nueva York", "Cierre", "Reapertura"]
    desde_ms: int
    hasta_ms: int
    aviso: Optional[str] = None


class Evento(Modelo):
    t: int
    tipo: Literal["senal", "sesion", "aviso", "orden"]
    titulo: str
    detalle: str
    lado: Optional[Literal["compra", "venta"]] = None


class Condicion(Modelo):
    clave: str
    texto: str
    cumple: Optional[bool] = Field(description="None = no se puede evaluar con los datos revelados")
    valor: Optional[str] = None


class PanelDecision(Modelo):
    estrategia: str
    version: str
    vela_diaria_ms: Optional[int] = Field(description="Apertura de la última vela diaria cerrada antes del límite")
    condiciones: list[Condicion]
    decision: Literal["compra", "venta", "espera", "sin_datos"]
    explicacion: str
    stop_distancia: Optional[float] = None
    objetivo_distancia: Optional[float] = None
    entrada_prevista: Optional[str] = Field(default=None, description="Cuándo entraría la regla (hora de Nueva York)")
    nivel: str = Field(description="Nivel de evidencia documentado (docs/fichas.md)")


class Nivel(Modelo):
    clave: Literal["pdh", "pdl", "pwh", "pwl"]
    nombre: str
    precio: float
    conocido_desde_ms: int = Field(description="Cierre de la vela que lo definió (ya revelado)")
    nota: str = Field(description="Descriptivo: un nivel dibujado no es evidencia de ventaja")


class LimiteReplay(Modelo):
    limite_ms: int = Field(description="Apertura del último minuto revelado")
    limite_iso: str
    limite_ny: str = Field(description="Mismo instante en hora de Nueva York")
    sesion: str


class CuadroReplay(Modelo):
    contrato: str = CONTRATO
    simbolo: str
    temporalidad: int = Field(description="Minutos por vela")
    limite: LimiteReplay
    velas: list[Vela]
    sesiones: list[VentanaSesion]
    eventos: list[Evento]
    decision: Optional[PanelDecision] = None
    niveles: list[Nivel] = Field(default_factory=list)
    hay_mas_atras: bool
    al_final_de_los_datos: bool


class OrdenSimuladaEntrada(Modelo):
    id: str = Field(max_length=40)
    lado: Literal["compra", "venta"]
    creada_limite_ms: int
    sl: float = Field(gt=0)
    tp: float = Field(gt=0)


class PedidoOrdenes(Modelo):
    simbolo: str = "XAUUSD"
    limite_ms: int
    ordenes: list[OrdenSimuladaEntrada] = Field(max_length=200)


class EstadoOrdenSimulada(Modelo):
    id: str
    estado: Literal["posterior_al_limite", "esperando_llenado", "rechazada", "abierta", "cerrada"]
    entrada_ms: Optional[int]
    precio_entrada: Optional[float]
    salida_ms: Optional[int]
    precio_salida: Optional[float] = Field(description="Cerrada: precio de salida. Abierta: cierre del último minuto revelado")
    motivo: Optional[Literal["TP", "SL"]]
    r: Optional[float] = Field(description="Cerrada: R realizado. Abierta: R no realizado. Con costos de docs/costos.md")
    costo_r: Optional[float]
    explicacion: str


class Paso(Modelo):
    limite_ms: int
    avanzo_minutos: int
    al_final_de_los_datos: bool


# --------------------------------------------------------------------------------------------- estrategias e investigación
class Parametro(Modelo):
    clave: str
    nombre: str
    valor: float | int | str
    unidad: Optional[str] = None
    definicion: str


class Estrategia(Modelo):
    id: str
    version: str
    nombre: str
    hipotesis: str
    temporalidad: str
    parametros: list[Parametro]
    reglas: list[str]
    nivel: str
    nivel_texto: str
    evidencia: list[str]
    limitaciones: list[str]
    fuentes: list[str]
    ejecutable: bool = Field(description="Se puede correr desde NEXUS")


class Hipotesis(Modelo):
    id: str
    titulo: str
    fecha: Optional[str]
    estado: Literal["pasa", "falla", "informativo", "pendiente", "registrado"]
    resumen: str
    fuente: str


class ConfigCorrida(Modelo):
    estrategia: Literal["e022"]
    version: Literal["1.0"] = "1.0"
    entrada: Literal["reapertura", "18:15"] = "18:15"
    perfil_costos: Literal["costos_md", "sin_costos", "optimista", "base", "conservador", "estres"] = "base"
    eleccion_desde: str = "2011-11-15"
    eleccion_hasta: str = "2021-11-15"
    confirmacion_desde: str = "2021-11-15"
    confirmacion_hasta: str = "2026-11-14"


class Metrica(Modelo):
    clave: str
    nombre: str
    valor: Optional[float]
    unidad: str
    definicion: str
    n: int
    periodo: str
    perfil_costos: str


class Operacion(Modelo):
    entrada_ms: int
    salida_ms: int
    lado: Literal["compra", "venta"]
    precio_entrada: float
    precio_salida: float
    sl: float
    motivo: Literal["TP", "SL", "tiempo", "fin"]
    r: float
    muestra: Literal["eleccion", "confirmacion", "fuera"]


class ResultadoCorrida(Modelo):
    metricas: dict[str, list[Metrica]] = Field(description="Por muestra: eleccion, confirmacion, total")
    por_anio: list[dict]
    desgloses: dict[str, list[dict]] = Field(default_factory=dict, description="por_lado, por_sesion, por_mes (perfil elegido)")
    sensibilidad_costos: list[dict]
    operaciones: list[Operacion]
    avisos: list[str]


EstadoTrabajo = Literal["enviado", "en_cola", "corriendo", "terminado", "fallido", "cancelado"]


class Trabajo(Modelo):
    contrato: str = CONTRATO
    id: str
    tipo: Literal["investigacion"]
    estado: EstadoTrabajo
    config: ConfigCorrida
    huella_config: str
    creado_ms: int
    actualizado_ms: int
    etapa: Optional[str] = None
    registro: list[dict] = Field(default_factory=list, description="Eventos con hora: etapas reales del trabajo")
    procedencia: dict = Field(default_factory=dict, description="Commit, huellas del código y de los datos")
    resultado: Optional[ResultadoCorrida] = None
    error: Optional[str] = None


# --------------------------------------------------------------------------------------------- riesgo
class PedidoRiesgo(Modelo):
    simbolo: str = "XAUUSD"
    capital: float = Field(gt=0)
    riesgo_pct: float = Field(gt=0, le=10)
    entrada: float = Field(gt=0)
    stop: float = Field(gt=0)
    objetivo: Optional[float] = Field(default=None, gt=0)
    paso_lote: float = Field(default=0.01, gt=0)


class CalculoRiesgo(Modelo):
    contrato: str = CONTRATO
    lado: Literal["compra", "venta"]
    riesgo_moneda: float = Field(description="Capital × riesgo %")
    distancia_stop: float
    lotes: float = Field(description="Redondeado hacia abajo al paso de lote")
    riesgo_real_moneda: float = Field(description="Pérdida si toca el stop con los lotes redondeados, sin costos")
    costo_ida_vuelta_moneda: float
    costo_en_r: float
    rr: Optional[float] = None
    ganancia_objetivo_moneda: Optional[float] = None
    supuestos: list[str]
    avisos: list[str]


class Salud(Modelo):
    contrato: str = CONTRATO
    version: str
    datos: dict
    pruebas: str
    hora_servidor_ms: int
