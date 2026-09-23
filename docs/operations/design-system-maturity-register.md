# Design System Maturity Register

**Date:** 21 September 2026
**Status:** ACTIVE — discover-grammar harvest + one-shell frame ownership. `DS-01`–`DS-39`.
**Operating Protocol:** `docs/operations/design-system-maturity-protocol.md`
**Master Design:** `docs/designs/2026-09-21-design-system-iceinvein.md`
**Visual Law:** `/market?view=discover` (`DirectoryHero.tsx`, `DirectoryHomeDiscovery.tsx`, `DirectoryToolCard.tsx`) + `DESIGN.md` + `src/styles/globals.css`
**Measured Against:** current `src/` on 21 September 2026 (593 `.ts`/`.tsx` files under `src/components/ae`, `src/components/ui`, `src/routes`)

Do not reopen `S-*`, `B-*`, `CQ-*`, or `W-*`. Jev evals are out of this campaign.

---

## 1. Progress scorecard

| Wave | Scope | Workflows | Verified | Pending | Target Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **1. Law, tokens, kits, eval harness** | Law + tokens + SoT guards + `AeSite*` + Tier 1 + headers | `DS-01`–`DS-10` | 10 | 0 | `VERIFIED` — live visual deferred |
| **2. Public journeys** | Editorial-discover composition | `DS-11`–`DS-19` | 8 | 0 | `VERIFIED` — `DS-11` parked; `DS-18` named deviation |
| **3. Operator journeys** | Compact-discover dialect on the one-shell | `DS-20`–`DS-29` | 10 | 0 | `VERIFIED` — Layer B is source interpolation |
| **4. IA, one-shell, close** | Names, rail, lift, one frame, ratchet, re-audit | `DS-30`–`DS-39` | 7 | 1 | `IN PROGRESS` — `DS-31` dropped; `DS-39` parked; `DS-34` live SoT still due |
| **Total** | **39 design-system workflows** | **39** | **35** | **1** | `ACTIVE` |

### Opening measurement (21 September 2026)

| Recipe | Files | Hits | Law |
| :--- | ---: | ---: | :--- |
| `text-{xs…9xl}` | 214 | 838 | Tokenize; SoT sizes are legal |
| `rounded-{sm…full}` | 134 | 323 | Role-map; `rounded-full` pills are legal |
| `font-semibold` / `font-bold` | 73 | 106 | Card-title semibold legal; `font-bold` titles are defects |
| Arbitrary box | 92 | 207 | Layout leftovers + hidden visual tokens |

Discover SoT class strings are the law, not defects.

---

## 2. Provenance template (every line)

Surfaces · Incumbent baseline · Design gap · Target spec · References · Skills loaded (paths) · Layer A commands · Layer B case IDs · Layer C verdict · Subagent assignment · Gates 1–5 · FEEL · Deviations · Status

Wave pack:

- W1: `design-taste`, craft-floor (eyebrow override), `better-accessibility`, `better-typography`, `better-colors`, `better-ui`, `frontend-design-guidelines`
- W2–W3: always-on + `better-interface`, `better-layout`, `better-writing`, `impeccable` polish/distill/typeset/layout
- W4: always-on + `emil-design-eng`, `rams-design-audit`, `cognitive-load-auditor`, `better-interface` full, `impeccable` critique

---

# Wave 1: Law, tokens, kits, eval harness

**Stage 3 freeze (Wave 1):** SoT three files out of budget. Leftover Composer cluster was `DS-02`/`DS-04`/`DS-07`/`DS-09`. Discover-legal eyebrows stay.

**Subagents:** Grok Stage 1+2 [Wave 1 scout](fb58900b-45c9-464e-9705-33009e97805a) → Composer [Wave 1 harvest](2e24752e-f673-4b2d-8837-c80a5fafefb2) → Layer C [better-interface quick](7c35eba5-4527-4f1c-83e4-3839104118a8) `Needs changes` (3 MEDIUM, 0 HIGH) → Composer [Layer C fixes](6cf1affd-0925-4dad-9b5a-199b425703ab) → Layer C [impeccable audit](a01b9540-988e-423d-ab04-5f41d4d6ebdb) 15/20, lowest dimension 2.

**Layer A (Orchestrator, Node 22, after Layer C fixes):** lint 0; typecheck 0; deps:check 0/0/0; `test:ui-contract` 2; vitest `ds-grammar` + `theme-token-parity` + `page-header` 19. SoT `git diff --stat` on the three discover files: empty.

**Layer B:** case IDs recorded. Live browser **Not verified** — `127.0.0.1:3024` was not listening. Does not VERIFIED human-surface IDs.

**Layer C verdicts:** `better-interface` quick → `Needs changes` then fixed (dialog `aria-hidden` + `rounded-md`; `CardDescription` `leading-relaxed`). Wave-close `impeccable audit` does not block (no 0–1). Snapshot: this register + `output/ds-evals-2026-09-21/`.

**Gate 6 (kits, source):** FEEL PASS — ExtraLight / no marker / left hero / hairline + optional lift / compact medium titles. Public leftover composition is Wave 2, not a Wave 1 feel fail.

**Skills loaded (paths):** `~/.agents/skills/design-taste/SKILL.md`; `~/.agents/skills/impeccable/SKILL.md`; `~/.agents/skills/impeccable/reference/craft-floor.md`; `~/.agents/skills/impeccable/reference/audit.md`; repo `.agents/skills/better-interface/SKILL.md`; `.agents/skills/better-accessibility/SKILL.md`; `.agents/skills/better-typography/SKILL.md`; `.agents/skills/better-colors/SKILL.md`; `.agents/skills/better-ui/SKILL.md`; `.agents/skills/better-layout/SKILL.md`; `.agents/skills/better-writing/SKILL.md`.

