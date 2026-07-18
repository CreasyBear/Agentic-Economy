# Codebase Structure

**Analysis Date:** 2026-07-18
**last_mapped_commit:** 19e988f5

## Directory Layout

```
Agentic-Economy/
├── src/
│   ├── routes/              # TanStack file routes (HTTP + pages)
│   ├── modules/             # Domain modules (primary product logic)
│   ├── components/          # UI (prefer Astryx; ae/ legacy behavioral)
│   ├── views/               # Page-level view compositions
│   ├── lib/                 # Shared non-domain helpers (http, server, ui)
│   ├── app/                 # App shells / chat landing experiments
│   ├── server/              # Server bootstrap helpers
│   ├── styles/              # Global styles / tokens glue
│   ├── hooks/               # Shared React hooks
│   ├── router.tsx           # Router factory
│   └── routeTree.gen.ts     # Generated route tree
├── convex/                  # Convex adapters, ports, workers, schema root
│   ├── schema.ts            # Composition root only
│   ├── *Ports.ts            # Thin port implementations
│   ├── customerRequestApplication.ts   # ~1749 — thin actions
│   ├── capabilitySupply.ts             # ~973 — thin supply API
│   ├── customerRequestRouteExecution.ts # ~2463 — journal (machines deferred)
│   └── _generated/          # Generated API / data model
├── tests/                   # unit, integration, e2e, imports, copy, …
├── examples/                # Routing edge, provider, agent prototypes
├── eval/                    # Answer / product eval harnesses
├── tools/                   # Release/dev smoke and verification scripts
├── scripts/                 # Misc operational scripts
├── docs/                    # Human architecture / agent docs
├── .planning/               # ADRs, phases, records, this codebase map
├── .agents/skills/          # AE project skills (actions, Convex, routing)
├── public/                  # Static assets
└── package.json
```

## Directory Purposes

**`src/modules/`:**
- Purpose: All durable domain logic and public operation contracts
- Contains: per-domain folders with `public.ts`, `*.actions.ts`,
  `*.functions.ts`, `application/`, `internal/`, optional `route-execution/`
- Key files: `src/modules/actions/index.ts`,
  `src/modules/customer-request/application/public.ts`,
  `src/modules/capability-supply/public.ts`,
  `src/modules/harness/tool-contract.ts`

**`src/modules/customer-request/`:**
- Purpose: Customer Request lifecycle — interpret, compile, prepare, confirm,
  run, problems, standing route
- Contains:
  - `application/<slice>/` — deepened use-cases (Waves 1–22)
  - `route-execution/journal/` — pure journal integrity/decisions/export
  - `route-execution/problem-support/` — problem decisions/projections
  - root helpers (`interpreter.ts`, `customer-projection.ts`,
    `route-mandate*.ts`, `runtime.ts`, …)
  - `internal/*schema*` — Convex table fragments
- Key files: `application/public.ts`, `customer-request.actions.ts`,
  `customer-request.functions.ts`

**`src/modules/capability-supply/`:**
- Purpose: Routeable supply — binding, offering, eligibility, publication,
  quarantine, operation ledger, transport admission
- Contains: `public.ts`, `server.ts`, `route-transport-runtime.ts`,
  `internal/{binding,offering,eligibility,publication,quarantine,operation-ledger,shared}/`
- Key files: `internal/eligibility/ports.ts`,
  `internal/operation-ledger/commands.ts`, `internal/convex-schema.ts`

**`convex/`:**
- Purpose: Thin runtime adapters after deepen; validators; workers; authz
- Contains: `*Ports.ts` (~1k lines total across Customer Request + supply
  ports), domain Convex files, crons, generated code
- Key files: `schema.ts`, `customerRequestApplication.ts`,
  `capabilitySupply.ts`, `customerRequestRouteExecution.ts`,
  `customerRequestV2*.ts`, `customerRequestRouteMandate*.ts`

**`src/routes/`:**
- Purpose: File-based routes for pages and JSON APIs
- Contains: `api.requests*`, `api.v1.requests*`, `api.businesses*`,
  `api.answer*`, discovery, notification, sandbox, registry pages
- Key files: `api.requests.ts`, `llms[.]txt.ts`, `__root.tsx`

**`tests/`:**
- Purpose: Executable evidence for modules and adapters
- Contains: `unit/<domain>/`, `integration/`, `e2e/`, `imports/`,
  `deploy-smoke/`, `ui-contract/`, `copy/`
- Key files: `tests/imports/private-imports.test.ts`,
  `tests/unit/customer-request/`, `tests/unit/capability-supply/`

**`.planning/`:**
- Purpose: Product/planning authority and generated maps
- Contains: `adr/`, `phases/`, `records/`, `codebase/`, `specs/`
- Key files: `records/KNOWLEDGE-INDEX.md`, `codebase/ARCHITECTURE.md`

## Key File Locations

