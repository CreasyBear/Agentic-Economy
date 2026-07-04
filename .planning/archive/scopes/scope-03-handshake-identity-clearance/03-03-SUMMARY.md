# 03-03 Summary — clearance module Convex store

**Status:** source/local complete, with one recorded D4 store-shape amendment.
**Date:** 2026-07-04

## Proof boundary

This is source/local proof only. It does **not** claim deployed P4/P6 clearance rows, live provider proof, booking, payment, dispatch, autonomous fulfillment, or production readiness.

The deployed-data gate remains live: before any production cutover, run a deployed readback for P4/P6 clearance-bearing rows. If deployed rows exist, freeze-and-supersede is mandatory before reshaping historical receipt-bearing state.

## Preflight decisions consumed

- **#17 FALLBACK consumed:** 03-03 follows the 03-01 fallback shape: no root-exported `HandshakeKernel` assumption, no forbidden package subpaths, and authority-changing work is modeled as source-owned Convex commit/consume paths rather than an in-mutation full-kernel transition.
- **#20 local decision consumed:** `03-03-CREDENTIAL-CUSTODY-DECISION.md` maps current P4 contact follow-up and source/local P6 business-action receipt flows to `credentialCustodyStatus: no_mutation_credential` and `enforcementMode: customer_gateway_adapter`. Identity remains attribution/quota/audit only.
- **#21 local decision consumed:** `03-03-SIGNING-POSTURE-DECISION.md` selects `local_hmac` for greenlights and receipts, with dedicated server-only key names `AE_CLEARANCE_SIGNING_SECRET` and `AE_CLEARANCE_SIGNING_KEY_ID`.

## Tracker sync status

Tracker state was synced after source/local completion on 2026-07-04:

- `gh issue view 20 --json state,assignees,comments` returned `state: CLOSED`, assignee `CreasyBear`, one resolution comment.
- `gh issue view 21 --json state,assignees,comments` returned `state: CLOSED`, assignee `CreasyBear`, one resolution comment.
- `gh issue view 1 --json body` contains the #20 and #21 decision bullets under "Decisions so far".

The resolution comments and map bullets still state the source/local proof boundary; no deployed signer/clearance proof is claimed.

## D4 amendment: no separate `handshakeGreenlights` table

The original D4/03-03 plan named a separate `handshakeGreenlights` table. 03-03 intentionally amends that shape.

Recorded amendment: `03-03-D4-STORE-SHAPE-AMENDMENT.md`.

Rationale: a greenlight is already a signed protocol record with the same principal/action/mandate/request/hash/signature/expiry/idempotency/consumption fields. Storing it as `handshakeRecords` with `recordKind: 'greenlight'` avoids duplicated CAS state and keeps the #17 fallback commit path smaller.

The scope index D4 row and 03-03 plan now point to the amended shape.

## Table and store shape

Source-owned clearance tables now covered by the schema contract:

- `agentPrincipals`
- `clearanceMandates`
- `handshakeRecords`
- `handshakeIdempotencyLedger`
- `handshakeStreamEvents`
- `handshakeGatewayChecks`
- `handshakeIsolationStates`

Relevant implementation:

- `src/modules/clearance/internal/schema.ts`
- `src/modules/clearance/internal/convex-protocol-store.ts`
- `convex/schema.ts`
- `convex/clearance.ts`
- `tests/unit/schema/convex-schema.test.ts`

Status values are tuple-backed, not broad strings:

- Protocol records: `accepted | consumed | proof_gap | rejected | expired`
- Gateway checks: `accepted | rejected | proof_gap`
- Isolation states: `available | isolated | proof_gap`

Convex validators use the same tuples via `literalUnion(...)`; corrupted persisted gateway/isolation statuses are parsed through Zod schemas and fail loudly in the store tests.

## Store result unions and CAS coverage

`ConvexProtocolStore` exposes:

- `putClearanceRecordIfAbsentOrSame`
  - `inserted`
  - `replayed`
  - `rejected` with `clearance_record_conflict`
- `recordClearanceProofGap`
  - same result shape as record insert, with terminal `proof_gap` status
- `consumeClearanceGreenlight`
  - `consumed`
  - `rejected` with typed reasons:
    - `clearance_greenlight_required`
    - `clearance_greenlight_kind_mismatch`
    - `clearance_greenlight_principal_mismatch`
    - `clearance_greenlight_action_mismatch`
    - `clearance_greenlight_expired`
    - `clearance_greenlight_replay_rejected`
    - `clearance_greenlight_not_accepted`
    - `clearance_greenlight_reference_ambiguous`
