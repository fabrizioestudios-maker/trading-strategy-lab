# NEXUS — Institutional Trading Terminal

NEXUS is the product and experience layer being designed around the quantitative research capabilities in this repository. It is **not** a music player, a static dashboard, or a cosmetic chart mockup.

Its purpose is to give a trader a coherent environment to inspect market data, replay historical sessions, understand strategy decisions, test hypotheses, simulate execution, and evaluate performance with institutional research discipline.

## Product principle

> La sofisticación debe estar en las capacidades. La sencillez debe estar en la experiencia.

The interface should feel premium and immediately understandable. Complexity belongs in the engine and can be progressively disclosed when the user needs it.

## Repository reality

This repository currently documents and implements a Python quantitative research laboratory:
- historical minute data workflows;
- a Numba-backed backtesting engine;
- signal and SMC/ICT modules;
- realistic execution and risk models;
- statistical validation, multiple-testing corrections and walk-forward analysis;
- experiment scripts, results, tests, and Pine Script strategies.

The NEXUS product work must respect that reality. Do not claim that a terminal screen is connected to a capability until an actual integration exists and has been tested. The existing research lab is a valuable domain engine, not automatically a ready-made web backend.

## Start here

1. [Master implementation brief](MASTER_PROMPT.md)
2. [Product and UX specification](PRODUCT_UX.md)
3. [Architecture and integration plan](ARCHITECTURE.md)
4. [Repository audit and domain constraints](REPOSITORY_AUDIT.md)
5. [Visual reference](visual/README.md)

## Working rules

- Work only on branch `nexus/rebuild-ux-foundation` until explicitly instructed otherwise.
- Never commit directly to `main`.
- Audit before refactoring. Preserve tested research logic and reproducibility.
- No fake data presented as live, no fake controls, no simulated success states.
- Every screen must have loading, empty, error, and success states.
- Financial calculations must be deterministic, timezone-aware, and testable.
- No look-ahead bias; no silent changes to experiment criteria.
- Update documentation and tests alongside implementation.

## Product scope

Primary instrument: XAUUSD. The product architecture should be extensible to the other instruments in the lab without making the first release feel like a generic multi-asset template.

Primary desktop workspace:
- Overview
- Market Replay
- Strategy Lab
- Institutional Toolkit
- Execution Engine
- Performance Analytics
- Data Center
- Settings

Mobile is a deliberate companion experience, not a shrunken desktop terminal.
