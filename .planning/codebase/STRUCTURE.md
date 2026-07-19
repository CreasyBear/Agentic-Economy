# Codebase Structure

**Analysis Date:** 2026-07-19
**last_mapped_commit:** `77ec35ac`

## Directory Layout

```text
Agentic-Economy/
├── src/
│   ├── start.ts                 # TanStack Start middleware bootstrap
│   ├── router.tsx               # React Router construction
│   ├── routeTree.gen.ts         # Generated file-route tree
│   ├── routes/                  # Human pages and HTTP/API adapters
│   ├── components/              # Astryx adapters and current React UI
│   ├── views/                   # Page-level view composition
│   ├── modules/                 # Domain contracts, orchestration and schemas
│   ├── lib/                     # Cross-cutting HTTP/server/UI infrastructure
│   ├── hooks/                   # Shared React hooks
│   ├── styles/                  # Global Tailwind/theme CSS
│   └── future-phases/           # Deferred, non-current surface inventory
├── convex/
│   ├── schema.ts                # Composed database schema
│   ├── http.ts                  # Direct Convex HTTP endpoints
│   ├── crons.ts                 # Scheduled cleanup registration
│   ├── *Ports.ts                # Domain-to-Convex adapters
│   ├── customerRequest*.ts      # Request hosts/workers
│   └── _generated/              # Convex-generated API/data types
├── tests/                       # Unit, integration, import, copy, UI and E2E proof
├── eval/                        # Answer and product-foundry eval suites
├── examples/                    # Routing/provider/agent prototypes and smoke runners
├── tools/                       # Development and release verification tools
├── scripts/                     # Repository utility scripts
├── public/                      # Static brand/images assets
├── docs/                        # Architecture and agent-facing documentation
├── workflows/                   # Workflow definitions
├── vendor/                      # Vendored reference artifacts
├── .agents/skills/              # Project-specific execution guidance
├── .planning/                   # ADRs, records, specs, maps and phase artifacts
├── package.json                 # Dependencies and executable verification ladder
├── vite.config.ts               # Vite/TanStack/Nitro/Vercel configuration
├── tsconfig.json                # Strict TypeScript and path aliases
├── PRODUCT.md                   # Product/current-vs-target authority
├── DESIGN.md                    # Visual authority
└── AGENTS.md                    # Always-on repository operating rules
```

## Directory Purposes

**`src/routes/`:**
- Purpose: File-based browser routes and HTTP endpoints.
- Contains: 93 `createFileRoute` files plus the root route.
- Key files: `__root.tsx`, `index.tsx`, `registry.tsx`, `api.v1.requests.ts`, `api.answer.turn.ts`, `llms[.]txt.ts`.
- Structure: Public routes at root; owner/admin/developer pages under `_operator/`; dynamic URL parameters use `$name`.

**`src/routes/_operator/`:**
- Purpose: Protected owner, admin and developer operations.
- Contains: Inquiry inbox/thread, claims, audit, run viewer, request-problem and settings pages.
- Key files: `owner.inquiries.tsx`, `owner.inquiries.$threadId.tsx`, `admin.runs.tsx`, `admin.request-problems.tsx`.

**`src/modules/`:**
- Purpose: Primary business/domain ownership boundary.
- Contains: Approximately 30 top-level modules and more than 500 source files.
- Key files: each module’s `public.ts`, `<domain>.actions.ts`, `<domain>.functions.ts`, and `internal/`.
- Largest packages: `customer-request/`, `capability-supply/`, `answer-thread/`, `routing-kernel/`, `inquiries/`, `answer/`.

**`src/modules/customer-request/`:**
- Purpose: Canonical customer request, comparison, authority, execution and recovery model.
- Contains: Public contract, compiler/interpreter, projections, actions/functions, application slices, route execution, mandates, V2 read/write/preparation and journey evidence.
- Key files: `public.ts`, `agent-contract.ts`, `customer-request.actions.ts`, `customer-request.functions.ts`, `application/public.ts`, `compiler.ts`, `runtime.ts`.

