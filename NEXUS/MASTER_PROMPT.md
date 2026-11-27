# CLAUDE CODE — NEXUS MASTER IMPLEMENTATION BRIEF

You are the autonomous product and engineering team responsible for turning NEXUS into a real, production-quality institutional trading research terminal.

Act as a combined:
- Chief Product Officer and product strategist;
- UX architect and senior product designer;
- design systems lead;
- staff software architect;
- senior frontend and backend engineers;
- quantitative developer familiar with backtesting and market microstructure;
- QA, accessibility, performance and security engineers.

Your task is not to write a plan and stop. You must inspect the repository, make decisions grounded in evidence, implement the product in coherent increments, test it, document it and commit the work to the current development branch.

## 0. Mandatory start sequence

Before editing code:

1. Confirm the current branch is exactly `nexus/rebuild-ux-foundation`. Never work on `main`.
2. Read every document in `NEXUS/`, especially:
   - `NEXUS/README.md`
   - `NEXUS/PRODUCT_UX.md`
   - `NEXUS/ARCHITECTURE.md`
   - `NEXUS/REPOSITORY_AUDIT.md`
3. Read the repository's `README.md`, `CONTEXTO_PARA_IAS.md`, `BITACORA.md`, `docs/plan_evolucion.md`, `docs/auditoria_fase0.md`, `docs/criterios.md`, `docs/criterios_v2.md` if present, `docs/conclusiones.md`, `docs/costos.md`, and `docs/fichas.md`.
4. Inventory the full tracked file tree. Inspect dependency manifests, Python package structure, frontend code if any, tests, CI workflows and deployment files.
5. Read the source code of all domain modules before integrating them. At minimum inspect the modules listed in `NEXUS/ARCHITECTURE.md`.
6. Run the existing test suite without modifying tests. Record exact commands and results.
7. Produce `NEXUS/IMPLEMENTATION_AUDIT.md` with:
   - actual repository map;
   - existing UI/backend status;
   - module-by-module reuse assessment;
   - test baseline;
   - known defects and risks;
   - proposed stack only after evidence;
   - capability matrix (implemented / reusable with adapter / partial / absent).
8. Then begin implementation. Do not wait for another prompt unless blocked by credentials, external permissions, or a genuinely irreversible product decision.

If a listed file does not exist, record that fact and continue. Do not invent its contents.

## 1. Product mission

Build NEXUS: a premium, institutional-style trading research terminal centered on XAUUSD, with a coherent path from market context to historical replay, strategy testing, execution simulation and statistical performance analysis.

NEXUS is NOT:
- a music player or media player;
- a generic admin dashboard;
- a static design mockup;
- a decorative chart page;
- a sales landing page;
- a clone of TradingView;
- a fake terminal with inert controls or fabricated market data.

The product principle is:

**La sofisticación debe estar en las capacidades. La sencillez debe estar en la experiencia.**

The product should feel sophisticated on first contact and become an unobtrusive, efficient working environment during actual use.

## 2. Product priorities

User-approved direction:
- Start from a clean product/UX foundation, not a patchwork of the wrong previous UI.
- Audit and preserve the real, valuable research engine and logic already in the repository.
- Full product scope, designed for eventual production.
- First priority: UX/UI, navigation, information architecture and the complete user experience.
- Build desktop-first for serious research, with a deliberate mobile companion experience.

Do not interpret “new foundation” as permission to discard proven quantitative modules, test coverage, experiment history or governance.

## 3. Visual identity

Use the supplied visual reference under `NEXUS/visual/` as a direction, not as an excuse to copy every detail.

Core palette:
- Obsidian #080B12
- Graphite #111827
- Gold #C6A15B
- Neural Cyan #36C9D6
- White #F4F6FA

Use gold sparingly for identity, selected emphasis and premium accents. Use cyan for active analytical states and focus. Use semantic colors for positive/negative/warning, never color alone to communicate status.

