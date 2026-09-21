# Platform journey blueprint

**Status:** wave 1 register  
**Date:** 2026-09-21  
**Authority:** [PRODUCT.md](../../PRODUCT.md) core market journeys 1–6 and decision chain; [CONTEXT.md](../../CONTEXT.md) vocabulary; human route evidence in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7 only (current paths are evidence, not destination law).

**Grades in the Cite column:**

| Grade | Meaning |
| --- | --- |
| `CHARTER` | Required by PRODUCT.md / CONTEXT.md; not established as complete product behaviour in source |
| `IMPLEMENTED` | Current source and tests establish the behaviour cited |
| `PARTIAL` | Source exists; journey step, terminal states, human UX, or recovery path incomplete |

The **Agent is not a third market side.** It is how the **Customer** buys within a harness. Agent stages appear as rows on the buyer journey tables: **Connect → Quote → Call → Continue in harness** (aligned with PRODUCT.md `registry.tools.search → tool.quote → tool.call → result`).

**Implementation truth (do not over-claim):** PRODUCT.md “Current implementation boundary” — the foundation already supports canonical Tools, comparison, quotes, brokered Calls, prepaid buyer credit, Charges, Provider earnings, refunds, recovery and uncertain states. It does **not** yet establish the complete Australian principal-reseller purchase (buyer-facing Seller identity, separate Provider obligation, tax position, business documents, and purchase resolution as one explicit production record). Cite source for `IMPLEMENTED` / `PARTIAL`; cite PRODUCT.md for `CHARTER` gaps.

No user interviews were conducted for this register; anxiety rows infer from charter and product surfaces, not fabricated quotes.

---

## Product journeys 1–6 → framework stages

| # | PRODUCT.md journey outcome | Primary buyer stages | Primary provider stages | Agent emphasis |
| --- | --- | --- | --- | --- |
| 1 | Describe a need naturally and find the right capability despite vocabulary differences | Need, Discover | Publish (discoverability), Receive demand | Search in harness; `/market`, `/t/*` chat |
| 2 | Compare suitable services and reach a useful choice without inspecting a large catalogue | Discover, Compare, Evaluate | Publish (comparable terms) | `registry.tools.compare`; Market compare tray |
| 3 | Choose, buy and continue working with minimal integration burden | Evaluate, Commit, Receive, Return | Fulfil | `tool.quote` → `tool.call` → continue in harness |
| 4 | Expose a capability and reach relevant buyers without becoming a distribution expert | — (buyer receives supply) | Assess suitability → Set up → Publish → Receive demand | Buyers use Connect + Call; Provider does not “become an agent” |
| 5 | Find no suitable supply today and connect when supply appears | Need, Discover (gap path) | Publish, Improve (demand signal) | `marketDemand.record` after failed search; no auto-purchase |
| 6 | Use the market repeatedly and benefit from progressively better matches | Return (repeat entry), Discover (later) | Improve | Outcome records and matching consumers — mostly charter |

---

