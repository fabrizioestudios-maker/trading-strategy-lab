import { useComandos } from '../app/comandos';
import { Dialogo, Tecla } from './ui';

/** Lista de atajos de teclado disponibles ahora (globales y del módulo abierto). */
export function AyudaAtajos() {
  const { comandos, ayudaAbierta, abrirAyuda } = useComandos();
  const conAtajo = comandos.filter((c) => c.atajo);
  const grupos = [...new Set(conAtajo.map((c) => c.grupo))];
  return (
    <Dialogo
      abierto={ayudaAbierta}
      titulo="Atajos de teclado"
      descripcion="Funcionan cuando el foco no está en un campo de texto. La paleta de comandos (Ctrl K o ⌘ K) tiene todas las acciones."
      onCerrar={() => abrirAyuda(false)}
      ancho={640}
    >
      <div className="atajos">
        <section>
          <h3 className="atajos__grupo">Siempre</h3>
          <dl className="definiciones">
            <dt>
              <Tecla>Ctrl</Tecla> <Tecla>K</Tecla>
            </dt>
            <dd>Abrir la paleta de comandos</dd>
            <dt>
              <Tecla>?</Tecla>
            </dt>
            <dd>Ver esta ayuda</dd>
          </dl>
        </section>
        {grupos.map((g) => (
          <section key={g}>
            <h3 className="atajos__grupo">{g}</h3>
            <dl className="definiciones">
              {conAtajo
                .filter((c) => c.grupo === g)
                .map((c) => (
                  <div key={c.id} style={{ display: 'contents' }}>
                    <dt>
                      {c.atajo!.split(' ').map((t, k) =>
                        t === 'luego' ? (
                          <span key={k} className="tenue">
                            {' '}
                            luego{' '}
                          </span>
                        ) : (
                          <Tecla key={k}>{t}</Tecla>
                        ),
                      )}
                    </dt>
                    <dd>{c.titulo}</dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialogo>
  );
}
