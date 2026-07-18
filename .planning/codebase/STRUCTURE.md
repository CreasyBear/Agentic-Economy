# Codebase Structure

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `5ea44454` (post residual deepen Waves 23–32)

## Directory Layout

```
Agentic-Economy/
├── src/                          # TanStack Start app + domain modules
│   ├── modules/                  # Domain ownership (primary code home)
│   ├── routes/                   # File-based routes (public, API, operator)
│   ├── components/               # UI (ae/* legacy behavioral, astryx/*)
│   ├── lib/                      # Cross-cutting server/http/ui helpers
│   ├── hooks/                    # Small React hooks
│   ├── styles/                   # Global styles
│   ├── start.ts                  # Start middleware composition
│   ├── router.tsx                # Router factory
│   └── routeTree.gen.ts          # Generated route tree
├── convex/                       # Thin Convex hosts, ports, schema root
├── tests/                        # unit, integration, e2e, imports, copy, seo
├── tools/                        # Release/dev smoke and verification scripts
├── eval/                         # Answer eval suites
├── examples/                     # Provider / routing examples
├── docs/                         # Ancillary docs
├── .planning/                    # Roadmap, ADRs, records, codebase maps
├── .agents/skills/               # AE-specific agent skills
├── public/                       # Static assets
├── PRODUCT.md / DESIGN.md / AGENTS.md
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

## Directory Purposes

**`src/modules/`:**
- Purpose: All durable domain logic, schemas, actions, and public seams
- Contains: One folder per domain; `public.ts`, optional `*.actions.ts` / `*.functions.ts`, `internal/`
- Key files: `src/modules/actions/index.ts`, `src/modules/customer-request/`, `src/modules/inquiries/`, `src/modules/capability-supply/`, `src/modules/catalog/`

**`src/routes/`:**
- Purpose: URL entry points (pages + API)
- Contains: TanStack Router file routes; `_operator/` for owner/admin/developer consoles
- Key files: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/api.v1.requests*.ts`, `src/routes/llms[.]txt.ts`

**`src/components/`:**
- Purpose: Presentation
- Contains: `ae/` product UI, `astryx/` design-system bridges, limited `ai-elements/` / `animate/`
- Key files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/components/ae/layout/AePublicShell.tsx`

**`src/lib/`:**
- Purpose: App-level adapters (not domain ownership)
- Contains: `server/` API helpers, `http/` security/discovery, `observability/`, `ui/` presentation helpers
- Key files: `src/lib/server/customer-request-api.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/convex-source.ts`

**`convex/`:**
- Purpose: Persistence runtime and thin ports
- Contains: Function hosts, `*Ports.ts`, workers, `schema.ts`, `http.ts`, `_generated/`
- Key files: `convex/schema.ts`, `convex/inquiries.ts`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`, `convex/capabilitySupplyGraphPorts.ts`, `convex/inquirySourceStatePorts.ts`

**`tests/`:**
- Purpose: Executable evidence for modules, hosts, imports, UI contracts
- Contains: `unit/`, `integration/`, `e2e/`, `imports/`, `copy/`, `seo/`, `ui-contract/`, `deploy-smoke/`, `types/`
- Key files: `tests/imports/private-imports.test.ts`, `tests/unit/**/**-thinness.test.ts`

**`.planning/`:**
- Purpose: Product/engineering planning authority companions
- Contains: ROADMAP, ADRs (`adr/`), records, `codebase/` maps
- Key files: `.planning/adr/ADR-011-journal-write-plan-ports.md`, `.planning/codebase/ARCHITECTURE.md`

## Module inventory (`src/modules/`)

| Module | Role |
|--------|------|
| `actions` | Central action registry only |
| `answer` / `answer-thread` | Answer synthesis and thread runtime |
| `business` | Business entity source |
| `capability-contract` | Contract model / digests |
| `capability-contract-registry` | Registered contract documents |
| `capability-supply` | Offerings, bindings, publications, eligibility, graph/probe |
| `catalog` | Public catalog model + `catalogFromRows` |
| `common` | Shared action types, ids, digests, results |
| `customer-request` | Request lifecycle, application, route-execution, hosted journeys |
| `demand` | Demand capture |
| `dev` | Dev seed fixtures |
| `discovery` | Discovery projections / manifests |
| `governed-action` | Governed action helpers |
| `harness` | Agent run loop, tool contracts, approval policy |
| `inquiries` | Qualified inquiry ledger + ports types |
| `lifecycle` | Lifecycle helpers |
| `network-guard` | Network guard |
| `notification-outbox` | Notification dispatch outbox |
| `observability` | Audit / funnel / operator controls |
| `product` | Product surface copy/helpers |
| `provider-integrations` | Provider adapters |
| `registry` | Public registry search/list/detail |
| `routing-kernel` | Neutral kernel + retirement |
| `routing-tracer` | Tracing helpers |
| `sandbox-supply` | Sandbox acceptance supply |
| `security` | Admin authority / security tables |
| `seo` | SEO helpers |
| `settings` | Owner notification preferences |
| `storefront` | Storefront draft import |

