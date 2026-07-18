# Codebase Structure

**Analysis Date:** 2026-07-18
**last_mapped_commit:** `3463c1d4` (post Waves 33–37)

## Directory Layout

```
Agentic-Economy/
├── src/
│   ├── routes/                 # TanStack Start routes (UI + API)
│   ├── modules/                # Domain modules (public / actions / internal)
│   ├── components/             # UI composition (prefer Astryx)
│   ├── views/                  # Page-level view compositions
│   ├── lib/                    # Shared lib (dev fixtures, server helpers, …)
│   ├── server/                 # Server utilities
│   ├── styles/                 # Global styles
│   ├── app/                    # App shell pieces
│   ├── hooks/                  # React hooks
│   ├── start.ts                # TanStack Start entry
│   └── router.tsx              # Router wiring
├── convex/                     # Convex hosts, *Ports adapters, workers, schema root
├── tests/                      # unit / integration / e2e / imports / …
├── .planning/                  # ADRs, records, codebase maps
├── .agents/skills/             # AE-specific agent skills
├── PRODUCT.md / DESIGN.md / AGENTS.md
└── package.json
```

## Directory Purposes

**`src/modules/`:**
- Purpose: Domain ownership — one folder per bounded context
- Contains: `public.ts`, `*.actions.ts`, `*.functions.ts`, `internal/`, optional `application/`
- Key files: `src/modules/actions/index.ts` (central registry), `src/modules/common/action.ts`

**`src/modules/customer-request/`:**
- Purpose: Customer Request lifecycle (compile → confirm → run → cancel/problem → evidence)
- Contains: `application/` (ports-driven orchestration), `route-execution/` (journal/machines/problem-support/evidence-load), mandate/admission, actions
- Key files: `application/public.ts`, `customer-request.actions.ts`, `route-execution/machines/index.ts`

**`src/modules/customer-request/route-execution/`:**
- Purpose: Post-confirm execution journal and mutation machines
- Contains:
  - `journal/` — pure predicates/integrity/decisions (ADR-011 purity)
  - `machines/` — start/lease/outcome/cancel/problem orchestration + port types
  - `problem-support/` — pure problem decide/project helpers
  - `evidence-load/` — evidence assembly behind ports
- Key files: `machines/ports.ts`, `machines/cancel-ports.ts`, `machines/problem-ports.ts`

**`src/modules/inquiries/`:**
- Purpose: Qualified inquiry submit/inbox/receipt; dual-path server backend
- Contains: `inquiry.actions.ts`, `inquiry.functions.ts`, `internal/` (commands, ledger, privacy, `local-e2e-adapter.ts`, notification-ports)
- Key files: `inquiry.functions.ts` (`createInquiryServerBackend`), `internal/local-e2e-adapter.ts`

**`src/modules/notification-outbox/`:**
- Purpose: Notification dispatch aggregate + provider commands
- Contains: `public.ts`, `internal/commands.ts`, `internal/schema.ts`, `internal/source-state-ports.ts`
- Key files: `public.ts`, `internal/source-state-ports.ts`

**`src/modules/capability-supply/`:**
- Purpose: Routeable supply — offering/binding/eligibility/publication/graph/probe/transport
- Contains: `internal/{offering,binding,eligibility,publication,graph,operation-ledger,quarantine}/`, `route-transport-runtime.ts`
- Key files: `internal/*/ports.ts`, `public.ts`, `server.ts`

**`src/modules/registry/` / `catalog/` / `discovery/`:**
- Purpose: Published listings, search, llms.txt / agent discovery material
- Contains: search sync, schema fragments, discovery projections
- Key files: `registry/public.ts`, `discovery/` skill/llms routes

**`src/modules/harness/` / `answer/` / `answer-thread/` / `routing-kernel/`:**
- Purpose: Current agent run loop, answer tooling, legacy/thread paths, destination routing kernel inventory
- Contains: tool contracts, session journal, answer turns, kernel runtime
- Key files: `harness/tool-contract.ts`, `routing-kernel/application.ts`

