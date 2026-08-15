# Codebase Concerns

**Analysis Date:** 2026-08-15

## Tech Debt

**Concentrated authority modules:**
- Issue: [Verified code fact] Several load-bearing modules remain far beyond a reviewable size: `convex/moneyLedger.ts` is 7,805 lines, `convex/capabilityOperationInvocationWorker.ts` is 3,085, `src/modules/answer/internal/answer-tool-use-agent.ts` is 3,044, `src/modules/answer-thread/internal/turn-orchestrator.ts` is 2,775, `src/modules/capability-supply/operation-projection.ts` is 2,565, and `src/modules/capability-supply/route-transport-runtime.ts` is 2,475.
- Files: `convex/moneyLedger.ts`, `convex/capabilityOperationInvocationWorker.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/capability-supply/operation-projection.ts`, `src/modules/capability-supply/route-transport-runtime.ts`
- Impact: Money conservation, payment release, Answer routing, tool execution, transport, and public projection changes have a large regression radius and are difficult to review independently.
- Fix approach: Extract cohesive pure policy/projection helpers behind the existing public and Convex function contracts. Keep transaction ownership and external-effect ordering in the current authority modules; do not introduce parallel ledgers, routers, or executors.

**Very broad uncommitted remediation wave:**
- Issue: [Verified diagnostic] The current safe diff spans 257 tracked files with 16,311 insertions and 7,498 deletions, before counting untracked files. It simultaneously changes Answer, money, x402, discovery, MCP, CLI, owner supply, UI, tests, workflows, and planning authority.
- Files: `convex/capabilityOperationInvocationWorker.ts`, `convex/moneyLedger.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/lib/server/mcp-api.ts`, `src/components/ae/supply/AeSupplyPublisherHome.tsx`, `.planning/STATE.md`
- Impact: A single review or release cannot easily attribute failures, prove revision-bound behavior, or distinguish one remediation from concurrent contract drift.
- Fix approach: Preserve the current working tree, then split review and verification by invariant: Answer, external spend/x402, supplier settlement, machine projections, and owner UI. Require one combined post-integration gate after scoped proofs.

**Status authority lags the current working tree:**
- Issue: [Verified code fact] Current status documents remain dated 2026-08-12 and describe seven focused-verified workstreams, while the working tree includes later Answer, x402 external-spend, MCP, CLI, and supplier-connection changes plus 2026-08-13/14 audit reports.
- Files: `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `goblin-campaign-report-2026-08-13.md`, `goblin-campaign-report-2026-08-14.md`
- Impact: Maintainers can select stale priorities or treat pre-change test claims as evidence for the current tree.
- Fix approach: After current verification, refresh the single current-status authority with exact revision, commands, counts, evidence class, and remaining blockers. Keep dated reports historical.

**Generic CLI action execution remains a parallel dispatch seam:**
- Issue: [Verified code fact] `advanced action` now enforces `action.surfaces.includes('cli')`, but it still invokes `action.run` directly. It does not apply `resolveHarnessApprovalPolicy` or credential admission; protected current actions fail later because their run context lacks a principal/service.
- Files: `tools/ae/commands/actions.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/common/action.ts`, `src/modules/capability-execution/operation-recovery.actions.ts`
- Impact: Current protected actions fail closed, but future CLI-declared actions can accidentally depend on ad hoc checks rather than the registered approval/credential policy.
- Fix approach: Route generic execution through one incumbent admission seam or restrict it to read-only, no-credential actions. Keep dedicated invoke/status/cancel/recover commands for protected operations.

## Known Bugs

**Submitted follow-up text remains in the composer:**
- Symptoms: [Verified code fact; runtime-reproduced 2026-08-14] A successful follow-up leaves the submitted text in the enabled composer, making accidental resend or concatenation likely.
- Files: `src/components/ae/chat/AeAnswerPromptInput.tsx`, `goblin-campaign-report-2026-08-14.md`
- Trigger: Submit any accepted non-empty follow-up; `submitQuery` calls `onSubmit` but never clears local `value`.
- Workaround: Manually select and delete the prior query before typing the next follow-up.

**Operation detail uses incorrect Provider/Publisher labels:**
- Symptoms: [Verified code fact] The registered business is labelled “Supplier,” and the provenance mode enum is labelled “Publisher,” contrary to the repository’s canonical domain language.
- Files: `src/routes/operations.$operationRef.tsx`, `UBIQUITOUS_LANGUAGE.md`, `.planning/PROJECT.md`
- Trigger: Open any Operation detail page and inspect the identity and provenance facts.
- Workaround: Interpret “Supplier” as the registered Provider business and “Publisher” as publication authority/source mode.

**Builder CLI examples can call a different deployment:**
- Symptoms: [Verified code fact] `/for-agents` receives the request-derived canonical base URL, but its CLI examples omit `--base-url`; the CLI defaults to `https://agentic-economy-phi.vercel.app`.
- Files: `src/routes/for-agents.tsx`, `tools/ae/lib/args.ts`, `src/modules/discovery/internal/agent-skill.ts`, `src/modules/discovery/internal/page-markdown.ts`
- Trigger: Follow a bare CLI command from a local, preview, or alternate hosted `/for-agents` page without setting `AE_CLI_BASE_URL`.
- Workaround: Set `AE_CLI_BASE_URL`/`AE_CANONICAL_BASE_URL` or pass `--base-url` explicitly.

