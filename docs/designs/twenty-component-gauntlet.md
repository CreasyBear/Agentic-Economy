# Twenty → Agentic Economy component gauntlet

**Status:** active implementation-quality record

**Authority note:** this document governs component fidelity and interaction
quality. [PRODUCT.md](../../PRODUCT.md) governs product meaning and
[DESIGN.md](../../DESIGN.md) governs how commercial roles and closure are presented.

Last updated: 2026-08-31  
Twenty reference: `twentyhq/twenty@60a46b2947cd71a52762af43d8474edf167bfa07`  
Product authority: `PRODUCT.md`

## Contract

This is a literal component and design-system comparison, not a visual moodboard. Every item records its component boundary and consumers, primitive ownership, state model, keyboard/focus/dismissal behavior, responsive behavior, motion, design tokens, matched screenshots, focused checks, and a fresh critic's verdict.

Twenty is the quality bar, not AE's product model. AE keeps the Operation-market loop from `PRODUCT.md`. A deliberate divergence must name the stronger product reason and retain or improve the underlying behavior.

An item advances only after source/behavior and screenshot critics pick AE as at least on par. Work stays in register order: components first, then views.

## Ordered register

| Order | ID | Boundary | Twenty modules | AE modules | Generic primitive decision | Gate | Status |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | C01 | Canonical Operation inspector | record-show renderer; side-panel record page | `operation-detail/*`; command inspect; Operation route | shadcn `Card`, `Item`, `Badge`, `Separator`, `Accordion`, `Button` | One model/composition serves compact and full inspection without duplicate decision logic | **PASS** |
| 2 | C02 | Command modal shell | command-menu container; side-panel router/top bar/history/hotkeys; dialog manager | `AeCommandPanel`; provider/stack/hotkeys; shadcn dialog/command | shadcn `Dialog` owns modal mechanics; AE owns Operation page stack | Centered desktop modal; small-screen fallback; layered Escape; focus restore; persistent stack; reduced-motion-safe transitions | **PASS** |
| 3 | C03 | Selectable list and grouped results | selectable list/item; side-panel list/group; focus hooks | command Operation search/results | shadcn `Command`/`CommandItem`; one AE adapter only for uncovered async intent | Arrow/Home/End/Enter/hover/active-descendant/loading/empty behavior | **PASS** |
| 4 | C04 | Market toolbar/filter/sort/chips | view bar; filter/sort dropdowns; chip | market catalog controls | shadcn `InputGroup`, `Select`, `Badge`, `Button`; no generic menu or false sort control | URL-backed search/filter/category state, truthful chips/counts, clear-all, complete keyboard path, canonical server ranking preserved | **PASS** |
| 5 | C05 | Record table focus/selection/opening | table focus/selection hooks and rows | market and operator tables | shadcn `Table` + `Checkbox`, TanStack Table state, Radix roving focus; no second table primitive | Composable focus/selection, consistent opening, correct bulk states and semantics | **PASS** |
| 6 | C06 | Compare tray | multi-record selection and bottom action surfaces | market compare selection | shadcn `Card`, `Button`, `Badge`, `Separator` | Persistent count, remove/clear/max behavior, keyboard access, compact responsive layout | **PASS** |
| 7 | V01 | Market search and comparison | composed Twenty index/search view | AE market | consume C01–C06 | One URL-recoverable search→compare workflow | **PASS** |
| 8 | V02 | Operation detail | composed record-show view | AE Operation route | consume C01–C06 | Evidence hierarchy and one safe continuation without duplicate presentation | **PASS** |
| 9 | V03 | Command modal | composed command workflow | AE `⌘K` workflow | consume C01–C06 | Search→inspect preserves context and never becomes a desktop sheet | **PASS** |
| 10 | V04 | Owner Operation inventory | composed Twenty table/control view | AE owner inventory | consume C01–C06 | Shared table/control behavior; no CRM scope expansion | **PASS** |

## C01 — Canonical Operation inspector

| Concern | Twenty | AE result |
| --- | --- | --- |
| Canonical record composition | `packages/twenty-front/src/pages/object-record/RecordShowPage.tsx` and record-show/page-layout renderers | `src/components/ae/market/operation-detail/AeOperationInspector.tsx` |
| Shared compact/full truth | the same configured record content is rendered with context-specific chrome | `toOperationInspectorModel` supplies both `compact` and `full` variants |
| Generic surfaces | Twenty UI record/page-layout components and theme tokens | installed shadcn card/item/badge/separator/accordion/button primitives |
| Domain content | object metadata and record fields | Operation identity, decision, price/readiness, evidence, contract, and continuation |

