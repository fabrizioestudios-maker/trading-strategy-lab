/**
 * Comandos de NEXUS: la paleta (Ctrl/⌘ K) y los atajos de teclado usan el mismo registro. Cada módulo registra sus
 * comandos mientras está abierto; los globales (navegación, ayuda) están siempre.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface Comando {
  id: string;
  titulo: string;
  grupo: string;
  /** Texto del atajo para mostrar, p. ej. «Espacio» o «G luego R». */
  atajo?: string;
  palabras?: string;
  deshabilitado?: string | false;
  ejecutar: () => void;
}

interface Ctx {
  comandos: Comando[];
  registrar: (fuente: string, lista: Comando[]) => void;
  quitar: (fuente: string) => void;
  paletaAbierta: boolean;
  abrirPaleta: (abierta: boolean) => void;
  ayudaAbierta: boolean;
  abrirAyuda: (abierta: boolean) => void;
}

const Contexto = createContext<Ctx | null>(null);

export function ProveedorComandos({ children }: { children: ReactNode }) {
  const [fuentes, setFuentes] = useState<Record<string, Comando[]>>({});
  const [paletaAbierta, abrirPaleta] = useState(false);
  const [ayudaAbierta, abrirAyuda] = useState(false);
  const registrar = useCallback((fuente: string, lista: Comando[]) => setFuentes((f) => ({ ...f, [fuente]: lista })), []);
  const quitar = useCallback(
    (fuente: string) =>
      setFuentes((f) => {
        const { [fuente]: _, ...resto } = f;
        return resto;
      }),
    [],
  );
  const comandos = useMemo(() => Object.values(fuentes).flat(), [fuentes]);
  const valor = useMemo(
    () => ({ comandos, registrar, quitar, paletaAbierta, abrirPaleta, ayudaAbierta, abrirAyuda }),
    [comandos, registrar, quitar, paletaAbierta, ayudaAbierta],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useComandos(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error('useComandos fuera de ProveedorComandos');
  return c;
}

/** Registra los comandos de un módulo mientras está montado. `lista` se recalcula con sus dependencias. */
export function useRegistrarComandos(fuente: string, lista: Comando[]) {
  const { registrar, quitar } = useComandos();
  useEffect(() => {
    registrar(fuente, lista);
  }, [fuente, lista, registrar]);
  useEffect(() => () => quitar(fuente), [fuente, quitar]);
}

/** El foco está en un campo editable: los atajos de una tecla no deben dispararse. */
export function escribiendo(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Atajos de teclado: `mapa` asocia una tecla normalizada («shift+arrowright», «space», «g r») con una acción. */
export function useAtajos(mapa: Record<string, () => void>, activo = true) {
  const ref = useRef(mapa);
  ref.current = mapa;
  const prefijo = useRef<{ tecla: string; t: number } | null>(null);
  useEffect(() => {
    if (!activo) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || escribiendo(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('[data-dialogo-abierto]')) return;
      const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
      // Espacio y Enter sobre un control enfocado lo activan (comportamiento nativo): no se los roba un atajo
      if ((k === 'space' || k === 'enter') && (e.target as HTMLElement | null)?.closest?.('button, a, [role="button"], [role="radio"], [role="tab"], [role="option"], [role="menuitem"], summary')) return;
      const conShift = e.shiftKey && k.length > 1 ? `shift+${k}` : k;
      const p = prefijo.current;
      if (p && Date.now() - p.t < 1200) {
        const combinado = `${p.tecla} ${k}`;
        prefijo.current = null;
        if (ref.current[combinado]) {
          e.preventDefault();
          ref.current[combinado]();
          return;
        }
      }
      if (Object.keys(ref.current).some((x) => x.startsWith(`${k} `))) {
        prefijo.current = { tecla: k, t: Date.now() };
      }
      const accion = ref.current[conShift];
      if (accion) {
        e.preventDefault();
        accion();
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [activo]);
}
