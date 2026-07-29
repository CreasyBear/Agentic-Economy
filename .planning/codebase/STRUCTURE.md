---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---
# Codebase Structure

**Analysis Date:** 2026-07-29

## Directory Layout

```text
Agentic-Economy/
├── package.json                 # Commands and dependency manifest
├── tsconfig.json                # Strict TypeScript configuration and aliases
├── vite.config.ts               # Vite/TanStack Start build configuration
├── vitest.config.ts             # Vitest configuration
├── convex/                      # Convex functions, ports, workers, and schema root
│   ├── schema.ts                # Composition of module-owned table fragments
│   └── _generated/              # Generated Convex client/server artifacts
├── src/
│   ├── start.ts                 # Request middleware and Start runtime instance
│   ├── router.tsx               # TanStack router construction
│   ├── routeTree.gen.ts         # Generated file-route tree
│   ├── routes/                  # Browser pages, HTTP APIs, and discovery documents
│   ├── components/              # React presentation components
│   ├── lib/                     # HTTP, server, observability, operator, and UI helpers
│   ├── modules/                 # Source-owned domains and application seams
│   └── styles/                  # Shared semantic-token/CSS files
├── tests/                       # Unit, integration, browser, import, and contract checks
├── tools/                       # Development/evidence and release tooling
├── eval/                        # Answer and product evaluation datasets/scripts
└── .planning/                   # Planning records, maps, phases, and decision artifacts
```

The current artifact inventory reports 84 direct files under `src/routes/`, 86 direct files under `convex/`, 22 direct files under `tools/dev/`, and 12 direct files under `tools/release/`. `src/modules/` is organized into domain directories with public files, `internal/` implementation, and nested responsibility/use-case directories.

## Directory Purposes

**`src/routes/`:**
- Purpose: Define TanStack file routes for browser pages, public APIs, Customer Request APIs, owner/operator pages, webhooks, and discovery documents.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/api.v1.requests.ts`, and `src/routes/$slug.inquiry.tsx`.
- Current route families also include `src/routes/[.]well-known/`, `src/routes/_operator/`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, and `src/routes/SKILL[.]md.ts`.
- Add only transport, loader, status/cache, navigation, and rendering behavior here; call source/application seams for domain state.

**`src/lib/server/`:**
- Purpose: Request-scoped server adapters for auth, bounded input, source calls, Customer Request APIs, notification transports, and agent content.
- Key files: `src/lib/server/customer-request-agent-api.ts`, `src/lib/server/customer-request-agent-auth.ts`, `src/lib/server/customer-request-browser-lifecycle-api.ts`, `src/lib/server/agent-page-markdown.ts`, and `src/lib/server/source-write-admission.ts`.
- Keep caller authentication and HTTP serialization here, but keep business state and authority decisions in the owning module/application path.

**`src/components/ae/`:**
- Purpose: Product UI compositions and projections for listings, offerings, inquiry, Customer Request, layout, status, operator, and feedback surfaces.
- Current feature directories include `src/components/ae/offerings/`, `src/components/ae/customer-request/`, `src/components/ae/listing/`, `src/components/ae/layout/`, and `src/components/ae/primitives/`.
- Render source-owned state; do not add route-local domain transitions or infer booking, payment, fulfilment, or other unsupported outcomes in presentation code.

**`src/modules/common/`:**
- Purpose: Genuinely shared primitives.
- Key files: `src/modules/common/action.ts`, `src/modules/common/ids.ts`, `src/modules/common/result.ts`, `src/modules/common/stable-hash.ts`, and `src/modules/common/convex-literals.ts`.
- Put code here only when multiple domains share the same meaning; vertical business policy belongs in its domain.

**`src/modules/actions/`:**
- Purpose: Explicit registered-action composition root.
- Key file: `src/modules/actions/index.ts`.
- Register an owning module's action here after defining its contract. Registration alone does not create a public route or prove reachability.

**`src/modules/business/`:**
- Purpose: Business identity, claim, owner, visibility, context, and trust source records.
- Key files: `src/modules/business/public.ts`, `src/modules/business/internal/claim.ts`, `src/modules/business/internal/visibility.ts`, and `src/modules/business/internal/schema.ts`.
- Keep business-record invariants here rather than in registry projections or route handlers.

**`src/modules/catalog/`:**
- Purpose: Business services, offerings, catalog model, publication flow, and source schema.
- Key files: `src/modules/catalog/public.ts`, `src/modules/catalog/internal/catalog-model.ts`, `src/modules/catalog/internal/owner-public-flow.ts`, and `src/modules/catalog/internal/schema.ts`.
- Discovery-facing catalog descriptions remain distinct from admitted routeable capability supply.

**`src/modules/registry/`:**
- Purpose: Public list/search/detail and offering-supply projections.
- Key files: `src/modules/registry/registry.actions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/public.ts`, and `src/modules/registry/internal/search-documents.ts`.
- Add discovery projection logic here; do not make registry data the source of business ownership, authority, or provider outcome truth.

**`src/modules/inquiries/`:**
- Purpose: Qualified inquiry admission, governed send, durable ledger, privacy, receipts, notifications, and read projections.
- Key files: `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/public.ts`, `src/modules/inquiries/internal/admission.ts`, `src/modules/inquiries/internal/governed-send.ts`, and `src/modules/inquiries/internal/convex-schema.ts`.
- Put new inquiry state transitions under `internal/`; expose supported contracts through `public.ts` or action/function seams.

**`src/modules/capability-contract/` and `src/modules/capability-contract-registry/`:**
- Purpose: Define provider-neutral capability semantics and resolve/persist versioned contracts.
- Key files: `src/modules/capability-contract/public.ts`, `src/modules/capability-contract-registry/public.ts`, and `src/modules/capability-contract-registry/internal/convex-schema.ts`.
- Keep provider-specific variation in adapters, not in neutral host workflows.

**`src/modules/capability-supply/`:**
- Purpose: Own offering, transport binding, publication, eligibility, readiness, operation materialization, and transport observations.
- Key files: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/published-operation.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/capability-supply/server.ts`, and `src/modules/capability-supply/internal/convex-schema.ts`.
- Transport-specific code lives under `src/modules/capability-supply/internal/`; `src/modules/capability-supply/internal/x402-payment-signer.ts` is a guarded adapter, not evidence of customer settlement or payouts.

