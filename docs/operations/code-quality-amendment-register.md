# Code Quality Amendment Register — Campaign 3 intake

**Date:** 21 September 2026  
**Status:** `INTAKE` — Campaign 3 structural waves are not staffed. Campaign 2 remains **CLOSED**. This document does not open Campaign 3.  
**Current tree:** unified `main`. Merge `113720ebd` combined Campaign 2 close (`1d8d07583`) with `well-10/alpha-launch-readiness` (`52d8303b6`). Subsequent assignments are against this unified tree, not the retired alpha worktree.  
**Current measurements:** `convex/capabilitySupplyCanaryFunding.ts` is **980** lines. `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` is **1,041** lines. The five newest operator-route controllers remain **38–75** lines and must not be reopened as missing work.  
**Historical (pre-merge, do not use for later work):** shared checkout before merge measured funding at **589** (sandbox-only; production replay absent) and the signer at **1,038**. Those figures describe `1d8d07583`, not current `main`.  
**Source review (historical):** side scan of the alpha worktree, range `0fafd075d..52d8303b6`, HEAD `52d8303b6`. That scan is **not** a CQ VERIFIED receipt.  
**Independent re-measure (historical):** Grok `75658095-a8a2-4b02-baa2-29da0e9c1611` (21 Sep 2026) against both pre-merge trees. No A01–A15 claim was rejected.

| Tree | Path | Role |
| :--- | :--- | :--- |
| Unified `main` (this checkout) | `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy` | **Current.** All later repairs and Campaign 3 waves assign here. |
| Alpha worktree (closed) | `/Users/joelchan/.codex/worktrees/alpha-launch/Agentic-Economy` | **Historical parent** `52d8303b6`. Do not route new work back to it. |

**Rule:** later repairs assign against unified `main`. Pre-merge shared/alpha columns below are historical evidence only.

---

## How to read this register

| Verdict | Meaning |
| :--- | :--- |
| **BLOCKER** | Correctness. Close before any Campaign 3 structural wave. |
| **C3 WAVE** | Structural work Campaign 3 should claim, in the named wave. |
| **RECORDED** | Already on a quality register. Do not create a competing assignment. |
| **ASSESS** | Size/complexity signal. Keep / simplify / extract with a reason. Not an automatic extract. |
| **DOCS** | Register/protocol/text must be amended. No product behaviour change. |
| **ALPHA-GROWTH** | Historical label for debt that grew on alpha before merge. Repair on unified `main`; do not reopen the closed worktree. |

Completion bar for any later assignment (from the source review, kept):

- Behavioural contract and responsibility boundary are explicit.
- Lint, strict typecheck, `deps:check`, and regression tests pass.
- Structural rules are checked separately from lint.
- RPC identities, transaction boundaries, hashes, and payment semantics stay intact.
- The change is committed; this register records evidence, remaining exceptions, and provenance.

**Do not** split one mutation into several mutation calls to shrink a file. That damages atomicity and is not an acceptable size fix.

---

## Wave order (when Campaign 3 is opened)

1. **A01** production-replay correctness — **closed** on unified `main` in this assignment.
2. **A02–A04** funding / payment structure on unified `main` (current funding file is 980 lines).
3. **A05, A06, A08, A09** inherited Convex cohesion; **A11–A13** Wave 3 leftover hygiene.
4. **DOCS** — reconcile the documents in §5 last so measurements are current.
5. Leave **A07 / CQ-25** and **A10** as recorded deferrals. Update the signer measurement to **1,041**; do not reopen the five newest operator-route extractions (38–75 lines).

---

# 1. Correctness and module amendments

