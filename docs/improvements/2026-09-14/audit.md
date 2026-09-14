# Alpha IA/UX stabilisation audit

**Date:** 2026-09-14

**Mode:** Full, UI focus
**Decision:** Treat the customer journey as the alpha product. Stabilise the path from need to verified purchase before adding dashboard breadth.

## Executive outcome

The alpha should make one commercial journey obvious:

> Fund one AUD Balance, connect an Agent with bounded authority, find a Tool, let the Agent obtain a Quote and make a Call, then understand or recover that Call.

The current product has strong commercial-state and payment-safety foundations, but the interface does not yet present that foundation as one continuous journey. The highest-risk gaps are structural:

1. The owner home is the Provider Tools workspace, not a neutral customer overview.
2. Balance is visually subordinate and its primary read is coupled to Agent-directory data.
3. Funding return states describe continuations that their actions cannot perform.
4. Market-to-Agent handoff loses progress and relies on copied opaque references.
5. Calls needing attention are not separated from routine history, while receipt and recovery screens foreground internal machinery.
6. The buyer and Provider journeys share navigation before the user has chosen or established the Provider role.

These are alpha blockers because they create dead ends, false hierarchy, uncertain money state, and abandonment at cross-application handoffs. Catalogue refinement, analytics dashboards, crypto funding, auto top-up, and advanced finance administration should not outrank them.

## Audit coverage

| Audit | Status | Findings | Report |
| --- | --- | ---: | --- |
| Cognitive load | Succeeded | 24 | [Cognitive-load audit](./audit/cognitive-load-auditor.md) |
| Gestalt | Succeeded | 17 | [Gestalt audit](./audit/gestalt-reviewer.md) |
| Rams design audit | Succeeded | 24 | [Rams audit](./audit/rams-design-audit.md) |
| Unidirectional flow | Succeeded | 12 | [State-flow audit](./audit/unidirectional-flow-enforcer.md) |

**Metadata:** 4 audits succeeded, 0 failed, 22 not applicable to this UI-focused pass, 26 available axes total. The synthesis also applied the relevant IceInVein design, simplicity, contract, type-state, error, and temporal-coupling guidance. This was a non-interactive review: the governing thesis came from `PRODUCT.md`, and source/tests plus the OpenRouter and live AE browser evidence supplied the observations.

## Product design contract

### Thesis

An Australian business can fund one AUD Balance, connect a bounded Agent, find and use one Tool, and understand or recover the resulting Call without learning Agentic Economy's internal commercial, accounting, or protocol machinery.

### Invariants

- Funding is not authority. Show Balance state and Agent spending policy separately.
- Authority is not a purchase. Approval describes the exact Tool, Agent, maximum AUD consideration, consequence, and data use.
- Settlement is not delivery or purchase resolution. The customer sees one plain-language Call outcome, with exact evidence available on demand.
- Unknown is never rendered as zero, complete, or safe to repeat.
- Every nonterminal state has one exact continuation and says when the user must not repeat an action.
- Known facts remain visible when a secondary read fails.
- Internal references, hashes, upstream USDC settlement, Provider obligations, and machine receipts are evidence—not first-view navigation.
- Each screen has one visually dominant job and one primary action.

## What to transfer from OpenRouter

Use OpenRouter as a shell and interaction reference, not as a commercial-domain model.

| Transfer | Agentic Economy application |
| --- | --- |
| Dominant balance number and Add Credits action | Large available AUD Balance, reserved/locked state beneath it, one Add credit action |
| Activity summary separate from detailed logs | Calls overview and attention queue separate from detailed receipt/evidence |
| Compact key-management table | Agents table: identity first, authority/status/recent use, trailing actions |
| Searchable, sortable model catalogue | Need-led Tool discovery with buyer-facing price and availability |
| Stable authenticated workspace shell | One owner shell with a neutral Overview and role-appropriate Buy/Supply groups |

Do not transfer crypto-first funding, automatic top-up, model/provider vocabulary, or a settlement-only view of success.

## Target alpha information architecture

The global header and authenticated workspace navigation must not duplicate the same destinations at different hierarchy levels.

