---
phase: 06-agentic-business-action-receipts
plan: "06-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/common/ids.ts
  - src/modules/business-action/public.ts
  - src/modules/business-action/internal/schema.ts
  - src/modules/business-action/internal/business-action.ts
  - tests/unit/business-action/business-action-contract.test.ts
  - tests/unit/business-action/mandate-request-checkpoint.test.ts
  - tests/unit/business-action/guardrail-decision-evidence.test.ts
  - tests/unit/business-action/hermes-evidence.test.ts
  - tests/unit/business-action/evidence-receipt-verifier.test.ts
  - tests/types/business-action-contracts.test.ts
autonomous: true
requirements: [P6-R1, P6-R2, P6-R3, P6-R4, P6-R5, P6-R7, P6-R8, P6-R9, P6-R13]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: p6-domain-single-slug
      statement: "Phase 6 domain exposes exactly one action slug, provision-paid-intake-endpoint, and rejects arbitrary slugs, provider other, generic executeAction, callable true, and paymentRequired true."
    - id: p6-owner-authority
      statement: "Buyer mandate and Hermes constrain/request only; accepted checkpoint requires source-owned business-owner approval."
    - id: p6-guardrail-separation
      statement: "GuardrailDecisionEvidence for NeMo/Nemotron allow and block/refusal is separate from post-checkpoint ExternalEvidenceEvent and never creates downstream consequence."
    - id: p6-hermes-positive-path
      statement: "Positive Hermes scopes/selects/requests/executes/reports evidence is admitted only after accepted checkpoint and appears in receipt reconstruction."
    - id: p6-result-artifact
      statement: "Success requires endpoint descriptor, JSON schema, and private endpoint/provisioning/payment-gate artifact ref; otherwise verifier reports proof_gap."
  artifacts:
    - path: src/modules/business-action/public.ts
      provides: "Only route-facing public seam for Phase 6 business actions."
    - path: src/modules/business-action/internal/business-action.ts
      provides: "Pure source-owned state machine and receipt verifier."
    - path: tests/unit/business-action/hermes-evidence.test.ts
      provides: "Positive Hermes-run evidence coverage."
  key_links:
    - from: BusinessActionCard
      to: CapabilityRequest
      via: "card version/source hash, mandate hash, request hash, idempotency key, and correlation ID."
    - from: GuardrailDecisionEvidence
      to: AuthorizationCheckpoint
      via: "policy/request/model/trace hashes before or at checkpoint without downstream consequence."
    - from: Hermes evidence
      to: ActionReceipt
      via: "accepted checkpoint-bound scopes/selects/requests/executes/reports refs."
---

<objective>
Create the pure source-owned Phase 6 domain for `provision-paid-intake-endpoint`: closed card, mandate, request, owner checkpoint, guardrail decision evidence, Hermes evidence contract, result artifact, receipt, verifier, and private/public redaction types.

Purpose: establish the authority and receipt spine before Convex persistence, Stripe evidence, routes, support controls, or public copy can exist.
Output: business-action module seam, pure domain implementation, and focused unit/type tests. Closeout must state `source/local proof only` and `production proof not claimed`.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/SECURITY-SPEC.md
@.planning/phases/06-agentic-business-action-receipts/06-SPEC.md
@.planning/phases/06-agentic-business-action-receipts/06-CONTEXT.md
@.planning/phases/06-agentic-business-action-receipts/06-DISCUSSION-LOG.md
@.planning/phases/06-agentic-business-action-receipts/06-RESEARCH.md
@.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md
@.planning/phases/06-agentic-business-action-receipts/06-FABLE-FOUNDATION-REVIEW.md
@src/modules/protected-action/public.ts
@src/modules/protected-action/internal/contact-follow-up.ts
@src/modules/billing/internal/schema.ts
</context>

<preflight_gates>
- P4 source authority spine: PASS for source/local pattern reuse only; no deployed P4 proof is claimed.
- P6 planning foundation: PASS for source/local domain execution; all Phase 6 context/research/pattern docs exist.
- External providers: NOT USED in this plan.
- Production launch: BLOCKED; every summary must state `source/local proof only` and `production proof not claimed`.
</preflight_gates>

