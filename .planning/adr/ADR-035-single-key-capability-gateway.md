# ADR-035: Single-key capability gateway

**Status:** Accepted; hosted production proof remains open
**Date:** 2026-08-09
**Reconciled:** 2026-08-23
**Product authority:** [ADR-036](ADR-036-agent-tool-market-foundation.md)

## Decision

One Clerk-issued Agentic Economy caller key may access many admitted Operations
through one protected application service.

Clerk owns credential issuance, verification, expiry, and revocation. Agentic
Economy owns the principal projection, grants, Operation access, authority,
budget/rate/concurrency policy, invocation identity, provider release, money,
evidence, recovery, and readback.

The canonical protected contract is `operation.invoke:v1` at
`POST /api/v1/operations/execute`. MCP, CLI, Answer, and human UI are adapters
over that service. Anonymous/keyless inspection and eligible free reads remain
separate and cannot be upgraded into paid authority.

## Invariants

- Re-read current Operation revision, publication, binding, readiness, provider
  authority, grant, and budget before release.
- Keep supplier credentials server-side and generation-bound.
- Reserve before provider I/O; settle observed cost or release.
- Preserve uncertain outcomes for explicit recovery and reconciliation.
- Bind idempotency to caller, authority, Operation, provider, money, and effect
  identity so replay cannot repeat provider work or charge.
- Never infer approval from key scope, balance, connection, or prior success.
- Return bounded, redacted RFC 9457 problems and durable readbacks.

## Proof boundary

Source and labelled-local verification do not certify the hosted gateway. The
production gate requires the same real key to invoke independently hosted
Operations on an exact deployed revision, with provider credentials held
server-side, budget and authority enforced, durable outcome/recovery readback,
zero-meter replay, revocation/withdrawal refusal, and reconciled money evidence.
