import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AyudaAtajos } from '../components/AyudaAtajos';
import { Icono, type NombreIcono } from '../components/iconos';
import { Menu } from '../components/Menu';
import { PaletaComandos } from '../components/PaletaComandos';
import { Boton, BotonIcono, Campo, Dialogo, Estado, Segmentado, Tecla } from '../components/ui';
import { etiquetaTf, fecha, fechaHora, fechaHoraCorta, nombreTf } from '../lib/formato';
import { TEMPORALIDADES } from '../lib/replay';
import { MODULOS, type Modulo } from '../lib/rutas';
import { useAvisos } from './avisos';
import { useAtajos, useComandos, useRegistrarComandos, type Comando } from './comandos';
import { espaciosGuardados, guardarEspacios, useEspacio } from './espacio';
import { useGlobales } from './globales';
import { useRuta } from './ruta';

export const ICONO_MODULO: Record<Modulo, NombreIcono> = {
  resumen: 'resumen',
  replay: 'replay',
  laboratorio: 'laboratorio',
  herramientas: 'herramientas',
  ejecucion: 'ejecucion',
  analitica: 'analitica',
  datos: 'datos',
  ajustes: 'ajustes',
};

function Marca() {
  return (
    <a className="marca" href="#/resumen" aria-label="NEXUS, ir al resumen">
      <svg className="marca__simbolo" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="1" width="20" height="20" rx="5" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
        <rect x="5" y="9" width="5" height="8" rx="1" fill="var(--gold)" opacity=".9" />
        <path d="M13 4.5v13" stroke="var(--cyan)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M15.5 9.5l2-2M15.5 13l2.5-2.5M15.5 16.5l2.5-2.5" stroke="var(--text-3)" strokeWidth="1.1" strokeLinecap="round" />
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
      descripcion="Guarda instrumento, temporalidad, límite del replay, órdenes simuladas, capas y preferencias. Queda en este navegador; desde Ajustes se puede exportar."
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
  if (salud.error) return <Estado tono="error">Sin conexión con la API</Estado>;
  if (!salud.datos) return <Estado tono="apagado">Conectando…</Estado>;
  const n = salud.datos.datos.instrumentos_disponibles as string[] | undefined;
  return (
    <span title={`API ${salud.datos.version}, contrato ${salud.datos.contrato}. ${n?.length ?? 0} instrumentos con datos. Modo: ${String(salud.datos.datos.modo)}.`}>
      <Estado tono={n && n.length ? 'ok' : 'aviso'}>{n && n.length ? 'API conectada' : 'API sin datos'}</Estado>
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { estado, despachar } = useEspacio();
  const { instrumentos, replay, salud } = useGlobales();
  const { abrirPaleta, abrirAyuda } = useComandos();
  const { ruta, ir } = useRuta();
  const [guardando, setGuardando] = useState(false);
  const [masAbierto, setMasAbierto] = useState(false);
  const colapsada = estado.prefs.navColapsada;
  const instr = instrumentos.datos?.find((i) => i.simbolo === estado.simbolo);
  const limiteGuardado = estado.replay.limites[estado.simbolo];

  const globales = useMemo<Comando[]>(
    () => [
      ...MODULOS.map((m) => ({
        id: `ir-${m.id}`,
        titulo: `Ir a ${m.nombre}`,
        grupo: 'Navegación',
        atajo: `G luego ${m.tecla.toUpperCase()}`,
        palabras: `${m.ingles} ${m.descripcion}`,
        ejecutar: () => ir(m.id),
      })),
      {
        id: 'nav',
        titulo: colapsada ? 'Mostrar los nombres de la navegación' : 'Ocultar los nombres de la navegación',
        grupo: 'Espacio de trabajo',
        atajo: '[',
        ejecutar: () => despachar({ tipo: 'prefs', prefs: { navColapsada: !colapsada } }),
      },
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
    [colapsada, ir, despachar, abrirAyuda, instrumentos.datos],
  );
  useRegistrarComandos('global', globales);

  useAtajos({
    ...Object.fromEntries(MODULOS.map((m) => [`g ${m.tecla}`, () => ir(m.id)])),
    '[': () => despachar({ tipo: 'prefs', prefs: { navColapsada: !colapsada } }),
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

  const hastaDatos = instr?.cobertura_hasta ? Date.parse(`${instr.cobertura_hasta}Z`) : null;
  const enReplay = replay && replay.simbolo === estado.simbolo;

  return (
    <div className="shell" data-nav={colapsada ? 'colapsada' : 'expandida'}>
      <a className="saltar" href="#contenido" onClick={(e) => (e.preventDefault(), document.getElementById('contenido')?.focus())}>
        Saltar al contenido
      </a>
      <header className="barra">
        <Marca />
        <div className="barra__contexto">
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
              <button type="button" className="boton-contexto" {...p} aria-label={`Instrumento: ${estado.simbolo}. Cambiar`}>
                {estado.simbolo}
                <small className="ocultar-ancho-medio">{instr?.nombre ?? ''}</small>
                <Icono nombre="abajo" tam={14} />
              </button>
            )}
          />
          <div className="ocultar-movil">
            <Segmentado
              etiqueta="Temporalidad"
              opciones={TEMPORALIDADES.map((tf) => ({ valor: tf, etiqueta: etiquetaTf(tf), titulo: `Velas de ${nombreTf(tf)}` }))}
              valor={estado.tf}
              onCambio={(tf) => despachar({ tipo: 'tf', tf })}
            />
          </div>
          {salud.datos?.datos.sintetico === true && (
            <span className="chip-sintetico" role="note" title="La API arrancó con --sintetico: paseo al azar generado para pruebas">
              <Icono nombre="alerta" tam={14} />
              Datos sintéticos<span className="ocultar-movil">&nbsp;de prueba: no es mercado real</span>
            </span>
          )}
          {enReplay ? (
            <a className="chip-limite ocultar-movil" href="#/replay" title="Límite del replay: lo posterior no se muestra en ningún panel">
              <span className="chip-limite__marca" aria-hidden="true" />
              Replay <strong className="num">{fechaHoraCorta(replay.limite_ms, estado.prefs.zona)}</strong>
              <span className="ocultar-ancho-medio">{replay.sesion}</span>
            </a>
          ) : limiteGuardado ? (
            <a className="chip-limite ocultar-movil" href="#/replay" title="Último límite del replay para este instrumento">
              <span className="chip-limite__marca" aria-hidden="true" />
              Replay <strong className="num">{fechaHoraCorta(limiteGuardado, estado.prefs.zona)}</strong>
            </a>
          ) : null}
          <span
            className="chip-limite chip-limite--historico ocultar-movil ocultar-ancho-medio"
            title={`Sin feed en vivo. Último minuto disponible: ${hastaDatos ? fechaHora(hastaDatos, 'utc') : '—'}`}
          >
            <span className="chip-limite__marca" aria-hidden="true" />
            Histórico<span className="ocultar-ancho-grande">
              {' '}
              hasta <strong className="num">{hastaDatos ? fecha(hastaDatos, 'utc') : '—'}</strong>
            </span>
          </span>
        </div>
        <div className="barra__derecha">
          <button type="button" className="buscador" onClick={() => abrirPaleta(true)} aria-label="Buscar o ejecutar un comando (Ctrl K)">
            <Icono nombre="buscar" />
            <span className="buscador__texto">Buscar</span>
            <Tecla>Ctrl K</Tecla>
          </button>
          <span className="ocultar-movil ocultar-ancho-medio">
            <EstadoApi />
          </span>
          <BotonIcono etiqueta="Atajos de teclado (?)" icono="ayuda" onClick={() => abrirAyuda(true)} className="ocultar-movil" />
          <Menu
            etiqueta="Espacio de trabajo"
            alinear="der"
            items={[
              { id: 'guardar', texto: 'Guardar espacio…', alElegir: () => setGuardando(true) },
              { id: 'ver', texto: 'Espacios guardados', detalle: 'Ajustes', alElegir: () => ir('ajustes', { seccion: 'espacios' }) },
              { id: 'pref', texto: 'Preferencias', detalle: 'Ajustes', alElegir: () => ir('ajustes') },
            ]}
            boton={(p) => (
              <button type="button" className="boton-contexto" {...p} aria-label={`Espacio de trabajo: ${estado.nombre}`} title={`Espacio: ${estado.nombre}`}>
                <Icono nombre="espacio" />
                <span className="ocultar-ancho-medio" style={{ fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {estado.nombre}
                </span>
              </button>
            )}
          />
        </div>
      </header>

      <nav className="nav" aria-label="Módulos">
        {MODULOS.filter((m) => m.id !== 'ajustes').map((m) => (
          <a key={m.id} href={`#/${m.id}`} className="nav__item" aria-current={ruta.modulo === m.id ? 'page' : undefined} title={colapsada ? m.nombre : undefined}>
            <Icono nombre={ICONO_MODULO[m.id]} tam={18} />
            <span className="nav__texto">{m.nombre}</span>
          </a>
        ))}
        <div className="nav__separador" />
        <div className="nav__pie">
          <a href="#/ajustes" className="nav__item" aria-current={ruta.modulo === 'ajustes' ? 'page' : undefined} title={colapsada ? 'Ajustes' : undefined}>
            <Icono nombre="ajustes" tam={18} />
            <span className="nav__texto">Ajustes</span>
          </a>
          <button
            type="button"
            className="nav__item"
            style={{ border: 0, background: 'transparent', width: '100%' }}
            aria-label={colapsada ? 'Mostrar nombres de los módulos' : 'Ocultar nombres de los módulos'}
            title="Atajo: ["
            onClick={() => despachar({ tipo: 'prefs', prefs: { navColapsada: !colapsada } })}
          >
            <Icono nombre="panelIzq" tam={18} />
            <span className="nav__texto">Contraer</span>
          </button>
        </div>
      </nav>

      <main className="principal" id="contenido" tabIndex={-1}>
        {children}
      </main>

      <nav className="nav-movil" aria-label="Módulos">
        {(['resumen', 'replay', 'laboratorio', 'ejecucion'] as Modulo[]).map((id) => {
          const m = MODULOS.find((x) => x.id === id)!;
          return (
            <a key={id} href={`#/${id}`} aria-current={ruta.modulo === id ? 'page' : undefined}>
              <Icono nombre={ICONO_MODULO[id]} tam={20} />
              {id === 'laboratorio' ? 'Lab' : id === 'replay' ? 'Replay' : m.nombre}
            </a>
          );
        })}
        <button type="button" onClick={() => setMasAbierto(true)} aria-haspopup="dialog">
          <Icono nombre="mas2" tam={20} />
          Más
        </button>
      </nav>

      <Dialogo abierto={masAbierto} titulo="Módulos" onCerrar={() => setMasAbierto(false)}>
        <ul className="lista">
          {MODULOS.map((m) => (
            <li key={m.id}>
              <a
                className="nav__item"
                href={`#/${m.id}`}
                aria-current={ruta.modulo === m.id ? 'page' : undefined}
                onClick={() => setMasAbierto(false)}
                style={{ height: 'auto', padding: '10px' }}
              >
                <Icono nombre={ICONO_MODULO[m.id]} tam={18} />
                <span>
                  {m.nombre}
                  <br />
                  <small className="tenue">{m.descripcion}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Dialogo>
      <GuardarEspacio abierto={guardando} onCerrar={() => setGuardando(false)} />
      <PaletaComandos />
      <AyudaAtajos />
    </div>
  );
}
