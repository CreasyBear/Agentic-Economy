# Buyer and agent marketplace experience audit

> **Scope reset, 21 September 2026:** this is retained technical evidence. Its priorities do not govern the immediate UX work. Use the [buyer experience baseline](../../../designs/2026-09-21-platform-experience-audit.md) and [page checklist](../../../operations/platform-experience-register.md), reframed around basic site, group and page requirements after Joel’s correction.


**Date:** 2026-09-21  
**Scope:** Buyer and agent marketplace journey, from an expressed capability gap through comparison, authorized Quote/Call, result, and truthful recovery.  
**Owner:** buyer-experience audit  
**Evidence status:** Source-grounded and bounded. This report does not claim visual measurements, hosted acceptance, or a successful paid purchase.

## How to read this audit

The product charter is the source of the ideal. `PRODUCT.md` defines the buyer job as finding a suitable contribution, letting an authorized Agent choose within granted authority, acquiring one bounded contribution, and leaving an explainable/remediable record (`PRODUCT.md:117-149`). Its purchase chain is need → describe → compare → Quote → Call → result or uncertainty → recovery → resolved purchase → outcome record (`PRODUCT.md:185-210`). Funding, authority, purchase, delivery, settlement, and outcome are separate facts.

The audit applies the cognitive-load review to each screen responsibility: reduce what the buyer must remember, compare, and decide; keep primary actions obvious; disclose technical evidence progressively; preserve the current query, Tool reference, and state across handoffs; and expose one safe next action. Target-size, salience, and visual hierarchy claims remain unverified because this is primarily a source audit. The `cognitive-load-auditor` procedure was read and applied; no browser measurements were inferred from class names.

Evidence labels used below:

- **Source** means the behavior is visible in the checked-out route, component, contract, or test source.
- **Test** means a focused test asserts the behavior. Passing tests prove the asserted seam, not the complete hosted purchase journey.
- **Runtime** means a local observation supplied by the parent task. One observation is not a distribution claim.
- **VERIFY** means the next step requires the existing authorized Agent path or a signed-in/hosted exercise that was not available to this bounded audit.

The existing page register withdrew interpolated reference destinations such as Search, Keys, and Trips. This audit therefore proposes screen responsibilities on existing AE routes and components; it does not rename the chrome, invent a wireframe kit, or infer signed-in reference rails (`docs/operations/buyer-page-register.md:65-83`). The Jev register narrows the active goal to the buyer journey and explicitly requires reuse of the existing authorized Agent path, with no synthetic chat purchasing Agent (`docs/operations/jev-platform-integration-register.md:16-22`).

**Runtime navigation update:** On 2026-09-21 the parent observed an authenticated local AE `/market` header with `Market`, `Agents`, `Calls`, and `My tools`. This updates the AE signed-in header observation only; it does not update the reference-vendor rows in the historical page register, and those labels must not be generalized to other products.

## The ideal framework

### JTBD and state chain

The buyer should be able to hold one short question at each stage:

| Stage | Buyer question | Canonical object/state | Existing AE owner |
| --- | --- | --- | --- |
| Need | “What capability would complete this job?” | natural-language need / search query | Market search and chat discovery |
| Shortlist | “Which returned Tools fit the hard constraints?” | Tool candidates and published evidence | registry search/rerank, `/market` |
| Decision | “What differs, and what is still unknown?” | comparison of Tool facts | comparison dialog and Tool inspector |
| Authority | “Which Agent may do this, within what limits?” | Account, Agent, grant, spending policy | `/agent-access`, `/agent-access/authorize` |
| Price and terms | “What exact buyer charge and checks apply to this input?” | expiring Quote | `tool.quote` / capability-execution quote contract |
| Effect | “Did the bounded Call happen?” | one Call, idempotency, delivery/payment state | `tool.call`, `/calls/$callRef` |
| Result | “Can the Agent continue with usable evidence?” | canonical result or pending/uncertain state | Call result and outcome record |
| Recovery | “What is the one action valid for this state?” | status, cancel, reconcile, or refusal | Call recovery panel and status route |
| Repeat | “Can the next request start with better evidence?” | bounded outcome evidence / retained need | later JI-08/JI-09 work, not current entry gate |

