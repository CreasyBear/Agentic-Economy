# Codebase Structure

**Analysis Date:** 2026-07-13

## Directory Layout

```text
Agentic-Economy/
├── .agents/                 # Repo-local assistant guidance and AE skills
├── .github/workflows/       # CI, evaluation, release, and proof gates
├── .planning/               # GSD project, research, design, evidence, maps, and graph artifacts
├── convex/                  # Deployable data, functions, auth, cron, HTTP, and adapters
│   └── _generated/          # Convex-generated API and model types
├── docs/
│   └── architecture/        # Durable maintainer architecture documents
├── eval/answer/             # Answer cases, evaluators, assertions, and runners
├── examples/                # Routing edge, provider, directory, and agent integration programs
├── public/                  # Static logo, brand, and image assets
├── scripts/                 # Repository verification and operational scripts
├── src/
│   ├── components/          # Reusable React presentation and Astryx adapters
│   ├── lib/                 # Cross-domain runtime adapters
│   ├── modules/             # Bounded domains, actions, public seams, and private implementations
│   ├── routes/              # TanStack file routes, pages, resources, JSON APIs, and SSE
│   ├── styles/              # Global/style-layer CSS
│   └── views/               # Route-facing view composition
├── tests/                   # Unit through deployed-smoke and architecture verification
├── tools/release/           # Release/readiness proof CLIs
├── vendor/                  # Vendored protocol/kernel provenance material
├── AGENTS.md                # Product and repository assistant contract
├── DESIGN.md                # Visual/UI source of truth
├── PRODUCT.md               # Product thesis and trust contract
├── package.json             # Runtime dependencies and executable verification commands
├── tsconfig.json            # TypeScript compiler and path configuration
├── vite.config.ts           # TanStack/Vite/Nitro/Vercel build configuration
├── vitest.config.ts         # Vitest project configuration
└── playwright.config.ts     # Local browser/E2E configuration
```

## Directory Purposes

**`src/routes/`:**
- Purpose: URL-owned adapters for SSR pages, authenticated operator pages, public resources, JSON APIs, webhooks, and streaming answers.
- Contains: Flat TanStack file-route names plus a small `_operator/` presentation-helper directory.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.ts`, `src/routes/api.requests.ts`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/_operator.tsx`.
- Route families: public pages, business registry/listing, answer/thread readback, customer requests under `/api/requests` and `/api/v1/requests`, discovery resources, notification provider endpoints, observability, operator routes, and routing-adjacent sandbox resources.

**`src/modules/`:**
- Purpose: Bounded domain models, reusable action/application contracts, and explicit cross-module APIs.
- Contains: `public.ts`, focused domain files, optional `*.functions.ts` and `*.actions.ts`, plus private `internal/` directories.
- Current domains: `actions`, `answer`, `answer-thread`, `business`, `capability-contract`, `capability-contract-registry`, `capability-supply`, `catalog`, `common`, `customer-request`, `demand`, `dev`, `discovery`, `harness`, `inquiries`, `lifecycle`, `network-guard`, `notification-outbox`, `observability`, `product`, `provider-integrations`, `registry`, `routing-kernel`, `routing-tracer`, `sandbox-supply`, `security`, `seo`, `settings`, and `storefront`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/routing-kernel/internal/kernel.ts`.

**`src/modules/actions/`:**
- Purpose: Explicit central registry for reusable action contracts.
- Key file: `src/modules/actions/index.ts` imports action constants, rejects duplicate IDs, and exposes `listActions`/`findAction`.
- Rule: Add a new operation in the owning domain's `*.actions.ts`, then explicitly register it here; do not rely on import side effects.

**`src/modules/capability-supply/` and `src/modules/provider-integrations/`:**
- Purpose: Separate neutral capability-supply declaration/registration from provider-specific execution inputs.
- Contains: Capability supply contracts, schema/commands, and shipping-provider public/server adapters.
- Durable adapter: `convex/capabilitySupply.ts`.
- Status: Present in the current working tree and not yet represented by the July 11 map.

**`src/components/`:**
- Purpose: Reusable React presentation outside route ownership.
- Subdirectories: `src/components/ae/` for product behavior/presentation, `src/components/astryx/` for Astryx router/runtime adapters, `src/components/ai-elements/` for answer UI primitives, and `src/components/animate/` for animation helpers.
- Product groups: `artifacts/`, `chat/`, `customer-request/`, `feedback/`, `forms/`, `harness/`, `inquiries/`, `landing/`, `layout/`, `listing/`, `motion/`, `operator/`, `primitives/`, `readback/`, and `status/`.
- Visual authority: Follow `DESIGN.md`; new UI should use Astryx rather than extend bespoke `Ae*` presentation systems.

**`src/lib/`:**
- Purpose: Cross-domain runtime infrastructure rather than product-domain logic.
- Subdirectories: `http/`, `server/`, `observability/`, `operator/`, and `ui/`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/bounded-request-body.ts`, `src/lib/http/security-headers.ts`, `src/lib/observability/config.ts`, `src/lib/ui/contract-scans.ts`.
- Customer-request HTTP adapters: `src/lib/server/customer-request-api.ts`, `customer-request-agent-api.ts`, `customer-request-authorization-api.ts`, `customer-request-facts-api.ts`, `customer-request-inspect-api.ts`, `customer-request-messages-api.ts`, and `customer-options-api.ts`.

