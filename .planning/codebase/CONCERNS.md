<!-- refreshed: 2026-08-19 -->
# Codebase Concerns

**Analysis Date:** 2026-08-19

Working-tree map of current source. Code is authoritative over `.planning/STATE.md`. Historical STATE sections (gateway W0–W8, BAS/T53, WorkTree hosted proof) are not treated as live product unless the files still exist. `.env` / `.env.*` files are noted by existence only; contents are not quoted.

TODO/FIXME/HACK/XXX: **not detected** in `src/` or `convex/` TypeScript. Debt here is structural, not comment-tagged.

---

## Tech Debt

**Answer follow-up chips removed from the host, leftovers remain:**
- Issue: Thread follow-up chips, LLM chip generation, and `POST /api/answer/follow-up-chips` are deleted from the working tree. Rate limits, eval-status, Promptfoo chip cases, and planning maps still describe that surface.
- Files: deleted `src/modules/answer-thread/internal/follow-up-chips.ts`, `follow-up-query.ts`, `llm-follow-up-chips.ts`, `src/routes/api.answer.follow-up-chips.ts`; remaining `convex/lib/rateLimit.ts`, `convex/rateLimit.ts`, `src/lib/server/rate-limit.ts` (`'answer-follow-up-chips'`), `src/modules/answer/internal/llm-config.ts` (`readLlmFollowUpChipsEnabled`), `src/modules/answer/public.ts`, `src/routes/api.answer.eval-status.ts`, `eval/answer/promptfooconfig.yaml` (chip-* cases), `eval/answer/assertions/expect-chip.mjs`, `.planning/codebase/IA-DATA-FLOW.md`, `.planning/COPY-MAP.md`
- Impact: Agents and evals treat chips as live. Rate-limit buckets and eval-status `llmChipsEnabled` advertise a door that 404s. Promptfoo still runs chip assertions against a deleted host.
- Fix approach: Delete the rate-limit family, `readLlmFollowUpChipsEnabled`, chip Promptfoo cases, and `expect-chip.mjs`. Point eval-status at the current tool-loop gate only. Refresh IA/COPY/PROMPT maps to landing pills in `src/components/ae/chat/AeSuggestionChips.tsx` (landing only; follow-up variant is unused by the chat host).

**Answer planner / evidence / location helpers deleted; maps and filenames lag:**
- Issue: Working-tree deletes `src/modules/answer/internal/keyless-data-ask.ts`, `contract-input-binding.ts`, `evidence-assembler.ts`, `location-intent.ts`, `provider-location-filter.ts`, `snapshot-artifacts.ts`, `src/modules/answer-thread/internal/resolve-thread-agent-json.ts`, `src/modules/registry/internal/trade-vocabulary.ts`. Tests and prompt maps still name those files. `tests/unit/answer/keyless-data-ask.test.ts` now only tests `parseAnswerOperationSelectionInput` in `src/modules/answer/operation-selection.ts`.
- Files: `tests/unit/answer/keyless-data-ask.test.ts`, `tests/unit/registry/trade-vocabulary.test.ts` (rewritten onto `search-documents.ts`), `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/DATA-FLOW-DELTA-2026-08-15.md`, `.planning/COPY-MAP.md`
- Impact: Remappers and executors open deleted paths. Continuation/rebinding rules in PROMPT-DATA-FLOW are no longer the host contract. Location “near Perth” heuristics are gone; eval still has `near-me-location-guard` as optional searchContext metadata that must not rewrite the query (`eval/answer/lib/cases.ts`).
- Fix approach: Rename the leftover tests to match the surviving modules. Treat PROMPT/IA/COPY maps as stale until a remap. Keep location as catalog token matching in `src/modules/registry/internal/search.ts` / `search-documents.ts` — do not restore host location injection.

**Public action inventory is 14 listed ids; tombstones and family modules still occupy the tree:**
- Issue: `listActions()` equals the 14 `requiredActionIds` in `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`. `findAction()` still resolves Customer Request, inquiry, study, and WorkTree ids so HTTP 410/403 doors stay findable. TypeScript modules for WorkTree, Study, and inquiry remain large.
- Files: `src/modules/actions/index.ts`, `src/modules/product-frontier/quarantine-family-actions.ts`, `src/modules/product-frontier/quarantine-write-admission.ts`, `src/modules/work-tree/`, `src/modules/study/`, `src/modules/inquiries/inquiry.actions.ts`, `src/lib/server/customer-request-*.ts`, `src/lib/server/customer-request-gone.ts`
- Impact: New work can re-register a quarantined id or call a writable Convex mutation that the HTTP/server-fn freeze does not cover. Customer Request TypeScript module is gone; tombstone actions throw `customer_request_tables_unlisted`.
- Fix approach: Keep `findAction` tombstones for 410. Do not add listed ids. Any new market action goes through `requiredActionIds` + MCP/CLI/Answer parity in `tests/imports/product-frontier-manifest.test.ts`. Do not restore a Customer Request planner, compiler, or Workpool.

**Keep-60 listed schema vs empty spreads and leftover Convex files:**
- Issue: `tests/unit/schema/convex-schema.test.ts` pins 60 `durableTables`. `convex/schema.ts` still spreads empty `{}` table objects from retired families. Convex files for those families remain as fail-closed stubs. P6 hasher still names unlisted families.
- Files: `convex/schema.ts`; empty `src/modules/routing-kernel/internal/convex-schema.ts`, `project-spine/internal/convex-schema.ts`, `work-tree/internal/convex-schema.ts`, `study/internal/convex-schema.ts`, `notification-outbox/internal/schema.ts` (`notificationOutboxTables = {}`), `demand/internal/schema.ts`, `discovery/internal/schema.ts`, `settings/internal/schema.ts`, `src/modules/agent-access/internal/oauth-convex-schema.ts`; stubs `convex/customerRequestUnlisted.ts`, `convex/workTrees.ts`, `convex/studies.ts`, `convex/projectSpine.ts`, `convex/demand.ts`, `convex/routingKernelV1History.ts`; census `src/modules/product-frontier/table-export-tables.ts`
- Impact: Agents treat empty-schema modules as live storage. Notification persist is a no-op (`convex/notificationOutboxPersistence.ts` `persistNotificationDispatch` returns immediately) while `convex/notificationOutbox.ts` still looks like an operator surface. Workflow component stays mounted in `convex/convex.config.ts` after spine tables are unlisted.
- Fix approach: Keep listed schema at 60. Delete or clearly tombstone leftover Convex handlers that cannot persist. Do not re-list CR/RK/WorkTree/Study/outbox tables. Production dashboard delete was not authorized — hosted leftover table names are a separate ops concern, not a restore target.

