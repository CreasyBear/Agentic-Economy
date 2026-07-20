---
phase: 03c-hosted-paid-operation-product-trial
plan: 03
type: execute
wave: 3
depends_on: [03C-02]
files_modified:
  - src/modules/action-invocation/hosted-paid-operation-creation.ts
  - src/modules/action-invocation/hosted-sandbox-effect-adapter.ts
  - src/modules/action-invocation/hosted-sandbox-reconciliation.ts
  - tests/unit/action-invocation/hosted-paid-operation-creation.test.ts
  - tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts
  - tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts
autonomous: true
requirements: [P3C-R1, P3C-R6, P3C-R7, P3C-R10]
must_haves:
  truths:
    - "Evaluator-only Sandbox setup accepts one closed fixture selector; the source resolves and durably binds the provider before authority."
    - "Switching safely terminal providers creates four distinct consequence identities per D-05."
    - "Reconciliation uses trusted sandbox evidence and uncertainty never sends, retries, or falls back per D-07."
  artifacts:
    - path: "src/modules/action-invocation/hosted-paid-operation-creation.ts"
      provides: "Source-owned creation and provider-switch boundary"
    - path: "src/modules/action-invocation/hosted-sandbox-reconciliation.ts"
      provides: "Trusted mock evidence observer"
  key_links:
    - from: "hosted-paid-operation-creation.ts"
      to: "hosted-paid-operation-composition.ts"
      via: "new server-derived aggregate"
---

<objective>
Add source-owned evaluator Sandbox creation/provider selection and trusted reconciliation while preserving D-05, D-07 and D-08.

Purpose: Prevent caller-selected consequences and turn uncertainty into a trusted check of the existing payment only.
Output: Creation and reconciliation ports with pairwise identity and zero-resend evals.
</objective>
<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>
<context>
@.planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-02-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
@src/modules/action-invocation/paid-operation-provider-selection.ts
@src/modules/action-invocation/reconciliation-evidence.ts
@src/modules/action-invocation/x402-payment-reconciliation-evidence.ts
</context>
<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Create a source-owned sandbox invocation from evaluator setup</name>
  <files>src/modules/action-invocation/hosted-paid-operation-creation.ts, tests/unit/action-invocation/hosted-paid-operation-creation.test.ts</files>
  <behavior>
    - "Only the admitted evaluator setup accepts either allowlisted mock provider key before authority."
    - "Server fixes BTC/USD and $0.01 USD, derives actor, and generates invocation/authority/payment/effect identities."
    - "Provider switch is allowed only after safe terminal truth and all four identities differ."
  </behavior>
  <action>Resolve the closed `providerKey` selector from the existing provider fixtures and persist a new aggregate via the hosted port before authority. Accept the selector only through the admitted evaluator setup adapter; treat it as fixture selection, never provider material, comparison or customer preference. Reject caller principal, authority, amount, currency, recipient, endpoint, digest, identity or continuation fields. A safely terminal switch calls creation anew; uncertainty exposes no setup or switch. Never rank, compare, recommend or fall back. Owned paths are the two listed. Forbidden: shared semantics/card/host projection, routes, provider fixture definitions/normalizers, Customer Request, neutral compiler/control rules. RED/falsifier: selection bypasses evaluator admission, provider selection enters the shared card, bound provider is absent before authority, switch reuses an identity, or Provider B receives activity during Provider A uncertainty. Commands: focused creation/provider selection tests. Expected: both evaluator fixture selections create exact consequence lineages; uncertainty leaves Provider B counters at zero. Evidence: labelled local hosted-composition fixtures. Ceiling: no hosted or provider proof. Stop on any need for a provider branch in shared code. Handoff uses required schema.</action>
  <verify><automated>npm run test -- tests/unit/action-invocation/hosted-paid-operation-creation.test.ts tests/unit/action-invocation/paid-operation-provider-selection.test.ts</automated></verify>
  <done>Both mock selections are source-resolved before authority and switching creates a wholly new consequence boundary without fallback.</done>
