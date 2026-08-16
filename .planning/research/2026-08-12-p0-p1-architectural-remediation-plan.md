# Post-remediation P0/P1 architectural remediation plan

**Date:** 2026-08-12  
**Status:** proposed execution authority; source changes not started  
**Product authority:** [`../PROJECT.md`](../PROJECT.md)  
**Engineering rules:** [`../../RULES.MD`](../../RULES.MD)  
**Finding ledger:** [`../../PAPERCUTS.md`](../../PAPERCUTS.md), post-remediation campaign at lines 966–1202  
**Primary-source mechanics:** [`2026-08-12-p0-p1-remediation-reference-notes.md`](2026-08-12-p0-p1-remediation-reference-notes.md)

## 1. Decision

There are no accepted open P0 findings. The current P1 set is eleven logical roots:

1. PRA-001 — provider-direct x402 also creates an AE-internal charge/accrual/rake;
2. PRA-002 — money settles before contract output validation;
3. PRA-003 — an open current-month payout period can transfer, with a fabricated zero threshold;
4. PRA-004 — Answer invocation idempotency omits the stable tool ordinal;
5. PRA-005 — a replayed workless invocation reservation cannot be abandoned;
6. buyer anger-test #2/#3 — an SSE terminal failure can leave durable state pending, and New question can orphan active work;
7. WGA-002 — generated Service/access/execution guidance, now apparently source-fixed but not reconciled in the ledger;
8. WGA-004 — the public OAuth recipe omits handler-required registration fields;
9. SG-017 — the first provider-cleanup job carries attempt 1 while the row remains attempt 0;
10. SG-011 — an x402 supplier cannot complete mandatory Test without paying itself;
11. SG-024 — no exact hosted value-exchange receipt exists.

Repair them through the incumbent authorities. Do **not** create a new public contract graph, queue, workflow, ledger, state machine, docs registry, payment abstraction, OAuth framework, telemetry system, or proof bureaucracy.

The dependency spine is:

```text
immutable Operation + rail
  -> durable invocation/effect identity
  -> provider transport
  -> bounded contract output validation
  -> rail-specific economic finalization
  -> closed-period supplier transfer eligibility

Answer reservation
  -> stable tool ordinal
  -> exact Operation invocation identity
  -> checkpoint/finalization
  -> durable terminal readback

provider revocation
  -> exact cleanup attempt + Workpool work identity in one mutation
  -> provider cleanup action
  -> total idempotent callback
  -> owner readback/recovery

canonical Service/OAuth/readiness owners
  -> generated cold-agent and supplier projections

all source invariants green
  -> exact deployment binding
  -> hosted two-rail proof
  -> strict receipt
```

SG-024 is the final proof boundary, not a parallel implementation lane. Live money stays disabled until PRA-001–PRA-003 and the hosted prerequisites in §10 are green.

## 2. Verified current-state inventory

| Root | Current owner | Current defect | Plan disposition |
|---|---|---|---|
| PRA-001 | `convex/capabilityOperationInvocationWorker.ts`; `convex/moneyLedger.ts`; x402 transport runtime | `isX402` is known, but charge authorization runs unconditionally before transport. | Repair. |
| PRA-002 | operation worker output parser/validator; `reconcileCharge` | `reconcileAcceptedCharge` can settle/accrue before `parseContractOutput`. | Repair. |
| PRA-003 | `moneyLedger.updatePayoutPeriod`; `beginPayoutTransfer`; `payout-policy.ts` | New current period is `held_threshold`, minimum is zero, and provider release can precede an immutable balance reservation. | Replace period/manual authority with ADR-034 automatic daily settlement; reserve exact available earnings before Stripe release; fail closed when required production policy is absent. |
| PRA-004 | `answer-tool-use-agent.ts`; Answer reservation/checkpoint/finalization | `callInput.seq` already exists, but authenticated Operation idempotency hashes only turn, operation, and input. | Repair by carrying the existing ordinal; no new journal. |
| PRA-005 | `operation-invoke.ts`; `capabilityOperationInvocations.ts` | `refuseBeforeDispatch` skips abandonment whenever reservation was replayed, even after authoritative empty replay readback. | Repair through existing guarded `abandon`. |
| Buyer #2/#3 | Answer route/orchestrator/finalization; `AeChat` Stop and navigation | Route catch emits terminal error without durable convergence; New question clears client identity in place. | Repair through existing finalization and Stop seams. |
| WGA-002 | canonical `ServiceDto` projection; operation map; generated discovery surfaces | Current source no longer emits `ae.access:'open'`; current `/SKILL.md` teaches one exact gateway and direct-keyless exception. The ledger is stale unless parity tests expose another producer. | Verification-only. Close the row if the focused generated-contract proof passes; do not build another contract layer. |
| WGA-004 | `agent-access-oauth-api.ts`; `oauth-state.ts`; CLI `connect`; CLI `manifest` | Runtime and built-in client agree, but manifest step 1 remains prose and omits `client_name` and `redirect_uris`. | Repair from one pure registration-request builder. |
| SG-017 | provider-connection domain; `capabilityProviderConnections.ts`; existing `customerRequestRouteWorkpool` | `enqueueCleanupWork` binds work metadata but omits `cleanupAttempt` from the persisted `next` row. | Repair in the same mutation. |
| SG-011 | readiness probe; owner supply action/funnel | x402 readiness already validates a no-payment `402` challenge; Test refuses x402 before using it and projection only recognizes a `filled` call event. | Repair by projecting challenge evidence, never fake a fill. |
| SG-024 | strict production smoke and workflow | Source/local checks exist; no exact hosted receipt or approved live-money run exists. | Run only after all correctness and deployment gates. |

