# Component Inventory

**Analysis Date:** 2026-09-01

This is a source-verified map of the current dirty tree. It describes the
components on disk, including the in-flight `command-panel/`,
`market/operation-detail/`, `layout/`, `settings/`, `home/`, and related UI
changes. `DESIGN.md` remains the visual authority: the component library should
make the Public, Market, and Operator modes possible without introducing a
second palette, type system, shape language, or state vocabulary.

## Base primitives: `src/components/ui/`

The folder is a shadcn **new-york** set (`components.json`) of Radix/
third-party wrappers plus AE-authored extensions. “Stock-derived” below means a
shadcn primitive whose API is retained while its classes are bridged to AE
semantic tokens; “AE extension” means a local primitive or an intentionally
modified shadcn seam. Every primitive adds `data-slot` markers and accepts a
`className` override where composition is useful.

### Stock-derived shadcn/Radix primitives

- `src/components/ui/accordion.tsx` — Radix accordion disclosure with item, trigger, and content wrappers; open/closed state rotates the chevron and animates height.
- `src/components/ui/alert.tsx` — semantic `role="alert"` message surface with default and destructive variants, title, and description slots.
- `src/components/ui/alert-dialog.tsx` — Radix alert-dialog confirmation surface with portal/overlay, title/description, and Button-backed action/cancel slots.
- `src/components/ui/breadcrumb.tsx` — hierarchical navigation list with current-page, separator, ellipsis, and link slots.
- `src/components/ui/button.tsx` — polymorphic Button wrapper; uses `Slot.Root` for `asChild` and delegates visual variants/sizes to `buttonVariants`.
- `src/components/ui/card.tsx` — raised content container with header, title, description, action, content, and footer anatomy.
- `src/components/ui/chart.tsx` — Recharts container/config/context plus token-aware tooltip and legend renderers; supplies responsive chart sizing and generated CSS variables.
- `src/components/ui/checkbox.tsx` — Radix checkbox with checked/indeterminate indicators and semantic invalid, disabled, and focus states.
- `src/components/ui/collapsible.tsx` — Radix open/closed disclosure root, trigger, and content wrapper.
- `src/components/ui/command.tsx` — `cmdk` command menu and dialog wrappers with search input, grouped items, empty state, separators, and keyboard shortcut slot.
- `src/components/ui/dialog.tsx` — Radix modal dialog root, trigger, portal, overlay, content, close, title, description, header, and footer.
- `src/components/ui/input.tsx` — single-line input with tokenized border, selection, placeholder, invalid, focus, and disabled styling.
- `src/components/ui/label.tsx` — Radix label wrapper that tracks disabled peers/groups and uses the shared interface typography.
- `src/components/ui/pagination.tsx` — accessible pagination content, item, previous/next, link, and ellipsis controls built on Button variants.
- `src/components/ui/radio-group.tsx` — Radix radio group and item with a circular indicator and focus/invalid/disabled states.
- `src/components/ui/resizable.tsx` — `react-resizable-panels` group, panel, and handle wrappers; the handle can expose a grip icon.
- `src/components/ui/select.tsx` — Radix select root/value/trigger/content/group/item/label/separator and scroll controls.
- `src/components/ui/separator.tsx` — Radix separator with horizontal/vertical orientation and tokenized hairline styling.
- `src/components/ui/sheet.tsx` — dialog-backed side sheet with configurable side, overlay, content, header/footer, title, description, and close button.
- `src/components/ui/skeleton.tsx` — content-shaped loading block using `animate-pulse`; callers provide the shape and an enclosing `aria-busy`/status.
- `src/components/ui/tabs.tsx` — Radix tabs root/list/trigger/content with default filled and line list variants and `data-state=active` styling.
- `src/components/ui/textarea.tsx` — multiline input with content sizing, tokenized focus/invalid/disabled states, and shared typography.
- `src/components/ui/toggle-group.tsx` — Radix toggle group and item; shares `toggleVariants`, context-propagates size/variant/spacing, and handles joined outlines.
- `src/components/ui/tooltip.tsx` — Radix tooltip provider, trigger, and content wrapper for supplemental hover/focus help.

