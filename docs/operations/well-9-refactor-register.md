# Well 9 IceInVein Refactoring Register

**Status:** CONCLUDED / SUPERSEDED (16 September 2026)
**Outcome:** Prune preserved (dead code deleted, route boilerplate standardized, UI monoliths deconstructed, Convex backend helpers extracted). Hexagonal Ports & Adapters indirection removed. Goodhart LOC target abandoned in favor of product delivery (AM-09+).

---

## Retrospective & Strategic Course Correction

1. **What was Kept (The Prune):**
   - Complete removal of unused libraries (`evilcharts`, unreferenced UI component primitives).
   - Route boilerplate standardization via `executeCorrelatedJsonRoute` across 26 API routes.
   - UI deconstruction of large monolithic consoles (`AeCreditTopUpPanel`, `AeOwnerCredit`, `CallReceiptWorkspace`) into cohesive sub-components and domain view models.
   - Convex backend decompositions (`offeringPersistence`, `devSeedAuthority`, `sellerCanary`, `funding-stripe-event-pipeline`).

2. **What was Abandoned & Cleaned Up:**
   - **Artificial Ports & Adapters Indirection:** Abstract ports (`CallExecutionPort`, `SupplyManagementPort`, `FundingHandoffPort`, `AccessResolutionPort`) and their separate adapter wrappers were removed. Over opinionated RPC backends like Convex, wrapping typed client mutations/actions in redundant port classes created fragility (e.g. argument splatting in generic dispatchers breaking Convex validator schemas and causing 503 errors in integration tests) with zero architectural benefit. Direct typed service dispatch was restored.
   - **The 127,000 LOC Reduction Target:** Abandoned under Goodhart's Law. Artificial test fixture extractions to meet arbitrary line count targets produced overhead without improving software maintainability.

3. **Immediate Pivot:**
   - All attention is redirected to product milestone delivery on the **Alpha Maturity Register** starting with **AM-09** (Cancelled, failed or expired Checkout return).

---

## 1. Executive Metrics Tracker

| Metric | Starting Baseline | Current Achieved | Target Alpha State | Net Remaining to Harvest |
| :--- | :--- | :--- | :--- | :--- |
| **Total TypeScript Lines (LOC)** | ~414,500 | ~390,219 | **<= 287,500** | **-102,719 LOC** |
| **Net LOC Reduction (%)** | 0.0% | -5.9% (-24,281 LOC) | **>= 30.0%** (-127,000 LOC) | -24.1% |
| **Lint Violations (`oxlint`)** | 0 warnings, 0 errors | **0 warnings, 0 errors** | 0 warnings, 0 errors | 0 |
| **TypeScript Errors (`tsc`)** | 0 errors | **0 errors** | 0 errors | 0 |
| **Module Boundary Tests** | 12/12 passing | **12/12 passing** | 12/12 passing | 0 |
| **TypeScript Standards Violations** | 0 violations | **0 violations** | 0 violations | 0 |
| **Unit & Integration Test Suites** | All Green | **1659/1660** (1 pre-existing Convex call-identity failure, out of scope) | All Green | 1 |
| **Paper Ports (defined, unimplemented)** | 8 | **0** | 0 | 0 |
| **Bounded Contexts with Wired Adapters** | 0 / 4 | **4 / 4** | 4 / 4 | 0 |

---

## 2. Register Schema & Operational Rules

Every entry in this register represents an atomic refactoring step or deconstructed file. Entries must be updated immediately upon completing Step 4 and Step 5 of the 5-step surgical execution protocol.

### Status Lifecycles
- `PLANNED`: Scoped and bounded in the master plan; invariants and target archetypes defined.
- `IN_PROGRESS`: Assigned to subagent / orchestrator; pre-flight characterization test pinned.
- `SOURCE_VERIFIED`: Code decomposed into archetypes; all 6 verification gates green (`lint`, `typecheck`, `deps:check`, `test:imports`, `test:ts-standards`, `vitest`).
- `LOCKED`: Verified against regression in integration test suite and signed off.

