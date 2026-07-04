# Codebase Structure

**Analysis Date:** 2026-07-04

## Directory Layout

```text
agentic-economy/
├── src/                         # TanStack Start app, domain modules, UI, server adapters
│   ├── routes/                  # File-based routes, API routes, discovery routes
│   ├── modules/                 # Domain seams, actions, server functions, internal logic
│   ├── components/              # Astryx-backed UI, AE shells, chat/listing/inquiry components
│   ├── lib/                     # Cross-cutting server, HTTP, operator, observability, UI helpers
│   ├── hooks/                   # Shared React hooks
│   ├── styles/                  # Global CSS, legacy CSS bridge, token/base files
│   ├── app/                     # Prototype/demo pages not in the active TanStack route tree
│   ├── future-phases/           # Excluded phase stubs and future work
│   ├── routeTree.gen.ts         # Generated TanStack route tree
│   ├── router.tsx               # Router creation
│   └── start.ts                 # TanStack Start middleware entry
├── convex/                      # Convex schema, functions, authz, stores, generated API
├── tests/                       # Unit, integration, e2e, import, copy, SEO, UI contract tests
├── eval/answer/                 # Answer-evaluation harness and promptfoo config
├── examples/agent-experience/   # Agent experience audit example files
├── public/                      # Static assets and public images
├── .planning/                   # GSD planning, maps, audits, graph outputs, codebase docs
├── .codex/                      # Project Codex skills and workflows
├── .agents/                     # Project agent skills and local instructions
├── vendor/                      # Vendored reference packages
├── workflows/                   # Workflow documentation and support files
├── package.json                 # Scripts, dependencies, package manager declaration
├── vite.config.ts               # TanStack Start, Vite, Nitro, Tailwind, Sentry build config
├── tsconfig.json                # TypeScript compiler config and path aliases
├── DESIGN.md                    # Visual/UI authority
├── PRODUCT.md                   # Product thesis and trust contract
└── AGENTS.md                    # Always-on repository instructions
```

## Directory Purposes

**`src/routes`:**
- Purpose: Own URL shape for public pages, owner/admin/developer surfaces, API endpoints, and assistant-readable routes.
- Contains: TanStack file routes such as `src/routes/registry.tsx`, dynamic public routes such as `src/routes/$slug.tsx`, nested inquiry route `src/routes/$slug.inquiry.tsx`, API routes such as `src/routes/api.agent.tools.ts`, and escaped text/XML routes such as `src/routes/llms[.]txt.ts`.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`.

**`src/modules`:**
- Purpose: Own domain behavior, action contracts, route readbacks, server functions, schemas, DTOs, and private implementation details.
- Contains: Domain folders including `src/modules/registry`, `src/modules/catalog`, `src/modules/inquiries`, `src/modules/answer`, `src/modules/answer-thread`, `src/modules/discovery`, `src/modules/clearance`, `src/modules/security`, `src/modules/harness`, `src/modules/observability`, `src/modules/billing`, and `src/modules/protected-action`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/answer/public.ts`, `src/modules/discovery/public.ts`.

**`src/components`:**
- Purpose: Render application UI using Astryx as the primary component system and AE-specific behavioral/presentation wrappers where they already exist.
- Contains: `src/components/ae` for AE shells and domain UI, `src/components/ai-elements` for chat primitives, `src/components/astryx` for Astryx adapters/ejected components, and `src/components/ui` for legacy UI wrappers.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/astryx/RouterLink.tsx`.

**`src/lib`:**
- Purpose: House shared cross-cutting helpers that are not owned by one domain module.
- Contains: Server helpers in `src/lib/server`, HTTP/security helpers in `src/lib/http`, observability setup in `src/lib/observability`, operator route helpers in `src/lib/operator`, and shared UI utilities in `src/lib/ui`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/operator/route-options.ts`, `src/lib/observability/config.ts`.

