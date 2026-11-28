/** Lista de seguimiento: todos los instrumentos con su último cierre diario y el cambio; un clic cambia el gráfico. */
import { useFichas } from '../../api/fichas';
import { useEspacio } from '../../app/espacio';
import { useGlobales } from '../../app/globales';
import { conSigno, precio, tono } from '../../lib/formato';

export function ListaSeguimiento() {
  const { instrumentos } = useGlobales();
  const { estado, despachar } = useEspacio();
  const disponibles = (instrumentos.datos ?? []).filter((i) => i.disponible);
  const fichas = useFichas(disponibles.map((i) => i.simbolo));
  return (
    <section className="lista-seg" aria-label="Lista de seguimiento">
      <table className="tabla tabla--compacta">
        <thead>
          <tr>
            <th scope="col">Símbolo</th>
            <th scope="col" className="der">
              Último
            </th>
            <th scope="col" className="der">
              Cambio
            </th>
          </tr>
        </thead>
        <tbody>
          {disponibles.map((i) => {
            const f = fichas[i.simbolo];
            const ok = f && !(f instanceof Error) ? f : null;
            return (
              <tr key={i.simbolo} className={i.simbolo === estado.simbolo ? 'es-activo' : ''}>
                <td>
                  <button type="button" className="enlace lista-seg__sim" onClick={() => despachar({ tipo: 'simbolo', simbolo: i.simbolo })} aria-current={i.simbolo === estado.simbolo || undefined}>
                    <strong>{i.simbolo}</strong>
                    <span className="tenue">{i.nombre}</span>
                  </button>
                </td>
                <td className="num der">{ok ? precio(ok.ultimo, i.decimales) : '…'}</td>
                <td className={`num der tono-${tono(ok?.cambio_pct)}`}>{conSigno(ok?.cambio_pct, 2, '%')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="campo__ayuda">Cierres diarios históricos (17:00 Nueva York); no hay precios en vivo.</p>
    </section>
  );
}
