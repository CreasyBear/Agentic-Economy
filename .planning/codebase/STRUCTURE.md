# Codebase Structure

**Analysis Date:** 2026-09-04

## Directory Layout

```text
Agentic-Economy/
├── src/                         # TanStack app, adapters, UI, and domain modules
│   ├── start.ts                   # Global TanStack request middleware
│   ├── router.tsx                 # Router construction from generated tree
│   ├── routeTree.gen.ts           # Generated TanStack route manifest
│   ├── routes/                    # File routes: pages, APIs, OAuth, MCP, webhooks
│   ├── components/
│   │   ├── ae/                    # Product-specific React components by surface/domain
│   │   ├── ai-elements/           # Chat/model interaction components
│   │   └── ui/                    # Shared UI primitives
│   ├── modules/                   # 27 domain/application modules plus boundary manifest
│   ├── lib/                       # App-level HTTP, server, operator, and observability adapters
│   ├── content/                   # Brand copy and asset references
│   ├── hooks/                     # Shared React hooks
│   ├── styles/                    # Global Tailwind/CSS styles
│   └── types/                     # Ambient TypeScript declarations
├── convex/                      # Durable database, functions, actions, workpools, crons
│   ├── schema.ts                  # Composition root for module-owned tables
│   ├── convex.config.ts           # Convex component and environment schema
│   ├── http.ts                    # Convex HTTP endpoints
│   ├── crons.ts                   # Scheduled recovery/refresh/cleanup work
│   ├── lib/                       # Convex-host helpers by durable workflow
│   └── _generated/                # Generated Convex API/data/server bindings
├── tests/                       # Unit, integration, E2E, architecture, security, and contract tests
├── tools/
│   ├── ae/                        # Source for the `ae` CLI
│   ├── dev/                       # Local runtime and evidence utilities
│   └── release/                   # Release verification and production smoke tooling
├── packages/cli/                # Distributable compiled CLI package
├── infra/                       # Cloudflare and Package 4 OpenTofu/Terraform
├── scripts/                     # CLI build/test and action-surface audit scripts
├── public/                      # Browser assets and packaged CLI archive
├── docs/adr/                    # Committed architectural decisions
├── eval/                        # Product-foundry and surface parity evaluations
├── docs/workflow/               # Maintained workflow and closeout records
├── research/                    # Dated evidence; non-authoritative for current implementation
├── diagrams/                    # Source and rendered architecture diagrams
├── .agents/skills/              # Project-vendored agent skill packages
├── .planning/codebase/          # Generated current-state codebase maps
├── PRODUCT.md                   # Active product charter
├── CONTEXT.md                   # Canonical domain language
├── AGENTS.md                    # Repository agent rules
├── package.json                 # npm workspace, scripts, dependencies, runtime contract
├── vite.config.ts               # TanStack/Vite/Nitro/Vercel build composition
├── tsconfig.json                # Strict TypeScript and path aliases
└── convex.json                  # Convex project configuration
```

## Directory Purposes

**`src/routes/`:**
- Purpose: Define all TanStack Start file-routed UI and HTTP entrances.
- Contains: Public pages (`src/routes/market.tsx`), dynamic pages (`src/routes/operations.$operationRef.tsx`), API handlers (`src/routes/api.v1.operations.call.ts`), OAuth (`src/routes/oauth.authorize.ts`), machine discovery (`src/routes/llms[.]txt.ts`), MCP (`src/routes/mcp.ts`), and webhook routes (`src/routes/api.stripe.webhook.ts`).
- Key files: `src/routes/__root.tsx`, `src/routes/_operator.tsx`, `src/routes/index.tsx`, `src/routes/market.tsx`, `src/routes/mcp.ts`.

**`src/components/ae/`:**
- Purpose: Own product-specific presentation by user surface and domain.
- Contains: `about/`, `agent-access/`, `command-panel/`, `console/`, `home/`, `layout/`, `market/`, `offerings/`, `operation-chat/`, `operator/`, `settings/`, `status/`, `supply/`, and `website/`.
- Key files: `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/market/AeMarketPage.tsx`, `src/components/ae/operation-chat/OperationChat.tsx`, `src/components/ae/supply/AeSupplyLanding.tsx`.