## Buyer journey — Need

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Recognise a bounded missing contribution the harness cannot close alone; start a market-facing need without AE owning the wider project. | CHARTER | PRODUCT.md Customer and job; ownership boundary |
| **Decision** | “Do I need an outside Tool for this step?” vs continue with installed capabilities. | CHARTER | PRODUCT.md decision chain (`need a service`) |
| **Anxiety** | Wrong scope (turning a project into a market object); vocabulary mismatch; wasting agent turns. | CHARTER | PRODUCT.md bounded contribution; journey 1 |
| **What Customer provides** | Objective context in the harness; optional natural-language need on Market or chat; hard constraints via spending policy when spending is gated. | PARTIAL | `/market` ask UI ([`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7); `/t/new`, `/t/$threadId` → `Chat`; spending policy surfaces `/agent-access` |
| **What platform or Provider does next** | AE exposes searchable canonical Tools and registry metadata; does not plan the user’s task. Provider is not engaged until selection. | PARTIAL | `src/routes/market.tsx` → `AeMarketPage`; `convex/capabilitySupplyToolQueries.ts`; external registry per PRODUCT.md surfaces |
| **Agent: Connect** | Credential and spending policy must exist before consequential Calls; not required to *phrase* the need in chat. | IMPLEMENTED | `src/routes/_operator/agent-access.tsx`; `src/modules/agent-access/account.actions.ts` (`agentAccess.whoami`) |
| **Agent: Quote / Call / Continue** | Not yet — need precedes Quote. Harness retains planning; agent may search next. | CHARTER | PRODUCT.md agent operating model |
| **What can fail and recovery** | Need mis-stated → refine search or retain gap signal (journey 5). No purchase recovery at this stage. | PARTIAL | `src/modules/market-demand/market-demand.actions.ts` (`marketDemand.record`, 30-day window PRODUCT.md 2026-09-21); human recovery for “wrong need” not a dedicated dest — user re-asks on `/market` or `/t/*` |
| **Observable success** | Customer or agent can express a need and reach a candidate Tool set or an explicit “no supply” path without silent failure. | PARTIAL | Chat + Market logged-out SEEN in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7; journey 1 not closed as effortless matching (CHARTER) |

---

## Buyer journey — Discover

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Find viable Tools despite vocabulary differences; reversible browsing before Quote. | PARTIAL | Journey 1–2; `registry.tools.search` in `src/modules/registry/tools.actions.ts`, `convex/chatTools.ts` |
| **Decision** | Which Tools enter the comparison set; whether to open detail or keep searching. | PARTIAL | `/market` tabs Tools · Collections · Providers · Saved; `/tools/$toolRef`, `/tools/$providerHost/$slug`; signed-in `/owner/market` → `AeX402Directory` |
| **Anxiety** | Catalogue overwhelm; stale prices; imported registry mistaken for callable supply. | PARTIAL | PRODUCT.md x402 clarification; admission vs browse |
| **What Customer provides** | Search query, filters, collection choice, or chat-described need. | IMPLEMENTED | `src/routes/market.tsx`; `src/routes/api.v1.registry.ts` (public discovery); `src/components/ae/market/AeX402Directory.tsx` |
| **What platform or Provider does next** | Platform searches canonical catalog + registry projections; Provider supplies published Tool metadata and price chain (`displayPriceFromPricingConfig`). | IMPLEMENTED | `convex/capabilitySupplyLists.ts`, `internal/tool-project`; Provider publication via `convex/capabilitySupplyPublish.ts` |
| **Agent: Connect** | Authenticated search/call scope via agent credential. | IMPLEMENTED | `convex/authorityBoundary.ts`; MCP/HTTP discovery in `src/modules/discovery/internal/offering-discovery-file.ts` |
| **Agent: Quote / Call / Continue** | Search/list/detail only; `tool.quote` not implied. | IMPLEMENTED | `registry.tools.search` / `registry.tools.list` in `tests/unit/actions/registry.test.ts`; chat mapping `src/modules/chat/tool-card.ts` |
| **Agent: Continue in harness** | Agent presents candidates to the customer’s task context; AE does not store project memory. | CHARTER | PRODUCT.md ownership boundary |
| **What can fail and recovery** | Empty or degraded search → retry, widen query, or record market gap. Registry unavailable → degraded action result, not a purchase state. | PARTIAL | `marketDemand.record` path `src/lib/server/market-demand-api.ts`; chat degrade in `convex/chatTools.ts`; **human “no results” recovery dest not walked** ([`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §9) |
| **Observable success** | Relevant Tools appear with provenance and price display; agent can search without manual catalogue inspection (journey 1 intent). | PARTIAL | API + UI exist; “effortless despite vocabulary” remains CHARTER |

---

## Buyer journey — Compare

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Narrow to a small viable set with caller-specific reasons before money moves. | PARTIAL | PRODUCT.md service comparison; journey 2 |
| **Decision** | Which Tool versions stay in set vs excluded; whether to open compare view. | PARTIAL | Compare tray on `AeX402Directory`; API `src/routes/api.v1.market-tools.compare.ts` |
| **Anxiety** | Apples-to-oranges comparison; hidden effects, data use, or recovery risk. | PARTIAL | Compare fields in `convex/capabilitySupplyToolQueries.ts` (`recovery`, `effects`, `dataUse`) |
| **What Customer provides** | Two or more Tool refs; compare intent in UI or `registry.tools.compare` input. | IMPLEMENTED | `registry.tools.compare` in `src/modules/registry/tools.actions.ts`; chat tool-card `src/modules/chat/tool-card.ts` |
| **What platform or Provider does next** | Platform returns normalised comparison projection; Provider terms remain on published Tool record. | IMPLEMENTED | `convex/capabilitySupplyToolQueries.ts` purpose `comparison` |
| **Agent: Connect** | Same as Discover. | IMPLEMENTED | (see Discover) |
| **Agent: Quote** | Compare precedes Quote; no spending yet. | IMPLEMENTED | PRODUCT.md “Discovery is reversible” |
| **Agent: Call / Continue** | Agent may recommend one Tool; customer/harness still chooses. | CHARTER | Journey 2 “useful choice” UX not fully graded SEEN on AE listing+compare walk |
| **What can fail and recovery** | Incompatible Tools in compare set → validation error; user removes item from tray. No refund path (no Call). | IMPLEMENTED | Compare API strict validation; UI `AeX402Directory` comparison state |
| **Observable success** | Customer or agent can exclude non-viable options with stated reasons without full catalogue scan. | PARTIAL | Journey 2 outcome CHARTER; compare machinery IMPLEMENTED |

---

## Buyer journey — Evaluate

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Inspect terms, price ceiling, authority, and evidence before Commit. | PARTIAL | PRODUCT.md Quote definition; `tool.quote` as decision packet |
| **Decision** | Proceed to Quote acceptance vs abandon vs switch Tool. | PARTIAL | Public detail routes; quote action |
| **Anxiety** | Quote drift; incomplete Seller/Provider terms under principal-reseller charter; insufficient balance or policy headroom. | PARTIAL | PRODUCT.md Quote DTO gaps (Provider/Seller fields); spending policy `src/modules/agent-access/spending-policy.view-model.ts` |
| **What Customer provides** | Normalised Tool input, selected Tool version, active agent authority. | IMPLEMENTED | `src/modules/capability-execution/quote.ts`; `tool.quote` action |
| **What platform or Provider does next** | Platform binds expiring Quote with price, budget ceiling, balance read, evidence digest; revalidates on Call. | IMPLEMENTED | `convex/capabilityCalls.ts` reserve/dispatch contracts; `agentAccess.balance` in `src/modules/agent-access/account.actions.ts` |
| **Agent: Connect** | Required — Quote is caller-bound. | IMPLEMENTED | `convex/authorityBoundary.ts` |
| **Agent: Quote** | Primary stage — `tool.quote` returns expiring Quote. | IMPLEMENTED | `tests/unit/actions/registry.test.ts`; `convex/chatTools.ts` quote tool |
| **Agent: Call / Continue** | Not until Commit; agent may surface Quote summary to harness. | IMPLEMENTED | PRODUCT.md honour-the-Quote |
| **What can fail and recovery** | Drift, expiry, policy denial, insufficient credit → fail before reservation; fund via `/owner/credit`, adjust policy via `/agent-access`. **No Call recovery** (no dispatch). | PARTIAL | `src/routes/_operator/owner.credit.tsx`; funding return `/fund/$fundingSessionId`; principal-reseller tax/invoice gaps CHARTER (PRODUCT.md implementation boundary) |
| **Observable success** | Caller receives an expiring Quote that matches what a subsequent Call will enforce. | IMPLEMENTED | Source acceptance in PRODUCT.md agent operating model |

---

## Buyer journey — Commit

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Accept one bounded purchase: reserve capacity, fund, dispatch Provider effect under authority. | PARTIAL | Journey 3; brokered/resell lane |
| **Decision** | Execute Call vs hold at Quote vs cancel intent. | IMPLEMENTED | `tool.call` in `src/modules/capability-execution/call.actions.ts` |
| **Anxiety** | Double charge; wrong Tool version; spending surprise; uncertain x402 settlement. | PARTIAL | Idempotency in action contracts; USDC/AUD leg risk PRODUCT.md commercial model |
| **What Customer provides** | Valid Quote reference, idempotency key, normalised input matching Quote. | IMPLEMENTED | `convex/capabilityCalls.ts` `callArgs`, `reserveArgs` |
| **What platform or Provider does next** | Reserve spending, Charge, dispatch Call; Provider performs upstream Tool. | IMPLEMENTED | `convex/capabilityCallWorker.ts`; `convex/moneyManagedCall.ts`; foundation list PRODUCT.md |
| **Agent: Connect** | Implicit in authenticated Call. | IMPLEMENTED | Call authority in `convex/lib/callLifecycle/` |
| **Agent: Quote** | Must match unexpired Quote. | IMPLEMENTED | PRODUCT.md honour-the-Quote |
| **Agent: Call** | `tool.call` — primary commit action. | IMPLEMENTED | `api.capabilityCalls.call` from `convex/chatTools.ts` |
| **Agent: Continue in harness** | Waits on terminal or non-terminal Call result; may poll `call.status`. | IMPLEMENTED | `call.status` in `src/modules/capability-execution/call-recovery.actions.ts` |
| **What can fail and recovery** | Pre-dispatch failure → no Provider effect; post-dispatch uncertainty → `call.status`, `call.cancel`, `call.reconcile`. Automatic reconciliation/refund paths in worker. **Human Commit UX on listing not walked** (buyer-ia §9). **Complete principal-reseller production record CHARTER.** | PARTIAL | `src/modules/capability-execution/call-recovery.actions.ts`; `convex/capabilityCallWorker.ts`; recovery actions tested in `tests/unit/market-terminal/recovery.test.ts`; PRODUCT.md gaps on purchase resolution record |
| **Observable success** | One Call identity links authority, Charge attempt, and dispatch; agent receives result or explicit non-terminal next action. | PARTIAL | Calls UI `/activity`, `/calls/$callRef`; full managed x402 proof CHARTER ([START_LINE.md](../../START_LINE.md)) |

---

## Buyer journey — Receive

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Obtain usable Tool output or explicit pending/uncertain delivery state. | PARTIAL | PRODUCT.md `result or pending outcome` |
| **Decision** | Use contribution in harness vs treat as failed vs wait. | CHARTER | Harness owns use (PRODUCT.md ownership boundary) |
| **Anxiety** | Paid but empty/wrong output; delivery ≠ settlement; unclear pending state. | PARTIAL | PRODUCT.md explicit truth; `call-receipt-view.ts` purchase resolution join |
| **What Customer provides** | Acceptance of returned payload or acknowledgment of pending state. | CHARTER | Harness-side |
| **What platform or Provider does next** | Platform records Provider observations and payment rail observations; Provider delivers contracted output. | IMPLEMENTED | `convex/capabilityCallWorker.ts` completion paths; Provider upstream x402 |
| **Agent: Connect / Quote** | Complete. | IMPLEMENTED | — |
| **Agent: Call** | Delivers result or non-terminal status with at most one Suggested next action. | IMPLEMENTED | PRODUCT.md Suggested next action rules |
| **Agent: Continue in harness** | Agent applies output to task; AE stores Call/outcome boundaries only. | CHARTER | PRODUCT.md Package 4 / bounded evidence |
| **What can fail and recovery** | Partial delivery, timeout, payment uncertainty → recovery actions; refund/reconcile in foundation. **Buyer-facing remedy copy and invoice-ready record incomplete vs charter.** | PARTIAL | `call.reconcile`, `call.cancel`; `convex/lib/callLifecycle/purchaseResolutionMaterialize.ts`; tests `tests/unit/capability-execution/call-receipt-view.test.ts`; complete adjustment UX CHARTER |
| **Observable success** | Agent continues with usable contribution or durable pending/ref failed state with reference. | PARTIAL | Journey 3; terminal delivery proof CHARTER for full AU record |

---

## Buyer journey — Manage or resolve

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Explain, filter, and close purchases: usage, spend, recovery, refund, reconciliation. | PARTIAL | PRODUCT.md buyer records; Calls joined by Call identity |
| **Decision** | Cancel vs reconcile vs accept outcome; fund more credit; adjust agents/policies. | PARTIAL | Owner surfaces vs agent recovery |
| **Anxiety** | Finance cannot explain agent-selected spend; purchase stuck open; refund not visible. | PARTIAL | PRODUCT.md Evidence required; maturity gaps in [`platform-maturity-sprint.md`](./platform-maturity-sprint.md) lane 2 |
| **What Customer provides** | Call reference, recovery evidence, owner decisions on disputed Calls. | IMPLEMENTED | `CallReceiptWorkspace` `src/routes/_operator/calls.$callRef.tsx`; owner recovery mutations in `convex/capabilityCalls.ts` |
| **What platform or Provider does next** | Platform runs recovery state machine, refunds/Charges, materializes purchase resolution when facts allow; Provider may respond to upstream disputes outside AE UI. | PARTIAL | `purchaseResolutionRecords` schema + `purchaseResolutionMaterialize`; Provider earnings/refunds in foundation PRODUCT.md |
| **Agent: Connect** | Owner vs agent recovery principal separation. | IMPLEMENTED | `convex/capabilityCallWorker.ts` `recoveryPrincipal` |
| **Agent: Quote / Call** | Recovery only — no new Quote without new purchase intent. | IMPLEMENTED | PRODUCT.md no fresh Call after possible dispatch |
| **Agent: Continue in harness** | Agent uses `call.status` / reconcile CLI or MCP; customer may use `/activity`. | IMPLEMENTED | `tools/ae/commands/recover.ts`; `/activity` → `AeActivity` |
| **What can fail and recovery** | Reconcile mismatch → explicit error (`recover.ts`); automatic reconciliation in worker. **Some failures still degrade silently (platform-maturity-sprint lane 1). User-visible recovery detail PARTIAL.** | PARTIAL | `src/modules/capability-execution/call-recovery.actions.ts`; silent catch debt documented in platform-maturity-sprint |
| **Observable success** | Every Call reaches explainable purchase resolution or honest open uncertainty; failed purchase produces adjustment/refund per charter. | PARTIAL | Resolution materializer IMPLEMENTED in source; **one explicit production resolution record CHARTER** (PRODUCT.md); local empty tables noted in jev register |

---

## Buyer journey — Return

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Re-enter the market with lower friction; repeat allocation; journey 6 compounding loop. | CHARTER | PRODUCT.md Later differentiation compounding loop; journey 6 |
| **Decision** | Same Tool again vs switch Provider vs new need. | CHARTER | Outcome records consumer not product-complete |
| **Anxiety** | Re-learn catalogue; no memory of what worked; privacy of past Calls. | CHARTER | Bounded outcome records vs project memory |
| **What Customer provides** | Repeat need, prior Call refs optional, continued trust in spending policy. | PARTIAL | Saved tools on `/market` Saved tab (source); Call history `/activity` |
| **What platform or Provider does next** | Platform may use bounded outcome evidence for later comparison (charter); Provider sees own demand/earnings. | PARTIAL | `marketEvidenceFacts` mentioned in jev register; no ranking promotion |
| **Agent: Connect / Quote / Call** | Same chain on repeat purchase. | IMPLEMENTED | Action path unchanged |
| **Agent: Continue in harness** | Primary locus of “return to work”; AE supplies records not orchestration. | CHARTER | PRODUCT.md non-goals |
| **What can fail and recovery** | Bad repeat match → new Compare cycle; stale Saved list → refresh discover. **Progressive matching recovery N/A — feature CHARTER.** | CHARTER | Journey 6; `projectAllocationEvidence` test-only per jev register |
| **Observable success** | Second comparable purchase faster with retained provenance; Provider receives incremental demand (journey 6 criteria). | CHARTER | PRODUCT.md “Later market research” gates |

---

## Provider journey — Assess suitability

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Decide whether AE distribution fits the Provider’s Tool economics and operating model. | CHARTER | Journey 4; PRODUCT.md Provider role |
| **Decision** | Enter supply funnel vs stay off-platform vs observe-only. | PARTIAL | `/for-providers` → `AeSupplyLanding`; public business `/$slug` |
| **Anxiety** | Admission rejection; x402 readiness; obligation vs payout timing. | PARTIAL | `convex/capabilitySupplyNativeAdmission.ts`; `convex/capabilitySupplyReadiness.ts` |
| **What Provider provides** | Business identity, Tool contract intent, protocol choice (x402 entry lane). | PARTIAL | Onboarding/supply start `/owner/operations/new` → `AeOwnerSupplySourceStartPage` |
| **What platform does next** | Eligibility, readiness probes, admission policy. | IMPLEMENTED | `convex/capabilitySupplyDirectoryEligibility.ts`; probes `convex/capabilitySupplyProbes.ts` |
| **What can fail and recovery** | Ineligible Tool → blocked with reason in funnel; fix source/connection and retry. **Human-readable recovery on all funnel errors PARTIAL** (platform-maturity-sprint lane 2). | PARTIAL | `src/components/ae/supply/AeSupplySourceNativeStart.tsx` cited in maturity sprint |
| **Observable success** | Provider knows pass/fail criteria before investing in publish workflow. | PARTIAL | Journey 4 “without becoming a distribution expert” — CHARTER UX maturity |

---

## Provider journey — Set up

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Connect sources, credentials, staging, and business records to admit Tools. | PARTIAL | Nevermined/Whop reference in PRODUCT.md |
| **Decision** | Connection type (native x402, MCP OAuth, etc.); workspace vs personal. | IMPLEMENTED | `/owner/supply/connections/new` → `AeConnectionHandoff`; OAuth callback route |
| **Anxiety** | Broken OAuth; staging vs production; team access. | PARTIAL | `/owner/workspace`, `/owner/team`, `/owner/settings` (source census §7) |
| **What Provider provides** | Source endpoints, pricing intent, connection authorisation. | IMPLEMENTED | `convex/capabilitySupplyOwnerFunnel.ts`, `convex/capabilitySupplyIntegrationDrafts.ts` |
| **What platform does next** | Persist drafts, run preflight/canary where configured, map Tool origin. | IMPLEMENTED | `convex/capabilitySupplyOwnerStaging.ts`; `convex/capabilitySupplyCanaryFundingPreflight.ts` |
| **What can fail and recovery** | Connection handoff failure → retry OAuth; draft preserved. **Offboarding/payout blockers exist for later stages.** | PARTIAL | `convex/lib/providerOffboarding/` |
| **Observable success** | Provider has at least one admitted path from source to publishable draft. | PARTIAL | Workspace `/owner/operations` loader includes payout summary catch-unavailable |

---

## Provider journey — Publish

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Make a Tool version callable in the canonical catalog with price and terms. | IMPLEMENTED | Journey 4; publication pipeline |
| **Decision** | Publish vs withdraw vs revise pricing. | IMPLEMENTED | `convex/capabilitySupplyPublish.ts`; owner tool detail `/owner/operations/$toolRef` |
| **Anxiety** | Listing wrong price; partial readiness; catalog health regression. | PARTIAL | Admin `/admin/index-health` for operators, not Provider self-serve health |
| **What Provider provides** | Publication payload, pricing config, readiness evidence. | IMPLEMENTED | `internal/publication/draft.ts` chain per AGENTS.md pricing chain |
| **What platform does next** | Project public catalog price, list on `/market` and `/tools/*`, expose to registry actions. | IMPLEMENTED | `convex/capabilitySupplyProjection.ts`; buyer routes in buyer-ia §7 |
| **What can fail and recovery** | Publish validation failure → remain draft with errors; withdraw publication. **Recovery for broken listing mid-flight PARTIAL in UI.** | PARTIAL | Publish mutations + tests around `capabilitySupplyPublish.ts` |
| **Observable success** | Buyers and agents discover Tool with `displayPriceFromPricingConfig` output; journey 4 demand reach — CHARTER for “relevant buyers across harnesses” |

---

## Provider journey — Receive demand

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Accept inbound Quotes/Calls against published Tools. | IMPLEMENTED | Market pull + agent push |
| **Decision** | Provider runtime accepts x402/contract dispatch (upstream). | IMPLEMENTED | Call dispatch `convex/lib/callLifecycle/dispatch.ts` |
| **Anxiety** | Surprise load; chargebacks; mismatched Tool version. | PARTIAL | Version pinning on Quote |
| **What Provider provides** | Executed Tool output; upstream payment acceptance. | IMPLEMENTED | x402 execution path in managed call money module |
| **What platform does next** | Routes Call to Provider connection; records demand for earnings. | IMPLEMENTED | `convex/capabilityCallWorker.ts`; Provider earnings accrual policy in call admission |
| **What can fail and recovery** | Dispatch failure → Call non-terminal with recovery; Provider outage → customer reconcile path. **Provider-visible demand inbox CHARTER** (no Nevermined-style dashboard parity claimed). | PARTIAL | Agent/customer recovery IMPLEMENTED; Provider ops UI PARTIAL |
| **Observable success** | Incremental Calls attributed to published Tool; journey 4 observable demand — PARTIAL without cross-harness proof |

---

## Provider journey — Fulfil

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Perform the Tool under the accepted Call. | IMPLEMENTED | Provider role PRODUCT.md |
| **Decision** | Complete vs fail vs timeout (upstream). | IMPLEMENTED | Worker completion + lease handling |
| **Anxiety** | SLA ambiguity; partial JSON; secret leakage. | PARTIAL | Evidence standards on Quote — full principal-reseller delivery evidence CHARTER |
| **What Provider provides** | Contract output and upstream settlement proof. | IMPLEMENTED | Provider upstream; AE observes |
| **What platform does next** | Record observations, update Call state, trigger money leg completion rules. | IMPLEMENTED | `convex/moneyManagedCall.ts`, `convex/moneyX402PaymentAuthorization.ts` |
| **What can fail and recovery** | Failed fulfilment → customer recovery/refund foundation; Provider may retry upstream outside AE. | IMPLEMENTED | Refund paths in `convex/capabilityCallWorker.ts` |
| **Observable success** | Call terminal state matches delivery observation; disputes remediable via buyer Manage stage. | PARTIAL | Full delivery verification as product purpose — minor (PRODUCT.md) |

---

## Provider journey — Get paid

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Translate fulfilled Calls into Provider earnings and payouts with clear obligations. | PARTIAL | PRODUCT.md separate Provider obligation vs buyer consideration |
| **Decision** | Payout timing, minimum threshold, tax/business setup. | PARTIAL | `convex/moneyPayoutPolicy.ts`; workspace payout summary in owner operations loader |
| **Anxiety** | Held balances; ineligible x402 payout; unresolved obligations block offboarding. | PARTIAL | `payoutEligibility: 'ineligible_x402'` in `convex/moneyManagedCall.ts`; offboarding blocks |
| **What Provider provides** | Payout preferences, verified business facts (charter completeness). | PARTIAL | Whop reference maturity CHARTER |
| **What platform does next** | Accrue earnings, ledger movements, payout binding views. | IMPLEMENTED | `convex/moneyLedger.ts`; foundation “Provider earnings” PRODUCT.md |
| **What can fail and recovery** | Payout blocked until obligations resolved → `payout_resolution_required` in offboarding. **Full AU payout + tax document flow CHARTER.** | PARTIAL | `convex/lib/providerOffboarding/drainAndSettle.ts` |
| **Observable success** | Provider reconciles earnings to Calls without wallet archaeology; finance-export charter CHARTER |

---

## Provider journey — Improve

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Respond to demand signals, pricing, reliability, and repeat purchase evidence. | CHARTER | Journey 4–6; Provider “Improve” loop |
| **Decision** | Revise Tool, pricing, or withdraw supply. | PARTIAL | Owner tool detail + publish revisions |
| **Anxiety** | No visibility into failed searches matching their category. | CHARTER | Market demand signals not exposed as Provider inbox in source |
| **What Provider provides** | Publication updates, connection fixes, optional new Tools. | PARTIAL | Publish/withdraw IMPLEMENTED; demand-driven improve CHARTER |
| **What platform does next** | Catalog refresh, index health, bounded aggregate evidence (future). | PARTIAL | `/admin/index-health`; `marketEvidenceFacts` infrastructure only |
| **What can fail and recovery** | Bad update → rollback via republication; canary funding preflight failures. | PARTIAL | Canary modules under `convex/capabilitySupplyCanary*` |
| **Observable success** | Provider activation and repeat demand (journey 6 Provider-side criteria) — CHARTER |

---

## Journey 5 — No supply today (cross-cutting)

| Question | Answer | Grade | Cite |
| --- | --- | --- | --- |
| **Purpose** | Retain bounded failed-search phrase as market-gap signal; active matching 30 days without auto-purchase. | IMPLEMENTED | PRODUCT.md service request + 2026-09-21 matching window; `MARKET_REQUEST_ACTIVE_WINDOW_MS` in `market-demand.actions.ts` |
| **Decision** | Record gap vs withdraw vs keep searching manually. | IMPLEMENTED | `marketDemand.withdraw`, `marketDemand.status` |
| **Anxiety** | Mistaking signal for tender or guaranteed supply; unwanted purchase. | IMPLEMENTED | Tests `tests/unit/market-terminal/request-memory.test.ts` |
| **What Customer provides** | Normalised query string; idempotency key. | IMPLEMENTED | `marketRequestCreateInputSchema` |
| **What platform does next** | Store signal; optional later matching when catalog changes — **matching consumer to notify customer CHARTER/PARTIAL**. | PARTIAL | Convex `marketDemandSignals` per tests; no fake Provider message |
| **Agent: Connect / search / continue** | After failed `registry.tools.search`, agent may record demand; harness continues work. | IMPLEMENTED | `tests/unit/market-demand/market-demand-actions.test.ts` |
| **What can fail and recovery** | Duplicate record → idempotent create; withdraw stops matching. **No recovery for “never matched” except expiry explanation.** | PARTIAL | Withdraw IMPLEMENTED; proactive match notification CHARTER |
| **Observable success** | Customer informed of active window end; no unauthorized Call. | PARTIAL | Status action IMPLEMENTED; human UI dest for gap memory not in buyer-ia walk |

---

## Human destinations (evidence only)

Signed-in and buyer chrome labels and paths are listed in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7 (`/market`, `/agent-access`, `/activity`, `/owner/operations`, operator rail, full route census). Do not rename or fold destinations from this blueprint; wave 1 [`platform-nav-route-map.md`](./platform-nav-route-map.md) (when present) derives stable dests from jobs.

**Not walked (OPEN for IA):** signed-in AE header, listing Quote/Call, Compare-to-purchase — [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §9.

---

## Register maintenance

When source or tests change implementation truth, update **Grade** and **Cite** columns only; do not restate PRODUCT.md charter here. When a logged-in product walk completes, reconcile human dest rows in `buyer-ia-coverage.md` first, then adjust Manage/Commit observable-success rows if evidence upgrades from PARTIAL to IMPLEMENTED.
