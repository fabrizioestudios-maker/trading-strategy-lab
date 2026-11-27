import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Cargando } from '../components/ui';
import type { Modulo } from '../lib/rutas';
import { ProveedorAvisos } from './avisos';
import { ProveedorComandos } from './comandos';
import { ProveedorEspacio } from './espacio';
import { ProveedorGlobales } from './globales';
import { useRuta } from './ruta';
import { Shell } from './Shell';

const MODULOS: Record<Modulo, LazyExoticComponent<ComponentType<{ params: Record<string, string> }>>> = {
  resumen: lazy(() => import('../modules/Resumen')),
  replay: lazy(() => import('../modules/replay/Replay')),
  laboratorio: lazy(() => import('../modules/Laboratorio')),
  herramientas: lazy(() => import('../modules/Herramientas')),
  ejecucion: lazy(() => import('../modules/Ejecucion')),
  analitica: lazy(() => import('../modules/Analitica')),
  datos: lazy(() => import('../modules/CentroDatos')),
  ajustes: lazy(() => import('../modules/Ajustes')),
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

export function App() {
  return (
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
  );
}
