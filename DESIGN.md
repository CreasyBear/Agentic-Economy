# AE Design System: Astryx Era

This document is the visual/UI authority for Agentic Economy. The previous
identity ("Daylight Register": Fraunces/amber/paper, hand-drawn hero, bespoke
`Ae*` component system, handwritten CSS files) is **retired**. Do not extend it;
migrate away from it.

## 0. Brand authority: the action layer

Agentic Economy is an **action brand, not a trust brand.** Trust — receipts,
written threads, source stamps — is plumbing: the brakes in a Porsche, never the
posture. What the brand feels like is **momentum**: the distance between asking
and done, collapsing in front of the person using it.

The north star is felt, not printed on a page — **we will build the domestic
agentic economy.** Design expresses that as trajectory and conviction, never as a
claim to capability that has not shipped.

- **The hero** is the household's "it's sorted" moment: the exhale when the thing
  is handled in writing, with a record they can keep. Every screen should move
  someone toward that exhale.
- **The enemy** is *the halfway.* AI search hands you "the best businesses in your
  area," then abandons you with the real work — deciding, contacting, chasing,
  agreeing. The list is where the answer stops and where AE starts; the design
  reads as the step past the list, never the list itself.
- **The feel** is internally described as **kinetic calm**: fast, calm,
  one green accent, written record, forward motion. Use the term as
  identity-system shorthand, not as public copy. Public surfaces should feel
  like the ask is moving without looking frantic: soft radii, warm canvas, one
  eucalyptus accent, generous space, and flat written records. Space and warmth
  keep it human; the accent, receipt, and handoff carry the sense that something
  is moving and lands — never a static badge, never machinery performing for
  show.

**Register split (updated by council convergence).** The identity runs on two
public registers, both grounded in the master promise:

- **One drenched hero moment.** The home hero is the single deep-eucalyptus brand
  field — master-promise register, full-bleed, one screen, no scroll. It should
  read as plain confidence and forward motion, not founder swagger.
- **Warm/light product register everywhere else.** Every other surface is white
  cards on a warm canvas with eucalyptus as the single accent — momentum carried
  by clarity and pace. At most one bg-accent, text-on-accent moment per page for
  continuity.

**The mark.** The octagonal AE seal is retired: a seal certifies stasis, and an
action brand cannot lead with a stop sign. The replacement direction is
**Slipstream** (`.planning/brand/MARK-BRIEF-2026-07-04.md`) — two converging
strokes whose open apex *is* the halfway, resolving into a single eucalyptus node
that reads as *done.* Motion and completion, not a badge. Refuse checkmarks,
shields, roundels, and handshakes on sight.

Brand voice, story, and messaging live in `.planning/brand/BONES-2026-07-04.md`
(locked skeleton), `.planning/brand/MANIFESTO-MESSAGING-2026-07-04.md` (manifesto
and voice contract), and `.planning/brand/COMPETITOR-BRAND-SCAN-2026-07-04.md`
(open territory). This document is the visual/UI authority that serves them.

North-star references stay pragmatic: Airbnb and Google Maps for inviting,
place-forward discovery; Stripe for the record object; Perplexity for claims
beside sources. Never copy lead-selling urgency, star-rating theatre, AI
gradients, or source-washing.

## 1. The system

