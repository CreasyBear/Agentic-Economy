# Codebase Structure

**Analysis Date:** 2026-06-29

## Directory Layout

```text
agentic-economy/
|-- .agents/                  # Local agent/project skills, including shadcn guidance
|-- .auth/                    # Local auth artifacts
|-- .clerk/                   # Clerk local tooling/cache files
|-- .codex/                   # GSD/Codex workflows, agents, hooks, scripts, and skills
|-- .planning/                # GSD project state, specs, phase plans, and codebase maps
|-- .tanstack/                # TanStack local cache/tmp files
|-- .vercel/                  # Vercel output/config artifacts
|-- convex/                   # Convex auth config, schema composition, and runtime functions
|-- dist/                     # Build output
|-- output/                   # Test/screenshot output artifacts
|-- src/
|   |-- components/           # AE product components and shadcn UI primitives
|   |-- future-phases/        # Parked route handlers for phase-gated surfaces
|   |-- lib/                  # Shared HTTP, server, UI, and utility helpers
|   |-- modules/              # Domain modules with public seams and internal implementations
|   |-- routes/               # TanStack Router file routes and route handlers
|   |-- styles/               # Global Tailwind v4 and design token CSS
|   |-- routeTree.gen.ts      # Generated TanStack route tree
|   |-- router.tsx            # Router factory
|   `-- start.ts              # TanStack Start instance and middleware
|-- test-results/             # Playwright/test result artifacts
|-- tests/                    # Vitest, Playwright, guardrail, type, SEO, and smoke tests
|-- components.json           # shadcn/radix-nova project config
|-- package.json              # NPM scripts and dependencies
|-- tailwind.config.ts        # Tailwind config
|-- tsconfig.json             # TypeScript project config and path aliases
|-- vite.config.ts            # Vite/TanStack Start/Nitro/Tailwind config
`-- vitest.config.ts          # Vitest config
```

## Directory Purposes

