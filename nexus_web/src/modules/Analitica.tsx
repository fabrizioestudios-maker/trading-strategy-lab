import { useMemo, useState } from 'react';
import { api } from '../api/cliente';
import type { Metrica, Operacion, Trabajo } from '../api/contrato.gen';
import { useRecurso } from '../api/recurso';
import { useEspacio } from '../app/espacio';
import { useRuta } from '../app/ruta';
import { Barras } from '../components/Barras';
import { describirConfig, NOMBRE_PERFIL } from '../components/Evidencia';
import { Atribucion } from '../components/GraficoVelas';
import { GraficoSerie } from '../components/GraficoSerie';
import { Icono } from '../components/iconos';
import { Cargando, ErrorEstado, Info, Insignia, Panel, Segmentado, Vacio } from '../components/ui';
import { curvaDeCapital } from '../lib/curva';
import { conSigno, entero, fecha, fechaHora, numero, porcentaje, precio, tono } from '../lib/formato';
import { armarRuta } from '../lib/rutas';

type Muestra = 'eleccion' | 'confirmacion' | 'total';
const NOMBRE_MUESTRA: Record<Muestra, string> = { eleccion: 'Elección', confirmacion: 'Confirmación', total: 'Total' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function valorMetrica(m: Metrica): string {
  if (m.valor === null) return '—';
  if (m.clave === 'n') return entero(m.valor);
  if (m.unidad === '%') return porcentaje(m.valor, 1);
  if (m.unidad === 'R') return m.clave === 'max_dd' ? `${numero(m.valor, 2)} R` : conSigno(m.valor, 2, 'R');
  if (m.unidad === 'h') return `${numero(m.valor, 1)} h`;
  if (m.clave === 'p') return numero(m.valor, 4);
  return numero(m.valor, 2);
}

export default function Analitica({ params }: { params: Record<string, string> }) {
  const { ir } = useRuta();
  const { estado } = useEspacio();
  const zona = estado.prefs.zona;
  const lista = useRecurso((s) => api.trabajos(s), []);
  const terminadas = (lista.datos ?? []).filter((t) => t.estado === 'terminado');
  const id = params.corrida && terminadas.some((t) => t.id === params.corrida) ? params.corrida : terminadas[0]?.id;
  const corrida = useRecurso((s) => api.trabajo(id!, s), [id], !!id);
  const idComp = params.comparar && params.comparar !== id ? params.comparar : undefined;
  const comparada = useRecurso((s) => api.trabajo(idComp!, s), [idComp], !!idComp);
  const [muestra, setMuestra] = useState<Muestra>('total');

  const cabeza = (
    <header className="pagina__cabeza">
      <div>
        <h1>Analítica</h1>
        <p>Resultados de corridas reales del laboratorio. Cada número muestra su muestra, período, perfil de costos y definición.</p>
      </div>
    </header>
  );
  if (lista.error && !lista.datos)
    return (
      <div className="pagina">
        {cabeza}
        <ErrorEstado error={lista.error} reintentar={lista.recargar} />
      </div>
    );
  if (!lista.datos)
    return (
      <div className="pagina">
        {cabeza}
        <Cargando />
      </div>
    );
  if (!id)
    return (
      <div className="pagina">
        {cabeza}
        <Vacio
          titulo="No hay corridas terminadas en este servidor"
          texto="La analítica se arma con el resultado de una corrida del laboratorio, no con números de ejemplo."
          accion={
            <a className="boton boton--primario" href={armarRuta('laboratorio', { estrategia: 'e022' })}>
              Correr E022
            </a>
          }
        />
      </div>
    );

  const t = corrida.datos?.id === id ? corrida.datos : null;
  const c = comparada.datos?.id === idComp ? comparada.datos : null;
  return (
    <div className="pagina">
      {cabeza}
      <div className="barra-analitica" role="group" aria-label="Qué analizar">
        <label className="campo">
          <span className="campo__etiqueta">Corrida</span>
          <select className="selector" value={id} onChange={(e) => ir('analitica', { corrida: e.target.value, comparar: idComp })}>
            {terminadas.map((x) => (
              <option key={x.id} value={x.id}>
                {describirConfig(x)} ({fecha(x.creado_ms, zona)})
              </option>
            ))}
          </select>
        </label>
        <div className="campo">
          <span className="campo__etiqueta">Muestra</span>
          <Segmentado
            etiqueta="Muestra"
            valor={muestra}
            onCambio={setMuestra}
            opciones={(['eleccion', 'confirmacion', 'total'] as Muestra[]).map((m) => ({ valor: m, etiqueta: NOMBRE_MUESTRA[m] }))}
          />
        </div>
        <label className="campo">
          <span className="campo__etiqueta">Comparar con</span>
          <select className="selector" value={idComp ?? ''} onChange={(e) => ir('analitica', { corrida: id, comparar: e.target.value || undefined })}>
            <option value="">Sin comparación</option>
            {terminadas
              .filter((x) => x.id !== id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {describirConfig(x)}
                </option>
              ))}
          </select>
        </label>
      </div>
      {corrida.error && !t ? <ErrorEstado error={corrida.error} reintentar={corrida.recargar} /> : !t ? <Cargando /> : <Resultado t={t} comp={c} muestra={muestra} />}
    </div>
  );
}

