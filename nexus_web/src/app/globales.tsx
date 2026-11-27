/** Datos compartidos por todos los módulos: salud de la API, instrumentos, referencias y el contexto del replay. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/cliente';
import type { Instrumento, Referencias, Salud } from '../api/contrato.gen';
import { useRecurso, type Recurso } from '../api/recurso';

export interface ContextoReplay {
  simbolo: string;
  tf: number;
  limite_ms: number;
  limite_ny: string;
  sesion: string;
}

interface Ctx {
  salud: { datos: Salud | null; error: unknown; revisado_ms: number };
  instrumentos: Recurso<Instrumento[]>;
  referencias: Recurso<Referencias>;
  replay: ContextoReplay | null;
  setReplay: (c: ContextoReplay | null) => void;
}

const Contexto = createContext<Ctx | null>(null);

export function ProveedorGlobales({ children }: { children: ReactNode }) {
  const [salud, setSalud] = useState<Ctx['salud']>({ datos: null, error: null, revisado_ms: 0 });
  const [replay, setReplay] = useState<ContextoReplay | null>(null);
  const instrumentos = useRecurso((s) => api.instrumentos(s), []);
  const referencias = useRecurso((s) => api.referencias(s), []);

  useEffect(() => {
    let vivo = true;
    const revisar = () =>
      api
        .salud()
        .then((datos) => vivo && setSalud({ datos, error: null, revisado_ms: Date.now() }))
        .catch((error) => vivo && setSalud((s) => ({ datos: s.datos, error, revisado_ms: Date.now() })));
    revisar();
    const t = setInterval(revisar, 20_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  // si la API vuelve después de estar caída, se recargan los catálogos que fallaron
  const conectada = !!salud.datos && !salud.error;
  useEffect(() => {
    if (conectada && instrumentos.error) instrumentos.recargar();
    if (conectada && referencias.error) referencias.recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectada]);

  const valor = useMemo(() => ({ salud, instrumentos, referencias, replay, setReplay }), [salud, instrumentos, referencias, replay]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useGlobales(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error('useGlobales fuera de ProveedorGlobales');
  return c;
}
