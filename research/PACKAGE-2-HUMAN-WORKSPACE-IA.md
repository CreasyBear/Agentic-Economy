# Human workspace information architecture

**Status:** implementation-ready after engineering, UI, accessibility, and
security premortem
**Packages:** 2A Workspace restructuring, 2B Supplier workspace consolidation,
2C Navigation cleanup
**Product authority:** `PRODUCT.md`
**Prepared:** 2026-08-31

## Decision in one sentence

Organize the signed-in human product into Buy, Supply, and Account; make one
Operations workspace own the supplier lifecycle; and keep old paths only as
safe compatibility entrances, not as competing destinations.

## Outcome

The owner shell will give every human task one visible home:

- **Buy** — Calls, Agents, and Credit;
- **Supply** — Operations;
- **Account** — Account & security;
- **Resources** — Catalog, agent setup, and Help.

The existing Operation remains the market unit. This work changes where human
controls appear and how they are named. It does not change Operation contracts,
publication rules, payment behavior, provider choreography, schemas, wire
formats, or the agent-facing market loop.

## Non-goals

- No buyer or supplier dashboard invented for its own sake.
- No role switcher: one account may buy and supply, so section labels are enough.
- No generic workflow, state-machine, navigation, or retry abstraction.
- No renaming of domain-level API or CLI `activity` concepts where they mean an
  event stream rather than the human Calls destination.
- No deletion of deep links until a later compatibility review proves they are
  unused.
- No work on the active Market and Compare implementation.
- No implementation of Members.
- No navigation mode added to the command panel. It remains an Operation
  search-and-inspect surface.

## Current-state findings

| Concern | Current projection | Problem |
|---|---|---|
| Operations | `Operations`, `Publish`, and `Supplier` are separate primary destinations | One supplier lifecycle looks like three products. |
| Credit | Primary sidebar item and Settings tab | The same destination has two navigation owners. |
| Agent access | `Agents`, `Open Keys`, and `Keys and APIs` | Credentials are presented as a parallel product instead of a detail of an agent. |
| Supplier identity | Settings tab labelled `Account`, content called workspace and supplier identity | Human account, supplier identity, and workspace are conflated. |
| Settings | Profile, supplier identity, connections, credit, payouts, and developer setup in one flat tab row | Buyer, supplier, and account concerns lose their hierarchy, especially on mobile. |
| Calls | Signed-in navigation says `Calls`; public navigation, support, and status still say `Activity` | One destination has two human-facing names. |
| Mobile | Operations, Calls, and Publish | Two of three slots lead into the same supplier lifecycle. |
| Members | No route or UI exists | There is nothing to hide; adding a destination would create unfinished product. |
| Command panel | Navigation-destination helpers exist, but the live panel only searches and inspects Operations | Tests currently imply a navigation feature that the product does not have. |

## Canonical ownership

Every datum may appear contextually elsewhere, but only one surface owns its
management controls and full projection.

| Concept | Canonical visible home | Contextual projections allowed elsewhere |
|---|---|---|
| Purchasing and receipts | **Calls** | An Operation inspector may link to its resulting call. |
| Agent identities and credentials | **Agents** | Credit may show which agent spent funds; developer docs may link to Agents. |
| Buyer balance and funding | **Credit** | Agents may show a compact balance or a link to add credit. |
| Operation definition, setup, publication, health, and retirement | **Operations** | Public supplier pages show published facts only. |
| Supplier connection readiness | **Operations** | A subordinate connection-management view may be opened from its readiness action. |
| Supplier payout readiness and earnings | **Operations** | A subordinate payout-management view may be opened from its readiness action. |
| Owner Account profile, sessions, recovery, and security | **Account & security** | The account menu may expose sign-out and a link to this surface. |
| Supplier identity | **Operations** | Account surfaces must not call the supplier identity “Account.” |

“Keys” is not a navigation category. A key or credential is an implementation
detail of an Agent and may be named only where the user is managing that exact
credential.

## Target desktop navigation

```text
BUY
  Calls
  Agents
  Credit

SUPPLY
  Operations

ACCOUNT
  Account & security

RESOURCES
  Catalog
  Agent setup
  Help
```

