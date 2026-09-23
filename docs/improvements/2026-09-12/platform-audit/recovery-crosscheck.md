# Recovery cross-check: E-4

**Verdict: supported (point-in-time current tree).** E-4 identifies a reachable automatic-recovery omission, although the surrounding reconciliation wrappers are otherwise sound.

`convex/moneyManagedCall.ts:253-279` sets `formanceFinancialState`, Call `state`, `dispatchState`, and an evidence-bearing `result` to reconciliation-required, but does not set `reconciliation` or `nextAttemptAt`. Its only callers are the reservation-attach-conflict and Formance `outcome_unknown` branches at `convex/lib/callLifecycle/callActions.ts:361-387`.

The missing initializer is not reliably reached afterward. The caller returns `{ kind: 'replayed' }`; `src/modules/capability-execution/call-admit.ts:443-479` reads the persisted reconciliation result and returns it as a terminal replay. The action path records that this was a replay (`convex/lib/callLifecycle/callActions.ts:541-553`), and `persistProjectedInvocation` exits before calling `capabilityCalls.record` when `reservationWasReplayed` is true (`convex/lib/callLifecycle/callActions.ts:309-325`). Therefore the normal `recordWithReconciliationInitialization` wrapper is bypassed.

The automatic sweep cannot repair this shape: `convex/lib/callLifecycle/reconciliation.ts:163-174` initializes only when an initializer wrapper is invoked, while `:233-258` selects rows through `reconciliation.nextAttemptAt` and rejects invalid or missing reconciliation data. `convex/capabilityCallWorker.ts:231-256` consumes that candidate query. Manual `call.reconcile` can eventually enter the initializer, but no evidence makes manual intervention the intended policy; the automatic disposition and sweep contract indicate these ambiguous reservations should be queued.

Smallest correction: initialize the reconciliation envelope in `markReservationUnknown` atomically, preserving the existing evidence and uncertainty state. Concurrent edits mean this verdict should be rechecked against the final tree before implementation.
