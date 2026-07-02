# Codebase Concerns

**Analysis Date:** 2026-07-02

## Tech Debt

**Whole-state source materialization:**
- Issue: Several Convex flows load broad table snapshots into memory and then persist broad derived state. `convex/source_state.ts` loads many registry, discovery, owner, abuse, operation, audit, and funnel tables through `loadPhaseOneSourceState`, and `persistPhaseOneSourceState` writes the mapped state back through table-specific upserts.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/protectedActionStore.ts`, `convex/businessActionStore.ts`, `convex/notificationOutbox.ts`
- Impact: Source writes become sensitive to table growth, Convex transaction limits, read/write contention, and accidental full-table scans. Large catalogs, inquiry history, or telemetry volume can make unrelated operations slower or fail under load.
- Fix approach: Replace whole-state loaders with bounded module slices, indexed reads, and append-only events. Keep full-state reconstruction for explicit migrations/admin repair jobs only, and add pagination or cursors anywhere table growth is expected.

**Large mixed-responsibility modules:**
- Issue: Core flows combine admission, validation, source-state hydration, command handling, serialization, readbacks, and provider side effects in very large files.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/businessActionStore.ts`, `convex/notificationOutbox.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/billing/internal/operations.ts`
- Impact: Trust-boundary changes are hard to audit, small updates carry broad regression risk, and review effort is concentrated in files that are already difficult to reason about.
- Fix approach: Split by stable seams: route/API adapter, admission, command, persistence adapter, readback builder, provider adapter, and tests. Keep exported public actions thin and make each internal module own one reason to change.

**Future-phase code imported by active billing routes:**
- Issue: Active owner billing routes import UI/readback code from `src/future-phases/05-paid-activation-money-rails`.
- Files: `src/routes/owner.billing.tsx`, `src/routes/owner.billing.activate.tsx`, `src/routes/owner.billing.cancel.$operationId.tsx`, `src/routes/owner.billing.redirecting.tsx`, `src/routes/owner.billing.return.$operationId.tsx`, `src/future-phases/route-helpers.ts`
- Impact: The boundary between shipped and parked work is blurred. Future money-rail language or dependencies can enter active bundles, and import-contract scans become harder to interpret.
- Fix approach: Move any shipped billing panels, readbacks, and helpers into `src/modules/billing` or `src/components/ae/billing`. Keep `src/future-phases` limited to parked route modules that active routes never import.

**Business-action writes reuse protected-action admission scope:**
- Issue: Business-action browser and webhook writes are admitted under the `protected_action` source-write scope instead of a distinct business-action scope.
- Files: `src/modules/security/source-write-admission.ts`, `src/modules/business-action/business-action.functions.ts`, `convex/businessActions.ts`, `tests/unit/convex/business-actions-runtime.test.ts`
- Impact: Audit logs and rate policy cannot distinguish protected contact follow-up from business-action capability and payment-provider writes. Future policy changes for one surface can accidentally affect the other.
- Fix approach: Add a dedicated `business_action` source-write scope, update browser mutation admission and Stripe webhook admission to sign it, and migrate Convex `requireSourceWrite` checks and tests to the distinct scope.

**Release script names can mislead contributors:**
- Issue: `test:release` includes evaluation, e2e, accessibility, and build, while `test:all` omits `test:eval`, `test:e2e`, `test:a11y`, deploy smoke, and provider smoke scripts.
- Files: `package.json`, `tests/e2e`, `tests/deploy-smoke`, `eval/answer/promptfooconfig.yaml`
- Impact: A contributor can reasonably run `npm run test:all` and believe the full release gate passed even though browser, accessibility, live-like deployment, and provider checks were skipped.
- Fix approach: Rename `test:all` to a narrower name or make it delegate to `test:release`. Document `test:release` as the only local pre-release gate and wire CI to the same command.

## Known Bugs

**Not detected from static mapping:**
- Symptoms: No confirmed reproducible runtime bug was identified during this concerns pass.
- Files: `src`, `convex`, `tests`, `package.json`
- Trigger: Not applicable from the mapped static evidence.
- Workaround: Treat the security, scaling, and fragile-area entries below as active engineering risks even though they are not all confirmed user-facing bugs.

## Security Considerations

