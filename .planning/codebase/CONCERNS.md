# Codebase Concerns

**Analysis Date:** 2026-07-13
**Mapped Commit:** `9a6a70c7`

## Tech Debt

**Capability supply is an uncommitted cross-cutting addition:**
- Issue: The working tree introduces capability offering and transport-binding registration across schema composition, Convex commands, sandbox seeds, provider adapters, audit events, security authority, generated API types, and import/integration tests.
- Files: `convex/capabilitySupply.ts`, `src/modules/capability-supply/`, `src/modules/provider-integrations/`, `convex/schema.ts`, `convex/devSeed.ts`, `src/modules/sandbox-supply/public.ts`, `src/modules/security/internal/admin-authority.ts`, `tests/imports/capability-supply-boundaries.test.ts`, `tests/integration/capability-supply-registration.test.ts`
- Why: Supply identity, exact capability contracts, transport configuration, eligibility, and administrative authority must agree at one durable boundary.
- Impact: A partial commit can leave generated types, schema, authority scopes, seed data, and runtime functions out of sync. Parallel work can also overwrite the same source-owned seams.
- Fix approach: Preserve the current tree, review and commit by coherent domain boundary, run codegen and boundary tests with the complete change set, and do not restore broad paths to make the diff smaller.

**Large runtime modules combine multiple responsibilities:**
- Issue: Several production files exceed 1,000 lines and mix validation, authorization, persistence, projection, reconstruction, and orchestration.
- Files: `convex/inquiries.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/routing-kernel/internal/kernel.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`, `convex/routingKernelStore.ts`, `convex/routingKernelIncidentControl.ts`, `convex/customerRequestApplication.ts`
- Why: Domain contracts accumulated in central source-facing and durable adapters as the system expanded.
- Impact: Small changes have wide regression surfaces, ownership is harder to review, and concurrent modifications are conflict-prone.
- Fix approach: Extract domain-owned operations behind existing public seams, keep Convex entrypoints thin, and retain behavior-first tests before moving code.

**Pure-domain and Convex implementations can drift:**
- Issue: Routing, inquiries, customer requests, notification state, and capability supply have both owned `src/modules/**` contracts and Convex-facing persistence/orchestration code.
- Files: `src/modules/routing-kernel/`, `convex/routingKernel.ts`, `convex/routingKernelStore.ts`, `src/modules/inquiries/`, `convex/inquiries.ts`, `src/modules/customer-request/`, `convex/customerRequests.ts`, `src/modules/capability-supply/`, `convex/capabilitySupply.ts`
- Why: Pure contracts support deterministic tests while Convex owns durable execution and indexes.
- Impact: Unit tests can pass while hosted serialization, indexing, idempotency, or authorization behavior differs.
- Fix approach: Keep canonical types, hashes, and invariants in owned modules; minimize duplicated algorithms; require Convex runtime parity tests for durable adapter changes.

**Project authority documents describe overlapping eras:**
- Issue: `.planning/PROJECT.md` still frames the fresh-repo Phase 1 catalog wedge, while `.planning/REQUIREMENTS.md`, current source, and `AGENTS.md` describe later inquiry, routing, customer-request, and capability-supply behavior.
- Files: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `AGENTS.md`, `src/modules/actions/index.ts`, `src/modules/routing-kernel/`, `src/modules/customer-request/`
- Why: Product and architecture scope evolved faster than all planning authorities were consolidated.
- Impact: Contributors can follow a valid but stale rule set, incorrectly exclude live behavior, or overstate booking, payment, dispatch, or autonomous fulfillment that AE does not provide.
- Fix approach: Establish one current product/runtime authority, mark historical milestone documents as historical, and keep the safe assistant contract explicit: read, compare, summarize, route, and send only a qualified inquiry where published.

