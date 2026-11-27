import { describe, expect, it } from 'vitest';
import { claveRespuesta, cyrb53 } from './clave';

describe('clave de respuesta grabada', () => {
  it('es estable (el grabador usa los mismos valores)', () => {
    expect(cyrb53('')).toBe('0bdcb81aee8d83');
    expect(cyrb53('GET /api/v1/salud\n')).toBe('0bc336b1d190dd');
    expect(claveRespuesta('get', '/api/v1/salud')).toBe(claveRespuesta('GET', '/api/v1/salud', null));
    expect(claveRespuesta('POST', '/api/v1/riesgo', '{"a":1}')).not.toBe(claveRespuesta('POST', '/api/v1/riesgo', '{"a":2}'));
    expect(claveRespuesta('GET', '/api/v1/salud')).toMatch(/^[0-9a-f]{14}$/);
  });
});
