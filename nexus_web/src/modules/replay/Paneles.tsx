import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/cliente';
import type { CalculoRiesgo, CuadroReplay, EstadoOrdenSimulada, Evento } from '../../api/contrato.gen';
import { useAvisos } from '../../app/avisos';
import { useEspacio, type OrdenGuardada } from '../../app/espacio';
import { useGlobales } from '../../app/globales';
import { Icono } from '../../components/iconos';
import { Boton, BotonIcono, Campo, Insignia, Vacio, type Tono } from '../../components/ui';
import { conSigno, fechaHora, numero, precio, tono, type Zona } from '../../lib/formato';
import { nuevoId, validarOrden, validarOrdenLimite } from '../../lib/replay';

/* ------------------------------------------------------------------------------------------------ decisión */
export function PanelDecision({ cuadro }: { cuadro: CuadroReplay }) {
  const d = cuadro.decision;
  if (!d) return <Vacio titulo="Sin estrategia para este instrumento" texto="E022 está definida y probada solo en XAUUSD. El gráfico y las capas siguen funcionando." />;
  const etiqueta = { compra: 'Compra', venta: 'Venta', espera: 'Espera', sin_datos: 'Sin datos suficientes' }[d.decision];
  const tonoD: Tono = d.decision === 'compra' ? 'pos' : d.decision === 'venta' ? 'neg' : 'neutro';
  return (
    <div className="decision">
      <div className="decision__cabeza">
        <p className="decision__estrategia">{d.estrategia}</p>
        <Insignia tono="identidad" titulo={d.nivel}>
          Nivel {d.nivel.split(/[\s·]/)[0]}, candidata
        </Insignia>
      </div>
      <p className="tenue decision__nota">Versión {d.version}. Se evalúa con la última vela diaria cerrada antes del límite.</p>
      <div className={`decision__resultado decision__resultado--${tonoD}`}>
        {d.decision === 'compra' && <Icono nombre="sube" tam={14} />}
        {d.decision === 'venta' && <Icono nombre="baja" tam={14} />}
        <strong>{etiqueta}</strong>
        <span>{d.explicacion}</span>
      </div>
      <ul className="lista condiciones">
        {d.condiciones.map((c) => (
          <li key={c.clave}>
            <span className={`condicion condicion--${c.cumple === null ? 'na' : c.cumple ? 'si' : 'no'}`} aria-hidden="true">
              <Icono nombre={c.cumple === null ? 'guion' : c.cumple ? 'check' : 'cruz'} tam={13} />
            </span>
            <span className="condiciones__texto">
              {c.texto}
              <span className="visualmente-oculto">{c.cumple === null ? ': informativo' : c.cumple ? ': se cumple' : ': no se cumple'}</span>
            </span>
            {c.valor && <span className="num secundario">{/^-?\d+(\.\d+)?$/.test(c.valor) ? precio(Number(c.valor)) : c.valor}</span>}
          </li>
        ))}
      </ul>
      <dl className="definiciones separado">
        <dt>Vela diaria usada</dt>
        <dd>{d.vela_diaria_ms ? fechaHora(d.vela_diaria_ms, 'ny') : '—'}</dd>
        <dt>Distancia del stop</dt>
        <dd className="num">{d.stop_distancia ? precio(d.stop_distancia) : '—'}</dd>
        <dt>Distancia del objetivo</dt>
        <dd className="num">{d.objetivo_distancia ? precio(d.objetivo_distancia) : '—'}</dd>
        <dt>Entrada prevista</dt>
        <dd>{d.entrada_prevista ?? '—'}</dd>
      </dl>
      <p className="nota separado">
        <Icono nombre="info" />
        <span>
          Panel descriptivo de la regla registrada. Mostrar una decisión no es una recomendación: E022 es una candidata sin validar (le falta el período limpio de
          F001 y F002).
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ órdenes */
const NOMBRE_ESTADO: Record<EstadoOrdenSimulada['estado'], { texto: string; tono: Tono }> = {
  posterior_al_limite: { texto: 'Todavía no existe', tono: 'neutro' },
  esperando_llenado: { texto: 'Esperando llenado', tono: 'activo' },
  rechazada: { texto: 'Rechazada', tono: 'aviso' },
  abierta: { texto: 'Abierta', tono: 'activo' },
  cerrada: { texto: 'Cerrada', tono: 'neutro' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
  vencida: { texto: 'Vencida', tono: 'neutro' },
};

export function PanelOrdenes({
  cuadro,
  limite,
  ordenes,
  estados,
  zona,
  ladoInicial,
  vista = 'ambos',
  dinero,
}: {
  cuadro: CuadroReplay;
  limite: number;
  ordenes: OrdenGuardada[];
  estados: EstadoOrdenSimulada[];
  zona: Zona;
  ladoInicial?: { lado: 'compra' | 'venta'; n: number } | null;
  /** 'ticket' (pestaña Operar), 'lista' (pestaña Órdenes) o los dos */
  vista?: 'ticket' | 'lista' | 'ambos';
  /** Resultado en dinero por orden (cuenta simulada de la API) */
  dinero?: Map<string, number | null>;
}) {
  const { estado, despachar } = useEspacio();
  const { avisar } = useAvisos();
  const { instrumentos } = useGlobales();
  const instr = instrumentos.datos?.find((i) => i.simbolo === cuadro.simbolo);
  const dec = instr?.decimales ?? 2;
  const referencia = cuadro.velas[cuadro.velas.length - 1]?.c ?? 0;
  const [lado, setLado] = useState<'compra' | 'venta'>('compra');
  const [tipo, setTipo] = useState<'mercado' | 'limite'>('mercado');
  const [entradaLim, setEntradaLim] = useState('');
  const [vence, setVence] = useState(240);
  const distancia = useMemo(() => Number((referencia * 0.0025).toFixed(dec)), [referencia, dec]);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [calculo, setCalculo] = useState<CalculoRiesgo | null>(null);
  const [errorCalc, setErrorCalc] = useState<string | null>(null);

  // mientras el usuario no edite el stop o el objetivo, la propuesta sigue al precio de referencia
  const [editado, setEditado] = useState(false);
  const proponer = (l: 'compra' | 'venta', t: 'mercado' | 'limite' = tipo) => {
    const d = l === 'compra' ? 1 : -1;
    // límite: la entrada se propone a media distancia del stop, del lado que exige una orden límite
    const base = t === 'limite' ? referencia - d * 0.5 * distancia : referencia;
    if (t === 'limite') setEntradaLim(base.toFixed(dec));
    setSl((base - d * distancia).toFixed(dec));
    setTp((base + d * 2 * distancia).toFixed(dec));
    setEditado(false);
  };
  useEffect(() => {
    if (ladoInicial) {
      setLado(ladoInicial.lado);
      proponer(ladoInicial.lado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladoInicial?.n]);
  useEffect(() => {
    if (referencia && (!editado || (!sl && !tp))) proponer(lado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencia]);

  const nSl = Number(sl.replace(',', '.'));
  const nTp = Number(tp.replace(',', '.'));
  const nEnt = tipo === 'limite' ? Number(entradaLim.replace(',', '.')) : referencia;
  const problema = !referencia
    ? 'Sin precio de referencia'
    : tipo === 'limite'
      ? validarOrdenLimite(lado, referencia, nEnt, nSl, nTp)
      : validarOrden(lado, referencia, nSl, nTp);

  useEffect(() => {
    if (problema) {
      setCalculo(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api
        .riesgo({ simbolo: cuadro.simbolo, capital: estado.prefs.capital, riesgo_pct: estado.prefs.riesgoPct, entrada: nEnt, stop: nSl, objetivo: nTp, paso_lote: estado.prefs.pasoLote }, ctl.signal)
        .then((c) => {
          setCalculo(c);
          setErrorCalc(null);
        })
        .catch((e) => !ctl.signal.aborted && setErrorCalc(e instanceof Error ? e.message : 'No se pudo calcular'));
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [problema, nEnt, nSl, nTp, cuadro.simbolo, estado.prefs.capital, estado.prefs.riesgoPct, estado.prefs.pasoLote]);

  const crear = () => {
    if (problema) return;
    const o: OrdenGuardada =
      tipo === 'limite'
        ? { id: nuevoId(), lado, tipo, entrada: nEnt, vence_minutos: vence, creada_limite_ms: limite, sl: nSl, tp: nTp, simbolo: cuadro.simbolo, ...(calculo?.lotes ? { lotes: calculo.lotes } : {}) }
        : { id: nuevoId(), lado, creada_limite_ms: limite, sl: nSl, tp: nTp, simbolo: cuadro.simbolo, ...(calculo?.lotes ? { lotes: calculo.lotes } : {}) };
    despachar({ tipo: 'ordenes', ordenes: [...estado.replay.ordenes, o] });
    avisar({
      texto:
        tipo === 'limite'
          ? `Orden límite de ${lado} en ${precio(nEnt, dec)} creada. Vence a los ${vence} minutos de mercado.`
          : `Orden simulada de ${lado} creada. Se llena en la apertura del próximo minuto.`,
    });
  };

  const borrar = (ids: string[]) => {
    const antes = estado.replay.ordenes;
    despachar({ tipo: 'ordenes', ordenes: antes.filter((o) => !ids.includes(o.id)) });
    avisar({ texto: ids.length > 1 ? `Se borraron ${ids.length} órdenes simuladas.` : 'Orden simulada borrada.', deshacer: () => despachar({ tipo: 'ordenes', ordenes: antes }) });
  };

  const porId = new Map(estados.map((e) => [e.id, e]));
  const lista = [...ordenes].sort((a, b) => b.creada_limite_ms - a.creada_limite_ms);

  return (
    <div className="ordenes">
      {vista !== 'lista' && (
      <form
        className="ticket"
        onSubmit={(e) => {
          e.preventDefault();
          crear();
        }}
        aria-label="Nueva orden simulada"
      >
        <div className="ticket__tipos" role="radiogroup" aria-label="Tipo de orden">
          {(
            [
              ['mercado', 'A mercado'],
              ['limite', 'Límite'],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={tipo === v}
              className={tipo === v ? 'es-activo' : ''}
              onClick={() => {
                setTipo(v);
                proponer(lado, v);
              }}
            >
              {t}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={false} disabled title="Planificado: todavía no hay un modelo de llenado validado para órdenes stop">
            Stop
          </button>
        </div>
        <div className="ticket__lados" role="radiogroup" aria-label="Dirección">
          {(['compra', 'venta'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lado === l}
              className={`ticket__lado ticket__lado--${l}${lado === l ? ' es-activo' : ''}`}
              onClick={() => {
                setLado(l);
                proponer(l);
              }}
            >
              <span>{l === 'compra' ? 'Comprar' : 'Vender'}</span>
              <strong className="num">{precio(tipo === 'limite' && nEnt ? nEnt : referencia, dec)}</strong>
            </button>
          ))}
        </div>
        {tipo === 'limite' && (
          <div className="ticket__campos">
            <Campo etiqueta="Entrada límite">
              {(id) => (
                <input
                  id={id}
                  className="entrada"
                  inputMode="decimal"
                  value={entradaLim}
                  onChange={(e) => {
                    setEntradaLim(e.target.value);
                    setEditado(true);
                  }}
                />
              )}
            </Campo>
            <Campo etiqueta="Vence en">
              {(id) => (
                <select id={id} className="selector" value={vence} onChange={(e) => setVence(Number(e.target.value))}>
                  <option value={60}>1 hora</option>
                  <option value={240}>4 horas</option>
                  <option value={1440}>1 día</option>
                  <option value={4320}>3 días</option>
                </select>
              )}
            </Campo>
          </div>
        )}
        <div className="ticket__tamano">
          <span className="campo__etiqueta">Tamaño (lotes)</span>
          <span className="ticket__lotes num">{calculo ? numero(calculo.lotes, 2) : '—'}</span>
          <span className="tenue">
            {numero(estado.prefs.riesgoPct, 2)} % de {numero(estado.prefs.capital, 0)} USD
          </span>
        </div>
        <p className="ticket__titulo">Gestión del riesgo</p>
        <div className="ticket__campos">
          <Campo etiqueta="Stop (SL)">
            {(id) => (
              <input
                id={id}
                className="entrada"
                inputMode="decimal"
                value={sl}
                onChange={(e) => {
                  setSl(e.target.value);
                  setEditado(true);
                }}
              />
            )}
          </Campo>
          <Campo etiqueta="Objetivo (TP)">
            {(id) => (
              <input
                id={id}
                className="entrada"
                inputMode="decimal"
                value={tp}
                onChange={(e) => {
                  setTp(e.target.value);
                  setEditado(true);
                }}
              />
            )}
          </Campo>
        </div>
        {problema ? (
          <p className="campo__error" role="alert">
            {problema}{' '}
            <button type="button" className="boton boton--texto boton--chico" onClick={() => proponer(lado)}>
              Proponer de nuevo
            </button>
          </p>
        ) : calculo ? (
          <dl className="definiciones ticket__calculo">
            <dt>Riesgo real</dt>
            <dd className="num">{numero(calculo.riesgo_real_moneda, 2)} USD</dd>
            <dt>Objetivo / stop</dt>
            <dd className="num">{calculo.rr ? `${numero(calculo.rr, 2)} : 1` : '—'}</dd>
            <dt>Costo ida y vuelta</dt>
            <dd className="num">
              {numero(calculo.costo_ida_vuelta_moneda, 2)} USD ({numero(calculo.costo_en_r, 3)} R)
            </dd>
          </dl>
        ) : errorCalc ? (
          <p className="campo__error">{errorCalc}</p>
        ) : (
          <p className="tenue">Calculando tamaño y costos…</p>
        )}
        <button type="submit" className="ticket__crear" disabled={!!problema}>
          {tipo === 'limite' ? `Crear orden límite de ${lado}` : `Crear orden simulada de ${lado}`}
        </button>
        <p className="campo__ayuda">
          <Icono nombre="info" tam={12} /> Simulación: no sale a ningún bróker.{' '}
          {tipo === 'limite'
            ? 'Se llena al tocar la entrada; si antes llega al objetivo, se cancela (lab/smc.py).'
            : 'Se llena en la apertura del minuto siguiente; si stop y objetivo caen en el mismo minuto, cuenta el stop.'}
        </p>
      </form>
      )}
      {vista !== 'ticket' && (
      <>
      <div className="fila fila--entre separado">
        <h3 className="subtitulo">Órdenes de {cuadro.simbolo}</h3>
        {lista.length > 0 && (
          <Boton chico variante="peligro" icono="papelera" onClick={() => borrar(lista.map((o) => o.id))}>
            Borrar todas
          </Boton>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="tenue">Todavía no hay órdenes simuladas en este instrumento.</p>
      ) : (
        <ul className="lista lista-ordenes">
          {lista.map((o) => {
            const e = porId.get(o.id);
            const est = e ? NOMBRE_ESTADO[e.estado] : { texto: 'Calculando…', tono: 'neutro' as Tono };
            return (
              <li key={o.id}>
                <div className="fila fila--entre">
                  <span className={o.lado === 'compra' ? 'tono-alza' : 'tono-baja'}>
                    {o.lado === 'compra' ? '▲ Compra' : '▼ Venta'}
                    <span className="tenue"> · creada {fechaHora(o.creada_limite_ms, zona)}</span>
                  </span>
                  <span className="fila">
                    <Insignia tono={est.tono}>{e?.estado === 'cerrada' ? `Cerrada por ${e.motivo === 'TP' ? 'objetivo' : 'stop'}` : est.texto}</Insignia>
                    <BotonIcono etiqueta="Borrar esta orden" icono="papelera" className="boton-icono--chico" onClick={() => borrar([o.id])} />
                  </span>
                </div>
                <div className="lista-ordenes__datos num">
                  <span>
                    <span className="tenue">{o.tipo === 'limite' ? `Límite ${precio(o.entrada, dec)} · entrada ` : 'Entrada '}</span>
                    {e?.precio_entrada ? precio(e.precio_entrada, dec) : '—'}
                  </span>
                  <span>
                    <span className="tenue">SL </span>
                    {precio(o.sl, dec)}
                  </span>
                  <span>
                    <span className="tenue">TP </span>
                    {precio(o.tp, dec)}
                  </span>
                  <span className={e?.r !== null && e?.r !== undefined ? `tono-${tono(e.r)}` : ''}>
                    <span className="tenue">{e?.estado === 'abierta' ? 'R abierto ' : 'R '}</span>
                    {e?.r !== null && e?.r !== undefined ? conSigno(e.r, 2) : '—'}
                    {dinero?.get(o.id) !== undefined && dinero.get(o.id) !== null && <> ({conSigno(dinero.get(o.id), 2, 'USD')})</>}
                  </span>
                  {o.lotes && (
                    <span>
                      <span className="tenue">Lotes </span>
                      {numero(o.lotes, 2)}
                    </span>
                  )}
                </div>
                {e?.explicacion && <p className="lista-ordenes__nota">{e.explicacion}</p>}
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ eventos */
export function PanelEventos({ eventos, estados, zona }: { eventos: Evento[]; estados: EstadoOrdenSimulada[]; zona: Zona }) {
  const propios: Evento[] = [];
  for (const e of estados) {
    if (e.entrada_ms && e.estado !== 'rechazada') propios.push({ t: e.entrada_ms, tipo: 'orden', titulo: 'Orden simulada llenada', detalle: `Entrada en ${precio(e.precio_entrada)}`, lado: null });
    if (e.estado === 'cerrada' && e.salida_ms)
      propios.push({ t: e.salida_ms, tipo: 'orden', titulo: `Orden simulada cerrada por ${e.motivo === 'TP' ? 'objetivo' : 'stop'}`, detalle: `Salida en ${precio(e.precio_salida)}, ${conSigno(e.r, 2, 'R')}`, lado: null });
  }
  const todos = [...eventos, ...propios].sort((a, b) => b.t - a.t);
  if (!todos.length) return <Vacio titulo="Sin eventos en la ventana visible" texto="Las señales de E022, los avisos de reapertura y las órdenes simuladas aparecen acá a medida que pasan." />;
  const tonoTipo: Record<Evento['tipo'], Tono> = { senal: 'identidad', sesion: 'neutro', aviso: 'aviso', orden: 'activo' };
  const nombreTipo: Record<Evento['tipo'], string> = { senal: 'Señal', sesion: 'Sesión', aviso: 'Aviso', orden: 'Orden' };
  return (
    <ol className="lista linea-tiempo" aria-label="Eventos, del más reciente al más antiguo">
      {todos.map((e, i) => (
        <li key={`${e.t}-${i}`}>
          <time className="num tenue">{fechaHora(e.t, zona)}</time>
          <div>
            <div className="fila">
              <Insignia tono={tonoTipo[e.tipo]}>{nombreTipo[e.tipo]}</Insignia>
              <strong className="linea-tiempo__titulo">
                {e.lado === 'compra' ? '▲ ' : e.lado === 'venta' ? '▼ ' : ''}
                {e.titulo}
              </strong>
            </div>
            <p className="secundario">{e.detalle}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
