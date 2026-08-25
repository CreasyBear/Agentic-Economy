# Plan: AE Full-Maturity Platform

Depth: tree 6
Mode: orchestrated
Target: operated L3 platform with L4-compatible seams

## Contract

This contract is frozen before implementation fan-out. Amendments require a
status-log entry naming the affected leaves and must be made before those leaves
resume.

### Public interfaces

- `POST /api/v1/operations/resolve`
- `POST /api/v1/quotes`
- `POST /api/v1/operations/call`
- `GET /api/v1/invocations/{ref}`
- `POST /api/v1/invocations/{ref}/continue`
- `POST /api/v1/invocations/{ref}/cancel`
- Signed, replayable, at-least-once invocation and settlement webhooks.
- HTTP, MCP and CLI share schemas, scopes, problem codes and idempotency rules.
- `/api/v1/operations/call` is canonical; stale `/execute` documentation is corrected.
- Unknown additive provider states remain `unknown`.

### Domain ownership

- `principal-account` exclusively owns Principal, Account, AccountOwnership,
  Membership, ExternalIdentityBinding, Credential, Harness and RecoveryPolicy.
- `authority` exclusively owns generation-bound Grants and authorization decisions.
- `connections` owns connection lifecycle and secret references, never secret material.
- `commercial` owns Operation, Offer, Resolution, Quote and Order.
- `invocation-core` owns Invocation identity; runtime attempts are separate records.
- `money` owns Settlement, reservation, refund, dispute and supplier-entitlement facts.
- `evidence` owns immutable authority, invocation, usage, money and audit evidence.
- `registry` and operator views are projections, never alternative sources of truth.
- Convex is the sole writable primary. Infisical stores secret material. The external
  archive is append-only recovery/evidence, not a live writable application database.

### Identifier and naming rules

- Stable resource references are independent of credentials and provider identifiers.
- Every consequential record carries actor principal, active account, authority
  generation, correlation/idempotency reference and relevant commercial roles.
- Credentials authenticate principals but never own resources.
- Server time is authoritative for expiry and consequence admission.
- Convex index names include all indexed fields in order.
- Unknown external enums are preserved rather than coerced.

### Account and authority semantics

- Autonomous agents may own Accounts directly.
- Each protected action has exactly one active Account context.
- Cross-account actions are explicit, attributed transactions.
- Human, organization, agent and workload principals use the same authorization path.
- Child grants can only narrow ancestor scope, budget, expiry and resources.
- Delegation cycles are rejected. Revocation advances a generation.
- New consequential work requires live current authority. Admitted work finishes
  against a pinned snapshot or becomes reconcilable/uncertain.
- Recovery is declared per Account: threshold recovery with delay/freeze or explicit
  no-transfer recovery. Operator freeze does not imply transfer authority.
- Operators never impersonate users; privileged actions retain dual attribution.

### Commercial and execution state machines

`Operation -> Offer -> Resolution -> Quote -> Order -> Invocation -> Attempt -> Outcome -> Settlement`

- Quote pins buyer/account, supplier Offer, price, terms, readiness, provider version,
  authority generation and expiry.
- Accepting a Quote creates one Order under idempotent admission.
- Invocation is not the commercial commitment; it fulfills an Order.
- Ambiguous irreversible effects are never blindly retried.
- Outcomes include success, failure, cancelled, input-required and uncertain.
- L3 money posture is Australian B2B reseller: AE sells completed execution in AUD
  and pays suppliers from AE treasury. No customer stored value or transfers.

### Secret contract

- Managed Infisical Cloud is accessed through a provider-neutral `SecretStore` port.
- Platform boot secrets and customer connector material use separate vault projects.
- Workloads authenticate to Infisical with OIDC machine identities and short-lived tokens.
- Customer connector material is fetched just in time, held only in memory and never
  stored in Convex, environment variables, logs, responses, evidence or support views.
- Rotation is two-phase: write and validate a new vault generation, then atomically
  advance the active Convex secret-generation pointer.
- New consequential calls fail closed while the vault is unavailable.

### Error and versioning contract

