# ADR-034 — Supplier usage, Qualified Use, and payout spine

**Status:** Accepted; owner readback implemented at source/local verification boundary, remaining sequence below  
**Date:** 2026-08-08  
**Supersedes:** ADR-025 only where it says provider payouts have no source owner or are wholly deferred

## Context

Agentic Economy's category requires more than publishing supply: an authorized agent must invoke an admitted third-party Market Operation, contract-valid delivery must be evidenced, and the Supplier must receive attributable economic readback.

The current source contains most primitives but not one reachable production spine:

- admitted operation identity, binding, lifecycle, and routeability live in capability supply (`src/modules/capability-supply/public.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `convex/capabilitySupplyOperations.ts`);
- Action Invocation owns authority, attempt identity, release, retry, and durable terminal state (`src/modules/action-invocation/dynamic-published-adapter.ts`, `src/modules/action-invocation/internal/convex-schema.ts`, `convex/actionInvocationControl.ts`);
- output is contract-valid only after `descriptor.validateOutput` succeeds (`src/modules/action-invocation/dynamic-published-execution.ts`);
- the Convex money kernel already owns exact accounts, ledger entries, transactions, usage events, provider accrual, rake, refunds, payout policy, and payout state (`src/modules/money/public.ts`, `src/modules/money/internal/convex-schema.ts`, `convex/moneyLedger.ts`);
- supplier earnings and payout queries now have an owner-derived Convex query, server adapter, and `/owner/supply` projection (`convex/moneyLedger.ts`, `src/modules/capability-supply/supply-funnel.functions.ts`, `src/routes/_operator/owner.supply.tsx`);
- the owner setup/test path explicitly creates neither a paid invocation nor earnings (`convex/capabilitySupplyOwnerSupply.ts`, `src/components/ae/supply/AeSupplyFunnel.tsx`).

Payment authorization, settlement, HTTP success, a provider assertion, and a Bazaar call counter are not contract-valid delivery and are not Qualified Use.

## Decision

### One vertical spine

The first supplier-use path is:

```text
Supplier identity
  → admitted, current operationRef
  → authorized logical invocation and attempt
  → bounded supplier execution
  → output-schema-valid terminal delivery
  → immutable Qualified Use receipt
  → exact fee attribution
  → payout reconciliation
  → owner-authorized supplier readback
```

Each arrow preserves its existing source owner. Discovery never grants authority. Transport never declares delivery truth. Settlement never declares Qualified Use. Projections never become ledger authority.

The first live trial uses exactly one independently operated Supplier, one admitted operation revision, and one consuming agent. It is not production evidence until the live-money gate, supplier credentials/payment authority, hosted reachability, and payout/reconciliation policy are explicitly closed and exercised.

### Qualified Use

A **Qualified Use** is one authorized logical production invocation whose pinned operation contract accepted the input and whose terminal supplier result passed output/evidence validation. Local, development, sandbox, setup, probe, owner/self, refused, failed, duplicate, refunded-before-delivery, and outcome-unknown attempts do not qualify.

Persist one immutable receipt after validation, not before network release:

```ts
type QualifiedUseReceipt = Readonly<{
  qualifiedUseRef: string
  businessId: string
  operationRef: string
  publicationRef: string
  publicationRevision: number
  contractDigest: string
  bindingDigest: string
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  principalClass: string
  requestDigest: string
  responseDigest: string
  evidenceRefs: readonly string[]
  qualifiedAt: number
  environment: 'production'
  usageRef?: string
  transactionRef?: string
}>
```

`qualifiedUseRef` is permanently unique for `(invocationRef, attemptRef, effectGeneration)`. Exact replay with the same canonical digest returns the original receipt. The same identity with changed material is a conflict. No TTL/cache-based dedupe is authoritative. Corrections append attributable reversal/reconciliation facts; they do not mutate delivery history.

Qualified Use is a small evidence module, not a second invocation ledger. Action Invocation remains the lifecycle authority; the money ledger remains the economic authority. Supplier usage, earnings, and payout screens are derived owner-authorized views.

### Two disjoint payment lanes

1. **AE-internal billing:** use the existing Convex money ledger. A production `MoneyInvocationPort` authorizes exact price before release, and deterministic failure refunds or outcome-unknown reconciliation uses the existing mutations. Provider accrual and AE rake remain atomic ledger entries.
2. **Provider-direct x402:** use official x402 packages for challenge/header parsing, verification/facilitator calls, EVM exact/upto settlement, and settlement response decoding. x402 pays the route's `payTo` directly. AE records bound settlement evidence but MUST NOT also create an AE provider payout for the same invocation.

A `PAYMENT-RESPONSE`, signed offer/receipt, transaction reference, or Bazaar quality counter may be settlement evidence. None proves the output satisfied the admitted contract.

### AE-internal supplier settlement policy

The payout purpose is not to issue a bank payment for every Operation call. It
is to convert each definitively settled Qualified Use into an exact supplier
payable, aggregate micro-uses, and discharge that payable once without paying
for invalid work or duplicating the provider-direct x402 lane.

For AE-internal billing, the selected market mechanism is **automatic daily net
settlement** of the full eligible balance for each Business and currency:

- the next UTC settlement run initiates a Transfer within 24 hours of
  eligibility unless an explicit KYC, liquidity, risk-policy, or reconciliation
  blocker exists;
- there is no owner-selected amount, owner payout button, copied monthly review
  window, or AE commercial minimum;
- the only floor is one positive Stripe minor unit; any exact sub-minor
  remainder stays once in the provider earnings account;
- the supplier-facing state is `transferred_to_stripe`, never `paid_to_bank`.
  A Stripe Transfer moves platform balance to the connected account. Stripe's
  downstream payout to a bank/card is separate and is not an AE v1 lifecycle.

The server derives Business, currency, amount, destination, cadence, and policy.
Before provider release, one Convex mutation snapshots the FIFO accrual
composition/high-watermark, reserves the exact amount with a pending provider
debit, decrements available earnings under OCC, and binds both ledger and rail
units to the immutable command. New accrual remains available for the next run.
Definitive provider non-release restores the exact reservation; ambiguous
release freezes it; exact readback resolves only to transferred or
failed-and-released.

One settlement runner serializes commands per platform Stripe account/currency
and accounts for every unresolved reservation. Transfer admission requires
fresh active recipient-transfer capability, a versioned platform reserve
policy, coordinated platform automatic-payout settings, and Stripe balance
readback. Stripe remains the external balance authority; AE does not mirror it
as a second cash ledger.

Pooled Transfers retain immutable allocations to their Qualified Uses.
Supplier-attributable corrections use separate, capped, idempotent partial
recovery commands and a non-negative recovery-due balance; they never mutate
the original Transfer or make `ExactAmount` signed. Buyer payment-rail
fraud/chargeback and processing-fee exposure belongs to AE under the current
Stripe application fee/loss configuration unless accepted terms change it.

Production stays fail-closed until operator/legal authority supplies the
supported payment-method finality rules, per-currency reserve and emergency
stop, jurisdictions/currencies, supplier-fault/dispute/offset/insolvency terms,
and merchant-of-record/safeguarding/tax/reporting decisions. The initial
recommended policy is daily automatic settlement, zero AE ageing, no commercial
minimum, and no supplier rolling reserve; none of those values is a live-money
claim without signed production policy and hosted proof.

### Reuse; do not hand-roll

| Need | Decision |
|---|---|
| Durable source, OCC, indexes, exact ledger, usage, provider accrual, rake, refunds, payout state | **Reuse** Convex and the current money/action-invocation modules. |
| Provider-direct x402 wire and chain behavior | **Adopt** installed `@x402/core`, `@x402/extensions`, and `@x402/evm`; do not reimplement codecs, facilitator protocol, signatures, or chain settlement. |
| Event identity | **Adapt** CloudEvents `source + id` shape, but use permanent Convex uniqueness plus canonical-digest conflict detection. |
| Durable-before-notify and bounded retry | **Adapt** OpenMeter/Svix ordering; reuse installed Convex Workpool/Workflow. External effects still require provider idempotency and outcome reconciliation. |
| Supplier webhook verification | Use the installed official Stripe SDK over the unmodified raw body for Stripe events; do not hand-roll HMAC parsing. Adopt `standardwebhooks` only if a later non-Stripe supplier protocol selects that standard. |
| Metering/billing platforms | **Reject** OpenMeter and Lago runtimes/ledgers now. They duplicate AE authority and add Kafka/ClickHouse/Postgres/Redis or Rails/Sidekiq/Kafka infrastructure. Lago is AGPL-3.0. |
| Marketplace quality | **Reject** Agentic.Market/Bazaar call counts, unique payers, ranking, indexing, or validator results as Qualified Use, supplier identity, fee, or payout truth. |
| Webhook platform | **Reject** Svix server now. Pattern-match signing/retry health only; its cache idempotency is weaker than AE's durable identity/digest contract. |
| Stripe/Connect | **Reuse; do not hand-roll.** Keep the installed official Stripe SDK and existing Accounts v2/Connect/Transfer adapter; no custom card, KYC, webhook-signature, transfer, or bank-payout protocol. |

Reference provenance: x402 source commit `1fec3aa04e4136fb6b8fa8ff0c03bcac9a278cef`; OpenMeter `a9a7283754b7f5ff721efc51d1c6e6431ad830c3`; Lago `b4ad1532e7c5605f7339662ac1b010b3a9bcfd7f` with API submodule `71680d30cf695c86c59510dbb201a12307fe31be`; Svix `23dc3c480f7951863d53d96a909ddb5f3432c868`. Agentic.Market has no publicly verified source commit; only its public API/docs are precedent.

## Implementation sequence and gates

1. **Owner readback — implemented at source/local verification boundary:** expose existing provider earnings and payout state through owner-derived identity; render exact amounts and operational call observations separately. Gate met locally: no caller-supplied business authority, no hard-coded currency, no setup/test earnings claim. This does not establish production money or payout evidence.
2. **Qualified Use receipt:** add the immutable receipt and owner-bounded query. Write only from schema-valid terminal Action Invocation. Gate: exact replay, changed-digest conflict, failed/refused/unknown/non-production exclusion.
3. **Production invocation/money adapter:** provide a Convex-backed `MoneyInvocationPort`, idempotent operator/provider/rake account provisioning in one configured currency, and durable charge attribution bound to invocation/attempt/generation. Gate: price requalification, concurrent duplicate, deterministic refund, uncertain reconciliation, no in-memory authority.
4. **One Supplier + one agent:** admit one independently hosted operation and invoke it through the production Action Invocation path from one consuming agent surface. Gate: supplier identity, current operationRef, bounded input/output, real endpoint, terminal durable readback, Qualified Use receipt.
5. **Settlement and payout:** choose either provider-direct x402 or AE-internal billing for the trial, never both. For AE-internal billing, implement the automatic daily full-balance settlement policy above through the existing exact ledger and official Connect adapter. Gate: source-derived amount/authority, exact reservation before provider release, sub-minor carry, global per-currency liquidity serialization, duplicate/unknown outcome protection, partial recovery, event reconciliation, and truthful `transferred_to_stripe` owner readback.
6. **Supplier event delivery only when demanded:** add a domain outbox and Workpool dispatch after Qualified Use exists. Gate: durable-before-notify, raw-body signature, key rotation, bounded retries, endpoint health, replay/digest conflict, redacted failures.

## Consequences

- ADR-025's separation of Commercial, Usage, operation payment, telemetry, and authority remains in force. Only its blanket payout deferral is superseded: payout and Stripe Transfer source seams exist at the source/local boundary, while the automatic settlement policy above remains unimplemented and hosted live money remains blocked.
- `moneyUsageEvents` records charging/usage state; it is not retroactively relabelled Qualified Use.
- `capabilityCallEvents` remains liquidity/operational telemetry. A fill is not Qualified Use.
- No new external dependency is justified for owner readback, receipt durability, or ledger arithmetic.
- A supplier-facing earnings screen may truthfully show no recorded earnings while live-money gates remain open.
- Release claims require one real supplier invocation, durable contract-valid receipt, exact economic attribution, and reconciled owner readback. Source shape or local fixtures alone cannot claim production usage, revenue, or payout.
