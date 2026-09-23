# Engineering quality and security audit

## Executive summary

Static source review and bounded high risk tests found a pre-alpha blocker: Formance reservation uncertainty marks a Call as reconciliation-required but does not initialize the indexed automatic reconciliation record, so the sweep cannot select it. A separate before-E2E high defect is missing HTTP rate-limit admission on the public Tool/Quote/Call/recovery routes. The lower Convex call policy is a budget/spend control, so it does not protect quote, read, or recovery request volume. Add both controls before release validation.

The call and money seams otherwise show strong exact identity, authority, idempotency, bounded body, unknown-outcome, and guarded-network controls. One seller-canary proof path still uses an unbounded Convex `.collect()` over attempt history; this is a later scaling concern if retry/re-arm policy permits histories beyond transaction limits. Full gate/E2E and hosted runtime behavior remain unverified by scope.

## Findings

### E-1 — Paid Call and recovery HTTP surface has no rate-limit admission

- **Severity/readiness/class:** high; before-e2e; defect.
- **Evidence (static; current-tree recheck):** `src/routes/api.v1.tools.call.ts:9-13`, `src/routes/api.v1.tools.quote.ts:6-10`, `src/routes/api.v1.calls.ts:9-13`, `src/routes/api.v1.calls.$callRef.ts:9-13`, `src/routes/api.v1.calls.$callRef.cancel.ts:9-13`, and `src/routes/api.v1.calls.$callRef.reconcile.ts:9-13` still dispatch directly to `call-api` handlers. Current shared request middleware in `src/start.ts:101-112` has no rate-limit admission. The available layers remain `withHttpRateLimit` in `src/lib/server/rate-limit.ts:96-105`, policy definitions in `src/modules/security/rate-limit-policy.ts:34-46,53-70`, and Convex `rateLimit:admitHttp` mutations in `convex/rateLimit.ts:33-59`, but none is invoked by these routes. The existing `src/routes/api.v1.registry.ts` catalogue route wraps its handler with `withHttpRateLimit`. `sourceWriteAdmissionFromRequest` authenticates a signed command but does not consume an HTTP bucket. The lower Convex policy at `convex/lib/callLifecycle/admission.ts:418-444` governs call reservation budget/spend, not HTTP request rate, and does not cover quote, status/list, cancel, or reconcile traffic.
- **Trigger/consequence:** a valid agent credential can repeatedly hit quote/call/status/list/cancel/reconcile. The call path performs Convex actions and may enqueue provider/money work, while the intended `public-mutation`/`public-read` HTTP policy is never consulted. This expands abuse, cost, queue pressure, and recovery churn per credential/IP outside the separate call budget.
- **Smallest corrective direction/tradeoff:** wrap these route handlers with `withHttpRateLimit` using an explicit policy (likely `public-mutation` for quote/call/recovery and `public-read` for status/list), preserving the authenticated operation inside the callback. This adds one admission round trip per request and requires route tests for 429/headers.
- **Confidence:** 0.99 static; runtime bucket behavior not exercised.

### E-2 — Safe seller-canary proof has a potential unbounded-history scaling path

- **Severity/readiness/class:** low; later; design-debt.
- **Evidence (static):** `convex/lib/callLifecycle/dispatch.ts:534-557` queries `actionExecutionAttempts` by execution reference and calls `.collect()`, then sorts and validates every attempt to establish the no-effect proof. The Convex guidance requires bounded/paginated reads for potentially growing result sets; the canonical attempt reader itself uses `.take(readLimit(args.limit))` at `convex/actionExecutionControl.ts:250-255`.
- **Trigger/consequence:** if the existing retry/re-arm policy permits a canary's attempt history to grow beyond Convex read/return/transaction limits, the proof transaction can fail or degrade despite a valid safe state. This could strand a call in retryable/manual recovery and prevents predictable bounded operations; this audit did not establish that reachable growth is currently unbounded.
- **Smallest corrective direction/tradeoff:** make the proof bounded by a persisted attempt count/maximum or paginate with an explicit cap and fail closed when history is incomplete; retain a digest/count invariant so omitted history cannot be mistaken for proof. A strict cap may route unusually long histories to manual review.
- **Confidence:** 0.78 static potential; reachable limit breach needs confirmation of retry/re-arm caps and a large-history fixture.

### E-4 — Formance reservation uncertainty bypasses the automatic reconciliation queue

- **Severity/readiness/class:** high; before-alpha; defect.
- **Evidence (static):** `convex/moneyManagedCall.ts:253-278` marks `formanceFinancialState` as `outcome_unknown`, `state` and `dispatchState` as `reconciliation_required`, and records reconciliation evidence, but does not set `reconciliation`. Callers at `convex/lib/callLifecycle/callActions.ts:374-387` use this transition for a completed reservation-attach conflict or `booked.kind === 'outcome_unknown'`. The initializer at `convex/lib/callLifecycle/reconciliation.ts:163-174` is only reached by the separate record/project/claim/finalize/cancel/complete wrappers (`:176-229`); the due-candidate query (`:233-253`) requires `reconciliation.nextAttemptAt`, and the worker (`convex/capabilityCallWorker.ts:167-240`) consumes that query.
- **Trigger/consequence:** an ambiguous Formance reservation or attach leaves the Call visibly reconciliation-required but without an automatic lease/next-attempt record, so the sweep cannot select it. Funds can remain held and recovery becomes manual despite an automatic reconciliation state.
- **Smallest corrective direction/tradeoff:** initialize the reconciliation record atomically in this transition, or route through the initializer while preserving evidence and reason; add a due-candidate regression test. This adds one small write and keeps rare uncertainty on the bounded automatic path.
- **Confidence:** 0.97 static; omission follows from the indexed candidate predicate, while a live queue/lease transition remains untested.

