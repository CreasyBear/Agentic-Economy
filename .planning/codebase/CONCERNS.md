# Codebase Concerns

**Analysis Date:** 2026-07-03

## Tech Debt

**Whole-state Convex adapters on hot paths:**
- Issue: Source-state adapters load broad table sets into memory before running domain logic. `convex/source_state.ts` loads the phase-one source graph with `collect(db, ...)` across business, catalog, registry, security, discovery, and observability tables. `convex/inquiries.ts` loads inquiry state with full-table collects for businesses, services, capabilities, suppression, threads, messages, notifications, privacy tombstones, audit events, abuse buckets, operation keys, and support records. `convex/billingStore.ts` loads all billing tables for owner/admin slices, then filters in memory.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `convex/security.ts`, `convex/observability.ts`
- Impact: Public inquiry submission, owner inbox reads, billing reads, notification repair, and admin/security readbacks become slower and more conflict-prone as tables grow. Convex optimistic concurrency conflicts and query timeouts become more likely because unrelated rows are read into a single logical operation.
- Fix approach: Replace full source-state loads with index-scoped slices per operation. Keep broad readbacks only for explicitly paginated admin/export functions. Add Convex indexes for owner, business, operation, dispatch, and thread filters; make writes patch exact documents instead of rebuilding broad state.

**Large modules carry too many responsibilities:**
- Issue: Several modules exceed 1,000 lines and mix validation, orchestration, persistence, projection, provider evidence, and presentation-shaping rules. The highest-count files are `convex/inquiries.ts` (2599 lines), `src/modules/protected-action/internal/contact-follow-up.ts` (1801 lines), `src/modules/answer-thread/internal/turn-orchestrator.ts` (1602 lines), `src/modules/inquiries/internal/commands.ts` (1564 lines), `src/modules/discovery/developer-discovery.ts` (1531 lines), `convex/discovery.ts` (1499 lines), `convex/registry.ts` (1484 lines), `convex/businessActionStore.ts` (1377 lines), `convex/notificationOutbox.ts` (1344 lines), and `src/modules/billing/internal/operations.ts` (1341 lines).
- Files: `convex/inquiries.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/discovery/developer-discovery.ts`, `convex/discovery.ts`, `convex/registry.ts`, `convex/businessActionStore.ts`, `convex/notificationOutbox.ts`, `src/modules/billing/internal/operations.ts`
- Impact: Reviews and changes require broad context. Boundary-honest copy rules, admission checks, idempotency, provider evidence, and UI projections can drift because the same file owns too many concerns.
- Fix approach: Split files by domain seam: validators, command handlers, projection/readback builders, store adapters, provider evidence normalization, and route/server-function adapters. Keep public exports narrow through each module's `public.ts` or `*.actions.ts` file.

**Action contract documentation and implementation policy disagree:**
- Issue: `src/modules/common/action.ts` states that one declaration fans out to React UI, HTTP API, agent JSON, and agent-tools surfaces. `src/modules/actions/index.ts` states that registered actions are only explicit public machine-operation contracts and that owner/admin/provider/telemetry flows can remain route-handler or server-function exceptions. Both policies are present in source.
- Files: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`
- Impact: New operations can be routed inconsistently. A contributor may add a public write as a server function only, or may force owner/admin/provider flows into actions despite the registry's exception policy. The AE trust contract depends on clear boundaries between read, qualified inquiry, owner-only actions, and provider-backed operations.
- Fix approach: Update `src/modules/common/action.ts` to match the explicit registry policy. Add a checklist in code comments or tests that says when an operation must become an action and when it must remain an authenticated route/server-function exception.

**Local E2E bypass is duplicated across server and browser code:**
- Issue: The `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` bypass appears in multiple routes and modules, including auth admission, registry, discovery, catalog claims, security disputes, inquiries, protected actions, and business actions. Some browser handlers display success without calling the backend when the bypass is active.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`, `src/routes/owner.inquiries.$threadId.tsx`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/security/removal-dispute.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/discovery/discovery.functions.ts`
- Impact: E2E coverage can pass while the Clerk, Convex, source-write, owner-role, or provider-backed path is broken. The `VITE_` prefix makes a server-sensitive mode look like client configuration even though production guards exist.
- Fix approach: Centralize the bypass behind one server-only helper, keep the browser helper display-only, and require deploy-smoke tests for every source-backed operation that local E2E bypasses. Rename the server-side switch away from `VITE_` where feasible.

**Dead and parked code remains in the active tree:**
- Issue: Lifecycle primitives are exported and tested even though the app's current operational paths do not depend on the lifecycle module. `src/future-phases/` contains parked future route code. The `atmn` dev dependency is present in `package.json` with no source imports found in `src/` or `tests/`.
- Files: `src/modules/lifecycle/public.ts`, `src/modules/lifecycle/internal/reference-vertical.ts`, `tests/unit/lifecycle/lifecycle-descriptor.test.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `src/future-phases/route-helpers.ts`, `package.json`
- Impact: Future agents may treat parked or exploratory code as production architecture. Unused dependencies and retained primitives increase scan noise and dependency maintenance.
- Fix approach: Move future-phase code outside `src/` or mark it with import-boundary tests. Remove `atmn` if no script or source path uses it. Keep lifecycle primitives only if a current feature imports them from production code.

