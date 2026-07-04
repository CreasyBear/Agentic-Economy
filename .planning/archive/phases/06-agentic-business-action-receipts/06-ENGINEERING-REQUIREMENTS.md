---
phase: "06"
slug: agentic-business-action-receipts
status: pre-spec-engineering-input
created: 2026-06-29
feeds: /skill:gsd-spec-phase 6
supersedes: none
source_basis:
  - .planning/PROJECT.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md
  - .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
  - .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
  - .planning/phases/05-paid-activation-money-rails/05-SPEC.md
  - ../Agentic-Economy-Backup source-mining outputs and source files
  - .planning/phases/06-agentic-business-action-receipts/06-SOURCE-DOC-GROUNDING.md
---

# Phase 6 Engineering Requirements Input: Agentic Business Action Receipts

## Status

This is an engineering input document for `/skill:gsd-spec-phase 6`.

It is **not** the Phase 6 SPEC. It should help spec-phase ask fewer low-value questions and lock the right WHAT/WHY before discuss-phase decides HOW.

Source-doc grounding now lives in `06-SOURCE-DOC-GROUNDING.md`. Treat this file as the product/engineering synthesis; treat source-doc claims as governed by that grounding artifact.

## One-line recommendation

Phase 6 should aggressively target one receipt-backed **software-scoped autonomous business operation**: Hermes provisions a bounded business capability, Stripe handles approved spend/revenue evidence, NVIDIA Nemotron/NeMo Guardrails supplies reasoning, safety, and execution-rail evidence, and AE owns the source-owned action card, mandate, authorization checkpoint, and reconstructable receipt trail.

Do not be defensive by banning the sponsor rails.
Do be precise about ownership: AE must not become the agent runtime, wallet, marketplace, settlement layer, sandbox, or provider.
AE should prove what the agent was allowed to do and what actually happened.

## Current repo facts that constrain Phase 6

| Fact | Source | Constraint for Phase 6 |
|---|---|---|
| Backup is a source mine, not a base branch. | `.planning/PROJECT.md` fresh repo rule | Copy invariants, not folders or broad old architecture. |
| A phase exists only when it unlocks a source-owned capability. | `.planning/ROADMAP.md` roadmap rule | Phase 6 must name one source-owned capability, not a narrative surface. |
| Phase 3 discovery is read-only. | `.planning/ROADMAP.md` Phase 3, `src/modules/discovery/public.ts` | Discovery may expose action readiness only as readback, never authority. |
| Phase 4 selects exactly one non-money owner-approved action. | `04-SPEC.md`, `04-ACTION-SELECTION.md` | Phase 6 must build on the proposal/policy/owner/gateway/receipt spine, not bypass it. |
| Phase 4 selected `contact-follow-up` and explicitly rejected generic action registries. | `04-ACTION-SELECTION.md` | Phase 6 may introduce a new seam only after P4 proof exists; it must not retroactively generalize P4. |
| Phase 5 is paid activation through Autumn + Stripe PSP, not buyer-to-seller settlement. | `05-SPEC.md` | Stripe in Phase 6 may be external spend/revenue evidence only unless a new money decision record expands AE-owned money authority. |
| P5 cuts Connect, x402, wallet, credits, custody, split payouts, marketplace settlement, and request-market settlement. | `05-SPEC.md` | These remain cut from AE core; they do not forbid Hermes/Stripe/NVIDIA from appearing as external hackathon rails. |
| Hackathon target is Hermes + Stripe + NVIDIA/Nemotron/NeMo Guardrails autonomous business operations. | User-provided hackathon brief plus source-doc grounding | Phase 6 should integrate Hermes, Stripe, and NVIDIA evidence directly instead of pretending the demo is only catalog discovery. |
| Current state says Phase 4 is executing, Phase 2 deploy/provider smokes and Phase 3 deployed proof remain unclaimed. | `.planning/STATE.md` | Phase 6 is planning/spike-only until P4/P5 closeout evidence exists. |

## Source-mined backup facts to keep

The backup has valuable invariants, not a module to port.

Keep:

1. **Versioned action descriptors** from backup capability cards.
   - Useful fields: business id, card id, version, title, description, intents, endpoint discriminator, price/currency when allowed, visibility, outcome types, policy flags.
   - Useful invariant: public cards are searchable, disabled cards are omitted, unlisted cards require direct context, exported rows scrub endpoint refs and secrets.

2. **Exact protected-action contracts** from backup kernel code.
   - Useful fields: action class, protected surface kind, gateway id, actor/principal/business, server-observed parameters, idempotency key, correlation id, contract hash, evidence expectations.
   - Useful invariant: no generic descriptors, raw model/browser fields, secrets, token-shaped fields, or caller-supplied authority.