**Local E2E auth bypass is compiled into application code:**
- Risk: The Clerk bypass flag is checked inside runtime route and server-function code. Production hard stops exist, but the bypass still depends on environment discipline and can affect non-production preview or staging deployments if enabled.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/claim-owner-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/discovery/discovery.functions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/security/removal-dispute.functions.ts`
- Current mitigation: `src/start.ts` and `src/routes/__root.tsx` throw when the bypass is enabled in production mode.
- Recommendations: Centralize the bypass in one helper that only allows test/local hosts, make server behavior use a server-only env name, and fail closed outside explicit Playwright/local test execution.

**Owner/admin route protection is decentralized:**
- Risk: Owner and admin routes rely on each loader/source function to return denied or empty readbacks instead of a shared route-group guard.
- Files: `src/routes/owner.inquiries.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/owner.billing.tsx`, `src/lib/server/claim-owner-session.ts`, `src/modules/inquiries/inquiry.functions.ts`
- Current mitigation: Server functions and Convex actions perform authorization checks before returning private data.
- Recommendations: Add shared authenticated owner/admin route layouts or `beforeLoad` helpers, keep server-side authorization as the second layer, and require protected routes to opt out explicitly in tests.

**Anonymous funnel event write path can amplify source writes:**
- Risk: The public funnel endpoint accepts JSON, validates shape, and writes through the public source mutation path without a visible route-level auth, source-admission token, or rate limit.
- Files: `src/routes/api.observability.funnel.ts`, `src/modules/observability/funnel.functions.ts`, `convex/observability.ts`, `convex/source_state.ts`
- Current mitigation: Input fields are validated and unknown business records are rejected.
- Recommendations: Add origin/session/IP-aware throttling, consent-aware event dropping, and a bounded append-only telemetry write path that does not reconstruct broad source state for each event.

**Public and webhook routes parse request bodies before app-level size bounds:**
- Risk: Several JSON and text endpoints call `request.json()` or `request.text()` before enforcing explicit application body limits.
- Files: `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`, `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- Current mitigation: Domain schemas and webhook signature checks reject invalid payloads after parsing.
- Recommendations: Enforce `Content-Length` or streaming body caps before parsing, configure platform request-size limits, and mirror domain min/max string constraints at route boundaries.

**Agent tools write path needs continued boundary tests:**
- Risk: `/api/agent/tools` exposes assistant-callable actions, including the qualified inquiry write. The route has schema checks and action boundaries, but write safety depends on action registration and domain admission staying aligned with the AE trust contract.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `tests/integration/agent-tools-api.test.ts`
- Current mitigation: Integration tests cover tool listing, invalid content types, unknown tools, invalid input, and registry read actions.
- Recommendations: Add a successful `inquiry.submit` agent-tools test with source-write admission and assertions that booking, payment, dispatch, or autonomous fulfillment requests are refused.

## Performance Bottlenecks

**Unbounded or high-cardinality Convex reads:**
- Problem: Multiple helpers call `.collect()` or collect broad indexed sets, then filter in memory.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/protectedActionStore.ts`, `convex/businessActionStore.ts`, `convex/notificationOutbox.ts`
- Cause: Source-state reconstruction and upsert helpers favor in-memory state maps over narrow indexed queries.
- Improvement path: Add targeted indexes for every upsert identity, use `.first()`, `.unique()`, `.take()`, or `paginate()` for user-facing paths, and move large repair/reconciliation flows into explicit batch jobs.

**Registry search fallback hydrates and filters catalogs in process:**
- Problem: When search index matches are empty, registry search falls back to scanning published businesses up to a configured cap and filtering hydrated catalog DTOs in memory.
- Files: `convex/registry.ts`
- Cause: `readPublicSearchCatalogs` falls back from `registrySearchDocuments` to `readPublicCatalogsFromPublishedBusinessScan` and then `matchesCatalog`.
- Improvement path: Keep fallback for small catalogs only, surface index-staleness health, and route larger catalogs through search documents, location/service indexes, or a paginated degraded result with clear lower-bound totals.

**Public answer/chat rate limiting is process-local:**
- Problem: Answer and chat turn guards store rate buckets and idempotency keys in module-level maps.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/answer-thread/internal/session-cookie.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`
- Cause: The limiter is scoped to the running process and a resettable anonymous session cookie.
- Improvement path: Move rate limits and idempotency to a durable store, combine session with IP/origin signals, cap concurrent streams, and apply the same enforcement across every deployment instance.

