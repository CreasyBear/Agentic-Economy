---
phase: 03c-hosted-paid-operation-product-trial
plan: 05
type: execute
wave: 5
depends_on: [03C-04]
files_modified:
  - src/components/ae/action-invocation/AePaidOperationCard.tsx
  - tests/ui-contract/hosted-paid-operation-contract.test.tsx
  - tests/e2e/paid-operation-hosted-sandbox.spec.ts
  - playwright.paid-operation-hosted.config.ts
autonomous: true
requirements: [P3C-R3, P3C-R4, P3C-R7, P3C-R8, P3C-R10]
must_haves:
  truths:
    - "The D-03 Action detail explains task, provider, one-cent maximum, disclosed data, payment/result truth, evidence class, and only safe action in ordinary language."
    - "The D-06 paid-operation renderer remains query/provider agnostic and renders a non-BTC paid-operation fixture without claiming non-paid Action compatibility."
    - "The forward golden path is independently visible and every D-07 goblin branch names its safe rejoin or visible stop."
    - "Reload and cold restore are accessible and never expose retry or provider change during uncertainty."
  artifacts:
    - path: "tests/ui-contract/hosted-paid-operation-contract.test.tsx"
      provides: "Closed-block, no-branch, parity, and accessibility contract"
    - path: "tests/e2e/paid-operation-hosted-sandbox.spec.ts"
      provides: "Protected browser state/recovery eval"
  key_links:
    - from: "AePaidOperationCard.tsx"
      to: "agentic-paid-operation:v1"
      via: "closed paid-operation presentation blocks and command descriptors"
---
<objective>
Make the protected hosted-sandbox operation understandable and controllable under the approved UI contract.

Purpose: Turn durable semantics into an accessible product experience without BTC/x402/provider branches or optimistic lifecycle state.
Output: Paid-operation card adjustments only where REDs require them, UI-contract tests, and protected Playwright evals.
</objective>
<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>
<context>
@DESIGN.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
@src/components/ae/action-invocation/AePaidOperationCard.tsx
@tests/e2e/paid-operation-development-surface.spec.ts
</context>
<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Lock paid-operation presentation and accessibility contracts</name>
  <files>tests/ui-contract/hosted-paid-operation-contract.test.tsx, src/components/ae/action-invocation/AePaidOperationCard.tsx</files>
  <behavior>
    - "Only the seven closed presentation block kinds render; executable, HTML and Markdown payloads fail closed."
    - "A non-BTC conformant fixture renders through the same card with no query, crypto, x402 or provider-ID branches."
    - "One h1 host, one h2 card title, ordered h3 sections, semantic facts/provider fieldset, persistent labels, text+icon status, 44px targets, focus, live region and technical disclosure meet the UI spec."
    - "Environment, provenance, evidence class and claim ceiling render from runtime/source inputs; Plan 05 fixtures remain local_labelled_sandbox_fixture and never claim hosted readback."
  </behavior>
  <action>Write the UI-contract REDs first. Consume only the frozen typed host inputs from Plan 04. Modify AePaidOperationCard only for query- and provider-agnostic behavior within the paid-operation class, using Astryx neutral and the semantic bridge; preserve the non-BTC paid-operation fixture. Do not claim generic Action compatibility. Lock the reading order and reserved Ready for permission/Payment prepared labels. Preserve one atomic status region, no optimistic payment/result, bounded pending state and read-only reload after ambiguity. Render environment/provenance/evidence class exactly from source inputs. Local fixtures must use `local_labelled_sandbox_fixture`; reject hard-coded or prematurely hosted labels. Owned paths are exactly listed. Forbidden: setup/provider selection, host command construction, route lifecycle, BTC/crypto/x402/provider branching, non-paid action imports, model-generated UI, raw payloads, ranking/comparison, Activity. RED/falsifier: host/card inputs require improvisation, non-BTC paid render fails, booking/inquiry/dispatch/communication/cancellation imports a paid DTO/panel, local fixture emits hosted evidence, unsafe block renders, or uncertainty offers anything except reconcile. Commands: UI contract, existing card/projection tests, copy. Evidence: source/UI fixture checks only. Ceiling: local paid-operation renderer and automated accessibility mechanics, not hosted/screen-reader/customer evidence. Stop if shared behavior requires another action class or Plan 04 overlap. Handoff uses required schema.</action>
  <verify><automated>npm run test:ui-contract &amp;&amp; npm run test -- tests/unit/action-invocation/paid-operation-card.test.tsx tests/unit/action-invocation/paid-operation-projection.test.ts &amp;&amp; npm run test:copy</automated></verify>
  <done>The closed paid-operation renderer passes the non-BTC, forward golden-path and every goblin-path contract with exact labels and only safe commands, without claiming non-paid Action compatibility.</done>
