import { useCallback, useEffect, useRef, useState } from 'react';

export interface Recurso<T> {
  datos: T | null;
  error: unknown;
  cargando: boolean;
  recargar: () => void;
}

/**
 * Carga un recurso de la API con estados explícitos (cargando / error / datos). Cancela el pedido anterior si cambian
 * las dependencias y descarta respuestas viejas, así el estado siempre corresponde a los últimos parámetros.
 */
export function useRecurso<T>(cargar: (s: AbortSignal) => Promise<T>, deps: unknown[], activo = true): Recurso<T> {
  const [estado, setEstado] = useState<{ datos: T | null; error: unknown; cargando: boolean }>({ datos: null, error: null, cargando: activo });
  const [vuelta, setVuelta] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    if (!activo) return;
    const ctl = new AbortController();
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    cargarRef
      .current(ctl.signal)
      .then((datos) => {
        if (!ctl.signal.aborted) setEstado({ datos, error: null, cargando: false });
      })
      .catch((error) => {
        if (!ctl.signal.aborted) setEstado((e) => ({ datos: e.datos, error, cargando: false }));
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vuelta, activo]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recargar };
}
