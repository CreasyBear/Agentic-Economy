> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../../README.md) for its successor and remaining limits.

# Static performance review — 29 September 2026

**Scope.** Source-only pass over Convex reads and the client module graph. No Convex Insights, bundle analyzer, or production latency was available. Counts below are from production `convex/**/*.ts` (tests and `_generated` excluded) and `src/` client imports. A path marked *risk* has a demonstrable read or download cost that grows with table or catalogue size; it is not a measured outage.

**Schema baseline.** `convex/schema.ts` composes **111 tables** and **372 indexes**. Every table has at least one index. The failures below are queries that ignore an existing index, collect an unbounded range, or fan out point reads — not a schema with no indexes.

**How Convex charges these shapes.** `.filter()` does not select an index. Without `.withIndex()`, it walks the table. With an index, it still reads every document in the index range and then drops non-matches. `.take(1)` after a filter stops at the first match, so a proof of *absence* reads the whole range. `.collect()` materialises that range in the function. A `ctx.db.get` or `ctx.db.query` inside `map` / `for` is one extra read per parent row.

Production query volume is about **1,033** `db.query` sites and **1,274** `.withIndex()` uses. Production `.collect()` sites: **53**. Most of those are indexed per-principal membership or credential sets. The ones that matter are called out below.

## Hot — cost grows with a platform-wide table

| ID | What happens | Evidence |
|---|---|---|
| H1 | Closing or previewing workspace decommission loads **every** `capabilityCalls` row, then keeps those whose `ownerId` matches. The open-call check immediately above already uses `by_ownerId_and_state_and_createdAt` and `.first()`. The hold check does not. `capabilityCalls` grows with every Call. | `convex/lib/principalAccount/workspace/decommissionFences.ts:93-114`. Callers: `decommissionRead.ts:76`, `close.ts:100`. Index that should have been used: `by_ownerId_and_state_and_createdAt` on `capabilityCalls` (`src/modules/capability-execution/internal/convex-schema.ts`). There is no index on `formanceFinancialState` alone; a hold check can still be `by_ownerId_and_state_and_createdAt` per open state, or a new `by_ownerId_and_formanceFinancialState` index, with `.first()` / a small `.take()`. |
| H2 | Seller-canary “no financial effect” proof looks up `moneyX402PaymentAttempts` by `dispatchRef` with `.filter().take(1)`. The table’s indexes are `attemptRef`, `custodyRef`, `authorizationDigest`, `paymentIdentifier`, and `state+expiry` — not `dispatchRef`. Rows carry `challengeJson` and `selectedRequirementJson`. The canary path is proving the row is **absent**, so `.take(1)` walks the table until the end. The same function filters `providerConsequenceJournal` by `callRef`, and that table indexes `ticketRef`, `effectRef`, `commandId`, `claimRef`, and `state+expiresAt` only, even though `callRef` is a stored field. | `convex/lib/capabilityExecution/callLifecycle/sellerCanaryKnownUnpaid.ts:106-120` (comment at 107-109 says this is a scan). Repeated in `sellerCanarySafeBeforeRelease.ts:152-163`, which also `.collect()`s every `actionExecutionAttempts` row for the call (`:149-151`). Reached from `sellerCanaryRearm.ts:68` during owner canary admission (`convex/lib/capabilitySupply/ownerCanary/admission.ts`), not from ordinary buyer Calls. One canary rearm can still read the entire payment-attempt and consequence history. |
| H3 | A principal with **no** active ownership or membership resolves a closed workspace by `.filter().collect()` on `accounts` (`lifecycle === 'closed'` and nested `lastAction.actorPrincipalRef`). `accounts` has `by_lifecycle_and_updatedAt` and `by_accountRef`; neither matches this predicate, so the read is a table walk. It does not run for a principal who already has an active account. | `convex/lib/principalAccount/interactiveAuthority/accountResolution.ts:12-26` and `:61-63`, also `convex/lib/principalAccount/workspace/accountContext.ts:16-26` from `close.ts:57`. |

## Catalogue — buyer find path

