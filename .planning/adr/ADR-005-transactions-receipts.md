---
# ADR-005: Transactions + Receipts — Productize Phase 6 into the Receipt-Backed Action Loop
Status: Accepted (defer)
Date: 2026-07-03
Scope: 5 — Transactions + receipts (productize the Phase 6 spike into the hackathon-ready loop)

## Context

Phase 6 shipped as **source/local engineering proof only** for a single hardcoded action slug,
`provision-paid-intake-endpoint` (`src/modules/business-action/internal/schema.ts:21`; verified
`06-VERIFICATION.md` 21/21, `source_local_proof_boundary.production_executable: false`). The bones
of the receipt loop already exist and are test-backed: Business Action Card, Buyer Mandate,
Capability Request, Authorization Checkpoint, GuardrailDecisionEvidence, ExternalEvidenceEvent,
Stripe test-mode Checkout evidence, and a recomputing receipt verifier
(`verifyActionReceipt`/`verifyReceiptStatus`, `business-action.ts:638`/`:910`).

The deficit (`local://five-scopes.md` scope 5): the loop is a **one-slug local spike**, is not
exposed through the agent door, has no public receipt-verification surface, has no demo kit, and
Stripe is test-mode-only behind `06-MONEY-EVIDENCE-DECISION.md`. To become the "hackathon weapon"
the loop must widen to a **typed, individually-admitted** slug set, expose a proposal action to
attributed+mandated agents (scope 3), publish a public read-only receipt verifier, and ship a demo
kit — all without crossing the AGENTS.md trust contract (no booking/payment/dispatch/autonomous
fulfillment; "verified" only against a named standard) or the ROADMAP money/marketplace doors.

Why now: scopes 2 (agent-native supply) and 3 (agent identity + mandate) unlock the counterparties
and the attributed caller this loop needs; the minimum hackathon path is `1 -> 3 -> 5`
(`local://five-scopes.md` Sequencing). Scope 5 is the differentiator: the sponsor stack
(Hermes/Stripe/NVIDIA) answers workflow/money/sandbox but has **no** answer for discovery +
counterparty trust — the AE receipt chain is reputation for businesses no human runs.

## Grilling record

### Q1 — Exact door-amendment wording that widens the one-slug rule to a typed, individually-admitted set
- **Evidence:** ROADMAP door "Agentic business action receipts" is `One-way for Phase 6 spike / One
  source-owned receipt-backed business operation; no runtime/wallet/marketplace/provider authority`
  (`.planning/ROADMAP.md:24`). `local://five-scopes.md:38` explicitly requires "a new decision
  record amending the P6 one-slug door (each slug individually admitted with full
  card/checkpoint/receipt rigor; still no generic executeAction, no arbitrary slugs, no marketplace
  relapse)". Slug pin sites the amendment must cover: closed set `BusinessActionSlugValues`
  (`schema.ts:24`), Convex `v.literal(BusinessActionSlug)` validators
  (`convex/businessActions.ts:80`, `convex/businessActionStore.ts:78`), module guards with
  singleton error copy (`business-action.ts:254-256`, `:714`, `:984`), and hashes that hardcode
  `actionSlug: BusinessActionSlug` (`research-ae-seams.md` splice point v).
- **Answer:** Amend the door to admit a **closed, typed set** where each slug passes a 6-point
  per-slug admission checklist (D1). The door stays one-way for the *concept* of a slug set but
  each *slug* is a deliberate, individually-reviewed admission — never a generic `executeAction`,
  never a caller-supplied/arbitrary slug. See **D1**.
- **Confidence:** high (evidence is explicit and prescriptive).

### Q2 — v1 slug set (2-3 software-scoped operations) and their card schemas
- **Evidence:** Existing slug `provision-paid-intake-endpoint` (`schema.ts:21`) with result-artifact
  requirements `endpoint_descriptor | json_schema | private_endpoint_provisioning_payment_gate_ref`
  (`schema.ts:80-84`) and external-evidence providers incl. `stripe_test_mode` (`schema.ts:61-66`).
  Exit proof requires reconstruction "for >=2 distinct action slugs" (`local://five-scopes.md:40`).
  Handshake software-scoped adapter families that map to AE's focus: `auth-md` protected-HTTP-call
  (most AE-relevant), `package-install`, `preview-deploy`, `repo-write` (`research-handshake.md`
  §3). ROADMAP cut list forbids marketplace/SKU/procurement (`ROADMAP.md:224`).