**`src/components/ui/`:**
- Purpose: Provide shared low-level UI primitives and theme contracts.
- Contains: Buttons, inputs, dialogs, tables, responsive containers, overlays, and theme metadata under `src/components/ui/`.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/theme-meta.ts`, `components.json`.

**`src/components/ai-elements/`:**
- Purpose: Provide reusable chat and model-output presentation elements.
- Contains: Conversation, message, reasoning, response, prompt input, and tool rendering components under `src/components/ai-elements/`.
- Key files: Use this directory for generic AI interaction primitives; keep Operation-specific chat behavior in `src/components/ae/operation-chat/`.

**`src/lib/server/`:**
- Purpose: Adapt HTTP/TanStack requests to domain services and Convex without putting transport logic in routes.
- Contains: Authentication, bounded bodies, Convex clients, correlation, RFC 9457 problems, MCP host, Operation Invocation API, supply API, Stripe/Clerk handlers, owner server functions, and source-write admission.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/operation-invoke-api.ts`, `src/lib/server/mcp-api.ts`, `src/lib/server/supply-action-api.ts`, `src/lib/server/problem.ts`.

**`src/lib/http/`:**
- Purpose: Own protocol-level HTTP helpers that are not feature/domain policy.
- Contains: Content negotiation, cache/security headers, OAuth challenge support, and HTTP request/response helpers under `src/lib/http/`.
- Key files: `src/lib/http/security-headers.ts`, `src/lib/http/agent-content-negotiation.ts`, `src/lib/http/oauth-challenge.ts`.

**`src/lib/observability/`:**
- Purpose: Compose browser/server telemetry adapters and safe telemetry projection.
- Contains: Sentry, PostHog, boot hooks, client error submission, and redaction/sanitization helpers under `src/lib/observability/`.
- Key files: `src/lib/observability/sentry.server.ts`, `src/lib/observability/posthog.server.ts`, `src/lib/observability/boot-client-observability.ts`, `src/lib/observability/private-route-safety.ts`.

**`src/lib/operator/`:**
- Purpose: Project authenticated workspace navigation and route context independently of domain records.
- Contains: Navigation, route options, operator context, and surface mapping under `src/lib/operator/`.
- Key files: `src/lib/operator/route-options.ts`, `src/lib/operator/navigation.ts`, `src/lib/operator/operator-context.ts`.

**`src/modules/`:**
- Purpose: Act as the primary unit of domain and application ownership.
- Contains: 27 named modules with explicit entry surfaces and allowed dependencies in `src/modules/module-boundaries.ts`.
- Key files: `src/modules/module-boundaries.ts` plus each module's `public.ts`, `server.ts`, `schema.ts`, `*.actions.ts`, `*.functions.ts`, or `internal/` subtree as applicable.

**`src/modules/common/`:**
- Purpose: Provide dependency-free, broadly reusable primitives.
- Contains: Canonical digests, bounded JSON helpers, IDs, normalization, base64, JSON pointers, random/runtime IDs, and action contracts.
- Key files: `src/modules/common/action.ts`, `src/modules/common/canonical-digest.ts`, `src/modules/common/ids.ts`, `src/modules/common/bounded-json.ts`.

