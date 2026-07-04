# Phase 6: agentic-business-action-receipts - Context

**Gathered:** 2026-06-29
**Status:** Ready for research and planning
**Source:** PRD Express Path (`.planning/phases/06-agentic-business-action-receipts/06-SPEC.md`)

<domain>
## Phase Boundary

Phase 6 plans one aggressive hackathon spike plus future product option: one Hermes-run, software-scoped business operation named `provision-paid-intake-endpoint`.

The phase must prove a source-owned Business Action Card, buyer mandate, Capability Request, authorization checkpoint, external evidence events, and Action Receipt reconstruct into one receipt-backed operation. It must not turn AE into the agent runtime, wallet, marketplace, settlement layer, sandbox, product catalog, generic API marketplace, or provider.

Planning may proceed now. Phase 6 implementation waits for a `06-*-PLAN.md` that explicitly names preflight gates, spike exceptions, files, commands, and stop conditions.

</domain>

<decisions>
## Implementation Decisions

### D-01 Phase posture
- Phase 6 is a hackathon spike plus future product option, not a production launch claim.
- Plans must separate hackathon acceptance from production acceptance.
- Any non-production gap must be labeled under a `Hackathon Spike Exception` section.

### D-02 Single action
- The only action slug in Phase 6 is `provision-paid-intake-endpoint`.
- Business Action Cards are separate source-owned rows with optional service links.
- The card posture is `proposal_only`, owner approval required, receipt required, and immutable by version/source hash.
- No generic `executeAction`, arbitrary action slugs, provider `other`, broad action registry, or action marketplace is allowed.

### D-03 Actor model
- Buyer mandate is not business authority.
- Hermes is a delegated requester, not business owner, payer, approver, or authority source.
- Accepted checkpoint requires source-owned business-owner approval unless a plan explicitly labels a spike proof-gap.
- Plans must test wrong owner, stale owner, revoked owner, missing owner decision, owner rejection, and Hermes/buyer attempts to stand in for business authority.

### D-04 Mandate and request binding
- Capability Requests bind `mandateHash`, `cardId`, `cardVersion`, `cardHash`, `requestHash`, amount/currency when present, idempotency key, correlation ID, TTL, allowed action, and allowed business.
- Same-key replay must be idempotent; same-key/different-body must conflict.
- Expired or revoked mandate, wrong action, wrong business, amount over max, stale card, and disabled card fail before consequence.

### D-05 Authorization checkpoint
- AE owns the consequence boundary.
- Checkpoint outcomes are `accepted`, `refused`, `clarification_required`, `proof_gap`, and `expired`.
- Only `accepted` after source-owned owner approval can admit external evidence-bound consequence.
- Non-accepted outcomes record receipts/readbacks and do not create provider/payment/Hermes/NVIDIA evidence rows.

### D-06 External evidence posture
- Hermes, Stripe, Link CLI, Shared Payment Tokens, Nemotron, and NeMo Guardrails are evidence sources only.
- External evidence rows are recorded only after accepted checkpoint admission.
- Evidence must bind exact request, checkpoint, provider ref hash, payload hash, idempotency key, correlation ID, and amount/currency when present.
- Invalid, unsigned, unbound, stale, duplicate-conflicting, decorative, or wrong-request evidence is held or proof-gap, never authority.

### D-07 Stripe and Link money boundary
- Phase 5 remains the owner paid-activation authority decision: Autumn Cloud plus Stripe PSP.
- Phase 6 direct Stripe/Link test-mode evidence for the paid-intake action requires `06-MONEY-EVIDENCE-DECISION.md` before implementation.
- The P5 billing seam may be referenced only as prior owner paid-activation authority; it does not authorize Phase 6 customer paid-intake revenue, Link/SPT spend, or direct Stripe evidence.
- The decision record must specify test-mode-only scope, Stripe object types, credential owner, webhook/readback handling, reconciliation, no live claims, no paid activation authority, and coexistence with Autumn/P5.
- Live mode requires a later production decision record.
- No direct Stripe subscription authority, Connect, x402, custody, wallet, credits, balances, settlement, client-supplied amount/currency/provider IDs, raw payment credentials, or public payment claim is allowed.