- **Answer:** v1 = **2 slugs**. Keep `provision-paid-intake-endpoint` (payment-gated). Add ONE
  non-paid mirror, `publish-agent-intake-endpoint`, whose result artifact requires
  `endpoint_descriptor | json_schema` only (no payment-gate ref) and whose allowed external
  evidence is `hermes | endpoint_host` (no Stripe). The non-paid slug proves the verifier
  reconstructs a **money-free** receipt chain, giving the ">=2 distinct slugs, success + refusal"
  exit proof cheaply. See **D2**. A third slug (`rotate-intake-endpoint-access`) is deferred (fog).
- **Confidence:** medium-high (2-slug decision and the paid slug are settled; exact non-paid card
  fields against the confirmed scope-2 demo business are a ticket — T2).

### Q3 — Agent-door proposal action (id, contracts, surfaces, boundaries, mandate requirement)
- **Evidence:** Actions are `defineAction(...)` registered in `src/modules/actions/index.ts:22`;
  `submitInquiryAction` is the only exposed write (`inquiry.actions.ts:96`, surfaces
  `agentJson`+`agentTools`, `readOnly:false`). The agent door derives **no identity** today
  (`api.agent.tools.ts:112` `contextFromRequest` → `runHarnessTool({...allowWrites:true})`);
  `research-ae-seams.md` risk 6: "Before adding identity-gated or clearance-gated writes at this
  door, workstream (b)'s signature verification MUST land first." Mandate is buyer-side authority
  (`06-ENGINEERING-REQUIREMENTS.md:391`). Command options may carry idempotency key + correlation
  id but never caller-supplied authority (`06-ENGINEERING-REQUIREMENTS.md:322`).
- **Answer:** Define `businessAction.propose` (module-namespaced per AE convention, not the raw
  `action.propose`). Input: `{cardId, cardVersion, mandateId, actionSlug, inputSummary,
  requestedAmountCents?, currency?, idempotencyKey?, correlationId?}`. Output is a discriminated
  union that is **never a completed consequence**: `approval_required | clarification_required |
  refused | proof_gap` readback (a proposal creates a Capability Request + owner-pending
  checkpoint, per `06-ENGINEERING-REQUIREMENTS.md:324`). Surfaces `agentJson`+`agentTools`, but
  **exposure is BLOCKED until scope 3 lands attributed identity** — the propose write MUST require
  an attributed principal bound to an active mandate (spend cap/TTL/allowed slug/allowed business).
  See **D3**. The mandate-at-door binding is a scope-3-coupled ticket (T6).
- **Confidence:** high on the contract shape; the exposure is deliberately gated on scope 3.

### Q4 — Checkpoint approval: is buyer/principal-side approval in v1?
- **Evidence:** `AuthorizationCheckpoint` carries `ownerDecisionRef?` and an accepted checkpoint
  requires a non-empty `ownerDecisionRef` + non-expired window (`schema.ts:191-206`,
  `business-action.ts:340-352`). There is **no** buyer/principal checkpoint field or interactive
  buyer-confirmation path anywhere in the module. Mandate is "buyer-side authority, not
  business-side authority ... created up front" (`06-ENGINEERING-REQUIREMENTS.md:391`). Handshake's
  per-spend buyer confirmation (Link-app analog) lives in the `x402-payment` wallet-gateway
  (`research-handshake.md` §3), which is explicitly cut from AE core (`ROADMAP.md:224`).
- **Answer:** v1 has **owner-side approval only**. The buyer/principal side is represented by the
  **mandate** (an up-front, cap/TTL/slug/business-bounded authority), NOT by an interactive
  per-action buyer confirmation. The Link-app "human approves each spend" analog is explicitly OUT
  of scope 5 v1. See **D4**.
- **Confidence:** high (evidence settles it; no buyer-approval seam exists to build on).

### Q5 — Public receipt-verification endpoint shape + redaction guarantee
- **Evidence:** `verifyActionReceipt` returns `{reconstructionStatus, publicReadback,
  privateReadback?}` (`business-action.ts:638`, `:138`); `verifyReceiptStatus` reconstructs
  `complete | incomplete | proof_gap | tampered | evidence_mismatch | stale_source |
  expired_mandate | unbound_provider_event | refused_no_consequence` (`schema.ts:103-113`).
  `PublicActionReceiptReadback` exposes **hashes + outcome + labels + reconstructionStatus only**
  (`schema.ts:299-314`). Today only `readCurrentOwnerBusinessActionReceipt` (owner-scoped) reads
  receipts — **no public read exists**. Phase 6 redaction rules: public readbacks are hash/metadata
  only; raw prompts/traces/provider payloads/endpoint refs/keys stay owner_admin_operator_only
  (`STATE.md:157`, `research-ae-seams.md` risk 2).