**`convex/`:**
- Purpose: Host registration, validators, `*Ports.ts` adapters, workers, schema composition
- Contains: ~74 Convex modules including Application, route-execution host + three port families, inquiry/outbox, capability-supply ports
- Key files:
  - `schema.ts`
  - `customerRequestApplication.ts`
  - `customerRequestRouteExecution.ts`
  - `customerRequestRouteExecutionJournalPorts.ts`
  - `customerRequestRouteExecutionCancelPorts.ts`
  - `customerRequestRouteExecutionProblemPorts.ts`
  - `notificationOutboxPersistence.ts`
  - `notificationOutboxSourceStatePorts.ts`
  - `inquirySourceStatePorts.ts`
  - `inquiryNotificationPorts.ts`

**`src/routes/`:**
- Purpose: File-based routing for humans and machines
- Contains: public pages (`registry.tsx`, `$slug.tsx`), operator (`_operator/`), Customer Request APIs (`api.v1.requests*`, `api.requests*`), notification webhooks, discovery (`llms[.]txt.ts`)
- Key files: `__root.tsx`, `api.v1.requests.$requestRef.run.ts`, `api.agent` surfaces via harness routes

**`tests/`:**
- Purpose: Executable evidence for deepen thinness, domain, integration, e2e
- Contains: `unit/`, `integration/`, `e2e/`, `imports/`, `ui-contract/`
- Key files: `tests/unit/customer-request/route-execution/machines-thinness.test.ts`, `journal-thinness.test.ts`, `problem-mutation-thinness.test.ts`

**`.planning/`:**
- Purpose: ADRs, project records, codebase maps for GSD
- Contains: `adr/ADR-011-*.md`, `adr/ADR-012-*.md`, `codebase/`
- Key files: this directory’s `ARCHITECTURE.md` / `STRUCTURE.md`

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start bootstrap
- `src/router.tsx`: Route tree wiring
- `src/modules/actions/index.ts`: Action registry import surface
- `convex/customerRequestApplication.ts`: Customer Request action host
- `convex/customerRequestRouteExecution.ts`: Route-execution mutation/query host
- `src/modules/inquiries/inquiry.functions.ts`: Inquiry server backend factory

**Configuration:**
- `convex/schema.ts`: Schema composition root
- `convex/convex.config.ts`: Convex app config
- `package.json`: Scripts (`check:convex-codegen`, test runners)
- `PRODUCT.md` / `DESIGN.md` / `AGENTS.md`: Product/visual/assistant authority

**Core Logic:**
- `src/modules/customer-request/application/`: Application orchestration
- `src/modules/customer-request/route-execution/machines/`: ADR-011/012 machines
- `src/modules/customer-request/route-execution/journal/`: Pure journal decisions
- `src/modules/capability-supply/internal/`: Supply deepen packages
- `src/modules/inquiries/internal/`: Inquiry commands + local-e2e adapter
- `src/modules/notification-outbox/internal/`: Outbox commands

**Convex adapters (deepen pattern):**
- Journal: `convex/customerRequestRouteExecutionJournalPorts.ts`
- Cancel: `convex/customerRequestRouteExecutionCancelPorts.ts`
- Problem: `convex/customerRequestRouteExecutionProblemPorts.ts`
- Evidence: `convex/customerRequestEvidenceLoadPorts.ts`
- Application slices: `convex/customerRequestProvideFactsPorts.ts`, `…ConfirmRoutePorts.ts`, `…RefinePorts.ts`, `…AuthorizePreparationPorts.ts`, `…CompareResumePorts.ts`, `…StandingRoutePorts.ts`, `…ProblemRoutePorts.ts`
- Capability supply: `convex/capabilitySupplyEligiblePorts.ts`, `…PublicationPorts.ts`, `…GraphPorts.ts`, `…WriterPorts.ts`, `…OperationPorts.ts`
- Inquiry/outbox: `convex/inquirySourceStatePorts.ts`, `inquiryNotificationPorts.ts`, `notificationOutboxSourceStatePorts.ts`, `notificationOutboxPersistence.ts`