Rules:

1. Section labels describe intent, not database ownership.
2. `Operations` is the only primary supplier destination.
3. `Publish`, `Supplier`, `Settings`, and `Activity` do not appear as primary
   owner-navigation labels.
4. `Catalog` remains a resource link because it crosses back into the public
   market; it is not duplicated as a second buyer workspace.
5. The shell label becomes **Buy and supply**, not **Account workspace**. The
   signed-in identity remains in the sidebar footer.
6. The logo continues to open Operations and has the accessible name
   **Operations home**.
7. The redundant `Home` utility is removed. Catalog is the deliberate route
   back to the public market.
8. The command panel remains Operation search and inspection. It does not
   project navigation destinations.

## Target mobile navigation

The fixed bottom navigation contains exactly three task destinations:

```text
Calls    Agents    Operations
```

Credit, Account & security, Catalog, and Help remain available in the existing
mobile navigation sheet. Contextual actions may open them directly. This keeps
three readable labels and touch targets without giving two slots to one
supplier lifecycle.

Mobile requirements:

- preserve a minimum 44 by 44 CSS-pixel target;
- preserve safe-area padding and one-row layout at 320 CSS pixels;
- announce the current destination with `aria-current="page"`;
- keep DOM and keyboard order equal to visual order;
- never rely on icon or color alone to distinguish Buy from Supply;
- cancelling or closing the sheet restores focus to its trigger;
- selecting a destination moves focus to the destination content instead of
  restoring focus to the stale menu trigger;
- compact Operations rows keep name, lifecycle, blocker, and next action in
  DOM order without horizontal scrolling.

## Package 2A — Workspace restructuring

### 2A.1 Make the shared navigation registry authoritative

Change the owner groups from Records / Work / Account to Buy / Supply /
Account. The sidebar and mobile navigation continue to project from the same
registry. Breadcrumb ownership is explicit for compatibility paths.

Acceptance:

- desktop owner navigation has the exact target groups and labels above;
- no canonical destination appears in more than one group;
- route selection and breadcrumbs still resolve for every current deep path;
- admin and developer navigation are unchanged.
- dead `listOperatorCommandDestinations*` helpers and tests are removed after a
  final caller search confirms that no runtime code uses them.

### 2A.2 Give buyer concerns one owner each

- Calls owns call history, receipts, cancellation, and reconciliation.
- Agents owns creation, naming, scopes, budgets, credentials, approvals, and
  revocation.
- Credit owns balance, funding, top-up results, and credit activity.
- Replace `Open Keys` with `Open Agents` or a context-specific agent label.
- Developer Setup is resolved, not merely renamed: its Agents row goes to
  Agents; agent instructions and machine-readable files belong to the existing
  Agent setup resource; `/owner/settings/developers` becomes a compatibility
  redirect to `/for-agents`.
- Do not keep a second “Keys and APIs” management surface.

This package does not deepen agent-access or money behavior; Packages 3A and 4A
own that later maturity work.

### 2A.3 Separate account from supplier identity

Use these terms consistently:

| Term | Meaning |
|---|---|
| Account | The AE owner boundary for a person or organization. |
| Agent | A durable caller identity controlled by the account. |
| Supplier | The public identity that owns and publishes Operations. |
| Workspace | A layout description only; never the name of a domain record. |

`/owner/settings` becomes the visible **Account & security** destination. Its
profile/session UI stays account-owned. Supplier identity, provider
connections, and payouts leave the Settings tab strip and move under
Operations. If subordinate route paths retain `/owner/settings/...` for
compatibility, their visible breadcrumb parent is Operations, not Account.

Package 2 exposes only the currently implemented human profile,
authentication, session, and recovery controls. It does not introduce
organization membership or shared authority.

Visible identity copy uses **Supplier name** and **Supplier website**. Reserve
**Provider** for an upstream execution or payment connection.

### 2A.4 Remove duplicate settings projection

The six-item horizontal settings tab row is retired. It is not replaced by a
second sidebar.

