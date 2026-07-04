# 03-03 D4 Store Shape Amendment — greenlights as protocol records

**Status:** accepted for source/local 03-03.
**Date:** 2026-07-04

## Decision

D4 originally named a separate `handshakeGreenlights` table. 03-03 intentionally does **not** create that table.

Greenlights are persisted in `handshakeRecords` with `recordKind: 'greenlight'`, and receipts/proof-gap records share the same table with their own `recordKind` values. Consumption is a state transition on that record: `accepted` -> `consumed` / `expired` / typed refusal.

The source-owned table set for 03-03 is therefore:

- `agentPrincipals`
- `clearanceMandates`
- `handshakeRecords`
- `handshakeIdempotencyLedger`
- `handshakeStreamEvents`
- `handshakeGatewayChecks`
- `handshakeIsolationStates`

## Rationale

- A greenlight is already a signed protocol record with the same principal, action, mandate, request, payload-hash, signature, expiry, idempotency, and consumption fields as the other clearance record kinds.
- A separate greenlight table would duplicate identity/idempotency state and require a second CAS path or cross-table consistency check.
- The #17 fallback shape says authority-changing transitions end in one terminal Convex mutation. Updating one `handshakeRecords` row plus the idempotency ledger is smaller and easier to make replay-safe than coordinating a record table and a greenlight table.
- P4/P6 receipt reconstruction needs a stable greenlight reference and status, not a physically separate table.

## Tests / guards

- `tests/unit/clearance/convex-protocol-store.test.ts` covers insert/replay/conflict, greenlight consume, wrong kind, wrong principal/action, expiry, replay, idempotency conflict, gateway-check CAS, isolation-state CAS, and corrupted persisted status rejection.
- `tests/unit/schema/convex-schema.test.ts` pins the amended table set and indexes; `npm run check:convex-codegen` proves Convex accepts the tuple validators.

## Boundary

This is a D4 implementation amendment, not a new product capability. It does not introduce booking, payment, dispatch, autonomous fulfillment, live-provider proof, or public protocol vocabulary.
