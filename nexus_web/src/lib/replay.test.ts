import { describe, expect, it } from 'vitest';
import { cambiarVelocidad, contarEstados, leerEstadoCompartible, nuevoId, ordenesVigentes, validarOrden, velaQueContiene } from './replay';

describe('reglas del replay en la interfaz', () => {
  it('encuentra la vela que contiene un instante', () => {
    const v = [{ t: 100 }, { t: 200 }, { t: 300 }];
    expect(velaQueContiene(v, 50)).toBe(-1);
    expect(velaQueContiene(v, 200)).toBe(1);
    expect(velaQueContiene(v, 299)).toBe(1);
    expect(velaQueContiene(v, 10_000)).toBe(2);
  });
  it('valida el lado del stop y del objetivo', () => {
    expect(validarOrden('compra', 100, 99, 102)).toBeNull();
    expect(validarOrden('compra', 100, 101, 102)).toMatch(/stop va debajo/);
    expect(validarOrden('venta', 100, 101, 98)).toBeNull();
    expect(validarOrden('venta', 100, 99, 98)).toMatch(/stop va arriba/);
    expect(validarOrden('compra', 100, 0, 102)).toMatch(/mayores que cero/);
  });
  it('la velocidad queda dentro de los valores permitidos', () => {
    expect(cambiarVelocidad(16, 1)).toBe(16);
    expect(cambiarVelocidad(1, -1)).toBe(1);
    expect(cambiarVelocidad(2, 1)).toBe(4);
  });
  it('las órdenes creadas después del límite no existen todavía', () => {
    const o = [
      { id: 'a', lado: 'compra' as const, creada_limite_ms: 10, sl: 1, tp: 3 },
      { id: 'b', lado: 'venta' as const, creada_limite_ms: 30, sl: 3, tp: 1 },
    ];
    expect(ordenesVigentes(o, 20).map((x) => x.id)).toEqual(['a']);
  });
  it('lee un estado compartido por enlace solo si es válido', () => {
    expect(leerEstadoCompartible({ s: 'XAUUSD', tf: '15', t: '1795057140000' })).toEqual({ simbolo: 'XAUUSD', tf: 15, limiteMs: 1795057140000 });
    expect(leerEstadoCompartible({ s: 'XAUUSD', tf: '7', t: '1' })).toBeNull();
    expect(leerEstadoCompartible({ s: '<script>', tf: '15', t: '1' })).toBeNull();
    expect(leerEstadoCompartible({})).toBeNull();
  });
  it('ids estables con la misma entrada y conteo de estados', () => {
    expect(nuevoId(1000, 0.5)).toBe(nuevoId(1000, 0.5));
    const c = contarEstados([
      { id: 'a', estado: 'abierta', entrada_ms: 1, precio_entrada: 1, salida_ms: null, precio_salida: 1, motivo: null, r: 0, costo_r: 0, explicacion: '' },
      { id: 'b', estado: 'cerrada', entrada_ms: 1, precio_entrada: 1, salida_ms: 2, precio_salida: 1, motivo: 'TP', r: 2, costo_r: 0, explicacion: '' },
    ]);
    expect(c.abierta).toBe(1);
    expect(c.cerrada).toBe(1);
    expect(c.rechazada).toBe(0);
  });
});