3. **One-use authority gates** from backup Handshake patterns.
   - Useful fields: greenlight id, contract hash, policy hash, isolation state, idempotency ledger digest, max uses 1, not-before, expires-at, consumed-at.
   - Useful invariant: stale policy, mismatched isolation, expired gate, reused gate, and contract mismatch fail before consequence.

4. **Receipts and reconstruction** from backup `ae.receipt/v1`.
   - Useful fields: actor, business, session, action payload hash, evidence refs, outcome, linked previous receipt, signer, key fingerprint, compliance, created-at.
   - Useful invariant: valid signature is not policy approval; policy, gateway, downstream result, proof gap, signer validity, and billing eligibility are separate verifier facts.

5. **Refusal/proof-gap as first-class terminal evidence**.
   - Useful invariant: refusal and proof gap produce durable readback. No provider/action/payment follows a refusal.

Reject from AE core:

- AE-owned wallet/credits/balance/custody,
- AE-owned marketplace settlement,
- AE-owned seller payouts,
- AE-owned x402/crypto rail,
- broad adapter registry,
- hosted-agent platform,
- skills marketplace,
- broad Agent Router SDK/MCP/CLI/plugin ecosystem,
- AE-owned product/SKU marketplace, inventory, fulfillment, or settlement,
- route-local demo fixtures.

Allow as external hackathon rails when evidence-bound:

- Hermes runtime, cron, sub-agents, workflows, and Telegram reporting,
- Link CLI spend request evidence: one-time virtual card or Shared Payment Token after human approval,
- Stripe API payment links or PaymentIntent evidence,
- NVIDIA Nemotron/NeMo Guardrails reasoning, safety, and execution-rail evidence,
- external infrastructure/API/service provisioning attempted by Hermes after approval.

## Product thesis for Phase 6

The agentic value is not that an agent can pay.
The agentic value is not that an agent runs unattended.

The agentic value is that Hermes can operate a bounded business workflow while AE proves:

1. what customer/business intent entered the system,
2. what action the agent selected,
3. what mandate constrained the agent,
4. what spend or external effect was requested,
5. what the owner/operator approved or refused,
6. what Stripe/NVIDIA/Hermes reported back as evidence,
7. what result, payment link, refusal, or proof gap was produced,
8. whether the whole chain reconstructs later.

The demo should make **safe non-execution** and **receipt reconstruction** as memorable as the happy path.

## Proposed Phase 6 name

**Agentic Business Action Receipts**

Alternate internal names:

- Autonomous Business Action Receipts
- Business Action Card + Receipt Verifier
- Receipt-backed Business Operations
- Verifiable Agent-Run Business Actions

Avoid public/internal working names that imply AE owns marketplace settlement or agent autonomy:

- agentic marketplace,
- autonomous procurement,
- agent checkout,
- AI checkout,
- seller catalog marketplace,
- API microtransaction marketplace,
- Shopify for agents,
- wallet for agents.

## Scope statement for gsd-spec-phase

Phase 6 should answer this question:

> Can AE make one Hermes-run software-scoped autonomous business operation receipt-verifiable, with source-owned action facts, mandate-bound authority, explicit accept/refuse behavior, Stripe spend/revenue evidence, NVIDIA Nemotron/NeMo Guardrails reasoning and execution-rail evidence, and reconstructable receipts, without becoming the agent runtime, wallet, marketplace, settlement layer, sandbox, or provider?

## Primary user, job, object, outcome

| Dimension | Value |
|---|---|
| Primary user | Operator using a Hermes-like agent to run one bounded business workflow. |
| Secondary user | Source-owned business owner/operator who defines constraints and approves/refuses consequence. |
| Customer user | Customer who sends the request and later receives a result or payment link. |
| Operator user | AE operator verifying receipt chain, proof gaps, and no-repair states. |
| Job | Let an agent provision one bounded software-facing business capability with spend/revenue/execution-rail evidence while preserving human authority and reconstructable proof. |
| Object | Business Action Card, Mandate, Capability Request, Authorization Checkpoint, External Evidence Event, Action Receipt. |
| Outcome | The agent either gets a signed result receipt or a signed refusal/proof-gap explaining why no consequence, spend, or external action happened. |

## Minimum demo story

Use a bounded business operation that shows autonomous work without turning AE into a marketplace.

Recommended demo action:

> "Provision a paid diagnostic intake endpoint for this business. The endpoint accepts a structured request, requires Stripe test-mode payment evidence before creating an owner inbox item, stays private until owner approval, and emits a receipt that reconstructs request, action card, mandate, approval, webhook/readback, artifact, and result. Do not expose it publicly, charge real money, or treat return URLs/screenshots/model output as proof."