**Dangling `v.id('businessServices')` on listed tables:**
- Issue: Keep-60 has no `businessServices` table. Listed inquiry and registry validators still use `v.id('businessServices')` on legacy union arms.
- Files: `src/modules/inquiries/internal/convex-schema.ts` (`legacyInquiryThread`), `src/modules/registry/internal/schema.ts` (`legacyRegistryProjectionItem`), `convex/registry.ts`
- Impact: Convex may reject deploy/codegen, or accept a foreign Id to a table that no longer exists. Inquiry runtime tests still construct `serviceId: 'businessServices:legacy-service'` (`tests/unit/convex/inquiries-runtime.test.ts`).
- Fix approach: Drop legacy union arms after a hashed empty digest of remaining legacy rows, or replace `v.id('businessServices')` with a string brand that does not name an unlisted table. Do not re-list `businessServices`.

**Dual catalog: owner offerings vs capability offerings:**
- Issue: Public listings live in `businessOfferings` / `businessOfferingRevisions` / `offeringAccessPaths`. Market operations live in `capabilityOfferings` / `capabilityPublications` / `capabilityTransportBindings`. HTTP `/api/businesses*` and `/api/v1/services*` are frozen measured URLs, not the paid door.
- Files: `src/modules/catalog/internal/schema.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `src/modules/product-frontier/business-services-policy.ts`, `src/routes/api.businesses*.ts`, `src/routes/api.v1.services*.ts`, `src/modules/actions/index.ts` (does not register `registry.list` / `registry.services_*`)
- Impact: `tests/unit/product-frontier/business-services-policy.test.ts` expects those service actions in `listActions()`. `tests/unit/actions/registry.test.ts` asserts they are **not** listed. Chat `agentJsonUrl` still points at `/api/businesses/search` (`src/modules/answer/answer-synthesizer.ts`) even when the turn used operations.
- Fix approach: Decide one projection: either keep measured HTTP as adapters over offerings and update the policy test, or register the six measured actions without expanding URLs. Point Answer agent-json at `/api/v1/market-operations/search` when the tool loop used operations.

**Oversized money and invoke modules:**
- Issue: `convex/moneyLedger.ts` is ~10,658 lines. `convex/capabilityOperationInvocationWorker.ts` is ~3,012 lines. `src/modules/capability-supply/route-transport-runtime.ts` is ~2,507 lines. `src/modules/answer/internal/answer-tool-use-agent.ts` is ~1,924 lines. `src/modules/answer-thread/internal/turn-orchestrator.ts` is ~1,904 lines. `eval/answer/lib/evaluators.ts` is ~1,864 lines.
- Files: those paths plus tests `tests/unit/convex/money-ledger-reconciliation.test.ts` (~3,641), `tests/unit/answer/answer-selected-operation-loop.test.ts` (~2,867)
- Impact: Reviews miss fail-closed money and invoke branches. `exactOptionalPropertyTypes` in `tsconfig.json` makes optional price/hash fields brittle across these files (PAPERCUTS).
- Fix approach: Split by command (topup, charge, payout, x402 persist) without a shared throw helper. Keep ledger math in `src/modules/money/internal/ledger.ts`. Do not add a generic “retired table” helper — leftover stubs copy a local fail-closed (STATE green-close rule; `convex/customerRequestUnlisted.ts` is the existing CR/WorkTree throw pair only).

**Planning docs lag the atomic-market-reset tree:**
- Issue: `.planning/codebase/CAPABILITY-MAP.md` is bound to `baseline/pre-atomic-market-reset` and still lists Customer Request as proving ground, Qualified Use as missing, payout as open. Code has `qualifiedUseReceipts`, `moneyPayouts`, `moneyPayoutAllocations`, CR module deleted. `.planning/evidence/product-frontier-baseline/POST-PROOF-RETIREMENT-DEFERRAL.md` says do not drop RK/spine tables; those families are already unlisted.
- Files: `.planning/codebase/CAPABILITY-MAP.md`, `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/IA-DATA-FLOW.md`, `.planning/STATE.md` (historical sections), `.planning/COPY-MAP.md`
- Impact: New phases re-litigate deleted kernels or “restore” Qualified Use/payout work that already landed.
- Fix approach: Remap from current `durableTables` + `listActions()` + `/api/v1/operations/call`. Treat STATE historical blocks as archive.

**Home still hosts WorkTree and category chips that do not match the chat composer:**
- Issue: `/` still loads `RootWorkTreeLoop` and preset chips `crypto price`, `search the web`, `geocode`, `wikipedia`. Composer/catalog asks are EUR/USD ECB and Berlin weather.
- Files: `src/routes/index.tsx`, `src/components/ae/home/RootWorkTreeLoop.tsx`, `src/modules/work-tree/human-root.functions.ts`, `src/modules/answer/catalog-example-asks.ts`, `src/components/ae/chat/AeAnswerPromptInput.tsx`
- Impact: Landing copy trains the model on asks the catalog may not execute. WorkTree server-fns are freeze/410 while the home UI still mounts the loop.
- Fix approach: Drive landing chips from `AE_CATALOG_EXAMPLE_ASKS`. Tombstone or hide `RootWorkTreeLoop` until tables are listed again (they should not be).

**Graphology still in the WorkTree proving-ground path:**
- Issue: `graphology` / `graphology-dag` remain dependencies with a Vite CJS interop plugin after WorkTree tables are unlisted.
- Files: `package.json`, `vite.config.ts`, `src/modules/work-tree/internal/rollup.ts`, `src/modules/work-tree/internal/cpm.ts`
- Impact: Bundle and optimize-deps cost for a quarantined surface.
- Fix approach: Keep until WorkTree TypeScript is deleted; do not use graphology in Answer or market invoke.

---

## Known Bugs

**Chat turns often do not call `operation.execute` for catalog asks that MCP executes:**
- Symptoms: Landing EUR/USD and Berlin weather complete in ~25–35s with work-log “No live operation was needed yet”. Anonymous MCP `ae_operation_execute` for Frankfurter EUR/USD returns a rate + `evidenceHash` in <1s. CLI `--operation-ref --candidate-digest` posts a JSON envelope as the user query; the model still skips execute; the Ask heading becomes a ~250-character JSON blob.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turns/agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/catalog-example-asks.ts`, `tools/ae/commands/ask.ts`, PAPERCUTS 223–228
- Trigger: Play `POST /api/answer/turn` with composer catalog asks, or CLI machine-selected follow-up after the host planner prune.
- Workaround: Call MCP `ae_operation_execute` / HTTP `POST /api/v1/operations/call` (paid) directly. Do not treat chat prose as execution evidence.

