import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import type { CalculoRiesgo } from '../api/contrato.gen';
import { useAvisos } from '../app/avisos';
import { useEspacio } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { Icono } from '../components/iconos';
import { Boton, Campo, Cargando, ErrorEstado, Insignia, Panel } from '../components/ui';
import { numero, precio } from '../lib/formato';

export default function Ejecucion() {
  const { estado, despachar } = useEspacio();
  const { instrumentos, referencias } = useGlobales();
  const { avisar } = useAvisos();
  const disponibles = (instrumentos.datos ?? []).filter((i) => i.disponible);
  const [simbolo, setSimbolo] = useState(estado.simbolo);
  const [capital, setCapital] = useState(String(estado.prefs.capital));
  const [riesgoPct, setRiesgoPct] = useState(String(estado.prefs.riesgoPct));
  const [pasoLote, setPasoLote] = useState(String(estado.prefs.pasoLote));
  const [entrada, setEntrada] = useState('');
  const [stop, setStop] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [calculo, setCalculo] = useState<CalculoRiesgo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const instr = disponibles.find((i) => i.simbolo === simbolo);
  const n = (s: string) => Number(s.replace(',', '.'));
  const vacio = !entrada || !stop;

  useEffect(() => {
    if (vacio) {
      setCalculo(null);
      setError(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api
        .riesgo({ simbolo, capital: n(capital), riesgo_pct: n(riesgoPct), entrada: n(entrada), stop: n(stop), objetivo: objetivo ? n(objetivo) : null, paso_lote: n(pasoLote) }, ctl.signal)
        .then((c) => {
          setCalculo(c);
          setError(null);
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          setCalculo(null);
          setError(e instanceof Error ? e.message : 'No se pudo calcular');
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simbolo, capital, riesgoPct, pasoLote, entrada, stop, objetivo]);

  const ordenes = estado.replay.ordenes.filter((o) => o.simbolo === estado.simbolo);
  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Ejecución</h1>
          <p>Tamaño de posición, costos y órdenes simuladas. Los cálculos los hace la API con los costos de docs/costos.md.</p>
        </div>
      </header>
      <p className="nota nota--sim banda-simulacion">
        <Icono nombre="info" />
        <span>
          <strong>Simulación.</strong> NEXUS no está conectado a ningún bróker y no envía órdenes. Lo que se calcula o se crea acá no es una operación real.
        </span>
      </p>
      <div className="grilla grilla--principal separado">
        <Panel titulo="Calculadora de riesgo" subtitulo="Lotes redondeados hacia abajo: el riesgo real nunca supera el pedido">
          <form className="apilado" onSubmit={(e) => e.preventDefault()}>
            <div className="formulario">
              <Campo etiqueta="Instrumento">
                {(id) => (
                  <select id={id} className="selector" value={simbolo} onChange={(e) => setSimbolo(e.target.value)}>
                    {disponibles.map((i) => (
                      <option key={i.simbolo} value={i.simbolo}>
                        {i.simbolo}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Capital (USD)">{(id) => <input id={id} className="entrada" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />}</Campo>
              <Campo etiqueta="Riesgo por operación (%)" ayuda="Máximo 10 %">
                {(id, d) => <input id={id} aria-describedby={d} className="entrada" inputMode="decimal" value={riesgoPct} onChange={(e) => setRiesgoPct(e.target.value)} />}
              </Campo>
              <Campo etiqueta="Paso de lote">{(id) => <input id={id} className="entrada" inputMode="decimal" value={pasoLote} onChange={(e) => setPasoLote(e.target.value)} />}</Campo>
            </div>
            <div className="formulario">
              <Campo etiqueta="Entrada">{(id) => <input id={id} className="entrada" inputMode="decimal" placeholder="Precio" value={entrada} onChange={(e) => setEntrada(e.target.value)} />}</Campo>
              <Campo etiqueta="Stop">{(id) => <input id={id} className="entrada" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />}</Campo>
              <Campo etiqueta="Objetivo (opcional)">{(id) => <input id={id} className="entrada" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />}</Campo>
            </div>
            <div className="fila">
              <Boton
                chico
                onClick={() => {
                  despachar({ tipo: 'prefs', prefs: { capital: n(capital), riesgoPct: n(riesgoPct), pasoLote: n(pasoLote) } });
                  avisar({ texto: 'Capital, riesgo y paso de lote guardados como predeterminados del ticket del replay.' });
                }}
                disabled={!(n(capital) > 0 && n(riesgoPct) > 0 && n(riesgoPct) <= 10 && n(pasoLote) > 0)}
              >
                Usar como predeterminados
              </Boton>
            </div>
          </form>
          <div className="separado">
            {vacio ? (
              <p className="tenue">Completá entrada y stop para calcular el tamaño.</p>
            ) : error ? (
              <p className="campo__error" role="alert">
                {error}
              </p>
            ) : !calculo ? (
              <Cargando texto="Calculando…" />
            ) : (
              <div className="resultado-riesgo" aria-live="polite">
                <div className="metrica">
                  <span className="metrica__nombre">Tamaño</span>
                  <span className="metrica__valor">{numero(calculo.lotes, 2)} lotes</span>
                  <span className="metrica__base">
                    {calculo.lado === 'compra' ? '▲ Compra' : '▼ Venta'}, {numero(calculo.lotes * (instr?.tamano_contrato ?? 0), 0)} unidades
                  </span>
                </div>
                <dl className="definiciones">
                  <dt>Riesgo pedido</dt>
                  <dd className="num">{numero(calculo.riesgo_moneda, 2)} USD</dd>
                  <dt>Riesgo real (lotes redondeados)</dt>
                  <dd className="num">{numero(calculo.riesgo_real_moneda, 2)} USD</dd>
                  <dt>Distancia al stop</dt>
                  <dd className="num">{precio(calculo.distancia_stop, instr?.decimales ?? 2)}</dd>
                  <dt>Costo ida y vuelta</dt>
                  <dd className="num">
                    {numero(calculo.costo_ida_vuelta_moneda, 2)} USD ({numero(calculo.costo_en_r, 3)} R)
                  </dd>
                  <dt>Objetivo / stop</dt>
                  <dd className="num">{calculo.rr ? `${numero(calculo.rr, 2)} : 1` : '—'}</dd>
                  <dt>Ganancia en el objetivo</dt>
                  <dd className="num">{calculo.ganancia_objetivo_moneda !== null && calculo.ganancia_objetivo_moneda !== undefined ? `${numero(calculo.ganancia_objetivo_moneda, 2)} USD` : '—'}</dd>
                </dl>
                {calculo.avisos.length > 0 && (
                  <div className="nota nota--aviso">
                    <Icono nombre="alerta" />
                    <ul className="lista-avisos">
                      {calculo.avisos.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="supuestos">
                  <summary>Supuestos del cálculo</summary>
                  <ul className="lista-avisos">
                    {calculo.supuestos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        </Panel>
        <div className="apilado">
          <Panel titulo="Tipos de orden">
            <ul className="lista planificado">
              <li>
                <Insignia tono="activo">Disponible</Insignia>
                <span>
                  <strong>A mercado</strong>en el replay: se llena en la apertura del minuto siguiente al límite, con el motor del laboratorio.
                </span>
              </li>
              <li>
                <Insignia>Planificado</Insignia>
                <span>
                  <strong>Límite</strong>lab/smc.py ya resuelve órdenes límite en M1 (se llenan al tocar, vencen); falta el adaptador del replay.
                </span>
              </li>
              <li>
                <Insignia>Planificado</Insignia>
                <span>
                  <strong>Stop</strong>sin modelo de llenado probado todavía.
                </span>
              </li>
              <li>
                <Insignia tono="aviso">No implementado</Insignia>
                <span>
                  <strong>Envío a un bróker</strong>no existe ruteo de órdenes. Haría falta una integración autorizada y probada.
                </span>
              </li>
            </ul>
          </Panel>
          <Panel titulo="Órdenes simuladas del replay" subtitulo={`${estado.simbolo}, guardadas en este espacio`} acciones={<a className="boton boton--texto" href="#/replay">Abrir el replay</a>}>
            <p>
              <span className="conteo__n num">{ordenes.length}</span> <span className="tenue">órdenes</span>
            </p>
            <p className="campo__ayuda">El estado de cada una (esperando, abierta, cerrada) depende del límite del replay y se ve en su panel de órdenes.</p>
          </Panel>
          <Panel titulo="Estados de una orden simulada">
            {referencias.datos ? (
              <dl className="definiciones">
                {referencias.datos.estados_orden.map((e) => (
                  <div key={e.clave} style={{ display: 'contents' }}>
                    <dt>{e.clave.replaceAll('_', ' ')}</dt>
                    <dd className="secundario">{e.texto}</dd>
                  </div>
                ))}
              </dl>
            ) : referencias.error ? (
              <ErrorEstado error={referencias.error} reintentar={referencias.recargar} compacto />
            ) : (
              <Cargando />
            )}
          </Panel>
        </div>
      </div>
      <Panel titulo="Perfiles de costos" subtitulo="Los que usa el laboratorio (lab/ejecucion.py) para recalcular cada operación" className="separado" sinRelleno>
        {referencias.datos ? (
          <>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Perfil</th>
                    <th className="der">Spread</th>
                    <th className="der">Deslizamiento</th>
                    <th className="der">Latencia</th>
                    <th>Por sesión</th>
                    <th>Por volatilidad</th>
                    <th>Swap</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {referencias.datos.perfiles_costos.map((p) => (
                    <tr key={p.clave}>
                      <td>{p.nombre}</td>
                      <td className="der num">{p.escala_spread === null ? 'fijo' : `× ${numero(p.escala_spread, 2)}`}</td>
                      <td className="der num">{p.deslizamiento === null ? '—' : `× ${numero(p.deslizamiento, 2)}`}</td>
                      <td className="der num">{p.latencia_ms === null || p.latencia_ms === undefined ? '—' : `${p.latencia_ms} ms`}</td>
                      <td>{p.por_sesion ? 'sí' : 'no'}</td>
                      <td>{p.por_volatilidad ? 'sí' : 'no'}</td>
                      <td>{p.swap ?? 'sin swap'}</td>
                      <td className="envuelve secundario">{p.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="lista-avisos supuestos-lista">
              {referencias.datos.supuestos_costos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        ) : (
          <Cargando />
        )}
      </Panel>
    </div>
  );
}