### DS-01: Lived law — `DESIGN.md` + IceInVein
- **Surfaces:** `DESIGN.md`, `docs/designs/2026-09-21-design-system-iceinvein.md`
- **Incumbent:** Twenty 2px, kicker deletion, Twenty-as-current, heading 600 leak described as unresolved.
- **Gap:** Written law contradicted live discover.
- **Target:** Discover is the lived grammar. Retract kicker deletion and redesign. Record craft-floor eyebrow override. Keep five commercial questions, three modes, Tool/Quote/Purchase composition.
- **References:** `DirectoryHero.tsx`, IceInVein §2.
- **Skills:** `~/.agents/skills/design-taste/SKILL.md`, `~/.agents/skills/impeccable/reference/craft-floor.md` (override).
- **Layer A:** docs only (charter present). **Layer B:** none-kit-only. **Layer C:** none.
- **Subagents:** parent law write; inventoried by [Wave 1 scout](fb58900b-45c9-464e-9705-33009e97805a).
- **Gates 1–5:** pass. **FEEL:** n/a (docs). **Deviations:** none.
- **Status:** `VERIFIED`

### DS-02: Tokenize discover scale
- **Surfaces:** `src/styles/globals.css` (`--ae-leading-*` + `@theme` bridges)
- **Incumbent:** Type untokenized. `.font-display` weight 300. `h1,h2` weight 600.
- **Gap:** Rule 2.
- **Target:** IceInVein §5 tokens copied from SoT. Display ExtraLight 200. Headings Medium 500 unless display or listing-card title.
- **Skills:** W1 pack. **Layer A:** `tests/unit/styles/theme-token-parity.test.ts` (Orchestrator 19 with siblings). **Layer B/C:** none-kit-only.
- **Subagents:** [Wave 1 scout](fb58900b-45c9-464e-9705-33009e97805a) → [Wave 1 harvest](2e24752e-f673-4b2d-8837-c80a5fafefb2).
- **Gates 1–5:** pass. **FEEL:** n/a. **Deviations:** kits still use some `leading-[1.02]` literals equal to the token (P3 leftover).
- **Status:** `VERIFIED`

### DS-03: Frozen-string guards + eval harness
- **Surfaces:** `tools/dev/eval-ds-grammar.ts`, `tests/eval/ds-grammar.test.ts`, `tools/dev/ds-journey-cases.ts`, three SoT files (read-only)
- **Incumbent:** No SoT freeze. No design eval harness.
- **Gap:** Protocol §3 Layer A.
- **Target:** Frozen-string guards on hero eyebrow/display/deck, collection kicker/title/pill, card lift + semibold title.
- **Layer B case IDs:** `discover-sot` (still the only `sot: true`). Live walk Not verified.
- **Subagents:** [Wave 1 scout](fb58900b-45c9-464e-9705-33009e97805a) → [Wave 1 harvest](2e24752e-f673-4b2d-8837-c80a5fafefb2) (tighter scanners).
- **Gates 1–5:** Layer A pass. **FEEL:** n/a. **Deviations:** live SoT browser still due at DS-34.
- **Status:** `VERIFIED`

### DS-04: Parity + ui-contract + census ratchets
- **Surfaces:** `theme-token-parity.test.ts`, `ui-contract.test.ts`, `eval-ds-grammar.ts`
- **Incumbent:** Colour/shadow/transition bans green. No counted design-grammar ratchet.
- **Gap:** Rule 8 — ratchet before harvest.
- **Target:** Counted ceilings. Do not ban discover-legal semibold on cards. Never raise a ceiling.
- **Layer A:** `test:ui-contract` 2; scanners tighter; Orchestrator green.
- **Subagents:** [Wave 1 harvest](2e24752e-f673-4b2d-8837-c80a5fafefb2).
- **Gates 1–5:** pass. **FEEL:** n/a. **Deviations:** none.
- **Status:** `VERIFIED`

### DS-05: Rematerialize `AeSiteHeading` / `AeSiteEyebrow` / `AeSiteBody`
- **Surfaces:** `src/components/ae/website/AeSiteType.tsx`
- **Incumbent:** Fluid `sm:text-7xl`, `font-normal` display, eyebrow `font-semibold` + `SiteMarker`.
- **Gap:** Kit is a second type system.
- **Target:** Eyebrow = discover medium tracked uppercase, **no** marker. Display = ExtraLight. Body = deck scale.
- **Layer B:** editorial consumers via source interpolation. Live visual deferred.
- **Layer C:** [better-interface](7c35eba5-4527-4f1c-83e4-3839104118a8) + [impeccable audit](a01b9540-988e-423d-ab04-5f41d4d6ebdb).
- **Subagents:** incumbent source from parent harvest; inventoried by Grok; no further Composer on this file in leftover cluster.
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). **Deviations:** live visual.
- **Status:** `VERIFIED`

### DS-06: Rematerialize `AeSiteHeroIntro` / section rhythm
- **Surfaces:** `AeSiteType.tsx` (`AeSiteHeroIntro`)
- **Incumbent:** Centered `items-center text-center` default (Twenty HomeHero).
- **Gap:** Centered marker-hero is a defect against discover left split.
- **Target:** Left split default. Consumers that wrap with `mx-auto` / `justify-center` drop those in Wave 2.
- **Layer B:** source interpolation of kit consumers (authorized 21 Sep). Live visual deferred.
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). **Deviations:** live visual.
- **Status:** `VERIFIED`

### DS-07: Card / Item = discover card
- **Surfaces:** `src/components/ui/card.tsx`, `src/components/ui/item.tsx`
- **Incumbent:** Card uses `shadow-soft`, no hairline, no lift.
- **Target:** Primitive = hairline, `rounded-card`, optional `discoverLift`. SoT card file stays frozen.
- **Layer A:** ui-contract card checks. **Layer B:** `discover-sot` card landmark via source interpolation.
- **Layer C:** MEDIUM deck leading fixed ([6cf1affd](6cf1affd-0925-4dad-9b5a-199b425703ab)).
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). **Deviations:** `CardTitle` remains a `div` (impeccable P2, parked); lift default OFF; live visual.
- **Status:** `VERIFIED`