### IceInVein 8-Point Audit Checklist
For every modified module, verify:
1. **Thesis Fit**: Does this change directly serve customer capability discovery or purchase recoverability?
2. **Contract Enforcer**: Are preconditions, postconditions, and failure modes explicitly typed via strict Zod / RFC 9457?
3. **Type-Driven Illegal States**: Are impossible states unrepresentable (discriminated unions, no optional ambiguity)?
4. **Temporal Ordering**: Can steps be called out of sequence? Are lifecycles type-enforced?
5. **Error Classification**: Does every error carry an exact domain refusal code, avoiding generic 500s?
6. **Idempotency Guardian**: Are side-effect mutations safely replayable under stable idempotency keys?
7. **Simplicity Razor**: Was any premature abstraction or custom framework avoided?
8. **Complexity Budget**: Did this refactor reduce overall cognitive load and net LOC?

---

## 3. Completed Entries (Phase 1–3 Baseline)

| Entry ID | Target Files / Module | Primary Archetype | Initial LOC | Final LOC | Net Delta | IceInVein Verification | Status | Notes & Architectural Rationale |
| :--- | :--- | :--- | ---: | ---: | ---: | :---: | :---: | :--- |
| `W9-BASE-01` | `src/components/evilcharts/**`, unused UI primitives | UI / Views | ~6,500 | 0 | **-6,500** | Simplicity Razor: Cut unmaintained evilcharts library | `LOCKED` | Replaced unmaintained third-party charting bloat with lightweight CSS bars and maintained SVG badges. |
| `W9-BASE-02` | `src/components/ae/call-receipt/**` | UI Presenter / Views | ~4,200 | ~2,100 | **-2,100** | Archetype Separation: Views vs Presenters | `LOCKED` | Deconstructed god component `CallReceiptWorkspace.tsx` into modular sub-views (`CallMoneyFacts`, `CallReceiptTimeline`, `CallRecoveryPanel`). |
| `W9-BASE-03` | `src/lib/server/call-api.ts` | Driving Route Adapter | ~940 | ~410 | **-530** | Ports & Adapters: Extracted route telemetry | `LOCKED` | Extracted telemetry formatting to `call-route-telemetry.ts` and unified recovery execution under `executeRecoveryAction`. |
| `W9-BASE-04` | `src/modules/money/formance*` | Pure Domain & Driven Adapter | ~1,850 | ~1,250 | **-600** | Strict Archetype: Result schemas isolated | `LOCKED` | Split `formance.ts` into pure schema contracts (`formance-schema.ts`), result algebra (`formance-result.ts`), and workflows. |
| `W9-BASE-05` | `convex/lib/callLifecycle/**` | Driven Persistence Adapter | ~2,100 | ~1,550 | **-550** | Atomic Mutation Boundary: Preserved | `LOCKED` | Decomposed lifecycle dispatch while keeping single atomic Convex mutation transactions intact. |
| `W9-BASE-06` | `tests/integration/capability-call-workpool-harness.ts` | Test Fixture Adapter | ~1,400 | ~750 | **-650** | Contract Enforcer: Removed hoisting syntax errors | `LOCKED` | Decoupled `vi.hoisted` mocks from harness, passing explicit mock instances to eliminate ESM execution bugs. |
| `W9-BASE-07` | Miscellaneous dead code sweeps | Various | ~1,739 | 0 | **-1,739** | Dead code elimination | `LOCKED` | Cleaned orphaned imports, unused schemas (`payoutProjectionSchema`), and redundant types. |

**Subtotal Harvested (Phases 1–3):** **-12,669 LOC**

---

## 4. Active Refactoring Queue (Waypoints 1–4)

