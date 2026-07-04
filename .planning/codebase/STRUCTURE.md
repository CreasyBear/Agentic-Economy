# Codebase Structure

**Analysis Date:** 2026-07-04

## Directory Layout

```text
agentic-economy/
├── src/                         # TanStack Start app, routes, components, modules, styles
│   ├── routes/                  # File-based pages and API endpoints
│   ├── modules/                 # Domain modules, actions, server functions, readbacks
│   ├── components/              # UI components and Astryx adapter
│   ├── lib/                     # Server, HTTP, observability, operator, UI helpers
│   ├── hooks/                   # Shared React hooks
│   ├── styles/                  # Global CSS cascade and legacy CSS
│   ├── app/                     # App-style page experiments/library/chat pages
│   ├── future-phases/           # Parked future route code excluded from TypeScript
│   ├── router.tsx               # TanStack Router factory
│   ├── start.ts                 # TanStack Start middleware
│   └── routeTree.gen.ts         # Generated TanStack route tree
├── convex/                      # Convex schema, functions, auth, crons, runtime adapters
├── tests/                       # Vitest, integration, E2E, copy, import, SEO, UI contract tests
├── eval/answer/                 # Answer eval suites, promptfoo config, scoring scripts
├── public/                      # Static assets and public images
├── .agents/skills/              # Repo-local agent/UI/Convex/business skills
├── .codex/skills/               # Repo-local GSD, Convex, Clerk, TanStack, security skills
├── .planning/                   # GSD project planning artifacts and codebase maps
├── .ui-craft/                   # UI design memory, reports, reviews, surface notes
├── tools/                       # Local utility scripts
├── workflows/                   # Workflow documentation
├── examples/                    # Example agent-experience harness
├── vendor/                      # Vendored/provenance-tracked external materials
├── package.json                 # Scripts and dependencies
├── vite.config.ts               # Vite/TanStack Start/Nitro/Tailwind/Sentry config
├── vitest.config.ts             # Vitest config
├── playwright.config.ts         # Playwright config
├── tsconfig.json                # TypeScript config and path aliases
├── DESIGN.md                    # Visual authority and Astryx-era rules
├── PRODUCT.md                   # Product thesis and trust contract
└── AGENTS.md                    # Always-on repo instructions and AE boundaries
```

## Directory Purposes

**`src/routes/`:**
- Purpose: Own browser routes, API routes, loaders, search param validation, server handlers, and route-local UI composition.
- Contains: Public routes such as `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, owner/admin routes such as `src/routes/owner.inquiries.tsx`, and API routes such as `src/routes/api.agent.tools.ts`.
- Key files: `src/routes/__root.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.search.ts`, `src/routes/llms[.]txt.ts`

**`src/modules/`:**
- Purpose: Own domain logic, contracts, readbacks, action definitions, server functions, and module-owned schema fragments.
- Contains: Feature folders such as `src/modules/registry/`, `src/modules/inquiries/`, `src/modules/catalog/`, `src/modules/answer-thread/`, `src/modules/harness/`, `src/modules/security/`, and `src/modules/billing/`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`

**`src/modules/*/internal/`:**
- Purpose: Keep implementation details behind module `public.ts` seams.
- Contains: Pure commands, validators, projections, schema definitions, adapters, and policy helpers.
- Key files: `src/modules/inquiries/internal/commands.ts`, `src/modules/catalog/internal/catalog-model.ts`, `src/modules/registry/internal/search.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`

**`src/components/`:**
- Purpose: Render reusable UI pieces for route surfaces.
- Contains: `src/components/astryx/` for framework adapters, `src/components/ae/` for AE-specific components, `src/components/ai-elements/` for chat primitives, and `src/components/ui/` legacy wrappers.
- Key files: `src/components/astryx/RouterLink.tsx`, `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/chat/AeChat.tsx`

