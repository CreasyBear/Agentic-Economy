# Prototype the familiar connection workbench

Type: prototype
Status: resolved
Blocked by: 05, 09

## Question

What is the lowest-fidelity interactive page or wireframe that makes the selected reference journey obvious, preserves progressive disclosure, and lets Joel judge whether the feature feels familiar before implementation planning?

The prototype must cover fresh arrival, harness/interface choice, generated setup action, verification in progress, **Ready to browse**, authorization handoff, **Ready to buy**, and recoverable failure. It must reuse the project's existing visual system rather than introduce a new one.

## Prototype checkpoint

- Review route: `/connection-prototype?variant=A&state=setup` (development only, no account session required)
- Intended product route: `/owner/settings/developers?variant=A&state=setup` (development only, authenticated owner shell)
- A: Locus-like guided journey
- B: Whop-like client launcher with a persistent readiness rail
- C: durable connection record with transport, discovery, and authorization shown separately
- State previews cover setup, verification, browse readiness, approval handoff, buy readiness, and recovery.
- Uses the existing pinned `add-mcp` command generator and AE UI primitives; it performs no mutations.
- Typecheck and focused lint pass.

## Decision

Use A only for the one-action first connection, then transition into C as the durable connection record. There is no onboarding wizard: choose the client once, hand setup to the agent or its native marketplace, and verify in the background. Purchase authorization is requested just in time by a paid Operation, not during initial connection. Raw commands are retained only under manual setup and recovery because the supported clients do not all expose a safe web install deep link.
