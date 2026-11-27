/** Íconos de trazo (24 × 24, trazo 1,6). Decorativos por defecto: el texto o el aria-label del control da el nombre. */
import type { SVGProps } from 'react';

const P: Record<string, string> = {
  resumen: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  replay: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8M12 7.5V12l3 2',
  laboratorio: 'M9 3h6M10 3v6.2L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.2V3M7.2 15h9.6',
  herramientas: 'M12 3 3 7.5l9 4.5 9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  ejecucion: 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5',
  analitica: 'M4 20h16M7 16v-5M11.5 16V7M16 16v-8',
  datos: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ajustes: 'M5 6h8M17 6h2M15 4v4M5 12h2M11 12h8M9 10v4M5 18h10M19 18h0M17 16v4',
  buscar: 'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM20 20l-4.8-4.8',
  ayuda: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01',
  panelIzq: 'M4 4h16v16H4zM9.5 4v16',
  panelDer: 'M4 4h16v16H4zM14.5 4v16',
  play: 'M8 5.5v13l10.5-6.5L8 5.5z',
  pausa: 'M8 5h3v14H8zM13 5h3v14h-3z',
  pasoAdelante: 'M6 6.5v11l8-5.5-8-5.5zM17 6v12',
  pasoAtras: 'M18 6.5v11l-8-5.5 8-5.5zM7 6v12',
  adelanteN: 'M4 6.5v11l7-5.5-7-5.5zM12 6.5v11l7-5.5-7-5.5zM20.5 6v12',
  atrasN: 'M20 6.5v11l-7-5.5 7-5.5zM12 6.5v11l-7-5.5 7-5.5zM3.5 6v12',
  reiniciar: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  calendario: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  descargar: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M4 20h16',
  subir: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M4 20h16',
  papelera: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13',
  abajo: 'M6 9.5 12 15l6-5.5',
  derecha: 'M9.5 6 15 12l-5.5 6',
  check: 'M5 12.5 10 17.5 19 7',
  cruz: 'M6 6l12 12M18 6 6 18',
  guion: 'M6 12h12',
  alerta: 'M12 4 2.8 19.5h18.4L12 4zM12 10v4.2M12 17h.01',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v5.5M12 7.8h.01',
  candado: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  reloj: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3.2 2',
  enlace: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  mas: 'M12 5v14M5 12h14',
  ojo: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ojoNo: 'M3 3l18 18M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.6 3.3M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sube: 'M12 5 20 18H4L12 5z',
  baja: 'M12 19 4 6h16l-8 13z',
  servidor: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  capas: 'M12 3 3 7.5l9 4.5 9-4.5L12 3zM3 12l9 4.5 9-4.5',
  objetivo: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 12h.01',
  espacio: 'M4 5h7v6H4zM13 5h7v14h-7zM4 13h7v6H4z',
  mas2: 'M5 12h.01M12 12h.01M19 12h.01',
};

export type NombreIcono = keyof typeof P;

export function Icono({ nombre, tam = 16, ...resto }: { nombre: NombreIcono; tam?: number } & SVGProps<SVGSVGElement>) {
  const relleno = nombre === 'play' || nombre === 'sube' || nombre === 'baja';
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill={relleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      <path d={P[nombre]} />
    </svg>
  );
}