**`src/lib/`:**
- Purpose: Provide non-domain infrastructure helpers shared by routes and modules.
- Contains: Server clients/auth helpers in `src/lib/server/`, HTTP helpers in `src/lib/http/`, observability helpers in `src/lib/observability/`, operator navigation helpers in `src/lib/operator/`, and UI mapping utilities in `src/lib/ui/`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/http/security-headers.ts`, `src/lib/operator/navigation.ts`

**`src/styles/`:**
- Purpose: Own the global CSS cascade and transitional legacy styling.
- Contains: `src/styles/globals.css`, `src/styles/base.css`, `src/styles/tokens.css`, `src/styles/legacy.css`, and answer-specific CSS under `src/styles/answer/`.
- Key files: `src/styles/globals.css`, `src/styles/legacy.css`

**`convex/`:**
- Purpose: Own Convex runtime functions, composed schema, auth config, crons, and persistence adapters.
- Contains: `convex/schema.ts`, domain function files such as `convex/registry.ts` and `convex/inquiries.ts`, auth helpers in `convex/authz.ts`, and source-state adapters in `convex/source_state.ts`.
- Key files: `convex/schema.ts`, `convex/auth.config.ts`, `convex/sourceWriteAdmission.ts`, `convex/crons.ts`

**`tests/`:**
- Purpose: Validate unit, integration, E2E, import-boundary, copy, SEO, UI contract, Convex runtime, and deployment smoke behavior.
- Contains: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/copy/`, `tests/imports/`, `tests/seo/`, `tests/ui-contract/`, `tests/helpers/`, and fixtures.
- Key files: `tests/integration/agent-tools-api.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/imports/route-boundary.test.ts`

**`eval/answer/`:**
- Purpose: Evaluate answer quality, coverage, promptfoo behavior, scoring, and live API studies.
- Contains: `eval/answer/scripts/`, `eval/answer/lib/`, `eval/answer/assertions/`, and `eval/answer/promptfooconfig.yaml`.
- Key files: `eval/answer/scripts/run-suite.ts`, `eval/answer/lib/scoring.ts`, `eval/answer/promptfooconfig.yaml`

**`public/`:**
- Purpose: Serve static images and favicon assets.
- Contains: `public/favicon.svg`, `public/images/illustration/*`, and landing assets under `public/ae-landing/`.
- Key files: `public/images/illustration/hero-victorian-house.png`, `public/images/illustration/no-results.png`

**`.agents/skills/` and `.codex/skills/`:**
- Purpose: Store repo-local skill instructions that affect architecture, Convex, UI, GSD, and agent operations.
- Contains: AE-specific `submit-qualified-inquiry`, UI Craft, Convex, GSD, Clerk, TanStack, and security skills.
- Key files: `.agents/skills/submit-qualified-inquiry/SKILL.md`, `.agents/skills/ui-craft/SKILL.md`, `.agents/skills/convex/SKILL.md`, `.codex/skills/gsd-map-codebase/SKILL.md`

