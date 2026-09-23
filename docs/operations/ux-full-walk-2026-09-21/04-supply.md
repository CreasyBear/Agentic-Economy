# Walker 4 — Supplier / Provider pages

**Date:** 21 September 2026  
**App:** `http://127.0.0.1:3024`  
**Method:** code + browser + interpretation. No implementation. No sign-in, purchase, connection, payout, or account mutation.  
**Law applied:** Provider workspace group + eight-rule page contract in `docs/designs/2026-09-21-platform-experience-audit.md`; annex evidence in `docs/improvements/2026-09-21/platform-experience/provider.md`; CONTEXT: Publication ≠ Listing ≠ Tool; earnings ≠ Payout; ask only what you save (ABN). Buyer must not mistake this for Saved / connected Tools.

**Walk conditions**

- Public surfaces rendered: `/for-providers`, `/$slug` dummy and Market-hostname slugs, Market Providers tab, signed-out header menu.
- Every `/owner/*` supply route redirected to Clerk sign-in. Destination pages below the gate are judged from current source plus the intercept that actually rendered.
- `GET /api/businesses` returned `{ kind: "ok", page: [] }`. There is no live published AE Provider listing to open.
- Compact/keyboard pass was not run beyond the signed-out menu drawer. Desktop only.

**Group verdict:** **FAIL**

The public entrance tells a Provider they are listing supply. The signed-in destination is still labelled **My tools**, sits in the same buyer nav as Market / Agents / Calls / Saved, and the sign-in heading says **Sign in to manage Tools**. A buyer can reasonably think they are opening saved or connected Tools. The landing also shows Market/x402 directory Tools as “published facts” while the canonical public business catalogue is empty, so Publication, Listing, and directory metadata collapse in the first Provider screen.

---

## Group findings (apply across the family)

1. **Buyer/Provider context is not unmistakable.** Signed-out menu: Market, For agents, For providers, Sign in. After click, `/owner/operations` becomes “Sign in to manage Tools” and the signed-in nav item is “My tools”. Market already has a **Saved** tab. The law is failed at the entrance, before any inventory renders.
2. **Publication ≠ Listing is not held on the public landing.** `/for-providers` kicker “Published facts” / “Tools agents can find now” is filled from Market catalogue projection (`src/lib/server/supply-landing.functions.ts:16-20`), not admitted AE Publications. Visiting a shown hostname as `/$slug` (`/api.onesource.io`) is “No provider at this address”.
3. **Ask-only-what-you-save (ABN) remains a confirmed contract mismatch.** Wizard requires ABN and claims GST / Tax Invoice use. Save callback persists only name and website. Reconfirmed in source this walk.
4. **Earnings is a workspace section, not a route.** `#earnings` is the destination. Source copy mostly keeps earnings ≠ Payout. Activation copy does not: it promises “selling tools and receiving automated AUD payouts” before a Tool exists.
5. **Connection recovery still points at a missing route.** Credential-lost / cleanup CTAs use `/owner/supply/connections`. Live routes are `/owner/supply/connections/new` and `.../oauth/callback`. The working panel is `/owner/operations#provider-connections`, and `#provider-connections` does not auto-open.

---

## 1. `/for-providers`

### Job
Decide whether I can list one bounded Tool, what a check costs me, and start the owner flow without thinking this is buyer Saved Tools.

### Code
- Route / head: `src/routes/for-providers.tsx:8-24` — title **Publish a Tool**; nav label **For providers**.
- Page: `src/components/ae/supply/AeSupplyLanding.tsx:20-159`.
- Proof rail: `src/components/ae/supply/AeSupplyAgentProof.tsx:20-54`.
- Listings source: `src/lib/server/supply-landing.functions.ts:16-20` (`readMarketRouteProjection`, not public businesses).

