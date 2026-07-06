---
phase: scope-14day-bootstrap-gate
plan: "14D-G3"
status: source-local-complete
wave: 0
blocker: "supplier-maintenance-evidence"
depends_on: ["14D-01-bootstrap-gate-evidence"]
files_modified:
  - .planning/scopes/scope-14day-bootstrap-gate/14D-G3-supplier-action-evidence-PLAN.md
  - .planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md
  - .planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md
  - .planning/scopes/SCOPE-EXECUTION-READINESS.md
  - src/modules/observability/internal/supplier-actions.ts
  - tests/unit/observability/supplier-actions.test.ts
autonomous: false
requirements:
  - SCOPE-14DAY-INDEX instrumentation map
  - EVIDENCE-14DAY-GATE pre-clock blocker 14D-G3
execution_scope: narrow_pre_clock_instrumentation
production_executable: false
must_haves:
  truths:
    - id: g3-business-scoped
      statement: "A supplier action counted for the 14-day gate must carry a provider/listing ref, normally `businessId`; unlinked recruitment interest does not count."
    - id: g3-no-security-dispute-conflation
      statement: "The privacy/removal dispute route remains a security dispute path and is not reused as supplier-maintenance proof."
    - id: g3-source-owned-row
      statement: "The count must be reconstructable from source-owned claim/listing rows or an explicitly accepted operator evidence ref; fire-and-forget analytics is not proof."
    - id: g3-no-scope-blend
      statement: "This ticket does not add profile click-through, target session counting, public copy, agent action surfaces, payments, booking, dispatch, or autonomous action claims."
---

<objective>
Resolve G3's pre-clock supplier evidence ambiguity without anchoring the 14-day gate on the privacy/removal dispute route. The gate may count a business-scoped listing/supplier action only when a source-owned row proves which provider/listing acted.
</objective>

<context>
`EVIDENCE-14DAY-GATE.md` currently says the provider correction/listing metric is blocked because `/privacy/remove-business` creates a security dispute/audit receipt, not owner-maintenance proof, and `owner_interest_submitted` has no caller. Existing claim/publish flows already create source-owned `claims`, `businesses`, and business contexts for listing requests. This ticket defines a narrow reconstruction contract over those source rows and any future business-scoped owner-interest event, while explicitly excluding unlinked interest and privacy disputes.
</context>

<preflight_gates>
- Do not use `/privacy/remove-business` as the counted supplier pass path.
- Do not count `owner_interest_submitted` or any funnel event unless it has `businessId`.
- Do not rely on fire-and-forget event persistence; counted evidence must already be in source-owned rows plus a direct-recruitment ledger match, or in explicit accepted operator evidence for a provider correction/listing/maintenance action that is not a privacy/removal dispute.
- Do not start the 14-day clock until a target-environment dry run attaches the claim/business/event refs.
</preflight_gates>

<tasks>

<task type="implementation" tdd="true" status="complete">
  <name>Task 1: Define source-owned supplier action reconstruction</name>
  <files>src/modules/observability/internal/supplier-actions.ts; tests/unit/observability/supplier-actions.test.ts</files>
  <action>Add a pure helper over supplied source rows that reconstructs counted supplier actions from business-scoped claim/listing rows and future business-scoped `owner_interest_submitted` funnel rows only when they match a direct-recruitment ledger row or an explicit accepted operator evidence row for the same provider/listing. Keep it pure: no Convex query, table, or index. Privacy/security/removal disputes are never countable for G3.</action>
  <acceptance_criteria>
    - A claim with `businessId`, `claimId`, slug, created timestamp, and status `authenticated` or `published` counts as one `listing_request` supplier action only when it matches a recruited-provider ledger row by `businessId`, slug, or claim id.
    - Duplicate rows for the same claim/action key count once.
    - Claim rows without `businessId` or without recruitment/operator evidence do not count for G3.
    - Business-scoped `owner_interest_submitted` rows can count as `owner_interest` only when they match recruitment/operator evidence; no-`businessId` interest rows do not count.
    - Security/removal dispute rows never count, even when operator evidence exists for the dispute.
    - Window filtering is supported for the dry-run period.
  </acceptance_criteria>
</task>

<task type="documentation" tdd="false" status="complete">
  <name>Task 2: Mark G3 source-local readiness, not pass</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md; .planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md; .planning/scopes/SCOPE-EXECUTION-READINESS.md</files>
  <action>After source-local tests pass, update G3 rows to say source-local reconstruction is implemented but the target dry-run remains open. Keep G2, G4, and deployed audit blockers visible.</action>
  <acceptance_criteria>
    - `14D-G3` is not marked PASS.
    - The evidence row names the target dry-run refs required before the clock.
    - Docs state that privacy/removal disputes are excluded from the supplier pass.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- [x] Unit test proving recruited claim/listing row reconstruction, businessId requirement, recruitment/evidence requirement, dedupe, status filtering, window filtering, owner-interest event handling, and absolute security-dispute exclusion.
- [x] `npm run typecheck`
- [x] Focused observability tests changed by this ticket.
- [x] `npm run test:copy`
- [x] `npm run test:seo`
</verification>

<success_criteria>
- G3 has a source-local, business-scoped supplier action count contract tied to direct recruitment or explicit non-dispute operator evidence.
- The 14-day gate can later prove supplier pass from recruited source-owned claim/business or business-scoped owner-interest rows without counting privacy/removal disputes.
- No public claim, assistant action surface, payment, booking, dispatch, or schema-widening work is bundled into this ticket.
</success_criteria>

<output>
After execution, update `EVIDENCE-14DAY-GATE.md` row `14D-G3` with source-local status and the exact target dry-run evidence required. Do not start the 14-day clock until G1, G3, G4/trust, and any chosen G2 posture are resolved or explicitly accepted by the relevant plan.
</output>
