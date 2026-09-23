# Platform screen specifications

**Status:** wave 2 register  
**Date:** 2026-09-21  
**Authority:** [`platform-design-package.md`](./platform-design-package.md); jobs in [`platform-job-map.md`](./platform-job-map.md); journeys in [`platform-journey-blueprint.md`](./platform-journey-blueprint.md); dests in [`platform-nav-route-map.md`](./platform-nav-route-map.md); human census in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7. Vocabulary: [`PRODUCT.md`](../../PRODUCT.md), [`CONTEXT.md`](../../CONTEXT.md). Grammar: [`DESIGN.md`](../../DESIGN.md).

This register describes **what the current source puts on screen**. It does not invent UI, rename chrome, or propose a visual kit. Dest IDs and verdicts stay with the nav map. Job IDs stay with the job map.

**Grades** follow the package: `CHARTER` | `IMPLEMENTED` | `PARTIAL` | `SEEN` | `OPEN` | `DOCS`.

**Spec chain (required):** user and context → job → information needed → main decision → actions → resulting state → recovery.

---

## How to read

| Column / row | Meaning |
| --- | --- |
| **Dest** | `DEST-*` / `RES-*` / `FLOW-*` from the nav map. Path is evidence, not the dest name. |
| **Job** | Primary `J-*` the screen must serve. Extra jobs in parentheses. |
| **Verdict** | KEEP dest / PAGE not dest / DEMOTE / FOLD from the nav map. |
| **Purpose table** | Why each on-screen element exists. Fit = why it is on this screen. |
| **Cognitive-load** | Perception / Attention / Memory / Learning. Not a redesign brief. |
| **State coverage** | Cite the component or skeleton if it exists; else `OPEN` or `PARTIAL`. |

Awkward cases are wired in prose under each screen (long names, missing facts, awkward prices). No interview quotes.

---

## Screen inventory

| # | Dest ID | Path | Job | Verdict | Spec |
| --- | --- | --- | --- | --- | --- |
| 1 | `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET` | `/market` (`/` → redirect); rail duplicate `/owner/market` | J-B01, J-B02 (J-B04 empty path) | KEEP dest; `/owner/market` **FOLD** | Full |
| 2 | `RES-TOOL` | `/tools/$toolRef`, `/tools/$providerHost/$slug` | J-B02, J-B03 | PAGE not dest | Full |
| 3 | `RES-ASK-THREAD` | `/t/new`, `/t/$threadId`, `/s/$shareToken` | J-B01, J-B02, J-A01 | PAGE not dest | Full |
| 4 | `DEST-BUYER-AGENTS` | `/agent-access` | J-B05, J-R02 | KEEP dest | Full |
| 5 | `DEST-BUYER-AGENTS` (grant) | `/agent-access/authorize` | J-B05 | PAGE not dest | Full |
| 6 | `DEST-BUYER-CALLS` | `/activity` | J-B07, J-B08, J-R01 | KEEP dest | Full |
| 7 | `RES-CALL` | `/calls/$callRef` | J-B07, J-B08, J-S01, J-S02 | PAGE not dest | Full |
| 8 | `DEST-BUYER-CREDIT` | `/owner/credit` | J-B06, J-R02 | KEEP dest (rail); DEMOTE if mobile-primary | Full |
| 9 | `FLOW-FUNDING` | `/fund/$fundingSessionId`, `/fund/cancelled` | J-B06 | PAGE not dest | Full |
| 10 | `DEST-PROVIDER-SUPPLY` | `/owner/operations` | J-P01, J-P02 | DEMOTE off dest; KEEP route | Full |
| 11 | `DEST-PUBLIC-FOR-PROVIDERS` (door) | `/for-providers` | J-P01 (assess) | PAGE not dest (marketing door) | Full (supply landing) |
| 12 | Supply — add source | `/owner/operations/new` | J-P01 | PAGE not dest | Full |
| 13 | Supply — publish terms/review | same path, later stage | J-P01 | PAGE not dest | Full |
| 14 | Supply — connection handoff | `/owner/supply/connections/new` | J-P01 | PAGE not dest | Full |
| 15 | Supply — OAuth return | `/owner/supply/connections/oauth/callback` | J-P01 | PAGE not dest | Full |
| 16 | Supply — owner Tool | `/owner/operations/$toolRef` | J-P01 | PAGE not dest | Full |
| 17 | `RES-PUBLIC-BUSINESS` | `/$slug` | J-B01, J-P02 | PAGE not dest | Full |
| 18 | `DEST-SHARED-ACCOUNT` | `/owner/settings` | J-R02 (security) | PAGE not dest | Brief |
| 19 | `DEST-SHARED-TEAM` | `/owner/team` | — (org membership) | PAGE not dest | Brief |
| 20 | `DEST-SHARED-WORKSPACE` | `/owner/workspace` | J-P01 (legal/tax) | PAGE not dest | Brief |
| 21 | Support | `/support` | J-S02 | PAGE not dest | Brief |
| 22 | Status | `/status` | J-S02 (platform health) | PAGE not dest | Brief |
| 23 | `FLOW-ONBOARDING` | `/onboarding` | First org | PAGE not dest | Brief |

**Skipped (marketing / extra):** see § Skipped dests.

---

## 1. Market — `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET`

**Path:** `/market` · **Duplicate:** `/owner/market` (same `AeX402Directory`, `workspace` compact hero) · **FOLD** the rail path.  
**Container:** `src/routes/market.tsx` → `AeMarketPage` → `AeX402Directory`.  
**Lived grammar:** `DirectoryHero.tsx`, `DirectoryHomeDiscovery.tsx`, `DirectoryToolCard.tsx` (frozen per DESIGN.md).  
**Grade:** `SEEN` logged-out (`buyer-ia-coverage.md` §7); signed-in shell **OPEN**. Jobs **PARTIAL**.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A guest or signed-in Customer arrives with a bounded need, or to browse before quoting. **Jobs J-B01** (find despite vocabulary) and **J-B02** (compare a small set). They need: a place to describe the need; a shortlist of Tools with Provider, provider-listed price, and provenance; a way to keep two-to-four candidates; an honest empty or unavailable outcome. The main decision is which Tools enter inspection or comparison — not Quote, not Call. Actions: search (`query` → `view=tools`), open a listing, save, add to compare, switch Tools / Collections / Providers / Saved, load more, clear filters. Resulting state: URL holds query/filters/view; compare tray is in-page state (legacy `?compare=` is consumed then stripped); saved Tools live in browser/session storage. Recovery: invalid search → `AePageState` danger (“directory filter is invalid”); catalogue unavailable → `AeEmptyState` “Catalogue temporarily unavailable”; empty matches → “No matching Tools” / “Try a different description”; load-more fail leaves current results. **J-B04** (record no-fit) is **OPEN** on this screen: empty copy does not offer `marketDemand.record`.

### Purpose table

