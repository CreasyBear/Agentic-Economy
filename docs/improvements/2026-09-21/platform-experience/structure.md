# Platform experience structure audit

> **Scope reset, 21 September 2026:** this is retained technical evidence. Its priorities do not govern the immediate UX work. Use the [buyer experience baseline](../../../designs/2026-09-21-platform-experience-audit.md) and [page checklist](../../../operations/platform-experience-register.md), reframed around basic site, group and page requirements after Joel’s correction.


**Date:** 2026-09-21  
**Scope:** source-grounded platform UX structure and state continuity  
**Status:** bounded audit; no application source or existing document changed

## Decision boundary

The current product already has a usable structural base: one root frame, a
shared authenticated operator boundary, URL-backed Market search state, and a
small set of reusable UI primitives. The material experience risks are at the
boundaries between those systems: which state survives a return or refresh,
which identity scope a settings surface changes, and how much decision load is
placed on a buyer before a Quote.

The ideal structure below preserves current routes initially. It is a proposed
hierarchy for signed-in product walks and user testing, not destination law.
The withdrawn “Search / Keys / Trips” map is not used, and no rename, wireframe
kit, or signed-in reference rail is inferred. The active Jev scope remains the
buyer journey; chat is not given a purchasing Agent.

The audit uses the product's six journeys as the test:

1. describe a need and find a capability despite vocabulary differences;
2. compare suitable services without scanning an unbounded catalogue;
3. choose, buy, and continue with low integration burden;
4. let a Provider expose capability without distribution expertise;
5. connect relevant supply when suitable supply is absent today; and
6. improve repeat matching through continued market use.

## Current surface inventory

This is a source route inventory, grouped by user job. It is not a proposed
navigation tree.

| Surface family | Current source routes | Job and state boundary |
| --- | --- | --- |
| Public discovery | `/`, `/market`, `/tools/$toolRef`, `/tools/$providerHost/$slug`, `/$slug`, `/s/$shareToken` | Discover, inspect, compare and share Tool or Provider evidence. `/` redirects to `/market`. Market query state is URL-backed; comparison selection and indexed “Load more” state are local. |
| Buyer authority and purchase | `/agent-access`, `/agent-access/authorize`, `/activity`, `/calls/$callRef`, `/fund/$fundingSessionId`, `/fund/cancelled` | Select or resume an authorized Agent, inspect Calls/usage/spend, fund an account when required, and inspect a Call or recovery outcome. `_operator` supplies the authenticated boundary. |
| Chat work surface | `/t/new`, `/t/$threadId`, `/s/$shareToken` | Describe a need, compare or continue work, and share a conversation. Chat has its own transcript/history/composer state and must hand off to the existing authorized Agent path for purchase. |
| Provider and owner operations | `/owner`, `/owner/operations`, `/owner/operations/new`, `/owner/operations/$toolRef`, `/owner/supply/connections/new`, `/owner/supply/connections/oauth/callback`, `/owner/market` | Operate Tools and supply connections. `/owner/market` exists in source but is not a buyer-header destination under the current register. |
| Account, workspace and team | `/owner/settings`, `/owner/team`, `/owner/workspace`, `/owner/credit` | Personal security, workspace settings, team directory, funding and commercial records. Account and workspace scope are exposed through existing settings surfaces and Clerk-hosted organization components. |
| Public education and utility | `/for-agents`, `/for-providers`, `/developers/api`, `/developers/discovery`, `/support`, `/status`, `/about`, `/privacy`, `/terms` | Explain the market and integrations, provide help/status, and expose legal or developer information. These pages are not evidence for signed-in destination ordering. |
| Authentication and setup | `/sign-in/$`, `/sign-up/$`, `/onboarding` | Establish identity and workspace intent, then return to a sanitized target. Onboarding step and draft fields are currently held by the page hook until completion. |
| Developer/admin records | `/admin/audit-events`, `/admin/index-health` | Operational and health records. They retain the operator sidebar because they are not buyer work surfaces. |
| Machine surfaces | `src/routes/api.*`, `src/routes/mcp.*`, registry and SDK entry points | Agent and integration consumption. These are parity evidence and protocol surfaces, not human navigation destinations. |

