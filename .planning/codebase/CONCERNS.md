---
analysis_date: 2026-07-03
---

# Codebase Concerns

**Analysis Date:** 2026-07-03

## Tech Debt

**Debt is not marked in code comments:**
- Issue: No `TODO`, `FIXME`, `HACK`, or `XXX` markers are present in the searched runtime/test roots; the active backlog is encoded in large modules, guardrail tests, and planning docs rather than inline comments.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `convex/inquiries.ts`, `src/lib/ui/contract-scans.ts`, `tests/ui-contract/class-scan.test.ts`
- Impact: Marker sweeps can report a clean repo while real concerns remain in source seams, overclaim scanners, and oversized workflow files.
- Fix approach: Treat `CONCERNS.md`, guardrail tests, and large-file reviews as the debt ledger. Add explicit issue links or targeted comments only where a maintainer needs local context to avoid unsafe edits.

**Reference `src/app/*` subtree is compiled but not routed:**
- Issue: The TanStack route layer is `src/routes/*`, but `src/app/ai-chat/page.tsx`, `src/app/ai-chat-landing/page.tsx`, and `src/app/library/page.tsx` remain under `src/` and are included by `tsconfig.json`. They contain template/demo UI and auth-example copy that is not part of the live route tree.
- Files: `src/app/ai-chat/page.tsx`, `src/app/ai-chat-landing/page.tsx`, `src/app/library/page.tsx`, `src/routeTree.gen.ts`, `tsconfig.json`
- Impact: Typecheck and scan noise can come from non-routed reference pages. Demo copy such as JWT-refresh examples in `src/app/ai-chat/page.tsx` can confuse future agents about product scope and live authentication behavior.
- Fix approach: Move reference pages outside `src/`, convert useful pieces into routed AE components, or delete the subtree after extracting any Astryx patterns still in active use.

**Large workflow modules concentrate too many concerns:**
- Issue: Several files exceed 1,000 lines and mix validators, source reads, write commands, projections, and UI orchestration.
- Files: `convex/inquiries.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/discovery/developer-discovery.ts`, `convex/discovery.ts`, `convex/registry.ts`, `convex/businessActionStore.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `convex/notificationOutbox.ts`, `src/modules/billing/internal/operations.ts`, `src/styles/answer/panel.css`, `src/styles/answer/thread.css`
- Impact: Small behavior changes carry wide blast radius, code review has to reason across unrelated invariants, and failure-mode tests become hard to target.
- Fix approach: Split only along proved seams: validators, source queries, pure state transitions, route adapters, projections, provider adapters, and readback views. Move behavior with focused tests before removing the original branch.

**Answer harness is present but not the only execution spine:**
- Issue: `streamAnswerTurn()` owns routing, tool execution, safety, persistence, SSE events, and harness reporting. The live harness operation wraps phases, but final persistence still builds the frozen answer row first and then appends harness-session journal entries after a successful write.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/answer-thread/internal/answer-harness-operation.ts`, `src/modules/harness/run-loop.ts`, `src/modules/harness/harness.functions.ts`, `convex/harnessSessions.ts`
- Impact: Harness evidence is useful, but answer execution still has two places to understand: the answer orchestrator and the generic harness primitives. A persistence failure returns only `{ ok: false }`, so private root-cause detail is lost before admin review.
- Fix approach: Keep the current post-persist journal path stable, then move one phase at a time behind `runHarnessRunLoop()` with structured persistence errors and explicit admin diagnostics.

**Public status metadata can still leak overclaim wording:**
- Issue: `registry_verified` is public metadata with `label: 'Registry verified'` and `compactLabel: 'Verified'`; `AeStatusBadge` overrides only the badge label to `Checked` for public audience.
- Files: `src/lib/ui/status-presentation.ts`, `src/components/ae/status/AeStatusBadge.tsx`, `src/lib/ui/provider-presentation.ts`, `tests/ui-contract/status-copy.test.ts`, `tests/ui-contract/public-language-copy.test.ts`
- Impact: A caller using `getStatusPresentation()` directly can show `Verified` on a public surface even though AE does not have a named public verification standard.
- Fix approach: Make the shared public metadata say `Checked`, or split public and operator status presentation types so public code cannot access `Verified` labels.

