# Frontend code structure — 29 September 2026

**Checkout:** `d104a8009` on `main`. **Live document:** `GET http://127.0.0.1:3024/market` at 06:53 UTC, uncompressed `text/html`, 1,271,145 bytes. That response is the local Vite server (`server: Vercel` via the local launcher, `x-vercel-cache: MISS`, no `Content-Encoding`). Gzip of the same body is 166,396 bytes; Brotli is 107,925. The 1.27 MB figure is the document the browser parsed, not a production transfer-size claim.

**References.** [Convex TanStack Start template](https://github.com/get-convex/templates/tree/main/template-tanstack-start) (`get-convex/templates` `template-tanstack-start`, router and routes read 29 September 2026). [TanStack `start-convex-trellaux`](https://github.com/TanStack/router/tree/main/examples/react/start-convex-trellaux). [Convex TanStack Start docs](https://docs.convex.dev/client/tanstack/tanstack-start): server-render with `useSuspenseQuery(convexQuery(...))`, then the browser Convex client resumes the same subscription.

## Judgment

Routes are thin. The cost sits behind them: a repeated feature-folder ceremony, a hand-written view of every Convex result, and a second data path that does not share a cache with `convex/react`.

The market page is the sharp case. Discover renders about 43 tool cards. The HTML still carries 84 full directory entries, including provider source JSON, input/output schemas, and per-field examples. Those strings are not in the DOM. They are the TanStack Start hydration graph. A compact Convex query already exists for search and the HTTP registry. The page does not use it.

Chat is the closest thing in this repo to the shape a mature TanStack app uses: one hook builds one model, one layout renders it. Admin copies that split and then adds a contracts file, a server function, and a `components/` folder per screen. Market does not use that split. `AeX402Directory` is a 620-line container that also renders.

## What is on disk

`src/` has 1,613 TypeScript files. Roughly:

| Area | Files | Role |
|---|---|---|
| `src/components` | 650 (434 non-test `.tsx`) | UI. `ae/` is product, `ui/` is 39 primitives, `ai-elements/` is one file |
| `src/modules` | 632 | Domain, server functions, Zod, view-models. 26 `public.ts` barrels |
| `src/routes` | 157 | 65 page `.tsx` files, 92 server route `.ts` files |
| `src/lib` | 161 | Convex HTTP client, operator contracts, UI helpers |
| `src/hooks` | 5 | App-wide hooks only: mobile, clipboard, mounted, call recovery |

Page routes stay small. The 65 `.tsx` routes are about 2,400 lines together (`market.tsx` is 68, `__root.tsx` is 109). A route validates search, calls a loader, and renders one page component. That matches TanStack Start’s file routes. The official `start-basic` example and the Convex template do the same thing, with the component usually still in the route file.

Market is the counterexample of what happens after the route. `src/modules/market` is 35 files. `src/components/ae/market` is 45. Changing the page means crossing both trees.

## Component tree

A Collections card is about fourteen components deep before its own `Card`:

`RootDocument` → `ClerkProvider` → `SignedInConvexProvider` → `ThemeProvider` → `AeAppShell` → error boundary → `Outlet` → `MarketRoute` → `AeMarketPage` → `AePublicPage` → `AeX402Directory` → `MarketNavigationProvider` → `DirectorySavedToolsProvider` → `DirectoryMarketplace` → `DirectoryHomeDiscovery` → carousel item → `DirectoryToolCard`.

Depth alone is ordinary for an app shell. The problem is that `DirectoryMarketplace` (`AeX402Directory.tsx`, 620 lines) owns search, pagination, compare, saved-tool callbacks, tab navigation, and layout. Child files exist (`DirectoryHero`, `DirectoryHomeDiscovery`, `DirectoryToolCard`, `DirectoryToolList`), but they are sections of that function, not a tree you can change one branch at a time.

Chat is shallower in responsibility, not in files:

```6:9:src/components/ae/chat/chat-session/Chat.tsx
export function Chat(props: ChatProps) {
  const model = useChatSession(props)
  const needActions = useChatNeedActions()
  return <ChatNeedActionsContext.Provider value={needActions}><ChatLayout model={model} /></ChatNeedActionsContext.Provider>
}
```

`ChatLayout` takes one prop, `model: ChatSessionModel`. Admin overview is the same idea with more files: `AdminOverviewPage` calls `useAdminOverview` and passes section state into `components/`.

Folder depth under product UI is `src/components/ae/<area>/<feature>/components/<Leaf>.tsx`. There are 40 directories literally named `components`. Largest feature folders: `chat-session` 23 files, `market/tool-detail` 15, `command-panel/tools-search-page` 15, `console/agent-operator-console` 14. Admin overview, a single dashboard, is 11 files for one route.

## Container / presenter

Three styles coexist.

**Chat (container, then presenter).** `Chat.tsx` is the container. `components/ChatLayout.tsx` and its siblings are presenters. Live slices that need their own Convex query are named containers: `ChatHeaderAuthorityContainer`, `ChatOwnerApprovalsContainer`, `ChatHistoryPanelContainer`. Each container calls `useQuery` and renders a presenter. That is a real split. The hook behind it is still large: `useChatSession.ts` is 467 lines and `chat-session.contracts.ts` is 143.

**Admin (hook + contracts + nested presenters).** `AdminOverviewPage` is a container. `useAdminOverview` maps Convex results into loading / refused / ready unions. Copy and those unions live in `overview.contracts.ts`. Presenters live in `components/`. The route loader does not load the Convex overview. It loads Formance presence through `readAdminFormanceConfigurationServer`. The lists on the page appear only after `useQuery` resolves in the browser.

**Market (thin route, fat mixed component).** `market.tsx` passes loader data into `AeMarketPage`, which passes a wide prop bag into `AeX402Directory`. The card is a presenter (`DirectoryToolCard` takes `DirectoryToolCardModel`). The mapping runs in the child, during render, after the full entry has already been serialized:

```59:63:src/components/ae/market/DirectoryHomeDiscovery.tsx
              {rail.items.slice(0, 8).map(entry => {
                const item = { entry, search: rail.search }
                return <CarouselItem key={entry.resource} className="h-full basis-[85%] pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                  <DirectoryToolCard model={toDirectoryToolCardModel(entry)} onSave={() => onSave(item)} ...
```

The view-model does not define the payload. The payload is `X402DirectoryEntry`, and the card throws most of it away.

There is no app-wide presenter convention. Three files are named `*Container*`. Six are named `*Presenter*` or `*View.tsx`. The split is local habit, copied per feature folder.

## Contracts and view-models

About 90 `*.contracts.ts` modules sit under `src/components` (58) and `src/modules` (33). Twenty-one `*.view-model.ts` modules. Together, `*.contracts.ts` and `*.view-model.ts` are about 7,000 lines.

They are a second type system next to Convex validators. A Convex query already has `args` and `returns`. The UI then declares a Zod schema or a hand-written `Readonly` type, a server-function return type, a view-model, and often a `kind: 'loading' | 'refused' | 'ready'` union. `sourceQuery<Args, Result>('x402DirectoryIndex:browse')` repeats the result type as a string-keyed generic. There are 107 `sourceQuery<...>` sites. Generated `api` from `convex/_generated/api` is imported from 42 non-test `src` files, mostly the `useQuery` call sites. The two styles do not meet.

`DirectoryToolCardModel` is the right kind of view-model: title, price label, glance, access label. It is derived in `directory-card.view-model.ts` from the fat entry. Nothing in the loader calls it. `storedDirectoryEntry` puts the raw observation back on the entry as `metadataJson: row.directorySourceJson` (`convex/lib/market/directoryIndex/rows.ts`). Browse returns that entry. The card never reads `metadataJson`, `schemaJson`, or `exampleJson`. Those are detail-page fields (`DirectoryToolPlayground`, `DirectoryToolPage`).

## Hooks

| Kind | Count |
|---|---|
| Files named `use*.ts` / `use*.tsx` | 72, of which 5 are in `src/hooks` |
| `function use…` declarations | 92 |
| `useQuery(` from `convex/react` | 29 calls, 23 non-test files |
| `createServerFn` | 172 calls, 44 files |
| `@tanstack/react-query`, `@convex-dev/react-query`, `convexQuery` | none in `package.json` or `src` |

Feature hooks are colocated (`useAdminOverview`, `useChatSession`, `useProviderCataloguePages`). That is fine. The market directory also hides three hooks inside `AeX402Directory.tsx`: `useIndexedPagination`, `useCanonicalMarketSearch`, and the provider-page hook in another file. Pagination does not subscribe. It calls `readX402DirectoryCatalogueServer` again.

`src/hooks` is not the product data layer. Product data lives in feature hooks and in `*.functions.ts`.

## Prop drilling

Market drills a callback bag two levels, and uses context for two other concerns.

`AeMarketPage` passes `data` and `search`. `AeX402Directory` spreads that into `DirectoryMarketplace`. Discover then passes eight props into `DirectoryHomeDiscovery`: `home`, `onSave`, `isSaved`, `saveDisabled`, `saveUnknown`, `onCompare`, `isComparing`, `compareDisabled` (`AeX402Directory.tsx` around the `TabsContent value="discover"` block). The same callback set is repeated for `DirectoryToolList`. `MarketNavigationProvider` and `DirectorySavedToolsProvider` already exist, so path and saved-tool state are context, while save and compare stay props. The card itself is clean. The parent call site is one long JSX line.

Chat avoids that by putting callbacks on `ChatSessionModel`. Admin passes section state objects, not raw Convex documents. Market passes `X402DirectoryEntry` until the last moment, and the entry is also the saved-tool contract (`saved-tools.contracts.ts` includes `metadataJson`). One wire type serves the loader, the card mapper, compare, and saved tools.

## What a label costs, and what a field costs

**A label that was copied.** “Inspect Tool” is a literal in `DirectoryToolCard.tsx`, `DirectoryToolList.tsx`, and `DirectoryComparison.tsx`. `tests/unit/market/x402-directory-page.test.tsx` queries it by accessible name. Four files. Collection titles live once, in `X402_MARKETPLACE_COLLECTIONS` (`x402-marketplace-home.ts`). The jump-nav words (“Create”, “Research”, “Build”) are a second map in `DirectoryHomeDiscovery.tsx`. Renaming a collection’s job is two files even when the sentence in the rail is one.

**A label that was centralized.** Admin overview titles live in `ADMIN_OVERVIEW_COPY` and are read by the route `head` and the page. One file, unless a test asserts the sentence.

**A display field that already existed on the entry.** `audEstimate` is computed in `withAudEstimates` and then has to be named on `X402DirectoryEntry`. It is referenced from eight files: the entry type, the catalogue server, the card view-model, `AeToolEconomics`, the saved-tool contract, `saved-tools-api`, and two tests. The saved-tool path is in that list because the saved payload reuses the directory entry instead of the card model.

**A new card field that is not already on the entry.** The practical fan-out is the Convex search row or registry document, ingestion, the browse return validator, `indexedDirectoryEntry`, the `X402DirectoryEntry` type, `DirectoryToolCardModel`, `DirectoryToolCard`, and the view-model test plus a page test. That is about eight to ten files before any HTTP or saved-tool copy. The compact query’s return (`searchCompactReturns` in `convex/lib/market/directoryIndex/browse.ts`) is a separate validator again, so a field that should exist on both the page and the registry API is two projections.

The ceremony is not required for the sentence on the card. It is required because the entry type is the API.

## Why `/market` HTML is 1.27 MB

Measured body, 1,271,145 bytes:

| Piece | Bytes | Share |
|---|---|---|
| Inline script `# $tsr-stream-barrier` (`self.$R` / `self.$_TSR`) | 962,615 | 76% |
| DOM after scripts are removed | 306,734 | 24% |
| Of which `class="..."` attribute text | 196,309 characters across 1,184 attributes | most of the DOM |
| 84 inline SVGs | 31,550 | |
| Visible text, tags stripped | ~15,000 characters | |
| JSON-LD, theme script, Clerk stub, dev client entry | under 2 KB combined | |

The barrier script is TanStack Start’s dehydrated router state, not the Vite client (`/@id/virtual:tanstack-start-dev-client-entry` is a separate 91-byte tag). It assigns 2,787 `$R[n]` objects. Keyed string literals in that script are 771,881 characters. The large ones:

| Field | Count | Characters | Max |
|---|---|---|---|
| `metadataJson` | 84 | 317,753 | 13,259 |
| `schemaJson` | 166 | 172,579 | 10,817 |
| `exampleJson` | 1,385 | 123,266 | 2,888 |
| `description` | 324 | 31,630 | 482 |

`metadataJson`, `schemaJson`, and `exampleJson` occur **zero** times in the DOM. The cards show title, glance, price, and access. Schemas are for the tool page and the playground.

Why 84 entries. Discover’s loader always loads the catalogue page and, for the Collections view, the home rails (`loadMarketRouteData` in `market-route-data.ts`). Home runs one catalogue read per editorial collection (`readX402MarketplaceHome`, six entries in `X402_MARKETPLACE_COLLECTIONS`). `browseHandler` clamps each page to 12 items (`convex/lib/market/directoryIndex/browse.ts`, `numItems: Math.min(paginationOpts.numItems, 12)`), even though the server function asks for 24. Seven pages of 12 is 84. The script has 84 `resource:` fields and 79 unique URLs, so five tools are stored twice. Each `browse` page also `ctx.db.get`s the registry document and copies `directorySourceJson` onto the entry.

The Collections UI then does `rail.items.slice(0, 8)`. The DOM has 86 `/tools/...` links and 43 unique tool URLs, which is two links per painted card (title and “Inspect Tool”) and no hidden Tools-tab list. About half of the dehydrated entries are not painted. The painted ones still carry full contracts.

`searchCompact` already returns id, title (72 code points), summary (100), provider, price, and access, and skips `db.get(entryId)` when the slim row is filled (`browse.ts` `searchCompactHandler`). Chat tools and `/api/v1/registry` use it. The market loader uses `x402DirectoryIndex:browse`. The same conclusion is in `docs/reviews/alpha/health/performance-static.md`: the market UI does not use the compact row.

The other quarter of the document is markup. Tailwind class strings on every card, carousel control, and tab are 196 KB of attribute text. That is real, and it is not why the file crossed a megabyte. Compression would shrink the JSON a lot (the gzip body is 166 KB). It would not remove the fact that first load hydrates detail documents for a card grid.

Client pagination does not fix the first document. `useIndexedPagination` calls `readX402DirectoryCatalogueServer` for the next cursor, which is another full browse page, not a compact page and not a Convex subscription.

## Two data layers

Yes. They do not share a cache.

**Layer A — Start server functions and route loaders.** 172 `createServerFn`s. Loaders on 29 route files. Implementation is `ConvexHttpClient` behind `callPublicSourceQuery` / `createAuthenticatedConvexClient` in `src/lib/server/convex-source.ts`, often addressed by string: `sourceQuery<...>('x402DirectoryIndex:browse')`. The result is validated or retyped in `src`, returned from the loader, and embedded in the HTML. Updates require `router.invalidate()` or another server-function call. Market, public catalogue, and Formance presence work this way.

**Layer B — `convex/react` subscriptions.** 29 `useQuery` calls, all on signed-in surfaces: admin overview, exceptions, metrics, audit, object pages, settings, billing, chat session, onboarding, operator entitlement. `SignedInConvexProvider` mounts `ConvexProviderWithClerk`. The comment in `AeConvexProviders.tsx` says anonymous public pages open no websocket. Market never subscribes. Admin Convex data is not in the route loader, so the first paint is the skeleton until the websocket query resolves.

There is no `QueryClient`, no `convexQuery`, and no `useSuspenseQuery`. A page that needs both a server-only fact and a Convex query (admin overview: Formance in the loader, overview and metrics in `useQuery`) pays both round-trips and both type shapes.

The official pattern is one query definition. The Convex template wires it in `src/router.tsx`:

- `ConvexQueryClient` from `@convex-dev/react-query`
- `QueryClient` whose `queryFn` and `queryKeyHashFn` come from that client
- `ConvexProvider` around the router
- Route components call `useSuspenseQuery(convexQuery(api.myFunctions.listNumbers, { count: 10 }))`

TanStack’s `start-convex-trellaux` adds the loader half of the same cache. The board route is a preload, not a second fetch:

```ts
loader: async ({ params, context: { queryClient } }) => {
  await queryClient.ensureQueryData(boardQueries.detail(params.boardId))
}
```

`boardQueries.detail` is `convexQuery(api.board.getBoard, { id })`. The component reads that query again. Convex’s docs describe why: `useSuspenseQuery` runs during SSR; after hydration the browser client resumes the live subscription from that result, instead of fetching twice or flashing a skeleton. SSR still sends a timestamp so the queries on one response share one logical time.

That is the opposite of this app’s market path (HTTP snapshot, no subscription, hand-written result type) and of its admin path (subscription, no SSR preload).

A server function is still the right tool when the read is not a Convex query. Market’s AUD estimate joins `readPersistedReferenceRate()` in the Start server, outside `browseHandler`. That join does not require returning `directorySourceJson` or schema text. The template’s `useAction` / server-function escape hatch is for that kind of edge, not for every list.

## What the official apps refuse to grow

The Convex TanStack Start template is six source files under `src/` plus `convex/myFunctions.ts` and `convex/schema.ts`. The route file is the page. Types come from the generated `api`. There is no contracts file, no view-model, no `components/` folder inside a feature.

`start-convex-trellaux` is a full board UI in about twenty `src` files: `routes/`, `components/Board.tsx`, `components/Card.tsx`, `queries.ts`, `types.ts`. Components are one directory, not `feature/components`. Queries are a module of `convexQuery(...)` options. The route preloads and passes an id. Optimistic updates call `localStore.getQuery(api.board.getBoard, ...)` on the same query the screen renders. Adding a field is the Convex document, the query return, and the component that prints it.

`start-basic` (no Convex) colocates loader and component in the route file and keeps shared chrome in `src/components` (`DefaultCatchBoundary`, `NotFound`). It does not invent a view-model per page.

AE is past the size of those examples, and a market with money, authority, and x402 listings should not be a single route file. The examples still show the boundary that stayed small as they grew: one Convex function reference, one cache, presenters that receive the fields they render, routes that preload that query. This repo’s chat layout is already that presenter shape. Its market loader and its parallel `sourceQuery` types are not.

## Structural consequences

- A Collections card is a small DOM node and a large dehydrated entry. First load ships detail contracts for tools the grid does not show, then throws them away in `toDirectoryToolCardModel`.
- The next page is a second mechanism (`createServerFn` → `browse`), not an update to the same query.
- Signed-in screens subscribe, but their loaders do not preload those subscriptions, so they skeleton-flash data the official Start integration would have rendered on the server.
- Copy, Zod, view-models, and Convex `returns` validators describe the same screen. A label is one to four files. A new card field is a type that fans out through the entry, the saved-tool contract, and the view-model because those were not separated.
- Forty `components/` folders encode the admin split even where the screen is a single static page (legal, auth, status). The folder is the convention; the split is not always earning it.