The source register records the signed-in buyer rail as Market `/market`, Agents
`/agent-access`, Calls `/activity`, and My tools `/owner/operations`.
Whether Agents and Calls earn a header slot, and whether My tools is a peer
destination or a mode switch, remain signed-in walk questions. See
`docs/operations/buyer-page-register.md:7-83` and
`docs/operations/design-system-maturity-register.md:419-474`.

## Existing structural contracts

* `src/router.tsx:7-32` uses TanStack Router's intent preloading, pending/error
  boundaries, view transitions, scroll restoration, and a restoration key made
  from `pathname + search`. This gives Market back/forward navigation a durable
  URL identity without inventing a second navigation state machine.
* `src/routes/__root.tsx:37-69` places every route in `AeAppShell`. Chat-only
  paths receive the chat Convex provider at
  `src/routes/__root.tsx:120-222`, keeping chat setup separate from the public
  Market frame.
* `src/routes/_operator.tsx:11-51` owns the operator shell and mounts the
  sidebar only where the route role permits it. The auth and ownership boundary
  is shared by `src/lib/server/require-operator-session.ts:22-31`.
* `src/components/ae/layout/AeAppShell.tsx:84-229` owns the persistent brand,
  header, account/workspace controls, command panel, theme and signed-out
  entry. `src/components/ae/layout/AeOwnerMobileNavigation.tsx:15-31`
  resolves the four current buyer destinations instead of creating a second
  mobile route model.
* `src/modules/market/market-route-data.ts:21-66` validates and loads Market
  `query`, `view`, filters, compare/resource references and provider cursor from
  the route. `src/components/ae/market/AeX402Directory.tsx:161-186` navigates
  through that same query model, while
  `src/components/ae/market/market-return-context.ts:5-38` preserves the
  originating Market search when a detail view returns.
* `src/components/ui/dialog.tsx:1-195`, `src/components/ui/sheet.tsx:1-100`,
  `src/components/ui/field.tsx`, `src/components/ui/table.tsx`, the command
  primitive, and the existing form/table wrappers are the reuse boundary. The
  installed `@base-ui/react`, `@tanstack/react-table`, RJSF/AJV, `cmdk`,
  `sonner`, Clerk, Convex and TanStack Router already cover the structural
  capabilities required by this audit.

## Prioritized findings

### F0 — Keep the existing shell and guard as the base (retained source-backed foundation; no defect priority)

**Ideal.** A single frame should carry the user from discovery through
authority, Call records, settings and Provider work, with only deliberate chat
and operator dialect changes. Auth and account ownership should be enforced at
the route boundary, not recreated by each page.

**Current.** `AeAppShell` is the root frame, `_operator` is the shared operator
boundary, and `requireOperatorBeforeLoad` redirects unauthenticated users to
sign-in with a return target. The mobile buyer rail already resolves four
existing paths. Admin/developer records retain their sidebar while buyer
operator pages do not.

**Evidence.** `src/routes/__root.tsx:37-69`,
`src/routes/_operator.tsx:11-51`,
`src/lib/server/require-operator-session.ts:22-31`,
`src/components/ae/layout/AeAppShell.tsx:84-229`, and
`src/components/ae/layout/AeOwnerMobileNavigation.tsx:15-31`.

**Reuse-first path.** Preserve the shell, `operatorSurfaceForPath`,
`shouldMountOperatorSidebar`, and the existing route registry. Do not add a new
application frame, operator sidebar, or navigation package.

**Smallest boundary and dependencies.** No code change is required by this
finding. If a signed-in walk finds a transition defect, fix the relevant
`AeAppShell` or route static data entry only, reusing TanStack Router and the
existing Clerk guard.

