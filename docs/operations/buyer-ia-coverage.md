# Buyer IA coverage — live product pages

**Status:** evidence in progress  
**Date:** 2026-09-21  
**Method:** Cursor browser on the product itself. Help centres and docs are not evidence here.  
**Session:** logged out unless noted. Signed-in dests that need a login are `BLOCKED`, not inferred.

Grades:

- `SEEN` — on screen this session, URL recorded
- `BLOCKED` — product redirected to login; dests behind that wall were not walked
- `NOT VISITED` — not opened this session

Do not promote a dest into AE chrome from a `BLOCKED` or `NOT VISITED` cell.

---

## 1. What I opened

| Product | URL walked | Grade |
| --- | --- | --- |
| Airbnb home | https://www.airbnb.com.au/ | SEEN |
| Airbnb search | https://www.airbnb.com.au/s/Sydney/homes | SEEN |
| Airbnb listing | https://www.airbnb.com.au/rooms/888174431355783262 | SEEN |
| Perplexity home + sidebar | https://www.perplexity.ai/ | SEEN (logged out, 745px) |
| Nevermined app | https://nevermined.app/ → `/login?redirect=%2F` | BLOCKED after login |
| Nevermined catalog home | https://nevermined.app/catalog/ | SEEN |
| Nevermined services | https://nevermined.app/catalog/services | SEEN |
| Nevermined listing | https://nevermined.app/catalog/exa-native-x402 | SEEN |
| Locus home | https://paywithlocus.com/ | SEEN |
| Locus catalog | https://paywithlocus.com/tools | SEEN |
| Locus Pro app | https://platform.paywithlocus.com/login?returnTo=%2F | BLOCKED |
| Whop home | https://whop.com/ | SEEN |
| Stripe Dashboard | — | NOT VISITED |
| Linear | — | NOT VISITED |
| AE market (local, logged out) | http://127.0.0.1:3024/market | SEEN |

AE signed-in dest labels below come from **our source** (`src/routes/*` `nav.header` + `AeOwnerMobileNavigation`), not from a signed-in walk of AE. That walk is still open.

---

## 2. Airbnb (guest, logged out)

**Home chrome (SEEN):** logo · tabs **All / Homes / Experiences / Services** · search **Where / When / Who** · globe · hamburger.

**Hamburger (SEEN):** Help Centre · Become a host · Refer a host · Find a co-host · Gift cards · Log in or sign up.

**Home body (SEEN):** city carousels of listing cards; heart on every card (“Add to Wishlist”).

**Search `/s/Sydney/homes` (SEEN):** same header tabs · search pills (location / dates / guests) · **Filters · Price · Type of place** · **Show map** · cards with heart + price total.

**Listing `/rooms/…` (SEEN):** same header search · **Share · Save** · photo grid · reviews · host · calendar · **Reserve** (price + dates + guests on the listing) · **Message host** · Report this listing.

**Not on screen logged out:** Trips, Messages as a dest, Wishlists dest, Profile dest, Switch to hosting. Those stay `BLOCKED` until a signed-in walk.

**Jobs visible without login:** browse → filter results → open listing → reserve or message from the listing. Hosting is a menu offer, not a peer tab.

---

## 3. Perplexity (logged out)

**Home (SEEN):** the page *is* the ask. Heading “What do you want to know?”. One box. Modes on the box: **Search** (pressed) · **Computer**. Also: Add files or tools · Model · Dictation · **Work in a project** · incognito.

**Sidebar “Main” (SEEN):** **New** (`/`) · **Computer** (`/computer/tasks`) · **Artefacts** (`/computer/artifacts`) · **Customise** (`/computer/connectors`) · **Projects** (`/projects`) · **Sessions** (`/library`) · Sign Up · Log in.

**Not on screen:** Discover. Do not claim Discover as a dest from this walk.

**Jobs visible:** ask is the product. History is **Sessions**, not a “Trips” word. Projects exist as a dest; PRODUCT.md says AE does not own the user’s project.

---

## 4. Nevermined (PRODUCT.md default)

**App root (SEEN → BLOCKED):** `nevermined.app` dumps to login. Pitch on the wall: monetize an AI agent, unified dashboard, API key management. No dest rail until sign-in.

**Catalog home `/catalog/` (SEEN):** header **Outcomes · Services · Get started · Search AI Services · Log in · List your service**. Body: “Describe the outcome. The Catalog composes the workflow.” Outcome cards with observed run price. Category chips. Service cards (Exa, You.com, …).

