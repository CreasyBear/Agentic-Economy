# Phase 6: Agentic Business Action Receipts — Specification

**Created:** 2026-06-29
**Ambiguity score:** 0.14 (gate: <= 0.20)
**Requirements:** 13 locked
**Mode:** Auto-selected from source-grounding docs, engineering requirements, and subagent review. User review is still expected before production execution.

## Goal

AE can prove one Hermes-run, software-scoped business operation stayed inside mandate by reconstructing a source-owned Business Action Card, buyer mandate, capability request, authorization checkpoint, external evidence events, and Action Receipt for `provision-paid-intake-endpoint`, without AE becoming the agent runtime, wallet, marketplace, settlement layer, sandbox, or provider.

## Background

The repo has a source-owned authority spine from Phase 4: proposals, policy, owner decisions, gateway admission, attempts, receipts/proof gaps, support/no-repair state, and operator reconstruction. Phase 4 is verified locally/source-side, but deployed protected-action proof is not claimed.

Phase 5 now has a selected Autumn Cloud plus Stripe PSP paid-activation posture and a fail-loud provider-smoke command for deployed source-owned payment evidence. Phase 5 is about owner paid activation, not buyer-to-seller settlement and not direct Stripe subscription authority.

Phase 6 currently has source-grounding and engineering-input docs only. No `06-CONTEXT.md`, `06-DISCUSSION-LOG.md`, `06-PLAN.md`, `src/modules/business-action/`, Convex tables, routes, or tests exist. Therefore Phase 6 code must not start until discuss/plan artifacts exist and the P4/P5 gates named below are satisfied.

## Preflight Gates

These gates are part of the spec, not advisory notes.

| Gate | Required before | Source / command | Pass condition | What remains forbidden until pass |
|---|---|---|---|---|
| P4 source authority spine | Any Phase 6 implementation plan can be marked executable. | `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`; protected-action unit/import/copy tests selected by discuss/plan. | P4 source/local verification is recorded as passed and the plan names any deployed-proof gap honestly. | No production/deployed protected-action claim; no Phase 6 production launch claim. |
| P5 money boundary | Any Stripe/Link/PaymentIntent/Checkout/Payment Link evidence is implemented. | `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md`; `npm run test:provider-smoke:autumn-stripe` when deployed provider evidence is claimed. | Either route through the P5 billing seam or create a narrow `06-MONEY-EVIDENCE-DECISION.md` test-mode-only record before code. | No live charges, public payment claim, direct Stripe subscription authority, Connect, x402, wallet, credits, balances, custody, settlement, or paid activation claim. |
| Phase 6 planning artifacts | Any Phase 6 code starts. | `06-CONTEXT.md`, `06-DISCUSSION-LOG.md`, and at least one `06-*-PLAN.md`. | Discuss-phase has locked HOW decisions, exact files, commands, and stop conditions. | No `src/modules/business-action/`, Convex tables, routes, public copy, or demo route code. |
| Phase 6 spike exemption | Hackathon demo proof without full production closure. | A plan section named `Hackathon Spike Exception`. | The plan labels every non-production gap, uses test-mode evidence by default, and forbids production/public claims. | No production launch copy, no live money movement, no generic marketplace positioning. |

## Requirements

1. **Phase posture**: Phase 6 is an aggressive hackathon spike plus future product option, not a production launch claim.
   - Current: `06-ENGINEERING-REQUIREMENTS.md` says Phase 6 is pre-spec input and implementation should wait for planning.
   - Target: Phase 6 planning may proceed now, but implementation and public claims are blocked until P4/P5 proof gates are satisfied.
   - Acceptance: `06-CONTEXT.md` and all Phase 6 plans mark hackathon-spike acceptance separately from production acceptance; no Phase 6 public copy claims production autonomous/payment support.

2. **Single action card**: Phase 6 locks exactly one source-owned action slug: `provision-paid-intake-endpoint`.
   - Current: The engineering input proposes Business Action Cards but includes broad escape hatches such as `| string` action slugs and provider `other`.
   - Target: Phase 6 uses a separate `businessActionCards` concept with immutable card version, source hash, optional service link, `proposal_only` callable posture, owner approval required, receipt required, and no generic action registry.
   - Acceptance: Plan/tests reject any Phase 6 schema or route that exposes generic `executeAction`, arbitrary action slugs, `provider: "other"`, broad action marketplaces, or core catalog/discovery payment fields.