- Public errors use stable problem codes and correlation references.
- Retryability and whether an external effect may have occurred are explicit.
- Public v1 begins a 180-day default breaking-change deprecation window at GA,
  except immediate security withdrawals with a migration notice.

### Test contract

- New canonical domain modules and changed critical paths require 100% line, branch,
  function and statement coverage.
- Existing code follows a no-regression coverage ratchet.
- Authority and money invariants require property/state-machine and concurrency tests.
- Every protected resource/surface participates in a generated isolation matrix.
- Leaf tests do not substitute for phase integration gates.
- Hosted evidence must name the exact deployed source revision.

### Shared-file ownership

Feature leaves do not edit shared composition files. The active phase integration
driver exclusively owns `convex/schema.ts`, `convex/http.ts`, `src/routeTree.gen.ts`,
root `package.json`, root configuration, public cross-context barrels and generated
files. Leaves expose context-local typed exports for the driver to compose.

## Tree

- 1 AE L3 maturity
  - 1.1 Foundation ................................ `gates/node-foundation.md`
    - Phase 0 Trustworthy baseline ................. `gates/phase-0.md`
      - P0-01 route/codegen baseline ............... `gates/leaf-P0-01.md`
      - P0-02 contract inventory and ADR repair .... `gates/leaf-P0-02.md`
      - P0-03 release/coverage/package integrity ... `gates/leaf-P0-03.md`
    - Phase 1 Principals and Accounts .............. `gates/phase-1.md`
      - P1-01 Principal registry ................... `gates/leaf-P1-01.md`
      - P1-02 Account lifecycle .................... `gates/leaf-P1-02.md`
      - P1-03 Identity bindings and credentials .... `gates/leaf-P1-03.md`
      - P1-04 Workload context and reset ........... `gates/leaf-P1-04.md`
    - Phase 2 Authority/connections/secrets ........ `gates/phase-2.md`
      - P2-01 Memberships and delegation ........... `gates/leaf-P2-01.md`
      - P2-02 Cross-surface authorization .......... `gates/leaf-P2-02.md`
      - P2-03 Connection lifecycle ................. `gates/leaf-P2-03.md`
      - P2-04 Infisical and rotation ............... `gates/leaf-P2-04.md`
      - P2-05 Recovery/isolation/secret proof ....... `gates/leaf-P2-05.md`
  - 1.2 Commercial transaction kernel ............. `gates/node-commerce.md`
    - Phase 3 Commercial model ..................... `gates/phase-3.md`
      - P3-01 Operation and Offer .................. `gates/leaf-P3-01.md`
      - P3-02 Resolution and Quote ................. `gates/leaf-P3-02.md`
      - P3-03 Idempotent Order ..................... `gates/leaf-P3-03.md`
      - P3-04 Public commercial contracts .......... `gates/leaf-P3-04.md`
    - Phase 4 Invocation/evidence/money ............ `gates/phase-4.md`
      - P4-01 Invocation-root merge ................ `gates/leaf-P4-01.md`
      - P4-02 Async/continuation/uncertainty ........ `gates/leaf-P4-02.md`
      - P4-03 Admission and limits ................. `gates/leaf-P4-03.md`
      - P4-04 Reseller money state machine ......... `gates/leaf-P4-04.md`
      - P4-05 Evidence archive/reconciliation ...... `gates/leaf-P4-05.md`
  - 1.3 Operated agent platform .................... `gates/node-operations.md`
    - Phase 5 Reliability/resilience/release ....... `gates/phase-5.md`
      - P5-01 Observability and SLOs ............... `gates/leaf-P5-01.md`
      - P5-02 Incidents/runbooks/error budgets ..... `gates/leaf-P5-02.md`
      - P5-03 Backup/archive/restore ............... `gates/leaf-P5-03.md`
      - P5-04 Canary/rollback/migration ............ `gates/leaf-P5-04.md`
    - Phase 6 Agent APIs/connectors/distribution ... `gates/phase-6.md`
      - P6-01 HTTP agent API ....................... `gates/leaf-P6-01.md`
      - P6-02 Agent OAuth and token exchange ....... `gates/leaf-P6-02.md`
      - P6-03 MCP/CLI/SDK/docs parity .............. `gates/leaf-P6-03.md`
      - P6-04 Connectors and webhooks .............. `gates/leaf-P6-04.md`
      - P6-05 Harness pilot/truth probes ........... `gates/leaf-P6-05.md`
    - Phase 7 Scale/fairness/cost .................. `gates/phase-7.md`
      - P7-01 Materialized search .................. `gates/leaf-P7-01.md`
      - P7-02 Pagination and fleet fairness ........ `gates/leaf-P7-02.md`
      - P7-03 Capacity and abuse load .............. `gates/leaf-P7-03.md`
      - P7-04 Cost and extraction triggers ......... `gates/leaf-P7-04.md`
    - Phase 8 Support/lifecycle/integrity .......... `gates/phase-8.md`
      - P8-01 Operator support ..................... `gates/leaf-P8-01.md`
      - P8-02 Export/deletion/succession ........... `gates/leaf-P8-02.md`
      - P8-03 Economic abuse controls .............. `gates/leaf-P8-03.md`
      - P8-04 Disputes and reputation .............. `gates/leaf-P8-04.md`
  - 1.4 L3 completion .............................. `gates/node-ga.md`
    - Phase 9 Readiness and GA ..................... `gates/phase-9.md`
      - P9-01 Security/resilience/revision proof ... `gates/leaf-P9-01.md`
      - P9-02 SLO and commercial soak .............. `gates/leaf-P9-02.md`
      - P9-03 GA compatibility/evidence package .... `gates/leaf-P9-03.md`