### DS-08: Button + Badge + pill recipe
- **Surfaces:** `button-variants.ts`, `badge.tsx`
- **Incumbent:** Badge already `rounded-full`. `text-[10px]` on `xs`.
- **Target:** `pill` size `rounded-full`. Caption token. Base UI APIs unchanged.
- **Layer B/C:** kit jury via source interpolation.
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). **Deviations:** live visual.
- **Status:** `VERIFIED`

### DS-09: Table, Empty, Field, Dialog
- **Surfaces:** `table.tsx`, `field.tsx`, `dialog.tsx`, `AeEmptyState.tsx`
- **Incumbent:** Overlay motion tokenised. Type local.
- **Target:** Discover type + overlay radius. Base UI APIs unchanged.
- **Layer C:** dialog close `aria-hidden` + `rounded-md` fixed. Impeccable P1: `text-destructive` on `FieldError` fails AA (~4.3 light / ~3.3 dark) — named leftover, score 2 so not a 0–1 block.
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). **Deviations:** FieldError contrast; `TableHead` `tracking-[0.06em]`; empty-state click toast; live visual.
- **Status:** `VERIFIED`

### DS-10: `AePageHeader` + `AeRecordHeader` compact dialect
- **Surfaces:** `src/components/ae/layout/AePageHeader.tsx`, `AeRecordHeader.tsx`
- **Incumbent:** Workspace `font-bold`; record `font-semibold`.
- **Target:** Compact dialect: drop `font-bold`. Medium title, muted deck. No 7xl hero.
- **Layer B:** `workspace`, `calls`, `credit`, `settings` via source interpolation.
- **Layer A:** `tests/unit/layout/page-header.test.tsx`.
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). **Deviations:** live visual; sticky record header missing `motion-reduce` (impeccable P2, parked).
- **Status:** `VERIFIED`

**Wave 1 close:** Layer A green; SoT class strings unchanged (`git diff --stat` empty on the three discover files). Layer C MEDIUM cycle closed; `impeccable audit` 15/20. Layer B for kit IDs is source interpolation (authorized 21 Sep). Live visual remains deferred. Wave 1 IDs are `VERIFIED`.

---

# Wave 2: Public journeys (editorial dialect)

Composition: hero + collection rails + object cards. Copy and actions stay. Each ID: Layer B case + `better-interface` quick + Gate 6.

**Stage 3 freeze (Wave 2):** [Wave 2 Grok scout](67a5d3f3-21b6-40ad-b310-8fb80b98e554). Skills + `skill#heading` present. Live discover was not opened — SoT strings from source.

Frozen decisions:
- **DS-11 PARKED.** `/` redirects to `/market`. `AeHomeLanding` is unmounted. Live home is discover. Do not harvest a dead landing. Layer B `home` remapped to `/market` (not `sot`).
- Layer B remaps: `market-search` → `/market?view=tools`; `market-compare` → `/market?view=tools` (compare is a dialog, not a view); `provider-listing` → `/$slug`.
- First Composer cluster: **DS-13 → DS-14 → DS-12** only. DS-15–19 stay pending.
- Consume `AeSite*` + `AeCollectionRail`. Do not edit SoT three, `AeSiteType.tsx`, `AeCollectionRail.tsx`, Convex, copy strings.
- Legal eyebrows stay. Number-as-eyebrow (`01`–`04`) is a defect. Ink hero on About is a defect; `AeSiteCover` ink panel stays.
- New Layer A ratchets allowed (never raise Wave 1 ceilings): `mx-auto` hero/funnel wells, numbered-step eyebrows, ink public heroes.

### DS-11: Home
- **Surfaces:** `src/components/ae/home/AeHomeLanding.tsx` (unmounted)
- **Incumbent:** File exists; `src/routes/index.tsx` redirects `/` → `/market`.
- **Gap:** Not a live public journey.
- **Target:** Live home is discover. Do not restyle an unmounted landing.
- **Layer B:** `home` → `/market`.
- **Subagents:** inventoried by [Wave 2 Grok scout](67a5d3f3-21b6-40ad-b310-8fb80b98e554).
- **Status:** `PARKED`

### DS-12: For agents
- **Surfaces:** `AeAgentDoorPage.tsx` + `AeAssistantInstallFunnel.tsx`
- **Incumbent:** Left kit hero at `size="md"`; `mx-auto max-w-5xl` funnel; numbered circle badges.
- **Gap:** User-named regression — left title over a centered install widget.
- **Target:** Display `lg`/`xl`. Funnel as ordered rows, not circle badges. Drop the `mx-auto` well.
- **Layer A:** Orchestrator green after [Wave 2 harvest](9590a561-c146-473b-a87d-5466a68e81ad) (ds-grammar 8, ui-contract 2, lint 0).
- **Layer B:** `for-agents`. Live walk by [Layer C jury](0a8b82d0-c2ff-4436-bdf1-a6a01ca2ba81) on `:3024` (320 + 745). Not a full Gate 6 scorecard.
- **Layer C:** [re-jury](0c37649b-1df2-4ad2-bf33-439be851621b) **Approve**. Prior Block HIGH closed.
- **Subagents:** [Wave 2 Grok](67a5d3f3-21b6-40ad-b310-8fb80b98e554) → [harvest](9590a561-c146-473b-a87d-5466a68e81ad) → [jury](0a8b82d0-c2ff-4436-bdf1-a6a01ca2ba81) Block → [fix](f8754671-5ad7-46a0-9034-1a070a28d337) → re-jury Approve.
- **Gates 1–5:** pass. **FEEL PASS.** **Deviations:** none.
- **Status:** `VERIFIED`

### DS-13: For providers
- **Surfaces:** `AeSupplyLanding.tsx`, `AeSupplyAgentProof.tsx`
- **Incumbent:** Left kit hero at `size="md"`; `01`–`04` as `AeSiteEyebrow`; 3-up source cards.
- **Gap:** Numbered-step theatre + marketing grid.
- **Target:** Display `lg`/`xl`. Steps as `AeCollectionRail` + `<ol>` rows. Sources as rows. Legal “Providers” / “Before you sign in” stay.
- **Layer A:** same cluster. Number-as-eyebrow ratchet 0. `01`–`04` keys only, not rendered.
- **Layer B:** `for-providers`. Live `:3024` by Layer C jury.
- **Layer C:** [re-jury](0c37649b-1df2-4ad2-bf33-439be851621b) **Approve**.
- **Subagents:** same cluster chain as DS-12.
- **Gates 1–5:** pass. **FEEL PASS.** **Deviations:** none.
- **Status:** `VERIFIED`