3. **Mandate-bound request**: A buyer/operator mandate constrains every request before any external consequence.
   - Current: Phase 4 has owner-side protected-action authority; no Phase 6 buyer/operator mandate exists.
   - Target: A Capability Request binds `mandateHash`, `cardId`, `cardVersion`, `cardHash`, `requestHash`, amount/currency when present, idempotency key, correlation ID, TTL, and allowed action/business constraints.
   - Acceptance: Tests cover same-key replay, same-key/different-body conflict, expired mandate, revoked mandate, wrong business, wrong action, amount over max, stale card, disabled card, and no external evidence before checkpoint admission.

4. **Authorization checkpoint**: AE owns the consequence boundary.
   - Current: Phase 4 owns a gateway/admission boundary for `contact-follow-up`; Phase 6 has no checkpoint module.
   - Target: The authorization checkpoint returns `accepted`, `refused`, `clarification_required`, `proof_gap`, or `expired`; only `accepted` after source-owned business-owner approval can admit external evidence-bound consequence.
   - Acceptance: Tests prove buyer mandate is not business authority, Hermes is only a delegated requester, wrong owner/stale owner/revoked owner/missing owner decision/owner rejection fail safely, and refused/expired/clarification/proof-gap paths record receipts/readbacks without provider/payment/Hermes/NVIDIA evidence rows.

5. **External evidence only**: Hermes, Stripe, Link CLI, Nemotron, and NeMo Guardrails are evidence sources, not AE authority.
   - Current: Source docs identify sponsor rails but warn they can become authority by accident.
   - Target: ExternalEvidenceEvents are stored only after an accepted checkpoint and must bind exact request, checkpoint, amount/currency when present, provider ref hash, payload hash, idempotency key, and correlation ID.
   - Acceptance: Invalid, unsigned, unbound, stale, duplicate-conflicting, decorative, or wrong-request evidence is held/proof-gap, never accepted as authority or paid/provisioned truth.

6. **Stripe money boundary**: Phase 6 may use Stripe test-mode revenue/payment-link evidence and optional Link CLI spend evidence only as downstream evidence.
   - Current: Phase 5 selects Autumn Cloud plus Stripe PSP for paid activation and cuts Connect, x402, custody, wallet, credits, balances, split payouts, and settlement.
   - Target: Phase 6 may record Stripe Checkout Session, PaymentIntent, Payment Link, webhook/readback, Shared Payment Token, or Link CLI spend-request evidence only when exact request/action/amount/currency/mandate binding exists; direct Stripe test-mode use requires `06-MONEY-EVIDENCE-DECISION.md`, and live mode requires a later production decision record.
   - Acceptance: Tests and scans reject direct Stripe subscription authority, Connect, x402, custody, wallet, credits, balances, settlement, client-supplied amount/currency/provider IDs, raw payment credentials, and public payment claims without the P5 billing seam or `06-MONEY-EVIDENCE-DECISION.md` plus receipt/reconciliation evidence.

7. **NVIDIA evidence**: NeMo Guardrails/Nemotron evidence must be observable and non-decorative.
   - Current: Source docs support model reasoning/safety and execution-rail evidence, not OS/process sandbox claims.
   - Target: Phase 6 records at least one NeMo Guardrails execution-rail allow decision and one block/refusal decision tied to policy hash, request hash, model/provider/version, and private trace ref hash.
   - Acceptance: Tests or demo proof fail if NVIDIA evidence is only marketing copy, screenshots, raw prompts, model output as authority, or sandboxing claims unsupported by a separate sandbox source.

8. **Receipt reconstruction**: ActionReceipt verifier reconstructs success, refusal, and proof-gap chains.
   - Current: Phase 4 receipts reconstruct selected contact follow-up state; Phase 6 receipts do not exist.
   - Target: A Phase 6 receipt binds card hash/version, mandate hash, request hash, checkpoint hash, policy hash, external evidence refs, Stripe/NVIDIA/Hermes refs when present, outcome, prior receipt link, signature/ref, and reconstruction status.
   - Acceptance: Verifier tests cover complete success, refusal/no consequence, proof gap, evidence mismatch, tampered hash, stale card, expired mandate, unbound provider event, and private/public redaction split.

9. **Safe non-execution**: Refusal, proof-gap, clarification, provider-unavailable, and no-repair outcomes are first-class.
   - Current: Phase 6 docs recommend making safe non-execution memorable, but no state machine exists.
   - Target: Every terminal non-success state has durable receipt/readback, operator next action, and no downstream provider/payment/action consequence after refusal.
   - Acceptance: Tests prove no spend, no endpoint exposure, no owner inbox item, no payment claim, and no public success copy follows refusal/proof-gap/expired states.

