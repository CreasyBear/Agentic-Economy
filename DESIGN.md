# Agentic Economy design system

**Status:** active product design contract

**Revised:** 2026-10-07
Aligned to aecon brand guidelines (PDF, 2026-09). The lived visual reference is
`/market` (`MarketLanding.tsx`) for the opening, and the Arc Tool and Host
compositions for discovery results.

## Arc Tool market pilot

Joel's 1 October direction replaces the existing listing recipes with Arc
blocks on the migrated Tool discovery/search, comparison and detail surfaces.
Compose those regions from the licensed Arc `product-listing`, `product-detail`
and `comparison-table` sources: a contribution gallery, a published-example
showroom and a grouped decision matrix. Use expressive geometry and purposeful
interaction while retaining exact identities, prices, provenance and valid
next actions. Physical-product carts, invented media, ratings and simulated
success do not describe a Tool.

The pilot uses `.arc-market` on each block and its portal roots. Arc foundation
is scoped there; `src/styles/arc-market.css` maps the existing AE palette and
Manrope fonts onto its tokens. The existing `.dark` appearance owner controls
both systems. Keep Arc's concentric 18/26/34px control/panel/surface radius scale,
44px control heights, 400/500 interface type and source motion presets within
this scope. Forest is the light accent; mint is the dark accent. Main purchase
and navigation actions may retain charcoal/chalk emphasis. Sentence-case labels,
visible keyboard focus and reduced-motion behavior remain required.

These block recipes supersede the ExtraLight, uppercase-eyebrow, compact-radius
and 150/220/300ms recipes below only on migrated surfaces. Unmigrated pages keep
their current system. Current source establishes migrated coverage.
The dated contract and coverage inventory remain in
[the Arc refactor protocol](docs/archive/2026-10-05/designs/arc-ui-refactor/protocol.md).

The scoped bridge adds one CSS boundary instead of per-block palettes or a
second theme controller. Shared motion presets and the `motion` package support
the actual listing/detail sources; retain them for those callers. Do not add
unused catalogue components, a general compatibility wrapper or Next.js for an
image leaf. Arc's global outline suppression is deliberately omitted because
keyboard focus must remain visible.

## Chat presentation

