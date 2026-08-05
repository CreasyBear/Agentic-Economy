# Agentic Market bundles — observable composition contract

**Date:** 2026-08-04  
**Sources:** public `https://agentic.market/bundles/market-research`, `/bundles/*`, homepage
**Evidence class:** public source (mutable website/API projection). Not an executable contract or authoritative capability record.

## What a bundle is

Agentic Market's **Bundle** is the observable *composition* layer over its service/endpoint
registry. A service is one executable capability; a bundle is a human-authored orchestration of
several heterogeneous services into one route with a named outcome. This is the closest thing on
agentic.market to AE's Customer Request composes a multi-capability route.

Bundles are first-class objects: they have their own URL namespace (`/bundles/{slug}`),
`bundleId`, name, tagline, description, cost estimate, success rate, and a rendered page with an
**Agent Prompt**, a **Snapshot** result, and an ordered **Services in this Bundle** list. They appear
on the homepage filter ("Bundles") alongside Services/Endpoints.

## Observable schema (from the Market Research bundle page)

```
Bundle
  name, tagline, description
  costPerRun      -> "$0.03-0.04"
  successRate     -> "4/5"
  services[]      -> { service, provider, price, category-composition-hint }
  workflow[]      -> ordered/parallel/optional/fallback steps
  agentPrompt     -> human/agent instructions embedding the workflow
  snapshot        -> the composed result projection
```

### Sample bundle — Market Research

Services used (7), each with a **composition hint** in its line:

| Service | Provider | Price | Composition role |
|---|---|---|---|
| Exa Neural Search | Blockrun | $0.007 | Search — parallel with Parallel Search |
| Parallel Search | Parallel | $0.01 | Search — parallel with Exa |
| Stock Quote | toon.haus | $0.001 | Financial Data — optional, parallel |
| Stock Peers | toon.haus | $0.001 | Financial Data — optional, parallel |
| Analyst Recs | toon.haus | $0.001 | Financial Data — optional, parallel |
| Exa Contents | Blockrun | $0.002 | Content Extraction — optional, fallback |
| Exa Answer | Blockrun | $0.01 | Synthesis — optional, fallback |

Workflow (the composition contract):

1. Run Exa Search + Parallel Search **in parallel** (query: user input).
2. **[Optional]** If user wants synthesis: Run Exa Answer.
3. **[Optional]** If company is public: Run Stock Quote + Peers + Analyst Recs **in parallel**.
4. Agent synthesizes the brief from results (executive summary, key findings with sources,
   competitive landscape, financial snapshot if public, numbered source list).

Agent Prompt: embeds the workflow + output shape; the *calling agent* executes it against the
registry.

## Composition semantics observable on agentic.market

- **Parallelism**: services marked "parallel with X" run concurrently (Exa+Parallel Search,
  Stock Quote+Peers+Analyst Recs).
- **Optionality / conditions**: steps gated on user intent ("if user wants synthesis") or data
  availability ("if company is public").
- **Fallbacks**: Exa Contents / Exa Answer marked "optional, fallback" — used only if a primary
  path needs content extraction or a synthesized answer.
- **Ordering**: a numbered workflow defines sequence beyond the flat service list.
- **Cost & reliability hints**: price-per-run and a success rate accompany the bundle (candidate
  discovery only — never readiness, authorization, or fulfilment proof).

## Key contrast with AE

| Concern | Agentic Market bundle | AE system-level equivalent |
|---|---|---|
| Composition language | Human-authored workflow + prompt | Deterministic route compiler + RoutePlan generation |
| Parallelism | "in parallel" prose | Kernel graph with dependency ordering / parallel candidates |
| Optional/fallback | "[Optional] if..." / "fallback" prose | Registered route fallbacks + exact eligibility |
| Authority/effect | Not encoded | RouteMandate, step grant, spend ceiling |
| Evidence | None per-bundle | Replay, exact attempt identity, reconcile-before-retry |
| Executability | Prompt tells an agent what to do | Kernel executes registered operation IDs deterministically |

## Implication for AE

The agentic.market bundle confirms the **system-level ambition**: expose composed, multi-capability,
outcome-named routes to agents, where each member is an admitted heterogeneous capability and the
composition carries parallel/optional/fallback semantics — all WITHOUT baking provider or bundle
specifics into the kernel. AE already has the deterministic machinery for this
(Customer Request V2 graph + RoutePlan + RouteMandate + generic HTTP/MCP/x402 transports). The
bundle is the *presentation/curation* layer: a named, documented composition over the registry that
an agent can discover and invoke; agentic.market proves the shape and the market's expectation of it.

**Boundary:** this is decision/providence input only. Agentic Market bundle prose is not an
executable contract, not a readiness/financial/reliability guarantee, and not AE authority. AE keeps
its own admission, exact schemas, digests, revision/withdrawal, readiness, authority, effects,
money, evidence, and recovery; it never adopts catalog prose as executable truth.
