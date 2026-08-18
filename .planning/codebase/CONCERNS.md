# Codebase Concerns

**Analysis Date:** 2026-08-18

## Tech Debt

**Oversized monolith modules:**
- Issue: Core money, worker, Answer, transport, and thread modules remain above maintainability thresholds (10k+ and 2k+ lines); P2-c extracted invoke/projection contracts, but these host modules remain oversized.
- Files: `convex/moneyLedger.ts` (10,790 lines), `convex/capabilityOperationInvocationWorker.ts` (2,990), `src/modules/answer/internal/answer-tool-use-agent.ts` (3,161), `src/modules/capability-supply/route-transport-runtime.ts` (2,507), `src/modules/answer-thread/internal/turn-orchestrator.ts` (2,060)
- Why: Incremental feature accretion remains on the exact-money, invocation-worker, Answer, transport, and thread spines despite the P2-c contract extraction.
- Impact: Small contract changes require wide diffs, merge conflicts, and hard-to-review money/worker/Answer/transport/thread regressions.
- Fix approach: Measure one concrete seam at a time and card any remaining module split separately; preserve runtime authorities and boundary tests.

**Action inventory vs end-state guardrail:**
- Issue: Product-frontier v2 pins 47 required actions; the operating model targets ≤14 active actions after quarantine.
- Files: `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json` (`schemaVersion: ae-product-frontier:v2`), `src/modules/actions/index.ts` (47 registered), `tests/imports/product-frontier-manifest.test.ts`, `tools/release/verify-product-frontier.mjs`
- Why: `quarantineFamilies` in the v2 manifest mark Customer Request, WorkTree, Study, and inquiries as `approved-pending-deprecation`, but those actions remain registered. P5-a product files landed at `1aaf4aa5`; freeze/deregister cards P5-b/c are not started.
- Impact: Every new action requires manifest surgery; agents still discover quarantined surfaces as first-class.
- Fix approach: Run P5-b freeze writes and P5-c deprecation notice — do not add net-new actions without a manifest update and a retirement plan.

**Dual paid HTTP invoke paths:**
- Issue: `/api/v1/operations/call` and `/api/v1/operations/execute` both delegate to `handleOperationInvokePost` but route literals are hardcoded in TanStack route files rather than read from `OPERATION_INVOKE_ROUTE_CONTRACT`.
- Files: `src/routes/api.v1.operations.call.ts`, `src/routes/api.v1.operations.execute.ts`, `src/modules/capability-execution/operation-invoke-entry.ts`, `tests/unit/routes/operation-invoke-route-binding.test.ts`
- Why: P1-e-2 dual-served `/execute` for compatibility while `/call` became canonical; route registration constraints prevented spreading contract fields into public descriptors.
- Impact: Silent drift if the contract path changes but route files are not updated; agent docs and CLI may disagree on the canonical door.
- Fix approach: Keep the binding test importing both route modules; when deprecating `/execute`, use Phase 5 cards for `Deprecation`/`Sunset` headers — do not re-expose `legacyPath` in public UCP/handshake projections (regression caught in P1-e-2 review).

**Release gate ordering hides cheap failures:**
- Issue: `test:ts-standards` and parts of `test:imports` run after the full unit suite in `test:release:source:after-codegen`.
- Files: `package.json` (`test:release:source:after-codegen`), `.planning/reset/RECEIPTS.md` (P0-d), `PAPERCUTS.md` (entries 181–182)
- Why: Historical composite gate layout; an unrelated unit failure masked three TS-standard violations for the length of settlement work.
- Impact: Violations accumulate undetected until an earlier suite goes green; wastes differential investigation time.
- Fix approach: Reorder gate scripts so static import/TS-standard scans run before `test:release:unit`, or add a fast preflight target invoked first.

