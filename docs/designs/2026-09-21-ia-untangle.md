# IA untangle: one navigation model for signed-in users

**Status:** proposed design, source-only audit (no browser).  
**Date:** 2026-09-21  
**Thesis:** once signed in, a person should keep one stable map while moving between buying, supplying and account work.

The product is one account for Agents to find and use paid Tools under Credit and a Spending policy (`PRODUCT.md:11-24`). Canonical nouns come from `CONTEXT.md:28-41`. The accepted destination law is Market · Agents · Calls, with Credit as a rail and supply demoted from a buyer peer (`docs/operations/ia-rationalisation-protocol.md:16-29`).

## 1. Current state (evidence)

### 1.1 Route and shell census

The generated tree contains 122 full paths (`src/routeTree.gen.ts:783-905`). Every rendered page is wrapped once by `AeAppShell` at the root (`src/routes/__root.tsx:31-62`). Shell codes below are:

- **PUBLIC:** root header + `AePublicPage` main and footer (`src/components/ae/layout/AePublicPage.tsx:31-39,71-77`).
- **HEADER:** root header + owner `AeOperatorPage`; no desktop sidebar, because every owner path is suppressed (`src/routes/_operator.tsx:18-54`; `src/lib/operator/roles.ts:47-60`). Owner pages add a mobile bottom bar (`src/components/ae/layout/AeOperatorPage.tsx:250-257`).
- **RAIL:** root header + mounted admin operator sidebar (`src/routes/_operator.tsx:25-48`).
- **MINIMAL:** brand/status/theme/back-to-market header selected by `shellMode: minimal` (`src/components/ae/layout/AeAppShell.tsx:100-102,140-154`).
- **CHAT:** root header and chat workspace, without `AePublicPage` footer (`src/routes/t.new.tsx:12-22`; `src/routes/t.$threadId.tsx:6-19`).
- **SERVER:** handler only; no rendered shell.

`staticData` below is written as `label; placement/order`; `—` means the route declares no navigation placement.

