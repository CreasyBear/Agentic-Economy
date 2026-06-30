# Codebase Concerns

**Analysis Date:** 2026-06-30

## Tech Debt

**Typecheck Gate Is Red:**
- Issue: `npm run typecheck` exits non-zero with nine TypeScript errors in `convex/observability.ts`.
- Files: `convex/observability.ts`, `package.json`, `tsconfig.json`
- Evidence: `convex/observability.ts:14`, `convex/observability.ts:24`, and `convex/observability.ts:411`-`convex/observability.ts:477` reference duplicated or unresolved symbols such as `brandNonEmpty`, `OperatorControlSourceState`, `AuditEventContract`, `OperatorControlRecord`, and `OperatorControlReadback`.
- Impact: `npm run test:all` and `npm run test:release` both start with `npm run typecheck` in `package.json:14` and `package.json:44`, so release verification stops before unit, integration, copy, UI-contract, e2e, a11y, eval, and build gates.
- Fix approach: Repair imports/types in `convex/observability.ts`, then run `npm run typecheck`, `npm run test:ts-standards`, and the relevant observability/security unit tests.

**Large Source Runtime Files:**
- Issue: Several source-owned runtime files concentrate many responsibilities in one module.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/discovery.ts`, `src/modules/discovery/developer-discovery.ts`, `convex/businessActionStore.ts`, `convex/notificationOutbox.ts`, `src/modules/billing/internal/operations.ts`
- Impact: Changes to inquiry, discovery, notification, billing, and business-action behavior require careful local reasoning across large files; defects can affect public API, owner/admin readbacks, source write admission, and audit state together.
- Fix approach: Split along existing responsibility seams: validators and adapters stay near Convex functions, pure command/readback reducers stay under `src/modules/*/internal/`, and route/server functions continue importing only public seams.

**Business Action Source-Write Scope Drift:**
- Issue: Business-action operation rows store `scope: 'business_action'`, but source-write admission only defines `protected_action` and the business-action server/Convex write path verifies business-action mutations under `protected_action`.
- Files: `src/modules/security/source-write-admission.ts:3`, `src/modules/business-action/business-action.functions.ts:309`, `src/modules/business-action/business-action.functions.ts:415`, `convex/businessActions.ts:571`, `convex/businessActions.ts:628`, `convex/businessActions.ts:681`, `convex/businessActions.ts:730`, `convex/businessActions.ts:781`, `convex/businessActions.ts:822`, `convex/businessActionStore.ts:929`
- Impact: Business-action writes work through a broad inherited scope instead of a dedicated admission scope. Operation/correlation keys still bind individual writes, but audit language and admission policy are harder to reason about.
- Fix approach: Add `business_action` to `SourceWriteAdmissionScopeValues`, update business-action server functions and Convex mutations to require it, and keep protected-action contact follow-up on `protected_action`.

**Future-Phase Naming In Active Routes:**
- Issue: Active billing routes import route panels/readbacks from `src/future-phases/05-paid-activation-money-rails/**`.
- Files: `src/routes/owner.billing.tsx:5`, `src/routes/owner.billing.tsx:9`, `src/routes/api.billing.webhook.ts`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`
- Impact: Runtime code that is mounted in the active route tree appears to live in a parked future-phase directory, while parallel parked route files also exist. This makes ownership and stage-gating ambiguous during maintenance.
- Fix approach: Move active Phase 5 route support code into `src/modules/billing/` or `src/components/ae/billing/`, and keep only unmounted placeholders under `src/future-phases/`.

**No General Lint Or Formatter Gate:**
- Issue: No repo-root `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `prettier.config.*`, or `biome.json` is detected, and `package.json` has no `lint` or `format` script.
- Files: `package.json`, `src/lib/ui/contract-scans.ts`, `tests/imports/ts-standards.test.ts`, `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`
- Impact: Custom scan tests cover critical AE rules, but general correctness/style issues such as unused variables, hooks misuse, import sorting, accessibility lint rules, and dead code rely on review and TypeScript.
- Fix approach: Either document scanner-only lint posture as intentional or add a lightweight lint/format gate that preserves generated-file exceptions for `src/routeTree.gen.ts` and `convex/_generated/*`.

## Known Bugs

**Shared Answer Threads Are Writable By Anyone With The Thread ID:**
- Symptoms: `POST /api/answer/turn` accepts an optional `threadId`; the server reads prior turns for that ID and appends a new turn without proving that the caller owns the thread session.
- Files: `src/modules/answer-thread/answer-thread.schema.ts:66`, `src/routes/api.answer.turn.ts:50`, `src/modules/answer-thread/internal/turn-orchestrator.ts:48`, `src/modules/answer-thread/internal/turn-orchestrator.ts:51`, `src/modules/answer-thread/internal/turn-orchestrator.ts:154`, `convex/answerThreads.ts:50`, `convex/answerThreads.ts:59`
- Trigger: A user receives or guesses a public `/t/$threadId` share link, then posts a follow-up body with that `threadId` to `POST /api/answer/turn` from a different session.
- Workaround: None in code. Thread IDs are random UUIDs, but share links intentionally disclose them.
- Fix approach: Add a server/Convex append path that requires `pseudonymousSessionId` to match the owning `answerThreads` row, or split public shared read IDs from private write tokens.

**Answer Thread Persistence Silently Drops Source Errors:**
- Symptoms: `persistTurnBestEffort` swallows all errors after streaming an answer.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts:145`, `src/modules/answer-thread/internal/turn-orchestrator.ts:169`
- Trigger: Convex/source persistence fails while the SSE stream succeeds.
- Workaround: User sees the streamed answer, but share links/history can miss the turn.
- Fix approach: Record a redacted observability event or return a final stream warning that history persistence is unavailable without exposing source details.

**Convex Generated Files Are Required Locally But Not Tracked:**
- Symptoms: `convex/devSeed.ts` imports `./_generated/server`, while `convex/_generated/*` is untracked in git.
- Files: `convex/devSeed.ts:1`, `convex/_generated/server.d.ts`, `convex/_generated/server.js`, `package.json:12`, `.gitignore`
- Trigger: A clean checkout without running Convex codegen can miss files needed by Convex dev commands.
- Workaround: Run `npx convex codegen` or the project’s Convex setup before using dev seed functions.
- Fix approach: Choose one policy: commit `convex/_generated/*` like `src/routeTree.gen.ts`, or document codegen as a required setup step and keep dev seed code behind generated-file availability.

## Security Considerations

**Public Answer-Turn Write Endpoint Has No Abuse Controls:**
- Risk: Anonymous callers can create threads and turns through `POST /api/answer/turn`; only query length is capped.
- Files: `src/routes/api.answer.turn.ts:19`, `src/modules/answer-thread/answer-thread.schema.ts:71`, `src/modules/answer-thread/internal/turn-orchestrator.ts:43`, `src/modules/answer-thread/internal/turn-orchestrator.ts:93`, `convex/answerThreads.ts:15`, `convex/answerThreads.ts:35`
- Current mitigation: Query text is trimmed and capped at 200 characters in `src/modules/answer-thread/answer-thread.schema.ts:73` and `src/modules/answer-thread/internal/turn-orchestrator.ts:43`; session cookie IDs are HttpOnly and SameSite=Lax in `src/modules/answer-thread/internal/session-cookie.ts:35`.
- Recommendations: Add source-owned rate-limit buckets for answer turns, cap turns per thread, cap threads per session window, and deny appends to threads not owned by the current pseudonymous session.

**Answer Session Cookie Lacks Production `Secure`:**
- Risk: The anonymous answer-thread cookie is emitted with `HttpOnly; SameSite=Lax` but no conditional `Secure` attribute.
- Files: `src/modules/answer-thread/internal/session-cookie.ts:33`, `src/modules/answer-thread/internal/session-cookie.ts:35`
- Current mitigation: The cookie stores a pseudonymous session ID, not raw contact details or auth credentials.
- Recommendations: Add `Secure` when the request is HTTPS or production config requires it, while preserving local HTTP development.

**Canonical Discovery URLs Depend On Request Origin:**
- Risk: `llms.txt`, `sitemap.xml`, `robots.txt`, UCP manifests, and developer discovery route checks build canonical URLs from `new URL(request.url).origin`. If the platform forwards untrusted Host-derived request URLs, public SEO/assistant files can advertise the wrong origin.
- Files: `src/routes/llms[.]txt.ts:33`, `src/routes/sitemap[.]xml.ts:35`, `src/routes/robots[.]txt.ts:22`, `src/routes/$slug.ucp.ts:69`, `src/routes/api.discovery.schema.ts:201`
- Current mitigation: Tests use `https://ae.example` origins and assert safe fields in `tests/seo/discovery-files.test.ts:29`, `tests/seo/discovery-files.test.ts:36`, `tests/integration/discovery-route-parity.test.ts:176`, and `tests/integration/discovery-route-parity.test.ts:185`.
- Recommendations: Prefer a configured canonical base URL such as `SITE_URL` for public discovery artifacts, allowlist request origins when dynamic behavior is required, and add tests for hostile Host/origin input.

**Local E2E Auth Bypass Is Repeated Across Server Modules:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` bypass checks appear in many server modules. Central startup guards reject the flag in production, but direct module use and tests must preserve that invariant.
- Files: `src/start.ts:12`, `src/start.ts:17`, `src/routes/__root.tsx:58`, `src/routes/__root.tsx:63`, `src/modules/inquiries/inquiry.functions.ts:756`, `src/modules/protected-action/contact-follow-up.functions.ts:846`, `src/modules/business-action/business-action.functions.ts:426`, `src/lib/server/claim-owner-session.ts:6`
- Current mitigation: `src/start.ts:17` throws when `NODE_ENV === 'production'`, and `src/routes/__root.tsx:63` throws in production builds.
- Recommendations: Centralize bypass checks in one helper that refuses production in both server and client contexts, and test every module-level bypass through that helper.

**Secrets Handling Has Positive Guards But Local Secret Files Exist:**
- Risk: `.env.local` exists in the working tree and is intentionally ignored. Secret contents were not read.
- Files: `.env.local`, `.env.example`, `.gitignore`, `src/lib/server/source-write-admission.ts:14`, `src/lib/server/source-write-admission.ts:70`
- Current mitigation: `.gitignore` ignores `.env` and `.env.*` while allowing `.env.example`; `readRequiredSourceWriteSecret` rejects a client-exposed `VITE_AE_SOURCE_WRITE_SECRET`.
- Recommendations: Keep secret files ignored, avoid printing env values in smoke tests, and rotate any value if `.env.local` is ever committed or copied into planning artifacts.

## Performance Bottlenecks

**Registry Search Rebuilds The Public Catalog Per Request:**
- Problem: Public list/search/detail queries collect all published businesses, build catalog DTOs, filter in memory, sort, and paginate after the full dataset is assembled.
- Files: `convex/registry.ts:125`, `convex/registry.ts:137`, `convex/registry.ts:152`, `convex/registry.ts:164`, `convex/registry.ts:271`, `convex/registry.ts:287`, `convex/registry.ts:368`, `src/modules/registry/internal/search.ts:90`, `src/modules/registry/internal/search.ts:117`, `src/modules/registry/internal/search.ts:213`
- Cause: The public catalog read model exists as durable projection tables, but runtime search still reconstructs DTOs from normalized source tables for each request.
- Improvement path: Read from `registryProjectionItems` or a dedicated public search projection for list/search/detail, and keep source reconstruction only for repair/admin health paths.

**Per-Business Status Lookups Can Become N+1 Queries:**
- Problem: Registry DTO assembly queries status tables per business and sometimes collects whole status tables.
- Files: `convex/registry.ts:321`, `convex/registry.ts:322`, `convex/registry.ts:473`, `convex/registry.ts:482`, `convex/discovery.ts:917`, `convex/discovery.ts:992`, `convex/discovery.ts:1027`
- Cause: `indexStatusForBusiness` and `discoveryStatusForBusiness` run inside per-business catalog construction.
- Improvement path: Batch statuses before catalog mapping, add indexed target lookups where missing, or make status part of the public catalog projection.

**Public Thread Projection Collects All Turns:**
- Problem: Public thread reads collect every turn for a thread and then build all artifacts.
- Files: `convex/answerThreads.ts:98`, `convex/answerThreads.ts:124`, `src/modules/answer-thread/internal/public-projection.ts:13`, `src/modules/answer-thread/internal/public-projection.ts:20`
- Cause: There is no per-thread turn cap, cursor, or archival projection for long conversations.
- Improvement path: Enforce a max turn count for public threads, paginate `GET /api/answer/threads/$threadId`, or precompute compact public projections.

## Fragile Areas

**Inquiry Runtime Surface:**
- Files: `convex/inquiries.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`, `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`
- Why fragile: Inquiry submission, owner inbox, reply/mark-read/close, delivery readback, privacy tombstones, notification references, rate limits, CSRF/source-write admission, and admin reconstruction are tightly coupled.
- Safe modification: Change pure domain command/readback functions first, add unit tests under `tests/unit/inquiries/`, then update Convex adapter behavior in `tests/unit/convex/inquiries-runtime.test.ts` and route behavior in `tests/integration/*`.
- Test coverage: Strong for owner wrong-user, CSRF, privacy deletion, and delivery readbacks in `tests/unit/convex/inquiries-runtime.test.ts`, but deployed provider smoke coverage depends on env-driven Playwright scripts under `tests/deploy-smoke/`.

**Answer Thread AI Surface:**
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `convex/answerThreads.ts`, `src/routes/api.answer.turn.ts`, `src/routes/t.$threadId.tsx`
- Why fragile: Streamed UX is primary, persistence is best-effort, public share reads are intentionally unauthenticated, and thread writes reuse the same public ID.
- Safe modification: Treat public projection, write token/session ownership, and SSE frame shape as separate contracts; add negative tests before changing URL or thread ID behavior.
- Test coverage: Positive follow-up behavior exists in `tests/integration/answer-turn-boundary-follow-up.test.ts`; no test asserts that a different session cannot append to an existing thread.

**Discovery And SEO Public Artifacts:**
- Files: `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/modules/discovery/internal/discovery-files.ts`, `convex/discovery.ts`
- Why fragile: These files are consumed by crawlers and assistants and must remain public-only, boundary-honest, and route-tested.
- Safe modification: Update builders and route handlers together; keep tests in `tests/seo/discovery-files.test.ts`, `tests/integration/discovery-route-parity.test.ts`, and `tests/integration/discovery-prompt-injection.test.ts` green.
- Test coverage: Strong for public-field redaction and route parity; missing hostile-origin/canonical-base tests.

**Scanner-Based Standards:**
- Files: `src/lib/ui/contract-scans.ts`, `tests/imports/scan-targets.ts`, `tests/imports/ts-standards.test.ts`, `tests/copy/*`, `tests/ui-contract/*`
- Why fragile: Regex scanners enforce key project rules and include explicit allowlists for future-phase and generated routes.
- Safe modification: Keep scanner allowlists narrow and add negative fixtures in `tests/fixtures/bad-*` when adding new exceptions.
- Test coverage: Fixture modes exist for import, source-mining, TypeScript, copy, and UI-contract scanners, but scanner regexes are not a substitute for semantic linting.

## Scaling Limits

**Public Answer Threads:**
- Current capacity: No explicit per-session thread count, per-thread turn count, or per-IP/request rate limit is visible in `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, or `convex/answerThreads.ts`.
- Limit: Anonymous traffic can create unbounded Convex rows and long public thread projections.
- Scaling path: Add rate-limit tables similar to `abuseRateLimitBuckets` and `inquiryAbuseBuckets`, add max-turn enforcement, and introduce pagination/projection compaction for public threads.

**Registry/Search:**
- Current capacity: Query-time full-catalog reconstruction with a maximum API page size of 50 in `convex/registry.ts:523` and `src/modules/registry/internal/search.ts:304`.
- Limit: Catalog size growth increases read latency and Convex query work even when callers request one page.
- Scaling path: Use durable projection tables for public reads, pre-tokenize searchable fields, and keep repair/status recomputation off hot public routes.

**Deploy/Provider Verification:**
- Current capacity: Deploy smoke scripts exist for Phase 1, Phase 2 support/provider notification, Phase 5 Autumn/Stripe, and Phase 6 business-action Stripe in `tests/deploy-smoke/**`.
- Limit: `npm run test:release` includes e2e/a11y/eval/build in `package.json:14`, but it does not run deploy or provider smoke scripts from `package.json:24`-`package.json:29`.
- Scaling path: Keep local release and deployed/provider release gates separate, but add a named production-readiness script or CI workflow that runs the deploy/provider smokes with redacted env.

## Dependencies at Risk

**Nitro Nightly Runtime:**
- Risk: The runtime uses a nightly package alias: `nitro: npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`.
- Impact: Nightly behavior can shift under the caret range and affect TanStack Start/Vite server output.
- Migration plan: Pin an exact nightly build while the app depends on nightly behavior, or move to a stable Nitro release once compatible.
- Files: `package.json:96`, `vite.config.ts:4`, `vite.config.ts:15`

**Convex Generated Runtime Files:**
- Risk: `convex/_generated/*` is untracked while `convex/devSeed.ts` imports it.
- Impact: Fresh environments need codegen before dev seed and some Convex workflows are usable.
- Migration plan: Document codegen in setup docs or commit generated Convex outputs consistently.
- Files: `convex/devSeed.ts:1`, `convex/_generated/server.d.ts`, `convex/_generated/server.js`, `package.json:12`

## Missing Critical Features

**Thread Write Authorization For Shared Links:**
- Problem: Shared `/t/$threadId` reads are public, but append writes use the same ID without a separate write secret or session ownership check.
- Blocks: Safe public sharing of answer threads as read-only records.
- Files: `src/routes/t.$threadId.tsx`, `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `convex/answerThreads.ts`

**Public Answer Abuse Controls:**
- Problem: The answer-turn persistence path lacks rate limiting and storage caps.
- Blocks: Exposing the thread-first answer product to untrusted traffic at scale.
- Files: `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `convex/answerThreads.ts`

**Canonical Site URL Configuration For Discovery Artifacts:**
- Problem: Public discovery artifacts derive canonical URLs from each request origin rather than a configured public site origin.
- Blocks: Defensible SEO/assistant files in environments where Host/request URL is not fully controlled by the app.
- Files: `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.schema.ts`

## Test Coverage Gaps

**Answer Thread Cross-Session Writes:**
- What's not tested: A different pseudonymous session posting to an existing `threadId` must be rejected or must fork into a new thread.
- Files: `tests/integration/answer-turn-boundary-follow-up.test.ts`, `tests/unit/answer-thread/answer-thread-port.test.ts`, `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Risk: Shared answer URLs are publicly writable.
- Priority: High

**Answer Turn Abuse Controls:**
- What's not tested: Per-session, per-thread, or per-IP rate limiting for `POST /api/answer/turn`; max turn count for a single thread.
- Files: `src/routes/api.answer.turn.ts`, `convex/answerThreads.ts`, `tests/unit/answer-thread/answer-thread-port.test.ts`
- Risk: Anonymous traffic can create unbounded answer thread rows and expensive projections.
- Priority: High

**Hostile Canonical Origin Inputs:**
- What's not tested: `llms.txt`, `sitemap.xml`, `robots.txt`, UCP manifests, and discovery schema behavior when the request URL origin is not the configured public site origin.
- Files: `tests/seo/discovery-files.test.ts`, `tests/integration/discovery-route-parity.test.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`
- Risk: SEO and assistant-facing files can advertise attacker-controlled or staging origins if edge request URL handling is misconfigured.
- Priority: Medium

**Release Gate Coverage For Deploy/Provider Smokes:**
- What's not tested: `npm run test:release` does not run `test:deploy-smoke`, `test:phase2-support-smoke`, `test:provider-smoke:resend`, `test:provider-smoke:novu`, `test:provider-smoke:autumn-stripe`, or `test:provider-smoke:business-action-stripe`.
- Files: `package.json:14`, `package.json:24`, `package.json:25`, `package.json:26`, `package.json:27`, `package.json:28`, `package.json:29`, `tests/deploy-smoke/**`
- Risk: Local release can pass without deployed inquiry, notification, billing, or Stripe evidence.
- Priority: Medium

**Semantic Lint/A11y Static Rules:**
- What's not tested: General ESLint-style rules for React hooks, JSX accessibility, unused exports, and formatter consistency.
- Files: `package.json`, `src/lib/ui/contract-scans.ts`, `tests/imports/ts-standards.test.ts`, `tests/ui-contract/class-scan.test.ts`
- Risk: Custom scanner tests catch AE-specific violations but miss broader React/TypeScript issues.
- Priority: Low

---

*Concerns audit: 2026-06-30*
