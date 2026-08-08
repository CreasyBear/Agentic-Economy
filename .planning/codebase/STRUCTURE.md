# Codebase Structure

**Analysis Date:** 2026-08-08

## Directory Layout

```text
Agentic-Economy/
├── src/                         # TanStack Start application, routes, domain modules, UI, and shared libraries
│   ├── routes/                  # File-based page, API, OAuth, metadata, and operator routes
│   ├── modules/                 # Domain modules with public seams and private internals
│   ├── lib/                     # HTTP/server/client/UI/observability boundary helpers
│   ├── components/              # React application components and shared UI primitives
│   ├── styles/                  # Global and base CSS
│   ├── hooks/                   # Reusable React hooks
│   ├── content/                 # Brand and product copy constants
│   ├── start.ts                # TanStack Start server middleware bootstrap
│   ├── router.tsx              # Browser router factory
│   └── routeTree.gen.ts        # Generated TanStack Router route tree
├── convex/                      # Convex schema, functions, workers, adapters, and generated bindings
│   └── _generated/              # Convex-generated API/server/data-model bindings
├── tools/                       # External-agent CLI plus development and release/evidence tooling
│   ├── ae/                      # `ae` machine-surface CLI and command implementations
│   ├── dev/                     # Local smoke/evidence/development scripts
│   ├── release/                 # Release proofs, credentials, manifests, and hosted smoke scripts
│   └── tsconfig.json            # Tooling-specific TypeScript configuration
├── tests/                       # Unit, integration, browser, import, eval, SEO, and contract suites
│   ├── unit/                    # Isolated module and action tests
│   ├── integration/             # Route, Convex, registry, answer, and lifecycle integration tests
│   ├── e2e/                     # Local browser journeys and accessibility tests
│   ├── deploy-smoke/            # Hosted/deployment smoke specs
│   ├── helpers/                 # Test ports, fixtures, HTTP helpers, and provider test servers
│   ├── imports/                 # Public/private module and import-boundary checks
│   ├── eval/                    # Evaluation contracts and pipeline tests
│   ├── fixtures/                # Source-state and negative fixture trees
│   ├── seo/                     # SEO/agent metadata tests
│   ├── ui-contract/             # UI contract checks
│   ├── types/                   # Type-level contract tests
│   ├── setup/                   # Test environment setup modules
│   └── scripts/                 # Test-only verification scripts
├── eval/                        # Prompt/evaluation runners and report generation
├── docs/                        # Maintainer-facing documentation and architecture notes
├── .planning/                   # Project plans, ADRs, research, wayfinder maps, and codebase maps
│   └── codebase/                # This map plus maintained prompt/IA data-flow maps
├── public/                      # Static public assets, brand images, and favicon
├── examples/                    # Example provider/routing integrations
├── scripts/                     # Repository-level audit and maintenance scripts
├── vendor/                      # Vendored protocol/kernel source
├── .github/                     # CI workflow definitions
├── .agents/                     # Project agent rules and installed skill links
├── .claude/                     # Project assistant settings and skill links
├── .ae-cli/                     # CLI-local state/configuration area
├── output/                      # Generated evaluation/release/playwright output (ignored)
├── outputs/                     # Additional generated workflow output (ignored)
├── test-results/                # Playwright test artifacts (ignored)
├── playwright-report/           # Playwright HTML report and traces (ignored)
├── .convex/                     # Local Convex state/cache (ignored)
├── .vercel/                     # Vercel project/output metadata (ignored)
├── package.json                 # Scripts, runtime metadata, and dependencies
├── package-lock.json            # npm lockfile
├── vite.config.ts               # Vite/TanStack Start/Nitro build configuration
├── tsconfig.json                # Root TypeScript configuration
├── vitest.config.ts             # Vitest configuration
├── playwright.config.ts         # Browser test configuration
├── components.json              # shadcn/Radix component configuration
├── .env.example                 # Documented environment variable shape
├── convex/convex.config.ts      # Convex component configuration
├── AGENTS.md                    # Repository/Convex operating guidance
├── CLAUDE.md                    # Project assistant guidance
└── RULES.MD                     # Lean implementation and evidence rules
```

## Directory Purposes