## Known Bugs

**Answer rate limits are process-local:**
- Symptoms: The intended per-session hourly limit can be exceeded when traffic is split across multiple server instances or when the process restarts. The idempotency map also resets on restart.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.answer.ts`, `src/routes/api.chat.ts`, `src/routes/api.answer.follow-up-chips.ts`, `tests/integration/answer-rate-limits.test.ts`
- Trigger: Run answer/chat traffic through more than one instance, deploy/restart between requests, or fan requests across serverless workers. Each instance owns its own arrays and `Map`.
- Workaround: Current tests validate single-process behavior only. Until persistence is added, keep provider limits and deployed ingress throttles conservative.

**Owner inquiry local E2E UI can report success without exercising mutations:**
- Symptoms: In local E2E mode, owner inquiry handlers show success toasts for mark-read, reply, and close paths without calling the server mutations.
- Files: `src/routes/owner.inquiries.$threadId.tsx`, `src/modules/inquiries/inquiry.functions.ts`, `tests/e2e/public-owner-ui.spec.ts`
- Trigger: Set `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` and run owner inquiry E2E flows.
- Workaround: Use unit/integration tests for mutation logic and deploy-smoke coverage for real source-backed paths. Do not treat local E2E success as proof that Convex owner mutations work.

**No deterministic user-facing booking/payment/dispatch bug identified in this pass:**
- Symptoms: Not detected in the scanned source. Public and assistant-facing paths still need to preserve AE's boundary: read, compare, summarize, route to next step, and send only a qualified inquiry when allowed.
- Files: `AGENTS.md`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`, `src/routes/api.agent.tools.ts`
- Trigger: Not applicable.
- Workaround: Keep copy and action summaries aligned with `AGENTS.md`; never imply AE books, charges, dispatches, or auto-fulfills.

## Security Considerations

**Source hashes use 32-bit FNV-style hashes for privacy and evidence fields:**
- Risk: `stableHash` returns short 8-hex-character hashes, and a second redaction hash uses the same 32-bit pattern. These hashes are deterministic, collision-prone, and vulnerable to dictionary attacks for low-entropy values such as emails, phone numbers, short messages, operation identifiers, and provider refs.
- Files: `src/modules/common/stable-hash.ts`, `src/modules/observability/internal/redaction.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/billing/internal/operations.ts`, `src/modules/business-action/internal/business-action.ts`, `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`, `convex/authz.ts`
- Current mitigation: Raw sensitive values are commonly excluded or redacted before storage; some UI copy calls these hashes public-safe readbacks.
- Recommendations: Separate non-security cache/display hashes from privacy or integrity evidence. Use SHA-256 for payload digests and HMAC-SHA256 with a server secret or rotating salt for contact/body/provider-reference hashes. Version the hash format and migrate readbacks gradually.

