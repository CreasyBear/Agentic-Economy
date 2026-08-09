# Codebase Structure

**Analysis Date:** 2026-08-09

## Directory Layout

The repository is a TypeScript/TanStack Start + React + Convex application. The tree below is intentionally limited to two or three levels; domain details belong in `ARCHITECTURE.md`, and maintained runtime traces belong in `.planning/codebase/PROMPT-DATA-FLOW.md` and `.planning/codebase/IA-DATA-FLOW.md`.

```text
Agentic-Economy/
├── src/
│   ├── routes/                         file-based pages and HTTP adapters
│   │   ├── _operator/                  operator layout/leaf routes
│   │   ├── [slug-like route files]     public, inquiry, API, discovery routes
│   │   └── __root.tsx, _operator.tsx   root/pathless layouts
│   ├── components/
│   │   ├── ae/                         product UI, chat, plans, operator surfaces
│   │   ├── ui/                         shared UI primitives
│   │   └── ai-elements/                 AI presentation primitives
│   ├── modules/
│   │   ├── answer/, answer-thread/      answer contracts and durable chat ports
│   │   ├── capability-supply/, ...      provider admission and supply domains
│   │   ├── customer-request/, ...       request, authority, inquiry, work-tree domains
│   │   └── common/, actions/             shared primitives and action registry
│   ├── lib/
│   │   ├── server/, http/, client/      runtime adapters and boundary helpers
│   │   ├── operator/, claim/, ui/       surface-specific helpers
│   │   └── observability/, dev/          instrumentation and local tooling
│   ├── styles/                          globals.css and base.css
│   ├── content/                         maintained brand/copy constants
│   ├── hooks/                           small React hooks
│   ├── router.tsx                       browser router factory
│   ├── routeTree.gen.ts                 generated TanStack route graph
│   └── start.ts                         TanStack Start middleware/runtime entry
├── convex/
│   ├── schema.ts                        durable table bundle root
│   ├── answerThreads.ts, registry.ts   answer and registry functions
│   ├── capability*.ts                   capability publication/readiness/operation functions
│   ├── customerRequest*.ts              request compilation, routes, workers, evidence
│   ├── catalog.ts, business.ts          business/catalog source commands and reads
│   ├── workTrees.ts, projectSpine.ts    project/decision persistence and orchestration
│   ├── moneyLedger.ts, inquiries.ts    financial and inquiry persistence
│   ├── _generated/                      Convex-generated API/server/data model
│   └── http.ts, crons.ts                Convex HTTP routes and scheduled jobs
├── tests/
│   ├── unit/                            domain, UI, route, action, and adapter tests
│   ├── integration/                     source/runtime boundary tests
│   ├── e2e/                             browser journeys
│   ├── deploy-smoke/                    deployed smoke specifications
│   ├── imports/, types/, ui-contract/   architecture/type/UI contract gates
│   ├── seo/                             discovery/SEO contract tests
│   ├── helpers/, setup/, fixtures/      test ports, setup, and explicit fixtures
│   └── scripts/                         graph freshness and test-support checks
├── tools/
│   ├── ae/                              public CLI and command adapters
│   └── dev/, graphify/, scripts/        local lifecycle, graph, and repository tools
├── eval/
│   ├── toolcall/, answer/, engine/      model/tool/engine evaluation harnesses
│   ├── quality/, consumer/              quality gates and comparison rubrics
│   ├── parity/                          provider/parity checks and results
│   └── product-foundry/                 portfolio/action-bundle experiments
├── public/                              static favicon, image, logo, brand assets
├── vendor/                              vendored protocol/reference material
├── handshake-protocol-kernel/           adjacent protocol/kernel source
├── scripts/                             repository maintenance scripts
├── .planning/                           project planning, ADRs, requirements, and maps
│   └── codebase/                        generated/current codebase maps
├── package.json, tsconfig.json, vite.config.ts
└── .gitignore                            generated/local-output policy
```

The nested names marked with `...` are representative groups rather than a claim that every module is listed. Current module directories are visible under `src/modules/`, current route files under `src/routes/`, and current Convex functions under `convex/`.

## Directory Purposes

