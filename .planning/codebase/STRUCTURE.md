# Codebase Structure
**Analysis Date:** 2026-08-12

## Directory Layout
The current working tree is a full-stack TypeScript application with a Convex backend, a TanStack Start edge/UI, bounded-context modules, an external-agent CLI, and layered tests/evaluations. The high-signal physical layout is:

```text
.
├── src/
│   ├── start.ts                 # TanStack Start server middleware/bootstrap
│   ├── router.tsx               # React/TanStack router registration
│   ├── routeTree.gen.ts         # generated file-route tree
│   ├── routes/                  # browser, API, OAuth, MCP, discovery routes
│   │   └── _operator/           # owner/admin/provider/operator surfaces
│   ├── modules/                 # bounded contexts and public domain seams
│   │   ├── common/              # digests, IDs, bounded JSON, result helpers
│   │   ├── business/ catalog/   # business identity, offerings, catalog source
│   │   ├── capability-contract/ # contract/schema validation and refs
│   │   ├── capability-supply/   # import, admission, qualification, transport
│   │   ├── registry/ discovery/ # operation/business projections and manifests
│   │   ├── capability-execution/# keyless execution and operation gateway types
│   │   ├── action-invocation/  # durable invocation state machine/adapter
│   │   ├── customer-request/   # semantic proposal, compiler, route authority
│   │   ├── answer/ answer-thread/ # Answer artifacts, turns, gates, streaming
│   │   ├── agent-access/ money/ # grants, budgets, ledger, payouts
│   │   ├── harness/             # bounded model/tool run loop and evidence
│   │   ├── inquiries/ storefront/ work-tree/
│   │   └── security/ network-guard/ observability/ and support modules
│   ├── lib/
│   │   ├── server/              # HTTP/Convex/auth/provider adapters
│   │   ├── http/ client/        # protocol/client helpers
│   │   ├── observability/       # browser/server telemetry setup
│   │   └── deployment/ operator/ claim/ ui/
│   ├── components/ hooks/       # React UI and reusable client hooks
│   ├── content/ styles/         # brand copy and global CSS
│   └── ...
├── convex/
│   ├── schema.ts                # composed authoritative Convex schema
│   ├── http.ts crons.ts         # retired legacy routes and scheduled jobs
│   ├── capabilitySupply*.ts     # supply/publication/readiness/projection ports
│   ├── capabilityOperationInvocations*.ts # invocation rows/actions/recovery
│   ├── capabilityOperationInvocationWorker.ts # guarded Node operation worker
│   ├── customerRequest*.ts      # request aggregate, route, transport ports
│   ├── customerRequestRouteTransportWorker.ts # guarded route worker
│   ├── answerThreads.ts moneyLedger.ts # Answer and money authorities
│   ├── business.ts catalog.ts registry.ts discovery.ts # source/projection ports
│   ├── agentAccess*.ts security.ts # identity, grant, source-write ports
│   ├── _generated/              # Convex generated API/data model
│   └── ...                      # context functions, tests, config, migrations
├── tools/ae/                    # external-agent market terminal CLI
├── tests/                       # unit, integration, e2e, imports, eval, setup
├── eval/                        # answer/quality/Braintrust/tool-call evaluations
├── examples/ vendor/            # examples and vendored protocol material
├── docs/                        # product/architecture/reference documentation
├── .planning/                   # GSD planning and codebase maps
└── output/ test-results/        # generated test/evaluation artifacts
```