**`src/hooks`:**
- Purpose: Provide small reusable React hooks.
- Contains: Hook files such as `src/hooks/use-mobile.ts`.
- Key files: `src/hooks/use-mobile.ts`.

**`src/styles`:**
- Purpose: Define global style ordering, Tailwind/Astryx integration, and the shrinking legacy style bridge.
- Contains: `src/styles/globals.css`, `src/styles/legacy.css`, `src/styles/tokens.css`, and `src/styles/base.css`.
- Key files: `src/styles/globals.css`, `src/styles/legacy.css`.

**`src/app`:**
- Purpose: Store prototype or demo pages that are not part of the active TanStack route tree.
- Contains: Client-style demo pages such as `src/app/ai-chat/page.tsx`, `src/app/library/page.tsx`, and `src/app/ai-chat-landing/page.tsx`.
- Key files: `src/app/ai-chat/page.tsx`, `src/app/library/page.tsx`, `src/app/ai-chat-landing/page.tsx`.

**`src/future-phases`:**
- Purpose: Hold excluded future-phase stubs and non-active implementation sketches.
- Contains: Files excluded by `tsconfig.json`.
- Key files: `src/future-phases`.

**`convex`:**
- Purpose: Define durable backend schema, Convex functions, authz, stores, projections, and generated Convex API.
- Contains: Function files such as `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/discovery.ts`, store files such as `convex/businessActionStore.ts`, schema composition in `convex/schema.ts`, and generated files in `convex/_generated`.
- Key files: `convex/schema.ts`, `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/sourceWriteAdmission.ts`, `convex/authz.ts`, `convex/_generated/ai/guidelines.md`.

**`tests`:**
- Purpose: Enforce behavior, copy boundaries, route boundaries, import seams, API contracts, E2E flows, and UI contracts.
- Contains: `tests/unit`, `tests/integration`, `tests/e2e`, `tests/imports`, `tests/copy`, `tests/seo`, `tests/ui-contract`, `tests/eval`, and helper fixtures.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/private-imports.test.ts`, `tests/imports/source-mining.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/unit/actions/agent-tools-surface.test.ts`, `tests/integration/agent-tools-api.test.ts`.

**`eval/answer`:**
- Purpose: Configure answer-quality evaluation and promptfoo-style checks.
- Contains: Answer eval configuration and fixtures.
- Key files: `eval/answer`.

**`public`:**
- Purpose: Serve static assets directly.
- Contains: Public images and illustration assets.
- Key files: `public/images/illustration`.

**`.planning`:**
- Purpose: Store GSD planning artifacts, codebase maps, graph outputs, audits, and generated context.
- Contains: `.planning/codebase` for mapper output and other planning subdirectories.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.codex` and `.agents`:**
- Purpose: Store project-specific agent skills, workflows, and instruction packs.
- Contains: Skill directories with `SKILL.md` files and supporting workflow files.
- Key files: `.codex/skills/gsd-map-codebase/SKILL.md`, `.codex/gsd-core/workflows/map-codebase.md`, `.agents/skills/convex/SKILL.md`, `.agents/skills/submit-qualified-inquiry/SKILL.md`.

**`vendor`:**
- Purpose: Store vendored reference packages.
- Contains: `vendor/handshake-protocol-kernel`.
- Key files: `vendor/handshake-protocol-kernel`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start middleware, observability, security headers, CSRF, source-write admission, and Clerk setup.
- `src/router.tsx`: TanStack router creation from `src/routeTree.gen.ts`.
- `src/routes/__root.tsx`: Root document shell, Astryx providers, conditional Clerk provider, global CSS, and outlet.
- `vite.config.ts`: TanStack Start, Vite, Nitro/Vercel, Tailwind, React, and optional Sentry plugin configuration.
- `convex/schema.ts`: Convex schema composition for durable backend tables.