**Public write route handlers lack centralized rate/origin hardening:**
- Risk: TanStack CSRF middleware is filtered to server functions, while public route handlers build their own source-write/request context. `/api/agent/tools` accepts POST requests and can run write actions when the action policy allows it. The route validates schemas and action boundaries, but no route-local rate limit or origin allowlist is visible.
- Files: `src/start.ts`, `src/routes/api.agent.tools.ts`, `src/lib/server/source-write-admission.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/inquiries/inquiry.actions.ts`, `convex/sourceWriteAdmission.ts`
- Current mitigation: Write actions are admission-gated through `SourceWriteAdmission`; strict input/output schema checks run before tool execution; domain commands still enforce their own boundaries and idempotency.
- Recommendations: Add a shared route-handler guard for public write endpoints. Enforce rate limits, allowed origins where appropriate, request-size limits, and structured audit events before action execution. Keep the human contract clear: this path may submit qualified inquiries only, not bookings, payments, dispatch, or autonomous fulfillment.

**Source-write admissions have nonce fields without replay storage:**
- Risk: `SourceWriteAdmission` includes a nonce and a five-minute freshness window, but verification only checks signature, scope, operation key, correlation ID, and age. There is no nonce replay store in the admission layer.
- Files: `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `src/lib/server/source-write-admission.ts`
- Current mitigation: Many domain operations use operation keys and duplicate detection after admission; signatures are HMAC-SHA256 and compared with constant-work string comparison.
- Recommendations: Add a short-lived nonce replay table or KV bucket for write scopes that are not otherwise idempotent. Document which domains rely on operation-key idempotency so future write scopes do not skip replay protection accidentally.

**Sentry event scrubbing is shallow:**
- Risk: Sentry `beforeSend` drops events only when request URLs contain query keys such as token, secret, password, email, or phone. Event payloads, request headers, breadcrumbs, contexts, exception messages, and replay data are otherwise returned unchanged. Client replay is enabled on error in production.
- Files: `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `src/modules/observability/internal/redaction.ts`, `tests/unit/observability/audit-redaction.test.ts`
- Current mitigation: Internal audit/funnel payloads use key-based redaction, and server/client Sentry DSNs are optional.
- Recommendations: Add recursive Sentry scrubbing with an allowlist for request headers, contexts, breadcrumbs, user fields, and extra data. Disable or mask Replay on inquiry, owner, and admin routes unless privacy masking is tested. Add Sentry-specific redaction tests.

**Client-visible local bypass switch increases configuration risk:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is checked in both client and server code. Production guards throw when enabled, but the variable name makes a privileged testing mode part of the client-facing env namespace.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`
- Current mitigation: Production runtime/build guards reject the bypass in `src/start.ts` and `src/routes/__root.tsx`.
- Recommendations: Use a server-only env var for server admission bypasses, keep a separate client fixture flag for visual-only E2E behavior, and add a build test that fails if privileged server bypass env vars use a public prefix.

## Performance Bottlenecks

**Convex public inquiry and owner inbox operations scan broad tables:**
- Problem: `submitPublicInquiry`, owner inbox reads, owner thread reads, reply/mark/close mutations, export/tombstone paths, and admin inquiry readbacks call `loadInquirySourceState`, which collects many tables before filtering.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/inquiries/inquiry.functions.ts`
- Cause: Domain command code expects an in-memory `InquirySourceState` instead of operation-specific query slices.
- Improvement path: Build indexed loaders for public target admission, one thread, one owner inbox page, and admin reconstruction filters. Persist only changed rows. Keep broad source reconstruction for explicit admin/export jobs.

