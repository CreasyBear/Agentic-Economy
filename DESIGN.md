# Agentic Economy design system

**Status:** active product design contract

**Revised:** 2026-09-02

Agentic Economy should look like the place where a consequential market decision
can be inspected, made and recovered. The interface is a market terminal for one
bounded outside purchase. It is not an app directory, a generic SaaS dashboard
or an accounting package.

The human interface and machine interface are projections of the same facts and
allowed transitions. No dashboard may contain authority, recovery or money
state that an authorised agent can discover only by screen-scraping or support
intervention.

The visual grammar follows the Twenty public site and owner product: white data
surfaces on a neutral field, near-black actions, one violet-blue accent,
near-square radii, hairline structure, aligned numeric values and stepped
grotesk type. Restraint matters because commercial state and provenance need to
remain visible.

## What the interface must make legible

Every consequential view answers five questions without forcing the reader to
reconstruct the transaction:

1. What exact Tool is being considered or purchased?
2. Who is the Business Principal, acting Agent Principal, Provider and Seller?
3. What authority, money, information and external effects are exposed?
4. What has Agentic Economy observed, and what remains claimed or unknown?
5. What action is valid next, and what will it change?

Commercial roles must not be hidden behind wallet addresses, business logos or
generic labels such as "merchant". A payment recipient may be shown where
relevant, but it must not replace the Seller or Provider.

## Product modes

1. **Public.** The category and institutional argument. Generous composition,
   one serif display line, mono uppercase actions and sparse construction marks.
2. **Market.** Compact search, optional public detail/comparison and the
   authenticated Tool Quote that creates a Quote. Use structural
   rows, aligned numbers, progressive disclosure and visible provenance.
3. **Operator.** Quiet work areas for Accounts, spending policies, Provider publication,
   purchases, recovery and records. Use compact controls and persistent
   navigation. Display type does not enter forms, tables or status views.

The same object retains the same name and state across all three modes. Public
language may be shorter, but it must not invent a simpler commercial model.

## Type

- `font-sans` (Host Grotesk) carries interface text, prose, headings, forms and
  controls.
- `font-mono` (Azeret Mono) carries prices, amounts, identifiers, timestamps,
  code, keyboard hints and values whose alignment matters.
- `font-display` (Aleo 300) carries one public display statement per page and
  nothing else.

Type is stepped, not viewport-fluid. Headings use a line-height near 1.1 and
body text uses 1.55. Headings use `text-wrap: balance`. Do not switch typefaces
inside one heading. Buttons use uppercase mono at 12px. Ordinary section labels
remain ordinary-case sans.

## Shape and structure

- The base radius is 2px. Controls, buttons and rows are crisp and near-square.
- The floating public navigation is the only persistent rounded shell.
- Market rows and tables use alignment and hairline dividers instead of
  individual cards.
- Cards are reserved for objects that genuinely sit above the page or contain a
  self-contained action, such as a modal, compare tray, Call evidence or recovery
  panel.
- Whitespace establishes the first level of grouping. A border is the second.
  Elevation is the last.

Never place a bordered card inside another bordered card merely to show
hierarchy. The information model should create the hierarchy.

## Surfaces, colour and elevation

Use three surface levels: canvas (`--ae-bg`, `#f4f4f4`), sunken work area and
raised surface (`--ae-surface`, `#ffffff`). Structural borders use
`--ae-border`, black at 10%.

Near-black `#1c1c1c` is the action colour. Violet-blue `#4a38f5`
(`--ae-brand`) marks links, selection, focus and information. It does not fill
buttons or broad surfaces. Green, amber and red appear only for literal state
and always with text or an icon. Muted text uses black at 60%; use black at 70%
where the AA contrast floor requires it.

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

- Business Principal, Account, Agent Principal and spending-policy version;
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

An Agent Principal view shows its own spending policy, remaining limits, permitted
shared-balance facts, Calls and recovery. A Business Principal view shows the
whole Account and attribution by Agent Principal. Credential identity is audit
evidence, never the owner of a budget or balance.

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
