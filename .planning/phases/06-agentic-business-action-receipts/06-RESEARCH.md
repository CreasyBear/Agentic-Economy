# Phase 6 Research: Agentic Business Action Receipts

**Created:** 2026-06-29
**Mode:** GSD phase researcher + orchestrator synthesis
**Status:** Ready for planning

## Research Complete

Phase 6 should be a new source-owned `src/modules/business-action/` seam for exactly one action: `provision-paid-intake-endpoint`.

The phase protects the futuristic marketplace vision by proving one receipt-backed autonomous business operation, not by building a generic marketplace, wallet, runtime, settlement layer, provider, product catalog, or API-commerce platform.

## Source-Grounded Recommendation

Build the first Phase 6 plan around this chain:

```text
Business Action Card
-> buyer/operator mandate
-> Capability Request
-> source-owned owner checkpoint
-> GuardrailDecisionEvidence
-> accepted checkpoint
-> bound external evidence
-> endpoint descriptor + JSON schema + private provisioning/payment-gate ref
-> Action Receipt verifier
```

The closest reusable pattern is Phase 4: closed slug, owner-derived authority, source-owned proposal/policy/decision/gateway/attempt/receipt state, idempotency replay/conflict behavior, no-repair, private evidence refs, audit validation, and route readbacks. Phase 5 adds the money-evidence posture: provider evidence is bound evidence, not authority.

## Module And Schema Shape

Recommended files for the first implementation plan:

| File | Purpose |
|---|---|
| `src/modules/business-action/public.ts` | Public module seam and re-exports. |
| `src/modules/business-action/internal/business-action.ts` | Pure state machine for cards, mandates, requests, checkpoints, evidence, receipts, and reconstruction. |
| `src/modules/business-action/internal/schema.ts` | Type/literal definitions if the state machine grows too large. |
| `src/modules/business-action/business-action.functions.ts` | Server function bridge for route-facing reads/writes. |
| `convex/businessActions.ts` | Convex adapter with source-write gates, authority resolution, validation, and redacted returns. |
| `convex/businessActionStore.ts` | Source-state slice load/persist helpers. |
| `src/routes/owner.business-actions*.tsx` | Owner request/checkpoint/receipt readbacks. |
| `src/routes/admin.business-actions*.tsx` | Admin/operator reconstruction. |
| `src/lib/ui/contract-scans.ts` | Phase 6 copy and drift scanner ownership. |

Core state concepts:

- `BusinessActionCard`: immutable version/source hash, action slug literal, `proposal_only`, owner approval required, receipt required.
- `BuyerMandate`: buyer/operator scope, max spend, allowed action/business, TTL, mandate hash.
- `CapabilityRequest`: mandate/card/request/amount binding plus idempotency and correlation.
- `AuthorizationCheckpoint`: `accepted`, `refused`, `clarification_required`, `proof_gap`, `expired`.
- `GuardrailDecisionEvidence`: NeMo/Nemotron allow/block/refusal evidence before or at checkpoint, not downstream consequence.
- `ExternalEvidenceEvent`: Hermes/Stripe/Link/deployment/endpoint-host evidence after accepted checkpoint only.
- `ActionReceipt`: card, mandate, request, checkpoint, policy, evidence refs, result refs, outcome, previous receipt, signature/ref, reconstruction status.

## Money Evidence Recommendation

Phase 6 should not use the Phase 5 billing seam as customer paid-intake authority. Phase 5 remains owner paid activation through Autumn Cloud plus Stripe PSP.

Create and obey `06-MONEY-EVIDENCE-DECISION.md` before any direct Stripe/Link implementation. The default safe path is a server-created Stripe Checkout Session in `payment` mode because it can bind AE request refs through `client_reference_id`, metadata, amount/currency, webhook readback, and server idempotency.

PaymentIntent, Payment Link, Link CLI, and Shared Payment Tokens are deferred unless the decision record is amended with equivalent binding and smoke proof.

Official Stripe docs checked on 2026-06-29:

