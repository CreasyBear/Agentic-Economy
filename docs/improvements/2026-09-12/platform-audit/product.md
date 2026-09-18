# Product completion audit

**Audit target:** source-level customer, agent, Provider and operator journeys in the shared dirty checkout at `06a89ebe3cf4747589a7d98c869cad35e1fa3fe6`. This is a read-only review; no source changes, runtime checks, browser tests, service calls or deployment were performed.

## Executive summary

The product thesis is coherent: an agent finds an admitted Tool, obtains one caller-bound Quote, makes one controlled Call, then receives delivery or an explicit uncertainty/recovery path. Authority, funding, directory boundaries, Provider lifecycle controls and safe money readback are strong foundations to keep.

Two items need an explicit decision before claiming a trustworthy paid-alpha journey. The committed Quote DTO has price, budget and evidence, but omits the Provider, Seller, terms, effects, data-use, unknowns, retry and challenge facts required by the full `START_LINE.md` proof; this is documented scope, not a newly discovered defect or a reason to delay source/preview E2E. Separately, a completed technical output is rendered as `Complete` while the same Call’s Purchase status is `Open — outcome uncertain`; the focused test codifies that ambiguity. Clarify both before paid alpha.

The full alpha record is not complete: Purchase resolution is derived presentation, customer remedy requests stop at email, and per-Agent remaining spend is absent from the owner’s view. Team membership is a scope decision because the active milestone is one owner/account/Agent. Hosted HTTPS and installed CLI/MCP proof are subsequent validation gates before alpha, deliberately outside this source audit. Notifications, hosted support inbox and an operator joined stuck queue are tracked later gaps, not newly discovered start-line defects.

## Critical findings

| ID | Readiness | Finding and evidence | Smallest sensible action |
|---|---|---|---|
| **P-1** | **Before paid alpha · high** | `src/modules/capability-execution/quote.ts:114-148` returns Tool/version/input, price, balance, budget, policies and digest. `PRODUCT.md:340-352` explicitly documents the missing Provider/Seller fields and terms; `START_LINE.md:53-61` requires them for the full proof. This is an accepted scope gap, not a newly discovered E2E defect. | Treat it as a before-paid-alpha acceptance item: extend the Quote packet and agent surfaces, or record an explicit scope exception. Do not block source/preview E2E solely on this known gap. |
| **P-2** | **Before paid alpha · medium** | `call-receipt-view.ts:121-150,173-200` marks every completed result and all stages complete, while uncertain usage returns `Open — outcome uncertain`. The route uses `complete` for the success badge and reuse (`calls.$callRef.tsx:297,318-344`). Test coverage confirms it (`call-receipt-view.test.ts:152-179`). `Run again` explicitly creates a fresh purchase (`calls.$callRef.tsx:500-519`), so unsafe retry is not established. | Choose and label the semantics: `Output available` versus `Purchase resolved`; mark unknown settlement as attention and add a clear fresh-purchase/reconciliation warning. Do not blanket-disable a new Call without an authority/risk decision. |
| **P-3** | **Before alpha · medium** | Purchase status is intentionally presentation-only (`call-receipt-view.ts:140-143`). README records the complete Seller/Provider-obligation/tax/business evidence as an open milestone (`README.md:60-64`). The concrete P-2 mixed state shows why derived projections need shared acceptance cases. | Specify and test one canonical derived Purchase-resolution projection across receipt, activity and agent responses. Keep Call as the execution identity and leave storage choice open. |
| **P-4** | **Before alpha · medium** | Activity shows Account calls/spend only (`activity.tsx:181-203`); Agent detail shows limits and settled charges (`AeAgentOperatorConsole.tsx:486-511`); Credit shows Account balance (`AeOwnerCredit.tsx:131-163`). The maintained expectation is explicitly absent (`simple-user-expectations.md:14`). | Show per-Agent used, reserved, remaining and coverage beside Account spend. |
| **P-5** | **Before alpha · medium** | Backend can project release/refund (`convex/capabilityCallProjection.ts:790-808`), but the customer route offers email/status/help only (`support.tsx:39-85`); “Ask for a refund” is tracked absent (`simple-user-expectations.md:17-19`). | Add an eligibility-gated, idempotent Call-linked remedy request and status. |
| **P-6** | **Before alpha validation · medium** | README separates source acceptance from hosted and installed-package proof (`README.md:50-52,75-76,165-166,202-218`). This audit did not run those environments. | After the E2E harness exists, run one hosted HTTPS funding/Quote/Call/recovery canary plus installed CLI and authenticated MCP parity, then record the release evidence. |
| **P-7** | **Decision needed · medium** | Start line scopes one Customer/Account and one Agent (`START_LINE.md:167-170`). Membership storage exists, but owner settings are profile/security only (`owner.settings.tsx:10-43`; `OwnerSettingsSections.tsx:14-36`). | Declare single-owner alpha, or add narrow membership invite/role/revoke/audit before selling team authority. |
| **P-8** | **Later · low** | Buyer/Provider notifications and hosted support inbox are tracked absent and assigned to Package 7 (`simple-user-expectations.md:3-5,15,23`); Help currently provides email and references (`support.tsx:47-85`). | Keep deferred and state the polling/email promise precisely; define event ownership before adding it. |
| **P-9** | **Later · low** | The operator scoreboard marks the joined stuck view absent (`simple-user-expectations.md:25-26`); catalog health/audit are separate (`admin.index-health.tsx:85-100`, `admin.audit-events.tsx:45-55`). | Add a later joined case read model with affected record, owner, next safe action and evidence reference. |