- **Answer:** Expose a **read-only** receipt verification as (a) an agent-door read action
  `businessAction.verifyReceipt` (`readOnly:true`, `agentJson`+`agentTools`, no identity needed —
  hash-only output) and (b) an HTTP JSON route. Input: `{receiptId}` (a receipt id/hash the caller
  already holds — **not enumerable, no list endpoint**). Output: `PublicActionReceiptReadback` with
  the reconstruction status mapped to public epistemic states in the JSON/agent surface only
  (success←complete, refusal←refused_no_consequence, proof-gap←proof_gap, tamper←tampered,
  expired-mandate←expired_mandate). Redaction is guaranteed by reusing the existing
  `PublicActionReceiptReadback` projection — no new field leaks. See **D5**. Enumeration/rate-limit
  posture + human-surface copy for a "verify" page is a ticket (T5).
- **Confidence:** high on shape/redaction; privacy/enumeration posture is the open sub-question.

### Q6 — Stripe live-mode gate chain + required money-evidence decision-record contents
- **Evidence:** ROADMAP door "Money rails" is `One-way later / Phase 5 / Requires decision record
  before code` (`ROADMAP.md:22`). `06-MONEY-EVIDENCE-DECISION.md` authorizes **test mode only** and
  states "live mode waits for a later production decision record" (`ROADMAP.md:226`,
  `06-MONEY-EVIDENCE-DECISION.md:34`). `local://five-scopes.md:38`: "Stripe live-mode only behind
  money-evidence decision record + scope 1 deployed smoke discipline." Current Scope 1 closeout is
  the full deployed evidence suite, including `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
  (`.planning/scopes/SCOPE-EXECUTION-READINESS.md`; smoke file present).
- **Answer:** Scope 5 stays **Stripe test-mode only** and does **not** implement live mode. Live
  mode is gated behind an explicit chain (D6): (1) scope 1's deployed evidence suite is green against a
  deployed env, incl. the phase-6 Stripe test-mode webhook smoke; (2) a new
  `06-LIVE-MONEY-EVIDENCE-DECISION.md` record whose required contents are enumerated in D6; (3)
  reconciliation/dispute/refund posture proven; (4) copy scans still forbid autonomous/production
  payment claims. See **D6**. Drafting that record's full contents is research ticket T3.
- **Confidence:** high (the gate is prescribed; scope 5 explicitly does not cross it).

### Q7 — Demo kit location, contents, run instructions, copy rules
- **Evidence:** No `examples/` dir exists yet (glob confirmed). ENGINEERING-REQUIREMENTS rejects
  "route-local demo fixtures" and "hosted-agent platform" (`06-ENGINEERING-REQUIREMENTS.md:88`,
  `:86`). Handshake host profiles `hermes-activation`/`openclaw-activation` are the demo-kit shape
  (per-host activation profiles inside `x402-payment`, `research-handshake.md` §3). AGENTS.md
  forbids protocol vocab on human surfaces (`source-owned`, `callable`, `autonomous`,
  `agent-native`, `MCP`...) and any booking/payment/dispatch claim.
- **Answer:** Ship the kit under `examples/` (a top-level, non-route, non-src fixture tree):
  a seeded agent-operated business fixture (Convex seed script), an external-agent script shaped
  like a Hermes skill that drives the door (propose → owner approves out-of-band → external
  test-mode evidence → read receipt), and a README with run instructions. Copy rules: describe it
  as a "receipt-backed business operation" demonstration, **never** an "autonomous business"; state
  test-mode-only; keep all human-readable copy free of protocol vocab. See **D7**. The real
  Hermes-runtime-vs-Hermes-shaped-local-script choice + the fixture built on the confirmed scope-2
  business is a prototype ticket (T4).
- **Confidence:** medium-high (shape settled; concrete fixture depends on scope 2 + a prototype).

### Q8 — Hackathon-vs-production separation
- **Evidence:** ROADMAP P6 rule: "P6 must keep hackathon proof separate from production acceptance"
  (`ROADMAP.md:73`). `06-VERIFICATION.md` `source_local_proof_boundary.production_executable:
  false`. STATE blockers require deployed provider-smoke evidence before any production/live claim
  (`STATE.md:170`). Provider smoke fails loud until configured (`06-VERIFICATION.md:82`).
- **Answer:** The demo kit's output and README are labeled **hackathon / test-mode / local proof**;
  production acceptance is a strictly higher bar = scope 1's deployed 5-smoke discipline + the
  live-money decision (D6). Copy scans forbid production/autonomous/money claims in kit copy. The
  kit never mutates production acceptance state; it exercises the same source loop against seeded
  data. See **D8**.
- **Confidence:** high (rule is explicit and already enforced by the verification boundary).

## Decisions

**D1 — Amend the Phase 6 one-slug door to a typed, individually-admitted slug set.**
Proposed replacement ROADMAP door row:
> | Agentic business action receipts | One-way for the Phase 6 spike; per-slug two-way *within* the
> admitted set | 6 | A **closed, typed, schema-validated set** of software-scoped receipt-backed
> business operations. Each slug is individually admitted against the D1 per-slug admission
> checklist. No generic `executeAction`, no arbitrary/caller-supplied slugs, no
> marketplace/runtime/wallet/provider authority. |

**Per-slug admission checklist** (ALL must pass before a slug may enter `BusinessActionSlugValues`):
1. **Schema** — slug added to the closed `BusinessActionSlugValues` union (`schema.ts:24`); a
   per-slug card profile fixes `resultArtifactRequirements`, `allowedExternalEvidenceProviders`,
   and amount/currency posture; the card invariants `posture:'proposal_only'`, `callable:false`,
   `paymentRequired:false`, `ownerApprovalRequired:true`, `receiptRequired:true` are preserved
   (`schema.ts:125-149`). Convex validators switch `v.literal(BusinessActionSlug)` →
   `literalUnion(BusinessActionSlugValues)` (`convex/businessActions.ts:80`, `businessActionStore.ts:78`).
2. **Checkpoint** — owner-approval path exists; accepted requires non-empty `ownerDecisionRef` +
   non-expired window (`business-action.ts:340-352`); refused/expired/proof-gap emit terminal
   readback with no consequence.
3. **Receipt rigor** — the card's `actionSlug` is threaded into every hash payload
   (request/checkpoint/result/receipt) instead of the `BusinessActionSlug` constant, so
   `verifyReceiptStatus` reconstructs `complete` + `refused_no_consequence` for that slug and
   detects tamper/evidence_mismatch/stale_source/expired_mandate (`business-action.ts:910-1002`).
4. **Support record** — a `BusinessActionSupportRecord`/`capabilityLaunchSupportRecord`-style row
   (named owners/operators, `claimDisablePath`, kill rule, operatorNextAction; `schema.ts:316-329`,
   mirrors the P2 support gate `STATE.md:140`) exists and gates selection of the slug.
5. **Copy scan** — no booking/payment/dispatch/autonomous/marketplace claims for the slug on any
   human surface; the action's `boundaries[]` list is boundary-honest (AGENTS.md).
6. **No generic executeAction / no caller-supplied slug** — the door validates `isBusinessActionSlug`
   against the closed set; an unknown slug returns a typed refusal (`business-action.ts:254-256`).

**D2 — v1 slug set = exactly two slugs.**
- `provision-paid-intake-endpoint` (existing, payment-gated): `resultArtifactRequirements =
  [endpoint_descriptor, json_schema, private_endpoint_provisioning_payment_gate_ref]`;
  `allowedExternalEvidenceProviders = [hermes, stripe_test_mode, endpoint_host]`;
  `maxAdvertisedAmountCents` + `currency` present.
- `publish-agent-intake-endpoint` (new, non-paid mirror): card label `Publish agent intake endpoint`;
  descriptor kind `action_card` with `{ actionSlug: 'publish-agent-intake-endpoint', cardRef }`;
  `resultArtifactRequirements = [endpoint_descriptor, json_schema]`;
  `allowedExternalEvidenceProviders = [hermes, endpoint_host]`; no amount/currency fields and no
  Stripe/Link evidence. Posture stays `proposal_only`, `callable:false`, `paymentRequired:false`,
  `ownerApprovalRequired:true`, and `receiptRequired:true`. Readiness/visibility: the capability
  starts `business_supplied`, may be selected for the demo only when the D1 support record is
  `resolved`, and becomes `checked` only from receipt reconstruction for a completed/refused run
  (not from cron reachability alone). Demo TTL caps: mandate <= 24h; request/checkpoint <= 15m;
  seeded CI fixtures may use shorter TTLs. Policy flags: `software_scoped`, `owner_approved`,
  `receipt_required`, `no_money_rail`, `no_autonomous_claim`, `no_public_execution_claim`.
  This proves the receipt verifier reconstructs a money-free chain and satisfies the ">=2 distinct
  slugs, success + refusal" exit proof (`local://five-scopes.md:40`) without a second money surface.
  Both slugs preserve all D1 invariants.