### AE-extended shadcn seams and local primitives

- `src/components/ui/badge.tsx` — compact pill status/label primitive; extends stock variants with semantic `success`, `warning`, and `info` mappings alongside `default`, `secondary`, `destructive`, `outline`, `ghost`, and `link`.
- `src/components/ui/button-variants.ts` — canonical Button `cva` matrix; narrows upstream `transition-all` to color/background/border/shadow/opacity/scale, adds mobile touch sizing and active scale, and centralizes default/outline/secondary/ghost/link/destructive plus size variants.
- `src/components/ui/toggle-variants.ts` — shared `cva` matrix for toggle-group items (`default`/`outline`, default/sm/lg sizes), consumed by `toggle-group.tsx`.
- `src/components/ui/data-state.ts` — cache-aware list-state vocabulary: `unloaded`, `cached-empty`, and `cached-rows`; `useFirstLoadPending` prevents refreshes from collapsing visible data back to skeletons, and `useStickyRows` holds the last page through query-key churn.
- `src/components/ui/empty.tsx` — composable empty-state anatomy (`Empty`, header, media, title, description, content) for resolved no-result states; media has default and icon variants.
- `src/components/ui/field.tsx` — accessible form field system with fieldset/legend/group, vertical/horizontal/responsive orientation, label/content/title/description, separator, and deduplicated `role="alert"` field errors.
- `src/components/ui/inline-edit-field.tsx` — display-to-editor cell: hover/focus pencil affordance, controlled or self-managed editing, trim/no-op commit, async save, Escape/cancel, busy disabling, and labelled inline error.
- `src/components/ui/input-group.tsx` — grouped input/textarea composition with inline/block addons, focus/error propagation from the control, addon text, and Button-backed compact actions.
- `src/components/ui/item.tsx` — flexible list-row anatomy (`ItemGroup`, separator, item, media, content, title, description, actions, header, footer) with default/outline/muted and default/sm sizes; supports `asChild` links.
- `src/components/ui/marker.tsx` — small inline marker row with icon/content slots and default, separator-rule, and bottom-border variants; supports `asChild`.
- `src/components/ui/bubble.tsx` — chat bubble group/content/reactions anatomy with start/end alignment and default, secondary, muted, tinted, outline, ghost, and destructive message variants.
- `src/components/ui/message.tsx` — chat message group, aligned message row, avatar, content, header, and footer slots.
- `src/components/ui/message-scroller.tsx` — wrapper around `@shadcn/react/message-scroller`; adds viewport/content/item classes, overscroll containment, scroll fading, and accessible start/end scroll buttons.
- `src/components/ui/site-marker.tsx` — AE construction dash used for eyebrows and link hover affordances; supports foreground/info tone, always-visible or grow-in behavior, and an optional `data-ae-marker` hook.
- `src/components/ui/spinner.tsx` — Lucide `Loader2Icon` status indicator with `role="status"`, `aria-label="Loading"`, and `animate-spin`.
- `src/components/ui/theme-meta.ts` — single `SITE_THEME_COLOR_HEX` constant (`#f4f4f1`) keeping browser chrome aligned with the CSS canvas token.
- `src/components/ui/sidebar.tsx` — extended shadcn sidebar system: provider/context, cookie-persisted open state, mobile sheet/off-canvas behavior, keyboard shortcut, inset, groups, menus, active buttons, submenus, badges, and skeletons. `src/components/ae/layout/AeOperatorSidebar.tsx` supplies AE navigation policy and active styling.
- `src/components/ui/table.tsx` — extended semantic table wrapper with horizontal overflow, header/body/footer/row/head/cell/caption slots; base rows expose hover, expanded, and selected states and headers use mono/tabular data styling.

The shared brief calls this directory “41 files”; the current on-disk
inventory also contains both `src/components/ui/button-variants.ts` and
`src/components/ui/toggle-variants.ts` as separate files. The list above is
intentionally file-complete for the tree observed on 2026-09-01 rather than
silently dropping a variant seam.

## Application components: `src/components/ae/`

