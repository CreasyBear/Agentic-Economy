# Design System, Tokens, Typography, UI, UX, Interaction & IA: Deep IceInVein Specification

**Date:** 21 September 2026
**Status:** Approved. Discover is the source of truth. Consistency first; no redesign.
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `DESIGN.md`, `AGENTS.md`
**Operating Protocol:** `docs/operations/design-system-maturity-protocol.md`
**Register:** `docs/operations/design-system-maturity-register.md`
**Foundations:** Emil Kowalski (tactile physics), Dieter Rams (as little design as possible), Edward Tufte (once a visual, always that visual), NN/g IA, `DESIGN.md` product grammar.
**Lived visual law:** `/market?view=discover` as implemented in `DirectoryHero.tsx`, `DirectoryHomeDiscovery.tsx`, `DirectoryToolCard.tsx`. Those files are frozen.

---

## 1. Executive Thesis

> **"A surface is a projection of DESIGN.md through tokens. If a component invents a colour, weight, radius, type size, shadow, or duration, the look and feel has already forked."**

That is the hygiene law. It is not the product.

> **"Agentic Economy should feel like the room where a consequential market decision is made: warm chalk, one forest mark, ExtraLight display, aligned money, and a next action that names the consequence. Consistency is how it stays one product. Presence is why anyone cares."**

The inconsistency is not "we have no system." Most product UI never uses the system as the only source of visual decisions. Public siblings (For agents, For providers, Home, About) and operator surfaces (Calls, settings, credit) regress from the lived discover grammar.

This campaign harvests the whole app onto that grammar. It does not invent a second world.

### Why the look and feel forked

1. **The written law and the live product disagree.** `DESIGN.md` still carried Twenty leftovers (2px radius, delete-the-kicker). Live discover already ships website radius, ExtraLight display, and uppercase medium eyebrows.
2. **There is no type scale token.** Colour, motion, spacing, and radius are bridged. Type size was invented at the call site.
3. **Three competing type systems.** Discover ExtraLight + medium eyebrow; `AeSite*` centered display + `SiteMarker`; operator `font-bold` / `font-semibold` headers.
4. **Primitives are structurally correct and visually local.** Feature files restyle around Button, Card, Dialog with local recipes.
5. **Composition forks.** Discover is a left split hero + collection rails + listing cards. Public siblings are centered marker-heroes. Operator is a second dashboard.

### What this campaign is not

- Not a restyle. No new palette, typeface, or motion library.
- Not a reopen of app-shell (`S-01`–`S-20`), Base UI (`B-01`–`B-27`), or code-quality leaf/container work.
- Not permission to weaken `scanUiContract`.
- Not permission to delete discover-legal eyebrows or "upgrade" discover.
- Not `impeccable overdrive` / `bolder` / `new-work`. Phenomenal here is committed restraint.

---

## 1a. Phenomenal, not sterile — discover as the feel law

`DESIGN.md` already named the feel: the Airbnb of the agentic economy, not a trading desk. Discover already implements it. The campaign's job is to make every other surface a sibling of that page.

### Inverse premortem (feel)

Six months from now people describe the app as *one market*, not *three products*. Exactly what caused that:

1. **Material, not theme.** Chalk `#E8E4DA` and charcoal `#141414` are the room. Forest is jewelry — links, focus, selection — never a filled button and never a wash on a whole card.
2. **One authored moment per page.** Editorial: ExtraLight display + collection rails. Compact: the number or the next action. Everything else recedes.
3. **Discover composition.** Left split hero, uppercase medium eyebrow without marker, collection title medium, listing card with hairline and lift.
4. **Money looks like money.** Mono, tabular, GST visible, no hero-metric theatre.
5. **Tactile, not animated.** Press compresses. Card lifts. Nothing shimmers.
6. **Two dialects, one system.** Public is generous. Operator is a quiet bench. Same tokens. If operator invents a second weight language, the campaign failed.

### Phenomenal vs sterile (Orchestrator feel gate)

| Sterile (fail even if tokens match) | Phenomenal (pass) |
| :--- | :--- |
| Equal padding, equal cards, equal type size | Hierarchy you can squint: one thing is the page |
| Centered `SiteMarker` hero on a sibling of discover | Left ExtraLight display, medium tracked uppercase eyebrow, no marker |
| `font-bold` workspace titles | Compact dialect: medium title, muted deck, same hairlines |
| Forest used as a decorative chip colour | Forest only on identity, focus, links, literal info |
| Nested cards, icon+title+blurb `01` grids | Listings may card; records and purchases are rows |
| "Continue", "Submit", "OK" | The verb is the consequence: Quote and Call, Add funds, Pause agent |
| Token-wash that still reads as another dashboard | Sibling of `/market?view=discover` |

