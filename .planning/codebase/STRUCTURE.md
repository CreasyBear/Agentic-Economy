# Codebase Structure

**Analysis Date:** 2026-07-14

## Directory Layout

```text
Agentic-Economy/
├── .agents/                 # Repo-local skills and operating guidance
├── .github/workflows/       # CI and hosted verification automation
├── .planning/               # Derived plans, maps, research, and graph reports
├── convex/                  # Durable backend, schema, functions, effects, cron
├── docs/                    # Maintainer-facing architecture and agent docs
├── eval/                    # Answer-quality cases and evaluation support
├── examples/                # Non-authoritative integrations and prototypes
├── public/                  # Static assets
├── scripts/                 # Verification, seeding, and operational scripts
├── src/
│   ├── components/          # React presentation
│   ├── hooks/               # Reusable browser hooks
│   ├── lib/                 # Server, UI, HTTP, and observability adapters
│   ├── modules/             # Source-owned bounded contexts
│   ├── routes/              # TanStack file routes and HTTP endpoints
│   ├── styles/              # Global/tokens plus isolated legacy styles
│   ├── router.tsx           # Router construction
│   └── start.ts             # Start middleware composition
├── tests/                   # Unit, integration, import, copy, UI, and E2E tests
├── tools/                   # Release and repository tooling
├── vendor/                  # Vendored compatibility/reference material
├── AGENTS.md                # Always-on repository instructions
├── DESIGN.md                # Visual and UI authority
├── PRODUCT.md               # Product thesis, maturity, and trust authority
└── package.json             # Commands and dependency manifest
```

## Directory Purposes

**`src/routes/`:**
- Purpose: Own browser and HTTP entrypoints only.
- Contains: TanStack route components, API handlers, discovery files, and owner/operator routes.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/engine.tsx`, `src/routes/registry.tsx`, `src/routes/api.requests.ts`, `src/routes/api.v1.requests.ts`.

**`src/components/`:**
- Purpose: Render product projections using Astryx-first presentation.
- Contains: AE customer, registry, inquiry, chat, feedback, layout, and operator components; Astryx router adapters; AI display elements.
- Key files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`.

**`src/lib/server/`:**
- Purpose: Adapt web requests to authenticated/public application calls.
- Contains: Bounded request parsing, Convex clients, Request API mappings, source-write admission, auth, notifications, and SSE helpers.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/customer-request-api.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/lib/server/bounded-request-body.ts`.

**`src/modules/`:**
- Purpose: Own domain language, deterministic rules, stable interfaces, and module-private implementation.
- Contains: `public.ts` façades, `internal/` folders, actions, functions, schemas, projections, policies, and provider adapters.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/customer-request/public.ts`, `src/modules/capability-contract/public.ts`.

**`convex/`:**
- Purpose: Own durable source state, transactions, scheduled work, and external effects.
- Contains: Convex queries/mutations/actions, schema composition, HTTP retirement routes, crons, auth, and generated bindings.
- Key files: `convex/schema.ts`, `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/capabilitySupply.ts`, `convex/inquiries.ts`, `convex/http.ts`.

**`tests/`:**
- Purpose: Prove domain behavior, route contracts, architectural boundaries, copy, UI contracts, and browser journeys.
- Contains: `unit/`, `integration/`, `imports/`, `copy/`, `types/`, `ui-contract/`, `e2e/`, `deploy-smoke/`, and fixtures/helpers.
- Key files: `tests/imports/private-imports.test.ts`, `tests/ui-contract/`, `tests/unit/customer-request/`.