## Fragile Areas

**Qualified inquiry command path:**
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/routes/api.agent.tools.ts`
- Why fragile: This is the only assistant-exposed write and it combines admission, abuse controls, privacy tombstones, owner inbox readbacks, notification intent, and agent-tool boundaries.
- Safe modification: Change through the action definition first, then update route/API adapters, command tests, Convex persistence tests, and copy tests. Never add booking, payment, dispatch, or autonomous fulfillment semantics to this path.
- Test coverage: Keep `tests/integration/agent-tools-api.test.ts`, inquiry unit tests, and copy scans updated with every inquiry behavior change.

**Source-write admission and operation keys:**
- Files: `src/modules/security/source-write-admission.ts`, `convex/sourceWrite.ts`, `convex/businessActions.ts`, `convex/inquiries.ts`, `convex/observability.ts`
- Why fragile: Source writes cross browser routes, webhooks, public telemetry, owner/admin flows, and Convex mutations. Scope reuse or missing admission checks can silently widen write access.
- Safe modification: Add or change scopes in one place, update every `requireSourceWrite` caller, and add tests for denied, expired, replayed, and wrong-scope operation keys.
- Test coverage: Existing unit tests cover several Convex runtime paths, but a scope-specific matrix should be required for every write surface.

**Trust-boundary vocabulary and public copy:**
- Files: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `tests/copy`, `src/routes/developers.discovery.tsx`, `src/lib/ui/status-presentation.ts`
- Why fragile: Public human surfaces must avoid internal architecture terms and overclaims such as booking, dispatch, auto-fulfillment, or unqualified verification. Developer/admin/operator surfaces can legitimately show more internal terms, so scan failures need audience-aware review.
- Safe modification: Route all public copy changes through `PRODUCT.md`, `DESIGN.md`, and `tests/copy`; keep machine/API payload terms out of public human UI unless the audience is explicitly owner/admin/operator.
- Test coverage: Copy scans exist, but new routes should add fixtures that prove audience-specific vocabulary rules.

**Billing and provider integration surface:**
- Files: `src/modules/billing/internal/operations.ts`, `src/routes/api.billing.webhook.ts`, `src/lib/server/billing-provider.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
- Why fragile: Billing, Autumn, Stripe, owner activation, and business actions touch money-related workflows while AE must not imply general booking or fulfillment.
- Safe modification: Keep provider callbacks signature-verified, redact payloads before storage, keep copy boundary-honest, and run provider smoke tests before release.
- Test coverage: Provider smoke scripts exist but are not part of `npm run test:all`.

## Scaling Limits

**Convex transaction and document limits:**
- Current capacity: Bounded only by current catalog, inquiry, audit, notification, and telemetry volume in source-state tables.
- Limit: Broad `.collect()` and full-state persistence can hit Convex execution, read, write, or document-size limits as rows grow.
- Scaling path: Partition source state by module and tenant/business, add pagination, avoid full-table upserts, and keep reconciliation jobs outside user-facing request paths.

**Anonymous AI answer traffic:**
- Current capacity: One process-level limiter keyed by `ae_session` plus route-specific body validation.
- Limit: Multi-instance deployments, cookie resets, and expensive streamed model calls reduce the effectiveness of module-level maps.
- Scaling path: Store rate counters durably, include abuse signals beyond the session cookie, and gate production chat behind explicit rollout controls.

**Registry search fallback:**
- Current capacity: The fallback path is safe while the number of published listings remains below the configured scan and hydration caps.
- Limit: Once published listings exceed the fallback cap, search results become dependent on search-document freshness and can miss relevant listings.
- Scaling path: Treat `registrySearchDocuments` freshness as operational health, expose rebuild tooling, and remove broad fallback from normal search when catalog size grows.

## Dependencies at Risk

**Nitro nightly alias:**
- Risk: The runtime dependency is pinned to a nightly package alias instead of a stable release line.
- Impact: Framework/runtime behavior can change across installs within the semver-like nightly range, producing build or server behavior drift.
- Migration plan: Move `nitro` in `package.json` to a stable release when TanStack Start supports it, and pin exact versions for release candidates.

