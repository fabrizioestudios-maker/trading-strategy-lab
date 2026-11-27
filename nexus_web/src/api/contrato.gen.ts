// Generado por `python -m nexus_api.tipos_ts` desde el contrato OpenAPI. No editar a mano.
// Contrato: Contrato nexus. Versión de la API: 0.1.0.

export interface CalculoRiesgo {
  contrato: string;
  lado: "compra" | "venta";
  /** Capital × riesgo % */
  riesgo_moneda: number;
  distancia_stop: number;
  /** Redondeado hacia abajo al paso de lote */
  lotes: number;
  /** Pérdida si toca el stop con los lotes redondeados, sin costos */
  riesgo_real_moneda: number;
  costo_ida_vuelta_moneda: number;
  costo_en_r: number;
  rr: number | null;
  ganancia_objetivo_moneda: number | null;
  supuestos: Array<string>;
  avisos: Array<string>;
}

export interface CapasReplay {
  contrato: string;
  simbolo: string;
  temporalidad: number;
  limite_ms: number;
  pivotes: Array<Pivote>;
  rupturas: Array<Ruptura>;
  /** +1 alcista, -1 bajista, 0 sin rupturas en la ventana */
  estado_estructura: number;
  fvg: Array<ZonaFVG>;
  definiciones: Array<string>;
  nota: string;
}

export interface ChequeoCalidad {
  nombre: string;
  resultado: "ok" | "aviso" | "error";
  valor: number;
  detalle: string;
}

export interface ComparacionBenchmark {
  nombre: string;
  descripcion: string;
  n_dias: number;
  ir_tasacion: number | null;
  t_alfa: number | null;
  p_alfa: number | null;
  correlacion: number | null;
  sharpe_estrategia: number | null;
  sharpe_benchmark: number | null;
}

export interface Condicion {
  clave: string;
  texto: string;
  /** None = no se puede evaluar con los datos revelados */
  cumple: boolean | null;
  valor: string | null;
}

export interface ConfigCorrida_Input {
  estrategia: "e022";
  version?: "1.0";
  entrada?: "reapertura" | "18:15";
  perfil_costos?: "costos_md" | "sin_costos" | "optimista" | "base" | "conservador" | "estres";
  eleccion_desde?: string;
  eleccion_hasta?: string;
  confirmacion_desde?: string;
  confirmacion_hasta?: string;
}

export interface ConfigCorrida_Output {
  estrategia: "e022";
  version: "1.0";
  entrada: "reapertura" | "18:15";
  perfil_costos: "costos_md" | "sin_costos" | "optimista" | "base" | "conservador" | "estres";
  eleccion_desde: string;
  eleccion_hasta: string;
  confirmacion_desde: string;
  confirmacion_hasta: string;
}

export interface ContextoInvestigacion {
  contrato: string;
  /** registro/presupuesto_pruebas.csv: configuraciones probadas por familia */
  presupuesto_pruebas: Array<Record<string, unknown>>;
  /** Fila TOTAL del registro, tal cual (≈ = aproximado) */
  total_configuraciones: string | null;
  pruebas_a_futuro: Array<Record<string, unknown>>;
}

export interface CuadroReplay {
  contrato: string;
  simbolo: string;
  /** Minutos por vela */
  temporalidad: number;
  limite: LimiteReplay;
  velas: Array<Vela>;
  sesiones: Array<VentanaSesion>;
  eventos: Array<Evento>;
  decision: PanelDecision | null;
  niveles: Array<Nivel>;
  indicadores: Indicadores | null;
  sesion_dia: SesionDia | null;
  hay_mas_atras: boolean;
  al_final_de_los_datos: boolean;
}

export interface CuentaSimulada {
  contrato: string;
  /** Capital inicial de la simulación (Ajustes) */
  capital: number;
  realizado: number;
  abierto: number;
  equidad: number;
  /** Nominal de las posiciones abiertas / apalancamiento supuesto */
  margen: number;
  margen_libre: number;
  /** Equidad / margen × 100; None sin posiciones abiertas */
  nivel_margen_pct: number | null;
  apalancamiento: number;
  abiertas: number;
  cerradas: number;
  /** Órdenes sin lotes guardados: no entran en la cuenta */
  sin_tamano: number;
  por_orden: Array<ResultadoOrden>;
  supuestos: Array<string>;
}

