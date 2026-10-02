# Convex backend health — 29 September 2026

Read-only source census of the Convex app in this checkout. Counts come from the schema modules imported by `convex/schema.ts`, from Convex function registrations under `convex/` (tests and `convex/_generated` excluded), and from `ctx.scheduler` call sites. No Convex Insights or production OCC telemetry was read, so write hot spots are source patterns, not measured conflict rates.

## Census

| Surface | Count |
|---|---:|
| Tables in the deployed schema | 111 |
| B-tree indexes | 367 |
| Search indexes | 5 |
| Vector indexes | 0 |
| Tables with no index | 0 |
| Query / mutation / action registrations | 613 |
| HTTP routes | 7 |
| Cron jobs | 12 |

Every table is defined with `defineTable` in `src/modules/**` and spread into `convex/schema.ts`. Two extra `defineTable` calls live only in tests and are not part of the deployment schema. Index counts are `.index(` / `.searchIndex(` on those schema modules. Search indexes: `capabilityPublications.search_text`, `chatThreads.search_title_by_ownerId`, `marketExternalRegistryEntries.search_searchText_by_generation_source`, `marketDirectorySearchEntries.search_text_by_generation_network_category_provider`, `registrySearchDocuments.search_searchText_by_publicStatus`.

Installed components (`convex/convex.config.ts`): default workpool, `stripeWebhookWorkpool`, workflow, rate limiter, agent, migrations, and six aggregates (`marketEvidence`, `marketOperationEvidence`, `marketToolRatings`, `marketActiveTools`, `marketActiveProviders`, `marketDirectoryFacets`). Component tables are not in the 111.

## Public vs internal functions

Registrations are `query` / `mutation` / `action` (including the `*Generic` builders) and `defineAdminQuery`. A registration counts only when the object passed to the builder contains `handler`.

| Kind | Public | Internal |
|---|---:|---:|
| Query | 129 | 99 |
| Mutation | 117 | 177 |
| Action | 23 | 68 |
| Total | 269 | 344 |

Eight of the public queries go through `defineAdminQuery` (`convex/lib/adminConsole/reads/registrars.ts`), which always validates args and returns and unions an admin refusal onto the result. There is no `defineAdminMutation` or `defineAdminAction`.

HTTP is separate from the 613. `convex/http.ts` registers 7 POST routes. One is public chat (`/chat/anonymous`). The other six use an `/internal/...` path prefix for provider-consequence and secret-lifecycle RPCs; that prefix is not Convex `internal` visibility. Those routes are still reachable on the deployment HTTP router.

## Crons

`convex/crons.ts` registers every entry in `SCHEDULED_WORKLOADS` (`src/lib/deployment/scheduled-workloads.ts`). There is no env flag that drops the set. Twelve jobs:

| Job | Cadence | Handler |
|---|---|---|
| reconcile due facilitator invocations | 15 min | `workloadCron.reconcileDueFacilitatorInvocations` |
| observe x402 treasury | 15 min | `workloadCron.observeX402Treasury` |
| refresh facilitator discovery | 6 h | `workloadCron.refreshFacilitatorDiscovery` |
| refresh USDC/AUD reference rate | 6 h | `workloadCron.refreshReferenceRate` |
| refresh current market presence | 1 h | `workloadCron.refreshCurrentMarketPresence` |
| refresh capability supply readiness | 1 h | `workloadCron.refreshCapabilitySupplyReadiness` |
| reconcile business supply projections | 1 h | `workloadCron.reconcileBusinessSupplyProjections` |
| cleanup expired source write nonces | 1 h | `workloadCron.cleanupExpiredSourceWriteNonces` |
| cleanup expired agent access oauth grants | 1 h | `workloadCron.cleanupExpiredAgentAccessOAuthGrants` |
| refresh Agentic Economy API registry | 168 h | `workloadCron.refreshAgenticEconomyApiRegistry` |
| snapshot marketplace metrics day | 16:10 UTC | `workloadCron.snapshotMarketplaceMetricsDay` |
| refresh market flow | 01:15 UTC | `workloadCron.refreshMarketFlow` |

## Argument and return validators

Of the 613 registrations, **611 declare both `args` and `returns`**. Two gaps:

| Function | Missing | Note |
|---|---|---|
| `referenceRateRefresh.run` (`convex/referenceRateRefresh.ts:41`) | `args` and `returns` | Internal action. Handler is annotated `Promise<null>` and takes no args. Cron calls it with `{}`. |
| `chatAnonymous.recipient` (`convex/chatAnonymous.ts:7`) | `returns` | Public query. `args` is `{}`. Handler returns `anonymousChatRecipient()`. |

`httpAction(...)` wrappers are not in the 613. They do not take Convex `args` / `returns`; request bodies are validated inside the handlers.

## Actions that call `ctx.run*` without an explicit return type

Convex's `ActionCtx.runQuery` / `runMutation` / `runAction` are generic on the target reference. An action handler that calls them needs its own return type or the inferred type can recurse through the generated API.

Scan: 91 action registrations, **50 of those handlers call `ctx.runQuery`, `ctx.runMutation`, or `ctx.runAction`**. The return type was taken from the function that contains the call (`: Promise<...>` or an equivalent annotation on a `function`), including annotations on the following line. **48 of the 50 are annotated. Two are not:**

| Handler | Registration | `ctx.run*` in the body |
|---|---|---|
| `runStatementPageHandler` | `moneyDocuments` (`convex/lib/money/documents/statementPage.ts:152`) | query, action, mutation |
| `finalizeStatementHandler` | `moneyDocuments` (`convex/lib/money/documents/statementFinalization.ts:95`) | query, action, mutation |

