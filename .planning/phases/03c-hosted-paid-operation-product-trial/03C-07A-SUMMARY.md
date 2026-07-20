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
