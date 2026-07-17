# ADR-009 / ADR-010 ↔ Phase 01 / Phase 02 gate-coverage audit

**Date:** 2026-07-17
**Method:** Independent read-only audit (technical-writer + software-architect personas, `msitarzewski/agency-agents`) of all 21 acceptance gates (ADR-009 gates 1–11 at ADR-009:167–191; ADR-010 gates 1–10 at ADR-010:176–192) against the phases' coverage claims (`01-01-PLAN.md` "Makes falsifiable" lines + SPEC-req→gate table; `02-01-PLAN.md` ten-gate table + sub-metrics).
**Headline:** The two phases' first slices do **not** make all 21 gates falsifiable. 5 of ADR-009's 11 gates are effectively uncovered (1, 2, 3 = supplied-candidate cluster; 6, 9 = composition/route-projection cluster), and ADR-010 gate 10 (the effort-reduction payoff) is largely deferred. **Passing both phases' first-slice evals would justify moving NEITHER ADR from `proposed` to `accepted`.** Corrections were applied to `01-01-PLAN.md` (:87, :96, :105) and `02-01-PLAN.md` (:117) on 2026-07-17.

## 21-gate matrix

| Gate | Text (short) | Owner | Test | Verdict |
|---|---|---|---|---|
| 009-1 | supplied-candidate qualification reuses contracts/supply evidence | — | none (inquiry slice has no supplied candidates) | **ORPHAN** (was overclaimed by 01 R2; corrected) |
| 009-2 | supplied-candidate quote collection reuses preparation/attempts/reconciliation | — | none (no quote flow built) | **ORPHAN** (corrected) |
| 009-3 | external commitment observation → attributable claims | — | none (no imported-commitment path) | **ORPHAN** (corrected) |
| 009-4 | request_owned & standalone identical authority/idempotency/evidence/recovery | 01 | Task 3 dual-origin → one `action.run` + Task 5 recovery | COVERED |
| 009-5 | existing Request traces replay without regression | 01 | historical union adapter + "no field optional" | COVERED |
| 009-6 | bundle = independently inspectable refs + declared dependencies | — | persistence stores refs, but no bundle contract built (spec §11 deferred) | **PARTIAL→ORPHAN** (corrected) |
| 009-7 | direct-booking negative control unburdened | 01 (partial) | seam avoids orchestration, but the named *booking* control is never built | PARTIAL (corrected) |
| 009-8 | stop after one task, continue later from durable result | 01 | paused authority gate + resume/reconcile suite | COVERED (the inquiry slice's core proof) |
| 009-9 | full-route projection: completed/current/optional/blocked without kernel machinery | — | none — Phase 02 builds a SINGLE-invocation view, not a multi-task route projection | **ORPHAN** |
| 009-10 | approval of one task ≠ authority for a later task | 01 (+02 g7) | cross-task-leakage negative assertion | COVERED |
| 009-11 | no domain nouns in neutral contracts | 01 | forbidden-token grep + glossary (R7) | COVERED |
| 010-1 | one action semantically equivalent through embedded + ≥1 external surface | **02** (01 contributes) | `compareActionInvocationSurfaces` verdict pass, both hosts | COVERED |
| 010-2 | same source-owned transition both surfaces, no duplicated rules | **02** (01 contributes) | host-adapter-boundaries import test + both paths → one `action.run` | COVERED as **target** — NOT current state (external path `api.v1.requests.*` → `customer-request-agent-api` is a separate business path today; 02:117 corrected) |
| 010-3 | view reconstructable from records w/o transcript | 02 | byte-equal structured view after transcript clear (suite 12) | COVERED (durable-store variant blocked on Phase 1 Task 4) |
| 010-4 | non-visual fallback = same options/consequences/evidence/continuations | 02 | field-set equality, same `invocationRef`+version (suites 14, 1) | COVERED |
| 010-5 | corrections update work + invalidate stale projections | 02 (01 contributes ×2) | version bump + stale + generation ordering (suites 4, 8) | COVERED; **diffuse ownership** — mark 01 claims "contributing" |
| 010-6 | missing info without over-interrogation | 02 | clarification-prompt count = material-field-gap count (suite 5) | COVERED (proxy) |
| 010-7 | approval binds exact action, unusable after material change | 02 (+01 axis iv) | authority replay after version bump refused (suite 4) | COVERED (redundant but agreeing) |
| 010-8 | interruption/refusal/timeout/uncertain/recovery parity | 02 (01 state-model only) | fault paths same structured resolution both surfaces (suites 9-11); timeout/refusal **deferred** | PARTIAL |
| 010-9 | cold agent continues without hidden context | 02 | resume via `invocationRef`+records (suite 2); reverse handoff **deferred** | PARTIAL |
| 010-10 | effort reduced w/o worsening correctness/control/privacy/accessibility/operator burden | 02 | 6 sub-metrics; only correctness/control/operator-burden first-slice | **MOSTLY DEFERRED** — the ADR's payoff claim is not falsified by slice one |

## What must exist before either ADR can move to `accepted`

1. **Phase 3 (supplied candidates + commitments + composition)** covering ADR-009 gates 1, 2, 3 (caller-supplied candidate qualification reusing supply-evidence contracts; supplied-candidate quote collection through existing preparation/disclosure/attempt/reconciliation; external-commitment import as attributable claims), gate 6 (a real bundle contract of task references + declared dependencies), and gate 9 (a full-route projection over completed/current/optional/blocked tasks). These are the scenarios ADR-009 exists to enable; the inquiry slice exercises none of them.
2. **ADR-010 gate 10 composite** — privacy sub-metric (needs persisted authority scope, Phase 1 Task 4), the rich-UI accessibility audit, and the live effort measurement (burden-tuple comparison; define elementwise vs aggregate ordering).
3. **The barrier experiment** (Phase 1 axis vi) — designed-only; needs live-funnel changes + separate authorization.
4. **Two-surface unification** — ADR-010 gate 2 requires the external `api.v1.requests.*` path to actually dispatch through the one action seam Phase 1 builds; until then gate-2 green on the embedded path alone is not gate-2.

## Double-ownership rule (recorded)

ADR-010 gates 1, 2, 5, 7, 8 are claimed by both phases. No logical contradiction (tests are complementary or identical), but **Phase 02 is the gate owner** for all five; Phase 01's claims are "contributing." A green Phase 01 eval with a skipped Phase 02 suite must NOT tick these gates.

---
*Read-only audit; corrections applied only to phase PLAN wording. No ADR edited; both remain `proposed`. #193 open.*
