# Codebase Concerns

**Analysis Date:** 2026-07-03

## Tech Debt

**Launch evidence is stronger in source/local checks than in deployed provider checks:**
- Issue: Core product claims for qualified inquiries, provider notification delivery, discovery artifacts, billing activation, and business-action receipts rely on local/source proof while deployed provider smokes remain explicitly open.
- Files: `.planning/STATE.md`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md`, `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.
- Impact: Marketing, launch, and integration work can accidentally claim operational capabilities that do not yet have deployed evidence. This directly risks violating the AE trust contract in `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md`.
- Fix approach: Keep deploy-smoke failures fail-loud, configure deployed source state and provider secrets, run the required smoke commands, and attach non-secret evidence artifacts before any public launch or provider claim.

**Astryx migration coexists with a large bespoke presentation layer:**
- Issue: `DESIGN.md` requires Astryx-first UI primitives, but public and owner routes still depend heavily on `src/components/ae/*`, `src/components/ui/*`, and `src/styles/legacy.css`.
- Files: `DESIGN.md`, `src/components/ae`, `src/components/ui`, `src/styles/legacy.css`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/owner/inquiries.tsx`, `src/routes/owner/admin.tsx`.
- Impact: New UI work can drift back into bespoke AE presentation patterns, duplicate Astryx behavior, and increase visual regression risk across human surfaces.
- Fix approach: Use Astryx primitives from `@astryxdesign/core` and `@astryxdesign/theme-neutral` for new UI. Re-skin existing `Ae*` components only when required by a focused phase, and keep Tailwind utilities to layout glue.

**Large cross-cutting modules concentrate unrelated responsibilities:**
- Issue: Several modules are large enough to hide business rules, test seams, storage writes, provider boundaries, and UI orchestration in one file.
- Files: `convex/inquiries.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/discovery/developer-discovery.ts`, `convex/discovery.ts`, `convex/registry.ts`, `convex/businessActionStore.ts`.
- Impact: Changes in these files have a broad blast radius and are hard to review for trust-language, auth, source-state, and provider-side effects.
- Fix approach: Extract by responsibility only when touching the code for a product change: pure normalization, admission checks, persistence, provider dispatch, and readback formatting should live in separate internal modules with focused tests.

**Generic source-state persistence hides table-specific invariants:**
- Issue: `convex/source_state.ts` materializes and persists many tables through generic specs, and scoped upserts fall back to full-table collection when no indexed lookup is registered.
- Files: `convex/source_state.ts`, `convex/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts`.
- Impact: Adding a source-owned table without a matching lookup/index silently creates scale and correctness risks. A missing lookup can turn a targeted upsert into an in-memory scan.
- Fix approach: Require every source-state table spec to declare an indexed lookup before it ships, and add a source-state unit test that fails when a persisted table lacks an index-backed lookup path.

## Known Bugs

**Phase 2 deployed support and notification smokes are blocked:**
- Symptoms: The deployed blocker record states that the support user path and provider dispatch smokes are not closeout-ready; notification dispatch routes return a missing-outbox-secret failure and the smoke support listing is unavailable.
- Files: `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`.
- Trigger: Run Phase 2 deployed smokes against a real HTTPS deploy without the required support source record, dispatch IDs, and `AE_NOTIFICATION_OUTBOX_SECRET`.
- Workaround: Use source/local proof only for development. Do not mark Phase 2 final closeout until deployed support state and Resend/Novu provider evidence pass.

**Phase 3 discovery has local proof but no deployed evidence artifact:**
- Symptoms: The Phase 3 verification file records local/source success and a residual gap for deployed route/readback proof.
- Files: `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md`, `src/routes/llms[.]txt.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/$slug.ucp.ts`, `src/modules/discovery/internal/discovery-files.ts`.
- Trigger: External assistant or launch review requires deployed proof for `/llms.txt`, schema, UCP, and readback artifacts.
- Workaround: Treat Phase 3 as locally verified only until deployed artifact captures are attached.

**Phase 5 and Phase 6 production provider proof is not executable by default:**
- Symptoms: The paid activation and business-action Stripe smokes require deployed env, source-owned operation IDs, and provider readbacks; the verification record labels production execution as not complete.
- Files: `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/modules/business-action/business-action.functions.ts`.
- Trigger: Run provider smokes without `DEPLOY_BASE_URL`, source-owned billing/action operation IDs, and Stripe webhook evidence configured.
- Workaround: Keep copy and launch surfaces limited to source/local claims until deployed provider smokes pass.

## Security Considerations

**Auth authority is keyed to Clerk subject identifiers:**
- Risk: Convex auth guidance recommends `identity.tokenIdentifier` for stable provider-scoped identity, while current authority code maps `identity.subject` into `clerkUserId`.
- Files: `convex/_generated/ai/guidelines.md`, `convex/auth.config.ts`, `convex/authz.ts`, `tests/unit/convex/authz.test.ts`, `src/modules/security/public.ts`, `src/modules/security/internal/admin-authority.ts`.
- Current mitigation: `convex/auth.config.ts` pins a Clerk issuer, tests verify browser-supplied authority is ignored, and admin membership checks require active server-side records.
- Recommendations: Canonicalize identity storage before adding auth providers or changing Clerk issuer behavior. Store and compare `tokenIdentifier` or a documented issuer+subject tuple, and migrate owner/admin membership tests with the schema change.

**The quiet agent door exposes the only assistant-write boundary:**
- Risk: `POST /api/agent/tools` allows writes so `inquiry.submit` can send qualified inquiries. Any action incorrectly registered with `surfaces: ["agentTools"]` becomes callable through this route.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/answer-thread/internal/tool-runner.ts`.
- Current mitigation: Action schemas are validated, boundaries live on the action definitions, the answer-thread runner rejects non-read tools, and owner-only inquiry actions are not registered for `agentTools`.
- Recommendations: Add a registration test that snapshots all `agentTools` actions, asserts only `registry.search`, `registry.detail`, and `inquiry.submit` expose that surface, and requires explicit boundary tests for any future write action.

