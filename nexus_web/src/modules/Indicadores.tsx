import { useMemo } from 'react';
import { useEspacio, type Preferencias } from '../app/espacio';
import { useRuta } from '../app/ruta';
import { useCatalogo } from '../components/Indicadores';
import { Icono } from '../components/iconos';
import { Boton, Cargando, ErrorEstado, Insignia, Panel } from '../components/ui';
import { MAX_INDICADORES, nuevaInstancia } from '../lib/indicadores';

type Capa = keyof Preferencias['capas'];

const CAPAS: { capa: Capa; nombre: string; que: string }[] = [
  { capa: 'sesiones', nombre: 'Sesiones de Nueva York', que: 'Asia, Londres, Nueva York, cierre y reapertura (con horario de verano), como franja debajo del gráfico.' },
  { capa: 'niveles', nombre: 'Día y semana anteriores', que: 'PDH, PDL, PWH y PWL tomados solo de velas cerradas antes del límite.' },
  { capa: 'senales', nombre: 'Señales de E022', que: 'Las entradas de la estrategia candidata del laboratorio (solo XAUUSD).' },
  { capa: 'ordenes', nombre: 'Órdenes simuladas', que: 'Entrada, stop y objetivo de tus órdenes del replay.' },
];

export default function Indicadores() {
  const { estado, despachar } = useEspacio();
  const { ir } = useRuta();
  const cat = useCatalogo();
  const prefs = estado.prefs;
  const porCategoria = useMemo(() => {
    const m = new Map<string, NonNullable<typeof cat.datos>>();
    for (const d of cat.datos ?? []) m.set(d.categoria, [...(m.get(d.categoria) ?? []), d]);
    return [...m];
  }, [cat.datos]);
  const agregar = (id: string) => {
    if (prefs.indicadores.length >= MAX_INDICADORES) return;
    despachar({ tipo: 'prefs', prefs: { indicadores: [...prefs.indicadores, nuevaInstancia(id, prefs.indicadores)] } });
    ir('replay');
  };
  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Indicadores</h1>
          <p>
            La biblioteca del gráfico. Cada indicador se calcula en el servidor solo con velas cerradas hasta el límite del replay, y se agrega, configura,
            oculta o quita desde el gráfico (botón «Indicadores» o la tecla /).
          </p>
        </div>
        <div className="pagina__acciones">
          <a className="boton" href="#/replay">
            <Icono nombre="replay" />
            Ir al gráfico
          </a>
        </div>
      </header>
      <p className="nota nota--aviso">
        <Icono nombre="alerta" />
        <span>
          Un indicador describe el precio; no prueba que haya ventaja. En el laboratorio ninguna regla sobrevivió a las correcciones por pruebas múltiples (E031)
          y los modelos SMC/ICT rindieron como el azar después de costos (E038). Para probar una idea con rigor está el Laboratorio.
        </span>
      </p>
      {cat.error ? <ErrorEstado error={cat.error} reintentar={cat.recargar} /> : null}
      {!cat.datos && !cat.error && <Cargando />}
      {porCategoria.map(([categoria, defs]) => (
        <Panel key={categoria} titulo={categoria} className="separado" sinRelleno>
          <ul className="lista herramientas">
            {defs.map((d) => {
              const n = prefs.indicadores.filter((x) => x.id === d.id).length;
              return (
                <li key={d.id} className="herramienta">
                  <div className="herramienta__cabeza">
                    <strong>{d.nombre}</strong>
                    <Insignia>{d.corto}</Insignia>
                    {d.superpuesto ? <Insignia>sobre el precio</Insignia> : <Insignia>panel propio</Insignia>}
                    {n > 0 && (
                      <Insignia tono="activo" icono="check">
                        {n} en el gráfico
                      </Insignia>
                    )}
                  </div>
                  <p className="herramienta__que">{d.descripcion}</p>
                  <p className="campo__ayuda">
                    Autor: {d.autor}
                    {d.licencia ? ` · ${d.licencia}` : ''}
                    {d.fuente && (
                      <>
                        {' · '}
                        <a href={d.fuente} target="_blank" rel="noreferrer">
                          original
                        </a>
                      </>
                    )}
                  </p>
                  <div className="herramienta__control">
                    <Boton chico icono="mas" onClick={() => agregar(d.id)} disabled={prefs.indicadores.length >= MAX_INDICADORES}>
                      Agregar al gráfico
                    </Boton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
      <Panel titulo="Capas del gráfico" subtitulo="Información propia del replay, no indicadores" className="separado" sinRelleno>
        <ul className="lista herramientas">
          {CAPAS.map((x) => (
            <li key={x.capa} className="herramienta">
              <div className="herramienta__cabeza">
                <strong>{x.nombre}</strong>
              </div>
              <p className="herramienta__que">{x.que}</p>
              <div className="herramienta__control">
                <label className="casilla">
                  <input type="checkbox" checked={prefs.capas[x.capa]} onChange={(e) => despachar({ tipo: 'prefs', prefs: { capas: { ...prefs.capas, [x.capa]: e.target.checked } } })} />
                  Mostrar en el replay
                </label>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
