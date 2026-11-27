/** Componentes base de NEXUS. Toda la estética sale de tokens.css; acá solo estructura, estados y accesibilidad. */
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as KE,
  type ReactNode,
} from 'react';
import { explicarError } from '../api/cliente';
import { Icono, type NombreIcono } from './iconos';

type Variante = 'primario' | 'secundario' | 'texto' | 'peligro' | 'compra' | 'venta';

export const Boton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icono?: NombreIcono; cargando?: boolean; chico?: boolean }
>(function Boton({ variante = 'secundario', icono, cargando, chico, className = '', children, disabled, type = 'button', ...resto }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`boton boton--${variante}${chico ? ' boton--chico' : ''} ${className}`}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando ? <span className="giro" aria-hidden="true" /> : icono ? <Icono nombre={icono} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
});

export const BotonIcono = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { etiqueta: string; icono: NombreIcono; activo?: boolean; tam?: number }
>(function BotonIcono({ etiqueta, icono, activo, tam = 16, className = '', type = 'button', ...resto }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`boton-icono${activo ? ' es-activo' : ''} ${className}`}
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activo === undefined ? undefined : activo}
      {...resto}
    >
      <Icono nombre={icono} tam={tam} />
    </button>
  );
});

export type Tono = 'neutro' | 'pos' | 'neg' | 'aviso' | 'activo' | 'identidad';

export function Insignia({ tono = 'neutro', icono, children, titulo }: { tono?: Tono; icono?: NombreIcono; children: ReactNode; titulo?: string }) {
  return (
    <span className={`insignia insignia--${tono}`} title={titulo}>
      {icono && <Icono nombre={icono} tam={12} />}
      {children}
    </span>
  );
}

export function Panel({
  titulo,
  subtitulo,
  acciones,
  children,
  className = '',
  id,
  sinRelleno,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  sinRelleno?: boolean;
}) {
  const idTitulo = useId();
  return (
    <section className={`panel ${className}`} id={id} aria-labelledby={titulo ? idTitulo : undefined}>
      {(titulo || acciones) && (
        <header className="panel__cabeza">
          <div className="panel__titulos">
            {titulo && (
              <h2 className="panel__titulo" id={idTitulo}>
                {titulo}
              </h2>
            )}
            {subtitulo && <p className="panel__subtitulo">{subtitulo}</p>}
          </div>
          {acciones && <div className="panel__acciones">{acciones}</div>}
        </header>
      )}
      <div className={sinRelleno ? 'panel__cuerpo panel__cuerpo--sin-relleno' : 'panel__cuerpo'}>{children}</div>
    </section>
  );
}

export interface OpcionSeg<T extends string | number> {
  valor: T;
  etiqueta: ReactNode;
  titulo?: string;
  deshabilitado?: boolean;
}

