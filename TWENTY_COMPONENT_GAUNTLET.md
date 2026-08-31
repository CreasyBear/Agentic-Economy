# Twenty → Agentic Economy component gauntlet

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
| 5 | C05 | Record table focus/selection/opening | table focus/selection hooks and rows | market and operator tables | extend shadcn `Table`; no second table primitive | Composable focus/selection, consistent opening, correct bulk states and semantics | PENDING |
| 6 | C06 | Compare tray | multi-record selection and bottom action surfaces | market compare selection | shadcn `Card`, `Button`, `Badge`, `Separator` | Persistent count, remove/clear/max behavior, keyboard access, compact responsive layout | PENDING |
| 7 | V01 | Market search and comparison | composed Twenty index/search view | AE market | consume C01–C06 | One URL-recoverable search→compare workflow | PENDING |
| 8 | V02 | Operation detail | composed record-show view | AE Operation route | consume C01–C06 | Evidence hierarchy and one safe continuation without duplicate presentation | PENDING |
| 9 | V03 | Command modal | composed command workflow | AE `⌘K` workflow | consume C01–C06 | Search→inspect preserves context and never becomes a desktop sheet | PENDING |
| 10 | V04 | Owner Operation inventory | composed Twenty table/control view | AE owner inventory | consume C01–C06 | Shared table/control behavior; no CRM scope expansion | PENDING |

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

## Screenshot protocol

Every round stores a matched pair under `output/gauntlet/<id>/`. Use the same viewport, equivalent data density, equivalent open/selected state, and no crop that hides surrounding context. The critic judges hierarchy, density, geometry, focus/selection visibility, token coherence, and whether motion state lands cleanly. A screenshot cannot override a behavioral or accessibility failure.
