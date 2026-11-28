/** Tipos de gráfico, Heikin Ashi y dibujos del usuario (líneas, rectángulos, Fibonacci) guardados por instrumento. */
import type { Vela } from '../api/contrato.gen';

export type TipoGrafico = 'velas' | 'barras' | 'linea' | 'area' | 'heikin';
export const TIPOS_GRAFICO: { id: TipoGrafico; nombre: string }[] = [
  { id: 'velas', nombre: 'Velas' },
  { id: 'heikin', nombre: 'H. Ashi' },
  { id: 'barras', nombre: 'Barras' },
  { id: 'linea', nombre: 'Línea' },
  { id: 'area', nombre: 'Área' },
];

/** Heikin Ashi: cada vela usa la anterior ya transformada (la primera arranca con la media de apertura y cierre). */
export function heikinAshi(v: Vela[]): Vela[] {
  const out: Vela[] = [];
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    const c = (x.o + x.h + x.l + x.c) / 4;
    const o = i === 0 ? (x.o + x.c) / 2 : (out[i - 1].o + out[i - 1].c) / 2;
    out.push({ ...x, o, c, h: Math.max(x.h, o, c), l: Math.min(x.l, o, c) });
  }
  return out;
}

export type TipoDibujo = 'tendencia' | 'rayo' | 'horizontal' | 'rectangulo' | 'fibonacci';
export interface Punto {
  t: number;
  p: number;
}
export interface Dibujo {
  id: string;
  tipo: TipoDibujo;
  puntos: Punto[];
  color: string;
}
export const HERRAMIENTAS_DIBUJO: { id: TipoDibujo; nombre: string; puntos: number }[] = [
  { id: 'tendencia', nombre: 'Línea de tendencia', puntos: 2 },
  { id: 'rayo', nombre: 'Rayo', puntos: 2 },
  { id: 'horizontal', nombre: 'Línea horizontal', puntos: 1 },
  { id: 'rectangulo', nombre: 'Rectángulo', puntos: 2 },
  { id: 'fibonacci', nombre: 'Retroceso de Fibonacci', puntos: 2 },
];
export const NIVELES_FIBO = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const MAX_DIBUJOS = 200;

export function sanearDibujos(x: unknown): Record<string, Dibujo[]> {
  if (!x || typeof x !== 'object') return {};
  const out: Record<string, Dibujo[]> = {};
  const tipos = new Set(HERRAMIENTAS_DIBUJO.map((h) => h.id));
  for (const [sim, lista] of Object.entries(x as Record<string, unknown>)) {
    if (!/^[A-Z0-9]{3,12}$/.test(sim) || !Array.isArray(lista)) continue;
    const l: Dibujo[] = [];
    for (const d of lista) {
      const o = d as Partial<Dibujo>;
      if (!o || typeof o.id !== 'string' || !tipos.has(o.tipo as TipoDibujo) || !Array.isArray(o.puntos)) continue;
      const puntos = o.puntos.filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.p)).slice(0, 2).map((p) => ({ t: Number(p.t), p: Number(p.p) }));
      const need = HERRAMIENTAS_DIBUJO.find((h) => h.id === o.tipo)!.puntos;
      if (puntos.length < need) continue;
      l.push({ id: o.id.slice(0, 40), tipo: o.tipo as TipoDibujo, puntos, color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#e8a83a' });
      if (l.length >= MAX_DIBUJOS) break;
    }
    if (l.length) out[sim] = l;
  }
  return out;
}