The `ae` folder contains domain-facing composition. Generic primitives stay in
`src/components/ui/`; AE components own product language, operation/catalog
projections, access, supply, and operator workflows. Files below are the key
current entry points and supporting presentation modules by directory.

### Market and exact Operation inspection

- `src/components/ae/market/` — anonymous catalogue browsing, capability shelves, compact operation rows/cards, filters, pagination, compare selection, and comparison views. Key files: `AeMarketPage.tsx`, `AeMarketToolbar.tsx`, `AeCapabilityTile.tsx`, `AeOperationCard.tsx`, `AeOperationTable.tsx`, `AeOperationPrice.tsx`, `AeCompareTray.tsx`, `AeMarketComparisonView.tsx`, and `market-return-context.ts`.
- `src/components/ae/market/operation-detail/` — canonical inspect-and-call anatomy. `AeOperationInspector.tsx` switches compact/full presentations; `AeOperationIdentity.tsx` names supplier/Operation; `AeOperationDecision.tsx` leads with summary, total authorization, and economics; `AeOperationTrackRecord.tsx` and `AeOperationLatencyChart.tsx` show explicitly AE-observed performance; `AeOperationFacts.tsx` shows provider/access facts; `AeOperationContractSections.tsx` exposes parameters, examples, price/terms, readiness, evidence, data use, effects, transport, and exact JSON Schemas; `AeOperationContinuation.tsx` provides the one next valid action; `AeOperationPosition.tsx` links back to the full Operation and compact action commands; `AeOperationCompactDecision.tsx` handles command-panel decision copy; `operation-inspector-model.ts` is the shared decision projection used by compact and full views; `index.ts` exports the inspector/model seam.

### Operator shells and route states

- `src/components/ae/layout/` — Public and Operator shells, page headers, breadcrumbs, responsive navigation, route loading/error/not-found states, record sheets, chat shell, and route progress. Key files: `AePublicShell.tsx`, `AePublicPage.tsx`, `AeOperatorShell.tsx`, `AeOperatorSidebar.tsx`, `AeOwnerMobileNavigation.tsx`, `AePageHeader.tsx`, `AeRecordHeader.tsx`, `AeSection.tsx`, `AeOperatorBreadcrumbs.tsx`, `AePageState.tsx`, `AePublicRouteStates.tsx`, `AeOperatorRouteStates.tsx`, `AeNavigationSafetyBoundary.tsx`, `AeRecordSheet.tsx`, `AeChatPage.tsx`, `AeNotFound.tsx`, and `AeRouteProgressBar.tsx`.
- `src/components/ae/layout/AePublicShell.tsx` owns public nav, skip-focus bridge, mobile Sheet drawer, command-panel provider, footer, and sticky-header elevation. `src/components/ae/layout/AeOperatorShell.tsx` keeps sidebar/breadcrumb chrome mounted through slow or failed route loads and registers nested shell chrome. `src/components/ae/layout/AePageState.tsx` maps shared UI-state presentations into a real public `<h1>` with `status`/`alert`; its content-shaped list/detail/market skeletons prevent layout jumps.

### Command/search panel

- `src/components/ae/command-panel/` — keyboard-first stacked modal over public/operator chrome. `AeCommandPanel.tsx` owns Cmd/Ctrl-K, Escape pop/close, and the dialog; `CommandPanelProvider.tsx` supplies injectable operation-detail and credential readers; `command-panel-state.ts` is the bounded page-stack state machine (root search plus inspect layers); `OperationsSearchPage.tsx` debounces live market search and exposes idle/loading/failed/done recovery; `OperationInspectPage.tsx` renders the compact canonical Operation inspector; `useCommandPanelHotKeys.ts` owns hotkeys; `recent-operations.ts` stores only validated public Operation refs; `market-operations-client.ts` calls the catalog search route; `index.ts` exposes the feature seam. `pages/` contains `OperationsSearchPage.tsx` and `OperationInspectPage.tsx`.

### Operation chat and answer presentation