Visual quality requirements:
- clean grid and consistent spacing;
- high information hierarchy;
- readable compact typography and tabular numerals;
- elegant chart surfaces;
- restrained borders and shadows;
- subtle purposeful motion;
- no excessive glow, neon, glassmorphism, gradients or ornamental clutter;
- no giant empty hero sections inside the working terminal;
- no decorative candlesticks or arrows as branding;
- responsive, accessible and keyboard-operable controls.

Create reusable design tokens and components. Do not scatter raw color values through components.

## 4. Information architecture

Primary modules:
1. Overview
2. Market Replay
3. Strategy Lab
4. Institutional Toolkit
5. Execution Engine
6. Performance Analytics
7. Data Center
8. Settings

Global shell should include:
- compact primary navigation;
- selected instrument and timeframe;
- current replay/live/historical context clearly distinguished;
- timezone/session context;
- global search or command palette;
- system/data status;
- workspace and user controls.

Avoid excessive nested navigation. Keep key context visible.

## 5. Required workflows

### A. Overview
A functional workspace, not a marketing dashboard:
- XAUUSD snapshot and data timestamp/source;
- market/session context only when supported by available data;
- recent research runs and replay sessions;
- saved strategies and workspaces;
- key performance snapshot with period and sample size;
- clear entry points to replay and research.

Never label stale historical data as live.

### B. Market Replay
This is a flagship workflow:
- interactive candlestick chart;
- deterministic playback of historical data;
- play/pause, step one candle, step N candles, speed, jump-to-date, timeframe and range controls;
- session markers and timeline;
- entry/SL/TP overlays;
- trade log and event timeline;
- optional decision panel showing the conditions known at each candle;
- reset and reproducible replay state.

No future candle, future event or future-derived indicator may leak into the visible state. Make the replay timestamp and data boundary explicit.

### C. Strategy Lab
- strategy/hypothesis catalog;
- clear parameters and definitions;
- reproducible run configuration;
- real run status and logs;
- candidate comparison;
- strict selection/validation separation;
- sample-size and multiple-testing warnings;
- ability to inspect failed as well as successful research.

Do not silently optimize parameters or change acceptance criteria.

### D. Institutional Toolkit
Modular, context-aware overlays and tools:
- market structure, BOS and CHOCH;
- liquidity levels and sweeps;
- FVG, iFVG and BPR;
- order blocks;
- premium/discount and OTE;
- session and killzone overlays;
- previous day/week highs and lows.

Separate descriptive pattern detection from evidence of predictive value. A chart annotation is not proof of edge.

### E. Execution Engine
- BUY/SELL;
- market, limit and stop order types when supported;
- entry, stop loss, take profit;
- position size and risk in account currency and R;
- spread, slippage, latency, swap and session cost assumptions;
- deterministic order/position states;
- explicit simulation-vs-broker distinction.

Do not add live broker routing unless specifically implemented, authorized and tested. Never imply simulated orders are real trades.

### F. Performance Analytics
- win rate, payoff, profit factor, expectancy;
- drawdown and equity curve;
- trade count, duration;
- year/month/session/instrument breakdown;
- confidence intervals and statistical tests;
- benchmarks and risk-adjusted metrics;
- walk-forward and robustness;
- sensitivity to costs.

Every result must disclose period, sample size, cost profile and calculation definition.

### G. Data Center
- instrument and coverage inventory;
- data source, resolution, timezone and last update;
- gaps, duplicates, invalid OHLC and quality checks;
- import/download job states;
- data provenance.

The research data folder is not necessarily committed and cannot be assumed to be available to a deployed UI. Design a proper serving/import strategy.

### H. Settings
- saved layouts and workspace preferences;
- chart defaults;
- timezone and session definitions;
- risk defaults;
- appearance/accessibility;
- keyboard shortcuts;
- integration configuration with secure secrets handling.

## 6. Quantitative integrity — absolute rules

The current repository reports a rigorous Python/Numba research lab, with minute data, execution costs, statistical validation, experiment registry, Pine scripts and tests. Preserve its discipline.

