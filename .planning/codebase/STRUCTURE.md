# Codebase Structure
**Analysis Date:** 2026-08-11

## Directory Layout
```text
.
├── src/
│   ├── routes/                 TanStack file-based pages, layouts, HTTP and well-known handlers
│   ├── modules/                bounded contexts (`public.ts`, implementation, `internal/`)
│   ├── components/             React UI (`ae/`, `ui/`, `ai-elements/`)
│   ├── lib/                    server/client/http/deployment/observability helpers
│   ├── hooks/                  reusable React hooks
│   ├── content/                governed copy/content
│   ├── styles/                 global and base CSS
│   ├── start.ts, router.tsx    TanStack Start and browser-router bootstrap
│   └── routeTree.gen.ts        generated TanStack route graph
├── convex/
│   ├── schema.ts, http.ts, crons.ts  schema composition, Convex HTTP, schedules
│   ├── *_*.ts / *.*.ts hosts   queries, mutations, actions, ports, and workers
│   └── _generated/             generated Convex API/data-model bindings
├── tools/
│   ├── ae/                     external-agent CLI (`cli.ts`, `commands/`, `lib/`)
│   ├── dev/                    local evidence, smoke, and development utilities
│   └── release/                deployment checks and production smoke tooling
├── tests/                      unit, integration, e2e, imports, fixtures, eval, SEO, and smoke suites
├── eval/                       answer/quality/consumer/product-foundry evaluation programs
├── public/, examples/          static assets and sample integrations
├── docs/, vendor/               repository documentation and vendored protocol material
├── .planning/                  project plans, ADRs, research, and codebase maps
└── package.json, vite.config.ts, tsconfig*.json, playwright*.ts, vitest.config.ts
```

## Directory Purposes
- `src/routes/` is the only file-based route tree. Root pages sit beside API handlers; `_operator/` is a pathless authenticated layout for owner/admin/developer pages; `[.]well-known/` contains protocol metadata routes; `$slug*`, `$requestRef*`, `$threadId*`, and `$shareToken*` are dynamic route segments.
- `src/modules/` is organized by bounded context. The supported module surface is normally `public.ts`; server/source adapters use names such as `*.functions.ts`, `*.actions.ts`, `server.ts`, or `convex.ts`; private policy, schemas, ports, and projections belong under that module's `internal/` directory.
- `src/components/` holds React presentation. Domain-specific AE compositions are under `components/ae/`; reusable primitives are under `components/ui/`; chat/AI building blocks are under `components/ai-elements/`. Shared non-visual browser/server helpers live in `src/lib/` and `src/hooks/`.
- `convex/` is the backend host layer. Top-level files map to Convex function namespaces (for example `answerThreads.ts`, `capabilitySupply.ts`, `registry.ts`, and `capabilityOperationInvocations.ts`); module-owned table definitions are imported into `convex/schema.ts` from `src/modules/**/internal/`.
- `tools/ae/` is the external-facing CLI; `tools/dev/` and `tools/release/` are operational/evidence entry points rather than application modules. `tests/` mirrors behavior and boundary types; `eval/` contains model/quality evaluation assets rather than runtime code.
- `.planning/` contains project authority/planning artifacts. `.planning/codebase/ARCHITECTURE.md` and `STRUCTURE.md` are this map; `PROMPT-DATA-FLOW.md` and `IA-DATA-FLOW.md` are separately maintained maps.

## Key File Locations
| Need | Location |
| --- | --- |
| TanStack Start request middleware | `src/start.ts` |
| Browser router and generated route graph | `src/router.tsx`, `src/routeTree.gen.ts` |
| Global document/layout | `src/routes/__root.tsx` |
| New/existing Answer UI | `src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx`, `src/components/ae/chat/` |
| Public registry HTTP routes | `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.v1.services.ts`, `src/routes/api.v1.services.search.ts` |
| Answer stream endpoint | `src/routes/api.answer.turn.ts` |
| Authenticated operation gateway | `src/routes/api.v1.operations.execute.ts`, `src/lib/server/operation-invoke-api.ts` |
| Owner supply UI and server functions | `src/routes/_operator/owner.supply*.tsx`, `src/modules/capability-supply/supply-funnel.functions.ts` |
| Machine action registry/MCP host | `src/modules/actions/index.ts`, `src/lib/server/mcp-api.ts`, `src/routes/mcp.ts` |
| Canonical module interfaces | `src/modules/*/public.ts` |
| Convex schema and host functions | `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/*.ts` |
| CLI command dispatch | `tools/ae/cli.ts`, `tools/ae/commands/`, `tools/ae/lib/` |
| Import/route boundary checks | `tests/imports/`, `src/lib/ui/contract-scans.ts` |
| Test setup and shared fixtures | `tests/setup/`, `tests/helpers/`, `tests/fixtures/` |

