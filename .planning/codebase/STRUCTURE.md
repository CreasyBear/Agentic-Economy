# Codebase Structure

**Analysis Date:** 2026-07-01

## Directory Layout

```text
agentic-economy/
|-- AGENTS.md                 # Always-on product, assistant, UI, and Convex constraints
|-- PRODUCT.md                # Product thesis and trust contract
|-- DESIGN.md                 # Visual system source of truth
|-- package.json              # npm scripts and dependencies
|-- vite.config.ts            # TanStack Start/Vite/Nitro/Tailwind/Sentry build config
|-- tsconfig.json             # Strict TypeScript config and path aliases
|-- components.json           # shadcn/Radix component registry config
|-- convex/                   # Convex functions, auth config, generated client, schema composition
|-- eval/answer/              # Promptfoo and custom answer evaluation harness
|-- public/                   # Static assets and public images
|-- src/
|   |-- components/           # AE components, UI primitives, ai-elements, animation wrappers
|   |-- future-phases/        # Parked phase scaffolding and readback helpers
|   |-- hooks/                # Shared React hooks
|   |-- lib/                  # Server, observability, UI scanner, operator, HTTP helpers
|   |-- modules/              # Domain modules and action/source boundaries
|   |-- routes/               # TanStack file routes and API routes
|   |-- styles/               # Global CSS, tokens, answer UI CSS
|   |-- router.tsx            # Router factory
|   |-- routeTree.gen.ts      # Generated TanStack route tree
|   `-- start.ts              # TanStack Start middleware bootstrap
|-- tests/                    # Unit, integration, e2e, copy, import, UI-contract, SEO tests
|-- .planning/codebase/       # GSD codebase maps
|-- .agents/skills/           # Installed local agent skills, mostly ignored by git
|-- .codex/                   # Local Codex/GSD workflow config, ignored by git
|-- .ui-craft/                # UI craft memory/reports
`-- .github/workflows/        # CI/eval workflows
```

## Directory Purposes

**`src/routes/`:**
- Purpose: TanStack file routes for public pages, owner/admin pages, API endpoints, discovery files, auth routes, and SSE endpoints.
- Contains: `createFileRoute` route modules such as `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.businesses.search.ts`, `src/routes/llms[.]txt.ts`.

