---
phase: 04-owner-pending-protected-actions
plan: 03
type: execute
wave: 1
depends_on:
  - 04-02-owner-approved-protected-action-durable-runtime-gaps
files_modified:
  - src/modules/protected-action/internal/contact-follow-up.ts
  - src/modules/protected-action/contact-follow-up.functions.ts
  - convex/protectedActions.ts
  - convex/protectedActionStore.ts
  - src/routes/owner.actions.tsx
  - src/routes/owner.actions.$proposalId.tsx
  - src/routes/admin.protected-actions.tsx
  - tests/integration/protected-action-route-readbacks.test.ts
  - tests/unit/convex/protected-actions-runtime.test.ts
  - tests/e2e/protected-action-owner-flow.spec.ts
  - tests/e2e/a11y/protected-action-a11y.spec.ts
autonomous: true
gap_closure: true
requirements:
  - P4-R6
  - P4-R8
user_setup: []
must_haves:
  truths:
    - "P4-R6: owner and admin reconstruction expose explicit stale, disputed, reversed, retry_exhausted, refused, and expired/unavailable posture without reading logs."
    - "P4-R8: closeout proof covers stale, disputed/reversed, retry-exhausted durable readback, concurrent/race paths, and expired/refused/wrong-owner UI disabled or unavailable states."
    - "D-01 D-04 D-05 D-07 D-08 D-09 D-10 D-11 D-12 D-13 D-14 D-15 boundaries remain intact: one selected contact-follow-up action, owner approval required, source-owned evidence, no autonomous execution, no money, and no provider marketplace."
  artifacts:
    - "tests/integration/protected-action-route-readbacks.test.ts asserts stale, disputed, reversed, and retry_exhausted owner/admin route readbacks."
    - "tests/unit/convex/protected-actions-runtime.test.ts asserts durable retry exhaustion and concurrent/race persistence behavior through Convex fake DB reloads."
    - "tests/e2e/protected-action-owner-flow.spec.ts proves expired/refused/wrong-owner disabled or unavailable owner states and corrected queue controls."
  key_links:
    - "readContactFollowUpReconstruction -> owner/admin route readback helpers -> route tests."
    - "retryCurrentOwnerContactFollowUp -> persistContactFollowUpSlice/loadContactFollowUpProposalSlice -> admin reconstruction readback."
    - "local E2E fixture -> owner queue/detail/admin routes -> Playwright disabled/unavailable assertions."
---

<objective>
Close the remaining Phase 4 verifier gaps after 04-02 for P4-R6 and P4-R8 only.

Purpose: make reconstruction posture and closeout proof complete for the selected `contact-follow-up` protected action without adding a generic action platform, autonomous execution, money movement, or provider marketplace surface.
Output: one narrow implementation plan that adds explicit route/admin, durable Convex, and browser proof for stale/disputed/reversed/retry_exhausted plus expired/refused/wrong-owner disabled or unavailable UI states.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-owner-pending-protected-actions/04-SPEC.md
@.planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md
@.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md
@.planning/phases/04-owner-pending-protected-actions/04-02-SUMMARY.md
@src/modules/protected-action/internal/contact-follow-up.ts
@src/modules/protected-action/contact-follow-up.functions.ts
@convex/protectedActions.ts
@convex/protectedActionStore.ts
@src/routes/owner.actions.tsx
@src/routes/owner.actions.$proposalId.tsx
@src/routes/admin.protected-actions.tsx
@tests/integration/protected-action-route-readbacks.test.ts
@tests/unit/convex/protected-actions-runtime.test.ts
@tests/e2e/protected-action-owner-flow.spec.ts
@tests/e2e/a11y/protected-action-a11y.spec.ts
</context>

