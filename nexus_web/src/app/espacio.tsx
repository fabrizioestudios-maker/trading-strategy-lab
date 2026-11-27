/**
 * Espacio de trabajo: instrumento, temporalidad, estado del replay, órdenes simuladas y preferencias.
 * Se guarda en el navegador (sin secretos) y se puede guardar con nombre, exportar e importar desde Ajustes.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { OrdenSimuladaEntrada } from '../api/contrato.gen';
import { guardar, leer } from '../lib/almacen';

export interface Preferencias {
  densidad: 'compacta' | 'comoda';
  texto: '100' | '112';
  contraste: 'normal' | 'alto';
  movimiento: 'sistema' | 'reducido';
  zona: 'ny' | 'utc';
  tfPorDefecto: number;
  velasPorCuadro: number;
  capital: number;
  riesgoPct: number;
  pasoLote: number;
  apalancamiento: number;
  navColapsada: boolean;
  panelReplay: { visible: boolean; ancho: number; pestana: 'operar' | 'ordenes' | 'decision' | 'eventos' };
  capas: { sesiones: boolean; niveles: boolean; ordenes: boolean; senales: boolean; estructura: boolean; fvg: boolean; rsi: boolean; macd: boolean };
}

export const PREFS_INICIALES: Preferencias = {
  densidad: 'compacta',
  texto: '100',
  contraste: 'normal',
  movimiento: 'sistema',
  zona: 'ny',
  tfPorDefecto: 15,
  velasPorCuadro: 300,
  capital: 10_000,
  riesgoPct: 0.5,
  pasoLote: 0.01,
  apalancamiento: 50,
  navColapsada: false,
  panelReplay: { visible: true, ancho: 340, pestana: 'operar' },
  capas: { sesiones: true, niveles: true, ordenes: true, senales: true, estructura: false, fvg: false, rsi: true, macd: true },
};

export interface ReplayReciente {
  simbolo: string;
  tf: number;
  limiteMs: number;
  visto_ms: number;
}

/** Orden simulada guardada en el espacio: la entrada del contrato más el instrumento (que no viaja a la API). */
export type OrdenGuardada = OrdenSimuladaEntrada & { simbolo: string };

export interface EstadoEspacio {
  version: 1;
  nombre: string;
  simbolo: string;
  tf: number;
  prefs: Preferencias;
  replay: { limites: Record<string, number>; velocidad: number; pasoN: number; ordenes: OrdenGuardada[] };
  recientes: ReplayReciente[];
}

export const ESTADO_INICIAL: EstadoEspacio = {
  version: 1,
  nombre: 'Predeterminado',
  simbolo: 'XAUUSD',
  tf: 15,
  prefs: PREFS_INICIALES,
  replay: { limites: {}, velocidad: 2, pasoN: 10, ordenes: [] },
  recientes: [],
};

export interface EspacioGuardado {
  nombre: string;
  guardado_ms: number;
  estado: EstadoEspacio;
}

type Accion =
  | { tipo: 'prefs'; prefs: Partial<Preferencias> }
  | { tipo: 'simbolo'; simbolo: string }
  | { tipo: 'tf'; tf: number }
  | { tipo: 'limite'; simbolo: string; limiteMs: number }
  | { tipo: 'velocidad'; velocidad: number }
  | { tipo: 'pasoN'; pasoN: number }
  | { tipo: 'ordenes'; ordenes: OrdenGuardada[] }
  | { tipo: 'reciente'; reciente: ReplayReciente }
  | { tipo: 'cargar'; estado: EstadoEspacio }
  | { tipo: 'nombre'; nombre: string };