Both still have a Convex `returns` validator on the registration. The gap is the TypeScript annotation on the handler, which is what breaks the `ctx.run*` inference cycle.

## `v.any()`

Nine production `v.any()` call sites. Each is marked `runtime-validated` and allowlisted in `src/lib/ui/contract-scans.ts`. None is an unindexed counter.

| Site | Fields |
|---|---|
| `src/modules/capability-execution/internal/convex-schema.ts:20` | `jsonValue`, used as open JSON on call/quote documents |
| `convex/chatMessages.ts:127-128` | UIMessage `metadata`, `parts` |
| `convex/lib/capabilitySupply/tool/contracts.ts:107,137,184-185` | `inputSchema`, `input`, field `example`, field `default` |
| `convex/lib/capabilitySupply/tool/originMap.ts:43,45` | field `example`, field `default` |

## OCC hot spots

Most `.unique()` plus `db.patch` pairs update one document for one command (a call, grant, funding command, or account). Those are ordinary row writes, not hot counters. The schema has no global counter table. The writes that hit one shared document from many callers or from a tight scheduled loop:

1. **Provider lead facet.** `refreshProviderLead` (`convex/lib/market/directoryIndex/providerLead.ts:36-54`) loads the one `marketDirectoryFacets` row for `(generation, kind=provider, key)` and `db.replace`s it. `writeSource` calls it on every activity-only patch of a resource for that provider (`convex/lib/market/directoryIndex/ingestion.ts:114`). A directory page that touches several tools for one provider rewrites that same facet once per tool. Overlapping publication and refresh transactions contend on that row. This is a source pattern; conflict rate was not measured.

2. **Marketplace metrics build row.** `advanceMarketplaceMetricsBuild` (`convex/lib/adminConsole/metrics/build.ts:108-113`) loads the single `marketplaceMetricBuilds` document for `entityDay` and patches the running totals. The daily snapshot chains pages with `scheduler.runAfter` onto `adminConsoleMetrics.writeMarketplaceMetricsDay` (4 call sites). A second run for the same day throws `marketplace_metrics_build_cursor_changed` instead of merging, so overlap fails the mutation rather than corrupting the sum. Still one hot document per day while the chain runs.

3. **USDC/AUD rate row.** `referenceRateRefresh.persist` (`convex/referenceRateRefresh.ts:28-35`) inserts or patches the single `moneyReferenceRates` row for `USDC/AUD`. The cron is every 6 hours and the handler skips an older observation. Low frequency; included because it is a true singleton, not because it is hot.

Directory scan pages also patch per-resource `marketExternalRegistryEntries` and `marketDirectorySearchEntries` rows (`ingestion.ts:82-110`). Those are one row per resource, and unchanged search fields are left alone. They are not a single counter. The six `@convex-dev/aggregate` components keep their own btree documents; membership rewrites during a scan are the other place a shared aggregate key can conflict. That behavior lives in the component, not in the 111 app tables.

## Scheduled-function chains

`ctx.scheduler.runAfter` / `runAt` appears at **35** call sites under `convex/` (tests excluded). Three functions reschedule themselves with `runAfter(0, …)` until a page cursor is done:

| Chain | Stop condition |
|---|---|
| `x402DirectoryIndexBackfill.batch` (`convex/x402DirectoryIndexBackfill.ts:44`) | page done, then schedules `x402DirectoryIndexCategoryStats.finalize` |
| `x402DirectoryIndexCategoryStats.finalize` (`convex/x402DirectoryIndexCategoryStats.ts:61`) | category page done, then patches generation `analyticsStatsStatus` |
| `x402DirectoryIndexProviderLead.backfill` (`convex/x402DirectoryIndexProviderLead.ts:22`) | page done |

Related continuations that schedule a different module, not themselves:

- Market presence pages schedule `workloadCron.refreshCurrentMarketPresence` with the next cursor (`convex/marketPresence.ts:112`).
- Expired x402 recovery arms the next attempt with `scheduler.runAt` (`convex/moneyX402Expiry.ts:122`) before the action does RPC work. Delay doubles per attempt, capped.
- Directory refresh completion schedules `x402DirectoryIndexStore.cleanup` (`convex/x402DirectoryIndexRefresh.ts:69`).
- Nonce and OAuth cleanups schedule one follow-up through `workloadCron` when a page remains.

Workflow and workpool chains (not `ctx.scheduler`, but the same “function schedules the next function” shape): the Coinbase directory scan workflow (`convex/x402DirectoryIndexRefresh.ts`), Stripe webhook workpool, money-document workpool, call-dispatch enqueue, and provider-connection cleanup. The weekly registry refresh comment in `scheduled-workloads.ts` still records that a real run of the old full rewrite was on the order of 225,000 function calls; the current writer diffs per resource and the cron interval is 168 hours.

`scheduledFunctionRetirement.cancelByName` is an internal mutation for cancelling named scheduled jobs. It is not on a cron.

## Health

Validators and indexes are in good shape: 111/111 tables indexed, 611/613 functions carry both argument and return validators, and 48/50 `ctx.run*` action handlers annotate their return type. The two validator gaps and the two untyped statement handlers are small and local.

The structural risk is write amplification on shared directory and metrics documents, plus self-scheduled page loops that keep going until a cursor finishes. Those loops are bounded per transaction, but a stuck cursor or a provider facet rewritten on every tool in a scan is the OCC surface to watch. No production conflict count was available for this pass.