<source_audit>
SOURCE | ID | Feature/Requirement | Plan | Status | Notes
--- | --- | --- | --- | --- | ---
GOAL | Phase 4 | Consequential actions start as proposals and end in owner-approved receipts with reconstruction posture | 04-03 | COVERED | This gap plan only closes the remaining reconstruction/closeout proof after 04-02.
REQ | P4-R6 | Reconstruction readback covers stale, failed, proof-gap, successful, disputed, reversed, and no-repair states | 04-03 Task 1 | COVERED | Adds explicit route/admin proof for stale, disputed, reversed, retry_exhausted, and refused posture.
REQ | P4-R8 | Closeout proves stale, concurrent, wrong-owner, expired, refused, retry-exhausted, and UI disabled/unavailable paths | 04-03 Tasks 1-3 | COVERED | Adds focused integration, Convex runtime, and E2E/a11y proof.
REQ | P4-R1-P4-R5, P4-R7 | Already verified in 04-VERIFICATION.md after 04-02 | Prior plans | EXCLUDED | User scope is P4-R6 and P4-R8 only; preserve these verified truths without replanning them.
RESEARCH | none | No Phase 4 RESEARCH.md was provided for this gap closure | 04-03 | EXCLUDED | No package installs or new external integrations are planned.
CONTEXT | D-01 D-04 D-05 D-07 D-08 D-09 D-10 D-11 D-12 D-13 | Source-owned selected-action authority and reconstruction chain | 04-03 Tasks 1-2 | COVERED | Tasks keep `contact-follow-up` selected-action-specific and source-owned.
CONTEXT | D-02 D-03 D-06 D-14 D-15 | Evidence-backed single action, no generic catalog, honest discovery/copy | 04-03 Task 3 | COVERED | Task 3 preserves single-action copy and no-autonomy/no-money/no-marketplace scans.
CONTEXT | Deferred Ideas | Autonomous execution, broad catalogs, provider marketplace, request market, skills, hosted agents, MCP/OpenAPI/SDK mutation, money movement | none | EXCLUDED | Deferred ideas remain out of scope.
</source_audit>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin explicit reconstruction posture in source and route/admin readbacks</name>
  <files>src/modules/protected-action/internal/contact-follow-up.ts, src/routes/admin.protected-actions.tsx, tests/integration/protected-action-route-readbacks.test.ts</files>
  <behavior>
    - Stale/expired policy readback: a proposal whose latest policy is expired is exposed as `stale` in owner detail and admin reconstruction, with repair action `operator_review_required`.
    - Refused policy readback: a suppressed/refused proposal is exposed as `refused` and cannot be owner-decided from route readbacks.
    - Audit posture readback: durable reconstruction rows with `protected_action.disputed` and `protected_action.reversed` audit events expose `disputed` and `reversed` respectively, preserving private evidence redaction.
    - Retry-exhausted readback: a proposal with bounded retry exhaustion exposes `retry_exhausted` in owner/admin route helpers and does not collapse to generic failed/proof-gap/no-repair.
  </behavior>
  <action>
    Extend the existing route readback integration fixtures so they create stale, refused, disputed, reversed, and retry_exhausted source states and assert owner detail, receipt where applicable, admin list, admin filtered list, and admin detail readbacks. Use the existing selected-action helpers in `contact-follow-up.ts`; do not introduce a generic action registry or generic provider status table per D-04 and D-06.

    Audit `readContactFollowUpReconstruction`, `reconstructionStatus`, `repairAction`, and admin route rendering. If a posture already exists in the source union, preserve it and add missing tests around the current behavior. If route/admin mapping fails to propagate or render the posture explicitly, fix only that readback/rendering path. Disputed and reversed posture may be sourced from audit events, but the route/admin tests must prove those events survive reconstruction and private evidence remains redacted per D-11 and D-12.

    Keep the source module selected-action-specific to `contact-follow-up`. Do not add autonomous execution, money fields, provider marketplace abstractions, broad action catalog state, MCP/OpenAPI/SDK mutation authority, or descriptor-as-authority behavior per D-01, D-07, D-14, and D-15.
  </action>
  <verify>
    <automated>npm run test:integration -- tests/integration/protected-action-route-readbacks.test.ts</automated>
    <automated>npm run test:unit -- tests/unit/protected-action/selected-action-policy.test.ts</automated>
  </verify>
  <done>Route/admin readback tests directly assert stale, refused, disputed, reversed, and retry_exhausted posture, including repair action and private evidence redaction, without adding out-of-scope surfaces.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Prove durable Convex retry exhaustion and concurrent/race paths</name>
  <files>convex/protectedActions.ts, convex/protectedActionStore.ts, tests/unit/convex/protected-actions-runtime.test.ts</files>
  <behavior>
    - Retry exhaustion persists: `retryCurrentOwnerContactFollowUp` records a durable `protected_action.retry_exhausted` audit event after bounded retries are exhausted, and a fresh admin reconstruction read from FakeDb returns `retry_exhausted`.
    - Concurrent approval race: two distinct approval attempts for the same proposal cannot create duplicate owner decisions, gateways, attempts, receipts, or operation rows.
    - Retry race/stale gateway path: repeated or racing retry calls cannot consume more than one gateway admission per accepted operation and cannot exceed the bounded retry cap.
    - Replay remains idempotent: same operation key and same body replay returns the existing source row; same key with changed body returns the existing idempotency conflict behavior.
  </behavior>
  <action>
    Add focused Convex runtime tests that exercise the actual exported handlers through the existing FakeDb harness. Build the test around persisted rows and reloaded admin readbacks, not only pure source objects, so P4-R8 has durable proof for retry exhaustion and race paths.

    If current `retryCurrentOwnerContactFollowUp` writes retry exhaustion only as an in-memory audit event, ensure `persistContactFollowUpSlice` and `loadContactFollowUpProposalSlice` round-trip the event through `auditEvents` and `operationKeys`. If current store code already round-trips it, add assertions on the durable row counts, operation name, audit event type, admin readback status, and repair action.

    Simulate race/concurrency with sequential FakeDb interleavings that represent stale clients: approve/retry the same proposal using different operation keys and same operation keys, then assert source-owned one-use gateway/idempotency behavior blocks duplicate effects. Keep authority source-owned and owner/admin-only; do not add worker queues, autonomous retries, provider marketplace rows, or money/provider payment identifiers per D-09, D-10, D-11, D-13, and D-15.
  </action>
  <verify>
    <automated>npm run test:unit -- tests/unit/convex/protected-actions-runtime.test.ts</automated>
    <automated>npm run typecheck</automated>
  </verify>
  <done>Convex runtime tests prove retry_exhausted persists through durable rows and admin reconstruction, and concurrent/race paths do not duplicate decisions, gateways, attempts, receipts, audit, or operation state.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add UI closeout proof and remove misleading queue controls</name>
  <files>src/modules/protected-action/contact-follow-up.functions.ts, src/routes/owner.actions.tsx, src/routes/owner.actions.$proposalId.tsx, src/routes/admin.protected-actions.tsx, tests/e2e/protected-action-owner-flow.spec.ts, tests/e2e/a11y/protected-action-a11y.spec.ts</files>
  <behavior>
    - Expired UI: an expired/stale proposal detail route shows the disabled/unavailable reason and approve/reject are unavailable.
    - Refused UI: a refused proposal detail route shows the disabled/unavailable reason and approve/reject are unavailable.
    - Wrong-owner UI: a wrong-owner or owner-denied detail route shows an unavailable state and does not render enabled approve/reject controls.
    - Queue controls: `/owner/actions` no longer shows enabled approve/reject buttons that do not mutate state; the functional decision path remains the detail route.
    - Copy boundaries: rendered owner/admin copy continues to avoid autonomous, direct-execute, payment, booking, provider marketplace, and guaranteed-success claims.
  </behavior>
  <action>
    Expand the local deterministic E2E fixture in `contact-follow-up.functions.ts` with expired/stale, refused, and wrong-owner or owner-denied readback cases. Keep these fixtures gated by the existing explicit local E2E conditions; do not make them production fallback data.

    In `owner.actions.tsx`, remove the non-mutating queue-level approve/reject buttons and keep `Review detail` as the queue action. If status context is still needed on queue cards, render read-only status/disabled reason copy instead of action-looking controls. The verifier flagged the current buttons as misleading because detail route forms are the actual mutation path.

    In `owner.actions.$proposalId.tsx`, make approve/reject disabled or unavailable whenever reconstruction is not owner-decidable: expired/stale, refused, retry_exhausted, disputed, reversed, no_repair, owner already decided, or server-denied/wrong-owner. Show the source-owned reason in the existing alert/fact-grid style without adding modals or hidden confirmations. Preserve consequence, reversibility, deadline, and proof requirement visibility per D-09.

    Add Playwright coverage for expired, refused, and wrong-owner disabled/unavailable states plus the corrected queue controls. Extend the a11y/mobile spec to prove disabled/unavailable states keep keyboard focus behavior and no horizontal overflow. Re-run copy/source scans so the closeout proof maintains no autonomy, no money, and no provider marketplace boundaries per D-14 and D-15.
  </action>
  <verify>
    <automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e -- --grep "selected protected action"</automated>
    <automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e:a11y -- --grep "selected protected action"</automated>
    <automated>npm run test:copy -- tests/copy/phase4-protected-action-claims.test.ts</automated>
    <automated>npm run test:source-mining</automated>
  </verify>
  <done>E2E/a11y proof covers expired, refused, and wrong-owner disabled or unavailable states; queue-level approve/reject controls are no longer misleading; copy/source scans preserve Phase 4 boundaries.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| owner browser -> TanStack route/server function | Owner-visible status and decision controls render untrusted route state and submit owner actions. |
