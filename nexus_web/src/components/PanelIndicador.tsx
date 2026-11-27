/**
 * Panel de indicador debajo del gráfico de velas (RSI o MACD). Usa las mismas horas que las velas (los valores de
 * calentamiento van como espacios en blanco), así que los índices lógicos coinciden y el panel sigue el zoom y el
 * desplazamiento del gráfico principal. Los valores los calcula la API (lab/senales.py) solo con lo revelado.
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
import { useEffect, useRef } from 'react';
import type { Indicadores, Vela } from '../api/contrato.gen';
import { fechaHora, hora, numero, partes, type Zona } from '../lib/formato';
import { ANCHO_ESCALA } from './GraficoVelas';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function PanelIndicador({
  tipo,
  velas,
  ind,
  rango,
  zona,
  alto,
  ejeTiempo,
}: {
  tipo: 'rsi' | 'macd';
  velas: Vela[];
  ind: Indicadores;
  rango: { from: number; to: number } | null;
  zona: Zona;
  alto: number;
  ejeTiempo: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const g = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Line' | 'Histogram'>[]>([]);

  useEffect(() => {
    if (!caja.current) return;
    const chart = createChart(caja.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: css('--chart-bg') }, textColor: css('--text-3'), fontFamily: css('--font'), fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      rightPriceScale: { borderColor: css('--line'), minimumWidth: ANCHO_ESCALA, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: css('--line'), rightOffset: 14, barSpacing: 7, minBarSpacing: 1.5, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { labelBackgroundColor: '#1a2130' }, horzLine: { labelBackgroundColor: '#1a2130' } },
      handleScroll: false,
      handleScale: false,
      localization: { locale: 'es-AR', priceFormatter: (p: number) => numero(p, tipo === 'rsi' ? 0 : 2), timeFormatter: (t: Time) => fechaHora((t as number) * 1000, zona) },
    });
    if (tipo === 'rsi') {
      const l = chart.addLineSeries({
        color: css('--gold-claro'),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      });
      for (const v of [70, 30]) l.createPriceLine({ price: v, color: css('--line-strong'), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
      series.current = [l];
    } else {
      const h = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      const m = chart.addLineSeries({ color: css('--gold'), lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      const sl = chart.addLineSeries({ color: css('--text-2'), lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      series.current = [h, m, sl];
    }
    g.current = chart;
    return () => {
      chart.remove();
      g.current = null;
      series.current = [];
    };
  }, [tipo, zona]);

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
  }, [ejeTiempo, zona]);

  useEffect(() => {
    const t = (i: number) => (velas[i].t / 1000) as UTCTimestamp;
    const serie = (vals: (number | null)[]) =>
      vals.map((v, i) => (v === null || v === undefined ? ({ time: t(i) } as WhitespaceData<Time>) : { time: t(i), value: v }));
    if (tipo === 'rsi') {
      series.current[0]?.setData(serie(ind.rsi.slice(-velas.length)));
    } else {
      const alza = css('--alza');
      const baja = css('--baja');
      const hist = ind.histograma.slice(-velas.length).map((v, i) =>
        v === null || v === undefined ? ({ time: t(i) } as WhitespaceData<Time>) : { time: t(i), value: v, color: v >= 0 ? `${alza}99` : `${baja}99` },
      );
      series.current[0]?.setData(hist);
      series.current[1]?.setData(serie(ind.macd.slice(-velas.length)));
      series.current[2]?.setData(serie(ind.senal.slice(-velas.length)));
    }
  }, [velas, ind, tipo]);

  useEffect(() => {
    if (rango && g.current) g.current.timeScale().setVisibleLogicalRange(rango);
  }, [rango]);

  const ultimo = (a: (number | null)[]) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null && a[i] !== undefined) return a[i] as number;
    return null;
  };
  return (
    <div className="indicador" style={{ height: alto }}>
      <div className="indicador__leyenda" aria-hidden="true">
        {tipo === 'rsi' ? (
          <>
            RSI {ind.rsi_n} <b className="tono-acento">{numero(ultimo(ind.rsi), 2)}</b>
          </>
        ) : (
          <>
            MACD {ind.macd_rapida} {ind.macd_lenta} {ind.macd_senal} <b className="tono-acento">{numero(ultimo(ind.macd), 2)}</b> <b>{numero(ultimo(ind.senal), 2)}</b>{' '}
            <b className={(ultimo(ind.histograma) ?? 0) >= 0 ? 'tono-alza' : 'tono-baja'}>{numero(ultimo(ind.histograma), 2)}</b>
          </>
        )}
      </div>
      <div
        ref={caja}
        className="grafico__lienzo"
        role="img"
        aria-label={
          tipo === 'rsi' ? `RSI ${ind.rsi_n}: ${numero(ultimo(ind.rsi), 2)}` : `MACD ${numero(ultimo(ind.macd), 2)}, señal ${numero(ultimo(ind.senal), 2)}`
        }
      />
    </div>
  );
}
