# Code Quality Amendment Register — Campaign 3 intake

**Date:** 21 September 2026  
**Status:** `INTAKE` — not staffed. Campaign 2 remains **CLOSED**. This document does not open Campaign 3.  
**Unified tree:** `113720ebd` — merge of Campaign 2 close (`1d8d07583`) and `well-10/alpha-launch-readiness` (`52d8303b6`). A01 now lives on this checkout.  
**Source review:** side scan of the alpha worktree, range `0fafd075d..52d8303b6`, HEAD `52d8303b6`. That scan is **not** a CQ VERIFIED receipt (no full typecheck/test run, no 5-stage lifecycle).  
**Independent re-measure:** Grok `75658095-a8a2-4b02-baa2-29da0e9c1611` (21 Sep 2026) against both trees. No A01–A15 claim was rejected.

| Tree | Path | HEAD | Branch |
| :--- | :--- | :--- | :--- |
| Shared checkout (this tree, after merge) | `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy` | `113720ebd` | `main` |
| Alpha worktree (pre-merge tip, now a parent) | `/Users/joelchan/.codex/worktrees/alpha-launch/Agentic-Economy` | `52d8303b6` | `well-10/alpha-launch-readiness` |

**Rule:** do not treat a clean alpha worktree as a clean shared checkout. Preserve concurrent shared work. Reconcile competing discovery contract extractions before integration.

---

## How to read this register

| Verdict | Meaning |
| :--- | :--- |
| **BLOCKER** | Correctness. Close before any Campaign 3 structural wave. |
| **C3 WAVE** | Structural work Campaign 3 should claim, in the named wave. |
| **RECORDED** | Already on a quality register. Do not create a competing assignment. |
| **ASSESS** | Size/complexity signal. Keep / simplify / extract with a reason. Not an automatic extract. |
| **DOCS** | Register/protocol/text must be amended. No product behaviour change. |
| **ALPHA-GROWTH** | Debt already large on `main`; alpha made it worse. Fix on the branch that owns the growth, then land once. |

Completion bar for any later assignment (from the source review, kept):

- Behavioural contract and responsibility boundary are explicit.
- Lint, strict typecheck, `deps:check`, and regression tests pass.
- Structural rules are checked separately from lint.
- RPC identities, transaction boundaries, hashes, and payment semantics stay intact.
- The change is committed; this register records evidence, remaining exceptions, and provenance.

**Do not** split one mutation into several mutation calls to shrink a file. That damages atomicity and is not an acceptable size fix.

---

## Wave order (when Campaign 3 is opened)

1. **A01** correctness (alpha production replay).
2. **A02–A04** funding / payment structure (alpha growth + shared already-fat façades).
3. **A05, A06, A08, A09** inherited Convex cohesion; **A11–A13** Wave 3 leftover hygiene.
4. **DOCS** — reconcile the four documents below. Do this last so measurements are current.
5. Leave **A07 / CQ-25** and **A10** as recorded deferrals with updated measurements only.

---

# 1. Correctness and module amendments

