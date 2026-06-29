---
phase: 04-owner-pending-protected-actions
plan: 02
type: execute
slug: owner-approved-protected-action-durable-runtime-gaps
wave: 5
depends_on:
  - 04-01-one-owner-approved-protected-action
files_modified:
  - convex/protectedActions.ts
  - src/modules/protected-action/contact-follow-up.functions.ts
  - src/modules/protected-action/public.ts
  - src/modules/protected-action/internal/contact-follow-up.ts
  - src/modules/protected-action/internal/gateway.ts
  - src/modules/protected-action/internal/schema.ts
  - src/routes/owner.actions.tsx
  - src/routes/owner.actions.$proposalId.tsx
  - src/routes/owner.actions.$proposalId.receipt.tsx
  - src/routes/admin.protected-actions.tsx
  - src/routes/admin.protected-actions.$proposalId.tsx
  - tests/unit/protected-action/owner-action-flow.test.ts
  - tests/unit/protected-action/selected-action-contract.test.ts
  - tests/unit/protected-action/selected-action-gateway.test.ts
  - tests/unit/protected-action/selected-action-policy.test.ts
  - tests/unit/convex/protected-actions-runtime.test.ts
  - tests/unit/server/protected-action-server-seams.test.ts
  - tests/integration/protected-action-route-readbacks.test.ts
  - tests/types/protected-actions-contracts.test.ts
  - tests/copy/phase4-protected-action-claims.test.ts
  - tests/ui-contract/protected-action-status-copy.test.ts
  - tests/seo/protected-action-noindex.test.ts
  - tests/e2e/protected-action-owner-flow.spec.ts
  - tests/e2e/a11y/protected-action-a11y.spec.ts
  - .planning/phases/04-owner-pending-protected-actions/04-02-SUMMARY.md
  - .planning/phases/04-owner-pending-protected-actions/04-DEPLOY-READBACK-EVIDENCE.md
autonomous: true
gap_closure: true
runtime_autonomy: forbidden
requirements: [R1, R2, R3, R4, R5, R6, R7, R8]
user_setup: []
must_haves:
  truths:
    - "R1/D-01/D-02/D-03 remain true: Phase 4 has exactly one selected non-money owner-approved action, contact-follow-up."
    - "R2/D-04/D-05/D-07 are durable: proposal and policy mutations persist protectedActionProposals, protectedActionPolicyDecisions, audit, idempotency, correlation, actor, target, owner context, canonical hash, and allowed parameters."
    - "R3/D-08 is covered: policy returns review_required, refused, expired, proof_gap, missing_proof, external_authority, and time_bound with no provider/internal attempt side effects."
    - "R4/D-09 is mounted: owner routes read source-owned queue/detail data and POST approve/reject decisions through server functions before any attempt is recorded."
    - "R5/D-10/D-13 are durable: one-use gateway consumption, attempt, receipt/proof-gap/failed readback, retry, retry-exhausted, and no-repair state persist atomically."
    - "R6/D-11/D-12 are reconstructable: owner/admin readbacks rebuild actor, proposal, policy, decision, gateway, attempt, outcome, receipt/proof-gap, audit, dispute/reversal posture, private-evidence redaction, repair, and no-repair from source state."
    - "R7/D-14/D-15 remains bounded: copy and discovery describe contact-follow-up as owner-pending/approval-required only after server behavior exists, with no autonomous, direct-execute, provider-market, or money claim."
    - "R8 closeout proves duplicate, stale, concurrent, wrong-owner, expired, refused, proof-gap, downstream-failure, successful owner-approved action, mobile, keyboard, focus, disabled, source-mining, no-money, and no-autonomy paths."
  artifacts:
    - path: "convex/protectedActions.ts"
      provides: "Selected contact-follow-up Convex mutations/queries and durable readbacks over protected-action tables."
    - path: "src/modules/protected-action/contact-follow-up.functions.ts"
      provides: "TanStack server functions for owner/admin routes, following Phase 2 source-query/source-mutation patterns."
    - path: "src/routes/owner.actions*.tsx"
      provides: "Owner queue/detail/receipt UI backed by server readbacks and approve/reject POST actions."
    - path: "src/routes/admin.protected-actions*.tsx"
      provides: "Admin reconstruction UI backed by durable protected-action readbacks."
    - path: "tests/unit/convex/protected-actions-runtime.test.ts"
      provides: "Durable runtime coverage for protected-action table persistence and owner/admin authority."
    - path: ".planning/phases/04-owner-pending-protected-actions/04-DEPLOY-READBACK-EVIDENCE.md"
      provides: "Optional non-secret deployed proof only when deploy env and source proposal state exist."
  key_links:
    - from: "src/routes/owner.actions.$proposalId.tsx"
      to: "src/modules/protected-action/contact-follow-up.functions.ts"
      via: "useServerFn approve/reject calls with source-owned owner authority."
    - from: "src/modules/protected-action/contact-follow-up.functions.ts"
      to: "convex/protectedActions.ts"
      via: "sourceMutation/sourceQuery references named protectedActions:*."
    - from: "convex/protectedActions.ts"
      to: "src/modules/protected-action/internal/contact-follow-up.ts"
      via: "durable adapter loads table state, calls selected-action pure functions, and persists resulting rows."
    - from: "convex/protectedActions.ts"
      to: "protectedAction* tables and auditEvents"
      via: "indexed ctx.db queries/inserts/patches with args/returns validators."
