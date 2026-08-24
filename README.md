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
- `@agentic-economy/cli` — search, inspect, call, status, and recovery.
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

## Run locally

Use Node.js 22 and npm 11.5.1.

```sh
npm ci
npm run dev:local
```

Open `http://127.0.0.1:3024/market` for the catalogue or
`http://127.0.0.1:3024/t/new` for chat.

Useful checks:

```sh
npm run test:chat:conformance
npm run parity:check
npm run test:cli-package
npm run test:release:source
```

## Machine quickstart

```sh
npx @agentic-economy/cli search "weather forecast" --limit 5
npx @agentic-economy/cli inspect <operationRef>
npx @agentic-economy/cli call <operationRef> --input '{"city":"Perth"}'
```