The invariant is that a screen may project these facts, but it must not collapse them. A Provider-listed price is not a buyer Quote. Available credit is not authority. A Provider obligation is not delivery. A completed Call is not proof that the buyer’s wider job succeeded.

### IA and route responsibilities

The current route set can support the ideal if each route has one job and hands off through existing state:

| Route | Responsibility in the ideal | Primary next step | Important states |
| --- | --- | --- | --- |
| `/market` and `/owner/market` | Start with a job phrase, return a bounded Tool set, let the buyer inspect or compare | Search, refine, Compare, Inspect Tool | loading, no-fit, source stale/unavailable, pagination |
| `/tools/$providerHost/$slug` and `/tools/$toolRef` | Explain one Tool’s capability, evidence, readiness, price semantics, input/output, and safe next action | retain Tool reference, connect/resume an Agent | admission pending, routeable, setup required, unavailable |
| `/t/new` and `/t/$threadId` | Translate buyer language, search, compare, clarify, and carry a selected Tool into the existing Agent path | continue with `resumeTool` / authorized Agent | anonymous discovery, authenticated durable chat, model/source failure, no fit |
| `/agent-access` and `/agent-access/authorize` | Select an existing Agent and review its requested connection, authority mode, Tool access, and expiry | connect, approve, decline, or recover an authorization result | no Agent, pending, succeeded, outcome unknown, refused |
| `/owner/credit` | Show authoritative AUD balance and funding controls without implying authority | add credit after exact fee/total review; return to Agent policy when needed | unavailable/locked balance, top-up, history, reconciliation |
| `/activity` | Triage Calls needing attention separately from routine history | open a Call receipt | filters, no Calls, no filter match, needs attention |
| `/calls/$callRef` | Show the exact Call state, result, buyer money facts, and valid recovery action | refresh, cancel, reconcile, or continue from a completed result | pending, unchanged, completed, refused, source unavailable, reconciliation required |
| market-demand API routes | Preserve an authenticated missing need for later matching | status or withdraw | open, matched, expired/not found, unavailable; future buyer surface |

This is a responsibility map, not a destination mandate. The historical page register lacks some signed-in observations; the fresh local AE header observation above updates AE only. Reference-vendor navigation remains unverified where the historical record says so. Any chrome change still needs task evidence.

### Reuse-first path to ideal

The smallest path is a connected projection and handoff, not a second marketplace or a new purchase system:

1. Keep `AeX402Directory`, `DirectoryComparison`, `AeToolInspector`, `AeAgentAccessAuthorizeForm`, `AeOwnerCredit`, `AeActivity`, and the Call receipt/recovery components as the existing surface vocabulary.
2. Preserve the query and selected Tool reference through the existing `MARKET_LINK_STATE` and `resumeTool` route state. Prove the existing authorized Agent can reach the existing Quote/Call contracts before adding any buyer-facing action.
3. Use the existing Quote result for exact buyer AUD amount, authority, balance, policy, expiry, and required action. Do not re-derive those facts from catalogue cards or add a human checkout object.
4. Use `callRef` and existing Call status/recovery transitions for the return path. Do not add a chat-specific Call ledger or a second retry taxonomy.
5. Add only seam tests for the handoff, synthetic-authority refusal, source/admission fallback, and state-preserving return. Treat later durable saves, retained demand, and repeat allocation as their existing Jev milestones, not entry-release gates.

## Current-state register

