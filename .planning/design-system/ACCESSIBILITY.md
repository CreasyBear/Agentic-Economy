# Accessibility

**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

This is a source-grounded accessibility map of the current working tree, not a
runtime certification. `.planning/BRAND.md` makes accessibility part of the
brand: AA text contrast, visible double focus, semantic tables and headings,
keyboard operation, 44px mobile touch targets, reduced motion, and explicit
loading, empty, error, and recovery states. The observations below distinguish
implemented evidence from behavior that still needs a browser or assistive
technology check.

## Baseline and evidence status

- The intended baseline is AA text contrast, a visible two-part focus
  indicator, semantic document structure, complete keyboard operation, 44px
  mobile targets, respect for `prefers-reduced-motion`, and honest explicit
  state presentation. The relevant locked rules are in `.planning/BRAND.md`
  and `DESIGN.md`.
- The source uses semantic color tokens in `src/styles/globals.css`, including
  the near-black action ink, muted text, blue information channel, and literal
  success/warning/danger states. Exact rendered contrast ratios were not
  measured in this map, so AA compliance is an intent plus token evidence, not
  a verified contrast result.
- Existing automated coverage is narrow. `tests/e2e/a11y/engine-product-a11y.spec.ts`
  checks public home, market, and about navigation, skip-link focus, primary
  keyboard reachability, route continuation, and viewport width. It does not
  constitute an exhaustive check of operator surfaces, forms, dialogs, sheets,
  tables, chat, reduced motion, touch geometry, or contrast.

## Focus styling

**Status: Present in many controls; the required double-focus treatment is not
uniformly verified.**

- `src/styles/globals.css` defines `--ae-focus-ring` as a two-layer shadow:
  `0 0 0 2px var(--ae-bg), 0 0 0 4px var(--ae-fg)`. The same file maps
  `--ring` into the Tailwind theme bridge, and `src/styles/base.css` applies a
  default `outline-ring/50` base style.
- Shared controls have visible focus selectors. The base string in
  `src/components/ui/button-variants.ts` uses
  `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`;
  inputs, checkbox, radio, select, tabs, toggle, badge, and accordion wrappers
  use equivalent ring selectors in `src/components/ui/input.tsx`,
  `src/components/ui/checkbox.tsx`, `src/components/ui/radio-group.tsx`,
  `src/components/ui/select.tsx`, `src/components/ui/tabs.tsx`,
  `src/components/ui/toggle-variants.ts`, `src/components/ui/badge.tsx`, and
  `src/components/ui/accordion.tsx`.
- Public site controls use a visibly separated ring. `[data-ae-site-button]:focus-visible`
  in `src/styles/base.css` sets an outer background-colored ring and an inner
  `var(--ring)` ring; `src/components/ae/website/AeSiteButton.tsx` uses that
  primitive. Site links and icon buttons in `src/components/ae/website/AeSiteNav.tsx`
  and `src/components/ae/website/AeSiteFooter.tsx` use `focus-visible:ring-2`.
- Route and content focus is intentionally managed. `src/components/ae/layout/AePublicShell.tsx`
  and `src/components/ae/layout/AeOperatorShell.tsx` provide a skip link and
  focusable main target; the operator shell focuses the main region after a
  route change. `src/components/ae/layout/AeSection.tsx`,
  `src/components/ae/market/AeMarketComparisonView.tsx`,
  `src/components/ae/command-panel/pages/OperationInspectPage.tsx`, and
  `src/components/ae/market/operation-detail/AeOperationInspector.tsx` use
  `tabIndex={-1}` focus targets for navigation or newly opened content.
- The double-focus token itself is not consumed by the inspected component
  styles: a search for `--ae-focus-ring` finds its definition in
  `src/styles/globals.css`, while controls generally spell out ring utilities
  or use `focus:ring-*`. This makes the intended central treatment easy to
  drift from. `Dialog` and `Sheet` close buttons in `src/components/ui/dialog.tsx`
  and `src/components/ui/sheet.tsx` use `focus:ring-2` rather than
  `focus-visible` and do not carry a 44px size class.
