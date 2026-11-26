# Criterios de aceptación (fijados antes de mirar resultados)

Escritos el 26/11/2026 a las 18:35 UTC, antes de correr cualquier backtest. No se cambian para que una estrategia "pase". Si en algún momento hay que cambiarlos, se documenta en la bitácora con el motivo y se vuelve a evaluar todo lo anterior con el criterio nuevo.

## Qué es una operación

- Entrada, stop loss (SL) y take profit (TP) quedan fijos al abrir. Sin mover el stop a break-even, sin cierres parciales y sin trailing en la evaluación principal. Si se prueban, se reportan aparte y no cuentan para cumplir la misión.
- Riesgo = distancia entre la entrada y el SL. RR nominal = distancia al TP / distancia al SL.
- Las señales se calculan con velas cerradas. La entrada es en la apertura de la vela siguiente (o con una orden limit/stop definida en ese momento). Sin mirar el futuro.
- Las salidas se resuelven con velas de 1 minuto. Si el SL y el TP caen dentro del mismo minuto, cuenta el SL (supuesto pesimista).
- Costos en cada operación: spread + deslizamiento por instrumento (tabla en `docs/costos.md`).
- Ganadora = resultado > 0 después de costos.

## Métricas que se miden siempre

Win rate (WR), payoff real (ganancia media / pérdida media), profit factor (PF), expectancy en R, max drawdown en R, cantidad de operaciones, duración media, resultado por año.

## Criterios mínimos de la misión

Una estrategia cumple si, **en la muestra de selección (in-sample) y en la de validación (out-of-sample) por separado**:

1. WR ≥ 50 %.
2. Payoff real ≥ 2,0 (ganancia media / pérdida media, después de costos). Con WR ≥ 50 % esto implica PF ≥ 2.
3. Expectancy > 0 después de costos.
4. Al menos 100 operaciones entre las dos muestras y al menos 30 en la de validación. Con menos, el resultado es "no concluyente".

## Robustez (para declararla robusta, no solo "que pasa")

- Positiva en al menos el 70 % de los años con operaciones.
- Parámetros vecinos (±20 %) mantienen WR ≥ 47 % y PF ≥ 1,7: sin picos aislados.
- Funciona en más de un instrumento de la misma clase, o hay una razón económica clara de por qué solo en uno.
- Walk-forward: positiva en la mayoría de las ventanas.
- Intervalo de confianza: el límite inferior del 95 % (Wilson) del WR de validación tiene que superar el WR de una entrada al azar con el mismo SL/TP y dirección.
- Se lleva la cuenta de cuántas configuraciones se probaron (prueba múltiple): cuanto más se busca, más exigente es la validación.

## Muestras

- Selección (in-sample): todo lo anterior al 1/1/2022.
- Validación (out-of-sample): desde el 1/1/2022 hasta el último dato. Se mira **solo** para las candidatas elegidas con la muestra de selección. Un resultado de validación nunca se usa para elegir parámetros.