10. **Demo truth surface**: The visible demo proves the chain without overclaiming production support.
    - Current: Landing and registry surfaces can drift into broad agentic-marketplace language without source-owned Phase 6 proof.
    - Target: Demo copy may say `receipt-backed autonomous business operation` only when Hermes scoping, AE checkpoint, Stripe evidence, NVIDIA evidence, result/refusal, and verifier reconstruction are all present in source-owned readback.
    - Acceptance: Copy/SEO/discovery scans reject self-approving agents, unbounded autonomous spend, instant purchase, agent checkout, AE wallet, credits, custody, seller payout, marketplace settlement, x402, Connect, product marketplace, generic API marketplace, and production autonomous/payment claims.

11. **Audit, controls, and support spine**: Phase 6 consequential actions must plug into the existing observability and operator-control patterns.
    - Current: Existing audit targets/events, funnel events, operator controls, and support/no-repair patterns cover earlier phases; no Phase 6 literals or support records exist.
    - Target: Phase 6 defines audit target types, audit event types, optional funnel events, operator controls such as `business_actions_enabled` and `business_action_attempts_enabled`, support/kill-rule records, no-repair events, and validation tests through `src/modules/observability/public.ts`.
    - Acceptance: Tests prove all new Phase 6 audit/control/funnel/status literals validate, support kill rules disable public/demo claims, no-repair is reconstructable, and no Phase 6 receipt chain can bypass audit/support recording.

12. **Money-evidence decision record**: Direct Stripe test-mode evidence is not allowed to slip around Phase 5 through wording.
    - Current: Phase 6 source docs mention Stripe PaymentIntent/Checkout/Payment Link and Link/SPT evidence, while Phase 5 locks Autumn Cloud plus Stripe PSP for paid activation.
    - Target: Before any direct Stripe API evidence is implemented, `06-MONEY-EVIDENCE-DECISION.md` must specify test-mode-only scope, object types, credential owner, webhook/readback handling, reconciliation, no live claims, no paid activation authority, and coexistence with Autumn/P5.
    - Acceptance: Plans and tests fail if direct Stripe evidence appears without that decision record or without exact request/action/amount/currency/mandate/checkpoint/receipt binding.

13. **Concrete result artifact**: The demo success path must produce a named software artifact or an explicit proof-gap.
    - Current: Source grounding recommends endpoint descriptor/schema or blocked/proof-gap result, but no artifact contract exists.
    - Target: The success path records an endpoint descriptor, JSON schema, private endpoint/provisioning artifact ref, webhook-verified owner inbox item, or another explicitly decision-recorded software artifact; otherwise the terminal state is proof-gap.
    - Acceptance: Tests/demo proof fail if success is only a screenshot, model output, payment event, or status label without a bound result artifact or proof-gap receipt.

## Boundaries

**In scope:**
- One Business Action Card for `provision-paid-intake-endpoint`.
- Buyer/operator mandate and source-owned Capability Request.
- Authorization checkpoint with accept/refuse/clarify/proof-gap/expired outcomes.
- External evidence event records for Hermes, NeMo Guardrails, Nemotron, Stripe API test-mode revenue evidence, and optional Link CLI/SPT spend evidence when bindable.
- ActionReceipt and verifier reconstruction for success, refusal, and proof-gap.
- Owner/operator/admin readbacks with private evidence refs redacted according to source policy.
- Demo-safe copy that names receipt-backed operation only after source-owned evidence exists.
- Audit/observability/control/support/no-repair contracts for Phase 6 events and claims.
- `06-MONEY-EVIDENCE-DECISION.md` when direct Stripe test-mode evidence is used.

**Out of scope:**
- AE-owned wallet, credits, balances, stored value, custody, card handling, or payment credentials — Phase 6 is evidence, not custody.
- Buyer-to-seller settlement, marketplace payout, split payout, Connect, x402, MPP, crypto, USDC, payment handler, or generic paid API marketplace — these are separate money/platform decisions.
- Generic action registry, broad `executeAction`, hosted-agent platform, SDK/MCP/CLI/plugin ecosystem, or skills marketplace — Phase 6 proves one action.
- Product catalog, inventory, fulfillment, tax/shipping truth, Shopify/Stripe ACS replacement, or marketplace facilitator posture — not the selected wedge.
- OS/process sandboxing claims from Nemotron or NeMo Guardrails alone — they are model/rail evidence only.
- Production launch claim — hackathon spike proof and production readiness have separate gates.

