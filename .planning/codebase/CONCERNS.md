# Codebase Concerns

**Analysis Date:** 2026-08-19

## Tech Debt

**Oversized monolith modules:**
- Issue: Core money, worker, Answer, transport, and thread modules remain above maintainability thresholds (10k+ and 2k+ lines). Exact-money, invocation, Answer, transport, and thread spines still share host files.
- Files: `convex/moneyLedger.ts` (10,671 lines), `convex/capabilityOperationInvocationWorker.ts` (3,012), `src/modules/answer/internal/answer-tool-use-agent.ts` (3,161), `src/modules/capability-supply/route-transport-runtime.ts` (2,507), `src/modules/answer-thread/internal/turn-orchestrator.ts` (2,060), `src/modules/money/server.ts` (2,065)
- Impact: Small contract changes require wide diffs, merge conflicts, and hard-to-review money/worker/Answer/transport/thread regressions.
- Fix approach: Measure one concrete seam at a time and card any remaining module split separately; preserve runtime authorities and boundary tests. Do not split `convex/moneyLedger.ts` without keeping reconciliation tests as the gate.

**Paid invoke tombstone vs path-agnostic handler:**
- Issue: Live HTTP `POST /api/v1/operations/execute` is an RFC 9457 HTTP 410 tombstone. `handleOperationInvokePost` does not inspect the request path and still serves `/call`. `OPERATION_INVOKE_ROUTE_CONTRACT.invoke` still names `legacyPath` / `legacyRouterPath` for `/execute`.
- Files: `src/routes/api.v1.operations.call.ts`, `src/routes/api.v1.operations.execute.ts`, `src/lib/server/operation-invoke-api.ts`, `src/modules/capability-execution/operation-invoke-entry.ts`, `src/modules/product-frontier/deprecation-notice.ts`, `tests/unit/routes/operation-invoke-route-binding.test.ts`
- Impact: Tests that call the handler with an execute URL still succeed; live HTTP `/execute` does not. A future route rewiring that attaches the handler to `legacyPath` reopens a retired door. `.planning/wayfinder/AGENTS.md` still names `/execute` as the canonical HTTP route, which can cause an agent to 410 `/call` or re-expose execute.
- Fix approach: Keep the binding test importing both route modules. Never attach `Deprecation` or 410 to `/call`. Do not re-expose `legacyPath` in public UCP/handshake projections. Align wayfinder copy to `/api/v1/operations/call`.

