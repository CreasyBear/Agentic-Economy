---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
status: phase_05_source_landed_on_main
stopped_at: Phase 05 source integrated on main; claim ceiling removed by owner decision
last_updated: "2026-07-25T17:30:00Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 8
  completed_plans: 0
  percent: 17
current_phase: 05
current_phase_name: consumer-decision-support
---

# Current state

Branch `main`, revision `b1b105b1`, clean tree.

Phases 1 and 2 are complete at the local control-plane evidence boundary.
ADR-009 is accepted. ADR-010 is accepted with Gate 10 narrowed. ADR-019 owns
the four-mode product destination. ADR-026 owns the one-business supply graph.

Phase 3A is complete at the labelled local/mock boundary. Phase 3B confirmed
that a second operation-owned provider can use the same paid-operation host,
semantics and query-agnostic renderer without fallback or a second product
stack.

Phase 05 source is integrated on `main`. The ADR-026 offering supply graph
(offering source/migration/supply, catalog/capability-supply/discovery/registry
projections, owner offering routes, UCP/offering manifests) and the
answer-first consumer surfaces landed via `664d533e` and `b8567dc7`, then were
extended on 2026-07-25: catalog supply can express a callable, priced
capability (`b342afa7`) and `/api/sandbox/$slug/checkup-quote` serves it to
agents and people against labelled sandbox supply (`c6f871fd`).

## Owner decision — 2026-07-25

The public-claim ceiling was removed. Deleted: `src/lib/ui/contract-scans.ts`,
`tests/copy/claims-register.test.ts`, `tests/copy/phase1-banned-copy.test.ts`,
`tests/copy/pm05-trust-language-gate.test.ts`,
`tests/copy/discovery-overclaim.test.ts`, and the answer standing-caveat and
overclaim gates (`cfebb919`, `2cb10448`, `97b978b3`). `PRODUCT.md`, `DESIGN.md`
and `AGENTS.md` were removed (`ba263c10`, recoverable at `8dbef716`);
`PROJECT.md` now owns the product destination.

Public copy is an owner judgement, not a machine-enforced ceiling. Internal
evidence classes still apply: this document must not upgrade a source or
fixture result into hosted, provider, or customer evidence.

## Verified evidence

- `npm run typecheck` — clean (was 72 errors on the prior checkpoint; cleared
  by `05a0233e` and `5954b6b9`).
- `npm run test:unit` — 2433 passed / 4 failed across 341 files, after this
  rebaseline fixed the two stale `tests/unit/planning/project-records.test.ts`
  assertions (ADR-009 is accepted, not proposed; the research-queue table was
  reformatted to padded columns).

The four remaining failures are pre-existing drift, not regressions from
Phase 05 source:

- `tests/unit/schema/convex-schema.test.ts` (1) — the exact-table list omits
  the standing-route-authority and submission-shell tables now in schema.
- `tests/unit/customer-request/direct-agent-baseline.test.ts` (1)
- `tests/unit/answer/inquiry-deep-link.test.ts` (1)
- `tests/unit/action-invocation/development-host-parity.test.ts` (1)

Live Convex data, hosted, provider, demand and customer evidence remain
unproven. No Convex dev backend was run for this rebaseline.

## Next transition

Two candidates, owner's call:

1. Close the four remaining source-level unit failures, then run
   `npm run test:integration` for a full source-evidence baseline.
2. Validate the live browse → Offering → callable capability loop against a
   seeded Convex backend, which is the first evidence class this project has
   never reached.

## Remaining evidence gaps

- `P5-AGENT` is unimplemented: no `POST /api/compare`, no registered
  inspect-only comparison action.
- `P5-COMPARE` and `P5-HUMAN` are partial: shortlisting exists only in the
  answer surface; no URL shortlist or dedicated accessible comparison route.
- `P5-EVIDENCE` is unmet: no hosted readback, no frozen evidence packet.
- No Phase 05 browser, hosted, provider or customer evidence exists.

## Session

**Last session:** 2026-07-25T17:30:00Z
**Stopped at:** `.planning` rebaselined against `main` at `b1b105b1`
**Resume file:** `.planning/ROADMAP.md`
