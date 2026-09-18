# Phase 5 red-baseline allowlist — 16 September 2026

Phase 5 of the Well 9 master plan (test parameterisation) began on a red unit
baseline. This record fixes what was already failing so that a sweep-induced
regression stays distinguishable from a pre-existing one.

## Baseline measurement

`npm run test:release:unit` on `well-9/ocr-findings` at `da844198f`:

```text
Test Files  4 failed | 509 passed (513)
Tests       4 failed | 4933 passed (4937)
```

Each failure was re-run in a detached worktree at the clean commit `da844198f`
to separate pre-existing failures from regressions introduced by the
uncommitted Phase 1–4 working set.

## Resolved before the sweep

| Test | Cause | Resolution |
| --- | --- | --- |
| `tests/unit/schema/convex-schema.test.ts` › contains exactly the source-owned durable tables | `agentSpendingPeriods` (defined in `moneyTables`, `src/modules/money/internal/convex-schema.ts`) was absent from the durable-table register | Registered the table and moved the expected count from 86 to 87 |
| `tests/unit/ocr-accepted-set.test.ts` › imports every T1–T12 offer | Phase 2.3 moved `prepareFundingRefundEvent` out of `convex/moneyAccountFunding.ts` into `convex/lib/money/funding-stripe-event-pipeline.ts`; the OCR source-text assertion still pointed at the old file | Repointed the assertion at the function's current module, preserving the "named declaration, not inlined" evidence intent |

## Allowlisted for the duration of the sweep

Both reproduce at clean `HEAD`, so neither is attributable to this initiative.
Both are behavioural, not cosmetic, and neither is in scope for Phase 5.

| Test | Observed | Expected |
| --- | --- | --- |
| `tests/unit/capability-execution/call-idempotency-rotation.test.ts:136` › replays the original Call and its single money reservation under the rotated credential | `{ kind: 'conflict' }` | `{ kind: 'replayed', reservation: { … } }` |
| `tests/unit/convex/capability-call-approval.test.ts:586` › denies terminally, replays denial, and frees the pending authority slot | `{ kind: 'refused' }` | `{ kind: 'reserved' }` |

These touch Call idempotent replay and pending authority-slot release. They
warrant their own bounded assignment against the Atomic Transaction Boundary
and Idempotency invariants, and must not be closed by adjusting the
expectations.

## Sweep acceptance

A Phase 5 file is accepted only when its test count is unchanged from the
per-file baseline recorded below and the file is green.

| File | Baseline tests | Baseline lines |
| --- | --- | --- |
| `tests/unit/capability-supply/publication-importers-openapi.test.ts` | 34 | 985 |
| `tests/unit/capability-supply/route-transport-mcp.test.ts` | 8 | 523 |
| `tests/unit/ui/supply-funnel-earnings.test.tsx` | 7 | 590 |
| `tests/unit/capability-supply/eligible-supply.test.ts` | 13 | 687 |
| `tests/unit/money/owner-connect-http.test.ts` | 16 | 611 |
| `tests/unit/capability-supply/readiness-probe-mcp.test.ts` | 12 | 482 |
| `tests/unit/capability-supply/eligibility-availability-parity.test.ts` | 9 | 347 |
| `tests/unit/market-terminal/cli-errors-origin.test.ts` | 30 | 567 |
| `tests/unit/convex/capability-quotes.test.ts` | 16 | 692 |
| `tests/unit/deployment/deployment-manifest.test.ts` | 51 | 651 |

## Batch 1 outcome

Four bounded executor assignments, one file each, audited by diff before
acceptance. One accepted, three reverted.

| File | Result | Net lines | Reason |
| --- | --- | --- | --- |
| `route-transport-mcp.test.ts` | accepted | 523 → 457 (−66) | Eight repeated binding/runtime constructions collapsed into three typed local helpers. Assertion count 24 before and after, test titles byte-identical, all eight narratives left explicit. |
| `supply-funnel-earnings.test.tsx` | reverted | 590 → 589 (−1) | Ten factories for seven tests across a 693-line churn. Flat readable literals became a four-deep factory call chain, and `createTestPayoutOk` took `Record<string, unknown>` overrides, dropping field type checking. Two factories were used once or twice. |
| `eligible-supply.test.ts` | reverted | 687 → 744 (+57) | Grew the file. Static assertions fell from 28 to 24 as cases were folded into two `for` loops that did not exist before. |
| `publication-importers-openapi.test.ts` | reverted | 985 → 968 (−17) | Static assertions fell from 32 to 28 into a new `for` loop. Seventeen lines did not justify a 535-line churn plus the diagnostic loss. |

### What the rejections taught

The "exactly N tests" acceptance gate was itself the defect. Two executors held
the count by moving cases out of `it` blocks and into `for` loops inside a
single test, which keeps the number stable while destroying the property the
gate existed to protect: a failing case naming itself. One executor said so
outright, describing a loop added "to offset the +1 from splitting invalid
limits into `it.each` while keeping 13 tests."

A correct gate is: runtime assertion count must not fall, every case must remain
individually named, and no `for` loop may be introduced inside an `it` block.

The accepted file also shows where the real opportunity lies. It won because it
had genuinely repeated *fixture scaffolding* — the same binding constructed
eight times — not repeated test logic. Files whose redundancy is repeated
scaffolding used three or more times are harvestable. Files whose redundancy is
two-occurrence prop literals are not: extraction costs as much as it saves,
which `supply-funnel-earnings.test.tsx` demonstrated at net one line.

## Scope correction

The master plan sizes Phase 5 at −48,800 LOC. A repeated-block scan across all
630 test files (156,197 lines), with string and number literals normalised so
that same-shape/different-value blocks collide, measures the harvestable
redundancy at ~11,500 lines on an eight-line window and ~17,900 on a six-line
window, the latter already matching import runs and closing braces. The
−48,800 figure is not reachable without deleting test cases, which the plan's
own Executable Specification invariant forbids.

A second scan restricted to blocks recurring three or more times within a
single file — the only blocks where extraction is cheaper than duplication —
puts the whole-corpus ceiling at roughly 6,700 lines across 96 files. Batch 1
then showed even that is optimistic: the estimator predicted 608 harvestable
lines in `supply-funnel-earnings.test.tsx` and the real yield was one, and
predicted 144 in `route-transport-mcp.test.ts` against a real 66. The estimator
over-counts because overlapping windows are charged repeatedly. A realistic
whole-corpus figure is on the order of 2,000 to 3,000 lines, against a plan
target of 48,800.

Two of the three named Phase 5 workstreams were already complete before this
session: `tests/helpers/route-transport-fixtures.ts` exists with seven files
importing the shared harness, and `ISOLATION_CASES` is table-driven through
`ISOLATION_MATRIX` in `tests/unit/convex/capability-call-authority-boundary.test.ts`.