**Custom Answer run loop vs `@convex-dev/agent`:**
- Issue: Answer uses a custom bounded AI SDK tool loop. Persistence still lives in a 2,060-line orchestrator. `@convex-dev/agent` is absent from `package.json`; Convex generated guidelines still recommend that component for durable chat.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turns/agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/harness/`, `convex/_generated/ai/guidelines.md`, `.planning/HANDROLLED-VS-SDK-AUDIT.md`
- Impact: Higher maintenance burden on tool accounting, checkpoints, and eval parity; risk of SDK drift on upgrade. Guideline/code disagreement invites speculative installs.
- Fix approach: Do not remove the custom loop until a SDK↔Harness parity validator exists; track `@convex-dev/agent` v7 readiness separately; split persistence from the orchestrator only with a dedicated card. Do not install `@convex-dev/agent@0.6.4` against `ai@^7.0.44`.

**Action inventory vs end-state guardrail:**
- Issue: Product-frontier v2 pins 14 required public actions (cap claimed). `listActions()` filters quarantine-family ids; `findAction()` still resolves tombstones so family HTTP 410 can `findAction`. New public actions still require manifest surgery.
- Files: `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json` (`schemaVersion: ae-product-frontier:v2`, `requiredActionIds` length 14), `src/modules/actions/index.ts`, `src/modules/product-frontier/quarantine-family-actions.ts`, `src/modules/product-frontier/quarantine-write-admission.ts`, `tests/imports/product-frontier-manifest.test.ts`, `tools/release/verify-product-frontier.mjs`
- Impact: Adding a public action without a retirement plan breaks `npm run check:product-frontier`. Registering a quarantined id into `listActions()` reopens a retired surface.
- Fix approach: Do not add net-new public actions without a manifest update and a retirement plan. Keep `inquiry.readCustomerRecord` as the only quarantine-family keep-read.

**Storefront draft actions off the public inventory:**
- Issue: `storefrontImportDraftAction` and `storefrontEnrichDraftAction` are not in `registeredActions` in `src/modules/actions/index.ts`. They remain reachable via dedicated HTTP routes and TanStack server functions.
- Files: `src/modules/storefront/storefront.actions.ts`, `src/modules/storefront/storefront.functions.ts`, `src/routes/api.storefront.import-draft.ts`, `src/routes/api.storefront.enrich.ts`
- Impact: MCP/CLI/agent discovery omits import-draft/enrich; HTTP vs action-plane authority diverges.
- Fix approach: Either register under a standard action with scope admission or delete the HTTP/server-fn pair and document HTTP-only access in one place — do not leave both ambiguous.

**Import-gate script names deleted Customer Request tests:**
- Issue: `package.json` `test:imports` still lists `tests/imports/customer-request-boundaries.test.ts` and `tests/imports/customer-request-source-completeness.test.ts`. Those files are gone with `src/modules/customer-request/`. Remaining import tests live under `tests/imports/` (16 files; neither CR path exists).
- Files: `package.json` (`test:imports`), `src/modules/product-frontier/quarantine-family-actions.ts`
- Impact: `npm run test:imports` and `test:release:source:after-codegen` fail closed on missing paths, or skip silently depending on vitest path handling — either way the gate no longer matches the tree.
- Fix approach: Drop the two missing paths from `test:imports` in the same card that owns the import gate; keep kernel-retirement and frontier tests as the CR-absence proof.

**Hosted smoke scripts still named Customer Request:**
- Issue: Release hosted scripts still run `tools/release/customer-request-production-smoke.ts` and `tools/release/customer-request-production-credential.ts` after the CR TypeScript module is deleted.
- Files: `package.json` (`test:release:hosted`, `smoke:customer-request:production*`), `tools/release/customer-request-production-smoke.ts`, `tools/release/customer-request-production-credential.ts`
- Impact: Hosted certification still aims at a deleted family; operators cannot tell whether gateway smoke (`tools/release/operation-gateway-production-smoke.ts`) is the remaining proof.
- Fix approach: Retarget hosted smoke at `/api/v1/operations/call` and the 14-action inventory; keep CR HTTP 410 as a negative assertion, not a positive lifecycle.

**Release gate ordering hides cheap failures:**
- Issue: `test:ts-standards` and parts of `test:imports` run after the full unit suite in `test:release:source:after-codegen`.
- Files: `package.json` (`test:release:source:after-codegen`), `.planning/reset/RECEIPTS.md`, `PAPERCUTS.md` (entries 181–182)
- Impact: Static violations accumulate undetected until an earlier suite goes green; wastes differential investigation time.
- Fix approach: Reorder gate scripts so static import/TS-standard scans run before `test:release:unit`, or add a fast preflight target invoked first.

**Schema still spreads empty quarantined table objects:**
- Issue: `convex/schema.ts` still imports `routingKernelTables`, `workTreeTables`, `studyTables`, and `projectSpineTables`, each now `{} as const`. Listed schema is the keep-60 `durableTables` set. Inquiry 12 stay. `marketDispatchWorkpool` stays as a Workpool component, not a listed app table.
- Files: `convex/schema.ts`, `src/modules/routing-kernel/internal/convex-schema.ts`, `src/modules/work-tree/internal/convex-schema.ts`, `src/modules/study/internal/convex-schema.ts`, `src/modules/project-spine/internal/convex-schema.ts`, `tests/unit/schema/convex-schema.test.ts` (`durableTables` length 60)
- Impact: Empty spreads hide whether a future table definition silently re-lists a retired family. `v.id('businessServices')` remains in `src/modules/inquiries/internal/convex-schema.ts` and `src/modules/registry/internal/schema.ts` with no `businessServices` `defineTable`.
- Fix approach: Keep listed names pinned to `durableTables`. Do not re-`defineTable` unlisted families. Replace leftover `v.id('businessServices')` with a string/legacy field that does not name an unlisted table, in a schema card with inventory tests.

**WorkTree and Study TypeScript modules remain:**
- Issue: Customer Request TypeScript is deleted; WorkTree and Study modules stay quarantined with actions registered then filtered from `listActions()`.
- Files: `src/modules/work-tree/`, `src/modules/study/`, `src/modules/product-frontier/quarantine-family-actions.ts`, `src/modules/actions/index.ts`
- Impact: Module LOC stays far above the 60k guardrail (`src/modules` ≈ 114k lines). Quarantined actions remain importable; a `listActions()` filter regression republishes them.
- Fix approach: Do not delete WorkTree/Study without a founder card. Do not add features there. Keep HTTP/MCP 410 via `isQuarantineSurfaceRetired`.

## Known Bugs

**Answer turn persistence fails after successful selection:**
- Symptoms: Explicit operation selection resolves then the turn returns HTTP 500 with `answer_turn_persist_failed`; fencing/persistence fails closed.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/routes/api.answer.turn.ts`, `src/lib/errors.ts`, `PAPERCUTS.md` (entry 174)
- Trigger: Collaborative goblin flows with exact candidate selection (e.g., cat lookup, CoinGecko threads).
- Workaround: None reliable in local smokes; retry may hit the same fence.

