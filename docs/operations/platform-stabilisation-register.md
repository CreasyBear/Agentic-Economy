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
| `tests/imports/route-controller-size.test.ts` | `ROUTE_CONTROLLER_MAX_LINES=80`; `ROUTE_SIZE_EXCEPTIONS`: `src/routes/__root.tsx` 114, `src/routes/developers.discovery.tsx` 221 |
| `tests/imports/file-size-ratchet.test.ts` | `FILE_SIZE_CEILINGS`: `over300=281`, `over500=103`, `over1000=1`; `OVER_1000_ALLOWED`: `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` |
| `tests/imports/tsx-type-quarantine.test.ts` | `TSX_TYPE_EXPORT_CEILING=18` |
| `tests/imports/leaf-purity.test.ts` | `LEAF_PURITY_EXCEPTIONS`: `src/components/ae/settings/settings-dialog/components/WorkspaceSettingsBody.tsx` |
| `tests/imports/own-barrel-imports.test.ts` | `OWN_BARREL_EXCEPTIONS`: `src/modules/registry/internal/registry-action-contracts.ts` |
| `tests/imports/convex-facade-size.test.ts` | `FACADE_MAX_LINES=200`; 74 pinned `FACADE_SIZE_EXCEPTIONS` |
| `tests/imports/copy-vocabulary.test.ts` | `COPY_CEILINGS`: `supplier=0`, `invocation=0`, `connection-online=0`, `balance=8`, `legacy-credential=2`, `used-recently=1`, `one-call-away=1`, `authority-mode=1`, `mandate=0`, `commitment=0`, `callable-operation=0`, `commercial-closure=0`; `MARGIN=2` |
| `tests/imports/status-vocabulary.test.ts` | `STATUS_LITERAL_FILE_CEILING=28`; `MARGIN=2` |

A row is VERIFIED only if its commit lowered at least one ratchet constant or its Target spec is asserted by a test under tests/e2e or tests/unit; a human re-walk alone never verifies a row.

Progress is read from `git grep -n "pinned 2026-09" tests/imports/`. Commit bodies end `R-nn · <gate>: a→b`.

A row whose evidence names a symptom seen on more than one surface carries a ROOT line before dispatch.

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
| DOORS | 4 | 3 | 0 | 3 | 0 | PENDING |
| MARKET | 6 | 6 | 3 | 2 | 1 | OWNER/PENDING |
| ASK | 2 | 1 | 1 | 0 | 0 | OWNER |
| AGENTS | 3 | 2 | 1 | 1 | 0 | OWNER/PENDING |
| CREDIT | 3 | 2 | 2 | 0 | 0 | OWNER/PENDING |
| ACCOUNT | 7 | 5 | 1 | 4 | 0 | PENDING |
| RECORDS | 2 | 2 | 2 | 0 | 0 | OWNER |
| HELP | 5 | 4 | 2 | 2 | 0 | PENDING |
| SUPPLY | 5 | 5 | 2 | 3 | 0 | PENDING/PARKED |
| DEV/ADMIN | 4 | 4 | 2 | 2 | 0 | PENDING |
| SHELL | 2 | 1 | 0 | 0 | 1 | PARKED |
| CROSS-CUTTING | n/a | 12 | 7 | 5 | 0 | PENDING |
| CLASS GAPS | n/a | 49 | n/a | n/a | n/a | DECISION RECORDED |

The 43 route entries are all assigned once. `/support` is assigned to the Receipt and Support row because that is its buyer job. The four DEV/ADMIN routes are separated from the five Provider supply routes even though the route inventory classified all nine as SUPPLY.

## 2. Surface rows

