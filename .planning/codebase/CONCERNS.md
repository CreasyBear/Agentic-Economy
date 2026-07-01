# Codebase Concerns

**Analysis Date:** 2026-07-01

## Tech Debt

**Convex source-state snapshot persistence:**
- Issue: Several Convex entry points load broad source-state snapshots, run pure domain logic in memory, then persist by scanning/upserting rows. `convex/source_state.ts:119` loads 24 tables for Phase 1 state; `convex/source_state.ts:253` scans the target table for every upsert. `convex/inquiries.ts:1182` loads inquiry state across businesses, services, threads, messages, notifications, audits, operation keys, and support records; `convex/inquiries.ts:1389` scans whole tables for upserts.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/registry.ts`, `convex/observability.ts`
- Impact: Reads and writes grow with table size instead of request scope. Convex transaction limits, write conflicts, and response time degrade as catalog, inquiry, billing, audit, and rate-limit tables grow.
- Fix approach: Replace full-state loaders with slice loaders that use existing schema indexes. Use `withIndex(...).unique()`, `.first()`, `.take(n)`, or pagination before mapping domain state. Replace generic upsert scans with indexed lookups such as the pattern in `convex/businessActionStore.ts:955`.

**Convex runtime type erasure:**
- Issue: Convex code casts `ctx.db` into custom `RuntimeDb` / `RuntimeDocument` records and then recovers fields through `stringField`, `numberField`, and literal fallbacks. `convex/source_state.ts:31` exposes `runtimeDb`; `convex/authz.ts:8` defines `RuntimeDocument`; `convex/inquiries.ts:1402` and `convex/billingStore.ts:260` convert raw records into domain records.
- Files: `convex/source_state.ts`, `convex/authz.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, `convex/businessActionStore.ts`, `convex/protectedActionStore.ts`
- Impact: Schema drift can silently convert missing fields to `''`, `0`, or a default literal. Errors may surface far from the read point through `brandNonEmpty` or through wrong readbacks.
- Fix approach: Prefer generated Convex table types (`Doc<"table">`, `Id<"table">`) for direct Convex code. Where module-state conversion is required, make converters fail explicitly with typed result errors instead of defaulting required fields.

**Convex lint guardrails are not configured:**
- Issue: The repo has no root ESLint, Biome, or Prettier config, and `package.json` does not include `@convex-dev/eslint-plugin`. The installed Convex guidance calls for rules that catch missing validators, wrong runtime imports, old function syntax, and missing table ids.
- Files: `package.json`, `convex/_generated/ai/guidelines.md`, `vitest.config.ts`
- Impact: Important Convex correctness rules are enforced by review and tests rather than a local lint command. New Convex code can introduce public functions, missing return validators, or unbounded query patterns without a fast static failure.
- Fix approach: Add a repo lint command with `@convex-dev/eslint-plugin` and keep the existing import/copy tests as semantic guardrails.

**Module boundary drift in answer code:**
- Issue: `answer-thread` imports private `answer/internal` files instead of the `answer` public seam. `npm run test:imports` reports violations at `src/modules/answer-thread/internal/public-projection.ts:1`, `src/modules/answer-thread/internal/public-projection.ts:6`, and `src/modules/answer-thread/internal/turn-orchestrator.ts:31`.
- Files: `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/public.ts`, `tests/imports/private-imports.test.ts`
- Impact: The answer and answer-thread modules are coupled across private implementation boundaries, so internal refactors can break saved-thread projection and turn orchestration.
- Fix approach: Export the required helpers from `src/modules/answer/public.ts` or move shared helpers to a neutral public module, then import only through public seams.

## Known Bugs

**Import contract test failure:**
- Symptoms: `npm run test:imports` fails in `tests/imports/private-imports.test.ts:18` with three `module-private-import` violations.
- Files: `tests/imports/private-imports.test.ts`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Trigger: Run `npm run test:imports`.
- Workaround: Run targeted tests that do not include `tests/imports/private-imports.test.ts`, or temporarily keep the private imports while refactoring the answer public seam.

**Agent-tools exposure contract mismatch:**
- Symptoms: `AGENTS.md:38` lists only `inquiry.submit` as assistant-exposed, while code exposes `registry.search` and `registry.detail` on the `agentTools` surface at `src/modules/registry/registry.actions.ts:106` and `src/modules/registry/registry.actions.ts:132`. Tests assert the broader surface in `tests/unit/actions/registry.test.ts:29`.
- Files: `AGENTS.md`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `tests/unit/actions/registry.test.ts`
- Trigger: `GET /api/agent/tools` calls `listAgentToolActions()` from `src/modules/actions/index.ts:45`.
- Workaround: Treat `registry.search` and `registry.detail` as read-only assistant tools until the product contract is reconciled.

