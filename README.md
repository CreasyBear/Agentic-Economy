# Agentic Economy

**Revised:** 2026-10-05

Agentic Economy helps Australian businesses connect their agents to paid tools
and services through one account, with AUD credit, spending controls, clear usage
and billing records, and recovery when something goes wrong. x402 services are
the first supported supply.

An agent stays in its existing app or framework. It finds a service when needed,
checks the price and terms, and makes a Call within its spending policy. AE does
not own the agent's larger project, planning, memory or orchestration.

Read [PRODUCT.md](./PRODUCT.md) for the active direction,
[CONTEXT.md](./CONTEXT.md) for familiar product terms, source contracts and
compatibility names, and the [Australian whitepaper](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md)
for the institutional thesis. New to the vocabulary? Start with the
[glossary](./docs/glossary.md). Use the [documentation index](./docs/README.md)
for current work, maintained contracts, operations and historical evidence.

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

The production application and backend are deployed. The authenticated CLI has
completed the recorded 20-payment mainnet acceptance. Public npm publication and
the separate paid development chat journey remain open; see the deployment map.

## Current stage

For current application hosts, staging, retired test projects and remaining
production blockers, use the [deployment map](./docs/operations/deployments.md).
The production execution queue is [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256).

The implemented foundation includes canonical Tools, comparison, Quotes,
brokered Calls, prepaid buyer credit, Charges, Provider
earnings, refunds, status and recovery.

Owner reporting includes scoped Call totals, monthly Agent usage and charge
coverage, sortable history and exports. Receipts include generation of approved
funding tax invoices and linked full-refund adjustment notes, with immutable
HTML/print and CSV records. Treasury shows the six commercial approval families
and proposed defaults through its existing protected review flow. The
[readiness record](./docs/production-readiness-plan.md) distinguishes verified
production payments and recovery from controlled failure fixtures and remaining
availability limits. Screening is explicitly deferred under the approved alpha policy.

The complete Australian principal-reseller record is the next product milestone.
Buyer-facing Seller identity, a separate Provider obligation, attributed tax
facts, business-document evidence and purchase resolution are not yet one
explicit production record. Source and tests remain the authority for current
behaviour.

Usage metering and the founder console now share the main delivery stream.
Historical backfill, automatic reporting schedules and external metering remain
explicit opt-in operations; implementation does not activate them.

## Current source entrances

- `/market` exposes the public service catalogue and comparison flow.
- `/t/new` provides a thin natural-language entrance to the same market.
- `/api/v1/market-tools/*` exposes canonical Tool discovery and comparison.
- `/api/v1/tools/quote` and `/api/v1/tools/call` define paid or consequential Calls.
- `/api/v1/calls` and `/api/v1/calls/{callRef}/*` define Call history and recovery.
- `/mcp`, `/llms.txt` and `/SKILL.md` are the accepted source discovery/plugin
  surfaces. The deployment map identifies their current hosted release.
- The CLI source supports search, `describe`, `call`, `history`, status, wait,
  cancel and `recover`. The npm package is `@agentic-economy/cli`, with `ae` as
  its command. See [CLI installation](./packages/cli/README.md) for versioned
  npm installation and verified signed archives; a registry 404 means the
  selected npm version has not been published yet.
- `/for-providers` admits and publishes Provider Tools in source.

Chat is a thin entrance to the same Tool market and controlled purchase plane.
The recorded paid production acceptance used the CLI; paid chat completion is a
separate journey and remains unverified.

The external registry discovers possible supply at metadata authority only. An
imported record is not a Tool and cannot be called until Agentic Economy
admits and publishes it.

## Documentation authority

- [PRODUCT.md](./PRODUCT.md) defines the active product and commercial direction.
- [AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md)
  explains why the institution should exist.
- [CONTEXT.md](./CONTEXT.md) defines the shared language.
- [START_LINE.md](./START_LINE.md) defines the complete managed-Call commercial proof.
- [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) defines the delivery
  sequence to the mature platform.
- [Agent operating contract](./docs/designs/agent-operating-contract.md) defines
  the coherent machine-facing control loop.
- [DESIGN.md](./DESIGN.md) defines how the product communicates those facts.
- Current source and tests define what is implemented.

Dated research, comparison papers, gauntlets and working ledgers inform the
product but do not override these documents.


The [manifesto](./docs/strategy/agentic-economy-manifesto.md) and
[investment thesis](./docs/strategy/investment-thesis.md) are supporting strategy.
Browser test profiles live under `tests/config/`; `playwright.config.ts` remains
the default local entry point. Use `npm run test:e2e:authenticated` or
`npm run smoke:chat:staging` for the specialist profiles and their required environments.
E2e/a11y Playwright specs are shell and accessibility checks, not product proof.