**Public Routes:**
- `src/routes/index.tsx`: Home route.
- `src/routes/registry.tsx`: Public registry route.
- `src/routes/$slug.tsx`: Public business listing route.
- `src/routes/$slug.inquiry.tsx`: Public qualified inquiry route.
- `src/routes/$slug.ucp.ts`: Public catalog discovery manifest route.
- `src/routes/llms[.]txt.ts`: Canonical assistant-readable plain-text index route.

**API Routes:**
- `src/routes/api.businesses.ts`: Public catalog list JSON route.
- `src/routes/api.businesses.search.ts`: Public catalog search JSON route.
- `src/routes/api.businesses.$slug.ts`: Public business detail JSON route.
- `src/routes/api.agent.tools.ts`: Quiet assistant tool list and invocation route.
- `src/routes/api.answer.turn.ts`: Grounded answer turn SSE route.
- `src/routes/api.discovery.schema.ts`: Developer discovery schema route.

**Action Contracts:**
- `src/modules/common/action.ts`: Shared action type model and `defineAction`.
- `src/modules/actions/index.ts`: Explicit action registry and agent-tool filtering.
- `src/modules/registry/registry.actions.ts`: `registry.list`, `registry.search`, and `registry.detail`.
- `src/modules/inquiries/inquiry.actions.ts`: `inquiry.submit`.
- `src/modules/storefront/storefront.actions.ts`: `storefront.importDraft`.

**Core Logic:**
- `src/modules/registry/public.ts`: Public registry seam.
- `src/modules/registry/registry.functions.ts`: Registry server/source adapter.
- `src/modules/registry/internal/search.ts`: Pure registry list/search/detail implementation.
- `src/modules/catalog/owner-claim.functions.ts`: Owner claim and catalog publish source adapter.
- `src/modules/inquiries/public.ts`: Public inquiry seam.
- `src/modules/inquiries/inquiry.functions.ts`: Public inquiry server/source adapter.
- `src/modules/inquiries/route-readbacks.ts`: Inquiry route readback builders.
- `src/modules/answer/public.ts`: Public answer seam.
- `src/modules/answer-thread/public.ts`: Public answer-thread seam.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Streaming answer turn orchestrator.
- `src/modules/answer-thread/internal/tool-runner.ts`: Answer tool execution and evidence collection.
- `src/modules/answer/internal/answer-tool-use-agent.ts`: Model tool-use loop.
- `src/modules/answer/internal/answer-gate.ts`: Grounding and boundary gate.
- `src/modules/discovery/public.ts`: Discovery artifacts and manifest builders.
- `src/modules/discovery/discovery.functions.ts`: Discovery source adapter.
- `src/modules/security/source-write-admission.ts`: Source-write admission signing and validation.
- `src/modules/clearance/clearance.functions.ts`: Agent identity and assistant write-admission source adapter.
- `src/modules/harness/public.ts`: Harness tool contract seam.

**Convex Backend:**
- `convex/schema.ts`: Schema table composition.
- `convex/registry.ts`: Public registry source queries.
- `convex/business.ts`: Business claim source mutations.
- `convex/catalog.ts`: Catalog publish/read source functions.
- `convex/inquiries.ts`: Public inquiry and owner inbox functions.
- `convex/discovery.ts`: Discovery artifact queries.
- `convex/sourceWriteAdmission.ts`: Convex-side write admission verification.
- `convex/authz.ts`: Convex actor/admin authorization helpers.
- `convex/_generated/ai/guidelines.md`: Required Convex coding guidelines before Convex edits.

**UI and Styles:**
- `src/components/ae/layout/AePublicShell.tsx`: Public route shell.
- `src/components/ae/layout/AeOperatorShell.tsx`: Owner/admin/developer shell.
- `src/components/ae/listing/AeProviderListingPage.tsx`: Public business listing UI.
- `src/components/ae/inquiries`: Inquiry UI components.
- `src/components/astryx/RouterLink.tsx`: Astryx link adapter.
- `src/styles/globals.css`: Global style import order and Tailwind/Astryx integration.
- `src/styles/legacy.css`: Retiring legacy style bridge.

