# Planning manifest

**Rebaselined:** 2026-07-25

## Authority order

1. live source and executable behavior for what exists;
2. accepted ADRs for durable architecture;
3. `.planning/PROJECT.md` for product destination and maturity;
4. `ROADMAP.md`, `REQUIREMENTS.md` and `STATE.md`;
5. the current phase and active scope.

`PRODUCT.md` and `DESIGN.md` were removed from the repository on 2026-07-25
(`ba263c10`, recoverable at `8dbef716`). Nothing in the active corpus may cite
them as authority. `PROJECT.md` now owns the product destination;
`UBIQUITOUS_LANGUAGE.md` owns domain vocabulary; interface direction lives with
the Astryx component usage in source.

`AGENTS.md` was removed in the same commit but has since been re-created and is
the operating contract every agent reads on entering this repository. It is
present on disk and is currently untracked; it restates the authority order
above rather than competing with it.

Proposed ADRs, research, issues, mocks and tests are evidence under evaluation,
not product authority.

## Current program

- `PROJECT.md` — product charter and destination;
- `ROADMAP.md` — current phase sequence;
- `REQUIREMENTS.md` — Phase 3 acceptance baseline;
- `STATE.md` — current frontier and claim ceiling;
- `adr/ADR-009...` — accepted Action Invocation architecture;
- `adr/ADR-010...` — accepted_narrowed shared action plane;
- `adr/ADR-019...` — accepted authority-mode destination;
- `adr/ADR-020...` — accepted Phase 3A paid-operation projection;
- `phases/01.../01-SUMMARY.md` — completed foundation;
- `phases/02.../02-SUMMARY.md` — completed/narrowed host plane;
- `phases/03.../03-SUMMARY.md` — current product-conversion phase;
- `scopes/README.md` — active scope index.

## Supporting material

- `ENGINEERING-STANDARDS.md` — implementation standards;
- `AI-SPEC.md` and `ANSWER-AI-CONTRACT.md` — specialized contracts where their
  capability is in scope;
- `records/**` — decision and research provenance;
- `research/**`, `vision/**`, `wayfinder/**`, `audits/**` — inputs, not current
  sequencing authority;
- `codebase/**` — derived maps that must be reconciled against source;
- `graphs/**` — derived navigation artifacts, never authority.

## Archive

Three field-study and Phase 1/2 completion scopes are retained under
`archive/pre-product-conversion-rebaseline-20260720/scopes/`. The former
marketplace/bootstrap charter, roadmap, requirements and state were deleted on
2026-07-29; they remain recoverable in git history.

Pre-hardening ADR-009/010 histories remain under
`archive/adr-009-010-pre-hardening/adrs/`.
