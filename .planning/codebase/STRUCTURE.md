<!-- refreshed: 2026-08-05 -->
# Codebase Structure

**Analysis Date:** 2026-08-05

## Directory Layout

```text
Agentic-Economy/
├── src/                         # TanStack Start application source
│   ├── start.ts                 # middleware and server request entry
│   ├── router.tsx               # browser router factory
│   ├── routeTree.gen.ts         # generated TanStack file-route registry
│   ├── routes/                  # pages, APIs, OAuth/MCP, discovery, webhooks
│   │   ├── index.tsx            # root service/WorkTree journey
│   │   ├── _operator/           # owner/admin operator workspace routes
│   │   ├── [.]well-known/       # OAuth/UCP/discovery manifests
│   │   └── api.*                # HTTP and protocol endpoints
│   ├── modules/                 # bounded contexts and public/private seams
│   │   ├── common/              # domain-neutral primitives
│   │   ├── actions/             # explicit cross-surface registry
│   │   ├── customer-request/    # request interpreter/compiler, authority, execution
│   │   │   └── application/     # application composition, incl. interpret-compile engine
│   │   ├── capability-supply/    # contracts, admission, publication, operations, transport
│   │   ├── answer/               # answer semantics, gates, model tools
│   │   ├── answer-thread/        # turn orchestration and thread persistence
│   │   ├── work-tree/            # human/agent project loop and inbox
│   │   ├── study/                # deterministic RFx/Study protocol
│   │   ├── catalog/              # business/offering publication projections
│   │   └── registry/             # service/operation discovery projections
│   ├── components/              # AE UI, AI elements, and reusable primitives
│   ├── lib/                     # server, HTTP, client, operator, UI, dev helpers
│   ├── content/                 # product/brand copy
│   └── styles/                  # global CSS and design tokens
├── convex/                      # durable source, functions, workers, and schema
│   ├── schema.ts                # composed module table fragments
│   ├── _generated/              # generated API/server/data-model declarations
│   ├── curatedProviders.ts      # idempotent curated capability-catalog seed
│   ├── customerRequest*.ts      # request application, mandate, execution, workers
│   ├── capabilitySupply*.ts     # supply publication, readiness, operation ports
│   ├── workTrees*.ts            # WorkTree, approval, and repeat ledger functions
│   └── *.ts                     # domain Convex functions, ports, cron, HTTP
├── tests/                       # unit, integration, browser, import, eval, release proof
│   ├── unit/                    # focused domain/runtime behavior
│   ├── integration/             # source/Convex lifecycle composition
│   ├── e2e/                     # local browser journeys
│   ├── deploy-smoke/            # hosted/release readbacks
│   ├── imports/                 # dependency-direction contracts
│   ├── helpers/fixtures/setup/  # deterministic test seams and state
│   └── seo/ui-contract/types/   # specialized public contracts
├── eval/                        # answer, Promptfoo, product-foundry, parity, consumer evals
├── tools/                       # `ae` CLI, dev smokes/evidence, release proofs, graphify
├── scripts/                     # repository audits and one-shot checks
├── docs/                        # durable architecture and agent guidance
├── public/                      # static favicon, brand, and image assets
├── vendor/                      # provenance records for vendored artifacts
├── .planning/                   # plans, ADRs, research, Wayfinder, records, codebase maps
├── output/                      # generated eval/release reports; not source imports
├── package.json                 # commands, dependencies, Node/package-manager contract
├── package-lock.json            # pinned npm dependency graph
├── tsconfig.json                # strict TypeScript and `@/*` path alias
├── vite.config.ts               # TanStack Start/Nitro/Vercel build configuration
├── vitest.config.ts             # Vitest setup and test discovery
├── playwright*.config.ts        # browser/deploy/paid-operation test projects
├── components.json              # shadcn/ui configuration
└── .env.example                 # declared environment names without credentials
```

## Directory Purposes

**`src/routes/`:**
- Purpose: TanStack file routes for pages, server handlers, protocol endpoints, and machine-readable documents.
- Contains: Root/public pages, `_operator/` owner/admin routes, `/api/requests` and `/api/v1/requests`, answer streaming/thread endpoints, registry/catalog APIs, WorkTree APIs, OAuth/MCP, discovery files, provider/webhook handlers, and retired protocol responses.
- Key files: `src/routes/index.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.requests.ts`, `src/routes/api.v1.requests.ts`, `src/routes/mcp.ts`, `src/routes/[.]well-known/ucp.ts`.

**`src/routes/_operator/`:**
- Purpose: Authenticated owner/admin workspace pages under the pathless `_operator` layout.
- Contains: Owner supply/offering/settings/inquiry pages and admin claims/runs/audit/index-health/search-gap pages.
- Key files: `src/routes/_operator.tsx`, `src/routes/_operator/owner.supply.tsx`, `src/routes/_operator/owner.inquiries.tsx`, `src/routes/_operator/admin.runs.tsx`.

**`src/modules/`:**
- Purpose: Bounded contexts that own domain contracts, deterministic logic, action declarations, source adapters, schema fragments, and projections.
- Contains: `action-invocation`, `answer`, `answer-thread`, `business`, `business-tools`, `capability-contract`, `capability-contract-registry`, `capability-supply`, `catalog`, `common`, `customer-request`, `demand`, `dev`, `discovery`, `external-run`, `governed-action`, `harness`, `imported-commitment`, `inquiries`, `model-gateway`, `money`, `network-guard`, `notification-outbox`, `observability`, `project-spine`, `provider-integrations`, `registry`, `routing-kernel`, `sandbox-supply`, `security`, `seo`, `settings`, `storefront`, `study`, and `work-tree`, plus `actions`.
- Key files: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/customer-request/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/work-tree/public.ts`.

**`src/modules/<context>/`:**
- Purpose: One domain's supported seam and implementation.
- Contains: Usually `public.ts`, optional `internal/`, `*.actions.ts`, `*.functions.ts`, runtime schemas, deterministic state machines, and source/effect ports. `customer-request/application/` is a nested application composition seam with its own `public.ts`.
- Key files: `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/application/public.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/work-tree/internal/root-loop.ts`.

**`src/modules/common/`:**
- Purpose: Shared primitives with no business-workflow ownership.
- Contains: Action contracts, identifiers, canonical/stable digests, bounded JSON, result/refusal types, CSRF matching, slug normalization, and safe serialization.
- Key files: `src/modules/common/action.ts`, `src/modules/common/canonical-digest.ts`, `src/modules/common/stable-hash.ts`, `src/modules/common/bounded-json.ts`, `src/modules/common/ids.ts`.

**`src/modules/actions/`:**
- Purpose: Single explicit registry for machine-visible operations.
- Contains: `index.ts` only as the central import/registration seam; action definitions stay in owning contexts.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`.

**`src/modules/customer-request/`:**
- Purpose: Customer Request V2 interpretation, capability graph compilation, route planning, preparation, confirmation, mandate, execution, recovery, and projections.
- Contains: Root contracts/compiler/interpreter, `application/`, `v2-read/`, `v2-write/`, `v2-preparation-egress/`, `route-mandate-mutation/`, `route-execution/`, agent/browser contracts, and source/action adapters.
- Key files: `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/semantic-interpreter.ts`, `src/modules/customer-request/customer-request.functions.ts`, `src/modules/customer-request/application/public.ts`, `src/modules/customer-request/route-execution/machines/record-outcome.ts`.

**`src/modules/customer-request/application/`:**
- Purpose: Application-level composition that binds the engine, compiler, and projections behind `application/public.ts`.
- Contains: `interpret-compile/` (the natural-language capability engine), `compare-resume/`, `problem-route/`, `confirm-route/`, `authorize-preparation/`, `preparation-egress/`, `standing-route/`, `refine/`, `provide-facts/`, `route-plan-projection/`, `action-projection/`, `consumer-plan-projection.ts`, and reference/completion helpers.
- Key files: `src/modules/customer-request/application/public.ts`, `src/modules/customer-request/application/interpret-compile/index.ts`.

**`src/modules/customer-request/application/interpret-compile/`:**
- Purpose: Seek-preview-and-compile engine over the routeable capability graph. Deterministic discovery narrows the pool; a composite (model + deterministic) interpreter proposes; the compiler produces a `proposal_only` aggregate/route generation.
- Contains: `discover.ts` (discovery narrow + order), `capability-domain.ts` (cross-capability domain guard), `interpreter.ts` (composite recovery interpreter), `deterministic-interpreter.ts` (searchTerms matcher), `preview.ts` (planPreview surface), `graph.ts` (descriptor pool assembly), `interpret.ts`, `compile.ts`, `facts.ts`, `types.ts`, `index.ts`.
- Key files: `src/modules/customer-request/application/interpret-compile/interpreter.ts`, `.../deterministic-interpreter.ts`, `.../capability-domain.ts`, `.../preview.ts`, `.../discover.ts`.

**`src/modules/capability-contract/`, `src/modules/capability-contract-registry/`, and `src/modules/capability-supply/`:**
- Purpose: Validate capability contracts (including the `inputExamples` teaching surface), persist exact active contract documents, admit/publish provider bindings with provenance, project public operations, and prepare registered route transports.
- Contains: Contract schemas/registry codecs, normalized admission (`internal/admit-provider-schema.ts`), publication/eligibility/operation-ledger internals, the curated catalog payloads, HTTP/MCP/x402 adapters, readiness, owner funnel, and development ports.
- Key files: `src/modules/capability-contract/public.ts`, `src/modules/capability-contract-registry/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/operation-projection.ts`, `src/modules/capability-supply/route-transport-runtime.ts`.

**`src/modules/capability-supply/internal/`:**
- Purpose: Private admission, publication lifecycle, provenance, importer, eligibility, binding, and operation-ledger machinery that must not leak into routes.
- Contains: `admit-provider-schema.ts`, `publication-importers.ts`, `publication/` (`admit`, `draft`, `publish`, `refresh`, `withdraw`, `lifecycle`, `provenance`, `ports`), `eligibility/`, `binding/`, `operation-ledger/`, `graph/`, `quarantine/`, `offering/`, `route-call-signing.ts`, `x402-payment-signer.ts`, `transport-adapters.ts`, `readiness-probe.ts`, `convex-schema.ts`.
- Key files: `src/modules/capability-supply/internal/admit-provider-schema.ts`, `src/modules/capability-supply/internal/publication/provenance.ts`, `src/modules/capability-supply/internal/convex-schema.ts`.

**`src/modules/capability-supply/curated-*.ts`:**
- Purpose: The ~20-op curated source catalog payloads and the public publications list consumed by the seed.
- Contains: `curated-cluster-a-publications.ts` (keyless), `curated-cluster-b-publications.ts` (keyed), `curated-cluster-c-publications.ts` (observed x402), `curated-provider-publications.ts`, plus EXA/Frankfurter source in `public.ts`/`curated-provider-publications.ts`.
- Key files: `src/modules/capability-supply/curated-cluster-a-publications.ts`, `src/modules/capability-supply/curated-provider-publications.ts`.

**`src/modules/catalog/` and `src/modules/registry/`:**
- Purpose: Own business/offering publication and public business/service/operation discovery DTOs.
- Contains: Catalog source model/publishing, owner claim adapters, public route functions, registry actions/functions, search/projection internals, and operation navigation projections.
- Key files: `src/modules/catalog/public.ts`, `src/modules/catalog/public-route.functions.ts`, `src/modules/registry/public.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/operations.actions.ts`.

**`src/modules/answer/`, `src/modules/answer-thread/`, `src/modules/harness/`, and `src/modules/action-invocation/`:**
- Purpose: Keep answer semantics, streaming, harness lifecycle, tool policy, durable action attempts, and public/private readback separated.
- Contains: Answer schemas/gates/prompts/artifacts, thread source adapters and orchestrator, harness run loop/collector/projections, and invocation contracts/durable tracer.
- Key files: `src/modules/answer/public.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/harness/run-loop.ts`, `src/modules/action-invocation/durable.ts`.

**`src/modules/work-tree/`:**
- Purpose: Source-backed human/agent project loop and decision inbox.
- Contains: Public contract/frontier/rollup/inbox/memo/approval/repeat modules, gardener verbs, human root server functions, agent actions/functions, and Convex schema fragment.
- Key files: `src/modules/work-tree/human-root.functions.ts`, `src/modules/work-tree/work-tree.functions.ts`, `src/modules/work-tree/work-tree-agent.actions.ts`, `src/modules/work-tree/internal/root-loop.ts`, `src/modules/work-tree/internal/verbs.ts`.

**`src/modules/study/`:**
- Purpose: Fenced, proposal-only RFx Study over registered public services.
- Contains: `study.actions.ts`, source adapter, contract/artifact schemas, lifecycle journal/replay machine, deterministic qualification/quote/TOPSIS pipeline, and Convex schema export.
- Key files: `src/modules/study/study.actions.ts`, `src/modules/study/study.functions.ts`, `src/modules/study/internal/pipeline.ts`, `src/modules/study/internal/rfx-machine.ts`, `src/modules/study/internal/convex-schema.ts`.

**`src/modules/inquiries/` and `src/modules/notification-outbox/`:**
- Purpose: Govern customer-to-business inquiry records, privacy/access projections, integrity-bound send receipts, and notification dispatch/reconciliation.
- Contains: Inquiry schemas/commands/ledger/projections/privacy, source adapter/server functions, notification command/state contracts, dispatch request validation, and operator views.
- Key files: `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/governed-send.ts`, `src/modules/notification-outbox/public.ts`.

**`src/modules/money/`, `src/modules/security/`, `src/modules/observability/`, and `src/modules/network-guard/`:**
- Purpose: Cross-cutting policy seams for ledger/payment states, identity/admin/source-write authority, telemetry, and outbound network safety.
- Contains: Public contracts plus private validators/schema/adapters; no route should duplicate these policies.
- Key files: `src/modules/money/public.ts`, `src/modules/security/public.ts`, `src/modules/security/source-write-admission.ts`, `src/modules/observability/public.ts`, `src/modules/network-guard/public.ts`.

**`src/lib/`:**
- Purpose: Transport, runtime, and UI helpers that support modules without owning domain transitions.
- Contains: `server/` Convex/auth/HTTP/action adapters; `http/` cookies, headers, discovery, OAuth challenges; `client/` browser auth helpers; `operator/` navigation; `observability/` Sentry/PostHog; `dev/` local fixtures; `ui/` presentation helpers; `utils.ts`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/lib/server/customer-request-browser-api.ts`, `src/lib/server/mcp-api.ts`, `src/lib/server/bounded-request-body.ts`.

**`src/components/`:**
- Purpose: React presentation library.
- Contains: Product-specific `ae/` components grouped by journey (`chat/`, `work-tree/`, `supply/`, `listing/`, `operator/`, `layout/`), AI interaction components under `ai-elements/`, and lowercase reusable primitives under `ui/`.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/work-tree/AeWorkTreePanel.tsx`, `src/components/ui/button.tsx`.

**`convex/`:**
- Purpose: Durable backend source of truth and transaction/effect boundary.
- Contains: `schema.ts`, the curated catalog seed, public/internal functions, schema/table mappers, application ports, Workpool workers, Workflow definitions, cron/HTTP routers, Convex auth/config, and development seed code.
- Key files: `convex/schema.ts`, `convex/curatedProviders.ts`, `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/customerRequestRouteTransportWorker.ts`, `convex/capabilitySupply.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/workTrees.ts`, `convex/studies.ts`, `convex/externalRuns.ts`.

**`convex/_generated/`:**
- Purpose: Convex-generated API references, server declarations, data-model types, component refs, and AI guidance.
- Contains: `api.d.ts`, `server.d.ts`, `server.js`, `api.js`, `dataModel.d.ts`, and `ai/` guidance/state files.
- Key files: `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts`.

**`tests/`:**
- Purpose: Executable boundary and behavior proof.
- Contains: `unit/`, `integration/`, `e2e/`, `deploy-smoke/`, `imports/`, `seo/`, `ui-contract/`, `types/`, `fixtures/`, `helpers/`, `setup/`, `eval/`, and `scripts/`.
- Key files: `tests/integration/customer-request-v2-application-path.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/e2e/thread-first.spec.ts`, `tests/deploy-smoke/work-tree-parity-release-proof.spec.ts`.

**`tests/helpers/`, `tests/setup/`, and `tests/fixtures/`:**
- Purpose: Keep tests deterministic and isolated from production providers and external credentials.
- Contains: Convex/source ports, OpenRouter contract server, answer stream helpers, storage/DOM setup, public/catalog/discovery state, capability contracts, and intentionally invalid import/UI/standards fixtures.
- Key files: `tests/helpers/openrouter-contract-server.ts`, `tests/helpers/convex-fixtures.ts`, `tests/helpers/answer-thread-test-port.ts`, `tests/setup/web-storage.ts`, `tests/fixtures/source-state.ts`.

**`eval/`:**
- Purpose: Product/model evaluation separate from source and hosted proof.
- Contains: `answer/` Promptfoo providers/assertions/suite runner, `product-foundry/` action bundles/portfolios, `parity/` comparison programs/results, and `consumer/` comparator/rubric documents.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/run-suite.ts`, `eval/product-foundry/public.ts`, `eval/parity/check-parity.mjs`, `eval/consumer/RUBRIC.md`.

**`tools/`:**
- Purpose: Local development, evidence generation, release verification, and machine-facing operations.
- Contains: `dev/` local hosts/smokes/evidence packets, `release/` hosted/release credentials/readbacks/smokes, `ae/` CLI commands, and `graphify` tooling.
- Key files: `tools/ae/cli.ts`, `tools/dev/local-dev.mjs`, `tools/dev/work-tree-development-smoke.ts`, `tools/release/customer-request-production-smoke.ts`.

**`scripts/`:**
- Purpose: Repository-level audits that are not runtime application code.
- Contains: Action-surface and other one-shot checks.
- Key files: `scripts/audit-action-surfaces.mjs`.

**`docs/`:**
- Purpose: Durable architecture and agent/operator guidance.
- Contains: `docs/architecture/` source-authority/contract notes and `docs/agents/` domain/issue-tracker/triage guidance.
- Key files: `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`, `docs/agents/domain.md`.

**`.planning/`:**
- Purpose: Product implementation authority, ADRs, research, Wayfinder artifacts, records, and generated codebase maps.
- Contains: `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `adr/`, `research/`, `wayfinder/`, `records/`, and `codebase/`.
- Key files: `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`public/`:**
- Purpose: Static assets served without domain logic.
- Contains: `favicon.svg`, `brand/`, and image assets.
- Key files: `public/favicon.svg`, `public/brand/logo/`.

**`vendor/`:**
- Purpose: Provenance records for vendored artifacts, not active application implementation.
- Contains: `vendor/handshake-protocol-kernel/README-PROVENANCE.md`.
- Key files: `vendor/handshake-protocol-kernel/README-PROVENANCE.md`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: server middleware/request lifecycle.
- `src/router.tsx`: browser router factory.
- `src/routes/__root.tsx`: root HTML document, provider, and client observability host.
- `src/routes/index.tsx`: root service discovery/WorkTree journey.
- `src/routeTree.gen.ts`: generated route registration; do not hand-edit.
- `src/modules/customer-request/application/interpret-compile/preview.ts`: natural-language capability engine `previewCustomerRequest` surface.
- `convex/schema.ts`: table-fragment composition entry.
- `convex/curatedProviders.ts`: curated capability-catalog seed entry (`internal.curatedProviders.seed`).
- `convex/http.ts`: Convex HTTP router for sandbox providers and explicit legacy retirement responses.
- `tools/ae/cli.ts`: agent-like machine CLI entry.

**Configuration:**
- `package.json`: scripts, dependency/runtime contract, Node `>=22`, and npm package-manager declaration.
- `tsconfig.json`: strict compiler options, source includes/excludes, and `@/*` alias.
- `vite.config.ts`: TanStack Start/Nitro/Vercel build and Node runtime configuration.
- `vitest.config.ts`: unit/integration/eval runner setup.
- `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`: browser/release project configuration.
- `convex/convex.config.ts`: Convex components and environment keys.
- `convex/auth.config.ts`: Clerk issuer/audience configuration.
- `components.json`: shadcn/ui paths and style configuration.
- `.env.example`: declared environment names; local `.env*` files contain environment configuration and are not map sources.

**Core Logic:**
- `src/modules/common/action.ts`: action contract and effect/authority metadata.
- `src/modules/actions/index.ts`: explicit action registry and MCP naming.
- `src/modules/customer-request/compiler.ts`: deterministic aggregate/route compilation.
- `src/modules/customer-request/application/interpret-compile/interpreter.ts`: composite (model + deterministic) Customer Request interpreter.
- `src/modules/customer-request/application/interpret-compile/capability-domain.ts`: cross-capability domain guard for the engine.
- `src/modules/customer-request/application/public.ts`: application composition for compile, prepare, confirm, resume, and recovery.
- `src/modules/capability-contract/public.ts`: capability contract schemas and validation semantics.
- `src/modules/capability-supply/internal/admit-provider-schema.ts`: deterministic OpenAPI/MCP schema admission normalizer.
- `src/modules/capability-supply/internal/publication/provenance.ts`: capability publication authority-mode/digest provenance.
- `src/modules/capability-supply/operation-projection.ts`: public executable operation descriptors and plan inspection.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: answer phase orchestration.
- `src/modules/harness/run-loop.ts`: ordered harness lifecycle and status/error handling.
- `src/modules/work-tree/internal/root-loop.ts`: deterministic human WorkTree host loop.
- `src/modules/study/internal/pipeline.ts`: Study qualification, quote, and TOPSIS pipeline.
- `src/lib/server/convex-source.ts`: typed authenticated/public Convex transport seam.
- `convex/curatedProviders.ts`: idempotent curated catalog bootstrap (seed + retire-on-drift).
- `convex/customerRequestApplication.ts`: Customer Request commands and source caller resolution.
- `convex/customerRequestRouteTransportWorker.ts`: bounded external route effect execution.
- `convex/workTrees.ts`, `convex/studies.ts`: durable WorkTree and Study ownership.

**Testing:**
- `tests/unit/`: focused module, Convex-runtime, server, UI, schema, action, answer, WorkTree, Study, and release behavior.
- `tests/integration/`: Convex/source/multi-module lifecycle composition.
- `tests/e2e/`: browser journeys, accessibility, public/owner flows, answer/discovery/inquiry, and WorkTree.
- `tests/deploy-smoke/`: hosted/release lifecycle readback and parity proof.
- `tests/imports/`: architectural dependency-direction rules.
- `tests/seo/`, `tests/ui-contract/`, `tests/types/`: specialized public, UI, and type contracts.
- `tests/helpers/`, `tests/setup/`, `tests/fixtures/`: deterministic ports, environment setup, and contract inputs.

## Naming Conventions

**Files:**
- File routes encode URL segments/protocols: `src/routes/api.v1.requests.$requestRef.run.ts`, `src/routes/$slug.ucp.ts`, `src/routes/[.]well-known/ucp.ts`.
- Supported module seams are `public.ts`: `src/modules/customer-request/public.ts`, `src/modules/registry/public.ts`.
- Action declarations use `*.actions.ts`: `src/modules/customer-request/customer-request.actions.ts`, `src/modules/work-tree/work-tree-agent.actions.ts`.
- TanStack/source adapters use `*.functions.ts`: `src/modules/customer-request/customer-request.functions.ts`, `src/modules/registry/registry.functions.ts`.
- Convex table fragments use `internal/*schema.ts`, `internal/schema.ts`, or context `*.schema.ts`: `src/modules/action-invocation/internal/convex-schema.ts`, `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/capability-supply/internal/convex-schema.ts`.
- Convex files use context/lifecycle names with lower camel case: `convex/customerRequestApplication.ts`, `convex/customerRequestRouteExecution.ts`, `convex/curatedProviders.ts`, `convex/workTrees.ts`.
- React product components use `Ae` PascalCase: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/work-tree/AeWorkTreePanel.tsx`; generic UI primitives are lowercase: `src/components/ui/button.tsx`.
- Tests use `*.test.ts`/`*.test.tsx`; Playwright browser specs use `*.spec.ts`.
- Evidence/fixture helpers describe the boundary: `tests/helpers/openrouter-contract-server.ts`, `tools/dev/*-evidence*.ts`, `tools/release/*-smoke*.ts`.

**Directories:**
- Bounded contexts use lowercase kebab-case: `src/modules/customer-request/`, `src/modules/capability-supply/`, `src/modules/answer-thread/`.
- Private implementation is grouped under `internal/`; nested subdomains use descriptive lowercase names such as `route-execution/`, `v2-write/`, `application/`, and `interpret-compile/`.
- Route families use TanStack pathless/parameter naming such as `_operator/`, `$slug`, `$requestRef`, and `[.]well-known/`.
- Test directories mirror the boundary under test: `tests/unit/customer-request/`, `tests/integration/`, `tests/imports/`, and `tests/deploy-smoke/`.
- Convex port filenames preserve the owning family: `customerRequestV2*Ports.ts`, `customerRequestRouteExecution*Ports.ts`, `capabilitySupply*Ports.ts`.
- Product UI journeys group under `src/components/ae/<journey>/`; generic primitives remain under `src/components/ui/`.

## Where to Add New Code

**New Feature:**
- Primary code: Extend the owning bounded context under `src/modules/<context>/`; put supported contracts in `public.ts`, deterministic behavior in a named implementation/internal file, and action declarations in `<context>/*.actions.ts`.
- Action registration: Add the action import and array entry in `src/modules/actions/index.ts`; never depend on module-evaluation side effects or create a second registry.
- Transport: Add a thin `src/routes/` file and delegate to an existing `src/lib/server/*-api.ts` or module `*.functions.ts`; keep request bounds, auth, and response mapping at that boundary.
- Durable state: Add the context schema fragment under `src/modules/<context>/internal/`, compose it in `convex/schema.ts`, then add matching application/port functions under `convex/`.
- Tests: Mirror the owning boundary in `tests/unit/`; add `tests/integration/`, `tests/e2e/`, or `tests/deploy-smoke/` only for the observable cross-boundary contract.

**New Capability Admission / Provider Port:**
- Source content: Add the normalized operation to the curated catalog payloads (`src/modules/capability-supply/curated-cluster-*-publications.ts`) or a `CURATED_PROVIDER_PUBLICATIONS` entry in `src/modules/capability-supply/public.ts`, including the contract's `searchTerms` for discovery/domain and `inputExamples` for teaching.
- Normalizer: Route OpenAPI/MCP schemas through `src/modules/capability-supply/internal/admit-provider-schema.ts` so admission is deterministic and refuses with a named reason rather than looping.
- Provenance: Tag the publication with an authority mode + source revision + digest via `src/modules/capability-supply/internal/publication/provenance.ts` so provider-owned vs AE-curated vs observed supply is never conflated.
- Seed/routeability: Materialize publications/mappings/eligibility idempotently through `convex/curatedProviders.ts` (`internal.curatedProviders.seed`; `npm run seed:dev`) and verify the op is live-routeable via `registry.operations.search`.

**New Engine Query / Selection Behavior:**
- Discovery vocabulary: Declare `searchTerms` on the catalog offering source (`src/modules/capability-supply/curated-cluster-*-publications.ts`) so both discovery and the deterministic recovery interpreter can match (see `src/modules/customer-request/application/interpret-compile/discover.ts` and `deterministic-interpreter.ts`).
- Domain guard: Extend `src/modules/customer-request/application/interpret-compile/capability-domain.ts` rather than regex-scanning free text at call sites; stamp the declared `domain` once during graph assembly.
- Recovery: Keep deterministic recovery on the discovery-narrowed, domain-appropriate pool in `src/modules/customer-request/application/interpret-compile/interpreter.ts`; a model zero-selection/unsupported against a non-empty pool is a vocabulary miss, not an honest refusal.

**New Component/Module:**
- Implementation: Use `src/modules/<new-context>/` with `public.ts`, private `internal/` schemas/ports/state machines, source adapters, and `*.actions.ts` only when the operation is a registered cross-surface action.
- Durable module: Export a `*Tables` fragment from `src/modules/<new-context>/internal/`, spread it in `convex/schema.ts`, and place Convex functions in a context-named `convex/<context>.ts` file or the established `convex/<context>*.ts` family.
- UI: Product-specific components belong under `src/components/ae/<journey>/`; reusable visual primitives belong under `src/components/ui/`; AI interaction widgets belong under `src/components/ai-elements/`.
- External protocol: Reuse `src/modules/capability-supply/operation-projection.ts`, `src/modules/registry/public.ts`, and `src/modules/actions/index.ts` for operation discovery rather than inventing a parallel descriptor/catalog.

**Utilities:**
- Shared deterministic helpers: `src/modules/common/`; keep them business-neutral.
- HTTP/cookies/security/request helpers: `src/lib/http/`.
- Server transport/auth/Convex adapters: `src/lib/server/`.
- Operator navigation: `src/lib/operator/`.
- Browser-only presentation helpers: `src/lib/ui/`.
- Observability plumbing: `src/lib/observability/` and typed domain telemetry in `src/modules/observability/`.
- Development-only fixtures/smokes: `src/modules/dev/`, `tests/fixtures/`, or `tools/dev/`; do not place fixture behavior in production public projections.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router generated route imports and registration.
- Generated: Yes.
- Committed: Yes; add/rename `src/routes/` files and regenerate rather than editing by hand.

**`convex/_generated/`:**
- Purpose: Generated Convex API, server, component, data-model, and AI guidance files.
- Generated: Yes.
- Committed: Present in the source tree; never use it as a hand-written extension point.

**`.convex/`:**
- Purpose: Local Convex deployment database, storage blobs, and runtime state.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

**`.vercel/`, `.tanstack/`, `.vinxi/`, `.output/`, and `dist/`:**
- Purpose: Build, deployment, and framework scratch/output artifacts.
- Generated: Yes.
- Committed: No; do not add application source here.

**`output/`, `test-results/`, and `playwright-report/`:**
- Purpose: Test/eval/release reports and browser artifacts.
- Generated: Yes.
- Committed: No; do not import them from runtime modules or treat them as source evidence.

**`.planning/codebase/`:**
- Purpose: Canonical GSD codebase maps, including this architecture/structure pair and the maintained prompt/data-flow map.
- Generated: Yes, by the mapper workflow from current source inspection.
- Committed: Yes; link [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md) for the maintained AI/prompt-flow trace, and update only the map documents owned by the current mapper focus.

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Provenance record for a vendored external artifact.
- Generated: No.
- Committed: Yes; it is not the active routing implementation. Current legacy routing retirement lives in `src/modules/routing-kernel/retirement.ts` and `convex/http.ts`.

**`node_modules/`:**
- Purpose: Installed dependencies used by source/build/test tooling.
- Generated: Yes.
- Committed: No; package behavior claims must be checked against `package.json`, lockfile, or installed source as appropriate.

---

*Structure analysis: 2026-08-05*
