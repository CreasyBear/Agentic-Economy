# Codebase Structure

**Analysis Date:** 2026-06-30

## Directory Layout

```text
agentic-economy/
├── .agents/                 # Repo-local skills and UI/design workflows
├── .codex/                  # Codex/GSD skills, agents, hooks, templates, workflows
├── .planning/               # Product, phase, audit, graph, and codebase planning docs
├── .ui-craft/               # UI craft memory, decisions, reports, reviews, surfaces
├── convex/                  # Convex schema, authz, queries, mutations, generated API
├── eval/                    # Promptfoo answer-evaluation config, providers, assertions
├── public/                  # Static public assets, especially AE illustration images
├── src/
│   ├── components/          # AE UI components, shadcn primitives, AI elements
│   ├── future-phases/       # Parked phase-specific route/panel/readback code
│   ├── hooks/               # Shared React hooks
│   ├── lib/                 # Cross-cutting helpers, source adapters, navigation, scans
│   ├── modules/             # Domain modules and source-state business logic
│   ├── routes/              # TanStack file routes for pages and APIs
│   ├── styles/              # Global CSS, design tokens, answer-specific styles
│   ├── router.tsx           # TanStack router factory
│   ├── routeTree.gen.ts     # Generated TanStack route tree
│   └── start.ts             # TanStack Start middleware bootstrap
├── tests/                   # Unit, integration, import, copy, SEO, UI, E2E, smoke tests
├── AGENTS.md                # Always-on repo instructions and AE trust boundaries
├── DESIGN.md                # Visual design source of truth
├── PRODUCT.md               # Product thesis and trust contract source of truth
├── package.json             # Scripts, dependencies, package manager
├── vite.config.ts           # Vite/TanStack Start/Nitro/Tailwind config
├── tsconfig.json            # TypeScript strictness and path aliases
└── vitest.config.ts         # Vitest configuration
```

## Directory Purposes

**`src/routes/`:**
- Purpose: TanStack Router file routes for human pages, owner/admin/developer pages, JSON APIs, SSE streams, discovery files, and webhooks.
- Contains: `*.tsx` page routes, `api.*.ts` server routes, dynamic segment files such as `src/routes/$slug.tsx`, escaped static files such as `src/routes/llms[.]txt.ts`.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`.
- Subdirectories: None; route hierarchy is encoded in filenames.

**`src/modules/`:**
- Purpose: Domain modules, source-state commands, schemas, action definitions, and server/source seams.
- Contains: One directory per bounded context with `public.ts`, `internal/`, `*.functions.ts`, and sometimes `*.actions.ts` or `*.schema.ts`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/catalog/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/answer/public.ts`, `src/modules/billing/billing.functions.ts`.
- Subdirectories: `src/modules/<domain>/internal/` contains implementation; imports across domains should use `src/modules/<domain>/public.ts`.

**`src/modules/common/`:**
- Purpose: Shared domain primitives for IDs, action definitions, result unions, stable hashes, literal helpers, and narrow-to chips.
- Contains: `src/modules/common/ids.ts`, `src/modules/common/result.ts`, `src/modules/common/stable-hash.ts`, `src/modules/common/action.ts`, `src/modules/common/convex-literals.ts`.
- Key files: Use `src/modules/common/ids.ts` for branded IDs and `src/modules/common/result.ts` for `ModuleResult`.

**`src/components/ae/`:**
- Purpose: AE-specific UI components organized by product surface and workflow.
- Contains: `artifacts/`, `brand/`, `chat/`, `feedback/`, `forms/`, `inquiries/`, `landing/`, `layout/`, `listing/`, `operator/`, `readback/`, `status/`.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/inquiries/AeInquiryInboxPanel.tsx`.
- Subdirectories: Add AE domain components under the closest product surface directory.

**`src/components/ui/`:**
- Purpose: Shared primitive UI components in the shadcn/Radix style.
- Contains: Lowercase primitive files such as `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/sidebar.tsx`, `src/components/ui/tooltip.tsx`.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/field.tsx`, `src/components/ui/sonner.tsx`.
- Subdirectories: None.

