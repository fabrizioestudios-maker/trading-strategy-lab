import { describe, expect, it } from 'vitest';
import { geometriaBarras } from './Barras';

describe('geometría de las barras', () => {
  it('las barras quedan siempre dentro del gráfico', () => {
    for (const vals of [[1, 2, 3], [-1, -2], [-1, 2, 3], [0, 5]]) {
      const { cero, alturaMax } = geometriaBarras(vals);
      // hacia arriba la barra ocupa de (cero − alto) a cero; hacia abajo de cero a (cero + alto)
      if (vals.some((v) => v > 0)) expect(cero - alturaMax).toBeGreaterThanOrEqual(0);
      if (vals.some((v) => v < 0)) expect(cero + alturaMax).toBeLessThanOrEqual(100);
    }
  });
  it('solo positivos: el cero va abajo', () => {
    expect(geometriaBarras([3, 4]).cero).toBeGreaterThan(90);
  });
});