| server function -> Convex mutation/query | Authenticated owner/admin identity crosses into source-owned protected-action state. |
| Convex source rows -> admin reconstruction UI | Operator readback exposes redacted evidence and must not leak raw customer/provider payloads. |
| local E2E fixture -> browser proof | Local deterministic rows must not become production fallback authority. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-04-03-01 | Spoofing | owner detail disabled/unavailable states | high | mitigate | Keep wrong-owner denial source-owned through server/Convex auth and prove no enabled owner controls render for denied readbacks. |
| T-04-03-02 | Tampering | retry/concurrent Convex mutations | high | mitigate | Add durable FakeDb tests proving idempotency, one-use gateway behavior, bounded retries, and no duplicate decision/attempt/receipt rows. |
| T-04-03-03 | Repudiation | disputed/reversed/retry_exhausted posture | medium | mitigate | Persist and reload audit events/operation rows, then assert admin reconstruction exposes the final posture and repair action. |
| T-04-03-04 | Information Disclosure | admin/owner reconstruction readbacks | high | mitigate | Route/admin tests must keep private evidence redacted and assert raw customer/provider payloads are absent. |
| T-04-03-05 | Elevation of Privilege | queue-level action controls | medium | mitigate | Remove non-functional queue approve/reject controls; leave mutations on detail route with source-owned authority checks only. |
| T-04-03-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package installs are planned; if an executor attempts an install, stop for package legitimacy review before proceeding. |
</threat_model>

