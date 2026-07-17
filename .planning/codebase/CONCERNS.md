# Codebase Concerns

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## Tech Debt

**Oversized source-of-truth modules:**
- Issue: Several domain and persistence modules combine validators, authorization, commands, projections, repair paths, and adapters in one file. The largest current files are `convex/customerRequestApplication.ts` (3,864 lines), `convex/inquiries.ts` (3,443), `convex/customerRequestRouteExecution.ts` (2,975), `convex/capabilitySupply.ts` (2,486), and `src/modules/inquiries/internal/commands.ts` (2,143).
- Files: `convex/customerRequestApplication.ts`, `convex/inquiries.ts`, `convex/customerRequestRouteExecution.ts`, `convex/capabilitySupply.ts`, `src/modules/inquiries/internal/commands.ts`
- Impact: Review scope is broad, authorization and integrity checks are easy to miss during changes, and merge conflicts concentrate in high-churn files.
- Fix approach: Split by cohesive command/read-model seam while preserving existing public Convex function names and `src/modules/*/public.ts` entrypoints. Keep shared invariants in one internal helper rather than duplicating them across extracted files.

**Legacy Answer Thread remains beside the canonical Customer Request:**
- Issue: A large independent Answer Thread orchestration stack still owns conversation state and recommendation behavior while the repository contract requires customer conversation to compile into and resume the canonical Customer Request.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `convex/answerThreads.ts`, `src/modules/customer-request/compiler.ts`, `convex/customerRequestApplication.ts`
- Impact: Two customer intent/history/recovery paths can drift in semantics, authority, and UI behavior. New work can accidentally deepen the path marked for migration rather than the canonical Request.
- Fix approach: Route new customer-conversation behavior through Customer Request APIs; treat Answer Thread as migration-only, inventory its remaining callers, and retire each duplicated state transition only after surface parity is proven.

**Convex environment access is not centralized or typed:**
- Issue: Current Convex source reads `process.env` directly in many runtime files instead of declaring and consuming typed application environment variables.
- Files: `convex/auth.config.ts`, `convex/authz.ts`, `convex/devSeed.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/security.ts`, `convex/customerRequestRouteTransportWorker.ts`
- Impact: Required configuration is discoverable only by search, misspellings are runtime failures, and test/runtime behavior can diverge.
- Fix approach: Declare supported keys in `convex/convex.config.ts` and access them through the generated environment contract. Keep secret values out of source and preserve typed proof-gap/refusal behavior for absent keys.

**Broad dynamic persistence helpers bypass table-specific types:**
- Issue: Reconstruction and migration helpers accept arbitrary table names and `Record<string, unknown>` rows, then perform scans and field-name comparisons at runtime.
- Files: `convex/source_state.ts`, `convex/notificationOutbox.ts`, `convex/inquiries.ts`, `convex/observability.ts`
- Impact: Schema changes can compile while breaking repair/readback code, and generic helpers make indexed access difficult.
- Fix approach: Replace generic table-name helpers with table-specific functions using `Doc<>` and `Id<>`; add indexes for lookup keys and keep reconstruction adapters explicit.

## Known Bugs

**The current import/source-completeness gate is not green:**
- Symptoms: `npm run test:imports` fails four assertions in `tests/imports/customer-request-source-completeness.test.ts`: shared projection usage, fixture/durable discovery alignment, hosted proof revision binding, and canonical Request wire-contract consumption.
- Current boundary: `npm run typecheck` passes. The failures were observed in the current dirty checkout and may be stale structural assertions or incomplete source/test synchronization; they do not by themselves establish a customer-facing runtime defect.
- Impact: The branch does not currently satisfy its own clean source-completeness gate, so exact-revision release or completion claims are blocked until each assertion is reconciled against the intended contract.
- Fix approach: Review the four failing expectations against the current source-owned seams, update implementation or guards deliberately, then rerun the complete `test:imports` command before hosted proof.

**No confirmed reproducible source bug found by static scan:**
- Symptoms: Not detected in the current source-only review.
- Files: `src/`, `convex/`, `tests/`
- Trigger: Not applicable.
- Workaround: Do not convert static risk findings into bug claims; reproduce through the intended surface before filing a confirmed bug.

## Security Considerations