**D3 — Define `businessAction.propose` as a proposal-only agent action; exposure gated on scope 3.**
`defineAction` sketch:
```ts
export const proposeBusinessActionAction = defineAction({
  id: 'businessAction.propose',
  name: 'Propose a business action for owner approval',
  summary:
    'Propose a software-scoped business action (e.g. provision a paid intake endpoint) against a ' +
    'published action card, under an active buyer mandate. Creates an owner-pending proposal and ' +
    'returns approval-required, clarification, refusal, or proof-gap readback. It never books, ' +
    'charges, dispatches, or executes.',
  boundaries: [
    'Proposal only. It creates a request for owner review; it does not execute, pay, or dispatch.',
    'Requires an active buyer mandate bound to the calling identity (spend cap, TTL, allowed slug, allowed business).',
    'Refuse if the principal wants instant execution, autonomous fulfillment, or to bypass owner approval.',
    'Returns a receipt/proof-gap; a completed consequence only follows separate owner approval and evidence.',
  ],
  schema: proposeBusinessActionSchema,      // { cardId, cardVersion, mandateId, actionSlug, inputSummary, requestedAmountCents?, currency? }
  outputSchema: proposeBusinessActionOutputSchema, // discriminated union: approval_required | clarification_required | refused | proof_gap | error
  parameters: proposeParameters,
  readOnly: false,
  surfaces: ['agentJson', 'agentTools'],    // registration DEFERRED until scope 3 identity lands
  run: async ({ data, context }) => proposeBusinessActionThroughSource(data, context),
})
```
Write scope reuses the closed `protected_action` source-write scope (`STATE.md:146`). The action
is authored in scope 5 but NOT added to `src/modules/actions/index.ts` (nor exposed at
`api.agent.tools.ts`) until scope 3 verifies an attributed principal and binds it to a mandate at
the door — anonymous exposure is forbidden (`research-ae-seams.md` risk 6). `CommandOptions` may
carry idempotency key + correlation id only, never caller-supplied owner/admin/business authority.
Scope-3 binding shape: `api.agent.tools.ts` must derive the principal from the verified signed
request identity, then read an active clearance mandate whose `actionRef` is a canonical
business-action proposal ref (for example `businessAction.propose:<businessId>:<actionSlug>`) and
whose `allowedScopes` include `protected_action`. The clearance layer validates principal,
action class/ref, scope, TTL, and optional amount cap; the business-action `BuyerMandate` then
validates the concrete business id, action slug, amount, currency, and request TTL before a
Capability Request is created. Refusal codes are explicit and pass through as typed
proposal refusals: identity layer `clearance_mandate_required`,
`clearance_mandate_principal_mismatch`, `clearance_mandate_action_class_mismatch`,
`clearance_mandate_action_ref_mismatch`, `clearance_mandate_scope_not_allowed`,
`clearance_mandate_amount_cap_exceeded`, `clearance_mandate_expired`,
`clearance_mandate_revoked`, `clearance_mandate_not_active`; business-action layer
`mandate_not_found`, `mandate_revoked`, `mandate_not_active`, `mandate_expired`,
`wrong_action`, `wrong_business`, `amount_over_max`, `wrong_currency`. Idempotency key and
correlation id flow from the agent-tool request into the source-write admission and the resulting
Capability Request; no caller-supplied owner/admin/business authority is accepted.