**`src/components/ai-elements/`:**
- Purpose: Local AI Elements components used by chat/answer surfaces.
- Contains: `src/components/ai-elements/prompt-input.tsx`, `src/components/ai-elements/reasoning.tsx`, `src/components/ai-elements/shimmer.tsx`, `src/components/ai-elements/suggestion.tsx`.
- Key files: Use these only for AI/chat surfaces and keep imports local to relevant components/routes.

**`src/lib/`:**
- Purpose: Cross-cutting infrastructure helpers that are not domain modules.
- Contains: HTTP helpers, source adapters, server provider adapters, observability client helpers, operator navigation, UI copy/status helpers, contract scanners.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/operator/navigation.ts`, `src/lib/ui/contract-scans.ts`, `src/lib/http/discovery-response.ts`.
- Subdirectories: `server/`, `observability/`, `operator/`, `ui/`, `http/`.

**`src/styles/`:**
- Purpose: Global styling and AE token implementation.
- Contains: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/answer.css`.
- Key files: `src/styles/tokens.css` implements `DESIGN.md`; `src/styles/globals.css` is loaded by `src/routes/__root.tsx`.

**`src/hooks/`:**
- Purpose: Shared React hooks.
- Contains: `src/hooks/use-mobile.ts`.
- Key files: Add generic hooks here only when they are not domain-specific.

**`src/future-phases/`:**
- Purpose: Parked phase-specific panels, readbacks, route drafts, and helpers for staged rollout work.
- Contains: `src/future-phases/04-owner-pending-protected-actions/`, `src/future-phases/05-paid-activation-money-rails/`, `src/future-phases/route-helpers.ts`.
- Key files: Active routes may import selected panels/readbacks from here when the phase is surfaced, as in owner billing routes.

**`convex/`:**
- Purpose: Convex runtime schema, function files, auth authorization, source-state adapters, and generated API.
- Contains: `convex/schema.ts`, `convex/authz.ts`, domain files like `convex/registry.ts`, `convex/inquiries.ts`, `convex/billing.ts`, store files like `convex/businessActionStore.ts`, generated files under `convex/_generated/`.
- Key files: `convex/schema.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/authz.ts`.
- Subdirectories: `convex/_generated/` is generated by Convex tooling.