---

<objective>
Close the Phase 4 verifier gaps in `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md` without broadening beyond the selected `contact-follow-up` action.

Purpose: convert the existing selected-action pure module and route shells into a durable production-scope owner-approved runtime while preserving D-01 through D-15.
Output: one gap-closure implementation path covering Convex/server persistence, owner decision wiring, one-use attempt persistence, reconstruction readbacks, policy/edge tests, populated E2E/a11y, and evidence boundaries.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md
@.planning/phases/04-owner-pending-protected-actions/04-SPEC.md
@.planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md
@.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
@.planning/phases/04-owner-pending-protected-actions/04-01-SUMMARY.md
@convex/protectedActions.ts
@convex/authz.ts
@convex/inquiries.ts
@src/lib/server/convex-source.ts
@src/modules/inquiries/inquiry.functions.ts
@src/modules/protected-action/internal/contact-follow-up.ts
@src/modules/protected-action/internal/schema.ts
@src/routes/owner.actions.tsx
@src/routes/owner.actions.$proposalId.tsx
@src/routes/admin.protected-actions.tsx
</context>

<source_audit>
| Source | ID | Requirement or decision | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | - | One observed consequential action can be proposed, policy-checked, owner-approved/rejected, attempted, and reconstructed without autonomous execution or money movement. | 04-02 | COVERED | Tasks 1-3 close the six verifier gaps while preserving selected `contact-follow-up`. |
| REQ | R1 | Single action-class decision. | 04-02 | COVERED | Stop conditions forbid changing `04-ACTION-SELECTION.md` away from `contact-follow-up`. |
| REQ | R2 | Durable selected proposal contract. | 04-02 | COVERED | Task 1 persists proposal/policy/audit/idempotency rows. |
| REQ | R3 | Policy/lifecycle classification edge matrix. | 04-02 | COVERED | Tasks 1 and 3 add durable no-side-effect assertions and policy tests. |
| REQ | R4 | Owner decision UI/server wiring. | 04-02 | COVERED | Task 2 wires server loaders and approve/reject POST actions. |
| REQ | R5 | Provider/internal attempt and proof-gap readback after one-use gateway. | 04-02 | COVERED | Task 1 persists gateway consumption, attempt, receipt/proof-gap/failed states, retry, retry-exhausted, and no-repair. |
| REQ | R6 | Reconstruction readback. | 04-02 | COVERED | Tasks 1 and 2 mount owner/admin readbacks over durable source state. |
| REQ | R7 | Discovery wording only as owner-pending. | 04-02 | COVERED | Task 3 reruns copy/UI/SEO/source scans and keeps claims gated. |
| REQ | R8 | Closeout edge proof. | 04-02 | COVERED | Task 3 owns the complete command suite and evidence boundary. |
| CONTEXT | D-01 | Completed P4 means one protected action works in production scope. | 04-02 | COVERED | Task 1 durable runtime plus Task 2 mounted UI. |
| CONTEXT | D-02 | Action selection from real P2/P3 evidence. | 04-02 | COVERED | Uses existing `04-ACTION-SELECTION.md`; no reselection. |
| CONTEXT | D-03 | Do not invent a broad platform if evidence is weak. | 04-02 | COVERED | Stop conditions prohibit catalogs/registry/provider marketplaces. |
| CONTEXT | D-04 | External interface is selected-action-specific. | 04-02 | COVERED | Tasks require ContactFollowUp names only. |
| CONTEXT | D-05 | Own exact contract hash, actor/target/owner context, idempotency, policy, decision, gateway, attempt, receipt/proof-gap, audit, repair/no-repair. | 04-02 | COVERED | Task 1 owns persistence for each row class. |
| CONTEXT | D-06 | No generic registry, marketplace, provider plug-in system, or action DSL. | 04-02 | COVERED | Stop conditions and source scans. |
| CONTEXT | D-07 | Proposal command cannot execute providers. | 04-02 | COVERED | Task 1 policy/proposal tests assert no attempt writes before approval. |
| CONTEXT | D-08 | Policy has no side effects and typed states. | 04-02 | COVERED | Task 3 policy matrix. |
| CONTEXT | D-09 | Owner decision requires source-owned owner access and visible consequence details. | 04-02 | COVERED | Task 2 route/server wiring and E2E/a11y. |
| CONTEXT | D-10 | Attempt only after approval plus one-use gateway; edge states reconstructable. | 04-02 | COVERED | Task 1 attempt/gateway persistence. |
| CONTEXT | D-11 | Provider success is evidence, not authority. | 04-02 | COVERED | Task 1 receipt/proof-gap readbacks and Task 2 admin reconstruction. |
| CONTEXT | D-12 | Physical-world proof beyond readback is never claimed. | 04-02 | COVERED | Task 3 copy/evidence gates. |
| CONTEXT | D-13 | Bounded retries only with idempotent state and visible retry/no-repair readback. | 04-02 | COVERED | Task 1 retry tests. |
| CONTEXT | D-14 | Discovery may describe selected action only after server behavior exists. | 04-02 | COVERED | Task 3 evidence boundary. |
| CONTEXT | D-15 | Copy/protocol scans fail on autonomous/callable/direct/provider/money claims. | 04-02 | COVERED | Task 3 exact scan commands. |
| RESEARCH | - | No RESEARCH.md for this phase. | 04-02 | COVERED | Not applicable. |
</source_audit>

