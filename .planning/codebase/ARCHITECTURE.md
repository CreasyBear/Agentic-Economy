<!-- refreshed: 2026-06-30 -->
# Architecture

**Analysis Date:** 2026-06-30

## System Overview

```text
+--------------------------------------------------------------------------+
|                         TanStack Start app shell                         |
|  `src/start.ts`  `src/router.tsx`  `src/routes/__root.tsx`               |
+------------------------+-------------------------+-----------------------+
| Public/owner/admin UI  | API and discovery files | Auth + request gates  |
| `src/routes/*.tsx`     | `src/routes/api.*.ts`   | `src/start.ts`       |
| `src/components/**`    | `src/routes/*[.]*.ts`   | `src/lib/server/**`  |
+-----------+------------+------------+------------+-----------+----------+
            |                         |                        |
            v                         v                        v
+--------------------------------------------------------------------------+
|                    Route adapters and server functions                   |
|  `src/modules/*/*.functions.ts`  `src/lib/server/convex-source.ts`       |
|  `src/lib/server/source-write-admission.ts`                              |
+--------------------------------------------------------------------------+
            |
            v
+--------------------------------------------------------------------------+
|                       Domain module public contracts                     |
|  `src/modules/*/public.ts` -> `src/modules/*/internal/*.ts`              |
|  pure state machines, DTOs, literal unions, redacted readbacks           |
+--------------------------------------------------------------------------+
            |
            v
+--------------------------------------------------------------------------+
|                         Convex source authority                          |
|  `convex/*.ts` functions  `convex/*Store.ts` stores  `convex/schema.ts`  |
|  Clerk-derived actors, source-write admission, indexes, audit/readback   |
+--------------------------------------------------------------------------+
            |
            v
+--------------------------------------------------------------------------+
|                   Public projections and operator readbacks              |
|  public pages, registry JSON, UCP fallback, llms.txt, sitemap, admin UI  |
|  `src/routes/$slug.tsx` `src/routes/api.businesses.ts`                   |
|  `src/routes/$slug.ucp.ts` `src/routes/llms[.]txt.ts`                    |
+--------------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start request entry | Installs CSRF, source-write admission, and Clerk request middleware. | `src/start.ts:12` |
| Router factory | Creates the TanStack Router from generated file routes with intent preloading and scroll restoration. | `src/router.tsx:6` |
| Root route | Provides document shell, global metadata, stylesheet link, and `ClerkProvider`. | `src/routes/__root.tsx:8` |
| Generated route tree | Generated TanStack route composition; do not hand edit. | `src/routeTree.gen.ts:1011` |
| Public page routes | Render public landing, registry, claim, public business, inquiry, and correction screens. | `src/routes/index.tsx:34`, `src/routes/registry.tsx:55`, `src/routes/$slug.tsx:32`, `src/routes/claim.tsx:123` |
| API routes | Expose REST-style JSON and webhook endpoints through `createFileRoute(...).server.handlers`. | `src/routes/api.businesses.ts:8`, `src/routes/api.business-actions.stripe-webhook.ts:9` |
| Discovery file routes | Build `llms.txt`, `sitemap.xml`, `robots.txt`, and UCP responses from module readbacks. | `src/routes/llms[.]txt.ts:9`, `src/routes/sitemap[.]xml.ts:9`, `src/routes/robots[.]txt.ts:6`, `src/routes/$slug.ucp.ts:14` |
| AE components | Own product-specific shells, landing sections, status badges, readback panels, and forms. | `src/components/ae/layout/AePublicShell.tsx:15`, `src/components/ae/layout/AeAdminShell.tsx:21`, `src/components/ae/landing/AePublicLanding.tsx:289` |
| UI primitives | Own reusable shadcn-style primitives and variants. | `src/components/ui/button.tsx:7`, `src/components/ui/card.tsx:14` |
| Server source transport | Creates authenticated/public Convex HTTP clients and typed function references. | `src/lib/server/convex-source.ts:81`, `src/lib/server/convex-source.ts:125` |
| Source-write admission | Converts TanStack request context into signed write admission for server and webhook mutations. | `src/lib/server/source-write-admission.ts:19`, `src/lib/server/source-write-admission.ts:33` |
| Business module | Owns owner binding, claim status, public visibility, suppression, and business identity contracts. | `src/modules/business/public.ts:23`, `src/modules/business/internal/claim.ts` |
| Catalog module | Owns services, first-request capabilities, public catalog DTOs, claim/publish flow, and public page readbacks. | `src/modules/catalog/public.ts:41`, `src/modules/catalog/owner-claim.functions.ts:145` |
| Registry module | Owns public list/search/detail DTOs, projection attempts, index status, and registry health. | `src/modules/registry/public.ts:26`, `src/modules/registry/registry.functions.ts:41` |
| Discovery module | Owns AE-hosted UCP fallback, route-tested discovery schema, llms/sitemap builders, and sanitized public discovery text. | `src/modules/discovery/public.ts:21`, `src/modules/discovery/internal/ucp-manifest.ts:11`, `src/routes/api.discovery.schema.ts:29` |
| Inquiry module | Owns public inquiry submission, owner inbox/thread readbacks, owner replies, privacy tombstones, and operator reconstruction. | `src/modules/inquiries/public.ts:104`, `src/modules/inquiries/inquiry.functions.ts:249` |
| Notification outbox module | Owns durable notification dispatches, attempts, provider webhook readbacks, retry, and no-repair decisions. | `src/modules/notification-outbox/public.ts:53`, `convex/notificationOutbox.ts:294` |
| Protected action module | Owns contact-follow-up proposal, owner decision, gateway, attempt, receipt, private evidence, and no-repair chains. | `src/modules/protected-action/public.ts:1`, `src/modules/protected-action/contact-follow-up.functions.ts:150` |
| Business action module | Owns Phase 6 business-action cards, mandates, checkpoints, evidence, artifacts, receipts, and support records. | `src/modules/business-action/public.ts:1`, `src/modules/business-action/business-action.functions.ts:193`, `convex/businessActionStore.ts:96` |
| Billing module | Owns paid-activation projections and provider-event/receipt/reconciliation contracts while routes remain parked outside active `src/routes`. | `src/modules/billing/public.ts:99`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts` |
| Security module | Owns CSRF/rate-limit helpers, duplicate detection, disputes, suppression rules, admin authority, and fail-closed admin readbacks. | `src/modules/security/public.ts:48`, `src/modules/security/admin-readback.functions.ts:34` |
| Observability module | Owns operation keys, typed audit events, invalidation intents, funnel events, operator controls, and private-evidence projections. | `src/modules/observability/public.ts:31`, `src/modules/observability/public.ts:717` |
| Convex schema composition | Composes module-owned table fragments into the Convex schema. | `convex/schema.ts:15` |
| Convex authz | Derives owner/admin authority from Convex auth identity and source-owned admin membership rows. | `convex/authz.ts:35`, `convex/authz.ts:50` |
| Contract scans | Enforces route/module boundaries, source-mining boundaries, TypeScript guardrails, and copy claims. | `src/lib/ui/contract-scans.ts:61`, `src/lib/ui/contract-scans.ts:71`, `src/lib/ui/contract-scans.ts:96`, `src/lib/ui/contract-scans.ts:258` |

## Pattern Overview

**Overall:** Source-owned modular monolith using TanStack Start route adapters over module public contracts, with Convex as the durable source authority.

**Key Characteristics:**
- Routes in `src/routes/` are adapters. They may render UI, validate search params, call module server functions, and expose server handlers, but they must not own Convex transport, provider SDKs, or module internals (`src/lib/ui/contract-scans.ts:71`).
- Domain modules expose a `public.ts` contract and keep implementation in `internal/`. Same-module `public.ts` files may import their own internals; routes and sibling modules must import public seams (`src/lib/ui/contract-scans.ts:61`, `src/lib/ui/contract-scans.ts:763`).
- Server bridge files use the `*.functions.ts` convention for TanStack `createServerFn` wrappers and Convex source ports (`src/modules/catalog/owner-claim.functions.ts:145`, `src/modules/inquiries/inquiry.functions.ts:249`, `src/modules/business-action/business-action.functions.ts:193`).
- Convex functions in `convex/*.ts` validate args/returns, derive authority from `ctx.auth.getUserIdentity()`, require source-write admission for consequential mutations, and use indexed queries (`convex/business.ts:167`, `convex/catalog.ts:209`, `convex/authz.ts:35`, `convex/sourceWriteAdmission.ts:39`).
- Public outputs are allowlisted DTOs/readbacks. Route-visible catalog output strips source hashes (`src/modules/catalog/owner-claim.functions.ts:337`), discovery output sanitizes owner-authored text (`src/modules/discovery/internal/ucp-manifest.ts:130`), and API/discovery responses set explicit cache/CORS/content-type headers (`src/lib/http/discovery-response.ts:7`).
- Planning and skill constraints are encoded in runtime guardrails: TanStack Start skills require validated `createServerFn` inputs and API routes for raw HTTP/webhooks, TanStack Router skills require file-based routes/loaders/search validation, Convex skills require validators/returns/indexes, and Clerk TanStack skills require `clerkMiddleware()` plus root `ClerkProvider` (`src/start.ts:10`, `src/routes/__root.tsx:33`).

## Layers

**Application Shell:**
- Purpose: Configure request middleware, router defaults, root document, and global metadata.
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`
- Contains: TanStack Start setup, Clerk provider wrapper, generated route tree import.
- Depends on: `@tanstack/react-start`, `@tanstack/react-router`, `@clerk/tanstack-react-start`, `src/lib/server/source-write-admission.ts`.
- Used by: Vite/TanStack Start runtime from `vite.config.ts`.

**Route Adapters:**
- Purpose: Bind URLs to UI, loader data, search params, REST-style handlers, and webhook handlers.
- Location: `src/routes/`
- Contains: `createFileRoute` definitions, loaders, `validateSearch`, `head`, `pendingComponent`, `errorComponent`, and `server.handlers`.
- Depends on: `src/components/**`, `src/modules/*/*.functions.ts`, `src/modules/*/public.ts`, `src/lib/http/discovery-response.ts`.
- Used by: Generated `src/routeTree.gen.ts` and `src/router.tsx`.

**UI Components:**
- Purpose: Render reusable product surfaces and primitives without owning source-state logic.
- Location: `src/components/ae/`, `src/components/ui/`, `src/styles/`
- Contains: AE public/admin shells, landing sections, status/readback components, forms, shadcn-style primitives, token/global CSS.
- Depends on: `src/lib/utils.ts`, Tailwind classes, route props and module DTOs.
- Used by: `src/routes/*.tsx`.

**Server Bridges and Source Ports:**
- Purpose: Validate server-function inputs, build source-write admission, map local test bypasses, and call Convex source functions.
- Location: `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`
- Contains: Zod schemas, `createServerFn`, source function references, `callSourceQuery`, `callSourceMutation`, `callPublicSourceQuery`, result normalization, local e2e fallback data.
- Depends on: `convex/browser`, `convex/server`, Clerk server auth, module public contracts.
- Used by: Route loaders, form submissions, API/webhook route handlers.

**Domain Public Contracts:**
- Purpose: Define stable module interfaces, literal unions, DTOs, source-state shapes, and exported pure operations.
- Location: `src/modules/<domain>/public.ts`
- Contains: Const tuple unions, result unions, `SourceState` types, commands, readback contracts, re-exported pure implementation functions.
- Depends on: Own `src/modules/<domain>/internal/**` and public contracts from other modules.
- Used by: Routes, server bridge files, tests, Convex adapters, schema fragments.

**Domain Internal Implementations:**
- Purpose: Own module-specific state machines, validators, projection builders, schema fragments, and DTO builders.
- Location: `src/modules/<domain>/internal/`
- Contains: Pure functions, `defineTable` fragments, source-state helpers, sanitizer/builders, operation-key/audit helpers.
- Depends on: Module public types and approved public contracts from other modules.
- Used by: Same-module `public.ts`; Convex schema composition imports `internal/schema.ts` fragments.

**Convex Runtime Adapters:**
- Purpose: Persist source state, enforce authority, run source mutations/queries, and return redacted exact contracts.
- Location: `convex/*.ts`, `convex/*Store.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/authz.ts`
- Contains: `queryGeneric`/`mutationGeneric` functions, `returns` validators, authz helpers, table-specific store/load/persist helpers, runtime DB adapters.
- Depends on: `src/modules/**/public.ts`, `src/modules/**/internal/schema.ts`, `convex/values`, `convex/server`.
- Used by: Server source ports through function references such as `catalog:publishBusinessCatalog` and `registry:listPublicBusinessCatalog`.

**Guardrails and Tests:**
- Purpose: Keep route/module boundaries, copy claims, source-mined code, and broad TypeScript holes enforceable.
- Location: `src/lib/ui/contract-scans.ts`, `tests/imports/`, `tests/types/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Contains: Runtime scanners, fixture scans, unit/integration/e2e/deploy-smoke suites.
- Depends on: Vitest, Playwright, source files under `src/` and `convex/`.
- Used by: `package.json` test scripts.