- **Unverified/gap:** visual focus contrast and the two-layer appearance have
  not been checked in a browser at every surface, especially operator sidebar,
  Radix overlays, table roving focus, and dark-on-ink public sections. A future
  control should use the existing focus contract rather than inventing a local
  shadow or relying on hover.

## Keyboard operation

**Status: Strong patterns exist; complete route and modal coverage is not
verified.**

- `src/components/ae/command-panel/useCommandPanelHotKeys.ts` installs a
  capture-phase keydown handler with guardrails for default-prevented,
  repeated, composing, and text-entry events. It supports Cmd/Ctrl-K to toggle,
  `/` to open outside text entry, and Escape to close or pop a command-panel
  layer.
- `src/components/ae/command-panel/AeCommandPanel.tsx` exposes the shortcut in
  the trigger, focuses the catalog input on `/`, gives the dialog a title and
  description, and makes Back and Close real buttons. The panel's Escape
  behavior preserves the search/inspection stack rather than abandoning the
  user in an intermediate state.
- `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`,
  `src/components/ui/alert-dialog.tsx`, `src/components/ui/tabs.tsx`,
  `src/components/ui/select.tsx`, `src/components/ui/accordion.tsx`, and
  `src/components/ui/toggle-group.tsx` wrap Radix primitives. Their focus
  trapping, roving, disclosure, and escape behavior is delegated to those
  primitives rather than hand-built in feature components. The dialog and
  sheet content wrappers also set `aria-modal="true"` and provide titled,
  screen-reader-only close labels.
- The sidebar has a documented Cmd/Ctrl-B shortcut in
  `src/components/ui/sidebar.tsx`; the operator data table uses
  `@radix-ui/react-roving-focus` in `src/components/ae/operator/AeOperatorDataTable.tsx`
  for row actions, and sort controls are native `Button`s with labels such as
  `Sort by {label}`.
- Forms expose familiar keyboard paths. `src/components/ui/inline-edit-field.tsx`
  supports a native form submit, an Escape cancel path, auto-focus on edit, and
  disabled Save/Cancel controls while busy. `src/components/ae/operation-chat/OperationComposer.tsx`
  submits on Enter when not composing and preserves Shift+Enter for multiline
  input.
- Public and operator shells provide keyboard skip links. `src/components/ae/layout/AePublicShell.tsx`
  has `Skip to content`, and `src/components/ae/layout/AeOperatorShell.tsx`
  focuses `operator-main-content` after navigation. `src/components/ae/layout/AeSiteNav.tsx`
  uses actual links with `aria-current="page"`, while
  `src/components/ae/layout/AeOwnerMobileNavigation.tsx` uses a labeled `nav`
  and 44px link targets.
- `src/components/ui/input-group.tsx` gives `InputGroupAddon` an `onClick`
  convenience that focuses its input, but the addon is a `div role="group"`
  with no separate keyboard activation path. Its contained button and input
  remain keyboard reachable; the click-only convenience is not itself a
  keyboard operation.
- **Unverified/gap:** the existing a11y E2E file checks public navigation and
  a small number of controls, but there is no source evidence here of a full
  keyboard pass through operator forms, every dialog/sheet close and focus
  return, command-panel search and inspection, or all mobile navigation states.

## Semantic structure

**Status: Good shell and data semantics with a few primitive-level caveats.**

- `src/components/ae/layout/AePublicShell.tsx` renders a `header`, `main`, and
  public footer; `src/components/ae/website/AeSiteNav.tsx` renders labeled
  `nav` elements. `src/components/ae/layout/AeOperatorShell.tsx` renders an
  operator header/sidebar/inset main arrangement and exposes a skip target.