**`src/modules/capability-supply/`:**
- Purpose: Own Provider Operation source import, contract/binding admission, Publication, readiness, current Operation projection, Provider connection, and route transports.
- Contains: Public/runtime entry files at the directory root and private implementations grouped under `src/modules/capability-supply/internal/`.
- Key files: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/server.ts`, `src/modules/capability-supply/schema.ts`, `src/modules/capability-supply/supply-actions.ts`, `src/modules/capability-supply/operation-source.ts`.

**`src/modules/capability-execution/`:**
- Purpose: Own caller-facing inspect, Commitment, Invocation, status/cancel/reconcile, and durable worker composition.
- Contains: Action/route contracts at the root, private helpers under `internal/`, and effectful worker stages under `invocation-worker/`.
- Key files: `src/modules/capability-execution/operation-commitment.actions.ts`, `src/modules/capability-execution/operation-invoke.ts`, `src/modules/capability-execution/operation-invoke-contracts.ts`, `src/modules/capability-execution/invocation-runtime.ts`.

**`src/modules/action-invocation/`:**
- Purpose: Own the transport-neutral durable effect-control kernel.
- Contains: Canonical claim/release, attempt and standing-Mandate policies, durable/in-memory ports, and schema definitions.
- Key files: `src/modules/action-invocation/public.ts`, `src/modules/action-invocation/runtime.ts`, `src/modules/action-invocation/canonical-claim.ts`, `src/modules/action-invocation/schema.ts`.

**`src/modules/money/`:**
- Purpose: Own exact amounts, funding, prices, capacity, Charges, Provider economics, refunds, payouts, Stripe, Formance, and treasury policy.
- Contains: Stable public/server/Convex entry files at the root and implementation details under `src/modules/money/internal/`.
- Key files: `src/modules/money/public.ts`, `src/modules/money/server.ts`, `src/modules/money/schema.ts`, `src/modules/money/formance.ts`, `src/modules/money/internal/convex-schema.ts`.

**`src/modules/agent-access/`, `src/modules/authority/`, `src/modules/principal-account/`:**
- Purpose: Keep credentials, durable Agent Principal identity, Account ownership, delegation, Mandates, workload context, and recovery authority distinct.
- Contains: Agent access/OAuth/grant policy in `src/modules/agent-access/`; delegation/context/recovery in `src/modules/authority/`; Account, principal, external identity, and workload types in `src/modules/principal-account/`.
- Key files: `src/modules/agent-access/public.ts`, `src/modules/agent-access/policy.ts`, `src/modules/authority/delegation/public.ts`, `src/modules/principal-account/public.ts`.

**`src/modules/registry/`, `src/modules/market/`, `src/modules/catalog/`:**
- Purpose: Project canonical admitted Operations into public discovery, comparison, catalogue, evidence, and market views.
- Contains: Action contracts and public projections in `src/modules/registry/`; market evidence/source adapters in `src/modules/market/`; business catalogue models in `src/modules/catalog/`.
- Key files: `src/modules/registry/operations.actions.ts`, `src/modules/registry/operation-choice-contracts.ts`, `src/modules/market/market.functions.ts`, `src/modules/catalog/public.ts`.

**`src/modules/actions/`:**
- Purpose: Register every reusable agent-facing action and derive machine tool contracts.
- Contains: Explicit registry, navigation contracts, strict schema checks, and tool projections.
- Key files: `src/modules/actions/index.ts`, `src/modules/actions/contract.ts`, `src/modules/actions/strict-schema.ts`, `src/modules/actions/tool-contract.ts`.

**`convex/`:**
- Purpose: Host authoritative tables, function roots, transactional adapters, external-I/O actions, background work, and schedules.
- Contains: Feature-prefixed root files (`convex/capabilitySupply*.ts`, `convex/capabilityOperation*.ts`, `convex/money*.ts`, `convex/agentAccess*.ts`), helper subtrees under `convex/lib/`, and generated bindings under `convex/_generated/`.
- Key files: `convex/schema.ts`, `convex/convex.config.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/workloadCron.ts`.

**`tests/`:**
- Purpose: Verify behavior, boundaries, contracts, integrations, security, accessibility, and deployments.
- Contains: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/imports/`, `tests/types/`, `tests/security/`, `tests/seo/`, `tests/ui-contract/`, `tests/deploy-smoke/`, fixtures, setup, and helpers.
- Key files: `tests/imports/module-boundaries.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/integration/capability-operation-workpool.test.ts`, `tests/e2e/authenticated/package4-account-commerce.spec.ts`.

**`tools/`:**
- Purpose: Provide operable developer, release, evidence, and CLI workflows without shipping them into the web application.
- Contains: CLI source under `tools/ae/`, local/evidence tools under `tools/dev/`, and production verification under `tools/release/`.
- Key files: `tools/ae/cli.ts`, `tools/dev/local-dev.mjs`, `tools/release/operation-gateway-production-smoke.ts`, `tools/release/verify-release-integrity.ts`.

**`packages/cli/`:**
- Purpose: Define the minimal publishable npm package for the `ae` binary.
- Contains: Compiled `packages/cli/dist/ae.js`, `packages/cli/package.json`, and `packages/cli/README.md`.
- Key files: Build source remains in `tools/ae/`; `scripts/build-cli.mjs` creates the distributable artifact.