- `readClearanceRecord`
- `commitClearanceGatewayCheck`
  - `committed`
  - `replayed`
  - `rejected` with `clearance_record_conflict`
- `commitClearanceIsolationState`
  - `committed`
  - `replayed`
  - `rejected` with `clearance_record_conflict`

Tests cover idempotent insert/replay, conflicting record/idempotency payloads, greenlight consume/replay/expiry/wrong-principal/wrong-action/wrong-kind/proof-gap, proof-gap record idempotency, gateway-check CAS, isolation-state CAS, and corrupted persisted status rejection.

## Mandate model

`src/modules/clearance/internal/mandate.ts` adds a reusable principal-bound clearance mandate:

- principal id
- action class
- action ref
- allowed scopes
- status
- expiry
- optional revocation time
- optional max amount cents
- source hash

Tests cover accepted mandate evaluation, missing mandate, principal mismatch, action-class mismatch, scope mismatch, spend cap excess, expiry, revocation, and not-active status. A signed identity alone still grants no verb.

## Signed payload and key resolver

`src/modules/clearance/internal/signed-payload.ts` builds bound payloads for:

- greenlight records
- receipt records

Payloads bind version, principal, action class/ref, mandate/request/greenlight/receipt refs, idempotency key, issued/expires timestamps, payload hash, optional previous receipt hash, and outcome for receipts.

`src/modules/clearance/internal/key-resolver.ts` resolves active/retired local-HMAC verification keys from injected env-like values. Missing key material, missing key identity, unknown keys, and retired-signing-only cases fail closed through typed results.

## P4/P6 reshape path

Source/local reshape was applied because repo evidence still records Phase 6 as source/local only and production/deployed proof as open (`.planning/STATE.md` blockers lines 160 and 170). No deployed row readback artifact was produced in this session, so this is **not** a production data assertion.

P4 and P6 are wrapped through the clearance public seam while preserving their source-owned reconstruction oracles:

- P4 `recordAndConsumeContactFollowUpClearance` wraps the contact-follow-up gateway admission path and still persists the P4 source slice before returning the owner/receipt readback.
- P6 `recordBusinessActionReceiptClearance` wraps the business-action checkpoint/receipt path and still reconstructs receipts from the P6 source state.
- `src/routes/api.agent.tools.ts` imports request verification from `clearance/public` and the source-write helper from the narrow server seam `clearance/server`; it no longer imports `clearance.functions` directly.

## Import/copy/source posture

- `src/modules/clearance/public.ts` exports the public shared seam; `src/modules/clearance/server.ts` exports the narrow route/server seam for `recordAgentIdentityThroughSource`; sibling modules do not import `src/modules/clearance/internal/*`.
- The rejected cloud/provider subpaths are scan-forbidden, including `handshake-cloud`, `handshake-protocol-kernel` forbidden subpaths, customer-edge/agentic endpoint packages, x402, MCP, provider/money rails, and runtime `.planning` imports.
- Public human copy and agent-facing descriptors do not advertise a new capability from identity, mandate, or clearance.
- Internal vocabulary remains internal; no booking/payment/dispatch/autonomy claim was added.

## Verification run

Final observed commands:

```text
npx vitest run tests/unit/clearance/convex-protocol-store.test.ts
PASS — 1 file, 12 tests

npm run typecheck
PASS — tsc --noEmit

npm run check:convex-codegen
PASS — Convex codegen dry-run completed and TypeScript ran

npx vitest run tests/unit/clearance/signed-payload.test.ts tests/unit/clearance/mandate.test.ts tests/unit/clearance/convex-protocol-store.test.ts tests/unit/convex/protected-actions-runtime.test.ts tests/unit/convex/business-actions-runtime.test.ts
PASS — 5 files, 50 tests

npm run test:imports
PASS — 3 files, 3 tests

npm run test:imports:fixtures
PASS — 3 files, 3 tests

npm run test:source-mining
PASS — 1 file, 2 tests

npm run test:ts-standards
PASS — 1 file, 1 test

npm run test:unit
PASS — 130 files, 698 tests

npm run build
PASS — Vite/TanStack/Nitro production build completed
```

One intermediate broad run of `npm run test:unit` failed because `tests/unit/schema/convex-schema.test.ts` had not yet been updated for the new clearance tables. That schema contract was updated, and the final unit suite passed.

## Remaining gates

- Close/sync GitHub #20 and #21 plus map issue #1 if tracker write tooling is available.
- Run deployed D7 readback before production release; if deployed rows exist, freeze-and-supersede instead of source-local reshaping.
- Scope 03-04 still owns the field-level evidence-binding map into P4/P6 receipt hash chains (#18).
- Scope 1 deployed env/provider proof remains required before production/deployed claims.
