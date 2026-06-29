<!-- refreshed: 2026-06-29 -->
# Architecture

**Analysis Date:** 2026-06-29

## System Overview

```text
+--------------------------------------------------------------------------------+
| TanStack Start application                                                      |
| `src/start.ts`, `src/router.tsx`, `src/routes/*`, `src/routeTree.gen.ts`         |
+-------------------------+-------------------------+----------------------------+
| Public/customer routes  | Owner/admin routes      | JSON/text route handlers   |
| `src/routes/$slug.tsx`  | `src/routes/owner.*`    | `src/routes/api.*.ts`      |
| `src/routes/claim.tsx`  | `src/routes/admin.*`    | `src/routes/llms[.]txt.ts` |
+------------+------------+-------------+-----------+-------------+------------+
             |                          |                         |
             v                          v                         v
+--------------------------------------------------------------------------------+
| Route adapters and server functions                                             |
| `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`               |
+--------------------------------------------------------------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| Domain modules                                                                  |
| `src/modules/*/public.ts`, `src/modules/*/internal/*.ts`                        |
+--------------------------------------------------------------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| Convex durable runtime and schema                                               |
| `convex/*.ts`, `convex/schema.ts`, `src/modules/*/internal/*schema.ts`          |
+--------------------------------------------------------------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| Source-owned tables, audit, projections, discovery, notifications, readbacks    |
| Convex tables composed from module-owned schema fragments                       |
+--------------------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start bootstrap | Installs request middleware, CSRF protection for server functions, and Clerk request middleware unless local E2E bypass is enabled. | `src/start.ts` |
| Router factory | Builds the TanStack Router from the generated route tree and registers router types globally. | `src/router.tsx` |
| Root route | Adds global metadata, stylesheet link, document shell, scripts, and conditional Clerk provider wrapping. | `src/routes/__root.tsx` |
| File routes | Own page loaders, route handlers, UI composition, and thin adapter calls into module seams. | `src/routes/*` |
| Public route shells | Provide shared page structure and navigation for public and admin surfaces. | `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeAdminShell.tsx` |
| shadcn primitives | Provide source-owned UI primitives used by AE components and routes. | `src/components/ui/*`, `components.json` |
| Domain public seams | Export exact domain contracts, value unions, validators, and pure domain functions. Use these from routes and sibling modules. | `src/modules/*/public.ts` |
| Domain internals | Own implementation details, pure state transitions, validators, and Convex table fragments. | `src/modules/*/internal/*.ts` |
| Server function adapters | Validate route inputs with Zod, bridge UI/server routes to Convex function references, and provide local E2E bypass readbacks where supported. | `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts` |
| Convex source client | Central helper for authenticated and public Convex HTTP calls with Clerk token acquisition and fail-closed missing-config errors. | `src/lib/server/convex-source.ts` |
| Convex functions | Expose durable query/mutation APIs with Convex validators, auth resolution, CSRF checks, table writes, and exact return contracts. | `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/security.ts`, `convex/observability.ts` |
| Convex schema composition | Composes module-owned table fragments into the Convex schema. Keep this file thin. | `convex/schema.ts` |
| Runtime guardrails | Enforce route boundaries, private-import rules, future-surface restrictions, UI contracts, copy claims, and TypeScript standards. | `src/lib/ui/contract-scans.ts`, `tests/imports/*.test.ts`, `tests/ui-contract/*.test.ts`, `tests/copy/*.test.ts` |

## Pattern Overview

**Overall:** Modular TanStack Start application with source-owned domain seams and Convex as the durable state/API boundary.

**Key Characteristics:**
- File-based routing lives in `src/routes/*`; generated routing lives only in `src/routeTree.gen.ts`.
- Routes behave as adapters: validate search params/input, call server functions or module public seams, and render AE/shadcn components.
- Cross-module calls go through `src/modules/<domain>/public.ts`; module internals stay behind the owning domain.
- Convex table definitions live beside domain code in `src/modules/*/internal/*schema.ts`, then compose through `convex/schema.ts`.
- Durable runtime functions live in `convex/*.ts` and expose exact `args` and `returns` validators.
- State/result contracts use literal unions and branded IDs from `src/modules/common/*`, not broad strings.
- Public outputs redact private fields and source hashes at route/server-function boundaries.
- Local deterministic readbacks exist only behind explicit seams such as `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.

## Layers

**App Bootstrap:**
- Purpose: Configure app-wide request and document behavior.
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`
- Contains: TanStack Start creation, router creation, root document, Clerk provider wrapping.
- Depends on: `@tanstack/react-start`, `@tanstack/react-router`, `@clerk/tanstack-react-start`.
- Used by: Vite/TanStack Start runtime via `vite.config.ts`.

**Routing:**
- Purpose: Own URL shape, loaders, route handlers, and page composition.
- Location: `src/routes`
- Contains: Page routes (`src/routes/claim.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`), API routes (`src/routes/api.businesses.ts`), discovery routes (`src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`), admin routes (`src/routes/admin.*.tsx`), owner routes (`src/routes/owner.*.tsx`).
- Depends on: AE components, shadcn UI primitives, module public seams, module server functions.
- Used by: Generated route tree in `src/routeTree.gen.ts`.

**Server Function / Source Adapter Layer:**
- Purpose: Bridge route/UI code to Convex and provider-side operations with typed input validation.
- Location: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/lib/server/*`
- Contains: `createServerFn` handlers, Zod validators, source query/mutation references, Convex HTTP client creation, provider config readers.
- Depends on: `src/lib/server/convex-source.ts`, Clerk server auth, Convex HTTP client, domain public contracts.
- Used by: Page routes and server route handlers.

**Domain Public Seams:**
- Purpose: Define the stable API each domain exposes to routes and sibling modules.
- Location: `src/modules/*/public.ts`
- Contains: Domain value unions, exact DTO/result types, exported pure functions, source state constructors.
- Depends on: Owning module internals and shared `src/modules/common/*` helpers.
- Used by: Routes, server functions, Convex functions, tests, and other domains.

**Domain Internals:**
- Purpose: Own pure state transitions, validation, projection builders, and table fragments.
- Location: `src/modules/*/internal`
- Contains: `claim.ts`, `publish.ts`, `commands.ts`, `search.ts`, `schema.ts`, validators, redaction and projection logic.
- Depends on: Shared common helpers and other domains through their public seams.
- Used by: Same-domain `public.ts`, Convex schema composition, and selected same-domain tests.

**Convex Runtime:**
- Purpose: Persist durable source state and expose authenticated/public queries and mutations.
- Location: `convex`
- Contains: Auth config, authorization helpers, table adapters, query/mutation wrappers, schema composition.
- Depends on: Convex runtime packages, Clerk identity, domain public seams, module-owned schema fragments.
- Used by: TanStack Start server functions and API route handlers through Convex HTTP client references.

**UI System:**
- Purpose: Provide reusable product shells, status/readback components, and shadcn primitives.
- Location: `src/components/ae`, `src/components/ui`, `src/styles`
- Contains: AE shells, form sections, status badges/cards, readback panels, shadcn primitives, Tailwind v4 tokens.
- Depends on: shadcn/radix-nova conventions in `components.json`, semantic CSS variables in `src/styles/tokens.css`.
- Used by: Page routes under `src/routes`.

**Verification Guardrails:**
- Purpose: Make architecture boundaries executable.
- Location: `tests/imports`, `tests/types`, `tests/ui-contract`, `tests/copy`, `src/lib/ui/contract-scans.ts`
- Contains: Static scans for import boundaries, route boundaries, TypeScript holes, future-surface terms, UI utility misuse, and copy overclaims.
- Depends on: Vitest and scanner helpers.
- Used by: `npm run test:imports`, `npm run test:ts-standards`, `npm run test:ui-contract`, `npm run test:copy`.

## Data Flow

### Primary Claim And Publish Path

1. Owner opens the claim page and submits source facts (`src/routes/claim.tsx:123`, `src/routes/claim.tsx:157`).
2. The route validates the form through the catalog public seam before calling the server function (`src/routes/claim.tsx:160`, `src/routes/claim.tsx:170`).
3. The server function validates input with Zod and delegates to `submitOwnerClaimThroughSource` (`src/modules/catalog/owner-claim.functions.ts:130`, `src/modules/catalog/owner-claim.functions.ts:142`).
4. The source adapter uses local deterministic state only when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is true (`src/modules/catalog/owner-claim.functions.ts:143`, `src/modules/catalog/owner-claim.functions.ts:411`).
5. In durable mode, it calls Convex mutations `business:claimBusiness` and `catalog:publishBusinessCatalog` with operation/correlation keys (`src/modules/catalog/owner-claim.functions.ts:125`, `src/modules/catalog/owner-claim.functions.ts:149`, `src/modules/catalog/owner-claim.functions.ts:171`).
6. Convex claim runtime verifies CSRF, resolves Clerk-derived actor authority, normalizes facts, detects duplicate claims, and inserts owner/business/context/claim rows (`convex/business.ts:166`, `convex/business.ts:183`, `convex/business.ts:193`, `convex/business.ts:287`, `convex/business.ts:302`, `convex/business.ts:312`).
7. Convex catalog runtime verifies ownership, validates service facts, reserves idempotency through `operationKeys`, writes services/capabilities, records audit, and queues registry/discovery attempts (`convex/catalog.ts:209`, `convex/catalog.ts:231`, `convex/catalog.ts:254`, `convex/catalog.ts:296`, `convex/catalog.ts:340`, `convex/catalog.ts:348`).
8. Server function redacts source hashes before returning route DTOs (`src/modules/catalog/owner-claim.functions.ts:188`, `src/modules/catalog/owner-claim.functions.ts:294`).

### Public Business And Registry Read Path

1. Public page route loads a business by slug through `readPublicBusinessPageServer` (`src/routes/$slug.tsx:15`, `src/routes/$slug.tsx:17`).
2. The catalog source adapter calls the public Convex query `catalog:getPublicBusinessCatalogBySlug` unless local E2E bypass is active (`src/modules/catalog/owner-claim.functions.ts:127`, `src/modules/catalog/owner-claim.functions.ts:230`, `src/modules/catalog/owner-claim.functions.ts:235`).
3. The public page builds SEO metadata from the returned public route catalog (`src/routes/$slug.tsx:22`, `src/routes/$slug.tsx:27`).
4. Registry UI validates search params and calls a route server function (`src/routes/registry.tsx:46`, `src/routes/registry.tsx:60`).
5. Registry helper selects list or search reads from API helper functions (`src/routes/registry.tsx:75`, `src/routes/registry.tsx:78`, `src/routes/registry.tsx:82`).
6. API handlers call durable public registry query helpers and return `no-store` JSON (`src/routes/api.businesses.ts:34`, `src/routes/api.businesses.ts:68`, `src/routes/api.businesses.ts:88`).
7. Registry Convex queries read only published, non-suppressed businesses through indexes and public DTO projection (`convex/registry.ts:125`, `convex/registry.ts:137`, `convex/registry.ts:157`, `convex/registry.ts:271`).

### Discovery Read Path

1. UCP manifest route reads a public discovery query and strips internal `businessId` and `sourceHash` before responding (`src/routes/$slug.ucp.ts:27`, `src/routes/$slug.ucp.ts:35`, `src/routes/$slug.ucp.ts:77`).
2. `llms.txt` and `sitemap.xml` routes call public discovery query clients and return text responses (`src/routes/llms[.]txt.ts:21`, `src/routes/llms[.]txt.ts:29`, `src/routes/sitemap[.]xml.ts:23`, `src/routes/sitemap[.]xml.ts:31`).
3. `robots.txt` is built from the discovery public seam without Convex access (`src/routes/robots[.]txt.ts:6`, `src/routes/robots[.]txt.ts:14`).
4. Developer discovery executes route handlers in-process to build route-health snapshots (`src/routes/api.discovery.schema.ts:94`, `src/routes/api.discovery.schema.ts:101`, `src/routes/api.discovery.schema.ts:154`).
5. Discovery domain contracts explicitly mark callable and payment capabilities as false in manifests (`src/modules/discovery/public.ts:67`, `src/modules/discovery/public.ts:112`).
6. Convex discovery runtime owns manifest generation, invalidation, attempts, and exact return validators (`convex/discovery.ts:208`, `convex/discovery.ts:248`).

### Public Inquiry And Owner Inbox Path

1. Public inquiry route loads public business page state and builds route readback (`src/routes/$slug.inquiry.tsx:39`, `src/routes/$slug.inquiry.tsx:41`).
2. Submitted inquiry form data is validated by route-readback helpers before calling `submitPublicInquiryServer` (`src/routes/$slug.inquiry.tsx:89`, `src/routes/$slug.inquiry.tsx:99`).
3. Inquiry server function validates Zod input and calls `inquiries:submitPublicInquiry` through the public source mutation helper (`src/modules/inquiries/inquiry.functions.ts:249`, `src/modules/inquiries/inquiry.functions.ts:275`, `src/modules/inquiries/inquiry.functions.ts:284`).
4. Convex inquiry runtime owns exact validators, target checks, threads, messages, notification state, owner inbox readbacks, privacy tombstones, and operator reconstruction (`convex/inquiries.ts:80`, `convex/inquiries.ts:109`, `convex/inquiries.ts:170`, `convex/inquiries.ts:215`).
5. Owner inbox route calls a server function and maps source errors into a safe empty readback plus visible error copy (`src/routes/owner.inquiries.tsx:38`, `src/routes/owner.inquiries.tsx:58`).
6. Owner mutations use versioned thread commands and create operation/correlation keys in the server adapter (`src/modules/inquiries/inquiry.functions.ts:263`, `src/modules/inquiries/inquiry.functions.ts:267`, `src/modules/inquiries/inquiry.functions.ts:271`).

### Notification Provider Path

1. Provider-facing webhook route verifies Resend raw-body signatures before forwarding redacted event metadata to Convex (`src/routes/api.notification.resend-webhook.ts:16`, `src/routes/api.notification.resend-webhook.ts:59`, `src/routes/api.notification.resend-webhook.ts:65`).
2. Server-only provider helpers read required secrets from server env, not public env, and throw typed `NotificationProviderError` values when missing (`src/lib/server/notification-provider.ts:175`, `src/lib/server/notification-provider.ts:188`, `src/lib/server/notification-provider.ts:201`, `src/lib/server/notification-provider.ts:240`).
3. Notification Convex runtime validates dispatches, attempts, webhook events, readbacks, system-send reads, and repair decisions (`convex/notificationOutbox.ts:57`, `convex/notificationOutbox.ts:127`, `convex/notificationOutbox.ts:141`, `convex/notificationOutbox.ts:163`).

### Admin Readback Path

1. Admin routes call authenticated Convex queries through route-local server functions (`src/routes/admin.audit-events.tsx:15`, `src/routes/admin.index-health.tsx:32`).
2. Auth failures and missing membership return denied readbacks with empty row arrays (`src/routes/admin.audit-events.tsx:17`, `src/routes/admin.audit-events.tsx:78`, `src/routes/admin.index-health.tsx:34`, `src/routes/admin.index-health.tsx:229`).
3. Convex authz resolves admin membership from Clerk identity and active `adminMemberships` rows (`convex/authz.ts:50`, `convex/authz.ts:60`).
4. Admin UI renders readback rows via the shared admin shell and readback panel (`src/routes/admin.index-health.tsx:81`, `src/components/ae/layout/AeAdminShell.tsx:20`).

**State Management:**
- Client UI state is component-local with React hooks in route files such as `src/routes/claim.tsx` and `src/routes/$slug.inquiry.tsx`.
- Server state is source-owned domain state persisted in Convex tables composed by `convex/schema.ts`.
- Pure domain tests and local E2E bypasses use in-memory source state constructors such as `createEmptyInquirySourceState` from `src/modules/inquiries/public.ts` and `createDefaultRegistrySourceState` from `src/modules/registry/public.ts`.
- Idempotency and replay are modeled through operation keys in `src/modules/observability/public.ts`, `src/modules/observability/internal/schema.ts`, and Convex write handlers.

## Key Abstractions

**Domain Public Seam:**
- Purpose: Stable import boundary for each domain.
- Examples: `src/modules/business/public.ts`, `src/modules/catalog/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/registry/public.ts`, `src/modules/security/public.ts`.
- Pattern: Export value unions, types, pure functions, and selected source-state builders from internals.

**Source-Owned State:**
- Purpose: Represent truth as owned rows, source hashes, readbacks, audit events, and repair attempts instead of provider-side claims.
- Examples: `BusinessSourceState` in `src/modules/business/public.ts`, `CatalogPublishSourceState` in `src/modules/catalog/public.ts`, `RegistrySourceState` in `src/modules/registry/public.ts`, `InquirySourceState` in `src/modules/inquiries/public.ts`.
- Pattern: Pure functions accept source state plus command objects and return exact `kind`/`code` results.

**Convex Function Reference:**
- Purpose: Keep server functions independent from generated Convex API output by creating named references.
- Examples: `sourceMutation('catalog:publishBusinessCatalog')` in `src/lib/server/convex-source.ts`, `sourceQuery('registry:listPublicBusinessCatalog')` in `src/routes/api.businesses.ts`.
- Pattern: `makeFunctionReference` wrappers with typed `FunctionReference` generics.

**Branded IDs And Hashes:**
- Purpose: Keep domain IDs distinct from arbitrary strings.
- Examples: `OwnerId`, `BusinessId`, `OperationKey`, `SourceHash` in `src/modules/common/ids.ts`; `stableHash` in `src/modules/common/stable-hash.ts`.
- Pattern: Use `brandNonEmpty` and deterministic stable hashes for source refs, operations, payload hashes, and readbacks.

**Module Result:**
- Purpose: Standard result contract for pure domain operations.
- Examples: `ModuleResult`, `ok`, `error` in `src/modules/common/result.ts`.
- Pattern: Return `{ kind: 'ok', code, ...payload }` or `{ kind: 'error', code, retryable, ...payload }`.

**Readback:**
- Purpose: Expose operator/customer visible state without leaking private rows.
- Examples: `PublicOwnerStatusReadback` in `src/modules/catalog/public.ts`, `AdminShellReadback` in `src/modules/security/public.ts`, `InquiryOperatorReconstructionReadback` in `src/modules/inquiries/public.ts`.
- Pattern: Return explicit `allowed`/`denied` or `available`/`hidden` states with rows redacted or omitted.

**Route Snapshot:**
- Purpose: Verify discovery route parity by executing route handlers and collecting response metadata.
- Examples: `buildDeveloperDiscoveryRouteSnapshot` in `src/routes/api.discovery.schema.ts`.
- Pattern: In-process `Request` objects call route handler functions directly.

## Entry Points

**Vite/TanStack Start Dev Server:**
- Location: `vite.config.ts`
- Triggers: `npm run dev`
- Responsibilities: Run TanStack Start, Nitro, React, and Tailwind Vite plugins on port 3000.

**App Start Instance:**
- Location: `src/start.ts`
- Triggers: TanStack Start runtime.
- Responsibilities: Apply CSRF middleware to server functions and Clerk middleware to requests.

**Router Factory:**
- Location: `src/router.tsx`
- Triggers: TanStack Start/router runtime.
- Responsibilities: Create router with generated route tree, intent preloading, not-found component, and scroll restoration.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: All route renders.
- Responsibilities: Add metadata, stylesheet, Clerk provider wrapping, and scripts.

**Public Product Routes:**
- Location: `src/routes/index.tsx`, `src/routes/claim.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Browser navigation.
- Responsibilities: Render public claim, catalog, registry, and inquiry workflows.

