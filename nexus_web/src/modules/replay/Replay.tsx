import { useEffect, useMemo, useRef, useState } from 'react';
import { useAvisos } from '../../app/avisos';
import { useAtajos, useRegistrarComandos, type Comando } from '../../app/comandos';
import { useEspacio } from '../../app/espacio';
import { useGlobales } from '../../app/globales';
import { CabeceraMercado } from '../../components/CabeceraMercado';
import { Atribucion, GraficoVelas, type LineaPrecio, type Marca } from '../../components/GraficoVelas';
import { Icono } from '../../components/iconos';
import { Menu } from '../../components/Menu';
import { PanelIndicador } from '../../components/PanelIndicador';
import { Boton, BotonIcono, Cargando, ErrorEstado, Pestanas, copiarTexto } from '../../components/ui';
import { entero, entradaNy, etiquetaTf, fechaHora, nombreTf } from '../../lib/formato';
import { PASOS_N, TEMPORALIDADES, VELOCIDADES, cambiarVelocidad, leerEstadoCompartible } from '../../lib/replay';
import { armarRuta } from '../../lib/rutas';
import { BarraCuenta } from './BarraCuenta';
import { MapaNiveles } from './MapaNiveles';
import { PanelDecision, PanelEventos, PanelOrdenes } from './Paneles';
import { useReplay } from './useReplay';

type Pestana = 'operar' | 'ordenes' | 'decision' | 'eventos';

const CAPAS: [keyof ReturnType<typeof useEspacio>['estado']['prefs']['capas'], string][] = [
  ['rsi', 'RSI (14)'],
  ['macd', 'MACD (12, 26, 9)'],
  ['sesiones', 'Sesiones de Nueva York'],
  ['niveles', 'Día y semana anteriores'],
  ['senales', 'Señales de E022'],
  ['ordenes', 'Órdenes simuladas'],
  ['estructura', 'Estructura: BOS y CHOCH'],
  ['fvg', 'FVG sin mitigar'],
  ['barridos', 'Barridos de liquidez'],
  ['ob', 'Order blocks sin mitigar'],
  ['ifvg', 'iFVG y BPR vigentes'],
  ['ote', 'Premium/discount y OTE'],
];

