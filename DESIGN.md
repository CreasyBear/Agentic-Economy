# Agentic Economy design system

**Status:** active product design contract

**Revised:** 2026-09-21
Aligned to aecon brand guidelines (PDF, 2026-09). Lived visual law is
`/market?view=discover` (`DirectoryHero.tsx`, `DirectoryHomeDiscovery.tsx`,
`DirectoryToolCard.tsx`). Those three files are frozen. Every other surface is
harvested onto that grammar (`docs/operations/design-system-maturity-protocol.md`).

## Current app and market direction

The working platform is `app.aecon.ai`; `aecon.ai` is the separate marketing
website. The app opens directly into the Tool market and uses a compact neutral
footer. Approved AECON marks, Manrope type and the chalk/forest palette come from
the maintained local marketing website.

Discovery uses familiar Airbnb-style listing cards and responsive filters,
with sourced MIT-licensed Spree Storefront patterns and installed UI components.
Cards show useful service, Provider and price information; tables remain useful
for comparison and operational records. This direction supersedes the older
Twenty palette, typography, near-square shape and row-only market rules.
Twenty 2px radius and "delete the kicker" are leftover written law — they are
not current. The requirements for truthful authority, money, provenance and
recovery remain.

Agentic Economy should look like the place where a consequential market decision
can be inspected, made and recovered. The interface is a market terminal for one
bounded outside purchase. It is not an app directory, a generic SaaS dashboard
or an accounting package.

The human interface and machine interface are projections of the same facts and
allowed transitions. No dashboard may contain authority, recovery or money
state that an authorised agent can discover only by screen-scraping or support
intervention.

The lived visual grammar is discover: chalk field, charcoal action, one forest
accent, ExtraLight display, medium tracked uppercase eyebrow without a marker,
website radius scale, hairline listing cards with hover lift, collection rails,
aligned numeric values. Public editorial pages use that composition. Operator
pages use the same tokens at compact density. Restraint matters because
commercial state and provenance need to remain visible.

### Feel

Agentic Economy feels like the Airbnb of the agentic economy, not a trading
desk: Tools are listings, Providers are hosts, and trust comes from Qualified
Use and provenance. Customer-facing surfaces must not use tickers, time-window
selectors, movers or sparklines.

## What the interface must make legible

Every consequential view answers five questions without forcing the reader to
reconstruct the transaction:

1. What exact Tool is being considered or purchased?
2. Who is the Customer, acting Agent, Provider and Seller?
3. What authority, money, information and external effects are exposed?
4. What has Agentic Economy observed, and what remains claimed or unknown?
5. What action is valid next, and what will it change?

Commercial roles must not be hidden behind wallet addresses, business logos or
generic labels such as "merchant". A payment recipient may be shown where
relevant, but it must not replace the Seller or Provider.

## Product modes

Two dialects, one system. Tokens never fork.

1. **Public / editorial-discover.** Generous composition: left ExtraLight
   display, medium tracked uppercase eyebrow without a marker, collection rails,
   listing cards. Mono uppercase actions remain the public-action exception.
2. **Market.** Discover is the ideal. Search, compare, providers and saved use
   the same card, pill and rail grammar. Comparison and operational records stay
   tabular. Authenticated Tool Quote remains the caller-specific decision view.
3. **Operator / compact-discover.** Quiet work areas for Accounts, spending
   policies, Provider publication, purchases, recovery and records. Same tokens
   at workbench scale: medium titles, muted decks, hairlines. Display type does
   not enter forms, tables or status views. No 7xl hero. No second weight language.

The same object retains the same name and state across all three modes. Public
language may be shorter, but it must not invent a simpler commercial model.

## Type

- `font-sans` (Manrope, `--ae-font-sans`) carries interface text, prose,
  headings, forms and controls at Regular 400 or Medium 500. Listing card titles
  may use `font-semibold` (discover-legal). `font-bold` page titles are defects.
- `font-mono` (`--ae-font-mono`) carries prices, amounts, identifiers,
  timestamps, code, keyboard hints and values whose alignment matters.
- `font-display` (Manrope, `--ae-font-display`) carries one public display
  statement per editorial page, set ExtraLight 200 with discover tracking
  (`-0.055em` on the hero). Values are the tokens copied from
  `DirectoryHero.tsx`, not an older written scale.

Type is stepped. Discover names the steps (caption, eyebrow, deck, title,
display). Headings use `text-wrap: balance`. Do not switch typefaces inside one
heading. Interface copy is sentence case, including buttons, labels and
headings; do not title-case.

**Discover-legal eyebrow.** Medium weight, tracked uppercase, no `SiteMarker`.
`impeccable` craft-floor bans kickers; this contract overrides that ban. Do not
delete legal eyebrows. The remaining ban is a marker-dot product eyebrow.

## Shape and structure

- Use the approved website radius scale in `globals.css`. Controls use
  `--radius-md`. Cards use `--radius-card`. Filter and collection chips use
  `rounded-full`. Twenty 2px is leftover and must not be restored.
- The floating public navigation is the most rounded persistent shell.
- Market discovery may use listing cards (hairline, optional hover lift).
  Comparison, purchase state and operator records use rows, tables and hairlines.
- Cards are for objects that sit above the page or contain a self-contained
  action. A Tool listing is such an object. A table row is not.
- Whitespace establishes the first level of grouping. A border is the second.
  Elevation is the last. Card lift uses `--shadow-float`, not generic
  `shadow-md`.

