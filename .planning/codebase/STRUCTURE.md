---
last_mapped_commit: abcc85a8aba390f337f35314c7f94063a73af204
---
<!-- refreshed: 2026-08-21 -->
# Codebase Structure

**Analysis Date:** 2026-08-21

> Mapped against the **current working tree**, not git HEAD. The tree carries a large uncommitted refactor: big Convex modules were split into focused sibling files, `src/modules/capability-supply/internal/` gained importer/probe/transport splits, and the inquiries / work-tree / study / demand / project-spine / customer-request families were **deleted** (including their routes, components, Convex files, and `src/modules/demand/`). Do not reference deleted paths as live.

## Directory Layout

```
Agentic-Economy/
├── src/
│   ├── start.ts                 # TanStack Start middleware + createStart
│   ├── router.tsx               # Router factory over generated route tree
│   ├── routeTree.gen.ts         # Generated — do not edit
│   ├── routes/                  # File-based UI + HTTP adapters
│   │   ├── __root.tsx
│   │   ├── index.tsx            # /  (ask composer; ?q= deep link)
│   │   ├── t.new.tsx            # /t/new Answer composer
│   │   ├── t.$threadId.tsx      # Durable thread
│   │   ├── s.$shareToken.tsx    # Read-only share
│   │   ├── $slug.tsx            # Public business
│   │   ├── claim*.tsx
│   │   ├── operations.$operationRef.tsx
│   │   ├── operations.invocations.$invocationRef.tsx  # Owner invocation status UI
│   │   ├── mcp.ts               # POST|DELETE /mcp
│   │   ├── api.v1.operations.call.ts
│   │   ├── api.v1.operations.execute.ts   # 410 tombstone
│   │   ├── api.v1.market-operations.*.ts
│   │   ├── api.answer.*.ts
│   │   ├── _operator/           # Owner + admin + agent-access UI
│   │   └── [.]well-known/       # UCP, OAuth metadata, HTTP signature directory
│   ├── modules/                 # Domain kernel + proving ground
│   ├── components/
│   │   ├── ae/                  # Product UI
│   │   ├── ui/                  # Primitives (shadcn-style)
│   │   └── ai-elements/         # Chat suggestion/shimmer/code-block
│   ├── lib/
│   │   ├── server/              # Host-only seams (Convex, MCP, invoke, Stripe, notifications)
│   │   ├── http/                # Headers, cookies, agent negotiation
│   │   ├── observability/
│   │   ├── operator/
│   │   ├── client/
│   │   ├── claim/
│   │   ├── deployment/          # manifest.ts
│   │   ├── ui/                  # Import scanners (`contract-scans.ts`)
│   │   └── errors.ts            # RFC 9457 model
│   ├── content/brand-copy.ts
│   ├── hooks/
│   └── styles/globals.css
├── convex/                      # Durable functions + schema composition
│   ├── schema.ts                # 15 spreads → 51 listed tables
│   ├── convex.config.ts
│   ├── http.ts                  # routing-v1 410s
│   ├── crons.ts
│   ├── _generated/              # Codegen — do not edit
│   ├── lib/rateLimit.ts         # Convex rate-limiter names
│   └── *.ts                     # Per-area validators + split handler files
├── tools/
│   ├── ae/                      # Market CLI adapter
│   ├── dev/                     # Local smokes, evidence packets, papercut
│   ├── graphify/
│   └── release/                 # Frontier/kernel manifests, hosted smokes
├── tests/
│   ├── unit/ integration/ e2e/ seo/ imports/ types/ ui-contract/
│   ├── eval/ deploy-smoke/ helpers/ fixtures/ setup/ scripts/
├── eval/                        # Promptfoo / quality / braintrust / parity cases
├── docs/                        # agents/ architecture/ codemap/ (not runtime)
├── public/                      # Brand + illustrations
├── scripts/                     # audit-action-surfaces.mjs
├── examples/ routing-kernel examples
├── vendor/handshake-protocol-kernel/  # Vendored reference kernel (quarantined by import scanner)
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
- Key files: `src/start.ts` (not under routes) owns middleware. `src/routes/api.$.ts` is the `/api/**` 404 catch-all. `src/routes/[.]well-known/ucp.ts` is site discovery (advertises `/api/v1/operations/call`).

**`src/modules/`:**
- Purpose: Bounded contexts. Kernel, Answer proving ground, owner tooling, shared `common` / `actions`.
- Contains: `public.ts`, optional `server.ts` / `convex.ts` / `testing.ts`, `*.actions.ts`, `*.functions.ts`, private `internal/`.
- Key files: `src/modules/actions/index.ts` (registry), `src/modules/common/action.ts` (contract).
- Current top-level modules: `action-invocation`, `actions`, `agent-access`, `answer`, `answer-thread`, `business`, `business-tools`, `capability-contract`, `capability-contract-registry`, `capability-execution`, `capability-supply`, `catalog`, `common`, `dev`, `discovery`, `external-run`, `governed-action`, `harness`, `imported-commitment`, `model-gateway`, `money`, `network-guard`, `notification-outbox`, `observability`, `product-frontier`, `registry`, `routing-kernel`, `sandbox-supply`, `security`, `seo`, `settings`, `storefront`. (`demand`, `inquiries`, `work-tree`, `studies` no longer exist.)

**`src/lib/server/`:**
- Purpose: Node-only HTTP/Convex/MCP/auth/payment/notification adapters. Never import from client components.
- Contains: `convex-source.ts`, `operation-invoke-api.ts`, `mcp-api.ts`, `source-write-admission.ts`, `agent-access-auth.ts` + `agent-access-oauth-{api,store}.ts`, `rate-limit.ts`, `problem.ts`, `method-guard.ts`, `bounded-request-body.ts`, `request-correlation.ts`, `gateway-telemetry.ts`, notification providers (`notification-provider-{clerk,novu,resend,shared}.ts`), Stripe adapters (`stripe-{checkout-evidence,connect-evidence,idempotency,money-provider-config,money-provider,money-webhook,transfer-evidence}.ts`), `browser-guest-{assertion,session}.ts`, `money-query.ts`, `operation-approval-source.ts`, `quarantine-write.ts`. Listing-tool 410 handlers live in `business-tool-api.ts`.
- Key files: `operation-invoke-api.ts` is the paid gateway implementation behind `/call` (exports `createOperationInvokeService` shared by HTTP, MCP, and Answer).

**`src/components/ae/`:**
- Purpose: Product UI grouped by surface (`chat/`, `claim/`, `supply/`, `offerings/`, `listing/`, `layout/`, `operator/`, `console/`, `artifacts/`, `action-invocation/`, `status/`, `settings/`, `harness/`, `home/`, `landing/`, `services/`, `forms/`, `feedback/`, `magic/`, `motion/`, `plan/`, `primitives/`, `readback/`).
- Contains: `Ae*.tsx` plus colocated view-models (`answer-stream.ts`, `answer-turn-state.ts`, `turn-stream-session.ts`).
- Key files: `src/components/ae/chat/AeChat.tsx`, `AeAnswerPromptInput.tsx`, `AeSuggestionChips.tsx`, `src/components/ae/artifacts/AeOperationCandidates.tsx`, `src/components/ae/action-invocation/AePaidOperationCard.tsx`. The `inquiries/`, `work-tree/` component families are deleted.

**`convex/`:**
- Purpose: Source of truth. Schema spreads module table bundles. Function files declare validators and delegate to split handler modules.
- Contains: Area files split into focused siblings — `capabilityOperationInvocations.ts` + `capabilityOperation{Admission,Dispatch,InvokeActions,WorkComplete,InvocationIdentity,InvocationProjection}.ts` + `capabilityOperationInvocationWorker.ts`; `answerThreads.ts` + `answerThreads{Reserve,Checkpoint,Reads,Share}.ts`; `capabilitySupply*.ts` (commands/publish/probes/graph/lists/owner-funnel/operation-queries/keyless/shared/values/ports); `money*.ts` (charge/payout-transfer/credit/connect/ledger/external-spend families); `security*.ts`; `harnessSessions*.ts`; `catalog*.ts`; `facilitatorDiscovery.ts` + `facilitatorDiscoveryAction.ts`; plus `registry.ts`, `business.ts`, `discovery.ts`, `authz.ts`, `sourceWriteAdmission.ts`, `rateLimit.ts`, `marketDispatchWorkpool.ts`.
- Key files: `schema.ts` (51 listed tables), `convex.config.ts`, `crons.ts`, `http.ts`.
- Table count: **51 listed tables** composed by `convex/schema.ts`; names asserted in `tests/unit/schema/convex-schema.test.ts` (`durableTables`). Unlisted empty families stay unlisted (routing-kernel, discovery, notification outbox, settings, agent-access OAuth).

**`tools/ae/`:**
- Purpose: External-agent-shaped CLI over public HTTP.
- Contains: `cli.ts`, `commands/*.ts` (`manifest.ts` defines `COMMANDS`), `lib/args.ts` / `output.ts`.
- Key files: `commands/invoke.ts`, `commands/search.ts`, `commands/ask.ts`, `commands/manifest.ts`, `commands/recover.ts`.

**`tests/`:**
- Purpose: Vitest + Playwright. Import scanners live in `tests/imports/`.
- Contains: Mirror of domain names under `tests/unit/<area>/`.
- Key files: `tests/imports/private-imports.test.ts`, `route-boundary.test.ts`, `capability-supply-boundaries.test.ts`, `tests/unit/schema/convex-schema.test.ts`, `tests/unit/study-actions.test.ts` (retirement guard).

**`eval/`:**
- Purpose: Answer/toolcall/quality/parity/product-foundry/braintrust/consumer eval cases. Not production runtime.
- Contains: `eval/answer/promptfooconfig.yaml`, `eval/answer/lib/{cases,evaluators,coverage,scoring,eval-*.ts}` (the eval lib was split into `eval-case-types.ts`, `eval-expectations.ts`, `eval-seed.ts`, `eval-thread*.ts`, `eval-turn*.ts`, `eval-capability-metrics.ts`), `eval/quality/gate.ts`, `eval/toolcall/run-toolcall.ts`, `eval/parity/check-parity.mjs`.
- Key files: `eval/answer/lib/cases.ts` is the source contract for expected tools/routes.

## Key File Locations

**Entry Points:**
- `src/start.ts`: Host middleware (correlation, API boundary, observability, CSP, agent markdown, CSRF, source-write, Clerk).
- `src/router.tsx`: `createRouter({ routeTree })`.
- `src/routes/mcp.ts`: MCP HTTP door.
- `src/routes/api.v1.operations.call.ts`: Paid invoke door → `src/lib/server/operation-invoke-api.ts`.
- `src/routes/api.v1.operations.execute.ts`: 410 tombstone; successor `/call`.
- `src/routes/api.answer.turn.ts`: Answer UI-stream door → `src/modules/answer-thread/server.ts`.
- `src/routes/api.answer.eval-status.ts`: Eval badge flag (`AE_ANSWER_EVAL_PASSED`).
- `src/routes/[.]well-known/ucp.ts`: Site discovery; advertises `POST /api/v1/operations/call`.
- `tools/ae/cli.ts`: CLI entry (`npm run ae`).
- `convex/schema.ts`: Table composition (51 listed tables).
- `convex/http.ts`: Retired routing-v1 + Convex `/mcp` 410s (live MCP is Start `/mcp`).
- `convex/crons.ts`: Probes (1 min), facilitator discovery (10 min), nonces (1 h), settlement (daily).

**Configuration:**
- `package.json`: Scripts (`dev`, `ae`, `test:*`, `seed:dev`, `gate:release`, `test:conformance`, `evidence:*`).
- `tsconfig.json`: Paths `@/*` and `~/*` → `src/*`; operator aliases `@/routes/owner.*` → `src/routes/_operator/owner.*`.
- `vite.config.ts`: `tanstackStart()` + `nitro()` (Vercel Node).
- `convex/convex.config.ts`: workpool, rateLimiter, aggregate; optional Convex env names (OpenRouter, Clerk, route-call signing, x402/CDP custody).
- `convex/auth.config.ts`: Clerk JWT issuer.
- `.env.example`: Environment variable names. `.env` / `.env.*` secret files: note existence only if present locally; never commit or quote values.

**Core Logic — market kernel:**
- `src/modules/capability-contract/public.ts`: Contract format `ae.capability-contract:v2`.
- `src/modules/capability-supply/public.ts`: Operation refs, eligibility (`isAnonymousKeylessOperationEligible`), publication types.
- `src/modules/capability-supply/operation-source.ts`: Search/detail/compare/inspect-plan readers over Convex queries.
- `src/modules/capability-supply/operation-projection.ts` + `internal/operation-projection-wire-*.ts`: Wire projection (`registry-operations:v1`).
- `src/modules/capability-supply/internal/supply-funnel/`: Owner publish funnel (landing, admission, import, connections).
- `src/modules/capability-supply/internal/publication-importer-*.ts`: OpenAPI / MCP / x402 / x402-bazaar / agent-plugin importers.
- `src/modules/capability-supply/internal/route-transport-*.ts`: Provider transports (http-json, mcp, x402, invoke, cancel, observation); re-exported by `route-transport-runtime.ts`.
- `src/modules/registry/operations.actions.ts` + `operation-action-contracts.ts`: Discovery actions.
- `src/modules/capability-execution/operation-invoke.ts`: Invoke application service (`createOperationInvokeApplication`).
- `src/modules/capability-execution/operation-invoke-admit.ts` / `operation-invoke-recover.ts`: Admit and recovery splits.
- `src/modules/capability-execution/operation-invoke-entry.ts`: Path/method/scope constants (`/api/v1/operations/call`).
- `src/modules/capability-execution/invocation-worker/`: Worker internals (`runPreparation`, `runRelease`, `charge`, `lease`, `recover`, `brokeredX402`, `x402Authorization`, `x402Route`, `x402Settlement`).
- `src/modules/capability-execution/operation-execute.functions.ts`: Keyless executor.
- `src/modules/capability-execution/operation-execute.server.ts`: Guarded fetch wrapper.
- `src/modules/capability-execution/operation-execute-mcp.actions.ts`: MCP/Answer keyless tool (`operation.execute`).
- `src/modules/action-invocation/`: Durable claim/lease/reconcile; `dynamic-published-adapter-*.ts` splits.
- `src/modules/money/public.ts` + `server.ts` + `internal/`: Ledger + Stripe host fns; `internal/ports.ts`, `payout-transfer-*.ts`, `credit-topup-http.ts`, `charge-contract.ts`.
- `src/modules/agent-access/contract.ts`: `MARKET_OPERATIONS_INVOKE_SCOPE`; `production-policy.ts` / `sandbox-policy.ts`.
- `src/modules/network-guard/public.ts`: SSRF allowlist.
- `src/modules/harness/run-loop.ts`, `emission-guard.ts`: Bounded run loop.
- `src/modules/model-gateway/public.ts`: OpenRouter.

**Core Logic — Answer proving ground:**
- `src/modules/answer/public.ts`: Gate, preflight, presentation, artifacts, `readAnswerEvalPassed`.
- `src/modules/answer/server.ts`: `runAnswerToolUseAgent` only (Node/LLM).
- `src/modules/answer/catalog-example-asks.ts`: Landing example queries (`AE_CATALOG_EXAMPLE_ASKS`).
- `src/modules/answer/internal/answer-tool-use-agent.ts`: Bounded AI SDK tool loop.
- `src/modules/answer/internal/answer-tool-use-agent-types.ts`: `ANSWER_AGENT_MAX_TOOL_CALLS=4`, `MAX_EFFECT_CALLS=1`.
- `src/modules/answer/internal/answer-tool-loop.ts`, `answer-agent-tools.ts`, `answer-agent-result.ts`, `answer-llm-prompts.ts`: Agent-loop splits.
- `src/modules/answer-thread/public.ts`: Session, share, projections, `classifyFollowUpIntent`.
- `src/modules/answer-thread/server.ts`: Re-exports `streamAnswerTurn` (from `internal/turn-orchestrator.ts`), reserve/stop, digests.
- `src/modules/answer-thread/internal/turn-orchestrator.ts` + `answer-turn-phases.ts` + `turns/{agent,boundary}.ts`: Lease-bound phase orchestration.
- `src/modules/answer-thread/internal/answer-thread-{reserve,checkpoint,reads,share,finalize}.ts`: Convex-facing splits mirroring `convex/answerThreads*.ts`.
- `src/modules/answer-thread/answer-thread.schema.ts`: `ANSWER_READ_TOOL_IDS`, `ANSWER_TURN_EXECUTION_LEASE_MS`.
- `src/modules/answer-thread/client.ts`: Empty placeholder (`export {}`) — browser code lives in `src/components/ae/chat/`.

**Core Logic — catalog / owner:**
- `src/modules/catalog/public.ts`, `owner-claim.functions.ts`, `claim-draft.ts`
- `src/modules/business/public.ts`, `src/modules/business/internal/claim.ts`
- `src/modules/storefront/storefront.functions.ts`, `server.ts` (SSRF-safe HTML import)
- `src/modules/discovery/public.ts`, `src/modules/discovery/internal/site-manifest.ts`, `developer-discovery*.ts`
- `src/modules/product-frontier/quarantine-write-admission.ts`
- `src/modules/business-tools/public.ts` — listing-tool descriptors; HTTP is 410

**Testing:**
- `tests/unit/<module>/`: Deterministic module tests.
- `tests/integration/`: Convex-test / route / Answer turn / owner-funnel / workpool integration.
- `tests/e2e/`: Playwright (incl. `paid-operation-development-surface.spec.ts`, `a11y/`).
- `tests/imports/`: Architectural scanners.
- `tests/eval/`: Eval case/coverage wiring.
- `tests/helpers/`: OpenRouter contract server, Answer thread test port, fixtures.

## Naming Conventions

**Files:**
- Domain module folder: kebab-case matching the bounded context (`capability-supply`, `answer-thread`).
- Public seam: `public.ts`. Host-only extras: `server.ts`. Convex helpers: `convex.ts`. Test-only ports: `testing.ts`.
- Machine contracts: `<area>.actions.ts` (`operations.actions.ts` for registry operations).
- TanStack server functions: `<area>.functions.ts` using `createServerFn`.
- Schema values: `internal/schema.ts` or `internal/convex-schema.ts`; re-exported via `public.ts` when needed.
- Convex split handlers: `<Area><Concern>.ts` (`capabilityOperationDispatch.ts`, `moneyPayoutTransferSettlement.ts`, `answerThreadsReserve.ts`); the area file keeps validators and re-exports.
- Routes: TanStack file-route names — `api.v1.operations.call.ts`, `$slug.tsx`, `_operator/owner.supply.tsx`, `[.]well-known/ucp.ts`.
- Product components: `Ae` prefix (`AeChat.tsx`). Primitives under `src/components/ui/` stay unprefixed.
- Tests: `*.test.ts` / `*.test.tsx` (Vitest), `*.spec.ts` (Playwright).

**Directories:**
- `internal/` is private to that module. Routes and sibling modules import `public.ts` or documented root files, never `internal/`.
- `_operator/` is a pathless layout (`src/routes/_operator.tsx`) wrapping owner/admin/developer/agent-access pages.
- `src/lib/server/` vs `src/lib/client/` vs `src/lib/http/`: runtime split is the name.

**Symbols:**
- Actions: dotted ids (`operation.invoke`, `registry.operations.search`).
- MCP tools: `ae_` + dots to underscores (`ae_operation_invoke`, `ae_operation_execute`).
- Public operation refs: `operation:v1:` + 64 hex.
- Source-write version: `source-write:v2`.
- Path alias: `@/modules/...` (prefer `@/` over `~/`).

## Where to Add New Code

**New Market Operation contract / supply behavior:**
- Primary code: `src/modules/capability-contract/` (schema/effects) and `src/modules/capability-supply/internal/{publication,binding,eligibility}/`.
- Public types: export from `src/modules/capability-supply/public.ts`.
- Convex tables: add to `src/modules/capability-supply/internal/convex-schema.ts` and spread in `convex/schema.ts`. Update `durableTables` in `tests/unit/schema/convex-schema.test.ts` (currently 51).
- Convex functions: `convex/capabilitySupply*.ts` — keep the area file thin; handlers in focused siblings; domain logic in the module.
- Tests: `tests/unit/capability-supply/`, `tests/integration/`.

**New discoverable machine API (search/detail/invoke-style):**
- Define `defineAction` in `src/modules/<area>/<area>.actions.ts`.
- Register in the array in `src/modules/actions/index.ts` (explicit import; unique id).
- HTTP: add `src/routes/api.v1.<path>.ts` that bounds JSON, rate-limits, and calls `action.run`. Reuse `src/lib/server/problem.ts`.
- MCP: set `surfaces` to include `'mcp'` if the tool should appear; adapter picks it up via `listMcpActions()`.
- CLI: add `tools/ae/commands/<name>.ts` and wire `COMMANDS` in `tools/ae/commands/manifest.ts` / `tools/ae/cli.ts`.
- Tests: `tests/unit/actions/`, `tests/unit/server/`, `tests/unit/market-terminal/`.

**Paid invoke / recovery change:**
- Kernel: `src/modules/capability-execution/operation-invoke.ts` + `operation-invoke-admit.ts` + `operation-invoke-contracts.ts`.
- Durability: `src/modules/action-invocation/` + `convex/capabilityOperationInvocations.ts` + `convex/capabilityOperation{Admission,Dispatch,InvokeActions,WorkComplete}.ts` + worker internals in `src/modules/capability-execution/invocation-worker/`.
- HTTP: keep `/api/v1/operations/call` as the only paid path (`operation-invoke-entry.ts`). Do not revive `/execute`.
- Host adapter: `src/lib/server/operation-invoke-api.ts` (HTTP, MCP, and Answer authenticated context share `createOperationInvokeService`).
- Tests: `tests/unit/capability-execution/`, `tests/unit/action-invocation/`, `tests/unit/server/operation-invoke-api.test.ts`, `npm run test:conformance` list in `package.json`.

**New Answer behavior (proving ground only):**
- Tool loop / prompts / gate: `src/modules/answer/internal/` and export via `public.ts` or `server.ts`.
- Turn lifecycle / persistence: `src/modules/answer-thread/internal/` (reserve/checkpoint/reads/share splits) + `convex/answerThreads.ts` (+ `answerThreads{Reserve,Checkpoint,Reads,Share}.ts`).
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
- Nav: `src/lib/operator/navigation.ts`.
- Authz: `convex/authz.ts` + `src/modules/security/public.ts`.
- Tests: `tests/unit/routes/`, `tests/e2e/`.

**New Convex function:**
- Implementation file in `convex/` matching the area. Follow the current split convention: validators + re-exports in the area file (`convex/moneyLedger.ts`), handlers in focused siblings (`convex/moneyChargeAuthorize.ts`), domain logic in `src/modules/**` behind `convex.ts` barrels.
- Validators exact; use `requireSourceWrite` for mutations (`convex/sourceWriteAdmission.ts`).
- Read `convex/_generated/ai/guidelines.md` before writing Convex APIs.

**New shared helper:**
- Cross-module pure utils: `src/modules/common/` (canonical digest, bounded JSON, ids, stable hash).
- HTTP-only: `src/lib/server/` or `src/lib/http/`.
- UI-only: `src/lib/ui/` or colocated next to the component.
- Do not put kernel policy in `src/lib/`.

**Utilities:**
- Shared helpers: `src/modules/common/` (prefer) or `src/lib/utils.ts` (cn/classnames only).
- Errors: extend `src/lib/errors.ts` kinds/codes; do not invent a parallel envelope.

**Quarantined / parked — do not grow as live HTTP:**
- `src/routes/api.v1.operations.execute.ts` (410; successor `/call`).
- `src/routes/$slug.tools.$toolId.ts` and `$slug.tools.$toolId.prepare.ts` (410 via `src/lib/server/business-tool-api.ts`).
- `src/modules/routing-kernel/` (v1 retired; Convex `http.ts` 410s).
- `src/modules/product-frontier/` — tombstone helpers only; `QUARANTINE_FAMILY_ACTION_PREFIXES` is empty.
- Do not restore Customer Request, WorkTree, Study, or inquiry-inbox TypeScript as live product; the files are deleted and retirement tests (`tests/unit/study-actions.test.ts`, `tests/imports/kernel-retirement-manifest.test.ts`) guard against return.

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
- **App-server** (TanStack Start on Nitro Node) owns HTTP, Clerk, MCP transport, UI streams, cookies, RFC 9457, minting source-write admissions, calling Convex via `ConvexHttpClient` (`src/lib/server/convex-source.ts`).
- **Do not** open a second Convex client in a route file. **Do not** put provider fetch in a Convex mutation (use `"use node"` actions / Workpool worker — see `convex/capabilityOperationInvocationWorker.ts` and `convex/facilitatorDiscoveryAction.ts`).
- Schema tables are **defined in modules** (`internal/convex-schema.ts`) and **composed** in `convex/schema.ts`. That composition import is an allowed exception to the private-import scanner.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated file-route tree.
- Generated: Yes (TanStack Router)
- Committed: Yes — regenerate via dev/build, do not hand-edit.

**`convex/_generated/`:**
- Purpose: Convex API/dataModel/server types and `ai/guidelines.md`.
- Generated: Yes (`npx convex codegen`)
- Committed: Yes. App `tsconfig.json` and `convex/tsconfig.json` (excludes `./_generated` from include) split the type programs.

**`.planning/`:**
- Purpose: GSD architecture notes, STATE, research. Runtime must not import it (`planning-runtime-import` scan).
- Generated: No
- Committed: Yes
- Companion maps: `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/IA-DATA-FLOW.md`.

**`.agents/skills/`:**
- Purpose: Project agent skills (Convex, UI, accessibility, colors, writing).
- Generated: Mixed
- Committed: Yes

**`public/`:**
- Purpose: Static brand assets and category illustrations.
- Generated: No
- Committed: Yes

**`eval/` / `output/` / `outputs/` / `playwright-report/` / `test-results/`:**
- Purpose: Eval configs vs generated reports. Missing `output/eval/answer-suite-report.json` is not source evidence.
- Generated: reports under `output/` and test-output dirs
- Committed: eval sources yes; treat `output/` and test-output dirs as artifacts

**`tools/dev/` / `tools/release/`:**
- Purpose: Local evidence packets, smokes, product-frontier/kernel-retirement manifests, production gateway smoke + receipt validation.
- Generated: No (except packets they write)
- Committed: Yes

**`vendor/handshake-protocol-kernel/`:**
- Purpose: Vendored reference kernel; quarantined by the `forbidden-handshake-import` scanner rule in `src/lib/ui/contract-scans.ts`.
- Generated: No
- Committed: Yes — do not import from app code.

**`node_modules/`, `dist/`, `.output/`, `convex_local_storage/`:**
- Purpose: Dependencies, build output, local Convex storage.
- Generated: Yes
- Committed: No

**`.env.example`:**
- Purpose: Required variable names for local/hosted config.
- Generated: No
- Committed: Yes. Secret `.env` files are not documentation — do not read or quote them.

---

*Structure analysis: 2026-08-21*
