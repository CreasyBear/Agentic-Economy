# Codebase Structure
**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

## Directory Layout

The following is a representative three-level map of the current working tree. Feature directories contain more files than shown; the named paths are the stable seams and the most useful places to orient a change.

```text
Agentic-Economy/
├── convex/
│   ├── _generated/                         generated Convex API/types
│   ├── lib/
│   │   └── workloadCron/                   fixed workload context and validators
│   ├── capabilityOperationInvocations.ts   invocation host and public API
│   ├── capabilityOperationInvocationWorker.ts
│   ├── capabilityProviderConnections.ts    provider-connection host
│   ├── capabilitySupply.ts                 supply host and ports
│   ├── capabilitySupplyOperations.ts      public operation readers
│   ├── chatAnonymous.ts                    anonymous chat backend
│   ├── chatGenerate.ts                     authenticated chat generation
│   ├── chatMessages.ts                     durable chat thread/messages
│   ├── chatTools.ts                        bounded canonical operation tools
│   ├── crons.ts                            scheduled work declarations
│   ├── convex.config.ts                    components and environment
│   ├── http.ts                             Convex HTTP router
│   ├── interactiveAuthority.ts             Clerk-to-canonical authority
│   ├── market*.ts                          market evidence and snapshot hosts
│   ├── money*.ts                           economic-plane hosts
│   ├── schema.ts                            composed application schema
│   └── workloadCron.ts                     declared workload dispatcher
├── src/
│   ├── components/
│   │   ├── ae/
│   │   │   ├── command-panel/              command panel and inspection pages
│   │   │   ├── layout/                     public/operator shells and states
│   │   │   ├── market/                     market pages and operation detail
│   │   │   ├── operation-chat/              chat transcript/composer/cards
│   │   │   ├── offerings/                   owner offering/operation workspace
│   │   │   ├── settings/                    owner settings surfaces
│   │   │   ├── supply/                      supplier onboarding/configuration
│   │   │   └── agent-access/                agent access/credential UI
│   │   └── ui/                              shared shadcn/Radix primitives
│   ├── lib/
│   │   ├── errors.ts                       canonical problem/error model
│   │   └── server/                         HTTP, Convex, auth and safety adapters
│   ├── modules/
│   │   ├── action-invocation/               durable claim/attempt/recovery seams
│   │   ├── actions/                         central action registry
│   │   ├── agent-access/                    agent principals, grants and OAuth
│   │   ├── authority/                       consequence authority/delegation
│   │   ├── business/                        business ownership/status
│   │   ├── capability-contract/             contract definition/validation
│   │   ├── capability-execution/            Operation admission and execution
│   │   ├── capability-supply/               provider admission/publication/readiness
│   │   ├── catalog/                         businesses, offerings and access paths
│   │   ├── chat/                             chat projections and tool cards
│   │   ├── chat-sharing/                    shared chat artifacts
│   │   ├── common/                          dependency-light action/common types
│   │   ├── dev/                             development-only module surfaces
│   │   ├── discovery/                       discovery adapters/indexes
│   │   ├── market/                           market evidence and view models
│   │   ├── market-demand/                   private demand signals
│   │   ├── model-gateway/                   OpenRouter model transport
│   │   ├── money/                            exact money, budget, ledger and payout
│   │   ├── network-guard/                   guarded DNS/URL/fetch boundary
│   │   ├── observability/                   telemetry contracts and projections
│   │   ├── principal-account/               principal/account/ownership registry
│   │   ├── registry/                         public operation and market projections
│   │   ├── secrets/                          server-side secret contracts
│   │   ├── security/                         auth/security support
│   │   ├── seo/                              machine-readable discovery surfaces
│   │   └── storefront/                       public website/storefront composition
│   ├── routes/
│   │   ├── _operator/                        authenticated owner/operator routes
│   │   ├── api.v1.market-operations.*.ts     operation search/detail/compare/plan APIs
│   │   ├── api.v1.operations.ts              invocation list route
│   │   ├── api.chat.anonymous.ts             anonymous chat edge proxy
│   │   ├── oauth.*.ts                        device/register/authorize/token routes
│   │   ├── mcp.ts                             MCP endpoint
│   │   ├── t.*.tsx                            authenticated chat pages
│   │   ├── s.$shareToken.tsx                  shared chat page
│   │   ├── operations*.tsx                    operation/detail/invocation pages
│   │   └── market.tsx                         public market page
│   ├── routeTree.gen.ts                      generated TanStack route tree
│   ├── router.tsx                            TanStack router configuration
│   └── start.ts                              TanStack Start middleware/server entry
├── tools/
│   ├── ae/
│   │   ├── commands/                         CLI command implementations
│   │   ├── lib/                              CLI config/output/policy helpers
│   │   └── cli.ts                            external-agent CLI entry
│   └── dev/
│       └── local-dev.mjs                    local Convex/Vite supervisor
├── packages/
│   └── cli/                                  package metadata and generated CLI dist
├── tests/
│   ├── unit/                                 focused domain/module tests
│   ├── integration/                          Convex/source/application tests
│   ├── convex/                               Convex function tests
│   ├── e2e/                                  browser and end-to-end tests
│   ├── imports/                              import-boundary/architecture tests
│   └── ui-contract/                          UI route/component contracts
├── docs/
│   └── designs/                              product and architecture decisions
├── research/                                 source-grounded research artifacts
├── .planning/
│   └── codebase/                             generated codebase map documents
├── package.json                              scripts, dependencies and Node 22 engine
├── tsconfig.json                             strict TypeScript project config
├── vite.config.ts                            Vite/TanStack Start plugins and aliases
├── convex.json                               Convex schema/package configuration
└── .env.example                              documented runtime environment names
```

