# Managed x402 Call start line

**Status:** active product milestone

**Revised:** 2026-09-02

**Purpose:** prove that an Australian business can fund an AUD prepaid balance,
buy one x402 service through Agentic Economy and receive both the result and a
complete Call record without operating a crypto wallet

## Decision

Agentic Economy will enter as the managed commercial and payment boundary for
one admitted x402 Operation.

The Business Principal funds an AUD prepaid balance. Agentic Economy is the
buyer-facing Seller, invokes the Operation and settles its separate upstream
obligation from a pooled corporate USDC treasury. The customer does not acquire
USD, USDC, a wallet, an address or a right to direct the upstream transfer.

Every paid Call is funded before execution. An x402 payment challenge is the
last pricing input: Agentic Economy validates it, locks one all-in AUD quote,
reserves that amount, pays the Provider from corporate USDC and then captures,
releases or retains the reservation according to the observed outcome.

The product presents the result through familiar Logs, Usage and Spend views.
Internally, one Invocation remains the stable identity for the Call. Attempts,
AUD postings, x402 settlement evidence, delivery, recovery and invoice lines
remain separate records linked to that Invocation.

This start line changes the implementation sequence, not the whitepaper's
institutional thesis. Reconstructing purchases made outside Agentic Economy
remains a later evidence adapter. It is not the first release gate.

## Proof contract

The start line passes when one Australian business can complete this sequence:

1. Request a typed quote for an AUD credit amount and see the credit, separately
   disclosed service fee and total payable before authorisation.
2. Complete one supported funding flow. Confirmed settlement creates exactly the
   requested AUD credit once; the service fee never reduces the credit balance.
3. Authenticate with a replaceable credential. Agentic Economy resolves the
   Business Principal, Account, Agent Principal, Mandate, permitted shared
   balance and Agent Principal limits without accepting an `accountRef`, wallet
   or customer-selected payment address. Standalone `whoami` and balance reads
   remain optional diagnostics rather than Call prerequisites.
4. Search one admitted x402 Operation through a compact, versioned response of
   one to three candidates. Search repeats no full input schema, navigation set
   or caller-specific money state. Public detail and comparison remain optional
   reads. Public discovery spends no customer money and triggers no Provider
   work.
5. Use `operation.inspect` as the one caller-specific detail and viability read.
   Create an expiring Commitment for the exact Operation revision, normalised
   literal input and caller constraints. Receive and validate the current x402
   challenge; reject
   unsupported asset, network, recipient or amount; calculate one all-in AUD
   Call price from executable exchange-rate evidence and versioned pricing; and
   show required input, effects, data use, Provider, Seller, evidence,
   unknowns, expiry, balance after and Agent Principal budget after. Bind the
   quote and challenge digest to the Commitment.
6. Invoke that `commitmentRef` once with a caller-supplied idempotency key.
   Revalidate Operation revision, input digest, challenge, authority, Agent
   Principal budget, principal-wide exposure, shared Account funds and pricing
   at the consequence boundary. Material drift refuses before any reservation,
   signature or Provider effect and returns an executable safe continuation.
7. Atomically move the exact quoted amount from available to reserved AUD credit
   and reserve the Agent Principal's budget and principal-wide exposure before
   signing or dispatching the paid request. Concurrent Calls and concurrent
   credentials cannot spend the same capacity.
8. Confirm that the selected corporate custody pool has fresh, sufficient USDC
   capacity before payment. Treasury insufficiency leaves customer credit
   available, releases any authority reservation and produces no payment
   signature. The agent sees only readiness and the safe next action, not
   treasury internals.
9. Execute the paid retry using the maintained official x402 packages and a
   corporate custody integration. Customer credentials never expose wallet
   material.
10. On a known successful delivery, capture the authorised AUD Charge and attach
   the separate USDC settlement evidence. On a known pre-submission failure,
   release it. When submission, settlement or delivery is uncertain, retain the
   reservation for explicit reconciliation rather than retrying blindly.
11. Return literal output or one durable Invocation state. A non-terminal
    response contains at most one executable machine continuation and one
    optional owner handoff. Status, cancel and reconcile appear only where the
    current state permits them; possible dispatch never exposes invoke as a
    retry. Version-aware status returns a bounded unchanged response or current
    delta with the recommended next observation time, so a fresh process can
    continue without conversation history or repeated full history.
12. Show the same Call in Logs, Usage and Spend with Operation, Provider,
    timestamps, status, consumed units, exact AUD charge, upstream settlement
    state, acting Agent Principal, Mandate use and recoverable exception where
    relevant. The agent can see its own permitted history; the Business
    Principal can see the whole Account and spend by Agent Principal.
13. Produce invoice-ready period detail that includes each captured Call and
    adjustment once, sums exact sub-cent amounts before document rounding, and
    retains the applicable pricing, tax and rounding policy references.