P2 PRA-006, PRA-007, WGA-015, and SG-016 are not promoted into this implementation plan. PRA-007 and WGA-015 remain external blockers to an honest SG-024 hosted run: the provider call needs the complete shared network deny-list, and preparation/completion must bind the same exact Vercel and Convex deployment identities. They are not P1 work items or P1 source-completion criteria. If their separate owners have not closed them, this plan finishes its source work with SG-024 explicitly blocked rather than implementing them here.

## 3. Architecture rules

### 3.1 One authority per fact

| Fact | Sole authority |
|---|---|
| Admitted Operation, adapter, endpoint, output contract, price | capability-supply materialized Operation snapshot |
| Provider-direct vs AE-internal economic rail | immutable admitted Operation/payment material, selected before charge authorization |
| Invocation identity and dispatch state | Operation invocation reservation/control row |
| Provider effect identity | invocation + attempt/effect generation; Answer adds reservation-bound tool ordinal before entering the invocation service |
| Contract-valid delivery | bounded output parser/validator over the admitted Operation output schema |
| AE debit, supplier accrual, rake, refund, transfer eligibility | exact money ledger and payout policy |
| Answer lifecycle | reservation/checkpoint/atomic finalization rows |
| Provider cleanup lifecycle | provider-connection row plus bound Workpool work ID/attempt |
| Public Service shape | canonical `ServiceDto` producer enriched from the capability-supply operation map |
| OAuth wire contract | current OAuth constants, validator, metadata builders, and pure request projection |
| x402 Test completion | fresh, exact, no-payment readiness-challenge evidence |
| Hosted certification | strict digest-bearing receipt bound to exact deployed identities and immutable evidence |

Coordination workstreams below are not new modules. New cross-module types are allowed only when they carry an invariant that current callers must know; otherwise keep the decision private to the owning module.

### 3.2 Correctness before capacity

Brendan Gregg's USE Method is used only as an errors-first operational lens. For each named resource: check errors, then utilization and saturation where an owned signal exists; record unavailable signals as `?`.

| Resource | Utilization — existing minimum | Saturation — existing minimum | Errors — first check |
|---|---|---|---|
| Answer execution leases/reservations | exact state, generation, owner, issued/expiry, checkpoint/finalization | aggregate concurrency/backpressure `?`; an expired unreclaimed lease is an observable local symptom | lease identity/digest/generation/stopped/finalization refusals |
| Operation invocation reservations | reserved/replayed/work-bound/terminal state and attempt identity | pending workless age/count `?` until needed | idempotency conflict, guarded-abandon refusal, missing terminal, reconciliation required |
| Shared Workpool slots | bound work ID/kind/attempt and component status | pending/running beyond callback grace; queue depth/provider quota `?` | failed/canceled/missing work, cleanup mismatch, `cleanup_required` |
| Unresolved money outcomes | exact transaction/budget/outcome state and amount | total/oldest unknown and held budget `?` | charge/refund/reconciliation/idempotency refusals |
| Supplier settlement commands | exact available/reserved/transferred/recovery amounts, source high-watermark, allocation digest, provider outcome | oldest eligible/blocked/unknown command and unresolved global currency reservation `?` | KYC, liquidity/reserve, provider failure, outcome unknown, reconciliation required |

USE cannot close any root in this plan. Each defect reproduces at one request and zero load. Do not add instrumentation unless a named acceptance criterion cannot otherwise be observed.

### 3.3 Library and platform reuse

- Keep official installed x402 packages for challenge/signing/protocol mechanics. AE owns rail selection, exact money, Qualified Use, output validation, and recovery.
- Keep official Stripe SDK/webhook verification and provider IDs. AE owns immutable local money identities and reconciliation. A Stripe transfer is not a bank payout.
- Keep Convex mutations/OCC for atomic durable authority. External effects remain in actions.
- Reuse `customerRequestRouteWorkpool`; retries stay `false` for non-idempotent cleanup. The callback is a separate transaction and must be total/idempotent.
- Keep AI SDK stream framing; Answer lifecycle truth remains AE's reservation/checkpoint/finalization model.
- Keep installed MCP SDK and current OAuth schemas where they exactly match the wire. WGA-004 does not justify a generic OAuth client/server abstraction.
- Keep Zod/canonical digest/current strict receipt. Do not add a proof framework.