**Billing and notification stores perform full-table upserts:**
- Problem: `upsertByFields` in billing and notification outbox code collects whole target tables to find one existing row. Billing loaders collect all offer/operation/provider-event/receipt/reconciliation/support rows, then filter by business IDs.
- Files: `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `convex/billing.ts`, `convex/notificationOutbox.ts`
- Cause: Generic in-memory store adapters mirror unit-test state instead of using Convex indexes as the primary persistence model.
- Improvement path: Add unique indexes for upsert keys and use `.withIndex(...).unique()` for every upsert. Split admin list/export reads from owner and webhook operations.

**Registry search has indexed search plus hydration fan-out and fallback scans:**
- Problem: Public registry search reads search documents, then hydrates each business by slug; fallback search scans published businesses. Catalog lookup then performs multiple per-business indexed queries in parallel.
- Files: `convex/registry.ts`, `src/modules/registry/registry.functions.ts`, `tests/unit/registry/registry-fallback.test.ts`, `tests/integration/registry-api.test.ts`
- Cause: The search read model does not contain enough public catalog data to answer common result cards without per-business hydration.
- Improvement path: Store a bounded public search/card projection in `registrySearchDocuments` or a companion table. Reserve full catalog hydration for detail pages and small result sets.

**Answer turn orchestration is large and sync-heavy around finalization:**
- Problem: The answer turn path coordinates search, tool calls, streaming, grounding, harness evidence, persistence, prior-turn reads, and UI work-step events from one orchestrator.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer-thread/internal/answer-turn-safety.ts`
- Cause: Streaming control flow, state projection, and persistence evidence live in the same module boundary.
- Improvement path: Keep `finalizeAnswerTurnSnapshot` as the safety gate and move planning, tool execution, stream emission, and persistence into smaller pipeline stages with contract tests.

## Fragile Areas

**AE trust-boundary vocabulary is enforced by convention and copy tests:**
- Files: `AGENTS.md`, `DESIGN.md`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`, `src/routes/api.agent.tools.ts`, `tests/copy`, `tests/ui-contract/public-registry-copy.test.ts`
- Why fragile: The app must remain boundary-honest: it reads, compares, summarizes, routes to next step, and sends qualified inquiries when allowed. New public copy or action summaries can accidentally imply booking, charging, dispatch, auto-fulfillment, or overclaim "verified" status.
- Safe modification: Read `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` before changing public copy or action summaries. Keep internal architecture terms out of public human surfaces and keep action `boundaries` explicit.
- Test coverage: Copy and UI-contract tests exist, but every new route/action needs explicit assertions for public wording and agent/action boundaries.

**Source-write admission spans route handlers, server functions, harness policy, and Convex:**
- Files: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/harness/action-tool.ts`, `convex/sourceWriteAdmission.ts`, `tests/helpers/source-write-admission.ts`
- Why fragile: The route/server layer signs request context, the harness/action layer declares write policy, and Convex verifies admission. Small changes to scope, operation key, correlation ID, origin, or pathname handling can block legitimate writes or admit the wrong write scope.
- Safe modification: Add tests at every boundary when adding a new write scope: admission creation, harness declaration, Convex rejection, duplicate/idempotency handling, and public error mapping.
- Test coverage: Helper coverage exists in `tests/helpers/source-write-admission.ts`, and domain tests use source-write fixtures, but there is no single matrix test for every `SourceWriteAdmissionScopeValues` entry.

**Local fixture paths and real source paths diverge:**
- Files: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/discovery/discovery.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `tests/unit/server/source-readback-truth.test.ts`, `tests/unit/server/server-seams.test.ts`, `tests/unit/server/protected-action-server-seams.test.ts`
- Why fragile: Local E2E fixtures are valuable for UI confidence but bypass real Clerk, Convex, provider, and source-write behavior.
- Safe modification: Keep fixture constructors close to the functions they bypass, require tests that prove non-bypass paths do not return fixture IDs, and add deploy-smoke coverage before relying on a source-backed workflow.
- Test coverage: Unit seam tests exist; the bypass list is broad enough that new bypasses should require an explicit test update.

**Generated route tree is committed and large:**
- Files: `src/routeTree.gen.ts`, `tests/scripts/assert-graph-fresh.ts`
- Why fragile: Generated code has many casts and 1,661 lines. Manual edits or stale generation can break routing in ways that are noisy to review.
- Safe modification: Regenerate through the TanStack toolchain and keep manual edits out of `src/routeTree.gen.ts`.
- Test coverage: Graph freshness tests exist; route generation still needs to be part of release verification.

