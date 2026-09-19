# System One & Autonomous Capability Procurement Register

**Date:** 19 September 2026  
**Status:** ACTIVE REFINEMENT & MATURITY REGISTER  
**Operating Protocol:** `docs/operations/system-one-maturity-protocol.md`  
**Architectural Baseline:** `docs/adr/0002-jev-system-one-opportunity-statement.md`  
**Financial Invariants:** IceInVein Engineering Framework, ATO Australian GST Rules, Formance Double-Entry Ledger  

---

## 1. Progress & Census Scorecard

*Refinement in Progress via 4-Phase Subagent Protocol*

| Wave | Workflows | Scope | Verified | In Review | Pending | Target Status |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Single-Turn Procurement & Native Platform Plumbing** | 5 | `SO-01` to `SO-05` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 2: Platform-Wide Stealth Failure Adjudication & Remedy** | 5 | `SO-06` to `SO-10` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 3: Hierarchical Beam Routing & Multi-Tier Gateway** | 5 | `SO-11` to `SO-15` | 3 | 0 | 2 | `ACTIVE` |
| **Wave 4: Semantic Governance, Catalog Normalization & UI** | 5 | `SO-16` to `SO-20` | 0 | 0 | 5 | `PENDING` |
| **Total** | **20** | **All 20 System One Workflows** | **13** | **0** | **7** | `IN PROGRESS` |

---

# Wave 1: Single-Turn Procurement & Native Platform Plumbing

### SO-01: Public API & Central Action Registry Surface Registration
- **Surfaces:** `src/modules/actions/index.ts`, `src/routes/api.v1.tools.procure.ts`, `src/modules/capability-execution/procure.actions.ts`
- **Incumbent Baseline:** Quoting and calling required a 2-turn manual handshake (`POST /api/v1/tools/quote` followed by `POST /api/v1/tools/call`). No unified single-turn procurement endpoint existed.
- **Ergonomic & Architectural Gap:** High friction for autonomous agents; required 4,000+ token context window overhead and 4–8 seconds latency.
- **Target Spec:**
  - Register `toolProcureAction` (`tool.procure`) in central `registeredActions` in `src/modules/actions/index.ts`.
  - Expose `POST /api/v1/tools/procure` route with RFC 9457 problem details and request correlation.
  - Automatically surface `ae_tool_procure` in anonymous/authenticated MCP tools list.
- **IceInVein Invariants:** Single action ID, strict Zod input/output schemas, no internal leakage.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/core-flow/native-platform-procure.test.ts` (passed): `findAction('tool.procure')` returns registered action; `mcpToolName` evaluates to `ae_tool_procure`.
  - `tests/unit/routes/api-tools-procure.test.ts` (passed): 1-turn HTTP procurement delivers valid schema.

---

### SO-02: Native `CallService` Delegation & Production Stub Elimination
- **Surfaces:** `src/lib/server/procure-api.ts`, `src/modules/capability-execution/procure-engine.ts`
- **Incumbent Baseline:** Early prototype relied on `defaultProductionCallExecutor` which mocked execution in memory.
- **Ergonomic & Architectural Gap:** Execution was not connected to real Convex quote tables or Formance ledger holds.
- **Target Spec:**
  - Replace fake executor with direct delegation to `callService.quoteTool` and `callService.callTool`.
  - Wire `authenticateCallGateway` into `handleToolProcurePost` to bind caller identity.
  - Delete fake production call executor stubs completely.
- **IceInVein Invariants:** Zero fake stubs in production paths; all executions require authentic `AgentAccessPrincipal`.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/core-flow/native-platform-procure.test.ts` (passed): Confirms `quoteTool` and `callTool` are called sequentially on the injected native `CallService`.
  - Code inspection confirms `defaultProductionCallExecutor` deleted.

---

### SO-03: Dynamic Catalog Search & Publication Schema Projection
- **Surfaces:** `src/modules/capability-execution/procure-engine.ts`, `src/lib/server/procure-api.ts`
- **Incumbent Baseline:** Prototypes used static hardcoded tool candidate arrays in memory.
- **Ergonomic & Architectural Gap:** Any newly admitted provider tool was invisible to the procurement engine without code changes.
- **Target Spec:**
  - `defaultProductionCatalogSearcher` queries Convex database via `capabilitySupplyTools:search`.
  - Deserializes results using `deserializeToolSearchResult` from `src/modules/registry/public.ts`.
  - Projects published `inputJsonSchema` directly into parameter synthesis.
- **IceInVein Invariants:** CQS compliance; catalog queries are pure and side-effect free.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `src/modules/capability-execution/procure-engine.ts` dynamic catalog searcher passes unit and integration tests.

---

