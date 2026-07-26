# Repository Guidelines

## Project Overview

Agentic Economy (AE) is an execution product for agentic commerce: a person's
agent discovers viable businesses, decides inside granted authority, and carries
registered work through external effects, evidence and recovery. It is not a
directory, lead marketplace or chat wrapper.

Authority order when sources disagree: live source and executable behavior for
what exists now → `.planning/PROJECT.md` for product destination → accepted ADRs
under `.planning/adr/` → `.planning/ROADMAP.md`. `UBIQUITOUS_LANGUAGE.md` owns
domain vocabulary — use its terms (Customer Request, Action Invocation,
RoutePlan, RouteMandate, Prepared Action, Approval Grant, Action Attempt) and
avoid the synonyms it explicitly rejects.

Four operating modes gate what an agent may do: `inspect_only`, `approve_each`,
`bounded_mandate`, `full_yolo`.

## Architecture & Data Flow

Deep source-owned modules with thin transport/render adapters:

```
src/routes/*          file-routed HTTP + UI adapters (TanStack Start)
  ↓ imports module public seam only
src/modules/<name>/   source-owned logic: contracts, transitions, projections
  ↓ sourceQuery/sourceMutation ports (src/lib/server/convex-source.ts)
convex/*.ts           validate + authorize + transact; delegates to modules
convex/schema.ts      composition root spreading module-owned *Tables fragments
```

- **Registered actions are the machine seam.** `src/modules/common/action.ts`
  defines the contract (`defineAction`, zod schema, `surfaces`,
  `consequenceClass`, `authorityRequirement`, `retryClass`). Every action must
  be imported and listed in `src/modules/actions/index.ts:39` — module-eval side
  effects are tree-shaken and will not register. Registration alone does not
  create a reachable route; a route/component adapter must call it.
- **Not every write is an action.** Owner/admin/provider/telemetry flows that
  depend on authenticated route context, webhook signatures or source-write
  admission stay TanStack server functions or route handlers
  (`src/modules/actions/index.ts:4-8`).
- **Convex is an adapter layer.** Newer files validate/authorize, build port
  objects and call `src/modules/*` (e.g. `convex/capabilitySupply.ts:659`).
  Older files (`convex/business.ts`, `convex/answerThreads.ts`) still hold
  inline logic and use `queryGeneric`/`mutationGeneric`; do not copy that.
- **No client-side Convex.** There are zero `convex/react` imports in `src/`.
  Data reaches components through route loaders and server functions.
- **Middleware chain** in `src/start.ts:50`: observability → security headers →
  CSRF → source-write admission → Clerk.

## Key Directories

| Path | Purpose |
| --- | --- |
| `src/modules/<name>/` | Source-owned deep modules (~40). Business truth lives here. |
| `src/modules/common/` | `action.ts` (action contract), `result.ts`, ids, digests. |
| `src/routes/` | File-routed pages + `api.*.ts` HTTP handlers; `_operator/` is owner/admin. |
| `src/components/ae/` | Product components by domain (`chat`, `listing`, `offerings`, `harness`…). |
| `src/components/astryx/`, `ai-elements/`, `animate/` | Design-system and primitive wrappers. |
| `src/lib/server/` | `convex-source.ts` transport, source-write admission, E2E bypass. |
| `src/lib/ui/contract-scans.ts` | The static scanners the guard test suites run. |
| `convex/` | Convex functions, `schema.ts`, `http.ts`, `crons.ts`. |
| `tools/ae/`, `tools/dev/`, `tools/release/` | CLI, development evidence packets, release verification. |
| `examples/routing-*` | Edge/provider/agent conformance examples checked by npm scripts. |
| `.planning/` | Charter, roadmap, state, ADRs. Read; do not casually rewrite. |

## Development Commands