**Provider evidence and receipt reconstruction span many domains:**
- Files: `src/modules/business-action/internal/business-action.ts`, `src/modules/billing/internal/operations.ts`, `src/lib/server/billing-provider.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
- Why fragile: Provider event hashes, redacted payloads, receipt hashes, support records, and owner/admin readbacks must agree without exposing raw provider secrets or implying AE handles payment beyond the explicitly modeled provider-backed flow.
- Safe modification: Change evidence schemas with receipt-verifier tests, deploy-smoke provider tests, and UI copy tests. Keep private endpoint refs and raw provider payloads out of owner/public readbacks.
- Test coverage: Unit and deploy-smoke tests exist, but hash strength and Sentry/event redaction are not covered enough.

## Scaling Limits

**Answer/chat abuse controls scale only to one process:**
- Current capacity: `src/modules/answer-thread/internal/turn-guard.ts` enforces 30 answer turns per hour, 30 answer streams per hour, 60 follow-up chip requests per hour, and 25 turns per thread per process.
- Limit: Multiple processes multiply the effective limit; restarts reset buckets and idempotency claims.
- Scaling path: Store answer abuse buckets and turn idempotency in Convex or an edge KV store keyed by session, IP/risk signal, route, and provider-cost class.

**Source-state reads scale with table size rather than request size:**
- Current capacity: Broad `collect(db, ...)` calls in `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, and `convex/notificationOutbox.ts` work for small fixture/catalog sizes.
- Limit: Query cost and conflict rate grow with total rows, not the one owner, thread, business, or operation requested.
- Scaling path: Add operation-specific indexes and paginated read models. Use broad reconstruction only for admin/export paths with explicit limits.

**Registry search hydration is bounded but still N-plus-one shaped:**
- Current capacity: `convex/registry.ts` bounds search-document candidates and hydration count, then runs per-business catalog lookups.
- Limit: Popular broad queries perform multiple indexed reads per result, and fallback search scans published businesses up to the fallback limit.
- Scaling path: Denormalize search-card fields into the search document, add pagination cursors, and reserve full hydration for detail reads.

**Public write routes rely on domain idempotency rather than an admission-level replay ledger:**
- Current capacity: `SourceWriteAdmission` freshness is five minutes; many domains use operation keys after admission.
- Limit: New write scopes can accidentally rely on admission alone and become replay-sensitive.
- Scaling path: Add a reusable nonce/idempotency ledger per source-write scope and require tests for every write action or route handler.

## Dependencies at Risk

**`nitro` uses a nightly alias:**
- Risk: `package.json` points `nitro` to `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`, which is less predictable than a stable release line.
- Impact: Build/runtime changes can arrive through dependency resolution in ways that are harder to audit.
- Migration plan: Pin an exact known-good nightly with lockfile discipline until a stable compatible version is available, then migrate to the stable package.

**`atmn` appears unused:**
- Risk: `package.json` includes `atmn`, while source/test scans found no imports outside dependency metadata.
- Impact: Unused dependencies add install surface and audit noise.
- Migration plan: Remove `atmn` if no script or skill uses it, then run `npm install` to update the lockfile and `npm run test:all` or the relevant subset.

**Project behavior depends on local skills and generated artifacts:**
- Risk: Local guidance and generated files shape implementation, but they are not all production runtime code. `.agents/skills/submit-qualified-inquiry/` is intentionally present; `.agents/skills/` and `.codex/` are otherwise ignored by git.
- Impact: Future agents can mistake local workflow assets for app architecture or runtime contracts.
- Migration plan: Keep runtime behavior in `src/`, `convex/`, and tests. Keep skill guidance referenced from docs, not imported by app code.

## Missing Critical Features

