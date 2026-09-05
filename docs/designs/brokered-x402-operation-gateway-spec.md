# Brokered x402 Operation gateway (historical)

**Status:** historical architecture-review artifact; do not implement directly.
It is superseded for sequence, terminology, commercial topology, money model,
module layout and public interface by [`PRODUCT.md`](../../PRODUCT.md),
[`START_LINE.md`](../../START_LINE.md), the
[`implementation roadmap`](../../IMPLEMENTATION_ROADMAP.md) and the
[`agent operating contract`](agent-operating-contract.md)  
**Product authority:** `PRODUCT.md`  
**Build posture:** first vertical slice; no compatibility expansion  
**Decision owner:** Agentic Economy  

> Retain this document only for its single-submit effect fence, uncertainty
> outcome matrix and reconciliation test cases. Historical names and shapes such
> as broker, grant, buyer funds, fixed platform fee, receipt and
> `brokered-x402/` are not current implementation instructions. Package 4 uses
> principal-reseller Seller identity, Mandate, AUD Prepaid balance, all-in AUD
> Call price, separate corporate USDC treasury and Provider obligation, Call
> evidence, and the deep managed-Call module defined by the active roadmap.

## 1. Feature definition

Agentic Economy exposes one authenticated managed-Call boundary through which
an Agent Principal acquires one explicitly selected, published Operation under
an exact Commitment. For the first slice, the Operation is a fixed-price,
read-only HTTP resource paid upstream through x402.

For the active Package 4 fact pattern, Agentic Economy is the buyer-facing
Seller, not merely a broker:

```text
agent / existing harness
        |
        | operationRef + literal input + idempotencyKey
        v
Agentic Economy managed-Call boundary
        |
        | reserve AUD balance and Agent Principal budget
        | commit corporate USDC capacity
        | sign with AE-controlled custody
        | send one x402-authorized origin request
        v
x402 supplier
        |
        | literal result + settlement evidence
        v
Agentic Economy captures/releases the buyer Charge, records the separate
Provider obligation and returns the usable result or a safe continuation
```

This is the OpenRouter pattern applied to x402 services: one buyer-facing
gateway, server-side upstream payment, a normalized result and Call evidence,
and no customer wallet.

The gateway does not search, compare, select, reroute, fail over, plan, or own
the caller's work. Those actions stay outside this feature. The selected
Operation is an input, not a decision the gateway is allowed to revisit.

## 2. Locked decisions

The following are constraints, not open implementation choices.

1. **Managed principal-reseller settlement.** The buyer uses an AUD Prepaid
   balance. Agentic Economy reserves the all-in AUD Call price and pays its
   separate upstream obligation from corporate USDC. The caller never owns or
   signs the upstream x402 payment.
2. **Explicit selection.** The caller supplies one canonical `operationRef`.
   The gateway never chooses another supplier and never silently falls back.
3. **Inspected terms are binding.** The Commitment binds the Operation revision,
   all-in AUD Call price or hard ceiling, x402 requirement digest, route and
   material terms. Any mismatch is rejected before signing. A new `402` after
   signed submission is terms drift, not permission to sign again.
4. **Synchronous by default.** The happy path returns the literal validated
   result in the invocation response. `reconciliation_required` exists only
   when the signed request may have been observed or settlement is uncertain.
5. **One origin submission.** Supplier admission/readiness captures and pins
   the x402 requirement. Invocation signs that requirement and sends the first
   and only origin request with `PAYMENT-SIGNATURE`.
6. **Usable-result guarantee.** The buyer is charged only when supplier
   settlement is evidenced and the returned output satisfies the Operation
   contract. If the supplier is paid but the output is unusable, Agentic
   Economy releases/refunds the buyer and records the supplier payment as an
   Agentic Economy loss.

## 3. First-slice support cell

Only this cell is supported:

| Axis | Supported value |
|---|---|
| Market unit | one published Operation revision |
| Selection | explicit caller-selected `operationRef` |
| Transport | HTTP JSON |
| Payment protocol | x402 v2 |
| Payment scheme | `exact` |
| Economic lane | principal-reseller AUD Prepaid balance plus separate corporate USDC settlement |
| Supplier payer | Agentic Economy custody wallet |
| Price | one fixed all-in AUD Call price |
| Consequence | read-only |
| Response | synchronous literal JSON |
| Retry | caller idempotency replay, never blind provider replay |

Unsupported values produce a stable refusal before buyer funds are reserved or
a payment authorization is created.

### Explicit non-goals

- caller wallets or caller-signed x402 payloads;
- supplier API keys, OAuth connections, or reusable provider credentials;
- automatic routing, scoring, fallback, or load balancing;
- MCP, CLI, chat, streaming, or asynchronous supplier jobs;
- free tiers, variable prices, auctions, subscriptions, or postpaid billing;
- consequential writes, communications, or approval workflows;
- multiple networks, assets, x402 schemes, or facilitators in the first slice;
- general-purpose execution, workflow, session, memory, or agent runtime;
- restoring the previous worker stack merely for compatibility.