| Route(s) | `staticData` | `head` title | Shell | Evidence |
| --- | --- | --- | --- | --- |
| `/` | — | inherited `Agentic Economy`; redirects to `/market` | redirect | `src/routes/index.tsx:7-15`; `src/routes/__root.tsx:32-43` |
| `/$slug` | — | dynamic business title | PUBLIC | `src/routes/$slug.tsx:14-38` |
| `/about` | `About; footer Market/4` | `ABOUT.metaTitle` | PUBLIC | `src/routes/about.tsx:9-24,27-32` |
| `/for-agents` | `For agents; public header/1; footer Market/1; utility/1` | `AGENT_PAGE.metaTitle` | PUBLIC | `src/routes/for-agents.tsx:11-29,35-39` |
| `/for-providers` | `For providers; public header/2; footer Market/2` | `Publish a Tool` | PUBLIC | `src/routes/for-providers.tsx:8-24,36-44` |
| `/market` | `Market; header always/0; footer Market/0` | `Agent tool market` | PUBLIC | `src/routes/market.tsx:12-20,42-53`; `src/components/ae/market/AeMarketPage.tsx:25-37` |
| `/tools/$toolRef`; `/tools/$providerHost/$slug` | — | Tool title or `Tool unavailable` | PUBLIC | `src/routes/tools.$toolRef.tsx:16-48`; `src/routes/tools.$providerHost.$slug.tsx:13-40` |
| `/privacy`; `/privacy/remove-business`; `/terms` | `Privacy Legal/0`; `Remove a listing Legal/2`; `Terms Legal/1` | `Privacy`; `Provider correction or removal`; `Terms` | PUBLIC | `src/routes/privacy.tsx:8-20`; `src/routes/privacy.remove-business.tsx:6-20`; `src/routes/terms.tsx:7-19` |
| `/support`; `/status` | `Help; footer Help/0; utility/2`; `System status; footer Help/1` | `Help`; `System status` | PUBLIC | `src/routes/support.tsx:9-28`; `src/routes/status.tsx:7-20` |
| `/developers/api`; `/developers/discovery` | `API reference; footer Resources/0`; `Discovery; developer Records/0` | `API reference`; dynamic discovery title | PUBLIC (the latter’s operator metadata is not mounted) | `src/routes/developers.api.tsx:8-21`; `src/routes/developers.discovery.tsx:8-36`; `src/components/ae/developers/discovery/AeDeveloperDiscoveryPage.tsx:17-38` |
| `/sign-in/$`; `/sign-up/$`; `/onboarding` | `shellMode: minimal` | `Sign in`; `Sign up`; `Finish workspace` | MINIMAL | `src/routes/sign-in.$.tsx:11-23`; `src/routes/sign-up.$.tsx:8-20`; `src/routes/onboarding.tsx:7-36` |
| `/t/new`; `/t/$threadId`; `/s/$shareToken` | — | `New chat`; `Private chat`; `Shared chat` | CHAT | `src/routes/t.new.tsx:12-22`; `src/routes/t.$threadId.tsx:6-19`; `src/routes/s.$shareToken.tsx:8-19` |
| `/fund/$fundingSessionId`; `/fund/cancelled` | — | `Funding status`; `Payment cancelled` | root page state (neither PUBLIC nor HEADER) | `src/routes/fund.$fundingSessionId.tsx:6-15`; `src/routes/fund.cancelled.tsx:9-34` |
| `/owner/` | `Overview; Workspace/-1/0; owner; core; mobile/0` | `Overview` | HEADER | `src/routes/_operator/owner.index.tsx:13-28,55-56` |
| `/agent-access` | `Agents; signed-in header/1; Buy/0/1; owner; core; mobile/20` | `Agents` | HEADER | `src/routes/_operator/agent-access.tsx:22-38,48-52` |
| `/agent-access/authorize` | — | `Review agent access` | HEADER | `src/routes/_operator/agent-access.authorize.tsx:12-28` |
| `/activity` | `Calls; signed-in header/2; footer Market/3; Buy/0/0; owner; core; mobile/10` | `Calls` | HEADER | `src/routes/_operator/activity.tsx:14-31,64-68` |
| `/calls/$callRef` | — | `Call receipt` | HEADER | `src/routes/_operator/calls.$callRef.tsx:21-30` |
| `/owner/credit` | `Credit; Buy/0/2; owner; core` | `Credit` | HEADER | `src/routes/_operator/owner.credit.tsx:7-28` |
| `/owner/market` | —; redirects to `/market` | — | redirect HEADER→PUBLIC | `src/routes/_operator/owner.market.tsx:6-11` |
| `/owner/operations` | `Tools; signed-in header/3; Supply/1/0; owner; core; mobile/30` | `Tools` | HEADER | `src/routes/_operator/owner.operations.tsx:16-32,50-58` |
| `/owner/operations/new`; `/owner/operations/$toolRef` | — | `Add Tool`; `Tool status` | HEADER | `src/routes/_operator/owner.operations.new.tsx:15-60`; `src/routes/_operator/owner.operations.$toolRef.tsx:11-42` |
| `/owner/supply/connections/new`; `/owner/supply/connections/oauth/callback` | — | `Connect Provider`; `Provider connection` | HEADER | `src/routes/_operator/owner.supply.connections.new.tsx:8-20`; `src/routes/_operator/owner.supply.connections.oauth.callback.tsx:19-55` |
| `/owner/settings`; `/owner/team`; `/owner/workspace` | labels only: `Account & security`; `Team`; `Workspace` | same labels | HEADER | `src/routes/_operator/owner.settings.tsx:9-24`; `src/routes/_operator/owner.team.tsx:8-22`; `src/routes/_operator/owner.workspace.tsx:9-23` |
| `/admin/index-health`; `/admin/audit-events` | `Catalog health; Records/0/0`; `Audit; Records/0/1`; admin/core | `Catalog health`; **`Activity log`** | RAIL | `src/routes/_operator/admin.index-health.tsx:13-41`; `src/routes/_operator/admin.audit-events.tsx:12-30` |

Four rendered machine links have footer metadata but no page shell: `/llms.txt` (`Machines/0`), `/SKILL.md` (`Machines/1`), `/.well-known/ucp` (`Machines/2`), `/glossary.md` (`Machines/3`) (`src/routes/llms[.]txt.ts:10-16`; `src/routes/SKILL[.]md.ts:8-14`; `src/routes/[.]well-known/ucp.ts:14-20`; `src/routes/glossary[.]md.ts:7-13`).

The other 78 generated paths are SERVER routes with no nav metadata, page title or rendered shell. Every path is enumerated here; the generated inventory is authoritative (`src/routeTree.gen.ts:783-905`):

