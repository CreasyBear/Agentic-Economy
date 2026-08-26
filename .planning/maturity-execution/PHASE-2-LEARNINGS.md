# Phase 2 durable learnings

This file is the in-progress Phase 2 extraction. It does not claim phase acceptance
and will be reconciled at the internal handoff.

## Decisions

### Runtime authority evidence is a per-handler control-flow proof

A reachable canonical sink and a representative sink matrix do not prove that a
registered handler has no pre-sink effect or alternate bypass. Phase 2 evidence is
keyed by exact registration, handler, effect path and case. Sink-level results are
derived summaries only.

**Rationale:** The first 242-row map copied 27 representative sink tests across 207
protected surfaces. `saveOwnerOfferingServer` alone demonstrated the gap: five
effect dispatches were reduced to one selected sink path and assigned another
handler's query test.

**When to use:** Every cross-surface authorization, recovery, secret, payment,
callback, job, cron and reconciliation proof in this and later phases.

**Source:** `PHASE-2-RUNTIME-DOMINANCE-DESIGN.md`; independent Phase 2 runtime
mapping verifier, 2026-08-26.

## Patterns

### Adversarial fixtures must assert the intended semantic diagnostic

A fixture is not covered merely because a rule reports something. Bind each
hostile source to the exact message identity, capability or target, and intended
invariant. Keep adjacent lower-level diagnostics as separate regressions so they
cannot satisfy a higher-level protected-seam claim by accident.

**When to use:** Authorization, provenance, isolation and recovery checker suites
where one source can violate more than one structural rule.

**Source:** Phase 2 authority-foundation independent verification; deduplicated
into `AE-PAP-002`, 2026-08-26.

### Stop bounded structural rules at a fail-closed syntax grammar

Local alias or dataflow inference is the boundary where a structural rule starts
becoming a bespoke analyzer. Declare the finite supported forms, reject aliases,
casts, dynamic selection, context escape and other unsupported syntax with one
diagnostic, and refactor production source into the supported shape. Do not add
cross-file inference or recursive alias tracking to make a red row look supported.

**When to use:** The Phase 2 Convex authority-entry rule and any later bounded
registration or middleware conformance rule.

**Source:** `PHASE-2-RUNTIME-DOMINANCE-DESIGN.md`; Phase 2 foundation architecture
guardrail; deduplicated into `AE-PAP-002`, 2026-08-26.

### Design the proof before expanding a cross-surface repair

When a verifier refutes the measurement model itself, pause source changes. Freeze
the exact property, inventory, control-flow model, failure rules, finite acceptance
criteria and blast radius; have a fresh read-only verifier challenge that design;
then resume the existing gates without resetting their evidence.

**When to use:** Any generated inventory/matrix whose apparent coverage can be
created by projection, reachability or representative sampling.

**Source:** root Phase 2 process correction, 2026-08-26.
