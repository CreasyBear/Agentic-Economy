# T13 — Demand-side offer: `/` reframe + agent-operator console

Labels: `wayfinder:task`. Status: implemented 2026-07-30. From the 2026-07-30 grilling: `/` is the demand-side offer; supply pitch lives on the provider landing.

## Question

Reframe `/` as the demand funnel: try the ask live (T9 plan surface stays as the experience) → "use this from your own assistant" (MCP install one-liner, T6) → get a scoped key (T3 device flow) → fund credit (T12). Add the agent-operator console: credit top-up, key inventory (extends `/agent-access`), per-key usage and spend. Pattern source: OpenRouter's credits/keys/usage loop (`research/2026-07-30-marketplace-pattern-borrow.md`). Copy sheds the consumer promise ("we'll handle it") in favor of the honest demand offer ("your assistant can use this market"); keyless reads stay free and prominent.

## Resolution

Implemented 2026-07-30. `/` now leads with AE's end-to-end promise, turns an ordinary ask into comparable options, and hands the result into copyable Claude and Codex setup commands. `/agent-access` now combines scoped assistant access, revocation, credit balance, activity, and per-key usage through T12's source-owned query seams. Credit setup reports the real Stripe-port state and starts no fake payment; the 5% top-up fee remains explicit. The OAuth device path is live in local development through the Convex-backed grant store. Human copy is outcome-led; protocol details remain in machine guidance and advanced setup.
