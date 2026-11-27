/** Búsqueda difusa para la paleta de comandos: subsecuencia sin tildes, con premio a inicios de palabra y letras seguidas. */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function puntuar(consulta: string, texto: string): number {
  const q = normalizar(consulta).replace(/\s+/g, ' ').trim();
  if (!q) return 0;
  const t = normalizar(texto);
  const directo = t.indexOf(q);
  if (directo >= 0) return 1000 - directo * 2 - (t.length - q.length) * 0.1 + (directo === 0 || t[directo - 1] === ' ' ? 200 : 0);
  let puntos = 0;
  let i = 0;
  let previo = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const j = t.indexOf(ch, i);
    if (j < 0) return -1;
    puntos += 10;
    if (j === previo + 1) puntos += 8;
    if (j === 0 || t[j - 1] === ' ' || t[j - 1] === '/' || t[j - 1] === '-') puntos += 12;
    puntos -= Math.min(j - i, 10);
    previo = j;
    i = j + 1;
  }
  return puntos;
}

export function filtrar<T>(items: T[], consulta: string, texto: (x: T) => string): T[] {
  if (!consulta.trim()) return items;
  return items
    .map((x, i) => ({ x, i, p: puntuar(consulta, texto(x)) }))
    .filter((r) => r.p >= 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((r) => r.x);
}