### Visual quotes
- Document title: `Publish a Tool | Agentic Economy`.
- Eyebrow: `Providers`. H1: `List a Tool.`
- Offer: `List one Tool agents can inspect and call. You describe the price, access, effects, and evidence; Agentic Economy records it as a Tool.`
- Primary link: `List a Tool` → `/owner/operations`.
- Fit kicker: `Before you sign in` / `Check whether your Tool is a fit.`
- Check caveat: `A successful check does not publish the Tool, create earnings, or guarantee delivery.`
- Steps heading: `How to publish` / `Steps to list a Tool` — Choose one Tool → Add its source → Describe and check it → Submit, then check status (`A submitted Tool is not yet published`).
- Control: `You control the listing and the source. … Publication means the current Tool passed Agentic Economy’s admission and readiness checks; it does not guarantee demand, payment, delivery, or payout.`
- Secondary link: `Manage listed Tools`.
- Proof kicker: `Published facts` / `What agents can inspect` / `Tools agents can find now` — Chain Erc20 Balance, `x402 api.onesource.io`, `<A$0.01`; StableEnrich; Exa.
- Signed-out menu (from this family): `Market` · `For agents` · `For providers` · `Sign in`. No “My tools”.

### Interpretation
First screen job is clear: list one Tool, not an app. Check vs publication vs earnings vs payout is said correctly in the caveats. The page then spends the last viewport proving “what agents can inspect” with Market/x402 cards that are not AE-published Provider listings. A visitor who clicks `List a Tool` is sent to owner operations, not Add Tool. Vocabulary flips among List, Publish, Listing, and Published facts on one page. The hero is a Provider entrance; the proof rail is a buyer catalogue.

### Verdict
**FAIL** — entrance and fit copy pass; the proof rail and List/Publish/Listing mix fail Publication ≠ Listing and bury the next action under directory examples.

### Evidence
Rendered desktop snapshot + full-page screenshot of `/for-providers`. `GET /api/businesses` empty. Hostname from the proof rail fails as `/$slug` (page 7). No mutation.

### Handoff
Keep the fit/check/steps copy. Fill “Tools agents can find now” only with admitted/published AE Tools, or label the rail as indexed x402 metadata. Point the primary CTA at the actual next owner state (identity if missing, Add Tool if identity exists). One verb: publish or list, not both as if they were the same act.

---

## 2. `/owner/operations` — My tools (and sign-in intercept)

### Job
See owned supply, the next blocker, and add / inspect / earn / leave. A buyer arriving here must immediately know this is Provider inventory, not Saved or connected Tools.

### Code
- Route / nav: `src/routes/_operator/owner.operations.tsx:16-58` — nav label **My tools**, group **Supply**, signed-in header item, `mobilePrimary`.
- Page title: `src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx:29-34` — **My tools** / `Publish the exact tools agents can inspect and call.`
- First visit: `WorkspaceInventoryGate` → wizard (`…/WorkspaceInventoryGate.tsx:8-16`).
- Populated body: Tools, Tool availability, Earnings, collapsed `Provider settings and administration` (`AeProviderWorkspace.tsx:106-147`).
- Inventory table: Tool · Status · Price · Usage · Test Run / Activity (`AeOwnerOfferings.tsx:114-194`). Compact row also has continuation **View status** plus **Test Run** and **Activity** (`:262-311`).
- Sign-in copy: `src/components/ae/auth/sign-in/sign-in.contracts.ts:23-36`.
- Command palette: `tools-search-page.contracts.ts:77-80` — label **My tools**, keywords include publish/provider.
- Mobile: `AeOwnerMobileNavigation.tsx:15-31` — Market, Agents, Calls, **My tools**.

### Visual quotes
Reached `/owner/operations` signed out.

- Redirect: `/sign-in?redirect=%2Fowner%2Foperations`.
- H1: `Sign in to manage Tools`.
- Body: `Use email, Google, GitHub, or a passkey. After you sign in, you’ll return to your Provider workspace.`
- Clerk: GitHub, Google, email, Continue, Sign up.
- Escape: `Back to market`.
- Signed-out menu never shows My tools; the destination does.