| Element | Fit |
| --- | --- |
| Title / hero | Discover: “Tools for what’s next.” Compact/tools: “Explore capabilities.” / “Find your next capability.” Names the dest as the Tool market, not a dashboard. `DirectoryHero`. |
| Fit | Card title (functional, `line-clamp-3`), description (`line-clamp-3`), tags, “Returns …”, activity (“Used recently…” or “Verified …”). |
| Price | Footer “Provider-listed price” + `priceLabel` + `priceContext`. Not a Quote. `directoryPrice` / `directoryPriceContext`. |
| Provider | `providerLine` (service name · host). Header on provider-filtered results: `DirectoryProviderHeader`. |
| Terms | Not on the card. Compare dialog: category, input, returns, recent use — labelled **preliminary**. Footer: “Directory: Coinbase Bazaar… published by providers.” |
| Primary action | Open listing (`/tools/$providerHost/$slug`). Search submit. Compare tray: “Compare Tools” (enabled at 2+). |
| Preserved context | Search params (`validateMarketSearch`); `MARKET_LINK_STATE` on card links; compare selection in component state (max 4). |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Ask field, tabs, card title + provider + price must be locatable without reading the collection rail first. Count line (“N Tools in the catalogue”) is secondary. |
| Attention | Primary: describe need / open a Tool. Alternatives: save heart, Compare, collection chips, sort. Compare must not look like purchase. |
| Memory | Query and filters stay in the URL. Compare set is **not** in the URL after hydrate — user can lose it on refresh. Saved list is browser/session only (“Prices may have changed”). |
| Learning | “Tool”, “Provider”, “Provider-listed price”, “Call” (activity). Tabs are views, not dests. Same card grammar on discover / tools / saved. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `AeX402Directory`, `DirectoryHomeDiscovery`, `DirectoryIndexDiscovery`, `DirectoryToolCard` |
| Empty | IMPLEMENTED | Discover without home: `AeEmptyState` “Explore the Tool catalogue”. Tools: “No matching Tools”. Saved: “Keep a few possibilities close”. Indexed mid-scan empty: “More of the catalogue remains”. |
| Loading | PARTIAL | Route pending: `MarketPending` → `AePageState` / `AePageSkeleton` `shape="market"` (`src/routes/market.tsx`). Saved hydrate: “Loading saved Tools…”. Load more: spinner on button. **No colocated `AeX402DirectorySkeleton`.** Filter navigations raise `pendingMs` to 1000 so the list is not swapped for a full-page skeleton. |
| Invalid | IMPLEMENTED | `query_invalid` empty: “Check your search” / “Use a service description without personal identifiers.” Route `SearchParamError`: “A directory filter is invalid… No broader search was run.” |
| Unavailable | IMPLEMENTED | `page.kind === 'unavailable'`: “Catalogue temporarily unavailable” + Try again / Refresh results. Load-more `failed`: alert, current results unchanged. |
| Interrupted | PARTIAL | Partial Coinbase matches: status “Coinbase returned its top matches.” Coverage note if source changed during scan. Compare URL hydrate then strip. |
| Completed | N/A | Browse is reversible; no purchase on this dest. |

### Awkward cases (prose)

A 120-character Provider host plus a rewritten functional title (`directoryTitle` falls back from `serviceName` when `title` is long) wraps to three lines on the card; the provider line truncates. Missing description omits the paragraph; missing tags omit the chip row. Price can be `Price on request`, `See payment details`, a raw `0.007 USDC`, or several options collapsed to “N Provider payment options” — never presented as buyer AUD. Compare cells join every listed amount with ` / ` or show “Price on request”; a long description is `whitespace-normal break-words` in a 72-character column. Empty search after a tight filter offers broaden/clear, not a market-gap record.

---

## 2. Tool listing — `RES-TOOL`

**Paths:** `/tools/$toolRef` (`PublicToolDetail`), `/tools/$providerHost/$slug` (`AeDirectoryToolCanonicalPage`).  
**Inspector:** `AeToolInspector` `variant="full"`.  
**Grade:** SOURCE `IMPLEMENTED` for inspect; listing **not walked** (`buyer-ia-coverage.md` §9). Human Quote/Call on the listing remains **CHARTER** / **OPEN**. Jobs **PARTIAL**.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Customer (or Agent-directed human) opened one Tool from Market, chat, or a shared URL. **Jobs J-B02** (evaluate before Quote) and **J-B03** (prepare the Agent to buy). They need: exact Tool title, Provider business name, indicative/catalog price, readiness, access, material terms, and one safe next action. The main decision is proceed toward Agent use vs find an alternative vs abandon. Actions: copy Tool reference; “Connect an Agent first” (`/agent-access?resumeTool=`); “Find Tool alternatives” when not operational; open Schemas sheet; back to Catalog (`MarketBackButton`). Resulting state: shareable listing URL; no money moved. Recovery: invalid_ref / not_found / source_unavailable / not available → `AePageState` + browse current Tools. Canonical slug route shows indexed summary first, then admission (`Await`).

### Purpose table

| Element | Fit |
| --- | --- |
| Title | `AePageHeader` eyebrow “Tool”, `toolDisplayTitle` / `directoryTitle`. Description: `business.name · capabilityId` (admitted) or provider host (indexed first paint). |
| Fit | Overview summary (`AeToolDecision`); track record (`AeToolTrackRecord`); contract tabs. |
| Price | “Indicative price” (`AeToolPrice`) + `AeToolEconomics` (pricing model, Provider amount, AE fee, payment network). Labelled indicative; Quote is later. Indexed first paint: “Provider-listed price”. |
| Provider | Fact “Provider” = `tool.business.name`. |
| Terms | Overview facts (access, last verified, readiness); Contract tab; Schemas sheet (transport, provenance, payment, data-use, effects, JSON Schema). |
| Primary action | If operational or inspection-required: copy Tool reference + “Connect an Agent first”. If not: “Find Tool alternatives”. `AeToolNextAction`. |
| Preserved context | `MARKET_LINK_STATE` back to Market; `resumeTool` into Agents. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Title, Provider, indicative price, and next action must be findable without opening Schemas. |
| Attention | Primary is Agent-bound (copy ref / connect). There is **no Reserve / Top up / Quote** button on this page (contrast Airbnb Reserve, Nevermined Top up — SEEN elsewhere; AE listing action **not walked**). |
| Memory | Tool ref must survive into Agents (`resumeTool`) and the Agent client. Price on this page is not the Quote. |
| Learning | “Indicative price” vs later `tool.quote`. “Checked when quoting” vs “Operational”. Same inspector model for compact (chat) and full. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `PublicToolDetail` → `CurrentToolDetail` → `AeToolInspector` |
| Empty | N/A | A found Tool always has a header; missing optional facts omit rows. |
| Loading | PARTIAL | Slug route: `DirectoryEntrySummaryPage` (title, provider, price, “Checking whether this Tool is ready to call…”). **No `PublicToolDetailSkeleton`.** Route-level pending not dedicated. |
| Invalid | IMPLEMENTED | `invalid_ref`; slug `query_invalid` → “The Tool reference is malformed.” |
| Unavailable | IMPLEMENTED | `not_found`, `source_unavailable`, posture unavailable + `REASON_COPY`. Directory metadata not found / unavailable. |
| Interrupted | PARTIAL | Admission promise after indexed paint; if admission omitted, treated as source_unavailable. |
| Completed | N/A | Inspection only. |

### Awkward cases (prose)

A long listing label plus capabilityId in the header description wraps; the back button stays “Catalog”. Indexed first paint can show a Bazaar USDC figure while the admitted inspector later shows an AUD indicative total and fee split — two price languages on one object if the user watches the swap. “Price on request” / range / “Included in total” appear in economics when breakdown is missing. Provider amount and AE fee can be “Not itemized”. Next-action copy tells the human to paste a ref into an existing client; a Customer who expected “Buy now” finds only Connect Agent.

