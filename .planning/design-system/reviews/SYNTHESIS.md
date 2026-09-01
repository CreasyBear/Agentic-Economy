# Design System Review — Consolidated Synthesis

**Analysis Date:** 2026-09-01
**Method:** 9 parallel lens reviews (better-colors, better-typography, better-layout, better-ui, better-accessibility, better-writing, design-taste, impeccable, frontend-design-guidelines), each mapping one domain skill against `.planning/design-system/` (7 docs) verified against `DESIGN.md`, `.planning/BRAND.md`, `src/styles/globals.css`, `src/styles/base.css`, and current source. Each review is in `reviews/01-09*.md`.

## Verdict: Block

The direction is approved in principle — the warm-neutral canvas, ink actions, one blue channel, three-mode density grammar, and square market rows are distinctive and coherent. But 7 unique HIGH findings across 4 lenses remain: contrast failures on shared primitives, a named keyboard control removed from Tab order, evidence outages rendered as zero activity, misleading payment copy, and a credential-state seam that can show a false "Connection required".

Per-lens verdicts: colors Block · typography Needs changes · layout Needs changes · ui Needs changes · accessibility Block (review text says "Needs changes" but contains 2 HIGH, which the shared framework scores Block) · writing Block · taste Needs changes · impeccable Block · frontend-guidelines Block.

## Consolidated findings (deduplicated across lenses; one root cause = one row)