- `src/components/ae/operation-chat/` — anonymous/authenticated/shared chat UI around Operation discovery and execution states. `OperationChat.tsx` coordinates Convex/AI SDK messages, bounded prompts, thread handoff, and transcript state; `ChatTranscript.tsx` maps turns into `Message`/`Bubble`/`Marker`/`MessageScroller`; `OperationComposer.tsx` composes Field/InputGroup/Spinner/send and recovery copy; `OperationChatHeader.tsx` owns history, share, sign-in, and new-chat actions; `OperationHistory.tsx` owns searchable, renameable, deletable threads; `OperationCard.tsx` renders choice, inspect, and execution projections; `SharedOperationChat.tsx` renders read-only shared threads; `presentation.ts` preserves typed chat status/failure/correlation and projects tool-card/transcript data; `index.ts` is the export seam.

### Owner Operations, supply, and provider connections

- `src/components/ae/offerings/` — owner-facing Operation inventory and editor. `AeOwnerOfferings.tsx` provides filterable/sortable list, status/access/readiness cells, revision-safe editor, access-path editing, and navigation safety; `AeOwnerOperationsWorkspace.tsx` composes identity, inventory, lifecycle, provider connections, payouts, and deferred/unavailable sections; `owner-offering.functions.ts`, `owner-operations.functions.ts`, and `owner-operations-projection.ts` are the typed server/projection support seams; `AeOwnerOfferings.exports.ts` holds browser draft/publish-gate helpers; `offering-presentation.ts` turns public catalog offerings/access paths into plain-language views and technical facts.
- `src/components/ae/supply/` — supplier onboarding funnel from source description to admitted/readiness-tested publication. `AeSupplyLanding.tsx` explains the four-step source fit and embeds proof; `AeSupplyFunnel.tsx` coordinates Describe → Admission → Readiness → Test, canary status/promotion, maintenance/recheck/withdraw/republish actions, and refusal/recovery copy; `AeSupplyEndpointConfigStep.tsx` edits OpenAPI, MCP, Agent Plugin MCP, or x402 source details with preflight, authority selection, schema/evidence/commercial fields, and draft/save/submit outcomes; `AeOwnerOperationFacts.tsx` presents source, binding, exact price, readiness evidence, lifecycle, and live facts; `AeOwnerProviderConnections.tsx` lists/reconnects/revokes owner provider connections; `AeSupplyAgentProof.tsx` shows a bounded proof sample of tools/Operations; `AeSupplyEarningsCard.tsx` presents supplier earnings; `supplier-continuation.ts`, `provider-connection-target.ts`, and `supply-endpoint-config-readback.ts` are typed continuation/target/readback helpers.
- `src/components/ae/agent-access/` — protected caller authorization UI. `AeAgentAccessAuthorizeForm.tsx` is the consent flow for inspect-only, approve-each, or bounded-mandate modes, connection/replacement selection, paged target loading, decision pending, and approved/denied/error terminal states.
- `src/components/ae/console/` — agent and credit operator workspace. `AeAgentOperatorConsole.tsx` shows connected-agent directory, pending approvals, credential history, revoke/disconnect controls, and recovery copy; `AeCreditTopUpPanel.tsx` handles exact credit amount entry, Stripe Checkout Payment Element, payment status, and persisted outcome-unknown recovery; `AeOwnerCredit.tsx` projects balance/charges/activity and selects a top-up target; `AeAgentQuickstart.tsx` renders numbered copyable CLI steps and reference rows; `AeAssistantInstallFunnel.tsx` presents CLI/MCP install and recovery commands through `CodeBlock`.
- `src/components/ae/settings/` — owner settings shell and profile/general identity editing. `OwnerSettingsShell.tsx` provides the operator shell plus `AeSettingsStack`; `AeWorkspaceGeneral.tsx` renders current/unavailable/not-found state and revision-safe supplier display-name editing; `OwnerSettingsSections.tsx` composes Clerk profile/session controls and the local-preview explanation.

### Status, data, feedback, and admin readback

