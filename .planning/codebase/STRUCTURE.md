# Codebase Structure

**Analysis Date:** 2026-08-02

## Directory Layout

```text
Agentic-Economy/
├── src/                         # TanStack Start app, routes, modules, UI, helpers
│   ├── start.ts                 # server middleware entry
│   ├── router.tsx               # client router factory
│   ├── routes/                  # file-based pages and HTTP/protocol handlers
│   ├── modules/                 # bounded contexts and public/private seams
│   ├── components/              # AE product UI, AI elements, generic UI primitives
│   ├── lib/                     # server, HTTP, client, operator, UI, dev, observability helpers
│   ├── content/                 # brand and product copy
│   └── styles/                  # global CSS, tokens, base styles
├── convex/                      # Convex schema, queries/mutations/actions, ports, workers, cron/HTTP
│   ├── schema.ts                # composed bounded-context tables
│   ├── _generated/              # Convex generated API/types/server files
│   └── *.ts                     # domain application functions and durable adapters
├── tests/                       # unit, integration, browser, import, SEO, type, and release proof
├── eval/                        # answer, product-foundry, parity, and consumer evaluation programs
├── tools/                       # development hosts, release scripts, evidence tools, and AE CLI
├── scripts/                     # repository audit scripts
├── docs/                        # durable architecture and agent guidance
├── public/                      # static favicon, brand, and image assets
├── vendor/                      # provenance records for vendored artifacts
├── .planning/                   # product planning, ADRs, research, and generated codebase maps
├── package.json                 # scripts and package metadata
├── package-lock.json            # pinned npm dependency graph
├── tsconfig.json                # strict TypeScript boundaries and path aliases
├── vite.config.ts               # TanStack Start/Nitro/Vercel build and dev wiring
├── vitest.config.ts             # Vitest test discovery and setup
├── playwright.config.ts         # browser-test projects and local server defaults
├── components.json              # shadcn/ui component configuration
└── .env.example                 # declared environment names without local credentials
```

## Directory Purposes

**`src/`:**
- Purpose: Application source for web rendering, transport boundaries, domain modules, and shared helpers.
- Contains: TypeScript/TSX routes, bounded-context code, React components, server/client utilities, copy, and CSS.
- Key files: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/modules/actions/index.ts`.

**`src/routes/`:**
- Purpose: TanStack file-route registration for pages and protocol endpoints.
- Contains: Public pages, operator route families, Customer Request APIs, answer streaming, registry/catalog APIs, discovery files, OAuth/MCP, webhooks, and provider/sandbox handlers.
- Key files: `src/routes/index.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.requests.ts`, `src/routes/api.v1.requests.ts`, `src/routes/mcp.ts`, `src/routes/[.]well-known/`.

**`src/modules/`:**
- Purpose: Bounded contexts that own domain contracts, deterministic logic, action declarations, source adapters, and projections.
- Contains: `action-invocation`, `answer`, `answer-thread`, `business`, `business-tools`, `capability-contract`, `capability-contract-registry`, `capability-supply`, `catalog`, `common`, `customer-request`, `demand`, `dev`, `discovery`, `external-run`, `governed-action`, `harness`, `imported-commitment`, `inquiries`, `model-gateway`, `money`, `network-guard`, `notification-outbox`, `observability`, `project-spine`, `provider-integrations`, `registry`, `routing-kernel`, `sandbox-supply`, `security`, `seo`, `settings`, `storefront`, `study`, and `work-tree`, plus the central `actions` registry.
- Key files: `src/modules/common/action.ts`, `src/modules/customer-request/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/work-tree/public.ts`.

**`src/modules/<context>/`:**
- Purpose: One domain's supported seam and implementation.
- Contains: Usually `public.ts`, optional `internal/`, `*.actions.ts` for registered operations, `*.functions.ts` for TanStack/source adapters, `*.schema.ts` for runtime contracts, and domain-specific application/ports.
- Key files: `src/modules/customer-request/compiler.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/action-invocation/durable.ts`.

**`src/modules/common/`:**
- Purpose: Shared primitives that do not own a business workflow.
- Contains: Action contracts, identifiers, canonical digests, stable hashes, bounded JSON, result types, CSRF matching, slug normalization, and safe serialization.
- Key files: `src/modules/common/action.ts`, `src/modules/common/canonical-digest.ts`, `src/modules/common/bounded-json.ts`, `src/modules/common/ids.ts`.

**`src/components/`:**
- Purpose: React presentation library.
- Contains: Product-specific `ae/` components grouped by journey, `ai-elements/` for AI interaction display, and lowercase reusable primitives under `ui/`.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/chat/`, `src/components/ae/customer-request/`, `src/components/ui/button.tsx`.

