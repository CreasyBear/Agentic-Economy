---
phase: 03c-hosted-paid-operation-product-trial
plan: 04
type: execute
wave: 4
depends_on: [03C-03]
files_modified:
  - src/lib/server/hosted-paid-operation-human-api.ts
  - src/lib/server/hosted-paid-operation-agent-auth.ts
  - src/lib/server/hosted-paid-operation-agent-api.ts
  - src/routes/actions.paid.new.tsx
  - src/routes/actions.paid.$invocationRef.tsx
  - src/routes/api.v1.paid-operations.ts
  - src/routes/api.v1.paid-operations.$invocationRef.ts
  - src/routes/api.v1.paid-operations.$invocationRef.commands.ts
  - tests/unit/server/hosted-paid-operation-api.test.ts
  - tests/unit/server/hosted-paid-operation-agent-auth.test.ts
  - tests/unit/server/hosted-paid-operation-creation-api.test.ts
autonomous: true
requirements: [P3C-R2, P3C-R3, P3C-R4, P3C-R5, P3C-R7, P3C-R10]
must_haves:
  truths:
    - "Authenticated human and paid-operation-scoped agent identities reach the same D-02 application service and semantic digest."
    - "Expected version and command admission occur before mutation; missing/cross-principal reads disclose no operation facts."
    - "Routes are transport adapters and accept no caller authority, provider material, semantic digest, continuation, or reconciliation result."
    - "Authenticated evaluator setup creation accepts only a closed providerKey selector; the source binds provider, actor, BTC/USD, $0.01 ceiling, invocationRef, authority, payment, and effect identities."
    - "The typed host/card boundary is frozen before Plan 05 and keeps provider setup outside AePaidOperationCard."
  artifacts:
    - path: "src/lib/server/hosted-paid-operation-human-api.ts"
      provides: "Session-bound human read/command adapter"
    - path: "src/lib/server/hosted-paid-operation-agent-api.ts"
      provides: "Closed structured-agent read/command adapter"
    - path: "src/routes/actions.paid.$invocationRef.tsx"
      provides: "Protected Action detail host"
    - path: "src/routes/api.v1.paid-operations.$invocationRef.ts"
      provides: "Authenticated structured inspect resource"
    - path: "src/routes/api.v1.paid-operations.ts"
      provides: "Authenticated evaluator setup/create resource"
  key_links:
    - from: "human and agent handlers"
      to: "hosted-paid-operation-composition.ts"
      via: "same loaded semantic object and digest"
---
<objective>
Expose the D-03 protected Action detail and D-04 structured-agent resource through one authenticated application boundary.

Purpose: Prove transport parity without giving either caller a second lifecycle or consequence authority.
Output: Thin session/API-key adapters, routes, and typed auth/transport tests.

Execution constraint: One executor owns this entire plan and performs Task 1
before Task 2. Do not parallelize the eleven files in `files_modified`.
Authentication, creation/read/command handlers, route DTOs, typed outcomes and
their shared tests form one tightly coupled transport contract. Splitting them
would give multiple executors overlapping ownership of handler/auth contracts
and the same contract tests, creating merge ambiguity at the authority boundary.
</objective>
<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>
<context>
@.planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-03-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
@src/lib/server/require-operator-session.ts
@src/lib/server/customer-request-agent-auth.ts
@src/modules/action-invocation/paid-operation-application-service.ts
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md
</context>
<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Build authenticated application adapters</name>
  <files>src/lib/server/hosted-paid-operation-human-api.ts, src/lib/server/hosted-paid-operation-agent-auth.ts, src/lib/server/hosted-paid-operation-agent-api.ts, tests/unit/server/hosted-paid-operation-api.test.ts, tests/unit/server/hosted-paid-operation-agent-auth.test.ts, tests/unit/server/hosted-paid-operation-creation-api.test.ts</files>
  <behavior>
    - "Human session and least-privilege agent key derive principal/owner/credential server-side."
    - "Unauthenticated is 401/no facts; human missing/cross-owner share 404; agent cross-owner is non-enumerating or uses the same 404 unless reviewed safe."
    - "Stale version is 409 with current expected version and inspect relation; no command runs."
    - "Disallowed command and invalid input are typed and non-mutating; read outage is 503 and never implies operation failure."
    - "Both adapters return the same semantic digest, version, environment, provenance, evidence class and claim ceiling."
    - "Both evaluator setup/create adapters accept only {providerKey}; authenticated actor and every consequence field and identity are server-derived."
    - "The host supplies typed disclosure, command, pending, ambiguity, truth, continuation, evidence and technical-detail inputs without renderer inference."
  </behavior>
  <action>Single sequential executor follows the order in `03C-AGENT-RUNBOOK.md`; no Plan 04 path is parallelized. Implement only the ADR-021 source-proven auth bridge. Never accept caller owner/principal. Human session and paid-operation-agent scope map least privilege and remain separate from consequence authority and evaluator admission. Thin evaluator setup creation accepts only `{providerKey}` and lets the source own provider material, BTC/USD, $0.01, actor, authority, payment and effect lineage. Command bodies carry command, commandId, expectedInvocationVersion and decision input only. Public reconcile is exactly intent-only; if the application service still exposes evidence in its public type, stop until Plan 01's internal/public split exists. After mutation, use Plan 02's refreshed aggregate. Freeze the UI-SPEC host/card contract as typed server adapter output: disclosure summary; authorize/refuse descriptors; pending command identity; ambiguous-transport inspect recovery; separate payment/settlement/result truth; one safe continuation; operation blocks; runtime-supplied evidence labels; technical details. Reserve `Ready for permission` for pre-authority and `Payment prepared` for durable authorization. Define the error/rescue registry as specified. Owned paths exactly as frontmatter. Forbidden: caller identity/evidence, provider selection inside AePaidOperationCard, lifecycle rules, Customer Request authority, shared renderer edits, anonymous access, dashboard. RED/falsifier: public reconcile evidence field, setup bypass, auth/IDOR failure, stale mutation, host/card typed input missing, evidence label hard-coded, or raw event field. Commands: focused server/auth/creation tests. Evidence: local authenticated fixtures only. Stop at an unavailable bridge/credential owner, unsplit reconcile type, identity-as-authority, or overlapping Plan 05 ownership. Follow the expanded handoff.</action>
  <verify><automated>npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-agent-auth.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts</automated></verify>
  <done>The complete authentication and typed-outcome matrix passes, and both adapters return identical shared semantics without caller-manufactured truth.</done>
