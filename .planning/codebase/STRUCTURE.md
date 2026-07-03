# Codebase Structure

**Analysis Date:** 2026-07-03

## Directory Layout

```text
agentic-economy/
├── AGENTS.md                 # Always-on product, safety, UI, and Convex instructions
├── DESIGN.md                 # Visual authority for Astryx-era UI decisions
├── PRODUCT.md                # Product thesis and trust contract
├── package.json              # npm scripts, runtime deps, dev deps
├── vite.config.ts            # TanStack Start/Vite/Nitro/Tailwind/Sentry config
├── tsconfig.json             # TypeScript strictness and path aliases
├── convex/                   # Convex schema, functions, auth, crons, generated files
├── src/
│   ├── routes/               # TanStack file routes and API route handlers
│   ├── modules/              # Domain modules and source-facing server functions
│   ├── components/           # Astryx adapters, AE UI, AI Elements chat components
│   ├── lib/                  # Server, observability, UI, HTTP, operator helpers
│   ├── hooks/                # Shared React hooks
│   ├── styles/               # Global CSS, tokens, base, legacy styles
│   ├── app/                  # Standalone Astryx demo/prototype pages, not in route tree
│   └── future-phases/        # Deferred code sketches excluded from TypeScript build
├── tests/                    # Unit, integration, copy, UI-contract, import, SEO, E2E tests
├── eval/                     # Answer evaluation suite and promptfoo config
├── workflows/                # Local workflow documentation
├── public/                   # Static assets and illustration images
├── tools/                    # Local utility executables
├── .agents/skills/           # Project skill indexes and scripts
├── .codex/skills/            # Installed Codex/GSD/project skills
├── .planning/                # Project plans, audits, codebase maps, graph outputs
└── .github/workflows/        # CI workflows
```

## Directory Purposes

**Root:**
- Purpose: Project configuration, product/design instructions, and build/test entry points.
- Contains: `AGENTS.md`, `DESIGN.md`, `PRODUCT.md`, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `autumn.config.ts`, `doctor.config.ts`.
- Key files: `AGENTS.md`, `package.json`, `vite.config.ts`, `tsconfig.json`.

