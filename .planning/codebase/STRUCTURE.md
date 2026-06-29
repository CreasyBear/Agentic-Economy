# Codebase Structure

**Analysis Date:** 2026-06-29

## Directory Layout

```text
agentic-economy/
|-- .agents/                  # Project/local agent skills; `shadcn` UI rules live here
|-- .codex/                   # GSD workflows, agents, hooks, scripts, and project skills
|-- .planning/                # GSD project state, specs, phase plans, and codebase maps
|-- convex/                   # Convex auth, schema composition, source-write, and runtime functions
|-- src/
|   |-- components/
|   |   |-- ae/               # Agentic Economy product-specific UI components
|   |   `-- ui/               # Checked-in shadcn/radix-nova primitives
|   |-- future-phases/        # Parked phase-gated route sketches, not active route tree entries
|   |-- lib/                  # Shared HTTP, server-only provider/source, UI scanner/presentation helpers
|   |-- modules/              # Domain modules with public seams and internal implementation
|   |-- routes/               # Active TanStack Router file routes and HTTP route handlers
|   |-- styles/               # Tailwind v4 globals and AE/shadcn design tokens
|   |-- routeTree.gen.ts      # Generated TanStack Router route tree
|   |-- router.tsx            # Router factory
|   `-- start.ts              # TanStack Start instance and request middleware
|-- tests/                    # Unit, integration, import, type, copy, UI contract, E2E, smoke tests
|-- components.json           # shadcn project configuration
|-- package.json              # Scripts and dependency versions
|-- tsconfig.json             # TypeScript config and aliases
|-- vite.config.ts            # Vite/TanStack Start/Nitro/Tailwind config
`-- vitest.config.ts          # Vitest config
```

## Directory Purposes

**`src/routes`:**
- Purpose: Active TanStack Router file routes and HTTP route handlers.
- Contains: Public pages/APIs, owner-private routes, admin/operator routes, notification provider handlers, discovery files.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`, `src/routes/owner.actions.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/api.notification.resend-webhook.ts`.
- Boundary: Do not put Phase 5 billing routes here until the money decision record, durable billing runtime, route tests, and guardrail updates exist.

**`src/modules`:**
- Purpose: Domain-owned contracts, source-state transitions, validators, projections, provider normalization, table fragments, and server-function adapters.
- Contains: `business`, `catalog`, `registry`, `discovery`, `inquiries`, `notification-outbox`, `protected-action`, `billing`, `security`, `observability`, `seo`, `lifecycle`, `common`.
- Key files: `src/modules/*/public.ts`, `src/modules/*/internal/*.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`.
- Boundary: Cross-domain imports use `src/modules/<domain>/public.ts`; routes and sibling modules do not import `internal/*`.

**`src/modules/common`:**
- Purpose: Shared low-level domain utilities.
- Contains: Branded IDs, stable hashing, Convex literal helpers, result helpers.
- Key files: `src/modules/common/ids.ts`, `src/modules/common/stable-hash.ts`, `src/modules/common/result.ts`, `src/modules/common/convex-literals.ts`.
- Phase 5 note: Billing branded IDs already live in `src/modules/common/ids.ts` as `BillingOperationId`, `BillingReceiptId`, `BillingProviderEventId`, `BillingReconciliationId`, `BillingOfferId`, and `BillingSupportRecordId`.

**`src/modules/billing`:**
- Purpose: Phase 5 billing domain scaffold and route-facing seam.
- Contains: `public.ts`, `server.ts`, and internals for authority, operations, provider readback, projections, and schema.
- Key files: `src/modules/billing/public.ts`, `src/modules/billing/server.ts`, `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/provider-readback.ts`, `src/modules/billing/internal/schema.ts`.
- Boundary: Routes import `src/modules/billing/public.ts`; server-only provider setup imports `src/modules/billing/server.ts` through `src/lib/server/billing-provider.ts`.

**`src/modules/protected-action`:**
- Purpose: Phase 4 selected contact-follow-up protected-action source model and server seam.
- Contains: Public selected-action exports, contact-follow-up pure state, durable schema fragment, route server functions, gateway/attempt/receipt/no-repair logic.
- Key files: `src/modules/protected-action/public.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/protected-action/internal/schema.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`.
- Phase 5 note: Billing work reuses the authority/readback discipline from this module, but must not turn protected actions into a generic action or money platform.