## Directory Purposes

### Backend and persistence

- `convex/` contains the Convex host layer: schema composition, queries, mutations, actions, HTTP handlers, worker entry points and scheduled functions. Domain policy is implemented in `src/modules/`; Convex files bind that policy to transactions, validators, components and generated APIs.
- `convex/_generated/` is generated by Convex and is an API/type artifact, not a hand-edited source boundary.
- `convex/lib/workloadCron/` contains the fixed system workload identities, snapshot validators and context used to attribute scheduled consequences.
- `convex/convex.config.ts` registers Workpool, Rate Limiter, Agent and Aggregate components and declares the backend environment surface.

### Domain modules

- `src/modules/capability-supply/` is the supplier and admitted-operation authority: transport import, contract/publication material, provider connections, qualification, readiness, current-operation commitments and public operation projections.
- `src/modules/capability-contract/` defines the closed input/output contract and its data-use/effect/evidence annotations.
- `src/modules/capability-execution/` owns Operation call admission, reservation, authority evaluation, dispatch and result/recovery contracts.
- `src/modules/action-invocation/` owns the lower durable claim, attempt, lease, terminal outcome, cancellation and reconciliation mechanics reused by execution.
- `src/modules/principal-account/`, `src/modules/business/`, `src/modules/agent-access/`, and `src/modules/authority/` together own actor identity, account ownership, delegation and consequence admission.
- `src/modules/money/` owns exact amounts and economic facts, including budget/reservation, ledger, usage, refunds, supplier payable and payout flows.
- `src/modules/catalog/`, `src/modules/registry/`, `src/modules/market/`, and `src/modules/market-demand/` project offerings, operations, evidence, availability and private unmet demand.
- `src/modules/common/` is dependency-light shared vocabulary and action contracts. `src/modules/network-guard/` is the lower guarded-I/O boundary.
- `src/modules/chat/`, `src/modules/chat-sharing/`, `src/modules/model-gateway/`, `src/modules/storefront/`, and `src/modules/seo/` support product presentation and machine-facing discovery without becoming alternate execution authorities.
- `src/modules/actions/` is the central action descriptor/registry used to keep UI, HTTP, agent, chat, CLI and MCP surfaces aligned.