### DS-14: About
- **Surfaces:** `AeAboutPage.tsx`, `AeSiteCover.tsx` (ink eyebrow color only)
- **Incumbent:** `scheme="ink"` hero; centered mark.
- **Target:** Muted hero. Featured cover stays. Copy stays.
- **Layer A:** ink-public-hero ratchet 0.
- **Layer B:** `about`. Live `:3024`.
- **Layer C:** [re-jury](0c37649b-1df2-4ad2-bf33-439be851621b) **Approve**. Catalog pair live **14.51:1**.
- **Subagents:** same cluster chain as DS-12. Cover eyebrow now `text-background` on ink ([fix](f8754671-5ad7-46a0-9034-1a070a28d337)).
- **Gates 1–5:** pass. **FEEL PASS.** **Deviations:** none.
- **Status:** `VERIFIED`

### DS-15: Support + privacy + terms + remove-business
- **Surfaces:** support / privacy / terms / remove-business compounds
- **Target:** Read-mode density, discover type, no dashboard chrome.
- **Stage 3 freeze:** Keep `AePublicPage` document header + legal eyebrows. Drop `font-semibold` page/CTA headings (`text-3xl` / `text-2xl`). Nested Cards → rows or rail. Removal form: drop `mx-auto` well; stay start-aligned. Copy in `*.contracts.ts` stays. Do not restyle `AePageHeader` / `AePublicPage` / `AeSection` primitives.
- **Layer A:** Orchestrator green after [DS-15 harvest](566f72f7-fa6f-49fe-8828-6e375e336933) (ds-grammar 11, lint 0).
- **Layer B:** `support`, `privacy`, `terms`, `remove-business`. Live walked by [DS-15 jury](9b5f02f2-0ebb-43b9-ad7d-6dcc832b438a) on `:3024`.
- **Layer C:** [re-jury](b7019a8a-197f-407a-8173-94898dcee048) **Approve**. MEDIUMs closed by [fix](4a97393e-b587-4690-8e77-21ebf7e97128).
- **Subagents:** [DS-15 harvest](566f72f7-fa6f-49fe-8828-6e375e336933) → [jury](9b5f02f2-0ebb-43b9-ad7d-6dcc832b438a) → fix → Approve.
- **Gates 1–5:** A+B+C pass. Lint red on concurrent `src/routes/__root.tsx` (out of budget). **FEEL PASS.**
- **Status:** `VERIFIED`

### DS-16: Developers API + discovery
- **Surfaces:** developers API + discovery pages
- **Target:** Editorial type; snippets stay mono.
- **Stage 3 freeze:** API keeps `AePublicPage` + legal eyebrow; do not skin Scalar. Discovery leaves `AeOperatorPage` for `AePublicPage` document chrome; facts stay rows; CodeBlock stays mono. Do not split the route file unless required.
- **Layer A:** Orchestrator green after [cycle 1](f542b21f-82f6-4e1e-833f-382f9e859824) (ds-grammar 14).
- **Layer B:** `developers-api`, `developers-discovery`. Live walked by [DS-16 jury](deca310f-d228-4211-842b-a7fb2ac0c90c) then [re-jury](6f830044-8a27-4e32-b5ee-fea0910f278d) on `:3024`.
- **Layer C:** [jury](deca310f-d228-4211-842b-a7fb2ac0c90c) **Block** (Scalar `body.dark-mode` → AE h1 **1.04:1**; Orchestrator same pair) → [cycle 1](f542b21f-82f6-4e1e-833f-382f9e859824) srcDoc iframe + title/state copy → [re-jury](6f830044-8a27-4e32-b5ee-fea0910f278d) **Approve**. Orchestrator re-measure: parent body chalk, h1 **14.51:1**, Scalar stays inside the iframe.
- **Subagents:** [harvest](01707ad5-2b4e-4599-8e88-2937c7f6e8fe) → jury → cycle 1 → Approve.
- **Gates 1–5:** pass. **FEEL PASS** (AE chrome readable; Scalar remains an unskinned island). **Deviations:** Scalar lives in a `srcDoc` iframe because `X-Frame-Options: DENY` forbids a framed AE route.
- **Status:** `VERIFIED`

### DS-17: Status, onboarding, sign-in/up chrome
- **Surfaces:** `status`, `onboarding`, `clerk-appearance.ts`
- **Target:** Token-bridge only for Clerk. Status/onboarding consume kit type.
- **Stage 3 freeze:** Status list `rounded-card` or divide-y, not `rounded-lg`. Clerk: `headerTitle` → `font-medium`; keep `rounded-none` and token colours. Do not left-split `AeSiteAuthStage` `mx-auto` (justified auth panel).
- **Layer A:** Orchestrator green after [cycle 1](f542b21f-82f6-4e1e-833f-382f9e859824); harvest lists the skeleton.
- **Layer B:** `status`, `sign-in` walked by [DS-17 jury](36944528-1e97-45f4-9389-bb5c33dde6f6). Onboarding happy path **Not verified** (Convex client missing when unauthenticated).
- **Layer C:** [jury](36944528-1e97-45f4-9389-bb5c33dde6f6) **Needs changes** → [cycle 1](f542b21f-82f6-4e1e-833f-382f9e859824) skeleton `rounded-card` → [re-jury](cf68198d-8259-4c99-b307-3601d266f883) **Approve**.
- **Subagents:** [harvest](01707ad5-2b4e-4599-8e88-2937c7f6e8fe) → jury → cycle 1 → Approve.
- **Gates 1–5:** A+C pass; status/sign-in B pass. **FEEL PASS.** **Deviations:** onboarding wizard Layer B unavailable; harvest did not change onboarding compounds. Skeleton remains unwired (no `pendingComponent`).
- **Status:** `VERIFIED`