**Developer discovery artifacts mix route readback with deterministic timestamps:**
- Issue: Discovery schema/examples/fixtures default `now` to `0`, and `loadDeveloperDiscoveryRoute()` passes `now: 0` with `https://ae.example` while building readbacks.
- Files: `src/routes/api.discovery.schema.ts`, `src/routes/api.discovery.examples.ts`, `src/routes/api.discovery.fixtures.ts`, `src/routes/developers.discovery.tsx`, `src/modules/discovery/developer-discovery.ts`
- Impact: Machine-readable artifacts can report generated/readback times that are deterministic rather than wall-clock current. Operators may mistake deterministic timestamps for real freshness evidence.
- Fix approach: Use deterministic `now` only in tests and fixture paths. Production handlers should pass a current timestamp and canonical origin while keeping route health derived from public endpoints.

**Generated route tree sits inside scanned source:**
- Issue: `src/routeTree.gen.ts` is generated by TanStack Router, uses `@ts-nocheck`, and imports every route including future/advanced surfaces.
- Files: `src/routeTree.gen.ts`, `src/lib/ui/contract-scans.ts`, `tsconfig.json`
- Impact: Manual edits are overwritten, and guardrails need special generated-file exceptions for future route names and Convex-generated imports.
- Fix approach: Never edit `src/routeTree.gen.ts` directly. Regenerate it from route files and keep scanner exceptions narrow to generated references that source routes actually own.

## Known Bugs

**Admin run viewer has no production source port:**
- Symptoms: `/admin/runs` returns an allowed zero-row scaffold with `actorRef: 'admin-run-viewer-source-disabled'`; `/admin/runs/$turnId` returns a `not_found` result with disabled-source copy.
- Files: `src/modules/harness/run-viewer.functions.ts`, `src/routes/admin.runs.tsx`, `src/routes/admin.runs.$turnId.tsx`, `src/components/ae/harness/AeHarnessRunViewer.tsx`, `tests/unit/harness/run-viewer-functions.test.ts`
- Trigger: Load the run viewer without installing a `HarnessRunViewerSourcePort` test seam.
- Workaround: Treat the viewer as a scaffold until an admin-authorized source port reads answer turns and harness sessions from Convex.

**Legacy stateless answer endpoint is intentionally unavailable:**
- Symptoms: `GET /api/answer` returns `{ kind: 'error', code: 'answer_unavailable', copyId: ... }` with HTTP 503, while the live thread-first flow uses `POST /api/answer/turn`.
- Files: `src/routes/api.answer.ts`, `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/components/ae/chat/AeChat.tsx`
- Trigger: Any client, crawler, or test still calling `GET /api/answer` for generated prose.
- Workaround: Route clients to `POST /api/answer/turn` and keep the legacy endpoint documented as a safe error or remove it once no callers remain.

**Public thread URLs expose saved query text by ID:**
- Symptoms: `GET /api/answer/threads/$threadId` and `/t/$threadId` return public projections without checking the current session; the projection includes `query` for each turn.
- Files: `src/routes/api.answer.threads.$threadId.ts`, `src/routes/t.$threadId.tsx`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/answer-thread/answer-thread.schema.ts`, `convex/answerThreads.ts`
- Trigger: Anyone with a valid thread id opens the API route or thread route.
- Workaround: Treat thread ids as unlisted share links. Do not store private contact details in answer queries; add explicit private/share policy enforcement before accepting sensitive query types.

## Security Considerations

**Answer-thread writes do not use source-write admission:**
- Risk: Public Convex mutations for answer threads accept caller-supplied `pseudonymousSessionId`, thread ids, frozen evidence JSON, and tool-call JSON. Route-level code owns normal access, but the Convex functions do not require `sourceWriteArgs`.
- Files: `convex/answerThreads.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/session-cookie.ts`, `src/modules/security/source-write-admission.ts`
- Current mitigation: `api.answer.turn.ts` issues `HttpOnly; SameSite=Lax` session cookies, validates input with `answerTurnRequestSchema`, rate-limits per session, and checks thread ownership before calling source mutations.
- Recommendations: Add source-write admission to answer-thread mutations or convert server-only writes to internal mutations. Derive session/write authority server-side and keep direct public Convex calls from creating or mutating threads.

**Public observability funnel can update owner activation state:**
- Risk: `/api/observability/funnel` accepts JSON and calls a public Convex mutation when `businessId` is present; the mutation updates `ownerActivationState` without source-write admission or durable abuse limits.
- Files: `src/routes/api.observability.funnel.ts`, `src/modules/observability/funnel.source.ts`, `convex/observability.ts`, `src/modules/observability/public.ts`
- Current mitigation: Zod caps field sizes, `businessId` is required for persistence, and the data is observability/readback state rather than direct commerce authority.
- Recommendations: Keep funnel data non-authoritative for entitlement or public claims. Add source-write admission, durable rate limits, or PostHog-only ingestion before using these rows for operator decisions.

**JSON request body limits are enforced after parsing:**
- Risk: Multiple public POST routes call `request.json()` before any byte cap, so large bodies can allocate memory before Zod or schema validation rejects fields.
- Files: `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.follow-up-chips.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`
- Current mitigation: Content-type checks exist on some routes, and schemas cap parsed fields such as answer query length.
- Recommendations: Add a shared `readBoundedJsonRequest()` helper that checks `Content-Length`, streams with a byte limit where needed, and returns consistent safe errors.

**Quiet agent write door depends on action registration discipline:**
- Risk: `/api/agent/tools` invokes tools with `surface: 'agentTools'` and `allowWrites: true`. Current write exposure is intentionally narrow, but a future action with `agentTools` can gain public machine invocation.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/harness/tool-policy.ts`, `src/modules/common/action.ts`
- Current mitigation: The registry exposes only actions with `agentTools`; current actions are `registry.list`, `registry.search`, `registry.detail`, and `inquiry.submit`, and `inquiry.submit` declares boundaries plus public-inquiry source-write expectations.
- Recommendations: Keep a snapshot test for the exact agent-tool set, require boundaries on every exposed action, and fail any non-read-only action lacking source-write admission declarations.