**Testing:**
- `tests/unit/customer-request/route-execution/`: Journal/machines/problem thinness + behavior
- `tests/unit/inquiries/`: Host thinness, notification bridge thinness
- `tests/integration/customer-request-v2-multi-capability-route.test.ts`: Start → lease → outcome → cancel paths
- `tests/imports/private-imports.test.ts`: Module privacy

## Naming Conventions

**Files:**
- Module public barrel: `public.ts`
- Actions: `<domain>.actions.ts` (e.g. `inquiry.actions.ts`)
- Server functions: `<domain>.functions.ts`
- Schema fragment: `internal/schema.ts` or `internal/convex-schema.ts`
- Machines: kebab-case verbs (`start-or-resume.ts`, `cancel-current.ts`, `problem-report.ts`)
- Port types in module: `ports.ts`, `cancel-ports.ts`, `problem-ports.ts`
- Convex adapters: `camelCase*Ports.ts` matching host (`customerRequestRouteExecutionCancelPorts.ts`)
- Persistence helpers: descriptive camelCase (`notificationOutboxPersistence.ts`) — not a mutation host sibling chop

**Directories:**
- Domain modules: kebab-case (`customer-request`, `capability-supply`, `notification-outbox`)
- Application slices: kebab-case folders under `application/` (`provide-facts`, `problem-route`, `standing-route`)
- Pure packages under route-execution: `journal/`, `machines/`, `problem-support/`, `evidence-load/`

**Symbols:**
- Port factories: `journalMutationPorts(ctx)`, `cancelMutationPorts(ctx)`, `problemMutationPorts(ctx)`
- Machines exported from `machines/index.ts` with same names as Convex exports (`startOrResume`, `cancelCurrent`, …)
- Host handlers alias machines: `startOrResume as startOrResumeMachine`

## Where to Add New Code

**New public AE operation (action):**
- Primary code: `src/modules/<domain>/<domain>.actions.ts` + `*.functions.ts`
- Register: import + array entry in `src/modules/actions/index.ts`
- Tests: `tests/unit/<domain>/` + surface tests as needed
- Do not expose `agentTools` unless also allowlisted in `src/modules/harness/tool-contract.ts`

**New Customer Request Application slice:**
- Implementation: `src/modules/customer-request/application/<slice>/`
- Ports type: in slice `types.ts`; Convex adapter `convex/customerRequest<Slice>Ports.ts`
- Wire: thin call from `convex/customerRequestApplication.ts`
- Export: re-export via `application/public.ts`
- Pattern reference: `provide-facts/`, `confirm-route/`, `problem-route/`

**New route-execution mutation machine (ADR-011/012 style):**
- Machine: `src/modules/customer-request/route-execution/machines/<verb>.ts`
- Port type: extend existing family or add dedicated `*-ports.ts` (do not bloat journal ports past ~1k adapter lines)
- Adapter: `convex/customerRequestRouteExecution<Family>Ports.ts`
- Host: keep export on `convex/customerRequestRouteExecution.ts` as thin shell only
- Pure decisions: `journal/` or `problem-support/` — never Convex
- Lock: extend `machines-thinness.test.ts` / `journal-thinness.test.ts`
- Forbidden: `customerRequestRouteExecutionStart.ts`-style host siblings; `WritePlan` DTOs

**New Convex table:**
- Define in owning module `internal/schema.ts` or `internal/convex-schema.ts`
- Spread in `convex/schema.ts`
- Indexes: `by_field1_and_field2` field order