</task>
<task type="auto" tdd="true">
  <name>Task 2: Mount thin human and structured-agent routes</name>
  <files>src/routes/actions.paid.new.tsx, src/routes/actions.paid.$invocationRef.tsx, src/routes/api.v1.paid-operations.ts, src/routes/api.v1.paid-operations.$invocationRef.ts, src/routes/api.v1.paid-operations.$invocationRef.commands.ts, tests/unit/server/hosted-paid-operation-api.test.ts, tests/unit/server/hosted-paid-operation-creation-api.test.ts</files>
  <behavior>
    - "Protected human navigation redirects to sign-in and returns to the exact operation."
    - "Agent inspect and command resources preserve handler status/body contracts."
    - "Protected evaluator Sandbox setup and agent collection POST accept only providerKey and navigate to the server-generated invocationRef."
    - "Provider selection remains outside AePaidOperationCard; / remains unchanged canonical product IA."
    - "A transport failure after command yields read-only reload/inspect guidance and never command replay."
  </behavior>
  <action>Continue with the same executor. Mount `/actions/paid/new` as protected evaluator-only Sandbox setup and `/actions/paid/:invocationRef` as reusable paid Action Detail. Leave `/` untouched and canonical. Setup owns only fixture selection and creation; it stays outside AePaidOperationCard and must not resemble Options or comparison. Mount agent collection POST creation plus inspect/command routes; do not add generic discovery. Creation accepts only providerKey and returns the server-generated inspect relation. Routes translate only and host the card with the frozen typed inputs from Task 1. Assert the locked reading order: current truth; separate payment/settlement/result; safe next action; operation/result blocks; evidence; technical details. Ambiguous transport becomes read-only inspect and never replay. Owned paths exactly as listed. Forbidden: route lifecycle/provider material/authority/reconciliation logic, `/` edits, generic discovery, marketplace/chat/Activity/public access/shared renderer changes. RED/falsifier: setup is exposed as canonical product IA, provider selection enters the card, action detail lacks frozen ordering, routes accept reconciliation evidence, route reconstructs state, or ambiguity replays. Commands: focused API/creation tests, imports, copy, typecheck. Evidence: local route fixtures only. Stop on second lifecycle, card/host ownership overlap, or caller-derived consequence. Follow the runbook handoff.</action>
  <verify><automated>npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts &amp;&amp; npm run test:imports &amp;&amp; npm run test:copy &amp;&amp; npm run typecheck</automated></verify>
  <done>Both protected routes are reachable in local fixtures, share the same digest/version, and contain no lifecycle or business rules.</done>
</task>
</tasks>
<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| Browser session/API key → handler | Authentication attributes actor; it is not consequence authority |
| HTTP body → command admission | Version and closed input are untrusted |
## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-13 | Spoofing | Principal fields | critical | mitigate | Derive from verified Clerk identity only |
| T-03C-14 | Information disclosure | Cross-owner lookup | high | mitigate | Owner-indexed read and non-enumerating response |
| T-03C-15 | Tampering | Stale/invalid command | critical | mitigate | Expected-version and closed-schema admission |
| T-03C-16 | Elevation of privilege | Agent scope | critical | mitigate | Dedicated least-privilege scope, separate from consequence authority |
</threat_model>
<verification>Exercise every typed response for both identities, compare digests/version/descriptors, and assert all refusal and transport-ambiguity counters remain unchanged.</verification>
<success_criteria>End with local authenticated evaluator setup/create/inspect/command parity and reusable paid Action Detail, produced by one sequential executor across the coupled transport paths. Stop if `/` changes, setup is treated as product IA, paths split across parallel owners, host/card ownership overlaps, an identity becomes authority, or cross-principal policy leaks facts.</success_criteria>
<output>Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md` with the required handoff schema.</output>
