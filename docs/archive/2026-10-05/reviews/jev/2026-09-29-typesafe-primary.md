> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Findings

## System One, source-of-truth contract

- **What it is.** System One is TypeSafe AI's model family for fast, *text-in, typed probabilistic decision-out* inference; Jev is its first public model. It does not generate free-form text, explanations, code, or executable trades; exact arithmetic belongs in code. TypeSafe describes a parallel sampler and training for calibrated decisions (RLCD). Calibration is a claim about *groups* of predictions, **not a guarantee that one decision is correct**. [System One](https://docs.typesafe.ai/concepts/system-one.md), [announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md).
- **Wire request:** `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer …`, `{ state, model, questions: { [questionId]: question } }`; the response is `{ model, answers: { [questionId]: answer }, usage: { input_tokens, output_tokens } }`. SDK `TypeSafeClient.systemOne({ state, questions, model? }, { timeout?, signal?, retry?, headers? })` fills its default model (`jev-latest`). State is one string/JSON object/array (or `null` according to the JS declaration); all questions see the **same state independently**; question IDs identify answers but are **not model-visible**. Different states are not an SDK batch endpoint. [API](https://docs.typesafe.ai/api.md), [state](https://docs.typesafe.ai/concepts/state.md), [SDK types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts), [SDK client](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/client.ts).
- **Installed version:** `@typesafe-ai/sdk@0.6.0`; local `node_modules/@typesafe-ai/sdk/README.md`, `package.json`, and `dist/index.d.mts` agree with the fetched official [README](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/README.md) and [source types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts). The npm package contains `dist/` but not `src/`; the linked official repository supplies source. Do not substitute Python SDK method names (`system_one`, `NoulCriteria`) for JS exports (`systemOne`, `noul`). [JS builder source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/questions.ts).

### Exact TypeScript shapes (`@typesafe-ai/sdk@0.6.0`)

Copied in substance from installed `node_modules/@typesafe-ai/sdk/dist/index.d.mts:35-156,180-190,249-300,381-407` and [the matching official source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts); `readonly` and optional fields preserved. `ScoreOf` and `ScoreLegend` preserve tuple-index inference.

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type EntryType = string | { [key: string]: JsonValue } | JsonValue[] | null;
type Description = EntryType;
type ChoiceCriteria = { [label: string]: Description };
type ScoreCriteria = readonly [EntryType, EntryType, ...EntryType[]];

interface NoulQuestion {
  type: "noul";
  instructions?: EntryType;
  criteria?: { true?: EntryType; false?: EntryType } | null;
}
interface ChoiceQuestion<T extends ChoiceCriteria = ChoiceCriteria> {
  type: "choice";
  instructions?: EntryType;
  criteria: T;
}
interface ScoreQuestion<T extends ScoreCriteria = ScoreCriteria> {
  type: "score";
  instructions?: EntryType;
  criteria: T;
}
type Question = NoulQuestion | ScoreQuestion | ChoiceQuestion;
interface Questions { [name: string]: Question }

interface NoulResponse { readonly type: "noul"; readonly noul: number }
interface ChoiceResponse<T extends ChoiceCriteria = ChoiceCriteria> {
  readonly type: "choice";
  readonly choice: keyof T & string;
  readonly confidence: number;
  readonly probabilities: { readonly [label in keyof T]: number };
}
type ScoreOf<T extends ScoreCriteria> = number extends T["length"]
  ? number : Extract<keyof T, `${number}`>;
type ScoreLegend<T extends ScoreCriteria> = { readonly [score in ScoreOf<T>]: T[score] };
interface ScoreResponse<T extends ScoreCriteria = ScoreCriteria> {
  readonly type: "score";
  readonly score: number;
  readonly confidence: number;
  readonly legend: ScoreLegend<T>;
  readonly probabilities: { readonly [score in ScoreOf<T>]: number };
}
type ResultFor<T extends Question> = T extends NoulQuestion ? NoulResponse
  : T extends ScoreQuestion<infer S> ? ScoreResponse<S>
  : T extends ChoiceQuestion<infer E> ? ChoiceResponse<E> : never;
interface SystemOneRequest<Q extends Questions = Questions> {
  state: EntryType;
  questions: Q;
  model?: string;
}
interface SystemOneResult<Q extends Questions> {
  readonly model: string;
  readonly answers: { readonly [K in keyof Q]: ResultFor<Q[K]> };
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}
// API: systemOne<const Q extends Questions>(request: SystemOneRequest<Q>,
//   options?: RequestOptions): APIPromise<SystemOneResult<Q>>;
// Builders: noul(instructions?: EntryType, criteria?: NoulQuestion["criteria"]): NoulQuestion;
// choice<const T extends ChoiceCriteria>(instructions: EntryType, criteria: T): ChoiceQuestion<T>;
// score<const T extends ScoreCriteria>(instructions: EntryType, criteria: T): ScoreQuestion<T>;
```

| Primitive | Exactly what the answer means | Do not mistake it for |
| --- | --- | --- |
| `choice` | One highest-probability label from `criteria` (names → descriptions or `null`); `probabilities` is the distribution over **those labels** (sums to 1); `confidence` is 0–1 concentration of that distribution, **not** the winner's probability. Include `none`/`other` when the candidate set can be incomplete. Up to 255 labels. [Choice](https://docs.typesafe.ai/primitives/choice.md), [confidence](https://docs.typesafe.ai/confidence.md), [API](https://docs.typesafe.ai/api.md). | An absolute fitness score: a forced winner exists among offered labels; low confidence or an explicit `none` may be needed. |
| `score` | Ordered descriptions at levels `0 … criteria.length-1` (JS allows `null` entries); `score` is the probability-weighted **expected level**, possibly fractional; `legend` maps stringified level indices to descriptions; `probabilities` sums to 1 across levels; `confidence` measures concentration, not numeric accuracy. Minimum 2 levels in the SDK; HTTP API maximum 10 levels. Normalize by `criteria.length-1` only if mixing different-length rubric scores. [Score](https://docs.typesafe.ai/primitives/score.md), [API](https://docs.typesafe.ai/api.md). | An exact monetary value, measured quality or interpolated physical magnitude: Jev 1.13's numeric calibration of Score levels is explicitly weak. [Jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). |
| `noul` | `noul ∈ [0,1]` is the model's estimate of **P(yes)** for the *stated binary proposition*, with optional `criteria.true`/`.false`. No separate confidence. A 0.5 value says yes/no equally likely, **not** medium intensity. Tune action thresholds on labeled examples and risk. [Noul](https://docs.typesafe.ai/primitives/noul.md), [confidence](https://docs.typesafe.ai/confidence.md). | A shared, directly comparable 0–1 quality metric across differently worded questions or a two-option Choice. TypeSafe documents violations of expected cross-question complement/representation identities. [Jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). |

**Determinism and reproducibility:** TypeSafe calls the model more consistent than autoregressive LLM decisions; its [13-question batch experiment](https://docs.typesafe.ai/cookbooks/parallel_questions.md) found 11 questions identical across five repeats and minor run-to-run variance in two Noul questions (some numbers differ even across strategies). Its [Choice consistency test](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook.md) records label flips for 2/8 questions and 90.8% agreement before abstention; [Noul test](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md) records threshold crossings. **No byte-for-byte determinism guarantee.** A stable alias is not a pinned version: `jev-latest` and `jev-preview` currently resolve to `jev-1.13.0`, but aliases move; log `response.model` and pin a version if tuning thresholds. [Models](https://docs.typesafe.ai/models.md). Confidence and probability calibration must be evaluated on aecon's own labeled candidate decisions, not assumed transferable from those examples. [System One](https://docs.typesafe.ai/concepts/system-one.md), [confidence](https://docs.typesafe.ai/confidence.md).

### Published operating constraints and cost

| Constraint | Documented finding and consequence |
| --- | --- |
| Latency | TypeSafe *reports* 70–500 ms end-to-end for its hosted service, with published measurements from West Coast laptops; **not a p99/SLA or aecon/OpenRouter guarantee**. Its batch example observed 0.27 s for one request versus **2.71 s summed sequential latency** for 13 single-question requests; concurrency shrinks the speed gap. [Announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [batch cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions.md). |
| Pricing | Direct TypeSafe `jev-1.13.0`: **USD $0.042 per million input tokens ($42/billion); output tokens free**. Example 13-question batch: $0.000497 vs $0.006090 for 13 separate requests on `jev-1.12` at the same quoted rate, a *workload-specific* 12.2× saving. **OpenRouter reseller price not established by these sources.** [Models](https://docs.typesafe.ai/models.md), [batch cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions.md). |
| Input/candidate limits | Text only; no image/audio/video. `jev-1.13.0`: 64k tokens total (`state` + all questions), 32k tokens for `state` + **longest individual question**; putting all candidate descriptions into state can exceed either budget and harm relevance via distractors. `choice` maximum 255 labels, `score` 2–10 levels. **No published fixed maximum number of question IDs** in sources read; constrained by token budgets and rate limits. [Models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md), [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). |
| Throughput | Published default limits 250,000 tokens/s and 1,200 requests/min, dynamically adjustable without notice. API lists 401 auth, 422 validation, 429 rate limit, 529 overload; SDK source retries 408/429/5xx, connection failures and timeouts by default. [Models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md), [SDK retries](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/retry.ts). |
| Timeout/retries | JS SDK default `timeout=10_000` **ms per attempt**, `maxRetries=2` *after* initial attempt, backoff 500–5000 ms, honors Retry-After up to 60 s; **no total retry budget**. `RequestOptions.timeout` overrides an attempt, not an entire multi-retry call. aecon overrides timeout to 1,500 ms normal / 5,000 ms discovery and retries differently in `src/modules/decision-engine/jev-client.ts:11-13,55-103`. [SDK types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts), [retry source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/retry.ts). |
| SDK boundary | `validateQuestions` rejects zero questions and Score criteria not an array of ≥2. `systemOne` can reject with `TypeSafeError`, `APIError` (HTTP, including auth/limits), `APIConnectionError`/`APITimeoutError`, or `APIUserAbortError`; client refuses browser use by default to protect the key. [SDK questions](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/questions.ts), [SDK client](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/client.ts), [SDK types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts). |
| When **not** to ask | Arithmetic/counting, dates ordering, exact amounts and typed invariants belong in code. Avoid complex indirect instructions, double negatives, large irrelevant state, and contradictory criteria. Jev 1.13 may follow adversarial text inside `state`; descriptions are **not automatically safe**. It does not generate free text and is weaker outside English. [Jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md), [models](https://docs.typesafe.ai/models.md), [how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md). |

**Call-count caveat:** One state + many independent named questions is the genuinely documented batching seam. TypeSafe's actual [re-ranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md) makes **1,200 separate calls** (40 queries × 30 candidate passages; one state/query–candidate pair per call), not one call per shortlist; it improves *that* corpus's top-1 5% → 18% and top-10 38% → 62%, not aecon quality by implication. In contrast aecon's `src/modules/registry/tool-reranker.ts:320-375` and `src/modules/market/x402-directory-reranker.ts:35-65` already batch per-candidate Nouls into **one state/one call**; `presentToolSearch` also batches a presentation Choice. Do not count this existing behavior as a new optimization. TypeSafe's [parallel cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions.md) warns answers have residual sampling noise, while recommending same-state multi-question batching.

### Official published patterns and demos (question shape → aecon seam)

The following are first-party pages fetched; cookbook performance numbers, where given, are *their example workload*, not promised aecon results. `C`, `S`, `N` below mean `Choice`, `Score`, `Noul`, respectively. No novel SDK primitive is implied.

| Official pattern | Primary URL | Published question shape and closest aecon change |
| --- | --- | --- |
| Speculative fan-out | https://docs.typesafe.ai/patterns/fan-out.md | Same state, independent `C` category + `S` severity + `N` flags; code ignores irrelevant answers. `presentToolSearch` already uses `C` use + `N` match in one call; possible only for additional *independent* decisions. |
| Composite scoring | https://docs.typesafe.ai/patterns/composite-scoring.md | Several atomic `S` dimensions in one call, normalize and weight **in code**. Compare semantic candidate fit only; preserve `scoreToolEvidence`'s exact reliability/price computation. |
| Intent routing | https://docs.typesafe.ai/patterns/intent-routing.md | `C` intent + `S` complexity; deterministic/specialist/human route in code. Similar to `presentationQuestion` in `tool-reranker.ts`. |
| Confidence-gated routing | https://docs.typesafe.ai/patterns/confidence-routing.md | `C` intent and *action-specific* confidence gates; useful only with aecon-labeled thresholds and user confirmation for consequential buyer actions. |
| Parallel questions | https://docs.typesafe.ai/cookbooks/parallel_questions.md | One long shared state, 8 `N` + 2 `C` + 3 `S` in one call; reported 12.2× cheaper / 10× faster vs **sequential** 13 separate calls. Candidate semantic dimensions could share a request where context fits. |
| Re-ranking | https://docs.typesafe.ai/cookbooks/rerank_typesafe.md | Fast BM25 shortlist, **one `N` per candidate in separate calls** in this cookbook, sort P(yes). aecon `scoreToolSearch` and `rerankX402DirectoryPage` already pack independent `N`s into one call; preserve recall/threshold distinction. |
| Line-by-line search | https://docs.typesafe.ai/cookbooks/semantic_find.md | `C` over 218 line IDs plus `N` document-contains-answer in one call; a forced winning line needs independent existence gate. Candidate choice plus absolute fit gate in `tool-reranker.ts`; 255-label cap. |
| Structure recovery | https://docs.typesafe.ai/cookbooks/autoformat.md | First call `N` per adjacent-line join; dependent second call `C` block type plus speculative `C` subtypes. Relevant only when parsing poor supplier text, not current selection. |
| Function calling **trading demo** | https://docs.typesafe.ai/cookbooks/function_calling.md | One request with `C` across 10 *existing trading functions*, `C` per closed-set argument, `N` per optional-argument-present and set member (54 questions). Code then calls typed `plot_price`, `rolling_correlation`, `compare_returns`, etc. Mapping user intent to aecon Tool + typed closed-set arguments is portable; **no stock prediction, autonomous trading strategy, or trade recommendation** shown. |
| Skill suggestion | https://docs.typesafe.ai/cookbooks/skill_suggestion.md | Two calls: `C` over 182 short skill descriptions + `N` need-skill flags; re-evaluate top three with long descriptions via `C` plus `N` absolute fit. `tool-reranker.ts`/`x402-directory-reranker.ts` could recheck ambiguous top candidates, not entire directory. |
| Entity alignment | https://docs.typesafe.ai/cookbooks/entity_alignment.md | One `S` different/review/same + three `N` matching fields **per entity pair**; use only for overlapping Tool identity dedupe, not price/reliability. |
| RAG passage classifier/filter | https://docs.typesafe.ai/cookbooks/classifying_rag_passages.md | Four `N`s per retrieved passage (relevance, usable evidence, contradicts premise, instructs model) in one request per passage; could screen `tool-reranker.ts` candidate descriptions but not replace provider facts checks. |
| Citation judge | https://docs.typesafe.ai/cookbooks/citation_check.md | Exact substring existence in code, then `C` supports/contradicts/does-not-support with confidence gate; could vet source excerpts selected in `assessSupplySource` before display. |
| LLM guardrails | https://docs.typesafe.ai/cookbooks/llm_guardrails.md | One call/message with hazard `N`s plus harm `S`, code passes/reviews/blocks/routes; prompt-injection signal is **not** a security boundary. |
| Structured-data-extraction cascade | https://docs.typesafe.ai/cookbooks/sde_cascade.md | Small generative model extracts; Jev `N` per field estimates P(wrong); code escalates flagged cases to reasoning model. Not a Jev-native string extractor. |
| Date extraction | https://docs.typesafe.ai/cookbooks/date_extraction_cookbook.md | Seven parallel `C`s (absolute/relative/none; month/day/year/weekday/offset); calendar arithmetic and validity in code. Buyer constraints only if source free text contains a date. |
| Pre-parsed value extraction | https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook.md | Regex enumerates candidates, `C` picks a verbatim span or none; companion `C` labels currency/country and `N` credit flag, normalization in code. No generated price/endpoint invention. |
| Hierarchical classification | https://docs.typesafe.ai/cookbooks/hierarchical_classification.md | `C` at each taxonomy node, concurrent independent `C`s for beam frontier; sequential depth remains; code combines path probabilities. Relevant to grouping huge catalogues before buyer selection, not one 20k-label Choice. |
| Classification using confidence | https://docs.typesafe.ai/cookbooks/classification_using_confidence.md | One `C` over 75 industry groups; confidence below local threshold falls back **in code** to broader parent division, no extra call. Possible aecon broad category when fine-grained Tool fit is ambiguous. |
| Self-consistency: Nouls | https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md | 14 `N` claim checks/call repeated 15 times; near-threshold numbers vary; uncertain band routes review. Caution for aecon `SEARCH_MATCH_SCORE`/buyer selection thresholds. |
| Self-consistency: Choices | https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook.md | Eight `C` moderation judgments/call, 15 repeats; low top-probability → `uncertain` outcome in code. Top-label reversals on ambiguous selections are possible. |
| Autoresearch feature discovery | https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery.md | Offline LLM proposes `S` + `N` question features; Jev probabilities/expected levels feed a **separately trained CatBoost** supervised regressor. Only applicable with labeled aecon outcomes and evaluation, not a drop-in production selector. |
| Smart-home agent demo | https://docs.typesafe.ai/demos/smart-home.md | Upfront `C` category/domain/device/action (+ `N` multi-action), code executes relevant fields; an LLM handles free-form responses and splitting compound actions. Source promises future demo code, not published source. |

## Port candidates

These are **evaluation candidates, not recommended code edits**. Latency cost is a request-count direction from published mechanics, not a measured aecon p95; aecon already has some batching. All choices remain subordinate to deterministic eligibility and observed outcome/price ranking.

| Pattern | Primary source URL | Which aecon file/symbol it would change | Latency cost | Risk |
| --- | --- | --- | --- | --- |
| `C` shortlist winner **plus absolute `N` fit/none**: relative winner is not proof any Tool meets buyer intent; keep model for semantic eligibility and code for reliability/price | https://docs.typesafe.ai/cookbooks/semantic_find.md ; https://docs.typesafe.ai/cookbooks/skill_suggestion.md ; https://docs.typesafe.ai/model-jaggedness/jev-1.13.md | `src/modules/registry/tool-reranker.ts` `scoreToolSearch`/`presentToolSearch`; retain `src/modules/registry/tool-selection-score.ts` `rankToolsForSelection` as authoritative observed evidence | Same one batched call if independent candidate questions fit context; optional fuller shortlist recheck adds second call | Forced Choice winner, prompt injection from untrusted listings, context rot; calibrated thresholds are workload/version-specific |
| Ambiguous shortlist **two-stage recheck**: compact catalog then detailed top few with per-candidate `N` fit and `C` among top candidates; skip call two when unambiguous by code rule | https://docs.typesafe.ai/cookbooks/skill_suggestion.md | `src/modules/market/x402-directory-reranker.ts` `rerankX402DirectoryPage`; `src/modules/registry/tool-reranker.ts` `scoreToolSearch` | Second round trip only for ambiguous queries; first remains current one call | More latency under 5 s discovery budget, source descriptions may be adversarial or stale, one request may fail |
| Speculative semantic rubric: candidate `N` direct-fit + `N` missing constraint + `C` presentation, or rubric `S` for **semantic dimensions only**; weight exact buyer price/reliability in code | https://docs.typesafe.ai/patterns/fan-out.md ; https://docs.typesafe.ai/patterns/composite-scoring.md ; https://docs.typesafe.ai/cookbooks/parallel_questions.md | `src/modules/registry/tool-reranker.ts` `scoreToolSearch`/`presentationQuestion`; `src/modules/registry/tool-selection-score.ts` `rankToolsForSelection` consumes only validated semantic ordering, not model arithmetic | One request if state shared, more input/output tokens; published 13-question example 0.27 s vs 2.71 s summed serial calls **not an aecon measurement** | Weak numerical Score calibration, contradictory/rubric questions, many candidates add token cost; don't treat Noul as degree of fit |
| Typed closed-set argument extraction **only after** selecting callable operation; code owns defaults and numeric inputs | https://docs.typesafe.ai/cookbooks/function_calling.md | `src/modules/registry/tool-reranker.ts` `presentToolSearch` (selection seam); downstream argument mapping only after a separately scoped design | Same call if question specs known in advance; dependent tool-specific schema may need another call | Request size scales with functions × arguments; no evidence Jev handles arbitrary free text, amounts or dates reliably |
| Offline question-feature learning on **labeled aecon live outcomes**, not generated synthetic ranking accuracy | https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery.md ; https://docs.typesafe.ai/concepts/system-one.md | `src/modules/registry/tool-selection-score.ts` `scoreToolEvidence`/`rankToolsForSelection` **only after** held-out buyer outcome study | Offline training plus model feature-inference call(s) if deployed; not free | Label leakage, selection bias, trained model operational dependency versus current deterministic scorer |

## Rejected

- **Replacing `rankToolsForSelection`'s price, success-count, payer/adoption, Laplace prior, or user-history arithmetic with Jev `score`:** the authoritative [jaggedness note](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) explicitly directs arithmetic and numeric precision to code. Existing deterministic scorer is `src/modules/registry/tool-selection-score.ts:27-69`.
- **One `choice` over the whole x402 directory or accepting its top probability as absolute relevance:** 255-choice cap, 64k/32k budgets, and forced winner. Use retrieval and, if needed, independent absolute Nouls/explicit `none`. [Models](https://docs.typesafe.ai/models.md), [Choice](https://docs.typesafe.ai/primitives/choice.md), [semantic find](https://docs.typesafe.ai/cookbooks/semantic_find.md).
- **Porting the legal-reranker accuracy gain or claiming it was already one HTTP request per 30 candidates:** that [cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md) explicitly runs 1,200 individual pair calls on CLERC; aecon already uses one batched question map per page (`tool-reranker.ts:351-375`, `x402-directory-reranker.ts:47-65`).
- **Using Jev as a standalone financial trading signal, numerical forecaster, trade executor, or market judge:** the [published trading cookbook](https://docs.typesafe.ai/cookbooks/function_calling.md) parses natural-language *requests to existing plotting/stats functions* and executes code; it does not report alpha, prediction, brokerage order placement, or investment decision accuracy.
- **Treating probability as a guarantee/security proof or moving a Noul threshold unchanged to Choice:** [System One](https://docs.typesafe.ai/concepts/system-one.md) states calibration is across groups; [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) documents adversarial content and incompatible probabilities across formulations.

**Explicitly unverified / inaccessible:** No published Jev p95/p99 service SLA, bit-for-bit determinism guarantee, absolute per-request question-count ceiling, or aecon/OpenRouter-specific Jev billing and latency was verified in fetched TypeSafe primary sources. No first-party TypeSafe **trading signal/forecasting** cookbook was found in the [official cookbook index](https://docs.typesafe.ai/llms.txt); only the function dispatcher cited above. `https://typesafe.ai/pricing` returned HTTP 404; pricing above is from the fetched [official models page](https://docs.typesafe.ai/models.md) and founder [announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev), **not** that failed page. The [smart-home demo page](https://docs.typesafe.ai/demos/smart-home.md) says its app source will be available on GitHub at release, so no source code for that demo was verified here. No live credentialed inference was run; official notebook cached results are cited as published reports, not independently reproduced.

## Sources

- Installed primary package: `node_modules/@typesafe-ai/sdk/README.md`, `package.json`, `dist/index.d.mts` (version 0.6.0); official repository: https://github.com/typesafe-ai/typesafe-sdk-js ; https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/README.md ; https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts ; https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/client.ts ; https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/questions.ts ; https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/retry.ts
- Index and protocol: https://docs.typesafe.ai/llms.txt ; https://docs.typesafe.ai/api.md ; https://docs.typesafe.ai/models.md ; https://docs.typesafe.ai/concepts/system-one.md ; https://docs.typesafe.ai/concepts/state.md ; https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md ; https://docs.typesafe.ai/model-jaggedness/jev-1.13.md ; https://typesafe.ai/blog/introducing-system-one-models-and-jev
- Primitives: https://docs.typesafe.ai/primitives.md ; https://docs.typesafe.ai/primitives/choice.md ; https://docs.typesafe.ai/primitives/score.md ; https://docs.typesafe.ai/primitives/noul.md ; https://docs.typesafe.ai/confidence.md
- Patterns: https://docs.typesafe.ai/patterns/fan-out.md ; https://docs.typesafe.ai/patterns/composite-scoring.md ; https://docs.typesafe.ai/patterns/intent-routing.md ; https://docs.typesafe.ai/patterns/confidence-routing.md
- Cookbooks: https://docs.typesafe.ai/cookbooks/parallel_questions.md ; https://docs.typesafe.ai/cookbooks/rerank_typesafe.md ; https://docs.typesafe.ai/cookbooks/semantic_find.md ; https://docs.typesafe.ai/cookbooks/autoformat.md ; https://docs.typesafe.ai/cookbooks/function_calling.md ; https://docs.typesafe.ai/cookbooks/skill_suggestion.md ; https://docs.typesafe.ai/cookbooks/entity_alignment.md ; https://docs.typesafe.ai/cookbooks/classifying_rag_passages.md ; https://docs.typesafe.ai/cookbooks/citation_check.md ; https://docs.typesafe.ai/cookbooks/llm_guardrails.md ; https://docs.typesafe.ai/cookbooks/sde_cascade.md ; https://docs.typesafe.ai/cookbooks/date_extraction_cookbook.md ; https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook.md ; https://docs.typesafe.ai/cookbooks/hierarchical_classification.md ; https://docs.typesafe.ai/cookbooks/classification_using_confidence.md ; https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md ; https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook.md ; https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery.md
- Demo: https://docs.typesafe.ai/demos/smart-home.md
- Tried but **failed (HTTP 404; not read/cited as evidence)**: https://typesafe.ai/pricing