**`infra/`:**
- Purpose: Define Cloudflare account baseline and Package 4 AWS/Cloudflare/Formance release environments and recovery drill.
- Contains: `infra/cloudflare/account-baseline/`, `infra/package4/account-baseline/`, `infra/package4/environments/`, `infra/package4/modules/release-environment/`, and `infra/package4/recovery-drill/`.
- Key files: `infra/package4/README.md`, `infra/package4/modules/release-environment/compute.tf`, `infra/package4/modules/release-environment/database.tf`, `infra/package4/recovery-drill/README.md`.

**`docs/adr/`:**
- Purpose: Keep committed architectural decisions that remain part of repository authority.
- Contains: ADR markdown only; most other local `docs/` material is ignored by `.gitignore`.
- Key files: `docs/adr/0001-principal-reseller-commercial-topology.md`.

**`research/`, `eval/`, `diagrams/`:**
- Purpose: Preserve supporting evidence, model/product evaluation, repository gate descriptions, and architecture visuals.
- Contains: Dated research in `research/`, executable TypeScript evaluation in `eval/product-foundry/`, retained diagram sources in `diagrams/`. Legacy gates and superseded diagram variants were retired on 2026-09-08; recovery is documented in `docs/workflow/work/WF-20260908-closeout.md`.
- Key files: `research/README.md`, `eval/product-foundry/public.ts`, `src/modules/module-boundaries.ts`, `diagrams/ae-application-primitives.mmd`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: Global TanStack Start request middleware composition.
- `src/router.tsx`: Client/server router factory using the generated route tree.
- `src/routes/__root.tsx`: HTML shell, Clerk/Convex providers, client observability, global error/toast presentation.
- `src/routes/index.tsx`: Public home route.
- `src/routes/market.tsx`: Canonical public Operation catalogue and compare route.
- `src/routes/_operator.tsx`: Authenticated workspace layout for `src/routes/_operator/` children.
- `src/routes/mcp.ts`: Streamable HTTP MCP route.
- `tools/ae/cli.ts`: In-repository CLI entry.
- `convex/http.ts`: Convex-hosted HTTP routes.
- `convex/crons.ts`: Scheduled Convex entry points.

**Configuration:**
- `package.json`: npm workspace, runtime versions, dependencies, and all build/test/release commands.
- `package-lock.json`: Reproducible npm dependency graph.
- `tsconfig.json`: Strict TypeScript configuration and `@/*`/`~/*` source aliases.
- `vite.config.ts`: TanStack Start, Nitro, React, Tailwind, Sentry, and Vercel Node build configuration.
- `vitest.config.ts`: Unit/integration test runner configuration.
- `playwright.config.ts`: Default browser E2E configuration; specialized configs live at `playwright.authenticated.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.chat-staging.config.ts`.
- `convex.json`: Convex project path and generation settings.
- `convex/convex.config.ts`: Convex components and typed environment schema.
- `components.json`: Shared UI component generator configuration.
- `oxlint.config.ts`: Lint configuration.
- `.nvmrc`: Local Node version selection.
- `.env.example`: Environment variable names/examples only; real `.env*` files are local and must not be read or committed.

**Core Logic:**
- `src/modules/module-boundaries.ts`: Executable module ownership and dependency graph.
- `src/modules/common/action.ts`: Cross-surface action definition.
- `src/modules/actions/index.ts`: Explicit machine-action registry.
- `src/modules/capability-supply/public.ts`: Main public Operation/supply contract seam.
- `src/modules/capability-execution/operation-invoke.ts`: Invocation application core.
- `src/modules/capability-execution/invocation-runtime.ts`: Node worker orchestration seam.
- `src/modules/action-invocation/canonical-claim.ts`: Durable claim and effect identity.
- `src/modules/money/public.ts`: Public money types, exact amounts, and policies.
- `convex/capabilityOperationCommitments.ts`: Authenticated Operation inspection and Commitment persistence.
- `convex/capabilityOperationInvocations.ts`: Invocation/recovery Convex function root.
- `convex/capabilityOperationInvocationWorker.ts`: Background Provider-call/recovery worker root.
- `convex/capabilitySupplyOperations.ts`: Public current Operation query root.
- `convex/schema.ts`: Durable schema composition root.

