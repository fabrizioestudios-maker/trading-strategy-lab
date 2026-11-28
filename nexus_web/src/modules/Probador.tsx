/**
 * Probador de estrategias: reglas con indicadores clásicos, probadas en el servidor con el motor del laboratorio
 * (1 minuto, costos, muestra de validación reservada, azar, Deflated Sharpe con tus pruebas, Monte Carlo).
 */
import { useMemo, useState } from 'react';
import { api, ESTATICO, explicarError } from '../api/cliente';
import type { DefinicionIndicador, ResultadoProbador } from '../api/contrato.gen';
import { useEspacio } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { GraficoSerie } from '../components/GraficoSerie';
import { useCatalogo } from '../components/Indicadores';
import { Icono } from '../components/iconos';
import { Boton, BotonIcono, Insignia, Panel } from '../components/ui';
import { leer, guardar } from '../lib/almacen';
import { curvaDeCapital } from '../lib/curva';
import { conSigno, fechaHora, numero, porcentaje } from '../lib/formato';
import { CLAVE_ESTRATEGIAS, EJEMPLOS, OPERADORES, cond, ind, valor, type Condicion, type Estrategia, type Operando } from '../lib/probador';

const PERFILES: [Estrategia['perfil_costos'], string][] = [
  ['sin_costos', 'Sin costos'],
  ['optimista', 'Optimista'],
  ['costos_md', 'Tabla de costos'],
  ['base', 'Base'],
  ['conservador', 'Conservador'],
  ['estres', 'Estrés'],
];
const MUESTRAS: [string, string][] = [
  ['eleccion', 'Elección'],
  ['validacion', 'Validación'],
  ['total', 'Total'],
];

