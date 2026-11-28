import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AyudaAtajos } from '../components/AyudaAtajos';
import { Icono, type NombreIcono } from '../components/iconos';
import { Menu } from '../components/Menu';
import { PaletaComandos } from '../components/PaletaComandos';
import { Boton, Campo, Dialogo } from '../components/ui';
import { ESTATICO } from '../api/cliente';
import { etiquetaTf, nombreTf } from '../lib/formato';
import { TEMPORALIDADES } from '../lib/replay';
import { MODULOS, type Modulo } from '../lib/rutas';
import { useAvisos } from './avisos';
import { useAtajos, useComandos, useRegistrarComandos, type Comando } from './comandos';
import { espaciosGuardados, guardarEspacios, useEspacio } from './espacio';
import { useGlobales } from './globales';
import { useRuta } from './ruta';
import { useSesion } from './sesion';

export const ICONO_MODULO: Record<Modulo, NombreIcono> = {
  resumen: 'resumen',
  replay: 'replay',
  laboratorio: 'laboratorio',
  indicadores: 'capas',
  probador: 'objetivo',
  ejecucion: 'ejecucion',
  analitica: 'analitica',
  datos: 'datos',
  ajustes: 'ajustes',
  admin: 'servidor',
};

function Marca() {
  return (
    <a className="marca" href="#/resumen" aria-label="NEXUS, ir al resumen" title="NEXUS">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="13.5" fill="var(--surface-2)" stroke="var(--gold)" strokeWidth="1.5" />
        <path d="M9 19.5V10.5l7 9V10.5" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.5 8.5v13" stroke="var(--gold-claro)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2.2" />
      </svg>
      <span className="marca__texto">NEXUS</span>
    </a>
  );
}

function GuardarEspacio({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { estado, despachar } = useEspacio();
  const { avisar } = useAvisos();
  const [nombre, setNombre] = useState(estado.nombre);
  useEffect(() => {
    if (abierto) setNombre(estado.nombre === 'Predeterminado' ? '' : estado.nombre);
  }, [abierto, estado.nombre]);
  const valido = nombre.trim().length > 0;
  const guardarlo = () => {
    if (!valido) return;
    const n = nombre.trim().slice(0, 60);
    const lista = espaciosGuardados().filter((x) => x.nombre !== n);
    const ok = guardarEspacios([{ nombre: n, guardado_ms: Date.now(), estado: { ...estado, nombre: n } }, ...lista]);
    despachar({ tipo: 'nombre', nombre: n });
    avisar(ok ? { texto: `Espacio «${n}» guardado en este navegador.` } : { texto: 'El navegador no permite guardar datos locales.', tono: 'error' });
    onCerrar();
  };
  return (
    <Dialogo
      abierto={abierto}
      titulo="Guardar espacio de trabajo"
      descripcion="Guarda instrumento, temporalidad, límite del replay, órdenes simuladas, indicadores y preferencias. Queda en este navegador; desde Ajustes se puede exportar."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={!valido} onClick={guardarlo}>
            Guardar espacio
          </Boton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardarlo();
        }}
      >
        <Campo etiqueta="Nombre" ayuda="Si ya existe un espacio con este nombre, se reemplaza.">
          {(id, d) => <input id={id} aria-describedby={d} className="entrada" data-autofoco value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Oro 15m, noviembre" />}
        </Campo>
      </form>
    </Dialogo>
  );
}

function EstadoApi() {
  const { salud } = useGlobales();
  const n = salud.datos?.datos.instrumentos_disponibles as string[] | undefined;
  const tono = salud.error ? 'error' : !salud.datos ? 'apagado' : n && n.length ? 'ok' : 'aviso';
  const texto = salud.error ? 'Sin conexión con la API' : !salud.datos ? 'Conectando con la API' : n && n.length ? `API conectada, ${n.length} instrumentos con datos` : 'API sin datos';
  return (
    <span className={`riel__estado punto-estado punto-estado--${tono}`} role="status" title={texto} aria-label={texto}>
      <span className="punto-estado__punto" aria-hidden="true" />
      <span>{salud.error ? 'Sin API' : 'API'}</span>
    </span>
  );
}

