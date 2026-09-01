# Design Conventions

**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

This document maps the conventions in the current working tree. `DESIGN.md` is
visual authority; `.planning/BRAND.md` is the locked product and messaging
authority; the implementation is evidence of what is currently shipped in the
repository. The retired `.planning/reference/pre-treg-ui-theme.md` and the
Perplexity/teal system are not sources for new work.

## Token-first rule

- Reuse semantic tokens before writing a new utility value. The header comment
  in `src/styles/globals.css` explicitly makes that file the semantic bridge
  and says that surfaces do not invent their own palettes, type scales, radii,
  or elevation systems.
- Prefer semantic Tailwind classes such as `bg-background`, `text-foreground`,
  `bg-card`, `bg-muted`, `border-border`, `text-muted-foreground`,
  `bg-primary`, and `text-primary-foreground`. Product code also uses the
  mapped status tokens (`bg-success-subtle`, `text-warning-foreground`,
  `text-info`) rather than feature-local colors. Concrete examples are in
  `src/components/ae/market/AeMarketToolbar.tsx`,
  `src/components/ae/operator/AeOperatorDataTable.tsx`, and
  `src/components/ae/feedback/AeInlineState.tsx`.
- The palette rule is one blue information/accent channel plus literal status
  colors. `--ae-brand` in `src/styles/globals.css` is reserved for links,
  selection, focus, and information; `--ae-success`, `--ae-warning`, and
  `--ae-danger` are for actual states and evidence. Actions use near-black
  `--ae-primary`, not the blue accent. This follows the hard constraints in
  `DESIGN.md` and the locked visual identity in `.planning/BRAND.md`.
- Reuse the shared geometry and spacing utilities: `rounded-card`,
  `rounded-nav`, `gap-intra`, `gap-related`, `gap-section`, `p-gutter`,
  `p-page`, `min-h-touch`, `size-touch`, `ae-nav`, and `ae-rail`. Do not add a
  feature-only spacing or radius scale to compensate for a missing token.
- New cross-surface values belong in `:root` and the matching `@theme inline`
  bridge in `src/styles/globals.css`; cross-surface structural primitives
  belong in `src/styles/base.css` or a genuinely reused UI primitive. A value
  needed by only one feature is a design question, not permission to add a
  local palette, radius, shadow, or type system.
- Do not add a dark-mode branch. `src/styles/globals.css` sets
  `color-scheme: light` and has no `.dark` token block. Existing inherited
  `dark:` selectors in stock shadcn classes are not evidence that a new dark
  theme exists.

## CSS-first Tailwind v4

- Tailwind is CSS-first. `components.json` has an empty `tailwind.config`
  value and points CSS at `src/styles/globals.css`; there is no feature
  `tailwind.config` to extend.
- `src/styles/globals.css` declares the layer order
  `reset, theme, base, clerk, components, utilities`, imports the font files,
  `src/styles/base.css`, Tailwind theme/preflight/utilities, and exposes the
  semantic bridge through `@theme inline`. That bridge maps the CSS custom
  properties to `--color-*`, `--font-*`, `--radius-*`, `--shadow-*`,
  `--duration-*`, `--ease-*`, `--spacing-*`, `--max-width-*`, and
  `--min-height-*` utilities.
- The existing `@utility` blocks in `src/styles/globals.css` are the model for
  reusable CSS utilities: `duration-fast`, `duration-base`, `duration-slow`,
  `ease-standard`, `ease-emphasized`, `ae-nav`, `ae-rail`, `min-h-fold`,
  `min-h-fold-hero`, and `min-h-chapter`. Use these utilities instead of
  repeating their declarations in feature classes.
- `src/styles/base.css` owns the reset and cross-surface rules: box sizing,
  page typography, tabular numeric display via `[data-numeric]`, site-button
  construction, scrollbar treatment, and the reduced-motion media blocks.
  Keep structural CSS there only when it is truly global.
- The `--ae-rail` and `--ae-nav` widths are 1080px and 1160px. The spacing
  bridge includes the 44px `--ae-touch` target, the `--ae-nav-stack` sticky
  header offset, and fold/chapter minimum heights. These are CSS tokens, not
  magic numbers to reproduce in a page component.

## Code conventions

### Class composition

- Use `cn` from `src/lib/utils.ts` for conditional and caller-overridable
  classes. It is intentionally small: `clsx` resolves conditional
  `ClassValue`s and `tailwind-merge` resolves conflicting Tailwind utilities.
  The normal pattern is `cn(baseClasses, condition && variant, className)`.
