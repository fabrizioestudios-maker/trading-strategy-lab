/**
 * Almacenamiento local por navegador (preferencias, espacios guardados, órdenes simuladas del replay).
 * Puede no estar disponible (modo privado, datos bloqueados): todo acceso se protege y la app funciona sin él.
 * Nunca se guardan secretos acá.
 */
export function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardar(clave: string, valor: unknown): boolean {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function borrar(clave: string): void {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    /* sin almacenamiento: nada que borrar */
  }
}