### D-08 NVIDIA evidence posture
- NeMo Guardrails/Nemotron evidence must be observable and non-decorative.
- Pre-checkpoint allow/block/refusal must be recorded as `GuardrailDecisionEvidence`, not as post-checkpoint downstream consequence.
- The demo must include at least one NeMo execution-rail allow decision and one block/refusal decision tied to policy hash, request hash, model/provider/version, and private trace ref hash.
- Nemotron or NeMo Guardrails may not be used to claim OS/process sandboxing without separate sandbox evidence.

### D-09 Receipt and verifier contract
- Action Receipts bind card hash/version, mandate hash, request hash, checkpoint hash, policy hash, external evidence refs, provider refs, outcome, previous receipt link, signature/ref, and reconstruction status.
- Verifier must reconstruct success, refusal/no consequence, proof gap, evidence mismatch, tampered hash, stale card, expired mandate, and unbound provider event.
- Public verifier exposes labels, statuses, hashes, timestamps, and non-sensitive refs only.

### D-10 Safe non-execution
- Refusal, proof-gap, clarification, provider-unavailable, expired, and no-repair outcomes are first-class.
- These states record durable receipt/readback, operator next action, and no downstream provider/payment/action consequence.
- No spend, endpoint exposure, owner inbox item, payment claim, or public success copy follows refusal/proof-gap/expired states.

### D-11 Audit, controls, and support
- Phase 6 must define audit target types, audit event types, optional funnel events, operator controls, support/kill-rule records, no-repair events, and validation tests through the existing observability module.
- Candidate operator controls are `business_actions_enabled` and `business_action_attempts_enabled`.
- Support kill rules disable public/demo claims.
- No Phase 6 receipt chain can bypass audit/support recording.

### D-12 Concrete result artifact
- A success path must record all three concrete software artifacts: endpoint descriptor, JSON schema, and private endpoint/provisioning/payment-gate artifact ref.
- A webhook-verified owner inbox item may support the result, but it is not sufficient success evidence by itself.
- If no artifact exists, terminal state is proof-gap.
- Screenshots, model output, payment events, generated reports, owner inbox items alone, and status labels are not result artifacts.

### D-13 Copy and public truth
- Demo copy may say `receipt-backed autonomous business operation` only when Hermes scoping, AE checkpoint, Stripe evidence, NVIDIA evidence, result/refusal, and verifier reconstruction are present in source-owned readback.
- Production autonomous/payment claims are forbidden.
- Copy/SEO/discovery scans must reject self-approving agents, unbounded autonomous spend, instant purchase, agent checkout, AE wallet, credits, custody, seller payout, marketplace settlement, x402, Connect, product marketplace, generic API marketplace, and production autonomous/payment claims.

### the agent's Discretion
- Exact module/file names inside `src/modules/business-action/` are planner discretion if they preserve public seam -> internal pure state -> Convex adapter -> route readback pattern.
- Exact route names are planner discretion if public/demo/admin/owner surfaces remain separated and no public route mints authority.
- Exact test file split is planner discretion if every SPEC acceptance criterion maps to a named test/source assertion.
- Whether to use Stripe PaymentIntent, Checkout Session, or Payment Link is planner/researcher discretion only after `06-MONEY-EVIDENCE-DECISION.md` exists; the first plan should prefer a server-created Checkout Session unless research proves a safer bindable alternative.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 6 source of truth
- `.planning/phases/06-agentic-business-action-receipts/06-SPEC.md` — locked Phase 6 requirements, boundaries, preflight gates, and prohibitions.
- `.planning/phases/06-agentic-business-action-receipts/06-DISCUSSION-LOG.md` — hard-question decisions from PRD Express Path plus typed subagent review.
- `.planning/phases/06-agentic-business-action-receipts/06-RESEARCH.md` — implementation research, money/evidence recommendation, verification gates, and anti-patterns.
- `.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md` — source-owned codebase pattern map, file analogs, tests, and scanner additions.
- `.planning/phases/06-agentic-business-action-receipts/06-FABLE-FOUNDATION-REVIEW.md` — adversarial foundation review and resolved blockers to preserve during planning.
- `.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md` — test-mode Stripe evidence decision for paid-intake demo.
- `.planning/phases/06-agentic-business-action-receipts/06-CHECK.md` — typed plan-checker findings and split-plan remediation.
- `.planning/phases/06-agentic-business-action-receipts/06-01-business-action-domain-verifier-PLAN.md` through `06-06-copy-source-smoke-gates-PLAN.md` — execution plans sized for GSD waves.
- `.planning/phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md` — engineering synthesis, state machine, data shapes, and open questions.
- `.planning/phases/06-agentic-business-action-receipts/06-SOURCE-DOC-GROUNDING.md` — source-doc grounding for Stripe/Link, NVIDIA/Nemotron/NeMo Guardrails, x402, Agentic.Market, and Shopify/ACS boundaries.