**Services `/catalog/services` (SEEN):** “All AI Services” · search “services, vendors, capabilities” · category list with counts · sort **Relevance / Price / Name** · **Grid / List** · paginated cards.

**Listing `/catalog/exa-native-x402` (SEEN):** price `$0.007 / request` · **Top up balance** · **Log in to get your API key** · facts (category, protocol x402, network, uptime). Copy on the card: “no plan, no checkout”. There is **no Reserve**.

**Signed-in Agents / Plans / Settings tabs:** `BLOCKED`.

---

## 5. Locus (PRODUCT.md default)

**Marketing home (SEEN):** “Every tool your agent needs. One account.” CTAs **Start for free · Browse the catalog**. MCP install strip (Claude Code / Codex / Hermes / OpenClaw).

**Hamburger (SEEN):** Products — **Locus Pro · Locus Pro for Platforms · Pay With Locus · Build with Locus · Checkout · Locus Founder**. Then **How it works · Agent tools · For platforms · Documentation · Sign in**.

**Catalog `/tools` (SEEN):** “Agent tools for every task” · search “providers by name, capability, or category” · category facets (`All (3347)`, `E-commerce (451)`, …) · provider cards.

**App (BLOCKED):** Sign in goes to `platform.paywithlocus.com/login`. Google / GitHub / GitLab / AgentID / Ethereum / Passkey / email. No dest rail visible.

**Signed-in Approvals / Transactions / Agent settings:** `BLOCKED`.

---

## 6. Whop (PRODUCT.md supporting)

**Home (SEEN):** header **For enterprise · API · Sign in · Get Started**. Marketing names **Checkout · Wallet · Chat** as product surfaces. Footer categories (Coaching, Services, Software, …).

**Dashboard dests (Products, Users, Balances):** `BLOCKED`.

---

## 7. AE human pages (source + logged-out Market)

### Header dests in source

| Audience | Label | Path | File |
| --- | --- | --- | --- |
| always | Market | `/market` | `src/routes/market.tsx` |
| public | For agents | `/for-agents` | `src/routes/for-agents.tsx` |
| public | For providers | `/for-providers` | `src/routes/for-providers.tsx` |
| signed-in | Agents | `/agent-access` | `src/routes/_operator/agent-access.tsx` |
| signed-in | Calls | `/activity` | `src/routes/_operator/activity.tsx` |
| signed-in | My tools | `/owner/operations` | `src/routes/_operator/owner.operations.tsx` |

Mobile primary set repeats those four signed-in dests (`AeOwnerMobileNavigation`).

`/` redirects to `/market` (`src/routes/index.tsx`).

### Logged-out Market (SEEN)

Header: home · connection · **Find Tools** · appearance · hamburger.  
Ask: “Describe what you need done…”.  
Chips: Research a topic · Create an image · Explore markets.  
Tabs: **Tools · Collections · Providers · Saved**.  
Collection rows: Create, Research, Build, Markets, Commerce, Identity.  
Cards: save heart · compare · open listing.

Signed-in AE chrome (Agents / Calls / My tools in the header) was **not** walked this session.

### Operator rail in source (`nav.operator`)

Built from `AeOperatorSidebar`. Not walked signed-in.

| Label | Path | Roles |
| --- | --- | --- |
| Overview | `/owner/` | owner |
| Calls | `/activity` | owner |
| Agents | `/agent-access` | owner |
| Credit | `/owner/credit` | owner |
| Market | `/owner/market` | owner |
| My tools | `/owner/operations` | owner |
| Discovery | `/developers/discovery` | developer |
| Catalog health | `/admin/index-health` | admin |
| Audit | `/admin/audit-events` | admin |

`nav.label` without a rail dest: Workspace, Team, Account & security.

### Full human route census (source)

42 routable pages + `/` redirect. From `src/routes/**/*.tsx` (no API/OAuth/MCP/well-known). Jobs from route `head` / title only.

