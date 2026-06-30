# Codebase Structure

**Analysis Date:** 2026-06-30

## Directory Layout

```text
agentic-economy/
|-- src/                         # TanStack Start app source
|   |-- routes/                  # File-based routes, API handlers, webhooks, discovery files
|   |-- components/              # AE product components and shadcn-style UI primitives
|   |-- modules/                 # Domain public contracts, internals, server bridges
|   |-- lib/                     # Shared HTTP/server/UI helpers
|   |-- styles/                  # Global CSS, tokens, landing styles
|   |-- future-phases/           # Parked route prototypes outside active route tree
|   |-- router.tsx               # Router factory
|   |-- start.ts                 # TanStack Start request middleware
|   `-- routeTree.gen.ts         # Generated TanStack route tree
|-- convex/                      # Convex source functions, schema composition, authz, stores
|-- tests/                       # Unit, integration, type, import, copy, SEO, UI, e2e, deploy-smoke tests
|-- public/                      # Static public image assets
|-- .planning/                   # GSD project/spec/phase/codebase documents
|-- .codex/                      # Project-local agent skills, workflows, hooks, config
|-- .agents/                     # Project-local UI/design/agent skills
|-- vite.config.ts               # Vite/TanStack Start/Nitro/React/Tailwind config
|-- vitest.config.ts             # Vitest config
|-- playwright.config.ts         # Local e2e config
|-- playwright.deploy-smoke.config.ts # Deploy smoke config
|-- tsconfig.json                # Strict TypeScript config and path aliases
|-- components.json              # shadcn/ui registry config
|-- tailwind.config.ts           # Tailwind content config
|-- package.json                 # Scripts and dependencies
`-- package-lock.json            # npm lockfile
```

## Directory Purposes

**`src/routes/`:**
- Purpose: Own active TanStack file-based routes, route loaders, server handlers, webhook endpoints, SEO head definitions, and route-level UI composition.
- Contains: Public pages (`src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`), owner/admin pages, API routes (`src/routes/api.businesses.ts`), discovery file routes (`src/routes/llms[.]txt.ts`), webhooks (`src/routes/api.business-actions.stripe-webhook.ts`).
- Key files: `src/routes/__root.tsx`, `src/routes/claim.tsx`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.schema.ts`.

**`src/components/ae/`:**
- Purpose: Own Agentic Economy-specific reusable UI surfaces.
- Contains: Public/admin shells, landing components, readback panels, status components, empty states, claim form sections.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeAdminShell.tsx`, `src/components/ae/landing/AePublicLanding.tsx`, `src/components/ae/readback/AeAdminReadbackPanel.tsx`.

**`src/components/ui/`:**
- Purpose: Own low-level shadcn-style primitives used across AE components and routes.
- Contains: Buttons, cards, alerts, inputs, textareas, native select, skeleton, spinner, badges, fields, separator.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/input.tsx`.

**`src/modules/`:**
- Purpose: Own domain contracts, pure state machines, source-state shapes, schema fragments, and TanStack server bridges.
- Contains: One directory per domain: `business`, `catalog`, `registry`, `discovery`, `security`, `observability`, `inquiries`, `notification-outbox`, `protected-action`, `business-action`, `billing`, `lifecycle`, `seo`, `common`.
- Key files: `src/modules/catalog/public.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/business-action/public.ts`, `src/modules/security/admin-readback.functions.ts`.

**`src/modules/<domain>/internal/`:**
- Purpose: Hide implementation details behind the owning module public contract.
- Contains: Pure command/state functions, DTO builders, validators, projection builders, and module-owned Convex table fragments.
- Key files: `src/modules/catalog/internal/publish.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/discovery/internal/ucp-manifest.ts`, `src/modules/observability/internal/audit.ts`.

**`src/lib/`:**
- Purpose: Own shared helpers that are not domain state machines.
- Contains: HTTP response helpers, server transport/admission/provider adapters, UI status/copy/contract-scan helpers, `cn` utility.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/http/discovery-response.ts`, `src/lib/ui/contract-scans.ts`, `src/lib/utils.ts`.

**`src/styles/`:**
- Purpose: Own global CSS, token CSS, and landing-specific CSS loaded by the root route.
- Contains: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/landing-v2.css`.
- Key files: `src/routes/__root.tsx` imports `src/styles/globals.css`.

**`src/future-phases/`:**
- Purpose: Keep parked phase route prototypes outside active `src/routes/` registration.
- Contains: Phase 4 owner action route prototype and Phase 5 billing route prototypes.
- Key files: `src/future-phases/04-owner-pending-protected-actions/routes/owner.actions.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.