## 4. Workstream A — economic rail and Qualified Use finality

**Covers:** PRA-001, PRA-002.  
**Owners:** `convex/capabilityOperationInvocationWorker.ts`, `convex/moneyLedger.ts`, current capability-supply transport/output-validation seams.  
**Non-goal:** redesign x402, replace the ledger, or infer Stripe/x402 settlement from HTTP success.

### 4.1 Select one rail before money authorization

Derive one internal rail decision from the immutable reserved Operation snapshot:

```text
provider_direct_x402
  => x402 custody/authorization/transport/settlement evidence only
  => no authorizeInvocationCharge
  => no AE operator debit
  => no AE supplier accrual
  => no AE rake
  => no AE supplier-settlement mutation

ae_internal
  => existing authorizeInvocationCharge
  => existing exact amount/rake/budget identity
  => reconcile only after delivery classification
```

Do not infer the rail from mutable response headers, provider output, request input, UI flags, or caller choice. Do not add provider fallback: changing rail/provider creates a different authority and economic identity.

A provider-direct x402 success may be recorded as rail-specific payment/transport evidence. It must not be projected as an AE-internal charge, supplier accrual, rake, or payout. A signature or verification result is not settlement proof.

### 4.2 Validate before economic finalization

Reorder the worker terminal path:

```text
transport observation
  -> bounded response body
  -> parseContractOutput / descriptor.validateOutput exactly once
  -> classify delivery
       valid contract output                 => released
       definitive refusal / invalid output   => not_released for AE charge reconciliation
       release may have occurred / unknown   => outcome_unknown; reconciliation_required
  -> rail-specific economic action
  -> terminal invocation projection
```

For `ae_internal`, call `reconcileCharge(... released)` only after output is contract-valid. Invalid output must use the existing exact reversal/not-released path; it must create no surviving payout accrual. An uncertain provider effect remains frozen as `outcome_unknown`; never convert uncertainty into a free call, zero amount, automatic refund, or retry permission.

For `provider_direct_x402`, the delivery result still depends on contract-valid output, but AE performs no internal charge reconciliation. Preserve x402 settlement evidence and expose failure/recovery honestly.

### 4.3 Behavioral proof

Extend incumbent tests, principally:

- `tests/unit/convex/capability-operation-worker.test.ts`;
- `tests/unit/convex/money-ledger-reconciliation.test.ts`;
- `tests/unit/capability-supply/route-transport-runtime.test.ts`.

Required cases:

1. provider-direct x402 succeeds with payment evidence and contract-valid output; no AE charge, provider-accrual, rake, budget settlement, or supplier-settlement mutation occurs;
2. AE-internal transport succeeds with valid output; exactly one charge settles and exactly one accrual/rake projection appears;
3. AE-internal transport returns malformed or schema-invalid output after release; invocation is not completed and the authorized charge is reversed/not released with no surviving accrual;
4. uncertain transport/output evidence remains `outcome_unknown`/`reconciliation_required` and is not automatically retried;
5. replay returns the original money/evidence identities and creates no second entry.

**STOP conditions:** rail cannot be derived from the reserved immutable Operation; an x402 branch still calls charge authorization; output validation is duplicated; any unknown outcome is collapsed to success/refund/zero; conservation no longer balances exactly.

## 5. Workstream B — automatic supplier settlement and transfer admission

**Covers:** PRA-003.  
**Owners:** `convex/moneyLedger.ts`, `src/modules/money/internal/payout-policy.ts`, Stripe money provider, owner earnings projection, incumbent Convex cron/Workpool.  
**Decision:** ADR-034's AE-internal supplier settlement policy.  
**Non-goal:** model Stripe bank payout, build a GAAP ledger, mix x402 with AE accrual, or invent a second scheduling/provider framework.

### 5.1 Purpose and market policy

Payout is marketplace clearing, not one bank payment per Operation call. Each
definitively settled AE-internal Qualified Use creates exact provider accrual
and rake. Provider-direct x402 remains disjoint and never creates an AE
settlement command.

Replace the current monthly/caller-driven policy with one automatic daily UTC
settlement run:

- initiate the full eligible Business/currency balance within 24 hours absent a
  named blocker;
- transfer at most once per Business/currency/day;
- use no owner-selected amount, owner payout button, monthly review window, or
  AE commercial minimum;
- require a positive Stripe-minor-unit amount and leave any exact sub-minor
  remainder once in provider earnings;
- keep monthly periods, if needed, as reporting only.

The initial policy has zero AE ageing: definitive Qualified Use settlement is
eligible immediately. AE accepts buyer payment-rail timing/fraud/chargeback
exposure under Stripe's application fee/loss configuration. This policy cannot
go live until finance/legal signs the reserve, payment-method, recovery, and
jurisdiction inputs in §5.4.

### 5.2 Authority, reservation, and accounting