**Unknown CLI command reflection is unbounded:**
- Symptoms: [Verified code fact] Unknown root command tokens are interpolated directly into human and JSON error output outside the shared failure sanitizer.
- Files: `tools/ae/cli.ts`, `tools/ae/lib/output.ts`
- Trigger: Pass a very long, control-character-bearing, or sensitive token as the first CLI argument.
- Workaround: Avoid placing sensitive material in command position; malformed JSON and base-URL paths have separate redaction.

## Security Considerations

**Imported web claims render unvalidated links:**
- Risk: [Verified code fact] Model-produced `websiteUrl` and `sourceUrl` values are arbitrary strings and are rendered directly as `target="_blank"` anchors. A `javascript:`, `data:`, credential-bearing, control-character, or bidi-tainted URL can become clickable.
- Files: `src/modules/answer/answer-schema.ts`, `src/modules/storefront/internal/business-enrichment.ts`, `src/components/ae/services/AeImportedClaims.tsx`, `src/modules/answer/internal/operation-result-presentation.ts`
- Current mitigation: `sourceUrl` must exactly match a model-gateway citation and links use `rel="noreferrer"`; Operation-result links separately enforce safe HTTPS URLs.
- Recommendations: Reuse one server-side safe-HTTPS parser before persisting/projecting imported claims and omit invalid links. Add malicious-scheme, credentials, control-character, and bidi tests.

**Production dependency audit has six high-severity findings:**
- Risk: [Verified diagnostic] `npm audit --omit=dev --audit-level=high` reports high-severity advisories in direct `undici@7.28.0` and transitive `ip-address@10.2.0`, `fast-uri@3.1.2`, `js-yaml@4.3.0`, `postcss@8.5.15`, and `nanoid@3.3.15`. The `ip-address` advisories explicitly concern SSRF/trust-boundary bypass.
- Files: `package.json`, `package-lock.json`, `convex/capabilityOperationInvocationWorker.ts`, `convex/capabilitySupplyReadiness.ts`, `src/modules/capability-execution/operation-execute.server.ts`, `src/modules/storefront/server.ts`
- Current mitigation: AE has its own literal/DNS/redirect network guard and guarded Undici dispatchers; no exploit was demonstrated. Current lockfile versions remain advisory-affected.
- Recommendations: Upgrade through package owners, rerun network-guard and MCP/transport conformance tests, and verify lockfile resolution. Prioritize direct Undici and MCP’s `ip-address`/`fast-uri` chain.

**Generic action metadata is not itself enforcement:**
- Risk: [Production-readiness gap] Surface checking is present, but the generic CLI runner does not enforce registered credential admission or Harness approval before direct dispatch.
- Files: `tools/ae/commands/actions.ts`, `src/modules/common/action.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/capability-execution/operation-invoke.actions.ts`
- Current mitigation: `operation.invoke` is explicitly rejected by the generic runner, and current credentialed recovery actions reject missing principal/service context.
- Recommendations: Make one admission function authoritative for generic dispatch and regression-test a synthetic CLI-declared credentialed/write action.