**Custom Answer run loop vs `@convex-dev/agent`:**
- Issue: Answer uses a custom bounded AI SDK tool loop (`turns/agent.ts` → `answer-tool-use-agent.ts`). Persistence still lives in a 2,060-line `turn-orchestrator.ts`. `@convex-dev/agent` remains blocked on AI SDK v7 peer alignment.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turns/agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/harness/`, P2-a and P4 receipts in `.planning/reset/RECEIPTS.md`
- Why: `@convex-dev/agent` 0.6.4 peers `ai ^6.0.35`; v7 support is draft-only. P4 deleted `intent-router.ts` / `effective-answer-route.ts` but kept the custom loop and the orchestrator as lease/checkpoint host. P2-a forbids loop removal without a SDK↔Harness parity validator.
- Impact: Higher maintenance burden on tool accounting, checkpoints, and eval parity; risk of SDK drift on upgrade.
- Fix approach: Do not remove the custom loop until a SDK↔Harness parity validator exists; track `@convex-dev/agent` v7 readiness separately; split persistence from the 2k-line orchestrator only with a dedicated card.

**Dead action registration for storefront import:**
- Issue: `storefrontImportDraftAction` is imported in `src/modules/actions/index.ts` but omitted from the `actions` array; it is reachable only via a dedicated HTTP route and server function.
- Files: `src/modules/actions/index.ts`, `src/modules/storefront/storefront.actions.ts`, `src/routes/api.storefront.import-draft.ts`, `src/modules/storefront/storefront.functions.ts`
- Why: Partial surfacing during storefront work; noted in `.planning/reset/RECEIPTS.md` Phase 1 reconnaissance.
- Impact: MCP/CLI/agent discovery omits import-draft; two authority paths (HTTP vs action plane) diverge.
- Fix approach: Either register under a standard action with scope admission or delete the dead import and document HTTP-only access — do not leave both ambiguous.

**Package lockfile drift card still open:**
- Issue: `HK-lockfile-drift` remains `pending` in `.planning/reset/CARD-LEDGER.md` after `npm ci` EUSAGE on `main` was recorded; papercut 190 documents ~25 missing lock entries.
- Files: `package.json`, `package-lock.json`, `.planning/reset/RECEIPTS.md`, `PAPERCUTS.md`
- Why: Caret-range manifest changes landed without a resync commit.
- Impact: CI, fresh clones, and worktrees fail at install until manual `npm install`; undermines reproducible validator runs.
- Fix approach: Run `npm install` on Node 22, commit lockfile-only via `HK-lockfile-drift` card, enforce lockfile-only CI install.

**Unpushed `main` (67 commits):**
- Issue: Local `main` is 67 commits ahead of `origin/main`. The reset operating model caps unpushed product commits at 3 without a written reason.
- Files: `.planning/reset/OPERATING-MODEL.md`, git `main...origin/main`
- Why: Phase 1–5 product cards committed locally and not pushed.
- Impact: Hosted proof, CI on origin, and other worktrees cannot see accepted Phases 2–4; a machine loss would drop the reset.
- Fix approach: Founder push decision, then push or document an explicit hold. Do not open a new product card that assumes origin is current.

## Known Bugs

**Answer turn persistence fails after successful selection:**
- Symptoms: Explicit operation selection resolves then the turn returns HTTP 500 with `answer_turn_persist_failed`; fencing/persistence fails closed.
- Trigger: Collaborative goblin flows with exact candidate selection (e.g., cat lookup, CoinGecko threads).
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/routes/api.answer.turn.ts`, `PAPERCUTS.md` (entry 174)
- Workaround: None reliable in local smokes; retry may hit the same fence.
- Root cause: Under investigation; likely checkpoint/evidence size or turn-state fencing after selection.
- Blocked by: Reproducible local Convex + model fixture.

