# System One & Autonomous Capability Procurement: Operating Protocol

**Date:** 19 September 2026  
**Status:** Approved Master Protocol & Execution Reference  
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/adr/0002-jev-system-one-opportunity-statement.md`, `docs/operations/system-one-maturity-register.md`, `docs/operations/user-and-org-maturity-protocol.md`, `docs/operations/user-and-org-ergonomics-protocol.md`

---

## 1. Executive Purpose & Anti-Compaction Memory Anchor

This document is the **immutable operating manual** for executing and hardening System One Intelligence, Chained Decisions, and Autonomous Capability Procurement across the Agentic Economy platform.

When context windows compact or subagents are dispatched, **always read this file first** to restore exact operational alignment.

### The Canonical North Star
> **"An autonomous agent can describe a natural language capability need, have it resolved, quoted, executed, and adjudicated in sub-second time, with cryptographic ledger holds, exact Australian GST itemization, and instantaneous autonomous buyer protection if the upstream provider fails."**

### Inviolable Product & Architectural Boundaries
Never collapse or compromise these boundaries:
1. **Probabilistic Routing is NOT Deterministic Authority:** Jev and LLMs select candidates and diagnose errors; they *never* bypass caller scopes (`market_tools:call`), mint credentials, or calculate ledger amounts.
2. **Financial Calculations are Strictly BigInt:** ATO tax splits (10% GST) and spending budgets are evaluated using `calculateAudGstSplit` and `compareExactAmounts` on integer micro-cents (`1000000 = $1.000000 AUD`). Floating-point arithmetic in financial pathways is forbidden.
3. **Ledger Reservations Precede External Transport:** Prepaid funds are reserved in the Formance double-entry ledger before network requests are dispatched to providers.
4. **Autonomous Remedy Invalidates Before Settlement:** When an upstream provider crashes or returns a stealth error (HTTP 200 with error payload), payload adjudication occurs *before* settlement. The hold is marked `not_released` and returned to the buyer ($A$0.00 net deduction).
5. **Zero Synthetic Stubs in Production:** Live traffic routes exclusively through Convex database queries (`capabilitySupplyTools:search`), published schemas (`capabilityPublications`), and `CallService` (`quoteTool` & `callTool`).

---

## 2. Inverse Premortem: The Architecture of Inevitable Success

An **Inverse Premortem (The Success Blueprint)** asks:
> *"It is six months from now. Agentic Economy's System One procurement and autonomous remedy platform processes millions of calls daily with 99.999% ledger accuracy, zero funds leaked to failing providers, sub-900ms latency, and praise from enterprise developers. Exactly what structural defenses, invariants, and architectural barriers caused that success?"*

### The 7 Structural Pillars of System One Durability

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      THE 7 INVERSE PREMORTEM PILLARS                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Zero-Stub Native Spine: All execution delegates to native CallService and     │
│    Formance ledger reservations. Stubs and fixtures are banned from production. │
│ 2. Dual-Pillar Policy Enforcement: Deterministic spending limits enforce hard   │
│    caps; System One semantic shields evaluate intent alignment and exfiltration.│
│ 3. 4-Tier Resilient Fallback Gateway: Jev -> Secondary LLM -> Deterministic     │
│    FTS Rule Engine -> Safe Refusal. Platform never throws unhandled 500s.       │
│ 4. Pre-Settlement Output Adjudication: Payload auditing occurs inside the call   │
│    worker before ledger capture. Stealth HTTP 200 provider crashes are trapped. │
│ 5. ATO Australian Tax Invariance: Every quote and delivery itemizes 10% GST     │
│    using integer BigInt math. Net + GST = Total with zero rounding drift.       │
│ 6. Fast-Path Pre-Filtering: Non-suspicious responses bypass AI audit in <1ms,   │
│    preserving latency and zero unnecessary token expenditures on clean calls.   │
│ 7. Single Action Surface Identity: tool.procure is registered once in central   │
│    registry, projecting identically across HTTP, MCP (ae_tool_procure), & CLI.  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 4-Tier Delegation Strategy (Zero-Handroll Directive)

Every System One workflow must adhere to the 4-tier delegation strategy:

1. **Tier 1: Specialized Calibrated Models (TypeSafe AI Jev)**
   - Use TypeSafe Jev via OpenRouter Decisions API (`/api/alpha/decisions`) for high-speed, calibrated classification, routing, and binary propositions (`noul`).
   - Exploit speculative fan-out to batch questions in a single 150ms roundtrip.
2. **Tier 2: Frontier LLM Fallback (Secondary Adapter)**
   - When Jev is unreachable or rate-limited, fall back to general-purpose instruction models (e.g. Gemini 2.5 Flash / Claude 3.5 Sonnet) requesting strict JSON outputs matching the Jev answer schema.
3. **Tier 3: Air-Gapped Deterministic Rule Engine**
   - When all external AI APIs are degraded or offline, execute token-based heuristic matching and keyword diagnostics. Never stall production when internet boundaries drop.
4. **Tier 4: Proprietary Core Code (AE-Owned)**
   - Write custom code *exclusively* for AE domain logic: Formance ledger reservations, Australian GST math, caller credential admission, and central action dispatch.

---

## 4. The 5 Inviolable IceInVein Craft & Financial Invariants

### Invariant 1: Deterministic Math Barrier
- All currency operations use `ExactAmount` with 6 decimal places (`exponent: 6`).
- GST is calculated via `calculateAudGstSplit(totalUnits, 1000)` where 1000 represents 10.0% ATO GST.
- Never use `Math.round()` or floating numbers for billing.

### Invariant 2: Authority Before Execution
- Every request on HTTP (`/api/v1/tools/procure`) or MCP (`ae_tool_procure`) requires an authenticated `AgentAccessPrincipal` carrying the `market_tools:call` scope.
- Unauthenticated requests must return `401 Unauthorized` with a `WWW-Authenticate: Bearer` challenge.

### Invariant 3: Anti-Leakage Hold Invalidation
- If provider output is adjudicated as an upstream fault with confidence $\ge 0.75$, `outputValidation.valid` evaluates to `false`.
- Formance hold automatically returns `not_released`, ensuring $A$0.00 net deduction from buyer balances.

### Invariant 4: Actionable Diagnostic Triplet (No Raw Errors)
- Every remedied failure must return the Rule 4 Diagnostic Triplet:
  1. **What happened:** Plain-English explanation of the provider fault.
  2. **Financial impact:** Explicit statement of credit safety (e.g., *"A$0.00 deducted — A$X.XX refunded immediately to available balance"*).
  3. **Next step:** Concrete diagnostic suggestion or alternative tool candidate.

### Invariant 5: Dependency Cruiser Ratchet Ceiling (0 Circular Imports)
- `no-circular` ceiling is **0**.
- Leaf contracts remain quarantined in `procure.ts`; engines in `procure-engine.ts`; actions in `procure.actions.ts`.
- Every pull request and wave completion must pass `npm run deps:check`.

---

## 5. The 4-Phase Subagent Protocol

Every task or wave cluster in the register must traverse these 4 phases sequentially:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   THE 4-PHASE SUBAGENT PROTOCOL                        │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Seam Discovery & Contract Specification (Grok Subagent)     │
│    └─ Model: cursor-grok-4.6-high-fast                                 │
│    └─ Characterize existing Convex tables, actions, and API boundaries │
│    └─ Produce IceInVein Contract (Needs, Offers, Touches, Invariants)  │
│    └─ Constraint: Does not edit production source files                │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Red-Test-First & Bounded Implementation (Composer Subagent)  │
│    └─ Model: composer-2.5                                              │
│    └─ Write red unit/integration tests establishing the contract       │
│    └─ Implement minimal clean code satisfying the contract             │
│    └─ Turn tests green; enforce exactOptionalPropertyTypes & oxlint    │
│    └─ Constraint: Strictly bounded to assigned files; no unapproved deps│
├────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Adversarial Penetration & Financial Audit (Auditor Subagent) │
│    └─ Model: claude-opus-5-thinking-high / IceInVein Inspector         │
│    └─ Inject stealth timeouts, malformed JSON, and budget overruns     │
│    └─ Verify Formance ledger balance preservation and hold release     │
│    └─ Verify zero circular imports and zero memory leaks               │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Cold Review & Quality Gate Enforcement (Orchestrator Parent) │
│    └─ Run vitest across affected and full regression test suites       │
│    └─ Run oxlint, tsc --noEmit, and npm run deps:check                 │
│    └─ Update operational status in docs/operations/system-one-...-reg  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Curated Architectural Reference Library

When launching Phase 1 for any workflow, consult these specific codebase files:

### A. Decision Engine & Fallbacks
- `src/modules/decision-engine/contracts.ts`: Contracts for `JevQuestion`, `JevAnswer`, `DecisionGatewayRequest`.
- `src/modules/decision-engine/decision-gateway.ts`: 4-tier fallback orchestration.
- `src/modules/decision-engine/jev-client.ts`: Live OpenRouter Decisions API client.

### B. Procurement & Quoting Engine
- `src/modules/capability-execution/procure-engine.ts`: Core procurement engine with CallService delegation.
- `src/modules/capability-execution/procure.ts`: Leaf Zod schemas and TypeScript types.
- `src/modules/capability-execution/procure.actions.ts`: First-class action definition and route contract.

### C. Native Call Worker & Settlement
- `src/modules/capability-execution/call-worker/output-adjudication.ts`: Payload adjudication seam.
- `src/modules/capability-execution/call-worker/runRelease.ts`: Convex call worker release pipeline.
- `src/modules/capability-execution/call-worker/brokeredX402.ts`: Managed x402 transport and settlement.
- `convex/capabilityCallWorker.ts`: Convex action handlers and workpool workers.

### D. Central Action Registry & MCP
- `src/modules/actions/index.ts`: Central action catalog and MCP exposure.
- `src/lib/server/mcp-api.ts`: Model Context Protocol host adapter.
- `src/lib/server/procure-api.ts`: HTTP route handler with authentication and rate limiting.

---

## 7. Mandatory Verification Gates

Before any workflow item is marked `VERIFIED`, the Orchestrator must execute and log:

```bash
# 1. Typecheck & Linter
npx oxlint src/modules/capability-execution/ src/modules/decision-engine/ src/lib/server/
npx tsc --noEmit

# 2. Dependency Ratchet Check (Must show 0 circular dependencies)
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check

# 3. Unit & Integration Test Suite
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/core-flow/ tests/unit/decision-engine/ tests/unit/call-worker/ tests/unit/server/
```