**Configuration:**
- `package.json`: Scripts, dependencies, and package manager.
- `package-lock.json`: npm lockfile.
- `tsconfig.json`: Strict TypeScript config and aliases `@/*` and `~/*` to `src/*`.
- `vite.config.ts`: Build and dev configuration.
- `eslint.config.js`: ESLint configuration.
- `components.json`: Component tooling configuration.
- `DESIGN.md`: Visual/UI system authority.
- `PRODUCT.md`: Product thesis and trust contract.
- `AGENTS.md`: Always-on repository instructions.

**Testing:**
- `tests/imports/route-boundary.test.ts`: Route adapter and source boundary rules.
- `tests/imports/private-imports.test.ts`: Public seam import rules.
- `tests/imports/source-mining.test.ts`: Source-mining and forbidden import rules.
- `tests/copy/phase1-banned-copy.test.ts`: Public copy and overclaim guardrails.
- `tests/unit/actions/agent-tools-surface.test.ts`: Assistant action exposure rules.
- `tests/integration/agent-tools-api.test.ts`: Quiet agent tools API behavior.
- `tests/e2e`: Browser-level flows.

## Naming Conventions

**Files:**
- TanStack routes use file-route names in `src/routes`, including dotted API files such as `src/routes/api.businesses.search.ts`, dynamic segments such as `src/routes/$slug.tsx`, nested route segments such as `src/routes/$slug.inquiry.tsx`, and escaped literal names such as `src/routes/llms[.]txt.ts`.
- Domain public seams are named `public.ts`, as in `src/modules/registry/public.ts` and `src/modules/inquiries/public.ts`.
- Domain route/server adapters use `*.functions.ts`, as in `src/modules/registry/registry.functions.ts` and `src/modules/inquiries/inquiry.functions.ts`.
- Domain operation contracts use `*.actions.ts`, as in `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts`.
- Domain internals live under `internal`, as in `src/modules/registry/internal/search.ts` and `src/modules/answer/internal/answer-gate.ts`.
- Module-owned schema fragments use `schema.ts` or `internal/*schema*.ts`, then compose into `convex/schema.ts`.
- Convex function files are domain-named, as in `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, and `convex/discovery.ts`.
- Tests use `*.test.ts` for Vitest files and `*.spec.ts` for Playwright E2E files, as in `tests/unit/actions/agent-tools-surface.test.ts` and `tests/e2e`.

**Directories:**
- Put route files only under `src/routes`.
- Put domain-owned code under `src/modules/<domain>`.
- Put private domain helpers under `src/modules/<domain>/internal`.
- Put public route chrome and route-facing components under `src/components/ae/<area>`.
- Put Astryx adapters under `src/components/astryx`.
- Put cross-cutting server helpers under `src/lib/server`.
- Put Convex source-of-truth functions under `convex`.
- Put generated Convex files under `convex/_generated` and generated route tree in `src/routeTree.gen.ts`.

**Components:**
- Use PascalCase React component names, as in `AePublicShell`, `AeOperatorShell`, `AeProviderListingPage`, and `RouterLink`.
- Keep existing `Ae*` components for current behavioral and route-specific UI; do not add new bespoke presentation systems when Astryx primitives cover the use case.
- Use Astryx component names and adapters for new UI composition before reaching for legacy wrappers.

**Functions:**
- Use camelCase for functions and route helpers, as in `readPublicRegistrySearchPage`, `submitPublicInquiryThroughSource`, `streamAnswerTurn`, and `runAnswerToolCall`.
- Use `read*` for read-only query helpers, `submit*` for form/write flows, `resolve*` for target/authorization lookup, and `build*` for DTO/readback/artifact construction.
- Use Convex export names that describe domain action and visibility, such as `listPublicBusinessCatalog`, `searchPublicBusinessCatalog`, and `submitPublicInquiry`.

**Types:**
- Use PascalCase for exported TypeScript types and schemas, as in `ActionContext`, `PublicBusinessCatalogPage`, `RegistryRouteReadback`, and `PublicInquirySubmitInput`.
- Keep Zod schemas beside the action/function that validates them or in the owning domain seam.

## Where to Add New Code

**New Public Page:**
- Primary code: `src/routes/<route>.tsx`
- Domain logic: `src/modules/<domain>/public.ts` or `src/modules/<domain>/<domain>.functions.ts`
- UI: Astryx composition in the route or reusable components under `src/components/ae/<area>`
- Tests: `tests/integration`, `tests/e2e`, or `tests/ui-contract` depending on behavior.

**New Owner/Admin/Developer Page:**
- Primary code: `src/routes/owner*.tsx`, `src/routes/admin*.tsx`, or `src/routes/developers*.tsx`
- Auth guard: `src/lib/operator/route-options.ts`
- Shell: `src/components/ae/layout/AeOperatorShell.tsx`
- Domain logic: `src/modules/<domain>`
- Tests: `tests/integration` and `tests/e2e`.

**New API Endpoint:**
- Primary code: `src/routes/api.<namespace>.<name>.ts`
- Shared operation: `src/modules/<domain>/<domain>.actions.ts` when the endpoint represents an AE operation.
- Registry: `src/modules/actions/index.ts` when the operation must fan out to other surfaces.
- Tests: `tests/integration` and action tests under `tests/unit/actions` when action exposure changes.

**New Domain Module:**
- Implementation: `src/modules/<domain>/public.ts`, `src/modules/<domain>/internal`, and optional `src/modules/<domain>/<domain>.functions.ts`
- Actions: `src/modules/<domain>/<domain>.actions.ts`
- Convex schema: `src/modules/<domain>/internal/schema.ts` or a module-owned schema fragment imported by `convex/schema.ts`
- Convex functions: `convex/<domain>.ts`
- Tests: `tests/unit/<domain>` plus import-boundary coverage if new seams are introduced.

**New Assistant-Callable Operation:**
- Primary code: `src/modules/<domain>/<domain>.actions.ts`
- Registry: `src/modules/actions/index.ts`
- Harness/tool surface: `src/modules/harness/public.ts` and `src/routes/api.agent.tools.ts` should consume it through the existing registry, not a bespoke path.
- Tests: `tests/unit/actions/agent-tools-surface.test.ts`, `tests/integration/agent-tools-api.test.ts`, and copy/boundary tests when public wording changes.
- Boundary rule: Only expose writes when the action has explicit admission and honest boundaries; `inquiry.submit` is the current assistant-exposed write.

**New Convex Query/Mutation/Action:**
- Primary code: `convex/<domain>.ts`
- Schema: `convex/schema.ts` and any owning module schema under `src/modules/<domain>/internal`
- Client adapter: `src/modules/<domain>/<domain>.functions.ts` through `src/lib/server/convex-source.ts`
- Required reading: `convex/_generated/ai/guidelines.md`
- Tests: Unit/integration coverage for validators, source-write admission, and route/action behavior.

**New Qualified Inquiry Behavior:**
- Primary code: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/public.ts`, and `convex/inquiries.ts`
- Route readbacks: `src/modules/inquiries/route-readbacks.ts`
- Action boundaries: `src/modules/inquiries/inquiry.actions.ts`
- Public route: `src/routes/$slug.inquiry.tsx`
- Constraint: Keep it a qualified first-contact message for owner review; do not add booking, payment, dispatch, or autonomous fulfillment semantics.

