import { useEspacio, type Preferencias } from '../app/espacio';
import { Icono } from '../components/iconos';
import { Insignia, Panel } from '../components/ui';

type Capa = keyof Preferencias['capas'];

interface Herramienta {
  nombre: string;
  estado: 'disponible' | 'planificado';
  capa?: Capa;
  que: string;
  evidencia: string;
  fuente: string;
}

const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'Sesiones y killzones',
    estado: 'disponible',
    capa: 'sesiones',
    que: 'Asia, Londres, Nueva York, cierre y reapertura en hora de Nueva York (con horario de verano), como franja debajo del gráfico del replay.',
    evidencia: 'La reapertura (18:00–18:15 NY) tiene el bid deprimido por el spread: entrar ahí empeora el resultado (E041); E022 entra a las 18:15 (E042).',
    fuente: 'nexus_api/sesiones.py',
  },
  {
    nombre: 'Máximos y mínimos del día y la semana anteriores',
    estado: 'disponible',
    capa: 'niveles',
    que: 'PDH, PDL, PWH y PWL tomados solo de velas cerradas antes del límite.',
    evidencia: 'Barrer el máximo o el mínimo anterior no predijo una reversión (E035b, corregido).',
    fuente: 'nexus_api/estrategias.py · niveles()',
  },
  {
    nombre: 'Estructura: pivotes, BOS y CHOCH',
    estado: 'disponible',
    capa: 'estructura',
    que: 'Pivotes de 3 velas (se conocen 3 velas después) y rupturas por cierre: BOS a favor de la estructura, CHOCH en contra.',
    evidencia: 'Los modelos SMC/ICT del laboratorio rindieron como el azar después de costos (E038). Dibujar una ruptura no la vuelve una señal.',
    fuente: 'nexus_api/capas.py, definiciones de lab/smc.py',
  },
  {
    nombre: 'FVG (huecos de valor razonable)',
    estado: 'disponible',
    capa: 'fvg',
    que: 'Huecos de 3 velas de al menos 0,25 × ATR(14). El gráfico muestra los 3 más recientes sin mitigar.',
    evidencia: 'Entrar en el FVG del tramo no tuvo ventaja en E023 ni en E038.',
    fuente: 'nexus_api/capas.py, definiciones de lab/ict.py',
  },
  {
    nombre: 'iFVG y BPR',
    estado: 'planificado',
    que: 'FVG invertidos y zonas de precio equilibrado.',
    evidencia: 'Sin prueba propia en el laboratorio. Antes de dibujarlos hay que definirlos sin mirar adelante y probarlos.',
    fuente: '—',
  },
  {
    nombre: 'Liquidez y barridos',
    estado: 'planificado',
    que: 'Barridos de pivotes y de extremos de sesión.',
    evidencia: 'lab/smc.py y lab/ict.py ya los detectan para E023 y E038 (sin ventaja). Falta exponerlos como capa.',
    fuente: 'lab/smc.py · detectar(), lab/ict.py · s1_barrido()',
  },
  {
    nombre: 'Order blocks',
    estado: 'planificado',
    que: 'Última vela contraria antes del impulso que rompe estructura.',
    evidencia: 'Definidos en lab/ict.py (s2_breaker) para E038, sin ventaja. Falta la capa.',
    fuente: 'lab/ict.py',
  },
  {
    nombre: 'Premium/discount y OTE',
    estado: 'planificado',
    que: 'Mitad del rango del tramo y retroceso de 62–79 %.',
    evidencia: 'El descuento formó parte del setup E023 (sin ventaja). Falta la capa.',
    fuente: 'lab/smc.py',
  },
];

export default function Herramientas() {
  const { estado, despachar } = useEspacio();
  const capas = estado.prefs.capas;
  const fijar = (k: Capa, v: boolean) => despachar({ tipo: 'prefs', prefs: { capas: { ...capas, [k]: v } } });
  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Herramientas institucionales</h1>
          <p>Capas descriptivas sobre el replay. Cada una se calcula solo con velas cerradas antes del límite y dice qué encontró el laboratorio cuando se probó como señal.</p>
        </div>
        <div className="pagina__acciones">
          <a className="boton" href="#/replay">
            <Icono nombre="replay" />
            Ver en el replay
          </a>
        </div>
      </header>
      <p className="nota nota--aviso">
        <Icono nombre="alerta" />
        <span>
          Detectar un patrón no prueba que tenga valor predictivo. En este laboratorio ninguna regla sobrevivió a las correcciones por pruebas múltiples (E031) y los
          modelos SMC/ICT rindieron como el azar después de costos (E038).
        </span>
      </p>
      <Panel titulo="Capas" subtitulo="Las activadas se dibujan en el replay de cualquier instrumento con datos" className="separado" sinRelleno>
        <ul className="lista herramientas">
          {HERRAMIENTAS.map((h) => (
            <li key={h.nombre} className="herramienta">
              <div className="herramienta__cabeza">
                <strong>{h.nombre}</strong>
                {h.estado === 'disponible' ? <Insignia tono="activo">Disponible</Insignia> : <Insignia>Planificado</Insignia>}
              </div>
              <p className="herramienta__que">{h.que}</p>
              <p className="herramienta__evidencia">
                <span className="tenue">Evidencia: </span>
                {h.evidencia}
              </p>
              <p className="campo__ayuda">Código: {h.fuente}</p>
              <div className="herramienta__control">
                {h.capa ? (
                  <label className="casilla">
                    <input type="checkbox" checked={capas[h.capa]} onChange={(e) => fijar(h.capa!, e.target.checked)} />
                    Mostrar en el replay
                  </label>
                ) : (
                  <span className="tenue">
                    <Icono nombre="candado" tam={13} /> No disponible todavía
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
