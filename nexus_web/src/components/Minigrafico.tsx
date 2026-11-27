/** Minigráfico de cierres (SVG). Decorativo para la vista: el valor y el cambio están escritos al lado. */
export function Minigrafico({ valores, tono, ancho = 120, alto = 36 }: { valores: (number | null)[]; tono: 'alza' | 'baja' | 'neutro'; ancho?: number; alto?: number }) {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const rango = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * (ancho - 2) + 1, alto - 3 - ((x - min) / rango) * (alto - 6)] as const);
  const linea = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${linea} L${pts[pts.length - 1][0].toFixed(1)},${alto} L${pts[0][0].toFixed(1)},${alto} Z`;
  const color = tono === 'alza' ? 'var(--alza)' : tono === 'baja' ? 'var(--baja)' : 'var(--text-3)';
  const id = `mg-${tono}`;
  return (
    <svg className="minigrafico" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}
