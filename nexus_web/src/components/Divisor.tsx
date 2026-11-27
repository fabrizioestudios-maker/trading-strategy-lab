import { useRef } from 'react';

/** Separador redimensionable (mouse, táctil y teclado: flechas, Inicio/Fin). Cambia el ancho del panel de la derecha. */
export function Divisor({ ancho, min, max, onCambio, etiqueta }: { ancho: number; min: number; max: number; onCambio: (a: number) => void; etiqueta: string }) {
  const inicio = useRef<{ x: number; a: number } | null>(null);
  const fijar = (a: number) => onCambio(Math.round(Math.min(max, Math.max(min, a))));
  return (
    <div
      className="divisor"
      role="separator"
      aria-orientation="vertical"
      aria-label={etiqueta}
      aria-valuenow={ancho}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        inicio.current = { x: e.clientX, a: ancho };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (inicio.current) fijar(inicio.current.a - (e.clientX - inicio.current.x));
      }}
      onPointerUp={() => (inicio.current = null)}
      onKeyDown={(e) => {
        const paso = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') fijar(ancho + paso);
        else if (e.key === 'ArrowRight') fijar(ancho - paso);
        else if (e.key === 'Home') fijar(max);
        else if (e.key === 'End') fijar(min);
        else return;
        e.preventDefault();
      }}
    />
  );
}
