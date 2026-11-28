/**
 * Dibujo de cajas, segmentos y etiquetas de los indicadores superpuestos (por ejemplo Smart Money Concepts):
 * una primitiva de lightweight-charts que pinta sobre el panel de precios. Los tiempos se pasan a coordenadas con el
 * índice lógico de las velas, así que también se pueden dibujar a la derecha de la última vela (extensiones).
 */
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { ResultadoIndicador } from '../api/contrato.gen';

export interface DatosDibujo {
  tiempos: number[];
  tfMs: number;
  resultados: Pick<ResultadoIndicador, 'cajas' | 'segmentos' | 'etiquetas'>[];
}

/** Índice lógico (fraccionario) de un tiempo, con las velas como referencia. */
export function logicoDe(tiempos: number[], tfMs: number, t: number): number {
  const n = tiempos.length;
  if (!n) return 0;
  if (t <= tiempos[0]) return (t - tiempos[0]) / tfMs;
  if (t >= tiempos[n - 1]) return n - 1 + (t - tiempos[n - 1]) / tfMs;
  let a = 0;
  let b = n - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (tiempos[m] <= t) a = m;
    else b = m;
  }
  return a + (t - tiempos[a]) / Math.max(1, tiempos[b] - tiempos[a]);
}

const GUIONES: Record<string, number[]> = { solida: [], guiones: [6, 4], puntos: [1.5, 3] };

class Renderizador implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly p: PrimitivaIndicadores) {}

  draw(target: CanvasRenderingTarget2D) {
    const { chart, series, datos } = this.p;
    if (!chart || !series || !datos || !datos.tiempos.length) return;
    const ts = chart.timeScale();
    const x = (t: number) => ts.logicalToCoordinate(logicoDe(datos.tiempos, datos.tfMs, t) as Logical);
    const y = (p: number) => series.priceToCoordinate(p);
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const fuente = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
      for (const r of datos.resultados) {
        for (const c of r.cajas) {
          const x0 = x(c.t0);
          const x1 = c.t1 === null ? mediaSize.width : x(c.t1);
          const y0 = y(c.arriba);
          const y1 = y(c.abajo);
          if (x0 === null || x1 === null || y0 === null || y1 === null) continue;
          const izq = Math.max(-10, Math.min(x0, x1));
          const ancho = Math.min(mediaSize.width + 10, Math.max(x0, x1)) - izq;
          if (ancho <= 0) continue;
          ctx.fillStyle = c.color;
          ctx.fillRect(izq, Math.min(y0, y1), ancho, Math.max(1, Math.abs(y1 - y0)));
          if (c.borde) {
            ctx.strokeStyle = c.borde;
            ctx.lineWidth = 1;
            ctx.strokeRect(izq + 0.5, Math.min(y0, y1) + 0.5, ancho, Math.max(1, Math.abs(y1 - y0)));
          }
          if (c.texto) {
            ctx.font = `600 11px ${fuente}`;
            ctx.fillStyle = c.color_texto ?? c.color;
            const tx = c.posicion === 'izq' ? Math.min(mediaSize.width - 80, izq + ancho - 4) : izq + Math.min(ancho, mediaSize.width - izq) / 2;
            ctx.textAlign = c.posicion === 'izq' ? 'right' : 'center';
            ctx.textBaseline = c.posicion === 'abajo' ? 'top' : c.posicion === 'izq' ? 'middle' : 'bottom';
            const ty = c.posicion === 'abajo' ? Math.max(y0, y1) + 2 : c.posicion === 'izq' ? (y0 + y1) / 2 : Math.min(y0, y1) - 2;
            ctx.fillText(c.texto, tx, ty);
          }
        }
        for (const s of r.segmentos) {
          const x0 = x(s.t0);
          const x1 = x(s.t1);
          const y0 = y(s.p0);
          const y1 = y(s.p1);
          if (x0 === null || x1 === null || y0 === null || y1 === null) continue;
          if (Math.max(x0, x1) < -10 || Math.min(x0, x1) > mediaSize.width + 10) continue;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 1;
          ctx.setLineDash(GUIONES[s.estilo] ?? []);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.setLineDash([]);
          if (s.texto) {
            const xt = s.t_texto !== null ? x(s.t_texto) : (x0 + x1) / 2;
            if (xt === null) continue;
            ctx.font = `${s.tamano === 'chico' ? 10 : 11}px ${fuente}`;
            ctx.fillStyle = s.color;
            const final = s.t_texto !== null && s.t_texto >= s.t1;
            ctx.textAlign = final ? 'right' : 'center';
            ctx.textBaseline = s.posicion === 'abajo' ? 'top' : 'bottom';
            ctx.fillText(s.texto, final ? Math.min(xt, mediaSize.width - 4) : xt, s.posicion === 'abajo' ? y0 + 2 : y0 - 2);
          }
        }
        for (const e of r.etiquetas) {
          const xe = x(e.t);
          const ye = y(e.precio);
          if (xe === null || ye === null || xe < -20 || xe > mediaSize.width + 20) continue;
          ctx.font = `600 10px ${fuente}`;
          ctx.fillStyle = e.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = e.posicion === 'abajo' ? 'top' : 'bottom';
          ctx.fillText(e.texto, xe, e.posicion === 'abajo' ? ye + 4 : ye - 4);
        }
      }
    });
  }
}

class Vista implements ISeriesPrimitivePaneView {
  constructor(private readonly r: Renderizador) {}
  zOrder() {
    return 'bottom' as const;
  }
  renderer() {
    return this.r;
  }
}

export class PrimitivaIndicadores implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  datos: DatosDibujo | null = null;
  private pedir: (() => void) | null = null;
  private readonly vistas = [new Vista(new Renderizador(this))];

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.pedir = p.requestUpdate;
  }
  detached() {
    this.chart = null;
    this.series = null;
    this.pedir = null;
  }
  paneViews() {
    return this.vistas;
  }
  fijar(d: DatosDibujo | null) {
    this.datos = d;
    this.pedir?.();
  }
}