| Level | Destination | Purpose |
| --- | --- | --- |
| Workspace home | **Overview** | Available Balance, Calls needing attention, connected Agents, Provider status when applicable, and one next action |
| Buy | **Market** | Describe a need, inspect candidates, and hand one Tool to an Agent |
| Buy | **Calls** | Needs attention first; recent Calls and receipts second |
| Buy | **Agents** | Connect Agents, review authority, and resolve approval requests |
| Buy | **Balance** | Available/reserved AUD, Add credit, one chronological transaction history, customer documents |
| Supply, disclosed after Provider setup | **My Tools** | Tool status, recent activity, and one next action per Tool |
| Supply | **Connections** | Provider access and source health |
| Supply | **Earnings** | Earnings and payout readiness |
| Account | **Business & security** | Business identity, people, credentials, privacy, and security |
| Advanced/operations | Finance and technical evidence | Reconciliation, daily close, Provider obligations, hashes, protocol details, machine receipts |

On mobile, the primary buyer destinations are Overview, Market, Calls, and Balance; Agents remains one tap away. Provider Tools must not displace Balance before Provider mode is established.

## Workflow progression contracts

### 1. First useful Call

```text
Overview -> Connect Agent -> confirm connection -> review spending policy
         -> Add credit if required -> return to Agent -> first Tool handoff
         -> Quote/approval only if needed -> Call -> result/receipt
```

- Externalise progress as a short checklist; do not ask the user to remember browser/agent switching steps.
- Preserve the originating Agent and next action through funding and approval.
- Completion returns the user to the Agent journey; Balance is a secondary verification route.

### 2. Find and use a Tool

```text
Describe need -> useful results -> inspect Tool -> Use with my Agent
              -> waiting/continuation state -> Quote -> Call
```

- Default Market to need-led discovery, with **Browse all Tools** as an explicit alternative.
- Default filters: category/need, buyer-facing price, and availability. Put network, hostname, schemas, source metadata, payer breadth, tags, and collections under Advanced.
- Lead with indicative AUD or “Exact AUD price at Quote”; retain published USDC/network as secondary source facts.
- “Use with my Agent” is the dominant handoff. “Copy Tool reference” is a technical alternative.

### 3. Add credit

```text
Amount -> authoritative fee/GST/total preview -> Stripe -> return
       -> processing/unknown verification -> confirmed Balance/history
```

- One idempotency key remains bound to one payment attempt until a terminal result.
- Processing offers bounded polling or **Check this payment** for the exact session.
- Awaiting payment either offers a safe resumable checkout or uses honest copy for the action actually available.
- No new payment action appears while the outcome is unknown.

### 4. Review or recover a Call

```text
Needs attention -> Call identity/outcome/money -> one supported remedy
                -> status refresh/cancel/guided reconciliation -> resolved
```

- Preserve the owner shell and the exact Calls context.
- First viewport: Tool name, Provider, Agent, buyer amount, time, plain-language outcome, and one next action.
- Collapse six-stage evidence, raw identifiers, Provider obligation, upstream USDC amount, technical reuse modes, and machine receipt.
- Ordinary customers report observed outcomes in plain language; raw Provider evidence entry is a privileged/advanced path.

### 5. Publish a Tool

```text
Source -> Tool -> Terms -> Review -> publish -> monitor Calls/earnings
```

- For alpha, recommend the end-to-end supported source path rather than giving four protocols equal prominence.
- Collapse completed stages into editable summaries and retain draft progress.
- Provider status, earnings, and next action remain primary; identity administration and offboarding are secondary.

## Release plan

### Current source repair status

This audit remains the authoritative scope and acceptance register. Detailed
implementation notes are recorded in the linked
[repair register](./repair-register.md); source completion does not replace the
hosted and task-level alpha gates below.

