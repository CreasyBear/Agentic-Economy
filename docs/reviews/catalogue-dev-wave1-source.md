# Catalogue development: wave 1 cold source review

Date: 2026-09-08. Read-only review; only this report was written. Runtime checked: Node v22.22.0, npm 11.5.1. Read AGENTS.md and PRODUCT.md. Reviewed changed catalogue queries/actions, facilitator reconciliation, source adapters, registry contracts, relevant tests and installed CDP/Convex helper source. No deployment, paid calls, or test suites run. Reproductions below are proposed focused regression tests, not claimed executed tests.

## P1 — Existing sensitive-query rejection is bypassed before external search

Evidence: `convex/capabilityToolCatalog.ts:85-95` uses `toolSearchInputSchema` and then calls `fetchCatalogPage`; its Coinbase branch passes `input.query` directly to `searchX402Resources`. The schema in `src/modules/capability-supply/tool-schemas.ts` only imposes a string length. Native `convex/capabilitySupplyToolQueries.ts:304-309` bypasses the old normalizer too. Existing `normalizeSearch` in `internal/tool-search.ts:442-530` rejects concrete emails and SSNs. `tests/unit/capability-supply/tool-projection-search.test.ts:265` specifically requires rejection without reflecting sensitive material.

Behavior: the same query previously rejected now reaches Coinbase, and current-inventory responses can reflect it. The old unit test still exercises the old implementation, so it cannot protect the new public path.

Reproduction: mock the CDP search export; call catalogue search with source `coinbase` and query `run a background check for SSN 123-45-6789 and email victim@example.com`. Require `{kind:'unavailable', reason:'query_invalid'}` and zero SDK calls. Repeat against the native query and assert the query is not reflected.

Smallest fix: reuse a shared search-input validation/normalization boundary before source dispatch. Preserve the existing rejection behavior while keeping native search and SDK pagination; do not revive bespoke ranking.

## P2 — External catalogue silently ignores the networkId hard filter

Evidence: `convex/capabilityToolCatalog.ts:111-114` filters projected external results solely through `matchesToolFilters`. That helper (`internal/tool-search.ts:533-589`) does not test networkId; network identity is absent from PublicToolDescriptor. Native search correctly applies the filter to publication rows (`capabilitySupplyToolQueries.ts:311-319`). Public registry filters explicitly accept networkId (`registry/tool-choice-contracts.ts:31`).

Behavior: browsing either external directory with `filters.networkId: 'nonexistent-network'` may return admitted `ae:public` Tools, while the identical current-inventory filter returns none. NetworkId here is the AE network, not the x402 chain; passing it as the SDK's payment-network filter would also be incorrect.

Reproduction: use one valid discovered fixture from the SDK mock, call the catalogue action with an impossible AE networkId, and require no returned candidates. Compare against the same fixture through source current.

Smallest fix: carry publication network identity through the internal admitted-ref lookup and enforce the filter before projecting. Reuse the existing publication query/filter pattern without adding a public descriptor field or equating the AE network with the payment chain.

## P2 — Case-insensitive location filtering regresses

Evidence: new native search forwards raw `args.filters` at `capabilitySupplyToolQueries.ts:325`, as does external search at `capabilityToolCatalog.ts:114`. `matchesToolFilters` lowercases business slug/name but calls `.includes(filters.location)` without lowercasing the filter. The removed entry path normalized location with `.trim().toLowerCase()` in `internal/tool-search.ts:504-506`. Registry input trims location but does not lowercase it.

Behavior: a published business named `Example Provider` is found by location `example` and excluded by `Example`, unlike previous behavior. This affects both native and external source paths.

Reproduction: with one admitted fixture, read its business name and call native catalogue search using a capitalized name fragment, then its lowercase equivalent. Assert identical Tool refs. Repeat external source with an SDK fixture.

Smallest fix: use the shared normalizer from the first finding or normalize location inside the maintained filter helper. Do not duplicate normalization independently for each source.

## P2 — Coinbase fetches have no per-request timeout option in the pinned SDK (unresolved limitation)

The discovery SDK calls have no configured timeout, unlike PayAI's 10-second AbortSignal. The initial review incorrectly inferred that the generated second `options` argument accepted Axios options. Deeper inspection of the installed `@coinbase/cdp-sdk/src/openapi-client/cdpApiClient.ts:133-135` proves that it resolves to `idempotencyKey?: string`; the generated `SecondParameter` alias does not provide signal or timeout support. Its Axios instance is initialized without a timeout. A hung upstream call remains governed by outer infrastructure limits.

No fix was applied: injecting a global SDK transport patch or replacing its maintained calls with custom transport would expand the scope. Parent explicitly agreed to record the exact limitation. The suggested signal fix and test in the original review are withdrawn.

## Verified positives and remaining runtime check

The implementation uses the installed Coinbase SDK list/search functions and preserves search partialResults without inventing a search cursor. Native search uses the maintained `convex-helpers/server/filter` pagination contract, including empty filtered pages with continuation. Facilitator result pages no longer withdraw unseen inventory. Those choices are consistent with the intended boundary.

Existing rows lack the newly optional searchText until `capabilityToolCatalogData.backfillSearchText` runs. Source only contains its self-continuation, not an initial invocation. Parent should verify that the dev environment backfill has actually completed before accepting native search on existing inventory. This is a runtime verification requirement, not a claim that the migration has not been performed.

## Wave 1 fixes and verification

Implemented shared `normalizeToolSearchInput` reuse before native search and external dispatch, retaining catalogue page-size defaults. Concrete sensitive input is rejected before any SDK call, and location/network whitespace normalization is restored. External results now check AE network membership through a bounded internal publication query; no public network schema was added and no payment-chain substitution was made.

Added behavior regressions through actual Convex catalogue query/action handlers for sensitive-query rejection, zero external disclosure, missing AE network exclusion, and case/whitespace-equivalent location filters across current and Coinbase sources.

Verification: `npm test -- tests/integration/tool-catalog-native-search.test.ts tests/unit/convex/capability-tool-catalog.test.ts tests/unit/capability-supply/tool-projection-search.test.ts --no-file-parallelism` — 3 files, 45 tests passed. No deployment, commits or broad suites. Parent owns runtime watcher verification and typechecking.
