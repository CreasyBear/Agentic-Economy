---
phase: 03-protocol-kernel-product-conversion
status: complete
decision_owner: Founder
updated: 2026-07-20
governing_adr: ADR-020
---

# Phase 3A — One reliable paid operation

## Outcome

Get the latest BTC price in USD from one named mock provider for no more than
$0.01 through equivalent human and structured-agent experiences.

## Implementation waves

1. Reconcile active Phase 3 authority to this narrow loop.
2. Durably separate query release, payment authorization/submission, settlement
   evidence and quote delivery.
3. Normalize exact BTC/USD output in the operation owner.
4. Project one `agentic-paid-operation:v1` semantic object through both hosts.
5. Demonstrate success, pre-release refusal, uncertainty, reconciliation,
   duplicate delivery and cold restoration with labelled local mock data.

## Product surface

The human surface is one compact operation card with progressive technical
detail. The agent surface is one typed structured contract with machine-actionable
errors and continuations. Both consume the same source-owned semantics. Chat may
host the human card, but the durable invocation owns state. Operation adapters
provide typed presentation blocks to one query-agnostic renderer; BTC/USD is
the first fixture, not a shared UI schema.

## Boundaries

No public endpoint, Convex persistence, real credential, real payment,
independent settlement, hosted evidence, provider comparison, automatic
fallback, workflow builder, booking module, standing mandate or Full autonomy
surface is added.

## Phase 3B

Phase 3B confirmed the plug-in seam with a second labelled mock provider. It
did not change the host workflow, semantic schema or query-agnostic renderer.
Uncertainty, refusal or invalid output at Provider A creates no Provider B
activity. Explicitly choosing Provider B starts a new invocation, authority,
payment identifier and attempt/effect lineage.

## Completion

Phase 3A closes only against `.planning/REQUIREMENTS.md`. Evidence remains
labelled local fixture behavior and product-comprehension proof.

## Current implementation truth

Through revision `6933fac0`, the source loop implements exact BTC/USD normalization,
durable prepared/possibly-submitted payment checkpoints, opaque custody lookup,
separate provider assertion and settlement truth, crash-replayable
payment-specific reconciliation, one query-agnostic card, and matching
structured-agent semantics. Focused source, fixture and mounted-browser checks
are green. The browser evaluation covers one atomic live region,
accessibility-tree semantics, keyboard/focus, 44px targets, 320px reflow,
declared 400% zoom emulation and reduced motion.

Phase 3A closed at revision `eec9131c` and clean tree
`1490ceea9590281d1941aa6d0955fc782f5084a9`. The focused suite passed 153
tests, the mounted browser passed seven evals, both official local packets
verified, and independent review found no unresolved P0/P1. This is local/mock
product proof only; it does not establish real payment, provider fulfilment,
hosted behavior, production safety or customer value.

Phase 3B implementation closed through `db7a8552`; the final documentation
revision is the clean evidence revision. Focused provider, selection,
reconciliation, projection and verifier suites are green. Independent review
found and caused repair of one evidence-test P1: clean-checkout refusal had
depended on ambient dirty state. No provider ranking, fallback, public route,
real payment, hosted behavior or customer-value claim follows.