**Retracted:** kicker deletion, Twenty-as-current, "public pages do not need `AeSiteEyebrow`." Discover-legal eyebrows stay. `impeccable` craft-floor's kicker ban is overridden by this brief. The remaining ban is `SiteMarker` as a product eyebrow.

---

## 2. Law freeze (signed)

| Conflict | Decision |
| :--- | :--- |
| `DESIGN.md` Twenty 2px vs live website radius | **Live website scale wins.** Controls `--radius-md`. Cards `--radius-card`. Pills `rounded-full`. Public nav remains the most rounded persistent shell. |
| `DESIGN.md` weights 200 / 400 / 500 vs heading 600 and 106 semibold/bold hits | **Display ExtraLight 200. Interface Regular 400 / Medium 500. Card titles may be `font-semibold` (discover-legal). `font-bold` page titles are defects.** |
| `DESIGN.md` display tracking vs discover `tracking-[-0.055em]` / `text-[2.75rem]` | **Discover class strings are the law.** Tokens copy those values. Do not "correct" them toward an older written scale. |
| Airbnb listing cards vs "do not use generic card grids" | **Market discovery may use listing cards** (already embodied). Operator records, comparison, and purchase state use rows. Never nest a bordered card in a bordered card. |
| Sentence case vs discover uppercase eyebrows | **Interface copy is sentence case.** Discover-legal exception: medium tracked uppercase eyebrows without marker. Mono uppercase public *actions* (`[data-ae-site-button]`) remain. |
| Craft-floor "delete the kicker" vs live discover | **Discover wins.** Do not delete legal eyebrows. |
| Stone / Gold | **Stone is dark-mode muted text.** Gold stays logo-only. |

Discover-legal class strings (do not ban; freeze on the three SoT files):

- Hero eyebrow: `text-xs font-medium tracking-[0.12em] text-muted-foreground` (`THE TOOL MARKET`)
- Hero display: `max-w-xl text-[2.75rem] leading-[1.02] font-extralight tracking-[-0.055em] lg:text-6xl xl:text-7xl`
- Hero deck: `max-w-lg text-sm leading-relaxed text-muted-foreground lg:text-base`
- Collection kicker: `mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground`
- Collection title: `text-2xl font-medium tracking-tight sm:text-3xl`
- Collection pill: `rounded-full border-border/70 bg-card`
- Listing card: `border border-border/70 … shadow-none … hover:-translate-y-1 hover:shadow-float`
- Card title: `text-lg font-semibold leading-snug tracking-tight`

---

## 3. The 8 inviolable design-system rules

```text
1. Single visual law — DESIGN.md + globals.css. No local palette, type, radius, shadow, or duration systems.
2. Token completeness — Every visual decision has a named token. Type size and weight join colour, motion, space, and radius.
3. Primitive-first harvest — Restyle Tier 1 / Tier 2 once. Feature files consume primitives.
4. Two dialects, one system — Editorial and compact share tokens. Display type does not enter forms, tables, or status views.
5. Stepped type — Discover scale. Sentence case except legal eyebrows and mono public actions.
6. Structure before decoration — Whitespace, then hairline, then elevation. Forest is jewelry.
7. Interaction language — 150 / 220 / 300 ms. Card lift. Kowalski press. No decorative motion. prefers-reduced-motion is mandatory.
8. Contract only tightens — scanUiContract and theme-token-parity grow rules. They never drop a ban to make a harvest green.
```

---

## 4. What already holds (do not redo)

App shell, Base UI, code quality, and user/org campaigns stay closed. Existing `scanUiContract` raw-colour / `transition-all` / generic-shadow bans stay. Overlay scrim, motion ladder, and theme-token-parity stay.

The three discover SoT files are **not** harvest targets. They are the law.

---

## 5. Target token additions (Wave 1)

Add to `globals.css` `@theme inline` + `:root`. Values **copied from SoT files**, not from the older IceInVein survey scale.

| Token | Value (from discover) | Role |
| :--- | :--- | :--- |
| `--ae-text-caption` | 0.625rem / 1.35 (`10px`) | Collection kicker |
| `--ae-text-eyebrow` | 0.75rem / 1.35 | Hero eyebrow (`text-xs`) |
| `--ae-text-deck` | 0.875rem / 1.625 | Deck / secondary body |
| `--ae-text-body` | 1rem / 1.55 | Default body |
| `--ae-text-title` | 1.5rem / 1.25 | Collection title (`text-2xl`) |
| `--ae-text-title-lg` | 1.875rem / 1.2 | Collection title `sm:text-3xl` |
| `--ae-text-display` | 2.75rem / 1.02 | Hero display |
| `--ae-tracking-eyebrow` | 0.12em | Hero eyebrow |
| `--ae-tracking-caption` | 0.14em | Collection kicker |
| `--ae-tracking-display` | -0.055em | Hero display |
| `--ae-weight-extralight` | 200 | Display |
| `--ae-weight-regular` | 400 | Body |
| `--ae-weight-medium` | 500 | Eyebrow, collection title, labels |
| `--ae-weight-semibold` | 600 | **Listing card titles only** |

