/** Pantalla de acceso: ingresar o crear una cuenta con correo, o continuar con Google. */
import { useEffect, useRef, useState } from 'react';
import { api, explicarError } from '../api/cliente';
import { useSesion } from '../app/sesion';
import { Icono } from '../components/iconos';
import { Boton } from '../components/ui';

interface GoogleId {
  accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } };
}

function BotonGoogle({ clientId, onError }: { clientId: string; onError: (t: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const { fijarUsuario } = useSesion();
  useEffect(() => {
    const dibujar = () => {
      const g = (window as unknown as { google?: GoogleId }).google;
      if (!g || !caja.current) return;
      g.accounts.id.initialize({
        client_id: clientId,
        callback: async (r: { credential: string }) => {
          try {
            fijarUsuario(await api.google(r.credential));
          } catch (e) {
            onError(explicarError(e).detalle);
          }
        },
      });
      g.accounts.id.renderButton(caja.current, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', locale: 'es', width: 320 });
    };
    if ((window as unknown as { google?: GoogleId }).google) return dibujar();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = dibujar;
    s.onerror = () => onError('No se pudo cargar el ingreso con Google. Revisá tu conexión o usá tu correo.');
    document.head.appendChild(s);
  }, [clientId, fijarUsuario, onError]);
  return <div ref={caja} className="acceso__google" />;
}

export default function Acceso() {
  const { config, fijarUsuario } = useSesion();
  const [modo, setModo] = useState<'ingresar' | 'registrar'>('ingresar');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const min = config?.min_contrasena ?? 10;
  const enviar = async () => {
    setError(null);
    if (modo === 'registrar' && contrasena.length < min) return setError(`La contraseña necesita al menos ${min} caracteres.`);
    setEnviando(true);
    try {
      fijarUsuario(modo === 'ingresar' ? await api.ingresar({ email, contrasena }) : await api.registrar({ email, nombre, contrasena }));
    } catch (e) {
      setError(explicarError(e).detalle);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <main className="acceso">
      <section className="acceso__tarjeta" aria-labelledby="acceso-titulo">
        <div className="acceso__marca">
          <svg width="44" height="44" viewBox="0 0 30 30" aria-hidden="true">
            <circle cx="15" cy="15" r="13.5" fill="var(--surface-2)" stroke="var(--gold)" strokeWidth="1.5" />
            <path d="M9 19.5V10.5l7 9V10.5" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.5 8.5v13" stroke="var(--gold-claro)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2.2" />
          </svg>
          <span>NEXUS</span>
        </div>
        <h1 id="acceso-titulo">{modo === 'ingresar' ? 'Ingresá a tu cuenta' : 'Creá tu cuenta'}</h1>
        <p className="tenue">Gráficos, indicadores, replay sin futuro y un probador de estrategias con validación cuantitativa.</p>
        {config?.google_client_id && (
          <>
            <BotonGoogle clientId={config.google_client_id} onError={setError} />
            <div className="acceso__o" aria-hidden="true">
              <span>o con tu correo</span>
            </div>
          </>
        )}
        <form
          className="acceso__form"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          {modo === 'registrar' && (
            <label>
              Nombre
              <input className="entrada" autoComplete="name" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
          )}
          <label>
            Correo
            <input className="entrada" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Contraseña
            <input
              className="entrada"
              type="password"
              autoComplete={modo === 'ingresar' ? 'current-password' : 'new-password'}
              required
              minLength={modo === 'registrar' ? min : undefined}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
            {modo === 'registrar' && <span className="campo__ayuda">Al menos {min} caracteres.</span>}
          </label>
          {error && (
            <p className="campo__error" role="alert">
              <Icono nombre="alerta" tam={14} /> {error}
            </p>
          )}
          <Boton type="submit" variante="primario" cargando={enviando}>
            {modo === 'ingresar' ? 'Ingresar' : 'Crear cuenta'}
          </Boton>
        </form>
        <p className="acceso__cambiar">
          {modo === 'ingresar' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
          <button
            type="button"
            className="enlace"
            onClick={() => {
              setModo(modo === 'ingresar' ? 'registrar' : 'ingresar');
              setError(null);
            }}
          >
            {modo === 'ingresar' ? 'Creá una' : 'Ingresá'}
          </button>
        </p>
        <p className="campo__ayuda acceso__legal">
          NEXUS es una herramienta de análisis e investigación. No ejecuta órdenes reales ni da consejos de inversión: los resultados históricos no garantizan
          resultados futuros.
        </p>
      </section>
    </main>
  );
}