| Area | What the source currently provides | What remains uncertain |
| --- | --- | --- |
| Discovery | `/market` has a natural-language search field, Tools/Collections/Providers/Saved views, filters, sorting, pagination, save, and comparison (`src/components/ae/market/AeX402Directory.tsx:209-260`, `:283-366`). | Whether the signed-in shell presents the right default for each buyer task; no visual task study was run. |
| Detail | The canonical detail route renders indexed metadata while admission resolves, then `AeToolInspector` exposes Overview/Contract/Schemas, evidence, readiness, price semantics, and a next action (`src/routes/tools.$providerHost.$slug.tsx:18-40`, `src/components/ae/market/public-tool-detail/AeDirectoryToolCanonicalPage.tsx:17-60`, `src/components/ae/market/tool-detail/AeToolInspector.tsx:79-137`). | Whether indexed cards resolve to current truthful descriptors and supported execution states. The charter permits browsing an external x402 Tool before AE admission/publication; admission is not required merely to show its known metadata. |
| Comparison | Up to four local selections are compared in a dialog using Provider-published facts; the dialog explicitly says the Agent Quote confirms exact buyer AUD price and spending checks (`src/components/ae/market/AeX402Directory.tsx:187-205`, `src/components/ae/market/DirectoryComparison.tsx:10-38`). | Whether the buyer can complete the decision without repeatedly reopening details. |
| Chat | `/t/new` and durable threads support search, describe, compare, and (when authority is passed) Quote/Call tools. The implementation also constructs an `interactive-chat` synthetic principal (`convex/chatTools.ts:220-252`, `:351-425`). | The existing Jev register records the synthetic path as refused before Provider contact because it lacks source-write admission and a purchasing grant (`docs/operations/jev-platform-integration-register.md:22`). |
| Authority/funding | Agent access review exposes connection, authority mode, Tool access, request facts, and approve/decline (`src/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeForm.tsx:43-110`). Credit separates balance, spending policy, top-up, invoices, history, and reconciliation (`src/components/ae/console/AeOwnerCredit.tsx:177-340`). | Whether the existing Agent continuation presents the returned Quote and any missing prerequisite coherently for one selected Tool/input. No extra preflight or human approval is required by this audit. |
| Quote/Call | Quote binds exact input, price, Account, balance, policy, and evidence; Call uses canonical Agent authority, idempotency, and recovery contracts (`src/modules/capability-execution/quote.ts:20-151`, `src/modules/capability-execution/call.actions.ts:27-71`). | Source and local tests do not establish a successful hosted purchase through the UI. |
| Status/recovery | Calls has attention and recent queues (`src/components/ae/activity/AeActivity.tsx:59-123`); the receipt separates current result, money facts, recovery, and technical record (`src/components/ae/call-receipt/CallStatusViews.tsx:96-120`, `src/components/ae/call-receipt/CallRecoveryPanel.tsx:77-100`). | Whether the preceding Agent result always carries a buyer-usable `/calls/$callRef` link and original job context. |
| Retained need/repeat | Market-demand has private credential-owned create/list/status/withdraw APIs with a 30-day window and no auto-purchase (`src/modules/market-demand/market-demand.actions.ts:14-130`, `:218-265`, `:310-425`). Tool evidence and Call records exist. | No buyer-facing retained-need screen was found; Jev JI-09 says production capture lacks need/exposure/usefulness data (`docs/operations/jev-platform-integration-register.md:423-427`). These are future evidence gaps, not current entry-release gates. |

## Six charter journeys

| Charter journey | Coverage now | Buyer experience assessment | Release treatment |
| --- | --- | --- | --- |
| 1. Describe a natural need and find a match | `/market` search and `/t/new` discovery are present; registry search/rerank is reused | **Partial.** Search starts with job language, but chat-to-authorized-Agent continuity is unresolved. | Active buyer work; verify with JI-04b. |
| 2. Compare suitable services and choose without scanning the catalogue | Local comparison tray, preliminary facts, canonical detail links | **Partial.** Published facts are honest, but caller-specific input, readiness, and exact terms are split across detail and Agent paths. | Active buyer work; improve comparison handoff, not catalogue scope. |
| 3. Choose, buy, and continue with minimal integration burden | Existing Agent access, Quote, Call, credit, receipt, and recovery contracts | **Partial / VERIFY.** The route contracts exist; a source and local dev blocker prevents treating chat as a buyer purchase actor, and the authorized Agent path has not been accepted end-to-end here. | Active buyer work; no new purchase system. |
| 4. Provider exposes a capability and reaches relevant buyers | Provider routes and source/admission/publication modules exist | **Not assessed as a buyer defect.** Provider distribution is a separate charter journey and outside the narrowed active buyer goal. | Future/outside this audit’s current release gates. |
| 5. No suitable supply now; connect when available | Private market-demand API has idempotency, ownership, expiry, status, and withdrawal | **Machine-only.** No buyer screen or chat continuation was found. | Future JI-08a/b; do not gate current M1 buyer work. |
| 6. Repeated use progressively improves matches | Track-record facts and Call/outcome records exist; saved Tools are browser-local | **Evidence gap.** No proven consumer uses outcome/exposure/usefulness to improve a later choice. | Future JI-09a/b; no release claim until permitted data and evaluation exist. |