**`convex/`:**
- Purpose: Own Convex source authority functions, schema composition, auth configuration, source-write verification, runtime source-state adapters, and store helpers.
- Contains: Domain Convex functions (`convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`), store helpers (`convex/businessActionStore.ts`, `convex/protectedActionStore.ts`), shared auth/source helpers.
- Key files: `convex/schema.ts`, `convex/authz.ts`, `convex/sourceWriteAdmission.ts`, `convex/source_state.ts`, `convex/auth.config.ts`.

**`tests/`:**
- Purpose: Own executable evidence for module logic, integration paths, route boundaries, copy/source guardrails, type contracts, SEO, UI contracts, accessibility, e2e, and deploy smoke.
- Contains: `tests/unit/`, `tests/integration/`, `tests/imports/`, `tests/types/`, `tests/copy/`, `tests/seo/`, `tests/ui-contract/`, `tests/e2e/`, `tests/deploy-smoke/`, `tests/fixtures/`.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, `tests/integration/registry-api.test.ts`, `tests/unit/schema/convex-schema.test.ts`.

**`public/`:**
- Purpose: Own static public image assets referenced by frontend surfaces.
- Contains: `public/images/*.png` and `public/ae-landing/` assets.
- Key files: `public/images/ae-hero.png`, `public/images/ae-registry.png`, `public/images/ae-service-listing-hero.png`.

**`.planning/`:**
- Purpose: Own GSD project authority docs, specs, phases, source-mining ledger, graph outputs, and codebase maps.
- Contains: `PROJECT.md`, `ENGINEERING-STANDARDS.md`, domain specs, phase plans/summaries, `.planning/source-mining/`, `.planning/graphs/`, `.planning/codebase/`.
- Key files: `.planning/PROJECT.md`, `.planning/ENGINEERING-STANDARDS.md`, `.planning/STATE.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.codex/skills/` and `.agents/skills/`:**
- Purpose: Own project-local agent skill instructions used by GSD, Convex, TanStack, Clerk, security, design, and UI workflows.
- Contains: `SKILL.md` files and rule/reference folders.
- Key files: `.codex/skills/gsd-map-codebase/SKILL.md`, `.codex/skills/tanstack-start/SKILL.md`, `.codex/skills/tanstack-router/SKILL.md`, `.codex/skills/convex-best-practices/SKILL.md`, `.codex/skills/clerk-tanstack-patterns/SKILL.md`.

## Key File Locations

**Entry Points:**
- `vite.config.ts`: Vite plugins for TanStack Start, Nitro, React, Tailwind, and port/path config.
- `src/start.ts`: Request middleware for CSRF, source-write admission, and Clerk.
- `src/router.tsx`: Router factory and TanStack Router type registration.
- `src/routes/__root.tsx`: Root route, HTML shell, stylesheet, Clerk provider.
- `src/routeTree.gen.ts`: Generated route tree consumed by `src/router.tsx`.

**Configuration:**
- `package.json`: npm scripts and dependencies.
- `tsconfig.json`: Strict TypeScript settings, `@/*` and `~/*` aliases.
- `vitest.config.ts`: Vitest node test config.
- `playwright.config.ts`: Local Playwright e2e config with dev server.
- `playwright.deploy-smoke.config.ts`: Deploy-smoke Playwright config.
- `components.json`: shadcn/ui aliases and icon library.
- `tailwind.config.ts`: Tailwind content roots.
- `convex/auth.config.ts`: Clerk issuer config for Convex auth.
- `.gitignore`: Ignored build, env, token-bearing, and report directories.

**Core Logic:**
- `src/modules/business/public.ts`: Claim, owner binding, public status, trust tier, suppression contracts.
- `src/modules/catalog/public.ts`: Service catalog, first-request capability, publish/readback contracts.
- `src/modules/registry/public.ts`: Registry projection/search/index contracts.
- `src/modules/discovery/public.ts`: Discovery/UCP/llms/sitemap contracts.
- `src/modules/security/public.ts`: CSRF, rate limit, duplicate, admin, dispute contracts.
- `src/modules/observability/public.ts`: Operation keys, audit, funnel, operator control contracts.
- `src/modules/inquiries/public.ts`: Inquiry/inbox/privacy/readback contracts.
- `src/modules/notification-outbox/public.ts`: Notification outbox contracts.
- `src/modules/protected-action/public.ts`: Protected action contracts.
- `src/modules/business-action/public.ts`: Business action receipt/evidence contracts.
- `convex/schema.ts`: Convex table composition.
- `convex/authz.ts`: Convex owner/admin authority helpers.
- `convex/sourceWriteAdmission.ts`: Convex source-write admission verification.
- `convex/source_state.ts`: Runtime DB adapter and source-state load/persist helpers.