- Keep class names on the component that owns the behavior. For example,
  `src/components/ui/button.tsx` passes `className` through
  `cn(buttonVariants({ variant, size, className }))`, while
  `src/components/ae/market/operation-detail/AeOperationInspector.tsx`
  composes the existing `bg-card`, `min-w-0`, and layout tokens around its
  research and action panels.
- Use state selectors that describe the contract instead of ad hoc React
  booleans in CSS: `focus-visible:*`, `disabled:*`, `aria-invalid:*`,
  `data-[state=...]`, `data-[ui-state=...]`, and `aria-[current=page]` are
  established patterns in `src/components/ui/button-variants.ts`,
  `src/components/ui/toggle-variants.ts`, `src/components/ui/tabs.tsx`,
  `src/components/ae/feedback/AeInlineState.tsx`, and
  `src/components/ae/layout/AeOwnerMobileNavigation.tsx`.
- Transitions should name the properties they change. The base string in
  `src/components/ui/button-variants.ts` deliberately uses
  `transition-[color,background-color,border-color,box-shadow,opacity,scale]`
  instead of `transition-all`. Existing stock primitives may still contain
  upstream `transition-all`; do not extend that exception to new product
  code.
- Decorative icons and geometry are not labels. The established pattern is a
  Lucide icon with `aria-hidden="true"` next to visible text or an explicit
  `aria-label`, as in `src/components/ae/website/AeSiteNav.tsx` and
  `src/components/ae/market/AeMarketToolbar.tsx`.

### Variants and primitives

- Use `class-variance-authority` for a finite variant/size/state matrix. The
  shared button matrix lives in `src/components/ui/button-variants.ts` and
  the toggle matrix in `src/components/ui/toggle-variants.ts`; both export a
  cva value with named `variants` and `defaultVariants`. `src/components/ui/badge.tsx`,
  `src/components/ui/alert.tsx`, `src/components/ui/field.tsx`, and
  `src/components/ui/toggle-group.tsx` show the same approach.
- Keep a variant matrix in a separate kebab-case `*-variants.ts` module when
  it is shared by a wrapper or needs an independently readable contract. Do
  not hide a growing style matrix in a page component.
- Follow the shadcn new-york shape selected in `components.json`: `style` is
  `new-york`, `baseColor` is `neutral`, `cssVariables` is true, and
  `iconLibrary` is `lucide`. The stock primitives in `src/components/ui/`
  preserve `data-slot` attributes and forward native props.