**`src/lib/`:**
- Purpose: Transport, runtime, and UI helpers that support modules without becoming domain owners.
- Contains: `server/` Convex/auth/HTTP adapters, `http/` request/response utilities, `client/` browser auth helpers, `operator/` navigation and route options, `observability/` Sentry/PostHog wiring, `dev/` local helpers, `ui/` view utilities, and `utils.ts`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/lib/server/customer-request-browser-api.ts`, `src/lib/http/security-headers.ts`.

**`convex/`:**
- Purpose: Durable backend source of truth and transaction/effect boundary.
- Contains: `schema.ts`, public/internal Convex functions, application ports, Workpool workers, cron/HTTP routers, table mappers, and Convex configuration/auth.
- Key files: `convex/schema.ts`, `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/capabilitySupply.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/workTrees.ts`.

**`convex/_generated/`:**
- Purpose: Convex code-generated API references, server declarations, data-model types, and AI guidance.
- Contains: `api.d.ts`, `server.d.ts`, `server.js`, `api.js`, `dataModel.d.ts`, and generated `ai/` files.
- Key files: `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts`.

**`tests/`:**
- Purpose: Executable boundary and behavior proof.
- Contains: `unit/`, `integration/`, `e2e/`, `deploy-smoke/`, `imports/`, `seo/`, `ui-contract/`, `types/`, `fixtures/`, `helpers/`, `setup/`, `eval/`, and `scripts/`.
- Key files: `tests/integration/customer-request-v2-application-path.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/e2e/thread-first.spec.ts`.

**`tests/unit/`:**
- Purpose: Focused domain, Convex-runtime, server, UI, schema, action, answer, and work-tree behavior.
- Contains: Domain-mirroring directories such as `customer-request/`, `answer-thread/`, `capability-supply/`, `action-invocation/`, `convex/`, `work-tree/`, `security/`, `storefront/`, `harness/`, `release/`, and `planning/`.
- Key files: `tests/unit/customer-request/agent-contract.test.ts`, `tests/unit/action-invocation/durable-action-invocation.test.ts`, `tests/unit/work-tree/root-loop.test.ts`.

**`tests/integration/`:**
- Purpose: Exercise source/Convex composition and multi-module lifecycle paths.
- Contains: Customer Request V2, capability publication, registry/catalog seed/readback, answer persistence, inquiry, and admin runtime scenarios.
- Key files: `tests/integration/customer-request-v2-multi-capability-route.test.ts`, `tests/integration/capability-publication.test.ts`, `tests/integration/answer-thread-source-write.test.ts`.

**`tests/e2e/` and `tests/deploy-smoke/`:**
- Purpose: Browser journeys and hosted/release readbacks respectively.
- Contains: Public/owner UI, answer/chat/discovery/inquiry, Customer Request decision, accessibility, parity, notification, support, billing, and production smoke specs.
- Key files: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/customer-request-decision-experience.spec.ts`, `tests/deploy-smoke/answer-runtime-production-smoke.spec.ts`, `tests/deploy-smoke/work-tree-parity-release-proof.spec.ts`.

**`tests/imports/`:**
- Purpose: Enforce source ownership and dependency direction.
- Contains: Route/private import scanners, customer-request/capability boundaries, action-invocation host restrictions, contract registry boundaries, and retirement assertions.
- Key files: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/customer-request-boundaries.test.ts`, `tests/imports/customer-request-source-completeness.test.ts`.

**`tests/helpers/`, `tests/setup/`, and `tests/fixtures/`:**
- Purpose: Keep test seams deterministic and isolated from production providers.
- Contains: OpenRouter contract server, answer stream helpers, Convex fixtures, source-write admission, storage/DOM setup, source state, discovery state, capability contracts, and deliberately invalid import/UI/standards fixtures.
- Key files: `tests/helpers/openrouter-contract-server.ts`, `tests/helpers/convex-fixtures.ts`, `tests/setup/web-storage.ts`, `tests/fixtures/source-state.ts`.

**`eval/`:**
- Purpose: Product and model evaluation distinct from unit/integration proof.
- Contains: `answer/` Promptfoo providers/assertions/scripts, `product-foundry/` action bundles and portfolios, `parity/` comparison programs/results, and `consumer/` comparator/rubric documents.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/product-foundry/public.ts`, `eval/parity/check-parity.mjs`, `eval/consumer/RUBRIC.md`.