## Constraints

- Phase 6 code execution waits for a `06-CONTEXT.md` and `06-PLAN.md`.
- Production Phase 6 execution waits for P4 source/deployed proof posture to be reconciled and P5 money-boundary/provider-smoke proof to be explicit.
- Stripe/Link live mode requires provider access and a decision record; test-mode evidence is the default.
- Direct Stripe test-mode evidence requires `06-MONEY-EVIDENCE-DECISION.md` before code, unless the plan routes entirely through the P5 billing seam.
- Raw prompts, customer identifiers, private business notes, raw provider payloads, raw Stripe payloads, Link/SPT secrets, card data, and provider secrets are not public verifier output.
- Public discovery may expose only source-owned action-card facts after card enforcement exists; it cannot mint authority.
- If an external rail cannot be bound to exact request/action/amount/currency/mandate/checkpoint/receipt, that rail is cut from the Phase 6 demo.

## Acceptance Criteria

- [ ] `06-CONTEXT.md`, `06-DISCUSSION-LOG.md`, and at least one `06-*-PLAN.md` exist before Phase 6 implementation starts.
- [ ] Phase 6 plans include the Preflight Gates table above and name which gates are passed, blocked, or spike-exempt.
- [ ] Phase 6 plans lock `provision-paid-intake-endpoint` as the only action slug and reject generic action execution.
- [ ] Business Action Card tests cover immutable version/source hash, disabled/stale/unlisted visibility, optional service link, and public field redaction.
- [ ] Mandate/request tests cover replay, conflict, TTL, revoked mandate, wrong business/action, amount over max, stale/disabled card, and no consequence before accepted checkpoint.
- [ ] Authorization tests prove buyer mandate is not business authority; Hermes is delegated requester only; wrong owner, stale/revoked owner, missing owner decision, owner rejection, refused, clarification, proof-gap, and expired outcomes stop external consequence.
- [ ] External evidence tests prove Hermes/Stripe/NVIDIA evidence is admitted only when bound to exact request/checkpoint/idempotency/correlation and is held otherwise.
- [ ] Stripe tests/scans reject direct subscription authority, Connect, x402, wallet, credits, balances, custody, settlement, raw credentials, and client-supplied money/provider fields; direct Stripe test-mode evidence requires P5 seam routing or `06-MONEY-EVIDENCE-DECISION.md`.
- [ ] NeMo/Nemotron tests or demo proof include one allow and one block/refusal tied to request and policy hash; no OS sandbox claim appears without separate sandbox evidence.
- [ ] Receipt verifier tests reconstruct success, refusal, proof-gap, evidence mismatch, tampered hash, stale card, expired mandate, and unbound provider event.
- [ ] Public/private projection tests prove public verifier exposes only labels, statuses, hashes, timestamps, and non-sensitive refs.
- [ ] Copy/SEO/discovery scans reject production autonomous/payment claims and all forbidden marketplace/wallet/settlement/API-commerce language.
- [ ] Audit/control/support tests prove new Phase 6 literals validate through observability modules, operator controls gate attempts/public claims, support kill rules disable claims, and no-repair is reconstructable.
- [ ] Result artifact tests prove success requires endpoint descriptor, JSON schema, private endpoint/provisioning artifact ref, webhook-verified owner inbox item, or explicit decision-recorded substitute; otherwise proof-gap is recorded.

## Edge Coverage

**Coverage:** 14/14 applicable edge obligations specified for discuss/plan · 0 silently dismissed

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| State transition | R3/R4 | specified | Discuss/plan must instantiate tests for mandate TTL, revoked mandate, non-accepted checkpoint, and no consequence before accepted. |
| Idempotency | R3/R5 | specified | Discuss/plan must instantiate tests for same-key replay, same-key/different-body conflict, evidence binding, and duplicate-conflicting evidence. |
| Authorization | R4/R6 | specified | Discuss/plan must instantiate tests for owner authority, buyer mandate limits, delegated Hermes requester posture, and client-supplied authority/money/provider rejection. |
| Provider failure | R5/R9 | specified | Discuss/plan must instantiate tests for provider-unavailable, unbound evidence, held events, proof gaps, and operator next action. |
| Privacy/redaction | R8/R10 | specified | Discuss/plan must instantiate tests for public/private projection split and raw prompt/provider/payment redaction. |
| Stale data | R2/R3/R8 | specified | Discuss/plan must instantiate tests for card version/source hash, stale/disabled cards, expired mandates, and tampered hashes. |
| Negative path | R4/R9 | specified | Discuss/plan must instantiate tests for refusal, clarification, proof-gap, expired, no-repair, and no downstream consequence. |

