import { useEffect, useMemo, useState } from 'react';
import { api, ESTATICO } from '../api/cliente';
import type { FichaMercado, Trabajo } from '../api/contrato.gen';
import { useRecurso } from '../api/recurso';
import { espaciosGuardados, useEspacio } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { useRuta } from '../app/ruta';
import { SelectorInstrumento } from '../components/CabeceraMercado';
import { describirConfig, EstadoTrabajo, NivelEvidencia, ResumenCorrida } from '../components/Evidencia';
import { Atribucion, GraficoVelas } from '../components/GraficoVelas';
import { Icono } from '../components/iconos';
import { Minigrafico } from '../components/Minigrafico';
import { Cargando, ErrorEstado, Info, Insignia, Panel, Vacio, type Tono } from '../components/ui';
import { conSigno, entero, etiquetaTf, fecha, fechaHora, hace, porcentaje, precio, tono } from '../lib/formato';
import { armarRuta } from '../lib/rutas';

const DESTACADOS = ['XAUUSD', 'EURUSD', 'USDJPY', 'SPXUSD'];

/** Fichas de mercado de varios instrumentos, en paralelo; cada una aparece cuando llega. */
function useFichas(simbolos: string[]) {
  const [fichas, setFichas] = useState<Record<string, FichaMercado | Error>>({});
  const clave = simbolos.join(',');
  useEffect(() => {
    const ctl = new AbortController();
    for (const s of simbolos)
      api
        .mercado(s, ctl.signal)
        .then((f) => !ctl.signal.aborted && setFichas((x) => ({ ...x, [s]: f })))
        .catch((e) => !ctl.signal.aborted && setFichas((x) => ({ ...x, [s]: e instanceof Error ? e : new Error(String(e)) })));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return fichas;
}

function EstadoMercado() {
  // en la versión publicada el horario quedaría congelado en el momento de la grabación: no se muestra
  if (ESTATICO) return null;
  return <EstadoMercadoVivo />;
}

function EstadoMercadoVivo() {
  const h = useRecurso((s) => api.horario(s), []);
  useEffect(() => {
    const t = setInterval(h.recargar, 30_000);
    return () => clearInterval(t);
  }, [h.recargar]);
  if (!h.datos) return null;
  return (
    <span className={`estado-mercado${h.datos.abierto ? ' es-abierto' : ''}`} title={h.datos.nota} role="status">
      <span className="estado-mercado__punto" aria-hidden="true" />
      Oro {h.datos.texto.charAt(0).toLowerCase() + h.datos.texto.slice(1)}
    </span>
  );
}

const TONO_SESGO: Record<FichaMercado['sesgo'], Tono> = { alcista: 'identidad', bajista: 'neg', neutral: 'neutro' };

function TarjetaMercado({ simbolo, f }: { simbolo: string; f: FichaMercado | Error | undefined }) {
  const { despachar } = useEspacio();
  const { ir } = useRuta();
  if (!f)
    return (
      <article className="tarjeta-mercado es-cargando" aria-busy="true" aria-label={`${simbolo}: cargando`}>
        <strong>{simbolo}</strong>
        <span className="tarjeta-mercado__esqueleto" />
        <span className="tarjeta-mercado__esqueleto tarjeta-mercado__esqueleto--corto" />
      </article>
    );
  if (f instanceof Error)
    return (
      <article className="tarjeta-mercado">
        <strong>{simbolo}</strong>
        <p className="tenue">Sin datos en este servidor.</p>
      </article>
    );
  // el tono sale del porcentaje que se muestra: un 0,00 % no lleva flecha
  const t = tono(Math.round((f.cambio_pct ?? 0) * 100) / 100);
  const abrir = () => {
    despachar({ tipo: 'simbolo', simbolo: f.simbolo });
    ir('replay');
  };
  return (
    <article className="tarjeta-mercado" aria-labelledby={`tm-${f.simbolo}`}>
      <header className="tarjeta-mercado__cabeza">
        <div>
          <h2 id={`tm-${f.simbolo}`}>{f.simbolo}</h2>
          <span className="tenue">{f.nombre}</span>
        </div>
        <Insignia tono={TONO_SESGO[f.sesgo]} icono={f.sesgo === 'alcista' ? 'sube' : f.sesgo === 'bajista' ? 'baja' : 'guion'} titulo={f.nota}>
          {f.sesgo.charAt(0).toUpperCase() + f.sesgo.slice(1)}
        </Insignia>
      </header>
      <div className="tarjeta-mercado__barra-cab">
        <span>
          Rango de 52 semanas
          <Info etiqueta="Qué es el rango de 52 semanas" texto="Dónde está el último cierre entre el mínimo (0 %) y el máximo (100 %) de las últimas 252 velas diarias." />
        </span>
        <span className="num">{porcentaje(f.posicion_rango_pct, 0)}</span>
      </div>
      <div className="barra-progreso" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.posicion_rango_pct ?? 0} aria-label="Posición en el rango de 52 semanas">
        <span style={{ width: `${Math.max(2, Math.min(100, f.posicion_rango_pct ?? 0))}%` }} />
      </div>
      <p className="tarjeta-mercado__texto">{f.texto}</p>
      <div className="tarjeta-mercado__pie">
        <div>
          <span className="tarjeta-mercado__precio num">{precio(f.ultimo, f.decimales)}</span>
          <span className={`num tono-${t === 'pos' ? 'alza' : t === 'neg' ? 'baja' : 'neutro'}`}>
            {t === 'pos' ? '▲' : t === 'neg' ? '▼' : ''} {conSigno(f.cambio_pct, 2)} %
          </span>
        </div>
        <Minigrafico valores={f.cierres} tono={f.sesgo === 'alcista' ? 'alza' : f.sesgo === 'bajista' ? 'baja' : 'neutro'} />
      </div>
      <footer className="tarjeta-mercado__base">
        <span className="tenue">Último dato {fecha(f.ultimo_ms, 'utc')}, histórico</span>
        <button type="button" className="boton boton--texto boton--chico" onClick={abrir}>
          Abrir en el replay
        </button>
      </footer>
    </article>
  );
}

function CintaMercados({ simbolos, fichas }: { simbolos: string[]; fichas: Record<string, FichaMercado | Error> }) {
  return (
    <section className="cinta" aria-label="Precios de cierre de todos los instrumentos (históricos)">
      {simbolos.map((s, i) => {
        const f = fichas[s];
        const ok = f && !(f instanceof Error) ? f : null;
        const t = tono(Math.round((ok?.cambio_pct ?? 0) * 100) / 100);
        return (
          <div key={s} className="cinta__item">
            <span className="cinta__n num">{i + 1}</span>
            <strong>{s}</strong>
            <span className="cinta__nombre tenue">{ok?.nombre ?? ''}</span>
            <span className="num">{ok ? precio(ok.ultimo, ok.decimales) : f instanceof Error ? 'sin datos' : '…'}</span>
            {ok && (
              <span className={`num tono-${t === 'pos' ? 'alza' : t === 'neg' ? 'baja' : 'neutro'}`}>
                {t === 'pos' ? '▲' : t === 'neg' ? '▼' : ''} {conSigno(ok.cambio_pct, 2)} %
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default function Resumen() {
  const { estado, despachar } = useEspacio();
  const { instrumentos } = useGlobales();
  const simbolo = estado.simbolo;
  const zona = estado.prefs.zona;
  const disponibles = useMemo(() => (instrumentos.datos ?? []).filter((i) => i.disponible).map((i) => i.simbolo), [instrumentos.datos]);
  const destacados = DESTACADOS.filter((s) => disponibles.includes(s));
  const fichas = useFichas(disponibles);
  const res = useRecurso((s) => api.resumen(simbolo, s), [simbolo]);
  const ultimo = res.datos?.ultimo_minuto.t;
  const diario = useRecurso((s) => api.cuadro(simbolo, 1440, ultimo!, 160, s), [simbolo, ultimo], !!ultimo);
  const guardados = useMemo(() => espaciosGuardados().slice(0, 3), []);
  const ahora = useReloj();

  const cabeza = (
    <header className="pagina__cabeza resumen__cabeza">
      <div>
        <p className="resumen__fecha num">{fechaHora(ahora, 'ny')}</p>
        <h1>Resumen</h1>
        <p>Precios históricos (no hay feed en vivo): cada tarjeta dice hasta cuándo llegan sus datos. Solo el horario del mercado es de ahora.</p>
      </div>
      <div className="pagina__acciones">
        <EstadoMercado />
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

  const r = res.datos;
  const terminada = r?.corridas_recientes.find((t: Trabajo) => t.estado === 'terminado' && t.resumen);
  const recientes = estado.recientes.slice(0, 4);

  return (
    <div className="pagina pagina--resumen">
      {cabeza}
      <div className="resumen__superior">
        <div className="tarjetas-mercado">
          {instrumentos.error && !instrumentos.datos ? (
            <ErrorEstado error={instrumentos.error} reintentar={instrumentos.recargar} />
          ) : !instrumentos.datos ? (
            <Cargando />
          ) : destacados.length === 0 ? (
            <Vacio titulo="No hay datos de mercado en este servidor" texto="Cargá los datos en data/ (ver Centro de datos)." />
          ) : (
            destacados.map((s) => <TarjetaMercado key={s} simbolo={s} f={fichas[s]} />)
          )}
        </div>
        <aside className="panel lab-lateral" aria-labelledby="lab-lat">
          <header className="lab-lateral__cabeza">
            <h2 id="lab-lat">
              <Icono nombre="laboratorio" /> Laboratorio
            </h2>
            {r && <NivelEvidencia nivel={r.candidata.nivel} texto={r.candidata.nivel_texto} />}
          </header>
          {!r ? (
            res.error ? (
              <ErrorEstado error={res.error} reintentar={res.recargar} compacto />
            ) : (
              <Cargando />
            )
          ) : (
            <>
              <div className="lab-lateral__bloque">
                <p className="tenue">Candidata en estudio</p>
                <p className="lab-lateral__nombre">{r.candidata.nombre}</p>
                {terminada ? <ResumenCorrida t={terminada} /> : <p className="secundario">{r.candidata.evidencia[0]}</p>}
              </div>
              {r.pruebas_a_futuro.map((x) => {
                const p = x as { id: string; inicio_utc?: string; decision?: string };
                const inicio = p.inicio_utc ? Date.parse(`${p.inicio_utc.replace(' ', 'T')}:00Z`) : null;
                const sinDatos = inicio !== null && r.ultimo_minuto.t < inicio;
                return (
                  <div key={p.id} className="lab-lateral__prueba">
                    <div className="fila fila--entre">
                      <strong>Prueba a futuro {p.id}</strong>
                      <span className="num tenue">{sinDatos ? '0 de 30' : 'ver tarea mensual'}</span>
                    </div>
                    <div className="barra-progreso barra-progreso--fina" aria-hidden="true">
                      <span style={{ width: '2%' }} />
                    </div>
                    <p className="tenue">{sinDatos ? `Sellada. Empieza ${p.inicio_utc} UTC; los datos llegan hasta ${fecha(r.ultimo_minuto.t, 'utc')}.` : p.decision}</p>
                  </div>
                );
              })}
              <div className="lab-lateral__conteos">
                {Object.entries(r.hipotesis_por_estado)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <a key={k} href={armarRuta('laboratorio', { vista: 'hipotesis' })} className="conteo">
                      <span className="conteo__n num">{n}</span>
                      <span className="conteo__k">{k}</span>
                    </a>
                  ))}
              </div>
              <p className="nota nota--aviso">
                <Icono nombre="alerta" />
                <span>{r.candidata.nivel_texto}</span>
              </p>
            </>
          )}
        </aside>
      </div>

      {disponibles.length > 0 && <CintaMercados simbolos={disponibles} fichas={fichas} />}

      <div className="grilla grilla--principal separado">
        <section className="panel instantanea" aria-labelledby="ins-titulo">
          <div className="instantanea__datos">
            <div>
              <SelectorInstrumento />
              <p className="instantanea__precio num" id="ins-titulo">
                {r?.ultimo_minuto.vela ? precio(r.ultimo_minuto.vela.c) : '—'}
              </p>
            </div>
            {r && (
              <dl className="definiciones instantanea__meta">
                <dt>Último minuto</dt>
                <dd className="num">
                  {fechaHora(r.ultimo_minuto.t, 'utc')}
                  <br />
                  <span className="tenue">{fechaHora(r.ultimo_minuto.t, 'ny')}</span>
                </dd>
                <dt>Sesión en ese minuto</dt>
                <dd>{r.sesion_del_ultimo_minuto}</dd>
                <dt>Fuente</dt>
                <dd className="secundario">{instrumentos.datos?.find((i) => i.simbolo === simbolo)?.fuente ?? '—'}</dd>
              </dl>
            )}
          </div>
          <div className="instantanea__grafico">
            {diario.datos && r ? (
              <GraficoVelas
                velas={diario.datos.velas}
                tf={1440}
                zona={zona}
                limiteMs={r.ultimo_minuto.t}
                etiquetaLimite={`Fin de los datos: ${fechaHora(r.ultimo_minuto.t, 'utc')}`}
                alto={300}
                etiqueta={`Últimas ${diario.datos.velas.length} velas diarias de ${simbolo}`}
              />
            ) : diario.error || res.error ? (
              <ErrorEstado error={diario.error ?? res.error} reintentar={diario.error ? diario.recargar : res.recargar} compacto />
            ) : (
              <Cargando alto={300} />
            )}
            <p className="fila fila--entre instantanea__pie">
              <span className="tenue">Velas diarias (cierre 17:00 NY), {diario.datos ? entero(diario.datos.velas.length) : '—'} sesiones. Precios bid.</span>
              <Atribucion />
            </p>
          </div>
        </section>

        <Panel titulo="Actividad" subtitulo="Corridas en este servidor y replays de este navegador" acciones={<a href="#/laboratorio" className="boton boton--texto">Laboratorio</a>}>
          {!r ? (
            <Cargando />
          ) : r.corridas_recientes.length === 0 && recientes.length === 0 && guardados.length === 0 ? (
            <Vacio titulo="Todavía no hay actividad" texto="Corré E022 o abrí el replay: lo que hagas aparece acá." />
          ) : (
            <ol className="lista actividad">
              {r.corridas_recientes.map((t: Trabajo) => (
                <li key={t.id}>
                  <span className="actividad__icono" aria-hidden="true">
                    <Icono nombre="laboratorio" tam={14} />
                  </span>
                  <div>
                    <a href={armarRuta(t.estado === 'terminado' ? 'analitica' : 'laboratorio', { corrida: t.id })}>{describirConfig(t)}</a>
                    <p className="tenue">
                      <EstadoTrabajo estado={t.estado} /> {hace(t.creado_ms)}
                    </p>
                  </div>
                </li>
              ))}
              {recientes.map((x) => (
                <li key={`${x.simbolo}-${x.tf}`}>
                  <span className="actividad__icono" aria-hidden="true">
                    <Icono nombre="replay" tam={14} />
                  </span>
                  <div>
                    <a href={armarRuta('replay', { s: x.simbolo, tf: x.tf, t: x.limiteMs })}>
                      Replay {x.simbolo} {etiquetaTf(x.tf)}, límite {fechaHora(x.limiteMs, zona)}
                    </a>
                    <p className="tenue">{hace(x.visto_ms)}</p>
                  </div>
                </li>
              ))}
              {guardados.map((g) => (
                <li key={g.nombre}>
                  <span className="actividad__icono" aria-hidden="true">
                    <Icono nombre="espacio" tam={14} />
                  </span>
                  <div>
                    <button type="button" className="enlace" onClick={() => despachar({ tipo: 'cargar', estado: g.estado })}>
                      Espacio «{g.nombre}»
                    </button>
                    <p className="tenue">guardado {fecha(g.guardado_ms, zona)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function useReloj() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}
