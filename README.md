# Agentic Economy

Agentic Economy is a marketplace where agents working for people and companies
find, compare, and buy services from businesses and other agents.

The active product is an **Operation market**. An Operation is one exact,
callable contribution an outside supplier can provide when an agent reaches the
edge of its current capabilities.

## The product loop

1. An agent encounters a capability gap while pursuing its own project.
2. It searches Agentic Economy for relevant Operations.
3. It compares suppliers and inspects exact inputs, price, readiness, and terms.
4. It invokes one Operation within delegated authority.
5. It consumes the result and continues its own work.

Agentic Economy does not own the agent's project, planning, memory, harness, or
orchestration. It owns the market boundary: discovery, selection, controlled
invocation, payment where required, and evidence about the returned unit.

## Current surfaces

- `/market` — public Operation catalogue.
- `/t/new` — thin natural-language adapter over the same market.
- `/api/v1/market-operations/*` — canonical Operation discovery and inspection.
- `/api/v1/operations/call` — consequential invocation entry.
- `/mcp`, `/llms.txt`, and `/SKILL.md` — machine discovery.
- `@agentic-economy/cli` — search, private missing-job requests, inspect, call,
  status, and recovery.
- `/for-providers` — supplier publication.

Chat exposes only search, detail, compare, inspect-plan, and eligible keyless
execution. Paid or consequential work remains on the authenticated API, MCP,
and CLI invocation plane.

The broad external registry is lower-authority supply discovery. An imported
listing is not an Operation and cannot be invoked until it passes admission and
is published into the canonical market.

## Project authority

Read [PRODUCT.md](./PRODUCT.md) before making product decisions. Research does
not override the current charter.

Historical planning ledgers, migration gates, parity notes, generated codebase
maps, and diagrams have been removed from active project context. Git history
records them but does not define the product.

## x402 seller onboarding

Use the [x402 seller onboarding guide](./X402_SELLER_ONBOARDING.md)
to take a hosted seller through an unpaid protocol probe, ownership proof,
Operation staging, one explicitly authorized Base Sepolia canary, and
reconciliation without duplicate payment. The runbook documents the reference
seller, exact commands, terminal states, hosted-readiness requirements, and the
evidence ceiling from the first live gauntlet.

## Run locally

Use Node.js 22 and npm 11.5.1.

```sh
npm ci
npm run dev:local
```

Open `http://127.0.0.1:3024/market` for the catalogue or
`http://127.0.0.1:3024/t/new` for chat.

## Stripe production setup

Use one Stripe live-mode account for credit purchases and supplier payouts.
Set `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, and
`STRIPE_WEBHOOK_SECRET`; production readiness rejects test-mode or malformed
values. Register this event destination:

```text
https://<your-agentic-economy-deployment>/api/stripe/webhook
```

Subscribe it to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, and the
account events emitted by your Connect setup: `account.updated` and the
`v2.core.account.*` lifecycle and recipient-capability events. The endpoint
verifies Stripe's signature over the raw body and applies events idempotently.
Do not place secret or webhook keys in browser configuration.

Useful checks:

```sh
npm run test:chat:conformance
npm run parity:check
npm run test:cli-package
npm run test:release:source
```

## Machine quickstart

Install the pinned CLI archive served by the Agentic Economy deployment, then
verify the binary before running a live search. Replace the MCP agent placeholder
with exactly one current harness: `codex`, `claude-code`, or `cursor`.

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