**Deployment depends on a pinned nightly Nitro build:**
- Issue: `nitro` resolves through an npm alias to a dated `nitro-nightly` release.
- Files: `package.json`, `package-lock.json`, `vite.config.ts`
- Why: TanStack Start deployment currently depends on Nitro behavior not represented by a stable package line.
- Impact: Security support and upgrade compatibility are less predictable; SSR, raw requests, or deployment output can change unexpectedly.
- Fix approach: Track the stable upstream path, pin runtime-critical versions, preserve raw-request and build contract tests, and migrate only after deployed readback proof.

## Known Bugs

**No reproducible user-visible bug was established by this static refresh:**
- Symptoms: None asserted without an executable reproduction.
- Trigger: Not applicable.
- Workaround: Not applicable.
- Root cause: Static inspection reveals risk and missing proof, not confirmed runtime failure.
- Blocked by: The mapper did not run the complete release, browser, hosted, or provider smoke suites against the changing working tree.

## Security Considerations

**Provider quote adapters are an external egress and secret-custody boundary:**
- Risk: Compromised configuration or provider behavior could exfiltrate API keys, redirect requests, return oversized bodies, misrepresent environment, or stall server work.
- Files: `src/modules/provider-integrations/shipping/server.ts`, `src/modules/provider-integrations/shipping/public.ts`, `src/modules/capability-supply/internal/transport-adapters.ts`, `convex/capabilitySupply.ts`
- Current mitigation: Provider calls use fixed provider base URLs, manual redirect handling, a 10-second abort signal, bounded identifier/secret validation, typed provider failure states, and adapter-specific configuration validation.
- Recommendations: Keep provider origins owned rather than registration-supplied, cap response bytes before full JSON parsing, redact credential material from audit/error paths, test redirect and malformed-body cases, and add rotation/runbook coverage.

**General routing transport remains an SSRF boundary:**
- Risk: A malicious registered endpoint or signature directory could target private infrastructure, exploit DNS changes, or return excessive data.
- Files: `convex/routingKernelTransport.ts`, `src/modules/network-guard/public.ts`, `src/modules/routing-kernel/http-capability-binding.ts`, `src/modules/security/provider-api-base-url.ts`
- Current mitigation: HTTPS-only validation, public-target DNS checks, redirect refusal, server-only credential lookup, and 64 KiB response limits exist at the egress layer.
- Recommendations: Preserve checks at every network effect point, test DNS rebinding and IPv4/IPv6 edge cases, and re-run SSRF and provider-secret drift tests for transport changes.

**Capability-supply administrative commands are high-authority mutations:**
- Risk: An incorrectly authorized operator could register a business offering, bind credentials/endpoints, or mark supply eligible, changing what routing considers executable.
- Files: `convex/capabilitySupply.ts`, `src/modules/security/internal/admin-authority.ts`, `src/modules/security/public.ts`, `src/modules/capability-supply/public.ts`
- Current mitigation: Commands use explicit actor envelopes, admin authority scopes, operation keys, exact contract references, canonical hashes, audit records, and fail-closed integrity checks.
- Recommendations: Verify authority from server-derived identity rather than client actor fields, test cross-admin replay and revocation, make eligibility changes separately auditable, and treat schema/hash changes as security migrations.

**Canonical hashes and idempotency records are authorization-adjacent:**
- Risk: Serialization drift, ambiguous retries, or replay-state corruption can cause a command to be accepted under different material or make legitimate recovery impossible.
- Files: `convex/capabilitySupply.ts`, `src/modules/common/canonical-digest.ts`, `src/modules/routing-kernel/internal/authority-digest.ts`, `convex/routingKernelStore.ts`, `convex/customerRequests.ts`
- Current mitigation: Exact request/result digests, operation keys, immutable identity checks, bounded evidence references, and integrity failures are encoded.
- Recommendations: Version canonical material, preserve cross-version fixtures, exercise concurrent duplicate commands at the durable boundary, and quarantine unverifiable legacy records rather than granting authority.

**Local E2E authentication bypass is client-visible configuration:**
- Risk: Enabling the bypass in a deployed build could weaken Clerk protection.
- Files: `src/lib/server/local-e2e-bypass.ts`, `src/routes/__root.tsx`, `.env.example`, `tests/unit/server/local-e2e-bypass.test.ts`
- Current mitigation: Server and UI paths throw in production and require an explicit environment flag.
- Recommendations: Keep production fail-closed checks at both boundaries, exclude the flag from deployment configuration, and retain build/runtime regression coverage.

