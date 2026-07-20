---
status: accepted_for_phase_3c_plan_01
date: 2026-07-20
decision_owner: Founder
applies:
  - ADR-009
  - ADR-010
  - ADR-019
  - ADR-020
evidence_ceiling: source_inspection_and_classified_red_fixtures
---

# Hosted paid-operation trial boundaries

## Decision supported

Phase 3C may proceed only if an authenticated evaluator can eventually inspect,
command, and reconstruct one hosted-sandbox paid operation without letting a
caller manufacture identity, authority, provider facts, payment truth, or
reconciliation evidence.

This ADR freezes the boundary that Plan 01 tests. It applies the existing Action
Invocation lifecycle; it does not create a hosted lifecycle beside it.

## Source findings

The current `PaidOperationApplicationService` reconstructs one
`agentic-paid-operation:v1` semantic object and derives both human and structured
projections from it. It verifies the invocation owner and expected invocation
version before admitting a continuation.

Its current `PaidOperationCommand` includes `ReconciliationEvidence` and
`X402PaymentReconciliationEvidence`. That type is an internal/development
application command. It is not safe as a public hosted command because it lets
the caller present the facts that decide whether an external effect or payment
occurred.

The trustworthy resolution boundary is already nameable. The reconciliation
validators bind evidence to its source, invocation, attempt, effect generation,
payment identity, target, amount, and observation time, and require a
source-evidence verifier. The internal command port applies the validated
resolution. Hosted work must inject evidence at that boundary from a trusted
server/operator-side observer.

Convex already supports authenticated public functions through
`ctx.auth.getUserIdentity()`. The authenticated server client forwards Clerk's
`convex` token. Existing agent API-key authentication demonstrates current-key
revocation and scope checks. Phase 3C selects authenticated public Convex
functions using `ctx.auth` as its one identity bridge. A route-supplied owner,
principal, caller, session, or credential is never an identity source.

## Frozen public and internal reconciliation split

The external reconciliation body is exactly:

```ts
{
  command: "reconcile"
  commandId: string
  expectedInvocationVersion: number
}
```

No public human or agent DTO, command descriptor, route body, semantic object,
browser state, log, snapshot, or evidence packet may contain reconciliation
evidence or a caller-selected resolution.

The hosted composition root converts public intent into an internal trusted
resolution command only after its injected trusted evidence port obtains both
the attributable release observation and payment observation. The internal
command may carry the two existing evidence types. Evidence absence or failed
validation is an ordinary typed refusal and leaves uncertainty visible. It
never becomes retry, execute, fallback, or provider switch.

`commandId` is stable idempotency identity, not evidence or authority.
`expectedInvocationVersion` is concurrency control, not authority.

## Ownership

Business/source records own the selected provider publication, operation
revision, material input, provider response interpretation, normalized result,
payment-attempt facts, settlement assertions, and trusted evidence references.
Raw provider responses remain inside the operation/evidence adapter.

Neutral Action Invocation control owns continuity only: discriminated origin,
actor attribution, action/version reference, exact authority binding,
invocation version, attempt and effect-generation references, idempotency,
release posture, uncertainty, and safe continuation. Removing its projection
must not erase the source-owned result. Neutral control must not store provider
payloads, result truth, raw evidence, credentials, signatures, authorization
payloads, or payment payloads.

The hosted aggregate is a bounded application projection composed from
source-owned rows, neutral control, attempts, payment facts, and opaque evidence
references. It is not a new aggregate of business truth. Reads are indexed and
bounded; cap plus one returns `aggregate_incomplete` rather than a partial
semantic object. After a mutation, the application reloads the committed
aggregate and derives the projection from that durable state rather than the
command return value or route memory.

## Identity, trial admission, and authority

Human identity is the current Clerk identity obtained inside the public Convex
function through `ctx.auth`. Its stable subject attributes the principal; the
token identifier attributes the current session/caller. Revoked or absent
identity fails before lookup and reveals no invocation facts.

Agent identity uses a paid-operation-specific least-privilege Clerk API-key
scope. The server verifies the current key ID, subject, owner, expiry,
revocation, and scope before calling Convex. Convex independently derives the
authenticated identity from the forwarded token. Customer Request scope does
not imply paid-operation scope or authority.

