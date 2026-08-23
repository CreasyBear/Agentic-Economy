---
status: accepted_narrowed
date: 2026-07-17
accepted: 2026-07-20
decision_owner: Founder
review_by: 2026-08-17
exposure: blocked_pending_product_projection
---

# Use one action plane across human and agent experiences

## Decision

AE's embedded human experience and external calling agents use the same
registered actions and authoritative work records. Conversation, transport and
rendering adapters may gather or present information; they do not own
eligibility, comparison, authority, execution, retry, evidence or recovery
rules.

Human and external-agent hosts require semantic outcome parity rather than
identical presentation. For the same invocation and version they preserve:

- source, business information and freshness;
- supported operations and required information;
- suitability and comparison;
- authority, consequence and data release;
- attempt, idempotency and retry meaning;
- evidence, refusal, contradiction and uncertainty;
- continuations and final disposition.

Rich and structured projections derive from durable source, control and attempt
records. Transcript and component state are never durable product truth.

## Accepted architecture

- one Action Invocation application seam serves both origins and hosts;
- source-owned contracts own business and control transitions;
- host imports are restricted to public application and projection seams;
- material correction advances the invocation version and invalidates stale
  authority, projections and attempts;
- restarts reconstruct the same semantics without transcript or process memory;
- host limitations may reduce presentation or mark work unsupported, but may
  not change consequence or authority meaning.

## Gate disposition

Gates 1–9 have labelled local development evidence for the selected generic
PublishedOperation: shared transition, thin hosts, semantic projections,
correction invalidation, reconstruction, uncertainty and equivalent
continuations.

Gate 10 is `NARROW_OR_REDESIGN` for the measured class. The direct and embedded
paths required equal measured human effort, so no embedded-experience payoff is
accepted. The comparator also had provenance and metric weaknesses; it is
preserved as falsification history and retired from active acceptance.

ADR-010 is accepted with this product claim narrowed. Exposure remains blocked
until authority validation, observer isolation and exact-revision evidence
custody pass. No accessibility-in-use, hosted, provider, fulfilment,
customer-value or production-safety claim follows.

## History

Inquiry and booking were earlier parity targets. Founder direction selected a
generic business-published operation and rejected booking as a mandatory AE
bounded context. Git history preserves the complete pre-hardening ADR and
amendment history.