**`src/`:**
- Purpose: Application runtime and domain-facing code.
- Contains: TypeScript, TSX, CSS, route definitions, module contracts, browser components, and server/client support libraries.
- Key files: `src/start.ts` (server middleware), `src/router.tsx` (browser router), `src/routes/__root.tsx` (root document/provider shell), and `src/routeTree.gen.ts` (generated route registration).
- Subdirectories: `routes/`, `modules/`, `lib/`, `components/`, `styles/`, `hooks/`, and `content/` are the main ownership boundaries.

**`src/routes/`:**
- Purpose: File-based TanStack Start route declarations.
- Contains: Page routes such as `index.tsx`, `t.new.tsx`, `t.$threadId.tsx`, `$slug.tsx`, and `claim.tsx`; API routes under `api.*`; OAuth/discovery routes; operator routes under `_operator/`; and metadata routes such as `sitemap[.]xml.ts` and `robots[.]txt.ts`.
- Key files: `src/routes/index.tsx` (buyer ask), `src/routes/api.answer.turn.ts` (answer SSE), `src/routes/api.v1.requests.ts` (agent request entry), `src/routes/api.v1.services.ts` (registry service list), and `src/routes/api.$.ts` (API catch-all).
- Subdirectories: `_operator/` contains operator/admin/owner surfaces; `[.]well-known/` contains OAuth/UCP/protocol discovery documents.

**`src/modules/`:**
- Purpose: Domain logic and reusable application contracts.
- Contains: `public.ts` module seams, `internal/` implementation/schema folders, action definitions, deterministic command machines, projections, adapters, and explicit ports.
- Key modules: `capability-supply/`, `capability-execution/`, `capability-contract/`, `customer-request/`, `answer-thread/`, `answer/`, `registry/`, `catalog/`, `business/`, `inquiries/`, `action-invocation/`, `money/`, `work-tree/`, `security/`, `observability/`, and `common/`.
- Subdirectories: Domain-specific nested areas include `src/modules/customer-request/application/`, `v2-write/`, `v2-read/`, and `route-execution/`; `src/modules/capability-supply/internal/` contains admission/publication/eligibility/graph/operation-ledger submodules.

**`src/modules/common/`:**
- Purpose: Small cross-domain primitives that do not own a business workflow.
- Contains: Canonical digest/stable hashing, JSON and text sanitization, identifiers, result helpers, timeout, CSRF matching, and Convex literal helpers.
- Key files: `src/modules/common/action.ts`, `canonical-digest.ts`, `stable-hash.ts`, `safe-json-stringify.ts`, and `unique-sorted.ts`.
- Subdirectories: None; shared primitives are kept flat.

**`src/lib/`:**
- Purpose: Runtime boundary helpers and presentation support outside domain ownership.
- Contains: `server/` Convex/auth/request/response adapters, `http/` protocol helpers, `client/` browser auth helpers, `ui/` presentation projections/formatters, `operator/` operator helpers, `claim/` claim helpers, `observability/` Sentry/PostHog adapters, and `errors.ts`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/problem.ts`, `src/lib/server/bounded-request-body.ts`, `src/lib/server/method-guard.ts`, `src/lib/server/customer-request-agent-api.ts`, and `src/lib/errors.ts`.
- Subdirectories: `server/`, `http/`, `client/`, `ui/`, `operator/`, `claim/`, `dev/`, and `observability/` separate environment/boundary responsibilities.

**`src/components/`:**
- Purpose: React view composition.
- Contains: Product-specific components under `ae/`, shared primitives under `ui/`, and AI/streaming presentation components under `ai-elements/`.
- Key files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/chat/AeThreadTurnStreamSection.tsx`, and the `src/components/ui/` controls used by page routes.
- Subdirectories: `ae/` is grouped by surface (`chat/`, `artifacts/`, `customer-request/`, `inquiries/`, `plan/`, `status/`, `supply/`); `ui/` and `ai-elements/` are reusable component families.

**`convex/`:**
- Purpose: Durable Convex function adapters and schema assembly.
- Contains: Public/internal queries, mutations, actions, scheduled workers, row mappers, lifecycle workers, schema fragments, tests, and generated bindings.
- Key files: `convex/schema.ts` (central schema spread), `convex/capabilitySupplyOperations.ts` (operation registry queries), `convex/customerRequestApplication.ts` (request actions), `convex/customerRequestRouteTransportWorker.ts` (route transport worker), `convex/answerThreads.ts` (answer persistence), `convex/moneyLedger.ts` (money persistence), and `convex/curatedProviders.ts` (curated seed).
- Subdirectories: `_generated/` is generated by Convex; `lib/` contains Convex-local helpers. Domain schema bundles live in `src/modules/<domain>/internal/` and are imported by `convex/schema.ts`.

