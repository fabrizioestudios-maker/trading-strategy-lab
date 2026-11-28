import { describe, expect, it } from 'vitest';
import { heikinAshi, sanearDibujos } from './grafico';

describe('gráfico', () => {
  it('Heikin Ashi usa la vela anterior ya transformada', () => {
    const v = [
      { t: 0, o: 10, h: 12, l: 9, c: 11, parcial: false },
      { t: 1, o: 11, h: 13, l: 10, c: 12, parcial: false },
    ];
    const ha = heikinAshi(v as never);
    expect(ha[0].c).toBeCloseTo(10.5);
    expect(ha[0].o).toBeCloseTo(10.5);
    expect(ha[1].o).toBeCloseTo((ha[0].o + ha[0].c) / 2);
    expect(ha[1].c).toBeCloseTo(11.5);
    expect(ha[1].h).toBe(13);
  });
  it('los dibujos guardados se sanean', () => {
    const d = sanearDibujos({
      XAUUSD: [
        { id: 'a', tipo: 'tendencia', puntos: [{ t: 1, p: 2 }, { t: 3, p: 4 }], color: '#ffffff' },
        { id: 'b', tipo: 'tendencia', puntos: [{ t: 1, p: 2 }] },
        { id: 'c', tipo: 'otro', puntos: [] },
        { id: 'd', tipo: 'horizontal', puntos: [{ t: 1, p: 5 }], color: 'red' },
      ],
      'no válido': [],
    });
    expect(d.XAUUSD.map((x) => x.id)).toEqual(['a', 'd']);
    expect(d.XAUUSD[1].color).toBe('#e8a83a');
  });
});