| Finding | Status | Evidence / remaining boundary |
| ---: | --- | --- |
| 1. Neutral owner Overview and owner home | **Fixed in source** | `c520db917` makes `/owner` the workspace home and independently projects known Balance, Calls, Agents and applicable Provider state with one next action. Provider navigation disclosure remains finding 2. |
| 2. Role-appropriate Supply disclosure | **Fixed in source** | `0a5b24644`, `d2204874d` remove Supply from the default buyer shell while retaining a secondary **Offer a Tool** entry for explicit Provider setup. Existing Provider state remains discoverable through the conditional Overview card, and an active Provider journey discloses its Supply group for orientation without changing route access. |
| 3. Mobile buyer navigation continuity | **Fixed in source** | `c520db917` constrains compact primary navigation to Overview → Market → Calls → Balance; Agent and Provider administration cannot displace Balance. |
| 4. One Market navigation hierarchy | **Fixed in source** | `5116d283c` adds `/owner/market` inside the authenticated Buy journey, reuses the public Market loader/view contract, keeps all Market transitions in the entered shell, and suppresses public primary navigation while the operator shell owns the route. Calls remains in the same operator hierarchy. |
| 5, 6. Authoritative and independently loaded Balance | **Fixed in source** | `67d0dff4b` removes the Agent-directory fallback, reads the Account balance independently from history, constraints and administrative records, and retains the last authoritative balance when a refresh fails. Secondary source failure cannot erase or manufacture Balance. |
| 7. Authoritative Account history | **Active** | `67d0dff4b`, `f7c4816fe` replace the browser-merged Agent/document approximation with booked Account transactions, stable identity deduplication, cumulative coverage state and recoverable snapshot-bound pagination. The source is explicitly recorded-transaction sequence rather than effective-date chronology; complete reversal attribution and receipt/Call deep links remain open acceptance boundaries. |
| 8. Balance first-view hierarchy | **Fixed in source** | `67d0dff4b` gives available AUD the dominant first-layer card, keeps lock/policy state beneath it, and groups one Add credit flow with its exact preview and payment action. Administrative finance records remain disclosed. |
| 9. Funding action-state model | **Fixed in source** | `1af9e6455`, `df91f4936` replace independently updated payment flags with one reducer and a mutually exclusive idle/starting/checking operation state. Typed transitions update payment evidence, recovery locator and error state together; an eligible exact checkout can be resumed and every unresolved locator retains exact status refresh without exposing a second payment. |
| 10–12. Funding continuation and failure states | **Fixed in source** | `61b7b0866` preserves the exact payment attempt and gives each visible nonterminal/failure state an honest executable continuation. |
| 13. Market default | **Fixed in source** | `c7a9546e0`, integrated as `bf9a71be7`, makes guided discovery the deterministic default. |
| 14, 16. Market refinement and pagination | **Fixed in source** | `8d885b887` progressively discloses advanced source facts and preserves loaded rows/cursor across failure, retry and stale responses. |
| 15. Listed price versus buyer Quote | **Fixed in source** | `e5136b402` labels the external directory amount as Provider-listed evidence, removes settlement networks from Tool cards and pending detail, and reserves exact buyer-AUD language for an admitted Tool continuation that supports `tool.quote`. |
| 17, 18. Agent connection and Tool handoff | **Active / dependency-blocked** | `575540d92`, `d4c195d67` give setup an ordered connect → approve → confirm path, carry a validated originating Tool through Agent selection, and reveal one browser return only after a connected Agent is present. An executable return into the originating external agent client is still unavailable, so full cross-app resumption remains blocked. |
| 19. Self-contained Call approval | **Fixed in source** | `219ed5b82` replaces the opaque Tool reference with accepted Quote identity, current Agent label, explicit unrecorded purpose/Provider-name facts, accepted AUD ceiling, action class, declared effects and declared data release in one decision region. Missing or unavailable Quote context disables approval while leaving decline and scoped refresh available. |
| 20, 21. Attention-first Calls and stable pagination | **Fixed in source** | `de5b24288` separates outcome-unknown Calls from routine history, links each row directly to its durable receipt, preserves loaded Account-scoped rows and cursor across failed continuation, retries the same cursor, and rejects stale page responses after a refreshed loader snapshot. Optional usage/spend failure remains scoped to its summary. |
| 22, 25. Call context and route-keyed state | **Fixed in source** | `5b80b32b9` moves the unchanged `/calls/:callRef` URL under the authenticated owner shell and scopes the stateful controller to `callRef`; a late result cannot replace a newly navigated Call. |
| 23, 24. Call hierarchy and recovery burden | **Fixed in source** | `5b80b32b9` leads with outcome/buyer money/time, one state-supported remedy and Provider output; `bb190d492` adds the retained Tool snapshot name, recorded Provider reference, current Agent label and explicit missing-history facts, then fails closed unless the owner receipt grants evidence-submission permission. Raw lifecycle, identifiers, settlement detail, reconciliation and reuse recipes remain disclosed second. |
| P1. Shared buyer-facing Call status | **Active** | `63b72bc02` centralizes pending, uncertain, delivered, refunded and failed purchase presentation for Overview, Account Calls and the receipt. Coarse list facts fail closed on unknown/contradictory delivery or payment and route the Call to attention. No separate buyer notification surface is implemented, so notification adoption remains open. |
| P1. Standard identity-first tables | **Fixed in source** | `28b615ae7` corrects the shared record-table seam: domain identity and decision columns now precede the row action, and that trailing action has a visible column label. Selection remains an optional leading utility control. |
| P1. Scoped optional-read failures | **Fixed in source** | `4cd99e9bb` keeps known Market, Activity, Agent approval and Provider-workspace content usable when an optional continuation or subsection read fails. The affected region retains its own recovery while destructive treatment remains limited to mutations and ownership conflicts. |
| P1. Stable shell rhythm and responsive layout | **Fixed in source** | `c9d565edd` gives every operator page one maintained width rail and one content-start section stack using the existing gutter and section tokens. Compact navigation fixtures now mirror the committed Overview → Market → Calls → Balance path, keep safe-area clearance and leave Supply routes unselected rather than mislabelling them as a buyer shortcut. |
| P1. Agent-page task focus | **Fixed in source** | `080dfcf19` removes the peer-weight generic Credit section that interrupted approval and Agent management. Balance remains available in the canonical owner navigation and Overview; Agents now starts with its actual access work. |
| P1. Low-friction funding choice and closure | **Fixed in source** | `44037a473`, `f22ec9dbd`, `d969fd39e`, `277115199` add up to three policy-derived credit choices ahead of Other amount. Each choice updates the existing exact amount, quote and payment state; invalid policy data produces no suggested choice and no amount is silently preselected. The quote enclosure now includes the payment action that commits its terms. |
| P1. Agent consent decision closure | **Fixed in source** | `bac82d07d` encloses connection, authority, Tool scope, expiry and summary with the approve/decline controls in one labelled card. The action bar is visually attached to the terms while retaining the existing reverification, idempotency and fail-closed behavior. |
| P1. Progressive Agent detail | **Fixed in source** | `6f036062c` reduces the open Agent sheet to authority, monthly limit, recent Calls/attention and last use. Existing spending, activity, Tool-scope and technical facts remain available under task-labelled disclosures rather than fifteen peer facts. |
| P1. Provider Tool decision rows | **Fixed in source** | `d9ac6b329` consolidates lifecycle, availability, readiness and blocker into one Status cell, removes access-route plumbing from the first layer, and gives each Tool one dynamically labelled trailing continuation on desktop and compact layouts. |
| P1. Recognizable Market comparison | **Fixed in source** | `2c8f4da5a` replaces the icon-only card control with a visible Compare label and pressed state. In the matrix, sticky Tool headers retain their own Inspect action and the sticky Fact column keeps horizontally scrolled values anchored. |
| 7, 17 and all unlisted P0/P1 boundaries | **Open, active or dependency-blocked** | Continue source-first repair against the work and acceptance tables below; do not infer completion from adjacent component changes. |

