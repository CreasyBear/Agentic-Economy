# Design Concerns

**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

This map records design debt and weak seams in the current working tree. Authority is ordered `DESIGN.md` > `.planning/BRAND.md` > implementation. `[verified]` means the cited source was inspected on disk; `[from-history-verify]` records the shared dirty-tree state supplied by the mapper context.

## Drift from authority

- **[verified] Market typography is not an explicit terminal choice.** `src/components/ae/market/AeMarketPage.tsx:272-280` uses the default `AePageHeader` variant, while `src/components/ae/layout/AePageHeader.tsx:68-80` renders the title in `font-display`. `DESIGN.md:18-36` reserves Geist Pixel for public hero/page-level brand statements and makes the Market mode denser. Give the market header an explicit type decision instead of inheriting the public-page default.

- **[verified] Operator navigation uses default uppercase tracking.** `src/components/ae/layout/AeOperatorSidebar.tsx:128-142,177-180` and `src/components/ae/layout/AeOperatorShell.tsx:231-239` apply `font-mono ... uppercase tracking-[0.12em]` to role and section labels. This conflicts with `DESIGN.md:34-36`, which permits a marked public eyebrow but calls for ordinary labels on operational screens. Keep uppercase treatment only where it carries a real eyebrow/status meaning.

- **[verified] Shared controls bypass the declared radius and focus recipes.** `src/styles/globals.css:181,221` declares `--radius: 0.625rem` and `--ae-focus-ring`, but `src/components/ui/button-variants.ts:7-8` and `src/components/ui/input.tsx:10-13` use stock `rounded-md` and translucent `ring-[3px]` focus styling. Several controls in `src/components/ui/` repeat that recipe. Route all shared controls through the declared control radius and one visible double-ring treatment, or document an intentional primitive exception.

- **[verified] The Clerk adapter owns a parallel visual vocabulary.** `src/components/ae/website/clerk-appearance.ts:9-23,30-35` hard-codes OKLCH colors and sets `borderRadius: '0px'`; its form controls use `rounded-none`. `DESIGN.md:38-46` and `.planning/BRAND.md:74-91` establish shared control and surface rules. Keep the provider adapter, but make its literal values an explicit token bridge or a documented auth-only exception so auth screens cannot silently diverge after token changes.

- **[verified] Owner publication editing violates the whitespace-first grouping rule.** `src/components/ae/offerings/AeOwnerOfferings.tsx:642-748` puts bordered `rounded-lg` route rows and a bordered `FieldGroup` inside `AeSection`, then nests another `FieldGroup` inside the collapsible request details. `DESIGN.md:48-53,76-83` forbids bordered cards inside bordered cards merely for grouping. Prefer section spacing and one divider; retain borders only for an actual raised task or input boundary.

## Inconsistencies

- **[verified] Overlay and modal primitives do not share one surface/motion contract.** `src/components/ui/dialog.tsx:39-40` and `src/components/ui/sheet.tsx:38-40` use `var(--ae-overlay-scrim)`, `duration-base`, and `ease-standard`, while `src/components/ui/alert-dialog.tsx:24-45` uses `bg-black/50`, `rounded-lg`, `shadow-lg`, and `duration-200`. The visible result changes by dialog type; align alert-dialog with the same scrim, radius, shadow, and motion tokens.

- **[verified] Motion token adoption stops at selected primitives.** `src/components/ui/accordion.tsx:35-42` and `src/components/ui/tabs.tsx:66-70` still use `transition-all` and literal `duration-200`, even though the button comment in `src/components/ui/button-variants.ts:3-6` says broad transitions are banned and `src/styles/globals.css:211-220` supplies shared values. Replace broad transitions with the properties that actually change and use the token utilities.

