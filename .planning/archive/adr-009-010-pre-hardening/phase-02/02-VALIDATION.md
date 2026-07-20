# Phase 2 — One action plane cross-surface parity: independent design validation

**Date:** 2026-07-17
**Method:** 3 read-only scout validators with engineering personas (`msitarzewski/agency-agents`: software-architect; frontend-developer + api-platform-engineer; code-reviewer) re-checked the Phase 2 design against real source, plus a cross-phase gate-coverage audit (see `.planning/audits/2026-07-17-adr009-010-gate-coverage-audit.md`).
**Scope:** Validation only. Corrections applied to planning artifacts where wording overstated current source; no source edits.

## Overall verdict

**SOUND-WITH-CAVEATS, corrections applied.** No axis refuted. Citation integrity is excellent (16/16 opened anchors confirmed, 0 drifted despite the concurrent src refactor; null-presence greps independently re-run and confirmed). One material overclaim corrected (VAL-201); three execute-phase constraints recorded.

| Axis | Persona | Verdict |
|---|---|---|
| (i) Semantic-parity contract | software-architect | SOUND (sibling decision confirmed; dimension-3 thinness noted) |
| (ii) Host-adapter boundary | software-architect | SOUND-WITH-CAVEATS (overclaim corrected → VAL-201) |
| (iii) Structured non-visual equivalent | frontend + api-platform | SOUND (additive re-homing; payload fields already exist) |
| (iv) Generative-UI families | frontend + api-platform | SOUND-WITH-CAVEATS (invent-nothing detector unspecified → VAL-203) |
| (v) Reconstruct-from-records | frontend + api-platform | SOUND-WITH-CAVEATS (durable byte-equality blocked on Phase 1 Task 4 → VAL-204) |
| (vi) 10-gate table | code-reviewer | SOUND-WITH-CAVEATS (all 10 rows observable + gate-faithful; effort ordering underspecified → VAL-205) |

## Findings

### VAL-201 — "Boundary already honored by construction" was TRUE ONLY for the embedded path (CORRECTED, most important)
`actionToHarnessToolContract`/`exposureForAction`/`policyForAction`/`filterAnswerModelToolContracts` (`src/modules/harness/tool-contract.ts:130-332`) genuinely derive the embedded/answer-model host's whole view from the action definition. **But the production external-agent path is a separate business path**: `src/routes/api.v1.requests.*.ts` (thin verb→handler delegators, themselves clean) → `src/lib/server/customer-request-agent-api.ts`, which does **not** dispatch through `action.run`. ADR-010 gate 2 is therefore a **target Phase 1's seam must create**, not current construction. Corrected at `02-01-PLAN.md:117`. The duplicate path is precisely the duplication ADR-010 exists to remove — design intent sound, wording was ahead of reality.

### VAL-202 — Parity dimension 3 is under-exercised by the first action (RECORDED)
"Suitability and comparison rules" has a real source home (`projectCustomerOptionSet`, `customer-option-set.ts:6-43`) but it is route-candidate-scoped and degrades to `ordering.kind='not_applicable'` for a single-business `inquiry.submit`. Six of seven dimensions are cleanly encodable; dimension 3 is only *trivially* satisfied until a multi-candidate action is the parity subject. Not a refutation — a known thinness the Phase 3 supplied-candidate slice will exercise properly.

### VAL-203 — Invent-nothing boundary has no runtime detector yet (REQUIRED-BEFORE-EXECUTE)
Today invention is impossible **by construction** — projections are pure functions that `Object.freeze` fields copied from typed inputs. The moment a generative model fills a family, the only enforceable mechanism is **schema-closed generation + an output-field ⊆ (registered-action + authoritative-state) subset validator**. No ADR/plan yet names that validator as a concrete test. Required before any generative execute-phase.

### VAL-204 — Durable reconstruction is architecturally blocked on Phase 1 Task 4 (RECORDED)
Current evidence is weaker than the axis target: `human_reload_resume` is a caller-set boolean (`cross-surface-parity.ts:36`), and `assertExecutionStartReplay` (`hosted-agent-journey.ts:~2001`) compares two **in-memory** view instances. "View = pure function of durable records" byte-equality cannot be proven until the `actionInvocations` table (Phase 1 Task 4, persist-last) exists. Phase 2's eval must state its record source as the in-memory adapter and mark durable-store byte-equality as Phase-1-gated.

### VAL-205 — Ten-gate table validated; effort metric real but ordering underspecified (MINOR)
All 10 rows are CI-assertable and faithful to ADR-010:174-191 (header's `:176-192` is off-by-two, trivial). Gate 10's effort metric is genuinely grounded — the burden tuple `{originsProvided, invocationCalls, schemaMappings, …}` exists at `direct-agent-baseline.ts:219-230` — but "embedded ≤ baseline **on the tuple**" must define elementwise vs aggregate ordering to be deterministic. Accessibility sub-metric is an honestly-caveated structural proxy (field-set completeness), with the true a11y audit deferred and named. Correctness sub-metric reuses gate 1's verdict (mildly circular, still observable).

### VAL-206 — Citations and no-re-decision confirmed (CONFIRMED)
16/16 opened `path:line` anchors confirmed (0 drift, 0 refuted); null-presence greps re-run independently. The sibling `compareActionInvocationSurfaces` decision is a Phase-2-own placement choice, not a Phase 1 seam re-decision; Phase 1 axes are consistently referenced, never re-opened.

## Corrections applied (planning-only)
- `02-01-PLAN.md:117` — embedded-path-only scope of "honored by construction"; external path named as the gap gate 2 must close (VAL-201).
- `01-01-PLAN.md:87/:96/:105` — gate-coverage corrections from the cross-phase audit (ADR-009 gates 1/2/3 → Phase 3 scope; gate 6 partial; gate 7 partial; ADR-010 gates 1/2 "contributing, owner = Phase 2").

## Required before execute-phase (implementer checklist, cumulative with Phase 1's)
1. Unify the external `api.v1.requests.*` path onto the Phase 1 action seam before claiming ADR-010 gate 2 (VAL-201).
2. Specify the invent-nothing subset validator as a concrete test before any model-filled projection ships (VAL-203).
3. Run the Phase 2 reconstruction eval against the in-memory adapter; gate the durable byte-equality assertion on Phase 1 Task 4 (VAL-204).
4. Define the burden-tuple ordering (elementwise recommended) for the gate-10 effort assertion (VAL-205).
5. Exercise parity dimension 3 with a multi-candidate action in the Phase 3 slice (VAL-202).

---
*Phase: 02-one-action-plane-cross-surface-parity · Validation: 2026-07-17 · Design-only; no source touched; ADRs remain `proposed`; #193 open.*