**New Registry/Search Behavior:**
- Primary code: `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, and `src/modules/registry/internal/search.ts`
- Convex query: `convex/registry.ts`
- Public JSON routes: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Tests: Registry unit tests, API integration tests, and action-surface tests when tool behavior changes.

**New Answer Tool or Read Path:**
- Primary code: `src/modules/<domain>/<domain>.actions.ts` with `readOnly: true`
- Registry: `src/modules/actions/index.ts`
- Tool execution: `src/modules/answer-thread/internal/tool-runner.ts`
- Model loop: `src/modules/answer/internal/answer-tool-use-agent.ts`
- Gate: `src/modules/answer/internal/answer-gate.ts`
- Constraint: Do not let answer tools write or perform unsupported commerce operations.

**New Discovery Artifact:**
- Primary code: `src/modules/discovery/public.ts` and `src/modules/discovery/discovery.functions.ts`
- Route: `src/routes/<artifact-route>.ts`
- Convex read: `convex/discovery.ts`
- Tests: `tests/seo`, `tests/integration`, and copy tests when public terms change.

**New UI Component/Module:**
- Implementation: Prefer Astryx primitives in route files or add adapters under `src/components/astryx` when needed.
- Existing AE UI: Use `src/components/ae/<area>` for route-specific wrappers tied to AE behavior.
- Styles: Use `src/styles/globals.css` and Tailwind utilities for layout glue only.
- Avoid: New `src/components/ui` wrappers, new handwritten CSS files, new fontsource fonts, and new bespoke presentation-only `Ae*` systems.

**Utilities:**
- Shared server helpers: `src/lib/server`
- Shared HTTP/security helpers: `src/lib/http`
- Shared operator helpers: `src/lib/operator`
- Shared domain primitives: `src/modules/common`
- Shared UI helpers: `src/lib/ui`

**Tests:**
- Unit tests: `tests/unit/<domain>`
- Integration tests: `tests/integration`
- E2E tests: `tests/e2e`
- Import-boundary tests: `tests/imports`
- Copy/boundary tests: `tests/copy`
- UI contract tests: `tests/ui-contract`

## Special Directories

**`convex/_generated`:**
- Purpose: Generated Convex API files and Convex AI guidelines.
- Generated: Yes, except `convex/_generated/ai/guidelines.md` is a required instruction file.
- Committed: Yes.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree imported by `src/router.tsx`.
- Generated: Yes.
- Committed: Yes.

**`src/future-phases`:**
- Purpose: Future-phase stubs excluded from active TypeScript compilation.
- Generated: No.
- Committed: Yes.

**`src/app`:**
- Purpose: Prototype/demo client pages that are not present in `src/routeTree.gen.ts`.
- Generated: No.
- Committed: Yes.

**`src/styles/legacy.css`, `src/styles/tokens.css`, `src/styles/base.css`:**
- Purpose: Retiring legacy style bridge imported by `src/styles/globals.css`.
- Generated: No.
- Committed: Yes.

**`src/components/ui`:**
- Purpose: Legacy UI wrappers.
- Generated: No.
- Committed: Yes.

**`public/images/illustration`:**
- Purpose: Static committed illustration assets for public UI.
- Generated: No.
- Committed: Yes.

**`.planning/codebase`:**
- Purpose: GSD codebase mapper output consumed by planning and execution commands.
- Generated: Yes.
- Committed: Project-dependent.

**`.codex` and `.agents`:**
- Purpose: Project-specific skills, workflows, and agent instructions.
- Generated: No.
- Committed: Yes.

**`vendor/handshake-protocol-kernel`:**
- Purpose: Vendored reference package; runtime imports are constrained by source-mining tests.
- Generated: No.
- Committed: Yes.

**`.output`, `.vercel/output`, `output`, `playwright-report`, `test-results`, `graphify-out`, `.tmp`:**
- Purpose: Build, deployment, test, graph, and temporary outputs.
- Generated: Yes.
- Committed: No source code should be added here.

---

*Structure analysis: 2026-07-04*