**`convex/`:**
- Purpose: Deployable persistence/transaction boundary, human authz, source-write admission, cron/background work, and hosted routing protocol.
- Key files: `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/auth.config.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`.
- Domain entry points: `convex/answerThreads.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/customerRequests.ts`, `convex/capabilitySupply.ts`, `convex/settings.ts`, and focused routing-kernel files.
- Routing cluster: `convex/routingKernel.ts`, `routingKernelAdmission.ts`, `routingKernelAgentGrants.ts`, `routingKernelBindings.ts`, `routingKernelEvidence.ts`, `routingKernelIncidentControl.ts`, `routingKernelStoreAdapter.ts`, `routingKernelTracer.ts`, and related files.

**`tests/`:**
- Purpose: Behavioral and structural verification across product layers.
- Subdirectories: `unit/`, `integration/`, `e2e/`, `deploy-smoke/`, `eval/`, `imports/`, `types/`, `copy/`, `seo/`, `ui/`, `ui-contract/`, `ai/`, `scripts/`, `fixtures/`, `helpers/`.
- Key guardrails: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/routing-kernel-boundaries.test.ts`, `tests/imports/capability-contract-boundaries.test.ts`, `tests/imports/capability-supply-boundaries.test.ts`, and `tests/imports/customer-request-boundaries.test.ts`.
- Capability-supply proof currently includes `tests/integration/capability-supply-registration.test.ts`, `tests/integration/capability-supply-sandbox-registration.test.ts`, and `tests/unit/capability-supply/`.

**`eval/answer/`:**
- Purpose: Offline/live answer quality, coverage, grounding, tool-use, and response-contract evaluation.
- Contains: `lib/`, `scripts/`, Promptfoo configuration, cases, evaluators, and report generation.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/run-suite.ts`, `eval/answer/scripts/audit-coverage.ts`.

**`examples/`:**
- Purpose: Executable boundary/integration examples rather than product source authority.
- Subdirectories: `examples/routing-edge/`, `examples/routing-provider/`, `examples/routing-agent-directory/`, `examples/routing-agent-bridge/`, and external-agent contract material.
- Routing provider scripts exercise hosted canary, budget/data authority, inspection, cancellation, compiler, evidence, and tracer paths.

**`tools/release/`:**
- Purpose: Source and hosted proof utilities used by release/readiness scripts.
- Rule: A passing local/source check is distinct from hosted/readback proof.

**`docs/architecture/`:**
- Purpose: Durable maintainer architecture documentation.
- Current key file: `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`.

**`.planning/`:**
- Purpose: GSD-owned project state, goals, requirements, roadmap, research, design artifacts, evidence, codebase maps, and generated graph material.
- Key current areas: `.planning/codebase/`, `.planning/design/`, `.planning/research/`, `.planning/archive/`, and `.planning/graphs/`.
- Runtime rule: Planning artifacts are supporting/derived evidence; live source and executable verification remain authoritative for current implementation claims.

