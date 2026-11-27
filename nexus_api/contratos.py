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
    # En las respuestas, los campos con valor por defecto siempre vienen: el esquema de salida los marca obligatorios.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


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


class Indicadores(Modelo):
    rsi_n: int
    macd_rapida: int
    macd_lenta: int
    macd_senal: int
    rsi: list[Optional[float]] = Field(description="Alineado con `velas`; None durante el calentamiento")
    macd: list[Optional[float]]
    senal: list[Optional[float]]
    histograma: list[Optional[float]]


class SesionDia(Modelo):
    apertura_ms: int = Field(description="Apertura de la sesión diaria (cierre 17:00 NY) que contiene el límite")
    apertura: float
    maximo: float
    minimo: float
    ultimo: float
    cierre_anterior: Optional[float]
    cambio: Optional[float]
    cambio_pct: Optional[float]
    en_formacion: bool


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
    indicadores: Optional[Indicadores] = None
    sesion_dia: Optional[SesionDia] = None
    hay_mas_atras: bool
    al_final_de_los_datos: bool


class OrdenSimuladaEntrada(Modelo):
    id: str = Field(max_length=40)
    lado: Literal["compra", "venta"]
    creada_limite_ms: int
    sl: float = Field(gt=0)
    tp: float = Field(gt=0)
    tipo: Literal["mercado", "limite"] = Field(default="mercado", description="Límite: se llena al tocar `entrada` (lab/smc.simular_ordenes)")
    entrada: Optional[float] = Field(default=None, gt=0, description="Solo límite: precio de la orden")
    vence_minutos: int = Field(default=240, ge=1, le=10080, description="Solo límite: minutos de mercado hasta que vence sin llenarse")
    lotes: Optional[float] = Field(default=None, gt=0, description="Tamaño con el que se creó (para la cuenta simulada)")


class PedidoOrdenes(Modelo):
    simbolo: str = "XAUUSD"
    limite_ms: int
    ordenes: list[OrdenSimuladaEntrada] = Field(max_length=200)


class EstadoOrdenSimulada(Modelo):
    id: str
    estado: Literal["posterior_al_limite", "esperando_llenado", "rechazada", "abierta", "cerrada", "cancelada", "vencida"]
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


class PliegueAnual(Modelo):
    desde: str
    hasta: str
    n: int
    expectativa: Optional[float]
    r_total: float
    muestra: Literal["eleccion", "confirmacion"]


class ComparacionBenchmark(Modelo):
    nombre: str
    descripcion: str
    n_dias: int
    ir_tasacion: Optional[float]
    t_alfa: Optional[float]
    p_alfa: Optional[float]
    correlacion: Optional[float]
    sharpe_estrategia: Optional[float]
    sharpe_benchmark: Optional[float]


class FilaMonteCarlo(Modelo):
    anios: int
    n_ops: int
    riesgo_pct: Optional[float]
    dd_mediana: Optional[float]
    dd_p95: Optional[float]
    final_mediana: Optional[float]
    final_p5: Optional[float]
    ruina: Optional[float]
    p_dd_10: Optional[float]
    p_dd_20: Optional[float]
    p_dd_30: Optional[float]
    racha_perdedora_mediana: Optional[float]
    racha_perdedora_p95: Optional[float]
    recuperacion_p50_ops: Optional[float]
    recuperacion_p95_ops: Optional[float]


class Robustez(Modelo):
    pliegues: list[PliegueAnual]
    pliegues_con_operaciones: int
    pliegues_positivos: int
    benchmarks: list[ComparacionBenchmark]
    montecarlo: list[FilaMonteCarlo]
    riesgo_sugerido_pct: Optional[float]
    definiciones: list[str]
    avisos: list[str]


class ResultadoCorrida(Modelo):
    metricas: dict[str, list[Metrica]] = Field(description="Por muestra: eleccion, confirmacion, total")
    por_anio: list[dict]
    desgloses: dict[str, list[dict]] = Field(default_factory=dict, description="por_lado, por_sesion, por_mes (perfil elegido)")
    sensibilidad_costos: list[dict]
    operaciones: list[Operacion]
    avisos: list[str]
    robustez: Optional[Robustez] = Field(default=None, description="Ausente en corridas anteriores a esta versión")


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
    resultado: Optional[ResultadoCorrida] = Field(default=None, description="Solo en GET /trabajos/{id}; los listados lo omiten")
    resumen: Optional[dict] = Field(default=None, description="Listados: métricas clave de la muestra total (n, expectativa, IC, período, perfil)")
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