/** Grupo de opciones exclusivas (radio) con flechas del teclado. */
export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  chico,
}: {
  opciones: OpcionSeg<T>[];
  valor: T;
  onCambio: (v: T) => void;
  etiqueta: string;
  chico?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const mover = (e: KE, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    for (let k = 1; k <= opciones.length; k++) {
      const j = (i + d * k + opciones.length) % opciones.length;
      if (!opciones[j].deshabilitado) {
        onCambio(opciones[j].valor);
        refs.current[j]?.focus();
        break;
      }
    }
  };
  return (
    <div className={`segmentado${chico ? ' segmentado--chico' : ''}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o, i) => {
        const sel = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={sel}
            tabIndex={sel ? 0 : -1}
            title={o.titulo}
            disabled={o.deshabilitado}
            className={sel ? 'es-activo' : ''}
            onClick={() => onCambio(o.valor)}
            onKeyDown={(e) => mover(e, i)}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

export function Campo({ etiqueta, ayuda, error, children, id }: { etiqueta: ReactNode; ayuda?: ReactNode; error?: string | null; children: (id: string, describe?: string) => ReactNode; id?: string }) {
  const propio = useId();
  const idCampo = id ?? propio;
  const idAyuda = `${idCampo}-ayuda`;
  return (
    <div className={`campo${error ? ' campo--error' : ''}`}>
      <label htmlFor={idCampo} className="campo__etiqueta">
        {etiqueta}
      </label>
      {children(idCampo, ayuda || error ? idAyuda : undefined)}
      {(error || ayuda) && (
        <p id={idAyuda} className={error ? 'campo__error' : 'campo__ayuda'}>
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}

export interface DefPestana<T extends string> {
  id: T;
  etiqueta: string;
  contador?: number;
}

export function Pestanas<T extends string>({ pestanas, activa, onCambio, etiqueta, idBase }: { pestanas: DefPestana<T>[]; activa: T; onCambio: (t: T) => void; etiqueta: string; idBase: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta}>
      {pestanas.map((p, i) => (
        <button
          key={p.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          id={`${idBase}-pestana-${p.id}`}
          aria-selected={p.id === activa}
          aria-controls={`${idBase}-panel-${p.id}`}
          tabIndex={p.id === activa ? 0 : -1}
          className={p.id === activa ? 'es-activo' : ''}
          onClick={() => onCambio(p.id)}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const j = (i + d + pestanas.length) % pestanas.length;
            onCambio(pestanas[j].id);
            refs.current[j]?.focus();
          }}
        >
          {p.etiqueta}
          {p.contador !== undefined && p.contador > 0 && <span className="pestanas__contador">{p.contador}</span>}
        </button>
      ))}
    </div>
  );
}

export const Tecla = ({ children }: { children: ReactNode }) => <kbd className="tecla">{children}</kbd>;

export function Cargando({ texto = 'Cargando…', alto }: { texto?: string; alto?: number }) {
  return (
    <div className="estado estado--cargando" style={alto ? { minHeight: alto } : undefined} role="status">
      <span className="giro" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function Vacio({ titulo, texto, accion, icono = 'info' }: { titulo: string; texto?: ReactNode; accion?: ReactNode; icono?: NombreIcono }) {
  return (
    <div className="estado estado--vacio">
      <Icono nombre={icono} tam={20} />
      <p className="estado__titulo">{titulo}</p>
      {texto && <p className="estado__texto">{texto}</p>}
      {accion}
    </div>
  );
}

export function ErrorEstado({ error, reintentar, compacto }: { error: unknown; reintentar?: () => void; compacto?: boolean }) {
  const { titulo, detalle } = explicarError(error);
  return (
    <div className={`estado estado--error${compacto ? ' estado--compacto' : ''}`} role="alert">
      <Icono nombre="alerta" tam={18} />
      <p className="estado__titulo">{titulo}</p>
      <p className="estado__texto">{detalle}</p>
      {reintentar && (
        <Boton chico icono="reiniciar" onClick={reintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}

/** Explicación contextual: se abre al pasar el mouse o al enfocar (teclado), y se cierra con Escape. */
export function Info({ texto, etiqueta = 'Más información' }: { texto: ReactNode; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <span className="info" onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
      <button
        type="button"
        className="info__boton"
        aria-label={etiqueta}
        aria-describedby={abierto ? id : undefined}
        aria-expanded={abierto}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}
      >
        <Icono nombre="info" tam={13} />
      </button>
      {abierto && (
        <span role="tooltip" id={id} className="info__globo">
          {texto}
        </span>
      )}
    </span>
  );
}

/** Diálogo modal accesible: foco atrapado, Escape cierra, el foco vuelve a quien lo abrió. */
export function Dialogo({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  pie,
  ancho = 520,
  clase = '',
}: {
  abierto: boolean;
  titulo: string;
  descripcion?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: number;
  clase?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idT = useId();
  const idD = useId();
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const nodo = ref.current;
    const enfocables = () =>
      Array.from(nodo?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])') ?? []);
    (nodo?.querySelector<HTMLElement>('[data-autofoco]') ?? enfocables()[0] ?? nodo)?.focus();
    // en el documento y en captura: Escape cierra aunque el foco se haya ido del diálogo
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        cerrarRef.current();
      } else if (e.key === 'Tab') {
        const l = enfocables();
        if (!l.length) return;
        const i = l.indexOf(document.activeElement as HTMLElement);
        if (i < 0) {
          e.preventDefault();
          l[0].focus();
        } else if (e.shiftKey && i === 0) {
          e.preventDefault();
          l[l.length - 1].focus();
        } else if (!e.shiftKey && i === l.length - 1) {
          e.preventDefault();
          l[0].focus();
        }
      }
    };
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('keydown', tecla, true);
      previo?.focus?.();
    };
  }, [abierto]);
  if (!abierto) return null;
  return (
    <div className="velo" data-dialogo-abierto onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div
        ref={ref}
        className={`dialogo ${clase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idT}
        aria-describedby={descripcion ? idD : undefined}
        style={{ maxWidth: ancho }}
        tabIndex={-1}
      >
        <header className="dialogo__cabeza">
          <h2 id={idT}>{titulo}</h2>
          <BotonIcono etiqueta="Cerrar" icono="cruz" onClick={onCerrar} />
        </header>
        {descripcion && (
          <p className="dialogo__descripcion" id={idD}>
            {descripcion}
          </p>
        )}
        <div className="dialogo__cuerpo">{children}</div>
        {pie && <footer className="dialogo__pie">{pie}</footer>}
      </div>
    </div>
  );
}

/** Punto de estado + texto (el estado nunca se comunica solo con color). */
export function Estado({ tono, children }: { tono: 'ok' | 'aviso' | 'error' | 'apagado'; children: ReactNode }) {
  return (
    <span className={`punto-estado punto-estado--${tono}`}>
      <span className="punto-estado__punto" aria-hidden="true" />
      {children}
    </span>
  );
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