**Entry Points:**
- `src/router.tsx`: App router bootstrap
- `src/routes/api.requests*.ts` / `api.v1.requests*.ts`: Customer Request HTTP
- `src/routes/api.businesses*.ts`: Public registry JSON
- `src/modules/actions/index.ts`: Central action registry
- `convex/customerRequestApplication.ts`: Customer Request Convex actions
- `convex/capabilitySupply.ts`: Capability supply Convex API
- `convex/customerRequestRouteExecution.ts`: Route journal internals

**Configuration:**
- `package.json`: scripts and dependencies
- `vite.config.ts`: Vite / TanStack Start build
- `tsconfig.json`: TypeScript paths (`@/` → `src/`)
- `convex/schema.ts`: Schema composition root
- `convex/auth.config.ts`: Auth provider config (no secrets in docs)

**Core Logic (deepened):**
- `src/modules/customer-request/application/interpret-compile/`
- `src/modules/customer-request/application/provide-facts/`
- `src/modules/customer-request/application/refine/`
- `src/modules/customer-request/application/compare-resume/`
- `src/modules/customer-request/application/confirm-route/`
- `src/modules/customer-request/application/standing-route/`
- `src/modules/customer-request/application/authorize-preparation/`
- `src/modules/customer-request/application/preparation-egress/`
- `src/modules/customer-request/application/problem-route/`
- `src/modules/customer-request/application/route-plan-projection/`
- `src/modules/customer-request/application/action-projection/`
- `src/modules/customer-request/route-execution/journal/`
- `src/modules/customer-request/route-execution/problem-support/`
- `src/modules/capability-supply/internal/binding/`
- `src/modules/capability-supply/internal/offering/`
- `src/modules/capability-supply/internal/eligibility/`
- `src/modules/capability-supply/internal/publication/`
- `src/modules/capability-supply/internal/operation-ledger/`
- `src/modules/capability-supply/internal/quarantine/`

**Thin Convex ports:**
- `convex/customerRequestProvideFactsPorts.ts`
- `convex/customerRequestCompareResumePorts.ts`
- `convex/customerRequestConfirmRoutePorts.ts`
- `convex/customerRequestAuthorizePreparationPorts.ts`
- `convex/customerRequestRefinePorts.ts`
- `convex/customerRequestStandingRoutePorts.ts`
- `convex/customerRequestProblemRoutePorts.ts`
- `convex/capabilitySupplyEligiblePorts.ts`
- `convex/capabilitySupplyWriterPorts.ts`
- `convex/capabilitySupplyPublicationPorts.ts`
- `convex/capabilitySupplyOperationPorts.ts`

**Testing:**
- `tests/unit/customer-request/` — application composition and projections
- `tests/unit/capability-supply/` — supply commands and eligibility
- `tests/integration/` — cross-module / Convex-backed flows
- `convex/customerRequestRouteMandate.test.ts` — mandate integration suite

## Naming Conventions

**Files:**
- `public.ts` — cross-module barrel (required seam)
- `<domain>.actions.ts` — `ActionDefinition` consts
- `<domain>.functions.ts` — TanStack server fns + Convex source adapters
- `internal/*.ts` — private implementation
- `internal/schema.ts` or `internal/convex-schema.ts` — table fragments
- `application/<kebab-slice>/` — Customer Request use-case slice
  (`index.ts`, verb file, `types.ts`)
- `convex/<camelCase>.ts` — Convex function modules
- `convex/<name>Ports.ts` — port factories taking `ActionCtx` / `MutationCtx`
- Route files: TanStack convention `api.requests.$requestRef.facts.ts`

**Directories:**
- kebab-case module names: `customer-request`, `capability-supply`,
  `answer-thread`, `routing-kernel`
- Application slices: kebab-case verbs/nouns
  (`interpret-compile`, `provide-facts`, `standing-route`)
- Capability-supply internals: noun slices
  (`binding`, `offering`, `eligibility`, `publication`, `operation-ledger`)

**Symbols:**
- Functions: camelCase (`provideCustomerRequestFacts`,
  `registerCapabilityOffering`)
- Types: PascalCase (`ProvideFactsPorts`, `EligibleSupplyPorts`)
- Action ids: `"<domain>.<verb>"` strings (`registry.search`,
  customer-request action ids in `customer-request.actions.ts`)
- Convex indexes: `by_field1_and_field2` field order

## Where to Add New Code

**New Customer Request use-case / deepen slice:**
- Primary code: `src/modules/customer-request/application/<slice>/`
  (`types.ts`, verb module, `index.ts`)
- Re-export: `src/modules/customer-request/application/public.ts`
- Convex adapter: keep/extend thin action in
  `convex/customerRequestApplication.ts`
- Ports: new or extended `convex/customerRequest<Slice>Ports.ts`
- Tests: `tests/unit/customer-request/application/`

**New capability-supply command or policy:**
- Implementation: `src/modules/capability-supply/internal/<slice>/`
- Public surface (if cross-module): `src/modules/capability-supply/public.ts`
- Convex: call from `convex/capabilitySupply.ts` via
  `convex/capabilitySupply*Ports.ts`