`/market` catalogue reads go through `readX402DirectoryCatalogue` → `x402DirectoryIndex:browse` (`src/modules/market/x402-directory-index.server.ts:131-134`, `numItems: 24`, `maximumRowsRead: 512`). `browseHandler` then clamps the page to **12** and the scan to **512** rows (`convex/lib/market/directoryIndex/browse.ts:129-132`). That cap is real and should stay. Inside the cap the handler still does two N+1 joins:

1. Every result row `ctx.db.get(row.entryId)` loads the retained registry document, not the slim search row (`browse.ts:134-136`).
2. `choiceFor` → `currentDirectoryChoice` → `toolRecord` then loads the current publication, offering, binding, business, and contract (`browse.ts:136`; `choices.ts:8-20`; `convex/lib/capabilitySupply/tool/projection.ts:69-80`). Choices are memoised per `sourceRouteRef` inside one page (`choices.ts:24-34`), so duplicate resources on a page do not repeat the join. Distinct tools still pay it.

Selective filters (price band, adoption, momentum category) are `.filter()` after a wider index. Momentum sort uses `by_generation_and_network_and_momentumOrder` and narrows provider/category in the filter (`browse.ts:52-54`, `:109-120`). Worst case for one page is 512 index rows plus up to 12 full entry documents plus up to 12 tool projections. `searchCompact` (`browse.ts:237-241`) skips the entry `db.get` when `documentId`, `title`, and `summary` are already on the search row. Compact search is what `src/modules/registry/internal/compact-directory-search.ts` and `src/routes/api.v1.registry.ts` use. The market UI does not.

`orderedDirectoryRows` starts a query builder and only later adds `.withIndex` / `.withSearchIndex` (`browse.ts:36-73`). That helper is not an unindexed read by itself.

## Batch reads that can exhaust one function

| ID | Bound in source | Why it is still large | Evidence |
|---|---|---|---|
| B1 | 25 categories per mutation, **5,000** search rows each | One invocation can read up to 25 × 5,000 `marketDirectorySearchEntries`. Each category then loads **all** `marketDirectoryCategoryStats` for that generation and network and `.filter()`s to one category. The only stats index is `by_generation_and_network` (no `category`). | `convex/x402DirectoryIndexCategoryStats.ts:16-44`. The same full stats range is `.collect()`ed by the analytics query (`convex/lib/market/directoryIndex/reporting.ts:72`). |
| B2 | `PROVIDER_EVIDENCE_READ_CAP` and `EVIDENCE_READ_LIMIT` are **10,000** | Owner supply readback and provider tool projection each `.take(10_001)` on `capabilityCallProjections` and again on `qualifiedUseReceipts` for one business or tool in a time window. Overflow is detected and sliced, but the documents are still read. | `convex/lib/capabilitySupply/ownerFunnel/sourceRows.ts:10,64-74`; `convex/lib/capabilitySupply/providerTools/projection.ts:9,69-84`. |
| B3 | `MAX_USAGE_ROWS` is **10,000** | Usage and owner-agent readback `.take(10_001)` on `capabilityCallProjections` for an account (and several secondary indexes). | `convex/lib/capabilityExecution/callProjection/contracts.ts:27`; `usage.ts:57-94`; `ownerAgentReadback.ts:152`. |
| B4 | Admin tool version reads **500** current publications for one `toolRef` to pick the max revision | `by_toolRef_and_disposition` should be one current row, or a revision-ordered index plus `.first()`. | `convex/lib/adminConsole/reads/toolVersion.ts:36-48`. |
| B5 | Lease invalidation `.take(1001)` active leases per connection, then writes 1,000 | Indexed and capped, but one mutation still reads and patches a thousand lease documents. | `convex/lib/capabilitySupply/providerConnections/cleanup.ts:34-38`. |
| B6 | Directory ingestion `.take(130)` search rows per resource, often inside the page loop | Indexed by generation+resource. 130 rows per resource is a wide “unique” lookup repeated per ingested item (`x402DirectoryIndexBackfill.ts:23` as well). | `convex/lib/market/directoryIndex/ingestion.ts:66,91,172` and the same `130` in `providerRows.ts` and `cleanup.ts`. |

