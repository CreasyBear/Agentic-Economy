# Answer Eval Harness

This local harness protects the Agentic Economy answer/search path without live model
access. It runs the real answer-turn endpoint against deterministic registry
state, checks persisted evidence, and keeps promptfoo and Vitest on the same
case catalog. The deploy-only smoke documented below is a separate hosted
evidence class; local report output never stands in for it.

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
- Harness run reports can be derived from persisted turn evidence without
  leaking raw tool evidence to the public projection.
- The v3 report records request wall-clock first-progress and completion measurements,
  sanitized model/tool counts, aggregate usage, and explicit cost availability.
- Direct and model-path evidence remains separate: a local captured-provider run is
  source/mock proof, not live provider or deployment proof.
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

For harness changes, pair the eval command with the focused harness/answer
suite:

```bash
./node_modules/.bin/vitest run tests/unit/harness tests/unit/answer-thread/answer-run-summary.test.ts tests/unit/answer-thread/public-projection.test.ts tests/unit/answer-thread/tool-runner.test.ts tests/unit/answer/answer-tool-use-agent.test.ts tests/integration/answer-tool-calls.test.ts tests/integration/agent-tools-api.test.ts
```

Browser session continuity is covered by:

```bash
./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium
```

## Case Catalog

The source of truth is `eval/answer/lib/cases.ts`.

Each case declares:

- `id`: stable identifier used by promptfoo and Vitest.
- `covers`: reliability dimensions protected by the case.
- `registrySeed`: `default` or `broad`.
- `expected`: slugs, persisted tool queries, timing names, copy checks, timing
  budget, and optional model/tool-count expectations.

Promptfoo rows reference case ids rather than duplicating expectations. Vitest
imports the same catalog and evaluator.

## Model and Tool Count Interpretation

`performancePath` is `deterministic` when the persisted harness summary records
zero model requests and `model` otherwise. Counts come from the private
`harnessRun` summary and are copied into the sanitized report; they are not
inferred from prompt text, stream frame count, or timing names.

The named expectations are exact:

- `turn-direct-parramatta-fast-path` requires **zero model requests**. AE takes
  the source-defined deterministic retrieval path, so zero means no model
  planning or recovery request—not zero tools. Its persisted search still
  supplies the listed evidence.
- `turn-paramata-visible-recovery` requires **one model request** and **two
  persisted tool runs**. The two runs are the initial literal `paramata` search
  and the model-selected corrected `parramatta` recovery search. This is why
  the tool count is not the same as the model request count.

These counts describe harness evidence only; authority, validation, persistence,
and public projection remain deterministic AE responsibilities.

## Broad Seed

The broad seed lives in `eval/answer/lib/registry-seed.ts` and currently creates
100 businesses: 10 industries across 10 Australian locales.

It is eval-only. Normal app/dev registry defaults stay unchanged unless a case
opts into `registrySeed: 'broad'`.

## Coverage Contract

The coverage auditor lives in `eval/answer/lib/coverage.ts`. It fails when:

- A required reliability dimension has no case.
- A case lacks timing, evidence, or copy-safety assertions.
- Harness/private evidence is exposed through the public projection.
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
the answer eval workflow. It uses the single report schema
`answer-eval-suite-report:v3`.

The v3 report contains:

- `summary` case/turn counts, failure counts, score threshold/minimum/average,
  existing internal `totalTimingMs` aggregates (`p95TurnTimingMs` and
  `maxTurnTimingMs`), aggregate model/tool counts, aggregate usage/cost, and
  `performanceByPath`.
- Per-turn fields under each turn case (or nested thread turn): `performancePath`,
  `requestToFirstProgressMs`, `requestToCompletionMs`, `modelRequestCount`,
  `toolRunCount`, `usage`, optional `estimatedUsd`, and sorted
  `costUnavailableReasons`.
- `usage` is aggregate harness usage with `inputTokens`, `outputTokens`,
  `cachedInputTokens`, `cacheWriteTokens`, `reasoningOutputTokens`, and
  `totalTokens`. `estimatedUsd` is present only for a finite non-negative
  estimate. Cost-unavailable reasons are non-empty, deduplicated, and sorted;
  the summary carries the sorted union across turns rather than silently
  treating unavailable pricing as zero.