**D4 — v1 checkpoint approval is owner-side only; buyer/principal side is the up-front mandate.**
The consequence boundary is the owner-approved `AuthorizationCheckpoint` (`ownerDecisionRef`
required for `accepted`). Buyer/principal intent is bound *before* the proposal via the
`BuyerMandate` (cap/TTL/slug/business), not via an interactive per-action buyer confirmation. The
Handshake Link-app per-spend buyer-confirmation analog is **explicitly out of scope 5 v1** (it lives
in `x402-payment` wallet-gateway, cut from AE core). Boundary recorded so future work does not
silently add a buyer-approval verb.

**D5 — Public read-only receipt verification, hash-only, non-enumerable.**
Add `businessAction.verifyReceipt` (`readOnly:true`, surfaces `agentJson`+`agentTools`, no identity
required) and a JSON HTTP route, both keyed on an unguessable receipt ref the caller already holds
(`receiptId` or receipt hash; no sequential lookup, no list endpoint, rate-limited by IP/principal
where available). Output is the existing `PublicActionReceiptReadback` and no more: receipt id,
action slug, outcome, reconstruction status, card version, source hashes, labels, and recorded time.
The readback reveals only that a named action receipt exists for a held reference and how the source
hashes reconstruct; it does not reveal prompts, traces, raw provider payloads, endpoint refs, keys,
contact details, payment data, owner/admin notes, or private evidence. Public epistemic vocabulary
(success/refusal/proof-gap/tamper/expired-mandate) appears only in JSON/agent surfaces, never as
labels on a human page (AGENTS.md epistemic-vocabulary rule). Human verify-page copy must use plain
language such as "This receipt matches AE's recorded evidence", "The business refused the proposal",
"AE cannot reconstruct enough evidence for this receipt", "This receipt has changed or no longer
matches the recorded evidence", and "The approving mandate had expired"; no `KNOWN`/`UNKNOWN`,
`proof_gap`, `tampered`, `MCP`, `callable`, `autonomous`, `agent-native`, or protocol vocabulary.