**`tools/`:**
- Purpose: Operational, external-agent, development, release, and evidence tooling that is not part of the browser bundle.
- Contains: TypeScript/JavaScript scripts, CLI commands, manifests, smoke runners, cleanup wrappers, and release proofs.
- Key files: `tools/ae/cli.ts`, `tools/ae/lib/`, `tools/ae/commands/`, `tools/dev/local-dev.mjs`, `tools/dev/run-with-cleanup.mjs`, and `tools/release/verify-operation-market-proof.ts`.
- Subdirectories: `ae/commands/` defines CLI commands; `ae/lib/` contains argument/output/request helpers; `dev/` holds local/evidence tooling; `release/` holds release-only proof and hosted smoke tooling.

**`tests/`:**
- Purpose: Automated verification organized by evidence boundary and execution mode.
- Contains: Unit tests, integration tests, browser tests, deployment smoke tests, import scans, type/SEO/UI contracts, fixtures, and test environment setup.
- Key files: `tests/integration/answer-turn-session-auth.test.ts`, `tests/integration/customer-request-v2-application-path.test.ts`, `tests/unit/capability-execution/`, and `tests/imports/private-imports.test.ts`.
- Subdirectories: `unit/`, `integration/`, `e2e/`, `deploy-smoke/`, `helpers/`, `imports/`, `eval/`, `fixtures/`, `seo/`, `ui-contract/`, `types/`, `setup/`, and `scripts/` each carry a distinct test contract.

**`eval/`:**
- Purpose: Model, answer, engine, parity, consumer, quality, and product-foundry evaluation harnesses.
- Contains: Evaluation runners, Promptfoo configuration, scoring/support libraries, tool-call harnesses, and generated reports under `output/`.
- Key files: `eval/answer/`, `eval/engine/run-evaluation.mjs`, `eval/parity/`, and `eval/quality/`.
- Subdirectories: `answer/`, `engine/`, `consumer/`, `product-foundry/`, `quality/`, `parity/`, and `toolcall/` organize evaluation families.