Why this action:

- It matches the Hermes + Stripe + NVIDIA hackathon premise without making AE a product marketplace or a content-generation toy.
- It is a software-scoped business operation: endpoint descriptor, JSON schema, payment gate, webhook verification, owner inbox item, and receipt.
- It can show customer intake, Hermes planning, owner approval, execution-rail enforcement, Stripe webhook/readback, concrete artifact output, and receipt reconstruction.
- Stripe is essential as payment-link/Checkout/PaymentIntent and webhook evidence, not decorative checkout.
- NVIDIA Nemotron/NeMo Guardrails is essential only if it produces observable reasoning/safety/tool-call governance evidence.
- The receipt verifier must prove both success and refusal.

## Required data flow

```text
Customer request
  - email / task / intake payload
  |
  v
Hermes scopes operation
  - requested action
  - expected deliverable
  - needed tool/service/infra
  - expected spend
  - expected customer charge
  |
  v
Mandate created
  - actor/buyer/operator
  - allowed action slugs
  - allowed external domains/vendors
  - max spend
  - TTL
  - idempotency key
  - correlation id
  - mandate hash
  |
  v
Agent reads AE discovery
  |
  v
Agent selects Business Action Card
  - public/source-owned facts only
  - card id + version + source hash
  - visibility/readiness
  - policy flags
  - execution-rail flags
  - approval required
  |
  v
Capability Request proposed
  - card id + version
  - action slug
  - input hash
  - mandate hash
  - requested spend summary
  - idempotency key
  - correlation id
  |
  v
Authorization Checkpoint
  - owner/business authority
  - mandate constraints
  - card freshness
  - budget/TTL
  - approved domains/vendors
  - policy hash
  |
  +--> refused / proof_gap / clarification_required
  |       |
  |       v
  |     signed receipt, no spend, no consequence
  |
  v
Accepted
  |
  v
External evidence-bound consequence
  - NeMo Guardrails execution-rail allow/block evidence
  - optional Link CLI spend request / approval evidence
  - Hermes deliverable/result evidence
  - optional Stripe API payment-link/revenue evidence
  |
  v
Action Receipt
  |
  v
Verifier reconstructs mandate -> card -> request -> checkpoint -> evidence -> result/refusal
```

## Required state machine

```text
mandate_active
  -> action_card_selected
  -> request_proposed
  -> authority_checked
  -> accepted
       -> execution_policy_admitted
       -> optional_spend_approved
       -> safe_action_completed
       -> optional_revenue_link_created
       -> receipt_recorded
       -> verifier_complete

request_proposed
  -> authority_checked
  -> refused
       -> receipt_recorded
       -> verifier_complete

request_proposed
  -> authority_checked
  -> clarification_required
       -> receipt_recorded

request_proposed
  -> authority_checked
  -> proof_gap
       -> receipt_recorded
       -> operator_retry_or_no_repair

any evidence-bound consequence
  -> evidence_mismatch
       -> proof_gap
       -> receipt_recorded

any non-terminal state past TTL
  -> expired
       -> receipt_or_readback_recorded
```

## Required Phase 6 module seam

Use one deep module with a small route-facing interface.

Recommended module name:

```text
src/modules/business-action/
```

Recommended public interface:

```ts
publishBusinessActionCard(input, opts): Promise<PublishBusinessActionCardResult>
listPublicBusinessActionCards(input): Promise<ListPublicBusinessActionCardsResult>
readBusinessActionCard(cardId): Promise<ReadBusinessActionCardResult>
createBuyerMandate(input, opts): Promise<CreateBuyerMandateResult>
proposeCapabilityRequest(input, opts): Promise<ProposeCapabilityRequestResult>
evaluateBusinessActionAuthority(input, opts): Promise<EvaluateBusinessActionAuthorityResult>
decideBusinessActionRequest(input, opts): Promise<DecideBusinessActionRequestResult>
recordBusinessActionAttempt(input, opts): Promise<RecordBusinessActionAttemptResult>
recordBusinessActionExecutionEvidence(input, opts): Promise<RecordBusinessActionExecutionEvidenceResult>
recordBusinessActionSpendEvidence(input, opts): Promise<RecordBusinessActionSpendEvidenceResult>
recordBusinessActionRevenueEvidence(input, opts): Promise<RecordBusinessActionRevenueEvidenceResult>
readBusinessActionReceipt(input): Promise<ReadBusinessActionReceiptResult>
readBusinessActionReconstruction(input): Promise<ReadBusinessActionReconstructionResult>
markBusinessActionNoRepair(input, opts): Promise<MarkBusinessActionNoRepairResult>
```

