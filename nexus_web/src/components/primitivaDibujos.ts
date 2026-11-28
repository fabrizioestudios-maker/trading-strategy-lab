/**
 * Dibujos del usuario sobre el gráfico (línea de tendencia, rayo, línea horizontal, rectángulo, Fibonacci).
 * Se guardan en tiempo y precio, así que siguen al zoom y al desplazamiento, y se pueden extender a la derecha.
 */
import type { IChartApi, ISeriesApi, ISeriesPrimitive, ISeriesPrimitivePaneRenderer, Logical, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { NIVELES_FIBO, type Dibujo, type Punto } from '../lib/grafico';
import { logicoDe } from './primitivaIndicadores';

export function tiempoDeLogico(tiempos: number[], tfMs: number, l: number): number {
  const n = tiempos.length;
  if (!n) return 0;
  if (l <= 0) return tiempos[0] + l * tfMs;
  if (l >= n - 1) return tiempos[n - 1] + (l - (n - 1)) * tfMs;
  const i = Math.floor(l);
  return tiempos[i] + (l - i) * (tiempos[i + 1] - tiempos[i]);
}

interface Estado {
  dibujos: Dibujo[];
  provisional: Dibujo | null;
  seleccionado: string | null;
  tiempos: number[];
  tfMs: number;
  decimales: number;
}

function distSegmento(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + u * dx), py - (y0 + u * dy));
}

export class PrimitivaDibujos implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  estado: Estado = { dibujos: [], provisional: null, seleccionado: null, tiempos: [], tfMs: 60_000, decimales: 2 };
  private pedir: (() => void) | null = null;
  private readonly vista = { zOrder: () => 'top' as const, renderer: () => this.renderer };
  private readonly renderer: ISeriesPrimitivePaneRenderer = { draw: (t) => this.dibujar(t) };

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.pedir = p.requestUpdate;
  }
  detached() {
    this.chart = this.series = null;
    this.pedir = null;
  }
  paneViews() {
    return [this.vista];
  }
  fijar(e: Partial<Estado>) {
    this.estado = { ...this.estado, ...e };
    this.pedir?.();
  }

  private xy(p: Punto): [number, number] | null {
    if (!this.chart || !this.series) return null;
    const x = this.chart.timeScale().logicalToCoordinate(logicoDe(this.estado.tiempos, this.estado.tfMs, p.t) as Logical);
    const y = this.series.priceToCoordinate(p.p);
    return x === null || y === null ? null : [x, y];
  }

  /** Dibujo bajo el puntero (a menos de 6 px), para seleccionarlo. */
  buscar(px: number, py: number, ancho: number): string | null {
    for (const d of [...this.estado.dibujos].reverse()) {
      const a = this.xy(d.puntos[0]);
      if (!a) continue;
      if (d.tipo === 'horizontal') {
        if (Math.abs(py - a[1]) < 6) return d.id;
        continue;
      }
      const b = this.xy(d.puntos[1]);
      if (!b) continue;
      if (d.tipo === 'tendencia' && distSegmento(px, py, a[0], a[1], b[0], b[1]) < 6) return d.id;
      if (d.tipo === 'rayo') {
        const k = b[0] !== a[0] ? (ancho - a[0]) / (b[0] - a[0]) : 1;
        const fin: [number, number] = b[0] > a[0] ? [ancho, a[1] + k * (b[1] - a[1])] : b;
        if (distSegmento(px, py, a[0], a[1], fin[0], fin[1]) < 6) return d.id;
      }
      if (d.tipo === 'rectangulo' && px >= Math.min(a[0], b[0]) - 4 && px <= Math.max(a[0], b[0]) + 4 && py >= Math.min(a[1], b[1]) - 4 && py <= Math.max(a[1], b[1]) + 4) return d.id;
      if (d.tipo === 'fibonacci' && px >= Math.min(a[0], b[0]) - 4 && py >= Math.min(a[1], b[1]) - 4 && py <= Math.max(a[1], b[1]) + 4) return d.id;
    }
    return null;
  }

  private dibujar(target: CanvasRenderingTarget2D) {
    const lista = this.estado.provisional ? [...this.estado.dibujos, this.estado.provisional] : this.estado.dibujos;
    if (!lista.length || !this.series) return;
    const fuente = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const d of lista) {
        const sel = d.id === this.estado.seleccionado;
        const a = this.xy(d.puntos[0]);
        const b = d.puntos[1] ? this.xy(d.puntos[1]) : null;
        if (!a) continue;
        ctx.strokeStyle = d.color;
        ctx.fillStyle = d.color;
        ctx.lineWidth = sel ? 2 : 1.5;
        ctx.setLineDash(d === this.estado.provisional ? [5, 4] : []);
        ctx.beginPath();
        if (d.tipo === 'horizontal') {
          ctx.moveTo(0, a[1]);
          ctx.lineTo(mediaSize.width, a[1]);
          ctx.stroke();
          ctx.font = `11px ${fuente}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(d.puntos[0].p.toFixed(this.estado.decimales).replace('.', ','), 6, a[1] - 3);
        } else if (b && (d.tipo === 'tendencia' || d.tipo === 'rayo')) {
          let fin = b;
          if (d.tipo === 'rayo' && b[0] !== a[0]) {
            const lejos = b[0] > a[0] ? mediaSize.width : 0;
            const k = (lejos - a[0]) / (b[0] - a[0]);
            fin = [lejos, a[1] + k * (b[1] - a[1])];
          }
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(fin[0], fin[1]);
          ctx.stroke();
        } else if (b && d.tipo === 'rectangulo') {
          ctx.globalAlpha = 0.14;
          ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
          ctx.globalAlpha = 1;
          ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
        } else if (b && d.tipo === 'fibonacci') {
          const p0 = d.puntos[0].p;
          const p1 = d.puntos[1].p;
          const x0 = Math.min(a[0], b[0]);
          ctx.font = `10px ${fuente}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          for (const nv of NIVELES_FIBO) {
            const precio = p1 + (p0 - p1) * nv;
            const y = this.series!.priceToCoordinate(precio);
            if (y === null) continue;
            ctx.globalAlpha = nv === 0 || nv === 1 ? 1 : 0.75;
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(mediaSize.width, y);
            ctx.stroke();
            ctx.fillText(`${String(nv).replace('.', ',')} (${precio.toFixed(this.estado.decimales).replace('.', ',')})`, x0 + 4, y - 2);
          }
          ctx.globalAlpha = 0.35;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.setLineDash([]);
        if (sel)
          for (const q of [a, b]) {
            if (!q) continue;
            ctx.fillStyle = '#0d1118';
            ctx.beginPath();
            ctx.arc(q[0], q[1], 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
      }
    });
  }
}