### Interpretation
The intercept body says Provider workspace. The heading does not. “Manage Tools” next to Market’s Saved tab is the exact buyer mistake the law forbids. Once signed in, source still titles the page **My tools** and places it in buyer primary nav. Description (“Publish the exact tools…”) is the only Provider cue; the label is the buyer word. First-visit wizard (no tools) promises selling and AUD payouts (page 8). Populated page stacks four jobs; there is no first-viewport “next action” besides Add Tool. Row actions disagree: table **Test Run**, compact **View status** + **Test Run**, continuation **Open Tool**. Test Run opens maintenance, not a buyer Call, but the label invites the collapse.

### Verdict
**FAIL** — rendered intercept fails S3 / Provider-group entrance. Source destination keeps the same label. Populated composition **NOT CHECKED** in browser (auth).

### Evidence
Live intercept screenshot. Source of workspace, nav, wizard, and inventory. Prior annex finding 3 and 6. No owner session.

### Handoff
Rename the signed-in destination and sign-in heading to a Provider phrase (for example “Your listed Tools” / “Sign in to list a Tool”). Keep the URL. Put one next-action line above the four sections. Make the row action match the detail job (status / continue setup), and keep Test Run secondary and labelled as a readiness check.

---

## 3. `/owner/operations/new` — Add Tool

### Job
Connect one source, pick one candidate, declare terms, submit for validation. Return to a draft without reconstructing the source.

### Code
- Route: `src/routes/_operator/owner.operations.new.tsx:15-75` — title **Add Tool**; search `connection` / `environment` / `draft`.
- Page: `AeOwnerSupplySourceStartPage.tsx:54` — breadcrumbs My tools → Add Tool; description `Connect the interface you already operate.`
- Stages: `AeSupplySourceNativeStart.tsx:21-23, 174-197` — source → tool → terms → review.
- Source first screen: `SupplySourceTypeSection.tsx:136-150` — x402 “Recommended for alpha”.
- Candidates: `SupplyCandidateSection.tsx:17` — unsupported remain visible with correction.
- Terms/review: `SupplyPublicationFlow.tsx:95-150` — buyer-visible facts, connection, consequences, attestations, **Submit for validation**.
- Identity missing: alert + `Return to Tools` (`AeOwnerSupplySourceStartPage.tsx:55-66`).

### Visual quotes
Signed out: same intercept as operations.

- URL: `/sign-in?redirect=%2Fowner%2Foperations%2Fnew`.
- H1 still: `Sign in to manage Tools`.
- Body still: return to `your Provider workspace` — not “Add Tool” or “publish”.

### Interpretation
The four-stage flow in source matches the page contract and keeps Publication as admission, not demand. Draft is in the URL. Secrets stay on the connection handoff. Terms still ask many decisions at once (name, category, area, availability, price, connection, three consequences, classification) — annex finding 5, still VERIFY without a signed-in walk. The intercept does not name this task. Wizard step 3 (page 8) labels the same destination `Import OpenAPI / MCP Tool`, fighting “Add Tool” / “List a Tool” / “Publish a Tool”.

### Verdict
**FAIL** on rendered entry (generic Tools heading). Destination flow **NOT CHECKED** visually; source contract is otherwise close to Pass if the signed-in first screen is as written.

### Evidence
Live redirect. Source of stages, terms, and resume. Focused test cited in annex, not re-run.

### Handoff
Task-specific sign-in: “Sign in to add a Tool”. After identity exists, `/for-providers` should land here. Do not add stages. If a signed-in walk shows terms overload, group buyer-visible / access / effects without hiding attestations.

---

## 4. `/owner/operations/$toolRef` — Tool maintenance (fake `not-a-real-tool`)

### Job
Know publication vs buyer availability vs source health vs observed delivery, take one continuation, withdraw or republish without inventing a buyer Call.