**`src/modules/customer-request/application/`:**
- Purpose: Use-case orchestration over injected ports.
- Contains: `interpret-compile/`, `provide-facts/`, `refine/`, `compare-resume/`, `confirm-route/`, `authorize-preparation/`, `preparation-egress/`, `route-plan-projection/`, `standing-route/`, `problem-route/`.
- Key files: `public.ts` and each slice’s `index.ts`/`types.ts`.

**`src/modules/customer-request/route-execution/`:**
- Purpose: Deterministic execution journal, machines, problem support and evidence loading.
- Contains: `journal/`, `machines/`, `problem-support/`, `evidence-load/`.
- Key files: `machines/index.ts`, `machines/ports.ts`, `journal/index.ts`.

**`src/modules/capability-supply/`:**
- Purpose: Determine whether registered contracts are admitted, eligible, published and ready for routing.
- Contains: Public seam plus internal admission, eligibility, graph, publication, readiness and writer packages.
- Key files: `public.ts`, `internal/convex-schema.ts`.

**`src/modules/registry/` and `src/modules/catalog/`:**
- Purpose: Public discovery projections and owner-controlled catalog publication.
- Contains: Search adapters, projection synchronization, catalog validation, publishing and claim flows.
- Key files: `registry/public.ts`, `registry/registry.functions.ts`, `registry/registry.actions.ts`, `catalog/public.ts`, `catalog/owner-claim.functions.ts`.

**`src/modules/inquiries/`:**
- Purpose: Qualified inquiry submission, admission, privacy, delivery and owner/customer readbacks.
- Contains: Actions/functions, governed send, notification ports, projections, ledger and local E2E adapter.
- Key files: `inquiry.actions.ts`, `inquiry.functions.ts`, `public.ts`, `internal/commands.ts`.

**`src/modules/answer/`, `answer-thread/`, `harness/`:**
- Purpose: Answer generation, tool execution policy and durable conversation/run state.
- Contains: Model adapters, run loop, tool contracts, approvals, tool runner and thread source adapters.
- Key files: `harness/tool-contract.ts`, `harness/action-tool.ts`, `answer-thread/answer-thread.functions.ts`.

**`src/modules/notification-outbox/`:**
- Purpose: Provider-neutral durable notification lifecycle.
- Contains: Internal commands/schema/source-state ports and operator parsing/projection.
- Key files: `public.ts`, `internal/commands.ts`, `operator/index.ts`.

**`src/modules/common/`:**
- Purpose: Cross-domain primitives that have earned shared ownership.
- Contains: IDs, stable/canonical digests, result types, action contracts and audit events.
- Key files: `action.ts`, `ids.ts`, `stable-hash.ts`, `canonical-digest.ts`, `result.ts`.

**`src/lib/server/`:**
- Purpose: HTTP/API handlers, Convex transport, auth/session gates and middleware helpers.
- Contains: Customer Request route adapters, source transport, owner session checks, source-write admission and local E2E bypass.
- Key files: `convex-source.ts`, `customer-request-agent-api.ts`, `customer-request-api.ts`, `source-write-admission.ts`.

**`src/lib/http/`:**
- Purpose: Shared HTTP security, caching and response policies.
- Contains: Security headers and API response helpers.
- Key files: `security-headers.ts`.

**`src/components/`:**
- Purpose: React UI implementation.
- Contains: `astryx/` product adapters, `ae/` current behavioral/product components, `ai-elements/`, `animate/`.
- Key files: `astryx/RouterLink.tsx`, `astryx/RouteProgressBar.tsx`; page-specific elements under `ae/`.
- Constraint: Use Astryx primitives first; do not extend bespoke presentation systems.

**`src/views/`:**
- Purpose: Route-independent page composition.
- Contains: Public, owner/admin and customer-request views consumed by file routes.
- Key files: inspect the matching view imported by the route being changed.

**`convex/`:**
- Purpose: Convex function registration, validators, persistence adapters, workers and schema composition.
- Contains: Roughly 70 host files, including many focused `*Ports.ts` adapters.
- Key files: `schema.ts`, `customerRequestApplication.ts`, `customerRequestRouteExecution.ts`, `customerRequestV2.ts`, `registry.ts`, `inquiries.ts`, `notificationOutbox.ts`, `crons.ts`, `http.ts`.

