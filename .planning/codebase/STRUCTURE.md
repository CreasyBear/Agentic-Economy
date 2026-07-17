# Codebase Structure

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## Directory Layout

```text
Agentic-Economy/
|-- src/
|   |-- routes/                  # TanStack file routes: pages and HTTP endpoints
|   |-- modules/                 # Source-owned domain contracts and implementations
|   |-- components/              # Reusable React presentation and Astryx adapters
|   |-- views/                   # Larger page/view compositions
|   |-- lib/                     # Cross-cutting HTTP, server, UI, and operator adapters
|   |-- hooks/                   # Shared React hooks
|   |-- styles/                  # Global Tailwind/Astryx style entry point
|   |-- server/                  # Small server-only runtime helpers
|   `-- routeTree.gen.ts         # Generated TanStack route tree
|-- convex/                      # Durable application functions, workers, schema, auth
|   `-- _generated/              # Generated Convex bindings; never edit manually
|-- tests/                       # Unit, integration, boundary, copy, UI, and E2E suites
|-- tools/
|   |-- dev/                     # Local live-journey and development smoke runners
|   `-- release/                 # Hosted/readback/release verification
|-- eval/                        # Answer quality datasets, runners, and reports
|-- examples/                    # Provider, edge, directory, and agent integration proofs
|-- scripts/                     # Repository maintenance and analysis scripts
|-- public/                      # Static brand and image assets
|-- vendor/                      # Vendored protocol/kernel source
|-- docs/                        # Architecture and agent-facing documentation
|-- workflows/                   # Workflow assets
|-- .planning/                   # GSD plans, records, maps, audits, and graphs
|-- PRODUCT.md                   # Product thesis and current/target trust contract
|-- DESIGN.md                    # Visual/UI authority
|-- AGENTS.md                    # Always-on repository instructions
|-- package.json                 # Runtime dependencies and command surface
|-- vite.config.ts               # TanStack/Vite/Nitro/Vercel build configuration
|-- vitest.config.ts             # Vitest configuration
|-- playwright.config.ts         # Local Playwright configuration
`-- tsconfig.json                # Strict TypeScript and path aliases
```

## Directory Purposes

### `src/routes/`

- Purpose: Define every TanStack Start URL and HTTP entry point.
- Contains: Public `.tsx` pages, `_operator/` owner/admin pages, `api.*.ts` handlers, discovery text/XML routes, auth routes.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/api.v1.requests.ts`.
- Add route files here only for transport or page composition; move reusable policy and persistence calls to server adapters or domain modules.
- File names encode paths: dots become segments, `$name` is a path parameter, `[.]` emits a literal dot, and `_operator` is a pathless grouping route.

### `src/modules/`

- Purpose: Own product domains, contracts, policy, durable validators, and cross-surface actions.
- Contains: 30 domain directories plus `common/` and the central `actions/` registry.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/customer-request/public.ts`, `src/modules/registry/public.ts`.
- Domain directories generally use `public.ts` as the supported import surface, `internal/` for private implementation/schema, `*.actions.ts` for action declarations, and `*.functions.ts` for server-to-Convex adapters.
- The largest active domain is `src/modules/customer-request/`; extend it instead of creating a parallel request lifecycle.

### `src/modules/customer-request/`

- Purpose: Own the canonical Customer Request aggregate and the bounded route lifecycle around it.
- Contains: Compiler, interpreter, evaluation, options, preparation, customer projection, mandate, run/cancel, recovery, standing authority, agent contract, journey proof.
- Key files: `src/modules/customer-request/public.ts`, `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/customer-request.actions.ts`, `src/modules/customer-request/runtime.ts`.
- Internal validators and persistence shapes live in `src/modules/customer-request/internal/`.
- Legacy files are compatibility artifacts, not the preferred location for new behavior: `legacy-v1.ts`, `legacy-compiler-v1.ts`.

### `src/modules/routing-kernel/`

- Purpose: Own neutral routing, authorization, disclosure, budget, grant, envelope, and retirement contracts.
- Contains: Public HTTP/MCP-shaped adapters, runtime/application contracts, and private kernel/compiler/store logic.
- Key files: `src/modules/routing-kernel/contract.ts`, `src/modules/routing-kernel/application.ts`, `src/modules/routing-kernel/runtime.ts`, `src/modules/routing-kernel/internal/kernel.ts`.
- Keep provider-specific behavior out of this directory; put it in registered contracts or provider adapters.

### `src/modules/capability-*` and `src/modules/sandbox-supply/`

