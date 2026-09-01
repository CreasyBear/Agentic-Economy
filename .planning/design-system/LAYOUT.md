# Layout System

**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

The layout system is one market terminal with three densities, not three unrelated visual themes. The authority is `DESIGN.md`, then `.planning/BRAND.md`, then the implementation in `src/`. The implementation uses shared rails, spacing tokens, route-state shells, and a small number of explicit surface variants.

## Layout modes

| Mode | Intended reading posture | Authority pattern | Current entry points |
| --- | --- | --- | --- |
| Public | Generous, editorial, and legible. The page introduces the catalogue or a door into it. | Display type may lead a hero; actions can use the notched public treatment; construction marks stay sparse. | `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/for-agents.tsx`, `src/routes/for-providers.tsx`, and the public document routes through `src/components/ae/layout/AePublicPage.tsx`. |
| Market | Dense and comparative. The user scans exact Operations, suppliers, prices, and readiness. | Plain rows, aligned numbers, structural hairlines, and progressive detail. Do not turn a clear list into a card grid. | `src/routes/market.tsx`, `src/components/ae/market/AeMarketPage.tsx`, `src/components/ae/market/AeOperationCard.tsx`, and `src/components/ae/market/AeOperationTable.tsx`. |
| Operator | Quiet, persistent work surfaces for authenticated owner, admin, or developer tasks. | Sans interface type, compact controls, persistent navigation, and a stable content area. Display type does not lead forms, tables, commands, or operational status. | `src/routes/_operator.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/layout/AeOperatorSidebar.tsx`, and the child routes under `src/routes/_operator/`. |

Chat is a fourth compositional surface rather than a fourth brand mode. `src/components/ae/layout/AeChatPage.tsx` supplies a full-height conversation frame, while the public/authenticated distinction is expressed by whether `OperationChat` includes history and which route owns authentication. It does not use `AePublicShell`.

## Public shell and page framing

`src/components/ae/layout/AePublicShell.tsx` owns public chrome. Its page mode is a `min-h-dvh` flex column with a sticky header on ordinary pages and a footer below the route content. Its workspace mode is `h-dvh min-h-0 overflow-hidden`, allowing an inspector or other work surface to consume the viewport without a public footer.

`src/components/ae/layout/AePublicPage.tsx` is the route-level framing decision:

- `kind="editorial"` is the default for the home page, public doors, catalogue/listing surfaces, auth, receipts, and other pages that own their own introduction.
- `kind="tool"` and `kind="document"` add the shared `AePageHeader` framing for operation detail, legal pages, status, support, and other document-like routes.
- `kind="workspace"` selects `AePublicShell mode="workspace"` and requires the workspace `AePageHeader` before the child work surface.
- Route loading and failure states are still framed by the appropriate public shell. `src/components/ae/layout/AePublicRouteStates.tsx` and `src/components/ae/layout/AePageState.tsx` keep the route identity visible instead of replacing it with an unframed error.

`AePublicShell` places the public navigation in a centered `ae-nav` wrapper with `rounded-nav`, a border, and opaque `bg-container`. The header observes a two-pixel top sentinel and adds elevation only after the page has scrolled. The skip link targets `#ae-app-shell-main`; `AeSkipFocusBridge` also accepts `#main-content` so the main content remains keyboard-addressable after route changes.

`src/components/ae/layout/AePageHeader.tsx` has two deliberately different compositions. Public/tool/document headers use an `ae-rail`, section/page vertical padding, a display-font title, and an optional trailing action/meta column. Workspace headers use `ae-nav`, compact vertical padding, sans typography, truncated descriptions, and an inline status meta region. This keeps display type out of operational work surfaces while retaining a recognizable public entry point.

`src/components/ae/layout/AeSection.tsx` provides section rhythm and anchor behavior. Sections use `scroll-mt-anchor`, a related-content gap, semantic headings, and a description constrained to a readable measure. Settings sections use a narrower `max-w-3xl` stack. `src/components/ae/layout/AeRecordHeader.tsx` is the compact operator record bar for a title, description, and trailing actions; it is not a replacement for the public page header.

## Operator shell

`src/routes/_operator.tsx` is a pathless route group that derives role and navigation context from the current path, then wraps child content in `AeOperatorShell`. `src/lib/operator/route-options.ts` intentionally keeps pending and error content inside the existing shell, so a slow or failed child route does not remove navigation and orientation.

`src/components/ae/layout/AeOperatorShell.tsx` composes:

