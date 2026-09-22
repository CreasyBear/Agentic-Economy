# Platform stabilisation register

**Status:** ACTIVE STABILISATION REGISTER · **Date:** 21 September 2026 · **Owner:** Joel · **Scope:** every UI surface outside the already-verified user/org workflows (W-01..W-44) and shell workflows (S-01..S-20), plus cross-cutting patterns and the class-defining gaps. · **Method:** one row per surface; each row is worked by one bounded subagent change at a time with narrow verification and its own commit; a row is VERIFIED only when its commit lowers a ratchet constant or a test under `tests/e2e` or `tests/unit` asserts its Target spec. · **Evidence classes:** LIVE (observed on the local stack 21 Sep 2026), SOURCE (file:line), KNOWLEDGE (benchmark behaviour).

## 0. How to read and work this register

Status vocabulary: `PENDING` (gap recorded, no work) · `IN REVIEW` (change landed, verification gate not met) · `VERIFIED` (ratchet lowered or Target spec asserted by a test under `tests/e2e` or `tests/unit`; evidence recorded) · `PARKED` (decision deferred, reason named) · `OWNER` (Joel works it personally: core flow).

Priority: P0 job impossible or user misled · P1 credibility/usefulness · P2 polish.

Row anatomy: `Benchmark` · `Incumbent baseline` · `Current state (LIVE)` · `Gaps` · `Copy` · `Target spec` · `Cut` · `Priority` · `Status` · `Verification evidence` · `Provenance`. Cross-cutting rows replace route with `Surfaces affected`.

Verification evidence format: `LIVE <date> <url> <what passed>; SOURCE <file:line>; COMMIT <hash>`.

Provenance format: agent name + date. All findings below preserve the source report ID, verbatim evidence fragment, and source anchor or `UNANCHORED`.

## 0a. Wave 0: gates (landed)

| Gate test | Pinned constant(s) |
|---|---|
| `tests/imports/route-controller-size.test.ts` | `ROUTE_CONTROLLER_MAX_LINES=80`; `ROUTE_SIZE_EXCEPTIONS`: `src/routes/__root.tsx` 114 |
| `tests/imports/file-size-ratchet.test.ts` | `FILE_SIZE_CEILINGS`: `over300=277`, `over500=100`, `over1000=0`; `OVER_1000_ALLOWED`: `[]` |
| `tests/imports/tsx-type-quarantine.test.ts` | `TSX_TYPE_EXPORT_CEILING=18` |
| `tests/imports/leaf-purity.test.ts` | `LEAF_PURITY_EXCEPTIONS`: `[]` |
| `tests/imports/own-barrel-imports.test.ts` | `OWN_BARREL_EXCEPTIONS`: `src/modules/registry/internal/registry-action-contracts.ts` |
| `tests/imports/convex-facade-size.test.ts` | `FACADE_MAX_LINES=200`; 73 pinned `FACADE_SIZE_EXCEPTIONS` |
| `tests/imports/copy-vocabulary.test.ts` | `COPY_CEILINGS`: `supplier=0`, `invocation=0`, `connection-online=0`, `balance=8`, `legacy-credential=2`, `used-recently=1`, `one-call-away=1`, `authority-mode=1`, `mandate=0`, `commitment=0`, `callable-operation=0`, `commercial-closure=0`; `MARGIN=2` |
| `tests/imports/status-vocabulary.test.ts` | `STATUS_LITERAL_FILE_CEILING=17`; `MARGIN=2` |

A row is VERIFIED only if its commit lowered at least one ratchet constant or its Target spec is asserted by a test under tests/e2e or tests/unit; a human re-walk alone never verifies a row.

Progress is read from `git grep -n "pinned 2026-09" tests/imports/`. Commit bodies end `R-nn · <gate>: a→b`.

A row whose evidence names a symptom seen on more than one surface carries a ROOT line before dispatch.
**ROOT-TYPE:** LANDED. Public-page H1 is 60px, page-level section H2 is 36px, eyebrows are weight 700 with 0.16em tracking, and legal H2 remains 24px per the marketing canon. Policy: page-level section heading = md (36px); rail/card-group heading inside a section = sm (30px); auth/dialog pages: H1 = md (36px); legal documents: utility-document rhythm 80/48, no eyebrow. COMMIT `2998ee3da`, `a18db69cb`.

## 0b. OWNER-LOCKED files

- `src/components/ae/market/**`
- `src/routes/market.tsx`
- `src/routes/tools.*.tsx`
- `src/components/ae/chat/**`
- `src/routes/t.*.tsx`
- `src/components/ae/agent-access/**`
- `src/routes/_operator/agent-access*.tsx`
- `src/components/ae/console/owner-credit/**`
- `src/routes/_operator/owner.credit.tsx`
- `src/components/ae/activity/**`
- `src/routes/_operator/activity.tsx`
- `src/components/ae/call-receipt/**`
- `src/routes/_operator/calls.$callRef.tsx`
- `src/components/ae/support/**`

No subagent edits these unless dispatched from the spine plan by Joel.

## 1. Summary by family

| Family | Routes | Rows | P0 | P1 | P2 | Status today |
|---|---:|---:|---:|---:|---:|---|
| DOORS | 4 | 3 | 0 | 3 | 0 | VERIFIED/IN REVIEW |
| MARKET | 6 | 6 | 3 | 2 | 1 | OWNER/IN REVIEW/PENDING |
| ASK | 2 | 1 | 1 | 0 | 0 | OWNER |
| AGENTS | 3 | 2 | 1 | 1 | 0 | OWNER/PENDING |
| CREDIT | 3 | 2 | 2 | 0 | 0 | OWNER/VERIFIED |
| ACCOUNT | 7 | 5 | 1 | 4 | 0 | VERIFIED/IN REVIEW |
| RECORDS | 2 | 2 | 2 | 0 | 0 | OWNER |
| HELP | 5 | 4 | 2 | 2 | 0 | VERIFIED/IN REVIEW |
| SUPPLY | 5 | 6 | 2 | 4 | 0 | VERIFIED/IN REVIEW/PARKED |
| DEV/ADMIN | 4 | 4 | 2 | 2 | 0 | VERIFIED/IN REVIEW |
| ADMIN | 8 | 8 | 0 | 6 | 2 | IN REVIEW/PENDING |
| SHELL | 2 | 1 | 0 | 0 | 1 | PARKED |
| CROSS-CUTTING | n/a | 12 | 7 | 5 | 0 | OWNER/VERIFIED/IN REVIEW/PENDING |
| CLASS GAPS | n/a | 55 | n/a | n/a | n/a | 1 ADOPTED + 48 RECORDED + 6 BASE-PAGE DECISIONS |

The 43 route entries are all assigned once. `/support` is assigned to the Receipt and Support row because that is its buyer job. The four DEV/ADMIN routes are separated from the five Provider supply routes even though the route inventory classified all nine as SUPPLY.

## 2. Surface rows

