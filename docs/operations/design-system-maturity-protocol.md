# Design System Maturity Protocol

**Date:** 21 September 2026
**Status:** Approved operating manual for `DS-01`–`DS-39`. Read this file first after compaction.
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `DESIGN.md`, `AGENTS.md`, `docs/designs/2026-09-21-design-system-iceinvein.md`, `docs/operations/design-system-maturity-register.md`

This is a **design-system campaign**. It harvests the whole app onto the frozen `/market?view=discover` grammar. It is not a two-page restyle.

---

## 1. Anti-compaction invariants

1. **Single visual law.** Discover source + tokens in `src/styles/globals.css`. Feature files do not invent type, weight, radius, shadow, or duration.
2. **Kit first, pages second.** Rematerialize `AeSite*` and Tier 1 so consumers move together. Do not restyle one hero by sprinkling utilities.
3. **Two dialects, one system.** Editorial (public): ExtraLight display, collection rails, listing cards. Compact (operator): same tokens and section grammar at workbench scale; no 7xl hero; no second weight/radius language.
4. **Discover files are frozen.** Visual classes on `DirectoryHero.tsx`, `DirectoryHomeDiscovery.tsx`, and `DirectoryToolCard.tsx` change only if a swap is proven identical (guard test).
5. **Composition is in scope.** Hero + kicker/title/deck + object rail is the page pattern. Centered marker-heroes and `01` box grids are defects.
6. **Contract only tightens.** `scanUiContract` and token-parity grow rules. Never drop a raw-colour or `transition-all` ban.
7. **Sibling-of-discover feel gate.** A token-perfect page that still reads as another product is not `VERIFIED`.
8. **Structure stays except one-shell.** Compound folders, Base UI APIs, and leaf purity are not redesigned. Frame ownership is in scope (`DS-35`–`DS-38`): one application shell; pages supply content and task controls. `S-01`–`S-20` persistence, skeleton geometry, ⌘K/⌘B, toast, and safe-area stay closed.
9. **Evals are evidence, not vibes.** A workflow without Layer A commands, and a human surface without Layer B case IDs + Layer C verdict, is not `VERIFIED`.
10. **Skills are artifacts.** Naming a skill without loading its file and producing its required output is a failed stage.

**Discover-legal (do not ban):** uppercase medium eyebrow without marker; ExtraLight display; collection `font-medium`; card title `font-semibold`; `rounded-full` pills; card hover lift (`-translate-y-1` + `shadow-float`).

**Craft-floor override:** `impeccable` craft-floor bans kickers. Discover SoT has them. The brief wins. Composer must not delete discover-legal eyebrows. The ban that remains: `SiteMarker` / `AeSiteMarker` as a product eyebrow.

### Closed campaigns this protocol must not reopen

| Closed work | IDs | Stay closed |
| :--- | :--- | :--- |
| App shell | `S-01`–`S-20` | Chrome persistence, route skeleton geometry, global hotkeys, toast/safe-area. **Not** a ban on one-shell frame ownership (`DS-35`–`DS-38`). |
| Base UI cutover | `B-01`–`B-27` | Headless engine, `asChild`, Radix removal |
| Code quality | `CQ-*` / `CQ2-*` / `CQ3-*` | Leaf purity, façades, barrels, file ceilings |
| User/org functional | `W-01`–`W-44` | Auth, tenancy, billing behaviour |

No ledger, admission, or RPC changes. No new font, gold, Storybook, or `impeccable overdrive`.

**Jev stays out.** `tools/dev/eval-jev-*.ts` and `tests/eval/jev-*.test.ts` assess matching intelligence. This campaign steals Jev's *shape* (frozen cases, reports, never overwrite, harness contracts) and scores sibling-of-discover grammar.

---

## 2. Six-stage subagent lifecycle

Every `DS-*` workflow traverses these stages. No skipping.

```text
STAGE 1  Grok     Research: live discover + SoT files + wave skill pack (files, not memory)
                  Output: design-taste brief + skill citations (skill#heading)
STAGE 2  Grok     Seam scout: recipe inventory vs discover grammar
                  Output: mapping, compile-ready classes, file budget, What NOT to Touch,
                          tests-to-add-first (Layer A assertions)
STAGE 3  Parent   Freeze brief, budget, invariants, required eval case IDs, required skills.
                  Reject new worlds. Reject a brief with no skill file citation.
STAGE 4  Composer Bounded harvest. Layer A ratchets before the harvest they enforce.
                  Load craft-floor (with discover override) + wave skills before first edit.
STAGE 5  Parent   Layer A commands + Layer B/C when the ID is a human surface + Gate 6 feel.
                  Max two fix dispatches. Composer gate claims are not evidence.
STAGE 6  Parent   Provenance: Grok uuid, Composer uuid, skills loaded, eval paths, FEEL.
                  READY → VERIFIED.
```