## Naming Conventions
- TanStack route filenames encode URL structure: dots separate path segments (`api.v1.services.ts`), `$name` denotes a dynamic parameter (`api.v1.operations.$invocationRef.ts`), `t.new.tsx` is the fresh-thread route, `_operator` is a pathless layout, and `[.]well-known`/`[.]xml` escape literal dots.
- Domain folders use lower kebab-case (`capability-supply`, `answer-thread`, `customer-request`). Public module seams are `public.ts`; source adapters, actions, server adapters, and Convex-facing helpers commonly use `.functions.ts`, `.actions.ts`, `.server.ts`, `server.ts`, or `convex.ts` according to their host.
- Convex host namespaces use descriptive camelCase files (`capabilitySupply.ts`, `answerThreads.ts`, `moneyLedger.ts`); internal port/helper files may use the longer domain name plus suffix (`customerRequestRouteExecutionJournalPorts.ts`).
- Runtime tests use `*.test.ts`/`*.test.tsx` and browser tests use `*.spec.ts`; directories express the test type (`unit`, `integration`, `e2e`, `deploy-smoke`, `imports`, `seo`, `ui-contract`, `types`).
- CLI commands are lower-case modules in `tools/ae/commands/` and are explicitly mapped in `tools/ae/cli.ts`; release/dev scripts use descriptive kebab-case or phase names.

## Where to Add New Code
- Add a page, API handler, or protocol metadata endpoint under `src/routes/` using TanStack's filename grammar. Keep route code as an adapter: validate/serialize there, and call an existing module public seam rather than importing `convex/browser`, `convex/server`, a module `internal/` file, or raw Convex schema.
- Add reusable domain validation, normalization, pure state transitions, projections, or ports under the appropriate `src/modules/<context>/` directory. Export supported contracts through that context's `public.ts`; put implementation-only details in `internal/` and update callers through the public seam.
- Add a machine action beside its domain (`<context>.actions.ts`) and register it explicitly in `src/modules/actions/index.ts`. Declare surfaces, read-only/effect class, authority, retry, and schemas in the action; expose HTTP/MCP only through their existing adapters.
- Add persistence or backend orchestration in the matching `convex/<namespace>.ts` host and add table definitions through the module's `internal/schema.ts` or `internal/convex-schema.ts` composition consumed by `convex/schema.ts`. Put long-running or provider-effect work in an existing Convex action/worker seam, not in a route.
- Add a CLI command in `tools/ae/commands/`, wire it in `tools/ae/cli.ts`, and reuse public HTTP/action/executor contracts. Use `tools/dev/` for local evidence/smoke helpers and `tools/release/` for deployment-gated tooling.
- Place tests next to the behavior's test category: pure/domain contracts in `tests/unit/`, source/Convex paths in `tests/integration/`, browser journeys in `tests/e2e/`, boundary rules in `tests/imports/`, hosted checks in `tests/deploy-smoke/`, and model/evaluation cases in `tests/eval/` or `eval/`.

## Special Directories
- `convex/_generated/` and `src/routeTree.gen.ts` are generated outputs. Convex regenerates API/data-model bindings; TanStack Router regenerates the route graph. Do not hand-edit either.
- `.convex/` and `convex_local_storage/` are local Convex deployment/storage state, not application source. Treat persisted local rows/files as disposable development artifacts and never use them as code contracts.
- `.vercel/`, `.vinxi/`, `.output/`, `dist/`, and `.tanstack/` are framework/deployment build outputs or metadata. `node_modules/` is installed dependency state.
- `test-results/`, `playwright-report/`, `coverage/`, `output/`, and `outputs/` hold test, browser, evaluation, release, or generated reports. They should not be imported by runtime code.
- `.env*` files (except the committed `.env.example`) and `.clerk/` can contain credentials/configuration; document environment variable names, never values. `.promptfoo-home/`, `.react-doctor/`, `graphify-out/`, and `.planning/graphs/` are tool-generated/cache directories; `.planning/graphs/` is explicitly ignored.
- `public/` is a static asset root served by the web app; `docs/codemap/` contains generated code-map artifacts. `vendor/handshake-protocol-kernel/` is vendored protocol material and is not a replacement for the runtime module seams.

---
*Structure analysis: 2026-08-11*
*Update when directory structure changes*