**Testing:**
- `tests/unit/<module>/`: Unit tests mirroring source ownership, such as `tests/unit/capability-execution/` and `tests/unit/money/`.
- `tests/integration/`: Cross-module and Convex integration tests.
- `tests/e2e/`: Playwright browser journeys.
- `tests/e2e/authenticated/`: Required authenticated browser journeys.
- `tests/imports/`: Executable architecture and import-boundary gates.
- `tests/types/`: Compile-time/domain contract assertions.
- `tests/security/`: Security and maturity controls.
- `tests/ui-contract/`: Static UI contract scans.
- `tests/helpers/`, `tests/fixtures/`, `tests/setup/`: Shared test support only.

**Documentation Authority:**
- `PRODUCT.md`: Active product and commercial boundary.
- `CONTEXT.md`: Canonical terminology for new code and documents.
- `AGENTS.md`: Repository-specific implementation rules.
- `README.md`: Public and operational introduction.
- `START_LINE.md`: Next proof, not a claim of current completion.
- `docs/adr/`: Accepted architecture decisions.
- `.planning/codebase/`: Generated current-state maps consumed by planning/execution.

## Naming Conventions

**Files:**
- Use lowercase kebab-case for most domain implementation files: `src/modules/capability-execution/operation-invoke-contracts.ts`, `src/lib/server/bounded-request-body.ts`.
- Use role suffixes consistently: `public.ts` for supported module imports, `server.ts` for server-only composition, `schema.ts` for module tables, `*.actions.ts` for action contracts, and `*.functions.ts` for Convex/server function seams; examples are declared in `src/modules/module-boundaries.ts`.
- Use `internal/` for module-private implementation: `src/modules/money/internal/`, `src/modules/capability-supply/internal/`.
- Use camelCase filenames for Convex function roots because the filename becomes the function reference namespace: `convex/capabilityOperationInvocations.ts` → `capabilityOperationInvocations:invoke`.
- Use PascalCase with an `Ae` prefix for product React components: `src/components/ae/market/AeMarketPage.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`.
- Use lowercase primitive filenames in `src/components/ui/`: `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`.
- Use `.test.ts`/`.test.tsx` for Vitest files and `.spec.ts` for Playwright journeys under `tests/e2e/`; mirror the owning module beneath `tests/unit/`.
- Use generated suffixes only for generated artifacts: `src/routeTree.gen.ts`, `convex/_generated/`.

**Directories:**
- Use lowercase kebab-case for domain modules: `src/modules/agent-access/`, `src/modules/capability-supply/`, `src/modules/market-demand/`.
- Mirror domain ownership in tests: `src/modules/capability-supply/` ↔ `tests/unit/capability-supply/`.
- Group product UI by surface/domain under `src/components/ae/<domain>/`; use deeper directories only for cohesive subfeatures such as `src/components/ae/market/operation-detail/`.
- Group Convex helpers by durable workflow under `convex/lib/<workflow>/`, such as `convex/lib/operationInvocations/` and `convex/lib/workloadCron/`.

**Routes:**
- Use TanStack dot-delimited filenames to express URL segments: `src/routes/api.v1.market-operations.search.ts` maps to `/api/v1/market-operations/search`.
- Use `$name` for dynamic segments: `src/routes/operations.$operationRef.tsx`, `src/routes/t.$threadId.tsx`.
- Use `[.]` when a literal dot belongs in the URL: `src/routes/llms[.]txt.ts`, `src/routes/[.]well-known/ucp.ts`.
- Use route groups/layouts with a leading underscore: `src/routes/_operator.tsx` and `src/routes/_operator/`.
- Keep route files thin and delegate to `src/lib/server/` or declared `src/modules/` entry surfaces; `tests/imports/route-boundary.test.ts` enforces this.

**Identifiers:**
- Use dot-separated product action IDs: `registry.operations.search`, `operation.inspect`, `operation.invoke` in `src/modules/actions/index.ts` and owning contracts.
- Use versioned contract strings: `operation.invoke:v1`, `supply.publish:v2` in `src/modules/capability-execution/operation-invoke-entry.ts` and `src/modules/capability-supply/supply-actions.ts`.
- Use lowercase snake_case for stable refusal/problem codes: `operation_not_current`, `reconciliation_required` in `src/modules/capability-execution/operation-invoke-contracts.ts` and `src/lib/errors.ts`.
- Use versioned, namespaced durable refs and canonical digests: `operation:v1:*`, `operation-invocation:v1:*`, and action-invocation command refs from `src/modules/capability-supply/public.ts` and `src/modules/action-invocation/canonical-claim.ts`.
- Preserve compatibility identifiers such as source-level `supplier` names when already public/persisted; use canonical `Provider`, `Operation`, `Commitment`, `Invocation`, and `Call` language for new code per `CONTEXT.md`.