## Data Flow

### Primary Request Path

1. User opens the owner claim route. `src/routes/claim.tsx:123` defines `/claim`; the component validates form state with `validatePublicOwnerClaimFlowInput` from `src/modules/catalog/public.ts:303`.
2. The route submits through `submitOwnerClaimServer`, a POST server function in `src/modules/catalog/owner-claim.functions.ts:145`.
3. `submitOwnerClaimThroughSource` builds claim/publish operation keys and source-write admission from TanStack context (`src/modules/catalog/owner-claim.functions.ts:172`, `src/modules/catalog/owner-claim.functions.ts:182`, `src/modules/catalog/owner-claim.functions.ts:205`).
4. The server bridge calls Convex source mutations through `ownerCatalogSourcePort` and `callSourceMutation` (`src/modules/catalog/owner-claim.functions.ts:377`, `src/modules/catalog/owner-claim.functions.ts:379`).
5. Convex `business:claimBusiness` requires source-write admission and derives the owner actor from Clerk identity (`convex/business.ts:167`, `convex/business.ts:185`, `convex/business.ts:190`).
6. Convex `catalog:publishBusinessCatalog` validates source-write admission, derives actor authority, checks operation-key replay/conflict, upserts services, queues registry/discovery attempts, and writes audit/effect references (`convex/catalog.ts:209`, `convex/catalog.ts:222`, `convex/catalog.ts:227`, `convex/catalog.ts:293`, `convex/catalog.ts:338`, `convex/catalog.ts:345`).
7. The server bridge returns a route-safe catalog by redacting source hashes before the route navigates to status/success readback (`src/modules/catalog/owner-claim.functions.ts:224`, `src/modules/catalog/owner-claim.functions.ts:337`).

