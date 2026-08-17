# Codebase Structure

**Analysis Date:** 2026-08-17

## Directory Layout

```
Agentic-Economy/
├── convex/                 # Convex backend: schema, mutations, actions, workers, ports
│   ├── schema.ts           # Composed table definitions from src/modules/*/internal
│   ├── capabilityOperationInvocations.ts
│   ├── capabilityOperationInvocationWorker.ts
│   └── *Ports.ts           # Dependency injection adapters per domain
├── src/
│   ├── routes/             # TanStack file routes (pages + API handlers)
│   ├── modules/            # Domain modules (market kernel + proving ground)
│   ├── lib/                # Shared client/server utilities
│   ├── components/         # React UI components
│   ├── content/            # Copy and static content
│   ├── hooks/              # React hooks
│   ├── styles/             # Global CSS
│   ├── router.tsx          # TanStack router factory
│   └── start.ts            # TanStack Start middleware + boot
├── tools/
│   ├── ae/                 # AE CLI (external agent terminal)
│   ├── dev/                # Local dev helpers, papercut, smokes
│   └── release/            # Release gates, hosted smokes, manifest verify
├── tests/
│   ├── unit/               # Vitest unit tests (mirrors src/modules layout)
│   ├── integration/        # Cross-module + convex integration tests
│   ├── imports/            # Import boundary + architecture enforcement
│   ├── e2e/                # Playwright end-to-end
│   └── ui-contract/        # UI contract tests
├── eval/                   # Promptfoo / Braintrust eval configs
├── docs/                   # Human architecture notes (sparse)
├── .planning/              # GSD program state, phases, codebase maps
├── .agents/skills/         # Project-local agent skills (Convex, UI, etc.)
├── vendor/                 # Vendored protocol kernels
├── public/                 # Static assets
├── package.json            # Scripts, dependencies, `ae` CLI entry
├── vite.config.ts          # TanStack Start + Vite build
├── tsconfig.json           # `@/*` path alias → `src/*`
└── AGENTS.md               # Agent instructions (Convex, papercuts)
```

## Directory Purposes

**`convex/`:**
- Purpose: Durable backend runtime for AE
- Contains: `query`/`mutation`/`action`/`internalMutation` handlers, cron definitions, composed schema
- Key files: `convex/schema.ts`, `convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationInvocationWorker.ts`, `convex/registry.ts`, `convex/capabilitySupply.ts`
- Subdirectories: `convex/lib/` (shared Convex helpers), `convex/_generated/` (codegen — do not edit)

**`src/modules/`:**
- Purpose: Domain-owned logic for the atomic operation market and first-party surfaces
- Contains: One directory per bounded context (~35 modules)
- Key modules (kernel): `capability-contract`, `capability-supply`, `capability-execution`, `registry`, `action-invocation`, `money`, `agent-access`, `network-guard`, `actions`, `common`
- Key modules (proving ground): `answer`, `answer-thread`, `customer-request`, `work-tree`, `study`
- Key modules (owner): `storefront`, `inquiries`, `settings`, `discovery`
- Subdirectories per module: see Naming Conventions below

**`src/routes/`:**
- Purpose: TanStack file-based routing for UI pages and HTTP API endpoints
- Contains: `*.tsx` pages, `api.*.ts` server handlers, `_operator/` layout for owner/admin
- Key files: `api.v1.operations.call.ts`, `api.v1.market-operations.search.ts`, `api.answer.turn.ts`, `mcp.ts`, `operations.invocations.$invocationRef.tsx`
- Subdirectories: `_operator/` (owner and admin consoles)

**`src/lib/`:**
- Purpose: Cross-cutting utilities not owned by a single domain module
- Contains: `server/` (HTTP glue), `http/`, `observability/`, `client/`, `errors.ts`
- Key files: `src/lib/server/operation-invoke-api.ts`, `src/lib/server/mcp-api.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/agent-access-auth.ts`

**`tools/ae/`:**
- Purpose: Market CLI exercising the same actions as HTTP/MCP
- Contains: `cli.ts`, `commands/`, `lib/`
- Key files: `tools/ae/cli.ts`, `tools/ae/commands/manifest.ts`, `tools/ae/commands/invoke.ts`, `tools/ae/commands/search.ts`

**`tools/dev/` and `tools/release/`:**
- Purpose: Development orchestration and release verification
- Key files: `tools/dev/local-dev.mjs`, `tools/release/operation-gateway-production-smoke.ts`, `tools/release/verify-product-frontier.mjs`

**`tests/`:**
- Purpose: Automated enforcement of behavior and architecture
- Contains: Unit tests co-located by domain under `tests/unit/<module>/`, import boundary tests under `tests/imports/`
- Key files: `tests/imports/capability-contract-boundaries.test.ts`, `tests/imports/private-imports.test.ts`, `tests/unit/capability-execution/operation-invoke.test.ts`

**`.planning/`:**
- Purpose: Program management, evidence, codebase maps for GSD
- Key files: `.planning/STATE.md`, `.planning/reset/OPERATING-MODEL.md`, `.planning/codebase/CAPABILITY-MAP.md`
- Do not overwrite companion maps when refreshing architecture docs

**`.agents/skills/`:**
- Purpose: Repo-specific agent guidance (Convex patterns, UI, deploy guard)
- Contains: `SKILL.md` per skill directory; load when working in that area

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start instance, global request middleware
- `src/router.tsx`: Client router from generated route tree
- `src/routes/__root.tsx`: Root layout, Clerk provider, observability boot
- `tools/ae/cli.ts`: CLI entry (`npm run ae --`)
- `convex/schema.ts`: Database schema composition
- `convex/crons.ts`: Scheduled jobs

**Configuration:**
- `package.json`: npm scripts (`ae`, `dev`, `test:release`, `test:conformance`)
- `tsconfig.json`: Strict TS, `@/*` → `src/*`
- `vite.config.ts`: TanStack Start, Tailwind, Nitro output
- `vitest.config.ts`: Test runner configuration
- `convex/convex.config.ts`: Convex app components (workflow, workpool, rate-limiter)
- `convex/auth.config.ts`: Convex auth provider config
- `.env*` files: Present for local/hosted config — never commit secrets

**Core Logic (market kernel):**
- `src/modules/actions/index.ts`: Central action registry
- `src/modules/capability-execution/operation-invoke.ts`: Invoke orchestration service
- `src/modules/capability-execution/operation-invoke-contracts.ts`: Wire DTOs and Zod schemas
- `src/modules/capability-execution/operation-invoke-entry.ts`: HTTP route contracts
- `src/modules/capability-supply/public.ts`: Published operation types and search helpers
- `src/modules/registry/public.ts`: Registry-facing exports (re-exports supply projection)
- `convex/capabilityOperationInvocations.ts`: Durable invoke mutations/actions
- `convex/capabilityOperationInvocationWorker.ts`: Outbound dispatch worker

**Protocol surfaces:**
- `src/routes/api.v1.operations.call.ts`: Canonical paid invoke HTTP path
- `src/routes/api.v1.market-operations.*.ts`: Anonymous registry reads
- `src/routes/mcp.ts`: MCP endpoint
- `src/routes/SKILL[.]md.ts`, `src/routes/[.]well-known/ucp.ts`: Agent discovery files
- `src/lib/server/mcp-api.ts`: MCP tool adapter

**Answer runtime:**
- `src/routes/api.answer.turn.ts`: Turn streaming endpoint
- `src/modules/answer/internal/answer-tool-use-agent.ts`: AI SDK tool loop
- `src/modules/answer-thread/server.ts`: Turn orchestration (import from route)

**Testing:**
- `tests/unit/`: Domain unit tests
- `tests/integration/`: Multi-module flows
- `tests/imports/`: Architecture boundary enforcement
- `tests/e2e/`: Playwright specs
- `eval/answer/`: Promptfoo config for answer evals

**Documentation:**
- `AGENTS.md`: Agent working agreements
- `.planning/codebase/CAPABILITY-MAP.md`: Layered capability inventory
- `.planning/reset/OPERATING-MODEL.md`: Atomic market reset execution contract
- `docs/architecture/`: Supplemental human docs (sparse)

## Naming Conventions

**Module layout (under `src/modules/<name>/`):**

| Pattern | Purpose | Example |
|---------|---------|---------|
| `public.ts` | Cross-module exports (types, pure functions) | `src/modules/registry/public.ts` |
| `server.ts` | Node-only exports (transport, signing) | `src/modules/capability-supply/server.ts` |
| `convex.ts` | Convex value validators shared with `convex/` | `src/modules/capability-execution/convex.ts` |
| `index.ts` | Barrel when module has multiple entry facets | `src/modules/capability-execution/index.ts` |
| `internal/` | Module-private implementation | `src/modules/registry/internal/search.ts` |
| `*.functions.ts` | Convex query/mutation wrappers (TanStack server fns or thin exports) | `operation-recovery.functions.ts` |
| `*.actions.ts` | Registered machine actions | `operation-invoke.actions.ts` |
| `internal/convex-schema.ts` | Table definitions imported by `convex/schema.ts` | `src/modules/money/internal/convex-schema.ts` |
| `*-contracts.ts` | Shared wire/domain contracts (break cycles) | `operation-invoke-contracts.ts` |

**Convex root files:**

| Pattern | Purpose | Example |
|---------|---------|---------|
| `<domain>.ts` | Primary Convex module entry | `convex/capabilitySupply.ts` |
| `<domain>*Ports.ts` | Port/adapters for testability and wiring | `convex/capabilitySupplyOperationPorts.ts` |
| `<domain>*Worker.ts` | `"use node"` scheduled/action workers | `convex/capabilityOperationInvocationWorker.ts` |
| `customerRequestRoute*.ts` | Customer Request route execution spine | `convex/customerRequestRouteExecution.ts` |

**Routes (`src/routes/`):**

| Pattern | Purpose | Example |
|---------|---------|---------|
| `api.v1.<resource>.ts` | Versioned JSON API | `api.v1.operations.call.ts` |
| `api.<domain>.<action>.ts` | Unversioned or legacy API | `api.answer.turn.ts` |
| `_operator/<area>.*.tsx` | Authenticated operator UI | `_operator/owner.supply.tsx` |
| `$param` | Dynamic route segments | `operations.invocations.$invocationRef.tsx` |
| `[.]well-known/*` | Discovery / OAuth metadata | `[.]well-known/ucp.ts` |

**CLI (`tools/ae/commands/`):**

| Pattern | Purpose | Example |
|---------|---------|---------|
| `<verb>.ts` | One command implementation | `invoke.ts`, `search.ts` |
| `manifest.ts` | Command registry for help/discovery | `tools/ae/commands/manifest.ts` |
| Space in command name | Nested CLI namespace | `demand ask` → `ask.ts` with manifest grouping |

**Tests:**

| Pattern | Purpose | Example |
|---------|---------|---------|
| `tests/unit/<module>/` | Unit tests mirroring module | `tests/unit/capability-execution/operation-invoke.test.ts` |
| `tests/integration/` | Cross-cutting integration | `tests/integration/capability-supply-owner-funnel.test.ts` |
| `tests/imports/*-boundaries.test.ts` | Import/architecture guards | `capability-supply-boundaries.test.ts` |
| `*.test.ts` inside `convex/` | Convex handler unit tests | `convex/workTrees.test.ts` |

**Files:**
- kebab-case for module directories: `capability-execution`, `answer-thread`
- kebab-case for most source files: `operation-invoke.ts`, `search-documents.ts`
- Dot-separated route files follow TanStack convention: `api.v1.operations.call.ts`

**Directories:**
- Plural for test trees: `tests/unit/`, `tests/integration/`
- Singular module names matching domain: `src/modules/registry/` (not `registries`)

**Special Patterns:**
- `@/` import alias maps to `src/` (`tsconfig.json`)
- `@/routes/owner.*` and `@/routes/admin.*` alias to `_operator/` paths
- Generated: `src/routeTree.gen.ts` (TanStack Router codegen — do not hand-edit)

## Where to Add New Code

**New market operation action (agent-visible):**
- Action definition: `src/modules/<domain>/<domain>.actions.ts` (or extend existing)
- Registry entry: `src/modules/actions/index.ts`
- HTTP route (if exposed): `src/routes/api.v1.<path>.ts` calling the same action runner
- MCP: automatic via `listMcpActions()` when `surfaces` includes `'mcp'`
- CLI: `tools/ae/commands/<command>.ts` + entry in `tools/ae/commands/manifest.ts`
- Tests: `tests/unit/<domain>/`, plus conformance in `npm run test:conformance` if kernel-critical

**New capability-execution / invoke behavior:**
- Domain logic: `src/modules/capability-execution/` (service in `operation-invoke.ts` or sibling)
- Contracts: `src/modules/capability-execution/operation-invoke-contracts.ts`
- Convex persistence: `convex/capabilityOperationInvocations.ts`
- Worker/dispatch: `convex/capabilityOperationInvocationWorker.ts`
- HTTP gateway: `src/lib/server/operation-invoke-api.ts`
- Tests: `tests/unit/capability-execution/`, `tests/unit/convex/capability-operation-*.test.ts`

**New supply / registry projection:**
- Supply logic: `src/modules/capability-supply/` (`operation-projection.ts`, `internal/publication/`)
- Registry adapter: `src/modules/registry/internal/` + exports via `registry/public.ts`
- Convex writers: `convex/capabilitySupply*.ts`, `convex/registry.ts`
- Search documents: `src/modules/registry/internal/search-documents.ts`
- Tests: `tests/unit/capability-supply/`, `tests/unit/registry/`

**New Convex table:**
- Schema fragment: `src/modules/<domain>/internal/convex-schema.ts`
- Register in: `convex/schema.ts`
- Handlers: `convex/<domain>.ts` or new file + `*Ports.ts` if wiring is non-trivial
- Run: `npm run check:convex-codegen` after schema changes

**New Answer tool behavior:**
- Tool/agent logic: `src/modules/answer/internal/`
- Turn wiring: `src/modules/answer-thread/internal/turns/`
- Route: extend `src/routes/api.answer.turn.ts` only for HTTP concerns; keep logic in modules
- Eval: `eval/answer/` and `tests/eval/`

**New operator UI page:**
- Route: `src/routes/_operator/<area>.tsx` or nested under existing owner/admin paths
- Components: `src/components/ae/<feature>/`
- Server functions: module `*.functions.ts` with Clerk/session guards in `src/lib/server/require-operator-session.ts`

**New CLI command:**
- Implementation: `tools/ae/commands/<name>.ts`
- Manifest: add to `tools/ae/commands/manifest.ts` (`COMMANDS` array)
- Options: extend `COMMAND_OPTIONS` in `tools/ae/cli.ts` if new flags needed

**Utilities:**
- Domain-specific: keep inside owning module `internal/` or export via `public.ts`
- Cross-domain HTTP/observability: `src/lib/server/` or `src/lib/`
- Shared pure helpers: `src/modules/common/`

**Release / smoke verification:**
- Hosted smoke: `tools/release/<name>-production-smoke.ts`
- Dev evidence: `tools/dev/<name>-evidence.ts`
- Wire into `package.json` scripts only when gate-worthy

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex codegen (API types, server stubs, AI guidelines)
- Generated: Yes — `npx convex codegen` / deploy
- Committed: Yes (repo convention); do not hand-edit

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router route tree
- Generated: Yes — router plugin during dev/build
- Committed: Yes

**`node_modules/`, `.vercel/output/`, `output/`, `playwright-report/`, `test-results/`:**
- Purpose: Dependencies and build/test artifacts
- Generated: Yes
- Committed: No (gitignored)

**`convex_local_storage/`:**
- Purpose: Local Convex file/search snapshots for dev
- Generated: Local dev tooling
- Committed: No

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Vendored external protocol reference
- Generated: No
- Committed: Yes — treat as read-only vendor code

**`.planning/codebase/`:**
- Purpose: GSD codebase maps consumed by plan/execute phases
- Key files: `CAPABILITY-MAP.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, data-flow companions
- Committed: Yes — update on major architectural drift; do not delete companion maps

**`.agents/skills/`:**
- Purpose: Cursor/Codex skill packs for repo conventions
- Committed: Yes — add skills when introducing repeatable workflows

---

*Structure analysis: 2026-08-17*