```text
/mcp; /openapi.json; /robots.txt; /sitemap.xml; /$slug/ucp;
/.well-known/api-catalog; /.well-known/http-message-signatures-directory;
/.well-known/oauth-authorization-server; /.well-known/oauth-protected-resource;
/api/$; /api/businesses; /api/health; /api/ready;
/oauth/authorize; /oauth/device_authorization; /oauth/register; /oauth/revoke; /oauth/token;
/api/businesses/$slug; /api/businesses/search; /api/chat/anonymous; /api/clerk/webhook;
/api/discovery/examples; /api/discovery/schema; /api/internal/provider-connection-cleanup;
/api/internal/provider-consequence; /api/internal/secret-lifecycle; /api/observability/client-error;
/api/owner/data-export; /api/stripe/webhook; /api/stripe/webhook/accounts-v2;
/api/v1/account; /api/v1/account/activity; /api/v1/account/balance;
/api/v1/account/funding-sessions; /api/v1/account/funding-sessions/$fundingSessionId;
/api/v1/account/funding-sessions/public/$fundingSessionId; /api/v1/account/funding/config;
/api/v1/businesses; /api/v1/businesses/$businessId; /api/v1/businesses/search;
/api/v1/calls; /api/v1/calls/$callRef; /api/v1/calls/$callRef/cancel;
/api/v1/calls/$callRef/reconcile; /api/v1/catalogue-status;
/api/v1/funding/constraints; /api/v1/funding/quote; /api/v1/market-metrics;
/api/v1/market-requests; /api/v1/market-requests/list; /api/v1/market-requests/status;
/api/v1/market-requests/withdraw; /api/v1/market-tools/compare; /api/v1/market-tools/describe;
/api/v1/market-tools/list; /api/v1/market-tools/search; /api/v1/registry; /api/v1/release;
/api/v1/sandbox-reference; /api/v1/supply/calls; /api/v1/supply/earnings;
/api/v1/supply/publish; /api/v1/supply/recheck; /api/v1/supply/republish;
/api/v1/supply/status; /api/v1/supply/withdraw; /api/v1/supply/connections/connect;
/api/v1/supply/connections/detail; /api/v1/supply/connections/list;
/api/v1/supply/connections/reconnect; /api/v1/supply/connections/revoke;
/api/v1/supply/offboarding/status; /api/v1/supply/sources/preview;
/api/v1/supply/tools/list; /api/v1/tools/call; /api/v1/tools/procure; /api/v1/tools/quote
```

### 1.2 Navigation sources of truth

