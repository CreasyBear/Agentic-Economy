# AE Evaluation Report — <Run / Quarter>

> **Stakeholder-facing template.** Fill the `<…>` fields. Every `(example)` number is a
> **placeholder** to illustrate the shape of the report — it is NOT a real measurement.
> Run facts that must appear before any trend is trusted: date, seed/deployment, model(s),
> `--runs` count, and whether each figure is **observed** (from a live harness run) or
> **[PROPOSED] / to-measure** (a target, not yet measured). Never relabel a proposed
> number as observed (METHODOLOGY.md §7).

- **Report period:** `<YYYY-MM-DD .. YYYY-MM-DD>`
- **Engine harness run:** `<date>` · `--runs=<N>` · seed = `<seed-or-deployment>`
- **Answer report artifact:** `output/eval/answer-suite-report.json` (schema `:v3`)
- **Models under test:** `<list, e.g. openrouter/…>`

---

## 1. Executive summary

> One paragraph: what is getting better, what regressed, whether the deploy gate is green.

| Signal | Status |
|---|---|
| Engine deploy gate | <GREEN / RED — MUST failures N> |
| Answer suite gate (≥9/10, coverage) | <GREEN / RED> |
| Overall quality trend | <improving / flat / regressed> |

**(example)** This quarter the engine gate flipped to GREEN and answer coverage held at
100% of required dimensions. Latency p95 improved 38% and true-positive resolution rose
from 0.72 → 0.94. One regression was caught and fixed (crypto→Frankfurter false positive,
see §3).

---

## 2. Quality dashboard (trend over time)

> Points = measured runs (engine harness + answer v3 report). Placeholder example values.

| Metric | Baseline<br>(example) | Prev<br>(example) | This run<br>(example) | Trend |
|---|---|---|---|---|
| True-positive resolution | 0.72 | 0.89 | 0.94 | ↑ |
| False-positive rate | 0.06 | 0.02 | **0.00** | ↑ |
| Hallucination rate | 0.03 | 0.01 | 0.00 | ↑ |
| Grounding citation-validity | 0.90 | 0.95 | 0.97 | ↑ |
| Safety / boundary (answer) | 1.00 | 1.00 | 1.00 | → |
| Latency p50 (ms) | 4200 | 2300 | 1850 | ↑ |
| Latency p95 (ms) | 9110 | 4700 | 3210 | ↑ |
| Latency p99 (ms) | 14320 | 8200 | 5400 | ↑ |
| Cost per useful task (estimate) | $0.031 | $0.021 | $0.017 | ↑ |
| 3× determinism (stable) | 0.80 | 0.93 | 1.00 | ↑ |
| Answer suite pass (≥9/10) | 100% | 100% | 100% | → |

> **Line chart (placeholder):** plot each above metric across runs; annotate fixed
> regressions and the deploy-gate runs.

---

## 3. Per-workflow pass table (engine)

> From `eval/engine/run-evaluation.mjs`. Every cell is the verdict for that (workflow,
> MUST cell). Schema/maxima in the eval table (engine-usefulness-path §2). Example values.

| Workflow | Resolves | Correct inputs | No false pos | No fab/leak | Ambiguous→ask | Latency<15s | 3× stable |
|---|---|---|---|---|---|---|---|
| fx (convert EUR→USD) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2100ms | ✅ |
| crypto (bitcoin in usd) | ✅ | ✅ | ✅ | ✅ | n/a | ✅ 2400ms | ✅ |
| weather (Paris) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 3200ms | ✅ |
| geocode (Paris) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 900ms | ✅ |
| search (web) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 4300ms | ✅ |
| page-content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 4100ms | ✅ |
| keyless-refs (wikipedia) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 1100ms | ✅ |
| keyed-env (no key) | ✅ honest not-ready | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| observed-x402 | ✅ discoverable-only | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |
| greenfield (joke) | ✅ refusal | n/a | ✅ | ✅ | n/a | ✅ | ✅ |
| hostile (API keys) | ✅ refusal | n/a | ✅ | ✅ | n/a | ✅ | ✅ |
| ambiguous (convert money) | ✅ → needs_information | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| fx-degenerate (USD→USD) | ✅ → needs_info/refusal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| empty / malformed | ✅ reject | n/a | ✅ | ✅ | n/a | ✅ | ✅ |

> **(example)** This run: 14/14 workflows pass all MUSTs. Prior run: 12/14 (see §4).

---

## 4. Regression alerts

> Only real, evidence-backed regressions with the query + raw output. Example entries.

1. **(example, fixed)** `crypto`: "ethereum price" resolved to `frankfurter` (ECB fiat) —
   false positive. Root-cause: cross-capability guard gap (engine-usefulness §Slice C).
   Fixed 2026-08-05; now `coingecko` and stays stable 3×.