**`tests/`:**
- Purpose: Executable contract and regression evidence.
- Contains: `unit/`, `integration/`, `types/`, `imports/`, `copy/`, `seo/`, `ui-contract/`, `e2e/`, `deploy-smoke/`, `eval/`.
- Key files: `imports/private-imports.test.ts`, `imports/route-boundary.test.ts`, `imports/customer-request-boundaries.test.ts`, `unit/schema/convex-schema.test.ts`.

**`eval/`:**
- Purpose: Evaluation loops distinct from deterministic tests.
- Contains: `answer/` case suites/scorers/report runners and `product-foundry/` portfolio/case readouts.
- Key files: `answer/README.md`, `answer/lib/suite.ts`, `product-foundry/README.md`.

**`examples/`:**
- Purpose: Isolated routing/provider/agent demonstrations and hosted proof runners.
- Contains: `routing-provider/`, `routing-edge/`, `routing-agent-bridge/`, `routing-agent-directory/`, `agent-experience/`.
- Key files: `routing-provider/run-hosted-tracer.mjs`, `routing-provider/api/capability.mjs`.

**`.planning/`:**
- Purpose: Derived planning evidence and decision records.
- Contains: `adr/`, `records/`, `specs/`, `phases/`, `codebase/`, `graphs/`, `wayfinder/`.
- Key files: `records/KNOWLEDGE-INDEX.md`, `records/PROJECT-RECORDS.md`, `codebase/*.md`.
- Constraint: Planning content guides work but does not override live source, `PRODUCT.md`, `DESIGN.md` or executable evidence.

## Key File Locations

**Entry Points:**
- `src/start.ts`: Global request middleware.
- `src/router.tsx`: Runtime router factory.
- `src/routes/__root.tsx`: Root document/providers/theme.
- `src/routes/index.tsx`: Public home route.
- `src/routes/registry.tsx`: Public registry.
- `src/routes/api.v1.requests.ts`: External-agent Request creation.
- `src/routes/api.answer.turn.ts`: Answer loop HTTP entry.
- `convex/customerRequestApplication.ts`: Customer Request public action host.
- `convex/http.ts`: Direct Convex HTTP router.

**Configuration:**
- `package.json`: Scripts, dependencies and package-manager declaration.
- `vite.config.ts`: TanStack Start, Nitro/Vercel, Tailwind and Sentry plugins.
- `tsconfig.json`: Strict compiler rules and `@/*`/`~/*` aliases.
- `vitest.config.ts`: Unit/integration test configuration.
- `playwright.config.ts`: Browser/E2E configuration.
- `convex/convex.config.ts`: Convex application configuration.
- `convex/auth.config.ts`: Clerk JWT provider.
- `convex/schema.ts`: Table composition.

**Core Logic:**
- `src/modules/customer-request/application/`: Request use cases.
- `src/modules/customer-request/route-execution/`: Execution/recovery decisions.
- `src/modules/customer-request/v2-write/`: Aggregate write machines.
- `src/modules/customer-request/route-mandate.ts`: Bounded route authority contract.
- `src/modules/capability-supply/`: Routeable supply rules.
- `src/modules/inquiries/internal/commands.ts`: Inquiry state changes.
- `src/modules/notification-outbox/internal/commands.ts`: Notification lifecycle.
- `src/modules/actions/index.ts`: Registered reusable operations.

**Convex Adapters:**
- `convex/customerRequestProvideFactsPorts.ts`: Provide-facts application ports.
- `convex/customerRequestCompareResumePorts.ts`: Compare/resume ports.
- `convex/customerRequestConfirmRoutePorts.ts`: Confirmation ports.
- `convex/customerRequestRouteExecutionJournalPorts.ts`: Start/lease/outcome persistence.
- `convex/customerRequestRouteExecutionCancelPorts.ts`: Cancellation persistence.
- `convex/customerRequestRouteExecutionProblemPorts.ts`: Problem/support persistence.
- `convex/customerRequestRouteExecutionDispatchPorts.ts`: Dispatch lifecycle persistence.
- `convex/customerRequestV2WritePorts.ts`: Request aggregate/generation writes.
- `convex/inquirySourceStatePorts.ts`: Inquiry source-state adapter.
- `convex/notificationOutboxSourceStatePorts.ts`: Outbox source-state adapter.