**`src/modules/customer-request/`:**
- Purpose: Own the broader customer-request lifecycle and customer-semantic projections.
- Key files: `src/modules/customer-request/public.ts`, `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/customer-request.actions.ts`, `src/modules/customer-request/application/`, and `src/modules/customer-request/internal/convex-schema.ts`.
- Add new request behavior to the matching application/use-case slice; preserve request-owned lineage and do not move new Request meaning into a host or conversational projection.

**`src/modules/action-invocation/`:**
- Purpose: Shared continuity/control for a registered action, including preparation, authority binding, attempt identity, leases, fencing, resolution, and reconciliation.
- Key files: `src/modules/action-invocation/contracts.ts`, `src/modules/action-invocation/application-service.ts`, `src/modules/action-invocation/attempts.ts`, `src/modules/action-invocation/lease-control.ts`, `src/modules/action-invocation/reconciliation-evidence.ts`, and `src/modules/action-invocation/internal/convex-schema.ts`.
- Keep action-specific business facts outside neutral control state; invocation identity does not replace action results, evidence, or authority.

**`convex/`:**
- Purpose: Convex queries, mutations, actions, persistence ports, workers, and runtime identity boundaries.
- Key files: `convex/schema.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/customerRequestApplication.ts`, and `convex/http.ts`.
- `convex/schema.ts` spreads module-owned table fragments; do not define new domain tables inline in the root or let a route own persistence.

**`tests/`:**
- Purpose: Executable behavior and architecture checks.
- Current subdirectories include `tests/unit/`, `tests/integration/`, `tests/imports/`, `tests/e2e/`, `tests/deploy-smoke/`, `tests/eval/`, `tests/seo/`, `tests/setup/`, `tests/types/`, `tests/ui-contract/`, and `tests/fixtures/`.
- `tests/imports/` enforces ownership/retirement boundaries; `tests/unit/` mirrors domain directories such as `tests/unit/customer-request/`, `tests/unit/capability-supply/`, `tests/unit/inquiries/`, and `tests/unit/action-invocation/`.

**`tools/dev/`, `tools/release/`, and `eval/`:**
- `tools/dev/` contains labelled local scenarios and evidence collectors, including `tools/dev/customer-request-development-smoke.ts` and `tools/dev/customer-request-development-surface-parity.ts`.
- `tools/release/` contains deployment/readback and release checks, including `tools/release/customer-request-production-smoke.ts`.
- `eval/` contains answer/product evaluation assets; `eval/answer/` is separate from runtime source.
- Keep fixtures and proof artifacts out of `src/modules/`; local and release evidence does not become product source truth.

## Key File Locations