export interface DefinicionEstado {
  clave: string;
  texto: string;
}

export interface DefinicionSesion {
  nombre: string;
  desde_ny: string;
  hasta_ny: string;
  dias: string;
  nota: string | null;
}

export interface EstadoOrdenSimulada {
  id: string;
  estado: "posterior_al_limite" | "esperando_llenado" | "rechazada" | "abierta" | "cerrada" | "cancelada" | "vencida";
  entrada_ms: number | null;
  precio_entrada: number | null;
  salida_ms: number | null;
  /** Cerrada: precio de salida. Abierta: cierre del último minuto revelado */
  precio_salida: number | null;
  motivo: "TP" | "SL" | null;
  /** Cerrada: R realizado. Abierta: R no realizado. Con costos de docs/costos.md */
  r: number | null;
  costo_r: number | null;
  explicacion: string;
}

export interface Estrategia {
  id: string;
  version: string;
  nombre: string;
  hipotesis: string;
  temporalidad: string;
  parametros: Array<Parametro>;
  reglas: Array<string>;
  nivel: string;
  nivel_texto: string;
  evidencia: Array<string>;
  limitaciones: Array<string>;
  fuentes: Array<string>;
  /** Se puede correr desde NEXUS */
  ejecutable: boolean;
}

export interface Evento {
  t: number;
  tipo: "senal" | "sesion" | "aviso" | "orden";
  titulo: string;
  detalle: string;
  lado: "compra" | "venta" | null;
}

export interface FilaMonteCarlo {
  anios: number;
  n_ops: number;
  riesgo_pct: number | null;
  dd_mediana: number | null;
  dd_p95: number | null;
  final_mediana: number | null;
  final_p5: number | null;
  ruina: number | null;
  p_dd_10: number | null;
  p_dd_20: number | null;
  p_dd_30: number | null;
  racha_perdedora_mediana: number | null;
  racha_perdedora_p95: number | null;
  recuperacion_p50_ops: number | null;
  recuperacion_p95_ops: number | null;
}

export interface HTTPValidationError {
  detail?: Array<ValidationError>;
}

export interface Hipotesis {
  id: string;
  titulo: string;
  fecha: string | null;
  estado: "pasa" | "falla" | "informativo" | "pendiente" | "registrado";
  resumen: string;
  fuente: string;
}

export interface Indicadores {
  rsi_n: number;
  macd_rapida: number;
  macd_lenta: number;
  macd_senal: number;
  /** Alineado con `velas`; None durante el calentamiento */
  rsi: Array<number | null>;
  macd: Array<number | null>;
  senal: Array<number | null>;
  histograma: Array<number | null>;
}

export interface InformeCalidad {
  contrato: string;
  simbolo: string;
  velas_m1: number;
  desde: string;
  hasta: string;
  chequeos: Array<ChequeoCalidad>;
  cobertura_anual: Array<Record<string, unknown>>;
  calculado_en_ms: number;
}

export interface Instrumento {
  /** Código del laboratorio, p. ej. XAUUSD */
  simbolo: string;
  nombre: string;
  clase: "metal" | "forex" | "indice" | "otro";
  moneda_cotizacion: string;
  decimales: number;
  /** Unidades por lote (onzas para el oro) */
  tamano_contrato: number;
  /** Costo ida y vuelta de docs/costos.md, en texto */
  costo_referencia: string;
  /** Hay datos locales cargables en este servidor */
  disponible: boolean;
  cobertura_desde: string | null;
  cobertura_hasta: string | null;
  velas_m1: number | null;
  /** Origen de los datos */
  fuente: string;
  /** SHA-256 del archivo de datos (data/MANIFIESTO.csv) */
  huella_sha256: string | null;
}

export interface LimiteReplay {
  /** Apertura del último minuto revelado */
  limite_ms: number;
  limite_iso: string;
  /** Mismo instante en hora de Nueva York */
  limite_ny: string;
  sesion: string;
}

export interface Metrica {
  clave: string;
  nombre: string;
  valor: number | null;
  unidad: string;
  definicion: string;
  n: number;
  periodo: string;
  perfil_costos: string;
}

