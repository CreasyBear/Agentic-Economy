# Codebase Structure

**Analysis Date:** 2026-07-17  
**Inspected revision:** `7deffac41e103ee619ce099db531fc2127ba9985`  
**last_mapped_commit:** `7deffac41e103ee619ce099db531fc2127ba9985`

## Directory Layout

```
Agentic-Economy/
├── src/                    # Application source (routes, modules, UI, lib)
│   ├── routes/             # TanStack file routes (pages + API handlers)
│   ├── modules/            # Domain modules (public / internal seams)
│   ├── components/         # React UI (ae/, astryx/, ai-elements/)
│   ├── lib/                # Shared server/http/observability/ui helpers
│   ├── styles/             # Global CSS / tokens
│   ├── hooks/              # Shared React hooks
│   ├── start.ts            # TanStack Start middleware entry
│   ├── router.tsx          # Router factory
│   └── routeTree.gen.ts    # Generated route tree (do not hand-edit)
├── convex/                 # Convex functions, schema composition, HTTP router
├── tests/                  # Vitest + Playwright suites by concern
├── examples/               # Routing edge/provider/agent prototypes
├── tools/                  # Dev/release smoke and verification scripts
├── eval/                   # Answer eval configs and scripts
├── docs/                   # Architecture authority notes (e.g. Customer Request)
├── public/                 # Static assets (brand, images)
├── .agents/skills/         # AE-specific agent skills
├── .planning/              # GSD plans, ADRs, codebase maps, records
├── package.json            # Scripts and dependencies
├── vite.config.ts          # Vite + TanStack Start + Nitro
├── vitest.config.ts        # Unit/integration test runner
├── playwright.config.ts    # E2E
├── PRODUCT.md              # Product thesis / trust contract
├── DESIGN.md               # Visual/UI authority
├── AGENTS.md               # Always-on assistant rules
└── UBIQUITOUS_LANGUAGE.md  # Domain vocabulary
```

## Directory Purposes

