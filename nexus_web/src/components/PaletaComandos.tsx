import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useComandos, type Comando } from '../app/comandos';
import { filtrar } from '../lib/buscar';
import { Icono } from './iconos';
import { Tecla } from './ui';

/** Paleta de comandos (Ctrl/⌘ K): navegar y ejecutar acciones del módulo abierto con el teclado. */
export function PaletaComandos() {
  const { comandos, paletaAbierta, abrirPaleta } = useComandos();
  const [consulta, setConsulta] = useState('');
  const [sel, setSel] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (paletaAbierta) {
      setConsulta('');
      setSel(0);
      const previo = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => entrada.current?.focus());
      return () => previo?.focus?.();
    }
  }, [paletaAbierta]);

  const resultados = useMemo(() => filtrar(comandos, consulta, (c) => `${c.titulo} ${c.grupo} ${c.palabras ?? ''}`), [comandos, consulta]);
  const grupos = useMemo(() => {
    const g = new Map<string, Comando[]>();
    for (const c of resultados) g.set(c.grupo, [...(g.get(c.grupo) ?? []), c]);
    return consulta.trim() ? [['Resultados', resultados] as [string, Comando[]]] : [...g.entries()];
  }, [resultados, consulta]);
  const plano = grupos.flatMap(([, l]) => l);

  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!paletaAbierta) return null;

  const ejecutar = (c: Comando | undefined) => {
    if (!c || c.deshabilitado) return;
    abrirPaleta(false);
    setTimeout(() => c.ejecutar(), 0);
  };

  let indice = -1;
  return (
    <div className="velo" data-dialogo-abierto onMouseDown={(e) => e.target === e.currentTarget && abrirPaleta(false)}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="paleta__entrada">
          <Icono nombre="buscar" tam={18} />
          <input
            ref={entrada}
            value={consulta}
            placeholder="Buscar un módulo o una acción…"
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={plano[sel] ? `${idLista}-${plano[sel].id}` : undefined}
            aria-autocomplete="list"
            onChange={(e) => {
              setConsulta(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(plano.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                ejecutar(plano[sel]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                abrirPaleta(false);
              }
            }}
          />
        </div>
        <div className="paleta__lista" id={idLista} role="listbox" ref={lista} aria-label="Comandos">
          {plano.length === 0 && <p className="estado__texto" style={{ padding: 16 }}>No hay comandos que coincidan con «{consulta}».</p>}
          {grupos.map(([grupo, l]) => (
            <div key={grupo} role="group" aria-label={grupo}>
              <div className="paleta__grupo">{grupo}</div>
              {l.map((c) => {
                indice += 1;
                const i = indice;
                return (
                  <div
                    key={c.id}
                    id={`${idLista}-${c.id}`}
                    role="option"
                    aria-selected={i === sel}
                    aria-disabled={c.deshabilitado ? true : undefined}
                    className="paleta__item"
                    onMouseMove={() => setSel(i)}
                    onClick={() => ejecutar(c)}
                  >
                    <span>
                      {c.titulo}
                      {c.deshabilitado && <span className="paleta__motivo"> · {c.deshabilitado}</span>}
                    </span>
                    {c.atajo && (
                      <span className="paleta__atajo">
                        {c.atajo.split(' ').map((t, k) => (t === 'luego' ? <span key={k} className="tenue">luego</span> : <Tecla key={k}>{t}</Tecla>))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="paleta__pie">
          <span>
            <Tecla>↑</Tecla>
            <Tecla>↓</Tecla> elegir
          </span>
          <span>
            <Tecla>Enter</Tecla> ejecutar
          </span>
          <span>
            <Tecla>Esc</Tecla> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