## Capability matrix

| Surface | Status | Evidence / acceptance proof |
|---|---|---|
| Account, Agent authority and credentials | Partial | Approval modes, Tool scopes, revisions and rotation are implemented (`AeAgentAccessAuthorizeForm.tsx:257-272,394-415,485-504`). Membership is backend-only; prove hosted owner lifecycle and decide team scope. |
| AUD funding and spend | Partial | Fee/principal/total preview, canonical payment readback and Account balance exist (`AeCreditTopUpPanel.tsx:118-158,200-271`; `AeOwnerCredit.tsx:131-168`). Add per-Agent remaining capacity proof. |
| Directory, comparison and Tool detail | Implemented in source | Upstream discovery is deliberately separated from admitted Tool detail (`market.tsx:129-163`; `DirectoryComparison.tsx:9-36`; `AeToolInspector.tsx:183-196`). Hosted admission/Quote still needs proof. |
| Quote | Partial | Caller and financial checks are present; commercial decision facts are missing (`quote.ts:114-148`). |
| Call, delivery and recovery | Implemented in source | Receipt, recovery questions and Call identity are coherent (`calls.$callRef.tsx:293-345`; `call-receipt-view.ts:214-265`; focused tests). P-2 must be resolved. |
| Purchase, remedy and commercial records | Partial | Delivery/payment/refund facts exist; Purchase is intentionally derived, but its cross-surface acceptance cases and remedy request are incomplete (`call-receipt-view.ts:140-158`; `support.tsx:39-85`). |
| Usage, billing and documents | Partial | Activity, documents, reconciliation and obligations render source records; complete tax/principal-reseller evidence remains open (`activity.tsx:181-203`; `AeOwnerCredit.tsx:166-168,269-310`; `README.md:60-64`). |
| Provider supply, connections, earnings, payout, offboarding | Partial | Tool inventory, readiness, identity, payout panel and freeze-settle-revoke path exist (`AeProviderWorkspace.tsx:242-373,397-505`); payout is live-unproven per scoreboard. |
| Support, events and operator | Partial | Help, catalog health and audit exist; notifications, hosted inbox and joined stuck queue are later gaps (`support.tsx:39-85`; scoreboard `:15,23,26`). |
| HTTP, MCP and CLI | Partial / cannot verify runtime | Shared actions and source contracts fan out consistently (`action.ts:4-21,335-351`; `actions/index.ts:79-113`; `mcp-api.ts:56-65`; `cli.ts:58-115`), but hosted/installed compatibility is unverified. |

## Strengths to keep

- Keep the short `search → Quote → Call → result` spine and AE-managed authority, pricing, treasury and recovery boundary (`PRODUCT.md:317-350`).
- Keep explicit separation of funding, authority, Provider credentialing and buyer spending policy in the approval journey.
- Keep canonical payment readback, idempotency, no blind retry and one retained Call reference through uncertainty.
- Keep one action declaration with schemas, boundaries and output descriptions across UI, HTTP, agent JSON, MCP, chat and CLI.
- Keep Provider offboarding’s freeze-first, obligation/payout blockers, revision checks and idempotent resume/cancel.

## Coverage and limitations

Inspected `AGENTS.md`, `PRODUCT.md`, `START_LINE.md`, `CONTEXT.md`, `README.md`, `docs/glossary.md`, the maintained expectation scoreboard, Quote/Call contracts and tests, market, owner, Provider, support, operator, action, MCP and CLI source. No live UI, hosted origin, installed package, MCP client, x402 canary, tax/legal setup or deployment was verified. Concurrent edits in the three detected startup/supply paths were not used as evidence. Known deferred reseller and Package 7 scope remains classified as later or decision-needed, rather than raised as current defects. Source/preview E2E may proceed with P-1/P-2 explicit in its acceptance; hosted/package validation follows the harness before alpha.

Full evidence is in [product.json](/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/docs/improvements/2026-09-12/platform-audit/product.json).
