# Code Quality Campaign 3: Funding/payment façades — Operational Register

**Date:** 21 September 2026  
**Status:** OPEN — Wave 1 **VERIFIED**. Waves 2–3 unstaffed. Campaign 2 remains **CLOSED**.  
**Unified tree:** `main` at Phase 0 commit `de8bd68ab` (A01 closed; Jev/procure cutover reconciled). Wave 1 extracts: `e86184cd2` (CQ3-01) + this batch (CQ3-02/03).  
**Operating Protocol:** `docs/operations/code-quality-maturity-protocol.md` (same 5-stage Grok → Composer → Orchestrator lifecycle; IDs `CQ3-*`)  
**Intake evidence:** `docs/operations/code-quality-amendment-register.md` (A01–A15). This file is the assignment surface.  
**Predecessor:** `docs/operations/code-quality-ceiling-register.md` (Campaign 2 CLOSED)

**Thesis:** Restore the Convex façade invariant on the funding/payment cluster the alpha merge put on `main`, without changing canary, payment, or market behaviour. Quality follow-through, not a market-journey campaign.

**Wave 1 success metric (met):** funding façade **114** (<200); preflight façade **107** (<200); payment façade **153** (<200); every extracted helper **< 400**; canary payment authorization calls `prepareX402PaymentAuthorizationHandler` **in-process** (no second mutation). RPC names unchanged. A01 and canary/payment tests remain green.

---

## 1. Progress & Census Scorecard

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Funding/payment façades** | A02–A04 | `CQ3-01` – `CQ3-03` | 3 | 0 | 0 | `VERIFIED` |
| **Wave 2: Inherited Convex cohesion** | A05, A06, A08, A09 | unstaffed | — | — | — | not opened |
| **Wave 3: Wave 3 residue** | A11–A13 | unstaffed | — | — | — | not opened |
| **Total** | Campaign 3 | **3 named** | **3** | **0** | **0** | `OPEN` (Wave 1 closed) |

### Do not touch (standing)

- Operator-route controllers closed in Campaign 2 (38–75 lines)
- `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` (A10 / **1,041** — recorded deferral)
- `convex/capabilityCallProjection.ts` (A07 / CQ-25 PARKED)
- `src/routeTree.gen.ts` — do not add or rename routes
- React Doctor warning cleanup; complexity ratchet raises
- Jev/procure beyond import-path updates forced by A02 façade re-exports
- Hosted AM-25 proof

### Layout convention (Convex)

Root `convex/<name>.ts` stays the RPC façade (**< 200**). Logic moves to `convex/lib/<domain>/` (**< 400** each). Never `convex/<name>/` — that breaks `api.<name>.<method>`. Campaign 2 established this; do not revisit.

**Atomicity:** do not split one mutation into several mutation calls to shrink a file. Provision/rotate and payment authorize/reserve stay one transaction each.

### Gates

Lint, `tsc --noEmit`, `deps:check` 0/0/0, targeted + funding/payment regression tests, RPC kind snapshot **without** fixture regen unless a function kind actually changes. The old 7 concurrent procure/boundary failures are **closed** at `de8bd68ab`; reintroducing them fails the wave.

---

# Wave 1: Funding/payment façades

| ID | Amendment | File | Lines | Incision | Size | Status |
| :--- | :--- | :--- | ---: | :--- | :---: | :--- |
| **CQ3-01** | A02 | `convex/capabilitySupplyCanaryFunding.ts` | 114 (was 980) | Reuse `convex/lib/capabilitySupply/canaryFundingConstants.ts`. Extract grant policy/identity/exact-material, atomic provision+rotate handlers, durable grant/readiness reads, custody/RPC parsing. Façade keeps the five RPC exports and re-exports consumed by payment attempts. | L | `VERIFIED` |
| **CQ3-02** | A03 | `convex/capabilitySupplyCanaryFundingPreflight.ts` | 107 (was 460) | `"use node"`. CDP adapter stays on the façade; readiness inspection + USDC balance reader moved to `convex/lib/capabilitySupply/canaryFundingPreflight*`. Result/error codes preserved. | M | `VERIFIED` |
| **CQ3-03** | A04 | `convex/moneyX402PaymentAttempts.ts` | 153 (was 271) | Canary prepare handler moved to `convex/lib/x402PaymentAttemptCanary.ts`. Authorization and reservation writes stay in the **same** mutation via in-process `prepareX402PaymentAuthorizationHandler`. | M | `VERIFIED` |

### CQ3-01 — A02 production/sandbox canary funding