export default function Replay({ params }: { params: Record<string, string> }) {
  const { estado, despachar } = useEspacio();
  const { avisar } = useAvisos();
  const r = useReplay();
  const { instrumentos } = useGlobales();
  const dec = instrumentos.datos?.find((i) => i.simbolo === r.simbolo)?.decimales ?? 2;
  const [rango, setRango] = useState<{ from: number; to: number } | null>(null);
  const prefs = estado.prefs;
  const zona = prefs.zona;
  const panel = prefs.panelReplay;
  const [fechaSalto, setFechaSalto] = useState('');
  const [errorSalto, setErrorSalto] = useState<string | null>(null);
  const [saltoAbierto, setSaltoAbierto] = useState(false);
  useEffect(() => {
    if (saltoAbierto) requestAnimationFrame(() => entradaFecha.current?.focus());
  }, [saltoAbierto]);
  const [ticket, setTicket] = useState<{ lado: 'compra' | 'venta'; n: number } | null>(null);
  const entradaFecha = useRef<HTMLInputElement>(null);

  // estado compartido por enlace (#/replay?s=XAUUSD&tf=15&t=…): se aplica una vez y se limpia la dirección
  useEffect(() => {
    const e = leerEstadoCompartible(params);
    if (!e) return;
    despachar({ tipo: 'simbolo', simbolo: e.simbolo });
    despachar({ tipo: 'tf', tf: e.tf });
    despachar({ tipo: 'limite', simbolo: e.simbolo, limiteMs: e.limiteMs });
    history.replaceState(null, '', armarRuta('replay'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (r.cuadro) setFechaSalto(entradaNy(r.cuadro.limite.limite_ms));
  }, [r.cuadro?.limite.limite_ms]); // eslint-disable-line react-hooks/exhaustive-deps

  const fijarPanel = (p: Partial<typeof panel>) => despachar({ tipo: 'prefs', prefs: { panelReplay: { ...panel, ...p } } });
  const abrirTicket = (lado: 'compra' | 'venta') => {
    fijarPanel({ visible: true, pestana: 'operar' });
    setTicket((t) => ({ lado, n: (t?.n ?? 0) + 1 }));
  };
  const pasoN = estado.replay.pasoN;
  const velocidad = estado.replay.velocidad;
  const pasar = (n: number) => {
    r.setReproduciendo(false);
    void r.paso(n);
  };
  const compartir = async () => {
    if (!r.cuadro) return;
    const url = `${location.origin}${location.pathname}${armarRuta('replay', { s: r.simbolo, tf: r.tf, t: r.cuadro.limite.limite_ms })}`;
    avisar((await copiarTexto(url)) ? { texto: 'Enlace copiado: abre este mismo instante del replay.' } : { texto: `No se pudo copiar. Enlace: ${url}`, tono: 'error' });
  };
  const saltar = async () => {
    if (!fechaSalto) return;
    const err = await r.saltar(fechaSalto);
    setErrorSalto(err);
    if (!err) setSaltoAbierto(false);
  };

  const comandos = useMemo<Comando[]>(
    () => [
      { id: 'rp-play', titulo: r.reproduciendo ? 'Pausar la reproducción' : 'Reproducir', grupo: 'Replay', atajo: 'Espacio', palabras: 'play pause', ejecutar: () => r.setReproduciendo(!r.reproduciendo) },
      { id: 'rp-mas1', titulo: 'Avanzar una vela', grupo: 'Replay', atajo: '→', ejecutar: () => pasar(1) },
      { id: 'rp-masN', titulo: `Avanzar ${pasoN} velas`, grupo: 'Replay', atajo: 'Shift →', ejecutar: () => pasar(pasoN) },
      { id: 'rp-menos1', titulo: 'Retroceder una vela', grupo: 'Replay', atajo: '←', ejecutar: () => pasar(-1) },
      { id: 'rp-menosN', titulo: `Retroceder ${pasoN} velas`, grupo: 'Replay', atajo: 'Shift ←', ejecutar: () => pasar(-pasoN) },
      {
        id: 'rp-min',
        titulo: 'Avanzar un minuto',
        grupo: 'Replay',
        atajo: '.',
        ejecutar: () => {
          r.setReproduciendo(false);
          void r.paso(1, 'minutos');
        },
      },
      { id: 'rp-salto', titulo: 'Saltar a una fecha (hora de Nueva York)', grupo: 'Replay', atajo: 'J', ejecutar: () => setSaltoAbierto(true) },
      { id: 'rp-reinicio', titulo: 'Reiniciar el replay (7 días antes del final de los datos)', grupo: 'Replay', atajo: 'Inicio', ejecutar: () => void r.reiniciar() },
      { id: 'rp-vel-mas', titulo: 'Más velocidad', grupo: 'Replay', atajo: '+', ejecutar: () => despachar({ tipo: 'velocidad', velocidad: cambiarVelocidad(velocidad, 1) }) },
      { id: 'rp-vel-menos', titulo: 'Menos velocidad', grupo: 'Replay', atajo: '-', ejecutar: () => despachar({ tipo: 'velocidad', velocidad: cambiarVelocidad(velocidad, -1) }) },
      { id: 'rp-compra', titulo: 'Nueva orden simulada de compra', grupo: 'Replay', atajo: 'B', ejecutar: () => abrirTicket('compra') },
      { id: 'rp-venta', titulo: 'Nueva orden simulada de venta', grupo: 'Replay', atajo: 'V', ejecutar: () => abrirTicket('venta') },
      { id: 'rp-panel', titulo: panel.visible ? 'Ocultar el panel lateral' : 'Mostrar el panel lateral', grupo: 'Replay', atajo: 'P', ejecutar: () => fijarPanel({ visible: !panel.visible }) },
      { id: 'rp-enlace', titulo: 'Copiar enlace a este instante', grupo: 'Replay', palabras: 'compartir reproducible estado', ejecutar: () => void compartir() },
      ...TEMPORALIDADES.map((tf, i) => ({ id: `rp-tf-${tf}`, titulo: `Ver velas de ${nombreTf(tf)}`, grupo: 'Replay', atajo: String(i + 1), ejecutar: () => despachar({ tipo: 'tf', tf }) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r.reproduciendo, pasoN, velocidad, panel, r.cuadro?.limite.limite_ms, r.simbolo, r.tf],
  );
  useRegistrarComandos('replay', comandos);
  useAtajos(
    Object.fromEntries(
      comandos
        .filter((c) => c.atajo)
        .map((c) => {
          const t = c.atajo!.toLowerCase().replace('espacio', 'space').replace('shift →', 'shift+arrowright').replace('shift ←', 'shift+arrowleft').replace('→', 'arrowright').replace('←', 'arrowleft').replace('inicio', 'home');
          return [t, c.ejecutar];
        }),
    ),
  );

  // ---------------------------------------------------------------- capas para el gráfico (todo viene de la API, ≤ límite)
  const c = r.cuadro;
  const lineas = useMemo<LineaPrecio[]>(() => {
    if (!c) return [];
    const l: LineaPrecio[] = [];
    if (prefs.capas.niveles) for (const n of c.niveles) l.push({ id: n.clave, precio: n.precio, titulo: n.clave.toUpperCase(), tipo: 'nivel' });
    if (prefs.capas.ordenes)
      for (const e of r.estadosOrdenes) {
        if (e.estado !== 'esperando_llenado' && e.estado !== 'abierta') continue;
        const o = r.ordenes.find((x) => x.id === e.id);
        if (!o) continue;
        if (e.precio_entrada) l.push({ id: o.id, precio: e.precio_entrada, titulo: o.lado === 'compra' ? 'Compra' : 'Venta', tipo: 'entrada' });
        else if (o.tipo === 'limite' && o.entrada) l.push({ id: o.id, precio: o.entrada, titulo: o.lado === 'compra' ? 'Compra límite' : 'Venta límite', tipo: 'entrada' });
        l.push({ id: o.id, precio: o.sl, titulo: 'SL', tipo: 'sl' });
        l.push({ id: o.id, precio: o.tp, titulo: 'TP', tipo: 'tp' });
      }
    if (prefs.capas.fvg && r.capas) {
      // solo los huecos sin mitigar más recientes (las zonas ya mitigadas no se dibujan para no ensuciar el gráfico)
      for (const z of r.capas.fvg.filter((x) => x.mitigada_ms === null).slice(-3)) {
        const flecha = z.lado === 'alcista' ? '▲' : '▼';
        l.push({ id: `fvg-${z.t}`, precio: z.arriba, titulo: `FVG ${flecha}`, tipo: 'zona' });
        l.push({ id: `fvg-${z.t}`, precio: z.abajo, titulo: '', tipo: 'zona' });
      }
    }
    if (prefs.capas.ob && r.capas) {
      for (const ob of r.capas.order_blocks.filter((x) => x.mitigado_ms === null).slice(-2)) {
        l.push({ id: `ob-${ob.t}`, precio: ob.arriba, titulo: `OB ${ob.lado === 'alcista' ? '▲' : '▼'}`, tipo: 'zona' });
        l.push({ id: `ob-${ob.t}`, precio: ob.abajo, titulo: '', tipo: 'zona' });
      }
    }
    if (prefs.capas.ifvg && r.capas) {
      // vigentes: no atravesados de vuelta al límite; los 2 iFVG y el BPR más recientes
      for (const z of r.capas.ifvg.filter((x) => x.invalidado_ms === null).slice(-2)) {
        l.push({ id: `ifvg-${z.t}`, precio: z.arriba, titulo: `iFVG ${z.lado === 'alcista' ? '▲' : '▼'}`, tipo: 'zona' });
        l.push({ id: `ifvg-${z.t}`, precio: z.abajo, titulo: '', tipo: 'zona' });
      }
      for (const z of r.capas.bpr.filter((x) => x.invalidado_ms === null).slice(-1)) {
        l.push({ id: `bpr-${z.t}`, precio: z.arriba, titulo: `BPR ${z.lado === 'alcista' ? '▲' : '▼'}`, tipo: 'zona' });
        l.push({ id: `bpr-${z.t}`, precio: z.abajo, titulo: '', tipo: 'zona' });
      }
    }
    const rg = r.capas?.rango;
    if (prefs.capas.ote && rg) {
      l.push({ id: 'rango', precio: rg.equilibrio, titulo: 'EQ 50 %', tipo: 'rango' });
      if (rg.ote_abajo !== null && rg.ote_arriba !== null) {
        l.push({ id: 'ote', precio: rg.ote_arriba, titulo: rg.sentido === 'alcista' ? 'OTE 62 %' : 'OTE 79 %', tipo: 'rango' });
        l.push({ id: 'ote', precio: rg.ote_abajo, titulo: rg.sentido === 'alcista' ? 'OTE 79 %' : 'OTE 62 %', tipo: 'rango' });
      }
    }
    return l;
  }, [c, prefs.capas.niveles, prefs.capas.ordenes, prefs.capas.fvg, prefs.capas.ob, prefs.capas.ifvg, prefs.capas.ote, r.estadosOrdenes, r.ordenes, r.capas]);

  const marcas = useMemo<Marca[]>(() => {
    if (!c) return [];
    const m: Marca[] = [];
    if (prefs.capas.senales) for (const e of c.eventos) if (e.tipo === 'senal' && e.lado) m.push({ t: e.t, tipo: e.lado, texto: 'E022' });
    if (prefs.capas.ordenes)
      for (const e of r.estadosOrdenes) {
        if (e.entrada_ms && e.estado !== 'rechazada' && e.estado !== 'posterior_al_limite') m.push({ t: e.entrada_ms, tipo: 'entrada', texto: 'Entrada' });
        if (e.estado === 'cerrada' && e.salida_ms) m.push({ t: e.salida_ms, tipo: 'salida', texto: e.motivo ?? '' });
      }
    if (prefs.capas.estructura && r.capas) {
      for (const p of r.capas.pivotes) m.push({ t: p.t, tipo: p.tipo === 'alto' ? 'pivoteAlto' : 'pivoteBajo', texto: '' });
      for (const x of r.capas.rupturas) m.push({ t: x.t, tipo: 'ruptura', texto: x.tipo, arriba: x.lado === 'alcista' });
    }
    if (prefs.capas.barridos && r.capas) for (const b of r.capas.barridos) m.push({ t: b.t, tipo: 'barrido', texto: 'Barrido', arriba: b.lado === 'arriba' });
    return m;
  }, [c, prefs.capas.senales, prefs.capas.ordenes, prefs.capas.estructura, prefs.capas.barridos, r.estadosOrdenes, r.capas]);

  const pestanas: { id: Pestana; etiqueta: string; contador?: number }[] = [
    { id: 'operar', etiqueta: 'Operar' },
    { id: 'ordenes', etiqueta: 'Órdenes', contador: r.ordenes.length },
    { id: 'decision', etiqueta: 'Decisión' },
    { id: 'eventos', etiqueta: 'Eventos', contador: c?.eventos.length },
  ];
  const capas = prefs.capas;
  const verRsi = capas.rsi && !!c?.indicadores;
  const verMacd = capas.macd && !!c?.indicadores;
  const dinero = useMemo(() => new Map((r.cuenta?.por_orden ?? []).map((x) => [x.id, x.resultado_moneda ?? null])), [r.cuenta]);
  const pestana: Pestana = (['operar', 'ordenes', 'decision', 'eventos'] as Pestana[]).includes(panel.pestana as Pestana) ? (panel.pestana as Pestana) : 'operar';

  return (
    <div className="terminal" data-panel={panel.visible ? 'visible' : 'oculto'}>
      <h1 className="visualmente-oculto">Replay de mercado</h1>
      <section className="terminal__central" aria-label="Gráfico">
        <header className="terminal__cabeza">
          <CabeceraMercado cuadro={c} modo="replay" />
        </header>
        <div className="terminal__herramientas" role="toolbar" aria-label="Controles del gráfico y del replay">
          <div className="tf-tabs" role="radiogroup" aria-label="Temporalidad">
            {TEMPORALIDADES.map((tf) => (
              <button
                key={tf}
                type="button"
                role="radio"
                aria-checked={r.tf === tf}
                className={r.tf === tf ? 'es-activo' : ''}
                title={`Velas de ${nombreTf(tf)}`}
                onClick={() => despachar({ tipo: 'tf', tf })}
              >
                {tf === 1440 ? '1D' : etiquetaTf(tf).toUpperCase().replace('M', 'm')}
              </button>
            ))}
          </div>
          <Menu
            etiqueta="Indicadores y capas"
            items={CAPAS.map(([k, t]) => ({
              id: k,
              texto: (
                <>
                  <span className="menu__marca" aria-hidden="true">
                    {capas[k] ? '✓' : ''}
                  </span>
                  {t}
                </>
              ),
              detalle: capas[k] ? 'visible' : 'oculto',
              alElegir: () => despachar({ tipo: 'prefs', prefs: { capas: { ...capas, [k]: !capas[k] } } }),
            }))}
            boton={(p) => (
              <button type="button" className="boton boton--chico boton--fantasma" {...p}>
                <Icono nombre="capas" />
                Indicadores
              </button>
            )}
          />
          <span className="terminal__separador" aria-hidden="true" />
          <div className="fila transporte">
            <BotonIcono etiqueta={`Retroceder ${pasoN} velas (Shift ←)`} icono="atrasN" onClick={() => pasar(-pasoN)} disabled={!c} />
            <BotonIcono etiqueta="Retroceder una vela (←)" icono="pasoAtras" onClick={() => pasar(-1)} disabled={!c} />
            <Boton
              chico
              variante={r.reproduciendo ? 'secundario' : 'primario'}
              icono={r.reproduciendo ? 'pausa' : 'play'}
              onClick={() => r.setReproduciendo(!r.reproduciendo)}
              disabled={!c || (r.alFinal && !r.reproduciendo)}
              aria-keyshortcuts="Space"
            >
              {r.reproduciendo ? 'Pausar' : 'Reproducir'}
            </Boton>
            <BotonIcono etiqueta="Avanzar una vela (→)" icono="pasoAdelante" onClick={() => pasar(1)} disabled={!c || r.alFinal} />
            <BotonIcono etiqueta={`Avanzar ${pasoN} velas (Shift →)`} icono="adelanteN" onClick={() => pasar(pasoN)} disabled={!c || r.alFinal} />
            <label className="visualmente-oculto" htmlFor="rp-vel">
              Velocidad
            </label>
            <select id="rp-vel" className="selector selector--chico" title="Velocidad" value={velocidad} onChange={(e) => despachar({ tipo: 'velocidad', velocidad: Number(e.target.value) })}>
              {VELOCIDADES.map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
            <label className="visualmente-oculto" htmlFor="rp-n">
              Paso N
            </label>
            <select id="rp-n" className="selector selector--chico" title="Velas por paso largo" value={pasoN} onChange={(e) => despachar({ tipo: 'pasoN', pasoN: Number(e.target.value) })}>
              {PASOS_N.map((n) => (
                <option key={n} value={n}>
                  N = {n}
                </option>
              ))}
            </select>
          </div>
          <div className="fila terminal__extremo">
            <div className="selector-instrumento">
              <BotonIcono etiqueta="Ir a una fecha (J)" icono="calendario" activo={saltoAbierto} onClick={() => setSaltoAbierto((x) => !x)} aria-expanded={saltoAbierto} />
              {saltoAbierto && (
                <form
                  className="salto menu"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await saltar();
                  }}
                  onKeyDown={(e) => e.key === 'Escape' && setSaltoAbierto(false)}
                >
                  <label className="campo__etiqueta" htmlFor="rp-fecha">
                    Ir a una fecha (hora de Nueva York)
                  </label>
                  <div className="fila">
                    <input
                      id="rp-fecha"
                      ref={entradaFecha}
                      type="datetime-local"
                      className="entrada selector--chico"
                      value={fechaSalto}
                      onChange={(e) => setFechaSalto(e.target.value)}
                      aria-invalid={!!errorSalto}
                      aria-describedby={errorSalto ? 'rp-fecha-error' : undefined}
                    />
                    <Boton type="submit" chico variante="primario" disabled={!fechaSalto}>
                      Ir
                    </Boton>
                  </div>
                  {errorSalto && (
                    <span id="rp-fecha-error" className="campo__error" role="alert">
                      {errorSalto}
                    </span>
                  )}
                </form>
              )}
            </div>
            <BotonIcono etiqueta="Reiniciar el replay (Inicio)" icono="reiniciar" onClick={() => void r.reiniciar()} />
            <BotonIcono etiqueta="Copiar enlace a este instante" icono="enlace" onClick={() => void compartir()} disabled={!c} />
            <BotonIcono etiqueta={panel.visible ? 'Ocultar panel lateral (P)' : 'Mostrar panel lateral (P)'} icono="panelDer" activo={panel.visible} onClick={() => fijarPanel({ visible: !panel.visible })} />
          </div>
        </div>
        <div className="terminal__graficos">
          {c ? (
            <>
              <div className="terminal__velas">
                <GraficoVelas
                  velas={c.velas}
                  tf={c.temporalidad}
                  zona={zona}
                  limiteMs={c.limite.limite_ms}
                  etiquetaLimite={fechaHora(c.limite.limite_ms, zona)}
                  sesiones={capas.sesiones ? c.sesiones : []}
                  lineas={lineas}
                  marcas={marcas}
                  alto="100%"
                  ejeTiempo={!verRsi && !verMacd}
                  onRango={setRango}
                  etiqueta={`Velas de ${nombreTf(c.temporalidad)} de ${c.simbolo} hasta el límite ${fechaHora(c.limite.limite_ms, 'ny')}`}
                />
              </div>
              {verRsi && <PanelIndicador tipo="rsi" velas={c.velas} ind={c.indicadores!} rango={rango} zona={zona} alto={104} ejeTiempo={!verMacd} />}
              {verMacd && <PanelIndicador tipo="macd" velas={c.velas} ind={c.indicadores!} rango={rango} zona={zona} alto={verRsi ? 132 : 150} ejeTiempo />}
            </>
          ) : r.error ? (
            <ErrorEstado error={r.error} reintentar={r.reintentar} />
          ) : (
            <Cargando texto="Cargando el cuadro del replay…" alto={300} />
          )}
          {c && r.error ? (
            <div className="replay__error">
              <ErrorEstado error={r.error} reintentar={r.reintentar} compacto />
            </div>
          ) : null}
        </div>
        <footer className="terminal__estado" aria-live="polite">
          {c ? (
            <>
              <span className="replay__limite">
                <span className="chip-limite__marca" aria-hidden="true" />
                Límite <strong className="num">{fechaHora(c.limite.limite_ms, 'ny')}</strong>
                <span className="num tenue">{fechaHora(c.limite.limite_ms, 'utc')}</span>
              </span>
              <span className="ocultar-movil">
                {entero(c.velas.length)} velas de {nombreTf(c.temporalidad)}
                {c.velas[c.velas.length - 1]?.parcial ? ', la última en formación' : ''}
              </span>
              {c.al_final_de_los_datos && (
                <span className="tono-aviso">
                  <Icono nombre="alerta" tam={13} /> Fin de los datos históricos
                </span>
              )}
              <span className="ocultar-movil tenue replay__latencia">{r.cargando ? 'Actualizando…' : r.latenciaMs !== null ? `Respuesta en ${r.latenciaMs} ms` : ''}</span>
              <Atribucion />
            </>
          ) : (
            <span className="tenue">Sin cuadro cargado</span>
          )}
        </footer>
      </section>

      {panel.visible && (
        <aside className="terminal__lateral" aria-label="Operar y paneles del replay">
          <Pestanas idBase="rp" etiqueta="Paneles del replay" pestanas={pestanas} activa={pestana} onCambio={(p) => fijarPanel({ pestana: p })} />
          <div className="terminal__contenido" role="tabpanel" id={`rp-panel-${pestana}`} aria-labelledby={`rp-pestana-${pestana}`}>
            {!c ? (
              <Cargando />
            ) : pestana === 'operar' ? (
              <>
                <MapaNiveles cuadro={c} capas={r.capas} ordenes={r.ordenes} estados={r.estadosOrdenes} dec={dec} mostrarFvg={capas.fvg} mostrarRango={capas.ote} />
                <PanelOrdenes cuadro={c} limite={c.limite.limite_ms} ordenes={r.ordenes} estados={r.estadosOrdenes} zona={zona} ladoInicial={ticket} vista="ticket" />
              </>
            ) : pestana === 'ordenes' ? (
              <PanelOrdenes cuadro={c} limite={c.limite.limite_ms} ordenes={r.ordenes} estados={r.estadosOrdenes} zona={zona} vista="lista" dinero={dinero} />
            ) : pestana === 'decision' ? (
              <PanelDecision cuadro={c} />
            ) : (
              <PanelEventos eventos={c.eventos} estados={r.estadosOrdenes} zona={zona} />
            )}
          </div>
        </aside>
      )}

      <div className="terminal__cuenta">
        <BarraCuenta cuenta={r.cuenta} />
      </div>
    </div>
  );
}
