# Codebase Concerns

**Analysis Date:** 2026-06-29

## Tech Debt

**Protected-action runtime standards drift:**
- Issue: `npm run test:ts-standards` fails because `convex/protectedActions.ts:231` uses `v.any()` for `redactedPayload`, which violates the project guardrail in `.planning/ENGINEERING-STANDARDS.md` and the Convex skill constraints in `.codex/skills/convex-best-practices/SKILL.md`.
- Files: `convex/protectedActions.ts`, `tests/imports/ts-standards.test.ts`, `src/lib/ui/contract-scans.ts`, `.planning/ENGINEERING-STANDARDS.md`
- Impact: `npm run test:all` is blocked even though `npm run typecheck` passes, and the protected-action audit payload accepts untyped runtime data at a security-sensitive boundary.
- Fix approach: Replace `v.any()` with an explicit redacted payload validator, add a type/contract test for the redaction shape, then rerun `npm run test:ts-standards`.

**Source-state snapshot adapters:**
- Issue: Runtime paths hydrate whole source domains into in-memory aggregate state before applying a small operation. `convex/source_state.ts` loads Phase 1 tables in bulk, and `convex/protectedActions.ts` loads all protected-action tables plus `auditEvents` for each queue/detail/decision operation.
- Files: `convex/source_state.ts`, `convex/protectedActions.ts`, `convex/business.ts`, `convex/security.ts`, `convex/observability.ts`
- Impact: Small mutations depend on broad table scans, large object mapping, and generic upsert loops. This makes correctness easier to reuse from pure modules but raises transaction size, latency, and write-conflict risk.
- Fix approach: Keep pure-domain reducers, but move Convex adapters to indexed, operation-scoped reads and writes. Load only rows for the actor, business, proposal, operation key, or correlation ID required by the command.

**Large runtime modules concentrate too many responsibilities:**
- Issue: Several files exceed 1,000 lines and mix validators, DTO conversion, authorization, persistence, state reconstruction, and error mapping.
- Files: `convex/inquiries.ts`, `src/modules/discovery/public.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/protectedActions.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`
- Impact: Changes require broad file reads, edge cases are easy to miss, and targeted tests must understand internal helper ordering.
- Fix approach: Split by stable ownership seams: Convex validators, persistence adapters, domain reducers, DTO projection, and route/server result mapping. Preserve public exports from `src/modules/*/public.ts`.

**Planning evidence drift around Phase 4:**
- Issue: `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md` records gaps for missing protected-action Convex runtime, while the current worktree contains protected-action runtime functions and server-backed routes. The verification artifact is no longer a reliable current-state source.
- Files: `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`, `convex/protectedActions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/routes/owner.actions.$proposalId.tsx`, `src/routes/admin.protected-actions.tsx`
- Impact: Planners can route work from obsolete evidence and miss the current blockers: standards failure, runtime test gaps, and synthetic receipt/provider-boundary concerns.
- Fix approach: Regenerate Phase 4 verification after standards and runtime tests are green, and mark stale verification sections as superseded only through the phase workflow.

## Known Bugs

**Privacy removal can target the default business for an unknown slug:**
- Symptoms: `src/routes/privacy.remove-business.tsx` resolves `data.slug` with `getPublicOwnerStatusReadbackBySlug(data.slug) ?? getDefaultPublicOwnerStatusReadback()`, then sends the default catalog `businessId` to `convex/security.ts`.
- Files: `src/routes/privacy.remove-business.tsx`, `src/modules/catalog/internal/owner-public-flow.ts`, `src/modules/catalog/public.ts`, `convex/security.ts`
- Trigger: Submit `/privacy/remove-business` with a slug that is not present in the local in-memory public owner state.
- Workaround: None in the route. The mutation may fail later, but the target resolution already selected a fallback business.
- Fix approach: Resolve the submitted slug through the durable public catalog query used by `src/modules/catalog/owner-claim.functions.ts`, return a typed not-found result for unknown/non-public slugs, and never fall back to `getDefaultPublicOwnerStatusReadback()` for removal requests.

**Owner status can show default public catalog data for unknown slugs:**
- Symptoms: `readOwnerStatusThroughSource` falls back to `getDefaultPublicOwnerStatusReadback()` when a slug-specific readback is missing or source access fails.
- Files: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/catalog/internal/owner-public-flow.ts`, `src/modules/catalog/public.ts`
- Trigger: Request owner/public status for an unknown slug or during source unavailability.
- Workaround: None. Callers receive a valid-looking default readback.
- Fix approach: Return a typed unavailable/not-found result, and let route components render an explicit unavailable state rather than substituting default catalog data.

**Owner queue approve/reject controls are no-op buttons:**
- Symptoms: The queue card in `src/routes/owner.actions.tsx` renders `Approve contact follow-up` and `Reject contact follow-up` buttons without handlers or form actions. The detail route has functional `useServerFn` handlers, but the queue buttons do not navigate or mutate.
- Files: `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, `src/modules/protected-action/contact-follow-up.functions.ts`
- Trigger: Open `/owner/actions` with a populated queue and click approve or reject on a card.
- Workaround: Use the `Review detail` link, then approve or reject from `/owner/actions/$proposalId`.
- Fix approach: Convert queue approve/reject controls into links to the detail route or wire them to the same server functions with confirmation, validation, and focus recovery.