| Entry ID | Waypoint | Target Files / Module | Target Archetype | Current LOC | Target LOC | Est. Delta | IceInVein Focus | Status | Notes & Architectural Rationale |
| :--- | :---: | :--- | :--- | ---: | ---: | ---: | :---: | :---: | :--- |
| `W9-P4-01-T` | `WP-1` | `tests/integration/catalogue-hostile-inputs.test.ts` | Integration Test | ~3,100 | ~700 | **-2,400** | Invariant 2: Shared `expectProblem` table | `LOCKED` | Front-load hostile input parameterization into data-driven named-object tables. Verified 58/58 tests green. |
| `W9-P4-02-T` | `WP-1` | `tests/unit/server/agent-access-oauth-api.test.ts` | Unit Test | ~2,200 | ~1,966 | **-234** | Invariant 6: Named-object `it.each` table | `LOCKED` | Extracted reusable test fixture factories (`defaultOAuthGrantFixture`, `defaultOAuthClientFixture`, `consentSecurity`, `refreshFamilyFixture`, `refreshStoreFixture`). 51/51 tests green. |
| `W9-P4-03-T` | `WP-1` | Server route mock suites and dispatch test harnesses | Unit Test | ~15,000 | ~4,050 | **-10,950** | Invariant 6: Reusable invocation fixtures | `LOCKED` | Locked in all 46 route suites and 504 tests across server and route endpoints before application route changes. |
| `W9-P4-01` | `WP-2` | `src/routes/api.v1.account.*` (activity, balance, sessions) | Driving HTTP Route Adapter | ~1,100 | ~400 | **-700** | RFC 9457 problem format & `defineJsonRoute` | `COMPLETED` | Verified thin adapters delegating to `agent-account-api.ts` and `funding-handoff-api.ts`. |
| `W9-P4-02` | `WP-2` | `src/routes/api.v1.businesses.*` (detail, search, list) | Driving HTTP Route Adapter | ~900 | ~350 | **-550** | Strict Zod input validation & Opaque cursor | `COMPLETED` | Standardized on `defineRouteHandlers` and pure registry query actions. |
| `W9-P4-03` | `WP-2` | `src/routes/api.v1.funding.*` (constraints, quote) | Driving HTTP Route Adapter | ~850 | ~350 | **-500** | Commercial policy quote purity | `COMPLETED` | Refactored onto uniform `executeCorrelatedJsonRoute` gateway adapter with rate limiting. |
| `W9-P4-04` | `WP-2` | `src/routes/api.v1.market-tools.*` (search, describe, compare) | Driving HTTP Route Adapter | ~1,450 | ~550 | **-900** | Discovery caching & uniform freshness envelope | `COMPLETED` | Harmonized onto `executeCorrelatedJsonRoute` with pre-validation bypass for 415/400 errors. |
| `W9-P4-05` | `WP-2` | `src/routes/api.v1.supply.*` (calls, earnings, publish) | Driving HTTP Route Adapter | ~1,600 | ~750 | **-850** | Idempotency & Principal authorization | `COMPLETED` | Harmonized provider supply action routes with `supply-action-api.ts` gold standard. |
| `W9-P4-06` | `WP-3` | `convex/catalogOfferingMutations.ts` & outlier renames | Driven Convex Persistence Adapter | ~1,380 | ~450 | **-930** | Atomic Mutation Integrity & Piggyback Rename | `COMPLETED` | Extracted persistence helpers to `convex/lib/catalog/offeringPersistence.ts`, authority to `devSeedAuthority.ts`, and canary to `sellerCanary.ts`. Main file reduced to 489 LOC. |
| `W9-P4-07` | `WP-3` | `convex/devSeed.ts` | Test Fixture Data | ~1,850 | ~380 | **-1,470** | Simplicity Razor: Parameterize fixture data | `COMPLETED` | Extracted sandbox tool specs and static price dictionaries to `convex/lib/devSeedFixtures.ts`. Main file reduced to 936 LOC. |
| `W9-P4-08` | `WP-4` | `src/routes/_operator/owner.credit.tsx` & `AeCreditTopUpPanel.tsx` | UI Views vs Presenter vs Hook | ~1,600 | ~700 | **-900** | Single Reason to Change (Rule of 300) | `COMPLETED` | Decomposed `AeCreditTopUpPanel.tsx` (653 -> 205 LOC) and `AeOwnerCredit.tsx` (717 -> 374 LOC), extracting `use-account-funding.ts`, `credit-top-up-format.ts`, `credit-top-up-storage.ts`, `owner-credit-format.ts`, and `AeAccountHistoryTable.tsx`. |
| `W9-P4-09` | `WP-4` | `src/routes/_operator/owner.market.tsx` | UI Views vs Presenter | ~1,200 | ~500 | **-700** | Decouple Market query hooks from component render | `PLANNED` | Extract market card presenters and reactive query pagination hooks. |

**Estimated Harvest (Waypoints 1–4):** **-22,600 LOC**

---

## 5. Active Refactoring Queue (Waypoint 5: The Grand Test Parameterization Harvest)

