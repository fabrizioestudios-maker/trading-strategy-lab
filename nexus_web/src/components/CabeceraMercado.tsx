/**
 * Cabecera de mercado: instrumento, último precio revelado, cambio contra el cierre diario anterior y la sesión
 * diaria hasta el límite. Todo sale de la API; el modo (histórico o replay) se dice siempre.
 */
import type { CuadroReplay } from '../api/contrato.gen';
import { useEspacio } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { conSigno, fechaHora, porcentaje, precio, tono } from '../lib/formato';
import { Icono } from './iconos';
import { Menu } from './Menu';
import { Insignia } from './ui';

export function SelectorInstrumento() {
  const { estado, despachar } = useEspacio();
  const { instrumentos } = useGlobales();
  const instr = instrumentos.datos?.find((i) => i.simbolo === estado.simbolo);
  return (
    <Menu
      etiqueta="Instrumento"
      marcado={estado.simbolo}
      items={(instrumentos.datos ?? []).map((i) => ({
        id: i.simbolo,
        texto: (
          <>
            <strong style={{ fontWeight: 600 }}>{i.simbolo}</strong> <span className="secundario">{i.nombre}</span>
          </>
        ),
        detalle: i.disponible ? 'con datos' : 'sin datos',
        deshabilitado: !i.disponible,
        alElegir: () => despachar({ tipo: 'simbolo', simbolo: i.simbolo }),
      }))}
      boton={(p) => (
        <button type="button" className="mercado__simbolo" {...p} aria-label={`Instrumento: ${estado.simbolo}. Cambiar`}>
          <strong>
            {estado.simbolo}
            <Icono nombre="abajo" tam={14} />
          </strong>
          <small>{instr?.nombre ?? ''}</small>
        </button>
      )}
    />
  );
}

export function CabeceraMercado({ cuadro, modo }: { cuadro: CuadroReplay | null; modo: 'replay' | 'historico' }) {
  const { estado } = useEspacio();
  const { instrumentos } = useGlobales();
  const dec = instrumentos.datos?.find((i) => i.simbolo === estado.simbolo)?.decimales ?? 2;
  const d = cuadro?.sesion_dia;
  const ultimo = cuadro?.velas[cuadro.velas.length - 1]?.c;
  const t = tono(d?.cambio);
  return (
    <div className="mercado">
      <SelectorInstrumento />
      <div className="mercado__precio" aria-live="polite">
        <strong className={`tono-${t === 'pos' ? 'alza' : t === 'neg' ? 'baja' : 'neutro'}`}>
          {ultimo !== undefined ? precio(ultimo, dec) : '—'} {t === 'pos' ? '▲' : t === 'neg' ? '▼' : ''}
        </strong>
        {d?.cambio !== undefined && d?.cambio !== null && (
          <span className={`num tono-${t === 'pos' ? 'alza' : t === 'neg' ? 'baja' : 'neutro'}`}>
            {conSigno(d.cambio, dec)} ({conSigno(d.cambio_pct, 2)}&nbsp;%)
          </span>
        )}
      </div>
      {d && (
        <>
          <div className="mercado__dato ocultar-movil" title="Sesión diaria que cierra a las 17:00 NY, hasta el último minuto revelado">
            <span>Máx. de la sesión</span>
            <span>{precio(d.maximo, dec)}</span>
          </div>
          <div className="mercado__dato ocultar-movil">
            <span>Mín. de la sesión</span>
            <span>{precio(d.minimo, dec)}</span>
          </div>
          <div className="mercado__dato ocultar-movil">
            <span>Apertura</span>
            <span>{precio(d.apertura, dec)}</span>
          </div>
          <div className="mercado__dato ocultar-movil ocultar-ancho-medio">
            <span>Rango</span>
            <span>{porcentaje(((d.maximo - d.minimo) / d.apertura) * 100, 2)}</span>
          </div>
        </>
      )}
      <div className="mercado__modo">
        {modo === 'replay' && cuadro ? (
          <Insignia tono="identidad" icono="reloj" titulo="Lo posterior al límite no se carga en ningún panel">
            Replay en {fechaHora(cuadro.limite.limite_ms, estado.prefs.zona)}, {cuadro.limite.sesion}
          </Insignia>
        ) : (
          <Insignia icono="reloj">Histórico, sin feed en vivo</Insignia>
        )}
      </div>
    </div>
  );
}