- **[verified] Radius and surface shapes split across adjacent product surfaces.** Canonical cards use `rounded-card` in `src/components/ui/card.tsx`, but owner list rows and editor groups use `rounded-lg` in `src/components/ae/offerings/AeOwnerOfferings.tsx:317,647,657`, funding quotes use `rounded-lg` in `src/components/ae/console/AeCreditTopUpPanel.tsx:235`, and status panels use `rounded-lg` in `src/routes/status.tsx:111,135`. This creates three visually similar containers with different implied semantics. Assign each shape to a documented role and remove local substitutes.

- **[verified] Theme metadata duplicates the canvas value outside the token file.** `src/components/ui/theme-meta.ts:1-2` exports `#f4f4f1`, while the source token is `--ae-bg` in `src/styles/globals.css:124-126`. The duplication is currently intentional but can drift. Expose the browser-chrome value from one generated or clearly paired source rather than maintaining a second literal.

- **[verified] Market rows are structurally sound, but owner summaries reintroduce box-heavy density.** `src/components/ae/market/AeMarketPage.tsx` delegates to the table/shelf system, whereas `src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx:268-305,350-352` renders bordered `SummaryCard` boxes in a two-column grid. The latter is acceptable only as a self-contained action summary under `DESIGN.md:45-46`; if the summaries grow, switch to hairline-separated rows before they become a dashboard card grid.

## Missing or weak areas

- **[verified] There is no dark theme implementation.** `src/styles/globals.css:108-110` sets `color-scheme: light` and contains no `.dark` token block. Some stock primitives still carry dormant `dark:` branches (`src/components/ui/bubble.tsx:28-35`, `src/components/ui/tabs.tsx:67-70`) and `src/components/ui/chart.tsx:7-9` retains a `dark` selector entry. No authority source says dark mode is required; record the light-only decision explicitly, and either remove dead branches or implement a complete token layer if the product later requires it.

- **[verified] Buyer-access outage is presented as missing setup.** `src/routes/operations.$operationRef.tsx:49-64` converts any `listAgentAccessKeysServer()` failure to `[]`, so `AeOperationInspector` receives `hasBuyerCredential: false` and can render the connect/setup continuation. `tests/unit/routes/operation-detail-route.test.tsx:594-616` locks that projection. Preserve fail-closed execution, but add a distinct access-status-unavailable state with retry/reload; an outage must not send an already-connected buyer through onboarding.

- **[verified] Listing-evidence outage is presented as absent evidence.** `src/modules/market/server.ts:106-128` catches the evidence read and returns `emptyMarketListingEvidence`, and `src/components/ae/market/operation-detail/AeOperationInspector.tsx:53-58` applies the same empty projection when evidence is omitted. The track record then says `No ratings yet`, `No completed calls yet`, or `Not enough data` in `src/components/ae/market/operation-detail/AeOperationTrackRecord.tsx:21-52`. Add an unavailable state distinct from a valid zero-observation state so users can tell “not observed” from “read failed.”

- **[verified] Empty-state announcements are opt-in at every callsite.** `src/components/ae/feedback/AeEmptyState.tsx:5-21` leaves `role` unset by default; the catalog unavailable/empty branches in `src/components/ae/market/AeMarketPage.tsx:307-329`, the home branches in `src/components/ae/home/AeHomeLanding.tsx:106-129`, and several owner empty states omit it. The copy is visible, but assistive technology does not receive a consistent status/alert boundary. Define when an empty result is `status` versus an outage `alert`, then enforce that distinction at the shared component boundary.

- **[verified] Payment-form failure is not announced as an error.** `src/components/ae/console/AeCreditTopUpPanel.tsx:272-277` gives loading a `role="status"` but returns a plain paragraph for checkout failure. Add an alert or field-associated error semantics while preserving the truthful “no payment was confirmed” copy.

## Fragile areas

- **[verified] `AeOwnerOfferings.tsx` is a 1,005-line mixed list/editor module.** `src/components/ae/offerings/AeOwnerOfferings.tsx` contains list projection, draft persistence, access-path editing, nested request details, validation, and save-state wiring. Its current behavior is covered by focused tests, but visual changes can cross unrelated state boundaries. Keep the canonical data contracts; isolate independently judgeable editor sections before adding more variants.

