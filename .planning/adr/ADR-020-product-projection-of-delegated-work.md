# ADR-020: One reliable paid operation as the first product projection

## Status

Accepted for labelled local implementation

## Date

2026-07-20

## Context

ADR-009 and ADR-010 established Action Invocation control and shared human and
agent host semantics. The first product projection must show why that machinery
matters without making a mandate dashboard, workflow builder or protocol
console the product.

The existing development PublishedOperation supplies one proportionate test:
get the latest BTC price in USD from one named mock provider for no more than
$0.01. It combines public-data release, payment exposure, provider uncertainty
and a useful result while remaining small enough to understand end to end.

Source review found that x402 challenge, authorization and paid dispatch were
too compressed: a crash or unusable response could lose whether payment was
possibly submitted. Product projection is therefore blocked until those facts
are durable and independently represented.

## Decision

Phase 3A projects one standalone `approve_each` BTC/USD operation through one
shared versioned semantic object and two equal surfaces:

- a compact human operation card in customer language;
- a structured agent contract with typed errors and continuations.

The human renderer is query- and operation-agnostic. Chat may host it, but
chat does not own operation state. Operation-owned adapters translate their
material input and normalized result into a closed typed block vocabulary;
the shared renderer owns lifecycle presentation only. Models do not generate
components or executable UI. BTC/USD remains the first operation fixture, not
a shared schema or component specialization.

The operation binds authority to the exact principal, input, provider revision,
endpoint, price, payment target and invocation generation. It executes once.
Reload and duplicate delivery resume the same invocation.

The source of truth distinguishes:

1. query/data release;
2. payment authorization creation;
3. possible paid-request submission;
4. settlement evidence;
5. quote delivery and validation.

Payment preparation and possible submission are durably checkpointed. Raw
credentials, signatures and payloads remain in an injected custody boundary
and never enter snapshots, projections, logs or evidence packets. Any unusable
outcome after possible paid submission requires attributable reconciliation
before another authorization.

BTC/USD normalization remains operation-owned. Generic Action Invocation and
hosts consume the normalized result without parsing provider-specific payloads.

## Product contract

```text
ask → inspect exact offer → authorize exact consequence → execute once
    → return normalized result or preserve uncertainty
    → reconcile → expose only a safe continuation
```

Both projections must let their caller determine the provider, material input,
maximum charge, information released, payment/result state, evidence class and
only safe next action. Protocol vocabulary stays in protected detail.

## Phase boundary

Phase 3A uses one allowlisted mock provider and labelled local execution only.
It does not add a public endpoint, Convex persistence, real credentials,
independent settlement, hosted evidence or a production claim.

Phase 3B may add a second provider only as a plug-in and normalization test.
Provider material remains operation-owned. Automatic fallback is prohibited
while the first provider is uncertain, and changing providers creates a new
invocation, authority and charge boundary.

## Acceptance

ADR-020 closes for Phase 3A when:

- possibly submitted payment can never become an ordinary retryable refusal;
- payment preparation/submission survive process loss without duplicate signing
  or dispatch;
- quote delivery and settlement evidence remain separate;
- exact BTC/USD output is normalized and validated by its operation owner;
- human and agent projections share one semantic object and digest;
- mock provenance survives restoration;
- focused adverse-state, accessibility and comprehension evals pass; and
- independent review finds no unresolved P0/P1 inside the local mock boundary.

## Rejected alternatives

**Broad delegated-work dashboard first:** rejected because one paid call does
not earn mode selectors, mandate summaries, work sequences or global Activity.

**Multi-provider first:** rejected because comparison and fallback would obscure
whether one paid-operation loop is truthful.

**UI mock before payment truth:** rejected because it would polish states the
source cannot yet distinguish.

**x402-branded customer flow:** rejected because the rail is adapter detail, not
the customer task or reusable product primitive.

## Consequences

The reusable result is a reliable paid-operation loop, not a crypto module or
universal provider lifecycle. Broader authority modes, workflows and autonomous
composition remain product direction under ADR-019 but are not Phase 3A
acceptance.

Completion proves labelled local mechanics and comprehension only. It does not
prove settlement, provider fulfilment, customer demand, deployment or
production safety.