## 4. Architectural invariants

These invariants must be visible in types and tests.

### Market invariants

- `operationRef` names an immutable published revision containing every
  execution- and price-critical fact.
- The content-bound Operation reference is the inspection binding for the
  first slice; no mutable "latest quote" is read during invocation.
- Readiness may expire, but the route and price may not mutate under an
  existing reference.
- The caller cannot supply a URL, payee, network, asset, amount, fee, x402
  challenge, facilitator, or payment header.

### Money invariants

- `buyerTotal = supplierAmount + platformFee`, in the same asset and exponent.
- Buyer funds are reserved before the custody signer can be called.
- A supplier payment authorization cannot exceed the reserved supplier amount.
- The platform fee is never sent to the supplier.
- Buyer settlement is finalized only after trusted supplier settlement evidence
  and valid output exist.
- An uncertain external payment keeps the buyer hold reserved; it is neither
  silently captured nor released.
- Money records are append-only accounting facts plus explicit state
  transitions. Invocation code does not manufacture ledger entries directly.

### Effect invariants

- One invocation has one effect generation in this slice.
- `possibly_submitted` is durably recorded immediately before the network call.
- Once `possibly_submitted` is recorded, automatic provider replay is forbidden.
- A repeated idempotency key with the same fingerprint returns the existing
  state or terminal result. A different fingerprint is a conflict.
- Payment replay protection does not claim provider-effect idempotency. Both are
  required and tracked separately.

### Result invariants

- `completed` means: valid output persisted, supplier settlement evidenced,
  buyer charge settled, and receipt persisted.
- `refused` means the system can safely assert that the buyer is not being held
  for an unresolved payment.
- `reconciliation_required` means the system cannot safely assert whether the
  supplier payment or provider effect completed. It is never disguised as a
  retryable refusal.
- Public receipts are protocol-neutral projections. Base/USDC constants belong
  in the supported Operation/payment adapter, not in the generic invocation
  contract.

## 5. System ownership

The active Package 4 feature has six durable owners and one coordinator.

| Owner | Owns | Must not own |
|---|---|---|
| Authority | Business Principal, Account, Agent Principal, credential evidence, Mandate use and aggregate exposure | customer balance, Provider effect, treasury state |
| Invocation | idempotency, selected snapshot, execution phase, literal input/output, terminal result | account balances, signer secrets, chain truth |
| Buyer AUD | available/reserved balance, Charge, release, adjustment and refund | Provider output, corporate treasury, Operation selection |
| Corporate treasury | USDC capacity, commitment, custody evidence and settlement movement | buyer balance, buyer Charge, output validity |
| Upstream payment | x402 requirement digest, authorization identity, submission evidence and settlement observation | buyer balance, Call price, output validity |
| Provider obligation | amount and state owed upstream under the Provider arrangement | buyer consideration or customer balance |
| Gateway coordinator | ordering the handoffs and mapping their typed outcomes | durable truth duplicated outside the owning modules |

The coordinator is an application service. It does not become another state
machine. If it crashes, the owning records must contain enough information for
status and reconciliation to continue.

## 6. Internal outcome algebra

This section is retained as the kernel's typed outcome sketch, not the Package 4
public response contract. Authentication injects Business Principal, Account,
Agent Principal, credential and Mandate context; none is accepted from the
request body. The public projection uses the versioned compact envelope and
executable `safeContinuations` in the agent operating contract. The later
`receipt` names below mean linked Call evidence and must not be implemented as a
new universal Receipt domain object.

```ts
export type InvokeOperationCommand = Readonly<{
  operationRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}>

export type InvokeOperationResult =
  | Readonly<{
      kind: 'completed'
      invocationRef: string
      operationRef: string
      output: JsonValue
      receipt: OperationReceipt
    }>
  | Readonly<{
      kind: 'reconciliation_required'
      invocationRef: string
      operationRef: string
      reconciliation: ReconciliationHandle
      receipt?: OperationReceipt
    }>
  | Readonly<{
      kind: 'refused'
      operationRef?: string
      stage: RefusalStage
      code: BrokeredInvokeRefusalCode
      retryable: boolean
      nextAction?: string
      receipt?: OperationReceipt
    }>
```

`pending` is not a happy-path response. `needs_authority` is outside the
read-only first slice. If either is retained temporarily for compatibility,
the new brokered x402 path must not emit it.

### Request fingerprint

The idempotency fingerprint is:

```text
sha256(
  principal owner id
  + grant ref and generation
  + immutable operationRef
  + canonical literal input
  + runtime environment
)
```

Do not include timestamps, correlation IDs, generated invocation IDs, or
mutable readiness observations. The same caller intent must reproduce the same
fingerprint after a process restart.

### Receipt

