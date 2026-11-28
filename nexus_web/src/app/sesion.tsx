/** Sesión del usuario: configuración de cuentas del servidor, quién está conectado, ingresar y salir. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ESTATICO } from '../api/cliente';
import type { ConfigAuth, Usuario } from '../api/contrato.gen';

interface Sesion {
  config: ConfigAuth | null;
  usuario: Usuario | null;
  cargando: boolean;
  esAdmin: boolean;
  fijarUsuario: (u: Usuario | null) => void;
  salir: () => Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);
const LOCAL: ConfigAuth = { login_requerido: false, google_client_id: null, min_contrasena: 10 };

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigAuth | null>(ESTATICO ? LOCAL : null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(!ESTATICO);

  useEffect(() => {
    if (ESTATICO) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const c = await api.authConfig(ctl.signal);
        setConfig(c);
        try {
          setUsuario(await api.yo(ctl.signal));
        } catch {
          setUsuario(null);
        }
      } catch {
        setConfig(LOCAL); // sin API: la interfaz muestra su propio error de conexión
      } finally {
        if (!ctl.signal.aborted) setCargando(false);
      }
    })();
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const fuera = () => config?.login_requerido && setUsuario(null);
    window.addEventListener('nexus:sin-sesion', fuera);
    return () => window.removeEventListener('nexus:sin-sesion', fuera);
  }, [config]);

  const salir = useCallback(async () => {
    try {
      await api.salir();
    } finally {
      setUsuario(null);
    }
  }, []);

  const v = useMemo<Sesion>(
    () => ({ config, usuario, cargando, esAdmin: !config?.login_requerido || usuario?.rol === 'admin', fijarUsuario: setUsuario, salir }),
    [config, usuario, cargando, salir],
  );
  return <Contexto.Provider value={v}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion fuera de ProveedorSesion');
  return c;
}