---

## 3. Ask thread — `RES-ASK-THREAD`

**Paths:** `/t/new`, `/t/$threadId` → `Chat` (`chat-session/Chat.tsx`); `/s/$shareToken` → `SharedChat`.  
**Grade:** PARTIAL (thin chat wraps `registry.tools.search` / compare). Journey 1 effortless matching remains CHARTER.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Customer describes a need in natural language instead of (or after) Market search. **Jobs J-B01, J-B02**; Agent path **J-A01** when authenticated tools run. They need: a composer, a transcript that can show Tool cards (title, readiness, provider, price, inspect link), and a way to resume or share. The main decision is which candidate to inspect or whether to browse Market after a failed turn. Actions: send; new chat; open history (signed-in); share / revoke / copy link; follow Tool card to `/tools/$toolRef`; “Browse Tools” on some errors. Resulting state: thread id in the path after first send; anonymous messages stay in the browser session; signed-in threads persist. Recovery: composer `FieldError` + optional support reference (`AeCopyReference`); anonymous limit reached disables send; shared view is read-only.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | Header: “Ask” (no thread) / “Chat” (thread). Shared: conversation title or “Shared conversation”. |
| Fit | Transcript + `ToolCard` rows (readiness badge, provider, access, price). Empty: “Search the catalog.” |
| Price | On the card when the projection has one — catalog/indicative, not Quote. |
| Provider | On choice rows when present. |
| Terms | Not a contract page; inspect link leaves the thread. |
| Primary action | Send. On Tool card: inspect. On error: Browse Tools when `browseMarketOnError`. |
| Preserved context | `threadId`; optional `initialPrompt`; share token; anonymous count. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Composer and last assistant turn (including Tool list) must be obvious. History is a sheet on small screens. |
| Attention | Send is primary. Share / new chat are secondary. Tool cards must not look like a completed Call. |
| Memory | Signed-in: “Saved to your account.” Guest: “Private to this browser session.” Share is read-only. AE does not store the wider project. |
| Learning | Same Tool / Provider / price words as Market cards. Suggestions: find / compare / inspect — not harness planning. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `ChatLayout`, `ChatTranscript`, `ToolCard` |
| Empty | IMPLEMENTED | `chatEmpty` + suggestions in presentation / IA. Shared empty: `chatShared.empty`. |
| Loading | IMPLEMENTED | `ChatSkeleton`. Shared: inline skeletons + “Loading conversation…”. History `historyPending`. |
| Invalid | IMPLEMENTED | Composer error + 2,000-character hint from 1,800. |
| Unavailable | PARTIAL | Error + optional browse. No dedicated dest if chat backend is down beyond composer error. |
| Interrupted | PARTIAL | Handoff after sign-in (`chatHandoffNotice`). Anonymous limit. Share revoke. |
| Completed | N/A | Thread can continue; not a purchase terminal. |

### Awkward cases (prose)

A long Tool title in a muted Item row sits beside a readiness badge; price may be absent. Anonymous guests hit a count line then a hard stop — Market remains the fallback. Shared `/s/…` cannot continue; a Customer who opened a share expecting to buy must start a new Ask or Market. No-fit after a failed search is not offered as “record this gap” (J-B04 **OPEN** on this page).

---

## 4. Agents — `DEST-BUYER-AGENTS`

**Path:** `/agent-access` · **Container:** `AeAgentAccessHome`.  
**Grade:** PARTIAL (connect + spending limits exist; header slot OPEN). Jobs J-B05, J-R02.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A signed-in Customer must grant Agent authority separately from money. **Job J-B05**; returning use **J-R02**. They need: who is connected, spending limits, pending approvals, credential status, and (if arriving from a listing) which Tool to resume. The main decision is connect / adjust limits / revoke / approve a request — not fund, not Call. Actions: Connect New Agent (wizard + one-time key reveal); install funnel; rename; update spending limits; revoke credential / disconnect; decide approvals; paginate directory. Resulting state: directory items; query `caller`, `resumeTool`. Recovery: `HomeDirectoryRecoveryAlert`; `HomeLifecycleIssueAlert`; approvals error + retry.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | Operator page “Agents” — “Connect Agents, review requests, and control what each Agent can do.” |
| Fit | Console rows: Agent identity, policy, approvals. Empty: install funnel. |
| Price | Spending limits (per-Call / aggregate), not Tool price. |
| Provider | N/A except resume-Tool section pointing back to a listing. |
| Terms | Spending policy version; provider-management profile is a different credential (cannot spend buyer credit). |
| Primary action | Empty: “+ Connect New Agent”. Occupied: console + “Add another”. Resume: return to Tool when connected. |
| Preserved context | `?caller=`, `?resumeTool=`. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Empty vs populated must be obvious. Resume-Tool banner only when `resumeTool` is set. |
| Attention | Connect / approve is primary. Reveal dialog is one-time. Funding is **not** on this dest (J-B06 lives on Credit). |
| Memory | `resumeTool` must survive install. Credential rotation must not look like a new Agent (J-R02). |
| Learning | “Agent”, “Spending policy”, “credential”. Funding ≠ authority copy belongs on Credit, not here. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `AeAgentOperatorConsole` when directory has items |
| Empty | IMPLEMENTED | `HomeEmptyInstallPanel` |
| Loading | IMPLEMENTED | `AeAgentAccessHomeSkeleton`; console `loading`; approvals `approvalsLoading` |
| Invalid | PARTIAL | Lifecycle / directory alerts. Wizard validation lives in the dialog. |
| Unavailable | IMPLEMENTED | `accessUnavailable`; directory error + retry; approvals error + retry |
| Interrupted | PARTIAL | Pagination fail (`HomeDirectoryPagination` issue message); key reveal close |
| Completed | IMPLEMENTED | Connected directory + add-another. Reveal success closes into console. |

### Awkward cases (prose)

A long Agent display name in the console sits next to a short principal id. Resume copy must name a Tool ref that may be an opaque encoding. Empty state still shows Connect even while “checking connection”. Spending limit fields are currency strings — awkward cents vs AUD units if the view-model is incomplete (`spending-policy.view-model.ts`).

---

## 5. Review agent access — `DEST-BUYER-AGENTS` (PAGE)

**Path:** `/agent-access/authorize` · **Container:** `AeAgentAccessAuthorizePage` → `AeAgentAccessAuthorizeForm`.  
**Grade:** PARTIAL. Job J-B05.

### User and context → job → information needed → main decision → actions → resulting state → recovery