- `src/components/ae/layout/AeSection.tsx` uses `<section aria-labelledby>` and
  a real `<h2>`. `src/components/ae/layout/AePageHeader.tsx` and
  `src/components/ae/layout/AeRecordHeader.tsx` use real `<h1>` headings.
  `src/components/ae/website/AeSiteHeading.tsx` allows an explicit `h1`, `h2`,
  or `h3` tag; callers remain responsible for a coherent hierarchy.
- The market table is a real table rather than a visual grid. The `AeOperationTable`
  composition in `src/components/ae/market/AeOperationTable.tsx` delegates to
  `src/components/ae/operator/AeOperatorDataTable.tsx`, which renders
  `src/components/ui/table.tsx`'s `<table>`, `<caption>`, `<thead>`, `<tbody>`,
  `<th scope="col">`, and `<td>` elements. Sortable headers expose
  `aria-sort`; mobile content can be supplied separately through the compact
  presentation seam.
- Navigation, actions, and disclosure use semantic elements in the inspected
  paths: `Link`/`a` for navigation, `Button` for actions, native
  `<details><summary>` in `src/components/ae/listing/AeProviderListingPage.tsx`
  and `src/components/ae/supply/AeSupplyAgentProof.tsx`, and Radix triggers for
  tabs/accordion/select/dialog/sheet.
- Content regions are named where needed. `src/components/ae/command-panel/pages/OperationInspectPage.tsx`
  uses `role="region"` and an accessible label; `src/components/ae/operation-chat/ChatTranscript.tsx`
  uses an `article` per turn and a `role="log"` transcript.
- `src/components/ui/field.tsx`'s `Field` and `src/components/ui/input-group.tsx`
  use `role="group"` for grouping. This is appropriate as a wrapper, not as a
  substitute for a label or an interactive control.
- Caveats are visible in the primitives. `EmptyDescription` in
  `src/components/ui/empty.tsx` accepts `React.ComponentProps<"p">` but returns
  a `<div>`, so it does not guarantee paragraph semantics. `CardTitle` and
  `CardDescription` in `src/components/ui/card.tsx` are also neutral `<div>`
  wrappers; callers must provide the actual heading or paragraph where the
  document structure needs one. `Badge` in `src/components/ui/badge.tsx` is a
  styled `<span>` with no implicit status role, so its visible text must not be
  the only way to convey a state.
- **Unverified/gap:** a static source pass cannot prove the heading order after
  all route compositions render, the accessible name of every dynamically
  generated table row, or native semantics after every `asChild` composition.

## ARIA and custom components

- Decorative graphics are consistently hidden. Lucide icons are commonly
  passed `aria-hidden="true"`; the mark in `src/components/ae/layout/AePublicShell.tsx`
  has empty alt text plus `aria-hidden`, and `src/components/ui/marker.tsx`,
  `src/components/ui/site-marker.tsx`, `src/components/ae/website/AeSiteMarks.tsx`,
  and `src/components/ae/website/AeSiteButton.tsx` hide decorative markers,
  geometry, and hover layers. Close icons retain a visible `.sr-only` label in
  `src/components/ui/dialog.tsx` and `src/components/ui/sheet.tsx`.
- `src/components/ui/bubble.tsx` and `src/components/ui/message.tsx` are
  layout/content wrappers and do not assign an accessible name or role to the
  message text themselves. `src/components/ae/operation-chat/ChatTranscript.tsx`
  supplies the semantic `article` names (`You`/`Assistant`) and the transcript
  `role="log"`, which is the correct composition boundary.
- `src/components/ui/message-scroller.tsx` gives its scroll controls an
  assistive label (`Scroll to end` or `Scroll to start`) in `sr-only` text and
  delegates the scroll behavior to its primitive. The transcript adds
  `aria-live="polite"` and `aria-relevant="additions text"` in
  `src/components/ae/operation-chat/ChatTranscript.tsx`.
- `src/components/ui/sidebar.tsx` composes mobile navigation through `Sheet`
  and supplies a screen-reader-only `Sidebar` title and description. The AE
  sidebar in `src/components/ae/layout/AeOperatorSidebar.tsx` uses
  `aria-current`, hidden labels when collapsed, and hidden decorative icons.