const ETIQUETA_RIEL: Record<Modulo, string> = {
  resumen: 'Resumen',
  replay: 'Replay',
  laboratorio: 'Lab',
  indicadores: 'Indicadores',
  probador: 'Probador',
  ejecucion: 'Ejecución',
  analitica: 'Analítica',
  datos: 'Datos',
  ajustes: 'Ajustes',
  admin: 'Admin',
};

export function Shell({ children }: { children: ReactNode }) {
  const { despachar, estado } = useEspacio();
  const { instrumentos, salud } = useGlobales();
  const { abrirPaleta, abrirAyuda } = useComandos();
  const { ruta, ir } = useRuta();
  const sesion = useSesion();
  const esAdmin = sesion.esAdmin;
  const [guardando, setGuardando] = useState(false);
  const [masAbierto, setMasAbierto] = useState(false);

  const globales = useMemo<Comando[]>(
    () => [
      ...MODULOS.filter((m) => m.id !== 'admin' || esAdmin).map((m) => ({
        id: `ir-${m.id}`,
        titulo: `Ir a ${m.nombre}`,
        grupo: 'Navegación',
        atajo: `G luego ${m.tecla.toUpperCase()}`,
        palabras: `${m.ingles} ${m.descripcion}`,
        ejecutar: () => ir(m.id),
      })),
      { id: 'guardar-espacio', titulo: 'Guardar espacio de trabajo…', grupo: 'Espacio de trabajo', palabras: 'workspace layout', ejecutar: () => setGuardando(true) },
      { id: 'ayuda', titulo: 'Ver atajos de teclado', grupo: 'Ayuda', atajo: '?', palabras: 'shortcuts teclas', ejecutar: () => abrirAyuda(true) },
      ...TEMPORALIDADES.map((tf) => ({
        id: `tf-${tf}`,
        titulo: `Temporalidad ${nombreTf(tf)}`,
        grupo: 'Contexto',
        palabras: `timeframe ${etiquetaTf(tf)}`,
        ejecutar: () => despachar({ tipo: 'tf', tf }),
      })),
      ...(instrumentos.datos ?? [])
        .filter((i) => i.disponible)
        .map((i) => ({ id: `ins-${i.simbolo}`, titulo: `Instrumento ${i.simbolo}`, grupo: 'Contexto', palabras: i.nombre, ejecutar: () => despachar({ tipo: 'simbolo', simbolo: i.simbolo }) })),
    ],
    [ir, despachar, abrirAyuda, instrumentos.datos, esAdmin],
  );
  useRegistrarComandos('global', globales);

  useAtajos({
    ...Object.fromEntries(MODULOS.map((m) => [`g ${m.tecla}`, () => ir(m.id)])),
    '?': () => abrirAyuda(true),
  });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrirPaleta(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [abrirPaleta]);

  useEffect(() => {
    const m = MODULOS.find((x) => x.id === ruta.modulo);
    document.title = `${m?.nombre ?? 'NEXUS'} · NEXUS`;
    document.getElementById('contenido')?.focus({ preventScroll: true });
  }, [ruta.modulo]);

  const sintetico = salud.datos?.datos.sintetico === true;

  return (
    <div className="shell" data-sintetico={sintetico || undefined}>
      <a className="saltar" href="#contenido" onClick={(e) => (e.preventDefault(), document.getElementById('contenido')?.focus())}>
        Saltar al contenido
      </a>
      <nav className="riel" aria-label="Módulos">
        <Marca />
        <div className="riel__modulos">
          {MODULOS.filter((m) => m.id !== 'ajustes' && m.id !== 'admin').map((m) => (
            <a key={m.id} href={`#/${m.id}`} className="riel__item" aria-current={ruta.modulo === m.id ? 'page' : undefined} title={m.nombre}>
              <Icono nombre={ICONO_MODULO[m.id]} tam={20} />
              <span>{ETIQUETA_RIEL[m.id]}</span>
            </a>
          ))}
        </div>
        <div className="riel__pie">
          <button type="button" className="riel__item" onClick={() => abrirPaleta(true)} title="Buscar o ejecutar (Ctrl K)" aria-label="Buscar o ejecutar un comando (Ctrl K)">
            <Icono nombre="buscar" tam={20} />
            <span>Buscar</span>
          </button>
          <Menu
            etiqueta="Espacio de trabajo"
            arriba
            items={[
              { id: 'guardar', texto: 'Guardar espacio…', alElegir: () => setGuardando(true) },
              { id: 'ver', texto: 'Espacios guardados', detalle: 'Ajustes', alElegir: () => ir('ajustes', { seccion: 'espacios' }) },
              { id: 'ayuda', texto: 'Atajos de teclado', detalle: '?', alElegir: () => abrirAyuda(true) },
            ]}
            boton={(p) => (
              <button type="button" className="riel__item" {...p} aria-label={`Espacio de trabajo: ${estado.nombre}`} title={`Espacio: ${estado.nombre}`}>
                <Icono nombre="espacio" tam={20} />
                <span>Espacio</span>
              </button>
            )}
          />
          {esAdmin && (
            <a href="#/admin" className="riel__item" aria-current={ruta.modulo === 'admin' ? 'page' : undefined} title="Administración">
              <Icono nombre="servidor" tam={20} />
              <span>Admin</span>
            </a>
          )}
          {sesion.usuario && sesion.config?.login_requerido && (
            <Menu
              etiqueta="Tu cuenta"
              arriba
              items={[
                { id: 'quien', texto: sesion.usuario.nombre, detalle: sesion.usuario.email, alElegir: () => undefined },
                { id: 'salir', texto: 'Cerrar sesión', alElegir: () => void sesion.salir() },
              ]}
              boton={(p) => (
                <button type="button" className="riel__item riel__usuario" {...p} aria-label={`Cuenta de ${sesion.usuario!.nombre}`} title={sesion.usuario!.email}>
                  <span className="riel__avatar" aria-hidden="true">
                    {sesion.usuario!.nombre.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span>Cuenta</span>
                </button>
              )}
            />
          )}
          <a href="#/ajustes" className="riel__item" aria-current={ruta.modulo === 'ajustes' ? 'page' : undefined} title="Ajustes">
            <Icono nombre="ajustes" tam={20} />
            <span>Ajustes</span>
          </a>
          <EstadoApi />
        </div>
      </nav>

      <main className="principal" id="contenido" tabIndex={-1}>
        {sintetico && (
          <p className="banda-sintetica" role="note">
            <Icono nombre="alerta" tam={14} />
            Datos sintéticos de prueba: no es mercado real (la API arrancó con --sintetico).
          </p>
        )}
        {ESTATICO && (
          <p className="banda-sintetica banda-publicada" role="note">
            <Icono nombre="alerta" tam={14} />
            {import.meta.env.VITE_AVISO_ESTATICO ?? 'Versión publicada con datos grabados: el replay recorre un tramo fijo, sin órdenes ni corridas nuevas.'}
          </p>
        )}
        {children}
      </main>

      <nav className="nav-movil" aria-label="Módulos">
        {(['resumen', 'replay', 'laboratorio', 'ejecucion'] as Modulo[]).map((id) => (
          <a key={id} href={`#/${id}`} aria-current={ruta.modulo === id ? 'page' : undefined}>
            <Icono nombre={ICONO_MODULO[id]} tam={20} />
            {ETIQUETA_RIEL[id]}
          </a>
        ))}
        <button type="button" onClick={() => setMasAbierto(true)} aria-haspopup="dialog">
          <Icono nombre="mas2" tam={20} />
          Más
        </button>
      </nav>

      <Dialogo abierto={masAbierto} titulo="Módulos" onCerrar={() => setMasAbierto(false)}>
        <ul className="lista">
          {MODULOS.filter((m) => m.id !== 'admin' || esAdmin).map((m) => (
            <li key={m.id}>
              <a className="nav__item" href={`#/${m.id}`} aria-current={ruta.modulo === m.id ? 'page' : undefined} onClick={() => setMasAbierto(false)}>
                <Icono nombre={ICONO_MODULO[m.id]} tam={18} />
                <span>
                  {m.nombre}
                  <br />
                  <small className="tenue">{m.descripcion}</small>
                </span>
              </a>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="nav__item"
              onClick={() => {
                setMasAbierto(false);
                abrirPaleta(true);
              }}
            >
              <Icono nombre="buscar" tam={18} />
              <span>Buscar o ejecutar un comando</span>
            </button>
          </li>
        </ul>
      </Dialogo>
      <GuardarEspacio abierto={guardando} onCerrar={() => setGuardando(false)} />
      <PaletaComandos />
      <AyudaAtajos />
    </div>
  );
}