**Berlin weather invents coordinates; forecast op requires lat/long:**
- Symptoms: Chat prose cites “approximately 52.52°N, 13.405°E” with no execute record. Open-Meteo forecast accepts `latitude`/`longitude`. There is no geocode tool on the Answer loop. Home still advertises `geocode`.
- Files: `src/modules/answer/catalog-example-asks.ts`, `src/routes/index.tsx`, curated Open-Meteo in `convex/curatedProviders.ts` / `src/modules/dev/internal/curated-cluster-c-fixtures.ts`, `tests/unit/capability-execution/operation-execute.test.ts`
- Trigger: “What is the current weather in Berlin?”
- Workaround: Execute forecast with explicit coordinates via MCP, or add a listed geocoding operation and require the model to call it before forecast.

**`agentJsonUrl` is always a business-directory URL:**
- Symptoms: After an FX ask, `complete.answer.agentJsonUrl` is `/api/businesses/search?q=What+is+the+EUR+to+USD…`. CLI cannot print `operationRef` / `evidenceHash` from chat stream events (plan/one-line/summary-delta/complete; no kernel tool JSON).
- Files: `src/modules/answer/answer-synthesizer.ts` (`buildAgentJsonUrl`), `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/components/ae/chat/answer-stream.ts`
- Trigger: Any Answer turn that builds a snapshot.
- Workaround: Use MCP/CLI operation search/detail/execute. Fix: choose agent-json from the tools actually run.

**Parramatta / location search looks like a regression after host-location injection was dropped:**
- Symptoms: Local e2e `registry.search` for `emergency plumber Parramatta` returns `items:[]`. The listing matches `parramatta` or old `near_me`+`location=Parramatta` tool args.
- Files: `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/search-documents.ts`, `src/modules/answer/search-context.ts`, `eval/answer/lib/cases.ts` (`turn-perth-context-blocks-parramatta`)
- Trigger: Full-phrase local-service queries that do not token-overlap published words (trade vocabulary expansion was deleted).
- Workaround: Search published tokens. Do not restore `trade-vocabulary.ts` or silent Perth defaults.

**P5-e policy test vs 14-action inventory (working-tree inconsistency):**
- Symptoms: `tests/unit/product-frontier/business-services-policy.test.ts` requires `registry.list` and `registry.services_*` in `listActions()`. `tests/unit/actions/registry.test.ts` and `tests/imports/product-frontier-manifest.test.ts` require `listActions()` to equal the 14 frontier ids (those six are absent from `src/modules/actions/index.ts`). HTTP routes for the six measured URLs still exist.
- Files: those tests, `src/modules/product-frontier/business-services-policy.ts`, `src/modules/registry/registry.actions.ts` (actions exist, not registered)
- Trigger: `npm run test:unit` / `test:imports` on this dirty tree.
- Workaround: None in source. Align tests with one inventory: measured HTTP without listed actions, or list the six without adding URLs.

**Hosted Customer Request smoke is a hard throw:**
- Symptoms: `runCustomerRequestProductionSmoke` always throws `customer_request_module_deleted`. `package.json` `test:release:hosted` still chains `smoke:customer-request:production:*`.
- Files: `tools/release/customer-request-production-smoke.ts`, `tools/release/customer-request-production-credential.ts`, `package.json` scripts `test:release:hosted`, `smoke:customer-request:*`
- Trigger: Any hosted release job that still calls those scripts.
- Workaround: Do not run CR smokes. Replace hosted proof with `/api/v1/operations/call` + `tools/release/operation-gateway-production-smoke.ts` once live-money counsel allows.

**Free-tier leftover once refused every $0 invoke (fixed in source; do not reintroduce):**
- Symptoms: Green-close prune of `moneyFreeTierCounters` stub hardcoded `{ callsUsed: 1 }` so every $0 invoke refused `credit_topup_required`.
- Files: PAPERCUTS 220; persist path is `moneyUsageEvents` + `moneyTransactions` in `convex/moneyLedger.ts`
- Trigger: Re-adding a missing-table counter check.
- Workaround: Keep $0 accounting on listed money tables only.

---

## Security Considerations

**Live money is fail-closed by source policy, not an env flag:**
- Risk: Flipping an environment variable must not open Stripe live charges, Connect payouts, or production x402.
- Files: `src/modules/money/internal/live-money-gate.ts` (`LIVE_MONEY_GATE_POLICY`: all six counsel signoffs `open`, `stripe.mode: 'test'`, `readiness: 'unavailable'`), `src/modules/money/server.ts`, `src/lib/server/stripe-money-provider.ts`, `convex/moneyLedger.ts`
- Current mitigation: `evaluateLiveMoneyGate` refuses `live_money_gate_open` until every counsel decision is `accepted` with `artifactRef`, then `stripe_setup_required` until live Stripe is `ready`. UI copy in `src/components/ae/console/AeCreditTopUpPanel.tsx` and `src/components/ae/supply/AeSupplyEarningsCard.tsx` states transfers are held.
- Recommendations: Keep counsel artifacts in `.planning/research/` (pack ref `2026-08-01-compliance-first-dollar-counsel-pack.md`). Do not replace the policy object with `NODE_ENV`. Hosted first-dollar needs a separate certification packet.

**Provider-direct x402 is refused in production:**
- Risk: Direct rail settles outside AE’s ledger (no rake, no dispute answer, no output-before-value).
- Files: `src/modules/capability-supply/internal/x402-invocation-policy.ts` (`paymentLaneAdmission`), `convex/moneyX402PaymentAttempts.ts`, `tests/unit/capability-supply/x402-invocation-policy.test.ts`, `tests/unit/action-invocation/x402-payment-reconciliation.test.ts`
- Current mitigation: Production admits only `brokered`. Non-production keeps `provider_direct_x402` for conformance. Attempts persist on `moneyX402PaymentAttempts`, not the deleted CR table.
- Recommendations: Never re-query `customerRequestX402PaymentAttempts`. Keep `@x402/core` schema composition behind `safeParse` plus a non-empty CAIP-2 guard (PAPERCUTS 16: dependency Zod runtime is not this repo’s Zod).

**SSRF: dynamic `fetch` must import network-guard:**
- Risk: Owner- or model-supplied URLs reaching link-local, metadata, or private ranges.
- Files: `tests/unit/security/ssrf-surface-drift.test.ts`, `src/modules/network-guard/public.ts`, `src/modules/capability-execution/operation-execute.functions.ts`, allowlist `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`, `src/modules/routing-kernel/caller-identity.ts`
- Current mitigation: Scan of `convex/`, `src/routes/`, `src/modules/` for non-literal `fetch(`; violations must import network-guard. Keyless execute is HTTPS-only. CLI policy `tools/ae/lib/policy.ts` repeats `https_only`.
- Recommendations: Do not grow `KNOWN_PROVIDER_CLIENT_FILES` for owner-influenced URLs. Answer OpenRouter allowlist is fixed-host only. Extending the list is a security decision, not a silence-the-test change.