### Public Business Page and SEO Flow

1. `/$slug` loader calls `readPublicBusinessPageServer` and builds SEO from returned catalog data (`src/routes/$slug.tsx:32`, `src/routes/$slug.tsx:33`, `src/routes/$slug.tsx:44`).
2. `readPublicBusinessPageServer` validates `{ slug }` and delegates to the catalog source port (`src/modules/catalog/owner-claim.functions.ts:153`, `src/modules/catalog/owner-claim.functions.ts:273`, `src/modules/catalog/owner-claim.functions.ts:278`).
3. The public catalog query uses `callPublicSourceQuery` and the Convex `catalog:getPublicBusinessCatalogBySlug` function (`src/modules/catalog/owner-claim.functions.ts:382`, `convex/catalog.ts:370`).
4. Convex reads the business by slug, reconstructs the public catalog from source tables, hides suppressed/non-public records, and returns only the public contract (`convex/catalog.ts:376`, `convex/catalog.ts:385`, `convex/catalog.ts:706`).
5. The route renders AE public components and emits title, description, canonical URL, robots directive, and JSON-LD through `src/modules/seo/public.ts:38`.

### Registry and API Flow

1. `/registry` validates search params, declares loader deps, and calls `readRegistryRouteServer` (`src/routes/registry.tsx:45`, `src/routes/registry.tsx:56`, `src/routes/registry.tsx:68`).
2. The loader chooses list vs search and calls registry source functions (`src/routes/registry.tsx:83`, `src/modules/registry/registry.functions.ts:41`, `src/modules/registry/registry.functions.ts:47`).
3. Runtime list/search/detail calls use public Convex queries unless `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` enables fixture state (`src/modules/registry/registry.functions.ts:78`, `src/modules/registry/registry.functions.ts:87`).
4. API endpoints `/api/businesses`, `/api/businesses/search`, and `/api/businesses/$slug` reuse the same module source functions instead of route-local state (`src/routes/api.businesses.ts:8`, `src/routes/api.businesses.search.ts:13`, `src/routes/api.businesses.$slug.ts:9`).

