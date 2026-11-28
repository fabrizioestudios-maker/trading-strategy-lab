/**
 * Cliente de la API de NEXUS (contrato nexus.v1). Un solo lugar para rutas, errores y tiempos de espera.
 * Los tipos salen de contrato.gen.ts, generado desde el OpenAPI de la API.
 */
import type {
  CalculoRiesgo,
  CuentaSimulada,
  DefinicionIndicador,
  PedidoIndicadores,
  RespuestaIndicadores,
  FichaMercado,
  HorarioMercado,
  PedidoCuenta,
  ConfigCorrida_Input,
  ContextoInvestigacion,
  CuadroReplay,
  EstadoOrdenSimulada,
  Estrategia,
  Hipotesis,
  InformeCalidad,
  Instrumento,
  Paso,
  PedidoOrdenes,
  PedidoRiesgo,
  Referencias,
  Resumen,
  Salud,
  Trabajo,
} from './contrato.gen';
import { claveRespuesta } from './clave';

export const BASE = '/api/v1';

/** Versión publicada sin servidor: las respuestas se leen de archivos grabados (scripts/grabar-instantanea.mjs). */
export const ESTATICO = import.meta.env.VITE_ESTATICO === '1';

export type TipoError = 'sin_conexion' | 'datos_no_disponibles' | 'no_existe' | 'pedido_invalido' | 'servidor' | 'cancelado' | 'solo_completa';

export class ErrorApi extends Error {
  constructor(
    readonly tipo: TipoError,
    readonly detalle: string,
    readonly estado = 0,
  ) {
    super(detalle);
  }
}

/** Texto para mostrar: qué pasó y cómo seguir. */
export function explicarError(e: unknown): { titulo: string; detalle: string } {
  if (e instanceof ErrorApi) {
    switch (e.tipo) {
      case 'sin_conexion':
        return { titulo: 'No hay conexión con la API de NEXUS', detalle: 'Iniciala con «python -m nexus_api» en la carpeta del laboratorio y volvé a intentar.' };
      case 'datos_no_disponibles':
        return { titulo: 'Faltan los datos en este servidor', detalle: e.detalle };
      case 'no_existe':
        return { titulo: 'No existe', detalle: e.detalle };
      case 'pedido_invalido':
        return { titulo: 'Pedido inválido', detalle: e.detalle };
      case 'solo_completa':
        return { titulo: 'Disponible en la versión completa', detalle: e.detalle };
      case 'cancelado':
        return { titulo: 'Cancelado', detalle: e.detalle };
      default:
        return { titulo: `La API respondió con un error (${e.estado})`, detalle: e.detalle };
    }
  }
  return { titulo: 'Error inesperado', detalle: e instanceof Error ? e.message : String(e) };
}