The 7 October chat shell uses licensed [ReUI Chat 3](https://reui.io/blocks/ai-agents/ai-chat/ai-chat-3),
Base Nova. Maintained presentation lives in
`src/components/ae/shared/reui-pro/ai-chat/`: the parent-sized flex shell,
scrollable welcome/Start rows and controlled InputGroup composer. Source comments
record the retrieved registry SHA-256. Inspect upgrades through ReUI MCP and the
shadcn CLI before merging the relevant source regions; do not overwrite shared
primitives or import the demo application. `components.json` names the actual
Base UI family and the authenticated ReUI registry; the license stays local.

Aecon's session owns draft clearing, admission, retries and optional Stop.
The existing transcript/scroller owns real streaming, Tool cards, approvals,
receipts and recovery. Simulated replies, model/context/effort controls and
mock history from the block are excluded. Existing starter prompts still submit
through the session's guarded callback. The same shell serves read-only shares
without a composer. History retains its search and pagination when collapsed;
the app shell registers the live header portal target across authentication.

Keep the existing Aecon theme, 44px touch targets, visible keyboard focus and
reduced-motion rules. The composer and material retention notice remain visible
on short screens; welcome content owns its overflow. Qualify hydrated UI rather
than server-rendered screenshots. Current local evidence covers 320–1440px,
light/dark appearance and mocked anonymous response/recovery; it does not replace
signed-in hosted or paid Call qualification.

## Workspace and operational presentation

The 7 October platform candidate uses the licensed REUI Base Nova compositions:
[App Shell 2](https://reui.io/preview/base/app-shell-2) for the workspace,
[Solution Agents 7](https://reui.io/preview/base/solution-agents-7) for attention and
record inspection, [Profile 2](https://reui.io/preview/base/profile-2) for settings,
[Wizard 1](https://reui.io/preview/base/wizard-1) and
[Dialog 14](https://reui.io/preview/base/dialog-14) for Provider setup, and
[Profile 8](https://reui.io/preview/base/profile-8) for Credit. The existing
record/action sheet owns inspection; do not add a second overlapping inspector.
Chat 3, Arc market compositions, and Fumadocs/Scalar retain their owners.

`AeAppShell` owns the stable frame. `WorkspaceMenu` renders the existing
navigation catalogue inside the header dropdown. The guarded Clerk Account
selector sits beside it and retains its own popup and focus lifecycle. Backend-confirmed current
user, session and organization scope controls privileged destinations. Hiding a
link never establishes authority. `WorkspaceTransitionBoundary` removes old
protected projections when identity changes and waits for committed route data;
timers do not establish readiness. The existing command panel, theme provider,
route focus owner and navigation safety boundary remain authoritative.

Authenticated pages have no global sidebar, sidebar toggle or sidebar preference.
The header menu contains native route links with scoped Provider/Admin submenus;
Base UI owns keyboard navigation, dismissal and collision handling. The public
market stays full-width after sign-in. Chat alone retains its existing conversation
history sidebar. Appearance remains a separate theme control. Menu changes never
replace the routed content, and route focus/navigation safety remain authoritative.

The 8 October settings recut replaces the Settings 7 rail with Profile 2's
horizontal groups, bounded content and section cards. `settingsNavigation` remains
the only destination catalogue: five groups reveal at most three native route
links. The current pathname selects both levels, including nested Clerk security
routes. Real page headings, save/readback owners and navigation guards remain;
there is no demo global Update action. `SettingsLayout.tsx` records the licensed
source hashes. Registry dry-run inspection prevented overwriting shared primitives.

Team uses Profile 2's member grid and [Solution Users 4](https://reui.io/preview/base/solution-users-4)
for the invitation queue/dialog. `TeamAccessManagement` retains revision checks,
MFA and confirmation; `useInviteTeamMember` retains drafts and uncertain outcomes.
Member controls join on durable membership identity and the recorded role. The
whole workspace component resets on Account change. Keep the invitation dialog
mounted in one stable location while initial reads settle. Load-more offsets
remain owner-controlled; search/sort describe their loaded-row scope. Do not add
demo invitation history, totals, roles or bulk actions. The superseded Arc member
composition has no remaining caller and is removed. Arc save bars and specialised
security content retain their existing callers.

The completion review uses [REUI Auth 18](https://reui.io/preview/base/auth-18)
for the sign-in/sign-up split stage. `AeSiteAuthStage` retains its sidebar/form
composition; the licensed grid source is under `shared/reui-pro/auth/` with its
hash. Aecon copy replaces demonstration testimonials and customer logos. The
existing Clerk form, appearance, redirect and verification owners remain intact.
Mobile prioritises the form; the decorative panel is desktop-only. Authentication
pages use compact account help/legal links instead of the full promotional footer.

Account-affecting edits carry the Account they were prepared for to their existing
authority owner. Team explicit reads supersede stale initial reads; an unknown
command closes confirmation and directs focus to observation before another
write. Name editors and usage-alert drafts use the existing navigation safety
boundary. Live source changes must not erase dirty drafts. A lost rename response
is unknown, not proof that the old value is unchanged; retain the exact retry
material and keep already observed success authoritative.

Operational tables use REUI's actual Data Grid with exact TanStack Table 9.2.6.
`AeRecordTable` supplies domain columns, action eligibility, exact comparators,
stable IDs, cursor handoffs and focus restoration. The remaining `AeDataColumn`
adapter translates existing callers into that same table engine. It does not
sort, render or measure another table. Router and Start versions are independent.
Do not convert money to formatted strings for ordering, infer totals from loaded
rows, expose unused bulk actions, or enable spreadsheet writes on audit records.

Complete local collections may sort/filter in the grid. Paginated collections
declare loaded-page scope unless their owner applies constraints before paging.
Provider inventory uses owner-filtered server name/text/date queries and up to
50 records with query-bound opaque cursors. Unknown index readiness is a visible
incomplete state, not an empty search result. Layout controls work without login;
only allowlisted nonsecret column/density choices persist, keyed by user, Account,
table and schema version. Query text, records, selections and authority do not.

Keep upstream layouts and interaction primitives. Registry upgrades are reviewed
in a scratch candidate; never overwrite adapted shared primitives blindly.
`src/components/reui/upstream-manifest.json` records upstream and integrated
hashes and narrow adaptations. Only its two named upstream grid files exceed
the maintained-source size ceiling. All imported code retains strict TypeScript,
security and import checks; Aecon adapters receive no vendor exception.

Use Aecon's existing palette, typography, appearance controller and responsive
tokens. Working and recovery pages use a compact footer. The public-footer
selector must never hide action-card footers. Show accepted Quote facts and
historical unknowns explicitly; current Tool metadata cannot fill missing purchase
facts. Attention, valid recovery and useful output precede financial reporting.
The maturity register owns source and journey evidence; a successful render is
not authenticated or commercial qualification.

## Market discovery composition

The public opening uses the installed Arc `HeroContent` split composition,
approved Aecon mark, Manrope, forest, chalk and gold. `MarketLanding.tsx` owns
this composition and its reduced-motion treatment. Its broad categories use
`listing-evidence.ts` and open ordinary market searches. They are not invented
Provider facet identifiers. Recipient disclosure stays next to the category links.
The landing's large type, near-square gold action and brand palette are explicit
art-direction choices within the existing appearance owner.

Tools use Arc search, filter and listing components. Canonical mixed results
show readable summaries and actual access/price facts, with the existing REUI
Table available for comparison. `MarketAgentHandoff` constructs an explicit send
action from the current need and selected constraints. Chat retains its own
session and purchase authority. A search handoff never clears guest history or
authorizes a Call.

`DirectoryHostsPage` reads the existing Host facet index. Hostname prefixes apply
before opaque pagination. Listing counts cover the indexed Host, while any
example Tool remains a separate fact. `ProviderFacetPicker` uses that same reader
instead of overview's bounded twelve-Host shelf. Its query resets with the Arc
combobox and ignores obsolete responses. Existing Tool-constrained Host links
retain their filters and describe grouped Tool results. Legacy numbered Host
pages keep that older grouping mode; new Host traversal uses only opaque cursors.

Arc's `search-results` block was inspected but not adopted. Its local array
filtering would repeat the discovery-scope problem. Keep owner queries, existing
Arc controls, and one REUI table engine. No new component registry, chat session,
search index or pagination framework is introduced. Mobile categories use the
existing Base UI Collapsible. The Agent action remains a native Link, with its
recipient notice before sending. Native form and aside elements keep their
semantics. Empty filter composition hides Arc's noninteractive empty frame, while
keeping its live toolbar and focus return mounted. Review that narrow DOM/CSS
adaptation when upgrading FilterToolbar. Record browser and local query evidence
separately from hosted qualification in the maturity register.

## Provider entry composition

`/for-providers` uses licensed [REUI Hero 14](https://reui.io/preview/base/hero-14):
its wrapping split header, bottom-aligned action column and wide media frame.
`ProviderHero.tsx` replaces the demo announcement and analytics console with
concrete endpoint copy, the existing Add Tool route and Aecon artwork. The registry
dry run would overwrite shared primitives; only the hero composition was integrated.
Record the retrieved source hash in the component, following Chat 3. The adapted
hero receives no vendor exception in `src/components/reui/upstream-manifest.json`.
Navigation retains link semantics; split headings retain word spacing.

The image was generated for Aecon with image_gen: chalk curves, a forest setting
and one gold endpoint. It is decorative, not evidence of product state. The three
local WebP exports in `public/brand/aecon-provider-market*` share one image; retain
responsive source selection, intrinsic dimensions and the mobile focal point.
The largest export is 116 KB; the 768px source is 19 KB. No animation or new image
runtime is required. Keep Aecon's existing appearance controller and tokens.

`AeSupplyLanding` composes the installed REUI Stepper as a static three-item list
and the existing Arc-backed `AeSiteFaq`. No tab, completion tick or active progress
claim belongs in this anonymous overview. The existing signed-in supply funnel
owns profile, payment-recipient attestation, checks and publication. State the
current x402 v2/Base USDC scope and check costs before that handoff.

The public page is static. Its former twelve-item external-directory projection
was not evidence of published Provider supply. The bespoke gallery and isolated
landing loader are removed; the directory link opens the actual market owner.
Keep compact Help/legal navigation in normal flow. Browser qualification and
authenticated Provider acceptance remain separate in the maturity register.

## Current app and market direction

The working platform is `app.aecon.ai`; `aecon.ai` is the separate marketing
website. The app opens with the branded market landing. Public market pages
omit the site footer. The landing keeps compact Help and legal links in normal
document flow. Approved AECON marks, Manrope type and the chalk/forest palette come from
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
desk: Tools are listings, Providers supply the service, and trust comes from Qualified
Use and provenance. A directory Host identifies an endpoint and is not by itself
a verified Provider identity. Customer-facing surfaces must not use tickers, time-window
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

## Loading and refresh

The 8 October performance candidate reuses the installed Base Nova Skeleton and
Spinner with REUI's [card](https://reui.io/preview/base/components/c-skeleton-8?ref=mcp),
[list](https://reui.io/preview/base/components/c-skeleton-7?ref=mcp) and
[inline status](https://reui.io/preview/base/components/c-spinner-9?ref=mcp)
compositions. Activity's unresolved reports use the shape of its eight real
summary cards; confirmed Calls and Plans remain above them. Deferred Tool search
and inspection use decorative placeholders, never fake rows, prices or controls.
Loading has an announced status and respects reduced motion. Errors retain their
existing explicit recovery action; a skeleton must not conceal a failed read.

Router owns route loading and Market result reuse. The shared Convex provider
owns its client lifetime, and the workspace boundary hides invalid Account/access
context before refreshing. Display reuse never supplies purchase authority.
Keep that boundary mounted through sign-in and sign-up. On identity or access
change, retire native Router cache and preload entries before navigation and again
after the synchronous refresh: invalidation alone leaves old data renderable.
Hidden page content includes its portals and private header slots. The workspace
presentation context carries only visibility; it is not an authority or Account
registry. Shared Base Nova/Arc portal wrappers consume that visibility while
owners retain drafts. Chat additionally waits for its existing authority owner.
Keep the responsive Sonner presenter inside the same boundary, dismiss previous
notifications on transition, and suppress obsolete asynchronous notification
delivery. Preserve accepted command receipts, uncertainty and recovery even when
their notification is withheld.
Activity uses the maintained blocking stale-loader policy for primary Calls and
Plans; optional reports start once for that result. On-page refresh retains
confirmed content, while returning from another page waits for current primary
data. Do not add a private-data freshness window without mutation and revocation
evidence.
The browser and source read deadlines live in `src/lib/bounded-read.ts`; they
bound waiting, not the effects of accepted work. Route transitions bound both
the root group and its fades; changing only fade duration leaves the browser's
default group animation on the navigation path.

Keep eager route metadata and pending states separate from heavy page owners.
The installed TanStack compiler does not split pending components by default:
importing one from a page module can pull that whole feature into first entry.
Provider, Treasury and Team pending states therefore have lightweight owners;
Provider inventory reuses the lightweight table skeleton rather than mounting the
real data grid with empty rows. Market
defers Directory and Hosts until selected. Check the emitted import graph when
changing these boundaries, as a source-level lazy declaration alone is not proof.

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
