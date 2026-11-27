# NEXUS — Product & UX Specification

## 1. Product definition

NEXUS is a premium institutional-style trading research terminal. It unifies market context, historical replay, strategy research, execution simulation, SMC/ICT analysis tools, and statistical performance review in one coherent workspace.

It is not:
- a music or media player;
- a generic admin dashboard;
- a TradingView clone with decorative panels;
- a signal-selling landing page;
- a static prototype whose controls do nothing.

## 2. Product promise

A trader can move from a question to evidence:
1. choose an instrument and period;
2. inspect context and market structure;
3. replay the market without future information;
4. observe the strategy's decision process candle by candle;
5. test and compare hypotheses;
6. simulate realistic fills, spread, slippage and risk;
7. evaluate expectancy, drawdown, robustness and statistical confidence;
8. save and reproduce the research session.

## 3. Experience principles

### Clarity before density
Use hierarchy, spacing, typography, grouping and progressive disclosure. Do not put every metric on screen at once.

### Expert depth without expert-only navigation
A new user should understand where to start. Advanced users should have shortcuts, keyboard navigation, configurable panels and saved workspaces.

### Evidence over persuasion
Display uncertainty, sample size, costs, confidence intervals and validation status. Never use green performance styling to imply a strategy is validated when it is only a candidate.

### Real interaction
Every visible button, menu, tab, chart control, filter and panel must perform its stated action. If a capability is not implemented, label it as planned/disabled with a reason rather than pretending it works.

### Calm premium visual language
Dark obsidian surfaces, graphite layers, restrained gold for institutional identity, cyan for active/analytical states, and high-contrast neutral text. Avoid excessive glow, neon, gradients, ornamental candlesticks and giant hero slogans.

## 4. Visual system

Core palette:
- Obsidian: #080B12
- Graphite: #111827
- Gold: #C6A15B
- Neural Cyan: #36C9D6
- White: #F4F6FA

Use semantic tokens rather than scattering raw colors. Define tokens for background, surface, elevated surface, border, text primary/secondary/muted, positive, negative, warning, info, focus and disabled.

Typography: modern, highly legible sans-serif for UI; tabular numerals for prices and metrics. Keep labels concise. Use consistent number formatting and explicit units.

Motion: subtle and purposeful; short transitions, no distracting perpetual animations. Respect reduced-motion preferences.

## 5. Information architecture

Primary navigation:
1. Overview
2. Market Replay
3. Strategy Lab
4. Institutional Toolkit
5. Execution Engine
6. Performance Analytics
7. Data Center
8. Settings

Global shell:
- compact primary navigation;
- instrument and timeframe context;
- session/timezone context;
- global search / command palette;
- notifications and system/data status;
- user/workspace controls.

Avoid deep nested navigation. Keep the current instrument, date range and active workspace visible.

## 6. Screen requirements

### Overview
A useful starting workspace, not a marketing page.
- selected instrument and current data status;
- concise market context and session clock;
- recent research activity;
- saved strategies and recent replays;
- watchlist or instrument selector;
- key performance snapshot with period and sample-size labels;
- clear next actions.
Do not invent real-time market data. If no live feed exists, state the data timestamp and source.

### Market Replay
The signature workflow.
- central interactive candlestick chart with deterministic historical playback;
- play/pause, step candle, step N bars, speed, jump-to-date and range selection;
- instrument and timeframe controls;
- timeline and session markers;
- trade/position overlays with entry, stop and target;
- event/decision timeline;
- optional side panels for strategy conditions, market structure, liquidity and trade log;
- reset and reproducible replay state.
The replay must not expose future candles or future-derived indicators. Show the replay clock and data boundary clearly.

### Strategy Lab
- hypothesis/strategy catalog;
- strategy configuration with explicit parameter definitions and defaults;
- run status and reproducible run metadata;
- comparison of candidates;
- selection vs validation periods clearly separated;
- warnings for multiple testing, low sample size and overfitting;
- no hidden parameter optimization or silent criteria changes.

### Institutional Toolkit
Tools should be modular and context-aware:
- market structure (BOS/CHOCH);
- liquidity levels and sweeps;
- FVG/iFVG/BPR;
- order blocks;
- premium/discount and OTE zones;
- sessions and killzones;
- daily/weekly highs and lows;
- configurable overlays and visibility.
Do not assert predictive value merely because a pattern is drawn. Label descriptive detection separately from tested predictive evidence.

### Execution Engine
- order type and direction;
- entry, stop loss and take profit;
- position sizing and risk in account currency and R;
- spread, slippage, latency and session cost assumptions;
- partial fills only if modeled;
- deterministic resolution of stop/target collisions;
- explicit order/position state;
- simulation vs actual brokerage execution unmistakably distinguished.
No live order routing unless a broker integration is explicitly built, authorized and tested.

### Performance Analytics
- net expectancy in R;
- win rate and payoff ratio;
- profit factor;
- max drawdown;
- trade count and average duration;
- year/month/session/instrument breakdowns;
- confidence intervals and statistical tests;
- benchmark comparison;
- walk-forward and robustness diagnostics;
- costs sensitivity.
Every metric must expose its period, sample size, cost assumptions and calculation definition.

### Data Center
- available instruments and date coverage;
- source, timezone, resolution and last update;
- quality checks, gaps, duplicates and OHLC consistency;
- download/import status;
- data provenance and licensing notes.
Do not imply that the repository's local research data is available in a deployed browser application without a deliberate serving strategy.

### Settings
- workspace/layout preferences;
- chart defaults;
- timezone and session definitions;
- risk defaults;
- appearance and accessibility;
- keyboard shortcuts;
- data and integration configuration with secure handling.

## 7. Advanced interaction

- command palette for navigation and common actions;
- keyboard shortcuts with discoverable help;
- resizable/collapsible panels;
- saved workspace layouts;
- draggable panel arrangement only where it remains accessible;
- contextual tooltips and concise explanations;
- undo/reset for destructive configuration changes;
- clear confirmation for expensive research runs;
- persistent filter state where appropriate.

## 8. Responsive behavior

Desktop is the primary research environment. Tablet should preserve core chart and workflow. Mobile should prioritize:
- market snapshot;
- compact chart/replay controls;
- active position/risk summary;
- alerts and saved research;
- simplified navigation.
Do not squeeze all desktop panels into a narrow screen. Use focused views and progressive navigation.

## 9. Accessibility and quality

- semantic HTML and keyboard-operable controls;
- visible focus states;
- sufficient contrast;
- screen-reader labels for icon-only controls;
- reduced motion;
- responsive text scaling;
- no color-only communication for trade direction or status.

## 10. Acceptance criteria

A screen is not complete until:
- its core user task is clear;
- all visible controls work;
- loading/empty/error/success states exist;
- data provenance and timestamps are clear;
- layout works at target breakpoints;
- keyboard and focus behavior are tested;
- no misleading performance or market claims are shown;
- tests cover calculations and critical state transitions.