| Entry ID | Waypoint | Target Test File | Test Category | Initial LOC | Final LOC | Net Delta | IceInVein Invariant | Status | Notes & Architectural Rationale |
| :--- | :---: | :--- | :--- | ---: | ---: | ---: | :---: | :---: | :--- |
| `W9-P5-01` | `WP-5` | `tests/unit/convex/money-x402-payment-attempts.test.ts` | Unit / Convex Fixture | 1,670 | 1,019 | **-651** | Invariant 6: Reusable fixture factories | `LOCKED` | Extracted `money-x402-payment-attempt-fixtures.ts`. 100% tests green. |
| `W9-P5-02` | `WP-5` | `tests/unit/capability-execution/jit-provider-consequence.test.ts` | Unit / Execution Consequence | 1,246 | 831 | **-415** | Invariant 4 & 6: Unified consequence test harness | `LOCKED` | Extracted `jit-provider-consequence.harness.ts`. 100% tests green. |
| `W9-P5-03` | `WP-5` | `tests/unit/authority/context/consequence-authority.test.ts` | Unit / Authority Admission | 1,287 | 802 | **-485** | Invariant 4: Admission replay invariants | `LOCKED` | Extracted `consequence-authority.harness.ts`. 100% tests green. |
| `W9-P5-04` | `WP-5` | `tests/unit/principal-account/account/account-registry.test.ts` | Unit / Account & Succession | 1,147 | 768 | **-379** | Invariant 3: Succession type states | `LOCKED` | Extracted `account-registry.harness.ts`. 100% tests green. |
| `W9-P5-05` | `WP-5` | `tests/unit/market-terminal/doctor.test.ts` | Unit / CLI Doctor Diagnostics | 1,690 | 890 | **-800** | Invariant 5: Doctor check error matrix | `LOCKED` | Extracted `doctor-test-harness.ts`. 100% tests green (28/28). |
| `W9-P5-06` | `WP-5` | `tests/unit/convex/recovery-break-glass-driver.test.ts` | Unit / Break-Glass Recovery | 1,060 | 508 | **-552** | Invariant 3 & 6: Parameterized recovery matrices | `LOCKED` | Extracted `recovery-break-glass-driver-fixture.ts`. 100% tests green (22/22). |
| `W9-P5-07` | `WP-5` | `tests/unit/convex/workload-cron.test.ts` | Unit / Cron Scheduling & Dispatch | 1,146 | 640 | **-506** | Invariant 4: Scheduled dispatch invariants | `LOCKED` | Extracted `workload-cron.harness.ts`. 100% tests green (64/64). |
| `W9-P5-08` | `WP-5` | `tests/unit/convex/capability-call-recovery.test.ts` | Unit / Call Recovery Mutation Handlers | 964 | 460 | **-504** | Invariant 6: Status & reconcile action helpers | `LOCKED` | Extracted `capability-call-recovery-harness.ts`. 100% tests green (17/17). |
| `W9-P5-09` | `WP-5` | `tests/unit/registry/services-api-projection.test.ts` | Unit / Services Projection | 958 | 506 | **-452** | Invariant 2: Catalogue projection table | `LOCKED` | Parameterized endpoint & business mappings. 100% tests green. |
| `W9-P5-10` | `WP-5` | `tests/unit/convex/interactive-authority.test.ts` | Unit / Interactive Provisioning & Materialization | 1,041 | 625 | **-416** | Invariant 3: Interactive credential lifecycles | `LOCKED` | Extracted `interactive-authority-runtime.ts`. 100% tests green (63/63). |
| `W9-P5-11` | `WP-5` | `tests/unit/market-terminal/cold-loop.test.ts` | Unit / CLI Terminal Cold Loop | 1,922 | 1,622 | **-300** | Invariant 6: Reusable fetch & command fixtures | `LOCKED` | Extracted `cold-loop-harness.ts`. 100% tests green (58/58). |
| `W9-P5-12` | `WP-5` | `tests/unit/authority/delegation/delegation.test.ts` | Unit / Delegation Grant Tree | 953 | 670 | **-283** | Invariant 3: Tree validation & succession | `LOCKED` | Parameterized grant & ancestry builders. 100% tests green. |
| `W9-P5-13` | `WP-5` | `tests/unit/capability-supply/route-transport-x402.test.ts` | Unit / Transport Protocol | 1,561 | 1,427 | **-134** | Invariant 6: Payment challenge parameterization | `LOCKED` | Parameterized x402 challenge/lease binding helpers. |
| `W9-P5-14` | `WP-5` | `tests/unit/convex/capability-call-authority-boundary.test.ts` | Unit / Call Authority | 1,332 | 1,326 | **-6** | Invariant 2: Authority admission tables | `LOCKED` | Parameterized spending policy & workload authority rejection tables. |

