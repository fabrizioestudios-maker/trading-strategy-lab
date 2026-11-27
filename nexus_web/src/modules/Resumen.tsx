import { useMemo } from 'react';
import { api } from '../api/cliente';
import type { Trabajo } from '../api/contrato.gen';
import { useRecurso } from '../api/recurso';
import { useEspacio, espaciosGuardados } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { describirConfig, EstadoTrabajo, NivelEvidencia, ResumenCorrida } from '../components/Evidencia';
import { Atribucion, GraficoVelas } from '../components/GraficoVelas';
import { Icono } from '../components/iconos';
import { Cargando, ErrorEstado, Insignia, Panel, Vacio } from '../components/ui';
import { conSigno, entero, etiquetaTf, fecha, fechaHora, hace, precio, tono } from '../lib/formato';
import { armarRuta } from '../lib/rutas';

export default function Resumen() {
  const { estado, despachar } = useEspacio();
  const { instrumentos } = useGlobales();
  const simbolo = estado.simbolo;
  const zona = estado.prefs.zona;
  const res = useRecurso((s) => api.resumen(simbolo, s), [simbolo]);
  const ultimo = res.datos?.ultimo_minuto.t;
  const diario = useRecurso((s) => api.cuadro(simbolo, 1440, ultimo!, 160, s), [simbolo, ultimo], !!ultimo);
  const instr = instrumentos.datos?.find((i) => i.simbolo === simbolo);
  const guardados = useMemo(() => espaciosGuardados().slice(0, 4), []);

  if (res.error && !res.datos)
    return (
      <div className="pagina">
        <Cabeza simbolo={simbolo} />
        <ErrorEstado error={res.error} reintentar={res.recargar} />
      </div>
    );
  if (!res.datos)
    return (
      <div className="pagina">
        <Cabeza simbolo={simbolo} />
        <Cargando texto={`Leyendo los datos de ${simbolo}…`} alto={320} />
      </div>
    );

  const r = res.datos;
  const vela = r.ultimo_minuto.vela;
  const d1 = r.ultimas_diarias;
  const cierrePrevio = d1.length > 1 ? d1[d1.length - 2].c : null;
  const variacion = vela && cierrePrevio ? vela.c - cierrePrevio : null;
  const terminada = r.corridas_recientes.find((t: Trabajo) => t.estado === 'terminado' && t.resumen);
  const recientes = estado.recientes.filter((x) => x.simbolo === simbolo).slice(0, 4);

  return (
    <div className="pagina">
      <Cabeza simbolo={simbolo} hasta={r.ultimo_minuto.t} />
      <div className="grilla grilla--principal">
        <div className="apilado">
          <section className="panel instantanea" aria-labelledby="ins-titulo">
            <div className="instantanea__datos">
              <div>
                <p className="instantanea__simbolo" id="ins-titulo">
                  {simbolo} <span className="secundario">{instr?.nombre}</span>
                </p>
                <p className="instantanea__precio num">{vela ? precio(vela.c, instr?.decimales ?? 2) : '—'}</p>
                <p className="num secundario">
                  {variacion !== null && (
                    <span className={`tono-${tono(variacion)}`}>
                      {conSigno(variacion, instr?.decimales ?? 2)} desde el cierre diario anterior
                    </span>
                  )}
                </p>
              </div>
              <dl className="definiciones instantanea__meta">
                <dt>Último minuto</dt>
                <dd className="num">
                  {fechaHora(r.ultimo_minuto.t, 'utc')}
                  <br />
                  <span className="tenue">{fechaHora(r.ultimo_minuto.t, 'ny')}</span>
                </dd>
                <dt>Sesión en ese minuto</dt>
                <dd>{r.sesion_del_ultimo_minuto}</dd>
                <dt>Modo</dt>
                <dd>
                  <Insignia icono="reloj">Histórico, sin feed en vivo</Insignia>
                </dd>
                <dt>Fuente</dt>
                <dd className="secundario">{instr?.fuente ?? '—'}</dd>
              </dl>
            </div>
            <div className="instantanea__grafico">
              {diario.datos ? (
                <GraficoVelas
                  velas={diario.datos.velas}
                  tf={1440}
                  zona={zona}
                  limiteMs={r.ultimo_minuto.t}
                  etiquetaLimite={`Fin de los datos: ${fechaHora(r.ultimo_minuto.t, 'utc')}`}
                  alto={300}
                  etiqueta={`Últimas ${diario.datos.velas.length} velas diarias de ${simbolo}`}
                />
              ) : diario.error ? (
                <ErrorEstado error={diario.error} reintentar={diario.recargar} compacto />
              ) : (
                <Cargando alto={300} />
              )}
              <p className="fila fila--entre instantanea__pie">
                <span className="tenue">Velas diarias (cierre 17:00 NY), {diario.datos ? entero(diario.datos.velas.length) : '—'} sesiones. Precios bid.</span>
                <Atribucion />
              </p>
            </div>
          </section>

          <div className="grilla grilla--2">
            <Panel titulo="Corridas recientes" subtitulo="Investigación ejecutada en este servidor" acciones={<a href="#/laboratorio" className="boton boton--texto">Laboratorio</a>}>
              {r.corridas_recientes.length === 0 ? (
                <Vacio titulo="Todavía no hay corridas" texto="Corré E022 desde el laboratorio: queda guardada con su configuración, procedencia y registro." accion={<a className="boton boton--chico" href="#/laboratorio">Ir al laboratorio</a>} />
              ) : (
                <ul className="lista">
                  {r.corridas_recientes.map((t: Trabajo) => (
                    <li key={t.id} className="fila-actividad">
                      <a href={armarRuta(t.estado === 'terminado' ? 'analitica' : 'laboratorio', { corrida: t.id })}>{describirConfig(t)}</a>
                      <span className="fila">
                        <EstadoTrabajo estado={t.estado} />
                        <span className="tenue">{hace(t.creado_ms)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel titulo="Replays y espacios" subtitulo="Guardados en este navegador">
              {recientes.length === 0 && guardados.length === 0 ? (
                <Vacio titulo="Sin replays recientes" texto="Abrí el replay: NEXUS recuerda dónde quedaste en cada instrumento y temporalidad." accion={<a className="boton boton--chico" href="#/replay">Abrir el replay</a>} />
              ) : (
                <ul className="lista">
                  {recientes.map((x) => (
                    <li key={`${x.simbolo}-${x.tf}`} className="fila-actividad">
                      <a href={armarRuta('replay', { s: x.simbolo, tf: x.tf, t: x.limiteMs })}>
                        Replay {x.simbolo} {etiquetaTf(x.tf)}, límite {fechaHora(x.limiteMs, zona)}
                      </a>
                      <span className="tenue">{hace(x.visto_ms)}</span>
                    </li>
                  ))}
                  {guardados.map((g) => (
                    <li key={g.nombre} className="fila-actividad">
                      <button type="button" className="enlace" onClick={() => despachar({ tipo: 'cargar', estado: g.estado })}>
                        Espacio «{g.nombre}»
                      </button>
                      <span className="tenue">guardado {fecha(g.guardado_ms, zona)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="apilado">
          <Panel titulo="Candidata en estudio" acciones={<NivelEvidencia nivel={r.candidata.nivel} texto={r.candidata.nivel_texto} />}>
            <p className="candidata__nombre">{r.candidata.nombre}</p>
            <p className="secundario candidata__hipotesis">{r.candidata.hipotesis}</p>
            <div className="candidata__cifra">
              {terminada ? (
                <>
                  <p className="tenue">Última corrida en este servidor</p>
                  <ResumenCorrida t={terminada} />
                </>
              ) : (
                <>
                  <p className="tenue">Documentado en el registro (no recalculado acá)</p>
                  <ul className="lista-evidencia">
                    {r.candidata.evidencia.slice(0, 3).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <p className="nota nota--aviso">
              <Icono nombre="alerta" />
              <span>{r.candidata.nivel_texto}</span>
            </p>
            <div className="fila separado">
              <a className="boton boton--chico" href={armarRuta('laboratorio', { estrategia: r.candidata.id })}>
                Ver definición y correr
              </a>
              <a className="boton boton--chico" href="#/replay">
                Ver en el replay
              </a>
            </div>
          </Panel>

          <Panel titulo="Pruebas a futuro" subtitulo="Selladas: las reglas no se tocan hasta decidir">
            <ul className="lista">
              {r.pruebas_a_futuro.map((f) => {
                const x = f as { id: string; sellado_utc?: string; inicio_utc?: string; decision?: string; variantes?: Record<string, unknown> };
                return (
                  <li key={x.id} className="prueba-futuro">
                    <div className="fila fila--entre">
                      <strong>{x.id}</strong>
                      <Insignia icono="candado">Sellada {x.sellado_utc?.slice(0, 10)}</Insignia>
                    </div>
                    <p className="secundario">
                      Variantes: {Object.keys(x.variantes ?? {}).join(', ') || '—'}. Empieza {x.inicio_utc} UTC.
                    </p>
                    <p className="tenue">{x.decision}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel titulo="Registro de hipótesis" acciones={<a href={armarRuta('laboratorio', { vista: 'hipotesis' })} className="boton boton--texto">Ver todas</a>}>
            <div className="conteos">
              {Object.entries(r.hipotesis_por_estado)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <div key={k} className="conteo">
                    <span className="conteo__n num">{n}</span>
                    <span className="conteo__k">{k}</span>
                  </div>
                ))}
            </div>
            <p className="campo__ayuda separado">Fallidas y exitosas se muestran igual: un resultado negativo también es evidencia.</p>
          </Panel>
        </div>
      </div>
      <section className="siguientes" aria-label="Próximos pasos">
        <a className="siguiente" href="#/replay">
          <Icono nombre="replay" tam={18} />
          <span>
            <strong>Reproducir el mercado</strong>
            <small>Avanzá vela por vela sin ver el futuro</small>
          </span>
        </a>
        <a className="siguiente" href="#/laboratorio">
          <Icono nombre="laboratorio" tam={18} />
          <span>
            <strong>Correr una investigación</strong>
            <small>Configuración inmutable y procedencia</small>
          </span>
        </a>
        <a className="siguiente" href="#/analitica">
          <Icono nombre="analitica" tam={18} />
          <span>
            <strong>Revisar la evidencia</strong>
            <small>Métricas con muestra, período y costos</small>
          </span>
        </a>
        <a className="siguiente" href="#/datos">
          <Icono nombre="datos" tam={18} />
          <span>
            <strong>Controlar los datos</strong>
            <small>Cobertura, huecos y procedencia</small>
          </span>
        </a>
      </section>
    </div>
  );
}

function Cabeza({ simbolo, hasta }: { simbolo: string; hasta?: number }) {
  return (
    <header className="pagina__cabeza">
      <div>
        <h1>Resumen</h1>
        <p>
          {simbolo} con datos históricos{hasta ? ` hasta el ${fechaHora(hasta, 'utc')}` : ''}. No hay feed en vivo: ningún número de esta pantalla es de hoy.
        </p>
      </div>
      <div className="pagina__acciones">
        <a className="boton" href="#/replay">
          <Icono nombre="replay" />
          Abrir el replay
        </a>
        <a className="boton boton--primario" href={armarRuta('laboratorio', { estrategia: 'e022' })}>
          <Icono nombre="laboratorio" />
          Correr E022
        </a>
      </div>
    </header>
  );
}
