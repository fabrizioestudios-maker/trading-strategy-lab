/** Panel de administración: todo el proyecto de un vistazo (cuentas, datos, laboratorio, probador, sistema y documentos). */
import { useState } from 'react';
import { api, explicarError } from '../api/cliente';
import type { Usuario } from '../api/contrato.gen';
import { useRecurso } from '../api/recurso';
import { useAvisos } from '../app/avisos';
import { useEspacio } from '../app/espacio';
import { useSesion } from '../app/sesion';
import { Icono } from '../components/iconos';
import { Boton, Cargando, ErrorEstado, Insignia, Panel, Pestanas } from '../components/ui';
import { entero, fechaHora, numero } from '../lib/formato';

type Vista = 'resumen' | 'usuarios' | 'actividad' | 'documentos' | 'sistema';
const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'usuarios', etiqueta: 'Usuarios' },
  { id: 'actividad', etiqueta: 'Actividad' },
  { id: 'documentos', etiqueta: 'Documentos' },
  { id: 'sistema', etiqueta: 'Sistema' },
];

const ETIQUETAS: Record<string, string> = {
  usuarios: 'Usuarios', admins: 'Administradores', activos_7d: 'Activos (7 días)', con_google: 'Con Google', sesiones_vigentes: 'Sesiones abiertas',
  registros_30d: 'Registros (30 días)', ingresos_fallidos_24h: 'Ingresos fallidos (24 h)', instrumentos: 'Instrumentos', con_datos: 'Con datos',
  velas_m1: 'Velas de 1 minuto', tamano_mb: 'Datos (MB)', hasta: 'Datos hasta', corridas: 'Corridas del laboratorio', corridas_terminado: 'Corridas terminadas',
  corridas_fallido: 'Corridas fallidas', corridas_corriendo: 'Corriendo ahora', entradas_bitacora: 'Entradas de la bitácora', experimentos: 'Experimentos',
  indicadores: 'Indicadores en la biblioteca', pruebas: 'Pruebas del probador', usuarios_que_probaron: 'Usuarios que probaron', memoria_mb: 'Memoria (MB)',
  cpus: 'Procesadores', disco_libre_gb: 'Disco libre (GB)', disco_total_gb: 'Disco total (GB)', segundos_activo: 'Activo hace (s)', login: 'Cuentas obligatorias',
  google: 'Ingreso con Google', admins_configurados: 'Admins por configuración', cookie_segura: 'Cookie solo HTTPS', datos_sinteticos: 'Datos sintéticos',
};

function Tarjetas({ datos }: { datos: Record<string, unknown> }) {
  return (
    <dl className="admin-tarjetas">
      {Object.entries(datos).map(([k, v]) => (
        <div key={k} className="admin-tarjeta">
          <dt>{ETIQUETAS[k] ?? k}</dt>
          <dd className="num">{typeof v === 'boolean' ? (v ? 'Sí' : 'No') : typeof v === 'number' ? numero(v, Number.isInteger(v) ? 0 : 1) : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 16).replace('T', ' ') + ' UTC' : String(v ?? '—')}</dd>
        </div>
      ))}
    </dl>
  );
}

