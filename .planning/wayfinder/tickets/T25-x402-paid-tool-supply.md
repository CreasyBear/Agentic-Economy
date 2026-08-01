# T25 — Engine consumes paid x402 tool supply (Exa via agentic.market)

Labels: `wayfinder:task` (AFK build behind HITL wallet gate). Map: [Agent engine](../MAP-engine.md).

## Question

Founder directive 2026-07-31: dead-end capability = real tool calls (Exa, Monid-class), not planning
tokens. Stage 2 after T23's OpenRouter-web-plugin discovery: make the engine a *paying customer* of the
agentic economy. Wire the `web.discover` action's transport to call Exa directly as an x402 pay-per-call
service (listed on agentic.market: $0.001 USDC/search, no API key, Base network), through the already
admitted `x402-fetch:v2` transport adapter in capability-supply. Kernel owns spend authority: the step
carries `spendExposure` and a per-turn tool-spend ceiling alongside the model-cost ceiling; every paid
call journals its cost into `enginePlanEvents` like model calls do. Evidence: citations + payment
receipt refs, honest evidence class. Fog (do not build yet): Monid unified-MCP discovery of which paid
source to use (waitlist-only today, withmonid.com); route mandates for multi-provider tool spend
(T3/T12 lineage).

**HITL gate:** funded USDC wallet on Base for the engine's tool spend — founder provisions; never a
simulated payment.

## Resolution

(pending)