**`.planning/`:**
- Purpose: Hold derived execution artifacts and repository maps.
- Contains: Codebase maps, plans, audits, research, ADRs, manifests, and generated graph reports.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/REACT-DOCTOR-AUDIT.md`.

## Key File Locations

**Entry Points:**
- `src/router.tsx`: Constructs the TanStack router from `src/routeTree.gen.ts`.
- `src/start.ts`: Composes middleware and Start request handling.
- `src/routes/__root.tsx`: Owns the document shell, Astryx providers, and selective Clerk client provider.
- `convex/schema.ts`: Composes domain-owned table fragments.
- `convex/http.ts`: Returns explicit retirement responses for routing-v1 and `/mcp` paths.

**Configuration:**
- `package.json`: Scripts, package manager expectations, and dependencies.
- `vite.config.ts`: Vite/TanStack build configuration.
- `tsconfig.json`: TypeScript project configuration and aliases.
- `vitest.config.ts`: Unit/integration test configuration.
- `playwright.config.ts`: Browser test projects and server configuration.
- `convex/auth.config.ts`: Convex Clerk JWT configuration.
- `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`: Repository, product, and visual authorities.

**Core Logic:**
- `src/modules/customer-request/`: Canonical Request compilation and lifecycle rules.
- `src/modules/capability-contract/`: Neutral capability grammar.
- `src/modules/capability-supply/`: Registered offerings, bindings, publication, and readiness.
- `src/modules/registry/`: Public discovery projections and registered actions.
- `src/modules/inquiries/`: Qualified inquiry admission and evidence.
- `convex/customerRequestApplication.ts`: Request command orchestration.
- `convex/capabilitySupply.ts`: Durable supply graph and eligibility.

**Testing:**
- `tests/unit/<domain>/`: Domain and component unit tests.
- `tests/integration/`: Cross-module and API contracts.
- `tests/imports/`: Layering, private-import, and dependency guards.
- `tests/ui-contract/`: Astryx, presentation, and public-copy source scans.
- `tests/e2e/`: Playwright customer/owner/operator journeys.
- `tests/deploy-smoke/`: Hosted dependency and release readback checks.

## Module Map

**Customer intent and decision:**
- `src/modules/customer-request/`: Canonical Request, RoutePlan compilation/projection, preparation, approval material, attempts, execution, and reconciliation rules.
- `src/modules/answer-thread/`: Legacy conversational retrieval and thread persistence; do not add a parallel customer compiler or recovery domain.
- `src/modules/answer/`: Structured answer synthesis and catalog-grounded artifacts.

**Supply and discovery:**
- `src/modules/business/`: Business identity, visibility, claims, and publication status.
- `src/modules/catalog/`: Catalog and owner-publication flow.
- `src/modules/registry/`: Bounded public business discovery.
- `src/modules/capability-contract/`: Provider-neutral contract grammar.
- `src/modules/capability-contract-registry/`: Immutable exact contract registration.
- `src/modules/capability-supply/`: Offering/binding/publication/readiness state and adapter admission.
- `src/modules/provider-integrations/`: Domain/provider-specific adapters outside the neutral engine.

**Actions and authority:**
- `src/modules/actions/`: Central action registry.
- `src/modules/common/`: Shared IDs, canonical hashing, results, and action types.
- `src/modules/inquiries/`: Qualified inquiry and governed-send work.
- `src/modules/governed-action/`: Strict canonical governed-action material.
- `src/modules/harness/`: Tool descriptors, quiet-door allowlist, policy, and run evidence.
- `src/modules/security/`: Admin authority, source-write admission, disputes, and security readback.

**Platform support:**
- `src/modules/discovery/`: `llms.txt`, skill, examples, and manifest source state.
- `src/modules/observability/`: Funnel and audit event source ownership.
- `src/modules/notification-outbox/`: Durable delivery work and state.
- `src/modules/network-guard/`: Bounded external-network policy.
- `src/modules/seo/`: Public structured data and route metadata.
- `src/modules/settings/`, `src/modules/storefront/`, `src/modules/demand/`: Owner/application operations registered on explicit surfaces.

**Retired or support-only:**
- `src/modules/routing-kernel/`: Retained kernel/history types; its Convex HTTP routes are explicitly retired in `convex/http.ts`.
- `src/modules/routing-tracer/`, `src/modules/sandbox-supply/`, `src/modules/dev/`: Diagnostic, sandbox, and development support; do not use as production customer evidence.
- `src/future-phases/`: Inert future-phase helpers; never runtime authority.

## Naming Conventions

**Files:**
- `PascalCase.tsx`: React components, for example `AeCustomerRequestWorkspace.tsx`.
- `kebab-case.ts`: Domain utilities and contracts, for example `stable-hash.ts`.
- `camelCase.ts`: Convex function modules, for example `customerRequestApplication.ts`.
- `<module>.actions.ts`: Reusable operation declarations.
- `<module>.functions.ts`: Application/server-function adapters.
- `public.ts`: Supported module façade.
- `internal/`: Private implementation and schema fragments.
- `*.test.ts(x)`: Vitest tests; `*.spec.ts`: primarily Playwright/browser tests.
- TanStack dots encode nesting, `$name` encodes dynamic segments, and `[.]` escapes literal dots.

**Directories:**
- Domain directories use lowercase kebab-case, for example `customer-request/`.
- React presentation is grouped by surface/concern under `src/components/ae/`.
- Tests mirror domain ownership under `tests/unit/` and use explicit cross-cutting suites elsewhere.

## Where to Add New Code

**New domain behavior:**
- Primary code: `src/modules/<domain>/public.ts` plus `src/modules/<domain>/internal/`.
- Durable state/effects: a module-owned schema fragment and `convex/<domain>.ts`.
- Tests: `tests/unit/<domain>/` and an integration/import test when a boundary changes.

**New operation:**
- Definition: `src/modules/<domain>/<domain>.actions.ts`.
- Registration: `src/modules/actions/index.ts`.
- Adapter: `src/modules/<domain>/<domain>.functions.ts` or a thin `src/lib/server/` adapter.
- Public assistant exposure: update the explicit quiet-door allowlist only after authority, idempotency, failure, and refusal behavior is proven.

**New Customer Request behavior:**
- Domain contract/transitions: `src/modules/customer-request/`.
- Durable orchestration: `convex/customerRequestApplication.ts` or the exact `convex/customerRequestV2*.ts` owner.
- Human HTTP adapter: `src/lib/server/customer-request-*.ts` and `src/routes/api.requests*.ts`.
- External-agent adapter: `src/lib/server/customer-request-agent-api.ts` and `src/routes/api.v1.requests*.ts`.
- UI projection: extend the canonical projection first, then render it from the customer surface; do not add semantics to Answer Thread.

**New provider/domain integration:**
- Adapter code: `src/modules/provider-integrations/<provider-or-domain>/`.
- Registration data: exact contract, offering, binding, publication, credentials, and readiness paths.
- Neutral engine changes: not required for a conformant integration.

**New component:**
- Implementation: the relevant `src/components/ae/<surface>/` directory.
- Primitives: use `@astryxdesign/core` and `@astryxdesign/theme-neutral`; add only thin router/runtime adapters under `src/components/astryx/`.
- Tests: `tests/unit/` plus `tests/ui-contract/` when presentation rules change.

**Utilities:**
- Shared domain-neutral values: `src/modules/common/`.
- Server-only helpers: `src/lib/server/`.
- UI-only formatting/projection helpers: `src/lib/ui/`.
- Avoid generic helper extraction when the concept belongs to one bounded context.

## Structural Rules

- Import another domain through its `public.ts`; never import its `internal/` implementation.
- Add tables to the owning module schema fragment and compose them in `convex/schema.ts`; do not define domain tables inline there.
- Keep routes thin, request bodies bounded, and domain transitions deterministic.
- Preserve exact revision, command-key, digest, authority, and uncertain-outcome semantics.
- Keep provider-specific vocabulary in registered contracts or `provider-integrations/`.
- Treat generated `src/routeTree.gen.ts` and `convex/_generated/` as generated output, not hand-edited source.
- Treat `.planning/`, tests, examples, scripts, and sandbox files as evidence/support, not customer product authority.
- Inspect `git status` and `git diff` before editing in the shared dirty tree; preserve unrelated ownership.

## Special Directories

**`convex/_generated/`:**
- Purpose: Generated Convex client/server bindings and AI guidance.
- Generated: Yes, except the checked-in guidance/state material supplied by Convex tooling.
- Committed: Yes.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route graph.
- Generated: Yes.
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: Current derived codebase map consumed by GSD planning/execution.
- Generated: Yes, by the mapping workflow.
- Committed: Yes for Markdown maps; graph JSON/directories remain ignored.

**`.planning/graphs/` and `graphify-out/`:**
- Purpose: Generated graph reports, caches, and machine artifacts.
- Generated: Yes.
- Committed: Only the selected Markdown report may be tracked; graph directories and JSON are ignored.

**`examples/`, `eval/`, `scripts/`, `tools/`:**
- Purpose: Proof, evaluation, operational, and release support.
- Generated: No, except their produced outputs.
- Committed: Source files yes; outputs follow ignore policy.

---

*Structure analysis: 2026-07-14*
