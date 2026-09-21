# Code Quality Campaign 3: Funding/payment façades — Operational Register

**Date:** 21 September 2026  
**Status:** **CLOSED** — Waves 1–3 **VERIFIED**. A07 / CQ-25 and A10 remain recorded deferrals. A14/A15 unclaimed. Campaign 2 remains **CLOSED**.  
**Unified tree:** `main` at Phase 0 commit `de8bd68ab`. Wave 1: `e86184cd2` + `942029008`. Wave 2: `7db24dbbd` + `176948beb` + `ba8e04661`. Wave 3: `6af2a4966`. §5 docs: `da44c1dd1`.  
**Operating Protocol:** `docs/operations/code-quality-maturity-protocol.md` (same 5-stage Grok → Composer → Orchestrator lifecycle; IDs `CQ3-*`)  
**Intake evidence:** `docs/operations/code-quality-amendment-register.md` (A01–A15). This file is the assignment surface.  
**Predecessor:** `docs/operations/code-quality-ceiling-register.md` (Campaign 2 CLOSED)

**Thesis:** Restore the Convex façade/helper invariant on Journey 4 machinery (funding, owner canary, owner supply, staging, probes) without changing canary, payment, staging, readiness, or probe semantics. Quality follow-through, not a market-journey campaign.

**Wave 1 success metric (met):** funding façade **114** (<200); preflight façade **107** (<200); payment façade **153** (<200); every extracted helper **< 400**; canary payment authorization calls `prepareX402PaymentAuthorizationHandler` **in-process** (no second mutation). RPC names unchanged. A01 and canary/payment tests remain green.

**Wave 2 success metric (met):** owner-canary façade **36**; owner-supply façade **35**; staging re-export **2**; probes root **188** with thinness wrappers; extracted helpers <400; admission and probe writes stay one mutation each; authority reads stay query-safe.

**Wave 3 success metric (met):** search types moved out of TSX; A12 seven accepted EXCEPTIONS (no manufactured tests); A13 skeleton N/A for privacy/terms/help. Routes: sign-in 26, sign-up 26, `$slug` 62.

---