**New inquiry server path:**
- Prefer extending `InquiryServerBackend` + factory in `inquiry.functions.ts`
- Local/dev-only: `internal/local-e2e-adapter.ts` behind bypass flag
- Source-state I/O: module ports + `convex/inquirySourceStatePorts.ts` (load/persist split helpers already exist)

**Notification / outbox change:**
- Domain commands: `src/modules/notification-outbox/internal/commands.ts`
- Row mapping / upsert: prefer `convex/notificationOutboxPersistence.ts` (shared)
- Source-state ports: `notificationOutboxSourceStatePorts.ts` → `NotificationOutboxSourceStatePorts`

**Utilities:**
- Cross-module IDs/hashes: `src/modules/common/`
- Dev fixtures / bypass: `src/lib/dev/`, `src/lib/server/local-e2e-bypass`
- Do not put domain orchestration in `src/lib/`

**UI:**
- Prefer Astryx (`@astryxdesign/core`, `@astryxdesign/theme-neutral`) per `DESIGN.md` / `ae-design-system` skill
- Routes under `src/routes/`; operator under `src/routes/_operator/`

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex codegen API/types
- Generated: Yes
- Committed: Yes (repo practice)

**`src/routeTree.gen.ts`:**
- Purpose: TanStack generated route tree
- Generated: Yes
- Committed: Yes

**`src/modules/*/internal/`:**
- Purpose: Private implementation
- Generated: No
- Committed: Yes
- Rule: External modules must import `public.ts` only (`tests/imports/private-imports.test.ts`)

**`src/future-phases/`:**
- Purpose: Cut-over / deferred surface inventory
- Generated: No
- Committed: Yes — not current product claims

**`outputs/`:**
- Purpose: Simulation HTML/JSON artifacts
- Generated: By local simulation runs
- Committed: Often untracked — do not treat as architecture authority

**`.planning/codebase/`:**
- Purpose: GSD architecture maps consumed by plan/execute
- Generated: By `/gsd-map-codebase` mappers
- Committed: Yes after map

## Machine / ports inventory (post Waves 33–37)

| Concern | Module machine | Port type | Convex adapter |
|---------|----------------|-----------|----------------|
| Start/resume | `machines/start-or-resume.ts` | `JournalMutationPorts` | `customerRequestRouteExecutionJournalPorts.ts` |
| Lease | `machines/lease-next-dispatch.ts` | `JournalMutationPorts` | same |
| Outcome | `machines/record-outcome.ts` | `JournalMutationPorts` | same |
| Cancel current | `machines/cancel-current.ts` | `CancelMutationPorts` | `customerRequestRouteExecutionCancelPorts.ts` |
| Open cancel | `machines/cancel-open-attempt.ts` | `CancelOpenPorts` | same |
| Resolve cancel | `machines/cancel-resolve-attempt.ts` | `CancelMutationPorts` | same |
| Report problem | `machines/problem-report.ts` | `ProblemMutationPorts` | `customerRequestRouteExecutionProblemPorts.ts` |
| Business claim | `machines/problem-business-report.ts` | `ProblemMutationPorts` | same |
| Update status | `machines/problem-update-status.ts` | `ProblemMutationPorts` | same |
| Reply | `machines/problem-reply.ts` | `ProblemMutationPorts` | same |

Host residual (still inline in `customerRequestRouteExecution.ts`): `openLeasedDispatch`, `recoverExpiredDispatch`, `markDispatched`, `recordNotReleased`, `markAccepted`, plus several auth-heavy support/business queries. Do not invent Cancel/Problem Convex sibling hosts for these.

## Module count snapshot

- Domain modules under `src/modules/`: ~30 top-level packages
- Convex host files: ~74 entries under `convex/`
- Customer-request `application/` slices: interpret-compile, provide-facts, authorize-preparation, refine, confirm-route, compare-resume, preparation-egress, action-projection, route-plan-projection, problem-route, standing-route

---

*Structure analysis: 2026-07-18 · last_mapped_commit `3463c1d4`*