## Low-fidelity screen contracts

These are textual contracts for the existing surfaces. They deliberately avoid prescribing a new wireframe kit.

| Screen | Must answer | Primary action | State and recovery contract |
| --- | --- | --- | --- |
| Market | “What job are you trying to complete, and which small set of Tools may fit?” | Enter a job phrase; then Inspect or Compare | Keep query/filter state. Empty results say what was searched and offer one useful clarification or existing browse path. Source freshness and Provider-published facts remain explicit. |
| Tool detail | “Can this Tool plausibly help, what is known, what is unknown, and how do I continue?” | Inspect input/output/effects; retain ref; connect existing Agent | Admission pending may show metadata summary. Refused/unavailable shows no invented commercial facts or Call steps and offers Browse current Tools. |
| Compare dialog | “Which candidate best meets the evidence I care about?” | Inspect a selected Tool or continue with the existing Agent path | Label preliminary Provider facts. Never imply the table is a Quote. Preserve selection and query when results refresh. |
| Chat thread | “What did AE find, what clarification is needed, and what safe next step is supported?” | Search/compare/clarify; hand off selected Tool to existing authorized Agent | Anonymous chat cannot Call. Authenticated chat must not manufacture purchase authority; model/source failures retain a truthful recovery message and Browse market path. |
| Agent access/authorization | “Which existing Agent may act, with what scope and expiry?” | Review, approve, decline, or select a permitted Agent | Show connection, authority mode, Tool access, and request facts together. Outcome unknown says not to resubmit blindly. |
| Credit | “What authoritative AUD funds are available, and what does top-up cost?” | Review exact credit/fee/total; add credit | Explain that funding does not change Agent authority or spending ceilings. Keep locked/unavailable/reconciliation states explicit. |
| Calls/activity | “What happened to this exact Call, and can I continue?” | Open a Call; then refresh/cancel/reconcile where supported | Separate needs attention from routine history. Use only the action supported by the recorded state; never offer a blind retry. |

## Prioritized buyer experience register

### BX-BUY-01 — Detail-to-purchase continuation is split (P1, active, VERIFY)

- **Ideal:** A selected Tool keeps its reference, query, and input context while the buyer enters the existing authorized Agent path. The next visible step is Quote, then Call, then a result or truthful status; no second checkout or chat-specific purchase actor is introduced.
- **Current:** The full Tool inspector says the Agent confirms exact buyer AUD, authority, balance, and availability through `tool.quote`, then offers “Connect an Agent first” at `/agent-access?resumeTool=...`. Its model tells the user to paste the reference into an existing client (`src/components/ae/market/tool-detail/AeToolNextAction.tsx:49-75`, `src/components/ae/market/tool-detail/tool-inspector-model.ts:50-101`). Quote and Call contracts exist, but the public detail route has no caller-specific human Quote/Call control (`src/modules/capability-execution/quote.ts:20-151`, `src/modules/capability-execution/call.actions.ts:27-71`).
- **Gap/friction:** The reference is already externalized through the copy control and `resumeTool`; this is not a claim that the buyer must memorize it. The material risk is context switching and an unverified prepared-input continuation. The existing Agent should not be forced through setup again for every purchase.
- **Smallest reuse-first remedy:** Use the existing authorized Agent continuation; use `/agent-access` and `resumeTool` when connection is actually needed. Carry the selected Tool and any supported input context from Market/detail/chat, then verify the existing Agent → `tool.quote` → `tool.call` path and return `callRef`. Reuse an already connected/authorized Agent when the contract allows it. Add no human checkout, new purchase object, or new component family.
- **Dependencies:** Existing Agent credential/grant, `resumeTool` route state, Quote contract, Call receipt/recovery.
- **Behavioral acceptance:** The selected Tool reference and supported input context survive the handoff; an already authorized Agent does not repeat setup without a contract-required reason; Quote uses the actual authorized Agent and exact input; Call is allowed only after a current Quote; a refusal identifies one supported next action; completed/pending Calls expose the canonical `callRef`.
- **Evidence:** Test coverage proves canonical detail links and saved/detail routing (`tests/unit/market/x402-directory-page.test.tsx:51-74`, `:126-132`), not an end-to-end purchase. Cross-reference Jev `JI-04b`, `docs/operations/jev-platform-integration-register.md:16-22`, `:45-59`; this is the active buyer continuation row.