- **`src/routes/`:** Each file is a TanStack file-route module and may define a page loader/component or a server handler. `src/routes/api.answer.turn.ts`, `src/routes/api.v1.services.ts`, and `src/routes/mcp.ts` are representative adapter files. The generated route graph is `src/routeTree.gen.ts`; route files should not own direct Convex transport/schema imports (`tests/imports/route-boundary.test.ts`).
- **`src/components/`:** React presentation is grouped by product surface. `src/components/ae/chat/` contains the answer stream/reducer/composer pieces; `src/components/ae/layout/` contains public/operator shells; `src/components/ui/` contains reusable primitives. Components consume module projections and route/server-function contracts rather than Convex rows (`src/components/ae/artifacts/AeGenerativeAnswer.tsx`).
- **`src/modules/`:** Domain packages are the primary conceptual units. Most packages have a `public.ts` contract and `internal/` implementation; examples include `src/modules/answer/public.ts`, `src/modules/answer-thread/`, `src/modules/capability-supply/`, `src/modules/customer-request/`, and `src/modules/work-tree/`. `src/modules/actions/index.ts` is the central explicit action registry; `src/modules/common/` holds deterministic shared primitives.
- **`src/lib/`:** Cross-cutting framework/server/client glue lives here: RFC error projection (`src/lib/errors.ts`), Convex/Clerk/session adapters (`src/lib/server/`), operator options (`src/lib/operator/`), browser telemetry (`src/lib/observability/`), and UI contract scanners (`src/lib/ui/`). It is not a second domain module layer.
- **`src/styles/`, `src/content/`, `src/hooks/`:** `src/styles/globals.css` imports/defines app-wide tokens and utilities; `src/styles/base.css` supplies base resets; `src/content/brand-copy.ts` keeps maintained copy constants; `src/hooks/` contains narrow React hooks such as `use-mobile.ts` and `use-client-mounted.ts`.
- **`convex/`:** Convex functions, schema bundles, durable workers, migrations, and tests are colocated. `convex/schema.ts` composes tables; `convex/answerThreads.ts`, `convex/registry.ts`, and `convex/customerRequestApplication.ts` expose durable source operations; `convex/capabilitySupplyOperations.ts` exposes fail-closed executable-operation readers; `convex/http.ts` and `convex/crons.ts` are runtime registration files.
- **`tests/`:** Test placement follows execution boundary. Unit tests sit under domain/UI names (`tests/unit/answer/`, `tests/unit/chat/`, `tests/unit/capability-supply/`); integration tests exercise source/runtime seams (`tests/integration/`); browser journeys are `tests/e2e/`; import/type/UI/SEO contracts live in their named roots. Shared ports and explicit state fixtures are in `tests/helpers/`, `tests/setup/`, and `tests/fixtures/`.
- **`tools/`:** `tools/ae/cli.ts` is the machine-readable/human CLI entry and `tools/ae/commands/` contains command handlers. `tools/dev/` owns local lifecycle/cleanup/papercut utilities; `tools/graphify/` and `tools/scripts/` are repository-support tooling.
- **`eval/`:** Evaluation is separate from product runtime. `eval/answer/`, `eval/toolcall/`, and `eval/engine/` contain model/agent probes; `eval/quality/` contains scoring/judging gates; `eval/parity/` records parity checks; `eval/product-foundry/` contains product-foundry analysis code.
- **`public/`:** Browser-served static assets are grouped under `public/images/`, `public/illustration/`, `public/brand/`, and `public/logo/`, with `public/favicon.svg` as the favicon. No server/domain logic belongs here.
- **Planning and adjacent inputs:** `.planning/` contains requirements, ADRs, project state, and codebase maps; `vendor/` and `handshake-protocol-kernel/` are adjacent protocol/reference inputs and are not substitutes for `src/modules/` domain code.

## Key File Locations