The caller supplies no Business, currency, amount, destination, cadence,
minimum, reserve, or policy. The server derives all of them.

Before any Stripe call, one Convex mutation must:

1. read fresh active recipient-transfer capability and exact provider earnings;
2. select FIFO settled accrual entries through a stable high-watermark;
3. convert the full available amount to Stripe minor units, reserving only the
   exactly representable ledger units;
4. create an immutable settlement command plus pending `payout_transfer`
   transaction;
5. write the pending provider debit and decrement available earnings under OCC;
6. bind Business, currency, ledger/rail exponents and units, allocation digest,
   destination account/object digest, reserve-policy digest, and idempotency key.

The pending debit is the reservation. Owner projections add pending reservations
back only when showing total owed; they do not call them transferred. Exact
provider success changes the transaction to applied without a second debit.
Definitive non-release writes the inverse credit and restores availability.

Command ordering:

```text
reserved
  -> provider_pending
     -> transferred
     -> failed_released
     -> outcome_unknown
        -> transferred | failed_released
```

There is no generic `reconciled` terminal. Before provider release, a targeted
refund cancels the whole reservation, restores it, posts the adjustment, and
lets the next run resnapshot. After provider release or an unknown outcome, the
command remains immutable and the correction becomes supplier recovery due.

One runner holds the global platform-account/currency settlement lease,
serializes supplier commands, and subtracts every unresolved global
reservation. A fresh Stripe balance preflight must leave the versioned reserve,
and platform automatic bank payouts must be disabled or coordinated. The
preflight is a risk gate, not a mirror of or replacement for Stripe balance
truth. Liquidity shortage uses oldest eligible high-watermark then Business id
as the deterministic order.

### 5.3 Transfer, retry, events, and recovery

Keep the semantic boundary exact:

- AE settlement eligibility, liability, reservation, and allocation;
- Stripe Transfer: platform balance to connected Stripe balance;
- Stripe payout: connected balance to external bank/card, not represented in
  AE v1.

Use the official Stripe SDK with one stable idempotency key and exact parameters.
Preserve provider error/status and `Stripe-Should-Retry`. Retry the same
parameters/key only inside AE's 23-hour recovery window. Network/no-response,
provider `5xx`, or any ambiguous release becomes `outcome_unknown` with the
reservation frozen. After the window, reconcile by provider id, unique
`transfer_group`, bound metadata, and fresh object readback; absent exact proof
requires manual intervention, never a fresh key.

Persist each pooled Transfer's exact Qualified Use allocations. A
supplier-attributable post-Transfer correction creates an independent
non-negative recovery-due fact and an idempotent partial Stripe reversal command
capped by the amount allocated to that Transfer. Successful recovery clears
only the exact recovered amount; unavailable recovery offsets future earnings.
A rail reversal not caused by supplier fault restores supplier payable.

Require raw-body Stripe signature verification and durable duplicate/order-safe
dispatch for account, Checkout/top-up, refund/dispute, Transfer, and reversal
events. Do not ingest or project connected-bank payout events.

### 5.4 Operator/legal policy inputs

Source must fail closed when any required production policy is absent:

- supported buyer payment methods and definitive-success rule;
- per-currency platform reserve, replenishment, emergency stop, and automatic
  platform payout setting;
- supported countries/currencies/cross-border rules;
- supplier-fault, refund/dispute, offset/recovery, insolvency, and later-win
  treatment;
- merchant-of-record, safeguarding, tax/invoice/reporting responsibility.

The code-selected shape is daily automatic settlement, zero AE ageing, no
commercial minimum, and no supplier rolling reserve. Values and risk acceptance
remain operator/legal authority, not implementer guesses.

### 5.5 Behavioral proof

Extend the current payout ledger/policy, Stripe adapter/server, and owner
projection tests. Required cases:

1. exact AE-internal Qualified Use accrues; x402 never does;
2. daily run reserves the full representable balance once and carries one
   sub-minor remainder;
3. concurrent suppliers cannot consume the same global currency liquidity;
4. KYC, reserve, unsupported-currency, and reconciliation blockers stay owed
   and are named;
5. pre-release refund cancels/restores before adjustment; post-release
   adjustment becomes exact recovery due;
6. pooled partial recoveries are capped, repeat-safe, and allocation-bound;
7. 4xx proven non-release restores; network/5xx freezes; exact readback resolves
   unknown once; expired-key ambiguity requires manual intervention;
8. duplicate/out-of-order Stripe events converge monotonically;
9. owner UI says transferred to Stripe and exposes no manual amount/button or
   bank-arrival claim.

**STOP conditions:** caller controls money authority; an unvalidated/unknown/x402
use accrues; Stripe is mirrored as an AE cash ledger; provider release precedes
reservation; one amount can transfer twice; unknown is released without proof;
partial recovery exceeds its allocation; production policy is invented; or a
Transfer is described as bank payout.

## 6. Workstream C — effect identity, reservation cleanup, and buyer convergence

