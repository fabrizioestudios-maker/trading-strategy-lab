import { useEffect, useMemo, useRef, useState } from 'react';
import { useAvisos } from '../../app/avisos';
import { useAtajos, useRegistrarComandos, type Comando } from '../../app/comandos';
import { useEspacio } from '../../app/espacio';
import { Divisor } from '../../components/Divisor';
import { Atribucion, GraficoVelas, type LineaPrecio, type Marca } from '../../components/GraficoVelas';
import { Icono } from '../../components/iconos';
import { Boton, BotonIcono, Cargando, ErrorEstado, Pestanas, Segmentado, copiarTexto } from '../../components/ui';
import { entero, entradaNy, etiquetaTf, fechaHora, nombreTf } from '../../lib/formato';
import { PASOS_N, TEMPORALIDADES, VELOCIDADES, cambiarVelocidad, leerEstadoCompartible } from '../../lib/replay';
import { armarRuta } from '../../lib/rutas';
import { PanelDecision, PanelEventos, PanelNiveles, PanelOrdenes } from './Paneles';
import { useReplay } from './useReplay';

type Pestana = 'decision' | 'ordenes' | 'eventos' | 'niveles';

export default function Replay({ params }: { params: Record<string, string> }) {
  const { estado, despachar } = useEspacio();
  const { avisar } = useAvisos();
  const r = useReplay();
  const prefs = estado.prefs;
  const zona = prefs.zona;
  const panel = prefs.panelReplay;
  const [fechaSalto, setFechaSalto] = useState('');
  const [errorSalto, setErrorSalto] = useState<string | null>(null);
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
    fijarPanel({ visible: true, pestana: 'ordenes' });
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
      { id: 'rp-salto', titulo: 'Saltar a una fecha (hora de Nueva York)', grupo: 'Replay', atajo: 'J', ejecutar: () => entradaFecha.current?.focus() },
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
    return l;
  }, [c, prefs.capas.niveles, prefs.capas.ordenes, prefs.capas.fvg, r.estadosOrdenes, r.ordenes, r.capas]);

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
    return m;
  }, [c, prefs.capas.senales, prefs.capas.ordenes, prefs.capas.estructura, r.estadosOrdenes, r.capas]);

  const pestanas: { id: Pestana; etiqueta: string; contador?: number }[] = [
    { id: 'decision', etiqueta: 'Decisión' },
    { id: 'ordenes', etiqueta: 'Órdenes', contador: r.ordenes.length },
    { id: 'eventos', etiqueta: 'Eventos', contador: c?.eventos.length },
    { id: 'niveles', etiqueta: 'Niveles y capas' },
  ];

  return (
    <div className="replay" data-panel={panel.visible ? 'visible' : 'oculto'}>
      <h1 className="visualmente-oculto">Replay de mercado</h1>
      <div className="replay__barra" role="toolbar" aria-label="Controles del replay">
        <div className="fila">
          <BotonIcono etiqueta={`Retroceder ${pasoN} velas (Shift ←)`} icono="atrasN" onClick={() => pasar(-pasoN)} disabled={!c} />
          <BotonIcono etiqueta="Retroceder una vela (←)" icono="pasoAtras" onClick={() => pasar(-1)} disabled={!c} />
          <Boton
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
        </div>
        <div className="fila">
          <label className="replay__rotulo" htmlFor="rp-vel">
            Velocidad
          </label>
          <select id="rp-vel" className="selector selector--chico" value={velocidad} onChange={(e) => despachar({ tipo: 'velocidad', velocidad: Number(e.target.value) })}>
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {v} {v === 1 ? 'vela' : 'velas'}/s
              </option>
            ))}
          </select>
          <label className="replay__rotulo" htmlFor="rp-n">
            Paso N
          </label>
          <select id="rp-n" className="selector selector--chico" value={pasoN} onChange={(e) => despachar({ tipo: 'pasoN', pasoN: Number(e.target.value) })}>
            {PASOS_N.map((n) => (
              <option key={n} value={n}>
                {n} velas
              </option>
            ))}
          </select>
        </div>
        <form
          className="fila replay__salto"
          onSubmit={(e) => {
            e.preventDefault();
            void saltar();
          }}
        >
          <label className="replay__rotulo" htmlFor="rp-fecha">
            Ir a (NY)
          </label>
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
          <Boton type="submit" chico disabled={!fechaSalto}>
            Ir
          </Boton>
          {errorSalto && (
            <span id="rp-fecha-error" className="campo__error" role="alert">
              {errorSalto}
            </span>
          )}
        </form>
        <div className="fila replay__extremo">
          <div className="solo-movil">
            <Segmentado chico etiqueta="Temporalidad" opciones={TEMPORALIDADES.map((tf) => ({ valor: tf, etiqueta: etiquetaTf(tf) }))} valor={r.tf} onCambio={(tf) => despachar({ tipo: 'tf', tf })} />
          </div>
          <BotonIcono etiqueta="Reiniciar el replay (Inicio)" icono="reiniciar" onClick={() => void r.reiniciar()} />
          <BotonIcono etiqueta="Copiar enlace a este instante" icono="enlace" onClick={() => void compartir()} disabled={!c} />
          <BotonIcono etiqueta={panel.visible ? 'Ocultar panel lateral (P)' : 'Mostrar panel lateral (P)'} icono="panelDer" activo={panel.visible} onClick={() => fijarPanel({ visible: !panel.visible })} />
        </div>
      </div>

      <div className="replay__cuerpo" style={{ ['--ancho-panel' as string]: `${panel.ancho}px` }}>
        <div className="replay__grafico">
          {c ? (
            <GraficoVelas
              velas={c.velas}
              tf={c.temporalidad}
              zona={zona}
              limiteMs={c.limite.limite_ms}
              etiquetaLimite={fechaHora(c.limite.limite_ms, zona)}
              sesiones={prefs.capas.sesiones ? c.sesiones : []}
              lineas={lineas}
              marcas={marcas}
              alto="100%"
              etiqueta={`Velas de ${nombreTf(c.temporalidad)} de ${c.simbolo} hasta el límite ${fechaHora(c.limite.limite_ms, 'ny')}`}
            />
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
        {panel.visible && (
          <>
            <Divisor ancho={panel.ancho} min={280} max={560} etiqueta="Ancho del panel lateral" onCambio={(a) => fijarPanel({ ancho: a })} />
            <aside className="replay__lateral" aria-label="Panel del replay">
              <Pestanas idBase="rp" etiqueta="Paneles del replay" pestanas={pestanas} activa={panel.pestana} onCambio={(p) => fijarPanel({ pestana: p })} />
              <div className="replay__contenido" role="tabpanel" id={`rp-panel-${panel.pestana}`} aria-labelledby={`rp-pestana-${panel.pestana}`} tabIndex={0}>
                {!c ? (
                  <Cargando />
                ) : panel.pestana === 'decision' ? (
                  <PanelDecision cuadro={c} />
                ) : panel.pestana === 'ordenes' ? (
                  <PanelOrdenes cuadro={c} limite={c.limite.limite_ms} ordenes={r.ordenes} estados={r.estadosOrdenes} zona={zona} ladoInicial={ticket} />
                ) : panel.pestana === 'eventos' ? (
                  <PanelEventos eventos={c.eventos} estados={r.estadosOrdenes} zona={zona} />
                ) : (
                  <PanelNiveles cuadro={c} zona={zona} />
                )}
              </div>
            </aside>
          </>
        )}
      </div>

      <footer className="replay__estado" aria-live="polite">
        {c ? (
          <>
            <span className="replay__limite">
              <span className="chip-limite__marca" aria-hidden="true" />
              Límite <strong className="num">{fechaHora(c.limite.limite_ms, 'ny')}</strong>
              <span className="num tenue">{fechaHora(c.limite.limite_ms, 'utc')}</span>
            </span>
            <span>
              Sesión <strong>{c.limite.sesion}</strong>
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
            <span className="ocultar-movil tenue replay__latencia">
              {r.cargando ? 'Actualizando…' : r.latenciaMs !== null ? `Respuesta en ${r.latenciaMs} ms` : ''}
            </span>
            <Atribucion />
          </>
        ) : (
          <span className="tenue">Sin cuadro cargado</span>
        )}
      </footer>
    </div>
  );
}
