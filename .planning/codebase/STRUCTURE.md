# Codebase Structure

**Analysis Date:** 2026-08-09

## Directory Layout

The repository is a TypeScript/TanStack Start + React + Convex application with domain modules, file-based routes, a durable Convex backend, an external-agent CLI, and separate evaluation/test trees. This is a physical layout map; conceptual responsibilities and runtime flows are in `.planning/codebase/ARCHITECTURE.md`.

```text
Agentic-Economy/
├── src/
│   ├── routes/                         TanStack file routes and HTTP handlers
│   │   ├── _operator/                   owner/admin/developer/agent-access routes
│   │   └── [.]well-known/               discovery and OAuth metadata routes
│   ├── components/
│   │   ├── ae/                          product UI grouped by surface
│   │   ├── ai-elements/                 AI chat/prompt/rendering primitives
│   │   └── ui/                          shared UI primitives
│   ├── modules/
│   │   ├── answer/, answer-thread/      answer contracts and durable chat
│   │   ├── capability-supply/, ...      capability admission and provider supply
│   │   ├── customer-request/, ...       request, authority, work-tree, inquiry domains
│   │   └── common/, actions/             shared primitives and explicit action registry
│   ├── lib/
│   │   ├── server/, http/, client/      runtime, transport, and boundary adapters
│   │   ├── observability/, deployment/  telemetry and deployment guards
│   │   └── operator/, claim/, ui/       surface helpers and contract scanners
│   ├── styles/                          global and base CSS
│   ├── content/                         maintained brand/copy constants
│   ├── hooks/                           narrow React hooks
│   ├── start.ts                         TanStack Start middleware/bootstrap
│   ├── router.tsx                       browser router factory
│   └── routeTree.gen.ts                 generated route graph
├── convex/
│   ├── schema.ts                        composed durable table schema
│   ├── answerThreads.ts, registry.ts   answer and public registry adapters
│   ├── business.ts, catalog.ts         business/catalog commands and reads
│   ├── capability*.ts                   publication, readiness, operations, invocation
│   ├── customerRequest*.ts              request application, routes, workers, journals
│   ├── workTrees.ts, projectSpine.ts    project/decision persistence and orchestration
│   ├── moneyLedger.ts, inquiries.ts     exact money and inquiry persistence
│   ├── http.ts, crons.ts                Convex HTTP registration and scheduled jobs
│   └── _generated/                      generated Convex references and data model
├── tests/
│   ├── unit/, integration/              deterministic and source/runtime tests
│   ├── e2e/, deploy-smoke/              browser and deployment journeys
│   ├── imports/, types/, ui-contract/   architecture/type/UI contract gates
│   ├── fixtures/, helpers/, setup/      explicit test state, ports, and setup
│   ├── eval/, seo/                      evaluation and discovery/SEO contracts
│   └── scripts/                         test-support and graph freshness checks
├── tools/
│   ├── ae/                              external-agent/human CLI
│   ├── dev/                             local lifecycle and evidence tools
│   ├── release/                          deployment and release proof tools
│   └── graphify/                         repository graph tooling
├── eval/
│   ├── answer/, toolcall/, braintrust/  answer and model/tool evaluations
│   ├── quality/, parity/                 quality gates and provider parity
│   ├── consumer/                         consumer comparison rubrics
│   └── product-foundry/                  action-bundle/product-foundry analysis
├── public/                               browser-served brand and image assets
├── vendor/                               vendored protocol/reference inputs
├── handshake-protocol-kernel/            adjacent protocol/kernel source
├── scripts/                              repository maintenance scripts
├── .planning/
│   └── codebase/                         maintained current-state maps
└── package.json, tsconfig.json, vite.config.ts
```

The module list intentionally groups the many current roots. Concrete module directories include `capability-execution`, `agent-access`, `business`, `sandbox-supply`, `customer-request`, `action-invocation`, `money`, `capability-supply`, `common`, `answer`, `answer-thread`, `catalog`, `storefront`, `inquiries`, `discovery`, `work-tree`, `registry`, `external-run`, `study`, `actions`, `harness`, `business-tools`, `security`, `governed-action`, `project-spine`, `model-gateway`, `settings`, `notification-outbox`, `demand`, `routing-kernel`, `provider-integrations`, `imported-commitment`, `capability-contract`, `capability-contract-registry`, `network-guard`, `seo`, `observability`, and `dev` under `src/modules/`.

