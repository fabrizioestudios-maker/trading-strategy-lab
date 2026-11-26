# trading-strategy-lab

Laboratorio para buscar una estrategia con **win rate ≥ 50 % y RR real ≥ 1:2**, con expectancy positiva y robustez. Si no aparece, el objetivo es documentar con números por qué.

- **Historia completa:** `BITACORA.md`, con entradas fechadas, resultados y decisiones.
- **Reglas que no se cambian:** `docs/criterios.md`.
- **Plan y fundamento teórico:** `docs/plan.md`.
- **Costos por instrumento:** `docs/costos.md`.

## Cómo reproducir

```bash
pip install numpy pandas numba scipy scikit-learn
python -m lab.descarga_histdata EURUSD GBPUSD USDJPY AUDUSD SPXUSD NSXUSD GRXEUR --desde 2016 --hasta 2026 --mes-actual 11
# historia 2010–2015 con --sufijo _2010 y luego lab.datos.unir_historia(<instr>) (ver data/README.md)
python -m pytest -q tests            # motor: casos a mano y teoría del paseo al azar
python experimentos/E001_linea_base.py XAUUSD,EURUSD
...
```

Cada experimento es un script en `experimentos/` que escribe sus resultados en `resultados/<EXXX>/`.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `lab/` | Datos (`datos.py`), descarga (`descarga_histdata.py`), motor numba (`motor.py`), métricas (`metricas.py`), señales (`senales.py`), estrategias operables (`estrategia.py`) |
| `experimentos/` | E000 calidad de datos · E001 línea de base · E002 filtros de tendencia · E003 tendencia operable · E004 retrocesos y reversión · E005 intradía · E006 retrocesos en índices · E007 régimen de volatilidad · E008 cartera de tendencia · E009 validación · E010 aprendizaje automático · E011 elección de candidatas · E012 Sharpe y teoría · E013 curva de la candidata · E014 divergencias y multi-temporalidad |
| `resultados/` | CSV y JSON de cada experimento |
| `tests/` | Pruebas del motor |
| `data/` | No se sube; se regenera con la descarga |

## Universo

XAUUSD y XAGUSD; EURUSD, GBPUSD, USDJPY y AUDUSD; SPX500, NAS100, Nikkei 225, FTSE 100, CAC 40 y ASX 200. El DAX y el WTI se bajaron pero se excluyeron por datos corruptos (E000). Son velas de 1 minuto de 2010 a 2026 (HistData, más Dukascopy para el oro reciente).

- Selección: 2010–2021.
- Validación: 2022–2026.

## Estado (27/11/2026)

**Terminado.** Resumen en `docs/conclusiones.md`:
- **Cumple los criterios mínimos:** una estrategia de tendencia de largo plazo, solo compras, SL de 6 ATR y TP 2,1× en índices, oro y plata. Da 51,0 % en selección y 55,6 % en validación, con payoff 2,06–2,08.
- **No es robusta como ventaja:** rinde lo mismo que comprar siempre con el mismo SL/TP.
- **Con señales técnicas** de corto y mediano plazo no apareció 50 % con 1:2 en unas 1.400 configuraciones. La teoría del movimiento browniano con deriva explica por qué.
