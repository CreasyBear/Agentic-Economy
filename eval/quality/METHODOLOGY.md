# Agentic-Economy Evaluation Methodology (public)

> Status: **living methodology**. Everything this page names as a metric or gate is
> grounded in the installed harnesses and research records listed in
> [§1 Sources](#1-sources-grounding). Anything not yet measured live is explicitly
> labeled **proposed / to-measure** — this page does not claim proof it does not have.
> Version: 2026-08-05.

This is the methodology behind the two things AE ships to the public:
**(a) a published eval methodology** (this document) and **(b) stakeholder eval
reports** (built from [REPORT-TEMPLATE.md](./REPORT-TEMPLATE.md)).

## 1. Sources (grounding)

Every claim here is traceable to installed canon or an existing harness:

- **Engine harness** — `eval/engine/run-evaluation.mjs`: runs the engine-usefulness
  evaluation table live against the `customerRequest.planPreview` action
  (`tools/ae/cli.ts` → `action customerRequest.planPreview`), capturing per-query
  `kind`, `steps`, `reason`, `latency`, internal `[ERROR]`/`[WARN]` leak, and
  determinism across `--runs N` (default 3). Exits **nonzero on any MUST-cell
  failure**, so it is a hard deploy gate, not a report.
- **Engine evaluation table** — `.planning/research/2026-08-05-engine-usefulness-path.md`
  §2: the per-workflow MUST/G/n-a matrix (resolves-real-capability, correct-inputs,
  no-false-positive, no-fabrication/leak, ambiguous→needs_information, latency<15s,
  3× determinism).
- **Eval ladder + [PROPOSED] SLOs** — `.planning/research/2026-08-05-eval-ladder-slo-dependency.md`
  §2 (L0–L7) and §3 ([PROPOSED] SLOs + current measurement status).
- **Answer harness** — `eval/answer/` (`README.md`, `lib/cases.ts` catalog,
  `lib/scoring.ts` 9/10 bar, `lib/coverage.ts` coverage contract, `lib/registry-seed.ts`
  100-business broad seed, `scripts/run-suite.ts` → `output/eval/answer-suite-report.json`
  schema `answer-eval-suite-report:v3`).
- **AI SDK testing canon** — `node_modules/ai/docs/03-ai-sdk-core/55-testing.mdx`
  (mock providers: `MockLanguageModelV4`, `simulateReadableStream`, `mockValues`,
  `mockId`; `Output.object` structured output). Used to make unit-level eval
  deterministic without a live provider.
- **Consumer rubric** — `eval/consumer/RUBRIC.md` (fixed, PASS/FAIL critic rubric).

## 2. What AE evaluates

| Surface | What is measured | Primary harness |
|---|---|---|
| **Engine resolution** | Does a capability-eligible NL query resolve to a real, registered, routeable capability (correct kind + step ladder), with no false positive? | `eval/engine/run-evaluation.mjs` |
| **Latency** | Wall-clock time for `planPreview` (`latencyMs` in the engine harness); first-progress & completion for the answer path (v3 report `performanceByPath`). | engine harness; answer report |
| **Honesty / no-fabrication** | Zero fabrication, zero hostile response, zero data/secret leak, honest "not-ready" for keyed/x402/observed rows, no internal `[ERROR]`/`[WARN]` leak. | engine harness `leakedInternal`; answer copy-safety scan |
| **Grounding / citations** | Answer copy grounded in persisted evidence + tool inputs + timing traces; citation validity (answer path). | answer harness `scoring.ts` (`grounded_evidence`) |
| **Safety / boundary** | Booking/payment/dispatch/fulfilment stay inside AE's boundary; public copy scanned for unsafe claims and internal terms. | answer harness (`safe_boundary`, `public-copy-safety-scan`); consumer `RUBRIC.md` R5/D7 |
| **Determinism** | Same query → same result across `--runs N` (default 3). Non-determinism is a model-selection cap (a MUST failure). | engine harness `stable` check |

## 3. Metrics

### 3.1 Kind match
The engine's returned `kind` equals the expected kind for the workflow. Expected kinds
(currently `preview` | `unavailable` | `needs_information` | `reject`; some rows allow a
set). Implemented in `run-evaluation.mjs` (`expectKind`, `kindOk`). Source of allowed
kinds: the engine table.

### 3.2 True-positive resolution
The workflow's resolved step ladder contains the expected capability slug —
`resolved: ['frankfurter'|'coingecko'|'open-meteo'|'exa'|'tavily'|'contents'|'wikipedia'|…]`
in the engine harness; answer-path assertions on persisted tool queries/evidence in
`eval/answer/lib/cases.ts`. **(`true-positive rate` = resolved-and-correct cases ÷
total cases; the aggregate is proposal-to-measure — the harness reports per-case
pass/fail today.**

### 3.3 False-positive rate
A query that must never produce an executable plan, or must never select a specific
wrong capability, is a HARD fail. Two guards in `run-evaluation.mjs`:
`falsePositiveForbidden` (e.g. `crypto` must never resolve to `frankfurter`) and
`noPreview` (greenfield/hostile/fx-degenerate/keyed-env/observed-x402 must never emit a
`preview`). **False positive = fail**, per engine §2 "Correctness over breadth".

### 3.4 Hallucination rate
Measured as the share of resolved cases whose plan/answer invents capability,
inputs, or claims not grounded in the registry/evidence. In the engine, unresolved
must stay unresolved (no fabricated preview) and hostile/degenerate rows must refuse.
In the answer path, `grounded_evidence` + `public-copy-safety-scan` catch fabricated
copy. **LLM-fluent hallucination grading beyond these deterministic checks is
`proposed / to-measure`** (see §6).

### 3.5 Grounding citation-validity
For the answer path, every claim must be backed by persisted frozen evidence, tool
inputs, and timing traces (`camper`/assertions in `eval/answer`), and citations must
point at a real provider record (`agent-json-link` coverage requirement). The
`grounded_evidence` dimension enforces this. **A standalone citation-validity ratio
aggregate is proposed / to-measure.**

### 3.6 Latency percentiles
- **Live engine:** `latencyMs` per query in `run-evaluation.mjs`; the **MUST ceiling is
  `MAX_LATENCY_MS = 15_000`** (any single run ≥15 s fails the workflow).
- **[PROPOSED] p95 budgets** (eval-ladder §3): Flow A `p95 first progress ≤ 2.0 s`,
  `p95 completion ≤ 12 s`; Flow B planPreview `p95 shell reservation ≤ 500 ms` +
  `non-model compile/commit ≤ 1.5 s`.
- **p50 / p95 / p99 percentiles of the full run distribution** across the golden corpus
  are a **proposed aggregate**; today the harness reports per-workflow avg/max and the
  answer v3 report records `p95/max` for `requestToFirstProgressMs` /
  `requestToCompletionMs` per `performancePath`.

### 3.7 Cost per useful task
The answer v3 report records `estimatedUsd` per turn or an explicit
`costUnavailableReasons` (missing accounting is a failure, not zero cost) and
aggregate token usage (`inputTokens`/`outputTokens`/`cachedInputTokens`/
`cacheWriteTokens`/`reasoningOutputTokens`/`totalTokens`). **`cost per useful task` =
aggregate estimated cost ÷ resolved-and-useful cases is a proposed derivation**;
per-turn cost availability is already enforced today.

### 3.8 3× determinism
Each engine workflow is run `--runs 3` (default); the set of kinds across runs must be
a singleton (`stable`), else the workflow fails. Implemented in `run-evaluation.mjs`.

## 4. Golden dataset design

Two existing catalog/ladder sources feed the golden corpus:

- **Answer catalog** — `eval/answer/lib/cases.ts`: every case declares `id`, `covers`
  (reliability dimension), `registrySeed` (`default`|`broad`), and `expected`
  (slugs, persisted tool queries, timing names, copy checks, timing budget,
  model/tool counts). Coverage requirements are enumerated in
  `ANSWER_EVAL_COVERAGE_REQUIREMENTS` (direct-retrieval, typo-recovery, empty-state,
  near-me guard, unsupported-action boundary, multi-turn, broad-catalog-scale, …).
- **Engine table** — the 15 workflows in `run-evaluation.mjs` (`fx`, `crypto`,
  `weather`, `geocode`, `search`, `page-content`, `keyless-refs`, `keyed-env`,
  `observed-x402`, `greenfield`, `hostile`, `ambiguous`, `fx-degenerate`, `empty`,
  `malformed`).

**Target: ≥ 100 curated cases — proposed / to-measure.** The existing catalogs are the
seed; growing to ≥100 with **per-workflow balance** (each engine workflow + each
answer reliability dimension represented; hostile/greenfield/edge rows included, not
skipped) is a stated goal. Every case is a stable `id`, referenced from both promptfoo
(`eval/answer/promptfooconfig.yaml` references case ids) and Vitest, so the categories
never drift apart.

## 5. Where deterministic checks end and LLM-as-judge begins

AE's eval philosophy is **deterministic-first**: as much as possible (kind match,
resolution, false-positive guards, latency, determinism, copy-safety scans, rubric
scores) is scored by code, not by a model. This mirrors the AI SDK's own testing canon —
`MockLanguageModelV4` / `simulateReadableStream` (`node_modules/ai/docs/03-ai-sdk-core/55-testing.mdx`)
exist precisely so unit suites are repeatable without a live provider, and AE's
deterministic kernel retains authority over validation.

**LLM-as-a-judge is reserved for the residual open-ended quality judgments** (e.g. "is
this free-form follow-up answer really helpful and grounded?") where a deterministic
check cannot decide. **The calibration procedure is as follows (proposed / to-measure —
no LLM-judge eval is live yet):**

1. **Anchor grading** — a fixed set of pre-scored anchor cases (a hand-labeled slice,
   e.g. 20–50) is passed to the judge each round; the judge's scores on the anchors are
   compared to the ground-truth labels every run. Anchor drift → the round is flagged,
   not trusted.
2. **Inter-rater** — on samples, run ≥2 independent judges (or the same judge with a
   rephrased rubric) and report inter-rater agreement (e.g. Cohen's κ). Low agreement on
   a dimension → that dimension is not ready to gate.
3. **Human-in-the-loop on edge cases** — every judge-disagreement and every near-threshold
   case is routed to a human reviewer; the judge never decides alone on regression-gating
   thresholds. This matches the existing `eval/consumer/RUBRIC.md` pattern (fixed rubric,
   human critic, evidence-backed verdicts).

LLM-judge output is **never authority**; it is a signal that feeds a human/aggregate
decision, consistent with the baseline invariant that model output is a proposal.

## 6. Thresholds that gate a deploy

A change blocks a deploy when **any MUST cell in the engine table fails** (`run-evaluation.mjs`
exits nonzero), or when the answer coverage contract fails. Concretely:

- **Engine gate (hard):** running `node eval/engine/run-evaluation.mjs [--runs N]` against a
  seeded local deployment. MUST cells from engine §2: resolves real capability, correct
  inputs, no false positive, no fabrication/leak, ambiguous→`needs_information`, latency
  `< 15 s`, 3× determinism, no internal `[ERROR]`/`[WARN]` leak. Strategy the harness then
  blocks: `crypto→Frankfurter`, `search/page-content` wrong-capability, unresolved
  `crypto/geocode/greenfield/keyed`, latency ≥15 s, and any fabrication.
- **Answer gate (hard):** the eval suite (`npm run test:eval` → coverage + report +
  promptfoo + Vitest). Fails on a required reliability dimension with no case, a case
  lacking timing/evidence/copy-safety assertions, private evidence exposed through the
  public projection, or any case scoring below **9/10** (`ANSWER_EVAL_SCORE_THRESHOLD = 9`).
- **[PROPOSED] SLO budgets** (eval-ladder §3) become deploy gates **once measured**: e.g.
  Flow A `p95 completion ≤ 12 s`, `p95 first progress ≤ 2.0 s`; Flow B planPreview
  `≤ 2 attempts`, keyless path `0 model calls`, `p95 shell reservation ≤ 500 ms`, non-model
  `compile/commit ≤ 1.5 s`; exactly-once/`unknown`-within-one-recovery-cycle semantics.
  These are **targets to measure and tune, not observed facts** — no live
  latency/cost/throughput/recovery measurement exists for the engine yet.

## 7. How results are published

1. **Engine:** run the live harness (`npm run seed:dev` then
   `node eval/engine/run-evaluation.mjs [--runs 3]`) to produce authoritative
   kind/resolution/latency/determinism/no-leak numbers. It must be run live (it does not
   mock) and must be re-run on a seeded local deployment (Convex is the source of truth;
   fixtures prove source, not live).
2. **Answer:** `npm run test:eval:report` writes `output/eval/answer-suite-report.json`
   (schema `answer-eval-suite-report:v3`), uploaded in CI by the answer eval workflow.
   The report contains only sanitized aggregates — never private harness records,
   provider IDs, raw payloads, or prompt text (public projection boundary).
3. **Reports:** every published report is built from the **same template**
   ([REPORT-TEMPLATE.md](./REPORT-TEMPLATE.md)) so trends are comparable. Reports state
   the run date, the model(s), the seed/deployment, the exact `--runs` count, and which
   numbers are observed run summaries vs [PROPOSED] SLOs.
4. **One rule for every published report:** *fixtures never become live proof*, and a
   locally captured provider run is source/mock proof, not hosted proof. A report may
   distinguish live-engine results from [PROPOSED]/to-measure targets, but must never
   relabel a proposed number as observed.

## 8. Honesty guardrails (RULES.MD-aligned)

- No fabrication, no data leak, no assertion weakening.
- A false positive is a hard fail, not "close enough".
- `needs_information` (a typed ask) is preferred over a bare `preview_unavailable` for
  under-specified capability-eligible queries.
- Missing cost accounting is a failure, not zero cost.
- Never weaken a gate to get the table green; the measurement contract (the eval table)
  is authoritative over any reflex to over-refuse real capability-eligible queries.
