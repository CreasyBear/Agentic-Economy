# T3 — Cold-agent credential issuance for Customer Request writes

Labels: `wayfinder:grilling` (HITL). Status: open, unclaimed.

## Question

`POST /api/v1/requests` needs a Clerk API key with `customer_requests:create`, issued only through the signed-in `/agent-access` operator UI. A cold agent therefore reads everything but can never graduate to the write path on its own — Soar solves this with OAuth from inside the agent flow (`codex mcp login soar_flights`). What is AE's issuance path?

Options to grill:
- Agent-initiated OAuth/device-code flow that ends with a scoped key (Soar-shaped).
- Self-serve keyless trial scope (create inspect_only Requests without a key; keys only for effectful modes).
- Keep operator-issued keys (status quo; the cold journey stays read-only).

The answer bounds every "an external agent can use AE" claim (see `ae-agent-identity-and-mandates`).

## Prepared brief (2026-07-30, agent recommendation — decision stays with founder)

Recommendation: **Self-serve keyless `inspect_only` first, Soar-shaped OAuth second.**
- Keyless `inspect_only` Requests match ADR-019's lowest authority mode, require no credential custody change, and let a cold agent complete compare journeys today; effectful modes (`approve_each` and above) keep the existing key + scope gate. Smallest change with the biggest journey unlock.
- The Soar-shaped device-code flow is the right end state (agent asks, human authorizes in browser, scoped key lands in the agent) but touches Clerk issuance, scope design, and revocation UX — a full effort of its own.
- Status quo fails the destination: "an external agent can use AE" stays capped at read-only, and every hosted journey claim carries that ceiling.

## Resolution

Decided 2026-07-30 by founder: **Soar-shaped OAuth/device-code flow now** (option 1 of the grilling list; the brief's "keyless inspect_only first" recommendation was considered and overruled). An agent initiates the flow, a human authorizes in the browser, and a scoped key lands in the agent. Scope design mirrors AE authority modes; issuance/revocation ride Clerk. The MCP key-gated tier (T6 deferral) binds to this flow.

### Resolution addendum — DEV SLICE (2026-07-30)

Implemented locally: an agent starts `POST /oauth/device_authorization` with `customer_requests:create` plus exactly one ranked mode (`inspect_only`, `approve_each`, `bounded_mandate`, or `full_yolo`), shows the returned `verification_uri` and `user_code`, and polls `POST /oauth/token` until the one-time grant delivers a seven-day Bearer Clerk API key. The browser consent path is `/agent-access/authorize?user_code=...`; `/agent-access` now inventories mode, lifetime, current/revoked/expired state and immediate revocation without rendering secrets. Authorization-code + PKCE S256, constrained public registration, protected-resource and authorization-server metadata, and 401/403 challenge vocabulary are AE-owned. Anonymous `/mcp` remains exactly the four read-only tools.

### Resolution addendum — SOURCE-OWNED GRANT MACHINE (2026-07-30)

The OAuth grant lifecycle is now one source-owned transition machine with typed refusal/conflict results, expiry/owner/PKCE/poll/CAS invariants, and delivery rollback. The four OAuth routes use the Convex persistence adapter by default; Convex stores and compare-and-swap updates only, with no duplicate transition implementation. Clerk API-key normalization/listing is one shared adapter, and dead no-op grant server functions were removed. This closes T3's previously open Convex HTTP store-adapter item; local/dev verification remains the evidence ceiling until hosted readback.


Remaining HITL (not executable in this DEV SLICE):

- Clerk dashboard enablement: a human must enable Clerk User API keys in the Dashboard.
- Production instance/domain confirmation: a human must confirm the production Clerk instance/domain and API-key scope behavior.
- Deployment env secrets: a human must configure `CLERK_SECRET_KEY`/publishable key/JWT issuer values and `AE_CONVEX_SERVER_FUNCTION_TOKEN` in each deployment.
- Hosted readback: a human must exercise the exact deployed revision and public OAuth/MCP endpoints before making hosted claims.