<a id="publish-an-x402-tool"></a>

## Publish an x402 Tool

Start at `/for-providers` and follow the source preview and returned status for
the selected endpoint.

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

`npm run dev:local` starts the local Convex deployment, verifies its URL, and
starts Vite with real Clerk identity. It explicitly sets
`AE_DEPLOYMENT_ENVIRONMENT=development` in both runtimes. Hosted Vercel and
Convex deployments must each declare the same `development` or `production`
value; missing or mismatched declarations refuse new money operations.
Once Vite is ready, it independently
starts optional owner-authority seeding, directory scan kickoff (unless a
complete catalogue generation exists), sandbox Tool publication, and FX refresh;
failure of one optional stage does not stop the app. `ae doctor` reports
diagnostics without stopping the stack. Use `--no-doctor` to omit it.
It mounts the real `ClerkProvider`, so `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
and `AE_E2E_OWNER_EMAIL` must be present. A large local database slows the backend's
start; `CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS` (default 300) bounds the wait.

To bind a buyer credential, after startup run `npm run connect:local --
--base-url http://127.0.0.1:3024`. It runs `ae connect` and prints the approval
URL and user code; approve in the browser as the owner. Consent approval requires
Clerk's strict reverification, so there is no headless approval path anywhere.
Use `--provider` to bind a provider credential the same way.

In each Clerk instance, add
`{"reverification_id":"{{session.reverification_id}}"}` to the customized
**session token** claims, following [Clerk's action correlation guide](https://clerk.com/docs/guides/secure/reverification#correlate-a-reverification-with-a-specific-action).
Operator commands, spending-limit increases, workspace closure/ownership transfer
and owner-chat approvals require fresh verification of both factors. The web
server signs the verified session evidence for Convex; adding `fva` to a Convex
JWT template cannot establish this check. Spending reductions need no MFA prompt.

For a **Clerk development instance only**, use a dedicated test owner for
inbox-free local consent: create a Clerk user with an address such as
`owner+clerk_test@example.com`, set `AE_E2E_OWNER_EMAIL` to that same address
before starting `dev:local` (so the seeded Convex owner matches), and sign in
as that user. In Clerk's development test mode, request the email verification
code normally and enter `424242`; no test email is delivered. If strict
reverification requests a **second factor**, enroll SMS MFA on the test owner
using a fictional test number such as `+12015550100`; request its SMS code and
enter `424242`, or enroll TOTP and use the authenticator's current code.
Complete the browser reverification prompt on the consent page, then approve.
The email test code alone is **not** an MFA bypass and a real owner's email
cannot use it. Keep production MFA and the server's strict proof check enabled.
See [Clerk test emails and phones](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)
and [Clerk MFA](https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication).

Then `npm run ae -- doctor --json --base-url http://127.0.0.1:3024` shows three groups:
discovery, quoting, purchase. On a loopback origin the doctor reports quoting `skipped`: the seeded sandbox Tool is only listed where the readiness probe can reach it, which is a public HTTPS origin (a preview or hosted deployment). Locally you can prove Discover, connect and the funding diagnostics; Quote and Call are proven on a hosted origin with credentials (tier 1).

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

When running locally, include `--base-url http://127.0.0.1:3024` with each command; without it, the CLI defaults to the hosted AE origin.

```sh
npm run -s ae -- manifest --base-url http://127.0.0.1:3024
npm run -s ae -- search "weather forecast" --limit 5 --base-url http://127.0.0.1:3024
npm run -s ae -- describe <toolRef> --base-url http://127.0.0.1:3024
npm run -s ae -- call <toolRef> --input '{"city":"Perth"}' --base-url http://127.0.0.1:3024
```

Against a different explicitly verified origin, pass `--base-url "$AE_ORIGIN"` instead.
Do not treat an origin, archive, `/mcp`, `/llms.txt` or `/SKILL.md` read as hosted-release proof.

## Project documents

Use [PRODUCT.md](./PRODUCT.md) for product direction, [CONTEXT.md](./CONTEXT.md) for
language and [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) for delivery.
[TODOS.md](TODOS.md) is the concise admin/follow-up queue. Dated studies are in
[research](research/README.md). The [documentation index](docs/README.md) lists
the retained records. Earlier planning snapshots do not define a parallel
active roadmap.

Share a Git checkout or an export of a reviewed commit, rather than a copy of the
working directory. Ignored environment files, local databases, credentials and
operator outputs are not part of the repository. Research documents identify
local-only or historical citations explicitly; those records are not prerequisites
for building the source. Public deployment and installed-client acceptance remain
separate from sharing this source.