**Fast-moving TanStack Start and Router surface:**
- Risk: The app depends on TanStack Start route server handlers, route generation, and Clerk integration patterns that are still sensitive to framework changes.
- Impact: Protected-route behavior, server handlers, and generated route tree behavior can regress during upgrades.
- Migration plan: Keep `@tanstack/react-start`, `@tanstack/react-router`, and `@clerk/tanstack-react-start` upgrades isolated, run `npm run test:release`, and include owner/admin auth regression tests.

**External provider smokes are optional commands:**
- Risk: Resend, Novu, Autumn, and Stripe provider smokes exist as separate scripts and are not part of the broad `test:all` command.
- Impact: Provider integration drift can escape ordinary local validation.
- Migration plan: Make provider smokes required in release CI for environments with provider credentials, and keep local no-secret tests for signature and redaction behavior.

## Missing Critical Features

**Durable public rate limiting:**
- Problem: Public answer/chat abuse controls are in memory, while public telemetry lacks a visible route-level limiter.
- Blocks: Reliable abuse control across serverless or multi-instance deployments.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`

**Central owner/admin auth boundary:**
- Problem: Protected route access is enforced by individual loaders and server functions rather than a shared route-group guard.
- Blocks: Simple proof that every owner/admin route fails closed before rendering protected route shells.
- Files: `src/routes/owner.inquiries.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/owner.billing.tsx`, `src/lib/server/claim-owner-session.ts`

**Bounded read models for source-backed workflows:**
- Problem: Registry, inquiry, billing, notification, and observability workflows rely on broad source-state reads in multiple places.
- Blocks: Predictable scaling and clean operational ownership of repair/rebuild jobs.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/notificationOutbox.ts`, `convex/observability.ts`

**Clear release gate contract:**
- Problem: The repository has both `test:release` and `test:all`, with different coverage.
- Blocks: Consistent developer and CI understanding of what must pass before shipping.
- Files: `package.json`, `tests/deploy-smoke`, `tests/e2e`, `eval/answer`

## Test Coverage Gaps

**Agent-tools qualified inquiry success path:**
- What's not tested: A successful `inquiry.submit` invocation through `POST /api/agent/tools` with source-write admission, receipt assertions, and boundary refusals for booking/payment/dispatch language.
- Files: `tests/integration/agent-tools-api.test.ts`, `src/routes/api.agent.tools.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Risk: The only assistant-exposed write can drift from action boundaries or route behavior without a failing integration test.
- Priority: High

**Distributed rate-limit behavior:**
- What's not tested: Multi-instance or durable limiter behavior for answer/chat turns and public telemetry writes.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`
- Risk: Abuse controls pass unit tests but fail under production topology.
- Priority: High

**Owner/admin route-group protection:**
- What's not tested: A route-level invariant that every `/owner` and `/admin` route has a shared guard or a documented exception.
- Files: `src/routes/owner.inquiries.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/owner.billing.tsx`, `tests/imports/route-boundary.test.ts`
- Risk: A new protected route can rely on loader discipline and accidentally render sensitive shell content or call an unguarded source function.
- Priority: Medium

**Future-phase import boundary for active routes:**
- What's not tested: Active `src/routes` modules importing from `src/future-phases` should fail unless a route is explicitly parked.
- Files: `src/routes/owner.billing.tsx`, `src/routes/owner.billing.activate.tsx`, `src/routes/owner.billing.cancel.$operationId.tsx`, `src/routes/owner.billing.redirecting.tsx`, `src/routes/owner.billing.return.$operationId.tsx`, `src/future-phases/route-helpers.ts`
- Risk: Future money-rail code can leak into shipped routes without an obvious review signal.
- Priority: Medium

**Body-size limits on public endpoints:**
- What's not tested: Oversized JSON/text body rejection before parsing for agent tools, answer/chat, funnel telemetry, and webhooks.
- Files: `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`, `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- Risk: App-level validation rejects malformed payloads only after memory and parsing costs have already been paid.
- Priority: Medium

---

*Concerns audit: 2026-07-02*