**Distributed public-abuse controls:**
- Problem: Public answer/chat routes and some route-handler write paths need shared rate limits that survive process restarts and horizontal scale.
- Blocks: Reliable provider-cost control and abuse handling for deployed answer, chat, follow-up chips, and agent-tools traffic.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.answer.ts`, `src/routes/api.chat.ts`, `src/routes/api.agent.tools.ts`

**Cryptographic evidence hashing:**
- Problem: Many receipt, readback, privacy, and provider-evidence fields are named and displayed as hashes, but use short deterministic non-cryptographic hashes.
- Blocks: Strong audit claims, collision-resistant receipts, and safe pseudonymization of low-entropy contact data.
- Files: `src/modules/common/stable-hash.ts`, `src/modules/observability/internal/redaction.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/business-action/internal/business-action.ts`, `src/modules/billing/internal/operations.ts`

**Central public route-handler security wrapper:**
- Problem: Server functions receive CSRF middleware and source-write context through `src/start.ts`; route handlers such as agent tools, answer streaming, billing webhooks, notification dispatch, and provider webhooks each handle their own concerns.
- Blocks: Consistent rate limits, request-size limits, origin policy, structured denial logs, and privacy scrub behavior across public route handlers.
- Files: `src/start.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`

**Index-first Convex persistence model:**
- Problem: Domain modules still depend on in-memory source-state adapters for many operations.
- Blocks: Catalog growth, inquiry growth, owner inbox scale, billing/provider-event scale, and low-conflict writes.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `convex/protectedActionStore.ts`

## Test Coverage Gaps

**Distributed rate-limit behavior:**
- What's not tested: Multi-instance, restart, and serverless fan-out behavior for answer/chat/follow-up rate limits and idempotency claims.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `tests/integration/answer-rate-limits.test.ts`
- Risk: Deployed traffic can exceed intended limits even though integration tests pass.
- Priority: High

**Sentry event and replay redaction:**
- What's not tested: Recursive scrubbing of Sentry event fields, request headers, breadcrumbs, contexts, exception messages, and Replay masking on sensitive routes.
- Files: `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/observability/error-boundary-client.test.tsx`
- Risk: Inquiry content, owner context, contact details, provider refs, or auth headers can leak to observability vendors.
- Priority: High

**Cryptographic hash properties and migration:**
- What's not tested: Collision resistance, dictionary resistance, HMAC salt/secret handling, and version compatibility for evidence/contact/body hashes.
- Files: `src/modules/common/stable-hash.ts`, `src/modules/observability/internal/redaction.ts`, `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/business-action/evidence-receipt-verifier.test.ts`
- Risk: Short hashes can be treated as stronger privacy or integrity evidence than they provide.
- Priority: High

**Action registry policy drift:**
- What's not tested: A matrix asserting which operations are registered actions, which actions surface in agent tools, and which owner/admin/provider operations intentionally remain server-function or route-handler exceptions.
- Files: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`, `tests/unit/actions/registry.test.ts`, `tests/integration/agent-tools-api.test.ts`
- Risk: Future actions can expose writes too broadly or omit assistant-facing boundaries.
- Priority: Medium

**Source-write admission scope matrix:**
- What's not tested: Every `SourceWriteAdmissionScopeValues` entry across creation, route/server context, Convex verification, replay/idempotency, and public error mapping.
- Files: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `tests/helpers/source-write-admission.ts`
- Risk: A new write scope can compile while missing a policy declaration, nonce replay protection, or rejection test.
- Priority: Medium

**Convex scan budgets and index requirements:**
- What's not tested: Query count, `collect(db, ...)` usage, pagination behavior, and operation-specific indexes for large inquiry, billing, notification, registry, and security/admin datasets.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `convex/registry.ts`, `tests/unit/convex/source-state.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`, `tests/unit/convex/registry-runtime.test.ts`
- Risk: Tests pass on small fixtures while production-size tables time out or conflict.
- Priority: High

**Local E2E bypass parity:**
- What's not tested: A complete inventory asserting that every local E2E bypass has a matching real-source unit/integration/deploy-smoke test.
- Files: `src/routes/owner.inquiries.$threadId.tsx`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/security/removal-dispute.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `tests/unit/server/source-readback-truth.test.ts`, `tests/unit/server/server-seams.test.ts`
- Risk: UI tests pass against fixtures while real source paths regress.
- Priority: Medium

---

*Concerns audit: 2026-07-03*