Admin metrics collection is **not** in this list. `snapshotMarketplaceMetricsDayHandler` pages Calls, Quotes, and resolutions at **25** rows and **8** pages per action, then reschedules (`convex/lib/adminConsole/metrics/collect.ts:77-78,95-118`). The per-call projection lookup inside `pageCallsForWindowHandler` (`collect.ts:33-36`) is an N+1, but it is 25 indexed `by_callRef` reads per page, not an unbounded collect. Owner invoice history is cursor-paginated (`convex/lib/money/funding/ownerInvoiceHistory.ts:192`).

## Indexed `.collect()` that grows with one account

These use an index, so they are not table scans. They have no page cap, so a large account or business can still blow the function.

| Site | Range | Evidence |
|---|---|---|
| All buyer obligations for an account, then all provider obligations **per owned business** | `moneyProviderObligations` by buyer, then N+1 `.collect()` by provider | `decommissionFences.ts:50-72` |
| All funding commands for an account, to see if any are in flight | `moneyFundingCommands` by `accountRef` (index `by_accountRef_and_state` exists and is unused) | `decommissionFences.ts:116-121` |
| Every delegation grant for the account, including historical rows (index prefix is only `accountRef`; `by_accountRef_and_lifecycle` exists) | `authorityDelegationGrants` | `convex/lib/principalAccount/workspace/close.ts:162-169` |
| Every agent grant for the account | `agentAccessGrants` by `ownerId` | `close.ts:154-156` |
| Every offering for a business | `businessOfferings` | `convex/lib/catalog/offerings/persistence.ts:129` |
| Active refresh-token families for a credential or principal | `agentAccessOAuthRefreshFamilies` | `convex/lib/agentAccess/principals/refreshInvalidation.ts:12-19` |

Personal export, retire, and machine cascade `.collect()` credentials, memberships, and grants by principal (`exportData.ts`, `retire.ts`, `retireDependents.ts`, `machineCascade.ts`). Those sets are per person and usually small. Export also `.filter().collect()`s `interactiveSessionSelections` and `userNotificationPreferences` without using `by_principalRef` / `by_principalRef_and_accountRef` (`exportData.ts:101-114`; same filters in `retire.ts:149-165` and `close.ts:146`). Then, per linked account, it `.take(50)` of `auditEvents` (`exportData.ts:128-132`). The audit read is capped; the unindexed filters are not, but those tables are not the Call ledger.

## Other N+1 query loops

Bounded, but they multiply reads on paths people actually hit.

| Path | Shape | Cap | Evidence |
|---|---|---|---|
| Catalogue browse | See above | 12 result rows, 512 index rows | `browse.ts:134-136` |
| Owner chat cards | For each of the last 50 turns, for each `callRef`, load the Call and often the Quote | 50 turns; `callRefs` per turn is not capped | `convex/chatCall.ts:73-89` |
| Agent directory | Per membership: principal, admission, up to 101 bindings, up to 101 credentials, then another binding lookup | Non-paged list `.take(50)` memberships; paged handler still runs the same projection | `convex/lib/agentAccess/directory/reads.ts:16-73` |
| Catalogue price / network filters | One publication `.unique()` per `toolRef` | 100 refs, throws `catalog_page_too_large` | `convex/capabilityToolCatalogData.ts:13-17,33-36` |
| Catalogue source snapshot | Per candidate (max 20): `.take(17)` publications, then a binding `.unique()` per publication | 20 × 16 | `capabilityToolCatalogData.ts:55-69` |
| Spending-period admission | Up to 128 pending plus 128 unknown Calls, then a Quote read each | 256 | `convex/lib/money/spendingPeriods/periods.ts:61-81` and `:88-98` |
| Capability graph | Per publication: offering, binding, business, contract | `MAX_ELIGIBLE_SUPPLY` **256** (`src/modules/capability-supply/internal/eligibility/list.ts:28`) | `src/modules/capability-supply/internal/graph/query-graph.ts:110-126` |

Flow ingestion looks up `marketFlowRecipient` / `marketFlowPayeeVolume` per recipient inside write loops (`convex/lib/market/flow/store.ts`). The page-facing tool count is `.take(8)` (`TOOL_COUNT_CAP`, `store.ts:8-9`). That page read is fine.