### DS-18: Public tool detail + provider listing
- **Surfaces:** tool detail, `AeProviderListingPage.tsx`
- **Target:** `DESIGN.md` Tool composition; listing cards = primitive.
- **Stage 3 freeze:** next Composer after DS-12–14. Layer B `provider-listing` is `/$slug`, not the market tab. Public Tool must leave `kind="workspace"` and drop the ink next-action slab. Copy/Quote/Call behaviour stays. SoT three + Convex + money math out of budget.
- **Layer A:** Orchestrator green after [DS-18 harvest](f1be8726-b927-48d9-8732-0efcefa51500) (ds-grammar 9, ui-contract 2, lint 0).
- **Layer B:** `tool-detail`, `provider-listing`. Live found-state **Not verified** (admission unavailable; no published provider slug). Unavailable/not-found walked on `:3024` by [DS-18 jury](3d776b7b-4874-4c92-ab00-9025905b9752).
- **Layer C:** [re-jury](d5a2c678-2ea7-4c26-a9f5-6d2d8c2b0b43) Needs changes (0 HIGH). Cycle 1 closed prior MEDIUMs. Halt cycle 2: remaining MEDIUM (tabs/sheet as terms surface) recorded as named deviation until found-state Layer B exists. Listing **rows** stay (Stage 3).
- **Subagents:** [DS-18 harvest](f1be8726-b927-48d9-8732-0efcefa51500) → [jury](3d776b7b-4874-4c92-ab00-9025905b9752) → [fix](ae78e2a9-13f0-4f8e-b7d1-cf9988da4a76) → [re-jury](d5a2c678-2ea7-4c26-a9f5-6d2d8c2b0b43).
- **Gates 1–5:** A+C pass; found-state B unavailable. **FEEL PASS** (source). **Deviations:** tabs/sheet as terms surface (named; halt cycle 2); listing rows stay (Stage 3); live found-state deferred.
- **Status:** `VERIFIED`

### DS-19: Market search / compare / providers / saved
- **Surfaces:** market views other than discover
- **Gap:** Discover view frozen. Other views must not invent a second catalogue look.
- **Target:** Same card/rail/filter-pill grammar. Do not edit the three SoT files.
- **Stage 3 freeze:** Layer B `market-search` → `/market?view=tools`; `market-compare` is the compare dialog on tools (not a view); `market-providers` / `market-saved` stay. Headers → `AeCollectionRail`. Provider cards → `Card discoverLift` + caption kicker (`text-caption font-medium uppercase tracking-caption`), not `text-[10px]` raw. Explorer selected facets → `rounded-full` pills. Compare stays a table. SoT three files out of budget.
- **Layer A:** Orchestrator green after [DS-19 harvest](fb44f96f-961b-438f-a910-9d01203a6388) (ds-grammar 10, ui-contract 2, lint 0). SoT three `git diff --stat` empty.
- **Layer B:** `market-search` `/market?view=tools`, `market-compare` dialog, `market-providers`, `market-saved`. Live walked by [DS-19 jury](ce3f8086-d95e-45bf-bc73-820d97a2fe93) on `:3024` (1440 + 390).
- **Layer C:** [final re-jury](e8efc96e-f040-48c6-96e6-6e3223aa92c8) **Approve**. HIGH tray closed by docking in flow ([cycle 2](f89d3f89-1067-49a6-a7fb-5db872213588)).
- **Subagents:** [DS-19 harvest](fb44f96f-961b-438f-a910-9d01203a6388) → [jury](ce3f8086-d95e-45bf-bc73-820d97a2fe93) Block → [fix 1](597ec02f-9a6e-4069-9b77-43008eabfb11) → [re-jury](43ea2ee9-0e3f-4f3b-99ba-4e55216b2c29) Block → [fix 2](f89d3f89-1067-49a6-a7fb-5db872213588) → Approve.
- **Gates 1–5:** pass. **FEEL PASS.** **Deviations:** compare tray is in-flow, not sticky (required to keep Compare clickable).
- **Status:** `VERIFIED`

**Wave 2 close:** `impeccable critique` on For agents vs live discover.

---

# Wave 3: Operator journeys (compact dialect)

No 7xl hero. Same eval rule as Wave 2. Layer B for this wave is **source interpolation** (partner deferred live auth): read the route, its views, and every chrome transition into/out of `_operator`. Do not rematerialize operator nested chrome as a second app.

**Stage 3 freeze (Wave 3):** One-shell first (DS-37), then compact type on pages. Scout leftover inventory [c2ea4614] (pre-flip; type only) + remaining-route scout [1a528d8e]. Layer C: cluster 1 [662570ee] Needs changes → [0c1fa917] → [8cf1c270] Approve. Cluster 2–4 [8ccad490] Needs changes → [686e8404] + wrap → [29d2cfaf] Approve.

**Layer A (Orchestrator, Node 22):** `ds-grammar` + `app-shell` + `owner-primary-navigation` + `roles` + `ae-activity-filters` + `owner-team` **54**; later Wave 4 suite **36**. SoT three `git diff --stat` empty.

### DS-20: `AeOperatorPage` leftovers
- **Surfaces:** `AeSection.tsx`, `AeSettingsStack`
- **Target:** Compact dialect leftovers only.
- **Harvest:** `AeSection` h2 `font-medium`; settings stack start-aligned (`grid w-full`, no `mx-auto max-w-3xl`).
- **Layer B:** `workspace` source interpolation. **Layer C:** [8cf1c270] Approve.
- **Subagents:** [22508ddc] harvest.
- **Status:** `VERIFIED`

### DS-21: Workspace overview
- **Surfaces:** `AeOwnerOverview.tsx`
- **Harvest:** Fact rows + `AeSection` Next step. No 4xl marketing cards.
- **Layer B:** `workspace`. **Layer C:** [8cf1c270] Approve.
- **Deviations:** dest CTA “Open My Tools” recorded for DS-30 (now matches dest).
- **Subagents:** [22508ddc].
- **Status:** `VERIFIED`