**Entry Points:**
- `src/start.ts`: Start request middleware and exported runtime instance.
- `src/router.tsx`: TanStack Router construction.
- `src/routes/__root.tsx`: Root route document/provider boundary.
- `src/routes/index.tsx`: Human home entry.
- `src/routes/api.businesses.ts`: Public registry list API.
- `src/routes/$slug.inquiry.tsx`: Qualified inquiry review/send page.
- `src/routes/api.v1.requests.ts`: Authenticated agent Customer Request creation entry.
- `convex/http.ts`: Convex HTTP route registration.

**Configuration:**
- `package.json`: Scripts and dependency manifest.
- `tsconfig.json`: Strict TypeScript options and import aliases.
- `vite.config.ts`: Vite/TanStack Start build configuration.
- `vitest.config.ts`: Unit/integration runner configuration.
- `convex/schema.ts`: Convex schema composition root.

**Core Logic:**
- `src/modules/common/action.ts`: Action contract types and descriptors.
- `src/modules/actions/index.ts`: Explicit action registry.
- `src/modules/registry/registry.functions.ts`: Registry source-query and projection seam.
- `src/modules/inquiries/internal/governed-send.ts`: Inquiry release boundary.
- `src/modules/capability-supply/published-operation.ts`: Exact supplied-operation materialization.
- `src/modules/customer-request/application/`: Customer Request use cases.
- `src/modules/action-invocation/contracts.ts`: Invocation origin/control types.
- `convex/customerRequestApplication.ts`: Customer Request Convex application host.

**Persistence:**
- `src/modules/business/internal/schema.ts`: Business tables.
- `src/modules/catalog/internal/schema.ts`: Catalog tables.
- `src/modules/inquiries/internal/convex-schema.ts`: Inquiry tables.
- `src/modules/capability-supply/internal/convex-schema.ts`: Capability-supply tables.
- `src/modules/customer-request/internal/convex-schema.ts`: Customer Request tables.
- `src/modules/action-invocation/internal/convex-schema.ts`: Action Invocation tables.

**Testing:**
- `tests/unit/`: Domain and application tests.
- `tests/integration/`: Cross-module source/adapter tests.
- `tests/imports/`: Dependency and architectural boundary tests.
- `tests/e2e/`: Local browser journeys.
- `tests/deploy-smoke/`: Hosted/deployment smoke checks.
- `tests/ui-contract/`: Rendered UI and visible contract checks.

## Naming Conventions

**Files:**
- `<domain>.actions.ts`: Registered action declarations, for example `src/modules/inquiries/inquiry.actions.ts`.
- `<domain>.functions.ts`: Module server/source adapters, for example `src/modules/inquiries/inquiry.functions.ts`.
- `public.ts`: Supported module export seam, for example `src/modules/capability-supply/public.ts`.
- `server.ts`: Server-only supported module seam, for example `src/modules/capability-supply/server.ts`.
- `internal/*.ts`: Module-private behavior and schema fragments.
- `*-api.ts`: Request/server adapters under `src/lib/server/`.
- `*Ports.ts`: Convex implementations of semantic module ports.
- `*.test.ts` and `*.test.tsx`: Vitest tests; `*.spec.ts`: browser specs.
- `*.gen.ts` and `_generated/`: Generated files; do not hand-edit.

**Directories:**
- Kebab-case domain directories such as `src/modules/action-invocation/`, `src/modules/customer-request/`, and `src/modules/capability-supply/`.
- Use-case folders under `src/modules/customer-request/application/`.
- Responsibility folders under module `internal/` directories.
- Route directories follow TanStack file-route conventions, including `src/routes/_operator/` and `src/routes/[.]well-known/`.

**Symbols:**
- PascalCase for contracts/types such as `ActionInvocationView` and `CustomerRequestProjection`.
- camelCase verbs for functions such as `materializePublishedOperation`.
- Stable action IDs and explicit `*Ref`, `*Digest`, `*Version`, and `*Generation` suffixes for durable/currentness identities.

## Where to Add New Code

**New registered action:**
- Contract and runner: `src/modules/<domain>/<domain>.actions.ts`.
- Source implementation: the owning module's supported function/application seam.
- Registration: `src/modules/actions/index.ts`.
- Tests: `tests/unit/<domain>/`; add `tests/imports/` coverage when exposure or ownership changes.
- Route: `src/routes/` only when an intended surface and real adapter exist.