`listMappingsHandler` does `.take(args.limit)` with `limit: v.number()` and no upper clamp in the handler (`convex/lib/capabilitySupply/lists/reads.ts:65-74`, `lists/contracts.ts:103-106`). It is an internal query. Public tool-search limits are clamped (for example `max(100)` in `src/modules/capability-supply/tool-schemas.ts:168`, registry list `max(50)` in `src/modules/registry/internal/registry-action-contracts.ts:22-27`). Graph and eligible-supply ports reject limits above 256 before they `.take()`.

Scheduled-function retirement `.take(args.newest ?? 1000)` on `_scheduled_functions` is an intentional bound (`convex/lib/platform/scheduledFunctionRetirement.ts:18-22`). Readiness refresh is `.take(20)` (`convex/lib/capabilitySupply/probes/schedule.ts:9,29`). Action-execution history reads clamp the caller limit to 1,000 (`convex/lib/actionExecution/control/reads.ts:18-33`).

## Client bundles

TanStack Start splits route modules, but anything imported from `src/routes/__root.tsx` is on every page. There is **no** `React.lazy` / route lazy import in `src/` (the only `z.lazy` is a Zod schema).

| ID | Library | Where it actually lands | Evidence |
|---|---|---|---|
| C1 | **recharts** (whole package) | Root shell, every page | `AeAppHeader` always mounts `AeCommandPanel` (`src/components/ae/layout/app-shell/AeAppHeader.tsx:108,125`). The panel statically imports `ToolDetailPage` (`AeCommandPanel.tsx:24`), which imports `AeToolInspector`, which imports `AeToolTrackRecord`, which imports `AeToolLatencyChart`. That file imports named recharts components **and** `src/components/ui/chart.tsx`, which does `import * as RechartsPrimitive from "recharts"` (`chart.tsx:2`). The namespace import keeps the library from tree-shaking down to `BarChart`. The chart is only visible after opening a tool in the command panel. The module is still parsed on the home page. |
| C2 | **@sentry/react** | Root shell | Client init of Sentry and PostHog is dynamic (`src/lib/observability/boot-client-observability.ts:33-37`). The root boundary still statically imports `ErrorBoundary` from `@sentry/react` (`src/components/ae/feedback/AeObservabilityErrorBoundary.tsx:1`, mounted in `src/routes/__root.tsx:100`). Chat layout and `OperatorWorkspaceMenu` import the same boundary again. The SDK is in the root graph even though `initSentryClient` is lazy. |
| C3 | **react-markdown** + **remark-gfm** | Chat route chunks only | `ChatAssistantText.tsx:2-3`, pulled in by `AnswerBlock` → `ChatTranscript` → `ChatLayout` → `Chat`, and by `SharedChat`. Routes: `src/routes/t.new.tsx`, `t.$threadId.tsx`, `s.$shareToken.tsx`. Not on `/market`. The markdown parser is still eager inside those route chunks; the transcript cannot paint without it. Chat code fences do **not** use Shiki (`ChatCodeFence.tsx` is a copy button around children). |
| C4 | **shiki** and **@rjsf/shadcn** + **@rjsf/utils** | Not in a live route graph | `DirectoryToolPlayground.tsx` is the only importer of both, and nothing imports `DirectoryToolPlayground`. `code-block.tsx:149-154` already `import("shiki")` per language. `src/styles/globals.css` still has `@source` on `@rjsf/shadcn`, so Tailwind scans that package even though the form is unused. |
| C5 | **decimal.js** | Market route chunks | `src/modules/market/directory-card.view-model.ts` and `x402-directory-index.ts` import it. Catalogue cards, filters, and `routes/tools.$providerHost.$slug.tsx` / `providers.$providerHost.tsx` import those modules. Smaller than recharts, but it is on the public catalogue path with no lazy split between price formatting and the directory schema module. |
| C6 | **viem**, **ai**, **@tanstack/ai**, **@scalar/openapi-parser** | Server / module code, not the root shell | `viem` is confined to `src/modules/capability-supply/internal/x402-*`. `ai` is imported by chat server helpers and `anonymous-chat-send.ts` (chat route). Do not pull those modules into a shared client barrel. |

`lucide-react` imports are named icons, not `import *`. `@tanstack/react-table` is used by operator and settings tables, not by `__root.tsx`. PostHog’s browser SDK is behind the dynamic import in C2.

