# NEXUS — Repository Audit & Domain Constraints

Audit baseline: repository README and project documents read on 27 November 2026 from the development branch, inherited from main. This is a documentation-level baseline; implementation work must inspect source files and run tests before drawing code-level conclusions.

## 1. What this repository is

The repository describes a quantitative research lab focused on finding a strategy with positive expectancy and robust evidence, originally targeting win rate at least 50% and real reward/risk at least 1:2. It uses Python and Numba, minute data, experiment scripts, statistical validation, Pine strategies and automated tests.

It is not documented as an existing full-stack terminal application. Do not assume a web frontend or production API exists.

## 2. Research discipline already present

The README describes:
- minute historical data from 2010–2026;
- data quality and normalization workflows;
- a Numba backtesting engine;
- spread/cost and swap modeling;
- SL-first resolution when SL and TP are touched in the same minute;
- statistical validation including DSR, PBO, FDR, SPA and purged walk-forward;
- risk, Monte Carlo and portfolio modules;
- experiment registration with code hashes;
- 27 automated tests.

Verify current counts and implementation before repeating them in product UI.

## 3. Important empirical findings in the current project documentation

The current documents report:
- No tested price-rule configuration among 297,354 survives the multiple-testing corrections; the daily SPA result is reported as p = 0.21.
- SMC and ICT gold setups in the clean, previously unused 2010–2021 history are reported near chance at 1:2 RR: SMC approximately −0.03 R and ICT approximately +0.04 R.
- In the tested SMC component study, prior-day liquidity and killzones added small measured contributions, while FVG/OB/OTE entries detracted.
- The sole documented gold candidate is E022: daily Bollinger breakout in the direction of SMA 200, SL 0.5 ATR(14), TP 2 times SL. The docs report 47.6% win rate and +0.41 R over 168 trades across 2011–2026, with positive confidence interval and realistic-cost robustness, but classify it as Level B/candidate rather than proven.
- The candidate has a sealed forward test (F001 in the earlier baseline); subsequent bitácora entries describe F002 and further research. Reconcile latest registry state before surfacing current status.

These are repository-reported findings, not independently re-computed in this documentation pass. Always link product claims to the exact experiment, data period, sample size, code revision and cost assumptions.

## 4. Important operational limitations

- Current data is primarily historical and locally generated/downloaded. A browser app cannot access local research files unless a deliberate data-serving layer is implemented.
- README says the data folder is not committed and must be regenerated.
- The repo references a separate candle replay implementation in another repository. Do not assume it is part of this repository or copy it without explicit access/audit.
- A public artifact link is mentioned in CONTEXTO_PARA_IAS.md; treat it as a reference, not as source code or a production integration.
- Free external data sources have rate limits and publication delays. Preserve actual publication timestamps for external data.

## 5. Non-negotiable integrity rules

1. Never present a candidate as validated/proven.
2. Never suppress failed experiments or negative findings.
3. Keep in-sample, validation and forward-test periods distinct.
4. Never use validation or forward-test results to tune parameters.
5. Show sample size, uncertainty and costs alongside performance.
6. Preserve experiment registry and hashes.
7. No future candles or future-derived features in replay.
8. Keep all changes reproducible and covered by tests.
9. Do not rewrite historical criteria retroactively.
10. Avoid promotional copy such as “institutional edge” unless supported by actual evidence.

## 6. First engineering actions

- Enumerate every tracked file and inspect package/config files.
- Read source modules referenced by README and all relevant tests.
- Run the existing test suite unchanged and record baseline.
- Inspect CI workflows and deployment configuration.
- Identify whether any UI code exists and its framework/version.
- Map the replay engine dependency and determine whether it can be reused legally and technically.
- Produce a capability matrix: ready, reusable with adapter, needs work, absent.
- Only then propose code changes.