**Source-write admission is now required for harness sessions but remains env-critical:**
- Risk: `appendHarnessSessionEntry` rejects missing or invalid admissions, and server helpers sign admissions from `AE_SOURCE_WRITE_SECRET`. Missing crypto or missing server secret turns source writes into denied results.
- Files: `convex/harnessSessions.ts`, `src/modules/harness/harness.functions.ts`, `convex/sourceWriteAdmission.ts`, `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`
- Current mitigation: `requireSourceWrite(args, 'harness_session')` gates harness appends; `readRequiredSourceWriteSecret()` rejects a client-exposed `VITE_AE_SOURCE_WRITE_SECRET` name.
- Recommendations: Keep the secret server-only, add deployment readback for admission health, and ensure journal failures surface privately instead of silently disappearing.

**Provider webhooks are evidence, not authority:**
- Risk: Autumn, Resend/Novu, and Stripe evidence paths ingest external payloads that can change billing, notification, or action readbacks if signature verification and source binding are bypassed.
- Files: `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- Current mitigation: Autumn webhook verification uses Svix signature/timestamp checks; Stripe business-action checkout rejects live keys and client authority fields; source modules persist redacted payload hashes and receipts.
- Recommendations: Keep provider payloads redacted, bind every provider object to an AE operation key/correlation id, and require receipt/reconciliation rows before owner or public paid/action success claims.

## Performance Bottlenecks

**Convex source-state and store adapters still use table-wide collection:**
- Problem: Several Convex modules call `.collect()` on whole tables or broad indexed ranges, including generic `collect()` helpers.
- Files: `convex/source_state.ts`, `convex/billingStore.ts`, `convex/protectedActionStore.ts`, `convex/businessActionStore.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/observability.ts`, `convex/billing.ts`
- Cause: Source reconstruction favors simple whole-state loading for parity and pure-domain reuse.
- Improvement path: Replace route-facing reads with bounded indexed source ports and paginated admin projections. Keep whole-state reconstruction for tests, migrations, and explicit maintenance jobs.

**Registry search hydration fans out per business:**
- Problem: Public search hydrates Meili hits by fetching details per unique slug, and Convex registry hydration reads contexts, services, capabilities, suppression, index status, and discovery attempts per business.
- Files: `src/modules/registry/registry.functions.ts`, `src/modules/registry/internal/catalog-search-port.ts`, `convex/registry.ts`, `src/modules/registry/internal/search.ts`
- Cause: The public DTO is assembled from normalized source tables while search results carry only document-level hit data.
- Improvement path: Keep public limits low, prefer `registryProjectionItems` / `registrySearchDocuments` for public list/search, and cache hydrated DTOs by source hash.

**Answer and thread reads use bounded-by-policy but unpaginated turn collections:**
- Problem: `convex/answerThreads.ts` uses `.collect()` for thread turns and tool calls; thread size is capped at 25 turns, but each read loads all turns for replay/projection.
- Files: `convex/answerThreads.ts`, `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/answer-thread/internal/public-projection.ts`, `src/components/ae/chat/AeChat.tsx`
- Cause: Thread-first UX needs replay-stable context and public projections from frozen evidence.
- Improvement path: Preserve the 25-turn cap, add pagination before raising it, and keep large tool traces out of public projections.

**Large CSS files keep answer UI costly to reason about:**
- Problem: Answer/thread CSS spans multiple large files with overlapping panel/thread/chat concerns.
- Files: `src/styles/answer/panel.css`, `src/styles/answer/thread.css`, `src/styles/answer/chat-shell.css`, `src/styles/answer/index.css`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`
- Cause: The answer UI has migrated through multiple visual systems while preserving thread replay and streaming states.
- Improvement path: Collapse repeated selectors into tokenized Astryx-compatible component classes only after visual regression coverage exists for streaming, replay, empty, compare, and boundary profiles.