<verification>
Run the focused closeout suite:

- `npm run test:integration -- tests/integration/protected-action-route-readbacks.test.ts`
- `npm run test:unit -- tests/unit/convex/protected-actions-runtime.test.ts`
- `npm run test:unit -- tests/unit/protected-action/selected-action-policy.test.ts`
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e -- --grep "selected protected action"`
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e:a11y -- --grep "selected protected action"`
- `npm run test:copy -- tests/copy/phase4-protected-action-claims.test.ts`
- `npm run test:source-mining`
- `npm run typecheck`
</verification>

<success_criteria>
P4-R6 passes when a verifier can reconstruct stale, refused, disputed, reversed, retry_exhausted, proof-gap, failed, successful receipt, and no-repair states from owner/admin route readbacks without logs.

P4-R8 passes when local closeout proof directly covers stale, concurrent/race, retry-exhausted durable Convex readback, expired/refused/wrong-owner disabled or unavailable UI states, corrected queue controls, and the no-autonomy/no-money/no-provider-marketplace boundary scans.
</success_criteria>

<output>
Create `.planning/phases/04-owner-pending-protected-actions/04-03-SUMMARY.md` when done. Do not create deployed evidence unless real `DEPLOY_BASE_URL`, `PHASE4_CONTACT_FOLLOW_UP_PROPOSAL_ID`, and `PHASE4_CONTACT_FOLLOW_UP_READBACK_ID` are provided and the deployed smoke actually passes.
</output>