**Inquiry and observability payloads contain sensitive human data:**
- Risk: Inquiry bodies, contact details, owner replies, provider payloads, or agent authority material could leak through public projections, logs, Sentry, PostHog, or notification errors.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/`, `src/lib/observability/`, `src/modules/observability/`, `src/lib/server/notification-provider.ts`, `tests/unit/observability/audit-redaction.test.ts`
- Current mitigation: Public DTO allowlists, redacted audit contracts, private owner actions, and notification error normalization exist.
- Recommendations: Keep telemetry allowlisted, add secret-canary tests for new events, review replay/session capture around forms, and never expose private inquiry content through registry or assistant read surfaces.

## Performance Bottlenecks

**Numerous Convex reads materialize complete result sets:**
- Problem: Catalog, registry, discovery, inquiries, source-state, observability, notification, and some routing paths use `.collect()`, including whole-table compatibility helpers.
- Files: `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/source_state.ts`, `convex/notificationOutbox.ts`, `convex/observability.ts`, `convex/routingKernelIncidentControl.ts`
- Measurement: No committed production cardinality or p95 scan metric was found; this is inferred from query shape.
- Cause: Reconstruction, migration compatibility, projection repair, and support readback favor complete snapshots.
- Improvement path: Replace broad compatibility scans with indexed lookups, cursor pagination, bounded retention, and explicit maximum-cardinality refusal; instrument scanned row counts before setting thresholds.

**Answer-turn orchestration has serial external and durable latency:**
- Problem: One request can coordinate session state, search, model streaming, tool calls, evidence collection, finalization, and follow-up generation.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/routes/api.answer.turn.ts`
- Measurement: No committed end-to-end latency SLO or hosted p95 threshold was found.
- Cause: Evidence and finalization requirements place durable gates around external model and provider work.
- Improvement path: Instrument per-stage timing, define dependency-specific cancellation budgets, parallelize independent reads only, and retain explicit mutation order.

**Shipping quote aggregation can multiply provider latency:**
- Problem: Each configured shipping adapter performs a remote request with a 10-second timeout; sequential orchestration or multiple candidate providers can consume a large preparation budget.
- Files: `src/modules/provider-integrations/shipping/server.ts`, `src/modules/customer-request/preparation.ts`, `src/modules/routing-kernel/internal/kernel.ts`
- Measurement: Adapter timeouts are explicit, but no aggregate quote-preparation budget or hosted p95 is committed.
- Cause: Fresh quotes require remote provider state and conservative failure classification.
- Improvement path: Define an overall deadline, cancel outstanding work when it expires, bound provider fan-out, record provider-stage timings, and preserve `unknown` rather than inferring a failed or successful outcome after timeout.

**Large client modules lack enforced bundle and interaction budgets:**
- Problem: Several chat, answer, claim, and UI contract files remain large and converge many states.
- Files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, `src/routes/claim.tsx`, `src/lib/ui/contract-scans.ts`, `src/lib/ui/status-presentation.ts`
- Measurement: The build gate runs, but no bundle-size or interaction-latency threshold is enforced in CI.
- Cause: Streaming, evidence, status, validation, and responsive variants accumulate on central surfaces.
- Improvement path: Measure before optimizing, extract state machines and stable presentation sections, lazy-load noncritical artifacts, and add budgets when representative baselines exist.

## Fragile Areas

**Capability offering/binding registration and eligibility:**
- Why fragile: Exact contract identity, business publication, adapter configuration, registration hash, eligibility hash, audit history, and admin authority must all agree.
- Common failures: A binding references the wrong offering or network, configuration cannot be reconstructed from stored canonical JSON, an inactive contract is treated as eligible, or replay produces a different result.
- Files: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/internal/transport-adapters.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `convex/capabilitySupply.ts`
- Safe modification: Change schema, validators, canonical material, Convex functions, generated types, seed data, and parity tests together; refuse integrity drift without fallback.
- Test coverage: Unit, import-boundary, and integration tests are being added under `tests/unit/capability-supply/`, `tests/imports/capability-supply-boundaries.test.ts`, `tests/integration/capability-supply-registration.test.ts`, and `tests/integration/capability-supply-sandbox-registration.test.ts`.

