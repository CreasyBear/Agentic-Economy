# Marketplace component provenance

Reviewed 2026-09-08. The aecon.ai marketplace reuses selected permissively licensed source and installed UI primitives while retaining AE's directory, Quote and Call boundaries. No external commerce backend or search service was added.

## Source actually adapted

| Source | Local capability | Boundary |
| --- | --- | --- |
| Spree [ProductCard](https://github.com/spree/storefront/blob/main/src/components/products/ProductCard.tsx), [controlled filters](https://github.com/spree/storefront/blob/main/src/components/products/filters/ProductFilters.tsx), [mobile filter drawer](https://github.com/spree/storefront/blob/main/src/components/products/filters/MobileFilterDrawer.tsx) — MIT | `DirectoryToolCard` adapts card structure and stretched interaction. `DirectoryFilters` adapts controlled, staged apply/clear/cancel behavior with existing Sheet and Field primitives. | AE data and callbacks replace Spree product types, routing, translations and backend. Network, Provider hostname, maximum USD price and indexed directory category are supported. Indexed browse can order by reported usage or update time; keyword search uses native relevance. No retail stock, sale or invented facet counts. |
| Mercur [identity header](https://github.com/mercurjs/mercur/blob/main/apps/storefront/src/components/molecules/SellerInfoHeader/SellerInfoHeader.tsx), [identity composition](https://github.com/mercurjs/mercur/blob/main/apps/storefront/src/components/molecules/SellerInfo/SellerInfo.tsx) — MIT | `DirectoryProviderCards` adapts identity/header composition with declared service icons or initials and groups results by exact hostname. The dedicated header shows declared Tool names, descriptions, tags and networks. `DirectoryProvidersIndex` composes the same identity pattern with native paginated Provider facets and links to each hostname’s Tool grid. | Counts describe observed results unless an explicitly complete index supplies the total. No company verification, ratings, join dates, guessed logos, Medusa customer identity or chat. The complete Mercur provider page was not imported. |
| ShadcnSpace [wishlist context](https://github.com/shadcnspace/ecommerce-shadcn-nextjs-template/blob/main/components/wishlist-context.tsx) — MIT | `DirectorySavedTools` adapts browser-local context and saved-item behavior; AE adds bounded validated source snapshots, hydration, storage failure handling and cross-tab refresh. | Saved discovery references retain their original filters for re-resolution. They are not purchases or guarantees of current price. Browser storage is not account-wide persistence. |
| Installed [shadcn/ui](https://github.com/shadcn-ui/ui) and [Radix Primitives](https://github.com/radix-ui/primitives) — MIT | Card, Button, Sheet, Dialog, Tabs, Field, InputGroup and Table provide interaction and composition. Official Avatar and Carousel primitives provide service-icon fallbacks and responsive collection shelves. | Repository components are used; Carousel uses the installed Embla 8.6.0 React package. Focus restoration, cancellation and responsive overflow are covered by focused tests. |

The analytics charts use actual registry components from both requested chart libraries:

- **EvilCharts:** `recharts-bar-chart` and its five support components were installed through `npx shadcn@latest add https://evilcharts.com/r/recharts-bar-chart.json`. The maintained Recharts implementation supplies distribution bars, axes and tooltips. AE supplies full-generation price/adoption/category counts, semantic colors and accessible numerical tables with filter actions.
- **Bklit UI:** `gauge-chart` and its required support components were installed through `npx shadcn@latest add https://ui.bklit.com/r/gauge-chart.json`. Gauge visualizes each declared metadata-coverage proportion with its numerator and denominator. Only MIT chart source is included; proprietary Bklit Studio and its application are not imported.

The registry dry runs were inspected first; Bklit's proposed overwrite of AE's existing `utils.ts` was explicitly declined. Existing shared controls and global styles were preserved. Registry entries are retained in `components.json`; required Motion, NumberFlow and limited Visx/D3 dependencies are in the package manifest and lockfile. Vendored source retains upstream filenames. Local compatibility changes adapt optional props to strict TypeScript, avoid forwarding undefined props to third-party components, and restrict the invisible bar hit rectangle to geometry. Neither compiler checks nor project styling rules were disabled. MIT notices are retained in `docs/licenses/evilcharts.txt` and `docs/licenses/bklit-ui.txt`.

Primary distributions and secondary coverage/category panels can be composed independently. Count tables remain available without relying on color or hover. Bar entry animation is disabled, Bklit Gauge respects reduced motion, and chart containers fit the available width. Coverage is metadata presence, not measured reliability or a quality rating. No synthetic time series, growth arrow or invented performance benchmark is supplied.

Upstream notices are retained in `docs/licenses/spree-storefront.txt`, `mercur.txt` and `shadcnspace.txt`. Preserve them when redistributing adapted source. The `main` source links identify the inspected files; retrieval dates and modifications are recorded in each notice.

## Collection and Tool-detail references

[Replicate collections](https://replicate.com/collections) and the [Apify Store](https://apify.com/store) inform category discovery, Tool cards, Provider context and detail-page composition. They are product references, not imported OSS storefront code. No Replicate or Apify branding, media, service integration or execution backend was copied. The paired request/example-output presentation also references [Replicate's model playground](https://replicate.com/851-labs/background-remover).

The form renderer is installed RJSF 6.8.0 (`@rjsf/shadcn`, core and utils), with AE's existing `@cfworker/json-schema` validator adapted to its interface. This avoids dynamic schema compilation under AE's Content Security Policy. Core/utils use Apache-2.0; the shadcn package declares MIT and distributes an Apache-2.0 licence file. Both notices are retained in `docs/licenses/rjsf.txt`. Embla and shadcn notices are retained in `docs/licenses/embla-carousel.txt` and `docs/licenses/shadcn-ui.txt`.

Service names, moderated/rehosted service icons, declared input/output schemas and examples come from Coinbase directory metadata. They are not verified company identities or proof that an example was produced by an AE Call. Prices retain their declared asset and exact amount; an asset amount is not relabelled as USD. Sparse or oversized metadata is omitted explicitly rather than fabricated. Schemas and examples describe a Tool's declared contract; editing a form does not itself authorize or execute a paid Call.

## Indexed catalogue and discovery behavior

The completed local directory scan contains **14,426 Tools, 1,918 Provider hostnames and 81 categories**. The upstream reported count changed by one during traversal. This is a completed observed scan, not an atomic upstream snapshot or a guarantee that the external directory has stopped changing. Coverage retains the generation, traversal timestamps, reported totals and source-change evidence separately from result pages.

Catalogue browsing and keyword search use Convex native indexes, full-text search and cursor pagination. Facet counts use the installed `@convex-dev/aggregate` component. AE supplies source ingestion, DTO projection and filter integration; no separate search engine was implemented or hosted. The Providers tab traverses native pages of up to 24 hostnames rather than presenting the overview's twelve-host sample as the full list. Provider cards show indexed Tool counts and open the hostname's Tool grid. Index cursors, Provider cursors and legacy source offsets remain distinct. The unfiltered catalogue total is not presented as the number of matches in a filtered page. Exact selected-resource lookup is independent of whether that Tool appears in the current search results.

The **Most-used Tools** leaderboard displays up to twelve ranks from the catalogue's reported Call ordering. Counts are Coinbase Bazaar's reported usage over the last 30 days; activity bars compare each Tool with the leading Tool. They are not AE-measured purchase volume, ratings, quality scores or a service guarantee. Missing activity remains explicitly unavailable. The leaderboard composes existing shadcn Card, Button and Badge primitives with AE's source-backed projection; it is not a separately installed ranking engine.

The original home shelves query six capability groups independently and limit repeated hostnames within each shelf. They remain bounded editorial discovery selections. SDK fallback is used only when the index explicitly has no active generation, and is labelled as limited upstream discovery. Index-only categories, ordering or cursors are never silently reinterpreted as SDK filters.

Functional Tool titles prefer explicit source titles, then a concise first description clause, with the service name retained as identity. The shared `x402-directory-title` helper is AE-owned presentation code, not a separate dependency. Existing indexed snapshots are reprojected from retained source metadata without a new scan or changes to their source digest. Full source descriptions and metadata remain available within the existing projection bounds. Unknown token denominations display “See payment details” in compact views; Details explicitly retains the first option's exact token amount and network, along with the remaining payment options. Unknown decimals or token identities are not guessed, and a token amount is not relabelled as USD.

## Alternatives researched, not installed

- [Typesense's million-listing Airbnb geosearch showcase](https://github.com/typesense/showcase-airbnb-geosearch) is a possible future search-engine reference. Adoption requires an actual Typesense service, indexed source synchronization and an AE data integration; it does not expand Coinbase's current search response simply by copying the UI.
- [Channel3 UI](https://github.com/channel3-ai/channel3-ui) is MIT and offers search/detail blocks, but its types and retail product semantics target `@channel3/sdk`; its asynchronous hooks use TanStack Query. Adapting it still requires AE data mapping and appropriate server fetchers. It was not imported.
- [Square UI rentals](https://github.com/ln-dev7/square-ui/tree/master/templates/rentals) is a visual reference, not a permissive OSS source for this change. The inspected [ln-dev UI licence](https://github.com/zerostaticthemes/square-ui/blob/master/LICENSE.md) allows integrated commercial applications but restricts component/template redistribution, repository availability and competing UI products. No Square UI source was copied.

## Approved local aecon.ai assets

The user-approved source is `/Users/joelchan/Documents/Coding/App-Dev/live/agentic-economy-website/`. The following nine files match the source byte-for-byte, verified on 2026-09-08:

| Source under that site's `public/` | Destination in this repository |
| --- | --- |
| `brand/aecon-horizontal-light.svg` | `public/brand/aecon-horizontal-light.svg` |
| `brand/aecon-symbol-chalk-gold-compact.svg` | `public/brand/aecon-symbol-chalk-gold-compact.svg` |
| `brand/aecon-symbol-forest-compact.svg` | `public/brand/aecon-symbol-forest-compact.svg` |
| `fonts/manrope-latin.woff2` | `public/fonts/manrope-latin.woff2` |
| `media/editorial-library/archive-light-small.webp` | `public/media/market/archive-light-small.webp` |
| `media/editorial-library/radio-array-small.webp` | `public/media/market/radio-array-small.webp` |
| `media/editorial-library/orbital-panel-small.webp` | `public/media/market/orbital-panel-small.webp` |
| `media/editorial-library/telescope-mirror-small.webp` | `public/media/market/telescope-mirror-small.webp` |
| `media/editorial-library/lunar-limb-medium.webp` | `public/media/market/lunar-limb-medium.webp` |

Manrope is served locally; its SIL Open Font License is retained in `docs/licenses/manrope.txt`. The brand and editorial artwork come from the approved local site; this provenance does not classify them as third-party OSS.

Collection images are decorative editorial artwork with empty alternative text. Collection links perform ordinary directory searches. Images do not depict a Tool's output, identify a Provider or establish availability. Tool descriptions, prices, metadata and comparison facts remain attributable to directory entries. No invented ratings, activity or provider photographs are added.

## Verification scope

Focused tests cover filter validation and cancellation, native search and cursor retention, Provider pagination, exact selected-resource lookup, saved-source selection, comparison facts, functional titles, exact payment visibility and focus return. Local runtime verification established the completed observed index and its browsing surfaces. Selecting a Tool prepares its existing AE command. This document does not establish hosted deployment, a successful paid Call, Provider verification or a quality guarantee.