export interface MinutoDato {
  /** Apertura del minuto, ms UTC */
  t: number;
  iso: string;
  ny: string | null;
  vela: Vela | null;
}

export interface Nivel {
  clave: "pdh" | "pdl" | "pwh" | "pwl";
  nombre: string;
  precio: number;
  /** Cierre de la vela que lo definió (ya revelado) */
  conocido_desde_ms: number;
  /** Descriptivo: un nivel dibujado no es evidencia de ventaja */
  nota: string;
}

export interface Operacion {
  entrada_ms: number;
  salida_ms: number;
  lado: "compra" | "venta";
  precio_entrada: number;
  precio_salida: number;
  sl: number;
  motivo: "TP" | "SL" | "tiempo" | "fin";
  r: number;
  muestra: "eleccion" | "confirmacion" | "fuera";
}

export interface OrdenSimuladaEntrada {
  id: string;
  lado: "compra" | "venta";
  creada_limite_ms: number;
  sl: number;
  tp: number;
  /** Límite: se llena al tocar `entrada` (lab/smc.simular_ordenes) */
  tipo?: "mercado" | "limite";
  /** Solo límite: precio de la orden */
  entrada?: number | null;
  /** Solo límite: minutos de mercado hasta que vence sin llenarse */
  vence_minutos?: number;
  /** Tamaño con el que se creó (para la cuenta simulada) */
  lotes?: number | null;
}

export interface PanelDecision {
  estrategia: string;
  version: string;
  /** Apertura de la última vela diaria cerrada antes del límite */
  vela_diaria_ms: number | null;
  condiciones: Array<Condicion>;
  decision: "compra" | "venta" | "espera" | "sin_datos";
  explicacion: string;
  stop_distancia: number | null;
  objetivo_distancia: number | null;
  /** Cuándo entraría la regla (hora de Nueva York) */
  entrada_prevista: string | null;
  /** Nivel de evidencia documentado (docs/fichas.md) */
  nivel: string;
}

export interface Parametro {
  clave: string;
  nombre: string;
  valor: number | string;
  unidad: string | null;
  definicion: string;
}

export interface Paso {
  limite_ms: number;
  avanzo_minutos: number;
  al_final_de_los_datos: boolean;
}

export interface PedidoCuenta {
  simbolo?: string;
  limite_ms: number;
  capital: number;
  apalancamiento?: number;
  ordenes: Array<OrdenSimuladaEntrada>;
}

export interface PedidoOrdenes {
  simbolo?: string;
  limite_ms: number;
  ordenes: Array<OrdenSimuladaEntrada>;
}

export interface PedidoRiesgo {
  simbolo?: string;
  capital: number;
  riesgo_pct: number;
  entrada: number;
  stop: number;
  objetivo?: number | null;
  paso_lote?: number;
}

export interface PerfilCostos {
  clave: string;
  nombre: string;
  descripcion: string;
  /** × la parte de spread del costo de docs/costos.md (None: perfil fijo) */
  escala_spread: number | null;
  /** Factor sobre k · σ de 1 minuto en entradas a mercado y salidas por stop */
  deslizamiento: number | null;
  latencia_ms: number | null;
  /** Multiplica el spread según la franja horaria de Nueva York */
  por_sesion: boolean;
  /** Multiplica el spread por (σ₆₀ / mediana)^0,5 */
  por_volatilidad: boolean;
  /** Escenario de swap: base, adverso o sin swap */
  swap: string | null;
}

export interface Pivote {
  /** Apertura de la vela del pivote */
  t: number;
  tipo: "alto" | "bajo";
  precio: number;
  /** Cierre de la vela que lo confirma (ya revelado) */
  confirmado_ms: number;
}

export interface PliegueAnual {
  desde: string;
  hasta: string;
  n: number;
  expectativa: number | null;
  r_total: number;
  muestra: "eleccion" | "confirmacion";
}

export interface Referencias {
  contrato: string;
  /** Minutos por vela soportados por el replay */
  temporalidades: Array<number>;
  zona_sesiones: string;
  sesiones: Array<DefinicionSesion>;
  perfiles_costos: Array<PerfilCostos>;
  /** Constantes de lab/ejecucion.py en texto */
  supuestos_costos: Array<string>;
  estados_orden: Array<DefinicionEstado>;
  estados_trabajo: Array<DefinicionEstado>;
}

