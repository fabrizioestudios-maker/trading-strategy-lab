import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/cliente';
import type { ConfigCorrida_Input, Estrategia, Hipotesis, Trabajo } from '../api/contrato.gen';
import { useRecurso } from '../api/recurso';
import { useAvisos } from '../app/avisos';
import { useRegistrarComandos } from '../app/comandos';
import { useGlobales } from '../app/globales';
import { useRuta } from '../app/ruta';
import { describirConfig, EstadoTrabajo, NOMBRE_PERFIL, NivelEvidencia, ResumenCorrida } from '../components/Evidencia';
import { Icono } from '../components/iconos';
import { Boton, Campo, Cargando, Dialogo, ErrorEstado, Insignia, Panel, Pestanas, Segmentado, Vacio, copiarTexto } from '../components/ui';
import { filtrar } from '../lib/buscar';
import { duracion, fechaHora, hace, huellaCorta } from '../lib/formato';
import { armarRuta } from '../lib/rutas';

type Vista = 'estrategias' | 'corridas' | 'hipotesis' | 'presupuesto';
const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'estrategias', etiqueta: 'Estrategias' },
  { id: 'corridas', etiqueta: 'Corridas' },
  { id: 'hipotesis', etiqueta: 'Hipótesis registradas' },
  { id: 'presupuesto', etiqueta: 'Presupuesto de pruebas' },
];

