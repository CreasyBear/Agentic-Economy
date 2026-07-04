# Codebase Concerns

**Analysis Date:** 2026-07-04

## Tech Debt

**Retired AE presentation system remains active:**
- Issue: The Astryx-era design authority says bespoke `Ae*` presentation components and handwritten CSS only shrink, but the app still imports the unlayered legacy CSS bundle and keeps a large `src/components/ae/` component tree.
- Files: `DESIGN.md`, `src/styles/globals.css:13`, `src/styles/globals.css:19`, `src/styles/legacy.css:1`, `src/styles/legacy.css:9`, `src/components/ae/`, `public/images/illustration/`
- Impact: New UI work can accidentally extend the retired Daylight/Register system, override Astryx tokens, or keep public surfaces visually inconsistent with `DESIGN.md`.
- Fix approach: Re-skin one route family at a time onto Astryx primitives, delete the corresponding imports from `src/styles/legacy.css`, and keep new presentation code in `src/components/astryx/` or Astryx composition rather than adding new `Ae*` primitives.

**Large domain/runtime modules own too many responsibilities:**
- Issue: Several files combine validators, source-state loading, authorization, command execution, persistence, projection, audit, and readback conversion in one module.
- Files: `convex/inquiries.ts` (2627 lines), `src/modules/answer-thread/internal/turn-orchestrator.ts` (1819 lines), `src/modules/protected-action/internal/contact-follow-up.ts` (1801 lines), `src/modules/inquiries/internal/commands.ts` (1603 lines), `convex/registry.ts` (1590 lines), `convex/discovery.ts` (1502 lines)
- Impact: Local changes have broad blast radius; policy and copy changes are hard to isolate from persistence and runtime adapter behavior.
- Fix approach: Split by stable seams: keep pure command reducers in `src/modules/*/internal/commands.ts`, move Convex row codecs into `convex/*Store.ts`, and move public/readback projections into small files that can be tested without Convex runtime mocks.

**Registry/search fallback branches increase behavior surface:**
- Issue: Public registry reads support Convex source queries, local E2E source ports, Meili search, dual shadow search, hydration, and explicit legacy fallback branches.
- Files: `src/modules/registry/registry.functions.ts:76`, `src/modules/registry/registry.functions.ts:90`, `src/modules/registry/registry.functions.ts:96`, `src/modules/registry/registry.functions.ts:112`, `src/modules/registry/registry.functions.ts:161`, `src/modules/registry/registry.functions.ts:339`
- Impact: Search behavior can differ by environment, and regressions can hide in one backend path while another path stays green.
- Fix approach: Keep `tests/unit/registry/registry-fallback.test.ts` as the contract source, add backend-parity cases for every new search mode, and avoid adding new fallback paths without an explicit failure-mode test.

**Policy code uses string fragmentation to avoid banned symbols:**
- Issue: `src/modules/protected-action/internal/contact-follow-up.ts` builds blocked payment/provider parameter names from fragments such as `pay`, `ment`, `str`, and `ipe`.
- Files: `src/modules/protected-action/internal/contact-follow-up.ts:1257`, `src/modules/protected-action/internal/contact-follow-up.ts:1276`, `src/lib/ui/contract-scans.ts:365`, `tests/imports/source-mining.test.ts:10`
- Impact: The real policy surface is harder to read and audit; future edits can miss blocked names or accidentally weaken the protected-action boundary.
- Fix approach: Move banned key lists into a documented scanner allowlist or test fixture exception so runtime policy can use explicit strings and remain reviewable.

## Known Bugs

