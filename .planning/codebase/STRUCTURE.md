# Codebase Structure

**Analysis Date:** 2026-07-03

## Directory Layout

```text
agentic-economy/
|-- AGENTS.md                  # Always-on product, action, Convex, and vocabulary constraints
|-- PRODUCT.md                 # Product thesis, safe assistant contract, and non-goals
|-- DESIGN.md                  # Visual system authority and Astryx-era UI constraints
|-- package.json               # Scripts, runtime dependencies, package manager
|-- vite.config.ts             # TanStack Start, Vite, Tailwind, Nitro, and Sentry build setup
|-- vitest.config.ts           # Vitest unit/integration test configuration
|-- playwright.config.ts       # Playwright browser test configuration
|-- tsconfig.json              # TypeScript compiler and path alias configuration
|-- src/
|   |-- start.ts               # TanStack Start request handler and middleware stack
|   |-- router.tsx             # Router factory
|   |-- routeTree.gen.ts       # Generated TanStack route tree
|   |-- routes/                # File-based public, owner/admin, API, discovery, and webhook routes
|   |-- modules/               # Domain modules, actions, server functions, schemas, and public seams
|   |-- components/            # Astryx adapters, AE layout/feature components, and legacy UI primitives
|   |-- lib/                   # Shared HTTP, server, observability, operator, and UI utilities
|   |-- hooks/                 # Client hooks
|   |-- styles/                # Global CSS cascade and tokens
|   |-- app/                   # Unrouted Astryx sample/prototype pages
|   `-- future-phases/         # Parked route snapshots for planned owner/protected-action phases
|-- convex/
|   |-- schema.ts              # Convex schema composition
|   |-- auth.config.ts         # Convex auth provider configuration
|   |-- authz.ts               # Convex owner/admin authorization helpers
|   |-- source_state.ts        # Source-state import/upsert runtime facade
|   |-- sourceWriteAdmission.ts# Convex source-write admission verifier
|   |-- registry.ts            # Public catalog queries
|   |-- catalog.ts             # Catalog claim/publish mutations
|   |-- inquiries.ts           # Public inquiry and owner inbox functions
|   |-- _generated/            # Generated Convex API/type files
|   `-- *.ts                   # Billing, protected action, notification, answer, harness, security domains
|-- public/                    # Static browser assets
|-- e2e/                       # Playwright specs and browser helpers
|-- tests/                     # Cross-cutting test helpers and smoke specs
|-- docs/                      # Project documentation
|-- scripts/                   # Maintenance, audit, and validation scripts
|-- .planning/                 # GSD state, plans, and generated codebase maps
|-- .codex/skills/             # Project-specific Codex skills and rules
|-- .agents/skills/            # Agent skills mirrored for this project
`-- .output/                   # Generated build output
```

## Directory Purposes

**Root files:**
- Purpose: Hold product/design authority, tool configuration, package metadata, and test/build entry points.
- Contains: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `package.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`.
- Key files: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `package.json`.

**`src/routes/`:**
- Purpose: File-based TanStack routes for human pages, API endpoints, discovery payloads, and provider callbacks.
- Contains: `*.tsx` page routes, `api.*.ts` handlers, crawler/discovery routes, owner/admin/developer routes.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`.