```bash
npm run dev                 # vite dev on 127.0.0.1:3000
npm run build               # vite build (Nitro → Vercel Node 20 serverless)
npm run typecheck           # tsc --noEmit
npm run lint                # oxlint src convex tests tools examples --deny-warnings
npm run check:convex-codegen
npm run seed:dev            # convex run devSeed:seedDevCatalog

npm run test:unit           # vitest run tests/unit   (~341 files)
npm run test:integration    # + convex/customerRequestRouteMandate.test.ts, --no-file-parallelism
npm run test:imports        # AE_SCAN_MODE=clean boundary guards
npm run test:ts-standards   # AE_SCAN_MODE=clean TypeScript-hole guards
npm run test:ui-contract    # AE_SCAN_MODE=clean design-token guards
npm run test:e2e            # playwright, own server on :3020
npm run test:all            # full local gate incl. build

npm run ae -- <cmd> [--json]  # exercise AE as an external agent would
npm run audit:actions         # advisory declared-surface drift report (always exit 0)
```

`npm run ae` commands: `search`, `business`, `discover`, `import`, `enrich`,
`ask`, `request`, `actions`, `action`, `journey` (`tools/ae/cli.ts:24`). HTTP
commands need `npm run dev` running and are labelled **local** evidence only.

Prefer the narrowest command that covers your changed boundary. Do not gate
useful work on unrelated broad suites.

## Code Conventions & Common Patterns

**Files & naming.** Modules and libs are kebab-case (`public-inquiry-projection.ts`);
React components are PascalCase, AE ones prefixed `Ae*`
(`src/components/ae/listing/AeProviderListingPage.tsx`). Routes use TanStack's
dotted file routing (`api.requests.$requestRef.run.ts`).

Recurring module file suffixes:

- `public.ts` — the module's only cross-module seam.
- `internal/` — private. **Never import `@/modules/<other>/internal/*`** from a
  route or a sibling module; the `module-private-import` scanner fails the build
  (`src/lib/ui/contract-scans.ts:79`). Only `convex/schema.ts` composition and
  same-module use are allowed.
- `*.actions.ts` — registered action definitions.
- `*.functions.ts` — server functions / source ports (`createServerFn`, `sourceQuery`).
- `internal/schema.ts` or `internal/convex-schema.ts` — the module's `*Tables` fragment.
- `development-*.ts` — labelled local/mock evidence scaffolding, not production paths.

**Error handling.** Discriminated ordinary outcomes, not exceptions. Use
`ModuleResult` from `src/modules/common/result.ts`:

```ts
type Outcome = ModuleResult<'accepted', 'rejected', { ref: string }, { reason: string }>
return error('rejected', /* retryable */ false, { reason: 'expired_mandate' })
```

Throw only for unexpected faults. Errors carry an explicit `retryable` flag.

**Types.** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
`useUnknownInCatchVariables` (`tsconfig.json:10-14`). The `ts-standards` scanner
additionally rejects `any`, `as unknown as`, non-null `!`, `v.any()` outside
three documented boundaries, `status: string` (use literal unions), hard-coded
`csrf-*` literals, and `VITE_AE_SOURCE_WRITE_SECRET`.

**Action definition shape** (`src/modules/registry/registry.actions.ts`): a zod
schema with `.describe()` on every field (the descriptions become the agent tool
descriptor via `describeActionForAgent`), then `defineAction({ id, schema,
surfaces, run })`.

**Convex.** Read `convex/_generated/ai/guidelines.md` before editing. Put new
tables in the owning module's `*Tables` object and spread them in
`convex/schema.ts`. Name compound indexes in field order
(`.index('by_invocationRef_and_attemptNumber', ['invocationRef', 'attemptNumber'])`).
Public decorators are internet-exposed — use internal ones for state and worker
seams. Isolate Node built-ins in dedicated `"use node"` action/port files
(pattern: `customerRequestV2PreparationEgress.ts` action +
`…ActionPorts.ts` Node I/O + `…State.ts` non-Node persistence). A single
top-level `node:*` import in a shared module breaks bundling for every Convex
function that imports anything from it.

**UI.** Astryx with the neutral theme plus the semantic-token bridge.
`src/styles/tokens.css` is a retiring legacy shim — new UI uses Astryx tokens.
The `ui-contract` scanner rejects raw hex/`rgb()`/`hsl()`, Tailwind palette
colors, `space-x/y-*` (use `gap`), `transition-all`, `shadow-{sm..2xl}`,
`z-40/50/3-digit`, `bg-black/NN`, arbitrary `rounded-[…]`, and route-local
scroll listeners. `src/components/ui` is exempt.

