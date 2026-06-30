# Codebase Concerns

**Analysis Date:** 2026-06-30

## Tech Debt

**Production proof depends on source-local and fail-loud boundaries:**
- Issue: Phase 2, Phase 3, Phase 5, and Phase 6 have implemented source-local or route-local proof paths, while several deployed/provider smoke proofs remain blocked or explicitly not claimed.
- Files: `.planning/STATE.md`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md`, `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
- Impact: Local tests can be green while launch-critical provider/readback proof is absent. Public/internal-alpha claims can drift ahead of deployed source state if the planning blockers are not checked before release work.
- Fix approach: Treat the deploy-smoke suite as release-gating, not optional. Configure deployed source rows and non-secret smoke refs, then require green `npm run test:phase2-support-smoke`, `npm run test:provider-smoke:resend`, `npm run test:provider-smoke:novu`, `npm run test:provider-smoke:autumn-stripe`, and `npm run test:provider-smoke:business-action-stripe` before production claims.

**Broad local E2E bypass is embedded in runtime modules:**
- Issue: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` disables Clerk middleware/provider and swaps several server source ports to deterministic local states.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/discovery/discovery.functions.ts`, `src/modules/registry/registry.functions.ts`
- Impact: The bypass is useful for deterministic browser proof, but a production or preview deployment with this flag set would bypass auth UX and serve local fixture/source states for sensitive owner/admin routes.
- Fix approach: Centralize the bypass behind one helper that throws when `NODE_ENV=production`, `VERCEL_ENV=production`, or a non-localhost host is detected. Add a startup/test assertion that production builds reject this variable.