**Public API Routes:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: GET requests under `/api/businesses`.
- Responsibilities: Return public catalog list/search/detail JSON from durable registry source state.

**Discovery Routes:**
- Location: `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/developers.discovery.tsx`
- Triggers: Public discovery URLs and developer discovery page/API requests.
- Responsibilities: Return AE-hosted UCP fallback, text discovery files, schema artifacts, route health, and support matrix readbacks.

**Owner Routes:**
- Location: `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, `src/routes/owner.status.tsx`
- Triggers: Owner navigation.
- Responsibilities: Render owner inbox, detail, protected-action queue/detail, receipts, and status readbacks.

**Admin Routes:**
- Location: `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions.tsx`
- Triggers: Admin navigation.
- Responsibilities: Render denied or authorized readbacks for claims, audit, index health, inquiries, and protected-action reconstruction.

**Provider Routes:**
- Location: `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`
- Triggers: Provider/system HTTP requests.
- Responsibilities: Verify server-side secrets/signatures, dispatch provider calls, record redacted provider results, or fail closed.

**Convex Runtime Functions:**
- Location: `convex/*.ts`
- Triggers: Convex HTTP client query/mutation calls from server functions and route handlers.
- Responsibilities: Validate arguments and returns, resolve authority, persist source-owned state, and return exact readbacks.

## Architectural Constraints

- **Threading:** The frontend/server runtime uses JavaScript async execution. Convex functions execute as async query/mutation handlers and use Convex transactional semantics for mutations.
- **Global state:** Test seam overrides exist in module scope, including `publicRegistryQueryClientForTests` in `src/routes/api.businesses.ts` and `publicDiscoveryQueryClientForTests` in `src/modules/discovery/public.ts`. Reset overrides in tests through their returned cleanup functions.
- **Generated files:** Do not edit `src/routeTree.gen.ts`; TanStack Router overwrites it. Add routes under `src/routes` and regenerate through the normal route generation flow.
- **Route boundaries:** Routes must not import Convex schema or module internals. `src/lib/ui/contract-scans.ts` enforces this with `route-convex-schema-import` and `route-private-module-import`.
- **Module private imports:** Sibling modules and routes must use `src/modules/<domain>/public.ts`. Only the owning `public.ts` and `convex/schema.ts` schema composition are allowed to import module internals directly.
- **Schema ownership:** Add table definitions under the owning `src/modules/<domain>/internal/schema.ts` or `convex-schema.ts`, then compose in `convex/schema.ts`.
- **Convex validators:** Convex functions use explicit `args` and `returns`; avoid `v.any()` and broad return types.
- **Authentication:** Owner/admin authority comes from Clerk/Convex identity and source-owned rows, not browser-supplied owner/admin payloads (`convex/authz.ts`).
- **CSRF:** TanStack Start adds CSRF middleware for server functions in `src/start.ts`; domain mutations also call `assertCsrf` in runtime handlers.
- **Public data:** Public route DTOs and discovery outputs redact private IDs/source hashes where exposed to public clients (`src/modules/catalog/owner-claim.functions.ts`, `src/routes/$slug.ucp.ts`).
- **Future surfaces:** Runtime scans allow future-surface terms only in owned module/route contexts listed in `src/lib/ui/contract-scans.ts`; parked routes live under `src/future-phases`.
- **Circular imports:** No circular dependency chain is declared in config. Preserve the direction `routes -> public seams/server functions -> domain internals -> schema/Convex`, and do not make module internals import routes.

## Anti-Patterns

### Route Imports Module Internals

**What happens:** A route imports `src/modules/<domain>/internal/*`.
**Why it's wrong:** It bypasses the domain public seam and violates the route adapter pattern enforced by `tests/imports/route-boundary.test.ts`.
**Do this instead:** Export the needed contract/function from `src/modules/<domain>/public.ts` or a domain server-function file such as `src/modules/inquiries/inquiry.functions.ts`, then import that from `src/routes/*`.

### Cross-Module Private Import

**What happens:** One domain imports another domain's `internal/*` file.
**Why it's wrong:** It couples domains to implementation details and violates `scanPrivateImports` in `src/lib/ui/contract-scans.ts`.
**Do this instead:** Add an explicit public contract to the target domain's `public.ts`, following `src/modules/catalog/public.ts` importing its own `./internal/*` files.

### Route-Level Convex Schema Coupling

**What happens:** A route imports `convex/schema.ts` or generated Convex document contracts.
**Why it's wrong:** Routes must stay transport/UI adapters and not depend on durable storage layout.
**Do this instead:** Use server functions and typed source query/mutation references in `src/lib/server/convex-source.ts` or route helper functions such as `src/routes/api.businesses.ts`.

### Provider Success As Source Truth

**What happens:** Resend, Novu, Autumn, or other provider responses become the authoritative workflow state.
**Why it's wrong:** The architecture records provider state as redacted attempts/readbacks while source-owned rows remain truth.
**Do this instead:** Write provider results through source-owned outbox/operation seams such as `src/modules/notification-outbox/public.ts` and `convex/notificationOutbox.ts`.

### Broad State Strings

**What happens:** Runtime contracts use `status: string`, unchecked status literals, or explicit `any`.
**Why it's wrong:** `tests/imports/ts-standards.test.ts` and `tests/types/domain-contracts.test.ts` require exact unions and validators.
**Do this instead:** Add `...Values` arrays and exported union types in the owning public seam, plus matching validators in owning internals.

### Direct Secret Use In Routes

**What happens:** Browser routes or public helpers read provider secret env vars or expose provider details.
**Why it's wrong:** Server-only provider logic belongs in `src/lib/server/*` and route handlers must return redacted results.
**Do this instead:** Read secrets in helpers like `src/lib/server/notification-provider.ts` and return typed errors/readbacks from route handlers.

## Error Handling

**Strategy:** Fail closed with typed result objects and redacted readbacks. User-facing routes convert source errors into safe visible states; admin routes return denied readbacks with no private rows when authority is absent.

**Patterns:**
- Domain pure functions return exact `ModuleResult` style objects with `kind`, `code`, and `retryable` (`src/modules/common/result.ts`).
- Server adapters catch `ConvexSourceError` and provider errors, then return typed error results (`src/modules/inquiries/inquiry.functions.ts`, `src/routes/api.notification.resend-webhook.ts`).
- Missing Convex URL or missing auth throws typed `ConvexSourceError` in the shared source client (`src/lib/server/convex-source.ts`).
- Admin route readbacks catch authenticated query failures and return `kind: 'denied'` with empty rows (`src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`).
- Public API and discovery routes set `Cache-Control` explicitly and use 404 objects for hidden/not-found public records (`src/routes/api.businesses.$slug.ts`, `src/routes/$slug.ucp.ts`).
- Provider seams throw typed errors for missing secrets, stale signatures, invalid signatures, invalid payloads, and provider failures (`src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`).

## Cross-Cutting Concerns

**Logging:** No centralized logging framework is detected. Observability is modeled as source-owned audit, funnel, operation key, operator control, provider attempt, and readback rows in `src/modules/observability/public.ts`, `src/modules/observability/internal/schema.ts`, and related Convex runtime files.

**Validation:** Client/route input uses Zod or domain validators (`src/routes/registry.tsx`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`). Convex runtime functions define explicit `args` and `returns` validators with `convex/values`.

**Authentication:** Clerk wraps the app in `src/routes/__root.tsx`, Clerk middleware runs from `src/start.ts`, Convex validates Clerk JWT issuer in `convex/auth.config.ts`, and runtime authority is resolved through `convex/authz.ts`.

**Authorization:** Owner authority resolves from Clerk identity to owner rows; admin authority resolves from active `adminMemberships` rows and domain permission checks in `src/modules/security/public.ts`.

**CSRF:** TanStack Start CSRF middleware applies to server functions in `src/start.ts`, while Convex mutations also call `assertCsrf` with allowed origins.

**Idempotency:** Commands carry operation keys and correlation IDs. `operationKeys` table/indexes in `src/modules/observability/internal/schema.ts` support replay/conflict decisions.

**Redaction:** Public route contracts omit source hashes/private owner details. Notification and inquiry readbacks store payload hashes and redacted JSON instead of raw provider/customer data.

**Styling:** Follow shadcn/radix-nova conventions from `components.json` and `.agents/skills/shadcn/SKILL.md`: use existing components, semantic tokens, `gap-*`, `FieldGroup`/`Field`, lucide icons with `data-icon`, and shadcn primitives before custom markup.

**Routing:** Follow TanStack Router file-based route guidance from `.codex/skills/tanstack-router/SKILL.md`: validate search params, use loaders for route data, use `Link` for navigation, and keep generated route tree unedited.

**Convex:** Follow Convex skill constraints from `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md`: organize functions by domain, require argument and return validators, use indexes instead of broad filters, and keep external API calls outside Convex query/mutation logic unless modeled as actions.

---

*Architecture analysis: 2026-06-29*
