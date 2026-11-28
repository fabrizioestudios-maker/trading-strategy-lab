/**
 * Panel de un indicador debajo del gráfico (RSI, MACD, estocástico, ADX…). Usa las mismas horas que las velas (los
 * valores de calentamiento van como espacios en blanco), así que los índices lógicos coinciden y el panel sigue el
 * zoom y el desplazamiento del gráfico principal. Los valores los calcula la API solo con lo revelado.
 */
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from 'lightweight-charts';
import { useEffect, useRef, type ReactNode } from 'react';
import type { ResultadoIndicador, Vela } from '../api/contrato.gen';
import { fechaHora, hora, numero, partes, type Zona } from '../lib/formato';
import { ANCHO_ESCALA } from './GraficoVelas';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const ultimo = (a: (number | null)[]) => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null && a[i] !== undefined) return a[i] as number;
  return null;
};

export function PanelIndicador({
  resultado: r,
  velas,
  rango,
  zona,
  alto,
  ejeTiempo,
  children,
}: {
  resultado: ResultadoIndicador;
  velas: Vela[];
  rango: { from: number; to: number } | null;
  zona: Zona;
  alto: number;
  ejeTiempo: boolean;
  /** leyenda con nombre, valores y botones */
  children?: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const g = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Line' | 'Histogram'>[]>([]);
  const firma = [r.id, ...r.lineas.map((l) => `${l.nombre}|${l.color}|${l.estilo}`), ...r.histogramas.map((h) => h.nombre), ...r.niveles.map((n) => n.valor), r.rango?.join('-')].join(';');
  const dec = r.rango && r.rango[1] - r.rango[0] >= 50 ? 1 : 2;

  useEffect(() => {
    if (!caja.current) return;
    const chart = createChart(caja.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: css('--chart-bg') }, textColor: css('--text-3'), fontFamily: css('--font'), fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      rightPriceScale: { borderColor: css('--line'), minimumWidth: ANCHO_ESCALA, scaleMargins: { top: 0.14, bottom: 0.08 } },
      timeScale: { borderColor: css('--line'), rightOffset: 14, barSpacing: 7, minBarSpacing: 1.5, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { labelBackgroundColor: '#1a2130' }, horzLine: { labelBackgroundColor: '#1a2130' } },
      handleScroll: false,
      handleScale: false,
      localization: { locale: 'es-AR', priceFormatter: (p: number) => numero(p, dec), timeFormatter: (t: Time) => fechaHora((t as number) * 1000, zona) },
    });
    const escala = r.rango ? () => ({ priceRange: { minValue: r.rango![0], maxValue: r.rango![1] } }) : undefined;
    const nuevas: ISeriesApi<'Line' | 'Histogram'>[] = [];
    for (let k = 0; k < r.histogramas.length; k++)
      nuevas.push(chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: escala }) as ISeriesApi<'Histogram'>);
    for (const l of r.lineas)
      nuevas.push(
        chart.addLineSeries({
          color: l.color,
          lineWidth: Math.max(1, Math.min(4, l.ancho)) as 1 | 2 | 3 | 4,
          lineStyle: l.estilo === 'guiones' ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: true,
          autoscaleInfoProvider: escala,
        }) as ISeriesApi<'Line'>,
      );
    const base = nuevas[0];
    if (base)
      for (const n of r.niveles) base.createPriceLine({ price: n.valor, color: n.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
    series.current = nuevas;
    g.current = chart;
    return () => {
      chart.remove();
      g.current = null;
      series.current = [];
    };
    // la firma cambia solo si cambia la forma del indicador (no sus valores)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, zona]);

  useEffect(() => {
    g.current?.applyOptions({
      timeScale: {
        visible: ejeTiempo,
        tickMarkFormatter: (t: Time, tm: number) => {
          const ms = (t as number) * 1000;
          const p = partes(ms, zona);
          if (tm === 0) return String(p.anio);
          if (tm === 1) return `${MESES[p.mes - 1]} ${String(p.anio).slice(2)}`;
          if (tm === 2) return `${p.dia} ${MESES[p.mes - 1]}`;
          return hora(ms, zona);
        },
      },
    });
  }, [ejeTiempo, zona, firma]);

  useEffect(() => {
    if (r.lineas.some((l) => l.valores.length !== velas.length)) return;
    const t = (i: number) => (velas[i].t / 1000) as UTCTimestamp;
    const datos = (vals: (number | null)[], colores?: (string | null)[] | null) =>
      vals.map((v, i) => (v === null || v === undefined ? ({ time: t(i) } as WhitespaceData<Time>) : { time: t(i), value: v, ...(colores?.[i] ? { color: colores[i] as string } : {}) }));
    let k = 0;
    for (const h of r.histogramas) series.current[k++]?.setData(datos(h.valores, h.colores));
    for (const l of r.lineas) series.current[k++]?.setData(datos(l.valores));
    if (rango) g.current?.timeScale().setVisibleLogicalRange(rango);
  }, [velas, r, firma, rango]);

  useEffect(() => {
    if (rango && g.current) g.current.timeScale().setVisibleLogicalRange(rango);
  }, [rango]);

  return (
    <div className="indicador" style={{ height: alto }}>
      <div className="indicador__leyenda">{children}</div>
      <div
        ref={caja}
        className="grafico__lienzo"
        role="img"
        aria-label={`${r.nombre}: ${r.lineas.map((l) => `${l.nombre} ${numero(ultimo(l.valores), 2)}`).join(', ')}`}
      />
    </div>
  );
}