**App-wide browser security headers are not codified in the route layer:**
- Risk: Public routes render React HTML without an app-level Content Security Policy, frame policy, referrer policy, or permissions policy visible in the repository. JSON endpoints set `nosniff` in places, but page-level protections appear to rely on deployment configuration outside the checked source.
- Files: `src/routes/__root.tsx`, `src/start.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`.
- Current mitigation: Sensitive provider endpoints use bearer/HMAC checks and `Cache-Control: no-store`; discovery JSON endpoints set content type and `X-Content-Type-Options`.
- Recommendations: Define security headers in the deployment layer or server middleware, add a deployed smoke that asserts CSP, `X-Frame-Options` or `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, and `X-Content-Type-Options` on HTML and JSON routes.

**Local E2E auth and source-state bypasses are spread across product modules:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` and local source-state paths bypass normal auth/provider flow in several modules. A production misconfiguration would be severe.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/claim-owner-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`.
- Current mitigation: `src/start.ts` and `src/routes/__root.tsx` throw in production when the Clerk bypass flag is enabled.
- Recommendations: Keep production fail-fast guards mandatory, add a unit test for both server and root-route bypass guards, and avoid adding new bypass flags outside a single internal test-environment helper.

**Secret-bearing environment files are present in the workspace:**
- Risk: `.env`, `.env.local`, and `.env.example` exist. Real secret values must never be read into codebase maps, logs, tests, or committed evidence artifacts.
- Files: `.env`, `.env.local`, `.env.example`, `AGENTS.md`, `.codex/agents/gsd-codebase-mapper.md`.
- Current mitigation: The mapper instructions forbid reading or quoting secret files, and smoke tests assert redacted provider responses.
- Recommendations: Keep evidence artifacts to env var names, receipt IDs, and redacted payloads only. Add secret scanning to CI before publishing deploy-smoke artifacts.

## Performance Bottlenecks

**Source-state loading collects many tables in one transaction path:**
- Problem: `loadPhaseOneSourceState` collects a broad set of source tables concurrently, including registry, inquiry, support, discovery, billing, notification, protected-action, and rollout state.
- Files: `convex/source_state.ts`, `convex/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/business-action/internal/schema.ts`.
- Cause: The source-state loader is optimized for small source-owned proof sets and administrative readback, not high-cardinality runtime reads.
- Improvement path: Split source-state reads by bounded use case, add limits and pagination for admin/debug surfaces, and keep public runtime routes on indexed read models instead of full source-state snapshots.

**Several Convex upsert helpers fall back to collect-and-find:**
- Problem: Generic `upsert` helpers collect a table and then search in memory when a table-specific index lookup is absent.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/notificationOutbox.ts`.
- Cause: Generic persistence helpers support many table specs without enforcing an index contract.
- Improvement path: Replace fallback collection with required `withIndex` lookups. If a table cannot define a stable lookup, require a bounded migration helper rather than using production upsert paths.