A Grok run with no discover citation **and** no `skill#heading` citation has not finished Stage 1. Combined Stage 1+2 is allowed only if both outputs are complete.

**Grok** (`cursor-grok-4.6-high-fast`): read-only. Tools: Read, Grep, Glob. No edits, no git.

**Composer** (`composer-2.5`): edits only the frozen file budget. No new packages.

**Orchestrator** (parent): independent measurement. Missing skill artifact or missing eval path blocks `VERIFIED` even if lint is green.

### Grok Stage 1 template

```markdown
You are STAGE 1 of the Design System Maturity Protocol.
Workflow: {DS-ID} ({TITLE})
Dialect: editorial-discover | compact-discover
Read the files (do not reconstruct):
  DESIGN.md, IceInVein (discover SoT), this protocol §§1–5 and §evals + §skills,
  DirectoryHero.tsx, DirectoryHomeDiscovery.tsx, DirectoryToolCard.tsx,
  design-taste/SKILL.md, impeccable/reference/craft-floor.md,
  the wave skill pack files listed on this ID.
  Live /market?view=discover if reachable.
Honor the discover override: uppercase medium eyebrows without marker are legal.
Output a design-taste brief:
  Direction, Density, Surface, Type mood, Motion,
  Do (3–5 with citations), Don't (3–5),
  Citations: at least one discover source path AND one skill#heading.
  Skills loaded: exact paths you Read.
Operator dialect: forbid Persuade theatre (7xl hero, ink panel on routine records).
Read-only.
```

### Grok Stage 2 template

```markdown
You are STAGE 2 of the Design System Maturity Protocol.
Workflow: {DS-ID} ({TITLE})
Surfaces: {PATHS}
Frozen brief: {STAGE_1}
Layer B case IDs this harvest must satisfy: {CASE_IDS or none-kit-only}
Inventory every local recipe (type, weight, radius, shadow, duration, kicker,
centered hero, nested card, 01-grid). Mark token-mapped, kit-mapped, unjustified,
or feel defect (not a sibling of discover).
Output: ### 1 Recipe inventory  ### 2 Kit/token mapping
### 3 Layer A tests to add first (full assertions)
### 4 File budget  ### 5 What NOT to Touch
### 6 Feel risks if this is only a token-wash
### 7 Skills still required at Stage 4/5
```

### Composer Stage 4 template

```markdown
You are STAGE 4 of the Design System Maturity Protocol.
Workflow: {DS-ID} ({TITLE})
File budget: {LIST} — do not edit outside it.
Frozen brief + seam spec attached.
Before the first edit, Read:
  impeccable/reference/craft-floor.md (discover override: do not delete legal eyebrows),
  the wave skill files listed on this ID,
  DESIGN.md.
Sequence: (1) failing Layer A ratchets first (2) rematerialize named kit/primitive
(3) rewire consumers (4) drop local visual utilities (5) keep copy and behaviour
(6) Kowalski press + reduced-motion (7) top-of-file imports, exhaustive switches.
End with: Skills loaded (paths), Layer A commands you ran, files you did not touch.
Do not: new packages, new fonts, restyle the three discover SoT files,
reopen S/B/CQ, change Convex, weaken ui-contract, invent display type in operator,
delete discover-legal eyebrows, run impeccable overdrive/bolder/new-work.
```

---

## 3. Evals programme (first-class, Jev-shaped)

Three layers. Layer A is every ID. Layers B and C are every **human-visible** harvest (Waves 2–3 IDs, Wave 4 close, and any Wave 1 kit that changes a rendered landmark). Kit-only IDs (tokens, scanners) skip B/C but must still land the assertions those layers will use.

```text
Layer A  Mechanical     always          vitest / scan / parity / census ratchet
Layer B  Journey cases  human surfaces  frozen route matrix + browser landmarks
Layer C  Skill jury     human surfaces  better-interface / impeccable critique|audit
Gate 6   Feel           human surfaces  sibling-of-discover rubric (not a screenshot)
```