**Admin detail can fabricate a missing reconstruction row:**
- Symptoms: `adminProtectedActionDetailServerToRouteReadback` returns a synthetic `contact-follow-up:missing-admin-route` reconstruction when the server result is allowed but contains no rows.
- Files: `src/routes/admin.protected-actions.$proposalId.tsx`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`
- Trigger: Request `/admin/protected-actions/$proposalId` for an allowed admin query that returns no matching row.
- Workaround: The page displays a reconstruction-shaped object rather than a distinct not-found state.
- Fix approach: Return a typed not-found/error branch from the route adapter when `result.rows[0]` is absent, and avoid constructing placeholder domain state in mounted routes.

## Security Considerations

**CSRF checks trust user-supplied Convex args:**
- Risk: `assertCsrf` accepts any non-empty equal `csrfToken`/`csrfCookie` pair or an allowed `origin`, but those values are passed as Convex function arguments. Several server seams synthesize fixed token/cookie pairs instead of validating request headers and cookies at the boundary.
- Files: `src/modules/security/internal/duplicates.ts`, `convex/inquiries.ts`, `convex/security.ts`, `convex/protectedActions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/routes/privacy.remove-business.tsx`, `tests/unit/security/csrf-rate-limit.test.ts`
- Current mitigation: `src/start.ts` installs TanStack `createCsrfMiddleware` for `serverFn` handlers, and protected owner/admin mutations also rely on Clerk/Convex identity where applicable.
- Recommendations: Keep TanStack CSRF for server functions, but do not treat browser-provided Convex args as CSRF proof for public Convex mutations. Route public writes through server functions that read same-site request evidence, or add a verifiable nonce/session binding that direct Convex callers cannot mint.

**Admin routes lack route-level `beforeLoad` guards:**
- Risk: Admin pages rely on loader/server/Convex denial readbacks, but the route definitions do not use TanStack `beforeLoad` UX guards. The Clerk skill in `.codex/skills/clerk-tanstack-patterns/SKILL.md` expects route guards plus server-side auth for protected pages.
- Files: `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/admin.protected-actions.$proposalId.tsx`, `src/start.ts`
- Current mitigation: Admin loaders call authenticated source/server functions and render denied readbacks when membership checks fail.
- Recommendations: Add shared admin `beforeLoad` guards for UX and navigation clarity, while keeping source-owned membership checks in Convex/server functions as the authorization authority.

**Local E2E bypass is exposed through a public `VITE_` flag:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` disables Clerk middleware and `ClerkProvider`, and several server seams use deterministic local fixtures when the flag is set. The protected-action server seam also falls back to local fixtures in non-production when Convex URLs are missing.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/routes/privacy.remove-business.tsx`, `src/routes/api.businesses.ts`, `src/routes/owner.inquiries.$threadId.tsx`
- Current mitigation: Existing planning docs describe the flag as command-scoped for local Playwright, and `src/modules/protected-action/contact-follow-up.functions.ts` gates automatic fixture fallback on `NODE_ENV !== 'production'`.
- Recommendations: Replace the browser-exposed `VITE_` bypass with a server-only flag for server behavior, assert that bypass flags are impossible in production/deployed hosts, and make missing Convex configuration fail closed outside explicit test commands.

**Local auth state is ignored only by local Git exclude:**
- Risk: `.auth/admin.json` and `.auth/owner.json` exist and are ignored by `.git/info/exclude`, not by committed `.gitignore`. Another checkout or CI environment can accidentally make `.auth/` visible to Git.
- Files: `.auth/admin.json`, `.auth/owner.json`, `.gitignore`, `.git/info/exclude`, `.clerk/.tmp/keyless.json`, `.env.local`, `.env.example`
- Current mitigation: `.clerk/` and `.env.*` are ignored by `.gitignore`, and `.env.example` is explicitly allowed. No secret values were read for this audit.
- Recommendations: Add `.auth/` to `.gitignore`, keep storage-state files outside the repo where possible, and review `.env.example` manually for placeholder-only values before commits.

## Performance Bottlenecks

**Public registry queries perform collect-plus-N+1 projection:**
- Problem: `listPublicBusinessCatalog`, `searchPublicBusinessCatalog`, and `getPublicBusinessCatalogBySlug` call `readPublicCatalogs`, which collects all published businesses, then queries suppression, context, services, and capabilities per business before filtering/searching in memory.
- Files: `convex/registry.ts`, `src/modules/registry/internal/search.ts`, `convex/discovery.ts`
- Cause: The current implementation favors a simple projection builder over paginated/indexed query plans.
- Improvement path: Use slug-specific indexes for detail reads, indexed search/projection rows for list/search, and precomputed public catalog projection tables for discovery and registry responses.

**Protected-action reads and writes scan complete protected-action state:**
- Problem: `loadContactFollowUpSourceState` collects every protected-action table plus `auditEvents`; `persistContactFollowUpSourceState` loops over aggregate arrays and calls generic `upsertByFields`.
- Files: `convex/protectedActions.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/protected-action/internal/schema.ts`
- Cause: The durable adapter mirrors the pure in-memory source-state shape instead of executing operation-scoped indexed reads and writes.
- Improvement path: Add proposal/owner/business/correlation indexes where needed, load only rows for the requested proposal or current owner, and persist only changed rows returned by the domain command.

**Phase 1 shared source loader is a broad transaction hotspot:**
- Problem: `loadPhaseOneSourceState` collects more than twenty tables for operations that often need a narrow subset.
- Files: `convex/source_state.ts`, `convex/business.ts`, `convex/security.ts`, `convex/observability.ts`
- Cause: Business, catalog, registry, discovery, security, and observability state share one aggregate loader.
- Improvement path: Split loaders by operation family and keep a compatibility adapter only for tests that need the full aggregate.

## Fragile Areas

**Protected-action approval records a synthetic receipt immediately:**
- Files: `convex/protectedActions.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`
- Why fragile: `approveCurrentOwnerContactFollowUp` calls the attempt path with a generated `source-receipt:<proposalId>` readback. This proves a source-owned placeholder but not an independently observed provider/internal boundary.
- Safe modification: Keep owner decision, gateway consumption, provider/internal attempt, and receipt recording as separate observable steps unless the selected action is explicitly defined as an internal outbox write. Persist a distinct proof-gap state when the downstream boundary is unavailable.
- Test coverage: Add runtime tests around approval-without-provider, proof-gap, failed downstream, retry, retry-exhausted, and no-repair paths in `tests/unit/convex/protected-actions-runtime.test.ts`.

**Server seams mix production source calls and local deterministic fixtures:**
- Files: `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/routes/privacy.remove-business.tsx`
- Why fragile: Missing configuration or bypass flags can silently switch behavior from Convex-backed data to deterministic local state, making browser tests pass while deploy/source behavior is unavailable.
- Safe modification: Make fixture mode explicit per test command, expose fixture state in test names/assertions, and return typed source-unavailable results when production-like configuration is missing.
- Test coverage: Add server seam tests proving fixture mode is impossible when `NODE_ENV=production` and proving missing Convex config does not produce public success readbacks.

**Direct route helper exports can diverge from mounted route behavior:**
- Files: `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, `src/routes/owner.actions.$proposalId.receipt.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/admin.protected-actions.$proposalId.tsx`, `tests/integration/protected-action-route-readbacks.test.ts`
- Why fragile: Integration tests call pure helper functions with injected in-memory state, while mounted routes call server functions and Convex source functions. A helper can pass while route loaders, auth, CSRF, or source mappings are broken.
- Safe modification: Keep helper tests for presentation mapping, but add server-backed route adapter tests and browser tests for the mounted paths.
- Test coverage: `tests/integration/protected-action-route-readbacks.test.ts` covers injected source state, not the mounted server/Convex read path.