### P0 — alpha blockers

| Work | Evidence and blast radius | Acceptance |
| --- | --- | --- |
| Create a neutral owner Overview and correct owner home | `roleHomeHref.owner` points to `/owner/operations`; every buyer lands in Provider Tools | Buyer-only and Provider accounts land on Overview; one next action is evident; Supply appears only when relevant |
| Make navigation express one journey | Calls/Market are duplicated across global and workspace regions; Balance is absent from mobile primary navigation | One hierarchy per region; canonical labels are Market, Calls, Agents, Balance; mobile path includes Balance |
| Decouple Balance from Agent state | Balance is derived from the Agent directory; funding and authority failures can mask each other | Authoritative Balance read succeeds or fails independently; directory failure cannot change Balance availability |
| Provide one chronological Account ledger | Funding and Call movements are independently sorted and Calls cover only the first Agent-directory page | Paginated Account-level history orders top-ups, Calls, refunds, and adjustments by transaction time and identity |
| Repair funding continuation | Processing never advances in-page; awaiting-payment says return to Stripe but offers Check credit | Every funding state has an executable, honest next action; reload preserves the same payment attempt; unknown cannot create a second payment |
| Stabilise Market and Calls pagination | Catalogue failure can set terminal `isDone`; Calls load-more failure is invisible; loader refresh can diverge from local pages | Loaded rows survive; failed transitions retain cursor and show Retry; refreshed loader state cannot silently conflict with appended pages |
| Make Agent setup and Tool handoff resumable | Setup and Tool use depend on copied commands/references and memory across apps | Browser shows completed setup stages, connected Agent, preserved originating context, and one return/resume action |
| Make approvals self-contained | Approval foregrounds raw `toolRef`, not the decision facts | Tool, Provider, Agent, purpose, AUD ceiling, consequence, and data release appear in one decision region |
| Recompose Calls around attention and remedy | Attention Calls are mixed with history; receipt foregrounds internal states; recovery asks for Provider evidence | Attention queue is foregrounded; receipt keeps owner context; one state-derived remedy is primary; technical evidence is disclosed progressively |
| Prove the journey, not only components | Existing coverage is strong on contracts but does not prove the cross-page, cross-app customer task | Authenticated task tests cover connect → fund → use → Call → receipt/recovery, including reload, partial reads, refusal, processing, and outcome unknown |

