# Planning manifest

**Rebaselined:** 2026-07-20

## Authority order

1. live source and executable behavior for what exists;
2. `PRODUCT.md` for product destination and maturity;
3. `DESIGN.md` for human-interface direction;
4. accepted ADRs for durable architecture;
5. `.planning/PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md` and `STATE.md`;
6. the current phase and active scope.

Proposed ADRs, research, issues, mocks and tests are evidence under evaluation,
not product authority.

## Current program

- `PROJECT.md` — protocol/kernel → product charter;
- `ROADMAP.md` — current three-phase sequence;
- `REQUIREMENTS.md` — Phase 3 acceptance baseline;
- `STATE.md` — current frontier and claim ceiling;
- `adr/ADR-009...` — accepted Action Invocation architecture;
- `adr/ADR-010...` — accepted_narrowed shared action plane;
- `adr/ADR-019...` — accepted authority-mode destination;
- `adr/ADR-020...` — proposed delegated-work projection;
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

The former marketplace/bootstrap charter, roadmap, requirements, state and
scopes are under
`archive/pre-product-conversion-rebaseline-20260720/`.

Pre-hardening ADR-009/010 plans and wording remain under
`archive/adr-009-010-pre-hardening/`. Gate 10 implementation provenance remains
under `archive/adr-010-gate-10/`.