```ts
export type OperationReceipt = Readonly<{
  receiptRef: string
  invocationRef: string
  operationRef: string
  state: 'settled' | 'refunded' | 'reconciliation_required'
  supplierAmount: ExactAmount
  platformFee: ExactAmount
  buyerTotal: ExactAmount
  priceDigest: string
  payment: Readonly<{
    protocol: 'x402'
    network: string
    asset: string
    paymentIdentifier: string
    settlementTransactionHash?: string
    evidenceHash: string
  }>
  buyerAccountingTransactionRefs: readonly string[]
  lossState: 'none' | 'supplier_paid_output_unusable' | 'unknown'
  issuedAt: string
}>
```

The receipt reports what happened; it is not the source of truth for balances
or settlement.

## 7. Bound Operation snapshot

The resolver returns one immutable object. Downstream code never rereads the
market publication during the call.

```ts
export type BrokeredX402OperationSnapshot = Readonly<{
  operationRef: string
  revision: number
  operationDigest: string
  providerRef: string
  runtimeEnvironment: 'production'
  consequence: 'read_only'
  retryClass: 'reconcile_before_retry'
  inputContract: JsonContract
  outputContract: JsonContract
  route: Readonly<{
    method: 'GET' | 'POST'
    resourceUrl: string
    timeoutMs: number
    requestMappingVersion: string
  }>
  pricing: Readonly<{
    supplierAmount: ExactAmount
    platformFee: ExactAmount
    buyerTotal: ExactAmount
    priceDigest: string
  }>
  x402: Readonly<{
    version: 2
    scheme: 'exact'
    network: string
    asset: string
    payTo: string
    facilitatorRef: string
    paymentRequiredJson: string
    requirementDigest: string
  }>
  readiness: Readonly<{
    state: 'ready'
    checkedAt: string
    validUntil: string
    evidenceDigest: string
  }>
}>
```

`resourceUrl`, payment terms, and supplier identity are publication-controlled
data admitted by Agentic Economy. They are not provider connections and do not
require a `provider_connection` authority kind. That old dependency is removed
from the brokered x402 path.

Publication/admission must prove:

- the resource URL is public and allowed by egress policy;
- the captured x402 requirement matches the resource URL;
- scheme, network, asset, payee, and amount are supported;
- supplier amount equals the published supplier price;
- platform fee and buyer total are exact and internally consistent;
- the challenge/readiness lifetime extends past the minimum invocation window;
- the output contract is bounded and validateable.

## 8. Durable records

### 8.1 Invocation record

```ts
export type InvocationState =
  | 'reserved'
  | 'funds_reserved'
  | 'payment_prepared'
  | 'submitting'
  | 'output_buffered'
  | 'completed'
  | 'refused'
  | 'reconciliation_required'

export type InvocationRecord = Readonly<{
  invocationRef: string
  ownerId: string
  grantRef: string
  grantGeneration: number
  idempotencyKey: string
  requestFingerprint: string
  operationRef: string
  operationSnapshotJson: string
  operationDigest: string
  inputJson: string
  inputDigest: string
  state: InvocationState
  effectGeneration: 1
  buyerReservationRef?: string
  upstreamPaymentRef?: string
  attemptRef?: string
  outputJson?: string
  outputDigest?: string
  terminalResultJson?: string
  refusal?: Readonly<{ stage: RefusalStage; code: BrokeredInvokeRefusalCode }>
  reconciliationReason?: ReconciliationReason
  version: number
  createdAt: string
  updatedAt: string
}>
```

The immutable Operation snapshot is persisted, not only its reference. This is
required to explain and reconcile an acquisition after publication readiness
expires.

### 8.2 Buyer funds record

```ts
export type BuyerFundsState =
  | 'reserved'
  | 'settled'
  | 'released'
  | 'refunded'
  | 'outcome_unknown'

export type BuyerFundsReservation = Readonly<{
  reservationRef: string
  invocationRef: string
  ownerId: string
  accountRef: string
  supplierAmount: ExactAmount
  platformFee: ExactAmount
  buyerTotal: ExactAmount
  priceDigest: string
  state: BuyerFundsState
  accountingTransactionRefs: readonly string[]
  version: number
}>
```

### 8.3 Upstream payment record

```ts
export type UpstreamPaymentState =
  | 'prepared'
  | 'possibly_submitted'
  | 'settled'
  | 'not_settled'
  | 'settlement_pending'
  | 'outcome_unknown'

export type UpstreamPaymentAttempt = Readonly<{
  paymentAttemptRef: string
  invocationRef: string
  attemptRef: string
  effectGeneration: 1
  paymentIdentifier: string
  requestFingerprint: string
  requirementDigest: string
  authorizationRef: string
  authorizationDigest: string
  custodyWalletRef: string
  supplierAmount: ExactAmount
  network: string
  asset: string
  payTo: string
  state: UpstreamPaymentState
  submittedAt?: string
  responseStatus?: number
  settlementTransactionHash?: string
  evidenceJson?: string
  evidenceHash?: string
  version: number
}>
```

The raw custody key never enters this record. The raw payment header is sealed
behind `authorizationRef`; application logs and public responses contain only
digests and identifiers.

## 9. Application ports

Ports are small capabilities with one owner. Existing large internal modules
may implement them initially, but their broader APIs must not leak into the
new coordinator.

