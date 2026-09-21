# System One Native Jev Drop-in Register

**Date:** 19 September 2026  
**Status:** HISTORICAL IMPLEMENTATION REGISTER — NOT EXECUTION AUTHORITY

**Operating Protocol:** `docs/operations/system-one-maturity-protocol.md`  
**Historical baseline (withdrawn):** `docs/adr/0002-jev-system-one-opportunity-statement.md`

**Financial Invariants:** IceInVein Engineering Framework, ATO Australian GST Rules, Formance Double-Entry Ledger  

---

**20 September correction:** preserve the entries below as historical claims
and source pointers, not accepted rollout priorities or current test results.
ADR 0002 is withdrawn. Current product priorities are the six market journeys in
[PRODUCT.md](../../PRODUCT.md#core-market-journeys); the proposed Jev assessment is
[ADR 0003](../adr/0003-jev-market-journey-intelligence.md). Existing reranking and
adjudication hooks do not define Jev's intended product role. Recheck source and
tests before relying on any completion or performance claim below.

**21 September source correction:** the historical deletion statements below are superseded. Current `src/modules/actions/index.ts` registers `toolProcureAction`; `src/modules/capability-execution/procure.actions.ts` implements `tool.procure:v1`. Preserve that action and its capability-execution ownership. Execute current Jev work through the [platform integration register](jev-platform-integration-register.md); this historical register grants no removal or financial-consequence authority.

## 0. Architecture Cutover (2026-09-19)

`procure-engine` is gutted. TypeSafe Jev is a native drop-in on two existing seams, not a third commercial spine.

| Rejected | Native replacement |
| :--- | :--- |
| `CapabilityProcurementEngine` / `tool.procure` / `POST /api/v1/tools/procure` / `ae.procure` | Deleted. Not an API alias. |
| Single-turn discover + quote + call | Product chain stays `registry.tools.search` -> `registry.tools.describe` -> `tool.quote` -> `tool.call` |
| Jev as a purchase verb | Jev as **re-ranker** in `registryToolsSearchAction` (`src/modules/registry/tools.actions.ts` -> `rerankToolSearchResult`) |
| Jev only on a procure path | Jev as **stealth failure adjudicator** in `src/modules/capability-execution/call-worker/output-adjudication.ts` |

Deleted verification suites (`tests/unit/core-flow/*procure*`, `tests/unit/routes/api-tools-procure.test.ts`, `tests/unit/core-flow/iceinvein-audit-verification.test.ts`) are not evidence. Current evidence is `tests/unit/registry/tool-reranker.test.ts`, `tests/unit/decision-engine/decision-gateway.test.ts`, and `tests/unit/call-worker/adjudicate-stealth-failure.test.ts`.

---

## 1. Progress & Census Scorecard

*Refinement in Progress via 4-Phase Subagent Protocol*

| Wave | Workflows | Scope | Verified | In Review | Pending | Target Status |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Native Search Re-rank & Decision Gateway Plumbing** | 5 | `SO-01` to `SO-05` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 2: Platform-Wide Stealth Failure Adjudication & Remedy** | 5 | `SO-06` to `SO-10` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 3: Hierarchical Beam Routing & Multi-Tier Gateway** | 5 | `SO-11` to `SO-15` | 3 | 0 | 2 | `ACTIVE` |
| **Wave 4: Semantic Governance, Catalog Normalization & UI** | 5 | `SO-16` to `SO-20` | 0 | 0 | 5 | `PENDING` |
| **Total** | **20** | **All 20 System One Workflows** | **13** | **0** | **7** | `IN PROGRESS` |

---

# Wave 1: Native Search Re-rank & Decision Gateway Plumbing

### SO-01: Native Jev Re-ranker on `registry.tools.search`
- **Surfaces:** `src/modules/registry/tools.actions.ts`, `src/modules/registry/internal/tool-reranker.ts`, `src/modules/actions/index.ts`
- **Incumbent Baseline:** `registryToolsSearchAction` returned Convex FTS / supply-projection order with an empty `ranking` array. Lexical hits outranked semantically correct x402 Tools.
- **Ergonomic & Architectural Gap:** Agents inspecting the first page spent tokens on keyword-adjacent Tools. A separate `tool.procure` action was the rejected alternative.
- **Target Spec:**
  - After `readCapabilityToolSearch`, call `rerankToolSearchResult(searchResult, data.query)`.
  - Keep `registry.tools.search` read-only: no Quote, no Call, no spend.
  - Do not register `tool.procure` or restore `POST /api/v1/tools/procure`.
- **IceInVein Invariants:** Search is observation-only; CQS; degrade never becomes a 500.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/registry/tool-reranker.test.ts` (passed): TypeSafe cookbook re-rank promotes `operation:v1:crypto_tx_lookup` for "verify blockchain payment on base".
  - Code inspection: `registryToolsSearchAction` in `tools.actions.ts` calls `rerankToolSearchResult`; `tool.procure` is absent from `src/modules/actions/index.ts`.

---

### SO-02: TypeSafe Re-rank Cookbook (Batched `Noul` + `Choice`)
- **Surfaces:** `src/modules/registry/internal/tool-reranker.ts`, `src/modules/decision-engine/public.ts`
- **Incumbent Baseline:** No calibrated relevance scores on Tool search pages.
- **Ergonomic & Architectural Gap:** One LLM call per candidate is too slow and too expensive for a public search action.
- **Target Spec:**
  - One Decision Gateway pass: `match_N` `Noul` per candidate (max 20) plus `best_match` `Choice`.
  - Combine `noul + 0.15` best-match bonus, cap at 1.0, sort descending, populate `ranking`.
  - Skip re-rank when query is empty or `items.length <= 1`.
- **IceInVein Invariants:** Bounded candidate count; no financial math in the ranker.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/registry/tool-reranker.test.ts` (passed): Jev success path writes `ranking[0] = { toolRef: crypto, rank: 1, score: 1 }`.

---

### SO-03: Retriever Authority & Graceful Degrade
- **Surfaces:** `src/modules/registry/internal/tool-reranker.ts`, `src/modules/capability-supply/tool-source.ts`
- **Incumbent Baseline:** Prototypes used static hardcoded tool candidate arrays, then a procure-engine catalog searcher.
- **Ergonomic & Architectural Gap:** A downed Decisions API must not blank the public catalog.
- **Target Spec:**
  - Convex `readCapabilityToolSearch` remains the retriever of record.
  - Unhandled re-rank errors call `degrade` and return the original `ToolSearchResult`.
  - `disableRerank` short-circuits to the retriever page.
- **IceInVein Invariants:** CQS; catalog queries stay side-effect free; search degrade is non-fatal.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/registry/tool-reranker.test.ts` (passed): empty query / single item return the input object; unhandled throw degrades without dropping `items`.

---

### SO-04: 4-Tier Gateway Shared by Search and Adjudication
- **Surfaces:** `src/modules/decision-engine/decision-gateway.ts`, `src/modules/decision-engine/jev-client.ts`, `src/modules/decision-engine/deterministic-fallback.ts`
- **Incumbent Baseline:** No shared probabilistic router; procure-engine owned its own fallback story.
- **Ergonomic & Architectural Gap:** Search re-rank and stealth adjudication must share one degrade path.
- **Target Spec:**
  - Both drop-ins call `executeDecisionGateway` only.
  - Tiers: Jev System One $\rightarrow$ Secondary LLM $\rightarrow$ Deterministic rule engine $\rightarrow$ Safe refusal.
- **IceInVein Invariants:** Graceful degradation; zero unhandled promise rejections on the search path.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/decision-engine/decision-gateway.test.ts` (passed): Jev success, LLM fallback, deterministic fallback.
  - `tests/unit/registry/tool-reranker.test.ts` (passed): offline network still ranks crypto first via the deterministic engine.

---

### SO-05: Quote/Call Remain the Commercial Spine
- **Surfaces:** `src/modules/capability-execution/quote.actions.ts`, `src/modules/capability-execution/call.actions.ts`, `src/modules/money/public.ts`
- **Incumbent Baseline:** `procure-engine` calculated GST, enforced `maxSpendAud`, and invoked `CallService` from a search-shaped need.
- **Ergonomic & Architectural Gap:** Collapsing budget gates into search hid authority and tax facts.
- **Target Spec:**
  - Australian GST (`calculateAudGstSplit`) and budget comparison stay on `tool.quote` / `tool.call`.
  - `registry.tools.search` effect remains `read_only` / `spendExposure: 'none'`.
  - Caller scope `market_tools:call` is enforced at Quote/Call, not at search.
- **IceInVein Invariants:** Exact micro-cent arithmetic; authority precedes execution; search never reserves Formance units.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Action contracts: `registryToolsSearchContract.effect.spendExposure === 'none'`; `toolQuoteAction` / `callAction` remain registered.
  - Deleted procure surfaces are absent from `src/modules/actions/index.ts` and `src/routes/`.

---

# Wave 2: Platform-Wide Stealth Failure Adjudication & Remedy

### SO-06: Call Worker Output Adjudication Seam Injection
- **Surfaces:** `src/modules/capability-execution/call-worker/output-adjudication.ts`, `src/modules/capability-execution/call-worker/runRelease.ts`, `src/modules/capability-execution/call-worker/brokeredX402.ts`
- **Incumbent Baseline:** Call worker blindly trusted HTTP 200 responses from upstream providers. Stealth errors (`{"status": "error", "code": "ETIMEDOUT"}`) resulted in successful ledger settlement.
- **Ergonomic & Architectural Gap:** Buyers paid for broken service calls; agents crashed unexpectedly.
- **Target Spec:**
  - Create `adjudicatePayloadOutput` interceptor evaluating provider `outputJson` before settlement.
  - Inject into `runRelease.ts` and `brokeredX402.ts` right after `parseContractOutput`.
  - When upstream failure detected with confidence $\ge 0.75$, force `outputValidation.valid = false`.
- **IceInVein Invariants:** Pre-settlement boundary inspection; Formance hold invalidation before funds capture.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/call-worker/adjudicate-stealth-failure.test.ts` (passed): HTTP 200 payload containing `ETIMEDOUT` is classified `upstream_provider` and releases the hold.

---

### SO-07: Formance Ledger Hold Invalidation on Provider Stealth Failure
- **Surfaces:** `src/modules/capability-execution/call-worker/runRelease.ts`, `src/modules/capability-execution/call-worker/brokeredX402.ts`, `convex/capabilityCallWorker.ts`
- **Incumbent Baseline:** Provider errors that returned HTTP 200 triggered `settleProviderLease` and captured funds in Formance.
- **Ergonomic & Architectural Gap:** Credit leaked permanently to failing external providers.
- **Target Spec:**
  - When `outputValidation.valid` is forced to `false`, `chargeSettlementOutcome` evaluates to `'not_released'`.
  - Formance hold automatically releases before claim; available balance is restored with zero manual intervention.
- **IceInVein Invariants:** Money-managed call lifecycle invariant: unreleased holds return $A$0.00 net deduction.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/call-worker/adjudicate-stealth-failure.test.ts` (passed): `adjudicateStealthFailureAndReleaseHold` sets `releasedHold: true` on stealth timeout and leaves the hold untouched on a clean payload.

---

### SO-08: Rule 4 Diagnostic Triplet Generation
- **Surfaces:** `src/modules/capability-execution/call-receipt-view.ts`, `src/components/ae/call-receipt/`
- **Incumbent Baseline:** Failure states returned raw stack traces or cryptic HTTP status codes. Procure-engine owned a parallel diagnostic object.
- **Ergonomic & Architectural Gap:** High operator anxiety; unknown financial state; unclear recovery path. A procure-only triplet would miss Calls that never went through `ae.procure`.
- **Target Spec:**
  - Every remedied Call receipt projects:
    - `whatHappened`: Plain-English explanation of provider failure.
    - Money movement: Explicit guarantee (e.g. $A$0.00 deducted / hold released).
    - `userNext`: Actionable recovery advice.
  - Project `remedyCertificate` when the receipt is refunded.
- **IceInVein Invariants:** Diagnostic transparency; explicit customer-facing financial guarantees on the Call, not on a procure wrapper.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/components/call-receipt-remedy-ui.test.tsx` (passed): receipt renders certificate and diagnostic fields.

---

### SO-09: Autonomous Buyer Protection Certificate Projection & UI
- **Surfaces:** `src/components/ae/call-receipt/CallReceiptPrimitives.tsx`, `src/modules/capability-execution/call-receipt-view.ts`
- **Incumbent Baseline:** Call receipts showed only settlement or standard failure flags.
- **Ergonomic & Architectural Gap:** Buyers had no cryptographic or visual proof that autonomous protection had intervened on their behalf.
- **Target Spec:**
  - Project `remedyCertificate` into `CallReceiptIssue` view model.
  - Render high-craft "Autonomous Buyer Protection Certificate" badge in UI with adjudicator name, decision confidence, and net hold released ($A$0.00).
- **IceInVein Invariants:** Transparent audit trail; verifiable protection evidence.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/components/call-receipt-remedy-ui.test.tsx` (passed): UI renders certificate (`jev-payload-auditor (System One)`, `jev_system_one`) and diagnostic triplet cleanly.

---

### SO-10: False-Positive Guardrails & Fast-Path Pre-Filtering
- **Surfaces:** `src/modules/capability-execution/call-worker/output-adjudication.ts`
- **Incumbent Baseline:** Every call risked triggering expensive, high-latency LLM roundtrips even on clean responses.
- **Ergonomic & Architectural Gap:** Adding 300ms–1500ms latency to every successful platform call would degrade core performance.
- **Target Spec:**
  - Implement zero-overhead token filter scanning for error tokens (`error`, `timeout`, `failed`, `500`, `exception`, etc.).
  - Payloads without error tokens bypass AI adjudication in $<1$ millisecond.
  - Only ambiguous or error-token-bearing payloads route to the calibrated Decision Gateway.
- **IceInVein Invariants:** Latency preservation; bounded resource consumption.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/call-worker/adjudicate-stealth-failure.test.ts` (passed): clean timezone conversion payload is adjudicated without releasing the hold (`runAction` not called).

---

# Wave 3: Hierarchical Beam Routing & Multi-Tier Gateway

### SO-11: 4-Tier Resilient Fallback Gateway Execution Engine
- **Surfaces:** `src/modules/decision-engine/decision-gateway.ts`, `src/modules/decision-engine/contracts.ts`
- **Incumbent Baseline:** Platform had no centralized probabilistic decision routing abstraction.
- **Ergonomic & Architectural Gap:** Single-point-of-failure on external AI model outages.
- **Target Spec:**
  - Orchestrate 4 tiers: Tier 1 Jev Decisions API $\rightarrow$ Tier 2 Secondary LLM Adapter $\rightarrow$ Tier 3 Deterministic Rule Engine $\rightarrow$ Tier 4 Safe Refusal.
  - Automatically degrade and log errors without crashing caller workflows.
- **IceInVein Invariants:** Graceful degradation; zero unhandled promise rejections.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/decision-engine/decision-gateway.test.ts` (all 3 suites passed: Jev success, LLM fallback, deterministic fallback).

---

### SO-12: 3-Hop Hierarchical Taxonomy Tree Construction
- **Surfaces:** `src/modules/registry/internal/taxonomy.ts`, `src/modules/capability-supply/public.ts`
- **Incumbent Baseline:** Flat catalog listing with keyword search. Cannot scale past 255 options due to single-prompt model limits.
- **Ergonomic & Architectural Gap:** Routing across 16,000 tools is impossible with flat choices.
- **Target Spec:**
  - Define static/dynamic 3-hop taxonomy tree:
    - Hop 1: 16 Core Domains (Finance, Web Data, Developer Tools, Legal, etc.).
    - Hop 2: ~120 Subcategories (Cryptocurrency, Foreign Exchange, Scrapers, AST Parsers, etc.).
    - Hop 3: Leaf Tool Clusters (up to 20 tools per subcategory).
  - Map every published tool in `capabilityPublications` to a taxonomy leaf node.
  - Beam output is a candidate page for `registry.tools.search` / `rerankToolSearchResult`, never a procure engine.
- **IceInVein Invariants:** Deterministic path verification; bounded option counts per node ($\le 25$).
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 1

---

### SO-13: Parallel Beam-Search Chaining Engine
- **Surfaces:** `src/modules/decision-engine/beam-router.ts`, `src/modules/registry/internal/tool-reranker.ts`
- **Incumbent Baseline:** Prototype script `tools/dev/experiment-chained-jev-router.ts` demonstrated greedy and beam search in standalone mode. Page-local re-rank on `registryToolsSearchAction` is the shipping precursor.
- **Ergonomic & Architectural Gap:** Greedy routing gets trapped in local optima when top-1 choice is wrong; flat beam search is too slow sequentially. Must not re-introduce `procure-engine`.
- **Target Spec:**
  - Implement speculative parallel fan-out beam search router:
    - Hop 1 Jev call returns top domains with confidence scores.
    - If top domain has $\ge 85\%$ confidence, proceed greedily down Hop 2.
    - If multiple domains exceed $15\%$ beam threshold, fan out parallel Hop 2 Jev calls concurrently.
    - Consolidate final candidates and select optimal leaf `toolRef` in $<1,200$ms.
  - Feed the resulting page into `rerankToolSearchResult` or return it as `registry.tools.search` items.
- **IceInVein Invariants:** Hard timeout bounding (max 2,000ms total); fallback to FTS on beam timeout.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 1

---

### SO-14: Circuit Breaking & Degrade Observability
- **Surfaces:** `src/modules/decision-engine/decision-gateway.ts`, `src/lib/observability/degrade-backend.ts`, `src/lib/observability/degrade.ts`
- **Incumbent Baseline:** Silent try/catch blocks swallowed errors without structured operational metrics.
- **Ergonomic & Architectural Gap:** Operators had no visibility into model degradation rates or latency spikes.
- **Target Spec:**
  - Integrate `degrade` / `degradeBackend` into all fallback paths, including `rerankToolSearchResult` and `adjudicatePayloadOutput`.
  - Record execution tier (`jev_system_one`, `secondary_llm_adapter`, `deterministic_rule_engine`) in result metadata.
- **IceInVein Invariants:** Full auditability; structured error telemetry.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Verified in `tests/unit/decision-engine/decision-gateway.test.ts`.

---

### SO-15: Air-Gapped Deterministic Rule Guarantee
- **Surfaces:** `src/modules/decision-engine/deterministic-fallback.ts`
- **Incumbent Baseline:** External AI failure resulted in blank search ranking or skipped stealth adjudication.
- **Ergonomic & Architectural Gap:** Fragile reliance on external API uptime.
- **Target Spec:**
  - Token-based heuristic matcher capable of scoring search candidates and detecting error payloads without internet or AI availability.
  - Calibrated confidence scoring for deterministic matching.
- **IceInVein Invariants:** High availability; zero hard dependencies on external SaaS for basic platform survival.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/decision-engine/decision-gateway.test.ts` (passed): deterministic tier after Jev and secondary LLM fail.
  - `tests/unit/registry/tool-reranker.test.ts` (passed): "Network Offline" still ranks the crypto Tool first.

---

# Wave 4: Semantic Governance, Catalog Normalization & UI

### SO-16: Semantic Spending Shield & Exfiltration Guard
- **Surfaces:** `src/modules/agent-access/spending-shield.ts`, `src/modules/capability-execution/quote.actions.ts`
- **Incumbent Baseline:** Spending policies only enforced quantitative limits (e.g. `spend < $50 AUD`). A procure-engine pre-flight is rejected.
- **Ergonomic & Architectural Gap:** Vulnerable to prompt injection, data exfiltration via DNS/HTTP tools, and off-policy spending.
- **Target Spec:**
  - Inject System One semantic risk evaluation **before quote binding** on `tool.quote`:
    - Assess whether capability request matches assigned agent purpose.
    - Scan parameter values for exfiltration signatures (encoded secrets, credentials, SQL payloads).
  - High risk triggers refusal or escalation.
  - Do not attach this shield to `registry.tools.search`.
- **IceInVein Invariants:** Security bounding; caller-specific spending policy preservation; search stays read-only.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2

---

### SO-17: Dual-Pillar Policy & Human Escalation Bridge
- **Surfaces:** `src/modules/capability-execution/quote.actions.ts`, `src/modules/agent-access/policy.ts`
- **Incumbent Baseline:** Quote/Call returned binary delivered or refused states. Procure-engine `kind: 'authority_required'` is deleted.
- **Ergonomic & Architectural Gap:** Borderline high-value transactions failed outright instead of allowing human operator review.
- **Target Spec:**
  - Bridge low-confidence ($\le 75\%$) or high-value calls ($> \$10$ AUD) to existing `approval_required` flow on Quote.
  - Return an authority-required continuation for the operator dashboard. Do not invent a procure continuation token.
- **IceInVein Invariants:** Non-repudiation; human-in-the-loop escalation.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2

---

### SO-18: Facilitator Ingest Normalizer
- **Surfaces:** `src/modules/discovery/facilitator-ingest.ts`, `convex/capabilitySupplyTools.ts`
- **Incumbent Baseline:** External tools imported from Coinbase Bazaar or PayAI have raw, noisy descriptions and missing tags.
- **Ergonomic & Architectural Gap:** Poor catalog search quality and classification errors.
- **Target Spec:**
  - System One normalizer pipeline during `admitFacilitatorDiscoveryItems`:
    - Auto-classify category and domain.
    - Extract standardized job labels and keywords.
    - Validate and sanitize input schema types.
- **IceInVein Invariants:** Supply boundary preservation; schema integrity.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2

---

### SO-19: Operator Console Call Receipt & Routing Observability
- **Surfaces:** `src/routes/_operator/calls.$callRef.tsx`, `src/components/ae/call-receipt/`
- **Incumbent Baseline:** Operator call detail page only displays raw execution time and basic status. Search ranking scores are not shown on the catalog page.
- **Ergonomic & Architectural Gap:** Operators cannot inspect Jev ranking scores, decision confidence, fallback tiers, or remedy audit trail.
- **Target Spec:**
  - Add "System One Decision Telemetry" card to `calls.$callRef.tsx`:
    - Adjudication duration, decision tier badge (`JEV System One`, `Fallback LLM`, or `Deterministic`).
    - Calibrated confidence indicator (e.g. `98.4%`).
    - Cost breakdown showing Jev decision cost ($A$0.00003 AUD).
  - Optionally surface `ranking[]` scores on Tool search results.
- **IceInVein Invariants:** Observability without clutter; zero layout shift.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2

---

### SO-20: End-to-End Adversarial Stress & IceInVein Penetration Suite
- **Surfaces:** `tests/integration/system-one-adversarial.spec.ts`
- **Incumbent Baseline:** Separate unit tests across registry, decision-engine, and call-worker modules.
- **Ergonomic & Architectural Gap:** Lack of continuous automated stress testing under concurrent load and hostile payloads.
- **Target Spec:**
  - Comprehensive adversarial test suite:
    - 100 concurrent `registry.tools.search` requests plus Quote/Call traffic over MCP and HTTP.
    - Injected simulated network partitions and provider crashes.
    - Double-spend and race condition attempts on Formance holds.
    - Zero funds lost or ledger discrepancies verified via ledger balances audit.
  - Do not restore a procure HTTP flood as the stress shape.
- **IceInVein Invariants:** 100% financial consistency; zero state drift.
- **Subagent Assignment:** Auditor (Penetration) $\rightarrow$ Composer (Hardening) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2