**Shipping provider normalization:**
- Why fragile: Shippo and EasyPost have different request/response shapes, money formats, environment fields, carrier selection, delivery estimates, and error semantics.
- Common failures: Wrong rate selection, decimal-to-minor-unit errors, stale quotes presented as fresh, test rates presented as production, or network ambiguity collapsed into provider refusal.
- Files: `src/modules/provider-integrations/shipping/server.ts`, `src/modules/provider-integrations/shipping/public.ts`, `tests/integration/shipping-provider-quote-input.test.ts`, `tests/unit/customer-request/shipping-quote-input.test.ts`
- Safe modification: Preserve provider-specific adapters behind one owned normalized contract, use deterministic fixtures, enforce freshness/environment fields, and never reinterpret a quote as booking, payment, dispatch, or fulfillment.
- Test coverage: Adapter contract and input integration tests exist in the working tree; real provider readback is not established by fixture-backed tests.

**Routing-kernel canonical authority and schema evolution:**
- Why fragile: Authorization, grants, budgets, execution records, and incident reconstruction depend on stable serialization and matching durable fields.
- Common failures: Historical rows fail validation, signatures stop verifying, migrated grants gain authority, or incident projections disagree with immutable facts.
- Files: `src/modules/routing-kernel/internal/authority-digest.ts`, `src/modules/routing-kernel/internal/convex-schema.ts`, `convex/routingKernelStore.ts`, `convex/routingKernelIncidentControl.ts`, `convex/authzMigration.ts`
- Safe modification: Version contracts explicitly, retain compatibility validators, quarantine unverifiable authority, and migrate with bounded cursors.
- Test coverage: Extensive unit and Convex runtime tests exist under `tests/unit/routing-kernel/` and `tests/unit/convex/`; hosted readback remains a separate proof class.

**Generated Convex API and TanStack route tree:**
- Why fragile: Runtime types and routing depend on generated `convex/_generated/api.d.ts` and `src/routeTree.gen.ts` outputs matching filesystem source.
- Common failures: A new Convex function is absent from generated types, a renamed route is not regenerated, or a helper becomes routable accidentally.
- Files: `convex/_generated/api.d.ts`, `src/routeTree.gen.ts`, `src/routes/`, `tests/imports/route-boundary.test.ts`
- Safe modification: Run the normal Convex and Vite/TanStack generation paths, never hand-author route tree output, and review generated diffs with their source changes.
- Test coverage: `npm run check:convex-codegen`, route-boundary tests, typecheck, and build cover local consistency.

**Notification outbox state transitions:**
- Why fragile: Dispatch, webhook reconciliation, retries, holds, and idempotency update one durable lifecycle.
- Common failures: Duplicate delivery, retry after terminal success, stale webhook regression, or provider error details reaching public readback.
- Files: `src/modules/notification-outbox/internal/commands.ts`, `convex/notificationOutbox.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`
- Safe modification: Preserve monotonic transitions and operation keys, test out-of-order webhooks and exhaustion, and keep provider adapters outside domain transitions.
- Test coverage: Unit and Convex runtime tests exist; live provider behavior is opt-in smoke proof.

## Scaling Limits