**`.planning/`:**
- Purpose: Product/engineering planning and source-grounded project knowledge.
- Contains: `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, ADRs, research, records, wayfinder maps, phase plans, and codebase maps.
- Key files: `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/IA-DATA-FLOW.md`, `.planning/wayfinder/MAP-engine.md`, `.planning/wayfinder/MAP-framework.md`, and `.planning/wayfinder/JOURNEYS.md`.
- Subdirectories: `codebase/`, `research/`, `adr/`, `records/`, `wayfinder/`, `phases/`, and `scopes/` have separate planning roles.

**`docs/`:**
- Purpose: Maintainer-facing documentation not tied to a phase artifact.
- Contains: Architecture and agent documentation.
- Key files: `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`.
- Subdirectories: `architecture/` contains source-authority decisions.

**`public/`, `examples/`, `scripts/`, and `vendor/`:**
- Purpose: Static assets, illustrative integrations, repository scripts, and vendored protocol/kernel code respectively.
- Contains: `public/brand/` and `public/images/`; `examples/routing-provider/`; `scripts/audit-action-surfaces.mjs`; and `vendor/handshake-protocol-kernel/`.
- Key files: `public/favicon.svg`, `examples/routing-provider/`, and `scripts/audit-action-surfaces.mjs`.
- Subdirectories: Each is organized by its single top-level purpose; they are not substitutes for `src/modules/` domain ownership.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start server middleware and request bootstrap.
- `src/router.tsx`: Browser router factory using `src/routeTree.gen.ts`.
- `src/routes/index.tsx`: Buyer ask/search page and root loader.
- `src/routes/api.answer.turn.ts`: Public answer-turn POST/SSE boundary.
- `src/routes/api.v1.requests.ts`: Authenticated external-agent Customer Request entry.
- `convex/schema.ts`: Convex schema root.
- `tools/ae/cli.ts`: External-agent CLI executable.

**Configuration:**
- `package.json`: Scripts, dependencies, package metadata, Node/npm requirements.
- `tsconfig.json`: Root TypeScript compiler settings and path aliases.
- `tools/tsconfig.json`: Tooling-specific TypeScript inclusion/settings.
- `vite.config.ts`: Vite, TanStack Start, Nitro, and deployment build settings.
- `vitest.config.ts`: Vitest setup and test environment configuration.
- `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.paid-operation.config.ts`: Browser and hosted smoke configurations.
- `components.json`: Shared UI component configuration.
- `.env.example`: Documented environment variable names; local secret values live outside source.
- `convex/convex.config.ts` and `convex/auth.config.ts`: Convex component/auth configuration.

**Core Logic:**
- `src/modules/customer-request/`: Request interpretation, compilation, plan, authority, route execution, and agent contracts.
- `src/modules/capability-supply/`: Capability admission, publication, operation registry projection, readiness, and supply lifecycle.
- `src/modules/capability-execution/`: DB-driven keyless operation descriptors and fail-closed HTTP execution.
- `src/modules/answer-thread/` and `src/modules/answer/`: Answer turn orchestration, tool calls, evidence, gating, persistence, and streaming projections.
- `src/modules/registry/`: Service/endpoint projections, search, and registry action contracts.
- `src/modules/common/action.ts` and `src/modules/actions/index.ts`: Shared action contract and central action registry.
- `src/lib/server/convex-source.ts`: Typed bridge from server boundaries to Convex functions.
- `convex/`: Durable function adapters, workers, and row-level persistence.

**Testing:**
- `tests/unit/`: Domain, action, schema, and pure helper tests.
- `tests/integration/`: Route, Convex, registry, answer, customer-request, and lifecycle tests.
- `tests/e2e/`: Browser journeys and accessibility tests.
- `tests/deploy-smoke/`: Real deployment/hosted smoke specifications.
- `tests/imports/`: Module boundary, retirement, and source-completeness checks.
- `tests/helpers/`: Reusable in-process ports, fixtures, HTTP clients, and provider contract servers.
- `eval/` and `tests/eval/`: Evaluation runners and evaluation-specific contracts.

**Documentation:**
- `.planning/codebase/ARCHITECTURE.md`: Conceptual architecture and lifecycle map.
- `.planning/codebase/STRUCTURE.md`: This physical layout map.
- `.planning/codebase/PROMPT-DATA-FLOW.md`: Maintained prompting/AI-harness/data-flow map.
- `.planning/codebase/IA-DATA-FLOW.md`: Maintained route/schema/information-architecture map.
- `.planning/wayfinder/`: Maintainer journey and subsystem maps.
- `docs/architecture/`: Stable architecture decisions such as Customer Request source authority.

## Naming Conventions

**Files:**
- Domain and utility files generally use lowercase kebab-case, for example `src/modules/customer-request/route-plan-generation.ts` and `src/lib/server/customer-request-agent-api.ts`.
- Module role suffixes communicate ownership: `public.ts` for public exports, `*.functions.ts` for function/port adapters, `*.actions.ts` for typed actions, `*.schema.ts` or `internal/*schema.ts` for validators/table bundles, and `*.projection.ts` for public/readback projections.
- React component files use PascalCase for product components such as `AeChat.tsx`; reusable UI primitives use lowercase kebab-case such as `src/components/ui/button.tsx`.
- Tests use descriptive names ending in `.test.ts` or browser specs ending in `.spec.ts`; deployment browser specs live under `tests/deploy-smoke/`.
- TanStack route filenames encode URL segments: `$slug`, `$threadId`, `_operator`, `api.*`, and escaped literal dots such as `sitemap[.]xml.ts`.

**Directories:**
- Feature/domain directories use lowercase kebab-case: `src/modules/capability-supply/`, `src/components/ae/customer-request/`, and `tools/release/`.
- `internal/` marks private module implementation/schema areas; consumers should import the module's `public.ts` instead.
- Route layout directories use TanStack conventions: `_operator/` for a layout/private surface and `[.]well-known/` for a literal URL segment.
- Test directories describe execution/evidence mode (`unit`, `integration`, `e2e`, `deploy-smoke`, `imports`, `fixtures`, and `seo`).

**Special Patterns:**
- `public.ts` is the module export seam; `index.ts` is used for focused nested barrels such as `src/modules/customer-request/v2-write/index.ts`.
- `convex/_generated/` and `src/routeTree.gen.ts` are generated bindings; the route-tree header explicitly says not to edit it, and Convex generated headers point to `npx convex dev` for regeneration.
- `src/routes/` is the source of file-based route declarations; `src/routeTree.gen.ts` is generated from it.
- `.planning/codebase/PROMPT-DATA-FLOW.md` and `.planning/codebase/IA-DATA-FLOW.md` are maintained specialized maps and should be linked/re-read, not hand-edited as part of routine feature work.
- Root `.gitignore` excludes `.convex/`, `.vercel/`, `output/`, `outputs/`, `test-results/`, `playwright-report/`, coverage, and other generated/local state; those directories are operational artifacts rather than source locations.

## Where to Add New Code

**New Feature:**
- Primary code: Add or extend `src/modules/<domain>/` with a public contract in `public.ts`, private implementation under the module, and a route/action adapter only where a surface needs it.
- Tests: Add domain tests under `tests/unit/<domain>/` and boundary/Convex tests under `tests/integration/`; add browser coverage under `tests/e2e/` when the feature is user-visible.
- Config if needed: Update the nearest existing config (`vite.config.ts`, `convex/convex.config.ts`, or `.env.example`) only when the feature truly changes runtime/build requirements.

**New Component/Module:**
- Implementation: `src/modules/<domain>/` for domain behavior; `src/components/ae/<surface>/` for product UI; `src/components/ui/` only for reusable primitives.
- Types: Keep domain types in the owning module, preferably behind `src/modules/<domain>/public.ts`; keep UI-only types beside the component.
- Tests: Mirror the owning boundary in `tests/unit/`, `tests/integration/`, or `tests/e2e/`; use `tests/helpers/` for reusable ports/fixtures rather than embedding test infrastructure in production modules.

**New Route/Command:**
- Definition: Add a file under `src/routes/` following TanStack file-route naming; add explicit handlers for supported HTTP methods and a method guard for unsupported methods.
- Handler: Put request parsing/auth/protocol projection in `src/lib/server/`; call a module action or public function rather than putting business rules in the route file. For CLI commands, add a command under `tools/ae/commands/` and register it in `tools/ae/cli.ts`.
- Tests: Add route integration coverage under `tests/integration/`, browser coverage under `tests/e2e/`, or CLI coverage under `tests/unit/`/`tests/integration/` as appropriate.

**Utilities:**
- Shared helpers: Put domain-neutral deterministic primitives in `src/modules/common/`; put HTTP/server/client concerns in the matching `src/lib/<area>/` namespace.
- Type definitions: Keep types beside their owner and re-export only through the owning `public.ts`; use `src/lib/errors.ts` for shared protocol problem types rather than creating a second error vocabulary.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router route registry.
- Source: Generated from file routes under `src/routes/` by the TanStack Router/Vite integration; its header says it will be overwritten and should not be manually changed.
- Committed: Present in the current tree and not excluded by the root `.gitignore`; treat it as generated output and modify `src/routes/` instead.

**`convex/_generated/`:**
- Purpose: Generated Convex API, server, schema, and data-model bindings.
- Source: Convex code generation; `convex/_generated/server.d.ts` directs maintainers to `npx convex dev`.
- Committed: Present in the current tree; generated files are not hand-authored application logic.

**`.convex/`, `.vercel/`, `output/`, `outputs/`, `test-results/`, and `playwright-report/`:**
- Purpose: Local deployment state, generated build/evaluation/release output, and browser artifacts.
- Source: Convex/Vercel/Playwright/evaluation/dev tooling.
- Committed: No for the root operational/artifact directories according to `.gitignore`; do not place source modules or durable product contracts there.

**`.planning/codebase/`:**
- Purpose: Source-grounded repository maps.
- Source: Maintained manually from current repository code and workflow artifacts.
- Committed: The map documents are project artifacts; `PROMPT-DATA-FLOW.md` and `IA-DATA-FLOW.md` are maintained specialized maps and are intentionally left unchanged by this refresh.

---

*Structure analysis: 2026-08-08*
*Update when directory structure changes*