| # | Severity | Lens | Location | Finding |
|---|----------|------|----------|---------|
| 1 | HIGH | Colors, Accessibility | `src/styles/globals.css:139-142`; `operations.invocations.$invocationRef.tsx:278`; `AeFactList.tsx` | `--ae-brand` on canvas = **4.21:1** (<4.5 AA); the receipt's normal "Current Operation" link fails normal-text contrast. Fix: darker AA-safe blue text role (`oklch(0.53 …)` ≈ 4.68:1) or `text-brand-strong`. |
| 2 | HIGH | Colors | `tabs.tsx:67`, `sidebar.tsx:409`, `alert.tsx:13`, `AeSiteFooter.tsx:28` | Four opacity-softened text rules fail AA: `text-foreground/60` **2.28:1**, `text-sidebar-foreground/70` **2.90:1**, `text-destructive/90` **3.80:1**, `text-foreground/80` **3.99:1**. Opacity is not a text-hierarchy shortcut. |
| 3 | HIGH | Accessibility | `src/components/ui/sidebar.tsx:282-304`; `AeOperatorSidebar.tsx:214-218` | `SidebarRail` is a visible named toggle with `aria-expanded` but `tabIndex={-1}` — keyboard users cannot reach the operator rail control. Remove `-1` or drop its button semantics. |
| 4 | HIGH | Writing, Impeccable, Frontend | `src/modules/market/server.ts:106-128`; `AeOperationTrackRecord.tsx`; `OperationInspector.tsx:53-58` | Evidence read failure falls back to `emptyMarketListingEvidence` → UI shows "No ratings yet / No completed calls yet / Pending". **An outage reads as zero activity.** Carry `unavailable` as a distinct typed state with retry. |
| 5 | HIGH | Writing | `operation-inspector-model.ts:62-63`; `AeOperationFacts.tsx:48-57`; `AeOperationContractSections.tsx:245-253` | `Last verified` merges `availability.observedAt` with `priceEvidence.observedAt` — a price timestamp can be presented as verified readiness. Split into "Readiness observed" / "Price observed", or "Not measured". |
| 6 | HIGH | Writing | `AeCreditTopUpPanel.tsx:209-213` | "Payment verified" body states credit was NOT granted. Payment/copy mismatch can cause duplicate charges. Use "Payment confirmed; credit balance pending" + "Do not pay again" + explicit recovery. |
| 7 | HIGH | Impeccable | `AePublicShell.tsx:119-121`; `CommandPanelProvider.tsx:24,36-49`; `operations.$operationRef.tsx:49-64` | Command-panel credential presence defaults to `false` in the public shell; the route catches key-read and substitutes `[]`. Same buyer can see false "Connection required" on one path and "Ready to call" on another. One auth-aware projection must feed all entries. |
| 8 | MEDIUM | Typography, Taste, Impeccable | `AeMarketPage.tsx:274-280`; `AePageHeader.tsx:68-85` | Market inherits the Public `font-display` (Geist Pixel) header via the default `AePageHeader` variant — the clearest mode schism. Give Market an explicit `font-sans` terminal header. |
| 9 | MEDIUM | Layout, Taste, Impeccable | `AeOperatorSidebar.tsx:109`; `sidebar.tsx:308-315` | Operator renders a flat split, not the BRAND-locked inset work well: `variant="sidebar"` instead of `"inset"`. Also: operator nav labels use mono uppercase tracking (`.tsx:128-142,177-180`; `AeOwnerMobileNavigation.tsx:31-38`) against DESIGN.md's no-uppercase-tracking rule. |
| 10 | MEDIUM | Colors, UI | `alert-dialog.tsx:27,45`; `button-variants.ts:14` | Shared primitives bypass the token bridge: raw `bg-black/50`, `shadow-lg`, `duration-200`, `rounded-lg`, `text-white` instead of `--ae-overlay-scrim`, `shadow-overlay`, `duration-base`, `rounded-card`, `text-destructive-foreground`. Clerk appearance (`clerk-appearance.ts:9-23`) + `theme-meta.ts` carry parallel literals. |
| 11 | MEDIUM | UI, Frontend | `accordion.tsx:36,42`; `tabs.tsx:67`; `message-scroller.tsx:100`; `AePublicShell.tsx:114`; `AeSiteNav.tsx:62` | Motion contract drift: `transition-all`, literal `duration-200/300/400`, custom cubic-bezier, and no explicit `motion-reduce` in shell/primitives; shadow ladder bypassed (`select.tsx` `shadow-md`, `chart.tsx` `shadow-xl`). Tokenize or document exceptions. |
| 12 | MEDIUM | Accessibility, Frontend | `dialog.tsx:72`; `sheet.tsx:79` | Modal close buttons: `focus:ring-2` + small icon, no `min-h-touch`/`min-w-touch` — no shared `--ae-focus-ring` recipe, hit area not guaranteed ≥24/44px. |
| 13 | MEDIUM | Accessibility, Frontend | `AeEmptyState.tsx:5-21`; callers market/home/offerings; `alert.tsx:22-33` | Empty/unavailable semantics are caller-optional (`role?`); market/home omit it. Default `Alert` is `role="alert"` for routine info. Make state driven (`empty | unavailable`), alert for outages, status for settled results. |
| 14 | MEDIUM | Accessibility, Frontend | `AeSupplyEndpointConfigStep.tsx:590-639`; `field.tsx:225-233`; `AeWorkspaceGeneral.tsx:120-137` | Field errors visible but not programmatically connected: `aria-describedby` → description only, select trigger has none; error IDs absent. Compose description + error IDs in the shared Field. |
| 15 | MEDIUM | Accessibility, Frontend | `skeleton.tsx:3-10`; `OperationHistory.tsx:70-77`; `AeOwnerCredit.tsx:154-163`; `AeOperatorDataTable.tsx:223-285` | Loading regions: skeletons not `aria-hidden`, no stable `role="status"` message in repeated list/table regions. One loading-region contract (status + aria-busy + hidden geometry). |
| 16 | MEDIUM | Layout, Impeccable, Frontend | `AeOperationInspector.tsx:59-74,150-182`; `AeOperatorShell.tsx:257-278`; `AeMarketPage.tsx:281-285` | Responsive seams: inspector paints mobile then swaps to desktop after hydration (post-HMR reflow + reading-order shift); operator content always reserves 4rem bottom bar even without mobile nav; compare tray reserves `pb-96` vs a ~fixed tray. |
| 17 | MEDIUM | Typography | `globals.css:73-75`; `AeSiteType.tsx`; ops surfaces | No shared product type-size/leading scale beyond the public `AeSiteHeading` — surfaces mix `text-[0.6875rem]`/`text-[11px]` and heading sizes; DM Mono 600 / Geist Pixel 600 requested but only 400/500 delivered; `[data-numeric]` hook unused while `tabular-nums` is repeated ad hoc. |
| 18 | MEDIUM | Writing | multiple (see 06-writing.md) | Terminology churn: `Catalog`/`catalogue`, `Operation`/`tool`, `Use`/`Open`/`Inspect` (visible "Open" + accessible "Use <title>" for an inspect destination); "Maximum authorization" vs "Authorization" across compact/full inspectors; internal language leaks ("canonical payment readback", "descriptor", "references were refused"); `Next 12`/`loaded page` pagination copy. |
| 19 | MEDIUM | Colors | `globals.css:140,150,155,157` | Four authored OKLCH values exceed sRGB gamut (brand-strong, info-foreground, warning-foreground, danger-subtle). Clamp chroma. `--ae-muted-fg` passes WCAG AA (5.42:1) but misses APCA body minimum (Lc 68.7 vs 75) where used for `<p>` copy. |
| 20 | MEDIUM | Impeccable | `AeHomeLanding.tsx:51-77`; `AeMarketPage.tsx:243-301` | Copy says "Search first" but `/` has no search control (Browse only); Market's first decision piles search + 8 category tabs + shelves + compare + 8-column table. Reduce first-decision load; surface literal search on `/` carrying query into Market. |
| 21 | MEDIUM | Impeccable | `chart.tsx` (~10KB), `sidebar.tsx` (~21KB); `AeOperationTrackRecord.tsx:56-58` | Recharts statically imported through an always-rendered track record even with no samples; heavy shared primitives. Defer the chart, measure route bundles. |
| 22 | MEDIUM | Colors, Taste | `AeOwnerOfferings.tsx:642-748`; `AeOwnerOperationsWorkspace.tsx:268-280`; `AeOperationCard.tsx:74-119` | Box-density drift: owner editors stack repeated `rounded-lg border` boxes (nested-boxes violation); market row's 6 facts ÷ 5 columns orphans "Last verified" at md. |
| 23 | LOW | Typography, UI | `AeOperationDecision.tsx:21-24`; `AeSiteType.tsx` | `text-pretty` overrides the global heading `text-balance` on the decision h2; a few utility classes bypass `cn`; `EmptyDescription` typed `<p>` but renders `<div>`. |
| 24 | LOW | Writing | `AeCommandPanel.tsx:87-89`; `AeAgentOperatorConsole.tsx:369-376,527-537` | "Command console" accessible title (terminal cosplay); "Waiting approvals unavailable", "One or more calls needs checking" grammar. |