Route-facing commands must not accept caller-supplied owner/admin/business authority. They may accept idempotency key and correlation id through `CommandOptions`.

Do not expose a generic `executeAction` route. If an invoke-style route exists, it must create a proposal or request and return approval-required/refusal/readback state.

## Minimal data model

The following shapes are input to spec-phase. Exact names can change, but the concepts should not collapse into existing catalog, discovery, or billing tables.

### BusinessActionCard

```ts
type BusinessActionCard = {
  id: BusinessActionCardId
  businessId: BusinessId
  serviceId?: ServiceId
  version: number
  slug: string
  title: string
  description: string
  intents: readonly string[]
  actionSlug: 'provision-paid-intake-endpoint'
  visibility: 'public' | 'unlisted' | 'disabled'
  readiness: 'available' | 'degraded' | 'unavailable' | 'stale'
  callable: 'proposal_only'
  receiptRequired: true
  ownerApprovalRequired: true
  maxAdvertisedAmountCents?: number
  currency: 'AUD'
  ttlSeconds: number
  policyFlags: readonly string[]
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
}
```

Rules:

- Cards are source-owned and owner-authorized.
- Updates create a new version or immutable version snapshot.
- Requests bind `cardId + version + sourceHash`.
- Disabled cards cannot be selected.
- Stale cards can be read but cannot be accepted unless policy explicitly permits degraded mode.
- Public discovery exposes only allowlisted fields.
- No endpoint secret, token, raw provider id, checkout URL, or owner private payload appears in public card output.

### Mandate

```ts
type Mandate = {
  id: MandateId
  actorRef: string
  buyerRef: string
  allowedActionSlugs: readonly ['provision-paid-intake-endpoint']
  allowedBusinessIds?: readonly BusinessId[]
  maxCostCents: number
  currency: 'AUD'
  purpose: string
  expiresAt: number
  mandateHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  status: 'active' | 'expired' | 'revoked'
  createdAt: number
}
```

Rules:

- Mandate is buyer-side authority, not business-side authority.
- Mandate never grants provider, payment, owner, or admin authority by itself.
- Any request exceeding `maxCostCents`, TTL, allowed action, or allowed business fails before consequence.
- Revoked or expired mandate can still be reconstructed.

### CapabilityRequest

```ts
type CapabilityRequest = {
  id: CapabilityRequestId
  mandateId: MandateId
  businessId: BusinessId
  cardId: BusinessActionCardId
  cardVersion: number
  actionSlug: 'provision-paid-intake-endpoint'
  requestHash: SourceHash
  inputSummary: string
  requestedAmountCents?: number
  currency?: 'AUD'
  status:
    | 'proposed'
    | 'clarification_required'
    | 'approval_required'
    | 'accepted'
    | 'refused'
    | 'expired'
    | 'dry_run_executed'
    | 'payment_bound'
    | 'receipt_recorded'
    | 'proof_gap'
    | 'failed'
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  createdAt: number
  updatedAt: number
}
```

Rules:

- Same key, same body replays.
- Same key, different body conflicts.
- Proposal never executes consequence.
- Request is bound to exact card version and mandate hash.
- Raw buyer prompt is private evidence, not public readback.

### AuthorizationCheckpoint

```ts
type AuthorizationCheckpoint = {
  id: AuthorizationCheckpointId
  requestId: CapabilityRequestId
  mandateHash: SourceHash
  requestHash: SourceHash
  cardHash: SourceHash
  policyHash: SourceHash
  ownerDecisionHash?: SourceHash
  decision:
    | 'accepted'
    | 'refused'
    | 'approval_required'
    | 'clarification_required'
    | 'proof_gap'
    | 'expired'
  reason: string
  evidenceRefs: readonly string[]
  decidedAt: number
}
```

Rules:

- This is the consequence boundary.
- No dry-run, payment, webhook, provider call, or result artifact occurs before this admits the request.
- Refused, expired, or proof-gap checkpoint emits readback/receipt and stops.

### ActionReceipt

```ts
type ActionReceipt = {
  id: ActionReceiptId
  requestId: CapabilityRequestId
  mandateId: MandateId
  businessId: BusinessId
  cardId: BusinessActionCardId
  cardVersion: number
  checkpointId: AuthorizationCheckpointId
  eventKind: 'proposal' | 'refusal' | 'policy_decision' | 'gateway_check' | 'downstream_result' | 'proof_gap' | 'receipt_emitted'
  outcome: 'accepted' | 'refused' | 'clarification_required' | 'dry_run_executed' | 'payment_bound' | 'proof_gap' | 'failed'
  receiptHash: SourceHash
  signatureRef: string
  previousReceiptId?: ActionReceiptId
  reconstructionStatus: 'complete' | 'incomplete' | 'proof_gap' | 'tampered'
  recordedAt: number
}
```