Persist wave-close and DS-34 reports under `output/ds-evals-YYYY-MM-DD/` the way Jev does: `suite.json`, `REPORT.md`, never overwrite an existing directory. Reruns take a new folder.

### Layer A — Mechanical

Run from this checkout through NVM Node 22, every workflow:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run lint
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:ui-contract
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/styles/theme-token-parity.test.ts
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/eval/ds-grammar.test.ts
```

Existing law in `scanUiContract`: raw colour, `space-x/y`, `transition-all`, hardcoded z, raw overlay, generic `shadow-(sm|md|lg|…)`, `rounded-[`. Never drop a rule.

Wave 1 adds:

- `tools/dev/eval-ds-grammar.ts` — census + SoT freeze + illegal-recipe helpers
- `tests/eval/ds-grammar.test.ts` — harness contracts + ratchet ceilings
- Frozen-string guards on the three SoT files (class strings are law, not defects)
- Discover-legal classes are **allowlisted**, not banned
- Counted ratchets (ceiling, then DS-33 → 0): `font-bold` titles, `SiteMarker` product eyebrows, generic `shadow-md` on product cards, centered `AeSiteHeroIntro` on public journeys
- Token-parity grows for the new type/weight/card/pill bridges

Playwright a11y and shell persistence stay as regression, not as the design score. No screenshot farm. No Storybook.

### Layer B — Frozen journey cases

`tools/dev/ds-journey-cases.ts`. Each case is a labelled surface, not a model prompt:

- `id`, `route`, `dialect` (`editorial-discover` | `compact-discover`), `productJourney` (1–6 from `PRODUCT.md` or `supporting`)
- `sot: true` only for `/market?view=discover`
- `landmarks`: eyebrow / display / deck / rail / card
- `forbidden`: SiteMarker eyebrow, `font-bold` page title, `01` icon grid, generic `shadow-md` card, 7xl hero on operator
- `states`: default, empty, error when the surface has them

**Browser pass** (Orchestrator, desktop + one mobile width): walk the case route; confirm landmarks; hover/focus/active/empty/error. One screenshot is not a pass.

**Source interpolation (authorized 21 September 2026):** Partner deferred live signed-in auth. For remaining operator and signed-in transitions, Layer B is a source walk of the route file, its page container, and every chrome transition (header dests, drawer, sidebar mount, local filters). Interpolated landmarks and forbidden classes count as the case walk. Live visual interpretation is deferred and is not a `VERIFIED` block for compact-dialect IDs. Guest public Layer B already walked on `:3024` stays.

### Layer C — Skill jury

Read-only. Findings are evidence. Implementation stays in a fix dispatch.

| When | Skill | Mode | Blocks VERIFIED |
| :--- | :--- | :--- | :--- |
| Every human-surface ID | `better-interface` | `quick` | `Block` (any HIGH). `Needs changes` must be fixed or recorded as a named deviation within two cycles. |
| Wave close (W1) | `impeccable audit` on kit surfaces | technical 0–4 | Any dimension scored 0–1 |
| Wave close (W2–W4) | `impeccable critique` on the wave's canonical journey | two isolated assessments + snapshot | Degraded banner without reason; or design-specificity = generic dashboard |
| DS-34 | `better-interface` `full` + `rams-design-audit` + `cognitive-load-auditor` | full | HIGH, or Rams "does not earn presence" on a new element, or >4 equal choices on a decide surface |

`better-interface` output must use its real format. An `Approve` that marks a touched domain `Not reviewed` is a failed jury.

### Gate 6 — Feel

Squint for one page moment; forest is jewelry; sibling of discover; primary action names the consequence; Rams — does this earn presence? Token-perfect + `FEEL FAIL` is not `VERIFIED`.

### Self-heal

Two Composer cycles, then halt. Never weaken a contract test. Never skip a skill to go green.

### DS-34 programme close

`output/ds-evals-<date>/REPORT.md` must state Layer A census vs 21 Sep baseline, Layer B matrix, Layer C verdicts, and what the harvest justifies / does not.

---

## 4. Reference library

**Always:** the three discover files + live `/market?view=discover` + `src/styles/globals.css`.

**Also allowed:** aecon.ai material (chalk/forest already in tokens); Airbnb only as already embodied on discover cards; Linear/Stripe Dashboard only as compact-density analogues for operator; Raycast/Dub only for command/keys already in-tree.

**Not allowed:** Dribbble, trading-desk chrome, Twenty 2px restore, a second shadcn theme.

---

## 5. Skill usage (operational, not a bibliography)

Load the **skill file** before the stage writes. Do not reconstruct rules from memory.

### Required artifact per stage

| Stage | Must Read | Required output | Orchestrator rejects if |
| :--- | :--- | :--- | :--- |
| 1 | `design-taste/SKILL.md`, craft-floor (with override), wave pack files | Direction brief + `Citations` including `skill#heading` + `Skills loaded: [paths]` | No path, no Don't list, "I know better-typography" |
| 2 | Same + SoT files | Recipe inventory with `file:line` + Layer A tests-to-add | Inventory without line citations |
| 3 | Parent checks Stage 1/2 artifacts | Freeze includes skill IDs, eval case IDs, file budget | Skill not on this wave's pack; no eval case IDs on a human surface |
| 4 | craft-floor + wave pack **before first edit** | Closing `Skills loaded` + Layer A commands run | Edited first, read later; deleted a legal eyebrow |
| 5 | Layer C skill for this ID/wave | Verdict table or critique snapshot path | "Looks fine"; Approve with HIGH; skipped coverage |
| 6 | — | Register line lists exact skill names, eval commands, output paths | `skills: various` or gates-only provenance |

### Always-on

- `design-taste` — Stage 1 brief shape
- `impeccable` craft-floor — Stage 4 quality floor (**discover eyebrow override**)
- `better-accessibility` — focus, 44px, reduced motion, name/role/state

### Wave pack

- **W1 (`DS-01`–`DS-10`):** `better-typography`, `better-colors`, `better-ui`, `frontend-design-guidelines`
- **W2–W3 (`DS-11`–`DS-29`):** `better-interface`, `better-layout`, `better-writing`, `impeccable` `polish` / `distill` / `typeset` / `layout` as the harvest needs
- **W4 (`DS-30`–`DS-39`):** `emil-design-eng`, `rams-design-audit`, `cognitive-load-auditor`, `better-interface` `full`, `impeccable` `critique`. Shell cluster also loads `better-layout` and `better-interface` `quick` per ID.

### In-bounds impeccable commands

`polish`, `distill`, `typeset`, `layout`, `clarify`, `harden`, `onboard`, `critique` / `audit` on wave close.

### Out of bounds

`overdrive`, `bolder`, `new-work`, `animate` as page-load theatre, `colorize` that adds a second accent, `delight` that adds illustration, `huashu-design`, `brand-design`, `apple-design` as a restyle.

---

## 6. Provenance required on every register line

Surfaces; incumbent baseline; design gap; target spec; references cited; **skills loaded (paths)**; **Layer A commands**; **Layer B case IDs**; **Layer C verdict + snapshot path**; Grok uuid → Composer uuid; gates 1–5; **FEEL PASS/FAIL**; deviations; status (`READY` / `IN PROGRESS` / `VERIFIED` / `DROPPED` / `PARKED` / `RESOLVED (COLLATERAL)`).

Reusable lessons from code quality:

- A wrong census is worse than a smaller wave. Re-measure before Composer.
- Closing scheduled IDs does not make the invariants true. Re-audit at wave close.
- A passing scanner is not presence. Gate 6 exists because CQ-style gates cannot see soul.

---

## 7. Topology

- Tokens live only in `src/styles/globals.css` (`@theme inline`, `:root`, `.dark`). `base.css` stays reset + public-site primitives.
- Tier 1 visual recipes live in `src/components/ui/`.
- Shared product type/spacing primitives that are not shadcn primitives live in `src/components/ae/shared/` or `AeSiteType` for **public** mode.
- Operator/market type must not import public display recipes into forms or tables.
- Feature compounds keep their code-quality folder shape.
- `DESIGN.md` is edited in `DS-01` and in a Wave 4 close note if the re-audit requires a factual correction.

---

## 8. Zero-handroll reminder

1. **Hosted vendor chrome** — Clerk and Stripe stay hosted. Token-bridge only (`clerk-appearance.ts`).
2. **Existing primitives** — Button, Input, Dialog, Table, Card, Empty, Alert. Restyle them; do not fork them.
3. **Reference grammar** — only §4. Not a new moodboard.
4. **AE-owned** — Market composition, Quote consequence naming, purchase-state separation, Australian money readout. Those stay AE-owned. They still consume tokens.