## Scaling Limits

**Current capacity depends on seed/smoke-scale tables:**
- Current capacity: The registry and source-state adapters are acceptable for small local seed data and smoke fixtures.
- Limit: Full-table `collect()` calls in `convex/source_state.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, and `convex/protectedActions.ts` degrade as rows grow and can exceed Convex transaction/read limits.
- Scaling path: Build source-owned projection tables, query by indexed owner/business/proposal keys, and avoid reconstructing complete domain aggregates for list/detail views.

**Audit-event reuse can create noisy scans:**
- Current capacity: `auditEvents` is collected into multiple aggregate loaders and protected-action reconstructions.
- Limit: Audit volume grows faster than business/proposal volume, so broad audit scans become a dominant read cost and can slow admin pages.
- Scaling path: Store event family/target indexes and query `auditEvents` by proposal, business, operation, or actor in `convex/protectedActions.ts` and `convex/source_state.ts`.

## Dependencies at Risk

**Nitro nightly dependency with caret range:**
- Risk: `package.json` uses `nitro` as `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`. A nightly plus caret range can change behavior across installs.
- Impact: Build/runtime behavior for TanStack Start/Vite deployment can shift without a source change, making deploy failures hard to reproduce.
- Migration plan: Pin an exact nightly while needed, document why it is required, and move to a stable Nitro release when the upstream TanStack Start/Vite path supports it.

## Missing Critical Features

**Phase 2 deployed support/provider proof is still blocked:**
- Problem: Deployed support/provider smokes cannot close because required smoke inputs and deployed source/provider setup are missing or unverified.
- Files: `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`
- Blocks: Final Phase 2 closeout, provider dispatch proof, and claims that deployed inquiry support is ready.
- Fix approach: Configure only the required env var names in approved secret storage, prove deployed source state has a published eligible service and support row, create source-owned dispatch IDs, then run `npm run test:phase2-support-smoke`, `npm run test:provider-smoke:resend`, and `npm run test:provider-smoke:novu`.

**Phase 4 deployed protected-action proof is absent:**
- Problem: Source code has selected-action routes and runtime functions, but current evidence does not prove a deployed proposal, owner decision, gateway, attempt, receipt/proof-gap, and admin reconstruction chain.
- Files: `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`, `.planning/phases/04-owner-pending-protected-actions/04-02-owner-approved-protected-action-durable-runtime-gaps-PLAN.md`, `convex/protectedActions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`
- Blocks: Public/deployed claims for owner-approved protected actions.
- Fix approach: First restore local standards/tests, then capture non-secret deployed evidence for a real contact-follow-up proposal through owner approval/rejection and admin reconstruction.

**Request-bound CSRF for direct public Convex calls is missing:**
- Problem: Public mutations accept CSRF-like fields as args rather than deriving them from a trusted request boundary.
- Files: `convex/inquiries.ts`, `convex/security.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`, `convex/catalog.ts`, `convex/protectedActions.ts`, `src/modules/security/internal/duplicates.ts`
- Blocks: Strong same-site assurance for direct Convex clients.
- Fix approach: Funnel public writes through server functions with TanStack CSRF/request inspection or bind Convex mutations to server-issued nonce/session state.

## Test Coverage Gaps

**Protected-action durable runtime tests are missing:**
- What's not tested: The current `convex/protectedActions.ts` functions are not covered by a dedicated runtime test file for auth, proposal persistence, policy matrix, decision idempotency, gateway consumption, attempt/receipt/proof-gap/no-repair, admin reconstruction, and CSRF rejection.
- Files: `convex/protectedActions.ts`, `tests/unit/convex`, `tests/unit/protected-action`, `tests/integration/protected-action-route-readbacks.test.ts`
- Risk: The pure module can remain correct while the Convex adapter mis-maps rows, skips indexes, writes synthetic receipts incorrectly, or accepts broad payloads.
- Priority: High

**Protected-action server seam tests are missing:**
- What's not tested: `src/modules/protected-action/contact-follow-up.functions.ts` lacks focused tests for `createServerFn` validators, Convex source errors, production fixture blocking, browser admission data, retry/no-repair paths, and admin denied readbacks.
- Files: `src/modules/protected-action/contact-follow-up.functions.ts`, `tests/unit/server/server-seams.test.ts`, `tests/unit/server`
- Risk: Mounted routes can behave differently from pure helper tests and can silently fall back to local fixtures.
- Priority: High

**Protected-action browser tests do not exercise populated approve/reject flows:**
- What's not tested: `tests/e2e/protected-action-owner-flow.spec.ts` checks route presence/copy and missing-route states; `tests/e2e/a11y/protected-action-a11y.spec.ts` checks layout and disabled controls. They do not create or load a populated proposal and click approve/reject through mounted server functions.
- Files: `tests/e2e/protected-action-owner-flow.spec.ts`, `tests/e2e/a11y/protected-action-a11y.spec.ts`, `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, `src/routes/admin.protected-actions.tsx`
- Risk: UI regressions in decision submission, focus recovery, mobile layout with real data, and admin reconstruction can pass the browser suite.
- Priority: High

**CSRF tests validate the permissive token/cookie model, not request-bound protection:**
- What's not tested: Direct Convex clients that supply matching arbitrary `csrfToken`/`csrfCookie` values are not rejected; current tests assert that matching values are accepted.
- Files: `tests/unit/security/csrf-rate-limit.test.ts`, `src/modules/security/internal/duplicates.ts`, `convex/inquiries.ts`, `convex/security.ts`, `convex/protectedActions.ts`
- Risk: Public mutations can appear CSRF-protected while accepting caller-minted proof.
- Priority: High

**Deploy smoke tests are blocked by environment/source setup:**
- What's not tested: Deployed Phase 2 support records, Resend dispatch, Novu dispatch, and deployed Phase 4 protected-action readbacks.
- Files: `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`
- Risk: Local/source proof can be mistaken for deployed/provider readiness.
- Priority: High

---

*Concerns audit: 2026-06-29*