| Path | Label | Header | Rail | Container | Role |
| --- | --- | --- | --- | --- | --- |
| `/` | — | — | — | redirect → `/market` | buyer |
| `/market` | Market | always | — | `AeMarketPage` | buyer |
| `/for-agents` | For agents | public | utility | `AeAgentDoorPage` | marketing |
| `/for-providers` | For providers | public | — | `AeSupplyLanding` | supplier |
| `/about` | About | — | — | `AeAboutPage` | marketing |
| `/status` | System status | — | — | `AeSystemStatus` | marketing |
| `/support` | Help | — | utility | `AeSupportHelpPage` | buyer |
| `/developers/api` | API reference | — | — | Scalar | marketing |
| `/developers/discovery` | Discovery | — | developer | `AePublicPage` | admin |
| `/privacy` | Privacy | — | — | `AePrivacyPage` | legal |
| `/privacy/remove-business` | Remove a listing | — | — | `AeRemoveBusinessPage` | legal |
| `/terms` | Terms | — | — | `AeTermsPage` | legal |
| `/onboarding` | — | — | — | `AeOnboardingPage` | buyer |
| `/sign-in/*` | — | — | — | `AeSignInPage` | auth |
| `/sign-up/*` | — | — | — | `AeSignUpPage` | auth |
| `/fund/$fundingSessionId` | — | — | — | `AeFundingReturnPage` | buyer |
| `/fund/cancelled` | — | — | — | `AePageState` | buyer |
| `/$slug` | — | — | — | `AePublicBusiness` | supplier |
| `/tools/$toolRef` | — | — | — | `PublicToolDetail` | buyer |
| `/tools/$providerHost/$slug` | — | — | — | `AeDirectoryToolCanonicalPage` | buyer |
| `/t/new` | — | — | — | `Chat` | buyer |
| `/t/$threadId` | — | — | — | `Chat` | buyer |
| `/s/$shareToken` | — | — | — | `SharedChat` | buyer |
| `/owner/` | Overview | — | owner | `AeOwnerOverview` | buyer |
| `/owner/workspace` | Workspace | — | — | Clerk `OrganizationProfile` | buyer |
| `/owner/team` | Team | — | — | `AeTeamDirectoryTable` | buyer |
| `/owner/settings` | Account & security | — | — | `OwnerSettingsShell` | buyer |
| `/owner/operations` | My tools | signed-in | Supply | `AeProviderWorkspace` | supplier |
| `/owner/operations/new` | — | — | — | `AeOwnerSupplySourceStartPage` | supplier |
| `/owner/operations/$toolRef` | — | — | — | `AeOwnerToolDetailPage` | supplier |
| `/owner/supply/connections/new` | — | — | — | `AeConnectionHandoff` | supplier |
| `/owner/supply/connections/oauth/callback` | — | — | — | `AeOwnerMcpOAuthCallback` | supplier |
| `/owner/market` | Market | — | Buy | `AeX402Directory` | buyer |
| `/owner/credit` | Credit | — | Buy | `AeOwnerCreditPage` | buyer |
| `/agent-access` | Agents | signed-in | Buy | `AeAgentAccessHome` | buyer |
| `/agent-access/authorize` | — | — | — | `AeAgentAccessAuthorizePage` | buyer |
| `/activity` | Calls | signed-in | Buy | `AeActivity` | buyer |
| `/calls/$callRef` | — | — | — | `CallReceiptWorkspace` | buyer |
| `/admin/index-health` | Catalog health | — | admin | `AeAdminCatalogHealthPage` | admin |
| `/admin/audit-events` | Audit | — | admin | `AeAdminReadbackPanel` | admin |

---

## 8. Have / missing / extra (only SEEN vs SEEN)

Compare **logged-out buyer chrome** only. Anything behind login is omitted.

| Job on the live page | Airbnb | Perplexity | Nevermined Catalog | Locus `/tools` | AE `/market` |
| --- | --- | --- | --- | --- | --- |
| Home *is* search/browse | SEEN (All + search) | SEEN (the box) | SEEN (Outcomes) | SEEN (provider index) | SEEN (ask + collections) |
| Category / facet dests | Homes / Experiences / Services | Search vs Computer on the box | Outcomes vs Services | Category chips | Tools / Collections / Providers / Saved |
| Type-in search | Where/When/Who | Ask anything | Search AI Services | Search providers | Describe what you need |
| Results as a page | `/s/…/homes` + Filters/Price/Type/Map | same thread | `/catalog/services` + sort | same `/tools` | mixed into `/market` |
| Listing | `/rooms/…` | n/a (answer, not a dest) | `/catalog/{slug}` | provider card (off-site links common) | `/tools/…` (source; not clicked this session) |
| Primary action on listing | **Reserve** | Submit ask | **Top up** + **Log in for API key** | not a Reserve | not walked |
| Save | heart on card + listing | Sessions dest | not on catalog home | not seen | Saved tab + heart |
| Host / publish | Become a host in menu | — | **List your service** in header | Sign in / Start for free | For providers (public header, source) |
| Account | Log in in hamburger | Sign Up / Log in in sidebar | Log in | Sign in → platform login | hamburger (logged out) |