## Where to Add New Code

**New Feature:**
- Primary code: Add behavior to the owning directory in `src/modules/<domain>/`; create a new module only when ownership cannot fit an existing one.
- Tests: Extend `tests/unit/<domain>/` first; use `tests/integration/` only when the behavior crosses real module/Convex boundaries and `tests/e2e/` for user-observable browser journeys.
- Boundary registration: If creating a module or supported cross-module entry, update `src/modules/module-boundaries.ts` and prove it with `tests/imports/module-boundaries.test.ts`.

**New Domain Module:**
- Implementation: Create `src/modules/<lowercase-kebab-name>/` with the smallest supported entry (`public.ts` or a purpose-specific declared file) and private implementation under `internal/`.
- Durable schema: Export a table map from `src/modules/<name>/schema.ts` or `src/modules/<name>/internal/convex-schema.ts`, then compose it in `convex/schema.ts`.
- Host adapter: Add a feature-prefixed Convex root in `convex/<featureName>.ts` only for query/mutation/action registration; keep owned policy in `src/modules/<name>/`.

**New Agent-Facing Action:**
- Contract and implementation: Add the action to the owning module's `*.actions.ts` using `defineAction` from `src/modules/common/action.ts`.
- Registration: Import and append it explicitly in `src/modules/actions/index.ts`; do not rely on side effects.
- HTTP adapter: Add a thin `src/routes/api.v1.<name>.ts` route and a reusable adapter in `src/lib/server/` when transport logic exceeds simple method delegation.
- MCP/CLI: Derive MCP exposure from `src/modules/actions/index.ts`; add only protocol presentation/arguments in `tools/ae/commands/`.
- Proof: Extend action/operation surface gates in `tests/imports/` and the closest unit/integration contract tests.

**New API Endpoint:**
- Route: `src/routes/api.<segments>.ts` or `src/routes/api.v1.<segments>.ts` using `createFileRoute`.
- Handler: `src/lib/server/<feature>-api.ts` for authentication, body limits, correlation, Convex calls, and RFC 9457 projection.
- Domain: Call a declared entry from `src/modules/<owner>/`; do not import module internals or Convex schema into the route.
- Proof: Add route behavior under `tests/unit/routes/` or `tests/unit/server/`, plus architecture coverage through `tests/imports/route-boundary.test.ts`.

**New Operation Supply Behavior:**
- Public contract: `src/modules/capability-supply/public.ts` or an existing declared root file such as `src/modules/capability-supply/provider-connection.ts`.
- Implementation: `src/modules/capability-supply/internal/<cohesive-subsystem>/`.
- Convex persistence/commands: A matching `convex/capabilitySupply*.ts` root and module tables in `src/modules/capability-supply/schema.ts`.
- Proof: `tests/unit/capability-supply/` plus `tests/integration/` when Publication/readiness projections are involved.

**New Invocation or Recovery Behavior:**
- Contract/application code: `src/modules/capability-execution/`.
- Durable effect transition: `src/modules/action-invocation/` only when it changes claim/attempt/release semantics.
- Worker stage: `src/modules/capability-execution/invocation-worker/`; Convex root remains `convex/capabilityOperationInvocationWorker.ts`.
- HTTP exposure: `src/lib/server/operation-invoke-api.ts` and matching `src/routes/api.v1.operations*.ts`.
- Proof: `tests/unit/capability-execution/`, `tests/unit/action-invocation/`, and `tests/integration/capability-operation-workpool.test.ts`.

**New Money Behavior:**
- Pure types/policy: `src/modules/money/internal/`, exported deliberately through `src/modules/money/public.ts`.
- Server SDK adapter: `src/modules/money/server.ts` or an existing narrow adapter in `src/lib/server/`; keep Formance imports confined to `src/modules/money/formance.ts`.
- Tables: `src/modules/money/schema.ts` or `src/modules/money/internal/convex-schema.ts`, composed by `convex/schema.ts`.
- Convex root: A feature-prefixed `convex/money*.ts` file.
- Proof: `tests/unit/money/` and the relevant `tests/unit/convex/` or `tests/integration/` flow.