- **Runtime and route graph:** `src/start.ts` owns middleware/runtime assembly, `src/router.tsx` creates the browser router, `src/routes/__root.tsx` mounts the document, and `src/routeTree.gen.ts` is the generated route graph.
- **Buyer answer surface:** `src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx`, `src/routes/api.answer.turn.ts`, and `src/routes/api.answer.turn.stop.ts` are the new-thread, thread, submit, and Stop entrypoints; `src/components/ae/chat/AeChat.tsx` and `src/components/ae/chat/AeThreadTurnStreamSection.tsx` are the main browser adapters.
- **Public machine surface:** `src/modules/common/action.ts` defines action contracts, `src/modules/actions/index.ts` registers them, `src/routes/mcp.ts` exposes MCP, `src/routes/for-agents.tsx` exposes agent guidance, and `tools/ae/cli.ts` is the CLI entrypoint.
- **Domain and source ports:** `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/capability-execution/operation-execute.functions.ts`, `src/modules/registry/registry.functions.ts`, and `src/modules/customer-request/compiler.ts` are representative durable-answer, execution, registry, and proposal compilers.
- **Backend roots:** `convex/schema.ts` composes tables, `convex/answerThreads.ts` owns durable answer state, `convex/capabilitySupplyOperations.ts` reads executable descriptors, `convex/registry.ts` projects registry data, and `convex/customerRequestApplication.ts` executes Customer Request actions.
- **Boundary helpers and contracts:** `src/lib/errors.ts`, `src/lib/server/problem.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/bounded-request-body.ts`, and `tests/imports/route-boundary.test.ts` define the shared error, source, input-bound, and route-import seams.
- **Verification surfaces:** `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/deploy-smoke/`, `tests/imports/`, `tests/types/`, `tests/ui-contract/`, and `tests/seo/` partition product and architecture checks; `eval/` and `tools/` hold evaluation and operational tooling.

## Naming Conventions

- **Files and routes:** Source files use lowercase kebab-case for ordinary modules (`bounded-request-body.ts`, `canonical-digest.ts`), while React components use PascalCase (`AeChat.tsx`, `AePublicShell.tsx`). TanStack file routes encode path parameters and layouts in filenames (`t.$threadId.tsx`, `s.$shareToken.tsx`, `_operator.tsx`, `__root.tsx`), and API route dots mirror URL segments (`api.answer.turn.ts`).
- **Module boundaries:** Public entrypoints are `public.ts`; server/Convex adapter files are named `*.functions.ts`, `*.actions.ts`, or `*.server.ts`; implementation details are under `internal/`. Public types use descriptive nouns (`AnswerTurnFrame`, `ServiceDto`, `CapabilityPublicationImport`), and outcomes are discriminated by `kind`/`status` (`src/lib/errors.ts`, `src/modules/capability-execution/public.ts`, `src/modules/capability-execution/operation-execute.functions.ts`).
- **React components:** Product components use the `Ae` prefix and PascalCase (`src/components/ae/`); generic shadcn-style pieces use short PascalCase names (`src/components/ui/`). Hooks use `use-` kebab-case (`src/hooks/use-mobile.ts`).
- **Convex functions and tables:** Convex functions use camelCase exports (`reserveAnswerTurn`, `readKeylessExecutable`) and table names are plural lower camelCase (`answerThreads`, `capabilityPublications`, `customerRequests`) (`convex/answerThreads.ts`, `convex/capabilitySupplyOperations.ts`, `convex/schema.ts`).
- **Identifiers:** Canonical hashes/digests are generated through shared helpers rather than ad hoc string concatenation (`src/modules/common/canonical-digest.ts`, `src/modules/common/stable-hash.ts`). Public operations use `operation:v1:<digest>` references and capability IDs use explicit contract/version identity (`src/modules/capability-supply/public.ts`).
- **Tests:** Tests use `.test.ts`/`.test.tsx`; browser journeys use `.spec.ts`; folders generally mirror the domain or boundary under test (`tests/unit/answer/`, `tests/integration/`, `tests/e2e/`, `tests/imports/`).

## Where to Add New Code