### Web, protocol, and presentation

- `src/start.ts` is the server middleware entry: correlation, API boundary, observability, security headers, content negotiation, CSRF, source-write admission and Clerk setup.
- `src/routes/` contains TanStack file routes. Browser pages live beside HTTP routes so route-level parsing/method handling is explicit; domain calls are delegated below the route.
- `src/routes/_operator/` contains authenticated owner/operator surfaces for supply, offerings, settings, credit, status, activity, administration and agent access.
- `src/components/ae/` contains product-specific UI grouped by surface. `src/components/ae/market/` is the public market/operation detail tree; `src/components/ae/operation-chat/` is the thin chat UI; `src/components/ae/command-panel/` is the cross-shell navigation/inspection deck; `src/components/ae/layout/` owns public/operator shell composition and route states.
- `src/components/ui/` contains reusable shadcn/Radix-style primitives such as dialogs, sheets, sidebars, charts and resizable panels. Domain-specific behavior belongs in `src/components/ae/`, not in a generic primitive.
- `src/lib/server/` contains server-only protocol adapters and cross-cutting seams: typed Convex source access, problem responses, method guards, request bounds, auth/authority adapters, network-safe calls and invocation gateways.

### Tooling and verification

- `tools/ae/` is the external-agent/operator CLI. `tools/ae/commands/` holds command-level behavior; `tools/ae/lib/` holds parsing, output, continuation, policy and formatting helpers. It should consume the canonical HTTP/MCP/action contracts rather than create a parallel catalog or ledger.
- `tools/dev/` holds local development orchestration. `tools/dev/local-dev.mjs` starts the local Convex/Vite workflow and is not an application authority.
- `packages/cli/` contains the separately packaged CLI metadata and generated distribution artifact. Source command behavior remains under `tools/ae/` in this tree.
- `tests/unit/`, `tests/integration/`, `tests/convex/`, `tests/e2e/`, `tests/imports/`, and `tests/ui-contract/` separate focused domain behavior, deployed/source integration, Convex functions, browser flows, architectural import constraints and UI contracts.
- `docs/designs/` records product/architecture decisions such as `docs/designs/agent-operating-contract.md`; `research/` holds source-grounded research rather than runtime code.
- `.planning/` holds planning and codebase-map artifacts. `.planning/codebase/` is the destination for the mapper documents, including this file.

## Key File Locations