**Covers:** PRA-004, PRA-005, buyer anger-test #2/#3.  
**Owners:** Answer tool runner/reservation/checkpoint/finalization; Operation invocation reservation/control; `AeChat` Stop/navigation.  
**Non-goal:** generic stream resumption, a second journal, or automatic retry after a possibly released effect.

### 6.1 Stable Answer Operation effect identity

`runRealToolUseAgent` already assigns a turn-global `callInput.seq` before execution and stores it on the tool record. Carry that existing ordinal into authenticated Operation invocation identity.

Use one versioned command-key material owned by Answer's invocation adapter:

```text
answer-operation-effect:v1 =
  reservation/turn identity
  + reservation generation
  + stable logical tool ordinal (callInput.seq)
```

The derived idempotency key names the stable effect slot only. `operationRef` and canonical input remain in the invocation request/input digests owned by the existing Operation reservation. Under the same key, an exact request replays and a changed operation or input conflicts; changed model output cannot mint a new effect key. Do not use model-generated `toolCallId`, wall-clock time, retry count, provider response, or checkpoint-write timing.

After a process/lease death between provider dispatch and checkpoint persistence, the recovered turn reconstructs the same ordinal and therefore the same Operation invocation key. Exact replay returns the original result; changed operation/input conflicts under that key, while a genuinely separate same-input call at another stable ordinal remains a distinct intended effect.

### 6.2 Abandon replayed workless reservations

In `createOperationInvokeApplication`:

1. reserve or replay;
2. if replayed, perform the existing authoritative `readReplay`;
3. if a result/work marker exists, return/read it and never abandon;
4. if readback succeeds and proves no result/work, a fresh pre-dispatch refusal may call the existing guarded `abandon` even though the reservation was replayed;
5. if dispatch races with abandonment, the Convex owner returns `dispatch_started`; surface runtime unavailability/recovery, never erase work.

Delete the blanket `reservationWasReplayed` bypass. Preserve current principal/owner/material/OCC/work-marker checks in `capabilityOperationInvocations.ts`.

### 6.3 Terminal SSE and durable state must converge

The Answer orchestrator owns finalization; the route writer owns framing only. The contract becomes:

- an `error` terminal frame is emitted only after a reservation-bound idempotent error finalization returns terminal/error or exact replay;
- if durable finalization is unavailable, emit the existing typed persist/unavailable problem and retain recoverable identity; do not claim the turn terminal while readback says pending;
- the route-level catch must call/reuse the same narrow finalization adapter with the admitted reservation identity before writing its terminal frame; it must not manufacture a second turn or bypass generation checks;
- reload of the exact thread after a terminal error must project `error`, not `pending`.

Prefer extending the incumbent `finalizeReservedAnswerTurn` contract for a bounded error finalization over adding a new mutation/state machine. If its invariants cannot represent the error path, STOP and report the missing invariant rather than adding an unrelated failure table.

### 6.4 New question uses Stop, then navigation

When no turn is active, New question may navigate directly to canonical `/t/new`. When a durable turn is active:

1. preserve current thread/turn identity;
2. call the existing `stopAnswerTurnRequest`;
3. await `stopped` or `already_settled` and refresh durable projection;
4. only then clear pending draft/optimistic/live client state;
5. navigate to `/t/new` through the existing router;
6. on Stop failure, keep the current URL and recovery controls; do not discard identity.

### 6.5 Behavioral proof

Extend:

- `tests/unit/answer/answer-selected-operation-loop.test.ts`;
- `tests/unit/answer-thread/answer-turn-checkpoint.test.ts`;
- `tests/unit/answer-thread/answer-turn-finalization-convergence.test.ts`;
- `tests/unit/capability-execution/operation-invoke.test.ts`;
- `tests/unit/convex/capability-operation-reservation.test.ts`;
- `tests/integration/answer-thread-route-failures.test.ts`;
- existing `AeChat`/turn-stop component or integration tests.

Required kill-point cases:

1. kill after provider effect but before tool checkpoint; rerun reuses the same ordinal/key and provider effect count remains one;
2. same turn invokes the same Operation with identical input at two distinct tool ordinals; they are distinct intended effects;
3. crash before dispatch, replay with no result, then fresh preflight refusal; reservation is abandoned and concurrency is released;
4. dispatch begins concurrently with abandonment; work remains visible and recoverable;
5. stream throws after reservation; terminal frame and exact-thread reload both show error;
6. New question during active work stops/already-settles durably before leaving; Stop failure preserves the old thread and recovery identity.

**STOP conditions:** ordinal is derived after execution; key contains wall time/model call ID; recovery can change ordinal; abandonment can delete work-bearing rows; route emits terminal before durable convergence; New question clears identity before Stop result.

## 7. Workstream D — provider revocation and x402 onboarding

**Covers:** SG-017, SG-011.  
**Owners:** provider-connection row + existing Workpool; current readiness evidence + owner supply funnel.  
**Non-goal:** a second provider lifecycle, another Workpool, a paid self-test, or fake Qualified Use.