</task>
<task type="auto" tdd="true">
  <name>Task 2: Exercise the protected browser loop and recovery states</name>
  <files>tests/e2e/paid-operation-hosted-sandbox.spec.ts, playwright.paid-operation-hosted.config.ts</files>
  <behavior>
    - "Authentication return, evaluator-only Sandbox setup selection, source-owned creation, consequence review, permission-recorded/not-submitted, execute-once and completed restore form one forward golden path."
    - "Prepared/refused/possibly-submitted/unknown/invalid/reconciled/duplicate/stale/admission/read-error/ambiguous/reload/cold-restore goblin paths expose one safe rejoin or visible stop."
    - "Focus moves after user actions only; one live region, visible focus, 44px targets, 320px reflow, declared 400% zoom check, and reduced motion pass."
    - "Digest and expected version match after every transition; reload/cold restore create zero signatures, sends, invocations, or effect generations."
  </behavior>
  <action>Add a dedicated config/spec from protected `/actions/paid/new` Sandbox setup through `/actions/paid/:invocationRef` using local labelled fixtures and real application seams. Assert `/` is unchanged. Run the forward golden tape: evaluator provider selection outside the card, source-bound consequence review, authorize, permission-recorded/not-submitted, execute once, separated result truth, reload and cold restore. Then inject each named goblin at its exact branch point and assert its sole rejoin/stop. Test equivalent evaluator agent create/inspect/command truth; public reconcile sends only command, commandId and expectedInvocationVersion while trusted evidence is injected internally. Assert locked card reading order, pending state, ambiguous read-only recovery, reserved labels, runtime evidence labels, bounded polling and zero replay. Every browser/fixture result is explicitly `local_labelled_sandbox_fixture`; `authenticated_exact_revision_hosted_sandbox` is forbidden in this plan. Owned paths exactly listed. Forbidden: `/` changes, real endpoints/payment, deployment, generic discovery/action APIs, comparison/fallback, secret snapshots, dashboards. RED/falsifier: setup enters card, a golden step is reordered, goblin lacks rejoin/stop, external reconcile supplies evidence, local fixture claims hosted, unsafe continuation, replay, focus theft, overflow, counter drift or digest divergence. Commands: dedicated Playwright plus UI contract. Evidence: local browser labelled sandbox only. Stop at earliest unsupported durable transition. Follow the runbook handoff.</action>
  <verify><automated>npx playwright test --config=playwright.paid-operation-hosted.config.ts tests/e2e/paid-operation-hosted-sandbox.spec.ts &amp;&amp; npm run test:ui-contract</automated></verify>
  <done>The protected local browser loop passes all lifecycle, recovery, semantic parity and declared accessibility mechanics without duplicate effects.</done>
</task>
</tasks>
<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| Semantic projection → browser | Closed presentation data must contain no secrets or executable content |
| Browser command → server | UI intent is untrusted and cannot create truth |
## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-17 | Information disclosure | Browser projection | critical | mitigate | Closed schema and negative secret/snapshot tests |
| T-03C-18 | Tampering | Rendered commands | high | mitigate | Render only server-issued descriptors/version |
| T-03C-19 | Denial of service | Polling | medium | mitigate | Bounded inspect-only polling |
| T-03C-20 | Spoofing | Optimistic state | high | mitigate | Render durable server semantics only |
</threat_model>
<verification>Run source/UI and protected-browser evals; inspect every state’s sole continuation, digest/version, effect counters, focus/live-region output, responsive layout, and claim labels.</verification>
<success_criteria>End with focused local UI/browser evidence and explicit accessibility/comprehension limits. Any operation-specific shared branch or retry during uncertainty is a hard stop.</success_criteria>
<output>Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md` with the required handoff schema.</output>
