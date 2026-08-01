# T17 — Model tiering, cost, and latency ceilings

Date: 2026-07-31. Research snapshot taken 2026-07-31 UTC from the live OpenRouter catalog and endpoint catalog. OpenRouter is AE's only model gateway (`OPENROUTER_API_KEY`).

## Decision in one paragraph

Use **OpenAI GPT-5.4 nano** for intent/classification, **OpenAI GPT-5.4 mini** for the proposal/planning segment, and **Anthropic Claude Haiku 4.5** for explanation/prose. Use **Google Gemini 3.5 Flash-Lite** as the intent and prose fallback, and **Google Gemini 3.1 Pro Preview** as the proposal fallback. The proposal path must send `response_format.type=json_schema` with `strict:true`, and OpenRouter must receive `provider.require_parameters:true`; otherwise an endpoint can ignore the schema. Keep the turn to a hard **$0.06** model-spend ceiling with explicit token caps. Set p95 budgets of **2s intent TTFT / 3s complete**, **5s proposal TTFT / 8s complete structured response**, and **6s explanation TTFT / 8s complete**. These are acceptance budgets, not claims that the gateway currently meets them.

The live endpoint telemetry snapshot had `latency_last_30m` and `throughput_last_30m` as `null` for every candidate below. Therefore no OpenRouter-route TTFT or p95 is asserted here; T19 must measure it on the actual gateway route. Provider claims below are useful directional evidence only and do not include OpenRouter, network, queue, or fallback overhead.

## Live OpenRouter price and capability table

Prices are USD per 1M text tokens, converted from the live catalog's per-token `pricing.prompt` and `pricing.completion` values. Context is the catalog `context_length`; endpoint context can be lower, so the endpoint value must be checked before routing. `S+RF` means the endpoint catalog currently advertises both `structured_outputs` and `response_format`; `RF only` is not sufficient evidence for strict native enforcement. Every row is a current OpenRouter model as of the snapshot.

