# J6 · Owner activation

**Status:** designed · Wave 2, leads GTM — J3 precondition <!-- stupid-shit: S2 -->
**Promise:** “I claimed my page and requests reach me.”

## Identity

- **Journey ID:** J6
- **Canonical path:** `/claim` → publish → verify request destination → owner-status readback → first admitted request → J4.
- **Supply-gate identity:** activation is the owner-controlled path that can make one business an admitted R1 target; publication alone is not admission.

## Status

**building — admission core landed** (2026-07-14, commit 6fe81bbc). `R1TargetAdmitted` is real, versioned (`r1-target-admitted:v1`), fail-closed code: enforced at target resolution AND re-evaluated atomically at send commit (drift → typed conflict, zero partial writes). Convex loader defect fixed (claims.status mapping — unclaimed businesses could previously receive sends). Owner status page shows canonical blocker readback as actionable todos. Public routes derive the ask affordance from the same predicate. v1 proof class = claimed_owner + resolvable recipient; destination VERIFICATION deliberately deferred (no source mechanism) as the named strengthening step. Remaining for J6 complete: CS1 reply-by-email ingestion, real-owner activation proof (0/5 real owners — code cannot fix this), first admitted-send ship test end-to-end with a real owner.

## Persona proof

- **Primary:** OwnerPlumber — remove the sign-in cliff and make channel viability obvious.
- **Contract proof:** C6 — unclaimed or unroutable businesses can never receive sends.
- **Walkout repaired:** G8 owner re-entry and triage; CS1 makes email the on-ramp rather than forcing portal use.

## Ship test

A blind owner claims and publishes a page, adds and verifies the destination, sees each `R1TargetAdmitted` input and refusal reason on Business status, fixes the named blocker, receives the first request by email, replies to that email, and sees AE ingest the reply into the same record.

## Pages & views

- `pages/claim.md` — truthful page fields, request posture, optional indicative pricing, review, and publish.
- `pages/owner-status.md` — explainable publication, destination, suppression, delivery, and `R1TargetAdmitted` readback.
- `pages/owner-settings.md` — destination verification, request availability, suppression, and reply-channel settings.
- `pages/owner-inbox.md` — power surface and recorded inbound-email projection.

## Stage map

1. Enter claim with only allowed identity/location prefill; URL data never authors readiness.
2. Enter public facts and optional owner-published indicative pricing.
3. Review and attest the exact public projection; publish the page.
4. Add and verify an owner-controlled request destination.
5. Read `R1TargetAdmitted` as explicit inputs, current values, refusal reason, and one corrective action.
6. Re-check admission atomically; show admitted only when every C6 predicate holds.
7. Deliver the first request by email with the request content and safe reply route.
8. Owner replies by email; AE ingests it as an attested event and projects it into J4.

## Kernel dependencies

- **K8/C6:** queryable, explainable capability-admission registry: published page ∧ verified destination ∧ claimed owner with resolvable recipient ∧ not suppressed ∧ readiness.
- **R1TargetAdmitted legibility:** expose every predicate input, authoritative value, what it proves, last transition, typed refusal, and next owner-controlled correction; never collapse this to a score or vague `Ready` badge.
- **CS1:** inbound-email ingestion, correlation to request/record, sender and timestamp attestation, duplicate handling, and safe failure projection.
- **K3/K4:** delivery evidence, outbox events, owned verification clocks, and cessation/suppression truth.

## Open items

- Specify inbound-email admission, threading/correlation, attachment policy, and spoof/refusal taxonomy.
- Define destination verification freshness and re-verification clock.
- Define atomic admission readback and commit-time recheck fixtures.
- Define reply-email fallback when correlation is missing or the sender is unauthorized.
- <!-- stupid-shit: S2 --> Claim-conversion is the launch bottleneck metric.

## Hedge & common-sense checklist

- **CS1:** notification email contains the request and accepts a reply; portal is the power surface, email is the on-ramp.
- **CS3:** claim offers an optional indicative price such as `Callout from $90`; render it business-attested and dated.
- If no price is published, show reply posture or nothing. Never “Business will quote.”
- At the customer send decision point only: `Price is confirmed by {business} in their reply`.
- Do not stack publication, availability, delivery, or outcome caveats. Replace ambient hedges with the exact failing fact and correction.

## Re-run gate

Re-run OwnerPlumber plus the J3/J4 cross-actor walk. Pass only when the owner can move every admission blocker through visible actions, status matches the commit-time predicate, email reply completes the first-response loop, and neither a second sign-in nor hidden portal knowledge is required.