1. `SidebarProvider` and `AeOperatorSidebar` for persistent role-aware navigation.
2. `SidebarInset` as the main content container.
3. A sticky operator header with a sidebar toggle, separators, role marker, breadcrumbs, and the command-panel trigger.
4. A content region with a record header, optional secondary bar, and the child route body.
5. `AeOwnerMobileNavigation` for owner routes unless a route suppresses it.

The operator main area is `min-h-0` and flexes through the shell so tables, records, and panels can own their own overflow. A route change requests focus on the resolved main-content element. The shell's content padding uses the shared gutter and related spacing tokens, with safe-area padding at the bottom.

`src/components/ae/layout/AeOperatorSidebar.tsx` is role-aware for `owner`, `admin`, and `developer`. Active navigation is a two-pixel information-colored start border with a muted sidebar background, rather than a filled card. `src/components/ae/layout/AeOwnerMobileNavigation.tsx` is a fixed bottom bar on small screens with three owner priorities: Calls, Agents, and Operations. Its links have touch-sized targets and a small current-page indicator.

### Current authority divergence

`.planning/BRAND.md` calls for an authenticated workspace to be an inset well over the canvas. The current `AeOperatorSidebar` passes `variant="sidebar"` to `src/components/ui/sidebar.tsx`, not `variant="inset"`. The corresponding `SidebarInset` therefore does not receive the inset variant's desktop margin, rounded surface, or shadow. The current result is a flat split workspace. This is a measured implementation divergence, not a reason to resurrect the retired theme or add a second shell.

## Navigation, rails, and overlays

### Rail hierarchy

The CSS authority is in `src/styles/globals.css`:

| Layout token/utility | Current value or behavior | Use |
| --- | --- | --- |
| `--ae-nav` / `.ae-nav` | `1160px`, centered, width `100%` | Public navigation and workspace headers that align with the broader shell. |
| `--ae-rail` / `.ae-rail` | `1080px`, centered, width `100%`, `16px` gutter, `26px` gutter at `md` | Public page content, market content, and detail surfaces. |
| `--ae-gutter` / `--ae-gutter-lg` | `16px` / `26px` | Small-screen and medium-plus horizontal breathing room. |
| `--ae-nav-stack` | `56px` | Header stack used by anchor and fold calculations. |
| `--ae-anchor` | `calc(nav-stack + 16px)` | `scroll-padding-top` and `scroll-mt-anchor` for in-page navigation. |
| `--ae-fold` | `calc(100svh - nav-stack)` | Viewport-aware chapter/fold sizing. |
| `--ae-fold-peek` | `48px` | Leaves a deliberate next-section glimpse in hero/fold layouts. |
| `.min-h-fold`, `.min-h-fold-hero`, `.min-h-chapter` | Small screens remain auto-height; `md` enables viewport-derived minimums | Use for intentional page chapters, never as a generic spacer. |

`src/styles/base.css` sets `scroll-padding-top: var(--ae-anchor, 72px)` and a stable scrollbar gutter. `src/components/ae/layout/AeSection.tsx` uses the matching anchor margin. This keeps an anchored section from hiding beneath the public or operator header.

### Public navigation

Desktop public navigation is a centered floating shell inside `AePublicShell`, with primary links, the command panel provider, sign-in, and publish actions. At small widths the primary links move into a left `Sheet`; its drawer repeats the navigation and the sign-in/publish actions rather than squeezing them into the header. The public brand link has touch-sized dimensions.

The public header is sticky only in page mode. Workspace mode keeps its header in the fixed-height flex stack. The header's intersection sentinel controls a restrained shadow transition; routine pages are not permanently elevated.

### Operator navigation

The operator sidebar is persistent on desktop and becomes a Sheet on mobile through the shared `src/components/ui/sidebar.tsx` primitive. The operator header remains visible above the content. Owners additionally get the fixed mobile navigation from `AeOwnerMobileNavigation`; role-specific admin/developer navigation stays in the mobile sidebar.

### Overlays and stacked work surfaces

- `src/components/ae/command-panel/AeCommandPanel.tsx` is a stacked modal Dialog. It opens from the public/operator trigger or `Cmd/Ctrl-K`, and its inspect page stays inside the same deck.
- `src/components/ae/market/AeCompareTray.tsx` is a fixed bottom tray. Its outer wrapper ignores pointer events while the tray card remains interactive, preventing it from blocking unrelated catalogue rows. It reserves extra bottom padding in `AeMarketPage` when selection exists.
- `src/components/ae/layout/AeRecordSheet.tsx` is a right-side record Sheet with a full-width mobile treatment, a scrollable body, and an optional footer action. It is used for operator record details such as a charge or agent.
- `src/components/ae/layout/AeRouteProgressBar.tsx` is a fixed, delayed top progress indicator. The 75ms delay avoids flashing for fast transitions.

