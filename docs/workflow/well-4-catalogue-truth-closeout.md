# Well 4 — Catalogue truth at scale closeout

Date: 2026-09-10. Branch `well-4/catalogue-truth` from `main` (after PR #221 merged). Plan: `~/.claude/plans/composed-wondering-puzzle.md` (Well 4 section, reviewed by `/plan-eng-review` with an independent outside voice; 10 findings folded; decisions D2, D5, D7 recorded).

## Outcome

- `npm run gate` exit 0 on the final tree (source suites, import guards, hostile-input table, e2e, release integrity).
- One public catalogue contract across HTTP, CLI and MCP: opaque API-owned cursors, one pagination shape, one `schemaVersion` literal per family, one price source, one stop-word base, one availability function, one freshness shape with two honest sources, protected-tool discoverability documented, MCP list pagination per spec.
- The price migration was rehearsed on dev: 42 documents processed, status `success`. The validator removal (C15) is deliberately NOT in this branch; it lands only after the production migration reports done (`docs/operations/hosted-cutover-runbook.md`).

## Success criteria (all checked)

| # | Criterion | Check |
| --- | --- | --- |
| 1 | `/api/v1/registry` served by the directory browse query; `marketExternalRegistry:search` deleted; `api-registry:v3`; no Convex pagination fields in responses | route tests assert no `isDone`/`continueCursor`/`splitCursor`/`pageStatus` at any depth |
| 2 | One `REGISTRY_TOOLS_SCHEMA_VERSION` | grep shows one definition; the `v1`/`v3` drift is gone |
| 3 | Hostile-input parity on every catalogue route | `tests/integration/catalogue-hostile-inputs.test.ts`: 57 cases, 0 failing, 3 n/a todos |
| 4 | One availability function over one input shape; listingTier derived | `internal/availability.ts`; parity regression test over 9 lifecycle states shows identical admission |
| 5 | Retraction in the same transaction; hourly reconciliation workload | withdraw test; retraction test (unpublished and suppressed); `reconcile business supply projections` in `SCHEDULED_WORKLOADS` |
| 6 | One price source | `presentation.price` unread and unwritten outside the ingest boundary; migration rehearsed |
| 7 | One stop-word definition | shared base plus per-domain extras; original per-domain behaviour restored after the union regressed category search |
| 8 | Freshness on every catalogue response, per source | `x402_directory` on registry and discovery; `supply_projection` on market-tools; discovery no longer reports `generatedAt: 0` |
| 9 | Sanitised provider text; real rate-limiter test | `tool-project.ts` uses `sanitizeText`; `catalogue-rate-limit.test.ts` asserts 429 with `Retry-After` |
| 10 | MCP: structured `nextAction`, instructions name the device flow, rows 10–13 closed by design; `tools/list` paginates | tests in `mcp-api-*.test.ts` |

## Root causes found while landing (all fixed at the cause)

1. A cursor from a previous directory generation returned a 200 page; malformed and foreign cursors returned 503. Cursors were engine tokens, not API tokens. Fix: `opaque-cursor.ts` binds each token to a route family and data generation and rejects mismatches before Convex is called (AIP-158).
2. The stop-word union made `data` a stop word for business search, so category search for Data returned nothing. Fix: one shared base of function words, per-domain extras kept local.
3. Refresh derived pricing from the retired display price and silently skipped every metadata refresh once writers stopped emitting it. Fix: refresh carries the publication's verified pricing forward; the derive-from-price refresh path is deleted.
4. The projection rebuild purged search documents for any null projection, which also erased the documents the bootstrap rename relies on to detect a conflict. Fix: purge only when the business row itself is non-public or suppressed.
5. Two duplicated validators (`presentationValue` in `capabilitySupplyShared.ts`; the zod `offeringSchema`) still required `price` after the Convex validator went optional; 156 type errors traced to that and to fixtures constructing the field. Fixed at the validators and by deriving at every reader.
6. A new required descriptor field (`listingTier`) had to be added to the strict zod mirror, the wire codec, the Convex return validators and one hand-enumerated wire type: five places describe one shape.

## Behavioural findings for the swarm and Well 6

- There is no product path to suppress a business; `suppressedAt` is only ever written by the seed. Recorded, not built.
- The registry route now makes one extra `x402DirectoryIndex:status` call per paginated request to verify the cursor's generation.
- A public business whose projection cannot be built still reports the code `business_not_public`; the code is pinned by a test and is misleading.
- `tests/unit/convex/money-account-funding.test.ts` is flaky under parallel load (workpool drained with fake timers); passes three times in isolation.

## Smells register

| # | Smell | Disposition |
| --- | --- | --- |
| 1 | One public descriptor shape is declared in five places (types, zod strict mirror, wire serialize/deserialize, wire type, Convex return validator) | Well 5 candidate: derive the mirrors from one source |
| 2 | Registry route's extra status call per page | Well 5/6 candidate: let browse accept the expected generation and validate in one call |
| 3 | `business_not_public` returned for a public business with a broken projection | Well 6 O-list: distinct code, test updated |
| 4 | `--test-timeout` flags still on integration/architecture scripts | Well 5 S7 |
| 5 | Two subagents ran stash despite the brief | Enforced by a Claude Code PreToolUse hook (`tools/dev/guard-destructive-git.mjs`, `.claude/settings.json`) |
| 6 | A subagent hid Convex field names behind computed keys to satisfy a grep | Reverted; verification criteria now name the response body, not the source text |
| 7 | Convex codegen output was stale after deleting a module until `npx convex codegen` ran | Codegen is now an explicit step before the gate in the well loop |
| 8 | No product suppression path | Filed as a Well 6 candidate with the security module as owner |

## Follow-ons

- C15 (validator removal) as its own PR after the production migration.
- Well 5: descriptor-shape single source; in-process CLI runner (S8); remove ad hoc test timeouts.
- Well 6: business suppression path; `business_not_public` code; the extra status call.
- Swarm scenarios: the Well 4 list in the plan (same query on both catalogue routes, publish → probe → expiry agreement across surfaces, withdraw removes from search, foreign and stale cursors, emoji and repeated params, `<script>` in provider text, anonymous MCP list and call).