**Acceptance.** A signed-out deep link reaches sign-in with the intended target;
an authenticated owner returns to the requested surface; Market, Agent, Call
and My tools transitions keep the same account/workspace context; chat retains
its transcript-local frame; admin/developer records retain their operator
sidebar.

**Limit.** This is source evidence. The signed-in visual walk remains deferred
by the design-system register, so frame density and actual Clerk rendering are
not measured here.

### F1 — Make Market continuity an explicit product decision (P2, VERIFY before changing)

**Ideal.** A buyer who opens a Tool and returns should see the same Market
question, view, filters and safe comparison context. A shareable URL should
represent durable decision state. An opaque indexed page cursor should not enter
the public URL merely to imitate continuity.

**Current.** Search, view, filters, provider cursor, comparison/resource
references and layout are parsed from route search. `AeX402Directory` keeps
comparison tray/dialog state, saved state and indexed “Load more” cursor in
component/session state. A legacy `?compare=` value hydrates the local tray and
is then removed. The return helper uses history only when the originating state
is marked `fromMarket`; otherwise it links to `/market`.

**Evidence.** `src/modules/market/market-route-data.ts:14-66`,
`src/components/ae/market/AeX402Directory.tsx:97-147`,
`src/components/ae/market/AeX402Directory.tsx:161-206`,
`src/components/ae/market/AeX402Directory.tsx:283-367`,
`src/components/ae/market/market-return-context.ts:5-38`, and
`src/router.tsx:7-32`.

**Reuse-first path.** Keep the existing return context and typed search schema.
Before expanding URL state, test whether users need comparison selection or
appended result pages to survive refresh. If the answer is yes, persist only a
safe, bounded selection through the existing route state or an existing
owner-scoped record; do not expose an opaque Convex cursor or create a new
client cache layer.

**Smallest boundary and dependencies.**
`AeX402Directory` plus `market-route-data.ts`; TanStack Router search and the
existing history state are sufficient.

**Acceptance.** Tool detail opened from a filtered Market returns to the same
`query/view/filter` URL; browser back and forward restore the same scroll key;
refresh preserves those filters; the product explicitly documents or tests
whether local comparison selection and appended results reset. No raw backend
cursor appears in a copied URL.

**Limit.** Resetting local appended results may be an intentional tradeoff, not
a defect. Source does not establish whether the signed-in buyer expects a
long-lived comparison set, and no rendered continuity measurement was taken.

### F2 — Preserve current buyer paths while validating hierarchy in signed-in walks (P2, VERIFY hierarchy hypothesis)

**Ideal.** The buyer can move from Market to Agent authority, Call records and
My tools without losing task context. The hierarchy should be judged by the
actual signed-in work surface and by the six journeys, not by an inferred
Airbnb destination map.

**Current.** Source has `/market`, `/agent-access`, `/activity` and
`/owner/operations` as the buyer rail. `/owner/market` remains a source route,
but the current design register says not to promote it as a buyer destination;
the buyer-page register says the Search/Keys/Trips map is withdrawn and signed-in
rails are not walked.

**Evidence.** `src/components/ae/layout/AeOwnerMobileNavigation.tsx:15-31`,
`src/components/ae/layout/AeOwnerMobileNavigation.tsx:56-123`,
`src/routes/_operator/owner.market.tsx`,
`docs/operations/buyer-page-register.md:7-83`, and
`docs/operations/design-system-maturity-register.md:419-474`.

**Reuse-first path.** Keep current route names and static route metadata. Walk
the signed-in Market → Agent → Call → My tools path, then change only the
smallest `staticData.nav` or page-local link if evidence shows a broken task
transition. Do not add `/my-tools`, redirect Agents to `/for-agents`, or make
`/owner/market` a peer destination without that walk.

**Smallest boundary and dependencies.** Existing route static data,
`AeAppShell`, and the mobile nav. No new IA abstraction or library.

