# Wave 4 cold review: storage and identity boundaries

Scope: Convex storage/schema/index contracts and protected identity, hash, and
evidence boundaries affected by the Tool/Quote/Call cutover and the generic
Action Execution rename. This is a read-only review of HEAD
`a51e17b221c6b73851c5873502d8150120ef3aad` (source rename commit
`df44826b7`; current source cutover also includes `3770b43ba`).

## Inspected boundaries

- `PRODUCT.md`, `CONTEXT.md`, and the supplied cold-review brief.
- `convex/schema.ts` and the module-owned Convex schemas in
  `src/modules/action-execution/internal/convex-schema.ts`,
  `src/modules/capability-execution/internal/convex-schema.ts`, and
  `src/modules/capability-supply/internal/convex-schema.ts`.
- The Action Execution persistence boundary in
  `convex/actionExecutionControl.ts`,
  `src/modules/action-execution/durable.ts`,
  `src/modules/action-execution/internal/durable-contracts.ts`, and
  `src/modules/action-execution/internal/development-durable-port.ts`.
- Call-to-execution wiring in `convex/capabilityCallProjection.ts` and the
  call lifecycle readers/writers under `convex/lib/callLifecycle/`.
- Call, Quote, Publication, Provider connection, consequence-journal, and
  projection reads/writes found under `convex/` and the corresponding
  capability execution/supply modules.
- Durable observation, lease, Convex handler, and source-write tests under
  `tests/unit/action-execution/` and `tests/unit/convex/`.

## Confirmed finding

### P2 — Late-observation command digest diverges between the Convex port and its development double

- Confidence: 8/10.
- Current code: `convex/actionExecutionControl.ts:287-291` computes the
  persisted history digest as:

  ```ts
  const commandDigest = canonicalDigest({
    callRef: args.executionRef, effectGeneration: args.effectGeneration,
    actorRef: args.actorRef, sourceEvidenceRef: args.sourceEvidenceRef,
    release: args.release, evidenceDigest: args.evidenceDigest,
  })
  ```

- The interchangeable durable port implementation in
  `src/modules/action-execution/internal/development-durable-port.ts:105-113`
  computes the same logical command as:

  ```ts
  const digest = canonicalDigest({
    invocationRef: input.executionRef,
    effectGeneration: input.effectGeneration,
    release: input.release,
    evidenceDigest: input.evidenceDigest,
    actorRef: input.actorRef,
    sourceEvidenceRef: input.sourceEvidenceRef,
  })
  ```

- `src/modules/action-execution/durable.ts:496-498` forwards the public
  `recordLateObservation` call directly to whichever
  `DurableActionExecutionPort` is supplied. The development port explicitly
  describes itself at `development-durable-port.ts:12-14` as a transactional
  double for the Convex port. The Convex adapter is the direct caller at
  `convex/capabilityCallProjection.ts:186-192`.
- The old implementation at `91a4fff6f:convex/actionInvocationControl.ts:287-291`
  used `invocationRef` in this canonical material. The generic execution
  rename changed only the Convex handler to `callRef` (`df44826b7`); the
  development double retained the old key. The surrounding refactor already
  recognizes that persisted attempt-transition material must retain its old
  canonical key (`src/modules/action-execution/durable.ts:502-506`), so this is
  an omitted protected hash-material mapping rather than an intentional public
  vocabulary change.

### Trigger and observable impact

For identical inputs `(executionRef, effectGeneration, actorRef,
sourceEvidenceRef, release, evidenceDigest)` and the same `commandId`, a call
through the Convex-backed port stores `canonicalDigest({ callRef: ... })`,
while a call through the development durable port stores
`canonicalDigest({ invocationRef: ... })`. The resulting strings differ because
the canonical object key is part of the digest. Each implementation then uses
that value for duplicate/conflict detection: the Convex handler compares the
stored row at `convex/actionExecutionControl.ts:296-303`; the development
double compares its command entry at `development-durable-port.ts:114-119`.

Consequently, a logical late observation moved between the two port
implementations, or replayed from a history written by the other implementation,
is classified as `command_identity_conflict` instead of a duplicate. The
persisted `commandDigest` also ceases to be stable across the claimed durable
port boundary, weakening the evidence/replay contract. Same-port retries still
work, so this does not make every ordinary Convex retry fail.

### Evidence / reproduction

The code paths above are a direct deterministic reproduction; no external
effects or broad tests were run. A narrow assertion can construct one
`recordLateObservation` input and compare the `commandDigest` written by the
development port with the digest produced by the Convex handler. They must be
equal for the development double contract, but the two object literals differ
by `invocationRef` versus `callRef`, so they cannot be equal for a nonempty
`executionRef`.

### Minimal correction direction

Define one canonical late-observation material function at the protected hash
boundary and make both ports use it, preserving the established
`invocationRef` key (or explicitly versioning/migrating the evidence if a
different key is intended). Add a port-parity vector that asserts the exact
digest and duplicate/conflict behavior for late observations.

### Provenance

Introduced by the generic Action Execution refactor (`df44826b7`), where the
Convex file was created from the old action-invocation handler and its digest
key was changed. The source-cutover commit carried the divergence forward.

## Counterevidence considered

- `canonicalDigest` is intentionally used for many distinct materials; old
  terms are retained in several places for protocol/hash/evidence reasons. The
  finding is based on a producer/consumer mismatch, not on a grep-only stale
  word.
- Normal durable transitions use a caller-supplied `commandDigest` and the
  current Convex retry path remains stable within one implementation.
- Current production call projection wiring uses the Convex port, while the
  development double is primarily used by unit/evaluation harnesses. I found
  no current production path that switches an already persisted execution
  between these two implementations. That limits immediate runtime exposure,
  but does not remove the declared interchangeable-port/evidence contract.
- Attempt transition hashes and authority/reconciliation materials retain
  explicit historical keys by design; those were not reported as stale
  vocabulary.

## Uncertain leads and verification gaps

- I did not find a second confirmed storage/index mismatch in the bounded pass.
  The capability Call/Quote/Publication/Provider schemas and their current
  indexed readers/writers were traced at the module and lifecycle boundaries,
  but no live caller was found for a cross-port migration test.
- No Convex deployment or live database was inspected, so the review does not
  establish whether old `actionInvocation*` tables exist in any environment or
  whether a production history has already been written with either digest
  form. The brief and product instructions explicitly limit this pass to source
  contracts; no compatibility defect is asserted from that absence.
- Several `invocationRef`, `operationRef`, `operationId`, and
  `invocationContract` strings remain in source. They were checked against
  protocol fields, canonical evidence material, and generic action metadata;
  no additional confirmed violation was established within this storage scope.

Confirmed findings: 1 (P2); uncertain leads/gaps: 3.
