# Codebase Structure

**Analysis Date:** 2026-08-19

## Directory Layout

```
Agentic-Economy/
├── src/
│   ├── start.ts                 # TanStack Start middleware + createStart
│   ├── router.tsx               # Router factory over generated route tree
│   ├── routeTree.gen.ts         # Generated — do not edit
│   ├── routes/                  # File-based UI + HTTP adapters
│   │   ├── __root.tsx
│   │   ├── index.tsx            # /  (q → /t/new)
│   │   ├── t.new.tsx            # /t/new Answer composer
│   │   ├── t.$threadId.tsx      # Durable thread
│   │   ├── s.$shareToken.tsx    # Read-only share
│   │   ├── $slug.tsx            # Public business
│   │   ├── claim*.tsx
│   │   ├── operations.$operationRef.tsx
│   │   ├── mcp.ts               # POST|DELETE /mcp
│   │   ├── api.v1.operations.call.ts
│   │   ├── api.v1.market-operations.*.ts
│   │   ├── api.answer.*.ts
│   │   ├── _operator/           # Owner + admin + agent-access UI
│   │   └── [.]well-known/       # UCP, OAuth resource, HTTP signatures
│   ├── modules/                 # Domain kernel + proving ground
│   ├── components/
│   │   ├── ae/                  # Product UI
│   │   ├── ui/                  # Primitives (shadcn-style)
│   │   └── ai-elements/         # Chat suggestion/shimmer/code-block
│   ├── lib/
│   │   ├── server/              # Host-only seams
│   │   ├── http/                # Headers, cookies, agent negotiation
│   │   ├── observability/
│   │   ├── operator/
│   │   ├── client/
│   │   ├── claim/
│   │   └── errors.ts            # RFC 9457 model
│   ├── content/brand-copy.ts
│   ├── hooks/
│   └── styles/globals.css
├── convex/                      # Durable functions + schema composition
│   ├── schema.ts
│   ├── convex.config.ts
│   ├── http.ts                  # routing-v1 410s
│   ├── crons.ts
│   ├── _generated/              # Codegen — do not edit
│   └── *.ts                     # Per-area functions
├── tools/
│   ├── ae/                      # Market CLI adapter
│   ├── dev/                     # Local smokes, evidence packets, papercut
│   └── release/                 # Frontier/kernel manifests, hosted smokes
├── tests/
│   ├── unit/ integration/ e2e/ seo/ imports/ types/ ui-contract/
│   ├── eval/ deploy-smoke/ helpers/ fixtures/ setup/
├── eval/                        # Promptfoo / quality / braintrust cases
├── public/                      # Brand + illustrations
├── .planning/                   # GSD docs (not imported by runtime)
├── .agents/skills/              # Project skills
├── .env.example                 # Env names only
├── package.json
├── tsconfig.json                # @/* → src/*
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

## Directory Purposes

**`src/routes/`:**
- Purpose: TanStack file routes. Pages render React; APIs expose `server.handlers`.
- Contains: One module per URL. Dots in filenames become path segments (`api.v1.operations.call.ts` → `/api/v1/operations/call`).
- Key files: `src/start.ts` (not under routes) owns middleware. `src/routes/api.$.ts` is the `/api/**` 404 catch-all.

**`src/modules/`:**
- Purpose: Bounded contexts. Kernel, demand proving ground, owner tooling, shared `common` / `actions`.
- Contains: `public.ts`, optional `server.ts` / `convex.ts` / `testing.ts`, `*.actions.ts`, `*.functions.ts`, private `internal/`.
- Key files: `src/modules/actions/index.ts` (registry), `src/modules/common/action.ts` (contract).

**`src/lib/server/`:**
- Purpose: Node-only HTTP/Convex/MCP/auth adapters. Never import from client components.
- Contains: `convex-source.ts`, `operation-invoke-api.ts`, `mcp-api.ts`, `source-write-admission.ts`, `agent-access-auth.ts`, `rate-limit.ts`, `problem.ts`, notification/stripe helpers, retired Customer Request `customer-request-gone.ts`.
- Key files: `operation-invoke-api.ts` is the paid gateway implementation behind `/call`.

**`src/components/ae/`:**
- Purpose: Product UI grouped by surface (`chat/`, `claim/`, `supply/`, `inquiries/`, `offerings/`, `layout/`, `operator/`, `console/`, `work-tree/`, `artifacts/`).
- Contains: `Ae*.tsx` plus colocated view-models (`answer-stream.ts`, `answer-turn-state.ts`).
- Key files: `src/components/ae/chat/AeChat.tsx`, `AeAnswerPromptInput.tsx`, `AeSuggestionChips.tsx`.

**`convex/`:**
- Purpose: Source of truth. Schema spreads module table bundles. Functions enforce source-write and authz.
- Contains: Area files (`capabilityOperationInvocations.ts`, `answerThreads.ts`, `registry.ts`, `moneyLedger.ts`, `business.ts`, `discovery.ts`, …). Node worker: `capabilityOperationInvocationWorker.ts`.
- Key files: `schema.ts`, `sourceWriteAdmission.ts`, `authz.ts`, `marketDispatchWorkpool.ts`.

**`tools/ae/`:**
- Purpose: External-agent-shaped CLI over public HTTP.
- Contains: `cli.ts`, `commands/*.ts`, `lib/args.ts` / `output.ts`.
- Key files: `commands/invoke.ts`, `commands/search.ts`, `commands/ask.ts`, `commands/manifest.ts`.

**`tests/`:**
- Purpose: Vitest + Playwright. Import scanners live in `tests/imports/`.
- Contains: Mirror of domain names under `tests/unit/<area>/`.
- Key files: `tests/imports/private-imports.test.ts`, `route-boundary.test.ts`, `capability-supply-boundaries.test.ts`.

**`eval/`:**
- Purpose: Answer/toolcall/quality eval cases. Not production runtime.
- Contains: `eval/answer/promptfooconfig.yaml`, `eval/answer/lib/{cases,evaluators,coverage,scoring}.ts`.
- Key files: `eval/answer/lib/cases.ts` is the source contract for expected tools/routes.

## Key File Locations

**Entry Points:**
- `src/start.ts`: Host middleware (correlation, API boundary, Sentry/PostHog, CSP, agent markdown, CSRF, source-write, Clerk).
- `src/router.tsx`: `createRouter({ routeTree })`.
- `src/routes/mcp.ts`: MCP HTTP door.
- `src/routes/api.v1.operations.call.ts`: Paid invoke door → `src/lib/server/operation-invoke-api.ts`.
- `src/routes/api.answer.turn.ts`: Answer SSE/UI-stream door → `src/modules/answer-thread/server.ts`.
- `tools/ae/cli.ts`: CLI entry (`npm run ae`).
- `convex/schema.ts`: Table composition.
- `convex/http.ts`: Retired routing-v1 + Convex `/mcp` 410s (live MCP is Start `/mcp`).

**Configuration:**
- `package.json`: Scripts (`dev`, `ae`, `test:*`, `seed:dev`).
- `tsconfig.json`: Paths `@/*` and `~/*` → `src/*`; operator aliases `@/routes/owner.*` → `src/routes/_operator/owner.*`.
- `vite.config.ts`: `tanstackStart()` + `nitro()` (Vercel Node).
- `convex/convex.config.ts`: workflow, workpool, rateLimiter, aggregate; optional Convex env names.
- `convex/auth.config.ts`: Clerk JWT issuer.
- `.env.example`: Environment variable names. `.env` / `.env.*` secret files: note existence only if present locally; never commit or quote values.

**Core Logic — market kernel:**
- `src/modules/capability-contract/public.ts`: Contract format `ae.capability-contract:v2`.
- `src/modules/capability-supply/public.ts`: Operation refs, eligibility, publication types.
- `src/modules/capability-supply/operation-source.ts`: Search/detail/compare/inspect-plan readers.
- `src/modules/registry/operations.actions.ts` + `operation-action-contracts.ts`: Discovery actions.
- `src/modules/capability-execution/operation-invoke.ts`: Invoke application service.
- `src/modules/capability-execution/operation-invoke-entry.ts`: Path/method/scope constants (`/api/v1/operations/call`).
- `src/modules/capability-execution/operation-execute.functions.ts`: Keyless executor.
- `src/modules/capability-execution/operation-execute.server.ts`: Guarded fetch wrapper.
- `src/modules/action-invocation/`: Durable claim/lease/reconcile.
- `src/modules/money/public.ts` + `server.ts`: Ledger + Stripe host fns.
- `src/modules/agent-access/contract.ts`: `MARKET_OPERATIONS_INVOKE_SCOPE`.
- `src/modules/network-guard/public.ts`: SSRF allowlist.
- `src/modules/harness/public.ts`: Run loop.
- `src/modules/model-gateway/public.ts`: OpenRouter.

**Core Logic — Answer proving ground:**
- `src/modules/answer/public.ts`: Gate, preflight, presentation, artifacts.
- `src/modules/answer/server.ts`: `runAnswerToolUseAgent` only (Node/LLM).
- `src/modules/answer/catalog-example-asks.ts`: Landing example queries.
- `src/modules/answer/internal/answer-tool-use-agent.ts`: Bounded AI SDK tool loop.
- `src/modules/answer/internal/answer-navigation-policy.ts`: Forced search → detail; effect budget.
- `src/modules/answer-thread/public.ts`: Session, share, projections, `classifyFollowUpIntent`.
- `src/modules/answer-thread/server.ts`: `streamAnswerTurn`, reserve/stop, digests.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Lease-bound phases.
- `src/modules/answer-thread/internal/answer-tool-registry.ts`: Read-tool allowlist.
- `src/modules/answer-thread/answer-thread.schema.ts`: `ANSWER_READ_TOOL_IDS`.
- `src/modules/answer-thread/client.ts`: Empty placeholder (`export {}`) — browser code lives in `src/components/ae/chat/`.

**Core Logic — catalog / owner / inquiries:**
- `src/modules/catalog/public.ts`, `owner-claim.functions.ts`, `claim-draft.ts`
- `src/modules/business/public.ts`, `src/modules/business/internal/claim.ts`
- `src/modules/storefront/storefront.functions.ts`, `server.ts` (SSRF-safe HTML import)
- `src/modules/inquiries/public.ts`, `inquiry.actions.ts`, `inquiry.functions.ts`
- `src/modules/discovery/public.ts`, `developer-discovery-route.ts`
- `src/modules/work-tree/public.ts`, `work-tree.functions.ts`, `human-root.functions.ts`
- `src/modules/study/public.ts`
- `src/modules/product-frontier/quarantine-write-admission.ts`

**Testing:**
- `tests/unit/<module>/`: Deterministic module tests.
- `tests/integration/`: Convex-test / route / Answer turn.
- `tests/e2e/`: Playwright (`tests/e2e/landing-answer.spec.ts`, `thread-first.spec.ts`, …).
- `tests/imports/`: Architectural scanners.
- `tests/eval/answer-pipeline.test.ts`: Eval case/coverage wiring.
- `tests/helpers/`: OpenRouter contract server, Answer thread test port, fixtures.

## Naming Conventions

**Files:**
- Domain module folder: kebab-case matching the bounded context (`capability-supply`, `answer-thread`).
- Public seam: `public.ts`. Host-only extras: `server.ts`. Convex helpers: `convex.ts`. Test-only ports: `testing.ts`.
- Machine contracts: `<area>.actions.ts` (`registry.operations.actions.ts` pattern as `operations.actions.ts`).
- TanStack server functions: `<area>.functions.ts` using `createServerFn`.
- Schema values: `internal/schema.ts` or `internal/convex-schema.ts`; re-exported via `public.ts` when needed.
- Routes: TanStack file-route names — `api.v1.operations.call.ts`, `$slug.tsx`, `_operator/owner.supply.tsx`, `[.]well-known/ucp.ts`.
- Product components: `Ae` prefix (`AeChat.tsx`). Primitives under `src/components/ui/` stay unprefixed.
- Tests: `*.test.ts` / `*.test.tsx` (Vitest), `*.spec.ts` (Playwright).

**Directories:**
- `internal/` is private to that module. Routes and sibling modules import `public.ts` or documented root files, never `internal/`.
- `_operator/` is a pathless layout (`src/routes/_operator.tsx`) wrapping owner/admin/developer/agent-access pages.
- `src/lib/server/` vs `src/lib/client/` vs `src/lib/http/`: runtime split is the name.

**Symbols:**
- Actions: dotted ids (`operation.invoke`, `registry.operations.search`).
- MCP tools: `ae_` + dots to underscores (`ae_operation_invoke`).
- Public operation refs: `operation:v1:` + 64 hex.
- Source-write version: `source-write:v2`.
- Path alias: `@/modules/...` (prefer `@/` over `~/`).

## Where to Add New Code

**New Market Operation contract / supply behavior:**
- Primary code: `src/modules/capability-contract/` (schema/effects) and `src/modules/capability-supply/internal/{publication,binding,eligibility}/`.
- Public types: export from `src/modules/capability-supply/public.ts`.
- Convex tables: add to `src/modules/capability-supply/internal/convex-schema.ts` and spread in `convex/schema.ts`.
- Convex functions: `convex/capabilitySupply*.ts` — keep writers thin; commands live in the module.
- Tests: `tests/unit/capability-supply/`, `tests/integration/capability-publication*.test.ts`.

**New discoverable machine API (search/detail/invoke-style):**
- Define `defineAction` in `src/modules/<area>/<area>.actions.ts`.
- Register in the array in `src/modules/actions/index.ts` (explicit import; unique id).
- HTTP: add `src/routes/api.v1.<path>.ts` that bounds JSON, rate-limits, and calls `action.run`. Reuse `src/lib/server/problem.ts`.
- MCP: set `surfaces` to include `'mcp'` if the tool should appear; adapter picks it up via `listMcpActions()`.
- CLI: add `tools/ae/commands/<name>.ts` and wire `COMMANDS` in `tools/ae/cli.ts`.
- Tests: `tests/unit/actions/`, `tests/unit/server/`, `tests/unit/market-terminal/`.

**Paid invoke / recovery change:**
- Kernel: `src/modules/capability-execution/operation-invoke.ts` + `operation-invoke-contracts.ts`.
- Durability: `src/modules/action-invocation/` + `convex/capabilityOperationInvocations.ts` + worker.
- HTTP: keep `/api/v1/operations/call` as the only paid path (`operation-invoke-entry.ts`). Do not revive `/execute`.
- Host adapter: `src/lib/server/operation-invoke-api.ts` (HTTP, MCP, and Answer authenticated context share `createOperationInvokeService`).
- Tests: `tests/unit/capability-execution/`, `tests/unit/action-invocation/`, `tests/unit/server/operation-invoke-api.test.ts`.

**New Answer behavior (proving ground only):**
- Tool loop / prompts / gate: `src/modules/answer/internal/` and export via `public.ts` or `server.ts`.
- Turn lifecycle / persistence: `src/modules/answer-thread/internal/` + `convex/answerThreads.ts`.
- UI: `src/components/ae/chat/`. Landing examples: `src/modules/answer/catalog-example-asks.ts`.
- Do not import `capability-supply` from `answer`. Use registry actions + `capability-execution`.
- Tests: `tests/unit/answer/`, `tests/unit/answer-thread/`, `tests/unit/chat/`, `eval/answer/lib/cases.ts`.

**New public page:**
- Route: `src/routes/<path>.tsx` with `createFileRoute`.
- Loader data: a `*.functions.ts` server fn that uses `convex-source`.
- UI: `src/components/ae/<surface>/Ae*.tsx` inside `AePublicShell` or `AeOperatorShell`.
- Copy: `src/content/brand-copy.ts`.
- SEO: `src/modules/seo/public.ts` + discovery files if crawlable.

**New owner/admin screen:**
- Route under `src/routes/_operator/` (`owner.*` or `admin.*`).
- Authz: `convex/authz.ts` + `src/modules/security/public.ts`.
- Tests: `tests/unit/routes/`, `tests/e2e/public-owner-ui.spec.ts`.

**New Convex function:**
- Implementation file in `convex/` matching the area (`inquiries.ts`, `moneyLedger.ts`, …).
- Validators exact; use `requireSourceWrite` for mutations (`convex/sourceWriteAdmission.ts`).
- Domain logic in `src/modules/**`; Convex file admits, transacts, and calls module helpers (`convex.ts` barrels).
- Read `convex/_generated/ai/guidelines.md` before writing Convex APIs.

**New shared helper:**
- Cross-module pure utils: `src/modules/common/` (canonical digest, bounded JSON, ids).
- HTTP-only: `src/lib/server/` or `src/lib/http/`.
- UI-only: `src/lib/ui/` or colocated next to the component.
- Do not put kernel policy in `src/lib/`.

**Utilities:**
- Shared helpers: `src/modules/common/` (prefer) or `src/lib/utils.ts` (cn/classnames only).
- Errors: extend `src/lib/errors.ts` kinds/codes; do not invent a parallel envelope.

**Quarantined / parked — do not grow as live HTTP:**
- Customer Request routes under `src/routes/api.v1.requests.*` and `api.requests.*` (410).
- `src/modules/routing-kernel/` (v1 retired).
- `src/modules/project-spine/` (WorkTree is the successor surface).
- `src/lib/server/customer-request-*.ts` exist as tombstone/parity adapters — do not add new CR planners.

## Module public / internal / server split

Use this layout for every domain module:

```
src/modules/<name>/
├── public.ts              # Types + functions safe for routes and siblings
├── server.ts              # Optional: Node fetch, Stripe, x402, LLM agent
├── convex.ts              # Optional: helpers Convex function files import
├── testing.ts             # Optional: eval/test ports only
├── <name>.actions.ts      # defineAction exports
├── <name>.functions.ts    # createServerFn loaders/commands
└── internal/              # Private. Import scanners forbid crossing this.
```

**Rules:**
- Routes import `@/modules/<name>/public` or a documented root module file (`operation-invoke-entry.ts`, `catalog-example-asks.ts`). Never `@/modules/<name>/internal/...`.
- `server.ts` is for host/Node. Client components import `public.ts` and chat-local files only.
- `answer-thread/testing.ts` is the in-memory port for eval — not production Convex.
- Re-export internals from `public.ts` when another module needs them; do not poke through.

**Convex vs app-server boundary:**
- **Convex** owns durable rows, CAS, leases, Workpool, crons. Function names are `anyApi` strings like `capabilityOperationInvocations:invoke` (`src/lib/server/operation-invoke-api.ts`).
- **App-server** (TanStack Start on Nitro Node) owns HTTP, Clerk, MCP transport, SSE, cookies, RFC 9457, minting source-write admissions, calling Convex via `ConvexHttpClient` (`src/lib/server/convex-source.ts`).
- **Do not** open a second Convex client in a route file. **Do not** put provider fetch in a Convex mutation (use `"use node"` actions / Workpool worker).
- Schema tables are **defined in modules** (`internal/convex-schema.ts`) and **composed** in `convex/schema.ts`. That composition import is an allowed exception to the private-import scanner.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated file-route tree.
- Generated: Yes (TanStack Router)
- Committed: Yes — regenerate via dev/build, do not hand-edit.

**`convex/_generated/`:**
- Purpose: Convex API/dataModel/server types and `ai/guidelines.md`.
- Generated: Yes (`npx convex codegen`)
- Committed: Yes. `tsconfig.json` excludes it from app `tsc` include overlap; Convex has `convex/tsconfig.json`.

**`.planning/`:**
- Purpose: GSD architecture notes, STATE, research. Runtime must not import it (`planning-runtime-import` scan).
- Generated: No
- Committed: Yes

**`.agents/skills/`:**
- Purpose: Project agent skills (Convex, UI, ponytail).
- Generated: Mixed
- Committed: Yes

**`public/`:**
- Purpose: Static brand assets and category illustrations.
- Generated: No
- Committed: Yes

**`eval/` / `output/`:**
- Purpose: Eval configs vs generated reports. Missing `output/eval/answer-suite-report.json` is not source evidence.
- Generated: reports under `output/`
- Committed: eval sources yes; treat `output/` as artifacts

**`tools/dev/` / `tools/release/`:**
- Purpose: Local evidence, smokes, product-frontier/kernel-retirement manifests.
- Generated: No (except packets they write)
- Committed: Yes

**`node_modules/`, `dist/`, `.output/`:**
- Purpose: Dependencies and build output.
- Generated: Yes
- Committed: No

**`.env.example`:**
- Purpose: Required variable names for local/hosted config.
- Generated: No
- Committed: Yes. Secret `.env` files are not documentation — do not read or quote them.

---

*Structure analysis: 2026-08-19*