| ID | File / boundary | Origin | Historical shared `wc -l` | Current unified `wc -l` | Verdict | Required amendment |
| :--- | :--- | :--- | ---: | ---: | :--- | :--- |
| **A01** | `convex/capabilitySupplyCanaryFunding.ts` — production replay (`exactProductionGrantMaterial` + `principalExact`, ~L671–682) | **Correctness defect** landed with the merge. Replay omitted principal scopes. Readiness and rotation require exactly `market_tools:call` (L483–484, L736–737). | 589 (sandbox only; production replay **absent**) | 980 | **CLOSED on unified `main`** | Replay now requires the same exact scope material. Same-generation replay after scope drift returns `material_conflict` and does not change stored records. Regression covers first issuance and both rotation predecessors. Attach the closed gap to **AM-14**; do not reopen the closed alpha worktree. |
| **A02** | Same funding module | Structural debt now on unified `main`. Combines grant policy, identity, validation, provisioning, rotation, custody configuration, and readiness. | 589 | 980 | **C3 WAVE** | Separate using existing `convex/lib/<domain>/` convention and the existing `canaryFundingConstants.ts` extraction. Keep the RPC façade **< 200** and extracted logic **< 400**. Preserve transaction boundaries. Useful cuts: (1) grant policy, identity, exact-material matching; (2) atomic provisioning and rotation handlers; (3) durable grant/readiness reads; (4) custody configuration and RPC endpoint parsing; (5) thin RPC registrations. |
| **A03** | `convex/capabilitySupplyCanaryFundingPreflight.ts` | Landed with the merge. RPC registration, CDP adapter, policy inspection, and balance inspection live together. | 434 | 460 | **C3 WAVE** | Separate the external CDP adapter and readiness inspection from the thin Node action façade. Preserve error/result contracts. |
| **A04** | `convex/moneyX402PaymentAttempts.ts` | Landed with the merge. Canary preparation mutation contains substantial business logic beside otherwise thin registrations. | 262 | 271 | **C3 WAVE** | Move the substantive handler into the existing payment-attempt helper structure. Keep authorization and reservation writes in the **same transaction**. |
| **A05** | `convex/capabilitySupplyOwnerCanary.ts` | Inherited. Identity/commitment validation, admission, and evidence queries share the RPC module. **Façade** (3 RPC: 2 `internalMutation`, 1 `internalQuery`). | 640 | 640 | **C3 WAVE** | Separate identity validation, admission handler, and evidence reader. Preserve commitments, hashes, replay identity, and workpool behaviour. |
| **A06** | `convex/capabilitySupplyOwnerSupply.ts` | Inherited. Action orchestration exceeds the façade standard. **Façade** (2 `action`). | 330 | 330 | **C3 WAVE** | Extract readiness/test orchestration into handlers. Retain existing action names and Node/runtime boundaries. |
| **A07** | `convex/capabilityCallProjection.ts` | Inherited, slightly reduced. **Façade** (1 `query` + helpers). Already **CQ-25 PARKED** / Campaign 2 `CQ2-06` trim-only. | 875 | 873 | **RECORDED** | Keep **one** CQ-25 assignment. Resolve the call-worker design dependency before decomposition. Do **not** create a competing refactor. Link only. |
| **A08** | `convex/capabilitySupplyOwnerStaging.ts` | Helper (0 RPC). Not a façade violation. | 579 | 589 | **C3 WAVE** | Review seams between input normalization, exact-publication reuse, and staging orchestration. Classify as helper-module cohesion debt. |
| **A09** | `convex/capabilitySupplyProbes.ts` | Helper (0 RPC). Authority resolution, target reads, observation writes, and scheduling coexist. | 908 | 909 | **C3 WAVE** | Establish bounded responsibilities before further growth. Preserve the distinction between authority **queries** and probe **mutations**. |
| **A10** | `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` | Existing Campaign 2 Wave 1 deferral. Current measurement is **1,041**. | 1038 | 1041 | **RECORDED** | Keep the recorded deferral at **1,041** on unified `main`. Keep an explicit owner and exit condition. Any later split must preserve signing material and external protocol behaviour. |

### A01 evidence (closed on unified `main` in this assignment)

Replay `principalExact` now requires the same exact scope material as readiness and rotation:

```ts
// convex/capabilitySupplyCanaryFunding.ts ~L678–682
&& principal.expiresAt === expected.expiresAt
&& principal.scopes.length === 1
&& principal.scopes[0] === MARKET_TOOLS_CALL_SCOPE
```

Regression: after readiness rejects broadened scopes, same-generation `provisionProduction*` returns `material_conflict` and does not change stored records. Covered for first issuance and both rotation predecessors.

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
| `registry/tool-reranker.ts` manifest attribution | Landed on unified `main`: `tool-reranker.ts` is a registry entry; market may depend on `decision-engine`; `market-directory-reranker-tests` is the white-box exception. Alpha’s payment-material and native-procure exceptions stay. |
| Historical module-boundary and procurement test failures | Campaign 2 close Known Red Baseline is historical. Unified `main` **keeps** `tool.procure` across registration, discovery, HTTP/MCP, and tests. Do not treat the withdrawn ADR 0002 as authority to drop that action. |

Campaign 2 standing exceptions (do not reopen as new misses):

| Exception | Historical shared | Current unified `main` | Owner |
| :--- | ---: | ---: | :--- |
| `cdp-x402-payment-signer.ts` | 1038 | **1041** | **A10** |
| Five newest operator-route controllers | 38–75 after Campaign 2 | 38–75 | Closed. Do not reopen as missing work. |
| `developers.discovery.tsx` | 197 | 197 | Discovery dirt — skip until that dirt lands |
| Convex `*.test.*` over 1,000 | 2383 / 1435 / 1233 | (not re-measured here) | Open §4 scope question; not a C2 miss |