An Agent (or OAuth client) sent the Customer a grant to review. They need: client name, access profile (buyer spend vs provider management), connection target, authority mode / tool access, and a single approve or decline. The main decision is grant or deny this exact `grantRef`. Actions: select connection / replacement; choose authority mode; approve; deny. Resulting state: grant completed or declined; return to Agents. Recovery: `outcome_unknown` (do not resubmit); `succeeded` already; `problem` via `presentConnectionProblem`; missing code; agent targets unavailable.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Review agent access” / section “Connect {clientName}”. |
| Fit | `ConsentRequestFacts` — who asked, what scope. |
| Price | Authority ceiling / mode, not a Tool price. |
| Provider | Provider-management alert: inspect/publish/withdraw only; cannot spend buyer credit. |
| Terms | Tool access fieldset; connection fieldset. |
| Primary action | Approve (label from view-model) vs Decline (`ConsentDecisionBar`). |
| Preserved context | `grant_ref`, `oauthState` in recovery search. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Client name, profile, and approve/decline must be first. |
| Attention | Approve is consequential. Decline is the alternative. Replacement mode must not look like a second Agent identity. |
| Memory | Grant ref on outcome screens. Do not double-submit (`outcome_unknown`). |
| Learning | Same “Agent” / “Spending policy” words as the Agents dest. Provider credential ≠ buyer Agent. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | Form idle / submitting |
| Empty | IMPLEMENTED | Missing code alert |
| Loading | IMPLEMENTED | `AeAgentAccessAuthorizeFormSkeleton` |
| Invalid | IMPLEMENTED | Problem presentation; agent targets error |
| Unavailable | IMPLEMENTED | `agentTargetsUnavailable`; problem codes |
| Interrupted | IMPLEMENTED | `outcome_unknown` — “The approval may have completed. Do not submit it again.” |
| Completed | IMPLEMENTED | `ConsentOutcomeView`; page `succeeded` → Open Agents |

---

## 6. Calls — `DEST-BUYER-CALLS`

**Path:** `/activity` · **Container:** `AeActivity`.  
**Grade:** PARTIAL (history + filters; full purchase-resolution record CHARTER). Jobs J-B07, J-B08; J-R01 at Call-list level only.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Customer needs to explain or remedy purchases. **Jobs J-B07, J-B08**. They need: Calls that need attention vs recent outcomes; Tool label, Agent, amount, delivery-ish status, purchase badge, payment label; a receipt link. The main decision is which Call to open, or whether to reset filters / export. Actions: status and date chips; `?agent=`; open `/calls/$callRef`; load more; export CSV/JSON; retry monthly summary. Resulting state: filter state in the hook (status/date are in-page; agent is query). Recovery: whole-page unavailable; empty filters; pagination fail; summary unavailable + retry.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Calls” — “Review Calls that need attention, then inspect recent outcomes and receipts.” |
| Fit | Queue columns: Task (`toolLabel`), Caller Agent, duration, amount, status, purchase, when. |
| Price | `amountLabel` (mono). Monthly spend in `ActivityMonthlySummary`. |
| Provider | Not a column; Tool name is the task. Provider is on the receipt. |
| Terms | Purchase badge and payment state stay separate facts (`purchaseLabel`, `paymentStateLabel`). |
| Primary action | Open receipt. Empty: “Find Tools” → Market. |
| Preserved context | `?agent=`; loaded cursor pages. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | “Needs attention” above “Recent Calls”. Amount and purchase badge must not collapse into one “paid” word. |
| Attention | Receipt is the row action. Export is secondary. Filters must not hide the attention queue without a reset. |
| Memory | `callRef` is the join for Logs / Usage / Spend. Agent short id is current label, not necessarily Call-time name. |
| Learning | “Call”, “purchase”, “payment” as separate badges — not “Trips”. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `ActivityCallQueue` ×2 + pagination + monthly summary |
| Empty | IMPLEMENTED | No Calls: `AeEmptyState` + Find Tools. No match: reset filters. Queue emptyMessage. |
| Loading | IMPLEMENTED | `AeActivitySkeleton`. Pagination loading. Summary retry pending. |
| Invalid | N/A | Filters are enumerated chips, not free text. |
| Unavailable | IMPLEMENTED | `ActivityUnavailableState`. Monthly `unavailable` + retry. |
| Interrupted | IMPLEMENTED | Pagination `failed` on `ActivityPaginationControl`. |
| Completed | IMPLEMENTED | Recent queue holds completed/refused separately from attention. |

### Awkward cases (prose)

`toolLabel` can be a long capability sentence; Agent title truncates to 120px with `agentShortId` shown. Amount can be a formatted AUD string or an empty/zero-looking label if usage is missing. Purchase and payment badges can disagree (delivery ≠ settlement) — that disagreement is required, and it looks “messy” on purpose. Export disabled when the preview label says there is nothing to export.

---

## 7. Call receipt — `RES-CALL`

**Path:** `/calls/$callRef` · **Workspace:** `CallReceiptWorkspace` · **Views:** `CallStatusViews.tsx`.  
**Grade:** IMPLEMENTED recovery actions in source (J-B08); buyer-facing remedy copy and invoice-ready record **PARTIAL** / CHARTER. Jobs J-B07, J-B08, J-S01, J-S02.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Customer or support operator opened one Call. They need: status, Tool at Call (snapshot), Provider at Call, Agent current label, buyer amount, purchase status, outcome record, money facts, and only the recovery action the state allows. The main decision is cancel vs reconcile vs wait vs accept. Actions: Check status / Try again; Cancel Call (confirm dialog); submit reconciliation evidence (advanced); reuse actions when complete; back to Calls. Resulting state: same `callRef`; versioned record. Recovery: refused (retryable or not); source_unavailable; reconciliation blockers (missing attempt/effect or permission); cancel may be refused if effect started. **Never** a fresh Call as retry.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Call receipt” + breadcrumbs Calls → Call receipt. Description = `statusDetail`. |
| Fit | `CallSummarySection`: Tool / Provider / Agent / Purpose / buyer amount / recorded / purchase status / outcome. |
| Price | Buyer amount from receipt commercial model (`account_aud` total charge, `seller_canary_x402` authorization, or usage). Else “Not recorded yet”. `CallMoneyFacts`. |
| Provider | “Provider at Call”: `{providerRef} (name not recorded)` when snapshot exists. |
| Terms | Status badge; issue (`CallReceiptIssue`); technical record + timeline behind details. |
| Primary action | State-specific: refresh, cancel, reconcile. Complete: `CallReuseActions`. |
| Preserved context | `callRef` everywhere (`CallReceiptRef`). |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Status badge, `callRef`, buyer amount, purchase status — first screen. Technical JSON last. |
| Attention | One supported recovery action. Advanced reconciliation is behind `<details>`. |
| Memory | Snapshot Tool name ≠ current catalogue. Agent label is current. Purpose is often unrecorded. |
| Learning | Delivery / payment / purchase resolution stay separate labels (`purchaseStatusLabel`, `outcomeRecordLabel`). |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `CallStatusFoundView` + summary + money + technical |
| Empty | PARTIAL | “No canonical result is recorded yet.” Purpose: “Not recorded for this Call.” |
| Loading | IMPLEMENTED | `CallReceiptSkeleton`; workspace `pending`; refresh “Checking…” |
| Invalid | IMPLEMENTED | `CallStatusRefusedView` + refusal evidence facts |
| Unavailable | IMPLEMENTED | `CallStatusUnavailableView` “Receipt unavailable” |
| Interrupted | IMPLEMENTED | `CallStatusUnchangedView`; reconciliation blockers (A$0.00 charged copy); cancel confirm |
| Completed | IMPLEMENTED | Success badge + reuse actions when `receiptView.complete` |

### Awkward cases (prose)

Tool snapshot name can be “Recorded Tool name unavailable” while the link still uses `toolRef`. Provider shows a ref and “name not recorded”. Purpose is structurally empty today — finance still cannot see *why* from this page (J-B07 CHARTER gap). Buyer amount “Not recorded yet” next to a warning badge is the honest incomplete receipt. Long `callRef` is copyable; it must not wrap into a second identity.