function detalleDe(cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === 'object') {
    const c = cuerpo as { detalle?: unknown; detail?: unknown };
    if (typeof c.detalle === 'string') return c.detalle;
    if (typeof c.detail === 'string') return c.detail;
    if (Array.isArray(c.detail))
      return c.detail
        .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg ?? ''}`.trim())
        .join('; ');
  }
  return 'Sin detalle';
}

async function pedirGrabado<T>(ruta: string, init: RequestInit): Promise<T> {
  const metodo = init.method ?? 'GET';
  const cuerpo = typeof init.body === 'string' ? init.body : null;
  let r: Response;
  try {
    r = await fetch(`instantanea/${claveRespuesta(metodo, BASE + ruta, cuerpo)}.json`, { signal: init.signal });
  } catch {
    if (init.signal?.aborted) throw new ErrorApi('cancelado', 'Pedido cancelado');
    throw new ErrorApi('sin_conexion', 'No se pudieron leer los datos publicados');
  }
  if (!r.ok)
    throw new ErrorApi(
      'solo_completa',
      'Esta es la versión publicada, con datos grabados: el replay recorre un tramo fijo de XAUUSD en 15 minutos. Las órdenes simuladas, otras fechas o temporalidades y las corridas nuevas necesitan NEXUS corriendo en una computadora (python -m nexus_api).',
      404,
    );
  return (await r.json()) as T;
}

export async function pedir<T>(ruta: string, init: RequestInit = {}, espera = 30_000): Promise<T> {
  if (ESTATICO) return pedirGrabado<T>(ruta, init);
  const ctl = new AbortController();
  const reloj = setTimeout(() => ctl.abort(), espera);
  const externa = init.signal;
  externa?.addEventListener('abort', () => ctl.abort());
  let r: Response;
  try {
    r = await fetch(BASE + ruta, { ...init, signal: ctl.signal, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  } catch {
    clearTimeout(reloj);
    if (externa?.aborted) throw new ErrorApi('cancelado', 'Pedido cancelado');
    throw new ErrorApi('sin_conexion', 'No se pudo conectar con la API');
  }
  clearTimeout(reloj);
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const tipo: TipoError = r.status === 503 ? 'datos_no_disponibles' : r.status === 404 ? 'no_existe' : r.status === 422 ? 'pedido_invalido' : 'servidor';
    throw new ErrorApi(tipo, detalleDe(cuerpo), r.status);
  }
  return cuerpo as T;
}

const q = (p: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined) u.set(k, String(v));
  return `?${u}`;
};

const post = (cuerpo: unknown, signal?: AbortSignal): RequestInit => ({ method: 'POST', body: JSON.stringify(cuerpo), signal });

export const api = {
  salud: (s?: AbortSignal) => pedir<Salud>('/salud', { signal: s }, 8000),
  instrumentos: (s?: AbortSignal) => pedir<Instrumento[]>('/instrumentos', { signal: s }),
  calidad: (simbolo: string, s?: AbortSignal) => pedir<InformeCalidad>(`/datos/${encodeURIComponent(simbolo)}/calidad`, { signal: s }, 120_000),
  mercado: (simbolo: string, s?: AbortSignal) => pedir<FichaMercado>(`/mercado/${encodeURIComponent(simbolo)}`, { signal: s }, 120_000),
  horario: (s?: AbortSignal) => pedir<HorarioMercado>('/mercado/horario', { signal: s }),
  resumen: (simbolo: string, s?: AbortSignal) => pedir<Resumen>(`/resumen${q({ simbolo })}`, { signal: s }, 120_000),
  referencias: (s?: AbortSignal) => pedir<Referencias>('/referencias', { signal: s }),
  replayInicio: (simbolo: string, s?: AbortSignal) => pedir<Paso>(`/replay/inicio${q({ simbolo })}`, { signal: s }, 120_000),
  cuadro: (simbolo: string, tf: number, limite_ms: number, cantidad: number, s?: AbortSignal) =>
    pedir<CuadroReplay>(`/replay/cuadro${q({ simbolo, tf, limite_ms, cantidad })}`, { signal: s }, 120_000),
  paso: (simbolo: string, tf: number, limite_ms: number, n: number, unidad: 'velas' | 'minutos' = 'velas', s?: AbortSignal) =>
    pedir<Paso>(`/replay/paso${q({ simbolo, tf, limite_ms, n, unidad })}`, { signal: s }),
  fecha: (simbolo: string, fecha_ny: string, s?: AbortSignal) => pedir<Paso>(`/replay/fecha${q({ simbolo, fecha_ny })}`, { signal: s }),
  cuenta: (p: PedidoCuenta, s?: AbortSignal) => pedir<CuentaSimulada>('/replay/cuenta', post(p, s)),
  ordenes: (p: PedidoOrdenes, s?: AbortSignal) => pedir<EstadoOrdenSimulada[]>('/replay/ordenes/estado', post(p, s)),
  estrategias: (s?: AbortSignal) => pedir<Estrategia[]>('/estrategias', { signal: s }),
  hipotesis: (s?: AbortSignal) => pedir<Hipotesis[]>('/hipotesis', { signal: s }),
  contexto: (s?: AbortSignal) => pedir<ContextoInvestigacion>('/investigacion/contexto', { signal: s }),
  trabajos: (s?: AbortSignal) => pedir<Trabajo[]>('/trabajos', { signal: s }),
  trabajo: (id: string, s?: AbortSignal) => pedir<Trabajo>(`/trabajos/${encodeURIComponent(id)}`, { signal: s }),
  enviar: (cfg: ConfigCorrida_Input) => pedir<Trabajo>('/trabajos', post(cfg)),
  cancelar: (id: string) => pedir<Trabajo>(`/trabajos/${encodeURIComponent(id)}/cancelar`, { method: 'POST' }),
  catalogoIndicadores: (s?: AbortSignal) => pedir<DefinicionIndicador[]>('/indicadores/catalogo', { signal: s }),
  indicadores: (p: PedidoIndicadores, s?: AbortSignal) => pedir<RespuestaIndicadores>('/indicadores/calcular', post(p, s), 60_000),
  riesgo: (p: PedidoRiesgo, s?: AbortSignal) => pedir<CalculoRiesgo>('/riesgo', post(p, s)),
};