### SO-04: Deterministic Australian GST & Budget Invariant Enforcement
- **Surfaces:** `src/modules/capability-execution/procure-engine.ts`, `src/modules/capability-execution/procure.ts`
- **Incumbent Baseline:** Quoted amounts were floating-point numbers without explicit Australian GST breakdowns.
- **Ergonomic & Architectural Gap:** Failed ATO tax compliance for Australian businesses; susceptible to floating-point rounding errors.
- **Target Spec:**
  - Calculate 10% GST using integer BigInt math via `calculateAudGstSplit(totalUnits, 1000)`.
  - Enforce `maxSpendAud` budget checks using `compareExactAmounts` before issuing `callTool`.
  - Format prices as micro-cent accurate strings (`A$0.0020`, `A$0.0018` net, `A$0.0002` GST).
- **IceInVein Invariants:** Exact micro-cent arithmetic; zero floating-point math in financial lines.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/core-flow/native-platform-procure.test.ts` (passed): Verifies exact GST split ($0.0020 = $0.0018 + $0.0002) and budget halts prior to call.

---

### SO-05: Caller Authority & Credential Scope Admission
- **Surfaces:** `src/lib/server/procure-api.ts`, `src/lib/server/mcp-api.ts`
- **Incumbent Baseline:** Anonymous callers could hit endpoints or received unhelpful 500 errors on missing context.
- **Ergonomic & Architectural Gap:** Lacked standard OAuth/Bearer challenges and scope enforcement.
- **Target Spec:**
  - Enforce `market_tools:call` scope on both HTTP and MCP surfaces.
  - Return `401 Unauthorized` with `WWW-Authenticate: Bearer` challenge on missing credentials.
  - Reject requests lacking the `market_tools:call` scope with `403 Forbidden`.
- **IceInVein Invariants:** Authority must precede execution; principle of least privilege.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/core-flow/native-platform-procure.test.ts` (passed): Unauthenticated request returns 401 with Bearer header and `authentication_required` code.

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
  - `tests/unit/core-flow/native-platform-procure.test.ts` (passed): HTTP 200 payload containing `ETIMEDOUT` is invalidated (`valid: false`).

---

### SO-07: Formance Ledger Hold Invalidation on Provider Stealth Failure
- **Surfaces:** `src/modules/capability-execution/call-worker/runRelease.ts`, `src/modules/capability-execution/call-worker/brokeredX402.ts`
- **Incumbent Baseline:** Provider errors that returned HTTP 200 triggered `settleProviderLease` and captured funds in Formance.
- **Ergonomic & Architectural Gap:** Credit leaked permanently to failing external providers.
- **Target Spec:**
  - When `outputValidation.valid` is forced to `false`, `chargeSettlementOutcome` evaluates to `'not_released'`.
  - Formance hold automatically releases before claim; available balance is restored with zero manual intervention.
- **IceInVein Invariants:** Money-managed call lifecycle invariant: unreleased holds return $A$0.00 net deduction.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Verified via `adjudicateStealthFailureAndReleaseHold` tests in `tests/unit/call-worker/adjudicate-stealth-failure.test.ts`.

---

### SO-08: Rule 4 Diagnostic Triplet Generation
- **Surfaces:** `src/modules/capability-execution/procure-engine.ts`, `src/modules/capability-execution/procure.ts`
- **Incumbent Baseline:** Failure states returned raw stack traces or cryptic HTTP status codes.
- **Ergonomic & Architectural Gap:** High operator anxiety; unknown financial state; unclear recovery path.
- **Target Spec:**
  - Every remedied call returns structured `diagnostic`:
    - `whatHappened`: Plain-English explanation of provider failure.
    - `financialImpact`: Explicit guarantee (e.g. *"A$0.00 deducted — A$0.0020 refunded immediately to available balance"*).
    - `nextStep`: Actionable recovery advice or alternate tool recommendation.