## Fragile Areas

**Answer-turn persistence hides failure details:**
- Files: `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/routes/api.answer.turn.ts`
- Why fragile: `persistAnswerTurnWithResult()` catches all persistence errors and returns `{ ok: false }`; the stream can emit `answer_turn_persist_failed` without preserving the source error code.
- Safe modification: Return a structured private diagnostic with safe public copy. Log or persist source error codes for admin run viewer use while keeping public SSE generic.
- Test coverage: Current answer-thread tests cover happy-path persistence and harness reports; source failure diagnostics need explicit tests.

**Admin/source route guards are split across beforeLoad and readback branches:**
- Files: `src/lib/operator/route-options.ts`, `src/lib/server/require-operator-session.ts`, `src/routes/admin.runs.tsx`, `src/routes/admin.monetization.tsx`, `src/routes/developers.discovery.tsx`, `src/routes/__root.tsx`
- Why fragile: `operatorRouteOptions` establishes only that someone is signed in. Role/action authorization happens inside each source readback, so a route can look guarded while returning empty/denied data.
- Safe modification: Keep shared sign-in guard lightweight, but every owner/admin/developer route must expose a denied readback state and tests for wrong-role access.
- Test coverage: Admin runtime tests cover membership logic; browser route coverage for every operator surface is uneven.

**Public copy safety relies on target lists:**
- Files: `src/lib/ui/contract-scans.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/ui-contract/public-language-copy.test.ts`, `tests/ui-contract/status-copy.test.ts`, `src/lib/ui/status-presentation.ts`
- Why fragile: Copy scans target selected roots. `public-language-copy.test.ts` omits routes such as `src/routes/about.tsx` and shared metadata such as `src/lib/ui/status-presentation.ts`; `status-copy.test.ts` checks presence of labels but not public-safe wording.
- Safe modification: Add public-safe metadata tests and include every public route/shared presentation source when adding a new public surface.
- Test coverage: Overclaim rules are strong for configured roots; status metadata and public-language target coverage are the gap.

**Generated and generated-like artifacts are easy to edit in the wrong place:**
- Files: `src/routeTree.gen.ts`, `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts`, `convex/_generated/ai/guidelines.md`, `.planning/graphs/GRAPH_REPORT.md`, `.planning/graphs/graph.json`
- Why fragile: Generated files are useful for route/API awareness but are not source-of-truth. Some are excluded from scanners while others are checked by TypeScript.
- Safe modification: Edit route files, Convex schema/functions, or graph inputs; regenerate generated artifacts through their owning tools. Keep generated exceptions explicit in scans.
- Test coverage: `tests/scripts/assert-graph-fresh.ts` and generated-file scanner exceptions exist, but they only help when run on a settled source set.

**Provider proof rails are intentionally narrow:**
- Files: `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/billing/internal/operations.ts`, `src/lib/server/billing-provider.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/lib/ui/contract-scans.ts`
- Why fragile: Stripe business-action checkout rejects live mode and client authority fields; billing success depends on Autumn/Stripe readback and receipts; protected actions record receipt/proof-gap/no-repair states.
- Safe modification: Do not broaden provider success wording or live-money behavior without source-owned receipt, reconciliation, and support/no-repair paths.
- Test coverage: Unit and provider-smoke scripts exist, but production provider proof requires deploy-smoke evidence and current env readbacks.

## Scaling Limits

