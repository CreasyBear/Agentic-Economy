# ADR-020: Product projection of delegated work

## Status

Proposed

## Date

2026-07-20

## Context

ADR-009 and ADR-010 established a hardened Action Invocation control plane and
shared host semantics. ADR-019 established Inspect only, Approve each, Bounded
mandate and Full autonomy as the product destination.

The customer interface remains a careful Request-centric
compare/confirm/start experience. It does not expose the current mode, material
mandate, consumed authority, standalone actions or mandate-level intervention.
Exposing autonomous modes through that interface would make correct kernel
behavior operationally opaque.

The conversion must not make protocol machinery the product and must not reduce
autonomy to repeated confirmation screens.

## Proposed decision

Project Request-owned and standalone actions into one source-owned customer
work model led by the objective and current work:

1. **Work header** — objective, public mode label, attention state, current
   action/business, material commitment and intervention entry.
2. **Mandate summary** — permitted actions/recipients/data/purpose, validity,
   spend/count/concurrency/loss consumption, fallbacks and exclusions.
3. **Work sequence** — action-specific rows with canonical effect and recovery
   states. Unresolved external work dominates overall completion.
4. **Action detail** — consequence, amount, shared information, authority,
   attempt disposition, evidence class and safe continuations, with protocol
   detail protected behind operational disclosure.

Pause new work, revoke future authority and request provider cancellation are
distinct commands with distinct durable outcomes.

The first slice exposes Inspect only, Approve each and Bounded mandate around
one labelled development operation. Full autonomy is visible but unavailable
until multi-action fallback and exception-only step-up pass.

## Invariants

- Projections derive from source records, never transcript or component memory.
- Request-owned and standalone lineage remain discriminated.
- No command is enabled from stale generation or stale authority.
- Authority already granted is not requested again.
- Uncertainty is not failure and never enables blind retry.
- Revocation does not imply reversal of released effects.
- Mock/sandbox evidence remains visibly labelled after navigation and restore.
- Technical vocabulary stays in builder or protected operational detail.

## Alternatives rejected

**Reskin the existing Request workflow:** preserves Approve-each as the only
structural model and cannot represent standing authority or standalone work.

**Relabel Repeat Permission:** it authorizes repeated confirmation of one exact
choice and does not express the broader mandate boundary.

**Lead with a mandate dashboard:** delegated work is the product; mandate
information is persistent but subordinate.

**Expose Full autonomy first:** combines projection, multi-action fallback and
exception-only step-up before the narrower contract is proven.

## Acceptance

ADR-020 may become accepted when Phase 3 demonstrates `.planning/REQUIREMENTS.md`
and independent review finds no unresolved P0/P1 inside the labelled local
product-proof boundary.

## Consequences

Phase 3 is a product-projection phase, not a kernel rewrite or styling pass.
Activity becomes first-class product information. Existing consequence,
uncertainty and cancellation language is reused where truthful. Hosted and
production exposure remain separate decisions.