- **IceInVein Invariants:** Diagnostic transparency; explicit customer-facing financial guarantees.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/core-flow/magical-procurement.test.ts` and `api-tools-procure.test.ts` pass diagnostic triplet checks.

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
  - `tests/unit/components/call-receipt-remedy-ui.test.tsx` (passed): UI renders certificate and diagnostic triplet cleanly.

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
  - `tests/unit/core-flow/native-platform-procure.test.ts` (passed): Clean payload evaluates in $<1$ms without modifying validity.

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
- **IceInVein Invariants:** Deterministic path verification; bounded option counts per node ($\le 25$).
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 1

---

### SO-13: Parallel Beam-Search Chaining Engine
- **Surfaces:** `src/modules/decision-engine/beam-router.ts`, `src/modules/capability-execution/procure-engine.ts`
- **Incumbent Baseline:** Prototype script `tools/dev/experiment-chained-jev-router.ts` demonstrated greedy and beam search in standalone mode.
- **Ergonomic & Architectural Gap:** Greedy routing gets trapped in local optima when top-1 choice is wrong; flat beam search is too slow sequentially.
- **Target Spec:**
  - Implement speculative parallel fan-out beam search router:
    - Hop 1 Jev call returns top domains with confidence scores.
    - If top domain has $\ge 85\%$ confidence, proceed greedily down Hop 2.
    - If multiple domains exceed $15\%$ beam threshold, fan out parallel Hop 2 Jev calls concurrently.
    - Consolidate final candidates and select optimal leaf `toolRef` in $<1,200$ms.
- **IceInVein Invariants:** Hard timeout bounding (max 2,000ms total); fallback to FTS on beam timeout.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 1

---

### SO-14: Circuit Breaking & Degrade Observability
- **Surfaces:** `src/modules/decision-engine/decision-gateway.ts`, `src/lib/observability/degrade-backend.ts`
- **Incumbent Baseline:** Silent try/catch blocks swallowed errors without structured operational metrics.
- **Ergonomic & Architectural Gap:** Operators had no visibility into model degradation rates or latency spikes.
- **Target Spec:**
  - Integrate `degradeBackend` into all fallback paths.
  - Record execution tier (`jev`, `secondary_llm`, `deterministic_rule_engine`) in result metadata.
- **IceInVein Invariants:** Full auditability; structured error telemetry.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Verified in `tests/unit/decision-engine/decision-gateway.test.ts`.

---

### SO-15: Air-Gapped Deterministic Rule Guarantee
- **Surfaces:** `src/modules/decision-engine/deterministic-fallback.ts`
- **Incumbent Baseline:** External AI failure resulted in complete procurement outage.
- **Ergonomic & Architectural Gap:** Fragile reliance on external API uptime.
- **Target Spec:**
  - Token-based heuristic matcher capable of resolving capability gaps and detecting errors without internet or AI availability.
  - Calibrated confidence scoring for deterministic matching.
- **IceInVein Invariants:** High availability; zero hard dependencies on external SaaS for basic platform survival.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Verified in `tests/unit/core-flow/iceinvein-audit-verification.test.ts`.

---

# Wave 4: Semantic Governance, Catalog Normalization & UI

### SO-16: Semantic Spending Shield & Exfiltration Guard
- **Surfaces:** `src/modules/agent-access/spending-shield.ts`, `src/modules/capability-execution/procure-engine.ts`
- **Incumbent Baseline:** Spending policies only enforced quantitative limits (e.g. `spend < $50 AUD`).
- **Ergonomic & Architectural Gap:** Vulnerable to prompt injection, data exfiltration via DNS/HTTP tools, and off-policy spending.
- **Target Spec:**
  - Inject System One semantic risk evaluation before quote binding:
    - Assess whether capability request matches assigned agent purpose.
    - Scan parameter values for exfiltration signatures (encoded secrets, credentials, SQL payloads).
  - High risk triggers refusal or escalation.
- **IceInVein Invariants:** Security bounding; caller-specific spending policy preservation.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2

---

### SO-17: Dual-Pillar Policy & Human Escalation Bridge
- **Surfaces:** `src/modules/capability-execution/procure-engine.ts`, `src/modules/agent-access/policy.ts`
- **Incumbent Baseline:** Procurement returned binary delivered or refused states.
- **Ergonomic & Architectural Gap:** Borderline high-value transactions failed outright instead of allowing human operator review.
- **Target Spec:**
  - Bridge low-confidence ($\le 75\%$) or high-value calls ($> \$10$ AUD) to existing `approval_required` flow.
  - Return `kind: 'authority_required'` with cryptographic continuation token for operator dashboard approval.
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
- **Incumbent Baseline:** Operator call detail page only displays raw execution time and basic status.
- **Ergonomic & Architectural Gap:** Operators cannot inspect Jev routing latency, decision confidence, fallback tiers, or remedy audit trail.
- **Target Spec:**
  - Add "System One Decision Telemetry" card to `calls.$callRef.tsx`:
    - Routing duration (e.g. `48ms`), decision tier badge (`JEV System One`, `Fallback LLM`, or `Deterministic`).
    - Calibrated confidence indicator (e.g. `98.4%`).
    - Cost breakdown showing Jev decision cost ($A$0.00003 AUD).
- **IceInVein Invariants:** Observability without clutter; zero layout shift.
- **Subagent Assignment:** Grok (Spec) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2

---

### SO-20: End-to-End Adversarial Stress & IceInVein Penetration Suite
- **Surfaces:** `tests/integration/system-one-adversarial.spec.ts`
- **Incumbent Baseline:** Separate unit tests across different modules.
- **Ergonomic & Architectural Gap:** Lack of continuous automated stress testing under concurrent load and hostile payloads.
- **Target Spec:**
  - Comprehensive adversarial test suite:
    - 100 concurrent procurement requests over MCP and HTTP.
    - Injected simulated network partitions and provider crashes.
    - Double-spend and race condition attempts on Formance holds.
    - Zero funds lost or ledger discrepancies verified via ledger balances audit.
- **IceInVein Invariants:** 100% financial consistency; zero state drift.
- **Subagent Assignment:** Auditor (Penetration) $\rightarrow$ Composer (Hardening) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
- **Target Completion:** Sprint 2
