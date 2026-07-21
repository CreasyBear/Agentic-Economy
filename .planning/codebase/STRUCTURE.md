# Codebase Structure

**Analysis Date:** 2026-07-21
**last_mapped_commit:** `63a451f43edea453d0a1a8d8502504433acf76fb`
**last_mapped_tree:** `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`

## Directory Layout

```text
Agentic-Economy/
├── AGENTS.md                         # Repository operating and architecture rules
├── PRODUCT.md                        # Product meaning and evidence/claim boundary
├── DESIGN.md                         # Human-interface authority
├── UBIQUITOUS_LANGUAGE.md            # Domain vocabulary
├── package.json                      # Commands and dependency manifest
├── vite.config.ts                    # TanStack Start, Nitro/Vercel, Tailwind, Sentry build config
├── tsconfig.json                     # Strict TypeScript and `@/*` aliases
├── convex/                           # Convex functions, hosts, adapters, workers, schema composition
│   ├── schema.ts                     # Root schema composition only
│   ├── hostedPaidOperation.ts        # Paid-operation persistence/admission/evidence host
│   ├── hostedPaidOperationGateway.ts # Authenticated paid-operation intent gateway
│   └── _generated/                   # Generated Convex client/server types
├── src/
│   ├── router.tsx                    # TanStack router creation
│   ├── routeTree.gen.ts              # Generated file-route tree
│   ├── routes/                       # Human pages and HTTP/agent transport adapters
│   ├── lib/server/                   # Request-scoped auth and Convex source transports
│   ├── components/ae/                # Product UI compositions and projections
│   ├── modules/                      # Source-owned domain contracts and application behavior
│   │   ├── actions/                  # Explicit registered-action composition root
│   │   ├── common/                   # Shared types, IDs, digests, results, action contract
│   │   ├── business/                 # Business identity, ownership, visibility
│   │   ├── catalog/                  # Business services and published capability descriptions
│   │   ├── registry/                 # Public business discovery projections
│   │   ├── inquiries/                # Qualified inquiry source, ledger, privacy, projections
│   │   ├── capability-contract/      # Capability contract and decision model
│   │   ├── capability-supply/        # Offerings, bindings, publication, readiness, transport
│   │   ├── customer-request/         # Canonical broader customer outcome aggregate
│   │   └── action-invocation/        # Shared consequence continuity and paid-operation slice
│   ├── styles/                       # Global semantic-token bridge and shared CSS
│   └── future-phases/                # Excluded future/reference source, not implementation truth
├── tests/
│   ├── unit/                         # Domain, application, server, schema, and UI unit tests
│   ├── integration/                  # Cross-module and source-adapter integration tests
│   ├── imports/                      # Architectural ownership and dependency boundary tests
│   ├── e2e/                          # Local browser journeys
│   ├── deploy-smoke/                 # Hosted surface/provider smoke tests
│   ├── eval/                         # Product/architecture evaluation tests
│   ├── ui-contract/                  # Rendered structure and interaction contracts
│   └── fixtures/                     # Explicitly labelled test inputs and negative examples
├── tools/
│   ├── dev/                          # Labelled development evidence and local scenario tools
│   └── release/                      # Exact-revision deployment/readback/proof tooling
├── eval/                             # Answer quality datasets, scripts, and prompt evaluation
├── examples/                         # Isolated integration/provider/edge examples
├── vendor/                           # Vendored reference package source
└── .planning/                        # ADRs, specs, phases, records, audits, and codebase maps
```

## Directory Purposes

**`src/routes/`:**
- Purpose: Define TanStack file routes for browser pages, server handlers, machine APIs, and discovery documents.
- Contains: Public pages, `_operator` protected pages, `/api/businesses*`, `/api/v1/requests*`, `/api/v1/paid-operations*`, webhooks, SEO/discovery routes.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/api.v1.requests.ts`, `src/routes/api.v1.paid-operations.ts`, `src/routes/$slug.inquiry.tsx`.
- Add only transport, navigation, loader, status/cache, and rendering behavior. Import application/server seams rather than Convex internals or low-level state machines.

**`src/lib/server/`:**
- Purpose: Adapt authenticated request context to source-owned application calls.
- Contains: Convex source client, bounded-body parsing, Customer Request APIs, hosted paid-operation APIs/runtime/auth, notification/webhook transports.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/lib/server/hosted-paid-operation-runtime.ts`, `src/lib/server/hosted-paid-operation-agent-auth.ts`.
- Add a file here when transport/auth concerns are request-scoped and do not own domain truth.

**`src/modules/common/`:**
- Purpose: Hold cross-domain primitives that have genuinely shared semantics.
- Contains: Action contract, canonical digests, stable hashes, branded IDs, result types, Convex literal helpers.
- Key files: `src/modules/common/action.ts`, `src/modules/common/canonical-digest.ts`, `src/modules/common/ids.ts`, `src/modules/common/result.ts`.
- Do not place vertical business policy here. Add shared code only when at least two domains use the same meaning.

**`src/modules/actions/`:**
- Purpose: Explicitly compose the registered action inventory.
- Contains: `listActions`, `findAction`, duplicate-ID enforcement, supported action exports.
- Key files: `src/modules/actions/index.ts`.
- Register a new action here after defining it in its owning domain; registration does not make a route reachable.

**`src/modules/business/`:**
- Purpose: Own business identity, claim, owner, context, trust, and visibility meaning.
- Contains: `public.ts` contract/export seam; `internal/claim.ts`, `internal/visibility.ts`, validators, and schema fragment.
- Key files: `src/modules/business/public.ts`, `src/modules/business/internal/schema.ts`.
- Add business-record invariants here, not in registry projections or routes.

**`src/modules/catalog/`:**
- Purpose: Own the published services and discovery-facing capabilities attached to a business.
- Contains: Catalog model, publish transition, owner public flow, server functions, schema fragment.
- Key files: `src/modules/catalog/public.ts`, `src/modules/catalog/internal/catalog-model.ts`, `src/modules/catalog/internal/schema.ts`.
- Keep the current `serviceCapabilities` contract honest: these records publish discovery/first-request information and store `callable: false`, `paymentRequired: false`.

**`src/modules/registry/`:**
- Purpose: Project published business/catalog source into public list/search/detail results.
- Contains: Registered read actions, public DTOs, durable source functions, public inquiry projection, schema/visibility helpers.
- Key files: `src/modules/registry/registry.actions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/public.ts`.
- Add discovery projection logic here; do not make registry records the source of business or routeable-supply truth.

**`src/modules/inquiries/`:**
- Purpose: Own the qualified-inquiry communication loop and durable readbacks.
- Contains: `inquiry.actions.ts`, `inquiry.functions.ts`, governed-send policy, ledger, privacy, notification ports, customer/owner/operator/export projections, Convex schema.
- Key files: `src/modules/inquiries/public.ts`, `src/modules/inquiries/internal/governed-send.ts`, `src/modules/inquiries/internal/convex-schema.ts`.
- Put new inquiry state transitions under `internal/`; expose supported external contracts through `public.ts` or action/function seams.

**`src/modules/capability-contract/`:**
- Purpose: Define provider-neutral capability schemas, effects, data-use, lifecycle, evidence, and decision validation.
- Contains: Contract types, schema parser, open decision model.
- Key files: `src/modules/capability-contract/public.ts`.
- Add domain variation to the contract vocabulary; do not branch neutral host workflows on provider identity.

**`src/modules/capability-contract-registry/`:**
- Purpose: Persist and resolve versioned capability contracts.
- Contains: Public registry seam, internal integrity/persistence, Convex schema fragment.
- Key files: `src/modules/capability-contract-registry/public.ts`, `src/modules/capability-contract-registry/internal/convex-schema.ts`.

**`src/modules/capability-supply/`:**
- Purpose: Own routeable-supply admission from offering through binding, publication, eligibility, readiness, and transport.
- Contains: Public contract, server ports, publication/eligibility/graph/operation-ledger internals, adapter admission, x402 transport, published-operation materializer, labelled development evidence.
- Key files: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/published-operation.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/capability-supply/internal/convex-schema.ts`.
- Add provider transport variation under `internal/transport-adapters.ts` and a dedicated adapter. Keep credentials server-side and keep public/customer projections neutral.

**`src/modules/customer-request/`:**
- Purpose: Own the canonical broader customer outcome and resumable customer-semantic lifecycle.
- Contains: Intent/compiler, semantic interpreter, revisions, evaluations, preparations, route plans, mandates, execution, cancellation, evidence, problems, repeat permissions, projections, application slices, Convex schema.
- Key files: `src/modules/customer-request/public.ts`, `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/application/`, `src/modules/customer-request/internal/convex-schema.ts`.
- Add Request behavior to the narrow application slice matching the transition. Preserve exact Request-owned lineage; do not move new Request meaning into Answer Thread.

**`src/modules/action-invocation/`:**
- Purpose: Own shared continuity/control for a registered action and the current paid-operation vertical.
- Contains: Contracts, preparation, input work, authority, standing mandate, leases, attempts, fenced execution, resolution/reconciliation, durable ports, host projections, paid-operation semantics, hosted composition/creation/persistence contracts.
- Key files: `src/modules/action-invocation/contracts.ts`, `src/modules/action-invocation/application-service.ts`, `src/modules/action-invocation/paid-operation-application-service.ts`, `src/modules/action-invocation/internal/convex-schema.ts`.
- Put reusable invocation control in focused files. Keep action-specific business truth outside neutral control; paid-operation-specific code may remain in this module while it owns the proven vertical.

**`convex/`:**
- Purpose: Expose Convex queries/mutations/actions, derive runtime identity, implement source ports, run transactions/workers, and compose the schema.
- Contains: Domain hosts, `*Ports.ts` adapters, workers, auth, source-write admission, crons, generated APIs.
- Key files: `convex/schema.ts`, `convex/authz.ts`, `convex/sourceWriteAdmission.ts`, `convex/customerRequestApplication.ts`, `convex/hostedPaidOperationGateway.ts`, `convex/hostedPaidOperation.ts`.
- Keep pure business decisions in `src/modules/`; keep Convex files focused on validator, auth, transaction, scheduling, and port concerns.

**`tests/imports/`:**
- Purpose: Enforce architecture as executable dependency and ownership rules.
- Contains: Private-import, route, module, retirement, source-completeness, paid-operation, and generated-file scans.
- Key files: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/action-invocation-host-boundaries.test.ts`, `tests/imports/hosted-paid-operation-boundaries.test.ts`.
- Update these tests whenever an intentional architecture boundary changes.

**`tools/dev/`:**
- Purpose: Produce labelled local/development evidence through real application seams.
- Contains: Action Invocation scenarios, host parity, bounded/full mandate packets, dynamic published operations, provider conformance, local paid-operation surface, evidence provenance.
- Key files: `tools/dev/evidence-provenance.ts`, `tools/dev/verify-action-invocation-host-parity-evidence.ts`, `tools/dev/verify-phase-3c-red-contract.ts`.
- Keep fixtures here or under `tests/fixtures/`; never import them into production graphs.

**`tools/release/`:**
- Purpose: Bind release evidence to exact Git, deployment, credentials, hosted readback, and proof-packet integrity.
- Contains: Deployment source observers, temporary credential flows, hosted journeys, proof schemas, live collectors, release verifiers.
- Key files: `tools/release/observe-vercel-git-source-deployment.ts`, `tools/release/paid-operation-hosted-journey.ts`, `tools/release/paid-operation-hosted-proof-contract.ts`, `tools/release/verify-paid-operation-hosted-release.ts`.
- Add hosted evidence logic here; do not use release artifacts as the product source of business truth.

## Key File Locations

**Entry Points:**
- `src/router.tsx`: TanStack Router construction.
- `src/routes/__root.tsx`: Root document/provider/error boundary.
- `src/routes/index.tsx`: Current `/` human entry.
- `src/routes/api.businesses.ts`: Public registry list API.
- `src/routes/$slug.inquiry.tsx`: Qualified-inquiry review/send page.
- `src/routes/api.v1.requests.ts`: External-agent Customer Request creation.
- `src/routes/actions.paid.new.tsx`: Human paid-sandbox setup.
- `src/routes/api.v1.paid-operations.ts`: Agent paid-sandbox creation.
- `convex/http.ts`: Convex HTTP endpoint registration.

**Configuration:**
- `package.json`: Scripts, dependencies, evidence and release commands.
- `tsconfig.json`: Strict compiler options and `@/*`/`~/*` aliases.
- `vite.config.ts`: TanStack Start, Nitro Vercel Node target, Tailwind, Sentry.
- `vitest.config.ts`: Unit/integration test runner.
- `playwright.config.ts`: Local browser test configuration.
- `playwright.deploy-smoke.config.ts`: Hosted smoke configuration.
- `convex/convex.config.ts`: Convex component configuration.
- `convex/schema.ts`: Schema composition root.

**Core Logic:**
- `src/modules/common/action.ts`: Registered-action contract.
- `src/modules/actions/index.ts`: Action registry.
- `src/modules/inquiries/internal/governed-send.ts`: Qualified-inquiry release boundary.
- `src/modules/capability-supply/published-operation.ts`: Exact supplied-operation materialization.
- `src/modules/customer-request/application/`: Canonical Request use cases.
- `src/modules/action-invocation/contracts.ts`: Invocation control types and origin.
- `src/modules/action-invocation/paid-operation-application-service.ts`: Paid-operation commands and projection service.
- `convex/hostedPaidOperationGateway.ts`: Authenticated paid-operation intent gateway.
- `convex/hostedPaidOperation.ts`: Durable paid-operation aggregate persistence and source evidence host.

**Persistence:**
- `src/modules/business/internal/schema.ts`: Owner, business, context, and claim tables.
- `src/modules/catalog/internal/schema.ts`: Service/catalog capability tables.
- `src/modules/inquiries/internal/convex-schema.ts`: Inquiry ledger and receipt tables.
- `src/modules/capability-supply/internal/convex-schema.ts`: Supply publication/offering/binding tables.
- `src/modules/customer-request/internal/convex-schema.ts`: Request aggregate/application tables.
- `src/modules/action-invocation/internal/convex-schema.ts`: Invocation control and hosted paid-operation tables.

**Testing:**
- `tests/unit/action-invocation/`: Invocation, paid-operation, persistence, projection, and Convex handler tests.
- `tests/unit/capability-supply/`: Supply graph, publication, transport, x402, and published-operation tests.
- `tests/unit/inquiries/`: Inquiry policy, ledger, projections, privacy, and receipt tests.
- `tests/integration/`: Source/adapter journeys across modules.
- `tests/imports/`: Architectural dependency gates.
- `tests/e2e/paid-operation-hosted-sandbox.spec.ts`: Local browser paid-sandbox flow.
- `tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts`: Hosted paid-sandbox readback.
- `tests/eval/adr009-*.test.ts`: Action Invocation composition/transfer evals.

## Naming Conventions

**Files:**
- `<domain>.actions.ts`: Registered action declarations, for example `src/modules/inquiries/inquiry.actions.ts`.
- `<domain>.functions.ts`: Server/source adapters, for example `src/modules/inquiries/inquiry.functions.ts`.
- `public.ts`: Supported sibling-module export seam, for example `src/modules/capability-supply/public.ts`.
- `server.ts`: Server-only supported module seam, for example `src/modules/capability-supply/server.ts`.
- `internal/*.ts`: Module-private behavior and schema fragments.
- `*-api.ts`: HTTP/server adapters in `src/lib/server/`.
- `*Ports.ts`: Convex implementations of semantic module ports.
- `*.actions.ts`: TanStack/registered action definitions; do not confuse with Convex `action()` functions.
- `*.test.ts` / `*.test.tsx`: Vitest tests; `*.spec.ts`: Playwright tests.
- `*.gen.ts`, `_generated/`: Generated files; do not hand-edit.

**Directories:**
- Kebab-case domain directories: `action-invocation`, `customer-request`, `capability-supply`.
- Use-case folders under `application/`: `authorize-preparation`, `compare-resume`, `confirm-route`.
- Responsibility folders under `internal/`: `binding`, `eligibility`, `publication`, `operation-ledger`, `projections`.

**Symbols:**
- Use PascalCase for contracts/types (`ActionInvocationView`, `HostedPaidOperationAggregate`).
- Use camelCase verbs for functions (`materializePublishedOperation`, `createPaidOperationApplicationService`).
- Use stable dot-separated action IDs (`customerRequest.confirm`, `supply.collectDevelopmentQuote`).
- Use explicit `*Ref`, `*Digest`, `*Version`, and `*Generation` suffixes for durable identities/currentness.

## Where to Add New Code

**New Registered Action:**
- Contract and runner: `src/modules/<domain>/<domain>.actions.ts`.
- Source implementation: `src/modules/<domain>/<domain>.functions.ts` or a supported application seam.
- Registration: `src/modules/actions/index.ts`.
- Tests: `tests/unit/<domain>/` plus `tests/imports/` when exposure or ownership changes.
- Route: `src/routes/` only when an intended surface exists; registration alone is insufficient.

**New Business or Catalog Behavior:**
- Business identity/visibility: `src/modules/business/`.
- Service and published capability description: `src/modules/catalog/`.
- Public discovery projection: `src/modules/registry/`.
- Convex tables: the owning module's `internal/schema.ts`, then spread through `convex/schema.ts`.
- Tests: `tests/unit/business/`, `tests/unit/catalog/`, `tests/unit/registry/`, or `tests/integration/claim-publish.test.ts`.

**New Inquiry Transition:**
- Contract: `src/modules/inquiries/public.ts` or `src/modules/inquiries/internal/schema.ts`.
- State transition/ledger: `src/modules/inquiries/internal/commands.ts` or `src/modules/inquiries/internal/ledger/`.
- Projection: `src/modules/inquiries/internal/projections/`.
- Convex host/persistence: `convex/inquiries.ts` and `src/modules/inquiries/internal/convex-schema.ts`.
- Tests: `tests/unit/inquiries/` and the relevant E2E journey.

**New Routeable Supply or Provider Adapter:**
- Contract/offering/binding meaning: `src/modules/capability-supply/public.ts`.
- Adapter admission: `src/modules/capability-supply/internal/transport-adapters.ts`.
- Provider-specific implementation: a focused file under `src/modules/capability-supply/internal/`.
- Source ports: `src/modules/capability-supply/server.ts`, implemented by `convex/capabilitySupply*Ports.ts`.
- Tests: `tests/unit/capability-supply/` plus `tests/integration/capability-supply-*.test.ts`.
- Keep evaluator/provider fixtures under `tools/dev/fixtures/` or `tests/fixtures/`, never `src/modules/`.

**New Customer Request Use Case:**
- Application orchestration: `src/modules/customer-request/application/<use-case>/`.
- Domain contract/machine: a focused top-level or `route-execution/` file.
- Customer projection: `src/modules/customer-request/customer-projection.ts` only when the public semantic state changes.
- Convex port: a focused `convex/customerRequest*Ports.ts` file.
- Transport: `src/lib/server/customer-request-*-api.ts` and thin `src/routes/api*.requests*.ts`.
- Tests: `tests/unit/customer-request/`, `tests/integration/customer-request-*.test.ts`, and surface parity when transport meaning changes.

**New Action Invocation Control Behavior:**
- Contract/state type: `src/modules/action-invocation/contracts.ts`.
- Cohesive transition: a focused file such as `lease-control.ts`, `resolution-control.ts`, or a new responsibility-specific peer.
- Durable port contract: `src/modules/action-invocation/internal/durable-contracts.ts` or `hosted-paid-operation-port.ts` for that aggregate.
- Convex records: `src/modules/action-invocation/internal/convex-schema.ts`.
- Convex transaction host: `convex/actionInvocationControl.ts` or a focused paid-operation port file.
- Tests: `tests/unit/action-invocation/`, `tests/imports/action-invocation-host-boundaries.test.ts`.

**New Paid-Operation Surface Behavior:**
- Shared semantics/application: `src/modules/action-invocation/paid-operation-*.ts`.
- Human/agent transport: `src/lib/server/hosted-paid-operation-*-api.ts`.
- Source persistence/currentness: `convex/hostedPaidOperation.ts`, `convex/hostedPaidOperationGateway.ts`.
- Human UI projection: `src/components/ae/action-invocation/AePaidOperationCard.tsx` via `paid-operation-card-contract.ts`.
- Agent command projection: `src/modules/action-invocation/paid-operation-agent-command-contract.ts`.
- Tests: `tests/unit/action-invocation/`, `tests/unit/server/hosted-paid-operation-*.test.ts`, `tests/ui-contract/hosted-paid-operation-contract.test.tsx`.

**New Evidence/Eval:**
- Source/local development scenario: `tools/dev/` with explicit evidence class and claim ceiling.
- Hosted exact-revision collector/verifier: `tools/release/`.
- Domain eval: `tests/eval/` or `eval/` when a dataset/model runner is required.
- Browser journey: `tests/e2e/`; hosted smoke: `tests/deploy-smoke/`.
- Never put proof packets or generated output into source modules.

**Utilities:**
- Cross-domain stable primitive: `src/modules/common/` only when semantics are shared.
- HTTP/request helper: `src/lib/http/` or `src/lib/server/`.
- UI-only helper: `src/lib/ui/` or the closest `src/components/ae/` feature directory.
- Test helper: `tests/helpers/`.

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex-generated APIs and data-model types.
- Generated: Yes.
- Committed: Yes.
- Rule: Do not edit manually; import generated function references only from Convex/runtime boundaries.

**`src/future-phases/`:**
- Purpose: Reference material excluded from the active TypeScript program.
- Generated: No.
- Committed: Yes.
- Rule: Do not cite as implemented product behavior; `tsconfig.json` excludes it.

**`tools/dev/fixtures/`:**
- Purpose: Explicitly labelled provider-operation and development fixtures.
- Generated: No.
- Committed: Yes.
- Rule: Production source must not import it; enforced by `tests/imports/action-invocation-host-boundaries.test.ts`.

**`tests/fixtures/`:**
- Purpose: Positive, negative, and architecture-gate test inputs.
- Generated: No.
- Committed: Yes.
- Rule: Fixtures prove test contracts only; they are not routeable supply or provider evidence.

**`.planning/`:**
- Purpose: Planning state, accepted/proposed decisions, specs, records, audits, maps, and phase evidence.
- Generated: Mixed.
- Committed: Yes.
- Rule: Use for decision provenance; live source and intended-surface execution decide implementation truth.

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Vendored protocol-kernel reference/package source.
- Generated: No.
- Committed: Yes.
- Rule: Current public routing runtime is retired; do not reintroduce executable authority through this vendor tree.

**`examples/`:**
- Purpose: Isolated agent client, provider, directory, bridge, and edge-worker examples.
- Generated: No.
- Committed: Yes.
- Rule: Examples demonstrate integration shapes; they are not proof that the main product route is reachable.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route inventory.
- Generated: Yes.
- Committed: Yes.
- Rule: Add or rename files under `src/routes/`; let generation update this file.

---

*Structure analysis: 2026-07-21*