| Model (OpenRouter ID) | Input / output | Context | Endpoint providers in live catalog | Endpoint JSON-schema support | Provider-published latency evidence |
| --- | ---: | ---: | --- | --- | --- |
| [GPT-5.4 nano](https://openrouter.ai/api/v1/models/openai/gpt-5.4-nano/endpoints) (`openai/gpt-5.4-nano`) | **$0.20 / $1.25** | 400,000 | OpenAI, Azure | **S+RF on all listed endpoints** | OpenAI calls it its cheapest GPT-5.4 model for classification/extraction/ranking/subagents; no numeric TTFT. |
| [GPT-5 nano](https://openrouter.ai/api/v1/models/openai/gpt-5-nano/endpoints) (`openai/gpt-5-nano`) | **$0.05 / $0.40** | 400,000 | OpenAI, Azure | **S+RF on all listed endpoints** | OpenAI calls it the fastest/cheapest GPT-5 and recommends it for summarization/classification; no numeric TTFT. |
| [Gemini 3.5 Flash-Lite](https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-lite/endpoints) (`google/gemini-3.5-flash-lite`) | **$0.30 / $2.50** | 1,048,576 | Google, Google AI Studio | **S+RF on all listed endpoints** | Google describes it as low-latency, high-throughput, and cost-effective; no numeric TTFT. |
| [Gemini 2.5 Flash-Lite](https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints) (`google/gemini-2.5-flash-lite`) | **$0.10 / $0.40** | 1,048,576 | Google, Google AI Studio | **S+RF on all listed endpoints** | Google Vertex provisioned-throughput SLA target is **110 output TPS**, excluding long context; its TPS starts at the first returned non-thinking token, so it is **not TTFT** and does not apply to OpenRouter. |
| [Mistral Small 4](https://openrouter.ai/api/v1/models/mistralai/mistral-small-2603/endpoints) (`mistralai/mistral-small-2603`) | **$0.15 / $0.60** | 262,144 | Mistral, Venice | **S+RF on all listed endpoints** | Mistral's model card gives no numeric TTFT/TPS figure. |
| [GPT-5.4 mini](https://openrouter.ai/api/v1/models/openai/gpt-5.4-mini/endpoints) (`openai/gpt-5.4-mini`) | **$0.75 / $4.50** | 400,000 | OpenAI, Azure | **S+RF on all listed endpoints** | OpenAI reports it runs **more than 2x faster than GPT-5 mini**, but says its latency estimate is offline simulation and real-world latency may vary; no TTFT. OpenAI's Scale Tier table lists a 100-TPS latency target, but that is a first-party service tier, not OpenRouter. |
| [Gemini 3.1 Pro Preview](https://openrouter.ai/api/v1/models/google/gemini-3.1-pro-preview/endpoints) (`google/gemini-3.1-pro-preview`) | **$2.00 / $12.00** | 1,048,576 | Google, Google AI Studio | **S+RF on all listed endpoints** | Google describes improved thinking, token efficiency, and reliable multi-step/agentic execution; no numeric TTFT. |
| [Claude Sonnet 4.6](https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-4.6/endpoints) (`anthropic/claude-sonnet-4.6`) | **$3.00 / $15.00** | 1,000,000 | Anthropic, Azure, Google, Amazon Bedrock | **S+RF on Anthropic/Azure/Bedrock; Google is RF-only** | Anthropic's comparison labels Sonnet 4.6 **Fast**; no numeric TTFT. |
| [GPT-5.4](https://openrouter.ai/api/v1/models/openai/gpt-5.4/endpoints) (`openai/gpt-5.4`) | **$2.50 / $15.00** below 272k input | 1,050,000 | OpenAI, Azure, Amazon Bedrock | **S+RF on OpenAI/Azure; Bedrock endpoint advertises neither** | OpenAI Scale Tier table lists 50 output TPS; not TTFT and not an OpenRouter guarantee. |
| [Claude Haiku 4.5](https://openrouter.ai/api/v1/models/anthropic/claude-haiku-4.5/endpoints) (`anthropic/claude-haiku-4.5`) | **$1.00 / $5.00** | 200,000 | Anthropic, Azure, Google, Amazon Bedrock | **S+RF on Anthropic/Azure/Bedrock; Google advertises neither** | Anthropic calls Haiku 4.5 the fastest model; no numeric TTFT. |

The source of truth for every price, context, model-level parameter, and endpoint/provider row is the [live OpenRouter model catalog](https://openrouter.ai/api/v1/models) plus each linked endpoint listing. Prices are not copied from provider memory or old model cards. OpenRouter may expose cache, image, audio, web-search, reasoning, and long-context surcharges in addition to the text prices above. In particular, the live catalog raises GPT-5.4 input/output to **$5 / $22.50** above 272k input and Gemini 3.1 Pro Preview to **$4 / $18** above 200k input; the turn caps below stay well below those thresholds.

## What “structured output support” means here

OpenRouter's [structured-output guide](https://openrouter.ai/docs/guides/features/structured-outputs) specifies `response_format: {type: "json_schema", json_schema: {...}}`, recommends `strict:true`, and explicitly warns that support is **per endpoint**, can change, and that strict enforcement varies by provider. It directs callers to set `provider.require_parameters:true` so an unsupported endpoint is not selected. The endpoint column above is therefore stronger evidence than the model-level `supported_parameters` list.
Google's [structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output) says the schema produces syntactically correct JSON but the application must still validate semantic values. This is why `S+RF` is a routing prerequisite, not a reliability claim.

The AE proposal call should:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "proposal",
      "strict": true,
      "schema": { "...": "the T16 proposal schema" }
    }
  },
  "provider": {
    "require_parameters": true,
    "allow_fallbacks": true
  }
}
```

This proves advertised API capability, not AE's pass rate. No primary-source schema-pass-rate benchmark was found for the small candidates above. **T19 must measure malformed JSON, missing fields, wrong enum values, refusal, truncation, retry rate, and full-schema pass^k for GPT-5.4 nano, GPT-5 nano, Gemini Flash-Lite, and Mistral Small 4 before any of them may replace the proposal default. Do not infer reliability from the presence of `structured_outputs`.**

## Role evaluation and recommendations

### (a) Intent / classification

| Candidate | Why it fits | Caveat | Decision |
| --- | --- | --- | --- |
| GPT-5.4 nano | Provider explicitly targets classification, extraction, ranking, and subagents; $0.20/$1.25, 400k; OpenAI/Azure endpoints all advertise S+RF. | No OpenRouter TTFT; schema pass rate still unmeasured. | **Default.** |
| Gemini 3.5 Flash-Lite | Google explicitly targets simple extraction, subagents, high-throughput, and low latency; 1M context; all six current endpoints advertise S+RF. | $2.50 output is higher than GPT-5.4 nano; no numeric TTFT. | **Fallback** and measured alternative. |
| GPT-5 nano | Cheapest at $0.05/$0.40; OpenAI calls it fastest/cheapest GPT-5 for classification; OpenAI/Azure S+RF. | Older/smaller model; structured-output pass rate is undocumented. | Cost-floor candidate; T19 gate before defaulting. |
| Gemini 2.5 Flash-Lite | $0.10/$0.40, 1M context; Google gives a 110-TPS provisioned-throughput target (not TTFT); all current endpoints S+RF. | Provider TPS does not transfer to OpenRouter; pass rate undocumented. | Strong low-cost experiment. |
| Mistral Small 4 | Low output cost at $0.15/$0.60, 262k context, and Mistral/Venice endpoints advertise S+RF. | No provider latency number and no schema pass-rate evidence. | Cost alternative only after T19. |

Route as `models:["openai/gpt-5.4-nano","google/gemini-3.5-flash-lite"]`, with `require_parameters:true`, `allow_fallbacks:true`, and a latency-preferred provider sort. Keep deterministic intents on the zero-model path; do not pay for this role when the kernel can classify the ask exactly.

**p95 budget:** first useful token **≤2.0s**, complete classification **≤3.0s**, including one OpenRouter provider retry/fallback. If a request cannot meet the budget, return a deterministic clarification or route to the proposal segment rather than silently spending more.

### (b) Proposal / planning with strict JSON schema

| Candidate | Why it fits | Caveat | Decision |
| --- | --- | --- | --- |
| GPT-5.4 mini | $0.75/$4.50, 400k; OpenAI calls it its strongest mini for high-volume/subagent work; every OpenAI/Azure endpoint advertises S+RF; provider supports structured outputs and streaming. | No numeric TTFT through OpenRouter; structured-output pass rate for AE's schema still needs T19. | **Default.** |
| Gemini 3.1 Pro Preview | $2/$12, 1M; Google says it improves thinking, token efficiency, groundedness, and reliable multi-step/agentic execution; all current endpoints S+RF. | Preview model; no numeric TTFT or AE schema pass rate. | **Fallback.** |
| Claude Sonnet 4.6 | $3/$15, 1M; Anthropic structured outputs are generally available for Sonnet 4.6 and document schema-constrained JSON as guaranteed valid/typed. | Live Google endpoints are RF-only; restrict to Anthropic/Azure/Bedrock with `require_parameters:true`, or they may not provide native structured outputs. | Quality escalation, not default. |
| GPT-5.4 | $2.50/$15 below 272k, 1.05M; high-capability proposal option; OpenAI/Azure S+RF. | Live Bedrock endpoint advertises neither schema parameter; restrict provider. Costly and no OpenRouter TTFT. | Manual/high-value escalation only. |
| Mistral Small 4 | $0.15/$0.60, 262k; every current endpoint advertises S+RF. | Small-model structured-output reliability and latency are undocumented. | **T19 measurement candidate, not a reliability assumption.** |

Use `models:["openai/gpt-5.4-mini","google/gemini-3.1-pro-preview"]`, `require_parameters:true`, and `allow_fallbacks:true`. A Claude escalation must use `only:["anthropic"]` (or another explicitly verified S+RF provider) rather than broad routing; OpenRouter notes that `only` reduces fallback options, so retain the model fallback list for recovery. The kernel validates the returned proposal against T16 regardless of provider claims.

**p95 budget:** first useful streamed token **≤5.0s**, complete schema-valid response **≤8.0s**, including one provider retry/fallback. Cap reasoning effort and output tokens; do not raise the budget to accommodate a slow model. If no schema-valid proposal arrives within the budget, preserve the deterministic state and ask a clarifying question.

### (c) Explanation / prose

| Candidate | Why it fits | Caveat | Decision |
| --- | --- | --- | --- |
| Claude Haiku 4.5 | Anthropic calls it the fastest Claude; $1/$5, 200k; good fit for concise explanation after the kernel has decided. | Google endpoints advertise neither JSON parameter; irrelevant for plain prose, but restrict providers if a schema is ever added. No numeric TTFT. | **Default.** |
| Gemini 3.5 Flash-Lite | Google explicitly calls it low-latency and cost-effective for high-volume agentic workflows; 1M; all endpoints S+RF. | No numeric TTFT; output cost is $2.50/MTok. | **Fallback.** |
| GPT-5.4 mini | $0.75/$4.50, 400k; OpenAI reports >2x speed over GPT-5 mini and supports streaming. | More expensive than nano for prose; OpenRouter TTFT unavailable. | Quality/longer explanation alternative. |
| Mistral Small 4 | $0.15/$0.60, 262k; cheapest prose candidate after GPT-5 nano and has two S+RF endpoints. | No provider latency benchmark; quality and schema pass rate unverified. | Cost experiment after T19. |
| Claude Sonnet 4.6 | Anthropic labels it fast and provides 1M context; strongest prose quality among this set. | $3/$15; Google endpoint is RF-only. | Quality escalation only. |

Route as `models:["anthropic/claude-haiku-4.5","google/gemini-3.5-flash-lite"]` with streaming, `allow_fallbacks:true`, and latency-preferred provider sorting. Explanation is not allowed to change the plan, action selection, budgets, or approval state.

**p95 budget:** first useful token **≤6.0s**, complete explanation **≤8.0s**. The UI may render streamed prose, but only the persisted kernel result is authoritative.

## Cost ceiling

The ceiling is enforced with hard per-call token caps, not an average. Use these caps for an open-ended turn:

| Segment | Input cap | Output cap | Default model | Max cost at catalog price |
| --- | ---: | ---: | --- | ---: |
| Intent | 2,000 | 300 | GPT-5.4 nano | $0.000775 |
| Proposal | 8,000 | 1,200 | GPT-5.4 mini | $0.011400 |
| Optional compare/refinement | 4,000 | 600 | GPT-5.4 mini | $0.005700 |
| Explanation | 4,000 | 800 | Claude Haiku 4.5 | $0.008000 |

The normal three-call path (intent + proposal + explanation) is **$0.020175** at the live catalog prices. A four-call path with the optional compare/refinement segment is **$0.025875**. To budget conservatively for one proposal primary failure followed by Gemini 3.1 Pro fallback, add the fallback's 8,000/1,200 cost (**$0.030400**) even if the failed attempt produced no billable tokens. The hard aggregate ceiling is therefore **$0.06 per open-ended turn**. At the ceiling, stop further model calls, emit the best validated state, or ask for clarification. Do not use provider fallbacks to bypass the aggregate budget.

OpenRouter's [model fallback documentation](https://openrouter.ai/docs/guides/routing/model-fallbacks) confirms that a `models` list is tried in order and fallback can trigger on context errors, moderation, rate limits, or downtime; pricing is for the model ultimately used. Its [provider-selection documentation](https://openrouter.ai/docs/guides/routing/provider-selection) says default routing is price/uptime-weighted, `allow_fallbacks` defaults true, `require_parameters` defaults false, and `sort:"latency"` prefers lower-latency providers but is not a guarantee. AE should set these explicitly and record the actual provider/model and usage in telemetry.

## Latency evidence boundary and T19 handoff

- OpenRouter's live endpoint listings reported no 30-minute latency or throughput values for these candidates at the snapshot time. There is therefore no evidence-backed OpenRouter TTFT or p95 number to copy into a design.
- OpenAI's published GPT-5.4 mini/nano comparison says mini is more than 2x faster than GPT-5 mini, but explicitly describes latency as an offline simulation whose real-world result may vary substantially. It gives no TTFT.
- Google's Vertex SLA gives 60/80/110 output TPS for Gemini 2.5 Pro/Flash/Flash-Lite under provisioned throughput, calculated from the first returned non-thinking token to the last. This is decode speed, not TTFT, and does not cover OpenRouter.
- Anthropic defines TTFT and recommends streaming/short prompts; its model overview labels Haiku 4.5 fastest and Sonnet 4.6 fast, but publishes no numeric TTFT for these models.
- Mistral Small 4's official card publishes no latency figure.

T19 must run at least 30 cold and warm streamed calls per candidate/provider route, with the same AE prompts and schemas, and record p50/p95 TTFT, time to first useful token, full structured completion, timeout/fallback rate, token usage, cost, and schema pass^k. The suite must separately test every provider advertised by OpenRouter for strict JSON and must treat a missing `structured_outputs` endpoint parameter as an ineligible route, not as a pass.

## Sources

- [OpenRouter live model catalog](https://openrouter.ai/api/v1/models) and the linked per-model endpoint listings in the price table.
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks).
- [OpenAI GPT-5.4 nano model docs](https://developers.openai.com/api/docs/models/gpt-5.4-nano), [GPT-5.4 mini model docs](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [GPT-5 nano model docs](https://developers.openai.com/api/docs/models/gpt-5-nano), and [GPT-5.4 mini/nano announcement and benchmark caveat](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/).
- [Google Gemini 3.5 Flash-Lite model docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Gemini 3.1 Pro Preview model docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview), and [Gemini Online Inference SLA](https://cloud.google.com/vertex-ai/generative-ai/sla).
- [Anthropic models overview](https://platform.claude.com/docs/en/about-claude/models/overview), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), and [latency guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency).
- [Mistral Small 4 model card](https://docs.mistral.ai/models/model-cards/mistral-small-4-0-26-03).
