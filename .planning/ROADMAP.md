# Roadmap - Fresh Agentic Economy

**Status:** technical phase map.

## Roadmap rule

A phase exists only when it unlocks a source-owned capability.

A phase does not exist for narrative, protocol completeness, marketplace surface area, or backup-folder preservation.

## Decision-door register

| Decision | Door | Phase | Rule |
|---|---|---:|---|
| Fresh repo over backup | One-way | 0 | Backup is source mine only. |
| Launch ICP = AU urgent/local services | Two-way after Phase 1 | 1 | Start narrow; expand only if fields/copy still fit unchanged. |
| Convex source of truth | One-way for M1 | 1 | No planning/runtime or UI-authority state. |
| AE-hosted fallback UCP | One-way for Phase 1 copy | 1 | Do not claim standard business-origin UCP. |
| Lifecycle moat as descriptor contract | One-way | 1 | Keep primitives now; no runtime engine. |
| Admin authority source-owned | One-way | 1 | No env-only admin authority. |
| Search adapter | Two-way | 1 | Convex first; external search only after evidence. |
| Money rails | One-way later | 5 | Requires decision record before code. |
| Handshake Protocol Kernel posture | One-way for public positioning | 4/6 | Future protected-action clearance should be HSK-shaped internally; do not expose HSK as a public AE surface or dependency until a phase gate needs it. |
| Agentic business action receipts | One-way for Phase 6 spike | 6 | One source-owned receipt-backed business operation; no runtime/wallet/marketplace/provider authority. |

## Product capability ladder

The product ladder keeps the full ambition visible without letting later phases rewrite current claims.

| Step | Product capability | User-facing proof | Source-owned unlock |
| --- | --- | --- | --- |
| P1 | Truthful storefront and discovery | A provider can publish a useful page, appear in registry/search/API/discovery, and see visibility health. | Claim, publish, suppression, projection, discovery, and operator readback state. |
| P2 | Qualified inquiry and owner response | A customer sends a human first-contact request and the owner can see, reply, or correct. | Durable inquiry, owner inbox, notification readback, abuse controls, and delivery failure states. |
| P3 | Shared human/assistant read layer | Assistants and people can read the same public facts without unsupported actions. | Route-tested public DTOs, discovery files, unsupported/degraded states, and schema parity. |
| P7 | Answer/search demand routing | A natural-language answer routes demand into trusted listings instead of becoming a separate chat product. | Thread evidence, AE action/tool calls for catalog reads, source-bounded artifacts, and share/readback state. |
| P4 | Owner-approved protected action clearance | A consequential next step starts as an exact owner-pending proposal and ends as approval, refusal, receipt, or proof gap. | Policy, owner decision, one-use clearance posture, attempt state, receipt, and reconstruction. |
| P5 | Paid activation | Money enters only through one provider-backed rail with receipt, reversal, dispute, and reconciliation posture. | Billing operation state, provider readback, idempotent receipt, support controls, and operator reconstruction. |
| P6 | Receipt-backed business action proof | One software-scoped business operation can be reconstructed from request through checkpoint, evidence, result, and receipt/proof gap. | Action card, mandate, checkpoint, external evidence binding, artifact, receipt verifier, and no-repair path. |

The ladder is not a public promise. Current public claims stop at the phase that has deployed proof and support posture.

## Phase graph

```text
P1 Spine Foundation
  claim/publish/page/projection/discovery/health
      |
      +--> P2 Human Inquiry
      |      customer inquiry + owner response + notification readback
      |
      +--> P3 Standard Agent/Builder Discovery
      |      read-only public business API, business-origin UCP strategy later,
      |      maybe MCP/OpenAPI read projections only after route-tested demand
      |
      +--> P7 Answer Thread AI
      |      AE agent calls registry/search actions as a demand router into trusted listings,
      |      not a separate open-ended chat product
      |
      +--> P4 Owner-Pending Protected Actions
      |      exact proposal -> policy -> owner approve/reject -> one-use clearance posture
      |      -> attempt/readback -> receipt/proof gap/replay refusal
      |
      +--> P5 Paid Activation
             One Autumn Cloud + Stripe PSP paid-activation rail; Connect/x402/wallet/credits/custody stay out of P5
             |
             +--> P6 Agentic Business Action Receipts
                    one software-scoped business-operation proof with AE checkpoint,
                    external evidence binding, result artifact, and reconstructable receipts
```