<file_ownership>
This plan owns only the files listed in frontmatter. Do not edit `.planning/ROADMAP.md`, `.planning/STATE.md`, Phase 2/3/5 artifacts, broad discovery protocol files, billing files, provider marketplace files, or future-phase directories. Do not stage, commit, push, or mutate git refs/indexes.
</file_ownership>

<stop_conditions>
- Stop before implementation if a requested fix requires adding a second action class or changing `selectedActionSlug` away from `contact-follow-up`.
- Stop if durable owner authority cannot be derived from `ctx.auth.getUserIdentity()` plus the `owners.by_clerkUserId` source row; do not accept browser-supplied owner authority.
- Stop if the path needs generic action catalogs, action registries, provider marketplaces, descriptor authority, autonomous execution, MCP/OpenAPI/SDK mutation authority, or money rails.
- Stop if a mounted route would keep reading an empty test fixture instead of a server-backed source readback.
- Stop if deployed evidence env/source state is absent; record no deployed claim in `04-02-SUMMARY.md` and do not create or update deployed proof as if it passed.
</stop_conditions>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add durable contact-follow-up Convex and server runtime</name>
  <files>convex/protectedActions.ts, src/modules/protected-action/contact-follow-up.functions.ts, src/modules/protected-action/public.ts, src/modules/protected-action/internal/contact-follow-up.ts, src/modules/protected-action/internal/gateway.ts, src/modules/protected-action/internal/schema.ts, tests/unit/convex/protected-actions-runtime.test.ts, tests/unit/server/protected-action-server-seams.test.ts, tests/unit/protected-action/selected-action-gateway.test.ts</files>
  <behavior>
    - Durable proposal: valid `proposeContactFollowUpRequest` persists one `protectedActionProposals` row, one `protectedActionPolicyDecisions` row when evaluated, audit events, idempotency/correlation fields, actor principal, owner context, target, canonical hash, proposal hash, deadline, proof expectation, and only the `contact-follow-up` parameter allowlist per R2/D-04/D-05/D-07.
    - Owner authority: Convex queries/mutations derive the owner from Clerk identity plus `owners.by_clerkUserId`; wrong-owner, missing-auth, and no-owner rows return typed denial without leaking protected-action rows per R4/D-09.
    - Policy: review_required, refused, expired, proof_gap, missing_proof, external_authority, and time_bound classify deterministically and do not insert gateway, attempt, receipt, private-evidence, or provider/internal readback rows per R3/D-08.
    - Attempt: approval plus one-use gateway is required before attempt; duplicate, stale, concurrent consume, expired gateway, downstream timeout, mismatch, failure, proof-gap, receipt, bounded retry, retry-exhausted, and no-repair persist typed reconstruction rows per R5/D-10/D-13.
  </behavior>
  <action>Implement selected-action Convex functions in `convex/protectedActions.ts` using Convex object syntax, `args`, `returns`, explicit protected-action table names, indexed queries from `src/modules/protected-action/internal/schema.ts`, and `ConvexError` or typed error result objects for user-facing failures. Keep `readSelectedProtectedActionDescriptor` as read-only metadata only. Add public functions named for contact follow-up, including proposal, policy/read queue, read detail, approve/reject decision, gateway/attempt readback, retry, no-repair, owner receipt, and admin reconstruction; do not add route-facing generic proposal/action names. Build small load/persist helpers that map `protectedActionProposals`, `protectedActionPolicyDecisions`, `protectedActionOwnerDecisions`, `protectedActionGatewayAdmissions`, `protectedActionAttempts`, `protectedActionReceipts`, `protectedActionPrivateEvidenceRefs`, `protectedActionSupportRecords`, `auditEvents`, and any operation-key rows into `ContactFollowUpSourceState`, then persist only changed selected-action rows. Add `src/modules/protected-action/contact-follow-up.functions.ts` following the Phase 2 `src/modules/inquiries/inquiry.functions.ts` pattern: zod validators, `sourceQuery`/`sourceMutation` references named `protectedActions:*`, `createServerFn` wrappers, typed server results, `ConvexSourceError` handling, and a deterministic local E2E fixture that is visibly test-only. Ensure proposal/policy mutations never execute provider/internal attempts, and ensure attempt persistence consumes one gateway in the same mutation that records attempt/readback/audit. Use contact-follow-up names per D-04 and preserve D-06 by avoiding registries, catalogs, provider plug-ins, and action DSLs.</action>
  <verify>
    <automated>npm run test:unit -- tests/unit/protected-action tests/unit/convex/protected-actions-runtime.test.ts tests/unit/server/protected-action-server-seams.test.ts</automated>
    <automated>npm run typecheck</automated>
  </verify>
  <done>Convex/server runtime can create, decide, attempt, retry/no-repair, and reconstruct one contact-follow-up action from durable source tables with selected-action-only exports and no descriptor authority.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire mounted owner/admin routes to server readbacks and decisions</name>
  <files>src/routes/owner.actions.tsx, src/routes/owner.actions.$proposalId.tsx, src/routes/owner.actions.$proposalId.receipt.tsx, src/routes/admin.protected-actions.tsx, src/routes/admin.protected-actions.$proposalId.tsx, tests/integration/protected-action-route-readbacks.test.ts, tests/e2e/protected-action-owner-flow.spec.ts, tests/e2e/a11y/protected-action-a11y.spec.ts, tests/ui-contract/protected-action-status-copy.test.ts, tests/seo/protected-action-noindex.test.ts</files>
  <behavior>
    - Mounted owner queue/detail/receipt loaders call server read functions and render populated durable proposals without relying on an empty test fixture per R4/R6/D-01/D-09/D-11.
    - Owner approve/reject controls POST through `useServerFn` to the server decision mutation, require reason/evidence/consequence acknowledgement where applicable, surface typed wrong-owner/expired/refused/disabled states, and show audit-before-attempt readback per R4/D-09.
    - Admin list/detail routes call durable admin reconstruction queries and show redacted actor, proposal, policy, decision, gateway, attempt, receipt/proof-gap, audit events, private-evidence redaction, repair, no-repair, disputed, and reversed posture per R6/D-11/D-12.
    - Populated E2E/a11y covers approve, reject, disabled reason, expired/refused/wrong-owner, mobile, keyboard, focus, and no copy implying autonomous or money behavior per R7/R8/D-14/D-15.
  </behavior>
  <action>Replace mounted owner/admin route loaders with `contact-follow-up.functions.ts` server readbacks. Keep pure route helper functions for unit/integration tests, but mounted loaders must call server functions and return typed available/error/denied readbacks. In `src/routes/owner.actions.$proposalId.tsx`, wire approve and reject controls with `useServerFn`, stable operation/correlation data from the server-function layer, a visible consequence acknowledgement for approvals, reject reason capture, pending/error/success states, and focus recovery for validation errors. The UI must keep object, scope, consequence, reversibility, deadline, proof requirement, and disabled reason visible before approval per D-09. Ensure rejected proposals do not create gateway or attempt rows. Ensure approved proposals show gateway/attempt eligibility only after durable decision/audit state exists. Update admin routes to read from durable reconstruction and expose redacted hashes/readback statuses, not raw provider/private payloads. Update E2E/a11y tests to use the local E2E protected-action fixture from Task 1, exercise a populated queue/detail, click approve and reject paths, verify receipt/proof-gap/admin reconstruction readback, keyboard tab order, focused error recovery, compact 375px layout, disabled state copy, and wrong-owner/expired/refused surfaces. Keep route SEO noindex.</action>
  <verify>
    <automated>npm run test:integration -- tests/integration/protected-action-route-readbacks.test.ts</automated>
    <automated>npm run test:e2e -- --grep "selected protected action"</automated>
    <automated>npm run test:e2e:a11y -- --grep "selected protected action"</automated>
  </verify>
  <done>Owner/admin protected-action routes are mounted on durable server readbacks, approve/reject actually mutate source state, and populated browser/a11y tests prove the selected contact-follow-up flow.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Complete edge matrix, scans, build, and evidence boundary</name>
  <files>tests/unit/protected-action/owner-action-flow.test.ts, tests/unit/protected-action/selected-action-contract.test.ts, tests/unit/protected-action/selected-action-gateway.test.ts, tests/unit/protected-action/selected-action-policy.test.ts, tests/unit/convex/protected-actions-runtime.test.ts, tests/unit/server/protected-action-server-seams.test.ts, tests/integration/protected-action-route-readbacks.test.ts, tests/types/protected-actions-contracts.test.ts, tests/copy/phase4-protected-action-claims.test.ts, tests/ui-contract/protected-action-status-copy.test.ts, tests/seo/protected-action-noindex.test.ts, tests/e2e/protected-action-owner-flow.spec.ts, tests/e2e/a11y/protected-action-a11y.spec.ts, .planning/phases/04-owner-pending-protected-actions/04-DEPLOY-READBACK-EVIDENCE.md, .planning/phases/04-owner-pending-protected-actions/04-02-SUMMARY.md</files>
  <behavior>
    - Policy/attempt matrix includes duplicate, stale, concurrent, wrong-owner, expired, refused, missing_proof, external_authority, time_bound, proof_gap, timeout, mismatch, failed downstream, successful receipt, retry available, retry exhausted, no-repair, disputed, reversed, retention delete, and private-evidence redaction per R3/R5/R6/R8.
    - Type/copy/UI/SEO/source/import/standards gates prove selected-action-only literals, no broad action registry, no descriptor authority, no autonomous/direct execution, no provider marketplace, and no money behavior per R1/R7/D-06/D-14/D-15.
    - Deployed proof is captured only if required deployed env and a real source proposal/readback state exist; otherwise the summary states deployed Phase 4 proof is not claimed.
  </behavior>
  <action>Add or expand tests so verifier gaps P4-R2, P4-R3, P4-R4, P4-R5, P4-R6, and P4-R8 each have direct failing-then-passing coverage. Add `tests/unit/protected-action/selected-action-policy.test.ts` if it does not exist. Update type tests to cover any new server result unions and Convex DTO literal narrowing. Expand route-readback integration tests from one successful receipt path to missing, stale, failed, proof-gap, successful, disputed, reversed, retry available, retry exhausted, no-repair, retention delete, and private evidence redaction. Expand copy/source tests to fail any new route/server code that introduces broad action catalogs, generic action registry authority, autonomous execution, descriptor-as-authority, provider-market claims, or money behavior. Run the exact command suite below. If `DEPLOY_BASE_URL` and a real deployed contact-follow-up source proposal/readback identifier are present, create `.planning/phases/04-owner-pending-protected-actions/04-DEPLOY-READBACK-EVIDENCE.md` with only non-secret evidence: base URL, route paths, UTC timestamp, redacted proposal/readback IDs or hashes, response status, selected action slug, decision/readback status, audit event type names, and explicit statement that no secrets/raw provider payloads/customer contact payloads are stored. If those env/source inputs are absent, do not create a passing deployed proof artifact; record the absence in `04-02-SUMMARY.md` and do not make a public/deployed capability claim.</action>
  <verify>
    <automated>npm run typecheck</automated>
    <automated>npm run check:convex-codegen</automated>
    <automated>npm run test:unit -- tests/unit/protected-action tests/unit/convex/protected-actions-runtime.test.ts tests/unit/server/protected-action-server-seams.test.ts</automated>
    <automated>npm run test:integration -- tests/integration/protected-action-route-readbacks.test.ts</automated>
    <automated>npm run test:types -- tests/types/protected-actions-contracts.test.ts</automated>
    <automated>npm run test:copy -- tests/copy/phase4-protected-action-claims.test.ts</automated>
    <automated>npm run test:ui-contract -- tests/ui-contract/protected-action-status-copy.test.ts</automated>
    <automated>npm run test:seo -- tests/seo/protected-action-noindex.test.ts</automated>
    <automated>npm run test:source-mining</automated>
    <automated>npm run test:imports</automated>
    <automated>npm run test:ts-standards</automated>
    <automated>npm run build -- --logLevel error</automated>
    <automated>npm run test:e2e -- --grep "selected protected action"</automated>
    <automated>npm run test:e2e:a11y -- --grep "selected protected action"</automated>
  </verify>
  <done>All focused local/source gates pass, deployed proof is either captured with non-secret source-backed evidence or explicitly unclaimed, and `04-02-SUMMARY.md` maps every verifier gap to passing evidence without staging/committing/pushing.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| browser -> owner server function | Untrusted browser event submits approve/reject intent and reason/evidence. |