**`tools/`:**
- Purpose: Local development, evidence generation, release verification, and machine-facing operations.
- Contains: `dev/` local hosts/smokes/evidence packets, `release/` production/parity credentials and readbacks, `ae/` CLI commands, and `graphify` tooling.
- Key files: `tools/ae/cli.ts`, `tools/dev/local-dev.mjs`, `tools/dev/work-tree-development-smoke.ts`, `tools/release/customer-request-production-smoke.ts`.

**`scripts/`:**
- Purpose: Repository-level audits that are not application runtime code.
- Contains: Action-surface audit and similar one-shot checks.
- Key files: `scripts/audit-action-surfaces.mjs`.

**`docs/`:**
- Purpose: Durable architecture and agent guidance.
- Contains: `docs/architecture/` source-authority notes and `docs/agents/` domain/issue-tracker/triage guidance.
- Key files: `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`, `docs/agents/domain.md`.

**`.planning/`:**
- Purpose: Product implementation authority, ADRs, research, wayfinder artifacts, and codebase maps.
- Contains: `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `adr/`, `research/`, `wayfinder/`, `records/`, and `codebase/`.
- Key files: `.planning/PROJECT.md`, `.planning/MAP-framework.md` (under `.planning/wayfinder/`), `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/ARCHITECTURE.md`.

**`public/`:**
- Purpose: Static files served without domain logic.
- Contains: `favicon.svg`, `brand/logo/`, and image assets.
- Key files: `public/favicon.svg`, `public/brand/logo/`.

**`vendor/`:**
- Purpose: Provenance records for vendored artifacts, not active application source.
- Contains: `vendor/handshake-protocol-kernel/README-PROVENANCE.md`.
- Key files: `vendor/handshake-protocol-kernel/README-PROVENANCE.md`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: server middleware and request lifecycle entry.
- `src/router.tsx`: browser router factory.
- `src/routes/__root.tsx`: root HTML document, global provider/error/observability hosts.
- `src/routeTree.gen.ts`: generated TanStack route registration.
- `convex/schema.ts`: Convex schema composition entry.
- `convex/http.ts`: Convex HTTP router for sandbox and retired protocol paths.
- `tools/ae/cli.ts`: machine-facing CLI entry.

**Configuration:**
- `package.json`: scripts, runtime dependencies, and package entry configuration.
- `tsconfig.json`: strict compiler options, source includes/excludes, and `@/*` aliases.
- `vite.config.ts`: TanStack Start/Nitro/Vercel build and development configuration.
- `vitest.config.ts`: unit/integration/eval test configuration and setup files.
- `playwright.config.ts`: browser projects, base URL, timeouts, and local server.
- `convex/convex.config.ts`: Convex components and environment keys.
- `convex/auth.config.ts`: Clerk issuer/audience configuration.
- `components.json`: shadcn/ui paths and style configuration.
- `.env.example`: declared local/deployment environment names.

**Core Logic:**
- `src/modules/customer-request/compiler.ts`: deterministic request interpretation/graph compilation and plan contracts.
- `src/modules/customer-request/public.ts`: supported Customer Request domain/application seam.
- `src/modules/capability-contract/public.ts`: capability contract schemas and decision semantics.
- `src/modules/capability-supply/public.ts`: publication, binding, readiness, and transport ownership seam.
- `src/modules/common/action.ts`: cross-surface action contract.
- `src/modules/actions/index.ts`: explicit action registry.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: answer turn phase orchestration.
- `src/modules/action-invocation/durable.ts`: durable invocation tracing and cold resume.
- `src/modules/work-tree/internal/root-loop.ts`: source-backed human/agent WorkTree orchestration.
- `src/lib/server/convex-source.ts`: typed authenticated/public Convex transport seam.
- `convex/customerRequestApplication.ts`: Customer Request application commands and source caller resolution.
- `convex/customerRequestRouteTransportWorker.ts`: bounded external route effect execution.

**Testing:**
- `tests/unit/`: focused module and contract behavior.
- `tests/integration/`: Convex/source/multi-module composition.
- `tests/e2e/`: browser journey and accessibility proof.
- `tests/deploy-smoke/`: hosted/release lifecycle readback.
- `tests/imports/`: architectural dependency rules.
- `tests/seo/`, `tests/ui-contract/`, `tests/types/`: specialized public/UI/type contracts.
- `tests/helpers/`, `tests/setup/`, `tests/fixtures/`: deterministic test seams and inputs.

## Naming Conventions

**Files:**
- File routes encode URL segments and protocols: `src/routes/api.requests.$requestRef.run.ts`, `src/routes/$slug.ucp.ts`, `src/routes/[.]well-known/ucp.ts`.
- Public module seams are named `public.ts`: `src/modules/customer-request/public.ts`, `src/modules/registry/public.ts`.
- Action declarations use the `*.actions.ts` suffix: `src/modules/customer-request/customer-request.actions.ts`, `src/modules/work-tree/work-tree-agent.actions.ts`.
- TanStack/source adapters use `*.functions.ts`: `src/modules/registry/registry.functions.ts`, `src/modules/customer-request/customer-request.functions.ts`.
- Convex schema fragments use `internal/*schema.ts` or `*.schema.ts`: `src/modules/action-invocation/internal/convex-schema.ts`, `src/modules/answer-thread/answer-thread.schema.ts`.
- Convex functions use context/lifecycle names: `convex/customerRequestApplication.ts`, `convex/customerRequestRouteExecution.ts`, `convex/workTrees.ts`.
- React product components use `Ae` PascalCase: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/supply/AeSupplyFunnel.tsx`; generic UI files are lowercase: `src/components/ui/button.tsx`.
- Tests use `*.test.ts`/`*.test.tsx`; Playwright browser specs use `*.spec.ts`.

**Directories:**
- Bounded contexts use lowercase kebab-case: `src/modules/customer-request/`, `src/modules/capability-supply/`, `src/modules/answer-thread/`.
- Private module code is grouped under `internal/`; route families use TanStack pathless/parameter naming such as `_operator/`, `$slug`, and `$requestRef`.
- Test directories mirror the boundary under test: `tests/unit/customer-request/`, `tests/integration/`, `tests/imports/`, and `tests/deploy-smoke/`.
- Convex ports preserve the owning function family: `customerRequestV2*Ports.ts`, `customerRequestRouteExecution*Ports.ts`, and `capabilitySupply*Ports.ts`.

## Where to Add New Code

**New Feature:**
- Primary code: Add or extend the owning bounded context under `src/modules/<context>/`; expose supported contracts through `public.ts`, then add a `*.actions.ts` declaration or `*.functions.ts` source adapter as needed.
- Routes/hosts: Add only a thin wrapper under `src/routes/`, `src/lib/server/`, `tools/ae/`, or the relevant UI directory; register action-backed operations in `src/modules/actions/index.ts`.
- Durable state: Add the module's schema fragment under `src/modules/<context>/internal/` and compose it in `convex/schema.ts`; implement Convex application/port functions in `convex/`.
- Tests: Mirror the owning boundary under `tests/unit/` and add `tests/integration/`, `tests/e2e/`, or `tests/deploy-smoke/` only for the observable cross-boundary contract.

**New Component/Module:**
- Implementation: `src/modules/<new-context>/` with `public.ts`, private `internal/` contracts/ports, action declarations where applicable, and source adapters; add its durable schema fragment and Convex functions only if it owns persistent state.
- UI: Product-specific components belong under `src/components/ae/<journey>/`; generic primitives belong under `src/components/ui/`.

**Utilities:**
- Shared helpers: Put domain-neutral deterministic helpers in `src/modules/common/`; put HTTP/transport helpers in `src/lib/http/` or `src/lib/server/`; put UI-only helpers in `src/lib/ui/`. Do not put business decisions in a generic utility.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router generated route imports and registration.
- Generated: Yes.
- Committed: Yes; regenerate from `src/routes/` rather than editing by hand.

**`convex/_generated/`:**
- Purpose: Convex generated API, server, data-model, and AI guidance files.
- Generated: Yes.
- Committed: Present in the source tree; never use it as a hand-written extension point.

**`.convex/`:**
- Purpose: Local Convex deployment database, storage blobs, and runtime state.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

**`.vercel/`, `.tanstack/`, `.vinxi/`, `.output/`, and `dist/`:**
- Purpose: Build, deployment, and framework scratch/output artifacts.
- Generated: Yes.
- Committed: No; ignored or generated outside primary source.

**`.planning/codebase/`:**
- Purpose: Seven canonical GSD codebase maps, including this architecture/structure pair and the preserved prompt-data-flow map.
- Generated: Yes, by the mapper workflow from current source inspection.
- Committed: Yes; documents are source-navigation artifacts, not runtime imports.

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Provenance record for a vendored external artifact.
- Generated: No.
- Committed: Yes; it is not the active application implementation.

---

*Structure analysis: 2026-08-02*