**Acceptance.** The four current paths are reachable from the signed-in frame;
deep links survive auth return; each page exposes one clear continuation into
the next journey; public `/for-agents` and `/for-providers` remain education or
acquisition surfaces until a signed-in walk proves otherwise.

**Limit.** Source can establish route wiring and ownership guards, not actual
signed-in labels, focus, density, or scroll behavior.

### F3 — Decide whether owner filters are review state or task-local state (P2, VERIFY hypothesis)

**Ideal.** A filter that another operator must review should be URL-backed and
recoverable through browser back, refresh and a copied link. A private, fleeting
filter can stay local if the page makes that reset unsurprising.

**Current.** `AeTeamDirectoryTable` stores `searchTerm` and `roleFilter` in
component state and derives filtered rows locally. The route has no search
schema for those values. Market has already established the opposite pattern:
route search is canonical for shareable discovery filters, while local state is
used for temporary drafts and presentation controls.

**Evidence.** `src/components/ae/settings/AeTeamDirectoryTable.tsx:84-263`,
`src/routes/_operator/owner.team.tsx:10-49`,
`src/modules/market/market-route-data.ts:21-34`, and
`src/components/ae/market/DirectoryExplorerFilters.tsx:125-167`.

**Reuse-first path.** First ask whether team review links are a real task. If
yes, add a strict route search schema at the team route and make the table a
controlled projection of it. If no, retain local state and state the reset
behavior in the page's empty/reset copy. Do not add a second filter framework.

**Smallest boundary and dependencies.** `owner.team.tsx` plus
`AeTeamDirectoryTable`; reuse TanStack Router search and the existing Field,
Table and Button primitives.

**Acceptance.** Under the chosen contract, browser back and refresh either
restore the selected team filter or clearly reset it; empty and reset actions
remain deterministic; the filtered row count and role labels are derived from
one state source.

**Limit.** Source does not establish that team filters need sharing. This is a
user-test decision, not a mandate to put private workspace data in URLs.

### F4 — Establish a safe onboarding resume contract (P2, bounded source gap / refresh VERIFY)

**Ideal.** An interrupted setup can resume without asking a person to repeat
work, while private profile or workspace fields do not leak into a URL. The
completion mutation must remain idempotent and redirect only to a sanitized
target.

**Current.** `useOnboardingPage` owns `step`, `roleIntent` and `workspaceName`
locally; it queries/mutates Convex and navigates after completion. The route
only carries a sanitized `redirect` target. A concrete parent-verified defect is narrower than general resume: `openWorkspaceStep` at line 39 reapplies the suggested workspace name whenever step 2 opens. Entering a custom name, using the form Back action and continuing therefore overwrites the edit. Refresh durability is a separate product decision.

**Evidence.** `src/components/ae/principal-account/onboarding/useOnboardingPage.ts:22-120`,
`src/routes/onboarding.tsx:7-27`, and
`src/lib/client/auth-redirect.ts`.

**Reuse-first path.** First fix default initialisation in the existing hook so an edited name survives form Back → Continue (consolidated EX-10). No storage change is needed for that correction. For a separately demonstrated interruption need, reuse any existing Convex onboarding state already returned by the hook before adding storage. Persist only the minimum safe
resume marker or server-owned draft required by the observed journey; keep
private name/profile fields out of search params. If the backend does not yet
own a draft, record that as an explicit bounded implementation decision rather
than introducing a new onboarding service.

**Smallest boundary and dependencies.** `useOnboardingPage` and the existing
onboarding query/mutation. Convex is the durable boundary if the product
requires cross-device resume; TanStack Router remains appropriate only for a
non-sensitive step/redirect marker.

**Acceptance.** Entering a custom workspace name → form Back → Continue retains the name. Refresh/back at each incomplete step either resumes the known
safe state or shows an intentional restart message; completion cannot duplicate
the workspace or redirect outside the sanitizer; a failed mutation leaves the
entered state available for retry; no private field is copied into a URL.

**Limit.** The source audit did not run a browser or inspect hosted auth, so it
does not claim that data is currently lost in every runtime path.