**Explicit routing and supply cardinality caps:**
- Current capacity: Eligible routing bindings and agent grants cap at 256; capability contracts cap at 256; structured preparation caps candidate and field sets at 64; root tracing caps leaves at 16; incident reconstruction caps freeze facts at 100.
- Files: `convex/routingKernelBindings.ts`, `convex/routingKernelAgentGrants.ts`, `convex/customerRequestCapabilityContracts.ts`, `convex/routingKernelStructuredPreparation.ts`, `convex/routingKernelTracer.ts`, `convex/routingKernelIncidentControl.ts`
- Limit: Larger networks, complex preparation sets, or long incident histories reach deterministic refusal paths.
- Symptoms at limit: `eligible_binding_limit_exceeded`, `agent_grant_limit_exceeded`, `capability_contract_limit_exceeded`, `root_leaf_limit_exceeded`, or `incident_reconstruction_fact_limit_exceeded`.
- Scaling path: Measure real cardinalities, paginate enumeration, compact projections without deleting source facts, and retain deterministic refusal while expanding capacity.

**Capability supply listing is deliberately bounded:**
- Current capacity: `listEligibleCapabilitySupply` accepts at most the module's `MAX_ELIGIBLE_SUPPLY` and refuses when the requested or returned set exceeds the bound.
- Files: `convex/capabilitySupply.ts`
- Limit: A network with more eligible bindings than one bounded response cannot currently be traversed through this query.
- Symptoms at limit: `limit_invalid` or `eligible_supply_limit_exceeded` rather than a partial result.
- Scaling path: Add stable cursor pagination tied to deterministic ordering and preserve integrity validation for every returned offering/binding.

**Answer rate limiting is process-local where used:**
- Current capacity: Counters are bounded by one server process's memory and lifetime rather than a documented global rate.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/routes/api.answer.turn.ts`
- Limit: Horizontal instances do not share counters and cold starts reset state.
- Symptoms at limit: Inconsistent enforcement across instances or bursts passing during scale-out.
- Scaling path: Move abuse counters to an atomic durable store with TTL and identity-aware keys while preserving `Retry-After` behavior.

## Dependencies at Risk

**Fast-moving framework and deployment stack:**
- Risk: React 19, TypeScript 6, Vite 8, TanStack Start/Router/AI, Convex, and Nitro are version-sensitive; Start and Router use different patch lines and Nitro is nightly.
- Files: `package.json`, `package-lock.json`, `vite.config.ts`
- Impact: SSR, streaming, generated routes, server functions, deployment output, or type inference can regress on upgrades.
- Migration plan: Upgrade one subsystem at a time, pin runtime-critical dependencies, run source gates first, then browser and hosted readback gates.

**Early-version authentication and design packages:**
- Risk: `web-bot-auth` is `0.1.3` and Astryx packages are `0.1.x`, so public APIs may change materially.
- Files: `package.json`, `src/modules/routing-kernel/caller-identity.ts`, `src/components/ae/`, `src/styles/globals.css`
- Impact: Assistant caller authentication or broad UI rendering can regress.
- Migration plan: Keep third-party APIs behind owned boundaries, pin release versions, and preserve conformance and UI-contract tests during upgrades.

**Multiple provider contracts are owned without provider SDKs:**
- Risk: Handwritten Shippo and EasyPost HTTP mappings can drift from provider API versions and error contracts.
- Files: `src/modules/provider-integrations/shipping/server.ts`, `tests/integration/shipping-provider-quote-input.test.ts`
- Impact: Quotes can become unavailable or normalize incorrectly even when local fixtures pass.
- Migration plan: Version provider adapters, monitor upstream changelogs, keep captured redacted contract fixtures, and require a configured provider smoke before hosted readiness claims.

## Missing Critical Features

**Capability-supply provider proof is not yet hosted proof:**
- Problem: Current code and tests establish registration and fixture-backed adapter contracts, but not current live provider credentials, network behavior, or deployed durable readback.
- Current workaround: Deterministic Shippo/EasyPost response fixtures and sandbox registrations prove local normalization and persistence seams.
- Blocks: Claims that production provider supply is currently reachable or reliable.
- Implementation complexity: Medium to high; requires secret custody, provider sandbox/production separation, deployed smoke data, redacted evidence, failure drills, and operational runbooks.

**Global abuse controls for assistant and inquiry entrypoints:**
- Problem: Process-local controls cannot provide consistent distributed enforcement under horizontal scale.
- Current workaround: Local bounded rate limiting, validation, Clerk/Convex auth, and admission gates constrain individual paths.
- Blocks: Defensible global abuse posture at production traffic levels.
- Implementation complexity: Medium; requires atomic durable counters, TTL, trusted identity keys, retry semantics, observability, and privacy review.