- `src/components/ae/status/` — catalog/Operation status and provenance presentation. `AeStatusBadge.tsx` maps the shared status presentation to public/operator labels and semantic Badge variants; `AeStatusCard.tsx` summarizes public status, support/access/readiness, location, unavailable capabilities, and next action; `AeCapabilityList.tsx` renders published Operations in `AeRecordTable`; `ProvenanceBadge.tsx` displays a source label without claiming verification.
- `src/components/ae/data/` — reusable data reading/copy affordances. `AeFactList.tsx` renders `<dl>` facts with default/compact and mono/tabular options; `AeCopyReference.tsx` copies bounded identifiers with polite status feedback; `AeCopyCommand.tsx` renders compact/comfortable shell commands and copy feedback (resolving `$ORIGIN` only at copy time); `AeViewBar.tsx` composes labelled filter, count, and action controls.
- `src/components/ae/feedback/` — explicit empty/degraded/error/recovery UI. `AeEmptyState.tsx` is the centered status/alert empty surface; `AeDegradedState.tsx` is the alert half for unavailable-but-expected content; `AeInlineState.tsx` projects `AeUiState` into a live Badge plus description; `AeConfirmDialog.tsx` guards async confirmations and returns focus; `AeObservabilityErrorBoundary.tsx` reports through Sentry and offers retry or catalog recovery.
- `src/components/ae/operator/` — `AeOperatorDataTable.tsx`, a generic TanStack table adapter with controlled/uncontrolled filtering and sorting, selection, row actions, sticky semantic headers, roving row-action focus, first-load skeletons, filter-empty recovery, and selection status.
- `src/components/ae/readback/` — `AeAdminReadbackPanel.tsx`, an admin-only activity/index-health readback with denied/allowed states, sortable table rows, status/repair labels, and collapsible raw references.

### Public website, landing, and listings

- `src/components/ae/website/` — public brand primitives and page compositions. `AeSiteSection.tsx` controls canvas/container/muted/ink schemes and section rhythm; `AeSiteType.tsx` owns display heading sizes, body, eyebrow, intro, stack, hero, and split-pair composition; `AeSiteNav.tsx` owns active primary/drawer nav and icon buttons; `AeSiteMarks.tsx` owns plus marks, corner marks, hairlines, dotted rules, construction frames, and crosshairs; `AeSiteButton.tsx` and `AeSiteButtonShape.tsx` implement the public 44px filled/outlined notched action; `AeNotchedCard.tsx` supplies the public dipped-cap shape; `AeSiteCallout.tsx`, `AeSiteSignoff.tsx`, `AeSiteCover.tsx`, `AeSiteFaq.tsx`, `AeSiteResourceList.tsx`, and `AeSiteFooter.tsx` compose editorial bands; `AeSiteBrowser.tsx` frames live-looking surfaces without claiming a browser; `AeSiteAuthStage.tsx`, `AeSiteAuthPanel.tsx`, and `clerk-appearance.ts` put auth in site chrome; `AeAgentInstructionCard.tsx` carries agent setup language; `index.ts` is the public export seam.
- `src/components/ae/home/` — `AeHomeLanding.tsx`, the catalogue-entry landing page: hero/search, current Operation count, capability results, unavailable/empty handling, and public site composition.
- `src/components/ae/landing/` — `AeAgentJsonAffordance.tsx`, an explicit agent-readable JSON preview/copy dialog that fetches real data and distinguishes idle/loading/ready/error.
- `src/components/ae/agents/` — `AeAgentDoorPage.tsx`, the agent setup door with anonymous reads, authenticated call examples, CLI/MCP install funnel, and API reference.
- `src/components/ae/about/` — `AeAboutPage.tsx`, the product/about page with agent/provider doors and machine-readable resource links.
- `src/components/ae/listing/` — `AeProviderListingPage.tsx` renders a supplier profile over native Operations, published access paths, facts, agent JSON, and external links; `PublicBusinessNotFound.tsx` gives distinct not-public/no-such-supplier route states.
- `src/components/ae/primitives/` — `AeOfferingCard.tsx`, the canonical published `PublicOfferingDto` card with optional source/tag, provider facts, access-path pills, and action slot.
- `src/components/ae/services/` — `money.ts`, a small presentation formatter for published quote/from/range prices, units, and tax treatment.

### Cross-cutting provider facts

- `src/components/ae/provider-facts.tsx` — `ProviderFacts`, a compact `<dl>` that omits absent/blank facts and renders service area, availability, pricing, or other published terms.
- `src/components/ae/provider-facts.exports.ts` — `offeringPathLabel`, the exhaustive human label projection for phone, website, and external Operation access paths.