### BX-BUY-02 — Chat exposes a synthetic purchase authority (P1, active blocker)

- **Ideal:** Chat translates language, searches, compares, and clarifies. When the buyer chooses a Tool, it hands the Tool reference to the existing authorized Agent path. Chat does not manufacture a principal or claim that signed-in human identity is a purchasing grant.
- **Current:** When an authority context is present, `createChatAgent` constructs a principal with `applicationRef: 'interactive-chat'`, sandbox environment, `market_tools:call`, and `approval_required` mode (`convex/chatTools.ts:220-252`). It then exposes `tool.quote` and `tool.call`, deriving a chat idempotency key and invoking the capability actions (`convex/chatTools.ts:351-404`). The instructions say the chat can run eligible bounded Tools (`convex/chatTools.ts:407-425`). The existing Jev register records the dev result: source-write admission is missing and the synthetic identity has no purchasing grant, so Quote refuses before Provider contact (`docs/operations/jev-platform-integration-register.md:22`).
- **Gap/friction:** The conversational affordance suggests a direct purchase while the real authorization boundary refuses it. That is a high-cost surprise and can cause an unsafe retry interpretation.
- **Smallest reuse-first remedy:** Remove or disable `tool.quote`/`tool.call` from the synthetic chat actor and hand the selected Tool reference to the existing authorized Agent path. Chat should not receive or store real Agent credentials. The bounded buyer fix should not add a dedicated chat Agent or weaken source-write admission.
- **Dependencies:** Chat tool composition, existing Agent access/authorization, source-write admission, Quote refusal projection.
- **Behavioral acceptance:** Anonymous and authenticated chat never passes an `interactive-chat` synthetic principal to a purchase action. Chat can return a selected Tool reference and a continuation link. The existing authorized Agent path uses the existing Quote/Call contracts outside the synthetic chat actor. Non-retryable admission refusal is explained as such and never described as a Provider outage.
- **Evidence:** Four focused chat/Market suites passed locally (45 tests; command recorded below). Chat tests assert the six provider-safe tool names and literal continuation result (`tests/unit/chat/chat-provider-contract.test.ts:42-138`) and authenticated materialization/fallback (`tests/unit/chat/chat-provider-boundary.test.tsx:182-223`); they do not prove a real funded Call. Cross-reference Jev `JI-04b`, especially `docs/operations/jev-platform-integration-register.md:22`, `:296-303`.

### BX-BUY-03 — Comparison is honest but remains a publication-fact table (P2, VERIFY, design hypothesis)

- **Ideal:** Comparison reduces the decision to the buyer’s hard constraints: input fit, output, readiness, Provider/data/effect facts, freshness, indicative price semantics, and the exact next verification step. It clearly separates published evidence from caller-specific Quote terms.
- **Current:** `DirectoryComparison` has Category, Provider, Description, Provider-listed price, Input needed, Returns, and Recent use, followed by “Inspect Tool.” Its copy says it is preliminary Provider facts and that an Agent Quote confirms exact buyer AUD price and spending checks (`src/components/ae/market/DirectoryComparison.tsx:10-38`).
- **Gap/friction:** The separation is truthful and is an existing strength. It is a design hypothesis that repeatedly opening detail and entering the Agent path may add friction; no task evidence in this audit proves that it prevents a buyer decision. Comparison currently helps shortlist, while caller-specific availability, authority, and exact terms remain in the existing Tool/Agent path.
- **Smallest reuse-first remedy:** Extend the existing comparison projection only with fields already available from the canonical Tool/detail model, or make the existing Inspect/Agent continuation preserve comparison state. Do not claim availability, quality, or exact price in the table, and do not create a second comparison object.
- **Dependencies:** Existing Tool compare action, Tool inspector model, authorized Agent handoff.
- **Behavioral acceptance:** The dialog remains capped at four local selections; every field is labeled as published/indicative or exact/quoted; hard constraints are visible when source evidence exists; Inspect preserves the current comparison/query; no Provider fact becomes a buyer promise.
- **Evidence:** Test asserts the “Preliminary comparison” copy, seven fact rows, and canonical Inspect links (`tests/unit/market/x402-directory-page.test.tsx:77-97`). Cross-reference Jev `JI-04b` and the buyer page register’s open signed-in evidence row.

