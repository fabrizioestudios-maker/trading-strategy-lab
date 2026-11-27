# Criterios v2 (fijados el 27/11/2026, antes de correr E026–E027)

`docs/criterios.md` queda igual: es el criterio histórico de E000–E025. Desde E026, los experimentos nuevos usan esta política, implementada en `lab/politica.py`. Los umbrales viven solo ahí y ningún script los repite.

## Misión A: el objetivo original (sin cambios)
Win rate ≥ 50 % y payoff real ≥ 2 después de costos, con expectancy > 0, al menos 100 operaciones y al menos 30 en validación. Sigue siendo la referencia de la línea de Trading Institucional (RR 1:2).

## Categorías para cualquier perfil de acierto
Con RR 1:2, ganar 40 % ya da +0,20 R antes de costos. Las categorías miden ventaja, no win rate.

| Categoría | Condiciones (todas) |
| --- | --- |
| **A · ventaja robusta** | Ver la lista de abajo. |
| **B · candidata** | Expectancy > 0, al menos 50 operaciones, le gana al azar con p < 0,10 y no pierde en la confirmación. |
| **C · sin evidencia suficiente** | El resto. No quiere decir que sea imposible: falta evidencia. |

**Condiciones de la categoría A:**
- expectancy ≥ +0,15 R;
- límite inferior del IC 95 % (bootstrap) > 0;
- PF ≥ 1,3 y al menos 150 operaciones;
- le gana a entradas al azar equivalentes con p < 0,05;
- Deflated Sharpe ≥ 0,95, con el N efectivo de la búsqueda que la eligió;
- confirmación / elección ≥ 0,5;
- positiva con costos × 1,5;
- al menos 70 % de años positivos;
- **un período nunca usado o una prueba a futuro con al menos 30 operaciones y expectancy > 0.**

## Reglas de proceso
1. **El orden de las candidatas se arma solo con la muestra de elección.** La confirmación decide si pasa o no; nunca ordena. Así se corrige lo que encontró E026.
2. **Cada búsqueda informa su tamaño en `registro/presupuesto_pruebas.csv`** y su probabilidad de sobreajuste (PBO por CSCV) por familia.
3. **Toda candidata se compara con entradas al azar equivalentes** (mismo SL/TP, lado, frecuencia y costos) y con comprar o vender siempre.
4. **Un período usado para elegir, aunque sea una vez, deja de ser holdout.** Se anota en la bitácora.
5. **Las estrategias de varios días incluyen escenarios de swap** (`lab/financiacion.py`).
