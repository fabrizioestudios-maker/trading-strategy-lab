import { useCallback, useEffect, useState } from 'react';
import { armarRuta, leerRuta, type Modulo, type Ruta } from '../lib/rutas';

export function useRuta(): { ruta: Ruta; ir: (m: Modulo, params?: Record<string, string | number | undefined>) => void } {
  const [ruta, setRuta] = useState<Ruta>(() => leerRuta(window.location.hash));
  useEffect(() => {
    const cambiar = () => setRuta(leerRuta(window.location.hash));
    window.addEventListener('hashchange', cambiar);
    return () => window.removeEventListener('hashchange', cambiar);
  }, []);
  const ir = useCallback((m: Modulo, params?: Record<string, string | number | undefined>) => {
    window.location.hash = armarRuta(m, params);
  }, []);
  return { ruta, ir };
}
