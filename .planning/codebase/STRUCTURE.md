<!-- refreshed: 2026-08-15 -->
# Codebase Structure

**Analysis Date:** 2026-08-15

## Directory Layout

```text
Agentic-Economy/
├── .agents/skills/          # Repository-local AI/UI/Convex workflow guides
├── .github/workflows/       # CI and release-gate definitions
├── .planning/               # Product charter, roadmap, ADRs, research, maps, codebase docs
├── convex/                  # Convex source functions, schema composition, workers, schedules
│   └── _generated/          # Generated Convex API/model bindings; do not edit
├── docs/                    # Maintained protocol, architecture, operations, and integration docs
├── eval/                    # Answer/model evaluation cases, evaluators, reporters
├── public/                  # Static browser assets and public discovery files
├── scripts/                 # Verification, fixture, release, audit, and maintenance automation
├── src/
│   ├── components/          # React presentation primitives and product features
│   ├── content/             # Centralized brand/product copy
│   ├── lib/                 # Host-wide adapters, HTTP, server, auth, observability utilities
│   ├── modules/             # Domain/application modules and public ownership boundaries
│   ├── routes/              # TanStack file routes and HTTP endpoint adapters
│   ├── styles/              # Global CSS, design tokens, Tailwind layers
│   ├── routeTree.gen.ts     # Generated TanStack route tree; do not edit
│   ├── router.tsx           # Router construction
│   └── start.ts             # TanStack Start middleware/bootstrap
├── tests/
│   ├── e2e/                 # Playwright browser and public-flow tests
│   ├── helpers/             # Shared fixtures, fake providers, request/test builders
│   ├── imports/             # Architecture and dependency-boundary guardrails
│   ├── integration/         # Cross-module/source/runtime contract tests
│   ├── seo/                 # Discovery, canonical URL, metadata tests
│   └── unit/                # Module-focused deterministic behavior tests
├── tools/ae/                # External-agent CLI and command implementation
├── AGENTS.md                # Repository instructions for coding agents
├── package.json             # Scripts and dependency manifest
├── vite.config.ts           # Vite/TanStack Start/Nitro/Sentry build configuration
├── vitest.config.ts         # Unit/integration test configuration
├── playwright.config.ts     # End-to-end test and dev-server configuration
└── tsconfig.json            # Strict TypeScript and `@/*` alias configuration
```

## Directory Purposes

**`.planning/`:**
- Purpose: Persistent product/program context and generated repository maps.
- Contains: `PROJECT.md`, `ROADMAP.md`, `STATE.md`, ADRs, research, wayfinder maps, and `codebase/` analyses.
- Key files: `.planning/PROJECT.md`, `.planning/adr/`, `.planning/codebase/`.

**`convex/`:**
- Purpose: Convex-facing persistence, transactional source authority, actions, workers, auth configuration, and cron schedules.
- Contains: One function module per source aggregate/worker, `schema.ts`, `convex.config.ts`, `http.ts`, `crons.ts`.
- Key files: `convex/schema.ts`, `convex/convex.config.ts`, `convex/answerThreads.ts`, `convex/capabilityOperationInvocations.ts`, `convex/moneyLedger.ts`.

**`docs/`:**
- Purpose: Maintained architecture, protocol, runbook, integration, and release documentation.
- Contains: Markdown grouped by subsystem such as `docs/agents/`, `docs/architecture/`, `docs/operations/`, `docs/protocols/`, `docs/testing/`.
- Key files: `docs/README.md`, `docs/architecture/`, `docs/protocols/`.

**`eval/`:**
- Purpose: Repeatable quality evaluation for answer/model behavior separate from product tests.
- Contains: Case definitions, datasets, evaluator logic, and reporting utilities.
- Key files: `eval/answer/lib/cases.ts`, `eval/answer/lib/evaluators.ts`.

**`scripts/`:**
- Purpose: Repository automation that is not shipped as application runtime.
- Contains: Contract scans, architecture checks, release gates, fixture validation, schema parity checks, local utilities.
- Key files: Discover the supported entry through `package.json` scripts rather than invoking a file by assumption.

**`src/components/`:**
- Purpose: React presentation and interaction code.
- Contains: Product components under `ae/`, shared primitives under `ui/`, AI stream primitives under `ai-elements/`.
- Key files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/artifacts/`, `src/components/ui/`.

**`src/lib/`:**
- Purpose: Application-wide host adapters and infrastructure utilities that are not a single domain's source of truth.
- Contains: Server clients, middleware helpers, HTTP/problem utilities, authentication adapters, observability, deployment helpers.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/mcp-api.ts`, `src/lib/errors.ts`.

**`src/modules/`:**
- Purpose: Domain/application ownership boundaries.
- Contains: Public contracts, deterministic decisions, validators, actions, server seams, Convex table maps, and internal implementation.
- Key files: `src/modules/common/action.ts`, `src/modules/actions/index.ts`; each module's `public.ts`, `server.ts`, `*.functions.ts`, and `internal/`.

**`src/routes/`:**
- Purpose: TanStack Start route adapters for pages and HTTP endpoints.
- Contains: React file routes, server handlers, webhooks, OAuth, discovery files, API catch-all.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/mcp.ts`, `src/routes/api.$.ts`.

**`tests/`:**
- Purpose: Verify deterministic units, system integration, public browser behavior, SEO/discovery, and architecture constraints.
- Contains: `unit/`, `integration/`, `e2e/`, `imports/`, `seo/`, and shared `helpers/`.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/capability-contract-boundaries.test.ts`, `tests/e2e/landing-answer.spec.ts`.

**`tools/ae/`:**
- Purpose: Operate as a real external agent consumer of public AE contracts.
- Contains: CLI dispatcher, commands, OAuth/token persistence, HTTP projections, help.
- Key files: `tools/ae/cli.ts`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start middleware and request bootstrap.
- `src/router.tsx`: Client/server router factory.
- `src/routes/__root.tsx`: Root HTML/providers/error boundary.
- `src/routes/index.tsx`: Public landing page.
- `src/routes/api.answer.turn.ts`: Streaming answer-turn API.
- `src/routes/mcp.ts`: MCP Streamable HTTP endpoint.
- `tools/ae/cli.ts`: External-agent command-line entry.
- `convex/http.ts`: Convex HTTP endpoint router.
- `convex/crons.ts`: Scheduled maintenance entry.

**Configuration:**
- `package.json`: Commands and dependency declarations.
- `vite.config.ts`: Build/dev framework integration and deployment preset.
- `tsconfig.json`: Compiler, strictness, project scope, and `@/*` alias.
- `vitest.config.ts`: Unit/integration test discovery and environment.
- `playwright.config.ts`: Browser projects and test web server.
- `convex/convex.config.ts`: Convex component and environment declarations.
- `convex/auth.config.ts`: Clerk JWT provider configuration.
- `.env.example`: Environment-name documentation only; runtime secret files are not source.

**Core Logic:**
- `src/modules/common/action.ts`: Canonical action contract.
- `src/modules/actions/index.ts`: Explicit cross-surface action registry.
- `src/modules/capability-contract/public.ts`: Capability schema and semantic contract.
- `src/modules/capability-supply/public.ts`: Operation identity and supply boundary.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Answer turn orchestration.
- `src/modules/harness/run-loop.ts`: Generic phased execution harness.
- `src/modules/capability-execution/operation-invoke.ts`: Shared Market Operation invocation application service.
- `src/modules/customer-request/public.ts`: Customer Request public domain contract.
- `src/modules/money/public.ts`: Money public contract and service seams.

**Persistence and Durable Execution:**
- `convex/schema.ts`: Composition root for all domain-owned Convex tables.
- `src/modules/*/internal/convex-schema.ts`: Table ownership near domain semantics.
- `convex/answerThreads.ts`: Answer thread transactional functions.
- `convex/capabilityOperationInvocations.ts`: Operation invocation state and admission.
- `convex/capabilityOperationInvocationWorker.ts`: Node worker for provider dispatch/reconciliation.
- `convex/customerRequestRouteExecution.ts`: Customer route-execution source state.
- `convex/customerRequestRouteTransportWorker.ts`: Durable route transport.
- `convex/moneyLedger.ts`: Financial reservations, ledger, usage, and reconciliation.
- `convex/sourceWriteAdmission.ts`: Nonce-backed source-write verification.

**Testing:**
- `tests/unit/<module>/`: Unit tests colocated by module name.
- `tests/integration/`: Cross-boundary and Convex/source integration.
- `tests/imports/`: Import/vocabulary/route architecture constraints.
- `tests/e2e/`: Playwright public and operator journeys.
- `tests/helpers/`: Shared test seams and external-service fixtures.
- `eval/answer/`: Model/answer quality evaluation, not correctness tests.

## Naming Conventions

**Files:**
- Use kebab-case for domain implementation and utility files: `operation-invoke.ts`, `source-write-admission.ts`.
- Use PascalCase for React components: `AeGenerativeAnswer.tsx`, `RootWorkTreeLoop.tsx`.
- Use TanStack file-route syntax under `src/routes/`: `api.v1.operations.$operationRef.ts`, `_operator/owner.supply.tsx`, `t.$threadId.tsx`.
- Use `public.ts` for a module's browser-safe/domain-facing contract and `server.ts` for server-only composition or APIs.
- Use `*.functions.ts` for typed source-function/transport seams and `*.actions.ts` for canonical action definitions.
- Use `internal/convex-schema.ts` for domain-owned table definitions that are spread into `convex/schema.ts`.
- Use `*.server.ts` for Node/server-only implementation and `*.test.ts`/`*.spec.ts` for Vitest/Playwright.
- Treat `*.gen.ts` and `convex/_generated/` as generated.

**Directories:**
- Use kebab-case domain names under `src/modules/`: `answer-thread`, `capability-supply`, `customer-request`.
- Put private module implementation in `internal/`; put application orchestration in `application/` when the module has a substantial use-case layer.
- Mirror domain names in `tests/unit/` for navigability.
- Group product components by user surface under `src/components/ae/`.

**Types and Functions:**
- Use PascalCase for types, interfaces, classes, Zod-inferred domain values, and React components.
- Use camelCase for functions and values.
- End Zod schemas with `Schema`; end Convex validators with `Value`.
- Prefix Convex-generated references with `api` or `internal` only through `convex/_generated/api`.
- Name discriminated-union variants with stable lowercase `kind`/`status` literals; handle all variants exhaustively.
- Name canonical actions by dot-separated IDs such as `registry.operations.search`; derive MCP names through `mcpToolName` in `src/modules/actions/index.ts`.
- Use `Id<'tableName'>` for Convex document IDs and avoid untyped string IDs at source boundaries.

## Where to Add New Code

**New Domain Capability:**
- Primary code: Create `src/modules/<domain>/public.ts`; add private decisions under `src/modules/<domain>/internal/`; add `server.ts` only for server-only composition.
- Source state: Define tables in `src/modules/<domain>/internal/convex-schema.ts`, spread them from `convex/schema.ts`, and implement adapters in `convex/<domain>.ts`.
- Tests: Add deterministic tests under `tests/unit/<domain>/`, cross-source behavior under `tests/integration/`, and an import-boundary test under `tests/imports/` when ownership matters.

**New Agent-Callable Action:**
- Definition: Add `<domain>.actions.ts` in the owning module using `defineAction` from `src/modules/common/action.ts`.
- Registry: Import and list it explicitly in `src/modules/actions/index.ts`; action IDs must remain unique.
- Surface: Project the registered action through MCP/HTTP/Answer/CLI rather than defining a second contract.
- Tests: Cover schema/effect/authority metadata and each exposed surface under `tests/unit/actions/`, module tests, and integration tests.

**New Page or HTTP API:**
- Page/API: Add a file route under `src/routes/`; let TanStack regenerate `src/routeTree.gen.ts`.
- UI: Add product presentation under `src/components/ae/<surface>/`; reuse primitives from `src/components/ui/`.
- Boundary: Validate and admit at the route, then delegate to module public/application/server seams.
- Tests: Add route contract tests in `tests/integration/`; add browser flow in `tests/e2e/` when user-visible.

**New Convex Query/Mutation/Action:**
- Rules: Follow `convex/_generated/ai/guidelines.md`.
- Contract: Put validators and deterministic business decisions in the owning `src/modules/<domain>/` module.
- Function: Register public or internal functions in `convex/<domain>.ts`, with argument and return validators.
- Access: Use indexed queries; avoid unbounded `.collect()`; call internal work with `internal.*`; put `"use node"` actions in a separate file from queries/mutations.
- Transport: Expose a typed source port through `src/modules/<domain>/*.functions.ts` or a server adapter, not direct route imports.

**New Background Operation:**
- Prepare: Persist deterministic identity, idempotency, authority, and lease/claim state in a mutation.
- Execute: Add a Node action/worker in `convex/` and use workpool/workflow when durability or concurrency control is required.
- Finalize: Commit evidence and terminal/reconciliation state transactionally.
- Tests: Cover replay, stale lease/fence, timeout, unknown outcome, cancellation, and reconciliation.

**New Shared Utility:**
- Domain-specific: Keep it in the owning module's `internal/`.
- Cross-domain semantic primitive: Add it to `src/modules/common/` only when multiple modules genuinely share the concept.
- Host/infrastructure utility: Add it to `src/lib/` or `src/lib/server/`.
- UI primitive: Add it to `src/components/ui/`.

## Special Directories

**`convex/_generated/`:**
- Purpose: Generated Convex types and function references.
- Generated: Yes.
- Committed: Yes; regenerate through Convex tooling and never hand-edit.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router route manifest and type registration.
- Generated: Yes.
- Committed: Yes; regenerate from `src/routes/` and never hand-edit.

**`.planning/codebase/`:**
- Purpose: Generated/current codebase maps for planning agents and maintainers.
- Generated: Agent-maintained.
- Committed: Project-dependent; treat as documentation, not runtime source.

**`public/`:**
- Purpose: Static assets copied to the deployed web root.
- Generated: Mixed; most files are authored assets.
- Committed: Yes.

**`test-results/`, `playwright-report/`, `coverage/`, `dist/`:**
- Purpose: Local/build/test output.
- Generated: Yes.
- Committed: No.

**`.ae-cli/`:**
- Purpose: Local AE CLI session/cache state.
- Generated: Yes.
- Committed: No; never treat it as application source or durable product authority.

**`.env*`:**
- Purpose: Local/deployment environment configuration.
- Generated: Environment-specific.
- Committed: Only the redacted documentation file `.env.example`; never commit or inspect secret-bearing variants.

---

*Structure analysis: 2026-08-15*