### Code
- Route: `src/routes/_operator/owner.operations.$toolRef.tsx:11-52` — slug or `offering:` ref; head **Tool status**.
- Available page: `AeOwnerToolDetailPage.tsx:83-104` — title = Tool name; `Current publication, source health, delivery and Qualified Use.`
- Not found: `AeOwnerToolDetailPage.tsx:108-133` — **Tool not found** / `This Tool is not part of the current Provider workspace.` / `Return to Tools`.
- Unavailable: **Tool status unavailable** / no change claimed.
- Detail: `AeProviderToolDetail.tsx:74-180` — state + `Available to buyers` / `Not available to buyers`; one reason; one primary action; facts; Delivery and Qualified Use separate; technical details disclosure; Withdraw / Republish confirmations.
- Dead handoff: `provider-tool-status.ts:216-241` — CTA `/owner/supply/connections`.
- Playground: `AeProviderToolDetail.tsx:141-159` plus `AeToolTestPlayground.tsx:39` — **Interactive Test Playground**; `onRecheck` then local `{ status: 200, verifiedAt }`.

### Visual quotes
- Redirect: `/sign-in?redirect=%2Fowner%2Foperations%2Fnot-a-real-tool`.
- Same heading: `Sign in to manage Tools`.
- Not-found chrome never rendered. Auth runs before the fake ref is judged.

### Interpretation
Source detail is the strongest page in this group: publication, routeability, delivery, and payout stay separate. Two failures sit on top. (1) Recovery links to a route that does not exist, so Action required can be a dead end. (2) Recheck is presented as a test playground that returns HTTP 200 / verifiedAt — a Provider can read that as a successful buyer Call, Charge, or earning. Not-found copy is usable once signed in. The URL itself is owner maintenance; the sign-in heading again sounds like buyer tool management.

### Verdict
**FAIL** on handoff + readiness-check labelling (source). Rendered not-found **NOT CHECKED** (auth). Intercept same as page 2.

### Evidence
Live fake-ref redirect. Source of not-found, status facts, playground, and `/owner/supply/connections` CTA. Annex findings 2 and 7.

### Handoff
Point credential CTAs at `/owner/operations#provider-connections` (or `provider-connection-$ref`) and make that hash open the panel. Relabel playground to “Run readiness check” and never show a synthetic 200 as delivery. Keep Withdraw/Republish confirmations.

---

## 5. `/owner/supply/connections/new` — Connect Provider

### Job
Finish the one credential the current source needs, then return to Add Tool. Cancel without losing the draft.

### Code
- Route: `src/routes/_operator/owner.supply.connections.new.tsx:8-27` — requires `?attempt=`; else `{ kind: 'not_found' }`; title **Connect Provider**.
- Shell: `AeConnectionHandoff.tsx:65-76` — breadcrumbs My tools → Add Tool → Connect Provider; description `Connect the credential required by this Provider source.` `currentPath` is wrongly `/owner/operations/new`.
- States: unavailable / consumed / expired / http_pending / mcp_pending (`AeConnectionHandoff.tsx:18-60`).
- HTTP: password field, `AE stores it in the Provider connection and will not show it again.`, **Connect Provider** / Cancel (`HttpCredentialForm.tsx:19-55`).
- MCP: `Sign in to {origin}. … returns you to Add Tool.` **Continue to sign in** / Cancel (`McpOAuthStartPanel.tsx:16-32`).
- Return: `useConnectionHandoff.ts:68-70` → `/owner/operations/new` with connection / draft / environment.

### Visual quotes
- Redirect: `/sign-in?redirect=%2Fowner%2Fsupply%2Fconnections%2Fnew`.
- Heading: `Sign in to manage Tools`.
- No attempt query: even after sign-in, loader is `not_found` → `This connection request is unavailable` / `Return to Add Tool` (`AeConnectionHandoff.tsx:18-23`).

### Interpretation
This is a handoff, not a stable destination. Source states are specific and send the person back to Add Tool. Secrets are not echoed. Opening the URL without an attempt is a safe dead-end with a return. The live intercept does not say a connection is in progress. `currentPath` pointing at Add Tool will mark the wrong crumb current. This route is **not** the recovery target used by tool detail (that path omits `/new`).

