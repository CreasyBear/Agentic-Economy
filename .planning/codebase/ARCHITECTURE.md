<!-- refreshed: 2026-06-29 -->
# Architecture

**Analysis Date:** 2026-06-29

## System Overview

```text
+--------------------------------------------------------------------------------+
| TanStack Start + TanStack Router application                                    |
| `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`|
+---------------------------+--------------------------+-------------------------+
| Public routes             | Owner routes             | Admin/operator routes   |
| `src/routes/index.tsx`    | `src/routes/owner.*`     | `src/routes/admin.*`    |
| `src/routes/$slug.tsx`    | `owner.inquiries.*`      | `admin.protected-*`     |
| `src/routes/registry.tsx` | `owner.actions.*`        | `admin.audit-events.tsx`|
+------------+--------------+-------------+------------+-------------+-----------+
             |                            |                          |
             v                            v                          v
+--------------------------------------------------------------------------------+
| Route adapters, server functions, and HTTP handlers                             |
| `src/modules/*/*.functions.ts`, `src/routes/api.*.ts`, `src/lib/server/*`       |
+--------------------------------------------------------------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| Domain public seams and source-owned pure state                                 |
| `src/modules/*/public.ts`, `src/modules/*/internal/*.ts`                        |
+--------------------------------------------------------------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| Convex durable runtime and composed schema                                      |
| `convex/*.ts`, `convex/schema.ts`, `src/modules/*/internal/*schema.ts`          |
+--------------------------------------------------------------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| Source-owned rows, idempotency, audit, readbacks, receipts, reconciliation      |
| Convex tables composed from module-owned fragments                              |
+--------------------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start bootstrap | Installs server-function CSRF, source-write admission, and Clerk request middleware except local E2E bypass. | `src/start.ts:6`, `src/start.ts:12` |
| Router factory | Creates the generated TanStack Router with intent preload, not-found fallback, and scroll restoration. | `src/router.tsx:5` |
| Root route | Owns document metadata, global CSS link, scripts, and conditional Clerk provider wrapping. | `src/routes/__root.tsx:8`, `src/routes/__root.tsx:32` |
| Active public routes | Render public catalog, registry, claim, inquiry, discovery, auth, privacy, sitemap, robots, and API surfaces. | `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`, `src/routes/api.businesses.ts` |
| Active owner routes | Render owner status, inquiry inbox/detail, protected-action queue/detail/receipt. Owner pages currently use `AePublicShell`. | `src/routes/owner.status.tsx`, `src/routes/owner.inquiries.tsx`, `src/routes/owner.actions.tsx` |
| Active admin routes | Render admin claims, audit, index health, inquiries, protected-action list/detail. | `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.protected-actions.tsx` |
| Provider/system routes | Receive or dispatch server-side notification provider events; billing webhooks are parked, not active. | `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts` |
| AE components | Provide product shells, page headers, status/readback primitives, form sections, and empty states over shadcn primitives. | `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeAdminShell.tsx`, `src/components/ae/status/AeStatusBadge.tsx` |
| Domain public seams | Export route-facing contracts, literal unions, pure operations, and source-state constructors. | `src/modules/business/public.ts`, `src/modules/protected-action/public.ts`, `src/modules/billing/public.ts` |
| Domain internals | Own validators, pure state transitions, projections, source-owned schema fragments, and provider normalization. | `src/modules/*/internal/*.ts` |
| Server function adapters | Validate route inputs, add source-write admission, and call Convex through named source references. | `src/modules/catalog/owner-claim.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/inquiries/inquiry.functions.ts` |
| Convex runtime functions | Expose durable query/mutation APIs with exact `args`/`returns`, source-write checks, authority resolution, and table persistence. | `convex/business.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/protectedActions.ts`, `convex/security.ts` |
| Convex schema composition | Composes module-owned tables, including billing, into one Convex schema. Keep this file thin. | `convex/schema.ts:14` |
| Billing module scaffold | Defines Phase 5 public seam, Autumn provider adapter, billing source state, offers, operations, provider events, receipts, reconciliation, and projections. | `src/modules/billing/public.ts:97`, `src/modules/billing/internal/schema.ts:222`, `src/modules/billing/internal/operations.ts:286` |
| Guardrail scanners | Enforce route boundaries, private-import rules, future route registration, copy claims, and TypeScript standards. | `src/lib/ui/contract-scans.ts:61`, `src/lib/ui/contract-scans.ts:71`, `src/lib/ui/contract-scans.ts:96` |

## Pattern Overview

**Overall:** Modular TanStack Start application with source-owned domain seams and Convex as the durable state/API boundary.

**Key Characteristics:**
- File routes live in `src/routes`; generated routing lives only in `src/routeTree.gen.ts`.
- Routes are adapters: validate input/search, call module public seams or server functions, and compose `src/components/ae` plus `src/components/ui`.
- Cross-domain imports go through `src/modules/<domain>/public.ts`; internals remain private to the owning module.
- Convex table definitions live beside domain code in `src/modules/*/internal/schema.ts` or `src/modules/*/internal/convex-schema.ts`, then compose in `convex/schema.ts`.
- Convex mutations and queries use explicit validators, `requireSourceWrite` for source writes, and Clerk-derived owner/admin identity from `convex/authz.ts`.
- State contracts use branded IDs and literal unions from `src/modules/common/ids.ts`, `src/modules/observability/public.ts`, and domain public seams.
- Provider results are evidence, not authority. Durable source rows, readbacks, receipts, and reconciliation decide public/owner/admin state.
- Parked Phase 5 billing routes live under `src/future-phases/05-paid-activation-money-rails/routes` and use `createParkedFileRoute`; they are not active route-tree entries.

## Layers

**App Bootstrap:**
- Purpose: Configure request middleware and root document behavior.
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`
- Contains: CSRF middleware, source-write admission, Clerk middleware/provider, router factory, root document.
- Depends on: `@tanstack/react-start`, `@tanstack/react-router`, `@clerk/tanstack-react-start`.
- Used by: Vite/TanStack Start runtime through `vite.config.ts`.

**Routing:**
- Purpose: Own URL shape, loaders, route handlers, and page composition.
- Location: `src/routes`
- Contains: Public pages (`src/routes/index.tsx`, `src/routes/$slug.tsx`), public APIs (`src/routes/api.businesses.ts`), owner pages (`src/routes/owner.*.tsx`), admin pages (`src/routes/admin.*.tsx`), notification provider routes (`src/routes/api.notification.*.ts`), discovery files (`src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`).
- Depends on: AE components, shadcn primitives, module public seams, module server functions, `src/lib/server/*`.
- Used by: Generated route tree in `src/routeTree.gen.ts`.

**Route Boundary Classes:**
- Public/customer: `src/routes/index.tsx`, `src/routes/claim.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/registry.tsx`, `src/routes/developers.discovery.tsx`, `src/routes/privacy.remove-business.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`.
- Public machine/API: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/api.discovery.*.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`.
- Owner-private: `src/routes/owner.status.tsx`, `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, `src/routes/owner.actions.$proposalId.receipt.tsx`.
- Admin/operator-private: `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/admin.protected-actions.$proposalId.tsx`.
- Provider/system: `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`.
- Parked Phase 5 billing: `src/future-phases/05-paid-activation-money-rails/routes/*.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.

**Server Function / Source Adapter Layer:**
- Purpose: Bridge route/UI code to Convex and provider-side operations with typed input validation.
- Location: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/lib/server/*`
- Contains: `createServerFn` handlers, Zod validators, `sourceQuery`/`sourceMutation` references, source-write admission, local E2E bypass readbacks.
- Depends on: `src/lib/server/convex-source.ts`, Clerk server auth, Convex HTTP client, domain public contracts.
- Used by: `src/routes/*` page routes and HTTP route handlers.

**Domain Public Seams:**
- Purpose: Define stable route/sibling-module APIs for each domain.
- Location: `src/modules/*/public.ts`
- Contains: Literal value arrays, exact DTO/result types, public pure functions, source-state constructors, projection readers.
- Depends on: Owning module internals and shared helpers under `src/modules/common`.
- Used by: Routes, server functions, Convex functions, tests, and other domains.

**Domain Internals:**
- Purpose: Own pure transitions, validators, provider normalization, redaction, projections, and Convex schema fragments.
- Location: `src/modules/*/internal`
- Contains: `claim.ts`, `publish.ts`, `commands.ts`, `contact-follow-up.ts`, `operations.ts`, `provider-readback.ts`, `schema.ts`, validators.
- Depends on: Shared common helpers and other domains through public seams.
- Used by: Same-domain `public.ts`, Convex schema composition, and tests.

**Convex Runtime:**
- Purpose: Persist durable source state and expose authenticated/public queries and mutations.
- Location: `convex`
- Contains: Auth config, owner/admin authority helpers, source-write admission validator, source-state load/persist adapters, query/mutation handlers.
- Depends on: Convex runtime, Clerk identity, module public seams, module-owned schema fragments.
- Used by: Server functions and API route handlers through `src/lib/server/convex-source.ts`.

**UI System:**
- Purpose: Provide reusable AE product shells, status/readback primitives, and shadcn primitives.
- Location: `src/components/ae`, `src/components/ui`, `src/styles`
- Contains: `AePublicShell`, `AeAdminShell`, `AePageHeader`, `AeStatusBadge`, `AeStatusCard`, `AeCapabilityList`, `AeAdminReadbackPanel`, `AeEmptyState`.
- Depends on: shadcn/radix-nova conventions in `components.json`, semantic CSS variables in `src/styles/tokens.css`, status presentation in `src/lib/ui/status-presentation.ts`.
- Used by: Active route pages and parked Phase 5 route sketches.

**Verification Guardrails:**
- Purpose: Make architecture boundaries executable.
- Location: `tests/imports`, `tests/types`, `tests/ui-contract`, `tests/copy`, `src/lib/ui/contract-scans.ts`
- Contains: Static scans for private imports, route Convex coupling, future route registration, source-mining terms, broad status strings, copy overclaims.
- Depends on: Vitest and scanner helpers.
- Used by: `npm run test:imports`, `npm run test:ts-standards`, `npm run test:ui-contract`, `npm run test:copy`.

## Data Flow

### Primary Claim And Publish Path

1. Owner submits claim form through the public route (`src/routes/claim.tsx`).
2. The route validates form input through the catalog public seam (`src/modules/catalog/public.ts`) and calls a server function (`src/modules/catalog/owner-claim.functions.ts`).
3. The server function adds source-write admission and calls Convex mutations through `src/lib/server/convex-source.ts`.
4. Convex claim runtime verifies source-write admission and resolves the Clerk-derived actor (`convex/business.ts:185`, `convex/authz.ts:35`).
5. Convex writes source-owned owner/business/claim rows and catalog publish state, then persists operation/audit/readback rows (`convex/business.ts`, `convex/catalog.ts`, `convex/source_state.ts:209`).
6. Public route DTOs redact source hashes/private owner details before returning UI readbacks (`src/modules/catalog/owner-claim.functions.ts`).

### Public Business, Registry, And Discovery Read Path

1. Public business pages call `readPublicBusinessPageServer` from `src/modules/catalog/owner-claim.functions.ts`.
2. Public registry APIs call registry source helpers and return no-store JSON from `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, and `src/routes/api.businesses.$slug.ts`.
3. Convex registry queries read published, non-suppressed public catalogs from indexed tables (`convex/registry.ts:125`, `convex/registry.ts:157`).
4. Discovery routes return UCP, `llms.txt`, sitemap, schema, examples, and fixture artifacts from discovery public/source state (`src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/api.discovery.schema.ts`).
5. Discovery contracts keep unsupported payment/callable capabilities false unless selected server-enforced behavior exists (`src/modules/discovery/public.ts`, `convex/discovery.ts`).

### Public Inquiry And Owner Inbox Path

1. Public inquiry route loads public business state and renders inquiry readback (`src/routes/$slug.inquiry.tsx`).
2. Submitted inquiry data flows through `submitPublicInquiryServer` (`src/modules/inquiries/inquiry.functions.ts`).
3. Convex inquiry runtime owns threads, messages, notification state, privacy tombstones, owner inbox readbacks, and operator reconstruction (`convex/inquiries.ts:548`, `convex/inquiries.ts:610`, `convex/inquiries.ts:627`).
4. Owner routes render inbox/detail readbacks through `AePublicShell` (`src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`).
5. Admin route reads inquiry reconstruction through `AeAdminShell` (`src/routes/admin.inquiries.tsx`).

### Phase 4 Protected Action Path

1. Owner/action routes call selected contact-follow-up server functions, not a generic action platform (`src/routes/owner.actions.tsx`, `src/modules/protected-action/contact-follow-up.functions.ts:150`).
2. Server functions validate Zod inputs, attach source-write admission, and call Convex protected-action references (`src/modules/protected-action/contact-follow-up.functions.ts:117`, `src/modules/protected-action/contact-follow-up.functions.ts:161`).
3. Convex runtime resolves owner authority and source-write admission before proposing, approving/rejecting, retrying, or marking no-repair (`convex/protectedActions.ts:406`, `convex/protectedActions.ts:495`, `convex/protectedActions.ts:624`).
4. Durable protected-action tables store proposals, policy decisions, owner decisions, gateway admissions, attempts, receipts, private evidence refs, no-repair records, and support records (`src/modules/protected-action/internal/schema.ts:13`).
5. Admin/operator reconstruction routes read source reconstruction without using provider success as authority (`src/routes/admin.protected-actions.tsx`, `convex/protectedActions.ts:665`).

### Phase 5 Billing Path

1. Active billing route tree entries are not present in `src/routes` or `src/routeTree.gen.ts`; parked owner billing and webhook route sketches live in `src/future-phases/05-paid-activation-money-rails/routes`.
2. Billing domain state and operations already exist behind `src/modules/billing/public.ts`; routes must import only this seam.
3. `startPaidActivation` rejects client-supplied amount, currency, customer/provider IDs, entitlement, paid state, return/cancel URLs, and business authority (`src/modules/billing/internal/operations.ts:48`, `src/modules/billing/internal/operations.ts:286`).
4. Billing owner authority is business-bound and separate from admin/operator authority (`src/modules/billing/internal/authority.ts:8`, `src/modules/billing/internal/authority.ts:28`).
5. Autumn attach/customer portal/readback is normalized into hashes and provider refs by the provider adapter (`src/modules/billing/internal/provider-readback.ts:81`, `src/modules/billing/internal/provider-readback.ts:145`).
6. Provider events are deduped by provider/event ID, rejected on unverified signatures or disabled webhooks, held when unbound, and only admitted into source state after matching an operation (`src/modules/billing/internal/operations.ts:514`).
7. Billing receipts, operation statuses, reconciliation rows, no-repair records, and disabled paid-activation state are source-owned and append-only in the billing source model (`src/modules/billing/internal/schema.ts:184`, `src/modules/billing/internal/operations.ts:750`, `src/modules/billing/internal/operations.ts:945`).
8. Top-level Convex billing runtime is not detected as `convex/billing.ts`; Phase 5 durable implementation should add it or extend existing Convex runtime only through the billing public seam and table fragment.

**State Management:**
- Client UI state is component-local in route files such as `src/routes/claim.tsx`, `src/routes/$slug.inquiry.tsx`, and `src/routes/owner.actions.$proposalId.tsx`.
- Server state is source-owned durable state in Convex tables composed by `convex/schema.ts`.
- Source-write admission protects runtime mutations through `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- Local deterministic E2E bypasses are explicit and limited to seams such as `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.
- Idempotency and replay are modeled with operation keys, correlation IDs, canonical hashes, audit events, and domain-specific receipt/readback records.

## Key Abstractions

**Domain Public Seam:**
- Purpose: Stable import boundary for each domain.
- Examples: `src/modules/catalog/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/protected-action/public.ts`, `src/modules/billing/public.ts`.
- Pattern: Export value unions, DTOs, command/result types, and public functions from internals. Routes and sibling modules must not import `internal/*`.

**Source-Owned State:**
- Purpose: Represent truth as owned rows, hashes, readbacks, audit events, receipts, and repair attempts instead of provider or client claims.
- Examples: `ContactFollowUpSourceState` in `src/modules/protected-action/internal/contact-follow-up.ts:243`, `BillingSourceState` in `src/modules/billing/internal/schema.ts:184`, `PhaseOneSourceState` in `convex/source_state.ts:106`.
- Pattern: Pure functions accept source state plus command objects and return exact `kind`/`code` results.

**Convex Function Reference:**
- Purpose: Keep route/server code independent from generated Convex API output.
- Examples: `sourceQuery` and `sourceMutation` in `src/lib/server/convex-source.ts:63`, protected-action references in `src/modules/protected-action/contact-follow-up.functions.ts:117`.
- Pattern: Use `makeFunctionReference` wrappers and typed `FunctionReference` generics.

**Source-Write Admission:**
- Purpose: Bind browser/server mutations to method, origin, pathname, operation key, correlation ID, nonce, and signature.
- Examples: `createSourceWriteAdmissionMiddleware` in `src/start.ts:4`, `requireSourceWrite` in `convex/sourceWriteAdmission.ts:39`.
- Pattern: Server functions add admission; Convex mutations reject missing/foreign source writes before mutating state.

**Owner/Admin Authority:**
- Purpose: Resolve runtime authority from Clerk identity plus source-owned rows.
- Examples: `resolveBusinessActor` and `resolveAdminAuthority` in `convex/authz.ts:35`, `readActiveAdminMembership` in `convex/authz.ts:60`, billing owner/operator checks in `src/modules/billing/internal/authority.ts`.
- Pattern: Browser-supplied owner/admin payloads are ignored or rejected; owner starts and admin reconciliation are separate permissions.

**Branded IDs And Hashes:**
- Purpose: Keep domain IDs distinct from arbitrary strings and preserve replay/evidence identity.
- Examples: `BillingOperationId`, `BillingReceiptId`, `OperationKey`, `CorrelationId`, `SourceHash` in `src/modules/common/ids.ts:7`.
- Pattern: Use `brandNonEmpty` plus `stableHash` for source refs, operation hashes, payload hashes, and receipt/readback identities.

**Readback:**
- Purpose: Expose visible state without leaking private rows or raw provider payloads.
- Examples: `AeAdminReadbackPanel` in `src/components/ae/readback/AeAdminReadbackPanel.tsx`, protected-action reconstruction in `src/modules/protected-action/internal/contact-follow-up.ts:264`, billing projections in `src/modules/billing/internal/projections.ts:12`.
- Pattern: Return explicit allowed/denied, available/unavailable, status/next-action objects with redacted refs.

**Parked Future Route:**
- Purpose: Keep phase-gated route code inspectable without registering live routes.
- Examples: `createParkedFileRoute` in `src/future-phases/route-helpers.ts:23`, parked billing routes in `src/future-phases/05-paid-activation-money-rails/routes`.
- Pattern: Parked routes throw if `useLoaderData` is called and do not appear in `src/routeTree.gen.ts`.

## Entry Points

**Vite/TanStack Start Dev Server:**
- Location: `vite.config.ts`
- Triggers: `npm run dev`
- Responsibilities: Run TanStack Start, Nitro, React, and Tailwind Vite plugins.

**App Start Instance:**
- Location: `src/start.ts`
- Triggers: TanStack Start runtime.
- Responsibilities: Apply CSRF, source-write admission, and Clerk request middleware.

**Router Factory:**
- Location: `src/router.tsx`
- Triggers: TanStack Router runtime.
- Responsibilities: Create router from `src/routeTree.gen.ts`; do not hand-edit the generated tree.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: All route renders.
- Responsibilities: Global metadata, styles, Clerk provider, scripts.

**Public Product Routes:**
- Location: `src/routes/index.tsx`, `src/routes/claim.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Browser navigation.
- Responsibilities: Render public claim, catalog, registry, business detail, and inquiry workflows.

**Owner Routes:**
- Location: `src/routes/owner.status.tsx`, `src/routes/owner.inquiries.tsx`, `src/routes/owner.actions.tsx`
- Triggers: Owner navigation.
- Responsibilities: Render owner status, inbox, protected-action queue/detail/receipt readbacks.

**Admin Routes:**
- Location: `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`, `src/routes/admin.inquiries.tsx`, `src/routes/admin.protected-actions.tsx`
- Triggers: Admin/operator navigation.
- Responsibilities: Render source-owned admin readbacks, reconstruction, and denied states.

**Public/Discovery API Routes:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`
- Triggers: Public HTTP requests.
- Responsibilities: Return public catalog JSON, discovery artifacts, and text discovery files.

**Provider Routes:**
- Location: `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`
- Triggers: Provider/system HTTP requests.
- Responsibilities: Verify provider-side evidence, record redacted provider results, or fail closed.

**Parked Billing Routes:**
- Location: `src/future-phases/05-paid-activation-money-rails/routes`
- Triggers: None in active route tree.
- Responsibilities: Provide Phase 5 route sketches for owner activation, return/cancel, billing center, receipts, and webhook handling.

**Convex Runtime Functions:**
- Location: `convex/*.ts`
- Triggers: Convex HTTP client query/mutation calls.
- Responsibilities: Validate arguments/returns, resolve authority, assert source-write admission, persist source-owned state, and return exact readbacks.

## Architectural Constraints

- **Threading:** JavaScript async runtime in TanStack Start; Convex mutations run transactionally under Convex optimistic concurrency.
- **Global state:** Test/local bypass state exists in explicit module-scope seams and must be reset through provided cleanup helpers. Examples include route query clients and local E2E source-state constructors.
- **Generated files:** Do not edit `src/routeTree.gen.ts` or `convex/_generated`; generated files are overwritten by tooling.
- **Route boundaries:** Routes must not import `convex/schema.ts`, `convex/browser`, `convex/server`, or `src/modules/*/internal/*`. Guardrails live in `src/lib/ui/contract-scans.ts:71`.
- **Module private imports:** Cross-module and route imports use `src/modules/<domain>/public.ts`. Only owning public seams and `convex/schema.ts` compose internals.
- **Schema ownership:** New tables belong in the owning `src/modules/<domain>/internal/schema.ts` or `convex-schema.ts`, then spread into `convex/schema.ts`.
- **Convex validators:** Convex functions define explicit `args` and `returns`; avoid `v.any()` and broad `status: string`.
- **Authentication:** Clerk middleware/provider runs through `src/start.ts` and `src/routes/__root.tsx`; Convex validates Clerk identity and admin membership through `convex/authz.ts`.
- **Authorization:** Owner authority and admin/operator authority are separate. Owner checkout/action decisions cannot be initiated by global admin role unless a source-owned delegate model exists and is tested.
- **Provider evidence:** Provider screenshots, env vars, return URLs, and webhook arrival are not proof. Source-owned readback rows with payload hash, provider refs, route/smoke evidence, and operator action are proof.
- **Public data:** Public DTOs redact source hashes, private owner/contact details, private receipts, provider refs, and raw payloads.
- **Future surfaces:** Billing route activation belongs to Phase 5. Until mounted, billing route files stay parked under `src/future-phases/05-paid-activation-money-rails/routes`.
- **Circular imports:** Preserve direction `routes -> server functions/public seams -> internals -> schema/Convex`. Do not make module internals import routes.

## Phase Handoff Context

**Phase 4 Closeout:**
- `04-VERIFICATION.md` records local/source Phase 4 verification passed with 8/8 must-haves, no behavior-unverified items, and no claimed deployed proof.
- Phase 4 source state includes selected `contact-follow-up` proposals, policies, owner decisions, gateway admissions, attempts, receipts/proof gaps, private evidence refs, retry exhaustion, dispute/reversal posture, no-repair, audit, and admin reconstruction.
- Phase 5 must preserve Phase 4 authority: no money movement, provider attempt, checkout, or entitlement can bypass owner authority, source-write admission, idempotency, receipt, reconstruction, and no-repair patterns established under `src/modules/protected-action` and `convex/protectedActions.ts`.

**Phase 5 Billing Landing Zones:**
- Decision record and planning artifacts: `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` (planned by `05-01-autumn-stripe-paid-activation-PLAN.md`), plus existing `05-SPEC.md`, `05-CONTEXT.md`, `05-UI-SPEC.md`.
- Domain public seam: `src/modules/billing/public.ts`.
- Domain internals: `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/provider-readback.ts`, `src/modules/billing/internal/authority.ts`, `src/modules/billing/internal/projections.ts`, `src/modules/billing/internal/schema.ts`.
- Server-only provider helper: `src/lib/server/billing-provider.ts`.
- Durable schema: `billingTables` already compose through `convex/schema.ts`.
- Durable runtime gap: `convex/billing.ts` is not detected; Phase 5 runtime needs a Convex billing wrapper or another explicit durable adapter before active routes can call billing mutations/queries.
- Active routes gap: `src/routes/owner.billing.*`, `src/routes/admin.monetization.*`, and `src/routes/api.billing.*` are not active. Parked sketches live under `src/future-phases/05-paid-activation-money-rails/routes`.

## Anti-Patterns

### Route Imports Module Internals

**What happens:** A route imports `src/modules/<domain>/internal/*`.
**Why it's wrong:** It bypasses the public seam and violates `tests/imports/route-boundary.test.ts`.
**Do this instead:** Export through `src/modules/<domain>/public.ts` or a domain server-function file such as `src/modules/protected-action/contact-follow-up.functions.ts`.

### Cross-Module Private Import

**What happens:** One domain imports another domain's `internal/*` file.
**Why it's wrong:** It couples domains to implementation details and violates private-import scans.
**Do this instead:** Add an explicit contract to the target domain public seam, such as `src/modules/billing/public.ts`.

### Active Billing Route Without Durable Runtime

**What happens:** Phase 5 owner/admin/webhook routes are moved into `src/routes` before a durable billing runtime and decision record exist.
**Why it's wrong:** It can expose payment UI/callback paths without source-owned provider readback, receipts, reconciliation, and rollback proof.
**Do this instead:** Complete the money decision record, add durable billing runtime around `src/modules/billing/public.ts`, then mount `src/routes/owner.billing.*`, `src/routes/admin.monetization.*`, and `src/routes/api.billing.*`.

### Provider Success As Source Truth

**What happens:** Autumn/Stripe/notification provider responses directly grant paid state or public capability.
**Why it's wrong:** Provider data is evidence only; source-owned rows decide paid activation, public claims, receipts, and repair state.
**Do this instead:** Normalize provider evidence through `src/modules/billing/internal/provider-readback.ts`, ingest via `src/modules/billing/internal/operations.ts`, and reconcile into Convex source rows.

### Client-Created Money Fields

**What happens:** Browser input supplies amount, currency, provider customer ID, entitlement, paid state, return URL, or business authority.
**Why it's wrong:** Phase 5 prohibits client-created billing authority and `startPaidActivation` rejects these fields.
**Do this instead:** Resolve offer/plan, owner authority, operation key, correlation ID, return/cancel keys, and provider refs on the server.

### Broad State Strings

**What happens:** Runtime contracts use `status: string`, unchecked status literals, or `v.any()`.
**Why it's wrong:** Guardrails require exact literal unions and Convex return validators.
**Do this instead:** Add `...Values` arrays and exported union types in public seams, plus matching Convex validators.

### Direct Secret Use In Client Routes

**What happens:** Browser routes or public helpers read provider secret env vars or expose raw provider errors.
**Why it's wrong:** Server secrets belong in `src/lib/server/*`, and routes return redacted typed readbacks.
**Do this instead:** Read secrets through helpers such as `src/lib/server/billing-provider.ts` and return redacted `BillingProviderError` or billing readback states.

## Error Handling

**Strategy:** Fail closed with typed result objects and redacted readbacks. User-facing routes convert source errors into safe visible states; admin routes return denied readbacks with no private rows when authority is absent.

**Patterns:**
- Domain pure functions return exact `ModuleResult` objects with `kind`, `code`, and `retryable` (`src/modules/common/result.ts`).
- Missing Convex URL/auth throws typed `ConvexSourceError` in `src/lib/server/convex-source.ts`.
- Source-write admission failures return typed CSRF/foreign-origin rejections in Convex mutations (`convex/sourceWriteAdmission.ts`).
- Admin routes return denied readbacks with empty rows when source-owned membership is absent (`src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`).
- Protected-action flows expose stale, refused, disputed, reversed, retry-exhausted, proof-gap, failed, receipt, and no-repair statuses from source state.
- Billing provider helpers fail closed on missing Autumn key and unconfigured webhook verification (`src/lib/server/billing-provider.ts:32`, `src/lib/server/billing-provider.ts:56`).
- Billing evidence rejects env-only provider readiness (`src/modules/billing/internal/operations.ts:821`).

## Cross-Cutting Concerns

**Logging:** No centralized logging framework is detected. Observability is source-owned audit, funnel, operator-control, operation-key, provider-attempt, and readback rows in `src/modules/observability/public.ts`, `src/modules/observability/internal/schema.ts`, and Convex runtime files.

**Validation:** Route/server input uses Zod or domain validators. Convex functions define explicit `args` and `returns` with `convex/values`. Schema fragments use literal-union helpers from `src/modules/common/convex-literals.ts`.

**Authentication:** Clerk wraps the app in `src/routes/__root.tsx`; Clerk request middleware runs from `src/start.ts`; Convex owner/admin identity resolution lives in `convex/authz.ts`.

**Authorization:** Owner authority resolves from Clerk identity to owner/business rows. Admin authority resolves from active `adminMemberships` rows. Billing owner starts and billing operator reconciliation are distinct authority paths.

**CSRF / Source Write:** TanStack Start CSRF middleware applies to server functions, and source-write admission binds method/origin/path/operation/correlation before Convex mutations.

**Idempotency:** Commands carry `OperationKey` and `CorrelationId`; `operationKeys` and domain-specific idempotency indexes support replay/conflict behavior.

**Redaction:** Public route contracts omit source hashes/private details. Provider payloads store hashes and redacted JSON, not raw card data, provider secrets, unredacted owner contact, or raw provider bodies.

**Styling:** Follow `.agents/skills/shadcn/SKILL.md`: use existing shadcn primitives, semantic tokens, `gap-*`, `FieldGroup`/`Field`, lucide icons with `data-icon`, full card composition, and no custom status badges when `AeStatusBadge` applies.

**Routing:** Follow `.codex/skills/tanstack-router/SKILL.md`: keep file routes under `src/routes`, validate search params, use loaders/server functions for route data, and never edit `src/routeTree.gen.ts`.

**Convex:** Follow `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md`: organize functions by domain, require argument and return validators, use indexes, keep query/mutation logic deterministic, and model external APIs through server/provider seams or actions.

---

*Architecture analysis: 2026-06-29*