| Source | Items in effective order | Notes |
| --- | --- | --- |
| Route `staticData.nav.header` | public: `Market→/market`, `For agents→/for-agents`, `For providers→/for-providers`; signed in: `Market`, `Agents→/agent-access`, `Calls→/activity`, `Tools→/owner/operations` | Collected and sorted at runtime (`src/components/ae/website/AeSiteNav.tsx:18-41`); declarations are in the route rows above. |
| Route `staticData.nav.operator` | owner: `Workspace: Overview→/owner`; `Buy: Calls→/activity, Agents→/agent-access, Credit→/owner/credit`; `Supply: Tools→/owner/operations`. Admin: `Records: Catalog health, Audit`. Developer: `Records: Discovery`. | The sidebar scans and sorts route metadata (`src/components/ae/layout/AeOperatorSidebar.tsx:154-181`), but the owner set never mounts (`src/lib/operator/roles.ts:47-60`). Supply is disclosed only while already on an operations path (`src/components/ae/layout/AeOperatorSidebar.tsx:77-80`). |
| `roleHomeHref` + `roleLabel` | `Workspace→/owner`; `Administration→/admin/index-health`; `Developer tools→/developers/discovery` | Separate objects form a label/path pair (`src/lib/operator/roles.ts:3-13`); the sidebar brand row consumes them (`src/components/ae/layout/AeOperatorSidebar.tsx:211-227`). |
| Mobile primary | `Market→/market`, `Agents→/agent-access`, `Calls→/activity`, `Tools→/owner/operations` | Hard-coded destination and fallback-label lists (`src/components/ae/layout/AeOwnerMobileNavigation.tsx:15-31`), independently re-resolved against route metadata (`:59-90`). |
| Public footer | CTA `Browse Tools→/market`, `System status→/status`; columns `Resources: API reference`; `Help: Help, System status`; `Legal: Privacy, Terms, Remove a listing`; `Machines: llms.txt, SKILL.md, .well-known/ucp, glossary.md`; external `LinkedIn`, `X`, `Facebook`, ABN | Footer scans route metadata but explicitly drops the `Market` column (`src/components/ae/website/AeSiteFooter.tsx:17-44,81-100`); column order comes from `src/content/brand-copy.ts:164-172`; external links from `src/components/ae/website/AeSiteFooter.contracts.ts:8-37`. |
| Command palette | `Tools Market→/market`; `Calls & Activity→/activity`; `Tools→/owner/operations`; `Credit→/owner/credit`; `Agent Access & Keys→/agent-access`; `Provider Workspace→/for-providers`; quick `Check System Status→/status` | A separate constant (`src/components/ae/command-panel/tools-search-page/tools-search-page.contracts.ts:68-123`). |
| Owner overview | conditional next action to Calls, Agents, Credit or Market; fact actions `Check Credit`, `Open Calls`, Agent action, `Open My Tools→/owner/operations` | Separate decision tree and labels (`src/modules/principal-account/owner-overview.view-model.ts:61-115`; `src/components/ae/console/AeOwnerOverview.tsx:60-76,91-122`). |
| Breadcrumbs | nearest route `staticData.nav.label`; special owner operations owner is forced to `Tools`; detail pages may provide explicit `Calls / Call receipt` or `Tools / Add Tool / …` | Derivation (`src/components/ae/layout/AeOperatorPage.tsx:17-41,187-190`); rendering does not own destinations (`src/components/ae/layout/AeOperatorBreadcrumbs.tsx:102-122,129-144`). |
| Settings secondary bar | `Profile`, `Team`, `Business`, `Privacy`, `Recovery`, `Email alerts`, `Security history` → same-page anchors | `src/components/ae/settings/owner-settings.contracts.ts:51-59`; rendered by `src/components/ae/settings/OwnerSettingsShell.tsx:21-35`. |
| Skeleton preset map | overview-card shape for `/owner`, `/owner/workspace` | A navigation-adjacent path set with no shared owner (`src/components/ae/layout/AeRoutePending.tsx:17-35`). |
| Organisation/user menus | No repository label→path list: Clerk owns `OrganizationSwitcher` and modal `UserButton`; the app supplies appearance only | `src/components/ae/layout/AeOrganizationSwitcher.tsx:13-36`; `src/components/ae/layout/AeAppShell.tsx:167-181,205-223`. Account Settings is therefore not a deterministic app-owned menu item. |

### 1.3 Core journey traces

**Buyer.** Each arrow is a real control only where named.

1. `/` → `/market`: **CONTROL redirect** (`src/routes/index.tsx:7-15`).
2. Market → Tool detail: **CONTROL Tool title** to `/tools/$providerHost/$slug` (`src/components/ae/market/DirectoryToolCard.tsx:41-42`).
3. Tool detail → Agents: **CONTROL Connect an Agent first** to `/agent-access?resumeTool=…` (`src/components/ae/market/tool-detail/AeToolNextAction.tsx:64-74,120-122`).
4. Agents → selected Tool: **CONTROL Return to selected Tool** (`src/components/ae/agent-access/home/components/HomeResumeToolSection.tsx:22-27`).
5. Agents → Credit: **URL-ONLY** in the normal flow; only a legacy `#fund` arrival redirects to `/owner/credit#fund` (`src/components/ae/agent-access/home/useAeAgentAccessHome.ts:146-149`). A Tool model may instead send directly to Credit (`src/modules/market/suggested-next-action.ts:85-87`).
6. Credit → Calls: **URL-ONLY**; there is no next-hop control in this journey. Calls are reached from the global header/palette/mobile duplicates documented above.
7. Calls → receipt: **CONTROL Review/View receipt**; the row projects `/calls/{callRef}` (`src/components/ae/activity/components/ActivityCallQueue.tsx:123-128`; `src/components/ae/activity/useAeActivity.ts:154-171`).
8. Receipt → Calls: **CONTROL Back to Calls** (`src/components/ae/call-receipt/CallReceiptWorkspace.tsx:20-33`). Receipt → Market is **URL-ONLY**; reuse returns to the Tool instead (`src/components/ae/call-receipt/CallTechnicalRecord.tsx:149-160`).

**Provider.**