- **[verified] Operator chrome spans large, coupled files.** `src/components/ae/layout/AeOperatorShell.tsx` is 282 lines, `src/components/ae/layout/AeOperatorSidebar.tsx` is 221 lines, and the shared `src/components/ui/sidebar.tsx` is 724 lines. Shell registration, skip-link focus, credential presence, navigation, command-panel mounting, and responsive navigation interact. Treat shell changes as cross-surface changes and verify keyboard recovery at both desktop and mobile widths.

- **[verified] Command search is race-sensitive despite good defensive code.** `src/components/ae/command-panel/pages/OperationsSearchPage.tsx` is 487 lines and coordinates debouncing, stale-query cancellation, `useRef` selection intent, cmdk values, and keyboard activation in several effects (`:93-192`). Keep the pure `SearchState`/selection contract stable; avoid adding visual side effects to those effects without a focused stale-result test.

- **[verified] Compact and full Operation continuations have separate renderers.** `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx` and `src/components/ae/market/operation-detail/AeOperationContinuation.tsx` both project decision/next-action UI around the shared `operation-inspector-model`. The model reduces semantic drift, but copy, focus, and styling can still diverge by variant. Add or preserve parity cases for every continuation state when either renderer changes.

- **[from-history-verify] UI churn is concentrated in `src/components/ae/command-panel/`, `src/components/ae/market/operation-detail/`, `src/components/ae/layout/`, `src/components/ae/settings/`, and `src/components/ae/home/`.** This is the active dirty working tree described by the mapper context, not a clean baseline. Re-ground any visual conclusion against the files on disk before applying follow-up refactors; do not use retired theme records as a compatibility target.

## Dependencies at risk

- **[verified] Generated shadcn primitives can silently erase AE repairs.** `src/components/ui/button-variants.ts:3-6` explicitly warns that `shadcn add --overwrite button` restores `transition-all`. `components.json:2-13` remains configured for shadcn `new-york` with CSS variables and Lucide. Treat generated-file refreshes as migrations: reapply the AE contract deliberately and inspect all primitive overrides afterward.

- **[verified] Radix APIs are consumed through two package surfaces.** Most primitives import the umbrella `radix-ui` package (`src/components/ui/dialog.tsx:3`, `src/components/ui/tabs.tsx:5`), while `src/components/ae/market/AeCompareTray.tsx:3` imports `@radix-ui/react-presence` and `src/components/ae/operator/AeOperatorDataTable.tsx:16` imports `@radix-ui/react-roving-focus`; all are separately declared in `package.json:84-85,113`. The installed umbrella re-exports the same primitive family, but the split increases upgrade and type-contract coordination. Standardize new imports and document the approved exception paths.

- **[verified] Fontsource index CSS declares more font subsets than the product visibly needs.** `src/styles/globals.css:10-13` imports the package indexes; the installed Inter index declares Cyrillic, Greek, Vietnamese, Latin-ext, and Latin faces (`node_modules/@fontsource-variable/inter/index.css:1-68`), while DM Mono and Geist Pixel each declare ext/Latin faces (`node_modules/@fontsource/dm-mono/index.css:1-18`, `node_modules/@fontsource/geist-pixel/index.css:1-18`). Unicode ranges limit actual browser fetches, but the CSS/asset manifest is still broad. Choose explicit subset imports only after confirming the supported-language requirement.

- **[verified] The chart stack is a single-feature dependency surface.** `src/components/ae/market/operation-detail/AeOperationLatencyChart.tsx:1-15` is the only source consumer of Recharts found, while `src/components/ui/chart.tsx` is a 372-line wrapper around the namespace import. Keep the accessible chart if it earns its cost, but measure the operation-detail route bundle and consider route-level lazy loading before expanding chart usage.

## Performance