**In-memory answer rate limits do not coordinate across instances:**
- Current capacity: `ANSWER_TURN_RATE_LIMIT` is 30 per session per hour outside development; development raises answer turns to 10,000.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/security/public.ts`, `convex/security.ts`
- Limit: Buckets and idempotency claims live in process memory and reset on restart or split across server instances.
- Scaling path: Persist answer/follow-up/stream buckets in Convex using the existing security rate-limit domain, with in-memory checks only as a local fast path.

**Public registry and discovery are seed-sized by default:**
- Current capacity: Limits are small (`/registry` clamps to 20, public API helpers normalize to 50), and non-production registry calls can fall back to fixture state.
- Files: `src/routes/registry.tsx`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/internal/search.ts`, `src/modules/discovery/internal/source-state.ts`
- Limit: A larger catalog stresses fanout hydration, stale generated artifacts, and source-state collection.
- Scaling path: Use projection tables and indexed pagination for list/search/detail, and keep fixture fallback disabled in production.

**Harness sessions are bounded on reads but need retention policy:**
- Current capacity: Public and admin harness-session reads use `.take(limit)` by session/run and normalize limits.
- Files: `convex/harnessSessions.ts`, `src/modules/harness/harness.functions.ts`, `src/modules/harness/session-journal.ts`
- Limit: A busy answer surface can create multiple entries per turn, and no retention/TTL policy is visible in the source seam.
- Scaling path: Add retention/archival policy keyed by session/run age and keep private payloads minimized.

## Dependencies at Risk

**Nightly Nitro runtime package:**
- Risk: `package.json` uses `nitro` through `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`.
- Files: `package.json`, `vite.config.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.billing.webhook.ts`
- Impact: Server runtime, route handling, and streaming behavior can shift underneath TanStack Start.
- Migration plan: Pin to stable Nitro when available or keep route-level smoke coverage around SSE, webhooks, server functions, and protected owner/admin routes.

**Early Astryx packages and generated references:**
- Risk: `@astryxdesign/core`, `@astryxdesign/theme-neutral`, and `@astryxdesign/cli` are `^0.1.2`, and reference pages under `src/app/*` still compile alongside product code.
- Files: `package.json`, `src/app/ai-chat-landing/page.tsx`, `src/app/library/page.tsx`, `src/routes/registry.tsx`, `src/routes/__root.tsx`
- Impact: Minor package updates or generated reference assumptions can break routed AE surfaces or introduce non-AE UI patterns.
- Migration plan: Pin package versions during migration-heavy work, keep Astryx wrappers thin, and remove non-routed generated references after extracting patterns.

**Client observability depends on third-party SDK posture:**
- Risk: Sentry/PostHog initialize when public env keys are present; client SDK behavior affects privacy, bundle size, and supply-chain exposure.
- Files: `package.json`, `src/components/ae/layout/AeObservabilityBoot.tsx`, `src/lib/observability/config.ts`, `src/lib/observability/sentry.client.ts`, `src/lib/observability/posthog.client.ts`
- Impact: Public pages can send telemetry to third-party services if env enables it, and regressions may appear only in deployed/browser contexts.
- Migration plan: Keep observability disabled unless configured, scrub sensitive fields, gate funnel use by consent, and include deploy-smoke checks for telemetry boot only when telemetry is part of the release.

## Missing Critical Features

**Production admin run evidence source:**
- Problem: `readConfiguredSource()` returns the disabled source unless a test source port is installed.
- Files: `src/modules/harness/run-viewer.functions.ts`, `convex/answerThreads.ts`, `convex/harnessSessions.ts`, `src/components/ae/harness/AeHarnessRunViewer.tsx`
- Blocks: Operator review of private run evidence, missing harness-run rows, projection diffs, timings, and persistence failures.

**Shared bounded JSON parser for public POST routes:**
- Problem: Public API routes parse JSON directly and enforce field limits after allocation.
- Files: `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`
- Blocks: Consistent abuse resistance and predictable error responses for oversized requests.

**Source-write gate for answer and observability writes:**
- Problem: Harness, billing, catalog, operator controls, and several protected writes use source-write admission, but answer-thread and public funnel writes still rely on route-level discipline or non-authoritative posture.
- Files: `convex/answerThreads.ts`, `convex/observability.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/observability/funnel.source.ts`, `src/modules/security/source-write-admission.ts`
- Blocks: A uniform write-authority story for public server-origin source writes.

