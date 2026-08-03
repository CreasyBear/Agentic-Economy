# T2 — Inbound agent payment rail

Labels: `wayfinder:grilling` (HITL). Status: open, unclaimed.

## Question

agentic.market's pitch is pay-per-request x402/USDC with zero accounts. AE today has only an *outbound* x402 transport (`src/modules/capability-supply/route-transport-runtime.ts`) — no inbound payment challenge; open endpoints are free sandbox. Which inbound rail, if any, does AE adopt for agent-callable endpoints?

Options to grill:
- **Inbound x402** on open endpoints (parity-maximal; crypto custody, settlement, and outcome-unknown/reconciliation obligations follow — see project payment-boundary rules).
- **Account credit / API-key metering** (boring, fiat-friendly; breaks the "no registration" property).
- **None for now** (free open endpoints; charge only inside the authorized Customer Request path). Cheapest honest position.

Constraints: project-owned payment boundaries — credentials server-side, exact amount/currency ceiling per admitted step, outcome-unknown after release requires reconciliation, no claim of customer-reachable payment until the intended surface is proven.

## Prepared brief (2026-07-30, agent recommendation — decision stays with founder)

Recommendation: **None for now.** Grounds from T4 research:
- Every capability adapter requires a server-held credential; there is no inbound challenge surface, custody, settlement, or reconciliation path in source. Building one is the largest machinery item on the table and blocks nothing else.
- The parity harness reached 7/7 against agentic.market's baseline contract without any rail: discovery, search, priced catalog, and a keyless callable endpoint.
- If the first independent provider speaks x402 natively, the agent pays the provider directly — AE lists and routes, and needs no inbound rail at all. Revisit this ticket at that moment with the x402 importer + one real paid call as the evidence gate.

## Resolution

Decided 2026-07-30 by founder: **Account credit / API-key metering** (the brief's "none for now" recommendation was considered and overruled; inbound x402 rejected). Grounds and consequences:

- The rail rides the credentials T3 already issues: scoped Clerk API keys from the Soar-shaped OAuth/device-code flow. Metering binds usage to `principalId: clerk_api_key:<id>` — no crypto custody, settlement, or reconciliation machinery.
- The "no registration" property narrows deliberately: the anonymous tier (discovery, search, catalog detail, sandbox quote, MCP read tools) stays free and keyless; metering applies to keyed tiers only. Public copy must keep saying the cold journey is keyless.
- Not yet specified (needs its own plan before any implementation): what is metered (per-request vs per-effectful-operation), pricing, quota enforcement point (auth seam vs per-action), billing/settlement mechanics, and overage refusal semantics. Blocked by T3 implementation landing.
- No claim of customer-reachable payment until the intended surface is proven (project payment boundary).
