# Frame: aecon current design system audit

## Scope and target

- Scope: current app UI source: all TanStack file-route pages plus their product and shared components; audit style-token drift, component-layer adoption and parity risks. Static API routes and non-visual machine surfaces are not migration surfaces.
- Route source of truth: `src/routes/` contains 155 files, of which 64 are `.tsx` view/layout files. Triage's `routes=1` is corrected; its route scan does not cover this TanStack file router.
- Target system: active aecon contract in `DESIGN.md`, token source `src/styles/globals.css`, component config `components.json`, and local `src/components/ui/`, pinned to current source commit `e1f2b3f59ee785deb114dc195f33c2bda54593e7`. The commit advanced during the audit from `939237d83`; its diff only changes local-dev startup timing and its unit test, not the UI or design-system inputs.
- System status: the local product design contract is active. There is no `.design-system/run.md`, `registry.json`, `ui-drift.tsv`, migration map, or `docs/system/` component/foundation documentation in this checkout. The `@bklit` registry URL in `components.json` is unpinned and is not treated as the current target.
- Pin: source commit `e1f2b3f59ee785deb114dc195f33c2bda54593e7` (`well-30/rebuild-a`), recorded in `inventory/pin.txt`. The shared checkout began with pre-existing untracked `.design-system/boss/triage/` artifacts; they are read-only evidence. No product source is changed by this audit.

## Review depth

- Deep review: the buyer path from `/market` discovery and comparison through admitted Tool detail, command-panel inspection, Quote/Call handoff, and Call receipt/recovery; inspect shared UI components only where that path uses them.
- Static inventory still covers every assigned route/component surface. `market` receives the detailed token map and parity review. `shared` is followed only where it affects the buyer path. Other route groups are reported as coverage gaps from inventory counts; this pass does not claim full IA, interaction, or token parity for them.

## Audit completion predicate

`inventory/current.tsv`, `inventory/counts.txt`, `inventory/pin.txt`, `mapping/market.md`, `parity.tsv`, and this run's `plan.md` exist; every static finding is assigned; repeat scans agree; buyer-path parity gaps and static blind spots are explicit; other route groups are listed as coverage gaps. This is an audit stop at Parity. No baseline, code migration or production enforcement rule is part of this run.

## Defaults

- Parity mode: `mapped`, because authored values and the active semantic token set differ.
- Themes: light and `.dark`, both declared in `src/styles/globals.css`.
- Viewports: 390 and 1280 px, the skill defaults; no browser captures are made in audit mode.
- Budget: this session. Window cap: 1. No workers are required for the read-only audit; the parent run already occupies the remaining agent slots.
- Run branch: none. Keep this audit record untracked in `.migration/2026-09-30-aecon-audit/`; make no branch, commit or product change.
- Pilot recommendation: `market`, because `DESIGN.md` names `/market?view=discover` as the lived reference and `DirectoryHero.tsx` contains clear raw-value/token comparisons.

## Surface split

The queue groups view routes by product area, with shared layout and standalone document rendering separated. Raw API handlers do not count as view routes. The component and route globs in `queue.tsv` are the ownership map; state inventories and runtime parity remain unverified at this audit stage.