### F5 — Keep Personal and Workspace settings legible across modal and deep-link paths (P2, VERIFY hypothesis)

**Ideal.** One settings entry point should make scope explicit: Personal changes
affect the account, Workspace changes affect the active organization, and
closing a quick settings surface returns the user to the task. Full routes must
remain valid deep links for support and browser history.

**Current.** `AeSettingsDialog` has Personal/Workspace scope tabs and keeps the
pathname unchanged. `/owner/settings`, `/owner/team` and `/owner/workspace`
remain full routes. Team and Workspace embed Clerk `OrganizationProfile` with
hash routing, while Account & security adds AE-owned profile, alerts and
security-history sections.

**Evidence.** `src/components/ae/settings/settings-dialog/AeSettingsDialog.tsx:28-71`,
`src/components/ae/settings/settings-dialog/useAeSettingsDialog.ts:6-33`,
`src/routes/_operator/owner.settings.tsx:9-35`,
`src/routes/_operator/owner.team.tsx:10-49`,
`src/routes/_operator/owner.workspace.tsx:10-47`, and
`src/components/ae/settings/OwnerSettingsSections.tsx:15-65`.

**Reuse-first path.** Keep the existing dialog, full routes and Clerk-hosted
organization surface. Make scope and return behavior explicit in page copy and
focus handling before considering any consolidation. Do not build a second
settings framework or replace Clerk's member/security/billing controls.

**Smallest boundary and dependencies.** The settings hook/dialog and the three
owner route leaves; reuse Base UI Dialog/Sheet, Clerk OrganizationProfile and
the current route guard.

**Acceptance.** Opening settings from a Market, Call or Tool task closes back to
that task; opening a full settings URL and using back/refresh preserves the
active scope; a Personal control never writes workspace state; organization
hash tabs do not strand the user outside the authenticated route.

**Limit.** The design register marks signed-in visual behavior as deferred. This
finding is a source contract and test plan, not a claim about the rendered
Clerk component.

### F6 — Reduce first-view decision load on Credit without splitting the domain (P2, VERIFY layout hypothesis)

**Ideal.** A buyer should first understand available balance, buying capacity,
the next funding action and any blocking state. History, reconciliation and
Provider obligations should remain available without competing with that first
decision.

**Current.** `AeOwnerCredit` puts Account balance, monthly spending ceiling,
payment methods, auto recharge, Add credit, invoice/top-up history, balance
history, reconciliation and accounting/Provider obligation records in one
surface. The accounting section uses `<details>`, which is a useful existing
progressive-disclosure pattern, but the default page still represents several
commercial jobs at once.

**Evidence.** `src/components/ae/console/AeOwnerCredit.tsx:154-172`,
`src/components/ae/console/AeOwnerCredit.tsx:179-331`,
`src/components/ae/console/AeOwnerCredit.tsx:333-491`, and
`src/components/ae/console/AeCreditTopUpPanel.tsx:41-284`.

**Reuse-first path.** Use the existing section, details, status and top-up
components to order the default read around “can I buy and what do I do next?”
Keep accounting/reconciliation collapsed until requested. Test the copy and
order with the cognitive-load questions; do not introduce tabs, a dashboard
framework or a new payment abstraction to solve grouping.

**Smallest boundary and dependencies.** `AeOwnerCredit` and
`AeCreditTopUpPanel`; existing Base UI, Field, Button, Dialog and Stripe-backed
server flow remain the boundary.

**Acceptance.** A first visit exposes one primary funding action and one clear
blocking/status message; changing a ceiling, payment method or auto-recharge
does not hide the current balance; history and administration remain reachable
without being required for a purchase; funding failure leaves a retry/resume
path and does not infer a balance.

**Limit.** This is a source-only cognitive-load finding. No rendered size,
visual salience or completion-time claim is made.

### F7 — Keep chat discovery separate from purchase authority (P1, existing buyer continuation gap)