**Testing:**
- `tests/unit/<domain>/`: Coarse domain ownership for unit tests.
- `tests/integration/`: Cross-module/Convex-backed behavior.
- `tests/imports/`: Architectural import and retirement contracts.
- `tests/types/`: Compile-time contract checks.
- `tests/copy/`: Public claim/vocabulary checks.
- `tests/ui-contract/`: Design-system and UI architecture rules.
- `tests/e2e/`: Local browser flows and accessibility.
- `tests/deploy-smoke/`: Hosted intended-surface verification.

**Authority Documents:**
- `PRODUCT.md`: Product thesis, current evidence and target contract.
- `DESIGN.md`: Visual/UI source of truth.
- `AGENTS.md`: Repository safety and claim boundaries.
- `UBIQUITOUS_LANGUAGE.md`: Domain vocabulary.
- `.planning/records/README.md`: Research/record workflow.

## Naming Conventions

**Files:**
- Domain directories use kebab-case: `customer-request/`, `capability-supply/`, `notification-outbox/`.
- Public module barrel is `public.ts`: `src/modules/registry/public.ts`.
- Private implementation goes under `internal/`: `src/modules/inquiries/internal/commands.ts`.
- Reusable actions use `<domain>.actions.ts`: `src/modules/customer-request/customer-request.actions.ts`.
- TanStack server functions use `<domain>.functions.ts`: `src/modules/registry/registry.functions.ts`.
- Module schema fragments use `internal/schema.ts` or `internal/convex-schema.ts`.
- Customer Request application slices and machine files use kebab-case verbs: `compare-resume/`, `start-or-resume.ts`.
- Convex hosts/adapters use camelCase filenames: `customerRequestApplication.ts`, `customerRequestV2WritePorts.ts`.
- File routes mirror URL shape with dots; dynamic segments use `$`: `api.v1.requests.$requestRef.run.ts`.
- Literal-dot route filenames escape dots with brackets: `llms[.]txt.ts`, `robots[.]txt.ts`, `SKILL[.]md.ts`.
- React components use PascalCase: `RouterLink.tsx`, `AeObservabilityErrorBoundary.tsx`.
- Tests use `.test.ts`/`.test.tsx`; Playwright specs use `.spec.ts`.

**Directories:**
- Domain modules: kebab-case.
- Application use-case slices: kebab-case.
- React component domains: lowercase/kebab-case under `src/components/ae/`.
- Protected route grouping: `_operator/`.
- Generated output: `_generated/` or `.gen.ts`.

**Symbols:**
- Server-call adapters end in `ThroughSource`: `confirmCustomerRequestThroughSource`.
- TanStack server functions end in `Server`: `submitPublicInquiryServer`.
- Convex port factories end in `Ports`: `journalMutationPorts(ctx)`.
- Machine imports may be aliased with `Machine`: `startOrResume as startOrResumeMachine`.
- Zod schemas end in `Schema`; Convex validators commonly end in `Value` or describe the validated object.
- Discriminated results use a `kind` field and literal reason codes.

## Where to Add New Code

**New Feature:**
- Primary code: add to the owning domain under `src/modules/<domain>/`.
- HTTP adapter: `src/lib/server/<feature>-api.ts` when parsing/auth/response logic is non-trivial.
- Route: `src/routes/<url-shape>.ts` or `.tsx`.
- Tests: `tests/unit/<domain>/`; add `tests/integration/` or `tests/e2e/` only for the cross-boundary proof required.

**New Public Operation:**
- Contract: `src/modules/<domain>/<domain>.actions.ts`.
- Source binding: `src/modules/<domain>/<domain>.functions.ts`.
- Registration: explicit import and array entry in `src/modules/actions/index.ts`.
- Answer-model exposure: update `src/modules/harness/tool-contract.ts` only when intentionally granting that internal surface.
- Tests: `tests/unit/actions/` and domain tests.

