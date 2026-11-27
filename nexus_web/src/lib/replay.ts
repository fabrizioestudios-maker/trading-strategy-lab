/** Reglas puras del replay en la interfaz (sin cálculos financieros: esos están en la API y el laboratorio). */
import type { EstadoOrdenSimulada, OrdenSimuladaEntrada, Vela } from '../api/contrato.gen';

export const TEMPORALIDADES = [1, 5, 15, 60, 240, 1440] as const;
export const VELOCIDADES = [1, 2, 4, 8, 16] as const; // velas por segundo
export const PASOS_N = [5, 10, 20, 50] as const;

export function cambiarVelocidad(v: number, dir: 1 | -1): number {
  const i = VELOCIDADES.indexOf(v as (typeof VELOCIDADES)[number]);
  const j = Math.min(VELOCIDADES.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir));
  return VELOCIDADES[j];
}

/** Índice de la última vela que empezó en o antes de t (−1 si ninguna). Las velas vienen ordenadas. */
export function velaQueContiene(velas: Pick<Vela, 't'>[], t: number): number {
  let lo = 0;
  let hi = velas.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (velas[m].t <= t) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r;
}

/** Validación del ticket: el stop y el objetivo tienen que quedar del lado correcto del precio de referencia. */
export function validarOrden(lado: 'compra' | 'venta', referencia: number, sl: number, tp: number): string | null {
  if (!(sl > 0) || !(tp > 0)) return 'El stop y el objetivo tienen que ser precios mayores que cero.';
  if (lado === 'compra' && !(sl < referencia && tp > referencia))
    return 'En una compra el stop va debajo del precio y el objetivo arriba.';
  if (lado === 'venta' && !(sl > referencia && tp < referencia)) return 'En una venta el stop va arriba del precio y el objetivo debajo.';
  return null;
}

/** Orden límite: stop y objetivo del lado correcto de la entrada, y la entrada del lado que no se llena enseguida. */
export function validarOrdenLimite(lado: 'compra' | 'venta', referencia: number, entrada: number, sl: number, tp: number): string | null {
  if (!(entrada > 0)) return 'La entrada tiene que ser un precio mayor que cero.';
  const base = validarOrden(lado, entrada, sl, tp);
  if (base) return base.replace('del precio', 'de la entrada');
  if (lado === 'compra' && entrada >= referencia) return 'Una compra límite va debajo del precio actual (si no, usá a mercado).';
  if (lado === 'venta' && entrada <= referencia) return 'Una venta límite va arriba del precio actual (si no, usá a mercado).';
  return null;
}

export function nuevoId(ahora = Date.now(), azar = Math.random()): string {
  return `o-${ahora.toString(36)}-${Math.floor(azar * 36 ** 4)
    .toString(36)
    .padStart(4, '0')}`;
}

export type ConteoEstados = Record<EstadoOrdenSimulada['estado'], number>;

export function contarEstados(estados: EstadoOrdenSimulada[]): ConteoEstados {
  const c: ConteoEstados = { posterior_al_limite: 0, esperando_llenado: 0, rechazada: 0, abierta: 0, cerrada: 0, cancelada: 0, vencida: 0 };
  for (const e of estados) c[e.estado] += 1;
  return c;
}

/** Las órdenes creadas después del límite actual no existen todavía en ese momento: no se dibujan. */
export function ordenesVigentes(ordenes: OrdenSimuladaEntrada[], limiteMs: number): OrdenSimuladaEntrada[] {
  return ordenes.filter((o) => o.creada_limite_ms <= limiteMs);
}

export interface EstadoCompartible {
  simbolo: string;
  tf: number;
  limiteMs: number;
}

export function leerEstadoCompartible(p: Record<string, string>): EstadoCompartible | null {
  const tf = Number(p.tf);
  const t = Number(p.t);
  if (!p.s || !/^[A-Z0-9]{3,10}$/.test(p.s) || !TEMPORALIDADES.includes(tf as (typeof TEMPORALIDADES)[number]) || !Number.isFinite(t) || t <= 0)
    return null;
  return { simbolo: p.s, tf, limiteMs: Math.floor(t) };
}