2. **(example, fixed)** `latency`: `weather` single run was 15,221 ms ≥ the 15,000 ms MUST
   ceiling. Fixed by silencing the non-error fallback path (Slice D); now 3,200 ms.
3. **(none open)** No outstanding HIGH-severity regressions this period.

> **Contract:** a reported regression must include the exact query and the raw observed
> output, matching the adversarial-QA grounding rule (no claim without the raw output).

---

## 5. Latency & cost curves

> **Latency curve (placeholder):** distribution of `latencyMs` across the golden corpus —
> p50 / p95 / p99 — for each model and path. Overlay the [PROPOSED] SLO budgets
> (eval-ladder §3): Flow A `p95 first progress ≤ 2.0 s`, `p95 completion ≤ 12 s`; Flow B
> planPreview `p95 shell ≤ 500 ms`, `non-model compile ≤ 1.5 s`.

**Example table (p50/p95/p99, ms):**

| Model | p50 | p95 | p99 | Max vs 15s MUST |
|---|---|---|---|---|
| <model A> | 1850 | 3210 | 5400 | ✅ 9,800 |
| <model B> | 2100 | 3900 | 6700 | ✅ 11,200 |
| deterministic/keyless | 105 | 210 | 380 | ✅ 900 |

> **Cost curve (placeholder):** aggregate `estimatedUsd` and `cost per useful task`
> (METHODOLOGY.md §3.7) per model per run; flag any case with a `costUnavailableReasons`
> (missing accounting = failure, never zero).

---

## 6. Hallucination / grounding / safety scores

> These come from the answer harness scoring dimensions (`eval/answer/lib/scoring.ts`: 9/10
> bar; `right_answer`, `grounded_evidence`, `safe_boundary`, `can_proceed`,
> `generated_answer_ui`, `abandonment_risk`, `journey_continuity`). Example values.

| Dimension | Score (example, /10) | Notes |
|---|---|---|
| right_answer | 9.6 | grounded in correct registry result / boundary state |
| grounded_evidence | 9.8 | persisted evidence + tool input + timing asserted |
| safe_boundary | 10.0 | no booking/payment/dispatch claim leaks |
| can_proceed | 9.4 | one clear, actionable next step |
| generated_answer_ui | 9.2 | one-line/summary/next-step + streamed artifact match |
| abandonment_risk | 9.5 | low for resolved cases |
| journey_continuity | 9.7 | multi-turn reuse of frozen evidence |

> **Hallucination rate** = (example) 0.00 this run — zero fabricated capability/inputs
> across the corpus (§3.4). **Grounding citation-validity** = (example) 0.97.
> **Safety** = (example) 1.00 — hostile + boundary rows all refuse cleanly with no leak
> (engine + answer + consumer `RUBRIC.md`).

---

## 7. Model comparison

> Run the same golden corpus under each candidate model with the same seed and `--runs`.
> Example values — run yourself before trusting comparability.

| Model | TPR | FPR | Halluc. | Latency p95 | Cost/task | Deploy gate |
|---|---|---|---|---|---|---|
| <model A> | 0.94 | 0.00 | 0.00 | 3210 ms | $0.017 | ✅ |
| <model B> | 0.87 | 0.02 | 0.00 | 3900 ms | $0.019 | ⚠️ FPR>0 |
| <model C> | 0.78 | 0.00 | 0.01 | 5200 ms | $0.014 | ⚠️ halluc. |

> **Deterministic kernel note:** the deterministic/keyless path runs with zero model calls
> and is always included as the stability baseline (eval-ladder §3 Flow B).

---

## 8. What changed / what's next

### What changed this period
- **(example)** Slice A deterministic selection recovery — crypto/weather/geocode now
  resolve deterministically.
- **(example)** Slice B `needs_information` reachable — bare "weather"/"convert money"
  return a typed ask with the missing field.
- **(example)** Slice C cross-capability guard — no crypto→fiat false positive.
- **(example)** Slice D silenced internal fallback `[ERROR]` noise + latency stabilization.

### What's next
- **(proposed)** Measure and lock the [PROPOSED] SLO budgets (Flow A/B) once a seeded
  deployment + live harness run is recorded.
- **(proposed)** Grow the golden corpus to ≥100 cases with per-workflow balance
  (METHODOLOGY.md §4).
- **(proposed)** Stand up LLM-as-judge calibration (anchor grading + inter-rater +
  human-in-loop) for the residual open-ended quality dimensions (METHODOLOGY.md §5).
- **(proposed)** Derive and publish `cost per useful task` as an observed, not example,
  number.

---

_Generated from METHODOLOGY.md and REPORT-TEMPLATE.md (eval/quality/). This file is a
template; a published report must carry a date, run facts, and model(s), and must
distinguish observed vs [PROPOSED]/example values._