### Verdict
**PARTIAL** in source (good handoff, wrong currentPath, unnamed intercept). Rendered pending/success **NOT CHECKED**.

### Evidence
Live redirect without `attempt`. Source of states and return search. No credential typed.

### Handoff
Keep one-attempt handoff. Fix `currentPath`. Sign-in: “Sign in to finish this source connection.” Do not invent `/owner/supply/connections` as a list page unless the recovery CTA is wired to the workspace panel.

---

## 6. `/owner/supply/connections/oauth/callback`

### Job
Finish MCP sign-in, or explain refusal, and return to the same Add Tool draft. Not a place the user should “visit”.

### Code
- Route: `src/routes/_operator/owner.supply.connections.oauth.callback.tsx:19-59`.
- No `attempt` → `{ kind: 'refused', code: 'authorization_denied' }` (`:24-26`).
- Success `connected` / `replayed` → redirect replace to `/owner/operations/new` with connection / environment / draft (`:33-44`).
- Failure page: `AeOwnerMcpOAuthCallback.tsx:27-61` — title **Service connection**; **Service connected** / **Service not connected** / **Connection status unavailable**; **Return to Add Tool**.
- Head: `referrer: no-referrer`.

### Visual quotes
- Redirect: `/sign-in?redirect=%2Fowner%2Fsupply%2Fconnections%2Foauth%2Fcallback`.
- Same `Sign in to manage Tools`.
- Callback itself never painted. If OAuth returns here without a live Clerk session, the user is asked to sign in, then sent back to a callback that may no longer have a usable `code`.

### Interpretation
Success path is correct: this URL should disappear. Failure copy is plain and returns to Add Tool. Auth-gating the callback is the risk. A Provider who left AE to the source IdP can land on “manage Tools” instead of “connection failed; retry from Add Tool”. `authorization_denied` is also the no-attempt case, so a bookmarked callback looks like the user refused consent.

### Verdict
**FAIL** on the rendered gate (wrong job, dangerous return). Failure/success UI **NOT CHECKED**; source failure page would Pass if it actually rendered.

### Evidence
Live callback-without-params redirect. Source of refuse/success redirect. No OAuth performed.

### Handoff
If the session is missing, say the connection could not be finished and return to Add Tool — do not run a generic Tools sign-in that consumes the callback URL. Keep replace-redirect on success.

---

## 7. `/$slug` public business

### Job
Inspect one Provider’s listed Tools, price, and readiness — or understand that nothing is published here. This is a Listing, not owner operations and not a Market hostname.

### Code
- Route: `src/routes/$slug.tsx:14-61`.
- Page: `AePublicBusiness.tsx` → `AeProviderListingPage.tsx:37-134`.
- Header: eyebrow **Provider**, `Compare this provider’s listed tools…`, meta `{n} listed · {n} ready now`.
- Empty listed tools: `No tools listed` / `This provider profile remains visible while its catalogue is prepared.` (`AeProviderListingPage.tsx:63-67`).
- Read path omits unpublished or zero-offering businesses (`convex/catalogPublicReads.ts:344-355`), so that empty copy cannot appear through the public route.
- Rows: Ready now / Setup required / Inspect only; Category, Price, Availability; **Open provider route** (external), not `/tools/$toolRef`.
- Not found: `PublicBusinessNotFound.tsx:14-39` — `No provider at this address` / `Nothing is published here.` Actions: **Browse catalog**, **Publish a Tool**.
- Head on not-found: `Page not found | Agentic Economy` (`public-route.ts:52-57`).
- Market Providers: hostnames, **Explore Tools** stays on Market (`DirectoryProvidersIndex.tsx:33-48`). No link to `/$slug`.

### Visual quotes
Dummy `/no-such-provider-xyz` and Market hostname `/api.onesource.io` (shown on `/for-providers` as a findable Tool):