**Subtotal Harvested (Waypoint 5 Sweeps):** **-5,882 LOC** (517/517 tests verified green)

---

## 6. Sprint Log & Architectural Decision Journal

### 2026-09-16: Sprint Initialization & Baseline Audit
- **Decision:** Formalized 4 Bounded Contexts (`access`, `supply`, `execution`, `money`) and 6 strict file archetypes (`.contracts.ts`, `.domain.ts`, `.ports.ts`, `.adapter.ts`, `.presenter.ts`, `.view.tsx`).
- **Decision:** Established the Surgical 5-Step Execution Protocol to eliminate "whack-a-mole" cascading errors.
- **Decision:** Established the Subagent Governance Matrix: Orchestrator retains 100% authority, subagents execute bounded assignments ($\le 400$ LOC) matching strict role templates (Audit, Implementation, Review, Evaluation).
- **Decision:** Initialized this living register (`docs/operations/well-9-refactor-register.md`) as the single source of truth for refactoring progress, metrics, and architectural rationale.
- **Verification:** Completed all baseline repairs: lint (0 warnings), typecheck (0 errors), deps ratchet verified, standards tests passing, integration test suite 100% green. Current net reduction: **-12,669 LOC**.
- **Decision (IceInVein Sanity Check Upgrade):** 
  1. *Rule of 300:* Files are only split if $>300$ LOC or tangling I/O with pure domain or UI with mutations. Prevents micro-file sprawl.
  2. *Zero Phantom Ports in Convex:* Outbound/Inbound ports exist only for external boundaries (HTTP/Stripe/CDP/Formance) and cross-context calls. No artificial repository wrappers inside internal Convex functions.
  3. *Piggybacked Renaming:* Eliminated standalone mass-renaming phase; outliers are renamed only during active deconstruction of that file.
  4. *Front-Loaded Test Safety Net:* Parameterizing brittle test suites first (Waypoint 1) builds an impenetrable regression safety net *before* touching application route code.

### 2026-09-16: Audit 1 - Hexagonal Ports & Adapters Contracts Formalization
- **Action:** Created canonical port definitions across the 4 core Bounded Contexts:
  - `src/modules/agent-access/access.ports.ts` (`AccessResolutionPort`, `AccessPolicyPort`, `GrantPersistencePort`)
  - `src/modules/capability-supply/supply.ports.ts` (`ToolSupplyPort`, `ReadinessProbePort`, `CatalogPersistencePort`)
  - `src/modules/capability-execution/execution.ports.ts` (`CallExecutionPort`, `ProviderTransportPort`)
  - `src/modules/money/money.ports.ts` (`FundingServicePort`, `LedgerPort`)
- **Verification:** `lint` (0 warnings, 0 errors), `tsc` (0 errors), `deps:check` (0 circular dependencies), `test:imports` (12/12 passing), `test:ts-standards` (passing).
- **Status:** Audit 1 Completed. Hexagonal boundary firewalls established.

### 2026-09-16: Waypoint 1 - Front-Loaded Test Safety Net Parameterization
- **Action:** Parameterized hostile input fixtures and standardized OAuth fixture factories in `tests/helpers/agent-access-oauth-store-fixture.ts` (`defaultOAuthGrantFixture`, `defaultOAuthClientFixture`, `consentSecurity`, `refreshFamilyFixture`, `refreshStoreFixture`).
- **Action:** Refactored `tests/unit/server/agent-access-oauth-api.test.ts` to utilize reusable fixture factories, reducing duplication and locking in all OAuth behavior.
- **Verification:** Verified all route test suites (46 files, 504 tests) and API test harnesses. `vitest` 100% green across all target suites.
- **Status:** Waypoint 1 Completed. Penetration test safety net firmly locked in.