### 9.1 Operation resolution

```ts
export interface OperationSnapshotPort {
  resolveCurrentBrokeredX402(input: Readonly<{
    operationRef: string
    now: number
  }>): Promise<
    | { kind: 'resolved'; snapshot: BrokeredX402OperationSnapshot }
    | { kind: 'refused'; code: OperationResolutionCode }
  >
}
```

This port validates publication/readiness and returns one bound snapshot. It
does not choose among Operations.

### 9.2 Invocation ownership and idempotency

```ts
export interface InvocationStorePort {
  begin(input: BeginInvocation): Promise<
    | { kind: 'created'; record: InvocationRecord }
    | { kind: 'replay'; result: InvokeOperationResult }
    | { kind: 'in_progress'; record: InvocationRecord }
    | { kind: 'conflict' }
  >

  transition(input: Readonly<{
    invocationRef: string
    expectedVersion: number
    intent: InvocationTransitionIntent
  }>): Promise<InvocationRecord>

  read(invocationRef: string): Promise<InvocationRecord | null>
}
```

`begin` is an atomic unique claim on `(ownerId, idempotencyKey)`. `transition`
uses compare-and-set versioning and rejects illegal edges.

### 9.3 Buyer funds

```ts
export interface BuyerFundsPort {
  reserve(input: ReserveBuyerFunds): Promise<
    | { kind: 'reserved'; reservation: BuyerFundsReservation }
    | { kind: 'insufficient_funds' }
    | { kind: 'conflict' }
  >

  settleSuccess(input: FinalizeBuyerSuccess): Promise<BuyerFundsReservation>
  releaseBeforeSubmission(input: ReleaseBuyerFunds): Promise<BuyerFundsReservation>
  refundUnusableOutput(input: RefundBuyerFunds): Promise<BuyerFundsReservation>
  markOutcomeUnknown(input: MarkBuyerFundsUnknown): Promise<BuyerFundsReservation>
  reconcile(input: ReconcileBuyerFunds): Promise<BuyerFundsReservation>
}
```

`settleSuccess` atomically converts the hold into supplier cost and platform
fee ledger entries. The coordinator does not perform two independent debits.

### 9.4 x402 authorization

```ts
export interface X402AuthorizationPort {
  prepare(input: Readonly<{
    invocationRef: string
    attemptRef: string
    effectGeneration: 1
    requestFingerprint: string
    snapshot: BrokeredX402OperationSnapshot
    reservedSupplierAmount: ExactAmount
  }>): Promise<
    | { kind: 'prepared'; payment: UpstreamPaymentAttempt }
    | { kind: 'terms_mismatch'; field: X402BoundField }
    | { kind: 'unavailable' }
  >
}
```

This port parses the pinned requirement, independently matches every bound
field, chooses the configured custody wallet, signs once, and persists a sealed
authorization. It returns no private key and no caller-serializable raw
signature.

### 9.5 single-submit origin transport

```ts
export interface X402OriginTransportPort {
  submitOnce(input: Readonly<{
    invocationRef: string
    attemptRef: string
    route: BrokeredX402OperationSnapshot['route']
    literalInput: Record<string, JsonValue>
    authorizationRef: string
    requirementDigest: string
  }>): Promise<X402OriginObservation>
}

export type X402OriginObservation =
  | Readonly<{
      kind: 'response'
      status: number
      headers: RedactedHeaders
      body: Uint8Array
      settlementEvidence?: X402SettlementEvidence
    }>
  | Readonly<{
      kind: 'transport_uncertain'
      reason: 'timeout' | 'connection_reset' | 'response_lost'
    }>
```

The transport resolves the sealed authorization internally, writes the
`PAYMENT-SIGNATURE` header, enforces SSRF/redirect/body/timeout limits, and
redacts sensitive headers. It does not sign, price, charge the buyer, validate
the business output, or retry the request.

### 9.6 payment observation and reconciliation

```ts
export interface X402SettlementPort {
  observe(input: ObserveX402Settlement): Promise<
    | { kind: 'settled'; evidence: TrustedSettlementEvidence }
    | { kind: 'not_settled'; evidence: TrustedSettlementEvidence }
    | { kind: 'pending'; evidence: TrustedSettlementEvidence }
    | { kind: 'unknown'; evidence?: TrustedSettlementEvidence }
  >

  reconcile(input: ReconcileX402Payment): Promise<
    | { kind: 'settled'; evidence: TrustedSettlementEvidence }
    | { kind: 'not_settled'; evidence: TrustedSettlementEvidence }
    | { kind: 'pending'; evidence: TrustedSettlementEvidence }
    | { kind: 'contradictory'; evidence: readonly TrustedSettlementEvidence[] }
  >
}
```

Production settlement is not trusted merely because an origin response claims
success. The adapter verifies the payment identifier, amount, asset, network,
payee, payer, transaction, and finality using the configured trusted evidence
policy.

### 9.7 output validation

