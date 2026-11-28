import { describe, expect, it } from 'vitest';
import { MODULOS, armarRuta, leerRuta } from './rutas';

describe('rutas', () => {
  it('tiene los nueve módulos del producto', () => {
    expect(MODULOS.map((m) => m.ingles)).toEqual([
      'Overview',
      'Market Replay',
      'Strategy Tester',
      'Strategy Lab',
      'Indicators',
      'Execution Engine',
      'Performance Analytics',
      'Data Center',
      'Admin',
      'Settings',
    ]);
    expect(new Set(MODULOS.map((m) => m.tecla)).size).toBe(MODULOS.length);
  });
  it('lee módulo y parámetros; lo desconocido va al resumen', () => {
    expect(leerRuta('')).toEqual({ modulo: 'resumen', params: {} });
    expect(leerRuta('#/nada')).toEqual({ modulo: 'resumen', params: {} });
    expect(leerRuta('#/replay?s=XAUUSD&tf=15&t=1795057140000')).toEqual({ modulo: 'replay', params: { s: 'XAUUSD', tf: '15', t: '1795057140000' } });
  });
  it('ida y vuelta', () => {
    const r = armarRuta('analitica', { corrida: 'x-1', comparar: undefined });
    expect(r).toBe('#/analitica?corrida=x-1');
    expect(leerRuta(r)).toEqual({ modulo: 'analitica', params: { corrida: 'x-1' } });
  });
});