---

## 8. Credit — `DEST-BUYER-CREDIT`

**Path:** `/owner/credit` · **Container:** `AeOwnerCreditPage` → `AeOwnerCredit`.  
**Grade:** PARTIAL. Production money gated. Job J-B06, J-R02.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Customer must fund prepaid AUD without treating balance as permission. **Job J-B06**. They need: available credit, locked/reconciliation notice, top-up quote (credit / fee / total), auto-recharge and monthly ceiling as optional controls, invoice and balance history. The main decision is add credit vs open a payment method portal vs wait. Actions: funding panel checkout; refresh balance; save auto-recharge / ceiling; manage saved methods; download tax invoice / Stripe receipt; create statement (admin details). Resulting state: balance units; pending top-up; handoff to `FLOW-FUNDING`. Recovery: balance unavailable (no inferred amount); refresh failed (last balance kept); history unavailable; locked balance refuses new paid Calls.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Credit” — “Add AUD credit for paid Calls. Each Agent’s spending limit remains separate.” |
| Fit | Available credit figure; locked copy; reconciliation open-case alert. |
| Price | `formatDisplayAmount` on available credit; top-up line items in `AeAccountFundingPanel`. |
| Provider | N/A (buyer Account). Provider obligations sit under accounting details. |
| Terms | Page description + section: browsing free; paid Calls reserve AUD **and** remain subject to spending policy. |
| Primary action | Add credit (funding panel). Secondary: refresh, auto-recharge, ceiling, payment methods. |
| Preserved context | Return from Stripe via `FLOW-FUNDING`; Open Balance from funding ready state. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Available credit and “Add credit” must be first. Accounting `<details>` is last. |
| Attention | Top-up is primary. Auto-recharge / ceiling must not look like spending authority. |
| Memory | Funding ≠ authority (repeated in description). Locked ≠ zero. |
| Learning | “Credit”, “Account”, “spending policy” — no wallet, no USDC customer balance. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | Balance card + funding panel + history tables |
| Empty | IMPLEMENTED | `CreditSectionEmptyState`; invoice table empty; month spend `empty` |
| Loading | PARTIAL | Inline skeletons for balance, ceiling, auto-recharge. **No `AeOwnerCreditSkeleton` page file.** `historyLoading`, `invoiceHistoryLoading`, `savedPaymentMethodsLoading`. |
| Invalid | PARTIAL | Funding panel constraint/validation (port). Document action failed status. |
| Unavailable | IMPLEMENTED | Balance unavailable alert; refresh-failed alert; history `unavailable` |
| Interrupted | IMPLEMENTED | Locked; open reconciliation cases; auto-recharge `authentication_required` / `failed` / pending top-up |
| Completed | IMPLEMENTED | History rows after booked top-up; document succeeded notices |

### Awkward cases (prose)

A six-exponent AUD unit renders as a long mono string next to “Available credit”. Locked copy is easy to miss under a large figure. Fee vs credit vs total on the top-up panel can look like three prices. Invoice download may be absent when tax profile is incomplete — table still lists the top-up.

---

## 9. Funding return — `FLOW-FUNDING`

**Paths:** `/fund/$fundingSessionId` (`AeFundingReturnPage`), `/fund/cancelled` (`AePageState`).  
**Grade:** IMPLEMENTED page states. Job J-B06.

### User and context → job → information needed → main decision → actions → resulting state → recovery

The Customer (or Agent-supplied link) returned from Stripe. They need: whether this **exact** session added credit, how much, and which Agent to return to. The main decision is check this payment again vs open Balance vs return to Market — **never** start a second payment. Actions: Try again / Check this payment; Open Balance; Open Market / Back to Market. Resulting state: `ready` credit available; `processing` / `awaiting_payment` still open; `expired` / `failed` / `not_found` / cancelled = no credit change. Recovery: unavailable (retry same id); cancelled “No Account credit or authority changed.”

### Purpose table

| Element | Fit |
| --- | --- |
| Title | State titles: Checking / unavailable / link unavailable / Account credit added / Payment received / Payment not completed / expired / failed / Payment cancelled. |
| Fit | Description names `agentName` and amount when found. |
| Price | `formatDisplayAmount(funding.creditAmount)` AUD. |
| Provider | N/A. |
| Terms | “Do not start another payment.” Cancelled: credit and authority unchanged. |
| Primary action | Ready/expired/failed: Open Balance. In-flight: Check this payment. Not found: Open Market. Cancelled: Back to Market. |
| Preserved context | `fundingSessionId` in the path; noindex. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Outcome sentence + one button. |
| Attention | Single action. No second checkout CTA. |
| Memory | Same session id on retry. Agent name is the return path. |
| Learning | Funding return is not authority and not a Call. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `ready` → `AeFundingReturnState` |
| Empty | IMPLEMENTED | `not_found`; cancelled route |
| Loading | IMPLEMENTED | `checking`; refresh `checking`; `RoutePending` |
| Invalid | IMPLEMENTED | `not_found`; schema fail → unavailable |
| Unavailable | IMPLEMENTED | `unavailable`; refresh `failed` on found |
| Interrupted | IMPLEMENTED | `awaiting_payment`, `processing`, `expired`, `failed`, cancelled |
| Completed | IMPLEMENTED | `ready` |

---

## 10. Provider workspace — `DEST-PROVIDER-SUPPLY`

**Path:** `/owner/operations` · **Container:** `AeProviderWorkspace`.  
**Grade:** PARTIAL. Nav verdict: **DEMOTE off dest** (header peer); **KEEP** route. Jobs J-P01, J-P02.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Provider manages publications, sources, connections, and payouts. They need: inventory rows, projection freshness, readiness, earnings/payout summary, identity. The main decision is add a Tool vs open a row vs connect payouts vs offboard. Actions: `AddToolAction` → `/owner/operations/new`; filter/sort inventory; open connections/earnings/identity sheets; onboarding wizard when inventory is empty; Connect return poller after Stripe. Resulting state: offering list; wizard step payouts vs first_tool. Recovery: inventory `not_found` / `conflict` / `unavailable` (`WorkspaceInventoryGate`); projection pending retry.

**Chrome:** this dest is EXTRA as a **header peer** (journey 4 is not a buyer organising dest). Recommend **DEMOTE** from header/mobile primary; keep the route. Do not rename “My tools” in this wave.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “My tools” — “Publish the exact tools agents can inspect and call.” |
| Fit | `AeOwnerOfferingsList` rows via `toOfferingSummary`. |
| Price | Row projection / earnings sheet — Provider earnings, not buyer Quote. |
| Provider | Identity section (name, public status). |
| Terms | Readiness + connections; offboarding blockers. |
| Primary action | Add Tool. Empty: `AeSupplierOnboardingWizard`. |
| Preserved context | Hash `#provider-identity`; compatibility cursor; connect return query. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Inventory vs empty wizard. Add Tool in the page header. |
| Attention | Publish/add is primary. Settings/offboarding behind details. |
| Memory | Drafts resume on Add Tool (`?draft=`). Payouts configured gates the wizard step. |
| Learning | Tool / Publication / Source / connection stay distinct. “My tools” is inventory, not Market. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `AvailableWorkspaceBody` |
| Empty | IMPLEMENTED | Wizard + empty offerings list |
| Loading | IMPLEMENTED | `AeProviderWorkspaceSkeleton` (`AeOwnerOfferingsList` `loading`) |
| Invalid | IMPLEMENTED | `conflict` gate |
| Unavailable | IMPLEMENTED | `unavailable` + refresh; `not_found` + save profile |
| Interrupted | PARTIAL | `AeConnectReturnPoller`; projection_pending |
| Completed | IMPLEMENTED | Inventory with published rows |