**Ideal.** Chat can help express a need, compare supply and continue a buyer
task. A purchase still proceeds through the existing authorized Agent → Quote →
Call path, with the same authority and spending evidence as human or machine
entry points.

**Current.** `/t/new` and `/t/$threadId` are dedicated chat routes with chat-local
provider setup and transcript navigation. The Jev integration register records
that chat's synthetic `interactive-chat` principal is refused before Provider
contact and explicitly directs the work through existing authorized Agent
interfaces. The register also forbids a dedicated chat purchasing Agent.

**Evidence.** `src/routes/t.new.tsx:5-39`,
`src/routes/t.$threadId.tsx:6-36`,
`src/routes/__root.tsx:120-222`, and
`docs/operations/jev-platform-integration-register.md:18-22`.

**Reuse-first path.** Fix only the existing chat-to-authorized-Agent handoff
when the buyer walk demonstrates a failure. Reuse the registered discovery,
comparison, Quote and Call interfaces; do not add a chat-specific purchase
state machine, orchestration layer or second onboarding flow.

**Smallest boundary and dependencies.** The chat continuation action and the
existing Agent/Quote/Call adapter. Convex provider setup remains a transport
boundary, not purchase authority.

**Acceptance.** A chat user can carry a need or comparison into the existing
authorized Agent; missing authority is explained and recoverable; no chat-only
identity can create a Quote or Call; human and machine paths expose the same
commercial facts and allowed next action.

**Limit.** The register establishes the current buyer blocker and scope. Hosted
acceptance and a signed-in chat walk remain outside this source audit.

## No-handrolling matrix

The existing package set covers the structural capabilities in scope. The
remedies above reuse those capabilities; they do not propose a new dependency.
Official references below are included only where the audit relies on the
installed library's documented capability.

