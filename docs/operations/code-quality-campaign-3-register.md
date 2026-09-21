# Code Quality Campaign 3: Funding/payment façades — Operational Register

**Date:** 21 September 2026  
**Status:** OPEN — Wave 1 staffed (`CQ3-01`–`CQ3-03` READY). Campaign 2 remains **CLOSED**.  
**Unified tree:** `main` at Phase 0 commit `de8bd68ab` (A01 closed; Jev/procure cutover reconciled).  
**Operating Protocol:** `docs/operations/code-quality-maturity-protocol.md` (same 5-stage Grok → Composer → Orchestrator lifecycle; IDs `CQ3-*`)  
**Intake evidence:** `docs/operations/code-quality-amendment-register.md` (A01–A15). This file is the assignment surface.  
**Predecessor:** `docs/operations/code-quality-ceiling-register.md` (Campaign 2 CLOSED)

**Thesis:** Restore the Convex façade invariant on the funding/payment cluster the alpha merge put on `main`, without changing canary, payment, or market behaviour. Quality follow-through, not a market-journey campaign.

**Wave 1 success metric:** `convex/capabilitySupplyCanaryFunding.ts` façade **< 200** lines; extracted helpers **< 400**; `capabilitySupplyCanaryFundingPreflight.ts` is a thin Node action façade; canary payment authorization stays in the existing payment-attempt helper family **in the same mutation**. RPC names unchanged. A01 and canary/payment tests remain green.

---

## 1. Progress & Census Scorecard

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Funding/payment façades** | A02–A04 | `CQ3-01` – `CQ3-03` | 0 | 0 | 3 | `READY` |
| **Wave 2: Inherited Convex cohesion** | A05, A06, A08, A09 | unstaffed | — | — | — | not opened |
| **Wave 3: Wave 3 residue** | A11–A13 | unstaffed | — | — | — | not opened |
| **Total** | Campaign 3 Wave 1 | **3 named** | **0** | **0** | **3** | `OPEN` |

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
| **CQ3-01** | A02 | `convex/capabilitySupplyCanaryFunding.ts` | 980 | Reuse `convex/lib/capabilitySupply/canaryFundingConstants.ts`. Extract grant policy/identity/exact-material, atomic provision+rotate handlers, durable grant/readiness reads, custody/RPC parsing. Façade keeps the five RPC exports and re-exports consumed by payment attempts. | L | `READY` |
| **CQ3-02** | A03 | `convex/capabilitySupplyCanaryFundingPreflight.ts` | 460 | `"use node"`. Separate CDP adapter and readiness inspection from the thin Node action façade. Preserve result/error codes. Staff after CQ3-01 façade exports are stable. | M | `READY` (blocked on CQ3-01) |
| **CQ3-03** | A04 | `convex/moneyX402PaymentAttempts.ts` | 271 | Move `prepareSellerOnboardingCanaryPaymentAuthorization` into `convex/lib/x402PaymentAttempt*`. Authorization and reservation writes stay in the **same** mutation. Staff after CQ3-01. | M | `READY` (blocked on CQ3-01) |

### CQ3-01 — A02 production/sandbox canary funding

- **Surfaces:** `convex/capabilitySupplyCanaryFunding.ts`; existing `convex/lib/capabilitySupply/canaryFundingConstants.ts`
- **RPC to preserve:** `readExactSellerOnboardingCanaryPlatformGrant`, `provisionProductionSellerOnboardingCanaryFunding`, `provisionSellerOnboardingCanaryFunding`, `readSellerOnboardingCanaryFundingReadiness`, `readProductionSellerOnboardingCanaryFundingReadiness`
- **Façade re-exports to preserve:** constants and `readExactSellerOnboardingCanaryPlatformGrantHandler` consumed by `convex/moneyX402PaymentAttempts.ts` and tests
- **Status:** `READY`

### CQ3-02 — A03 CDP preflight Node action

- **Surfaces:** `convex/capabilitySupplyCanaryFundingPreflight.ts`
- **Status:** `READY` (implement after CQ3-01)

### CQ3-03 — A04 canary payment authorization

- **Surfaces:** `convex/moneyX402PaymentAttempts.ts`, `convex/lib/x402PaymentAttempt.ts`
- **Status:** `READY` (implement after CQ3-01)

---

## Recorded deferrals (not Wave 1)

| ID | File | Measurement | Owner |
| :--- | :--- | ---: | :--- |
| A07 / CQ-25 | `convex/capabilityCallProjection.ts` | 873 | PARKED — call-worker design dependency |
| A10 | `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` | **1,041** | Campaign 2 Wave 1 deferral; measurement updated from historical 1,038 |
