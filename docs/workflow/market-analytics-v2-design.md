# Market analytics v2 — derived intelligence contract

Goal: upgrade the x402 directory analytics from the single declared `calls30d` rank to a derived
signal suite (payer depth, momentum vs previous generation, activity recency, category
concentration with top-3 share + HHI), surfaced through AE's existing analytics page and
leaderboard. Everything stays declared-source (Coinbase Bazaar) or derived-from-declared;
NOTHING is measured-by-AE yet — the UI must label each number accordingly. No synthetic time
series, no invented growth arrows (marketplace-components.md rule).

## Frozen cross-slice contracts

All names below are exact and load-bearing. Do not rename; do not add your own fields beyond
these unless required for typing; do not remove optional (they keep v1 projection valid).

### 1. Band enums — file `src/modules/market/x402-directory-index.ts` (Slice 1 owns)

```ts
export const DIRECTORY_DEPTH_BANDS = ['unknown', 'broad', 'repeat', 'concentrated', 'whale_heavy'] as const
// calls-per-payer: broad ≈ 1..<2, repeat 2..<5, concentrated 5..<10, whale_heavy >= 10, unknown otherwise (missing/malformed/0 payers)
export const DIRECTORY_RECENCY_BANDS = ['unknown', 'fresh', 'recent', 'stale'] as const
// lastCalledAt relative to projection time: fresh < 7d, recent 7d..<30d (in window), stale 30d+ or absent-but-listed
export const DIRECTORY_MOMENTUM_BANDS = ['new', 'rising', 'flat', 'falling', 'unknown'] as const
// new = payers30d>0 and previous generation had no payers>=0 row (or no activity); rising = payerDelta >= 2;
// falling = payerDelta <= -2; flat = |payerDelta| < 2; unknown = no previous generation to diff.
export type DirectoryDepthBand / DirectoryRecencyBand / DirectoryMomentumBand
```

`x402DirectoryIndexInputSchema.sort` gains `'momentum'` (Slice 1 — the new index orders by
payerDelta desc; a negative-payerDelta filter is NOT exposed).

### 2. Per-entry derived analytics — `convex/lib/x402DirectoryIndex/analytics.ts` (Slice 1)

`searchAnalytics(entry: X402DirectoryEntry, network: string, now = Date.now())` — extend return
(keep all existing keys unchanged) with:

```ts
payerDepth?: number      // calls30d/payers30d rounded to 2dp, only when both safe ints and payers > 0
depthBand: DirectoryDepthBand
lastActivatedAt?: number // Date.parse(lastCalledAt) when finite
lastCalledBand: DirectoryRecencyBand   // computed from `now`
```

New band helpers exported for tests: `directoryDepthBand(calls, payers)`, `directoryRecencyBand(lastCalledAt, now)`.
`memberships()` gains `['depth', depthBandKey]` and `['recency', recencyBandKey]` keys (kind values
`depth` / `recency` live in the analytics facet namespace like `adoption`). Bump `ANALYTICS_VERSION = 2`.

### 3. Momentum — computed in backfill, stored on search rows — `convex/x402DirectoryIndexBackfill.ts` (Slice 1)

For each entry row in the active generation, look up the previous generation's `network='*'` search
row via `by_generation_and_network_and_resource` (query by previous generation string so the query
returns unique/empty). Previous generation = the generation BEFORE the active one (ask the
`marketExternalRegistryGenerations` rows ordered by startedAt desc, second entry). Patch the
projection with:

```ts
momentumOrder: number      // payerDelta when finite, else -1 (missing-comparable)
callDelta: number          // calls30d_now - calls30d_prev when both known
payerDelta: number         // payers30d_now - payers30d_prev when both known
momentumBand: DirectoryMomentumBand
```