</task>
<task type="auto" tdd="true">
  <name>Task 2: Execute through one durable labelled-mock custody adapter</name>
  <files>src/modules/action-invocation/hosted-sandbox-effect-adapter.ts, tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts</files>
  <behavior>
    - "Tape order is custody prepared, prepared persisted, submission-started persisted, labelled mock release, then durable result or uncertainty."
    - "Every crash point reconstructs the exact safe continuation and never silently replays release."
    - "Operation-owned x402 facts bind target, recipient, amount/currency, payment ID, attempt, effect generation, and opaque custody reference."
  </behavior>
  <action>Implement the source-owned sandbox effect/custody adapter over the two existing labelled mocks. Persist prepared before authorization/submission, persist submission-started before possible release, call the selected mock exactly once, then persist normalized result or uncertainty. Never persist or log raw secrets, signatures, payment payloads, auth headers, provider responses, or trusted evidence. Emit bounded counters for prepared, submission-started, mock-release, result, uncertainty, duplicate/stale refusal, and unexpected effect. Owned paths are exactly the two listed. Forbidden: shared semantics/UI/routes, provider definitions/normalizers, real endpoints/credentials/payments, fallback, package/workflows, and control-plane calls. RED/falsifier: release precedes durable truth, a crash loses possible-submission truth, ambiguous recovery replays, raw material crosses storage/logging, or unexpected-effect is nonzero. Commands: `npm run test -- tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts tests/unit/action-invocation/x402-payment-execution.test.ts`; `npm run typecheck`. Evidence: labelled local mock custody/effect mechanics only. Stop on unavailable durable-before-release ordering, real endpoint resolution, raw-secret requirement, or uncertain replay. Follow `03C-AGENT-RUNBOOK.md` and its expanded handoff.</action>
  <verify><automated>npm run test -- tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts tests/unit/action-invocation/x402-payment-execution.test.ts &amp;&amp; npm run typecheck</automated></verify>
  <done>Every crash point preserves exact possible-effect truth and only the labelled mock can be released once.</done>
</task>
<task type="auto" tdd="true">
  <name>Task 3: Reconcile only through trusted sandbox evidence</name>
  <files>src/modules/action-invocation/hosted-sandbox-reconciliation.ts, tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts</files>
  <behavior>
    - "Client supplies reconciliation intent and expected version, never result facts."
    - "Trusted observer produces both bound evidence envelopes from fixture provenance."
    - "Unknown/invalid post-release states expose reconcile only and generate zero new signatures, sends, invocations, or effects."
  </behavior>
  <action>Implement an injected server/operator-only sandbox observer that derives attributable evidence for the existing attempt/generation/payment identifier and feeds existing validators; persist references/digests only. The public request is exactly `{command:"reconcile", commandId, expectedInvocationVersion}`; the response is typed `agentic-paid-operation:v1`, current version, and relations. Negative schema tests reject `evidence`, `resolution`, `settled`, `result`, `safeToRetry`, and unknown keys without mutation. Owned paths are the two listed. Forbidden: route/UI semantics, raw payload persistence/logging, caller/operator evidence crossover, retry/fallback, provider switching during uncertainty. RED/falsifier: fabricated client evidence resolves state or reconciliation emits another effect. Commands: focused reconciliation tests, existing x402 reconciliation, typecheck. Evidence: labelled trusted mock fixture only, not independent settlement. Stop if trusted provenance cannot be anchored or raw evidence must cross the durable/browser boundary. Follow the agent runbook and expanded handoff.</action>
  <verify><automated>npm run test -- tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts tests/unit/action-invocation/x402-payment-reconciliation.test.ts &amp;&amp; npm run typecheck</automated></verify>
  <done>Only the trusted sandbox observer can reconcile, and no uncertainty path retries, switches, or releases another effect.</done>
</task>
</tasks>
<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| Provider selector → source creation | Selector is untrusted; material is server-resolved |
| Reconcile intent → trusted observer | Caller cannot assert the observed result |
## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-09 | Tampering | Creation input | critical | mitigate | Closed selector and server-derived consequence |
| T-03C-10 | Elevation of privilege | Provider switch | high | mitigate | Safely-terminal gate and new authority |
| T-03C-11 | Spoofing | Reconciliation evidence | critical | mitigate | Injected trusted observer plus bound validators |
| T-03C-12 | Denial of service | Reconciliation | medium | mitigate | No resend/fallback; bounded existing-attempt check |
</threat_model>
<verification>Run both provider selections, an uncertain Provider A case, fabricated evidence, valid reconciliation, and switch-after-terminal; inspect all identity and effect counters.</verification>
<success_criteria>End with source-owned selection and trusted reconciliation at labelled local fixture evidence only; no shared-code provider branch and no retry path.</success_criteria>
<output>Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-03-SUMMARY.md` with the required handoff schema.</output>
