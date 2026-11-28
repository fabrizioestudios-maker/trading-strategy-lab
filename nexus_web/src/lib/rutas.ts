/** Rutas por hash: «#/replay?s=XAUUSD&tf=15&t=1795057140000». Un estado de replay se comparte copiando el enlace. */
export type Modulo = 'resumen' | 'replay' | 'probador' | 'laboratorio' | 'indicadores' | 'ejecucion' | 'analitica' | 'datos' | 'ajustes';

export interface DefModulo {
  id: Modulo;
  nombre: string;
  ingles: string;
  tecla: string;
  descripcion: string;
}

export const MODULOS: DefModulo[] = [
  { id: 'resumen', nombre: 'Resumen', ingles: 'Overview', tecla: 'o', descripcion: 'Estado de los datos, la candidata y la actividad reciente' },
  { id: 'replay', nombre: 'Replay de mercado', ingles: 'Market Replay', tecla: 'r', descripcion: 'Reproducir el histórico minuto a minuto, sin datos futuros' },
  { id: 'probador', nombre: 'Probador de estrategias', ingles: 'Strategy Tester', tecla: 'p', descripcion: 'Reglas con indicadores, probadas con costos, validación, azar y pruebas múltiples' },
  { id: 'laboratorio', nombre: 'Laboratorio', ingles: 'Strategy Lab', tecla: 'l', descripcion: 'Estrategias, hipótesis registradas y corridas reproducibles' },
  { id: 'indicadores', nombre: 'Indicadores', ingles: 'Indicators', tecla: 'i', descripcion: 'Biblioteca de indicadores del gráfico: clásicos y Smart Money Concepts [LuxAlgo]' },
  { id: 'ejecucion', nombre: 'Ejecución', ingles: 'Execution Engine', tecla: 'e', descripcion: 'Tamaño de posición, costos y órdenes simuladas' },
  { id: 'analitica', nombre: 'Analítica', ingles: 'Performance Analytics', tecla: 'a', descripcion: 'Métricas con período, muestra, costos y definición' },
  { id: 'datos', nombre: 'Centro de datos', ingles: 'Data Center', tecla: 'd', descripcion: 'Cobertura, procedencia y calidad de los datos' },
  { id: 'ajustes', nombre: 'Ajustes', ingles: 'Settings', tecla: 's', descripcion: 'Espacios de trabajo, gráfico, riesgo, apariencia y atajos' },
];

export const MODULO_INICIAL: Modulo = 'resumen';

export interface Ruta {
  modulo: Modulo;
  params: Record<string, string>;
}

export function leerRuta(hash: string): Ruta {
  const limpio = hash.replace(/^#\/?/, '');
  const [camino, consulta = ''] = limpio.split('?');
  const id = camino.split('/')[0] as Modulo;
  const modulo = MODULOS.some((m) => m.id === id) ? id : MODULO_INICIAL;
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(consulta)) params[k] = v;
  return { modulo, params };
}

export function armarRuta(modulo: Modulo, params: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return `#/${modulo}${s ? `?${s}` : ''}`;
}