- Wrap Radix primitives rather than replacing their behavior. The wrappers in
  `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`,
  `src/components/ui/tabs.tsx`, `src/components/ui/select.tsx`, and
  `src/components/ui/accordion.tsx` add AE classes and `data-slot` markers
  while forwarding props. Use `asChild`/`Slot.Root` when a link or another
  semantic element must carry a shared visual variant, as shown by
  `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, and
  `src/components/ui/marker.tsx`.
- Preserve the primitive's native element. Use `Button` for an action and
  `Button asChild` for a link; use `Link`/`a` for navigation; use the Radix
  trigger for disclosure, tabs, select, dialog, and sheet behavior. Avoid
  making a styled `div` keyboard-interactive.

## Naming and imports

- Product components under `src/components/ae/` use PascalCase filenames and
  named PascalCase exports. AE-facing components normally carry the `AeX`
  prefix, for example `src/components/ae/market/AeOperationTable.tsx`,
  `src/components/ae/layout/AeOperatorShell.tsx`, and
  `src/components/ae/website/AeSiteButton.tsx`. Existing feature-local names
  such as `OperationChat.tsx`, `ChatTranscript.tsx`, and
  `OperationComposer.tsx` are established exceptions; do not rename them just
  to make a new convention retroactively uniform.
- The shadcn primitive directory follows its own lowercase filename grammar:
  `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`,
  `src/components/ui/input-group.tsx`, and `src/components/ui/inline-edit-field.tsx`.
  Follow that directory's local grammar for a new shared primitive, while
  keeping the exported component symbol PascalCase.
- Shared helpers and variant modules use kebab-case filenames: examples are
  `src/lib/ui/status-presentation.ts`, `src/lib/ui/ui-state.ts`,
  `src/lib/ui/copy-text-to-clipboard.ts`,
  `src/components/ae/market/operation-detail/operation-inspector-model.ts`,
  and `src/components/ui/button-variants.ts`. Hook naming is mixed in the
  current tree: `src/hooks/use-clipboard-copy.ts` is kebab-case while the
  command-panel-local `src/components/ae/command-panel/useCommandPanelHotKeys.ts`
  is camel case. Follow the existing directory precedent rather than adding a
  gratuitous rename.
- The inspected UI and AE component scope uses named exports and no default
  component exports. Barrel exports are used where a feature has a deliberate
  public seam, for example `src/components/ae/market/operation-detail/index.ts`.
- Use the aliases declared in `components.json`: `@/components`,
  `@/components/ui`, `@/lib`, and `@/hooks`. Examples include
  `src/components/ae/market/AeMarketToolbar.tsx` importing UI primitives from
  `@/components/ui/*`, and `src/components/ae/layout/AeOperatorShell.tsx`
  importing shared helpers and shell pieces through `@/` aliases. Use a
  relative import for a same-feature sibling when that is the local pattern,
  as in the operation-detail components and command-panel pages.
- Keep import grouping readable: external packages first, a blank line, then
  aliases and same-feature imports. Existing files contain both semicolon and
  no-semicolon/quote styles (`src/components/ae/market/AeOperationTable.tsx`
  and `src/components/ae/market/AeMarketToolbar.tsx` demonstrate the mix), so
  preserve the file-local formatter style instead of introducing a second
  formatting migration.

## Component states

- Use the shared state vocabulary in `src/lib/ui/ui-state.ts`: `loading`,
  `empty`, `draft`, `saving`, `saved`, `pending`, `succeeded`, `refused`,
  `stale`, `unavailable`, and `outcome_unknown`. Each presentation supplies a
  label, title, description, tone, semantic role, live politeness, and allowed
  recovery actions. Do not invent a visually similar state with a different
  meaning.
- Make loading, empty, error/refused, stale/unavailable, and recovery states
  explicit. `src/components/ae/layout/AePageState.tsx` owns route-level
  status/alert presentation; `src/components/ae/feedback/AeInlineState.tsx`
  renders inline state labels; `src/components/ui/empty.tsx`,
  `src/components/ui/spinner.tsx`, and `src/components/ui/skeleton.tsx` are
  the reusable primitives.
- For list-shaped data, use the cache-aware helpers in
  `src/components/ui/data-state.ts`. An initial uncached load may show a
  skeleton; a refresh with cached rows must keep those rows visible; a
  settled empty result gets an empty state rather than a perpetual spinner.
  `src/components/ae/operator/AeOperatorDataTable.tsx` follows this rule.
- Reflect pending work in both behavior and copy: disable the action while it
  cannot be repeated safely, set `aria-busy` where the region is busy, and use
  a literal action label such as `Checking source`, `Saving`, or `Reloading
  setup…`. Do not display success when the result is `outcome_unknown`.
- Form controls should expose `aria-invalid` and a useful description/error;
  use `Field`, `FieldLabel`, `FieldDescription`, and `FieldError` from
  `src/components/ui/field.tsx` rather than one-off label markup. The concrete
  wiring in `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx` is the
  reference pattern.
- Do not put two normal-state controls on one page that invoke the same next
  action. Keep one next valid action in a decision area and use secondary
  actions only for a genuinely different recovery, navigation, or inspection
  intent. This is a hard constraint in `DESIGN.md`.

## Copy and voice

- Use the product nouns and literal action words locked in `.planning/BRAND.md`:
  `Catalog`, `Operation`, `Supplier`, `Price`, `Ready now`, `Calls`, `Latency`,
  `Rating`, `Activity`, `Usage`, `Access`, and `Publish`. `Operation` is the
  canonical noun; `tool` is acceptable as the familiar browse word, not as a
  second transaction entity.
- Lead with what the user can do. Good patterns already present include
  `Search Operations` and `Inspect the Operation before you connect an agent`;
  keep sentences short, concrete, and technically calm. Explain a mechanism at
  the decision where it matters, not as a first-viewport slogan.
- Preserve evidence classes in copy. Missing evidence is `Unknown` or `Not
  measured`, never an inferred number or implied verification. A payment is
  not delivery; delivery is not Qualified Use; admission is not verification.
  Existing wording in `src/components/ae/market/AeOperationTrackRecord.tsx`,
  `src/components/ae/supply/AeSupplyFunnel.tsx`, and
  `src/lib/ui/status-presentation.ts` shows the evidence-first style.
- Do not use the forbidden first-viewport phrases from `.planning/BRAND.md`:
  `Ask. It gets done.`, `Principal`, `controlled transaction layer`,
  `Market Operation`, or `admitted`. Do not fabricate inventory, popularity,
  ranking, savings, revenue, or live activity.
- Human copy may simplify a machine contract, but it must not change the
  authorization, money, evidence, or execution meaning. Keep identifiers,
  prices, and other alignment-sensitive values in `font-mono`; use
  `font-sans` for interface prose and controls.

## Density and surface rules

- Follow the three modes in `DESIGN.md`:
  - **Public:** generous landing composition, sparse marks, notched primary
    actions, and `font-display` only for public hero/page-level brand
    statements. `src/components/ae/website/AeSiteType.tsx` owns these display
    heading/body roles.
  - **Market:** terminal density, plain square rows, aligned numeric values,
    hairlines, and progressive detail. `src/components/ae/market/AeOperationTable.tsx`
    delegates to the semantic table in
    `src/components/ae/operator/AeOperatorDataTable.tsx`; do not replace this
    relationship with generic card grids for dense data.
  - **Operator:** quiet work surfaces with persistent navigation, compact
    controls, `font-sans` interface text, and `font-mono` values. Brand display
    type does not enter forms, tables, command surfaces, or operational status.
- Use only canvas, sunken work area, and raised surface. Prefer whitespace,
  then a hairline, then elevation when an object must sit above its surroundings.
  `src/components/ui/card.tsx` supplies a real `rounded-card`/`shadow-soft`
  raised surface; use it for a self-contained task or actual elevation, not as
  a default wrapper around every row.
- Market rows and tables are structural and square. Cards are appropriate for a
  real task boundary such as a modal, compare tray, receipt, or execution panel.
  Never place a bordered card inside another bordered card only to group text;
  use spacing or a divider instead.
- Keep content rails on the existing `ae-nav`/`ae-rail` utilities and use the
  shared spacing tokens. Do not solve density with giant whitespace, ticker
  treatment, decorative dashboard panels, gradients, glass, tilt, or perpetual
  motion; those are explicitly excluded by `.planning/BRAND.md` and `DESIGN.md`.

## Adding new UI

1. **Inventory first.** Check `src/components/ui/` for a shadcn/Radix
   primitive, `src/components/ae/` for an existing product composition, and
   `src/lib/ui/` for a state, status, formatting, or copy helper. Reuse the
   existing seam before creating another one.
2. **Choose the layer.** Put a shared primitive in `src/components/ui/` and
   follow its lowercase shadcn filename, a feature composition in the owning
   `src/components/ae/<feature>/` directory with a PascalCase file, and a
   cross-surface pure helper in `src/lib/ui/`. Keep route composition in
   `src/routes/`; do not hide route behavior in a visual primitive.
3. **Check the second-use rule.** `DESIGN.md` prohibits a new visual primitive
   without a second real use. If one surface needs a one-off arrangement,
   compose existing primitives locally. Promote it only when two real current
   surfaces need the same visual and behavioral contract.
4. **Use the existing contracts.** Compose classes with `cn` from
   `src/lib/utils.ts`; use a dedicated cva module for a finite reusable
   variant matrix; forward props and keep `data-slot`; wrap Radix behavior
   rather than hand-building dialog, disclosure, menu, tabs, or select logic.
5. **Use semantic tokens and states.** Start with the semantic classes and
   spacing utilities exposed by `src/styles/globals.css`; add a global token
   only when it is cross-surface and add it to both `:root` and `@theme inline`.
   Specify loading, empty, error/refused, unavailable/stale, success, and
   recovery behavior before styling the happy path.
6. **Close the accessibility contract.** Use native elements, explicit labels,
   `aria-invalid`/`aria-describedby` for field errors, `aria-busy` for busy
   regions, visible focus, 44px touch sizing on compact controls, and the
   reduced-motion utilities already used in `src/styles/base.css`. Decorative
   geometry and icons must be hidden from assistive technology.
7. **Keep copy and actions honest.** Use the nouns and evidence rules in
   `.planning/BRAND.md`, expose `Unknown`/`Not measured` when the source is
   missing, and provide one clear next valid action without duplicate CTAs.

<!-- refreshed: 2026-09-01 -->
