# Codebase Structure

**Analysis Date:** 2026-07-02

## Directory Layout

```text
agentic-economy/
|-- src/                         # TanStack Start app, routes, modules, UI, styles
|   |-- routes/                  # File-based TanStack routes and API handlers
|   |-- modules/                 # Feature modules and domain contracts
|   |-- components/              # AE components and UI primitives
|   |-- lib/                     # Shared server/UI/observability helpers
|   |-- styles/                  # Global tokens and answer/page CSS
|   |-- routeTree.gen.ts         # Generated TanStack route tree
|   |-- router.tsx               # Router factory
|   `-- start.ts                 # TanStack Start instance and middleware
|-- convex/                      # Convex schema, functions, auth, crons, generated types
|-- tests/                       # Vitest, Playwright, copy, contract, import, SEO tests
|-- eval/                        # Answer evaluation scripts and promptfoo config
|-- public/                      # Static assets and illustration images
|-- .planning/                   # GSD state, phases, audits, and codebase docs
|-- .codex/                      # Local Codex agents, hooks, scripts, skills, GSD core
|-- .agents/                     # Local project skills
|-- tools/                       # Repo-local tooling
|-- workflows/                   # Workflow notes
|-- package.json                 # Scripts and dependencies
|-- vite.config.ts               # Vite/TanStack Start/Nitro/Tailwind/Sentry config
|-- tsconfig.json                # TypeScript config and path aliases
`-- vitest.config.ts             # Vitest config
```

## Directory Purposes

**`src/routes/`:**
- Purpose: URL-owned application entry points.
- Contains: Public routes, owner/admin routes, API routes, machine-readable routes, and route-local server functions when narrow.
- Key files: `src/routes/__root.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`

