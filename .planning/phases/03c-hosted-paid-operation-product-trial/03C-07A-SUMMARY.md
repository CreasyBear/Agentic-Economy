# Phase 03C Plan07A — hosted source readiness candidate

## Decision

The selected source paths are principal-owned multi-caller access with immutable
original ownership and durable actual-caller attribution; one fixed internal,
expiring operator policy; and local fixture defaults plus a policy-returned
hosted-candidate context. Alternatives rejected were caller normalization,
access-grant lifecycle, environment auto-materialization, compiled evaluator
identity, caller labels, and hosted labels in every fixture.

## Source trace

| Decision | Path 1 | Path 2 | Selected path |
|---|---|---|---|
| Same-principal access | Normalize agent to session; loses attribution | Add access grants; adds lifecycle | Principal ownership, immutable owner, actual command caller |
| Admission | Materialize from environment; drift risk | Compile identity; weak disable/history | Internal configure/disable/status policy |
| Environment | Caller/free-form label; forgeable | Hosted label in fixtures; false claim | Local default plus policy candidate context |

## Evidence and ceiling

REDs reproduced evidence-shaped public reconciliation inputs and exact-caller
same-principal refusal. Source and focused local Convex fixtures are the only
authorized evidence. This candidate cannot prove policy configuration,
credentials, deployment, hosted reachability, provider/payment/settlement,
production safety, customer value, accessibility in use, or non-paid
compatibility. Parent remains integration, deployment and claim owner.

## Parent-audit correction

Parent audit found that the first candidate corrected inspection but left exact
creator-caller checks in transaction and trusted effect readback, and did not
semantically exercise the new admission lifecycle. The correction keeps the
generic Action Invocation lifecycle unchanged: changing that shared lifecycle
would broaden every caller; normalizing the authenticated caller to the creator
would erase attribution; the selected hosted adapter path invokes historical
ownership/authority checks with the immutable owner while persisting the actual
authenticated command caller and rewriting only the newly created attempt actor
to the actual executor.

For the single evaluator policy, three paths were compared again: compiling the
identity was rejected because it lacks safe history and switching; scanning all
policy rows was rejected as an unbounded growing read; a `by_policyRef` index
with `take(2)` was selected because it proves uniqueness with fixed bounded
work and rejects a second evaluator principal.

Correction REDs reproduced API-key command refusal on a human-created
invocation and valid `rateLimit: 3` policy refusal. GREEN fixtures cover
same-principal session/API-key inspect, authorization, execute, duplicate and
trusted reconcile; immutable owner and actual command/attempt attribution;
cross-principal non-enumeration; exact policy replay, malformed and widening
refusal, one-evaluator uniqueness, digest/owner disable, redacted status; and
disabled, expired, reservation-digest or counter-digest refusal immediately
before mock-effect insertion with zero new effect and inspect/reconcile
recovery retained.

## Semantic-audit correction 2

The trusted reconciliation race required a fresh source trace because a mock
effect insert does not advance the invocation version.

| Guard mapping | Source result | Decision |
|---|---|---|
| Invocation-version CAS only | The effect ledger commits independently of invocation version, so the same expected version can accompany a changed observation | Rejected |
| Re-read in the gateway before transaction | The effect can still change after the second read and before `transact` | Rejected |
| Typed source-owned effect-row guard inside `transact` | The exact indexed effect read and reconciliation write share one Convex transaction | Selected |

The selected guard is supplied only by trusted hosted reconciliation. A
`not_released` observation requires the exact invocation, attempt and effect
generation row to remain absent; a released observation requires the canonical
source-owned observation digest to remain equal. A changed observation returns
the typed `trusted_observation_changed` refusal and writes no reconciliation
state. The generic local fixture refuses this hosted-only guard rather than
pretending to verify an effect ledger it does not own.

Focused REDs also reproduced three independent fail-open paths: initial
creation accepted a missing, digest-drifted or out-of-bounds admission counter;
execute persisted pre-release state when the current counter was inconsistent;
and parseable noncanonical policy times plus a caller-supplied pre-expiry
`recordedAt` could bypass the intended time boundary. GREEN uses one exact
counter predicate at creation, pre-release admission and effect insertion,
requiring current policy/reservation/counter digests, safe integer totals,
fixed active concurrency of one, and current total/rate bounds. Exact duplicate
creation still returns its prior result before current counter revalidation.
Policy times must be canonical UTC ISO strings with millisecond precision, and
effect expiry uses the Convex transaction clock while `recordedAt` remains only
a recorded source fact.

Local Convex race fixtures prove both orderings: effect-first refuses stale
`not_released` reconciliation and then reconciles the one existing effect;
reconcile-first refuses the delayed effect insertion. Neither ordering creates
a second attempt, effect generation or effect row. This remains source and
labelled local fixture evidence only and does not upgrade any hosted,
deployment, provider, settlement, safety or customer claim.