**Routes.** Cannot import `convex/schema`, `convex/browser|server`, module
`internal/*`, or provider SDKs (`stripe`, `openai`, `@ai-sdk/*`, `x402`) —
`scanRouteBoundaries` (`src/lib/ui/contract-scans.ts:89`).

## Important Files

- `src/start.ts` — request middleware chain.
- `src/router.tsx` — router creation; `src/routeTree.gen.ts` is generated, never edit.
- `src/modules/actions/index.ts` — the action registry.
- `src/modules/common/action.ts` / `result.ts` — action and outcome contracts.
- `src/lib/server/convex-source.ts` — `sourceQuery`/`sourceMutation`/`sourceAction` ports.
- `src/lib/ui/contract-scans.ts` — every architecture scanner rule, in one place.
- `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`.
- `vite.config.ts` (TanStack Start + Nitro + Tailwind + conditional Sentry),
  `tsconfig.json`, `.oxlintrc.json`, `vitest.config.ts`, `playwright*.config.ts`.
- `.github/workflows/kernel-release-gate.yml` — `source-proof` runs
  `npm run test:release:source`; `hosted-proof` deploys and reads back on `main` only.
- `docs/agents/domain.md`, `docs/agents/issue-tracker.md`,
  `docs/agents/triage-labels.md`, `docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`.

## Runtime/Tooling Preferences

- **Node, not Bun.** No Bun lockfile, config or script exists. CI runs Node 22;
  the Vercel function pins Node 20 (`vite.config.ts:93-100`). No root `engines`
  field — match CI (22) locally.
- **npm only**, pinned `npm@11.5.1` (`package.json:132`); lockfile v3; CI uses `npm ci`.
- ESM throughout (`"type": "module"`). Path aliases `@/*` and `~/*` → `src/*`.
- Stack: TanStack Start 1.168 / Router 1.170, React 19, Convex 1.42, Vite 8,
  Vitest 4, Playwright 1.61, TypeScript 6, Clerk auth, Astryx design system,
  oxlint. `tsx` runs the TypeScript tools.
- `vendor/handshake-protocol-kernel` is historical provenance, not an installed
  dependency.

## Testing & QA

Vitest (node environment, `globals: false` — import `describe/it/expect` from
`vitest`; setup `tests/setup/web-storage.ts`) and Playwright.

| Suite | What it is |
| --- | --- |
| `tests/unit/` (~341) | Fast source tests, mirrored by module name. |
| `tests/integration/` (~42) | Cross-boundary; `--no-file-parallelism` (shared backend state). |
| `tests/imports/` (14) | **Architecture guards** — boundaries, TS standards, retirement manifests. |
| `tests/ui-contract/`, `tests/seo/` | Design-token and SEO contract scans. |
| `tests/e2e/` | Playwright, own dev server on :3020, Clerk bypassed locally. |
| `tests/deploy-smoke/` | Runs against a **deployed** URL with credentials; not local. |
| `tests/eval/`, `eval/answer/` | Answer-quality evals (promptfoo). |

Guard suites run in two modes: `AE_SCAN_MODE=clean` asserts the real tree is
violation-free; `AE_SCAN_MODE=fixtures` asserts each rule still fires against
`tests/fixtures/bad-*`. If you add a rule, update both.

No coverage threshold is configured — coverage is not the gate; the guard suites
and the release gate are.

**Verification expectations.** Prove the changed boundary: run it, don't just
assert it compiles. Bug fix → reproduce, fix, confirm. UI → drive it. New
observable contract → add a test. Record unrelated pre-existing failures rather
than absorbing them.

**Evidence classes never silently upgrade.** Source inspection < fixtures <
labelled local/mock/sandbox execution < hosted readback at an exact revision <
independently operated provider evidence < real customer evidence. Say which
class your result belongs to. A receipt proves the event it names, not later
fulfilment.

**Working rules.** Preserve unrelated dirty work; never hard-reset, bulk-restore
or permanently delete files. Bound growing reads, retries and fan-out. During a
suspected Convex cost incident, use static/local inspection only — do not probe,
seed or deploy without explicit authorization.