Evidence:

- Full and compact consumers use the same Operation model and composition.
- Compact inspection compresses decision, readiness, facts, and continuation; secondary commands are disclosed rather than repeated.
- Checks: repository typecheck; 34 focused tests; UI-contract gate; focused lint.
- Twenty screenshot: `packages/twenty-docs/images/user-guide/home/side-panel.png`.
- AE screenshots: `output/gauntlet/c01/ae-operation-full.png` and `output/gauntlet/c01/ae-operation-compact-round3.png`, 1440×900.
- Final source/behavior verdict: **AE**. Final screenshot verdict: **AE**.

## C02 — Command modal shell

### Literal map and intentional divergence

| Concern | Twenty source | AE source/decision |
| --- | --- | --- |
| Container | `command-menu/components/CommandMenuOpenContainer.tsx` currently composes a right-side panel | `AeCommandPanel.tsx` uses centered shadcn `Dialog`; the user explicitly rejects sheet geometry |
| Modal mechanics | `ui/feedback/dialog-manager/components/Dialog.tsx` hand-rolls overlay, outside click, focus hotkeys, and motion | installed Radix-backed shadcn `Dialog` owns overlay, portal, focus trap, outside click, Escape, and restoration |
| Page router | `side-panel/components/SidePanelRouter.tsx` and page/subpage state | `CommandPanelProvider.tsx` and `command-panel-state.ts` retain the Operation page deck across toggles |
| Palette/header | `side-panel/components/SidePanelTopBar.tsx`; earlier `v0.43.0` command menu top bar/router | shadcn `Command` is the palette surface; root search is the first-line control; inspect alone adds a Back/Close bar |
| Layered Escape | `side-panel/hooks/useHandleSidePanelEscape.ts` and `useSidePanelHistory.ts` clear search, pop subpage/page, then close | modal clears query, pops inspect, then closes from the root |
| Hotkeys | `command-menu/hooks/useCommandMenuHotKeys.ts` | `useCommandPanelHotKeys.ts` toggles on Cmd/Ctrl-K; slash focuses search while open |
| Focus | Twenty focus stack and `SIDE_PANEL_FOCUS_ID` | Radix modal focus containment/restoration plus explicit search focus when its page becomes active |
| Motion | side-panel variants slide x from 100%; Twenty dialog fades overlay and moves y | modal fades/zooms opacity and transform using AE motion tokens; reduced-motion globally collapses duration |
| Responsive form | Twenty full-screen mobile side panel | centered bounded desktop modal with near-full/full-screen small-screen fallback |
| Density/tokens | Twenty theme spacing, medium border, primary/secondary backgrounds, compact top bar | AE semantic colors, spacing tokens, radius, shadow, and 100/160/220ms motion scale |

Gate:

- Desktop is a modal, never a sheet.
- Accessible title and description remain present.
- Overlay, focus containment, outside dismissal, and focus restoration are not hand-rolled.
- Escape order is query → inspect layer → close.
- Closing and reopening preserves the search/inspect deck.
- Small-screen Close/Back actions remain touch-visible.
- Screenshot pair: Twenty command surface and AE search/inspect modal at 1440×900.
- Round 1 source/behavior verdict: **AE**.
- Round 1 screenshot verdict: **TWENTY**. Gap: a blank 48px root chrome row delayed the search control.
- Round 2 moved the primitive Close X into the search line and retained the Back/Close bar only for inspect.
- Round 2 checks: typecheck; 23/23 focused command-panel tests; UI-contract gate; focused lint; dead duplicate scan.
- Round 2 desktop screenshots: `output/gauntlet/c02/ae-command-modal-search-round2.png` and `output/gauntlet/c02/ae-command-modal-inspect-round2.png`, 1914×966.
- Round 2 mobile screenshots: `output/gauntlet/c02/ae-command-modal-mobile-search-round2.png` and `output/gauntlet/c02/ae-command-modal-mobile-inspect-round2.png`, 390×844; no horizontal overflow.
- Twenty baselines: `packages/twenty-docs/images/user-guide/home/command-menu.png` and `packages/twenty-docs/images/releases/0.43.0/search-upgrade.png`.
- Round 2 source/behavior verdict: **AE**. Round 2 screenshot verdict: **AE**.
- The unused `AeRouteCommandMenu` duplicate and its manual focus/hotkey machinery were removed; Git history remains the recovery path.
- C02 final verdict: **PASS**.