## Shared UI helpers and hooks

### `src/lib/ui/`

- `src/lib/ui/status-presentation.ts` — canonical `AeStatus` inventory and typed status presentations (label, compact label, tone, description, priority, audience, publicness, optional next action/disabled reason); maps catalog disposition, trust tier, support, and access to statuses; supplies honest plain availability/hours/trust/next-step/response/freshness labels, category illustration fallback, and the `AeTone` → Badge variant map.
- `src/lib/ui/trust-projection.ts` — projects published phone/hours/service-area facts and reply posture into explicit `published`/`not_published` trust facts; keeps direct-contact and no-contact explainers distinct and defaults reply history to “No reply history yet.”
- `src/lib/ui/ui-state.ts` — canonical UI lifecycle vocabulary (`loading`, `empty`, `draft`, `saving`, `saved`, `pending`, `succeeded`, `refused`, `stale`, `unavailable`, `outcome_unknown`) with title, description, tone, ARIA role/live mode, and allowed recovery actions.
- `src/lib/ui/toast.ts` — client-only Sonner adapter; wraps success/info/warning as polite `status` and error as `alert`, combining title/description into an accessible label.
- `src/lib/ui/format-time.ts` — pinned `en-AU` timestamp/date/numeric/record/UTC and relative-time formatters plus ISO `<time>` values; avoids server/client locale drift.
- `src/lib/ui/copy-text-to-clipboard.ts` — guarded Clipboard API adapter that rejects on server or unavailable clipboard rather than silently pretending to copy.
- `src/lib/ui/tel-uri.ts` — sanitizes published phone text to dialable characters and returns a `tel:` URI only for a bounded, plausibly dialable number.
- `src/lib/ui/contract-scans.ts` — source-level contract scanners for backup/private/route/TypeScript/UI patterns plus module-boundary exports; re-exports `findFiles` and scan types from `src/lib/ui/contract-scans/file-discovery.ts` and boundary analysis from `src/lib/ui/contract-scans/module-boundaries.ts`.
- `src/lib/ui/contract-scans/file-discovery.ts` — bounded recursive scanner target/violation types, extension filtering, and ignored-directory handling.
- `src/lib/ui/contract-scans/module-boundaries.ts` — TypeScript import graph observation, module-boundary manifest validation, runtime/test consumer scans, and declared cycle detection.

### `src/lib/utils.ts` and `src/hooks/`

- `src/lib/utils.ts` — `cn(...inputs)`, the one class composition seam: `clsx` normalizes conditional values and `tailwind-merge` resolves conflicting utilities.
- `src/hooks/use-mobile.ts` — `useIsMobile`, a 768px `matchMedia` subscription used by responsive sidebar/navigation behavior.
- `src/hooks/use-clipboard-copy.ts` — `useClipboardCopy`, a timed `idle`/`copied`/`failed` state machine around `copyTextToClipboard`, with optional duplicate-copy suppression and callbacks.
- `src/hooks/use-client-mounted.ts` — `useClientMounted`, an SSR-safe `useSyncExternalStore` signal that is false on the server and true after browser mount.

## Iconography

`components.json` locks the icon library to Lucide. The code uses named imports
from `lucide-react`, generally the explicit `*Icon` names (`SearchIcon`,
`ArrowLeftIcon`, `CopyIcon`, `FileCode2Icon`, `Loader2Icon`); a few stock
wrappers retain Lucide names such as `ChevronRight` and `MoreHorizontal`.

Observed conventions:

- Decorative icons carry `aria-hidden="true"`; icon-only controls carry a
  visible accessible name via `aria-label` or surrounding `sr-only` text. This
  appears in `src/components/ae/layout/AePublicShell.tsx`,
  `src/components/ae/command-panel/AeCommandPanel.tsx`,
  `src/components/ae/data/AeCopyReference.tsx`, and
  `src/components/ae/operation-chat/OperationComposer.tsx`.
