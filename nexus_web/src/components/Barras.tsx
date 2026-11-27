/** Barras con signo desde una línea de cero (R por año). El valor también está en la tabla de al lado: no solo color. */
import { useState } from 'react';
import { conSigno } from '../lib/formato';

export interface Barra {
  clave: string;
  valor: number;
  detalle: string;
  atenuada?: boolean;
}

export function Barras({
  datos,
  alto = 180,
  etiqueta,
  separarAntesDe,
  formato = (v: number) => conSigno(v, 2, 'R'),
}: {
  datos: Barra[];
  alto?: number;
  etiqueta: string;
  separarAntesDe?: string;
  formato?: (v: number) => string;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  if (!datos.length) return null;
  const max = Math.max(...datos.map((d) => Math.abs(d.valor)), 1e-9);
  const tienenNeg = datos.some((d) => d.valor < 0);
  const tienenPos = datos.some((d) => d.valor > 0);
  const arriba = tienenNeg && tienenPos ? 0.5 : tienenNeg ? 0.04 : 0.92;
  const ancho = 100 / datos.length;
  const cero = (1 - arriba) * 100;
  const iSep = separarAntesDe ? datos.findIndex((d) => d.clave === separarAntesDe) : -1;
  return (
    <figure className="barras" aria-label={etiqueta}>
      <div className="barras__trazado" style={{ height: alto }} onMouseLeave={() => setActiva(null)}>
        <div className="barras__cero" style={{ top: `${cero}%` }} />
        {iSep > 0 && <div className="barras__separador" style={{ left: `${iSep * ancho}%` }} aria-hidden="true" />}
        {datos.map((d, i) => {
          const h = (Math.abs(d.valor) / max) * (tienenNeg && tienenPos ? 50 : 92);
          return (
            <button
              key={d.clave}
              type="button"
              className="barras__zona"
              style={{ left: `${i * ancho}%`, width: `${ancho}%` }}
              onMouseEnter={() => setActiva(i)}
              onFocus={() => setActiva(i)}
              onBlur={() => setActiva(null)}
              aria-label={`${d.clave}: ${formato(d.valor)}. ${d.detalle}`}
            >
              <span
                className={`barras__barra barras__barra--${d.valor >= 0 ? 'pos' : 'neg'}${d.atenuada ? ' es-atenuada' : ''}${activa === i ? ' es-activa' : ''}`}
                style={d.valor >= 0 ? { bottom: `${100 - cero}%`, height: `${h}%` } : { top: `${cero}%`, height: `${h}%` }}
              />
            </button>
          );
        })}
        {activa !== null && (
          <div className="barras__globo" style={{ left: `${Math.min(80, Math.max(8, (activa + 0.5) * ancho))}%` }} role="status">
            <strong>{datos[activa].clave}</strong> {formato(datos[activa].valor)}
            <span>{datos[activa].detalle}</span>
          </div>
        )}
      </div>
      <div className="barras__ejes" aria-hidden="true">
        {datos.map((d, i) => (
          <span key={d.clave} style={{ width: `${ancho}%` }}>
            {datos.length > 12 && i % 2 ? '' : d.clave.slice(-2) === d.clave ? d.clave : `’${d.clave.slice(-2)}`}
          </span>
        ))}
      </div>
    </figure>
  );
}