- **Surfaces:** `convex/capabilitySupplyCanaryFunding.ts`; existing `convex/lib/capabilitySupply/canaryFundingConstants.ts`
- **RPC to preserve:** `readExactSellerOnboardingCanaryPlatformGrant`, `provisionProductionSellerOnboardingCanaryFunding`, `provisionSellerOnboardingCanaryFunding`, `readSellerOnboardingCanaryFundingReadiness`, `readProductionSellerOnboardingCanaryFundingReadiness`
- **Façade re-exports to preserve:** constants and `readExactSellerOnboardingCanaryPlatformGrantHandler` consumed by `convex/moneyX402PaymentAttempts.ts` and tests
- **Status:** `VERIFIED`
- **Commit:** `e86184cd2`
- **Subagent Assignment:** Grok (Spec: `5d61076c-504c-41f5-a753-4d023a748656`) → Composer (Implement: `d0d84431-c38c-45f6-9f82-bdfe5392fbec`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** façade 114; `canaryFundingIdentity.ts` 278; `canaryFundingProvision.ts` 249; `canaryFundingReads.ts` 331; `canaryFundingCustody.ts` 48; `canaryFundingValues.ts` 151; `canaryFundingConstants.ts` 21
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; 104 tests in 3 files (readiness, payment-attempts, API-kind snapshot)

### CQ3-02 — A03 CDP preflight Node action

- **Surfaces:** `convex/capabilitySupplyCanaryFundingPreflight.ts`
- **RPC to preserve:** `readSellerOnboardingCanaryCdpReadiness`
- **Façade re-exports to preserve:** `readCdpUsdcBalance`, `CdpUsdcBalanceReader`, `CdpUsdcNetwork`, preflight result/code/dependency types (treasury observation + tests keep façade import paths)
- **Status:** `VERIFIED`
- **Commit:** this Wave 1 close batch
- **Subagent Assignment:** Grok (Spec: `928209d3-2f42-424c-8199-ab05d9f77d75`) → Composer (Implement: `ebd8c107-cbc6-4c1a-b593-4aa1b082babd`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** façade 107; `canaryFundingPreflightInspect.ts` 343; `canaryFundingPreflightBalance.ts` 91
- **Accepted deviation:** inspect helper carries `"use node"` so `@/modules/capability-supply` Node-side imports stay out of default Convex runtime. CDP SDK remains only on the façade. Funding is reached only via `internal.capabilitySupplyCanaryFunding.read*`.
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; Wave 1 close suite 125/125 (preflight, treasury-observation, node-only-modules, payment-attempts, A01 readiness, API-kind snapshot)

### CQ3-03 — A04 canary payment authorization

- **Surfaces:** `convex/moneyX402PaymentAttempts.ts`; sibling `convex/lib/x402PaymentAttemptCanary.ts` (did not grow `x402PaymentAttempt.ts`)
- **RPC to preserve:** `prepareSellerOnboardingCanaryPaymentAuthorization` (and the existing payment-attempt RPC wrap set)
- **Status:** `VERIFIED`
- **Commit:** this Wave 1 close batch
- **Subagent Assignment:** Grok (Spec: `b59e8f79-bdc2-4351-99b5-6b0145d2e4c4`) → Composer (Implement: `990441b6-b6a2-45a2-ac3a-bebb3b9aab87`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** façade 153; `x402PaymentAttemptCanary.ts` 132; `x402PaymentAttempt.ts` unchanged
- **Atomicity:** canary handler calls `prepareX402PaymentAuthorizationHandler(ctx, …)` in-process. No `ctx.runMutation`. Grant reader imported from the funding façade, not `canaryFundingReads.ts`.
- **Gates:** same Wave 1 close suite as CQ3-02 (125/125)

### Wave 1 close measurements (21 September 2026)

| File | Lines | Ceiling |
| :--- | ---: | :--- |
| `convex/capabilitySupplyCanaryFunding.ts` | 114 | façade <200 |
| `convex/capabilitySupplyCanaryFundingPreflight.ts` | 107 | façade <200 |
| `convex/moneyX402PaymentAttempts.ts` | 153 | façade <200 |
| `convex/lib/capabilitySupply/canaryFundingReads.ts` | 331 | helper <400 |
| `convex/lib/capabilitySupply/canaryFundingPreflightInspect.ts` | 343 | helper <400 |
| remaining `canaryFunding*` / `x402PaymentAttemptCanary.ts` | 21–278 | helper <400 |

RPC kind snapshot unchanged. No `convex/<name>/` directories created.

---

## Recorded deferrals (not Wave 1)

| ID | File | Measurement | Owner |
| :--- | :--- | ---: | :--- |
| A07 / CQ-25 | `convex/capabilityCallProjection.ts` | 873 | PARKED — call-worker design dependency |
| A10 | `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` | **1,041** | Campaign 2 Wave 1 deferral; measurement updated from historical 1,038 |
