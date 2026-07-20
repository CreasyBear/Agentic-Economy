---
phase: 03c-hosted-paid-operation-product-trial
plan: 02
type: execute
wave: 2
depends_on: [03C-01]
files_modified:
  - src/modules/action-invocation/internal/convex-schema.ts
  - src/modules/action-invocation/hosted-paid-operation-port.ts
  - src/modules/action-invocation/hosted-paid-operation-composition.ts
  - convex/hostedPaidOperation.ts
  - tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts
requirements: [P3C-R1, P3C-R3, P3C-R7]
autonomous: true
must_haves:
  truths:
    - "A fresh process reconstructs one D-02 semantic object and only safe continuation from bounded durable records."
    - "Possible submission is durable before provider release and duplicate/stale commands create no second effect generation."
    - "Business/source facts do not become competing neutral-control truth."
  artifacts:
    - path: "src/modules/action-invocation/hosted-paid-operation-port.ts"
      provides: "Typed durable aggregate and persistence port"
    - path: "convex/hostedPaidOperation.ts"
      provides: "Indexed atomic hosted persistence handlers"
    - path: "tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts"
      provides: "Fresh-process, CAS, bounded-read, and leakage proof"
  key_links:
    - from: "convex/hostedPaidOperation.ts"
      to: "PaidOperationApplicationService"
      via: "one loaded aggregate; no new lifecycle"
---

<objective>
Implement the durable hosted composition boundary required by ADR-021 and D-02.

Purpose: Make reconstruction and duplicate safety source-owned before any route exists.
Output: Bounded schema, atomic handlers, hosted aggregate adapter, and passing persistence REDs.
</objective>

<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@convex/_generated/ai/guidelines.md
@.planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-01-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
@src/modules/action-invocation/internal/convex-schema.ts
@convex/actionInvocationControl.ts
@src/modules/action-invocation/paid-operation-application-service.ts
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Add bounded source/payment/evidence persistence</name>
  <files>src/modules/action-invocation/internal/convex-schema.ts, src/modules/action-invocation/hosted-paid-operation-port.ts, convex/hostedPaidOperation.ts, tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts</files>
  <behavior>
    - "Owner-indexed loads return bounded source, attempt, authorization, evidence-reference, and control records."
    - "Expected version, command digest, and effect generation fence every mutation atomically."
    - "Prepared and submission-started facts persist before their corresponding release boundary."
    - "Raw custody and raw evidence material are rejected."
  </behavior>
  <action>Read the Convex guidelines completely before editing. Implement ADR-021 tables as separate indexed child records rather than growing arrays. Store business/provider/source material in the source-owned hosted record and keep control limited to continuity. Define exact indexed lookup order: owner+invocation header, exact selected source, current authority, current attempt/effect generation, current payment attempt/authorization, evidence references, then history pages. Fix explicit per-child caps and a cursor-based history page size; cap+1 or a missing required child returns typed `aggregate_incomplete` and never a partial semantic object. Add atomic version/digest/generation dedupe/CAS and atomic evaluator admission counters for allowlist, kill switch, per-principal total, concurrency, and rate window, separate from consequence authority. Persist only opaque custody/evidence references. Owned paths are exactly listed. Forbidden paths: semantics, projection/card, provider fixtures, routes/auth, package/workflows. RED/falsifier: partial/cap+1 aggregate projects, exhausted or concurrent admission oversubscribes, duplicate delivery changes effect count, a query is unbounded, or secret-shaped material serializes. Commands: `npm run test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/convex-handler-contract.test.ts`; `npm run check:convex-codegen`. Evidence: local Convex fixture mechanics only. Stop if durable-before-release is impossible, business truth moves to control, or codegen requires a control-plane call. Follow the agent runbook and expanded handoff.</action>
  <verify><automated>npm run test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/convex-handler-contract.test.ts &amp;&amp; npm run check:convex-codegen</automated></verify>
  <done>All persistence REDs pass with indexed bounded reads, atomic fences, opaque custody, and no competing control-plane business copy.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Reconstruct through the unchanged application service</name>
  <files>src/modules/action-invocation/hosted-paid-operation-composition.ts, tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts</files>
  <behavior>
    - "One async aggregate load feeds the existing synchronous PaidOperationApplicationService."
    - "Fresh-process reconstruction produces the same semantic digest, version, truth, and continuation."
    - "Uncertainty produces reconcile and never retry, execute, fallback, or provider switch."
  </behavior>
  <action>Create a thin request-scoped composition root. It loads the complete bounded aggregate once for inspect; after every successful command transition it rereads and replaces the full aggregate before returning semantics, including payment attempt and history-page metadata. Do not let the unchanged synchronous service reconstruct from stale pre-command ports and do not duplicate lifecycle rules. Prove warm/cold and post-command digest, version, payment truth, and continuation equality. Owned paths are the two listed. Forbidden: routes/components/shared semantics/provider fixtures and changes to the existing application service unless ADR-021 proves them unavoidable. RED/falsifier: stale post-command projection, partial aggregate projection, cold mismatch, route-like orchestration, or uncertainty yields more than reconcile. Commands: focused persistence/application/projection tests, imports, typecheck. Evidence: local durable-fixture reconstruction only. Stop at duplicated lifecycle or `aggregate_incomplete`. Follow the agent runbook and expanded handoff.</action>
  <verify><automated>npm run test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/paid-operation-application-service.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts &amp;&amp; npm run test:imports &amp;&amp; npm run typecheck</automated></verify>
  <done>A separate process can recreate the exact shared semantic projection and only permitted continuation without process, transcript, route, or component memory.</done>
</task>
</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| Convex mutation → external release | Durable submission intent must precede any possible effect |
| Durable rows → projection | Only a complete owner-bound aggregate may create semantics |
| Custody → persistence | Only opaque references cross |

## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-05 | Tampering | Command CAS | critical | mitigate | Expected version, digest and generation enforced atomically |
| T-03C-06 | Repudiation | Attempt/event history | high | mitigate | Attributable append-only bounded child records |
| T-03C-07 | Information disclosure | Stored custody/evidence | critical | mitigate | Opaque references plus negative serialization tests |
| T-03C-08 | Denial of service | Child-record reads | medium | mitigate | Exact indexes and bounded take limits |
</threat_model>

<verification>Run the focused persistence/application tests from a fresh process and inspect reconstructed semantic digest, continuation, record counts, and zero duplicate effect generation.</verification>
<success_criteria>End with passing local durable reconstruction and CAS evidence. Stop rather than route around an incomplete aggregate or issue hosted calls.</success_criteria>
<output>Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-02-SUMMARY.md` with `{baseRevision, ownedPaths, forbiddenPaths, commands, results, observableOutcome, REDDisposition, evidenceClass, claimCeiling, remainingFailure, nextDecision}`.</output>
