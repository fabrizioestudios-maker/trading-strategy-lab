# NEXUS — Implementation audit (Phase 0)

Date: 27 November 2026. Branch: `nexus/rebuild-ux-foundation` (based on `main` at `bc499a3`).
Method: read every document in `NEXUS/`, the repository README, `CONTEXTO_PARA_IAS.md`, `BITACORA.md` (entries 25–38),
`docs/` (criterios, criterios_v2, costos, fichas, conclusiones, plan_evolucion, auditoria_fase0, datos_gratuitos),
enumerated `git ls-files`, parsed every `lab/*.py` module (docstrings and public functions), inspected `registro/`,
`resultados/`, `herramientas/`, `data/README.md`, `data/MANIFIESTO.csv`, `.gitignore`, and ran the test suite unchanged.

## 1. Actual repository map

`git ls-files` → **320 tracked files**:

| Path | Files | What it is |
| --- | --- | --- |
| `lab/` | 29 | Python package: data, Numba engine, signals, SMC/ICT, execution costs, validation, governance |
| `experimentos/` | 50 | One script per experiment (E000–E045, F001, F002). Scripts, not importable services |
| `resultados/` | 183 | CSV/JSON outputs per experiment; `resultados/tablero/*.json` = dashboard datasets |
| `registro/` | 26 | `experimentos/*.json` (run records with commit + code hashes), `forward/F001.json`, `F002.json`, `presupuesto_pruebas.csv` |
| `docs/` | 9 | Criteria (historical + v2 levels R–E), costs, strategy cards, conclusions, plans, audit A–K |
| `pine/` | 3 | Pine v6 strategies (E022 gold D1, SMC configurable, 5 ICT setups) |
| `tests/` | 3 | `test_motor.py`, `test_fase4.py`, `test_fase4b.py` — 27 tests |
| `herramientas/` | 2 | Dashboard exporter, TradingView comparison tool |
| `data/` | 2 | Only `README.md` and `MANIFIESTO.csv` are tracked; all `*.npz` data is git-ignored |
| `NEXUS/` | 8 | Product/UX/architecture docs, master brief, visual reference |
| root | 5 | `README.md`, `CONTEXTO_PARA_IAS.md`, `BITACORA.md` (1,702 lines), `requirements.txt`, `.gitignore` |

Not present: any frontend code, `package.json`, API server, database, Dockerfile, CI workflow (`.github/` absent),
deployment configuration. Dependencies: `requirements.txt` pins numpy 2.5.3, pandas 3.0.5, numba 0.68.1,
scipy 1.18.1, scikit-learn 1.9.1, matplotlib 3.11.2, pytest 9.1.1.

Local (untracked) data verified in this workspace: `data/XAUUSD.npz` = 5,924,942 one-minute bars, 2010-01-03 23:00 →
2026-11-26 02:59 UTC, five compressed arrays `t,o,h,l,c` (`t` = ms UTC of the minute open), SHA-256 recorded in
`data/MANIFIESTO.csv`. 18 other instruments are present locally (FX, indices) per the manifest.

## 2. Existing UI / backend status

- **In this repository: none.** The lab is batch Python: scripts write CSV/JSON; humans read them.
- **Related assets outside the codebase** (references, not dependencies):
  - the vanilla-JS candle replayer in repository `senales-vip` (`backtest/reproductor`), hosted as claude.ai artifacts and,
    since 27/11/2026, as a static GitHub Pages site built from this repository's `gh-pages` branch. It duplicates
    trading calculations in JavaScript, depends on the artifact runtime for storage, and contains ports of LuxAlgo
    scripts under CC BY-NC-SA 4.0. **Decision: NEXUS does not copy it.** Its lessons (no-lookahead replay, SL-first
    resolution, 17:00 NY reopen artifact) are re-implemented server-side in tested Python.
  - a private "Tablero del laboratorio" artifact fed by `herramientas/exportar_tablero.py` → `resultados/tablero/*.json`.

## 3. Module-by-module reuse assessment

Legend: **Direct** = call as-is from the API layer · **Adapter** = wrap behind a typed service (windowing, caching,
contracts) · **Partial** = useful pieces, needs refactor before product use · **Research-only** = keep in the lab, not
exposed in the product yet.