**Source-write secrets and Clerk bypass:**
- Risk: Client-bundled source-write material, production auth bypass, webhook spoofing.
- Files: `.env.example` present (template names only); `src/lib/ui/contract-scans.ts` forbids `VITE_AE_SOURCE_WRITE_SECRET`; `src/lib/server/local-e2e-bypass.ts` throws if `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in production; `tests/unit/server/server-seams.test.ts`; `convex/sourceWriteAdmission.ts`; Stripe webhook body cap in `src/lib/server/stripe-money-provider.ts` (`MAX_WEBHOOK_BODY_BYTES`)
- Current mitigation: Scoped `AE_SOURCE_WRITE_KEY_*` families; HKDF derivation from server-only `AE_SOURCE_WRITE_SECRET` in non-production; scan tests for public-env leaks.
- Recommendations: Never read or commit `.env`. Production must set per-family keys, not rely on derived secret. Keep `AE_X402_PAYMENT_PRIVATE_KEY` / `AE_X402_RPC_URLS_JSON` server-only (`convex/convex.config.ts` env validators).

**Two “dispute” vocabularies:**
- Risk: Privacy removal disputes vs money chargeback/recovery get mixed.
- Files: `src/modules/security/internal/disputes.ts`, `src/modules/security/removal-dispute.functions.ts`, `tests/unit/security/disputes.test.ts` (hashes only; no raw email/phone in state); money `recoveryDue` in `src/modules/money/internal/ledger.ts`; live-money counsel `refund_dispute_chargeback_responsibility` still `open`
- Current mitigation: Removal disputes store contact/evidence hashes. Money recovery is ledger fields, not the `disputes` table.
- Recommendations: Do not hang Stripe chargebacks on `disputes`. Keep CSRF on `openRemovalDispute`.

**Quarantine freeze is HTTP/server-fn; Convex mutations stay writable:**
- Risk: A caller with source-write or internal Convex can still mutate inquiry/WorkTree if handlers are not fail-closed.
- Files: `src/modules/product-frontier/quarantine-write-admission.ts` (comment: Convex mutations stay writable), `src/modules/inquiries/inquiry.functions.ts` (server-fns return `quarantine_writes_frozen`), `convex/inquiries.ts`, `convex/workTrees.ts` (refuses `work_tree_tables_unlisted`)
- Current mitigation: Family HTTP including inspect is 410 except `inquiry.readCustomerRecord`. `/api/v1/operations/execute` is 410; paid door is `/api/v1/operations/call` (`src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.operations.call.ts`).
- Recommendations: Every leftover Convex mutation for unlisted families must refuse in-handler. Do not add a shared no-op that returns success.

**RFC 9457 410 tombstones for retired family HTTP:**
- Risk: Clients retry old `/api/v1/requests/*` or `/execute` and interpret 410 as transient.
- Files: `src/routes/api.v1.requests*.ts`, `src/routes/api.v1.work-tree.$operation.ts`, `src/lib/server/customer-request-route-action-api.ts`, `src/modules/routing-kernel/retirement.ts`, `tests/unit/server/quarantine-write-http.test.ts`, `tests/unit/product-frontier/deprecation-notice.test.ts`
- Current mitigation: `quarantine_surface_retired`, Sunset `Tue, 18 Aug 2026 23:59:59 GMT` in `src/modules/product-frontier/deprecation-notice.ts`. MCP uses in-tool tombstone, not host-410.
- Recommendations: Never 410 `/call` or `inquiry.readCustomerRecord`. Keep RK HTTP 410 permanent.

---

## Performance Bottlenecks

**Answer turn: two-phase model loop + 30s lease:**
- Problem: Chat catalog asks take 25–35s with “let me fetch / one moment” even when no operation runs. Preflight structured interpretation plus a bounded AI SDK tool loop plus a separate AnswerProse `generateText` (PAPERCUTS 228).
- Files: `src/routes/api.answer.turn.ts` (16 KiB body, `x-ae-turn-key`), `convex/answerThreads.ts` (25-turn cap, 30s generation lease), `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-query-safety.ts` (`maxOutputTokens: 256`, `maxRetries: 0`), `src/modules/answer/internal/answer-tool-use-agent.ts`
- Cause: OpenRouter round-trips, search-only budgets, and prose after tools. Contract helper used to throw `unexpected_unstructured_tool_request` when the model stopped with no tool call; that stop is now a legitimate end of the tool loop.
- Improvement path: Skip prose-phase when tools already produced gated snapshot fields. Fail faster when `classifier_unavailable`. Do not lengthen the lease to hide missing execute.

**Money ledger and worker size:**
- Problem: Single Convex modules hold charge, topup, payout, x402, and invoke worker logic. Reconciliation tests are thousands of lines.
- Files: `convex/moneyLedger.ts`, `convex/capabilityOperationInvocationWorker.ts`, `convex/marketDispatchWorkpool.ts`
- Cause: Exactly-once money and invoke were grown in place through the reset.
- Improvement path: Split files by command. Keep Workpool as `marketDispatchWorkpool` (do not delete the pool). Respect Convex 1MB document and 8192 array limits (`convex/_generated/ai/guidelines.md`).

**CLI / search payload noise:**
- Problem: `ae search --json` for `current weather` is ~27kB for one listing because navigation embeds full HTTP action schemas; items have `summary` but no top-level `name`.
- Files: `tools/ae/commands/ask.ts`, `src/modules/registry/operation-action-contracts.ts`, `src/modules/capability-supply/operation-projection.ts`
- Cause: Agent-facing descriptors include full input JSON Schema.
- Improvement path: CLI human mode: name + operationRef + price. Keep full schema on inspect/MCP.

**Eval and unit suites are heavy and order-sensitive:**
- Problem: `test:release:source:after-codegen` runs lint/typecheck after unit. PAPERCUTS 182: ts-standards hid behind a red unit suite. `tests/unit/market-terminal/cli-errors.test.ts` has timed out at 30s under full parallel load.
- Files: `package.json` scripts, `eval/answer/lib/evaluators.ts`, `tests/eval/answer-pipeline.test.ts`
- Cause: Promptfoo + OpenRouter contract server + duplicated interpretation literals (PAPERCUTS 179).
- Improvement path: Run `test:ts-standards` before slow suites. Shared `answerInterpretation({...})` builder. Raise CLI test timeout or reduce file concurrency.

**Node 25 vs required 22.x:**
- Problem: Shell default Node 25 breaks `convex dev --once` (`DeploymentNotConfiguredForNodeActions`) and `tsx` loader (`--import` vs `--loader`). `package.json` `engines.node` is `22.x`.
- Files: `package.json`, PAPERCUTS 208–211, 216
- Cause: Convex node actions + tsx ESM on Node 25.
- Improvement path: Use nvm 22 for Convex. Document in local-dev; do not “fix” by dropping node actions.

---

## Fragile Areas

**Answer-thread working-tree churn (uncommitted):**
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `turns/agent.ts`, `answer-continuation-state.ts`, `answer-response-planner.ts`, `client.ts`, `public.ts`, `testing.ts`; deleted chip/query/agent-json helpers; UI `src/components/ae/chat/*`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`
- Why fragile: Host no longer plans query-shape routes; preflight interpretation is advisory. Continuation rebinding that lived in `keyless-data-ask.ts` must now live in continuation-state + tool loop or it is gone. Maps/tests that import deleted files will fail typecheck.
- Safe modification: Change the tool loop and gate together (`src/modules/answer/internal/answer-gate.ts`, `answer-tool-use-agent.ts`, `eval/answer/lib/cases.ts`). Update Promptfoo via `auditPromptfooAnswerConfig` in `eval/answer/lib/coverage.ts`. Do not restore chips or a named router.
- Test coverage: Strong unit/eval on the intended tool loop; weak hosted/chat execute proof. Deleted tests: `tests/unit/answer-thread/follow-up-chips*.ts`, `tests/integration/follow-up-chips-route.test.ts`, `tests/unit/chat/ae-follow-up-chips.test.tsx`, `tests/unit/answer/provider-location-filter.test.ts`. Surviving `tests/unit/answer-thread/follow-up-intent.test.ts` covers regex intent in `follow-up-intent.ts`, not chips.

**Eval/answer pipeline:**
- Files: `eval/answer/lib/cases.ts`, `eval/answer/lib/evaluators.ts`, `eval/answer/lib/coverage.ts`, `eval/answer/lib/scoring.ts`, `eval/answer/promptfooconfig.yaml`, `tests/eval/answer-pipeline.test.ts`, `tests/helpers/openrouter-contract-server.ts`
- Why fragile: Coverage tags are a floor (`ANSWER_EVAL_COVERAGE_REQUIREMENTS`). Promptfoo config description still says “follow-up chip eval”. Chip cases use `mode: chip` and are outside `auditPromptfooAnswerConfig`’s answer-turn/thread catalog, so they do not fail coverage audit. Golden counts in `tests/eval/answer-pipeline.test.ts` (modelRequestCount/toolRunCount) break when the two-phase loop changes. No committed `output/eval/answer-suite-report.json` (PROMPT-DATA-FLOW: source-integrated only).
- Safe modification: Change cases first, then evaluators, then pipeline test golden numbers. Keep `near-me-location-guard` as “do not inject location into the query”.
- Test coverage: `npm run test:eval:report` is in the source gate; live Promptfoo + OpenRouter is config-gated.

**Fail-closed money + x402 + Stripe:**
- Files: `src/modules/money/internal/live-money-gate.ts`, `src/lib/server/stripe-money-provider.ts`, `convex/moneyX402PaymentAttempts.ts`, `convex/moneyLedger.ts`
- Why fragile: First-dollar policy, webhook idempotency (`moneyStripeEvents`), payout reserve-before-I/O, and x402 observation reconciliation must stay exact. `@x402/core` Zod cannot be embedded in repo Zod objects.
- Safe modification: Tests in `tests/unit/money/`, `tests/unit/action-invocation/x402-payment-reconciliation.test.ts`, `tests/unit/convex/payout-ledger.test.ts` before any policy change.
- Test coverage: Source-strong; hosted-live Stripe/x402 **not certified**.

**Quarantine HTTP vs listed kernel:**
- Files: `src/routes/api.v1.requests*.ts`, `src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.operations.call.ts`, `src/lib/server/mcp-api.ts`
- Why fragile: `/execute` 410 is easy to “fix” back to invoke. MCP must not host-410; in-tool tombstone only.
- Safe modification: Follow `tests/unit/product-frontier/deprecation-notice.test.ts` and `tests/unit/server/mcp-api.test.ts`.
- Test coverage: Unit HTTP 410 is present; hosted 410 on production is consent-gated.

**Convex schema keep-60 + component tables:**
- Files: `tests/unit/schema/convex-schema.test.ts`, `convex/convex.config.ts` (workflow, workpool, rateLimiter, aggregate)
- Why fragile: Component tables are not in the 60. Local `--replace-all` keep-60 import must never run `--prod`. Hosted deployment may still list leftover names until a founder-authorized dashboard delete.
- Safe modification: Any new `defineTable` updates `durableTables` and indexes in the same PR.
- Test coverage: Schema inventory test is the floor; hosted `npx convex data` is environment-specific.

**exactOptionalPropertyTypes + hashed prices:**
- Files: `tsconfig.json`, PAPERCUTS 6, `src/modules/catalog/internal/offering-price.ts`
- Why fragile: Optional price fields into `StableHashValue` / invocation writers break typecheck or hashes.
- Safe modification: Populate sub-cent decimals at the operation-read boundary, not in persisted hashes.
- Test coverage: Publication/importers and offering-price unit tests.

---

## Scaling Limits

**Answer threads:**
- Current capacity: 25 turns per thread; 30-second generation-fenced lease; request body 16 KiB; search/visible provider budget 3 (`answer-response-planner.ts`); preflight `maxOutputTokens: 256`.
- Limit: Lease expiry mid-tool-loop; thread cap forces a new thread; 16 KiB blocks large CLI JSON envelopes as the user query (amplifies the execute-skip bug).
- Scaling path: Raise caps only with persistence/replay tests in `tests/unit/answer-thread/`. Prefer operationRef in structured parts, not raw JSON as `query`.

**Convex documents and Workpool:**
- Current capacity: Convex 1MB/doc, 8192 array elements, 1024 object keys (guidelines). Workpool `marketDispatchWorkpool` is the invoke queue; do not delete.
- Limit: Large OpenAPI descriptors, full action schemas in search hits, notification payloads (outbox tables unlisted — persist is no-op).
- Scaling path: Store hashes + bounded redacted payloads. Keep search projections in `registrySearchDocuments`.

**Money / payout:**
- Current capacity: Exact amounts, UTC-daily payout allocation, live transfers held while the gate is closed.
- Limit: First-dollar counsel incomplete; Stripe Connect live unreadiness. Production x402 direct rail refused.
- Scaling path: Counsel signoff artifacts, then Stripe live readiness, then hosted invoke smoke — not a code flag.

**Public HTTP catalogs:**
- Current capacity: Businesses/services URL expansion frozen; six measured paths retained (`business-services-policy.ts`). Operation search query max 200 chars, max 20 results; compare/inspect-plan max four refs (IA-DATA-FLOW).
- Limit: Dual URL families confuse agents; full schemas bloat search.
- Scaling path: Freeze stands. Add operations URLs only, not new businesses/services paths.

**Listed schema 60:**
- Current capacity: 60 source-owned tables in `durableTables`. Inquiry family 12 inside that set (`capabilityLaunchSupportRecords` + 7 inquiry + 4 governed-send in `src/modules/inquiries/internal/convex-schema.ts`).
- Limit: New product state requires dropping or justifying a 61st table against the reset cap.
- Scaling path: Founder-authorized cap change plus schema test. Component tables (Workpool/Workflow/rate-limiter/aggregate) stay outside the 60.

---

## Dependencies at Risk

**Vercel AI SDK `ai` ^7.0.44 vs `@tanstack/ai` ^0.38.0:**
- Risk: Two JSON Schema / tool-contract worlds. Answer runtime uses `ai` (`generateText`, UIMessage stream). Action/harness contracts import `JSONSchema` / `convertSchemaToJsonSchema` from `@tanstack/ai` (`src/modules/common/action.ts`, `src/modules/actions/tool-contract.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/answer/internal/action-to-tool-spec.ts`).
- Impact: Schema conversion drift between MCP/CLI descriptors and the OpenRouter tool loop.
- Migration plan: One schema pipeline. Do not add `@convex-dev/agent`; Convex Agent skill exists under `.agents/skills/convex-agent/` but the runtime is AI SDK + OpenRouter (`src/modules/model-gateway/public.ts`). POST-PROOF note deferred native `@tanstack/ai` schema migration — still deferred.

**`@x402/core` 2.18.0 + `zod` 4.4.3:**
- Risk: x402 `NetworkSchemaV2` is a different Zod runtime; cannot embed in repo Zod objects. Dependency schema accepts empty CAIP-2 (`eip155:`).
- Impact: Type/runtime parse failures; empty network refs.
- Migration plan: Keep `safeParse` + non-empty namespace/reference guard. Do not hoist x402 schemas into `exactOptionalPropertyTypes` objects.

**`@openrouter/ai-sdk-provider` ^3.0.0 + AI SDK 7:**
- Risk: Provider/SDK minor skew breaks tool-then-prose contract tests (`tests/helpers/openrouter-contract-server.ts`).
- Impact: Eval and integration Answer tests go red independently of product logic.
- Migration plan: Pin both on upgrades; keep the contract server as the fake.

**Clerk `1.4.9` vs TanStack Start `1.168.26` vs Router `1.170.16`:**
- Risk: Peer mismatch across `@clerk/tanstack-react-start`, `@tanstack/react-start`, `@tanstack/react-router`.
- Impact: Auth SSR / server-fn session bugs.
- Migration plan: Upgrade as a set. Keep production Clerk bypass throw in `src/lib/server/local-e2e-bypass.ts`.

**`nitro` nightly (`nitro-nightly@^3.0.1-20260628-…`) + Vite `8.1.0` + TypeScript `6.0.3`:**
- Risk: Nightly bundler and TS 6 are ahead of most ecosystem types. Convex codegen + oxlint + react-doctor pre-commit already rewrite `convex/_generated` (PAPERCUTS 183).
- Impact: Flaky generate/build; generated files one commit behind schema.
- Migration plan: Stay on Node 22. Re-stage codegen the hook rewrites. Do not adopt Node 25.

**`@convex-dev/workflow` ^0.4.4 still mounted:**
- Risk: Spine tables unlisted; `convex/projectSpine.ts` still defines `WorkflowManager` workflows that throw `project_spine_tables_unlisted` on persist.
- Impact: Component cost and confusion (“is Workflow the invoke queue?”). Invoke queue is Workpool.
- Migration plan: Unmount workflow only after hosted drain proof. Keep `@convex-dev/workpool` ^0.4.9.

**`promptfoo` ^0.121.17 + `braintrust` 3.27.0:**
- Risk: Eval config still mixes gate/chip/injection modes with answer-turn cases. Chip provider path will rot.
- Impact: `promptfoo eval` green on a deleted chip surface, or red on YAML drift.
- Migration plan: Drop chip tests; keep `auditPromptfooAnswerConfig` as the floor.

**`graphology` / `undici` 7.28.0:**
- Risk: Vite CJS plugin for graphology; undici dispatcher is the SSRF-safe outbound path.
- Impact: Accidental raw `fetch` bypasses the guard (caught by ssrf-surface-drift if non-literal).
- Migration plan: Keep undici behind network-guard. Remove graphology with WorkTree TS.

**Lockfile / package manager:**
- Risk: Historical PAPERCUTS `npm ci` EUSAGE / yarn `packageManager` mismatch. Current `package.json` has `"packageManager": "npm@11.5.1"` and a `papercut` script.
- Impact: Fresh clones fail install if lockfile drifts again.
- Migration plan: `npm ci` on Node 22 after any dependency change. Do not reintroduce yarn.

---

## Missing Critical Features

**Hosted-live-certified market loop:**
- Problem: Source tests and local keep-60 Convex do not prove production invoke, Stripe live, or brokered x402. `test:release:hosted` still aims at Customer Request smokes that now throw. Production dashboard delete of leftover tables is not authorized.
- Blocks: First-dollar go-live, hosted x402 certification, treating chat as an execution adapter.

**Chat as a thin execute adapter:**
- Problem: MCP/CLI can execute keyless reads; chat often does not. No geocode tool in the Answer loop. `agentJsonUrl` does not name operations.
- Blocks: “Chat has no tool MCP lacks” is a structural assertion (`tests/imports/product-frontier-manifest.test.ts`); the reverse — chat actually calling those tools for catalog asks — is unproven in play.

**Inquiry and notification as a live conversion loop:**
- Problem: Public inquiry submit and owner inbox writes are RFC 9457 403 at server-fns. Inquiry 12 tables stay. Notification outbox tables are unlisted; persist functions no-op. Home/copy may still invite “send inquiry”.
- Blocks: Qualified human conversion after Answer. Do not silently re-enable writes.

**Live payouts and Stripe Connect:**
- Problem: Daily allocation and ledger exist; live transfers remain held (`AeSupplyEarningsCard`). Counsel `stripe_connect_flow_payout_reconciliation` is `open`.
- Blocks: Supplier money leaving AE.

**Geocoding / place resolution as a listed operation:**
- Problem: Weather and local-service copy assume a place. Forecast ops need coordinates. Host location injection was removed on purpose.
- Blocks: Honest Berlin weather and local-service Answer without hallucinated coordinates.

**Remapped codebase docs:**
- Problem: CONCERNS is current; CAPABILITY-MAP / PROMPT-DATA-FLOW / IA-DATA-FLOW / COPY-MAP still name deleted files and historical kernels.
- Blocks: Safe `$gsd-plan-phase` / execute without re-litigating the product.

---

## Test Coverage Gaps

**Hosted production / deploy smoke vs deleted CR:**
- What's not tested: Live `/api/v1/operations/call` on production; 410 family doors on the hosted host; keep-60 table list on production Convex.
- Files: `package.json` `test:release:hosted*`, `tools/release/customer-request-production-smoke.ts`, `tools/release/operation-gateway-production-smoke.ts`, `tests/deploy-smoke/*`
- Risk: Source green, hosted still serving leftover tables or dead CR routes.
- Priority: High

**Chat execute and catalog-ask play:**
- What's not tested: EUR/USD and Berlin weather actually calling `operation.execute`; agent-json operations URL; CLI JSON envelope as query.
- Files: `tests/e2e/landing-answer.spec.ts`, `tests/e2e/chat-discovery-inquiry-loop.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`
- Risk: Eval contract server greens a scripted tool loop that the live model does not follow.
- Priority: High

**Follow-up chips / location filter / evidence assembler:**
- What's not tested: The deleted surfaces (good). What remains untested: rate-limit family still names chips; eval-status `llmChipsEnabled`; Promptfoo chip cases.
- Files: `eval/answer/promptfooconfig.yaml`, `src/routes/api.answer.eval-status.ts`, `convex/lib/rateLimit.ts`
- Risk: Gate stays green while advertising a 404.
- Priority: High

**P5-e measured actions vs listActions:**
- What's not tested coherently: Whether `registry.list` / `registry.services_*` are listed. Two tests disagree.
- Files: `tests/unit/product-frontier/business-services-policy.test.ts`, `tests/unit/actions/registry.test.ts`
- Risk: CI red or a false green if one file is skipped.
- Priority: High

**Notification outbox after unlist:**
- What's not tested: That inquiry notification enqueue is fail-closed and does not pretend to dispatch Resend/Novu against missing tables.
- Files: `convex/notificationOutbox.ts`, `convex/notificationOutboxPersistence.ts`, `tests/unit/convex/notification-outbox-runtime.test.ts`
- Risk: Operator retry UI on a no-op persist.
- Priority: Medium

**Dangling `businessServices` Ids:**
- What's not tested: Convex deploy/codegen with `v.id('businessServices')` and no such table.
- Files: `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/registry/internal/schema.ts`, `tests/unit/schema/convex-schema.test.ts` (names only, not Id references)
- Risk: Hosted push fails or accepts orphan Ids.
- Priority: Medium

**SSRF allowlist growth:**
- What's not tested: Semantic “this host cannot be owner-influenced” beyond the import scan.
- Files: `tests/unit/security/ssrf-surface-drift.test.ts`
- Risk: New OpenRouter-like clients added to the allowlist without review.
- Priority: Medium

**WorkTree/Study TypeScript vs unlisted tables:**
- What's not tested as a deletion floor: Home `RootWorkTreeLoop` still compiles against freeze/unlist refusals.
- Files: `src/routes/index.tsx`, `convex/workTrees.ts`, `convex/studies.ts`, `tests/unit/work-tree/*`
- Risk: UI looks live; mutations refuse.
- Priority: Medium

**Eval golden counts and interpretation literals:**
- What's not tested cheaply: Schema evolution of AnswerRequestInterpretation (eight duplicated literals — PAPERCUTS 179).
- Files: `tests/eval/answer-pipeline.test.ts`, `tests/helpers/openrouter-contract-server.ts`, `eval/answer/lib/cases.ts`
- Risk: Preflight field adds become a multi-file typecheck slog; golden request counts bit-rot.
- Priority: Low

**Quality-gate golden cases vs current catalog:**
- What's not tested against current seed: `eval/quality/cases/goldenCases.ts` still clusters `open-meteo.geocoding`, `geocode Paris`, wikipedia/crypto workflows while landing/composer copy is ECB FX + Berlin weather and home chips are `crypto price` / `search the web` / `geocode` / `wikipedia`.
- Files: `eval/quality/cases/goldenCases.ts`, `eval/quality/gate.ts`, `src/modules/answer/catalog-example-asks.ts`, `src/routes/index.tsx`
- Risk: Quality gate can pass on a capability set the chat host does not actually run.
- Priority: Medium

**Import-gate hole class (resolved in `package.json`, easy to reintroduce):**
- What's not tested if scripts list deleted files: Vitest skip-missing can keep `test:imports` green (PAPERCUTS 219). Current `package.json` `test:imports` no longer lists `customer-request-boundaries.test.ts` / `customer-request-source-completeness.test.ts`.
- Files: `package.json` `test:imports`, `tools/dev/run-listed-vitest.mjs`
- Risk: A future script-list edit pointing at a deleted path fails closed only if the runner treats missing files as errors.
- Priority: Low

**TODO/FIXME scan:**
- What's not tested: Absence of TODO comments is not absence of debt. `PAPERCUTS.md` (~1500 lines) is the friction log.
- Files: `PAPERCUTS.md`
- Risk: Agents ignore PAPERCUTS and re-hit Node 25, worktree `node_modules`, and Convex codegen traps.
- Priority: Low

**Dirty-tree mapping and gate pinning:**
- What's not tested: Release source gate has no `--require-clean` (PAPERCUTS 181). This working tree is a large uncommitted Answer/registry/eval slice plus leftover planning diffs with trailing whitespace (PAPERCUTS 178).
- Files: `package.json` `test:release:source`, entire uncommitted set in git status
- Risk: Mid-run edits look like baseline failures; `git diff --check` cannot gate one stream.
- Priority: Low

---

## Additional inventory (working tree, 2026-08-19)

Use this when turning a concern into a phase. Paths are current.

### Fail-closed live money / x402 / Stripe

| Control | Path | Current source truth |
| --- | --- | --- |
| First-dollar policy | `src/modules/money/internal/live-money-gate.ts` | Six counsel decisions `open`; Stripe `test` + `unavailable` |
| Gate evaluation | `src/modules/money/server.ts`, `convex/moneyLedger.ts` | Refuses `live_money_gate_open` / `stripe_setup_required` |
| Stripe adapter | `src/lib/server/stripe-money-provider.ts` (~1,533 lines) | Webhook body cap 256 KiB; Connect/payout idempotency scopes |
| Stripe events table | `moneyStripeEvents` in `durableTables` | Indexed `by_stripeEventId` |
| x402 attempts | `convex/moneyX402PaymentAttempts.ts` | Money-owned; CR orphan table unlisted |
| Production x402 rail | `src/modules/capability-supply/internal/x402-invocation-policy.ts` | `provider_direct_x402` refused when `environment === 'production'` |
| Env locators | `.env.example` present | `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON` named only |
| Convex env validators | `convex/convex.config.ts` | Optional OpenRouter, Clerk issuer, source-write-adjacent, x402 RPC JSON |

### Deleted / quarantined surfaces (still in tree as 410/freeze)

| Family | HTTP / adapter | Convex | Listed tables |
| --- | --- | --- | --- |
| Customer Request | `src/routes/api.v1.requests*.ts`, `src/lib/server/customer-request-*.ts` | `convex/customerRequestUnlisted.ts` throws `customer_request_tables_unlisted` | none (census in `table-export-tables.ts`) |
| `/execute` tombstone | `src/routes/api.v1.operations.execute.ts` | n/a | n/a — never confuse with MCP `operation.execute` |
| Paid door | `src/routes/api.v1.operations.call.ts` | invoke + Workpool | `capabilityOperationInvocations`, action-invocation, money |
| WorkTree | `src/routes/api.v1.work-tree.$operation.ts`, `src/modules/work-tree/` | `convex/workTrees.ts` refuses `work_tree_tables_unlisted` | none |
| Study | `src/modules/study/study.actions.ts` | `convex/studies.ts` | none |
| Routing kernel | `src/modules/routing-kernel/retirement.ts`, `convex/routingKernelV1History.ts` | empty schema spread | none; HTTP 410 permanent |
| Project spine | `convex/projectSpine.ts` | Workflow still mounted | none; persist throws `project_spine_tables_unlisted` |
| Demand capture | `src/modules/demand/demand.actions.ts` | `convex/demand.ts` returns `Demand capture is retired.` | none |
| Notification outbox | operator module remains | persist no-ops in `convex/notificationOutboxPersistence.ts` | none |
| Inquiry writes | server-fns 403 `quarantine_writes_frozen` | `convex/inquiries.ts` still listed | 12 including governed-send + `capabilityLaunchSupportRecords` |
| Inquiry keep-read | `inquiry.readCustomerRecord` | listed | not 410 |

### Answer-thread deletions vs survivors

**Deleted in this working tree (do not import):**
- `src/modules/answer-thread/internal/follow-up-chips.ts`
- `src/modules/answer-thread/internal/follow-up-query.ts`
- `src/modules/answer-thread/internal/llm-follow-up-chips.ts`
- `src/modules/answer-thread/internal/resolve-thread-agent-json.ts`
- `src/modules/answer/internal/keyless-data-ask.ts`
- `src/modules/answer/internal/contract-input-binding.ts`
- `src/modules/answer/internal/evidence-assembler.ts`
- `src/modules/answer/internal/location-intent.ts`
- `src/modules/answer/internal/provider-location-filter.ts`
- `src/modules/answer/internal/snapshot-artifacts.ts`
- `src/routes/api.answer.follow-up-chips.ts`
- `src/modules/registry/internal/trade-vocabulary.ts`

**Surviving Answer HTTP:** `src/routes/api.answer.turn.ts`, `api.answer.turn.stop.ts`, `api.answer.threads.ts`, `api.answer.threads.$threadId.ts`, `api.answer.threads.$threadId.share.ts`, `api.answer.eval-status.ts`.

**Surviving continuation / intent (not chips):** `src/modules/answer-thread/internal/answer-continuation-state.ts`, `src/modules/answer-thread/internal/follow-up-intent.ts`, `src/components/ae/chat/composer-copy.ts` (`buildFollowUpComposerCopy`).

### Keep-60 `durableTables` (source-owned)

Pinned in `tests/unit/schema/convex-schema.test.ts`: `owners`, `businesses`, `businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths`, money family (accounts, ledger, transactions, budgets, usage, external spend, x402 attempts, topup, stripe events, payout accounts/payouts/allocations), `qualifiedUseReceipts`, capability launch/contract/offerings/invocations/publications/bindings/connections/leases/approvals, `registeredOperationMappings`, `agentAccessGrants`, `agentAccessPrincipals`, `operationKeys`, `sourceWriteNonces`, `registrySearchDocuments`, `disputes`, inquiry 12, answer threads/turns/reservations/toolCalls/shares, harness sessions/entries, action-invocation controls/attempts/history, external-run evidence/manifests/starts/gate decisions.

Not in the 60: Workpool/Workflow/rate-limiter/aggregate component tables; unlisted CR/RK/WorkTree/Study/outbox names in `src/modules/product-frontier/table-export-tables.ts`.

### Hosted vs source evidence

| Class | What it establishes | Current tree |
| --- | --- | --- |
| source-integrated | contracts, schema 60, 14 actions, SSRF scan, eval cases | Present |
| config-gated | OpenRouter/Promptfoo/Braintrust when keys exist | `AE_ANSWER_EVAL_PASSED`, OpenRouter key via `src/modules/answer/internal/llm-config.ts` |
| local fixture | convex-test, OpenRouter contract server, local e2e bypass | `src/lib/server/local-e2e-bypass.ts` throws in production |
| named packet | identified `output/` receipt | No `output/eval/answer-suite-report.json` in-tree (PROMPT-DATA-FLOW) |
| hosted-live-certified | revision-bound production receipt | Not present; CR production smoke throws; live-money gate closed; production table delete not authorized |

`.env` file: not detected at repo root. `.env.example` present — environment configuration template only.

### Largest complexity files (line counts, working tree)

`convex/moneyLedger.ts` ~10658, `tools/release/operation-gateway-production-smoke.ts` ~5021, `tests/unit/convex/money-ledger-reconciliation.test.ts` ~3641, `src/routeTree.gen.ts` ~3099, `convex/capabilityOperationInvocationWorker.ts` ~3012, `tests/unit/answer/answer-selected-operation-loop.test.ts` ~2867, `src/modules/capability-supply/route-transport-runtime.ts` ~2507, `src/modules/answer/internal/answer-tool-use-agent.ts` ~1924, `src/modules/answer-thread/internal/turn-orchestrator.ts` ~1904, `eval/answer/lib/evaluators.ts` ~1864, `src/modules/money/server.ts` ~2065, `src/lib/server/stripe-money-provider.ts` ~1533.

Generated `src/routeTree.gen.ts` is not hand-edited.

---

*Concerns audit: 2026-08-19*