Rules:

- Receipt verifier must separate signature validity from authority approval, payment success, and downstream success.
- Public verifier exposes facts and hashes, not raw private payloads.
- Owner/operator reconstruction can see richer private readback through source-owned authorization.


### GuardrailDecisionEvidence

```ts
type GuardrailDecisionEvidence = {
  id: GuardrailDecisionEvidenceId
  requestId: CapabilityRequestId
  provider: 'nemo_guardrails' | 'nemotron'
  decision: 'allowed' | 'blocked' | 'refused'
  policyHash: SourceHash
  requestHash: SourceHash
  modelProvider: 'nvidia'
  modelVersion: string
  privateTraceRefHash: SourceHash
  payloadHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
}
```

Rules:

- Guardrail decision evidence can be recorded before or at the authorization checkpoint.
- It is policy/tool-governance evidence only; it is not downstream provider evidence, payment proof, endpoint proof, owner approval, or AE authority.
- A block/refusal can support a refused/proof-gap checkpoint and receipt, but it must not create spend, endpoint exposure, owner inbox items, or public success copy.
- Raw prompts and traces stay private; public verifiers may expose labels, hashes, timestamps, and non-sensitive refs only.

### ExternalEvidenceEvent

```ts
type ExternalEvidenceEvent = {
  id: ExternalEvidenceEventId
  requestId: CapabilityRequestId
  checkpointId: AuthorizationCheckpointId
  provider: 'hermes' | 'link_cli' | 'stripe_api' | 'deployment_target' | 'endpoint_host'
  evidenceKind:
    | 'endpoint_descriptor_created'
    | 'json_schema_created'
    | 'private_endpoint_provisioned'
    | 'spend_requested'
    | 'spend_approved'
    | 'one_time_card_issued'
    | 'checkout_session_created'
    | 'payment_intent_created'
    | 'payment_link_created'
    | 'stripe_webhook_verified'
    | 'owner_inbox_item_created'
    | 'deliverable_created'
    | 'provider_unavailable'
  payloadHash: SourceHash
  amountCents?: number
  currency?: 'AUD' | 'USD'
  providerRefHash?: SourceHash
  evidenceRefs: readonly string[]
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
}
```

Rules:

- External evidence is never authority by itself.
- Link CLI evidence can prove approved spend posture; it cannot grant AE custody or settlement authority.
- Stripe API evidence can prove payment-link or revenue posture; it cannot prove work quality.
- NVIDIA/NeMo Guardrails decision evidence can prove model safety, refusal, and execution-rail allow/block posture; it cannot prove business approval, payment, endpoint hosting, downstream success, or OS sandboxing.
- Hermes evidence can prove requested/planned/completed workflow posture; it cannot prove Stripe, execution policy, deployment-target state, or AE authority alone.
## Stripe evidence posture

Stripe is allowed in the hackathon demo as test-mode external spend and revenue evidence downstream of AE authority only after `06-MONEY-EVIDENCE-DECISION.md`.

Allowed spend flow:

```text
accepted request -> optional Hermes Link CLI spend request -> human approval -> one-time virtual card or SPT evidence -> bounded external provisioning attempt -> evidence bound to request/checkpoint/receipt
```

Allowed revenue flow:

```text
accepted request -> server-created Stripe Checkout Session by default, or PaymentIntent/Payment Link only if the decision record proves equivalent binding -> signed webhook/readback evidence -> endpoint descriptor/schema/private ref and optional owner inbox item -> bound to request/checkpoint/receipt
```

Not allowed:

```text
agent creates endpoint or payment link -> Stripe/Link succeeds -> AE backfills authority
```

Rules:

- No direct Stripe/Link implementation without `06-MONEY-EVIDENCE-DECISION.md`.
- No Connect in the hackathon unless separately decision-recorded.
- No AE-owned payout.
- No AE custody.
- No AE saved balance.
- No AE wallet.
- No AE credits ledger.
- No buyer-to-seller settlement claim.
- No card details, Link secrets, raw provider tokens, or payment credentials in AE source rows.
- No client-supplied amount/currency/customer/provider id.
- No public payment claim without readback, reconciliation, and Phase 6 receipt reconstruction.
- Stripe event is evidence, not authority, and cannot be borrowed from P5 as paid-intake authority.
- Human/Link approval is required for spend; Hermes cannot self-approve.

