# Select the reference-aligned connection journey

Type: grilling
Status: resolved
Blocked by: 02, 03, 04

## Question

Which familiar reference sequence should AE adopt for the two-stage **Ready to browse → Ready to buy** journey, and which existing AE primitives or maintained packages should own each step?

The decision must include a side-by-side contrast, the selected default path, explicit reuse choices, exact state names, failure/recovery behavior, and any reference behavior deliberately not adopted with a reason tied to this single feature.

## Answer

### Selected reference posture

- **Primary interaction model — Locus:** one staged Agent Connection journey whose current status, authority, budget/expiry and recovery remain readable.
- **Packaging model — Whop:** recognizable client choices, maintained installer/CLI shapes, copyable commands, generated contracts and hosted human steps rather than proprietary setup machinery.
- **State discipline — Nevermined:** discovery, transport, identity, funding and spending authority stay orthogonal; a single green “connected” badge never claims all of them.

AE will adapt those familiar patterns through its existing primitives rather than invent another connection protocol or data model.

### Default journey

```text
Choose Codex, Claude Code, Cursor, or API
  -> use the maintained client-specific installer/configuration
  -> verify AE through a harmless public discovery read
  -> Ready to browse
  -> request owner approval only when paid authority is needed
  -> complete the existing OAuth/device ceremony
  -> verify the durable Agent Principal through GET /api/v1/account
  -> Ready to buy
  -> inspect expiry, scope, rotation, revocation and recovery in the same owner workbench
```

### Explicit reuse choices

| Concern | Existing owner |
|---|---|
| MCP transport and tool discovery | `@modelcontextprotocol/sdk` and AE's canonical action registry |
| Harness-specific configuration | pinned `add-mcp` invoked through `aeMcpInstallCommand` / `aeMcpListCommand` |
| Public verification | current anonymous MCP/search actions and official-client behavior |
| Human approval | existing OAuth discovery, dynamic registration, device authorization, PKCE and `AeAgentAccessAuthorizeForm` |
| Credential issuance and revocation | Clerk-backed issuance plus AE's origin-bound CLI store |
| Canonical identity/readiness | `GET /api/v1/account`, `principalRef`, Account membership and `AgentDirectoryProjection` |
| Owner lifecycle | existing agent directory, planned/compromised rotation, revoke and disconnect mutations |
| UI and feedback | current AE copy, status, alert, confirmation, sheet and empty-state primitives |
| Tests | Vitest, Testing Library, Playwright and the official MCP client |

No new connection table, identity, token format, OAuth flow, MCP transport, config mutator, polling framework, secret store, tool registry or Invocation-recovery mechanism is authorized.

### Exact visible states

- **Not set up** — no selected client configuration is known.
- **Setup action available** — the selected client has one generated maintained command/configuration.
- **Verification needed** — configuration was produced, but active client visibility has not been proved.
- **Ready to browse** — a harmless public discovery action succeeded through the selected client surface.
- **Approval needed** — the next paid action requires owner-approved authority.
- **Approval pending** — one durable authorization attempt exists and can be resumed without silently opening another.
- **Ready to buy** — canonical self-readback and owner directory agree on the active Agent Principal, credential generation, scope and authority mode.
- **Attention needed** — expired, revoked, mismatched-origin, degraded transport or incomplete cleanup state has one explicit recovery action.

Funding sufficiency and one Operation's current eligibility remain Call-time facts; the feature must not present them as permanent connection status.

### Failure and recovery rules

- Server reachability, harness registration, active-session tool visibility and buyer authority are reported separately.
- A pending device grant retains one resumable identity for its server lifetime; restarting the CLI must not manufacture a second approval silently.
- Credential validation uses the canonical self-read, never a fabricated Invocation.
- Owner revocation or replacement must become visible to the local caller as stale/reconnect-required without exposing or duplicating the secret.
- MCP/HTTP transport success never converts a tool-level error into readiness.
- Invocation uncertainty remains in existing Invocation status/reconciliation; reconnection never retries paid work.

### Reference behaviors not adopted

- Nevermined's API-key-first and multi-prerequisite mental join is not the primary UI; it lacks one caller-readable readiness answer.
- Whop's distributed credential/app/permission model is not copied; its packaging and hosted-step conventions are.
- Locus's long-lived static credential defaults and incomplete sandbox parity are not copied.
- No vendor's single generic “connected” state is copied because it would collapse transport, authority and economic readiness.

### Approval

Joel approved this reference posture and instructed the effort to rationalize and clean up the currently working but clunky connection experience, preserve quality standards, avoid handrolling, and continue through full forward implementation.
