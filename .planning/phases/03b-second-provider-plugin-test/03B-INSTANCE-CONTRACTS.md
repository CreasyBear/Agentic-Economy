# Phase 3B — Exact worktree instance contracts

The parent substitutes the exact integrated base revision at dispatch. No child
starts from an earlier sibling branch. Every child reads `AGENTS.md`, the Phase
3B Context, Plan and Validation, and is told it is not alone.

## Common custody

Before dispatch, the parent records:

```text
git rev-parse HEAD
git status --porcelain=v1 -uall
test -x node_modules/.bin/vitest
test -x node_modules/.bin/tsx
test -x node_modules/.bin/playwright
```

The parent checkout is the dependency source of record. A managed worktree
without `node_modules` may create a temporary symlink to the parent checkout's
already-provisioned `node_modules` only after the parent preflight passes. It
must move that symlink to macOS Trash before handoff and prove
`test ! -e node_modules`. No child runs an install or permits package
acquisition.

Each instance may change only its listed ownership. All other paths are
forbidden. Before handoff it runs:

```text
git diff --name-only <instance-base> --
git status --porcelain=v1 -uall
git diff --check
```

An unexpected path causes an immediate stop without restore, deletion or
cleanup. The parent arbitrates. Temporary dependency symlinks must be moved to
macOS Trash before handoff.

## Instance 0 — Restore-binding prerequisite

**Runs first. Parent-managed implementation instance.**

- Base: current planning revision.
- Owns:
  - `src/modules/action-invocation/dynamic-published-snapshot-verifier.ts`
  - `tests/unit/action-invocation/dynamic-published-operation.test.ts`
- Initial red: payee, amount, scheme, network, asset and challenge mutations
  survive or lack an exact rejection assertion.
- Command:
  `npm run test -- tests/unit/action-invocation/dynamic-published-operation.test.ts`
- Exit: all mutations refuse before custody/effect activity; Phase 3A restore
  cases remain green.
- Stop: snapshot format change, new lifecycle state, or any third path required.
- Claim ceiling: focused local snapshot fixtures.

## Instance 1 — Conformance test owner

**Starts only from parent-integrated Instance 0.**

- Owns:
  - `tests/unit/capability-supply/published-operation-provider-conformance.test.ts`
  - `tests/unit/capability-supply/btc-usd-quote-result.test.ts`
- Source and all other tests are read-only.
- Initial run: existing Provider A baseline must pass.
- Permitted red: missing exact Provider B exports or A-literal source type.
- Command:
  `npm run test -- tests/unit/capability-supply/published-operation-provider-conformance.test.ts tests/unit/capability-supply/btc-usd-quote-result.test.ts`
- Exit: one provider case contract expresses both fixtures; A remains green;
  B failure is exact; no skips or conditionally weakened cases.
- Stop: A regression, source edit required, or command-truth failure.
- Claim ceiling: source inspection and focused test fixtures.

## Instance 2 — Provider B operation owner

**Starts only from parent-integrated Instances 0–1.**

- Owns:
  - `src/modules/capability-supply/btc-usd-quote-result.ts`
  - `src/modules/capability-supply/development-alternate-btc-usd-quote-result.ts`
  - `src/modules/capability-supply/development-alternate-published-operation-evidence.ts`
  - `src/modules/capability-supply/public.ts`
- All tests and Action Invocation source are read-only.
- Initial red: inherited Instance 1 Provider B failures.
- Command:
  `npm run test -- tests/unit/capability-supply/published-operation-provider-conformance.test.ts tests/unit/capability-supply/btc-usd-quote-result.test.ts`
- Exit: two strict raw schemas and independently rebuilt operations produce one
  attributable normalized result contract; tampering refuses.
- Stop: test weakening, host/schema/renderer change, provider registry,
  fallback concept, or change-budget trigger.
- Claim ceiling: labelled local provider fixtures.

## Instance 3 — Selection and non-fallback owner

**Starts only from parent-integrated Instances 0–2.**

- Owns:
  - `src/modules/capability-supply/development-provider-conformance-scenario.ts`
  - `tests/unit/action-invocation/paid-operation-provider-selection.test.ts`
- Existing Action Invocation source, components and all other tests are
  forbidden.
- Initial red: the mandatory Wave 3 matrix lacks executable scenarios.
- Command:
  `npm run test -- tests/unit/action-invocation/paid-operation-provider-selection.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts tests/unit/action-invocation/paid-operation-application-service.test.ts`
- Exit: A/B use identical commands/schema; every A failure leaves B counters
  zero; cross-use is mutation-free; explicit switch creates all-new consequence
  identities; restore substitution and evidence replay refuse.
- Stop: frozen source or snapshot format change, global selection lock,
  provider branch above development composition, or UI change.
- Claim ceiling: labelled local integration fixtures.

## Instance 4 — Evidence tooling owner

**Starts only from parent-integrated Instances 0–3.**

- Owns:
  - `tools/dev/phase-3b-provider-conformance-evidence.ts`
  - `tools/dev/verify-phase-3b-provider-conformance-evidence.ts`
  - `tests/unit/capability-supply/provider-conformance-evidence.test.ts`
- Source outside `tools/dev`, existing tests, package and planning are read-only.
- Initial red: verifier accepts at least one tampered temporary packet.
- Commands:
  - `npm run test -- tests/unit/capability-supply/provider-conformance-evidence.test.ts`
  - `node --import tsx tools/dev/phase-3b-provider-conformance-evidence.ts run /tmp/phase-3b-working.json HEAD`
  - `node --import tsx tools/dev/verify-phase-3b-provider-conformance-evidence.ts /tmp/phase-3b-working.json HEAD`
- Exit: all advertised claims are independently recomputed; tampering refuses;
  no official packet generated.
- Stop: verifier must trust booleans, raw payment material would enter packet,
  or source/test change outside ownership is required.
- Claim ceiling: development evidence-tool mechanics.

## Parent integration and final review

Instances are sequential because each consumes the parent-integrated revision
from the prior instance. The parent inspects every diff and focused result
before integrating. Only final packet verification and independent read-only
review may run in parallel after the revision is frozen.

Every instance handoff contains:

- exact base and resulting revision;
- changed paths;
- exact commands and results;
- observable provider cases and counters;
- forbidden/frozen path diff;
- additions, deletions and net lines;
- evidence class and claim ceiling;
- findings by severity;
- earliest blocker and exact next safe action.