### Awkward cases (prose)

A long Tool name in the offerings table competes with status chips. Empty workspace shows a 3-step “Supplier activation” card talking about “selling tools” and “automated AUD payouts” while the page title is “My tools” — two product dialects on one dest. Payout ineligible (x402) is an earnings-sheet fact, easy to miss if the sheet never opens.

---

## 11. Supply landing — `DEST-PUBLIC-FOR-PROVIDERS` (door)

**Path:** `/for-providers` · **Container:** `AeSupplyLanding`.  
**Grade:** PARTIAL (assess suitability). PAGE not dest (marketing). Job J-P01 assess stage.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A prospective Provider decides whether AE distribution fits. They need: one-Tool offer, four steps, source-fit cases, requirements (no raw keys). The main decision is start listing (`/owner/operations`) vs leave. Actions: “List a Tool”; retry if published-tool source errors. Resulting state: still a marketing page until sign-in. Recovery: `sourceError` alert.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “List a Tool.” Eyebrow Providers. |
| Fit | Steps 01–04; source-fit list; published Tool cards if loaded. |
| Price | Offer sentence: Provider describes price; AE records a Tool. |
| Provider | The reader. |
| Terms | Requirements + check-may-cost copy. |
| Primary action | List a Tool → `/owner/operations`. |
| Preserved context | None (door). |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Offer + primary CTA. |
| Attention | List a Tool. Proof/examples secondary (`AeSupplyAgentProof`). |
| Memory | N/A. |
| Learning | Tool ≠ app; check ≠ publish. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `AeSupplyLanding` |
| Empty | IMPLEMENTED | No published tools: landing still stands |
| Loading | OPEN | No dedicated landing skeleton in this tree |
| Invalid | N/A | |
| Unavailable | IMPLEMENTED | `sourceError` + Try again |
| Interrupted | OPEN | |
| Completed | N/A | Door only |

---

## 12. Add Tool — source and candidates

**Path:** `/owner/operations/new` · **Container:** `AeOwnerSupplySourceStartPage` → `AeSupplySourceNativeStart`.  
**Grade:** PARTIAL. Job J-P01.

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Provider connects a source they already operate. They need: source kind (OpenAPI, MCP, plugin, x402), environment, discovered candidates, and a way to pick one Tool. The main decision is which candidate to describe. Actions: assess/preview; start connection (handoff); select candidate (draft in URL); continue into terms. Resulting state: `?draft=` / `?connection=` / `?environment=`. Recovery: workspace unavailable; saved source unavailable; resume fail; inline `SupplyFlowFeedback`.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Add Tool” — discover Tools from the interface, validate the one submitted. Breadcrumbs My tools → Add Tool. |
| Fit | `SupplySourceTypeSection`, `SupplyCandidateSection`, progress stages source → tool → terms → review. |
| Price | Not yet (next stage). |
| Provider | `businessRef` from identity. |
| Terms | Source environment (sandbox/production). |
| Primary action | Discover / select candidate. |
| Preserved context | Draft and connection search params. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Progress + current source fields. |
| Attention | Discover/select. Connection is a detour, not publish. |
| Memory | Draft must resume after OAuth. |
| Learning | Source ≠ Publication ≠ Tool. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | Native start stages |
| Empty | PARTIAL | No candidates after preview (feedback) |
| Loading | PARTIAL | `discovering` / `AeInlineState`; **no page skeleton on this route** |
| Invalid | IMPLEMENTED | `vm.error` / requiredAction |
| Unavailable | IMPLEMENTED | Identity / sourceUnavailable alerts |
| Interrupted | IMPLEMENTED | Resume requested but unavailable |
| Completed | N/A | Hands off to publication stage |

---

## 13. Add Tool — publication terms and review

**Same path, stages `terms` / `review`.** **Leaf:** `SupplyPublicationFlow`.  
**Grade:** PARTIAL. Job J-P01.

### User and context → job → information needed → main decision → actions → resulting state → recovery

The Provider names the Tool, sets AE-owned terms, and attests. They need: name, description, category, pricing kind (`free` / `fixed_aud` / `source_x402`), connection if not public, consequences, attestations. The main decision is submit for validation vs edit terms. Actions: Continue to review; Edit terms; Submit for validation. Resulting state: Under review — **not published**. Recovery: public-source alert (still needs Provider authority); missing connection; saving inline state; publication locked feedback on the parent.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | Section “Terms” then “Review”. |
| Fit | Review `AeFactList`: Tool, description, category, price summary, connection, declared behavior. |
| Price | `publicationPriceSummary` — free / fixed AUD / source x402. |
| Provider | Connection field or “Public source”. |
| Terms | Consequences + attestations. |
| Primary action | Submit for validation. |
| Preserved context | Selected candidate + draft. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Review card before submit. |
| Attention | Submit is primary; Edit terms is the alternative. |
| Memory | Attestations reset only if the user edits back. |
| Learning | Submit ≠ live on Market. Price kinds must not look like a buyer Quote. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | Terms form / review card |
| Empty | PARTIAL | Empty name/price blocked by disabled submit |
| Loading | IMPLEMENTED | `AeInlineState` “Submitting the exact source revision…” |
| Invalid | PARTIAL | Parent `SupplyFlowFeedback` |
| Unavailable | PARTIAL | Parent source/workspace alerts |
| Interrupted | PARTIAL | `publicationLocked` |
| Completed | PARTIAL | Success on parent; user must check owner Tool status |

### Awkward cases (prose)

A source-derived name can be an operationId (`get_v1_widgets_by_id`) in the Tool name field. `source_x402` price summary is not an AUD figure. Public source still says “Under review until Provider authority is established” after a successful check — easy to read as “listed”.

---

## 14. Connect Provider — handoff

**Path:** `/owner/supply/connections/new` · **Container:** `AeConnectionHandoff`.  
**Grade:** IMPLEMENTED surfaces. Job J-P01.

### User and context → job → information needed → main decision → actions → resulting state → recovery

The Provider must attach a credential to a source without pasting a raw key into the Tool form. They need: origin label, HTTP secret field **or** MCP OAuth start, and a return to Add Tool. The main decision is submit credential / begin OAuth / cancel. Resulting state: consumed, expired, or pending. Recovery: unavailable / expired → start again from Add Tool.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Connect Provider”. Breadcrumbs include Add Tool. |
| Fit | `HttpCredentialForm` or `McpOAuthStartPanel` or `HandoffStatusPanel`. |
| Price | N/A. |
| Provider | `sourceOriginLabel`. |
| Terms | Credential label only. |
| Primary action | Submit / Begin OAuth. |
| Preserved context | `returnSearch` (draft). |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | One form or one status panel. |
| Attention | Connect vs cancel. |
| Memory | Return search must restore the draft. |
| Learning | Connection ≠ publication. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `http_pending` / `mcp_pending` |
| Empty | N/A | |
| Loading | IMPLEMENTED | `AeConnectionHandoffSkeleton`; busy flags |
| Invalid | IMPLEMENTED | `surface.error` |
| Unavailable | IMPLEMENTED | `unavailable` panel |
| Interrupted | IMPLEMENTED | `expired`, `consumed` |
| Completed | IMPLEMENTED | Consumed + Return to Add Tool |