Never place a bordered card inside another bordered card merely to show
hierarchy. The information model should create the hierarchy.

## Surfaces, colour and elevation

The brand palette (Brand guidelines, p.7):

| Colour   | Hex       | Role                                          | CSS token                        |
| -------- | --------- | ---------------------------------------------- | --------------------------------- |
| Forest   | `#24543D` | Primary, artwork and identity, links, focus    | `--ae-brand` (`--ae-brand-strong`, `--ae-ring`, `--ae-info`) |
| Charcoal | `#141414` | Primary dark surface, action colour            | `--ae-fg`                         |
| Chalk    | `#E8E4DA` | Light surface, body text on dark               | `--ae-bg` (`--ae-on-brand`, `--ae-primary-fg`) |
| Stone    | `#AAA89E` | Supporting; dark-mode muted text               | `--ae-muted-fg` in `.dark`        |
| Gold     | `#E5AA35` | Logo endpoint only, restricted, never a UI accent | no token                       |

Use three surface levels: canvas (`--ae-bg`), sunken work area
(`--ae-surface-sunken`) and raised surface (`--ae-surface`). Structural
borders use `--ae-border`.

Charcoal `#141414` (`--ae-fg`) is the action colour. Forest `#24543D`
(`--ae-brand`) marks links, selection, focus and information. It does not fill
buttons or broad surfaces. Green, amber and red appear only for literal state
and always with text or an icon. Muted text uses `--ae-muted-fg`; check the AA
contrast floor before relying on it for body copy. Gold never appears as a UI
accent; it is reserved for the logo endpoint.

Use only the established shadow levels: header `0 1px 3px 0 rgba(0,0,0,.06)`,
popup `0 12px 32px rgba(0,0,0,.08)`, dark popup
`0 12px 32px rgba(0,0,0,.4)` and card lift
`0 12px 32px -16px rgba(0,0,0,.18)`.

## Motion

Motion acknowledges interaction or explains a state change. Use the existing
150, 220 and 300 millisecond ladder with the standard
`cubic-bezier(0.22,1,0.36,1)` or emphasised
`cubic-bezier(0.16,1,0.3,1)` easing. The button hover is the existing 260
millisecond ink wash.

Do not add decorative page-load animation, shimmer, orbit or perpetual motion.
Respect `prefers-reduced-motion`.

## Canonical Tool composition

Every public Tool view should read in this order:

1. Tool identity, version and bounded contribution.
2. Provider identity, evidence and readiness.
3. Fixed buyer-facing Seller and total buyer consideration.
4. Exact inputs, outputs, terms, data use and possible external effects.
5. Decision evidence, provenance, freshness and exclusions.
6. Authority required and the next valid action.

Do not show one blended "Provider" row. The Provider performs the Tool.
Agentic Economy is the Seller for supported principal-reseller purchases. If the
current implementation cannot establish a role, show it as unresolved rather
than inferring it.

## Quote composition

`tool.quote` is the one caller-specific decision view before consequential
action. It combines the selected Tool's material detail with current caller
viability and, when admitted, returns a Quote. It must show:

- Customer, Account, Agent and spending-policy version;
- exact Tool and Provider version;
- fixed Seller;
- total buyer consideration, currency and expiry;
- information destinations and external effects;
- accepted terms and evidence standard; and
- retry, cancellation and recovery consequences.

The primary action names the consequence. "Quote and Call" is preferable to
"Continue" when the action reserves funds and releases information.

## Purchase and closure composition

A purchase record keeps related facts together without pretending they are one
state:

- buyer consideration and Charge;
- Provider obligation and Payout state;
- Call and Provider delivery observation;
- payment-rail settlement evidence;
- current commercial state;
- adjustment, refund or recovery history; and
- provenance and retention information.

Settlement, delivery and commercial closure each receive their own label. A
green payment state must never make an uncertain delivery look complete. Open
exposure uses an explicit state and one safe next action.

## Evidence language

Unknown, stale, Provider-claimed, Agentic Economy-observed, buyer-reported and
derived facts remain visually and verbally distinct. Do not use confidence
colour as a substitute for provenance. Do not describe a successful HTTP
response as useful, accepted or commercially closed without the evidence for
that claim.

## Machine parity

Every consequential UI state must map to the action-specific versioned agent
contract: stable references, exact money, material unknowns, current state and
at most one machine continuation plus an optional owner handoff. The human view
may expand explanation; it may not create a different lifecycle, a menu of
invalid actions or an unnamed transition.

An Agent view shows its own spending policy, remaining limits, permitted
shared-balance facts, Calls and recovery. A Customer view shows the whole
Account and attribution by Agent. Credential identity is audit evidence, never
the owner of a budget or balance.

Treasury remains operator-only detail. Buyer and agent views show whether a Call
is currently supportable and what is safe next, not wallet addresses, pool
selection, signing material or internal FX mechanics.

## Hard constraints

- Use one accent colour. Semantic colours carry literal state only.
- Do not use generic card grids for dense market or purchase data.
- Do not nest boxes where spacing or one divider expresses the relationship.
- Do not place duplicate actions with the same intent in one normal page state.
- Do not add a visual pattern without a second real use.
- Do not introduce local palette, type, radius or shadow systems. Values come
  from `src/styles/globals.css`.
- Do not simplify away Provider, Seller, authority, consideration, uncertainty
  or remedy on a consequential screen.
