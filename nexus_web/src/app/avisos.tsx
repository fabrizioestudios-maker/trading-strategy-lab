/** Avisos breves (estado de una acción) con «Deshacer» para cambios destructivos. Anunciados a lectores de pantalla. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface Aviso {
  id: number;
  texto: string;
  tono?: 'info' | 'error';
  deshacer?: () => void;
}

const Contexto = createContext<{ avisar: (a: Omit<Aviso, 'id'>) => void } | null>(null);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const n = useRef(0);
  const cerrar = useCallback((id: number) => setLista((l) => l.filter((x) => x.id !== id)), []);
  const avisar = useCallback(
    (a: Omit<Aviso, 'id'>) => {
      const id = ++n.current;
      setLista((l) => [...l.slice(-2), { ...a, id }]);
      setTimeout(() => cerrar(id), a.deshacer ? 9000 : 4500);
    },
    [cerrar],
  );
  const valor = useMemo(() => ({ avisar }), [avisar]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {lista.map((a) => (
          <div key={a.id} className={`aviso${a.tono === 'error' ? ' aviso--error' : ''}`}>
            <span>{a.texto}</span>
            {a.deshacer && (
              <button
                type="button"
                className="boton boton--texto"
                onClick={() => {
                  a.deshacer?.();
                  cerrar(a.id);
                }}
              >
                Deshacer
              </button>
            )}
            <button type="button" className="boton-icono boton-icono--chico" aria-label="Cerrar aviso" onClick={() => cerrar(a.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAvisos fuera de ProveedorAvisos');
  return c;
}