**Registry search has bounded fallback scans and per-business fan-out:**
- Problem: `convex/registry.ts` uses a full-text search index when available, then falls back to scanning published businesses up to a limit and fetching related documents per business.
- Files: `convex/registry.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/registry/registry.functions.ts`, `src/routes/api.businesses.search.ts`, `src/routes/registry.tsx`.
- Cause: Catalog search and projection hydration combine indexed search with fallback matching and related-table reads.
- Improvement path: Keep full-text search documents fresh, add production metrics for fallback usage, and denormalize public search card fields into a read model when catalog size grows.

**Admin billing and notification views can read broad slices:**
- Problem: Billing store admin reads collect all operations/offers, and notification/provider state uses broad source-state reads for evidence and dispatch records.
- Files: `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `src/modules/billing/internal/schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/routes/owner/admin.tsx`.
- Cause: Admin and proof surfaces favor complete readbacks over paginated operational views.
- Improvement path: Introduce cursor pagination, owner/business filters, and summary counters before increasing volume beyond alpha proof data.

## Fragile Areas

**Deploy-smoke configuration is a hard launch gate:**
- Files: `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`.
- Why fragile: Smokes depend on deployed HTTPS origin, source-owned IDs, provider secrets, and redacted provider readbacks. A missing env var can look like a product failure unless evidence is interpreted carefully.
- Safe modification: Keep required env validation explicit, keep localhost rejection, and document every new smoke env var in the relevant blocker/verification file.
- Test coverage: The smoke tests exist and are intentionally fail-loud; the current gap is green deployed execution evidence.

**Action registration is the shared contract for UI, APIs, agents, and answer tools:**
- Files: `src/modules/actions/index.ts`, `src/modules/actions/action-types.ts`, `src/routes/api.agent.tools.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`.
- Why fragile: A single action definition controls human UI metadata, API schema, agent JSON payloads, and quiet agent-tool availability.
- Safe modification: Add new operations as actions only when the action includes schema, summary, boundaries, surfaces, and write/read kind. Keep owner-only actions out of `agentTools`.
- Test coverage: Add snapshot tests for registered action IDs, surfaces, and write permissions.

**Canonical public URLs are derived in several places from request origin:**
- Files: `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/$slug.tsx`, `src/modules/discovery/internal/discovery-files.ts`.
- Why fragile: Public assistant artifacts, SEO metadata, sitemap URLs, UCP payloads, and discovery schema links can emit inconsistent hosts if proxy forwarding or request origin differs from the canonical deployment URL.
- Safe modification: Centralize canonical base URL resolution behind a server helper backed by a deployment env var and host allowlist. Use request origin only as a validated fallback.
- Test coverage: Add route tests for canonical URL output under forwarded-host and explicit canonical-base scenarios.

**Provider dispatch routes combine admission, readback, provider send, and persistence:**
- Files: `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`.
- Why fragile: These routes must preserve source-write admission, provider-specific validation, redaction, no-store headers, and receipt persistence in the same request path.
- Safe modification: Keep provider request construction pure and separately tested, keep raw provider payloads out of route responses, and require tests for missing secret, bad auth, provider failure, and successful redacted readback.
- Test coverage: Deploy smokes cover happy-path provider proof when configured; unit tests should cover route-level failure branches without external providers.

**Answer/chat runtime depends on external model configuration and strict tool boundaries:**
- Files: `src/routes/api.chat.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `src/modules/model-provider`.
- Why fragile: The answer runner touches model selection, tool execution, source-owned readbacks, and thread storage. Product copy must not imply booking, payment, dispatch, or autonomous fulfillment.
- Safe modification: Keep write tools disabled inside answer turns, keep public answer copy boundary-honest, and gate production chat behavior behind explicit env and evaluation proof.
- Test coverage: Maintain prompt-injection and boundary tests, and add regression tests for any new model tool or answer surface.