- **[verified] Operation detail statically pulls chart code into its feature graph.** `AeOperationInspector.tsx:34-37,129-131` renders `AeOperationTrackRecord`, which imports `AeOperationLatencyChart` and Recharts synchronously. The chart is bounded to at most 48 samples, so data work is small; the likely cost is code and hydration. Profile the route before adding more chart variants, and lazy-load only if measurement shows a meaningful win.

- **[verified] Inspector layout can reflow after hydration.** `src/components/ae/market/operation-detail/AeOperationInspector.tsx:60-74` initializes `isDesktop` to `false`, then reads `matchMedia('(min-width: 1024px)')` in an effect before choosing the resizable desktop branch at `:158-182`. A desktop visit can first take the mobile branch and then switch. Prefer CSS-responsive structure or a stable media-query initialization where this reflow is visible.

- **[verified] Global font imports and custom visual CSS are loaded from the root stylesheet.** `src/styles/globals.css:10-15` imports three font package indexes plus `tw-animate-css` for every surface. This centralizes consistency but makes every route pay the stylesheet/import graph cost. Keep the root contract, then measure emitted CSS and font requests before deciding whether subsets or route-level loading are warranted.

- **[verified] Broad transitions remain a layout/perf risk in stock primitives.** `src/components/ui/accordion.tsx:36` and `src/components/ui/tabs.tsx:67` use `transition-all`, which can animate properties unrelated to the intended interaction. Replace them with explicit color/opacity/transform properties; the reduced-motion rules in `src/styles/base.css:183-191` are a fallback, not a reason to animate layout properties.

## Coverage gaps

- **[verified] The UI contract scanner does not scan shared primitives.** `src/lib/ui/contract-scans.ts:193-248` excludes `src/components/ui`, while `tests/ui-contract/ui-contract.test.ts:17-34` checks only `dialog.tsx`, `sheet.tsx`, and `sidebar.tsx`. Consequently, `alert-dialog` raw scrim/shadow, `accordion`/`tabs` `transition-all`, and shared control radius drift can survive the main visual contract gate. Add a targeted primitive scan or explicit contract tests before broadening the system.

- **[verified] Accessibility tests are route-smoke tests, not automated accessibility audits.** `tests/e2e/a11y/engine-product-a11y.spec.ts`, `tests/e2e/a11y/operator-shell-a11y.spec.ts`, and `tests/e2e/a11y/developer-discovery-a11y.spec.ts` verify selected roles, focus paths, keyboard actions, and overflow. No `axe`, `toHaveNoViolations`, or screenshot assertion is present under `tests/`. Add automated rule checks and visual review for the dense market, operation inspector, forms, dialogs, and mobile operator navigation.

- **[verified] UI tests cover valid empty/unavailable projections but not all service fallbacks.** `tests/unit/market/market-page.test.tsx:575-604` distinguishes empty catalog from catalog outage, and `tests/unit/ui/ui-state.test.tsx:23-64` covers canonical state copy. There is no UI test for the operation-detail credential-read failure becoming setup, nor for listing-evidence read failure becoming empty track-record facts. Add those cases at the component/route boundary with distinct user-facing expectations.

- **[verified] Desktop/mobile operation-inspector parity is not browser-tested.** Unit coverage in `tests/unit/routes/operation-detail-route.test.tsx:247-329` compares compact and full semantics, but the desktop/mobile branch is selected by runtime `matchMedia` in `AeOperationInspector.tsx:67-74`. Add a two-viewport browser check for tabs, continuation action, focus restoration, sheet opening, and no horizontal overflow.

- **[verified] Light-only behavior has no explicit product-level assertion.** `tests/unit/styles/theme-token-parity.test.ts:1-18` documents the absence of a `.dark` split and checks token symmetry, but no test protects the intended light-only contract or detects a partial dark branch. Once the product decision is recorded, test either the absence of dark selectors or the complete dark token vocabulary.

---

*Design concern map refreshed 2026-09-01 from the current working tree.*
