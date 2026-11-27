import { describe, expect, it } from 'vitest';
import { conSigno, duracion, entero, entradaNy, etiquetaTf, fecha, fechaHora, fechaHoraCorta, hora, numero, porcentaje, precio, tono } from './formato';

const MENOS = '−';

describe('números', () => {
  it('usa coma decimal y punto de miles (es-AR)', () => {
    expect(precio(3588.58)).toBe('3.588,58');
    expect(entero(5924942)).toBe('5.924.942');
    expect(numero(0.3316, 3)).toBe('0,332');
  });
  it('escribe el signo menos tipográfico y nunca «−0»', () => {
    expect(numero(-1.5, 2)).toBe(`${MENOS}1,50`);
    expect(numero(-0.001, 2)).toBe('0,00');
    expect(conSigno(0.41, 2, 'R')).toBe('+0,41 R');
    expect(conSigno(-1, 2)).toBe(`${MENOS}1,00`);
    expect(conSigno(0.0001, 2)).toBe('0,00');
  });
  it('muestra un guion cuando no hay valor', () => {
    expect(precio(null)).toBe('—');
    expect(conSigno(undefined)).toBe('—');
    expect(porcentaje(Number.NaN)).toBe('—');
  });
  it('porcentaje y tono', () => {
    expect(porcentaje(45.238, 1)).toBe('45,2 %');
    expect(tono(0.2)).toBe('pos');
    expect(tono(-0.2)).toBe('neg');
    expect(tono(0)).toBe('neutro');
  });
});

describe('fechas con zona explícita', () => {
  const invierno = Date.UTC(2026, 11, 1, 12, 0); // 1 dic 2026 12:00 UTC
  const verano = Date.UTC(2026, 6, 1, 12, 0); // 1 jul 2026 12:00 UTC
  it('convierte a Nueva York respetando el horario de verano', () => {
    expect(hora(invierno, 'ny')).toBe('07:00');
    expect(hora(verano, 'ny')).toBe('08:00');
    expect(hora(verano, 'utc')).toBe('12:00');
  });
  it('formatea fecha y hora con el sufijo de la zona', () => {
    expect(fechaHora(invierno, 'ny')).toBe('1 dic 2026 07:00 NY');
    expect(fechaHora(invierno, 'utc')).toBe('1 dic 2026 12:00 UTC');
    expect(fechaHoraCorta(invierno, 'ny')).toBe('1 dic 07:00 NY');
    expect(fecha(Date.UTC(2026, 10, 26, 2, 59), 'ny')).toBe('25 nov 2026');
  });
  it('arma el valor del salto de fecha en hora de Nueva York', () => {
    expect(entradaNy(Date.UTC(2026, 10, 19, 2, 59))).toBe('2026-11-18T21:59');
  });
});

describe('otros', () => {
  it('etiquetas de temporalidad', () => {
    expect([1, 5, 15, 60, 240, 1440].map(etiquetaTf)).toEqual(['1m', '5m', '15m', '1h', '4h', 'D']);
  });
  it('duraciones legibles', () => {
    expect(duracion(42_000)).toBe('42 s');
    expect(duracion(3_600_000 + 23 * 60_000)).toBe('1 h 23 min');
    expect(duracion(3 * 86_400_000)).toBe('3 d');
  });
});
