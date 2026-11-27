# NEXUS — Architecture & Integration Plan

## 1. Architecture posture

Begin with an evidence-based repository audit. Do not assume a React app, API server, database, or deployment platform exists until verified. The current repository is primarily a Python quantitative research laboratory.

The product UI and research engine are separate concerns. Build a clear boundary between them rather than coupling frontend components directly to research scripts or local filesystem paths.

## 2. Target logical layers

1. **Presentation** — design system, navigation, charts, panels, accessible controls.
2. **Application** — user workflows, workspace state, replay sessions, research-run orchestration.
3. **Domain** — instruments, candles, sessions, signals, orders, positions, risk, metrics and validation concepts.
4. **Research engine** — existing Python/Numba modules and experiment logic.
5. **Data adapters** — historical market data, external macro/COT data, imports and future market feeds.
6. **Persistence** — user preferences, saved workspaces, strategy definitions, replay checkpoints and run metadata.
7. **Observability** — structured logs, run status, error reporting and performance metrics.

These are logical boundaries, not a mandate to introduce microservices. Prefer a modular monolith or a small number of deployable components until measured scale justifies more.

## 3. Repository capabilities to audit and preserve

README identifies the following existing research modules:
- data: `lab/datos.py`, `lab/externos.py`;
- engine: `lab/motor.py`;
- metrics: `lab/metricas.py`, `lab/ficha.py`;
- signals: `lab/senales.py`, `lab/grilla.py`, `lab/smc.py`, `lab/ict.py`;
- validation: `lab/validacion.py`, `lab/multiples.py`, `lab/walkforward.py`, `lab/objetivos.py`;
- execution/risk: `lab/ejecucion.py`, `lab/financiacion.py`, `lab/montecarlo.py`, `lab/cartera.py`, `lab/benchmarks.py`;
- regime/flow/events: `lab/regimen.py`, `lab/flujo.py`, `lab/eventos.py`;
- governance: `lab/politica.py`, `lab/registro.py`.

The repository also contains experiment scripts, CSV/JSON results, Pine strategies, tests and experiment registry. Confirm exact paths and interfaces before using them.

## 4. Integration contracts

Define typed, versioned contracts for:
- Instrument: symbol, asset class, quote/base currency, precision, timezone/session metadata.
- Candle: timestamp, open, high, low, close, volume if genuinely available, source and quality flags.
- Replay state: instrument, timeframe, visible time boundary, cursor, playback speed and deterministic seed if needed.
- Strategy definition: id/version, parameters, signal timing, risk/execution assumptions.
- Signal event: timestamp, direction, reason codes, referenced candle(s), strategy version.
- Order/position: order type, side, quantity, requested/fill prices, SL/TP, costs, status and timestamps.
- Research run: immutable configuration, code revision, data fingerprint, sample periods, costs, result artifact references and status.
- Metrics: value, unit, definition/version, sample size, period and cost profile.
- Validation report: in-sample/out-of-sample separation, confidence intervals, multiple-testing corrections, walk-forward, benchmark and caveats.

Avoid passing unstructured dictionaries across every layer. Validate inputs at boundaries.

## 5. Critical quantitative invariants

- Use timezone-aware timestamps; define storage timezone and display timezone explicitly.
- Signals use only information available at their decision timestamp.
- No look-ahead bias, survivorship leakage or future-derived features.
- Historical replay reveals no future candles or future events.
- Entry/exit assumptions must be explicit and reproducible.
- If SL and TP occur inside the same one-minute bar, preserve the repository's pessimistic SL-first convention unless a separately validated tick-level model replaces it.
- Costs include the relevant spread/slippage/latency/swap assumptions.
- Never silently change acceptance criteria or experiment samples.
- Record experiment configuration, source revision and data hash/fingerprint.
- Keep selection, validation and forward-test periods separate.
- Treat the research result that SMC/ICT setups did not demonstrate predictive edge in the clean tested history as a constraint on product language, not as a reason to hide or rewrite results.

## 6. API and execution design

Before choosing a framework, inspect existing dependencies and deployment constraints. If a web application is absent, recommend a stack only after assessing compatibility, team workflow and hosting.

Long-running research jobs must not block request/response handlers. Use a job abstraction with:
- submitted, queued, running, succeeded, failed, cancelled states;
- immutable run configuration;
- progress events where meaningful;
- cancellation semantics;
- persisted logs and result artifacts;
- retry policy that does not duplicate or mutate a completed run.

Do not build a fake asynchronous progress bar. Progress must reflect real work or be omitted.

## 7. Persistence and security

- Keep secrets in environment/secret management, never in source control.
- Never expose raw filesystem paths or unrestricted file access through public APIs.
- Validate uploaded datasets and impose size/type limits.
- Use authentication/authorization before exposing private workspaces or research artifacts.
- Audit destructive actions and expensive jobs.
- Avoid storing credentials in browser local storage if a safer session mechanism is available.

## 8. Performance strategy

- Profile actual bottlenecks before optimizing.
- Keep chart rendering responsive with windowed data and decimation where appropriate.
- Avoid sending entire multi-year M1 datasets to the browser.
- Paginate or stream trade/event logs.
- Cache only with explicit keys that include instrument, timeframe, data version and parameters.
- Keep numerical calculations in tested domain code, not duplicated in frontend components.

## 9. Testing pyramid

- Unit tests: financial calculations, timezone/session boundaries, risk sizing, metrics, signal timing.
- Contract tests: serialization and API boundaries.
- Integration tests: research engine invocation, data adapters, persistence and artifact retrieval.
- Replay tests: deterministic cursor progression and no future leakage.
- Regression tests: compare known experiment outputs and existing Python tests.
- UI tests: navigation, core flows, keyboard, responsive and error states.
- Performance tests: realistic chart and replay workloads.

Existing tests must continue to pass. Do not delete or weaken tests to make a build green.

## 10. Implementation sequence

1. Inventory actual repository, dependencies, tests, CI and deployment.
2. Map domain modules and stable interfaces; run current tests.
3. Build design tokens and application shell with realistic sample fixtures clearly marked as fixtures.
4. Build a fully navigable UX prototype with working local interactions.
5. Connect historical data and deterministic replay through typed contracts.
6. Integrate research engine via controlled job interface.
7. Add execution/risk simulation.
8. Add analytics and validation reports.
9. Add persistence, security and operational observability.
10. Harden responsive behavior, accessibility, performance and deployment.

At every stage distinguish implemented, partially implemented, mocked and planned capabilities.