Mandatory:
- no look-ahead bias;
- no future leakage in replay or features;
- timezone-aware timestamps and explicit timezone conversion;
- signals calculated only from data available at the decision time;
- entries and exits follow documented execution assumptions;
- SL-first if SL and TP occur in the same one-minute candle, unless a separately validated tick model changes this;
- spread, slippage, latency and swap costs are not optional decorations;
- preserve in-sample, validation and forward-test boundaries;
- never change historical criteria to make a result pass;
- preserve experiment hashes and reproducibility;
- keep existing tests and add tests; never weaken tests to make CI green;
- distinguish candidate, validated and forward-tested status.

Current documented findings include failed SMC/ICT predictive tests on clean history and a Level B/candidate gold D1 strategy. Verify the latest bitácora and registry before displaying any current status. Do not turn research findings into marketing claims.

## 7. Architecture

Do not assume a frontend framework or API exists. Inspect first.

Target logical layers:
1. Presentation/design system.
2. Application workflows/state.
3. Domain models and financial rules.
4. Existing Python/Numba research engine.
5. Data adapters.
6. Persistence.
7. Observability.

Prefer a modular monolith or a small number of deployables. Do not introduce microservices, queues, databases or cloud dependencies without a concrete need.

Define typed, versioned contracts for instruments, candles, replay state, strategy definitions, signal events, orders, positions, research runs, metrics and validation reports.

Long-running research must use a job abstraction with real states, persisted results and logs. Do not fake progress.

Do not duplicate financial calculations in the frontend. Domain calculations belong in tested code.

## 8. UX interaction quality

- command palette;
- keyboard shortcuts and discoverable shortcut help;
- resizable/collapsible panels;
- saved workspace layouts;
- contextual tooltips;
- useful empty/loading/error/success states;
- clear confirmation for expensive jobs;
- cancel/retry behavior where valid;
- undo/reset for destructive configuration changes;
- focus states and screen-reader labels;
- reduced-motion support.

Every visible interactive element must work. If it is not implemented, show it as disabled/planned with an honest explanation.

## 9. Implementation strategy

Work in phases, but do not stop after writing documents.

### Phase 0 — Audit
Complete the mandatory start sequence and write `NEXUS/IMPLEMENTATION_AUDIT.md`.

### Phase 1 — UX foundation
- establish stack based on audit;
- build design tokens;
- build navigation shell;
- build responsive workspace;
- implement command palette and global context;
- build high-fidelity module layouts;
- use clearly labeled fixtures only where real data integration is not yet available;
- ensure navigation and local interactions work.

### Phase 2 — Replay vertical slice
Connect actual historical data through a stable adapter. Implement deterministic playback, chart state, event timeline and no-lookahead tests.

### Phase 3 — Research vertical slice
Connect at least one real, existing experiment/engine workflow through typed configuration and job status. Persist run metadata and results.

### Phase 4 — Execution and analytics
Integrate execution assumptions and risk calculations. Build metrics and validation views from actual engine outputs.

### Phase 5 — Hardening
Accessibility, responsive behavior, security, performance, logging, CI and deployment documentation.

At the end of each phase:
- run relevant tests;
- record what is implemented vs partial vs mocked vs planned;
- update documentation;
- commit a coherent increment on this branch.

## 10. Autonomous operating rules

- Make sensible reversible decisions without asking for approval.
- Ask only when blocked by missing credentials, paid services, external account permissions, or irreversible decisions.
- Never fabricate repository paths, source interfaces, test results or deployment status.
- If an external integration is unavailable, build a clean adapter boundary and document the limitation.
- Do not stop at a proposal. Implement the highest-value working vertical slice.
- Keep commits focused and descriptive.
- Do not push to main or open a production deployment without authorization.
- Keep a running `NEXUS/PROGRESS.md` with decisions, completed tasks, test evidence and next steps.

## 11. Definition of done for the first delivery

The first delivery is acceptable only when:
- NEXUS has a coherent, premium, responsive application shell;
- all eight primary modules are navigable;
- Overview and Market Replay have a clear, believable information hierarchy;
- visible controls work or are honestly marked as unavailable;
- no music-player concepts or UI remain;
- design tokens and reusable components exist;
- actual repository capabilities and missing integrations are documented;
- existing tests still pass;
- the branch contains implementation commits and an updated progress log.

**Final principle: Build NEXUS. Do not build a picture of NEXUS.**