function EditorOperando({ v, onCambio, defs }: { v: Operando; onCambio: (o: Operando) => void; defs: DefinicionIndicador[] }) {
  const d = defs.find((x) => x.id === v.id);
  const numericos = d?.parametros.filter((p) => (p.tipo === 'entero' || p.tipo === 'decimal') && !p.grupo).slice(0, 3) ?? [];
  return (
    <span className="operando">
      <select
        className="selector selector--chico"
        aria-label="Tipo de valor"
        value={v.tipo === 'indicador' ? `i:${v.id}` : v.tipo === 'precio' ? `p:${v.campo}` : 'v'}
        onChange={(e) => {
          const x = e.target.value;
          if (x === 'v') onCambio(valor(0));
          else if (x.startsWith('p:')) onCambio({ tipo: 'precio', id: null, parametros: {}, linea: null, campo: x.slice(2) as 'close', valor: null });
          else onCambio(ind(x.slice(2)));
        }}
      >
        <optgroup label="Precio">
          <option value="p:close">Cierre</option>
          <option value="p:open">Apertura</option>
          <option value="p:high">Máximo</option>
          <option value="p:low">Mínimo</option>
        </optgroup>
        <optgroup label="Indicadores">
          {defs.map((x) => (
            <option key={x.id} value={`i:${x.id}`}>
              {x.corto} · {x.nombre}
            </option>
          ))}
        </optgroup>
        <option value="v">Número</option>
      </select>
      {v.tipo === 'valor' && (
        <input className="entrada entrada--chica num" type="number" step="any" aria-label="Número" value={v.valor ?? 0} onChange={(e) => onCambio({ ...v, valor: Number(e.target.value) })} />
      )}
      {v.tipo === 'indicador' &&
        numericos.map((p) => (
          <input
            key={p.id}
            className="entrada entrada--chica num operando__param"
            type="number"
            step={p.paso ?? (p.tipo === 'entero' ? 1 : 0.1)}
            min={p.minimo ?? undefined}
            max={p.maximo ?? undefined}
            aria-label={`${d?.corto} ${p.nombre}`}
            title={p.nombre}
            value={Number(v.parametros?.[p.id] ?? p.defecto)}
            onChange={(e) => onCambio({ ...v, parametros: { ...v.parametros, [p.id]: Number(e.target.value) } })}
          />
        ))}
      {v.tipo === 'indicador' && d && d.lineas.length > 1 && (
        <select className="selector selector--chico" aria-label="Línea del indicador" value={v.linea ?? d.lineas[0]} onChange={(e) => onCambio({ ...v, linea: e.target.value })}>
          {d.lineas.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      )}
    </span>
  );
}

function Condiciones({ titulo, lista, onCambio, defs }: { titulo: string; lista: Condicion[]; onCambio: (l: Condicion[]) => void; defs: DefinicionIndicador[] }) {
  return (
    <fieldset className="prob-reglas">
      <legend>{titulo}</legend>
      {!lista.length && <p className="tenue">Sin condiciones: no abre operaciones de este lado.</p>}
      {lista.map((c, i) => (
        <div key={i} className="prob-regla">
          {i > 0 && <span className="prob-regla__y">y</span>}
          <EditorOperando v={c.izq} defs={defs} onCambio={(o) => onCambio(lista.map((x, j) => (j === i ? { ...x, izq: o } : x)))} />
          <select className="selector selector--chico" aria-label="Operador" value={c.op} onChange={(e) => onCambio(lista.map((x, j) => (j === i ? { ...x, op: e.target.value as Condicion['op'] } : x)))}>
            {OPERADORES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
          <EditorOperando v={c.der} defs={defs} onCambio={(o) => onCambio(lista.map((x, j) => (j === i ? { ...x, der: o } : x)))} />
          <BotonIcono etiqueta="Quitar condición" icono="cruz" onClick={() => onCambio(lista.filter((_, j) => j !== i))} />
        </div>
      ))}
      {lista.length < 6 && (
        <Boton chico icono="mas" onClick={() => onCambio([...lista, cond(ind('rsi'), 'mayor', valor(50))])}>
          Agregar condición
        </Boton>
      )}
    </fieldset>
  );
}

function Resultado({ r, zona }: { r: ResultadoProbador; zona: 'ny' | 'utc' }) {
  const curva = useMemo(() => curvaDeCapital(r.operaciones), [r.operaciones]);
  const corte = r.operaciones.find((o) => o.muestra === 'validacion');
  const filas = r.metricas.total.map((m) => m.clave);
  const valorDe = (muestra: string, clave: string) => r.metricas[muestra]?.find((m) => m.clave === clave);
  const pasa = r.criterios.filter((c) => c.ok).length;
  return (
    <div className="probador__resultado">
      <section className={`veredicto ${pasa === r.criterios.length ? 'veredicto--ok' : 'veredicto--no'}`} aria-live="polite">
        <h2>
          <Icono nombre={pasa === r.criterios.length ? 'check' : 'alerta'} tam={18} /> {r.veredicto}
        </h2>
        <ul className="criterios">
          {r.criterios.map((c) => (
            <li key={c.nombre} className={c.ok ? 'es-ok' : 'es-no'}>
              <Icono nombre={c.ok ? 'check' : 'cruz'} tam={14} />
              {c.nombre}
            </li>
          ))}
        </ul>
        <p className="campo__ayuda">
          {r.simbolo}, velas de {r.temporalidad} min, costos «{r.perfil_costos}». Validación desde {r.corte_validacion}. Calculado en {numero(r.segundos, 1)} s.
        </p>
      </section>

      <Panel titulo="Métricas" subtitulo="La validación es la parte final del período que no se usó para nada" sinRelleno>
        <div className="tabla-envoltura">
          <table className="tabla tabla--compacta">
            <thead>
              <tr>
                <th scope="col">Métrica</th>
                {MUESTRAS.map(([k, n]) => (
                  <th key={k} scope="col" className="der">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((clave) => {
                const m = valorDe('total', clave)!;
                return (
                  <tr key={clave}>
                    <th scope="row" title={m.definicion}>
                      {m.nombre}
                    </th>
                    {MUESTRAS.map(([k]) => {
                      const x = valorDe(k, clave);
                      const v = x?.valor;
                      const txt = v === null || v === undefined ? '—' : m.unidad === 'R' ? conSigno(v, 2, 'R') : m.unidad === '%' ? porcentaje(v, 1) : clave === 'n' ? numero(v, 0) : numero(v, clave === 'p' ? 4 : 2);
                      return (
                        <td key={k} className={`num der${k === 'validacion' ? ' es-validacion' : ''}`}>
                          {txt}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel titulo="Curva de capital" subtitulo={`R acumulado por operación (${r.operaciones.length} operaciones, costos ${r.perfil_costos})`}>
        <GraficoSerie
          tipo="linea"
          zona={zona}
          alto={220}
          puntos={curva.puntos.map((p) => ({ t: p.t, v: p.acumulado }))}
          marcas={corte ? [{ t: corte.salida_ms, texto: 'Validación' }] : []}
          etiqueta={`Curva de capital: ${conSigno(curva.total, 2, 'R')}`}
        />
      </Panel>

      <div className="probador__grilla">
        <Panel titulo="Contra el azar" subtitulo={`${r.azar.simulaciones} juegos de entradas al azar del mismo lado, mismo stop y objetivo`}>
          <dl className="datos-par">
            <dt>Tu estrategia (sin costos)</dt>
            <dd className="num">{conSigno(r.azar.media_observada, 3, 'R')}</dd>
            <dt>Media del azar</dt>
            <dd className="num">{conSigno(r.azar.media_azar, 3, 'R')}</dd>
            <dt>Percentil 95 del azar</dt>
            <dd className="num">{conSigno(r.azar.p95_azar, 3, 'R')}</dd>
            <dt>p</dt>
            <dd className="num">{r.azar.p === null ? '—' : numero(r.azar.p, 3)}</dd>
          </dl>
        </Panel>
        <Panel titulo="Pruebas múltiples" subtitulo="Probar muchas variantes infla los resultados: el Deflated Sharpe lo corrige">
          <dl className="datos-par">
            <dt>Configuraciones que probaste</dt>
            <dd className="num">{numero(r.pruebas.acumuladas, 0)}</dd>
            <dt>Sharpe por operación (elección)</dt>
            <dd className="num">{numero(r.pruebas.sharpe_eleccion, 3)}</dd>
            <dt>Deflated Sharpe</dt>
            <dd className="num">{numero(r.pruebas.deflated_sharpe, 3)}</dd>
            <dt>Varianza de referencia</dt>
            <dd className="num" title={r.pruebas.fuente_varianza}>
              {numero(r.pruebas.varianza_usada, 5)}
            </dd>
          </dl>
        </Panel>
      </div>

      <div className="probador__grilla">
        <Panel titulo="Monte Carlo (5 años)" subtitulo="Bootstrap por bloques de los R; drawdown según el riesgo por operación" sinRelleno>
          <table className="tabla tabla--compacta">
            <thead>
              <tr>
                <th scope="col">Riesgo</th>
                <th scope="col" className="der">
                  DD mediano
                </th>
                <th scope="col" className="der">
                  DD p95
                </th>
                <th scope="col" className="der">
                  P(DD &gt; 20 %)
                </th>
              </tr>
            </thead>
            <tbody>
              {r.montecarlo.map((f) => (
                <tr key={f.riesgo_pct}>
                  <td className="num">{porcentaje(f.riesgo_pct, 2)}</td>
                  <td className="num der">{porcentaje((f.dd_mediana ?? 0) * 100, 1)}</td>
                  <td className="num der">{porcentaje((f.dd_p95 ?? 0) * 100, 1)}</td>
                  <td className="num der">{porcentaje((f.p_dd_20 ?? 0) * 100, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel titulo="Sensibilidad a los costos" subtitulo="Expectativa por operación según el perfil" sinRelleno>
          <table className="tabla tabla--compacta">
            <thead>
              <tr>
                <th scope="col">Perfil</th>
                {MUESTRAS.map(([k, n]) => (
                  <th key={k} scope="col" className="der">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.sensibilidad_costos.map((f) => (
                <tr key={String(f.perfil)} className={f.perfil === r.perfil_costos ? 'es-activo' : ''}>
                  <td>{PERFILES.find((p) => p[0] === f.perfil)?.[1] ?? String(f.perfil)}</td>
                  {MUESTRAS.map(([k]) => (
                    <td key={k} className="num der">
                      {conSigno(f[k] as number | null, 3, 'R')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel titulo="Operaciones" subtitulo={`Las últimas ${Math.min(200, r.operaciones.length)} de ${r.operaciones.length}`} sinRelleno>
        <div className="tabla-envoltura tabla-envoltura--alta">
          <table className="tabla tabla--compacta">
            <thead>
              <tr>
                <th scope="col">Entrada</th>
                <th scope="col">Lado</th>
                <th scope="col" className="der">
                  Precio
                </th>
                <th scope="col">Salida</th>
                <th scope="col" className="der">
                  R
                </th>
                <th scope="col">Muestra</th>
              </tr>
            </thead>
            <tbody>
              {r.operaciones
                .slice(-200)
                .reverse()
                .map((o) => (
                  <tr key={o.entrada_ms}>
                    <td className="num">{fechaHora(o.entrada_ms, zona)}</td>
                    <td>{o.lado}</td>
                    <td className="num der">{numero(o.precio_entrada, 2)}</td>
                    <td>{o.motivo}</td>
                    <td className={`num der tono-${o.r > 0 ? 'pos' : o.r < 0 ? 'neg' : 'neutro'}`}>{conSigno(o.r, 2)}</td>
                    <td>{o.muestra === 'validacion' ? 'validación' : 'elección'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <ul className="avisos-lista">
        {r.avisos.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Probador() {
  const { estado } = useEspacio();
  const { instrumentos } = useGlobales();
  const cat = useCatalogo();
  const defs = (cat.datos ?? []).filter((d) => d.id !== 'luxalgo_smc');
  const [e, setE] = useState<Estrategia>(() => structuredClone(EJEMPLOS[0]));
  const [guardadas, setGuardadas] = useState<Estrategia[]>(() => leer<Estrategia[]>(CLAVE_ESTRATEGIAS, []));
  const [res, setRes] = useState<ResultadoProbador | null>(null);
  const [error, setError] = useState<{ titulo: string; detalle: string } | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const fijar = (x: Partial<Estrategia>) => setE({ ...e, ...x });
  const disponibles = (instrumentos.datos ?? []).filter((i) => i.disponible);
  const probar = async () => {
    setCorriendo(true);
    setError(null);
    try {
      setRes(await api.probar(e));
    } catch (x) {
      setError(explicarError(x));
    } finally {
      setCorriendo(false);
    }
  };
  const guardarla = () => {
    const l = [e, ...guardadas.filter((x) => x.nombre !== e.nombre)].slice(0, 50);
    setGuardadas(l);
    guardar(CLAVE_ESTRATEGIAS, l);
  };
  const todas = [...guardadas.map((x) => ({ x, tipo: 'Guardadas' })), ...EJEMPLOS.map((x) => ({ x, tipo: 'Ejemplos' }))];
  return (
    <div className="pagina probador">
      <header className="pagina__cabeza">
        <div>
          <h1>Probador de estrategias</h1>
          <p>
            Armá reglas con indicadores y probalas como lo hace el laboratorio: minuto a minuto, con costos reales, una muestra de validación que no se toca,
            comparación contra el azar y corrección por la cantidad de pruebas que hiciste.
          </p>
        </div>
      </header>
      <div className="probador__cuerpo">
        <Panel
          titulo="Estrategia"
          className="probador__form"
          acciones={
            <select
              className="selector selector--chico"
              aria-label="Cargar una estrategia"
              value=""
              onChange={(ev) => {
                const x = todas[Number(ev.target.value)];
                if (x) setE(structuredClone(x.x));
              }}
            >
              <option value="">Cargar…</option>
              {todas.map((t, i) => (
                <option key={`${t.tipo}-${i}`} value={i}>
                  {t.tipo === 'Ejemplos' ? 'Ejemplo: ' : ''}
                  {t.x.nombre}
                </option>
              ))}
            </select>
          }
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              void probar();
            }}
          >
            <div className="probador__campos">
              <label>
                Nombre
                <input className="entrada" value={e.nombre} maxLength={80} onChange={(ev) => fijar({ nombre: ev.target.value })} />
              </label>
              <label>
                Instrumento
                <select className="selector" value={e.simbolo} onChange={(ev) => fijar({ simbolo: ev.target.value })}>
                  {disponibles.map((i) => (
                    <option key={i.simbolo} value={i.simbolo}>
                      {i.simbolo} · {i.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Velas
                <select className="selector" value={e.tf} onChange={(ev) => fijar({ tf: Number(ev.target.value) })}>
                  <option value={15}>15 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={240}>4 horas</option>
                  <option value={1440}>Diario</option>
                </select>
              </label>
              <label>
                Desde
                <input className="entrada" type="date" value={e.desde} onChange={(ev) => fijar({ desde: ev.target.value })} />
              </label>
              <label>
                Hasta
                <input className="entrada" type="date" value={e.hasta} onChange={(ev) => fijar({ hasta: ev.target.value })} />
              </label>
              <label>
                Validación
                <select className="selector" value={e.fraccion_validacion} onChange={(ev) => fijar({ fraccion_validacion: Number(ev.target.value) })}>
                  {[0.2, 0.3, 0.4, 0.5].map((f) => (
                    <option key={f} value={f}>
                      último {Math.round(f * 100)} %
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Condiciones titulo="Compra cuando…" lista={e.compra} defs={defs} onCambio={(l) => fijar({ compra: l })} />
            <Condiciones titulo="Venta cuando…" lista={e.venta} defs={defs} onCambio={(l) => fijar({ venta: l })} />
            <fieldset className="prob-reglas">
              <legend>Salidas y costos</legend>
              <div className="probador__campos">
                <label>
                  Stop (× ATR)
                  <input className="entrada num" type="number" step={0.1} min={0.2} max={10} value={e.sl_atr} onChange={(ev) => fijar({ sl_atr: Number(ev.target.value) })} />
                </label>
                <label>
                  Objetivo (× stop)
                  <input className="entrada num" type="number" step={0.1} min={0.3} max={10} value={e.rr} onChange={(ev) => fijar({ rr: Number(ev.target.value) })} />
                </label>
                <label>
                  ATR (velas)
                  <input className="entrada num" type="number" min={2} max={200} value={e.atr_n} onChange={(ev) => fijar({ atr_n: Number(ev.target.value) })} />
                </label>
                <label>
                  Cierre por tiempo (velas, 0 = no)
                  <input className="entrada num" type="number" min={0} max={2000} value={e.max_velas} onChange={(ev) => fijar({ max_velas: Number(ev.target.value) })} />
                </label>
                <label>
                  Costos
                  <select className="selector" value={e.perfil_costos} onChange={(ev) => fijar({ perfil_costos: ev.target.value as Estrategia['perfil_costos'] })}>
                    {PERFILES.map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
            <div className="fila probador__acciones">
              <Boton type="submit" variante="primario" icono="play" cargando={corriendo} disabled={ESTATICO || corriendo || (!e.compra.length && !e.venta.length)}>
                Probar estrategia
              </Boton>
              <Boton onClick={guardarla} disabled={!e.nombre.trim()}>
                Guardar en este navegador
              </Boton>
            </div>
            {ESTATICO && <p className="campo__ayuda">En la versión publicada no se corren pruebas: necesitan el servidor de NEXUS.</p>}
          </form>
        </Panel>
        <div className="probador__salida">
          {error && (
            <p className="nota nota--error" role="alert">
              <Icono nombre="alerta" />
              <span>
                <strong>{error.titulo}.</strong> {error.detalle}
              </span>
            </p>
          )}
          {corriendo && <p className="tenue">Probando: simulación minuto a minuto, costos, 300 juegos al azar y Monte Carlo…</p>}
          {res ? (
            <Resultado r={res} zona={estado.prefs.zona} />
          ) : (
            !corriendo && (
              <div className="probador__vacio">
                <Insignia>Cómo se prueba</Insignia>
                <ol>
                  <li>La señal se evalúa al cierre de la vela; la entrada es en el minuto siguiente.</li>
                  <li>Stop a k × ATR y objetivo a RR veces el stop; si los dos caen en el mismo minuto, cuenta el stop.</li>
                  <li>Se cobran spread, deslizamiento y swaps según el perfil de costos.</li>
                  <li>La última parte del período es la validación: se informa aparte.</li>
                  <li>Se compara contra 300 juegos de entradas al azar y se corrige por las pruebas que llevás.</li>
                </ol>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
