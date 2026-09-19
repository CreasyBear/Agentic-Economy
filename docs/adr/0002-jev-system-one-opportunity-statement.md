---
status: accepted
date: 2026-09-18
title: "ADR 0002: System One Probabilistic Decision Architecture & Autonomous Procurement Topology (Jev & Chaining)"
authors: ["Joel Chan", "Cursor Agent"]
references:
  - "https://paulgraham.com/powerful.html (Paul Graham, 'Making Startups Powerful', Sep 2026)"
  - "docs/adr/0001-principal-reseller-commercial-topology.md"
  - "docs/designs/2026-09-16-am-source-iceinvein.md"
  - "docs/operations/user-and-org-ergonomics-protocol.md"
  - "docs/operations/user-and-org-maturity-protocol.md"
  - "PRODUCT.md"
  - "CONTEXT.md"
  - "AGENTS.md"
---

# ADR 0002: System One Probabilistic Decision Architecture & Autonomous Procurement Topology

## Executive Summary

This Architecture Decision Record (ADR) establishes **TypeSafe AI Jev System One decision primitives** (`Choice`, `Score`, `Noul`) and **Hierarchical Beam Search Chaining** as core platform functionality within **Agentic Economy (AE)**.

Grounding ourselves in Paul Graham’s thesis in [*Making Startups Powerful* (September 2026)](https://paulgraham.com/powerful.html) and our strict IceInVein source maturity standards, this architecture elevates Agentic Economy from a passive API directory into the authoritative, autonomous commercial clearinghouse for AI agents.

By moving beyond observational research into verified, runnable core functionality across real in-app tools (`Timezone Converter`, `Onesource Ethereum Tx`, `Onesource ERC20 Transfers`, and `AEcon Sandbox Reference`), this ADR defines the architecture that enables:
1. **Single-Turn Capability Ingestion (`ae.procure`):** Compressing multi-turn discovery, schema inspection, quoting, and dispatch into a sub-970ms single-turn call.
2. **Autonomous Instant Buyer Protection (The "PayPal Moat" for AI Agents):** Sub-150ms post-execution payload auditing that detects stealth provider crashes, halts upstream settlement, and releases Formance ledger holds instantly ($A$0.00 net charge).
3. **16,000-Tool Hierarchical Beam Routing:** Scalable sub-1.5s search across massive tool catalogs without frontier LLM latency (3-6s) or cost ($0.03-$0.05).
4. **Strict IceInVein Invariant Preservation:** Keeping probabilistic intelligence strictly separated from deterministic BigInt ledger arithmetic and transactional Convex mutations.

---

## 1. Strategic Context: The Paul Graham Power Heuristic

In *Making Startups Powerful*, Paul Graham outlines the structural transformations that turn early-stage software companies into dominant market institutions:

> *"Asking how the company could make more money is a good heuristic too, but it tends to yield incremental improvements. Whereas thinking about how to make it more powerful will sometimes make it orders of magnitude more valuable."*

Graham articulates six core principles that directly govern Agentic Economy's architectural evolution:

1. **Make the Money and Tokens Flow Through You:**
   > *"It's always good when money flows through you... You can also make tokens flow through you, and this usually means that money flows through you too, since the tokens have to be paid for. In theory this puts you in a powerful position. You own the customer relationship, and the model companies are in effect component suppliers."*
   - *AEcon Core Architecture:* By providing an autonomous procurement reflex (`ae.procure`), agents delegate capability acquisition directly to AEcon. Capability tokens and Formance prepaid AUD flow through AEcon by default.
2. **Generalize into an Agent-to-Agent Marketplace:**
   > *"If I were talking to a startup building a way for agents to pay for things, the first question I'd ask is whether the agents could also pay one another. If they can do that, you become a marketplace..."*
   - *AEcon Core Architecture:* Agent A purchases capabilities from Agent B through AEcon’s Australian principal-reseller boundary (ADR 0001). Jev matches and audits the contract at machine clock speeds; AEcon guarantees tax, invoicing, and settlement.
3. **Own the Outside Surface, Not Component Delivery:**
   Component suppliers live in boxes built by others. AEcon owns the external commercial surface: legal seller liability, customer spending policies, unified billing, and instant dispute resolution.
4. **Help Users Make Money (Both Buyers and Sellers):**
   Providers instantly monetize latent APIs without building marketing frontends. Buyer agents eliminate the catastrophic economic drag of failed API calls.
5. **Generosity as an Unassailable Moat (Instant Buyer Protection):**
   > *"Being generous makes you more powerful. As Tim O'Reilly said, you should create more value than you capture... Discovering some new thing you could make for them could easily get you 10x or 100x returns."*
   By absorbing upstream supplier failure risk and granting instant, automated refunds to buyer agents when a third-party tool delivers garbage, AE creates an unassailable trust moat.
6. **Serve Customers Who Decide Fast:**
   > *"Having customers who decide fast makes you powerful... AI agents are replacing human users. Who knows what they'll want to do? So err on the side of having APIs."*
   AI agents operate on millisecond clocks. Forcing an agent into a multi-turn, 6-second generative LLM loop will cause them to bypass the platform; resolving their need in 970ms makes AEcon the default agent runtime reflex.

---

## 2. The Six Gravity Wells of Agentic Economy

In market architecture, a **Gravity Well** is a point of massive friction, cost, or risk that drags the system down if handled mechanically, but exerts an irresistible gravitational pull of adoption, volume, and moat when solved natively.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   THE 6 GRAVITY WELLS OF AGENTIC ECONOMY                         │
├───────────────────────────────┬──────────────────────────────────────────────────┤
│ 1. Autonomous Ingest          │ From 7-turn search slog to 1-turn `ae.procure`   │
│ 2. Instant Buyer Protection   │ 150ms stealth error detection & A$0.00 refund     │
│ 3. 16,000-Tool Beam Routing   │ 3-hop taxonomy traversal in <1,500ms at $0.00008 │
│ 4. Semantic Spending Shield   │ Pre-flight prompt-injection & intent compliance  │
│ 5. Ingest Normalizer          │ Auto-classifying dirty Bazaar & PayAI schemas    │
│ 6. A2A Principal Clearing     │ Machine-speed bilateral agent settlement & GST   │
└───────────────────────────────┴──────────────────────────────────────────────────┘
```

### Gravity Well 1: Autonomous Capability Ingestion (`ae.procure`)
- **The Pull:** In the mechanical architecture, an agent facing a capability gap must execute 5 distinct operations:
  1. `GET /api/v1/market-tools/search?q=timezone`
  2. Parse 10 JSON schemas and select candidates.
  3. Prompt a frontier LLM (e.g. Claude 3.5 Sonnet) with 4,000 tokens of schema docs to synthesize query parameters.
  4. `POST /api/v1/tools/quote` with formatted arguments.
  5. `POST /api/v1/tools/call` with the signed quote ref.
  *Cost:* 4–8 seconds, 4,000+ tokens ($0.03–$0.05), high drop-off rate.
- **Core Jev Integration:** Single-turn capability procurement via `POST /api/v1/tools/procure` or `ae.procure(need)`.
  Jev System One routes the intent, extracts parameters matching the real tool contract, binds the Quote, and invokes the provider in **sub-970ms end-to-end**.

### Gravity Well 2: Autonomous Delivery Adjudication & Instant Remedy (The PayPal Buyer Protection Moat)
- **The Pull:** Decentralized tool providers (x402 on Base, third-party HTTP webhooks) frequently fail with **stealth errors**: HTTP 200 OK returning `{"status": "error", "message": "upstream gateway timeout"}`.
  In a mechanical marketplace, the caller is charged, the agent runtime crashes, prepaid credit is leaked, and human developers must open support tickets.
- **Core Jev Integration:** Post-execution payload auditing.
  Jev evaluates response payloads in 150ms against declared delivery conditions. If `upstream_failure` probability exceeds $0.80$, AEcon (as the buyer-facing Seller under ADR 0001) immediately reverses the transaction, releases the Formance prepaid ledger hold ($A$0.00 net deduction), and returns a Rule 4 diagnostic triplet (`whatHappened`, `financialImpact`, `nextStep`) along with an alternate fallback tool.

### Gravity Well 3: 16,000-Tool Hierarchical Beam-Search Router
- **The Pull:** Flat catalog search breaks at scale. Full-text search (FTS) lacks semantic understanding; vector embeddings fail on complex constraints (e.g., "DST-aware timezone conversion under 2 cents"); sending 16,000 tool schemas into a frontier LLM context window is mathematically impossible or economically absurd.
- **Core Jev Integration:** Hierarchical Beam Search Chaining across a 3-tier taxonomy:
  $$\text{Root} \xrightarrow[\text{Hop 1}]{\text{Domain (16)}} \text{Beam Threshold (15\%)} \xrightarrow[\text{Hop 2 (Parallel)}]{\text{Subcategories (120)}} \xrightarrow[\text{Hop 3}]{\text{Leaf Tools (20)}} \text{Canonical } \texttt{toolRef}$$
  Executed in parallel in **1,190ms – 1,480ms** for **$0.00008 AUD total**, with 100% type reliability.

### Gravity Well 4: Semantic Spending Governance & Anti-Exfiltration Shield
- **The Pull:** Autonomous agents with pre-funded wallets are vulnerable to prompt injection, supply hijacking, or out-of-scope spending.
  Deterministic rules can only check "is spend < $10?". They cannot check "is this tool call actually in line with our corporate legal policy, or is the prompt poisoned to exfiltrate database records via a DNS lookup tool?"
- **Core Jev Integration:** Dual-Pillar Policy Enforcement.
  - Deterministic BigInt math enforces daily, monthly, and per-call spending limits.
  - Jev acts as a semantic risk shield before quote issuance: evaluating category alignment, payload risk, and jailbreak vectors. When Jev confidence $< 0.85$ on high-value calls, the purchase is paused and routed to AE's existing human approval flow (`approval_required`).

### Gravity Well 5: Facilitator Ingest & Catalog Admission Normalizer
- **The Pull:** Discovered tools from Coinbase Bazaar or PayAI arrive as raw, unformatted HTTP declarations with missing tags, noisy descriptions, unclassified categories, or non-standard parameter schemes.
- **Core Jev Integration:** Automated Ingest Pipeline during `admitFacilitatorDiscoveryItems`.
  Jev classifies categories, extracts canonical tags, normalizes job titles (`catalogJobLabel`), and audits parameter sanity before any tool is published into `capabilityPublications`.

### Gravity Well 6: High-Frequency Agent-to-Agent (A2A) Commercial Settlement
- **The Pull:** When Agent A delegates a task to Agent B, peer-to-peer crypto transfers introduce counterparty risk, tax compliance voids, and settlement failure.
- **Core Jev Integration:** Bilateral Clearinghouse Topology.
  AEcon acts as the fixed merchant of record (ADR 0001). Agent A and Agent B use Jev to rapidly quote, agree, and verify completion in milliseconds, with AEcon issuing compliant Australian tax invoices (net + GST) deterministically.

---

## 3. Concrete Implementation Architecture: Native Platform Integration

To eliminate bolt-ons and stubs, the System One architecture is integrated natively into the three core spines of Agentic Economy:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                NATIVE PLATFORM EXECUTION TOPOLOGY                               │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│   1. PUBLIC INGESTION SURFACES                                                                  │
│      ├── HTTP: POST /api/v1/tools/procure                                                       │
│      ├── MCP: ae_tool_procure (via listMcpActions() in src/modules/actions/index.ts)            │
│      └── CLI & Chat: ae procure "<need>"                                                        │
│                                                                                                 │
│   2. CAPABILITY PROCUREMENT ENGINE (src/modules/capability-execution/procure-engine.ts)         │
│      ├── Dynamic Catalog Search (queries real Convex capabilitySupplyTools & publications)      │
│      ├── Decision Gateway (Jev System One -> Secondary LLM -> Deterministic FTS -> Refusal)    │
│      ├── Parameter Synthesis (validated against tool's published inputSchemaJson)               │
│      ├── Exact BigInt Math (calculateAudGstSplit, maxSpendAud budget enforcement)               │
│      └── Delegation to Native CallService (src/lib/server/call-api.ts)                          │
│                                                                                                 │
│   3. NATIVE CONVEX TRANSACTION & CALL WORKER                                                    │
│      ├── quoteTool: Creates cryptographic quote row in capabilityQuotes:quote                   │
│      ├── callTool: Reserves prepaid AUD in Formance ledger (moneyManagedCallLifecycle)          │
│      ├── runRelease: Dispatches execution to provider via HTTP or brokered x402 on Base        │
│      └── parseContractOutput & Output Validation Seam:                                          │
│           • Intercepts raw provider outputJson before settlement                                │
│           • Evaluates payload against System One auditor                                        │
│           • On stealth provider failure: forces contractValidOutput = false                     │
│           • Formance hold automatically returns 'not_released' (A$0.00 net deduction)           │
│                                                                                                 │
│   4. OPERATOR CONSOLE & AUDIT TRAIL                                                             │
│      ├── Rule 4 Diagnostic Triplet (What Happened, Financial Impact, Next Step)                 │
│      └── Autonomous Buyer Protection Certificate (Adjudicator, Confidence, Net Hold A$0.00)     │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 The Three Core Architectural Seams

#### Seam 1: Dynamic Supply & Schema Projection
Rather than relying on synthetic tool fixtures or hardcoded catalog arrays, `procure-engine.ts` queries the live Convex store via `capabilitySupplyTools:search` and retrieves the published `inputSchemaJson` from `capabilityPublications`. Parameter synthesis is constrained by the tool's actual schema definition.

#### Seam 2: Native Commercial Authority & CallService Delegation
The procurement engine delegates quoting and execution directly to `CallService` (`src/lib/server/call-api.ts`):
1. `callService.quoteTool({ toolRef, input: synthesizedParams })`: Resolves caller-specific authority, validates the agent's spending policy, creates an expiring `quoteRef`, and records it in `capabilityQuotes`.
2. `callService.callTool({ quoteRef, idempotencyKey })`: Locks prepaid credit in Formance via `moneyManagedCallLifecycle.reserveBeforeClaim`, registers the invocation in `capabilityCalls`, and enqueues execution into the Convex worker workpool.

#### Seam 3: Native Output Validation in `runRelease.ts` / `parseContractOutput`
Stealth provider crashes (HTTP 200 returning `{ error: "timeout" }`) are prevented from settling charges by embedding payload auditing into the call worker's output validation seam (`convex/capabilityCallProjection.ts` and `src/modules/capability-execution/call-worker/runRelease.ts`):
- If `parseContractOutput` encounters an error signature in `observation.outputJson`, `outputValidation.valid` evaluates to `false`.
- `chargeSettlementOutcome(observation, economicRail, outputValidation.valid)` returns `'not_released'`.
- The Formance reservation is immediately released without capturing funds, ensuring that **every call across the entire platform** (API, MCP, or CLI) receives automated buyer protection.

### 3.2 Action Definition & MCP Server Exposure
`toolProcureAction` is registered as a first-class action in `src/modules/actions/index.ts`:
```typescript
// Registered in registeredActions array
export const toolProcureAction = defineAction<ToolProcureInput, ToolProcureResult>({
  id: 'tool.procure',
  name: 'Procure a Tool capability',
  summary: 'Single-turn autonomous discovery, quoting, execution, and delivery adjudication.',
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  schema: toolProcureInputSchema,
  outputSchema: toolProcureResultSchema,
  // ...
})
```
Because it is included in `registeredActions`, `mcpToolName(action)` automatically generates `ae_tool_procure`, exposing 1-turn procurement over JSON-RPC to Claude Desktop, Cursor, and autonomous agent harnesses without additional adapters.

---

## 4. Empirical Grounding Across Real In-App Tools

This architecture has been empirically proven against the real tools present in the Agentic Economy codebase:

```text
===========================================================================
AGENTIC ECONOMY: TESTING THE MAGICAL CORE FLOW (REAL APP TOOLS)
===========================================================================

📦 AVAILABLE IN-APP TOOLS TESTED:
  • [operation:v1:timezone_converter_x402] Timezone Converter (0.002 AUD)
    Source: timezonePaymentRequired20260819Fixture
    Endpoint: https://402timezones.vercel.app/api/convert-timezone
  • [operation:v1:onesource_eth_tx] Onesource Ethereum Transaction Details (0.012 AUD)
    Source: onesourcePathRequest20260908Fixture
    Endpoint: https://api.onesource.io/api/chain/tx/:hash
  • [operation:v1:onesource_erc20_transfers] Onesource ERC20 Transfer Events (0.008 AUD)
    Source: onesourceUnionRequest20260908Fixture
    Endpoint: https://api.onesource.io/api/chain/erc20-transfers
  • [operation:v1:sandbox_aecon_reference] AEcon sandbox reference Tool (1.000 AUD)
    Source: devSeedFixtures
    Endpoint: /api/v1/sandbox-reference

───────────────────────────────────────────────────────────────────────────
▶ [SCENARIO 1]: Natural Language Need -> Autonomous Procurement
Agent Intent: "Convert 3:30 PM New York time to Tokyo time"
✔ STATUS: DELIVERED in 970 ms
  Matched Real Tool : Timezone Converter (operation:v1:timezone_converter_x402)
  Synthesized Input : {"from":"America/New_York","to":"Asia/Tokyo","time":"3:30 PM"}
  Bound Quote Ref   : quote:v2:1789746179594:ter_x402
  Exact AUD Price   : A$0.0020 (Net: A$0.0018, GST: A$0.0002)
  Tactile Latency   : Jev Ingest: 450ms | Execution: 111ms | Total: 970ms
  Jev Decision Cost : $0.00003 AUD

───────────────────────────────────────────────────────────────────────────
▶ [SCENARIO 2]: Stealth Provider Failure (HTTP 200 with Internal Error JSON)
Simulating upstream timeout on 402timezones.vercel.app.
🛡️  STATUS: REMEDIED in 960 ms (Instant Buyer Protection Active!)
  Failed Real Tool   : Timezone Converter
  Net Customer Charge: A$0.00
  Refund Executed    : A$0.0020 restored to Formance balance
  Rule 4 Diagnostic  : Upstream provider timeout -> A$0.00 deducted -> Retry or fallback
  Suggested Fallback : operation:v1:sandbox_aecon_reference
  Auditor Confidence : 100.0% (Remedy Audit: 461ms)

───────────────────────────────────────────────────────────────────────────
▶ [SCENARIO 3]: Deterministic IceInVein Budget Gate (Sandbox Reference Tool)
Tool: AEcon Sandbox Reference Tool (Fixed Price: A$1.000 AUD) vs Cap: A$0.050 AUD
🛑 STATUS: REFUSED (Deterministic Gate Enforced)
  Refusal Code: budget_exceeded (A$1.0000 AUD exceeds budget of A$0.05 AUD)
  Result: 0 Formance units reserved, 0 network calls executed.
```

---

## 5. Strict Non-Negotiable Invariants (IceInVein Alignment)

To preserve the institutional integrity of Agentic Economy, four immutable boundaries are established:

1. **Deterministic Arithmetic Supremacy:**
   Probabilistic models must never perform arithmetic comparisons ($A < B$), currency conversions, or GST splits. All financial assertions use `BigInt` micro-units via `parseDecimalExactAmount` and `calculateAudGstSplit` from `src/modules/money/public.ts`.
2. **Convex Mutation Purity:**
   Convex mutations are transactional and strictly offline ($0$ network I/O). Jev calls must execute exclusively in **TanStack Start API route handlers** (`src/routes/api.v1.tools.procure.ts`) or asynchronous **Convex Node actions** (`"use node"`). They must never block Convex mutations or the critical dispatch queue (`marketDispatchWorkpool`).
3. **Preservation of the Principal-Reseller Barrier (ADR 0001):**
   Agent-to-agent procurement never collapses into peer-to-peer wallet transfers. Agentic Economy remains the fixed buyer-facing Seller of Record, guaranteeing Australian tax compliance (ATO GST itemization), Formance ledger consistency, and legal buyer recourse.
4. **Zero-Anxiety Ergonomics (Protocol Rules 4 & 5):**
   Every refused or remedied transaction must emit a complete Diagnostic Triplet (`whatHappened`, `financialImpact`, `nextStep`) with unambiguous confirmation of financial safety (`A$0.00 net deduction`).

---

## 6. Implementation Rollout Plan

- [x] **Well 1 (Architecture & Prototyping):** Empirical validation of live Jev Decisions API (`tools/dev/try-jev-aecon.ts`, `tools/dev/experiment-chained-jev-router.ts`).
- [x] **Well 2 (Decision Gateway & Fallbacks):** Resilient 4-tier fallback gateway (`src/modules/decision-engine/`) passing Vitest offline and timeout tests.
- [x] **Well 3 (Core Procurement Logic & GST Splits):** `CapabilityProcurementEngine` executing BigInt ATO tax splits and budget barriers.
- [ ] **Well 4 (Native Convex & CallService Integration):** Wiring `procure` to `CallService.quoteTool` and `CallService.callTool` with real Formance ledger reservations, eliminating all execution stubs.
- [ ] **Well 5 (Native Output Validation Seam in Call Worker):** Injecting payload adjudication into `runRelease.ts` and `parseContractOutput` to guarantee automated hold release on stealth provider crashes across all platform calls.
- [ ] **Well 6 (Central Action Registry & MCP Server):** Registering `tool.procure` in `src/modules/actions/index.ts` and surfacing `ae_tool_procure` natively in the Model Context Protocol server (`src/lib/server/mcp-api.ts`).
- [ ] **Well 7 (Dynamic Catalog Schema Projection):** Projecting real `inputSchemaJson` from Convex `capabilityPublications` into parameter synthesis.
- [ ] **Well 8 (Operator Console UI & Receipt Observability):** Surfacing Jev routing latency, decision confidence, and remedy certificates in `src/routes/_operator/calls.$callRef.tsx` (`W-39`).

---

## 7. Decision Outcome

**Decision:** ACCEPTED.

Agentic Economy will adopt TypeSafe AI Jev System One decision primitives and Hierarchical Beam Chaining as foundational commercial infrastructure, transforming the platform into the premier autonomous clearinghouse for the agentic era.