- `src/components/ui/inline-edit-field.tsx` gives the edit button and input an
  accessible `label`, hides the icon, and assigns `aria-invalid` plus an error
  description while editing. `src/components/ui/marker.tsx` hides only its
  icon; `MarkerContent` remains exposed text. `src/components/ui/badge.tsx`
  exposes its text but intentionally does not infer a role from a color variant.
- Live regions are used for dynamic changes: `src/components/ae/market/AeCompareTray.tsx`
  announces the selected count; `src/components/ae/layout/AePageHeader.tsx`
  exposes changing metadata as a polite status; copy feedback in
  `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx`
  uses a polite status; and `src/components/ae/offerings/AeOwnerOfferings.tsx`
  uses a hidden polite save announcement.
- **Unverified/gap:** custom wrappers do not automatically supply labels to
  arbitrary children. Every new bubble, badge, marker, scroller, sidebar, or
  `asChild` composition still needs a caller-level accessible name and a check
  that decorative content is not announced twice. `InputGroupAddon`'s click
  handler and the neutral wrapper semantics above are the main places to avoid
  treating a visual container as an interactive control.

## Form labels and errors

**Status: Reusable pattern present; error-to-control wiring remains caller-owned.**

- `src/components/ui/field.tsx` provides `FieldSet`, `FieldLegend`, `FieldGroup`,
  `Field`, `FieldLabel`, `FieldDescription`, and `FieldError`. `FieldLabel`
  wraps the Radix label primitive, and `FieldError` renders `role="alert"`,
  deduplicates repeated messages, and supports a list for multiple errors.
- Real field wiring is visible in `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx`:
  inputs use a matching `id`/`FieldLabel htmlFor`, set `aria-invalid`, and
  connect a description with `aria-describedby`. Select triggers also carry
  the field id. `src/components/ae/market/AeMarketToolbar.tsx` uses
  screen-reader-only labels for search and availability while preserving the
  visible compact toolbar.
- `src/components/ui/input-group.tsx` puts focus and invalid styling on the
  group based on its `data-slot="input-group-control"` child. It forwards
  native input/textarea props through `InputGroupInput` and
  `InputGroupTextarea`, so callers can still provide the actual name, id,
  autocomplete, invalid flag, and description relationship.
- Inline editing is unusually complete: `src/components/ui/inline-edit-field.tsx`
  generates an input and error id, connects the error through
  `aria-describedby`, exposes `aria-invalid`, announces the error with
  `role="alert"`, and disables controls during the save attempt.
- The field primitives do not automatically generate an error id or append it
  to `aria-describedby`. The `SelectField` and `AuthorityField` examples in
  `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx` render an alerting
  `FieldError`, but their trigger is not automatically described by that
  message. This is a documented caller responsibility and should be checked
  whenever a new form is added.
- **Unverified/gap:** the source does not prove that every form route uses a
  visible or screen-reader label, a useful autocomplete/input type, and a
  connected error. Clerk-rendered forms in `src/components/ae/website/AeSiteAuthPanel.tsx`
  are passed through as children and need provider/runtime verification.

## Reduced motion

**Status: Global fallback exists and many animated surfaces opt in explicitly.**

- `src/styles/base.css` changes smooth scrolling to `auto` under
  `prefers-reduced-motion: reduce`, disables site-button hover transforms, and
  applies a global reduced-motion block that reduces animation duration,
  iteration count, scroll behavior, and transition duration for every element
  and pseudo-element.
- Dialogs and sheets explicitly add `motion-reduce:animate-none`; the command
  panel and compare tray additionally set reduced durations in
  `src/components/ae/command-panel/AeCommandPanel.tsx` and
  `src/components/ae/market/AeCompareTray.tsx`. Public nav/footer, site
  markers, route progress, copy feedback, and the operator sidebar use
  `motion-reduce:transition-none` in `src/components/ae/website/AeSiteNav.tsx`,
  `src/components/ae/website/AeSiteFooter.tsx`,
  `src/components/ui/site-marker.tsx`,
  `src/components/ae/layout/AeRouteProgressBar.tsx`,
  `src/components/ae/data/AeCopyCommand.tsx`, and
  `src/components/ui/sidebar.tsx`.