- Account & security contains only account-owned controls.
- Credit remains in Buy.
- Connections, payouts, and supplier identity appear in Operations readiness.
- Agent setup links live in Agents or Resources.

Subordinate management screens may continue to exist. Removing their duplicate
navigation entry does not mean removing their capability.

The current parent settings route cannot provide the new hierarchy by registry
changes alone. Its shell contract becomes:

- `/owner/settings` renders Account & security chrome;
- retained supplier children pass through the parent `<Outlet />` without the
  Settings tab row;
- each retained supplier child immediately renders Operations chrome with
  `currentPath="/owner/offerings"` and explicit `Operations → {child}`
  breadcrumbs for SSR, pending, success, and failure;
- the parent must not briefly render Settings chrome before a nested layout
  effect replaces it.

## Package 2B — Supplier workspace consolidation

### 2B.1 One Operations landing surface

`/owner/offerings` remains the canonical route to avoid a cosmetic route
migration. It renders one supplier workspace with this order:

1. **Attention summary** — number of Operations requiring action and the first
   blocker in stable Operations order;
2. **Operations list** — one row per Operation with lifecycle, public
   availability, blocker, and one next action;
3. **Supplier readiness** — connection, publication, and payout readiness;
4. **Earnings and operational evidence** — existing factual readbacks, clearly
   separated from Qualified Use or revenue claims.

The landing page preserves successful sections when another read fails. A
connection outage must not replace a successfully loaded Operations list, and
a payout outage must not imply that publication failed.

Use existing layout and spacing tokens, `AeSection`, feedback states, and data
components. Do not introduce a new card family or spacing scale. At compact
widths, each Operation becomes a stacked row containing name, lifecycle,
blocker, and a full-width next action in DOM order. Secondary facts may collapse
or hide; the action may not sit in an off-screen table column.

### 2B.2 Landing read contract

The unified page is not one unchecked joined payload.

```text
authenticated owner context
          |
          v
current-owner inventory  ───────────────> authoritative row set
          |                                      |
          | one resolved businessId              | join by offeringRef
          v                                      v
  lifecycle / connections / earnings / payouts section reads
          |                 |                 |
          +---- typed, independently caught results ----+
                                    |
                                    v
                     narrow Operations presentation DTO
```

Required rules:

- inventory is the critical initial read and the authority for which rows
  exist;
- secondary results are `available | unavailable | not_applicable` and no
  rejected secondary read may escape into the route boundary;
- inventory content must not wait for the slowest readiness or earnings read;
  use the framework's existing route/component loading behavior, not a custom
  scheduler or request framework;
- resolve exactly one current-owner `businessId` server-side; never select a
  business from a URL, the first connection, or the latest arbitrary row;
- verify every joined section belongs to that same business before projection;
- multiple owned supplier identities or a business mismatch produce a
  non-actionable identity-conflict state; Package 2 does not invent a supplier
  selector;
- route guards control presentation only. Every owner read and mutation keeps
  deriving authority server-side and verifying ownership;
- authenticated aggregate responses set `Cache-Control: private, no-store`;
- the summary DTO excludes provider account references, granted resource
  lists, authority/evidence digests, Stripe or destination account IDs,
  onboarding URLs, credential references, and secrets;
- detailed subordinate controls may fetch the richer owner projection only
  when opened;
- route invalidation may refresh all sections, but the UI preserves successful
  content and the initiating section owns its retry feedback;
- owner-scoped presentation state, including credential-presence state used by
  the shell, is cleared before rendering after `accountRef`, principal, or
  allowed-surface changes;
- one navigation performs the current-owner inventory read at most once.

### 2B.3 One lifecycle per Operation

The human lifecycle is a projection of existing domain facts, not a new state
machine:

```text
Draft
  -> Needs setup
  -> Ready to verify
  -> Verification in progress
  -> Published
  -> Action required / Paused
  -> Retired
```

Rules:

- join definition and supply facts only by exact `offeringRef`;
- the definition inventory is row authority;
- supply facts may enrich a row only when its revision equals the definition's
  current revision;
- revision mismatch renders **Updating** or **Status unavailable** and must not
  claim Published or Unavailable;