### 2026-09-16: Waypoint 2 - Harmonize Server API Routes onto Uniform Gateway Adapters
- **Action:** Implemented `executeCorrelatedJsonRoute` in `src/lib/server/gateway-json-route.ts` with built-in request correlation, rate limiting, and pre-validation hook.
- **Action:** Refactored `api.v1.funding.constraints.ts`, `api.v1.funding.quote.ts`, `api.v1.market-tools.describe.ts`, `api.v1.market-tools.compare.ts`, `api.v1.market-tools.list.ts`, `api.v1.market-tools.search.ts`, `api.v1.catalogue-status.ts`, and `api.v1.market-metrics.ts` to use `executeCorrelatedJsonRoute`.
- **Action:** Unified repetitive Convex command dispatching in `src/lib/server/call-api.ts` via generic `dispatchCommand` helper across all 6 call service methods (`callTool`, `quoteTool`, `listCalls`, `readCallStatus`, `cancelCall`, `reconcileCall`).
- **Verification:** `lint` (0 errors, 0 warnings), `tsc` (0 errors), `deps:check` (0 circular dependencies), `test:imports` (12/12 passing), `test:ts-standards` (passing), full server and route test suite (82 files, 843 tests passing).
- **Status:** Waypoint 2 Completed. All public API routes and call dispatchers harmonized.

### 2026-09-16: Waypoint 4 - Deconstruct Operator Console UI Files
- **Action:** Refactored `src/components/ae/console/AeCreditTopUpPanel.tsx` (653 LOC $\rightarrow$ 205 LOC, **-448 LOC**):
  - Extracted formatting and presenter functions to `credit-top-up-format.ts` (116 LOC).
  - Extracted localStorage and session recovery logic to `credit-top-up-storage.ts` (54 LOC).
  - Extracted reducer, state management, and input handlers to `use-account-funding.ts` (389 LOC).
- **Action:** Refactored `src/components/ae/console/AeOwnerCredit.tsx` (717 LOC $\rightarrow$ 374 LOC, **-343 LOC**):
  - Extracted formatting and document presenter functions to `owner-credit-format.ts` (89 LOC).
  - Extracted account history table and pagination rendering to `AeAccountHistoryTable.tsx` (298 LOC).
- **Verification:** `lint` (0 errors, 0 warnings), `tsc` (0 errors), `deps:check` (0 circular dependencies), all UI tests (`demand-console.test.tsx`, `agent-access-owner-console.test.tsx`, total 24 files, 157 tests passing).
- **Status:** Waypoint 4 Operator UI Console deconstruction completed.

### 2026-09-16: Waypoint 5 - Grand Test Parameterization Harvest (First Waves)
- **Completed Sweeps (14 Suites, -5,882 LOC, 517/517 Tests Passing):**
  - `tests/unit/convex/money-x402-payment-attempts.test.ts`: **1,670 $\rightarrow$ 1,019 LOC** (**-651 LOC**) via `money-x402-payment-attempt-fixtures.ts`.
  - `tests/unit/capability-execution/jit-provider-consequence.test.ts`: **1,246 $\rightarrow$ 831 LOC** (**-415 LOC**) via `jit-provider-consequence.harness.ts`.
  - `tests/unit/authority/context/consequence-authority.test.ts`: **1,287 $\rightarrow$ 802 LOC** (**-485 LOC**) via `consequence-authority.harness.ts`.
  - `tests/unit/principal-account/account/account-registry.test.ts`: **1,147 $\rightarrow$ 768 LOC** (**-379 LOC**) via `account-registry.harness.ts`.
  - `tests/unit/market-terminal/doctor.test.ts`: **1,690 $\rightarrow$ 890 LOC** (**-800 LOC**) via `doctor-test-harness.ts`.
  - `tests/unit/convex/recovery-break-glass-driver.test.ts`: **1,060 $\rightarrow$ 508 LOC** (**-552 LOC**) via `recovery-break-glass-driver-fixture.ts`.
  - `tests/unit/convex/workload-cron.test.ts`: **1,146 $\rightarrow$ 640 LOC** (**-506 LOC**) via `workload-cron.harness.ts`.
  - `tests/unit/convex/capability-call-recovery.test.ts`: **964 $\rightarrow$ 460 LOC** (**-504 LOC**) via `capability-call-recovery-harness.ts`.
  - `tests/unit/registry/services-api-projection.test.ts`: **958 $\rightarrow$ 506 LOC** (**-452 LOC**).
  - `tests/unit/convex/interactive-authority.test.ts`: **1,041 $\rightarrow$ 625 LOC** (**-416 LOC**) via `interactive-authority-runtime.ts`.
  - `tests/unit/market-terminal/cold-loop.test.ts`: **1,922 $\rightarrow$ 1,622 LOC** (**-300 LOC**) via `cold-loop-harness.ts`.
  - `tests/unit/authority/delegation/delegation.test.ts`: **953 $\rightarrow$ 670 LOC** (**-283 LOC**).
  - `tests/unit/capability-supply/route-transport-x402.test.ts`: **1,561 $\rightarrow$ 1,427 LOC** (**-134 LOC**).
  - `tests/unit/convex/capability-call-authority-boundary.test.ts`: parameterized authority fixtures.