### AE extras vs what was on those pages

From **source**, not from a signed-in AE walk: header dests **Agents**, **Calls**, **My tools**. None of the logged-out reference homes put “keys”, “receipts”, or “my listings” as peer tabs. Airbnb puts hosting in the menu. Nevermined puts “List your service” next to Log in, not as a fourth buyer tab. Locus puts catalog on the marketing site and the account behind `platform.paywithlocus.com`.

### AE missing vs what was on those pages

- Airbnb **Reserve on the listing**. Nevermined listing explicitly has no checkout. AE listing action: not walked this session.
- Nevermined **Outcomes vs Services** as two dests. AE mixes ask, collections, and a tool list on one Market page.
- Locus **category facets on the catalog**. AE Market (logged out) showed collection rows, not a provider-count facet rail (explorer facets exist in source after browse/search; not on this first paint).
- Perplexity **one dest that is the ask**. AE Market is a catalogue with an ask on top.

---

## 9. What this does *not* decide

The earlier Search / Keys / Trips collapse is **not** law. It interpolated signed-in Airbnb dests that this session did not see.

Still required before any dest rename or fold:

1. Signed-in Airbnb (Trips / Messages / Wishlists / Profile / Switch to hosting) — `BLOCKED`
2. Signed-in Locus Pro dashboard — `BLOCKED`
3. Signed-in Nevermined App (Agents / Plans / Settings) — `BLOCKED`
4. Signed-in Whop dashboard — `BLOCKED`
5. Signed-in AE header (Market / Agents / Calls / My tools) — not walked
6. AE listing + Quote/Call — not walked
7. Stripe / Linear — `NOT VISITED`

Need a logged-in session (or you take over the browser) for 1–5.

---

## 10. Next walk (product pages only)

1. Sign into Airbnb → hamburger + bottom dests → one Trip.  
2. Sign into Locus Pro → every item in the signed-in rail.  
3. Sign into Nevermined App → every tab.  
4. Sign into AE → header dests + one Tool + one Call.  
5. Only then rewrite dest labels.

---

## 11. Docs-named dests (not dest law)

Scouts later named dests from first-party **docs**. Those stay `DOCS` until the same dest is `SEEN` on the product. Do not fold or rename AE chrome from this list.

Conflicts with the live walk (live wins):

| Claim in docs | Live walk |
| --- | --- |
| Perplexity History / Library as the sidebar word | Sidebar label was **Sessions** (`/library`) |
| Perplexity Discover as chrome | `/discover` not opened; not in the logged-out sidebar |
| Locus Pro Tools / Credits / Connections | `platform.paywithlocus.com` was login only |
| Older Locus platform Approvals / Transactions / Agent Settings | Different product from Locus Pro; not opened |
| Airbnb Explore as a dest | Homepage + Search + All/Homes/Experiences/Services. Explore as a tab not on screen |
| Airbnb Trips / Messages / Wishlists dest | Help names them; not on logged-out chrome |

Docs-named (quarantine):

- **Airbnb (help + App Store):** Trips, Past trips, Canceled reservations, Wishlists (Menu), Messages, Profile, Account settings, Switch to hosting / traveling, host **Today / Listings / Calendar / Earnings / Menu**. Explore as a dest = UNVERIFIED even in their help.
- **Perplexity (help + live URLs not opened here):** Discover (`/discover`), History/Library, Projects (`/spaces` → `/projects`), Computer (`/computer`), Settings via avatar. Collections = dead URL.
- **Locus Pro (docs.paywithlocus.com):** personal Tools / Credits / Connections / Usage; enterprise Agent tools / Funding & billing / API Keys / Activity / Analytics / Team. Not the old USDC platform walkthrough.
- **Nevermined App (docs):** seller Agents / Plans; buyer Catalog + Settings → Payment Methods; org dashboard 12 tabs. Catalog chrome above is `SEEN`; App tabs are not.
- **Stripe Dashboard (docs only, NOT VISITED):** Home, Balances, Transactions, Customers, Product catalog, then Payments / Billing / Reporting; Settings = Personal / Account / Product; account picker for sandbox/org.
- **Linear (docs only, NOT VISITED):** Inbox, My issues, Projects, Views; Settings from workspace name; avatar is profile + Account notifications; workspace switch from the name.