**`src/components/ae`:**
- Purpose: Product-specific UI components that compose shadcn primitives.
- Contains: Shells, page headers, form wrappers, status/readback cards, empty states.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeAdminShell.tsx`, `src/components/ae/layout/AePageHeader.tsx`, `src/components/ae/status/AeStatusBadge.tsx`, `src/components/ae/readback/AeAdminReadbackPanel.tsx`.
- Boundary: No `AeOwnerShell` component is detected. Active owner routes use `AePublicShell`; Phase 5 can add a dedicated owner shell only if the design system and tests justify it.

**`src/components/ui`:**
- Purpose: Checked-in shadcn/radix-nova primitives.
- Contains: Button, card, field, input, badge, alert, separator, skeleton, spinner, empty state, and related primitives.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/field.tsx`, `src/components/ui/badge.tsx`.
- Boundary: Add/update primitives through the shadcn CLI and preserve local project rules in `.agents/skills/shadcn/SKILL.md`.

**`src/lib`:**
- Purpose: Shared helpers outside domain modules.
- Contains: HTTP response helpers, server-only provider/source clients, status presentation, copy and contract scanners, utilities.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, `src/lib/ui/status-presentation.ts`, `src/lib/ui/contract-scans.ts`.
- Boundary: Server secrets are read only from `src/lib/server/*`; client UI imports status/copy helpers from `src/lib/ui/*`.

**`src/future-phases`:**
- Purpose: Parked route sketches for phase-gated surfaces.
- Contains: Phase 4 historical route helpers and Phase 5 owner billing/webhook route sketches.
- Key files: `src/future-phases/route-helpers.ts`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.
- Boundary: `createParkedFileRoute` makes these files non-mounted; move into `src/routes` only during the owning phase with generated route updates and tests.

**`convex`:**
- Purpose: Durable backend runtime and schema.
- Contains: Auth config, owner/admin authz, source-write admission, source-state adapters, and runtime functions by domain.
- Key files: `convex/schema.ts`, `convex/auth.config.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/protectedActions.ts`, `convex/security.ts`.
- Phase 5 note: `convex/schema.ts` already composes `billingTables`; top-level `convex/billing.ts` is not detected.

**`tests`:**
- Purpose: Unit, integration, type, import guardrail, UI contract, copy, SEO, E2E, accessibility, and deploy-smoke verification.
- Contains: `tests/unit`, `tests/integration`, `tests/types`, `tests/imports`, `tests/ui-contract`, `tests/copy`, `tests/seo`, `tests/e2e`, `tests/deploy-smoke`, `tests/fixtures`.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, `tests/types/protected-actions-contracts.test.ts`, `tests/unit/convex/protected-actions-runtime.test.ts`, `tests/integration/protected-action-route-readbacks.test.ts`.