**Search-only Answer requests surface provider-failure copy:**
- Symptoms: Operation effects are correctly blocked and frozen candidates return, but completion prose claims the live lookup failed and exposes `route_tool_forbidden` semantics.
- Trigger: User instructs search-only / do-not-execute; model obeys effect guard but synthesis path uses failure recovery copy.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/answer-synthesizer.ts`, `PAPERCUTS.md` (entry 177)
- Workaround: User ignores misleading prose; frozen evidence is still correct.
- Root cause: Completion template does not distinguish intentional candidate-selection completion from provider failure.

**Persisted harness under-counts model requests:**
- Symptoms: Eval/harness summary and private telemetry report zero model requests while OpenRouter and agent results show two requests on selected-operation loops.
- Trigger: Selected-operation eval cases with two-step tool loops.
- Files: `tests/eval/answer-pipeline.test.ts`, `src/modules/answer-thread/internal/answer-run-summary.ts`, `PAPERCUTS.md` (entries 26, 174–175)
- Workaround: Unit contract in `tests/unit/answer/answer-selected-operation-loop.test.ts` proves accounting at one layer; persisted harness still wrong.
- Root cause: Harness collector not wired to the selected-operation two-step path.

**Worktree Convex component resolution breaks `projectSpine` tests:**
- Symptoms: `convex/projectSpine.test.ts` fails 3/4 in git worktrees with identical file content; passes on main full integration gate.
- Trigger: Worktree symlinks `node_modules` from main checkout (documented orchestrator bootstrap).
- Files: `convex/projectSpine.test.ts`, `.planning/reset/RECEIPTS.md` (`projectSpine` section), `PAPERCUTS.md` (entry 189)
- Workaround: Validate component-dependent tests only on main checkout, not worktree symlink layout.
- Root cause: Workflow/workpool component resolves against wrong root through symlinked `node_modules`.

**Local Answer turn 500 when Convex bundling fails:**
- Symptoms: Vite serves but `POST /api/answer/turn` returns 500; Convex codegen cannot bundle Node-only imports into default runtime.
- Trigger: Local stack without Convex backend; imports such as `network-guard`, Clerk keyless storage, `undici`.
- Files: `src/routes/api.answer.turn.ts`, `PAPERCUTS.md` (entries 30, 133–141)
- Workaround: Run full local Convex dev deployment before Answer smokes.
- Root cause: Default Convex runtime bundling constraints vs Node-only seams.

**Curated seed non-idempotent on restart:**
- Symptoms: `dev:local` reseed fails with `curated_provider_connection_refused:connection:exa:invalid_transition` against existing local state.
- Trigger: Routine local restart after prior seed.
- Files: `tools/dev/` seed entrypoints, `convex/curatedProviders.ts`, `PAPERCUTS.md` (entries 170, 57–58 in cleanup receipt)
- Workaround: Manual local DB reset/reseed.
- Root cause: Provider connection lifecycle assumes clean state; transition graph refuses re-application.

## Security Considerations

**Operation gateway routes lack HTTP-edge rate limits:**
- Risk: Unauthenticated or bearer-authenticated invoke/status/cancel/reconcile endpoints can be hammered at the edge; only Convex-side reservation limits apply.
- Files: `src/routes/api.v1.operations.call.ts`, `src/routes/api.v1.operations.execute.ts`, `src/routes/operations.invocations.$invocationRef.tsx`, `convex/capabilityOperationInvocations.ts` (lines ~470–483), `.planning/reset/RECEIPTS.md` (P1-d reconnaissance)
- Current mitigation: Grant/budget/concurrency limits inside Convex at reservation time; OAuth and public-read routes use `withHttpRateLimit` (`src/lib/server/rate-limit.ts`).
- Recommendations: Add HTTP-edge admission for invoke and lifecycle routes aligned with existing limiter names, or document explicit reliance on Convex-only limits and monitor abuse; any new gateway route must not bypass reservation limits.

**Local E2E authentication bypass surface:**
- Risk: `isLocalE2EAuthBypassEnabled()` strips Clerk middleware in local E2E; unauthenticated callers can reach server functions that authenticate to Convex with admin credentials.
- Files: `src/start.ts`, `src/lib/server/local-e2e-bypass.ts`, `src/lib/server/operation-approval-source.ts`, `tests/imports/faux-runtime-surfaces.test.ts`, `.planning/reset/RECEIPTS.md` (`HK-faux-runtime`)
- Current mitigation: Bypass relocated out of `capability-execution` deployable graph to `operation-approval-source.ts`; guards refuse in production; tests pin behavior.
- Recommendations: Never reintroduce bypass calls inside `src/modules/capability-execution/**`; keep faux-runtime guard wired into release imports when policy allows; treat local E2E endpoints as privileged test-only surfaces.

**Environment diagnostics can leak secret values:**
- Risk: Grepping `.env.local` for variable names prints matching values; papercut 27 records unrelated secrets exposed during x402 prerequisite checks.
- Files: `PAPERCUTS.md`, developer scripts under `tools/dev/`
- Current mitigation: `.env` files gitignored; agents instructed not to read secrets.
- Recommendations: Add a names-only env inventory command; ban value-printing greps in runbooks.

**Loosely typed refusal codes (historical regression class):**
- Risk: New invoke refusal codes can compile and persist while absent from parsed unions, causing surfaces to return `operation_invoke_result_invalid` instead of the domain reason.
- Files: `src/modules/capability-execution/operation-invoke-contracts.ts`, `convex/capabilityOperationInvocations.ts`, `.planning/reset/RECEIPTS.md` (P1-e-1 review)
- Current mitigation: `operationInvokeRefusalCodeValues` union in `operation-invoke-contracts.ts` includes `payment_lane_not_brokered`; review caught prior drift.
- Recommendations: Any new refusal code must update contract unions, Convex validators, CLI/MCP parsers, and tests in the same card; use exhaustive switch/`never` checks per repo rules.

**Live money fail-closed gate:**
- Risk: Premature enablement of Stripe checkout, webhooks, or supplier payout I/O before counsel signoffs and ADR-034 implementation.
- Files: `src/modules/money/internal/live-money-gate.ts`, `tests/unit/money/stripe-adapter.test.ts`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`
- Current mitigation: `evaluateLiveMoneyGate()` refuses when counsel decisions incomplete; Stripe adapter tests assert refusal before provider I/O.
- Recommendations: Do not weaken gate for demos; complete PRA-003 / P1-d3 before any hosted money proof.

## Performance Bottlenecks

**In-memory registry search over full catalog:**
- Problem: Business/offering search builds and filters full catalog arrays in process memory before pagination.
- Files: `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/search-documents.ts`
- Measurement: No p95 metrics in repo; papercut 40 notes prior `hasMore: false` misreport and stop-word empty-result behavior at market scale (partially addressed in `search-documents.ts` trade-vocabulary work).
- Cause: Source-local registry projection reads entire catalog into memory for token matching.
- Improvement path: Add bounded document indexes or Convex-side search with honest pagination metadata; load tests with ≥20 curated operations and larger seed catalogs.

**Full release unit suite under parallel load:**
- Problem: Individual tests (e.g., `tests/unit/market-terminal/cli-errors.test.ts`) timeout at 30s during full parallel `tests/unit` runs but pass in isolation.
- Files: `package.json` (`test:release:unit`), `PAPERCUTS.md` (entries 185, 371–408 in RECEIPTS)
- Measurement: Documented false RED from concurrent validators and CPU starvation; serial re-measurement cleared ~35 timeouts.
- Cause: CLI subprocess tests with tight budgets competing for CPU; concurrent full-suite validators forbidden by rule 7a but still an operational footgun.
- Improvement path: Per-file `testTimeout` for CLI spawn tests; never run two full-suite validators concurrently; queue validators on one machine.

**Monolithic money ledger hot path:**
- Problem: Authorization, settlement, payout reservation, and reversal logic share one Convex module with 10k+ lines.
- Files: `convex/moneyLedger.ts`, `tests/unit/convex/money-ledger-reconciliation.test.ts` (~3,641 lines)
- Measurement: Focused money test suites run hundreds of cases; full ledger mutation graph is hard to profile in isolation.
- Cause: Exact-money spine consolidated into one file for atomicity evidence.
- Improvement path: Extract read models and pure decision functions with unchanged mutation entrypoints; keep reconciliation tests as gate.

## Fragile Areas

**Capability operation invocation worker:**
- Why fragile: Orchestrates payment lane admission, canonical claim, provider transport, money authorization, qualified-use receipt hook, recovery, and refusal persistence in one worker.
- Common failures: Refusal code drift, x402 lane policy regressions, idempotency conflicts, `payment_lane_not_brokered` vs conformance proof tension.
- Safe modification: Run `tests/unit/convex/capability-operation-worker.test.ts`, `tests/unit/capability-execution/operation-invoke*.test.ts`, and money ledger reconciliation tests; never skip union updates.
- Test coverage: Strong unit coverage; hosted provider proof still absent.
- Files: `convex/capabilityOperationInvocationWorker.ts`, `convex/capabilityOperationInvocations.ts`

**Answer tool-use agent:**
- Why fragile: 3,161-line custom loop coupling registry reads, dynamic `capability.{operationRef}` tools, invoke/execute, budget gates, and evidence assembly. Persistence remains in `turn-orchestrator.ts` (2,060 lines) even after P4 deleted `intent-router.ts`.
- Common failures: Tool withholding after execution, wrong completion copy, model request accounting drift, frozen evidence not recalled on follow-ups.
- Safe modification: Run `tests/unit/answer/answer-selected-operation-loop.test.ts`, eval cases in `eval/answer/lib/cases.ts` (tags `model-chosen-tool-loop`, `bounded-tool-loop`), and answer-thread boundary tests before behavior changes.
- Test coverage: Deep unit tests; persisted harness accounting gap remains.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turns/agent.ts`, `src/modules/answer/answer-schema.ts`

**Route transport runtime:**
- Why fragile: Executes HTTP/x402/provider connections with schema validation, network guard, timeout/abort composition, and response normalization.
- Common failures: `@cfworker/json-schema` mutation on immutable schemas (fixed by cloning — papercut 35), x402 exponent rescale refusals post-publish (papercut 36), keyless fixture/output mismatch (papercut 37).
- Safe modification: Run `tests/unit/capability-supply/route-transport-runtime.test.ts` and integration publication tests; clone schemas before validation.
- Test coverage: Large dedicated unit file (~2,641 lines); live provider paths env-blocked.
- Files: `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/capability-supply/internal/publication-importers.ts`

**Product-frontier manifest exact inventory:**
- Why fragile: Adding/removing/renaming any action breaks `tests/imports/product-frontier-manifest.test.ts` and downstream SEO/agent contracts.
- Common failures: Unregistered supply actions; accidental reintroduction of quarantined actions during refactors.
- Safe modification: Update `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json` and run `npm run check:product-frontier` in the same commit.
- Test coverage: Enforced by import test; no runtime drift detection beyond manifest verifier.
- Files: `tests/imports/product-frontier-manifest.test.ts`, `tools/release/verify-product-frontier.mjs`

**Pre-commit Convex codegen hook:**
- Why fragile: Hook rewrites `convex/_generated/*` after staging, leaving codegen one commit behind schema edits if not re-staged.
- Common failures: Typecheck passes locally but CI fails; staged schema ≠ generated types.
- Safe modification: Include codegen output in the same commit as schema edits; never `--no-verify` without founder authorization (operating model rule 4).
- Test coverage: `npm run check:convex-codegen` in release gate.
- Files: `.husky/pre-commit` (if present), `convex/_generated/`, `PAPERCUTS.md` (entry 183)

## Scaling Limits

**Curated catalog and registry search:**
- Current capacity: ~20 real operations across 19 provider slugs in curated seed; registry search paginates in memory.
- Limit: Latency and memory grow linearly with catalog rows; search token stop-word stripping can yield empty results for common phrases.
- Symptoms at limit: Slow search responses, incorrect `hasMore`, zero-result searches for phrases like "discover providers" (papercut 40).
- Scaling path: Indexed search documents (`src/modules/registry/internal/search-documents.ts`), Convex-backed pagination, load tests with larger catalogs.

**Action and module guardrails (reset targets):**
- Current capacity: 47 pinned required actions; 690 module TypeScript files under `src/modules/`; 117 Convex TS files (excluding generated).
- Limit: Operating model targets ≤14 active actions, ≤60k active module LOC, ≤60 live tables (quarantined reported separately).
- Symptoms at limit: Manifest churn blocks every feature; LOC/table audits fail Phase 6 cards.
- Scaling path: Phase 5 freeze of `customerRequest.*`, `workTree.*`, `study.*`, inquiries; retire legacy registry list/detail actions after deprecation notice.

**Concurrent validator / CI parallelism:**
- Current capacity: Full unit suite ~4,000+ tests; integration ~580 tests with 15s timeout and `no-file-parallelism`.
- Limit: Two full-suite validators on one machine manufacture timeout failures indistinguishable from real regressions.
- Symptoms at limit: Bare `Test timed out` across unrelated files (documented P1-a-core / P1-e-2 incident).
- Scaling path: Serialize validators (rule 7a); shard suites in CI with isolated runners, not shared CPU on one host.

**Answer turn checkpoint storage:**
- Current capacity: 256 KiB per checkpoint, 16 steps (`IA-DATA-FLOW.md` cites `MAX_ANSWER_TURN_CHECKPOINT_BYTES`, `ANSWER_TURN_CHECKPOINT_MAX_STEP`).
- Limit: Multi-tool turns with large frozen evidence approach checkpoint caps.
- Symptoms at limit: `answer_turn_persist_failed` and turn fencing failures.
- Scaling path: Trim persisted evidence projections; enforce assembler bounds in `src/modules/answer/internal/evidence-assembler.ts`.

## Dependencies at Risk

**Deprecated `@react-email/*` packages:**
- Risk: Multiple `@react-email` subpackages marked deprecated on install (`npm ci` warnings).
- Impact: Email notification paths may break on future npm installs or React upgrades.
- Migration plan: Audit notification-outbox owner (memo parked in cleanup batch 5); migrate to supported React Email release or alternative transactional email templates.
- Files: `package.json`, notification modules under `src/modules/`

**`@convex-dev/agent` blocked on AI SDK v7:**
- Risk: Cannot adopt Convex agent component for durable chat without peer downgrade or draft PRs.
- Impact: Custom harness/run loop remains mandatory maintenance.
- Migration plan: Track Convex agent releases for AI SDK v7; build parity validator before loop removal (P2-a decision).
- Files: `.planning/STATE.md`, `convex/_generated/ai/guidelines.md`

**Cross-runtime Zod composition (`@x402/core`):**
- Risk: `@x402/core` schemas use a different Zod runtime; empty CAIP-2 references accepted by dependency schema.
- Impact: x402 metadata validation fails closed or accepts invalid network refs if guards omitted.
- Migration plan: Keep minimal non-empty namespace/reference guards (papercut 16); refuse x402 as live lane in production (`src/modules/capability-supply/internal/x402-invocation-policy.ts`).
- Files: `src/modules/capability-supply/internal/x402-invocation-policy.ts`, x402 settlement verification tests

**Node engine vs local toolchains:**
- Risk: `package.json` requires Node 22.x; papercut 171 notes default shell Node 25 until `nvm use 22`.
- Impact: EBADENGINE warnings; subtle test/runtime differences.
- Migration plan: Enforce Node 22 in CI and documented dev setup; `.nvmrc` / Volta pin if not already present.

## Missing Critical Features

**Daily supplier settlement cron (P1-d3 / PRA-003):**
- Status: committed. UTC `internal.*` cron skips with `live_money_gate_open` while counsel signoffs are open. Reservation reuses P1-d2 `beginPayoutTransferReservation`; Stripe Transfer I/O is still refused.
- Remaining: hosted Transfer after live-money gate closes; failed-residual carry-forward.
- Files: `convex/crons.ts`, `convex/moneyLedger.ts` (`runDailySupplierSettlement`)

**Hosted gateway certification (SG-024 / ADR-035):**
- Problem: No strict hosted receipt with real Clerk key invoking two real operations from distinct suppliers with approval, budget, credentials, recovery, usage readback, and revoke→refused replay.
- Current workaround: Source gate green via `test:release:source:after-codegen`; outer `test:release:source` fails at `verify:deployment-manifest` for missing production config (intended).
- Blocks: Production manifest validation, operator/legal policy values, hosted MCP/HTTP discovery proof (#204).
- Implementation complexity: High — deployment identity, signing keys, Convex hosted ID, Stripe/x402 production values.
- Files: `tools/release/verify-deployment-manifest.ts`, `tools/release/operation-gateway-production-smoke.ts`, `.planning/adr/ADR-035-single-key-capability-gateway.md`

**Phase 5 quarantine (freeze not implemented):**
- Problem: P5-a recorded frontier v2 (`schemaVersion: ae-product-frontier:v2`, `quarantineFamilies` with `approved-pending-deprecation`) at `1aaf4aa5`, but Customer Request / WorkTree / Study / inquiries still accept writes and remain in `src/modules/actions/index.ts`. CARD-LEDGER has no Status column for P5 rows; RECEIPTS still say founder review before Phase 5.
- Current workaround: Families remain live; business/services policy is `freeze-approved-pending-implementation` in the same manifest.
- Blocks: Action inventory reduction to ≤14; P5-c deprecation headers; P6 table retirement.
- Implementation complexity: High — freeze writes, deprecation notice, then later HTTP 410 (P5-d).
- Files: `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`, `src/modules/customer-request/`, `src/modules/work-tree/`, `src/modules/study/`, `.planning/reset/CARD-LEDGER.md`

**Legal / counsel signoffs for live money (T52):**
- Problem: Live money gate requires complete counsel decision set; T52 explicitly **LIVE MONEY: REFUSED** until compliance gate accepts.
- Current workaround: Fail-closed gate in `live-money-gate.ts`.
- Blocks: Real top-up, charge, payout block; first-dollar hosted proof.
- Files: `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`, `src/modules/money/internal/live-money-gate.ts`

## Test Coverage Gaps

**Hosted and E2E proof:**
- What's not tested: Full browser E2E, hosted readback, frozen evidence packet, Tier C hosted Answer.
- Files: `tests/e2e/`, `.planning/evidence/product-frontier-baseline/CLEANUP-RECEIPT.md`, `.planning/STATE.md` (P5-EVIDENCE unmet)
- Risk: UI/regression and deployment-only failures ship despite green source gate.
- Priority: High
- Difficulty to test: Requires local Convex, signing keys, deployment manifest, and consent-gated hosted runs.

**P1-d3 settlement automation:**
- What's not tested: Idempotent daily cron, production policy-driven payout execution end-to-end.
- Files: `tests/unit/money/`, `tests/unit/convex/payout-ledger.test.ts` (covers reservation/reversal, not cron)
- Risk: Payout double-spend or stuck held balances in production.
- Priority: High
- Difficulty to test: Needs cron scheduler simulation and Stripe test fixtures with live-money gate toggled in controlled env.

**Operation gateway production smoke:**
- What's not tested: Full `tools/release/operation-gateway-production-smoke.ts` against configured hosted deployment (5,182-line script; env-blocked).
- Files: `tools/release/operation-gateway-production-smoke.ts`, `tests/unit/release/operation-gateway-production-smoke.test.ts`
- Risk: Gateway regressions undetected until manual smoke.
- Priority: High
- Difficulty to test: Production manifest, Clerk keys, Convex deployment URL, real supplier operations.

**Faux-runtime import guard in release gate:**
- What's not tested: `tests/imports/faux-runtime-surfaces.test.ts` is not wired into `test:release:source:after-codegen` (guardrail passes after HK-faux-runtime merge, but policy decision remains whether to promote it).
- Files: `tests/imports/faux-runtime-surfaces.test.ts`, `package.json`
- Risk: Local-E2E bypass reintroduced into deployable module graphs without detection.
- Priority: Medium
- Difficulty to test: Already exists — needs gate promotion decision.

**Customer Request / WorkTree freeze under quarantine plan:**
- What's not tested: Post-quarantine absence of write paths; HTTP `Deprecation`/`Sunset` headers; 410 tombstones (P5-d).
- Files: `src/modules/customer-request/`, `src/modules/work-tree/`, `src/modules/study/`, `tests/imports/product-frontier-manifest.test.ts`
- Risk: Quarantine cards freeze wrong surfaces or leave agent-discoverable writes after notice.
- Priority: High
- Difficulty to test: P5-b/c must add freeze and notice tests before P6 schema narrow.

**Development-host parity and x402 conformance:**
- What's not tested: Full official development evidence packets when checkout is dirty or local Convex unavailable (`evidence_checkout_dirty`, `convex_dev_server_unavailable`).
- Files: `tests/unit/action-invocation/development-host-parity.test.ts`, `tests/imports/development-evidence-boundary.test.ts`
- Risk: Conformance proof false negatives block releases; false positives if env guards skipped.
- Priority: Medium
- Difficulty to test: Requires clean tree discipline and local Convex lifecycle documented in dev scripts.

---

*Concerns audit: 2026-08-18*
*Update as issues are fixed or new ones discovered*
