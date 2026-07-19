---
name: ae-design-system
description: Use for AE visual or UI changes. Apply DESIGN.md through Astryx neutral primitives, the semantic token bridge, complete interaction states, accessibility, and current-product claim boundaries.
---

# AE interface work

Read `DESIGN.md` completely before editing. For product meaning and maturity,
read the relevant part of `PRODUCT.md`. Inspect the existing surface, its Astryx
imports, `src/styles/globals.css`, and its UI-contract or browser coverage.

## Loop

1. Name the customer task, result, unknown, and next valid action the surface
   must make clearer.
2. Compose from `@astryxdesign/core` with
   `@astryxdesign/theme-neutral`. Use Tailwind 4 only for layout glue and the
   semantic bridge in `src/styles/globals.css` for shared visual values.
3. Add the complete state set that applies: hover, focus, active, disabled,
   loading, empty, error, blocked, reconciliation, and reduced motion. Preserve
   keyboard access, persistent labels, non-colour status cues, responsive
   structure, and practical 44px targets.
4. Inspect the rendered narrow and wide states. Use clearly labelled mock data
   only in development/test surfaces; never present fake providers, prices,
   reviews, activity, or outcomes as real.
5. Run `npm run test:ui-contract` and the smallest relevant Playwright spec
   under `tests/e2e/`. Run `npm run test:a11y` only when the accessibility suite
   scope is warranted. Record unrelated broad failures without turning them
   into a redesign loop.

The loop is complete only when every changed interaction state is inspectable,
the rendered hierarchy matches `DESIGN.md`, and the focused checks cover the
changed behavior.

## Composition rules

- Reuse an Astryx primitive or an existing Astryx adapter under
  `src/components/astryx/` before adding a composition.
- Existing behavioral `Ae*` modules may be reskinned, but do not add or extend
  bespoke `Ae*` presentation primitives, shadcn/Radix/CVA wrappers, handwritten
  CSS files, fontsource fonts, or retired Daylight assets.
- Keep routes thin. Domain behavior stays in modules; a host or route projects
  source-owned state and does not invent business rules.
- Lead with ordinary customer tasks and decisions. Keep graphs, digests,
  bindings, protocol terms, and proof vocabulary in technical disclosure or
  protected diagnostic surfaces.
- Approval shows exact scope before action and remains separate from execution.
  Overall progress must not hide unresolved or externally owned work.

Astryx neutral is the active system. The permitted palette and motion values
live in `src/styles/globals.css`; do not create a route-local palette or a
parallel brand layer.