| ID | File / boundary | Origin | Shared `wc -l` | Alpha `wc -l` | Verdict | Required amendment |
| :--- | :--- | :--- | ---: | ---: | :--- | :--- |
| **A01** | `convex/capabilitySupplyCanaryFunding.ts` — production replay (`exactProductionGrantMaterial` + `principalExact`, alpha ~L671–681) | **New correctness defect** on alpha. Replay omits principal scopes. Readiness and rotation require exactly `market_tools:call` (alpha L483–484, L736–737). | 589 (sandbox only; production replay **absent**) | 980 | **BLOCKER** | Make production material matching consistent. A same-generation replay after scope drift must return `material_conflict` and must not change stored records. Add the missing assertion in `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts`: after readiness rejects broadened scopes, retry `provisionProduction*` and expect conflict. Shared sandbox already re-provisions and expects `conflict`. This is a source-confirmed inconsistency, **not** a demonstrated unauthorized-payment exploit. Readiness already rejects the broadened scopes. The defect is that provisioning can report successful replay for material readiness refuses. Attach to alpha **AM-14** (local production-canary proof does not record this gap). |
| **A02** | Same funding module | Worsened structural debt. Combines grant policy, identity, validation, provisioning, rotation, custody configuration, and readiness. | 589 | 980 | **C3 WAVE** | Separate using existing `convex/lib/<domain>/` convention and the existing `canaryFundingConstants.ts` extraction. Keep the RPC façade **< 200** and extracted logic **< 400**. Preserve transaction boundaries. Useful cuts: (1) grant policy, identity, exact-material matching; (2) atomic provisioning and rotation handlers; (3) durable grant/readiness reads; (4) custody configuration and RPC endpoint parsing; (5) thin RPC registrations. |
| **A03** | `convex/capabilitySupplyCanaryFundingPreflight.ts` | Worsened. RPC registration, CDP adapter, policy inspection, and balance inspection live together. | 434 | 460 | **C3 WAVE** | Separate the external CDP adapter and readiness inspection from the thin Node action façade. Preserve error/result contracts. |
| **A04** | `convex/moneyX402PaymentAttempts.ts` | Worsened. Canary preparation mutation contains substantial business logic beside otherwise thin registrations. | 262 | 271 | **C3 WAVE** | Move the substantive handler into the existing payment-attempt helper structure. Keep authorization and reservation writes in the **same transaction**. |
| **A05** | `convex/capabilitySupplyOwnerCanary.ts` | Inherited. Identity/commitment validation, admission, and evidence queries share the RPC module. **Façade** (3 RPC: 2 `internalMutation`, 1 `internalQuery`). | 640 | 640 | **C3 WAVE** | Separate identity validation, admission handler, and evidence reader. Preserve commitments, hashes, replay identity, and workpool behaviour. |
| **A06** | `convex/capabilitySupplyOwnerSupply.ts` | Inherited. Action orchestration exceeds the façade standard. **Façade** (2 `action`). | 330 | 330 | **C3 WAVE** | Extract readiness/test orchestration into handlers. Retain existing action names and Node/runtime boundaries. |
| **A07** | `convex/capabilityCallProjection.ts` | Inherited, slightly reduced. **Façade** (1 `query` + helpers). Already **CQ-25 PARKED** / Campaign 2 `CQ2-06` trim-only. | 875 | 873 | **RECORDED** | Keep **one** CQ-25 assignment. Resolve the call-worker design dependency before decomposition. Do **not** create a competing refactor. Link only. |
| **A08** | `convex/capabilitySupplyOwnerStaging.ts` | Worsened **helper** (0 RPC). Not a façade violation. | 579 | 589 | **C3 WAVE** | Review seams between input normalization, exact-publication reuse, and staging orchestration. Classify as helper-module cohesion debt. |
| **A09** | `convex/capabilitySupplyProbes.ts` | Worsened **helper** (0 RPC). Authority resolution, target reads, observation writes, and scheduling coexist. | 908 | 909 | **C3 WAVE** | Establish bounded responsibilities before further growth. Preserve the distinction between authority **queries** and probe **mutations**. |
| **A10** | `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` | Existing Campaign 2 Wave 1 deferral, worsened on alpha. | 1038 | 1041 | **RECORDED** | Update the recorded measurement (shared 1,038; alpha 1,041). Keep an explicit owner and exit condition. Any later split must preserve signing material and external protocol behaviour. |

### A01 evidence (alpha, confirmed)

Replay (`principalExact`) does **not** compare `principal.scopes`:

```ts
// convex/capabilitySupplyCanaryFunding.ts ~L671–681 (alpha)
const principalExact = principal !== null
  && principal.ownerId === expected.ownerId
  && principal.credentialId === expected.credentialId
  && principal.applicationRef === expected.applicationRef
  && principal.environment === 'production'
  && principal.authorityMode === 'spending_policy'
  && principal.lifecycle === 'active'
  && principal.grantGeneration === expected.generation
  && principal.spendingPolicyDigest === expected.spendingPolicyDigest
  && principal.expiresAt === expected.expiresAt
return exactProductionGrantMaterial(target, expected) && principalExact && active.length === 1
```

Readiness (`readProductionSellerOnboardingCanaryFundingReadiness` via the exact-grant reader) **does**:

```ts
// same file ~L483–484 (alpha)
|| principal.scopes.length !== 1
|| principal.scopes[0] !== MARKET_TOOLS_CALL_SCOPE) return null
```

---

# 2. UI and test amendments

| ID | Exact scope | Finding | Shared | Alpha | Verdict | Required amendment |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A11** | `src/routes/$slug.tsx`, `sign-in.$.tsx`, `sign-up.$.tsx` | Inherited local search types remain in TSX: `ProviderListingSearch`, `SignInSearch`, `SignUpSearch`. | present (L13 / L8 / L8) | same | **C3 WAVE** | Move them into existing contract/validation modules, **or** document a narrow framework-search exception in the protocol and Cursor rule. They violate the literal props-only rule. They are not complex domain models. |
| **A12** | Seven Wave 3 compounds under `src/components/ae/` | No directly colocated unit tests. | none | none | **C3 WAVE** | Map existing coverage to observable behaviour. Add focused colocated tests only where behaviour warrants them. Do **not** manufacture tests that merely mirror markup. Record accepted exceptions explicitly. |
| **A13** | Privacy, terms, help compounds | No colocated skeletons. | privacy / terms / help: no skeleton. Sign-in, sign-up, onboarding, system-status: yes (auth skeletons reuse real Clerk fallbacks). | same | **C3 WAVE** | Synchronous static pages (privacy, terms, and likely help) should receive an explicit **“not applicable”**. Asynchronous loading boundaries need a matching skeleton. Absence alone does not prove layout shift. |
| **A14** | `tests/integration/capability-call-workpool.test.ts` | Alpha run added substantial test concentration. | 1760 | 2344 | **ALPHA-GROWTH** | Separate suites by distinct behavioural contracts. Keep shared setup only where useful. Preserve retry, concurrency, and failure-path coverage. Shared is already large; do not open a shared-only split unless C3 claims test-file ceilings. |
| **A15** | `tests/helpers/convex-fixtures.ts` | Large shared fixture surface. | 810 | 829 | **ALPHA-GROWTH** | Identify which **new** fixtures belong to narrower domain helpers. Avoid another broad fixture abstraction. |

