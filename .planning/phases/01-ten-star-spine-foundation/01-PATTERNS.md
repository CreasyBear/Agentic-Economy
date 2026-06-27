# Phase 01: Ten-Star Spine Foundation - Pattern Map

**Mapped:** 2026-06-27  
**Runtime state:** planning-only; no `package.json`, `apps/`, `src/`, `convex/`, or `tests/` runtime tree exists yet.  
**Clusters classified:** 16  
**Analog coverage:** 12 / 16 clusters have a current planning authority or allowed backup source-mine analog.  
**Copy rule:** backup files are evidence anchors only. Executors copy invariants, state machines, tests, and traps into fresh seams; they do not copy implementation code or folders.

## File Classification

| Planned file(s) / cluster | Role | Data flow | Source ownership | Closest analog | Match quality |
|---|---|---|---|---|---|
| `package.json`, workspace/app config, `apps/web/`, `convex/`, `src/`, `tests/` directories | config / substrate | bootstrap | source-owned fresh | `.planning/phases/01-ten-star-spine-foundation/01-RESEARCH.md:354-395`, `.planning/ENGINEERING-STANDARDS.md:267-300` | planning-authority |
| `tests/imports/*`, `tests/fixtures/bad-source-mining/*`, `tests/fixtures/bad-ts-standards/*`, `src/lib/ui/contract-scans.ts` | test / guardrail utility | batch scan | source-owned fresh | `.planning/source-mining/phase-1-ledger.md:33-70`, `.planning/ENGINEERING-STANDARDS.md:54-121,251-265`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md:333-347` | planning-authority |
| `convex/schema.ts`, `convex/_generated/*` | model / config | CRUD / indexed source state | source-owned fresh | `.planning/PROJECT.md:261-288`, `.planning/phases/01-ten-star-spine-foundation/PHASE.md:203-262` | planning-authority |
| `src/modules/business/public.ts`, `src/modules/business/internal/{claim,owner-binding,visibility}.ts`, `convex/business.ts` | module / Convex mutation/query | CRUD + request-response + state transition | source-owned fresh; backup invariant analog | `../Agentic-Economy-Backup/convex/claimPublishing.ts:49-80,88-95,97-205,260-266` | source-mine analog |
| `src/modules/catalog/public.ts`, `src/modules/catalog/internal/{public-catalog-dto,first-request}.ts`, `convex/catalog.ts` | module / DTO builder | transform + CRUD | source-owned fresh | `.planning/PROJECT.md:47-53,167-244,261-288`, `.planning/AI-SPEC.md:147-187`, `.planning/SECURITY-SPEC.md:152-183` | planning-authority |
| `src/modules/registry/public.ts`, `src/modules/registry/internal/{projection-attempts,search}.ts`, `convex/registry.ts` | module / projection/search | transform + batch + request-response | source-owned fresh; backup invariant analog | `../Agentic-Economy-Backup/src/lib/registry/README.md:7-25,43-47`, `src/lib/registry/directory/registryData.ts:29-63`, `src/lib/registry/directory/registryProjection.ts:31-52`, `src/lib/search/meilisearch.ts:178-220,226-266,284-333` | source-mine analog |
| `src/modules/discovery/public.ts`, `src/modules/discovery/internal/{ucp-manifest,llms,sitemap,robots}.ts`, `convex/discovery.ts` | module / generator | transform + file/HTTP response projection | source-owned fresh; backup invariant analog | `../Agentic-Economy-Backup/src/lib/registry/discovery/ucpManifest.ts:1-13,36-59,69-107,110-131`, `../Agentic-Economy-Backup/src/routes/$slug.ucp.ts:7-48`, `.planning/AI-SPEC.md:68-145` | source-mine analog |
| `src/modules/lifecycle/public.ts`, `src/modules/lifecycle/internal/reference-vertical.ts` | module / type contract | transform / descriptor-only | source-owned fresh; backup invariant analog | `../Agentic-Economy-Backup/src/lib/registry/lifecycle/types.ts:1-14,15-58,70-98,102-119`, `../Agentic-Economy-Backup/src/lib/registry/lifecycle/README.md:10-18,37-48` | source-mine analog |
| `src/modules/observability/public.ts`, `src/modules/observability/internal/{operation-keys,audit,funnel,operator-controls,redaction}.ts`, `convex/observability.ts` | module / infrastructure | event-driven + CRUD + batch readback | source-owned fresh | `.planning/ENGINEERING-STANDARDS.md:156-203`, `.planning/SECURITY-SPEC.md:100-150,236-240`, `.planning/GTM-READINESS.md:52-118` | planning-authority |
| `src/modules/security/public.ts`, `src/modules/security/internal/{csrf,rate-limit,duplicates,admin-authority,disputes}.ts`, `convex/security.ts` | module / guard | request-response + CRUD + event-driven audit | source-owned fresh; backup invariant analog | `../Agentic-Economy-Backup/convex/adminMemberships.ts:1-40,103-206,208-245,264-323`, `../Agentic-Economy-Backup/convex/adminGuards.ts:1-57`, `.planning/SECURITY-SPEC.md:46-98,185-234` | source-mine analog |
| `src/modules/seo/public.ts`, `src/modules/seo/internal/{public-business-seo,json-ld}.ts` | module / metadata builder | transform | source-owned fresh; backup invariant analog | `../Agentic-Economy-Backup/tests/seo/discovery-files.test.ts:14-190`, `../Agentic-Economy-Backup/src/lib/seo/localBusiness.ts:37-85`, `.planning/SEO-AEO-SPEC.md:5-59` | source-mine analog |
| `src/styles/{tokens,globals}.css`, `src/components/ui/*`, `src/components/ae/**/*`, `src/lib/ui/{status-presentation,copy,routes}.ts` | UI framework / components | transform + request-response render | source-owned fresh | `.planning/FRONTEND-DESIGN-FRAMEWORK.md:57-103,195-237,368-380`, `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md:53-85,163-194,264-290`, `.agents/skills/shadcn/SKILL.md:29-78` | planning-authority |
| `apps/web` routes: `/`, `/claim`, `/claim/success`, `/{slug}`, owner status/readback, `/registry`, `/privacy/remove-business`, `/admin/claims`, `/admin/index-health`, `/admin/audit-events` | route adapter / UI | request-response + form mutation | source-owned fresh | `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md:97-160,180-194`, `skill://tanstack-start-best-practices`, `skill://clerk-tanstack-patterns`, `skill://tanstack-router-best-practices` | planning-authority |
| `apps/web` API/discovery routes: `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | route adapter / public API | request-response + transform | source-owned fresh; backup header analog for UCP only | `.planning/AI-SPEC.md:15-29,147-187,188-253`, `.planning/SEO-AEO-SPEC.md:27-33,60-109`, `../Agentic-Economy-Backup/src/routes/$slug.ucp.ts:14-48` | mixed authority |
| `tests/unit/*`, `tests/integration/*`, `tests/types/*` | test | unit + integration + compile-time | source-owned fresh | `.planning/phases/01-ten-star-spine-foundation/01-RESEARCH.md:320-337,339-352`, `.planning/ENGINEERING-STANDARDS.md:88-107,267-285` | planning-authority |
| `tests/e2e/*`, `tests/e2e/a11y/*`, `tests/copy/*`, `tests/seo/*`, `tests/ui-contract/*` | test | browser / route smoke / scan | source-owned fresh; backup SEO test analog | `.planning/phases/01-ten-star-spine-foundation/01-RESEARCH.md:328-334,430-456`, `../Agentic-Economy-Backup/tests/seo/discovery-files.test.ts:14-190`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md:316-347` | mixed authority |

## Pattern Assignments

### 1. Substrate and executable gates

**Planned files:** `package.json`, app/workspace config, `apps/web/`, `convex/`, `src/modules/`, `tests/{unit,integration,e2e,e2e/a11y,types,imports,copy,seo,ui-contract,fixtures}`.

**Closest analog:** none in runtime. Use `.planning/phases/01-ten-star-spine-foundation/01-RESEARCH.md:354-395` and `.planning/ENGINEERING-STANDARDS.md:267-300`.

**Pattern constraints:**
- First slice creates only substrate and guardrails. It must not fake claim/publish/admin/discovery behavior.
- Scripts must be real and non-no-op by Phase 1 close: typecheck, Convex codegen check, unit/integration/e2e/a11y/copy/import/source-mining/types/TS standards/SEO/UI-contract/build.
- `test:ui-contract` is required even though the older standards list omits it; the frontend framework adds it before the second user-facing route.
- Package choices and exact versions are a `01-01` implementation-time registry/docs verification task; do not invent versions in plans.

**Keep:** narrow runtime scaffold; seeded bad fixtures; clean empty/minimal runtime passing scans.

**Cut traps:** compatibility shims, backup import bridges, data migrations, broad app shell with fake routes, package install/version guesses in planning, public exposure before source-owned authority.

### 2. Source-mining/import/TypeScript/copy/UI guardrails

**Planned files:** `tests/imports/private-imports.test.ts`, `route-boundary.test.ts`, `backup-imports.test.ts`, `source-mining.test.ts`, `ts-standards.test.ts`, `tests/fixtures/bad-source-mining/*`, `tests/fixtures/bad-ts-standards/*`, `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/claims-register.test.ts`, `tests/ui-contract/*`, `src/lib/ui/contract-scans.ts`.

**Closest analog:** `.planning/source-mining/phase-1-ledger.md:33-70`, `.planning/ENGINEERING-STANDARDS.md:54-121,251-265`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md:333-347`.

**Pattern constraints:**
- Runtime may never import `.planning`, backup paths, backup folders, phase-numbered runtime names, module internals across seams, provider SDKs in routes, or generated Convex document types as domain contracts.
- TS scans fail explicit `any`, `as any`, `as unknown as`, non-null assertions, `v.any()`, broad status strings, and inexact Convex return contracts in domain paths.
- Source-mining scans fail the ledger seed: backup path identifiers, `phase35`, payments/wallet/x402/Stripe, `payment_handlers`, MCP/OpenAPI/API-key, protected/callable actions, skills/request-market/hosted-agent/voice/persona/benchmark terms.
- Copy scans must distinguish machine-schema negative flags from public overclaims: literal `callable: false` and `paymentRequired: false` are allowed only in approved DTO/manifest schemas and tests; truthy/executable/payment-positive usage fails.
- UI contract scans fail raw route colors, `space-y-*`, `transition-all`, arbitrary visual tokens, route-local status colors, custom button/status/skeleton/empty lookalikes, future nav items, and route-local scroll listeners.

**Keep:** fail-first bad fixtures; one scanner per policy surface; route/import boundary tests as early substrate gates.

**Cut traps:** broad grep that bans allowed negative flags everywhere; scans that only inspect `src` and miss `apps/web`/`convex`; route-local allowlists; tests that assert current strings instead of logical overclaim categories.

### 3. Convex schema, indexes, validators, and generated types

**Planned files:** `convex/schema.ts`, Convex functions in `convex/{business,catalog,registry,discovery,security,observability}.ts`, generated Convex output after codegen.

**Closest analog:** `.planning/PROJECT.md:261-288`, `.planning/phases/01-ten-star-spine-foundation/PHASE.md:203-262`, `.planning/ENGINEERING-STANDARDS.md:145-154`.

**Pattern constraints:**
- Tables are exactly the Phase 1 durable model: owners, businesses, businessContexts, businessServices, serviceCapabilities, claims, operationKeys, registryProjectionItems, registryProjectionAttempts, indexStatus, discoveryManifests, discoveryManifestAttempts, abuseRateLimitBuckets, claimFingerprints, funnelEvents, ownerActivationState, auditEvents, operatorControls, disputes, suppressionRules, adminMemberships, adminMembershipAuditEvents.
- Required indexes from `PHASE.md:230-262` are acceptance criteria, not optional optimization.
- Convex validates every untrusted input and derives actor/admin authority inside server/Convex boundary.
- Convex public queries return allowlisted DTOs only; generated Convex docs/raw types never become route-facing domain contracts.
- Validator/source-of-truth pattern belongs to owning modules; no global `validators.ts` dumping ground.

**Keep:** source-owned state, literal unions, type tests proving validator/domain equality, indexes per public/admin query path.

**Cut traps:** money/action/request/skills/voice/agent runtime tables, `v.any()` escape hatches, duplicate literal status lists, browser-supplied owner/admin IDs, planning files as runtime authority.

### 4. Business claim, owner binding, publish eligibility, suppression

**Planned files:** `src/modules/business/public.ts`, `src/modules/business/internal/claim.ts`, `owner-binding.ts`, `visibility.ts`, `convex/business.ts`.

**Closest analog:** backup `convex/claimPublishing.ts:49-80,88-95,97-205,260-266`.

**Data flow role:** authenticated request-response mutation into Convex source state; state transition; duplicate handling; audit/idempotency dependency.

**Pattern constraints:**
- Public seam owns `BusinessId`, `OwnerId`, `Slug`, `ClaimStatus`, `PublicStatus`, `TrustTier`, `claimBusiness`, `suppressBusiness`, `isPubliclyDiscoverable`, and discriminated result unions.
- Claim/publish can succeed without ABN when required T0 facts are valid and there is at least one service row with safe first-request state.
- Owner binding is source-owned and singular active owner by normalized business identity; unresolved duplicate/impersonation forces contested/pending-review and blocks publish/contact diversion.
- `isPubliclyDiscoverable` is the fail-closed predicate for page, registry, API/search, sitemap, llms, and UCP.
- Browser input may include claim facts but never `actor`, `ownerId`, `adminId`, `claimedByOwnerId`, or Clerk IDs as authority.

**Keep from analog:** required name/category/slug/T0 shape; duplicate-owned response without leaking owner details; owner membership/binding concept; payload hash/audit; public path/result readback.

**Cut from analog:** server token as authority, browser-supplied `clerkUserId`, `ctx: any`, `trustTier: "live"`, `publicStatus: "active"`, chat URL fields, env-token admin/actor authority, businessMembers table coupling, embedding/search side effects inside claim mutation.

**Tests planner should require:** no-ABN success, wrong-owner/anonymous reject, missing/foreign CSRF reject, rate-limit/duplicate reject with audit, idempotent publish one side effect per target, suppressed absent everywhere.

### 5. Catalog DTO, service facts, first-request disclosure

**Planned files:** `src/modules/catalog/public.ts`, `src/modules/catalog/internal/public-catalog-dto.ts`, `first-request.ts`, `convex/catalog.ts`.

**Closest analog:** source-owned planning authority only: `.planning/PROJECT.md:47-53,167-244,261-288`, `.planning/AI-SPEC.md:147-187`, `.planning/SECURITY-SPEC.md:152-183`.

**Data flow role:** transform Convex source rows into one allowlisted public DTO and explicit derived subsets.

**Pattern constraints:**
- `catalog` is the sole owner of `PublicCatalogDto`; page, registry, API, UCP, llms, sitemap, SEO, and public-safe admin readbacks consume this DTO or explicit typed subsets.
- DTO includes public slug/name/category/suburb/state/postcode/service area, public URL, trust/public/index/discovery statuses, schema/catalog version/freshness, services, first-request disclosure, and explicit negative capability flags only where approved.
- Raw owner/contact/admin/private evidence fields never appear in public DTOs.
- First-request modes are executable or unavailable: `inquiry_available`/`quote_request_available` require source-owned public contact target/instruction with consent/evidence; otherwise use unavailable/status-only mode plus a no-contact reason.

**Keep:** one DTO, allowlist projection, source-owned service rows, explicit unsupported capability state.

**Cut traps:** DB row spreads, route-local DTO variants, raw contact values, "live/verified/agent-ready" collapsed state, making absence of a capability imply availability.

**Tests planner should require:** public DTO allowlist, schema parity across page/API/UCP/llms/sitemap/SEO, raw contact absence, negative flags allowed only in schema/test contexts, invalid first-request availability rejected.

### 6. Registry projection, deterministic search, index health, repair

**Planned files:** `src/modules/registry/public.ts`, `src/modules/registry/internal/projection-attempts.ts`, `search.ts`, `convex/registry.ts`.

**Closest analogs:** backup registry README/data/projection/search files listed in the classification table.

**Data flow role:** publish-triggered projection attempts; public list/search/detail reads; operator-visible readback and retry.

**Pattern constraints:**
- Registry consumes catalog DTO/source state; routes never write registry/search directly.
- Search is deterministic Convex-backed matching over business name, service name, category, suburb, state, postcode, and service-area tokens.
- Projection attempts are durable with logical key, source hash/version, kind, status, retry count, retry-after, redacted failure, start/finish timestamps, latest readback, stale threshold, and repair action.
- `indexStatus` is visible to owner/admin and does not block truthful public page rendering unless suppression/eligibility fails.
- Retry/rebuild must be idempotent and must not duplicate projection or audit side effects.

**Keep from analogs:** claim -> publish -> index -> discoverable spine; Convex as source of truth; source lookup/read state; searchable fields name/category/suburb/state; visible index gap/readback concept.

**Cut from analogs:** callable stage, Meilisearch-first dependency, warning-only best-effort sync that never persists failure, global search singleton, chat/profile URL fields, route direct writes, payment/UCP coupling in registry projection.

**Tests planner should require:** forced adapter failure persists failed attempt; retry succeeds from Convex source; suppressed/unpublished absent; no duplicate audit/projection rows; deterministic search story for Sam.

### 7. AE-hosted discovery, UCP fallback, llms, sitemap, robots

**Planned files:** `src/modules/discovery/public.ts`, `src/modules/discovery/internal/ucp-manifest.ts`, `llms.ts`, `sitemap.ts`, `robots.ts`, `convex/discovery.ts`, route adapters for `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`.

**Closest analogs:** backup `ucpManifest.ts`, backup `/$slug.ucp.ts`, `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`.

**Data flow role:** generated public files/routes from eligible catalog DTO; stale/readback state; route HTTP headers.

**Pattern constraints:**
- Manifest is a generated projection, not source authority; no hand-authored manifest body.
- Use AE-hosted fallback wording and explicit path kind. Do not claim merchant-origin `/.well-known/ucp` unless the merchant origin actually serves it in a later phase.
- Discovery status `available` means the route can serve a validating manifest for the current source hash/body/URL hash; it does not mean callable, payable, verified, or standard UCP.
- Every advertised URL must route-test or be omitted.
- Discovery outputs include source-owned service facts, status/readback, unsupported capability state, route-tested content type/cache/CORS/no-store behavior where relevant, and prompt-injection inertness.

**Keep from analogs:** pinned manifest version idea; generated manifest builder; degraded manifest posture; JSON response route; content-type, cache, CORS, and nosniff header discipline.

**Cut from analogs:** `.well-known/ucp` standard-origin wording, `payment_handlers`, live OpenAPI service descriptors, MCP tool definitions, placeholder input schemas, verified transport endpoint claims, owner/runtime action claims unsupported in Phase 1.

**Tests planner should require:** valid/degraded/suppressed manifests; dead-link test; prompt-injection fixture inert; no MCP/OpenAPI/API-key/payment/callable fields; header and cache/no-store behavior; llms/sitemap/robots only current public surfaces.

### 8. Lifecycle descriptor-only moat

**Planned files:** `src/modules/lifecycle/public.ts`, `src/modules/lifecycle/internal/reference-vertical.ts`.

**Closest analog:** backup lifecycle types/README line anchors in the classification table.

**Data flow role:** compile-time/runtime-safe descriptor transform; no side effects.

**Pattern constraints:**
- Phase 1 exports descriptor primitives only: held money, external authority, time bound, and proof gap.
- Include one reference vertical descriptor so discovery/catalog can carry descriptor metadata without execution semantics.
- Primitive and descriptor maps must be exhaustively typed; no runtime workflow engine.

**Keep from analog:** lifecycle moat idea, held-money/external-authority/time-bound primitive semantics, proof-gap posture, compile-time exhaustiveness.

**Cut from analog:** runtime transition/workflow engine, protected action execution, settlement/payment/proof runtime, generic transport/callable coupling, vertical workflow code outside the one descriptor.

**Tests planner should require:** primitive union/type tests, reference descriptor test, no executable runtime/callable/payment/proof fields in DTO/discovery/copy.

### 9. Observability, operation keys, audit, funnel, operator controls

**Planned files:** `src/modules/observability/public.ts`, `src/modules/observability/internal/operation-keys.ts`, `audit.ts`, `funnel.ts`, `operator-controls.ts`, `redaction.ts`, `convex/observability.ts`.

**Closest analog:** planning authority: `.planning/ENGINEERING-STANDARDS.md:156-203`, `.planning/SECURITY-SPEC.md:100-150,236-240`, `.planning/GTM-READINESS.md:52-118`; backup admin membership audit shape as limited evidence.

**Data flow role:** durable idempotency state machine; event stream; operator readback; privacy-safe measurement.

**Pattern constraints:**
- Operation keys are durable state, not UI debounce: reserve by scope/actor/operation/key and request/source hash; replay same-key/same-hash success; return in-progress/retryable for in-progress; reject same-key/different-body and audit it.
- `auditEvents` is the append-only consequential event authority. Admin-specific audit tables may exist only as derived/read models keyed by `auditEventId`.
- Every consequential mutation/projection has actor/target, event ID, idempotency key, correlation ID, before/after where state changes, reason/evidence for admin actions, redacted payload, and payload hash.
- Funnel/activation events are privacy-safe; no raw private payloads. Activation means publish + status readback + capability health viewed + share/interest + attribution recorded.
- Operator controls cover `claims_enabled`, `publish_enabled`, `registry_enabled`, `discovery_enabled`, and `public_copy_safe_mode` with actor/reason/expiry/audit/readback.

**Keep:** typed audit/event contracts, redaction before logs/readbacks, visible operational gaps, operator kill switches.

**Cut traps:** optional actor/target on consequential events, raw source documents in audit, generic `JSON.stringify` logs, Node-only imports in Convex-safe code, measuring raw private payloads, "published page = activation".

**Tests planner should require:** operation-key same/different body semantics, audit required-field tests, redaction scan, funnel/activation query tests, operator-control behavior and admin readback.

### 10. Security, admin authority, abuse, disputes/removal

**Planned files:** `src/modules/security/public.ts`, `src/modules/security/internal/csrf.ts`, `rate-limit.ts`, `duplicates.ts`, `admin-authority.ts`, `disputes.ts`, `convex/security.ts`, route adapter for `/privacy/remove-business`.

**Closest analogs:** backup `adminMemberships.ts`, backup `adminGuards.ts`, `.planning/SECURITY-SPEC.md`.

**Data flow role:** guards before mutation; admin CRUD state; event-driven audit; request-response denial paths.

**Pattern constraints:**
- Clerk/session identifies a principal; source-owned `adminMemberships` grants role/state/action authority.
- Roles are Phase 1 only: `owner_admin`, `support`, `reviewer`. Owner admin can grant/revoke/suppress/operator-control/close disputes; support can read/annotate only; reviewer is read-only.
- First-admin bootstrap is one-time, audited, and allowed only when no active owner admin exists. Later bootstrap attempts are denied/audited.
- CSRF/same-site Origin covers session-cookie mutations: claim publish, suppress/unsuppress, dispute decisions, admin membership, operator controls.
- Abuse controls include actor/IP/device/anonymous buckets, slug collision policy, duplicate/impersonation fingerprints, typed rejection, and audit.

**Keep from analog:** source-owned membership records; role/state/grant/revoke/bootstrap audit shape; reason/evidence refs; one-time bootstrap denial after active admin.

**Cut from analog:** `security_admin`/`payout_admin` roles in Phase 1, `env_migration` as live authority, backend-admin magic authority as sufficient proof, route-only guards, env-only admin authority.

**Tests planner should require:** first bootstrap success, second denial, env/session-only denial, support/reviewer denial for destructive/admin actions, denied-action audit, CSRF/origin rejects, duplicate/impersonation/rate-limit tests, suppression/removal reconstruction.

### 11. SEO/AEO metadata, JSON-LD, sitemap/robots/llms route parity

**Planned files:** `src/modules/seo/public.ts`, `src/modules/seo/internal/public-business-seo.ts`, `json-ld.ts`, SEO tests.

**Closest analogs:** backup `tests/seo/discovery-files.test.ts:14-190`, backup `src/lib/seo/localBusiness.ts:37-85`, `.planning/SEO-AEO-SPEC.md`.

**Data flow role:** source DTO to metadata/schema strings/files; route smoke and scan.

**Pattern constraints:**
- SEO builders are module-owned; routes do not assemble ad hoc JSON-LD or metadata.
- Public business pages get unique title/description/H1/canonical/schema from source-owned fields only.
- JSON-LD is limited to LocalBusiness, Service, and BreadcrumbList when source-owned facts support them; values must be escaped for inline script.
- Sitemap includes only canonical static public URLs and published non-suppressed business pages. Robots declares sitemap, excludes private/admin/claim-continuation/dispute evidence, and intentionally allows citation/search crawlers unless policy changes.
- `llms.txt` is a truth file listing current public surfaces, API semantics/examples, unsupported actions, and privacy/removal route.

**Keep from analogs:** private route exclusion tests, hosted HTTPS origin guard, robots/llms truth boundaries, JSON-LD escaping, optional ABR attribution posture only when source evidence exists.

**Cut from analogs:** chat URLs, pricing/how-it-works launch claims, ABN non-null assertion pattern, ratings/reviews/offers/payment schema, protocol/callable owner copy, fake verification/demand claims.

**Tests planner should require:** JSON-LD escape, no Review/AggregateRating/Offer/payment fields, noindex/sitemap rules, robots/llms route parity, public API schema compatibility, suppressed/private absence.

### 12. UI framework, components, status presentation

**Planned files:** `src/styles/tokens.css`, `src/styles/globals.css`, `src/components/ui/*`, `src/components/ae/layout/*`, `src/components/ae/status/*`, `src/components/ae/forms/*`, `src/components/ae/feedback/*`, `src/components/ae/data/*`, `src/lib/ui/status-presentation.ts`, `copy.ts`, `routes.ts`.

**Closest analog:** planning/design authority only: `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, `01-UI-SPEC.md`, `DESIGN.md`, `.impeccable/design.json`, `.agents/skills/shadcn/SKILL.md`.

**Data flow role:** domain statuses and route DTOs to accessible UI state, labels, tone, next action, layout.

**Pattern constraints:**
- `components/ui/*` is shadcn-owned primitive source. `components/ae/*` is AE product framework. Routes import AE components first.
- First frontend work ships tokens/globals, shadcn initialization, minimal official primitives, AE shells, `AeStatusBadge`, `status-presentation.ts`, one tiny non-mutating route, and UI contract scan.
- Status labels/tone/next action live in one mapper. Routes never map raw status to color/copy locally.
- Forms use shadcn FieldGroup/Field patterns; status uses Badge + text; cards use full Card composition; loading/empty/error use shared components.
- Route classes are layout-only. Visual identity belongs to tokens/components.

**Keep:** Civic Signal Board source-owned command surface, semantic tokens, Geist/system font posture, official shadcn primitives, AE shells/status/forms/feedback/data components, compact/wide and keyboard/focus proof.

**Cut traps:** default shadcn as final UI, raw route colors, `space-y-*`, `transition-all`, manual status colors/dots, bespoke buttons/cards/badges/forms/skeletons, future nav items, AI-purple gradients, fake dashboard art, route-local scroll listeners, component promotion without reuse/safety need.

**Tests planner should require:** UI status presentation unit tests, UI contract class/copy scan, rendered 375px and wide evidence, keyboard/focus/touch target checks, long-content/escaped-text proof.

### 13. TanStack Start, Clerk, and route adapters

**Planned files:** `apps/web` root/start files, file routes for `/`, `/claim`, `/claim/success`, `/{slug}`, `/registry`, `/privacy/remove-business`, `/admin/claims`, `/admin/index-health`, `/admin/audit-events`, API/discovery routes.

**Closest analog:** planning authority and skills; no backup route should be copied except UCP header behavior as a narrow analog.

**Data flow role:** request-response adapter; loader/server-function boundary; UI render; API JSON response.

**Pattern constraints:**
- Routes are adapters over public module seams and generated Convex hooks/functions only. They do not own domain state, DTO mapping, status copy, SEO schema, admin authority, or discovery body generation.
- Every `createServerFn` with input uses an input validator and returns exported module DTO/result unions.
- Clerk `beforeLoad`/provider patterns are UX/session identification only; server/Convex guards enforce source-owned owner/admin authority.
- Public API/discovery routes are read-only, no auth/API keys, stable slugs/pagination, explicit empty/404/error shapes, and route-tested content headers.
- Admin routes have both UX guard and server/Convex guard; non-admin denial is a required rendered and HTTP scenario.

**Keep:** TanStack file-route organization, `beforeLoad` for redirects/UX, server function validation, route loaders returning typed DTO/result unions, Clerk middleware/provider setup when runtime exists.

**Cut traps:** route imports from module `internal/*`, `convex/schema`, provider SDKs, raw generated Convex docs as domain contracts, route-local source writes, route-only admin checks, API docs for dead routes.

**Tests planner should require:** Sam E2E, admin denial E2E, registry/API search E2E, discovery route smoke, API schema parity, route import boundary tests.

### 14. Public/owner/admin route surface contracts

**Planned routes:** `/`, `/claim`, `/claim/success`, `/{slug}`, owner status/readback, `/registry`, `/privacy/remove-business`, `/admin/claims`, `/admin/index-health`, `/admin/audit-events`.

**Closest analog:** `01-UI-SPEC.md:97-160,180-194` and `.planning/FRONTEND-DESIGN-FRAMEWORK.md:238-255`.

**Pattern constraints:**
- `/` has one primary CTA, one registry secondary path, anti-overclaim copy, and no protocol/developer/marketplace/payment sections.
- `/claim` is one coherent flow unless validation proves a stepper is necessary; sections are business identity, service facts, first-request disclosure, review/publish.
- `/claim/success` and owner status show one object card with public URL, public/service/index/discovery/trust/capability state, unavailable capability, and next action; it is noindex.
- `/{slug}` first viewport at 375px includes business/service identity, suburb/state, service facts, first-request mode, status/unavailable capability, and removal link.
- `/registry` covers loading/empty/no-results/populated/pagination and deterministic search.
- Admin routes use `AeAdminShell`, group queues by status/next action, show object/source state/surface/readback/attempt/repair/correlation ID, and render non-admin denial.

**Keep:** outcome-first labels, human copy for owner/public, machine flags only in DTOs/manifests/admin diagnostics, visible failure/repair readbacks.

**Cut traps:** raw terms on owner/public surfaces (`callable`, `paymentRequired`, UCP/MCP/llms/router/SQCT), unsupported bookings/payments/actions, future nav, protocol-first copy, fake launch/demand/partner claims.

### 15. API/search/discovery route contracts

**Planned routes:** `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`.

**Closest analog:** `.planning/AI-SPEC.md:147-187,188-253`, `.planning/SEO-AEO-SPEC.md:27-33,60-109`, backup `/$slug.ucp.ts:14-48` for response/header posture only.

**Pattern constraints:**
- API list/search/detail share `PublicCatalogDto` or explicit documented subset; no private owner/contact/admin/evidence fields.
- Search query semantics are exact/deterministic enough for name, service, category, suburb/state/postcode/service area. No external/fuzzy engine in Phase 1.
- `/{slug}/ucp` is AE-hosted fallback, not merchant-origin standard UCP. It is suppression/stale-aware and explicit about unsupported capability.
- `/llms.txt` enumerates only current public surfaces, unsupported actions, public API semantics, examples, and privacy/removal route.
- `/sitemap.xml` and `/robots.txt` are generated from source-owned eligibility and route-tested.

**Keep:** public JSON catalog shape analogy, route-tested headers, explicit empty/404, schema compatibility, dead-link tests.

**Cut traps:** API keys, MCP/OpenAPI action/service descriptors, payment-required/callable endpoints, `.well-known` standard-origin claims, stale public URLs, hand-authored discovery files.

### 16. Verification suites and closeout evidence

**Planned tests:** unit, integration, types, imports/source-mining, TS standards, E2E, a11y, copy, SEO, UI contract, Convex codegen check, deployment/readback smoke.

**Closest analog:** `.planning/phases/01-ten-star-spine-foundation/01-RESEARCH.md:320-352,430-456`, backup SEO tests for discovery/JSON-LD invariants.

**Pattern constraints:**
- Tests should target seams and behavior: DTO allowlists, operation key semantics, lifecycle descriptor, SEO escaping, claim/publish security, admin authority, projection repair, discovery suppression, funnel activation, route boundaries.
- No mocks for core behavior; use smallest runnable checks that fail if logic breaks.
- Closeout is not green tests only: include deployment/readback smoke, Matt Pocock Standards/Spec review axes separately, Fable closeout mapping, and GTM internal-alpha evidence.

**Keep:** fail-first fixtures, route HTTP smoke, browser/a11y evidence at 375px and wide, forced-failure repair tests, privacy-safe event readbacks.

**Cut traps:** placeholder/no-op scripts, tests that only assert config strings, build-only proof, broad launch without owner activation rows, merged Standards/Spec review axes.

## Shared Patterns

### Deep module seam rule

**Source:** `.planning/ENGINEERING-STANDARDS.md:123-154`, `skill://codebase-design`, `.planning/PROJECT.md:150-166`.

**Apply to:** every `src/modules/<module>` and every route.

**Rule:** owning module exposes `public.ts`; implementation stays under `internal/`; domain modules do not use `index.ts` barrels; tests cross the public seam unless testing a private internal adapter owned by that module. Routes import public seams and UI components only.

### Result unions and typed failures

**Source:** `.planning/ENGINEERING-STANDARDS.md:67-80`, `.planning/PROJECT.md:290-331`.

**Apply to:** business, catalog, registry, discovery, security, observability, API routes, server functions.

**Rule:** expected failure returns discriminated result unions. Exceptions are infrastructure/programmer faults. Route/server functions return exported module DTO/result unions without widening literals.

### Authority derivation

**Source:** `.planning/SECURITY-SPEC.md:46-59,60-98`, `skill://clerk-tanstack-patterns`.

**Apply to:** claim/publish, suppress/unsuppress, disputes, admin routes, operator controls.

**Rule:** Clerk identifies a session; Convex/source state grants owner/admin authority. Browser payload never grants actor/owner/admin. `beforeLoad` is UX; server/Convex guard is enforcement.

### Idempotency + audit before projections

**Source:** `.planning/ENGINEERING-STANDARDS.md:156-203`, `01-CONTEXT.md:D-18,D-19,D-21`.

**Apply to:** claim create, publish, suppression, dispute decisions, registry projection, discovery generation, admin membership changes, operator controls.

**Rule:** durable operation key reserve/replay/reject happens before side effects; audit event is written in same logical operation; failed/stale attempts store repair action or no-repair decision.

### Public eligibility and suppression

**Source:** `.planning/SECURITY-SPEC.md:46-59`, `01-CONTEXT.md:D-22,D-23`, `01-SPEC.md:56-59,117-120`.

**Apply to:** page, registry, API/search, sitemap, llms, UCP, SEO metadata, admin health.

**Rule:** one fail-closed `isPubliclyDiscoverable` predicate decides public exposure at serve/generation time. Suppression invalidates/rebuilds every public surface and leaves reconstructable audit/readback.

### One DTO, many projections

**Source:** `.planning/AI-SPEC.md:147-187`, `01-CONTEXT.md:D-10,D-14`, `.planning/SEO-AEO-SPEC.md:27-33`.

**Apply to:** `/{slug}`, `/registry`, `/api/businesses*`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, SEO/JSON-LD, public-safe admin readbacks.

**Rule:** `catalog` owns `PublicCatalogDto`; derived subsets are explicit and typed. No route-local shape mappers, row spreads, hand-authored manifests, or dead advertised routes.

### Prompt-injection and owner text safety

**Source:** `.planning/AI-SPEC.md:220-253`, `.planning/SECURITY-SPEC.md:212-220`.

**Apply to:** public page, manifest, llms, SEO schema, admin readbacks, logs.

**Rule:** owner-authored text is untrusted data, never an instruction. Cap lengths, strip raw HTML/scripts where appropriate, escape JSON-LD/inline strings, redact private IDs, and test injection strings that try to mark a business verified/callable.

### UI composition and status presentation

**Source:** `.planning/FRONTEND-DESIGN-FRAMEWORK.md:87-103,214-237,238-255`, `.agents/skills/shadcn/SKILL.md:29-78`.

**Apply to:** every styled route and shared UI component.

**Rule:** compose routes from shell -> page header -> section -> domain composition. Route owns arrangement/data loading only. AE status mapper owns labels/tone/next action. shadcn primitives are used through AE components; forms use FieldGroup/Field; status uses Badge + text.

### Honest copy and GTM claims

**Source:** `.planning/GTM-READINESS.md:120-169`, `.planning/PROJECT.md:65-110`, `01-UI-SPEC.md:294-317`.

**Apply to:** route copy, SEO/AEO text, discovery files, emails/social/partner copy if added, claims register.

**Rule:** allowed claims are claim/publish, AE registry/search when indexed, AE-hosted discovery, read-only public JSON, status visibility, and ABR verification only with source evidence. Banned claims include bookings, payments, wallet, autonomous agents, guaranteed response, ABR verified by default, MCP/API/SDK/standard merchant-origin UCP, partner/liquidity/demand claims.

## Fresh Seams With No Runtime Analog

| Fresh seam | Why no code analog should be used | Planning instruction |
|---|---|---|
| Runtime substrate and package scripts | Fresh repo has no runtime; backup package shape would preserve old coupling. | Plan a small TanStack Start + Convex + Clerk scaffold and verify package legitimacy during `01-01`. |
| Guardrail scanners | Backup has source to ban, not a scanner shape to preserve. | Write scans from ledger/standards; seed bad fixtures first. |
| `PublicCatalogDto` | Backup had profile/registry shapes with chat/payment/protocol coupling. | Catalog owns fresh allowlist DTO and typed subsets. |
| Operation key state machine | Backup evidence has payload hash/audit but not durable reserve/replay/reject semantics. | Implement in observability before retryable mutations/projections. |
| UI framework and AE components | Backup UI is not an authority; design framework is new and committed. | Build tokens/shadcn/AE shells/status mapper before screens. |
| Admin UI routes | Backup admin membership logic is a source-state analog, not route UI. | Use `AeAdminShell` queues/readbacks from UI-SPEC and security permission matrix. |
| Funnel/owner activation | Backup validation mentioned operational gaps but Phase 1 GTM activation contract is new. | Store privacy-safe events and activation state before GTM gates. |

## Backup Source-Mine Keep/Cut Index

| Fresh cluster | Backup analog | Keep | Cut |
|---|---|---|---|
| business | `convex/claimPublishing.ts` | T0 no-ABN publish shape, duplicate-owned response, owner binding idea, payload hash/audit, public path result | server token authority, browser Clerk ID authority, `ctx: any`, `live/active` states, chat URL, env token gate |
| registry/search | `src/lib/registry/README.md`, `directory/*`, `meilisearch.ts` | claim->publish->index->discoverable spine, Convex truth, source lookup/read states, searchable fields, visible index gap | callable stage, Meilisearch-first dependency, warning-only failures, global singleton, route writes, chat/payment/UCP coupling |
| discovery | `ucpManifest.ts`, `$slug.ucp.ts` | pinned version, generated/degraded manifest, JSON route headers | `.well-known` overclaim, `payment_handlers`, MCP tool definitions, OpenAPI service descriptors, placeholder schemas, action/runtime claims |
| lifecycle | `lifecycle/types.ts`, lifecycle README | primitives, descriptor moat, proof-gap posture, exhaustiveness | workflow engine, protected actions, settlement/payment/proof runtime, transport/callable coupling |
| security/admin | `adminMemberships.ts`, `adminGuards.ts` | source-owned membership state, grant/revoke/bootstrap audit, reason/evidence refs, one-time bootstrap | extra admin roles, env migration as live authority, backend-admin magic authority, route/env-only guards |
| SEO/copy | `tests/seo/discovery-files.test.ts`, `localBusiness.ts`, `PRODUCT.md` | sitemap exclusions, HTTPS guard, robots/llms truth boundaries, JSON-LD escaping, outcome-before-mechanism copy | chat/pricing/how-it-works launch claims, ABN non-null assertion, ratings/offers/payment schema, protocol/callable copy |

## Route Adapter Map

| Route | Owning source module(s) | UI/component pattern | Closest analog | Traps to cut |
|---|---|---|---|---|
| `/` | catalog/read-only status snippets if any; observability funnel | `AePublicShell`, `AeHero`, anti-overclaim alert, one primary CTA | `01-UI-SPEC.md`, frontend framework | payment/developer/marketplace/protocol hero, fake metrics, future nav |
| `/claim` | business, catalog, security, observability | `AeOwnerShell`, `AeClaimFormSection`, `AeReviewBlock`, Clerk UX before mutation | `01-UI-SPEC.md`, Clerk/TanStack skills | browser-supplied owner IDs, hidden consequence copy, wizard bloat without evidence |
| `/claim/success` / owner status | business, catalog, registry, discovery, observability | one `AeStatusCard`, copy/share only when public | `01-UI-SPEC.md`, Vercel-style object overview inspiration | raw adapter errors, noindex omission, collapsing index/discovery/trust into live |
| `/{slug}` | catalog, business visibility, seo | `AePublicShell`, `AeStatusBadge`, `AeCapabilityList`, removal link | UI/SEO specs | raw owner contact/private fields, callable/payable/verified copy, JS-only critical facts |
| `/registry` | registry + catalog DTO | list/search, explicit empty/no-results/pagination states | Agentic.Market shape via planning; backup registry source lookup | ranking/usage theatre, external search first, private fields |
| `/privacy/remove-business` | security disputes/removal + business suppression | plain-language form, evidence/consequence/recovery copy | `01-UI-SPEC.md`, `SECURITY-SPEC.md` | removal evidence in sitemap/llms, hidden consequences, unaudited suppression |
| `/admin/claims` | security, business, observability | `AeAdminShell`, `AeQueueList`, grouped by status/next action | security spec/admin membership analog | non-admin nav exposure, route-only guard, destructive action without reason/evidence |
| `/admin/index-health` | registry, discovery, observability, security | health queue with latest attempt/readback/repair/no-repair | projection/readback planning + backup index gap analog | manual ops without dispatch record, stale success, duplicate retry side effects |
| `/admin/audit-events` | observability, security | `AeAuditEventRow`, filters, redacted payload/correlation ID | security audit spec + admin membership audit analog | raw private payloads, optional actor/target, editable audit |
| `/api/businesses*` | catalog, registry | JSON route adapter; schema parity tests | AI/SEO specs | API keys, dead docs, route-local DTO, raw DB rows |
| `/{slug}/ucp` | discovery + catalog + business visibility | JSON response with tested headers/readback | backup `$slug.ucp.ts` header posture | `.well-known` standard claim, MCP/OpenAPI/payment/callable fields |
| `/llms.txt` | discovery + seo | truth file generated from eligible routes | AI/SEO specs + backup SEO tests | stale route links, protocol hype, unsupported actions |
| `/sitemap.xml` | discovery + seo + visibility | generated public URL list | backup SEO tests | private/admin/claim success/suppressed/stale URLs |
| `/robots.txt` | discovery + seo | generated crawler posture | backup SEO tests | blocking intended AI/search crawlers by accident, allowing admin/private routes |

## Test Pattern Map

| Gate | Planned tests | Pattern source | Must prove |
|---|---|---|---|
| Imports/source-mining | `tests/imports/*`, bad source-mining fixtures | ledger + engineering standards | No backup imports, no private module imports, no `.planning` runtime imports, no future-surface symbols. |
| TS/types | `tests/imports/ts-standards.test.ts`, `tests/types/*` | engineering standards + PROJECT state contracts | No broad type holes; validators equal domain types; invalid statuses/results fail; required maps exhaustive. |
| Unit | lifecycle, operation keys, catalog DTO, SEO JSON-LD, UI status presentation | module public seams | Descriptor-only lifecycle, idempotency semantics, DTO allowlist, escaping, label/tone/next-action maps. |
| Integration | claim/publish, admin authority, projection repair, discovery manifest, suppression, funnel activation | SPEC requirements R3/R6/R7/R8/R10 | Sam source state, security rejects, durable attempts/readbacks, one eligibility predicate, activation queryability. |
| E2E/a11y | Sam flow, admin denial, registry search, discovery routes, a11y | UI-SPEC + Playwright skill standards if implementation touches tests | 375px/wide, keyboard/focus, loading/empty/error/suppressed states, no color-only status. |
| Copy | banned copy and claims register | GTM + PROJECT anti-positioning + AI-SPEC | No booking/payment/verification/agent-action/partner/demand/protocol overclaims; negative flags scoped correctly. |
| SEO/AEO | public-business SEO, discovery files, public API schema | SEO-AEO spec + backup SEO tests | JSON-LD safe, sitemap/robots/llms route parity, private/suppressed absence, API schema compatibility. |
| UI contract | class scan, component contract, status copy | frontend framework + shadcn skill | No raw styling drift, no local primitive lookalikes, no future nav, status presentation used. |
| Closeout | deployment/readback smoke, Matt review, Fable mapping, GTM internal-alpha evidence | research exact gates | Local/deployed parity, review axes separate, accepted findings mapped, friendly-owner evidence exists. |

## Planning Notes for PR Slices

- `01-01` should produce substrate and guardrails only. It should not implement claim/publish/admin/discovery behavior or fake public routes beyond a minimal non-mutating shell proof.
- `01-02` should land schema, indexes, state unions, validators, operation keys, audit union, admin memberships, lifecycle descriptor, funnel/activation state.
- `01-03` should land business claim/publish/suppress with security helpers in path and projection queueing.
- `01-04` should land admin/dispute/operator controls before public discovery exposure.
- `01-05` should land public/owner UI routes after tokens/shadcn/AE components/status presentation exist.
- `01-06` should land registry/search/API/projection repair from the catalog DTO.
- `01-07` should land UCP/llms/sitemap/robots and route-tested discovery headers.
- `01-08` should prove local gates, claims register, review prep, and internal-alpha evidence plan.
- `01-09` should prove deployment/readback closeout.

## No-Launch Traps to Repeat in Every Plan

- Public discovery before admin membership, suppression, audit, operator controls, projection/readback, and repair dispatches exist.
- Route adapters assembling source state, public DTOs, SEO schema, status labels, or discovery bodies directly.
- Backup coupling under renamed folders.
- Negative machine flags accidentally banned everywhere, or truthy/executable flags allowed anywhere.
- Admin authority granted by env/session/route guard alone.
- Suppression hidden by cache in any public route/file.
- `PublicCatalogDto` split into page/API/UCP-specific one-offs.
- UI route drift into bespoke shadcn/default Tailwind styling.
- GTM copy claiming demand, partners, protocol capability, payments, bookings, or agent actions before gates.

## Metadata

**Analog search scope:** current planning authorities in `../agentic-economy/.planning`, project shadcn skill, required TanStack/Clerk/codebase-design skills, and ledger-named backup files only.  
**Backup files read as analogs:** `convex/claimPublishing.ts`, `src/lib/registry/README.md`, `src/lib/registry/directory/registryData.ts`, `src/lib/registry/directory/registryProjection.ts`, `src/lib/search/meilisearch.ts`, `src/lib/registry/discovery/ucpManifest.ts`, `src/routes/$slug.ucp.ts`, `src/lib/registry/lifecycle/types.ts`, `src/lib/registry/lifecycle/README.md`, `convex/adminMemberships.ts`, `convex/adminGuards.ts`, `tests/seo/discovery-files.test.ts`, `src/lib/seo/localBusiness.ts`, `PRODUCT.md`.  
**Not searched:** unrelated backup directories, package registries, runtime source directories that do not exist yet.  
**Pattern extraction date:** 2026-06-27