**Public Convex functions create a large authorization review surface:**
- Risk: `convex/customerRequestApplication.ts` exposes many public `action` functions, and `convex/capabilitySupply.ts` exposes public queries/mutations. A missed `resolveRequestCaller`, ownership check, or `resolveAdminAuthority` check would be internet-reachable.
- Files: `convex/customerRequestApplication.ts`, `convex/capabilitySupply.ts`, `convex/capabilityContractDocuments.ts`, `convex/routingKernelV1History.ts`, `convex/authz.ts`
- Current mitigation: Customer Request actions call `resolveRequestCaller`; capability-supply owner/admin writes visibly check ownership or `resolveAdminAuthority`; argument and return validators are present.
- Recommendations: Prefer `internalAction`/`internalMutation`/`internalQuery` for functions not intentionally public, maintain an automated inventory of public Convex exports, and add negative authorization tests for every public write and sensitive read.

**Dynamic `v.any()` boundaries defer validation into handlers:**
- Risk: Several internet-facing arguments and returned records accept arbitrary Convex values before runtime normalization, including customer facts, capability documents, adapter configuration, and support export rows.
- Files: `convex/customerRequestApplication.ts`, `convex/customerRequestRouteExecution.ts`, `convex/capabilitySupply.ts`
- Current mitigation: Comments identify runtime-validated JSON boundaries; handlers normalize capability publications and bind Customer Request facts against the current requirement.
- Recommendations: Replace `v.any()` with recursive JSON or discriminated validators where practical; enforce explicit byte/depth/key limits before hashing, storing, logging, or forwarding dynamic data; add adversarial oversized/nested input tests.

**Authentication bypass flag has broad test usage:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` intentionally bypasses Clerk for local tests. Misconfiguration outside local development could undermine owner-surface authentication.
- Files: `src/routes/__root.tsx`, `src/lib/server/local-e2e-bypass.ts`, `src/routes/_operator/owner.inquiries.$threadId.tsx`, `tests/integration/registry-api.test.ts`
- Current mitigation: `src/routes/__root.tsx` throws when the flag is enabled in a production build, and `src/lib/server/local-e2e-bypass.ts` rejects production runtime use.
- Recommendations: Keep the double fail-closed guard, include it in release configuration tests, and never reuse this flag for hosted smoke or customer evidence.

**Agent identity standard and trust list are intentionally narrow:**
- Risk: Web Bot Auth support depends on an early package and draft ecosystem; widening accepted signature agents or weakening covered-component/age checks would change the trust boundary.
- Files: `src/modules/clearance/internal/web-bot-auth.ts`, `src/routes/api.agent.tools.ts`, `package.json`
- Current mitigation: Signed identity is separated from authorization, writes require clearance, and the default signature-agent list is pinned.
- Recommendations: Pin and review `web-bot-auth` upgrades, test every typed verification refusal, and require an explicit trust decision plus hosted interoperability proof before widening accepted agents.

## Performance Bottlenecks

**Unbounded Convex collections in operational paths:**
- Problem: Many queries use `.collect()` and only filter, find, or slice in memory. Examples include Answer Thread history, discovery/catalog status, registry projections, notification reconstruction, and generic source-state reads.
- Files: `convex/answerThreads.ts`, `convex/discovery.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/notificationOutbox.ts`, `convex/source_state.ts`, `convex/inquiries.ts`, `convex/observability.ts`
- Cause: Some paths enforce a small logical limit after collection, while reconstruction helpers query whole tables by dynamic name.
- Improvement path: Add indexes for every lookup tuple, use `.unique()`, `.first()`, `.take(n)`, or pagination at the database boundary, and batch maintenance work. Do not use `.collect().length` for counts; maintain counters where exact scalable counts are required.

**Route-problem reconstruction loads entire related sets:**
- Problem: Support reconstruction collects all Request revisions, reservations, and step attempts for a run before selecting the required records.
- Files: `convex/customerRequestRouteExecution.ts`
- Cause: `reconstructRouteProblem`-adjacent code uses broad indexed `.collect()` calls and then searches in memory.
- Improvement path: Query exact composite keys for the required revision and attempt, paginate genuinely list-shaped support data, and cap exported evidence explicitly.

**Capability graph compatibility is quadratic:**
- Problem: Graph construction compares every published node with every other node to derive schema-compatible edges.
- Files: `convex/capabilitySupply.ts`
- Cause: Nested loops compare output and input schema digests for all node pairs.
- Improvement path: Bucket nodes by input schema digest and join output digests to matching buckets; retain deterministic edge ordering and graph-digest tests.

**Large client workspace concentrates render and state cost:**
- Problem: The Customer Request workspace is a 1,594-line React component coordinating many lifecycle states and UI regions.
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`
- Cause: Projection interpretation, callbacks, conditional panels, and presentation are colocated.
- Improvement path: Extract stable view-model hooks and Astryx-backed sections at existing semantic seams; measure renders and preserve customer-surface lifecycle tests during each split.