- Title: `Page not found | Agentic Economy`.
- H1: `No provider at this address`.
- Body: `Nothing is published here. Check the address, or browse the catalogue.`
- Actions: `Browse catalog` · `Publish a Tool`.
- Menu still: Market, For agents, For providers.
- `GET /api/businesses`: `page: []`.
- Market `?view=providers`: `Explore Providers` then `Provider catalogue temporarily unavailable` / `The discovery service could not be reached.`

### Interpretation
Not-found is a clean page: one job, two exits, Provider vs buyer split (browse vs publish). Document title “Page not found” is weaker than the H1. There is no populated listing in this environment, so the happy path is unseen. The important cross-page fact: a hostname a buyer can already “find” on Market and on the Provider landing is not a Listing. Empty-profile copy in source claims the profile remains visible; the read path hides it. Populated rows send people off-site (“Open provider route”) instead of to AE Tool detail — Listing and callable Tool split, but the buyer continuation may leave AE.

### Verdict
**PASS** for dummy / hostname not-found. **FAIL** for empty-copy vs read path (source) and for landing/Market identity mismatch. Populated listing **NOT CHECKED**.

### Evidence
Two live not-found URLs, businesses API, Market Providers unavailable state, listing source. Annex finding 4.

### Handoff
Either publish the empty profile and tell the truth, or drop that sentence. Do not treat directory hostnames as `/$slug`. When a listing exists, make the row action open the AE Tool if one is admitted; keep host metadata labelled as metadata.

---

## 8. Provider earnings — section of `/owner/operations`, not a route

### Job
See source-recorded earnings, payout readiness, and reach hosted payout controls. Do not treat setup, test, publication, or Stripe KYC as earnings.

### Code
- Section: `ProviderWorkspaceEarningsSection.tsx:28-45` — `id="earnings"`, **Earnings** / `Provider earnings and payout readiness.` Summary: **Payout readiness** `N ready · N need attention` / **Manage earnings**.
- Hash open: `useProviderWorkspaceSheets.ts:117` — `#earnings` opens the deferred card.
- Card: `AeSupplyEarningsCard.tsx:60-68` — first 10 currencies; `Setup or test calls do not create earnings.`
- Truncation: `:131-135` — latest 100 ledger entries; totals may be incomplete.
- Empty: `EarningsEmptyState.tsx:8-38` — no account / source error / unauthenticated; setup/test do not create earnings.
- Facts: `EarningsFactsList.tsx:14-19` — `{currency} earnings` / `Source-recorded provider earnings and payout state.`
- Actions: `PayoutActionBar.tsx:45-73` — Review payout, **View Bank Payouts on Stripe**, setup / continue onboarding. Stripe-hosted; no bank fields in AE.
- Wizard contradiction: `AeSupplierOnboardingWizard.tsx:51-56` — **Supplier activation** / `Complete the 3-step checklist to start selling tools and receiving automated AUD payouts.`
- Payouts step: `PayoutsStep.tsx:19-65` — Stripe Express, skip allowed, **Action Required** if not connected.
- Identity save drops ABN: wizard sends `abn` (`useSupplierOnboardingWizard.ts:86-90`); workspace save uses `{ name, website }` only (`useProviderWorkspaceInventory.ts:28-37`); mutation has no ABN (`provider-identity.functions.ts:25-30`).

### Visual quotes
Section not reachable signed out. Adjacent activation copy in source that will render on first visit:

- `Supplier activation`
- `Complete the 3-step checklist to start selling tools and receiving automated AUD payouts.`
- Step 1: `Business Profile & Tax Facts` / ABN `for GST attribution and Australian Tax Invoice issuance.` / **Continue to Payouts**
- Step 2: `Connect Bank Account via Stripe Express` / `Payout Status` / **Set up Payouts with Stripe** / **Skip for now**
- Step 3: `Add Your First Tool` / `Import OpenAPI / MCP Tool`