### P1 — stabilisation immediately after P0

- Add privacy-safe funnel events for Agent connection, funding preview/return/confirmation, Tool inspection/handoff, approval, Call completion, and recovery. Never capture raw queries, payloads, Tool references, payment locators, or business identifiers.
- Give Balance the OpenRouter-style first-view hierarchy and place amount, preview, and payment action in one perceptual region.
- Offer a small set of authoritative-policy-valid funding choices while retaining exact Other amount entry and the same quote/commit path.
- Standardise tables: identity first, decision facts next, action last; use visible labels for unfamiliar actions such as Compare.
- Use one shared buyer-facing Call status projection across list, drawer, receipt, and notifications.
- Make optional read failures quiet and scoped; reserve destructive alerts for blocked or dangerous states.
- Give the operator shell a standard vertical rhythm and keep the first committed responsive layout stable.

### P2 — defer until the core journey is proven

- Auto top-up, crypto funding, Balance transfers, and promotional codes.
- Additional dashboard charts and trend exploration.
- Broad catalogue faceting, source-quality controls, and advanced comparison dimensions.
- Multiple equal-weight CLI/API/MCP reuse recipes in customer views.
- New abstractions, services, or state frameworks: repair the current seams first.

## Hostility and abandonment rules

1. Never display an unknown amount or outcome as zero, complete, failed, or safe to retry.
2. Never instruct “Return to X” without an action that returns to X or honest close-and-resume guidance.
3. Never require the customer to remember or retype an internal reference to continue.
4. Never make internal settlement or evidence terms the identity of a customer decision.
5. Every pending state says what is happening, whether to wait, and what not to repeat.
6. Every retry is scoped to the failed read or exact mutation; known content remains usable.
7. Every empty state offers the next useful action.
8. Every consequential action keeps its terms and commit controls in one visual region.
9. Every attention state has one primary remedy; alternative/technical actions are subordinate.
10. Navigation, page titles, buttons, tests, and support copy use the same canonical nouns.

## Evidence-weighted file priority

Scores combine severity with multi-audit convergence; they rank remediation concentration, not estimated effort.

