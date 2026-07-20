---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
current_phase: 3
current_phase_name: protocol-kernel-product-conversion
status: verifying
stopped_at: "Phase 3A source loop complete; browser accessibility evidence remains"
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

Mount the development-only paid-operation harness in a browser test boundary
and close R10/R11 without adding a public route or widening the evidence claim.

## Current blockers

- no browser-level proof yet exists for 320px/400% reflow, computed focus,
  reduced-motion media behavior, bounded announcements or axe/screen-reader
  behavior;
- the development file port is labelled evidence infrastructure, not
  production persistence;
- no hosted, real-payment, independent-settlement, provider or customer proof
  follows from the completed source loop.

## Evidence ceiling

Phase 3A focused local evidence at `a7307c33` proves the source-owned paid
operation contract, separate-process crash recovery, exact payment
reconciliation, query-agnostic human/agent projections and local fixture
comprehension only. The last clean-checkout packet proof predates the final
reconciliation commits and must be regenerated before R11 closes.

Historical state, roadmap, requirements and scopes are preserved under
`.planning/archive/pre-product-conversion-rebaseline-20260720/`.