- `performanceByPath.deterministic` and `.model` each include `turnCount`,
  p95/max request-to-first-progress milliseconds, and p95/max
  request-to-completion milliseconds. These are observed run summaries, not a
  new hard SLO; internal span timing and request wall-clock timing stay distinct.
- Coverage tags/issues, broad-seed counts, per-case slugs, sanitized tool-query
  checks, timing names, streamed artifact kinds, public-copy diagnostics,
  score breakdowns, and user-outcome judgments.

Request wall-clock timing starts immediately before route invocation. First
progress is the first parsed stream event other than the initial `thread` event;
completion is measured after the response stream drains. This is different from
the internal timing entries and the existing per-case total timing budget.

Reports may include sanitized counts, aggregate usage/cost, slugs, query checks,
timings, artifact kinds, diagnostics, scores, and user outcomes. They must not
include the private harness record or private identifiers/payloads, including
`harnessRun`, `harnessFinalization`, `modelRequests`, raw tool IDs, raw tool
input/output/payloads, result summaries, hashes, `requestId`, `responseId`,
provider request/response IDs, run IDs, prompt text, model response text, or
private-evidence markers. The public thread projection has the same boundary.

When a failure occurs, start with the JSON report. It is intentionally more
compact than the promptfoo table.


## Runtime-Selected Hosted Smoke

The deploy-only smoke exercises both answer paths against one subject selected
from the target deployment's current public catalog. It reads
`PLAYWRIGHT_BASE_URL` itself and navigates with absolute URLs; it does not rely
on the Playwright config to supply `baseURL`.

Prerequisites:

- A fresh deployment/process built from the verified artifact, with deployed
  Clerk/session and registry configuration.
- A deployed `OPENROUTER_API_KEY`; `AE_LLM_MODEL` is optional.
- `PLAYWRIGHT_BASE_URL` set to the target. It must be HTTPS (HTTP is accepted
  only for localhost/127.0.0.1) and must not contain credentials, a query, or a
  hash.
- If Vercel Protection is enabled, the existing bypass helper needs
  `VERCEL_AUTOMATION_BYPASS_SECRET`.
- Set `AE_SMOKE_SELECTION_SEED` to make the subject selection reproducible.
  If omitted, the smoke generates and prints a UUID seed.

Run it with:

```bash
PLAYWRIGHT_BASE_URL=https://<deployment> \
AE_SMOKE_SELECTION_SEED=<recorded-seed> \
  npx playwright test --config=playwright.deploy-smoke.config.ts \
  tests/deploy-smoke/answer-runtime-production-smoke.spec.ts
```

The smoke fetches and paginates `/api/businesses`, then filters published
subjects whose category/suburb/state-territory tuple is unique in that live
catalog and whose category is a listed service. The recorded seed selects one
eligible subject deterministically. It derives the direct query from that
subject's published category and locality, then derives a bounded typo or
normalization query from the same facts and verifies that the literal search is
empty before submitting the recovery query. An empty eligible set or no bounded
literal miss is a failure, never a skip.

For both queries it uses the public UI and real `/api/answer/turn` path,
observes a terminal answer and a citation for the selected subject, reloads for
fresh public readback, and checks that public copy makes no consequential
booking/payment/dispatch claim or private-evidence leak. The model-path
readback also requires the sanitized recovery-search work-log step. A receipt
prints the seed as `AE_SMOKE_SELECTION_SEED=<value>` and JSON fields for
`selectedSlug`, `catalogUrl`, both thread URLs, and timestamps.

### Hosted Evidence Ceiling

The smoke command is the only new hosted/provider evidence described here. When
it is actually run against a fresh target and its receipt/readbacks pass, that
receipt can establish public end-to-end deterministic retrieval and
model-recovery behavior for the same runtime-selected subject. This README does
not claim that the smoke has run.

The public smoke alone does **not** prove private hosted model/tool counts,
token usage, estimated cost, provider request/response IDs, or private harness
records. The local captured-provider eval supplies source/mock classification:
the direct case's zero-model expectation and Paramata's one-model/two-tool
expectation. Neither local captures nor a public readback may be relabeled as
hosted provider proof.