---

## 15. Service connection — OAuth callback

**Path:** `/owner/supply/connections/oauth/callback` · **Container:** `AeOwnerMcpOAuthCallback`.  
**Grade:** IMPLEMENTED. Job J-P01.

### User and context → job → information needed → main decision → actions → resulting state → recovery

The Provider returned from the MCP authorisation server. They need: connected vs refused, and a path back to Add Tool (optionally with `continuationDraftRef`). The main decision is continue vs retry from Add Tool. Do not start a new OAuth from this page.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | “Service connection”. |
| Fit | Alert title: Service connected / not connected / status unavailable. |
| Price | N/A. |
| Provider | Implicit in the attempt. |
| Terms | Refusal codes mapped to copy. |
| Primary action | Return to Add Tool. |
| Preserved context | Draft query when provided. |

### Cognitive-load / states

Perception: one alert. Attention: return. Memory: replayed counts as connected (idempotent). Learning: same “Add Tool” dest.

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `connected` / `replayed` |
| Empty | N/A | |
| Loading | PARTIAL | Route pending only (`RoutePending` if wired) |
| Invalid | IMPLEMENTED | `refused` codes except source_unavailable |
| Unavailable | IMPLEMENTED | `source_unavailable` |
| Interrupted | IMPLEMENTED | `authorization_denied`, `attempt_expired`, `reauthentication_required` |
| Completed | IMPLEMENTED | Connected + link |

---

## 16. Owner Tool status — PAGE under `DEST-PROVIDER-SUPPLY`

**Path:** `/owner/operations/$toolRef` · **Container:** `AeOwnerToolDetailPage` → `AeProviderToolDetail`.  
**Grade:** PARTIAL. Job J-P01.

### User and context → job → information needed → main decision → actions → resulting state → recovery

The Provider inspects one publication’s lifecycle. They need: name, status state, source health, whether test playground is allowed, resume draft if unpublished. The main decision is recheck / withdraw / republish / refresh / resume. Resulting state: invalidated loader. Recovery: not found / status unavailable; refused maintenance with correction message.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | Tool `name` or “Tool status”. Description: publication, source health, delivery, Qualified Use. |
| Fit | `AeProviderToolDetail` status block. |
| Price | Price revision lives in `AePriceUpdateModal` (sheet), not the page title. |
| Provider | Workspace identity check (`businessRef`). |
| Terms | Lifecycle state (e.g. Published). |
| Primary action | State-dependent maintenance. Resume href when `resumeCandidateRef` set. |
| Preserved context | URL is slug **or** offeringRef (lifecycle). |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Status + name. |
| Attention | One maintenance action at a time (reverify on republish). |
| Memory | URL identity changes between draft and published slug. |
| Learning | Recheck ≠ new Tool. Withdraw ≠ delete Business. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | Detail + playground when Published/routeable |
| Empty | N/A | |
| Loading | OPEN | **No `AeOwnerToolDetailSkeleton`.** |
| Invalid | IMPLEMENTED | Slug/offering/business mismatch → not found |
| Unavailable | IMPLEMENTED | `UnavailableTool` |
| Interrupted | PARTIAL | Refused maintenance messages |
| Completed | IMPLEMENTED | Published + playground |

### Awkward cases (prose)

The breadcrumb uses the live name, which can be an operationId. Resume link returns to Add Tool mid-draft while this URL 404s if the user bookmarked the wrong of slug vs offeringRef.

---

## 17. Public business — `RES-PUBLIC-BUSINESS`

**Path:** `/$slug` · **Container:** `AePublicBusiness` → `AeProviderListingPage`.  
**Grade:** PARTIAL. Jobs J-B01 (shop front), J-P02 (discoverability).

### User and context → job → information needed → main decision → actions → resulting state → recovery

A Customer opened a Provider shop front (from Market Providers or a shared slug). They need: business name, listed offerings with price and readiness, a back path to Market or a thread. The main decision is which offering to inspect. Actions: open Tool/offering row; agent.json affordance; website/tel when present. Recovery: unavailable / load error → try again or catalog.

### Purpose table

| Element | Fit |
| --- | --- |
| Title | Eyebrow “Provider”, `catalog.name`. Meta: “N listed · M ready now”. |
| Fit | First-screen facts + “Listed tools” rows. |
| Price | `formatOfferingPrice` on each row. |
| Provider | Header + details aside. |
| Terms | Support / AE-supported action flags. |
| Primary action | Inspect a listed tool. |
| Preserved context | `backFrom=thread`, `backThreadId`. |

### Cognitive-load

| Layer | Requirement |
| --- | --- |
| Perception | Name, counts, first tool rows. |
| Attention | Inspect. Agent.json is for machines. |
| Memory | Back to thread vs catalog. |
| Learning | This is a Provider, not a Tool. Empty catalogue still shows the profile. |

### State coverage

| State | Coverage | Cite |
| --- | --- | --- |
| Normal | IMPLEMENTED | `AeProviderListingPage` |
| Empty | IMPLEMENTED | “No tools listed” |
| Loading | IMPLEMENTED | `ProviderListingPending` (inline, not a `*Skeleton.tsx` name) |
| Invalid | PARTIAL | Route-level not-found lives outside this container (tests: public-business not-found) |
| Unavailable | IMPLEMENTED | `PublicBusinessUnavailable`; `ProviderListingError` |
| Interrupted | OPEN | |
| Completed | N/A | |

### Awkward cases (prose)

A long legal business name in ExtraLight-less operator-adjacent header wraps over the “N listed” meta. Offerings can be listed but not “ready now” (count split). Price via `formatOfferingPrice` can disagree with Bazaar card price for the same capability if supply vs directory projections differ.

---

## 18–20. Shared account (brief)

### `DEST-SHARED-ACCOUNT` — `/owner/settings`

**Job:** J-R02 (sessions, recovery, security history). **Verdict:** PAGE not dest.  
**Chain:** Owner managing person security → confirm sessions/recovery → no market decision → save Clerk/account settings → remain on Account.  
**Purpose:** `OwnerSettingsShell` + `AccountSettingsSection` (history from `readAccountSecurityHistoryServer`). No Tool/price/Provider. Primary: manage sessions/recovery.  
**Cognitive-load:** Perception — account vs workspace vs team (three pages). Attention — security actions, not Market. Memory — not a Call dest. Learning — “Account” ≠ “Credit” ≠ “Agents”.  
**States:** Normal IMPLEMENTED. Loading PARTIAL (route loader; no dedicated skeleton cited). Empty/invalid/unavailable **OPEN** beyond Clerk.  
**EXTRA risk:** none if it stays out of header.

### `DEST-SHARED-TEAM` — `/owner/team`

**Job:** none in the job map (org membership). **Verdict:** PAGE not dest.  
**Chain:** Owner invites/roles → who may administer the workspace → Clerk members + `AeTeamDirectoryTable`.  
**Purpose:** title “Team”; canonical directory table; Clerk members page.  
**If treated as a working dest:** EXTRA — **DEMOTE** (already not chrome). Do not rename.  
**States:** table loading when Convex `undefined`; otherwise Clerk-owned.

