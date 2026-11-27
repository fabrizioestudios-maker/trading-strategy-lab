/**
 * Gráfico de velas (lightweight-charts) con las marcas propias del replay:
 * - la línea del LÍMITE (último minuto revelado) y, a su derecha, la zona «sin revelar»: ahí no hay datos cargados;
 * - la franja de sesiones de Nueva York alineada con el eje de tiempo;
 * - niveles, señales y órdenes simuladas que manda la API (todo ≤ límite).
 * Las velas en formación se dibujan atenuadas. Alza = vela hueca, baja = vela llena (no depende solo del color).
 */
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import type { Vela, VentanaSesion } from '../api/contrato.gen';
import { fechaHora, hora, partes, precio, type Zona } from '../lib/formato';
import { velaQueContiene } from '../lib/replay';

export interface LineaPrecio {
  id: string;
  precio: number;
  titulo: string;
  tipo: 'nivel' | 'entrada' | 'sl' | 'tp' | 'zona';
}

export interface Marca {
  t: number;
  tipo: 'compra' | 'venta' | 'salida' | 'entrada' | 'pivoteAlto' | 'pivoteBajo' | 'ruptura';
  texto: string;
  arriba?: boolean;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const conAlfa = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

interface Geometria {
  limiteX: number | null;
  anchoTrazado: number;
  altoTrazado: number;
  sesiones: { nombre: string; x: number; ancho: number }[];
}

/** Atribución de la biblioteca de gráficos (requisito del NOTICE de lightweight-charts). */
export function Atribucion() {
  return (
    <a className="atribucion" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
      Gráficos: TradingView Lightweight Charts
    </a>
  );
}

export function GraficoVelas({
  velas,
  tf,
  zona,
  limiteMs,
  etiquetaLimite,
  sesiones = [],
  lineas = [],
  marcas = [],
  alto = 420,
  mostrarLimite = true,
  etiqueta,
}: {
  velas: Vela[];
  tf: number;
  zona: Zona;
  limiteMs?: number | null;
  etiquetaLimite?: string;
  sesiones?: VentanaSesion[];
  lineas?: LineaPrecio[];
  marcas?: Marca[];
  alto?: number | string;
  mostrarLimite?: boolean;
  etiqueta: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const grafico = useRef<IChartApi | null>(null);
  const serie = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineasRef = useRef<Map<string, IPriceLine>>(new Map());
  const estadoRef = useRef({ tf: 0, n: 0 });
  const velasRef = useRef<Vela[]>(velas);
  velasRef.current = velas;
  const sesionesRef = useRef<VentanaSesion[]>(sesiones);
  sesionesRef.current = sesiones;
  const [geo, setGeo] = useState<Geometria>({ limiteX: null, anchoTrazado: 0, altoTrazado: 0, sesiones: [] });
  const [leyenda, setLeyenda] = useState<Vela | null>(null);

  // ---------------------------------------------------------------- creación
  useEffect(() => {
    if (!caja.current) return;
    const texto = css('--text-3');
    const linea = css('--line');
    const g = createChart(caja.current, {
      autoSize: true,
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      rightPriceScale: { borderColor: linea, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: linea, rightOffset: 14, barSpacing: 7, minBarSpacing: 1.5, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(244,246,250,0.25)', labelBackgroundColor: '#1c2740', style: LineStyle.Dashed },
        horzLine: { color: 'rgba(244,246,250,0.25)', labelBackgroundColor: '#1c2740', style: LineStyle.Dashed },
      },
      handleScale: { axisPressedMouseMove: true },
      // la atribución que pide la licencia (Apache 2.0, NOTICE) va como enlace visible debajo del gráfico
      layout: { background: { type: ColorType.Solid, color: css('--chart-bg') }, textColor: texto, fontFamily: css('--font'), fontSize: 11, attributionLogo: false },
    });
    const s = g.addCandlestickSeries({
      upColor: 'rgba(0,0,0,0)',
      downColor: css('--neg'),
      borderUpColor: css('--pos'),
      borderDownColor: css('--neg'),
      wickUpColor: css('--pos'),
      wickDownColor: css('--neg'),
      priceLineColor: css('--text-3'),
      priceLineStyle: LineStyle.Dotted,
    });
    grafico.current = g;
    serie.current = s;

    let vivo = true;
    const recalcular = () => {
      if (!vivo) return; // un cuadro de animación pendiente puede llegar después de desmontar el gráfico
      const v = velasRef.current;
      const ts = g.timeScale();
      const ancho = (caja.current?.clientWidth ?? 0) - g.priceScale('right').width();
      const altoT = (caja.current?.clientHeight ?? 0) - ts.height();
      const n = v.length;
      if (!n || ancho <= 0) return setGeo({ limiteX: null, anchoTrazado: Math.max(0, ancho), altoTrazado: altoT, sesiones: [] });
      // centro de cada vela en pantalla; el ancho de una vela sale de dos velas vecinas (sigue el zoom del usuario)
      const xc = (i: number) => ts.timeToCoordinate((v[i].t / 1000) as UTCTimestamp);
      const xa = xc(n - 1);
      const xb = n > 1 ? xc(n - 2) : null;
      const paso = xa !== null && xb !== null && xa > xb ? xa - xb : 6;
      const limiteX = xa === null ? null : xa + paso / 2;
      // tiempo arbitrario → coordenada: vela que lo contiene + fracción del tiempo transcurrido dentro de ella
      const tfMs = estadoRef.current.tf * 60_000;
      const aX = (t: number): number | null => {
        const i = velaQueContiene(v, t);
        if (i < 0) return (xc(0) ?? 0) - paso / 2 - paso;
        const x = xc(i);
        return x === null ? null : x - paso / 2 + Math.min(1, (t - v[i].t) / tfMs) * paso;
      };
      const ses: Geometria['sesiones'] = [];
      if (estadoRef.current.tf <= 60) {
        for (const w of sesionesRef.current) {
          const x1 = aX(w.desde_ms);
          let x2 = aX(w.hasta_ms);
          if (x1 === null || x2 === null) continue;
          if (limiteX !== null) x2 = Math.min(x2, limiteX);
          const a = Math.max(0, x1);
          const b = Math.min(ancho, x2);
          if (b - a >= 1) ses.push({ nombre: w.nombre, x: a, ancho: b - a });
        }
      }
      setGeo({ limiteX, anchoTrazado: ancho, altoTrazado: altoT, sesiones: ses });
    };
    const diferido = () => requestAnimationFrame(() => vivo && requestAnimationFrame(recalcular));
    g.timeScale().subscribeVisibleLogicalRangeChange(recalcular);
    g.timeScale().subscribeSizeChange(diferido);
    const ro = new ResizeObserver(diferido);
    ro.observe(caja.current);
    g.subscribeCrosshairMove((p) => {
      if (!p.time) return setLeyenda(null);
      const t = (p.time as number) * 1000;
      setLeyenda(velasRef.current.find((x) => x.t === t) ?? null);
    });
    (g as unknown as { __recalcular: () => void }).__recalcular = diferido;
    return () => {
      vivo = false;
      ro.disconnect();
      g.remove();
      grafico.current = null;
      serie.current = null;
      lineasRef.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------- formato del eje según la zona elegida
  useEffect(() => {
    grafico.current?.applyOptions({
      localization: { locale: 'es-AR', priceFormatter: (p: number) => precio(p), timeFormatter: (t: Time) => fechaHora((t as number) * 1000, zona) },
      timeScale: {
        tickMarkFormatter: (t: Time, tipo: TickMarkType) => {
          const ms = (t as number) * 1000;
          const p = partes(ms, zona);
          if (tipo === TickMarkType.Year) return String(p.anio);
          if (tipo === TickMarkType.Month) return `${MESES[p.mes - 1]} ${String(p.anio).slice(2)}`;
          if (tipo === TickMarkType.DayOfMonth) return `${p.dia} ${MESES[p.mes - 1]}`;
          return hora(ms, zona);
        },
      },
    });
  }, [zona]);

  // ---------------------------------------------------------------- datos
  useEffect(() => {
    const g = grafico.current;
    const s = serie.current;
    if (!g || !s) return;
    const pos = css('--pos');
    const neg = css('--neg');
    const ts = g.timeScale();
    const pegadoALaDerecha = ts.scrollPosition() > 2;
    const cambioTf = estadoRef.current.tf !== tf;
    s.setData(
      velas.map((v) => {
        const base = { time: (v.t / 1000) as UTCTimestamp, open: v.o, high: v.h, low: v.l, close: v.c };
        if (!v.parcial) return base;
        const c = v.c >= v.o ? pos : neg;
        return { ...base, color: v.c >= v.o ? 'rgba(0,0,0,0)' : conAlfa(c, 0.45), borderColor: conAlfa(c, 0.6), wickColor: conAlfa(c, 0.6) };
      }),
    );
    if (cambioTf || estadoRef.current.n === 0) {
      const n = velas.length;
      ts.setVisibleLogicalRange({ from: Math.max(0, n - 140), to: n + 14 });
    } else if (pegadoALaDerecha) {
      ts.scrollToRealTime();
    }
    estadoRef.current = { tf, n: velas.length };
    (g as unknown as { __recalcular: () => void }).__recalcular?.();
  }, [velas, tf]);

  useEffect(() => {
    (grafico.current as unknown as { __recalcular?: () => void } | null)?.__recalcular?.();
  }, [sesiones]);

  // ---------------------------------------------------------------- líneas de precio (niveles y órdenes)
  useEffect(() => {
    const s = serie.current;
    if (!s) return;
    const color = { nivel: css('--text-3'), entrada: css('--text'), sl: css('--neg'), tp: css('--pos'), zona: css('--gold') };
    const vistas = new Set<string>();
    for (const l of lineas) {
      const clave = `${l.id}:${l.tipo}:${l.precio}:${l.titulo}`;
      vistas.add(clave);
      if (lineasRef.current.has(clave)) continue;
      lineasRef.current.set(
        clave,
        s.createPriceLine({
          price: l.precio,
          color: color[l.tipo],
          lineWidth: 1,
          lineStyle: l.tipo === 'nivel' || l.tipo === 'zona' ? LineStyle.Dotted : LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.titulo,
        }),
      );
    }
    for (const [k, pl] of lineasRef.current) {
      if (!vistas.has(k)) {
        s.removePriceLine(pl);
        lineasRef.current.delete(k);
      }
    }
  }, [lineas]);

  // ---------------------------------------------------------------- marcas (se anclan a la vela que contiene el instante)
  useEffect(() => {
    const s = serie.current;
    if (!s) return;
    const pos = css('--pos');
    const neg = css('--neg');
    const txt = css('--text-2');
    const m: SeriesMarker<Time>[] = [];
    for (const x of marcas) {
      const i = velaQueContiene(velas, x.t);
      if (i < 0) continue;
      const time = (velas[i].t / 1000) as UTCTimestamp;
      if (x.tipo === 'compra') m.push({ time, position: 'belowBar', shape: 'arrowUp', color: pos, text: x.texto });
      else if (x.tipo === 'venta') m.push({ time, position: 'aboveBar', shape: 'arrowDown', color: neg, text: x.texto });
      else if (x.tipo === 'entrada') m.push({ time, position: 'belowBar', shape: 'circle', color: txt, text: x.texto });
      else if (x.tipo === 'pivoteAlto') m.push({ time, position: 'aboveBar', shape: 'circle', color: css('--text-3'), text: x.texto, size: 0.5 });
      else if (x.tipo === 'pivoteBajo') m.push({ time, position: 'belowBar', shape: 'circle', color: css('--text-3'), text: x.texto, size: 0.5 });
      else if (x.tipo === 'ruptura') m.push({ time, position: x.arriba ? 'aboveBar' : 'belowBar', shape: 'square', color: css('--gold'), text: x.texto, size: 0.6 });
      else m.push({ time, position: 'aboveBar', shape: 'square', color: txt, text: x.texto });
    }
    m.sort((a, b) => (a.time as number) - (b.time as number));
    s.setMarkers(m);
  }, [marcas, velas]);

  const ultima = velas[velas.length - 1];
  const v = leyenda ?? ultima;
  const regionVisible = mostrarLimite && geo.limiteX !== null && geo.limiteX < geo.anchoTrazado - 2;
  const anchoRegion = regionVisible ? geo.anchoTrazado - Math.max(0, geo.limiteX!) : 0;
  const etiquetaDentro = anchoRegion > 150;

  return (
    <div className="grafico" style={{ height: alto }} role="img" aria-label={etiqueta}>
      <div ref={caja} className="grafico__lienzo" />
      {v && (
        <div className="grafico__leyenda" aria-hidden="true">
          <span>
            A <b>{precio(v.o)}</b>
          </span>
          <span>
            M <b>{precio(v.h)}</b>
          </span>
          <span>
            m <b>{precio(v.l)}</b>
          </span>
          <span>
            C <b>{precio(v.c)}</b>
          </span>
          <span>{fechaHora(v.t, zona)}</span>
          {v.parcial && <span className="tono-aviso">en formación</span>}
        </div>
      )}
      {regionVisible && (
        <div className="grafico__sin-revelar" style={{ left: Math.max(0, geo.limiteX!), width: anchoRegion, height: geo.altoTrazado }}>
          {limiteMs && (
            <div
              className="grafico__etiqueta-limite"
              style={etiquetaDentro ? undefined : { left: 'auto', right: 'calc(100% + 8px)', alignItems: 'flex-end' }}
            >
              <strong>Límite</strong>
              {etiquetaLimite ?? fechaHora(limiteMs, zona)}
              <span>lo posterior no se carga</span>
            </div>
          )}
        </div>
      )}
      {geo.sesiones.length > 0 && (
        <div className="grafico__sesiones" style={{ top: geo.altoTrazado - 18, width: geo.anchoTrazado }} aria-hidden="true">
          {geo.sesiones.map((s, i) => (
            <span key={`${s.nombre}-${i}-${s.x}`} className={`sesion sesion--${s.nombre.replace(' ', '')}`} style={{ left: s.x, width: s.ancho }}>
              {s.ancho > 46 ? s.nombre : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
