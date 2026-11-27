import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface ItemMenu {
  id: string;
  texto: ReactNode;
  detalle?: ReactNode;
  deshabilitado?: boolean;
  separadorAntes?: boolean;
  alElegir: () => void;
}

/** Menú desplegable accesible: flechas, Enter, Escape, clic afuera. El botón lo arma quien lo usa. */
export function Menu({
  etiqueta,
  items,
  boton,
  alinear = 'izq',
  marcado,
}: {
  etiqueta: string;
  items: ItemMenu[];
  boton: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode;
  alinear?: 'izq' | 'der';
  marcado?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [foco, setFoco] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const i = Math.max(0, items.findIndex((x) => x.id === marcado));
    setFoco(i);
    requestAnimationFrame(() => refs.current[i]?.focus());
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const mover = (d: number) => {
    const n = items.length;
    let j = foco;
    for (let k = 0; k < n; k++) {
      j = (j + d + n) % n;
      if (!items[j].deshabilitado) break;
    }
    setFoco(j);
    refs.current[j]?.focus();
  };

  return (
    <div className="selector-instrumento" ref={caja}>
      {boton({ onClick: () => setAbierto((a) => !a), 'aria-haspopup': 'menu', 'aria-expanded': abierto, 'aria-controls': id })}
      {abierto && (
        <div
          className="menu"
          role="menu"
          id={id}
          aria-label={etiqueta}
          style={{ top: 'calc(100% + 6px)', [alinear === 'izq' ? 'left' : 'right']: 0 }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              mover(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              mover(-1);
            } else if (e.key === 'Escape' || e.key === 'Tab') {
              setAbierto(false);
            }
          }}
        >
          {items.map((it, i) => (
            <div key={it.id}>
              {it.separadorAntes && <div className="menu__separador" role="separator" />}
              <button
                ref={(el) => (refs.current[i] = el)}
                type="button"
                role="menuitem"
                className="menu__item"
                tabIndex={i === foco ? 0 : -1}
                aria-disabled={it.deshabilitado || undefined}
                aria-current={it.id === marcado || undefined}
                onClick={() => {
                  if (it.deshabilitado) return;
                  setAbierto(false);
                  it.alElegir();
                }}
              >
                {it.texto}
                {it.detalle && <small>{it.detalle}</small>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
