/**
 * Curva de capital en R para graficar. Es la misma definición que lab/ficha.py (curva_dd): arranca en 0, acumula los R
 * en el orden de las operaciones y el drawdown es pico − curva (≥ 0). Las métricas oficiales vienen de la API; esto
 * solo arma los puntos del gráfico y se verifica contra el `max_dd` de la corrida.
 */
export interface PuntoCurva {
  t: number;
  acumulado: number;
  caida: number;
}

export function curvaDeCapital(ops: { entrada_ms: number; salida_ms: number; r: number }[]): { puntos: PuntoCurva[]; maxCaida: number; total: number } {
  const orden = [...ops].sort((a, b) => a.entrada_ms - b.entrada_ms);
  let acumulado = 0;
  let pico = 0;
  let maxCaida = 0;
  const puntos: PuntoCurva[] = [];
  let ultimoT = -Infinity;
  for (const o of orden) {
    acumulado += o.r;
    pico = Math.max(pico, acumulado);
    const caida = pico - acumulado;
    maxCaida = Math.max(maxCaida, caida);
    // el gráfico necesita tiempos estrictamente crecientes (una operación a la vez: no hay salidas simultáneas)
    const t = Math.max(o.salida_ms, ultimoT + 1000);
    ultimoT = t;
    puntos.push({ t, acumulado, caida });
  }
  return { puntos, maxCaida, total: acumulado };
}
