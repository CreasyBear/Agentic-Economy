---
spike: 001
name: local-context-retrieval-plan
type: standard
validates: "Given query + active area, when the resolver plans retrieval, then service text and location constraint stay separate and explainable"
verdict: VALIDATED
related: []
tags: [retrieval, locality, evidence, ui]
---

# Spike 001: Local Context Retrieval Plan

## What This Validates

Given a user query and active area, when AE prepares retrieval, then the resolver can produce a visible plan with separate `displayQuery`, `serviceQuery`, and `locationConstraint`. The user can understand local/whole-catalogue scope without AE pretending to book, dispatch, or know live availability.

## Research

Inputs:

- Office-hours design doc
- CEO plan
- Engineering review sidecar
- gbrain resolver reference pattern: typed result, named reason, source, timestamp

Chosen approach: pure deterministic resolver prototype plus an interactive demo. No public registry schema expansion.

## How to Run

Open:

```text
.planning/spikes/001-local-context-retrieval-plan/index.html
```

Or run deterministic checks:

```bash
node .planning/spikes/001-local-context-retrieval-plan/spike-runner.mjs
```

## What to Expect

- Placeless `Emergency plumber` with Perth context becomes service-only search plus Perth constraint.
- `Emergency plumber Brunswick` does not get Perth injected.
- `paramata plumber` preserves the typo-like token and avoids default context injection.
- Service modifiers like `hot water plumber`, `gas fitter`, `pool cleaner`, `after hours plumber`, and `mobile mechanic` remain service queries, not places.

## Observability

The demo shows a forensic event log with `reason`, `locationSource`, `wasContextInjected`, and the split between planned service query and location constraint.

## Investigation Trail

1. Started from the reviewed design fixtures.
2. Removed numeric confidence because no execution branch depends on it in v1.
3. Split `registryQuery` into `serviceQuery` and `locationConstraint` to avoid degrading literal search with `near Perth`.
4. Added service-modifier negatives after outside voice and engineering sidecar both flagged false place detection as the hard part.

## Results

Verdict: VALIDATED.

Evidence:

- Resolver can stay small and deterministic.
- Locality is understandable in a UI before the user submits.
- The product win is not “AI confidence”; it is “I can see why this answer is local.”

Implementation signal:

- Build resolver tests first.
- Keep `locationConstraint` internal.
- Preserve model typo correction as `actualToolQuery` divergence evidence.
