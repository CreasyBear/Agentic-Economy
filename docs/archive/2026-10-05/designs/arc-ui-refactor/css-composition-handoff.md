> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Arc CSS and composition polish handoff

**Requested by Joel:** 2 October 2026. **Status:** protocol ready; production CSS unchanged by this side conversation.

## Objective

Complete a source-first audit and polish of all reachable AE components, views, routes and their styles. Standardise page containment, rails, alignment, spacing, padding, class composition and responsive geometry using the actual Arc system. Preserve the distinct authored character of each block. The outcome is coherent pages with deliberate density and clear groupings, not a universal dashboard template.

Use cold `gpt-6-luna` workers at `max` reasoning with `fork_turns=none`. One coordinator plus at most three workers; honour the host's actual capacity. Every worker has one to three explicit primary files and exact instructions. It may read immediate callers, ancestors, token definitions and tests as context. It cannot edit outside ownership, choose a new design, spawn workers, install dependencies or change domain behaviour. Spawn a fresh worker for each atomic task.

## Starting evidence and limits

The side conversation mechanically parsed **110 CSS files**, scanned **507 non-test component/route TSX files**, and found **90 composition stylesheets** at the time of inspection. It collected CSS declarations and literal JSX class usage through PostCSS and TypeScript. Those counts are a snapshot, not a claim that every page was manually or visually reviewed. Rebuild the census from current files before assigning work; the main migration is still changing source.

Current style conventions mix Arc spacing tokens with repeated raw 8/12/16/20/24/32px values. They also mix the declared Arc radius tokens with local 10/12/14/16px radii. These are audit leads, not automatic violations: classify the element's purpose before changing it. Dynamic classes, CSS-module exports, utility-generated tokens, fallback variables and intentional geometry must not become false positives.

No Luna workers were launched from this side conversation. No production components or styles were changed here. Do not assume any earlier CSS-polish assignment exists.

## Skills and authority

Start with local `sluice`, then apply `gestalt-reviewer` for proximity, grouping and alignment, `cognitive-load-auditor` for hierarchy, and `token-mapping` for purpose-based value mapping. Use `complexity-accountant` before adding another wrapper, stylesheet or shared abstraction. Use Arc Pro `page-composition`, `refactor-to-arc`, `responsive-optimization`, `accessibility-audit` and the Arc `checklist` through authenticated MCP. Read actual licensed source for a changed block; never reconstruct Pro source.