**D6 — Scope 5 stays Stripe test-mode only; live mode is gated (and not implemented here).**
Live-mode gate chain (ALL required, in order):
1. **Scope 1 deployed-smoke discipline** — the Scope-1 deployed evidence suite in
   `.planning/scopes/SCOPE-EXECUTION-READINESS.md` is green against a deployed env, including
   `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` in test mode, with non-secret
   evidence artifacts attached.
2. **A new `06-LIVE-MONEY-EVIDENCE-DECISION.md`** record whose required contents are: named
   decision owner + date; live-mode credential ownership (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
   as live, server-only, no `VITE_`); the exact live binding contract (request/checkpoint/receipt
   refs via `client_reference_id`+metadata); refund/dispute/chargeback posture; reconciliation
   states (`matched|missing|mismatched|provider_unavailable|retry_available|retry_exhausted|
   no_repair`, per `06-MONEY-EVIDENCE-DECISION.md:112`); support/kill-rule rows; the copy-scan
   allowlist; and an explicit statement that live money does not create AE-owned wallet/credits/
   custody/Connect/x402/settlement (still cut, `ROADMAP.md:224`).
3. **Reconciliation/dispute/refund proven** against the deployed test-mode env first.
4. **Copy scans** still forbid autonomous/production/marketplace payment claims.
Scope 5 v1 implements none of live mode; it delivers the loop and demo kit in test mode. Drafting
the full record contents = T3.

**2026-07-04 live-money defer addendum.** The payment-security FIX-NOW foundation is landed, but
live money remains **HORIZON**. The authoritative fix-wave evidence is `local://ae-wave-results.md`:
SSRF in `storefront.importDraft` resolved; production dependency vulnerabilities resolved
(`npm audit --omit=dev` now 0 vulnerabilities); `AE_SOURCE_WRITE_SECRET` split into scoped
key families with `keyId`/rotation/fail-closed production posture; and quiet-door/WBA replay +
request-binding debt resolved with body digest binding, durable Convex nonce consumption, expanded
WBA covered components, and removal of operation/correlation self-attestation fallback. The
orchestrator gate recorded `test:unit` 741 pass (133 files), `test:integration` 101 pass (27 files),
`tsc --noEmit` 0 errors, `check:convex-codegen` exit 0, `test:copy` 109 pass, `test:seo` 23 pass,
`test:source-mining` 2 pass, and `npm audit --omit=dev` 0 vulnerabilities; graph freshness is stale
by design on the dirty worktree and remains gated on commit decision.

This ADR accepts the **defer** decision: AE remains SAQ-A-compatible in architecture direction
(PSP-hosted card entry, no AE PAN/CVC storage observed in the audited payment-adjacent paths), but
AE does **not** claim independent certification and must not use compliance/verification wording for
card-data posture. The live-money decision can be reversed only when ALL hold:
1. the 14-day bootstrap gate in `.planning/scopes/scope-14day-bootstrap-gate/` passes;
2. `.planning/scopes/scope-14day-bootstrap-gate/06-LIVE-MONEY-EVIDENCE-DECISION.md` is completed
   with owner and date;
3. the enumerated live-money controls are implemented: refunds, disputes, chargebacks,
   reconciliation, support owner, kill switch, alerts, rollback, deployed test-mode payment smokes,
   provider base-URL allowlist, webhook replay ledger, SAQ-A-compatible boundary enforcement,
   payment-adjacent PII retention/redaction, and direct public mutation hardening.