## Critical post-campaign layouts

### Domain module + thin Convex ports

```
src/modules/<domain>/
  public.ts
  <domain>.actions.ts          # optional
  <domain>.functions.ts        # optional
  internal/                    # private; schema + implementation
convex/
  <host>.ts                    # thin: validate → ports → module
  <host>Ports.ts               # MutationCtx/ActionCtx/RuntimeDb → ports
```

Canonical port adapter files (non-exhaustive):

- `convex/inquirySourceStatePorts.ts`, `convex/inquiryNotificationPorts.ts`
- `convex/customerRequestRouteExecutionJournalPorts.ts`
- `convex/customerRequestProvideFactsPorts.ts`, `customerRequestCompareResumePorts.ts`, `customerRequestConfirmRoutePorts.ts`, `customerRequestAuthorizePreparationPorts.ts`, `customerRequestRefinePorts.ts`, `customerRequestProblemRoutePorts.ts`, `customerRequestStandingRoutePorts.ts`, `customerRequestEvidenceLoadPorts.ts`
- `convex/capabilitySupplyGraphPorts.ts`, `capabilitySupplyWriterPorts.ts`, `capabilitySupplyOperationPorts.ts`, `capabilitySupplyEligiblePorts.ts`, `capabilitySupplyPublicationPorts.ts`

### Inquiry host-done (source-state / notification)

```
src/modules/inquiries/
  public.ts
  internal/ledger/ports.ts          # InquirySourceStatePorts
  internal/notification-ports.ts    # InquiryNotificationPorts
  internal/…                        # pure commands / projections
convex/
  inquiries.ts                      # host-done orchestration
  inquirySourceStatePorts.ts
  inquirySourceStateLoad.ts
  inquirySourceStatePersist.ts
  inquiryNotificationPorts.ts
  inquiryNotificationBridge.ts
```

### Route-execution machines (ADR-011)

```
src/modules/customer-request/route-execution/
  journal/                 # predicates / integrity ONLY
  machines/
    ports.ts               # JournalMutationPorts
    start-or-resume.ts
    lease-next-dispatch.ts
    record-outcome.ts
    types.ts
    index.ts
  evidence-load/
  problem-support/
convex/
  customerRequestRouteExecution.ts              # thin internalMutation shells
  customerRequestRouteExecutionJournalPorts.ts
```

### capability-supply graph / probe ports

```
src/modules/capability-supply/internal/graph/
  ports.ts                 # CapabilityGraphPorts
  query-graph.ts
  read-probe-target.ts
  record-probe-result.ts
  probe-digest.ts
  index.ts
convex/
  capabilitySupply.ts              # thin wrappers + auth gates
  capabilitySupplyGraphPorts.ts
```

### hosted-agent-journey split

```
src/modules/customer-request/
  hosted-agent-journey.ts          # re-export barrel
  hosted-agent-journey/
    index.ts
    run.ts
    happy.ts
    partial.ts
    cancel.ts
    discovery.ts
    front-door.ts
    runtime.ts
    types.ts
```

### catalog-from-rows (registry + discovery)

```
src/modules/catalog/
  public.ts                        # re-exports catalogFromRows
  internal/catalog-from-rows.ts
convex/
  registry.ts                      # calls catalogFromRows
  discovery.ts                     # calls catalogFromRows
```

## Customer Request application map

Place new Request use-cases under `src/modules/customer-request/application/<use-case>/` with `index.ts`, command files, and `types.ts` (ports + results). Wire Convex via a matching `convex/customerRequest*Ports.ts` and thin host calls in `convex/customerRequestApplication.ts` / `customerRequestV2*.ts`.

Existing use-case folders:

- `interpret-compile/`, `provide-facts/`, `refine/`, `compare-resume/`
- `authorize-preparation/`, `confirm-route/`, `preparation-egress/`
- `standing-route/`, `problem-route/`
- `route-plan-projection/`, `action-projection/`

## Key File Locations

**Entry Points:**
- `src/start.ts`: App middleware
- `src/router.tsx`: Router
- `convex/schema.ts`: Schema composition root
- `convex/http.ts`: Convex HTTP (sandbox providers + retired v1 routes)
- `src/modules/actions/index.ts`: Action registry