**Live money remains correctly disabled:**
- Risk: [Production-readiness gap, not a demonstrated loss] Automatic daily supplier settlement, operator/legal policy, production manifest values, and hosted payment proof are incomplete.
- Files: `convex/moneyLedger.ts`, `src/modules/money/internal/convex-schema.ts`, `convex/crons.ts`, `src/lib/deployment/manifest.ts`, `.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md`
- Current mitigation: Deployment validation and the shared live-money gate fail closed; no live paid proof was attempted.
- Recommendations: Do not weaken the gate. Implement exact pre-release reservation, automatic settlement scheduling, sub-minor carry, recovery, and policy admission before any live-money certification.

## Performance Bottlenecks

**Registry search materializes every matching search page:**
- Problem: [Verified code fact] `readMatchingSearchDocuments` paginates until `page.isDone`, filters each page in memory, then downstream code slices the complete result set.
- Files: `convex/registry.ts`
- Cause: Search pagination is consumed internally before public pagination is applied.
- Improvement path: Bound rows/bytes read per request, stop after enough qualified results plus a continuation cursor, and propagate native split/continuation metadata.

**MCP tools/list embeds every output schema:**
- Problem: [Verified code fact] The MCP adapter post-processes all listed tools to attach full JSON output schemas, and tests require every schema. There is no payload/context byte budget.
- Files: `src/lib/server/mcp-api.ts`, `tests/unit/server/mcp-api.test.ts`, `src/modules/registry/operation-action-contracts.ts`
- Cause: Canonical output-contract parity is implemented by eagerly serializing complete schemas into inventory.
- Improvement path: Measure raw wire bytes in a gate. If clients need compact discovery, keep strict input and call-time output validation while moving exact output-contract reads to Operation detail or another protocol-supported bounded projection.

**Large cross-domain modules increase validation cost:**
- Problem: [Verified code fact] A small change in money, Answer, or transport frequently recompiles and retests multi-thousand-line modules and large integration suites.
- Files: `convex/moneyLedger.ts`, `convex/capabilityOperationInvocationWorker.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `tests/integration/customer-request-v2-multi-capability-route.test.ts`
- Cause: Multiple policy, persistence, orchestration, projection, and adapter responsibilities share single modules.
- Improvement path: Extract pure, independently testable policy functions without splitting transaction/effect authority.

## Fragile Areas

**Provider-direct x402 finalization is new and cross-cuts four authorities:**
- Files: `convex/capabilityOperationInvocationWorker.ts`, `convex/moneyLedger.ts`, `src/modules/money/internal/external-spend.ts`, `src/modules/capability-supply/internal/x402-settlement-verifier.ts`
- Why fragile: [Verified code fact] Reservation, budget, payment attempt, RPC receipt, ERC-20 log verification, output validity, and reconciliation must agree. The current verifier hard-codes 12 confirmations for every `eip155:` network.
- Safe modification: Preserve immutable invocation/attempt/effect identity, mark possibly submitted before release, never blind-retry unknown effects, and make network finality an admitted server policy rather than caller input.
- Test coverage: Focused external-spend/verifier tests pass, but no hosted RPC, reorg, multi-network finality, or paid provider proof exists.

**Answer routing combines model interpretation with deterministic overrides:**
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/answer-response-planner.ts`, `src/modules/answer/internal/answer-query-safety.ts`
- Why fragile: A model-selected Operation route previously bypassed local-service retrieval. Current source adds `shouldOverrideOperationRouteForBusiness`, but routing still depends on signal dictionaries, continuation state, frozen Operation state, and staged agent paths.
- Safe modification: Keep one route authority, require positive Operation evidence before suppressing deterministic business signals, and preserve frozen-operation continuation only for same-contract refinements.
- Test coverage: Source and focused intent tests exist; the exact post-fix plumber/browser path has no current hosted evidence.

**Owner connection lifecycle spans UI, server functions, Convex, and cleanup work:**
- Files: `src/components/ae/supply/AeSupplyPublisherHome.tsx`, `src/modules/capability-supply/supply-funnel.functions.ts`, `convex/capabilityProviderConnections.ts`, `convex/capabilityProviderConnectionCleanup.ts`
- Why fragile: Connect/reconnect/revoke/retry operations must preserve owner identity, authority generation/digest, cleanup attempt, Workpool identity, and stale-session fencing.
- Safe modification: Reuse current mutations and expected-generation/digest inputs; never accept raw provider secrets in the browser.
- Test coverage: UI presence and domain lifecycle tests exist, but no authenticated browser E2E proves connect → select → revoke → cleanup readback.