# --------------------------------------------------------------------------------------------- resumen y referencias
class MinutoDato(Modelo):
    t: int = Field(description="Apertura del minuto, ms UTC")
    iso: str
    ny: Optional[str] = None
    vela: Optional[Vela] = None


class Resumen(Modelo):
    contrato: str = CONTRATO
    simbolo: str
    modo: Literal["histórico", "sintético"] = Field(description="No hay feed en vivo. «sintético»: datos generados para pruebas")
    ultimo_minuto: MinutoDato
    primer_minuto: MinutoDato
    sesion_del_ultimo_minuto: str = Field(description="Sesión de Nueva York en la que cae el último minuto disponible")
    ultimas_diarias: list[Vela]
    candidata: Estrategia
    pruebas_a_futuro: list[dict]
    hipotesis_por_estado: dict[str, int]
    corridas_recientes: list[Trabajo]


class ContextoInvestigacion(Modelo):
    contrato: str = CONTRATO
    presupuesto_pruebas: list[dict] = Field(description="registro/presupuesto_pruebas.csv: configuraciones probadas por familia")
    total_configuraciones: Optional[str] = Field(description="Fila TOTAL del registro, tal cual (≈ = aproximado)")
    pruebas_a_futuro: list[dict]


class DefinicionSesion(Modelo):
    nombre: str
    desde_ny: str
    hasta_ny: str
    dias: str
    nota: Optional[str] = None


class PerfilCostos(Modelo):
    clave: str
    nombre: str
    descripcion: str
    escala_spread: Optional[float] = Field(description="× la parte de spread del costo de docs/costos.md (None: perfil fijo)")
    deslizamiento: Optional[float] = Field(description="Factor sobre k · σ de 1 minuto en entradas a mercado y salidas por stop")
    latencia_ms: Optional[int] = None
    por_sesion: bool = Field(description="Multiplica el spread según la franja horaria de Nueva York")
    por_volatilidad: bool = Field(description="Multiplica el spread por (σ₆₀ / mediana)^0,5")
    swap: Optional[str] = Field(description="Escenario de swap: base, adverso o sin swap")


class DefinicionEstado(Modelo):
    clave: str
    texto: str


class Referencias(Modelo):
    contrato: str = CONTRATO
    temporalidades: list[int] = Field(description="Minutos por vela soportados por el replay")
    zona_sesiones: str
    sesiones: list[DefinicionSesion]
    perfiles_costos: list[PerfilCostos]
    supuestos_costos: list[str] = Field(description="Constantes de lab/ejecucion.py en texto")
    estados_orden: list[DefinicionEstado]
    estados_trabajo: list[DefinicionEstado]


# --------------------------------------------------------------------------------------------- capas del toolkit
class Pivote(Modelo):
    t: int = Field(description="Apertura de la vela del pivote")
    tipo: Literal["alto", "bajo"]
    precio: float
    confirmado_ms: int = Field(description="Cierre de la vela que lo confirma (ya revelado)")


class Ruptura(Modelo):
    t: int = Field(description="Apertura de la vela cuyo cierre rompió el pivote")
    tipo: Literal["BOS", "CHOCH"]
    lado: Literal["alcista", "bajista"]
    nivel: float
    pivote_t: int


class ZonaFVG(Modelo):
    t: int = Field(description="Apertura de la tercera vela del patrón")
    lado: Literal["alcista", "bajista"]
    arriba: float
    abajo: float
    conocido_ms: int
    mitigada_ms: Optional[int] = Field(description="Cierre de la vela que volvió a tocar el hueco (None: sin mitigar al límite)")


class Barrido(Modelo):
    t: int = Field(description="Apertura de la vela que barrió el pivote y cerró de vuelta")
    lado: Literal["arriba", "abajo"]
    nivel: float
    pivote_t: int


class OrderBlock(Modelo):
    t: int = Field(description="Apertura de la vela del order block")
    lado: Literal["alcista", "bajista"]
    arriba: float
    abajo: float
    ruptura_t: int
    conocido_ms: int = Field(description="Cierre de la vela de la ruptura que lo define")
    mitigado_ms: Optional[int]