function Resumen() {
  const r = useRecurso((s) => api.adminResumen(s), []);
  const ctx = useRecurso((s) => api.contexto(s), []);
  if (r.error) return <ErrorEstado error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const d = r.datos;
  return (
    <div className="admin-columnas">
      <Panel titulo="Proyecto" subtitulo={`NEXUS ${d.version} · contrato ${d.contrato} · commit ${d.commit?.slice(0, 10) ?? '—'}`}>
        <Tarjetas datos={d.configuracion} />
      </Panel>
      <Panel titulo="Cuentas">
        <Tarjetas datos={d.usuarios} />
      </Panel>
      <Panel titulo="Datos">
        <Tarjetas datos={d.datos} />
      </Panel>
      <Panel titulo="Laboratorio y probador">
        <Tarjetas datos={{ ...d.laboratorio, ...d.probador }} />
      </Panel>
      <Panel titulo="Pruebas a futuro" subtitulo="Las que validan o descartan las candidatas">
        {ctx.datos ? (
          <ul className="lista">
            {ctx.datos.pruebas_a_futuro.map((p) => (
              <li key={String(p.id)} className="admin-fila">
                <strong>{String(p.id ?? '')}</strong>{' '}
                <span>{p.variantes && typeof p.variantes === 'object' ? Object.keys(p.variantes as object).join(', ') : ''}</span>
                <p className="campo__ayuda">
                  Empieza {String(p.inicio_utc ?? '—')} UTC · sellada {String(p.sellado_utc ?? '—')} · {String(p.decision ?? '')}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Cargando />
        )}
        {ctx.datos?.total_configuraciones && <p className="campo__ayuda">Configuraciones probadas en total: {ctx.datos.total_configuraciones}</p>}
      </Panel>
      <Panel titulo="Licencias de terceros">
        <ul className="lista">
          {d.licencias.map((l) => (
            <li key={l.nombre} className="admin-fila">
              <strong>{l.nombre}</strong> <Insignia>{l.licencia}</Insignia>
              <p className="campo__ayuda">{l.nota}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Usuarios() {
  const r = useRecurso((s) => api.adminUsuarios(s), []);
  const { usuario } = useSesion();
  const { avisar } = useAvisos();
  const [q, setQ] = useState('');
  const cambiar = async (u: Usuario, c: { rol?: 'usuario' | 'admin'; activo?: boolean }) => {
    try {
      await api.adminCambiar(u.id, c);
      avisar({ texto: `${u.email}: cambio guardado.` });
      r.recargar();
    } catch (e) {
      avisar({ texto: explicarError(e).detalle, tono: 'error' });
    }
  };
  if (r.error) return <ErrorEstado error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const lista = r.datos.filter((u) => !q || `${u.email} ${u.nombre}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel titulo={`Usuarios (${r.datos.length})`} acciones={<input className="entrada entrada--chica" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuario" />} sinRelleno>
      <div className="tabla-envoltura">
        <table className="tabla tabla--compacta">
          <thead>
            <tr>
              <th scope="col">Usuario</th>
              <th scope="col">Acceso</th>
              <th scope="col">Rol</th>
              <th scope="col">Alta</th>
              <th scope="col">Último ingreso</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.nombre}</strong>
                  <br />
                  <span className="tenue">{u.email}</span>
                </td>
                <td>{[u.contrasena && 'correo', u.google && 'Google'].filter(Boolean).join(' + ') || '—'}</td>
                <td>{u.rol === 'admin' ? <Insignia tono="activo">admin</Insignia> : 'usuario'}</td>
                <td className="num">{fechaHora(u.creado_ms, 'utc')}</td>
                <td className="num">{u.ultimo_acceso_ms ? fechaHora(u.ultimo_acceso_ms, 'utc') : '—'}</td>
                <td>{u.activo ? 'activo' : <span className="tono-neg">desactivado</span>}</td>
                <td className="fila admin-acciones">
                  {u.id !== usuario?.id && (
                    <>
                      <Boton chico onClick={() => void cambiar(u, { rol: u.rol === 'admin' ? 'usuario' : 'admin' })}>
                        {u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                      </Boton>
                      <Boton chico variante={u.activo ? 'peligro' : 'secundario'} onClick={() => void cambiar(u, { activo: !u.activo })}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </Boton>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Actividad() {
  const r = useRecurso((s) => api.adminEventos(s), []);
  if (r.error) return <ErrorEstado error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const NOMBRE: Record<string, string> = { registro: 'Registro', ingreso: 'Ingreso', ingreso_fallido: 'Ingreso fallido', cambio_rol: 'Cambio de rol', cambio_estado: 'Activación' };
  return (
    <Panel titulo="Registro de actividad" subtitulo="Últimos 300 eventos de cuentas (sin contraseñas ni tokens)" acciones={<Boton chico icono="reiniciar" onClick={r.recargar}>Actualizar</Boton>} sinRelleno>
      <div className="tabla-envoltura tabla-envoltura--alta">
        <table className="tabla tabla--compacta">
          <thead>
            <tr>
              <th scope="col">Cuándo (UTC)</th>
              <th scope="col">Evento</th>
              <th scope="col">Cuenta</th>
              <th scope="col">Detalle</th>
              <th scope="col">IP</th>
            </tr>
          </thead>
          <tbody>
            {r.datos.map((e, i) => (
              <tr key={`${e.t}-${i}`} className={e.tipo === 'ingreso_fallido' ? 'es-aviso' : ''}>
                <td className="num">{fechaHora(e.t, 'utc')}</td>
                <td>{NOMBRE[e.tipo] ?? e.tipo}</td>
                <td>{e.email ?? '—'}</td>
                <td className="tenue">{e.detalle}</td>
                <td className="num tenue">{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Documentos() {
  const lista = useRecurso((s) => api.adminDocumentos(s), []);
  const [ruta, setRuta] = useState<string | null>(null);
  const doc = useRecurso((s) => (ruta ? api.adminDocumento(ruta, s) : Promise.resolve(null)), [ruta]);
  if (lista.error) return <ErrorEstado error={lista.error} reintentar={lista.recargar} />;
  if (!lista.datos) return <Cargando />;
  return (
    <div className="admin-docs">
      <Panel titulo="Documentos del proyecto" sinRelleno>
        <ul className="lista admin-docs__lista">
          {lista.datos.map((d) => (
            <li key={d.ruta}>
              <button type="button" className={`admin-docs__item${ruta === d.ruta ? ' es-activo' : ''}`} onClick={() => setRuta(d.ruta)}>
                <strong>{d.titulo}</strong>
                <span className="tenue">
                  {d.ruta} · {entero(d.bytes / 1024)} KB · {fechaHora(d.modificado_ms, 'utc')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel titulo={doc.datos?.titulo ?? 'Elegí un documento'} subtitulo={doc.datos?.ruta}>
        {ruta && !doc.datos && !doc.error && <Cargando />}
        {doc.datos && <pre className="admin-docs__texto">{doc.datos.texto}</pre>}
      </Panel>
    </div>
  );
}

function Sistema() {
  const r = useRecurso((s) => api.adminResumen(s), []);
  const salud = useRecurso((s) => api.salud(s), []);
  const { estado } = useEspacio();
  if (r.error) return <ErrorEstado error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  return (
    <div className="admin-columnas">
      <Panel titulo="Servidor" subtitulo={`Python ${r.datos.python} · ${r.datos.plataforma}`}>
        <Tarjetas datos={r.datos.sistema} />
        <p className="campo__ayuda">Activo desde {fechaHora(r.datos.activo_desde_ms, 'utc')} UTC.</p>
      </Panel>
      <Panel titulo="Configuración" subtitulo="Se cambia con variables de entorno al desplegar (ver DEPLOY.md)">
        <Tarjetas datos={r.datos.configuracion} />
      </Panel>
      <Panel titulo="API">
        <Tarjetas datos={{ modo: salud.datos?.datos.modo ?? '…', espacio: estado.nombre }} />
        <p className="campo__ayuda">
          <Icono nombre="info" tam={12} /> Documentación interactiva de la API en <code>/docs</code> del servidor.
        </p>
      </Panel>
    </div>
  );
}

export default function Admin() {
  const { esAdmin } = useSesion();
  const [vista, setVista] = useState<Vista>('resumen');
  if (!esAdmin) return <ErrorEstado error={new Error('Solo para administradores')} />;
  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Administración</h1>
          <p>Todo el proyecto en un lugar: cuentas y actividad, datos, laboratorio, probador, servidor, licencias y documentos.</p>
        </div>
      </header>
      <Pestanas idBase="adm" etiqueta="Secciones de administración" pestanas={VISTAS} activa={vista} onCambio={setVista} />
      <div className="separado" role="tabpanel" id={`adm-panel-${vista}`} aria-labelledby={`adm-pestana-${vista}`}>
        {vista === 'resumen' ? <Resumen /> : vista === 'usuarios' ? <Usuarios /> : vista === 'actividad' ? <Actividad /> : vista === 'documentos' ? <Documentos /> : <Sistema />}
      </div>
    </div>
  );
}