## 1. Progress & Census Scorecard

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Funding/payment façades** | A02–A04 | `CQ3-01` – `CQ3-03` | 3 | 0 | 0 | `VERIFIED` |
| **Wave 2: Inherited Convex cohesion** | A05, A06, A08, A09 | `CQ3-04` – `CQ3-07` | 4 | 0 | 0 | `VERIFIED` |
| **Wave 3: Wave 3 residue** | A11–A13 | `CQ3-08` – `CQ3-10` | 3 | 0 | 0 | `VERIFIED` |
| **Total** | Campaign 3 | **10 named** | **10** | **0** | **0** | `CLOSED` |

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
- **Commit:** `942029008`
- **Subagent Assignment:** Grok (Spec: `928209d3-2f42-424c-8199-ab05d9f77d75`) → Composer (Implement: `ebd8c107-cbc6-4c1a-b593-4aa1b082babd`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** façade 107; `canaryFundingPreflightInspect.ts` 343; `canaryFundingPreflightBalance.ts` 91
- **Accepted deviation:** inspect helper carries `"use node"` so `@/modules/capability-supply` Node-side imports stay out of default Convex runtime. CDP SDK remains only on the façade. Funding is reached only via `internal.capabilitySupplyCanaryFunding.read*`.
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; Wave 1 close suite 125/125 (preflight, treasury-observation, node-only-modules, payment-attempts, A01 readiness, API-kind snapshot)

### CQ3-03 — A04 canary payment authorization

- **Surfaces:** `convex/moneyX402PaymentAttempts.ts`; sibling `convex/lib/x402PaymentAttemptCanary.ts` (did not grow `x402PaymentAttempt.ts`)
- **RPC to preserve:** `prepareSellerOnboardingCanaryPaymentAuthorization` (and the existing payment-attempt RPC wrap set)
- **Status:** `VERIFIED`
- **Commit:** `942029008`
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

# Wave 2: Inherited Convex cohesion

| ID | Amendment | File | Lines | Incision | Size | Status |
| :--- | :--- | :--- | ---: | :--- | :---: | :--- |
| **CQ3-04** | A05 | `convex/capabilitySupplyOwnerCanary.ts` | 36 (was 640) | Identity/commitment validation, atomic admission handler, evidence reader → `convex/lib/capabilitySupply/ownerCanary*`. Façade keeps the three RPCs. Grant reads via funding façade. Admission stays one mutation. | L | `VERIFIED` |
| **CQ3-05** | A06 | `convex/capabilitySupplyOwnerSupply.ts` | 35 (was 330) | `"use node"`. Extract readiness/test orchestration. Keep action names and thinness strings (`internal.capabilitySupplyReadiness.probe`; no `observeCapabilityReadiness`). | M | `VERIFIED` |
| **CQ3-06** | A08 | `convex/capabilitySupplyOwnerStaging.ts` | 2 (was 589) | Helper (0 RPC). Split normalization / exact-publication reuse / staging orchestration. Root file becomes re-exports. `capabilitySupply.stageOwnerX402Capability` stays on the host. | M | `VERIFIED` |
| **CQ3-07** | A09 | `convex/capabilitySupplyProbes.ts` | 188 (was 909) | Helper (0 RPC). Split authority (query-safe), target reads, observation writes, scheduling. Root keeps thinness-asserted wrappers. CQS: `record*` / `scheduleDue*` stay mutations. | L | `VERIFIED` |

### CQ3-04 — A05 owner canary admission

- **Surfaces:** `convex/capabilitySupplyOwnerCanary.ts`
- **RPC to preserve:** `requestSellerOnboardingCanary`, `requestSellerOnboardingCanaryForAdmittedPublication`, `readSellerOnboardingCanaryEvidence`
- **Status:** `VERIFIED`
- **Commit:** `7db24dbbd`
- **Subagent Assignment:** Grok (Spec: `3eead20a-730d-4f26-ac93-620280d0bf9c`) → Composer (Implement: `226d70c6-2a3b-457f-a75d-8fd685208a7b`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** façade 36; `ownerCanaryAdmission.ts` 365; `ownerCanaryIdentity.ts` 168; `ownerCanaryValues.ts` 82; `ownerCanaryEvidence.ts` 31
- **Atomicity:** `requestSellerOnboardingCanaryWithOwner` remains one in-process function. Grant reads via funding façade.
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; 34 tests in 5 files (interactive-consequence, A01 readiness, graph-probe-thinness, readiness-authority, API-kind snapshot)

### CQ3-05 — A06 owner supply Node actions

- **Surfaces:** `convex/capabilitySupplyOwnerSupply.ts`
- **RPC to preserve:** `runOwnerSupplyReadiness`, `runOwnerSupplyTest`
- **Status:** `VERIFIED`
- **Commit:** `176948beb`
- **Subagent Assignment:** Grok (Spec: `3f480867-b527-4d32-a4aa-e029ac23af64`) → Composer (Implement: `3c7b8b89-b740-4460-898b-b7f8b4ac6da2`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** façade 35; `ownerSupplyActions.ts` 216; `ownerSupplyContext.ts` 86; `ownerSupplyValues.ts` 70
- **Thinness:** root still contains `internal.capabilitySupplyReadiness.probe`; no `observeCapabilityReadiness`. Canary via generated API.
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; 46 tests in 9 files (interactive-consequence, thinness, readiness-authority, A01, sandbox-staging, funnel-publish, funnel-run-test, API-kind, node-only)

### CQ3-06 — A08 owner staging helper

- **Surfaces:** `convex/capabilitySupplyOwnerStaging.ts`
- **Host RPC (do not move):** `capabilitySupply.stageOwnerX402Capability`
- **Status:** `VERIFIED`
- **Commit:** `176948beb`
- **Subagent Assignment:** Grok (Spec: `abbab5ab-70cd-4c10-bc0a-0bae556a080f`) → Composer (Implement: `421fb7cd-d71b-4d51-955b-a3d9ffebd0a1`) → Orchestrator (Verify: Passed 4/4 Gates)
- **After:** root re-export 2; `ownerStagingReuse.ts` 321; `ownerStagingNormalize.ts` 168; `ownerStagingAdmission.ts` 96; `ownerStagingValues.ts` 48
- **Host:** `convex/capabilitySupply.ts` unchanged
- **Gates:** same batch as CQ3-05

### CQ3-07 — A09 capability probes helper

- **Surfaces:** `convex/capabilitySupplyProbes.ts`
- **Host RPCs (do not move):** `observeCapabilityReadiness`, `readCapabilityProbeTarget`, `readOwnerStagedCapabilityProbeTarget`, `recordCapabilityProbeResult`, `recordOwnerStagedCapabilityProbeResult`, `scheduleDueCapabilityProbes`
- **Status:** `VERIFIED`
- **Commit:** `ba8e04661`
- **Subagent Assignment:** Grok (Spec: `cfc41b5b-ae95-4510-831d-47217a2d8ef6`) → Composer (Implement: `71629cb1-08fb-49e0-badb-fc2e4e037fa5`) → Orchestrator (Verify: Passed 4/4 Gates; 1 lint heal — unused value imports dropped, re-exports kept)
- **After:** root 188; `probeAuthority.ts` 303; `probeObserve.ts` 274; `probeTarget.ts` 212; `probeSchedule.ts` 49
- **CQS:** authority/target helpers query-safe; observe/record/schedule stay mutations. Thinness wrappers remain on the root.
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; 53 tests in 8 files (thinness, readiness-authority, interactive-consequence, A01, publication-probe, sandbox-staging, API-kind, node-only)

### Wave 2 close measurements (21 September 2026)

| File | Lines | Ceiling |
| :--- | ---: | :--- |
| `convex/capabilitySupplyOwnerCanary.ts` | 36 | façade <200 |
| `convex/capabilitySupplyOwnerSupply.ts` | 35 | façade <200 |
| `convex/capabilitySupplyOwnerStaging.ts` | 2 | helper re-export |
| `convex/capabilitySupplyProbes.ts` | 188 | helper + thinness wrappers |
| `convex/lib/capabilitySupply/ownerCanaryAdmission.ts` | 365 | helper <400 |
| `convex/lib/capabilitySupply/ownerStagingReuse.ts` | 321 | helper <400 |
| `convex/lib/capabilitySupply/probeAuthority.ts` | 303 | helper <400 |

`convex/capabilitySupply.ts` RPC names unchanged. No `convex/<name>/` directories created.

---

# Wave 3: Leaf-rule residue

| ID | Amendment | File | Incision | Size | Status |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **CQ3-08** | A11 | `src/routes/$slug.tsx`, `sign-in.$.tsx`, `sign-up.$.tsx` | Move search types out of TSX. Do not document an exception. Do not expand to onboarding/support. | S | `VERIFIED` |
| **CQ3-09** | A12 | Seven compounds under `src/components/ae/{auth,legal,principal-account,status,support}/` | Map existing coverage. Add colocated tests only for named behavioural gaps. No markup-mirroring tests. | M | `VERIFIED` |
| **CQ3-10** | A13 | privacy / terms / help | Explicit skeleton **not applicable** for synchronous static pages. Do not add fake skeletons. | S | `VERIFIED` |

### CQ3-08 — A11 framework search types

- **Status:** `VERIFIED`
- **Commit:** `6af2a4966`
- **Subagent Assignment:** Grok (Spec: `4705510f-4c53-4385-958c-f44a398fbb60`) → Composer (Implement: `4efe5ad2-1045-4f12-9c67-71e6cb9df3d0`) → Orchestrator (Verify: Passed 4/4 Gates)
- **Locked decision:** move, do not document an exception
- **Types moved:** `AuthRedirectSearch` → `src/lib/client/auth-redirect.ts`; `ProviderListingSearch` → `src/components/ae/listing/public-business/public-business.contracts.ts`. Routes: sign-in 26, sign-up 26, `$slug` 62.
- **Gates:** lint clean; `deps:check` 0/0/0; `tsc --noEmit` 0; 49 tests in 6 route/website files

### CQ3-09 — A12 colocated tests

- **Status:** `VERIFIED`
- **Commit:** `6af2a4966`
- **Subagent Assignment:** same Wave 3 scout/implement as CQ3-08
- **Locked decision:** justified tests only; seven accepted **EXCEPTION** rows. No new colocated tests.

| Compound | EXCEPTION | Existing coverage |
| :--- | :--- | :--- |
| `auth/sign-in/` | accepted | `tests/unit/routes/sign-in-single-account-exit.test.tsx`, `tests/unit/routes/sign-in-stage.test.tsx`, `tests/unit/routes/auth-redirect-sanitizer.test.ts`, `tests/unit/website/clerk-sign-in-appearance.test.ts` |
| `auth/sign-up/` | accepted | `tests/unit/routes/sign-up-neutral-account-entry.test.tsx`, `tests/unit/routes/auth-redirect-sanitizer.test.ts` |
| `legal/privacy/` | accepted | `tests/unit/routes/public-semantic-comfort.test.tsx`, `tests/unit/routes/privacy-removal-outcome.test.tsx` |
| `legal/terms/` | accepted | `tests/unit/routes/public-semantic-comfort.test.tsx` |
| `principal-account/onboarding/` | accepted | `tests/unit/routes/onboarding.test.tsx` |
| `status/system-status/` | accepted | `tests/unit/routes/status-route.test.tsx` |
| `support/help/` | accepted | `tests/unit/routes/support-route.test.tsx` |

### CQ3-10 — A13 static-page skeletons

- **Status:** `VERIFIED`
- **Commit:** `6af2a4966`
- **Subagent Assignment:** same Wave 3 scout/implement as CQ3-08
- **Locked decision:** privacy, terms, and help are synchronous static pages — colocated skeleton **N/A**; do not add fake skeletons. Protocol and leaf-rule amendments are `da44c1dd1`.

---

## Recorded deferrals (not Wave 2/3)

| ID | File | Measurement | Owner |
| :--- | :--- | ---: | :--- |
| A07 / CQ-25 | `convex/capabilityCallProjection.ts` | 873 | PARKED — call-worker design dependency |
| A10 | `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` | **1,041** | Campaign 2 Wave 1 deferral; measurement updated from historical 1,038 |