**Release evidence does not prove all external outcomes:**
- Problem: The hosted CI job verifies Convex codegen and a revision-bound kernel proof manifest after push, while provider notification, browser accessibility, inquiry support, and shipping provider checks remain separate commands or are not represented as mandatory provider smokes.
- Current workaround: Dedicated Playwright deploy-smoke scripts and local source gates exist.
- Blocks: One-command proof of the complete deployed operating posture.
- Implementation complexity: Medium; external credentials and stable seeded state are required. This must not be reframed as proof of booking, payment, dispatch, or fulfillment.

## Test Coverage Gaps

**Browser and accessibility suites are not part of pull-request source CI:**
- What's not tested: `.github/workflows/kernel-release-gate.yml` invokes `npm run test:release:source`, which does not include `test:e2e` or `test:a11y`.
- Files: `.github/workflows/kernel-release-gate.yml`, `package.json`, `playwright.config.ts`, `tests/e2e/`, `tests/e2e/a11y/`
- Risk: Navigation, hydration, auth redirects, keyboard behavior, and accessible-name regressions can merge despite a green source job.
- Priority: High for user-facing changes.
- Difficulty to test: Browser provisioning and authenticated state add CI time and setup, but commands already exist.

**Pull requests do not run hosted proof:**
- What's not tested: The `hosted-proof` job is explicitly skipped for pull requests and requires production environment secrets after push.
- Files: `.github/workflows/kernel-release-gate.yml`, `tools/release/verify-kernel-proof-manifest.mjs`, `package.json`
- Risk: Source proof can pass while deployment credentials, current Convex state, or revision-bound evidence are unavailable.
- Priority: High before deployment/readiness claims; appropriate to classify separately from local correctness.
- Difficulty to test: Requires protected secrets and a deployed environment tied to a source revision.

**Provider integrations rely primarily on deterministic fixtures:**
- What's not tested: Live Shippo/EasyPost API compatibility, credential validity, rate-limit behavior, response-size behavior, and real provider latency are not proven by the checked-in adapter tests.
- Files: `src/modules/provider-integrations/shipping/server.ts`, `tests/integration/shipping-provider-quote-input.test.ts`
- Risk: Provider API drift or configuration failure appears only after deployment.
- Priority: High before claiming provider availability.
- Difficulty to test: Needs safe provider accounts, secrets, stable test shipments, redaction, and cost/rate-limit controls.

**Performance and concurrency lack executable budgets:**
- What's not tested: Convex scan cardinality, answer-turn latency, provider fan-out latency, bundle size, and concurrent idempotency behavior lack committed pass/fail SLOs.
- Files: `convex/catalog.ts`, `convex/discovery.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/provider-integrations/shipping/server.ts`, `vite.config.ts`
- Risk: Regressions emerge only under realistic data or traffic.
- Priority: Medium now; high before load-sensitive launch.
- Difficulty to test: Requires representative data, hosted telemetry, controlled concurrency, and agreed service objectives.

**The current capability-supply tree has not been proven by this mapping task:**
- What's not tested: Whether all new schema, generated API, authority, seeds, provider adapters, and tests compose under the complete release gate.
- Files: `convex/capabilitySupply.ts`, `src/modules/capability-supply/`, `src/modules/provider-integrations/`, `convex/_generated/api.d.ts`, `package.json`, `tests/unit/capability-supply/`, `tests/integration/capability-supply-registration.test.ts`
- Risk: Missing exports, stale generated files, authority mismatch, or test/source disagreement can remain hidden in a static map.
- Priority: High before integrating the working tree.
- Difficulty to test: Start with focused capability-supply unit/integration/import tests, then codegen, typecheck, and the source release contract; hosted/provider proof remains separate.

---

*Concerns audit: 2026-07-13*
*Update as issues are fixed or new ones are discovered.*