<hackathon_spike_exception>
This plan may create deterministic local/test evidence contracts for Hermes and guardrails. It may not call external providers, claim production autonomous support, or treat screenshots/model output/status labels as proof.
</hackathon_spike_exception>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define closed Phase 6 domain contracts</name>
  <files>src/modules/common/ids.ts, src/modules/business-action/public.ts, src/modules/business-action/internal/schema.ts, tests/unit/business-action/business-action-contract.test.ts, tests/types/business-action-contracts.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-SPEC.md, .planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md, src/modules/protected-action/public.ts, src/modules/billing/internal/schema.ts</read_first>
  <action>Add branded IDs and closed literal unions for Business Action Card, BuyerMandate, CapabilityRequest, AuthorizationCheckpoint, GuardrailDecisionEvidence, Hermes evidence, ExternalEvidenceEvent placeholders, BusinessActionResultArtifact, ActionReceipt, support/no-repair refs, private evidence refs, and reconstruction status. Export only through `src/modules/business-action/public.ts`. The exact action slug is `provision-paid-intake-endpoint`; reject or omit arbitrary action strings, `provider: "other"`, generic `executeAction`, `paymentRequired: true`, and `callable: true`.</action>
  <verify>npx vitest run tests/unit/business-action/business-action-contract.test.ts tests/types/business-action-contracts.test.ts</verify>
  <acceptance_criteria>
    - `src/modules/business-action/public.ts` exists and exports the single public seam.
    - Tests assert `provision-paid-intake-endpoint` is the only accepted Phase 6 slug.
    - Tests fail if broad action/provider/payment/callable shapes appear in the domain contract.
  </acceptance_criteria>
  <done>Closed domain contracts and type tests exist without Convex, route, or provider dependencies.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement mandate request checkpoint and guardrail behavior</name>
  <files>src/modules/business-action/internal/business-action.ts, tests/unit/business-action/mandate-request-checkpoint.test.ts, tests/unit/business-action/guardrail-decision-evidence.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-CONTEXT.md, .planning/SECURITY-SPEC.md, src/modules/protected-action/internal/contact-follow-up.ts</read_first>
  <action>Implement the pure state machine for card selection, mandate validation, request creation, idempotency replay/conflict, owner checkpoint decisions, and GuardrailDecisionEvidence. Buyer mandate and Hermes must never grant business authority. Accepted checkpoint requires source-owned owner approval. Guardrail allow and block/refusal bind policy hash, request hash, model/provider/version, private trace ref hash, idempotency key, and correlation ID; guardrail rows never create downstream provider/payment/action consequence.</action>
  <verify>npx vitest run tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/business-action/guardrail-decision-evidence.test.ts</verify>
  <acceptance_criteria>
    - Tests cover expired/revoked mandate, wrong action, wrong business, amount over max, stale/disabled card, wrong/stale/revoked owner, missing owner decision, owner rejection, clarification, proof_gap, expired checkpoint, replay, and conflict.
    - Tests prove one guardrail allow and one guardrail block/refusal can be recorded without post-checkpoint ExternalEvidenceEvent rows.
  </acceptance_criteria>
  <done>Authority and guardrail behavior are source-owned, deterministic, and test-covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement Hermes evidence result artifact and receipt verifier</name>
  <files>src/modules/business-action/internal/business-action.ts, tests/unit/business-action/hermes-evidence.test.ts, tests/unit/business-action/evidence-receipt-verifier.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-RESEARCH.md, .planning/phases/06-agentic-business-action-receipts/06-SOURCE-DOC-GROUNDING.md, src/modules/protected-action/internal/contact-follow-up.ts</read_first>
  <action>Implement positive Hermes evidence for scopes/selects/requests/executes/reports, admitted only after accepted checkpoint and bound to request/checkpoint/idempotency/correlation/payload hashes. Implement result artifact and ActionReceipt verifier. Success requires endpoint descriptor, JSON schema, and private endpoint/provisioning/payment-gate artifact ref; missing any one records proof_gap. Public verifier output exposes only labels, statuses, hashes, timestamps, and non-sensitive refs.</action>
  <verify>npx vitest run tests/unit/business-action/hermes-evidence.test.ts tests/unit/business-action/evidence-receipt-verifier.test.ts</verify>
  <acceptance_criteria>
    - Positive Hermes evidence path is test-covered.
    - Receipt verifier reconstructs success, refusal/no consequence, proof_gap, evidence mismatch, tampered hash, stale card, expired mandate, unbound provider event, public redaction, and private readback.
    - Owner inbox item, report, screenshot, model output, payment event, or status label alone cannot satisfy success.
  </acceptance_criteria>
  <done>Hermes/run evidence and receipt verification prove the Phase 6 core chain source-locally.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/business-action/business-action-contract.test.ts tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/business-action/guardrail-decision-evidence.test.ts tests/unit/business-action/hermes-evidence.test.ts tests/unit/business-action/evidence-receipt-verifier.test.ts tests/types/business-action-contracts.test.ts
- [ ] npm run typecheck
</verification>

<success_criteria>
- All tasks completed.
- All listed tests pass.
- No external provider proof, production proof, or public claim is asserted.
- Closeout states `source/local proof only` and `production proof not claimed`.
</success_criteria>

<output>
After completion, create `.planning/phases/06-agentic-business-action-receipts/06-01-SUMMARY.md`.
</output>
