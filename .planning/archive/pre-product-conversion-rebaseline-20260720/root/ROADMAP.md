# Roadmap - Fresh Agentic Economy

**Status:** technical phase map.

## Roadmap rule

A phase exists only when it unlocks a source-owned capability.

A phase does not exist for narrative, protocol completeness, marketplace surface area, or backup-folder preservation.

## Decision-door register

| Decision | Door | Phase | Rule |
|---|---|---:|---|
| Fresh repo over backup | One-way | 0 | Backup is source mine only. |
| Launch ICP = AU urgent/local services | Two-way after Phase 1 
| Convex source of truth | One-way for M1 
| AE-hosted fallback UCP | One-way for Phase 1 copy 
| Lifecycle moat as descriptor contract | One-way 
| Admin authority source-owned | One-way 
| Search adapter | Two-way 
| Money rails | One-way later | 5 | Requires decision record before code. |
| Handshake Protocol Kernel posture | One-way for public positioning | 4/6 | Future protected-action clearance should be HSK-shaped internally; do not expose HSK as a public AE surface or dependency until a phase gate needs it. |
| Agentic business action receipts | One-way for the Phase 6 spike; per-slug two-way within the admitted set | 6 | A closed, typed, schema-validated set of software-scoped receipt-backed business operations. Each slug is individually admitted through ADR-005 D1's per-slug checklist. No generic `executeAction`, no arbitrary/caller-supplied slugs, no runtime/wallet/marketplace/provider authority. |
| 14-day bootstrap gate | One-way before public platform widening | Gate | No public shipment beyond the storefront prototype and qualified inquiry until `.planning/scopes/scope-14day-bootstrap-gate/` records 30–50 source-backed profiles, 10 recruited providers, 100 attributable sessions, ≥10 qualified inquiries, ≥5 voluntary provider corrections/listing requests, and zero boundary overclaim. |
| Scope execution readiness map | One-way for current orchestration | Gate | `.planning/scopes/SCOPE-EXECUTION-READINESS.md` is the active routing table for Scopes 1-7. It separates source/local work from deployed/provider/live proof, names #5/#33/#36 and PM gates, and points Scopes 2-5 at active lightweight indexes before subagents execute archived plans. |

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

## Active bootstrap gate

The current go/no-go gate is `.planning/scopes/scope-14day-bootstrap-gate/`. It blocks public shipment of later platform rungs beyond the storefront prototype and qualified-inquiry path until the 14-day evidence exists. Future quote, booking handoff, paid, protected, or autonomous action language stays future-worded and non-public unless a later decision record admits it from that evidence.

Execution routing now starts from `.planning/scopes/SCOPE-EXECUTION-READINESS.md`. Archived Scope 2-5 plans are historical/source-local inputs unless the active lightweight index for that scope names them as executable under current gates. This prevents source/local Phase 6 proof, archived demo plans, or unresolved deployed smokes from being mistaken for product readiness.

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

**Exit proof:** all Phase 1 plan checks green, GTM internal-alpha proof green, deployment/readback smoke green. Agent-facing GTM claims additionally require the deployed ADR-006 agent-experience gate (issue #36) to pass against the real deployed surface.

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

**Exit proof:** a user can ask, compare providers, follow up, share the answer, and route into a listing or qualified inquiry while the transcript remains reconstructable from source-bounded evidence and tool-call records. Misspellings or vague location/category/request wording are handled by the answer agent choosing better `registry.search` arguments, not by the registry silently correcting queries.

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

### Phase 1: Action invocation decomposition

**Goal:** Make ADR-009/010 partial-entry + one-action-plane decomposition buildable: concrete seam, first standalone action, persistence, per-action authority, and executable acceptance gates — design only, no source.
**Requirements**: ADR-009 (partial entry without Request ownership, 11 acceptance gates), ADR-010 (one action plane, 10 acceptance gates), and `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md` (§1-12, GitHub #193) are locked inputs.
**Depends on:** customer-product-frontier frontier (wayfinder map #112) — this phase reframes the Request-owned lifecycle that frontier built into independently-authorized action invocations.
**Boundary:** Design/planning phase only. Produces GSD planning artifacts (SPEC/RESEARCH/PLAN + pattern map) under `.planning/`. No `src/**`, `convex/**`, or test edits. Does not change ADR status, supersede an ADR, or close #193. Stops at plan-checker green; source implementation is a separate, explicitly-authorized execute-phase.
**Plans:** 1 plan (planned 2026-07-17; design-only, not executed)
**Status:** Planned — plan-checker green. Deliverables: `01-SPEC.md`, `01-CONTEXT.md`, `01-RESEARCH.md`, `01-PATTERNS.md`, `01-01-PLAN.md`. Stops before execute-phase; source implementation requires separate authorization.

Plans:

- [ ] 01-01-PLAN.md — Commit one buildable answer per axis (seam / first action / persistence / authority binding / four-dimension state / barrier experiment) + future build backlog (spec §12 steps 1-8). Design-only.

### Phase 2: One action plane cross-surface parity

**Goal:** Make ADR-010 buildable: one registered action drives the embedded AE agent and at least one external-agent surface with proven semantic outcome parity, a structured non-visual equivalent for every rich projection, host-adapter boundary enforcement, reconstruction-from-records, and the six generative-UI projection families — design only, no source.
**Requirements**: ADR-010 (one action plane across human and agent experiences, 10 acceptance gates) is the locked input; ADR-009 + `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md` (#193) and Phase 1's Action Invocation interface are locked upstream context.
**Depends on:** Phase 1 (action-invocation-decomposition) — this phase consumes the Action Invocation interface/state model Phase 1 designs and does not re-decide seam/persistence/authority.
**Boundary:** Design/planning phase only. Produces GSD planning artifacts (SPEC/CONTEXT/RESEARCH/PLAN + pattern map) under `.planning/`. No `src/**`, `convex/**`, or test edits. Does not change ADR status, supersede an ADR, or close #193. Stops at plan-checker green; source implementation is a separate, explicitly-authorized execute-phase.
**Plans:** 1 plan (planned 2026-07-17; design-only, not executed)
**Status:** Planned — plan artifacts written. Deliverables: `02-SPEC.md`, `02-CONTEXT.md`, `02-RESEARCH.md`, `02-PATTERNS.md`, `02-01-PLAN.md`. Stops before execute-phase; source implementation requires separate authorization.

Plans:

- [ ] 02-01-PLAN.md — Commit one buildable answer per axis (semantic-parity contract / host-adapter boundary / structured non-visual equivalent / generative-UI families / reconstruct-from-records / parity eval) + ADR-010 10-gate→test table + future build backlog. Design-only.