- Schema: `src/modules/capability-supply/internal/convex-schema.ts` then
  ensure spread in `convex/schema.ts`
- Tests: `tests/unit/capability-supply/`

**New route journal / problem decision (not machines yet):**
- Pure logic: `src/modules/customer-request/route-execution/journal/` or
  `problem-support/`
- Persist/apply: `convex/customerRequestRouteExecution.ts` (machines still
  deferred here — do not invent a second journal runtime)

**New public machine operation (action):**
- Declare: `src/modules/<domain>/<domain>.actions.ts`
- Register: import + array entry in `src/modules/actions/index.ts`
- Quiet door (only if intentional): also
  `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts`
- Server adapter: `<domain>.functions.ts`
- HTTP (if needed): `src/routes/api.*.ts`

**New domain module:**
- Implementation: `src/modules/<kebab-name>/` with `public.ts`,
  `internal/`, optional `*.actions.ts` / `*.functions.ts`
- Schema fragment under `internal/`, spread in `convex/schema.ts`
- Convex adapter file(s) under `convex/`
- Tests under `tests/unit/<kebab-name>/`
- Enforce privacy via existing import tests

**Utilities:**
- Domain-shared: `src/modules/common/`
- Non-domain HTTP/server glue: `src/lib/http/`, `src/lib/server/`
- Do not put product orchestration in `src/lib/`

**UI:**
- Prefer Astryx primitives (`@astryxdesign/*`, `src/components/astryx/`)
- Views: `src/views/`; routes wire views
- Do not extend bespoke `Ae*` presentation components for new UI

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex API and data model types
- Generated: Yes
- Committed: Yes (typical for this repo)

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree
- Generated: Yes
- Committed: Yes

**`src/modules/*/internal/`:**
- Purpose: Private module implementation
- Generated: No
- Committed: Yes — external modules must not import

**`src/modules/customer-request/application/`:**
- Purpose: Deepened Customer Request orchestration (post Waves 1–22)
- Generated: No
- Committed: Yes — import via `application/public.ts` from Convex/tests

**`src/modules/customer-request/route-execution/`:**
- Purpose: Deepened journal helpers + problem-support; machines deferred in
  Convex
- Generated: No
- Committed: Yes

**`examples/` / `eval/` / `outputs/`:**
- Purpose: Prototypes, eval suites, simulation artifacts
- Generated: Partially (outputs)
- Committed: Examples/eval yes; treat `outputs/` as local artifacts unless
  explicitly tracked

**`.agents/skills/`:**
- Purpose: AE skill recipes (actions, Convex guardrails, routing, design)
- Generated: No
- Committed: Yes — follow when adding modules or Convex ports

## Module Inventory (top-level under `src/modules/`)

| Module | Role |
|--------|------|
| `actions` | Central action registry |
| `answer` / `answer-thread` | Model answer loop / legacy thread path |
| `business` | Business entity tables and ops |
| `capability-contract` | Exact contract decision model |
| `capability-contract-registry` | Registered contract documents |
| `capability-supply` | Routeable supply lifecycle |
| `catalog` | Catalog projection tables |
| `common` | Digests, action helpers, shared primitives |
| `customer-request` | Request → route → run application |
| `demand` | Intent capture (not the neutral compiler) |
| `dev` | Dev-only helpers |
| `discovery` | `llms.txt`, discovery projections |
| `governed-action` | Governed action primitives |
| `harness` | Tool contracts, run loop, approval policy |
| `inquiries` | Qualified inquiry write/read |
| `lifecycle` | Lifecycle helpers |
| `network-guard` | Network admission helpers |
| `notification-outbox` | Outbox dispatch tables |
| `observability` | Funnel / telemetry projections |
| `product` | Product copy/status helpers |
| `provider-integrations` | Provider adapters (e.g. shipping) |
| `registry` | Public business registry search/detail |
| `routing-kernel` | Neutral routing kernel inventory |
| `routing-tracer` | Routing trace helpers |
| `sandbox-supply` | Sandbox provider/supply fixtures |
| `security` | Security tables / envelopes |
| `seo` | SEO helpers |
| `settings` | Owner notification preferences |
| `storefront` | Storefront draft import |

## Deepen Snapshot (god-file sizes)

| Convex adapter | Approx. lines | Deepened target |
|----------------|---------------|-----------------|
| `convex/customerRequestApplication.ts` | ~1749 | `src/modules/customer-request/application/**` |
| `convex/capabilitySupply.ts` | ~973 | `src/modules/capability-supply/internal/**` |
| `convex/customerRequestRouteExecution.ts` | ~2463 | `route-execution/journal` + `problem-support`; **journal machines deferred** |

When adding code: prefer the deepened module path. Extend Convex only for
validators, auth, and port wiring.

---

*Structure analysis: 2026-07-18*
*last_mapped_commit: 19e988f5*
