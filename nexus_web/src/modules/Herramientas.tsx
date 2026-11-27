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
    estado: 'disponible',
    capa: 'ifvg',
    que: 'iFVG: un FVG atravesado por cierre, que desde ahí se lee del lado contrario. BPR: la superposición de dos FVG de sentido contrario formados con hasta 20 velas de diferencia. El gráfico muestra los 2 iFVG y el BPR más recientes que siguen vigentes.',
    evidencia: 'Sin prueba propia en el laboratorio: se dibujan como descripción, no como señal. Se definieron sin mirar adelante (solo velas cerradas hasta el límite).',
    fuente: 'nexus_api/capas.py',
  },
  {
    nombre: 'Barridos de liquidez',
    estado: 'disponible',
    capa: 'barridos',
    que: 'Una vela pasa el último pivote y cierra de vuelta sin romperlo. Cada pivote se marca una sola vez.',
    evidencia: 'El barrido con cierre de vuelta fue el gatillo del setup E023 y de varios modelos de E038: sin ventaja después de costos.',
    fuente: 'nexus_api/capas.py, definiciones de lab/smc.py y lab/ict.py',
  },
  {
    nombre: 'Order blocks',
    estado: 'disponible',
    capa: 'ob',
    que: 'En cada ruptura, la última vela contraria de las 10 anteriores. El gráfico muestra los 2 más recientes sin mitigar.',
    evidencia: 'Definidos como en lab/ict.py (setup 2, E038): sin ventaja después de costos.',
    fuente: 'nexus_api/capas.py',
  },
  {
    nombre: 'RSI (14)',
    estado: 'disponible',
    capa: 'rsi',
    que: 'Panel debajo del gráfico, calculado con lab/senales.py solo con velas reveladas.',
    evidencia: 'Las familias de indicadores clásicos (E001–E018) no dieron una regla que sobreviva la validación.',
    fuente: 'nexus_api/indicadores.py',
  },
  {
    nombre: 'MACD (12, 26, 9)',
    estado: 'disponible',
    capa: 'macd',
    que: 'Panel con histograma, línea y señal, sincronizado con el gráfico.',
    evidencia: 'Igual que el RSI: descriptivo, sin ventaja probada en el laboratorio.',
    fuente: 'nexus_api/indicadores.py',
  },
  {
    nombre: 'Premium/discount y OTE',
    estado: 'disponible',
    capa: 'ote',
    que: 'Tramo vigente: del último pivote a favor de la estructura hasta el extremo posterior. EQ marca la mitad (arriba premium, abajo discount) y OTE el retroceso de 62 % a 79 % de ese tramo.',
    evidencia: 'El descuento formó parte del setup E023 y de los modelos de E038: sin ventaja después de costos.',
    fuente: 'nexus_api/capas.py',
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
                {h.estado === 'disponible' ? <Insignia tono="activo" icono="check">Disponible</Insignia> : <Insignia icono="reloj">Planificado</Insignia>}
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