### BX-BUY-04 — Discovery presents several equally weighted modes before the job is resolved (P2, VERIFY, design hypothesis)

- **Ideal:** Start with the buyer’s job phrase, return a bounded set of relevant candidates, and reveal provider, saved, collection, sort, and advanced filters as the next decision requires. The buyer should not need to remember which view contains the answer.
- **Current:** The Market component puts the search field above four same-level tabs—Tools, Collections, Providers, Saved—and exposes result counts and filters in the same band (`src/components/ae/market/AeX402Directory.tsx:209-260`). It then offers filters, sort, result counts, load-more/pagination, and source/freshness notes (`src/components/ae/market/AeX402Directory.tsx:283-366`).
- **Gap/friction:** This is a cognitive-load hypothesis rather than an observed defect: the first decision could become “which catalogue mode?” instead of “which Tool fits my job?” The source does not establish actual task failure, target-size failure, or a measured hierarchy problem. Existing query/filter preservation and recovery behavior are strengths.
- **Smallest reuse-first remedy:** Keep the existing routes, tabs, filters, and components. Use the existing search/query state to make the job result the first decision, progressively reveal advanced filters, and preserve query/comparison state when a view changes. Do not rename the chrome based on inferred reference products.
- **Dependencies:** Market route search state, existing `DirectoryHero`, Tabs, filters, comparison state.
- **Behavioral acceptance:** A buyer can submit a job phrase without choosing a tab; changing filters retains the query; filter errors are local and recoverable; comparison selection survives a result refresh. The existing tests already cover filter validation and state preservation (`tests/unit/market/directory-explorer-filters.test.tsx:35-103`, `tests/unit/market/x402-directory-page.test.tsx:134-157`).
- **Evidence:** Source-only cognitive-load finding. No browser timing, click-count, or visual measurement was made.

### BX-BUY-05 — Tool detail puts decision, contract, evidence, and next action in separate research layers (P2, VERIFY, design hypothesis)

- **Ideal:** The first decision layer answers fit, readiness, indicative price, input burden, key risks, and the next supported step. Contract schemas, transport, provenance, and detailed performance evidence remain available through progressive disclosure.
- **Current:** Full inspection uses Overview and Contract tabs plus a Schemas sheet; Overview renders decision, track record, and facts, while Contract renders contract sections (`src/components/ae/market/tool-detail/AeToolInspector.tsx:79-120`, `:124-153`). The full next action is rendered after the research panel (`src/components/ae/market/tool-detail/AeToolInspector.tsx:124-137`). Track record and economics expose several facts (`src/components/ae/market/tool-detail/AeToolTrackRecord.tsx:5-58`, `src/components/ae/market/tool-detail/AeToolEconomics.tsx:7-77`).
- **Gap/friction:** A buyer may need to move between summary, Contract, Schemas, and the bottom continuation to decide. This is inferred from source responsibility, not from a visual measurement or task evidence; the existing tabs, compact contract sections, and Schemas sheet are deliberate progressive disclosure strengths.
- **Smallest reuse-first remedy:** Reuse the existing `AeToolDecision`, compact contract sections, `AeToolFacts`, and `AeToolNextAction` projections. Bring only the minimum “fit + readiness + price semantics + next safe action” into the first decision layer; leave exact schema/effect evidence behind the existing Contract/Schemas disclosure.
- **Dependencies:** Tool inspector model, existing evidence and contract projections; no new visual kit.
- **Behavioral acceptance:** The same model drives compact and full views; indicative price and readiness labels remain truthful; technical schemas are still reachable; unavailable/admission states never show invocation steps or commercial facts not established by source.
- **Evidence:** Source-only. The existing implementation already has compact/full projections, so the remedy should be a bounded composition change, not a redesign.

### BX-BUY-06 — Funding and authority are separately modeled but not assembled at the buyer decision point (P1, active)

