# NEXUS — Progress log

## 2026-11-27 — Published static version, consistency pass, new layers and replay range

### Completed
- **Published version without a server.** Hugging Face no longer runs Docker Spaces on the free tier (402, PRO
  required) and the full API needs about 2,2 GB of RAM. The free alternative is a private static Space
  (`FabrizioDalleva/nexus`): the UI is built with `VITE_ESTATICO=1` and reads recorded API responses
  (`instantanea/<key>.json`, key from `src/api/clave.ts`). `scripts/grabar-instantanea.mjs` walks every module and
  200 replay candles of XAUUSD 15m against the real API. Anything not recorded says «Disponible en la versión
  completa»; orders and runs are disabled; the market-hours chip is hidden (it would be frozen).
- **Consistency pass** (desktop and phone screenshots of the 8 modules): E022 figures labelled by definition
  (+0,30 R with the 18:15 entry and base costs, the run Resumen/Analítica show; +0,41 R is the original reopening
  entry); reference costs in Spanish number format; phone banner and limit label fixed.
- **New layers:** iFVG (FVG crossed by a close), BPR (overlap of opposite FVGs within 20 candles), premium/discount
  and OTE 62–79 % on the current leg. Contract `ZonaIFVG`, `ZonaBPR`, `RangoOperativo`; prefix-invariance test covers them.
- **Replay range:** «Desde/Hasta» in the date popover; playback stops on the last candle before the end.
- Tests: pytest (NEXUS files) **50 passed**; Vitest **33 passed**; Playwright **11 passed**.

### Not done / limits
- The published version cannot place orders, change replay dates, timeframes or instruments, or run strategies.
- F001/F002 forward tests start on 27/11/2026 22:00 UTC; the monthly task updates them.

## 2026-11-27 — Phases 0–5: working terminal on the research engine

Branch: `nexus/rebuild-ux-foundation`. `main` untouched.

### Decisions (with evidence)
- **Stack.** Modular monolith: FastAPI API (`nexus_api/`) over the existing Python/Numba lab, React 18 + TypeScript + Vite UI
  (`nexus_web/`) served by the same process. No database, queue or cloud service: jobs persist as JSON with provenance
  (see `NEXUS/IMPLEMENTATION_AUDIT.md` for the audit behind this choice).
- **One contract.** Pydantic models (`nexus_api/contratos.py`, contract `nexus.v1`) → OpenAPI snapshot
  (`nexus_api/openapi.v1.json`) → generated TypeScript (`nexus_web/src/api/contrato.gen.ts`). Tests fail if either drifts.
- **No look-ahead by construction.** The replay boundary is the open of the last revealed minute. Candle completeness and the
  last closed daily candle are decided by the calendar, never by data availability (a leak found and fixed by prefix tests).
  Every layer (candles, sessions, E022 decision, PDH/PDL/PWH/PWL, structure, FVG, simulated orders) is tested to be
  identical when the data is truncated at the boundary.
- **No financial math in the UI.** Sizing, costs, order resolution (lab/motor, SL first), metrics and layers come from the API.
  The UI only formats and builds the equity curve for drawing, with the same definition as `lab/ficha.py` (unit-tested).
- **Honesty in the interface.** Historical data is labeled historical; synthetic mode (`--sintetico`) shows a permanent
  warning; candidate figures are not painted green; unimplemented capabilities say "Planificado"/"No implementado" with
  the reason; simulated orders carry a simulation banner.

