# Platform cohesion RFC: one object, one page, one spine

Date: 23 September 2026  
Version: 2  
Status: proposed, design review pending  
Decision owner: Joel  
Scope: public listings, account settings, navigation, money traceability and signed-in chat purchasing. This RFC describes a target, not shipped behaviour.

## 1. Problem and thesis

A weather search showed 12 Market results but two header-command matches; a directory Tool opened a Provider-led endpoint page while an admitted Tool opened a different inspector. A Provider row returned to a filtered Tool list rather than a Provider profile (`agent://LiveBrowseHostility/report`; `/tmp/ax-hostility/LiveBrowseHostility/dev-03-weather-results-settled.webp`; `/tmp/ax-hostility/LiveBrowseHostility/dev-08-command-weather-settled.webp`; `/tmp/ax-hostility/LiveBrowseHostility/procure-03-provider-row-action.webp`). Signed-in account Security and Clerk API keys navigated to 404, while AE Team and Clerk Members showed different names and roles (`agent://LiveSignedInHostility/report`; `/tmp/ax-hostility/LiveSignedInHostility/05-settings-clerk-security-loaded.webp`; `/tmp/ax-hostility/LiveSignedInHostility/10-clerk-api-keys-404.webp`; `/tmp/ax-hostility/LiveSignedInHostility/68-team-loaded.webp`; `/tmp/ax-hostility/LiveSignedInHostility/51-workspace-profile-loaded.webp`). These are not eight independent visual defects: identity, facts, authority and destinations change as the user moves.

**Thesis: one object, one page, one spine.** Registry owns the listing read model; domain owners still own publication, Business, money and access. The page keeps one identity and honest fact grammar across its lifecycle; navigation takes the user to that object, not another search or nested app. A model suggestion never constitutes a purchase approval.

## 2. Goals and non-goals

**Goals:** a canonical Tool page per ToolRef and durable Provider/Business portfolio; one SearchEnvelope for Market and header Find Tools; direct, route-based settings; one header navigation spine with a compact mobile bar; Credit-to-Call-to-Tool/Provider traceability; signed-in owner Quote and Call in chat after an explicit per-spend approval; zero document-level overflow at 390px; contextual errors and reusable object families.

**Non-goals:** no fabricated reviews, stars, uptime, latency or live availability; no Clerk Billing as AE Credit; no Clerk API key as AE agent key; no second Business/Tool authority store; no synthetic principal, bypass of agent-key policy or automatic money action from model prose. Jev multi-call bundling is a future direction, **deferred**. Do not claim a directory endpoint is an admitted Tool or a historical provider-reported Call is an AE-completed Call.

## 3. Reference designs adapted