**`.agents/`:**
- Purpose: Repo-local assistant context and AE-specific skills.
- Contains: `.agents/skills/` and project guidance resources.

**`public/`:**
- Purpose: Static browser assets.
- Contains: `public/brand/`, `public/images/`, favicon/app icon material, and other deployable files.

**`vendor/`:**
- Purpose: Committed upstream/reference material with preserved provenance.
- Key area: `vendor/handshake-protocol-kernel/`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start request middleware composition.
- `src/router.tsx`: Router factory and generated tree registration.
- `src/routes/__root.tsx`: HTML shell, Astryx providers, observability boundary, and client scripts.
- `src/routeTree.gen.ts`: Generated route registry.
- `src/routes/api.answer.turn.ts`: SSE answer-turn HTTP entry.
- `convex/http.ts`: Hosted routing descriptor, lifecycle, and MCP protocol router.
- `convex/crons.ts`: Scheduled Convex work.
- `eval/answer/scripts/run-suite.ts`: Answer evaluation CLI.

**Configuration:**
- `package.json`: Dependencies and verification/release commands.
- `tsconfig.json`: Strict compiler options and `@/*` path alias.
- `vite.config.ts`: TanStack Start, Nitro/Vercel Node, React, Tailwind, Astryx SSR, and Sentry setup.
- `vitest.config.ts`: Test discovery and runtime configuration.
- `playwright.config.ts`: Local E2E/browser projects.
- `playwright.deploy-smoke.config.ts`: Hosted smoke configuration.
- `doctor.config.ts`: React Doctor configuration.
- `.env.example`: Documented environment-variable surface.
- `convex/auth.config.ts`: Convex JWT/Clerk authentication provider configuration.

**Core Logic:**
- `src/modules/*/public.ts`: Supported cross-module contracts.
- `src/modules/*/internal/`: Private policies, commands, schemas, projections, and validators.
- `src/modules/*/*.functions.ts`: TanStack server-function/application adapters.
- `src/modules/*/*.actions.ts`: Reusable typed action contracts.
- `src/modules/actions/index.ts`: Action registry.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Answer turn phase orchestration.
- `src/modules/answer-thread/internal/tool-runner.ts`: Read-only action execution and evidence buffering.
- `src/modules/routing-kernel/internal/kernel.ts`: Neutral routing lifecycle.
- `convex/source_state.ts`: Durable document/source-state helpers.
- `convex/schema.ts`: Composed table schema.

**Public and Machine-Readable Surfaces:**
- `src/routes/registry.tsx`: Human registry.
- `src/routes/api.businesses.ts`: Published catalog list JSON.
- `src/routes/api.businesses.search.ts`: Published catalog search JSON.
- `src/routes/api.businesses.$slug.ts`: Published listing-detail JSON.
- `src/routes/llms[.]txt.ts`: Plain-text assistant index.
- `src/routes/SKILL[.]md.ts`: Published assistant skill document.
- `src/routes/$slug.ucp.ts`: Per-listing machine-readable UCP resource.
- `src/routes/api.discovery.schema.ts`: Discovery schema resource.
- `src/routes/api.answer.turn.ts`: Internal product answer/tool loop over SSE.
- `convex/http.ts`: Separately hosted routing-kernel machine protocol.
- Current-source caveat: no `/api/agent/tools` file route exists in `src/routes/` or `src/routeTree.gen.ts`.

**Security and Transport:**
- `src/lib/server/convex-source.ts`: Public/authenticated web-to-Convex gateway.
- `src/lib/server/source-write-admission.ts`: Web request admission adapter.
- `convex/sourceWriteAdmission.ts`: Durable write-admission enforcement.
- `convex/authz.ts`: Human identity/authority resolution.
- `src/modules/security/`: Admin, dispute, duplicate, authority, and admission contracts.
- `src/modules/routing-kernel/caller-identity.ts`: Signed agent identity verification.
- `src/modules/routing-kernel/authorization.ts`: Routing authorization rules.

