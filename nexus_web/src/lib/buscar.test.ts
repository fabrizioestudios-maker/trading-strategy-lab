import { describe, expect, it } from 'vitest';
import { filtrar, normalizar, puntuar } from './buscar';

describe('búsqueda de la paleta', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizar('Analítica')).toBe('analitica');
    expect(puntuar('analitica', 'Ir a Analítica')).toBeGreaterThan(0);
  });
  it('acepta subsecuencias y rechaza lo que no está', () => {
    expect(puntuar('rply', 'Replay de mercado')).toBeGreaterThan(0);
    expect(puntuar('xyz', 'Replay de mercado')).toBe(-1);
  });
  it('prefiere coincidencias al inicio de una palabra', () => {
    const r = filtrar(['Ir a Laboratorio', 'Ir a Resumen', 'Ver atajos'], 'lab', (x) => x);
    expect(r[0]).toBe('Ir a Laboratorio');
    expect(filtrar(['b', 'a'], '', (x) => x)).toEqual(['b', 'a']);
  });
});
