/** Estrategias del probador: tipos de la interfaz, ejemplos y estrategias guardadas en el navegador. */
import type { Condicion_Input, Operando as OperandoApi } from '../api/contrato.gen';

export type Operando = OperandoApi;
export type Condicion = Condicion_Input;
/** El pedido con todos los campos (la interfaz siempre los completa) */
export type Estrategia = Required<Omit<import('../api/contrato.gen').PedidoProbador, 'compra' | 'venta' | 'nombre'>> & { nombre: string; compra: Condicion[]; venta: Condicion[] };

export const ind = (id: string, parametros: Record<string, number> = {}, linea?: string): Operando => ({
  tipo: 'indicador',
  id,
  parametros,
  linea: linea ?? null,
  campo: null,
  valor: null,
});
export const valor = (v: number): Operando => ({ tipo: 'valor', id: null, parametros: {}, linea: null, campo: null, valor: v });
export const precio = (campo: 'close' | 'open' | 'high' | 'low' = 'close'): Operando => ({ tipo: 'precio', id: null, parametros: {}, linea: null, campo, valor: null });
export const cond = (izq: Operando, op: Condicion['op'], der: Operando): Condicion => ({ izq, op, der });

export const OPERADORES: { id: Condicion['op']; nombre: string }[] = [
  { id: 'cruza_arriba', nombre: 'cruza hacia arriba' },
  { id: 'cruza_abajo', nombre: 'cruza hacia abajo' },
  { id: 'mayor', nombre: 'es mayor que' },
  { id: 'menor', nombre: 'es menor que' },
];

const BASE: Omit<Estrategia, 'compra' | 'venta' | 'nombre'> = {
  simbolo: 'XAUUSD',
  tf: 60,
  desde: '2019-01-01',
  hasta: '2026-11-01',
  fraccion_validacion: 0.3,
  sl_atr: 1.5,
  rr: 2,
  atr_n: 14,
  max_velas: 0,
  perfil_costos: 'base',
};

export const EJEMPLOS: Estrategia[] = [
  {
    ...BASE,
    nombre: 'Cruce de EMA 20/50',
    compra: [cond(ind('ema', { periodo: 20 }), 'cruza_arriba', ind('ema', { periodo: 50 }))],
    venta: [cond(ind('ema', { periodo: 20 }), 'cruza_abajo', ind('ema', { periodo: 50 }))],
  },
  {
    ...BASE,
    nombre: 'RSI 30/70 a favor de la SMA 200',
    compra: [cond(ind('rsi'), 'cruza_arriba', valor(30)), cond(precio(), 'mayor', ind('sma', { periodo: 200 }))],
    venta: [cond(ind('rsi'), 'cruza_abajo', valor(70)), cond(precio(), 'menor', ind('sma', { periodo: 200 }))],
  },
  {
    ...BASE,
    nombre: 'Ruptura de Bollinger',
    tf: 240,
    compra: [cond(precio(), 'cruza_arriba', ind('bb', {}, 'Superior'))],
    venta: [cond(precio(), 'cruza_abajo', ind('bb', {}, 'Inferior'))],
  },
  {
    ...BASE,
    nombre: 'MACD con ADX > 25',
    compra: [cond(ind('macd', {}, 'MACD'), 'cruza_arriba', ind('macd', {}, 'Señal')), cond(ind('adx', {}, 'ADX'), 'mayor', valor(25))],
    venta: [cond(ind('macd', {}, 'MACD'), 'cruza_abajo', ind('macd', {}, 'Señal')), cond(ind('adx', {}, 'ADX'), 'mayor', valor(25))],
  },
];

export const CLAVE_ESTRATEGIAS = 'nexus.estrategias.v1';
