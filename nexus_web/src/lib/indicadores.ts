import { ESTATICO } from '../api/cliente';
/** Instancias de indicadores en el gráfico (lo que el usuario agregó desde la biblioteca), guardadas en el espacio. */
export type ValorParametro = boolean | number | string;

export interface InstanciaIndicador {
  instancia: string;
  id: string;
  parametros: Record<string, ValorParametro>;
  visible: boolean;
}

export const MAX_INDICADORES = 12;

/** En la versión publicada (respuestas grabadas) el gráfico arranca con Smart Money Concepts para mostrarlo. */
export const INDICADORES_INICIALES: InstanciaIndicador[] = [
  ...(ESTATICO ? [{ instancia: 'luxalgo_smc-1', id: 'luxalgo_smc', parametros: { fvg: true, premium: true }, visible: true }] : []),
  { instancia: 'rsi-1', id: 'rsi', parametros: {}, visible: true },
  { instancia: 'macd-1', id: 'macd', parametros: {}, visible: true },
];

export function nuevaInstancia(id: string, existentes: InstanciaIndicador[]): InstanciaIndicador {
  let n = 1;
  while (existentes.some((x) => x.instancia === `${id}-${n}`)) n++;
  return { instancia: `${id}-${n}`, id, parametros: {}, visible: true };
}

/** Limpia lo que viene del almacenamiento local (puede ser de una versión anterior o estar editado a mano). */
export function sanearIndicadores(x: unknown): InstanciaIndicador[] {
  if (!Array.isArray(x)) return INDICADORES_INICIALES;
  const vistos = new Set<string>();
  const out: InstanciaIndicador[] = [];
  for (const i of x) {
    if (!i || typeof i !== 'object') continue;
    const o = i as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.instancia !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(o.instancia) || vistos.has(o.instancia)) continue;
    const parametros: Record<string, ValorParametro> = {};
    if (o.parametros && typeof o.parametros === 'object')
      for (const [k, v] of Object.entries(o.parametros as Record<string, unknown>))
        if (/^[a-z0-9_]{1,40}$/.test(k) && (typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) parametros[k] = v;
    vistos.add(o.instancia);
    out.push({ instancia: o.instancia, id: o.id, parametros, visible: o.visible !== false });
    if (out.length >= MAX_INDICADORES) break;
  }
  return out;
}