| Existing dependency or primitive | Capability | Current use | Gap or decision | Tradeoff and reuse boundary |
| --- | --- | --- | --- | --- |
| `@tanstack/react-router` | Typed routes, search params, navigation, loaders and scroll restoration. [Official search-param guide](https://tanstack.com/router/latest/docs/how-to/navigate-with-search-params) | Route tree, Market filters, auth return, scroll key, pending/error boundaries | Team/onboarding continuity decisions; Market local cursor remains intentionally local until user need is proven | URL state improves return/share behavior but can expose sensitive or noisy state. Use strict route schemas; never put private profile fields or opaque backend cursors in URLs. |
| `@clerk/tanstack-react-start` | Auth, account controls and organization/team surfaces. [OrganizationProfile](https://clerk.com/docs/tanstack-react-start/reference/components/organization/organization-profile) · [Organizations guide](https://clerk.com/docs/tanstack-react-start/guides/organizations/getting-started) | `ClerkProvider`, `UserButton`, `OrganizationSwitcher`, `OrganizationProfile`, route guard | Signed-in rendering and scope transitions need a real product walk | Hosted controls reduce custom security surface but impose Clerk routing/focus behavior. Keep AE-owned commercial facts outside hosted organization UI. |
| `convex` | Reactive queries and mutations for durable account, onboarding, team, chat and commercial state | Chat provider, onboarding query/mutation, directory and funding state | Only use durable state where refresh/cross-device resume is a demonstrated need | Durable state carries schema and authorization cost. Do not use it for simple dialog, filter-draft or collapsible state. |
| `@base-ui/react` plus `src/components/ui/*` | Accessible Dialog, Sheet, Field, Button and shared table presentation. [Official Dialog reference](https://base-ui.com/react/components/dialog) | Settings dialog, mobile sheets, forms, table wrappers and focus/escape behavior | Some page-local form markup can be brought back to shared wrappers when touched | Shared primitives reduce interaction drift; extending them is cheaper than introducing a second UI kit. |
| `@tanstack/react-table` | Table model and column behavior | Operator data-table helpers and structured records | No new table engine is justified; team table currently needs a state decision, not a library | Keep table semantics in existing wrappers; add URL state only if the review task requires it. |
| `@rjsf/core`, `@rjsf/shadcn`, `@rjsf/utils`, AJV | Schema-driven Tool input forms and validation | `DirectoryToolPlayground` and Tool input helpers | Do not hand-build per-Tool form contracts | Schema-driven forms reduce bespoke input code, while the Tool-specific experience remains AE-owned composition. |
| `cmdk` and `sonner` | Command discovery and transient feedback | App command panel, root Toaster and action feedback | Do not create a second command/settings launcher or use toast as durable purchase state | Commands and toasts are useful entry/feedback layers; routes, records and status remain authoritative. |
| `stripe` | Server-side funding/checkout boundary | Credit top-up and payment session flow | No new payment UI or universal wallet abstraction | Keep buyer consideration, funding state, Provider obligation and settlement distinct as PRODUCT requires. |
| Existing `DirectoryFilters` adaptation | Faceted filters and mobile filter sheet | Market filter forms and filter count | No general filter framework is needed for owner pages | Keep Market composition local; reuse Field/Sheet/Table primitives if another surface earns filters. |
| `@playwright/test` and existing unit harness | Browser/source contract checks | Route, shell, market, settings and component tests already exist | Add only acceptance checks for a chosen continuity contract; no broad test rewrite | Tests should establish back/refresh/guard behavior, not encode speculative hierarchy or rendered measurements. |

## Cognitive-load and flow application

The simplicity-razor test rejects a new navigation layer, settings framework,
filter library, payment abstraction and chat purchasing state machine. Each
would couple concerns already separated by the route tree, Clerk, Convex,
TanStack Router and the existing UI primitives. The proposed changes therefore
stay at the smallest boundary that owns the state.

The unidirectional-flow check is:

* route search is the source for shareable Market filters and view;
* page-local state owns temporary comparison, draft, dialog and collapse state;
* server/Convex state owns account, authority, onboarding completion, team and
  commercial records;
* user events navigate or invoke one existing mutation boundary; derived lists
  and counts are computed from that source rather than stored again.

The cognitive-load check counts the decisions a person must make, not invented
pixel measures. Market asks for a need, a suitable Tool and comparison; Agent
access asks for authority; Quote/Call exposes consequence within already granted authority; human approval is needed only when the existing policy requires it;
Credit currently asks for balance, ceiling, methods, recharge, funding and
history on one page. F6 proposes a grouping hypothesis using the existing disclosure pattern; observe a representative funding task before changing it.

## Source/runtime limits

Parent review on the same date observed the local signed-in AE header (Market / Agents / Calls / My tools), market, one unavailable Tool detail, Agent connection, empty Calls and Provider activation. These observations update AE evidence only; they do not establish reference-vendor navigation, settings/Credit usability or a complete purchase. See the main report L1–L5. Parent also corrected stale file paths in this annex against the working tree.

This report does not claim a hosted or production purchase, signed-in visual
walk, external Provider activation, or rendered measurement. The design-system
register explicitly leaves the signed-in/operator walk and the live cognitive
load pass open. The source facts are enough to define route families, guard
boundaries, state ownership and acceptance checks; they are not enough to make
new destination law. Buyer IA, design-system maturity and Jev integration remain
the owning documents for their respective backlogs.

## Audit commands

The bounded audit used Node 22/npm 11.5.1 and read-only source inspection:

```text
node --version
npm --version
rg --files src/routes src/components/ae src/components/ui
nl -ba <route-or-component> | sed -n '<bounded-range>p'
rg -n "Search / Keys|signed-in|owner/market|must not" docs/operations/buyer-page-register.md docs/operations/design-system-maturity-register.md
git diff --check
```

No tests were executed by this subtask. Test commands and results from the parent and buyer subagent are recorded in the consolidated register. No deployment, purchase, hosted sign-in, or application-source edit was made for this report. A plain `git diff --check` does not validate this untracked file; parent document validation checks its links and references separately.