Until then, payment copy and product posture stay future-gated: AE does not book, charge, dispatch,
custody funds, settle payouts, or auto-fulfil. The path-forward synthesis is
`.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-PATH-FORWARD.md`.

**D7 — Demo kit under `examples/`.**
Structure (illustrative):
```text
examples/receipt-backed-business-action/
  README.md                 # what it proves, run steps, explicit test-mode/hackathon labeling
  seed-business.ts          # seeds one agent-operated business + action card fixture into dev Convex
  agent-script.ts           # Hermes-skill-shaped external agent: propose -> (owner approves) -> evidence -> read receipt
  .env.example              # test-mode STRIPE_* + CONVEX_URL placeholders (no secrets committed)
```
Copy rules (kit README + any human text): use "receipt-backed business operation"; **never**
"autonomous business", "agent marketplace", "agent checkout", "AI checkout", "wallet for agents"
(`06-ENGINEERING-REQUIREMENTS.md:127-136`); state Stripe **test mode** and owner-approval
explicitly; keep protocol vocab out of human copy (AGENTS.md). The kit reuses source seams; it
introduces no route-local fixtures (`06-ENGINEERING-REQUIREMENTS.md:88`) and no hosted-agent
runtime. Concrete fixture + Hermes-runtime choice = T4.

**D8 — Hackathon proof is strictly separated from production acceptance.**
The demo kit produces **local/test-mode** proof only and is labeled as such. Production acceptance
is the higher bar: scope 1's deployed 5-smoke discipline + D6's live-money decision + deployed
owner/admin/public receipt readbacks. The kit never flips production acceptance state; copy scans
reject production/autonomous/money claims in kit output (`ROADMAP.md:73`, `STATE.md:170`).

## Consequences

**Positive**
- The one-slug spike becomes a bounded, typed loop with a public trust artifact (verifiable
  receipt) — the exact "counterparty trust for businesses no human runs" wedge the sponsor stack
  lacks.
- Widening is safe-by-construction: the D1 checklist forces card/checkpoint/receipt/support/copy
  rigor per slug, so no slug can quietly relapse into autonomy/payment/marketplace claims.
- The non-paid second slug (D2) buys the ">=2 slugs" exit proof without a second money surface.
- Owner-only approval (D4) keeps the consequence boundary simple and honest; the mandate carries
  buyer intent without an interactive buyer verb AE would have to defend.

**Negative / cost**
- Threading `actionSlug` through the hash chain (D1.3) touches the verifier's tamper oracle
  (`business-action.ts:910-1002`); done wrong it silently breaks reconstruction for BOTH slugs.
  Mitigated by prototype ticket T1 before ratification.
- `businessAction.propose` (D3) is inert until scope 3; scope 5 authors but cannot expose the
  headline capability alone — the hackathon path genuinely needs the `1 -> 3 -> 5` order.

**Risks**
- **Anonymous-door blast radius** — exposing a widened write at `api.agent.tools.ts` before scope 3
  identity would make a protected proposal reachable anonymously (`research-ae-seams.md` risk 6).
  Guardrail: D3 forbids registration until identity lands.
- **Redaction regression** — a new public verify surface must not add fields beyond
  `PublicActionReceiptReadback`. Guardrail: reuse the projection verbatim; T5 pins enumeration.
- **Money-door creep** — any "just enable live Stripe for the demo" shortcut violates the ROADMAP
  money door. Guardrail: D6 makes live mode a separate, unmet decision record.

## Alternatives considered

- **Generic `executeAction` / open slug registry.** Rejected: explicitly cut (`ROADMAP.md:224`,
  `06-ENGINEERING-REQUIREMENTS.md`), and P4 already rejected generic action registries
  (`04-ACTION-SELECTION.md` per `06-ENGINEERING-REQUIREMENTS.md:46`). The D1 typed closed set is the
  boundary-honest middle ground.
- **Keep exactly one slug for the hackathon.** Rejected: exit proof requires >=2 distinct slugs
  (`local://five-scopes.md:40`) and a single money-gated slug can't demonstrate the verifier on a
  money-free chain.
- **Adopt the Handshake x402-payment adapter (wallet-gateway) for buyer spend.** Rejected for v1:
  wallet/x402/custody are cut from AE core (`ROADMAP.md:224`); the `auth-md` protected-HTTP-call
  adapter is the closer future template, and Handshake convergence is scope 3/handshake-gated
  (`research-handshake.md` §3, `ROADMAP.md:23`).