## Prohibitions (must-NOT)

**Coverage:** 13/13 applicable prohibitions specified for discuss/plan · 0 silently dismissed

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT expose generic `executeAction`, arbitrary action slugs, or provider `other`. | R2 | specified | Discuss/plan must add schema/route scans and plan must-haves. |
| MUST NOT treat Hermes, Stripe, Link, Nemotron, NeMo Guardrails, screenshots, or model output as AE authority. | R5/R7 | specified | Discuss/plan must add evidence admission tests and reviewer gate. |
| MUST NOT allow Hermes or any agent to self-approve spend or bypass the checkpoint. | R3/R4/R6 | specified | Discuss/plan must add mandate/checkpoint tests. |
| MUST NOT store or expose raw card data, Link credentials, SPT secrets, Stripe secrets, Autumn secrets, raw provider payloads, raw prompts, or private customer/business notes in public verifier output. | R6/R8/R10 | specified | Discuss/plan must add projection/redaction scans. |
| MUST NOT claim OS/process sandboxing from Nemotron or NeMo Guardrails alone. | R7 | specified | Discuss/plan must add copy/source scan plus judgment review. |
| MUST NOT introduce Connect, x402, MPP, custody, wallet, credits, balances, split payouts, marketplace settlement, seller payout, or product marketplace claims. | R6/R10 | specified | Discuss/plan must add copy/source scan. |
| MUST NOT create public paid/action discovery fields before source-owned card/checkpoint/receipt enforcement exists. | R2/R10 | specified | Discuss/plan must add discovery projection contract. |
| MUST NOT let Stripe evidence create paid activation or subscription authority outside the Phase 5 Autumn decision boundary. | R6/R12 | specified | Discuss/plan must add money-boundary review and enforce P5 seam or `06-MONEY-EVIDENCE-DECISION.md`. |

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes |
|---------------------|-------|-------|--------|-------|
| Goal Clarity        | 0.90  | 0.75  | met    | One named operation, one receipt chain, explicit spike posture. |
| Boundary Clarity    | 0.88  | 0.70  | met    | Extensive hard cuts from source docs and subagent review. |
| Constraint Clarity  | 0.86  | 0.65  | met    | Executable preflight gates, test-mode default, P6 money decision, audit/control/support and provider-binding constraints named. |
| Acceptance Criteria | 0.90  | 0.70  | met    | Pass/fail checks for prerequisites, authority, money, audit/support, evidence, receipts, result artifacts, copy, and projections. |
| **Ambiguity**       | 0.11  | <=0.20 | met    | Remaining sponsor/access details are constrained to test-mode/default cuts and explicit decision records. |

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | What exists today? | P4 receipt spine exists locally/source-side; P5 money boundary exists; P6 has no SPEC/CONTEXT/PLAN/code. |
| 2 | Simplifier | What is the irreducible Phase 6 wedge? | One `provision-paid-intake-endpoint` Business Action Card and receipt verifier, not a marketplace. |
| 3 | Boundary Keeper | What must not enter Phase 6? | Wallet/custody/settlement/Connect/x402/generic actions/product marketplace/hosted agent platform are cut. |
| 4 | Failure Analyst | What would make the demo fake? | Unbound Stripe/NVIDIA/Hermes evidence, self-approved spend, screenshots/model output as proof, and public overclaiming. |
| 5 | Seed Closer | How do sponsor rails fit safely? | Hermes/Stripe/Link/NVIDIA are external evidence only after AE checkpoint admission; test mode is default. |
| 6 | Seed Closer | What blocks implementation? | Phase 6 implementation waits for discuss/plan artifacts and P4/P5 proof gates; planning may proceed now. |
| 7 | Adversarial review | What would make the spec false-green? | Added executable preflight gates, audit/control/support contract, owner authority model, P6 money-evidence decision, and result artifact requirement. |

---

*Phase: 06-agentic-business-action-receipts*
*Spec created: 2026-06-29*
*Next step: $gsd-discuss-phase 06 — implementation decisions (how to build what's specified above)*
