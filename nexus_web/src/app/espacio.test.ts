import { describe, expect, it } from 'vitest';
import { ESTADO_INICIAL, PREFS_INICIALES, reducir, sanear } from './espacio';

describe('espacio de trabajo', () => {
  it('lo guardado roto o viejo vuelve a valores válidos', () => {
    expect(sanear(null)).toEqual(ESTADO_INICIAL);
    const s = sanear({ simbolo: '<x>', tf: 7, prefs: { velasPorCuadro: 99999, panelReplay: { ancho: 5 } }, replay: { velocidad: 3, ordenes: [{ id: 'a', lado: 'x' }] } });
    expect(s.simbolo).toBe('XAUUSD');
    expect(s.tf).toBe(15);
    expect(s.prefs.velasPorCuadro).toBe(800);
    expect(s.prefs.panelReplay.ancho).toBe(260);
    expect(s.prefs.capas).toEqual(PREFS_INICIALES.capas);
    expect(s.replay.velocidad).toBe(2);
    expect(s.replay.ordenes).toEqual([]);
  });
  it('conserva órdenes válidas y les asigna instrumento si falta', () => {
    const s = sanear({ replay: { ordenes: [{ id: 'o-1', lado: 'compra', creada_limite_ms: 5, sl: 1, tp: 2, extra: 'x' }] } });
    expect(s.replay.ordenes).toEqual([{ id: 'o-1', lado: 'compra', creada_limite_ms: 5, sl: 1, tp: 2, simbolo: 'XAUUSD' }]);
  });
  it('los replays recientes no se repiten y son como mucho ocho', () => {
    let s = ESTADO_INICIAL;
    for (let i = 0; i < 12; i++) s = reducir(s, { tipo: 'reciente', reciente: { simbolo: `S${i}`, tf: 15, limiteMs: i + 1, visto_ms: i } });
    s = reducir(s, { tipo: 'reciente', reciente: { simbolo: 'S11', tf: 15, limiteMs: 99, visto_ms: 99 } });
    expect(s.recientes).toHaveLength(8);
    expect(s.recientes[0].limiteMs).toBe(99);
    expect(s.recientes.filter((x) => x.simbolo === 'S11')).toHaveLength(1);
  });
  it('el límite se guarda por instrumento', () => {
    const s = reducir(reducir(ESTADO_INICIAL, { tipo: 'limite', simbolo: 'XAUUSD', limiteMs: 10 }), { tipo: 'limite', simbolo: 'EURUSD', limiteMs: 20 });
    expect(s.replay.limites).toEqual({ XAUUSD: 10, EURUSD: 20 });
  });
});