export default function Laboratorio({ params }: { params: Record<string, string> }) {
  const { ir } = useRuta();
  const vista: Vista = (VISTAS.some((v) => v.id === params.vista) ? params.vista : params.corrida ? 'corridas' : 'estrategias') as Vista;
  const cambiarVista = (v: Vista) => ir('laboratorio', { vista: v });
  const [confirmar, setConfirmar] = useState<ConfigCorrida_Input | null>(null);
  const { avisar } = useAvisos();
  const [enviando, setEnviando] = useState(false);

  useRegistrarComandos(
    'laboratorio',
    useMemo(
      () => [
        ...VISTAS.map((v) => ({ id: `lab-${v.id}`, titulo: `Laboratorio: ${v.etiqueta}`, grupo: 'Laboratorio', ejecutar: () => ir('laboratorio', { vista: v.id }) })),
        { id: 'lab-correr', titulo: 'Correr E022 (perfil base, entrada 18:15)…', grupo: 'Laboratorio', palabras: 'run backtest', ejecutar: () => setConfirmar({ estrategia: 'e022', entrada: '18:15', perfil_costos: 'base' }) },
      ],
      [ir],
    ),
  );

  const enviar = async (cfg: ConfigCorrida_Input) => {
    setEnviando(true);
    try {
      const t = await api.enviar(cfg);
      setConfirmar(null);
      avisar({ texto: t.estado === 'terminado' ? 'Ya había una corrida idéntica (mismo código y datos): se muestra esa.' : 'Corrida enviada. Las etapas aparecen en el registro.' });
      ir('laboratorio', { vista: 'corridas', corrida: t.id });
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo enviar la corrida', tono: 'error' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Laboratorio</h1>
          <p>Estrategias registradas, hipótesis y corridas reproducibles. Los parámetros y los períodos son los del registro: desde acá no se optimiza nada.</p>
        </div>
      </header>
      <div className="lab__pestanas">
        <Pestanas idBase="lab" etiqueta="Vistas del laboratorio" pestanas={VISTAS} activa={vista} onCambio={cambiarVista} />
      </div>
      <div role="tabpanel" id={`lab-panel-${vista}`} aria-labelledby={`lab-pestana-${vista}`} className="separado">
        {vista === 'estrategias' && <VistaEstrategias seleccion={params.estrategia} onCorrer={setConfirmar} />}
        {vista === 'corridas' && <VistaCorridas seleccion={params.corrida} onReintentar={(c) => setConfirmar(c)} />}
        {vista === 'hipotesis' && <VistaHipotesis />}
        {vista === 'presupuesto' && <VistaPresupuesto />}
      </div>
      <ConfirmarCorrida cfg={confirmar} onCerrar={() => setConfirmar(null)} onConfirmar={enviar} enviando={enviando} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ estrategias */
function VistaEstrategias({ seleccion, onCorrer }: { seleccion?: string; onCorrer: (c: ConfigCorrida_Input) => void }) {
  const est = useRecurso((s) => api.estrategias(s), []);
  const { ir } = useRuta();
  if (est.error) return <ErrorEstado error={est.error} reintentar={est.recargar} />;
  if (!est.datos) return <Cargando />;
  const elegida = est.datos.find((e) => e.id === seleccion) ?? est.datos[0];
  return (
    <div className="grilla grilla--lateral">
      <Panel titulo="Catálogo" subtitulo={`${est.datos.length} estrategias con evidencia documentada`} sinRelleno>
        <ul className="lista catalogo" role="listbox" aria-label="Estrategias">
          {est.datos.map((e) => (
            <li key={e.id}>
              <button type="button" role="option" aria-selected={e.id === elegida.id} className="catalogo__item" onClick={() => ir('laboratorio', { vista: 'estrategias', estrategia: e.id })}>
                <span className="catalogo__nombre">{e.nombre}</span>
                <span className="fila">
                  <Insignia tono={e.nivel === 'B' ? 'identidad' : 'neutro'} titulo={e.nivel_texto}>
                    Nivel {e.nivel}
                  </Insignia>
                  {e.ejecutable ? <Insignia tono="activo">Se puede correr</Insignia> : <Insignia>Solo registro</Insignia>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <DetalleEstrategia e={elegida} onCorrer={onCorrer} />
    </div>
  );
}

function DetalleEstrategia({ e, onCorrer }: { e: Estrategia; onCorrer: (c: ConfigCorrida_Input) => void }) {
  const { referencias } = useGlobales();
  const [entrada, setEntrada] = useState<'18:15' | 'reapertura'>('18:15');
  const [perfil, setPerfil] = useState<ConfigCorrida_Input['perfil_costos']>('base');
  const perfiles = referencias.datos?.perfiles_costos ?? [];
  return (
    <div className="apilado">
      <Panel titulo={e.nombre} subtitulo={`${e.id.toUpperCase()} versión ${e.version}. ${e.temporalidad}.`} acciones={<NivelEvidencia nivel={e.nivel} texto={e.nivel_texto} />}>
        <p className="estrategia__hipotesis">{e.hipotesis}</p>
        <p className="nota nota--aviso separado">
          <Icono nombre="alerta" />
          <span>{e.nivel_texto}</span>
        </p>
        <section className="separado">
          <h3 className="subtitulo">Parámetros registrados</h3>
          {e.parametros.length ? (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Parámetro</th>
                    <th className="der">Valor</th>
                    <th>Definición</th>
                  </tr>
                </thead>
                <tbody>
                  {e.parametros.map((p) => (
                    <tr key={p.clave}>
                      <td>{p.nombre}</td>
                      <td className="der num">
                        {String(p.valor)} {p.unidad ?? ''}
                      </td>
                      <td className="secundario">{p.definicion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="tenue">Sin parámetros cargados en el catálogo.</p>
          )}
        </section>
        <div className="grilla grilla--3 separado">
          <section>
            <h3 className="subtitulo">Reglas</h3>
            <ol className="reglas">
              {e.reglas.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="subtitulo">Evidencia</h3>
            <ul className="lista-evidencia">
              {e.evidencia.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="subtitulo">Limitaciones</h3>
            <ul className="lista-evidencia">
              {e.limitaciones.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        </div>
        <p className="campo__ayuda separado">Fuentes: {e.fuentes.join(', ')}</p>
      </Panel>

      <Panel titulo="Correr" subtitulo={e.ejecutable ? 'Configuración inmutable: lo que se envía queda guardado con la corrida' : undefined}>
        {!e.ejecutable ? (
          <Vacio
            icono="candado"
            titulo="Esta estrategia no se puede correr desde NEXUS"
            texto="Su evidencia está en el registro del laboratorio. Para correrla hace falta adaptarla al motor de trabajos (está en el plan, no implementado)."
          />
        ) : (
          <form
            className="apilado"
            onSubmit={(ev) => {
              ev.preventDefault();
              onCorrer({ estrategia: 'e022', version: '1.0', entrada, perfil_costos: perfil });
            }}
          >
            <div className="formulario">
              <Campo etiqueta="Entrada" ayuda={entrada === '18:15' ? 'La registrada (E042).' : 'Variante de comparación: bid deprimido (E041).'}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} className="selector" value={entrada} onChange={(x) => setEntrada(x.target.value as '18:15' | 'reapertura')}>
                    <option value="18:15">18:15 NY (registrada)</option>
                    <option value="reapertura">En la reapertura</option>
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Perfil de costos" ayuda={perfiles.find((p) => p.clave === perfil)?.descripcion}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} className="selector" value={perfil} onChange={(x) => setPerfil(x.target.value as ConfigCorrida_Input['perfil_costos'])}>
                    {(perfiles.length ? perfiles.map((p) => p.clave) : Object.keys(NOMBRE_PERFIL)).map((k) => (
                      <option key={k} value={k}>
                        {NOMBRE_PERFIL[k] ?? k}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            </div>
            <div className="periodos" aria-label="Períodos fijados por el registro">
              <div className="periodo">
                <Icono nombre="candado" tam={14} />
                <span>
                  <strong>Elección</strong> 2011-11-15 → 2021-11-15
                </span>
              </div>
              <div className="periodo">
                <Icono nombre="candado" tam={14} />
                <span>
                  <strong>Confirmación</strong> 2021-11-15 → 2026-11-14
                </span>
              </div>
              <p className="campo__ayuda">Fijados por el registro. La confirmación ya se miró al armar el ranking de E019: no es un holdout limpio.</p>
            </div>
            <div>
              <Boton type="submit" variante="primario" icono="play">
                Revisar y correr
              </Boton>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}

function ConfirmarCorrida({ cfg, onCerrar, onConfirmar, enviando }: { cfg: ConfigCorrida_Input | null; onCerrar: () => void; onConfirmar: (c: ConfigCorrida_Input) => void; enviando: boolean }) {
  return (
    <Dialogo
      abierto={!!cfg}
      titulo="Correr E022"
      descripcion="Se simula cada operación minuto a minuto con el motor del laboratorio (SL primero) sobre 2011–2026 y se calculan las métricas por muestra. Tarda unos segundos; podés cancelarla mientras espera o corre."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Volver</Boton>
          <Boton variante="primario" icono="play" cargando={enviando} onClick={() => cfg && onConfirmar(cfg)} data-autofoco>
            Correr ahora
          </Boton>
        </>
      }
    >
      {cfg && (
        <dl className="definiciones">
          <dt>Estrategia</dt>
          <dd>E022 versión {cfg.version ?? '1.0'} (parámetros del registro)</dd>
          <dt>Entrada</dt>
          <dd>{cfg.entrada === 'reapertura' ? 'En la reapertura' : '18:15 NY'}</dd>
          <dt>Costos</dt>
          <dd>{NOMBRE_PERFIL[cfg.perfil_costos ?? 'base']}</dd>
          <dt>Elección</dt>
          <dd>2011-11-15 → 2021-11-15</dd>
          <dt>Confirmación</dt>
          <dd>2021-11-15 → 2026-11-14</dd>
          <dt>Si ya existe</dt>
          <dd>Una corrida idéntica (misma configuración, código y datos) no se repite: se muestra la existente.</dd>
        </dl>
      )}
    </Dialogo>
  );
}

/* ------------------------------------------------------------------------------------------------ corridas */
function VistaCorridas({ seleccion, onReintentar }: { seleccion?: string; onReintentar: (c: ConfigCorrida_Input) => void }) {
  const { ir } = useRuta();
  const lista = useRecurso((s) => api.trabajos(s), []);
  const activo = lista.datos?.some((t) => ['enviado', 'en_cola', 'corriendo'].includes(t.estado));
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(lista.recargar, 1500);
    return () => clearInterval(t);
  }, [activo, lista.recargar]);
  if (lista.error && !lista.datos) return <ErrorEstado error={lista.error} reintentar={lista.recargar} />;
  if (!lista.datos) return <Cargando />;
  if (!lista.datos.length)
    return (
      <Vacio
        titulo="Todavía no hay corridas en este servidor"
        texto="Cada corrida guarda su configuración, el commit, las huellas del código y de los datos, y el registro de etapas."
        accion={
          <Boton variante="primario" icono="play" onClick={() => onReintentar({ estrategia: 'e022', entrada: '18:15', perfil_costos: 'base' })}>
            Correr E022
          </Boton>
        }
      />
    );
  const id = seleccion ?? lista.datos[0].id;
  return (
    <div className="grilla grilla--lateral">
      <Panel titulo="Corridas" subtitulo="Las más nuevas primero" sinRelleno>
        <ul className="lista catalogo" role="listbox" aria-label="Corridas">
          {lista.datos.map((t) => (
            <li key={t.id}>
              <button type="button" role="option" aria-selected={t.id === id} className="catalogo__item" onClick={() => ir('laboratorio', { vista: 'corridas', corrida: t.id })}>
                <span className="catalogo__nombre">{describirConfig(t)}</span>
                <span className="fila">
                  <EstadoTrabajo estado={t.estado} />
                  <span className="tenue">{hace(t.creado_ms)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <DetalleCorrida id={id} onCambio={lista.recargar} onReintentar={onReintentar} />
    </div>
  );
}

function DetalleCorrida({ id, onCambio, onReintentar }: { id: string; onCambio: () => void; onReintentar: (c: ConfigCorrida_Input) => void }) {
  const t = useRecurso((s) => api.trabajo(id, s), [id]);
  const { avisar } = useAvisos();
  const vivo = t.datos && ['enviado', 'en_cola', 'corriendo'].includes(t.datos.estado);
  useEffect(() => {
    if (!vivo) return;
    const x = setInterval(t.recargar, 800);
    return () => clearInterval(x);
  }, [vivo, t.recargar]);
  useEffect(() => {
    if (t.datos && !vivo) onCambio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.datos?.estado]);
  if (t.error && !t.datos) return <ErrorEstado error={t.error} reintentar={t.recargar} />;
  if (!t.datos || t.datos.id !== id) return <Cargando />;
  const tr: Trabajo = t.datos;
  const cancelar = async () => {
    try {
      await api.cancelar(tr.id);
      t.recargar();
      avisar({ texto: 'Se pidió cancelar la corrida.' });
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo cancelar', tono: 'error' });
    }
  };
  const p = tr.procedencia as Record<string, unknown>;
  return (
    <div className="apilado">
      <Panel
        titulo={describirConfig(tr)}
        subtitulo={`Corrida ${tr.id}`}
        acciones={
          <>
            <EstadoTrabajo estado={tr.estado} />
            {vivo && (
              <Boton chico variante="peligro" onClick={cancelar}>
                Cancelar
              </Boton>
            )}
            {(tr.estado === 'fallido' || tr.estado === 'cancelado') && (
              <Boton chico icono="reiniciar" onClick={() => onReintentar({ ...tr.config })}>
                Reintentar
              </Boton>
            )}
            {tr.estado === 'terminado' && (
              <a className="boton boton--chico boton--primario" href={armarRuta('analitica', { corrida: tr.id })}>
                Ver resultados
              </a>
            )}
          </>
        }
      >
        {tr.estado === 'terminado' && <ResumenCorrida t={{ ...tr, resumen: resumenDe(tr) }} />}
        {tr.error && (
          <p className="nota nota--aviso" role="alert">
            <Icono nombre="alerta" />
            <span>{tr.error}</span>
          </p>
        )}
        <h3 className="subtitulo separado">Registro</h3>
        <ol className="lista registro" aria-live="polite">
          {tr.registro.map((x, i) => {
            const ev = x as { t_ms?: number; t?: number; texto?: string; mensaje?: string; etapa?: string };
            const ms = ev.t_ms ?? ev.t ?? 0;
            const previo = i > 0 ? ((tr.registro[i - 1] as { t_ms?: number; t?: number }).t_ms ?? (tr.registro[i - 1] as { t?: number }).t ?? ms) : ms;
            return (
              <li key={i}>
                <time className="num tenue">{fechaHora(ms, 'utc')}</time>
                <span>{ev.texto ?? ev.mensaje ?? ev.etapa ?? JSON.stringify(x)}</span>
                <span className="num tenue">{i > 0 ? `+${duracion(ms - previo)}` : ''}</span>
              </li>
            );
          })}
          {vivo && (
            <li>
              <span className="giro" aria-hidden="true" />
              <span>{tr.etapa ?? 'Esperando…'}</span>
              <span />
            </li>
          )}
        </ol>
      </Panel>
      <Panel titulo="Configuración y procedencia" subtitulo="Lo necesario para reproducir esta corrida">
        <dl className="definiciones">
          <dt>Entrada</dt>
          <dd>{tr.config.entrada}</dd>
          <dt>Costos</dt>
          <dd>{NOMBRE_PERFIL[tr.config.perfil_costos]}</dd>
          <dt>Elección</dt>
          <dd>
            {tr.config.eleccion_desde} → {tr.config.eleccion_hasta}
          </dd>
          <dt>Confirmación</dt>
          <dd>
            {tr.config.confirmacion_desde} → {tr.config.confirmacion_hasta}
          </dd>
          {Object.entries(p).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k.replaceAll('_', ' ')}</dt>
              <dd className="num">
                {v && typeof v === 'object' ? (
                  <details>
                    <summary>{Object.keys(v as object).length} archivos con su huella</summary>
                    <ul className="lista-avisos">
                      {Object.entries(v as Record<string, unknown>).map(([a, h]) => (
                        <li key={a}>
                          {a} <span className="tenue">{huellaCorta(String(h), 12)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <button type="button" className="enlace" title="Copiar" onClick={() => void copiarTexto(String(v ?? ''))}>
                    {String(v ?? '—').length > 20 ? huellaCorta(String(v), 16) : String(v ?? '—')}
                  </button>
                )}
              </dd>
            </div>
          ))}
          <dt>Huella de la configuración</dt>
          <dd className="num">{huellaCorta(tr.huella_config, 16)}</dd>
          <dt>Creada</dt>
          <dd className="num">{fechaHora(tr.creado_ms, 'utc')}</dd>
          <dt>Duración</dt>
          <dd className="num">{duracion(tr.actualizado_ms - tr.creado_ms)}</dd>
        </dl>
      </Panel>
    </div>
  );
}

function resumenDe(t: Trabajo) {
  const m = t.resultado?.metricas?.total;
  if (!m) return null;
  const v = (k: string) => m.find((x) => x.clave === k);
  const e = v('expectancy');
  return { n: e?.n, expectativa: e?.valor, ic_lo: v('ic_lo')?.valor, ic_hi: v('ic_hi')?.valor, acierto: v('wr')?.valor, periodo: e?.periodo, perfil_costos: e?.perfil_costos };
}

/* ------------------------------------------------------------------------------------------------ hipótesis */
function VistaHipotesis() {
  const h = useRecurso((s) => api.hipotesis(s), []);
  const [estado, setEstado] = useState<'todas' | Hipotesis['estado']>('todas');
  const [consulta, setConsulta] = useState('');
  if (h.error) return <ErrorEstado error={h.error} reintentar={h.recargar} />;
  if (!h.datos) return <Cargando />;
  const conteo = (k: string) => h.datos!.filter((x) => k === 'todas' || x.estado === k).length;
  const lista = filtrar(
    h.datos.filter((x) => estado === 'todas' || x.estado === estado),
    consulta,
    (x) => `${x.id} ${x.titulo} ${x.resumen}`,
  );
  const tonoEstado = { pasa: 'pos', falla: 'neg', informativo: 'neutro', pendiente: 'aviso', registrado: 'neutro' } as const;
  return (
    <Panel
      titulo="Registro de hipótesis"
      subtitulo="registro/experimentos/*.json: lo que pasó y lo que falló, con su fuente"
      acciones={
        <>
          <Segmentado
            chico
            etiqueta="Filtrar por estado"
            valor={estado}
            onCambio={setEstado}
            opciones={(['todas', 'pasa', 'falla', 'informativo', 'pendiente'] as const).map((k) => ({ valor: k, etiqueta: `${k[0].toUpperCase()}${k.slice(1)} ${conteo(k)}` }))}
          />
          <input className="entrada selector--chico" type="search" placeholder="Buscar" aria-label="Buscar hipótesis" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
        </>
      }
      sinRelleno
    >
      {lista.length === 0 ? (
        <Vacio titulo="Ninguna hipótesis coincide con el filtro" />
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Experimento</th>
                <th>Título</th>
                <th>Fecha</th>
                <th>Resultado</th>
                <th>Resumen</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id}>
                  <td className="num">{x.id}</td>
                  <td className="envuelve">{x.titulo}</td>
                  <td className="num tenue">{x.fecha ?? '—'}</td>
                  <td>
                    <Insignia tono={tonoEstado[x.estado]}>{x.estado}</Insignia>
                  </td>
                  <td className="envuelve secundario">{x.resumen}</td>
                  <td className="tenue">{x.fuente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------------------ presupuesto */
function VistaPresupuesto() {
  const c = useRecurso((s) => api.contexto(s), []);
  if (c.error) return <ErrorEstado error={c.error} reintentar={c.recargar} />;
  if (!c.datos) return <Cargando />;
  return (
    <div className="apilado">
      <p className="nota nota--aviso">
        <Icono nombre="alerta" />
        <span>
          Se probaron {c.datos.total_configuraciones ?? 'muchas'} configuraciones en total. Con tantas pruebas, una buena cifra aparece por azar: por eso ninguna
          regla sobrevivió las correcciones por pruebas múltiples (E031) y la candidata necesita un período limpio.
        </span>
      </p>
      <Panel titulo="Presupuesto de pruebas" subtitulo="registro/presupuesto_pruebas.csv" sinRelleno>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Experimentos</th>
                <th>Familia</th>
                <th className="der">Configuraciones</th>
                <th>Período de búsqueda</th>
                <th>Uso de la validación</th>
                <th>Fuente del número</th>
              </tr>
            </thead>
            <tbody>
              {c.datos.presupuesto_pruebas.map((f, i) => {
                const x = f as Record<string, string>;
                return (
                  <tr key={i}>
                    <td className="num">{x.experimento}</td>
                    <td className="envuelve">{x.familia}</td>
                    <td className="der num">{x.configuraciones}</td>
                    <td className="num">{x.periodo_de_busqueda}</td>
                    <td className="envuelve secundario">{x.uso_de_datos_de_validacion}</td>
                    <td className="envuelve tenue">{x.fuente_del_numero}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <strong>Total</strong>
                </td>
                <td className="der num">
                  <strong>{c.datos.total_configuraciones ?? '—'}</strong>
                </td>
                <td colSpan={3} className="tenue">
                  ≈ indica un conteo aproximado del propio registro
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
      <Panel titulo="Pruebas a futuro selladas" subtitulo="La decisión se toma con datos que todavía no existían al sellarlas">
        <ul className="lista">
          {c.datos.pruebas_a_futuro.map((f) => {
            const x = f as { id: string; sellado_utc?: string; inicio_utc?: string; decision?: string; variantes?: Record<string, { reglas?: string }> };
            return (
              <li key={x.id} className="prueba-futuro">
                <div className="fila fila--entre">
                  <strong>{x.id}</strong>
                  <Insignia icono="candado">
                    Sellada {x.sellado_utc} UTC, empieza {x.inicio_utc}
                  </Insignia>
                </div>
                <p className="secundario">{x.decision}</p>
                {Object.entries(x.variantes ?? {}).map(([k, v]) => (
                  <p key={k} className="tenue">
                    <strong className="secundario">{k}:</strong> {v.reglas}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
