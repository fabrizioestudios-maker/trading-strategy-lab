/**
 * Clave de una respuesta grabada para la versión publicada sin servidor.
 * Misma función en scripts/grabar-instantanea.mjs (la prueba de clave.test.ts fija los valores).
 */
export function cyrb53(s: string, semilla = 0): string {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Método, ruta con consulta (tal como la arma el cliente) y cuerpo JSON. */
export function claveRespuesta(metodo: string, ruta: string, cuerpo?: string | null): string {
  return cyrb53(`${metodo.toUpperCase()} ${ruta}\n${cuerpo ?? ''}`);
}