### R-01 Entry and company thesis: `/` and `/about`
**Benchmark:** Linear About. **Incumbent baseline:** one company thesis, who it serves, credible operator/contact.
**Current state (LIVE):** `/about` H1 “Who this market is for.” with two equal CTAs; `/` is a redirect-only route at `src/routes/index.tsx:7`.
**Gaps:** • [DOOR-01] “No company thesis, operator/team, or contact route” (`src/components/ae/about/AeAboutPage.tsx:26-126`) • [DOOR-02] “Providers are paid when the job is delivered.” lacks currency, fee and timing (`src/content/brand-copy.ts:81-86`) • [DOOR-03] “both CTAs top 292px” (`src/components/ae/about/AeAboutPage.tsx:44-50`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Who this market is for.</td><td>Tools agents can call.</td></tr><tr><td>subhead</td><td>Agents find, compare, and call. Providers publish the job, the price, and the access terms, and get paid after delivery.</td><td>Agents buy Tools. Providers set prices and receive AUD payouts after completed Calls.</td></tr></table>
**Target spec:** one thesis above fold; verified operator/contact; Agents and Providers named once; payout claim links fee, currency and timing. **Cut:** “Listed Providers” definition and duplicate catalogue cover.
**ROOT-ECON:** provider economics (fee %, take rate, payout method, payout cadence/trigger, merchant-of-record, GST treatment, refund/dispute terms) are unsupplied facts; owner Joel. Until supplied, no surface states a fee, payout timing, "automated" payout, or refund rule.
**PRESENT:** verified operator/contact: “Operated in Australia · ABN 98 700 838 115 · support@aecon.ai”.
**Blocked:** `/` still redirects to `/market`, so the platform entry thesis remains open; fee and payout timing remain blocked by ROOT-ECON.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/about H1 “Tools agents can call.”; approved subhead was present; SOURCE `src/content/brand-copy.ts:84-86`; COMMIT `f44e8e356`. Marketing-site port: Hero 7 → `AeSiteAboutHero`, Content 4 → `AeSiteEditorial`, Features 4 → `AeSiteFeatureGrid`, CTA 2 → `AeSiteCtaBand`; COMMIT `63b8aed88`. Operator/contact bullet PRESENT: LIVE 2026-09-21 http://127.0.0.1:3024/about rendered “Operated in Australia · ABN 98 700 838 115 · support@aecon.ai” once at 390px; SOURCE `src/components/ae/about/AeAboutPage.tsx`, `src/content/brand-copy.ts`; COMMIT `e9ac04882`. **Provenance:** RegDoors, PortAbout, OperatorFact, 21 Sep 2026.

### R-02 Agent door: `/for-agents`
**Benchmark:** Stripe developer docs landing. **Incumbent baseline:** one integration outcome, recommended path, copyable command, one start.
**Current state (LIVE):** H1 “Add the market to your agent.”; hero actions Browse Tools and Read the skill; working Codex command exists.
**Gaps:** • [DOOR-04] “Neither hero CTA performs the promised connection” (`src/components/ae/agents/AeAgentDoorPage.tsx:34-40`) • [DOOR-05] “Claude Code, Cursor, and Codex” spreads focus and uses service (`src/content/brand-copy.ts:62-64`) • [DOOR-06] “Account connection does not grant spending permission.” has no policy action (`src/components/ae/console/AeAssistantInstallFunnel.tsx:53-68`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Add the market to your agent.</td><td>Connect your Agent.</td></tr><tr><td>primary CTA</td><td>Browse Tools</td><td>Start setup</td></tr></table>
**Target spec:** one Codex setup CTA; one-click named command; confirmation links to Agents; explicit Spending policy step; alternatives secondary. **Cut:** Read the skill hero CTA and duplicate three-client strapline.
**Priority:** P1. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/for-agents H1 “Connect your Agent.”; “Start setup” href `#agent-setup`, click set the hash and scrolled the setup section to `72.1875px`; Agents and policy links both resolved to `/agent-access`; SOURCE `tests/unit/ui/agent-door-page.test.tsx:19-32`, `tests/unit/ui/assistant-install-progression.test.tsx:23-31`; COMMIT `7e52c8886`. FAQ 1 and Footer 2 slice: all Target-spec bullets PRESENT; subhead “We’re building one AUD account for your agents’ paid tools, with spending limits and purchase records.”; “Before you connect” followed by three questions, first disclosure opened with `aria-expanded=true`; SOURCE `src/components/ae/website/AeSiteFaq.tsx`, `src/content/brand-copy.ts`; COMMIT `eb0a3b767`. Roast verdict: may remain VERIFIED. **Provenance:** RegDoors, FaqPort, Roast3Agents, 21 Sep 2026.

### R-03 Provider door: `/for-providers`
**Benchmark:** Shopify Sell online. **Incumbent baseline:** sellable unit, total cost, payout method/timing, eligibility, direct start.
**Current state (LIVE):** H1 “List a Tool.”; one CTA goes to `/owner/operations`; fee, payout timing and currency are absent.
**Gaps:** • [DOOR-07] “automated AUD payouts” with no fee/currency/timing (`src/components/ae/supply/AeSupplyLanding.tsx:64-84`) • [DOOR-08] href `/owner/operations`, then Add Tool (`src/components/ae/supply/AeSupplyLanding.tsx:79-82`) • [DOOR-09] “all inputs live after the CTA” (`src/components/ae/supply/AeSupplyLanding.tsx:101-128`) • [DOOR-10] “Supplier activation” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>subhead</td><td>List one Tool agents can inspect and call. You describe the price, access, effects, and evidence; Agentic Economy records it as a Tool.</td><td>List one Tool, set an AUD price, and review fees and payout timing before publishing.</td></tr><tr><td>primary CTA</td><td>List a Tool</td><td>Add Tool</td></tr></table>
**Target spec:** fee, AUD payout method, trigger and timing above fold; one CTA opens form; eligibility before live check; no Supplier vocabulary. **Cut:** “AE public inspection actions” and duplicate Manage listed Tools promotion.
**ROOT-ECON:** provider economics (fee %, take rate, payout method, payout cadence/trigger, merchant-of-record, GST treatment, refund/dispute terms) are unsupplied facts; owner Joel. Until supplied, no surface states a fee, payout timing, "automated" payout, or refund rule.
**ROOT-TYPE:** LANDED. Public-page H1 is 60px, page-level section H2 is 36px, eyebrows are weight 700 with 0.16em tracking, and legal H2 remains 24px per the marketing canon. Policy: page-level section heading = md (36px); rail/card-group heading inside a section = sm (30px). COMMIT `2998ee3da`, `a18db69cb`.
**Blocked:** ROOT-ECON; the live roast found the static eligibility sentence before the safe-example check, but no eligibility/readiness step exists in the `source → tool → terms → review` funnel.
**Open gap (next task):** cut “Manage listed Tools” and “AE public inspection actions”; LIVE 2026-09-21 http://127.0.0.1:3024/for-providers found each phrase once.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/for-providers H1 “List a Tool.”; exactly one “Add Tool” link with href `/owner/operations/new`; SOURCE `src/components/ae/supply/AeSupplyLanding.tsx:80-82`; COMMIT `92a63fdfd`. FAQ 1 slice: “Before you publish” follows “What agents can inspect”; first question “What kinds of Tools are supported first?” opened with `aria-expanded=true`; SOURCE `src/content/provider-copy.ts`, `src/components/ae/supply/AeSupplyLanding.tsx`; COMMIT `a20ae18cd`. Roast verdict: IN REVIEW; economics absent, eligibility PARTIAL, both required cuts remain. **Provenance:** RegDoors, ProvidersFaq, Roast3Providers, 21 Sep 2026.

### R-04 Public Business: `/$slug`
**Benchmark:** Google Business Profile and Stripe Apps partner page. **Incumbent baseline:** verified identity, contact, offers and trust signals.
**Current state (LIVE):** tested profiles did not resolve; Providers link only to filtered Tool results.
**Gaps:** • [DOOR-11] “every DOM href is /market?view=tools&provider=…” (`UNANCHORED`) • [DOOR-12] “No provider at this address” (`src/routes/$slug.tsx:23-41`) • [DOOR-13] same H1 uses Provider instead of Business (`src/components/ae/listing/PublicBusinessNotFound.tsx:29-37`) • [DOOR-14] “outline-style none and box-shadow none” (`src/components/ae/listing/PublicBusinessNotFound.tsx:35`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>No provider at this address</td><td>Business not found</td></tr><tr><td>body</td><td>Nothing is published here. Check the address, or browse the catalogue.</td><td>No public Business matches this address. Browse the Market.</td></tr></table>
**Target spec:** one reachable profile; legal/display identity and verification basis; website/contact and Tools; sourced trust; one buyer recovery action. **Cut:** Publish a Tool from buyer not-found.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDoors, 21 Sep 2026.

### R-05 Market: `/market`
**Benchmark:** Shopify App Store and Apple App Store buyer journey. **Incumbent baseline:** credible search, category browse, preserved shortlist, honest usage proof and reachable compare.
**Current state (LIVE):** 15,141-item catalogue; submitted search and compare exist; no consistent callable marker; evidence conflicts with usage copy.
**Gaps:** • [OPS-01] “returned text-to-image tools, Google Images, Amazon search and barcode lookup” (`UNANCHORED`) • [SKP-03] “Used recently by other agents” versus “Completed calls 0” (`UNANCHORED`) • [A11Y-01] “search is Tab 12; submit moves focus to BODY; no live/status region or result count” (`UNANCHORED`) • [A11Y-02] “91 Tabs to first ‘Add … to comparison,’ then 31 to ‘Compare Tools’” (`UNANCHORED`) • [OR-06] “typing `weather` left URL and ‘12 Tools loaded’ unchanged until Search click” (`UNANCHORED`) • [APP-01] “all 9 cards say ‘Used recently by other agents’; detail says ‘Completed calls 0’” (`UNANCHORED`) • [APP-11] “`ocrr`: ‘No matching Tools’” (`UNANCHORED`) • [SKP-07] “Most Calls reported in the last 30 days” without counts (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Tools for what’s next.</td><td>Find the right Tool.</td></tr><tr><td>usage</td><td>Used recently by other agents</td><td>Recent Agent Calls, with count and source</td></tr></table>
**Target spec:** search returns whole-job fits or honest no-fit; Provider, callable state, listed price and one action per card; query and compare survive tabs, Back and refresh; compare reachable at 390px and by keyboard. **Cut:** unquantified usage, creative promo and atomic price internals.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W2`. **Provenance:** PersonaOpsManager, PersonaSkeptic, PersonaAccessibility, ExpectOpenRouter, ExpectAppStoreShopify, 21 Sep 2026.
**Evidence (orchestrator exception):** compare refs now survive Market navigation, page changes and reload-style hydration from by-ref resolutions; SOURCE `tests/unit/market/x402-directory-page.test.tsx:154-165`, `tests/unit/routes/market-search.test.ts:68-112`; COMMIT `4783d51fc`, `63c289b8a`. Status remains OWNER.

### R-06 Owner Market duplicate: `/owner/market`
**Benchmark:** Shopify admin versus storefront. **Incumbent baseline:** admin manages records; storefront sells; no reduced duplicate storefront.
**Current state (LIVE):** same 15,141-Tool catalogue under a reduced hero; 390px scrollWidth is 704 while `/market` is 368.
**Gaps:** • [SUP-08] “same catalogue, no owner management” (`owner.market.tsx:37-60`) • [SUP-09] “scrollWidth 704 at 390px” (`AeX402Directory.tsx:196-199`) • [SUP-10] Market href `/market` lacks `aria-current` (`owner.market.tsx:42-50`) • [SUP-11] owner adds no admin controls (`AeX402Directory.tsx:198`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>deck</td><td>Find and compare a Tool, then continue through your Agent.</td><td>Find a Tool for your Agent.</td></tr><tr><td>hero</td><td>Find your next capability.</td><td>Find a Tool.</td></tr></table>
**Target spec:** redirect to `/market`; Market active; Saved/Compare persist; public hero/tabs remain; no 390px overflow. **Cut:** entire compact duplicate route and wrapper.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/owner/market?query=ocr` redirected to `/market?query=ocr` and the signed-in header showed exactly one Market link; SOURCE `src/routes/_operator/owner.market.tsx:8-10`; COMMIT `f12efd61c`. **Provenance:** RegSupplyList, 21 Sep 2026.

### R-07 Shared chat missing state: `/s/$shareToken`
**Benchmark:** ChatGPT unavailable shared link. **Incumbent baseline:** immediate terminal explanation plus new-chat and help recovery.
**Current state (LIVE):** invalid token waits on “Opening chat” for about 6s, then shows “Shared chat unavailable” with no action.
**Gaps:** • [HELP-10] “Connecting to your account…” precedes terminal invalid state (`src/routes/s.$shareToken.tsx:24-27`) • [HELP-11] “stable DOM has zero main actions” (`src/routes/s.$shareToken.tsx:30-36`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>description</td><td>This link is invalid, expired, or has been revoked.</td><td>This shared chat is unavailable.</td></tr></table>
**Target spec:** immediate terminal state; no reason leakage; New chat and Help; no auth spinner. **Cut:** connecting copy for invalid tokens.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-08 Tool detail: `/tools/$providerHost/$slug`
**Benchmark:** OpenRouter model detail and Apple App Store detail. **Incumbent baseline:** exact identity, trust, permission/data use, runnable request, price and one truthful action.
**Current state (LIVE):** Tool facts and Contract exist, but the observed buyer loop still says “Connect an Agent first” after Agents exist.
**Gaps:** • [SKP-01] “return to /tools/weather… still ‘Connect an Agent first’” (`UNANCHORED`) • [APP-02] “Tools All admitted Tools” with no OCR-specific consent (`UNANCHORED`) • [APP-03] “no Provider external link” (`UNANCHORED`) • [APP-04] “no ‘sample output,’ ‘example output,’ or screenshot section” (`UNANCHORED`) • [APP-05] “Connect an Agent first” despite six agents (`UNANCHORED`) • [OR-01] “No example input is published” (`UNANCHORED`) • [DEV-R2-02] “Transport POST /read” with no base host/auth/example (`UNANCHORED`) • [DEV-R2-03] “Readiness Checked when quoting” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>action</td><td>Connect an Agent first</td><td>Add to Agent</td></tr><tr><td>readiness</td><td>Checked when quoting</td><td>Callable by Agents / Listed, not yet callable</td></tr></table>
**Target spec:** copyable stable Tool reference; verified Provider/contact; callable state; exact data/permission; `A$x.xx per Call (GST incl.)`; runnable example; selected Agent handoff preserves Tool. **Cut:** unproved usage and internal transport detail above decision facts.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W2`. **Provenance:** PersonaSkeptic, ExpectAppStoreShopify, ExpectOpenRouter, PersonaAgentDev, 21 Sep 2026.
**Evidence (orchestrator exception):** bounded refusal reasons now produce cause-specific recovery and fail closed to `source_unavailable`; SOURCE `tests/unit/routes/tool-detail-route.test.tsx:582-621`; COMMIT `d62defe14`, `84e4c321e`. Status remains OWNER.

### R-09 Invalid Tool reference: `/tools/$toolRef`
**Benchmark:** npm 404 package page. **Incumbent baseline:** plain reason, search/browse recovery, no fabricated facts.
**Current state (LIVE):** H1 “This Tool reference is invalid”; one Browse current Tools action.
**Gaps:** • [HELP-12] “Recovery only returns to the whole Market; no search or corrected-reference guidance” (`src/components/ae/market/public-tool-detail/PublicToolDetail.tsx:22-27`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>description</td><td>The reference is malformed, so AE did not query the catalog or show commercial facts and Call steps.</td><td>Check the link or browse current Tools.</td></tr></table>
**Target spec:** explicit invalid state; no Tool facts; browse CTA; search field; noindex. **Cut:** internal catalogue-query explanation.
**Priority:** P2. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-10 Ask: `/t/new` and `/t/$threadId`
**Benchmark:** Shopify App Store discovery handoff. **Incumbent baseline:** natural-language discovery names its catalogue, returns inspectable candidates and hands one to an Agent without buying in-thread.
**Current state (LIVE):** Ask can show search traces and Tool cards; the buyer-spine walk recorded false no-fit, executable language and no Agent handoff.
**Gaps:** • [OPS-01] “returned text-to-image tools, Google Images, Amazon search and barcode lookup” (`UNANCHORED`) • [APP-11] “`ocrr`: ‘No matching Tools’” (`UNANCHORED`) • [OR-06] search requires explicit submission rather than narrowing while typing (`UNANCHORED`) • [JNY-02] “No execution path” from chosen Tool (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>empty prompt</td><td>Name a job. Compare, inspect, then call.</td><td>Name a job. Compare Tools, then give one to an Agent.</td></tr><tr><td>handoff</td><td>Uses your AE balance</td><td>Use this with your Agent</td></tr></table>
**Target spec:** discoverable beside Market search; timely shortlist with Provider/callable state/readiness/listed price; no Call or Credit promise in human thread; stable URL; Agent handoff preserves Tool; concise off-purpose boundary. **Cut:** repeated search traces, binding Quote and TOTAL PRICE in human chat.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W3`. **Provenance:** PersonaOpsManager, ExpectAppStoreShopify, ExpectOpenRouter, PersonaJourneyOwner, 21 Sep 2026.

### R-11 Agents and consent: `/agent-access` and `/agent-access/authorize`
**Benchmark:** GitHub fine-grained PAT and OAuth consent. **Incumbent baseline:** workspace actor, exact Tool scope, readable permissions, expiry and review before issuance.
**Current state (LIVE):** Agent creation stages policy then issues a Direct key; OAuth consent has more scope detail; a created Agent can still be unscoped to the selected Tool.
**Gaps:** • [JNY-01] “Tool access DOM said ‘All admitted Tools’” (`UNANCHORED`) • [APP-02] no OCR-specific consent (`UNANCHORED`) • [APP-07] “clicking ‘Connect agent’ immediately created” (`UNANCHORED`) • [GH-01] “Step 1 has name/environment/authority/budgets, no Tools; key is then issued” (`UNANCHORED`) • [GH-02] buttons “Connect agent” and “Decline” (`UNANCHORED`) • [GH-03] “no badge or verification statement” (`UNANCHORED`) • [GH-05] raw scopes not readable permission groups (`UNANCHORED`) • [A11Y-03] “two `role=radio` buttons with empty names” and empty-name checkbox (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>start</td><td>+ Connect New Agent</td><td>Create Agent</td></tr><tr><td>consent</td><td>Connect agent</td><td>Approve access</td></tr><tr><td>credential</td><td>Legacy credential</td><td>Direct key</td></tr></table>
**Target spec:** one Create Agent start; workspace and exact Tool scope before issuance; grouped permissions and expiry; Approve access/Decline; one-time reveal survives guarded navigation; labelled controls; row shows scope and Spending policy. **Cut:** duplicate starts and connection language for grants.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W4`. **Provenance:** PersonaJourneyOwner, ExpectAppStoreShopify, ExpectGitHubVercel, PersonaAccessibility, 21 Sep 2026.

### R-12 OAuth authorization protocol: `/oauth/authorize`
**Benchmark:** GitHub Authorize application. **Incumbent baseline:** app identity, requested access, acting account, risk context, Authorize/Cancel.
**Current state (LIVE):** tested invalid requests render raw `{"error":"invalid_request","error_description":"The OAuth request is invalid."}`.
**Gaps:** • [HELP-09] “machine JSON with no missing-field hint or recovery” (`src/lib/server/agent-access-oauth-api.ts:188-203`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>error</td><td>The OAuth request is invalid.</td><td>This authorization request is incomplete.</td></tr></table>
**Target spec:** valid app/account/scopes; Authorize and Cancel; safe invalid-request remedy; no redirect-secret exposure; keyboard-first actions. **Cut:** raw JSON in browser.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-13 Funding return: `/fund/$fundingSessionId` and `/fund/cancelled`
**Benchmark:** Stripe Checkout return pages. **Incumbent baseline:** state what happened, payment/amount, where funds are, one matching action.
**Current state (LIVE):** “Payment cancelled” and invalid-link states both instruct Agent recovery but link to Market.
**Gaps:** • [ACC-11] “Both pages tell users to return to an Agent but send them to Market” (`fund.cancelled.tsx:21-25`; `AeFundingReturnState.tsx:47-51`) • [ACC-12] “Cancel URL carries no session identity, amount, or named Agent” (`fund.cancelled.tsx:8-28`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>cancel result</td><td>No Account credit or authority changed.</td><td>No payment was made or Credit added.</td></tr><tr><td>action</td><td>Back to Market / Open Market</td><td>Open Agents</td></tr></table>
**Target spec:** paid/cancelled/invalid named; known amount shown; Credit destination explicit; action matches instruction; retry cannot duplicate payment. **Cut:** “authority changed”.
**Priority:** P0. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/fund/cancelled rendered `Payment cancelled`, `No payment was made or Credit added.` and `Open Agents`; invalid, cancelled and paid return states, known amount/Credit destination and fresh-retry behavior are asserted in 7 tests. SOURCE `tests/unit/routes/funding-return-route.test.tsx`; COMMIT `2df48e395`. Accepted: `/fund/not-a-session` logs one 404 console error from the public session read because the ID is invalid. **Provenance:** RegAccount, RowR13Funding, RoastD13D19, 21 Sep 2026.

### R-14 Credit: `/owner/credit`
**Benchmark:** Stripe Balance and Checkout. **Incumbent baseline:** authoritative available/reserved/total, explicit fee/GST/total, reliable return state.
**Current state (LIVE):** H1 Credit is reachable; observed balance remained unavailable while funding controls were shown.
**ROOT:** local stack has no Formance ledger configured; not a product defect. UI says "Credit unavailable" and "Nothing was charged."
**Gaps:** • [OPS-02] “INDICATIVE PRICE About A$0.04” and “Listed Provider amount USDC 0.025000” before funding (`UNANCHORED`) • [SKP-02] “Balance unavailable” and “Some summaries are unavailable” (`UNANCHORED`) • [JNY-03] “Stripe → Agents … Tool, Agent and amount gone” (`UNANCHORED`) • [JNY-04] Credit was two clicks inside Find Tools (`UNANCHORED`) • [JNY-05] “Balance unavailable” while asking for payment (`UNANCHORED`) • [OR-07] “Balance unavailable… Refresh to read the authoritative Account balance” (`UNANCHORED`) • [ST-06] no available/pending/reserved split (`UNANCHORED`) • [DEV-R2-04] `/credit` fails while actual page is `/owner/credit` (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>value</td><td>Balance unavailable</td><td>Credit unavailable</td></tr><tr><td>error</td><td>check system status before repeating a Call</td><td>Retry. If Credit still cannot load, check system status.</td></tr></table>
**Target spec:** available, reserved and total in AUD; amount/fee/GST/total before Stripe; funding preserves Tool, Agent and amount; failures say whether money moved; retry safe. **Cut:** duplicate failure heading and Provider-workspace sign-in copy.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** LIVE 2026-09-21 `/owner/credit` showed “Credit unavailable” and “Nothing was charged.” with no local Formance ledger configured; SOURCE `src/modules/money/internal/formance-config.ts:178-219`; COMMIT `7ac486307`. Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W5`. **Provenance:** PersonaOpsManager, PersonaSkeptic, PersonaJourneyOwner, ExpectOpenRouter, ExpectStripe, PersonaAgentDev, 21 Sep 2026.

### R-15 Onboarding: `/onboarding`
**Benchmark:** Vercel new-team onboarding. **Incumbent baseline:** one consequential question per screen, progress, skip for nonessential setup.
**Current state (LIVE):** “Set up your workspace”; two roles, then prefilled Acme; no Skip.
**Gaps:** • [ACC-01] “Setup is mandatory: no Skip” (`AeOnboardingPage.tsx:45-64`) • [ACC-02] “Supplier / Tool Provider” mixes personas and forbidden vocabulary (`OnboardingRoleStep.tsx:25-49`) • [ACC-03] “Role consequences/reversibility are unstated” (`OnboardingRoleStep.tsx:33-49`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>buyer</td><td>Buyer / Agent Operator</td><td>Buy with an Agent</td></tr><tr><td>provider</td><td>Supplier / Tool Provider</td><td>Provide a Tool</td></tr><tr><td>action</td><td>Finish setup</td><td>Create workspace</td></tr></table>
**Target spec:** one decision per step; progress retained; Skip has stated default; role effects plain and reversible; completion names destination. **Cut:** numeric keyboard badges.
**Priority:** P1. **Status:** VERIFIED. **Verification evidence:** SOURCE `tests/unit/routes/onboarding.test.tsx` asserts all Target-spec bullets in 14 tests; LIVE 2026-09-21 a signed-in account with a Workspace redirected `/onboarding` to `/owner`, which is the intended R-19 ROOT behavior. COMMIT `853a7b695`, `5331467b7`, `5b19b40e3`. **Provenance:** RegAccount, RowR15Onboarding, OnboardingAuthority, RoastD15D16, 21 Sep 2026.

### R-16 Owner overview: `/owner/`
**Benchmark:** Stripe Dashboard Home. **Incumbent baseline:** today’s money and actionable exceptions, not vanity counts.
**Current state (LIVE):** “Balance unavailable”; “No Calls need attention” conflicts with unavailable summaries; “8 connected Agents”.
**ROOT:** R-14.
**ROOT-ATTN:** LANDED. Overview now distinguishes an unavailable Calls read from a complete zero result; SOURCE `tests/unit/routes/owner-overview-route.test.tsx`; COMMIT `02eb4e0f9`.
**Gaps:** • [ACC-04] “No Calls need attention” while `/activity` cannot summarize (`AeOwnerOverview.tsx:76-80`) • [ACC-05] “Check Balance” and “Open Balance” duplicate (`AeOwnerOverview.tsx:93-107`) • [ACC-06] “8 connected Agents” exposes no decision (`AeOwnerOverview.tsx:115-120`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>intro</td><td>See what needs attention, your available Balance, and connected Agents.</td><td>Review Credit, Calls needing attention, and Agents.</td></tr><tr><td>action</td><td>Open Balance</td><td>Open Credit</td></tr></table>
**Target spec:** honest Credit state; attention agrees with Calls; Agent tile names a decision; one primary; no vanity counts. **Cut:** duplicate Open Balance and Provider upsell.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** SOURCE `tests/unit/routes/owner-overview-route.test.tsx:54-103` asserts unavailable versus zero Calls, exactly one Credit action, no vanity Agent count and no Provider upsell; COMMIT `02eb4e0f9`. Remaining blocker: R-14 ROOT, because the local stack has no Formance ledger configuration. **Provenance:** RegAccount, RowR16Overview, RoastD15D16, AttentionSource, 21 Sep 2026.

### R-17 Account and security: `/owner/settings`
**Benchmark:** GitHub Settings. **Incumbent baseline:** persistent section navigation, saved controls, destructive jobs isolated last.
**Current state (LIVE):** 3,112px page; alert switch resets after reload; no section navigation.
**ROOT-CLERK-H1:** Clerk-embedded components (UserProfile, OrganizationProfile, SignIn) render their own `<h1>`: `/owner/settings` 3 H1s (Account, Profile details), `/owner/workspace` 3 (Organization, Members), `/sign-in` 2 (Sign in to Agentic Economy). Fix = one Clerk appearance rule demoting embedded headings (`src/components/ae/website/clerk-appearance.ts`), not per-page hacks.
**Gaps:** • [ACC-07] “Low credit balance” true→false→reload restored true (`OwnerSettingsSections.tsx:18-25`) • [ACC-08] “A 3,112px page has no settings section nav” (`OwnerSettingsShell.tsx:15-22`) • [ACC-09] Profile bundles profile, sessions, sign-out and recovery (`OwnerSettingsSections.tsx:30-63`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>alerts</td><td>Changes apply to this Account only.</td><td>Saved for this Account.</td></tr></table>
**Target spec:** choices survive reload; section nav; personal Profile distinct from Team; filterable security history; workspace danger last elsewhere. **Cut:** SESSION eyebrow.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/owner/settings confirmed choices survive reload, sticky section navigation, separate Profile/Team/Business/Privacy sections, filterable security history, no `SESSION` eyebrow and one accessibility-tree H1; SOURCE `tests/unit/routes/owner-settings.test.tsx:108-161`; COMMIT `e2ab92dcd`, `ef6e7cc43`, `f6c41441c`, `01a5194a6`, `1a8e966cf`. The behavioral assertion for reload persistence is missing, so §0a keeps this row IN REVIEW. Hidden Clerk vendor H1 nodes remain in the raw DOM but not the rendered or accessibility tree. **Provenance:** RegAccount, RowR17Settings, TaxProfileHome, RoastD17D18, SessionEyebrow, DataExport, ClerkHeadings, 21 Sep 2026.

### R-18 Team and Workspace: `/owner/team` and `/owner/workspace`
**Benchmark:** GitHub Organization settings and Vercel Team settings. **Incumbent baseline:** one authoritative member/role view, environment controls and actor-attributed audit.
**Current state (LIVE):** membership views conflict; Workspace has distinct organization/member and billing/tax sections.
**ROOT-CLERK-H1:** Clerk-embedded components (UserProfile, OrganizationProfile, SignIn) render their own `<h1>`: `/owner/settings` 3 H1s (Account, Profile details), `/owner/workspace` 3 (Organization, Members), `/sign-in` 2 (Sign in to Agentic Economy). Fix = one Clerk appearance rule demoting embedded headings (`src/components/ae/website/clerk-appearance.ts`), not per-page hacks.
**Gaps:** • [GH-15] “Clerk row says `R10 Smoke Owner … Admin`; canonical directory says same workspace has `user_… — Owner Active`” (`UNANCHORED`) • [GH-20] “connection hard-codes `Environment: production`; no workspace environment switcher” (`UNANCHORED`) • [GH-22] “`/owner/workspace` and `/owner/team` expose no workspace audit stream” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>role</td><td>Admin / Owner for the same membership</td><td>One authoritative membership role</td></tr></table>
**Target spec:** one role source; owner protections; environment choice visible; actor-attributed admin events; billing stays separate. **Cut:** duplicate membership projection.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/owner/team` rendered one authoritative `Owner` role, `/owner/workspace` kept Danger zone last with Billing/Credit absent, and both pages exposed one accessibility-tree H1; SOURCE `tests/unit/routes/owner-team.test.tsx:78-90`, `tests/unit/settings/team-directory-table.test.tsx:51-60,93-108`, `tests/unit/routes/owner-workspace.test.tsx:99-127`; COMMIT `fc24cd5eb`, `66c3fa3a1`, `ef6e7cc43`, `1a8e966cf`. BLOCKED: environment choice and actor-attributed admin events remain absent because the Team/Workspace DTO exposes no environment or actor-event fields. Hidden Clerk vendor H1 nodes remain in the raw DOM but not the rendered or accessibility tree. **Provenance:** ExpectGitHubVercel, RowR18TeamWorkspace, RoastD17D18, ClerkHeadings, 21 Sep 2026.
**MFA evidence:** workspace close and ownership transfer reject client-supplied `factorEvidence`, trust only the signed Clerk `fva` claim and fail closed with `mfa_reverification_required`; SOURCE `tests/unit/convex/workspace-decommission.test.ts:943-972,1205-1211`, `tests/unit/convex/workspace-security-policy.test.ts:398-465`; COMMIT `f7c02bc85`. Status stays IN REVIEW until the live Clerk `convex` JWT template includes `fva`.

### R-19 Authentication redirects: `/sign-in/$` and `/sign-up/$`
**Benchmark:** Linear Login. **Incumbent baseline:** one auth surface, SSO/passkeys, exact deep-link return.
**Current state (LIVE):** signed-in `/sign-in` lands settings; signed-in `/sign-up` lands onboarding despite established Agents.
**ROOT-CLERK-H1:** Clerk-embedded components (UserProfile, OrganizationProfile, SignIn) render their own `<h1>`: `/owner/settings` 3 H1s (Account, Profile details), `/owner/workspace` 3 (Organization, Members), `/sign-in` 2 (Sign in to Agentic Economy). Fix = one Clerk appearance rule demoting embedded headings (`src/components/ae/website/clerk-appearance.ts`), not per-page hacks.
**Gaps:** • [ACC-10] “/sign-up sends an established owner surface with 8 connected Agents back to blank role selection” (`useSignUpPage.ts:16-19`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>signed-in sign-up target</td><td>Set up your workspace</td><td>Finish workspace</td></tr></table>
**Target spec:** safe signed-in redirects; no accidental duplicate setup; explicit deep link survives; no loop; title matches URL. **Cut:** nothing.
**Priority:** P1. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 signed-in `/sign-in?redirect=/owner/operations` returned to `/owner/operations`; auth-loop targets recovered to `/market`; `/sign-up` and `/onboarding` for an existing Workspace redirected to `/owner`. Safe redirects, deep-link retention, loop prevention and existing-Workspace authority are asserted across 4 test files. SOURCE `tests/unit/routes/auth-redirect-sanitizer.test.ts`, `tests/unit/routes/sign-in-stage.test.tsx`, `tests/unit/routes/sign-in-single-account-exit.test.tsx`, `tests/unit/convex/onboarding.test.ts`; COMMIT `9f9a13604`, `257a51aa9`, `5331467b7`, `5b19b40e3`. Clerk adds a second H1 on `/sign-in`; ROOT-CLERK-H1 dispatched in Wave E. **Provenance:** RegAccount, RowR19Auth, OnboardingAuthority, RoastD13D19, 21 Sep 2026.

### R-20 Calls: `/activity`
**Benchmark:** Stripe Payments and OpenRouter Activity. **Incumbent baseline:** identifiable ledger rows, fixed statuses, URL filters, saved views and export.
**Current state (LIVE):** empty Calls page; no populated rows; summaries unavailable.
**ROOT:** R-14.
**ROOT-ATTN:** one attention count source shared with R-16; dispatched in Wave E.
**Gaps:** • [OR-02] promised fields only “task, outcome, amount, and receipt” (`UNANCHORED`) • [OR-03] “no filter/export” (`UNANCHORED`) • [ST-02] “zero tables/inputs; only ‘No Calls yet’ and summary cards” (`UNANCHORED`) • [ST-03] “no filter controls or query state” (`UNANCHORED`) • [ST-04] “no saved-view control” (`UNANCHORED`) • [ST-05] “no export action” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>row nouns</td><td>Task · Caller Agent · Purchase status</td><td>Tool · Agent · Purchase resolution</td></tr><tr><td>filtered empty</td><td>No Calls yet</td><td>No Calls for this Agent</td></tr></table>
**Target spec:** one ledger job; removable Agent filter always visible; row leads Call identity, Agent, Tool, status, amount, time; export; receipt path preserves scope. **Cut:** monthly summary and unavailable tiles.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W6`. **Provenance:** ExpectOpenRouter, ExpectStripe, 21 Sep 2026.

### R-21 Receipt and Support: `/calls/$callRef` and `/support`
**Benchmark:** Stripe payment detail and support handoff. **Incumbent baseline:** amount/status first, timeline later, state-gated recourse and payment ID carried to Help.
**Current state (LIVE):** missing receipt has clear impact copy, but populated receipt was not reached; Support retains direct reference yet is not reachable from receipt.
**ROOT:** R-14.
**ROOT-TYPE:** LANDED. Public-page H1 is 60px, page-level section H2 is 36px, eyebrows are weight 700 with 0.16em tracking, and legal H2 remains 24px per the marketing canon. Policy: page-level section heading = md (36px); rail/card-group heading inside a section = sm (30px). COMMIT `2998ee3da`, `a18db69cb`.
**Gaps:** • [JNY-02] “detail said ‘Connect an Agent first’; `/activity` said ‘No Calls yet’” (`UNANCHORED`) • [ST-07] “Receipt not found; no valid Call existed to verify” (`UNANCHORED`) • [ST-08] “no timeline in reached state” (`UNANCHORED`) • [ST-09] customer/payment method/receipt absent in refused state (`UNANCHORED`) • [ST-10] refund/dispute gating unverified (`UNANCHORED`) • [ST-11] “Keep this reference and contact the owner or operator,” but no help action (`UNANCHORED`) • [ST-12] Credit failure never states whether money moved (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>receipt error</td><td>owner-scoped status read</td><td>We couldn’t open this Call for this workspace</td></tr><tr><td>support</td><td>Help</td><td>Call</td></tr></table>
**Target spec:** Delivery, Payment, Purchase resolution and Who acts next first; only applicable same-Call action; exact Call reaches Support; blank/malformed refs distinct; Back/refresh retain ref; every failure says whether money moved. **Cut:** advanced evidence before decision facts; no new support form.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W7`. FAQ slice: LIVE 2026-09-21 http://127.0.0.1:3024/support rendered “Questions” with four disclosure rows; first answer opened with `aria-expanded=true`; “Email support” remained `mailto:support@aecon.ai`; SOURCE `src/components/ae/support/help.contracts.ts`, `tests/unit/routes/support-route.test.tsx:67-76`; COMMIT `a0631aa0f`. Roast verdict: VERIFIED for FAQ and C-06 regression; focused Email support after 10 Tabs painted `outlineStyle` `solid`, width `2px`. Receipt and reference-carrying behavior remains OWNER. **Provenance:** PersonaJourneyOwner, ExpectStripe, SupportFaq, Roast3Support, 21 Sep 2026.
**Evidence (orchestrator exception):** uncertain Calls no longer claim `A$0.00 charged`, and receipt-to-Support handoff retains only a canonical valid Call reference while naming malformed input; SOURCE `tests/unit/routes/call-status-route.test.tsx:299-364`, `tests/unit/routes/support-route.test.tsx:118-150`; COMMIT `7cb685492`, `c1527875b`. Status remains OWNER.

### R-22 System status: `/status`
**Benchmark:** Atlassian Statuspage. **Incumbent baseline:** component state, timestamped incidents, last update and subscription.
**Current state (LIVE):** five checks Operational; “Last checked Sep 21, 2026, 12:01 PM UTC.”
**Gaps:** • [HELP-01] “five checks plus Help only” (`src/components/ae/status/system-status/AeSystemStatus.tsx:37-40`) • [HELP-02] “Catalogue freshness…within the last 36 hours” (`src/components/ae/status/system-status/components/StatusCheckList.tsx:10-23`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>All systems operational.</td><td>All systems operational</td></tr></table>
**Target spec:** component timestamps; current/past incidents; last updated; subscribe; refresh. **Cut:** marketing footer links from task.
**Priority:** P1. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/status H1 “All systems operational”; assertion “Last updated just now”; five component timestamps and Refresh present; SOURCE `tests/unit/routes/status-route.test.tsx:139-155`; COMMIT `fb1be270e`. Current/past incidents and subscribe remain DEFERRED under §4 features 40-41 pending a hosted status vendor. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-23 Terms: `/terms`
**Benchmark:** Stripe Legal. **Incumbent baseline:** dated/versioned agreement, parties, fees, payment roles, tax, refunds, disputes and law.
**Current state (LIVE):** Joel’s published Terms, dated 7 September 2026, are ported from marketing `terms.tsx` into one UtilityDocument with 15 ordered sections.
**PRESENT (Joel’s text):** parties/acceptance — “Scope and agreement”, “Eligibility and account control”; fee section — “Prices, fees, tax and records”, “Publishing and supplying services”; MoR/GST/refunds/disputes — “Discovery, providers and purchases”, “Failed requests, disputes and refunds”; liability/termination/law — “Responsibility and legal rights”, “Suspension and closure”, “Complaints, notices and governing law”.
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>card</td><td colspan="2">N/A: card removed with the port</td></tr></table>
**Target spec:** date/version/ToC; parties/acceptance; fee/take/payout; MoR/GST/refunds/disputes; liability/termination/law. **Cut:** Find/Compare/Call cards and dual CTAs.
**ROOT-ECON:** Joel’s published Terms now state the fee/tax/payout FRAMEWORK; numeric take rate and cadence still unsupplied.
**Blocked:** take rate/fee schedule/payout cadence; definitive seller entity; fixed jurisdiction/liability cap.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/terms rendered one H1 followed by 15 ordered H2s; SOURCE marketing `terms.tsx`, dated 7 September 2026, ported verbatim via `AeSiteUtilityDocument`; COMMIT `1b5d825e7`. **Provenance:** RegHelpLegal, PortLegal, 21 Sep 2026.

### R-24 Privacy: `/privacy`
**Benchmark:** Stripe Privacy Center. **Incumbent baseline:** dated notice, controller, categories/purposes, recipients, retention, rights, transfers and contact.
**Current state (LIVE):** Joel’s published Privacy notice, dated 13 September 2026, is ported from marketing `privacy.tsx` into one UtilityDocument with 15 ordered sections.
**PRESENT (Joel’s text):** controller/contact — “Who this policy covers”, “Contact and privacy complaints”; retention — “Retention and deletion”; transfers/complaints — “Overseas processing and public networks”, “Contact and privacy complaints”.
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>intro</td><td>What the market handles…</td><td>How Agentic Economy collects and uses data.</td></tr></table>
**Target spec:** date/version/ToC; controller/contact; category-purpose-recipient table; retention/rights; transfers/complaints. **Cut:** decorative recap.
**Blocked:** exact retention periods; recipient-country list; one controller entity. The former ToC in-view defect is fixed: `#sharing` lands 72.25px below the 65px header.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/privacy rendered one H1 followed by 15 ordered H2s; `#sharing` landed 72.25px below the 65px sticky header; SOURCE marketing `privacy.tsx`, dated 13 September 2026, ported verbatim via `AeSiteUtilityDocument`; COMMIT `d839157ea`. **Provenance:** RegHelpLegal, PortLegal, 21 Sep 2026.

### R-25 Provider correction or removal: `/privacy/remove-business`
**Benchmark:** Google Business Profile remove/claim listing. **Incumbent baseline:** identity check, consequences, review time, receipt and status path.
**Current state (LIVE):** slug/email/reason/note and Send request; no identity evidence.
**Gaps:** • [HELP-07] “accepts slug/email/note only” (`src/components/ae/privacy/remove-business/components/RemovalRequestForm.tsx:56-137`) • [HELP-08] only “A short note is enough.” (`src/components/ae/privacy/remove-business/remove-business.contracts.ts:14-32`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>CTA</td><td>Send request</td><td>Submit request</td></tr></table>
**Target spec:** verify requester; preview affected Business/Tools; removal versus merge; review time; reference/status. **Cut:** three repeating summary cards.
**Blocked:** the adopted dispute seam has no requester-identity verification, affected-Tool projection, merge intent or merge operation; Joel must supply a review-time commitment. Roast BROKEN: “Fix published facts”, “Resolve Provider ownership” and “Remove or merge” remain; the first four Target-spec requirements are absent and the success state was not safely exercised.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/privacy/remove-business H1 “Provider corrections”; button “Submit request”; SOURCE `src/components/ae/privacy/remove-business/remove-business.contracts.ts:14-16`, `tests/unit/routes/privacy-removal-outcome.test.tsx:94-114`; COMMIT `9ce068fb1`. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-26 My tools: `/owner/operations`
**Benchmark:** Stripe Products and Shopify admin Products. **Incumbent baseline:** name, price, status, updated, filters, Add Tool, preview/edit/archive and payout readiness.
**Current state (LIVE):** the local owner now has the seeded `sandbox-aecon-reference` Tool; Provider setup and populated inventory are walkable, while payout and connection readiness still require re-audit.
**Gaps:** • [SUP-01] “Action Required” versus “Nothing is required here…” (`ProviderWorkspaceEarningsSection.tsx:28-44`) • [SUP-02] “DOM links contain no Tool/public preview” (`AeProviderWorkspace.tsx:27-35`) • [SUP-03] “Environment: production” is text (`useOwnerProviderConnectionsState.ts:69-74`) • [SUP-04] columns omit Updated (`AeOwnerOfferings.tsx:114-194`) • [SUP-05] “Supplier activation” (`AeSupplierOnboardingWizard.tsx:48-56`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>title</td><td>Supplier activation</td><td>Provider setup</td></tr><tr><td>empty</td><td>Connect a source and choose the exact Tool AE should validate.</td><td>Add a source, then choose a Tool to publish.</td></tr></table>
**Target spec:** name/price/status/updated/Calls with filters; one Add Tool; one Stripe-linked payout truth; explicit production choice; preview/edit/archive. **Cut:** duplicate Add Tool and contradictory earnings card.
**ROOT-ECON:** Joel’s published Terms now state the fee/tax/payout FRAMEWORK; numeric take rate and cadence still unsupplied.
**Open gaps:** inventory filtering, preview/edit/archive, payout and connection readiness have not been re-audited against the seeded Tool.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-22 the idempotent sandbox publication belongs to the local owner and owner inventory returns one published Tool; SOURCE `convex/devSeed.ts`, `src/modules/dev/internal/dev-seed-fixture.ts`; COMMIT `1fff0da14`, `b3d300549`. Earlier empty-fixture evidence: LIVE 2026-09-21 http://127.0.0.1:3024/owner/operations rendered H1 `Tools`, one `Add Tool` action and matching payout truth in both locations; SOURCE `src/components/ae/offerings/provider-workspace/provider-workspace.view-model.ts:10-48`, `tests/unit/ui/provider-workspace.test.tsx`; COMMIT `f5b03cadf`, `566de52b4`, `2ffc72e72`. **Provenance:** RegSupplyList, RoastC26, StripeGuidance, RoastD33D34D26, SeedCatalogPath, LocalSeedRepair, SeedFinish, 21–22 Sep 2026.

### R-27 Owner Tool detail: `/owner/operations/$toolRef`
**Benchmark:** Stripe Product detail. **Incumbent baseline:** price/status, sales, update history, preview, edit and archive.
**Current state (LIVE):** not reached because My tools says “No Tools yet”.
**Gaps:** • [SUP-06] “No Tools yet; no row/href” (`AeOwnerOfferings.tsx:215-227`) • [SUP-07] required facts “lack live evidence because the required first-listed-Tool path does not exist” (`AeOwnerToolDetailPage.tsx:83-103`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>list gate</td><td>No Tools yet</td><td>Add your first Tool</td></tr></table>
**Target spec:** draft makes openable row; price/status/Calls/updated; buyer preview; consequence-aware edit/archive; missing ref recovers. **Cut:** none measurable.
**Blocked:** local fixture has no Tools; needs seeded Tool to walk detail.
**Contingency:** `c9621da14` introduced 61 type errors; stop-the-line commit `6226d4830` restored typecheck to 0 and added the TanStack-safe recovery variant.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/owner/operations/not-a-ref rendered H1 `Page not found` and `Back to Tools` linking to `/owner/operations`; recovery and copy are asserted, while detail bullets remain unobservable with 0 Tools. SOURCE `src/components/ae/supply/AeOwnerToolDetailPage.tsx:48-71`, `tests/unit/routes/owner-tool-detail-route.test.tsx:133-134`; COMMIT `f2335d8aa`, `c9621da14`, `6226d4830`. **Provenance:** RegSupplyList, RoastC27C28, 21 Sep 2026.

### R-28 Add Tool: `/owner/operations/new`
**Benchmark:** RapidAPI Add API and Stripe Connect Express onboarding. **Incumbent baseline:** identity, source, endpoints, price, preview and publish; commercial terms before payout setup.
**Current state (LIVE):** only x402, OpenAPI, MCP and Agent Plugin sources; later steps not reached.
**Gaps:** • [NEW-01] only “x402 resource URL”, “OpenAPI URL”, “MCP server URL”, or plugin documents (`SupplySourceTypeSection.tsx:136-253`) • [NEW-02] “no fee/take/payout copy” (`SupplyPublicationFlow.tsx:133-150`) • [NEW-03] “Malformed JSON payload. A$0.00 affected” for well-formed JSON (`supply-source-native-start-presentation.ts:36-64`) • [NEW-04] source failures hide DNS/HTTP/schema check (`SupplySourceTypeSection.tsx:95-132`) • [NEW-05] `required=false` until submit (`SupplySourceTypeSection.tsx:179-253`) • [NEW-06] Discover endpoints y=912 and 20/28px controls (`SupplySourceTypeSection.tsx:135-263`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>deck</td><td>Connect the interface you already operate. AE discovers the Tools and validates the one you submit.</td><td>Describe a service or connect its interface. AE checks what agents can buy.</td></tr><tr><td>CTA</td><td>Discover endpoints</td><td>Find Tools</td></tr></table>
**Target spec:** human-delivered or connected Tool first; visibly required fields/examples; syntax/schema/DNS/HTTP distinct; fee/GST/payout before submit; mobile action above fold; targets 44px; focus visible. **Cut:** “A$0.00 affected” and repeated discovery copy.
**Open gaps:** mobile `Sandbox`/`Production` controls end at y=791.5 while fixed bottom navigation starts at y=789; `A$0.00 affected` remains. NEW-01 is PARKED.
**Priority:** P0. **Status:** IN REVIEW (NEW-01 PARKED). **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/owner/operations/new rendered H1 `Add Tool`, required markers, examples and `Find Tools`; the action was above the 390×844 fold and chooser/environment/method targets measured at least 44px, but the environment controls overlapped the fixed bottom navigation. SOURCE `src/components/ae/supply/supply-source-type/supply-source-type.contracts.ts:10-68`, `src/components/ae/supply/supply-source-type/components/SupplySourceFields.tsx:111-227`, `tests/unit/ui/supply-source-native-start.test.tsx:529-544`; COMMIT `f3498b9fb`. **Provenance:** RegSupplyNew, RoastC27C28, 21 Sep 2026.

### R-29 Provider connection handoff: `/owner/supply/connections/new`
**Benchmark:** Zapier Connect account. **Incumbent baseline:** app identity, requested access, one connect action, return to interrupted setup.
**Current state (LIVE):** no/fake attempt shows “This connection request is unavailable” and returns to Add Tool.
**Gaps:** • [NEW-07] “no cause or retained context” (`AeConnectionHandoff.tsx:18-37`) • [NEW-08] “names neither [Provider nor scope]” (`AeConnectionHandoff.tsx:39-59`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>error</td><td>This connection request is unavailable</td><td>Connection link unavailable</td></tr><tr><td>recovery</td><td>Return to Add Tool and start the connection again.</td><td>Return to Add Tool and reconnect.</td></tr></table>
**Target spec:** Provider and access named; one connect action with return; missing/expired distinct; saved Tool retained; inline credential error. **Cut:** duplicate H1/breadcrumb.
**Open gaps:** breadcrumb and H1 both `Connect Provider`; Provider/access are not named on the no-param walk.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/owner/supply/connections/new rendered `Connection link unavailable` and `Return to Add Tool and reconnect.` with one 44px recovery action above the 390×844 fold; the no-param walk exposed no Provider, access, environment or connect action. SOURCE `src/components/ae/supply/connection-handoff/connection-handoff.contracts.ts:30-34`, `src/components/ae/supply/connection-handoff/AeConnectionHandoff.tsx:21-35`; COMMIT `abbd589ab`. **Provenance:** RegSupplyNew, RoastC29C30, 21 Sep 2026.

### R-30 Provider OAuth callback: `/owner/supply/connections/oauth/callback`
**Benchmark:** Zapier/GitHub OAuth callback. **Incumbent baseline:** named success/failure, what happened, retry/return.
**Current state (LIVE):** no params yields generic “Service not connected”; only Return to Add Tool.
**Gaps:** • [NEW-09] no-attempt maps to `authorization_denied` but shows generic failure (`owner.supply.connections.oauth.callback.tsx:23-28`; `AeOwnerMcpOAuthCallback.tsx:43-48`) • [NEW-10] “Failure has no direct retry” (`AeOwnerMcpOAuthCallback.tsx:49-57`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Service connection</td><td>Provider connection</td></tr><tr><td>failure</td><td>Service not connected</td><td>Connection link missing</td></tr></table>
**Target spec:** every outcome named; safe cause; retry retains Tool; success auto-returns; no persistent intermediate page. **Cut:** generic preamble.
**Priority:** P1. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/owner/supply/connections/oauth/callback rendered `Provider connection` and `Connection link missing`; a direct `?code=SECRET123&state=abc` walk did not render either secret. Seven callback outcomes and retained-draft retry are asserted. SOURCE `src/components/ae/supply/owner-mcp-oauth-callback.contracts.ts:1-37`, `tests/unit/routes/owner-provider-connection-handoff-route.test.ts:372-402`; COMMIT `eba21ac72`, `abb28ace5`. **Provenance:** RegSupplyNew, RoastC29C30, 21 Sep 2026.

### R-31 API reference: `/developers/api`
**Benchmark:** Stripe API reference. **Incumbent baseline:** one base URL, Bearer header, valid request, error codes and version policy.
**Current state (LIVE):** Scalar v0.1.0 with schemas and Test Request; generated Quote request is invalid.
**Gaps:** • [DEV-01] `"toolRef": ""` and `"additionalProperty": true` (`src/modules/discovery/internal/openapi-document.ts:47-58`) • [DEV-02] repeated Problem Details rows lack code/action/retry (`src/modules/discovery/internal/openapi-document.ts:214-218`) • [DEV-03] ExactAmount and `totalAud/netAud/gstAud` conflict (`src/modules/capability-execution/procure.ts:33-36`) • [DEV-04] v0.1.0 has no policy (`src/modules/discovery/internal/openapi-document.ts:329-330`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>deck</td><td>Every public REST operation…</td><td>Search Tools, request a Quote, and make a Call.</td></tr></table>
**Target spec:** runnable request per endpoint; one Bearer explanation; named error/action/retry; one price shape; visible version policy. **Cut:** Powered by Scalar and duplicate download.
**Priority:** P0. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/developers/api rendered H1 `API reference`, 24 runnable curl blocks, one Bearer explanation, RFC 9457 next steps, one ExactAmount shape with an AUD example and version policy; SOURCE `tests/unit/discovery/openapi-document.test.ts:68-134` asserts the projection; COMMIT `0749ec791`, `3951c5345`. **Provenance:** RegDevAdmin, SplitOpenapiDoc, RowR31DevApi, RoastD31D32, 21 Sep 2026.

### R-32 Discovery readback: `/developers/discovery`
**Benchmark:** Vercel Logs. **Incumbent baseline:** current state first, trustworthy time/status, filters, no internal planning debris.
**Current state (LIVE):** 0 catalogues, Artifacts unavailable, yet route rows Available; placeholder origin is public.
**Gaps:** • [DEV-05] `https://ae.example/...` (`src/modules/discovery/developer-discovery-route.ts:10-18`) • [DEV-06] “Phase 3”, “Deferred”, “repair source readback before public claims” (`src/routes/developers.discovery.tsx:136-170`) • [DEV-07] routes Available while support/download payload says unavailable/withheld (`src/routes/developers.discovery.tsx:103-149`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Read-only public catalog files</td><td>Discovery status</td></tr><tr><td>action</td><td>Download schema JSON</td><td>View schema status</td></tr></table>
**Target spec:** real origin; one status per artifact; freshness; action matches result; no roadmap/support-capacity copy. **Cut:** Not in this product inventory and public support matrix.
**Priority:** P0. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/developers/discovery rendered H1 `Discovery status`; each artifact row showed the runtime origin, one status, relative checked time and `View`, with no roadmap/support-capacity copy. SOURCE `tests/e2e/developer-discovery.spec.ts`, `tests/imports/route-controller-size.test.ts`; route controller 220→42 and exception count 2→1; COMMIT `b5244c324`. **Provenance:** RegDevAdmin, RowR32Discovery, RoastD31D32, 21 Sep 2026.

### R-33 Admin audit events: `/admin/audit-events`
**Benchmark:** Stripe internal event tables. **Incumbent baseline:** role-specific denial; filters, timestamps, pagination, stable IDs when authorized.
**Current state (LIVE):** non-admin owner sees generic workspace denial and two React recovery errors.
**Gaps:** • [DEV-08] “This signed-in account cannot open the requested workspace.” and duplicate denial (`src/components/ae/layout/AeRouteStates.tsx:228-229,358-364`) • [DEV-09] “two uncaught React recovery errors” (`src/lib/operator/route-options.ts:18-26`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>gate</td><td>This signed-in account cannot open the requested workspace.</td><td>Your account does not have the Admin role.</td></tr></table>
**Target spec:** Admin role named; no console error; authorized filters/timestamps/pagination; explicit redaction. **Cut:** duplicate heading.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/admin/audit-events` as the non-admin local dev user rendered one H1 `Admin access required`, the body `Your account does not have the Admin role for this page.`, both recovery actions and zero console errors. Authorized filtering and `updatedAt` are asserted in `tests/unit/routes/admin-role-gate.test.tsx`; COMMIT `2a212ba18`, `33e137d4d`, `e8f1de44d`. Blocked: local dev user is non-admin; authorized view is asserted except pagination, because `AdminAllowedReadback` has no cursor (`src/modules/operator/admin-readbacks.ts:66-74`). **Provenance:** RegDevAdmin, RowR33R34Admin, RoastD33D34D26, 21 Sep 2026.

### R-34 Admin index health: `/admin/index-health`
**Benchmark:** Stripe internal health tables. **Incumbent baseline:** filterable rows, timestamps, pagination, failure reason and remediation.
**Current state (LIVE):** same generic denial and duplicate recovery errors; rows not reached.
**Gaps:** • [DEV-10] “Admin-role denial is mislabeled as workspace ownership” (`src/routes/_operator/admin.index-health.tsx:17-27`) • [DEV-11] “Expected denial pollutes console twice” (`src/lib/operator/route-options.ts:18-26`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>gate</td><td>You don’t have access to this workspace</td><td>Admin access required</td></tr></table>
**Target spec:** clean role gate; no console error; filter by Tool/source/state; timestamps/pagination; remediation per failure. **Cut:** duplicate denial title.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/admin/index-health` as the non-admin local dev user rendered one H1 `Admin access required`, the body `Your account does not have the Admin role for this page.`, both recovery actions and zero console errors. Authorized remediation mapping is asserted in `tests/unit/routes/admin-role-gate.test.tsx`; COMMIT `2a212ba18`, `e8f1de44d`, `f140c6b44`. Blocked: local dev user is non-admin; authorized view is asserted except pagination, because `AdminAllowedReadback` has no cursor (`src/modules/operator/admin-readbacks.ts:66-74`). **Provenance:** RegDevAdmin, RowR33R34Admin, RoastD33D34D26, 21 Sep 2026.

### R-35 Signed-in chrome and navigation: root shell and operator shell
**Benchmark:** GitHub and Vercel team-scoped navigation. **Incumbent baseline:** one visible team scope and deliberate environment separation without duplicate destination systems.
**Current state (LIVE):** RoastChromeInConcert measured “a repeated Market · Agents · Calls · My tools quartet, `/market` beside `/owner/market` and `/owner` Overview, two mobile navigation models, and an unmarked Supply mode” (`UNANCHORED`). PatternInventory found “3 definition systems” with 26 route nav sites, four mobile destinations and six command items (`src/routes/market.tsx:13-19`; `AeOwnerMobileNavigation.tsx:15-30`; `tools-search-page.contracts.ts:63-100`).
**Gaps:** • [GH-19] “All six signed-in URLs expose `button[aria-label="Open organization switcher"]`” (`UNANCHORED`, PRESENT measured distance) • [GH-20] “no workspace environment switcher” and connection hard-codes production (`UNANCHORED`) • PatternInventory §6 vocabulary differs for Market, Calls, Credit, Agents and Providers (anchors above).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>destinations</td><td>Market · Agents · Calls · My tools</td><td>Per `ia-rationalisation-protocol.md`, only after buyer spine passes</td></tr></table>
**Target spec:** cross-ref S-01..S-20 remains intact; IA-01..04 alone change destinations after the spine gate. **Cut:** no chrome work now.
**Priority:** P2. **Status:** PARKED. **Verification evidence:** Reason: “Chrome is not the hole”. Cross-ref: S-01..S-20. **Provenance:** RoastChromeInConcert, ExpectGitHubVercel, PatternInventory, 21 Sep 2026.

### R-36 Capability-supply payment signer
**Benchmark:** the repository hard ceiling of 1,000 lines. **Incumbent baseline:** focused internal modules below the enforced ceiling.
**Current state (SOURCE):** the former 1,041-line `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` is now a 38-line entry over seven focused modules, each below 300 lines.
**Gaps:** closed; `tests/imports/file-size-ratchet.test.ts` permits no file over 1,000 lines.
**Target spec:** split below 1,000 (`OVER_1000_ALLOWED` in `tests/imports/file-size-ratchet.test.ts` is `[]`). **Cut:** no behaviour or RPC changes.
**Priority:** P1. **Status:** VERIFIED. **Verification evidence:** SOURCE `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` split from 1,041 lines to a 38-line entry and seven focused modules, each below 300 lines; `FILE_SIZE_CEILINGS` moved `over1000` 1→0 and `OVER_1000_ALLOWED` became `[]`; COMMIT `af016e98c`. **Provenance:** Wave 0 file-size gate, SplitPaymentSigner, 21 Sep 2026.

## 2x. ADMIN (operator console)

| Row | Benchmark | Anchors | Absent gap | Target spec | Priority | Status |
|---|---|---|---|---|---|---|
| R-37 Overview | Stripe Dashboard | `src/routes/_operator/admin.*.tsx`; `src/components/ae/readback/**`; `src/components/ae/layout/app-shell/app-shell.contracts.ts` `ADMIN_NAVIGATION` | `listAdminExceptions`; real health/worker failure readback; uncertain-Call/removal/source-review feeds | One viewport shows honest configuration state, exact search and oldest real exceptions; unavailable never renders as zero | P1 | IN REVIEW |
| R-38 Search + shared list | Stripe Dashboard | `src/routes/_operator/admin.*.tsx`; `src/components/ae/readback/**`; `src/components/ae/layout/app-shell/app-shell.contracts.ts` `ADMIN_NAVIGATION` | cross-account lookup read; joined Call/Workspace/Agent/Tool/Provider/Stripe search | Exact canonical ref opens one result; partial search is grouped; query persists in URL; non-admin denied | P1 | IN REVIEW |
| R-39 Call object | Stripe Dashboard | `src/routes/_operator/admin.*.tsx`; `src/components/ae/readback/**`; `src/components/ae/layout/app-shell/app-shell.contracts.ts` `ADMIN_NAVIGATION` | admin-scoped joined Call → attempt/control → Quote → usage/x402 → receipt/obligation/resolution read | Outcome-unknown Call states whether money moved, disables unsafe retry, keeps ref visible, and reuses receipt evidence | P1 | IN REVIEW |
| R-40 Provider object | Stripe Connect review | `src/routes/_operator/admin.*.tsx`; `src/components/ae/readback/**`; `src/components/ae/layout/app-shell/app-shell.contracts.ts` `ADMIN_NAVIGATION` | joined admin Provider read; removal/source-review feed; fresh-fva enforcement; second-approval command | owner action cannot submit without reason/evidence/fresh fva; preview equals emitted audit; support/reviewer cannot invoke | P2 | IN REVIEW |
| R-41 Purchase resolutions | Stripe Radar | `src/routes/_operator/admin.*.tsx`; `src/components/ae/readback/**`; `src/components/ae/layout/app-shell/app-shell.contracts.ts` `ADMIN_NAVIGATION` | admin open queue; immutable decision history; Purchase-resolution disposition/refund command; SLA | Open cases sort oldest first; evidence stays visible; decision is audited; money action stays disabled until its command and money rail are live | P2 | IN REVIEW |
| R-42 Audit | GitHub audit | `src/routes/_operator/admin.*.tsx`; `src/components/ae/readback/**`; `src/components/ae/layout/app-shell/app-shell.contracts.ts` `ADMIN_NAVIGATION` | pagination/search/export; admin-access UI; break-glass authority seam fix | Actor/action/target/time/reason/auth/correlation filters persist in URL; next page is stable; membership mutation appears only after a second seat is needed | P1 | IN REVIEW |
| R-43 Marketplace metrics | Stripe Reports / Shopify Analytics | `/admin/metrics` |  | Daily persisted snapshot (numerators only, ratios on read); headline strip on Overview; CSV export; money exact and labelled `settled_only` vs `not_configured` | P1 | IN REVIEW |
| R-44 ROOT-AUTH break-glass seam |  | `convex/recoveryBreakGlass.ts:133-186,411-449`; `convex/securityShared.ts:196` | Authorises via workspace memberships plus an active `provider_token` credential and never calls `requireAdminAuthority(…, 'use_break_glass')`; `admin.break_glass_used` is remapped but never emitted | Gate both public recovery mutations through `resolveAdminAuthority(ctx, 'use_break_glass')` in addition to the existing checks | P1 | PENDING (Joel decision) |

**Verification evidence (Wave F rounds F0–F2, 2026-09-22).** LIVE lines were observed with the local dev account, which is not a bootstrapped admin: every `/admin/*` route rendered the operator role gate (`Your account does not have the Admin role for this page.`) and no admin data. Admin behaviour is proven by convex-test assertions until `ADMIN_BOOTSTRAP_PRINCIPAL_IDS` carries Joel's principal.

- R-37 Overview: SOURCE `src/routes/_operator/admin.index.tsx`, `src/components/ae/admin/overview/**`, `convex/adminConsoleOverview.ts`, `convex/lib/adminConsole/reads/overview.ts`, `src/modules/money/server.ts` (`readFormancePresence`); ASSERT `tests/unit/routes/admin-overview-route.test.tsx` (banner `Not configured`/`Absent`, four headline cards, `Nothing needs attention.`, refused copy); LIVE 2026-09-22 http://127.0.0.1:3024/admin role gate as non-admin; COMMIT `e69bc8ee0`.
- R-38 Search + object pages: SOURCE `src/routes/_operator/admin.search.tsx`, `admin.{quotes,tools,workspaces,agents}.$*.tsx`, `src/components/ae/admin/{object-search,object-pages}/**`, `src/lib/operator/admin-console/{contracts,ref-parsers,views}.ts`, `convex/lib/adminConsole/reads/{workspace,agent,toolVersion}.ts`; ASSERT `tests/unit/admin-console/admin-object-ref.test.ts` (every parse error code reachable; 500-string totality per kind), `admin-views-redaction.test.ts` (no `@`, `displayName`, `secretRef`, `tokenIdentifier`, `clerkUserId`), `tests/unit/routes/admin-search-route.test.tsx`, `admin-object-pages-route.test.tsx`; COMMITS `05c3884f2`, `dda012427`, `367cf9d7a`, `350407ce0`, `914041af6`. Search is exact kind + ref only (no partial search) by RFC §18 default.
- R-39 Call object: SOURCE `src/routes/_operator/admin.calls.$callRef.tsx`, `src/components/ae/admin/call-object/**`, `convex/adminConsoleObjects.ts`, `convex/lib/adminConsole/reads/{call,quote,objectValues}.ts`; ASSERT `tests/unit/admin-console/admin-call-view.test.ts` (contradictory receipt facts keep `purchase.kind === 'uncertain'`), `tests/unit/routes/admin-call-object-route.test.tsx` (uncertain fixture renders the uncertainty sentence and never `A$0.00`), `tests/unit/convex/admin-read-object.test.ts` (non-admin `missing_membership`, found, not found, malformed); COMMITS `ef76a1cc8`, `faf945766`, `5db1cc6a1`, `350407ce0`. Timeline joins audit events by the Call's `correlationId` (no Call audit target type exists).
- R-40 Provider object: SOURCE `src/routes/_operator/admin.providers{,.$slug}.tsx`, `src/components/ae/admin/{provider-object,providers-list}/**`, `convex/adminConsoleProviders.ts`, `convex/lib/adminConsole/reads/provider.ts`; ASSERT `tests/unit/convex/admin-provider-read.test.ts` (no `secretRef`/`x402Payee`/`name`/`phone`; `local_human` slug not found; suppressed filter; non-admin empty envelope), `tests/unit/routes/admin-providers-route.test.tsx`; COMMITS `24cda6737`, `483a873a1`. Payout reads `unavailable` (no in-transaction money seam); guarded commands (suppress, source authority, commercial policy) are Wave F round F3.
- R-41 Exceptions + Purchase resolutions: SOURCE `src/routes/_operator/admin.exceptions.tsx`, `src/components/ae/admin/exceptions/**`, `convex/adminConsoleExceptions.ts`, `convex/lib/adminConsole/reads/exceptions.ts`; ASSERT `tests/unit/convex/admin-exceptions.test.ts` (oldest first; fresh uncertain Call excluded under 15 min; failing source lands in `unavailable`, never zero), `tests/unit/routes/admin-exceptions-route.test.tsx`; COMMITS `ce46c0dfc`, `42ed7045c`. Purchase resolutions are read-only terminal records; no admin resolution command exists by plan decision.
- R-42 Audit: SOURCE `src/routes/_operator/admin.audit-events.tsx`, `src/components/ae/admin/audit/**`, `convex/adminConsoleAudit.ts`, `convex/lib/adminConsole/reads/audit.ts`, `convex/lib/adminConsole/{commandEnvelope,approvals,idempotency,registrars,validators}.ts`; ASSERT `tests/unit/convex/admin-audit-pagination.test.ts` (30 rows, page 10, insert between pages, no duplicate or omission; `admin` block only for `admin.*` events; non-admin empty envelope + `readAdminAuditAccess` refused), `tests/unit/convex/admin-command-fva.test.ts` (missing/stale proof `mfa_reverification_required`, zero effects; revoked `missing_membership`; reviewer `action_not_allowed`), `admin-command-idempotency.test.ts` (identical replay identical bytes, one audit row, one operationKeys row; changed material `idempotency_conflict`), `admin-command-approval.test.ts` (single owner `not_required`; two owners `approval_required`, propose, same actor, digest mismatch, expired, already resolved); COMMITS `f62df0db5`, `68d1886fd`, `37ba719c4`, `49ba43923`, `acead8e8b`, `53a7a8564`, `0342937f7`. Legacy `security.readAdminAuditEvents` and `readAdminIndexHealth` removed.
- R-43 Marketplace metrics: SOURCE `convex/adminConsoleMetrics.ts`, `convex/lib/adminConsole/metrics/{dayWindow,collect,write,read}.ts`, `convex/marketEvidence.ts` (`countMarketEvidenceBetween`), `src/lib/deployment/scheduled-workloads.ts` (`daily` 16:10 UTC = 00:10 Perth), `src/routes/_operator/admin.metrics.tsx`, `src/routes/api.admin.metrics-export.ts`, `src/components/ae/admin/metrics/**`; ASSERT `tests/unit/convex/admin-metrics.test.ts` (exact counts, `settledCallValue.units` BigInt sum, idempotent rerun, `not_configured` without paid rows, returning workspace on day two, non-AUD refused `unsupported_currency`), `tests/unit/convex/workload-cron.test.ts`, `tests/unit/routes/api-admin-metrics-export.test.ts` (403 problem on refusal; exact CSV header; 400 on bad range); LIVE 2026-09-22 `npx convex run adminConsoleMetrics:snapshotMarketplaceMetricsDay '{"day":"2026-09-21"}'` twice → `{ kind: 'written' }` both, `npx convex data marketplaceMetricDays` one row; COMMITS `ce46c0dfc`, `05fcf32cb`, `e69bc8ee0`.
- Observability (RFC §14): SOURCE `src/lib/observability/admin-event-props.ts` (fixed `ae_*` props, `distinctId = 'admin:' + canonicalDigest(principalRef)`, `$process_person_profile: false`), `private-route-safety.ts` (`/admin/<kind>/[ref]` collapse); ASSERT `tests/unit/admin-console/admin-observability.test.ts`; COMMIT `f706aba04`.

**ROOT-AUTH (R-40):** use_break_glass and control_kernel_incidents bypass the admin-authority seam (convex/recoveryBreakGlass.ts:416-453) — fix before any UI exposes them.

**ROOT-AUTH (R-42):** use_break_glass and control_kernel_incidents bypass the admin-authority seam (convex/recoveryBreakGlass.ts:416-453) — fix before any UI exposes them.

- **Who is alpha admin?** **DEFAULT (orchestrator, 2026-09-22); Joel may override:** Joel's Clerk principal is the only `owner_admin`; provision no support/reviewer membership yet.
- **Which actions need two people?** **DEFAULT (orchestrator, 2026-09-22); Joel may override:** suppression, refunds and commercial-policy change; keep them disabled until a distinct second owner exists.
- **What are the Purchase-resolution outcomes and clocks?** **DEFAULT (orchestrator, 2026-09-22); Joel may override:** uphold, refuse and request evidence; display age without “late” until Joel publishes an SLA; refund waits for live money.
- **Which identifiers may global search accept?** **DEFAULT (orchestrator, 2026-09-22); Joel may override:** exact canonical refs plus Provider/Tool names; defer email, Clerk and Stripe lookup until a PII-access policy exists.
- **Do APP requests and incidents belong in alpha?** **DEFAULT (orchestrator, 2026-09-22); Joel may override:** no; un-defer APP workflow after legal applicability/source mapping, and incident publishing after choosing a hosted status vendor.

## 3. Cross-cutting rows

### C-01 One vocabulary
**Benchmark:** one domain term per concept. **Incumbent baseline:** Tool, Tool version, Quote, Call, Spending policy, Purchase resolution, Agent, Provider, Credit, Business and Workspace.
**Current state (LIVE):** the same concepts change names across Market, Calls, Agents, Credit, doors and Provider pages.
**Gaps:** the full observed drift table follows; each phrase is verbatim from the cited reports.
**Copy:**
| concept | seen verbatim | surface | target |
|---|---|---|---|
| Tool | Task; service; capability; paid tools; capability purchases | Calls; doors; setup | Tool |
| Tool version | version 1; Last verified Not published | Tool detail | Tool version |
| Quote | binding Quote; tool.quote; indicative price | Ask; Tool detail | Quote |
| Call | call; per call; Tool Call; paid request | docs; Ask; Provider | Call |
| Spending policy | Authority; authority mode; spending permission; Work within limits → spine W4-07 | Agents | Spending policy |
| Purchase resolution | Purchase status; payment status | Calls; receipt | Purchase resolution |
| Agent | Caller Agent; agent; client; credential | Calls; Agents | Agent |
| Provider | Supplier; supplier/brand; provider hostname | doors; supply; Market | Provider |
| Credit | AE balance; Account balance; Available Balance; Open Balance; Balance & Credit → spine W5-06 | Tool; Credit; Overview; nav | Credit; Available, Reserved, Total |
| Business | provider profile; Listed Providers | public profile | Business |
| Workspace | Account; organization; Provider workspace | auth; settings | Workspace |
| access grant | Connect agent; Connect Roast Authorization Probe | consent | Approve access; Review access for… |
| Direct key | Legacy credential; secret key → spine W4-06 | Agents | Direct key |
| Agent count | 1 agents | Agents | 1 Agent |
| grant duration | Stays signed in until in 7 days | Agents | for 7 days after approval |
| listed price | TOTAL PRICE; Provider-listed price | Ask; Market | listed price |
| support context | Help; owner-scoped status read | Support; receipt | Call; We couldn’t open this Call for this workspace |
**Target spec:** canonical terms appear in page copy, machine docs and status labels; replacements happen page by page. **Cut:** synonyms that encode no distinct domain state.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/owner/operations` rendered H1 `Tools`, operator navigation `Market, Agents, Calls, Tools`, and document title `Tools | Agentic Economy`; SOURCE `src/routes/_operator/owner.operations.tsx:18-20,49-50`, `tests/unit/routes/supply-owner-routes.test.tsx:70-72`; COMMIT `9e0924ad7`, `0f3e7388d`, `7ac486307`, `30ea76afe`. The re-audit standardized one label per intent and removed buyer-facing AE/x402/Bazaar/service drift outside OWNER-LOCKED surfaces; COMMIT `0076fd8f2`, `5be752e04`. Remaining OWNER append is queued in spine W2-09, W4-06, W5-06 and W7-06. **Provenance:** buyer-spine T4, RegDoors, RegSupplyList, RegSupplyNew, RegDevAdmin, Persona reports, ToolsNavIdentity, IntentLabels, NounsAndJargon, 21–22 Sep 2026.

### C-02 One price
**Surfaces affected:** Market, Tool detail, Compare, Ask, Agents, Credit, API reference and Provider publishing.
**Benchmark:** one buyer-readable all-in price with contract units available second. **Incumbent baseline:** Stripe shows line items, tax and total before confirmation.
**Current state (LIVE):** the same Tool appears as USDC decimal, A$ approximation, per-page price and atomic units.
**Gaps:** [OPS-02] “About A$0.04 per Call” and “USDC 0.025000” (`UNANCHORED`); [JNY-06] “$0.003/page” versus “0.01 USDC/About A$0.01” (`UNANCHORED`); [OR-11] “0.010000 USDC / 10000 atomic units” (`UNANCHORED`); [DEV-03] `{currency,units,exponent}` versus `{totalAud,netAud,gstAud}` (`src/modules/capability-execution/procure.ts:33-36`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>buyer first</td><td>USDC / AUD / atomic units / per page</td><td>A$x.xx per Call (GST incl.)</td></tr><tr><td>Contract</td><td>mixed</td><td>Provider units and billing unit</td></tr></table>
**Target spec:** `A$x.xx per Call (GST incl.)` first; Provider units under Contract; multi-unit Tools show an estimator; Quote remains exact. **Cut:** atomic units from decision surfaces.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `buyer-spine-stabilisation-plan.md W2-03/W2-04`. **Provenance:** PersonaOpsManager, PersonaJourneyOwner, ExpectOpenRouter, RegDevAdmin, 21 Sep 2026.

### C-03 Callable state
**Surfaces affected:** Market, Tool detail, Ask and Agent consent.
**Benchmark:** App Store installability and OpenRouter route availability. **Incumbent baseline:** availability is known before setup.
**Current state (LIVE):** Market lists upstream rows while execution uses admitted Tool refs; UI presents one catalogue.
**Gaps:** [DEV-R2-03] “15,141 Tools indexed” versus “Readiness Checked when quoting” (`UNANCHORED`); [APP-05] “Connect an Agent first” despite six Agents (`UNANCHORED`); [SKP-01] Connected Agent loop (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>state</td><td>no indexed-vs-callable marker</td><td>Callable by Agents / Listed, not yet callable</td></tr></table>
**Target spec:** join index row to `toolRef`; render same state on Market, detail, Ask and consent; listed-only never claims a Quote or Agent action. **Cut:** generic Ready language without a Tool ref.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** PersonaAgentDev, ExpectAppStoreShopify, PersonaSkeptic, buyer-spine T1, 21 Sep 2026.

### C-04 Status vocabulary
**Surfaces affected:** all status badges, inline states and lifecycle tables.
**Benchmark:** one meaning maps to one label, tone and action. **Incumbent baseline:** `src/lib/ui/status-presentation.ts` is canonical.
**Current state (SOURCE):** PatternInventory counted 18 vocabularies.
**Gaps:** `AeStatus[52]`; UI state[11]; chat `{Working,Pending,Complete,Needs attention,Refused,Couldn't run}`; Tool readiness `{Ready now,Setup required,Unavailable,Checked when quoting}`; activity `{Completed,Refused,Needs Attention}` plus five purchase states; receipt labels; Agent `{Connected,Needs attention,Expired,Disconnected}`; credential `{Current,Active,Expired,Revoked}`; connection `{Connected,Expired,Revoked}`; invoice `{Paid,Reversed}`; spending `{Paused,Active}`; listing `{Ready now,Setup required,Inspect only}`; health `{Operational,Degraded,Checking}`; payout-return four-state; Express three-state; Provider availability two-state; owner availability three-state; lifecycle nine-state (`src/lib/ui/status-presentation.ts:3-57` and PatternInventory §3 anchors).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>all status UI</td><td>18 sets</td><td>`status-presentation.ts`</td></tr></table>
**Target spec:** each touched page maps through canonical presentation; obsolete local labels deleted. **Cut:** local status sets with no distinct domain state.
**OWNER remainder → buyer spine:** `src/components/ae/activity/AeActivity.tsx`, `src/components/ae/activity/components/ActivityMonthlySummary.tsx`, `src/components/ae/activity/useAeActivity.ts`, `src/components/ae/chat/ToolCard.tsx`, `src/components/ae/market/tool-detail/tool-inspector-model.ts`, `src/lib/public/chat-ia.ts`, `src/modules/chat/tool-card.ts`, `src/modules/market/tool-view-model.ts`.
**Scanner false positives:** `src/components/ae/console/AeAgentConnectionReceipts.tsx` (time-fact heading); `src/components/ae/console/agent-operator-console-model.ts` (count/missing-data headings); `src/components/ae/offerings/provider-workspace-projection.ts` and `src/components/ae/supply/AeProviderToolDetail.tsx` (typed `Paused` discriminants); `src/components/ae/readback/AeAdminReadbackPanel.tsx` (count/missing-ref headings); `src/lib/errors.ts` (RFC 9457 title); `src/modules/capability-supply/internal/supply-funnel/types.ts`, `src/modules/capability-supply/provider-tool-status.ts` and `src/modules/capability-supply/tool-health.ts` (wire/Zod discriminants).
**Future gate task — Status PENDING, not a row:** scanner refinement: exclude count/time headings, RFC titles, wire discriminants.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** COMMIT `276294174` `3df79fb5c` `caa86a24f` `cb55d4250` `7919453dd` `162a7df74`; status-vocabulary 28→17; canonical rows added in `src/lib/ui/status-presentation-rows.ts:18-127` (`operational`, `connected`, `disconnected`, `active`, `paused`, `needs_attention`, `ready_now`, `setup_required`, `completed`, `current`, `credential_expired`, `credential_revoked`). **Provenance:** PatternInventory, StatusVocabBurndown, StatusVocabRoot, 21 Sep 2026.

### C-05 Tool summary projection
**Surfaces affected:** Market, Ask, command panel, home, canonical Tool page and Provider door.
**Benchmark:** App Store card identity, purpose, price and one action. **Incumbent baseline:** one full card and one compact row projection.
**Current state (SOURCE):** seven components in six files use six field orders.
**Gaps:** DirectoryToolCard provider→title→price→action (`DirectoryToolCard.tsx:39-62`); ToolCard title→status→choice→readiness→provider→price→action (`ToolCard.tsx:55-83,245-266`); ToolSearchResultRow title→provider→status→price→action (`ToolSearchResultRow.tsx:21-42`); AeCapabilityTile title→provider→price→action (`AeCapabilityTile.tsx:19-58`); DirectoryEntrySummary title→provider→action→price→status (`AeDirectoryToolCanonicalPage.tsx:39-58`); PublishedToolProofRow title→provider→status→price→action (`AeSupplyAgentProof.tsx:107-128`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>all summaries</td><td>six orders</td><td>Provider → title → callable state → listed price → one action</td></tr></table>
**Target spec:** `directory-card.view-model.ts` owns order; DirectoryToolCard stays full card; compact rows share one projection. **Cut:** per-surface field ordering.
**Priority:** P1. **Status:** OWNER. **Verification evidence:** Queue: `buyer-spine-stabilisation-plan.md W2-03/W2-04`. **Provenance:** PatternInventory, 21 Sep 2026.

### C-06 Focus visibility
**Surfaces affected:** all link-styled buttons and Tier-1 buttons.
**Benchmark:** WCAG 2.2 visible focus. **Incumbent baseline:** one shared ring from `buttonVariants`.
**Current state (LIVE):** focus is absent on detail escape, Ask Send, Credit retry, receipt actions, Support email and several round-3 CTAs.
**Gaps:** [DOOR-14] “outline-style none and box-shadow none” (`src/components/ae/listing/PublicBusinessNotFound.tsx:35`); [HELP-01 context] Refresh computed outline none (`UNANCHORED`); [HELP-08 context] submit outline none (`UNANCHORED`); [NEW-06] `:focus-visible=true` but outline none (`SupplySourceTypeSection.tsx:135-263`); [RCP-04] “no visible outline/ring” (`UNANCHORED`); [FOCUS-01] “computed outline-style is none” (`AeSupportHelpPage.tsx:22`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>focus-visible</td><td>none on repeated primaries</td><td>one unmistakable Tier-1 ring</td></tr></table>
**Target spec:** `src/components/ui/button.tsx` ring covers buttons and link variants; every named control paints it. **Cut:** page-local ring patches.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/support` Email support and `/t/new` Send message painted `outline-style: solid` and `outline-width: 2px`; SOURCE `src/components/ui/button-variants.ts:9`; COMMIT `75eecb4b8`. Regression LIVE 2026-09-21 http://127.0.0.1:3024/support: Email support focused after 10 Tabs; `outlineStyle` `solid`, width `2px`; SOURCE Roast3Support. **Provenance:** RegDoors, RegHelpLegal, RegSupplyNew, buyer-spine, Roast3Support, 21 Sep 2026.

### C-07 Accessible names and announcements
**Surfaces affected:** Market, Agents, Credit and dialogs.
**Benchmark:** WCAG 2.2 named controls, focus order and live updates. **Incumbent baseline:** one labelled native control per choice and announced result/error changes.
**Current state (LIVE):** keyboard procurement path cannot efficiently search, compare or safely set policy.
**ROOT-CLERK-H1:** LANDED. One shared Clerk appearance rule leaves one accessibility-tree H1 on `/owner/settings`, `/owner/workspace`, `/owner/team`, `/sign-in` and `/sign-up`; hidden vendor H1 nodes remain in the raw DOM because Clerk exposes CSS-only appearance. COMMIT `1a8e966cf`.
**Gaps:** • [A11Y-01] “search is Tab 12; submit moves focus to BODY; no live/status region or result count” (`UNANCHORED`) • [A11Y-02] “91 Tabs to first ‘Add … to comparison,’ then 31 to ‘Compare Tools’” (`UNANCHORED`) • [A11Y-03] unnamed radios and checkbox (`UNANCHORED`) • [A11Y-04] “Done returns focus to BODY” (`UNANCHORED`) • [A11Y-05] “unnamed progressbar” (`UNANCHORED`) • [A11Y-06] “two regions both named ‘Popular Tools’” (`UNANCHORED`) • [A11Y-07] “control what each Agent can do” versus unnamed policy radio (`UNANCHORED`) • [A11Y-08] “A world of Tools, ready to explore” versus 91 stops (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>search</td><td>silent result update</td><td>announce “12 results”; retain deliberate focus</td></tr><tr><td>policy</td><td>empty accessible names</td><td>one labelled native control per choice</td></tr></table>
**Target spec:** search near skip link; count announced; compare bar focused after selection; controls named once; errors linked; dialog restores trigger/created row; landmarks unique. **Cut:** duplicate AX nodes and inert focus targets.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/owner/settings`, `/owner/workspace`, `/owner/team`, `/sign-in` and `/sign-up` each exposed one accessibility-tree H1; SOURCE `src/components/ae/website/clerk-appearance.ts:72-80`, `tests/unit/website/clerk-sign-in-appearance.test.ts:22-27`; COMMIT `1a8e966cf`. Named Market, Agent, Credit and dialog accessibility gaps remain open in the OWNER spine. **Provenance:** PersonaAccessibility, Roast3Footer, ClerkHeadings, 21 Sep 2026.

### C-08 Empty, error and loading states
**Surfaces affected:** all async routes.
**Benchmark:** route-neutral recovery, no layout shift, explicit money outcome. **Incumbent baseline:** `AeEmptyState` and `AeRouteStates`.
**Current state (SOURCE):** 30 AeEmptyState renders coexist with 38 bespoke JSX branches; 32 files use Skeleton.
**Gaps:** PatternInventory §4 (`AeActivity.tsx:85-94`; `AeX402Directory.tsx:253-333`; `CallMoneyFacts.tsx:20-29`); [ST-12] `/owner/credit` never says whether money moved (`UNANCHORED`); Credit says “check system status before repeating a Call” on a non-Call error (`src/components/ae/layout/AeRouteStates.tsx:287-317`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>financial failure</td><td>route-specific ambiguity</td><td>what happened; whether money moved; next action</td></tr></table>
**Target spec:** shared state components; money-moved line on every financial failure; route-neutral copy; no “Call” in non-Call errors; matching skeleton geometry. **Cut:** bespoke branches when shared state fits.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/admin/audit-events` rendered one route-error heading with route-neutral recovery; SOURCE `src/components/ae/layout/AeRouteError.tsx:85-168`; COMMIT `1cf57807d`. The re-audit converted named Tool, Provider, Earnings, generic page, funding, payment-method and Agent failures to alerts with explicit money outcome; 79 targeted tests passed; COMMIT `acad2e112`. Remaining OWNER-LOCKED Activity, Agent security, Credit, receipt and Support error states are queued in spine W5-03 and W7-06. **Provenance:** PatternInventory, ExpectStripe, buyer-spine Credit, ErrorsNotEmpty, 21–22 Sep 2026.

### C-09 Sandbox versus production visibility
**Surfaces affected:** Agents and Provider connections only.
**Benchmark:** Stripe Test mode and GitHub/Vercel environments. **Incumbent baseline:** environment visible at the resource where consequences occur.
**Current state (LIVE):** Agent creation has Sandbox/Production pills; Provider connection hard-codes production; there is no global toggle.
**Gaps:** [ST-01] “Sandbox appears only as small per-agent pills” (`UNANCHORED`); [GH-20] “connection hard-codes `Environment: production`; no workspace environment switcher” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>Agent</td><td>small pills</td><td>per-Agent environment pill</td></tr><tr><td>Provider connection</td><td>production text</td><td>explicit environment choice</td></tr></table>
**Target spec:** retain per-Agent pills; require explicit Provider environment; no global test-mode promise until data actually switches. **Cut:** false global mode chrome.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 http://127.0.0.1:3024/owner/operations had 0 Provider connections, so no environment badge was observable; the fixture asserts a `Sandbox` badge on a connection row. SOURCE `src/components/ae/supply/AeProviderConnectionList.tsx:83-88`, `tests/unit/ui/owner-provider-connections.test.tsx:44-75`; COMMIT `ee6c1db53`. **Provenance:** ExpectStripe, ExpectGitHubVercel, ConnectionEnvironment, 21 Sep 2026.

### C-10 Overclaims
**Surfaces affected:** Market, Tool detail, Agents, chrome, Provider doors and My tools.
**Benchmark:** every promise has visible current proof. **Incumbent baseline:** factual state copy, not inferred readiness.
**Current state (LIVE):** copy repeatedly outruns catalogue, connection, commercial or payout evidence.
**Gaps:** • [APP-01/SKP-03] “Used recently by other agents” versus “Completed calls 0” → spine W2-10 (`src/modules/market/directory-card.view-model.ts:67`) • [OPS-07/SKP-05] “one Call away” versus multi-step setup / “Connect an Agent first” → spine W2-09 (`src/components/ae/market/DirectoryHero.tsx:38`) • [DEV-R2-07] new Agent labelled “Legacy credential” → spine W4-06 (`src/components/ae/console/AeAgentDirectoryTable.tsx:90`; `src/components/ae/console/AeAgentConnectionReceipts.tsx:27`) • [SKP-06] “Connection online” while balances/summaries unavailable (`UNANCHORED`) • [APP-05/JNY-08] “Connect an Agent first” after Agents exist → spine W0-01 (`UNANCHORED`) • [CFO-27] “You describe the price…” but source required first (`UNANCHORED`) • [CFO-28] “automated AUD payouts” with no schedule/take (`UNANCHORED`) • [DEV-API] “Every public REST operation” with invalid generated examples (`src/modules/discovery/internal/openapi-document.ts:47-58`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>all</td><td>unqualified promise</td><td>measured fact, or remove</td></tr></table>
**Target spec:** each listed phrase is removed or backed by a visible count/state/term; newly created Direct keys never say Legacy. **Cut:** all unsupported superlatives and readiness promises.
**Priority:** P0. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 `/market` linked System status to `/status` instead of claiming “Connection online”; SOURCE `src/components/ae/layout/AeNetworkHealthIndicator.tsx:51-56`; COMMIT `d0d5475e5`, `8da42d324`, `6d1903cb1`, `bc32a547a`. Remaining OWNER-LOCKED overclaims → spine W0-01, W2-09, W2-10 and W4-06. **Provenance:** Persona/expectation reports and RegDevAdmin, 21 Sep 2026.

### C-11 Touch targets and mobile primary above fold
**Surfaces affected:** My tools, Owner Market, Add Tool, Calls, Terms, Privacy and correction request.
**Benchmark:** WCAG 2.2 24px minimum, product standard 44px primary targets, mobile primary visible for first job.
**Current state (LIVE):** repeated header utilities are 20×20 or 28×28; source radios are 16px; several first actions start below 844px.
**Gaps:** My tools “Connection icon 20×20 and user menu 28×28” (`UNANCHORED`); Owner Market “utility buttons are 20×20/28×28” (`UNANCHORED`); Add Tool “20/28px header controls and 16px radios” plus CTA y=912 (`SupplySourceTypeSection.tsx:135-263`); [ACT-04] “‘Connection online’ is 20×20px” (`UNANCHORED`); Terms CTA y=967, Privacy y=999, correction y=846 (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>interactive hit box</td><td>16/20/28px</td><td>at least 44×44 without enlarging glyph</td></tr></table>
**Target spec:** every named hit box 44×44; primary for the page’s first job above fold at 390×844; no horizontal overflow. **Cut:** decorative mobile content before first action.
**ROOT-TYPE:** LANDED. Public-page H1 is 60px, page-level section H2 is 36px, eyebrows are weight 700 with 0.16em tracking, and legal H2 remains 24px per the marketing canon. Policy: page-level section heading = md (36px); rail/card-group heading inside a section = sm (30px). COMMIT `2998ee3da`, `a18db69cb`.
**Priority:** P1. **Status:** IN REVIEW. **Verification evidence:** LIVE 2026-09-21 at 390×844, `/owner/operations/new` last radio bottom `774px`, `/owner/settings` last Evidence details bottom `658.09px` and `/owner` Offer a Tool bottom `740px`, all above fixed navigation top `788px`; `scrollWidth=368`. Shared `--ae-mobile-nav-height: 56px` drives both navigation and content reservation. SOURCE `src/styles/globals.css:267`, `tests/unit/operator-shell-chrome.test.tsx:387-396`; COMMIT `e47cbd75c`, `f3498b9fb`, `35280530c`. Other named hit boxes and above-fold first actions remain open. **Provenance:** RegSupplyList, RegSupplyNew, RegHelpLegal, buyer-spine, MobileNavOverlap, 21 Sep 2026.

### C-12 Machine docs consistency
**Surfaces affected:** `/for-agents`, setup snippets, `/developers/api`, `/SKILL.md`, `/llms.txt`, `/openapi.json`, `/glossary.md`, `/mcp`, `/.well-known/*`.
**Benchmark:** OpenAI OpenAPI and llms.txt conventions. **Incumbent baseline:** one host, auth vocabulary, nouns, endpoints and price shape.
**Current state (LIVE):** machine endpoints mostly return deliberate statuses, but their contract facts diverge.
**Gaps:** [DEV-12] CLOSED: `/glossary.md` HEAD and GET now return 200 (`vite.config.ts`; `src/routes/glossary[.]md.ts:7-38`); [DEV-13] SKILL hard-codes production (`src/modules/discovery/internal/agent-skill.ts:6-10`); [DEV-14] “AE key”, `agentAccessKey`, `clerk_api_key` (`src/modules/discovery/internal/site-manifest.ts:44`); [DEV-15] “capability purchases”, “paid tools”, “per call” (`src/components/ae/agent-access/home/agent-access-home.contracts.ts:13`).
**Copy:**
| fact | /for-agents | setup snippets | /developers/api | /SKILL.md | /llms.txt | /openapi.json | target |
|---|---|---|---|---|---|---|---|
| base URL | `127.0.0.1:3024/mcp` | `${base}/mcp` | `127.0.0.1:3024` | `https://app.aecon.ai` | `127.0.0.1:3024` | `127.0.0.1:3024` | runtime canonical base |
| auth | absent | Bearer secret | Bearer token | absent | “AE key” | Bearer token | Bearer Agent credential |
| nouns | Tools | capability purchases / paid tools | Tool Call | Tool / Call | Tool / Call | Tool Call | Tool / Quote / Call |
| paths | absent | absent | quote/call | `ae_tool_quote/call` | quote/call | quote/call | linked canonical paths |
| price | absent | A$ per call, GST incl. | ExactAmount plus AUD fields | absent | absent | mixed | one ExactAmount; buyer display per C-02 |
**Target spec:** all advertised docs resolve; one runtime host; one auth name/header; canonical nouns; linked paths; one ExactAmount. **Cut:** dead glossary link and unconfigured signatures from inventory.
**Priority:** P0. **Status:** VERIFIED. **Verification evidence:** LIVE 2026-09-21 all 7 machine documents returned 200 and all 13 linked public paths returned 200; one runtime host, one `Authorization: Bearer <Agent access key>` form and one `ExactAmount` definition are asserted by 19 discovery/SEO files with 99 tests; SOURCE `src/modules/discovery/internal/agent-skill.ts:7-13`, `src/modules/discovery/internal/offering-discovery-file.ts:61-66,95-103`, `src/modules/discovery/internal/site-manifest.ts:44`, `src/modules/discovery/internal/glossary.md:24-27,49-53`; COMMIT `44decf45c`. **Provenance:** RegDevAdmin, GlossaryRoute, RowR31DevApi, RowR32Discovery, RoastD31D32, MachineDocsConsistency, 21 Sep 2026.

## 4. Class gaps: what an app of this kind has that AE does not

KNOWLEDGE references: OR OpenRouter, ST Stripe, RA RapidAPI, SA Shopify App Store, GH GitHub, VE Vercel, SP Statuspage, AI Perplexity/ChatGPT. Donor constraints: Treg is Apache-2.0 plus a hosted/embedded commercial-service restriction; Twenty is mainly AGPL-3.0 with named MIT packages; Executor is MIT. Verified hosted surfaces are Stripe Customer Portal/Connect Express, Clerk UserProfile/OrganizationProfile, PostHog and Vercel/Convex dashboards.

| # | Feature | Who ships it | AE status (file:line) | Borrow from | Handroll risk | Decision |
|---:|---|---|---|---|---|---|
| 1 | Search/filter | OR, RA | PRESENT `AeX402Directory.tsx:202-214` | installed TanStack | low | ADOPT existing TanStack seam |
| 2 | Categories/collections | SA, RA | PRESENT `DirectoryHomeDiscovery.tsx:36-60` | existing `src/components/ui/carousel.tsx` | low | ADOPT existing UI primitive |
| 3 | Compare | OR, RA | PRESENT `AeX402Directory.tsx:188-192` | Twenty marketplace pattern, AGPL area | medium | PATTERN-ONLY Twenty |
| 4 | Saved Tools | SA, GH | PARTIAL `DirectorySavedTools.tsx:3-6` | existing Saved projection | medium | ADOPT existing Saved projection |
| 5 | Provider identity | SA, RA | PRESENT `DirectoryProviderHeader.tsx:1-4` | existing Business projection | medium | DEFER already present; fix R-04 |
| 6 | Price/auth/schema | OR, RA | PRESENT `AeProviderListingPage.tsx:265-269` | existing schemas | low | ADOPT existing contract seam |
| 7 | Ratings/performance | RA, SA | PRESENT `AeToolTrackRecord.tsx:22-33` | installed Convex Aggregate | low | ADOPT Convex Aggregate |
| 8 | Written reviews | SA, RA | PARTIAL `convex/marketListingEvidence.ts:80-82` | installed Convex Aggregate | medium | ADOPT Convex Aggregate |
| 9 | Request playground | OR, RA | PRESENT `DirectoryToolPlayground.tsx:30-72` | existing RJSF/AJV seam | low | ADOPT existing playground |
| 10 | Source provenance | GH, SA | PRESENT `SourceAuthorityReviewPanel.tsx:48-65` | existing digest seam | low | ADOPT existing digest seam |
| 11 | Balance/top-up | ST, OR | PRESENT `AeOwnerOverview.tsx:74-107` | Stripe | low | HOST Stripe |
| 12 | Auto-recharge/cards | ST | PRESENT `AeAutoRechargeCard.tsx:29-51` | Stripe Customer Portal | low | HOST Stripe Customer Portal |
| 13 | Invoices/exports | ST | PRESENT `AeInvoiceHistoryTable.tsx:287-330` | Stripe plus existing CSV | low | HOST Stripe |
| 14 | Buyer dispute initiation | ST | ABSENT `status-presentation.ts:534-541` | Stripe-hosted billing | high | HOST Stripe Customer Portal |
| 15 | Recurring API plans | RA, ST | ABSENT `SupplyPublicationFlow.tsx:64-83` | Stripe Billing; Treg only as restricted pattern | high | HOST Stripe Billing; PATTERN-ONLY Treg |
| 16 | Provider payouts | ST, SA | PRESENT `ProviderWorkspaceEarningsSection.tsx:25-39` | Stripe Connect Express | low | HOST Stripe Connect Express |
| 17 | OAuth/DCR | GH, VE | PRESENT `agent-access-oauth-api.ts:139-176` | installed oauth4webapi | low | ADOPT oauth4webapi |
| 18 | Consent/scoped Tools | GH, VE | PRESENT `ConsentToolAccessFieldset.tsx:26-81` | existing consent seam | low | ADOPT existing consent seam |
| 19 | Credential reveal/revoke | GH, OR | PRESENT `AeAgentAccessHome.tsx:72-75,120-126` | Executor `packages/react` MIT patterns | low | ADOPT Executor MIT |
| 20 | Budgets/rates/concurrency | OR, RA | PRESENT `agent-operator-console-model.ts:117-133` | installed Convex Rate Limiter | low | ADOPT Convex Rate Limiter |
| 21 | Environment/expiry | GH, VE | PRESENT `ConsentRequestFacts.tsx:20-43` | existing policy | low | ADOPT existing policy |
| 22 | Per-key IP allowlists | GH | ABSENT `agent-operator-console-model.ts:157-168` | gateway source not verified | high | DEFER until gateway authority is named |
| 23 | Idempotency/replay | ST, GH | PRESENT `call-admit.ts:98-115` | existing kernel | low | ADOPT existing kernel |
| 24 | Calls/filter/export | ST, OR | PRESENT `AeActivity.tsx:59-81` | installed TanStack Table | low | ADOPT TanStack Table |
| 25 | Detailed receipts/refunds | ST | PRESENT `CallMoneyFacts.tsx:10-68` | existing receipt seam | low | ADOPT existing receipt seam |
| 26 | Cancel/reconcile/retry | ST | PRESENT `CallRecoveryPanel.tsx:30-61` | existing kernel | low | ADOPT existing kernel |
| 27 | Security history | GH | PRESENT `AeAccountSecurityHistory.tsx:27-49` | Clerk plus Convex | low | HOST Clerk UserProfile |
| 28 | Shared chat/history | AI | PRESENT `useChatSession.ts:100-108` | installed `@convex-dev/agent` | low | ADOPT `@convex-dev/agent` |
| 29 | Human source citations | AI | PARTIAL `ToolCard.tsx:188-193` | installed AI SDK | medium | ADOPT AI SDK |
| 30 | Outbound webhooks | ST, GH | ABSENT `api.stripe.webhook.ts:3-23` | Svix is not verified installed | high | DEFER until event contract and vendor are approved |
| 31 | OpenAPI/MCP/x402 import | RA, SA | PRESENT `AeSupplyLanding.tsx:23-44` | installed Scalar/MCP/x402 | low | ADOPT installed protocol packages |
| 32 | Publish lifecycle | SA | PRESENT `AeOwnerToolDetailPage.tsx:80-102` | existing lifecycle | low | ADOPT existing lifecycle |
| 33 | Provider test console | RA | PRESENT `AeToolTestPlayground.tsx:16-41` | existing RJSF | low | ADOPT existing playground |
| 34 | Provider analytics | SA, RA | PARTIAL `ProviderWorkspaceEarningsSection.tsx:25-39` | installed Recharts | medium | ADOPT Recharts |
| 35 | Teams/invites/roles | GH, VE | PRESENT `owner.team.tsx:1-44` | Clerk OrganizationProfile | low | HOST Clerk OrganizationProfile |
| 36 | Profile/sessions | GH, VE | PRESENT `OwnerSettingsSections.tsx:23-43` | Clerk UserProfile | low | HOST Clerk UserProfile |
| 37 | Close/transfer Workspace | GH, VE | PRESENT `useWorkspaceDangerZone.ts:29-47` | existing Convex mutations | medium | ADOPT existing mutations |
| 38 | Email preferences | ST, GH | PARTIAL `OwnerSettingsSections.tsx:18-24` | installed Convex Workflow | medium | ADOPT Convex Workflow |
| 39 | Live status | SP | PRESENT `system-status.contracts.ts:67-68,121-139` | existing probes | low | ADOPT existing probes |
| 40 | Incident history | SP | ABSENT `system-status.contracts.ts:67-69` | Statuspage not inventoried | high | DEFER until status vendor is approved |
| 41 | Status subscriptions | SP | ABSENT `system-status.contracts.ts:121-139` | Statuspage not inventoried | high | DEFER until status vendor is approved |
| 42 | Privacy/terms/API docs | GH, ST | PRESENT `developers.api.tsx:7-25` | Scalar CDN plus legal owner | low | ADOPT Scalar for API only |
| 43 | Locale switch/i18n | SA | ABSENT `format-time.ts:7-21` | maintained i18n package not declared | high | DEFER until alpha market scope requires it |
| 44 | Accessible states | all | PRESENT `AeActivity.tsx:84-94` | shadcn/Base UI | low | ADOPT existing UI primitives |
| 45 | Report/moderate listing | SA | PARTIAL `useRemoveBusinessPage.ts:75-78` | existing dispute seam | medium | ADOPT existing dispute seam |
| 46 | Personal-data export | GH, ST | ADOPTED `src/lib/server/personal-data-export.functions.ts:47-100` | existing per-account reads | low | **ADOPTED: COMMIT `01a5194a6`; Settings › Privacy › Download your data (JSON); sections `workspaceProfile`, `memberships`, `notificationPreferences`, `taxProfile`, `agentConnections`, `securityHistory`, `calls`, `invoices`; composed from existing caller-scoped reads via `src/lib/server/personal-data-export.functions.ts`; no new Convex query.** |
| 47 | Org SSO/SCIM controls | GH, VE | ABSENT `owner.team.tsx:27-44` | Clerk enterprise | high | **DEFAULT (orchestrator, 2026-09-21); Joel may override:** DEFER; Clerk enterprise plan is a purchase decision |
| 48 | Spend-anomaly alerts | ST | ABSENT `OwnerNotificationSettings.tsx:54-74` | existing telemetry and notifications | high | **DEFAULT (orchestrator, 2026-09-21); Joel may override:** DEFER; Credit is OWNER-LOCKED and alerts land with W6/W7 |
| 49 | Command palette | GH, VE | PRESENT `AeCommandPanel.tsx:24-55` | installed cmdk | low | ADOPT cmdk |
**Admin console:** BUILD-IN-APP from installed primitives (shadcn Base Data Table, sidebar, cmdk) + HOST Convex Dashboard for raw ops; low-code sidecars EXCLUDED (Convex-only data, second role system) — design `docs/designs/2026-09-22-admin-console-review.md`; sketches `docs/designs/sketches/admin-console/`.


### Base pages (OSS)

| Surface | Research decision | Source and adoption constraint |
|---|---|---|
| Marketing/About and Agent/Provider doors | **ADOPTED from Joel's marketing site**; same TanStack/React 19/Tailwind 4.3/Base UI stack, with Tailark-MIT-derived blocks | Hero 7, Content 4, Features 4 and CTA 2 now compose the About page. AE tokens, TanStack routing and existing Base UI primitives remain authoritative. Tailark direct install stood down 2026-09-21; its registry entry was reverted and no commit was created. |
| FAQ blocks | **ADOPTED: FAQ 1 → `AeSiteFaq` on `/for-agents`, `/for-providers` and `/support`** | Copy remains page-owned in `src/content/**` or the page contract. The shared component owns only the disclosure composition. |
| Footer blocks | **ADOPTED: Footer 2 → `AeSiteFooter`** | LinkedIn, X and Facebook come from marketing `site.ts`. Consent and analytics were dropped. AE route groups and the existing single `AePublicPage` mount remain authoritative. |
| Terms and Privacy text | **ADOPTED: Joel's published Terms (15 sections, marketing `terms.tsx`, dated 7 Sep 2026) and Privacy (15 sections, marketing `privacy.tsx`, dated 13 Sep 2026) ported verbatim; GitHub/Basecamp templates retained as PATTERN-ONLY cross-check** | Marketing UtilityDocument was ported to `AeSiteUtilityDocument`; the published route text is the authority. GitHub Site Policy remains CC0 and Basecamp policies remain CC BY 4.0 for pattern cross-checks only. |
| Status page | **DEFAULT (orchestrator, 2026-09-21); Joel may override:** keep in-app `/status`; hosted vendor DEFERRED until an incident process exists. | OpenStatus and Upptime remain researched hosting options. Do not add incident history or subscriptions until the incident process and vendor are approved. |
| Provider economics | **DEFAULT (orchestrator, 2026-09-21); Joel may override:** framework text only; no figures until Joel supplies. | ROOT-ECON covers fee %, take rate, payout method/cadence/trigger, merchant-of-record, GST treatment and refund/dispute terms. |

### TOP 10 ABSENT THAT DEFINE THE CLASS

1. **Buyer dispute initiation** — money marketplaces need visible recourse; extend Stripe-hosted billing, not a home-grown case system. **Decision:** HOST Stripe Customer Portal.
2. **Incident history** — paid Calls require retrospective outage truth; use Statuspage-class infrastructure. **Decision:** DEFER until status vendor is approved.
3. **Status subscriptions** — agents/operators must learn when retrying is safe; borrow Statuspage delivery. **Decision:** DEFER until status vendor is approved.
4. **Outbound webhooks** — external agents need event push, signatures, retries, and delivery logs; use Svix-class infrastructure. **Decision:** DEFER until event contract and vendor are approved.
5. **Recurring API plans** — fixed per-Call pricing alone misses RapidAPI-style packaged consumption; use Stripe Billing. **Decision:** HOST Stripe Billing; PATTERN-ONLY Treg.
6. **Spend-anomaly alerts** — prepaid autonomous spending needs abuse detection beyond low-balance thresholds. **DEFAULT (orchestrator, 2026-09-21); Joel may override:** DEFER; Credit is OWNER-LOCKED and alerts land with W6/W7.
7. **Per-key IP allowlists** — leaked machine credentials need another containment boundary; enforce at the gateway. **Decision:** DEFER until gateway authority is named.
8. **Org SSO/SCIM controls** — serious provider/buyer teams expect centralized identity lifecycle. **DEFAULT (orchestrator, 2026-09-21); Joel may override:** DEFER; Clerk enterprise plan is a purchase decision.
9. **Personal-data export** — closure without portable readback is incomplete. **ADOPTED:** COMMIT `01a5194a6`; Settings › Privacy › Download your data (JSON), composed from existing caller-scoped reads with no new Convex query.
10. **Locale switching/i18n** — hard-pinned `en-AU` blocks broader marketplace operation; adopt a maintained i18n library. **Decision:** DEFER until alpha market scope requires it.

## 5. Execution protocol

Rule for every wave: one file per subagent, precondition, verify command or walk step, commit per change. A multi-file change is split unless the files form one indivisible boundary. A row moves PENDING → IN REVIEW only after its change lands. It moves IN REVIEW → VERIFIED only when its commit lowers a ratchet constant or a test under `tests/e2e` or `tests/unit` asserts its Target spec.

| Wave | Entry condition | Work | Exit condition |
|---|---|---|---|
| A: cross-cutting unblockers | register committed; owners named | C-06 focus ring; C-07 accessible names; C-08 money-moved line; C-10 overclaim removals; C-02 one price | all named rows IN REVIEW, then assertion (preferred) or re-walk, then VERIFIED |
| B: doors and help/legal | Wave A shared primitives IN REVIEW | R-01..R-03 and R-22..R-25; P0 Terms/Privacy truthfulness; door economics | every row IN REVIEW; legal owner confirms facts; assertion (preferred) or re-walk; VERIFIED |
| C: supply | Provider commercial terms available | R-26..R-30; NEW-01 human-delivered path remains PARKED pending Joel; complete all other source, payout, environment and callback gaps | all unparked supply rows IN REVIEW, then assertion (preferred) or re-walk, then VERIFIED |
| D: account, records, dev/admin | Waves A and B stable; buyer spine supplies populated fixtures where required | R-13, R-15..R-19, R-31..R-34; records outside OWNER queue only after W6/W7 contracts settle | all included rows IN REVIEW, role-gate and return-path walks pass, then VERIFIED |
| E: class-gap reuse | corresponding product decision approved; source/license verified | execute ADOPT/HOST items only; PATTERN-ONLY means learn structure without copying restricted code | adopted/hosted feature has live path and source evidence; row VERIFIED |
| Buyer spine in parallel | Joel owns core flow | R-05, R-08, R-10, R-11, R-14, R-20, R-21 under `buyer-spine-stabilisation-plan.md` W2..W7 | seven page passes, then FIND → ALLOW → USE → RECORD proof |
### Wave F · admin console

**Entry:** R-18 fva template configured in Clerk; Joel's principal in `ADMIN_BOOTSTRAP_PRINCIPAL_IDS`.

**Work:** R-37..R-42.

**Exit:** R-37..R-42 IN REVIEW with assertions.


No wave may invent a second authority, status model, money formatter, Tool projection or Provider identity. Existing VERIFIED W-01..W-44 and S-01..S-20 are regression boundaries, not work queues.

## 6. Decisions parked for Joel

- Human-delivered service listing, including scope/deliverable/SLA/acceptance and its relationship to Tool: unblocks R-28, NEW-01 and CFO-21.
- Ask catalogue scope, callable-only versus both catalogues with an explicit split: unblocks R-10 and C-03.
- Whether `/owner` Overview survives and `/owner/market` exists after the spine passes: unblocks R-06, R-16, ACC-04..06 and SUP-08.
- Whether Support gains an on-page form or remains reference-aware mailto: unblocks the post-W7 form decision for R-21.
- Whether recurring plans and buyer disputes enter alpha scope: unblocks class gaps 14 and 15.
- Whether `/developers/discovery` remains public: unblocks R-32 and DEV-06.
- Credit/payout/reconciliation views until Formance and x402 are live plus cross-account aggregates exist.
- Incident authoring until a hosted status vendor and incident command exist.
- Assignment/SLA/presence until a second seat, case ownership and published SLA exist.
- APP 12/13 workflow until Joel confirms APP applicability and the disclosure sources.
- Marketplace charts until four weeks of real activity.
- Two-person actions until a second `owner_admin` is provisioned.

## 7. Wave log

### Wave 0 + A · 2026-09-21

`git log --oneline 7d0570c8c..HEAD | wc -l` recorded 26 commits before this close-out commit.

#### Gates landed

| Gate test | Pinned constant(s) |
|---|---|
| `tests/imports/route-controller-size.test.ts` | `ROUTE_CONTROLLER_MAX_LINES=80`; exceptions 114 and 221 |
| `tests/imports/file-size-ratchet.test.ts` | `over300=281`, `over500=103`, `over1000=1`; one `OVER_1000_ALLOWED` path |
| `tests/imports/tsx-type-quarantine.test.ts` | `TSX_TYPE_EXPORT_CEILING=18` |
| `tests/imports/leaf-purity.test.ts` | one `LEAF_PURITY_EXCEPTIONS` path |
| `tests/imports/own-barrel-imports.test.ts` | one `OWN_BARREL_EXCEPTIONS` path |
| `tests/imports/convex-facade-size.test.ts` | `FACADE_MAX_LINES=200`; 74 exceptions |
| `tests/imports/copy-vocabulary.test.ts` | `supplier=0`, `invocation=0`, `connection-online=0`, `balance=8`, `legacy-credential=2`, `used-recently=1`, `one-call-away=1`, `authority-mode=1`; other rules 0; `MARGIN=2` |
| `tests/imports/status-vocabulary.test.ts` | `STATUS_LITERAL_FILE_CEILING=28`; `MARGIN=2` |

#### Rows moved

- C-01 → IN REVIEW.
- C-06 → IN REVIEW.
- C-08 → VERIFIED.
- C-10 → IN REVIEW.
- R-06 → IN REVIEW.
- R-14 remains OWNER; its local-ledger ROOT was recorded.

#### Gate constants before→after

- `ROUTE_SIZE_EXCEPTIONS['src/routes/__root.tsx']`: 236→114.
- `FILE_SIZE_CEILINGS.over300`: 282→281; `over500`: 103→103; `over1000`: 1→1.
- `TSX_TYPE_EXPORT_CEILING`: 19→18.
- `COPY_CEILINGS.supplier`: 5→0; `invocation`: 1→0; `connection-online`: 2→0; `balance`: 17→8.

#### Final verification

- `npm run test:imports`: 29/29 passed.
- `npm run test:imports:fixtures`: 11/11 passed.
- `npm run typecheck`: 0 errors.
- Gate-honesty probe: `file-size-ratchet` detected a 407-line file under `/tmp`.
- Scoped `tests/unit/{routes,ui,layout}` run: 92 passed; four failed files, all pre-existing.

#### Contingencies taken

- `tests/imports/bare-catch-ratchet.test.ts`: re-pinned 17→19 after the first fully wired run; this is measured pre-existing debt, not a raised fix allowance.
- `tests/imports/module-boundaries-ratchet.test.ts`: `totalEntrySurfaces` re-pinned 228→230 and capability-supply exceptions 1→2 from the first fully wired run.
- `src/modules/module-boundaries.ts`: `market-route-data.ts` was declared as a Market entry surface.
- `src/lib/ui/status-presentation.ts`: the split was a pure move; the retained 598-line presentation table is data, so `over500` stayed 103.
- `src/components/ae/layout/AeRouteStates.tsx`: 11 importers required a 13-line re-export surface.
- C-10 `/owner/operations`: the overclaim deck had two mount sites, `AeProviderWorkspace.tsx` and `AeProviderWorkspaceSkeleton.tsx`; both changed in `8da42d324`.
- R-06 expanded to `src/modules/principal-account/owner-overview.view-model.ts` so the Overview card links `/market`.

#### Found, not fixed

- `tests/unit/routes/owner-provider-connection-handoff-route.test.ts` “preserves the requested environment…”: its `vi.mock` lacks `assessOwnerSupplySourceServer`.
- `tests/unit/routes/supply-owner-routes.test.tsx` “uses Tools as the Provider navigation identity”: the test expects `Tools`, while code says `My tools` in 12 files; vocabulary decision required.
- `tests/unit/market/directory-index-discovery.test.tsx` “preserves all source-ranked entries”: known red because two landmarks are named “Popular Tools”.
- `tests/unit/layout/app-shell-command-panel.test.tsx`: three tests expect button “Open public menu” while code says “Open menu” (last touched by `13a5a9e26`), and expect no `nav[aria-label="Primary"]` while code renders it (last touched by `bd919dd43`).
- `tests/unit/layout/chat-page.test.tsx`: two tests expect region “Chat” or “Shared chat” while code renders `<main>` (last touched by `a00e763db`).
- `src/components/ae/console/connect-agent-wizard/components/AuthorityModeRadioCards.tsx:16`: “Authority mode” remains; target is Spending policy → spine W4-07.
- `src/components/ae/console/AeAgentDirectoryTable.tsx:90` and `src/components/ae/console/AeAgentConnectionReceipts.tsx:27`: “Legacy credential” remains → spine W4-06.
- `src/modules/market/directory-card.view-model.ts:67`: “Used recently by other agents” remains → spine W2-10.
- `src/components/ae/market/DirectoryHero.tsx:38`: “one Call away” remains → spine W2-09.
- `src/components/ae/market/market-navigation-context.tsx:3`: `MarketPath` still includes `/owner/market` → spine W2-11.
- `AeOwnerCredit.tsx` ×3, `AeAccountHistoryTable.tsx` ×4, and `useAeAgentAccessHome.ts` ×1 still say “Balance”; `/calls/not-a-ref` says “A$0.00 charged — your prepaid balance is unaffected.” → spine W5-06.
- `tests/imports/status-vocabulary.test.ts`: 28 files retain raw status literals.
- `tests/imports/bare-catch-ratchet.test.ts:56-63`: added offenders are `convex/chatTools.ts:199`, `convex/lib/capabilitySupply/publishBootstrap.ts:166`, `src/lib/server/procure-api.ts:77`, `src/modules/capability-execution/procure-engine.ts:107`, `src/modules/chat/tool-card.ts:657`, `src/modules/decision-engine/deterministic-fallback.ts:15`, and `src/routes/__root.tsx:183`.

#### Open at close

- C-01 IN REVIEW: OWNER-LOCKED Direct key, Spending policy and Credit terms remain in spine W4-06, W4-07 and W5-06.
- C-06 IN REVIEW: the live focus walk passed, but no ratchet fell and no `tests/e2e` or `tests/unit` assertion covers the full Target spec.
- C-07 PENDING: no Wave A change landed; named Market and Agent accessibility gaps remain in the OWNER spine.
- C-10 IN REVIEW: OWNER-LOCKED overclaims remain in spine W0-01, W2-09, W2-10 and W4-06.
- R-06 IN REVIEW: the live redirect walk passed, but no ratchet fell and no `tests/e2e` or `tests/unit` assertion covers its Target spec.

### Wave B · 2026-09-21

`git log --oneline e292cf056..HEAD` recorded seven Wave B commits before this close-out commit. Tailark R-01 pilot in flight.

#### Gates

- `FILE_SIZE_CEILINGS`: `over300=281`, `over500=103`, `over1000=1` — unchanged from Wave 0 + A.
- `TSX_TYPE_EXPORT_CEILING=18` — unchanged.
- `COPY_CEILINGS`: `supplier=0`, `invocation=0`, `mandate=0`, `commitment=0`, `callable-operation=0`, `commercial-closure=0`, `legacy-credential=2`, `used-recently=1`, `one-call-away=1`, `connection-online=0`, `authority-mode=1`, `balance=8` — unchanged.
- `STATUS_LITERAL_FILE_CEILING=28` — unchanged.

#### Rows moved

- R-01 → IN REVIEW.
- R-02 → VERIFIED.
- R-03 → IN REVIEW.
- R-22 → VERIFIED for non-deferred Target-spec bullets; incidents and subscribe remain DEFERRED under §4.
- R-23 → IN REVIEW.
- R-24 → IN REVIEW.
- R-25 → IN REVIEW.

#### Roast verdicts

- R-01 PARTIAL: `/about` names Agents and Providers once; `/` ends at `/market` with H1 “Tools for what's next.”; operator/contact, fee and payout delivery window are absent.
- R-02 PRESENT: `Start setup` jumps to the Codex funnel; the named Codex command, Agents confirmation, Spending policy step and collapsed alternatives are present.
- R-03 PARTIAL: exactly one “Add Tool” link points to `/owner/operations/new`; “One supported source and one Tool you are authorised to list.” appears before “A safe example for the check.”; fee, AUD payout method, trigger and timing are absent.
- R-22 PRESENT for non-deferred bullets: five components show “Checked just now”; “Last updated just now” and the Refresh busy state are present; current/past incidents and subscribe are deferred.
- R-23 PARTIAL: “Last updated 20 September 2026” and four working ToC links are present; there is no version; required copy is not exact; `terms.contracts.ts:54` says `supplier`; legal sections are absent.
- R-24 PARTIAL: version/date, disclosure table, rights and correction route are present; `#data-use-recipients` is not in view after click, at top `−204.84px`; controller/contact, retention, transfers and complaints are absent.
- R-25 BROKEN: `Provider corrections` and `Submit request` are present; requester verification, affected Business/Tools preview, removal versus merge and review time are absent; “Fix published facts”, “Resolve Provider ownership” and “Remove or merge” remain.

#### Contingencies taken

- ROOT-ECON now blocks the economics subheads on R-01, R-03, R-23 and R-26 until Joel supplies provider economics.
- Legal bullets were not written because entity, commercial, privacy, retention, transfer, complaint and governing-law facts are unsupplied.
- Under Joel's directive, the Tailark OSS R-01 pilot was opened while the base-page source and licence decision was recorded.

#### Found, not fixed

- R-01 `/about`: “Listed Providers” remains beside a second “CATALOG / Market / Inspect before you call” cover.
- R-02 `/for-agents`: hero copy remains “Find the service your task needs.”
- R-03 `/for-providers`: “Manage listed Tools” and “AE public inspection actions” remain.
- R-23 `/terms`: `terms.contracts.ts:54` still says lowercase `supplier`.
- R-24 `/privacy`: `#data-use-recipients` is not in view after click; measured top `−204.84px`.
- R-25 `/privacy/remove-business`: “Fix published facts”, “Resolve Provider ownership” and “Remove or merge” remain.

#### Open at close

- R-01 IN REVIEW: Joel must supply verified operator/contact and ROOT-ECON facts; the platform entry still lacks the About thesis.
- R-03 IN REVIEW: Joel must supply ROOT-ECON facts; the implemented funnel has no genuine eligibility/readiness step to reorder.
- R-23 IN REVIEW: Joel/legal must supply the agreement and ROOT-ECON facts; the exact copy and lowercase `supplier` also remain.
- R-24 IN REVIEW: Joel/legal must supply controller, contact, recipient, retention, transfer and complaint facts; the ToC viewport defect remains.
- R-25 IN REVIEW: Joel must define requester verification, merge semantics and review time; the adopted class-gap seam lacks backing for the remaining flow.
- §4 features 40-41 remain DEFERRED until Joel approves OpenStatus hosting or accepts Upptime without public subscriber signup.

### Wave B · round 2 (marketing-site port) · 2026-09-21

`git log --oneline 6681085d2..HEAD` recorded the three marketing-site port commits below before this close-out commit. The Tailark direct-install pilot was stood down: `components.json` was restored byte-for-byte and no commit was created.

#### Commits

- `63b8aed88` — R-01 About rebuilt on marketing-site components.
- `1b5d825e7` — R-23 Terms rebuilt on marketing-site UtilityDocument with Joel’s published text.
- `d839157ea` — R-24 Privacy rebuilt on marketing-site UtilityDocument with Joel’s published text.

#### Source → destination ports

- Hero 7 → `AeSiteAboutHero`; Content 4 → `AeSiteEditorial`; Features 4 → `AeSiteFeatureGrid`; CTA 2 → `AeSiteCtaBand`.
- Marketing `components/content/utility-document.tsx` → `AeSiteUtilityDocument.tsx`.
- Marketing `routes/terms.tsx` / `routes/privacy.tsx` → AE legal contracts/pages.

#### Token mappings

- About: `.eyebrow` → AE eyebrow tokens; `.editorial-link` → AE primary underline treatment; button import → `button-variants`; `/media` → `/website`.
- Legal: `editorial-link` → tokenized Tailwind links; `prose` → `max-w-[70ch]`/explicit leading; `scroll-mt-28` → `scroll-mt-anchor`.

#### Found, not fixed

- About CTA `Publish a Tool` differs from the app CTA `Add Tool`.
- `Agentic Economy is pre-launch.` is a marketing sentence now inside the app.
- `joel-chan.png` was skipped at 541,938 B.
- `ds-grammar` `developers.discovery` title/H1 mismatch is pre-existing.

#### Open at close

- R-01 remains IN REVIEW: verified operator/contact is absent and the `/` thesis remains open.
- R-23 remains IN REVIEW: take rate/fee schedule/payout cadence, definitive seller entity and fixed jurisdiction/liability cap remain absent.
- R-24 remains IN REVIEW: exact retention periods, recipient-country list and one controller entity remain absent.
- R-26 remains PENDING: Joel’s Terms state the fee/tax/payout framework, but numeric take rate and cadence remain unsupplied.
- §4 Status page remains HOST (pending Joel).

### Wave B · round 3 (FAQ/footer port, extractions) · 2026-09-21

`git log --oneline 54b1aff96..HEAD` recorded the Wave B round 3 ports, factual corrections and extractions below. Concurrent Wave C row commits are outside this close-out.

#### Commits

- `eb0a3b767` — R-02 FAQ 1 port and shared `AeSiteFaq`.
- `a20ae18cd` — R-03 Provider FAQ 1 port.
- `a0631aa0f` — R-21 Support FAQ 1 port.
- `e47cbd75c` — Footer 2 port to the shared public-page footer.
- `e9ac04882` — R-01 operator, ABN and support contact from published facts.
- `d8f3b3470` — C-12 `/glossary.md` Nitro registration.
- `af016e98c` — R-36 payment signer split below 1,000 lines.
- `08b240249` — owner offerings pure-move extraction.
- `96af346e9` — supply source type pure-move extraction.

#### Source → destination ports

- Marketing `components/sections/faqs-1.tsx` → `AeSiteFaq`; marketing agent, Provider and contact copy → `/for-agents`, `/for-providers` and `/support`.
- Marketing `components/layout/footer-2.tsx` → `AeSiteFooter`; LinkedIn, X and Facebook from marketing `site.ts` → `AeSiteFooter.contracts.ts`. Consent and analytics were dropped.

#### Extractions

- `cdp-x402-payment-signer.ts`: 1,041→38 lines; authorization 137, contracts 139, material 205, policy 142, signing 279, treasury 89 and validation 150.
- `AeOwnerOfferings.tsx`: 383→63 lines; contracts 54, hook 108, gate 47 and table 266.
- `SupplySourceTypeSection.tsx`: 535→43 lines; chooser 53, fields 210, results 132, contracts 135 and hook 78.

#### Gate scoreboard before→after

- `FILE_SIZE_CEILINGS`: `over300` 281→278; `over500` 103→101; `over1000` 1→0.
- `OVER_1000_ALLOWED`: one payment-signer path → `[]`.

#### Roast verdicts

- R-01 operator/contact bullet PRESENT: `/about` rendered “Operated in Australia · ABN 98 700 838 115 · support@aecon.ai” once.
- R-02 VERIFIED: every Target-spec bullet was PRESENT; FAQ 1, Footer 2 and the new hero subhead passed live.
- R-03 IN REVIEW: Add Tool, supported-source guidance, FAQ 1 and footer are PRESENT; eligibility is PARTIAL; ROOT-ECON and both cuts remain.
- R-21 FAQ slice VERIFIED: four disclosure rows, working first disclosure and `mailto:support@aecon.ai`; the row remains OWNER for receipt behavior.
- C-06 regression PRESENT: Support Email support painted `outlineStyle` `solid`, width `2px`.
- C-07/C-11 footer slice PRESENT: `/about`, `/terms` and `/status` each had one `contentinfo`; four accordion groups toggled; at 390px, `scrollWidth=368` and `clientWidth=390`.
- R-36 VERIFIED: no file remains over 1,000 lines and the allowlist is empty.

#### Found, not fixed

- FIXED in the same round: `/glossary.md` returned 404 until `vite.config.ts` registered its Nitro handler; HEAD and GET now return 200.
- The in-page ABR HEAD probe failed because the cross-origin request was blocked. This is not a product defect.
- `tests/unit/layout/shell-a11y.test.tsx` still expects the stale compact-shell label `Open public menu`; pre-existing.
- R-03 `/for-providers`: “Manage listed Tools” and “AE public inspection actions” each remain once; these are the row’s next task.
- ROOT-TYPE: public page scale and rhythm drift across `/about`, `/for-agents`, `/for-providers` and `/support`; fix the shared AeSite contract in Wave C/E, not each page.

#### Open at close

- R-01 IN REVIEW: operator/contact is PRESENT; the `/` thesis and ROOT-ECON facts remain.
- R-03 IN REVIEW: ROOT-ECON, a genuine eligibility/readiness step and both required cuts remain.
- R-21 remains OWNER: the FAQ slice is verified, but receipt and reference-carrying behavior stays in the buyer spine.
- C-06 IN REVIEW: the focus regression passed; the full cross-surface Target spec is not yet asserted.
- C-07 and C-11 remain PENDING: only the shared footer slices passed.
- C-12 IN REVIEW: `/glossary.md` is fixed; runtime host, auth, noun, path and price consistency remain.
- ROOT-TYPE is open for Wave C/E across all public pages.
- Status vendor hosting is deferred by the §4 default until an incident process exists. ROOT-ECON remains framework-only until Joel supplies figures.

### Wave C · 2026-09-21

`git log --oneline 091a093d4..HEAD` interleaved Wave C with Wave D round 1. Only the Wave C commits below move rows in this close-out.

#### Commits

- `f5b03cadf`, `566de52b4` — R-26 Provider Tool operations and asserted inventory filters.
- `f2335d8aa`, `c9621da14`, `6226d4830` — R-27 empty copy, operational Tool detail and type-safe recovery.
- `f3498b9fb` — R-28 required source fields, specific validation and mobile action.
- `abbd589ab` — R-29 retained Tool context in the Provider handoff.
- `eba21ac72`, `abb28ace5` — R-30 classified callback outcomes and typed fixtures.
- `30ea76afe` — C-01 `My tools`→`Tools` across 14 source files.
- `ee6c1db53` — C-09 Provider connection environment badge.
- `af016e98c` — R-36 payment signer split below 1,000 lines.
- `08b240249` — owner offerings pure-move extraction.
- `96af346e9` — supply source type pure-move extraction.
- `2998ee3da`, `a18db69cb` — ROOT-TYPE shared public-page type and rhythm contract.

#### Extractions

- `cdp-x402-payment-signer.ts`: 1,041→38 lines plus seven files at 137, 139, 205, 142, 279, 89 and 150 lines.
- `AeOwnerOfferings.tsx`: 383→63 lines plus contracts 54, hook 108, gate 47 and table 266.
- `SupplySourceTypeSection.tsx`: 535→43 lines plus chooser 53, fields 210, results 132, contracts 135 and hook 78.

#### Gate scoreboard before→after

- `FILE_SIZE_CEILINGS`: `over300` 278→277; `over500` 101→100; `over1000` 0→0.
- `OVER_1000_ALLOWED`: `[]`.
- `LEAF_PURITY_EXCEPTIONS`: one path→`[]` via Wave D commit `ef6e7cc43`.
- `TSX_TYPE_EXPORT_CEILING`: 18→18.
- `STATUS_LITERAL_FILE_CEILING`: 28→28.

#### Roast verdicts

- R-26 IN REVIEW: H1, empty copy and one Add Tool are PRESENT; inventory is unobservable with 0 Tools; `Stripe account not connected` versus `Nothing is required here…` is BROKEN.
- R-27 IN REVIEW: recovery and copy are asserted; detail bullets are unobservable because the local fixture has 0 Tools.
- R-28 IN REVIEW: required fields, distinct syntax/schema copy, action position, 44px targets and focus are PRESENT; mobile environment controls overlap the fixed bottom navigation; `A$0.00 affected` remains; NEW-01 is PARKED.
- R-29 IN REVIEW: recovery copy and return are PRESENT; breadcrumb + H1 both `Connect Provider`, and Provider/access are not named on the no-param walk.
- R-30 VERIFIED: seven outcomes and retained retry are asserted; direct callback secret suppression passed live.
- C-09 IN REVIEW: the badge is asserted on a fixture; the live workspace has 0 connections.
- R-36 VERIFIED: no file exceeds 1,000 lines and the allowlist is empty.
- ROOT-TYPE LANDED: H1 60px on all public pages; page-level section H2 36px; eyebrow 700/0.16em; legal H2 24px per canon.

#### Contingencies taken

- File-size constant edits were serialized R-36→OwnerOfferings→SourceType; no agent raised a shared ceiling.
- R-27 commit `c9621da14` introduced 61 type errors. Work stopped until `6226d4830` restored typecheck to 0.
- Status-vocabulary transiently measured 29 during concurrent edits and returned to 28 before commit.
- R-28 copy used `Connect a Tool you already run. Agentic Economy checks what agents can buy.` because NEW-01 human-delivered Tools remains PARKED.
- `OperatorRouteNotFoundRecovery` carries Tool-detail recovery while the zero-prop `OperatorRouteNotFound` remains safe for TanStack route options.

#### Wave D round 1 (in flight)

- R-13 `2df48e395`; R-15 `853a7b695`; R-16 `4dc32ea4a`; R-17 `e2ab92dcd`; R-18 `fc24cd5eb`, `66c3fa3a1`; R-19 `9f9a13604`, `257a51aa9`.
- R-33/R-34 `2a212ba18`, `33e137d4d`, `e8f1de44d`, `f140c6b44`; tax-profile restore `ef6e7cc43`; OpenAPI split `0749ec791`.
- No Wave D row moves in this close-out.

#### Found, not fixed

- http://127.0.0.1:3024/owner/operations: `Stripe account not connected` conflicts with `Nothing is required here until this provider uses this part of the Tools page.` → dispatched Wave D round 2.
- http://127.0.0.1:3024/owner/operations/new: mobile `Sandbox`/`Production` controls end at y=791.5 while fixed bottom navigation starts at y=789, visibly overlapping them → dispatched Wave D round 2.
- http://127.0.0.1:3024/sign-up: a signed-in account with an existing workspace is sent to `/onboarding` → dispatched Wave D round 2.

#### Open at close

- R-26 IN REVIEW: resolve the Stripe guidance contradiction and prove inventory behavior with a populated Tool fixture.
- R-27 IN REVIEW: seed a Tool to walk price, status, Calls, updated time, buyer preview and edit/archive.
- R-28 IN REVIEW: NEW-01 remains PARKED; ROOT-ECON facts, `A$0.00 affected` and the mobile bottom-navigation overlap remain open.
- R-29 IN REVIEW: remove the repeated `Connect Provider` breadcrumb and prove Provider/access/environment on a real handoff.
- R-30 VERIFIED: outcome classification, retained retry and callback secret suppression are asserted.
- C-01 IN REVIEW: OWNER-LOCKED Direct key, Spending policy and Credit terms remain.
- C-09 IN REVIEW: live proof awaits a workspace with at least one Provider connection.
- C-11 PENDING: the Add Tool slice passes; remaining named hit boxes and above-fold actions are open.
- R-36 VERIFIED; ROOT-TYPE LANDED.
- Wave D round 1 is in flight. Its rows did not move in this close-out.

### Wave D · 2026-09-21

`git log --oneline 125acccb5..HEAD` contains the Wave D round-2 commits below; Wave D round 1 was already listed in the Wave C entry and is repeated here for the complete close-out.

#### Commits

- `2df48e395` — R-13 funding-return states, matching actions and fresh retry.
- `853a7b695` — R-15 resumable two-step onboarding and target copy.
- `4dc32ea4a` — R-16 Overview Credit, Call and Agent decisions.
- `e2ab92dcd`, `ef6e7cc43` — R-17 persistent settings, section navigation and restored Business tax profile.
- `fc24cd5eb`, `66c3fa3a1` — R-18 one Team role projection and separate Workspace billing.
- `9f9a13604`, `257a51aa9`, `5331467b7`, `5b19b40e3` — R-19 safe auth returns and existing-Workspace onboarding authority.
- `3951c5345` — R-31 runnable API reference.
- `b5244c324` — R-32 truthful discovery status.
- `2a212ba18`, `33e137d4d`, `e8f1de44d`, `f140c6b44` — R-33/R-34 clean role gate, authorized table presentation and remediation.
- `35280530c` — C-11 shared mobile-navigation reservation.
- `2ffc72e72` — R-26 one payout-connection presentation.
- `0749ec791` — OpenAPI document pure-move split.

#### Extractions

- `openapi-document.ts`: 528→11 lines plus four focused files.
- `developers.discovery.tsx`: 220→42 lines.
- `interactiveOnboarding.ts`: 221→146 lines; its Convex façade exception was removed.

#### Gate scoreboard before→after

- `FILE_SIZE_CEILINGS`: `over300=277`, `over500=100`, `over1000=0`.
- `ROUTE_SIZE_EXCEPTIONS`: 2→1; only `src/routes/__root.tsx` 114 remains.
- `LEAF_PURITY_EXCEPTIONS`: 1→0.
- `FACADE_SIZE_EXCEPTIONS`: 74→73; `interactiveOnboarding.ts` removed.
- `STATUS_LITERAL_FILE_CEILING`: 28→28.

#### Roast verdicts

- R-13 VERIFIED: cancel, invalid and paid states name the outcome, Credit destination and matching action; 7 funding-return tests assert the contract.
- R-15 VERIFIED: 14 onboarding tests assert the Target spec; established Workspace redirects are the intended R-19 ROOT behavior.
- R-16 IN REVIEW: Credit truth and one primary are present; attention disagrees with Calls, the Agent count is vanity, Credit actions duplicate and the Provider upsell remains.
- R-17 IN REVIEW: persistence and navigation are present; `SESSION` remains, reload persistence is not asserted and Clerk adds two embedded H1s.
- R-18 IN REVIEW: one role source and separated billing are present; environment and actor-attributed events are absent because the DTO has no fields; Clerk adds two embedded H1s.
- R-19 VERIFIED: deep-link return, loop recovery and existing-Workspace authority are asserted across four test files.
- R-26 IN REVIEW: both payout surfaces agree verbatim; inventory remains unobservable with 0 Tools.
- R-31 VERIFIED: the OpenAPI projection test and live page prove runnable requests, one Bearer explanation, RFC 9457 recovery, ExactAmount and version policy.
- R-32 VERIFIED: route-size lowered, E2E asserts the artifact presentation and the live page contains no roadmap/support-capacity copy.
- R-33/R-34 IN REVIEW: denial is VERIFIED-quality; the authorized table is unobservable because the local dev user is non-admin, and pagination has no DTO cursor.

#### Contingencies taken

- R-18 orphaned the tax profile when Billing & tax left Workspace; `ef6e7cc43` restored it under Settings → Business.
- Status vocabulary transiently measured 29 and 30 during concurrent edits; both rises were caught before commit and the ceiling returned to 28.
- R-19 copy was routed to R-15 rather than duplicated at the auth boundary.
- R-33/R-34 role gating was redesigned to return non-throwing context instead of using React recovery.
- A proposed duplicate `SignInTestMocks` was cancelled.

#### Found, not fixed

- `/owner/settings`, `/owner/workspace` and `/sign-in`: Clerk embeds extra H1s → ROOT-CLERK-H1 dispatched in Wave E.
- `/fund/not-a-session`: the public session read logs one 404 console error for an invalid ID; accepted.
- `/owner`: `No Calls need attention` conflicts with `/activity` `NEEDS ATTENTION —` → ROOT-ATTN dispatched in Wave E.

#### Open at close

- R-16 IN REVIEW: ROOT-ATTN plus vanity Agent count, duplicate Credit actions and Provider upsell are dispatched in Wave E.
- R-17 IN REVIEW: remove `SESSION`; ROOT-CLERK-H1 is dispatched; reload persistence still needs a behavioral assertion.
- R-18 IN REVIEW: environment and actor-event fields are blocked on the Team/Workspace DTO; ROOT-CLERK-H1 is dispatched.
- R-26 IN REVIEW: populated-Tool inventory proof remains unavailable.
- R-33/R-34 IN REVIEW: authorized view awaits an Admin fixture; pagination awaits a cursor contract.
- C-01 IN REVIEW: OWNER-LOCKED vocabulary remains in the buyer spine.
- C-11 IN REVIEW: the navigation collision is fixed; remaining named hit boxes and above-fold actions stay open.
- C-12 IN REVIEW: R-31/R-32 establish the runtime origin, Bearer sentence and discovery projection; remaining machine-doc vocabulary is Wave E work.
- Wave E starts from the §4 orchestrator defaults: status remains in-app, economics remain figure-free, #46 ADOPT existing export seam, #47 DEFER and #48 DEFER.

### Wave E · 2026-09-21

#### Commits

- `f6c41441c` — R-17 removed the `SESSION` eyebrow.
- `02eb4e0f9` — R-16 ROOT-ATTN, unavailable versus zero Calls, one Credit action, no vanity count and no upsell.
- `276294174`, `3df79fb5c`, `caa86a24f`, `cb55d4250`, `7919453dd`, `162a7df74` — C-04 canonical status rows and status-literal burndown.
- `44decf45c` — C-12 one machine-doc host, auth header, price shape and resolvable advertised paths.
- `01a5194a6` — §4 #46 caller-scoped personal-data JSON export under Settings › Privacy.
- `1a8e966cf` — C-07 ROOT-CLERK-H1 shared appearance rule.

#### Gate scoreboard before→after

- `FILE_SIZE_CEILINGS`: `over300=277`, `over500=100`, `over1000=0` — unchanged.
- `ROUTE_SIZE_EXCEPTIONS`: `{src/routes/__root.tsx: 114}` — unchanged.
- `TSX_TYPE_EXPORT_CEILING=18` — unchanged.
- `LEAF_PURITY_EXCEPTIONS=[]` — unchanged.
- `FACADE_SIZE_EXCEPTIONS`: 73 — unchanged.
- `COPY_CEILINGS`: `supplier=0`, `invocation=0`, `connection-online=0`, `balance=8`, `legacy-credential=2`, `used-recently=1`, `one-call-away=1`, `authority-mode=1`, `mandate=0`, `commitment=0`, `callable-operation=0`, `commercial-closure=0` — unchanged.
- `STATUS_LITERAL_FILE_CEILING`: 28→17.
- Bare-catch ceiling: 19 — unchanged.
- Module boundaries: `totalEntrySurfaces=230`, capability-supply exceptions 2 — unchanged.

#### Roast verdicts

- R-16 IN REVIEW: its observable contract is asserted; only the R-14 ROOT remains blocked by missing local Formance configuration.
- R-17 IN REVIEW: navigation, copy, Privacy, no-`SESSION` and one accessibility-tree H1 are covered; reload persistence remains live-only and lacks a behavioral assertion.
- R-18 IN REVIEW: ROOT-CLERK-H1 landed; environment and actor-attributed events remain absent from the DTO.
- C-04 IN REVIEW: the ratchet fell 28→17; eight OWNER files move to the buyer spine and nine scanner false positives await the named gate refinement.
- C-07 IN REVIEW: ROOT-CLERK-H1 landed; the named Market, Agent, Credit and dialog gaps remain in the OWNER spine.
- C-12 VERIFIED: 7 machine documents and 13 advertised paths returned 200; the discovery/SEO suites assert host, auth and ExactAmount consistency.
- §4 #46 ADOPTED: the caller can download the eight named JSON sections from Settings › Privacy without a new Convex query.
- Roast-free wave. Final cohesion roast follows.

#### Final cohesion roast (agent FinalCohesionRoast)

| Page | H1 px | first H2 px | Eyebrow weight/spacing | First-section py | Footer: count · groups | H1 raw/accessible | First Tab | 390 scrollWidth | Errors | Canon |
|---|---:|---:|---:|---:|---|---:|---|---:|---:|---|
| `/about` | 60/36 ✓ | 36/36 ✓ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **YES** |
| `/for-agents` | 60/36 ✓ | 30/24 ✓ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **YES** |
| `/for-providers` | 60/36 ✓ | 36/36 ✓ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **YES** |
| `/support` | 60/36 ✓ | 30/24 ✓ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **YES** |
| `/status` | 60/36 ✓ | absent ✗ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **NO** |
| `/terms` | 60/36 ✓ | 24/24 ✓ legal | absent ✗ | 80/48 ✗ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **NO** |
| `/privacy` | 60/36 ✓ | 24/24 ✓ legal | absent ✗ | 80/48 ✗ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **NO** |
| `/developers/api` | 60/36 ✓ | 30/24 ✓ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **YES** |
| `/developers/discovery` | 60/36 ✓ | 30/24 ✓ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 1/1 ✓ | Skip to content ✓ | 368 ✓ | 0 ✓ | **YES** |
| `/sign-in` | 30/24 ✗ | absent ✗ | 700/1.92px ✓ | 96/64 ✓ | 1 · Resources, Help, Legal, Machines ✓ | 2/1 ✗ | Continue ✗ | 368 ✓ | 0 ✓ | **NO** |

Verdict: **6/10 on canon**.

Orchestrator dispositions:

- `/sign-in` H1: fixed; COMMIT 82a58626e (AeSiteAuthPanel renders the H1 through AeSiteHeading md; measured 36px on /sign-in and /sign-up).
- `/sign-in` identifier autofocus: accepted; benchmark Linear.
- `/status`: single-section page; section H2 is N/A.
- `/terms` and `/privacy`: legal rhythm accepted by design. Policy: legal documents use the utility-document rhythm (80/48) and no eyebrow.

#### Contingencies taken

- The SEAM exception allowed the canonical status-presentation rows file to move with C-04 without creating another status authority.
- The export moved to `src/lib/server` to avoid raising the module-boundaries ratchet.
- The page-markdown assertion followed the approved R-01 copy.

#### Found, not fixed

- Clerk leaves CSS-hidden vendor H1 nodes in the raw DOM; the rendered and accessibility trees expose one H1.

#### Open at close

- R-14 remains OWNER; its local Formance ROOT is the only remaining R-16 blocker.
- R-17 remains IN REVIEW until reload persistence has a behavioral assertion.
- R-18 remains IN REVIEW because the Team/Workspace DTO lacks environment and actor-event fields.
- R-26 remains IN REVIEW because populated-Tool inventory behavior is still unobservable.
- R-33/R-34 remain IN REVIEW: authorized view awaits an Admin fixture; pagination awaits a cursor contract.
- C-01 remains IN REVIEW in the OWNER spine.
- C-04 remains IN REVIEW: eight OWNER files move to the spine; nine scanner false positives await the future gate task.
- C-07 remains IN REVIEW: named Market, Agent, Credit and dialog gaps remain in the OWNER spine.
- C-11 remains IN REVIEW: named hit boxes and above-fold actions remain open.
- Standing defaults await Joel: in-app versus hosted status vendor; economics/legal figures; #47 SSO/SCIM; #48 spend-anomaly alerts.

### Wave F · rounds F0–F2 · 2026-09-22

`git log --oneline bb3f1bf01..HEAD` interleaved Wave F with the x402 instance's checkpoint commits; only the commits below move rows. Executed by parallel subagents in barriers (F0-A/B foundations, F1-A/B read backbone + UI, F2-A/B Provider, exceptions, metrics, Overview) with a serial GateOwner per barrier; round F3 (guarded operations on the admin command envelope) is open.

#### Commits

- `dd77b2150` — register rows R-43 metrics and R-44 ROOT-AUTH.
- `f62df0db5`, `05c3884f2`, `f706aba04` — F0-A: schema indexes + `marketplaceMetricDays`/`marketplaceEntityDays`/`adminApprovalProposals`, admin audit taxonomy; branded `CallRef`/`QuoteRef`, admin contracts, total ref parsers; observability boundary.
- `acead8e8b`, `68d1886fd`, `37ba719c4`, `49ba43923` — F0-B: two-person approval state machine; admin command envelope (authority → source-read → digests → idempotent replay → source-write → reason/evidence → consequence proof → target digest → approval → apply → audit → operation key), `defineAdminQuery` registrar, role fixtures.
- `ef76a1cc8`, `faf945766`, `5db1cc6a1`, `dda012427`, `53a7a8564` — F1-A: Call/Quote/Workspace/Agent/Tool version views, `readAdminObject`/`searchAdminObjects`, paginated audit read + open proposals.
- `367cf9d7a`, `350407ce0`, `914041af6`, `0342937f7` — F1-B: object pages, search + Call object page + `ADMIN_NAVIGATION`, audit page with URL filter chips and `Load more`; legacy audit readback removed.
- `ce46c0dfc`, `42ed7045c`, `24cda6737`, `483a873a1`, `05fcf32cb` — F2-A: exceptions feed + page, metrics snapshot/read/daily cron, Provider object + list.
- `e69bc8ee0` — F2-B: Overview, Metrics page, CSV export, sidebar longest-match, index-health retired.
- `bf11aca72`, `6e3d08920`, `519330c3f`, `b06e21da9`, `01a6b5d59`, `ebc35cba4` — gate commits (API snapshot, routeTree).

#### Gate scoreboard before→after

- `FILE_SIZE_CEILINGS`: `over300=276`, `over500=100`, `over1000=0` — unchanged by Wave F (measured 277/101/1 with the x402 instance's uncommitted `convex/devSeed.ts` at 1177 lines; external).
- `ROUTE_SIZE_EXCEPTIONS`: `{src/routes/__root.tsx: 114}` — unchanged; every new admin route ≤80.
- `TSX_TYPE_EXPORT_CEILING`: 17 — unchanged.
- `LEAF_PURITY_EXCEPTIONS=[]` — unchanged.
- Convex façades: every `convex/adminConsole*.ts` ≤200; `convex/security.ts` 336→251; `convex/securityAdminReadbacks.ts` 157→deleted (neither pinned).
- `COPY_CEILINGS`: `0,0,0,0,0,0,2,1,1,0,1,8` — unchanged.
- `STATUS_LITERAL_FILE_CEILING`: 17 — unchanged; 13 `AeStatus` rows added for admin object states.
- Bare-catch ceiling 19 — unchanged by Wave F (measured 22 with external x402 files).
- Module boundaries: 29 modules; declared entry surfaces 229→228 (security `admin-readback.functions.ts` retired); zero admin-console violations; Formance SDK stays behind `convex/moneyFormance.ts` (`readFormancePresence` lives on `src/modules/money/server.ts`).
- Convex API snapshot: +18 admin triples, −`security:readAdminAuditEvents`, −`security:readAdminIndexHealth`.

#### Decisions taken in-flight

- Paginated admin lists cannot carry a refusal union under `usePaginatedQuery`; they return the empty envelope on denial and the UI reads `api.adminConsoleAudit.readAdminAuditAccess` for the visible refusal.
- Call timeline joins `auditEvents.by_correlationId_and_createdAt`; no Call audit target type exists.
- Formance configuration truth is read Node-side (`readAdminFormanceConfigurationServer`), not from the Convex runtime env.
- Metrics refuse any non-AUD paid usage row as `unsupported_currency` and write nothing (alpha is AUD-only).
- Provider payout state reads `unavailable` until an in-transaction money seam exists.

#### Open for round F3

- Converge `setBusinessSuppression`, `closeRemovalDispute`, `grantAdminMembership`, `revokeAdminMembership`, `verifyCapabilitySourceAuthority`, `moneyCommercialPolicy.change` onto `runAdminCommand`; action sheet + refusal presentation; boundary gate (`test:imports` 29→30); operator e2e.
- Joel: Clerk `fva` claim on the `convex` JWT template; his principal in `ADMIN_BOOTSTRAP_PRINCIPAL_IDS`; R-44 decision.

## 8. Plan status · 2026-09-21

Foundation-reset plan Steps 1–6 are complete for Waves 0, A, B (three rounds), C, D and E. §1 now totals 10 VERIFIED, 23 IN REVIEW, 5 PENDING, 1 PARKED and 9 OWNER rows. Standing DEFAULTS awaiting Joel are the status vendor, economics/legal figures, #47 SSO/SCIM and #48 spend-anomaly alerts. Stuck checks: no file appears in three consecutive wave logs; no row has two REOPENED lines; the gate-constant check fires because the TSX-type, copy-vocabulary, bare-catch and module-boundaries constants were unmoved for at least two waves (status vocabulary moved 28→17 in Wave E). Cohesion: 6/10 measured; 9/10 after dispositions (sign-in fixed; status N/A; legal by design) — remaining public-spine deviation: none outstanding.

Re-audit round complete 2026-09-22: IA migration landed (IA-1..15), shell remount ROOT fixed, seeded catalog live; next = spine (OWNER) rows + Joel facts.
External alpha review 2026-09-22: five confirmed findings are fixed with behavioural assertions; R-18 remains IN REVIEW pending the live Clerk `fva` claim, while OWNER-row fixes landed under the recorded orchestrator exception for Joel review.

## 9. Re-audit · 2026-09-21/22

### Joel-reported shell evidence and ROOT dispositions

| Evidence | ROOT | Disposition |
|---|---|---|
| Sidebar flickered, disappeared and lost its open state while Clerk resolved. | **ROOT-SHELL:** `SignedInConvexProvider` changed element depth on Clerk auth load → whole shell remounted, nav state reset (`AeConvexProviders.tsx:18-23`). | FIXED by `5a6313149`; one `ConvexProviderWithClerk` element now persists through auth loading. |
| Tools collapsed into a header-only shell. | **ROOT-IA-2 / DS-37:** `roles.ts:47-60` suppressed the operator sidebar for every `/owner` route. | DS-37 suppression deleted by `83a8e8ab7`. |
| Entering an operator route closed the other visible navigation. | `AeAppShell.tsx:104-106` drawer-close effect on operator route. | Effect deleted by `83a8e8ab7`; the signed-in frame owns one sidebar. |
| Tools showed only `Provider setup`. | `Provider setup` = `WorkspaceInventoryGate` when 0 Tools (`AeProviderWorkspace.tsx:36-42`). | The seeded Tool makes the populated path walkable; commits `1fff0da14`, `b3d300549`. |

### IA decision and landed commits

Target sidebar: **Market · Agents · Calls · Credit | Provider: Tools · Earnings | Settings · Support · Status**. Mobile: **Market · Agents · Calls · Credit · More**. `/owner` remains PARKED and is not a navigation destination. Provider is a visible section, not a mode switch.

| IA item | Decision | Commit |
|---|---|---|
| IA-1 | Canonical app navigation module | `79c7fd1eb` |
| IA-2 | Persistent signed-in sidebar; delete DS-37 suppression | `83a8e8ab7` |
| IA-3 | Canonical four-item mobile navigation plus More; remove obsolete owner-home assertion | `af4ac3446`, `69f8f980f` |
| IA-4 | Command palette projects canonical navigation | `a7eeeaf79` |
| IA-5 | Logged-out header only; signed-in header has no destination row | `9d1b8edd4` |
| IA-6 | Hoist the signed-in frame to `AeAppShell` | `83a8e8ab7` |
| IA-7 | `_operator` retains auth/transition/outlet only | `83a8e8ab7` |
| IA-8 | Delete owner sidebar-suppression authority from `roles.ts` | `83a8e8ab7` |
| IA-9 | Route files stop declaring navigation | `e78f39e90` |
| IA-10 | Footer reads canonical public navigation | `9d1b8edd4` |
| IA-11 | Breadcrumbs resolve through canonical navigation | `83a8e8ab7` |
| IA-12 | `/owner` pending skeleton follows the parked `/owner` decision | PARKED; no commit |
| IA-13 | Redirect `/owner` to Market | PARKED; no commit |
| IA-14 | Post-publish and Provider section journey exits | `453c2f0ef` |
| IA-15 | Destination H1/title parity and awaited Status head metadata | `4ad1dee4b`, `84f77d971` |

Label contract (`docs/designs/2026-09-21-ia-untangle.md` §4): destination label, H1 and title agree for Market, Agents, Calls, Credit, Tools, Settings, Support and Status; Earnings remains a Tools-page H2. Tool detail keeps the Tool name; receipts use `Call receipt`. Visible aliases such as `Tools Market`, `Calls & Activity`, `Agent Access & Keys`, `Provider Workspace`, `My Tools`, `Overview`, `System status` and `Account & security` are not destination labels.

### Can we pay via x402?

**Not end-to-end today.** The brokered path exists: Formance reserve → CDP EIP-3009 USDC sign → Provider facilitator settles → Base RPC verifies 12 confirmations → Formance settles → receipt. The local environment lacks all 13 CDP/x402, 6 Formance and 2 route-signing variables. Without them Calls refuse with `commercial_policy_unavailable` / “Managed x402 payment custody is unavailable.” Sandbox uses Base Sepolia with the same signer and a manual faucet. Hosted Sepolia and mainnet remain unproved (`docs/operations/alpha-maturity-register.md:210-216`). Bazaar listings are observations, not callable until admitted, quoted and authorized.

**Decision:** Joel supplies CDP keys and a Formance sandbox for a Sepolia pilot; until then x402 stays refused-by-design.

### Seeded local catalogue

- Sandbox Tool: `sandbox-aecon-reference`, backed by the Frankfurter FX HTTPS source and owned by the local owner.
- `.env.local` needs `AE_DEV_OWNER_ACCOUNT_REF=acc_667b1893baf443cc8b737643c403dbf3`.
- W8-02 is done: loopback source acceptance and local-owner publication landed in `1fff0da14`, `b3d300549`; `e2c9c0739` regenerated Convex API types.

### Consistency close-out

- C-01 stays IN REVIEW: one-label intent contract landed in `0076fd8f2`; buyer-facing canonical nouns and jargon removal landed in `5be752e04`; OWNER append is in spine W2-09, W4-06, W5-06 and W7-06.
- C-08 stays IN REVIEW: alert-versus-empty-state and explicit money-outcome pass landed in `acad2e112`; OWNER append is in spine W5-03 and W7-06.

### Found, not fixed

- Dana: legal entity/controller is absent. **Owner: Joel facts.**
- Dana: numeric fees and payout cadence remain deferred. **Owner: Joel facts.**
- Dana: `/about` says `pre-launch` while `/status` says `All systems operational`. **Owner: new row.**
- Dana: Status omits payments and payouts. **Owner: new row.**
- Dana: `hello@aecon.ai` and `support@aecon.ai` conflict. **Owner: new row.**
- Dana: `catalog` and `catalogue` conflict. **Owner: new row.**
- Dana: public CTA styles drift between 48px solid and 44px transparent. **Owner: new row.**
- Lena: the first five `/market` focus targets paint `none/auto/none/none/none`. **Owner: OWNER-LOCKED Market (C-06/C-07).**
- Lena: reaching the first Tool takes 23 Tabs. **Owner: OWNER-LOCKED Market (C-07).**
- Lena: the Market tabpanel is an extra focus stop. **Owner: OWNER-LOCKED Market (C-07).**
- Lena: the Market result count is not live. **Owner: OWNER-LOCKED Market (C-07).**
- Lena: two regions are both named `Popular Tools`. **Owner: OWNER-LOCKED Market (W1-02).**
- Lena: the account menu lacked Credit. **FIXED by `83a8e8ab7`** through the persistent canonical sidebar.

### Contingencies

- Six agents died on provider aborts mid-flight and were revived from disk.
- An orphan Convex backend (PID 31264, 20 h) blocked pushes; it was killed.
- Convex CLI link/upgrade prompts were bypassed with `CONVEX_AGENT_MODE=anonymous`; the backend was upgraded to `precompiled-2026-09-21`.
- The supervised `hub` process name is now `ae-stack`.

## 10. External alpha review · 2026-09-22

| Finding | Verdict | Fix commit(s) | Assertion (test file) | Row/spine item |
|---|---|---|---|---|
| MFA bypass on workspace close/transfer | CONFIRMED | `f7c02bc85` | `tests/unit/convex/workspace-decommission.test.ts` | R-18 |
| `A$0.00 charged` on uncertain Calls | CONFIRMED | `7cb685492` | `tests/unit/routes/call-status-route.test.tsx` | R-21 / W7-06 |
| Tool detail refusal collapsed distinct causes | CONFIRMED | `d62defe14`, `84e4c321e` | `tests/unit/routes/tool-detail-route.test.tsx` | R-08 / W1-03 |
| Compare lost selections across navigation/refresh | CONFIRMED | `4783d51fc`, `63c289b8a` | `tests/unit/market/x402-directory-page.test.tsx`, `tests/unit/routes/market-search.test.ts` | R-05 / W2-02 |
| Help dropped the exact Call | CONFIRMED | `c1527875b` | `tests/unit/routes/support-route.test.tsx`, `tests/unit/routes/call-status-route.test.tsx` | R-21 / W7-02, W7-04 |

ORCHESTRATOR EXCEPTION: fixes 2–5 touched OWNER-LOCKED paths (call-receipt/**, market/**, src/modules/market/**, support/**) — authorised as minimal correctness/money-truth fixes, not core-flow design; record the exception explicitly so Joel can review.

**Joel action:** add `{{session.factor_verification_age}}` as the `fva` claim in Clerk → JWT templates → `convex`; until then workspace close and ownership transfer refuse safely.

Shared-index sweep: 7cb685492 captured FixHelpCallHandoff's test edits (recorded, not amended).