**Local Convex verification depends on runtime and backend startup identity:**
- Files: `package.json`, `tools/dev/local-dev.mjs`, `convex/capabilityOperationInvocationWorker.ts`
- Why fragile: [Verified diagnostic] Typecheck and lint pass under the workstation’s Node 25, but Convex codegen fails because the active local backend is not configured with supported Node 20/22/24 actions. The repository declares Node 22.
- Safe modification: Start both supervisor and Convex backend with the pinned Node 22 path, report resolved child runtimes, and reap child processes on exit.
- Test coverage: `tests/unit/dev/local-dev.test.ts` covers launcher logic; current end-to-end codegen did not pass in this environment.

## Scaling Limits

**Curated publication retirement silently stops at fixed caps:**
- Current capacity: [Verified code fact] Seed cleanup examines only the first 100 current public publications; collision retirement examines only the first 1,000.
- Limit: Stale curated publications beyond those windows are not considered, and filtering occurs after the indexed read.
- Scaling path: Query by publisher/source identity with a matching index and process deterministic continuation batches.
- Files: `convex/curatedProviders.ts`

**Answer threads are capped at 25 turns and four Operation candidates:**
- Current capacity: 25 durable turns per thread and four frozen Operation candidates per turn.
- Limit: Turn 26 is refused with `thread_turn_limit`; lower-ranked candidates are omitted before model selection and replay.
- Scaling path: Keep explicit product limits, expose the limit in UI/API, and add deliberate thread rollover or bounded archival/summarization rather than enlarging Convex documents.
- Files: `convex/answerThreads.ts`, `src/modules/answer/answer-schema.ts`, `src/modules/answer/internal/keyless-data-ask.ts`

**Registry search has no market-scale read ceiling:**
- Current capacity: Pages of 250 search documents are read repeatedly until exhaustion.
- Limit: Latency and Convex row/byte limits grow with the total matching corpus, not requested page size.
- Scaling path: Return bounded qualified pages with cursors and `maximumRowsRead`/`maximumBytesRead`, then continue client-side.
- Files: `convex/registry.ts`

## Dependencies at Risk

**Undici 7.28.0:**
- Risk: A direct runtime dependency has current high-severity advisories involving response desynchronization, cache-related cross-user disclosure/crash, CRLF injection, and cookie attribute injection.
- Files: `package.json`, `package-lock.json`, `convex/capabilityOperationInvocationWorker.ts`, `convex/capabilitySupplyReadiness.ts`, `src/modules/capability-execution/operation-execute.server.ts`
- Impact: Provider transport, readiness, and server fetch paths are in the affected dependency graph; exact exploitability is not established.
- Migration plan: Upgrade to a patched compatible release, then rerun SSRF, redirect, response-boundary, x402, and conformance suites.

**MCP transitive URL/network parsers:**
- Risk: `@modelcontextprotocol/sdk@1.30.0` resolves advisory-affected `ip-address@10.2.0`, `fast-uri@3.1.2`, `hono@4.12.27`, and `@hono/node-server@1.19.14`.
- Files: `package.json`, `package-lock.json`, `src/lib/server/mcp-api.ts`
- Impact: MCP and rate-limit/parser internals inherit high/moderate advisory exposure, including SSRF classification and host confusion concerns.
- Migration plan: Upgrade the SDK/transitives together, verify protocol compatibility, and retain AE’s independent network guard.

**Nightly and pre-1.0 infrastructure packages:**
- Risk: Nitro is aliased to a dated nightly build; `@tanstack/ai`, Convex workflow/workpool/aggregate packages, and `convex-test` are pre-1.0.
- Files: `package.json`, `package-lock.json`, `vite.config.ts`
- Impact: API and behavior churn can invalidate build adapters, generated contracts, or durable workflow assumptions.
- Migration plan: Pin exact known-good versions for release branches, review changelogs before upgrades, and require build plus recovery/conformance gates.

## Missing Critical Features

**Automatic supplier settlement implementation:**
- Problem: [Verified production-readiness gap] ADR-034 selects automatic daily full-balance settlement, but the schema still models monthly payout rows/manual transfer states, no settlement cron is registered, and current status marks PRA-003 open.
- Blocks: Honest production supplier transfer, sub-minor carry, exact liquidity serialization, recovery, and end-to-end Qualified Use payout claims.
- Files: `convex/moneyLedger.ts`, `src/modules/money/internal/convex-schema.ts`, `convex/crons.ts`, `.planning/STATE.md`, `.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md`

