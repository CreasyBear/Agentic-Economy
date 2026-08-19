# Codebase Structure

**Analysis Date:** 2026-08-19

## Directory Layout

```
Agentic-Economy/
├── src/                      # App host (TanStack Start + React)
│   ├── routes/               # File routes: HTTP adapters + pages
│   ├── modules/              # Domain kernel (public.ts / internal/)
│   ├── lib/                  # Host helpers (server, http, errors, observability)
│   ├── components/           # UI: ae/ (product), ui/ (primitives), ai-elements/
│   ├── content/              # Brand copy
│   ├── hooks/                # Shared React hooks
│   ├── styles/               # globals.css
│   ├── start.ts              # Middleware + Start entry
│   ├── router.tsx            # Router factory
│   └── routeTree.gen.ts      # Generated route tree
├── convex/                   # Durable source functions + schema compose
│   ├── schema.ts             # Spreads module table maps (60 listed)
│   ├── http.ts               # Routing-kernel HTTP 410 only
│   ├── convex.config.ts      # Workpool / workflow / rate limiter / aggregate
│   ├── authz.ts              # Clerk → actor
│   ├── marketDispatchWorkpool.ts
│   └── _generated/           # Convex codegen
├── tests/                    # Vitest + Playwright suites
│   ├── unit/                 # Mirrors modules / server / convex
│   ├── integration/
│   ├── imports/              # Boundary + frontier + kernel-retirement
│   ├── e2e/
│   ├── deploy-smoke/
│   └── helpers/
├── tools/
│   ├── ae/                   # Public-surface CLI adapter
│   ├── dev/                  # Local smokes, papercut, fixtures
│   └── release/              # Manifest, frontier, hosted smoke
├── eval/                     # Answer evals / quality gate
├── scripts/                  # Audit scripts (e.g. action surfaces)
├── public/                   # Static assets
├── docs/                     # Ancillary docs (codemap)
├── .planning/                # GSD state, ADRs, evidence, this codebase map
├── package.json              # Scripts and dependencies
├── vite.config.ts            # Vite + TanStack Start + Nitro
├── vitest.config.ts
├── tsconfig.json             # `@/*` → `src/*`
└── AGENTS.md                 # Convex + papercut operating notes
```

## Directory Purposes

**`src/routes/`:**
- Purpose: Thin TanStack file-route adapters and pages. Own URLs, methods, and handler wiring only.
- Contains: `api.v1.operations.call.ts` (paid door), `api.v1.operations.execute.ts` (410), `mcp.ts`, `api.answer.turn.ts`, `api.v1.market-operations.*.ts`, measured businesses/services URLs, operator pages under `_operator/`, OAuth well-known, retired CR/WorkTree HTTP.
- Key files: `src/routes/api.v1.operations.call.ts`, `src/routes/mcp.ts`, `src/routes/__root.tsx`, `src/routes/_operator.tsx`

**`src/modules/`:**
- Purpose: Domain kernel. One folder per bounded context. Public seam is `public.ts` (and `convex.ts` when Convex must not import Node barrels).
- Contains: Action defs (`*.actions.ts`), TanStack server fns (`*.functions.ts`), Convex table maps (`internal/convex-schema.ts` or `internal/schema.ts`), domain logic under `internal/`.
- Key files: `src/modules/actions/index.ts` (14 public actions), `src/modules/common/action.ts`, `src/modules/capability-execution/operation-invoke.ts`, `src/modules/capability-supply/`, `src/modules/money/`, `src/modules/product-frontier/`

**`src/lib/`:**
- Purpose: App-host concerns shared by routes: Convex client wrappers, auth, problems, rate limits, MCP/HTTP adapters.
- Contains: `server/` (gateway adapters), `http/`, `observability/`, `errors.ts`.
- Key files: `src/lib/server/operation-invoke-api.ts`, `src/lib/server/mcp-api.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/agent-access-auth.ts`, `src/lib/errors.ts`, `src/lib/ui/contract-scans.ts`

**`src/components/`:**
- Purpose: React UI. Product components under `ae/`; primitives under `ui/`.
- Contains: Chat/answer, operator shells, supply funnel, inquiries, paid-operation card.
- Key files: `src/components/ae/chat/`, `src/components/ae/action-invocation/AePaidOperationCard.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`

**`convex/`:**
- Purpose: Durable queries/mutations/actions. Call into `src/modules`; do not invent a second domain layer.
- Contains: One file (or family) per table/context; `schema.ts` composition; RK 410 HTTP; workpool.
- Key files: `convex/schema.ts`, `convex/capabilityOperationInvocations.ts`, `convex/marketDispatchWorkpool.ts`, `convex/http.ts`, `convex/authz.ts`, `convex/retiredListedUnlisted.ts`

**`tools/ae/`:**
- Purpose: CLI that exercises AE the way an external agent would — same public HTTP actions.
- Contains: `cli.ts`, `commands/invoke.ts`, `commands/search.ts`, `commands/manifest.ts`.
- Key files: `tools/ae/cli.ts`, `tools/ae/commands/invoke.ts`

**`tests/`:**
- Purpose: Pin architecture: 14 actions, 60 tables, import seams, invoke conformance.
- Contains: `unit/`, `integration/`, `imports/`, `e2e/`, `helpers/`.
- Key files: `tests/unit/schema/convex-schema.test.ts`, `tests/imports/product-frontier-manifest.test.ts`, `tests/unit/actions/registry.test.ts`

**`.planning/`:**
- Purpose: Operating model, ADRs, evidence. Codebase maps for planners live in `.planning/codebase/`.
- Contains: `STATE.md`, `reset/OPERATING-MODEL.md`, `codebase/ARCHITECTURE.md`, `codebase/STRUCTURE.md`.
- Key files: `.planning/codebase/ARCHITECTURE.md` (do not overwrite `CAPABILITY-MAP.md`, `IA-DATA-FLOW.md`, `PROMPT-DATA-FLOW.md`, or `DATA-FLOW-DELTA-*.md` from this mapper)

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start middleware (Clerk, CSRF, source-write, security headers, correlation)
- `src/router.tsx`: `createRouter` over `src/routeTree.gen.ts`
- `src/routes/api.v1.operations.call.ts`: Paid invoke HTTP door (`POST /api/v1/operations/call`)
- `src/routes/mcp.ts`: MCP host
- `tools/ae/cli.ts`: CLI adapter (`npm run ae`)
- `src/routes/api.answer.turn.ts`: Chat turn stream
- `convex/schema.ts`: Listed table composition
- `src/modules/actions/index.ts`: Public action inventory (`listActions` = 14 ids)

**Configuration:**
- `package.json`: Scripts (`test:release:source`, `check:product-frontier`, `ae`)
- `vite.config.ts`: Dev server, TanStack Start, Nitro, Sentry plugin
- `tsconfig.json`: Path alias `@/*` → `src/*`
- `convex/convex.config.ts`: Workpool, workflow, rate limiter, aggregate
- `convex/auth.config.ts`: Clerk JWT issuer
- `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`: Required 14 action ids and MCP tool names
- Env files may exist for local/hosted config — note existence only; never commit or quote secrets

**Core Logic:**
- `src/modules/common/action.ts`: `defineAction`
- `src/modules/capability-execution/operation-invoke.ts`: Paid invoke domain service
- `src/modules/capability-execution/operation-invoke-entry.ts`: Route contract (`/call` paid, `/execute` legacy)
- `src/modules/action-invocation/application-service.ts`: Durable invocation host
- `src/modules/capability-supply/`: Admission, bindings, transport, x402 policy
- `src/modules/registry/`: Discovery projections and actions
- `src/modules/money/`: Brokered ledger + `internal/live-money-gate.ts`
- `src/modules/agent-access/`: Principals, grants, scopes
- `src/modules/answer-thread/`: Chat persistence and tool loop
- `src/modules/product-frontier/`: Quarantine, deprecation notice, table retirement, businesses/services policy
- `convex/capabilityOperationInvocations.ts`: Durable invoke/status/cancel/reconcile source

**Testing:**
- `tests/unit/<module>/`: Unit tests beside domain names
- `tests/unit/server/`: HTTP/MCP adapter tests (`mcp-api.test.ts`, `operation-invoke-api.test.ts`)
- `tests/unit/convex/`: Convex runtime tests
- `tests/unit/schema/convex-schema.test.ts`: 60 `durableTables`
- `tests/imports/`: Private imports, route boundary, product-frontier, kernel-retirement
- `tests/integration/`: Workpool, supply funnel, answer-thread source-write
- `tests/e2e/`: Playwright product journeys
- `tests/helpers/`: Convex fixtures, lineage helpers

## Naming Conventions

**Files:**
- Domain module folder: kebab-case (`capability-execution`, `answer-thread`)
- Public seam: `public.ts`; Convex-safe seam: `convex.ts`; server-only barrel: `server.ts`
- Actions: `<area>.actions.ts` (e.g. `operation-invoke.actions.ts`, `registry.actions.ts`)
- TanStack server fns: `<area>.functions.ts`
- Table maps: `internal/convex-schema.ts` or `internal/schema.ts`
- Routes: TanStack dotted files (`api.v1.operations.call.ts` → `/api/v1/operations/call`)
- Tests: `tests/unit/<area>/<name>.test.ts` or `.test.tsx`
- Product UI: `Ae<Name>.tsx` under `src/components/ae/<area>/`

**Directories:**
- `src/modules/<context>/internal/`: private; other modules and routes must not import
- `src/routes/_operator/`: authenticated owner/admin UI
- `convex/lib/`: Convex-local helpers (e.g. `convex/lib/rateLimit.ts`)
- Quarantined modules that stay in tree: `src/modules/study/`, `src/modules/work-tree/` (actions filtered from `listActions`; tables empty)

## Where to Add New Code

**New public Market Operation / supply / registry action:**
- Primary code: `src/modules/<owning-module>/<name>.actions.ts` using `defineAction` from `src/modules/common/action.ts`
- Register: explicit import + array entry in `src/modules/actions/index.ts` (not a side-effect import)
- Frontier pin: `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json` `requiredActionIds` / `requiredMcpTools` if it is a live public id
- Tests: `tests/unit/actions/registry.test.ts`, `tests/imports/product-frontier-manifest.test.ts`, plus module unit tests under `tests/unit/<module>/`
- Do not add quarantined-family ids (`customerRequest.`, `inquiry.`, `study.`, `workTree.`) to `listActions()`. `inquiry.readCustomerRecord` stays `findAction`-able and not HTTP-410ed; it is not one of the 14 public ids.

**New paid invoke behavior:**
- Domain: `src/modules/capability-execution/operation-invoke.ts` and contracts in `operation-invoke-contracts.ts`
- Durable host: `convex/capabilityOperationInvocations.ts` + worker `convex/capabilityOperationInvocationWorker.ts`
- HTTP: keep `src/routes/api.v1.operations.call.ts` as the only paid door; extend `src/lib/server/operation-invoke-api.ts` only as a thin adapter
- MCP/CLI inherit via the same action id `operation.invoke`
- Tests: `tests/unit/capability-execution/`, `tests/unit/server/operation-invoke-api.test.ts`, `tests/integration/capability-operation-workpool.test.ts`

**New HTTP adapter (not a new kernel):**
- Route file: `src/routes/api.v1.<resource>.ts` calling `src/lib/server/<adapter>.ts`
- Import module `public.ts` / documented actions only
- Errors: `src/lib/server/problem.ts`
- Tests: `tests/unit/server/` or `tests/unit/routes/`
- Do not add `/api/v1/services*` or `/api/businesses*` siblings (`src/modules/product-frontier/business-services-policy.ts` expansion frozen)
- Do not revive `/api/v1/operations/execute` as a live paid path (`src/routes/api.v1.operations.execute.ts` is 410)

**New Convex table (listed):**
- Table map: `src/modules/<module>/internal/convex-schema.ts` (or `internal/schema.ts`)
- Compose: spread into `convex/schema.ts`
- Inventory: add the name to `durableTables` in `tests/unit/schema/convex-schema.test.ts` (current listed cap is 60)
- Source functions: `convex/<context>.ts` calling module functions; require `sourceWriteAdmission` for writes
- Unlisted/retired names: add to `src/modules/product-frontier/retired-listed-tables.ts` and throw via `convex/retiredListedUnlisted.ts` — do not re-list Study/WorkTree/RK/project-spine tables (those maps are `{}`)

**New UI surface:**
- Page: `src/routes/<path>.tsx` or `src/routes/_operator/<path>.tsx`
- Components: `src/components/ae/<area>/Ae<Name>.tsx`
- Copy: `src/content/brand-copy.ts` when it is public prose
- Tests: `tests/unit/ui/` or `tests/unit/chat/` / `tests/e2e/`

**New CLI command:**
- Implementation: `tools/ae/commands/<command>.ts` calling existing HTTP action paths
- Wire: `tools/ae/commands/manifest.ts` + `tools/ae/cli.ts`
- Tests: `tests/unit/market-terminal/`

**Chat/answer change:**
- Orchestration: `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Read tools: register the action with `surfaces` including `answerThread` and add the id to answer tool id lists (`src/modules/answer-thread/answer-thread.schema.ts` / tooling)
- Runner: `src/modules/answer-thread/internal/tool-runner.ts` (read-only only)
- HTTP: `src/routes/api.answer.turn.ts`
- Prompt traces: update `.planning/codebase/PROMPT-DATA-FLOW.md` via the docs owner — this mapper does not overwrite it

**Utilities:**
- Shared helpers: `src/modules/common/` (`canonical-digest.ts`, `result.ts`, `runtime-id.ts`)
- Host-only helpers: `src/lib/server/`
- Do not put market policy in `src/lib/`

**Quarantined families (do not grow public surface):**
- Customer Request: no `src/modules/customer-request/` (module absent). Tombstones: `src/modules/product-frontier/quarantine-family-actions.ts`. HTTP 410: `src/lib/server/customer-request-gone.ts`
- Study: domain types stay in `src/modules/study/`; `studyTables = {}` in `src/modules/study/internal/convex-schema.ts`; actions filtered from `listActions`
- WorkTree: domain stays in `src/modules/work-tree/`; `workTreeTables = {}`; HTTP 410 via `src/lib/server/quarantine-write.ts`
- Routing kernel: empty `src/modules/routing-kernel/internal/convex-schema.ts`; HTTP 410 stays in `convex/http.ts`

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex API, DataModel, server stubs, AI guidelines (`convex/_generated/ai/guidelines.md`)
- Generated: Yes (`npx convex codegen`)
- Committed: Yes

**`src/routeTree.gen.ts`:**
- Purpose: TanStack generated route tree
- Generated: Yes (Start/Vite plugin)
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: Planner/executor maps (`ARCHITECTURE.md`, `STRUCTURE.md`, plus existing flow maps)
- Generated: No (hand-written by mappers)
- Committed: Yes
- Constraint: Do not overwrite `CAPABILITY-MAP.md`, `IA-DATA-FLOW.md`, `PROMPT-DATA-FLOW.md`, or `DATA-FLOW-DELTA-*.md` from an arch remap

**`output/` and `outputs/`:**
- Purpose: Release/eval receipts and local artifacts
- Generated: Yes (test/release scripts)
- Committed: Treat as evidence/artifacts; do not place secrets here

**`node_modules/`, `convex_local_storage/`:**
- Purpose: Dependencies and local Convex data
- Generated: Yes
- Committed: No

**`eval/`:**
- Purpose: Answer evaluation cases and quality gate
- Generated: No
- Committed: Yes

**`.env*`:**
- Purpose: Environment configuration for local/hosted runs
- Generated: No
- Committed: No — never read or quote contents in codebase maps

---

*Structure analysis: 2026-08-19*