Radius roles (already present — name the use): control `--radius-md`; chip `rounded-full`; card `--radius-card`; overlay `--radius-xl`; public nav existing pill.

Card lift: existing `--shadow-float` (`--shadow-med`). Do not add a generic `shadow-md` product recipe.

Heading base weight 600 in `@layer base` is a leak. Point product headings at Medium 500 unless they are display (200) or listing-card titles (600).

`.font-display` must be ExtraLight 200, not 300.

---

## 6. Harvest method

Do not restyle a feature file by sprinkling new utilities.

```text
1. Scout names every local recipe against discover grammar.
2. Map each recipe onto an existing primitive or a missing Tier-2 primitive.
3. If unique and justified, add it to the primitive (second real use required).
4. If unique and unjustified, delete it.
5. Feature file consumes the primitive. Local visual utilities drop to layout only.
```

---

## 7. IA and composition (Wave 4)

IA is language and composition continuity across the six `PRODUCT.md` journeys, plus **one application frame**. Operator nav labels stay sentence case and map to `CONTEXT.md` objects. Do not rename routes.

**One-shell law (`DS-35`–`DS-38`).** The website header, operator sidebar, and chat header each grew a full application. Together they duplicate brand, account, workspace, appearance, and primary navigation. The product is one application. `AeAppShell` owns global controls. Pages own titles, filters, local tabs, and task actions. Chat keeps transcript, composer, history, and “New conversation”; it is not a second app. Settings become one modal with labelled personal/workspace scope; existing settings routes open that same experience until their functions are covered, then the duplicate screens go.

Signed-in primary destinations: Market, Agents, Calls, My tools. Public introduction may keep “For agents” and “For providers”. Closing settings returns the user to the task they were doing.

Canonical page pattern: hero + kicker/title/deck + object rail. Centered marker-heroes and `01` icon-card grids are defects.

**Discovery output (`DS-39`) is separate.** One concise recommendation and one comparison surface. Do not mix Jev ranking work into the shell harvest.

---

## 8. Skills and evals

Routing and required artifacts live in the protocol §§3 and §5. Taste is trained by discover + named skills, not by "make it nicer."

**Impeccable modes.** Public editorial = Persuade that must still operate. Operator = Operate. Legal/help = Read. Do not run 7xl hero or ink panels on routine operator records.

**Craft-floor override:** do not delete discover-legal eyebrows.

**Out of bounds:** `overdrive`, `bolder`, `new-work`, `huashu-design`, `brand-design`, decorative `animate`.

Jev inference evals are out of this campaign. Design evals are Layer A/B/C in the protocol.

---

## 9. Wave plan (`DS-01`–`DS-39`)

| Wave | Focus | IDs |
| :--- | :--- | :--- |
| **1. Law, tokens, kits, eval harness** | `DESIGN.md`, discover tokens, SoT guards, `AeSite*` + Tier 1 + operator headers | `DS-01`–`DS-10` |
| **2. Public journeys** | Every public surface as editorial-discover composition | `DS-11`–`DS-19` |
| **3. Operator journeys** | Compact discover dialect on the one-shell, not on nested frames | `DS-20`–`DS-29` |
| **4. IA, one-shell, close** | Names, rail, lift, **one application frame**, ratchet → 0, programme re-audit | `DS-30`–`DS-39` |

`DS-35` (map) and `DS-36` (Market/chat reference shell) run before Wave 3 rematerializes operator chrome. Wave 3 type harvest on duplicated headers/sidebars is wasted work.

No later wave starts until the prior wave's scorecard is `COMPLETE` and Orchestrator has re-measured that wave's eval layers, except the one-shell cluster which is authorized to start as soon as Stage 1+2 scouts freeze `DS-35`.

---

## 10. Explicit cuts

- No new font.
- No gold accent, no second green, no gradient, no shimmer, no page-load theatre.
- No component library migration (shadcn/Base UI stay).
- No Storybook.
- No rewrite of Clerk or Stripe hosted surfaces beyond `clerk-appearance.ts`.
- No IA that invents product objects.
- No restyle of the three discover SoT files.
- No deletion of discover-legal eyebrows.