**Testing:**
- `tests/unit/<domain>/*.test.ts`: Domain state-machine tests.
- `tests/integration/*.test.ts`: Cross-module route/source behavior.
- `tests/imports/*.test.ts`: Boundary/guardrail scans.
- `tests/types/*.test.ts`: Compile-time/domain contract tests.
- `tests/copy/*.test.ts`: Copy and public-claim scans.
- `tests/seo/*.test.ts`: SEO/discovery route contracts.
- `tests/ui-contract/*.test.ts`: UI copy/layout/class contract scans.
- `tests/e2e/**/*.spec.ts`: Browser flows and accessibility checks.
- `tests/deploy-smoke/*.spec.ts`: Fail-loud deployed proof harnesses.
- `tests/fixtures/bad-*`: Negative fixtures for scan tests.

## Naming Conventions

**Files:**
- File-based routes use TanStack route filenames in `src/routes/`: `index.tsx`, `registry.tsx`, `$slug.tsx`, `$slug.ucp.ts`, `owner.inquiries.$threadId.tsx`, `api.businesses.$slug.ts`, `llms[.]txt.ts`.
- UI route files use `.tsx`; route files that only return HTTP responses usually use `.ts`.
- Module public contracts are named `public.ts`: `src/modules/catalog/public.ts`.
- Module server bridges are named `*.functions.ts`: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/business-action/business-action.functions.ts`.
- Module implementation files live under `internal/` with descriptive kebab-case or domain names: `src/modules/catalog/internal/public-catalog-dto.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`.
- Module schema fragments are named `internal/schema.ts` or a clear Convex-specific variant: `src/modules/inquiries/internal/convex-schema.ts`.
- Convex runtime adapters use domain names at `convex/<domain>.ts`: `convex/catalog.ts`, `convex/businessActions.ts`.
- Convex store helpers use `*Store.ts`: `convex/businessActionStore.ts`, `convex/protectedActionStore.ts`.
- AE product components use PascalCase and `Ae` prefix: `src/components/ae/layout/AePublicShell.tsx`.
- UI primitives use lowercase filenames: `src/components/ui/button.tsx`.
- Generated files include `.gen`: `src/routeTree.gen.ts`.

**Directories:**
- Domain module directories use kebab-case: `src/modules/business-action`, `src/modules/notification-outbox`, `src/modules/protected-action`.
- Component category directories are semantic: `src/components/ae/layout`, `src/components/ae/status`, `src/components/ae/landing`.
- Test directories mirror concern/domain: `tests/unit/business-action`, `tests/integration`, `tests/imports`, `tests/e2e/a11y`.
- Phase planning directories include numeric phase prefixes: `.planning/phases/06-agentic-business-action-receipts`.

## Where to Add New Code

**New Public Page:**
- Primary code: `src/routes/<route>.tsx`
- UI components: `src/components/ae/<area>/`
- Server data bridge: `src/modules/<domain>/<feature>.functions.ts`
- Domain contracts: `src/modules/<domain>/public.ts`
- Tests: `tests/e2e/`, `tests/integration/`, `tests/ui-contract/`, and domain-specific `tests/unit/<domain>/`

**New API Route or Webhook:**
- Primary code: `src/routes/api.<resource>.ts`
- Raw-request helper: keep route handler small and delegate to `src/modules/<domain>/<feature>.functions.ts`
- Response helper: use or extend `src/lib/http/`
- Provider/server-only adapter: `src/lib/server/<provider>-provider.ts` or owning module server bridge.
- Tests: `tests/integration/`, `tests/unit/server/`, deploy smoke in `tests/deploy-smoke/` when external provider proof is required.

**New Domain Module:**
- Public contract: `src/modules/<domain>/public.ts`
- Pure implementation: `src/modules/<domain>/internal/<feature>.ts`
- Schema fragment: `src/modules/<domain>/internal/schema.ts`
- Server bridge: `src/modules/<domain>/<domain>.functions.ts` or a feature-named `*.functions.ts`
- Convex runtime: `convex/<domain>.ts`
- Schema composition: add `...<domain>Tables` to `convex/schema.ts`
- Tests: `tests/unit/<domain>/`, `tests/integration/`, `tests/types/`, import guardrails if boundaries expand.

**New Convex Table:**
- Define table in the owning domain schema fragment, not directly in `convex/schema.ts`.
- Import and spread the fragment in `convex/schema.ts`.
- Add indexes for every runtime query path.
- Add schema/contract tests in `tests/unit/schema/convex-schema.test.ts` or a domain-specific test.

**New Convex Function:**
- Put runtime query/mutation/action in `convex/<domain>.ts`.
- Reuse domain public contracts from `src/modules/<domain>/public.ts`.
- Use exact `args` and `returns` validators.
- Derive authority with `convex/authz.ts` helpers when owner/admin access is needed.
- Require `convex/sourceWriteAdmission.ts` for consequential writes.
- Expose it to routes through a module `*.functions.ts` source reference, not directly from route files.

**New Route Loader or Form Mutation:**
- Use `createServerFn()` in a module bridge or route-local only for very thin route-owned readbacks.
- Validate inputs with `.validator(...)`.
- Keep route components on `Route.useLoaderData()`, `Route.useSearch()`, `useServerFn()`, and module DTO/result unions.

**New Component:**
- AE product-specific component: `src/components/ae/<category>/ComponentName.tsx`.
- Generic primitive: `src/components/ui/<primitive>.tsx`.
- Shared class helper: `src/lib/utils.ts`.
- Status/copy presentation mapping: `src/lib/ui/status-presentation.ts` or `src/lib/ui/copy.ts`.

**Utilities:**
- Server-only helpers: `src/lib/server/`.
- HTTP response helpers: `src/lib/http/`.
- UI scanners/presentation helpers: `src/lib/ui/`.
- Cross-domain branded IDs/result helpers: `src/modules/common/`.

**Planning or Specs:**
- Project authority/spec docs: `.planning/`.
- Phase-specific plans/summaries: `.planning/phases/<phase-name>/`.
- Codebase maps: `.planning/codebase/`.
- Do not import `.planning/` from runtime code; scanner rejects planning runtime imports.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree.
- Generated: Yes.
- Committed: Yes.
- Rule: Do not edit by hand; edit `src/routes/**` and regenerate through TanStack tooling.

**`convex/_generated/`:**
- Purpose: Convex generated client/server/data-model files when Convex codegen runs.
- Generated: Yes.
- Committed: Not detected in current file scan.
- Rule: Do not use generated Convex files as domain interfaces.

**`src/future-phases/`:**
- Purpose: Parked phase route prototypes kept outside active route registration.
- Generated: No.
- Committed: Yes.
- Rule: Do not move files into `src/routes/` until the owning phase makes them active and route-tree/guardrail tests are updated.

**`tests/fixtures/`:**
- Purpose: Negative fixtures proving scanners fail on forbidden imports/copy/source-mining/TypeScript/UI patterns.
- Generated: No.
- Committed: Yes.
- Rule: Keep fixture-only violations under `tests/fixtures/bad-*`; runtime scans should stay clean.

**`.planning/`:**
- Purpose: GSD authority documents, specs, phase artifacts, source-mining ledger, graph reports, and codebase maps.
- Generated: Mixed.
- Committed: Yes.
- Rule: Runtime code must not import planning files.

**`.codex/` and `.agents/`:**
- Purpose: Project-local Codex/GSD skill and workflow instructions.
- Generated: Mixed.
- Committed: Ignored by `.gitignore` for `.codex/`; `.agents/` files are present.
- Rule: Read relevant `SKILL.md`/rules for implementation patterns; do not treat skills as runtime source.

**`.env.local` and `.env.example`:**
- Purpose: Environment configuration files are present.
- Generated: No.
- Committed: `.env.local` ignored; `.env.example` unignored by `.gitignore`.
- Rule: Never read or quote `.env*` contents in codebase maps or committed docs.

**`.clerk/`:**
- Purpose: Clerk local configuration/state.
- Generated: Yes.
- Committed: Ignored by `.gitignore`.
- Rule: Can include secrets; do not read contents.

**`.auth/`:**
- Purpose: Local auth/storage state files are present (`.auth/admin.json`, `.auth/owner.json`).
- Generated: Local runtime/support state.
- Committed: Present in workspace scan.
- Rule: Do not treat as runtime source; avoid reading token-bearing JSON.

**`dist/`, `.output/`, `.vercel/`, `output/`, `playwright-report/`, `test-results/`, `coverage/`:**
- Purpose: Build/deploy/test/report outputs.
- Generated: Yes.
- Committed: Ignored by `.gitignore` where listed.
- Rule: Do not add source code here.

**`graphify-out/` and `.planning/graphs/`:**
- Purpose: Codebase graph reports and graph data.
- Generated: Yes.
- Committed: `graphify-out/` ignored; `.planning/graphs/` present as planning artifact.
- Rule: Use as analysis output only; do not import from runtime.

---

*Structure analysis: 2026-06-30*
