# T17 — Model tiering + cost/latency ceilings for the hero surface

Labels: `wayfinder:research` (AFK). Status: closed. Map: [Agent engine](../MAP-engine.md).

## Question

Which OpenRouter models serve each engine role, at what ceilings? Roles: (a) intent/classification (small, fast), (b) proposal/planning segment (capable, structured-output reliable), (c) explanation/prose. For current candidates: price per 1M tokens, measured latency to first token and full structured response, JSON-schema/structured-output reliability, context window. Recommend a default + fallback per role with a per-turn cost ceiling and p95 latency budget (verdict targets: deterministic <1s; model side streamed, <8s to first useful token). Primary sources: OpenRouter model listings/docs and provider benchmarks; verify prices from the live catalog, not memory.

## Resolution

Recommended defaults: GPT-5.4 nano for intent, GPT-5.4 mini for strict-schema proposals, and Claude Haiku 4.5 for prose; fall back to Gemini 3.5 Flash-Lite for intent/prose and Gemini 3.1 Pro Preview for proposals. Enforce `response_format.type=json_schema`, `strict:true`, `provider.require_parameters:true`, a **$0.06 hard per-turn model ceiling**, and p95 budgets of 2s intent TTFT / 5s proposal TTFT with 8s complete / 6s prose TTFT (8s complete). OpenRouter route telemetry was unavailable (`latency_last_30m=null`); T19 must measure TTFT, schema pass^k, fallback, and cost. Findings: [2026-07-31 model tiering research](../../research/2026-07-31-model-tiering.md).