**`.planning/`:**
- Purpose: Store GSD state, plans, and generated codebase maps.
- Contains: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, and other planning artifacts.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`

**`.ui-craft/`:**
- Purpose: Store UI design memory, reports, reviews, and surface notes used by UI Craft workflows.
- Contains: `.ui-craft/surfaces/`, `.ui-craft/reports/`, `.ui-craft/reviews/`.
- Key files: `.ui-craft/surfaces/*` when a UI task targets a named surface.

## Key File Locations

**Entry Points:**
- `src/routes/__root.tsx`: Root document, providers, CSS link, Clerk provider gating, observability, error boundary.
- `src/router.tsx`: TanStack Router factory and default not-found component.
- `src/start.ts`: TanStack Start request middleware stack.
- `src/routeTree.gen.ts`: Generated route manifest imported by `src/router.tsx`.
- `convex/schema.ts`: Convex schema composer for all module-owned tables.
- `convex/auth.config.ts`: Clerk JWT provider config for Convex auth.

**Configuration:**
- `package.json`: NPM scripts, runtime dependencies, and package manager declaration.
- `vite.config.ts`: TanStack Start, Nitro Vercel Node runtime, Tailwind 4, React, Sentry plugin, and SSR bundling rules.
- `tsconfig.json`: Strict TypeScript config, `@/*` and `~/*` aliases, and Convex/test includes.
- `vitest.config.ts`: Vitest test environment and test file include pattern.
- `playwright.config.ts`: Playwright E2E configuration.
- `playwright.deploy-smoke.config.ts`: Deployment smoke Playwright configuration.
- `.env.example`: Documented environment variable names only.

**Core Logic:**
- `src/modules/common/action.ts`: Action contract type, agent descriptor conversion, action surfaces.
- `src/modules/actions/index.ts`: Explicit registry of action-backed operations.
- `src/modules/registry/registry.actions.ts`: Public catalog read actions.
- `src/modules/inquiries/inquiry.actions.ts`: Qualified inquiry action.
- `src/modules/registry/registry.functions.ts`: Public registry source bridge and search backend selection.
- `src/modules/inquiries/inquiry.functions.ts`: Public and owner inquiry source bridge.
- `src/modules/catalog/public.ts`: Public catalog facade.
- `src/modules/business/public.ts`: Business and claim facade.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Streaming answer-turn orchestration.
- `src/modules/answer/internal/answer-tool-use-agent.ts`: OpenRouter tool-use agent.
- `src/modules/harness/action-tool.ts`: Harness tool execution and policy enforcement.
- `src/lib/server/convex-source.ts`: Convex HTTP client and source function references.
- `src/lib/server/source-write-admission.ts`: Server-side source-write signing.
- `convex/sourceWriteAdmission.ts`: Convex-side source-write verification.
- `convex/source_state.ts`: Convex source-state load/persist adapter.

**Public Surfaces:**
- `src/routes/index.tsx`: Home ask/search entry and chat promotion.
- `src/routes/registry.tsx`: Registry browsing page.
- `src/routes/$slug.tsx`: Public business listing route.
- `src/routes/$slug.inquiry.tsx`: Public qualified inquiry route.
- `src/routes/about.tsx`, `src/routes/help.tsx`, `src/routes/privacy.tsx`, `src/routes/terms.tsx`: Static/product support pages.

**Owner/Admin Surfaces:**
- `src/routes/owner.status.tsx`: Owner status route.
- `src/routes/owner.inquiries.tsx`: Owner inquiry inbox.
- `src/routes/owner.inquiries.$threadId.tsx`: Owner inquiry detail/reply route.
- `src/routes/admin.inquiries.tsx`: Admin inquiry reconstruction.
- `src/routes/admin.claims.tsx`: Admin claim readback.
- `src/routes/admin.index-health.tsx`: Admin index health readback.
- `src/routes/admin.business-actions.tsx`, `src/routes/admin.protected-actions.tsx`, `src/routes/admin.monetization.tsx`: Admin operational surfaces.

**API and Machine Surfaces:**
- `src/routes/api.businesses.ts`: Public business catalog list JSON.
- `src/routes/api.businesses.search.ts`: Public business catalog search JSON.
- `src/routes/api.businesses.$slug.ts`: Public business catalog detail JSON.
- `src/routes/api.agent.tools.ts`: Quiet assistant tools list/invoke endpoint.
- `src/routes/api.answer.turn.ts`: Answer-turn SSE endpoint.
- `src/routes/api.answer.threads.ts`: Answer thread list endpoint.
- `src/routes/api.chat.ts`: Chat API endpoint.
- `src/routes/api.discovery.schema.ts`: Discovery schema endpoint.
- `src/routes/llms[.]txt.ts`: Canonical assistant index.
- `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`: Search/discovery endpoints.

**Convex Runtime:**
- `convex/registry.ts`: Public catalog list/search/detail Convex queries.
- `convex/inquiries.ts`: Public inquiry, owner inbox/thread, admin reconstruction Convex functions.
- `convex/catalog.ts`: Catalog publish/read Convex functions.
- `convex/business.ts`: Business claim and suppression Convex functions.
- `convex/answerThreads.ts`: Answer thread and turn persistence.
- `convex/harnessSessions.ts`: Harness session persistence and answer turn finalization.
- `convex/notificationOutbox.ts`: Notification dispatch and webhook persistence.
- `convex/security.ts`: Admin membership, disputes, cleanup, and security readbacks.
- `convex/billing.ts`, `convex/businessActions.ts`, `convex/protectedActions.ts`: Future/adjacent operational flows.

**Testing:**
- `tests/unit/`: Unit tests by domain and surface.
- `tests/integration/`: Route/API integration tests.
- `tests/e2e/`: Playwright user-flow tests.
- `tests/e2e/a11y/`: Accessibility E2E tests.
- `tests/copy/`: Public copy and boundary-contract tests.
- `tests/imports/`: Import-boundary and TypeScript standards tests.
- `tests/ui-contract/`: UI contract scans.
- `tests/seo/`: SEO and discovery tests.
- `tests/helpers/`: Test helper ports and contract servers.

## Naming Conventions

**Files:**
- `*.actions.ts`: Action contracts registered in `src/modules/actions/index.ts`; examples include `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts`.
- `*.functions.ts`: TanStack server functions and source bridges; examples include `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`, and `src/modules/harness/run-viewer.functions.ts`.
- `public.ts`: Module facade for routes, tests, and Convex adapters; examples include `src/modules/registry/public.ts` and `src/modules/security/public.ts`.
- `internal/*.ts`: Module-private implementation; examples include `src/modules/inquiries/internal/commands.ts` and `src/modules/registry/internal/search.ts`.
- `internal/schema.ts` or `internal/convex-schema.ts`: Module-owned Convex table definitions; examples include `src/modules/business/internal/schema.ts` and `src/modules/answer-thread/internal/convex-schema.ts`.
- `route-readbacks.ts`: Route-specific readback shaping; example `src/modules/inquiries/route-readbacks.ts`.
- `owner-*.tsx` or `admin-*.tsx` in modules: Surface-specific panels/readbacks; example `src/modules/billing/owner-billing.panels.tsx`.
- `src/routes/api.*.ts`: API route files; example `src/routes/api.agent.tools.ts`.
- `src/routes/$param*.tsx`: Dynamic browser route files; examples `src/routes/$slug.tsx` and `src/routes/$slug.inquiry.tsx`.
- `src/routes/name[.]ext.ts`: Literal dotted routes; examples `src/routes/llms[.]txt.ts` and `src/routes/sitemap[.]xml.ts`.

**Directories:**
- Domain folders use lowercase or kebab-case under `src/modules/`, for example `src/modules/answer-thread/`, `src/modules/business-action/`, and `src/modules/notification-outbox/`.
- Component folders use purpose names under `src/components/ae/`, for example `src/components/ae/layout/`, `src/components/ae/chat/`, `src/components/ae/inquiries/`, and `src/components/ae/operator/`.
- Tests mirror behavior category first, then domain, for example `tests/unit/registry/`, `tests/integration/`, `tests/copy/`, and `tests/e2e/`.

## Where to Add New Code

**New Public Page:**
- Primary code: `src/routes/<route>.tsx`
- Shared UI: `src/components/ae/<surface>/` only when existing Astryx composition is insufficient; prefer direct Astryx primitives first per `DESIGN.md`.
- Server reads/writes: existing or new `src/modules/<module>/<module>.functions.ts`
- Tests: `tests/integration/<route>.test.ts`, `tests/ui-contract/`, and `tests/copy/` when public language changes.

**New Owner/Admin Page:**
- Primary code: `src/routes/owner.<name>.tsx` or `src/routes/admin.<name>.tsx`
- Shell: `src/components/ae/layout/AeOperatorShell.tsx`
- Route auth/options: `src/lib/operator/route-options.ts`
- Readbacks/server calls: `src/modules/<module>/<module>.functions.ts` or `src/modules/<module>/public.ts`
- Tests: `tests/integration/admin-runtime.test.ts`, `tests/unit/<module>/`, and `tests/e2e/` when workflow-critical.

**New API Route:**
- Primary code: `src/routes/api.<name>.ts`
- Response helpers: reuse `jsonResponse` from `src/routes/api.businesses.ts` or a module-specific helper.
- Core logic: `src/modules/<module>/public.ts`, `src/modules/<module>/<module>.functions.ts`, or `src/modules/<module>/<module>.actions.ts`
- Tests: `tests/integration/<name>-route.test.ts` or `tests/unit/http/`.

**New Assistant-Callable Operation:**
- Action contract: `src/modules/<module>/<module>.actions.ts`
- Registry import: `src/modules/actions/index.ts`
- Shared runner: Use the module source bridge in `src/modules/<module>/<module>.functions.ts`
- Agent exposure: Add `agentTools` only when the operation is safe for the quiet agent door; use explicit `boundaries`.
- Tests: `tests/unit/actions/`, `tests/integration/agent-tools-api.test.ts`, and copy/boundary tests when public language changes.

**New Domain Module:**
- Public facade: `src/modules/<module>/public.ts`
- Implementation: `src/modules/<module>/internal/`
- Server bridge: `src/modules/<module>/<module>.functions.ts`
- Actions: `src/modules/<module>/<module>.actions.ts` only when an operation should fan out to action-backed surfaces.
- Convex schema: `src/modules/<module>/internal/schema.ts` or `src/modules/<module>/internal/convex-schema.ts`
- Convex functions: `convex/<module>.ts`
- Schema registration: import table map in `convex/schema.ts`
- Tests: `tests/unit/<module>/`, `tests/unit/convex/`, and `tests/integration/` for route/API behavior.

**New Convex Code:**
- Read first: `convex/_generated/ai/guidelines.md`
- Schema fragment: `src/modules/<module>/internal/schema.ts` or `src/modules/<module>/internal/convex-schema.ts`
- Backend functions: `convex/<module>.ts`
- Auth/authority helpers: `convex/authz.ts` or module-specific helper if isolated.
- Source bridge: `src/lib/server/convex-source.ts` for generic client/reference helpers; module-specific references in `src/modules/<module>/<module>.functions.ts`.
- Tests: `tests/unit/convex/<module>-runtime.test.ts` and `tests/unit/schema/convex-schema.test.ts`.

**New Public Catalog/Registry Logic:**
- Catalog DTO/model logic: `src/modules/catalog/internal/catalog-model.ts`
- Search/read logic: `src/modules/registry/internal/search.ts`
- Public registry bridge: `src/modules/registry/registry.functions.ts`
- Public APIs: `src/routes/api.businesses*.ts`
- UI: `src/routes/registry.tsx` or `src/components/ae/listing/`
- Tests: `tests/unit/catalog/`, `tests/unit/registry/`, `tests/integration/registry-api.test.ts`, and `tests/seo/public-business-seo.test.ts`.

**New Inquiry Flow Logic:**
- Pure command logic: `src/modules/inquiries/internal/commands.ts`
- Server bridge: `src/modules/inquiries/inquiry.functions.ts`
- Public action: `src/modules/inquiries/inquiry.actions.ts` only for assistant-facing qualified inquiry behavior.
- UI readbacks: `src/modules/inquiries/route-readbacks.ts`
- UI components: `src/components/ae/inquiries/`
- Convex runtime: `convex/inquiries.ts`
- Tests: `tests/unit/inquiries/`, `tests/integration/agent-tools-api.test.ts`, `tests/e2e/chat-discovery-inquiry-loop.spec.ts`.

**New Answer/Agent Logic:**
- Tool-use loop: `src/modules/answer/internal/answer-tool-use-agent.ts`
- Turn orchestration: `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Tool execution evidence: `src/modules/answer-thread/internal/tool-runner.ts`
- SSE route: `src/routes/api.answer.turn.ts`
- Convex persistence: `convex/answerThreads.ts`, `convex/harnessSessions.ts`
- Tests/evals: `tests/unit/answer/`, `tests/unit/answer-thread/`, `tests/integration/answer-route.test.ts`, `eval/answer/`.

**Utilities:**
- Shared IDs/hash/result helpers: `src/modules/common/`
- Server-only helpers: `src/lib/server/`
- HTTP helpers: `src/lib/http/`
- UI label/status mapping: `src/lib/ui/`
- Operator navigation helpers: `src/lib/operator/`
- Observability helpers: `src/lib/observability/`

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router route tree.
- Generated: Yes
- Committed: Yes

**`convex/_generated/`:**
- Purpose: Generated Convex API/data model/server types plus managed AI guidelines.
- Generated: Yes
- Committed: Yes

**`src/future-phases/`:**
- Purpose: Parked future route/code sketches excluded from `tsconfig.json`.
- Generated: No
- Committed: Yes

**`dist/`, `.output/`, `.vercel/`, `playwright-report/`, `test-results/`, `output/`:**
- Purpose: Build, deployment, Playwright, and evaluation output artifacts.
- Generated: Yes
- Committed: Not generally used as source; check git status before editing or relying on these.

**`graphify-out/`:**
- Purpose: Graphify analysis output/cache.
- Generated: Yes
- Committed: Present in working tree; treat as tooling output unless a task targets it.

**`.env`, `.env.local`:**
- Purpose: Local environment configuration.
- Generated: No
- Committed: No expected source role; contents must not be read or quoted.

**`.env.example`:**
- Purpose: Safe environment variable name reference.
- Generated: No
- Committed: Yes

**`node_modules/`:**
- Purpose: Installed npm dependencies.
- Generated: Yes
- Committed: No

**`.agents/skills/`, `.codex/skills/`, `.claude/skills/`, `.cursor/skills/`:**
- Purpose: Local assistant/agent skill bundles and workflow instructions.
- Generated: Mixed
- Committed: Project-local skill directories are present; read relevant `SKILL.md` files before work that matches them.

---

*Structure analysis: 2026-07-04*
