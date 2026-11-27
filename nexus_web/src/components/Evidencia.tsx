/** Piezas para mostrar evidencia sin exagerarla: cada número con su muestra, período, perfil de costos y definición. */
import type { Trabajo } from '../api/contrato.gen';
import { conSigno, entero, fechaHora, porcentaje } from '../lib/formato';
import { Icono } from './iconos';
import { Info, Insignia, type Tono } from './ui';

export const ESTADO_TRABAJO: Record<Trabajo['estado'], { texto: string; tono: Tono }> = {
  enviado: { texto: 'Enviado', tono: 'neutro' },
  en_cola: { texto: 'En cola', tono: 'neutro' },
  corriendo: { texto: 'Corriendo', tono: 'activo' },
  terminado: { texto: 'Terminado', tono: 'neutro' },
  fallido: { texto: 'Fallido', tono: 'neg' },
  cancelado: { texto: 'Cancelado', tono: 'aviso' },
};

export const NOMBRE_PERFIL: Record<string, string> = {
  costos_md: 'docs/costos.md',
  sin_costos: 'sin costos',
  optimista: 'optimista',
  base: 'base',
  conservador: 'conservador',
  estres: 'estrés',
};

export function EstadoTrabajo({ estado }: { estado: Trabajo['estado'] }) {
  const e = ESTADO_TRABAJO[estado];
  return (
    <Insignia tono={e.tono} icono={estado === 'terminado' ? 'check' : estado === 'fallido' ? 'alerta' : estado === 'corriendo' ? 'reloj' : undefined}>
      {e.texto}
    </Insignia>
  );
}

export function describirConfig(t: Trabajo): string {
  return `E022 ${t.config.version}, entrada ${t.config.entrada === '18:15' ? '18:15 NY' : 'en la reapertura'}, costos ${NOMBRE_PERFIL[t.config.perfil_costos] ?? t.config.perfil_costos}`;
}

/** Resumen de una corrida terminada: expectativa con IC, n, período y perfil. */
export function ResumenCorrida({ t }: { t: Trabajo }) {
  const r = t.resumen as { n?: number; expectativa?: number; ic_lo?: number; ic_hi?: number; acierto?: number; periodo?: string; perfil_costos?: string } | null;
  if (!r || r.expectativa === undefined) return null;
  return (
    <div className="resumen-corrida">
      {/* sin verde ni rojo: una cifra de una candidata no se presenta como un resultado validado */}
      <span className="resumen-corrida__valor num">{conSigno(r.expectativa, 2, 'R')}</span>
      <span className="resumen-corrida__base">
        por operación, IC 95 % {conSigno(r.ic_lo, 2)} a {conSigno(r.ic_hi, 2)}
        <br />n = {entero(r.n)}, {r.periodo}, costos {NOMBRE_PERFIL[r.perfil_costos ?? ''] ?? r.perfil_costos}
        {r.acierto !== undefined && <>, acierto {porcentaje(r.acierto, 1)}</>}
      </span>
    </div>
  );
}

export function NivelEvidencia({ nivel, texto }: { nivel: string; texto: string }) {
  return (
    <span className="fila" style={{ gap: 6 }}>
      <Insignia tono="identidad" titulo={texto}>
        Nivel {nivel}
      </Insignia>
      <Info texto={texto} etiqueta={`Qué significa el nivel ${nivel}`} />
    </span>
  );
}

export function FechaCorrida({ t }: { t: Trabajo }) {
  return (
    <span className="tenue num" title={`Creado ${fechaHora(t.creado_ms, 'utc')}`}>
      <Icono nombre="reloj" tam={12} /> {fechaHora(t.creado_ms, 'ny')}
    </span>
  );
}
