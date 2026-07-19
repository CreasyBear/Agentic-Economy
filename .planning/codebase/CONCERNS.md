# Codebase Concerns

**Analysis Date:** 2026-07-19
**last_mapped_commit:** `77ec35ac`

## Tech Debt

**Release baseline does not typecheck:**
- Issue: `npm run typecheck` exits with TypeScript errors at current `HEAD` (`77ec35ac`). The failures are not confined to tests: Convex registrations and their domain ports disagree about branded IDs, exact refusal unions, readonly projections, and optional fields.
- Files: `convex/capabilitySupply.ts`, `convex/capabilitySupplyGraphPorts.ts`, `convex/capabilitySupplyPublicationPorts.ts`, `tests/unit/customer-request/application/provide-facts.test.ts`, `tests/unit/customer-request/application/refine.test.ts`, `tests/unit/customer-request/application/standing-route.test.ts`, `tests/unit/customer-request/route-execution/evidence-load.test.ts`
- Impact: `npm run test:release:source` cannot pass because it begins with `npm run lint && npm run typecheck`; pull requests and `main` releases are blocked by `.github/workflows/kernel-release-gate.yml`.
- Fix approach: Reconcile the capability-supply port return types to the exact Convex validators, preserve `Id<'businesses'>` instead of widening to `string`, narrow refusal reasons at the domain boundary, and update stale Customer Request fixtures to the current aggregate/projection contracts. Re-run `npm run typecheck` before interpreting downstream test failures.

**Documentation-to-runtime agent-surface drift:**
- Issue: `AGENTS.md` describes `GET /api/agent/tools`, `POST /api/agent/tools`, and action surfaces containing `agentTools`, but no matching route exists under `src/routes/`; registered actions currently use `http`, `agentJson`, and `answerThread` surfaces.
- Files: `AGENTS.md`, `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`, `src/routes/for-agents.tsx`
- Impact: Assistants and planners can believe a quiet tool door exists when live source does not expose it. This is a product-contract risk, not merely stale prose.
- Fix approach: Decide whether the route was intentionally retired. Either restore it through the central action registry with explicit authentication/write admission and executable route tests, or update the authority documents to the actual `agentJson`/HTTP surfaces. Do not claim assistant-callability from registry membership alone.