## Scaling Limits

**Source-state and proof-store tables are alpha-scale unless paginated:**
- Current capacity: Source-state readbacks work for small owner/business/proof sets.
- Limit: Convex transactions and document-size limits are stressed by broad `collect()` calls, large readback payloads, and all-at-once proof materialization.
- Scaling path: Use index-backed paging for `convex/source_state.ts`, split high-cardinality evidence tables from canonical source state, and store large provider payloads externally or as redacted summaries.

**Inquiry and notification history can grow faster than owner UI ergonomics:**
- Current capacity: Owner inbox and notification outbox flows have indexes and cleanup paths, but admin/support proof reads still favor complete slices.
- Limit: Large inquiry volumes can make owner/admin pages slow if views hydrate entire threads, dispatch attempts, and provider records.
- Scaling path: Keep owner inbox queries cursor-based, retain notification cleanup scheduling, and add archive windows for closed inquiries and delivered dispatch attempts.

**Registry search fallback is bounded but not a permanent catalog strategy:**
- Current capacity: Full-text search documents and fallback scans support a small published catalog.
- Limit: In-memory matching and per-business hydration become expensive as public listings and services grow.
- Scaling path: Treat `registrySearchDocuments` as the required read model for public search, monitor fallback usage, and move sortable/filterable facets into indexed fields.

**Answer-thread storage can accumulate high-volume run evidence:**
- Current capacity: Thread, turn, tool-call, run, and evaluation records support current answer development and proof capture.
- Limit: Long conversations and evaluation loops can create large table growth and high readback costs.
- Scaling path: Add retention rules for development runs, summarize older turns, and keep model/provider raw data out of persistent public readbacks.

## Dependencies at Risk

**Pre-1.0 design-system dependency drives active UI migration:**
- Risk: `@astryxdesign/core` and `@astryxdesign/theme-neutral` are `0.1.x` dependencies, while AE's design authority requires Astryx-first UI.
- Impact: API churn in Astryx can affect routes and components during migration.
- Migration plan: Wrap only project-specific composition, avoid duplicating Astryx primitives, and upgrade Astryx in small UI-focused phases with screenshot coverage.

**TanStack Start and Nitro versions require framework-aware changes:**
- Risk: The app relies on TanStack Start, TanStack Router, Vite, Nitro, React 19, and generated route trees.
- Impact: Route handlers, server functions, middleware, and generated route files can change behavior across upgrades.
- Migration plan: Keep framework changes isolated, regenerate `src/routeTree.gen.ts` through the existing toolchain, and run route/API tests after dependency updates.

**Provider integrations block launch proof when credentials or source IDs drift:**
- Risk: Clerk, Convex, Resend, Novu, Autumn, Stripe, OpenRouter, Sentry, and PostHog each require correct env configuration or source-owned identifiers.
- Impact: A missing provider env var can turn a trustworthy fail-loud proof route into a launch blocker.
- Migration plan: Maintain a non-secret deployment checklist using env var names only, keep provider smoke tests redacted, and separate source-local proof from external-provider proof in planning docs.

**Generated and provider-owned files should stay out of manual edits:**
- Risk: Generated route and Convex files can be accidentally edited during refactors.
- Impact: Manual changes can be overwritten or desynchronize route/schema contracts.
- Migration plan: Do not hand-edit `src/routeTree.gen.ts` or `convex/_generated/*`; update source routes/schema/functions and regenerate through the project scripts.

## Missing Critical Features

**Five friendly-owner activation proof remains incomplete:**
- Problem: The current state document records zero of five real friendly-owner activation packets captured.
- Blocks: Internal alpha and public launch claims that depend on real owner activation evidence.
- Files: `.planning/STATE.md`, `PRODUCT.md`, `src/routes/owner/admin.tsx`, `src/modules/owner`, `src/modules/business`.