P2-P5 are planned as one production system and executed in order by default. P2 proves the human trust loop, P3 exposes only read-only public/discovery projections, P4 admits exactly one owner-approved non-money action under a reconstructable clearance-before-consequence model, and P5 adds one paid activation rail after authority/receipt posture exists. P7 is the answer/search layer that routes demand into trusted listings; it must not become a second product center.

P6 is admitted as a planning/hackathon-spike branch after the P4/P5 authority spine exists in source. P6 must keep hackathon proof separate from production acceptance, and direct Stripe/Link test-mode evidence requires a Phase 6 money-evidence decision before implementation. P6 cannot turn AE into an agent runtime, wallet, marketplace, settlement layer, sandbox, product catalog, generic API marketplace, or provider.

## Phase 1 - Ten-Star Spine Foundation

**Objective:** a launch-ICP owner can claim, publish, see visibility/discovery health, and expose truthful AE-hosted discovery without future-surface claims.

**Ship:**

```text
/claim
/[slug]
/registry
/[slug]/ucp
/api/businesses
/api/businesses/search
/api/businesses/{slug}
/llms.txt
/sitemap.xml
/robots.txt
/admin/claims
/admin/index-health
/admin/audit-events
/privacy/remove-business
```

**Source-owned state:** see `PROJECT.md` durable model.

