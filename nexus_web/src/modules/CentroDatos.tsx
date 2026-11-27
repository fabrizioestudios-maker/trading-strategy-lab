import { useState } from 'react';
import { api } from '../api/cliente';
import { useRecurso } from '../api/recurso';
import { useAvisos } from '../app/avisos';
import { useEspacio } from '../app/espacio';
import { useGlobales } from '../app/globales';
import { Barras } from '../components/Barras';
import { Icono } from '../components/iconos';
import { BotonIcono, Cargando, ErrorEstado, Estado, Insignia, Panel, copiarTexto } from '../components/ui';
import { entero, fechaHora, huellaCorta, numero } from '../lib/formato';

export default function CentroDatos() {
  const { estado } = useEspacio();
  const { instrumentos } = useGlobales();
  const { avisar } = useAvisos();
  const [elegido, setElegido] = useState(estado.simbolo);
  const instr = instrumentos.datos?.find((i) => i.simbolo === elegido);
  const calidad = useRecurso((s) => api.calidad(elegido, s), [elegido], !!instr?.disponible);
  const iso = (x?: string | null) => (x ? fechaHora(Date.parse(`${x}Z`), 'utc') : '—');

  return (
    <div className="pagina">
      <header className="pagina__cabeza">
        <div>
          <h1>Centro de datos</h1>
          <p>Qué datos hay en este servidor, de dónde salen y si pasan los controles. Velas de 1 minuto, precios bid, horas en UTC.</p>
        </div>
      </header>
      <Panel titulo="Instrumentos" subtitulo="data/MANIFIESTO.csv y los archivos de data/ de este servidor" sinRelleno>
        {instrumentos.error && !instrumentos.datos ? (
          <ErrorEstado error={instrumentos.error} reintentar={instrumentos.recargar} />
        ) : !instrumentos.datos ? (
          <Cargando />
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th>Estado</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th className="der">Velas M1</th>
                  <th>Costo de referencia</th>
                  <th>Fuente</th>
                  <th>Huella SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {instrumentos.datos.map((i) => (
                  <tr key={i.simbolo} className={i.simbolo === elegido ? 'es-activo' : ''}>
                    <td>
                      <button type="button" className="enlace" onClick={() => setElegido(i.simbolo)} aria-pressed={i.simbolo === elegido}>
                        <strong>{i.simbolo}</strong> <span className="secundario">{i.nombre}</span>
                      </button>
                    </td>
                    <td>{i.disponible ? <Estado tono="ok">Con datos</Estado> : <Estado tono="apagado">Sin datos acá</Estado>}</td>
                    <td className="num">{iso(i.cobertura_desde)}</td>
                    <td className="num">{iso(i.cobertura_hasta)}</td>
                    <td className="der num">{i.velas_m1 ? entero(i.velas_m1) : '—'}</td>
                    <td>{i.costo_referencia}</td>
                    <td className="envuelve secundario">{i.fuente}</td>
                    <td className="num">
                      {i.huella_sha256 ? (
                        <span className="fila" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          {huellaCorta(i.huella_sha256)}
                          <BotonIcono
                            etiqueta={`Copiar la huella de ${i.simbolo}`}
                            icono="copiar"
                            className="boton-icono--chico"
                            onClick={async () => avisar({ texto: (await copiarTexto(i.huella_sha256!)) ? 'Huella copiada.' : 'No se pudo copiar.' })}
                          />
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grilla grilla--principal separado">
        <Panel titulo={`Calidad de ${elegido}`} subtitulo={calidad.datos ? `Calculada ${fechaHora(calidad.datos.calculado_en_ms, 'utc')} sobre ${entero(calidad.datos.velas_m1)} minutos` : undefined}>
          {!instr?.disponible ? (
            <p className="tenue">Este servidor no tiene datos de {elegido}.</p>
          ) : calidad.error ? (
            <ErrorEstado error={calidad.error} reintentar={calidad.recargar} />
          ) : !calidad.datos ? (
            <Cargando texto="Revisando 1 minuto por 1 minuto…" />
          ) : (
            <>
              <ul className="lista chequeos">
                {calidad.datos.chequeos.map((ch) => (
                  <li key={ch.nombre}>
                    <span className={`chequeo chequeo--${ch.resultado}`}>
                      <Icono nombre={ch.resultado === 'ok' ? 'check' : 'alerta'} tam={14} />
                      {ch.resultado === 'ok' ? 'Bien' : ch.resultado === 'aviso' ? 'Aviso' : 'Error'}
                    </span>
                    <span>
                      <strong>{ch.nombre}</strong>
                      <span className="secundario"> {ch.detalle}</span>
                    </span>
                    <span className="num">{numero(ch.valor, ch.valor % 1 ? 2 : 0)}</span>
                  </li>
                ))}
              </ul>
              <h3 className="subtitulo separado">Minutos por año</h3>
              <Barras
                etiqueta="Velas de 1 minuto por año"
                alto={140}
                formato={(v) => `${entero(v)} minutos`}
                datos={calidad.datos.cobertura_anual.map((x) => ({ clave: String(x.anio), valor: Number(x.velas), detalle: 'velas de 1 minuto' }))}
              />
            </>
          )}
        </Panel>
        <div className="apilado">
          <Panel titulo="Cómo llegan los datos a NEXUS">
            <ol className="reglas">
              <li>Los datos viven en data/ y no se versionan en git (pesan cientos de MB y tienen licencias de terceros).</li>
              <li>La API los lee de disco y arma una caché descomprimida en data/.cache_nexus, verificada con la huella del archivo.</li>
              <li>Un despliegue necesita montar esa carpeta o descargar los datos con los scripts del laboratorio; sin datos, la API responde «faltan los datos» en vez de inventar.</li>
            </ol>
            <p className="campo__ayuda separado">Zona horaria: los datos están en UTC; las sesiones se calculan en America/New_York, con horario de verano.</p>
          </Panel>
          <Panel titulo="Importar y actualizar">
            <p className="fila" style={{ marginBottom: 8 }}>
              <Insignia>Planificado</Insignia>
            </p>
            <p className="secundario">
              Descargar desde la interfaz necesita un trabajo con límites de red y control de licencias. Hoy se hace con los scripts del laboratorio:
            </p>
            <p className="separado">
              <code>python -m lab.descarga_histdata XAUUSD --desde 2010</code>
            </p>
            <p className="campo__ayuda separado">Después de descargar, data/MANIFIESTO.csv registra la fuente, la cobertura y la huella de cada archivo.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
