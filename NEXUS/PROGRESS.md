# NEXUS — Progress log

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