### `DEST-SHARED-WORKSPACE` — `/owner/workspace`

**Job:** J-P01 supporting (legal/tax, danger zone). **Verdict:** PAGE not dest.  
**Chain:** Owner sets org profile, tax (`TaxProfileFormSection`), close/transfer (`WorkspaceDangerZone`).  
**Purpose:** Clerk `OrganizationProfile` + billing/tax + danger. No Tool market facts.  
**States:** Clerk-owned; tax/danger have their own empty/pending in those compounds.

---

## 21. Support — `/support` (brief)

**Job:** J-S02 (explain next step; optional `callRef`). **Verdict:** PAGE not dest (utility).  
**Chain:** Customer has a problem, preferably with a Call or chat reference → email support and keep the reference → no purchase transition.  
**Container:** `AeSupportHelpPage` — `ReferencedCallBanner`, `SupportStatusSection`, `AgentConnectionSection` (diagnostic command), `PrivateSupportSection`. Primary: Email support.  
**Cognitive-load:** Perception — keep the reference. Attention — email, not a new Call. Memory — `callRef` query. Learning — same Call word as receipts.  
**States:** Normal IMPLEMENTED. Empty (no `callRef`) hides banner. Loading OPEN (static page; no skeleton required by static-page rule). Unavailable OPEN (status is a separate dest).

---

## 22. System status — `/status` (brief)

**Job:** J-S02 supporting (is the platform itself down?). **Verdict:** PAGE not dest.  
**Chain:** Customer or Provider checks website / Tool API / discovery / catalogue freshness → retry refresh → no purchase.  
**Container:** `AeSystemStatus` + `StatusCheckList` + `StatusRecoveryPanel`.  
**States:** Normal IMPLEMENTED. Loading `AeSystemStatusSkeleton`. Checking via refresh. Recovery panel when a check fails. Interrupted OPEN beyond probe failure.

---

## 23. Onboarding — `FLOW-ONBOARDING` (brief)

**Path:** `/onboarding` · **Container:** `AeOnboardingPage`.  
**Job:** first workspace (not a market job). PAGE not dest.  
**Chain:** Newly signed-in person → choose buyer/provider intent → name workspace → redirect (`sanitizeAuthRedirectTarget`).  
**Purpose:** “Set up your workspace”; role step; workspace name. No Tool/price. Primary: Continue / Finish. Preserved: `?redirect=`.  
**States:** `opening` panel; role; workspace; submitting. Skeleton `AeOnboardingPageSkeleton`. Invalid redirect dropped. Unavailable OPEN.

**Embedded supplier wizard** (`AeSupplierOnboardingWizard` on empty `DEST-PROVIDER-SUPPLY`): profile (name/website/ABN) → payouts (connect or skip) → first Tool. Skeleton `AeSupplierOnboardingWizardSkeleton`. Diagnostic slot for failed profile save. This is **not** `FLOW-ONBOARDING`; do not fold the two.

---

## Skipped dests

| Path / dest | Note |
| --- | --- |
| `/about` | Marketing editorial. No market job. Skip. |
| `/privacy`, `/privacy/remove-business` | Legal. Not a working dest. Skip. |
| `/terms` | Legal. Skip. |
| `/developers/api` (Scalar) | Marketing/API reference. Skip. |
| `DEST-PUBLIC-FOR-AGENTS` `/for-agents` | Marketing door (`AeAgentDoorPage`). PAGE not dest. Not specified. |
| `DEST-SHARED-OVERVIEW` `/owner/` | **EXTRA.** Dashboard habit. Nav map: **FOLD** into Market or account home. Do not rename Overview chrome in this wave. |
| `DEST-OPS-*` | Developer/admin rails. Out of this buyer/provider spec set. |
| `FLOW-AUTH` | Clerk sign-in/up. Not a market screen. |
| `CTX-BUYER-PROVIDER` | OPEN placement, not a screen. |

---

## EXTRA chrome (no job as a peer dest)

| Current | Why EXTRA | Recommendation |
| --- | --- | --- |
| **My tools** in signed-in header / mobile primary | Journey 4 supply; references put host/list in a menu | **DEMOTE off dest**; keep `/owner/operations` |
| **Market** on owner rail `/owner/market` | Same job as `/market` | **FOLD** into `/market` |
| **Overview** `/owner/` | No journey decision | **FOLD** |

Do not rename labels in implementation from this register.

---

## Coverage vs jobs

| Job | Screens that serve it | Human gap |
| --- | --- | --- |
| J-B01 | Market, Ask thread, public business | Vocabulary matching CHARTER |
| J-B02 | Market compare dialog, Tool listing, Ask cards | Compare is preliminary; no recorded exclusions on the human dest |
| J-B03 | Tool next-action, Agents resume, Calls/receipt | **No listing Quote/Call commit** (OPEN walk) |
| J-B04 | — | **OPEN** — empty Market/Ask do not record a gap |
| J-B05 | Agents, Authorize | — |
| J-B06 | Credit, Funding | Production money gated |
| J-B07 | Calls, receipt | Purpose unrecorded; AU documents CHARTER |
| J-B08 / J-S01 / J-S02 | Receipt, Support, Status | Support console OPEN |
| J-A01 / J-A02 | Ask (thin), listing copy-ref | Harness is off-screen |
| J-P01 / J-P02 | Supply dests, landing, public business | Demand inbox CHARTER |
| J-R01 | Calls list only | Progressive match CHARTER |
| J-R02 | Agents, Credit, Account | — |

---

## Biggest missing state coverage

1. **J-B04 has no screen.** Empty Market and Ask recover by broadening search. There is no human dest to record or withdraw a 30-day market request (`marketDemand.*` is API/agent only). Mark **OPEN**.
2. **`RES-TOOL` has no purchase state machine.** No loading skeleton file; no Quote/Call/top-up/Reserve. Indexed vs admitted price can disagree during `Await`. Listing **not SEEN**.
3. **Market compare and saved** lose compare-tray memory on refresh; saved prices can stale with only a caption. No compare-dialog empty/unavailable of its own.
4. **Credit** has no page-level skeleton; reserved vs available is not a first-class pair on the balance card (locked is the closest).
5. **Owner Tool detail** and **Add Tool** lack colocated page skeletons; publication “completed” is under-review, easy to misread as live.
6. **Call Purpose** is always unrecorded — J-B07 “explain why” is structurally empty on `RES-CALL`.

---

## Sources

- Dest and verdicts: [`platform-nav-route-map.md`](./platform-nav-route-map.md)  
- Jobs: [`platform-job-map.md`](./platform-job-map.md)  
- Journey stages: [`platform-journey-blueprint.md`](./platform-journey-blueprint.md)  
- Census: [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7  
- Implementation: `src/routes/market.tsx`, `src/components/ae/market/`, `src/components/ae/chat/`, `src/components/ae/agent-access/`, `src/components/ae/activity/`, `src/components/ae/call-receipt/`, `src/components/ae/console/`, `src/components/ae/funding/`, `src/components/ae/offerings/provider-workspace/`, `src/components/ae/supply/`, `src/components/ae/listing/`, `src/components/ae/support/`, `src/components/ae/status/`, `src/components/ae/principal-account/onboarding/`
