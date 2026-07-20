---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
current_phase: 3
current_phase_name: protocol-kernel-product-conversion
status: implementing
stopped_at: "Phase 3A implementation authorized; Wave 1 payment custody is the first source transition"
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

Phase 3A is current: prove one reliable paid BTC/USD operation through equal
human and agent projections. ADR-020 is accepted for labelled local
implementation.

## Next transition

Make x402 payment preparation and possible submission durably reconstructable,
then normalize the exact quote and project shared paid-operation semantics.

## Current blockers

- payment authorization and paid dispatch are not yet durably separated;
- settlement evidence and quote delivery are not independently projected;
- the development quote contract is not yet exact BTC/USD product evidence;
- no compact human paid-operation surface exists;
- current parity proves generic invocation semantics, not paid-result semantics.

## Evidence ceiling

Phase 1/2 clean-checkout evidence binds revision
`13158022c7462a7fdae346b548f0ea272a87cefe`. It proves labelled local
development behavior only.

Historical state, roadmap, requirements and scopes are preserved under
`.planning/archive/pre-product-conversion-rebaseline-20260720/`.