### 7.1 Persist the exact cleanup attempt with work identity

`enqueueCleanupWork` already enqueues through `customerRequestRouteWorkpool` from a mutation. Convex's component enqueue sub-mutation and the row patch participate in the outer transaction. Add the omitted `cleanupAttempt: context.cleanupAttempt` to the same persisted `next` connection that binds:

- work ID and kind;
- cleanup command ID;
- request digest;
- expected authority generation/digest;
- callback grace deadline.

The worker and callback carry this identity unchanged. Keep `retry:false`; a cleanup adapter may be non-idempotent. The callback remains total and idempotent and may only apply to the matching row/work/attempt/authority tuple. Intermediate/unknown provider effects remain `cleanup_required`, not fake revoked success.

### 7.2 Complete x402 Test from no-payment challenge evidence

Reuse the existing readiness probe. For x402, Test means **the exact admitted resource returned a fresh valid payment challenge**, not that AE paid or received output.

The action may return completed only when current readiness evidence proves all of:

- source/adapter is the exact admitted x402 Operation;
- response status is `402`;
- `PAYMENT-REQUIRED` decodes as x402 v2;
- resource URL, scheme, network, asset, payee, amount, currency/exponent, target digest, and request digest match admitted material;
- evidence includes the current valid challenge marker and is within the bounded validity window.

Do not append `supply_owner_test_observed/outcome:'filled'` for this branch. The owner funnel projects Test complete from the exact fresh readiness evidence. Keep a real `filled` event reserved for actual output/Qualified Use.

Branch owner UI copy:

- non-x402: existing real test language;
- x402: “Check payment challenge (no payment sent).”;
- explicitly state this is not Qualified Use, earnings, settlement, or live-availability proof.

### 7.3 Behavioral proof

Extend:

- `tests/unit/convex/provider-connection-cleanup.test.ts`;
- `tests/unit/capability-supply/provider-connection.test.ts`;
- `tests/integration/capability-supply-owner-funnel.test.ts`;
- `tests/unit/capability-supply/readiness-probe.test.ts`;
- `tests/unit/ui/supply-funnel.test.tsx`.

Required cases:

1. first revocation job uses the same persisted attempt as worker/callback and reaches terminal cleanup without manual retry;
2. stale callback/work/attempt/authority is fenced;
3. exact fresh x402 challenge completes Test without invoking signing, custody, paid transport, money ledger, payout, or filled-call event;
4. malformed, mismatched, expired, or stale challenge remains refused/in progress;
5. owner readback and UI accurately distinguish challenge readiness from a real paid fill.

**STOP conditions:** attempt cannot be atomically bound with enqueue; callback accepts a mismatched tuple; x402 Test signs/pays; a `402` alone is treated as healthy; the action says complete while projection remains in progress; challenge evidence is described as revenue or Qualified Use.

## 8. Workstream E — public contract projection

**Covers:** WGA-002 verification/closeout, WGA-004 repair.  
**Owners:** canonical Service producer and operation map; OAuth pure contract/validator/metadata; generated CLI/skill surfaces.  
**Non-goal:** a public contract graph, docs registry, legacy compatibility vocabulary, or generic OAuth/MCP framework.

### 8.1 WGA-002 is a proof task, not presumed implementation

Current source verification found:

- `ServiceEndpointDto.ae.access` is `external`;
- execution is `answer_tool | request_route | catalog_only`;
- `projectServiceFromBusinessDto` is the sole Service producer;
- operation linkage comes from the capability-supply offering-operation map;
- current `/SKILL.md` teaches exact Operation search/detail/connect/invoke/status/recovery routes and names `ae_operation_invoke`;
- direct keyless execution is explicitly conditional on the exact current Operation detail.

Run the focused projection and generated-file tests. Add only missing parity assertions:

- every generated access/execution term is drawn from canonical DTO/action/route values;
- an unlinked or ambiguous external endpoint remains `catalog_only` with no fabricated `operationRef`, price, credentials, or route;
- no generated source teaches `ae.access:'open'`, supplier-URL POST as AE execution, or `/api/v1/services` as the canonical invocation path;
- exact route/action/MCP names match registered contracts.

If these pass, mark WGA-002 source-fixed and reconcile the ledger. If they fail, repair the existing producer/renderer named by the failing assertion. Do not create another schema or prose registry.

### 8.2 One executable OAuth registration example

Move the built-in device-client registration request into one pure contract builder/value under the existing agent-access OAuth module. It must contain the exact fields accepted by `handleOAuthRegisterPost`:

```json
{
  "client_name": "Agentic Economy CLI",
  "redirect_uris": ["http://127.0.0.1/callback"],
  "grant_types": ["urn:ietf:params:oauth:grant-type:device_code"],
  "response_types": [],
  "token_endpoint_auth_method": "none",
  "scope": "market_operations:invoke"
}
```