**Phase 2 final closeout lacks deployed user-path and provider proof:**
- Problem: Qualified-inquiry delivery cannot be treated as deploy-proven until support route, Resend dispatch, and Novu dispatch smokes pass with source-owned IDs.
- Blocks: Public claims that AE can send and track qualified inquiries in deployed provider environments.
- Files: `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`.

**Phase 3 external-assistant discovery lacks deployed proof artifacts:**
- Problem: Local discovery evidence exists, but deployed `/llms.txt`, schema, and UCP readback proof is not recorded as closeout evidence.
- Blocks: External assistant readiness claims beyond source/local verification.
- Files: `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md`, `src/routes/llms[.]txt.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/$slug.ucp.ts`, `src/modules/discovery/internal/discovery-files.ts`.

**Phase 5 and Phase 6 production money/action proof remains open:**
- Problem: Autumn/Stripe paid activation and Stripe business-action receipt smokes are not deploy-proven with provider readbacks.
- Blocks: Any claim that paid activation or business-action receipts are production-executable.
- Files: `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/modules/business-action/business-action.functions.ts`.

**Security header policy is not represented as source-owned proof:**
- Problem: The repository does not expose a source-owned app-wide security header policy or a smoke that verifies deployed headers.
- Blocks: High-confidence public-surface hardening claims.
- Files: `src/routes/__root.tsx`, `src/start.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/api.agent.tools.ts`, `tests/deploy-smoke`.

## Test Coverage Gaps

**Deploy smokes exist but green deployed evidence is missing:**
- What's not tested: Current deployed support, Resend, Novu, discovery, Autumn/Stripe, and business-action provider paths are not recorded as passing.
- Files: `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `.planning/STATE.md`.
- Risk: Source/local success can be mistaken for deployed production readiness.
- Priority: High.

**Action-surface registration needs snapshot coverage:**
- What's not tested: A dedicated test should lock down which actions expose `agentTools`, which are writes, and which are owner-only.
- Files: `src/modules/actions/index.ts`, `src/modules/actions/action-types.ts`, `src/routes/api.agent.tools.ts`, `src/modules/answer-thread/internal/tool-runner.ts`.
- Risk: A future action could become assistant-callable without explicit trust-boundary review.
- Priority: High.

**Source-state index coverage needs an automated guard:**
- What's not tested: Every table persisted by source-state helpers should have a table-specific index lookup and should not fall back to full-table collection.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `convex/schema.ts`.
- Risk: New source-owned evidence tables can create silent performance cliffs.
- Priority: High.

**Security header behavior needs route and deploy coverage:**
- What's not tested: HTML and JSON routes do not have a visible test that asserts CSP, frame policy, referrer policy, permissions policy, and nosniff behavior.
- Files: `src/routes/__root.tsx`, `src/start.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/api.agent.tools.ts`, `tests/deploy-smoke`.
- Risk: Public pages and assistant-readable JSON can ship without consistent browser hardening.
- Priority: Medium.

**Auth identity migration risk lacks provider-variant tests:**
- What's not tested: Admin/owner authority tests cover Clerk subject behavior but do not cover issuer/provider changes or `tokenIdentifier`-based canonical IDs.
- Files: `convex/authz.ts`, `tests/unit/convex/authz.test.ts`, `src/modules/security/public.ts`, `src/modules/security/internal/admin-authority.ts`.
- Risk: Future auth-provider changes can orphan admin memberships or weaken authority checks.
- Priority: Medium.

**Astryx migration needs visual and contract regression coverage:**
- What's not tested: Public and owner surfaces using `src/components/ae/*` do not have comprehensive visual regression coverage against the Astryx-era design authority.
- Files: `DESIGN.md`, `src/components/ae`, `src/components/ui`, `src/styles/legacy.css`, `src/routes/registry.tsx`, `src/routes/owner/inquiries.tsx`, `src/routes/owner/admin.tsx`.
- Risk: UI migration can reintroduce Daylight-era styling, bespoke components, or trust-copy regressions.
- Priority: Medium.

---

*Concerns audit: 2026-07-03*