## Parallel lanes

- Sequential: ledger -> Phase 0 -> Phase 1 -> Phase 2.
- After Phase 2: Lane A Phase 3 -> Phase 4; Lane B Phase 5 foundations;
  Lane C Phase 6 resolve/contracts/connectors.
- Phase 4 merges before Lane C integrates call/continuation behavior.
- Phase 7 and Phase 8 may then run in parallel.
- Phase 9 waits for every program-branch gate.

## Completion targets

- Public control/transaction availability: 99.9% monthly.
- Authorization p95: <150 ms.
- Top-20 resolution p95: <500 ms.
- AE admission overhead p95: <400 ms excluding supplier execution.
- Consequential evidence RPO: 15 minutes; reconstructible projections: 24 hours.
- Service RTO: 4 hours.
- One-stamp envelope: 10,000 active accounts; 100,000 principals; 100,000
  admitted Operations/Offers; 1,000 new invocations/minute sustained; 5,000/minute
  for five minutes; 500 concurrent supplier calls; 10x hot-account skew; 5x retry storm.
- Ninety-day gate: 20 paying organizations; 1,000 paid invocations; 30% repeat;
  zero AE duplicate charges/effects; AE refunds <1%; manual reconciliation <0.5%;
  no unknown money state >24 hours; positive contribution margin; counsel approval.

## Status log