- Purpose: Represent registered capability definitions, admitted supply, bindings, readiness, and sandbox-only supply.
- Contains: Public contract seams, Convex schemas, transport runtime, sandbox workflow cohorts.
- Key files: `src/modules/capability-contract/public.ts`, `src/modules/capability-contract-registry/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/server.ts`, `src/modules/sandbox-supply/public.ts`.
- Keep sandbox types and claims explicitly scoped; sandbox supply does not establish useful real supply.

### `src/modules/registry/`, `catalog/`, `business/`, `discovery/`

- Purpose: Own business-supplied source data, publication, searchable projections, listing discovery, and machine-readable indexes.
- Contains: Public contracts, owner-claim application functions, search projections/adapters, discovery manifests and schemas.
- Key files: `src/modules/business/public.ts`, `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `src/modules/discovery/public.ts`.
- Add public business facts to their source-owning module, then deliberately project them into registry/discovery outputs.

### `src/modules/inquiries/`

- Purpose: Own the currently supported qualified-inquiry write and its owner/customer records.
- Contains: Public contracts/copy, action declarations, admission/policy/commands, Convex schema, readback functions.
- Key files: `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/public.ts`, `src/modules/inquiries/internal/admission.ts`, `src/modules/inquiries/inquiry.functions.ts`.
- Booking, charging, dispatch, or autonomous fulfilment does not belong in this action.

### `src/components/`

- Purpose: Hold reusable presentation used by routes/views.
- Contains: `ae/` legacy/domain compositions, `astryx/` framework integration adapters, `ai-elements/`, and animation helpers.
- Key files: `src/components/astryx/RouterLink.tsx`, `src/components/astryx/RouteProgressBar.tsx`, component groups under `src/components/ae/`.
- Use Astryx packages directly for new ordinary UI. Do not extend bespoke `Ae*` primitives or add shadcn/Radix/CVA layers.

### `src/lib/`

- Purpose: Host cross-cutting adapters that are not domain truth.
- Contains: `server/` HTTP/auth/Convex/provider adapters, `http/` response helpers, `observability/`, `operator/`, `ui/`, and development fixtures.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/http/discovery-response.ts`.
- If a helper encodes product meaning rather than transport/infrastructure behavior, move it to its owning module.

### `convex/`

- Purpose: Implement the durable application boundary and source state.
- Contains: Composed schema, domain-named public/internal functions, HTTP routes, auth configuration, crons, route workers, migration helpers.
- Key files: `convex/schema.ts`, `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/inquiries.ts`, `convex/http.ts`, `convex/authz.ts`.
- Files import validators and rules from `src/modules/*`; keep domain meaning source-owned instead of cloning it in Convex.
- Read `convex/_generated/ai/guidelines.md` before editing any Convex code.

### `tests/`