### R-01 Entry and company thesis: `/` and `/about`
**Benchmark:** Linear About. **Incumbent baseline:** one company thesis, who it serves, credible operator/contact.
**Current state (LIVE):** `/about` H1 “Who this market is for.” with two equal CTAs; `/` is a redirect-only route at `src/routes/index.tsx:7`.
**Gaps:** • [DOOR-01] “No company thesis, operator/team, or contact route” (`src/components/ae/about/AeAboutPage.tsx:26-126`) • [DOOR-02] “Providers are paid when the job is delivered.” lacks currency, fee and timing (`src/content/brand-copy.ts:81-86`) • [DOOR-03] “both CTAs top 292px” (`src/components/ae/about/AeAboutPage.tsx:44-50`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Who this market is for.</td><td>Tools agents can call.</td></tr><tr><td>subhead</td><td>Agents find, compare, and call. Providers publish the job, the price, and the access terms, and get paid after delivery.</td><td>Agents buy Tools. Providers set prices and receive AUD payouts after completed Calls.</td></tr></table>
**Target spec:** one thesis above fold; verified operator/contact; Agents and Providers named once; payout claim links fee, currency and timing. **Cut:** “Listed Providers” definition and duplicate catalogue cover.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDoors, 21 Sep 2026.

### R-02 Agent door: `/for-agents`
**Benchmark:** Stripe developer docs landing. **Incumbent baseline:** one integration outcome, recommended path, copyable command, one start.
**Current state (LIVE):** H1 “Add the market to your agent.”; hero actions Browse Tools and Read the skill; working Codex command exists.
**Gaps:** • [DOOR-04] “Neither hero CTA performs the promised connection” (`src/components/ae/agents/AeAgentDoorPage.tsx:34-40`) • [DOOR-05] “Claude Code, Cursor, and Codex” spreads focus and uses service (`src/content/brand-copy.ts:62-64`) • [DOOR-06] “Account connection does not grant spending permission.” has no policy action (`src/components/ae/console/AeAssistantInstallFunnel.tsx:53-68`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Add the market to your agent.</td><td>Connect your Agent.</td></tr><tr><td>primary CTA</td><td>Browse Tools</td><td>Start setup</td></tr></table>
**Target spec:** one Codex setup CTA; one-click named command; confirmation links to Agents; explicit Spending policy step; alternatives secondary. **Cut:** Read the skill hero CTA and duplicate three-client strapline.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDoors, 21 Sep 2026.

### R-03 Provider door: `/for-providers`
**Benchmark:** Shopify Sell online. **Incumbent baseline:** sellable unit, total cost, payout method/timing, eligibility, direct start.
**Current state (LIVE):** H1 “List a Tool.”; one CTA goes to `/owner/operations`; fee, payout timing and currency are absent.
**Gaps:** • [DOOR-07] “automated AUD payouts” with no fee/currency/timing (`src/components/ae/supply/AeSupplyLanding.tsx:64-84`) • [DOOR-08] href `/owner/operations`, then Add Tool (`src/components/ae/supply/AeSupplyLanding.tsx:79-82`) • [DOOR-09] “all inputs live after the CTA” (`src/components/ae/supply/AeSupplyLanding.tsx:101-128`) • [DOOR-10] “Supplier activation” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>subhead</td><td>List one Tool agents can inspect and call. You describe the price, access, effects, and evidence; Agentic Economy records it as a Tool.</td><td>List one Tool, set an AUD price, and review fees and payout timing before publishing.</td></tr><tr><td>primary CTA</td><td>List a Tool</td><td>Add Tool</td></tr></table>
**Target spec:** fee, AUD payout method, trigger and timing above fold; one CTA opens form; eligibility before live check; no Supplier vocabulary. **Cut:** “AE public inspection actions” and duplicate Manage listed Tools promotion.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDoors, 21 Sep 2026.

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

### R-06 Owner Market duplicate: `/owner/market`
**Benchmark:** Shopify admin versus storefront. **Incumbent baseline:** admin manages records; storefront sells; no reduced duplicate storefront.
**Current state (LIVE):** same 15,141-Tool catalogue under a reduced hero; 390px scrollWidth is 704 while `/market` is 368.
**Gaps:** • [SUP-08] “same catalogue, no owner management” (`owner.market.tsx:37-60`) • [SUP-09] “scrollWidth 704 at 390px” (`AeX402Directory.tsx:196-199`) • [SUP-10] Market href `/market` lacks `aria-current` (`owner.market.tsx:42-50`) • [SUP-11] owner adds no admin controls (`AeX402Directory.tsx:198`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>deck</td><td>Find and compare a Tool, then continue through your Agent.</td><td>Find a Tool for your Agent.</td></tr><tr><td>hero</td><td>Find your next capability.</td><td>Find a Tool.</td></tr></table>
**Target spec:** redirect to `/market`; Market active; Saved/Compare persist; public hero/tabs remain; no 390px overflow. **Cut:** entire compact duplicate route and wrapper.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegSupplyList, 21 Sep 2026.

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
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegAccount, 21 Sep 2026.

### R-14 Credit: `/owner/credit`
**Benchmark:** Stripe Balance and Checkout. **Incumbent baseline:** authoritative available/reserved/total, explicit fee/GST/total, reliable return state.
**Current state (LIVE):** H1 Credit is reachable; observed balance remained unavailable while funding controls were shown.
**ROOT:** local stack has no Formance ledger configured; not a product defect. UI says "Credit unavailable" and "Nothing was charged."
**Gaps:** • [OPS-02] “INDICATIVE PRICE About A$0.04” and “Listed Provider amount USDC 0.025000” before funding (`UNANCHORED`) • [SKP-02] “Balance unavailable” and “Some summaries are unavailable” (`UNANCHORED`) • [JNY-03] “Stripe → Agents … Tool, Agent and amount gone” (`UNANCHORED`) • [JNY-04] Credit was two clicks inside Find Tools (`UNANCHORED`) • [JNY-05] “Balance unavailable” while asking for payment (`UNANCHORED`) • [OR-07] “Balance unavailable… Refresh to read the authoritative Account balance” (`UNANCHORED`) • [ST-06] no available/pending/reserved split (`UNANCHORED`) • [DEV-R2-04] `/credit` fails while actual page is `/owner/credit` (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>value</td><td>Balance unavailable</td><td>Credit unavailable</td></tr><tr><td>error</td><td>check system status before repeating a Call</td><td>Retry. If Credit still cannot load, check system status.</td></tr></table>
**Target spec:** available, reserved and total in AUD; amount/fee/GST/total before Stripe; funding preserves Tool, Agent and amount; failures say whether money moved; retry safe. **Cut:** duplicate failure heading and Provider-workspace sign-in copy.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W5`. **Provenance:** PersonaOpsManager, PersonaSkeptic, PersonaJourneyOwner, ExpectOpenRouter, ExpectStripe, PersonaAgentDev, 21 Sep 2026.

### R-15 Onboarding: `/onboarding`
**Benchmark:** Vercel new-team onboarding. **Incumbent baseline:** one consequential question per screen, progress, skip for nonessential setup.
**Current state (LIVE):** “Set up your workspace”; two roles, then prefilled Acme; no Skip.
**Gaps:** • [ACC-01] “Setup is mandatory: no Skip” (`AeOnboardingPage.tsx:45-64`) • [ACC-02] “Supplier / Tool Provider” mixes personas and forbidden vocabulary (`OnboardingRoleStep.tsx:25-49`) • [ACC-03] “Role consequences/reversibility are unstated” (`OnboardingRoleStep.tsx:33-49`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>buyer</td><td>Buyer / Agent Operator</td><td>Buy with an Agent</td></tr><tr><td>provider</td><td>Supplier / Tool Provider</td><td>Provide a Tool</td></tr><tr><td>action</td><td>Finish setup</td><td>Create workspace</td></tr></table>
**Target spec:** one decision per step; progress retained; Skip has stated default; role effects plain and reversible; completion names destination. **Cut:** numeric keyboard badges.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** Cross-ref: W-ref: see `user-and-org-maturity-register.md`. **Provenance:** RegAccount, 21 Sep 2026.

### R-16 Owner overview: `/owner/`
**Benchmark:** Stripe Dashboard Home. **Incumbent baseline:** today’s money and actionable exceptions, not vanity counts.
**Current state (LIVE):** “Balance unavailable”; “No Calls need attention” conflicts with unavailable summaries; “8 connected Agents”.
**ROOT:** R-14.
**Gaps:** • [ACC-04] “No Calls need attention” while `/activity` cannot summarize (`AeOwnerOverview.tsx:76-80`) • [ACC-05] “Check Balance” and “Open Balance” duplicate (`AeOwnerOverview.tsx:93-107`) • [ACC-06] “8 connected Agents” exposes no decision (`AeOwnerOverview.tsx:115-120`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>intro</td><td>See what needs attention, your available Balance, and connected Agents.</td><td>Review Credit, Calls needing attention, and Agents.</td></tr><tr><td>action</td><td>Open Balance</td><td>Open Credit</td></tr></table>
**Target spec:** honest Credit state; attention agrees with Calls; Agent tile names a decision; one primary; no vanity counts. **Cut:** duplicate Open Balance and Provider upsell.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** Cross-ref: W-ref: see `user-and-org-maturity-register.md`. **Provenance:** RegAccount, 21 Sep 2026.

### R-17 Account and security: `/owner/settings`
**Benchmark:** GitHub Settings. **Incumbent baseline:** persistent section navigation, saved controls, destructive jobs isolated last.
**Current state (LIVE):** 3,112px page; alert switch resets after reload; no section navigation.
**Gaps:** • [ACC-07] “Low credit balance” true→false→reload restored true (`OwnerSettingsSections.tsx:18-25`) • [ACC-08] “A 3,112px page has no settings section nav” (`OwnerSettingsShell.tsx:15-22`) • [ACC-09] Profile bundles profile, sessions, sign-out and recovery (`OwnerSettingsSections.tsx:30-63`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>alerts</td><td>Changes apply to this Account only.</td><td>Saved for this Account.</td></tr></table>
**Target spec:** choices survive reload; section nav; personal Profile distinct from Team; filterable security history; workspace danger last elsewhere. **Cut:** SESSION eyebrow.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** Cross-ref: W-ref: see `user-and-org-maturity-register.md`. **Provenance:** RegAccount, 21 Sep 2026.

### R-18 Team and Workspace: `/owner/team` and `/owner/workspace`
**Benchmark:** GitHub Organization settings and Vercel Team settings. **Incumbent baseline:** one authoritative member/role view, environment controls and actor-attributed audit.
**Current state (LIVE):** membership views conflict; Workspace has distinct organization/member and billing/tax sections.
**Gaps:** • [GH-15] “Clerk row says `R10 Smoke Owner … Admin`; canonical directory says same workspace has `user_… — Owner Active`” (`UNANCHORED`) • [GH-20] “connection hard-codes `Environment: production`; no workspace environment switcher” (`UNANCHORED`) • [GH-22] “`/owner/workspace` and `/owner/team` expose no workspace audit stream” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>role</td><td>Admin / Owner for the same membership</td><td>One authoritative membership role</td></tr></table>
**Target spec:** one role source; owner protections; environment choice visible; actor-attributed admin events; billing stays separate. **Cut:** duplicate membership projection.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** Cross-ref: W-ref: see `user-and-org-maturity-register.md`. **Provenance:** ExpectGitHubVercel, 21 Sep 2026.

### R-19 Authentication redirects: `/sign-in/$` and `/sign-up/$`
**Benchmark:** Linear Login. **Incumbent baseline:** one auth surface, SSO/passkeys, exact deep-link return.
**Current state (LIVE):** signed-in `/sign-in` lands settings; signed-in `/sign-up` lands onboarding despite established Agents.
**Gaps:** • [ACC-10] “/sign-up sends an established owner surface with 8 connected Agents back to blank role selection” (`useSignUpPage.ts:16-19`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>signed-in sign-up target</td><td>Set up your workspace</td><td>Finish workspace</td></tr></table>
**Target spec:** safe signed-in redirects; no accidental duplicate setup; explicit deep link survives; no loop; title matches URL. **Cut:** nothing.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** Cross-ref: W-ref: see `user-and-org-maturity-register.md`. **Provenance:** RegAccount, 21 Sep 2026.

### R-20 Calls: `/activity`
**Benchmark:** Stripe Payments and OpenRouter Activity. **Incumbent baseline:** identifiable ledger rows, fixed statuses, URL filters, saved views and export.
**Current state (LIVE):** empty Calls page; no populated rows; summaries unavailable.
**ROOT:** R-14.
**Gaps:** • [OR-02] promised fields only “task, outcome, amount, and receipt” (`UNANCHORED`) • [OR-03] “no filter/export” (`UNANCHORED`) • [ST-02] “zero tables/inputs; only ‘No Calls yet’ and summary cards” (`UNANCHORED`) • [ST-03] “no filter controls or query state” (`UNANCHORED`) • [ST-04] “no saved-view control” (`UNANCHORED`) • [ST-05] “no export action” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>row nouns</td><td>Task · Caller Agent · Purchase status</td><td>Tool · Agent · Purchase resolution</td></tr><tr><td>filtered empty</td><td>No Calls yet</td><td>No Calls for this Agent</td></tr></table>
**Target spec:** one ledger job; removable Agent filter always visible; row leads Call identity, Agent, Tool, status, amount, time; export; receipt path preserves scope. **Cut:** monthly summary and unavailable tiles.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W6`. **Provenance:** ExpectOpenRouter, ExpectStripe, 21 Sep 2026.

### R-21 Receipt and Support: `/calls/$callRef` and `/support`
**Benchmark:** Stripe payment detail and support handoff. **Incumbent baseline:** amount/status first, timeline later, state-gated recourse and payment ID carried to Help.
**Current state (LIVE):** missing receipt has clear impact copy, but populated receipt was not reached; Support retains direct reference yet is not reachable from receipt.
**ROOT:** R-14.
**Gaps:** • [JNY-02] “detail said ‘Connect an Agent first’; `/activity` said ‘No Calls yet’” (`UNANCHORED`) • [ST-07] “Receipt not found; no valid Call existed to verify” (`UNANCHORED`) • [ST-08] “no timeline in reached state” (`UNANCHORED`) • [ST-09] customer/payment method/receipt absent in refused state (`UNANCHORED`) • [ST-10] refund/dispute gating unverified (`UNANCHORED`) • [ST-11] “Keep this reference and contact the owner or operator,” but no help action (`UNANCHORED`) • [ST-12] Credit failure never states whether money moved (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>receipt error</td><td>owner-scoped status read</td><td>We couldn’t open this Call for this workspace</td></tr><tr><td>support</td><td>Help</td><td>Call</td></tr></table>
**Target spec:** Delivery, Payment, Purchase resolution and Who acts next first; only applicable same-Call action; exact Call reaches Support; blank/malformed refs distinct; Back/refresh retain ref; every failure says whether money moved. **Cut:** advanced evidence before decision facts; no new support form.
**Priority:** P0. **Status:** OWNER. **Verification evidence:** Queue: `docs/operations/buyer-spine-stabilisation-plan.md §3 W7`. **Provenance:** PersonaJourneyOwner, ExpectStripe, 21 Sep 2026.

### R-22 System status: `/status`
**Benchmark:** Atlassian Statuspage. **Incumbent baseline:** component state, timestamped incidents, last update and subscription.
**Current state (LIVE):** five checks Operational; “Last checked Sep 21, 2026, 12:01 PM UTC.”
**Gaps:** • [HELP-01] “five checks plus Help only” (`src/components/ae/status/system-status/AeSystemStatus.tsx:37-40`) • [HELP-02] “Catalogue freshness…within the last 36 hours” (`src/components/ae/status/system-status/components/StatusCheckList.tsx:10-23`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>All systems operational.</td><td>All systems operational</td></tr></table>
**Target spec:** component timestamps; current/past incidents; last updated; subscribe; refresh. **Cut:** marketing footer links from task.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-23 Terms: `/terms`
**Benchmark:** Stripe Legal. **Incumbent baseline:** dated/versioned agreement, parties, fees, payment roles, tax, refunds, disputes and law.
**Current state (LIVE):** three marketing cards and two CTAs, not a legal agreement.
**Gaps:** • [HELP-03] “no date, version, ToC, legal entity, acceptance, liability, termination, or governing law” (`src/components/ae/legal/terms/AeTermsPage.tsx:14-29`) • [HELP-04] “fee ABSENT; take rate ABSENT; payout ABSENT; refund ABSENT; dispute ABSENT; GST ABSENT; merchant of record ABSENT; data retention ABSENT” (`src/components/ae/legal/terms/terms.contracts.ts:17-50`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>card</td><td>Search…by capability, category, supplier, or task.</td><td>Search by capability, category, Provider, or task.</td></tr></table>
**Target spec:** date/version/ToC; parties/acceptance; fee/take/payout; MoR/GST/refunds/disputes; liability/termination/law. **Cut:** Find/Compare/Call cards and dual CTAs.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-24 Privacy: `/privacy`
**Benchmark:** Stripe Privacy Center. **Incumbent baseline:** dated notice, controller, categories/purposes, recipients, retention, rights, transfers and contact.
**Current state (LIVE):** four product-flow tabs and Open corrections action.
**Gaps:** • [HELP-05] “omits controller, lawful basis, retention periods, rights, processors, transfers, cookies, and complaint route” (`src/components/ae/legal/privacy/privacy.contracts.ts:27-77`) • [HELP-06] “data retention ABSENT” and payment roles absent (`src/components/ae/legal/privacy/AePrivacyPage.tsx:8-11`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>intro</td><td>What the market handles…</td><td>How Agentic Economy collects and uses data.</td></tr></table>
**Target spec:** date/version/ToC; controller/contact; category-purpose-recipient table; retention/rights; transfers/complaints. **Cut:** decorative recap.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-25 Provider correction or removal: `/privacy/remove-business`
**Benchmark:** Google Business Profile remove/claim listing. **Incumbent baseline:** identity check, consequences, review time, receipt and status path.
**Current state (LIVE):** slug/email/reason/note and Send request; no identity evidence.
**Gaps:** • [HELP-07] “accepts slug/email/note only” (`src/components/ae/privacy/remove-business/components/RemovalRequestForm.tsx:56-137`) • [HELP-08] only “A short note is enough.” (`src/components/ae/privacy/remove-business/remove-business.contracts.ts:14-32`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>CTA</td><td>Send request</td><td>Submit request</td></tr></table>
**Target spec:** verify requester; preview affected Business/Tools; removal versus merge; review time; reference/status. **Cut:** three repeating summary cards.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegHelpLegal, 21 Sep 2026.

### R-26 My tools: `/owner/operations`
**Benchmark:** Stripe Products and Shopify admin Products. **Incumbent baseline:** name, price, status, updated, filters, Add Tool, preview/edit/archive and payout readiness.
**Current state (LIVE):** no Tools; Provider setup, payout and connection cards conflict; production is implicit.
**Gaps:** • [SUP-01] “Action Required” versus “Nothing is required here…” (`ProviderWorkspaceEarningsSection.tsx:28-44`) • [SUP-02] “DOM links contain no Tool/public preview” (`AeProviderWorkspace.tsx:27-35`) • [SUP-03] “Environment: production” is text (`useOwnerProviderConnectionsState.ts:69-74`) • [SUP-04] columns omit Updated (`AeOwnerOfferings.tsx:114-194`) • [SUP-05] “Supplier activation” (`AeSupplierOnboardingWizard.tsx:48-56`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>title</td><td>Supplier activation</td><td>Provider setup</td></tr><tr><td>empty</td><td>Connect a source and choose the exact Tool AE should validate.</td><td>Add a source, then choose a Tool to publish.</td></tr></table>
**Target spec:** name/price/status/updated/Calls with filters; one Add Tool; one Stripe-linked payout truth; explicit production choice; preview/edit/archive. **Cut:** duplicate Add Tool and contradictory earnings card.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegSupplyList, 21 Sep 2026.

### R-27 Owner Tool detail: `/owner/operations/$toolRef`
**Benchmark:** Stripe Product detail. **Incumbent baseline:** price/status, sales, update history, preview, edit and archive.
**Current state (LIVE):** not reached because My tools says “No Tools yet”.
**Gaps:** • [SUP-06] “No Tools yet; no row/href” (`AeOwnerOfferings.tsx:215-227`) • [SUP-07] required facts “lack live evidence because the required first-listed-Tool path does not exist” (`AeOwnerToolDetailPage.tsx:83-103`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>list gate</td><td>No Tools yet</td><td>Add your first Tool</td></tr></table>
**Target spec:** draft makes openable row; price/status/Calls/updated; buyer preview; consequence-aware edit/archive; missing ref recovers. **Cut:** none measurable.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegSupplyList, 21 Sep 2026.

### R-28 Add Tool: `/owner/operations/new`
**Benchmark:** RapidAPI Add API and Stripe Connect Express onboarding. **Incumbent baseline:** identity, source, endpoints, price, preview and publish; commercial terms before payout setup.
**Current state (LIVE):** only x402, OpenAPI, MCP and Agent Plugin sources; later steps not reached.
**Gaps:** • [NEW-01] only “x402 resource URL”, “OpenAPI URL”, “MCP server URL”, or plugin documents (`SupplySourceTypeSection.tsx:136-253`) • [NEW-02] “no fee/take/payout copy” (`SupplyPublicationFlow.tsx:133-150`) • [NEW-03] “Malformed JSON payload. A$0.00 affected” for well-formed JSON (`supply-source-native-start-presentation.ts:36-64`) • [NEW-04] source failures hide DNS/HTTP/schema check (`SupplySourceTypeSection.tsx:95-132`) • [NEW-05] `required=false` until submit (`SupplySourceTypeSection.tsx:179-253`) • [NEW-06] Discover endpoints y=912 and 20/28px controls (`SupplySourceTypeSection.tsx:135-263`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>deck</td><td>Connect the interface you already operate. AE discovers the Tools and validates the one you submit.</td><td>Describe a service or connect its interface. AE checks what agents can buy.</td></tr><tr><td>CTA</td><td>Discover endpoints</td><td>Find Tools</td></tr></table>
**Target spec:** human-delivered or connected Tool first; visibly required fields/examples; syntax/schema/DNS/HTTP distinct; fee/GST/payout before submit; mobile action above fold; targets 44px; focus visible. **Cut:** “A$0.00 affected” and repeated discovery copy.
**Priority:** P0. **Status:** PARKED for NEW-01; other gaps PENDING. **Verification evidence:** none. **Provenance:** RegSupplyNew, 21 Sep 2026.

### R-29 Provider connection handoff: `/owner/supply/connections/new`
**Benchmark:** Zapier Connect account. **Incumbent baseline:** app identity, requested access, one connect action, return to interrupted setup.
**Current state (LIVE):** no/fake attempt shows “This connection request is unavailable” and returns to Add Tool.
**Gaps:** • [NEW-07] “no cause or retained context” (`AeConnectionHandoff.tsx:18-37`) • [NEW-08] “names neither [Provider nor scope]” (`AeConnectionHandoff.tsx:39-59`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>error</td><td>This connection request is unavailable</td><td>Connection link unavailable</td></tr><tr><td>recovery</td><td>Return to Add Tool and start the connection again.</td><td>Return to Add Tool and reconnect.</td></tr></table>
**Target spec:** Provider and access named; one connect action with return; missing/expired distinct; saved Tool retained; inline credential error. **Cut:** duplicate H1/breadcrumb.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegSupplyNew, 21 Sep 2026.

### R-30 Provider OAuth callback: `/owner/supply/connections/oauth/callback`
**Benchmark:** Zapier/GitHub OAuth callback. **Incumbent baseline:** named success/failure, what happened, retry/return.
**Current state (LIVE):** no params yields generic “Service not connected”; only Return to Add Tool.
**Gaps:** • [NEW-09] no-attempt maps to `authorization_denied` but shows generic failure (`owner.supply.connections.oauth.callback.tsx:23-28`; `AeOwnerMcpOAuthCallback.tsx:43-48`) • [NEW-10] “Failure has no direct retry” (`AeOwnerMcpOAuthCallback.tsx:49-57`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Service connection</td><td>Provider connection</td></tr><tr><td>failure</td><td>Service not connected</td><td>Connection link missing</td></tr></table>
**Target spec:** every outcome named; safe cause; retry retains Tool; success auto-returns; no persistent intermediate page. **Cut:** generic preamble.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegSupplyNew, 21 Sep 2026.

### R-31 API reference: `/developers/api`
**Benchmark:** Stripe API reference. **Incumbent baseline:** one base URL, Bearer header, valid request, error codes and version policy.
**Current state (LIVE):** Scalar v0.1.0 with schemas and Test Request; generated Quote request is invalid.
**Gaps:** • [DEV-01] `"toolRef": ""` and `"additionalProperty": true` (`src/modules/discovery/internal/openapi-document.ts:47-58`) • [DEV-02] repeated Problem Details rows lack code/action/retry (`src/modules/discovery/internal/openapi-document.ts:214-218`) • [DEV-03] ExactAmount and `totalAud/netAud/gstAud` conflict (`src/modules/capability-execution/procure.ts:33-36`) • [DEV-04] v0.1.0 has no policy (`src/modules/discovery/internal/openapi-document.ts:329-330`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>deck</td><td>Every public REST operation…</td><td>Search Tools, request a Quote, and make a Call.</td></tr></table>
**Target spec:** runnable request per endpoint; one Bearer explanation; named error/action/retry; one price shape; visible version policy. **Cut:** Powered by Scalar and duplicate download.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDevAdmin, 21 Sep 2026.

### R-32 Discovery readback: `/developers/discovery`
**Benchmark:** Vercel Logs. **Incumbent baseline:** current state first, trustworthy time/status, filters, no internal planning debris.
**Current state (LIVE):** 0 catalogues, Artifacts unavailable, yet route rows Available; placeholder origin is public.
**Gaps:** • [DEV-05] `https://ae.example/...` (`src/modules/discovery/developer-discovery-route.ts:10-18`) • [DEV-06] “Phase 3”, “Deferred”, “repair source readback before public claims” (`src/routes/developers.discovery.tsx:136-170`) • [DEV-07] routes Available while support/download payload says unavailable/withheld (`src/routes/developers.discovery.tsx:103-149`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>H1</td><td>Read-only public catalog files</td><td>Discovery status</td></tr><tr><td>action</td><td>Download schema JSON</td><td>View schema status</td></tr></table>
**Target spec:** real origin; one status per artifact; freshness; action matches result; no roadmap/support-capacity copy. **Cut:** Not in this product inventory and public support matrix.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDevAdmin, 21 Sep 2026.

### R-33 Admin audit events: `/admin/audit-events`
**Benchmark:** Stripe internal event tables. **Incumbent baseline:** role-specific denial; filters, timestamps, pagination, stable IDs when authorized.
**Current state (LIVE):** non-admin owner sees generic workspace denial and two React recovery errors.
**Gaps:** • [DEV-08] “This signed-in account cannot open the requested workspace.” and duplicate denial (`src/components/ae/layout/AeRouteStates.tsx:228-229,358-364`) • [DEV-09] “two uncaught React recovery errors” (`src/lib/operator/route-options.ts:18-26`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>gate</td><td>This signed-in account cannot open the requested workspace.</td><td>Your account does not have the Admin role.</td></tr></table>
**Target spec:** Admin role named; no console error; authorized filters/timestamps/pagination; explicit redaction. **Cut:** duplicate heading.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDevAdmin, 21 Sep 2026.

### R-34 Admin index health: `/admin/index-health`
**Benchmark:** Stripe internal health tables. **Incumbent baseline:** filterable rows, timestamps, pagination, failure reason and remediation.
**Current state (LIVE):** same generic denial and duplicate recovery errors; rows not reached.
**Gaps:** • [DEV-10] “Admin-role denial is mislabeled as workspace ownership” (`src/routes/_operator/admin.index-health.tsx:17-27`) • [DEV-11] “Expected denial pollutes console twice” (`src/lib/operator/route-options.ts:18-26`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>gate</td><td>You don’t have access to this workspace</td><td>Admin access required</td></tr></table>
**Target spec:** clean role gate; no console error; filter by Tool/source/state; timestamps/pagination; remediation per failure. **Cut:** duplicate denial title.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDevAdmin, 21 Sep 2026.

### R-35 Signed-in chrome and navigation: root shell and operator shell
**Benchmark:** GitHub and Vercel team-scoped navigation. **Incumbent baseline:** one visible team scope and deliberate environment separation without duplicate destination systems.
**Current state (LIVE):** RoastChromeInConcert measured “a repeated Market · Agents · Calls · My tools quartet, `/market` beside `/owner/market` and `/owner` Overview, two mobile navigation models, and an unmarked Supply mode” (`UNANCHORED`). PatternInventory found “3 definition systems” with 26 route nav sites, four mobile destinations and six command items (`src/routes/market.tsx:13-19`; `AeOwnerMobileNavigation.tsx:15-30`; `tools-search-page.contracts.ts:63-100`).
**Gaps:** • [GH-19] “All six signed-in URLs expose `button[aria-label="Open organization switcher"]`” (`UNANCHORED`, PRESENT measured distance) • [GH-20] “no workspace environment switcher” and connection hard-codes production (`UNANCHORED`) • PatternInventory §6 vocabulary differs for Market, Calls, Credit, Agents and Providers (anchors above).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>destinations</td><td>Market · Agents · Calls · My tools</td><td>Per `ia-rationalisation-protocol.md`, only after buyer spine passes</td></tr></table>
**Target spec:** cross-ref S-01..S-20 remains intact; IA-01..04 alone change destinations after the spine gate. **Cut:** no chrome work now.
**Priority:** P2. **Status:** PARKED. **Verification evidence:** Reason: “Chrome is not the hole”. Cross-ref: S-01..S-20. **Provenance:** RoastChromeInConcert, ExpectGitHubVercel, PatternInventory, 21 Sep 2026.

### R-36 Capability-supply payment signer
**Benchmark:** the repository hard ceiling of 1,000 lines. **Incumbent baseline:** focused internal modules below the enforced ceiling.
**Current state (SOURCE):** `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` is 1,042 lines and is the sole path in `OVER_1000_ALLOWED`.
**Gaps:** `tests/imports/file-size-ratchet.test.ts` permits this one over-1,000-line file.
**Target spec:** split below 1,000 (`OVER_1000_ALLOWED` in `tests/imports/file-size-ratchet.test.ts` becomes `[]`). **Cut:** no behaviour or RPC changes.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** Wave 0 file-size gate, 21 Sep 2026.

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
| Spending policy | Authority; authority mode; spending permission; Work within limits | Agents | Spending policy |
| Purchase resolution | Purchase status; payment status | Calls; receipt | Purchase resolution |
| Agent | Caller Agent; agent; client; credential | Calls; Agents | Agent |
| Provider | Supplier; supplier/brand; provider hostname | doors; supply; Market | Provider |
| Credit | AE balance; Account balance; Available Balance; Open Balance; Balance & Credit | Tool; Credit; Overview; nav | Credit; Available, Reserved, Total |
| Business | provider profile; Listed Providers | public profile | Business |
| Workspace | Account; organization; Provider workspace | auth; settings | Workspace |
| access grant | Connect agent; Connect Roast Authorization Probe | consent | Approve access; Review access for… |
| Direct key | Legacy credential; secret key | Agents | Direct key |
| Agent count | 1 agents | Agents | 1 Agent |
| grant duration | Stays signed in until in 7 days | Agents | for 7 days after approval |
| listed price | TOTAL PRICE; Provider-listed price | Ask; Market | listed price |
| support context | Help; owner-scoped status read | Support; receipt | Call; We couldn’t open this Call for this workspace |
**Target spec:** canonical terms appear in page copy, machine docs and status labels; replacements happen page by page. **Cut:** synonyms that encode no distinct domain state.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** buyer-spine T4, RegDoors, RegSupplyList, RegSupplyNew, RegDevAdmin, Persona reports, 21 Sep 2026.

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
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** PatternInventory, 21 Sep 2026.

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
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDoors, RegHelpLegal, RegSupplyNew, buyer-spine, 21 Sep 2026.

### C-07 Accessible names and announcements
**Surfaces affected:** Market, Agents, Credit and dialogs.
**Benchmark:** WCAG 2.2 named controls, focus order and live updates. **Incumbent baseline:** one labelled native control per choice and announced result/error changes.
**Current state (LIVE):** keyboard procurement path cannot efficiently search, compare or safely set policy.
**Gaps:** • [A11Y-01] “search is Tab 12; submit moves focus to BODY; no live/status region or result count” (`UNANCHORED`) • [A11Y-02] “91 Tabs to first ‘Add … to comparison,’ then 31 to ‘Compare Tools’” (`UNANCHORED`) • [A11Y-03] unnamed radios and checkbox (`UNANCHORED`) • [A11Y-04] “Done returns focus to BODY” (`UNANCHORED`) • [A11Y-05] “unnamed progressbar” (`UNANCHORED`) • [A11Y-06] “two regions both named ‘Popular Tools’” (`UNANCHORED`) • [A11Y-07] “control what each Agent can do” versus unnamed policy radio (`UNANCHORED`) • [A11Y-08] “A world of Tools, ready to explore” versus 91 stops (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>search</td><td>silent result update</td><td>announce “12 results”; retain deliberate focus</td></tr><tr><td>policy</td><td>empty accessible names</td><td>one labelled native control per choice</td></tr></table>
**Target spec:** search near skip link; count announced; compare bar focused after selection; controls named once; errors linked; dialog restores trigger/created row; landmarks unique. **Cut:** duplicate AX nodes and inert focus targets.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** PersonaAccessibility, 21 Sep 2026.

### C-08 Empty, error and loading states
**Surfaces affected:** all async routes.
**Benchmark:** route-neutral recovery, no layout shift, explicit money outcome. **Incumbent baseline:** `AeEmptyState` and `AeRouteStates`.
**Current state (SOURCE):** 30 AeEmptyState renders coexist with 38 bespoke JSX branches; 32 files use Skeleton.
**Gaps:** PatternInventory §4 (`AeActivity.tsx:85-94`; `AeX402Directory.tsx:253-333`; `CallMoneyFacts.tsx:20-29`); [ST-12] `/owner/credit` never says whether money moved (`UNANCHORED`); Credit says “check system status before repeating a Call” on a non-Call error (`src/components/ae/layout/AeRouteStates.tsx:287-317`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>financial failure</td><td>route-specific ambiguity</td><td>what happened; whether money moved; next action</td></tr></table>
**Target spec:** shared state components; money-moved line on every financial failure; route-neutral copy; no “Call” in non-Call errors; matching skeleton geometry. **Cut:** bespoke branches when shared state fits.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** PatternInventory, ExpectStripe, buyer-spine Credit, 21 Sep 2026.

### C-09 Sandbox versus production visibility
**Surfaces affected:** Agents and Provider connections only.
**Benchmark:** Stripe Test mode and GitHub/Vercel environments. **Incumbent baseline:** environment visible at the resource where consequences occur.
**Current state (LIVE):** Agent creation has Sandbox/Production pills; Provider connection hard-codes production; there is no global toggle.
**Gaps:** [ST-01] “Sandbox appears only as small per-agent pills” (`UNANCHORED`); [GH-20] “connection hard-codes `Environment: production`; no workspace environment switcher” (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>Agent</td><td>small pills</td><td>per-Agent environment pill</td></tr><tr><td>Provider connection</td><td>production text</td><td>explicit environment choice</td></tr></table>
**Target spec:** retain per-Agent pills; require explicit Provider environment; no global test-mode promise until data actually switches. **Cut:** false global mode chrome.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** ExpectStripe, ExpectGitHubVercel, 21 Sep 2026.

### C-10 Overclaims
**Surfaces affected:** Market, Tool detail, Agents, chrome, Provider doors and My tools.
**Benchmark:** every promise has visible current proof. **Incumbent baseline:** factual state copy, not inferred readiness.
**Current state (LIVE):** copy repeatedly outruns catalogue, connection, commercial or payout evidence.
**Gaps:** • [APP-01/SKP-03] “Used recently by other agents” versus “Completed calls 0” (`UNANCHORED`) • [OPS-07/SKP-05] “one Call away” versus multi-step setup / “Connect an Agent first” (`UNANCHORED`) • [DEV-R2-07] new Agent labelled “Legacy credential” (`UNANCHORED`) • [SKP-06] “Connection online” while balances/summaries unavailable (`UNANCHORED`) • [APP-05/JNY-08] “Connect an Agent first” after Agents exist (`UNANCHORED`) • [CFO-27] “You describe the price…” but source required first (`UNANCHORED`) • [CFO-28] “automated AUD payouts” with no schedule/take (`UNANCHORED`) • [DEV-API] “Every public REST operation” with invalid generated examples (`src/modules/discovery/internal/openapi-document.ts:47-58`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>all</td><td>unqualified promise</td><td>measured fact, or remove</td></tr></table>
**Target spec:** each listed phrase is removed or backed by a visible count/state/term; newly created Direct keys never say Legacy. **Cut:** all unsupported superlatives and readiness promises.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** Persona/expectation reports and RegDevAdmin, 21 Sep 2026.

### C-11 Touch targets and mobile primary above fold
**Surfaces affected:** My tools, Owner Market, Add Tool, Calls, Terms, Privacy and correction request.
**Benchmark:** WCAG 2.2 24px minimum, product standard 44px primary targets, mobile primary visible for first job.
**Current state (LIVE):** repeated header utilities are 20×20 or 28×28; source radios are 16px; several first actions start below 844px.
**Gaps:** My tools “Connection icon 20×20 and user menu 28×28” (`UNANCHORED`); Owner Market “utility buttons are 20×20/28×28” (`UNANCHORED`); Add Tool “20/28px header controls and 16px radios” plus CTA y=912 (`SupplySourceTypeSection.tsx:135-263`); [ACT-04] “‘Connection online’ is 20×20px” (`UNANCHORED`); Terms CTA y=967, Privacy y=999, correction y=846 (`UNANCHORED`).
**Copy:** <table><tr><th>where</th><th>current</th><th>target</th></tr><tr><td>interactive hit box</td><td>16/20/28px</td><td>at least 44×44 without enlarging glyph</td></tr></table>
**Target spec:** every named hit box 44×44; primary for the page’s first job above fold at 390×844; no horizontal overflow. **Cut:** decorative mobile content before first action.
**Priority:** P1. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegSupplyList, RegSupplyNew, RegHelpLegal, buyer-spine Calls, 21 Sep 2026.

### C-12 Machine docs consistency
**Surfaces affected:** `/for-agents`, setup snippets, `/developers/api`, `/SKILL.md`, `/llms.txt`, `/openapi.json`, `/glossary.md`, `/mcp`, `/.well-known/*`.
**Benchmark:** OpenAI OpenAPI and llms.txt conventions. **Incumbent baseline:** one host, auth vocabulary, nouns, endpoints and price shape.
**Current state (LIVE):** machine endpoints mostly return deliberate statuses, but their contract facts diverge.
**Gaps:** [DEV-12] advertised glossary returns HTML 404 (`src/routes/glossary[.]md.ts:7-38`); [DEV-13] SKILL hard-codes production (`src/modules/discovery/internal/agent-skill.ts:6-10`); [DEV-14] “AE key”, `agentAccessKey`, `clerk_api_key` (`src/modules/discovery/internal/site-manifest.ts:44`); [DEV-15] “capability purchases”, “paid tools”, “per call” (`src/components/ae/agent-access/home/agent-access-home.contracts.ts:13`).
**Copy:**
| fact | /for-agents | setup snippets | /developers/api | /SKILL.md | /llms.txt | /openapi.json | target |
|---|---|---|---|---|---|---|---|
| base URL | `127.0.0.1:3024/mcp` | `${base}/mcp` | `127.0.0.1:3024` | `https://app.aecon.ai` | `127.0.0.1:3024` | `127.0.0.1:3024` | runtime canonical base |
| auth | absent | Bearer secret | Bearer token | absent | “AE key” | Bearer token | Bearer Agent credential |
| nouns | Tools | capability purchases / paid tools | Tool Call | Tool / Call | Tool / Call | Tool Call | Tool / Quote / Call |
| paths | absent | absent | quote/call | `ae_tool_quote/call` | quote/call | quote/call | linked canonical paths |
| price | absent | A$ per call, GST incl. | ExactAmount plus AUD fields | absent | absent | mixed | one ExactAmount; buyer display per C-02 |
**Target spec:** all advertised docs resolve; one runtime host; one auth name/header; canonical nouns; linked paths; one ExactAmount. **Cut:** dead glossary link and unconfigured signatures from inventory.
**Priority:** P0. **Status:** PENDING. **Verification evidence:** none. **Provenance:** RegDevAdmin, 21 Sep 2026.

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
| 46 | Personal-data export | GH, ST | ABSENT `convex/personalAccount.ts:177-194` | installed Convex Workflow | medium | ADOPT Convex Workflow |
| 47 | Org SSO/SCIM controls | GH, VE | ABSENT `owner.team.tsx:27-44` | Clerk enterprise | high | HOST Clerk enterprise |
| 48 | Spend-anomaly alerts | ST | ABSENT `OwnerNotificationSettings.tsx:54-74` | installed PostHog plus Convex Workflow | high | ADOPT PostHog and Convex Workflow |
| 49 | Command palette | GH, VE | PRESENT `AeCommandPanel.tsx:24-55` | installed cmdk | low | ADOPT cmdk |

### TOP 10 ABSENT THAT DEFINE THE CLASS

1. **Buyer dispute initiation** — money marketplaces need visible recourse; extend Stripe-hosted billing, not a home-grown case system. **Decision:** HOST Stripe Customer Portal.
2. **Incident history** — paid Calls require retrospective outage truth; use Statuspage-class infrastructure. **Decision:** DEFER until status vendor is approved.
3. **Status subscriptions** — agents/operators must learn when retrying is safe; borrow Statuspage delivery. **Decision:** DEFER until status vendor is approved.
4. **Outbound webhooks** — external agents need event push, signatures, retries, and delivery logs; use Svix-class infrastructure. **Decision:** DEFER until event contract and vendor are approved.
5. **Recurring API plans** — fixed per-Call pricing alone misses RapidAPI-style packaged consumption; use Stripe Billing. **Decision:** HOST Stripe Billing; PATTERN-ONLY Treg.
6. **Spend-anomaly alerts** — prepaid autonomous spending needs abuse detection beyond low-balance thresholds; use existing telemetry plus durable notifications. **Decision:** ADOPT PostHog and Convex Workflow.
7. **Per-key IP allowlists** — leaked machine credentials need another containment boundary; enforce at the gateway. **Decision:** DEFER until gateway authority is named.
8. **Org SSO/SCIM controls** — serious provider/buyer teams expect centralized identity lifecycle; use Clerk enterprise features. **Decision:** HOST Clerk enterprise.
9. **Personal-data export** — closure without portable readback is incomplete; orchestrate existing Convex projections. **Decision:** ADOPT Convex Workflow.
10. **Locale switching/i18n** — hard-pinned `en-AU` blocks broader marketplace operation; adopt a maintained i18n library. **Decision:** DEFER until alpha market scope requires it.

## 5. Execution protocol

Rule for every wave: one file per subagent, precondition, verify command or walk step, commit per change. A multi-file change is split unless the files form one indivisible boundary. A row moves PENDING → IN REVIEW only after its change lands. It moves IN REVIEW → VERIFIED only after the live target-spec re-walk is recorded in the required evidence format.

| Wave | Entry condition | Work | Exit condition |
|---|---|---|---|
| A: cross-cutting unblockers | register committed; owners named | C-06 focus ring; C-07 accessible names; C-08 money-moved line; C-10 overclaim removals; C-02 one price | all named rows IN REVIEW, then assertion (preferred) or re-walk, then VERIFIED |
| B: doors and help/legal | Wave A shared primitives IN REVIEW | R-01..R-03 and R-22..R-25; P0 Terms/Privacy truthfulness; door economics | every row IN REVIEW; legal owner confirms facts; assertion (preferred) or re-walk; VERIFIED |
| C: supply | Provider commercial terms available | R-26..R-30; NEW-01 human-delivered path remains PARKED pending Joel; complete all other source, payout, environment and callback gaps | all unparked supply rows IN REVIEW, then assertion (preferred) or re-walk, then VERIFIED |
| D: account, records, dev/admin | Waves A and B stable; buyer spine supplies populated fixtures where required | R-13, R-15..R-19, R-31..R-34; records outside OWNER queue only after W6/W7 contracts settle | all included rows IN REVIEW, role-gate and return-path walks pass, then VERIFIED |
| E: class-gap reuse | corresponding product decision approved; source/license verified | execute ADOPT/HOST items only; PATTERN-ONLY means learn structure without copying restricted code | adopted/hosted feature has live path and source evidence; row VERIFIED |
| Buyer spine in parallel | Joel owns core flow | R-05, R-08, R-10, R-11, R-14, R-20, R-21 under `buyer-spine-stabilisation-plan.md` W2..W7 | seven page passes, then FIND → ALLOW → USE → RECORD proof |

No wave may invent a second authority, status model, money formatter, Tool projection or Provider identity. Existing VERIFIED W-01..W-44 and S-01..S-20 are regression boundaries, not work queues.

## 6. Decisions parked for Joel

- Human-delivered service listing, including scope/deliverable/SLA/acceptance and its relationship to Tool: unblocks R-28, NEW-01 and CFO-21.
- Ask catalogue scope, callable-only versus both catalogues with an explicit split: unblocks R-10 and C-03.
- Whether `/owner` Overview survives and `/owner/market` exists after the spine passes: unblocks R-06, R-16, ACC-04..06 and SUP-08.
- Whether Support gains an on-page form or remains reference-aware mailto: unblocks the post-W7 form decision for R-21.
- Whether recurring plans and buyer disputes enter alpha scope: unblocks class gaps 14 and 15.
- Whether `/developers/discovery` remains public: unblocks R-32 and DEV-06.