**Success:** one seeded launch-ICP business can be claimed by an authenticated owner, publish a no-ABN public business service catalog page with workflow-critical facts, see separate `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, service/capability status, `callable=false`, `paymentRequired=false`, and next recovery action, and have an operator reconstruct claim -> publish -> index -> manifest from audit events.

The public business service catalog page must explain demand risk and next owner action in one screen, pass banned-claim copy scan, and state unavailable capabilities explicitly.

Manifest/llms/sitemap checks are engineering readbacks, not owner-facing success.

**Owner activated:** publish succeeded, owner viewed status/readback, owner copied/shared URL or submitted consented next-capability interest, and attribution exists.

**Cut:** payments, wallet, protected actions, request market, skills, expert profiles, hosted agents, voice, persona UI, benchmarks, native mobile, API keys, MCP/OpenAPI tools, developer platform.

**Exit proof:** all Phase 1 plan checks green, GTM internal-alpha proof green, deployment/readback smoke green.

## Phase 2 - Human Inquiry + Owner Inbox

**Objective:** one conservative customer inquiry path.

**Engineering proof:** `firstRequestMode` may expose inquiry only when contact/consent policy, durable message state, owner read/reply, notification readback, abuse controls, and copy tests exist.

**Ship:**

```text
customer inquiry
owner inbox
owner reply
single notification adapter
durable message/audit state
```

**Cut:** autonomous replies, AI handling, booking, payment, action execution, multi-channel support bloat.

**Exit proof:** customer message persists, owner sees it, owner can reply, notification failure is visible and does not lose the message.

## Phase 3 - Standard Agent/Builder Discovery

**Objective:** extend readonly discovery only after P1 truth exists and public list/search/detail APIs have shipped.

**Engineering proof:** builder/agent discovery must be read-only until documented public facts, tested caching, schema parity, unsupported-action flags, and operational readback exist. API keys, MCP, and OpenAPI remain read-only unless a later phase ships server-enforced action capability.

**Ship candidates:**

```text
business-origin /.well-known/ucp strategy if deployable
read-only API keys only if public quotas/private readbacks require them
MCP/OpenAPI read projections only after route-tested support matrix
schema fixtures/evals
```

**Cut:** invocation, tools/actions, payment descriptors, SDK/CLI/plugin unless demand proven.

**Exit proof:** builder can discover public facts and unsupported/degraded capabilities through documented, valid, cached outputs; no P3 surface duplicates the P1 public catalog without adding source-owned capability.

## Phase 7 - Answer Thread AI

**Objective:** make answer/search the trusted demand front door without letting it become a separate chat product.

**Engineering proof:** every answer turn must be grounded in public registry/listing facts retrieved through AE actions/tools, preserve the safe assistant contract, show provider cards before synthesis, and store enough source-owned evidence to reconstruct which tool inputs/results were used and why a next step was suggested.

**Ship:**

```text
AE agent tool loop with registry.search as an action
registry-grounded answer thread
session-scoped thread history
follow-up routing
provider cards and source-bounded artifacts
public share/readback projection
```

**Cut:** hidden typo-correction/search-rewrite preprocessors, open-web search claims, booking, payment, dispatch, generic assistant behavior, owner/private data, ungrounded provider slugs, and write/action execution from the human answer loop.

**Exit proof:** a user can ask, compare providers, follow up, share the answer, and route into a listing or qualified inquiry while the transcript remains reconstructable from source-bounded evidence and tool-call records. Misspellings or vague suburb/service wording are handled by the answer agent choosing better `registry.search` arguments, not by the registry silently correcting queries.

## Phase 4 - Owner-Pending Protected Actions

**Objective:** consequential next steps start as exact proposals and end in owner-approved receipt, refusal, replay refusal, or proof gap.

**Engineering proof:** protected actions may be advertised only as owner-pending; every action requires an exact action contract, policy check, owner approval/rejection, one-use clearance posture, provider/internal attempt state, receipt or proof gap, audit, and dispute/reversal posture. Handshake Protocol Kernel is the internal clearance model to converge on when a phase needs package-level support; it is not a public AE surface in this phase.

**Ship:**

```text
exact action proposal
policy check
owner approve/reject
one-use clearance posture
provider attempt/proof gap
receipt/audit reconstruction
```

**Cut:** autonomous protected execution.

**Exit proof:** every action reconstructs actor, policy, approval, provider attempt, outcome, receipt, and dispute/reversal posture.

## Phase 5 - Paid Activation + Money Rails

**Objective:** add money only after authority and receipt posture.

**Engineering proof:** payment may be advertised only when a concrete rail has provider readback, idempotency, receipt, reversal/dispute, reconciliation, and operator reconstruction.

**Default:** Autumn Cloud as billing/product-ops authority with Stripe as PSP/Checkout/invoice/refund/dispute layer underneath. Direct Stripe Billing + Checkout Sessions as AE's subscription engine is fallback only after an explicit Autumn blocker decision record. Connect Accounts v2, x402/crypto rails, wallet/credits/balance, custody, split payouts, marketplace settlement, request-market settlement, and multi-rail commerce stay out of P5.

**Money rail quarantine:** no `autumn*`, `AUTUMN_`, `stripe*`, `x402`, `wallet`, `credits`, `balance`, `paymentHandler`, provider refs, or rail-specific fields in `business`, `registry`, or `discovery` before the Phase 5 money decision record and owning implementation.

**Exit proof:** provider readback, idempotent ledger/receipt, reversal/dispute, reconciliation, operator reconstruction.

## Phase 6 - Agentic Business Action Receipts

**Objective:** prove one software-scoped, receipt-backed business operation stayed inside mandate through source-owned action facts, buyer mandate, owner approval, checkpoint admission, external evidence, concrete result artifact, and reconstructable Action Receipt.

**Engineering proof:** Business Action Cards may be advertised only as proposal-only, owner-approved, receipt-required capabilities. The single action slug is `provision-paid-intake-endpoint`. External Stripe/Link/Hermes/NVIDIA evidence is admitted only as bound evidence after the AE checkpoint, while pre-checkpoint guardrail allow/block decisions are recorded as decision evidence and never as downstream consequence.

**Ship candidate:**

```text
Business Action Card
buyer/operator mandate
Capability Request
owner authorization checkpoint
GuardrailDecisionEvidence
ExternalEvidenceEvent
endpoint descriptor + JSON schema + private provisioning/payment-gate ref
Action Receipt verifier
```

**Cut:** generic `executeAction`, arbitrary action slugs, provider `other`, broad action marketplace, hosted agent runtime, SDK/MCP/CLI/plugin platform, wallet, credits, balances, custody, Connect, x402, settlement, product marketplace, production execution/payment claims, and OS/process sandboxing claims from NeMo/Nemotron alone.

**Exit proof:** receipt verifier reconstructs success, refusal, proof gap, evidence mismatch, tampered hash, stale card, expired mandate, unbound provider event, and private/public redaction. Direct Stripe test-mode evidence has `06-MONEY-EVIDENCE-DECISION.md`; live mode waits for a later production decision record.

## Bloat relapse detector

Stop if a PR introduces:

- future nav item,
- placeholder module,
- one-implementation adapter for later,
- protocol-first owner copy,
- payment/provider field in core domain,
- Phase 6 action/payment/provider field in core catalog/registry/discovery before source-owned card/checkpoint/receipt enforcement,
- best-effort write without readback/repair,
- boolean state soup,
- backup source copied without source-mining ledger.

## Every phase plan must list

1. source-owned tables/functions/modules,
2. routes shipped,
3. exact non-goals,
4. user-visible states,
5. failure modes and readbacks,
6. repair/runbook actions,
7. tests/commands,
8. no-overclaim copy checks,
9. bloat cuts compared with backup,
10. deployment/readback evidence.
