# Stable application definition

The product has been built fast across Wells 0 to 7 and carries drift: two navigation registries, redirect-only routes, four `window.location.assign` calls, machine surfaces that list the same actions three different ways, raw reason codes in the UI, Tool/service/job synonyms, and a design doc that contradicts the brand kit. This document defines the product's rationalised, stable state on four axes, Source, Behaviour, Transitions and IA, by reference to gold standards already researched in-repo (Whop, Locus, Nevermined, Package 5 scavenge, Package 2 IA) and the latest brand kit. No handrolled mechanisms: every change reuses a platform primitive or an existing repo pattern; the plan introduces no new registry, dispatcher, generator or effect. Test and validation scripts are not deliverables and not proof; proof is real use through the `ae` CLI, MCP, HTTP and a real browser.

**Date:** 2026-09-11
**Status:** living contract; gap column updated at each lane closeout.

## Decisions

- **Brand:** Forest green `#24543D` is primary, per the brand kit PDF, p.7. DESIGN.md's violet `#4a38f5` is wrong and gets amended. No colour change in the app.
- **Feel:** aecon.ai is the Airbnb of the agentic economy, not a trading desk. Listings, hosts, trust and possibility; not tickers, windows and movers.
- **Well 7 M2** (settings that act, owner-bound settings routes, recovery states) folds into this pathway.

## Primitives already in place

Reuse, never parallel.

| Need | Existing primitive | Where |
|---|---|---|
| Navigation source of truth | TanStack Router route tree + `staticData` route option | `src/routeTree.gen.ts`, `src/router.tsx` |
| Scroll and transitions | `scrollRestoration: true`, `defaultViewTransition: true` | `src/router.tsx` |
| Redirects | `throw redirect()` in `beforeLoad` | e.g. `src/lib/operator/route-options.ts` |
| Canonical action list | `@/modules/actions` (`findAction`, `listCallRouteDescriptors`, `mcpToolName`, `surfaces`) | `src/modules/actions/index.ts` |
| Surface derived from registry (the pattern to copy) | `listMcpActions()` filtered by `surfaces.includes('mcp')` | `src/lib/server/mcp-api.ts` |
| Thin HTTP route shape | route file calls `action.run()` / one handler import | `src/routes/api.v1.account.ts`, `api.v1.services.$serviceId.ts` |
| CLI argument parsing | `node:util parseArgs` | `tools/ae/cli.ts` |
| User-facing copy catalogue | `src/content/brand-copy.ts` | `src/content/` |
| Sidebar, sheet, tabs | shadcn/ui components already installed | `src/components/ui/` |
| Module dependency law | `MODULE_BOUNDARY_MANIFEST`, zero exceptions | `src/modules/module-boundaries.ts` |

## Source

Gold: `research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md` "Decisive no-handroll matrix" ll.200-217; `src/modules/module-boundaries.ts`.

| # | Invariant | Gold standard | Current gap | Real-use proof | Status |
|---|---|---|---|---|---|
| 1 | Runtime imports satisfy the module boundary manifest with zero exceptions. | PACKAGE-5 no-handroll matrix; `src/modules/module-boundaries.ts` | Already met. Protected, not worked; new modules enter only via `entrySurfaces`/`allowedDependencies`. | Enforced continuously as a constraint on every lane; no dedicated lane proof step. | Met |
| 2 | No hosted-vendor mechanic (OAuth, KYC, webhook signing, payout, catalogue review) is reimplemented inside AE modules. | PACKAGE-5 no-handroll matrix | Recorded 2026-09-11: repository scan of 760 files found OAuth via `oauth4webapi`, Stripe webhooks via `stripe.webhooks.constructEvent`, Clerk via `verifyWebhook`, KYC via Stripe Connect `accountLinks`, workflows via `@convex-dev/workflow`, x402 via `@x402/*` packages; HMAC use is limited to AE-owned protocols (source write admission, share tokens, call signing, service auth envelope). | Repository scan of 760 files (see Closeout notes, PACKAGE-5 closure item 8). | Met (2026-09-11) |
| 3 | One action definition in `src/modules/actions` is the only list of actions; MCP, HTTP v1 and CLI read it. | `src/lib/server/mcp-api.ts` registry-read pattern | Met for CLI and MCP: `tools/ae/commands/manifest.ts` now derives action-backed commands from `listActions()` filtered on the `cli` surface, the same pattern as `listMcpActions()`; `ae quote` exists. Six documented arg overrides remain where the CLI's real argument surface differs from an action's declared parameters. HTTP routes already call registry actions through shared correlation and rate-limit helpers, so no route rewrite was needed (scope narrowed, recorded as a decision). | Lane 3: `npm run ae -- quote <toolRef>` succeeds; the same Tool inspected via MCP and via `curl /api/v1/...` returns identically shaped results. | Met (2026-09-11) |
| 4 | Design tokens in `src/styles/globals.css` are the only colour source and match the written design contract. | Brand kit PDF, p.7 | Resolved: DESIGN.md amended to the brand kit (Forest primary, Charcoal action, Gold logo-only, Manrope 200/400/500, Feel subsection added). | Lane 4: real browser screenshots of `/`, `/market`, one Tool page and `/owner/offerings` reviewed against the brand kit. | Met (2026-09-11) |