- 2026-08-25: execution contract and tree created before implementation work.
- 2026-08-25: P0-01 verified by worker and independently rerun by driver; 7/7 leaf gates met, 3/3 maturity tests passed, typecheck passed.
- 2026-08-25: P0-02 verified by worker and independently rerun by driver; 7/7 leaf gates met, 4/4 maturity tests passed, inventory remeasured at 39 HTTP, 14 MCP, 12 CLI and 5 planned routes.
- 2026-08-25: P0-03 verified by worker and independently rerun by driver; 7/7 leaf gates met, 10/10 targeted maturity/release-contract tests passed, source-integrity and CLI package proofs passed, 738-file coverage ratchet calibrated from measured runs, and npm audit reported zero vulnerabilities.
- 2026-08-25: P0-03 integration defect pass superseded the earlier 738-file V8 calibration after repeated identical runs exposed order-sensitive counters. The release gate now uses deterministic Istanbul instrumentation over 699 executable source files; an explicit async CodeBlock test closes the only remaining order-sensitive path. The earlier 738 count is retained as historical evidence and is not a completion claim.
- 2026-08-25: User execution directive — Phase 0 closes in this task. Each subsequent phase runs in its own Codex task using the GSD phase execution skill, delegates discrete bounded leaves to subagents, preserves the frozen Unlazy gates, and stops at its independent phase gate. Dependent phase tasks are dispatched only after predecessor integration; Phase 3/5/6 fan-out begins only after Phase 2, and Phase 6 call/continuation integration waits for Phase 4.
- 2026-08-25: Phase 0 integration independently verified. All 21 child gates and all 6 phase gates are met; the exact Node 22 source release gate, zero-vulnerability audit, generated-source integrity, deterministic 699-file coverage ratchet, package proof and production build passed. Phase 1 may now start in its own orchestrated task.
- 2026-08-25: Phase 1 dispatch attempted only after the verified Phase 0 boundary. The Codex desktop task service did not return saved-project, task-list or task-creation requests, and no Phase 1 task was persisted. Phase 1 remains unstarted; no fallback implementation was run in the Phase 0 task.
- 2026-08-25: P1-01 completed by typed GSD executor and independently rerun by the Phase 1 driver. The frozen leaf ledger reports ALL MET (7/7) with no ABANDON; 3 maturity and 14 focused unit assertions passed under Node 22, plus typecheck and owned lint. `principalTables` remains context-local for driver composition.
- 2026-08-25: P1-02 completed by typed GSD executor and independently rerun by the Phase 1 driver. The frozen leaf ledger reports ALL MET (7/7) with no ABANDON; 5 maturity and 28 focused unit assertions passed under Node 22, and the owned Account module measured 100% statements (279/279), branches (143/143), functions (62/62), and lines (257/257), plus typecheck and owned lint. `accountTables` remains context-local for driver composition.
- 2026-08-25: P1-03 completed by typed GSD executor and independently rerun by the Phase 1 driver. The frozen leaf ledger reports ALL MET (7/7) with no ABANDON; 5 maturity and 27 focused unit assertions passed under Node 22, the three-leaf regression sweep passed 82/82 assertions, and the owned identity/credential module measured 100% statements (244/244), branches (122/122), functions (46/46), and lines (234/234), plus typecheck and owned lint. Identity bindings and credentials remain context-local for driver composition and never own resources.
- 2026-08-25: Locked Phase 1 acceptance boundary — this task may complete Phase 1 implementation and its internal leaf/integration verification only, then must hand back the exact branch/ref, scoped commits, changed-file inventory, measured gate results, and known risks. Its completion is not final acceptance. Phase 2 remains blocked until a fresh context-independent parent task validates, reviews, evaluates, and adversarially/red-team tests the phase with Ox, and every finding is repaired and independently rechecked.
- 2026-08-25: P1-04 completed by typed GSD executor and independently rerun by the Phase 1 driver. The frozen leaf ledger reports ALL MET (7/7) with no ABANDON; 5 maturity and 20 focused unit assertions passed under Node 22, and the owned workload/reset modules measured 100% statements (184/184), branches (148/148), functions (46/46), and lines (165/165), plus typecheck and owned lint. Reset remains dry-run by default, digest-bound, exact-targeted, idempotent, canonical-table-protecting, and contains no live Convex deletion port.
- 2026-08-25: Phase 1 independent verification found an active-stranger Account-context bypass despite mechanically green ledgers. P1-02 was reopened under its original typed executor: `requireActiveContext` and cross-Account attribution now require the actor to own or hold active membership in the single selected active Account, while the explicit counterparty remains active, distinct and revision-pinned without becoming a second Account context. Driver rechecks passed 34/34 P1-02 and 112/112 combined assertions, 7/7 P1-02 gates, and 100% Account coverage (287/287 statements, 147/147 branches, 63/63 functions, 263/263 lines).
- 2026-08-25: The broader Phase 1 release defect pass found and repaired two integration defects: the exact Convex schema inventory still expected the 54-table Phase 0 schema instead of all 60 current tables, and the critical coverage-file discovery treated pure zero-statement TypeScript re-export seams as missing executable coverage. The schema contract now enumerates all six canonical Phase 1 tables and their indexes. Coverage discovery uses TypeScript AST classification, with executable critical files still held to 100% and no baseline allowance widened.
- 2026-08-25: Phase 1 post-codegen release evidence passed under Node 22: 2,564 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility E2E, 7 paid-operation E2E, `CLI_PACKAGE_PASS`, 2,771 maturity-coverage assertions across 403 files, `COVERAGE_RATCHET_PASS files=708`, and the production build. The exact `npm run test:release:source` command is NOT MET in this task: it passed the deployment manifest, 421 conformance and 85 chat-conformance assertions, then failed at read-only Convex codegen because this task's CLI identity has no access to the selected deployment. Generated-source integrity and the exact release wrapper therefore remain unaccepted pending the fresh context-independent review task with authorized Convex configuration.
- 2026-08-25: The earlier exact-release cloud-auth blocker was resolved without changing the release command or tracked configuration by using Convex CLI's supported anonymous local deployment mode with a local-only Clerk issuer placeholder. Under Node 22, the unchanged `npm run test:release:source` command passed end to end: deployment-manifest validation; 421 conformance and 85 chat-conformance assertions; `MATURITY_RELEASE_INTEGRITY_PASS`; 2,567 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility E2E and 7 paid-operation E2E assertions; `CLI_PACKAGE_PASS`; 2,771 maturity-coverage assertions across 403 files; `COVERAGE_RATCHET_PASS files=708`; and the production build. Generated Convex files remained clean. This closes the internal Phase 1 release gate only: final acceptance still belongs to the fresh context-independent Ox/red-team review task, and Phase 2 remains blocked until that task passes or every finding is repaired and independently rechecked.
- 2026-08-25: The fresh Phase 1 Ox source review at commits `84ebe2017` and `028d07bba` returned `CHANGES_REQUIRED` for three source-level failures: caller-constructed Account succession authority, reset receipts able to claim deletion without trusted execution/post-state reconciliation, and a frozen import/release gate that depended on an absent ignored CLI build artifact. These findings reopened Phase 1 only; no Phase 2 work began.
- 2026-08-25: Bounded repair commits `58a73a444`, `073d5fce6` and `3f75013c5` close those three findings without changing the frozen outcomes. Succession now resolves canonical one-use Account-bound authorization from trusted unique verified participant approvals; reset replay now resolves a trusted execution/transaction and reconciles zero legacy targets with unchanged protected canonical counts; the import gate now inspects tracked CLI TypeScript source and is independent of `packages/cli/dist`. Both former exploit reproducers now assert safe rejection. Targeted changed-path coverage is 100% for Account (349/349 statements, 217/217 branches, 73/73 functions, 324/324 lines) and reset (131/131 statements, 138/138 branches, 42/42 functions, 119/119 lines).
- 2026-08-25: Fresh-clone repair proof at exact ref `39e2283cc2221a6cce51db12f5ccf72a572c59d1` passed frozen G3 with `packages/cli/dist` absent before and after, then passed the unchanged Node 22 `npm run test:release:source`: 421 conformance, 85 chat-conformance, 2,575 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility E2E, 7 paid-operation E2E, `CLI_PACKAGE_PASS`, 2,779 maturity-coverage assertions across 403 files, `COVERAGE_RATCHET_PASS files=708`, generated-source integrity and production build. The tracked checkout remained clean. This is internal repair evidence only: a new context-independent Ox review must return `SOURCE_ACCEPTED` or `SOURCE_ACCEPTED_EVIDENCE_OPEN` before Phase 2 may start.
- 2026-08-26: Final Phase 1 unblock source `ae284871d9d5bad40245182aefd6f2050d53b556` closed the three independent acceptance blockers: immutable succession creation attribution and creator binding, distinct reset mutation/evidence/reconciliation with exact attribution and atomic count proof, and hermetic transitive CLI dependency-closure enforcement. Frozen and repair gates passed 63/63 with zero operational ABANDON; targeted Account and reset coverage were 100%; a fresh checkout with no CLI dist passed the unchanged Node 22 release; and a new read-only Ox Alpha process returned B1/B2/B3 PASS with `SOURCE_ACCEPTED_EVIDENCE_OPEN`. Phase 2 is unblocked; hosted Clerk/cloud proof, the live reset adapter, and production cross-surface wiring remain owned later-gate evidence.