- **Component layer:** [Astryx](https://github.com/facebook/astryx)
  (`@astryxdesign/core`) with `@astryxdesign/theme-neutral`, `mode="light"`.
  Providers (`Theme`, `LinkProvider`, `LayerProvider`) are wired once in
  `src/routes/__root.tsx`. Internal navigation goes through
  `src/components/astryx/RouterLink.tsx` (TanStack Router adapter).
- **Utility layer:** Tailwind 4 (CSS-first, no config file) for layout glue:
  spacing, flex/grid arrangement, responsive breakpoints, using the Astryx
  token bridge (`@astryxdesign/core/tailwind-theme.css`).
- **Style entry:** `src/styles/globals.css` owns the layer cascade
  (`reset → theme → base → astryx-base → astryx-theme → components → utilities`).
  `src/styles/legacy.css` is the retiring old system; it only shrinks.
- **Brand-token layer:** AE overrides theme-neutral semantic CSS variables in
  `src/styles/globals.css` inside `@layer astryx-theme` under
  `@scope ([data-astryx-theme="neutral"]) to ([data-astryx-theme])`. The live
  implementation in `globals.css` is the map. Do not add a separate CSS file or
  route-local palette.

## 2. Rules

1. **Astryx first.** Reach for an Astryx component or pattern before writing
   anything. `npx astryx component <Name>` for docs, `npx astryx template --list`
   for page/block templates. A local clone for source reference lives at
   `/tmp/astryx` during migration.
2. **Tailwind is glue, not a design system.** Utilities arrange Astryx
   components; they do not restyle their internals. Use semantic bridge classes
   (`text-primary`, `text-secondary`, `bg-surface`, `bg-card`, `bg-body`,
   `border-border`, `rounded-md`, `shadow-sm`). Raw hex/oklch literals and
   arbitrary-value classes are prohibited outside a token definition.
3. **No new bespoke CSS files.** No additions to `src/styles/` beyond
   `globals.css`. If a component gap is real, first compose Astryx primitives;
   if that fails, `npx astryx swizzle <Name>` and own the ejected source under
   `src/components/astryx/`.
4. **No parallel component systems.** shadcn/radix/cva components
   (`src/components/ui/*`) are legacy; do not add to them or import them in new
   code. One import per concern: dialogs are Astryx `Dialog`, toasts are Astryx
   `useToast`, tables are Astryx `Table`.
5. **Typography and icons come from the theme.** Use theme-neutral's grotesk
   scale. Use the theme/platform mono role for receipt IDs, timestamps, source
   stamps, and docket numbers. No font packages, no ad-hoc `font-family`.
6. **One accent only.** Eucalyptus is the only brand accent. It may appear on
   primary CTAs, active proof steps, mono kickers, link-hover states, and stamps.
   Danger/warn/status colors stay functional Astryx semantics; Clay is imagery
   punctuation only and never a CTA.

## 2a. Palette and token authority

The AE palette supersedes neutral-default color guidance while still flowing
through Astryx theme-neutral semantic tokens:

| Role | Hex | Astryx binding |
| --- | ---: | --- |
| Ink | `#20261F` | `--color-text-primary`, primary marks, dark record surfaces |
| Canvas | `#F6F5F1` | `--color-background-body` (warm, bright page ground) |
| Surface | `#FEFEFC` | `--color-background-surface` (raised panels) |
| Card | `#FFFFFF` | `--color-background-card`, `--color-background-popover` |
| Muted | `#E9E7DF` | `--color-background-muted`, quiet chips/fills, `--color-skeleton` |
| Slate | `#5C625A` | `--color-text-secondary` |
| Eucalyptus | `#40614F` | `--color-accent`, `--color-text-accent`, `--color-icon-accent` |
| On-accent | `#FDFDFB` | `--color-on-accent` (text/icons on eucalyptus, passes AA) |
| Sage | `#8AA396` | `--color-border-emphasized`, accent-muted tints, disabled marks |
| Border | `#E5E4DD` | `--color-border`, rules/table lines |

Public UI should read fast and calm: white cards lifting off a warm canvas with
soft elevation and generous space, Eucalyptus as the single accent at roughly
five to eight percent of the surface, and written records that make the next
step clear. No amber, purple, teal, gradient CTAs, glowing AI maps, glass,
blobs, or colored proof side-stripes. The retired Clay/oxblood accent and the
old warm-beige "paper/bone" grounds are gone; warmth now comes from imagery,
space, and soft rounding, not from a muddy cream wash.

Rounding is soft and inviting: 8px inner, 10px controls, 14px cards/containers,
16px pages; pills only for true status/avatar shapes. Elevation is a soft warm
shadow that lifts cards off the canvas (never pure-black depth); hover lifts a
card with a slightly larger shadow.

Sage and Border are not body-text colors. They are structural/support colors;
Eucalyptus carries accent text when contrast matters.

## 2b. Hero objects

Four objects carry the AE visual language and should be preferred over generic
marketing panels. They are momentum made visible — the ask turning into something
that moves — not trust theatre. Trust is the plumbing that keeps the motion safe;
these objects show the motion.

1. **Qualified-inquiry receipt / docket.** The conversion object — not a proof
   badge but *the moment it starts moving, in writing.* Stripe-grade record with
   receipt ID, business, request, what AE sent, what happens next, timestamp, and
   a keep/copy affordance. Momentum reads first ("your inquiry is written and
   ready to send"); the contract line stays where required ("AE has not booked,
   charged, or confirmed.") as one clean fact, never a defensive drumbeat.
2. **Proof spine.** Published → source/freshness checked → inquiry sent →
   business reply. Hairline connectors, mono timestamps, dot states; reached
   steps use Eucalyptus by value/weight, not a second green.
3. **Source/freshness stamps.** Mono marks beside facts such as `business
   supplied · 12 Jun`, `last checked · 14 Jun`, and `owner reply required`.
   Never use "Verified" without a named standard.
4. **Comparison ledger.** Google-Flights-honest table of published facts across
   providers: service area, published services, response window, receipt status,
   and source note. AE never invents price or availability.

## 2c. Voice and copy

Public voice is **plain action confidence**: direct, concrete, and pointed
toward the next step. It leads with the master promise register, not the
internal founder register. The full contract is
`.planning/brand/MANIFESTO-MESSAGING-2026-07-04.md`, as corrected by
`.planning/brand/COUNCIL-CONVERGENCE-2026-07-05.md`.

- **Public / campaign / hero surfaces — master-promise register.** Plain
  confidence, household language, one forward promise. "Ask once. It gets
  sorted." Say the afternoon: ten tabs, voicemail, one ask in writing. Do not
  print the internal WE WILL triple on public or campaign surfaces.
- **Product surfaces — exact and momentum.** The same confidence with concrete
  nouns. The swagger of a receipt is exactness and pace, not adjectives: "One
  ask out. One written record back." State what happened, then point forward.

Non-negotiables:

- **Momentum over apology.** Say what is happening and where it goes next. Cut
  hedged "we hope to eventually help connect you."
- **Contract facts stay small.** One line where the contract needs it: what
  shipped, what comes next, where the handoff sits. Never inventory missing
  powers.
- **Never fabricate capability.** Ambition is trajectory ("we are building toward
  where answers become action"); capability copy is only what ships today —
  qualified inquiries and written records, not booking, payment, or dispatch.
- **No hollow marketing words.** If a competitor could paste the line onto their
  site unchanged, cut it. Banned: unique, revolutionary, world-class, seamless,
  empower, and "In conclusion".
- **Household-real, not economist.** Speak the afternoon — ten tabs, three quotes
  you can't line up, voicemail — never the market. "Domestic trade" is banned.

## 2d. Motion

Motion clarifies state, hierarchy, and spatial change; it is not decoration.
Default UI motion uses the Astryx-layer contract in `src/styles/globals.css`:
`fast` 120ms, `base` 200ms, `slow` 300ms; `standard` for most transitions
and `emphasized` only for a single important arrival. Default to ≤250ms.
Reserve the slow token for route/progress, drawers, or a large panel settling;
never exceed roughly 300ms for product UI. Use one lift and one press scale,
GPU-only `transform`/`opacity`, visible focus, and 44px touch targets. Honor
`prefers-reduced-motion` so the same state renders instantly. No purple
gradients, glass, blobs, bounce, scroll-jacking, or theatrical hero fades.

## 3. Surface conventions

| Surface | Shape |
| --- | --- |
| Public (`/`, `/registry`, `/$slug`, legal) | `AppShell` + `TopNav` (logo heading, nav items, single CTA). Content templates: an inviting discovery hero (asymmetric, warm, image or product-object led, never centered-everything), `product-gallery` for the registry, `detail-page` for listings. |
| Chat/answer (`/`, `/t/$threadId`, `/q/$answerId`) | Astryx `Chat*` family: `ChatMessageList`, `ChatComposer` (streaming state), `ChatToolCalls` for research/tool traces, `Citation`/`CitationSourceList` for sources, `useStreamingText` for reveal. The answer-contract profiles (`.planning/ANSWER-AI-CONTRACT.md`) still govern structure and budgets. |
| Owner (`/owner/*`) | `AppShell` + `SideNav`; `detail-page` for threads/receipts; `settings` template for account-ish pages; `Table` for lists. |
| Admin (`/admin/*`) | `AppShell` + `SideNav`; `table-page` / `table-grouped` patterns with `Toolbar` filters and `Badge`/`StatusDot` status. |
| Forms (`/$slug/inquiry`, `/claim`) | `FormLayout` + `Field` components; `form-two-column` / `contact-form` shapes; one primary action per viewport. |
| Feedback | `Banner` (persistent), `useToast` (transient), `EmptyState`, `Skeleton`/`Spinner`. |

Public surfaces must make at least one of the four hero objects visible when a
handoff, proof, source, or provider comparison is the point of the screen. Avoid
uniform three-column icon grids; use receipt, spine, stamp, or ledger structure
instead.

## 4. What stays custom

Behavioral modules keep their logic and re-skin on Astryx primitives: answer
streaming/turn state (`answer-stream.ts`, `turn-stream-session.ts`), the map
artifact, observability boot/error boundary, funnel attribution. Presentation
belongs to Astryx; state machines belong to AE.

## 5. Product constraints

- Voice and copy follow §2c: plain action confidence, momentum over apology,
  boundaries as facts not personality, and never fabricate capability.
  "Verified" only against a named standard.
- `KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP` never appear on human surfaces.
- No internal architecture or implementation vocabulary on public surfaces.
- One primary action per viewport on conversion paths
  (card → `/$slug` → inquiry CTA → `/$slug/inquiry`).
- Anti-slop still applies: no purple gradients, no 3-column icon grids, no
  centered-everything, no gradient CTAs, no glassmorphism.
- Imagery is welcome and carries the marketplace warmth, but only honestly.
  Prefer owner-supplied photos when a listing provides them. Otherwise use
  clearly-generic category or place imagery (a category or neighbourhood mood,
  warm natural grading) that can never be mistaken for a specific provider's own
  work. Imagery must never imply completed booking, payment, dispatch,
  availability, ratings, or endorsement, and generic imagery must never be
  labelled as a named business's own photo.