**Revision-bound hosted certification:**
- Problem: [Verified production-readiness gap] Source/local evidence exists, but production manifest validation and exact hosted discover → invoke → validate → settle → recover → revoke/readback proof remain absent.
- Blocks: Production capability, independent provider fulfilment, paid value exchange, and release certification.
- Files: `.github/workflows/kernel-release-gate.yml`, `tools/release/operation-gateway-production-smoke.ts`, `src/lib/deployment/manifest.ts`, `.planning/PROJECT.md`, `.planning/STATE.md`

**Authenticated owner connection lifecycle E2E:**
- Problem: [Verified production-readiness gap] Current source exposes connection controls, but no browser proof covers a real owner creating, selecting, refreshing, revoking, and recovering a provider connection.
- Blocks: Claiming that suppliers can independently maintain keyed/x402 authority through the product.
- Files: `src/components/ae/supply/AeSupplyPublisherHome.tsx`, `src/modules/capability-supply/supply-funnel.functions.ts`, `convex/capabilityProviderConnections.ts`, `tests/unit/ui/supply-funnel.test.tsx`

## Test Coverage Gaps

**Composer accepted-submit lifecycle:**
- What's not tested: Clearing text after accepted submit while preserving it on validation or transport failure.
- Files: `src/components/ae/chat/AeAnswerPromptInput.tsx`, `tests/unit/chat/ae-chat-composer-copy.test.ts`
- Risk: Stale intent can be resent without any failing test.
- Priority: High

**Imported claim link safety:**
- What's not tested: Rejection/omission of `javascript:`, `data:`, credential-bearing, control-character, and bidi-tainted `websiteUrl`/`sourceUrl`.
- Files: `src/modules/storefront/internal/business-enrichment.ts`, `src/components/ae/services/AeImportedClaims.tsx`, `tests/unit/answer/generative-layout.test.ts`
- Risk: A model/citation-derived unsafe URL becomes a clickable product link.
- Priority: High

**Full current Convex gate under Node 22:**
- What's not tested: Code generation/deployment of the current tree against a backend started with the repository’s supported Node runtime.
- Files: `package.json`, `tools/dev/local-dev.mjs`, `convex/capabilityOperationInvocationWorker.ts`
- Risk: Typecheck/lint can be green while deployable Convex functions remain unverified.
- Priority: High

**MCP inventory payload budget:**
- What's not tested: Maximum raw `tools/list` bytes or model-context impact after attaching full output schemas.
- Files: `src/lib/server/mcp-api.ts`, `tests/unit/server/mcp-api.test.ts`
- Risk: Contract-correct inventory becomes expensive or rejected by clients as the action set/schema grows.
- Priority: Medium

**Generic CLI action admission:**
- What's not tested: A CLI-declared credentialed/write action must pass the same approval and credential policy as dedicated adapters.
- Files: `tools/ae/commands/actions.ts`, `tests/unit/market-terminal/cli-errors.test.ts`, `src/modules/harness/approval-policy.ts`
- Risk: A future action becomes directly reachable with weaker admission.
- Priority: Medium

**Hosted money and provider recovery:**
- What's not tested: Real RPC receipt finality/reorg handling, exact provider settlement, automatic Stripe transfer, unknown-outcome recovery, and hosted revoke/refusal replay.
- Files: `src/modules/capability-supply/internal/x402-settlement-verifier.ts`, `convex/capabilityOperationInvocationWorker.ts`, `convex/moneyLedger.ts`, `tools/release/operation-gateway-production-smoke.ts`
- Risk: Local fixtures pass while production payment or recovery semantics diverge.
- Priority: High

**Current verification summary:**
- What's not tested: The complete release gate for this 257-file working tree.
- Files: `package.json`, `.github/workflows/kernel-release-gate.yml`, `.planning/STATE.md`
- Risk: Focused success is overgeneralized to the full current tree.
- Priority: High
- Evidence: On 2026-08-15, TypeScript and lint passed; six focused files passed 72 tests; `git diff --check` reported trailing-whitespace/EOF issues; Convex codegen failed at the local Node-action runtime prerequisite; production dependency audit reported ten vulnerabilities.

---

*Concerns audit: 2026-08-15*