- Base Button CSS sizes an unqualified SVG at `size-4`; callers use explicit
  `className="size-3.5"`, `size-5`, or `size-4` when the role needs a different
  scale. `data-icon="inline-start"`/`"inline-end"` marks directional icons in
  button labels, for example the command-panel back/close controls and
  `AeOperationPosition`.
- Icons are passed as data, not redrawn inline: `AeOperatorSidebar` and
  `AeOwnerMobileNavigation` render navigation item icon components with
  `aria-hidden`; `AeSiteMarks` uses authored SVG only for the AE construction
  language, not as a replacement icon set.
- `Spinner` is the exception to decorative treatment: it is a status element with
  `role="status"` and `aria-label="Loading"`. The loading label is not inferred
  from animation alone.

## Variant and composition pattern

1. **Compose classes through `cn`.** Every UI primitive and most AE components
   merge base classes with caller classes through `cn` from
   `src/lib/utils.ts`; do not concatenate ad hoc strings when conditional
   classes are involved.
2. **Use `cva` for a real variant matrix.** Shared variants live beside the
   primitive (`src/components/ui/button-variants.ts`,
   `src/components/ui/toggle-variants.ts`, and the local matrices in
   `badge.tsx`, `alert.tsx`, `tabs.tsx`, `item.tsx`, `marker.tsx`, and
   `bubble.tsx`). Keep variant names semantic and map domain statuses through
   `src/lib/ui/status-presentation.ts`, not per-call-site color strings.
3. **Wrap Radix rather than bypass it.** `accordion.tsx`, `dialog.tsx`,
   `sheet.tsx`, `select.tsx`, `tabs.tsx`, `checkbox.tsx`, `radio-group.tsx`,
   `collapsible.tsx`, `alert-dialog.tsx`, `label.tsx`, and `tooltip.tsx` retain
   the primitive's focus, keyboard, portal, and state behavior while adding
   `data-slot` and AE classes. Use `asChild`/`Slot.Root` where a semantic Link
   or caller-owned element must receive the primitive behavior.
4. **Prefer slots and projections over feature forks.** `Item`, `Card`,
   `Field`, `AeFactList`, `AeOperationInspector`, and `AeChatPage` expose
   composition slots; `operation-inspector-model.ts` keeps compact/full
   Operation decision state identical; `AePageState` and `ui-state.ts` keep
   route-level copy/ARIA behavior identical.
5. **Keep semantic data structures.** Facts are `<dl>`, records use
   `src/components/ui/table.tsx`, route state uses real headings, and links/
   buttons retain their native element semantics. A visual class must not turn a
   noninteractive `<div>` into a fake control.
6. **Use token utilities and touch sizing.** Existing components use semantic
   classes such as `bg-background`, `bg-container`, `text-foreground`,
   `border-border`, `text-muted-foreground`, `min-h-touch`, `gap-intra`,
   `gap-related`, `py-section`, and `font-mono tabular-nums`. Do not create a
   feature-local palette, radius, shadow, type scale, or duration.

## State vocabulary and implementation