**Parallel legacy registry paths:**
- Issue: Public business routes call explicit legacy functions while the module also contains source-query and fallback paths.
- Files: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/modules/registry/registry.functions.ts`
- Impact: Fixes can land in the source-backed catalog path without changing the public routes, producing human/API disagreement and hiding production drift behind fallback behavior.
- Fix approach: Move all three routes onto one source-backed registry port, retain fallback only behind an observable migration switch, and test the intended route-to-source call graph under `tests/imports/` and `tests/integration/`.

**Legacy Customer Request representations remain executable:**
- Issue: V1 compiler/interpreter types and legacy V2 aggregate validators remain alongside current request, route, and preparation contracts.
- Files: `src/modules/customer-request/legacy-v1.ts`, `src/modules/customer-request/legacy-compiler-v1.ts`, `src/modules/customer-request/interpreter.ts`, `src/modules/customer-request/preparation.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`, `convex/customerRequestV2ReadPorts.ts`
- Impact: Changes can update the wrong compiler or require compatibility edits across multiple aggregate shapes. Integrity failures become runtime exceptions rather than an explicit migration state.
- Fix approach: Measure remaining legacy rows through bounded internal readback, stop new legacy writes, document the retirement condition, and remove the legacy compiler only after migration tests prove current aggregates can read all retained data.

**Large orchestration and schema files:**
- Issue: Several production files concentrate validators, projection assembly, admission, and orchestration: `convex/customerRequestApplication.ts` (1,749 lines), `convex/registry.ts` (1,622), `convex/discovery.ts` (1,565), `src/modules/discovery/developer-discovery.ts` (1,534), `convex/inquiries.ts` (1,435), and `src/modules/capability-contract/public.ts` (1,340).
- Files: `convex/customerRequestApplication.ts`, `convex/registry.ts`, `convex/discovery.ts`, `src/modules/discovery/developer-discovery.ts`, `convex/inquiries.ts`, `src/modules/capability-contract/public.ts`
- Impact: Contract edits create broad diffs and make review of authority, validator, and persistence changes harder. Line count alone is not evidence that another split is valuable.
- Fix approach: Keep Convex validators at the host boundary. Extract only a measured operation family into a module-owned machine plus semantic ports, following existing `src/modules/customer-request/**` and `convex/*Ports.ts` seams; do not create sibling files that merely redistribute host code.

**Astryx migration is incomplete:**
- Issue: The active UI still contains a large bespoke `Ae*` component tree even though `AGENTS.md` and `DESIGN.md` require Astryx-first presentation work.
- Files: `src/components/ae/`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `AGENTS.md`, `DESIGN.md`
- Impact: New work can extend a retired presentation system, increasing visual inconsistency and migration cost.
- Fix approach: Replace presentation primitives incrementally with `@astryxdesign/core` and `@astryxdesign/theme-neutral`, while retaining AE domain behavior behind the existing module APIs. Do not add new bespoke `Ae*` presentation components.

## Known Bugs

**Type contract regression prevents a clean build:**
- Symptoms: `npm run typecheck` exits non-zero with errors including `string` where `Id<'businesses'>` is required, widened `{ kind: 'refused'; reason: string }` results that do not satisfy exact validators, incomplete capability model fixtures, missing standing-route exports, and outdated Customer Request decision shapes.
- Files: `convex/capabilitySupply.ts`, `convex/capabilitySupplyGraphPorts.ts`, `tests/unit/customer-request/application/provide-facts.test.ts`, `tests/unit/customer-request/application/refine.test.ts`, `tests/unit/customer-request/application/standing-route.test.ts`
- Trigger: Run `npm run typecheck` from the repository root.
- Workaround: None appropriate for release. `npm run check:convex-codegen` is not a substitute because `package.json` explicitly runs it with `--typecheck=disable`.

**Agent tool endpoint described but absent:**
- Symptoms: A client following `AGENTS.md` to `/api/agent/tools` has no generated TanStack route in `src/routeTree.gen.ts` and no handler under `src/routes/`.
- Files: `AGENTS.md`, `src/routeTree.gen.ts`, `src/routes/`, `src/modules/actions/index.ts`
- Trigger: Inspect the generated route tree or request the documented endpoint.
- Workaround: Use the exact published HTTP/JSON route that exists for the operation; do not infer equivalent write authority.

## Security Considerations

**Local E2E authentication bypass has broad authority:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` bypasses Clerk middleware and affects owner, operator, inquiry, settings, registry, storefront, removal-dispute, discovery, and answer-thread seams. A non-production deployment with this flag can expose privileged fixture behavior.
- Files: `src/start.ts`, `src/lib/server/local-e2e-bypass.ts`, `src/lib/server/claim-owner-session.ts`, `src/lib/server/require-operator-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/settings/settings.functions.ts`
- Current mitigation: `src/lib/server/local-e2e-bypass.ts` throws when `NODE_ENV === 'production'`; `src/routes/__root.tsx` mirrors a client-side production guard; `tests/unit/server/local-e2e-bypass.test.ts` covers flag behavior.
- Recommendations: Gate by an explicit local runtime invariant as well as `NODE_ENV`, keep preview/staging deployments fail-closed, and maintain an import guard requiring all bypass reads through `src/lib/server/local-e2e-bypass.ts`.

**Source-write authorization is distributed across several layers:**
- Risk: Identity verification, action scope, replay protection, clearance, and write admission can be accidentally collapsed into one “authenticated” check when adding a route.
- Files: `src/modules/routing-kernel/caller-identity.ts`, `src/modules/security/source-write-admission.ts`, `src/modules/clearance/`, `convex/sourceWriteAdmission.ts`, `src/routes/api.answer.turn.ts`
- Current mitigation: HMAC-bound source-write admissions, scoped key families, nonces, expiry cleanup, and server-derived identity are implemented in the listed seams.
- Recommendations: Preserve the order identity -> declared scope -> clearance -> source-write admission -> domain authorization. Add any new write through an existing action/server seam and test signature replay, method/path/body binding, expired nonce, and wrong-scope refusal.

**Capability readiness probe is an outbound network and cost boundary:**
- Risk: Each healthy publication self-schedules every four minutes and each unhealthy publication every minute. A large or attacker-influenced publication set creates sustained Convex actions and outbound requests.
- Files: `convex/capabilitySupplyReadiness.ts`, `convex/capabilitySupplyPublicationPorts.ts`, `convex/sandboxAcceptanceSupply.ts`, `convex/devSeed.ts`
- Current mitigation: `convex/capabilitySupplyReadiness.ts` rechecks revision/target identity, restricts targets to public HTTP destinations, uses guarded DNS/connect lookup, blocks redirects, caps responses at 64 KiB, and reschedules only after an `observed` result.
- Recommendations: Replace perpetual per-publication chains with a bounded due-work queue or centrally budgeted cron, add jitter/backoff and a maximum probe rate, and expose backlog/probe-volume telemetry. Preserve the SSRF guard at both URL validation and connect time.

**Storefront import remains a high-risk SSRF seam:**
- Risk: An authenticated import can fetch attacker-controlled URLs and potentially reach private or metadata services if redirect, DNS-rebinding, or response caps regress.
- Files: `src/modules/storefront/internal/import-draft.ts`, `src/modules/network-guard/public.ts`, `src/modules/storefront/internal/network-guard.ts`, `src/routes/api.storefront.import-draft.ts`
- Current mitigation: Public-target validation, guarded lookup, manual redirects, timeouts, and response-size limits are tested in `tests/unit/storefront/import-draft.test.ts`.
- Recommendations: Keep network tests hermetic and mandatory; never replace guarded Undici dispatch with plain `fetch`; validate every redirect hop and retain byte/time limits.

**Secret-bearing configuration exists locally:**
- Risk: Local environment files may contain deployment, provider, or signing material.
- Files: `.env.local`, `.env.development.local`, `.env.example`
- Current mitigation: Values were not inspected during this audit; secret files must remain excluded from source control.
- Recommendations: Keep only names/placeholders in `.env.example`, verify ignore rules in `.gitignore`, and use hosting/Convex secret stores for production values.

## Performance Bottlenecks

**Unbounded Convex reads are widespread:**
- Problem: There are 50 production `.collect()` calls under `convex/` excluding test files. Several operate on tables that can grow with businesses, claims, threads, messages, manifests, attempts, status rows, or execution problems.
- Files: `convex/catalog.ts`, `convex/discovery.ts`, `convex/registry.ts`, `convex/answerThreads.ts`, `convex/source_state.ts`, `convex/inquiryRuntimeDbHelpers.ts`, `convex/customerRequestRouteExecutionProblemPorts.ts`, `convex/business.ts`
- Cause: Runtime adapters expose generic `collect()` helpers, and some indexed reads collect before applying JavaScript selection or sorting.
- Improvement path: Replace generic full-table adapters with operation-specific indexed `unique()`, `first()`, `take()`, or pagination. Prioritize public/request-path reads and mutation paths; add static guards similar to `tests/unit/convex/source-state-index-guard.test.ts`.

**“Bounded” compatibility helpers can still scan entire queries:**
- Problem: Helpers fall back to `(await query.collect()).slice(0, limit)` when a runtime query lacks `take`, so the returned array is bounded but database work is not.
- Files: `convex/notificationOutbox.ts`, `convex/inquiryRuntimeDbHelpers.ts`
- Cause: Shared runtime types support both Convex and test doubles with optional `take`.
- Improvement path: Require `take` in production adapter types. Keep a separate test adapter rather than silently degrading production semantics to `collect`.

**Registry read amplification:**
- Problem: Registry hydration runs multiple per-business queries for contexts, services, capabilities, suppression, index status, and discovery attempts.
- Files: `convex/registry.ts`, `src/modules/registry/internal/catalog-search-port.ts`, `src/modules/catalog/internal/catalog-from-rows.ts`
- Cause: `readPublicCatalogLookup` uses `Promise.all(uniqueBusinessIds.map(...))` across several collections, creating query fan-out proportional to result count; several child queries use `.collect()`.
- Improvement path: Enforce a small result cap, materialize the public catalog projection needed for search, and retrieve it by one indexed document per business. Measure reads per search in local Convex tests before changing storage.

**Discovery invalidation is transaction-size sensitive:**
- Problem: Invalidating one business collects every matching manifest and attempt, then patches each row in one mutation.
- Files: `convex/discovery.ts`
- Cause: `invalidateDiscoveryManifest` performs bulk invalidation without pagination or a continuation cursor.
- Improvement path: Maintain one current head/status row where possible; otherwise process bounded batches with an idempotent continuation mutation and an explicit completion state.

**Readiness probe cadence scales linearly with active publications:**
- Problem: A healthy publication schedules about 360 probes/day; an unhealthy publication schedules about 1,440 probes/day.
- Files: `convex/capabilitySupplyReadiness.ts`
- Cause: Every observed probe schedules its own successor with a fixed cadence.
- Improvement path: Use expiry-driven demand checks or a bounded scheduler with jitter, exponential backoff, and per-network caps. Track probe count, success rate, latency, and cost before increasing real supply.

## Fragile Areas

**Customer Request contract graph:**
- Files: `src/modules/customer-request/`, `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteMandate.ts`
- Why fragile: Domain aggregates, Convex validators, projection DTOs, preparation, mandate, execution journals, and tests encode the same lifecycle at different boundaries. The current typecheck regression demonstrates that a contract change can leave hosts and fixtures out of sync.
- Safe modification: Change the module-owned domain type first, update its semantic port, then update the exact Convex validator and fixtures in the same slice. Preserve one mutation as the atomic durability boundary.
- Test coverage: Extensive unit and integration suites exist under `tests/unit/customer-request/` and `tests/integration/customer-request-*`, but the current suite cannot be considered protective until `npm run typecheck` is green.

**Capability supply registration and graph projection:**
- Files: `src/modules/capability-supply/`, `convex/capabilitySupply.ts`, `convex/capabilitySupplyGraphPorts.ts`, `convex/capabilitySupplyPublicationPorts.ts`, `convex/capabilitySupplyReadiness.ts`
- Why fragile: Branded Convex IDs, domain strings, exact refusal unions, publication lifecycle, readiness evidence, and network egress converge here.
- Safe modification: Do not widen branded IDs or refusal reasons for convenience. Keep Node network code isolated in the `"use node"` action `convex/capabilitySupplyReadiness.ts`; do not import Node-only helpers into query/mutation bundles.
- Test coverage: Supply registration and sandbox suites exist under `tests/integration/capability-supply-*`, but live type failures currently prevent a trustworthy aggregate result.

**Inquiry dual runtime:**
- Files: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/local-e2e-adapter.ts`, `convex/inquiries.ts`, `convex/inquiryRuntimeDbHelpers.ts`
- Why fragile: The same operation can run through source-backed Convex or local E2E adapters, and shared compatibility helpers weaken production type guarantees.
- Safe modification: Treat the source-backed path as canonical, keep local behavior behind `isLocalE2EAuthBypassEnabled()`, and add parity assertions for receipts, idempotency, refusal codes, and notification state.
- Test coverage: `tests/unit/inquiries/` and `tests/unit/convex/inquiries-runtime.test.ts` are substantial; hosted provider behavior still depends on deployment smoke tests and credentials.

**Generated route and Convex API artifacts:**
- Files: `src/routeTree.gen.ts`, `convex/_generated/api.d.ts`, `convex/_generated/dataModel.d.ts`
- Why fragile: Generated files can change as a side effect of route/codegen commands; `convex/_generated/api.d.ts` is already modified in the shared worktree.
- Safe modification: Do not hand-edit generated artifacts. Run the owning generator only when the source change requires it, review the diff, and avoid overwriting unrelated dirty changes.
- Test coverage: `npm run check:convex-codegen` verifies bundling/schema only because typechecking is disabled; pair it with `npm run typecheck`.

## Scaling Limits

**Convex document and transaction limits:**
- Current capacity: No production capacity number is encoded. Convex arrays and documents are bounded, while several lifecycle schemas retain nested arrays and several mutations patch collected row sets.
- Limit: Registry/discovery invalidation, Answer Thread history, execution problem history, and compatibility collectors will hit read/write or document limits as retained data grows.
- Scaling path: Add explicit pagination/retention contracts, separate high-churn child rows, and record a per-operation read/write budget in focused tests.

**Scheduled readiness work:**
- Current capacity: No global publication or probe budget is enforced in `convex/capabilitySupplyReadiness.ts`.
- Limit: Cost and outbound load grow directly with active and unhealthy publication count.
- Scaling path: Centralize due work, cap probes per interval/network, apply backoff/jitter, and require an observable budget before onboarding real supply at volume.

**Registry hydration:**
- Current capacity: Search limits are bounded at route/domain edges, but hydration cost multiplies across several child collections per returned business.
- Limit: Read amplification grows with both result count and child-row history.
- Scaling path: Serve search/detail from current materialized projections and move historical/status detail to owner/operator reads.

## Dependencies at Risk

**Nightly Nitro alias:**
- Risk: `nitro` is pinned through `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`, so dependency resolution can move within a nightly range and introduce server/runtime regressions.
- Impact: Build, SSR, middleware, and deployment behavior can change outside AE source.
- Migration plan: Pin an exact known-good nightly commit or move to a stable Nitro release after exercising `npm run test:release:source` and hosted readback.

**Unpinned advisory React Doctor action:**
- Risk: `.github/workflows/react-doctor.yml` uses `millionco/react-doctor@v2` while comments describe a latest-version workflow; it is advisory and cannot block regressions.
- Impact: Signal and scoring can change, and reported UI issues do not protect the release gate.
- Migration plan: Pin a trusted action revision and graduate only validated error-level findings into a blocking check. Keep `npm run lint`, UI contract tests, and browser tests authoritative.

**Fast-moving pre-stable integrations:**
- Risk: `@astryxdesign/core` and `@astryxdesign/theme-neutral` are `^0.1.2`, `@tanstack/ai` is `^0.38.0`, and `web-bot-auth` is `0.1.3`.
- Impact: Minor updates may contain breaking API or behavioral changes in presentation, model integration, or caller identity.
- Migration plan: Review lockfile diffs, pin exact versions for release-critical seams, and add contract tests around exports and request-signature behavior before upgrades.

## Missing Critical Features

**No live machine tool-discovery route matching the stated contract:**
- Problem: The documented `/api/agent/tools` discovery/invocation surface is absent from the route tree.
- Blocks: External assistants cannot discover and invoke the central action registry through the contract described in `AGENTS.md`; current source proof must be limited to the routes that actually exist.

**No enforced general code-coverage threshold:**
- Problem: The repository has strong scenario and contract suites, but `package.json` contains no general coverage command or minimum line/branch threshold; “coverage” scripts under `eval/` measure evaluation-case coverage, not code coverage.
- Blocks: There is no quantitative signal for unexercised production branches, especially generic adapters and error paths.

**No global readiness-probe budget:**
- Problem: Per-publication self-scheduling has no central concurrency, daily-volume, or cost ceiling.
- Blocks: Safe expansion from labelled sandbox supply to a large real publication set.

## Test Coverage Gaps

**Current aggregate test signal is unavailable:**
- What's not tested: The source release contract cannot reach unit, integration, import, copy, SEO, UI, or build gates while typecheck fails.
- Files: `package.json`, `.github/workflows/kernel-release-gate.yml`, `convex/capabilitySupply.ts`, `tests/unit/customer-request/application/`
- Risk: Individual focused tests may pass while the release remains structurally broken.
- Priority: High

**Agent discovery/invocation route:**
- What's not tested: No route exists for the `/api/agent/tools` contract, so there is no executable discovery, read invocation, write refusal, authentication, or replay suite for it.
- Files: `AGENTS.md`, `src/routes/`, `src/modules/actions/index.ts`
- Risk: Documentation and implementation can continue diverging without a failing test.
- Priority: High

**Cost-budget regression guards:**
- What's not tested: Static limits on production `.collect()` calls, per-request registry query fan-out, readiness probe rescheduling volume, and generic `collect().slice()` fallbacks.
- Files: `convex/registry.ts`, `convex/discovery.ts`, `convex/catalog.ts`, `convex/answerThreads.ts`, `convex/capabilitySupplyReadiness.ts`, `convex/notificationOutbox.ts`, `convex/inquiryRuntimeDbHelpers.ts`
- Risk: A locally correct feature can cause unbounded Convex reads, scheduler volume, or outbound cost.
- Priority: High

**Local bypass behavior outside production:**
- What's not tested: The helper tests distinguish production and non-production, but there is no deployment-level assertion that preview/staging cannot start with the bypass enabled.
- Files: `src/start.ts`, `src/lib/server/local-e2e-bypass.ts`, `tests/unit/server/local-e2e-bypass.test.ts`
- Risk: A preview environment can expose owner/operator fixture authority.
- Priority: Medium

**Provider and hosted paths require opt-in credentials:**
- What's not tested: Resend, Novu, authenticated Customer Request, and exact-revision hosted behavior are separate smoke commands and do not run on pull requests.
- Files: `package.json`, `tests/deploy-smoke/resend-notification-smoke.spec.ts`, `tests/deploy-smoke/novu-notification-smoke.spec.ts`, `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`, `.github/workflows/kernel-release-gate.yml`
- Risk: Provider configuration and production-only behavior can fail after source tests pass; only `main` hosted proof catches it.
- Priority: Medium

---

*Concerns audit: 2026-07-19*