- **Ideal:** Once the existing authorized Agent returns a Quote, the buyer or Agent can see one contextual decision containing selected Tool/input, exact current Quote amount in AUD, Account available balance, Agent authority and spending policy, expiry, and the one action required if a check fails. This is a projection of the returned Quote, not a mandatory human preflight or an extra approval step; the facts remain separate in the domain model.
- **Current:** Tool detail says the Agent will confirm exact amount, authority, balance, and availability via `tool.quote` (`src/components/ae/market/tool-detail/AeToolNextAction.tsx:64-74`). Agent authorization separately exposes connection, authority mode, Tool access, expiry, and request facts (`src/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeForm.tsx:43-110`). Credit separately shows balance, spending policy, top-up exact fee/total, history, and reconciliation (`src/components/ae/console/AeOwnerCredit.tsx:177-340`). Quote already binds the caller-specific facts in its result (`src/modules/capability-execution/quote.ts:20-151`).
- **Gap/friction:** The buyer must hold the distinction between funding, authority, and purchase while moving among routes, and may read a Provider-listed price before seeing the exact buyer amount.
- **Smallest reuse-first remedy:** Project existing Quote fields into the existing Agent continuation and link only to the existing Credit or authorization route when the Quote’s required action says so. Reuse `ConsentRequestFacts`, `AeFactList`, and Quote continuations; do not create a wallet, checkout, or duplicated policy store.
- **Dependencies:** Real authorized Agent path (BX-BUY-01), Quote refusal/continuation mapping, existing Credit and consent routes.
- **Behavioral acceptance:** Funding copy never implies authority; authority copy never implies a purchase or adds an approval inside already granted permission; exact buyer amount is sourced only from the returned Quote; “adding credit does not increase account limit” remains visible for budget refusals; users can return to the selected Tool/input after funding or authority review.
- **Evidence:** Source and contract evidence only. Cross-reference `PRODUCT.md:95-115`, `CONTEXT.md:207-218`, and Jev reuse map `docs/operations/jev-platform-integration-register.md:45-59`.

### BX-BUY-07 — Directory detail can show a local unavailable state (P2, runtime VERIFY)

- **Ideal:** If current directory metadata is available but admitted detail/readiness cannot be verified, retain the honest title, Provider, description, and Provider-listed price as a directory snapshot, label readiness as unverified, and offer one safe action: retry/check later or Browse current Tools. If metadata itself is unavailable, state that clearly and show no fabricated commercial or invocation facts.
- **Current:** `AeDirectoryToolCanonicalPage` maps metadata `not_found` and `unavailable` directly to “Tool details are unavailable” / “AE cannot verify the current directory entry right now” (`src/components/ae/market/public-tool-detail/AeDirectoryToolCanonicalPage.tsx:64-67`). The route also has a generic error boundary with the same copy (`src/routes/tools.$providerHost.$slug.tsx:38-40`), while the metadata-found path renders a summary while admission resolves (`src/routes/tools.$providerHost.$slug.tsx:18-25`, `src/components/ae/market/public-tool-detail/AeDirectoryToolCanonicalPage.tsx:27-60`).
- **Gap/friction:** Parent runtime observed the same unavailable copy twice on 2026-09-21 (initial card click and direct revisit) for authenticated local `3024` `/tools/agent402.tools/v1-images-generations`. The observation maps to the metadata-unavailable handling above. It does not prove that the admission promise rejected after valid metadata, or establish a universal detail failure; diagnose the boundary first.
- **Smallest reuse-first remedy:** First classify and instrument the existing metadata/admission boundary. Retain the summary only when metadata is actually `found`, label the readiness/admission state, and preserve the existing `AePageState`, `MarketBackButton`, and Market return state. Do not show unverified commercial or invocation facts.
- **Dependencies:** Admission error classification, route `Await` fallback/error boundary, current directory return state.
- **Behavioral acceptance:** Metadata-found/admission-failed renders the summary plus explicit unverified state and a safe return action; metadata unavailable, not-found, and invalid-reference states remain distinct; no stale exact price, schema, or Call step is fabricated. Exercise the existing detail boundary in admitted, metadata-unavailable, and not-found cases before selecting a repair.
- **Evidence:** Runtime observation is parent-supplied and single-case. The focused Market/detail tests prove canonical route links, not admission success (`tests/unit/market/x402-directory-page.test.tsx:51-74`). Cross-reference `docs/operations/buyer-ia-coverage.md` and the page register’s “not visited” signed-in detail row.

### BX-BUY-08 — Buyer context is not guaranteed to survive into the Call receipt (P2, VERIFY)

