# Agentic Economy UI system

This is the implementation contract for product surfaces. `.planning/BRAND.md`
owns position and voice; this file owns reusable visual and interaction rules.

## Donor and boundary

Treg `603540f` / v0.12.0 is the structural donor for catalogue, endpoint detail,
agent setup, supplier setup, and account-workspace patterns. Reuse the pattern,
not its source, logo, provider inventory, trademark, or unsupported claims.

The component foundation is the installed shadcn new-york/radix registry. Add or
refresh primitives through the registry. Product components compose primitives;
they do not replace them.

## Tokens

All tokens live in `src/styles/globals.css` and use OKLCH.

- Canvas: warm neutral `#f4f4f1`.
- Surface: white.
- Ink/action: `#1a1a1a`.
- Link/info: `#1a7da6`.
- State only: success `#118453`, warning `#ba6603`, danger `#c0362f`.
- Controls: 10px radius. Cards: 15px. Statuses: pill.
- Shadows: ambient 1–16px layers; data tables may use hairlines instead.
- Inter: interface. DM Mono: data/code. Geist Pixel: primary H1/display only.

Colour never substitutes for hierarchy. Use ink, weight, spacing, and dividers
first. Missing evidence is text, not a decorative neutral badge.

## Layout modules

### Public shell

- Floating 1160px navigation rail.
- Page content normally 1080px with 16–26px gutters.
- First viewport contains a literal job/search action and a working continuation.
- Sections use dividers and shelves; avoid repeated standalone cards.

### Workspace shell

- 230px shadcn Sidebar, collapsible and mobile-sheet capable.
- 57px top bar.
- 1080–1280px content only when data density needs it.
- Overview, Operations, Marketplace, Activity/Usage/Access, Team & settings,
  then role-gated Administration.

### Data regions

- Use Table or a semantic list with column labels.
- Group by capability before exact Operation.
- Keep price, readiness, rating, completed calls, and latency separate.
- Put technical references, methods, paths, prices, counts, hashes, and times in
  mono/tabular text.
- Provide an accessible text/table alternative for every chart.

## Product compositions

Use these before creating another local anatomy:

- `AeMetricGrid`
- `AeFactList`
- `AeStatusBadge`
- `AeEmptyState`
- `AeConfirmDialog`
- `AeOperationCard`
- `AeMarketSourceStatus`
- `AeOperatorDataTable`

If a new pattern repeats on a second surface, extract it into the closest product
composition. Do not create a second alert, confirmation, empty-state, fact-grid,
Operation-card, or table system.

## Core journeys

### Buyer/agent

`Search catalogue → compare exact Operations → inspect price/inputs/evidence →
check access → connect one caller key → call → read activity/cost/recovery.`

### Supplier

`Describe Operation → configure exact contract and price → bind route → test →
publish → manage readiness, usage, settlement, and recovery.`

Every UI destination must sit on one of these journeys or a supporting account /
administrative path. Do not add a dashboard merely because data exists.

## Writing

- Use familiar browse words: tool, category, supplier, price, ready now, calls,
  latency, rating, activity, usage, access, publish.
- Use `Operation` for the exact native contract. Internal `Offering` types may
  remain during migration but must not leak into primary UI.
- One label per destination.
- Put definitions beside unfamiliar evidence, not in the hero.
- Never say verified unless a named verification authority and fact are present.

## Accessibility and motion

- Skip links and focus restoration stay intact.
- Focus is a double ink ring with a canvas gap.
- Preserve 44px mobile touch targets even when desktop controls are compact.
- Tabs, filters, disclosures, dialogs, and Sheets are keyboard operable.
- Use `aria-live` only for meaningful state changes.
- Reduced-motion users get no transform or scrolling theatre.
- Motion is limited to 100–220ms state transitions.

## Prohibited patterns

- Hand-rolled primitives already supplied by shadcn/radix.
- Prestige hero whitespace, ornamental serif, teal wash, gradients, glass,
  ticker marquees, terminal cosplay, tilt, shake, rolling digits, particles.
- Identical floating-card grids for unrelated facts.
- Combined x402 + Agentic Economy totals.
- Fabricated popularity, ratings, savings, revenue, delivery, or Qualified Use.
- Raw DTOs on public pages when a view model can express the decision.

## Change checklist

1. Read this file and `.planning/BRAND.md`.
2. Run `npx shadcn@latest info --json` and the relevant `shadcn docs` commands.
3. Reuse a product composition or document why a new one is required.
4. Keep formatting and presentation contracts in the domain/view-model module.
5. Test loading, empty, error, partial, stale, and recovery states.
6. Run typecheck, targeted tests, UI contracts, build, React Doctor, and live
   keyboard/browser inspection.