### Interpretation
The earnings section in source is the right object: recorded earnings, separate payout readiness, hosted Stripe, honest caps. It is deferred behind **Manage earnings**, so a cold owner may not see the distinction until they open it. Activation, which *does* render before any Tool exists, treats identity + optional payout + first Tool as one “start selling and receiving payouts” job. That is the earnings ≠ Payout and publication ≠ selling failure. ABN is asked as a tax fact and discarded.

### Verdict
**FAIL** for activation copy and ABN (will render on first owner visit). Earnings card itself **NOT CHECKED** visually; source would Pass the section contract if the wizard did not contradict it.

### Evidence
Source of section, card, wizard, identity save. Live workspace was the sign-in gate. Annex findings 1, 3, 8.

### Handoff
Stop claiming selling or AUD payouts until a Tool is published and a payout account is ready. Remove ABN (and the Tax Invoice sentence) until a save/readback exists. Keep `#earnings`, truncation, and Stripe-hosted actions.

---

## Page-contract scoreboard

| Page / state | Job clear? | Primary action predicts result? | Exit / return? | States | Hierarchy | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `/for-providers` | Yes, then diluted by directory proof | List a Tool → owner ops, not Add Tool | Manage listed Tools | Error rail exists; unused this walk | Fit/steps good; proof is a second product | **FAIL** |
| `/owner/operations` intercept | Heading no; body yes | Continue = Clerk, not a Tool | Back to market | Sign-in only | Provider cue is secondary | **FAIL** |
| `/owner/operations` destination | Title no (My tools) | Add Tool yes; rows mixed | — | Loading/empty/error in source | Four jobs, no next-action | **FAIL** (source + intercept) |
| `/owner/operations/new` | Source yes | Submit for validation yes | Breadcrumb My tools | Resume/unavailable in source | Terms dense (VERIFY) | **FAIL** intercept; dest. **NOT CHECKED** |
| `/owner/operations/$toolRef` | Source yes | Recheck vs playground no; dead connections href | Return to Tools | Not-found in source, gated | Status vs delivery good | **FAIL** (source) |
| `/owner/supply/connections/new` | Source yes | Connect / sign in / return | Return to Add Tool | not_found without attempt | Handoff, not a hub | **PARTIAL** |
| OAuth callback | Source yes | Success should vanish | Return to Add Tool | Auth gate steals it | Should not be a page | **FAIL** intercept |
| `/$slug` not-found | Yes | Browse / Publish | Both present | Dummy + hostname checked | Clean | **PASS** |
| `/$slug` populated | — | — | — | No published business | — | **NOT CHECKED** |
| Earnings section | Source yes | Manage earnings / Stripe | Hash + hosted | Empty/truncation in source | Collapsed; wizard lies | **FAIL** wizard/ABN |

Site rules most at risk: **S2** (My tools is not a stable Provider name), **S3** (buyer vs Provider language), **S6** (directory examples and payout promises before the decision they support).

---

## What this walker could not see

- Signed-in empty wizard, populated inventory, `#earnings`, `#provider-connections`, `#offboarding`.
- Add Tool stages after a real source.
- Tool detail for a live offering, including playground and Withdraw.
- Connection HTTP/MCP pending or OAuth success.
- A published `/$slug` listing.
- Compact and keyboard traversal of owner chrome.

Those are **NOT CHECKED**, not passes. The intercept, public landing, empty businesses catalogue, and hostname/`/$slug` mismatch are enough to fail the group without them.

---

## Smallest honest repairs (handoff only)

1. Make every Provider sign-in and the signed-in nav item say this is supply you publish, not Tools you saved.
2. Stop putting Market/x402 cards under “Published facts” on `/for-providers`.
3. Persist ABN or stop asking for it and stop claiming Tax Invoices.
4. Repair connection CTAs to the workspace panel that exists.
5. Make activation state copy match identity / payout-ready / published as separate facts.
6. Label readiness check as readiness check.

Do not add a Provider Center or a new earnings route to fix this.
