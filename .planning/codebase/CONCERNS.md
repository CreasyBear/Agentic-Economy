# Codebase Concerns

**Analysis Date:** 2026-07-11

## Tech Debt

**Kernel capability coverage is incomplete by contract:**
- Issue: The current routing kernel supports the HTTP path and parts of the MCP surface, while discovery/normalization, richer graph scoring, hosted/platform capabilities, human handoffs, reputation, replay isolation, protected-payload lifecycle, and learned routing remain destination requirements.
- Files: `.planning/REQUIREMENTS.md`, `src/modules/routing-kernel/public.ts`, `src/modules/routing-kernel/http.ts`, `src/modules/routing-kernel/mcp.ts`, `convex/routingKernel.ts`
- Why: The repository deliberately distinguishes accepted Level 2 proof from the eventual kernel contract.
- Impact: Callers must not infer universal transport, fulfillment, settlement, certification, or learning support from the live HTTP proof.
- Fix approach: Deliver each remaining adapter and evidence contract behind explicit conformance tests, then update the live/required classification in `.planning/REQUIREMENTS.md` only after executable proof exists.

**Large runtime modules concentrate unrelated change risk:**
- Issue: Several production files exceed 1,000 lines and combine validation, authorization, persistence, projection, and orchestration logic.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/routing-kernel/internal/kernel.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`, `convex/routingKernelStore.ts`
- Why: Domain behavior accumulated into source-facing Convex modules and central orchestrators as contracts matured.
- Impact: Small changes have broad regression surfaces, reviews are difficult, and parallel edits are conflict-prone.
- Fix approach: Continue extracting deep, domain-owned modules around stable boundaries (admission, projection, persistence, provider egress) while retaining thin Convex entrypoints and behavior-first tests.

**Convex runtime and pure-domain implementations can drift:**
- Issue: Routing, incident control, storage, inquiries, and notification behavior exist in both `src/modules/**` implementations and Convex-facing modules.
- Files: `src/modules/routing-kernel/internal/kernel.ts`, `src/modules/routing-kernel/internal/store.ts`, `src/modules/routing-kernel/incident-control.ts`, `convex/routingKernel.ts`, `convex/routingKernelStore.ts`, `convex/routingKernelIncidentControl.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/inquiries.ts`
- Why: Pure in-memory contracts support fast deterministic tests while Convex owns durable execution.
- Impact: A contract can pass unit tests but differ at the hosted persistence boundary.
- Fix approach: Keep shared types and invariants in `src/modules/**`, minimize duplicated algorithms, and require parity/integration tests for every durable adapter change.

**Deployment target depends on a nightly runtime:**
- Issue: `nitro` is pinned through an npm alias to a dated `nitro-nightly` build.
- Files: `package.json`, `package-lock.json`, `vite.config.ts`
- Why: TanStack Start deployment currently uses Nitro's Vercel Node preset and raw-request webhook behavior.
- Impact: Reproducibility is pinned, but maintenance and security support are less predictable than a stable release; framework upgrades may break build or request semantics.
- Fix approach: Track the upstream stable release, preserve webhook raw-body contract tests, and migrate only after build plus deployed readback gates pass.

**Current working tree is a high-risk architectural transition:**
- Issue: The uncommitted tree contains broad deletions across planning history, legacy modules, tests, and agent assets alongside new routing-kernel code and extensive route/component extraction.
- Files: `.planning/`, `src/modules/`, `src/routes/`, `convex/`, `tests/`, `.agents/`
- Why: The repository is being re-centered on the neutral routing kernel and decomposed into smaller owned modules.
- Impact: A partial commit or broad restore can lose user work, remove still-required proof, or leave source/test ownership mismatched.
- Fix approach: Preserve the working tree, review changes by domain, use narrow commits only when authorized, and prove deleted surfaces are retired through import/architecture tests before accepting removals.

## Known Bugs

**No source-confirmed reproducible product bug was identified during this static refresh:**
- Symptoms: None asserted without an executable reproduction.
- Trigger: Not applicable.
- Workaround: Not applicable.
- Root cause: Static inspection can identify risks and contract gaps but cannot establish a user-visible bug by itself.
- Blocked by: Run the narrow and release verification suites against the complete uncommitted tree; this map does not claim those suites passed.

## Security Considerations

**Remote provider egress is an SSRF and credential-custody boundary:**
- Risk: A malicious capability endpoint could target private infrastructure, redirect to a private address, exfiltrate credentials, or return an oversized payload.
- Files: `src/modules/routing-kernel/http-capability-binding.ts`, `src/modules/network-guard/public.ts`, `convex/routingKernelTransport.ts`, `src/modules/security/provider-api-base-url.ts`
- Current mitigation: HTTPS-only endpoint validation, URL credential/hash rejection, public-target DNS checks, redirect refusal, response-size limits, and provider secret-surface tests.
- Recommendations: Preserve validation at the actual egress point, test DNS rebinding and IPv4/IPv6 edge cases, keep credentials server-only, and re-run `tests/unit/security/ssrf-surface-drift.test.ts` plus `tests/unit/security/provider-secret-surface.test.ts` for every transport change.

**Execution authority spans multiple cryptographic and durable records:**
- Risk: A mismatch among caller identity, route authorization, step grant, spend budget, disclosure budget, or incident state could authorize an unintended provider/data/side effect.
- Files: `src/modules/routing-kernel/caller-identity.ts`, `src/modules/routing-kernel/authorization.ts`, `src/modules/routing-kernel/internal/step-grant.ts`, `src/modules/routing-kernel/internal/budget-authority.ts`, `src/modules/routing-kernel/internal/data-authorization-budget.ts`, `convex/routingKernelStore.ts`, `convex/routingKernelAgentGrants.ts`
- Current mitigation: Signed HTTP-message verification, expiring immutable quotes, exact grants, cumulative budget consumption, fail-closed migration posture, and incident freeze/recovery facts.
- Recommendations: Treat all schema and canonical-digest changes as security migrations; require replay, concurrency, expiry, and negative authorization tests at the Convex boundary.

**Local end-to-end auth bypass uses a client-visible environment flag:**
- Risk: Accidentally enabling the bypass in a deployed build could weaken Clerk protection.
- Files: `src/lib/server/local-e2e-bypass.ts`, `src/lib/ui/local-e2e-bypass.ts`, `.env.example`, `tests/unit/server/local-e2e-bypass.test.ts`
- Current mitigation: Both server and UI paths throw in production and require `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` explicitly.
- Recommendations: Keep the production fail-closed checks duplicated at both boundaries, exclude the flag from deployment configuration, and retain build/runtime regression tests.

**Notification dispatch exposes privileged mutation surfaces:**
- Risk: Leaked outbox or provider secrets could trigger messages, enumerate operational state, or forge webhook results.
- Files: `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts`, `src/lib/server/notification-provider.ts`, `convex/notificationOutbox.ts`
- Current mitigation: Required system keys, provider webhook verification, redacted error strings, idempotent dispatch records, and explicit held/retry states.
- Recommendations: Rotate secrets, rate-limit privileged endpoints, ensure logs never include recipient/provider credentials, and exercise the provider-specific deployed smoke tests before release.

**Observability services can receive sensitive execution context:**
- Risk: Sentry/PostHog events may inadvertently include inquiry text, protected payloads, credentials, or agent authority material.
- Files: `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, `src/modules/observability/`, `tests/unit/observability/audit-redaction.test.ts`
- Current mitigation: Structured event contracts and audit redaction tests exist; Sentry upload is conditional on configured credentials.
- Recommendations: Keep event allowlists narrow, add payload-size and secret-canary tests for new events, and review replay capture whenever UI inputs change.

## Performance Bottlenecks

**Unbounded Convex collection paths:**
- Problem: Several runtime flows call `.collect()` across whole tables or all rows for a business/root run.
- Files: `convex/inquiries.ts`, `convex/discovery.ts`, `convex/routingKernelIncidentControl.ts`, `convex/routingKernelTracer.ts`
- Measurement: No production p95 or cardinality measurement is committed; risk is inferred from unbounded query shape.
- Cause: Reconstruction, migration, support-readback, and aggregate workflows favor complete snapshots.
- Improvement path: Add compound indexes, cursor pagination, bounded retention, and explicit maximum-cardinality refusal; instrument scanned-row counts before choosing thresholds.

**Central answer-turn orchestration has a wide latency fan-out:**
- Problem: A single turn can coordinate session state, search, model streaming, tool execution, evidence collection, finalization, and follow-up generation.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/routes/api.answer.turn.ts`
- Measurement: No committed end-to-end latency budget or hosted p95 was found.
- Cause: Strong evidence and finalization requirements create several serial durability gates around external model/provider latency.
- Improvement path: Instrument stage timings, parallelize independent reads only, keep mutation order explicit, and define timeout/cancellation budgets per external dependency.

**Large client components increase rendering and maintenance cost:**
- Problem: Chat and generative-answer components remain large despite ongoing extraction.
- Files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, `src/components/ae/harness/AeHarnessRunViewer.tsx`
- Measurement: No current bundle-size or interaction-latency budget is checked in CI.
- Cause: Many status, evidence, streaming, and interaction variants converge on single surfaces.
- Improvement path: Continue extracting state machines and presentational sections, lazy-load noncritical artifacts, and add bundle/interaction measurements before making optimization claims.

## Fragile Areas

**Routing-kernel canonical digests and schema evolution:**
- Why fragile: Authorization and incident reconstruction depend on stable canonical serialization and matching durable schema fields.
- Common failures: Historical rows fail validation, signatures no longer verify, migrated grants gain or lose authority, or incident projections disagree with immutable facts.
- Files: `src/modules/routing-kernel/internal/authority-digest.ts`, `src/modules/routing-kernel/internal/convex-schema.ts`, `convex/routingKernelStore.ts`, `convex/routingKernelIncidentControl.ts`, `convex/authzMigration.ts`
- Safe modification: Version contracts explicitly, retain compatibility validators, quarantine unverifiable legacy authority, and migrate with bounded cursors.
- Test coverage: Extensive unit/runtime tests exist under `tests/unit/routing-kernel/` and `tests/unit/convex/`; hosted migration/readback proof is still a separate gate.

**Generated route tree and filesystem routes:**
- Why fragile: TanStack Router behavior depends on filename semantics and generated `src/routeTree.gen.ts` output.
- Common failures: A renamed route is not regenerated, a helper becomes routable accidentally, or route/test inventories drift.
- Files: `src/routes/`, `src/routeTree.gen.ts`, `tests/imports/route-boundary.test.ts`, `tests/unit/routes/`
- Safe modification: Follow the route naming convention, run generation through the normal Vite/TanStack flow, and never hand-edit `src/routeTree.gen.ts`.
- Test coverage: Route boundary and route-focused unit tests exist; full browser coverage is not run by the current CI workflow.

**Source-owned truth versus fallback/demo data:**
- Why fragile: Registry, discovery, and answer flows include local E2E fixtures and graceful unavailable states beside durable Convex reads.
- Common failures: Fixture data leaks into production claims, an unavailable source is presented as an empty result, or generated discovery artifacts outrun source-owned evidence.
- Files: `src/modules/registry/internal/search.ts`, `src/modules/dev/internal/dev-seed-fixture.ts`, `src/modules/discovery/developer-discovery.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/local-e2e-bypass.ts`
- Safe modification: Keep local modes explicit and production-failing, preserve unavailable/error states, and verify public readbacks against durable source before changing copy.
- Test coverage: Source-readback, local-bypass, discovery parity, and copy tests exist; deployed readback requires separately configured Playwright smokes.

**Notification outbox state machine:**
- Why fragile: Provider dispatch, webhook reconciliation, retries, operator holds, and idempotency update the same durable lifecycle.
- Common failures: Duplicate delivery, retry after terminal success, stale webhook regression, or sensitive provider errors reaching public readbacks.
- Files: `src/modules/notification-outbox/internal/commands.ts`, `convex/notificationOutbox.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`
- Safe modification: Preserve monotonic transitions and operation keys, test out-of-order webhooks and retry exhaustion, and keep provider adapters outside domain state transitions.
- Test coverage: Unit and Convex runtime tests are present; real provider behavior is gated by opt-in deployed smokes.

## Scaling Limits

**Hard-coded routing and incident cardinality bounds:**
- Current capacity: Eligible binding enumeration refuses more than 256 rows; root/leaf tracing caps leaves at 16; incident reconstruction caps freeze facts at 100; drain sweeps page 25 roots at a time.
- Files: `convex/routingKernelBindings.ts`, `convex/routingKernelTracer.ts`, `convex/routingKernelIncidentControl.ts`
- Limit: Larger networks, unusually complex graphs, or long incident histories hit explicit refusal paths.
- Symptoms at limit: `eligible_binding_limit_exceeded`, `root_leaf_limit_exceeded`, `incident_reconstruction_fact_limit_exceeded`, or prolonged scheduled drain work.
- Scaling path: Measure real cardinalities, paginate binding selection, aggregate/compact immutable incident projections without deleting source facts, and preserve deterministic refusal when capacity is exceeded.

**In-memory rate limiting is process-local where used:**
- Current capacity: Bounded by a single serverless process's memory and lifetime rather than a documented global request rate.
- Files: `src/modules/answer-thread/internal/answer-rate-limit.ts`, `src/routes/api.answer.turn.ts`
- Limit: Horizontal instances do not share counters and cold starts reset state.
- Symptoms at limit: Inconsistent enforcement across instances or bursts passing during scale-out.
- Scaling path: Move abuse counters to an atomic durable store with TTL and identity-aware keys; retain `Retry-After` behavior and deterministic tests.

## Dependencies at Risk

**Rapidly moving framework stack:**
- Risk: React 19, Vite 8, TypeScript 6, TanStack Start/Router/AI, Convex, and Nitro are all version-sensitive; TanStack Start and Router are already on different patch versions and Nitro is nightly.
- Files: `package.json`, `package-lock.json`, `vite.config.ts`
- Impact: SSR, generated routes, server functions, streaming, deployment adapters, or type inference can break during upgrades.
- Migration plan: Upgrade one subsystem at a time, pin exact runtime-critical versions, run codegen/type/unit/integration/build first, then browser and deployed readback gates.

**Early-stage routing/auth packages:**
- Risk: `web-bot-auth` is `0.1.3` and the Astryx design packages are `0.1.x`, so their contracts may change materially.
- Files: `package.json`, `src/modules/routing-kernel/caller-identity.ts`, `src/components/ae/`, `src/styles.css`
- Impact: Agent authentication interoperability or broad UI rendering can regress.
- Migration plan: Wrap third-party APIs behind owned modules/components, pin versions for release, and preserve conformance plus UI-contract tests during upgrades.

## Missing Critical Features

**Full neutral capability discovery and graph scoring:**
- Problem: Live routing does not yet fulfill the destination requirement for normalized cross-node discovery and scoring across policy, health, reputation, cost, latency, and evidence.
- Current workaround: Registered exact capability bindings and current evidence snapshots drive the accepted proof path.
- Blocks: General-purpose neutral routing across heterogeneous nodes and defensible learned route selection.
- Implementation complexity: High; requires versioned capability descriptors, indexes, scoring policy, evidence attribution, and adversarial conformance tests.

**Non-HTTP adapters and explicit human handoff:**
- Problem: MCP, hosted-agent, platform-hosted capability, and human-handoff coverage is not all live at the same enforcement depth as HTTP.
- Current workaround: The accepted proof uses registered hosted capability bindings behind the current transport path.
- Blocks: Requirement-complete adapter neutrality and truthful claims of broad execution support.
- Implementation complexity: High; each adapter needs identity, grant consumption at effect point, cancellation, receipts, and failure semantics.

**Settlement, physical fulfillment, and named host certification are outside current proof:**
- Problem: The accepted Level 2 proof deliberately stops before these external outcomes.
- Current workaround: AE records attributed execution evidence and keeps reported outcome distinct from enforced execution.
- Blocks: Claims of end-to-end economic settlement, real-world fulfillment, or certified ChatGPT/Claude/Hermes interoperability.
- Implementation complexity: High and partner-dependent; do not collapse these into a UI or readback-only feature.

## Test Coverage Gaps

**Browser and accessibility gates are absent from pull-request CI:**
- What's not tested: `.github/workflows/eval-gate.yml` runs unit, integration, type, copy, SEO, UI-contract, import, eval, and build checks, but not `test:e2e` or `test:a11y`.
- Files: `.github/workflows/eval-gate.yml`, `package.json`, `playwright.config.ts`, `tests/e2e/`, `tests/e2e/a11y/`
- Risk: Navigation, hydration, auth redirects, keyboard behavior, or accessible-name regressions can merge despite green CI.
- Priority: High.
- Difficulty to test: Browser provisioning and authenticated state increase runtime and configuration cost, but the scripts already exist.

**Hosted and provider readback is opt-in:**
- What's not tested: Public deployed surfaces, authenticated owner/admin views, durable inquiry support records, Resend dispatch, and Novu dispatch are separate smoke commands rather than default CI gates.
- Files: `playwright.deploy-smoke.config.ts`, `tests/deploy-smoke/public-surface-smoke.spec.ts`, `tests/deploy-smoke/inquiry-support-record-smoke.spec.ts`, `tests/deploy-smoke/resend-notification-smoke.spec.ts`, `tests/deploy-smoke/novu-notification-smoke.spec.ts`
- Risk: Local source proof can pass while deployment configuration, auth material, Convex state, or provider integration is broken.
- Priority: High before hosted readiness claims.
- Difficulty to test: Requires deployed URLs, seeded source state, authenticated storage state, and provider secrets.

**Performance and capacity assertions lack executable budgets:**
- What's not tested: Query cardinality, answer-turn latency, bundle size, memory use, and concurrency behavior do not have committed pass/fail thresholds.
- Files: `convex/inquiries.ts`, `convex/discovery.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `vite.config.ts`
- Risk: Regressions emerge only under production data or traffic.
- Priority: Medium now; high before load-sensitive launch.
- Difficulty to test: Needs representative datasets, hosted telemetry, and agreed service-level objectives.

**The current broad deletion/replacement set has not been proven as one integrated tree in this mapping task:**
- What's not tested: Whether all removed legacy modules/tests and newly added kernel/routes compose under the complete release gate.
- Files: `src/`, `convex/`, `tests/`, `.planning/`
- Risk: Missing imports, lost contract coverage, stale generated files, or documentation/source disagreement can remain hidden when only narrow tests run.
- Priority: High.
- Difficulty to test: The full `npm run test:release` suite includes eval and browser work and may require environment/provider setup; start with `npm run typecheck`, `npm run check:convex-codegen`, focused tests, and `npm run build`.

---

*Concerns audit: 2026-07-11*
*Update as issues are fixed or new ones discovered*