| Module | Role | Assessment | Notes |
| --- | --- | --- | --- |
| `lab/datos.py` | M1 load, TF aggregation (H4/D1 aligned to 17:00 NY), Wilder ATR, cost table | **Adapter** | `cargar()` loads full compressed arrays (~237 MB for XAUUSD). Product needs a windowed, cached, read-only candle service and a boundary-aware partial-candle builder |
| `lab/motor.py` | Numba engine, SL/TP on M1, **SL-first** in the same minute, one trade at a time | **Direct** | The single source of truth for fills in research runs |
| `lab/ejecucion.py` | Cost profiles sin_costos/optimista/base/conservador/estrés, session × volatility spread, slippage, latency, swaps | **Direct** | Expose profiles as named assumptions; never re-implement in the UI |
| `lab/financiacion.py` | Overnight swap applied after simulation | **Direct** (via `ejecucion`) | |
| `lab/metricas.py` | Summary metrics, Wilson CI, by-year | **Direct** | |
| `lab/ficha.py` | Full trade-list card: sessions, streaks, drawdown curve, breakdowns | **Direct** | Basis for Performance Analytics |
| `lab/validacion.py` | Sharpe, PSR, DSR, PBO-CSCV, bootstrap CI | **Direct** | |
| `lab/multiples.py` | Bonferroni/Holm/BH/BY, Hansen SPA, one-sided t p-value | **Direct** | Multiple-testing warnings in Strategy Lab |
| `lab/walkforward.py` | Purged walk-forward for many configs | **Research-only** (later Adapter) | Heavy; job-only |
| `lab/objetivos.py` | GT-score, plateau/cliff selection | **Research-only** | |
| `lab/politica.py` | Centralised acceptance policy, `nivel()` R/A/B/C/D/E | **Direct** | Levels must come from here or from the documented cards, never from the UI |
| `lab/registro.py` | Run record JSON with commit + code SHA-256 + data manifest hash | **Direct** | Reused for product research runs |
| `lab/senales.py` | Direction filters on closed candles (SMA, EMA, RSI, Donchian…) | **Direct** | |
| `lab/grilla.py` | Exhaustive-search families (E019) | **Research-only** | |
| `lab/smc.py` | Pivots, structure state, SMC setup detection, NY killzones | **Partial** | Batch detectors; pivots confirm L bars later — must be lagged to be replay-safe |
| `lab/ict.py` | 5 ICT setups (FVG, sweeps, breaker…) and simulator | **Partial** | Same lookahead caveat; descriptive overlays only until a replay-safe incremental version is tested |
| `lab/eventos.py` | Event studies with placebo; `minuto_ny`; time-exit simulator | **Direct** (helpers) | `minuto_ny` duplicated in `smc.py` — product uses one helper |
| `lab/regimen.py` | Causal (filtered) Gaussian HMM | **Research-only** | |
| `lab/flujo.py`, `lab/cot.py`, `lab/externos.py` | COT/FRED/Yahoo with real publication timestamps | **Adapter** (Data Center, later) | Free sources are rate-limited (Yahoo 429 observed) |
| `lab/benchmarks.py`, `lab/cartera.py`, `lab/montecarlo.py` | Passive benchmarks, appraisal IR, portfolio, Monte Carlo risk | **Direct** (Analytics, later phases) | |
| `lab/estrategia.py`, `lab/diario.py`, `lab/descarga_*.py` | Generic strategy wrapper, daily series, downloaders | **Partial** | Downloaders are CLI tools; Data Center shows their outputs, does not trigger them yet |
| `experimentos/E022…, E042, E044, F002` | Gold D1 Bollinger + SMA 200 (the only Level B candidate), 18:15 NY entry, time exits | **Adapter** | Rule duplicated across scripts → NEXUS defines it once in a domain module, verified trade-by-trade against `F002` |

## 4. Test baseline (unchanged code)

```
$ python3 -m pytest -q tests
...........................                                              [100%]
27 passed in 22.93s
```

Environment: Python 3.13.18, numpy 2.5.3, pandas 3.0.5, numba 0.68.1, scipy 1.18.1, scikit-learn 1.9.1.
There are no JavaScript tests, no CI and no lint configuration in the repository.

## 5. Known defects and risks

1. **Data is not deployable as-is.** `data/` is git-ignored; a deployed NEXUS must import or mount data. The product
   must state data availability honestly and never fall back to invented prices.
2. **Memory/latency.** Full-history arrays are ~47 MB per field for XAUUSD; sending multi-year M1 to a browser is not
   acceptable. Candles must be served in windows, aggregated server-side, with the forming candle built only from
   minutes at or before the replay boundary.
3. **Bid-only prices.** Spread is modelled as a cost (`docs/costos.md`); the 17:00–18:00 NY reopen produces a depressed
   bid (E041). Replay must label this window; strategies follow the 18:15 NY entry lesson (E042).
4. **Lookahead hazards in reusable detectors.** Pivot/structure/FVG detectors in `smc.py`/`ict.py` are batch functions;
   using them on a full array and then slicing would leak. Product overlays must be computed on data truncated at the
   boundary (tested by prefix-invariance).
