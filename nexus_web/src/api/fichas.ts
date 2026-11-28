import { useEffect, useState } from 'react';
import { api } from './cliente';
import type { FichaMercado } from './contrato.gen';

/** Fichas de mercado de varios instrumentos, en paralelo; cada una aparece cuando llega. */
export function useFichas(simbolos: string[]) {
  const [fichas, setFichas] = useState<Record<string, FichaMercado | Error>>({});
  const clave = simbolos.join(',');
  useEffect(() => {
    const ctl = new AbortController();
    for (const s of simbolos)
      api
        .mercado(s, ctl.signal)
        .then((f) => !ctl.signal.aborted && setFichas((x) => ({ ...x, [s]: f })))
        .catch((e) => !ctl.signal.aborted && setFichas((x) => ({ ...x, [s]: e instanceof Error ? e : new Error(String(e)) })));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return fichas;
}