## C03 — Selectable list and grouped results

### Literal module map

| Concern | Twenty source | AE result |
| --- | --- | --- |
| Search input | current `SidePanelTopBar.tsx`; v0.43 `CommandMenuTopBar.tsx` | unchanged upstream shadcn `CommandInput` |
| Scrollable list and grouping | `SidePanelList.tsx`, `SidePanelGroup.tsx`; v0.43 command list/group | shadcn `CommandList` and `CommandGroup`; the list consumes the modal's available height |
| Selection engine | `ui/layout/selectable-list/*` plus Twenty focus atoms/hotkey hooks | cmdk owns every mounted-choice keyboard, pointer, active-descendant, selection, and scroll behavior |
| Row wrapper and presentation | `SelectableListItem.tsx`; `CommandMenuItem.tsx`; twenty-ui `MenuItem` | shadcn `CommandItem` with compact Operation title/price and two decision-fact lines |
| Default/surviving selection | Twenty default-selection effect | controlled cmdk value preserves a surviving Operation and falls back to the first authoritative choice |
| Async search | Twenty search hooks render record results | AE keeps server-authoritative, debounced Operation search with `shouldFilter={false}` and stale-response rejection |
| Early keyboard intent | no equivalent for unmounted async choices | one exact-query adapter records only Arrow/Home/End/Enter received before choices mount |
| Recovery | fallback groups and empty rows | `CommandEmpty` plus shadcn `Button` actions for Retry, Clear, and Browse |
| Inactive stacked page | side-panel router changes pages | hidden search input and items are disabled while inspect is active |

Deleted hand-rolled mechanics:

- Raw `Input`, search-icon wrapper, `ul`/`li`/option buttons, generated listbox IDs, and manual combobox/listbox ARIA.
- Local selection indices/refs, Arrow/Home/End/Enter movement for mounted choices, pointer tracking, selected-row scrolling, and raw recovery controls.
- No shared Command primitive edits: the installed `src/components/ui/command.tsx` matches the current upstream shadcn registry source.

Evidence:

- `cmdk` owns first selection, clamped Arrow navigation, Home/End, Enter activation, pointer selection, click activation, nearest-item scrolling, grouped listbox semantics, options, `aria-selected`, and active descendant.
- AE owns only Operation data/query truth, request states, recent references, result composition, and the narrow query-keyed pre-result intent adapter.
- Checks: repository typecheck; 27/27 focused command-panel tests including stale-order, hidden-page, retry, surviving-selection, Home/End, pointer, and early-intent cases; UI-contract gate; focused lint; raw-mechanics scan; diff check.
- Twenty screenshot: `output/gauntlet/c03/twenty-command-results-reference.png` (source: release 0.43 search upgrade).
- AE desktop screenshots: `output/gauntlet/c03/ae-command-results-desktop-round1.png`, 1914×966, and normalized `ae-command-list-desktop-round1.png`.
- AE mobile screenshots: `output/gauntlet/c03/ae-command-results-mobile-round1.png`, 390×844, and normalized `ae-command-list-mobile-round1.png`.
- Source/behavior critic verdict: **AE**. Screenshot critic verdict: **AE**.
- C03 final verdict: **PASS**.

## C04 — Market toolbar, filters, and applied state

### Literal module map

| Concern | Twenty source | AE result |
| --- | --- | --- |
| Toolbar composition | `views/components/ViewBar.tsx`, `ViewBarDetails.tsx` | `AeMarketToolbar.tsx`, composed once by `AeMarketPage.tsx` |
| Search | filter search and query-param effects | native GET form composed from shadcn `InputGroup` |
| Exclusive filter | `ViewBarFilterDropdown*` | shadcn `Select` for authoritative availability state |
| Applied chip | `SortOrFilterChip.tsx`, `EditableFilterChip.tsx` | shadcn `Badge asChild` with a TanStack `Link` |
| URL recovery | `QueryParamsFiltersEffect.tsx`, `QueryParamsCleanupEffect.tsx` | `/market` validation plus URL-controlled search, availability, category, cursor, and capability context |
| Category navigation | view/tab state | shadcn `Tabs`; category is shareable presentation state and counts explicitly mean capability groups on the loaded page |
| Sort | real persisted Twenty sort state | intentionally omitted: AE's server owns global relevance order and cursor pagination, so page-local sort would be false |