### Implemented / partial / planned
| Area | Status | Notes |
|---|---|---|
| Shell, 8 modules, command palette, shortcuts, help | Implemented | Ctrl/⌘ K, `G` + letter, `?`, `[`; module commands register while open |
| Workspaces | Implemented | Browser storage (no secrets), save/load/export/import, undo on destructive changes |
| Overview | Implemented | Last historical minute with UTC/NY time and source, D1 chart, candidate, forward tests, registry counts, recent runs/replays |
| Market Replay | Implemented | Play/pause, ±1, ±N, +1 minute, speed, jump (NY time), timeframe, reset, share link, boundary + unrevealed zone, session strip, decision panel, events, levels, simulated market orders, resizable/collapsible panel |
| Replay range selection | Partial | Zoom/pan on the chart and candles per frame (Settings); no explicit date-range selector |
| Strategy Lab | Implemented for E022 | Locked periods, confirmed runs, real stages, cancel/retry, provenance; hypotheses (passes and failures), test budget, forward tests. Other strategies are registry-only (not executable) |
| Toolkit | Partial | Sessions, PDH/PDL/PWH/PWL, structure (pivots, BOS, CHOCH) and FVG as descriptive layers with evidence notes. iFVG/BPR, sweeps, order blocks, premium/discount/OTE planned |
| Execution Engine | Partial | Risk sizing and costs via API, cost profiles and assumptions; market and **limit** orders in the replay (limit: `lab/smc.simular_ordenes`, fills on touch, cancels if the target trades first, expires after N market minutes). Stop orders planned; broker routing not implemented by design |
| Performance Analytics | Implemented | Metrics with definitions, n, period and cost profile; equity, drawdown; by year/side/session/month; cost sensitivity; trades; run comparison; **robustness** in every run: annual out-of-sample folds of the fixed rule, appraisal IR vs passive gold benchmarks (`lab/benchmarks.py`), block-bootstrap Monte Carlo risk table (`lab/montecarlo.py`) |
| Data Center | Implemented (core) | Inventory, coverage, SHA-256 provenance, quality checks, minutes per year, serving strategy. Import jobs planned (CLI today) |
| Settings | Implemented | Workspaces, chart/time zone, risk defaults, sessions (read-only), appearance and accessibility, shortcuts, integrations policy |
| Hardening | Implemented (local scope) | Keyboard, focus, labels, reduced motion, contrast and text size, phone layout, error/empty/loading states, CI workflow |
| Deployment | Not done | Needs authorization; the API has no authentication and must stay on 127.0.0.1 |

### Test evidence (this environment)
- `python -m pytest -q tests` → **64 passed** (27 original lab tests + 37 NEXUS: replay/no-future, layers, strategies, API, contracts, jobs).
- `cd nexus_web && npm test` → **28 passed** (Vitest).
- `cd nexus_web && npm run e2e` → **8 passed** (Playwright against the synthetic API: navigation, palette and keys,
  replay no-future and reproducibility, simulated order states, lab run to analytics, accessibility, phone).
- Real data check: E022 run from the UI (entry 18:15, base costs) → +0.30 R per trade, 95 % CI [+0.07, +0.53], n = 168,
  max drawdown 9.11 R; the UI curve's drawdown matches the API's `max_dd`.

### Next steps
1. iFVG/BPR and premium/discount/OTE as layers, defined without look-ahead and tested like the current ones.
2. Stop orders in the replay once a fill model is validated.
3. Explicit date-range selection in the replay.
4. Deployment plan (container + mounted `data/`, authentication) — only with explicit authorization.

### Update — Overview like the "Institutional Trading Lab" reference, new layers, polish
- Overview rebuilt after Fabrizio's reference: market cards per instrument (descriptive SMA 200 trend bias from
  `lab/senales.tendencia`, position in the 52-week range as a meter, factual sentence, last historical price and change,
  60-day sparkline, "open in replay"), a ticker strip of every instrument with data, the gold market status by schedule
  (open/closed and countdown; holidays not considered, said in the UI), a lab column (candidate, last run, forward tests,
  hypothesis counts) and an activity feed. Every card states the date its data ends; nothing is presented as live.
  The reference's confidence %, AI narratives and news feed were not copied: there is no data behind them.
- New descriptive layers: liquidity sweeps and order blocks (closed candles only, prefix-invariance tested); RSI and MACD
  listed in the Toolkit.
