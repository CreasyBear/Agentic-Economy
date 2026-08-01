---
name: ae-agentic-routing-and-discovery
description: "Implement or review AE discovery, candidate selection, Customer Request routing, partial-entry composition, and route/action projections."
---

# AE routing and discovery

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Trace the customer job

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, live
source, and focused tests. If an optional `AGENTS.md` exists, consult it.
Trace one ordinary job from its intended surface to its authoritative owner:
registry/discovery, admitted capability supply, or
`/api/v1/requests*` → server adapter → Customer Request application. Older
Answer Thread/harness paths are migration inventory unless the live trace names
them. Record the current evidence class; a target is not a reachability claim.

## Preserve routing truth

Routeable supply requires the admitted business, exact capability contract,
offering, binding, eligibility/publication, credentials, and readiness evidence.
Keep these distinct:

- discovery inventory, recommendation, eligibility, provider acceptance;
- identity, bounded authority, dispatch attempt, external outcome;
- stale/unresolved evidence, refusal/failure, technical completion, customer
  value.

The neutral compiler and action plane consume domain contracts and adapters.
A conformant business swap must not add host business rules or a second compiler,
authority path, attempt lifecycle, or recovery state machine.

## Extend the source seam

Customer Request owns objectives, decomposition, facts, revisions, proposals,
decisions, and durable resume. One independently useful consequential operation
belongs in the registered action seam and may be controlled by Action
Invocation. Bundle/Request references completed invocation/result identities but
does not copy authority, attempts, evidence, or recovery.

For partial entry preserve discriminated lineage (`request_owned`, `standalone`,
later `bundle_owned`); a standalone task never fabricates a Request or inherits
its authority. Hosts only render or transport authoritative state.

## Prove continuation

Run the fastest focused journey through the real seam, including whichever
non-happy state the change affects: no candidates, missing information, bounded
approval, stale option, provider refusal/timeout, interruption before/after
release, outcome unknown with reconcile-before-retry, honest cancellation, or
cold resume. Every projection preserves facts, material consequences,
authority, evidence, and safe continuation. Tests are feedback; unrelated broad
failures are not a cleanup gate.
