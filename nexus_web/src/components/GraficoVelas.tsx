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
  type WhitespaceData,
} from 'lightweight-charts';
import type { ReactNode } from 'react';
import type { ResultadoIndicador } from '../api/contrato.gen';
import { PrimitivaIndicadores } from './primitivaIndicadores';
import { PrimitivaDibujos, tiempoDeLogico } from './primitivaDibujos';
import { HERRAMIENTAS_DIBUJO, heikinAshi, type Dibujo, type Punto, type TipoDibujo, type TipoGrafico } from '../lib/grafico';
import { useEffect, useRef, useState } from 'react';
import type { Vela, VentanaSesion } from '../api/contrato.gen';
import { fechaHora, hora, partes, precio, type Zona } from '../lib/formato';
import { velaQueContiene } from '../lib/replay';

export interface LineaPrecio {
  id: string;
  precio: number;
  titulo: string;
  tipo: 'nivel' | 'entrada' | 'sl' | 'tp' | 'zona' | 'rango';
}

export interface Marca {
  t: number;
  tipo: 'compra' | 'venta' | 'salida' | 'entrada';
  texto: string;
  arriba?: boolean;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const ANCHO_ESCALA = 78;

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
  ejeTiempo = true,
  onRango,
  superpuestos = [],
  children,
  tipo = 'velas',
  escalaLog = false,
  dibujos = [],
  herramienta = null,
  colorDibujo = '#e8a83a',
  seleccionado = null,
  onDibujo,
  onSeleccion,
  decimales = 2,
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
  /** false cuando abajo hay paneles de indicadores que muestran el eje de tiempo */
  ejeTiempo?: boolean;
  /** Rango lógico visible, para sincronizar los paneles de indicadores */
  onRango?: (r: { from: number; to: number } | null) => void;
  /** Indicadores que se dibujan sobre el precio (líneas, cajas, segmentos, etiquetas, color de velas) */
  superpuestos?: ResultadoIndicador[];
  /** Controles encima del gráfico (leyenda de indicadores) */
  children?: ReactNode;
  tipo?: TipoGrafico;
  escalaLog?: boolean;
  dibujos?: Dibujo[];
  /** Herramienta de dibujo activa (null = cursor) */
  herramienta?: TipoDibujo | null;
  colorDibujo?: string;
  seleccionado?: string | null;
  onDibujo?: (d: Dibujo) => void;
  onSeleccion?: (id: string | null) => void;
  decimales?: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const grafico = useRef<IChartApi | null>(null);
  const serie = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineasRef = useRef<Map<string, IPriceLine>>(new Map());
  const estadoRef = useRef({ tf: 0, n: 0 });
  const onRangoRef = useRef(onRango);
  onRangoRef.current = onRango;
  const velasRef = useRef<Vela[]>(velas);
  velasRef.current = velas;
  const sesionesRef = useRef<VentanaSesion[]>(sesiones);
  sesionesRef.current = sesiones;
  const [geo, setGeo] = useState<Geometria>({ limiteX: null, anchoTrazado: 0, altoTrazado: 0, sesiones: [] });
  const [leyenda, setLeyenda] = useState<Vela | null>(null);
  const primitiva = useRef(new PrimitivaIndicadores());
  const dib = useRef(new PrimitivaDibujos());
  const extra = useRef<ISeriesApi<'Bar' | 'Line' | 'Area'> | null>(null);
  const herramientaRef = useRef(herramienta);
  herramientaRef.current = herramienta;
  const enCurso = useRef<Punto | null>(null);
  const cbRef = useRef({ onDibujo, onSeleccion, colorDibujo });
  cbRef.current = { onDibujo, onSeleccion, colorDibujo };
  const seriesInd = useRef(new Map<string, { firma: string; series: ISeriesApi<'Line' | 'Histogram'>[] }>());