Read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md` and `docs/designs/arc-ui-refactor/protocol.md`. The Arc direction takes precedence over superseded legacy visual recipes. Current data, controllers, URLs and tests remain authoritative for behaviour.

The token sources are `src/styles/globals.css`, `src/styles/arc-market.css` and `src/components/arc/foundation.css`. Globals imports the brand bridge, which imports the scoped foundation. Resolve aliases and light/dark overrides before judging a value. Keep visible keyboard focus: AE deliberately overrides Arc's outline suppression. Do not mechanically remove focus treatment.

## Standardisation contract

**Requires:** actual DOM composition, immediate parent/child styles, current typed props, canonical tokens and existing state engines.

**Ensures:** each page has one width/gutter owner; heading, main content and table align; blocks fill the space supplied by their parent; related facts/actions group together; full material values remain readable; narrow layouts do not rely on a desktop width; keyboard position remains visible.

**Invariant:** exact money, identity, authority, privacy, purchase/recovery state, callbacks, route/search/history state, modal focus, pending guards and loading/empty/error semantics remain unchanged. No purchase, payment or connection success is inferred from styling.

**On violation:** preserve existing unavailable/refusal/recovery behaviour. Flag a semantic or controller issue separately; do not silently broaden a CSS task into business logic.

Use the existing 4px spacing scale by role. Default grouping: 8px for tightly related label/help content, 12–16px within a group, 24px between page regions, 32–48px between long-form sections; page gutter 16px on narrow screens and 24–32px where space permits. These are defaults, not a licence to overwrite the actual block's purposeful geometry. Preserve the existing rail maximum unless a specific composition defect requires change. Name the gutter owner in each audit.

Prefer existing `--space-*`, `--radius-control`, `--radius-panel`, `--radius-surface`, typography and semantic colour tokens where their purpose fits. A local value that is deliberate needs a concrete reason. Do not turn every fixed dimension into a new token. Preserve concentric nested radii, real 44px action targets and meaningful control density.

## Full-coverage procedure

1. **Freeze a source snapshot.** Enumerate all component/view/route sources and every CSS file. Record current hashes and map imports, literal/dynamic classes, CSS-module usage and route reachability. Use the existing source inventory as a starting point, never as proof that current CSS is correct. Exclude tests, generated files, build output, examples and dormant code from runtime acceptance; record why.
2. **Audit the shared geometry first.** Trace AppShell, public/operator/chat/settings frames, headers, sections, rails, Drawer/Sheet/dialog portals and shared table/record containers. Identify exactly which element owns width, horizontal gutter, vertical page spacing, scroll and sticky offset. Fix shared defects before multiplying leaf overrides.
3. **Check every style family against real callers.** Cover market/search/comparison/detail; chat/sidebar/composer/Tool results; settings/account/Agents; credits/funding/billing/usage/receipts; Provider/operator; public/support/status/legal/docs. Inspect one populated and one unavailable/loading/empty branch from source for each family.
4. **Classify findings.** Blocking: hidden/clipped action or material fact, broken scroll/focus, overflow or a mis-scoped rule. Should fix: double gutter, drifting alignment, collapsed grouping, conflicting class/selector, unexplained spacing/radius/type variation. Note: legitimate block geometry or a remaining render-only question. Deduplicate shared root causes.
5. **Prescribe, then dispatch.** The coordinator specifies exact selectors/classes, token mapping, padding/gap values, breakpoints and unchanged contracts. Each worker owns only one to three files. Findings include path/line, actual caller/ancestor, cause, smallest patch and the check that establishes it. The coordinator decides design; workers execute it.
6. **Integrate serially.** Recheck the actual patch and DOM/CSS scope. If a file's hash changed after assignment, inspect the concurrent changes and reconcile; never overwrite, restore, stash or reset another worker's work. Avoid files currently assigned by the main migration until ownership is clear.
7. **Verify and close coverage.** Parse styles, run relevant existing component/layout/route tests and `npm run check` on Node 22/npm 11.5.1. Run release types/imports/build after an integrated shared-style batch. Every reviewed family gets `fixed`, `retained with reason` or `render verification pending`; a text scan alone is not manual composition acceptance.

## Checks that must be explicit

- Duplicate rail/max-width/gutter ownership, including inner blocks with their own viewport subtraction.
- CSS root selectors that expect an ancestor `.arc-market` while both classes live on the same element.
- Named container queries that target their own declaring container; query conditions apply through ancestors, so self-styling rules need review.
- Class names missing real definitions, stale styles with zero callers, CSS imports absent for standalone/portal usage, overly broad selectors and utility/CSS specificity conflicts.
- Nested cards/dividers that imply the wrong grouping; headings, controls and record edges that drift off the same axis.
- Fixed/min widths, nowrap, ellipsis, grid/flex shrink rules and overflow that hide references, prices, diagnostics or actions.
- Sticky offsets, viewport-height assumptions, safe-area reserve and scroll ownership.
- Light/dark token alias resolution, focus visibility, touch geometry and reduced-motion handling.

Do not standardise animation, table/filter engines, forms or modal state through a global replacement. Keep authored blocks and existing engines; patch actual geometry and class composition.

## Verification and evidence

This remains **source-first**. Do not start browser/CUA validation until the ongoing source sweep is complete or Joel explicitly requests it. Record pending rendered checks rather than claiming measured alignment, contrast, touch targets or overflow. When visual validation is authorised, use 320/390/768/1024/1440 widths, both themes, long real values and overlays, then remeasure only changed findings.

Run commands with Node 22, for example `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check`. Use existing tests; add coverage only for changed observable behaviour or a clear regression. Pure spacing edits do not need tests that merely mirror CSS declarations. The earlier main-thread check stopped at two chat dependency cycles; recheck current output and distinguish inherited failures from this batch. A build does not establish visual acceptance, and `check` does not replace the required pre-merge `gate`.

Preserve unrelated shared-checkout changes. Do not stage everything, commit/merge automatically, introduce new dependencies or modify domain/schema/API/storage behaviour. The main instance owns integration with the ongoing migration and any merge.

## Progress and completion

Report after each integrated batch: **families reviewed / total**, **styles reviewed / total**, confirmed findings **fixed / open**, and rendered checks **pending / measured**. Keep these separate from the existing Arc migration percentage. A stylesheet counted by a scanner is scanned, not automatically reviewed or polished.

Done means all reachable style families have a concrete reviewed decision, all confirmed in-scope composition defects are fixed and source-verified, common geometry follows the contract, and remaining rendered-only questions are explicitly listed. Do not claim a full visual polish pass while those checks are pending.