**`src/modules/`:**
- Purpose: Feature-module domain boundaries.
- Contains: `public.ts` contracts, `*.functions.ts` server seams, `*.actions.ts` action declarations, `internal/` implementation, module-owned schemas.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`

**`src/modules/*/internal/`:**
- Purpose: Private feature implementation.
- Contains: Domain commands, projections, validators, schema fragments, provider adapters, tool runners, and policy logic.
- Key files: `src/modules/catalog/internal/publish.ts`, `src/modules/registry/internal/search.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/answer-thread/internal/tool-runner.ts`

**`src/components/ae/`:**
- Purpose: Agentic Economy branded UI components.
- Contains: Public shell/layout, listing cards, chat UI, inquiry UI, owner/admin operator UI, artifacts, feedback states, forms.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/chat/AeStructuredAnswerChat.tsx`

**`src/components/ui/`:**
- Purpose: Shared UI primitives.
- Contains: Button, card, field, dialog, table, tabs, tooltip, input, select, sidebar, and related primitives.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/field.tsx`, `src/components/ui/table.tsx`

**`src/lib/`:**
- Purpose: Shared infrastructure helpers not owned by one product module.
- Contains: Server provider seams, Convex transport, source-write admission, SSE helpers, observability clients, UI copy/status utilities.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/sse-response.ts`, `src/lib/observability/config.ts`

**`src/styles/`:**
- Purpose: CSS tokens and surface-specific styles.
- Contains: Global CSS, token implementation, answer-specific CSS bundles.
- Key files: `src/styles/tokens.css`, `src/styles/globals.css`, `src/styles/answer/index.css`

**`convex/`:**
- Purpose: Convex backend functions, auth config, cron jobs, schema, and generated API files.
- Contains: Domain Convex functions, schema composition, source-state runtime adapter, generated API/data model/server files.
- Key files: `convex/schema.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/auth.config.ts`, `convex/crons.ts`, `convex/source_state.ts`

**`tests/`:**
- Purpose: Automated verification for units, integrations, E2E, copy policy, import boundaries, UI contracts, SEO, and deploy smoke.
- Contains: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/copy/`, `tests/imports/`, `tests/ui-contract/`, `tests/seo/`, `tests/deploy-smoke/`.
- Key files: `tests/integration/agent-tools-api.test.ts`, `tests/imports/private-imports.test.ts`, `tests/copy/phase1-banned-copy.test.ts`

**`eval/`:**
- Purpose: Answer-pipeline evaluation tooling.
- Contains: Promptfoo config, answer suite scripts, cases, scoring, coverage checks, provider adapters.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/run-suite.ts`, `eval/answer/lib/cases.ts`

**`public/`:**
- Purpose: Static assets served by the app.
- Contains: Favicon and AE hand-drawn illustration assets.
- Key files: `public/favicon.svg`, `public/images/illustration/hero-victorian-house.png`, `public/images/illustration/agent-ledger.png`

**`.planning/`:**
- Purpose: GSD project planning, audits, phase artifacts, graphs, and codebase maps.
- Contains: `STATE.md`, `config.json`, phase folders, audit folders, codebase docs.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start request middleware setup.
- `src/router.tsx`: Router factory and route-tree registration.
- `src/routes/__root.tsx`: Root document/provider shell.
- `src/routes/index.tsx`: Home route.
- `src/routes/registry.tsx`: Human registry route.
- `src/routes/api.agent.tools.ts`: Quiet assistant action list/invoke endpoint.
- `convex/schema.ts`: Convex schema entry point.
- `convex/crons.ts`: Convex scheduled jobs.

**Configuration:**
- `package.json`: npm scripts, dependency versions, package manager.
- `vite.config.ts`: Vite, TanStack Start, Nitro, React, Tailwind, Sentry plugin config.
- `tsconfig.json`: TypeScript compiler settings and path aliases.
- `tailwind.config.ts`: Tailwind configuration.
- `components.json`: UI component generator/config metadata.
- `vitest.config.ts`: Vitest configuration.
- `playwright.config.ts`: E2E Playwright configuration.
- `playwright.deploy-smoke.config.ts`: Deploy-smoke Playwright configuration.
- `convex/auth.config.ts`: Convex JWT provider configuration.
- `.env`, `.env.local`: Environment configuration files are present; do not read or commit secret values.

**Core Logic:**
- `src/modules/actions/index.ts`: Central action registration.
- `src/modules/common/action.ts`: Action type system and agent descriptors.
- `src/modules/registry/registry.functions.ts`: Public registry read orchestration.
- `src/modules/registry/registry.actions.ts`: Assistant-safe registry read actions.
- `src/modules/inquiries/inquiry.functions.ts`: Inquiry server functions and source writes.
- `src/modules/inquiries/inquiry.actions.ts`: Qualified inquiry and owner inquiry actions.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Streaming answer-turn orchestration.
- `src/modules/answer-thread/internal/tool-runner.ts`: Read-tool execution and evidence buffering.
- `src/modules/answer/internal/answer-tool-use-agent.ts`: OpenRouter tool-use agent path.
- `src/modules/catalog/public.ts`: Public catalog contract and catalog exports.
- `src/lib/server/convex-source.ts`: Convex source transport.
- `src/lib/server/source-write-admission.ts`: Server-side source-write admission.
- `convex/sourceWriteAdmission.ts`: Convex-side admission verification.
- `convex/registry.ts`: Durable public catalog queries.
- `convex/inquiries.ts`: Durable inquiry mutations and owner/admin readbacks.

**Testing:**
- `tests/unit/`: Focused module and component tests.
- `tests/integration/`: Route/runtime integration tests.
- `tests/e2e/`: Playwright browser flows.
- `tests/e2e/a11y/`: Accessibility E2E tests.
- `tests/copy/`: Public copy and overclaim guard tests.
- `tests/imports/`: Import-boundary and source-mining tests.
- `tests/ui-contract/`: UI contract tests.
- `tests/seo/`: SEO and discovery-file tests.
- `tests/types/`: Type-level contract tests.
- `tests/deploy-smoke/`: Remote/deployed smoke tests.
- `tests/helpers/`: Shared test ports and helpers.

## Naming Conventions

**Files:**
- TanStack route files use file-based route names: `src/routes/api.businesses.search.ts`, `src/routes/$slug.inquiry.tsx`, `src/routes/owner.inquiries.$threadId.tsx`.
- Public feature contracts are named `public.ts`: `src/modules/registry/public.ts`, `src/modules/catalog/public.ts`.
- Server function seams are named `<module>.functions.ts`: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Action declarations are named `<module>.actions.ts`: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Internal implementation belongs under `internal/`: `src/modules/protected-action/internal/policy.ts`, `src/modules/answer/internal/answer-gate.ts`.
- Module schema fragments use `schema.ts` or `convex-schema.ts`: `src/modules/registry/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`.
- React components use PascalCase file names: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/chat/AeChat.tsx`.
- UI primitives use lowercase/kebab names: `src/components/ui/button.tsx`, `src/components/ui/native-select.tsx`.
- Generated files include `.gen` or live under generated folders: `src/routeTree.gen.ts`, `convex/_generated/api.d.ts`.

**Directories:**
- Feature modules use lowercase or kebab-case: `src/modules/business-action`, `src/modules/protected-action`, `src/modules/answer-thread`.
- Component groups are organized by surface/domain: `src/components/ae/chat`, `src/components/ae/operator`, `src/components/ae/inquiries`.
- Test folders mirror concern type rather than source tree only: `tests/unit/registry`, `tests/integration`, `tests/ui-contract`.
- Future/parked implementation folders are explicit: `src/future-phases/04-owner-pending-protected-actions`, `src/future-phases/05-paid-activation-money-rails`.

## Where to Add New Code

**New Public Route:**
- Primary code: `src/routes/<route>.tsx`
- Data reads/writes: use existing or new module server functions in `src/modules/<module>/<module>.functions.ts`
- UI components: `src/components/ae/<surface>/`
- Tests: `tests/integration/` for loader/API behavior and `tests/e2e/` for browser flow when user-facing.

**New API Endpoint:**
- Primary code: `src/routes/api.<name>.ts`
- Shared response helpers: `src/routes/api.businesses.ts` or `src/lib/http/`
- Business logic: `src/modules/<module>/<module>.functions.ts` or `src/modules/<module>/public.ts`
- Tests: `tests/integration/`

**New Assistant-Callable Operation:**
- Definition: `src/modules/<module>/<module>.actions.ts`
- Registration: `src/modules/actions/index.ts`
- Shared implementation: `src/modules/<module>/<module>.functions.ts`
- Tests: `tests/unit/actions/`, `tests/integration/agent-tools-api.test.ts`
- Rule: include boundary-honest `summary` and `boundaries`; expose only safe surfaces.

**New Feature Module:**
- Public contract: `src/modules/<module>/public.ts`
- Implementation: `src/modules/<module>/internal/`
- Server functions: `src/modules/<module>/<module>.functions.ts`
- Actions: `src/modules/<module>/<module>.actions.ts` when the feature exposes operations.
- Convex schema: `src/modules/<module>/internal/schema.ts` or `convex/<module>Store.ts`, then spread into `convex/schema.ts`.
- Convex functions: `convex/<module>.ts`
- Tests: `tests/unit/<module>/`, plus integration tests for route/server boundaries.

**New Convex Table:**
- Schema fragment: module-owned schema file such as `src/modules/<module>/internal/schema.ts`
- Composition: add spread/import to `convex/schema.ts`
- Runtime functions: `convex/<module>.ts`
- Client/server seam: `src/modules/<module>/<module>.functions.ts` using `sourceQuery`/`sourceMutation` from `src/lib/server/convex-source.ts`
- Rule: read `convex/_generated/ai/guidelines.md` first and define indexes before query paths need them.

**New Domain Logic:**
- Implementation: `src/modules/<module>/internal/<domain>.ts`
- Public exports: `src/modules/<module>/public.ts`
- Shared result helper: `src/modules/common/result.ts`
- Shared ID/value helpers: `src/modules/common/ids.ts`, `src/modules/common/stable-hash.ts`

**New UI Component:**
- AE-specific component: `src/components/ae/<surface>/Ae<Name>.tsx`
- Generic primitive: `src/components/ui/<primitive>.tsx`
- Styles: prefer existing tokens in `src/styles/tokens.css` and surface CSS in `src/styles/answer/` or `src/styles/globals.css`
- Tests: `tests/unit/ui/` or `tests/ui-contract/`

**New Owner/Admin Screen:**
- Route: `src/routes/owner.<name>.tsx` or `src/routes/admin.<name>.tsx`
- Shell: `src/components/ae/layout/AeOperatorShell.tsx`
- Navigation: `src/lib/operator/navigation.ts`
- Data: module server functions with Clerk/Convex auth path.

**New Machine-Readable Public Resource:**
- Route: `src/routes/api.<resource>.ts` or named file route such as `src/routes/llms[.]txt.ts`
- Response helper: `src/lib/http/discovery-response.ts` for text/discovery responses.
- Source: existing public catalog/discovery modules.
- Tests: `tests/seo/`, `tests/integration/`, and `tests/copy/` if public copy changes.

**Utilities:**
- Shared server helpers: `src/lib/server/`
- Shared UI helpers: `src/lib/ui/`
- Shared observability helpers: `src/lib/observability/`
- Shared domain helpers: `src/modules/common/`

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex generated API/data model/server files and AI guidelines.
- Generated: Yes
- Committed: Yes

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router generated route tree.
- Generated: Yes
- Committed: Yes

**`.planning/`:**
- Purpose: GSD workflow state, implementation phases, audits, spikes, graphs, and codebase maps.
- Generated: Partly
- Committed: Yes

**`.codex/skills/` and `.agents/skills/`:**
- Purpose: Local project/agent skill instructions used by GSD and implementation agents.
- Generated: Partly
- Committed: Yes

**`src/future-phases/`:**
- Purpose: Staged or carried-forward route/component code for pending product phases.
- Generated: No
- Committed: Yes

**`eval/answer/`:**
- Purpose: Answer quality evaluation suite, promptfoo configuration, and reporting scripts.
- Generated: No
- Committed: Yes

**`output/`, `test-results/`, `playwright-report/`, `graphify-out/`:**
- Purpose: Local reports, screenshots, traces, eval outputs, and graph analysis cache.
- Generated: Yes
- Committed: No for routine generated outputs; preserve only intentionally referenced evidence files.

**`dist/`, `.output/`, `.vercel/output/`:**
- Purpose: Build and deployment outputs.
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: Installed npm dependencies.
- Generated: Yes
- Committed: No

**`.env`, `.env.local`:**
- Purpose: Local environment configuration and secrets.
- Generated: No
- Committed: No; existence only should be noted, contents must not be read or quoted.

---

*Structure analysis: 2026-07-02*