## Directory Purposes

- **`src/routes/`:** Each file is a TanStack route module. Page routes define loaders/components; API files define server handlers with method guards and delegate to module public/server seams. `src/routes/api.$.ts` is the API RFC 9457 catch-all. Routes do not import Convex transport/schema or module internals.
- **`src/components/`:** React presentation grouped by product surface. `src/components/ae/chat/` renders answer streams and projections; `src/components/ae/supply/` renders provider admission; `src/components/ae/customer-request/` and `src/components/ae/work-tree/` render durable workflow state; `src/components/ui/` contains reusable primitives.
- **`src/modules/`:** Primary conceptual packages and import boundaries. Most domains expose `public.ts`; implementation, Convex schema fragments, policy, and protocol details live in `internal/` or named adapters such as `*.functions.ts`, `*.actions.ts`, and `*.server.ts`.
- **`src/lib/`:** Framework/server/client glue rather than a second domain layer. `src/lib/server/convex-source.ts`, `problem.ts`, `bounded-request-body.ts`, auth, rate, source-write, and request-correlation code are shared adapters; `src/lib/ui/contract-scans.ts` implements import/UI contract scans.
- **`convex/`:** Durable functions, validators, table composition, workers, scheduled jobs, and Convex-side ports. `convex/schema.ts` is the source of the deployed table bundle; `convex/_generated/` is generated output.
- **`tests/`:** Placement follows boundary: unit tests mirror modules/UI, integration tests exercise source/runtime seams, `tests/e2e/` drives browser journeys, and `tests/imports/` enforces architectural restrictions. `tests/helpers/` owns local ports and fixtures rather than production modules.
- **`tools/ae/`:** The CLI dispatcher is `tools/ae/cli.ts`; commands under `tools/ae/commands/` cover ask, invoke, request, search, discovery, policy, manifest, study, journey, and evidence/evaluation flows; `tools/ae/lib/` contains argument, output, feed, and validation helpers.
- **`eval/`:** Evaluation is deliberately outside product runtime. `eval/answer/` runs prompt/evidence suites, `eval/toolcall/` exercises execution, `eval/braintrust/` integrates model evaluation, and `eval/quality/`/`eval/parity/` hold scoring and comparison gates.
- **`public/`, `vendor/`, and `handshake-protocol-kernel/`:** Static assets and adjacent protocol/reference inputs; AE domain code belongs under `src/modules/`, not these trees.

## Key File Locations