If Stripe cannot be bound to exact request, action, amount, currency, business/operator mandate, accepted checkpoint, idempotency key, and receipt, cut that Stripe step from the demo.

## Discovery and public copy posture

Phase 6 may add agent-readable action discovery only after source-owned cards exist.

Allowed public/machine wording for discovery rows:

```text
agent_request_available
proposal_required
owner_approval_required
receipt_required
execution_policy_required
paid_intake_endpoint_private_until_approved
payment_evidence_required_before_inbox_item
```

Allowed hackathon/demo wording only when the demo proves the chain:

```text
receipt-backed software operation
Hermes-run paid intake provisioning with AE receipts
Stripe payment-link/Checkout/PaymentIntent and webhook evidence
NVIDIA Nemotron/NeMo Guardrails reasoning/safety/execution-rail evidence
```

Forbidden wording unless implementation proves it:

```text
self-approving agent
unbounded autonomous spend
instant purchase
agent checkout
AE wallet
AE credits
AE custody
seller payout
marketplace settlement
x402
Connect
AE-owned product marketplace
```

Discovery outputs must preserve Phase 3 truth:

- descriptors never mint authority,
- public rows are allowlisted projections,
- unsupported/degraded states are explicit,
- action request endpoints, if any, are proposal-only unless authority has passed,
- external provider fields stay private or hashed,
- public copy may say autonomous only for a receipt-backed demo/proof, not for unsupported production claims.

## Demo data handling

Demo businesses, action cards, mandates, requests, and evidence events should be source rows in a demo Convex deployment or local seed dataset, not hardcoded route arrays.

Required demo seed rule:

```text
seed business -> seed Business Action Card -> seed/submit mandate -> run normal discovery -> Hermes proposes request -> AE checkpoint -> external evidence records -> receipt/reconstruction
```

If deleting seeded rows leaves the demo still working, the demo is too fake.

Seed data may be deterministic and test-mode, but it must pass the same validators and readback paths as normal source state.

## Test and verification matrix

Phase 6 SPEC should require tests for these behaviors.

### Source and card tests

- valid card publishes with version 1,
- card update creates new version/hash,
- disabled card omitted from public selection,
- unlisted card requires direct context,
- stale card cannot be accepted without explicit policy,
- public card projection redacts endpoint refs, secrets, emails, bearer/API key-shaped text,
- suppressed business/service card hidden everywhere.

### Mandate tests

- valid mandate creates active mandate,
- expired mandate cannot propose consequence,
- revoked mandate cannot propose consequence,
- over-budget request refused,
- disallowed action refused,
- disallowed business refused,
- same-key same-body replays,
- same-key different-body conflicts.

### Capability request tests

- request binds exact `cardId + cardVersion + sourceHash + mandateHash`,
- stale card version rejected,
- raw model/browser text never becomes authority,
- anonymous or wrong actor rejected,
- proposal creates no downstream attempt,
- duplicate request idempotency covered,
- private payload redacted in public readback.

### Authorization checkpoint tests

- approval-required path creates no consequence,
- accepted path admits one attempt,
- refused path creates refusal receipt and no consequence,
- expired checkpoint blocks consequence,
- missing proof creates proof-gap receipt,
- owner/business authority derived server-side,
- operator controls disable attempts.

### Attempt, execution policy, spend, and revenue tests

- no attempt before accepted checkpoint,
- one-use admission blocks replay,
- NeMo Guardrails execution-rail allow/block evidence binds exact request and policy hash,
- Link CLI spend request/approval evidence binds exact request/amount/currency/idempotency,
- Stripe API payment-link, Checkout, or PaymentIntent evidence binds exact request/result/customer-facing amount,
- invalid or unbound Stripe/NVIDIA/Hermes evidence held, not accepted,
- duplicate provider event idempotent,
- provider unavailable creates proof gap,
- no AE-owned payout, settlement, wallet, custody, or credits row exists.

### Receipt/verifier tests

- receipt chain reconstructs request -> checkpoint -> result/refusal,
- valid signature does not imply approval,
- tampered request hash fails verifier,
- tampered amount fails verifier,
- missing segment reports proof gap,
- refusal receipt verifies and shows no payment/attempt,
- public verifier redacts raw payload and private actor details,
- owner/operator readback shows richer source-owned evidence,
- no-repair preserves original evidence.

### Copy and import scans

- fail on `marketplace settlement`, `AE wallet`, `AE credits`, `x402`, `Connect`, `custody`, `seller payout`, `agent checkout`, `self-approving`, `unbounded autonomous spend`, and unsupported `paymentRequired` claims in public paths,
- fail on importing backup broad action catalogs or request-market/wallet code,
- fail on adding payment/provider fields to core catalog/registry/discovery rows,
- fail on route-local demo fixture arrays for action cards or external evidence.

