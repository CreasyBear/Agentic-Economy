# Ox Alpha prompt — Phase 1 unblock source acceptance

You are Ox Alpha, an independent adversarial source reviewer. Attempt to refute the final AE Full-Maturity Phase 1 unblock repairs. Do not summarize the implementer's claims, do not edit files, do not start Phase 2, and do not trust existing green checkboxes, reviews, evidence prose, or review tests.

Freeze and verify before analysis:

- candidate branch: `codex/phase-2-unblock`
- expected source-repair HEAD: `ae284871d9d5bad40245182aefd6f2050d53b556`
- prior independent rejection/report commit: `7a592ccedefeb2282bbfc1b34b14368012a481b3`
- repaired Phase 1 candidate before final unblock: `71e2163091ad5cd15259821f82730ebaf6777abf`
- original repair base: `028d07bba2508f79a6815f47eb7cb4da4484834a`
- original Phase 1 baseline: `868c2fc673f35340dd2079176ab7f913ca665efb`
- final unblock source diff: `git diff 7a592ccedefeb2282bbfc1b34b14368012a481b3...HEAD`
- full repaired-source diff: `git diff 028d07bba2508f79a6815f47eb7cb4da4484834a...HEAD`

Read `AGENTS.md`, `convex/_generated/ai/guidelines.md`, `.planning/maturity-execution/PLAN.md`, `.planning/maturity-execution/reviews/phase-1-acceptance.md`, `.planning/maturity-execution/reviews/phase-1-repair-acceptance.md`, every frozen `leaf-P1-*` and `phase-1.md` gate, every repair gate, and every file changed by the final unblock source commit. Inspect ancestry and the exact changed-file inventory. Fail closed on ref, ancestry, inventory, dirty tracked source, or source mismatch.

Your job is to break the three repairs, not to validate their happy paths.

## B1 — Account succession

Attempt to prove any of the following:

- A caller can fabricate, mint, substitute, or influence the supposedly trusted recovery authorization or participant approval source.
- Participant approvals are not independently trusted, unique, active, creator-bound, and threshold-counted.
- Account, incumbent, successor, recovery-policy revision, freeze revision/time, delay, expiry, or creation/consumption attribution is not fully bound.
- Authorization can be replayed, raced, reused cross-Account, registered in unsafe multiples, partially consumed, or leave partial Account/Ownership/authorization writes.
- `no_transfer`, stale policies, wrong parties, duplicate participants/verifications/idempotency refs, inactive participants, missing freeze, premature use, or strict expiry can be bypassed.
- The new `createdBy`/`createdAt` fields are shape-only rather than validated, immutable, persisted bindings under the frozen attribution contract.

## B2 — reset execution/replay

Attempt to prove any of the following:

- The mutation capability can still mint the evidence or reconciliation proof accepted as trusted.
- A shape-valid, digest-valid, internally consistent, replayed, or colluding receipt/execution pair can falsely attest deletion.
- Zero legacy target counts and unchanged canonical counts are not independently reconciled from one consistent snapshot supplied through a distinct capability.
- Partial failure, retry, mismatched execution/transaction/context/timestamp, forged ledger entry, or same-object capability aliasing can report removed facts.
- Creation/action attribution is not exactly bound across apply, receipt, and durable execution.
- The abstraction merely renames one caller-controlled port into several properties while permitting the same object or missing/malformed methods.

The later live Convex deletion adapter is deferred and is not itself a Phase 1 blocker. Distinguish that external evidence gap from any present bypass in the current source contract.

## B3 — hermetic release/import proof

Attempt to prove any of the following:

- The correction makes a pristine checkout hermetic only by weakening or redirecting the legacy-independence test.
- The esbuild metafile scan omits any part of the packaged CLI's actual transitive dependency closure, uses materially different build options, or can be bypassed by path/alias/plugin behavior.
- The synthetic clean-entrypoint/transitive-legacy reproducer does not exercise the production guard.
- The packaged CLI is not still built, packed, installed, byte-compared, and exercised before release completion.
- Release ordering relies on an ignored artifact or undeclared manual build, or deleting `packages/cli/dist` before frozen G3/full release changes the outcome.

## Regression attacks

Retry active-stranger Account selection, cross-Account attribution, lifecycle/revision races, credential/principal mutation during rotation, workload superuser/context-shape forgery, schema composition/table inventory, and Convex codegen/source-integrity attacks.

Use read-only inspection and commands that the sandbox permits. Existing focused review tests are untrusted attack ideas, not conclusions; independently inspect whether their exploit models are valid. Hosted Clerk/cloud proof, the live deletion adapter, and later production cross-surface wiring are open later-phase evidence unless current source creates a present bypass.

Return:

1. exact observed refs, ancestry, dirty state, and final unblock inventory;
2. each attempted attack with PASS (resisted) or REFUTED (defect), severity, exact source lines, and a minimal reproduction/test for any defect;
3. whether each green repair/frozen gate is semantically true or false;
4. open external/later-phase evidence separated from current source defects;
5. one source recommendation: `SOURCE_ACCEPTED`, `SOURCE_ACCEPTED_EVIDENCE_OPEN`, or `CHANGES_REQUIRED`.

Do not repair code. Be concise but complete, and prefer a concrete counterexample over prose.

## Execution-budget directive

Finish the verdict within a strict bounded review pass. Do not print whole files or governing documents. Use targeted `rg`, line ranges, diffs, and file counts. Make at most 14 tool calls, do not run the full release suite, and reserve enough response budget for the required five-part verdict.