**New UI Component/Module:**
- Product component: `src/components/ae/<domain>/Ae<Name>.tsx`.
- Generic primitive: `src/components/ui/<lowercase-name>.tsx`; add only if at least two product surfaces need it.
- Generic chat primitive: `src/components/ai-elements/<lowercase-name>.tsx`; keep market semantics in `src/components/ae/operation-chat/`.
- Page composition: `src/routes/<route>.tsx`; loaders should call module/server seams rather than embed business policy.
- Tests: `tests/unit/components/`, `tests/unit/ui/`, or a mirrored feature directory under `tests/unit/`.

**New Scheduled Work:**
- Workflow logic: `convex/lib/workloadCron/` or the owning `src/modules/<domain>/` worker surface.
- Function entry: `convex/workloadCron.ts` with workload-context attribution.
- Schedule: `convex/crons.ts`.
- Proof: `tests/unit/convex/` and an integration test when the schedule coordinates durable state.

**Utilities:**
- Shared dependency-free helpers: `src/modules/common/` only when genuinely domain-neutral and used across modules.
- App/server plumbing: `src/lib/server/`, `src/lib/http/`, or `src/lib/observability/` according to runtime concern.
- Domain-specific helpers: Keep them inside `src/modules/<owner>/internal/`; do not promote them to `src/modules/common/` for convenience.

**Infrastructure:**
- Vercel/TanStack build behavior: `vite.config.ts` and `src/lib/deployment/`.
- Package 4 cloud resources: `infra/package4/modules/release-environment/`, wired by `infra/package4/environments/<environment>/`.
- Cloudflare account baseline: `infra/cloudflare/account-baseline/`.
- Release verification: `tools/release/`; local orchestration/evidence: `tools/dev/`.

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex-generated API, data model, and server bindings consumed by `convex/` and selected app surfaces.
- Generated: Yes, by `npm run generate:convex` from `package.json`.
- Committed: Yes; never hand-edit files under `convex/_generated/`.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router tree for every file in `src/routes/`.
- Generated: Yes, by TanStack/Vite dev or build.
- Committed: Yes; change `src/routes/`, not `src/routeTree.gen.ts`.

**`packages/cli/dist/`:**
- Purpose: Compiled standalone `ae` executable distributed by `packages/cli/package.json` and packed into `public/downloads/`.
- Generated: Yes, by `scripts/build-cli.mjs` / `npm run build:cli`.
- Committed: Yes; edit `tools/ae/` and rebuild.

**`.planning/codebase/`:**
- Purpose: Current-state maps used by GSD planning and execution.
- Generated: Yes, by the codebase mapping workflow.
- Committed: Tracked in repository history despite the broader local `.planning/` ignore rule; edit only through mapping/refresh work.

**`.agents/skills/`:**
- Purpose: Project-vendored agent capability instructions.
- Generated: Vendor-managed copies; individual skill packages define their own source rules.
- Committed: Selected project skills are committed; other agent runtime directories are ignored by `.gitignore`.

**`.convex/`:**
- Purpose: Local Convex deployment state and data.
- Generated: Yes, by local Convex tooling.
- Committed: No; ignored by `.gitignore` and potentially sensitive.

**`.vercel/`, `.output/`, `.tanstack/`:**
- Purpose: Local deployment links, Nitro/Vite build output, and TanStack build state.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

**`node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `output/`, `outputs/`:**
- Purpose: Installed dependencies, compiled output, coverage, test reports, and evidence artifacts.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`. Do not add product source to these directories.

**`infra/**/.terraform/` and Terraform state files:**
- Purpose: Local OpenTofu/Terraform provider caches and state.
- Generated: Yes.
- Committed: No; keep state and provider binaries out of source control and do not read/quote state as documentation.

**`.env*`:**
- Purpose: Local environment configuration; `.env.example` documents names only.
- Generated: No; supplied per environment.
- Committed: Real `.env*` files are ignored and must never be read or committed; only `.env.example` is tracked.

**`research/` and ignored `docs/`:**
- Purpose: Preserve supporting evidence and local working documents.
- Generated: Mixed.
- Committed: Selective; `PRODUCT.md`, `CONTEXT.md`, current source/tests, and committed `docs/adr/` take precedence over dated research and ignored documentation.

---

*Structure analysis: 2026-09-04*
