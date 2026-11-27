/** Serie temporal única (curva de capital o drawdown) con lightweight-charts. Una serie por gráfico: nunca dos ejes. */
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type SeriesMarker, type SeriesType, type Time, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { conSigno, fecha, type Zona } from '../lib/formato';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function GraficoSerie({
  puntos,
  tipo,
  zona,
  alto = 220,
  etiqueta,
  marcas = [],
}: {
  puntos: { t: number; v: number }[];
  tipo: 'linea' | 'caida';
  zona: Zona;
  alto?: number;
  etiqueta: string;
  marcas?: { t: number; texto: string }[];
}) {
  const caja = useRef<HTMLDivElement>(null);
  const g = useRef<IChartApi | null>(null);
  const s = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!caja.current) return;
    const chart = createChart(caja.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: css('--chart-bg') }, textColor: css('--text-3'), fontFamily: css('--font'), fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: css('--line') },
      timeScale: { borderColor: css('--line'), fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { labelBackgroundColor: '#1c2740' }, horzLine: { labelBackgroundColor: '#1c2740' } },
      localization: { locale: 'es-AR', priceFormatter: (p: number) => conSigno(p, 2), timeFormatter: (t: Time) => fecha((t as number) * 1000, zona) },
      handleScroll: false,
      handleScale: false,
    });
    const serie =
      tipo === 'linea'
        ? chart.addAreaSeries({
            lineColor: css('--gold'),
            topColor: 'rgba(232,168,58,0.32)',
            bottomColor: 'rgba(232,168,58,0.02)',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
          })
        : // el área va entre la línea y el cero (no hasta el borde del gráfico)
          chart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topLineColor: css('--neg'),
            topFillColor1: 'rgba(0,0,0,0)',
            topFillColor2: 'rgba(0,0,0,0)',
            bottomLineColor: css('--neg'),
            bottomFillColor1: 'rgba(224,107,74,0.10)',
            bottomFillColor2: 'rgba(224,107,74,0.30)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          });
    if (tipo === 'linea') serie.createPriceLine({ price: 0, color: css('--line-strong'), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
    g.current = chart;
    s.current = serie;
    return () => {
      chart.remove();
      g.current = null;
      s.current = null;
    };
  }, [tipo, zona]);

  useEffect(() => {
    if (!s.current || !g.current) return;
    s.current.setData(puntos.map((p) => ({ time: (p.t / 1000) as UTCTimestamp, value: p.v })));
    const m: SeriesMarker<Time>[] = marcas
      .map((x) => {
        const i = puntos.findIndex((p) => p.t >= x.t);
        return i < 0 ? null : ({ time: (puntos[i].t / 1000) as UTCTimestamp, position: 'aboveBar', shape: 'circle', color: css('--text-3'), text: x.texto } as SeriesMarker<Time>);
      })
      .filter((x): x is SeriesMarker<Time> => !!x);
    s.current.setMarkers(m);
    g.current.timeScale().fitContent();
  }, [puntos, marcas]);

  return <div className="grafico" style={{ height: alto }} role="img" aria-label={etiqueta} ref={caja} />;
}