function Resultado({ t, comp, muestra }: { t: Trabajo; comp: Trabajo | null; muestra: Muestra }) {
  const { estado } = useEspacio();
  const zona = estado.prefs.zona;
  const r = t.resultado!;
  const metricas = r.metricas[muestra] ?? [];
  const mComp = comp?.resultado?.metricas[muestra] ?? [];
  const ops = useMemo(() => r.operaciones.filter((o) => muestra === 'total' || o.muestra === muestra), [r.operaciones, muestra]);
  const curva = useMemo(() => curvaDeCapital(ops), [ops]);
  const inicioConf = r.operaciones.find((o) => o.muestra === 'confirmacion')?.salida_ms;
  const base = metricas[0];
  const principales = ['expectancy', 'ic_lo', 'ic_hi', 'n', 'wr', 'pf', 'payoff', 'max_dd', 'r_total', 'p', 'duracion_media_h'];
  return (
    <div className="apilado">
      {r.avisos.length > 0 && (
        <div className="nota nota--aviso" role="note">
          <Icono nombre="alerta" />
          <ul className="lista-avisos">
            {r.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <Panel
        titulo={`Métricas de ${NOMBRE_MUESTRA[muestra].toLowerCase()}`}
        subtitulo={base ? `n = ${entero(base.n)} operaciones, ${base.periodo}, costos ${NOMBRE_PERFIL[base.perfil_costos] ?? base.perfil_costos}` : undefined}
        acciones={comp ? <Insignia tono="activo">Comparando con: {describirConfig(comp)}</Insignia> : undefined}
      >
        <div className="metricas">
          {principales
            .map((k) => metricas.find((m) => m.clave === k))
            .filter((m): m is Metrica => !!m)
            .map((m) => {
              const otra = mComp.find((x) => x.clave === m.clave);
              return (
                <div className="metrica" key={m.clave}>
                  <span className="metrica__nombre">
                    {m.nombre}
                    <Info texto={`${m.definicion}. Muestra: n = ${m.n}, ${m.periodo}, costos ${NOMBRE_PERFIL[m.perfil_costos] ?? m.perfil_costos}.`} etiqueta={`Definición de ${m.nombre}`} />
                  </span>
                  <span className="metrica__valor">{valorMetrica(m)}</span>
                  {otra && <span className="metrica__base">comparada: {valorMetrica(otra)}</span>}
                </div>
              );
            })}
        </div>
      </Panel>

      <div className="grilla grilla--2">
        <Panel titulo="Curva de capital" subtitulo={`R acumulado por operación, ${NOMBRE_MUESTRA[muestra].toLowerCase()} (${ops.length} operaciones)`}>
          {ops.length ? (
            <GraficoSerie
              tipo="linea"
              zona={zona}
              puntos={curva.puntos.map((p) => ({ t: p.t, v: p.acumulado }))}
              marcas={muestra === 'total' && inicioConf ? [{ t: inicioConf, texto: 'Confirmación' }] : []}
              etiqueta={`Curva de capital: termina en ${conSigno(curva.total, 2, 'R')}`}
            />
          ) : (
            <Vacio titulo="Sin operaciones en esta muestra" />
          )}
        </Panel>
        <Panel titulo="Drawdown" subtitulo={`Caída desde el máximo previo, máximo ${numero(curva.maxCaida, 2)} R`}>
          {ops.length ? (
            <GraficoSerie tipo="caida" zona={zona} puntos={curva.puntos.map((p) => ({ t: p.t, v: -p.caida }))} etiqueta={`Drawdown: máximo ${numero(curva.maxCaida, 2)} R`} />
          ) : (
            <Vacio titulo="Sin operaciones en esta muestra" />
          )}
        </Panel>
      </div>
      <p className="fila fila--entre campo__ayuda">
        <span>Las curvas usan los R por operación que devolvió la corrida (perfil {NOMBRE_PERFIL[t.config.perfil_costos]}).</span>
        <Atribucion />
      </p>

      <div className="grilla grilla--principal">
        <Panel titulo="Por año" subtitulo="R total de cada año. La línea punteada separa elección y confirmación.">
          <Barras
            etiqueta="R total por año"
            separarAntesDe={r.por_anio.find((x) => x.muestra !== 'eleccion')?.anio?.toString()}
            datos={r.por_anio.map((x) => ({
              clave: String(x.anio),
              valor: Number(x.r_total),
              detalle: `n = ${x.n}, acierto ${porcentaje(Number(x.acierto), 1)}, expectativa ${conSigno(Number(x.expectativa), 2, 'R')}`,
              atenuada: muestra !== 'total' && x.muestra !== muestra && x.muestra !== 'mixta',
            }))}
          />
          <div className="tabla-envoltura separado">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Año</th>
                  <th className="der">n</th>
                  <th className="der">Acierto</th>
                  <th className="der">Expectativa</th>
                  <th className="der">R total</th>
                  <th>Muestra</th>
                </tr>
              </thead>
              <tbody>
                {r.por_anio.map((x) => (
                  <tr key={String(x.anio)}>
                    <td className="num">{String(x.anio)}</td>
                    <td className="der num">{entero(Number(x.n))}</td>
                    <td className="der num">{porcentaje(Number(x.acierto), 1)}</td>
                    <td className={`der num tono-${tono(Number(x.expectativa))}`}>{conSigno(Number(x.expectativa), 2)}</td>
                    <td className="der num">{conSigno(Number(x.r_total), 2)}</td>
                    <td className="tenue">{String(x.muestra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="apilado">
          <TablaDesglose titulo="Por lado" filas={r.desgloses.por_lado ?? []} clave="lado" />
          <TablaDesglose titulo="Por sesión de entrada" filas={r.desgloses.por_sesion ?? []} clave="sesion" />
          <Panel titulo="Sensibilidad a costos" subtitulo="Expectativa por operación (R) según el perfil" sinRelleno>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Perfil</th>
                    <th className="der">Elección</th>
                    <th className="der">Confirmación</th>
                    <th className="der">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.sensibilidad_costos.map((f) => (
                    <tr key={String(f.perfil)} className={f.perfil === t.config.perfil_costos ? 'es-activo' : ''}>
                      <td>{NOMBRE_PERFIL[String(f.perfil)] ?? String(f.perfil)}</td>
                      {(['eleccion', 'confirmacion', 'total'] as const).map((k) => (
                        <td key={k} className={`der num tono-${tono(f[k] as number)}`}>
                          {conSigno(f[k] as number | null, 3)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>

      <Panel titulo="Por mes" subtitulo="R total de cada mes (perfil de la corrida). Celdas vacías: meses sin operaciones.">
        <MapaMeses filas={(r.desgloses.por_mes ?? []) as { mes: string; n: number; r_total: number }[]} />
      </Panel>

      <Panel titulo="Robustez" subtitulo="Lo que el laboratorio tiene y todavía no se puede pedir desde NEXUS">
        <ul className="lista planificado">
          <li>
            <Insignia>Planificado</Insignia>
            <span>
              <strong>Walk-forward</strong> lab/walkforward.py existe y tiene pruebas; falta exponerlo como trabajo de la API con su configuración inmutable.
            </span>
          </li>
          <li>
            <Insignia>Planificado</Insignia>
            <span>
              <strong>Comparación con benchmarks</strong> lab/benchmarks.py (comprar y mantener, señales al azar con el mismo riesgo); misma razón.
            </span>
          </li>
          <li>
            <Insignia>Planificado</Insignia>
            <span>
              <strong>Monte Carlo de la secuencia</strong> lab/montecarlo.py; misma razón.
            </span>
          </li>
          <li>
            <Insignia tono="activo">Disponible</Insignia>
            <span>
              <strong>Intervalos y prueba de media positiva</strong> IC por bootstrap y p de la media, arriba, por muestra.
            </span>
          </li>
        </ul>
      </Panel>

      <TablaOperaciones ops={ops} zona={zona} />
    </div>
  );
}

function TablaDesglose({ titulo, filas, clave }: { titulo: string; filas: Record<string, unknown>[]; clave: string }) {
  return (
    <Panel titulo={titulo} sinRelleno>
      {filas.length === 0 ? (
        <p className="tenue" style={{ padding: 16 }}>
          Sin datos.
        </p>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>{clave === 'lado' ? 'Lado' : 'Sesión'}</th>
                <th className="der">n</th>
                <th className="der">Acierto</th>
                <th className="der">Expectativa</th>
                <th className="der">R total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={String(f[clave])}>
                  <td>{String(f[clave]).replace('1', 'compra').replace('-compra', 'venta')}</td>
                  <td className="der num">{entero(Number(f.n))}</td>
                  <td className="der num">{porcentaje(Number(f.acierto), 1)}</td>
                  <td className={`der num tono-${tono(Number(f.expectativa))}`}>{conSigno(Number(f.expectativa), 2)}</td>
                  <td className="der num">{conSigno(Number(f.r_total), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function MapaMeses({ filas }: { filas: { mes: string; n: number; r_total: number }[] }) {
  const porAnio = new Map<string, Map<number, { n: number; r: number }>>();
  for (const f of filas) {
    const [a, m] = f.mes.split('-');
    if (!porAnio.has(a)) porAnio.set(a, new Map());
    porAnio.get(a)!.set(Number(m), { n: f.n, r: f.r_total });
  }
  const max = Math.max(1e-9, ...filas.map((f) => Math.abs(f.r_total)));
  if (!filas.length) return <p className="tenue">Sin datos.</p>;
  return (
    <div className="tabla-envoltura">
      <table className="mapa-meses">
        <thead>
          <tr>
            <th scope="col">Año</th>
            {MESES.map((m) => (
              <th key={m} scope="col">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...porAnio.entries()].map(([a, meses]) => (
            <tr key={a}>
              <th scope="row" className="num">
                {a}
              </th>
              {MESES.map((_, i) => {
                const x = meses.get(i + 1);
                if (!x) return <td key={i} className="mapa-meses__vacio" />;
                const intensidad = 0.12 + 0.5 * Math.min(1, Math.abs(x.r) / max);
                return (
                  <td
                    key={i}
                    className="num"
                    title={`${MESES[i]} ${a}: ${conSigno(x.r, 2, 'R')} en ${x.n} operaciones`}
                    style={{ background: x.r >= 0 ? `rgb(43 174 149 / ${intensidad})` : `rgb(224 107 74 / ${intensidad})` }}
                  >
                    {conSigno(x.r, 1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaOperaciones({ ops, zona }: { ops: Operacion[]; zona: 'ny' | 'utc' }) {
  const [todas, setTodas] = useState(false);
  const lista = [...ops].reverse();
  const visibles = todas ? lista : lista.slice(0, 25);
  return (
    <Panel
      titulo="Operaciones"
      subtitulo={`${ops.length} operaciones de la muestra, las más recientes primero`}
      acciones={
        ops.length > 25 ? (
          <button type="button" className="boton boton--chico" onClick={() => setTodas((x) => !x)}>
            {todas ? 'Mostrar 25' : `Mostrar las ${ops.length}`}
          </button>
        ) : undefined
      }
      sinRelleno
    >
      <div className="tabla-envoltura tabla-operaciones">
        <table className="tabla">
          <thead>
            <tr>
              <th>Entrada</th>
              <th>Lado</th>
              <th className="der">Precio de entrada</th>
              <th className="der">Stop</th>
              <th>Salida</th>
              <th className="der">Precio de salida</th>
              <th>Motivo</th>
              <th className="der">R</th>
              <th>Muestra</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((o) => (
              <tr key={o.entrada_ms}>
                <td className="num">{fechaHora(o.entrada_ms, zona)}</td>
                <td className={o.lado === 'compra' ? 'tono-pos' : 'tono-neg'}>{o.lado === 'compra' ? '▲ Compra' : '▼ Venta'}</td>
                <td className="der num">{precio(o.precio_entrada)}</td>
                <td className="der num">{precio(o.sl)}</td>
                <td className="num">{fechaHora(o.salida_ms, zona)}</td>
                <td className="der num">{precio(o.precio_salida)}</td>
                <td>{o.motivo === 'TP' ? 'Objetivo' : o.motivo === 'SL' ? 'Stop' : o.motivo}</td>
                <td className={`der num tono-${tono(o.r)}`}>{conSigno(o.r, 2)}</td>
                <td className="tenue">{o.muestra === 'eleccion' ? 'elección' : o.muestra === 'confirmacion' ? 'confirmación' : 'fuera'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
