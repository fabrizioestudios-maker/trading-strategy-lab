/**
 * Formato de números y fechas de NEXUS (es-AR: punto de miles, coma decimal, signo menos tipográfico).
 * Las fechas se formatean con la base de zonas horarias del navegador y una zona explícita: nunca la zona local implícita.
 */
export type Zona = 'ny' | 'utc';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MENOS = '−';
const formatosNumero = new Map<string, Intl.NumberFormat>();

function nf(dec: number, minDec = dec): Intl.NumberFormat {
  const k = `${minDec}-${dec}`;
  let f = formatosNumero.get(k);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: minDec, maximumFractionDigits: dec });
    formatosNumero.set(k, f);
  }
  return f;
}

const vacio = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || Number.isNaN(v);

export function numero(v: number | null | undefined, dec = 2): string {
  if (vacio(v)) return '—';
  const s = nf(dec).format(Math.abs(v));
  return v < 0 && s !== nf(dec).format(0) ? MENOS + s : s;
}

export const precio = (v: number | null | undefined, dec = 2): string => numero(v, dec);

export function entero(v: number | null | undefined): string {
  return numero(vacio(v) ? v : Math.round(v), 0);
}

/** Valor con signo explícito: «+0,41 R», «−1,00 R», «0,00 R». */
export function conSigno(v: number | null | undefined, dec = 2, unidad = ''): string {
  if (vacio(v)) return '—';
  const cero = Math.abs(v) < 0.5 * 10 ** -dec;
  const s = cero ? '' : v > 0 ? '+' : MENOS;
  return `${s}${nf(dec).format(Math.abs(v))}${unidad ? ` ${unidad}` : ''}`;
}

export function porcentaje(v: number | null | undefined, dec = 1): string {
  if (vacio(v)) return '—';
  return `${numero(v, dec)} %`;
}

/** Tono semántico de un valor con signo (se usa SIEMPRE junto con el signo escrito, nunca solo el color). */
export function tono(v: number | null | undefined): 'pos' | 'neg' | 'neutro' {
  if (vacio(v) || Math.abs(v) < 1e-9) return 'neutro';
  return v > 0 ? 'pos' : 'neg';
}

const formatosFecha = new Map<Zona, Intl.DateTimeFormat>();

export interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

export function partes(ms: number, zona: Zona): Partes {
  let f = formatosFecha.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona === 'ny' ? 'America/New_York' : 'UTC',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatosFecha.set(zona, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { anio: p.year, mes: p.month, dia: p.day, hora: p.hour % 24, minuto: p.minute };
}

const dos = (n: number) => String(n).padStart(2, '0');
export const sufijoZona = (z: Zona) => (z === 'ny' ? 'NY' : 'UTC');

export function fecha(ms: number | null | undefined, zona: Zona = 'ny'): string {
  if (vacio(ms)) return '—';
  const p = partes(ms, zona);
  return `${p.dia} ${MESES[p.mes - 1]} ${p.anio}`;
}

export function hora(ms: number | null | undefined, zona: Zona = 'ny'): string {
  if (vacio(ms)) return '—';
  const p = partes(ms, zona);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

/** «18 nov 2026 21:59 NY». */
export function fechaHora(ms: number | null | undefined, zona: Zona = 'ny', conZona = true): string {
  if (vacio(ms)) return '—';
  return `${fecha(ms, zona)} ${hora(ms, zona)}${conZona ? ` ${sufijoZona(zona)}` : ''}`;
}

/** «18 nov 21:59 NY» (sin año), para chips y etiquetas estrechas. */
export function fechaHoraCorta(ms: number | null | undefined, zona: Zona = 'ny'): string {
  if (vacio(ms)) return '—';
  const p = partes(ms, zona);
  return `${p.dia} ${MESES[p.mes - 1]} ${hora(ms, zona)} ${sufijoZona(zona)}`;
}

/** Valor para <input type="datetime-local"> en hora de Nueva York: «2026-11-18T21:59». */
export function entradaNy(ms: number): string {
  const p = partes(ms, 'ny');
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}T${dos(p.hora)}:${dos(p.minuto)}`;
}

export function duracion(ms: number | null | undefined): string {
  if (vacio(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
}

export function hace(ms: number, ahora = Date.now()): string {
  const d = ahora - ms;
  if (d < 45_000) return 'recién';
  return `hace ${duracion(d).split(' ').slice(0, 2).join(' ')}`;
}

export const huellaCorta = (h: string | null | undefined, n = 12) => (h ? h.slice(0, n) : '—');

export function etiquetaTf(tf: number): string {
  if (tf >= 1440) return 'D';
  if (tf >= 60) return `${tf / 60}h`;
  return `${tf}m`;
}

export function nombreTf(tf: number): string {
  if (tf >= 1440) return 'diaria';
  if (tf >= 60) return `${tf / 60} ${tf === 60 ? 'hora' : 'horas'}`;
  return `${tf} ${tf === 1 ? 'minuto' : 'minutos'}`;
}