**Testing:**
- `tests/unit/`: Focused domain and adapter behavior.
- `tests/integration/`: Cross-boundary application behavior.
- `tests/e2e/`: Browser journeys and `tests/e2e/a11y/` accessibility.
- `tests/deploy-smoke/`: Hosted public/auth/provider checks.
- `tests/imports/`: Architecture, dependency, and TypeScript guardrails.
- `tests/ui-contract/`: Design, route, copy, and component constraints.
- `tests/fixtures/`: Negative scanner and integration fixtures.

**Documentation:**
- `README.md`: Setup and project overview.
- `AGENTS.md`: Always-on product and implementation boundaries.
- `DESIGN.md`: Visual/UI authority.
- `PRODUCT.md`: Product thesis and trust contract.
- `UBIQUITOUS_LANGUAGE.md`: Domain terminology.
- `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`: Customer-request authority boundary.
- `.planning/PROJECT.md`: GSD project intent and scope.
- `.planning/codebase/`: Generated current-state references.

## Naming Conventions

**Files:**
- `kebab-case.ts` for utilities/internal domain files, e.g. `src/modules/common/stable-hash.ts`.
- `camelCase.ts` for Convex function modules and some adapters, e.g. `convex/sourceWriteAdmission.ts`.
- `PascalCase.tsx` for reusable React components, e.g. `src/components/astryx/RouteProgressBar.tsx`.
- TanStack route notation uses dots for nested path segments, `$param` for dynamics, `_operator` for a pathless layout, and `[.]` to escape a literal dot.
- `public.ts` is the intended cross-module façade; `internal/` marks private implementation.
- `*.functions.ts` denotes server-function/application adapters; `*.actions.ts` denotes reusable action contracts.
- `*.test.ts(x)` is Vitest; `*.spec.ts` is primarily Playwright/browser-level.
- `UPPERCASE.md` is reserved for canonical project/reference documents.

**Directories:**
- Lowercase kebab-case for domains such as `answer-thread/`, `capability-supply/`, `notification-outbox/`, and `routing-kernel/`.
- Plural collection names such as `components/`, `modules/`, `routes/`, and `tests/`.
- `internal/` consistently marks module-private implementation.
- Test directories name proof classes rather than mechanically mirroring every source folder.

**Special Patterns:**
- Action ID: `<domain>.<operation>`, e.g. `registry.search` and `inquiry.submit`.
- Convex function reference: `<file>:<export>`, e.g. `answerThreads:createAnswerThread`.
- Operation, audit, receipt, run, and evidence identities use explicit domain prefixes and stable hashes.
- Generated files use `.gen` or `_generated` and are updated by their owning tool, not manually.

## Where to Add New Code

**New Domain Capability:**
- Public API: `src/modules/<domain>/public.ts`.
- Pure/private implementation: `src/modules/<domain>/internal/`.
- Web adapter: `src/modules/<domain>/<domain>.functions.ts`.
- Reusable action: `src/modules/<domain>/<domain>.actions.ts`, then register in `src/modules/actions/index.ts`.
- Persistence adapter: `convex/<domain>.ts`.
- Tables: module-local `internal/schema.ts` or `internal/convex-schema.ts`, composed in `convex/schema.ts`.
- Tests: focused `tests/unit/<domain>/` plus `tests/integration/` for transport/persistence.

**New Page or HTTP API:**
- Route definition: `src/routes/<tanstack-file-route>.tsx` or `.ts`.
- Reusable UI: prefer Astryx primitives/adapters in `src/components/astryx/`; existing behavioral AE modules may remain under `src/components/ae/` while being re-skinned.
- Domain behavior: call the owning module public/function/action seam; do not put Convex schema or persistence ownership in the route.
- Tests: `tests/integration/`, `tests/e2e/`, and applicable `tests/ui-contract/` or `tests/copy/`.