### DS-22: Credit + money
- **Surfaces:** `AeOwnerCredit.tsx` + ceiling / methods / recharge wells
- **Target:** Rows and facts. No money-math moves.
- **Harvest:** Balance `text-2xl font-medium tabular-nums`; no `shadow-soft`; nested wells `border-t`.
- **Layer B:** `credit`. **Layer C:** [29d2cfaf] Approve.
- **Subagents:** [053d2ae2].
- **Status:** `VERIFIED`

### DS-23: Team + owner settings
- **Surfaces:** team directory, workspace, danger zone, recovery checklist
- **Harvest:** Danger-zone / checklist compact type; chips `font-medium`; Team + Workspace wrap `AeOperatorPage` (`main#main-content`); “Canonical directory” sentence case.
- **Layer B:** `settings`, `team`. **Layer C:** [29d2cfaf] Approve (wrap finding stale after [0c1fa917]).
- **Subagents:** [cf67481d] type → [0c1fa917] wrap → [686e8404] copy.
- **Status:** `VERIFIED`

### DS-24: Operations, new tool, tool detail, connections
- **Surfaces:** owner operations compounds
- **Harvest:** Wizard / tool / payout / earnings headings `font-medium`; sticky assess no `shadow-soft`; offering/offboarding row titles `font-medium`; “Supplier activation”.
- **Layer B:** `operations`, `operations-tool`, `connections`. **Layer C:** [29d2cfaf] Approve.
- **Subagents:** [053d2ae2] → [686e8404].
- **Status:** `VERIFIED`

### DS-25: Calls (`/activity`)
- **Surfaces:** `src/components/ae/activity/*`
- **Harvest:** Filter chips `rounded-full`; hairline bar; empty CTA `/market`; filter-empty **Reset filters**.
- **Layer B:** `calls`. **Layer C:** [662570ee] Needs changes → [0c1fa917] → [8cf1c270] Approve.
- **Subagents:** [22508ddc] → cycle 1.
- **Status:** `VERIFIED`

### DS-26: Call receipt
- **Surfaces:** `src/components/ae/call-receipt/*`
- **Target:** Three commercial states, one look. Green payment ≠ complete delivery.
- **Harvest:** Receipt `h2`s `text-base font-medium`. Timeline step numbers may stay semibold as content. `/calls` is owner-buyer (no sidebar).
- **Layer B:** `call-receipt`. **Layer C:** [8cf1c270] Approve.
- **Subagents:** [22508ddc] + roles leftover.
- **Status:** `VERIFIED`

### DS-27: Agent access + authorize
- **Surfaces:** agent-access compounds
- **Harvest:** Resume / authorize wells drop `shadow-soft`. Spending-policy label `font-medium`.
- **Layer B:** `agent-access`. **Layer C:** [29d2cfaf] Approve.
- **Subagents:** [cf67481d].
- **Status:** `VERIFIED`

### DS-28: Admin catalog health + audit
- **Surfaces:** admin index-health, audit-events
- **Harvest:** Already compact (`AeOperatorPage` + `AeFactList`). Slim Records rail. Verify-and-close.
- **Layer B:** `admin-health`, `admin-audit`. **Layer C:** [29d2cfaf] Approve.
- **Subagents:** [cf67481d] (no file edits).
- **Status:** `VERIFIED`

### DS-29: Chat, command palette, key reveal
- **Surfaces:** chat, command-panel, `AeKeyRevealDialog.tsx`
- **Target:** Type/rows only. Hotkeys stay app-shell.
- **Harvest:** `ChatHeader` / empty transcript / `SharedChat` `font-medium`. Key-reveal already compact. Composer `max-w-3xl` kept as conversation measure.
- **Layer B:** `chat`, `command`, `key-reveal`. **Layer C:** [29d2cfaf] Approve.
- **Subagents:** [053d2ae2] → [0c1fa917] empty title → [686e8404] SharedChat.
- **Deviations:** DS-39 `ToolCard` out.
- **Status:** `VERIFIED`

**Wave 3 close:** Compact dialect on the one-shell. Live signed-in visual deferred. `impeccable critique` vs live discover remains a Wave 2 leftover, not a Wave 3 block.

---

# Wave 4: IA, one-shell, close

### DS-30: Nav / page titles / empty states → `CONTEXT.md` names
- **Surfaces:** `_operator` `staticData.nav`, page titles, empty states
- **Target:** Labels match `CONTEXT.md`. No URL renames.
- **Harvest:** `/owner/operations` dest label **My tools** (header, mobile fallback, command palette, breadcrumbs, workspace title). URLs unchanged. Market / Agents / Calls unchanged.
- **Layer B:** compact dest chrome via source interpolation. **Layer C:** [7dd60c22] Approve.
- **Subagents:** [2b5c46f7].
- **Deviations:** leftover same-href “Open Tools” on supply start (pre-existing; not dest chrome).
- **Status:** `VERIFIED`

### DS-31: Shared collection-rail primitive
- **Surfaces:** `src/components/ae/shared/AeCollectionRail.tsx`
- **Target:** Discover collection header + rail. SoT `DirectoryHomeDiscovery` stays frozen.
- **Finding:** Primitive already exists; public journeys already consume it. A second rail would duplicate.
- **Subagents:** [7dd60c22] inventory.
- **Status:** `DROPPED`

### DS-32: Interaction language
- **Surfaces:** card lift, pills, ink panel, leftover product radius
- **Target:** Lift and pills as discover. Ink panel only when featured.
- **Harvest:** Product `shadow-soft` gone except elevated header (`data-[elevated]:shadow-soft`). Pills already `rounded-full`. Ink only on About featured cover. Product `rounded-lg` wells → `rounded-card` on workspace / activity / receipt / empty / route states ([2a61e734]).
- **Deviations:** playground / price-update / some supply + credit wells still `rounded-lg` (parked named leftover).
- **Layer B:** source interpolation. **Layer C:** lift/pills/ink already juried in Waves 2–3; leftover radius is P3.
- **Status:** `VERIFIED`

