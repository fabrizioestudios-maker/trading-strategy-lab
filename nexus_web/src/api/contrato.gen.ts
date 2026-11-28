// Generado por `python -m nexus_api.tipos_ts` desde el contrato OpenAPI. No editar a mano.
// Contrato: Contrato nexus. Versión de la API: 0.1.0.

export interface Azar {
  simulaciones: number;
  /** R medio sin costos de la estrategia */
  media_observada: number;
  media_azar: number | null;
  p95_azar: number | null;
  /** Proporción de juegos al azar con media ≥ la observada */
  p: number | null;
}

export interface CajaIndicador {
  t0: number;
  /** None: llega hasta la última vela */
  t1: number | null;
  arriba: number;
  abajo: number;
  color: string;
  borde: string | null;
  texto: string | null;
  posicion: string | null;
  color_texto: string | null;
}

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

export interface Condicion_Input {
  izq: Operando;
  op: "cruza_arriba" | "cruza_abajo" | "mayor" | "menor";
  der: Operando;
}

export interface Condicion_Output {
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

export interface Criterio {
  nombre: string;
  ok: boolean;
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

export interface DefinicionIndicador {
  id: string;
  nombre: string;
  corto: string;
  categoria: string;
  /** True: se dibuja sobre el precio; False: en un panel propio */
  superpuesto: boolean;
  descripcion: string;
  autor: string;
  /** Licencia de terceros (p. ej. CC BY-NC-SA 4.0 de LuxAlgo) */
  licencia: string | null;
  fuente: string | null;
  parametros: Array<ParametroIndicador>;
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

export interface EtiquetaIndicador {
  t: number;
  precio: number;
  texto: string;
  color: string;
  posicion: string;
}

export interface Evento {
  t: number;
  tipo: "senal" | "sesion" | "aviso" | "orden";
  titulo: string;
  detalle: string;
  lado: "compra" | "venta" | null;
}

export interface FichaMercado {
  contrato: string;
  simbolo: string;
  nombre: string;
  decimales: number;
  /** Último minuto disponible (histórico, no en vivo) */
  ultimo_ms: number;
  ultimo_ny: string;
  ultimo: number | null;
  /** Contra el cierre diario anterior */
  cambio: number | null;
  cambio_pct: number | null;
  /** Tendencia de lab/senales.py: SMA 200 y su pendiente. Descriptivo */
  sesgo: "alcista" | "bajista" | "neutral";
  sma200: number | null;
  distancia_sma_pct: number | null;
  maximo_52s: number | null;
  minimo_52s: number | null;
  /** 0 = mínimo de 52 semanas, 100 = máximo */
  posicion_rango_pct: number | null;
  /** Últimos 60 cierres diarios */
  cierres: Array<number | null>;
  texto: string;
  nota: string;
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

export interface HistogramaIndicador {
  nombre: string;
  valores: Array<number | null>;
  colores: Array<string | null> | null;
}

export interface HorarioMercado {
  abierto: boolean;
  motivo: string | null;
  proximo: "apertura" | "cierre";
  proximo_ms: number;
  texto: string;
  ahora_ms: number;
  nota: string;
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

export interface LineaIndicador {
  nombre: string;
  color: string;
  ancho: number;
  estilo: "solida" | "guiones" | "puntos";
  /** Uno por vela visible (None sin valor) */
  valores: Array<number | null>;
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

export interface NivelIndicador {
  valor: number;
  color: string;
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

export interface OperacionProbador {
  entrada_ms: number;
  salida_ms: number;
  lado: "compra" | "venta";
  precio_entrada: number;
  precio_salida: number;
  sl: number;
  tp: number;
  motivo: string;
  r: number;
  muestra: "eleccion" | "validacion";
}

export interface Operando {
  tipo: "indicador" | "precio" | "valor";
  /** Indicador de la biblioteca (tipo indicador) */
  id?: string | null;
  parametros?: Record<string, boolean | number | string>;
  /** Línea del indicador (p. ej. «Superior»); por defecto la primera */
  linea?: string | null;
  campo?: "close" | "open" | "high" | "low" | null;
  valor?: number | null;
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
  condiciones: Array<Condicion_Output>;
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

export interface ParametroIndicador {
  id: string;
  nombre: string;
  tipo: "entero" | "decimal" | "booleano" | "opcion";
  defecto: boolean | number | string;
  minimo: number | null;
  maximo: number | null;
  paso: number | null;
  opciones: Array<string> | null;
  /** Sección de la ventana de ajustes */
  grupo: string | null;
  ayuda: string | null;
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

export interface PedidoIndicador {
  /** Identificador de esta copia del indicador en el gráfico */
  instancia: string;
  id: string;
  parametros?: Record<string, boolean | number | string>;
}

export interface PedidoIndicadores {
  simbolo?: string;
  tf?: number;
  limite_ms: number;
  cantidad?: number;
  indicadores: Array<PedidoIndicador>;
}

export interface PedidoOrdenes {
  simbolo?: string;
  limite_ms: number;
  ordenes: Array<OrdenSimuladaEntrada>;
}

export interface PedidoProbador {
  nombre?: string | null;
  simbolo?: string;
  /** 15, 60, 240 o 1440 minutos */
  tf?: number;
  desde: string;
  hasta: string;
  /** Parte final del período reservada para validar */
  fraccion_validacion?: number;
  compra?: Array<Condicion_Input>;
  venta?: Array<Condicion_Input>;
  sl_atr?: number;
  rr?: number;
  atr_n?: number;
  /** 0 = sin límite de tiempo */
  max_velas?: number;
  perfil_costos?: "sin_costos" | "optimista" | "costos_md" | "base" | "conservador" | "estres";
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

export interface PliegueAnual {
  desde: string;
  hasta: string;
  n: number;
  expectativa: number | null;
  r_total: number;
  muestra: "eleccion" | "confirmacion";
}

export interface Pruebas {
  /** Configuraciones distintas que probó este usuario */
  acumuladas: number;
  sharpe_eleccion: number | null;
  deflated_sharpe: number | null;
  varianza_usada: number;
  fuente_varianza: string;
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

export interface RespuestaIndicadores {
  contrato: string;
  simbolo: string;
  temporalidad: number;
  limite_ms: number;
  /** Apertura de cada vela visible (ms UTC), la misma que devuelve el cuadro */
  tiempos: Array<number>;
  resultados: Array<ResultadoIndicador>;
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

export interface ResultadoIndicador {
  instancia: string;
  id: string;
  nombre: string;
  superpuesto: boolean;
  parametros: Record<string, boolean | number | string>;
  /** Escala fija del panel (p. ej. 0–100) */
  rango: Array<number> | null;
  licencia: string | null;
  lineas: Array<LineaIndicador>;
  histogramas: Array<HistogramaIndicador>;
  niveles: Array<NivelIndicador>;
  cajas: Array<CajaIndicador>;
  segmentos: Array<SegmentoIndicador>;
  etiquetas: Array<EtiquetaIndicador>;
  colores_velas: Array<string | null> | null;
}

export interface ResultadoOrden {
  id: string;
  estado: string;
  /** Realizado si está cerrada, no realizado si está abierta (con costos) */
  resultado_moneda: number | null;
}

export interface ResultadoProbador {
  huella: string;
  simbolo: string;
  temporalidad: number;
  perfil_costos: string;
  corte_validacion: string;
  /** Por muestra: eleccion, validacion, total */
  metricas: Record<string, Array<Metrica>>;
  por_anio: Array<Record<string, unknown>>;
  sensibilidad_costos: Array<Record<string, unknown>>;
  operaciones: Array<OperacionProbador>;
  azar: Azar;
  pruebas: Pruebas;
  montecarlo: Array<FilaMonteCarlo>;
  criterios: Array<Criterio>;
  veredicto: string;
  segundos: number;
  avisos: Array<string>;
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

export interface Salud {
  contrato: string;
  version: string;
  datos: Record<string, unknown>;
  pruebas: string;
  hora_servidor_ms: number;
}

export interface SegmentoIndicador {
  t0: number;
  p0: number;
  t1: number;
  p1: number;
  color: string;
  estilo: "solida" | "guiones" | "puntos";
  texto: string | null;
  t_texto: number | null;
  posicion: string | null;
  tamano: string | null;
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
