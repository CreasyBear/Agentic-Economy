# Managed Call commercial proof

**Status:** maintained acceptance contract · **Reconciled:** 5 October 2026

Prove that an Australian business can fund AUD credit, buy an admitted x402 Tool,
and receive its result and complete commercial record without operating a crypto
wallet. [PRODUCT.md](PRODUCT.md) defines the product; the [roadmap](IMPLEMENTATION_ROADMAP.md)
places this proof inside Package 4.

## What is proved and what remains

The [readiness record](docs/production-readiness-plan.md) records 20 production
mainnet payments through the authenticated CLI, exact reconciliation and bounded
recovery evidence. This establishes the paid execution foundation. It does not
complete every requirement below: the full principal-reseller record, the
separate paid development chat journey and open-beta qualification remain open.
Current release provenance and payment audience belong in the
[deployment map](docs/operations/deployments.md); next actions belong in
[TODOS.md](TODOS.md).

The earlier [start-line plan](docs/archive/2026-10-05/root/START_LINE.md) preserves
its original approval questions, campaign limits and sequencing. Those dated
limits are historical evidence, not a fresh spending authorization. Current
versioned policy and an explicit approved scope govern consequential actions.

## Proof contract

The start line passes when one Australian business can complete this sequence:

1. Request a typed quote for an AUD credit amount and see the credit, separately
   disclosed service fee and total payable before authorisation.
2. Complete one supported funding flow. Confirmed settlement creates exactly the
   requested AUD credit once; the service fee never reduces the credit balance.
3. Authenticate with a replaceable credential. Agentic Economy resolves the
   Customer, Account, Agent, spending policy, permitted shared balance and Agent
   limits without accepting an `accountRef`, wallet
   or customer-selected payment address. Standalone `whoami` and balance reads
   remain optional diagnostics rather than Call prerequisites.
4. Search one admitted x402 Tool through a compact, versioned response of
   one to three candidates. Search repeats no full input schema, navigation set
   or caller-specific money state. Public detail and comparison remain optional
   reads. Public discovery spends no customer money and triggers no Provider
   work.
5. Use `tool.quote` as the one caller-specific detail and viability read.
   Create an expiring Quote for the exact Tool version, normalised
   literal input and caller constraints. Receive and validate the current x402
   challenge; reject
   unsupported asset, network, recipient or amount; calculate one all-in AUD
   Call price from executable exchange-rate evidence and versioned pricing; and
   show required input, effects, data use, Provider, Seller, evidence,
   unknowns, expiry, balance after and Agent budget after. Bind the
   Quote and challenge digest to the Quote.
6. Call that `quoteRef` once through `tool.call` with a caller-supplied
   idempotency key. Revalidate Tool version, input digest, challenge, authority, Agent
   budget, Customer-wide exposure, shared Account funds and pricing
   at the consequence boundary. Material drift refuses before any reservation,
   signature or Provider effect and returns an executable safe continuation.
7. Atomically move the exact quoted amount from available to reserved AUD credit
   and reserve the Agent's budget and Customer-wide exposure before
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
11. Return literal output or one durable Call state. A non-terminal
    response contains at most one executable machine continuation and one
    optional owner handoff. Status, cancel and reconcile appear only where the
    current state permits them; possible dispatch never exposes a fresh
    `tool.call` as a blind retry. Version-aware status returns a bounded unchanged
    response or current delta with the recommended next observation time, so a
    fresh process can
    continue without conversation history or repeated full history.
12. Show the same Call in Logs, Usage and Spend with Tool, Provider,
    timestamps, status, consumed units, exact AUD charge, upstream settlement
    state, acting Agent, spending-policy use and recoverable exception where
    relevant. The Agent can see its own permitted history; the Customer can see
    the whole Account and spend by Agent.
13. Produce invoice-ready period detail that includes each captured Call and
    adjustment once, sums exact sub-cent amounts before document rounding, and
    retains the applicable pricing, tax and rounding policy references.
14. Replay every funding, Call, settlement, recovery and projection command
    without creating a second credit, reservation, x402 payment, charge,
    adjustment or invoice line.

The Package 4 machine contract has one response shape per action. It does not
add a universal envelope, selectable detail levels or arbitrary field groups.
Excluding literal Tool output and the generated action manifest, the proof
budgets are:

| Response | Maximum serialized JSON |
| --- | ---: |
| Search with three candidates | 3 KB |
| Successful or blocked Quote | 4 KB |
| Unchanged status poll | 512 bytes |
| Refusal or uncertain result | 1 KB |

The start line includes four agent-journey proofs:

1. **Cheapest successful Call:** `search -> tool.quote ->
   tool.call -> result`; no mandatory self, balance, public-detail or
   comparison call.
2. **Insufficient balance or authority:** `tool.quote` returns no Quote, the
   exact bounded reason and one safe continuation or owner handoff; no treasury
   or x402 internals leak into the response.
3. **Terms drift before effect:** `tool.call` refuses before reservation, signing
   or Provider effect and binds the next Quote so the caller need not resend
   full normalised input.
4. **Unknown after submission:** the Call reference remains stable;
   version-aware status and reconcile are the only machine continuations, and a
   fresh `tool.call` is absent.

The proof does not pass if support must reconcile the Call from unrelated
screens, if an external timeout can pay twice, if a displayed balance cannot be
rebuilt from postings, if credential rotation resets an Agent's
limits, if the agent must coordinate money or treasury subsystems, or if AUD and
USDC are netted into one monetary leg.

## Commercial and operating boundaries

The Customer owns the objective and delegates authority. The Agent acts through
an Account and spending policy. The Provider performs the Tool. For supported
principal-reseller purchases, AE is the buyer-facing Seller; payee identity and
the separate Provider obligation must not be inferred from a wallet or receipt.

Keep available and reserved AUD credit distinct from corporate USDC cash,
commitments and settlement. Customer credit carries no cash-out, transfer,
yield or crypto entitlement. Supported remedies and refunds do not create a
general withdrawal facility. Every paid Call is funded before execution.

Uncertainty retains the original Call and financial references until evidence
supports capture, release or remedy. A new request is never a blind recovery
retry. Credential rotation cannot reset Agent limits.

The complete record must attribute Seller, Provider obligation, tax facts,
business-document evidence and purchase resolution to the same purchase while
preserving their distinct states. Legal, tax, banking and processor approval
must identify scope, approver, conditions and effective date. Alpha exceptions
are explicit; source behavior does not supply approval.

## Deferred scope

Automated treasury acquisition/trading, premature sharding, customer crypto,
postpaid credit, general tax or Peppol infrastructure, external acquisition
reconstruction and new payment rails remain outside this first proof. The
prospective Provider-as-Seller fiat lane has its own qualification in the
[roadmap](IMPLEMENTATION_ROADMAP.md#provider-created-service-supply-and-fiat-purchasing--prospective-extension).