### DS-33: Lower Wave 1 ratchets to measured zero
- **Surfaces:** `eval-ds-grammar.ts` ceilings
- **Target:** Ceilings → 0 for `font-bold` titles, SiteMarker product eyebrows, `shadow-md` product cards, centered public `AeSiteHeroIntro`. Never raise a ceiling.
- **Finding:** `DS_RATCHET` already `{ fontBoldTitles: 0, siteMarkerProductEyebrows: 0, genericShadowMdProductCards: 0, centeredPublicHeroIntro: 0, … }`. Verify-and-close. Never raised.
- **Layer A:** `tests/eval/ds-grammar.test.ts` green (Orchestrator).
- **Status:** `VERIFIED`

### DS-34: Programme re-audit
- **Surfaces:** this register + independent measurement + browser loop
- **Target:** Re-run §1 census. Layer A+B+C on discover → For agents → For providers → Calls → settings → credit → tool detail → receipt. Persist `output/ds-evals-*`. Do not mark `CLOSED` if SoT drifted or Layer B SoT case failed.
- **Layer A:** SoT three `git diff --stat` empty. Core suites green (54 + 36).
- **Layer B:** Guest public already walked on `:3024` in Wave 2. Signed-in / operator is source interpolation. Live SoT browser still due.
- **Layer C:** Wave juries cited on each ID. Full `better-interface` + Rams + cognitive-load on a live signed-in loop is **Not verified**.
- **Deviations:** programme is not `CLOSED` until live SoT + signed-in visual. This ID stays open for that loop.
- **Status:** `PENDING`

### DS-35: Frame ownership map
- **Surfaces:** `AeAppShell`, `AeOperatorSidebar`, `AeOperatorPage`, `ChatHeader`, settings wrappers (`OwnerSettingsShell`, Clerk `UserButton`)
- **Incumbent:** Three applications composed together. Header owns brand + public nav + `UserButton` + `ThemeToggle` + ⌘K. Operator hides header nav and adds sidebar brand/mode, `AeOrganizationSwitcher`, second `UserButton`, second `ThemeToggle`. Chat at `/t/*` adds a third logo and Sign in.
- **Gap:** Global controls have no single owner. Signed-in work still shows public introduction destinations or no primary nav at all.
- **Target:** Inventory every logo, avatar, workspace switcher, nav menu, and appearance control. Assign one owner per global control. Distinguish application navigation from useful local controls (chat “New conversation”, page filters, local tabs).
- **Layer A:** census helpers listing duplicate brand / account / theme / workspace controls (do not raise `DS_RATCHET`).
- **Layer B:** `market` signed-in, `chat`, `workspace`, `calls`, `settings`. Guest `/market` + `/t/new` walked on `:3024`. Signed-in operator **Not verified** (auth gate).
- **Layer C:** none (inert map).
- **Subagents:** [frame map](e7426b5c-b85d-438f-b117-817432b82460) · [Market/chat](a9c14352-d7b8-4cff-871d-a35d0b067484) · [settings+sidebar](f20bec3f-2d17-478d-95c3-222854bd00cb)
- **Assigned owners:** brand, primary dests, workspace switcher, account, theme, ⌘K → `AeAppShell`. Chat New conversation / history / share → local. Settings overlay is DS-38. Balance chip → drop (Credit remains a destination).
- **Status:** `VERIFIED`

### DS-36: Signed-in Market/chat reference shell (Flips)
- **Surfaces:** `AeAppShell` header, `/market`, `/t/new`, `/t/$threadId`
- **Target:** One visible account menu, one workspace selector, signed-in destinations Market / Agents / Calls / My tools. Chat drops its application header (logo / Sign in); keeps transcript, composer, history, “New conversation”, share. Closing any overlay returns to the task. Desktop + mobile.
- **Stage 3 freeze:**
  - Do not invent a second header primitive. Filter `staticData.nav.header` by audience (`public` | `signed-in` | `always`).
  - Signed-in dests → existing routes only: Market `/market`, Agents `/agent-access`, Calls `/activity`, My tools slot → `/owner/operations` (keep label `Tools` unless DS-30 already renamed). Do not invent `/my-tools`. Do not point Agents at `/for-agents`. Do not use `/owner/market`.
  - Public dests: Market, For agents, For providers. Calls becomes signed-in-only (today it leaks into the public header and auth-gates).
  - Chat: drop `AECON_MARK_SRC` home link and `SignInButton`. Keep New conversation, history sheet, share. `AeChatPage` fills the remaining column (`min-h-0 flex-1`), not a second `min-h-dvh` app.
  - Guest Sign in must remain reachable at 768–1023px after chat Sign in is removed (`hidden lg:inline-flex` + hamburger `md:hidden` is a gap). Fix visibility on the existing app-header control; do not add a third Sign in.
  - No `AeOperatorSidebar` on `/market` or `/t/*`. `operatorWorkspace` hide of header nav is DS-37 — record the chrome flip, do not flatten operator routes here.
  - One `AeOrganizationSwitcher` in `AeAppShell` when signed-in (reuse as-is). Clerk hosted / `clerk-appearance.ts` out.
  - File budget: `AeAppShell.tsx`, `AeSiteNav.tsx`, `ChatHeader.tsx`, `AeChatPage.tsx`, header `staticData` on market / for-agents / for-providers / activity / agent-access / owner.operations, matching layout/chat/nav tests, `eval-ds-grammar.ts` DS-35/36 listing helpers. SoT three, Convex, money, Scalar, `_operator.tsx`, `AeOperatorSidebar.tsx` out.