1. Public header → `/for-providers`: **CONTROL For providers** from header metadata (`src/routes/for-providers.tsx:8-14`).
2. Provider door → `/owner/operations/new`: **CONTROL Add Tool**; door also exposes **Manage listed Tools** to `/owner/operations` (`src/components/ae/supply/AeSupplyLanding.tsx:81-85,143-153`).
3. Add Tool → connection: **CONTROL** emitted by the source flow’s `onConnect`; the route itself stays `/owner/operations/new` until the server returns a handoff (`src/components/ae/supply/AeOwnerSupplySourceStartPage.tsx:74-92`; `src/components/ae/supply/useSupplyNativeStartState.ts:324-342`).
4. Connection → OAuth provider → callback: **CONTROL Sign in** uses `window.location.assign(authorizationUrl)` (`src/components/ae/supply/connection-handoff/useConnectionHandoff.ts:158-160`); callback is `/owner/supply/connections/oauth/callback` (`src/routeTree.gen.ts:904-905`).
5. Callback/handoff → Add Tool: **CONTROL Return to Add Tool**, not Tools (`src/components/ae/supply/connection-handoff/components/ReturnToAddTool.tsx:8-16`; `src/components/ae/supply/AeOwnerMcpOAuthCallback.tsx:24-43`).
6. Add Tool → Tools after submit: **URL-ONLY**; success only sets “submitted for validation” and does not navigate (`src/components/ae/supply/useSupplyNativeStartState.ts:305-320`).
7. Tools → Earnings: **CONTROL only when the inline payout action exists**; it opens an `#earnings` section/panel, not a route (`src/components/ae/offerings/ProviderWorkspaceEarningsSection.tsx:13-35`).
8. Earnings → Settings: **URL-ONLY**. Provider identity is another inline disclosure (“Manage provider identity”), not `/owner/settings` (`src/components/ae/offerings/ProviderWorkspaceIdentitySection.tsx:33-46`).

### 1.4 Spaghetti symptoms

- A signed-in person meets **two desktop chrome variants** in the core journeys: PUBLIC (persistent header + footer) on Market/Tool/provider door and HEADER (same header, footer removed) on owner pages. On mobile, HEADER adds a third visible pattern, the fixed four-item bottom bar (`src/components/ae/layout/AePublicPage.tsx:71-77`; `src/components/ae/layout/AeOperatorPage.tsx:250-257`). MINIMAL and RAIL add two more platform-wide variants outside the core journeys (`src/components/ae/layout/AeAppShell.tsx:140-154`; `src/routes/_operator.tsx:25-48`).
- Shell changes occur at Tool→Agents and For providers→Add Tool. The root frame does not remount, but `staticData.shell === 'operator'` closes the public drawer (`src/components/ae/layout/AeAppShell.tsx:100-106`) and the operator page removes the footer/adds mobile nav. Every owner route then fails `shouldMountOperatorSidebar` (`src/lib/operator/roles.ts:47-60`).
- Label drift: `/market` is `Market`, `Tools Market`, `Explore Market`; `/activity` is `Calls`, `Calls & Activity`; `/agent-access` is `Agents`, `Agent Access & Keys`; `/owner/operations` is `Tools`, `Open My Tools`; `/for-providers` is both `For providers` and `Provider Workspace` (`src/components/ae/command-panel/tools-search-page/tools-search-page.contracts.ts:68-104`; `src/components/ae/console/AeOwnerOverview.tsx:111-122`). `Audit` nav opens H1/document `Activity log` (`src/routes/_operator/admin.audit-events.tsx:13-30,44-50`).
- Dead ends are structural, not just missing buttons: publish success does not leave Add Tool; Earnings and Provider identity open in-place; normal Agents→Credit, Credit→Calls and Receipt→Market hops are absent; `/t/new` has no global navigation entry (`src/components/ae/supply/useSupplyNativeStartState.ts:305-320`; `src/components/ae/command-panel/tools-search-page/tools-search-page.contracts.ts:68-123`).
- “Where am I?” fails wherever path ownership differs from link prefix: `/tools/*` cannot highlight Market; `/calls/*` cannot highlight `/activity`; `/owner/supply/*` cannot highlight header Tools; Credit, Overview, Settings, Team and Workspace have no desktop primary item. Header matching is only fuzzy against each link target (`src/components/ae/website/AeSiteNav.tsx:83-100`); mobile knows only its four hard-coded paths (`src/components/ae/layout/AeOwnerMobileNavigation.tsx:40-53,93-117`).
- Buyer/Provider mode is not a durable explicit state. Onboarding records a one-time `buyer|supplier` intent (`src/routes/onboarding.tsx:9-16`); the dormant sidebar calls Supply a “mode” but reveals it only after the URL is already under operations (`src/components/ae/layout/AeOperatorSidebar.tsx:77-80`). Users enter through For providers/Add Tool, header Tools, overview’s conditional Provider card or search; they exit by choosing another unrelated nav source.
- “Provider setup” is not a shell: `AeProviderWorkspace` is titled Tools, and inventory states or zero Tools render the onboarding wizard inside its body (`src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx:27-45,93-103`).

