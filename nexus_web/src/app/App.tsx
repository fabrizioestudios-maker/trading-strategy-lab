import React, { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Cargando } from '../components/ui';
import type { Modulo } from '../lib/rutas';
import { ProveedorAvisos } from './avisos';
import { ProveedorComandos } from './comandos';
import { ProveedorEspacio } from './espacio';
import { ProveedorGlobales } from './globales';
import { useRuta } from './ruta';
import { Shell } from './Shell';
import { ProveedorSesion, useSesion } from './sesion';

const Acceso = lazy(() => import('../modules/Acceso'));

const MODULOS: Record<Modulo, LazyExoticComponent<ComponentType<{ params: Record<string, string> }>>> = {
  resumen: lazy(() => import('../modules/Resumen')),
  replay: lazy(() => import('../modules/replay/Replay')),
  laboratorio: lazy(() => import('../modules/Laboratorio')),
  indicadores: lazy(() => import('../modules/Indicadores')),
  probador: lazy(() => import('../modules/Probador')),
  ejecucion: lazy(() => import('../modules/Ejecucion')),
  analitica: lazy(() => import('../modules/Analitica')),
  datos: lazy(() => import('../modules/CentroDatos')),
  ajustes: lazy(() => import('../modules/Ajustes')),
  admin: lazy(() => import('../modules/Admin')),
};

function Rutas() {
  const { ruta } = useRuta();
  const Pagina = MODULOS[ruta.modulo];
  return (
    <Suspense fallback={<Cargando texto="Abriendo el módulo…" alto={300} />}>
      <Pagina key={ruta.modulo} params={ruta.params} />
    </Suspense>
  );
}

function Puerta({ children }: { children: React.ReactNode }) {
  const { config, usuario, cargando } = useSesion();
  if (cargando) return <Cargando texto="Conectando con NEXUS…" alto={400} />;
  if (config?.login_requerido && !usuario)
    return (
      <Suspense fallback={<Cargando alto={400} />}>
        <Acceso />
      </Suspense>
    );
  return <>{children}</>;
}

export function App() {
  return (
    <ProveedorSesion>
      <Puerta>
        <ProveedorEspacio>
      <ProveedorAvisos>
        <ProveedorComandos>
          <ProveedorGlobales>
            <Shell>
              <Rutas />
            </Shell>
          </ProveedorGlobales>
        </ProveedorComandos>
      </ProveedorAvisos>
        </ProveedorEspacio>
      </Puerta>
    </ProveedorSesion>
  );
}