**`inquiry.submit` is advertised on the quiet agent door but no successful tool-write path is visible:**
- Symptoms: `GET /api/agent/tools` lists `inquiry.submit`, but `POST /api/agent/tools` forces `allowWrites: false` even after a signed identity check. Harness policy only enters `public-qualified-write` mode when `allowWrites === true`, so the write is blocked before `submitPublicInquiryThroughSource` can run.
- Files: `src/routes/api.agent.tools.ts:39`, `src/routes/api.agent.tools.ts:92`, `src/routes/api.agent.tools.ts:109`, `src/routes/api.agent.tools.ts:114`, `src/modules/harness/tool-policy.ts:39`, `src/modules/harness/approval-policy.ts:121`, `src/modules/inquiries/inquiry.actions.ts:112`, `tests/integration/agent-tools-api.test.ts:195`, `tests/integration/agent-tools-api.test.ts:273`
- Trigger: Submit a valid `inquiry.submit` body to `POST /api/agent/tools` with a signed Web Bot Auth identity.
- Workaround: Use the human inquiry route or server-function path; do not tell assistants the quiet tool can submit until the public qualified-write path is implemented and tested.

**Public trust vocabulary still contains `Verified` wording:**
- Symptoms: The internal/public status presentation contains `registry_verified`, label `Registry verified`, and compact label `Verified`, while AGENTS/PRODUCT require `verified` only for a named standard.
- Files: `src/lib/ui/status-presentation.ts:20`, `src/lib/ui/status-presentation.ts:190`, `src/lib/ui/status-presentation.ts:607`, `src/components/ae/status/AeStatusBadge.tsx:22`, `src/modules/business/public.ts:29`, `tests/ui-contract/status-copy.test.ts:5`
- Trigger: Any public or operator status surface that renders `getStatusPresentation('registry_verified')` without the `AeStatusBadge` public override.
- Workaround: `AeStatusBadge` maps public `registry_verified` to `Checked`, but the underlying presentation and JSON trust tier still use verified vocabulary.

## Security Considerations

**CSP is report-only by default and allows inline scripts:**
- Risk: Browser CSP does not block script execution unless `AE_CSP_REPORT_ONLY` is explicitly disabled, and `script-src` includes `'unsafe-inline'`.
- Files: `src/lib/http/security-headers.ts:37`, `src/lib/http/security-headers.ts:49`, `src/lib/http/security-headers.ts:109`, `src/lib/http/security-headers.ts:120`, `tests/unit/http/security-headers.test.ts:37`, `tests/unit/http/security-headers.test.ts:67`
- Current mitigation: Security headers include `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and tests assert both report-only and enforcing modes in `tests/unit/http/security-headers.test.ts`.
- Recommendations: Keep reports clean, switch production to enforcing CSP, and replace inline-script allowance with nonce/hash-compatible TanStack/Clerk/Astryx integration where feasible.

**Broad local E2E bypass flag touches auth, source writes, and fixtures:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` bypasses Clerk and routes multiple source paths to local fixtures. The production bootstrap guards are present, but a public-prefixed env var controls server-side behavior in many files.
- Files: `src/start.ts:47`, `src/start.ts:49`, `src/start.ts:54`, `src/routes/__root.tsx:73`, `src/lib/server/require-operator-session.ts:10`, `src/lib/server/claim-owner-session.ts:5`, `src/modules/inquiries/inquiry.functions.ts:309`, `src/modules/inquiries/inquiry.functions.ts:826`, `src/modules/registry/registry.functions.ts:163`
- Current mitigation: `src/start.ts:54` and `src/routes/__root.tsx:78` throw in production when the bypass is enabled.
- Recommendations: Centralize this behind a server-only helper, use a non-`VITE_` server flag for server branches, and keep production/pre-production smoke tests proving the bypass is inactive.