5. **Rule duplication.** E022 logic exists in several experiment scripts; any product definition must be verified
   against the sealed forward-test script (`F002`).
6. **Governance coupling.** Status labels (Level B, R, A) are documented in `docs/fichas.md`, `BITACORA.md` and
   `lab/politica.py`; the product must cite the source and date rather than recompute or embellish them.
7. **No CI.** Regressions are only caught by running tests manually.
8. **Licensing.** Lightweight Charts is Apache-2.0 (attribution logo kept). LuxAlgo-derived code (CC BY-NC-SA) lives in
   another repository and is not used here.

## 6. Proposed stack (decided after the evidence above)

| Layer | Choice | Why |
| --- | --- | --- |
| Domain / research | Existing `lab/` (Python + Numba) | Already tested; no duplication of financial logic |
| API / application | **FastAPI 0.165** + Pydantic 2 + Uvicorn (`nexus_api/`), modular monolith | Same language as the engine; typed, versioned contracts (`nexus.v1`) with generated OpenAPI; only one new dependency beyond what the environment already has |
| Jobs | In-process executor with persisted state (`submitted → queued → running → succeeded/failed/cancelled`), JSON under `registro/nexus/` | Real states without introducing queues/databases before there is a need |
| Persistence | JSON files (runs, saved replays) in `registro/nexus/`; UI preferences in `localStorage` (no secrets) | Simple, reviewable, reproducible |
| Frontend | **React 18 + TypeScript + Vite** (`nexus_web/`), Lightweight Charts 4.2.3 | Typed UI for a multi-module terminal with command palette, keyboard model and panels; static build served by the API |
| Tests | pytest (contracts, replay no-lookahead, jobs, risk), Vitest (UI logic), Playwright (navigation, keyboard, responsive) | Testing pyramid from `ARCHITECTURE.md` |

Rejected: Streamlit/Dash (insufficient control over keyboard, layout and accessibility for a terminal); extending the
JS replayer (other repo, artifact runtime coupling, duplicated calculations, non-commercial licence fragments); a Node
backend (would duplicate Python domain calculations).

Naming: `nexus_api/` and `nexus_web/` avoid a case-insensitive filesystem collision with `NEXUS/` (macOS/Windows).

## 7. Capability matrix (at the start of implementation)

| Capability | Status in repo | Product plan |
| --- | --- | --- |
| Instrument catalogue + coverage | Partial (`MANIFIESTO.csv`) | Data Center + API `GET /instruments`, `/data/coverage` |
| Data quality checks (gaps, duplicates, OHLC validity) | Partial (E000 script) | Data Center quality report computed by the API |
| Candle aggregation (H4/D1 at 17:00 NY) | Implemented (`datos.velas`) | Adapter with boundary-aware partial candle |
| Deterministic historical replay | Absent in this repo | **Phase 2**: server-side boundary, step/jump, no-lookahead tests |
| Session/killzone context | Implemented (helpers) | Replay markers + clock |
| Strategy definition E022 (+18:15 entry, time exits) | Implemented in scripts | Domain module verified vs `F002` |
| Strategy decision panel per candle | Absent | Conditions computed from closed daily candles only |
| Research runs with registry/hash | Implemented (`registro.py`) | **Phase 3** job API + run history |
| Cost profiles | Implemented (`ejecucion.py`) | Exposed as named assumptions |
| Risk sizing (account currency + R) | Absent as a reusable function | **Phase 4** domain function + tests |
| Simulated order/position state machine | Partial (engine is batch) | Phase 4 (replay orders) — planned |
| Performance analytics (ficha, CI, by year/session) | Implemented | Analytics from run outputs |
| Walk-forward / robustness | Implemented (research) | Shown from existing results; new WF runs later |
| Multiple-testing context | Implemented (`multiples.py`, `presupuesto_pruebas.csv`) | Strategy Lab warnings |
| Institutional toolkit overlays | Partial (batch detectors) | Descriptive overlays; labelled "no predictive evidence" per E035/E038 |
| Live data / broker routing | Absent | Not built; clearly labelled |
| Auth / multi-user | Absent | Planned; local single-user first |

## 8. Integrity facts the product must display (from the latest bitácora and registry)

- E022 gold D1 is **Level B (candidate)**, not validated: 168 trades 2011–2026, +0.41 R, CI [+0.18, +0.64]; entry at
  18:15 NY recommended (E042). Forward tests F001 and F002 are sealed (27/11/2026) with no trades yet.
- No price rule among 297,354 survives multiple-testing corrections (E031, SPA p = 0.21).
- SMC/ICT on clean 2010–2021 gold history ≈ chance (E038); sweeps do not predict reversals (E035b).
- Intraday program E039–E045 failed; the Asia drift was a bid-reopen artifact (E041).