Use the same value in CLI `connect` and the machine-readable manifest. Replace prose-only step 1 with structured method/path/media/request material. Preserve exact device polling semantics: `authorization_pending` waits; `slow_down` increases interval; denial/expiry/other terminal errors stop. The manifest remains AE's actual supported flow, not a claim that DCR/device flow is universal MCP behavior.

A manifest wire-shape change is a clean cutover: bump its schema version and update all consumers/tests; leave no old alias.

### 8.3 Behavioral proof

Extend:

- `tests/unit/registry/services-api-projection.test.ts`;
- `tests/seo/agent-skill.test.ts` and focused `tests/unit/discovery/*` parity tests;
- `tests/unit/server/agent-access-oauth-api.test.ts`;
- `tests/unit/routes/oauth-metadata.test.ts`;
- CLI manifest/connect tests.

Required cases:

1. serialized manifest registration request sent to `handleOAuthRegisterPost` returns `201`;
2. omission of `client_name` or `redirect_uris` remains rejected;
3. connect and manifest registration material are byte/structure-equivalent after serialization;
4. advertised grants, response types, token method, endpoints, scope, and polling behavior match runtime constants;
5. Service/generated route parity assertions above pass.

**STOP conditions:** runtime handler must be imported into a client/browser bundle; docs need a second parser/schema; manifest advertises unsupported OAuth/MCP behavior; a WGA-002 failure cannot be traced to one current producer/renderer.

## 9. Execution waves

Workstreams are coordination labels only. Parallelism is allowed by file ownership, not by inventing abstractions.

### Wave 0 — freeze unsafe claims

- Keep live-money gate fail-closed.
- Record the accepted P0 count as zero and the eleven roots above.
- Do not run hosted certification or produce a receipt.
- Confirm Node 22 and the current source-write/Convex target before behavioral work.

### Wave 1 — independent source invariants

Run in parallel where file scopes permit:

- A1: PRA-001 rail separation;
- B1: PRA-003 automatic daily settlement, exact reservation, and Stripe Transfer admission;
- C1: PRA-004 ordinal identity and PRA-005 guarded abandonment;
- C2: buyer terminal/New question convergence;
- D1: SG-017 cleanup-attempt binding;
- D2: SG-011 x402 no-payment Test;
- E1: WGA-002 verification and WGA-004 structured OAuth example.

PRA-002 follows PRA-001's rail branch inside the same worker owner; one implementer should own both worker edits to avoid split settlement authority.

### Wave 2 — cross-owner behavioral proofs

- worker + money exact conservation/reversal;
- Answer kill-point replay + durable terminal reload;
- provider cleanup worker/callback first-attempt completion;
- owner x402 funnel projection/UI truth;
- generated Service/OAuth cold-client round trip.

No project-wide gate runs while parallel implementers are still editing.

### Wave 3 — source release gate

After focused behavior passes:

1. Node 22 TypeScript;
2. Convex codegen dry-run;
3. lint;
4. focused integration/conformance suites covering changed contracts;
5. production build;
6. Answer evaluation only if Answer behavior changed in a model-visible way.

Failures are triaged to changed scope vs pre-existing/shared-tree/environmental; no blanket suppression or test deletion.

### Wave 4 — hosted prerequisites and SG-024

Do not start until §10 is satisfied. Run one exact-revision, run-owned certification that may span a real UTC period close; validate and upload only the strict parsed receipt. No clock manipulation, console capture named `.json`, seeded/unrelated payout history, fixture identities, or source-only/local substitutions.

## 10. Hosted certification contract

SG-024 can close only when all of the following are true:

### 10.1 Source gates

- PRA-001–PRA-005 green;
- buyer terminal/New question convergence green;
- WGA-004, SG-017, SG-011 green;
- WGA-002 verified/reconciled;
- no open P0/P1 remains in this scope.

### 10.2 Out-of-scope blockers and runtime prerequisites

The first two bullets are separately owned P2 blockers, not work authorized by this plan. Their presence does not prevent P1 source-remediation closeout; it keeps SG-024 blocked:

- PRA-007 shared runtime/static SSRF range parity must be green before any supplier URL is called;
- WGA-015 preparation must bind source revision, exact Vercel deployment ID, exact Convex deployment ID, and Convex URL, with byte-equal identities at completion;
- production minimum payout policy must exist for the exercised currency;
- canonical URL, Clerk, Convex, model/provider, source-write authority, Stripe, x402 custody/facilitator, supplier connections, and approved disposable owner/buyer/provider fixtures must be configured.

SG-016 owner connection-management UI is not required to prove the backend economic lane, but no certification may claim the owner product supports connection maintenance while it remains open.

### 10.3 Positive hosted sequence

Use one real Clerk-issued AE key and two real admitted Operations from distinct supplier/connection modes. The run has two stages bound to one run ID, run-owned disposable fixtures, and unchanged source/Vercel/Convex deployment identities:

