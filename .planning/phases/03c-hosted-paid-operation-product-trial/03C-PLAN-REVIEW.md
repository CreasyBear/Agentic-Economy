# Phase 3C one-pass plan review

**Disposition:** reconciled once, then IA-realigned by founder direction; awaiting founder acceptance  
**Scope:** protected hosted BTC/USD labelled-mock sandbox trial

Four bounded reviews were applied once: CEO, engineering, developer
experience, and agent operability. No review loop follows this reconciliation.

## Accepted findings

- The hosted mock effect path now has an explicit owner and transaction tape:
  custody prepared, prepared persisted, submission-started persisted, labelled
  mock release, then durable result or uncertainty.
- ADR-021 must resolve the Convex identity bridge from source evidence. Caller
  ownership is forbidden; an unavailable trusted bridge or credential owner is
  an execution blocker.
- Trial admission is separate from consequence authority and is bounded by an
  evaluator allowlist, kill switch, and atomic principal count, concurrency,
  and rate limits.
- Full aggregate reconstruction is bounded, ordered, exact, paginated, and
  refreshed after each mutation before projection.
- `/` remains canonical and unchanged. `/actions/paid/new` is protected
  evaluator-only Sandbox setup; `/actions/paid/:invocationRef` is reusable paid
  Action Detail. Setup and provider selection stay outside the shared card.
- Public reconcile is intent-only; trusted evidence is internal. Evidence class
  is runtime-supplied, and only successful Plan 07 readback may claim hosted.
- Genericity is limited to query/provider variation within paid operations.
- Closure classifies paid-owned/trial-only/candidate-shared residue and proves
  removal/import boundaries before any later promotion.
- The forward golden tape and named goblin branch/rejoin/stop matrix are
  independent acceptance contracts.
- Public reconciliation carries intent, command ID, and expected version only.
  Trusted evidence remains server/operator-side.
- Human and structured-agent evaluator instructions, an independent
  comprehension cohort, packet CLI, typed rescue registry, observability, and
  custody/integration protocol are explicit deliverables.
- Deployment remains a blocking discovery and authorization checkpoint. No
  command, target, identity, or rollback path may be guessed.

## Review outcome

The seven-plan, seven-wave sequence is retained. Scope did not expand into real
payment, provider onboarding, market activation, comparison, fallback,
workflow composition, dashboards, or production operations. Every implementation
plan references `03C-AGENT-RUNBOOK.md` and retains exact ownership, forbidden
paths, REDs, focused commands, stop conditions, evidence ceiling, and expanded
handoff.

No implementation, deployment, Convex call, credential use, staging, or commit
is authorized by this review.

## Founder pre-execution reconciliation

This bounded reconciliation supersedes earlier conflicting wording without
changing the seven-wave substance.

| Boundary | Before | Reconciled authority |
|---|---|---|
| Public reconciliation | Some UI text implied caller evidence envelopes | External body is exactly command, commandId and expectedInvocationVersion; trusted evidence is internal/server-operator only |
| Evidence timing | Local UI text predeclared hosted evidence | Plans 01–06 remain source/local labelled sandbox; only successful authorized Plan 07 readback may claim hosted |
| Genericity | Broad operation-agnostic wording | Query/provider agnostic within paid operations only; no non-paid Action compatibility claim |
| Surface split | Sandbox entry risked becoming product IA | `/` unchanged canonical; `/actions/paid/new` evaluator-only setup; `/actions/paid/:invocationRef` reusable paid Action Detail |
| Card/host | Typed ownership and ordering were partly implicit | Plan 04 freezes host inputs; Plan 05 renders locked order and states without setup/provider logic |
| Closure | Trial residue had no retirement contract | Every artifact classified; removal/import gate, retention, kill switch, residual records and retirement trigger close Phase 3C |