## Behaviour

Gold: `research/LOCUS-AE-MATURITY.md` operating-parity matrix; `research/WHOP-AE-MATURITY.md`.

| # | Invariant | Gold standard | Current gap | Real-use proof | Status |
|---|---|---|---|---|---|
| 1 | Every reason code a caller can receive maps to one written human sentence from the content catalogue. | LOCUS operating-parity matrix | Resolved: `src/content/reason-copy.ts` maps reason codes to one sentence with a fallback sentence; consuming sites `AeSupplySourceNativeStart.tsx` and `src/routes/tools.$toolRef.tsx` (was `src/modules/discovery/tool-inspector-model.ts`, W7-005/006). | Lane 3: a refusal shows a sentence, not a slug. | Met (2026-09-11) |
| 2 | One noun per commercial object everywhere: Tool, Quote, Call, Provider, Customer. | WHOP-AE-MATURITY.md | Resolved for the supply landing, for-providers, the Provider connection page and Operations pages (W7-001/002); residual sweep recorded as a smell if any remain. | Lane 3: the same Tool inspected via MCP and via `curl /api/v1/...` returns identically shaped results. | Met (2026-09-11) |
| 3 | Quote is an executable, expiring commitment that invoke presents unchanged; drift fails closed. | Locus "Preflight" row (LOCUS doc l.71/111) | Stale: `callAction` requires `quoteRef` (`src/modules/capability-execution/call-contracts.ts:65-68`); `convex/capabilityQuotes.ts` `readForCall` (ll.954-994) validates principal/account/credential/environment binding, state issued and expiry, refusing with `operation_not_current`. The original "cannot present the inspected plan ref" gap predates this and the Locus paper's `inspectPlanRef` sentence is superseded. | Lane 3: `npm run ae -- quote <toolRef>` succeeds. | Met (2026-09-11) |
| 4 | Only a verified Qualified Use establishes "useful outcome"; never payment success or a rating alone. | PACKAGE-5 §5C item 6 | Rating mutation accepts any authenticated principal (WHOP doc l.89/144). | Not yet covered by a lane; no proof step defined in the pathway. | Open |

## Transitions

Gold: TanStack Router `redirect()`, `useNavigate()`, `scrollRestoration`, `defaultViewTransition`; PACKAGE-2 §2C.4.

| # | Invariant | Gold standard | Current gap | Real-use proof | Status |
|---|---|---|---|---|---|
| 1 | All navigation goes through the router; `window.location.*` never appears in a route component. | TanStack Router `useNavigate()`, `throw redirect()` | Resolved: three same-origin `window.location.assign` calls in `owner.supply.connections.new.tsx` replaced with `navigate()`; the OAuth authorize URL and Stripe checkout/onboarding URLs remain document navigations by design (external origin). The residual plain anchor became `<Link>`. | Lane 2: real browser, start an OAuth connect, press Back after return; SPA state survives and the Network tab shows no document reload. | Met (2026-09-11) |
| 2 | Every redirect-only route is a real destination or deleted. | PACKAGE-2 §2C.4 | Resolved by deletion: `engine.tsx`, `tools.tsx`, `help.tsx`, `contact.tsx`, `owner.settings.{connections,payouts,developers}.tsx` removed; six orphaned tests importing them deleted. Decision: PACKAGE-2 §2B.5 kept these as compatibility entrances, but the lean rule (no compatibility layers) plus the Operations landing already rendering connections and earnings made deletion the correct reading, not new nested pages. | Lane 1: click every header, sidebar and mobile-sheet item once, no dead redirects. | Met (2026-09-11) |
| 3 | Scroll and transition behaviour is the router's default; no component adds its own. | `scrollRestoration`, `defaultViewTransition` | Already configured in `src/router.tsx`; gap is only the `window.location` bypass above. | Lane 2: real browser, start an OAuth connect, press Back after return; SPA state survives and the Network tab shows no document reload. | Met |