  // ---------------------------------------------------------------- creación
  useEffect(() => {
    if (!caja.current) return;
    const texto = css('--text-3');
    const linea = css('--line');
    const g = createChart(caja.current, {
      autoSize: true,
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      rightPriceScale: { borderColor: linea, scaleMargins: { top: 0.1, bottom: 0.1 }, minimumWidth: ANCHO_ESCALA },
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
      upColor: css('--alza'),
      downColor: css('--baja'),
      borderUpColor: css('--alza'),
      borderDownColor: css('--baja'),
      wickUpColor: css('--alza'),
      wickDownColor: css('--baja'),
      priceLineColor: css('--text-3'),
      priceLineStyle: LineStyle.Dotted,
    });
    grafico.current = g;
    serie.current = s;
    s.attachPrimitive(primitiva.current);
    s.attachPrimitive(dib.current);
    // dibujo: el primer clic fija un punto; el segundo (o el único, en la línea horizontal) termina el dibujo
    const puntoDe = (p: { logical?: number; point?: { x: number; y: number } }): Punto | null => {
      if (p.logical === undefined || !p.point) return null;
      const precioY = s.coordinateToPrice(p.point.y);
      if (precioY === null) return null;
      return { t: Math.round(tiempoDeLogico(velasRef.current.map((x) => x.t), estadoRef.current.tf * 60_000, p.logical)), p: precioY };
    };
    const alClic = (p: { logical?: number; point?: { x: number; y: number } }) => {
      const h = herramientaRef.current;
      if (!h) {
        if (p.point) cbRef.current.onSeleccion?.(dib.current.buscar(p.point.x, p.point.y, caja.current?.clientWidth ?? 0));
        return;
      }
      const pt = puntoDe(p as never);
      if (!pt) return;
      const def = HERRAMIENTAS_DIBUJO.find((x) => x.id === h)!;
      // un doble clic no cierra un dibujo de largo cero
      if (enCurso.current && p.point && Math.abs(pt.t - enCurso.current.t) < 1 && Math.abs(pt.p - enCurso.current.p) < 1e-9) return;
      if (def.puntos === 1 || enCurso.current) {
        const puntos = def.puntos === 1 ? [pt] : [enCurso.current!, pt];
        enCurso.current = null;
        dib.current.fijar({ provisional: null });
        cbRef.current.onDibujo?.({ id: `d${Date.now().toString(36)}`, tipo: h, puntos, color: cbRef.current.colorDibujo });
      } else enCurso.current = pt;
    };
    // clics del navegador (no los del gráfico, que agrupan dos clics rápidos en un doble clic); un arrastre no cuenta
    let abajo: { x: number; y: number } | null = null;
    const nodo = caja.current;
    const alBajar = (e: PointerEvent) => (abajo = { x: e.clientX, y: e.clientY });
    const alSoltar = (e: MouseEvent) => {
      if (!abajo || Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 4) return;
      const r = nodo.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width - g.priceScale('right').width() || y > r.height - g.timeScale().height()) return;
      const logical = g.timeScale().coordinateToLogical(x);
      alClic({ logical: logical === null ? undefined : (logical as number), point: { x, y } });
    };
    nodo.addEventListener('pointerdown', alBajar);
    nodo.addEventListener('click', alSoltar);
    g.subscribeCrosshairMove((p) => {
      const h = herramientaRef.current;
      if (!h || !enCurso.current) return;
      const pt = puntoDe(p as never);
      if (pt) dib.current.fijar({ provisional: { id: 'provisional', tipo: h, puntos: [enCurso.current, pt], color: cbRef.current.colorDibujo } });
    });

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
    g.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      recalcular();
      onRangoRef.current?.(r ? { from: r.from, to: r.to } : null);
    });
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
      nodo.removeEventListener('pointerdown', alBajar);
      nodo.removeEventListener('click', alSoltar);
      ro.disconnect();
      g.remove();
      grafico.current = null;
      serie.current = null;
      lineasRef.current.clear();
      seriesInd.current.clear();
    };
  }, []);

  useEffect(() => {
    grafico.current?.applyOptions({ timeScale: { visible: ejeTiempo } });
  }, [ejeTiempo]);

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
    const pos = css('--alza');
    const neg = css('--baja');
    const ts = g.timeScale();
    const pegadoALaDerecha = ts.scrollPosition() > 2;
    const cambioTf = estadoRef.current.tf !== tf;
    const colores = tipo === 'velas' || tipo === 'heikin' ? (superpuestos.find((r) => r.colores_velas && r.colores_velas.length === velas.length)?.colores_velas ?? null) : null;
    const base = tipo === 'heikin' ? heikinAshi(velas) : velas;
    const ex = extra.current;
    if (ex) {
      if (tipo === 'barras') (ex as ISeriesApi<'Bar'>).setData(velas.map((v) => ({ time: (v.t / 1000) as UTCTimestamp, open: v.o, high: v.h, low: v.l, close: v.c })));
      else (ex as ISeriesApi<'Line'>).setData(velas.map((v) => ({ time: (v.t / 1000) as UTCTimestamp, value: v.c })));
    }
    s.setData(
      base.map((v, i) => {
        const base = { time: (v.t / 1000) as UTCTimestamp, open: v.o, high: v.h, low: v.l, close: v.c };
        const cv = colores?.[i];
        if (!v.parcial) return cv ? { ...base, color: cv, borderColor: cv, wickColor: cv } : base;
        const c = v.c >= v.o ? pos : neg;
        return { ...base, color: conAlfa(c, 0.35), borderColor: conAlfa(c, 0.75), wickColor: conAlfa(c, 0.75) };
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
  }, [velas, tf, superpuestos, tipo]);

  // ---------------------------------------------------------------- tipo de gráfico y escala
  useEffect(() => {
    const g = grafico.current;
    const s = serie.current;
    if (!g || !s) return;
    if (extra.current) {
      g.removeSeries(extra.current);
      extra.current = null;
    }
    const velasVisibles = tipo === 'velas' || tipo === 'heikin';
    const nada = 'rgba(0,0,0,0)';
    s.applyOptions(
      velasVisibles
        ? { upColor: css('--alza'), downColor: css('--baja'), borderVisible: true, wickVisible: true, priceLineVisible: true }
        : { upColor: nada, downColor: nada, borderVisible: false, wickVisible: false, priceLineVisible: false },
    );
    const oro = css('--gold');
    if (tipo === 'barras') extra.current = g.addBarSeries({ upColor: css('--alza'), downColor: css('--baja'), thinBars: false, priceLineVisible: false, lastValueVisible: false });
    if (tipo === 'linea') extra.current = g.addLineSeries({ color: oro, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    if (tipo === 'area') extra.current = g.addAreaSeries({ lineColor: oro, topColor: `${oro}55`, bottomColor: `${oro}05`, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const v = velasRef.current;
    if (extra.current && v.length) {
      if (tipo === 'barras') (extra.current as ISeriesApi<'Bar'>).setData(v.map((x) => ({ time: (x.t / 1000) as UTCTimestamp, open: x.o, high: x.h, low: x.l, close: x.c })));
      else (extra.current as ISeriesApi<'Line'>).setData(v.map((x) => ({ time: (x.t / 1000) as UTCTimestamp, value: x.c })));
    }
  }, [tipo]);

  useEffect(() => {
    grafico.current?.priceScale('right').applyOptions({ mode: escalaLog ? 1 : 0 });
  }, [escalaLog]);

  useEffect(() => {
    dib.current.fijar({ dibujos, seleccionado, tiempos: velas.map((v) => v.t), tfMs: tf * 60_000, decimales });
  }, [dibujos, seleccionado, velas, tf, decimales]);

  useEffect(() => {
    // cambiar de herramienta descarta el dibujo a medio hacer
    enCurso.current = null;
    dib.current.fijar({ provisional: null });
  }, [herramienta]);

  // ---------------------------------------------------------------- indicadores superpuestos
  useEffect(() => {
    const g = grafico.current;
    if (!g) return;
    const tiempo = (i: number) => (velas[i].t / 1000) as UTCTimestamp;
    const vivos = new Set<string>();
    for (const r of superpuestos) {
      if (r.lineas.length + r.histogramas.length === 0) continue;
      const alineado = r.lineas.every((l) => l.valores.length === velas.length);
      if (!alineado) continue;
      vivos.add(r.instancia);
      const firma = [...r.lineas.map((l) => `${l.nombre}|${l.color}|${l.estilo}|${l.ancho}`), ...r.histogramas.map((h) => `h:${h.nombre}`)].join(';');
      let ent = seriesInd.current.get(r.instancia);
      if (!ent || ent.firma !== firma) {
        ent?.series.forEach((x) => g.removeSeries(x));
        const nuevas: ISeriesApi<'Line' | 'Histogram'>[] = [];
        for (let k = 0; k < r.histogramas.length; k++) nuevas.push(g.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, title: '' }) as ISeriesApi<'Histogram'>);
        for (const l of r.lineas)
          nuevas.push(
            g.addLineSeries({
              color: l.color,
              lineWidth: Math.max(1, Math.min(4, l.ancho)) as 1 | 2 | 3 | 4,
              lineStyle: l.estilo === 'guiones' ? LineStyle.Dashed : LineStyle.Solid,
              lineVisible: l.estilo !== 'puntos',
              pointMarkersVisible: l.estilo === 'puntos',
              pointMarkersRadius: 1.5,
              priceLineVisible: false,
              lastValueVisible: true,
              crosshairMarkerVisible: false,
            }) as ISeriesApi<'Line'>,
          );
        ent = { firma, series: nuevas };
        seriesInd.current.set(r.instancia, ent);
      }
      const datos = (vals: (number | null)[], colores?: (string | null)[] | null) =>
        vals.map((v, i) =>
          v === null || v === undefined ? ({ time: tiempo(i) } as WhitespaceData<Time>) : { time: tiempo(i), value: v, ...(colores?.[i] ? { color: colores[i] as string } : {}) },
        );
      let k = 0;
      for (const h of r.histogramas) ent.series[k++].setData(datos(h.valores, h.colores));
      for (const l of r.lineas) ent.series[k++].setData(datos(l.valores));
    }
    for (const [id, ent] of seriesInd.current) {
      if (vivos.has(id)) continue;
      ent.series.forEach((x) => g.removeSeries(x));
      seriesInd.current.delete(id);
    }
    primitiva.current.fijar(
      superpuestos.length && velas.length ? { tiempos: velas.map((v) => v.t), tfMs: tf * 60_000, resultados: superpuestos } : null,
    );
  }, [superpuestos, velas, tf]);

  useEffect(() => {
    (grafico.current as unknown as { __recalcular?: () => void } | null)?.__recalcular?.();
  }, [sesiones]);

  // ---------------------------------------------------------------- líneas de precio (niveles y órdenes)
  useEffect(() => {
    const s = serie.current;
    if (!s) return;
    const color = { nivel: css('--text-3'), entrada: css('--text'), sl: css('--neg'), tp: css('--pos'), zona: css('--gold'), rango: css('--gold-claro') };
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
          lineStyle: l.tipo === 'nivel' || l.tipo === 'zona' ? LineStyle.Dotted : l.tipo === 'rango' ? LineStyle.SparseDotted : LineStyle.Dashed,
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
    const pos = css('--alza');
    const neg = css('--baja');
    const txt = css('--text-2');
    const m: SeriesMarker<Time>[] = [];
    for (const x of marcas) {
      const i = velaQueContiene(velas, x.t);
      if (i < 0) continue;
      const time = (velas[i].t / 1000) as UTCTimestamp;
      if (x.tipo === 'compra') m.push({ time, position: 'belowBar', shape: 'arrowUp', color: pos, text: x.texto });
      else if (x.tipo === 'venta') m.push({ time, position: 'aboveBar', shape: 'arrowDown', color: neg, text: x.texto });
      else if (x.tipo === 'entrada') m.push({ time, position: 'belowBar', shape: 'circle', color: txt, text: x.texto });
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
    <div className={`grafico${herramienta ? ' es-dibujando' : ''}`} style={{ height: alto }} role="img" aria-label={etiqueta}>
      <div ref={caja} className="grafico__lienzo" />
      {children}
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