```ts
export interface OperationOutputPort {
  decodeAndValidate(input: Readonly<{
    status: number
    body: Uint8Array
    contract: JsonContract
  }>):
    | { kind: 'valid'; output: JsonValue; outputDigest: string }
    | { kind: 'invalid'; reason: 'status' | 'encoding' | 'schema' | 'size' }
}
```

This is pure. It makes no network, database, payment, or ledger calls.

## 10. Coordinator contract

```ts
export interface BrokeredX402Gateway {
  invoke(input: Readonly<{
    principal: AgentAccessPrincipal
    grant: OperationInvokeGrant
    command: InvokeOperationCommand
    correlationId: string
  }>): Promise<InvokeOperationResult>
}
```

The coordinator owns this order and no alternative order:

1. Resolve and validate the immutable Operation snapshot.
2. Validate the literal input and grant against the bound snapshot.
3. Compute request fingerprint and atomically begin/idempotently replay.
4. Reserve the full buyer total.
5. Persist `funds_reserved` with the buyer reservation reference.
6. Prepare and persist the x402 authorization from the pinned requirement.
7. Persist `payment_prepared` with the payment attempt reference.
8. Persist invocation `submitting` and payment `possibly_submitted` before the
   origin network call.
9. Send exactly one signed origin request.
10. Persist the complete redacted observation before interpreting it.
11. Validate the literal output and verify settlement as independent facts.
12. Apply the outcome table in section 12.
13. For success, atomically settle the buyer hold, persist the output and
    receipt, and transition the invocation to `completed`.
14. Return the stored terminal projection.

Steps 8 and 9 form the conservative effect fence. A crash after step 8 is
recoverable but uncertain. A crash before step 8 is safe to release and retry
through the same idempotency key.

## 11. Happy-path sequence

```text
Agent       Gateway     Invocation     Buyer funds     x402 auth/transport    Supplier
  |            |             |              |                    |                |
  | invoke     |             |              |                    |                |
  |----------->| resolve + validate          |                    |                |
  |            | begin------>| reserved      |                    |                |
  |            | reserve-------------------->| hold total         |                |
  |            | state------>| funds_reserved|                    |                |
  |            | prepare----------------------------------------->| sign sealed    |
  |            | state------>| payment_prepared                   |                |
  |            | fence------>| submitting   |                    |                |
  |            | mark possibly submitted------------------------>|                |
  |            | submit once------------------------------------>|--------------->|
  |            |             |              |                    |<--output+proof-|
  |            | persist observation                             |                |
  |            | validate output + verify settlement             |                |
  |            | settle buyer---------------->| debit + fee       |                |
  |            | complete--->| output+receipt |                    |                |
  |<-----------| completed literal output     |                    |                |
```

No public `pending` hop and no worker claim/lease are required for this path.
Convex actions may orchestrate the network call while internal mutations own
each durable boundary.

## 12. Outcome and compensation table

| Observed facts | Invocation | Upstream payment | Buyer funds | Public result | Automatic origin retry |
|---|---|---|---|---|---|
| Failure before effect fence | refused | absent/prepared only | released | refused, retryable where safe | no; caller repeats same key |
| Valid output + trusted settled payment | completed | settled | settled | completed + receipt | never |
| Invalid output + trusted not-settled | refused | not_settled | released | refused | never |
| Invalid output + trusted settled payment | refused | settled | refunded/released | refused + refunded receipt; AE loss | never |
| Valid output + settlement pending | reconciliation_required; output buffered | settlement_pending | outcome_unknown/held | reconciliation_required | never |
| Transport timeout/reset after fence | reconciliation_required | outcome_unknown | outcome_unknown/held | reconciliation_required | never |
| Signed request returns a new `402` | reconciliation_required, terms drift | observe/reconcile | held until evidence | reconciliation_required | never |
| Provider 4xx/5xx with trusted not-settled evidence | refused | not_settled | released | refused | never |
| Provider 4xx/5xx without conclusive evidence | reconciliation_required | outcome_unknown | held | reconciliation_required | never |
| Trusted evidence is contradictory | reconciliation_required | outcome_unknown | held | reconciliation_required; operator escalation | never |

The gateway never charges a buyer merely because the supplier received a
request. It charges for a settled acquisition that produced contract-valid,
usable output.

## 13. Refusal and uncertainty algebra

Use a small stage-qualified vocabulary rather than one flat list spanning the
whole platform.

```ts
export type RefusalStage =
  | 'resolve'
  | 'validate'
  | 'admit'
  | 'funds'
  | 'authorize_payment'
  | 'provider'
  | 'output'
  | 'finalize'

export type BrokeredInvokeRefusalCode =
  | 'operation_not_found'
  | 'operation_not_current'
  | 'operation_not_ready'
  | 'operation_unsupported'
  | 'input_invalid'
  | 'grant_invalid'
  | 'authority_denied'
  | 'idempotency_conflict'
  | 'insufficient_funds'
  | 'payment_terms_mismatch'
  | 'payment_authorization_unavailable'
  | 'provider_refused'
  | 'provider_output_invalid'
  | 'finalization_unavailable'

export type ReconciliationReason =
  | 'submission_outcome_unknown'
  | 'settlement_pending'
  | 'settlement_outcome_unknown'
  | 'supplier_terms_changed_after_submission'
  | 'finalization_interrupted_after_settlement'
  | 'contradictory_settlement_evidence'
```

