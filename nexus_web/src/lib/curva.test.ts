import { describe, expect, it } from 'vitest';
import { curvaDeCapital } from './curva';

const op = (i: number, r: number, salida = i * 10_000) => ({ entrada_ms: i * 10_000 - 5000, salida_ms: salida, r });

describe('curva de capital (misma definición que lab/ficha.py · curva_dd)', () => {
  it('acumula, mide la caída desde el pico (con el 0 inicial) y el máximo', () => {
    const c = curvaDeCapital([op(1, 1), op(2, -1), op(3, -1), op(4, 2), op(5, -1)]);
    expect(c.puntos.map((p) => p.acumulado)).toEqual([1, 0, -1, 1, 0]);
    expect(c.puntos.map((p) => p.caida)).toEqual([0, 1, 2, 0, 1]);
    expect(c.maxCaida).toBe(2);
    expect(c.total).toBe(0);
  });
  it('una racha perdedora desde el inicio cuenta como caída desde 0', () => {
    expect(curvaDeCapital([op(1, -1), op(2, -0.5)]).maxCaida).toBeCloseTo(1.5);
  });
  it('ordena por entrada y deja los tiempos estrictamente crecientes', () => {
    const c = curvaDeCapital([op(2, 1, 50_000), op(1, 1, 50_000)]);
    expect(c.puntos[1].t).toBeGreaterThan(c.puntos[0].t);
  });
});