class ZonaIFVG(Modelo):
    t: int = Field(description="Apertura de la vela que atravesó el FVG por cierre")
    lado: Literal["alcista", "bajista"] = Field(description="Lado desde el que se lee después de la inversión")
    arriba: float
    abajo: float
    fvg_t: int = Field(description="El FVG original (apertura de su tercera vela)")
    conocido_ms: int
    invalidado_ms: Optional[int] = Field(description="Cierre de la vela que lo atravesó de vuelta (None: vigente al límite)")


class ZonaBPR(Modelo):
    t: int = Field(description="El FVG más nuevo de los dos (apertura de su tercera vela)")
    lado: Literal["alcista", "bajista"]
    arriba: float
    abajo: float
    fvg_previo_t: int
    conocido_ms: int
    invalidado_ms: Optional[int]


class RangoOperativo(Modelo):
    alto: float
    alto_t: int
    bajo: float
    bajo_t: int
    equilibrio: float = Field(description="Mitad del rango: arriba es premium, abajo discount")
    ote_abajo: Optional[float] = Field(description="Retroceso de 62–79 % a favor de la estructura (None sin rupturas)")
    ote_arriba: Optional[float]
    sentido: Optional[Literal["alcista", "bajista"]]
    zona_precio: Literal["premium", "discount", "equilibrio"] = Field(description="Dónde está el último cierre revelado")


class CapasReplay(Modelo):
    contrato: str = CONTRATO
    simbolo: str
    temporalidad: int
    limite_ms: int
    pivotes: list[Pivote]
    rupturas: list[Ruptura]
    estado_estructura: int = Field(description="+1 alcista, -1 bajista, 0 sin rupturas en la ventana")
    fvg: list[ZonaFVG]
    barridos: list[Barrido] = Field(default_factory=list)
    order_blocks: list[OrderBlock] = Field(default_factory=list)
    ifvg: list[ZonaIFVG] = Field(default_factory=list)
    bpr: list[ZonaBPR] = Field(default_factory=list)
    rango: Optional[RangoOperativo] = None
    definiciones: list[str]
    nota: str


# --------------------------------------------------------------------------------------------- cuenta simulada
class PedidoCuenta(Modelo):
    simbolo: str = "XAUUSD"
    limite_ms: int
    capital: float = Field(gt=0)
    apalancamiento: float = Field(default=50, ge=1, le=1000)
    ordenes: list[OrdenSimuladaEntrada] = Field(max_length=200)


class ResultadoOrden(Modelo):
    id: str
    estado: str
    resultado_moneda: Optional[float] = Field(description="Realizado si está cerrada, no realizado si está abierta (con costos)")


class CuentaSimulada(Modelo):
    contrato: str = CONTRATO
    capital: float = Field(description="Capital inicial de la simulación (Ajustes)")
    realizado: float
    abierto: float
    equidad: float
    margen: float = Field(description="Nominal de las posiciones abiertas / apalancamiento supuesto")
    margen_libre: float
    nivel_margen_pct: Optional[float] = Field(description="Equidad / margen × 100; None sin posiciones abiertas")
    apalancamiento: float
    abiertas: int
    cerradas: int
    sin_tamano: int = Field(description="Órdenes sin lotes guardados: no entran en la cuenta")
    por_orden: list[ResultadoOrden]
    supuestos: list[str]


# --------------------------------------------------------------------------------------------- resumen de mercados
class FichaMercado(Modelo):
    contrato: str = CONTRATO
    simbolo: str
    nombre: str
    decimales: int
    ultimo_ms: int = Field(description="Último minuto disponible (histórico, no en vivo)")
    ultimo_ny: str
    ultimo: Optional[float]
    cambio: Optional[float] = Field(description="Contra el cierre diario anterior")
    cambio_pct: Optional[float]
    sesgo: Literal["alcista", "bajista", "neutral"] = Field(description="Tendencia de lab/senales.py: SMA 200 y su pendiente. Descriptivo")
    sma200: Optional[float]
    distancia_sma_pct: Optional[float]
    maximo_52s: Optional[float]
    minimo_52s: Optional[float]
    posicion_rango_pct: Optional[float] = Field(description="0 = mínimo de 52 semanas, 100 = máximo")
    cierres: list[Optional[float]] = Field(description="Últimos 60 cierres diarios")
    texto: str
    nota: str


class HorarioMercado(Modelo):
    abierto: bool
    motivo: Optional[str]
    proximo: Literal["apertura", "cierre"]
    proximo_ms: int
    texto: str
    ahora_ms: int
    nota: str