- Fixes found by the visual review: bars overflowing their chart when all values had the same sign (zero line was on
  the wrong side) — fixed and covered by a unit test and an E2E overflow check on every screen; status badges that looked
  alike in the gold theme; month heatmap and benchmark table styling; limit-order states listed in Execution.
- Tests: pytest **76 passed**; Vitest **31 passed**; Playwright **11 passed** (new: no chart bar leaves its box and no
  console errors on any screen; Overview shows real market cards and the market schedule). The focus check was made
  deterministic (it now waits for the app's own focus move) and passed 54 consecutive runs.

### Update — visual direction from Fabrizio's reference (gold terminal)
- Fabrizio supplied a reference screenshot of the desired look. The user's direction overrides the brief's palette: gold/amber
  is now the accent (cyan removed), candles gold (up) / red-orange (down), validated for colour-blind separation (deutan ΔE 19.6).
- Shell: left icon rail with labels (no top bar); the market header (instrument, last revealed price, change vs previous daily
  close, session high/low/open/range, replay boundary) sits on each screen.
- Replay screen rebuilt as the reference terminal: header, timeframe tabs, indicators menu, replay transport; candles with
  **RSI(14)** and **MACD(12,26,9)** panes synchronised to the main chart (computed by the API with `lab/senales.py` on revealed
  candles only, 300-candle warm-up, prefix-invariance tested); right column with **level map** and **trade ticket**
  (market/limit, stop shown as planned); bottom **simulated account** (capital, equity, margin at an assumed 1:50, free margin,
  margin level, result) computed by the API from simulated orders that store their lots.
- Honest adaptations of the reference: there is **no order book** (the data is bid M1 without depth) — the slot shows the
  level map of known prices instead; there is **no volume** in the data, so no volume bars; the account is explicitly simulated.
- Tests: pytest **73 passed**; Vitest **29 passed**; Playwright **9 passed** (updated to the new layout).

### Update — robustness and limit orders
- Every research run now adds a robustness stage (code fingerprint includes `nexus_api/robustez.py` and the lab modules it uses,
  so older runs are not reused). Older stored runs show an honest "rerun to get robustness" state.
- Limit orders in the replay, validated by the API (422 on the wrong side) and tested to be prefix-invariant and identical
  to the lab simulator on full data.
- Tests: pytest **67 passed**; Vitest **29 passed**; Playwright **9 passed**.

## 2026-11-27 — Foundation and repository handoff

### Completed
- Created development branch `nexus/rebuild-ux-foundation` from `main`.
- Read and reviewed the repository README, AI context brief, evolution plan, research plan, acceptance criteria, audit document and research bitácora excerpts.
- Confirmed the repository's documented core is a Python/Numba quantitative research lab, not an existing full-stack trading terminal.
- Added product entry point, UX specification, architecture plan, repository audit and autonomous Claude master brief under `NEXUS/`.
- Added an original editable SVG visual reference for the Overview workspace.
- Preserved `main`; all new files were committed only to the development branch.

### Important evidence carried into product design
- The lab reports 27 automated tests in its README baseline; Claude must run the actual current suite and record the result before changing code.
- The research documentation classifies E022 as a candidate (Level B), not a proven/validated strategy.
- SMC/ICT research findings and negative results must remain visible and must not be rewritten as evidence of predictive edge.
- Historical data is not automatically available to a deployed frontend; a deliberate adapter/serving layer is required.

### Not yet done
- Full tracked-file inventory and source-level module audit.
- Baseline test execution by Claude Code.
- Frontend/backend implementation and actual data integration.
- Production deployment.

### Next action
Open `NEXUS/MASTER_PROMPT.md` in Claude Code with this repository checked out on `nexus/rebuild-ux-foundation`. Claude must follow the mandatory start sequence and then implement the first working UX vertical slice.