## Later validation

The full `npm run gate` remains intentionally deferred because it includes build/codegen and E2E. This is a later validation item, not a pre-E2E defect. Run it in a controlled environment after the E2E pass and classify any unrelated baseline failures before alpha.

## Strengths and coverage

The reviewed call lifecycle rechecks persisted authority, binds quote/input/attempt digests, fences release before external effects, and projects network/payment ambiguity as reconciliation-required. Money paths use canonical exact amounts and idempotent transaction/reference digests. Provider consequence and secret lifecycle seams use opaque references, bounded bodies, token digests, claim/lease state, and guarded HTTPS transport. HTTP adapters parse bounded JSON and strict action schemas; Convex public/internal functions have argument and return validators in the sampled surfaces.

Coverage included the required product/guidance docs; call API/routes, authority and dispatch/recovery lifecycle, managed money/Formance and x402 authorization/observation, provider consequence journal/bridge, secret lifecycle, network guard, rate-limit policy, representative security/schema tests, and release scripts. Static review does not establish hosted DNS behavior, external provider semantics, timing races, or browser UX.

## Checks

- `node --version` → `v22.22.0`; `npm --version` → `11.5.1`.
- `npm run lint` → pass; log: `lint.log`.
- `npm run typecheck` → pass; log: `typecheck.log`.
- `npm run deps:check` → pass; 0 no-circular, 34/34 internal-cycle ceiling, 258/258 barrel-cycle ceiling; log: `deps-check.log`.
- Bounded high-risk Vitest → 16 files / 247 tests passed; log: `high-risk-vitest.log`.

  ```sh
  npm exec --offline -- vitest run \
    tests/unit/capability-execution/call-admit.test.ts \
    tests/unit/capability-execution/call-dispatch.test.ts \
    tests/unit/capability-execution/call-recover.test.ts \
    tests/unit/capability-execution/call-recovery-actions.test.ts \
    tests/unit/convex/capability-call-worker-charge.test.ts \
    tests/unit/convex/capability-call-worker-reconcile.test.ts \
    tests/unit/convex/capability-call-worker-lease.test.ts \
    tests/unit/convex/money-managed-call.test.ts \
    tests/unit/convex/money-x402-payment-attempts.test.ts \
    tests/unit/server/call-api.test.ts \
    tests/unit/server/call-recovery-api.test.ts \
    tests/unit/server/agent-access-auth.test.ts \
    tests/unit/security/provider-secret-surface.test.ts \
    tests/unit/secrets/production-lifecycle.test.ts \
    tests/unit/money/exact-amount.test.ts \
    tests/unit/money/formance.test.ts \
    --no-file-parallelism
  ```
- Bounded boundary Vitest → 12 files / 130 tests passed; log: `boundary-vitest.log`.

  ```sh
  npm exec --offline -- vitest run \
    tests/unit/schema/convex-schema.test.ts \
    tests/unit/schema/money-schema.test.ts \
    tests/unit/security/csrf-rate-limit.test.ts \
    tests/unit/security/rate-limit-policy.test.ts \
    tests/unit/security/provider-secret-surface.test.ts \
    tests/unit/convex/supply-agent-args-validators.test.ts \
    tests/unit/convex/capability-call-authority-boundary.test.ts \
    tests/unit/convex/capability-call-worker-authority-boundary.test.ts \
    tests/unit/convex/interactive-consequence-context-defensive.test.ts \
    tests/unit/convex/secret-lifecycle-operations.test.ts \
    tests/unit/capability-supply/x402-call-policy.test.ts \
    tests/imports/bare-catch-ratchet.test.ts \
    --no-file-parallelism
  ```

- Late-drift E-1 source recheck → **confirmed on the current tree**: all six Tool/Quote/Call/recovery route handlers remain direct dispatches, while the server/policy/Convex rate-limit layers exist but are not reached by those handlers. No tests were rerun. The earlier green checks are point-in-time results and are not final-tree signoff after concurrent drift.

## Limitations

The checkout is shared and heavily dirty; roughly 109 baseline files changed during concurrent work, including `src/lib/server/rate-limit.ts`, `src/modules/security/rate-limit-policy.ts`, `convex/rateLimit.ts`, `package.json`, money/schema tests, and Call recovery contracts. No source/config files or Git state were changed by this audit. E-1 was re-read against the current routes and rate-limit layers; the earlier lint/typecheck/deps/Vitest passes remain point-in-time and are not final-tree signoff. No live backend, secrets, dependency install, deployment, browser, E2E, or full gate was used. The exact bounded test selections above provide source-level confidence only; unreviewed areas include the remaining test suite, hosted provider behavior, browser UX, and deployment/runtime configuration.