Rules:

- `retryable: true` means retry the Agentic Economy command with the same
  idempotency key; it never means create another origin payment attempt.
- Internal exceptions are mapped at their owning port. Raw provider messages,
  stack traces, payment payloads, wallet locators, and facilitator responses
  are never public refusal text.
- `outcome_unknown` is not a refusal code. It always projects as
  `reconciliation_required`.

## 14. Reconciliation

Reconciliation is evidence gathering over the existing invocation and payment
attempt. It is not a second execution path.

Input:

```ts
type ReconcileCommand = Readonly<{
  invocationRef: string
  idempotencyKey: string
}>
```

It performs:

1. load the persisted Operation snapshot, payment identifier, requirement,
   authorization digest, request fingerprint, and redacted origin observation;
2. query trusted facilitator/chain evidence without calling the supplier
   resource again;
3. validate evidence against the exact payer, payee, amount, asset, network,
   and payment identifier;
4. if settled and valid buffered output exists, settle the buyer and complete;
5. if settled but no usable output exists, release/refund the buyer and record
   Agentic Economy loss;
6. if conclusively not settled, release the buyer hold and refuse;
7. if pending, retain the hold and return the same reconciliation state;
8. if contradictory, retain the hold and escalate for operator review.

Reconciliation must be idempotent and must not create a new
`paymentIdentifier`, authorization, effect generation, or provider request.

## 15. Convex transaction boundaries

Convex mutations own durable transitions; actions own external I/O.

Recommended internal operations:

```text
mutation beginInvocationAndReserveIdempotency
mutation attachBuyerReservation
mutation attachPreparedPayment
mutation fenceOriginSubmission
mutation recordOriginObservation
mutation completeAcquisition
mutation refuseAndRelease
mutation markReconciliationRequired
mutation applyReconciliationEvidence

action   invokeBrokeredX402Operation
action   reconcileBrokeredX402Operation
```

Where data is co-located, use one mutation for correlated transitions:

- `beginInvocationAndReserveIdempotency` creates the invocation and unique
  idempotency claim together;
- `fenceOriginSubmission` moves invocation to `submitting` and payment to
  `possibly_submitted` together;
- `completeAcquisition` finalizes buyer accounting and writes the terminal
  invocation projection together after external settlement is evidenced;
- `refuseAndRelease` releases an unsubmitted hold and writes terminal refusal
  together.

Actions do not call `ctx.db`. Public actions call internal queries/mutations.
All public inputs and internal function results require validators.

## 16. Mapping from the stripped codebase

### Keep and narrow

- `operation-invoke-admit.ts`: keep Operation/grant/input admission and the
  caller idempotency semantics; make the immutable snapshot explicit.
- `operation-invoke.ts`: keep it as the application entry, but replace the
  enqueue-only dispatch result with a direct brokered acquisition result.
- `moneyExternalSpendReservations`: adapt as the upstream supplier-spend
  reservation/observation owner.
- `moneyX402PaymentAttempts`: adapt as the x402 authorization and settlement
  owner.
- existing exact amount, price digest, x402 mismatch, replay, and settlement
  verification logic: reuse behind the new ports.

### Change

- `OperationInvokeDispatchPort` must return `completed`,
  `reconciliation_required`, or a pre-effect refusal; `enqueued` is not the
  first-slice success result.
- generic `OperationInvokeReceipt` must stop hardcoding Base and the USDC
  contract. Those values come from the bound payment snapshot.
- the brokered x402 route must no longer require a `provider_connection` or
  credential lease. Published route authority and custody payment authority
  are separate concerns.
- public result state must be a projection of the invocation record, not a
  second independently mutated lifecycle.
- x402 authorization receives the reserved supplier amount and exact bound
  requirement, never a newly computed price.

### Park behind a rollback boundary

- queue/work-pool dispatch, claims, leases, and worker heartbeats;
- provider credential leasing and reusable provider secrets;
- non-x402 access lanes and alternative transports;
- cancellation after the effect fence;
- generic consequential-effect journals;
- automatic reconciliation scheduling beyond the one explicit recovery path.

Parking means the modules may remain in the repository while the first slice
is built. They are not allowed on its runtime call graph. Delete or consolidate
them only after the walking skeleton and rollback checkpoint are proven.

## 17. Proposed module layout

```text
src/modules/capability-execution/brokered-x402/
  contracts.ts                 public and application result algebra
  operation-snapshot.ts        bound snapshot validation
  invocation-state.ts          pure legal transition reducer
  gateway.ts                   coordinator
  outcome.ts                   observation -> terminal decision
  receipt.ts                   protocol-neutral receipt projection
  ports/
    invocation-store.ts
    buyer-funds.ts
    x402-authorization.ts
    x402-origin-transport.ts
    x402-settlement.ts
    operation-output.ts
  adapters/
    convex-invocation-store.ts
    convex-buyer-funds.ts
    convex-x402-payment.ts
    http-x402-origin.ts
```