## Directory Purposes
- **`src/routes/`:** TanStack Start file routes. Names encode URL structure: `api.*.ts` for server API endpoints, `$param` for dynamic segments, `index.tsx`/`t.*.tsx` for UI pages, and `[.]` for literal-dot files. The route handlers should remain thin and delegate to `src/lib/server/` or a module server/public seam.
- **`src/routes/_operator/`:** authenticated owner/admin/operator route group. Current files include `owner.supply.tsx`, `owner.supply.$offeringRef.tsx`, `owner.status.tsx`, `owner.offerings*.tsx`, `owner.inquiries*.tsx`, `agent-access*.tsx`, and `admin.*.tsx`. It is the human control plane for supply, grants, support, and audit readbacks, not a second persistence layer.
- **`src/modules/common/`:** lowest-level shared primitives: canonical/stable hashing, runtime IDs, bounded JSON, JSON pointers, exact normalization, safe serialization, result values, transport timeouts, and audit identifiers. New cross-context primitive code belongs here only when it has no domain owner.
- **`src/modules/business/`:** business identity, claim lifecycle, public visibility, trust tiers, and business contexts (`local_human` or `programmable_provider`). Its `internal/` folder contains the source schema/commands.
- **`src/modules/catalog/`:** Offering-owned catalog source, offering revisions/status, access paths, pricing normalization, owner claims, and public business/offering projections. The active durable source is represented by business offerings/revisions/access paths; do not add retired service-capability child tables.
- **`src/modules/capability-contract/`:** versioned `ae.capability-contract:v2` document validation, bounded JSON Schema, annotations, data-use/effect/evidence declarations, lifecycle, canonical contract refs/digests, and schema validation helpers.
- **`src/modules/capability-supply/`:** provider/curated publication onboarding and supply authority. Top-level files include `public.ts`, `server.ts`, `supply-funnel.functions.ts`, `operation-projection.ts`, `operation-schemas.ts`, `route-transport-runtime.ts`, curated publication definitions, provider connection/approval code, and evidence fixtures. `internal/` is split into admission/importers, publication/offering/binding/ledger commands, graph qualification, readiness probes, transport adapters, and schema dereferencing.
- **`src/modules/registry/`:** public operation and business/catalog read actions and route adapters. `operations.actions.ts` defines the read-only operation search/detail/compare/inspect action contracts; `registry.functions.ts` reads public catalog pages; `internal/` contains search documents, service/offering projections, and registry projection repair.
- **`src/modules/discovery/`:** public/agent discovery manifests and files: site/offering/operation contracts, agent markdown, MCP docs, UCP, `llms.txt`, robots, sitemap, and discovery health/regeneration. It projects current registry/catalog state rather than owning supply.
- **`src/modules/capability-execution/`:** keyless `operation.execute` descriptor reads, guarded direct operation execution, authenticated `operation.invoke` contracts, approval and recovery schemas, and input composition. `operation-execute.functions.ts` is the pure fail-closed executor; `operation-execute.server.ts` supplies guarded fetch; `operation-invoke.ts` is the application service; `operation-invoke.actions.ts`/`operation-recovery.actions.ts` bridge HTTP/Convex.
- **`src/modules/action-invocation/`:** canonical invocation state machine and adapters. `durable.ts`, `convex-durable-port.ts`, `dynamic-published-adapter.ts`, `dynamic-published-contract.ts`, lease/control modules, payment-attempt/reconciliation files, and application services implement prepare/decide/acquire/execute/reconcile/cancel with OCC/version/effect-generation fences.
- **`src/modules/customer-request/`:** multi-capability customer work. `semantic-interpreter.ts` produces a typed proposal, `evaluation.ts` evaluates eligible candidates/facts, `compiler.ts` writes bounded aggregates and route plans, `prepared-action-v2.ts` creates options, `route-mandate.ts`/`route-mandate-admission.ts` own authority/spend grants, and `standing-route-*` owns repeat policy. Runtime/Convex schema files define the persisted wire shapes.
- **`src/modules/answer/`:** Answer schema, operation selection, public snapshots/artifacts, prose/gating, model gateway prompts, provider grounding, and SSE frame contracts. `internal/answer-tool-use-agent.ts` owns the AI SDK loop and dynamic capability tool construction.
- **`src/modules/answer-thread/`:** thread/turn domain, stream orchestration, session/share tokens, turn reservation/checkpoint/finalization, tool records, work-log projections, and public/agent route contracts. `internal/turns/` contains route-specific Answer paths (retrieval-first, agent, frozen, boundary, clarification, handoff).
- **`src/modules/agent-access/`:** agent API-key/OAuth principal identity, environment, scopes, authority modes, policy/grants, budgets, lifecycle/generation, and owner access management. Convex-facing schema and functions are under `internal/`/module files.
- **`src/modules/money/`:** exact amounts/pricing, ledger and transaction policy, budget admission/settlement, Stripe ports/webhook contracts, credit top-ups, Connect accounts, provider earnings, payout state/recovery, and public read projections. `server.ts` is the server-function/provider adapter; `internal/` is the money kernel.
- **`src/modules/harness/`:** bounded run loop, model request accounting, tool contracts, sessions/journal, run collector, emission guards, strict schemas, and viewer projections. Answer uses this for deterministic phase/checkpoint/evidence accounting; it is not the source of business truth.
- **`src/modules/inquiries/`, `storefront/`, `work-tree/`, `sandbox-supply/`, `study/`, `external-run/`, `demand/`, `notification-outbox/`, `settings/`, `seo/`, `project-spine/`, and `observability/`:** supporting bounded contexts for public inquiry, storefront enrichment, customer/work-tree interactions, development sandbox fixtures, studies/evaluations, external run records, demand capture, notifications, configuration, SEO/discovery files, cross-cutting project identity, and telemetry/audit. Use each owning public seam rather than placing unrelated logic in a route.
- **`src/lib/server/`:** protocol boundary code. Important adapters include `convex-source.ts`, `operation-invoke-api.ts`, `customer-request-agent-api.ts`, `customer-request-browser-api.ts`, `agent-access-auth.ts`, `source-write-admission.ts`, `mcp-api.ts`, `stripe-money-provider.ts`, `problem.ts`, `rate-limit.ts`, and bounded body/correlation helpers.
- **`src/components/`, `src/hooks/`, `src/content/`, `src/styles/`:** React presentation, browser hooks, brand copy, and global/base CSS. Components consume route/module projections; they do not call Convex database internals directly.
- **`convex/`:** Convex file-based functions and authoritative persistence. Context files expose public/internal queries, mutations, and actions over module-owned validators; `*Worker.ts` files perform guarded external effects after durable admission. `schema.ts` composes module schemas, `crons.ts` schedules bounded maintenance, and `_generated/` is generated.
- **`tools/`:** external-agent CLI (`tools/ae/`), release/deployment/smoke automation (`tools/release/`), and development evidence/cleanup utilities (`tools/dev/`). Tooling consumes production public/server seams rather than becoming a second domain implementation.
- **`tests/`, `eval/`, and `convex/**/*.test.ts`:** unit, integration, browser, contract, release, and evaluation coverage. Shared factories live in `tests/helpers/`; static cases live in `tests/fixtures/`.

