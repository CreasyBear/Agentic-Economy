# Agentic Economy

Agentic Economy helps Australian businesses connect their agents to paid tools
and services through one account, with AUD credit, spending controls, clear usage
and billing records, and recovery when something goes wrong. x402 services are
the first supported supply.

**The current goal is a mature Australian equivalent of the familiar Locus and
Nevermined experience, not a unique or differentiated product yet.** Follow proven
setup, account management, publishing, payment and developer patterns. Adapt
where Australia or a concrete correctness requirement calls for it.

An agent stays in its existing app or framework. It finds a service when needed,
checks the price and terms, and makes a Call within its spending policy. AE does
not own the agent's larger project, planning, memory or orchestration.

Read [PRODUCT.md](./PRODUCT.md) for the active direction,
[CONTEXT.md](./CONTEXT.md) for familiar product terms and their existing code/API
names, and the [Australian whitepaper](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md)
for the institutional thesis.

## The product loop

```text
find and compare services -> quote and spending checks -> Call
    -> result or pending outcome -> recovery or refund if required
    -> resolved purchase -> agent continues
```

A quote binds the customer, agent, spending policy, exact service, Provider,
Seller, inputs, price ceiling, terms, data use, effects and retry rule before a
paid Call. Calls with uncertain delivery or payment remain open for recovery;
a successful payment alone does not establish delivery.

For supported resale purchases, AE is the buyer-facing Seller. The Provider
performs the service, and the amount AE owes the Provider is recorded separately
from the customer's charge. AUD customer credit is not a crypto wallet.

One shared account balance can serve several agents under separate hard limits.
Authentication resolves the account. The supported machine path remains
`registry.operations.search -> operation.inspect -> operation.invoke -> result`.
Status and recovery appear only when needed. Public detail, comparison, whoami
and balance are optional reads. Agents do not coordinate treasury, calculate
foreign exchange, write ledger entries or guess whether payment can be retried.

## Current stage

The implemented foundation includes canonical services, comparison,
quotes, brokered Calls, prepaid buyer credit, Charges, Provider
earnings, refunds, status and recovery.

The complete Australian principal-reseller record is the next product milestone.
Buyer-facing Seller identity, a separate Provider obligation, attributed tax
facts, business-document evidence and purchase resolution are not yet one
explicit production record. Source and tests remain the authority for current
behaviour.

## Current product entrances

- `/market` exposes the public service catalogue and comparison flow.
- `/t/new` provides a thin natural-language entrance to the same market.
- `/api/v1/market-operations/*` exposes canonical discovery and inspection.
- `/api/v1/operations/call` accepts paid or consequential Calls.
- `/mcp`, `/llms.txt` and `/SKILL.md` support machine discovery.
- `@agentic-economy/cli` supports search, inspection, Calls, status and
  recovery.
- `/for-providers` admits and publishes Provider services.

Chat exposes only search, detail, comparison, inspection and eligible keyless
execution. Paid or consequential work remains on the authenticated HTTP, MCP
and CLI purchase plane.

The external registry discovers possible supply at metadata authority only. An
imported record is not a service and cannot be invoked until Agentic Economy
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

<a id="publish-an-x402-operation"></a>

## Publish an x402 service

Use the [x402 Provider onboarding guide](./X402_SELLER_ONBOARDING.md) to admit a
hosted x402 service. The guide covers an unpaid protocol inspection, Provider
ownership proof, service staging, one explicitly authorised Base Sepolia
canary and reconciliation without duplicate payment.

An x402 payee is a payment recipient. The wallet address does not, by itself,
establish the commercial Seller or Provider.

## Run locally

Use Node.js 22 and npm 11.5.1.

```sh
nvm install
nvm use
npm install --global npm@11.5.1 --ignore-scripts
npm ci
npm run dev:local
```

`.nvmrc`, `package.json` and `convex.json` select Node 22; CI uses the same
Node major and npm version. With NVM's project auto-switching enabled, entering
this checkout selects Node 22 without changing other projects' defaults.
For an agent shell that does not load NVM, use its supplied runner from the
project directory: `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen`.
Restart existing terminals or select Node 22 explicitly after changing shell setup.

Open `http://127.0.0.1:3024/market` for the catalogue or
`http://127.0.0.1:3024/t/new` for chat.

## Stripe production setup

Use one Stripe live-mode account for credit purchases and Provider payouts. Set
`STRIPE_SECRET_KEY`, `STRIPE_READBACK_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_V2_WEBHOOK_SECRET`, and `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`.
The API keys must be restricted and the Tax Rate must be active,
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
ae describe <operationRef> --base-url "$AE_ORIGIN"
ae call <operationRef> --input '{"city":"Perth"}' --base-url "$AE_ORIGIN"
```