| Rank | File | Approx. score | Why it concentrates risk |
| ---: | --- | ---: | --- |
| 1 | `src/routes/calls.$callRef.tsx` | 80 | Four audits: context loss, internal-first hierarchy, competing remedies, recovery burden, mirrored route state |
| 2 | `src/components/ae/console/AeOwnerCredit.tsx` | 63 | Four audits: weak balance hierarchy, noncanonical history, mixed finance administration, broad action state |
| 3 | `src/routes/_operator/activity.tsx` | 55 | Four audits: attention buried, internal Provider facts, invisible pagination failure, loader/local-state divergence |
| 4 | `src/routes/_operator/owner.credit.tsx` | 28 | Three audits plus contract review: Balance tied to Agent directory and five unrelated read lifecycles |
| 5 | `src/routes/fund.$fundingSessionId.tsx` | 22 | Three audits: actionless nonterminal states, dishonest continuation, transient/permanent failure collapse |
| 6 | `src/components/ae/console/AeAgentApprovalsSection.tsx` | 23 | Three audits: raw reference replaces recognizable, self-contained decision facts |
| 7 | `src/lib/operator/roles.ts` | 11 | Two audits: owner home and role label make supply administration the default product |
| 8 | `src/components/ae/market/DirectoryExplorerFilters.tsx` | 11 | Two audits: source-oriented controls overwhelm first choice |
| 9 | `src/components/ae/console/AeAssistantInstallFunnel.tsx` | 11 | Two audits: multi-app setup has no durable progress model |
| 10 | `src/components/ae/market/tool-detail/AeToolNextAction.tsx` | 11 | Two audits: strongest action only copies an opaque reference |

## Top cross-cutting findings

The 25 highest-priority merged findings are:

1. Owner home is Provider Tools, not a customer overview.
2. Buy and Supply are exposed as one role before Provider intent exists.
3. Mobile buyer navigation omits Balance and promotes Provider Tools.
4. Global and workspace navigation duplicate Calls/Market at inconsistent levels.
5. Balance availability depends on Agent-directory state.
6. Five unrelated Balance-page resources share one load lifecycle and can race.
7. Balance history is not an authoritative, complete chronology.
8. Available Balance lacks dominant visual hierarchy.
9. Funding payment state uses overlapping flags that permit an actionless redirect state.
10. Funding processing has no event-update loop.
11. Awaiting-payment and ready copy do not match their actions.
12. Transient funding failure is collapsed with invalid/expired funding links.
13. Market defaults to the densest catalogue instead of guided discovery.
14. Market filters expose source/protocol detail before buyer needs.
15. Tool cards require the buyer to interpret USDC/network before an AUD Quote.
16. Catalogue pagination can turn a failure into false completion.
17. Tool handoff loses progress across browser and Agent clients.
18. Agent installation has no confirmed, resumable progression.
19. Approval identity is an opaque Tool reference rather than recognizable decision facts.
20. Calls needing attention are not a distinct operational queue.
21. Calls pagination failure is invisible and loader/local pages can diverge.
22. Call receipt loses the owner workspace context.
23. Call receipt foregrounds internal states and identifiers before outcome and money.
24. Recovery offers competing actions and asks ordinary customers for Provider evidence.
25. Route-keyed Call state is mirrored after render and can transiently show the wrong record.

## Alpha release gates

- A buyer can complete the critical path without an unexplained dead end, memorised reference, or unsupported action.
- Every money/Call nonterminal state survives reload and resumes the exact attempt.
- Every page remains useful when one secondary source is unavailable.
- Every critical state has a task-level test for success, refusal, transient failure, unknown outcome, and recovery.
- Desktop and mobile manual QA confirm one dominant action, stable layout, keyboard/focus continuity, and return to the prior list context.
- Hosted authenticated evidence proves the deployed path; local component or route tests alone do not close the gate.
- Funnel telemetry can identify the stage of abandonment without recording customer content or protected identifiers.

## Material limitations

- The browser comparison used the authenticated OpenRouter reference and the currently deployed AE surfaces; some local Balance and shell stabilisation is newer than that deployment.
- This audit is source- and evidence-based. It does not claim hosted authenticated end-to-end proof.
- Existing uncommitted implementation work was treated as user-owned evidence and was not modified.