### A12 compounds (all beneath `src/components/ae/`)

1. `auth/sign-in/` — skeleton yes; colocated test no  
2. `auth/sign-up/` — skeleton yes; colocated test no  
3. `legal/privacy/` — skeleton no; colocated test no  
4. `legal/terms/` — skeleton no; colocated test no  
5. `principal-account/onboarding/` — skeleton yes; colocated test no  
6. `status/system-status/` — skeleton yes; colocated test no  
7. `support/help/` — skeleton no; colocated test no  

Existing route tests (`agent-access-authorize`, `funding-return-route`, `public-business-page-not-found`, `clerk-sign-in-appearance`, …) remain the behaviour net until colocated tests are justified.

---

# 3. Complexity signals — assess, do not auto-extract

Size alone is not a defect. Much of this is inherited. Each row needs a keep / simplify / extract decision with a reason.

| Location / function | Approx. length | Covered by | Assessment needed |
| :--- | ---: | :--- | :--- |
| `call-worker/runPreparation.ts` — `prepareCallRun` | 391 | — | Separate preparation decisions from orchestration only where contracts permit. |
| `call-worker/x402Authorization.ts` — `createX402PaymentCallbacks` | 391 | — | Check ownership of signing, persistence, and recovery state. |
| `capabilitySupplyOwnerCanary.ts` — `requestSellerOnboardingCanaryWithOwner` | 247 | **A05** | Preserve atomic admission. |
| `convex/lib/catalog/sellerCanary.ts` — promotion handler | 237 | — | Promotion validation versus state-transition responsibilities. |
| `convex/lib/capabilitySupply/currentTool.ts` — exact snapshot reader | 218 | — | Contract normalization versus data-access. |
| `capabilityCallProjection.ts` — two projection functions | 195 / 169 | **A07 / CQ-25** | Do not start a parallel extract. |
| `route-transport-x402-payment.ts` — payment preparation | 178 | — | Transport orchestration versus payment-material construction. |
| `cdp-x402-payment-signer.ts` — signature creation | 160 | **A10** | Stay under the deferral. |
| `capabilitySupplyProbes.ts` — authority reader | 157 | **A09** | — |
| `capabilitySupplyOwnerStaging.ts` — exact publication reuse | 155 | **A08** | — |

---

# 4. Existing debt that must remain visible

From Campaign 1 `docs/operations/code-quality-maturity-register.md` Outstanding Work. Not all are new or freshly reproduced.

| Existing item | Required treatment |
| :--- | :--- |
| **CQ-25** call projection decomposition | Preserve the parked dependency. **Link A07.** |
| **CQ-24** complexity ratchets, especially `reserveAttempt.ts` at 59 | Targeted simplification. **Never raise** the ratchet to accommodate growth. |
| React Doctor sequential-await / await-in-loop | Confirm which operations are genuinely independent before parallelizing. Still on Campaign 2 “do not touch.” |
| `args as never` in `convex/lib/money/agentFundingHandoff.ts` | Deliberately repair the security-relevant type boundary. |
| `useProviderWorkspaceSheets.ts` chained state updates | Assess state consistency; consolidate transitions where justified. |
| **CQ-16** GST/price-modal display bypass | Reconcile with `displayPriceFromPricingConfig`. |
| `directory-presentation.ts` re-export shim | Remove only after confirming remaining consumers. |
| `registry/tool-reranker.ts` manifest attribution | Reconcile against the **landed** module manifest on the tree that owns it. |
| Historical module-boundary and procurement test failures | Replace stale claims with revision-specific evidence. Distinguish repaired integration checks from still-missing `tool.procure` functionality. Shared Known Red Baseline at Campaign 2 close: 7 failures in 3 files (`module-boundaries`, `module-boundaries-ratchet`, `native-platform-procure`). |

Campaign 2 standing exceptions (do not reopen as new misses):