- **Runtime:** `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, and generated `src/routeTree.gen.ts`.
- **Answer:** `src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.answer.turn.stop.ts`, `src/components/ae/chat/AeChat.tsx`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, and `convex/answerThreads.ts`.
- **Public Services/registry:** `src/routes/api.v1.services.ts`, `src/routes/api.v1.services.search.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/internal/services-api-projection.ts`, `src/modules/registry/internal/service-projection.ts`, and `convex/registry.ts`.
- **Capability supply:** `src/routes/_operator/owner.supply.tsx`, `src/routes/_operator/owner.supply.$offeringRef.tsx`, `src/modules/capability-supply/supply-funnel.functions.ts`, `src/modules/capability-contract/public.ts`, `convex/capabilitySupply.ts`, and `convex/capabilitySupplyOwnerFunnel.ts`.
- **Execution/gateway:** `src/routes/api.v1.operations.execute.ts`, `src/lib/server/operation-invoke-api.ts`, `src/modules/capability-execution/operation-execute.functions.ts`, `src/modules/capability-execution/operation-invoke.ts`, `convex/capabilitySupplyOperations.ts`, and `convex/capabilityOperationInvocations.ts`.
- **Machine surfaces:** `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`, `src/routes/api.v1.requests.ts`, and `src/lib/server/customer-request-agent-api.ts`.
- **Shared contracts:** `src/lib/errors.ts`, `src/lib/server/problem.ts`, `src/lib/server/convex-source.ts`, `src/modules/common/canonical-digest.ts`, and `src/modules/money/public.ts`.

## Naming Conventions

- Ordinary source files use lowercase kebab-case (`bounded-request-body.ts`, `canonical-digest.ts`); React components use PascalCase and product components normally carry the `Ae` prefix (`AeChat.tsx`).
- TanStack route filenames encode URL structure and layouts: `t.$threadId.tsx`, `s.$shareToken.tsx`, `_operator.tsx`, `__root.tsx`, and dot-separated API segments such as `api.v1.services.ts`.
- Module public entrypoints are `public.ts`; server/action adapters use `*.functions.ts`, `*.actions.ts`, or `*.server.ts`; implementation and schema fragments are under `internal/`.
- Convex exports use camelCase (`reserveAnswerTurn`, `readKeylessExecutable`), while table roots are lower camelCase plurals (`answerThreads`, `capabilityPublications`).
- Public operation identity uses `operation:v1:<digest>`; canonical hashes and exact money values come from shared module helpers, not ad hoc strings or floating-point amounts.
- Tests use `.test.ts`/`.test.tsx`; browser journeys use `.spec.ts`; test directories mirror the domain or boundary being tested.

## Where to Add New Code

- Add a browser page or HTTP endpoint under `src/routes/`, using `createFileRoute`; parse/guard/projection at the adapter, and delegate domain work to a public module/server function. Do not hand-edit `src/routeTree.gen.ts`.
- Add domain behavior to the closest existing `src/modules/<domain>/`; put exported contracts in `public.ts`, implementation in `internal/`, and source adapters in named module files. Do not create a parallel utility or registry layer.
- Add a machine operation as a `defineAction` contract in its owning module and register it explicitly in `src/modules/actions/index.ts`; declare surfaces, authority, consequence, and schema there.
- Add provider capability supply through `src/modules/capability-supply/` import/preflight/admission/publication seams and its owner funnel, not through a route or seed-only shortcut.
- Add durable state/functions to the relevant `convex/*.ts` module and schema fragment; use Convex validators, source-write/identity checks, and a server/module adapter. Routes must call `src/lib/server/convex-source.ts` or module server functions.
- Add answer work to `src/modules/answer/` for typed artifacts/gates or `src/modules/answer-thread/` for durable orchestration/readback, keeping browser reducers aligned with persisted projections.
- Add Customer Request behavior to `src/modules/customer-request/`; keep interpretation/compilation proposal-only and place authority/effects in mandate and action-invocation seams.
- Add CLI behavior under `tools/ae/commands/` and evaluation behavior under the matching `eval/` directory, reusing public actions and RFC 9457 output projection.
- Add tests beside the boundary under `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/imports/`, or the named contract root; use `tests/helpers/` for explicit test-only ports and fixtures.

## Special Directories

- **Generated:** `src/routeTree.gen.ts` and `convex/_generated/` are generated outputs. Modify route/schema/function sources, not these files.
- **Local/deployment output:** `.convex/`, `convex_local_storage/`, `.tanstack/`, `.vercel/`, `.output/`, `dist/`, `build/`, `coverage/`, `test-results/`, `playwright-report/`, `output/`, and `outputs/` are local/generated artifacts, not source placement targets.
- **Configuration and secrets:** `.env*`, `convex/auth.config.ts`, deployment manifests, and local Convex state are environment/deployment inputs. Maps may name variables or paths but must not contain secret values.
- **Development/test doubles:** `tests/helpers/`, `tests/fixtures/`, `src/lib/dev/`, `src/modules/dev/`, `src/modules/sandbox-supply/`, and development evidence tools are isolated from deployable production target graphs by import-boundary contracts. `convex/devSeed.ts` and `convex/curatedProviders.ts` are seed/bootstrap sources, not route adapters.
- **Maintained maps and planning:** `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/PROMPT-DATA-FLOW.md`, and `.planning/codebase/IA-DATA-FLOW.md` are maintained maps; `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, and `.planning/adr/` describe planning/decisions rather than runtime source.

*Structure analysis: 2026-08-09*

_Refresh marker: current physical-tree refresh completed 2026-08-09. Keep this layout map synchronized with generated route/schema outputs and the public/internal module boundaries._