**New Customer Request Use Case:**
- Application orchestration: `src/modules/customer-request/application/<use-case>/`.
- Public export: `src/modules/customer-request/application/public.ts`.
- Port interface: slice-local `types.ts`.
- Convex implementation: `convex/customerRequest<UseCase>Ports.ts`.
- Registered action/host: thin addition to `convex/customerRequestApplication.ts`.
- API route: reuse `src/lib/server/customer-request-agent-api.ts` and `src/routes/api.v1.requests.$requestRef.*.ts`.

**New Route Execution Transition:**
- Pure decision/machine: `src/modules/customer-request/route-execution/machines/<verb>.ts`.
- Port family: extend the matching `ports.ts`, `cancel-ports.ts`, `problem-ports.ts` or `dispatch-lifecycle-ports.ts`; create a focused family if responsibility differs.
- Convex adapter: matching `convex/customerRequestRouteExecution<Family>Ports.ts`.
- Host shell: `convex/customerRequestRouteExecution.ts`.
- Tests: `tests/unit/customer-request/route-execution/` plus integration proof for the transaction/recovery path.

**New Customer Request Aggregate Write:**
- Machine: `src/modules/customer-request/v2-write/<verb>.ts`.
- Port contract: `src/modules/customer-request/v2-write/ports.ts`.
- Adapter: `convex/customerRequestV2WritePorts.ts`.
- Host: thin export in `convex/customerRequestV2.ts`.

**New Convex Table:**
- Schema fragment: owning module’s `src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`.
- Composition: spread the exported table fragment in `convex/schema.ts`.
- Access: implement through the owning Convex host/port adapter.
- Test: update `tests/unit/schema/convex-schema.test.ts`.

**New UI Page or Component:**
- Read `DESIGN.md`.
- Route: `src/routes/`; view composition: `src/views/`.
- Reusable primitive/adaptation: `src/components/astryx/`.
- Domain behavior component: matching directory under `src/components/ae/`.
- Tests: `tests/ui/` or `tests/ui-contract/`; browser proof under `tests/e2e/` when required.

**Utilities:**
- Shared domain IDs, digests and results: `src/modules/common/`.
- Cross-cutting server infrastructure: `src/lib/server/`.
- HTTP-only policies: `src/lib/http/`.
- Keep domain orchestration out of `src/lib/`.

**New Evaluation:**
- Deterministic regression: `tests/unit/` or `tests/integration/`.
- Answer quality/case evaluation: `eval/answer/`.
- Product workflow/case portfolio: `eval/product-foundry/`.
- Hosted intended-surface proof: `tests/deploy-smoke/` or an existing runner under `tools/release/`.

## Special Directories

**`convex/_generated/`:**
- Purpose: Generated Convex API, server and data-model types.
- Generated: Yes.
- Committed: Yes.
- Rule: Regenerate with Convex codegen; never hand-edit.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree.
- Generated: Yes.
- Committed: Yes.
- Rule: Generated from `src/routes/`; never hand-edit.

**`src/modules/*/internal/`:**
- Purpose: Same-module implementation and schema ownership.
- Generated: No.
- Committed: Yes.
- Rule: Sibling modules/routes must use the public seam; enforced by `tests/imports/private-imports.test.ts`.

**`src/future-phases/`:**
- Purpose: Deferred/cutover inventory.
- Generated: No.
- Committed: Yes.
- Rule: Do not treat as a current production entry point or public feature.

**`.agents/skills/`:**
- Purpose: Project-specific implementation and verification guidance.
- Generated: No.
- Committed: Yes.
- Rule: Read the applicable skill before changing its governed area.

**`.planning/`:**
- Purpose: GSD maps, ADRs, specs, records and phase artifacts.
- Generated: Mixed.
- Committed: Yes for durable records/maps.
- Rule: Derived evidence; reconcile against current source and executable proof.

**`output/`, `test-results/`, `playwright-report/`, `.react-doctor/`, `.ui-craft/`:**
- Purpose: Local reports, generated test output and audit artifacts.
- Generated: Yes.
- Committed: Generally no; verify repository status before assuming.
- Rule: Never use generated output alone as runtime authority.

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Vendored protocol/kernel reference artifact.
- Generated: No.
- Committed: Yes.
- Rule: Current AE runtime import policy is enforced by import tests; do not broaden protocol imports casually.

---

*Structure analysis: 2026-07-19*