| owner server function -> Convex mutation | Authenticated server call crosses into source-owned durable persistence. |
| Convex mutation -> protectedAction tables | Consequential proposal, decision, gateway, attempt, receipt, and audit state are written. |
| admin route -> reconstruction query | Admin readback exposes redacted operational reconstruction. |
| provider/internal readback -> source state | Downstream outcome is evidence only and cannot mint authority. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-04-02-01 | Spoofing | `convex/protectedActions.ts` owner mutations | high | mitigate | Resolve owner from `ctx.auth.getUserIdentity()` plus `owners.by_clerkUserId`; ignore browser owner authority and return typed denied readbacks. |
| T-04-02-02 | Tampering | proposal/decision/attempt input | high | mitigate | Validate args/returns, canonical hashes, idempotency keys, correlation IDs, allowed parameters, consequence acknowledgement, and selected `contact-follow-up` slug before writes. |
| T-04-02-03 | Repudiation | owner approve/reject and attempt | high | mitigate | Persist audit events before attempt state, with actorRef, operation key, correlation ID, proposal/policy/decision/gateway/attempt hashes, and redacted evidence refs. |
| T-04-02-04 | Information Disclosure | owner/admin readbacks | medium | mitigate | Return redacted readbacks only; tests assert no raw provider payload, private evidence, or customer contact payload in admin/owner routes. |
| T-04-02-05 | Denial of Service | retry/attempt path | medium | mitigate | Bound retries through idempotent attempt state, retry-exhausted, attempts-disabled operator control, and no-repair readback. |
| T-04-02-06 | Elevation of Privilege | descriptor or route shell treated as authority | high | mitigate | Keep descriptor read-only; mounted routes call server functions; source/copy/import scans reject generic action authority and direct execution. |
| T-04-02-SC | Tampering | npm installs | high | accept | No package-manager install task is planned; no package legitimacy checkpoint is required. |
</threat_model>

