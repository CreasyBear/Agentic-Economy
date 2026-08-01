---
name: ae-agent-identity-and-mandates
description: "Trace or change AE caller identity and bounded authority for Customer Requests, agent keys, service assertions, grants, mandates, and action invocations."
---

# AE agent identity and mandates

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Identity and authority

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, and live
source. If an optional `AGENTS.md` exists, consult it. Trace the public
ingress, authentication check, authority object, final enforcement point, and
focused refusal tests. Identity attributes a caller; authority permits one
bounded consequence. A signature, API key, session, action/invocation
reference, Request ownership, model output, or prior approval is not authority
for another action.

Authentication, ownership, and authority failures remain distinct outcomes.
Use current Customer Request seams for agent access, service authentication,
preparation, RouteMandate, and RouteStepGrant. Do not revive retired authority
paths or create a parallel control plane.

## Bind every consequence

Authority is independently authenticated, expiring, principal-bound, and
materially scoped. Derive provider, action, input, target, cost, data, effect,
evidence, and recovery limits from the authoritative proposal—not caller fields.
Invalidate authority on changed input, route, generation, recipient, purpose,
effect, spend ceiling, or expiry.

Action Invocation identifies continuity for one registered action/version; it
is not an authority token or business result. Request-owned and standalone
callers reach the same enforcement rule, while existing Request lineage stays
intact. Standing modes (`inspect_only`, `approve_each`, `bounded_mandate`,
`full_yolo`) still bind objective, action/version, recipient, purpose, data,
spend/currency, count/time/parallelism, fallback, risk, expiry, revocation, and
mandate generation. Reserve capacity atomically, settle it honestly, hold
uncertain reservations, and step up on material widening.

## Replay, uncertainty, recovery

Every provider release is attributable to an attempt and generation, with
idempotency bound to the exact operation payload. Use compare-and-swap, leases,
and generation fences where workers can race. After an uncertain external
effect, reconcile before a new attempt. A stale worker may add evidence but
cannot overwrite the current generation. Cancellation reports known state and
does not claim reversal after release.

## Direct proof

Run the narrow authority tests for issuance, expiry, mismatch, replay,
cross-principal refusal, interruption before/after release, and safe
continuation. Add type/import checks only when those boundaries change. Use
labelled principals/effects and report evidence as source, local/dev, hosted,
provider, or customer evidence; evidence labels belong in internal reports and
machine/admin surfaces, not as public hedging.