- **Layer A:** Orchestrator green after cycle 1 — 27 tests (`chat-header`, `app-shell`, `ds-grammar`, `site-nav`, `shell-a11y-focus`).
- **Layer B:** Guest `/market` + `/t/new` walked on `:3024`. Signed-in dests / switcher / UserButton: **source interpolation** (partner deferred live auth). Composed dests are Market `/market`, Agents `/agent-access`, Calls `/activity`, Tools `/owner/operations`. Chat local chrome is Ask / Saved to your account / New chat / history / share — no mark, no Sign in. Operator dests still hide `AppHeaderNav` (DS-37 chrome flip).
- **Layer C:** [jury](065ec63d-cf7f-41ab-9e2c-67fe6241aafc) **Block** (skip-link HIGH) → [cycle 1](99ee375b-3026-4a11-9393-7f95e32cf5d8) → [re-jury](f09249af-8681-4ace-b3ad-9a733b7998ac) **Approve**. Named leftover: drawer landmark still `Public navigation` (`AeSiteNav.tsx`) — fix with DS-37 audience copy.
- **Subagents:** [harvest](5c81f31a-a9f9-4267-a2c1-b2843b0cfca8) → jury → cycle 1 → Approve.
- **Gates 1–5:** A + guest B + C pass. Signed-in B is source interpolation (dests + chat local chrome). Live signed-in deferred.
- **FEEL:** guest chat is a page under the one header (local “Ask” / New chat remain). Operator chrome flip on Agents/Calls/My tools is DS-37.
- **Status:** `VERIFIED`

### DS-37: Flatten Agents, Calls, Provider workspace onto the reference shell
- **Surfaces:** `_operator` layout, `AeOperatorSidebar`, `AeOperatorPage`, `AeOwnerMobileNavigation`, agent-access, `/activity`, owner operations
- **Target:** Same global controls as `DS-36`. Keep page titles, filters, local tabs. Buyer sidebar does not earn presence after de-duplication. Do not remove `_operator` auth/permission gates.
- **Stage 3 freeze:**
  - **Flips:** `AeAppShell` must keep `AppHeaderNav` and the `<md` hamburger on `_operator` routes (minimal shell still hides them). The line `operatorWorkspace ? null : <AppHeaderNav />` is the defect.
  - Owner buyer surfaces (`/activity`, `/agent-access`, `/owner/*` except admin/developer Records): do not mount `AeOperatorSidebar`. `beforeLoad` / `operatorLayoutRouteOptions` stay.
  - Admin + developer Records may keep a slim rail with **no** brand mark, **no** second `UserButton`, **no** second `ThemeToggle`, **no** second org switcher, **no** dests already in the header.
  - `AeOwnerMobileNavigation` dests = Market, Agents, Calls, My tools — not Credit + owner Market.
  - Drawer landmark: not “Public navigation”. Use `Menu` / `Primary`.
  - Pages keep `AeRecordHeader` title + filters + local tabs. Supply extras (connections, payouts, add Tool) stay page-local on operations.
  - Do not rename `Tools` → My tools (DS-30). Do not build the settings modal (DS-38). Do not delete `/owner/settings*` pages.
  - Org switcher `afterSelectOrganizationUrl` may stay `/owner/operations`; dests must remain visible after that navigation.
  - File budget: `AeAppShell.tsx`, `AeSiteNav.tsx`, `_operator.tsx`, `AeOperatorSidebar.tsx`, `AeOperatorPage.tsx`, `AeOwnerMobileNavigation.tsx`, `src/lib/operator/roles.ts`, header/operator `staticData` flags only, operator-shell / sidebar / tactile-nav tests, `eval-ds-grammar.ts` DS-37 helpers. SoT three, Convex, money, Clerk hosted, settings compounds out.
- **Layer A:** Orchestrator 20/20 then 54 on flip + `/calls` buyer + mobile Market fallback.
- **Layer B:** `agent-access`, `calls`, `operations`, `workspace` — source interpolation of each route and the Market→that-route transition.
- **Layer C:** [7c7697cc] Approve (flip) → mobile Market MEDIUM [662570ee] → [0c1fa917] fallback → [8cf1c270] Approve.
- **Subagents:** [c898a003] flip · [22508ddc] `/calls` · [0c1fa917] Market dest.
- **Gates 1–5:** A+C pass; B interpolated. **FEEL PASS** (source). Header dests persist; buyer sidebar unmounted; admin slim rail.
- **Status:** `VERIFIED`

### DS-38: One settings experience
- **Surfaces:** `/owner/settings`, `/owner/workspace`, `/owner/team`, Clerk `UserButton` profile, ⌘K Account & Settings
- **Target:** One modal with labelled Personal / Workspace scope. Closing settings returns to the prior task.
- **Stage 3 freeze:** [f61085f2] — Dialog slots bodies, never `AeOperatorPage` / `OwnerSettingsShell`. ⌘K opens overlay; pathname unchanged. Routes stay. UserButton hosted. No chat settings control.
- **Harvest:** `src/components/ae/settings/settings-dialog/` + `AeAppShell` mount + command `opensSettings`. Personal = `AccountSettingsSection`. Workspace = existing Clerk/tax/danger/team bodies. `openSettings` no-ops on settings/team/workspace pages.
- **Layer A:** Orchestrator `ds-grammar` + command-console + settings-dialog (36 with siblings).
- **Layer B:** source interpolation (`/market` + ⌘K → Escape → still `/market`).
- **Layer C:** [4d182f9d] Approve.
- **Subagents:** [f61085f2] scout → [a439a976] harvest.
- **Deviations:** full-page settings routes kept until functions are proven covered; UserButton remains hosted.
- **Status:** `VERIFIED`

### DS-39: Discovery output (separate, parked)
- **Surfaces:** chat recommendation / comparison cards
- **Target:** One concise recommendation and one comparison surface. Tool failures must agree with the explanation shown. Not part of the shell harvest. Jev ranking stays out.
- **Status:** `PARKED`

---

## 3. Out of scope (recorded so they are not "lost")

- Route skeleton presets, ⌘K / ⌘B, toast, safe-area (`S-*` stay closed).
- Base UI `render` props.
- Code-quality file ceilings and compound-folder shape.
- Clerk/Stripe hosted internals beyond `clerk-appearance.ts`.
- New font, gold accent, Storybook, Jev inference accuracy, production proof.
- Visual change on the three discover SoT files.