- Add a **new browser page or HTTP API** as a file under `src/routes/` using TanStack `createFileRoute`; keep request parsing, method guards, rate limits, and response projection in the route/server seam, and delegate domain work to a module public function. Update is generated into `src/routeTree.gen.ts`, not hand-edited (`src/routes/api.v1.services.ts`, `src/lib/server/method-guard.ts`).
- Add **new domain behavior** under the closest existing `src/modules/<domain>/` package. Put public DTOs/ports in `public.ts`, server/action adapters in named `*.functions.ts`/`*.actions.ts`, and policy/implementation in `internal/`; do not create a parallel utility layer (`src/modules/registry/`, `src/modules/capability-supply/`, `src/modules/customer-request/`).
- Add **a machine operation** as a typed `defineAction` contract in the owning module, then import it and add it to `src/modules/actions/index.ts`. Declare surfaces/authority/parameter metadata there; do not rely on module-evaluation side effects (`src/modules/common/action.ts`, `src/modules/actions/index.ts`).
- Add **a provider capability** through the capability-supply import/admission pipeline, not a route or seed-only shortcut. Use `CapabilityPublicationImport`, normalization, contract validation, offering/binding admission, lifecycle, and projection seams (`src/modules/capability-supply/internal/publication-importers.ts`, `src/modules/capability-supply/internal/publication/admit.ts`).
- Add **a durable backend operation** to the appropriate `convex/*.ts` module and schema bundle. Use Convex validators and source-write/identity helpers, export the typed function through the module's public/server adapter, and avoid importing `convex/_generated` or raw Convex transport into routes (`convex/schema.ts`, `src/lib/server/convex-source.ts`, `tests/imports/route-boundary.test.ts`).
- Add **answer behavior** in `src/modules/answer/` or `src/modules/answer-thread/` according to whether it is a typed answer artifact/gate or durable orchestration/readback. Keep stream frames and browser reducers aligned with persisted projections (`src/modules/answer/answer-ui-stream.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/components/ae/chat/projection-merge.ts`).
- Add **Customer Request behavior** in `src/modules/customer-request/` and the corresponding Convex application/route modules. Keep model interpretation proposal-only; place approval/mandate/effect authority in route mandate/action invocation contracts (`src/modules/customer-request/compiler.ts`, `src/modules/customer-request/route-mandate.ts`, `src/modules/action-invocation/`).
- Add **tests** beside the tested boundary: unit for deterministic module contracts, integration for source/HTTP behavior, e2e for browser journeys, and import/type/UI/SEO contract tests for architectural constraints. Reuse helpers/fixtures rather than adding test-only production seams (`tests/helpers/`, `tests/fixtures/`, `tests/imports/`).
- Add **CLI/evaluation behavior** under `tools/ae/commands/` or the matching `eval/` subdirectory, reusing public actions and shared problem/output projection (`tools/ae/cli.ts`, `tools/ae/lib/output.ts`, `eval/toolcall/`, `eval/answer/`).

## Special Directories

- **Generated:** `src/routeTree.gen.ts` is generated by TanStack Router; `convex/_generated/` is generated by Convex codegen. `tsconfig.json` excludes generated/build directories where appropriate. Treat both as outputs; change their source route/schema/function inputs instead of editing generated files.
- **Local/deployment output:** `.convex/`, `.tanstack/`, `.vercel/`, `.output/`, `dist/`, `build/`, `coverage/`, `test-results/`, `playwright-report/`, and runtime `output/`/`outputs/` are generated or local artifacts governed by `.gitignore`; they may contain local databases, logs, reports, or blobs and are not source placement targets.
- **Secrets/config:** `.env`, `.env.*`, deployment config, and local Convex state are environment inputs. Commit variable names/config schema only; never write secret values into source, tests, maps, or fixtures (`.gitignore`, `convex/auth.config.ts`, `src/lib/server/convex-source.ts`).
- **Maintained maps:** `.planning/codebase/PROMPT-DATA-FLOW.md` and `.planning/codebase/IA-DATA-FLOW.md` are separately maintained detailed maps. This document links to them but does not replace or edit them. `.planning/codebase/ARCHITECTURE.md` is the conceptual companion; this file remains the physical layout map.
- **Planning documents:** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, and `.planning/adr/` describe project decisions and requirements, not runtime source. Codebase map files belong only in `.planning/codebase/`.
- **Vendored/adjacent code:** `vendor/` and `handshake-protocol-kernel/` are tracked adjacent inputs. Inspect and update them only when a task explicitly targets that integration; do not place AE domain logic there.
- **Tests inside Convex:** Some Convex-domain tests are colocated under `convex/` (for example `convex/workTrees.test.ts` and `convex/customerRequestRouteMandate.test.ts`) because they exercise durable function behavior. They are test sources, not deployed functions, and follow the same source-of-truth boundaries as their neighboring modules.

*Structure analysis: 2026-08-09*

_Update note: refreshed from the current dirty working tree on 2026-08-09. Keep the two-level physical tree practical and current; add a path to the appropriate purpose/naming section when a durable module, route, generated output, or test boundary changes._