**`.planning`:**
- Purpose: GSD state, roadmap, specs, phase plans, source-mining ledger, and codebase maps.
- Contains: `STATE.md`, specs, phase directories, source-mining ledger, generated codebase docs.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`, `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`.
- Boundary: Runtime source must not import `.planning`; mapper work edits only assigned codebase docs.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start instance, CSRF middleware, source-write admission, Clerk request middleware.
- `src/router.tsx`: Router factory using `src/routeTree.gen.ts`.
- `src/routes/__root.tsx`: Root document, metadata, global stylesheet, Clerk provider.
- `vite.config.ts`: Vite/TanStack Start/Nitro/Tailwind plugin setup.

**Configuration:**
- `package.json`: Scripts, dependency versions, package manager `npm@11.5.1`.
- `tsconfig.json`: Strict TypeScript config and aliases `@/*` and `~/*` to `src/*`.
- `components.json`: shadcn/radix-nova config, aliases, Tailwind CSS file, icon library.
- `tailwind.config.ts`: Tailwind config.
- `vitest.config.ts`: Vitest config.
- `playwright.config.ts`: E2E Playwright config.
- `playwright.deploy-smoke.config.ts`: Deploy smoke config.
- `convex/tsconfig.json`: Convex TypeScript config.
- `.env.example`: Environment example file present.
- `.env.local`: Local environment file present; do not read or quote contents.

**Core Domain Logic:**
- `src/modules/business/public.ts`: Business, owner, claim, visibility contracts.
- `src/modules/catalog/public.ts`: Catalog, service, first-request, public route DTO, publish contracts.
- `src/modules/registry/public.ts`: Registry projection/search/index health contracts.
- `src/modules/discovery/public.ts`: UCP fallback, discovery file, developer discovery contracts.
- `src/modules/inquiries/public.ts`: Inquiry, inbox, privacy, operator reconstruction contracts.
- `src/modules/protected-action/public.ts`: Selected `contact-follow-up` protected-action contracts.
- `src/modules/billing/public.ts`: Billing offer, operation, provider event, receipt, reconciliation, projection contracts.
- `src/modules/security/public.ts`: CSRF, rate limit, duplicate, admin, dispute, suppression contracts.
- `src/modules/observability/public.ts`: Operation key, audit, funnel, operator-control, billing/protected-action event contracts.
- `src/modules/seo/public.ts`: Public business SEO and JSON-LD exports.

**Server Function Adapters:**
- `src/modules/catalog/owner-claim.functions.ts`: Claim/publish server bridge to Convex.
- `src/modules/inquiries/inquiry.functions.ts`: Inquiry server bridge to Convex.
- `src/modules/protected-action/contact-follow-up.functions.ts`: Protected-action owner/admin server bridge to Convex.
- `src/modules/registry/registry.functions.ts`: Registry source reads used by API/UI routes.
- `src/modules/discovery/discovery.functions.ts`: Discovery source reads used by discovery routes.
- `src/modules/security/admin-readback.functions.ts`: Admin readback server bridge.
- `src/modules/security/removal-dispute.functions.ts`: Removal/correction dispute server bridge.

**Convex Runtime:**
- `convex/schema.ts`: Schema composition from module fragments, including `billingTables`.
- `convex/auth.config.ts`: Clerk JWT issuer configuration.
- `convex/authz.ts`: Clerk identity to owner/admin authority mapping.
- `convex/sourceWriteAdmission.ts`: Source-write admission validator used by mutations.
- `convex/source_state.ts`: Source-state load/persist adapter for Phase 1 owned state.
- `convex/business.ts`: Business claim, suppression, and unsuppression mutations.
- `convex/catalog.ts`: Catalog publish and public catalog readbacks.
- `convex/registry.ts`: Public registry list/search/detail and catalog health reads.
- `convex/discovery.ts`: Discovery manifest generation/invalidation/file reads.
- `convex/inquiries.ts`: Public inquiry, owner inbox/detail/mutations, privacy, operator readbacks.
- `convex/notificationOutbox.ts`: Notification dispatch, attempts, webhook events, system-send reads.
- `convex/protectedActions.ts`: Selected protected-action runtime.
- `convex/protectedActionStore.ts`: Durable protected-action source-state load/persist bridge.
- `convex/security.ts`: Admin claims/audit/index/inquiry readbacks and security operations.
- `convex/observability.ts`: Operator-control and observability runtime functions.
- `convex/billing.ts`: Not detected; add during Phase 5 durable billing runtime work if Convex wrappers are needed.

**Active Route Files:**
- `src/routes/index.tsx`: Home page.
- `src/routes/claim.tsx`: Owner claim form.
- `src/routes/claim.success.tsx`: Claim success readback route.
- `src/routes/$slug.tsx`: Public business page route.
- `src/routes/$slug.inquiry.tsx`: Public inquiry route.
- `src/routes/$slug.ucp.ts`: AE-hosted UCP fallback JSON route.
- `src/routes/registry.tsx`: Registry UI route.
- `src/routes/developers.discovery.tsx`: Developer discovery UI route.
- `src/routes/privacy.remove-business.tsx`: Removal/correction dispute route.
- `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`: Clerk auth catch-all routes.
- `src/routes/owner.status.tsx`: Owner status route.
- `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`: Owner inquiry inbox/detail.
- `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, `src/routes/owner.actions.$proposalId.receipt.tsx`: Owner protected-action queue/detail/receipt.
- `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`, `src/routes/admin.inquiries.tsx`: Admin readbacks.
- `src/routes/admin.protected-actions.tsx`, `src/routes/admin.protected-actions.$proposalId.tsx`: Admin protected-action reconstruction.

**Active API / Text Route Files:**
- `src/routes/api.businesses.ts`: Public catalog list API.
- `src/routes/api.businesses.search.ts`: Public catalog search API.
- `src/routes/api.businesses.$slug.ts`: Public catalog detail API.
- `src/routes/api.discovery.schema.ts`: Developer discovery schema/route-health API.
- `src/routes/api.discovery.examples.ts`: Developer discovery examples route.
- `src/routes/api.discovery.fixtures.ts`: Developer discovery fixtures route.
- `src/routes/api.notification.resend-webhook.ts`: Resend webhook ingestion route.
- `src/routes/api.notification.resend-dispatch.ts`: Resend dispatch route.
- `src/routes/api.notification.novu-dispatch.ts`: Novu dispatch route.
- `src/routes/llms[.]txt.ts`: LLM discovery text route.
- `src/routes/sitemap[.]xml.ts`: Sitemap XML route.
- `src/routes/robots[.]txt.ts`: Robots text route.

**Parked Phase 5 Billing Routes:**
- `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate.tsx`: Owner activation sketch.
- `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.redirecting.tsx`: Checkout redirect sketch.
- `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.return.tsx`: Return readback sketch.
- `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel.tsx`: Cancel readback sketch.
- `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`: Owner billing center sketch.
- `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.receipts.$receiptId.tsx`: Receipt detail sketch.
- `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`: Billing webhook sketch.
- `src/routes/owner.billing.*`, `src/routes/admin.monetization.*`, `src/routes/api.billing.*`: Not active/detected in `src/routes`.

**Testing:**
- `tests/unit`: Pure domain, Convex runtime, server seam tests.
- `tests/integration`: Route/readback/runtime integration tests.
- `tests/types`: Type contract tests.
- `tests/imports`: Architecture/import/source-mining/route-boundary guardrails.
- `tests/ui-contract`: UI token/status/copy guardrails.
- `tests/copy`: Copy claim scans.
- `tests/seo`: SEO/discovery tests.
- `tests/e2e`: Browser E2E and accessibility tests.
- `tests/deploy-smoke`: Deployed environment smoke tests.

## Naming Conventions

**Files:**
- Active route files use TanStack Router file-route names: `src/routes/$slug.tsx`, `src/routes/api.businesses.$slug.ts`, `src/routes/llms[.]txt.ts`.
- Route pages use `.tsx`; JSON/text route handlers can use `.ts`.
- Domain public seam is `src/modules/<domain>/public.ts`.
- Domain internals live under `src/modules/<domain>/internal/*.ts`.
- Convex table fragments use `schema.ts` or `convex-schema.ts`, such as `src/modules/billing/internal/schema.ts` and `src/modules/inquiries/internal/convex-schema.ts`.
- Server-function bridge files use domain-specific `*.functions.ts`, such as `src/modules/protected-action/contact-follow-up.functions.ts`.
- AE product components use `Ae` prefix and PascalCase: `src/components/ae/status/AeStatusBadge.tsx`.
- shadcn primitives use lowercase file names: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`.
- Parked route sketches mirror active route names under `src/future-phases/<phase-slug>/routes`, but call `createParkedFileRoute`.
- Tests use `*.test.ts` or `*.spec.ts` by test type and directory.

**Directories:**
- Domain directories use lowercase or kebab-case: `src/modules/notification-outbox`, `src/modules/protected-action`.
- AE component categories use purpose folders: `layout`, `forms`, `status`, `readback`, `feedback`.
- Parked phase directories include phase number and slug: `src/future-phases/05-paid-activation-money-rails`.
- GSD phase planning directories follow numbered phase slugs under `.planning/phases`.

**Imports:**
- Use `@/` or `~/` aliases for `src/*` imports.
- Use relative imports only within the same route/helper family, such as `src/routes/api.businesses.search.ts` importing `./api.businesses`.
- Use module public seams for cross-domain imports: `@/modules/billing/public`, not `@/modules/billing/internal/*`.
- Use `src/lib/server/*` only from server-only adapters/routes.
- Do not import `.planning`, `.codex`, `.agents`, `src/future-phases`, `convex/schema.ts`, or generated Convex documents from runtime routes.

## Where to Add New Code

**New Public Page Route:**
- Primary code: `src/routes/<route>.tsx`
- Route data: Use a route loader or server function under `src/modules/<domain>/*.functions.ts`.
- UI: Reuse `src/components/ae/*` and `src/components/ui/*`.
- Tests: Add `tests/integration` and `tests/e2e` coverage when user-facing behavior changes.

**New Owner Route:**
- Primary code: `src/routes/owner.<area>.tsx` or nested TanStack route names.
- Shell: Use `AePublicShell` from `src/components/ae/layout/AePublicShell.tsx` unless a tested `AeOwnerShell` is added.
- Authority: Resolve owner access through server functions and Convex owner rows; do not trust browser owner IDs.
- Tests: Add owner route integration, E2E, a11y, wrong-owner, and disabled-state coverage.

**New Admin/Operator Route:**
- Primary code: `src/routes/admin.<area>.tsx`.
- Shell: Use `AeAdminShell` from `src/components/ae/layout/AeAdminShell.tsx`.
- Authority: Use source-owned admin membership via `convex/authz.ts` and `src/modules/security/public.ts`.
- Tests: Cover denied readback with empty rows and allowed readback with redacted rows.

**New API Route:**
- Primary code: `src/routes/api.<name>.ts`.
- Shared response helpers: `src/lib/http/*`.
- Source reads/writes: Call module server functions, `src/lib/server/convex-source.ts`, or public seams; avoid module internals.
- Tests: Add integration tests and import/route-boundary guardrail coverage if the pattern is new.

**New Domain Module:**
- Public contracts: `src/modules/<domain>/public.ts`.
- Pure implementation: `src/modules/<domain>/internal/*.ts`.
- Validators: `src/modules/<domain>/internal/validators.ts`.
- Convex schema fragment: `src/modules/<domain>/internal/schema.ts`.
- Convex runtime wrapper: `convex/<domain>.ts`.
- Tests: `tests/unit/<domain>/*.test.ts`, plus integration tests when routes/Convex wrappers are used.
- Boundary: Export through `public.ts`; do not import another module's internals.

**New Convex Table:**
- Table fragment: Owning `src/modules/<domain>/internal/schema.ts`.
- Schema composition: Add spread to `convex/schema.ts`.
- Runtime functions: Add or extend `convex/<domain>.ts`.
- Domain contracts: Add exact unions/types to `src/modules/<domain>/public.ts`.
- Tests: Add schema/type/runtime tests; update import guardrails if a new ownership path is introduced.

**New Convex Query/Mutation:**
- Runtime function: `convex/<domain>.ts`.
- Server function bridge: `src/modules/<domain>/*.functions.ts` or route-local helper only when tightly route-scoped.
- Source reference: Use `sourceQuery` or `sourceMutation` from `src/lib/server/convex-source.ts`.
- Validation: Define explicit Convex `args` and `returns`; do not use `v.any()`.
- Authority: Resolve owner/admin through `convex/authz.ts` and domain helpers; use `requireSourceWrite` for browser-originating mutations.

**New Server Function:**
- Implementation: `src/modules/<domain>/*.functions.ts`.
- Input validation: Zod schema near the server function.
- Convex access: Use `callSourceQuery`, `callSourceMutation`, `callPublicSourceQuery`, or `callPublicSourceMutation` from `src/lib/server/convex-source.ts`.
- Local E2E readback: Gate deterministic behavior behind `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` only when the existing route test strategy requires it.

**New Provider Integration:**
- Server-only helper: `src/lib/server/<provider>-provider.ts`.
- Domain state: Owning module under `src/modules/<domain>`.
- Route handler: `src/routes/api.<provider>.*.ts` for callbacks or guarded dispatch routes.
- Secrets: Read only from server env in `src/lib/server/*`; never expose values or read `.env.local` in docs/tests.
- Tests: Add unit server seam tests, provider signature tests, redaction tests, and deploy smoke tests when real deployment proof is required.

**Phase 5 Billing Runtime:**
- Decision record: `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` before runtime behavior.
- Public seam: Extend `src/modules/billing/public.ts`.
- Internals: Use `src/modules/billing/internal/operations.ts`, `provider-readback.ts`, `authority.ts`, `projections.ts`, and `schema.ts`.
- Durable runtime: Add `convex/billing.ts` or an explicit billing Convex adapter that persists `billingTables` and exposes exact query/mutation validators.
- Server provider helper: Extend `src/lib/server/billing-provider.ts` for Autumn/Stripe signature/readback verification.
- Owner routes: Move or recreate parked owner billing files into `src/routes/owner.billing.*` only when source-owned runtime exists.
- Admin routes: Add `src/routes/admin.monetization.tsx` and `src/routes/admin.monetization.$operationId.tsx` for reconciliation/readback.
- Webhook routes: Add `src/routes/api.billing.autumn-webhook.ts` and any selected Stripe PSP webhook route with raw-body signature verification.
- Tests: Add `tests/unit/billing`, `tests/integration/billing`, `tests/e2e/paid-activation.spec.ts`, `tests/e2e/a11y/paid-activation.a11y.spec.ts`, copy/SEO/source-mining scans, and provider-smoke proof as required by `05-SPEC.md`.

**Phase 5 Billing UI:**
- Status labels: Use/extend `src/lib/ui/status-presentation.ts`; billing statuses already include `billing_pending`, `billing_started`, `billing_paid`, `billing_dispute`, `billing_provider_event_held`, `billing_reconciliation_mismatch`, and `billing_no_repair`.
- Shells: Owner billing routes use current `AePublicShell` or a newly tested `AeOwnerShell`; admin monetization uses `AeAdminShell`.
- Page headers: Use `src/components/ae/layout/AePageHeader.tsx`.
- Status: Use `src/components/ae/status/AeStatusBadge.tsx`.
- Readbacks: Reuse `src/components/ae/readback/AeAdminReadbackPanel.tsx`; add `src/components/ae/readback/AeBillingEvidenceChain.tsx` only when reused by owner/admin surfaces.
- Forms: Use shadcn `FieldGroup`/`Field`, `Button`, `Card`, `Alert`, `Badge`, and `Separator` primitives.

**New Copy Or Status Presentation:**
- Shared status mapping: `src/lib/ui/status-presentation.ts`.
- Copy scans: `tests/copy`.
- UI contract scans: `tests/ui-contract`.
- Rule: Public/payment claims must stay absent until selected-rail behavior has server readback, receipts, reversal/dispute handling, reconciliation, and smoke evidence.

**New SEO Or Discovery Output:**
- SEO logic: `src/modules/seo/public.ts` and `src/modules/seo/internal/*`.
- Discovery logic: `src/modules/discovery/public.ts` and `src/modules/discovery/internal/*`.
- Routes: `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/api.discovery.*.ts`.
- Tests: `tests/seo`, `tests/integration/discovery-*.test.ts`, `tests/unit/discovery/*.test.ts`.

**New Guardrail Fixture:**
- Fixtures: `tests/fixtures/<category>`.
- Scanner targets: `tests/imports/scan-targets.ts`.
- Guard tests: `tests/imports`, `tests/copy`, `tests/ui-contract`.
- Rule: Keep fixture mode behind `AE_SCAN_MODE=fixtures`; clean scans should pass with no violations.

## Route Boundary Guidance

**Public routes:**
- Use for unauthenticated or public-read flows.
- Allowed examples: `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`, `src/routes/api.businesses.ts`.
- Public DTOs must redact source hashes, private owner details, private provider refs, and receipt/support evidence.

**Owner routes:**
- Use for authenticated owner workflows tied to source-owned owner/business rows.
- Allowed examples: `src/routes/owner.inquiries.tsx`, `src/routes/owner.actions.$proposalId.tsx`, future `src/routes/owner.billing.tsx`.
- Owner routes cannot accept browser-supplied business authority, provider object IDs, or paid/action state.

**Admin/operator routes:**
- Use for active admin memberships and operator reconstruction.
- Allowed examples: `src/routes/admin.audit-events.tsx`, `src/routes/admin.protected-actions.tsx`, future `src/routes/admin.monetization.tsx`.
- Denied admin readbacks return empty rows and safe copy.

**Provider/system routes:**
- Use for webhooks and dispatch callbacks that require server-only secrets/signature checks.
- Allowed examples: `src/routes/api.notification.resend-webhook.ts`, future `src/routes/api.billing.autumn-webhook.ts`.
- Raw provider payloads must be verified, hashed, normalized, redacted, and discarded or TTL-bound by decision record.

## Phase Context

**Phase 4 Closeout Context:**
- `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md` records `status: passed`, `score: "8/8 must-haves verified"`, and `deployed_proof: not_claimed`.
- Protected-action source rows and readbacks cover stale, refused, disputed, reversed, retry-exhausted, proof-gap, failed, successful receipt, and no-repair posture.
- Phase 5 code must preserve Phase 4 owner approval, one-use gateway, receipt/proof-gap, operator reconstruction, retry/no-repair, no-money-in-Phase-4, and no-autonomy boundaries.

**Phase 5 Planning Context:**
- `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` locks one Autumn Cloud + Stripe PSP paid-activation rail.
- `.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md` says provider screenshots/env/dashboard status are not proof; server-created sessions, signed webhook/readback ingest, internal receipt state, and reconciliation are proof.
- `.planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md` defines owner billing, receipt, return/cancel, and admin monetization/reconciliation surfaces.
- `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` lists expected landing files including billing module, Convex billing runtime, owner/admin routes, billing webhooks, and tests.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router route tree.
- Generated: Yes.
- Committed: Yes.
- Guidance: Do not edit manually. Add/change files in `src/routes` and let route generation update this file.

**`convex/_generated`:**
- Purpose: Generated Convex API/types.
- Generated: Yes.
- Committed: Not treated as source by `tsconfig.json`; excluded from TypeScript project checks.
- Guidance: Prefer source-reference pattern in `src/lib/server/convex-source.ts` where established.

**`src/future-phases`:**
- Purpose: Parked implementation surfaces for phase-gated routes.
- Generated: No.
- Committed: Yes.
- Guidance: Keep Phase 5 billing routes here until active route registration is intentionally introduced with durable runtime and tests.

**`.planning`:**
- Purpose: GSD planning artifacts, source-mining ledger, phase plans, and codebase maps.
- Generated: Mixed.
- Committed: Yes.
- Guidance: Runtime source must not import from `.planning`. Mapper updates only assigned planning files.

**`.codex`:**
- Purpose: Local GSD workflows, agents, hooks, scripts, and skill definitions.
- Generated: Mixed.
- Committed: Yes.
- Guidance: Read relevant skills before implementation work. Do not import `.codex` files from runtime source.

**`.agents`:**
- Purpose: Local project skill definitions.
- Generated: Mixed.
- Committed: Yes.
- Guidance: `.agents/skills/shadcn/SKILL.md` defines shadcn UI composition and styling constraints used by this repo.

**`dist`, `.output`, `.vercel/output`:**
- Purpose: Build/deployment outputs.
- Generated: Yes.
- Committed: Environment-dependent; treat as output artifacts, not source.
- Guidance: Do not add source logic here.

**`output`, `test-results`:**
- Purpose: Playwright screenshots, smoke outputs, and test result artifacts.
- Generated: Yes.
- Committed: Artifact-dependent.
- Guidance: Use for evidence capture; do not import from runtime source.

**`.auth`, `.clerk`, `.tanstack`:**
- Purpose: Local tool/auth/cache directories.
- Generated: Yes.
- Committed: Environment-dependent.
- Guidance: Treat as local/tooling artifacts. Do not read or document secret values.

**Environment Files:**
- Purpose: Runtime environment configuration.
- Generated: Developer/local.
- Committed: `.env.example` is present; `.env.local` is present and must not be read or quoted.
- Guidance: Reference env var names from source code only, never values from environment files.

---

*Structure analysis: 2026-06-29*
