/**
 * Biblioteca de indicadores como en una plataforma de gráficos: buscador con categorías, ventana de ajustes generada
 * desde los parámetros de cada indicador, y leyenda con mostrar/ocultar, ajustes y quitar.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/cliente';
import type { DefinicionIndicador, ResultadoIndicador } from '../api/contrato.gen';
import { useRecurso } from '../api/recurso';
import { MAX_INDICADORES, type InstanciaIndicador, type ValorParametro } from '../lib/indicadores';
import { numero } from '../lib/formato';
import { Icono } from './iconos';
import { ultimo } from './PanelIndicador';
import { Boton, BotonIcono, Dialogo, ErrorEstado, Cargando } from './ui';

let cache: DefinicionIndicador[] | null = null;

export function useCatalogo() {
  const r = useRecurso((s) => (cache ? Promise.resolve(cache) : api.catalogoIndicadores(s).then((x) => (cache = x))), []);
  const porId = useMemo(() => new Map((r.datos ?? []).map((d) => [d.id, d])), [r.datos]);
  return { ...r, porId };
}

const ORDEN = ['Medias móviles', 'Tendencia', 'Volatilidad', 'Osciladores', 'Smart Money (LuxAlgo)'];

export function BibliotecaIndicadores({
  abierto,
  onCerrar,
  activos,
  onAgregar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  activos: InstanciaIndicador[];
  onAgregar: (id: string) => void;
}) {
  const cat = useCatalogo();
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  useEffect(() => {
    if (abierto) setQ('');
  }, [abierto]);
  const categorias = useMemo(() => {
    const c = Array.from(new Set((cat.datos ?? []).map((d) => d.categoria)));
    return c.sort((a, b) => (ORDEN.indexOf(a) + 99) % 99 - ((ORDEN.indexOf(b) + 99) % 99));
  }, [cat.datos]);
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const lista = (cat.datos ?? []).filter(
    (d) => (!categoria || d.categoria === categoria) && (!q || norm(`${d.nombre} ${d.corto} ${d.categoria} ${d.autor} ${d.descripcion}`).includes(norm(q))),
  );
  const lleno = activos.length >= MAX_INDICADORES;
  return (
    <Dialogo abierto={abierto} titulo="Indicadores" onCerrar={onCerrar} ancho={720} clase="biblioteca">
      <div className="biblioteca__buscar">
        <Icono nombre="buscar" tam={16} />
        <input className="entrada" data-autofoco placeholder="Buscar (RSI, Bollinger, Smart Money…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar indicador" />
      </div>
      <div className="biblioteca__cuerpo">
        <nav className="biblioteca__categorias" aria-label="Categorías">
          <button type="button" className={!categoria ? 'es-activo' : ''} onClick={() => setCategoria(null)}>
            Todos
          </button>
          {categorias.map((c) => (
            <button key={c} type="button" className={categoria === c ? 'es-activo' : ''} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </nav>
        <div className="biblioteca__lista" role="list">
          {cat.error ? <ErrorEstado error={cat.error} reintentar={cat.recargar} compacto /> : null}
          {!cat.datos && !cat.error && <Cargando />}
          {cat.datos && !lista.length && <p className="tenue">Ningún indicador coincide con «{q}».</p>}
          {lista.map((d) => {
            const n = activos.filter((x) => x.id === d.id).length;
            return (
              <button key={d.id} type="button" role="listitem" className="biblioteca__item" onClick={() => !lleno && onAgregar(d.id)} disabled={lleno}>
                <span className="biblioteca__nombre">
                  <strong>{d.nombre}</strong>
                  <span className="tenue">
                    {d.autor}
                    {d.licencia ? ' · uso no comercial' : ''}
                    {n ? ` · ${n} en el gráfico` : ''}
                  </span>
                </span>
                <span className="biblioteca__desc">{d.descripcion}</span>
                <span className="biblioteca__mas" aria-hidden="true">
                  <Icono nombre="mas" tam={14} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {lleno && <p className="campo__ayuda">Máximo {MAX_INDICADORES} indicadores por gráfico: quitá uno para agregar otro.</p>}
    </Dialogo>
  );
}

export function AjustesIndicador({
  instancia,
  definicion,
  onCerrar,
  onGuardar,
}: {
  instancia: InstanciaIndicador | null;
  definicion: DefinicionIndicador | undefined;
  onCerrar: () => void;
  onGuardar: (p: Record<string, ValorParametro>) => void;
}) {
  const [valores, setValores] = useState<Record<string, ValorParametro>>({});
  useEffect(() => {
    if (instancia && definicion) setValores(Object.fromEntries(definicion.parametros.map((p) => [p.id, instancia.parametros[p.id] ?? p.defecto])));
  }, [instancia, definicion]);
  if (!instancia || !definicion) return null;
  const grupos = new Map<string, typeof definicion.parametros>();
  for (const p of definicion.parametros) {
    const g = p.grupo ?? 'Entradas';
    grupos.set(g, [...(grupos.get(g) ?? []), p]);
  }
  const errores = definicion.parametros
    .filter((p) => p.tipo === 'entero' || p.tipo === 'decimal')
    .filter((p) => {
      const v = Number(valores[p.id]);
      return !Number.isFinite(v) || (p.minimo !== null && v < p.minimo) || (p.maximo !== null && v > p.maximo) || (p.tipo === 'entero' && !Number.isInteger(v));
    })
    .map((p) => p.id);
  const guardar = () => {
    if (errores.length) return;
    // solo se guardan los que difieren del valor por defecto
    onGuardar(Object.fromEntries(definicion.parametros.filter((p) => valores[p.id] !== p.defecto).map((p) => [p.id, valores[p.id]])));
  };
  return (
    <Dialogo
      abierto
      titulo={definicion.nombre}
      descripcion={definicion.descripcion}
      onCerrar={onCerrar}
      ancho={560}
      pie={
        <>
          <Boton onClick={() => setValores(Object.fromEntries(definicion.parametros.map((p) => [p.id, p.defecto])))}>Valores por defecto</Boton>
          <span className="espaciador" />
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" onClick={guardar} disabled={!!errores.length}>
            Aceptar
          </Boton>
        </>
      }
    >
      <form
        className="ajustes-ind"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        {[...grupos].map(([g, ps]) => (
          <fieldset key={g} className="ajustes-ind__grupo">
            <legend>{g}</legend>
            {ps.map((p) => {
              const id = `ind-${instancia.instancia}-${p.id}`;
              const v = valores[p.id];
              return (
                <div key={p.id} className="ajustes-ind__fila" title={p.ayuda ?? undefined}>
                  {p.tipo === 'booleano' ? (
                    <label className="casilla" htmlFor={id}>
                      <input id={id} type="checkbox" checked={!!v} onChange={(e) => setValores({ ...valores, [p.id]: e.target.checked })} />
                      {p.nombre}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={id}>{p.nombre}</label>
                      {p.tipo === 'opcion' ? (
                        <select id={id} className="selector selector--chico" value={String(v)} onChange={(e) => setValores({ ...valores, [p.id]: e.target.value })}>
                          {(p.opciones ?? []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={id}
                          className="entrada entrada--chica num"
                          type="number"
                          inputMode="decimal"
                          step={p.paso ?? (p.tipo === 'entero' ? 1 : 0.1)}
                          min={p.minimo ?? undefined}
                          max={p.maximo ?? undefined}
                          value={String(v ?? '')}
                          aria-invalid={errores.includes(p.id)}
                          onChange={(e) => setValores({ ...valores, [p.id]: e.target.value === '' ? '' : Number(e.target.value) })}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
        {definicion.licencia && (
          <p className="nota nota--aviso ajustes-ind__licencia">
            <Icono nombre="info" />
            <span>
              {definicion.autor}: {definicion.licencia}. Port del indicador gratuito{' '}
              {definicion.fuente && (
                <a href={definicion.fuente} target="_blank" rel="noreferrer">
                  (original)
                </a>
              )}
              .
            </span>
          </p>
        )}
      </form>
    </Dialogo>
  );
}

/** Fila de leyenda de un indicador: nombre, últimos valores y botones (como en una plataforma de gráficos). */
export function LeyendaIndicador({
  instancia,
  resultado,
  nombre,
  onVisible,
  onAjustes,
  onQuitar,
}: {
  instancia: InstanciaIndicador;
  resultado: ResultadoIndicador | undefined;
  nombre: string;
  onVisible: () => void;
  onAjustes: () => void;
  onQuitar: () => void;
}) {
  return (
    <div className={`leyenda-ind${instancia.visible ? '' : ' es-oculto'}`}>
      <span className="leyenda-ind__nombre">{resultado?.nombre ?? nombre}</span>
      {instancia.visible &&
        resultado?.lineas.slice(0, 4).map((l) => (
          <b key={l.nombre} className="num" style={{ color: l.color }}>
            {numero(ultimo(l.valores), 2)}
          </b>
        ))}
      <span className="leyenda-ind__botones">
        <BotonIcono etiqueta={instancia.visible ? `Ocultar ${nombre}` : `Mostrar ${nombre}`} icono={instancia.visible ? 'ojo' : 'ojoNo'} tam={14} onClick={onVisible} />
        <BotonIcono etiqueta={`Ajustes de ${nombre}`} icono="ajustes" tam={14} onClick={onAjustes} />
        <BotonIcono etiqueta={`Quitar ${nombre}`} icono="cruz" tam={14} onClick={onQuitar} />
      </span>
    </div>
  );
}