### Prior-phase authority and money boundaries
- `.planning/phases/04-owner-pending-protected-actions/04-SPEC.md` — protected-action authority requirements.
- `.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md` — selected `contact-follow-up` action and rejection of generic registries.
- `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md` — P4 local/source verification and deployed-proof posture.
- `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` — Phase 5 paid activation boundary.
- `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` — Autumn Cloud plus Stripe PSP decision, rejected rails, retention/private evidence, support, and proof standard.
- `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` — Phase 5 execution plan and new provider-smoke gate.

### Shared security, GTM, and state context
- `.planning/SECURITY-SPEC.md` — source-owned authority, private/public projection, audit, and money evidence security rules.
- `.planning/GTM-READINESS.md` — claim evidence and launch gating.
- `.planning/STATE.md` — current phase/debt status, including P2/P3 deployed proof debt and stale Phase 4 state notes.
- `.planning/ROADMAP.md` — roadmap constraints and phase boundaries.
- `.planning/REQUIREMENTS.md` — requirement IDs and acceptance coverage context.

### Existing code patterns
- `src/modules/protected-action/internal/contact-follow-up.ts` — selected protected-action state machine pattern.
- `convex/protectedActions.ts` — durable Convex adapter and source-write gate pattern.
- `src/modules/billing/internal/operations.ts` — Phase 5 source-owned billing state pattern.
- `src/modules/billing/internal/schema.ts` — billing schema, support capability, and receipt/reconciliation shape.
- `src/modules/observability/public.ts` — audit, funnel, operator-control literal patterns.
- `src/lib/ui/contract-scans.ts` — copy/source claim scanner.

</canonical_refs>

<specifics>
## Specific Ideas

- Best demo line: `Hermes can run the business operation; AE proves the operation stayed inside mandate.`
- Recommended demo action: provision a paid diagnostic intake endpoint that accepts a structured request, requires test-mode payment evidence before creating an owner inbox item, stays private until owner approval, and emits a reconstructable receipt.
- Minimum demo should include one accepted path and one refusal/block/proof-gap path.
- NeMo Guardrails must show one allow and one block/refusal tied to policy.
- Stripe/Link evidence is test-mode by default and evidence-only.

</specifics>

<deferred>
## Deferred Ideas

- Production Phase 6 launch claim.
- Live money movement.
- Direct Stripe subscription authority outside P5/P6 decision records.
- x402/MPP/API microtransaction directory.
- Stripe ACS/product-feed marketplace.
- Shopify-like product catalog, inventory, fulfillment, tax/shipping truth.
- Hosted agent platform, SDK/MCP/CLI/plugin ecosystem, skills marketplace.
- AE-owned wallet, credits, balances, custody, payouts, or settlement.
- OS/process sandboxing claims unless sourced from a separate sandbox implementation.

</deferred>

---

*Phase: 06-agentic-business-action-receipts*
*Context gathered: 2026-06-29 via PRD Express Path*