**Business action source-write scope reuses `protected_action`:**
- Issue: Phase 6 business-action server functions use source-write scope `protected_action` instead of a dedicated business-action scope.
- Files: `src/modules/business-action/business-action.functions.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `convex/businessActions.ts`
- Impact: Audit, observability, and authorization boundaries are semantically blurred between selected protected actions and business-action receipt work. Future business-action-specific admission rules can collide with protected-action rules.
- Fix approach: Add a `business_action` source-write scope, migrate Phase 6 mutations to it, update Convex validators, and add negative tests proving `protected_action` admissions are rejected for business-action writes.

**Large domain/runtime files concentrate too much behavior:**
- Issue: Several source-owned modules combine validation, loading, persistence, readback serialization, state transitions, provider admission, and test fixtures in single files.
- Files: `convex/inquiries.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/discovery/developer-discovery.ts`, `convex/discovery.ts`, `convex/businessActionStore.ts`, `src/modules/billing/internal/operations.ts`, `convex/businessActions.ts`, `src/modules/business-action/internal/business-action.ts`
- Impact: Small behavior changes require reviewing very large files. Regression tests exist, but review cost and merge-conflict risk are high around inquiry, protected-action, discovery, billing, and business-action flows.
- Fix approach: Split by stable responsibilities without changing public seams: `load-*`, `persist-*`, `serialize-*`, `readback-*`, `admit-*`, and `fixtures-*` helpers. Keep route-facing exports in existing `public.ts` and `*.functions.ts` seams.

**Parked future-phase code lives inside runtime `src`:**
- Issue: Future billing and parked route helper modules are in `src/future-phases`, and billing tables are included in the active Convex schema even though paid-activation provider proof remains blocked.
- Files: `src/future-phases/route-helpers.ts`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `src/modules/billing/public.ts`, `src/modules/billing/internal/operations.ts`, `convex/schema.ts`, `tests/unit/billing/owner-routes.test.ts`
- Impact: Import guardrails keep these routes parked, but future-surface code can still be imported by tests or implementation and can age out of sync with real Phase 5 requirements.
- Fix approach: Keep route-tree assertions for no mounted billing routes, add a focused import scan for `src/future-phases/**` usage, and move mature Phase 5 code into active routes only when provider smokes are green.

**Unused branded landing component carries placeholder external images:**
- Issue: `src/components/ae/brand/AeLandingPage.tsx` defines `PLACEHOLDER_IMAGES` pointing at `https://picsum.photos/*`, while active routes use `src/components/ae/landing/AePublicLanding.tsx`.
- Files: `src/components/ae/brand/AeLandingPage.tsx`, `src/components/ae/landing/AePublicLanding.tsx`, `src/routes/index.tsx`, `tests/ui-contract/public-layout-contract.test.ts`
- Impact: Accidental import of the unused branded component would ship random external placeholder imagery and route around the current public landing contract.
- Fix approach: Delete or move `AeLandingPage.tsx` to a parked/design-only folder, or replace the placeholder assets with committed `public/images/*` assets and add an import guard preventing active routes from using `src/components/ae/brand/AeLandingPage.tsx`.

## Known Bugs

**Deployed Phase 2 inquiry path lacks eligible source/support state:**
- Symptoms: The repo's blocker artifact records deployed `/plumbing-demo/inquiry` and `/parramatta-emergency-plumbing/inquiry` rendering `Inquiry unavailable` / `This service page is not public` instead of the human inquiry form.
- Files: `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/inquiries/inquiry.functions.ts`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`
- Trigger: Running `npm run test:phase2-support-smoke` against a deployment whose Convex source state does not expose a published eligible service with a complete `human_inquiry_owner_inbox` support row.
- Workaround: Use local E2E bypass only for local UI evidence. Do not create final Phase 2 closeout artifacts or public inquiry claims until the deployed support smoke passes.

**Production/deployed Phase 6 Stripe proof is fail-loud, not green:**
- Symptoms: Phase 6 verification records `npm run test:provider-smoke:business-action-stripe` as expected fail-loud until deployed request/checkpoint/receipt/Stripe/support/kill-rule evidence env is supplied.
- Files: `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`
- Trigger: Running the provider smoke without deployed source-owned evidence refs and configured Stripe webhook/source-write env.
- Workaround: Keep Phase 6 as source/local proof only. Configure deployed evidence rows and rerun the smoke before claiming production provider behavior.

## Security Considerations

**Runtime auth bypass flag needs production hard-stop:**
- Risk: A single environment variable disables Clerk middleware/provider and activates deterministic local readbacks across owner/admin/source paths.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `tests/unit/server/server-seams.test.ts`, `tests/unit/server/protected-action-server-seams.test.ts`
- Current mitigation: Tests prove missing source-write secrets do not silently turn into local fixtures when the bypass is unset, and local bypass is command-scoped in planning evidence.
- Recommendations: Add a production-env assertion in `src/start.ts` and one shared `isLocalE2eBypassAllowed()` helper. Include a test that `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` with production env throws before route/server setup.

**Source-write admission safety depends on server middleware and secret hygiene:**
- Risk: Convex mutations reject missing `sourceWrite`, but accepted source-write evidence is generated by server middleware using `AE_SOURCE_WRITE_SECRET`. Misconfigured public-prefix secrets or non-serverFn mutation paths weaken this boundary.
- Files: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `src/start.ts`, `tests/unit/server/server-seams.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`, `tests/unit/convex/notification-outbox-runtime.test.ts`
- Current mitigation: `readRequiredSourceWriteSecret` rejects `VITE_AE_SOURCE_WRITE_SECRET`, `createCsrfMiddleware` is installed for server functions, Convex tests reject origin-only writes without source admission, and source-write HMACs expire.
- Recommendations: Keep source-write creation limited to server-only paths. Add an explicit deployment origin allowlist to admission creation/verification so Convex checks do not rely only on the request origin captured by the route server.

**Secrets are present locally and must stay out of generated docs:**
- Risk: `.env.local` exists and `.env.example` exists. The contents are intentionally not read for this map, and `.gitignore` ignores `.env` / `.env.*` except `.env.example`.
- Files: `.gitignore`, `.env.local`, `.env.example`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`
- Current mitigation: `.gitignore` excludes local env files, blocker docs record env var names and presence/absence only, and provider helpers read server-only names such as `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `NOVU_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `AE_SOURCE_WRITE_SECRET`.
- Recommendations: Continue writing only env var names in planning/codebase docs. Add a pre-commit or CI secret scan over `.planning/**`, `src/**`, `convex/**`, and `tests/**`.

**Discovery endpoints intentionally allow public cross-origin reads:**
- Risk: `/api/discovery/schema`, `/api/discovery/examples`, `/api/discovery/fixtures`, UCP, llms, sitemap, and robots expose public-readable metadata with `Access-Control-Allow-Origin: *`.
- Files: `src/routes/api.discovery.schema.ts`, `src/lib/http/discovery-response.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `tests/integration/discovery-routes.test.ts`, `tests/seo/discovery-files.test.ts`
- Current mitigation: Public discovery builders use allowlisted DTOs and tests reject private fields, future authority, payment, callable, MCP, OpenAPI, and API-key claims.
- Recommendations: Keep CORS only on explicitly public discovery endpoints. Add a scanner rule that admin, owner, provider, and webhook routes never set wildcard CORS.

## Performance Bottlenecks

**Registry list/search rebuilds public catalog DTOs by scanning all published businesses:**
- Problem: Public registry queries collect published businesses, then perform per-business reads for suppression, context, services, capabilities, index status, and discovery status before pagination/search filtering.
- Files: `convex/registry.ts`, `src/modules/registry/internal/search.ts`, `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `tests/integration/registry-api.test.ts`
- Cause: `readPublicCatalogs` builds DTOs on demand and `searchPublicBusinessCatalog` filters in memory. Pagination happens after the full catalog list is assembled.
- Improvement path: Use `registryProjectionItems` as the primary read model for public list/search, page from indexed projection rows, and reserve full catalog reconstruction for detail/readback paths.

**Developer discovery endpoints execute multiple route handlers per request:**
- Problem: `/api/discovery/schema`, `/api/discovery/examples`, and `/api/discovery/fixtures` build a route snapshot by invoking public list, search, detail, UCP, llms, sitemap, and robots handlers.
- Files: `src/routes/api.discovery.schema.ts`, `src/routes/api.discovery.examples.ts`, `src/routes/api.discovery.fixtures.ts`, `src/modules/discovery/developer-discovery.ts`, `tests/integration/developer-discovery.test.ts`
- Cause: Route-derived parity is computed synchronously during request handling, with only HTTP cache headers and no server-side memoization.
- Improvement path: Cache a route snapshot per deployment/source hash for a short TTL, reuse it across schema/examples/fixtures, and invalidate on catalog/discovery projection attempts.

**Notification and business-action readback reconstruction is large and synchronous:**
- Problem: Admin/operator reconstruction paths assemble many source tables into redacted readbacks on demand.
- Files: `convex/notificationOutbox.ts`, `convex/inquiries.ts`, `convex/businessActionStore.ts`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.business-actions.tsx`
- Cause: The code favors source-truth reconstruction over denormalized admin read models.
- Improvement path: Keep source truth as authority, but add bounded query filters, pagination, and precomputed redacted reconstruction rows for high-volume admin surfaces.

## Fragile Areas

**Inquiry runtime is the highest-change-risk module:**
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/route-readbacks.ts`, `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`
- Why fragile: The flow spans public submit, owner inbox, owner reply/close, delivery readback, notification dispatch binding, operator reconstruction, privacy delete/tombstone, rate limiting, and support readiness. The largest file in the repo is `convex/inquiries.ts`.
- Safe modification: Change one command/readback path at a time, add unit coverage in `tests/unit/inquiries/inquiry-flow.test.ts`, add Convex adapter coverage in `tests/unit/convex/inquiries-runtime.test.ts`, and run `npm run test:integration` for route seams.
- Test coverage: Broad local coverage exists; deployed provider smoke coverage remains blocked by `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`.

**Protected action and business-action concepts are adjacent but separate:**
- Files: `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `convex/protectedActions.ts`, `src/modules/business-action/internal/business-action.ts`, `src/modules/business-action/business-action.functions.ts`, `convex/businessActions.ts`
- Why fragile: Both domains use proposal/checkpoint/receipt/readback language, owner approval, private evidence, support records, and operator reconstruction. Phase 6 also reuses the `protected_action` source-write scope.
- Safe modification: Preserve closed slugs (`contact-follow-up`, `provision-paid-intake-endpoint`) and domain-specific tests. Avoid generic action registries or shared action DSLs unless a separate phase explicitly designs them.
- Test coverage: Strong unit/Convex coverage exists in `tests/unit/protected-action/**`, `tests/integration/protected-action-route-readbacks.test.ts`, `tests/unit/business-action/**`, and `tests/unit/convex/business-actions-runtime.test.ts`.

**Copy/claim guardrails carry product truth:**
- Files: `src/lib/ui/contract-scans.ts`, `tests/copy/claims-register.test.ts`, `tests/copy/phase6-business-action-claims.test.ts`, `.planning/PROJECT.md`, `.planning/SECURITY-SPEC.md`
- Why fragile: Public product correctness depends on scanner rules rejecting overclaims about bookings, payments, MCP/OpenAPI, protected actions, business actions, wallet/credits, Connect/x402, and autonomous execution.
- Safe modification: Add negative fixtures before relaxing any copy rule. Keep phase-owned positive claims scoped to their planning/test contexts.
- Test coverage: `npm run test:copy` and `npm run test:source-mining` cover many claim boundaries; Phase 6 copy/language gates are waived in `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md` for source/local closeout only.

**Convex schema composition is broad:**
- Files: `convex/schema.ts`, `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/protected-action/internal/schema.ts`, `convex/businessActionStore.ts`, `tests/unit/schema/convex-schema.test.ts`
- Why fragile: Many module-owned table fragments compose into one Convex schema, and tests assert exact durable table/index coverage. Schema changes can break codegen, runtime queries, and import guardrails.
- Safe modification: Add table/index tests first in `tests/unit/schema/convex-schema.test.ts`, then update module schema fragments and run `npm run check:convex-codegen`.
- Test coverage: Exact table/index tests exist; codegen requires valid Convex deployment/network configuration.

## Scaling Limits

**Public registry/search capacity is bounded by full read-model reconstruction:**
- Files: `convex/registry.ts`, `src/modules/registry/internal/search.ts`, `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`
- Current capacity: Query limits cap response page size at 50, but the implementation reads and constructs all published catalogs before applying the limit.
- Limit: A large catalog increases Convex reads and latency for `/api/businesses`, `/api/businesses/search`, `/registry`, and developer discovery route snapshots.
- Scaling path: Promote `registryProjectionItems` to a paged indexed public read model and add search-specific projection fields. Keep suppression and discovery status as indexed projection attributes.

**Admin readbacks are not yet designed for large operator queues:**
- Files: `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/admin.business-actions.tsx`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/protectedActions.ts`, `convex/businessActionStore.ts`
- Current capacity: Admin pages expose filters for one thread/proposal/request/correlation/dispatch, but unfiltered reconstruction paths can assemble broad source state.
- Limit: High volumes of inquiries, notification dispatches, protected-action proposals, business-action requests, and provider events can make admin pages slow or too large.
- Scaling path: Add cursor pagination to admin reconstruction functions and routes, require filters for high-volume provider surfaces, and precompute redacted summary rows for list pages.

**Phase readiness depends on external source data, not just code deployment:**
- Files: `.planning/STATE.md`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
- Current capacity: Local/source proof covers many flows, but provider/deploy smoke inputs and source rows are required for launch gates.
- Limit: Deployments without complete Convex source rows, support records, provider secrets, and smoke IDs render unavailable states or fail-loud smoke errors.
- Scaling path: Add seeded deployment setup/runbook scripts that create non-secret source rows and print only redacted smoke refs for `.planning` evidence.

## Dependencies at Risk

**`nitro` nightly package:**
- Risk: `package.json` uses `nitro` as `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`.
- Files: `package.json`, `package-lock.json`
- Impact: Nightly runtime changes can break TanStack Start/Vite builds or deployment output with low warning.
- Migration plan: Pin the exact nightly without `^`, or move to a stable Nitro release when TanStack Start supports it. Keep `package-lock.json` committed.

**Fast-moving TanStack Start and Clerk integration:**
- Risk: `@tanstack/react-start`, `@tanstack/react-router`, and `@clerk/tanstack-react-start` are central to routing, server functions, auth middleware, and source-write context.
- Files: `package.json`, `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/convex-source.ts`, `tests/unit/server/server-seams.test.ts`
- Impact: Middleware or server-function API changes can break CSRF, Clerk token acquisition, and source-write admission.
- Migration plan: Upgrade these packages together only with `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e:a11y`, and focused auth/source-write tests in `tests/unit/server/server-seams.test.ts`.

**Convex codegen and deployment configuration:**
- Risk: `npm run check:convex-codegen` depends on Convex CLI/deployment configuration and can fail for environment/network reasons.
- Files: `package.json`, `convex/schema.ts`, `convex/auth.config.ts`, `tests/unit/schema/convex-schema.test.ts`
- Impact: Generated API drift can remain hidden if codegen is skipped or treated as optional.
- Migration plan: Keep `check:convex-codegen` in CI with configured `CONVEX_DEPLOYMENT`/Convex env. Record infrastructure failures separately from type/schema failures.

## Missing Critical Features

**Five-owner activation evidence remains absent:**
- Problem: `.planning/STATE.md` records Phase 1 five-owner activation evidence as `0/5` deferred debt.
- Blocks: Internal-alpha and public-launch claims.
- Files: `.planning/STATE.md`, `.planning/GTM-READINESS.md`, `.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md`

**Phase 2 provider dispatch proof is absent:**
- Problem: Deployed support/provider smoke inputs for Resend and Novu are missing or not bound to inquiry-created dispatch IDs.
- Blocks: Final Phase 2 closeout, public inquiry-owner-inbox claims, and provider delivery-readback claims.
- Files: `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`

**Phase 3 deployed route/readback evidence is absent:**
- Problem: Phase 3 local verification passes, but `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md` records no deployed Phase 3 evidence artifact.
- Blocks: Deployed builder/discovery proof claims.
- Files: `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md`, `src/routes/developers.discovery.tsx`, `src/routes/api.discovery.schema.ts`, `tests/e2e/developer-discovery.spec.ts`

**Phase 5 paid activation provider proof is absent:**
- Problem: Billing modules and parked billing routes exist, but Autumn/Stripe provider proof requires deployed smoke evidence.
- Blocks: Public paid activation, checkout/subscription/customer portal, money-readback, and billing reconciliation claims.
- Files: `.planning/STATE.md`, `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`, `src/modules/billing/public.ts`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`

**Phase 6 production provider proof is absent:**
- Problem: Phase 6 source/local proof passes, but deployed signed Stripe webhook admission, receipt reconstruction, support/kill-rule state, and no-overclaim production language are not green.
- Blocks: Production autonomous business-action/payment claims.
- Files: `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`

## Test Coverage Gaps

**`npm run test:all` omits browser and deploy/provider smokes:**
- What's not tested: `test:all` does not run `npm run test:e2e`, `npm run test:e2e:a11y`, or any deploy/provider smoke command.
- Files: `package.json`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `tests/e2e/**`, `tests/deploy-smoke/**`
- Risk: A green `test:all` can miss browser regressions, accessibility regressions, missing deployed source rows, and provider-readback failures.
- Priority: High.

**Production auth-bypass guard is not fail-fast tested:**
- What's not tested: A production-like env with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` does not currently have a startup failure test.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `tests/unit/server/server-seams.test.ts`, `tests/unit/server/source-readback-truth.test.ts`
- Risk: Preview/production deployments can accidentally run with local bypass behavior.
- Priority: High.

**Registry/search scalability has no volume test:**
- What's not tested: Large catalog volumes, page latency, and query/read counts for registry list/search and developer discovery route snapshots.
- Files: `convex/registry.ts`, `src/modules/registry/internal/search.ts`, `src/routes/api.discovery.schema.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/developer-discovery.test.ts`
- Risk: Performance issues appear only after enough public catalogs exist.
- Priority: Medium.

**Admin reconstruction pagination is not covered:**
- What's not tested: Large admin/operator queues for inquiries, notification dispatches, protected actions, and business actions.
- Files: `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/admin.business-actions.tsx`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/protectedActions.ts`, `convex/businessActionStore.ts`
- Risk: Operator pages can become slow or unreadable under production event volume.
- Priority: Medium.

**Unused/placeholder landing component is not guarded against import:**
- What's not tested: Active routes importing `src/components/ae/brand/AeLandingPage.tsx` with `picsum.photos` placeholder assets.
- Files: `src/components/ae/brand/AeLandingPage.tsx`, `src/routes/index.tsx`, `tests/ui-contract/public-layout-contract.test.ts`
- Risk: Placeholder visual assets can ship through an accidental import.
- Priority: Low.

---

*Concerns audit: 2026-06-30*
