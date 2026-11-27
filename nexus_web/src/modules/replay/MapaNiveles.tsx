/**
 * Mapa de niveles: ocupa el lugar del libro de órdenes de la referencia. No hay datos de profundidad (las velas son
 * bid de 1 minuto), así que en vez de inventar un libro se listan los precios que sí se conocen en el límite:
 * niveles del día y la semana anteriores, la sesión diaria, FVG sin mitigar y las órdenes simuladas vivas.
 * Arriba del precio, en rojo; abajo, en dorado; en el medio, el último precio revelado.
 */
import type { CapasReplay, CuadroReplay, EstadoOrdenSimulada } from '../../api/contrato.gen';
import type { OrdenGuardada } from '../../app/espacio';
import { Info } from '../../components/ui';
import { conSigno, porcentaje, precio, tono } from '../../lib/formato';

interface Fila {
  precio: number;
  nombre: string;
  tipo: 'nivel' | 'sesion' | 'fvg' | 'orden' | 'rango';
}

export function MapaNiveles({
  cuadro,
  capas,
  ordenes,
  estados,
  dec,
  mostrarFvg,
  mostrarRango = false,
}: {
  cuadro: CuadroReplay;
  capas: CapasReplay | null;
  ordenes: OrdenGuardada[];
  estados: EstadoOrdenSimulada[];
  dec: number;
  mostrarFvg: boolean;
  mostrarRango?: boolean;
}) {
  const ultimo = cuadro.velas[cuadro.velas.length - 1]?.c ?? 0;
  const corto: Record<string, string> = { pdh: 'Máx. día anterior', pdl: 'Mín. día anterior', pwh: 'Máx. semana anterior', pwl: 'Mín. semana anterior' };
  const filas: Fila[] = cuadro.niveles.map((n) => ({ precio: n.precio, nombre: `${n.clave.toUpperCase()} ${corto[n.clave] ?? n.nombre}`, tipo: 'nivel' }));
  const d = cuadro.sesion_dia;
  if (d) {
    filas.push({ precio: d.maximo, nombre: 'Máx. de la sesión', tipo: 'sesion' });
    filas.push({ precio: d.minimo, nombre: 'Mín. de la sesión', tipo: 'sesion' });
    filas.push({ precio: d.apertura, nombre: 'Apertura sesión', tipo: 'sesion' });
  }
  if (mostrarFvg && capas)
    for (const z of capas.fvg.filter((x) => x.mitigada_ms === null).slice(-3)) {
      filas.push({ precio: z.arriba, nombre: `FVG ${z.lado} (techo)`, tipo: 'fvg' });
      filas.push({ precio: z.abajo, nombre: `FVG ${z.lado} (piso)`, tipo: 'fvg' });
    }
  const rg = capas?.rango;
  if (mostrarRango && rg) {
    filas.push({ precio: rg.equilibrio, nombre: 'EQ 50 % del tramo', tipo: 'rango' });
    if (rg.ote_abajo !== null && rg.ote_arriba !== null) {
      filas.push({ precio: rg.ote_arriba, nombre: `OTE ${rg.sentido === 'alcista' ? '62' : '79'} %`, tipo: 'rango' });
      filas.push({ precio: rg.ote_abajo, nombre: `OTE ${rg.sentido === 'alcista' ? '79' : '62'} %`, tipo: 'rango' });
    }
  }
  const vivos = new Set(estados.filter((e) => e.estado === 'abierta' || e.estado === 'esperando_llenado').map((e) => e.id));
  for (const o of ordenes.filter((x) => vivos.has(x.id))) {
    const quien = o.lado === 'compra' ? 'compra' : 'venta';
    if (o.tipo === 'limite' && o.entrada) filas.push({ precio: o.entrada, nombre: `Entrada límite (${quien})`, tipo: 'orden' });
    filas.push({ precio: o.sl, nombre: `SL de la ${quien}`, tipo: 'orden' });
    filas.push({ precio: o.tp, nombre: `TP de la ${quien}`, tipo: 'orden' });
  }
  const arriba = filas.filter((f) => f.precio > ultimo).sort((a, b) => b.precio - a.precio).slice(-7);
  const abajo = filas.filter((f) => f.precio <= ultimo).sort((a, b) => b.precio - a.precio).slice(0, 7);
  const t = tono(d?.cambio);
  const fila = (f: Fila, lado: 'arriba' | 'abajo', i: number) => (
    <tr key={`${lado}-${i}-${f.precio}`} className={`mapa__fila mapa__fila--${lado} mapa__fila--${f.tipo}`}>
      <td className="num">{precio(f.precio, dec)}</td>
      <td className="mapa__nombre" title={f.nombre}>
        {f.nombre}
      </td>
      <td className="num der">{porcentaje(((f.precio - ultimo) / ultimo) * 100, 2)}</td>
    </tr>
  );
  return (
    <section className="mapa" aria-labelledby="mapa-titulo">
      <header className="mapa__cabeza">
        <h2 id="mapa-titulo">Mapa de niveles</h2>
        <Info
          etiqueta="Por qué no hay libro de órdenes"
          texto="Los datos son velas bid de 1 minuto: no hay profundidad de mercado. En su lugar, NEXUS muestra los precios conocidos en el límite. Un nivel dibujado no es evidencia de ventaja (E035b)."
        />
      </header>
      <table className="mapa__tabla">
        <thead>
          <tr>
            <th>Precio</th>
            <th>Nivel</th>
            <th className="der">Distancia</th>
          </tr>
        </thead>
        <tbody>
          {arriba.length === 0 ? (
            <tr>
              <td colSpan={3} className="tenue">
                Sin niveles conocidos arriba
              </td>
            </tr>
          ) : (
            arriba.map((f, i) => fila(f, 'arriba', i))
          )}
          <tr className="mapa__precio">
            <td colSpan={3}>
              <strong className={`num tono-${t === 'pos' ? 'alza' : t === 'neg' ? 'baja' : 'neutro'}`}>
                {precio(ultimo, dec)} {t === 'pos' ? '▲' : t === 'neg' ? '▼' : ''}
              </strong>
              {d?.cambio !== null && d?.cambio !== undefined && (
                <span className="num tenue">
                  {conSigno(d.cambio, dec)} ({conSigno(d.cambio_pct, 2)} %)
                </span>
              )}
            </td>
          </tr>
          {abajo.length === 0 ? (
            <tr>
              <td colSpan={3} className="tenue">
                Sin niveles conocidos abajo
              </td>
            </tr>
          ) : (
            abajo.map((f, i) => fila(f, 'abajo', i))
          )}
        </tbody>
      </table>
    </section>
  );
}