This layout is a dependency direction, not a demand to move every existing file
before behavior works. Adapters may delegate to existing modules during the
migration.

## 18. Security boundaries

### Request and route

- Authenticate the Agentic Economy bearer and authorize
  `market_operations:invoke` before resolving private execution facts.
- Resolve the route only from the published snapshot.
- Apply DNS/IP checks, public-egress allow rules, redirect rejection, method
  allowlist, request size, response size, and timeout limits.
- Canonicalize literal input before hashing and mapping it to the provider
  request.

### Payment

- Custody key access exists only inside the signer adapter.
- The authorization is bound to invocation ref, effect generation, request
  fingerprint, requirement digest, exact amount, network, asset, payee, payer,
  and expiry.
- The raw `PAYMENT-SIGNATURE`, wallet material, and sealed authorization are
  redacted from logs, traces, Convex public documents, errors, and receipts.
- A mismatched or expired requirement fails before signer access.
- A new supplier challenge never causes the gateway to sign again under the
  same invocation.

### Output

- Buffer and size-limit the body before decoding.
- Validate the output contract before exposing it or settling the buyer.
- Persist only the literal output required by the Operation contract and its
  digest; do not turn arbitrary provider prose into trusted control data.

## 19. Observability

Every event includes:

```text
correlationId
invocationRef
operationRef
providerRef
attemptRef
effectGeneration
requestFingerprint
priceDigest
paymentIdentifier (after preparation)
invocationState
buyerFundsState
upstreamPaymentState
durationMs
```

Never include raw input fields marked sensitive, payment headers, authorization
payloads, wallet locators, private keys, or unredacted provider headers.

Required counters:

- invocation completed/refused/reconciliation rate by Operation;
- pre-sign terms mismatches by field;
- signer contacted without buyer hold: must remain zero;
- origin submissions per invocation: must never exceed one;
- idempotent replay and conflict rate;
- supplier-settled/unusable-output loss count and amount;
- time and amount held in reconciliation;
- settlement evidence disagreement count.

Required trace checkpoints:

```text
snapshot_resolved
invocation_reserved
buyer_funds_reserved
payment_authorization_prepared
origin_submission_fenced
origin_observed
output_validated
settlement_verified
buyer_accounting_finalized
invocation_terminal
```

## 20. Test architecture

### Pure contract tests

- snapshot validation rejects every unsupported support-cell dimension;
- buyer total arithmetic is exact and rejects currency/exponent mismatch;
- request fingerprint is stable across ordering and restart;
- legal transition table accepts every intended edge and rejects every other
  edge;
- outcome reducer covers the complete section 12 matrix;
- receipt projection contains no hardcoded network/asset and no secret fields.

### Port contract tests

- idempotency same key/same fingerprint replays; different fingerprint
  conflicts; concurrent duplicate produces one owner;
- buyer reserve/settle/release/refund/unknown are atomic and idempotent;
- x402 authorization rejects mismatched amount, payee, network, asset, scheme,
  resource, expiry, and buyer reservation before signing;
- payment identifier is bound to invocation, attempt, generation, and request
  fingerprint;
- transport sends exactly one origin request with `PAYMENT-SIGNATURE`, rejects
  redirects, caps body size, and redacts headers;
- settlement verification rejects wrong payer, payee, amount, asset, network,
  transaction, finality, or payment identifier;
- output validation rejects status, encoding, schema, and size failures.

### Orchestration tests

1. valid exact acquisition returns literal output and settled receipt;
2. insufficient balance never contacts signer or supplier;
3. any bound-term mismatch never contacts signer;
4. signer failure releases buyer hold and refuses before submission;
5. origin failure before the fence is retryable through the same key;
6. timeout/reset after the fence produces reconciliation and retains the hold;
7. a second `402` produces terms-drift reconciliation and no second signature;
8. same idempotency replay after success returns identical output/receipt with
   no second signer, supplier request, settlement, or buyer charge;
9. concurrent same-key calls produce one origin submission;
10. crash after fence and before network return is reconciled without supplier
    replay;
11. valid output plus pending settlement buffers the output and does not charge;
12. settled payment plus invalid output releases/refunds buyer and records AE
    loss;
13. finalization crash after supplier settlement completes from stored evidence
    without supplier replay;
14. no brokered x402 path queries a provider connection or credential lease.

### Walking skeleton

The first end-to-end canary must use:

- one admitted fixed-price read-only x402 Operation;
- one funded buyer account;
- one configured AE custody test wallet;
- one official-compatible x402 exact supplier/facilitator;
- the public authenticated invocation entry;
- real Convex persistence and ledger transitions;
- a contract-valid literal result.

