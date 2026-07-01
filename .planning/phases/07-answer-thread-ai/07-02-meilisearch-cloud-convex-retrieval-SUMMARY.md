# 07-02 - Meilisearch Cloud + Convex Retrieval Summary

**Status:** Implemented and validated locally
**Completed:** 2026-07-01
**Rollout posture:** `dual` first, then `meilisearch` after task readbacks are green

## GSD Trace

- Spike: Meilisearch Cloud is a generated search mirror; Convex remains the source of truth.
- Spec: Direct registry search stays literal. Chat typo recovery only happens through persisted `registry.search` tool input.
- Discuss: User context must be visible before query and carried as retrieval input, not hidden rewrite behavior.
- Plan: Add search documents, Meili adapter, backend modes, Convex hydration, sync attempts, and golden tests.
- Execute: Implemented in registry/search and answer-tool paths.
- Validate: Unit, integration, copy, UI contract, typecheck, Convex codegen, and production build passed.

## What Shipped

- Added generated service-level registry search documents with literal service/place matching.
- Added durable Convex tables for `registrySearchDocuments` and `registrySearchSyncAttempts`.
- Added Meilisearch HTTP adapter with index settings, task readback, document upsert/delete, timeout, and literal post-filtering.
- Added backend modes: `convex`, `dual`, and `meilisearch`.
- Meili-backed reads hydrate provider cards through Convex public catalog detail before returning anything.
- `/api/businesses/search` accepts optional `mode` and `location` while preserving literal `q` behavior.
- `registry.search` action/tool now accepts `mode` and `location`.
- Chat persists active search context into `registry.search` tool inputs when the person did not name a place.
- Registry cards now surface compact published details: service area, response, and next step.

## Success Criteria

- User context: chat has pre-query context and tool evidence carries `mode/location`.
- Retrieval correctness: Brunswick does not surface Parramatta as Brunswick coverage.
- Location sanity: Perth-scoped searches do not pull Parramatta into the local bucket.
- Typo contract: direct `paramata` search remains literal; chat recovery requires a visible corrected tool call.
- Evidence contract: provider-bearing answers come from persisted tool calls and Convex-hydrated public rows.
- Operational health: sync attempts distinguish queued, succeeded, failed, stale, delete, and suppress states.
- Fallback: Meili failure falls back to Convex and returns the public catalog page shape.
- Safety: copy/static gates remain green for booking/payment/dispatch/private-field boundaries.

## Validation

Passed:

```text
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:copy
npm run test:ui-contract
npm run build
```

Passed with network approval after a sandbox DNS failure:

```text
npm run check:convex-codegen
```

Focused retrieval/search gates passed:

```text
npm test -- tests/unit/schema/convex-schema.test.ts tests/unit/registry/search-documents.test.ts tests/unit/registry/catalog-search-port.test.ts tests/unit/registry/search-sync.test.ts tests/unit/registry/registry-fallback.test.ts tests/unit/answer/answer-tool-use-agent.test.ts tests/integration/registry-api.test.ts
```

Result: 44 focused tests passed.

## Notes

- V1 does not use Meili geosearch radius because AE does not yet store normalized coordinates.
- Build passes with the existing generated-CSS warning for `rounded-[var(--ae-radius-*)]`.
- No production deploy was performed in this closeout; rollout still needs Meili Cloud env values and the normal deployment path.
