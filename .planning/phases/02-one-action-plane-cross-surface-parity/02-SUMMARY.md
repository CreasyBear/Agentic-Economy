---
phase: 02-one-action-plane-cross-surface-parity
status: accepted_narrowed
decision_owner: Founder
updated: 2026-07-20
governing_adr: ADR-010
---

# Phase 2 — One action plane current state

Phase 2 implemented one source-owned action plane for Request-owned human hosts
and standalone external-agent hosts. Hosts translate conversation, transport or
rendering; they do not own eligibility, authority, retry, evidence or recovery
rules.

## Current implementation

- both hosts call the same Action Invocation application seam;
- rich and structured projections derive from the same invocation and version;
- material correction invalidates stale authority and projections;
- durable source, control and attempt records reconstruct current semantics;
- host import boundaries prohibit ownership of source transition rules;
- ADR-010 Gates 1–9 have labelled local development evidence.

## Gate 10

Gate 10 is terminally `NARROW_OR_REDESIGN` for the measured PublishedOperation
class. The direct and embedded paths required equal measured human effort, so
the experience-payoff hypothesis did not pass. The comparator also had
provenance and measurement weaknesses; it is retained only as falsification
history and is not an active acceptance framework.

The architectural result remains useful: one transition, thin hosts and
semantically equivalent structured projections. No claim is made that embedding
the operation improves customer experience.

## Closeout and non-claims

ADR-010 is accepted with the Gate 10 claim narrowed. The authority, observer
and evidence-custody hardening completed at exact evidence revision
`13158022c7462a7fdae346b548f0ea272a87cefe`. No hosted,
accessibility-in-use, provider, fulfilment, customer-value or
production-safety claim follows.

Historical plans are preserved under
[`adr-009-010-pre-hardening`](../../archive/adr-009-010-pre-hardening/).
The completion contract and execution ledger are preserved under
[`pre-product-conversion-rebaseline-20260720`](../../archive/pre-product-conversion-rebaseline-20260720/).
Phase 3 consumes the shared host semantics as product projection input.
