# Wayfinder agent guide

This directory is the maintained map of Agentic Economy's current category,
execution boundaries, accepted decisions, and evidence ceiling. Read
[`../PROJECT.md`](../PROJECT.md), [`../ROADMAP.md`](../ROADMAP.md),
[`../STATE.md`](../STATE.md), [`MAP.md`](MAP.md), the applicable accepted ADR,
[`../../RULES.MD`](../../RULES.MD), and relevant [`../../PAPERCUTS.md`](../../PAPERCUTS.md)
before changing a wayfinder record.

## Current authority

The current category is the market and controlled transaction layer where
authorized agents discover, buy, and invoke admitted third-party Market
Operations. Suppliers host implementations; AE owns admission, caller policy,
invocation identity, money, evidence, Qualified Use, and recovery. Historical
local-trades, Australian-SMB, BAS, human-service, and AE-hosted-runtime framing
is provenance only and must not be reintroduced as current category authority.

## Single-Key Capability Gateway

The gateway decision is [`ADR-035`](../adr/ADR-035-single-key-capability-gateway.md),
its [gateway implementation plan](../research/2026-08-09-single-key-capability-gateway-implementation-plan.md),
and the [historical 2026-08-11 source-remediation closeout](../research/2026-08-11-goblin-source-remediation-plan.md).
Status is **remediation campaign open; seven workstreams focused-verified; payout-period lifecycle blocked for lack of a trusted server-owned nonzero minimum-payout policy; full post-codegen source release gate not green and no later complete rerun; hosted proof blocked**.

The 2026-08-11 source-completion/local-gate claims are dated historical evidence,
superseded for current status by the 2026-08-12 post-remediation re-audit in
`PAPERCUTS.md`.

- Clerk API Keys issue and revoke the bearer credential.
- AE resolves the `AgentAccessPrincipal`, grant, policy, operation, authority,
  money, evidence, and recovery.
- `operation.invoke:v1` is the protected action.
- `POST /api/v1/operations/execute` is the canonical HTTP route.
- `/mcp`, CLI, and Answer are adapters over the same application service.
- `operation.execute:v1` remains public/keyless/read-only.
- Supplier credentials and opaque provider connection material remain server-side.

The implementation order is W0→W8: architecture freeze; generalized access;
policy/budget/rate admission; HTTP/MCP contract; durable invocation service;
provider authority leases; recovery/evidence; first-use/settings; and discovery,
release, and hosted proof. The plan and ADR name the reused Clerk auth/OAuth,
action/MCP, capability-supply, keyless executor, Action Invocation, provider
transport/connection, money, rate-limiter, workflow/workpool, canonical digest,
RFC 9457, Convex, and MCP SDK seams. Do not introduce a second verifier,
registry, ledger, transport, or execution state machine.

## Evidence discipline

Source shape and focused local behavior are not hosted proof. Do not promote
fixtures, mocks, refusals, synthetic local identities, source-only OAuth,
retained captures, unavailable Convex, or generated manifests into positive
production claims. The gateway's positive exit gate is the same real
Clerk-issued key invoking two real operations from distinct admitted
suppliers/connection modes on the exact hosted revision, with current approval
and budget, server-only supplier credentials, durable terminal/recovery state,
exact usage/evidence readback, same-key zero-meter replay, revoke/withdraw
refusal, and one hard-capped live top-up/charge/payout with zero-movement
replay. CI independently parses the strict receipt. Until that sequence runs,
preserve the blocked/uncertified hosted status. The full post-codegen source
release gate is not green and no later complete rerun exists; the payout-period
lifecycle remains blocked for lack of a trusted server-owned nonzero
minimum-payout policy.

`RULES.MD` is binding: never weaken a validator or conformance gate, inflate a
proof class, hard-code a demo path, add tautological tests, smuggle a
replacement dependency, deliver refusal-only behavior, or edit a decision
record to make unfinished implementation appear complete. Keep each map entry
source-linked and state the exact evidence class. Update `MAP.md`, `PROJECT.md`,
`ROADMAP.md`, and `STATE.md` together when the gateway status or contract
changes; retain historical records instead of silently rewriting them.