Evidence:

- Only query and availability are counted as authoritative filters. Capability remains drill-down context; category remains page-local presentation state but is URL recoverable.
- Search, filter removal, filter reset, category changes, and pagination preserve only compatible state and always invalidate an opaque cursor when ranking inputs change.
- Radix-backed shadcn `Select` owns focus, typeahead, arrows, Escape, outside dismissal, portal, collision, and focus restoration. No generic dropdown, document listener, selection index, or custom keyboard handler was added.
- Mobile category Tabs use a single horizontal scroll row, avoiding wrapped-control overlap while retaining the primitive's roving focus behavior.
- Checks: repository typecheck; 12/12 focused market and route-validator tests; UI-contract gate; focused lint; raw-mechanics scan; diff check.
- Twenty screenshots: `output/gauntlet/c04/twenty-search-bar-reference.png` and `twenty-view-menu-reference.png`, 1914×966.
- AE desktop screenshots: `output/gauntlet/c04/ae-market-toolbar-desktop-round3.png` and `ae-market-toolbar-desktop-open-round3.png`, 1914×966.
- AE mobile screenshots: `output/gauntlet/c04/ae-market-toolbar-mobile-round3.png` and `ae-market-toolbar-mobile-open-round3.png`, 390×844; no page-level horizontal overflow or content overlap.
- Round 1 source/behavior verdict: **TWENTY**. Gap: category was local-only while capability was mislabeled as a filter.
- Round 3 source/behavior verdict: **AE**. Round 3 screenshot verdict: **AE**.
- C04 final verdict: **PASS**.

## C05 — Record table focus, selection, and opening

### Literal module map

| Concern | Twenty source | AE result |
| --- | --- | --- |
| Table composition | `RecordTable.tsx`, `RecordTableContent.tsx`, `RecordTableRow.tsx`, `RecordTableTr.tsx`, `RecordTableRowDiv.tsx`, `RecordTableRowCells.tsx` | one semantic `AeRecordTable` built on the installed shadcn `Table`; all eight market/operator consumers use it |
| Focus movement | `useFocusedRecordTableRow`, `useRecordTableMoveFocusedRow`, `useRecordTableRowFocusHotkeys`, `RecordTableRowArrowKeysEffect` | Radix `RovingFocusGroup` owns Arrow/Home/End focus among explicit native row actions; table rows are never focusable or clickable |
| Row opening | record-row focus and click effects | exactly one shadcn `Button` or `Button asChild` TanStack `Link` per actionable row; native activation and link modifiers are retained |
| Selection | `RecordTableCellCheckbox.tsx`, `RecordTableHeaderCheckboxColumn.tsx`, selection hooks/selectors | optional controlled TanStack row selection rendered with shadcn `Checkbox`; stable `getRowId` is required whenever selection is enabled |
| Bulk state | Twenty header checkbox and selected-row atoms | TanStack `getIsAllPageRowsSelected`, `getIsSomePageRowsSelected`, and `toggleAllPageRowsSelected`; outside-page IDs are preserved and disabled rows are respected |
| Mixed-state visual | Twenty visible partial-selection state | shadcn Checkbox composition keeps Radix ARIA/state ownership and renders a Lucide minus for `indeterminate` |
| Market ordering | Twenty tables may own full-dataset sorts/filters | AE market table intentionally has no page-local filter or sort because the server owns global ranking and opaque cursors |

Evidence:

- Deleted the former focusable/clickable `<tr>` implementation, manual Enter/Space handlers, imperative router navigation, and `window.open` modifier emulation.
- Static tables remain plain semantic tables. Interactive tables opt into one explicit row-action column; selection remains separately optional and controlled.
- Selection scope is the current rendered page/model, never unloaded cursor pages. The status states the selectable visible count.
- Checks: 59/59 affected tests; focused table tests; UI-contract gate; focused lint; repository typecheck; raw-mechanics scan; diff check.
- Official component evidence: `src/components/ui/checkbox.tsx` was installed from the current shadcn registry, with only the required visible indeterminate-state composition added.
- Twenty screenshots: `output/gauntlet/c05/twenty-record-table-reference.png` and `twenty-selection-reference.png`.
- AE desktop screenshots: `output/gauntlet/c05/ae-record-table-desktop-round1.png`, `ae-record-table-desktop-crop-round1.png`, and `ae-record-table-desktop-focus-round1.png`, 1920×972.
- AE mobile screenshots: `output/gauntlet/c05/ae-record-table-mobile-round1.png`, `ae-record-table-mobile-crop-round1.png`, and `ae-record-table-mobile-focus-round1.png`, 390×844.
- Round 1 critic requested TanStack-owned bulk derivation, a stable-ID selection contract, and a visible mixed glyph. All three were corrected and re-tested.
- Final source/behavior verdict: **AE**. Final screenshot verdict: **AE**.
- C05 final verdict: **PASS**.

## C06 — Compare tray

| Concern | Twenty source bar | AE result |
| --- | --- | --- |
| Selection projection | row/header checkbox components, selected-record selectors/effects, record-index selected count | one controlled TanStack state shared across market tables and projected into `AeCompareTray` |
| Action surface | command-menu action availability, pinned actions, reset-selection behavior | a product-specific bottom comparison tray; no CRM bulk-action model |
| Selection scope | current record index state | current loaded cursor page only; stale references are pruned and catalog order is retained |
| Limit | generic record actions | canonical compare schema maximum of four; unavailable rows and a fifth eligible row cannot be added |
| Primitive ownership | Twenty UI surfaces | shadcn `Card`, `Badge`, `Button`, `Separator`; Radix `Presence` owns exit lifecycle |
| Focus and announcements | selected-record state and action affordances | one aggregate live count; Provider-qualified remove labels; nearest-item or Catalog fallback focus recovery |
| Responsive behavior | compact selected-record action surfaces | safe-area-aware fixed tray, internal chip scrolling, and page clearance protecting the last table row |

Evidence:

- Zero selections hide the tray; one disables Compare; two through four enable it. Remove and Clear all remain synchronized with every rendered table.
- The Presence-observed `<aside>` owns both open and closed animation state. A lifecycle test proves exit remains mounted until its matching animation completes; reduced motion removes the transition.
- Checks: 19/19 focused comparison/market tests; focused lint; UI-contract gate; diff check.
- Twenty screenshot: `output/gauntlet/c06/twenty-bulk-selection-reference.png`.
- AE screenshots: `output/gauntlet/c06/ae-compare-tray-desktop-two-round1.png`, `ae-compare-tray-desktop-focus-round1.png`, `ae-compare-tray-desktop-max-round1.png`, and `ae-compare-tray-mobile-two-round1.png`, recaptured after the final transition correction.
- Round 1 source critic found that exit animation lived below the Presence child. The animation and state moved to the observed element and gained an unmount-timing test.
- Final source/behavior verdict: **AE**. Final screenshot verdict: **AE**.
- C06 final verdict: **PASS**.

## V01 — Market search and comparison

### Literal module map and gate

| Concern | Twenty source | AE target |
| --- | --- | --- |
| Route/page gate | `pages/object-record/RecordIndexPage.tsx`, `RecordIndexContainerGater.tsx` | validated `/market` search plus one server projection |
| Stable shell | `PageCardLayout.tsx`, `RecordIndexPageHeader.tsx` | `AePublicPage`, `AePageHeader`, and the market rail remain stable across states |
| Controls | `RecordIndexViewBar.tsx`, `ViewBar.tsx`, `ViewBarDetails.tsx` | consume the existing C04 `AeMarketToolbar`; no second toolbar |
| URL state | query-param filter/sort effects and view URL hooks | query, availability, category, capability, cursor, and active comparison are recoverable market state |
| Body dispatch | `RecordIndexContainer.tsx` and table/list/board/calendar containers | one Operation-specific browse/results/comparison dispatch; no CRM view picker |
| Data lifecycle | record-index query/load effects | route projection plus the canonical Operation compare read |
| Selection reset | `PageChangeEffect.tsx`, `useResetRecordIndexSelection.ts` | clear local draft selection whenever the result-set URL changes |
| Return context | record-show pagination and previous-row scroll effect | browser history and visible Back/Edit preserve the exact market context and recover focus |

Active binary gate:

- Production `/market` wires C06 to canonical comparison data.
- Exact deduplicated 2–4 refs preserve order and round-trip through reload, Back, Forward, and direct URL entry.
- Compare is a pushed history milestone; returning cannot create a history loop.
- Dataset-changing query/filter/category/capability/cursor transitions clear incompatible draft and active selection.
- Only canonical price, readiness, effects, and data-use facts render, with Provider-qualified identity and one Inspect link per Operation.
- Pending, empty, catalog unavailable, invalid/stale comparison, Operation unavailable, and transport failure remain distinct and truthful.
- Focus moves into comparison and returns to a meaningful selection/result control; C01–C06 keep ownership of primitives and mechanics.
- Desktop/mobile have no page overflow or obscured last row; motion stays restrained and reduced-motion safe.

Twenty references: `packages/twenty-docs/images/user-guide/home/main-layout.png` for full-page hierarchy and `packages/twenty-docs/images/releases/1.8/1.8-bulk-select.png` for selection-to-action continuity. Twenty has no literal comparison-result screen, so both references remain explicit rather than implying a false one-to-one screen match.

Evidence:

- `/market` now validates an ordered, deduplicated two-to-four Operation comparison in URL state, loads canonical comparison facts on the server, and wires the C06 tray into production navigation.
- Direct entry, reload, browser Back/Forward, visible Back, and Edit selection were exercised against the running development app and its local Convex database. Edit restores the two selected Operations without discarding the last recoverable comparison URL; visible Back preserves the query and restores focus to Catalog without adding a history loop.
- The comparison renders only canonical price, readiness, data use, and effects, with Provider-qualified identity and an Inspect continuation for each Operation. Desktop and mobile keep dense tables in internal horizontal scrollers without page overflow.
- Round 1 source/behavior verdict: **AE**. Round 1 screenshot verdict: **TWENTY** because the editorial footer entered the short task surface and appeared behind the mobile compare tray.
- Round 2 keeps both results and comparison workspaces at least one dynamic viewport high. Live measurements place the footer below the viewport on short comparison states and below the complete result set while selection is active.
- Round 2 live screenshots: `output/gauntlet/v01/ae-live-market-selection-desktop-round2.png`, `ae-live-market-selection-mobile-round2.png`, `ae-live-market-comparison-desktop-round2.png`, and `ae-live-market-comparison-mobile-round2.png`; all use the actual development database. No screenshot runner or gauntlet `.mjs` file remains.
- Checks: 39/39 focused tests; focused lint; UI-contract gate; production build; diff check. Repository typecheck is blocked only by the unrelated concurrent `operator-route-error-reload` promise return mismatch.
- Final source/behavior verdict: **AE**. Final screenshot verdict: **AE**.
- V01 final verdict: **PASS**.

## V02 — Operation detail

### Literal module map and active gate

| Concern | Twenty source | AE target |
| --- | --- | --- |
| Canonical route | `RecordShowPage.tsx`, `RecordShowPageHeader.tsx`, `RecordShowPageTitle.tsx` | `/operations/$operationRef` remains the one exact-Operation URL and composes the shared inspector |
| Shared full/compact body | `PageLayoutRecordPageRenderer.tsx`, `SidePanelRecordPage.tsx` | one `AeOperationInspector` and `toOperationInspectorModel`; chrome and density vary, truth and continuation do not |
| Record hierarchy | `PageLayoutRenderer*`, `FieldsWidget*`, `WidgetCard*` | decision facts first, exact contract second, technical evidence last; shadcn owns card/disclosure mechanics |
| Canonical read | `RecordShowEffect.tsx`, record loading state | route loader re-reads the opaque ref and active buyer-access state, fails closed, and never exposes stale prior facts |
| Parent continuity | `useRecordShowPagePagination.ts`, record-side-panel expand/navigation hooks | browser history plus an explicit return preserve the exact incoming market query/comparison context |
| One safe action | `SidePanelFooter.tsx` and record command actions | one state-valid controlled-call/connect/alternative continuation; no direct provider call |
| Focus and scroll | page-layout scroll reset and record transition state | successful SPA entry/ref change focuses the h1 or main record region; return restores the initiating market control where possible |

Active binary gate:

- Direct entry, reload, Back, and Forward preserve the exact Operation identity; a known market origin survives the visible return action, while a genuine deep link falls back to the default catalog.
- Unknown/malformed, unavailable, and source-unavailable states are distinct and fail closed with no price, evidence, schema, readiness claim, or call command.
- Ready, connection-required, setup-required, unavailable, and read-failure states each expose exactly one safe primary continuation.
- Full and compact variants agree on price, readiness, access, terms, evidence, and the exact opaque reference because `toOperationInspectorModel` remains the sole decision projection.
- Mobile puts the safe continuation before long contract sections; desktop keeps it subordinate and sticky. Neither layout duplicates the CTA or overflows the page.
- Pending content is detail-shaped; disclosure uses existing shadcn mechanics and AE motion tokens with reduced-motion support.
- No inline editing, relation graph, timeline, arbitrary record layout, previous/next CRM record controls, or other CRM scope enters AE.

Twenty references: `packages/twenty-docs/images/user-guide/home/side-panel.png` for retained parent context and action separation; `packages/twenty-docs/images/releases/0.3.2_new_layout.png` only for bounded full-record geometry and density because the image predates the pinned source.

Final evidence:

- Actual local Convex detail reads exercised `Chain Pending` in setup-required state and `Eckari` in routeable/connection-required state. Direct entry, reload, explicit return, browser Back, and browser Forward preserved exact identity and comparison state.
- Catalog rows and comparison Inspect links carry a bounded local return context. Typed `/market` navigation restores it; malformed/external origins are discarded, and genuine deep links fall back to the default catalog.
- Malformed refs are rejected before catalog or buyer-access reads. Invalid, unknown, unavailable, and source-unavailable states fail closed without commercial facts or invocation UI.
- One shared inspector/model drives compact and full truth. Its single continuation precedes long contracts on mobile and occupies the subordinate desktop column. Full and compact entry focus their record regions.
- Screenshot round 1 found a real compact-mobile max-content overflow. The shadcn-backed fact list now stacks to one mobile column and remains two columns on desktop; round 4 is the accepted mobile evidence.
- Final screenshots: `output/gauntlet/v02/ae-live-operation-detail-desktop-round1.png`, `ae-live-operation-detail-mobile-round1.png`, `ae-live-operation-connection-required-desktop-round1.png`, `ae-live-operation-connection-required-mobile-round2.png`, `ae-live-operation-invalid-desktop-round1.png`, `ae-live-operation-invalid-mobile-round1.png`, `ae-live-operation-compact-desktop-round2.png`, and `ae-live-operation-compact-mobile-round4.png`.
- Direct Twenty/AE sheets: `output/gauntlet/v02/twenty-vs-ae-compact-round2.png` and `twenty-vs-ae-full-round1.png`. Browser trace: `/Users/joelchan/.config/browser-harness/agent-workspace/recordings/ae-v02-live-gauntlet` (40 frames).
- Checks: production build, repository typecheck, focused lint, UI contract, module/route boundaries, and 82 focused tests pass. No gauntlet `.mjs` file exists.
- Final source/behavior critic verdict: **PASS**. Final screenshot critic verdict: **PASS**.
- V02 final verdict: **PASS**.

## V03 — Command modal workflow

### Literal module map and final gate

| Concern | Twenty source | AE result |
| --- | --- | --- |
| Entry and shell | `CommandMenuOpenContainer.tsx`, `CommandMenuForMobile.tsx` | one centered shadcn/Radix `Dialog` on every viewport; the user-locked desktop-modal divergence never becomes a sheet |
| Keyboard contract | `useCommandMenuHotKeys.ts` and command-menu Escape handling | capture-phase `⌘/Ctrl+K`, `/`, and Escape ownership with repeat, composition, modifier, and text-entry guards |
| Search and selection | command-menu item rendering and keyboard navigation | shadcn `Command` owns filtering, active selection, keyboard movement, and empty state over canonical Operation search results |
| Inspect history | side-panel router, history, top bar, and focus hooks | provider-owned root/search/inspect state preserves the query and selected result without importing Twenty's general command router |
| Exit and continuation | side-panel close, expand, and navigation actions | inspect→search→clear query→close is the exact Escape ladder; any route continuation closes and resets the next opening |
| Focus | command input and side-panel focus management | open focuses search, inspection focuses its labelled region, Back restores the result workflow, and close restores the invoking control through Radix |

Final gate and evidence:

- `/` opens only from a non-text-entry target, `⌘/Ctrl+K` toggles, repeat and IME events are ignored, and the capture-phase seam resolves Escape before Radix or lower-level hotkeys can skip a rung.
- A live `Chain` query produced canonical development-database results, preserved the non-first keyboard selection through inspection, and exercised `Chain Pending` in its real setup-required state.
- The exact three-rung Escape ladder passed in the browser: inspect returns to the same query/results, search clears to root, and root closes. Full details, Browse current Operations, and controlled continuations close and reset the provider before navigation.
- The command workflow remains a centered modal at 1600×1000 and 390×844. The compact inspector scrolls internally, keeps its continuation reachable, and has no mobile overflow.
- Final screenshots: `output/gauntlet/v03/ae-command-workflow-desktop-search.png`, `ae-command-workflow-desktop-inspect.png`, `ae-command-workflow-mobile-search.png`, and `ae-command-workflow-mobile-inspect.png`.
- Literal comparison sheets: `output/gauntlet/v03/twenty-vs-ae-search.png` and `twenty-vs-ae-inspect.png`. Browser trace: `/Users/joelchan/.config/browser-harness/agent-workspace/recordings/ae-v03-live-gauntlet` (142 frames).
- Checks: 46/46 focused tests, command-panel 29/29, repository typecheck, production build, focused lint, UI contract, import boundaries, and diff check pass. No gauntlet `.mjs` file was created.
- Final source/behavior critic verdict: **PASS**. Final screenshot critic verdict: **PASS**.
- V03 final verdict: **PASS**.

## V04 — Owner Operation inventory

- Twenty source map: `RecordIndexPage`, `RecordIndexContainerGater`, `RecordIndexTableContainer`, `RecordIndexViewBar`, `RecordTableEmpty`, `RecordTableBodyLoading`, plus the record-row focus and hotkey modules in the pinned checkout `/tmp/ae-twenty-ui.MECSaG`.
- AE mapping: the owner Operations route composes the shared operator shell, `AeOwnerOfferingsList`, shadcn `Table`/`Button`/`Badge`, TanStack Table state, and Radix roving focus. CRM saved views, object switching, imports, field configuration, alternate boards/calendars, bulk mutation, side panels, and speculative virtualization remain deliberately excluded.
- Behavior gate passed: stable first-load shell and table skeleton; compact sortable/filterable Operation rows; one native Open link in the roving tab order; filter, sort, and focused-row restoration across detail navigation; truthful true-empty, filtered-empty, source-error retry, unreadable-revision, projection-pending, and refresh states; local fixed-owner authority materializes before live source reads.
- Live local Convex proof used five actual mixed-state Operations (Draft, Paused, Published, Retired) with real access-route counts. Desktop filter/sort/keyboard focus, detail round-trip restoration, clear-filter recovery, and projection refresh were exercised against the development database.
- Desktop screenshots: `output/gauntlet/v04/ae-owner-operations-desktop-populated.png`, `ae-owner-operations-desktop-filter-focus.png`, and `ae-owner-operations-desktop-filter-empty.png`.
- Mobile screenshots: `output/gauntlet/v04/ae-owner-operations-mobile-populated.png` and `ae-owner-operations-mobile-populated-right.png`. At 390×844 the document has no horizontal overflow; only the 336 px table viewport scrolls across its 511 px content, with five rows and exactly one tabbable row action.
- Literal comparison: `output/gauntlet/v04/twenty-vs-ae-owner-operations.png` against `output/gauntlet/c05/twenty-record-table-reference.png`.
- Navigation retention proof after the focus-control fix: 120 list/detail/back cycles retained one document, 415 nodes, 309 listeners, and about 52 MiB heap. The final isolated screenshot run ended at one tab, one document, 769 nodes, 171 listeners, and 48.58 MiB heap before teardown.
- Checks: 33/33 focused tests, repository typecheck, focused zero-warning lint, UI-contract test, production build, React Doctor 85/100, and diff check pass. No gauntlet `.mjs` file was created.
- Final source/behavior critic verdict: **PASS**. Final screenshot critic verdict: **PASS**. The critic found AE preserves Twenty's transferable stable-shell, dense-table, truthful-state, and focus contracts while correctly excluding CRM-only machinery.
- V04 final verdict: **PASS**.

## Screenshot protocol

Every round stores a matched pair under `output/gauntlet/<id>/`. Use the same viewport, equivalent data density, equivalent open/selected state, and no crop that hides surrounding context. The critic judges hierarchy, density, geometry, focus/selection visibility, token coherence, and whether motion state lands cleanly. A screenshot cannot override a behavioral or accessibility failure.