**`src/routes`:**
- Purpose: TanStack Router file routes for human pages and API endpoints.
- Contains: `createFileRoute` and `createRootRoute` files, API handlers, route loaders, route-local server functions.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.search.ts`.

**`src/modules`:**
- Purpose: Domain-owned contracts, flows, source ports, actions, and implementation details.
- Contains: `public.ts` facades, `<domain>.functions.ts`, `<domain>.actions.ts`, `internal/*`, schema fragments, readbacks.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`.

**`src/components`:**
- Purpose: Shared UI components and route composition pieces.
- Contains: `src/components/astryx/RouterLink.tsx`, AE legacy components under `src/components/ae/*`, AI Elements under `src/components/ai-elements/*`, animation helpers.
- Key files: `src/components/astryx/RouterLink.tsx`, `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`.

**`src/lib`:**
- Purpose: Cross-cutting helpers that do not own a product domain.
- Contains: Server transport/admission/auth helpers, observability adapters, UI presentation helpers, HTTP response helpers, operator navigation.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/observability/config.ts`, `src/lib/ui/status-presentation.ts`, `src/lib/operator/route-options.ts`.

**`src/hooks`:**
- Purpose: Small shared browser hooks.
- Contains: `src/hooks/use-client-mounted.ts`, `src/hooks/use-ae-surface-scope.ts`, `src/hooks/use-mobile.ts`.
- Key files: `src/hooks/use-client-mounted.ts`.

**`src/styles`:**
- Purpose: Global and legacy styling loaded from the root route.
- Contains: `src/styles/globals.css`, `src/styles/base.css`, `src/styles/tokens.css`, `src/styles/legacy.css`.
- Key files: `src/styles/globals.css`.

**`src/app`:**
- Purpose: Standalone Astryx demo/prototype pages that are not imported by `src/routeTree.gen.ts`.
- Contains: `src/app/ai-chat/page.tsx`, `src/app/ai-chat-landing/page.tsx`, `src/app/library/page.tsx`.
- Key files: `src/app/ai-chat/page.tsx`.

**`src/future-phases`:**
- Purpose: Deferred phase sketches excluded by `tsconfig.json`.
- Contains: `src/future-phases/route-helpers.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.
- Key files: `src/future-phases/route-helpers.ts`.

**`convex`:**
- Purpose: Convex backend schema, auth config, functions, source-state adapters, generated API types, and AI guidelines.
- Contains: `convex/schema.ts`, `convex/auth.config.ts`, `convex/crons.ts`, domain function files, store helpers, `_generated/*`.
- Key files: `convex/schema.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/answerThreads.ts`, `convex/_generated/ai/guidelines.md`.

**`tests`:**
- Purpose: Automated coverage for domain logic, routes, copy, UI contracts, imports, Convex runtime behavior, SEO, E2E, a11y, deploy smoke, and eval integration.
- Contains: `tests/unit`, `tests/integration`, `tests/copy`, `tests/ui-contract`, `tests/imports`, `tests/types`, `tests/seo`, `tests/eval`, `tests/e2e`, `tests/deploy-smoke`, `tests/helpers`, `tests/fixtures`.
- Key files: `tests/integration/agent-tools-api.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/imports/route-boundary.test.ts`.

**`eval`:**
- Purpose: Answer pipeline evaluation cases, assertions, scoring, reports, and promptfoo configuration.
- Contains: `eval/answer/lib/*`, `eval/answer/scripts/*`, `eval/answer/assertions/*`, `eval/answer/promptfooconfig.yaml`.
- Key files: `eval/answer/README.md`, `eval/answer/scripts/run-suite.ts`, `eval/answer/promptfooconfig.yaml`.

**`public`:**
- Purpose: Static browser assets.
- Contains: `public/favicon.svg`, `public/images/illustration/*.png`.
- Key files: `public/images/illustration/hero-victorian-house.png`, `public/favicon.svg`.

**`.agents/skills` and `.codex/skills`:**
- Purpose: Local/project and installed skill guidance used by coding agents.
- Contains: Skill indexes such as `.agents/skills/submit-qualified-inquiry/SKILL.md`, `.agents/skills/convex/SKILL.md`, `.codex/skills/tanstack-start/SKILL.md`, `.codex/skills/clerk-tanstack-patterns/SKILL.md`, `.codex/skills/gsd-map-codebase/SKILL.md`.
- Key files: `.agents/skills/submit-qualified-inquiry/SKILL.md`, `.codex/skills/gsd-map-codebase/SKILL.md`.

**`.planning`:**
- Purpose: Project plans, state, audits, graphs, react-doctor output, source-mining, and generated codebase maps.
- Contains: `.planning/STATE.md`, `.planning/config.json`, `.planning/codebase`, `.planning/phases`, `.planning/audits`, `.planning/graphs`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `vite.config.ts`: Vite/TanStack Start/Nitro/Tailwind/Sentry build entry.
- `src/start.ts`: TanStack Start middleware entry.
- `src/router.tsx`: Router factory.
- `src/routes/__root.tsx`: Root document and provider shell.
- `src/routes/index.tsx`: Home and answer-chat entry route.
- `convex/schema.ts`: Convex schema assembly.
- `convex/auth.config.ts`: Convex JWT auth provider config.

**Configuration:**
- `package.json`: Scripts and dependency graph.
- `tsconfig.json`: Strict TypeScript config and aliases `@/*` and `~/*`.
- `vitest.config.ts`: Vitest config.
- `playwright.config.ts`: Playwright E2E config.
- `playwright.deploy-smoke.config.ts`: Deploy smoke Playwright config.
- `.env`, `.env.local`, `.env.example`: Environment configuration files present; do not read or quote secret values.
- `autumn.config.ts`: Autumn billing config.
- `doctor.config.ts`: React Doctor config.
- `.github/workflows/eval-gate.yml`: Eval CI workflow.

**Core Logic:**
- `src/modules/common/action.ts`: Action contract type and descriptor conversion.
- `src/modules/actions/index.ts`: Explicit action registry.
- `src/modules/registry/registry.actions.ts`: Registry list/search/detail action definitions.
- `src/modules/registry/registry.functions.ts`: Registry source port, search backend selection, public filtering.
- `src/modules/catalog/owner-claim.functions.ts`: Claim/publish/read public catalog server functions and source port.
- `src/modules/inquiries/inquiry.actions.ts`: Qualified inquiry action definition.
- `src/modules/inquiries/inquiry.functions.ts`: Public and owner inquiry server functions/source calls.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Answer turn streaming orchestration.
- `src/modules/answer-thread/internal/tool-runner.ts`: Read-only answer tool execution.
- `src/modules/harness/tool-contract.ts`: Action-to-tool contract conversion and policy metadata.
- `src/lib/server/convex-source.ts`: Convex source transport.
- `src/lib/server/source-write-admission.ts`: Source-write admission context.
- `convex/*.ts`: Convex query/mutation implementations.

**Routing:**
- `src/routes/api.businesses.ts`: Public catalog list API.
- `src/routes/api.businesses.search.ts`: Public catalog search API.
- `src/routes/api.businesses.$slug.ts`: Public catalog detail API.
- `src/routes/api.agent.tools.ts`: Assistant action list/run endpoint.
- `src/routes/api.answer.turn.ts`: Answer SSE endpoint.
- `src/routes/$slug.tsx`: Published business listing page.
- `src/routes/$slug.inquiry.tsx`: Public inquiry page.
- `src/routes/llms[.]txt.ts`: Assistant-readable plain text index.
- `src/routes/sitemap[.]xml.ts`: Sitemap route.
- `src/routes/robots[.]txt.ts`: Robots route.

**UI:**
- `src/components/astryx/RouterLink.tsx`: Astryx link adapter for TanStack Router.
- `src/components/ae/layout/AePublicShell.tsx`: Public shell.
- `src/components/ae/layout/AeOperatorShell.tsx`: Owner/admin shell.
- `src/components/ae/listing/AeProviderListingPage.tsx`: Listing page composition.
- `src/components/ae/chat/AeChat.tsx`: Chat page composition.
- `src/components/ai-elements/message.tsx`: AI Elements message component.
- `src/styles/globals.css`: Root CSS import.

**Testing:**
- `tests/unit`: Domain/unit tests.
- `tests/integration`: Route and integration tests.
- `tests/imports`: Import-boundary tests.
- `tests/copy`: Boundary/copy tests.
- `tests/ui-contract`: UI contract and public language tests.
- `tests/e2e`: Playwright E2E tests.
- `tests/deploy-smoke`: Deployment smoke tests.
- `eval/answer`: Answer evaluation suite.

## Naming Conventions

**Files:**
- Route files mirror TanStack paths: `src/routes/api.businesses.search.ts`, `src/routes/$slug.inquiry.tsx`, `src/routes/llms[.]txt.ts`.
- Dynamic route params use `$`: `src/routes/$slug.tsx`, `src/routes/t.$threadId.tsx`, `src/routes/admin.runs.$turnId.tsx`.
- Literal dots in route filenames use `[.]`: `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`.
- Domain facades are named `public.ts`: `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`.
- TanStack server-function adapters are named `<domain>.functions.ts`: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Action definitions are named `<domain>.actions.ts`: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Domain internals live under `internal/`: `src/modules/registry/internal/search.ts`, `src/modules/catalog/internal/publish.ts`.
- Schema fragments are named `internal/schema.ts` or `internal/convex-schema.ts`: `src/modules/catalog/internal/schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`.
- Existing AE components use PascalCase `Ae*`: `src/components/ae/layout/AePublicShell.tsx`.

**Directories:**
- Domain directories are kebab-case when multiword: `src/modules/answer-thread`, `src/modules/business-action`, `src/modules/notification-outbox`, `src/modules/protected-action`.
- Component category directories are lowercase nouns: `src/components/ae/chat`, `src/components/ae/layout`, `src/components/ae/operator`.
- Test directories are grouped by test type or domain: `tests/unit/answer-thread`, `tests/integration`, `tests/ui-contract`.
- Convex files are top-level by domain: `convex/answerThreads.ts`, `convex/businessActions.ts`, `convex/notificationOutbox.ts`.

## Where to Add New Code

**New Human Route:**
- Primary code: `src/routes/<route>.tsx`
- Route-local loaders/search validation: `src/routes/<route>.tsx`
- Shared domain behavior: `src/modules/<domain>/<domain>.functions.ts` or `src/modules/<domain>/public.ts`
- Tests: `tests/integration/<route-or-domain>.test.ts` and E2E in `tests/e2e/<flow>.spec.ts` when user workflow risk is high.

**New JSON/Text Endpoint:**
- Primary code: `src/routes/api.<name>.ts` or literal text route like `src/routes/llms[.]txt.ts`
- Shared response helpers: `src/lib/http/*` or route-local helpers such as `src/routes/api.businesses.ts`
- Domain behavior: `src/modules/<domain>/<domain>.functions.ts`, `src/modules/<domain>/public.ts`
- Tests: `tests/integration/<endpoint>.test.ts`

**New Assistant Action:**
- Action definition: `src/modules/<domain>/<domain>.actions.ts`
- Registration: `src/modules/actions/index.ts`
- Shared action types: `src/modules/common/action.ts`
- Harness policy/projection changes: `src/modules/harness/tool-contract.ts`, `src/modules/harness/approval-policy.ts`
- Tests: `tests/unit/actions/<domain>.test.ts`, `tests/integration/agent-tools-api.test.ts`
- Boundary rule: Include explicit boundaries and do not imply booking, charging, dispatch, auto-fulfilment, availability, quote, or job acceptance.

**New Domain Module:**
- Public contracts: `src/modules/<domain>/public.ts`
- Server functions/source port: `src/modules/<domain>/<domain>.functions.ts`
- Internal pure implementation: `src/modules/<domain>/internal/<feature>.ts`
- Validators: `src/modules/<domain>/internal/validators.ts`
- Schema fragment: `src/modules/<domain>/internal/schema.ts` or `src/modules/<domain>/internal/convex-schema.ts`
- Convex function file: `convex/<domain>.ts`
- Schema registration: `convex/schema.ts`
- Tests: `tests/unit/<domain>`, `tests/integration/<domain>.test.ts`, `tests/unit/convex/<domain>-runtime.test.ts`

**New Convex Table or Function:**
- Table schema: module-owned schema fragment such as `src/modules/<domain>/internal/schema.ts`
- Schema assembly: `convex/schema.ts`
- Public query/mutation implementation: `convex/<domain>.ts`
- Function references: `src/modules/<domain>/<domain>.functions.ts` via `sourceQuery` or `sourceMutation`
- Guidelines: Read `convex/_generated/ai/guidelines.md` first.
- Tests: `tests/unit/convex/<domain>-runtime.test.ts` and domain unit tests.

**New Owner/Admin Surface:**
- Route: `src/routes/owner.<area>.tsx` or `src/routes/admin.<area>.tsx`
- Auth/pending/error shell: spread `operatorRouteOptions` from `src/lib/operator/route-options.ts`
- Domain server function: `src/modules/<domain>/<domain>.functions.ts`
- UI: compose Astryx primitives and existing operator components from `src/components/ae/operator` or `src/components/ae/layout`
- Tests: `tests/integration/admin-runtime.test.ts`, domain integration tests, and E2E when workflow-critical.

**New UI Component/Module:**
- Prefer route-local composition in `src/routes/<route>.tsx` when the UI is not reused.
- Shared Astryx adapters: `src/components/astryx/*`
- Existing behavior-bound AE UI areas: `src/components/ae/<area>/*`
- AI chat-specific components: `src/components/ae/chat/*` or `src/components/ai-elements/*`
- Rule: Use Astryx primitives first; do not add or extend bespoke AE presentation components unless the component owns real shared behavior.

**Utilities:**
- Server-only helpers: `src/lib/server/*`
- UI presentation helpers: `src/lib/ui/*`
- Observability helpers: `src/lib/observability/*`
- HTTP response helpers: `src/lib/http/*`
- Operator navigation/helpers: `src/lib/operator/*`
- General helpers: `src/lib/utils.ts`

**Tests:**
- Pure domain tests: `tests/unit/<domain>/*.test.ts`
- Route/API tests: `tests/integration/*.test.ts`
- Public copy boundary tests: `tests/copy/*.test.ts`
- UI public language/layout tests: `tests/ui-contract/*.test.ts`
- Import boundary tests: `tests/imports/*.test.ts`
- Convex runtime tests: `tests/unit/convex/*.test.ts`
- E2E/a11y tests: `tests/e2e/*.spec.ts`, `tests/e2e/a11y/*.spec.ts`

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree from `src/routes`.
- Generated: Yes.
- Committed: Yes.

**`convex/_generated`:**
- Purpose: Generated Convex API/data-model/server types plus Convex AI guidelines.
- Generated: Yes.
- Committed: Yes for this repo, including `convex/_generated/ai/guidelines.md`.

**`node_modules`:**
- Purpose: npm dependency install tree.
- Generated: Yes.
- Committed: No.

**`dist`:**
- Purpose: Build output.
- Generated: Yes.
- Committed: No.

**`.output`:**
- Purpose: Nitro/server build output.
- Generated: Yes.
- Committed: No.

**`playwright-report` and `test-results`:**
- Purpose: Playwright reports and test artifacts.
- Generated: Yes.
- Committed: No.

**`graphify-out`:**
- Purpose: Graph analysis output/cache.
- Generated: Yes.
- Committed: No unless explicitly used for planning artifacts.

**`output`:**
- Purpose: Evaluation, Playwright, and generated report output.
- Generated: Yes.
- Committed: Context-dependent; inspect before committing.

**`.planning`:**
- Purpose: GSD planning, project state, audits, graphs, phase docs, and codebase maps.
- Generated: Mixed.
- Committed: Yes for planning artifacts.

**`.agents/skills` and `.codex/skills`:**
- Purpose: Skill instructions and scripts used by agents.
- Generated: Installed/local skill content.
- Committed: Yes for project skills present in this workspace.

**`.env`, `.env.local`, `.env.example`:**
- Purpose: Environment configuration.
- Generated: No.
- Committed: `.env.example` may be committed; `.env` and `.env.local` contain local configuration and must not be read or quoted.

**`src/app`:**
- Purpose: Standalone Astryx demos/prototypes not included in `src/routeTree.gen.ts`.
- Generated: No.
- Committed: Yes.

**`src/future-phases`:**
- Purpose: Deferred implementation sketches excluded from TypeScript build by `tsconfig.json`.
- Generated: No.
- Committed: Yes.

---

*Structure analysis: 2026-07-03*