## Performance requirements

Phase 6 should stay boring.

- Public card list/search reads should reuse current registry/discovery projection posture.
- Request/checkpoint/receipt writes are low-volume consequential commands, not high-throughput event streaming.
- P95 target for demo request/checkpoint/readback should be under 2 seconds locally and under 5 seconds on the deployed demo environment.
- No vector search, queue system, new database, or external search engine is justified for the hackathon.
- Use idempotent source-owned writes and existing Convex patterns first.

## Security and privacy requirements

- Browser never supplies owner/admin/business authority.
- Agent never supplies seller/provider authority.
- Mandate is buyer authority only.
- Business owner decision is server-derived from owner authority.
- Provider/Stripe events are evidence only until bound and admitted.
- Raw buyer prompt, private business notes, provider payloads, raw Stripe payload, customer identifiers, and owner private evidence are not public verifier output.
- Public verifier returns hashes/facts, not raw canonical payload.
- Every externally supplied string in card/search fields is scanned for secrets, tokens, emails, and instruction-like payloads before publication.
- Receipts are append-only. Reversal/no-repair creates a new linked event, not destructive mutation.

## Engineering diagram for the Phase 6 spec

```text
┌────────────────────────┐
│ Operation request      │
│ paid intake endpoint   │
└───────────┬────────────┘
            │ scopes
            v
┌────────────────────────┐
│ Hermes agent            │
│ plan + tools + payment  │
└───────────┬────────────┘
            │ reads/proposes
            v
┌────────────────────────┐
│ AE business-action      │
│ card + mandate + request│
└───────────┬────────────┘
            │ check
            v
┌────────────────────────┐
│ Authorization Checkpoint│
│ owner + mandate + TTL   │
│ budget + card version   │
└───────┬────────────┬────┘
        │            │
        │ refuse     │ accept
        v            v
┌──────────────┐   ┌────────────────────┐
│ refusal /    │   │ External rails      │
│ proof-gap    │   │ endpoint + Stripe   │
│ recorded     │   │ NVIDIA/NeMo         │
└──────┬───────┘   └──────────┬─────────┘
       │                      │ evidence
       v                      v
┌────────────────────────────────────────┐
│ Receipt verifier / reconstruction       │
│ mandate, card, request, checkpoint,     │
│ policy, payment, endpoint, result/refusal│
└────────────────────────────────────────┘
```

## Hard cuts and allowed external rails for gsd-spec-phase

The Phase 6 SPEC should explicitly cut these from **AE-owned core**:

- marketplace settlement,
- AE-owned seller payouts,
- AE-owned Connect integration,
- AE-owned x402/crypto rail,
- AE custody,
- AE wallet,
- AE credits or balance ledger,
- request market,
- broad action catalog,
- AE-owned product/SKU procurement marketplace,
- inventory truth,
- shipping/tax/fulfillment truth,
- broad MCP/SDK/CLI/plugin ecosystem,
- hosted-agent platform,
- autonomous self-approval,
- provider screenshot proof,
- public production launch claims.

The Phase 6 SPEC should explicitly allow these as **evidence-bound external hackathon rails**:

- Hermes runtime, workflows, cron, sub-agents, and Telegram reporting,
- Link CLI spend request evidence: one-time-use virtual card or SPT after human approval,
- Stripe API payment links, Checkout, PaymentIntent, and webhook/readback evidence,
- NVIDIA NeMo Guardrails execution-rail allow/block evidence,
- Nemotron reasoning/safety evidence when observable,
- one external service/API/infra provisioning attempt if approved and receipt-bound,
- one paid intake endpoint descriptor, JSON schema, and private endpoint/provisioning/payment-gate ref if evidence-bound and not claimed as AE fulfillment truth. An inbox item or deployed URL is supporting evidence only.

## Kill criteria

Defer or kill Phase 6 if any are true:

1. The demo cannot show Hermes visibly scope, select, request, execute, and report a business operation.
2. The demo becomes "Agentic.Market with Stripe swapped in", "Shopify/procurement agent with AE branding", or a generic content-generation/landing-page demo.
3. AE has to own wallet, custody, credits, settlement, sandbox infrastructure, agent runtime, or broad marketplace behavior to make the demo work.
4. Hermes can self-approve spend or bypass the authorization checkpoint.
5. The authorization checkpoint is just UI, not source-owned state.
6. The receipt verifier cannot reconstruct mandate, card version, request, checkpoint, external evidence, result/refusal, and hashes.
7. Stripe evidence cannot be bound to exact approved request/action/amount.
8. NVIDIA/Nemotron/NeMo Guardrails evidence is decorative and does not prove reasoning, safety, or execution-rail allow/block behavior.
9. Public discovery must be polluted with payment/provider fields to make the demo work.
10. Route-local hardcoded fixtures are required.
11. The first implementation plan touches broad Agent Router, request market, wallet, SDK/MCP/CLI, or hosted-agent code inside AE.
12. Real user evidence says the repeated behavior is only Phase 2/P4 local inquiry follow-up, not agent-run business operations.