**`src/routes`:**
- Purpose: TanStack Router file-based routes and HTTP route handlers.
- Contains: Page routes (`src/routes/claim.tsx`), nested dynamic routes (`src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`), API handlers (`src/routes/api.businesses.ts`), discovery files (`src/routes/llms[.]txt.ts`), owner/admin pages (`src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`).
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/claim.tsx`, `src/routes/$slug.tsx`, `src/routes/registry.tsx`, `src/routes/api.discovery.schema.ts`.

**`src/modules`:**
- Purpose: Domain-owned contracts, state transitions, validators, table fragments, and server-function adapters.
- Contains: One directory per domain: `business`, `catalog`, `registry`, `discovery`, `inquiries`, `notification-outbox`, `protected-action`, `billing`, `security`, `observability`, `seo`, `lifecycle`, `common`.
- Key files: `src/modules/*/public.ts`, `src/modules/*/internal/*.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`.

**`src/modules/common`:**
- Purpose: Shared low-level domain utilities.
- Contains: Branded IDs, stable hashing, Convex literal helpers, result helpers.
- Key files: `src/modules/common/ids.ts`, `src/modules/common/stable-hash.ts`, `src/modules/common/result.ts`, `src/modules/common/convex-literals.ts`.

**`src/components/ae`:**
- Purpose: Product-specific UI components that compose shadcn primitives.
- Contains: Shells, page headers, form sections, status/readback components, empty states.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeAdminShell.tsx`, `src/components/ae/status/AeStatusBadge.tsx`, `src/components/ae/readback/AeAdminReadbackPanel.tsx`.

**`src/components/ui`:**
- Purpose: Checked-in shadcn/radix-nova UI primitives.
- Contains: Button, card, field, input, textarea, badge, alert, separator, skeleton, spinner, empty state primitives.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/field.tsx`, `src/components/ui/input.tsx`.

**`src/lib`:**
- Purpose: Shared helpers that are not domain modules.
- Contains: HTTP response helpers, server-only provider/source clients, UI copy/presentation/scanners, utility class combiner.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`, `src/lib/http/discovery-response.ts`, `src/lib/ui/contract-scans.ts`, `src/lib/utils.ts`.

**`src/styles`:**
- Purpose: Global CSS imports, Tailwind v4 theme mappings, and semantic design tokens.
- Contains: `globals.css` imports Tailwind/shadcn/font/tokens; `tokens.css` defines AE and shadcn CSS variables.
- Key files: `src/styles/globals.css`, `src/styles/tokens.css`.

**`src/future-phases`:**
- Purpose: Parked route handlers for phase-gated owner actions and billing routes.
- Contains: `src/future-phases/04-owner-pending-protected-actions/routes/*`, `src/future-phases/05-paid-activation-money-rails/routes/*`, shared route helpers.
- Key files: `src/future-phases/route-helpers.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.

**`convex`:**
- Purpose: Durable backend runtime and schema.
- Contains: Auth config, authorization helpers, runtime source-state adapters, schema composition, domain function wrappers.
- Key files: `convex/schema.ts`, `convex/auth.config.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/security.ts`, `convex/observability.ts`.

**`tests`:**
- Purpose: Unit, integration, type, import guardrail, UI contract, copy, SEO, E2E, and deploy-smoke verification.
- Contains: `tests/unit`, `tests/integration`, `tests/types`, `tests/imports`, `tests/ui-contract`, `tests/copy`, `tests/seo`, `tests/e2e`, `tests/deploy-smoke`, `tests/fixtures`.
- Key files: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/ts-standards.test.ts`, `tests/types/domain-contracts.test.ts`, `tests/unit/server/server-seams.test.ts`.

**`.planning`:**
- Purpose: GSD state, product requirements, phase plans, source-mining ledger, and codebase maps.
- Contains: `STATE.md`, specs, phase directories, source-mining ledger, generated codebase docs.
- Key files: `.planning/STATE.md`, `.planning/source-mining/phase-1-ledger.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.codex` and `.agents`:**
- Purpose: Local workflows, hooks, agents, and skills.
- Contains: GSD skill/workflow definitions in `.codex/skills` and project UI skill in `.agents/skills/shadcn`.
- Key files: `.codex/skills/gsd-map-codebase/SKILL.md`, `.agents/skills/shadcn/SKILL.md`, `.codex/skills/convex-best-practices/SKILL.md`, `.codex/skills/tanstack-router/SKILL.md`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start instance, CSRF middleware, Clerk middleware.
- `src/router.tsx`: Router factory using `src/routeTree.gen.ts`.
- `src/routes/__root.tsx`: Root document and Clerk provider wrapper.
- `vite.config.ts`: Vite/TanStack Start/Nitro/Tailwind plugin setup.

**Configuration:**
- `package.json`: Scripts, dependency versions, package manager.
- `tsconfig.json`: Strict TypeScript config and aliases `@/*` and `~/*` to `src/*`.
- `components.json`: shadcn/radix-nova config, aliases, Tailwind CSS file, lucide icon library.
- `tailwind.config.ts`: Tailwind config file referenced by shadcn.
- `vitest.config.ts`: Vitest config.
- `playwright.config.ts`: E2E Playwright config.
- `playwright.deploy-smoke.config.ts`: Deploy smoke Playwright config.
- `convex/tsconfig.json`: Convex TypeScript config.
- `.env.example`: Environment example file present.
- `.env.local`: Local environment file present; do not read or quote contents.

**Core Logic:**
- `src/modules/business/public.ts`: Business, owner, claim, visibility contracts and public exports.
- `src/modules/business/internal/claim.ts`: Pure claim state transition.
- `src/modules/catalog/public.ts`: Catalog, service, first-request, public route DTO, and publish contracts.
- `src/modules/catalog/internal/publish.ts`: Pure catalog publish state transition.
- `src/modules/catalog/owner-claim.functions.ts`: Claim/publish server function bridge to Convex.
- `src/modules/registry/public.ts`: Registry projection/search/index health contracts.
- `src/modules/discovery/public.ts`: UCP fallback, discovery file, developer discovery contracts.
- `src/modules/inquiries/public.ts`: Inquiry, inbox, privacy, operator reconstruction contracts.
- `src/modules/inquiries/inquiry.functions.ts`: Inquiry server function bridge to Convex.
- `src/modules/notification-outbox/public.ts`: Notification dispatch/outbox contracts.
- `src/modules/protected-action/public.ts`: Contact-follow-up protected-action contracts.
- `src/modules/protected-action/contact-follow-up.functions.ts`: Protected-action server function bridge.
- `src/modules/security/public.ts`: CSRF, rate limit, duplicate, admin, dispute, suppression contracts.
- `src/modules/observability/public.ts`: Operation key, audit, funnel, operator-control contracts.
- `src/modules/seo/public.ts`: Public business SEO and JSON-LD exports.

**Convex Runtime:**
- `convex/schema.ts`: Convex schema composition from module fragments.
- `convex/auth.config.ts`: Clerk JWT issuer configuration for Convex auth.
- `convex/authz.ts`: Clerk identity to owner/admin authority mapping.
- `convex/source_state.ts`: Runtime DB adapter and Phase 1 source-state load/persist helpers.
- `convex/business.ts`: Business claim and suppression mutations.
- `convex/catalog.ts`: Catalog publish and public catalog readbacks.
- `convex/registry.ts`: Public registry list/search/detail and catalog health reads.
- `convex/discovery.ts`: Discovery manifest generation/invalidation/file reads.
- `convex/inquiries.ts`: Public inquiry, owner inbox/detail/mutations, privacy, operator readbacks.
- `convex/notificationOutbox.ts`: Notification dispatch, attempts, webhook events, system send reads.
- `convex/security.ts`: Admin claims/audit/index/inquiry readbacks and security operations.
- `convex/observability.ts`: Audit/operator/observability runtime functions.

**Route Files:**
- `src/routes/index.tsx`: Home page.
- `src/routes/claim.tsx`: Owner claim form.
- `src/routes/claim.success.tsx`: Claim success readback route.
- `src/routes/$slug.tsx`: Public business page route.
- `src/routes/$slug.inquiry.tsx`: Public inquiry route.
- `src/routes/$slug.ucp.ts`: AE-hosted UCP fallback JSON route.
- `src/routes/registry.tsx`: Registry UI route.
- `src/routes/api.businesses.ts`: Public catalog list API and shared helpers.
- `src/routes/api.businesses.search.ts`: Public catalog search API.
- `src/routes/api.businesses.$slug.ts`: Public catalog detail API.
- `src/routes/llms[.]txt.ts`: LLM discovery text route.
- `src/routes/sitemap[.]xml.ts`: Sitemap XML route.
- `src/routes/robots[.]txt.ts`: Robots text route.
- `src/routes/developers.discovery.tsx`: Developer discovery UI route.
- `src/routes/api.discovery.schema.ts`: Developer discovery schema/route-health API.
- `src/routes/api.discovery.examples.ts`: Developer discovery examples route.
- `src/routes/api.discovery.fixtures.ts`: Developer discovery fixtures route.
- `src/routes/owner.inquiries.tsx`: Owner inbox route.
- `src/routes/owner.inquiries.$threadId.tsx`: Owner inquiry detail route.
- `src/routes/owner.actions.tsx`: Owner contact-follow-up queue route.
- `src/routes/owner.actions.$proposalId.tsx`: Owner contact-follow-up detail route.
- `src/routes/owner.actions.$proposalId.receipt.tsx`: Owner contact-follow-up receipt route.
- `src/routes/admin.claims.tsx`: Admin claims readback route.
- `src/routes/admin.audit-events.tsx`: Admin audit readback route.
- `src/routes/admin.index-health.tsx`: Admin index health readback route.
- `src/routes/admin.inquiries.tsx`: Admin inquiries readback route.
- `src/routes/admin.protected-actions.tsx`: Admin protected-actions route.
- `src/routes/api.notification.resend-webhook.ts`: Resend webhook ingestion route.
- `src/routes/api.notification.resend-dispatch.ts`: Resend dispatch route.
- `src/routes/api.notification.novu-dispatch.ts`: Novu dispatch route.
- `src/routes/privacy.remove-business.tsx`: Removal/correction dispute route.
- `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`: Clerk auth catch-all routes.

**Testing:**
- `tests/unit`: Domain unit tests and server seam tests.
- `tests/integration`: Route/runtime integration tests.
- `tests/types`: Type contract tests.
- `tests/imports`: Architecture/import/source-mining guardrails.
- `tests/ui-contract`: UI token and status-copy guardrails.
- `tests/copy`: Copy claim scans.
- `tests/seo`: SEO and discovery file tests.
- `tests/e2e`: Browser E2E and accessibility tests.
- `tests/deploy-smoke`: Deployed environment smoke tests.

## Naming Conventions

**Files:**
- Route files use TanStack Router file-route names: `src/routes/$slug.tsx`, `src/routes/api.businesses.$slug.ts`, `src/routes/llms[.]txt.ts`.
- Route pages use `.tsx`; JSON/text route handlers can use `.ts`.
- Domain public seam is always `src/modules/<domain>/public.ts`.
- Domain internals live under `src/modules/<domain>/internal/*.ts`.
- Convex table fragments use `schema.ts` or `convex-schema.ts` under the owning domain, such as `src/modules/inquiries/internal/convex-schema.ts`.
- Server-function bridge files use domain-specific `*.functions.ts`, such as `src/modules/inquiries/inquiry.functions.ts`.
- AE product components use `Ae` prefix and PascalCase: `src/components/ae/status/AeStatusBadge.tsx`.
- shadcn primitives use lowercase file names: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`.
- Tests use `*.test.ts` or `*.spec.ts` by test type and directory.

**Directories:**
- Domain directories use lowercase or kebab-case names: `src/modules/notification-outbox`, `src/modules/protected-action`.
- AE component categories use purpose folders: `layout`, `forms`, `status`, `readback`, `feedback`.
- Parked phase directories include phase number and slug: `src/future-phases/04-owner-pending-protected-actions`.
- GSD phase planning directories follow numbered phase slugs under `.planning/phases`.

**Imports:**
- Use `@/` or `~/` aliases for `src/*` imports as configured in `tsconfig.json`.
- Use relative imports within the same route family for route helper reuse, such as `src/routes/api.businesses.search.ts` importing `./api.businesses`.
- Use module public seams for cross-domain imports: `@/modules/catalog/public`, not `@/modules/catalog/internal/*`.
- Use `src/lib/server/*` only from server-only adapters/routes; do not import server secrets into client-only component helpers.

## Where to Add New Code

**New Public Page Route:**
- Primary code: `src/routes/<route>.tsx`
- Route data: Use a route `loader` or a domain server function under `src/modules/<domain>/*.functions.ts`.
- UI components: Reuse `src/components/ae/*` and `src/components/ui/*`.
- Tests: Add route/integration tests under `tests/integration` and browser tests under `tests/e2e` when user-facing behavior changes.

**New API Route:**
- Primary code: `src/routes/api.<name>.ts`
- Shared response helpers: `src/lib/http/*`
- Source reads/writes: Call module public seams or server source helpers; avoid direct module internals.
- Tests: Add integration tests under `tests/integration` and route-boundary coverage under `tests/imports` if a new pattern appears.

**New Domain Module:**
- Public contracts: `src/modules/<domain>/public.ts`
- Pure implementation: `src/modules/<domain>/internal/*.ts`
- Validators: `src/modules/<domain>/internal/validators.ts`
- Convex schema fragment: `src/modules/<domain>/internal/schema.ts`
- Convex runtime wrapper: `convex/<domain>.ts`
- Tests: `tests/unit/<domain>/*.test.ts`, plus integration tests when routes or Convex wrappers are used.
- Boundary rule: Export through `public.ts`; do not import another module's internals.

**New Convex Table:**
- Table fragment: Owning `src/modules/<domain>/internal/schema.ts`
- Schema composition: Add spread to `convex/schema.ts`
- Runtime functions: Add or extend `convex/<domain>.ts`
- Domain contracts: Add exact unions/types to `src/modules/<domain>/public.ts`
- Tests: Update `tests/unit/schema/convex-schema.test.ts` and relevant unit/integration tests.

**New Convex Query/Mutation:**
- Runtime function: `convex/<domain>.ts`
- Server function bridge: `src/modules/<domain>/*.functions.ts` or route-local helper when tightly route-scoped.
- Source reference: Use `sourceQuery` or `sourceMutation` from `src/lib/server/convex-source.ts`.
- Validation: Define explicit Convex `args` and `returns`; do not use `v.any()`.
- Authority: Resolve owner/admin authority through `convex/authz.ts` and domain security helpers.

**New Server Function:**
- Implementation: `src/modules/<domain>/*.functions.ts`
- Input validation: Zod schema near the server function.
- Convex access: Use `callSourceQuery`, `callSourceMutation`, `callPublicSourceQuery`, or `callPublicSourceMutation` from `src/lib/server/convex-source.ts`.
- Local E2E readback: Gate deterministic local behavior behind `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` only when the existing route test strategy requires it.

**New Provider Integration:**
- Server-only helpers: `src/lib/server/<provider>-provider.ts`
- Domain state: Owning module under `src/modules/<domain>`
- Route handler: `src/routes/api.<provider>.*.ts` for callbacks or guarded dispatch routes.
- Secrets: Read only from server env in `src/lib/server/*`; never expose values or read `.env.local` in docs/tests.
- Tests: Add unit server seam tests under `tests/unit/server` and deploy smoke tests under `tests/deploy-smoke` when real deployment proof is required.

**New UI Component:**
- Product-specific component: `src/components/ae/<category>/Ae<Name>.tsx`
- shadcn primitive: `src/components/ui/<primitive>.tsx`, usually added through the shadcn CLI.
- Styling: Use semantic tokens, `gap-*`, shadcn variants, `FieldGroup`/`Field`, and lucide `data-icon` patterns from `.agents/skills/shadcn/SKILL.md`.
- Tests/scans: Update `tests/ui-contract` when adding new class or copy patterns.

**New Copy Or Status Presentation:**
- Shared copy: `src/lib/ui/copy.ts`
- Status mapping: `src/lib/ui/status-presentation.ts`
- Component use: `src/components/ae/status/*`
- Tests: `tests/copy`, `tests/ui-contract/status-copy.test.ts`, and domain route tests for material copy behavior.

**New SEO Or Discovery Output:**
- SEO logic: `src/modules/seo/public.ts` and `src/modules/seo/internal/*`
- Discovery logic: `src/modules/discovery/public.ts` and `src/modules/discovery/internal/*`
- Routes: `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/api.discovery.*.ts`
- Tests: `tests/seo`, `tests/integration/discovery-*.test.ts`, `tests/unit/discovery/*.test.ts`.

**New Test Fixture For Guardrails:**
- Fixtures: `tests/fixtures/<category>`
- Scanner targets: `tests/imports/scan-targets.ts`
- Guard tests: `tests/imports`, `tests/copy`, `tests/ui-contract`.
- Keep fixture mode behind `AE_SCAN_MODE=fixtures`; clean runtime scans should pass with no violations.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router route tree.
- Generated: Yes.
- Committed: Yes.
- Guidance: Do not edit manually. Add or change files in `src/routes` and let the router generator update this file.

**`convex/_generated`:**
- Purpose: Generated Convex API/types.
- Generated: Yes.
- Committed: Not treated as source by `tsconfig.json`; excluded from TypeScript project checks.
- Guidance: Do not depend on generated output where the source-reference pattern is already used; `src/lib/server/convex-source.ts` supports named references without generated API output.

**`src/future-phases`:**
- Purpose: Parked implementation surfaces for phase-gated routes.
- Generated: No.
- Committed: Yes.
- Guidance: Keep phase-gated routes here until their active route registration is intentionally introduced. Import guardrails allow these paths explicitly.

**`.planning`:**
- Purpose: GSD planning artifacts, source mining ledger, phase plans, and codebase maps.
- Generated: Mixed.
- Committed: Yes.
- Guidance: Runtime source must not import from `.planning`. Update only assigned planning files during mapper/planner workflows.

**`.codex`:**
- Purpose: Local GSD workflows, agents, hooks, scripts, and skill definitions.
- Generated: Mixed.
- Committed: Yes.
- Guidance: Read relevant skills before implementation work. Do not import `.codex` files from runtime source.

**`.agents`:**
- Purpose: Local project skill definitions.
- Generated: Mixed.
- Committed: Yes.
- Guidance: `./.agents/skills/shadcn/SKILL.md` defines shadcn UI composition and styling constraints used by this repo.

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