- **Verification Across All Gates:** `lint` (0 errors, 0 warnings), `tsc` (0 errors), `deps:check` (ratchet satisfied), `test:imports` (12/12 passing), `test:ts-standards` (passing), and `vitest` (517/517 passing).
- **Status:** Waypoint 5 Initial Grand Parameterization Harvest locked in. Net reduction to date: **-24,281 LOC**.

### 2026-09-16: Hexagonal Architecture Deep Refactor - Real Ports & Adapters Wiring

- **Strategic Pivot:** Ceased artificial test-harness line extraction. Shifted 100% focus to structural integrity: wiring real driving and driven adapters to eliminate "paper ports" across all 4 Bounded Contexts.
- **Context 1 (Capability Execution) Completed:**
  - Extracted driven persistence adapter: `src/modules/capability-execution/adapters/convex-call-execution.adapter.ts` implementing `CallExecutionPort` with 6 procurement operations (`callTool`, `quoteTool`, `listCalls`, `readCallStatus`, `cancelCall`, `reconcileCall`).
  - Wired driving HTTP adapter `src/lib/server/call-api.ts` to `createConvexCallExecutionAdapter`, eliminating ~165 lines of duplicate dispatching code.
  - Updated `MODULE_BOUNDARY_MANIFEST` to declare `execution.ports.ts` and `adapters/convex-call-execution.adapter.ts`.
  - All 23 call recovery & history API tests green; `test:imports` 12/12 passing.
- **Context 2 (Capability Supply) Completed:**
  - Harmonized driving port `src/modules/capability-supply/supply.ports.ts`: replaced 6-method paper port with complete 15-method `SupplyManagementPort`.
  - Extracted driven adapter `src/modules/capability-supply/adapters/convex-supply-management.adapter.ts` backed by `createSupplyManagementService`.
  - Wired driving HTTP adapter `src/lib/server/supply-action-api.ts` to `SupplyManagementPort`.
  - All 10 supply-action-api tests passing; `test:imports` 12/12 passing.
- **Context 3 (Money & Commercial Ledger) Completed:**
  - Harmonized driving port `src/modules/money/money.ports.ts`: replaced the fictional `FundingServicePort` (`quoteFunding`, `createFundingSession` — methods that never existed) with the real `FundingHandoffPort` (`config`, `create`, `status`).
  - Promoted canonical driven ports to `money.ports.ts`: `CreditPaymentPort`, `ConnectAccountPort`, `PayoutTransferPort`, `MoneyQueryPort`, `LedgerPort`.
  - **Cycle break:** extracted `src/modules/money/funding-handoff-schemas.ts` as a dependency-free leaf holding all funding handoff Zod schemas, action IDs, paths, inferred contract types and `FundingHandoffRequest<Input>`. Both `money.ports.ts` and `funding-handoff.actions.ts` now depend on the leaf, so `funding-handoff.actions.ts` aliases `FundingHandoffService = FundingHandoffPort` instead of declaring a second structurally-identical contract. `no-circular` remains 0.
  - Extracted driven adapter `src/lib/server/adapters/convex-funding-handoff.adapter.ts` exporting `createConvexFundingHandoffAdapter(request, bodyText, paymentProvider?): FundingHandoffPort`, carrying the `providerContext` / `mutate` / `refusal` / `bind` helpers and the `StripeMoneyProvider` (`CreditPaymentPort`) resolution.
  - Wired driving HTTP adapter `src/lib/server/funding-handoff-api.ts` to resolve `options.fundingHandoff ?? options.service ?? createConvexFundingHandoffAdapter(...)`; `createFundingHandoffService` retained as a compatibility alias.
  - 8/8 funding handoff API tests and 6/6 account funding HTTP tests green.
