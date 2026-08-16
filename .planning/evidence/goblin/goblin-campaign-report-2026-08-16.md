# Agentic Economy Goblin Campaign Report

**Date:** 2026-08-16  
**Scope:** local stack at `http://127.0.0.1:3024`; CLI, Answer, Market Operation reads/execution, same-thread continuation, privacy/error boundaries, and focused cross-surface parity  
**Method:** eight hostile personas plus focused angry-journey reruns. Findings were deduplicated against the 2026-08-13/14 reports before remediation.  
**Evidence labels:** `[RUNTIME]` current local process or persisted local record; `[SOURCE]` current source; `[TEST]` current automated gate.

## Verdict

**No P0 was found. Keep live money disabled.**

All five campaign-blocking collaboration/automation defects were reproduced, remediated, and rerun green:

1. exact structured candidate selection now persists after successful execution;
2. explicit search-only/no-execute requests cannot cross the effect gate;
3. a requested optional result field is treated as part of one native operation result;
4. same-thread rationale/result recall uses frozen evidence and does not rerun;
5. singular CLI not-found and operation-read failures now exit non-zero with canonical machine errors.

No credentialed gateway invocation, paid/x402 operation, settlement, payout, production mutation, or hosted-deployment claim was made.

## Remediated findings

### P1-1 — FIXED_GREEN: exact candidate selection executed but finalization returned HTTP 500

**Evidence:** `[RUNTIME]` + `[SOURCE]` + `[TEST]`.

The red loop used the frozen cat candidate and consistently returned `answer_turn_persist_failed`. Targeted finalization evidence showed `request_digest_mismatch`: `answerTurnRequestDigest` canonicalized structured selection JSON, and `streamAnswerTurn` persisted that canonical query, but `reserveAnswerTurn` had stored the caller's non-canonical JSON string. Harness finalization correctly rejected the two query identities.

`reserveAnswerTurn` now canonicalizes the query before either the in-memory port or Convex source-write command receives it. The structured-selection regression asserts the reservation stores the same canonical query used by execution/finalization.

Live green proof:

- thread: `36dacfd9-42b4-41d5-b06f-0603840d048b`
- turn: `b25ec28a-7151-44c4-827a-fdc41819162b`
- exact ref: `operation:v1:3e80c2a3a9b09f6a53b90856f1e077e173b2a151c6bc2530fe3478b76b2d8b31`
- exact input: `{"ids":"bitcoin","vs_currencies":"usd","include_24hr_change":true}`
- result: completed, persisted, and returned a typed `operationOutcome`

### P1-2 — FIXED_GREEN: “search only / do not execute” still attempted execution

**Evidence:** `[RUNTIME]` + `[SOURCE]` + `[TEST]`.

The effective operation route previously set `effectAllowed: true` for every operation-lane request, and nothing upstream could say otherwise. The structured request interpretation now carries a required `effectPolicy` of `run_when_ready` or `candidate_only`, classified once in preflight alongside route, intents, and continuation. The route resolver reads that field instead of pattern-matching the query, so the decision is made in the one place that already owns request interpretation.

The agent enforces it at the chokepoint: a navigation `call` decision under `candidate_only` stops at the reviewable candidate and never unlocks the effect tool, and deterministic auto-promotion of a sole detailed candidate is gated on the same flag. Operation search/detail reads stay available. The existing route tool gate remains as a backstop, and when it fires the prose reports an intentional candidate-only stop rather than a provider failure.

Live green proof:

- thread: `46864ade-1469-402c-868f-bc3f28449ef8`
- query: `Bitcoin via CoinGecko simple price, quoted in USD. Search only and return the candidate; do not execute.`
- frozen candidate set returned
- no `operationOutcome` was produced

### P1-3 — FIXED_GREEN: optional output field was misread as a second operation intent

**Evidence:** `[RUNTIME]` + `[SOURCE]` + `[TEST]`.

`oneNativeBatchCoversRequestedIntents` previously recognized only array-valued native batches. It rejected a single operation whose optional schema field requested an additional part of the same result, such as `include_24hr_change: true`.