**Operator auth is split between sign-in guard and route readbacks:**
- Risk: `operatorRouteOptions` only proves a user is signed in; owner/admin authorization is delegated to each route's readback branch.
- Files: `src/lib/operator/route-options.ts:4`, `src/lib/operator/route-options.ts:10`, `src/lib/server/require-operator-session.ts:26`, `src/lib/server/require-operator-session.ts:33`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.business-actions.tsx`, `src/routes/owner.inquiries.$threadId.tsx`
- Current mitigation: Route comments and readback components distinguish missing membership from available rows, and admin/owner server functions call source queries with authenticated Convex clients.
- Recommendations: Add a route-boundary test whenever a new `/admin/*`, `/owner/*`, or `/developers/*` route is added, proving no private rows render before the route-specific readback allows access.

## Performance Bottlenecks

**Discovery files rebuild the full public catalog per request:**
- Problem: `/llms.txt` and `/sitemap.xml` call Convex queries that collect all published businesses, then perform per-business lookups for context, services, capabilities, suppression, index status, and discovery attempts.
- Files: `src/routes/llms[.]txt.ts:18`, `src/modules/discovery/discovery.functions.ts:36`, `convex/discovery.ts:355`, `convex/discovery.ts:369`, `convex/discovery.ts:655`, `convex/discovery.ts:606`, `convex/discovery.ts:620`, `convex/discovery.ts:627`, `convex/discovery.ts:1035`
- Cause: `publicCatalogsForDiscovery` is catalog-wide and `indexStatusForBusiness` calls `db.query('indexStatus').collect()` for each business.
- Improvement path: Persist discovery-file artifacts or catalog digest rows, update them on catalog publish/suppression/index events, and serve `/llms.txt`/`/sitemap.xml` from bounded reads.

**Owner billing slices scan all businesses before filtering:**
- Problem: Owner billing paths load all `businesses` and filter by owner in application code.
- Files: `convex/billing.ts:710`, `convex/billing.ts:719`, `convex/billingStore.ts:22`, `convex/billingStore.ts:425`
- Cause: The code uses `.collect()` without a `by_ownerId` index on the billing read path.
- Improvement path: Add an owner/business index or owner-business mapping table and read only the current owner's businesses before loading billing slices.

**Meili hydration is N+1 across public detail calls:**
- Problem: Meili search returns candidate slugs, then hydration calls `sourcePort.detail` for every unique slug in parallel.
- Files: `src/modules/registry/registry.functions.ts:112`, `src/modules/registry/registry.functions.ts:224`, `src/modules/registry/registry.functions.ts:225`, `src/modules/registry/internal/catalog-search-port.ts:181`
- Cause: The search index intentionally stores lightweight documents, so result hydration depends on detail reads per slug.
- Improvement path: Add a bounded batch detail source query or store enough public card data in the search document to avoid per-result detail calls for list/search pages.

**Answer API rate limiting is process-local:**
- Problem: Answer turn, answer stream, and follow-up chip rate limits use module-level arrays and maps.
- Files: `src/modules/answer-thread/internal/turn-guard.ts:12`, `src/modules/answer-thread/internal/turn-guard.ts:54`, `src/modules/answer-thread/internal/turn-guard.ts:78`, `src/modules/answer-thread/internal/turn-guard.ts:88`, `src/routes/api.answer.turn.ts:37`, `src/routes/api.answer.ts:30`, `src/routes/api.answer.follow-up-chips.ts:43`
- Cause: Buckets live in memory, not Convex or a shared rate-limit store.
- Improvement path: Move public answer abuse buckets to Convex or edge storage, keyed by pseudonymous session and request class, with cleanup equivalent to `convex/security.ts:267`.

## Fragile Areas

**Convex source-state snapshot loaders collect many tables:**
- Files: `convex/source_state.ts:139`, `convex/source_state.ts:165`, `convex/source_state.ts:180`, `convex/source_state.ts:460`
- Why fragile: Full source reconstruction is useful for audits and tests, but it cannot be used safely on high-traffic or large-table paths.
- Safe modification: Keep this path for explicit reconstruction only; create targeted loaders for business, inquiry, registry, and billing flows.
- Test coverage: `tests/unit/convex/source-state.test.ts` and `tests/unit/convex/source-state-index-guard.test.ts` cover source-state shape and indexes, but performance budget tests are not visible.

**Inquiry flow spans pure reducers and Convex adapter code:**
- Files: `src/modules/inquiries/internal/commands.ts:284`, `src/modules/inquiries/internal/commands.ts:926`, `convex/inquiries.ts:612`, `convex/inquiries.ts:1246`, `convex/inquiries.ts:1314`, `convex/inquiries.ts:1480`
- Why fragile: Inquiry admission, abuse buckets, owner inbox, notification binding, privacy export/delete, audit, and reconstruction all share the same runtime surface.
- Safe modification: Change the pure command functions first, add unit tests in `tests/unit/inquiries/`, then update Convex row codecs/persistence separately in `convex/inquiries.ts`.
- Test coverage: Good unit/runtime coverage exists in `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`, and `tests/integration/agent-tools-api.test.ts`; the quiet-agent successful write path is not covered.

**Answer orchestration mixes intent routing, streaming, tool execution, and final prose assembly:**
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts:161`, `src/modules/answer-thread/internal/turn-orchestrator.ts:659`, `src/modules/answer-thread/internal/turn-orchestrator.ts:1071`, `src/modules/answer-thread/internal/turn-orchestrator.ts:1217`, `src/modules/answer-thread/internal/turn-orchestrator.ts:1330`
- Why fragile: Small changes can affect empty states, inquiry handoff, boundary answers, LLM tool-use, persisted turn state, and streaming event ordering.
- Safe modification: Add focused tests around the route branch being changed, especially `tests/integration/answer-turn-intent-routing.test.ts` and `tests/unit/answer-thread/answer-harness-operation.test.ts`.
- Test coverage: Broad tests exist, but the module size makes branch-specific regressions likely when adding new answer states.

## Scaling Limits

**Public discovery artifacts scale with total published catalog size:**
- Current capacity: Bounded by Convex transaction/read limits for `convex/discovery.ts:655` and per-business reads in `convex/discovery.ts:606`.
- Limit: `/llms.txt`, `/sitemap.xml`, and developer discovery route health become expensive as published business count grows.
- Scaling path: Maintain generated discovery artifacts in Convex tables and update them from publish/suppress/index operations.

**Answer sessions are capped at 25 turns per thread:**
- Current capacity: `ANSWER_TURN_MAX_PER_THREAD = 25`.
- Limit: Long-running chat sessions hit `thread_turn_limit` instead of compacting or archiving.
- Scaling path: Add thread summarization/compaction or forked continuation threads before increasing the hard cap.
- Files: `src/modules/answer-thread/internal/turn-guard.ts:6`, `src/modules/answer-thread/internal/turn-guard.ts:115`, `convex/answerThreads.ts:104`

**In-memory answer buckets do not scale across serverless instances:**
- Current capacity: Per process only.
- Limit: Multiple Node serverless instances have independent `turnRateLimitBuckets`, `followUpChipsRateLimitBuckets`, and `answerStreamRateLimitBuckets`.
- Scaling path: Use the persisted `abuseRateLimitBuckets` pattern from `convex/security.ts:267` for public answer endpoints.
- Files: `src/modules/answer-thread/internal/turn-guard.ts:12`, `convex/security.ts:267`

## Dependencies at Risk

**Nitro nightly is in the build/deployment path:**
- Risk: `nitro` is aliased to `nitro-nightly`, and `vite.config.ts` uses `nitro()` to produce the Vercel Node serverless deployment.
- Impact: Nightly regressions can break builds, serverless routing, or webhook raw-body behavior.
- Migration plan: Pin to a stable Nitro release when available; keep deploy-smoke coverage for webhook raw body/signature paths before and after migration.
- Files: `package.json:93`, `package-lock.json:17350`, `vite.config.ts:5`, `vite.config.ts:60`

**Client-exposed `VITE_` names are used for server behavior:**
- Risk: Public-prefixed variables are easy to misunderstand as browser-only or safe to expose, while the code uses `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` and scanner rules mention `VITE_AE_SOURCE_WRITE_SECRET`.
- Impact: Environment mistakes can affect auth bypasses, source-write behavior, and local fixture routing.
- Migration plan: Rename server-control env vars to server-only names and keep Vite public vars only for browser rendering decisions.
- Files: `src/start.ts:49`, `src/routes/__root.tsx:73`, `src/lib/ui/contract-scans.ts:370`, `src/modules/registry/registry.functions.ts:350`

## Missing Critical Features

**Successful public qualified inquiry through `/api/agent/tools`:**
- Problem: The product contract says assistants can send a qualified inquiry when a listing publishes that capability, and `inquiry.submit` is listed as an agent tool, but the route-level runner does not allow writes.
- Blocks: External assistant completion of the first owned conversion through the quiet agent door.
- Files: `AGENTS.md`, `src/routes/api.agent.tools.ts:109`, `src/routes/api.agent.tools.ts:114`, `src/modules/inquiries/inquiry.actions.ts:112`

**Distributed abuse protection for answer endpoints:**
- Problem: Public answer endpoints use session cookies and process-local buckets, but no shared limiter is visible for `POST /api/answer/turn`, `GET /api/answer?stream=1`, or `POST /api/answer/follow-up-chips`.
- Blocks: Reliable abuse control under horizontal scaling or cold starts.
- Files: `src/routes/api.answer.turn.ts:22`, `src/routes/api.answer.ts:23`, `src/routes/api.answer.follow-up-chips.ts:28`, `src/modules/answer-thread/internal/turn-guard.ts:12`

**Named verification standard for any `verified` trust tier:**
- Problem: `registry_verified` exists in trust-tier contracts without a named standard in the code paths inspected.
- Blocks: Product-safe use of `Verified` labels on public or operator surfaces.
- Files: `PRODUCT.md`, `AGENTS.md`, `src/modules/business/public.ts:29`, `src/lib/ui/status-presentation.ts:190`, `src/modules/discovery/developer-discovery.ts:510`

## Test Coverage Gaps

**No positive `/api/agent/tools` write test:**
- What's not tested: A signed, admitted `inquiry.submit` request returning `inquiry_submitted` or `inquiry_replayed` through `POST /api/agent/tools`.
- Files: `tests/integration/agent-tools-api.test.ts:195`, `tests/integration/agent-tools-api.test.ts:273`, `src/routes/api.agent.tools.ts:114`
- Risk: The only assistant-exposed write remains listed but unusable.
- Priority: High

**Status copy tests do not reject verified wording:**
- What's not tested: `aeStatusPresentation` public labels/descriptions/compact labels avoiding `Verified` unless backed by a named standard.
- Files: `tests/ui-contract/status-copy.test.ts:5`, `src/lib/ui/status-presentation.ts:190`
- Risk: Public or operator UI can drift away from the AGENTS/PRODUCT trust vocabulary.
- Priority: Medium

**No load/performance test for discovery file generation:**
- What's not tested: Published-catalog size where `readLlmsTxt` and `readSitemapXml` exceed Convex read/function budgets.
- Files: `convex/discovery.ts:355`, `convex/discovery.ts:369`, `convex/discovery.ts:655`, `tests/seo/discovery-files.test.ts`
- Risk: Discovery routes pass correctness tests but degrade as catalog size grows.
- Priority: Medium

**No cross-instance rate-limit test for answer endpoints:**
- What's not tested: Multiple server instances sharing answer-turn, stream, and follow-up-chip abuse limits.
- Files: `src/modules/answer-thread/internal/turn-guard.ts:12`, `tests/integration/answer-rate-limits.test.ts`
- Risk: Rate limits appear correct in one process but fail under serverless scaling.
- Priority: Medium

---

*Concerns audit: 2026-07-04*