**Search-only Answer requests surface provider-failure copy:**
- Symptoms: Operation effects are correctly blocked and frozen candidates return, but completion prose claims the live lookup failed and exposes `route_tool_forbidden` semantics.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/answer-synthesizer.ts`, `PAPERCUTS.md` (entry 177)
- Trigger: User instructs search-only / do-not-execute; model obeys effect guard but synthesis path uses failure recovery copy.
- Workaround: User ignores misleading prose; frozen evidence is still correct.

**Persisted harness under-counts model requests:**
- Symptoms: Eval/harness summary and private telemetry report zero model requests while OpenRouter and agent results show two requests on selected-operation loops.
- Files: `tests/eval/answer-pipeline.test.ts`, `src/modules/answer-thread/internal/answer-run-summary.ts`, `PAPERCUTS.md` (entries 26, 174–175)
- Trigger: Selected-operation eval cases with two-step tool loops.
- Workaround: Unit contract in `tests/unit/answer/answer-selected-operation-loop.test.ts` proves accounting at one layer; persisted harness still wrong.

**Worktree Convex component resolution breaks `projectSpine` tests:**
- Symptoms: `convex/projectSpine.test.ts` fails 3/4 in git worktrees with identical file content; passes on main full integration gate.
- Files: `convex/projectSpine.test.ts`, `convex/projectSpine.ts`, `PAPERCUTS.md` (entry 189)
- Trigger: Worktree symlinks `node_modules` from main checkout.
- Workaround: Validate component-dependent tests only on main checkout, not worktree symlink layout.

**Local Answer turn 500 when Convex bundling fails:**
- Symptoms: Vite serves but `POST /api/answer/turn` returns 500; Convex codegen cannot bundle Node-only imports into default runtime.
- Files: `src/routes/api.answer.turn.ts`, `PAPERCUTS.md` (entries 30, 133–141)
- Trigger: Local stack without Convex backend; imports such as `network-guard`, Clerk keyless storage, `undici`.
- Workaround: Run full local Convex dev deployment before Answer smokes.

**Curated seed non-idempotent on restart:**
- Symptoms: `dev:local` reseed fails with `curated_provider_connection_refused:connection:exa:invalid_transition` against existing local state.
- Files: `tools/dev/` seed entrypoints, `convex/curatedProviders.ts`, `PAPERCUTS.md` (entries 170, 57–58)
- Trigger: Routine local restart after prior seed.
- Workaround: Manual local DB reset/reseed.

## Security Considerations

**Operation gateway routes lack HTTP-edge rate limits:**
- Risk: Bearer-authenticated invoke/status/cancel/reconcile endpoints can be hammered at the edge; only Convex-side reservation limits apply. `withHttpRateLimit` covers public-read catalog/MCP/market-operations search, not `/call`.
- Files: `src/routes/api.v1.operations.call.ts`, `src/routes/api.v1.operations.execute.ts`, `src/lib/server/rate-limit.ts`, `convex/capabilityOperationInvocations.ts`
- Current mitigation: Grant/budget/concurrency limits inside Convex at reservation time; OAuth and public-read routes use `withHttpRateLimit`. `/execute` is 410 for every method.
- Recommendations: Add HTTP-edge admission for invoke and lifecycle routes aligned with existing limiter names, or document explicit reliance on Convex-only limits and monitor abuse; any new gateway route must not bypass reservation limits. Never 410 `/call` as a substitute for rate limits.

**Local E2E authentication bypass surface:**
- Risk: `isLocalE2EAuthBypassEnabled()` strips Clerk middleware in local E2E; unauthenticated callers can reach server functions that authenticate to Convex with admin credentials.
- Files: `src/start.ts`, `src/lib/server/local-e2e-bypass.ts`, `src/lib/server/operation-approval-source.ts`, `tests/imports/faux-runtime-surfaces.test.ts`
- Current mitigation: Bypass lives in `operation-approval-source.ts`, not `src/modules/capability-execution/**`; guards refuse in production; `tests/imports/faux-runtime-surfaces.test.ts` pins deployable-graph selectors. That test is not in `package.json` `test:imports`.
- Recommendations: Never reintroduce bypass calls inside `src/modules/capability-execution/**`; promote the faux-runtime guard into `test:imports` when policy allows; treat local E2E endpoints as privileged test-only surfaces.

**Environment diagnostics can leak secret values:**
- Risk: Grepping env files for variable names prints matching values; papercut 27 records unrelated secrets exposed during x402 prerequisite checks.
- Files: `PAPERCUTS.md`, developer scripts under `tools/dev/`
- Current mitigation: `.env` files gitignored; agents instructed not to read secrets.
- Recommendations: Add a names-only env inventory command; ban value-printing greps in runbooks. Never quote `.env` contents in planning docs.

**Loosely typed refusal codes:**
- Risk: New invoke refusal codes can compile and persist while absent from parsed unions, causing surfaces to return `operation_invoke_result_invalid` instead of the domain reason.
- Files: `src/modules/capability-execution/operation-invoke-contracts.ts`, `convex/capabilityOperationInvocations.ts`
- Current mitigation: `operationInvokeRefusalCodeValues` includes `payment_lane_not_brokered`; production x402 direct rail refuses in `src/modules/capability-supply/internal/x402-invocation-policy.ts`.
- Recommendations: Any new refusal code must update contract unions, Convex validators, CLI/MCP parsers, and tests in the same card; use exhaustive switch/`never` checks.

**Live money fail-closed gate:**
- Risk: Premature enablement of Stripe checkout, webhooks, or supplier payout I/O before counsel signoffs.
- Files: `src/modules/money/internal/live-money-gate.ts`, `tests/unit/money/stripe-adapter.test.ts`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`
- Current mitigation: `evaluateLiveMoneyGate()` refuses with `live_money_gate_open` when counsel decisions are incomplete; Stripe adapter tests assert refusal before provider I/O.
- Recommendations: Do not weaken the gate for demos. Keep live money fail-closed until T52 counsel artifacts exist.

**Production leftover tables (Dashboard Delete Table unauthorized):**
- Risk: Local keep-60 `--replace-all` deleted leftover empty tables on `joel-chan:agentic-economy-ea30d local` only. Production Dashboard Delete Table is not authorized. Hosted deployments may still list leftover unlisted names.
- Files: `.planning/reset/RECEIPTS.md` (Closeout-dashboard-delete, Closeout-origin-push, Green-close-prune-leftovers), `tools/release/p6-table-export.ts`
- Current mitigation: Leftover 29 are pruned; writers copy a sibling fail-closed in that Convex file. Do not restore a shared throw helper. Inquiry 12 stay. Workpool component tables stay. RK HTTP 410 stays.
- Recommendations: Do not run `npx convex import --replace-all` with `--prod`. Do not Dashboard-delete production tables without a founder card and a hashed export receipt. Treat production leftover names as a separate ops card.

## Performance Bottlenecks

**In-memory registry search over full catalog:**
- Problem: Business/offering search builds and filters full catalog arrays in process memory before pagination.
- Files: `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/search-documents.ts`
- Cause: Source-local registry projection reads the catalog into memory for token matching. Papercut 40 notes `hasMore: false` misreport and stop-word empty-result behavior.
- Improvement path: Add bounded document indexes or Convex-side search with honest pagination metadata; load tests with ≥20 curated operations and larger seed catalogs.

**Full release unit suite under parallel load:**
- Problem: Individual tests (e.g., `tests/unit/market-terminal/cli-errors.test.ts`) timeout at 30s during full parallel `tests/unit` runs but pass in isolation.
- Files: `package.json` (`test:release:unit`), `PAPERCUTS.md` (entry 185), `.planning/reset/OPERATING-MODEL.md` (rule 7a)
- Cause: CLI subprocess tests with tight budgets competing for CPU; concurrent full-suite validators manufacture timeout failures indistinguishable from real regressions.
- Improvement path: Per-file `testTimeout` for CLI spawn tests; never run two full-suite validators concurrently; queue validators on one machine.

**Monolithic money ledger hot path:**
- Problem: Authorization, settlement, payout reservation, and reversal logic share one Convex module with 10k+ lines.
- Files: `convex/moneyLedger.ts`, `tests/unit/convex/money-ledger-reconciliation.test.ts` (~3,641 lines), `tests/unit/convex/payout-ledger.test.ts` (~2,489 lines)
- Cause: Exact-money spine consolidated into one file for atomicity evidence.
- Improvement path: Extract read models and pure decision functions with unchanged mutation entrypoints; keep reconciliation tests as gate.

## Fragile Areas

**Capability operation invocation worker:**
- Files: `convex/capabilityOperationInvocationWorker.ts`, `convex/capabilityOperationInvocations.ts`, `convex/marketDispatchWorkpool.ts`
- Why fragile: Orchestrates payment lane admission, canonical claim, provider transport, money authorization, qualified-use receipt hook, recovery, and refusal persistence in one worker. Enqueues on `marketDispatchWorkpool` (keep).
- Safe modification: Run `tests/unit/convex/capability-operation-worker.test.ts`, `tests/integration/capability-operation-workpool.test.ts`, `tests/unit/capability-execution/operation-invoke*.test.ts`, and money ledger reconciliation tests; never skip union updates.
- Test coverage: Strong unit coverage; hosted provider proof still absent.

**Answer tool-use agent:**
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turns/agent.ts`, `src/modules/answer/answer-schema.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Why fragile: 3,161-line custom loop coupling registry reads, dynamic `capability.{operationRef}` tools, invoke/execute, budget gates, and evidence assembly. Persistence remains in `turn-orchestrator.ts`.
- Safe modification: Run `tests/unit/answer/answer-selected-operation-loop.test.ts`, eval cases in `eval/answer/lib/cases.ts`, and answer-thread boundary tests before behavior changes.
- Test coverage: Deep unit tests; persisted harness accounting gap remains.

**Route transport runtime:**
- Files: `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/capability-supply/internal/publication-importers.ts`
- Why fragile: Executes HTTP/x402/provider connections with schema validation, network guard, timeout/abort composition, and response normalization.
- Safe modification: Run `tests/unit/capability-supply/route-transport-runtime.test.ts` and integration publication tests; clone schemas before `@cfworker/json-schema` validation.
- Test coverage: Large dedicated unit file (~2,641 lines); live provider paths env-blocked.

**Product-frontier manifest exact inventory:**
- Files: `tests/imports/product-frontier-manifest.test.ts`, `tools/release/verify-product-frontier.mjs`, `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`
- Why fragile: Adding/removing/renaming any of the 14 required actions breaks the frontier floor. Family HTTP including inspect stays 410 except `inquiry.readCustomerRecord`.
- Safe modification: Update the manifest and run `npm run check:product-frontier` in the same commit. Never attach Deprecation/410 to `/call`.
- Test coverage: Enforced by import test; no runtime drift detection beyond the verifier.

**Routing-kernel HTTP tombstones:**
- Files: `convex/http.ts`, `src/modules/routing-kernel/retirement.ts`, `tests/imports/routing-authority-retirement.test.ts`
- Why fragile: RK tables are unlisted (`routingKernelTables = {}`); HTTP 410 handlers on `/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, `/mcp`, and `/.well-known/ae-routing.json` must remain. Convex `/mcp` 410 is not the TanStack `src/routes/mcp.ts` market MCP adapter.
- Safe modification: Keep RK HTTP 410. Do not drop `convex/http.ts` routes when unlisting tables. Do not conflate kernel `/mcp` with market MCP.
- Test coverage: Import retirement tests; no hosted replay of every retired path.

**Inquiry 12 listed tables:**
- Files: `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/product-frontier/table-export-tables.ts` (`INQUIRY_EXPORT_TABLES` length 12), `convex/inquiries.ts`
- Why fragile: Inquiry 12 stay (threads/access/messages/notifications/read-states/abuse/privacy plus governed-send lineage and `capabilityLaunchSupportRecords`). `inquiry.submit` is quarantined; `inquiry.readCustomerRecord` stays readable. Legacy `v.id('businessServices')` unions still exist on listed inquiry rows.
- Safe modification: Never unlist or drop these 12. Keep customer-record HTTP off 410. Change inquiry schema only with `tests/unit/schema/convex-schema.test.ts` and `tests/unit/product-frontier/table-export-digest.test.ts`.
- Test coverage: Schema inventory and hasher length; hosted inquiry traffic unmeasured.

**Unlisted leftover writers:**
- Files: `convex/notificationOutbox.ts`, `convex/settings.ts`, `convex/agentAccessOAuth.ts`, `convex/crons.ts`
- Why fragile: Leftover 29 are pruned. Surfaces copy a sibling fail-closed in that file (OAuth `return null`, cron `deleted: 0`, notification error unions, settings `owner_not_found`). Do not add a shared throw or no-op helper. Do not restore leftover listed names.
- Safe modification: Keep leftover families unlisted. Do not re-query unlisted names to “clean up” production leftovers. Do not paginate-delete production rows without founder authority.
- Test coverage: Schema inventory 60; production leftover names unmeasured.

## Scaling Limits

**Curated catalog and registry search:**
- Current capacity: ~20 real operations across 19 provider slugs in curated seed; registry search paginates in memory.
- Limit: Latency and memory grow linearly with catalog rows; search token stop-word stripping can yield empty results for common phrases.
- Scaling path: Indexed search documents (`src/modules/registry/internal/search-documents.ts`), Convex-backed pagination, load tests with larger catalogs.

**Action, table, and module guardrails:**
- Current capacity: 14 pinned required public actions; listed Convex tables 60 (caps claimed). `src/modules` ≈ 114k lines vs operating-model ≤60k active module LOC. Inquiry 12 stay. `marketDispatchWorkpool` stays (`maxParallelism: 32` in `convex/marketDispatchWorkpool.ts`).
- Limit: Operating model targets 14 active actions, ≤60k active module LOC, 60 live listed tables.
- Scaling path: Do not add net-new public actions or listed tables without a retirement plan. Do not grow WorkTree/Study. Do not Dashboard-delete production leftovers without a founder card.

**Concurrent validator / CI parallelism:**
- Current capacity: Full unit suite thousands of tests; integration uses `--no-file-parallelism` and 15s timeout.
- Limit: Two full-suite validators on one machine manufacture timeout failures indistinguishable from real regressions.
- Scaling path: Serialize validators (operating-model rule 7a); shard suites in CI with isolated runners, not shared CPU on one host.

**Answer turn checkpoint storage:**
- Current capacity: 256 KiB per checkpoint (`MAX_ANSWER_TURN_CHECKPOINT_BYTES` in `src/modules/answer-thread/internal/answer-turn-checkpoint.ts`), 16 steps (`ANSWER_TURN_CHECKPOINT_MAX_STEP` in `convex/answerThreads.ts`).
- Limit: Multi-tool turns with large frozen evidence approach checkpoint caps.
- Scaling path: Trim persisted evidence projections; enforce assembler bounds in `src/modules/answer/internal/evidence-assembler.ts`.

**Workpool dispatch slots:**
- Current capacity: `marketDispatchWorkpool` `maxParallelism: 32` of a 100-slot Convex global reservation.
- Limit: Paid invoke enqueue plus provider-connection cleanup share the same pool. Deleting the Workpool component breaks invoke.
- Scaling path: Keep the existing Workpool mount. Tune parallelism only with enqueue/backpressure evidence. Never replace it with raw scheduler hops.

## Dependencies at Risk

**Deprecated `@react-email/*` packages:**
- Risk: `@react-email/components` and `@react-email/render` remain in `package.json`; WorkTree weekly memo is the remaining consumer.
- Impact: Email notification paths may break on future npm installs or React upgrades. WorkTree is quarantined, so the only live consumer is a frozen surface.
- Migration plan: Audit notification-outbox (writers unlisted) vs `src/modules/work-tree/internal/memo.tsx`; migrate or delete with the WorkTree module card, not opportunistically.
- Files: `package.json`, `src/modules/work-tree/internal/memo.tsx`

**`@convex-dev/agent` blocked on AI SDK v7:**
- Risk: Cannot adopt Convex agent component for durable chat without peer downgrade. Installed `ai` is `^7.0.44`; agent `0.6.4` peers `ai ^6.0.35`.
- Impact: Custom harness/run loop remains mandatory maintenance. `convex/_generated/ai/guidelines.md` still tells agents to mount the component.
- Migration plan: Track Convex agent releases for AI SDK v7; build parity validator before loop removal.
- Files: `package.json`, `.planning/HANDROLLED-VS-SDK-AUDIT.md`, `convex/_generated/ai/guidelines.md`

**Cross-runtime Zod composition (`@x402/core`):**
- Risk: `@x402/core` `2.18.0` schemas use a different Zod runtime; empty CAIP-2 references accepted by dependency schema.
- Impact: x402 metadata validation fails closed or accepts invalid network refs if guards omitted. Production still refuses provider-direct x402 as a live lane.
- Migration plan: Keep non-empty namespace/reference guards; refuse x402 as live lane in production (`src/modules/capability-supply/internal/x402-invocation-policy.ts`).
- Files: `src/modules/capability-supply/internal/x402-invocation-policy.ts`, `package.json`

**Node engine vs local toolchains:**
- Risk: `package.json` `engines.node` is `22.x`; `.nvmrc` is `22`. Default shell Node 25 fails Convex node-action deploy (`PAPERCUTS.md` 211).
- Impact: `DeploymentNotConfiguredForNodeActions` on `npx convex codegen` / `convex dev --once` under Node 25; EBADENGINE warnings.
- Migration plan: Enforce Node 22 in CI and every Convex/codegen command (`nvm use 22` / `fnm use`). Do not treat Node 25 as a supported runtime.
- Files: `package.json`, `.nvmrc`, `PAPERCUTS.md`

**`nitro-nightly` build toolchain:**
- Risk: `nitro` resolves to `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`.
- Impact: Production Vercel/Nitro builds can break on an unpublished nightly bump.
- Migration plan: Pin a stable Nitro when TanStack Start supports it; keep the exact nightly in lockfile-only changes.
- Files: `package.json`

## Missing Critical Features

**Hosted gateway certification:**
- Problem: No strict hosted receipt with a real Clerk key invoking two real operations from distinct suppliers with approval, budget, credentials, recovery, usage readback, and revoke→refused replay.
- Blocks: Production manifest validation (`tools/release/verify-deployment-manifest.ts`), operator/legal policy values, hosted MCP/HTTP discovery proof.
- Files: `tools/release/verify-deployment-manifest.ts`, `tools/release/operation-gateway-production-smoke.ts`, `.planning/adr/ADR-035-single-key-capability-gateway.md`

**Legal / counsel signoffs for live money (T52):**
- Problem: Live money gate requires complete counsel decision set; T52 records **LIVE MONEY: REFUSED** until compliance accepts.
- Blocks: Real top-up, charge, payout I/O; first-dollar hosted proof; UTC daily settlement cron executes reservation logic then skips Stripe Transfer while the gate is open.
- Files: `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`, `src/modules/money/internal/live-money-gate.ts`, `convex/crons.ts`, `convex/moneyLedger.ts` (`runDailySupplierSettlement`)

**Production leftover table delete:**
- Problem: Local leftover empty tables are gone via keep-60 `--replace-all`. Production Dashboard Delete Table is not authorized. Hosted leftover unlisted names (CR/RK/WorkTree/Study/spine plus the pruned leftover 29) may still exist.
- Blocks: Hosted schema matching local `npx convex data` count 60.
- Files: `.planning/reset/RECEIPTS.md` (Closeout-dashboard-delete), `src/modules/product-frontier/table-export-tables.ts`

**Public businesses/services expansion:**
- Problem: `businessServicesPolicy.expansion` is `frozen`. Measured businesses/services URLs stay. No further public URL dies without RFC 8594 notice.
- Blocks: Catalog URL deletion or new businesses/services routes without a deprecation release.
- Files: `src/modules/product-frontier/business-services-policy.ts`, `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`

## Test Coverage Gaps

**Hosted and E2E proof:**
- What's not tested: Full browser E2E, hosted readback, frozen evidence packet, Tier C hosted Answer, production leftover table census.
- Files: `tests/e2e/`, `.planning/evidence/product-frontier-baseline/CLEANUP-RECEIPT.md`, `tools/release/operation-gateway-production-smoke.ts`
- Risk: UI/regression and deployment-only failures ship despite green source gate.
- Priority: High

**Daily supplier settlement automation:**
- What's not tested: Idempotent daily cron plus production policy-driven payout execution end-to-end with live-money gate closed.
- Files: `tests/unit/money/`, `tests/unit/convex/payout-ledger.test.ts` (covers reservation/reversal, not cron I/O), `convex/crons.ts`
- Risk: Payout double-spend or stuck held balances once counsel opens the gate.
- Priority: High

**Operation gateway production smoke:**
- What's not tested: Full `tools/release/operation-gateway-production-smoke.ts` against a configured hosted deployment (5,182-line script; env-blocked). Outer `test:release:source` fails at `verify:deployment-manifest` without production config (intended).
- Files: `tools/release/operation-gateway-production-smoke.ts`, `tests/unit/release/operation-gateway-production-smoke.test.ts`
- Risk: Gateway regressions undetected until manual smoke.
- Priority: High

**Faux-runtime import guard in release gate:**
- What's not tested: `tests/imports/faux-runtime-surfaces.test.ts` is not wired into `package.json` `test:imports`.
- Files: `tests/imports/faux-runtime-surfaces.test.ts`, `package.json`
- Risk: Local-E2E bypass reintroduced into deployable module graphs without detection.
- Priority: Medium

**Deleted CR import tests still named in the gate:**
- What's not tested: `test:imports` lists two Customer Request files that no longer exist; CR-absence is not asserted by those paths.
- Files: `package.json` (`test:imports`), `tests/imports/kernel-retirement-manifest.test.ts`, `tests/imports/product-frontier-manifest.test.ts`
- Risk: Gate either fails on missing files or silently loses CR-boundary coverage.
- Priority: High

**Quarantine 410 vs `/call`:**
- What's not tested: Production leftover table presence. HTTP 410 tombstones for family doors and `/execute` are asserted locally; `/call` stays without Deprecation. Inquiry customer-record stays off 410. RK HTTP 410 stays.
- Files: `src/modules/product-frontier/quarantine-write-admission.ts`, `src/modules/product-frontier/deprecation-notice.ts`, `src/lib/server/customer-request-route-action-api.ts`, `tests/unit/routes/operation-invoke-route-binding.test.ts`, `tests/unit/server/quarantine-write-http.test.ts`
- Risk: `Deprecation` or 410 attached to `/call`; production Dashboard delete without a hashed export.
- Priority: High

**Development-host parity and x402 conformance:**
- What's not tested: Full official development evidence packets when checkout is dirty or local Convex unavailable (`evidence_checkout_dirty`, `convex_dev_server_unavailable`).
- Files: `tests/unit/action-invocation/development-host-parity.test.ts`, `tests/imports/development-evidence-boundary.test.ts`
- Risk: Conformance proof false negatives block releases; false positives if env guards skipped.
- Priority: Medium

---

*Concerns audit: 2026-08-19*