## Highest-leverage fixes (system beats leaf)

1. **State-truth seam** (F4/F5/F6/F7): one typed evidence-availability projection + one auth-aware credential projection + one payment-state contract. Three fixes retire four HIGHs and most of the writing lens.
2. **Overlay + focus + motion contract** (F10/F11/F12): converge AlertDialog/Dialog/Sheet on the shared scrim/radius/elevation/duration/focus/touch contract; one `focus-visible` recipe consuming `--ae-focus-ring`; tokenized motion in primitives/shell.
3. **Mode variants** (F8/F9): explicit Market header (sans) and Operator inset-well + ordinary-case labels. The taste lens calls this the "one deliberate product" threshold.
4. **Contrast** (F1/F2): AA-safe blue text role + remove opacity-as-hierarchy in 4 primitives.
5. **Empty/loading sync** (F13/F14/F15): state-driven `AeEmptyState`, composed field error IDs, loading-region contract.
6. **Responsive stability** (F16): SSR-safe media-query seam for the inspector; conditional bottom-bar reservation; measured tray clearance.
7. **Copy standardization** (F18): locked Catalog/Operation/Inspect vocabulary; human labels for settings enums; state-specific recovery actions.

## Considered but rejected (across lenses)

- Dark mode / second palette / gradients / extra accent — locked light-only warm system; the issue is consumer drift, not missing themes.
- Card grids, tickers, dashboards for Market — the square row/table grammar is the product's distinctive spine.
- Replacing Radix/shadcn primitives — the seams exist; repair contract gaps, don't duplicate behavior.
- Replacing the 3-font pairing or adding a motion/framer dependency — roles are deliberate; `AeCopyCommand` already proves the CSS seam.
- Global `font-synthesis: none` — verify delivered faces before disabling synthesis.

## Verification

- All 9 lenses read the shared framework (`local://design-review-context.md`), their skill files, the 7 map docs, the two authorities, and current source; each cites file:line.
- Contrast numbers are converted from the authored OKLCH tokens (WCAG relative luminance); APCA Lc values cited where the lens computed them.
- **Not verified** (consistent across lenses; requires a browser/runtime pass): rendered gamut mapping, 320px/200% zoom, screen-reader output + focus return, actual hit-box geometry, live auth/evidence behavior, Stripe/Clerk provider-rendered UI, emitted bundle sizes. These are verification gaps, not findings.

## Owner decisions required (top questions, deduped)

1. `SidebarRail`: second full toggle, resize affordance, or pointer-only convenience? Dictates keyboardability.
2. Is the Operator inset well + strict token convergence (F8/F9/F10) a non-negotiable acceptance criterion, or recorded exceptions?
3. Is `/` Browse-only intentional, or must the locked "catalogue entry with literal search" put a search field first?
4. `Use` vs `Inspect` on catalogue/chat entry links — which is the product verb for "go open the place where use begins"?
5. Is WCAG 2 AA the only release gate, or does APCA body Lc 75 also govern supporting copy?
6. Should the unknown/unconsumed chat `tinted` bubble variant and dormant `.dark` selectors be deleted (light-only product)?
7. Is `--ae-brand` allowed to darken to an AA-safe text role, or is bright-blue-for-graphics + `text-brand-strong` the rule?

---
*Synthesis of 9 lens reviews; each review retains its full evidence, verification, and open questions.*