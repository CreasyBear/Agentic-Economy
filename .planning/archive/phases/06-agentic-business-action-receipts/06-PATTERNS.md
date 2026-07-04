# Phase 6 Patterns: Business Action Receipts

**Created:** 2026-06-29
**Mode:** GSD pattern mapper + orchestrator synthesis
**Status:** Ready for planner

## Pattern Map Complete

Use the same source-owned seam that Phases 4 and 5 established:

```text
public seam -> internal pure state -> Convex adapter -> source store -> route/readback/test
```

Do not mutate billing or protected-action internals to fit Phase 6. Phase 6 earns its own module because the business-action receipt chain has different actors, evidence, artifacts, and public-claim risks.

## Existing Pattern To Reuse

| Existing pattern | Phase 6 use |
|---|---|
| `src/modules/protected-action/public.ts` | Re-export only typed public functions/constants from `src/modules/business-action/public.ts`. |
| `src/modules/protected-action/internal/contact-follow-up.ts` | Model the closed slug, state machine, `ModuleResult`, stable hashes, idempotency, receipts, no-repair, and audit validation style. |
| `src/modules/billing/internal/schema.ts` | Copy provider event status style: `accepted`, `duplicate`, `rejected`, `held_for_operator`. |
| `convex/protectedActions.ts` | Convex validators, `requireSourceWrite`, authority load, internal module delegation, persistence, redacted returns. |
| `convex/protectedActionStore.ts` | Source-state slice load/persist and indexed readback helpers. |
| `src/routes/owner.actions*.tsx` | Owner list/detail/receipt route readback structure. |
| `src/routes/admin.protected-actions*.tsx` | Admin/operator reconstruction route structure. |
| `src/lib/ui/contract-scans.ts` | Add Phase 6 owned contexts, allowed phrases, and hard-forbidden claim patterns. |

## Recommended File Layout

| New or modified file | Role | Closest analog |
|---|---|---|
| `src/modules/business-action/public.ts` | Public seam | `src/modules/protected-action/public.ts` |
| `src/modules/business-action/internal/business-action.ts` | Pure state machine | `src/modules/protected-action/internal/contact-follow-up.ts` |
| `src/modules/business-action/internal/schema.ts` | Literals/types if split is needed | `src/modules/billing/internal/schema.ts` |
| `src/modules/business-action/business-action.functions.ts` | Server bridge | `src/modules/protected-action/contact-follow-up.functions.ts` |
| `convex/businessActions.ts` | Convex adapter | `convex/protectedActions.ts` |
| `convex/businessActionStore.ts` | Source store | `convex/protectedActionStore.ts` |
| `convex/schema.ts` | Table composition | Existing module-owned table fragment pattern |
| `src/routes/owner.business-actions.tsx` | Owner queue/readback | `src/routes/owner.actions.tsx` |
| `src/routes/owner.business-actions.$requestId.tsx` | Owner checkpoint route | `src/routes/owner.actions.$proposalId.tsx` |
| `src/routes/owner.business-actions.$requestId.receipt.tsx` | Owner receipt route | `src/routes/owner.actions.$proposalId.receipt.tsx` |
| `src/routes/admin.business-actions*.tsx` | Admin/operator reconstruction | `src/routes/admin.protected-actions*.tsx` |
| `src/lib/ui/contract-scans.ts` | Copy/drift scans | Existing phase claim rules |

Prefer one cohesive internal file for the first plan. Split into `cards`, `mandates`, `requests`, `checkpoints`, `evidence`, and `receipts` only if the implementation becomes too large to review.

## Naming And Literal Conventions

Use closed literals:

```text
BusinessActionSlug = 'provision-paid-intake-endpoint'
CheckpointDecision = 'accepted' | 'refused' | 'clarification_required' | 'proof_gap' | 'expired'
EvidenceStatus = 'accepted' | 'duplicate' | 'rejected' | 'held_for_operator'
ReceiptReconstructionStatus = 'complete' | 'incomplete' | 'proof_gap' | 'tampered'
```

Audit events should live under `business_action.*`, beside existing `protected_action.*` and `billing.*` events.

Operator controls must be named exactly:

```text
business_actions_enabled
business_action_attempts_enabled
```

## Scanner Additions Required

Update `src/lib/ui/contract-scans.ts`:

- extend `PhaseNumber` to include `6`;
- add owned contexts for `.planning/phases/06-agentic-business-action-receipts/`, `src/modules/business-action/`, `convex/businessActions.ts`, `convex/businessActionStore.ts`, owner/admin business-action routes, and Phase 6 tests;
- allow Phase 6 terms only in owned or proven contexts: `Business Action Card`, `Capability Request`, `authorization checkpoint`, `Action Receipt`, `receipt-backed software operation`, `Hermes-run paid intake provisioning`;
- fail hard on: `self-approving agent`, `unbounded autonomous spend`, `instant purchase`, `agent checkout`, `AE wallet`, `AE credits`, `AE custody`, `seller payout`, `marketplace settlement`, `x402`, `Connect`, `AE-owned product marketplace`;
- add drift scans for `executeAction`, broad `proposeAction`, `actionSlug: string`, `provider: "other"`, `paymentRequired: true`, `callable: true`, route-local Business Action arrays, and client-supplied money/provider fields.

## Tests To Mirror

| Test class | Mirror from | Phase 6 coverage |
|---|---|---|
| Contract literals | Protected-action selected action tests | Exact slug, closed statuses, no generic action names. |
| Owner/checkpoint flow | Protected-action owner flow tests | No external consequence before accepted checkpoint. |
| Route readbacks | Protected-action route readbacks | Owner/admin/receipt pages derive from source state. |
| Money evidence | Billing rail tests | Reject client-supplied amount/provider fields; accept only signed/bound provider evidence. |
| Copy scans | Phase 4/5 copy tests | Reject autonomous/payment/marketplace overclaims. |
| Deploy/provider smoke | Phase 5 fail-loud smoke | No screenshots, return URLs, dashboards, or env vars as proof. |

## Drift Risks

Forbid these names and concepts in Phase 6 runtime code/copy unless they appear only inside scanner test fixtures:

```text
executeAction
generic-action
actionGateway
provider: "other"
actionSlug: string
paymentRequired: true
callable: true
agent checkout
AI checkout
agentic marketplace
autonomous procurement
seller catalog marketplace
API microtransaction marketplace
Shopify for agents
wallet for agents
AE wallet
AE credits
AE custody
seller payout
marketplace settlement
Stripe Connect
Connect
x402
USDC
stored value
balance
credits ledger
request market
hosted-agent
skills marketplace
```

Highest-risk implementation mistakes:

- copying the old engineering draft's broad `actionSlug | string` or `provider: "other"` shapes;
- treating Stripe/Hermes/Nemotron/NeMo evidence as authority;
- adding route-local demo fixtures;
- exposing raw prompts, provider payloads, Link/SPT credentials, Stripe payloads, customer identifiers, or private endpoint refs in public verifier output.