**`src/modules/`:**
- Purpose: Domain ownership layer for actions, server functions, schemas, projections, and internal implementation details.
- Contains: Domain folders such as `registry`, `inquiries`, `answer`, `answer-thread`, `harness`, `billing`, `catalog`, `business-action`, `protected-action`, `discovery`, `security`, `notification-outbox`, `observability`, `common`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/answer/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/harness/public.ts`.

**`src/modules/*/internal/`:**
- Purpose: Keep non-public algorithms and orchestration details behind a domain seam.
- Contains: Tool-use agent internals, answer turn orchestration, run finalization, protected evidence, private helpers.
- Key files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`.

**`src/components/`:**
- Purpose: Client and shared React components.
- Contains: `ae/` application components, `astryx/` adapters, `ai-elements/` chat elements, `animate/` animation primitives, `ui/` legacy primitives.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/chat/AeChat.tsx`, `src/components/astryx/RouterLink.tsx`.

**`src/components/ae/`:**
- Purpose: AE feature components and shells that compose Astryx primitives with domain-specific behavior.
- Contains: `brand`, `chat`, `feedback`, `forms`, `inquiries`, `landing`, `layout`, `listing`, `operator`, `registry`, `status`, plus legacy presentation subfolders.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/registry/AeRegistryCard.tsx`.

**`src/lib/`:**
- Purpose: Shared infrastructure utilities outside a single domain.
- Contains: `http/` response and CSRF helpers, `server/` source/auth/provider helpers, `operator/` route options, `observability/` telemetry utilities, `ui/` helpers.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/server/notification-provider.ts`, `src/lib/operator/route-options.ts`, `src/lib/http/json.ts`.

**`src/styles/`:**
- Purpose: Global cascade and theme integration.
- Contains: Global CSS, token imports, base styles, legacy compatibility stylesheet.
- Key files: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/legacy.css`.

**`src/hooks/`:**
- Purpose: Client hooks shared by components.
- Contains: UI and behavior hooks.
- Key files: Use this directory for hooks that are not owned by a specific domain component folder.

**`src/app/`:**
- Purpose: Unrouted Astryx sample/prototype pages.
- Contains: `src/app/ai-chat/`, `src/app/ai-chat-landing/`, `src/app/library/`.
- Key files: Treat these as reference/prototype assets unless a route explicitly imports them.

**`src/future-phases/`:**
- Purpose: Parked route snapshots for planned or staged work.
- Contains: `src/future-phases/04-owner-pending-protected-actions/routes/`, `src/future-phases/05-paid-activation-money-rails/routes/`.
- Key files: Do not wire these into the active route tree without an implementation plan.

**`convex/`:**
- Purpose: Convex backend schema, queries, mutations, actions, auth, and source-state persistence.
- Contains: Domain backend files, generated API files, validators, source-write verifier, schema fragments.
- Key files: `convex/schema.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/answerThreads.ts`, `convex/notificationOutbox.ts`, `convex/billing.ts`, `convex/protectedActions.ts`, `convex/businessActions.ts`.

**`convex/_generated/`:**
- Purpose: Generated Convex API and type files.
- Contains: `api.d.ts`, `api.js`, `dataModel.d.ts`, `server.d.ts`, `server.js`, and AI guidelines.
- Key files: `convex/_generated/ai/guidelines.md` is required reading before Convex code changes; generated API files are not manually edited.

**`e2e/`:**
- Purpose: Playwright browser-level tests and helpers.
- Contains: End-to-end specs for public, owner, agent, notification, and discovery workflows.
- Key files: `e2e/*.spec.ts`, `e2e/helpers/`.

**`tests/`:**
- Purpose: Shared test utilities and non-route test assets.
- Contains: Smoke helpers, fixtures, test support code.
- Key files: Use when a helper is shared across multiple test directories.

**`scripts/`:**
- Purpose: Project maintenance, audits, fixtures, and validation commands.
- Contains: Node/TypeScript scripts for architecture checks, generated data, and operational checks.
- Key files: Prefer existing scripts when validating architectural boundaries or generated outputs.

**`.planning/`:**
- Purpose: GSD orchestration state, milestone documents, and codebase maps.
- Contains: `STATE.md`, plans, summaries, and `.planning/codebase/*.md`.
- Key files: `.planning/STATE.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.codex/skills/` and `.agents/skills/`:**
- Purpose: Project-local implementation skills and rules.
- Contains: Skill directories such as `gsd-map-codebase`, `convex`, `tanstack-router`, `clerk`, `sddesign`, `submit-qualified-inquiry`.
- Key files: `.codex/skills/gsd-map-codebase/SKILL.md`, `.agents/skills/convex/SKILL.md`, `.codex/skills/tanstack-router/SKILL.md`, `.agents/skills/submit-qualified-inquiry/SKILL.md`.

**`.output/`:**
- Purpose: Generated build output.
- Contains: Nitro/TanStack build artifacts.
- Key files: Treat all files under `.output/` as generated output.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start request handler and middleware registration.
- `src/router.tsx`: Router factory and route tree hookup.
- `src/routes/__root.tsx`: Root layout, providers, global assets, and top-level error handling.
- `src/routes/index.tsx`: Home route and answer prompt entry.
- `src/routes/registry.tsx`: Human registry search route.
- `src/routes/$slug.tsx`: Human provider detail route.
- `src/routes/$slug.inquiry.tsx`: Human qualified inquiry route.

**API and Machine Surfaces:**
- `src/routes/api.agent.tools.ts`: Quiet agent tool listing and invocation.
- `src/routes/api.answer.turn.ts`: Live answer SSE endpoint.
- `src/routes/api.businesses.ts`: Public business list JSON endpoint.
- `src/routes/api.businesses.search.ts`: Public registry search JSON endpoint.
- `src/routes/api.businesses.$slug.ts`: Public provider detail JSON endpoint.
- `src/routes/$slug.ucp.ts`: Per-provider agent JSON discovery payload.
- `src/routes/llms[.]txt.ts`: Canonical assistant index.
- `src/routes/sitemap[.]xml.ts`: Public sitemap.
- `src/routes/api.notification.resend-dispatch.ts`: Internal Resend dispatch endpoint.
- `src/routes/api.notification.resend-webhook.ts`: Resend callback endpoint.
- `src/routes/api.business-actions.stripe-webhook.ts`: Stripe webhook endpoint.

**Configuration:**
- `package.json`: Scripts and dependencies.
- `vite.config.ts`: Vite/TanStack Start/Nitro/Tailwind/Sentry setup.
- `vitest.config.ts`: Vitest configuration.
- `playwright.config.ts`: Browser test configuration.
- `playwright.deploy-smoke.config.ts`: Deployment smoke browser test configuration.
- `tsconfig.json`: TypeScript compiler and path alias settings.
- `autumn.config.ts`: Autumn billing configuration.
- `doctor.config.ts`: Project doctor configuration.

**Core Logic:**
- `src/modules/common/action.ts`: Action contract abstraction.
- `src/modules/actions/index.ts`: Central action registry.
- `src/modules/registry/registry.actions.ts`: Registry action declarations.
- `src/modules/registry/registry.functions.ts`: Registry source access and search helpers.
- `src/modules/inquiries/inquiry.actions.ts`: Inquiry action declaration.
- `src/modules/inquiries/inquiry.functions.ts`: Inquiry server functions and source mutations.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Answer turn phase orchestration.
- `src/modules/answer/internal/answer-tool-use-agent.ts`: Tool-use model loop and evidence gating.
- `src/modules/harness/run-loop.ts`: Harness phase/tool/model runtime.
- `src/lib/server/convex-source.ts`: Convex source client facade.
- `src/lib/server/source-write-admission.ts`: Server source-write admission helpers.
- `src/modules/security/source-write-admission.ts`: Admission scopes and HMAC implementation.

**Backend Logic:**
- `convex/schema.ts`: Convex schema composition.
- `convex/source_state.ts`: Source-state persistence and upsert logic.
- `convex/sourceWriteAdmission.ts`: Convex-side admission verification.
- `convex/authz.ts`: Convex owner/admin authorization.
- `convex/registry.ts`: Public catalog read queries.
- `convex/catalog.ts`: Catalog publish/claim mutations.
- `convex/inquiries.ts`: Inquiry submission and owner inbox mutations/queries.
- `convex/answerThreads.ts`: Answer thread persistence.
- `convex/notificationOutbox.ts`: Notification dispatch state.
- `convex/billing.ts`: Billing state and readbacks.
- `convex/protectedActions.ts`: Protected action queue and admin flows.
- `convex/businessActions.ts`: Business action request/checkpoint/receipt/evidence flows.

**UI:**
- `src/components/ae/layout/AePublicShell.tsx`: Public shell.
- `src/components/ae/layout/AeOperatorShell.tsx`: Owner/admin shell.
- `src/components/ae/chat/AeChat.tsx`: Chat client runtime.
- `src/components/ae/listing/AeProviderListingPage.tsx`: Provider listing UI.
- `src/components/ae/registry/AeRegistryCard.tsx`: Registry card UI.
- `src/components/astryx/RouterLink.tsx`: Astryx router link adapter.
- `src/styles/globals.css`: Global CSS entry.

**Testing:**
- `src/modules/__tests__/`: Module architecture, action, agent boundary, and domain tests.
- `src/routes/__tests__/`: Route tests.
- `src/lib/__tests__/`: Shared infrastructure tests.
- `e2e/`: Playwright tests.
- `tests/`: Shared test helpers and smoke support.

## Naming Conventions

**Files:**
- Route files follow TanStack file routing in `src/routes/`: `index.tsx`, `$slug.tsx`, `$slug.inquiry.tsx`, `api.agent.tools.ts`, `llms[.]txt.ts`.
- Domain public seams use `public.ts`: `src/modules/answer/public.ts`, `src/modules/harness/public.ts`.
- Domain action files use `<domain>.actions.ts`: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Domain server/source files use `<domain>.functions.ts`: `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`.
- Domain schema files use `<domain>.schema.ts`: `src/modules/answer/answer-schema.ts`, `src/modules/answer-thread/answer-thread.schema.ts`.
- Readback/projection files use descriptive suffixes: `src/modules/inquiries/route-readbacks.ts`, `src/modules/answer/projection.ts`, `src/modules/billing/owner-billing.readback.ts`.
- React component files are PascalCase with `Ae` prefix for existing AE-specific components: `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/chat/AeChat.tsx`.
- Convex backend files use domain names without `src/`: `convex/registry.ts`, `convex/inquiries.ts`, `convex/sourceWriteAdmission.ts`.
- Test files use `.test.ts` or `.test.tsx` under the same domain-oriented test area.

**Directories:**
- Domain modules use kebab-case or concise domain names under `src/modules/`: `answer-thread`, `business-action`, `protected-action`, `notification-outbox`.
- Component feature directories use lowercase domain names under `src/components/ae/`: `registry`, `listing`, `inquiries`, `operator`, `layout`.
- Private domain implementation belongs under `src/modules/<domain>/internal/`.
- Generated code lives in generated directories or files only: `src/routeTree.gen.ts`, `convex/_generated/`, `.output/`.

**Functions and Values:**
- Server functions exported to routes commonly use verbs and a `Server` suffix: `readPublicBusinessPageServer`, `submitPublicInquiryServer`, `readCurrentOwnerInboxServer`.
- Source helper functions commonly use `ThroughSource` for Convex-backed operations: `submitPublicInquiryThroughSource`, `readCurrentOwnerInboxThroughSource`.
- Action ids use dotted names: `registry.search`, `registry.detail`, `inquiry.submit`.
- Admission scopes use snake_case constants in `src/modules/security/source-write-admission.ts`: `public_inquiry`, `owner_claim`, `protected_action`.
- Zod schemas use clear input/result names near the boundary they validate.

## Where to Add New Code

**New public route:**
- Primary code: `src/routes/<route>.tsx`
- Data loading: Add route loaders or server functions in the owning `src/modules/<domain>/<domain>.functions.ts`.
- UI: Compose existing Astryx-backed shells from `src/components/ae/layout/`.
- Tests: Add route tests under `src/routes/__tests__/` and browser coverage under `e2e/` when behavior is user-facing.

**New API endpoint:**
- Primary code: `src/routes/api.<name>.ts`
- Domain logic: Put behavior in `src/modules/<domain>/`, not in the route handler.
- Response helpers: Use `src/lib/http/json.ts`.
- Tests: Add route tests under `src/routes/__tests__/`.

**New assistant-callable operation:**
- Primary code: `src/modules/<domain>/<domain>.actions.ts`
- Registration: Import and add it in `src/modules/actions/index.ts`.
- Boundaries: Add an honest `summary` and explicit `boundaries` list.
- Surfaces: Add `agentTools` only when the action is safe for quiet assistant invocation.
- Tests: Extend action/agent boundary tests under `src/modules/__tests__/`.

**New Convex-backed read:**
- Backend: Add indexed Convex query in `convex/<domain>.ts` and schema/indexes in `convex/schema.ts` or a module schema fragment.
- App server: Add source refs and public/authenticated/system source calls in `src/modules/<domain>/<domain>.functions.ts`.
- Route/component: Import from `src/modules/<domain>/public.ts` or the route-specific server function.
- Tests: Add module tests under `src/modules/__tests__/` and Convex/source tests where present.

**New Convex-backed write:**
- Backend: Add mutation args with `sourceWrite`, verify with `convex/sourceWriteAdmission.ts`, and enforce domain auth in `convex/<domain>.ts`.
- App server: Sign admission through `src/lib/server/source-write-admission.ts` using the narrow scope from `src/modules/security/source-write-admission.ts`.
- Domain: Keep idempotency/correlation logic in `src/modules/<domain>/<domain>.functions.ts`.
- Tests: Cover admission failure, success, replay/conflict behavior, and auth denial.

**New owner/admin view:**
- Primary route: `src/routes/owner.<name>.tsx` or `src/routes/admin.<name>.tsx`
- Auth guard: Spread `operatorRouteOptions` from `src/lib/operator/route-options.ts`.
- Server auth: Use `requireOperatorSession` from `src/lib/server/require-operator-session.ts`.
- UI shell: Use `src/components/ae/layout/AeOperatorShell.tsx`.
- Domain readbacks: Add route-specific readback helpers in the owning module.

**New public UI component:**
- Primary code: Prefer existing Astryx primitives and place domain-specific composition under `src/components/ae/<feature>/`.
- Router links: Use `src/components/astryx/RouterLink.tsx` when adapting Astryx navigation to TanStack Router.
- Styles: Use `src/styles/globals.css` for global cascade only; do not add feature CSS files.
- Tests: Add focused component or route tests where the component owns behavior.

**New answer or harness behavior:**
- Answer synthesis: `src/modules/answer/` and `src/modules/answer/internal/`.
- Turn orchestration: `src/modules/answer-thread/internal/turn-orchestrator.ts`.
- Persistence/finalization: `src/modules/answer-thread/internal/answer-turn-finalization.ts`.
- Tool execution: `src/modules/answer-thread/internal/tool-runner.ts` and registered read-only actions in `src/modules/actions/index.ts`.
- Harness accounting: `src/modules/harness/run-loop.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/public.ts`.

**Utilities:**
- Shared HTTP helpers: `src/lib/http/`.
- Server-only shared helpers: `src/lib/server/`.
- Operator route helpers: `src/lib/operator/`.
- Domain-neutral result/id/hash utilities: `src/modules/common/`.
- UI-only helpers: `src/lib/ui/` or the relevant component directory.

**Documentation and codebase maps:**
- Architecture maps: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.
- Product/design source of truth: `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`.
- GSD state: `.planning/STATE.md`.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree.
- Generated: Yes.
- Committed: Yes.

**`convex/_generated/`:**
- Purpose: Generated Convex API/type files and Convex AI guidelines.
- Generated: Yes.
- Committed: Yes.

**`.output/`:**
- Purpose: Local build output.
- Generated: Yes.
- Committed: No.

**`src/app/`:**
- Purpose: Astryx sample/prototype pages that are not part of the active TanStack route tree unless explicitly imported.
- Generated: No.
- Committed: Yes.

**`src/future-phases/`:**
- Purpose: Parked implementation snapshots for planned route groups.
- Generated: No.
- Committed: Yes.

**`public/`:**
- Purpose: Static assets served by the app.
- Generated: No.
- Committed: Yes.

**`e2e/`:**
- Purpose: Playwright browser tests.
- Generated: No.
- Committed: Yes.

**`.planning/`:**
- Purpose: GSD state, milestones, plans, and generated codebase maps.
- Generated: Mixed.
- Committed: Yes.

**`.codex/skills/` and `.agents/skills/`:**
- Purpose: Project-local skill instructions used by implementation agents.
- Generated: No.
- Committed: Yes.

**`.env`, `.env.local`, `.env.example`:**
- Purpose: Environment configuration files are present at the repository root.
- Generated: No.
- Committed: `.env.example` may be committed; `.env` and `.env.local` should remain local secret-bearing configuration.

---

*Structure analysis: 2026-07-03*