export interface ResultadoCorrida {
  /** Por muestra: eleccion, confirmacion, total */
  metricas: Record<string, Array<Metrica>>;
  por_anio: Array<Record<string, unknown>>;
  /** por_lado, por_sesion, por_mes (perfil elegido) */
  desgloses: Record<string, Array<Record<string, unknown>>>;
  sensibilidad_costos: Array<Record<string, unknown>>;
  operaciones: Array<Operacion>;
  avisos: Array<string>;
  /** Ausente en corridas anteriores a esta versión */
  robustez: Robustez | null;
}

export interface ResultadoOrden {
  id: string;
  estado: string;
  /** Realizado si está cerrada, no realizado si está abierta (con costos) */
  resultado_moneda: number | null;
}

export interface Resumen {
  contrato: string;
  simbolo: string;
  /** No hay feed en vivo. «sintético»: datos generados para pruebas */
  modo: "histórico" | "sintético";
  ultimo_minuto: MinutoDato;
  primer_minuto: MinutoDato;
  /** Sesión de Nueva York en la que cae el último minuto disponible */
  sesion_del_ultimo_minuto: string;
  ultimas_diarias: Array<Vela>;
  candidata: Estrategia;
  pruebas_a_futuro: Array<Record<string, unknown>>;
  hipotesis_por_estado: Record<string, number>;
  corridas_recientes: Array<Trabajo>;
}

export interface Robustez {
  pliegues: Array<PliegueAnual>;
  pliegues_con_operaciones: number;
  pliegues_positivos: number;
  benchmarks: Array<ComparacionBenchmark>;
  montecarlo: Array<FilaMonteCarlo>;
  riesgo_sugerido_pct: number | null;
  definiciones: Array<string>;
  avisos: Array<string>;
}

export interface Ruptura {
  /** Apertura de la vela cuyo cierre rompió el pivote */
  t: number;
  tipo: "BOS" | "CHOCH";
  lado: "alcista" | "bajista";
  nivel: number;
  pivote_t: number;
}

export interface Salud {
  contrato: string;
  version: string;
  datos: Record<string, unknown>;
  pruebas: string;
  hora_servidor_ms: number;
}

export interface SesionDia {
  /** Apertura de la sesión diaria (cierre 17:00 NY) que contiene el límite */
  apertura_ms: number;
  apertura: number;
  maximo: number;
  minimo: number;
  ultimo: number;
  cierre_anterior: number | null;
  cambio: number | null;
  cambio_pct: number | null;
  en_formacion: boolean;
}

export interface Trabajo {
  contrato: string;
  id: string;
  tipo: "investigacion";
  estado: "enviado" | "en_cola" | "corriendo" | "terminado" | "fallido" | "cancelado";
  config: ConfigCorrida_Output;
  huella_config: string;
  creado_ms: number;
  actualizado_ms: number;
  etapa: string | null;
  /** Eventos con hora: etapas reales del trabajo */
  registro: Array<Record<string, unknown>>;
  /** Commit, huellas del código y de los datos */
  procedencia: Record<string, unknown>;
  /** Solo en GET /trabajos/{id}; los listados lo omiten */
  resultado: ResultadoCorrida | null;
  /** Listados: métricas clave de la muestra total (n, expectativa, IC, período, perfil) */
  resumen: Record<string, unknown> | null;
  error: string | null;
}

export interface ValidationError {
  loc: Array<string | number>;
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface Vela {
  /** Apertura de la vela, ms UTC */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Vela en formación: armada solo con minutos ya revelados */
  parcial: boolean;
}

export interface VentanaSesion {
  nombre: "Asia" | "Londres" | "Nueva York" | "Cierre" | "Reapertura";
  desde_ms: number;
  hasta_ms: number;
  aviso: string | null;
}

export interface ZonaFVG {
  /** Apertura de la tercera vela del patrón */
  t: number;
  lado: "alcista" | "bajista";
  arriba: number;
  abajo: number;
  conocido_ms: number;
  /** Cierre de la vela que volvió a tocar el hueco (None: sin mitigar al límite) */
  mitigada_ms: number | null;
}
