# Agentic Economy

Agentic Economy is the market and commercial boundary for just-in-time service
procurement by software agents.

An agent can encounter a capability gap after work has begun, compare outside
Providers and buy one bounded contribution without moving the larger project
into another platform. For supported purchases, Agentic Economy is the fixed
buyer-facing Seller. It preserves the authority, exact service, buyer
consideration, Provider obligation, delivery evidence and remedy needed to make
the event explainable to the business behind the agent.

The market unit is the **Operation**: one versioned, callable contribution with
fixed inputs, price, terms, effects, readiness and evidence.

Read the [product charter](./PRODUCT.md) for the active product and
[the Australian whitepaper](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md) for the
institutional argument.

## The product loop

```text
capability gap
    -> resolution
    -> commitment
    -> invocation
    -> delivery or uncertainty
    -> remedy if required
    -> commercial closure
    -> outcome evidence
    -> agent continues
```

The Commitment binds the Business Principal, acting Agent Principal, delegated
authority, exact Operation, Provider, Seller, price ceiling, terms, data use,
effects and retry rule before anything consequential happens.

Commercial closure is the terminal explainable state of the purchase. Delivered,
failed, adjusted and refunded purchases may be closed. An uncertain purchase
remains open until its delivery, settlement or external effect can be reconciled.

Agentic Economy does not own the agent's project, planning, memory, harness or
general orchestration. It owns the admitted market boundary and the bounded
purchase record.

For the managed x402 lane, one shared AUD Account balance may serve several
durable Agent Principals under separate hard limits. Authentication resolves
the Account. The recommended machine path is `search -> operation.inspect ->
operation.invoke -> result`; status or reconcile appears only when required.
Public detail, comparison, whoami and balance remain optional reads. The agent
never supplies a wallet or Account reference, coordinates treasury, calculates
FX, writes ledger entries or guesses whether an uncertain payment is safe to
retry.

## Current stage

The implemented foundation includes canonical Operations, comparison,
Commitment, brokered Invocation, prepaid buyer credit, Charges, Provider
earnings, refunds, status and recovery.

The complete Australian principal-reseller record is the next product milestone.
Buyer-facing Seller identity, a separate Provider obligation, attributed tax
facts, business-document evidence and commercial closure are not yet one
explicit production record. Source and tests remain the authority for current
behaviour.

## Current product entrances

- `/market` exposes the public Operation catalogue and comparison flow.
- `/t/new` provides a thin natural-language entrance to the same market.
- `/api/v1/market-operations/*` exposes canonical discovery and inspection.
- `/api/v1/operations/call` accepts consequential Invocation.
- `/mcp`, `/llms.txt` and `/SKILL.md` support machine discovery.
- `@agentic-economy/cli` supports search, inspection, Invocation, status and
  recovery.
- `/for-providers` admits and publishes Provider Operations.

Chat exposes only search, detail, comparison, inspection and eligible keyless
execution. Paid or consequential work remains on the authenticated HTTP, MCP
and CLI purchase plane.

The external registry discovers possible supply at metadata authority only. An
imported record is not an Operation and cannot be invoked until Agentic Economy
admits and publishes it.

## Documentation authority

- [PRODUCT.md](./PRODUCT.md) defines the active product and commercial direction.
- [AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md)
  explains why the institution should exist.
- [CONTEXT.md](./CONTEXT.md) defines the shared language.
- [START_LINE.md](./START_LINE.md) defines the next proof.
- [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) defines the delivery
  sequence to the mature platform.
- [Agent operating contract](./docs/designs/agent-operating-contract.md) defines
  the coherent machine-facing control loop.
- [DESIGN.md](./DESIGN.md) defines how the product communicates those facts.
- Current source and tests define what is implemented.

Dated research, comparison papers, gauntlets and working ledgers inform the
product but do not override these documents.

## Publish an x402 Operation

Use the [x402 Provider onboarding guide](./X402_SELLER_ONBOARDING.md) to admit a
hosted x402 service. The guide covers an unpaid protocol inspection, Provider
ownership proof, Operation staging, one explicitly authorised Base Sepolia
canary and reconciliation without duplicate payment.

An x402 payee is a payment recipient. The wallet address does not, by itself,
establish the commercial Seller or Provider.

## Run locally

Use Node.js 22 and npm 11.5.1.

```sh
npm ci
npm run dev:local
```

Open `http://127.0.0.1:3024/market` for the catalogue or
`http://127.0.0.1:3024/t/new` for chat.

## Stripe production setup

Use one Stripe live-mode account for credit purchases and Provider payouts. Set
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`. The Tax Rate must be active,
inclusive, Australian, and exactly 10%; AE verifies that evidence before
returning a hosted Checkout link. Production readiness rejects test-mode or
malformed values.

Register this event destination:

```text
https://<your-agentic-economy-deployment>/api/stripe/webhook
```

Subscribe it to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`account.updated` and the `v2.core.account.*` lifecycle and
recipient-capability events emitted by the Connect setup. The endpoint verifies
Stripe's signature over the raw body and applies events idempotently. Do not put
secret or webhook keys in browser configuration.

Useful checks:

```sh
npm run test:chat:conformance
npm run parity:check
npm run test:cli-package
npm run test:release:source
```

## Machine quickstart

Install the pinned CLI archive served by the deployment. Replace the MCP agent
placeholder with one current harness: `codex`, `claude-code` or `cursor`.

```sh
export AE_ORIGIN="https://<your-agentic-economy-deployment>"
npm install --global "$AE_ORIGIN/downloads/agentic-economy-cli-0.1.0.tgz"
ae --version
ae search "weather forecast" --base-url "$AE_ORIGIN" --limit 5
npx --yes add-mcp@2.3.0 "$AE_ORIGIN/mcp" --name agentic-economy --transport http --global --agent "<codex|claude-code|cursor>" --yes
ae doctor --base-url "$AE_ORIGIN" --json
ae inspect <operationRef> --base-url "$AE_ORIGIN"
ae call <operationRef> --input '{"city":"Perth"}' --base-url "$AE_ORIGIN"
```