Momentum values land on EVERY network projection row of that resource (same numbers, network '*').
The existing per-batch loop patches projections in place; fetch deltas once per batch (bounded:
collect the batch's resources, query previous-gen rows for those resources in ≤3 queries).

### 4. Category concentration table — new — `src/modules/market/internal/convex-schema.ts` (Slice 1)

```ts
marketDirectoryCategoryStats: defineTable({
  generation: v.string(), network: v.string(), category: v.string(), label: v.string(),
  toolCount: v.number(), documentedPayers: v.number(),   // tools with payers30d>=0 int
  totalCalls: v.number(), totalPayers: v.number(),       // only over documentedPayers rows
  top3Share: v.number(),                                 // share of category calls held by the category's top-3 by calls, 0..1
  hhi: v.number(),                                       // Herfindahl over calls shares, 0..1 (1 = monopoly). Computed over documented rows only.
  computedAt: v.number(),
}).index('by_generation_and_network', ['generation', 'network'])
```

Written by a new internal mutation `convex/lib/x402DirectoryIndex/category-stats.ts`:
`finalizeCategoryStats(ctx, { generation, workload })` — paginates `marketDirectorySearchEntries`
network='*' for the generation (pages of 250, loops until done within one invocation; sums per
category: count, documented count, totalCalls, totalPayers, Σcalls², top-3 calls via three running
max slots), then replaces all `marketDirectoryCategoryStats` rows for the generation. HHI =
Σ(callsᵢ/totalCalls)². Exactness contract: computed over the FULL generation (never a sample).
Scheduled from backfill when `page.isDone` and stats not yet computed (track via `convex/
x402DirectoryIndexBackfill.ts` writing `analyticsStatsStatus: 'pending'|'ready'` on the generation row).
Seed through `ctx.scheduler.runAfter(0, internal.x402DirectoryIndexCategoryStats.finalize, args)`.

### 5. Search-row schema — `src/modules/market/internal/convex-schema.ts` (Slice 1)

Add to `marketDirectorySearchEntries` (all optional):
`payerDepth v.number, depthBand v.string, lastActivatedAt v.number, lastCalledBand v.string,
callDelta v.number, payerDelta v.number, momentumOrder v.number, momentumBand v.string`
plus index `.index('by_generation_and_network_and_momentumOrder', ['generation', 'network', 'momentumOrder'])`.
`marketDirectoryFacets.kind` union gains `'depth'` and `'recency'`.

### 6. Browse/sort + entry presentation (Slice 1)

- `convex/x402DirectoryIndex.ts browse`: `sort === 'momentum'` → `by_generation_and_network_and_momentumOrder`
  (gt momentumOrder 0, desc) same provider/category branching as the other sorts. `overview` and
  `analytics` top-lists: add `rising` (top 6 by momentumOrder desc where momentumOrder > 0) and
  `falling` (bottom 6 by momentumOrder asc where momentumOrder > 0).
- `indexedDirectoryEntry(row, search?: SearchRow)` (in `rows.ts`): when search is present, return
  `IndexedEntry` with `analytics?: Readonly<{ payerDepth?: number; depthBand: DirectoryDepthBand;
  lastActivatedAt?: number; lastCalledBand: DirectoryRecencyBand; callDelta?: number; payerDelta?: number;
  momentumBand: DirectoryMomentumBand }>`. Update the hydrate call sites in `x402DirectoryIndex.ts`
  (browse, resource, overview popular/recentlyUpdated, analytics curated) to pass the search row.
- `convex/lib/x402DirectoryIndex/contracts.ts`: `indexedEntryValue` gains
  `analytics: v.optional(v.object({ payerDepth: v.optional(v.number()), depthBand: v.string(),
  lastActivatedAt: v.optional(v.number()), lastCalledBand: v.string(), callDelta: v.optional(v.number()),
  payerDelta: v.optional(v.number()), momentumBand: v.string() }))`.

### 7. Analytics query result — `convex/x402DirectoryIndex.ts analytics` (Slice 1)

Extend the `analytics` query return (all arrays) and compute from facets (depth/recency/momentum
counts via the same `countBatch` pattern used for adoption) + category stats table:

```ts
depth:    readonly { key: DirectoryDepthBand;    label; count }[]   // labels: 'Not comparable','Broad (≈1 call/payer)','Repeat (2–4)','Concentrated (5–9)','Whale-heavy (10+)'
recency:  readonly { key: DirectoryRecencyBand; label; count }[]   // 'Not reported','Active <7d','Touched 7–30d','Stale 30d+'
momentum: readonly { key: DirectoryMomentumBand; label; count }[]  // 'New','Rising','Holding','Falling','Not comparable'
concentration: { basis: 'declared_calls30d', categoryCount: number,
  categories: readonly { key: string; label: string; toolCount: number; documentedPayers: number;
    totalCalls: number; totalPayers: number; top3Share: number; hhi: number }[] }  // sorted by toolCount desc, max 12, only hhi/top3Share over toolCount>=3
rising: readonly indexedEntryValue[] // 6
falling: readonly indexedEntryValue[] // 6
```

### 8. Server DTO — `src/modules/market/x402-directory-catalogue.ts` (Slice 2 owns)

`x402DirectoryCatalogueInputSchema` sort enum gains `'momentum'` (keep the schema's own
`x402DirectoryIndexInputSchema.omit({category})...extend` inheritance; the new sort must pass
through). Extend `X402DirectoryAnalytics` (`kind: 'ok'` branch) with the exact mirror of section 7
(types `DirectoryPayerDepthAnalyticsBucket`, `DirectoryRecencyAnalyticsBucket`,
`DirectoryMomentumAnalyticsBucket`, `categoryStats: readonly X402DirectoryCategoryConcentration[]`
where the category item has the section-7 field set) and `rising/falling: readonly X402IndexedDirectoryEntry[]`.
`X402IndexedDirectoryEntry` is already exported from x402-directory-index; check whether it needs a
mirror of the `analytics` block (it comes from `IndexedEntry` — Slice 1 owns the shared type; Slice 2
only consumes).

Also file `src/modules/market/x402-directory-index.server.ts`: map the convex `analytics` result
1:1 into the DTO (it already does this for the existing sections — extend the mapper for the new
sections; keep the 'unavailable' pass-through).

### 9. UI composition (Slice 3 owns; all names below are targets you may refine)

- `src/components/ae/market/DirectoryLeaderboard.tsx` — enrich each rank:
  - keep rank/calls/meter; add payers line (`N payers` under calls when known), depth chip
    (Badge: `Broad`/`Repeat`/`Concentrated`/`Whale-heavy` styled subtle, title-tooltip with the
    definition and "calls per payer, last 30 days · reported"), momentum chip (▲ Rising / New /
    ▼ Falling / — Flat, colored semantic, sr-only label; only when `entry.analytics` present),
    all fed by `X402IndexedDirectoryEntry.analytics`.
  - footer copy: keep "reported by Coinbase Bazaar" and add "Depth and trend are derived from
    reported 30-day activity." — do NOT call them measured.
- `src/components/ae/market/DirectoryAnalyticsCharts.tsx` — new visual sections (add props type
  `signals?: DirectoryAnalyticsSignals`):
  1. **"Momentum"** — two compact lists "Rising" / "Falling" from `rising`/`falling` entries
     (name + provider + `▲N payers`/`▼N`), using existing Badge/Button/Card patterns.
  2. **"Payer depth"** — `EvilBarChart` (existing `@/components/evilcharts/charts/recharts-bar-chart`)
     over `depth` buckets; select-bucket → onExplore({ sort: 'adoption' }) style callback (add
     `onSelectDepthBand`).
  3. **"Freshness"** — `EvilBarChart` over `recency` buckets (colored by semantic var), caption on
     reported last-called timestamps.
  4. **"Category concentration"** section (new, in `DirectoryMarketOverview` area or a new
     `DirectoryConcentration.tsx` you create under `src/components/ae/market/`): a category Select
     (reuse existing Select primitives) pre-loaded with the top category; for the selection show:
     a ring/gauge (reuse `@/components/charts/gauge` or `pie-center` primitives — bklit-style
     donut: top-3 share of category calls as the active arc, remainder muted) with tabular-nums
     center label, an `HHI` "concentration meter" Badge (Low <0.25 / Moderate 0.25–0.5 / High >0.5),
     top-3 tool names + share bars (CSS meters, `role="meter"` like the leaderboard), and a bar
     chart of every category's top3Share (EvilBarChart), sorted desc, click → filter category.
     All numbers labeled "reported calls, last 30 days".
  5. Keep every existing section and its tests passing. Counts tables stay color/hover-independent.
- Wire `DirectoryMarketOverview.tsx` to pass `analytics` through (it already receives analytics;
  thread the new fields to `DirectoryAnalyticsCharts`). If `DirectoryAnalyticsCharts` props grow,
  keep them optional so the existing 4 sections remain.

### 10. Tests (each slice owns its own)

- Slice 1: `convex/x402DirectoryIndex.test.ts` (or extend existing pattern — check for an existing
  test file first and extend it): band function unit tests (depth thresholds incl. 0/negative/
  undefined payers; recency boundaries 7d/30d with injected `now`; momentum deltas), category
  HHI/top3Share math on a hand-built 4-row fixture (exact expected values), backfill delta wiring
  with a two-generation fixture.
- Slice 2: extend `tests/unit/market` DTO/projection tests that cover `X402DirectoryAnalytics`
  mapping (find existing coverage in `tests/unit/market/*.test.ts` and extend for the new sections,
  incl. 'unavailable' pass-through).
- Slice 3: `tests/unit/market/directory-analytics-signals.test.tsx` (or extend
  `directory-analytics-charts.test.tsx` + `directory-leaderboard.test.tsx`): leaderboard renders
  payers/depth/momentum chips from `analytics` presence and omits them without; momentum lists;
  concentration panel renders selected category ring + HHI badge + top-3 rows; depth/freshness
  buckets render from counts. Match existing project test conventions; deterministic.

## Data-flow recap (truth you implement against)

refresh (`marketExternalRegistryRefresh`) → `x402DirectoryIndexStore.writeSource` writes
registry rows + per-network `marketDirectorySearchEntries` projections (`searchAnalytics`) →
`x402DirectoryIndexBackfill.batch` re-derives projections when ANALYTICS_VERSION bumps (now = v2;
also computes momentum from previous generation + fires category finalize when done) →
`marketDirectoryCategoryStats` table → `x402DirectoryIndex.analytics` query (facets +
category-stats) → `readX402DirectoryAnalytics` (server) → `DirectoryMarketOverview` +
`DirectoryAnalyticsCharts` UI. `browse` sort 'momentum' uses the new index.

## Acceptance (what "done" means for the whole feature)

- Fresh ANONYMOUS local seed → after backfill: `/market` analytics page shows Depth, Freshness,
  Momentum and Category concentration sections with real numbers; leaderboard shows payers/depth/
  momentum chips; sort=momentum + rising/falling lists work; the category ring changes when a
  different category is selected; all labels mark numbers "reported" or "derived", never "measured".
- No new dependencies. No generated-file edits by hand. Full gates: `npm run typecheck`, scoped
  oxlint, `convex codegen` (mine to run), market + convex test suites green.