## React context

Providers that wrap the app already memoise their values. Theme (`ThemeProvider.tsx:100-107`), command panel (`CommandPanelProvider.tsx:109-123`), and operator chrome (`AeOperatorPage.tsx:192-195`) do not put catalogue or chat state in a root context. Consumers are the header, theme toggle, and command panel. A context update re-renders those consumers, not every route body, as long as the page does not call the hook.

Three shapes still cause extra work:

1. **Chat vs signed-in Convex provider swap.** `RootDocument` chooses `ChatConvexProvider` or `SignedInConvexProvider` from the pathname (`src/routes/__root.tsx:84-90`, `requiresChatProviders` in `AeConvexProviders.tsx:199-201`). Those are different component types, and the child of the provider is `ThemeProvider` plus the shell. Entering or leaving `/t/` or `/s/` remounts the shell, not only the outlet.
2. **Chat authority gate.** `ConfiguredChatConvexProvider` does not render the thread until `materializeCurrentInteractiveAuthority` succeeds, repeats that mutation from `getToken`, and runs it again every 20 seconds (`AeConvexProviders.tsx:98-110,145-158`). A failed or in-flight check replaces the thread with a status page. That is latency and a subtree remount on the chat route, not a catalogue re-render.
3. **Saved Tools context on the catalogue.** `DirectorySavedToolsProvider` is mounted under `AeX402Directory`, not the root (`AeX402Directory.tsx:198`). The value is memoised (`DirectorySavedTools.tsx:103-113`), but `pendingKeys` changes the value, so every `useDirectorySavedTools()` card on the page re-renders on each save toggle. The list itself is capped at 100 saved tools in the copy at `DirectorySavedTools.tsx:86`.

`useAuthWithFactorVerificationRefresh` returns a new object every render (`AeConvexProviders.tsx:29-37`). It is only passed into `ConvexProviderWithClerk` as `useAuth`. Clerk ticks re-render that provider; they do not by themselves re-render route bodies that do not read auth.

## What is already in good shape

- Point lookups of the form `.withIndex(...).unique()` / `.take(2)` dominate authority, money, and publication reads. Do not replace those with `.collect()`.
- Buyer search pagination refuses `numItems` outside 1–50 (browse) or 1–12 (compact) and sets `maximumRowsRead` / `maximumBytesRead` (`browse.ts:103-104,129-132,187,234-236`).
- Public registry and tool-search limits are schema-clamped. Eligible supply and the capability graph reject limits above 256.
- Saved-tool listing, chat thread listing (100), and flow tool counts (8) are capped.
- Shiki, if the unused playground is ever mounted, is already dynamically imported.
- Sentry and PostHog **initialisation** is already dynamic. The remaining root cost is the static `ErrorBoundary` import (C2) and recharts (C1).

## Order to fix

1. **H1.** Stop the workspace fence from walking `capabilityCalls`. Use the owner+state index and stop at the first unreleased hold.
2. **H2.** Index `moneyX402PaymentAttempts.by_dispatchRef` and `providerConsequenceJournal.by_callRef` (or whatever field is the real invocation key) and use them. A canary absence check must be an indexed empty read.
3. **Catalogue.** Serve `/market` from the slim search row (`searchCompact`’s rule: `db.get(entryId)` only when title/summary are missing). Keep the 12 / 512 caps. Do not add a second live upstream read on the miss path.
4. **B1–B3.** Page category stats one category at a time under a few hundred rows, and add `category` to the stats index. Replace the 10,000-row evidence and usage takes with a stored aggregate or a cursor. Detecting overflow after reading 10,001 documents does not protect the read budget.
5. **C1 then C2.** Load `AeToolLatencyChart` with `React.lazy` from the command-panel tool page so recharts is not a dependency of `AeAppHeader`. Keep a small app error boundary that does not import `@sentry/react` until the dynamic client init has run, or lazy the boundary itself.
6. **Account collects (H3 and the close/export filters).** Use `by_lifecycle_and_updatedAt` only if the second predicate can move into the index; otherwise add an index that includes the actor ref. Point the session and notification reads at `by_principalRef`. Cap funding-command and obligation scans with the existing state indexes and `.first()`.

No source was edited for this review.