## Open questions for `/skill:gsd-spec-phase 6`

Spec-phase should ask and resolve these, unless the user chooses `--auto`:

1. Is Phase 6 a hackathon-only spike, a planned product phase, or both with separate acceptance gates?
2. What is the one demo business operation: `provision-paid-intake-endpoint`, another software-scoped operation bundle, or a supplier/procurement branch deferred until after the hackathon?
3. Is Stripe Link CLI spend required, Stripe API revenue required, or both?
4. What exact external purchase/provisioning step is allowed under the demo mandate?
5. What exact result artifact proves Hermes completed useful software work: endpoint descriptor, JSON schema, webhook-verified inbox item, deployed URL, or another artifact?
6. What NVIDIA evidence is observable: NeMo Guardrails execution-rail allow/block, Nemotron reasoning/refusal, privacy routing, sandboxing from a separate source, or some subset?
7. Who is the buyer/operator principal in demo: human buyer, Hermes agent identity, or both?
8. Does the business owner prepublish action cards only, or also accept/refuse each request during the demo?
9. Does Handshake need to be live authority for the demo, or can Phase 6 specify a Handshake-shaped checkpoint with a hard proof-gap label until integration exists?
10. Should Business Action Cards be tied to existing `services[]` from public catalog or a separate `businessActionCards` table with optional service link?
11. What evidence is public verifier-safe versus owner/operator-only?
12. What exact public copy is allowed after Phase 6 without overclaiming production autonomous/payment support?
13. What Phase 4/P5 closeout evidence must exist before executing Phase 6 code?

## Recommended gsd-spec-phase default answers

If running `/skill:gsd-spec-phase 6 --auto`, use these defaults:

1. Treat Phase 6 as **aggressive hackathon spike plus future product option**, not committed production launch.
2. Use **`provision-paid-intake-endpoint` under A$10 test-mode payment evidence** as the demo operation unless the user supplies a better software-scoped operation.
3. Include both Stripe Link CLI spend evidence and Stripe API revenue/payment-link evidence only if each can be bound to exact request/action/amount.
4. Allow one external service/API/infra provisioning attempt; no broad procurement.
5. Result artifact is endpoint descriptor, JSON schema, and private endpoint/provisioning/payment-gate ref. Webhook-verified inbox items, deployed URLs, generated reports, or durable file hashes may support the receipt but cannot satisfy success by themselves.
6. NVIDIA/NeMo Guardrails must show at least one allow and one block/refusal tied to policy.
7. Buyer/operator principal is **human buyer represented by Hermes-like delegated agent**.
8. Business owner has source-owned prepublished action card and explicit accept/refuse checkpoint.
9. Handshake must be represented as source-owned authorization state; if live Handshake is not available, label it proof-gap/simulated and do not claim kernel authority.
10. Business Action Cards are separate source rows with optional service link, not fields on core public catalog/discovery rows.
11. Public verifier returns hashes/facts/status only; owner/operator readbacks can show redacted private evidence refs.
12. Demo copy may say **receipt-backed autonomous business operation** only if Hermes, Stripe, and NVIDIA evidence reconstructs. Production copy may not overclaim.
13. Phase 6 implementation waits for P4 protected-action proof and P5 money-boundary clarity; planning/spike design may proceed now.

## What spec-phase should produce

`06-SPEC.md` should lock:

- the Phase 6 goal,
- whether Phase 6 is hackathon spike, product phase, or both,
- the one demo business operation,
- whether Stripe Link CLI, Stripe API revenue, or both are required,
- what NVIDIA/Nemotron/NeMo Guardrails evidence must be observable,
- the exact non-goals,
- Business Action Card requirements,
- Mandate requirements,
- Capability Request requirements,
- Authorization Checkpoint requirements,
- External Evidence Event requirements,
- Receipt/verifier requirements,
- discovery/copy boundaries,
- demo seed data policy,
- acceptance criteria,
- ambiguity score,
- next step to `/skill:gsd-discuss-phase 6`.

It should not plan implementation tasks. That belongs to discuss/plan phase.