- **Enable Stripe live mode for a "real" demo.** Rejected: crosses the one-way money door without a
  decision record and scope 1 deployed proof; test-mode evidence is sufficient and honest for the
  hackathon (D6, D8).
- **Interactive buyer/principal per-action approval (Link-app analog).** Rejected for v1: no seam
  exists, the mandate already carries buyer authority, and it pulls in the cut wallet-gateway
  (D4).
- **Add a new `business_action` source-write scope.** Rejected: reuse the closed `protected_action`
  scope (`STATE.md:146`); a new scope touches the closed enum in two files for no behavioral gain.

## Boundary posture

This scope stays inside the AGENTS.md trust contract:
- **No booking/payment/dispatch/autonomous fulfillment claims.** Cards stay `proposal_only`,
  `callable:false`, `paymentRequired:false`, `ownerApprovalRequired:true`, `receiptRequired:true`
  (D1.1). `businessAction.propose` returns approval-required/refusal/proof-gap — never a completed
  consequence (D3). Stripe is test-mode evidence downstream of owner approval, never a live charge
  (D6).
- **"Verified" only against a named standard.** The public receipt surface reports
  `reconstructionStatus` (a reconstruction fact), never an unqualified "verified" business claim;
  any "checked" language must name the check (D5).
- **Epistemic vocabulary stays off human surfaces.** success/refusal/proof-gap/tamper/
  expired-mandate appear only in JSON/agent payloads; the human verify page uses truthful plain
  content (D5, AGENTS.md epistemic-vocabulary rule).
- **No protocol vocabulary in public/kit copy** — no `callable`, `autonomous`, `agent-native`,
  `MCP`, `gateway`, `manifest`, `capability`, `source-owned`, etc. on human surfaces (D7,
  AGENTS.md).
- **Future money/platform claims are gated and negatively worded** until D6's chain is met and
  scope 1 is deployed. Copy for the demo kit is labeled test-mode/hackathon (D8).

Exact copy rules for the demo kit + verify page: "receipt-backed business operation" (allowed);
"autonomous business" / "agent marketplace" / "agent checkout" / "wallet for agents" (banned);
"Stripe test mode" + "owner approval required" (required disclosures).

## Open questions -> tickets

- Prove per-slug hash chain + receipt verifier for 2 slugs (T1, entry)
- Ratify + write the P6 slug-set door-amendment decision record (T2 depends on this via T7)
- Finalize v1 non-paid slug card schema against the demo business (T2)
- Draft the live-mode money-evidence decision record contents (T3)
- Build + run the demo-kit loop against a seeded fixture (T4)
- Settle public receipt-verification privacy + human-surface copy (T5)
- Confirm the mandate-at-door binding for businessAction.propose (T6, scope-3-coupled)
- Ratify the door amendment + update the ROADMAP door row (T7)

## References
- `local://five-scopes.md` (scope 5 deficit, ship list, sequencing, deliberate cuts)
- `AGENTS.md` (trust contract, epistemic vocabulary, banned human-surface words)
- `.planning/ROADMAP.md` (decision-door register :11-24, P6 :205-226, P6 hackathon/production rule :73, bloat detector :228)
- `.planning/archive/phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md` (module seam, data model, keep/reject lists)
- `.planning/archive/phases/06-agentic-business-action-receipts/06-VERIFICATION.md` (source/local proof boundary, 21 truths)
- `.planning/archive/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md` (test-mode Stripe record, live-mode deferral)
- `.planning/STATE.md` (Phase 6 decisions :142-162, blockers :163-171)
- `src/modules/business-action/internal/schema.ts` (slug pin :21-24, card defaults/invariants :125-151, request/checkpoint/receipt/public readback :169-341)
- `src/modules/business-action/internal/business-action.ts` (verifier :638/:910-1002, slug guards :254-256/:714/:984, owner checkpoint :340-352)
- `src/modules/business-action/public.ts` (public seam surface)
- `src/routes/api.business-actions.stripe-webhook.ts` (raw-body HMAC verify :116-144)
- `src/routes/api.agent.tools.ts` (anonymous door :112-122)
- `src/modules/actions/index.ts` + `src/modules/common/action.ts` + `src/modules/inquiries/inquiry.actions.ts` (defineAction shape/registration)
- `local://research-ae-seams.md` (slug pin sites splice v, agent-door risk 6, redaction risk 2, verifier oracle risk 4)
- `local://research-handshake.md` (kernel grammar, adapter families §3, host activation profiles, integration risks)
- `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` (existing test-mode deploy smoke)