---

# 5. Amendments to the registers and protocol

| Document | What is stale | Required amendment |
| :--- | :--- | :--- |
| `docs/operations/code-quality-maturity-register.md` | Campaign 1 close is historical. Outstanding Work still lists “seven files over 1,000” and “24 routes over 80” from the 20 Sep re-audit — those were claimed by Campaign 2. Header/copy still says “4-Phase” in places against a five-stage lifecycle. | Preserve historical closure. Distinguish it from **current** compliance. Point 1,000-line / 80-line rows at the ceiling register close. Add/link this amendment register. Correct “4-Phase” to the five-stage lifecycle. |
| `docs/operations/code-quality-ceiling-register.md` (unified `main`) | Campaign **CLOSED**; Wave 3 **VERIFIED**. Signer measurement must read **1,041** (historical close text still says 1,038 from `1d8d07583`). | Keep closed. Add a pointer to this intake. Do not reopen Wave 3 or the five newest operator-route extractions. |
| `docs/operations/code-quality-ceiling-register.md` (alpha copy, historical) | Pre-merge alpha copy said Wave 3 **NOT STAFFED**. That copy is not current. | Do not treat the retired alpha register as an assignment surface. |
| `docs/operations/alpha-maturity-register.md` | AM-14 local production-canary is accepted and does **not** record the replay/scope gap. AM-24 SOURCE ACCEPTED locally; AM-25 hosted-only NOT VERIFIED. | Attach **A01** to AM-14. Link A02–A04 as quality follow-ups, not launch blockers, unless A01 stays open. Make the current summary show all unresolved approval boundaries, including AM-24/AM-25. |
| `docs/operations/code-quality-maturity-protocol.md` and `.cursor/rules/leaf-and-component-cleanliness.mdc` | RPC-root helpers were labelled façade violations in an earlier pass. Strict `<80` vs `≤80` is inconsistent. Test-file ceiling, framework-search types, and static-page skeletons are unspecified. | Clarify: RPC façade vs root **helper** modules (A08/A09 are helpers). Page routes **≤ 80**. Test-file ceiling applicability (open question). Framework-search types (A11). Skeleton applicability for synchronous static pages (A13). |
| Existing automated checks | Lint and `deps:check` passing does not establish the ten invariants. | Add enforcement for agreed structural rules where practical, with narrowly named exceptions. |

Do **not** soften the standard to make the expanded funding module pass.

---

# 6. Housekeeping and integration

| Item | Evidence / amendment |
| :--- | :--- |
| Merge | Established locally at `113720ebd`. Alpha `52d8303b6` is a parent of unified `main`. The alpha worktree and `well-10` branch are closed. |
| Subsequent work | Assign against unified `main`. Do not reopen alpha, `well-9`, or `well-10` for later repairs. |
| Concurrent Jev / procurement dirt | Reconcile on this tree: keep `tool.procure`; union Jev reranker declarations with alpha’s payment-material and native-procure exceptions; record `capabilityToolCatalog.rerank` in the API-kind snapshot. Do not copy either pre-merge manifest wholesale. |
| Ignored artifacts | Classify build/test outputs separately from credentials, environment files, and backend state. Clean only task-owned disposable artifacts. |
| Deployment | No push or hosted acceptance is established by this intake. Local quality evidence must not close those milestones. |

---

# Claim list for a later Campaign 3 (not opened)

Staff structural waves only after A01 is closed on unified `main`.

| Wave | IDs | Notes |
| :--- | :--- | :--- |
| 0 — correctness | **A01** | **Closed** on unified `main`. Same-generation replay after scope drift → `material_conflict`. |
| 1 — funding/payment | **A02, A03, A04** | After A01. Do not break atomic provision/rotate. Current funding file is 980 lines. |
| 2 — inherited Convex | **A05, A06, A08, A09** | Façade vs helper already classified. |
| 3 — Wave 3 residue | **A11, A12, A13** | Search types, tests, skeleton N/A. Do not reopen the five newest operator-route controllers. |
| 4 — docs | Section 5 | After measurements settle. |
| Parked | **A07, A10** | CQ-25; signer deferral at **1,041**. |
| Test concentration | **A14, A15** | Historical alpha-growth. If C3 claims test-file ceilings, split on unified `main`. |
| Assess-only | Section 3 | Keep / simplify / extract with reasons. |

**Out of this intake:** React Doctor warning cleanup, raising complexity ratchets, competing CQ-25 work, `developers.discovery.tsx` while discovery is dirty, hosted AM-25 proof.