- definition-only rows remain visible with lifecycle unavailable and a safe
  edit or repair action;
- supply-only rows are surfaced as a projection inconsistency and never
  silently substituted as current;
- duplicate `offeringRef` values fail projection deterministically rather than
  producing duplicate rows;
- derive the label from existing offering, readiness, publication, connection,
  and live-readback unions;
- show the exact blocker beneath or beside the lifecycle label;
- reuse the existing `supplierContinuationForOffering` priority as the action
  authority; do not recreate a second priority order;
- exhaustively project retired, superseded, withdrawn, incompatible, paused,
  stale/refused/in-progress verification, credential failure, authority drift,
  source unavailable, and healthy-current cases;
- never claim Published from a saved definition alone;
- never claim unavailable from an unknown readback;
- preserve the existing request and idempotency keys for commands;
- keep the Stage 1 unknown-outcome and safe-retry behavior intact.

The detailed editor and preparation controls may remain separate components
and deep routes. They must share the Operations title, breadcrumb, return path,
and lifecycle context so the user experiences one workspace rather than an
Operations-to-Publish handoff.

These labels remain a pure presentation projection. They are not persisted and
do not become a new domain enum.

Apply lifecycle presentation in this precedence order:

| Condition | Human label | Availability claim | Next-action authority |
|---|---|---|---|
| Missing supply facts or revision mismatch | Updating / Status unavailable | Unknown; retain the last explicitly labelled safe fact only | Edit or retry projection; no publish claim |
| Offering retired or publication superseded | Retired | Not available | Existing Review earnings continuation |
| Publication or lifecycle incompatible | Action required | Not available | Existing incompatible continuation |
| Publication or lifecycle withdrawn | Paused | Not available | Existing withdrawn/republish continuation |
| Offering status paused | Paused | Use exact live readback; do not infer | Open preparation/maintenance |
| Current step `describe` | Draft | Not available | Existing draft continuation |
| Authority stale or credential unavailable/rejected | Action required | Not available | Existing authority/credential continuation |
| Current step `admission` | Needs setup | Not available | Existing missing-connection/admission continuation |
| Readiness step `not_started` | Ready to verify | Not available | Existing readiness continuation |
| Readiness step `in_progress` | Verification in progress | Unknown until readback completes | Extend the single continuation projector with non-mutating Keep waiting / View status; do not recheck |
| Readiness step `refused` or `stale`, or exact live read says unavailable | Action required | Not available only when the exact read says so | Existing readiness continuation |
| Matching revision, offering status `published`, publication state `current`, lifecycle state `active`, and exact live read says available | Published | Available | Existing current continuation |
| Any unclassified combination | Status unavailable | Unknown | Open Operation or retry owned read; no mutation shortcut |

The existing continuation function is extracted or extended as this pure,
single action authority; it is not copied. The projector must be exhaustive
over the current unions so a newly added domain value fails typecheck or a
focused test instead of falling through to a misleading label.

### 2B.4 Supplier readiness

Readiness is a compact section, not three more primary destinations:

| Readiness item | Shows | Primary action |
|---|---|---|
| Supplier identity | Public name and whether the identity exists | Create or edit supplier identity |
| Connection | Bound source and current health | Connect, repair, test, or rotate |
| Publication | Number live, blocked, paused, or awaiting verification | Open the affected Operation |
| Payouts | Ready, missing setup, pending, or unavailable | Complete or inspect payout setup |

Each item owns its own loading, unavailable, and retry state. Raw exceptions,
provider secrets, rich connection authority, and payout evidence never enter
the summary payload or copy.

Readiness may remain visible when stale, but actions are available only from a
current, same-business projection. An unavailable, mismatched, stale, or
unknown contributing read renders status only. Every action retains its
existing revision/generation/digest and request or command key. A rejection or
timeout performs authoritative readback before any repeat and never claims
success or generates a blind retry key.

Zero-state rendering is explicit:

| State | Rendering |
|---|---|
| No supplier identity | Show the supplier-identity creation form only; Operations, connection, publication, earnings, and payout readiness are `not_applicable`. |
| Supplier identity with zero Operations | Show a calm Add Operation empty state; connection and payout readiness may remain visible because they belong to the supplier. |
| Zero blockers | Omit the attention summary instead of rendering a “0 issues” card. |
| One or many blockers | Show the count and first blocker in stable Operations order; the list retains every affected row. |
| Readiness unavailable with Operations available | Preserve the Operations list and mark only the readiness section unavailable. |

### 2B.5 Compatibility entrances

| Current path | Treatment after consolidation |
|---|---|
| `/owner/offerings` | Canonical Operations landing. |
| `/owner/offerings/new` | Create Operation, then return to the unified lifecycle. |
| `/owner/offerings/$offeringRef` | Definition editor within Operations. |
| `/owner/supply` | Exact-path, replace-history redirect to `/owner/offerings`. The parent route must continue rendering its detail outlet. |
| `/owner/supply/$offeringRef` | Retain initially as the preparation deep route, but title and breadcrumb it as Operations. |
| `/owner/status` | Embed its unique status/public-preview content in Operations, remove arbitrary owner-management `slug` selection, then replace-history redirect to `/owner/offerings`. |
| `/owner/settings/connections` | After feature parity, replace-history redirect to `/owner/offerings#supplier-connections`. |
| `/owner/settings/payouts` | After feature parity, replace-history redirect to `/owner/offerings#earnings`. |
| `/owner/settings/workspace` | After supplier identity editing is embedded, replace-history redirect to `/owner/offerings#supplier-identity`. |
| `/owner/settings/developers` | Replace-history redirect to `/for-agents`. |

Redirects use TanStack Router navigation and preserve the signed-in shell. No
full-page reload is introduced.

Only these legacy supply intents are preserved:

| Incoming location | Canonical location and required behavior |
|---|---|
| `/owner/supply#earnings` | `/owner/offerings#earnings`; scroll and focus the earnings heading. |
| `/owner/supply?rebind={offeringRef}#provider-connection-{connectionRef}` | Preserve the validated offering and target refs; load the connection section and focus the exact target. |
| `/owner/supply?connect=return` | Preserve `connect=return`, refresh authoritative payout readiness, then restore earnings context. |
| `/owner/supply?connect=refresh` | Preserve `connect=refresh`, refresh authoritative payout readiness, then restore earnings context. |

Every compatibility route uses an explicit schema. Drop unknown search/hash
values, including arbitrary `redirect`, `next`, `slug`, `businessId`, provider
URLs, credentials, and payout identifiers. Do not redirect the base supply
route until all four canonical intents above are consumed by Operations.

## Package 2C — Navigation cleanup

### 2C.1 Use Calls as the human-facing name

Change visible website navigation, support, status guidance, titles, empty
states, and buttons from **Activity** to **Calls** where they link to
`/activity`. Keep `/activity` as the compatibility URL during this package.

Do not rename:

- admin **Activity log**;
- API or CLI `activity` commands and schemas;
- audit or financial-event language that describes a stream rather than the
  Calls page.

### 2C.2 Keep Members absent

There is no current Members route or visible control. Add a navigation
regression assertion that neither desktop, mobile, nor settings destinations
expose Members. Remove the stale synthetic `/owner/settings/members`
test example or replace it with a real nested settings path.

This package does not implement invitations, teams, roles, or membership
management.

### 2C.3 Preserve navigation safety

- old bookmarks reach a canonical surface or a clearly subordinate view;
- browser back returns to the originating Operations context;
- refresh on every retained deep route reconstructs shell and breadcrumbs;
- dirty editors continue to block internal and browser-level departure;
- a pending save holds the original destination and continues only after
  confirmed success;
- redirects never discard an unsaved editor state because redirects occur only
  at landing/compatibility entrances.

Compatibility path ownership is explicit rather than inferred from the longest
URL prefix:

```text
/owner/offerings/**        -> Operations
/owner/supply/**           -> Operations
/owner/status              -> Operations
/owner/settings/workspace  -> Operations
/owner/settings/connections -> Operations
/owner/settings/payouts    -> Operations
/owner/settings            -> Account & security
/owner/settings/developers -> Agent setup during redirect
```

