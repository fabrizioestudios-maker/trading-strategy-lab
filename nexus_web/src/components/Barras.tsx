/** Barras con signo desde una línea de cero (R por año). El valor también está en la tabla de al lado: no solo color. */
import { useState } from 'react';
import { conSigno } from '../lib/formato';

export interface Barra {
  clave: string;
  valor: number;
  detalle: string;
  atenuada?: boolean;
}

/**
 * Dónde va la línea de cero (en % desde arriba) y la altura máxima de una barra (en %), según los signos de los valores:
 * con signos mezclados el cero va al medio; solo positivos, abajo; solo negativos, arriba. Las barras nunca se salen.
 */
export function geometriaBarras(valores: number[]): { cero: number; alturaMax: number } {
  const neg = valores.some((v) => v < 0);
  const pos = valores.some((v) => v > 0);
  if (neg && pos) return { cero: 50, alturaMax: 46 };
  if (neg) return { cero: 4, alturaMax: 92 };
  return { cero: 96, alturaMax: 92 };
}

export function Barras({
  datos,
  alto = 180,
  etiqueta,
  separarAntesDe,
  formato = (v: number) => conSigno(v, 2, 'R'),
  magnitud = false,
}: {
  datos: Barra[];
  alto?: number;
  etiqueta: string;
  separarAntesDe?: string;
  formato?: (v: number) => string;
  /** Una magnitud (no un resultado con signo): barras en el color de acento */
  magnitud?: boolean;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  if (!datos.length) return null;
  const max = Math.max(...datos.map((d) => Math.abs(d.valor)), 1e-9);
  const { cero, alturaMax } = geometriaBarras(datos.map((d) => d.valor));
  const ancho = 100 / datos.length;
  const iSep = separarAntesDe ? datos.findIndex((d) => d.clave === separarAntesDe) : -1;
  return (
    <figure className="barras" aria-label={etiqueta}>
      <div className="barras__trazado" style={{ height: alto }} onMouseLeave={() => setActiva(null)}>
        <div className="barras__cero" style={{ top: `${cero}%` }} />
        {iSep > 0 && <div className="barras__separador" style={{ left: `${iSep * ancho}%` }} aria-hidden="true" />}
        {datos.map((d, i) => {
          const h = (Math.abs(d.valor) / max) * alturaMax;
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
                className={`barras__barra barras__barra--${magnitud ? 'acento' : d.valor >= 0 ? 'pos' : 'neg'}${d.atenuada ? ' es-atenuada' : ''}${activa === i ? ' es-activa' : ''}`}
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