**`src/modules/`:**
- Purpose: Domain ownership boundary for product contracts, pure commands, server functions, actions, schemas, and internal helpers.
- Contains: Module folders including `src/modules/business/`, `src/modules/catalog/`, `src/modules/registry/`, `src/modules/inquiries/`, `src/modules/answer/`, `src/modules/answer-thread/`, `src/modules/security/`, `src/modules/observability/`, `src/modules/billing/`, `src/modules/protected-action/`, `src/modules/business-action/`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/common/result.ts`, `src/modules/catalog/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`.

**`src/modules/*/internal/`:**
- Purpose: Private implementation details for a module: pure commands, table schema fragments, validators, projections, ports, policies, and adapters.
- Contains: Examples include `src/modules/registry/internal/search.ts`, `src/modules/inquiries/internal/commands.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/security/internal/admin-authority.ts`.
- Key files: `src/modules/registry/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`.

**`src/components/ae/`:**
- Purpose: Agentic Economy product components.
- Contains: Chat, artifacts, forms, inquiries, landing, layout, listing, operator, readback, registry, and status components.
- Key files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`.

**`src/components/ui/`:**
- Purpose: Shared UI primitives generated/adapted from shadcn/Radix style.
- Contains: Button, card, dialog, field, input, select, table, tabs, tooltip, toast, and other primitives.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/field.tsx`, `src/components/ui/sonner.tsx`.

**`src/lib/`:**
- Purpose: Shared infrastructure helpers outside domain modules.
- Contains: Server source transport/admission/provider helpers, observability clients, UI contract scanner, operator navigation, HTTP response helpers.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/ui/contract-scans.ts`, `src/lib/observability/config.ts`, `src/lib/utils.ts`.

**`src/styles/`:**
- Purpose: Global CSS, design tokens, answer/chat/layout CSS modules.
- Contains: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/answer.css`, and `src/styles/answer/*.css`.
- Key files: `src/styles/tokens.css`, `src/styles/answer/index.css`, `src/styles/answer/chat-shell.css`.

**`src/hooks/`:**
- Purpose: Shared React hooks.
- Contains: `src/hooks/use-client-mounted.ts`, `src/hooks/use-mobile.ts`.
- Key files: `src/hooks/use-client-mounted.ts`.

**`src/future-phases/`:**
- Purpose: Parked phase scaffolding/readback helpers that are allowed by source-mining guardrails.
- Contains: Phase-specific route/panel/readback files such as `src/future-phases/04-owner-pending-protected-actions/owner-actions.readback.ts` and `src/future-phases/05-paid-activation-money-rails/owner-billing.readback.ts`.
- Key files: `src/future-phases/route-helpers.ts`.

**`convex/`:**
- Purpose: Convex backend functions, auth config, schema composition, generated client files, and source-state adapters.
- Contains: Runtime files such as `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/answerThreads.ts`, `convex/security.ts`, plus `convex/_generated/`.
- Key files: `convex/schema.ts`, `convex/auth.config.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/_generated/ai/guidelines.md`.

**`tests/`:**
- Purpose: Test coverage for domain commands, server seams, routes, imports, public copy, UI contracts, SEO, and e2e/a11y flows.
- Contains: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/copy/`, `tests/imports/`, `tests/ui-contract/`, `tests/seo/`, `tests/types/`, helpers and fixtures.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/private-imports.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/unit/answer-thread/tool-runner.test.ts`.

**`eval/answer/`:**
- Purpose: Answer pipeline eval cases, scoring, promptfoo config, and custom assertions.
- Contains: `eval/answer/lib/`, `eval/answer/assertions/`, `eval/answer/scripts/`, `eval/answer/providers/`, `eval/answer/promptfooconfig.yaml`.
- Key files: `eval/answer/lib/cases.ts`, `eval/answer/scripts/run-suite.ts`, `eval/answer/providers/gate.mjs`.

**`public/`:**
- Purpose: Static public assets.
- Contains: `public/favicon.svg` and illustrations under `public/images/illustration/`.
- Key files: `public/images/illustration/hero-victorian-house.png`, `public/images/illustration/agent-ledger.png`.

**`.planning/`:**
- Purpose: GSD planning artifacts, audits, phases, graphs, spikes, and codebase maps.
- Contains: `.planning/codebase/`, `.planning/phases/`, `.planning/audits/`, `.planning/spikes/`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start request middleware bootstrap.
- `src/router.tsx`: Router factory over generated `src/routeTree.gen.ts`.
- `src/routes/__root.tsx`: Root document, global CSS, providers, scripts.
- `src/routes/index.tsx`: Home chat/answer surface.
- `src/routes/registry.tsx`: Human business registry surface.
- `src/routes/$slug.tsx`: Public business listing page.
- `src/routes/$slug.inquiry.tsx`: Public qualified inquiry form.
- `src/routes/api.agent.tools.ts`: Assistant action list/invoke endpoint.
- `src/routes/api.answer.turn.ts`: Threaded answer SSE endpoint.
- `convex/schema.ts`: Convex schema composition entry.

**Configuration:**
- `package.json`: npm scripts, dependencies, package manager.
- `vite.config.ts`: Vite/TanStack Start/Nitro/Tailwind/Sentry plugin config.
- `tsconfig.json`: Strict TS config and `@/*` / `~/*` aliases.
- `tailwind.config.ts`: Tailwind content roots.
- `components.json`: shadcn/Radix config and aliases.
- `vitest.config.ts`: Vitest config.
- `playwright.config.ts`: E2E config and local dev server.
- `convex/auth.config.ts`: Clerk JWT provider for Convex.
- `.env.example`: Environment variable example file; `.env` and `.env.local` exist and must not be read or quoted.

**Core Logic:**
- `src/modules/actions/index.ts`: Explicit action registration.
- `src/modules/common/action.ts`: Action definition and agent descriptor contract.
- `src/lib/server/convex-source.ts`: Convex source transport.
- `src/lib/server/source-write-admission.ts`: Server-side source-write admission plumbing.
- `src/modules/security/source-write-admission.ts`: HMAC admission creation/verification contract.
- `src/modules/registry/registry.functions.ts`: Public registry source reads and search backend selection.
- `src/modules/registry/registry.actions.ts`: `registry.search` and `registry.detail` actions.
- `src/modules/inquiries/inquiry.functions.ts`: Public/owner inquiry server functions and source writes.
- `src/modules/inquiries/inquiry.actions.ts`: Inquiry action declarations.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Answer turn streaming and persistence orchestration.
- `src/modules/answer-thread/internal/tool-runner.ts`: Registered action tool execution/evidence.
- `src/modules/answer/internal/answer-tool-use-agent.ts`: OpenRouter tool-use loop and grounded prose gate.
- `src/modules/catalog/owner-claim.functions.ts`: Claim/publish/public page source functions.
- `src/modules/security/admin-readback.functions.ts`: Admin readback source functions.
- `convex/source_state.ts`: Convex row-to-domain-state adapter and persistence helper.

**Convex Tables:**
- `src/modules/business/internal/schema.ts`: `owners`, `businesses`, `businessContexts`, `claims`.
- `src/modules/catalog/internal/schema.ts`: `businessServices`, `serviceCapabilities`.
- `src/modules/registry/internal/schema.ts`: registry projection/search/index tables.
- `src/modules/inquiries/internal/convex-schema.ts`: inquiry threads/messages/notifications/read states/privacy tables.
- `src/modules/answer-thread/internal/convex-schema.ts`: answer thread/turn/tool-call tables.
- `src/modules/notification-outbox/internal/schema.ts`: notification dispatch, attempt, and webhook event tables.
- `src/modules/observability/internal/schema.ts`: operation keys, audit events, funnel events, operator controls.
- `src/modules/security/internal/schema.ts`: disputes, suppression rules, admin memberships, abuse buckets, claim fingerprints.
- `src/modules/billing/internal/schema.ts`: billing offers, operations, provider events, receipts, reconciliations, support records.
- `src/modules/protected-action/internal/schema.ts`: protected-action proposals, decisions, admissions, attempts, receipts, support/no-repair records.
- `convex/businessActionStore.ts`: business-action tables and store helpers.

**Testing:**
- `tests/unit/`: Pure/domain/component unit tests.
- `tests/integration/`: Route/server/action/source integration tests.
- `tests/e2e/`: Playwright UI and a11y tests.
- `tests/imports/`: Architecture import and TypeScript guardrail tests.
- `tests/copy/`: Product copy and overclaim tests.
- `tests/ui-contract/`: Public UI/copy/layout guardrails.
- `tests/seo/`: SEO and noindex tests.
- `tests/helpers/`: Test source ports, source-write admission helpers, answer-thread test ports.
- `eval/answer/`: Answer quality eval suite.

## Naming Conventions

**Files:**
- Route files mirror TanStack file-route paths: `src/routes/$slug.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/api.businesses.search.ts`, `src/routes/llms[.]txt.ts`.
- Domain public seams use `public.ts`: `src/modules/catalog/public.ts`, `src/modules/security/public.ts`.
- TanStack server-function adapters use `*.functions.ts`: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Action declarations use `*.actions.ts`: `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`.
- Module private files live under `internal/`: `src/modules/registry/internal/search.ts`, `src/modules/protected-action/internal/policy.ts`.
- Convex schema fragments use `internal/schema.ts` or a module-specific Convex schema file: `src/modules/answer-thread/internal/convex-schema.ts`.
- Product components use the `Ae` prefix and PascalCase: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/layout/AePublicShell.tsx`.
- UI primitives are lowercase component names: `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`.
- Tests use `.test.ts` / `.test.tsx`; e2e specs use `.spec.ts`.

**Directories:**
- One module per domain under `src/modules/<domain>/`.
- Private module implementation goes in `src/modules/<domain>/internal/`.
- Public route/UI surfaces are grouped by file-route convention in `src/routes/`, not nested folders.
- Product-specific UI goes in `src/components/ae/<area>/`.
- Shared primitives go in `src/components/ui/`.
- Server-only helpers go in `src/lib/server/`.
- Observability helpers go in `src/lib/observability/`.

## Where to Add New Code

**New Public Page:**
- Primary code: `src/routes/<route>.tsx`
- UI components: `src/components/ae/<area>/`
- Route data/source reads: `src/modules/<domain>/<domain>.functions.ts`
- Tests: `tests/integration/` for loader/server behavior and `tests/e2e/` for browser behavior.

**New API Route:**
- Primary code: `src/routes/api.<name>.ts`
- Business logic: `src/modules/<domain>/public.ts` or `src/modules/<domain>/<domain>.functions.ts`
- Response helpers: Reuse `jsonResponse` from `src/routes/api.businesses.ts` when compatible or put shared HTTP helpers in `src/lib/http/`.
- Tests: `tests/integration/<name>.test.ts`.

**New Domain Module:**
- Public contracts: `src/modules/<module>/public.ts`
- Pure logic: `src/modules/<module>/internal/*.ts`
- Table schema: `src/modules/<module>/internal/schema.ts`
- Server/source functions: `src/modules/<module>/<module>.functions.ts`
- Actions: `src/modules/<module>/<module>.actions.ts` when the operation spans UI/HTTP/agent surfaces.
- Convex runtime functions: `convex/<module>.ts`
- Schema registration: import the module table fragment in `convex/schema.ts`.
- Tests: `tests/unit/<module>/` plus `tests/integration/` when routes/source functions are involved.

**New Assistant-Callable Operation:**
- Define action: `src/modules/<module>/<module>.actions.ts`
- Register action: `src/modules/actions/index.ts`
- Shared contract: `src/modules/common/action.ts`
- Agent invocation: No new agent route is needed unless the protocol surface changes; `src/routes/api.agent.tools.ts` lists/invokes registered actions.
- Tests: `tests/integration/agent-tools-api.test.ts`, module action unit tests under `tests/unit/actions/` or `tests/unit/<module>/`.

**New Convex Table:**
- Add table definition: `src/modules/<module>/internal/schema.ts`
- Compose schema: `convex/schema.ts`
- Add Convex functions: `convex/<module>.ts`
- Add source refs in module functions: `src/modules/<module>/<module>.functions.ts`
- Follow Convex guidance: read `convex/_generated/ai/guidelines.md` before editing Convex code.

**New Convex Query/Mutation:**
- Runtime implementation: `convex/<module>.ts`
- Public/authenticated source reference: `sourceQuery` or `sourceMutation` in `src/modules/<module>/<module>.functions.ts`
- Auth/authority: Use `convex/authz.ts` and module authority contracts.
- Writes: Require source-write admission through `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.

**New Search Behavior:**
- Query matching/domain docs: `src/modules/registry/internal/search-documents.ts`
- Convex registry query behavior: `convex/registry.ts`
- Optional Meilisearch behavior: `src/modules/registry/internal/catalog-search-port.ts`
- Public registry source path: `src/modules/registry/registry.functions.ts`
- Tests: `tests/unit/registry/` and `tests/integration/registry-api.test.ts`.

**New Answer Feature:**
- Thread schema/turn contracts: `src/modules/answer-thread/answer-thread.schema.ts`
- Streaming orchestration: `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Tool execution/evidence: `src/modules/answer-thread/internal/tool-runner.ts`
- Prose/agent/gate behavior: `src/modules/answer/internal/`
- Convex persistence: `convex/answerThreads.ts` and `src/modules/answer-thread/internal/convex-schema.ts`
- Eval coverage: `eval/answer/` plus `tests/unit/answer*` and `tests/integration/answer-*`.

**New Product Component:**
- AE component: `src/components/ae/<area>/Ae<Name>.tsx`
- Primitive extension: `src/components/ui/<primitive>.tsx`
- Styles: Prefer tokens/classes in `src/styles/tokens.css` and area CSS under `src/styles/answer/` when the surface already uses CSS files.
- Design source: Read `DESIGN.md` before UI changes.

**Utilities:**
- Shared domain-neutral helpers: `src/modules/common/`
- Server-only infrastructure: `src/lib/server/`
- Browser/client observability: `src/lib/observability/`
- UI scanner/presentation helpers: `src/lib/ui/`
- General React hooks: `src/hooks/`

## Special Directories

**`convex/_generated/`:**
- Purpose: Generated Convex API/data model/server/client files and managed AI guidance.
- Generated: Yes
- Committed: Yes for generated Convex support files present in repo; regenerate with Convex tooling and do not hand-edit.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree.
- Generated: Yes
- Committed: Yes
- Guidance: Do not hand-edit; route files in `src/routes/` are the source.

**`.planning/codebase/`:**
- Purpose: Codebase map documents consumed by GSD planning/execution commands.
- Generated: Yes
- Committed: Yes
- Guidance: Mapper agents overwrite only assigned map files such as `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md`.

**`.agents/skills/`:**
- Purpose: Local agent skill bundles and project skill indexes.
- Generated: Installed vendor content
- Committed: Mostly no; `.gitignore` ignores `.agents/skills/` except explicit allowed exceptions.

**`.codex/`:**
- Purpose: Local Codex/GSD workflow config and skill/vendor trees.
- Generated: Installed/local tooling
- Committed: No; `.gitignore` ignores `.codex/`.

**`.ui-craft/`:**
- Purpose: UI craft memory, reports, and design context.
- Generated: Mixed
- Committed: Project-dependent; read when doing UI/design work.

**`src/future-phases/`:**
- Purpose: Parked phase-specific scaffolding/readbacks outside active route files.
- Generated: No
- Committed: Yes
- Guidance: Keep active routes in `src/routes/`; move parked code only when the owning phase is active.

**`eval/answer/`:**
- Purpose: Promptfoo answer evals and supporting scripts/assertions.
- Generated: No
- Committed: Yes
- Guidance: Add eval cases when answer behavior, registry grounding, or gates change.

**`public/images/illustration/`:**
- Purpose: Brand/product illustration assets.
- Generated: No
- Committed: Yes
- Guidance: Keep hand-drawn/pen-and-ink brand asset direction from `DESIGN.md`.

**`.output/`, `dist/`, `output/`, `playwright-report/`, `test-results/`, `node_modules/`:**
- Purpose: Build/test/runtime/dependency artifacts.
- Generated: Yes
- Committed: No; ignored in `.gitignore`.

**`.env`, `.env.local`, `.env.*`:**
- Purpose: Environment configuration and secrets.
- Generated: Local/operator-managed
- Committed: No; ignored in `.gitignore`.
- Guidance: Note existence only. Do not read or quote contents.

---

*Structure analysis: 2026-07-01*