- Checkout Sessions can be created server-side in `payment` mode and support `client_reference_id` and metadata useful for reconciliation: https://docs.stripe.com/api/checkout/sessions/create
- Stripe webhooks require raw request body signature verification and should return `2xx` quickly before complex work: https://docs.stripe.com/webhooks
- Stripe idempotency keys safely retry POST requests and compare reused-key parameters: https://docs.stripe.com/api/idempotent_requests

## NVIDIA And Guardrail Evidence

Use NeMo Guardrails/Nemotron as execution-rail decision evidence only:

- one allow decision,
- one block/refusal decision,
- both bound to policy hash, request hash, model/provider/version, private trace ref hash, idempotency key, and correlation ID.

This can prove model/tool-call governance and safety/refusal posture. It cannot prove business approval, payment truth, endpoint hosting, OS/process sandboxing, or provider success.

## Audit, Support, Controls

Extend the existing observability spine rather than creating parallel logs.

Minimum additions for the plan:

- audit target types for business action card, mandate, request, checkpoint, guardrail decision, external evidence, result artifact, receipt, and support/no-repair;
- audit event names under `business_action.*`;
- operator controls `business_actions_enabled` and `business_action_attempts_enabled`;
- support/kill-rule record that can disable demo/public claims;
- no-repair record and operator next action for terminal proof gaps.

## Result Artifact

Success requires all three:

- endpoint descriptor,
- JSON schema,
- private endpoint/provisioning/payment-gate artifact ref.

An owner inbox item, report, deployed URL, screenshot, model output, payment event, or status label can support a receipt but cannot satisfy success by itself. If the artifacts are missing, terminal state is `proof_gap`.

## Verification Gates

The Phase 6 plan must name exact commands, but the expected suite is:

```text
npm run typecheck
npm run check:convex-codegen
npx vitest run tests/unit/business-action
npx vitest run tests/integration/business-action
npx vitest run tests/types/business-action-contracts.test.ts
npx vitest run tests/unit/observability/business-action-events.test.ts
npm run test:copy
npm run test:source-mining
npm run test:imports
npm run test:ts-standards
npm run test:seo
npm run test:ui-contract
npm run build
npm run test:all
```

`npm run test:provider-smoke:autumn-stripe` is required only when claiming deployed Phase 5 money evidence. Phase 6 direct Stripe smoke should be added only after the Phase 6 Stripe implementation exists.

## Hard Questions Answered For Planning

| Question | Planning answer |
|---|---|
| P5 seam or direct Stripe? | Direct Stripe test-mode evidence requires `06-MONEY-EVIDENCE-DECISION.md`; the P5 seam is not paid-intake authority. |
| Stripe object? | Default to server-created Checkout Session in `payment` mode. |
| Link CLI/SPT? | Out of first plan unless sponsor access and binding are decision-recorded. |
| NeMo block/refusal storage? | Store as `GuardrailDecisionEvidence`, not post-checkpoint external consequence. |
| Result artifact? | Endpoint descriptor + JSON schema + private provisioning/payment-gate ref. |
| Owner approval? | Required for accepted checkpoint; spike proof-gaps must be explicit. |
| Public verifier? | Owner/admin/private verifier first. Public demo copy only after source-owned proof and support/kill rule. |
| P5 provider-smoke gap? | Allowed only as a labeled hackathon spike exception; no deployed money/public claim. |

## Anti-Patterns To Prohibit

- generic `executeAction`,
- arbitrary action slugs,
- `provider: "other"`,
- `actionSlug: string`,
- direct Stripe authority without `06-MONEY-EVIDENCE-DECISION.md`,
- self-approving Hermes/agent spend,
- Stripe/Link/Hermes/NeMo/screenshots/model output as authority,
- route-local demo fixture arrays,
- raw prompts, traces, provider payloads, Link/SPT credentials, Stripe payloads, customer identifiers, or secrets in public verifier output,
- x402, Connect, custody, wallet, credits, balances, settlement, seller payout, product marketplace, hosted-agent platform, skills marketplace, or generic API marketplace.
