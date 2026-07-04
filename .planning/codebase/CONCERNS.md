# Codebase Concerns

**Analysis Date:** 2026-07-04

## Tech Debt

**Broad Convex source-state adapters:**
- Issue: Several Convex functions load whole domain slices with `.collect()` and then hand large in-memory source-state objects to pure module code.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/billingStore.ts`, `convex/business.ts`, `convex/security.ts`, `convex/observability.ts`
- Impact: New tables and workflows increase read sets, write-conflict surface, private-data blast radius, and Convex transaction-limit risk.
- Fix approach: Keep the pure domain modules, but replace broad loaders with indexed slice loaders by business, owner, thread, operation key, or dispatch id; use pagination for admin readbacks.

**Astryx migration has a live legacy presentation layer:**
- Issue: `DESIGN.md` requires Astryx-first UI and no new bespoke `Ae*` presentation components, while active routes still rely on `src/components/ae/**` and unlayered legacy CSS.
- Files: `DESIGN.md`, `src/components/ae/**`, `src/styles/globals.css`, `src/styles/legacy.css`, `src/styles/tokens.css`, `src/styles/base.css`, `src/routes/$slug.tsx`, `src/routes/claim.tsx`, `src/routes/owner.inquiries.tsx`
- Impact: UI work can extend the retired Daylight-era component/token system, and legacy CSS can override Astryx defaults globally.
- Fix approach: Move route surfaces to `@astryxdesign/core` primitives and neutral theme patterns, keep any remaining `Ae*` modules behavior-only, then remove the legacy CSS imports.

**Duplicated local E2E auth bypass logic:**
- Issue: Server modules read `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` directly instead of using one production-refusing helper.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/storefront/storefront.functions.ts`, `src/routes/api.storefront.import-draft.ts`
- Impact: The bypass is safe only while all production entrypoints run the top-level guards; duplicated checks are easy to miss in new server functions, route loaders, or tests.
- Fix approach: Centralize a server-only `isLocalE2EAuthBypassEnabled()` helper that refuses production and replace every direct env check with it.

**Large mixed-responsibility modules:**
- Issue: Several files combine adapter IO, source-state loading, validation, serialization, command orchestration, and policy decisions.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/businessActions.ts`, `convex/businessActionStore.ts`, `convex/notificationOutbox.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/discovery/developer-discovery.ts`, `src/modules/billing/internal/operations.ts`
- Impact: Reviews span too many concerns at once, and small behavioral changes can accidentally touch auth, persistence, policy, and public DTOs in one file.
- Fix approach: Split adapter loaders, DTO serializers, policy predicates, and pure commands into smaller modules while preserving existing public action boundaries.

**Parked future-phase routes are importable code:**
- Issue: Future-phase route files re-export active route behavior through a helper instead of staying purely inert documentation.
- Files: `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `src/future-phases/route-helpers.ts`, `tests/unit/server/server-seams.test.ts`
- Impact: Parked code can drift from active routes, and tests can create accidental dependencies on non-shipping future paths.
- Fix approach: Keep future-phase route files as static plans or delete them when the phase lands; tests should import active route modules directly.

## Known Bugs

**Expired source-write nonces are never purged:**
- Symptoms: `sourceWriteNonces` rows include `expiresAt`, and the schema says replay ledger rows are retained only until expiry, but no cleanup mutation or cron removes expired rows.
- Files: `src/modules/security/internal/schema.ts`, `convex/sourceWriteAdmission.ts`, `convex/crons.ts`
- Trigger: Any source-write protected mutation or agent write that consumes a nonce adds replay-ledger data.
- Workaround: Not detected.
- Fix approach: Add an internal cleanup mutation that scans `sourceWriteNonces.by_expiresAt` in batches and schedule it from `convex/crons.ts`.

**Security spec does not match the storefront import fetch path:**
- Symptoms: `.planning/SECURITY-SPEC.md` states there is no server-side fetch of owner-supplied URLs, while the active storefront import route fetches owner-provided websites behind an SSRF guard.
- Files: `.planning/SECURITY-SPEC.md`, `src/routes/api.storefront.import-draft.ts`, `src/modules/storefront/internal/import-draft.ts`, `src/modules/storefront/internal/network-guard.ts`
- Trigger: Owner storefront draft import requests that include `websiteUrl`.
- Workaround: The implementation has URL parsing, DNS/public-IP checks, guarded lookup, redirect limits, timeout, byte cap, and content-type checks in `src/modules/storefront/internal/network-guard.ts`.
- Fix approach: Update the security spec and threat model to describe the live fetch surface, then add a drift test that fails when fetch-capable routes lack SSRF documentation and tests.

## Security Considerations

**Agent tools endpoint reads request bodies before enforcing size caps:**
- Risk: `POST /api/agent/tools` reads `request.text()` and computes a digest before schema/domain validation, and `inquiry.submit` action input does not enforce zod max lengths for body or contact fields at the route boundary.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`
- Current mitigation: The route requires JSON, write tools require source-write admission, domain commands cap inquiry body length, and Convex inquiry abuse buckets rate-limit accepted submissions.
- Recommendations: Enforce a byte cap before reading/hashing the request body, add zod max lengths for inquiry body and contact fields, and reject overlong payloads before invoking Convex.

**CSP is telemetry-first by default:**
- Risk: The security header helper defaults CSP to report-only unless `AE_CSP_REPORT_ONLY` disables report-only mode, and the policy allows `'unsafe-inline'` for scripts and styles.
- Files: `src/lib/http/security-headers.ts`, `src/start.ts`
- Current mitigation: Static headers include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, referrer policy, permissions policy, and optional CSP reporting.
- Recommendations: Make production CSP enforcement the default, move inline script/style requirements to nonces or hashes, and keep report-only mode only for explicit rollout windows.

**Storefront import SSRF surface needs continuous hardening:**
- Risk: Owner-supplied URL fetches are high-impact if URL parsing, DNS rebinding protection, redirect handling, or private-IP checks regress.
- Files: `src/routes/api.storefront.import-draft.ts`, `src/modules/storefront/internal/import-draft.ts`, `src/modules/storefront/internal/network-guard.ts`, `src/modules/storefront/storefront.functions.ts`
- Current mitigation: The route requires owner auth outside local E2E mode, validates URL protocol, blocks private/special host ranges, performs guarded DNS lookup, caps redirects, caps body bytes, enforces timeout, and accepts HTML content only.
- Recommendations: Keep SSRF guard tests close to `src/modules/storefront/internal/network-guard.ts`, log denied reasons without leaking target details, and keep all owner URL fetches behind the same guard module.

**Auth bypass env var is server-critical but client-named:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is a `VITE_` variable even where it controls server-side auth behavior, which makes its intended scope easy to misunderstand.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/storefront/storefront.functions.ts`
- Current mitigation: `src/start.ts` and `src/routes/__root.tsx` throw when the flag is enabled in production.
- Recommendations: Move server-side bypass checks to a non-`VITE_` environment variable and expose client test state separately if the UI needs it.

## Performance Bottlenecks

**Owner inquiry reads scan broad private inquiry state:**
- Problem: Owner inbox, thread reads, and write flows hydrate broad inquiry source state before filtering to the current owner or thread.
- Files: `convex/inquiries.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`
- Cause: `loadInquirySourceState` collects inquiry threads, messages, notifications, privacy tombstones, abuse buckets, operation keys, and related catalog data as a single domain snapshot.
- Improvement path: Load owner inbox slices by owner business ids, load threads by thread id plus owner authorization, and keep admin/system readbacks on paginated paths.

**Public registry lookup performs bounded N+1 hydration:**
- Problem: Public registry list/detail paths hydrate context, services, capabilities, suppression state, index status, and discovery attempts per business.
- Files: `convex/registry.ts`, `src/modules/registry/registry.actions.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/api.businesses.search.ts`
- Cause: `readPublicCatalogLookup` builds each public listing by running multiple per-business queries rather than reading a denormalized projection.
- Improvement path: Treat `registryProjectionItems` or `registrySearchDocuments` as the primary public read model and update it from write paths; keep direct hydration for admin diagnostics.

**Discovery file generation scans the whole public catalog:**
- Problem: Discovery/assistant-oriented catalog generation collects all published businesses and sorts full catalog data in memory.
- Files: `convex/discovery.ts`, `src/modules/discovery/internal/discovery-files.ts`, `src/routes/llms.txt.ts`
- Cause: The discovery read path favors complete in-memory readback over paginated or pre-rendered output.
- Improvement path: Generate cached discovery artifacts from projection tables, invalidate by digest, and paginate internal rebuild jobs.

**Billing operation lookup uses broad table scans:**
- Problem: Billing store helpers collect all businesses or all billing operations and then filter in memory.
- Files: `convex/billingStore.ts`, `src/modules/billing/internal/operations.ts`
- Cause: Billing slices are loaded as arrays instead of by owner or operation id indexes.
- Improvement path: Add indexed Convex queries for owner billing state and operation id lookup before expanding paid activation flows.

## Fragile Areas

**Action registration and surface exposure are manual:**
- Files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/storefront/storefront.actions.ts`, `src/routes/api.agent.tools.ts`
- Why fragile: New operations must be registered once and assigned the right `surfaces`; an incorrect `agentTools` surface can expose a write or internal action beyond the safe assistant contract.
- Safe modification: Add or change operations only in `<module>/<module>.actions.ts`, register them in `src/modules/actions/index.ts`, and add tests that assert the `/api/agent/tools` allowlist contains only read/compare/detail plus qualified inquiry submission.
- Test coverage: Surface and copy tests exist, but action registration needs a direct allowlist assertion for agent-callable tools.

**Source-write admission spans server routes, Convex nonces, and action execution:**
- Files: `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `src/routes/api.agent.tools.ts`, `src/modules/inquiries/inquiry.functions.ts`, `convex/protectedActionStore.ts`, `convex/businessActionStore.ts`
- Why fragile: Request binding, body digesting, nonce consumption, stale admission checks, and Convex mutation admission are distributed across multiple modules.
- Safe modification: Treat source-write changes as security-sensitive and update replay, stale-token, wrong-tool, wrong-path, and wrong-body tests together.
- Test coverage: Admission behavior has focused tests, but nonce retention cleanup and oversized body handling are uncovered.

**Generated route tree is large and committed:**
- Files: `src/routeTree.gen.ts`, `src/routes/**`, `package.json`
- Why fragile: Route changes depend on generated output staying in sync with source routes, and the generated file is large enough to hide unrelated churn.
- Safe modification: Run the route generation command after route changes and review `src/routeTree.gen.ts` as generated output only.
- Test coverage: Server route seam tests cover selected routes, but there is no simple generated-route freshness gate.

**Trust contract vocabulary is split across product docs, actions, DTOs, and copy tests:**
- Files: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `src/modules/inquiries/internal/policy.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/registry/registry.actions.ts`, `tests/unit/copy/copy-guard.test.ts`
- Why fragile: AE must describe reading, comparison, routing, and qualified inquiry submission without implying booking, charging, dispatch, or autonomous fulfillment; future copy/action changes can violate that boundary.
- Safe modification: Keep action `summary` and `boundaries` explicit, run copy guard tests for public surfaces, and review DTO enum names before exposing them to human UI.
- Test coverage: Copy guards exist, but new JSON/action DTOs need explicit boundary assertions when they become public or agent-callable.

## Scaling Limits

**Convex transaction and read-size ceilings constrain current loaders:**
- Current capacity: Registry search caps public search output, inquiry abuse buckets cap accepted submissions per business/service, and most public lists are bounded at the route/action layer.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/internal/schema.ts`
- Limit: Broad `.collect()` loaders and per-business hydration hit Convex document, byte, and transaction-time limits as the catalog, inquiry history, audit events, and outbox rows grow.
- Scaling path: Replace whole-table loaders with indexed query helpers, materialize public projections, and add pagination to owner/admin read models.

**Append-only operational tables have limited retention controls:**
- Current capacity: Abuse buckets have cleanup crons, while replay, audit, funnel, notification, and operation-key style data mostly accumulate.
- Files: `convex/crons.ts`, `convex/sourceWriteAdmission.ts`, `convex/source_state.ts`, `convex/notificationOutbox.ts`, `convex/inquiries.ts`, `convex/protectedActionStore.ts`, `convex/businessActionStore.ts`
- Limit: Long-lived operational rows increase storage costs and make broad source-state loaders slower.
- Scaling path: Define retention by table class, add batched cleanup mutations, and keep audit-retention exceptions explicit.

**Agent/public JSON endpoints have no explicit platform-wide payload budget:**
- Current capacity: Domain policy caps inquiry body length, and storefront import caps fetched remote bytes.
- Files: `src/routes/api.agent.tools.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/storefront/internal/network-guard.ts`
- Limit: Large request bodies, query strings, or response payloads can consume server memory before domain limits apply.
- Scaling path: Define per-route request and response budgets, enforce them before parsing, and test large rejected payloads.

## Dependencies at Risk

**Fast-moving app runtime stack:**
- Risk: The app depends on recent TanStack Start, React, Vite, TypeScript, Nitro, and Vinxi packages where routing, server functions, middleware, and build behavior can change under upgrades.
- Impact: Route generation, server function execution, security headers, SSR behavior, and test harness behavior can break together.
- Files: `package.json`, `vite.config.ts`, `app.config.ts`, `src/start.ts`, `src/routeTree.gen.ts`
- Migration plan: Pin runtime upgrades to dedicated maintenance phases, run `test:all`, route generation, server seam tests, and an owner/agent API smoke suite before merging.

**Astryx 0.1.x is still integrated alongside local legacy UI:**
- Risk: The design-system dependency is early-versioned while the app still carries legacy `Ae*` components and Daylight-era CSS shims.
- Impact: Astryx API churn can force UI changes across routes that have not fully migrated, and local CSS can mask component regressions.
- Files: `package.json`, `src/components/astryx/**`, `src/components/ae/**`, `src/styles/legacy.css`, `src/styles/tokens.css`
- Migration plan: Route all new UI through Astryx adapters, avoid extending `src/components/ae/**`, and remove legacy CSS imports as each route migrates.

**Convex schema and generated files require disciplined regeneration:**
- Risk: Convex functions rely on generated API/data-model files and guidelines that must stay aligned with schema changes.
- Impact: Schema/type drift can surface as runtime failures or stale generated imports in server functions.
- Files: `convex/schema.ts`, `convex/_generated/**`, `convex/_generated/ai/guidelines.md`, `package.json`
- Migration plan: Regenerate Convex files after schema/function changes, read `convex/_generated/ai/guidelines.md` before Convex work, and keep generated output review separate from hand-written logic.

## Missing Critical Features

**No source-write nonce retention job:**
- Problem: Replay nonce storage has an expiry field and index but no scheduled cleanup.
- Blocks: Long-running production use without manual data maintenance.
- Files: `src/modules/security/internal/schema.ts`, `convex/sourceWriteAdmission.ts`, `convex/crons.ts`

**No centralized production-safe local bypass helper:**
- Problem: Local E2E auth bypass checks are repeated across server modules and routes.
- Blocks: Confident addition of new owner/admin/server functions that need test auth bypasses.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/storefront/storefront.functions.ts`

**No current SSRF threat-model entry for storefront import:**
- Problem: Active owner URL fetching is guarded in code but not represented in the current security spec.
- Blocks: Reliable security review of future import/fetch features.
- Files: `.planning/SECURITY-SPEC.md`, `src/routes/api.storefront.import-draft.ts`, `src/modules/storefront/internal/network-guard.ts`

**No measured Convex performance budgets for hot paths:**
- Problem: Broad source-state loaders and public catalog hydration have no documented query/read budgets.
- Blocks: Knowing when catalog, inquiry, outbox, or owner surfaces cross safe operational limits.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`

## Test Coverage Gaps

**Source-write nonce cleanup:**
- What's not tested: Expired `sourceWriteNonces` cleanup by `expiresAt`, including batching and preserving unexpired nonce rows.
- Files: `convex/sourceWriteAdmission.ts`, `src/modules/security/internal/schema.ts`, `convex/crons.ts`
- Risk: Replay ledger data accumulates unnoticed.
- Priority: High

**Oversized agent tool payloads:**
- What's not tested: Oversized JSON body rejection before `request.text()` digesting and oversized contact fields for `inquiry.submit`.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/internal/commands.ts`
- Risk: Public agent endpoint can consume avoidable memory and CPU before domain validation rejects input.
- Priority: High

**Convex loader volume behavior:**
- What's not tested: Public registry, owner inquiry, notification outbox, billing, and discovery functions under large table sizes.
- Files: `convex/source_state.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/notificationOutbox.ts`, `convex/billingStore.ts`
- Risk: Convex limits or latency regressions appear only after production data grows.
- Priority: High

**Local E2E bypass centralization:**
- What's not tested: Every server-side bypass path refusing production independently of app startup order.
- Files: `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/storefront/storefront.functions.ts`
- Risk: A new server entrypoint can accidentally honor test bypass configuration outside the intended environment.
- Priority: Medium

**Security-spec drift for URL fetch surfaces:**
- What's not tested: Any route that performs server-side fetches of user/owner-supplied URLs must use the shared SSRF guard and be represented in `.planning/SECURITY-SPEC.md`.
- Files: `.planning/SECURITY-SPEC.md`, `src/routes/api.storefront.import-draft.ts`, `src/modules/storefront/internal/network-guard.ts`
- Risk: New fetch features can bypass threat-model review or duplicate incomplete SSRF protections.
- Priority: Medium

---

*Concerns audit: 2026-07-04*