## Fragile Areas

**Customer Request execution and recovery:**
- Files: `convex/customerRequestApplication.ts`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestV2Preparation.ts`, `src/modules/customer-request/hosted-agent-journey.ts`
- Why fragile: Optimistic revisions, idempotency, mandate state, dispatch outbox state, cancellation, partial/unknown outcomes, evidence, and recovery are coupled across several large modules.
- Safe modification: Preserve typed refusal/integrity outcomes, replay keys, revision guards, and single-Request resume behavior. Exercise happy path, failure, cancellation, interruption, and recovery through the real public Request surface.
- Test coverage: Source and integration coverage is substantial, but hosted tests require credentials/deployment and are not implied by a passing local suite.

**Inquiry delivery, receipts, and support reconstruction:**
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/inquiries/inquiry.functions.ts`, `convex/notificationOutbox.ts`, `src/lib/server/notification-provider.ts`
- Why fragile: Admission, owner/customer authorization, encrypted receipts, webhook reconciliation, provider dispatch, replay, and support readbacks cross module and runtime boundaries.
- Safe modification: Change one source-owned operation at a time; preserve idempotency and redaction; test provider failure, duplicate webhook, replay, and customer/owner access separately.
- Test coverage: Provider and deployed smoke suites exist but require external configuration; local mocks do not prove provider delivery.

**Discovery/catalog projection consistency:**
- Files: `convex/registry.ts`, `convex/catalog.ts`, `convex/discovery.ts`, `src/modules/discovery/developer-discovery.ts`, `src/routes/llms[.]txt.ts`
- Why fragile: Human registry, JSON, agent tools, discovery documents, and index status must remain consistent while publication and suppression state changes.
- Safe modification: Update the canonical registry projection and regenerate/verify all intended surfaces; keep public copy within the safe assistant contract.
- Test coverage: Contract and integration tests cover source parity, but current hosted indexing and useful real supply still require readback evidence.

**Generated route tree:**
- Files: `src/routeTree.gen.ts`, `src/routes/`
- Why fragile: The 2,238-line generated tree mirrors file-based routes and should not be hand-edited.
- Safe modification: Change route source files and regenerate through the configured TanStack/Vite workflow.
- Test coverage: Build and route-boundary tests detect much drift; hosted route reachability remains a separate gate.

## Scaling Limits

**Answer Thread turn history:**
- Current capacity: Write paths enforce 25 turns per thread; admin viewer limits normalize to at most 250 rows.
- Limit: Several write/read operations collect all thread turns before enforcing or projecting limits.
- Scaling path: Use bounded indexed reads, store or transactionally maintain turn count, and keep canonical Customer Request migration ahead of extending Answer Thread capacity.

**Convex transaction/document limits:**
- Current capacity: Convex values and transactions are bounded; exact production row volume was not established by this source scan.
- Limit: Whole-table reconstruction helpers and unbounded arrays can hit read/write or document limits as operational history grows.
- Scaling path: Normalize growing child collections into indexed tables, paginate reads, and schedule bounded maintenance batches.

**Registered capability graph:**
- Current capacity: No explicit source-owned maximum node count was detected for graph construction.
- Limit: Pairwise compatibility edge generation grows as O(n^2), and returned arrays remain subject to Convex value limits.
- Scaling path: Add admitted-supply page limits, digest-indexed joins, and explicit graph-size refusal/proof-gap states.

## Dependencies at Risk

**`web-bot-auth` 0.1.3:**
- Risk: The identity implementation sits on an early-version package and evolving Web Bot Auth drafts.
- Impact: Signature parsing, required coverage, directory resolution, or interoperability can change underneath a security-critical boundary.
- Migration plan: Pin upgrades, compare upstream specification changes, run known-good and refusal-vector tests, then prove against an intended hosted caller before adoption.