**New business/catalog/discovery behavior:**
- Business identity/visibility: `src/modules/business/`.
- Service/offering description: `src/modules/catalog/`.
- Public list/search/detail projection: `src/modules/registry/`.
- Tables: the owning module's `internal/schema.ts`, then composition through `convex/schema.ts`.
- Tests: matching `tests/unit/business/`, `tests/unit/catalog/`, `tests/unit/registry/`, or `tests/integration/` paths.

**New inquiry transition:**
- Contract: `src/modules/inquiries/public.ts` or an inquiry action/function seam.
- State transition/ledger: `src/modules/inquiries/internal/commands.ts` or `src/modules/inquiries/internal/ledger/`.
- Projection: `src/modules/inquiries/internal/projections/`.
- Convex persistence: `src/modules/inquiries/internal/convex-schema.ts` and `convex/inquiries.ts`.
- Tests: `tests/unit/inquiries/` and the relevant browser/integration path.

**New routeable supply or provider adapter:**
- Contract/offering/binding: `src/modules/capability-supply/public.ts`.
- Adapter admission: `src/modules/capability-supply/internal/transport-adapters.ts`.
- Provider-specific implementation: a focused file below `src/modules/capability-supply/internal/`.
- Source ports: `src/modules/capability-supply/server.ts`, implemented by focused files under `convex/`.
- Tests: `tests/unit/capability-supply/` and the relevant `tests/integration/` path.
- Keep development fixtures under `tools/dev/` or `tests/fixtures/`; do not import them into production modules.

**New Customer Request use case:**
- Application orchestration: `src/modules/customer-request/application/<use-case>/`.
- Domain contract/state machine: a focused file under `src/modules/customer-request/` or its responsibility directory.
- Customer projection: `src/modules/customer-request/customer-projection.ts` only when customer-semantic state changes.
- Convex host/port: a focused file under `convex/`.
- Transport: `src/lib/server/customer-request-agent-api.ts` or another focused server adapter plus a thin file route.
- Tests: `tests/unit/customer-request/`, `tests/integration/`, and surface parity checks when transport meaning changes.

**New Action Invocation control behavior:**
- Contract/state type: `src/modules/action-invocation/contracts.ts`.
- Cohesive transition: a focused peer such as `src/modules/action-invocation/lease-control.ts`, `src/modules/action-invocation/resolution-control.ts`, or `src/modules/action-invocation/reconciliation-evidence.ts`.
- Durable records: `src/modules/action-invocation/internal/convex-schema.ts`.
- Convex transaction host: a focused file under `convex/`.
- Tests: `tests/unit/action-invocation/` and `tests/imports/` when host boundaries change.

**New evidence/evaluation:**
- Local source scenario: `tools/dev/` with an explicit evidence class and claim ceiling.
- Hosted/readback check: `tools/release/`.
- Domain/evaluation dataset: `tests/eval/` or `eval/`.
- Browser journey: `tests/e2e/`; deployment smoke: `tests/deploy-smoke/`.
- Never put proof packets or generated output into source modules.

**Utilities:**
- Cross-domain stable primitive: `src/modules/common/` only when semantics are truly shared.
- HTTP/request helper: `src/lib/http/` or `src/lib/server/`.
- UI-only helper: `src/lib/ui/` or the nearest feature directory under `src/components/ae/`.
- Test helper: `tests/helpers/`.

## Special Directories

**`convex/_generated/`:**
- Purpose: Generated Convex APIs and data-model types.
- Generated: Yes.
- Rule: Do not edit manually; consume generated references at Convex/runtime boundaries.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route inventory.
- Generated: Yes.
- Rule: Add or rename files under `src/routes/`; let route generation update this file.

**`tests/fixtures/`:**
- Purpose: Positive, negative, and architecture-gate test inputs.
- Generated: No.
- Rule: Fixtures prove test contracts only; they are not routeable supply, provider fulfilment, or customer evidence.

**`tools/dev/`:**
- Purpose: Labelled local/development scenarios and evidence collectors.
- Generated: No.
- Rule: Keep development-only provider/operation data here and do not import it into production source graphs.

**`.planning/`:**
- Purpose: Planning state, accepted/proposed decisions, specs, records, audits, maps, and phase artifacts.
- Generated: Mixed.
- Rule: Use it for provenance and planning context; live source and intended-surface execution determine implementation truth. The current worktree includes co-located planning artifacts that are not part of this map rewrite.

**`convex/schema.ts`:**
- Purpose: Schema composition root for module-owned Convex tables.
- Generated: No.
- Rule: Keep domain fragments in their owning module and spread them through this root; do not create a parallel schema directory.

---

*Structure analysis: 2026-07-29*
