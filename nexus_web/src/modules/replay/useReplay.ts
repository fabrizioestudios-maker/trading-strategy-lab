/**
 * Controlador del replay. El estado reproducible es (instrumento, temporalidad, límite): con eso la API devuelve
 * siempre el mismo cuadro. La interfaz nunca pide ni guarda datos posteriores al límite.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/cliente';
import type { CapasReplay, CuadroReplay, CuentaSimulada, EstadoOrdenSimulada } from '../../api/contrato.gen';
import { useEspacio, type OrdenGuardada } from '../../app/espacio';
import { useGlobales } from '../../app/globales';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Replay {
  simbolo: string;
  tf: number;
  limite: number | null;
  cuadro: CuadroReplay | null;
  capas: CapasReplay | null;
  cuenta: CuentaSimulada | null;
  estadosOrdenes: EstadoOrdenSimulada[];
  ordenes: OrdenGuardada[];
  error: unknown;
  cargando: boolean;
  reproduciendo: boolean;
  alFinal: boolean;
  setReproduciendo: (r: boolean) => void;
  paso: (n: number, unidad?: 'velas' | 'minutos') => Promise<void>;
  saltar: (fechaNy: string) => Promise<string | null>;
  reiniciar: () => Promise<void>;
  reintentar: () => void;
  latenciaMs: number | null;
}

export function useReplay(): Replay {
  const { estado, despachar } = useEspacio();
  const { setReplay } = useGlobales();
  const simbolo = estado.simbolo;
  const tf = estado.tf;
  const cantidad = estado.prefs.velasPorCuadro;
  const limite = estado.replay.limites[simbolo] ?? null;
  const velocidad = estado.replay.velocidad;
  const ordenes = useMemo(() => estado.replay.ordenes.filter((o) => o.simbolo === simbolo), [estado.replay.ordenes, simbolo]);

  const [cuadro, setCuadro] = useState<CuadroReplay | null>(null);
  const [capas, setCapas] = useState<CapasReplay | null>(null);
  const [cuenta, setCuenta] = useState<CuentaSimulada | null>(null);
  const capital = estado.prefs.capital;
  const apalancamiento = estado.prefs.apalancamiento;
  const conCapas = estado.prefs.capas.estructura || estado.prefs.capas.fvg;
  const [estadosOrdenes, setEstadosOrdenes] = useState<EstadoOrdenSimulada[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [latenciaMs, setLatencia] = useState<number | null>(null);

  const limiteRef = useRef<number | null>(limite);
  limiteRef.current = limite;
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const esperas = useRef(new Map<number, (ok: boolean) => void>());
  const alFinalRef = useRef(false);

  // límite inicial reproducible (7 días antes del final de los datos) si este instrumento no tiene uno
  useEffect(() => {
    if (limite !== null) return;
    const ctl = new AbortController();
    api
      .replayInicio(simbolo, ctl.signal)
      .then((p) => despachar({ tipo: 'limite', simbolo, limiteMs: p.limite_ms }))
      .catch((e) => !ctl.signal.aborted && setError(e));
    return () => ctl.abort();
  }, [simbolo, limite, despachar, vuelta]);

  // cuadro del límite actual (+ estado de las órdenes simuladas, calculado por el motor del laboratorio)
  useEffect(() => {
    if (limite === null) return;
    const ctl = new AbortController();
    const t0 = performance.now();
    setCargando(true);
    const pedido = ordenes.map(({ simbolo: _s, ...o }) => o);
    Promise.all([
      api.cuadro(simbolo, tf, limite, cantidad, ctl.signal),
      pedido.length ? api.ordenes({ simbolo, limite_ms: limite, ordenes: pedido }, ctl.signal) : Promise.resolve([] as EstadoOrdenSimulada[]),
      conCapas ? api.capas(simbolo, tf, limite, cantidad, ctl.signal) : Promise.resolve(null),
      api.cuenta({ simbolo, limite_ms: limite, capital, apalancamiento, ordenes: pedido }, ctl.signal),
    ])
      .then(([c, eo, cp, cta]) => {
        if (ctl.signal.aborted) return;
        setCuadro(c);
        setEstadosOrdenes(eo);
        setCapas(cp);
        setCuenta(cta);
        setError(null);
        setCargando(false);
        setLatencia(Math.round(performance.now() - t0));
        alFinalRef.current = c.al_final_de_los_datos;
        setReplay({ simbolo, tf, limite_ms: c.limite.limite_ms, limite_ny: c.limite.limite_ny, sesion: c.limite.sesion });
        esperas.current.get(limite)?.(true);
        esperas.current.delete(limite);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setError(e);
        setCargando(false);
        setReproduciendo(false);
        for (const r of esperas.current.values()) r(false);
        esperas.current.clear();
      });
    return () => ctl.abort();
  }, [simbolo, tf, limite, cantidad, ordenes, vuelta, setReplay, conCapas, capital, apalancamiento]);

  // último replay visto (para el Resumen)
  useEffect(() => {
    if (limite === null) return;
    const t = setTimeout(() => despachar({ tipo: 'reciente', reciente: { simbolo, tf, limiteMs: limite, visto_ms: Date.now() } }), 1500);
    return () => clearTimeout(t);
  }, [simbolo, tf, limite, despachar]);

  const fijarLimite = useCallback(
    (ms: number) => {
      limiteRef.current = ms;
      despachar({ tipo: 'limite', simbolo, limiteMs: ms });
    },
    [despachar, simbolo],
  );

  /** Los pasos se encolan: dos teclas seguidas avanzan dos velas, no una. */
  const paso = useCallback(
    (n: number, unidad: 'velas' | 'minutos' = 'velas') => {
      const tarea = cola.current.then(async () => {
        const base = limiteRef.current;
        if (base === null) return;
        try {
          const p = await api.paso(simbolo, tf, base, n, unidad);
          alFinalRef.current = p.al_final_de_los_datos;
          if (p.limite_ms !== base) fijarLimite(p.limite_ms);
        } catch (e) {
          setError(e);
          setReproduciendo(false);
        }
      });
      cola.current = tarea.catch(() => undefined);
      return tarea;
    },
    [simbolo, tf, fijarLimite],
  );

  // reproducción: un paso por vela, esperando que el cuadro llegue antes de pedir el siguiente (determinista)
  useEffect(() => {
    if (!reproduciendo) return;
    let vivo = true;
    (async () => {
      while (vivo) {
        const t0 = performance.now();
        const antes = limiteRef.current;
        await paso(1);
        const ahora = limiteRef.current;
        if (!vivo) break;
        if (ahora === antes || alFinalRef.current) {
          setReproduciendo(false);
          break;
        }
        if (ahora !== null) {
          const ok = await new Promise<boolean>((r) => {
            esperas.current.set(ahora, r);
            setTimeout(() => r(true), 15_000);
          });
          if (!ok) break;
        }
        const resto = 1000 / velocidad - (performance.now() - t0);
        if (resto > 0) await dormir(resto);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [reproduciendo, velocidad, paso]);

  // cambiar de instrumento o de temporalidad pausa la reproducción
  useEffect(() => setReproduciendo(false), [simbolo, tf]);

  const saltar = useCallback(
    async (fechaNy: string) => {
      setReproduciendo(false);
      try {
        const p = await api.fecha(simbolo, fechaNy);
        fijarLimite(p.limite_ms);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo saltar a esa fecha';
      }
    },
    [simbolo, fijarLimite],
  );

  const reiniciar = useCallback(async () => {
    setReproduciendo(false);
    try {
      const p = await api.replayInicio(simbolo);
      fijarLimite(p.limite_ms);
    } catch (e) {
      setError(e);
    }
  }, [simbolo, fijarLimite]);

  return {
    simbolo,
    tf,
    limite,
    cuadro: cuadro && cuadro.simbolo === simbolo ? cuadro : null,
    capas: capas && capas.simbolo === simbolo && capas.temporalidad === tf ? capas : null,
    cuenta,
    estadosOrdenes,
    ordenes,
    error,
    cargando,
    reproduciendo,
    alFinal: !!cuadro?.al_final_de_los_datos,
    setReproduciendo,
    paso,
    saltar,
    reiniciar,
    reintentar: () => setVuelta((v) => v + 1),
    latenciaMs,
  };
}
