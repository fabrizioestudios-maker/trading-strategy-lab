import type { CuentaSimulada } from '../../api/contrato.gen';
import { Info } from '../../components/ui';
import { conSigno, numero, porcentaje, tono } from '../../lib/formato';

/** Barra de la cuenta simulada (lo que en la referencia es el balance de la cuenta). La calcula la API. */
export function BarraCuenta({ cuenta }: { cuenta: CuentaSimulada | null }) {
  const usd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${numero(v, 2)} USD`);
  const resultado = cuenta ? cuenta.realizado + cuenta.abierto : null;
  const datos: [string, string, string?][] = [
    ['Capital', usd(cuenta?.capital)],
    ['Equidad', usd(cuenta?.equidad)],
    [`Margen (1:${numero(cuenta?.apalancamiento ?? 50, 0)})`, usd(cuenta?.margen)],
    ['Margen libre', usd(cuenta?.margen_libre)],
    ['Nivel de margen', cuenta?.nivel_margen_pct ? porcentaje(cuenta.nivel_margen_pct, 2) : '—'],
    ['Resultado', resultado === null ? '—' : conSigno(resultado, 2, 'USD'), `tono-${tono(resultado)}`],
  ];
  return (
    <section className="cuenta" aria-label="Cuenta simulada">
      <div className="cuenta__titulo">
        <span>Cuenta simulada</span>
        {cuenta && <Info etiqueta="Supuestos de la cuenta simulada" texto={cuenta.supuestos.join(' ')} />}
      </div>
      {datos.map(([k, v, c]) => (
        <div key={k} className="cuenta__dato">
          <span>{k}</span>
          <strong className={`num ${c ?? ''}`}>{v}</strong>
        </div>
      ))}
      {cuenta && (
        <div className="cuenta__dato ocultar-ancho-medio">
          <span>Posiciones</span>
          <strong className="num">
            {cuenta.abiertas} abiertas, {cuenta.cerradas} cerradas
          </strong>
        </div>
      )}
    </section>
  );
}