Every row has active desktop and mobile state, `Operations → {page}` or
`Account & security` breadcrumbs as applicable, direct SSR/refresh coverage,
and back/forward coverage. Supplier settings paths must never highlight Account
& security.

### 2C.4 Accessible labels and transitions

- page title, primary heading, breadcrumb, and nav label use the same visible
  noun; command-panel links use the same destination noun where applicable;
- one shell-owned transition rule focuses the new main region or page heading
  after a successful SPA pathname change and after nested chrome has rendered;
- that rule does not move focus on initial render, hash-only navigation,
  blocked navigation, or a failed save;
- selecting a mobile-sheet destination focuses the destination content;
  cancelling the sheet restores its trigger;
- async readiness changes announce concise status without moving focus;
- blockers are text, not badge color alone;
- mobile sheet and any nested dialog preserve Escape, focus trap, and focus
  restoration behavior;
- reduced-motion users receive no essential information only through movement.

Use the router's existing scroll restoration. Do not introduce a second focus
manager or manual history implementation.

## Delivery sequence

The packages are prepared as three dependency-ordered changes, not one broad
rewrite.

### Change 1 — Navigation vocabulary and ownership (2A + safe 2C subset)

- prepare the shared owner navigation and compatibility ownership rules;
- rename visible Activity links to Calls;
- remove Credit-in-Settings because the existing Credit destination already
  provides feature parity;
- remove dead navigation-destination helpers without changing the live command
  panel;
- preserve Publish, Supplier, supplier Settings tabs, and the current mobile
  trio until their equivalent Operations actions exist.

**Gate:** every existing route remains reachable, desktop and mobile
destinations remain discoverable, no Members control exists, and no supplier
behavior changes. The final target navigation is not declared complete yet.

### Change 2 — Unified Operations landing (2B)

- keep inventory as the critical read and compose independently contained
  secondary section results;
- merge the two Operations tables through the revision-safe projection contract;
- add supplier readiness and next-action projections using existing unions;
- retain partial content and Stage 1 recovery behavior;
- consume the exact legacy supply intents before making the old Publish landing
  a compatibility entrance;
- in the same atomic change, remove the Publish and Supplier primary entries
  and switch mobile navigation to Calls / Agents / Operations only after their
  feature-equivalent Operations actions pass.

**Gate:** one supplier can create, edit, prepare, publish, repair, and inspect
readiness from one conceptual Operations workspace without losing deep-link or
unknown-outcome safety.

### Change 3 — Subordinate routes and compatibility cleanup (remaining 2A/2C)

- move supplier identity, connections, and payouts under Operations in visible
  hierarchy;
- embed the unique supplier status/public preview before redirecting its old
  management route;
- reduce Account & security to account-owned content;
- align titles, breadcrumbs, return links, support copy, and public navigation;
- redirect legacy paths according to the explicit compatibility table;
- remove each supplier Settings tab only in the same change that embeds its
  feature-equivalent Operations control;
- run a final inbound-link classification so no base `/owner/supply` or
  `/owner/status` human link remains unexplained.

**Gate:** each concept has one visible owner, old bookmarks recover inside the
shell, and mobile navigation has no duplicated supplier destination.

## Expected implementation seams

Re-read every file immediately before editing because the worktree is shared
and the Market/Compare and offering editor surfaces have concurrent changes.

Likely navigation and shell seams:

- `src/lib/operator/navigation.ts`
- `src/lib/operator/settings-navigation.ts`
- `src/components/ae/layout/AeOperatorSidebar.tsx`
- `src/components/ae/layout/AeOwnerMobileNavigation.tsx`
- `src/components/ae/settings/OwnerSettingsNav.tsx`

Likely Operations seams:

- `src/routes/_operator/owner.offerings.tsx`
- `src/routes/_operator/owner.supply.tsx`
- `src/routes/_operator/owner.supply.$offeringRef.tsx`
- `src/routes/_operator/owner.status.tsx`
- `src/routes/_operator/owner.settings.workspace.tsx`
- `src/routes/_operator/owner.settings.connections.tsx`
- `src/routes/_operator/owner.settings.payouts.tsx`
- `src/components/ae/offerings/AeOwnerOfferings.tsx`
- `src/components/ae/supply/AeSupplyPublisherHome.tsx`
- existing supplier status, connection, earnings, and payout components

