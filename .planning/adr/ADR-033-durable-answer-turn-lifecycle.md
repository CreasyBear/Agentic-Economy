# ADR-033: Durable answer-turn lifecycle

**Status:** Accepted for the surviving conversation adapter
**Date:** 2026-08-08
**Reconciled:** 2026-08-23

## Decision

Conversation is a thin market adapter, not an independent product kernel. Each
answer turn has a durable reservation, bounded checkpoint stream, terminal
finalization, explicit stop/failure state, and reloadable public projection.

The model may search, inspect, compare, or invoke only through registered tools
and the same Operation contracts used by HTTP, MCP, CLI, and catalogue UI.
Transcript or component state cannot manufacture authority, provider outcomes,
delivery evidence, or money state.

## Consequences

- A turn can resume or explain an interrupted state without replaying completed
  provider work.
- Public sharing uses a redacted projection, never private tool payloads.
- UI streaming is a projection of durable state and does not own truth.
- Removing the conversation UI does not remove the market or transaction path.
- Any future specialist conversational experience must remain an adapter over
  the market foundation selected by ADR-036.