1. discover and inspect exact current Operation A and B;
2. connect/validate the one AE key and exact origin;
3. invoke provider-direct x402 Operation A; validate contract output and settlement evidence; prove zero AE-internal debit/accrual/rake/payout mutation;
4. invoke AE-internal charged Operation B; validate contract output before exactly one charge/accrual/rake into an `open` period, and prove that period cannot transfer;
5. exercise a bounded invalid-output control and prove no surviving settlement/accrual;
6. exercise durable status and one uncertain/recovery path with the original invocation and key;
7. preserve the strict stage-one evidence until the real UTC period closes. Resume only against byte-identical deployment identities; any deployment change invalidates and restarts the certification. If no exact stage-one evidence exists, wait—never substitute seeded or unrelated history;
8. during the admitted review policy, advance the now-closed period, create exactly one Stripe transfer for the accrual bound to Operation B, and read it back by exact provider identity;
9. if the product claim says funds reached an external bank/debit account, additionally observe the separate payout lifecycle; otherwise label the receipt only as transfer-to-connected-balance evidence;
10. revoke the caller/provider authority and prove replay/new invocation is refused without hiding prior history;
11. read exact usage/evidence/money/owner projections;
12. emit one strict receipt bound to both stages, source revision, deployed Vercel identity, deployed Convex identity/URL, run ID, fixture ownership, operation/attempt/payment/transaction/transfer identities, exact before/after amounts, and evidence digests;
13. parse and independently validate the receipt before artifact upload.

GitHub artifact attestation is optional at this P1 boundary. Exact deployed identity plus strict receipt is the required proof. If build provenance becomes a release policy, use GitHub's native attestation and verify exact signer workflow/repository/digest; never treat attestation alone as runtime, security, money, or payout proof.

## 11. No-discretion implementation contracts

Each implementation assignment must include:

- exact root ID and owner files;
- the invariant and allowed incumbent seam;
- explicit forbidden shortcuts;
- the focused behavioral proof;
- a STOP-and-report clause when any named premise is false;
- instruction to skip formatters, linters, builds, and project-wide suites until the wave closes.

Suggested slices:

| Slice | Exact ownership | Contract |
|---|---|---|
| Money worker | operation worker + worker tests | PRA-001/002 only; rail before authorization, validate before reconcile. |
| Payout policy | money ledger/payout policy/Stripe provider + payout tests | PRA-003 only; automatic daily full-balance settlement, pre-release exact reservation, sub-minor carry, global currency serialization, and fail-closed production policy. |
| Answer effect identity | Answer tool-use agent/checkpoint tests | PRA-004 only; key by reservation/generation/ordinal, retain operation/input in conflicting request material, no new journal. |
| Invocation abandonment | operation-invoke + reservation tests | PRA-005 only; empty replay can abandon, work-bearing cannot. |
| Buyer convergence | Answer route/orchestrator/AeChat + route/UI tests | terminal durable parity and Stop-before-New-question. |
| Cleanup lifecycle | provider connections/cleanup + tests | SG-017 exact attempt/work tuple in incumbent Workpool. |
| x402 Test | owner supply/funnel/UI + readiness tests | SG-011 challenge evidence, no payment/fill. |
| Public projection | OAuth pure contract/connect/manifest + generated parity tests | WGA-004 repair, WGA-002 verify/close only. |
| Hosted proof | workflow/smoke/receipt tests | SG-024 only after all prerequisites; no source bypass. |

## 12. Completion criteria

This plan's P1 source-remediation work is complete only when:

- every implementable accepted P1 source root has a source change or evidence-backed verification-only closeout;
- all focused behavioral proofs pass from the current working tree;
- current callers, generated consumers, tests, and active status documents agree;
- no compatibility shim, duplicate authority, fake fill, fake payout, or second framework remains;
- source release gates pass under Node 22;
- SG-024 remains explicitly blocked—not reassigned into this plan—until its separately owned P2 blockers, operator/legal settlement policy values, one real automatic settlement run, and one exact hosted receipt satisfy §10;
- PAPERCUTS, PROJECT, STATE, ROADMAP, and this plan use the same proof ceiling and do not cite local/source success as hosted value exchange.

### Verification update — 2026-08-12

The complete Node 22 post-codegen source gate passed from the current tree.
PRA-001, PRA-002, PRA-004, PRA-005, buyer convergence, provider cleanup, x402
readiness-only Test, and public projection repairs are focused-verified.
PRA-003 now has an accepted source design in ADR-034: automatic daily
full-balance settlement with exact pre-release reservation and no invented
commercial threshold. Its source implementation remains open. The outer
production release gate still fails closed at deployment-manifest validation
and on missing operator/legal settlement values; no hosted or live-money proof
was earned.

Until then, the honest product verdict is unchanged: AE has substantial source-complete admission, invocation, recovery, and money machinery, but it cannot yet safely claim that a buyer can finish paid value exchange, a supplier can receive reconciled payout, or a cold client can always complete/handoff/recover the full hosted loop.