**Configuration:**
- `package.json`: Scripts and dependencies
- `vite.config.ts`: Build/dev
- `vitest.config.ts`: Unit/integration runner
- `playwright.config.ts` / `playwright.deploy-smoke.config.ts`: E2E / deploy smoke
- `tsconfig.json`: Path aliases `@/*` → `src/*`
- `.env.example`: Env var names (do not commit secrets)

**Core Logic:**
- `src/modules/customer-request/`: Request → RoutePlan → mandate → run
- `src/modules/capability-supply/`: Routeable supply graph
- `src/modules/registry/` + `src/modules/catalog/`: Public discovery inventory
- `src/modules/inquiries/`: Qualified inquiry
- `src/modules/harness/`: Agent tool loop / quiet door contracts

**Testing:**
- `tests/unit/<domain>/`: Co-located by domain
- `tests/unit/**/**-thinness.test.ts`: Host/module deepen locks
- `tests/imports/`: Boundary and private-import guards
- `tests/integration/`: Multi-module runtime
- `tests/e2e/`, `tests/deploy-smoke/`: Browser evidence

## Naming Conventions

**Files:**
- Domain public seam: `public.ts`
- Actions: `<domain>.actions.ts`
- Server/Convex binding: `<domain>.functions.ts`
- Convex host: `camelCase.ts` matching domain (`inquiries.ts`, `capabilitySupply.ts`)
- Ports adapter: `*Ports.ts` (`inquirySourceStatePorts.ts`, `capabilitySupplyGraphPorts.ts`)
- Schema fragment: `internal/schema.ts` or `internal/convex-schema.ts`
- Thinness lock: `*-thinness.test.ts`

**Directories:**
- Modules: kebab-case (`customer-request`, `capability-supply`)
- Application use-cases: kebab-case folders under `application/`
- Route-execution: `journal/`, `machines/`, `evidence-load/`, `problem-support/`

**Symbols:**
- Port types: `*Ports` (`JournalMutationPorts`, `CapabilityGraphPorts`)
- Port factories: `*Ports(ctx)` / `*Ports(db)` in Convex
- Public re-exports: import as `fooImpl`, export as `foo`

## Where to Add New Code

**New Feature (domain operation):**
- Primary code: `src/modules/<domain>/internal/` + export via `public.ts`
- Actions (if multi-surface): `<domain>.actions.ts` → register in `src/modules/actions/index.ts`
- Convex: thin host + `*Ports.ts` if persistence needed; table fragment in module schema
- Tests: `tests/unit/<domain>/`; add thinness test if deepening a host; imports boundary if new public seam

**New Customer Request use-case:**
- Implementation: `src/modules/customer-request/application/<name>/`
- Ports type: same folder `types.ts`
- Convex adapter: `convex/customerRequest<Name>Ports.ts`
- Export: `src/modules/customer-request/application/public.ts`

**New route-execution mutation orchestration:**
- Machine: `src/modules/customer-request/route-execution/machines/`
- Pure decision: `journal/` only if predicate/integrity (no write-plans)
- Host: keep `convex/customerRequestRouteExecution.ts` thin; extend `JournalMutationPorts` + `customerRequestRouteExecutionJournalPorts.ts`
- Lock: extend `tests/unit/customer-request/route-execution/machines-thinness.test.ts`

**New UI page:**
- Route: `src/routes/...`
- Components: prefer Astryx; behavioral AE under `src/components/ae/`
- Do not put domain logic in routes — call module functions / actions

**New assistant-callable tool:**
- Action with `agentTools` surface
- Pin id in `src/modules/harness/tool-contract.ts` `PublicQuietAgentToolIds`
- Never expose owner-only ops on `agentTools`

**Utilities:**
- Shared pure helpers: `src/modules/common/`
- App HTTP/server glue: `src/lib/server/` (not a substitute for domain modules)

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex codegen API/dataModel
- Generated: Yes
- Committed: Yes (typical Convex workflow in this repo)

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree
- Generated: Yes
- Committed: Yes

**`src/modules/*/internal/`:**
- Purpose: Private implementation
- Generated: No
- Committed: Yes — never import from outside the owning module

**`.planning/codebase/`:**
- Purpose: Architecture maps for GSD plan/execute
- Generated: No (maintained by map-codebase)
- Committed: Yes

**`outputs/` / `output/` / `.scratch/`:**
- Purpose: Simulation and local scratch artifacts
- Generated: Local runs
- Committed: Generally untracked / not source of truth

---

*Structure analysis: 2026-07-18 · last_mapped_commit `5ea44454`*