**`tests/`:**
- Purpose: Automated verification for domains, routes, architecture guardrails, public copy, UI contracts, SEO, E2E, and deploy smoke.
- Contains: `tests/unit/`, `tests/integration/`, `tests/imports/`, `tests/copy/`, `tests/ui-contract/`, `tests/seo/`, `tests/types/`, `tests/e2e/`, `tests/deploy-smoke/`, `tests/fixtures/`, `tests/helpers/`.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/private-imports.test.ts`, `tests/ui-contract/public-language-copy.test.ts`, `tests/integration/agent-tools-api.test.ts`.

**`eval/`:**
- Purpose: Answer quality and gate evaluation harness.
- Contains: `eval/answer/promptfooconfig.yaml`, `eval/answer/providers/gate.mjs`, `eval/answer/assertions/*.mjs`, `eval/answer/scripts/run-case.ts`.
- Key files: `eval/answer/promptfooconfig.yaml`.

**`public/`:**
- Purpose: Static assets served by the app.
- Contains: `public/images/illustration/*.png`.
- Key files: `public/images/illustration/hero-victorian-house.png`, `public/images/illustration/agent-ledger.png`, `public/images/illustration/map-service-area.png`.

**`.planning/`:**
- Purpose: Product, phase, audit, graph, source-mining, and codebase planning artifacts.
- Contains: High-level docs like `.planning/PROJECT.md`, phase directories under `.planning/phases/`, audits under `.planning/audits/`, graphs under `.planning/graphs/`, and this map under `.planning/codebase/`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.agents/skills/` and `.codex/skills/`:**
- Purpose: Local skills and GSD/project workflow instructions.
- Contains: AE/local skills such as `.agents/skills/submit-qualified-inquiry/SKILL.md` and GSD skills such as `.codex/skills/gsd-map-codebase/SKILL.md`.
- Key files: Read `SKILL.md` first when a task explicitly invokes or clearly matches a skill.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start request middleware setup.
- `src/router.tsx`: Router factory over the generated route tree.
- `src/routes/__root.tsx`: Root document, metadata, CSS link, providers.
- `src/routeTree.gen.ts`: Generated route tree consumed by `src/router.tsx`.

**Configuration:**
- `package.json`: Scripts, dependencies, and `npm@11.5.1` package manager declaration.
- `package-lock.json`: npm lockfile.
- `vite.config.ts`: TanStack Start, Nitro, React, Tailwind, and path config.
- `tsconfig.json`: Strict TypeScript settings and aliases `@/*` and `~/*`.
- `tailwind.config.ts`: Tailwind content globs for `src/` and `tests/`.
- `vitest.config.ts`: Vitest config.
- `playwright.config.ts`: E2E Playwright config.
- `playwright.deploy-smoke.config.ts`: Deploy-smoke Playwright config.
- `.env.example`, `.env.local`: Environment files are present; do not read or quote secret values.

**Core Logic:**
- `src/modules/actions/index.ts`: Central action registry.
- `src/modules/common/action.ts`: Action type, `defineAction`, and agent descriptor shape.
- `src/modules/common/result.ts`: Shared `ModuleResult` union.
- `src/modules/common/ids.ts`: Branded ID types.
- `src/modules/common/stable-hash.ts`: Deterministic source hash helper.
- `src/lib/server/convex-source.ts`: Convex HTTP transport and function reference helpers.
- `src/lib/server/source-write-admission.ts`: TanStack server-side write-admission helpers.
- `src/modules/security/source-write-admission.ts`: Source-write signing and verification domain logic.

**Domain Modules:**
- `src/modules/business/public.ts`: Business, claim, status, and visibility contracts.
- `src/modules/catalog/public.ts`: Public catalog contracts and owner claim/publish exports.
- `src/modules/registry/public.ts`: Registry projections and public catalog API DTO contracts.
- `src/modules/discovery/public.ts`: Discovery manifests, `llms.txt`, sitemap, robots, and developer discovery exports.
- `src/modules/inquiries/public.ts`: Inquiry source-state commands and contracts.
- `src/modules/inquiries/inquiry.actions.ts`: Inquiry action definitions.
- `src/modules/inquiries/inquiry.functions.ts`: Public and owner inquiry server/source functions.
- `src/modules/answer/public.ts`: Answer synthesizer, gate, model, artifact, and chat exports.
- `src/modules/answer-thread/public.ts`: Answer-thread exports for sessions, turns, projections, and follow-up handling.
- `src/modules/billing/public.ts`: Billing source-state operations and projections.
- `src/modules/business-action/public.ts`: Business-action contracts and operations.
- `src/modules/protected-action/public.ts`: Contact follow-up protected-action contracts and operations.
- `src/modules/notification-outbox/public.ts`: Notification outbox commands and schema exports.
- `src/modules/observability/public.ts`: Audit, funnel, operation key, and operator control exports.
- `src/modules/security/public.ts`: Authz, duplicate, dispute, CSRF, admin, and suppression exports.
- `src/modules/seo/public.ts`: SEO and JSON-LD helpers.

**Routes:**
- `src/routes/index.tsx`: Home/ask-style public entry.
- `src/routes/ask.tsx`: Ask route.
- `src/routes/registry.tsx`: Public registry browse surface.
- `src/routes/$slug.tsx`: Public business listing detail page.
- `src/routes/$slug.inquiry.tsx`: Public qualified inquiry form.
- `src/routes/$slug.ucp.ts`: AE-hosted UCP fallback manifest.
- `src/routes/llms[.]txt.ts`: Assistant-readable text index.
- `src/routes/api.businesses.ts`: Public catalog list JSON.
- `src/routes/api.businesses.search.ts`: Public catalog search JSON.
- `src/routes/api.businesses.$slug.ts`: Public catalog detail JSON.
- `src/routes/api.agent.tools.ts`: Quiet assistant action list/invocation endpoint.
- `src/routes/api.answer.ts`: Stateless answer JSON/SSE route.
- `src/routes/api.answer.turn.ts`: Persistent answer-thread turn SSE route.
- `src/routes/api.chat.ts`: Chat-compatible streamed answer route.
- `src/routes/api.discovery.schema.ts`: Discovery schema/artifact route and route-parity snapshot builder.
- `src/routes/owner.*.tsx`: Owner status, inquiries, actions, business actions, billing pages.
- `src/routes/admin.*.tsx`: Admin claims, audit, inquiries, protected actions, business actions, monetization pages.
- `src/routes/developers.discovery.tsx`: Developer discovery readback surface.

**Convex:**
- `convex/schema.ts`: Composed schema from module table definitions.
- `convex/source_state.ts`: Runtime DB adapter and source-state load/persist helpers.
- `convex/sourceWriteAdmission.ts`: Convex-side source-write verification.
- `convex/authz.ts`: Clerk identity to owner/admin authority resolution.
- `convex/registry.ts`: Public catalog list/search/detail queries.
- `convex/inquiries.ts`: Inquiry submit/read/mutate queries and mutations.
- `convex/answerThreads.ts`: Answer thread and turn persistence.
- `convex/billing.ts`: Billing owner/admin/public queries and mutations.
- `convex/businessActions.ts`: Business-action queries and mutations.
- `convex/protectedActions.ts`: Protected contact follow-up queries and mutations.
- `convex/_generated/*`: Generated Convex API and data model files.

**Testing:**
- `tests/unit/`: Domain and helper unit tests.
- `tests/integration/`: API and route integration tests.
- `tests/imports/`: Architecture/import-boundary tests.
- `tests/copy/`: Public copy and overclaim tests.
- `tests/ui-contract/`: UI contract and layout/copy scans.
- `tests/seo/`: SEO and discovery route tests.
- `tests/types/`: Domain type-contract tests.
- `tests/e2e/`: Playwright user-flow tests.
- `tests/e2e/a11y/`: Accessibility E2E tests.
- `tests/deploy-smoke/`: Deployment smoke tests.
- `tests/helpers/`: Test helper ports and admissions.
- `tests/fixtures/`: Negative fixtures for guardrail tests.

**Documentation:**
- `AGENTS.md`: Always-on AE instructions and safe assistant contract.
- `PRODUCT.md`: Product thesis and trust contract.
- `DESIGN.md`: Visual source of truth.
- `.planning/`: Planning and phase documents.
- `.ui-craft/`: UI design memory and reports.

## Naming Conventions

**Files:**
- `PascalCase.tsx`: AE React components, for example `src/components/ae/layout/AeOperatorShell.tsx`.
- `lowercase.tsx`: Primitive UI components, for example `src/components/ui/button.tsx`.
- `kebab-case.ts` or domain names: Module directories and internal helpers, for example `src/modules/protected-action/internal/selected-action-contract.ts`.
- `<domain>.functions.ts`: TanStack server/source seam for a domain, for example `src/modules/inquiries/inquiry.functions.ts`.
- `<domain>.actions.ts`: Action declarations registered in `src/modules/actions/index.ts`, for example `src/modules/inquiries/inquiry.actions.ts`.
- `public.ts`: Supported module seam, for example `src/modules/catalog/public.ts`.
- `internal/*.ts`: Private module implementation, schemas, validators, projections, and command logic.
- `*.schema.ts`: Shared schema/type contracts, for example `src/modules/answer-thread/answer-thread.schema.ts`.
- `api.*.ts`: TanStack API routes, for example `src/routes/api.agent.tools.ts`.
- `$param`: TanStack dynamic route segment, for example `src/routes/$slug.tsx`.
- `[.]`: Escaped dot in route filename, for example `src/routes/llms[.]txt.ts`.
- `*.test.ts`: Vitest tests, for example `tests/unit/inquiries/inquiry-flow.test.ts`.
- `*.spec.ts`: Playwright specs, for example `tests/e2e/public-owner-ui.spec.ts`.

**Directories:**
- Domain directories under `src/modules/` are lowercase and usually singular or hyphenated, for example `src/modules/registry/`, `src/modules/business-action/`, `src/modules/protected-action/`.
- Component directories under `src/components/ae/` are grouped by surface or function, for example `src/components/ae/chat/`, `src/components/ae/forms/`, `src/components/ae/operator/`.
- Test directories group by test type first, then domain, for example `tests/unit/answer/` and `tests/integration/`.
- Convex files use domain names at top level, for example `convex/businessActions.ts` and `convex/businessActionStore.ts`.

**Special Patterns:**
- `src/routeTree.gen.ts`: Generated by TanStack Router; do not edit manually.
- `convex/_generated/*`: Generated by Convex; do not edit manually.
- `set*ForTests` ports: Test-only override seams, for example `src/modules/registry/registry.functions.ts` and `src/modules/answer-thread/answer-thread.functions.ts`.
- `createEmpty*SourceState`: Deterministic in-memory source-state builders for pure domain tests and local fallbacks, for example `src/modules/inquiries/public.ts`.
- `read*ThroughSource`: Server/source functions that call Convex or fallback source state, for example `src/modules/inquiries/inquiry.functions.ts`.
- `record*`, `read*`, `start*`, `submit*`: Command-style operation names in modules and Convex files.

## Where to Add New Code

**New Public Page:**
- Route: `src/routes/<route>.tsx`
- Page-specific components: `src/components/ae/<surface>/`
- Server/source reads: `src/modules/<domain>/<domain>.functions.ts`
- Domain contracts: `src/modules/<domain>/public.ts`
- Tests: `tests/integration/`, `tests/e2e/`, and `tests/ui-contract/` as appropriate.

**New API Endpoint:**
- Route handler: `src/routes/api.<name>.ts`
- Reusable response helpers: `src/lib/http/` when not route-specific.
- Domain logic: `src/modules/<domain>/public.ts` and `src/modules/<domain>/<domain>.functions.ts`
- Tests: `tests/integration/<name>-route.test.ts`

**New Domain Module:**
- Public seam: `src/modules/<domain>/public.ts`
- Private implementation: `src/modules/<domain>/internal/*.ts`
- Server/source functions: `src/modules/<domain>/<domain>.functions.ts`
- Actions if exposed as operations: `src/modules/<domain>/<domain>.actions.ts`
- Convex schema slice: `src/modules/<domain>/internal/schema.ts` or `src/modules/<domain>/internal/convex-schema.ts`
- Convex runtime: `convex/<domain>.ts`
- Tests: `tests/unit/<domain>/`, `tests/integration/`, `tests/types/`

**New Assistant-Callable Action:**
- Action definition: `src/modules/<domain>/<domain>.actions.ts`
- Shared action schema/runner: `src/modules/<domain>/<domain>.functions.ts`
- Registry import: `src/modules/actions/index.ts`
- Agent tools route remains: `src/routes/api.agent.tools.ts`
- Tests: `tests/unit/actions/` and `tests/integration/agent-tools-api.test.ts`

**New Source Write:**
- Browser/server validator: `src/modules/<domain>/<domain>.functions.ts`
- Admission builder: `src/lib/server/source-write-admission.ts`
- Domain admission scope: `src/modules/security/source-write-admission.ts`
- Convex verification: `convex/sourceWriteAdmission.ts`
- Convex mutation: `convex/<domain>.ts`
- Pure command: `src/modules/<domain>/internal/*.ts`
- Tests: `tests/unit/security/csrf-rate-limit.test.ts`, relevant `tests/unit/<domain>/`, and `tests/integration/`

**New Convex Table:**
- Table definition: `src/modules/<domain>/internal/schema.ts` or `src/modules/<domain>/internal/convex-schema.ts`
- Schema composition: `convex/schema.ts`
- Runtime queries/mutations: `convex/<domain>.ts`
- Generated API refresh: `convex/_generated/*` via Convex codegen.
- Tests: `tests/unit/convex/` and `tests/unit/schema/convex-schema.test.ts`

**New Owner/Admin Operator Surface:**
- Route: `src/routes/owner.<name>.tsx` or `src/routes/admin.<name>.tsx`
- Shell: `src/components/ae/layout/AeOperatorShell.tsx`
- Navigation: `src/lib/operator/navigation.ts`
- Panels/tables: `src/components/ae/operator/` or a domain-specific `src/components/ae/<domain>/`
- Server reads/mutations: `src/modules/<domain>/<domain>.functions.ts`
- Tests: `tests/integration/admin-runtime.test.ts`, route-specific integration tests, and Playwright specs when user-facing.

**New Public Listing/UI Component:**
- Listing surface: `src/components/ae/listing/`
- Public shell/layout: `src/components/ae/layout/`
- Form controls: `src/components/ae/forms/`
- Shared primitive: `src/components/ui/`
- Styles/tokens: `src/styles/tokens.css` and `src/styles/globals.css`; keep `DESIGN.md` as the source of truth.
- Tests: `tests/ui-contract/`, `tests/e2e/`, `tests/e2e/a11y/`

**New Answer/Chat Behavior:**
- Public seam exports: `src/modules/answer/public.ts` or `src/modules/answer-thread/public.ts`
- Synthesis/gating internals: `src/modules/answer/internal/`
- Thread orchestration: `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Chat components: `src/components/ae/chat/`
- API route: `src/routes/api.answer*.ts` or `src/routes/api.chat.ts`
- Tests: `tests/unit/answer/`, `tests/unit/answer-thread/`, `tests/integration/answer-turn-*.test.ts`, `eval/answer/`

**New Discovery Artifact:**
- Route: `src/routes/api.discovery.<name>.ts` or update `src/routes/api.discovery.schema.ts`
- Public manifest/file logic: `src/modules/discovery/public.ts` and `src/modules/discovery/internal/`
- Route parity snapshot: `src/routes/api.discovery.schema.ts`
- Tests: `tests/unit/discovery/`, `tests/integration/discovery-routes.test.ts`, `tests/seo/discovery-files.test.ts`

**New Utility:**
- Server-only source/transport helper: `src/lib/server/`
- HTTP response helper: `src/lib/http/`
- UI scan/copy/status helper: `src/lib/ui/`
- Operator navigation/helper: `src/lib/operator/`
- Domain-specific helper: prefer `src/modules/<domain>/internal/` over `src/lib/`.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router generated file-route tree.
- Generated: Yes.
- Committed: Present in working tree.

**`convex/_generated/`:**
- Purpose: Convex generated API, server helpers, and data-model types.
- Generated: Yes.
- Committed: Present in working tree.

**`src/future-phases/`:**
- Purpose: Parked implementation material for staged phase surfaces and route drafts.
- Generated: No.
- Committed: Present in working tree.

**`.planning/codebase/`:**
- Purpose: GSD codebase maps consumed by planning and execution commands.
- Generated: Manually written by GSD mapper agents.
- Committed: Planning artifacts intended for repo history when orchestrator commits them.

**`.agents/skills/`:**
- Purpose: Repo-local skill instructions and optional scripts/assets.
- Generated: No.
- Committed: Present in working tree.

**`.codex/skills/` and `.codex/gsd-core/`:**
- Purpose: GSD/Codex workflow skills, mapper templates, and command instructions.
- Generated: Installed tool resources.
- Committed: Present in working tree.

**`.ui-craft/`:**
- Purpose: UI craft memory, design decisions, surface notes, reports, and reviews.
- Generated: Tool-assisted design memory.
- Committed: Present in working tree.

**`public/images/illustration/`:**
- Purpose: Signature AE hand-drawn/illustration assets used by public UI.
- Generated: No.
- Committed: Present in working tree.

**`eval/answer/`:**
- Purpose: Answer-gate promptfoo evaluation harness and assertions.
- Generated: No.
- Committed: Present in working tree.

**`.env.example` and `.env.local`:**
- Purpose: Environment configuration files.
- Generated: No.
- Committed: `.env.example` may be tracked; `.env.local` is local configuration.
- Handling: Note existence only; do not read or quote contents.

---

*Structure analysis: 2026-06-30*