Evaluator admission is separate from consequence authority. An allowlisted
cohort, sandbox kill switch, and atomic per-principal count, concurrency, and
rate reservations only decide whether the protected trial may be used. They do
not authorize disclosure, payment preparation, submission, retry, or provider
switch. Authentication and admission can refuse access; only the exact current
authority binding permits one consequence.

Missing and cross-principal human reads have the same non-enumerating result.
Structured-agent distinctions may exist only after authentication and a
separate enumeration-risk review, and may contain no operation semantics.
Direct internal-handler bypass still requires the `ctx.auth` identity and
admission checks.

## Custody and evidence

Only opaque digest references and non-secret event facts persist across shared
records. Raw credentials, auth headers, signatures, authorization/payment
payloads, provider responses, and trusted evidence material remain within
injected least-privilege custody/evidence ports.

Payment preparation is durable before authorization material can be used.
Submission-started is durable before possible provider release. Process loss
after that point reconstructs `possibly_submitted` or stricter truth and exposes
reconciliation only. A receipt or provider assertion proves only its named
event; it is not independent settlement or fulfilment.

## Provider selection and switching

`/actions/paid/new` is protected evaluator-only Sandbox setup, not canonical
product information architecture, provider comparison, or a generic action
entry. It accepts one closed `providerKey`; the source owner resolves all
provider material and binds it before authority. Provider selection remains
outside the shared paid-operation card.

Switching is absent during uncertainty. From safely terminal truth it invokes
the same source-owned creation contract and creates pairwise-distinct invocation,
authority, payment, and effect-lineage identities. It does not resume, retry, or
copy consequence state from the prior invocation.

## Projection and transition contract

Fresh-process reconstruction must recover selected provider/source facts, exact
actor and authority decision, possible submission, settlement and result truth,
expected invocation version, and exactly one safe continuation. Human and agent
surfaces consume the same `agentic-paid-operation:v1` semantics and canonical
digest. The digest is for projection equality only.

The forward transition remains visibly ordered:

```text
Sandbox setup -> source-bound invocation -> consequence review
-> authority recorded with nothing submitted -> execute once
-> separate payment, settlement, and result truth -> cold restore
```

Authorization and execution never collapse. Each unhappy path branches from a
named transition and either rejoins through one source-supplied safe
continuation or stops visibly. Ambiguous transport reloads/inspects and never
replays. Uncertainty exposes reconcile only and forbids retry, fallback, and
provider change.

## Evidence labels and claim ceiling

Environment, provenance, evidence class, and claim ceiling are runtime/source
inputs. Local fixtures use `local_labelled_sandbox_fixture`. Only a separately
authorized successful exact-revision hosted readback may use
`authenticated_exact_revision_hosted_sandbox`.

Plan 01 proves source inspection and classified executable contract gaps only.
It proves no implementation, hosted reachability, credential or payment
operation, settlement, provider fulfilment, production safety, demand,
comprehension, or customer value.

## Rejected alternatives

- Caller-supplied reconciliation evidence: rejected because the caller would
  select the business/payment truth being decided.
- Server route identity fields: rejected because authenticated identity must be
  derived at the source boundary.
- Authentication as authority: rejected because identity and evaluator
  admission do not authorize a consequence.
- Hosted route lifecycle: rejected because ADR-009/010 already own the shared
  lifecycle and application seam.
- Business truth in neutral control: rejected because it creates a competing
  source of record.
- Provider fallback or lineage reuse: rejected because an uncertain or changed
  provider is a distinct consequence boundary.

## Plan 01 acceptance

The Phase 3C RED harness must recognize only explicitly allowlisted full test
names and their `P3C_RED:<reason>` markers from structured Vitest output. It
must reject malformed output, import/config/timeout/infrastructure failures,
unrelated failures, missing tests, wrong reasons, and unexpected passes.

Production implementation remains absent. Plan 02 may begin only after the
classified report and clean import-boundary gate have the disposition recorded
in the Plan 01 handoff.