| Pattern | AE adaptation, not copied |
|---|---|
| Airbnb listing and reciprocal host profile ([listing](https://www.airbnb.com/rooms/981205658093560888), [host](https://www.airbnb.com/users/show/149713989), [review eligibility](https://www.airbnb.com/help/article/13)) | Outcome, evidence, price and availability precede terms; Tool and Provider link both ways. No stars or guest-style social proof without real eligible observations (`agent://RefListingGrammar/report`). |
| Maps place ([place](https://www.google.com/maps/place/State+Library+Victoria/), [popular-times rule](https://support.google.com/maps/answer/11323117?hl=en)) | Answer “callable now?” beside identity; omit popularity/health time-series without adequate measured data. No geographic metaphor for digital-only Tools (`agent://RefListingGrammar/report`). |
| Vercel Marketplace ([listing](https://vercel.com/marketplace/supabase)) | Put exact developer prerequisites and copyable command near the decision, but Quote and policy approval replace Install for a chargeable Call (`agent://RefListingGrammar/report`). |
| Stripe, Linear, Vercel and GitHub settings ([Stripe](https://docs.stripe.com/dashboard/basics), [Linear](https://linear.app/docs/workspaces), [Vercel](https://vercel.com/docs/accounts), [GitHub](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/accessing-your-organizations-settings)) | Account identity, workspace membership, money and developer access are distinct destinations, not a tab with links. Their RBAC, billing and credential models are not adopted (`agent://RefSettingsIA/report`). |
| Clerk [UserProfile](https://clerk.com/docs/tanstack-react-start/reference/components/user/user-profile) and [UserButton](https://clerk.com/docs/react/reference/components/user/user-button) | Full-page path-routed personal account/profile and its internal catch-all; AE owns workspace/credit/agent keys. Avoid a second AE subnav within Clerk's own page (`agent://RefSettingsIA/report`). |

## 4. Functional and non-functional requirements

| ID | Requirement |
|---|---|
| F1 | Registry **MUST** project the x402 directory DTO, admitted `PublicToolDescriptor` and Business catalogue into one `ListingProjection`; every fact, including title, summary and Provider name, **MUST** carry source ref, provenance, scope and explicit absence. Catalogue endpoint → ToolRef joins **MUST** use the existing unique exact map (offering revision, access-path ref, endpoint URL and HTTP method); unmatched or ambiguous endpoints remain catalogue-only (`src/modules/registry/internal/services-api-projection.ts:193-215`). No name/host identity joins. |
| F2 | One canonical Tool page **MUST** retain title, accountable Provider and section geometry through admission; readiness/admission appears in facts, not a whole-page swap. A directory-only row without a ToolRef retains its source URL and says “directory listing, not callable through AE”; a verified Tool join resolves that URL to the ToolRef page. A directory hostname is a **Host grouping**, not a Provider or Business: its dedicated host/source-labelled page shows sourced Tools and facts only (`src/modules/market/x402-directory.server.ts:195-199`). Only an explicitly verified Business join permits a Provider portfolio page, accountable identity and reciprocal Business ↔ Tool claims. Neither page returns to a filtered search loop. |
| F3 | Header Find Tools and Market **MUST** consume the same registry `SearchEnvelope`; counts **MUST** share corpus, query and eligibility semantics. Filters may narrow with a labelled count. No independent header matcher (`src/modules/registry/tool-choice-contracts.ts:347-361`; `agent://LiveBrowseHostility/report`). |
| F4 | Tool detail **MUST** order one-line outcome → conditional, sourced price/readiness/payment/auth facts → evidence plus accountable identity → anchored Start panel. The full example follows the facts. The Start panel **MUST** offer one state-dependent primary action (Quote if eligible; otherwise setup, status or alternative), with Try in chat, copy CLI/MCP and existing Save/Compare as quiet contextual secondary actions that state charge behaviour. Human names lead; Operation IDs and schema belong under Technical. Mobile Start is in-flow after the decision group, with at most one constrained sticky primary above bottom navigation. A whole browse card links to Tool detail without a redundant Open button. |
| F5 | Settings **MUST** have direct routes and one authoritative AE workspace identity/role vocabulary; named people replace raw `user_…` identifiers. Clerk `UserProfile` **MUST** route at `/owner/settings/account/$` with path routing, matching catch-all and `UserButton` navigation mode. Hide Clerk's API-keys page; AE Agent keys remain the product concept. Clerk `OrganizationProfile` stays only if the Clerk organisation maps 1:1 to the active AE workspace; otherwise remove it. One workspace name appears everywhere. |
| F6 | The header dropdown **MUST** be the only cross-product spine. Mobile **MUST** have a compact bottom bar with exactly the same top-level destinations and no separate More sheet; the regrouped dropdown supplies overflow. Remove unmounted `AeAppSidebar` and `SidebarProvider`/`SidebarInset` wiring (`agent://UiInventoryScout/report`; `src/components/ae/layout/AeAppShell.tsx:26-100`). |
| F7 | Credit ledger rows **MUST** link to their Call receipts where a Call exists; receipts **MUST** link to canonical Tool and Provider pages. Funding invoices remain distinct from Call receipts. Unknown settlement remains unknown, never shown as paid or refunded (`agent://UiInventoryScout/report`; `/tmp/ax-hostility/LiveSignedInHostility/25-credit-ledger.webp`). |
| F8 | Signed-in owners **MUST** be able to Quote and Call in chat through an owner-scoped, issued agent key/grant and `TrustedChatAuthority`. Each spend **MUST** present Tool, Provider, exact Quote price and remaining cap in a human-controlled in-chat confirmation card before Call; the Call result **MUST** render as a result card. Anonymous chat remains non-purchasing. |
| N1 | At 390px and 320px every route **MUST** reflow without document overflow, including 200% text zoom; tables **MUST** become stacked cards below `md` that retain labelled column facts, row identity, row actions/links and reading order, including ledger rows. At 1440px the same objects/actions remain available; actions must not be obscured by mobile navigation or safe areas. |
| N2 | The key-facts row is **conditional**: show only sourced facts with provenance/freshness, fixed/indicative/range/quote-required price with currency and per-Call basis, and readiness as observed, unknown or stale. Omit unsupported payment/auth chips rather than filling slots. Provider-declared activity is not independently observed AE activity. |
| N3 | Error boundaries **MUST** name the affected surface and a useful recovery. “Nothing was charged” **MUST** appear only on money routes where payment certainty supports it, never on profile edits (`/tmp/ax-hostility/LiveSignedInHostility/82-clerk-update-profile-loaded.webp`). |
| N4 | The minimal reusable set **SHOULD** be Tool card/detail, Provider identity/portfolio, Host grouping, Quote confirmation and Call outcome/receipt, sharing factual leaves rather than a universal object shell. Use semantic tokens and shared type scale; remove hard-coded browser theme colour (`src/components/ui/theme-meta.ts:1-2`; `src/styles/globals.css:214-216`). Routes remain thin; `.tsx` houses only its own props type. |

## 5. Target information architecture and sketches

```text
/market                        Find Tools, one SearchEnvelope, category/filter state
/tools/$toolRef                canonical Tool detail by admitted ToolRef
/tools/$providerHost/$slug     directory source identity; verified join resolves ToolRef
/providers/$providerHost       directory Host grouping, NOT a Business profile
/$slug                         verified Provider = Business portfolio, reciprocal Tools
/t/new | /t/$thread             discover → Quote → owner confirm → Call/result
/owner/settings                 settings shell, direct destination links
  /account/$                    Clerk UserProfile path routing + catch-all
  /notifications /security-history /privacy
  /workspace /team /tax
  /membership/$                 Clerk OrganizationProfile only for 1:1 mapping
  /credit /billing              AE Credit, methods, receipts
  /agent-keys /integrations     AE-native developer controls
/activity → /calls/$callRef → /tools/$toolRef → /$providerSlug
```

Existing `/owner/team`, `/owner/workspace` and `/owner/credit` links need a clean route cutover, not permanent parallel homes; preserve deep-link context through redirects only during cutover. An account Clerk subroute is not another AE settings page. The conditional membership route is absent if the identity mapping is not proven (`agent://RefSettingsIA/report`; `agent://UiInventoryScout/report`).

```text
TOOL DETAIL (desktop; same reading order stacked on mobile)
Market > category > Tool                                    Save  Compare
Outcome-first Tool name · one-line result  by [verified Provider]
[Price and basis, if sourced] [Readiness + time or unknown/stale]
[Payment/auth only if supported] [range min–max when declared]
Evidence + origin + limitation · accountable Business → portfolio
Directory host only? [Host grouping →], NOT a Provider claim
                       ┌ Start, anchored AFTER decision group ───┐
                       │ [Quote OR setup/status/alternative]       │
                       │ Try in chat · Copy CLI/MCP (quiet)        │
                       └──────────────────────────────────────────┘
Full example input → output, or labelled no-preview state
Use cases / input contract / recovery / material terms
Technical: Operation ID, URL, schema
Mobile: Start in flow here after facts/evidence/identity; at most ONE
sticky primary above bottom bar, with matching inset and safe area.

VERIFIED PROVIDER PORTFOLIO
Business name · speciality · verified join/source            [Site]
About / support / terms · Tool count (scoped)
One offerings list ordered by outcome, each Tool card labelled
routeable/catalogue-only and provenance; reciprocal Tool links
Evidence and sourced reviews only; technical endpoints subordinate

DIRECTORY HOST GROUPING (unjoined)
Hostname · directory source, not an accountable Business identity
Sourced directory listings grouped by outcome, no verified claims
Verified Business join? [Provider portfolio →], else no false byline

BROWSE CARD (one card link; quiet separate Save/Compare controls)
┌ Tool name · one-line outcome ───────────────────────────────┐
│ Price / Call or range (basis), if sourced · readiness@time  │
│ Unknown/stale stated plainly · Provider or Host byline      │
│ Sourced example/mark only after decision facts             │
└─────────────────────────────────────────────────────────────┘

SETTINGS SHELL
Global header > Settings
┌ One nav region ────────┐  ┌ Direct route content ───────────┐
│ Account               │  │ native section                  │
│   Profile, History ... │  └─────────────────────────────────┘
│ Workspace             │  Clerk Account route: [Back to Settings]
│   Team, Tax ...        │  [Clerk profile and Clerk local nav ONLY]
│ Money                 │
│   Credit, Billing      │
│ Developers            │
│   Agent keys ...       │
└───────────────────────┘
390px: same route links in labelled nav, optionally native disclosure;
aria-current=\"page\"; destination heading receives focus. No AE nav
inside Clerk profile, only back link. No horizontal tab row.

CHAT CONFIRMATION CARD (owner-authenticated pending Call read)
┌ Confirm this Call ──────────────────────────────────────────┐
│ Tool → verified Provider; Quote/Call refs                 │
│ Quote: 12.34 [actual currency] · expires HH:MM            │
│ AUD equivalent, if shown: indicative only                 │
│ Binding remaining cap after Call: amount + actual        │
│ currency + policy window (minimum of key/org caps)        │
│ [Approve this Call] [Not now]                              │
└─────────────────────────────────────────────────────────────┘
After decision: [Call result / uncertain status / receipt →]
```

The Start panel has one eligible primary, never a disabled Quote pretending to be the next step. A Quote requires owner sign-in, complete input and routeability; Try in chat transfers selected Tool context and discloses whether a Call can charge. Copy snippets name the actual CLI/MCP workflow and required authentication, never a made-up direct endpoint. Stacked mobile cards retain associated labels and row links. The content inset equals the combined mobile bar and any sticky primary plus safe-area inset so nothing is obscured.

## 6. Registry-owned projection and data policy

`registry` may consume Business, catalogue and supply public entries, while `market` and `chat` may consume registry. The reverse `registry → market/chat/actions` dependency is forbidden (`src/modules/module-boundaries.ts:85,92-102`). Extend an existing declared registry entry, such as `src/modules/registry/tool-entry.ts` or `public.ts`, with a read-only `ListingProjection`; keep source adapters inside registry and display formatting in `src/modules/market/tool-view-model.ts` or feature view-models. Do not move domain DTOs into `.tsx`, add a new module merely for presentation, or import `internal/*` across modules. This sketch is not a new write model:

```ts
// Proposed: src/modules/registry/tool-entry.ts (existing declared entry).
type Fact<T> = Readonly<{
  sourceRef: string;
  provenance: 'directory_reported' | 'provider_declared' | 'ae_observed' | 'business_published';
  scope: 'directory_resource' | 'admitted_tool' | 'catalogue_endpoint' | 'business';
}> & (
  | Readonly<{ kind: 'present'; value: T; observedAt?: number; validUntil?: number }>
  | Readonly<{ kind: 'absent'; reason: 'not_provided' | 'not_measured' | 'not_joined' | 'stale' }>
)
type ListingSource =
  | Readonly<{ kind: 'directory'; sourceRouteRef: string; providerHost: string; toolRef?: never }>
  | Readonly<{ kind: 'admitted'; toolRef: PublicToolRef; publisher: PublicToolDescriptor['provenance']['publisher'] }>
  | Readonly<{ kind: 'business_catalogue'; businessSlug: string; offeringRef: string; endpointRef?: string }>
type ListingProjection = Readonly<{
  sources: readonly [ListingSource, ...ListingSource[]];
  canonicalToolRef: Fact<PublicToolRef>;
  identity: Readonly<{
    title: Fact<string>; summary: Fact<string>; providerName: Fact<string>;
    hostName: Fact<string>; businessSlug: Fact<string>;
  }>;
  facts: Readonly<{
    price: Fact<
      | Readonly<{ kind: 'fixed' | 'indicative'; amount: string; currency: string; basis: 'per_call' }>
      | Readonly<{ kind: 'range'; minimum: string; maximum: string; currency: string; basis: 'per_call' }>
      | Readonly<{ kind: 'quote_required'; basis: 'quote_required'; currency?: string }>
    >;
    readiness: Fact<Readonly<{ posture: 'routeable' | 'setup_required' | 'unavailable'; observedAt: number; validUntil?: number }>>;
    payment: Fact<Readonly<{ lane: 'brokered' | 'external'; protocol: 'x402' | 'none' | 'unknown'; creditEligible: boolean }>>;
    authentication: Fact<'ae_api_key' | 'platform_credential' | 'x402'>;
    completedCalls: Fact<Readonly<{ count: number; window: string }>>;
    rating: Fact<Readonly<{ value: number; count: number; method: string }>>;
    latency: Fact<Readonly<{ medianMs: number; p95Ms: number; count: number; window: string }>>;
  }>;
  providerPage: Fact<string>; hostPage: Fact<string>;
  technical: Readonly<{ operationId: Fact<string>; endpoint: Fact<string> }>;
}>
```

`Fact` is a proposed read projection, not a claim that all fields exist. Link a directory `sourceRouteRef` to ToolRef only through the verified source mapping; `PublicToolCanonical` explicitly says Provider-owned Tools may lack a directory slug (`src/modules/capability-supply/internal/tool-projection-types.ts:150-185`). Business projection has `slug`, `name`, offerings/endpoints and source, but endpoint `quality` is `null`; its execution is `catalog_only` if no routeable linked Tool (`src/modules/registry/internal/services-api-projection.ts:91-139,151-181,211-253`). Admitted descriptors already carry public price, auth, payment, provenance and readiness fields (`src/modules/capability-supply/internal/tool-projection-types.ts:29-60,121-149,187-193,232-285`). An estimated AUD display is not the final Quote (`src/modules/capability-supply/internal/tool-projection-types.ts:47-54`). `SearchEnvelope` remains the registry search wire, not a second listing search schema (`src/modules/registry/tool-choice-contracts.ts:347-361`).

| Data gap | Policy until measured or joined |
|---|---|
| Independent buyer reviews/ratings | **Omit until measured** with eligible reviewed Calls and a clear count/method; current endpoint `quality: null` is not a rating (`src/modules/registry/internal/services-api-projection.ts:237`). |
| Uptime, latency distribution, response history | **Omit until measured** with sample size/window; lastHealthyAt is not an uptime percentage. Existing Market latency projection can say insufficient sample, but must not be converted into a number (`src/modules/market/listing-evidence.ts:85-113`; `agent://RefListingGrammar/report`). |
| Tool-specific real preview/gallery and provider photos | **Omit until sourced**; use attributed examples or a labelled no-preview state. Business photos are not proof of Tool output (`src/modules/registry/internal/services-api-projection.ts:130-132,167-175`). |
| Directory host ↔ AE Business ↔ ToolRef identity | **Omit verified-Provider claim until joined**; show a distinct Host grouping with hostname/source facts otherwise (`src/modules/market/x402-directory.server.ts:195-199`). Catalogue endpoint → ToolRef requires exactly one match on offering ref/revision, declared access path ref, URL and HTTP method; missing or ambiguous stays catalogue-only (`src/modules/registry/internal/services-api-projection.ts:193-215`). |
| Current callable-now fact | If `observedAt`/`validUntil` is missing or expired, show unknown/stale, never ready now merely from a historical Call (`src/modules/capability-supply/internal/tool-projection-types.ts:187-193`). |
| Credit ledger ↔ Call/Quote identity | **Omit receipt link** where no actual Call ref join exists; show ledger entry and recovery status, not a guessed Call. The observed local account had no transactions, so no live receipt link was verified (`agent://LiveSignedInHostility/report`). |

## 7. Component family and cutover map

| Family | Existing implementations to converge or replace | Target owner and rule |
|---|---|---|
| Tool card/list/detail | `DirectoryToolCard`, `DirectoryToolList`, chat `ToolCard`, `AeDirectoryToolCanonicalPage` and `PublicToolDetail`/`AeToolInspector` currently use differing grammars and a directory-to-admitted page swap (`agent://UiInventoryScout/report`; `src/components/ae/market/DirectoryToolCard.tsx:23-62`; `src/components/ae/market/DirectoryToolList.tsx:23-87`; `src/components/ae/chat/ToolCard.tsx:45-111`). | Shared pure Tool facts/card/detail leaves, with Market/chat/owner containers providing view-models. The admitted ToolRef page owns identity; keep technical schema as disclosure. Remove old duplicate renderers after callers migrate. |
| Provider identity/portfolio and Host grouping | Market `DirectoryProviderList` and `DirectoryProviderHeader` group by host; `AeProviderListingPage` is a distinct Business page (`agent://UiInventoryScout/report`; `src/components/ae/market/DirectoryProviderList.tsx:15-68`; `src/components/ae/listing/AeProviderListingPage.tsx:25-65`). | Host grouping keeps source-only facts; verified Business owns accountable Provider identity/portfolio and reciprocal Tool links. One list of offerings ordered by outcome; no featured tier. |
| Quote confirmation | `AeToolDecision`, `AeToolEconomics`, `DirectoryComparison` show price/terms, while admin `QuoteObjectView` is not buyer consent (`agent://UiInventoryScout/report`). | Shared server-fact Quote/pending-Call confirmation presenter; chat container owns the existing owner Call approval interaction. No invented buyer checkout. |
| Call outcome/receipt | `ActivityCallQueue`, `CallReceiptWorkspace`, chat execution alert and `AdminCallObjectPage` differ; Credit invoices are funding documents (`agent://UiInventoryScout/report`). | Shared Call outcome, money certainty, references and receipt links; owner/admin/chat containers enforce their distinct authorities. |
| Shell/settings | `AeAppShell` retains unmounted sidebar plumbing; `OwnerSettingsSections` embeds Clerk in AE tabs; mobile `AeOwnerMobileNavigation` has a More Sheet (`agent://UiInventoryScout/report`). | Header dropdown + matching mobile top-level bar, route-based settings, full-page Clerk, no nested app or duplicate sidebar. |

Shared Tier 2 leaves may render domain facts but fetch nothing, calculate no money and define no domain types in `.tsx`. Feature compounds contain routes/containers/hooks and colocated skeletons. Status labels come from the canonical status projection rather than hard-coded colours. The observed Market mobile table is 874px inside 336px and settings document is 692px at 390px (`/tmp/ax-hostility/LiveBrowseHostility/mobile-weather-results-row.webp`; `/tmp/ax-hostility/LiveSignedInHostility/75-mobile-settings-profile.webp`).

## 8. Signed-in chat purchase and threat model

Current key-authenticated generation obtains a DB-checked `TrustedChatAuthority` from `chatTurns.authorizeKeyGeneration`; only `agent_key` authority registers model-facing `tool.quote` and `tool.call`. Quote admission rechecks the turn/grant, but the model can invoke Call after Quote in the same generation (`convex/chatGenerate.ts:91-116`; `convex/chatTurns.ts:129-169`; `convex/chatTools.ts:403-453`). Issuance binds Clerk key claims to an AE grant; by default its server function returns a bearer secret (`src/modules/agent-access/agent-access.functions.ts:396-455`; `src/modules/agent-access/agent-access.ts:254-331`). **Conflict with the target:** Clerk-owner chat currently has no key-backed payable tools or per-spend in-chat confirmation. This design does not claim either ships today.

1. An authenticated owner explicitly enables chat spending using existing agent-access issuance with `applicationRef: 'ae-owner-chat'`, `authorityMode: 'approval_required'` from the corresponding scopes, and **`returnSecret: false`** in a dedicated server-only issuance path. Refuse `spending_policy` and `unrestricted_test_only` for this grant. Keep credential material out of browser, model, stream and URLs. Reuse an actual owner-scoped principal/grant, never a synthetic principal. An `approval_required` grant cannot auto-authorise a paid Call from REST, MCP, CLI or another chat (`convex/lib/callLifecycle/callReservationActions.ts:331-366`).
2. Owner-authenticated turn admission **only** accepts this dedicated credential: verify its `applicationRef`, active `agentAccessPrincipals` owner/account against the canonical Clerk owner and current grant; record `origin: 'owner_chat'` on the key-bound turn and recheck that origin in `resolveTrustedChatAuthority`. Do not invent a key source-write proof or pass a Clerk turn to `createChatAgent` as if it were key-bound. A Clerk-owned thread cannot silently become an agent-key thread: explicitly hand selected Tool/context to a new key-bound thread, else refuse (`convex/chatTurns.ts:19-59,129-169`). Require fresh session factor verification to enable chat spending and approve. Reuse the admin-console `hasFreshMfaFactorVerification` age check (both factors no older than 10 minutes); if Clerk has no usable `fva` claim, **fail closed** with a reverify/configuration action, never silently downgrade to session-only approval. Existing non-chat owner approval behaviour remains unaffected (`convex/lib/workspaceSecurity/factorVerification.ts:1-17`).
3. The model requests Quote, then its `tool.call` may only reserve an **approval-required pending Call**, not dispatch it. Stop that owner-chat generation at pending; no later model replay of Call is needed. Read Quote and pending Call by ref through an owner-authenticated server path, matching the credential/account, and render Tool, verified Provider (or explicit Host), actual Quote amount **and currency**, expiry, input summary and binding remaining cap. Any AUD conversion is explicitly **indicative**. The cap is the minimum of key per-call/day/month headroom and the organisation monthly cap, with the applicable currency/window; if any required cap cannot be read or safely compared, refuse a numeric headroom claim and approval rather than guess (`src/modules/capability-execution/quote.ts:112-125`; `convex/lib/callLifecycle/admissionReserve.ts:389-412`). Model prose and streamed tool output do not supply card facts.
4. The card approves or denies the **CallRef**, not a free-form Quote or turn token. Use the existing owner-authenticated `canonicalOwnerApprovalDecisionHandler({ callRef, decision: 'approve' | 'deny' })`, which checks exact pending Call material, current Tool/price, grant generation, policy, expiry and dispatches by compare-and-set. For `ae-owner-chat` Calls, this server decision handler **MUST** also enforce fresh `fva` from the caller's Clerk session; a UI-only check is bypassable. If missing, fail closed and point to reverification. Do not add another approval table, flag or Call path. Approval is an owner action after generation stops; denial leaves no dispatched Call. Duplicate decisions replay or refuse through the existing seam (`convex/lib/callLifecycle/authorityHandlers.ts:845-853`; `convex/lib/callLifecycle/admissionApprovals.ts:227-274,324-387`).
5. `ChatTranscript` renders the pending card as a labelled region, emits a concise live announcement and provides native “Approve this Call”/“Not now” buttons. Once generation stops, move focus to the card heading; after approve/deny, move focus to the result/status or composer respectively. On expiry, announce expiry, disable stale approval and focus the fresh-Quote action. Keep an explicit keyboard path from composer to pending region and back; never trap focus. After server dispatch, subscribe/read Call status and project result, receipt or uncertain outcome without another model-issued Call. Neither stream disconnect nor Cancel implies refund (`src/components/ae/chat/ChatTranscript.tsx:131-143`).

| Threat | Mandatory control |
|---|---|
| Model invokes `tool.call` directly, hallucinates approval or injects price | Dedicated `approval_required` key creates a pending Call only; owner-authenticated card reads stored Quote/Call facts. Model never has owner approval authority. No “signed Quote” claim. |
| Key leaks or another credential is used under Clerk session | `returnSecret:false`, dedicated `ae-owner-chat` application and owner/account/grant check; reject autonomous modes and foreign credentials on the Clerk-to-key seam. Require fresh session verification; missing `fva` fails closed. |
| Provider identity or stale Quote is substituted | Exact ToolRef, QuoteRef, CallRef and verified Business join; otherwise label directory Host. Existing approval checks pinned current Tool/price/input and grant before CAS dispatch. |
| Card overstates budget | Show minimum applicable key/organisation headroom, actual currency/window; unknown is not zero or permission. Reservation's budget/concurrency checks still decide, independent of disclosure. |
| Duplicate approval, two tabs, timeout or cancellation | Existing owner approval idempotency/CAS and original CallRef recovery prevent second dispatch; preserve uncertain payment state until reconciled. |

## 9. Disjoint slice plan and live acceptance

A slice's owner exclusively edits its named files and matching focused tests; cross-slice consumers wait for the registry contract and do not edit its files. File names below identify ownership, not a mandate to create every file. Every slice has a live browser check at **390px and 1440px** on the affected route; affected settings, shell and chat routes additionally check **320px reflow, 200% zoom, keyboard reachability, focus and unobscured actions**. At narrow widths check `documentElement.scrollWidth <= innerWidth`, labels, links and reading order; a seed fixture, screenshot or simulated approval is not a live paid Call.

| Slice | Exclusive owner/files | Behaviour and browser acceptance |
|---|---|---|
| S1 Registry facts and search | Registry owner: `src/modules/registry/tool-entry.ts`, `public.ts`, `tool-choice-contracts.ts`, `tools.actions.ts`, registry internal projection files, `src/components/ae/command-panel/tools-search-page/useMarketToolSearch.ts`, `src/components/ae/command-panel/market-tools-client.ts`; `src/modules/module-boundaries.ts` reserved to this owner for manifest changes | Implement read-only ListingProjection and shared SearchEnvelope for Market and header. At 390/1440 enter the same query and compare **total and displayed counts** at both surfaces, same corpus/eligibility, and no directory-only “callable” claim (`src/components/ae/command-panel/tools-search-page/useMarketToolSearch.ts:20-25,80-87`). |
| S2 Canonical Tool/Provider | Market owner: `src/modules/market/tool-view-model.ts`, `tool-detail-presentation.ts`, `src/components/ae/market/**`, `src/components/ae/listing/**`, `src/routes/tools.*.tsx`, `src/routes/$slug.tsx`, proposed `src/routes/providers.$providerHost.tsx`; excludes S3-owned shared leaves | One Tool identity through admission; unjoined directory Host grouping distinct from verified Provider/Business portfolio. At 390/1440 open Tool → Host or Provider → Tool, with no filtered-list loop/page swap; exact endpoint joins only. Depends on S1. |
| S3 Shared object family | Component owner: `src/components/ae/shared/**`, `src/components/ae/chat/ToolCard.tsx`, `src/components/ae/call-receipt/**` including `CallSummarySection.tsx`, `src/components/ae/activity/**`; excludes S2 paths and S6-owned `ChatTranscript.tsx` | Minimal factual leaves for Tool, verified Provider, Host, Quote/pending Call, Call outcome/receipt. S3 **supplies the receipt link contract** (CallRef, ToolRef, verified Business slug or explicit Host absence) to S7; no guessed Provider. At 390/1440 receipt links remain visible for delivered, failed and uncertain states where refs exist, and stacked cards keep labels/actions. Consume S1; coordinate leaf contract with S2. |
| S4 Settings and identity | Settings owner: `src/components/ae/settings/**`, `src/routes/_operator/owner.settings*.tsx`, `owner.team.tsx`, `owner.workspace.tsx`, `src/components/ae/layout/AeOrganizationSwitcher.tsx`, `src/components/ae/layout/app-shell/AeAppHeader.tsx`; **AeAppHeader reserved to S4**, S5 must not edit it | Direct routes, one labelled nav with group headings and `aria-current=\"page\"`, native disclosure if collapsed (focus returns on close), heading focus on navigation, named members, one workspace name, Clerk catch-all/back link and API-key item hidden. At 320/390/1440 and 200% zoom navigate Profile → Security → back, Agent keys and Team by keyboard; no 404, overflow, hidden action or irrelevant money copy. Confirm Clerk org 1:1 or remove OrganizationProfile. |
| S5 Navigation and viewport | Shell owner: `src/components/ae/layout/AeAppShell.tsx`, `app-shell/WorkspaceMenu.tsx`, `app-shell/AeAppSidebar.tsx`, `AeOwnerMobileNavigation.tsx`, `src/lib/navigation/app-navigation.ts`, `src/components/ui/theme-meta.ts`, `src/styles/globals.css`; excludes S4's header | Delete unused sidebar plumbing, regroup dropdown, mobile bar matching top-level destinations and no More sheet; token/chrome alignment. At 320/390/1440 and 200% zoom traverse same destinations by keyboard, no overflow or obscured mobile Start/last content; safe-area and inset measured. |
| S6 Chat approval and result | Chat/authority owner: `convex/chatTools.ts`, `chatTurns.ts`, `chatGenerate.ts`, `chatQuoteAdmission.ts`, `chatCall.ts`, `convex/lib/callLifecycle/admissionApprovals.ts` and `authorityHandlers.ts` **only for the owner-chat step-up guard**, `src/modules/chat/agent-turn.contracts.ts`, `src/modules/agent-access/agent-access.ts`, `agent-access.functions.ts`, `src/routes/api.v1.chat.turns.ts`, `src/routes/api.v1.chat.turns.$turnRef.ts`, `src/components/ae/chat/ChatTranscript.tsx`, chat session compound under `src/components/ae/chat/chat-session/**`; excludes S3's `ToolCard.tsx` | Dedicated `approval_required`/secretless chat grant, owner-authenticated key-bound turn, pending Call and existing owner-approval dispatch only. At 320/390/1440 and 200% zoom keyboard/announcer/focus flow: decline no dispatch; direct model Call pending only; stale Quote and missing `fva` refused; owner approval once dispatches and linked result appears. Anonymous chat cannot buy. |
| S7 Money links and errors | Money/feedback owner: `src/components/ae/console/owner-credit/**`, `src/components/ae/console/AeAccountHistoryTable.tsx`, `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`, `src/routes/_operator/owner.credit*.tsx`, `src/modules/money/account-history.contracts.ts`; excludes S3's receipt leaves | Consume S3 receipt link contract: Call ledger row → receipt → Tool/verified Provider, no guessed link on funding. At 390/1440 inspect a **controlled real Call's booked ledger row**; if live Call unavailable, provide labelled deterministic integration proof of join plus explicit live blocker, not a pass from an empty ledger. Stacked ledger cards keep row ID, column labels, amount/status and links. Profile errors have no charge copy. |
| S8 Integration acceptance | Integration owner: only route/cross-surface focused tests and browser acceptance harness files not allocated above; no production source edits | At 390/1440 traverse header search → Tool → Provider/Host → Quote/pending Call → owner approval/result → receipt → Credit ledger and settings Security; report same search counts and money-link proof. Empty ledger is an unresolved live blocker, never acceptance. Source fixes go back to exclusive owners. |

Dependencies are S1 before S2/S3; S3's receipt link contract before S7; S3's shared fact leaves before S6; S4 and S5 agree navigation taxonomy without sharing a file. S6 owns the dedicated owner-chat branch of the existing approval seam; no other slice edits its source. No sibling runs project-wide validation while shared files are in flight. Existing operator and supply detail routes consume shared leaf facts where appropriate without losing authority-specific controls.

## 10. Risks, open questions and review gate

1. **Directory identity join:** What exact durable mapping makes a host a Business and a directory row a ToolRef? Current `PublicToolCanonical` is absent for Provider-owned Tools (`src/modules/capability-supply/internal/tool-projection-types.ts:150-161`). Default: distinguish directory host from verified Business; no name/domain heuristic and no broken redirect.
2. **Clerk organisation parity:** Is the current Clerk org 1:1 with the AE workspace and lifecycle? Signed-in evidence showed IANA in Clerk versus Perth Environmental Consulting on the supplier surface (`/tmp/ax-hostility/LiveSignedInHostility/32-provider-loaded.webp`; `/tmp/ax-hostility/LiveSignedInHostility/53-workspace-clerk-general-result.webp`). This may be a distinct Provider identity, not a role contradiction. Default: remove Clerk OrganizationProfile from workspace settings until mapping is proven; retain AE workspace membership authority.
3. **Owner chat admission and step-up:** Where can an owner-authenticated session enter a real key-bound turn without crossing principal/thread ownership? Default: only dedicated `ae-owner-chat` credential, separate key-bound thread and `origin: 'owner_chat'`; never key proof minting (`convex/chatTurns.ts:19-59,129-169`). Existing `canonicalOwnerApprovalDecisionHandler` is the only approval store/dispatch seam; S6 adds the owner-chat-specific fresh-`fva` check there, fail-closed if unavailable (`convex/lib/callLifecycle/authorityHandlers.ts:845-853`; `convex/lib/workspaceSecurity/factorVerification.ts:1-17`).
4. **Credit-to-Call join:** Which ledger entries actually carry a canonical CallRef and a receipt? No Calls existed in the inspected local account (`agent://LiveSignedInHostility/report`). Default: link proven joins only and preserve invoice/funding distinction. A controlled real booked Call is required for live acceptance; absent one, report deterministic integration proof separately with a live blocker.
5. **Top-level mobile taxonomy:** The user decision is same destinations as the header, yet 16 dropdown items are not a compact bottom bar. Default: define a small shared top-level group set (Market, Ask, Activity, Workspace), with the dropdown containing grouped remaining destinations; verify each header top-level has the same mobile entry, not every child as a tab.
6. **Observed metrics:** What eligible reviewed Call events and per-Tool sampling windows exist? `MarketListingEvidenceProjection` represents rating/latency but can be unrated or insufficient sample (`src/modules/market/listing-evidence.ts:56-113`). Default: omit until measured and sourced; never decorate an empty value with a star or percentile.

Review the RFC against the thesis, module import direction, original Quote/Call authority, Clerk path routing, identity joins and mobile task completion before implementation. Status stays proposed until owner sign-off. The immediate account-route hotfix may ship independently; S4 must reconcile it rather than recreate the broken path.