## Route-to-surface map

| Route | Layout owner | Surface composition |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` → `AePublicPage` | `AeHomeLanding`, an editorial public entry with generous composition. |
| `/market` | `src/routes/market.tsx` → `AePublicPage` | `AeMarketPage` with toolbar, structural operation rows/table, and optional comparison tray. |
| `/$slug` | `src/routes/$slug.tsx` → `AePublicPage` | `AeProviderListingPage` for a supplier profile organized over its Operations. |
| `/operations/$operationRef` | `src/routes/operations.$operationRef.tsx` → `AePublicPage kind="workspace"` | Full `AeOperationInspector`; desktop research/continuation split and mobile stacked continuation. |
| `/for-agents` | `src/routes/for-agents.tsx` → `AePublicPage` | `AeAgentDoorPage`, a public product door. |
| `/for-providers` | `src/routes/for-providers.tsx` → `AePublicPage` | `AeSupplyLanding`, a public supplier door. |
| `/operations` | `src/routes/operations.tsx` | Catalogue redirect/entry behavior into the market surface rather than a second operation list. |
| `/_operator/*` | `src/routes/_operator.tsx` → `AeOperatorShell` | Role-aware persistent sidebar, operator header, and child content. |
| `/owner/offerings`, `/owner/offerings/new`, `/owner/offerings/$offeringRef` | `src/routes/_operator/owner.offerings.tsx`, `owner.offerings.new.tsx`, `owner.offerings.$offeringRef.tsx` | Owner operation management tables/editor and record framing. |
| `/owner/supply`, `/owner/supply/$offeringRef` | `src/routes/_operator/owner.supply.tsx`, `owner.supply.$offeringRef.tsx` | Supplier setup and endpoint configuration work surface. |
| `/owner/credit` | `src/routes/_operator/owner.credit.tsx` | Balance, top-up flow, charge table, and `AeRecordSheet` detail. |
| `/activity`, `/agent-access`, `/agent-access/authorize` | `src/routes/_operator/activity.tsx`, `agent-access.tsx`, `agent-access.authorize.tsx` | Owner call activity, agent access/approval work, and authorization flow. |
| `/owner/settings/*` | `src/routes/_operator/owner.settings.tsx` and nested settings files | Owner settings sections with guarded forms. |
| `/admin/index-health`, `/admin/audit-events` | `src/routes/_operator/admin.index-health.tsx`, `admin.audit-events.tsx` | Admin health/audit data surfaces. |
| `/developers/discovery` | `src/routes/_operator/developers.discovery.tsx` | Developer discovery/operator surface. |
| `/t/new`, `/t/$threadId` | `src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx` | `OperationChat` inside `AeChatPage`, with history for authenticated threads. |
| `/s/$shareToken` | `src/routes/s.$shareToken.tsx` | `SharedOperationChat`, a public shared conversation frame without owner controls. |
| `/operations/invocations/$invocationRef` | `src/routes/operations.invocations.$invocationRef.tsx` | Public receipt/status sections framed by `AePublicPage`; terminal evidence is presented as a page, not an operator shell. |

## Canonical Operation composition

The exact Operation surface follows the five-step order in `DESIGN.md` and `.planning/BRAND.md`. The implementation keeps that order in both the full inspector and its compact command-panel variant.

| Step | User question | Current layout owner |
| --- | --- | --- |
| 1. Identity and supplier | What exact Operation is this, and who supplies it? | `AeOperationIdentity` plus the route/workspace `AePageHeader`; `AeOperationFacts` repeats provider and access facts in the full view. |
| 2. Total price and readiness | What is the maximum authorization and can it be used now? | `AeOperationDecision`, `AeOperationEconomics`, readiness badges, and `AeOperationContinuation`. Prices use the maximum-authorization framing rather than an unqualified estimate. |
| 3. Decision evidence and provenance | What is observed, published, stale, or unknown? | `AeOperationTrackRecord`, `AeOperationFacts`, `AeOperationContractSections`, and `src/modules/market/listing-evidence.ts`. The listing projections keep unrated, no-activity, and insufficient-sample states explicit. |
| 4. Exact contract and effects | What inputs, terms, data use, and effects are bound? | `AeOperationContractSections` in the contract tab and the technical Schemas Sheet. Parameters, example input, price/terms, readiness/reliability, data use, and effects are distinct sections. |
| 5. One next valid action | What can I do now without guessing? | `AeOperationContinuation` and `AeOperationCompactDecision`; the continuation is a bounded next action or a copyable inspect/invoke command, not a second competing CTA. |

The full inspector in `src/components/ae/market/operation-detail/AeOperationInspector.tsx` uses a desktop horizontal `ResizablePanelGroup`: a larger research panel and a narrower continuation panel with bounded minimum/maximum widths. On smaller screens it becomes a scrollable column with the continuation ticket first, so the valid next action is not buried below technical detail. Its compact variant keeps the decision and continuation in the first viewport, then puts position/actions and contract/evidence detail behind progressive disclosure.

Unavailable, malformed, or source-unavailable operation routes use `AePageState` directly and do not render facts or call steps. This is an important layout invariant: a missing authoritative record cannot leave an empty shell that looks actionable.

## Responsive behavior

Breakpoints are chosen by interaction density rather than by a parallel visual system:

- `md` is the first major layout breakpoint. Public navigation switches between desktop links and mobile Sheet; page headers gain larger padding/columns; operator sidebar and desktop spacing become available; owner bottom navigation hides.
- `lg` is used when a meaningful side rail needs enough width. `AeChatPage` hides its history rail below `lg`; the authenticated conversation remains usable as a single-column chat.
- `AeOperationInspector` uses a runtime `min-width: 1024px` check for the desktop research/continuation panel arrangement. Below that width it uses a mobile-first stacked flow.
- `AeOperationTable` and `AeRecordTable` use compact content affordances on smaller widths where the table cannot preserve all columns. `AeRecordTable` can render a row's `compactContent` while hiding that detail at `md`; the market surface itself still prefers readable rows over a card-grid rewrite.
- Controls and row actions use the shared `--ae-touch` target (`44px`) where they are interactive. This includes public nav links, filters, chat send, command-panel controls, mobile navigation, and operator row actions.
- Bottom-fixed surfaces use safe-area padding. `AeChatPage`/`OperationComposer`, `AeOwnerMobileNavigation`, and compare-tray compositions account for the device bottom inset.
- `min-h-fold-hero` and `min-h-chapter` are auto-height on small screens and viewport-derived only at `md`. They are for intentional chapters; they must not be used to manufacture empty space around a short result.

The skeletons in `src/components/ae/layout/AePageState.tsx` mirror the eventual geometry: detail skeletons use the research/side-column shape at `lg`, while market skeletons use a toolbar and rows. This avoids a page-load jump without turning loading into an alternate layout.

## Content rail and density discipline

The content rail is `1080px` (`--ae-rail`), while navigation may use the wider `1160px` (`--ae-nav`). The normal public/market sequence is rail → section rhythm → structural rows or one elevated task surface. `AeMarketPage` uses an `ae-rail` body with section gap and page-bottom padding; when the compare tray is active it adds extra bottom clearance so the fixed tray does not cover the last result.

The system favors whitespace first, hairlines second, and elevation only for a real raised task. `AeCapabilityTile` and `AeOperationCard` are structural list items, not nested cards. `AeMarketComparisonView` uses one `Card` because comparison is a self-contained task. `AeRecordSheet`, modal dialogs, and execution/continuation panels are similarly bounded raised surfaces. This is consistent with the authority rule against nested bordered cards and generic dense card grids.

`src/styles/globals.css` is the source of truth for spacing, rails, surfaces, radii, shadows, and motion aliases. Layout components consume semantic utilities such as `gap-related`, `gap-section`, `py-page`, `min-h-fold`, `ae-nav`, and `ae-rail`; they do not define feature-local spacing systems. `src/styles/base.css` supplies the global viewport, focus, scrollbar, and reduced-motion behavior.

### Current implementation notes

- Public floating navigation uses the opaque `bg-container` shell required by the brand authority.
- Workspace page headers use sans type and compact spacing, matching the operator rule even when the workspace is entered through a public route.
- The operator shell's flat `variant="sidebar"` split is the one known layout-level divergence from the locked inset-well direction.
- Chat is intentionally full-height and docked, not a centred public hero. Its transcript content uses a `max-w-3xl` reading measure while the shell remains edge-to-edge enough for a composer and history rail.

**Source verification:** Current working-tree source and the governing `DESIGN.md` / `.planning/BRAND.md` were inspected on 2026-09-01.

<!-- refreshed: 2026-09-01 -->