| Concern | File or directory | Why it matters |
|---|---|---|
| Server lifecycle | `src/start.ts` | Middleware order and HTTP-wide security/observability behavior. |
| Browser bootstrap | `src/router.tsx`, `src/routes/__root.tsx` | Router, providers, root layout and route-state defaults. |
| Module direction | `src/modules/module-boundaries.ts` | Declares allowed feature dependencies and boundary intent. |
| Action surface | `src/modules/common/action.ts`, `src/modules/actions/index.ts` | Shared action contract and central registry. |
| Operation contract | `src/modules/capability-contract/define-contract.ts` | Validates schemas, annotations, effects, data use and lifecycle. |
| Supply public boundary | `src/modules/capability-supply/public.ts` | Public types and ports for admission, publication, readiness and operation reads. |
| Published material | `src/modules/capability-supply/published-operation.ts` | Runtime descriptor and source-owned publication materialization. |
| Current operation | `src/modules/capability-supply/current-operation.ts` | Exact operation/price/provider/readiness commitment used by invocation. |
| Operation read source | `src/modules/capability-supply/operation-source.ts` | Typed source queries and wire serialization for search/detail/compare/plan. |
| Operation execution | `src/modules/capability-execution/operation-invoke.ts` | Canonical admission, reservation, authority and dispatch application service. |
| Invocation recovery | `src/modules/action-invocation/canonical-claim.ts`, `src/modules/action-invocation/operation-public.ts` | Durable claims, release fences, public status and reconciliation. |
| Consequence authority | `src/modules/authority/context/consequence-authority.ts` | Cross-surface principal/account/grant resolution and immutable admission. |
| Identity/ownership | `src/modules/principal-account/`, `src/modules/agent-access/` | Canonical principals, accounts, credentials and agent grants. |
| Error model | `src/lib/errors.ts`, `src/lib/server/problem.ts` | RFC 9457 problem details and stable domain error mapping. |
| HTTP operation reads | `src/routes/api.v1.market-operations.search.ts`, `src/routes/api.v1.market-operations.detail.ts`, `src/routes/api.v1.market-operations.compare.ts`, `src/routes/api.v1.market-operations.inspect-plan.ts` | Public bounded/method-guarded market operation APIs. |
| HTTP invocation gateway | `src/lib/server/operation-invoke-api.ts` | Invoke/list/status/cancel/reconcile route adapter. |
| Convex schema | `convex/schema.ts`, `convex/convex.config.ts` | Composed tables, validators and backend components. |
| Convex invocation host | `convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationInvocationWorker.ts` | Durable invocation commands and worker/recovery entry points. |
| Convex authority host | `convex/interactiveAuthority.ts`, `convex/authorityBoundary.ts` | Interactive and agent authority resolution. |
| Chat | `convex/chatMessages.ts`, `convex/chatGenerate.ts`, `convex/chatTools.ts`, `src/components/ae/operation-chat/OperationChat.tsx` | Durable chat, bounded tools and UI surface. |
| MCP | `src/routes/mcp.ts`, `src/lib/server/mcp-api.ts` | Action-registry MCP protocol adapter. |
| CLI | `tools/ae/cli.ts`, `tools/ae/commands/`, `tools/ae/lib/` | External-agent manifest, discovery, call and recovery commands. |
| Background work | `convex/crons.ts`, `convex/workloadCron.ts`, `convex/lib/workloadCron/context.ts` | Scheduled jobs and declared workload attribution. |
| Product contract | `PRODUCT.md`, `.planning/PROJECT.md`, `docs/designs/agent-operating-contract.md` | Product scope, ownership rules and lifecycle/control-plane decisions. |

## Naming Conventions

- **Feature directories** use lowercase kebab case, for example `src/modules/capability-supply/`, `src/modules/agent-access/`, and `src/modules/market-demand/`.
- **Feature boundary files** use conventional roles: `public.ts` for exported public contracts, `server.ts` for server-only adapters, `convex.ts` for Convex validators/ports, `schema.ts` for feature schema, and `internal/` for implementation details. Files such as `src/modules/registry/operations.actions.ts` and `src/modules/market/market.functions.ts` make their application boundary explicit.
- **Convex hosts** use camelCase filenames matching the function family, for example `convex/capabilitySupplyOperations.ts` and `convex/capabilityOperationInvocations.ts`.
- **React components** use PascalCase filenames with `.tsx`, grouped by product surface, for example `src/components/ae/market/AeOperationTable.tsx` and `src/components/ae/command-panel/AeCommandPanel.tsx`.
- **TanStack file routes** encode nesting and parameters in filenames: dots separate route segments, `$` denotes a dynamic parameter, and bracket escapes are used for literal names such as `src/routes/llms[.]txt.ts` and `src/routes/SKILL[.]md.ts`.
- **Action identifiers** are dot-delimited and descriptive, such as `registry.operations.search` and `operation.invoke`; the registry derives protocol names for MCP/agent surfaces.
- **References and digests** are explicit in names and types (`operationRef`, `publicationRef`, `priceDigest`, `currentDigest`, `evidenceRefs`) rather than implicit string conventions.
- **Tests** use `*.test.ts`/`*.test.tsx` for unit/integration/contracts and `*.spec.ts` for end-to-end scenarios, with the directory indicating the test layer.
- **Generated artifacts** retain generator-specific names, including `convex/_generated/` and `src/routeTree.gen.ts`; they are outputs, not places for hand-authored behavior.

## Where to Add New Code