- The shared duration/easing utilities are defined in
  `src/styles/globals.css` (`duration-fast`, `duration-base`, `duration-slow`,
  `ease-standard`, and `ease-emphasized`). New motion should use these and
  remain an acknowledgement of an interaction or state change, not decoration.
- `src/components/ui/alert-dialog.tsx` has open/close animations but no local
  `motion-reduce:*` selector. The global block in `src/styles/base.css` still
  reduces its animation and transition durations, but the exception is less
  explicit than the dialog and sheet wrappers.
- **Unverified/gap:** there is no evidence in this map of a forced-reduced-motion
  browser pass, and third-party/provider-rendered content is outside the local
  CSS guarantee. The `animate-pulse` skeleton in `src/components/ui/skeleton.tsx`
  relies on the global fallback rather than an explicit local selector.

## Touch targets

**Status: Strong mobile convention, with exceptions that need review.**

- `--ae-touch: 44px` is defined in `src/styles/globals.css` and exposed as
  `--spacing-touch`; the corresponding `min-h-touch`, `min-w-touch`, `size-touch`,
  and `h-touch` utilities are used throughout feature code.
- `src/components/ui/button-variants.ts` applies `max-sm:min-h-touch max-sm:min-w-touch`
  to shared buttons. Public buttons in `src/components/ae/website/AeSiteButton.tsx`,
  public nav/icon controls in `src/components/ae/website/AeSiteNav.tsx`, owner
  mobile links in `src/components/ae/layout/AeOwnerMobileNavigation.tsx`, and
  table row actions in `src/components/ae/operator/AeOperatorDataTable.tsx`
  make the target explicit.
- Market search/filter controls in `src/components/ae/market/AeMarketToolbar.tsx`,
  operation tabs/actions in `src/components/ae/market/operation-detail/AeOperationInspector.tsx`,
  chat controls in `src/components/ae/operation-chat/OperationComposer.tsx`,
  and supplier form controls in `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx`
  use `min-h-touch` on compact/mobile paths. The stock `Input` switches to
  `max-sm:h-11` in `src/components/ui/input.tsx`.
- Not every desktop-sized stock control is 44px: the default shared button size
  is `h-9` and the default input is `h-9`, with mobile overrides. This is
  consistent with the compact desktop/operator mode, but mobile coverage must
  be checked at the actual breakpoint.
- The direct Radix close controls in `src/components/ui/dialog.tsx` and
  `src/components/ui/sheet.tsx` use a small icon and focus ring but do not
  explicitly declare `min-h-touch min-w-touch`; they are a concrete touch-target
  exception to review. Other custom icon buttons should follow
  `AeSiteIconButton`'s `size-touch` pattern.
- **Unverified/gap:** static class evidence cannot prove the final hit area
  after caller overrides, browser zoom, safe-area insets, or provider-rendered
  forms. A mobile browser pass should measure the close controls, icon-only
  actions, and every compact table/menu action.

## Loading announcements

**Status: Explicit patterns exist, but `aria-busy` alone is not a universal
announcement.**

- `src/components/ui/spinner.tsx` gives the SVG a `role="status"` and
  `aria-label="Loading"`. Callers can intentionally hide a decorative spinner
  when a surrounding button or live region already supplies the busy message,
  as in `src/components/ae/operation-chat/OperationComposer.tsx`.
- `src/components/ae/layout/AePageState.tsx` provides content-shaped
  `AePageSkeleton` regions with `aria-busy="true"`, a labeled outer region, a
  polite status description when supplied, and `aria-hidden="true"` skeleton
  shapes. `src/components/ae/operation-chat/ChatTranscript.tsx` and
  `src/components/ae/operation-chat/SharedOperationChat.tsx` use a hidden
  status plus `aria-busy` while a thread is initially loading.