## 2. Diagnosis

1. **ROOT-IA-1: Route metadata is treated as navigation, page taxonomy and footer configuration at once, while three other constants independently rename the same destinations — `src/router.tsx:35-66`.**
2. **ROOT-IA-2: The complete owner sidebar is built but categorically disabled for every owner route, leaving signed-in desktop wayfinding to a public-site header — `src/lib/operator/roles.ts:47-60`.**
3. **ROOT-IA-3: Public resources and signed-in work alternate between footer-bearing pages and footerless operator pages even though one root shell persists — `src/components/ae/layout/AePublicPage.tsx:71-77`.**
4. **ROOT-IA-4: Active-state ownership follows URL prefixes instead of destinations, so Tool details, Call receipts and Provider connection resources lose their parent highlight — `src/components/ae/website/AeSiteNav.tsx:83-100`.**
5. **ROOT-IA-5: Provider is neither a real mode switch nor a stable section; its only mode condition becomes true after the user has already entered a Provider URL — `src/components/ae/layout/AeOperatorSidebar.tsx:77-80`.**
6. **ROOT-IA-6: Credit, account destinations and Provider earnings are omitted or hidden in contextual UI, forcing recall and command-palette discovery — `src/components/ae/command-panel/tools-search-page/tools-search-page.contracts.ts:68-123`.**
7. **ROOT-IA-7: Destination labels are not contractual, allowing Market, Calls, Agents and Tools to acquire competing names across header, palette and overview — `src/components/ae/console/AeOwnerOverview.tsx:91-122`.**
8. **ROOT-IA-8: Core journeys have URL-only gaps after state changes, most visibly publish success retaining the Add Tool screen with no next destination — `src/components/ae/supply/useSupplyNativeStartState.ts:305-320`.**

## 3. Target navigation model

### 3.1 One signed-in frame

Mount one persistent left sidebar for every signed-in, non-minimal rendered page, including `/market`, `/tools/*`, all owner pages and Call receipts. Delete the DS-37 owner suppression. The top header becomes **public navigation only when logged out**; when signed in it keeps brand, command, workspace, theme and account controls but no duplicate destination row. This follows Stripe Dashboard’s stable grouped left rail, Linear’s persistent workspace map, and OpenRouter’s single guest catalogue carried into signed-in use. It also obeys the existing “one shell stays” law (`docs/operations/ia-rationalisation-protocol.md:70-83`).

**Sidebar order** (the evidence justifies omitting proposed `Home`: the accepted ideal says Overview is not a destination and `/owner/` folds to Market — `docs/designs/2026-09-21-ideal-app.md:175-197`):

1. `Market` → `/market`
2. `Agents` → `/agent-access`
3. `Calls` → `/activity`
4. `Credit` → `/owner/credit` — visible rail/account destination, not a buyer header peer.
5. **Provider** section
   1. `Tools` → `/owner/operations`
   2. `Earnings` → `/owner/operations#earnings` — secondary anchor until earnings earns a resumable page; do not mint a route.
6. Bottom utilities: `Settings` → `/owner/settings`; `Support` → `/support`; `Status` → `/status`.

Provider is a **section, not a mode switch**. A switch would introduce hidden state and an enter/exit problem that code does not currently model. A labelled section keeps buying and supplying visible without making Tools a fourth buyer peer. This applies Stripe’s grouped-product rail, Linear’s visible workspace sections, and the ideal’s rule that one person may buy and supply while supply is not a header peer (`docs/designs/2026-09-21-ideal-app.md:145-164`).

Logged-out `/market` and `/tools/*` use the public header (`Market · For agents · For providers · Sign in`) and footer. Signed-in requests for those same URLs use the app sidebar and no marketing footer. The resource URLs do not change.

**Mobile:** `Market · Agents · Calls · Credit · More`. `More` opens Provider (`Tools`, `Earnings`) and utilities (`Settings`, `Support`, `Status`). This is the first four sidebar destinations plus disclosure, not a separately named list.

**Current-section rule:** one explicit `owns(pathname, hash)` predicate per destination. Market owns `/market` and `/tools/*`; Agents owns `/agent-access*`; Calls owns `/activity*` and `/calls/*`; Credit owns `/owner/credit*` and `/fund/*`; Tools owns `/owner/operations*` and `/owner/supply/*`; Earnings wins over Tools when `#earnings`; Settings owns `/owner/settings*`, `/owner/team*`, `/owner/workspace*`; Support and Status own their exact paths. Exactly one destination receives `aria-current="page"`.

