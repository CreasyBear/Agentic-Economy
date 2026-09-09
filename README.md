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
[CONTEXT.md](./CONTEXT.md) for familiar product terms, source contracts and
compatibility names, and the [Australian whitepaper](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md)
for the institutional thesis.

## The product loop

```text
find and compare Tools -> Quote and spending checks -> Call
    -> result or pending outcome -> recovery or refund if required
    -> resolved purchase -> agent continues
```

A Quote binds the customer, agent, spending policy, exact Tool version, Provider,
Seller, inputs, price ceiling, terms, data use, effects and retry rule before a
paid Call. Calls with uncertain delivery or payment remain open for recovery;
a successful payment alone does not establish delivery.

For supported resale purchases, AE is the buyer-facing Seller. The Provider
performs the service, and the amount AE owes the Provider is recorded separately
from the customer's charge. AUD customer credit is not a crypto wallet.

One shared account balance can serve several agents under separate hard limits.
Authentication resolves the account. The accepted source machine path is
`registry.tools.search -> tool.quote -> tool.call -> result`.
Status and recovery appear only when needed. Public detail, comparison, whoami
and balance are optional reads. Agents do not coordinate treasury, calculate
foreign exchange, write ledger entries or guess whether payment can be retried.

The source cutover is accepted in the checkout and its focused receipts. That
source evidence does not establish a hosted deployment or installed-package
compatibility; both remain separate release gates.

## Current stage

The implemented foundation includes canonical Tools, comparison, Quotes,
brokered Calls, prepaid buyer credit, Charges, Provider
earnings, refunds, status and recovery.

The complete Australian principal-reseller record is the next product milestone.
Buyer-facing Seller identity, a separate Provider obligation, attributed tax
facts, business-document evidence and purchase resolution are not yet one
explicit production record. Source and tests remain the authority for current
behaviour.

## Current source entrances

- `/market` exposes the public service catalogue and comparison flow.
- `/t/new` provides a thin natural-language entrance to the same market.
- `/api/v1/market-tools/*` exposes canonical Tool discovery and comparison.
- `/api/v1/tools/quote` and `/api/v1/tools/call` define paid or consequential Calls.
- `/api/v1/calls` and `/api/v1/calls/{callRef}/*` define Call history and recovery.
- `/mcp`, `/llms.txt` and `/SKILL.md` are the accepted source discovery/plugin
  surfaces; this does not claim that they are hosted.
- The CLI source supports search, `describe`, `call`, `history`, status, wait,
  cancel and `recover`; installed-package compatibility remains pending.
- `/for-providers` admits and publishes Provider Tools in source.

Chat exposes only search, detail, comparison, description and eligible keyless
execution. Paid or consequential work remains on the authenticated HTTP, MCP
and CLI purchase plane.

The external registry discovers possible supply at metadata authority only. An
imported record is not a Tool and cannot be called until Agentic Economy
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

Package build plans are filed under `docs/designs/`: [Package 4](./docs/designs/package-4-atomic-feature-build-plan.md),
[Package 5](./docs/designs/package-5-atomic-feature-build-plan.md) and
[Package 6](./docs/designs/package-6-atomic-feature-build-plan.md).
The [Package 6 review and companion evidence](docs/archive/README.md#package-6-reviews)
are under `docs/reviews/`; the [Twenty component quality record](./docs/designs/twenty-component-gauntlet.md)
is under `docs/designs/`.

The [manifesto](./docs/strategy/agentic-economy-manifesto.md) and
[investment thesis](./docs/strategy/investment-thesis.md) are supporting strategy.
Browser test profiles live under `tests/config/`; `playwright.config.ts` remains
the default local entry point. Use `npm run test:e2e:authenticated` or
`npm run smoke:chat:staging` for the specialist profiles and their required environments.
E2e/a11y Playwright specs are shell and accessibility checks, not product proof.

<a id="publish-an-x402-tool"></a>

## Publish an x402 Tool

Start at `/for-providers` and follow the source preview and returned status for
the selected endpoint. The earlier standalone onboarding runbook is now
[historical evidence](docs/archive/README.md#onboarding-runbook).

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

`npm run dev:local` is a staged launcher: toolchain → local Convex deployment
→ URL probe → identities → sandbox authority grant → directory scan
→ one sandbox Tool → Vite → `ae doctor`. Each stage stops with the exact fix
on failure. Flags: `--skip-scan`, `--skip-seed`, `--no-doctor`.

To enable explicit test authority, after startup run `npm run ae -- connect
--base-url http://127.0.0.1:3024` to bind the local buyer credential. Then
`npm run ae -- doctor --json` shows three groups: discovery, quoting, purchase.
Purchase will warn until the Account is funded.

Note: `npm run dev` starts Vite only and is not a valid start path.

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
npm run gate
npm run test:chat:conformance
npm run test:cli-package
```

## Machine quickstart

The following documents the accepted source CLI contract. It is not a hosted
deployment, plugin-installation, or installed-package acceptance claim. The
packaged guide remains [packages/cli/README.md](./packages/cli/README.md).

```sh
npm run -s ae -- manifest
npm run -s ae -- search "weather forecast" --limit 5
npm run -s ae -- describe <toolRef>
npm run -s ae -- call <toolRef> --input '{"city":"Perth"}'
```

Against an explicitly verified origin, pass `--base-url "$AE_ORIGIN"` to the
same source commands. Do not treat an origin, archive, `/mcp`, `/llms.txt` or
`/SKILL.md` read as hosted-release proof.

## Project documents

Use [PRODUCT.md](PRODUCT.md) for product direction, [CONTEXT.md](CONTEXT.md) for
language and [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for delivery.
[TODOS.md](TODOS.md) is the concise admin/follow-up queue. Dated studies are in
[research](research/README.md). The [documentation index](docs/README.md) identifies
the retained plans, release records and archive for the next baseline. Completed
Wayfinder/refactor records and earlier planning snapshots have been archived;
they do not define a parallel active roadmap.

Share a Git checkout or an export of a reviewed commit, rather than a copy of the
working directory. Ignored environment files, local databases, credentials and
operator outputs are not part of the repository. Research documents identify
local-only or historical citations explicitly; those records are not prerequisites
for building the source. Public deployment and installed-client acceptance remain
separate from sharing this source.