**Legacy answer endpoint is an unavailable surface:**
- Symptoms: `GET /api/answer` returns `{ kind: "error", code: "answer_unavailable" }` with status 503; the streaming branch emits the same error. Tests assert this behavior in `tests/integration/answer-route.test.ts`.
- Files: `src/routes/api.answer.ts`, `src/routes/api.answer.turn.ts`, `tests/integration/answer-route.test.ts`
- Trigger: Request `GET /api/answer?q=...` or `GET /api/answer?q=...&stream=1`.
- Workaround: Use `POST /api/answer/turn`, which is the live answer surface in `src/routes/api.answer.turn.ts`.

## Security Considerations

**Answer rate limits are soft process-local controls:**
- Risk: Answer turn, follow-up chip, and legacy answer rate limits are module-level arrays/maps. `src/modules/answer-thread/internal/turn-guard.ts:12` through `src/modules/answer-thread/internal/turn-guard.ts:15` store buckets in memory, and `src/modules/answer-thread/internal/session-cookie.ts:24` trusts a client-provided `ae_session` cookie when present.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/answer-thread/internal/session-cookie.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.answer.follow-up-chips.ts`
- Current mitigation: Per-thread access is checked against persisted thread ownership in `src/modules/answer-thread/internal/turn-guard.ts:101`, and threads are capped at `ANSWER_TURN_MAX_PER_THREAD`.
- Recommendations: Store answer abuse buckets in Convex or edge storage, sign or rotate the session identifier, and include IP/user-agent coarse keys where appropriate.

**Public inquiry writes depend on source-write admission plus coarse abuse buckets:**
- Risk: `POST /api/agent/tools` can invoke `inquiry.submit` as an external write; `src/routes/api.agent.tools.ts:68` builds request context and `src/modules/inquiries/inquiry.functions.ts:734` signs a source-write admission server-side. Abuse control is keyed by business/service, not by IP or authenticated actor.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`
- Current mitigation: `src/modules/inquiries/internal/commands.ts:287` enforces body length, `src/modules/inquiries/internal/commands.ts:291` validates contact channels, and `src/modules/inquiries/internal/commands.ts:320` enforces `abuseMaxSubmissionsPerWindow`.
- Recommendations: Add a durable caller-level abuse dimension for public agent writes and add a cleanup path for expired inquiry abuse buckets.

**Shared dispatch bearer comparison is direct string equality:**
- Risk: Notification dispatch endpoints compare `Authorization` directly to a server secret. The secret is required, but direct string equality is not a constant-time comparison.
- Files: `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/lib/server/notification-provider.ts`
- Current mitigation: Dispatch routes require `AE_NOTIFICATION_OUTBOX_SECRET`; provider webhooks verify signed payloads in `src/lib/server/notification-provider.ts:446` and billing/Stripe webhook routes verify signatures.
- Recommendations: Use constant-time comparison for bearer secrets and keep error bodies generic for invalid dispatch authentication.

**Local secret files exist in the workspace:**
- Risk: Secret-bearing environment files are present and must not be read, copied, or committed.
- Files: `.env`, `.env.local`, `.env.example`, `.gitignore`
- Current mitigation: Contents are not needed for codebase mapping. Source-write code rejects a client-exposed source write secret in `src/lib/server/source-write-admission.ts:66`.
- Recommendations: Keep environment files ignored, keep scans configured to exclude `.env*`, and document only variable names from non-secret docs when needed.

## Performance Bottlenecks

**Registry list/search rebuilds full public catalog state before slicing:**
- Problem: Public catalog listing and search collect all published businesses and lookup tables before pagination. `convex/registry.ts:366` reads published businesses, `convex/registry.ts:395` through `convex/registry.ts:405` collect contexts, services, capabilities, suppressions, index status, and discovery attempts.
- Files: `convex/registry.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/internal/schema.ts`
- Cause: `paginateCatalogs` slices after full in-memory catalog construction at `convex/registry.ts:568`.
- Improvement path: Page from indexed `businesses.by_publicStatus_slug`, hydrate only page business ids, and query lookup tables by business id or denormalized projection documents.

**Meili search hydration has an N+1 Convex fallback path:**
- Problem: Meili hits are hydrated one slug at a time. `src/modules/registry/registry.functions.ts:178` loops over hits and calls `sourcePort.detail()` for each slug; Convex detail loads all public catalogs in `convex/registry.ts:229`.
- Files: `src/modules/registry/registry.functions.ts`, `convex/registry.ts`, `src/modules/registry/internal/catalog-search-port.ts`
- Cause: The search index stores enough identifiers for hits, but hydration routes every hit through the public detail query.
- Improvement path: Add a batch detail query by slug or persist a public catalog projection keyed by slug for direct hydration.