**Breadcrumb rule:** no breadcrumb on destination roots. Resource pages show only `Destination / resource title`, derived from the same ownership record: `Market / Tool`, `Calls / Call receipt`, `Tools / Add Tool / Connect Provider`. Breadcrumbs never repeat the page H1.

**H1/title rule:** destination H1 equals the navigation label exactly; document title is `<label> | Agentic Economy`. Resource pages use the resource name/H1 while the parent remains highlighted. The command palette renders the same ordered records and labels; search keywords may include old technical terms but visible labels may not.

## 4. Vocabulary + label contract

| Destination | One label | Path | Destination H1 | Document title |
| --- | --- | --- | --- | --- |
| Buyer catalogue | Market | `/market` | Market | `Market | Agentic Economy` |
| Agent identities and Spending policies | Agents | `/agent-access` | Agents | `Agents | Agentic Economy` |
| Call history | Calls | `/activity` | Calls | `Calls | Agentic Economy` |
| Prepaid account | Credit | `/owner/credit` | Credit | `Credit | Agentic Economy` |
| Provider publications | Tools | `/owner/operations` | Tools | `Tools | Agentic Economy` |
| Provider money section | Earnings | `/owner/operations#earnings` | Earnings (section H2; page H1 stays Tools) | `Tools | Agentic Economy` |
| Shared account | Settings | `/owner/settings` | Settings | `Settings | Agentic Economy` |
| Help | Support | `/support` | Support | `Support | Agentic Economy` |
| Platform health | Status | `/status` | Status | `Status | Agentic Economy` |

Resource contract: Tool detail H1 is the Tool name and title is `<Tool name> | Agentic Economy`; receipt H1/title is `Call receipt`; Add Tool and Connect Provider remain resource/action names. Canonical nouns are Tool, Tool version, Quote, Call, Spending policy, Purchase resolution, Agent, Provider, Credit, Business and Workspace (`CONTEXT.md:28-41`). Do not expose “Tools Market”, “Calls & Activity”, “Agent Access & Keys”, “Provider Workspace”, “My Tools”, “Overview”, “System status” or “Account & security” as destination labels.

## 5. Migration

Each item is an atomic change unless a noted consumer is OWNER-LOCKED.

