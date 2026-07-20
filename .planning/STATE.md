---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
current_phase: 3
current_phase_name: protocol-kernel-product-conversion
status: scoped
stopped_at: "Phase 3 rebaselined; ADR-020 and UI projection decisions require discussion before planning"
last_updated: "2026-07-20"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 0
  completed_plans: 0
  percent: 67
---

# Current state

Phases 1 and 2 are complete at the local control-plane evidence boundary.
ADR-009 is accepted. ADR-010 is accepted with Gate 10 narrowed. ADR-019 owns
the four-mode product destination.

Phase 3 is current: convert the protocol/kernel into one customer-visible
delegated-work experience. Proposed ADR-020 owns the product projection
decision. No implementation plan is accepted yet.

## Next transition

Discuss and lock the Phase 3 projection contract, then produce `03-UI-SPEC.md`
and executable implementation plans.

## Current blockers

- no persistent customer mode or mandate projection;
- no source-derived active-work and remaining-authority view;
- no mandate-level pause/revoke surface;
- no standalone customer action journey;
- no persistent evidence-class label on restored work;
- current UI tests prove style hygiene, not autonomy comprehension.

## Evidence ceiling

Phase 1/2 clean-checkout evidence binds revision
`13158022c7462a7fdae346b548f0ea272a87cefe`. It proves labelled local
development behavior only.

Historical state, roadmap, requirements and scopes are preserved under
`.planning/archive/pre-product-conversion-rebaseline-20260720/`.
