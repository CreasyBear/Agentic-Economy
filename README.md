# Agentic Economy

Agentic Economy is a public market for APIs that software agents can discover,
compare, pay for, and run through one controlled transaction layer.

The catalogue is open to people and machines. It exposes each tool's exact
inputs, price, access requirements, operational evidence, and current
availability before a caller commits to using it. Authenticated calls share one
gateway across the web, HTTP API, CLI, and MCP.

## What you can do

- Browse and search the public tool market without an account.
- Inspect exact terms, inputs, effects, and evidence before calling a tool.
- Compare tools or inspect a bounded multi-tool plan.
- Connect an agent through HTTP, MCP, or the compiled CLI.
- Publish an API once for discovery across the same interfaces.

Imported source metadata stays internal until a live contract, price, and
readiness check admits a callable Operation. A payment never proves successful
delivery.

## Run locally

Use Node.js 22 and npm.

```sh
npm install
npm run dev:local
```

Open [http://127.0.0.1:3000/market](http://127.0.0.1:3000/market) to browse the
market.

## Connect an agent

With the local server running, an agent can begin with the machine-readable
discovery files:

```text
http://127.0.0.1:3000/llms.txt
http://127.0.0.1:3000/SKILL.md
http://127.0.0.1:3000/.well-known/ucp
http://127.0.0.1:3000/mcp
```

The compiled CLI follows the same public market contract:

```sh
npx @agentic-economy/cli manifest
npx @agentic-economy/cli search "weather forecast" --limit 5
npx @agentic-economy/cli inspect <operationRef>
```

Search and inspection are anonymous. Paid or consequential calls require an
owner-approved credential and an explicit idempotency key.

## Verify a change

```sh
npm run test:release:source
```

The source release gate checks contracts, tests, types, UI boundaries, agent
discovery, and the production build.

## Status

Agentic Economy is under active development. Public interfaces may evolve while
the market and execution gateway are being hardened.