1. **New admitted provider capability or Operation** — Start in `src/modules/capability-contract/` for the contract and `src/modules/capability-supply/` for importer, transport binding, qualification, publication, readiness and provider connection behavior. Add a thin Convex host under `convex/` only where persistence or scheduled execution is required. Do not add a one-off route-level provider call.
2. **New operation execution behavior** — Extend `src/modules/capability-execution/` and, when the behavior is generic durable claim/attempt/recovery, `src/modules/action-invocation/`. Reuse the existing current-operation, authority, idempotency and economic ports. Add protocol adapters only after the domain contract is complete.
3. **New action exposed on several surfaces** — Define the action in the owning feature and register its descriptor in `src/modules/actions/index.ts`. Let HTTP/MCP/CLI/chat consume the same schema, authority requirement, effect class and invocation contract.
4. **New identity, access or ownership rule** — Place it in `src/modules/principal-account/`, `src/modules/business/`, `src/modules/agent-access/`, or `src/modules/authority/` according to ownership. Use the authority-boundary adapters rather than reconstructing identity from credentials in a route or component.
5. **New economic behavior** — Add exact amounts and ledger/budget/reservation logic to `src/modules/money/`, with a corresponding thin Convex host in `convex/`. Keep price display/projection code in market/catalog modules and link it to canonical price digests.
6. **New HTTP endpoint** — Add a matching TanStack file route under `src/routes/`, use `src/lib/server/method-guard.ts`, `src/lib/server/bounded-request-body.ts`, correlation/rate-limit seams, Zod input/output parsing and `src/lib/server/problem.ts`. Delegate to a server adapter or registered action; do not put policy in the route.
7. **New browser surface** — Add the route under `src/routes/` and product UI under the closest `src/components/ae/<surface>/` directory. Reuse shells, route-state components and primitives from `src/components/ui/`; do not put domain-specific market or authority behavior in a generic primitive.
8. **New CLI command** — Add a command under `tools/ae/commands/`, shared parsing/formatting/continuation behavior under `tools/ae/lib/`, and expose its descriptor through `tools/ae/cli.ts`/the manifest. Reuse the canonical API/action contract rather than maintaining CLI-only state.
9. **New persistence** — Define the feature-owned table bundle and validators under `src/modules/<feature>/internal/` (following existing `internal/convex-schema.ts` patterns), compose it in `convex/schema.ts`, and expose only the required typed host functions in `convex/`. Preserve the module direction in `src/modules/module-boundaries.ts`.
10. **New verification** — Put focused contract tests in the corresponding `tests/unit/` or `tests/convex/` area, cross-module behavior in `tests/integration/`, browser flows in `tests/e2e/`, import constraints in `tests/imports/`, and UI-specific invariants in `tests/ui-contract/`.

## Special Directories

- `convex/_generated/` and `src/routeTree.gen.ts` are generated. Regenerate them through the project scripts when their source declarations change; never hand-edit generated output.
- `node_modules/`, `dist/`, `.vercel/output/`, and `packages/cli/dist/` are dependency/build/package artifacts. They are not durable source locations for feature changes.
- `.planning/` is planning state, not runtime code. `.planning/codebase/` contains this map and the sibling architecture, stack, conventions, testing, integrations and concerns documents.
- `docs/designs/` and `research/` are source/documentation zones. Architecture decisions should be recorded in the design documents, while external evidence belongs in research artifacts rather than copied into runtime modules.
- `src/routes/engine.tsx` currently redirects the old `/engine` surface to `/`; it is not a second execution engine entry point.
- `src/components/ae/command-panel/`, `src/components/ae/market/operation-detail/`, `src/components/ae/layout/`, `src/components/ae/settings/`, `convex/capabilitySupplyOperations.ts`, and `package.json` contain current in-flight working-tree changes. New map readers should preserve those on-disk changes when locating code and should not infer that their current state matches an earlier commit.
- `.env.example` documents names only. Runtime secrets and provider credentials belong in server/Convex environment configuration and must not be placed in browser components, route bodies, or committed source.