- `src/components/ae/command-panel/pages/OperationInspectPage.tsx` exposes
  `Loading operation…` as a status; `src/components/ae/operator/AeOperatorDataTable.tsx`
  marks the table busy for its first-load skeleton; and
  `src/components/ae/layout/AePageHeader.tsx` uses a polite status for changing
  metadata. These patterns keep a refresh from erasing known rows, following
  the cache-aware rule in `src/components/ui/data-state.ts`.
- **Unverified/gap:** not every feature loading state is statically guaranteed
  to include a live text node, and `aria-busy` does not by itself tell all
  screen readers what changed. Each new asynchronous region should include a
  concise status message and keep its skeletons hidden from the accessibility
  tree. No runtime announcement timing was tested here.

## Error, empty, and recovery presentation

**Status: A typed, honest state vocabulary is implemented.**

- `src/lib/ui/ui-state.ts` defines `loading`, `empty`, `draft`, `saving`,
  `saved`, `pending`, `succeeded`, `refused`, `stale`, `unavailable`, and
  `outcome_unknown`. Each state specifies a title, description, tone, role
  (`status` or `alert`), politeness, and safe recovery actions; missing or
  uncertain outcomes are not presented as success.
- `src/components/ae/layout/AePageState.tsx` maps route-level empty/unavailable
  states to a status and failures to an alert through `introRole`. Its title is
  a real `<h1>`. `src/components/ae/feedback/AeEmptyState.tsx` accepts an
  explicit `status` or `alert` role, uses a real `<h2>` and `<p>`, and gives
  recovery actions to the caller.
- `src/components/ui/field.tsx` presents field errors as `role="alert"`;
  `src/components/ae/feedback/AeInlineState.tsx` derives its live role and
  politeness from the shared state; and `src/lib/ui/toast.ts` maps error to
  `alert` while success/info/warning use `status` in the Sonner payload.
- `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx` gives a failed
  page a retry button and a separate Operations navigation action. Route and
  supplier states in `src/components/ae/layout/AePublicRouteStates.tsx`,
  `src/components/ae/layout/AeOperatorRouteStates.tsx`, and
  `src/components/ae/supply/AeSupplyFunnel.tsx` expose retry, reload, recovery,
  or escalation actions with `aria-busy` and disabled behavior where needed.
- `src/components/ui/alert.tsx` always renders `role="alert"`, including its
  default informational variant. That is a deliberate strong-announcement
  primitive, but callers should not use it for routine non-error updates when a
  polite `status` is sufficient. `src/components/ui/empty.tsx` itself does not
  assign a status role; the route or feature composition must do so.
- **Unverified/gap:** no static evidence proves focus moves to the first error
  or failed region, that toast announcements are timed without interruption,
  or that every RFC 9457/server failure is projected into the shared UI state
  vocabulary. Browser and screen-reader checks remain required for those
  transitions.

## Review checklist for new UI

- Use a native `button`, link, form control, heading, table, disclosure, or
  Radix primitive instead of a clickable visual container.
- Provide an accessible name for every icon-only action; hide decorative icons,
  marks, and shape layers with `aria-hidden="true"`.
- Reuse `focus-visible` styles and ensure a visible two-layer indicator remains
  distinct from the surface; do not depend on hover.
- Give fields a real label, stable `id`, `aria-invalid` when invalid, and a
  connected `aria-describedby` for descriptions/errors.
- Give busy regions a concise status announcement; keep skeleton geometry
  `aria-hidden`; distinguish `empty`, `unavailable`, `refused`, and
  `outcome_unknown` from success.
- Preserve keyboard operation, 44px mobile targets, and reduced-motion
  behavior from `src/styles/base.css` and the shared utilities.
- Keep the wording literal and evidence-based: `.planning/BRAND.md` requires
  `Unknown` or `Not measured` when evidence is missing, never a fabricated
  certainty.

<!-- refreshed: 2026-09-01 -->