- Purpose: Verify behavior, architecture boundaries, public copy, intended surfaces, and deployment contracts.
- Contains: `unit/`, `integration/`, `imports/`, `types/`, `copy/`, `seo/`, `ui-contract/`, `ui/`, `e2e/`, `deploy-smoke/`, fixtures and helpers.
- Key files: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/customer-request-source-completeness.test.ts`, `tests/e2e/`.
- Co-locate a test in the narrowest appropriate suite; use deploy smoke only for hosted intended-surface proof.

### `tools/`

- Purpose: Run explicit development and release journeys against live surfaces.
- Contains: Local customer-request smoke/parity/problem tools in `tools/dev/`, hosted credential/readback/proof tools in `tools/release/`.
- Key files: `tools/dev/customer-request-development-smoke.ts`, `tools/dev/customer-request-development-surface-parity.ts`, `tools/release/customer-request-production-smoke.ts`.
- Capture machine-readable proof before summarizing long live runs.

### `examples/`

- Purpose: Demonstrate provider, routing edge, directory, bridge, and external-agent contracts.
- Contains: Standalone deployable or runnable proof packages and scripts.
- Key directories: `examples/routing-provider/`, `examples/routing-edge/`, `examples/routing-agent-directory/`, `examples/external-agent-contract-prototype/`.
- Treat examples as integration evidence only; do not cite their existence as production adoption or customer fulfilment.

### `.planning/`

- Purpose: Store derived codebase maps, plans, canonical project records, audits, graphs, and vision artifacts.
- Contains: `codebase/`, `records/`, `audits/`, `graphs/`, `wayfinder/`.
- Key files: `.planning/records/KNOWLEDGE-INDEX.md`, `.planning/records/PROJECT-RECORDS.md`, `.planning/records/README.md`.
- Planning files guide work but do not override `PRODUCT.md`, `DESIGN.md`, live source, tests, or intended-surface evidence.

## Key File Locations

### Entry Points

- `src/router.tsx`: TanStack router factory.
- `src/routes/__root.tsx`: Root HTML, providers, global feedback, and metadata.
- `src/routes/index.tsx`: Public home route.
- `src/routes/registry.tsx`: Human-readable registry.
- `src/routes/api.v1.requests.ts`: Authenticated agent Customer Request creation.
- `src/routes/api.requests.ts`: Browser Customer Request creation.
- `convex/http.ts`: Convex HTTP entry points.
- `convex/schema.ts`: Durable schema composition.

### Configuration

- `package.json`: Commands, dependency versions, and release gate composition.
- `vite.config.ts`: Vite, TanStack Start, Nitro/Vercel, Tailwind, Astryx SSR, and optional Sentry setup.
- `tsconfig.json`: Strict TypeScript settings and `@/`/`~/` aliases.
- `vitest.config.ts`: Test runner configuration.
- `playwright.config.ts`: Local browser-test configuration.
- `playwright.deploy-smoke.config.ts`: Hosted browser-smoke configuration.
- `convex/auth.config.ts`: Convex authentication configuration.
- `convex/convex.config.ts`: Convex component/application configuration.

### Product and Design Authority

- `PRODUCT.md`: Current evidenced state and target trust/product contract.
- `DESIGN.md`: Astryx-era visual and human-surface rules.
- `AGENTS.md`: Repository-wide implementation and claim boundaries.
- `UBIQUITOUS_LANGUAGE.md`: Shared domain terminology.

### Core Logic

- `src/modules/customer-request/`: Canonical Customer Request lifecycle.
- `src/modules/routing-kernel/`: Neutral route/authority kernel.
- `src/modules/capability-supply/`: Admitted routeable supply and transports.
- `src/modules/registry/`: Published searchable listing projection.
- `src/modules/inquiries/`: Qualified inquiry flow.
- `src/modules/actions/index.ts`: Cross-surface action registration.
- `convex/customerRequestApplication.ts`: Durable Customer Request application coordinator.

### Testing and Proof

- `tests/unit/`: Pure/domain unit tests.
- `tests/integration/`: Cross-module and Convex integration tests.
- `tests/imports/`: Architectural dependency guards.
- `tests/e2e/`: Local human-surface browser tests.
- `tests/deploy-smoke/`: Hosted intended-surface tests.
- `tools/dev/`: Local live journey runners.
- `tools/release/`: Hosted release/readback runners.
- `eval/answer/`: Answer quality evaluation system.

## Naming Conventions

### Files

- TanStack route: URL-encoded dot notation, e.g. `api.v1.requests.$requestRef.ts`.
- Domain public seam: `public.ts`.
- Private implementation: `internal/<concern>.ts`.
- Action declaration: `<module>.actions.ts`.
- Convex/server adapter: `<module>.functions.ts` or a concern-specific `*-api.ts`.
- React component: PascalCase file, commonly `AeCustomerRecord.tsx` for existing AE compositions.
- Test: `<behavior>.test.ts` for Vitest and `<journey>.spec.ts` for Playwright.
- Generated file: `*.gen.ts` or files beneath `_generated/`; never edit manually.

### Directories

- Domain directories use lowercase kebab-case: `customer-request/`, `capability-supply/`.
- Presentation groups use semantic lowercase names: `components/ae/customer-request/`, `components/ae/operator/`.
- Pathless route groups begin with underscore: `src/routes/_operator/`.
- Test directories classify proof type rather than product domain: `unit/`, `integration/`, `imports/`, `deploy-smoke/`.

## Where to Add New Code

### New Domain Behavior

- Primary code: `src/modules/<owning-domain>/`.
- Stable public export: `src/modules/<owning-domain>/public.ts`.
- Private helpers/validators: `src/modules/<owning-domain>/internal/`.
- Durable application function: `convex/<owningDomain>.ts` or the existing domain-named Convex file.
- Tests: `tests/unit/<domain>-*.test.ts` or `tests/integration/<domain>-*.test.ts`.
- Do not create a new module until no existing domain owns the concept.

### New Cross-Surface Operation

- Declaration: `src/modules/<domain>/<domain>.actions.ts`.
- Registration: `src/modules/actions/index.ts`.
- Implementation: Reuse the same source-owned function used by UI/HTTP.
- Surface adapter: Relevant route or tool projection only after the action declares that surface.
- Tests: Unit contract test plus route/surface test for every exposed surface.

### New Human Page

- Route composition: `src/routes/<encoded-path>.tsx`.
- Reusable page/view composition: `src/views/` or the appropriate `src/components/ae/<area>/` while legacy compositions remain.
- UI primitives: Import from `@astryxdesign/core`; add only integration adapters to `src/components/astryx/`.
- Styles: Use Astryx props/tokens and Tailwind layout glue; avoid a new CSS file.
- Tests: `tests/ui/`, `tests/ui-contract/`, and `tests/e2e/` according to risk.

### New HTTP Endpoint

- Route: `src/routes/api.<segments>.ts`.
- Request/auth/response adapter: `src/lib/server/<concern>-api.ts`.
- Product behavior: `src/modules/<domain>/`.
- Durable operation: Existing domain file under `convex/`.
- Tests: Unit test for parsing/refusals, integration test for durable behavior, intended-surface test where reachability matters.

### New Convex Table or Function

- Domain validators/table fragment: `src/modules/<domain>/internal/convex-schema.ts` or existing domain schema file.
- Schema composition: `convex/schema.ts`.
- Query/mutation/action: Existing domain-named file in `convex/`.
- Client/server reference: `src/modules/<domain>/*.functions.ts` or `src/lib/server/` transport adapter.
- Tests: `tests/integration/` or a focused `convex/*.test.ts` when transaction behavior is central.

### New Provider Integration

- Provider adapter: `src/modules/provider-integrations/<provider-or-capability>/` or an existing domain-owned provider port.
- Generic contract: Owning module public contract, not provider-specific branching in the compiler/kernel.
- Webhook boundary: `src/routes/api.notification.*.ts` or a clearly named route plus `src/lib/server/` signature/body adapter.
- Readiness proof: `examples/` or `tools/release/` with exact environment and claim boundaries.

### New Shared Helper

- Domain-neutral value/digest/id helper: `src/modules/common/`.
- HTTP/server infrastructure helper: `src/lib/server/` or `src/lib/http/`.
- React hook: `src/hooks/`.
- UI integration adapter: `src/components/astryx/`.
- Do not move domain meaning into a generic utility merely because multiple files use it.

### New Research or Decision Record

- Orientation: `.planning/records/KNOWLEDGE-INDEX.md`.
- Research instructions: `.planning/records/README.md`.
- Research document: Use `.planning/records/RESEARCH-RECORD-TEMPLATE.md` and update the source register/queue.
- Material contract/authority/neutrality decision: Add or supersede an ADR under the established records structure.
- Decision ledger: Update `.planning/records/PROJECT-RECORDS.md`; do not create a competing ledger.

## Special Directories

### `src/routeTree.gen.ts`

- Purpose: Generated route registration for TanStack Router.
- Generated: Yes.
- Committed: Yes.
- Rule: Regenerate through TanStack tooling; never patch manually.

### `convex/_generated/`

- Purpose: Generated Convex API, data-model, and server bindings.
- Generated: Yes.
- Committed: Yes.
- Rule: Run Convex codegen; do not hand-edit.

### `src/future-phases/`

- Purpose: Isolated target/future implementation material excluded from the active TypeScript build.
- Generated: No.
- Committed: Yes.
- Rule: Do not treat code here as current runtime behavior or import it into active source without an explicit migration.

### `src/components/ae/`

- Purpose: Existing AE behavioral and presentation compositions during Astryx migration.
- Generated: No.
- Committed: Yes.
- Rule: Re-skin existing behavior onto Astryx; do not add or extend bespoke presentation primitives.

### `graphify-out/`, `output/`, `outputs/`, `playwright-report/`, `test-results/`

- Purpose: Generated analysis, evaluation, test, and browser artifacts.
- Generated: Yes.
- Committed: Mixed; verify Git status before changing or relying on an artifact.
- Rule: Use artifacts as evidence only when their producing command, date, environment, and result are known.

### `.planning/codebase/`

- Purpose: Generated full-repository reference maps consumed by GSD planning/execution.
- Generated: Yes.
- Committed: Repository-dependent; verify Git status.
- Rule: Refresh from live source and configuration; do not treat an older map as authority over implementation.

### `vendor/`

- Purpose: Vendored protocol/kernel material used for local compatibility and reference.
- Generated: No.
- Committed: Yes.
- Rule: Keep local changes deliberate and distinguish vendored contracts from AE-owned domain behavior.

### `.agents/skills/`

- Purpose: Project-specific execution guidance for AE architecture, surfaces, Convex, design, verification, research, and workflows.
- Generated: No.
- Committed: Yes.
- Rule: Read the applicable `SKILL.md` before performing matching work; load linked rules only as needed.

---

*Structure analysis: 2026-07-17*