## Key File Locations
- **Boot and routing:** `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, and generated `src/routeTree.gen.ts`.
- **Durable schema and scheduling:** `convex/schema.ts`, `convex/convex.config.ts`, and `convex/crons.ts`.
- **Operation supply/execution:** `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/supply-funnel.functions.ts`, `src/modules/capability-execution/operation-execute.functions.ts`, and `convex/capabilityOperationInvocations.ts`.
- **Answer:** `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, and `convex/answerThreads.ts`.
- **Money:** `src/modules/money/public.ts`, `src/modules/money/server.ts`, `convex/moneyLedger.ts`, and `src/lib/server/stripe-money-provider.ts`.
- **Configuration:** `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.env.example`, and `src/lib/deployment/manifest.ts`.
- **Release proof:** `.github/workflows/kernel-release-gate.yml`, `tools/release/`, and `output/release/`.

## Naming Conventions
- Source filenames are lower-case kebab-case; React component filenames are commonly PascalCase; TanStack routes encode URL segments with dots, `$param`, and `[.]` for literal dots.
- Domain modules expose `public.ts`, `server.ts`, `index.ts`, or narrowly named `*.functions.ts`/`*.actions.ts` seams. Private implementation belongs under `internal/`.
- Convex files use camelCase domain names; external-effect files end in `Worker.ts`. Tests use `*.test.ts`/`*.test.tsx`; Playwright scenarios use `*.spec.ts`.

## Where to Add New Code
- Add a domain rule, validator, state transition, or projection to its owner in `src/modules/<context>/`; expose only the required surface through that module's public/server seam.
- Add durable reads/writes and scheduled work to the matching `convex/<context>*.ts` file, reusing module validators and commands. Add guarded network effects only to the owning Node worker or `src/lib/server/` adapter.
- Add HTTP/browser entrypoints to `src/routes/` as thin adapters; reusable React UI belongs in `src/components/ae/`, and external-agent commands belong in `tools/ae/commands/`.
- Add observable-contract tests to the matching `tests/unit/`, `tests/integration/`, `convex/**/*.test.ts`, or `tests/e2e/` lane. Extend existing helpers before creating a second fixture vocabulary.

## Special Directories
- `convex/_generated/` and `src/routeTree.gen.ts` are generated; never edit them manually.
- `.planning/codebase/` contains these seven refreshable maps plus separately maintained `PROMPT-DATA-FLOW.md` and `IA-DATA-FLOW.md`; a refresh must not overwrite the latter.
- `output/`, `test-results/`, `playwright-report/`, `.vercel/`, and `.convex/` are generated or deployment-local evidence/configuration, not domain source.
- `tests/fixtures/architecture/` and other scanner fixtures intentionally violate rules and are excluded from normal clean-tree scans.