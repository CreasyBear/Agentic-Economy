---
name: ae-verification-gates
description: Use to choose and interpret verification for a changed AE transition. Prefer direct executable proof and preserve evidence boundaries.
---

# AE verification

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Fastest proof first

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, live
source, and focused tests. If an optional `AGENTS.md` exists, consult it.
State the changed behavior, failure mode, surface, intended effect, and
evidence class. Run the narrowest executable journey through that transition
first, inspect the named artifact or response, then expand only across
boundaries actually crossed. Proof is feedback and readiness information, not
permission to articulate the ambition.

Use the applicable minimum:

| Boundary | Direct check |
| --- | --- |
| TypeScript/domain | affected test, then typecheck |
| Convex schema/function | affected test, typecheck, authorized codegen |
| HTTP/module wiring | focused integration and response inspection |
| Module ownership | import-boundary test |
| Human/assistant copy | UI contract and rendered/serialized readback |
| Discovery/SEO | SEO contract and serialized readback |
| UI state | UI contract and relevant browser path |
| Customer Request | focused journey or development smoke |

Tests assert semantics, effects, authority, refusal, uncertainty, evidence, and
recovery. They must not lock headlines or enforce universal negative slogans.
Do not use a full suite as first diagnosis or create generated-report ceremony.
Record an exact unrelated failure, if any, without turning it into a gate.

## Evidence boundaries

Static inspection proves source shape; unit/integration tests prove declared
fixtures; labelled mock/sandbox runs prove development contracts; browser,
hosted, provider, and customer evidence prove only their named observation.
No class silently upgrades another. Keep evidence labels, receipts, and proof
ceilings in internal reports, machine/admin output, or the decision that needs
them—not in standing public hedging.

For consequential authority modes, directly prove no effect in `inspect_only`,
exact use in `approve_each`, bounded capacity, expiry/revocation/generation
fencing, atomic reservation and settlement, uncertainty holds, honest
cancellation, and step-up on material widening. For vertical outcomes, execute
the customer loop through refusal, uncertainty, and recovery; for horizontal
capabilities, run the same contract through another conformant domain.
