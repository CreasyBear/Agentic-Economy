---
name: ae-agent-journey-testing
description: Evaluate AE as a cold external agent and as the person relying on it: discovery, Customer Request navigation, interruption, recovery, parity, and customer value.
---

# AE agent journey testing

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Fastest executable journey first

Start with one ordinary customer job from the public AE origin. Read
`.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, the live
discovery/Request surfaces, and
`references/proof-contract.md`. If an optional `AGENTS.md` exists, consult it.
Name revision, deployment, environment, supply, caller identity, authority
stop, permitted effects, and baseline. A gap in the current journey is an
engineering task, not a reason to rewrite the destination.

For development, run labelled mock/sandbox supply through the real application
seam, including the changed refusal, interruption, uncertainty, or recovery
state. For a cold hosted run, give only the public origin, ordinary-language
job, authorized credential, and comprehensible customer answers. For a value
claim, compare the same job without AE using real customers and independently
operated supply.

## Cold-agent contract

The caller discovers the current machine surface, creates one Request, follows
only `navigation.actions` returned by the latest response, asks for facts
needed by registered contracts, sees customer-semantic state, stops at explicit
authority, and resumes the same Request after interruption. Exercise
cancellation when in scope. Never use source imports, direct Convex calls,
privileged records, fixture IDs, or a scripted transcript as the journey.

Judge both actors:

- **Agent:** can it discover, interpret, navigate, retry, and resume without
  private knowledge?
- **Person:** does it receive enough to compare options and explain cost, data,
  uncertainty, authority, progress, and recovery without routing machinery?

Stop before an unapproved real-world effect. A receipt or technically valid
exchange proves only its named event; it does not prove fulfilment or customer
value.

## Report and proof

Lead with the customer outcome and first break. Record the public paths,
transitions, questions, options, authority stop, interruption/resume result,
readback, baseline, and claim boundary. Keep evidence classes—source,
fixture, local/dev, hosted, cold-agent, provider, or customer—inside internal
reports and machine/admin diagnostics, never as a standing public caveat.

Use focused tests/evals and the smallest journey smoke that crosses the
changed boundary. Record an exact earliest failure; do not build generated
report bureaucracy or turn unrelated broad-suite failures into a gate.