| Exception | Shared | Alpha | Owner |
| :--- | ---: | ---: | :--- |
| `cdp-x402-payment-signer.ts` | 1038 | 1041 | **A10** |
| `developers.discovery.tsx` | 197 | 197 | Discovery dirt — skip until that dirt lands |
| Convex `*.test.*` over 1,000 | 2383 / 1435 / 1233 | (not re-measured here) | Open §4 scope question; not a C2 miss |

---

# 5. Amendments to the registers and protocol

| Document | What is stale | Required amendment |
| :--- | :--- | :--- |
| `docs/operations/code-quality-maturity-register.md` | Campaign 1 close is historical. Outstanding Work still lists “seven files over 1,000” and “24 routes over 80” from the 20 Sep re-audit — those were claimed by Campaign 2. Header/copy still says “4-Phase” in places against a five-stage lifecycle. | Preserve historical closure. Distinguish it from **current** compliance. Point 1,000-line / 80-line rows at the ceiling register close. Add/link this amendment register. Correct “4-Phase” to the five-stage lifecycle. |
| `docs/operations/code-quality-ceiling-register.md` (**shared**) | Campaign **CLOSED**; Wave 3 **VERIFIED**; signer recorded at **1,038**. Accurate for `1d8d07583`. | Keep closed. Add a pointer to this intake. Do not reopen Wave 3. |
| `docs/operations/code-quality-ceiling-register.md` (**alpha**) | Still says Wave 3 **NOT STAFFED**, campaign **OPEN**, Wave 2 “pending commit.” Signer still 1,038 while the file is **1,041**. Uncommitted Formance allow-list note may predate the alpha integration repair. | Reconcile imported route-refactor commits against Git. Resolve “pending commit” from evidence. Update signer to **1,041** at `52d8303b6`. Keep shared-checkout status distinct from alpha-worktree status. |
| `docs/operations/alpha-maturity-register.md` | AM-14 local production-canary is accepted and does **not** record the replay/scope gap. AM-24 SOURCE ACCEPTED locally; AM-25 hosted-only NOT VERIFIED. | Attach **A01** to AM-14. Link A02–A04 as quality follow-ups, not launch blockers, unless A01 stays open. Make the current summary show all unresolved approval boundaries, including AM-24/AM-25. |
| `docs/operations/code-quality-maturity-protocol.md` and `.cursor/rules/leaf-and-component-cleanliness.mdc` | RPC-root helpers were labelled façade violations in an earlier pass. Strict `<80` vs `≤80` is inconsistent. Test-file ceiling, framework-search types, and static-page skeletons are unspecified. | Clarify: RPC façade vs root **helper** modules (A08/A09 are helpers). Page routes **≤ 80**. Test-file ceiling applicability (open question). Framework-search types (A11). Skeleton applicability for synchronous static pages (A13). |
| Existing automated checks | Lint and `deps:check` passing does not establish the ten invariants. | Add enforcement for agreed structural rules where practical, with narrowly named exceptions. |

Do **not** soften the standard to make the expanded funding module pass.

---

# 6. Housekeeping and integration

| Item | Evidence / amendment |
| :--- | :--- |
| Alpha commits | Present on `well-10/alpha-launch-readiness`; reviewed HEAD `52d8303b6`. |
| Working tree | Alpha worktree was clean at review time. That does **not** establish that the shared checkout is clean. |
| Shared concurrent work | Preserve it. Reconcile competing discovery contract extractions before integration. Do not retain duplicate type modules. |
| Ignored artifacts | Classify build/test outputs separately from credentials, environment files, and backend state. Clean only task-owned disposable artifacts. |
| Merge / deployment | No push, merge, or hosted acceptance is established by this intake. Local quality evidence must not close those milestones. |

---

# Claim list for a later Campaign 3 (not opened)

Staff only after A01 is closed on the tree that owns production replay.

| Wave | IDs | Notes |
| :--- | :--- | :--- |
| 0 — correctness | **A01** | Alpha. Test-first. Same-generation replay after scope drift → `material_conflict`. |
| 1 — funding/payment | **A02, A03, A04** | After A01. Do not break atomic provision/rotate. |
| 2 — inherited Convex | **A05, A06, A08, A09** | Façade vs helper already classified. |
| 3 — Wave 3 residue | **A11, A12, A13** | Search types, tests, skeleton N/A. |
| 4 — docs | Section 5 | After measurements settle. |
| Parked | **A07, A10** | CQ-25; signer deferral. |
| Branch-owned | **A14, A15** | Split on alpha if C3 claims test concentration; otherwise leave with alpha launch. |
| Assess-only | Section 3 | Keep / simplify / extract with reasons. |

**Out of this intake:** React Doctor warning cleanup, raising complexity ratchets, competing CQ-25 work, `developers.discovery.tsx` while discovery is dirty, hosted AM-25 proof.