1. **Create `src/lib/navigation/app-navigation.ts`.** Export typed `PUBLIC_NAVIGATION`, `APP_NAVIGATION`, groups, mobile rank, command keywords and `resolveAppDestination(pathname, hash)`. This replaces label/path/order/active ownership spread across the sources in §1.2. Gate: new `tests/unit/navigation/app-navigation.test.ts` asserts unique labels/paths, exact order and every resource ownership case.
2. **`src/components/ae/layout/AeOperatorSidebar.tsx`.** Render the canonical app records; remove route-tree scanning, `shouldDiscloseNavGroup`, `roleHomeHref` label synthesis and prefix-only active logic. Why: ROOT-IA-1/2/4/5. Gate: the navigation unit test renders sidebar labels from exported records.
3. **`src/components/ae/layout/AeOwnerMobileNavigation.tsx`.** Delete `OWNER_PRIMARY_DESTINATIONS`, fallback labels and local resolver; render four mobile records plus More from the same module. Why: the duplicate list at `:15-31`. Gate: same test asserts mobile is the first four `mobile` records and More contains the remainder.
4. **`src/components/ae/command-panel/tools-search-page/tools-search-page.contracts.ts`.** Delete `COMMAND_NAVIGATION_ITEMS`; project command entries from `APP_NAVIGATION`, retaining only keywords locally if the type cannot carry them. Why: visible label drift at `:68-105`. Gate: same test asserts palette/sidebar label+href parity.
5. **`src/components/ae/website/AeSiteNav.tsx`.** Stop scanning signed-in route metadata; use `PUBLIC_NAVIGATION` only for logged-out header/drawer. Signed-in header owns account utilities, not destinations. Why: two primary maps now compete (`:24-41`). Gate: focused header test asserts signed-in destination links are absent and public order is exact.
6. **`src/components/ae/layout/AeAppShell.tsx`.** Hoist the signed-in sidebar/provider to the persistent root frame; render it for signed-in standard routes and suppress it only for MINIMAL. Choose PUBLIC footer versus app content by authentication, not by route component. Why: PUBLIC↔HEADER shell swap. Gate: shell test covers signed-out and signed-in `/market`, `/tools/x`, `/activity` with the same sidebar instance/key.
7. **`src/routes/_operator.tsx`.** Remove its second `SidebarProvider`, sidebar mount decision and DS-37 branching; retain authorization, transition boundary and outlet. Why: one frame must own chrome. Gate: operator layout test asserts no nested workspace navigation.
8. **`src/lib/operator/roles.ts`.** Delete `ownerBuyerOperatorSurfaceForPath`, `shouldMountOperatorSidebar`, owner `roleHomeHref`/`roleLabel` navigation authority; retain role detection and resource ownership only if still needed. Why: ROOT-IA-2. Gate: no import remains outside tests.
9. **Route files with `staticData.nav`.** Remove header/operator labels/orders after all consumers cut over; retain `staticData.shell`, `shellMode`, and footer data only until step 10. Why: route files should describe routing, not global IA. Gate: route metadata test asserts no app destination declares `nav.header` or `nav.operator`.
10. **`src/components/ae/website/AeSiteFooter.tsx`.** Read public/footer records from the canonical module; then remove footer placement from route `staticData`. Keep external links in `AeSiteFooter.contracts.ts`. Why: footer is another route-tree projection (`:17-44`). Gate: footer test asserts the module’s configured columns and order.
11. **`src/components/ae/layout/AeOperatorPage.tsx`.** Resolve parent crumb and current destination through `resolveAppDestination`; delete owner-operation special casing. Why: breadcrumbs currently carry a second ownership map (`:25-40`). Gate: destination/resource breadcrumb unit cases.
12. **`src/components/ae/layout/AeRoutePending.tsx`.** Delete `/owner` from `OVERVIEW_CARD_PATHS` after redirect; make skeleton selection destination-owned or route-local. Why: hidden path taxonomy at `:17-35`. Gate: pending preset unit case for Market redirect.
13. **`src/routes/_operator/owner.index.tsx`.** Redirect `/owner` to `/market`; do not add Home. **PROPOSED, awaiting Joel because `/owner` fate is parked** (`docs/operations/platform-stabilisation-register.md:627-632`). Gate: route test asserts redirect and preserved search.
14. **Journey exits:** `useSupplyNativeStartState.ts` exposes a post-submit `Open Tools` continuation; Provider earnings/identity use canonical section links; receipt offers `Back to Calls` plus `Market` in More, not a bespoke chain. Why: ROOT-IA-8. Gate: focused interaction tests assert observable hrefs after each terminal state.
15. **Vocabulary pass:** change destination H1/head labels to §4 and remove visible aliases. Why: ROOT-IA-7. Gate: navigation contract test plus existing copy-vocabulary gate.

### OWNER-LOCKED changes — PROPOSED for Joel

The register forbids subagent edits to these paths (`docs/operations/platform-stabilisation-register.md:37-54`):

- `src/routes/market.tsx`, `src/components/ae/market/**`, `src/routes/tools.*.tsx`: signed-in Market ownership/highlight; Market H1/title; Tool breadcrumb.
- `src/routes/_operator/agent-access*.tsx`, `src/components/ae/agent-access/**`: Agents title and destination continuation.
- `src/routes/_operator/activity.tsx`, `src/components/ae/activity/**`: Calls highlight and canonical palette/empty-state labels.
- `src/routes/_operator/calls.$callRef.tsx`, `src/components/ae/call-receipt/**`: Calls ownership and receipt return controls.
- `src/routes/_operator/owner.credit.tsx`, `src/components/ae/console/owner-credit/**`: Credit in the canonical rail and H1/title parity.
- `src/components/ae/support/**`: rename destination H1 from Help to Support while preserving support copy.

## 6. Open decisions for Joel

- **`/owner` fate:** recommended default is redirect to `/market` and omit Home, matching the accepted dest law; the stabilisation register still parks the decision.
- **Earnings depth:** recommended default is `/owner/operations#earnings` as a Provider secondary item until earnings needs reload/resume semantics; do not invent a route now.
- **Signed-in public footer:** recommended default is hide the marketing footer on signed-in `/market` and `/tools/*`; keep it only for logged-out discovery.
- **Settings scope:** recommended default is one Settings destination owning Account, Team and Workspace resources, not three primary links.
- **Admin/developer access:** recommended default is keep role-gated utilities in More/command search; do not mix their Records destinations into the buyer/provider primary rail.
