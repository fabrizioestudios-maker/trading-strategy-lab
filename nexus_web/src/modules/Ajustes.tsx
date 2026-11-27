import { useEffect, useRef, useState } from 'react';
import { useAvisos } from '../app/avisos';
import { useComandos } from '../app/comandos';
import { ESTADO_INICIAL, PREFS_INICIALES, espaciosGuardados, guardarEspacios, sanear, useEspacio, type EspacioGuardado, type Preferencias } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { Icono } from '../components/iconos';
import { Boton, Campo, Cargando, Panel, Segmentado, Tecla } from '../components/ui';
import { fechaHora } from '../lib/formato';

const SECCIONES = [
  ['espacios', 'Espacios de trabajo'],
  ['grafico', 'Gráfico y hora'],
  ['riesgo', 'Riesgo predeterminado'],
  ['sesiones', 'Sesiones'],
  ['apariencia', 'Apariencia y accesibilidad'],
  ['atajos', 'Atajos de teclado'],
  ['integraciones', 'Integraciones y secretos'],
  ['acerca', 'Acerca de'],
] as const;

export default function Ajustes({ params }: { params: Record<string, string> }) {
  const { estado, despachar } = useEspacio();
  const { avisar } = useAvisos();
  const { salud, referencias } = useGlobales();
  const { comandos } = useComandos();
  const prefs = estado.prefs;
  const fijar = (p: Partial<Preferencias>) => despachar({ tipo: 'prefs', prefs: p });
  const [lista, setLista] = useState<EspacioGuardado[]>(() => espaciosGuardados());
  const [nombre, setNombre] = useState('');
  const archivo = useRef<HTMLInputElement>(null);
  const [capital, setCapital] = useState(String(prefs.capital));
  const [riesgo, setRiesgo] = useState(String(prefs.riesgoPct));
  const [lote, setLote] = useState(String(prefs.pasoLote));
  const [apal, setApal] = useState(String(prefs.apalancamiento));

  useEffect(() => {
    if (params.seccion) document.getElementById(`ajustes-${params.seccion}`)?.scrollIntoView({ block: 'start' });
  }, [params.seccion]);

  const persistir = (l: EspacioGuardado[]) => {
    setLista(l);
    if (!guardarEspacios(l)) avisar({ texto: 'El navegador no permite guardar datos locales.', tono: 'error' });
  };
  const guardarActual = () => {
    const n = nombre.trim().slice(0, 60);
    if (!n) return;
    persistir([{ nombre: n, guardado_ms: Date.now(), estado: { ...estado, nombre: n } }, ...lista.filter((x) => x.nombre !== n)]);
    despachar({ tipo: 'nombre', nombre: n });
    setNombre('');
    avisar({ texto: `Espacio «${n}» guardado.` });
  };
  const descargar = (datos: unknown, archivoNombre: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = archivoNombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importar = async (f: File) => {
    try {
      const datos = JSON.parse(await f.text());
      const entradas: unknown[] = Array.isArray(datos) ? datos : [datos];
      const nuevos: EspacioGuardado[] = entradas.map((x, i) => {
        const e = x as Partial<EspacioGuardado> & { prefs?: unknown };
        const est = sanear(e.estado ?? x);
        const n = (typeof e.nombre === 'string' && e.nombre.trim()) || est.nombre || `Importado ${i + 1}`;
        return { nombre: n.slice(0, 60), guardado_ms: Date.now(), estado: { ...est, nombre: n.slice(0, 60) } };
      });
      persistir([...nuevos, ...lista.filter((x) => !nuevos.some((n) => n.nombre === x.nombre))]);
      avisar({ texto: `Se importaron ${nuevos.length} espacios. Revisalos antes de cargarlos.` });
    } catch {
      avisar({ texto: 'El archivo no es un espacio de NEXUS válido (JSON).', tono: 'error' });
    }
  };
  const restablecer = () => {
    const antes = prefs;
    fijar(PREFS_INICIALES);
    setCapital(String(PREFS_INICIALES.capital));
    setRiesgo(String(PREFS_INICIALES.riesgoPct));
    setLote(String(PREFS_INICIALES.pasoLote));
    setApal(String(PREFS_INICIALES.apalancamiento));
    avisar({ texto: 'Preferencias restablecidas.', deshacer: () => fijar(antes) });
  };
  const n = (s: string) => Number(s.replace(',', '.'));
  const riesgoValido = n(capital) > 0 && n(riesgo) > 0 && n(riesgo) <= 10 && n(lote) > 0 && n(apal) >= 1 && n(apal) <= 1000;
  const atajos = comandos.filter((c) => c.atajo);

  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Ajustes</h1>
          <p>Todo se guarda en este navegador. NEXUS no guarda claves ni contraseñas en el navegador.</p>
        </div>
        <div className="pagina__acciones">
          <Boton icono="reiniciar" onClick={restablecer}>
            Restablecer preferencias
          </Boton>
        </div>
      </header>
      <div className="ajustes">
        <nav className="ajustes__indice" aria-label="Secciones de ajustes">
          {SECCIONES.map(([id, t]) => (
            <a key={id} href={`#/ajustes?seccion=${id}`} aria-current={params.seccion === id ? 'true' : undefined}>
              {t}
            </a>
          ))}
        </nav>
        <div className="apilado">
          <section id="ajustes-espacios">
            <Panel titulo="Espacios de trabajo" subtitulo={`Activo: ${estado.nombre}. Guardan instrumento, temporalidad, límite del replay, órdenes, capas y preferencias.`}>
              <form
                className="fila"
                onSubmit={(e) => {
                  e.preventDefault();
                  guardarActual();
                }}
              >
                <input className="entrada" style={{ maxWidth: 280 }} placeholder="Nombre del espacio" aria-label="Nombre del espacio" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
                <Boton type="submit" variante="primario" disabled={!nombre.trim()}>
                  Guardar el espacio actual
                </Boton>
                <Boton icono="descargar" onClick={() => descargar(lista, 'nexus-espacios.json')} disabled={!lista.length}>
                  Exportar todos
                </Boton>
                <Boton icono="subir" onClick={() => archivo.current?.click()}>
                  Importar
                </Boton>
                <input
                  ref={archivo}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importar(f);
                    e.target.value = '';
                  }}
                />
              </form>
              {lista.length === 0 ? (
                <p className="tenue separado">No hay espacios guardados todavía.</p>
              ) : (
                <ul className="lista separado">
                  {lista.map((g) => (
                    <li key={g.nombre} className="fila-actividad">
                      <span>
                        <strong>{g.nombre}</strong>
                        <span className="tenue">
                          {' '}
                          {g.estado.simbolo}, guardado {fechaHora(g.guardado_ms, prefs.zona)}
                        </span>
                      </span>
                      <span className="fila">
                        <Boton
                          chico
                          onClick={() => {
                            const antes = estado;
                            despachar({ tipo: 'cargar', estado: g.estado });
                            avisar({ texto: `Espacio «${g.nombre}» cargado.`, deshacer: () => despachar({ tipo: 'cargar', estado: antes }) });
                          }}
                        >
                          Cargar
                        </Boton>
                        <Boton chico icono="descargar" onClick={() => descargar(g, `nexus-${g.nombre.replace(/[^\w-]+/g, '_')}.json`)}>
                          Exportar
                        </Boton>
                        <Boton
                          chico
                          variante="peligro"
                          icono="papelera"
                          onClick={() => {
                            const antes = lista;
                            persistir(lista.filter((x) => x.nombre !== g.nombre));
                            avisar({ texto: `Espacio «${g.nombre}» borrado.`, deshacer: () => persistir(antes) });
                          }}
                        >
                          Borrar
                        </Boton>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="campo__ayuda separado">
                <Boton
                  chico
                  variante="texto"
                  onClick={() => {
                    const antes = estado;
                    despachar({ tipo: 'cargar', estado: ESTADO_INICIAL });
                    avisar({ texto: 'Se empezó un espacio nuevo (sin órdenes ni límites guardados).', deshacer: () => despachar({ tipo: 'cargar', estado: antes }) });
                  }}
                >
                  Empezar un espacio vacío
                </Boton>
              </p>
            </Panel>
          </section>

          <section id="ajustes-grafico">
            <Panel titulo="Gráfico y hora">
              <div className="formulario">
                <Campo etiqueta="Hora que se muestra" ayuda="Las sesiones siempre se calculan en hora de Nueva York.">
                  {() => (
                    <Segmentado
                      etiqueta="Hora que se muestra"
                      valor={prefs.zona}
                      onCambio={(zona) => fijar({ zona })}
                      opciones={[
                        { valor: 'ny', etiqueta: 'Nueva York' },
                        { valor: 'utc', etiqueta: 'UTC' },
                      ]}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Velas por cuadro del replay" ayuda="Entre 100 y 800. Más velas, más contexto y respuestas un poco más lentas.">
                  {(id, d) => (
                    <input
                      id={id}
                      aria-describedby={d}
                      type="number"
                      min={100}
                      max={800}
                      step={50}
                      className="entrada"
                      value={prefs.velasPorCuadro}
                      onChange={(e) => fijar({ velasPorCuadro: Math.min(800, Math.max(100, Number(e.target.value) || 300)) })}
                    />
                  )}
                </Campo>
              </div>
            </Panel>
          </section>

          <section id="ajustes-riesgo">
            <Panel titulo="Riesgo predeterminado" subtitulo="Lo usan el ticket de órdenes del replay y la calculadora de ejecución">
              <form
                className="apilado"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!riesgoValido) return;
                  fijar({ capital: n(capital), riesgoPct: n(riesgo), pasoLote: n(lote), apalancamiento: n(apal) });
                  avisar({ texto: 'Riesgo predeterminado guardado.' });
                }}
              >
                <div className="formulario">
                  <Campo etiqueta="Capital (USD)">{(id) => <input id={id} className="entrada" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />}</Campo>
                  <Campo etiqueta="Riesgo por operación (%)" ayuda="Entre 0 y 10 %" error={n(riesgo) > 10 ? 'Máximo 10 %' : null}>
                    {(id, d) => <input id={id} aria-describedby={d} className="entrada" inputMode="decimal" value={riesgo} onChange={(e) => setRiesgo(e.target.value)} />}
                  </Campo>
                  <Campo etiqueta="Paso de lote">{(id) => <input id={id} className="entrada" inputMode="decimal" value={lote} onChange={(e) => setLote(e.target.value)} />}</Campo>
                  <Campo etiqueta="Apalancamiento supuesto (1:N)" ayuda="Solo para el margen de la cuenta simulada. FTMO usa 1:50 en metales.">
                    {(id, d) => <input id={id} aria-describedby={d} className="entrada" inputMode="numeric" value={apal} onChange={(e) => setApal(e.target.value)} />}
                  </Campo>
                </div>
                <div>
                  <Boton type="submit" disabled={!riesgoValido}>
                    Guardar riesgo
                  </Boton>
                </div>
              </form>
            </Panel>
          </section>

          <section id="ajustes-sesiones">
            <Panel titulo="Sesiones" subtitulo="Definidas en nexus_api/sesiones.py">
              {referencias.datos ? (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Sesión</th>
                      <th>Desde</th>
                      <th>Hasta</th>
                      <th>Días</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referencias.datos.sesiones.map((s) => (
                      <tr key={s.nombre}>
                        <td>{s.nombre}</td>
                        <td className="num">{s.desde_ny} NY</td>
                        <td className="num">{s.hasta_ny} NY</td>
                        <td>{s.dias}</td>
                        <td className="envuelve secundario">{s.nota ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Cargando />
              )}
              <p className="campo__ayuda separado">
                Se cambian en el código con sus pruebas, no desde acá: una sesión distinta cambia los resultados de la investigación y tiene que quedar registrada.
              </p>
            </Panel>
          </section>

          <section id="ajustes-apariencia">
            <Panel titulo="Apariencia y accesibilidad">
              <div className="formulario formulario--ancho">
                <Campo etiqueta="Densidad">
                  {() => (
                    <Segmentado
                      etiqueta="Densidad"
                      valor={prefs.densidad}
                      onCambio={(densidad) => fijar({ densidad })}
                      opciones={[
                        { valor: 'compacta', etiqueta: 'Compacta' },
                        { valor: 'comoda', etiqueta: 'Cómoda' },
                      ]}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Tamaño del texto">
                  {() => (
                    <Segmentado
                      etiqueta="Tamaño del texto"
                      valor={prefs.texto}
                      onCambio={(texto) => fijar({ texto })}
                      opciones={[
                        { valor: '100', etiqueta: 'Normal' },
                        { valor: '112', etiqueta: 'Grande' },
                      ]}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Contraste">
                  {() => (
                    <Segmentado
                      etiqueta="Contraste"
                      valor={prefs.contraste}
                      onCambio={(contraste) => fijar({ contraste })}
                      opciones={[
                        { valor: 'normal', etiqueta: 'Normal' },
                        { valor: 'alto', etiqueta: 'Alto' },
                      ]}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Animaciones" ayuda="«Sistema» respeta la preferencia de movimiento reducido del sistema operativo.">
                  {() => (
                    <Segmentado
                      etiqueta="Animaciones"
                      valor={prefs.movimiento}
                      onCambio={(movimiento) => fijar({ movimiento })}
                      opciones={[
                        { valor: 'sistema', etiqueta: 'Sistema' },
                        { valor: 'reducido', etiqueta: 'Reducidas' },
                      ]}
                    />
                  )}
                </Campo>
              </div>
            </Panel>
          </section>

          <section id="ajustes-atajos">
            <Panel titulo="Atajos de teclado" subtitulo="Los del módulo abierto aparecen cuando el módulo está abierto; la paleta (Ctrl K) tiene todas las acciones">
              <dl className="definiciones atajos-lista">
                <dt>
                  <Tecla>Ctrl</Tecla> <Tecla>K</Tecla>
                </dt>
                <dd>Paleta de comandos</dd>
                {atajos.map((c) => (
                  <div key={c.id} style={{ display: 'contents' }}>
                    <dt>
                      {c.atajo!.split(' ').map((t, k) =>
                        t === 'luego' ? (
                          <span key={k} className="tenue">
                            {' '}
                            luego{' '}
                          </span>
                        ) : (
                          <Tecla key={k}>{t}</Tecla>
                        ),
                      )}
                    </dt>
                    <dd>{c.titulo}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </section>

          <section id="ajustes-integraciones">
            <Panel titulo="Integraciones y secretos">
              <ul className="lista planificado">
                <li>
                  <span className="insignia insignia--aviso">No implementado</span>
                  <span>
                    <strong>Bróker</strong>NEXUS no envía órdenes. Una integración necesita autorización explícita, pruebas y separación clara de la simulación.
                  </span>
                </li>
                <li>
                  <span className="insignia insignia--aviso">No implementado</span>
                  <span>
                    <strong>Feed en vivo</strong>los datos son históricos; ninguna pantalla muestra precios de hoy.
                  </span>
                </li>
                <li>
                  <span className="insignia">Política</span>
                  <span>
                    <strong>Secretos</strong>no se guardan claves en el navegador ni en el espacio de trabajo. Cuando haya integraciones, las credenciales van en variables
                    de entorno del servidor de la API.
                  </span>
                </li>
              </ul>
            </Panel>
          </section>

          <section id="ajustes-acerca">
            <Panel titulo="Acerca de">
              <dl className="definiciones">
                <dt>API</dt>
                <dd>{salud.datos ? `${salud.datos.version}, contrato ${salud.datos.contrato}` : 'sin conexión'}</dd>
                <dt>Pruebas</dt>
                <dd>
                  <code>{salud.datos?.pruebas ?? 'pytest -q tests'}</code> y <code>npm test</code> en nexus_web
                </dd>
                <dt>Gráficos</dt>
                <dd>
                  TradingView Lightweight Charts (Apache 2.0),{' '}
                  <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
                    tradingview.com
                  </a>
                </dd>
                <dt>Tipografía</dt>
                <dd>IBM Plex Sans (SIL Open Font License)</dd>
              </dl>
              <p className="nota separado">
                <Icono nombre="info" />
                <span>La sofisticación debe estar en las capacidades. La sencillez debe estar en la experiencia.</span>
              </p>
            </Panel>
          </section>
        </div>
      </div>
    </div>
  );
}