Two changes, in order of precedence. Preflight now instructs the classifier to treat an optional output modifier of one lookup — an extra field, unit, or time window on the same entity — as part of that lookup rather than a separate requested intent, so the ambiguity is resolved where intents are declared. The gate then also recognizes active optional schema modifiers whose declared field name/description covers every supplemental requested intent, so a classifier that still splits them cannot cause a refusal. Required fields and unrelated optional fields do not satisfy this path.

Live green proof:

- thread: `021ae7a7-4f49-4d4b-ae2f-c5e65e512945`
- query: `What is Bitcoin's current price in USD? Include the 24-hour percentage change.`
- one CoinGecko execution
- input included `include_24hr_change: true`
- output included both `usd` and `usd_24h_change`

### P1-4 — FIXED_GREEN: rationale follow-up omitted selected operation and exact prior result

**Evidence:** `[RUNTIME]` + `[SOURCE]` + `[TEST]`.

The deterministic rationale branch only summarized local-service constraints, budgets, and failed work. It ignored frozen operation candidates and outcomes even when the question explicitly asked why an operation was selected and what it returned.

Rationale evidence now scans prior complete turns for the latest valid frozen operation outcome, binds it to the matching candidate/presentation, and returns:

- operation and source labels;
- the frozen candidate summary as selection rationale;
- the exact sanitized frozen operation result.

It performs no tool or provider call.

Live green proof:

- thread: `021ae7a7-4f49-4d4b-ae2f-c5e65e512945`
- recall turn: `6637cd74-fd57-43c3-af7f-b4fe83010cec`
- exact frozen Bitcoin output returned
- next step explicitly states: `No operation was run for this explanation.`

### P1-5 — FIXED_GREEN: singular CLI failures printed domain sentinels and exited 0

**Evidence:** `[RUNTIME]` + `[SOURCE]` + `[TEST]`.

Operation `inspect`, `compare`, `inspect-plan`, and unavailable `search` results used to print 2xx domain outcomes and return success. `demand business` did the same for `not_found`.

The CLI now maps each domain reason to its canonical kind and exits 1, keeping the source's own reason as the machine `code` so scripts match the word the source emitted:

- exact operation/business absence → `NOT_FOUND`;
- invalid query, including an invalid or expired cursor → `INVALID_ARGUMENT`;
- publication state the publisher must clear, such as `setup_required`, `under_review`, `publisher_withdrew`, `readiness_expired`, and the incompatible/cyclic mapping reasons → `FAILED_PRECONDITION`;
- `source_capacity_exceeded` → `RESOURCE_EXHAUSTED`, retryable;
- unavailable source/operation/mapping → `UNAVAILABLE`, retryable.

Empty collection search (`no_candidates`) remains a successful exit 0, matching `gh`, `kubectl`, and `npm` for empty-list reads.

Live proof:

```json
{"kind":"NOT_FOUND","code":"operation_not_found","message":"The requested Market Operation was not found.","exitCode":1}
{"kind":"INVALID_ARGUMENT","code":"query_invalid","message":"The search cursor is invalid or expired.","exitCode":1}
```

## Verification

- local angry journeys: all five remediated symptoms green
- exact selection persisted and returned an outcome
- search-only returned candidates without execution
- optional-field query returned both requested fields in one run
- rationale recall returned frozen result without a rerun
- absent exact operation returned CLI exit 1; invalid cursor returned exit 1; empty search stayed exit 0
- focused regression across answer, answer-thread, market-terminal, and answer-turn routing: **55 files, 492 tests passed**
- TypeScript: `tsc --noEmit` passed
- repo-wide Oxlint with `--deny-warnings` passed
- IDE diagnostics on changed source files: none

The live preflight emitted the newly required `effectPolicy` under strict structured outputs on the first attempt, so adding the field did not degrade classification.

## Remaining campaign papercuts

1. **P3 — large candidate payloads dominate CLI JSON.** The machine contract is truthful, but a compact projection flag would improve terminal collaboration without changing the canonical default.

These do not reopen the remediated P1 authority, persistence, intent, recall, or exit-code failures.
