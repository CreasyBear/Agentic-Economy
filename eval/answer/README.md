# Answer Eval Harness

This harness protects the Agentic Economy answer/search path without live model
access. It runs the real answer-turn endpoint against deterministic registry
state, checks persisted evidence, and keeps promptfoo and Vitest on the same
case catalog.

## What It Proves

- Direct high-confidence retrieval can complete without model planning.
- Typo recovery is visible in persisted tool input, including the literal failed
  search before a corrected search.
- Empty states remain clean and boundary-honest.
- Near-me context prevents unrelated locations from leaking into results.
- Unsafe booking, payment, dispatch, and fulfillment requests stay inside AE's
  boundary.
- Multi-turn follow-ups can reuse frozen evidence without a fresh registry
  search.
- Public answer copy is scanned for unsafe claims and internal architecture
  terms.
- Timing traces and total timing budgets are present for every answer case.
- A 100-business broad seed exercises multiple industries and Australian
  locales.
- Every single-step, multi-step, and generated-answer case is ranked against a
  9/10 user-outcome bar.

## Commands

```bash
npm run test:eval:coverage
npm run test:eval:report
npm run test:eval:validate
npm run test:eval
```

`test:eval:coverage` checks the shared case catalog, the broad seed size, and
promptfoo synchronization.

`test:eval:report` runs the shared catalog through the endpoint evaluator and
writes `output/eval/answer-suite-report.json`.

`test:eval:validate` checks the promptfoo configuration after the coverage
audit.

`test:eval` runs coverage, report generation, promptfoo, and Vitest.

## Case Catalog

The source of truth is `eval/answer/lib/cases.ts`.

Each case declares:

- `id`: stable identifier used by promptfoo and Vitest.
- `covers`: reliability dimensions protected by the case.
- `registrySeed`: `default` or `broad`.
- `expected`: slugs, persisted tool queries, timing names, copy checks, and
  timing budget.

Promptfoo rows reference case ids rather than duplicating expectations. Vitest
imports the same catalog and evaluator.

## Broad Seed

The broad seed lives in `eval/answer/lib/registry-seed.ts` and currently creates
100 businesses: 10 industries across 10 Australian locales.

It is eval-only. Normal app/dev registry defaults stay unchanged unless a case
opts into `registrySeed: 'broad'`.

## Coverage Contract

The coverage auditor lives in `eval/answer/lib/coverage.ts`. It fails when:

- A required reliability dimension has no case.
- A case lacks timing, evidence, or copy-safety assertions.
- A broad-catalog case does not use the broad seed.
- Promptfoo is missing a shared catalog case.
- Promptfoo references an unknown or mismatched case.
- The broad seed falls below its required business, industry, or locale counts.

## Product Score

The suite report scores each case out of 10 and fails if any case falls below
9. The rubric is deterministic and asks the product questions directly:

- Did the user get the right answer or the correct empty/boundary state?
- Is the answer grounded in persisted evidence, tool input, and timing traces?
- Did public copy stay inside AE's safe boundary?
- Can the user take a safe next step now?
- Does the generated answer UI have clear one-line, summary, and next-step
  text plus streamed artifacts that match the result?
- Is abandonment risk low based on completion, timing, and final-state copy?
- For multi-turn cases, did the follow-up preserve the expected evidence path
  without an unwanted new search or model loop?

Case reports include `score`, `rank`, `scoreBreakdown`, and `userOutcome`.
`userOutcome` records whether the user is satisfied, got the right answer, can
proceed, and has low/medium/high abandonment risk.

## Report Artifact

`output/eval/answer-suite-report.json` is ignored locally and uploaded in CI by
the answer eval workflow. It includes:

- Case and turn counts.
- Failure counts.
- Minimum and average product scores, with the 9/10 threshold.
- p95 and max deterministic turn timing.
- Coverage tags and coverage issues.
- Broad seed counts.
- Per-case slugs, tool inputs, timings, streamed artifact kinds, and
  public-copy diagnostics.
- Per-case score breakdowns and user-outcome judgments.

When a failure occurs, start with the JSON report. It is intentionally more
compact than the promptfoo table.