<verification>
Run the command suite exactly as listed in Task 3. `npm run check:convex-codegen` may need network access to Convex/Sentry; if sandboxed DNS/network fails, rerun with approved network escalation and record both outputs. Playwright may need local-server permission; if sandboxed listen fails, rerun with approved local-server escalation and record both outputs. Do not stage, commit, or push.
</verification>

<success_criteria>
- P4-R2, P4-R3, P4-R4, P4-R5, P4-R6, and P4-R8 verifier gaps have direct tests and source evidence.
- Mounted `/owner/actions`, `/owner/actions/$proposalId`, `/owner/actions/$proposalId/receipt`, `/admin/protected-actions`, and `/admin/protected-actions/$proposalId` read durable source data and do not rely on empty route defaults.
- Approve/reject are functional POST/server paths with source-owned owner authority and visible consequence/disabled readbacks.
- One-use gateway and attempt readback are persisted atomically with audit and bounded retry/no-repair state.
- Reconstruction readbacks cover success, failure, proof gap, missing/stale, disputed/reversed posture, retention delete, and private-evidence redaction.
- No broad action catalogs, generic action registry, money rails, autonomous execution, provider marketplace, descriptor authority, staging, commits, or pushes are introduced.
</success_criteria>

<output>
Create `.planning/phases/04-owner-pending-protected-actions/04-02-SUMMARY.md` when done. If deployed env/source state exists and proof is captured, create `.planning/phases/04-owner-pending-protected-actions/04-DEPLOY-READBACK-EVIDENCE.md`; otherwise state clearly in the summary that deployed Phase 4 proof is not claimed.
</output>