**src/routes/**
- Purpose: File-based TanStack routes — human pages and thin HTTP adapters
- Contains: `*.tsx` pages, `api.*.ts` server handlers, `_operator/` owner/admin layouts
- Key files: `__root.tsx`, `index.tsx`, `registry.tsx`, `$slug.tsx`, `api.businesses.search.ts`, `api.requests.ts`, `api.v1.requests.ts`, `llms[.]txt.ts`, `SKILL[.]md.ts`
- Subdirectories: `_operator/` (owner/admin/developer surfaces), `[.]well-known/`

**src/modules/**
- Purpose: Domain ownership — logic, actions, Convex schema fragments, projections
- Contains: One directory per domain with `public.ts`, usually `internal/`, often `*.actions.ts` / `*.functions.ts`
- Key domains: `customer-request/`, `registry/`, `inquiries/`, `routing-kernel/`, `harness/`, `answer/`, `answer-thread/`, `discovery/`, `security/`, `actions/`, `common/`
- Subdirectories: Always put implementation under `internal/`; export only through `public.ts`

**src/components/**
- Purpose: Presentation — prefer Astryx primitives; AE behavioral shells under `ae/`
- Contains: `ae/` (product UI), `astryx/` (RouterLink, progress), `ai-elements/`, `animate/`
- Key files: `ae/customer-request/`, `ae/layout/`, `ae/listing/`, `ae/operator/`
- Subdirectories: Feature folders under `ae/`; do not add new bespoke design-system trees

**src/lib/**
- Purpose: Cross-cutting adapters (not domain owners)
- Contains: `server/` (Convex source, Customer Request APIs, admission), `http/`, `observability/`, `ui/` (contract scanners), `operator/`, `dev/`
- Key files: `server/convex-source.ts`, `server/customer-request-api.ts`, `server/customer-request-agent-api.ts`, `server/source-write-admission.ts`, `ui/contract-scans.ts`
- Subdirectories: Keep Customer Request HTTP handlers here; domain semantics stay in `src/modules/customer-request/`

**convex/**
- Purpose: Durable backend — queries/mutations/actions, schema compose root, crons, Convex HTTP
- Contains: One file (or small cluster) per capability area; `_generated/` from Convex codegen
- Key files: `schema.ts`, `customerRequestApplication.ts`, `customerRequestV2*.ts`, `customerRequestRouteMandate*.ts`, `registry.ts`, `inquiries.ts`, `http.ts`, `crons.ts`
- Subdirectories: `_generated/` only (generated)

**tests/**
- Purpose: Executable evidence by gate type
- Contains: `unit/`, `integration/`, `imports/`, `e2e/`, `deploy-smoke/`, `copy/`, `seo/`, `ui-contract/`, `types/`, `fixtures/`, `helpers/`
- Key files: `imports/private-imports.test.ts`, `imports/route-boundary.test.ts`, `imports/customer-request-*.test.ts`
- Subdirectories: Match the npm script you are proving (`test:unit`, `test:imports`, etc.)

**examples/**
- Purpose: Isolated routing provider/edge/agent prototypes — not production authority
- Contains: `routing-edge/`, `routing-provider/`, `routing-agent-*`, `agent-experience/`
- Key files: Provider readiness runners under `examples/routing-provider/`
- Subdirectories: Each example may have its own `package.json` / wrangler config

**tools/**
- Purpose: Release/dev smoke scripts and kernel proof verifiers
- Contains: `release/`, `dev/`
- Key files: `release/customer-request-production-smoke.ts`, `dev/customer-request-development-smoke.ts`
- Subdirectories: Split hosted vs local verification here — do not redefine domain objects

**docs/**
- Purpose: Long-form architecture authority notes
- Contains: `architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`, `agents/`
- Key files: Customer Request source-authority map (which files own which lifecycle step)

**.planning/**
- Purpose: GSD planning, ADRs, research records, codebase maps
- Contains: `phases/`, `adr/`, `records/`, `codebase/`, `research/`
- Key files: This map lives in `.planning/codebase/`

## Key File Locations

**Entry Points:**
- `src/start.ts` — request middleware (observability, security headers, CSRF, source-write, Clerk)
- `src/router.tsx` — `createRouter` + generated `routeTree`
- `src/routes/__root.tsx` — document shell, Astryx theme, Clerk provider gating
- `convex/http.ts` — Convex HTTP (sandbox providers + retired V1 routing stubs)
- `vite.config.ts` — build/dev server plugins

**Configuration:**
- `package.json` — scripts and dependencies
- `tsconfig.json` — `@/*` → `src/*` path alias
- `vitest.config.ts` / `playwright.config.ts` / `playwright.deploy-smoke.config.ts`
- `.env.example` — documents required env vars (do not commit secrets; `.env.local` is local-only)
- `convex/auth.config.ts` / `convex/convex.config.ts` — Convex auth and app config

**Core Logic:**
- `src/modules/actions/index.ts` — central action registry
- `src/modules/common/action.ts` — ActionDefinition types
- `src/modules/customer-request/` — Request compile/prepare/mandate/projection
- `src/modules/routing-kernel/` — neutral kernel
- `src/modules/registry/` — public catalog search/detail
- `src/modules/inquiries/` — qualified inquiry
- `src/modules/harness/` — tool contracts, run loop, approval policy
- `src/modules/security/source-write-admission.ts` — write admission
- `src/lib/server/convex-source.ts` — Convex transport helpers
- `convex/schema.ts` — schema composition root
- `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md` — Request path authority table

**Testing:**
- `tests/unit/` — pure unit tests
- `tests/integration/` — Convex/integration tests
- `tests/imports/` — architecture boundary scanners
- `tests/e2e/` / `tests/deploy-smoke/` — Playwright
- `tests/fixtures/` — intentional bad-import fixtures for scanner modes

**Documentation:**
- `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `UBIQUITOUS_LANGUAGE.md`
- `.agents/skills/ae-*/SKILL.md` — implementation recipes
- `.planning/records/` — research/decision ledger (see `KNOWLEDGE-INDEX.md`)

## Naming Conventions

**Files:**
- `kebab-case.ts` / `kebab-case.tsx` for most modules and routes
- `<domain>.actions.ts` — ActionDefinition exports
- `<domain>.functions.ts` — TanStack `createServerFn` + `*ThroughSource` adapters
- `public.ts` — module public barrel
- `api.<resource>.ts` / `api.v1.<resource>.ts` — HTTP API routes
- `$param.tsx` — dynamic TanStack routes; bracket escaping for dots (`llms[.]txt.ts`)
- `_operator.tsx` / `_operator/` — pathless layout + owner/admin pages
- `*.test.ts` — Vitest next to convex tests or under `tests/`

**Directories:**
- `kebab-case` domain folders under `src/modules/`
- `internal/` — private implementation (never import across module boundary)
- Plural collection folders where natural: `tests/`, `examples/`, `tools/`

**Special Patterns:**
- Convex table fragments: `internal/schema.ts` or `internal/convex-schema.ts` exported as `*Tables`
- Path aliases: `@/*` and `~/*` → `src/*`; operator route aliases for `@/routes/owner.*` and `@/routes/admin.*`
- Generated: `src/routeTree.gen.ts`, `convex/_generated/**` — regenerate, do not hand-edit

## Where to Add New Code

**New feature (domain behavior):**
- Primary code: `src/modules/<domain>/` (`public.ts` + `internal/`)
- Schema tables: `src/modules/<domain>/internal/schema.ts` (or `convex-schema.ts`), then spread in `convex/schema.ts`
- Convex functions: `convex/<area>.ts` calling domain public/pure logic
- Tests: `tests/unit/` and/or `tests/integration/`; add import-boundary coverage if new seams

**New Action (operation exposed to UI/HTTP/agent/answer):**
- Implementation: `src/modules/<domain>/<domain>.actions.ts` + `*ThroughSource` in `<domain>.functions.ts`
- Register: import into `src/modules/actions/index.ts` array (required — no side-effect registration)
- Surfaces: set `surfaces` deliberately (`ui` | `http` | `agentJson` | `answerThread`); owner-only → no answerThread / keep off agent paths
- HTTP adapter (if needed): thin `src/routes/api.*.ts` calling `action.run`
- Tests: unit for schema/boundaries; integration for write admission/refusal

**New page / operator UI:**
- Route: `src/routes/...tsx` or `src/routes/_operator/...tsx`
- Components: `src/components/ae/<feature>/` using Astryx (`@astryxdesign/core`, `@astryxdesign/theme-neutral`)
- Data: server fns from module `*.functions.ts` or public queries — never `internal/`

**New Customer Request API operation:**
- Domain semantics: `src/modules/customer-request/`
- HTTP handler: `src/lib/server/customer-request-*-api.ts`
- Route wrapper: `src/routes/api.requests.*.ts` and mirror under `api.v1.requests.*.ts` for agents
- Convex application: `convex/customerRequestApplication.ts` / related V2 files
- Update: `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md` when authority moves

**Utilities:**
- Shared IDs/hash/result: `src/modules/common/`
- HTTP/security helpers: `src/lib/http/`, `src/lib/server/`
- Do not put domain rules in `src/lib/` or route files

**Capability / provider adapter:**
- Contracts: `src/modules/capability-contract/`, registry in `capability-contract-registry/`, supply in `capability-supply/`
- Kernel binding: `src/modules/routing-kernel/http-capability-binding.ts`
- Sandbox-only supply: `src/modules/sandbox-supply/` + Convex sandbox HTTP in `convex/http.ts`

## Special Directories

**src/modules/*/internal/**
- Purpose: Private implementation for one domain
- Source: Hand-written
- Committed: Yes
- Rule: Routes and other modules must import `public.ts` only (`tests/imports/private-imports.test.ts`)

**convex/_generated/**
- Purpose: Convex API/dataModel types and server stubs
- Source: `npx convex` codegen
- Committed: Yes (typical for this repo)

**src/routeTree.gen.ts**
- Purpose: Generated TanStack route tree
- Source: TanStack Start / router plugin
- Committed: Yes — regenerate via build/dev, do not edit

**examples/** and **outputs/**
- Purpose: Prototypes and simulation HTML/JSON artifacts
- Source: Local/experimental runs
- Committed: Mixed — examples yes; large `outputs/` often local artifacts

**.planning/codebase/**
- Purpose: Stack/architecture/structure/conventions maps for GSD planners
- Source: `/gsd-map-codebase` mapper agents
- Committed: Yes when refreshed

**node_modules/, .output/, test-results/, playwright-report/**
- Purpose: Dependencies and ephemeral test/build output
- Source: Install/build/test
- Committed: No

---

*Structure analysis: 2026-07-17*  
*Update when directory structure changes*  
*Mapped from commit `7deffac41e103ee619ce099db531fc2127ba9985`*