Likely vocabulary seams:

- `src/lib/public/website-nav.ts`
- `src/routes/support.tsx`
- `src/routes/status.tsx`
- human-facing route metadata and focused tests

This list is a discovery boundary, not authorization to edit every file. Each
change should touch only the seams its acceptance criteria require.

## Proof plan

Extend existing tests before adding new test files.

1. **Navigation registry tests**
   - exact desktop groups and order;
   - exact mobile destinations and order;
   - one canonical owner for Calls, Agents, Credit, Operations, and Account;
   - no Publish, Supplier, Settings, Activity, Keys, or Members primary label;
   - no dead navigation-destination projection is mistaken for command-panel
     behavior;
   - Home is absent and `/owner/settings/developers` resolves to Agent setup.

2. **Shell and route tests**
   - active state and breadcrumb ownership for retained deep routes;
   - compatibility landing navigation preserves the shell;
   - browser back/forward and direct refresh reconstruct the same destination;
   - exact supply intent preservation for earnings, rebind, Connect return, and
     Connect refresh, with every unknown parameter dropped;
   - retained supplier-settings routes render Operations chrome during SSR,
     pending, success, and failure without flashing Settings chrome;
   - supplier settings paths never mark Account & security current;
   - admin and developer navigation remain unchanged.

3. **Operations route tests**
   - matching revisions produce one row per Operation;
   - revision mismatch, definition-only, supply-only, and duplicate-ref inputs
     produce the specified safe projection;
   - existing lifecycle unions map to the expected label, blocker, and one next
     action;
   - connection or payout throw preserves successful Operations content;
   - a slow secondary read does not delay inventory content;
   - unavailable definition data makes no publication claim;
   - mixed-business or multiple-supplier inputs produce a non-actionable
     conflict and never merge;
   - stale, unavailable, mismatched, and unknown readiness exposes no mutation
     action;
   - readiness payload and DOM contain no raw connection authority/evidence or
     payout identifiers;
   - authenticated combined responses are private and non-cacheable;
   - existing mutation refusal and unknown-outcome behavior remains intact.

4. **Language and accessibility tests**
   - public and signed-in links to `/activity` are named Calls;
   - admin Activity log and API/CLI activity names remain unchanged;
   - current-page semantics, focus restoration, touch targets, 320-pixel reflow,
     keyboard order, and status announcements pass focused checks;
   - a successful SPA pathname change focuses new content, while initial,
     hash-only, blocked, and failed-save navigation does not;
   - compact Operations rows keep their action visible at 320 pixels and 200%
     zoom;
   - direct legacy entry, external Connect callback, hash-target focus, and
     browser Back behavior pass a gating Playwright accessibility journey;
   - Members is absent from all human navigation projections.

5. **Authority and session tests**
   - unauthenticated canonical and legacy paths do not run owner loaders before
     admission;
   - an admin-only principal cannot access or discover owner destinations;
   - Account B cannot use Account A's business, Operation, or connection refs
     and receives no existence disclosure;
   - switching account or allowed surface clears the previous owner's landing
     and command-panel state before rendering the next projection;
   - `/owner/status?slug={foreign}` cannot appear as an owned supplier or record
     an owner-status event;
   - loaders and redirects remain read-only and all mutations remain POST and
     server-authorized.

6. **Verification order**
   - focused navigation, settings, shell, Calls, offerings, and supply tests;
   - `npm run typecheck`;
   - `npm run lint`;
   - `npm run build`;
   - gating browser accessibility journeys for navigation/focus and supplier
     callback compatibility;
   - supplementary wider browser smoke when local services are available.

## Premortem