### Discovery File Flow

1. `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and `/api/discovery/schema` are server route handlers, not static files (`src/routes/$slug.ucp.ts:14`, `src/routes/llms[.]txt.ts:9`, `src/routes/sitemap[.]xml.ts:9`, `src/routes/robots[.]txt.ts:6`, `src/routes/api.discovery.schema.ts:29`).
2. Discovery source ports call Convex public queries for manifest/llms/sitemap data, with fixture-only fallback for local e2e (`src/modules/discovery/discovery.functions.ts:39`, `src/modules/discovery/discovery.functions.ts:58`, `src/modules/discovery/discovery.functions.ts:67`).
3. `buildCatalogDiscoveryManifest` derives AE-hosted UCP fallback from `PublicCatalogContract`, marks routes as tested, forces `callable: false` and `paymentRequired: false`, and sanitizes public text (`src/modules/discovery/internal/ucp-manifest.ts:11`, `src/modules/discovery/internal/ucp-manifest.ts:103`, `src/modules/discovery/internal/ucp-manifest.ts:130`).
4. The developer discovery route executes the public API/discovery handlers in-process to build route health snapshots (`src/routes/api.discovery.schema.ts:106`, `src/routes/api.discovery.schema.ts:152`, `src/routes/api.discovery.schema.ts:158`).

### Owner/Admin Readback Flow

1. Owner routes load source-owned queues/details through module server functions (`src/routes/owner.inquiries.tsx:38`, `src/routes/owner.actions.tsx:37`, `src/routes/owner.business-actions.tsx:93`).
2. Server functions call authenticated Convex queries and translate missing auth/owner into fail-closed result unions (`src/modules/inquiries/inquiry.functions.ts:318`, `src/modules/protected-action/contact-follow-up.functions.ts:181`, `src/modules/business-action/business-action.functions.ts:332`).
3. Admin routes call source-owned admin readback/reconstruction functions and return denied readbacks when membership cannot be resolved (`src/routes/admin.claims.tsx:10`, `src/routes/admin.protected-actions.tsx:36`, `src/routes/admin.business-actions.tsx:101`, `src/modules/security/admin-readback.functions.ts:100`).
4. Convex resolves admin membership from `adminMemberships` by Clerk subject; route-only or env-only admin authority is not a valid authority path (`convex/authz.ts:50`, `convex/authz.ts:60`, `convex/security.ts:686`).

**State Management:**
- Durable source state lives in Convex tables composed by `convex/schema.ts:15`.
- Pure module state shapes live under `src/modules/*/public.ts` and are exercised in unit tests before being persisted by Convex adapters.
- Runtime state changes use operation keys, correlation IDs, typed audit events, projection attempts, and no-repair/readback records (`src/modules/observability/public.ts:31`, `src/modules/observability/public.ts:71`, `convex/catalog.ts:322`).
- Local e2e bypasses are explicit environment-gated fallbacks in server bridge files (`src/modules/catalog/owner-claim.functions.ts:417`, `src/modules/registry/registry.functions.ts:93`, `src/modules/discovery/discovery.functions.ts:73`).

## Key Abstractions

**Public Seam Files:**
- Purpose: Stable import boundary for each domain.
- Examples: `src/modules/business/public.ts`, `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `src/modules/discovery/public.ts`, `src/modules/security/public.ts`
- Pattern: Export const tuple values, types, result unions, source-state shapes, and re-exported pure functions from `internal/`.

**Server Bridge Files:**
- Purpose: TanStack Start RPC boundary and Convex source transport wrapper.
- Examples: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/business-action/business-action.functions.ts`
- Pattern: Define Zod schemas, `createServerFn().validator(...).handler(...)`, source function references, local e2e bypass, and source error mapping.

**Convex Source Functions:**
- Purpose: Durable source-of-truth reads and writes.
- Examples: `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/businessActions.ts`
- Pattern: `queryGeneric`/`mutationGeneric` with exact args/returns validators, `resolveBusinessActor`/`resolveAdminAuthority`, `requireSourceWrite`, indexed queries, and redacted result contracts.

**Module-Owned Schema Fragments:**
- Purpose: Keep table definitions near domain contracts while preserving one Convex schema composition root.
- Examples: `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/security/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `convex/businessActionStore.ts`
- Pattern: Export `*Tables` fragments using `defineTable`, literal validators through `literalUnion`, and named indexes used by Convex functions.

**Readbacks:**
- Purpose: Return source-owned, operator/owner/public-safe state instead of raw rows.
- Examples: `PublicOwnerStatusRouteReadback` in `src/modules/catalog/public.ts:214`, `AdminShellReadback` in `src/modules/security/public.ts:294`, `OwnerInboxReadback` from `src/modules/inquiries/public.ts:40`, `PublicActionReceiptReadback` from `src/modules/business-action/public.ts:43`
- Pattern: Discriminated unions and allowlisted projections with private refs, source hashes, raw contact, provider payloads, and secrets excluded from public routes.

**Operation Keys and Audit Events:**
- Purpose: Idempotency, replay detection, consequential-event audit, and repair/readback traces.
- Examples: `src/modules/observability/public.ts:31`, `src/modules/observability/public.ts:71`, `convex/catalog.ts:293`, `convex/catalog.ts:322`
- Pattern: Closed literal event/target unions, `operationKey`, `correlationId`, redacted payload JSON, payload hashes, effect refs.

## Entry Points

**Development/build runtime:**
- Location: `vite.config.ts`
- Triggers: `npm run dev`, `npm run build`, `npm run start`
- Responsibilities: Configure TanStack Start, Nitro, React, Tailwind, and path aliases for Vite.

**TanStack request middleware:**
- Location: `src/start.ts`
- Triggers: Every TanStack Start request/server function.
- Responsibilities: CSRF filtering for server functions, source-write request context injection, Clerk middleware.

**Router factory:**
- Location: `src/router.tsx`
- Triggers: Client/server app boot.
- Responsibilities: Register generated route tree, default preload mode, not-found component, scroll restoration, router type registration.

**Root route:**
- Location: `src/routes/__root.tsx`
- Triggers: All route renders.
- Responsibilities: HTML shell, global head metadata, CSS link, Clerk provider.

**Public pages:**
- Location: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/claim.tsx`, `src/routes/privacy.remove-business.tsx`
- Triggers: Browser navigation.
- Responsibilities: Render AE public UX, loader/server function calls, form submission, public SEO.

**Owner pages:**
- Location: `src/routes/owner.status.tsx`, `src/routes/owner.inquiries*.tsx`, `src/routes/owner.actions*.tsx`, `src/routes/owner.business-actions*.tsx`
- Triggers: Owner navigation.
- Responsibilities: Owner readbacks, queues, detail pages, receipts, and owner mutation actions.

**Admin pages:**
- Location: `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions*.tsx`, `src/routes/admin.business-actions*.tsx`
- Triggers: Admin/operator navigation.
- Responsibilities: Fail-closed admin readbacks and reconstruction views.

**Public APIs:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: HTTP GET.
- Responsibilities: Public registry list/search/detail JSON.

**Discovery APIs/files:**
- Location: `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/api.discovery.examples.ts`, `src/routes/api.discovery.fixtures.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`
- Triggers: HTTP GET.
- Responsibilities: UCP fallback JSON, developer discovery schema/examples, route parity snapshots, llms/sitemap/robots files.

**Webhook/dispatch APIs:**
- Location: `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- Triggers: Provider/system HTTP POST.
- Responsibilities: Verify signatures/bearer conditions, normalize provider evidence, forward redacted source writes through module server functions.

**Convex source functions:**
- Location: `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/protectedActions.ts`, `convex/businessActions.ts`, `convex/security.ts`, `convex/observability.ts`
- Triggers: Convex HTTP client calls from `src/lib/server/convex-source.ts`.
- Responsibilities: Durable source reads/writes, authority, source-write checks, projections, readbacks.

## Architectural Constraints

- **Threading:** Runtime TypeScript executes in the Node/Vite/TanStack event loop and Convex function runtimes. No worker-thread or background job framework is present; durable retry/repair is represented as source-state attempts and operator controls.
- **Global state:** Test/local bypass ports and in-memory local route state exist in `src/modules/registry/registry.functions.ts:33`, `src/modules/discovery/discovery.functions.ts:29`, and `src/modules/catalog/internal/owner-public-flow.ts:116`. Keep production paths on Convex source functions.
- **Generated code:** `src/routeTree.gen.ts` is generated and must not be edited by hand. `convex/_generated/` is excluded from TypeScript source ownership and should not be treated as a domain interface.
- **Authority:** Browser payloads are never authority for owner/admin identity. Owner authority is derived in Convex by `resolveBusinessActor`; admin authority is derived by `resolveAdminAuthority` plus `adminMemberships` (`convex/authz.ts:35`, `convex/authz.ts:50`).
- **Secrets:** Environment-backed secrets are read server-side only (`src/lib/server/convex-source.ts:168`, `src/lib/server/source-write-admission.ts:70`, `convex/auth.config.ts:3`). Do not read or quote `.env*` files.
- **Route imports:** Routes must not import Convex transport, provider SDKs, Convex schema, or module internals. The route-boundary scanner encodes this (`src/lib/ui/contract-scans.ts:71`).
- **Module imports:** Cross-module private imports are forbidden; import another module through its public seam (`src/lib/ui/contract-scans.ts:61`).
- **Schema ownership:** Add tables in module-owned schema fragments, then compose them in `convex/schema.ts`. Do not turn `convex/schema.ts` into a monolithic model file.
- **Circular imports:** No circular import chain is documented or detected in the explored files. Keep `public.ts` as the outward dependency boundary to avoid cycles.

## Anti-Patterns

### Route-Owned Source Transport

**What happens:** A route imports `convex/browser`, `convex/server`, `convex/schema`, provider SDKs, or module internals and starts owning data access.
**Why it's wrong:** It bypasses source ports, route DTO redaction, source-write admission, and the route-boundary contract enforced by `src/lib/ui/contract-scans.ts:71`.
**Do this instead:** Add or reuse a module server bridge such as `src/modules/registry/registry.functions.ts:41` or `src/modules/catalog/owner-claim.functions.ts:145`, then call it from the route loader/handler.

### Cross-Module Internal Imports

**What happens:** A route or sibling module imports `src/modules/<domain>/internal/**` directly.
**Why it's wrong:** Internal files are allowed to change behind the module public contract, and direct imports make source-state rules unreviewable.
**Do this instead:** Export the needed type/function from the owning `src/modules/<domain>/public.ts`; only same-module `public.ts` files import `./internal/**` (`src/lib/ui/contract-scans.ts:763`).

### Browser-Supplied Authority

**What happens:** Client input supplies `ownerId`, `adminId`, `businessId` ownership, admin role, or provider/payment authority as proof.
**Why it's wrong:** Authority must come from Clerk/Convex identity, source-owned membership rows, signed source-write admission, and durable source state.
**Do this instead:** Derive owner/admin inside Convex (`convex/authz.ts:35`, `convex/authz.ts:50`), sign server mutations with `src/lib/server/source-write-admission.ts:33`, and return denied readbacks when authority cannot be resolved (`src/modules/security/admin-readback.functions.ts:100`).

### Route-Local Durable Fixtures

**What happens:** Runtime routes read hard-coded source rows or local arrays instead of source functions.
**Why it's wrong:** It creates false readbacks, bypasses Convex source state, and conflicts with source-mining/route-local fixture guardrails (`src/lib/ui/contract-scans.ts:96`).
**Do this instead:** Keep fixture helpers explicitly named as local/test helpers and route runtime handlers on durable source functions, as in `src/routes/api.businesses.ts:16` and `src/modules/registry/registry.functions.ts:87`.

## Error Handling

**Strategy:** Expected business failures return discriminated result unions; infrastructure/auth/source failures are mapped to fail-closed public/owner/admin readbacks.

**Patterns:**
- Use `{ kind: 'ok' | 'error', code, retryable, reason }` result unions in module contracts such as `src/modules/business/public.ts:147`, `src/modules/catalog/public.ts:250`, and `src/modules/inquiries/inquiry.functions.ts:217`.
- Map Convex/auth/source failures to safe route results in server bridge files (`src/modules/security/admin-readback.functions.ts:77`, `src/modules/protected-action/contact-follow-up.functions.ts:327`, `src/modules/business-action/business-action.functions.ts:390`).
- Use exact Convex `returns` validators for public functions and explicit rejected source-write outcomes (`convex/catalog.ts:209`, `convex/sourceWriteAdmission.ts:39`).
- Return `not_found`/`hidden` without leaking private state for public catalog and discovery (`convex/catalog.ts:370`, `src/routes/$slug.ucp.ts:22`).
- Preserve repairability through retry/no-repair source-state fields, not logs alone (`src/modules/registry/public.ts:41`, `src/modules/discovery/public.ts:30`, `src/modules/notification-outbox/public.ts:57`).

## Cross-Cutting Concerns

**Logging:** No central app logger is present. Consequential runtime evidence is captured as typed audit events, operation keys, funnel events, provider/readback records, projection attempts, and no-repair decisions in `src/modules/observability/public.ts` and Convex tables.

**Validation:** Route search params use `validateSearch` (`src/routes/registry.tsx:56`); server functions use Zod `.validator(...)` (`src/modules/catalog/owner-claim.functions.ts:145`, `src/modules/inquiries/inquiry.functions.ts:249`); Convex functions use `args` and `returns` validators (`convex/catalog.ts:209`, `convex/business.ts:167`); runtime scans reject broad TS holes (`src/lib/ui/contract-scans.ts:258`).

**Authentication:** Clerk middleware and provider wrap TanStack Start (`src/start.ts:10`, `src/routes/__root.tsx:33`). Convex auth validates Clerk JWT issuer config (`convex/auth.config.ts:3`) and derives identities inside Convex functions (`convex/authz.ts:35`).

**Authorization:** Owner/admin authority belongs to Convex/server boundaries, not route components. Admin membership reads from `adminMemberships` (`convex/authz.ts:60`); public routes receive redacted DTOs.

**Idempotency:** Source mutations require operation keys/correlation IDs and detect replay/conflict through `operationKeys` (`convex/catalog.ts:293`, `convex/catalog.ts:322`, `src/modules/observability/public.ts:31`).

**Redaction:** Public catalog routes strip source hashes (`src/modules/catalog/owner-claim.functions.ts:337`); discovery sanitizes public text (`src/modules/discovery/internal/ucp-manifest.ts:130`); private evidence projections explicitly exclude raw provider and private payload fields (`src/modules/observability/public.ts:597`).

**Source-mining and product-scope gates:** Runtime imports from backup/planning files, unsupported future protocol/action/payment claims, and route-local business-action fixtures are scanned in `src/lib/ui/contract-scans.ts:96`.

---

*Architecture analysis: 2026-06-30*