**New Action:**
- Declaration: owning `src/modules/<domain>/<domain>.actions.ts`.
- Shared types/metadata contract: reuse `src/modules/common/action.ts`.
- Registration: explicit entry in `src/modules/actions/index.ts`.
- Answer-thread availability: add only if read-only and update the enumerated tool contract in `src/modules/answer-thread/`; action registration alone does not expose it there.
- HTTP/agent JSON: add an explicit adapter/resource route; `surfaces` metadata does not create a route automatically.

**New Convex Operation:**
- Add to the owning `convex/<domain>.ts` or a focused sibling.
- Keep reusable domain policy in `src/modules/<domain>/` and use `convex/authz.ts`/`convex/sourceWriteAdmission.ts` where authority applies.
- Read `convex/_generated/ai/guidelines.md`, run Convex codegen, and never hand-edit `convex/_generated/`.

**New Capability Supply or Provider Adapter:**
- Neutral supply contract/state: `src/modules/capability-supply/`.
- Durable registration/readback: `convex/capabilitySupply.ts`.
- Provider-specific server integration: `src/modules/provider-integrations/<provider-or-domain>/`.
- Customer-request use: through `src/modules/customer-request/` ports/preparation rather than importing provider details into neutral contract logic.
- Proof: `tests/unit/capability-supply/`, integration registration tests, provider input-contract tests, and import-boundary tests.

**New Routing Binding:**
- Contract/lifecycle: `src/modules/routing-kernel/`.
- Provider adapter registration: `convex/routingKernelBindings.ts`.
- Store behavior: `convex/routingKernelStoreAdapter.ts` and focused routing siblings.
- Transport: `src/modules/routing-kernel/http.ts`, `mcp.ts`, or `descriptor.ts`, mounted in `convex/http.ts`.
- Tests: routing-kernel unit/integration/boundary tests and hosted proof where external effects are claimed.

**New Cross-Cutting Utility:**
- Domain-neutral primitive: `src/modules/common/`.
- Server adapter: `src/lib/server/`.
- HTTP helper: `src/lib/http/`.
- Browser/UI helper: `src/lib/ui/`.
- Observability adapter: `src/lib/observability/`.
- Keep single-domain utilities in their owning module.

**New Script or Evaluation:**
- Answer evaluation: logic in `eval/answer/lib/`, runner in `eval/answer/scripts/`.
- Release/readiness proof: `tools/release/` and stable command in `package.json`.
- General repository operation: `scripts/`.
- External integration example: `examples/<integration-name>/`.

## Special Directories

**`convex/_generated/`:**
- Purpose: Generated Convex API, server, and data-model types.
- Source: `convex codegen`.
- Committed: Yes; never manually edit.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route registry.
- Source: TanStack Router/Vite route generation from `src/routes/`.
- Committed: Yes; never manually edit.

**`.planning/graphs/` and `graphify-out/`:**
- Purpose: Graphify graph/build outputs and caches.
- Source: GSD Graphify.
- Committed: `.planning/graphs/GRAPH_REPORT.md` may remain tracked; generated graph JSON/cache paths are ignored by the current `.gitignore` policy.

**`.vercel/`, `.tanstack/`, `.output/`:**
- Purpose: Framework and deployment build outputs.
- Source: Vercel, TanStack, Nitro, and Vite builds.
- Committed: No; ignored.

**`output/`:**
- Purpose: Generated evaluation/audit outputs.
- Source: Evaluation, audit, and planning commands.
- Committed: Generated content is ignored by default.

**`.planning/`:**
- Purpose: Workflow-managed planning, research, design, evidence, and mapping artifacts.
- Source: GSD workflows and maintainers.
- Committed: Mixed; canonical planning documents are tracked while generated graph payloads are ignored.

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Vendored upstream/reference material with provenance.
- Source: External kernel artifact/source snapshot.
- Committed: Yes; preserve its ownership boundary.

**`src/future-phases/`:**
- Purpose: Deferred material not part of active runtime proof.
- Source: Future-phase work.
- Committed: Present but excluded by `tsconfig.json`.

**`node_modules/`:**
- Purpose: npm-installed dependencies.
- Source: `npm install` / lockfile.
- Committed: No; ignored.

---

*Structure analysis: 2026-07-13*
*Update when directory structure changes*
