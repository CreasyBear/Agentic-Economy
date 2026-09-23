# Return buyer holds after pre-claim refusal

## Contract

A funded buyer accepts an exact Quote. If the Call is refused before any worker
claims it, no Provider effect may occur and its AUD hold must be returned once.
The refusal reason remains visible. Pending or uncertain ledger cleanup must
remain durable and recoverable without restoring revoked spending authority.

## Existing boundary and change

`claimDispatchHandler` requires a pending Call and atomically persists its
canonical claim. Both the workload authority gate and the worker preparation
gate use the same refusal operation. Follow the existing `cancelBeforeClaimHandler` pattern: read
the exact Call identity and canonical control in one Convex mutation. Only the
transaction-confirmed unclaimed branch may write the refusal and request a
refund. A concurrent claim or release fence wins without being overwritten.

The refused Call cannot subsequently be claimed. Keep its financial reservation
unchanged until the existing Formance release confirms completion. Use the
existing reconciliation record with reason `refund_pending`, scheduler,
reconciliation leases/backoff and Formance idempotency. Add no new storage
scheme, service or parallel state machine.

The refund-only action validates the persisted refusal and absence of canonical
execution before and after acquiring the reconciliation lease. It can only
release that Call's existing reservation. It does not require a live Agent grant.
The periodic reconciliation worker processes these refund candidates through
that same action, preserving ordinary recovery authorization for other Calls.

An interruption after refusal is covered by the atomically scheduled action and
periodic reconciliation. An interruption after ledger success is covered by
replaying the same Formance release reference before financial finalization.
The existing retry ceiling produces manual review rather than false completion.

## Ownership and verification

- Convex transition, API registration and reconciliation selection: bounded agent
  owns `dispatch.ts`, `capabilityCalls.ts`, and `reconciliation.ts`.
- Cleanup execution, authority/worker connection and tests: parent owns
  `authorityHandlers.ts`, `charge.ts`, `capabilityCallWorker.ts`, and focused tests.
- Manager owns combined checks, integration and hosted release.

Use existing Convex/Workpool and real local Formance integration. Prove refusal
wins, claim wins, release-fence wins, exact identity, interruption/replay, one
release, no Provider effect and exact restored AUD balance. Preserve the paid
delivery/replay case and existing recovery tests. Hosted behavior remains a
separate release check.

## Source evidence

`tests/integration/capability-call-workpool.test.ts` passes against real local
Formance with only external Provider/CDP/RPC/rate fixtures. It proves exact
identity rejection, claim/fence precedence, revocation before claim, persisted
refund intent through a ledger outage, unchanged refusal replay, and scheduled
reconciliation after ledger success interrupted source finalization. AUD 10
becomes AUD 8.80 after one paid Call, AUD 7.60 during the second hold, and AUD
8.80 after its refund. Provider delivery and signature counts remain one.

The reconciliation unit suite additionally checks lease takeover, refusal
preservation, refusing premature completion, and candidate selection past older
refusals with no pending refund. Worker, authority, dispatch, recovery and
workload boundary suites and focused lint pass. These are source-level proofs;
the manager owns the combined release checks and hosted acceptance.
