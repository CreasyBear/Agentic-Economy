---
name: ae-public-copy-guardrails
description: Use for public human copy, assistant-visible action descriptors, discovery files, metadata, and machine-readable AE claims. Keep wording aligned with current source and the safe action boundary.
---

# AE public copy

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Ground truth

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, and the
live source and intended surface. If an optional `AGENTS.md` or design guide is
present, consult it; never treat an absent historical document as a gate.
Separate the destination promise from what the current adapter can execute and
what its evidence proves.

Name the audience, surface, operation, responsibility, and decision-relevant
evidence. Gaps are engineering work, not reasons to weaken the destination.

## Human copy

Lead with the customer's task, useful result, and next action. State who
reviews, confirms, pays, acts, or owns the next commitment. Sell the outcome
confidently; do not put qualification in the headline or body. Put one
limitation, uncertainty, refusal, or recovery instruction at the exact
decision/effect where it changes what the person should do.

Keep protocol, custody, routing, and evidence machinery out of human copy
unless a protected diagnostic or builder surface needs it. Translate state into
ordinary customer language. Never use a repeated blanket disclaimer as a truth
mechanism.

## Machine and action copy

Machine descriptors use exact current routes, action IDs, schemas, effects,
authority, evidence class, replay behavior, and recovery. Registration or a
listing is discovery inventory, not proof of reachable supply. A receipt proves
the named receipt event, not fulfilment; a published listing proves published
facts, not availability. Use `verified` only with a named standard and
reference. `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, and `NEXT_STEP` belong to
machine/admin output, not ordinary human pages.

Action `summary` names the observable result. `boundaries` state responsibility,
approval, unsupported effects, failure behavior, and safe continuation once at
the decision point. Keep human and machine projections semantically aligned
without leaking private fields or inventing effects.

## Verification

Inspect rendered or serialized output, not only source strings. Use the
narrowest focused check for the changed transition, then the relevant UI/SEO
contract check when that boundary changed. Tests assert responsibility,
effects, refusal, uncertainty, evidence, and recovery—not frozen phrases or
universal negative slogans.