**Billing and inquiry owner/admin readbacks scan broad tables:**
- Problem: `convex/billingStore.ts:23` scans `businesses` to find owner businesses, `convex/billingStore.ts:236` collects billing tables for selected business ids, and `convex/inquiries.ts:1182` loads all inquiry source-state rows for owner reads and writes.
- Files: `convex/billingStore.ts`, `convex/billing.ts`, `convex/inquiries.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/billing/internal/schema.ts`
- Cause: Domain source-state shape is loaded before filtering by owner/thread/business in several paths.
- Improvement path: Use existing indexes such as `inquiryThreads.by_owner_updatedAt`, `inquiryMessages.by_thread_createdAt`, `billingOperations.by_business_status`, and `billingOffers.by_business_status` for scoped loaders.

**Rate-limit bucket tables grow without cleanup:**
- Problem: `rateLimitClaim` creates one bucket per scope/key/window in `src/modules/security/internal/duplicates.ts:33`, and no cleanup path deletes expired `abuseRateLimitBuckets` or `inquiryAbuseBuckets`.
- Files: `src/modules/security/internal/duplicates.ts`, `src/modules/security/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `convex/inquiries.ts`
- Cause: Buckets have `resetAt` indexes, but no cron or batch mutation removes expired rows.
- Improvement path: Add Convex cron/batch cleanup for buckets where `resetAt` is older than a retention window; use `by_state_resetAt` / `by_scope_key_window` indexes.

## Fragile Areas

**Large files concentrate multiple responsibilities:**
- Files: `convex/inquiries.ts` (2389 lines), `src/modules/protected-action/internal/contact-follow-up.ts` (1797 lines), `src/modules/discovery/developer-discovery.ts` (1531 lines), `convex/discovery.ts` (1472 lines), `convex/businessActionStore.ts` (1377 lines), `src/modules/billing/internal/operations.ts` (1341 lines), `convex/notificationOutbox.ts` (1340 lines), `src/modules/answer-thread/internal/turn-orchestrator.ts` (1265 lines), `convex/catalog.ts` (1181 lines), `convex/registry.ts` (1164 lines)
- Why fragile: Route adapters, storage conversion, authorization, provider readback, audit/event emission, and projection logic often share a file.
- Safe modification: Split by stable seams: validators, scoped loaders, persistence, readback serializers, and domain commands. Keep public module exports stable while moving private helpers.
- Test coverage: Unit and integration coverage is broad, but import contract failure shows boundary tests detect real drift.

**Non-production registry fallback can mask source failures:**
- Files: `src/modules/registry/registry.functions.ts`
- Why fragile: `queryRegistryWithLegacyFallback` falls back to legacy in-memory registry state outside production at `src/modules/registry/registry.functions.ts:314`. This supports local E2E but can hide Convex readback failures during development.
- Safe modification: Keep the fallback only behind explicit local E2E mode or add tests that run with fallback disabled.
- Test coverage: `tests/unit/server/source-readback-truth.test.ts` covers source-readback seams, but `npm run test:imports` fails before the full import contract suite is clean.

**Generated route tree is large and easy to churn:**
- Files: `src/routeTree.gen.ts`, `src/routes/*`
- Why fragile: `src/routeTree.gen.ts` is generated and large, so route edits can create unrelated diff noise or stale route references if generation is skipped.
- Safe modification: Do not hand-edit `src/routeTree.gen.ts`; let TanStack generation update it as part of route changes.
- Test coverage: Route contract tests in `tests/imports/route-boundary.test.ts` pass inside `npm run test:imports`.

**Process-local test seams are exported from production modules:**
- Files: `src/modules/registry/registry.functions.ts`, `src/modules/discovery/discovery.functions.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`
- Why fragile: `set*ForTests` setters mutate module-level ports. They are useful for Vitest, but accidental use in app code changes runtime behavior globally within a process.
- Safe modification: Keep setters out of route/component imports; enforce usage only from tests with import scans or naming conventions.
- Test coverage: Existing tests use these seams heavily; no scan specifically prevents `set*ForTests` imports outside `tests/`.

## Scaling Limits

**Convex transaction size:**
- Current capacity: Not measured in repo. Many read/write paths are O(table-size), including `convex/source_state.ts:119`, `convex/inquiries.ts:1182`, and `convex/registry.ts:395`.
- Limit: Convex transaction read/write limits and latency become the first bottleneck as tables grow.
- Scaling path: Convert to indexed scoped loaders and batch/cron workers for broad maintenance work.

**Answer interactions:**
- Current capacity: `ANSWER_TURN_RATE_LIMIT` is 30 per session per hour, `ANSWER_STREAM_RATE_LIMIT` is 30 per session per hour, `ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT` is 60 per session per hour, and `ANSWER_TURN_MAX_PER_THREAD` is 25.
- Limit: Limits reset per server process and can be bypassed by changing the unsigned session cookie.
- Scaling path: Persist abuse counters and idempotency claims outside module memory.

**Public inquiry abuse buckets:**
- Current capacity: Default inquiry controls allow 5 submissions per abuse window in `src/modules/inquiries/internal/schema.ts:496`.
- Limit: Buckets persist by key/window without cleanup, and public agent writes are keyed to target business/service.
- Scaling path: Add cleanup plus caller-level coarse keys for public write surfaces.

**Public registry pagination:**
- Current capacity: Public limits clamp to 50 in `convex/registry.ts:582`, but records are collected before pagination.
- Limit: Page size does not bound backend work.
- Scaling path: Page using indexes first, then hydrate only the current page.

## Dependencies at Risk

**`nitro-nightly`:**
- Risk: The project depends on a dated nightly package alias, `nitro: npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`.
- Impact: Build/runtime behavior can change through nightly range resolution and may diverge from stable Nitro documentation.
- Migration plan: Pin an exact resolved nightly for reproducibility or move to a stable Nitro release when TanStack Start supports it.
- Files: `package.json`, `package-lock.json`

**Convex lint/test tooling gap:**
- Risk: Convex guidance recommends `@convex-dev/eslint-plugin` and `convex-test` with Vitest edge runtime, but repo tests run with `environment: 'node'` and no Convex ESLint dependency is configured.
- Impact: Runtime-specific Convex mistakes rely on hand-written tests and typecheck rather than official static/runtime harnesses.
- Migration plan: Add the plugin and a small `convex-test` suite for representative public mutations/queries.
- Files: `package.json`, `vitest.config.ts`, `convex/_generated/ai/guidelines.md`, `tests/unit/convex/*`

## Missing Critical Features

**Durable answer abuse controls:**
- Problem: Answer/chat throttles are process-local and session-cookie based.
- Blocks: Production-grade abuse prevention for LLM-backed answer turns.
- Files: `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/answer-thread/internal/session-cookie.ts`

**Indexed source-state slice loaders:**
- Problem: Many Convex readbacks load broad state and filter in memory.
- Blocks: Catalog, inquiry, billing, and admin surfaces scaling beyond small operational datasets.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/billingStore.ts`

**Expired bucket cleanup:**
- Problem: Rate-limit bucket rows have reset timestamps but no cleanup job.
- Blocks: Long-running deployments with bounded abuse-table size.
- Files: `src/modules/security/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `convex/inquiries.ts`

**Coverage thresholds and lint command:**
- Problem: `vitest.config.ts` has no coverage requirements, and `package.json` has no lint script.
- Blocks: Fast detection of untested branches, Convex best-practice violations, and style regressions.
- Files: `vitest.config.ts`, `package.json`

## Test Coverage Gaps

**Import contract suite is failing:**
- What's not tested: A clean module boundary baseline cannot be established while `tests/imports/private-imports.test.ts` fails.
- Files: `tests/imports/private-imports.test.ts`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Risk: New private imports can be harder to separate from existing known violations.
- Priority: High

**No Convex edge-runtime harness:**
- What's not tested: Convex functions are covered by local runtime-style unit tests, but not with `convex-test` and `edge-runtime` as recommended by installed Convex guidance.
- Files: `vitest.config.ts`, `convex/_generated/ai/guidelines.md`, `tests/unit/convex/business-actions-runtime.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`, `tests/unit/convex/notification-outbox-runtime.test.ts`
- Risk: Convex runtime differences and generated API/reference issues can escape node-environment unit tests.
- Priority: Medium

**No scale tests for full-state loaders:**
- What's not tested: Large catalog, inquiry, billing, registry, and audit table sizes are not exercised with realistic row counts.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/billingStore.ts`, `tests/unit/convex/*`
- Risk: O(table-size) query patterns and Convex transaction limits can fail only after production data growth.
- Priority: High

**No coverage threshold:**
- What's not tested: Line/branch/function coverage is not enforced by Vitest.
- Files: `vitest.config.ts`, `package.json`
- Risk: New code can land without measurable coverage even though the repo has many targeted test suites.
- Priority: Medium

---

*Concerns audit: 2026-07-01*