/** Mezcla lo guardado con los valores iniciales: una versión vieja o un archivo importado incompleto no rompe la app. */
export function sanear(x: unknown): EstadoEspacio {
  const e = (x && typeof x === 'object' ? x : {}) as Partial<EstadoEspacio>;
  const p = (e.prefs ?? {}) as Partial<Preferencias>;
  const prefs: Preferencias = {
    ...PREFS_INICIALES,
    ...p,
    panelReplay: { ...PREFS_INICIALES.panelReplay, ...(p.panelReplay ?? {}) },
    capas: { ...PREFS_INICIALES.capas, ...(p.capas ?? {}) },
  };
  prefs.velasPorCuadro = Math.min(800, Math.max(100, Number(prefs.velasPorCuadro) || 300));
  prefs.apalancamiento = Math.min(1000, Math.max(1, Number(prefs.apalancamiento) || 50));
  prefs.panelReplay.ancho = Math.min(560, Math.max(260, Number(prefs.panelReplay.ancho) || 340));
  if (!['operar', 'ordenes', 'decision', 'eventos'].includes(prefs.panelReplay.pestana)) prefs.panelReplay.pestana = 'operar';
  const r = (e.replay ?? {}) as Partial<EstadoEspacio['replay']>;
  const ordenes = Array.isArray(r.ordenes)
    ? r.ordenes
        .filter((o) => o && typeof o.id === 'string' && (o.lado === 'compra' || o.lado === 'venta') && o.sl > 0 && o.tp > 0 && o.creada_limite_ms > 0)
        .filter((o) => o.tipo !== 'limite' || (Number(o.entrada) > 0 && Number(o.vence_minutos) >= 1))
        .map((o) => ({
          id: o.id.slice(0, 40),
          lado: o.lado,
          creada_limite_ms: o.creada_limite_ms,
          sl: o.sl,
          tp: o.tp,
          simbolo: typeof o.simbolo === 'string' ? o.simbolo : 'XAUUSD',
          ...(o.tipo === 'limite' ? { tipo: 'limite' as const, entrada: Number(o.entrada), vence_minutos: Math.min(10080, Math.floor(Number(o.vence_minutos))) } : {}),
          ...(Number(o.lotes) > 0 ? { lotes: Number(o.lotes) } : {}),
        }))
    : [];
  return {
    version: 1,
    nombre: typeof e.nombre === 'string' && e.nombre.trim() ? e.nombre.slice(0, 60) : ESTADO_INICIAL.nombre,
    simbolo: typeof e.simbolo === 'string' && /^[A-Z0-9]{3,10}$/.test(e.simbolo) ? e.simbolo : 'XAUUSD',
    tf: [1, 5, 15, 60, 240, 1440].includes(Number(e.tf)) ? Number(e.tf) : 15,
    prefs,
    replay: {
      limites: r.limites && typeof r.limites === 'object' ? Object.fromEntries(Object.entries(r.limites).filter(([, v]) => Number(v) > 0)) : {},
      velocidad: [1, 2, 4, 8, 16].includes(Number(r.velocidad)) ? Number(r.velocidad) : 2,
      pasoN: [5, 10, 20, 50].includes(Number(r.pasoN)) ? Number(r.pasoN) : 10,
      ordenes: ordenes.slice(0, 200),
    },
    recientes: Array.isArray(e.recientes) ? e.recientes.filter((x) => x && x.limiteMs > 0).slice(0, 8) : [],
  };
}

export function reducir(s: EstadoEspacio, a: Accion): EstadoEspacio {
  switch (a.tipo) {
    case 'prefs':
      return { ...s, prefs: { ...s.prefs, ...a.prefs } };
    case 'simbolo':
      return { ...s, simbolo: a.simbolo };
    case 'tf':
      return { ...s, tf: a.tf };
    case 'limite':
      return { ...s, replay: { ...s.replay, limites: { ...s.replay.limites, [a.simbolo]: a.limiteMs } } };
    case 'velocidad':
      return { ...s, replay: { ...s.replay, velocidad: a.velocidad } };
    case 'pasoN':
      return { ...s, replay: { ...s.replay, pasoN: a.pasoN } };
    case 'ordenes':
      return { ...s, replay: { ...s.replay, ordenes: a.ordenes.slice(0, 200) } };
    case 'reciente': {
      const otros = s.recientes.filter((x) => !(x.simbolo === a.reciente.simbolo && x.tf === a.reciente.tf));
      return { ...s, recientes: [a.reciente, ...otros].slice(0, 8) };
    }
    case 'cargar':
      return sanear(a.estado);
    case 'nombre':
      return { ...s, nombre: a.nombre };
  }
}

const CLAVE = 'nexus.espacio.v1';
export const CLAVE_GUARDADOS = 'nexus.espacios.v1';

interface Ctx {
  estado: EstadoEspacio;
  despachar: (a: Accion) => void;
}

const Contexto = createContext<Ctx | null>(null);

export function ProveedorEspacio({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducir, undefined, () => sanear(leer(CLAVE, ESTADO_INICIAL)));

  useEffect(() => {
    const t = setTimeout(() => guardar(CLAVE, estado), 250);
    return () => clearTimeout(t);
  }, [estado]);

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.densidad = estado.prefs.densidad;
    r.dataset.contraste = estado.prefs.contraste;
    r.dataset.texto = estado.prefs.texto;
    r.dataset.movimiento = estado.prefs.movimiento;
  }, [estado.prefs.densidad, estado.prefs.contraste, estado.prefs.texto, estado.prefs.movimiento]);

  const valor = useMemo(() => ({ estado, despachar }), [estado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEspacio(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error('useEspacio fuera de ProveedorEspacio');
  return c;
}

export function espaciosGuardados(): EspacioGuardado[] {
  const l = leer<EspacioGuardado[]>(CLAVE_GUARDADOS, []);
  return Array.isArray(l) ? l.filter((x) => x && typeof x.nombre === 'string' && x.estado) : [];
}

export function guardarEspacios(l: EspacioGuardado[]): boolean {
  return guardar(CLAVE_GUARDADOS, l.slice(0, 20));
}