**Public/private thread share controls:**
- Problem: `sharePolicy` exists as `public | unlisted`, but public projection routes do not enforce private/owner-only variants and saved turn queries are included in public projection.
- Files: `src/modules/answer-thread/answer-thread.schema.ts`, `convex/answerThreads.ts`, `src/routes/api.answer.threads.$threadId.ts`, `src/routes/t.$threadId.tsx`
- Blocks: Safe support for sensitive follow-up queries, private saved threads, and explicit copy-link consent.

**Live provider-proof cutover for business-action money:**
- Problem: Business-action Stripe checkout evidence is test-mode only and rejects non-`sk_test_` keys; this is correct for current proof posture but not production money movement.
- Files: `src/modules/business-action/internal/stripe-checkout.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `src/lib/ui/contract-scans.ts`
- Blocks: Any claim that AE can perform production autonomous payment, checkout, settlement, custody, or marketplace payout.

## Test Coverage Gaps

**Direct Convex write denial for answer threads:**
- What's not tested: Direct calls to `convex/answerThreads.ts` mutations without server admission being denied, because the mutations currently have no source-write arguments.
- Files: `convex/answerThreads.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `tests/unit/answer-thread/answer-turn-grounding.test.ts`, `tests/unit/convex/source-write-admission.test.ts`
- Risk: Route tests can pass while public Convex function calls remain a write surface.
- Priority: High

**Real-source admin run viewer:**
- What's not tested: `/admin/runs` and `/admin/runs/$turnId` reading actual Convex answer turns and harness-session rows through an admin-authorized source port.
- Files: `src/modules/harness/run-viewer.functions.ts`, `src/routes/admin.runs.tsx`, `src/routes/admin.runs.$turnId.tsx`, `tests/unit/harness/run-viewer-functions.test.ts`
- Risk: The disabled scaffold stays green while production operators cannot inspect runs.
- Priority: High

**Request body size rejection:**
- What's not tested: Oversized JSON bodies being rejected before full parsing on answer, agent-tools, chat, notification, and observability routes.
- Files: `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.chat.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.observability.funnel.ts`
- Risk: Large request bodies can consume memory despite field-level schema caps.
- Priority: High

**Status metadata public wording:**
- What's not tested: `getStatusPresentation('registry_verified')` being safe for public surfaces and never exposing `Verified` wording outside operator/admin contexts.
- Files: `src/lib/ui/status-presentation.ts`, `src/components/ae/status/AeStatusBadge.tsx`, `tests/ui-contract/status-copy.test.ts`, `tests/ui-contract/public-language-copy.test.ts`
- Risk: A new public caller bypasses `AeStatusBadge` and overclaims trust.
- Priority: Medium

**Public thread privacy and share policy:**
- What's not tested: Threads containing sensitive-looking queries being withheld, redacted, or explicitly marked unlisted/private before public projection.
- Files: `src/routes/api.answer.threads.$threadId.ts`, `src/routes/t.$threadId.tsx`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/answer-thread/answer-thread.schema.ts`
- Risk: Saved public thread URLs expose raw user query text by id.
- Priority: Medium

**Compact viewport sidebar behavior is skipped:**
- What's not tested: Recent-question sidebar behavior on compact Playwright projects because the desktop sidebar test skips compact Chromium.
- Files: `tests/e2e/thread-first.spec.ts`, `src/components/ae/chat/AeThreadSidebar.tsx`, `src/components/ae/chat/AeChat.tsx`
- Risk: Mobile/compact thread navigation regressions can hide behind desktop-only coverage.
- Priority: Medium

**Developer discovery production freshness:**
- What's not tested: Production discovery schema/examples/fixtures carrying wall-clock generated times and live public route snapshots instead of deterministic `0` timestamps.
- Files: `src/routes/api.discovery.schema.ts`, `src/routes/api.discovery.examples.ts`, `src/routes/api.discovery.fixtures.ts`, `tests/e2e/developer-discovery.spec.ts`, `tests/integration/discovery-route-parity.test.ts`
- Risk: Builder-facing artifacts can look current while freshness/readback is deterministic or fixture-derived.
- Priority: Medium

**Provider-proof deploy smokes are opt-in scripts:**
- What's not tested by ordinary unit/integration runs: Resend, Novu, Autumn/Stripe, and business-action Stripe provider smokes require dedicated Playwright deploy-smoke commands.
- Files: `package.json`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
- Risk: Source-owned provider code can pass local tests while environment, webhook, signature, or provider-readback wiring is broken.
- Priority: High

---

*Concerns audit: 2026-07-03*