- **Ideal:** After Quote/Call, the Agent or UI returns a canonical `callRef` and the buyer can see the Tool, Provider-at-Call, Agent, original bounded purpose when recorded, buyer amount, purchase status, outcome, current result, and one valid recovery action. A pending or uncertain Call is resumable without blind retry.
- **Current:** `/activity` separates “Needs attention” from “Recent Calls” and links to exact Call records (`src/components/ae/activity/AeActivity.tsx:59-123`). The receipt separates summary, issue, recovery, current result, money facts, reuse actions, and technical record (`src/components/ae/call-receipt/CallStatusViews.tsx:96-120`). Recovery actions are state-gated and explicitly say to use only the action supported by the recorded state (`src/components/ae/call-receipt/CallRecoveryPanel.tsx:77-100`). The summary currently renders `Purpose` as “Not recorded for this Call” when no purpose exists (`src/components/ae/call-receipt/CallSummarySection.tsx:49-85`).
- **Gap/friction:** The recovery contract is strong, but the source does not prove that every Agent result hands the buyer into `/calls/$callRef`, or that an original job purpose is available. This remains a bounded continuity hypothesis, not a known broken handoff. If purpose is not present in the supported Call record, “Not recorded” is truthful.
- **Smallest reuse-first remedy:** Preserve the existing receipt/recovery route and expose an optional purpose only when an existing supported Call record already contains it. Do not infer a purpose from a Tool title, require new purpose collection, add a schema, or add a new history system. Verify one completed, pending, refused, and reconciliation-required authorized path.
- **Dependencies:** Authorized Agent continuation, canonical Call result/link, existing receipt projection and recovery contracts.
- **Behavioral acceptance:** Every Call result that is returned to a buyer includes its canonical `callRef`; purpose is shown only when an existing supported record contains it, otherwise it remains “Not recorded”; pending/refused/reconciliation states retain their exact labels and supported next action; no blind retry is offered.
- **Evidence:** Source-only for the missing end-to-end handoff. Existing receipt/recovery code covers the state behavior; no hosted purchase or live financial effect was performed. Cross-reference Jev `AM-24/25` and `JI-04b/JI-07b` boundaries.

## Future evidence gaps kept out of current release gates

Two framework outcomes are visible in contracts but should remain explicit future work rather than be presented as current defects:

- **Later matching (JI-08a/b):** the market-demand API is private, credential-owned, idempotent, 30-day bounded, and does not authorize a purchase (`src/modules/market-demand/market-demand.actions.ts:218-265`, `:310-425`). There is no buyer-facing screen; if this returns to scope, attach it to the existing no-fit state in Market/chat and preserve the API’s ownership, expiry, withdrawal, and no-auto-buy invariants. The focused market-demand tests cover current-match refusal, replay, expiry, and delayed-match rechecks (`tests/unit/market-demand/market-demand-actions.test.ts:51-79`, `:127-183`).
- **Repeat allocation (JI-09a/b):** Tool track-record facts can inform a buyer’s current decision, but the Jev audit says production capture lacks original need, candidate exposure, corrections, and usefulness/switching labels (`docs/operations/jev-platform-integration-register.md:423-427`). Do not add personalized ranking or claim “better matches” until permitted outcome/exposure data and the held-out evaluation exist. Browser-local Saved Tools are a convenience, not evidence of repeat-allocation learning (`src/components/ae/market/DirectorySavedTools.tsx:86-111`, `:124-180`).

These two rows are deliberately not additional M1 buyer gates, in line with the current Jev scope (`docs/operations/jev-platform-integration-register.md:33-37`).

## Verification record

- Runtime pin checked before inspection: Node `v22.22.0`, npm `11.5.1`.
- Read-only focused command run from the shared worktree:

  `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm exec vitest run tests/unit/chat/chat-provider-contract.test.ts tests/unit/chat/chat-provider-boundary.test.tsx tests/unit/market/x402-directory-page.test.tsx tests/unit/market/directory-explorer-filters.test.tsx --no-file-parallelism`

  Result: **4 test files passed, 45 tests passed** in 3.40 seconds. This validates the tested chat provider boundary, canonical Market/detail routing, comparison semantics, and filter behavior. It does not establish a live authorized Quote/Call, hosted admission, visual ergonomics, or a paid transaction.

- No deployment, purchase, network write, schema change, app-code edit, or change to another register was made for this audit.