| Failure mode | Early warning | Prevention in this contract |
|---|---|---|
| Consolidation becomes a supplier rewrite | New domain enum, schema, or mutation choreography appears | Project existing facts only; stop if a domain change is required. |
| A stale supply read makes an edited Operation look Published | Definition and supply revisions differ | Inventory owns rows; enrich only exact matching revisions and show Updating otherwise. |
| Data from two supplier identities is joined | A section's business differs or multiple identities resolve | Verify one current-owner business server-side and fail closed on conflict. |
| Readiness summaries leak rich connection or payout evidence | Raw owner projection is spread into route data | Return narrow server summaries; fetch rich projections only inside detailed controls. |
| A slow payout or connection read delays every Operation | Inventory waits on a combined aggregate | Keep inventory critical and make secondary reads independently contained. |
| Old links strand users | A removed nav entry is also the only route to a management control | Embed feature parity first, then use the exact compatibility matrix and replace-history redirects. |
| Stripe return or connection rebind loses its target | `connect`, `rebind`, or a known hash disappears during redirect | Consume and test the four allowed legacy intents before redirecting the landing. |
| Retained supplier routes highlight Account | Active state follows the `/owner/settings` prefix | Give every compatibility path explicit Operations ownership and chrome. |
| Operations becomes an unreadable mega-page | Every detailed connection and payout control is embedded at once | Landing shows readiness and next action; detailed controls remain subordinate. |
| Partial outages again blank the workspace | One combined loader throws when any read fails | Use section-owned result unions and preserve successful sections. |
| Account language remains ambiguous | Supplier identity is still labelled Account, workspace, or Provider | Enforce Account/Supplier/Provider meanings in titles, fields, breadcrumbs, and empty states. |
| Mobile cleanup hides essential work | Only bottom-nav destinations are tested | Prove every canonical destination remains reachable through the mobile sheet. |
| Compact Operations rows hide their next action | The merged table scrolls horizontally at 320 pixels | Use a stacked compact row and gate 320-pixel/200%-zoom behavior. |
| Route changes strand keyboard focus in stale chrome | A destination is selected but focus returns to the menu trigger | Use one shell-owned pathname transition rule and gate it in Playwright. |
| Activity rename breaks machine contracts | API/CLI identifiers are changed with UI copy | Rename human navigation only; protect machine names with tests. |
| Navigation work invents a command-palette feature | Tests call dead destination helpers as if the panel renders them | Keep the panel scoped to Operation search/inspect and remove dead helpers. |
| Concurrent core-loop work is overwritten | Offering/editor diffs are reformatted or replaced wholesale | Re-read before edit, patch narrowly, and reconcile at the component boundary. |

## Specialist premortem record

Three read-only specialist profiles reviewed this contract against `PRODUCT.md`,
the live routes/components, and focused tests:

| Profile | Initial verdict | Findings folded into this revision | Closure verdict |
|---|---|---|---|
| Goal-backward plan checker | Not ready: 5 P1 and 3 P2 gaps | Revision-safe joins, truthful command-panel scope, settings-shell ownership, exhaustive inbound links, independent section results, status terminal step, Account definition, and dangerous-branch tests. | **CLEAN** |
| Six-pillar UI/IA checker | Blocked pending amendments | Compatibility ownership, callback transition matrix, exhaustive lifecycle projection, shell focus behavior, mobile compact rows, Supplier/Provider language, exact Developer Setup disposition, feature-parity sequencing, and supplier zero states. | **PASS** |
| Security/authority auditor | Revise before implementation; no current exploit found | Same-business aggregation, multiple-identity fail-closed behavior, narrow DTOs, action freshness, strict redirect allowlists, owner-status trust boundary, server-side authorization, non-cacheable responses, and account-switch isolation. | **SECURED** |

The reviewers independently agreed on the principal risk: a visual merge must
not become an unchecked data merge. The revised read contract makes identity,
revision, freshness, and section ownership explicit without changing domain or
wire contracts.

## Ready-to-start gate

Implementation may begin when:

- the target desktop and mobile navigation above are accepted as the product
  decision;
- `/owner/offerings` is accepted as the canonical Operations route;
- legacy supply/settings routes are accepted as subordinate compatibility
  entrances during the migration;
- the active Market/Compare work is either reconciled or explicitly excluded
  from each change set;
- the implementer records the dirty worktree and makes no unrelated edits.