14. Replay every funding, Call, settlement, recovery and projection command
    without creating a second credit, reservation, x402 payment, charge,
    adjustment or invoice line.

The Package 4 machine contract has one response shape per action. It does not
add a universal envelope, selectable detail levels or arbitrary field groups.
Excluding literal Operation output and the generated action manifest, the proof
budgets are:

| Response | Maximum serialized JSON |
| --- | ---: |
| Search with three candidates | 3 KB |
| Successful or blocked inspection | 4 KB |
| Unchanged status poll | 512 bytes |
| Refusal or uncertain result | 1 KB |

The start line includes four agent-journey proofs:

1. **Cheapest successful Call:** `search -> operation.inspect ->
   operation.invoke -> result`; no mandatory self, balance, public-detail or
   comparison call.
2. **Insufficient balance or authority:** inspection returns no Commitment, the
   exact bounded reason and one safe continuation or owner handoff; no treasury
   or x402 internals leak into the response.
3. **Terms drift before effect:** invoke refuses before reservation, signing or
   Provider effect and binds the next inspection to the prior Commitment so the
   caller need not resend full normalised input.
4. **Unknown after submission:** the Invocation reference remains stable;
   version-aware status and reconcile are the only machine continuations, and a
   fresh invoke is absent.

The proof does not pass if support must reconcile the Call from unrelated
screens, if an external timeout can pay twice, if a displayed balance cannot be
rebuilt from postings, if credential rotation resets an Agent Principal's
limits, if the agent must coordinate money or treasury subsystems, or if AUD and
USDC are netted into one monetary leg.

## Australian production boundary

The complete flow may be built and exercised with sandbox funding and one
controlled x402 testnet transaction. Production funding and production USDC
settlement remain disabled until named Australian advisers approve:

- the AFSL/non-cash-payment and purchased-payment-facility position;
- the AML/CTF stored-value, remittance and virtual-asset position;
- GST timing, tax-invoice, adjustment and service-fee treatment; and
- the operating-account, safeguarding or client-money treatment.

Production policy is immutable and versioned. Funding, reservation and treasury
decisions record the policy version that admitted them. Balance and aggregate
limits remain configurable controls backed by a cited policy; they are not
presented as automatic legal safe harbours.

The working product boundary remains:

- Australian business customers only;
- Agentic Economy is the sole buyer-facing Seller and payee;
- credit pays only Agentic Economy for admitted Operations;
- no customer cash-out, transfer, assignment, yield or crypto entitlement;
- no postpaid or negative-balance Calls;
- Agentic Economy owns and controls the pooled upstream USDC treasury; and
- customer refunds and remedies remain available where contract or law
  requires them, without creating a general withdrawal facility.

The detailed perimeter and unresolved advice questions are recorded in
[Package 4: Australian prepaid balance and settlement perimeter](./research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md).

## In scope now

- One Australian Business Principal and Account with a shared AUD balance, one
  durable Agent Principal, replaceable credentials and hard per-Agent limits.
- One supported AUD funding method and one separately disclosed top-up service
  fee policy.
- One AUD prepaid balance with available and reserved positions.
- One admitted x402 Operation and one managed corporate USDC custody pool.
- One all-in AUD quote, one controlled paid Call and explicit success, release
  and unknown-outcome recovery paths.
- One customer Calls surface with Logs, Usage and Spend views.
- One compact, versioned agent contract across self-inspection, balance,
  Operation inspection, invoke, status, cancel, reconcile and bounded outcome
  reporting, with executable safe continuations.
- One invoice-ready period projection and reconciliation view.
- Deterministic tests for all money paths plus one external x402 testnet canary.
- Operator-approved USDC replenishment with automated coverage monitoring,
  reconciliation, warnings and Call admission.

## Deferred from the start-line release

- Automated AUD-to-USDC acquisition or treasury trading.
- Sharded treasury spending pools before measured contention requires them.
- Customer crypto wallets, token balances, withdrawal, transfer or redemption.
- Postpaid credit, loans or unfunded Calls.
- Production Peppol delivery or a general tax engine.
- External OTLP, CloudEvents, invoice, card and bank acquisition reconstruction.
- General marketplace brokerage where Agentic Economy is not the stated Seller.
- Multi-asset customer balances and general payment-network acceptance.

These are not removed from the mature roadmap. They are sequenced after the
managed Call proves the commercial and financial spine.

## Relationship to the product

[PRODUCT.md](./PRODUCT.md) defines the product. This document defines the first
commercial proof. The
[whitepaper](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md) explains why just-in-time
service procurement requires commercial closure and why Australia is the first
worked institutional environment.

The first release deliberately begins in the Resell mode for one narrow class of
admitted x402 Operations. Observe, Control, Broker and Resell remain progressive
responsibility modes across the mature platform; they are not a mandatory
chronological funnel for every implementation.