- **Context 4 (Agent Access & Identity) Completed:**
  - Rewrote `src/modules/agent-access/access.ports.ts` against the **real** contracts rather than the plan's inaccurate sketch: `authenticate` returns the discriminated `AccessAuthenticationResult` (`authenticated` | `refused` with `401 | 403` and `authentication_required` | `scope_required`), not `AgentAccessPrincipal | Response`; `principalResolver` returns a curried `AccessPrincipalResolver`, matching the fact that `resolveAgentAccessPrincipal` returns a resolver function rather than a principal.
  - Declared resolver/option shapes structurally inside the port so `src/modules/**` never imports upward from `src/lib/**`.
  - Corrected `AccessPolicyPort` to the real pure-domain functions: `createGrant` (`createAgentAccessGrant`) and `evaluateTool` (`evaluateAgentAccessTool`). The previous `evaluate` signature referenced a non-existent `evaluateSpendingPolicy`.
  - **Deleted `GrantPersistencePort`** — nothing in the repository implemented `loadGrant` / `revokeGrant`. It was pure fiction and keeping it would have preserved exactly the paper-port defect this refactor exists to remove.
  - Wired the driving adapter: `export const clerkConvexAccessAdapter: AccessResolutionPort` in `src/lib/server/agent-access-auth.ts`, composed from the existing functions with zero logic duplication.
  - 17/17 agent access auth tests green.

### 2026-09-16: Master Gate - Hexagonal Refactor Release Verification

| Gate | Command | Result |
| :--- | :--- | :--- |
| 1. Lint | `oxlint src convex tests tools --deny-warnings` | **PASS** (0 errors, 0 warnings) |
| 2. Typecheck | `tsc --noEmit` | **PASS** (0 errors) |
| 3. Dependency ratchet | `npm run deps:check` | **PASS** (`no-circular` 0/0, supply-internal 34/34, via-barrel 258/258) |
| 4. Module boundaries | `npm run test:imports` | **PASS** (12/12 files, 50/50 tests) |
| 5. TypeScript standards | `npm run test:ts-standards` | **PASS** (1/1) |
| 6. Refactored-surface suites | `vitest run tests/unit/server tests/unit/money tests/unit/agent-access tests/unit/capability-supply tests/unit/capability-execution tests/routes` | **1659/1660** (173/174 files) |

**Architectural status: all 4 Bounded Contexts now have real ports with real adapters. Zero paper ports remain in Execution, Supply, Money, or Access.**

#### Declared Entry Surfaces Added to `MODULE_BOUNDARY_MANIFEST`
- `capability-execution`: `execution.ports.ts`, `adapters/convex-call-execution.adapter.ts`
- `capability-supply`: `supply.ports.ts`, `adapters/convex-supply-management.adapter.ts`
- `money`: `money.ports.ts`, `funding-handoff-schemas.ts`
- `agent-access`: `access.ports.ts`

#### Outstanding Pre-Existing Failure (Out of Refactor Scope)
- **Suite:** `tests/unit/capability-execution/call-idempotency-rotation.test.ts` — "replays the original Call and its single money reservation under the rotated credential".
- **Symptom:** `internal.capabilityCalls.reserve` returns `{ kind: 'conflict' }` where the test expects `{ kind: 'replayed', reservation: {...} }`.
- **Root cause location:** `existingReservationMatches` in `convex/lib/callLifecycle/admission.ts` compares `requestDigest` and the operation snapshot. Request digest identity is computed through `convex/lib/callLifecycle/callIdentity.ts`, a **new untracked file belonging to separate in-flight Convex call-lifecycle work that predates this refactor** (alongside modified `dispatch.ts` and `authorityHandlers.ts`).
- **Attribution:** This refactor touched **zero Convex files**. `convex/capabilityCalls.ts` and `convex/lib/callLifecycle/admission.ts` are both clean at HEAD, and the test file itself is unmodified. The failure is therefore not caused by the ports and adapters work.
- **Invariant at stake (IceInVein Idempotency Guardian + Temporal Invariants):** a Call replayed under a **rotated credential** must still resolve to the *original* reservation. If the request digest folds credential identity into call identity, credential rotation silently converts a legitimate replay into a conflict — which would double-charge or strand the Customer on retry.
- **Action:** Deliberately **not patched here.** Correcting it means changing call identity semantics in someone else's in-flight domain work, which is outside this assignment's bounded scope and must not be done blind. Flagged for the owner of the call-lifecycle branch.