The existing provider-direct canary is not proof of this feature because it
does not exercise the buyer hold, custody payment, platform fee, or brokered
receipt.

## 21. Dependency-ordered implementation sequence

Each slice ends in a green proof gate. Do not work ahead across slices merely
because a later test exposes a missing type.

### Slice 1 — Freeze the contract

Deliver:

- support-cell validator;
- bound snapshot type;
- compact public result/refusal/reconciliation algebra;
- pure invocation transition reducer;
- outcome table as executable tests.

Proof gate: no network or database code is required; every state and outcome is
exhaustive at compile time.

### Slice 2 — Establish single ownership

Deliver:

- Convex invocation record and atomic idempotency begin;
- immutable snapshot/input persistence;
- compare-and-set transition mutation;
- status projection from the same record.

Proof gate: concurrent duplicates produce one invocation and terminal replay is
stable after restart.

### Slice 3 — Attach buyer funds

Deliver:

- narrow `BuyerFundsPort` adapter over current money primitives;
- atomic reserve, settle, release, refund, and unknown transitions;
- exact three-part pricing invariants.

Proof gate: signer and transport fakes prove they are never called without the
full buyer hold.

### Slice 4 — Attach pinned x402 authorization

Deliver:

- adapter over existing x402 preparation/signing logic;
- removal of provider-connection authority from this lane;
- sealed authorization reference and payment identity binding;
- mismatch-before-sign tests for every field.

Proof gate: one authorization is prepared for one invocation; no secret or raw
header appears in persisted public state or logs.

### Slice 5 — Walk one synchronous acquisition

Deliver:

- one-submit transport;
- conservative submission fence;
- output validator;
- trusted settlement observer;
- atomic success finalization and receipt projection;
- direct completed result from the invocation entry.

Proof gate: the real brokered canary completes from authenticated caller through
buyer reserve, AE custody payment, supplier result, buyer settlement, and
literal output.

### Slice 6 — Prove uncertainty and recovery

Deliver:

- timeout/lost-response/pending-settlement outcomes;
- explicit reconciliation action over the existing payment attempt;
- buyer hold retention and conclusive release/settle/refund rules;
- crash-point tests around every effect boundary.

Proof gate: no uncertainty case can submit the supplier request twice, and each
case converges or remains explicitly reconciling with evidence.

### Slice 7 — Cut over and remove shadow ownership

Deliver:

- composition root selects the direct brokered gateway for the support cell;
- old queue/worker path is unreachable for that cell;
- telemetry compares terminal and ledger invariants;
- rollback switch retains the old path only until the observation window ends;
- delete or consolidate duplicate lifecycle mutations after rollback expiry.

Proof gate: one runtime path owns each invariant. No per-Operation dual write or
dual execution remains.

## 22. Migration and rollback

Use path-level cutover, not dual execution.

1. Add the new records/fields without changing current traffic.
2. Run contract and adapter tests against existing money/x402 modules.
3. Enable the direct gateway only for the exact support-cell fixture/canary.
4. Verify one origin submission, one supplier settlement, one buyer charge, and
   one terminal invocation per canary.
5. Expand only to explicitly flagged first-slice Operations.
6. Keep the old worker composition selectable as a whole-path rollback for a
   short observation window.
7. Never send one invocation to both paths and never dual-charge or dual-write
   economic truth.
8. After the observation window, remove the old path for the support cell, then
   consolidate parked schema and code in separate changes.

Rollback can stop new direct acquisitions. It cannot erase a
`possibly_submitted` payment attempt; those invocations remain on their
recorded reconciliation path.

## 23. Definition of done

The feature is done only when all are true:

- an authenticated agent invokes one explicitly selected published Operation
  through Agentic Economy;
- the buyer uses an AE prepaid balance and never handles an upstream wallet or
  supplier credential;
- Agentic Economy signs and submits one x402 payment from custody;
- the bound supplier amount, platform fee, buyer total, route, and x402 terms
  cannot drift between inspection and signature;
- the happy path returns contract-valid literal output synchronously;
- buyer accounting and upstream payment are separate, correlated, durable
  records;
- a retry cannot create a second origin request, supplier settlement, or buyer
  charge;
- every post-fence unknown becomes explicit reconciliation with no provider
  replay;
- settled payment with unusable output does not charge the buyer and is visible
  as Agentic Economy loss;
- the brokered x402 call graph contains no provider connection, API key lease,
  queue claim, or general worker runtime;
- the walking skeleton and full failure matrix pass against real persistence;
- search/compare and the caller's harness remain outside the gateway boundary.

## 24. Later feature gates

Only after the definition of done is proven:

1. add a second comparable supplier in the same category;
2. add market allocation evidence, without automatic routing;
3. add one consequential authority class;
4. add one alternative access mode if actual supplier demand requires it;
5. add a second transport or payment scheme behind the same ports;
6. add queued/asynchronous hosting only for Operations that truly need it.

Each addition must preserve the same loop:

```text
capability gap -> search -> compare -> inspect -> explicit selection
-> brokered controlled call -> usable result -> caller continues
```