| State | Current implementation | Composition rule |
| --- | --- | --- |
| Hover | Buttons, links, rows, and items use tokenized `hover:*` classes; market rows use the whole-row hover treatment in `AeOperationCard.tsx`, and public links grow a `SiteMarker`. | Hover is an affordance, never the sole accessible indication of an action. |
| Focus | Button/input/field/radix wrappers use `focus-visible:border-ring` and `focus-visible:ring-[3px]`; public links use visible ring utilities; dialog/sheet/Radix primitives provide focus management. | Preserve the visible double-ring contract and never replace it with `outline-none` without an equivalent visible state. |
| Active/selected/open | Accordion, checkbox, select, tabs, toggle, table, sidebar, and Radix wrappers style `data-state`, `data-[state=selected]`, `data-[active=true]`, or `aria-current`; `src/components/ae/operator/AeOperatorDataTable.tsx` adds `aria-sort`, selection state, and roving focus. | State styling must communicate the semantic state, not just a color change. |
| Disabled/busy | Base controls use `disabled:pointer-events-none disabled:opacity-50` or equivalent; forms pass `disabled`; async surfaces expose `aria-busy`, e.g. `AeCreditTopUpPanel.tsx`, `OperationComposer.tsx`, `AePageState.tsx`, and `AeOperatorRouteStates.tsx`. | Disable duplicate dispatch while preserving an understandable label and recovery path. |
| Loading/first load | `Spinner` announces loading; `Skeleton` mirrors list/detail/market geometry; `src/components/ui/data-state.ts` distinguishes no cache from cached refresh; `AeRecordTable`, `ChatTranscript`, and `AePageSkeleton` keep known content visible during refresh. | Skeletons are only for an actually unloaded surface; never flash a cached list into an empty state. |
| Empty | `src/components/ui/empty.tsx` is composable generic anatomy; `AeEmptyState.tsx`, `AeCapabilityList.tsx`, `CatalogEmpty` in `AeMarketPage.tsx`, and `ChatTranscript.tsx` provide product-specific copy/actions. | Empty means resolved and genuinely empty, not unavailable or failed. |
| Error/unavailable | `FieldError` is a deduplicated `role="alert"`; `Alert` is an alert surface; `AePageState`, `AeDegradedState`, route-state components, and `AeObservabilityErrorBoundary` distinguish failure from no data and offer retry/recovery. | Say what is unavailable and what the user can do; do not expose backend details as product copy. |
| Terminal/recovery | `src/lib/ui/ui-state.ts` defines `pending`, `succeeded`, `refused`, `stale`, `unavailable`, and `outcome_unknown` with live mode and allowed recovery actions; `AeInlineState`, toasts, Operation cards, supply funnel, and credit top-up consume that vocabulary. | Never imply completion when the authoritative outcome is unknown; reload/reconcile before retrying a possibly dispatched action. |

## How to add a component

1. **Search before creating.** Check `src/components/ui/`,
   `src/components/ae/`, `src/lib/ui/`, and `src/hooks/` first. Extend an
   existing primitive or projection when its semantics match. The hard rule in
   `DESIGN.md` is no new visual primitive without a second real use; do not add
   a one-off card, badge, shell, button shape, or status component for one
   screen.
2. **Choose the owner by responsibility.** Generic interaction/layout belongs
   in `src/components/ui/` and should be a shadcn/Radix wrapper or a small
   reusable primitive. Product/domain composition belongs in the relevant
   `src/components/ae/<feature>/` directory. Pure status/time/trust/clipboard
   projection belongs in `src/lib/ui/`; browser behavior belongs in
   `src/hooks/`.
3. **Follow the configured aliases and style.** `components.json` specifies
   shadcn `new-york`, CSS variables, `src/styles/globals.css`, Lucide, and the
   aliases `@/components`, `@/components/ui`, `@/lib`, and `@/hooks`. Use
   named exports, `PascalCase.tsx` for components, and kebab-case for helper or
   variant files. Existing AE product components use the `Ae` prefix; generic
   UI exports use their primitive name.
4. **Preserve the composition seam.** Accept native props where appropriate,
   expose `className`, merge with `cn`, use `cva` only for a meaningful matrix,
   and retain `data-slot`/`data-*` hooks. For a polymorphic link/control use
   Radix `Slot`/`asChild` rather than duplicating button markup. Keep feature
   callers on semantic `Badge`, `Button`, `Field`, `Item`, `Card`, `Table`, and
   `Sheet` variants.
5. **Use existing tokens and states.** Reuse the CSS-first Tailwind v4 tokens
   bridged by `src/styles/globals.css`; use existing touch, focus, motion,
   surface, typography, and spacing utilities. Supply explicit loading,
   empty, error, unavailable, and recovery states where the data/action can
   reach them. Add labels, `aria-live`/`role`, `aria-busy`, keyboard behavior,
   and reduced-motion handling at the component seam rather than asking each
   caller to repair accessibility.
6. **Validate the second use at design time.** Before adding a primitive,
   identify its two real callers and the shared contract they need. If the
   second use is not real, keep the treatment local to the owning AE feature
   instead of expanding the design-system inventory. Do not resurrect
   `.planning/reference/pre-treg-ui-theme.md` or the retired Perplexity/teal
   system.

<!-- refreshed: 2026-09-01 -->