## IA

Gold: `research/PACKAGE-2-HUMAN-WORKSPACE-IA.md` target tree ll.78-96, §2B, §2C; brand kit pp.2, 11-12, 15; Airbnb listing IA.

| # | Invariant | Gold standard | Current gap | Real-use proof | Status |
|---|---|---|---|---|---|
| 1 | The route tree is the only navigation registry; header, sidebar, footer, mobile sheet and sitemap read route `staticData`. | PACKAGE-2 target tree ll.78-96, §2B, §2C | Resolved: `staticData.nav` typed in `src/router.tsx`; 20 routes annotated; `src/lib/public/website-nav.ts` and `src/lib/operator/navigation.ts` deleted; consumers read `useRouter().routesByPath` and `useMatches()`; role config relocated verbatim to `src/lib/operator/roles.ts`. | Lane 1: `curl /sitemap.xml` shows one row per navigable route. | Met (2026-09-11) |
| 2 | Every destination has one human name across nav, breadcrumb, title, support copy and machine label. | Brand kit pp.2, 11-12, 15 | Resolved: one name per destination (Market / Operations / For agents / For providers / Help / Calls) applied across nav, titles, breadcrumbs, CTAs. | Lane 1: click every header, sidebar and mobile-sheet item once, no dead redirects. | Met (2026-09-11) |
| 3 | No duplicate primary actions with the same intent on one page. | DESIGN.md l.203 | Resolved: Publish header and drawer buttons removed; About doors CTA pair removed. | Lane 1: click every header, sidebar and mobile-sheet item once, no dead redirects. | Met (2026-09-11) |
| 4 | `/owner/offerings` is the single Operations landing; connections, payouts and identity are nested child routes, not parallel destinations. | PACKAGE-2 §2B.1-2B.4 | Resolved by deletion of `owner.settings.{connections,payouts,developers}.tsx` (see Transitions 2); connections and earnings render on the Operations landing. | Lane 1: `/owner/offerings/connections` (or the §2B path) renders a working section. | Met (2026-09-11) |
| 5 | **Feel:** discovery surfaces read as a hospitable marketplace. Tools are listings, Providers are hosts, trust is Qualified Use and provenance, imagery follows the brand pillars (human technology, nature, architecture). No tickers, time-window selectors, movers or sparklines on customer-facing surfaces. | Airbnb listing IA; brand kit pillars | Analytics retired: DirectoryMarketOverview, DirectoryAnalyticsCharts, DirectoryConcentration, DirectoryLeaderboard, AeToolTable, DirectoryToolTable deleted; `window` search param removed from / and /market and from ~20 link sites; cards are field-guide placards (name, Provider, one line, price per Call, one trust line); one Tool surface at /tools/$toolRef (DirectoryToolDetails dialog deleted). Open: concept E (agent's-eye view) and D (tell us the job) per docs/architecture/market-concepts.md; per-Tool Qualified Use count is not yet in ToolCardViewModel so the trust line uses the verified date. | Lane 4: real browser screenshots of `/`, `/market`, one Tool page and `/owner/offerings` reviewed against the brand kit and the feel invariant. | Partially met (2026-09-12) |

## Pathway

Each lane leaves a working app. Every subagent brief carries: reference followed, primitive reused, blast radius, real-use proof, ABSOLUTE RULES line. Source invariants 1 and 2 are constraints on every lane.

### Lane 1: IA. Route tree as registry, real routes, M2 settings (2-3 days)

- **Reference:** TanStack Router `staticData` route option with `StaticDataRouteOption` module augmentation (official typed pattern); PACKAGE-2 target nav tree and compatibility table §2B.5/2C.3; shadcn sidebar already in use.
- **Change:** declare `StaticDataRouteOption { nav?: { label; section: 'buy'|'supply'|'account'|'resources'; roles? } }` once, in `src/router.tsx`. Each navigable route file gains a `staticData.nav` entry. `AeAppShell.tsx`, `AeOperatorSidebar.tsx`, `AeOwnerMobileNavigation.tsx`, footer and the sitemap route read `router.routesByPath` and filter on `staticData.nav`. Delete `src/lib/public/website-nav.ts` and `src/lib/operator/navigation.ts`. No new registry file. Redirect routes: delete `engine.tsx`, `tools.tsx`, `help.tsx`, `contact.tsx` (router `defaultNotFoundComponent` already handles stale links; PACKAGE-2 keeps none of them as destinations). `owner.settings.{connections,payouts,developers}` become real nested child routes under the Operations landing per §2B, rendered through `<Outlet>`, with shadcn Tabs bound to `<Link>`. This is M2 "settings that act", including recovery and detail states for credit, agent-access and developer pages. Dedupe CTAs: header/drawer "Publish" vs "For Providers"; About page pairs.
- **Blast radius:** every chrome render, breadcrumbs, sitemap and llms.txt, deep links in support copy and emails.
- **Proof:** real browser (`run` skill): click every header, sidebar and mobile-sheet item once, no dead redirects; `curl /sitemap.xml` shows one row per navigable route; `/owner/offerings/connections` (or the §2B path) renders a working section.

### Lane 2: Transitions. Router-only navigation (1 day)

- **Reference:** TanStack Router `useNavigate()` in components and `throw redirect()` in `beforeLoad`; `scrollRestoration` and `defaultViewTransition` already set in `src/router.tsx`.
- **Change:** replace the four `window.location.assign` calls in `owner.supply.connections.new.tsx` with `navigate()`; the OAuth return path lands on the existing `owner.supply.connections.oauth.callback` route which redirects in `beforeLoad`. Delete the file-local `Shell()` in that route and render inside the app shell. Add nothing for focus or scroll.
- **Blast radius:** OAuth connect return flow, back/forward, scroll restoration.
- **Proof:** real browser: start an OAuth connect, press Back after return; SPA state survives and the Network tab shows no document reload.

### Lane 3: Behaviour. Registry-driven surfaces, catalogue copy, one vocabulary (3 days)

- **Reference:** the existing `listMcpActions()` pattern in `src/lib/server/mcp-api.ts`; the thin-route shape in `src/routes/api.v1.account.ts`; `src/content/brand-copy.ts` for copy; Locus inspect-to-invoke continuity.
- **Change:** CLI — `tools/ae/commands/manifest.ts` builds its command list by iterating the action registry filtered on `surfaces.includes('cli')`, exactly as MCP does. `ae quote` appears because the action already exists. Parsing stays on `node:util parseArgs`. HTTP — keep one file per route (framework convention). Rewrite the hand-implemented `api.v1.*.ts` files (starting with `api.v1.market-tools.search.ts`) to the thin shape: import the action, call `.run()`, return its response. No dispatcher, no generator. Copy — add `src/content/reason-copy.ts` beside `brand-copy.ts` mapping each reason code to one sentence; the two leak sites read it. Replace service/job with Tool in `AeSupplyLanding.tsx` and `for-providers.tsx`. Quote continuity — invoke accepts the inspected `quoteRef` and fails closed when the quote has expired or differs, using existing quote and call refs; no new state.
- **Blast radius:** CLI, MCP clients, HTTP consumers. Highest regression risk; runs after Lanes 1-2.
- **Proof:** `npm run ae -- quote <toolRef>` succeeds; the same Tool inspected via MCP and via `curl /api/v1/...` returns identically shaped results; a refusal shows a sentence, not a slug.

### Lane 4: Design and Feel. Brand kit as contract, Airbnb not trading desk (1 day + audit)

- **Reference:** brand kit PDF pp.7, 9-10, 15 (Forest, Charcoal, Chalk, Stone; Gold logo-only; Manrope 200/400/500; chalk or charcoal primary actions; quiet solid backgrounds; reduced motion). Airbnb listing IA: search, listing, host, book, trip.
- **Change:** amend DESIGN.md ll.101-106 to the brand kit palette and roles; confirm `globals.css` tokens match and Gold is not used as a UI accent. Then a haiku audit of `/market`, Tool detail and `/for-providers` for trading-desk idioms (window selector, movers, sparklines, dense numeric tables, red/green deltas), producing a one-page mapping of each surface to its Airbnb analogue using shadcn components already installed. No UI edit until that mapping is approved.
- **Blast radius:** DESIGN.md consumers; market page layout.
- **Proof:** real browser screenshots of `/`, `/market`, one Tool page and `/owner/offerings` reviewed against the brand kit and the feel invariant.

### Lane 5: Market front door (2026-09-12)

- **Reference:** `docs/architecture/market-design-direction.md`, `docs/architecture/market-concepts.md`, `docs/architecture/pain-path.md`.
- **Decisions taken 2026-09-12:** retire analytics outright, not soften them; anonymity floor k=5, demand signal stays private, never surfaced per-Tool; owner leaning to concept E (agent's-eye view) first, but the pain-path doc argues fix the catalogue first.
- **Proof:** real browser on `/market` and a Tool page; `ae search`/`ae describe` against production once `/api/ready` is 200.

## Closeout notes

PACKAGE-5 closure item 8 (no-handroll repository scan): recorded 2026-09-11, clean; see Source 2.

Hosted cutover 2026-09-12: Convex prod deployed and configured from 5b8a423cf; Vercel production env rebuilt and redeployed; /status, /market, /llms.txt 200 on https://app.aecon.ai; /api/ready pending four external provisioning items (Stripe restricted key, Clerk webhook secret, Infisical projects, Formance on AWS). Log: docs/operations/hosted-cutover-2026-09-12.md.

### Proof run 2026-09-11

- **Stack:** local stack on `127.0.0.1:3024` with Clerk bypass.
- **Browser:** `/` → `/market?window=30d`; header shows Market, For agents, For providers, Calls, Sign in, no Publish (desktop and 390px drawer); all header and footer links return 200; deleted paths render the not-found view; owner sidebar shows Buy: Calls, Agents, Credit; Supply: Operations; Account: Account & security; Resources: Market, For agents, Help; `/owner/offerings` h1 is Operations; 0 console errors on every page.
- **CLI:** `ae quote` against a real listed Tool returned refusal `tool_unsupported` with a sentence.
- **MCP:** `/mcp` authenticated `tools/list` includes `ae_tool_quote`.
- **HTTP:** `POST /api/v1/tools/quote` returned the identical refusal shape.
- **Not exercised:** the OAuth Back-button flow (needs a real provider); the `sandbox-aecon-reference` fixture (not seeded locally, see Smells).

## Smells

- `devSeed:publishSandboxTool` refuses on local dev because it requires an https source URL while `AE_SITE_URL` is `http://127.0.0.1:3024`, so the sandbox fixture cannot be seeded locally.
- `/owner/supply/*` routes carry no `staticData.nav` and are not tree children of `/owner/offerings`; breadcrumb and active state rely on the relocated `ownerWorkspaceOwnerForPath` special case in `src/lib/operator/roles.ts`.
- `/market` still defaults `?window=30d` from `src/routes/index.tsx` and `src/routes/market.tsx`; pending feel decision 1.
- Customer-facing analytics (`DirectoryMarketOverview.tsx`, `DirectoryLeaderboard.tsx`, `DirectoryConcentration.tsx`, `AeToolTable.tsx`) are trading-desk idioms; pending feel decisions 2-4.
- Two Tool detail surfaces exist (`DirectoryToolDetails.tsx` dialog and `/tools/$toolRef`); pending feel decision 5.
- Footer links to componentless file routes (`/llms.txt`, `/SKILL.md`, `/.well-known/ucp`) use `<Link reloadDocument>`; correct but worth knowing.
- The operator utility rail now shows the shared destination label (Market, For agents, Help) rather than the old Catalog/Agent setup/Help; this is the one-name invariant working, recorded so nobody "fixes" it back.
- aecon.ai (marketing project) serves the app's readiness route with no environment and always reports 503; probes must target app.aecon.ai.
- Production catalogue was empty for the whole of Wells 0-7 because the Convex prod deployment had never been deployed; discovered only by curl.

## Out of scope

- New test suites, verify scripts, receipts, markers or gates.
- New registries, dispatchers, generators or navigation effects.
- Reorganising `convex/` capability files for tidiness alone.
- The signals proposal, until Lane 4's audit decides whether it belongs on operator surfaces only.