**Fast-moving framework stack:**
- Risk: `convex` 1.42.0, `@tanstack/react-start` 1.168.26, Vite 8.1.0, React 19.2.7, and Clerk integration evolve quickly.
- Impact: Generated types, server/client boundaries, auth propagation, and build behavior can shift during routine upgrades.
- Migration plan: Upgrade one platform seam at a time; run Convex codegen, typecheck, import/contract gates, build, browser tests, and hosted auth readback.

## Missing Critical Features

**Source, product authority, and deployed evidence are out of sync:**
- Problem: This branch is 140 commits ahead of deployed `origin/main` (`a91a37a3d8da09546994e70af92d6e532a4471e6`) and now exposes the Request workspace at `/`, redirects `/engine`, and contains customer-facing confirm, run, cancellation, problem, evidence, recovery, and repeat-permission paths. `PRODUCT.md` still labels its current-evidence section `2026-07-14` and describes several of those surfaces as unavailable.
- Evidence boundary: The newer branch source and local tests do not establish hosted reachability, useful real supply, successful external fulfilment, or customer value. The last successful kernel release gate found during this refresh covers deployed `main`, not this inspected revision.
- Blocks: Treating either `PRODUCT.md` or the local branch alone as confirmed-current product truth; closing the product map or making public market claims without exact-revision deployment and intended-surface readback.
- Fix approach: Reconcile `PRODUCT.md` against the branch only after the intended human and external-agent surfaces pass exact-revision hosted proof; keep unproven operations in the substrate/target category and record the proof boundary explicitly.

**Customer-visible target lifecycle is not fully proven:**
- Problem: The target Request -> RoutePlan -> Approve -> Run -> Inspect lifecycle guides implementation, but current customer reachability remains narrower and source objects do not prove production operation.
- Blocks: Public claims of customer-visible multi-capability choice, mandate, composite execution, useful real supply, or successful external fulfilment.

**Production fulfilment proof remains environment-dependent:**
- Problem: Source includes hosted smoke and provider tests, but credentials, deployment revision, admitted live supply, and external provider state are outside a static repository scan.
- Blocks: Treating local/source green gates as evidence of booking, payment, dispatch, availability, customer value, or production fulfilment.

## Test Coverage Gaps

**Hosted authenticated Customer Request lifecycle:**
- What's not tested: `npm run test:release:source` cannot establish the deployed revision, Clerk temporary-key path, human browser lifecycle, interruption/recovery, or useful admitted supply.
- Files: `tools/release/verify-customer-request-release-credential.ts`, `tools/release/customer-request-production-credential.ts`, `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`, `src/modules/customer-request/hosted-agent-journey.ts`
- Risk: A source-green release can remain unusable through the intended hosted human or agent surface.
- Priority: High

**Scale behavior of reconstruction and projection queries:**
- What's not tested: No evidence was found here of load tests at realistic table sizes for whole-table `.collect()` paths, capability graph construction, or support exports.
- Files: `convex/notificationOutbox.ts`, `convex/source_state.ts`, `convex/inquiries.ts`, `convex/capabilitySupply.ts`, `convex/customerRequestRouteExecution.ts`
- Risk: Transaction/read limits or latency failures appear only after operational history grows.
- Priority: High

**Adversarial dynamic-value boundaries:**
- What's not tested: Static scanning cannot establish exhaustive depth, size, unusual-value, and key-count coverage for every `v.any()` input/output path.
- Files: `convex/customerRequestApplication.ts`, `convex/customerRequestRouteExecution.ts`, `convex/capabilitySupply.ts`
- Risk: Oversized or malformed values can cause expensive validation, storage failures, or inconsistent refusal behavior.
- Priority: Medium

**External notification delivery and webhook behavior:**
- What's not tested: Provider mocks do not prove real Resend/Novu acceptance, webhook authenticity, bounce/complaint handling, or deployed secret/config correctness.
- Files: `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `src/routes/api.notification.resend-webhook.ts`, `convex/notificationOutbox.ts`
- Risk: An inquiry can be accepted locally while the customer or owner never receives a usable external notification.
- Priority: High

---

*Concerns audit: 2026-07-17*
