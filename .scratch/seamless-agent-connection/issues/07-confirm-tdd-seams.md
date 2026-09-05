# Confirm the public TDD seams

Type: grilling
Status: resolved
Blocked by: 05, 06

## Question

Which public, user-visible seams will the feature's vertical TDD cycles exercise, and what independent expected outcomes prove each readiness transition and recovery path without testing implementation details?

The proposed seams must be confirmed by Joel before any test is written. Prefer existing route/UI/API boundaries; mock only genuine external system boundaries.

## Confirmed public seams

Joel confirmed integration against these black-box outcomes:

1. Selecting a supported harness yields one executable connection handoff without requiring an Account.
2. An official MCP client completes an anonymous handshake, sees public Operation search, and can truthfully report **Ready to browse**.
3. The first protected purchase returns an owner authorization handoff and performs no Invocation.
4. Owner approval makes canonical account readback report the durable Agent Principal as **Ready to buy** without exposing bearer material.
5. Reconnection preserves Agent Principal identity and the existing MCP installation; revocation reports stale local authority truthfully and does not affect unrelated agents.

Tests use public UI, CLI, HTTP, and official MCP-client boundaries. Only Clerk, the browser handoff, and filesystem/runtime harnesses may be substituted as genuine external boundaries.
