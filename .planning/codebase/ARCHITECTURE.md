# Architecture

**Analysis Date:** 2026-08-08

## Pattern Overview

**Overall:** Full-stack modular domain application with TanStack Start file-based routes, React surfaces, and Convex-backed durable state.

**Key Characteristics:**
- `src/start.ts` composes the server request middleware chain, while `src/router.tsx` creates the browser router from the generated `src/routeTree.gen.ts` route tree.
- `src/routes/` contains both page routes and HTTP handlers; non-trivial boundary work is delegated to `src/lib/server/` and then to domain modules rather than being embedded in route declarations.
- `src/modules/` is the domain core. Each major module exposes a `public.ts` seam and keeps private implementations, schemas, and ports under the module (often `internal/`). Import-boundary tests enforce that consumers use those public seams (`tests/imports/private-imports.test.ts`).
- `convex/schema.ts` assembles in-domain table bundles, and `convex/*.ts` owns Convex queries, mutations, actions, workers, and durable read/write adapters. Domain validation, projections, digests, and command machines remain in `src/modules/` and are passed into those adapters.
- Authority and effects are separated: a model proposal, provider observation, or UI action is untrusted until deterministic schema, identity, authority, and evidence checks accept it. Public pages and agent responses consume redacted projections rather than raw durable rows (`src/modules/answer-thread/internal/public-projection.ts`, `src/modules/registry/internal/services-api-projection.ts`).
- The same typed action contracts can be surfaced to UI, HTTP, answer-thread, CLI, and MCP callers; `src/modules/actions/index.ts` is the registry and `src/modules/common/action.ts` defines the shared contract.

## Layers

**Presentation and Route Layer:**
- Purpose: Render browser pages, expose HTTP resources, and connect each request to a narrow handler.
- Contains: TanStack file routes in `src/routes/`, React components in `src/components/`, the browser router in `src/router.tsx`, and route middleware bootstrap in `src/start.ts`.
- Depends on: Boundary helpers in `src/lib/http/` and `src/lib/server/`, module `public.ts` APIs, and registered actions.
- Used by: Browser navigation, external agents, HTTP clients, OAuth clients, and the CLI's HTTP commands.

**Boundary and Transport Layer:**
- Purpose: Enforce request-shape, method, authentication, rate, CSRF, source-write, security-header, and response-media-type policy before domain work is called.
- Contains: `src/lib/server/` request handlers and Convex transport, `src/lib/http/` protocol helpers, `src/lib/errors.ts`, `src/lib/server/problem.ts`, and client/server observability adapters.
- Depends on: Domain schemas and result types from `src/modules/`, Clerk/TanStack Start/Convex transports, and platform `Request`/`Response` primitives.
- Used by: Page loaders/server functions, HTTP route adapters, action runners, and the CLI-facing API surface.

**Domain Module Layer:**
- Purpose: Own business rules, deterministic decisions, contracts, projections, lifecycle machines, and external-effect policy.
- Contains: Feature modules under `src/modules/`, including `customer-request/` (interpretation, compilation, route mandates, and projections), `capability-supply/` (admission, publication, readiness, and operation projection), `capability-execution/` (fail-closed keyless execution), `answer-thread/` and `answer/` (turn orchestration, tool evidence, answer gating), `registry/`, `catalog/`, `inquiries/`, `action-invocation/`, `money/`, `work-tree/`, and `security/`.
- Depends on: Shared primitives in `src/modules/common/`, declared library contracts, and explicit ports for persistence or network calls.
- Used by: Route and server adapters, Convex functions, action registry consumers, CLI commands, and test fixtures.

**Persistence and Workflow Adapter Layer:**
- Purpose: Make domain commands and projections durable, schedule asynchronous work, and provide source-backed readbacks.
- Contains: Convex functions in `convex/*.ts`, the schema aggregator `convex/schema.ts`, scheduled jobs in `convex/crons.ts`, HTTP actions in `convex/http.ts`, and generated Convex bindings under `convex/_generated/`.
- Depends on: Convex `ctx.db`, indexes, validators, scheduler/workpool/workflow components, and domain ports/types imported from `src/modules/`.
- Used by: `src/lib/server/convex-source.ts`, module action functions, route handlers, background workers, and public/operator readbacks.

## Data Flow

**Buyer Ask and Registry Preview:**

1. A visitor submits a query on `src/routes/index.tsx`; its loader validates search parameters and calls `registryServicesSearchAction` plus `customerRequestPlanPreviewAction`.
2. Registry and preview actions read current supply through their module/Convex seams; the route converts returned services into a consumer-facing plan with `projectConsumerPlan`.
3. If the registry is empty, the root loader may call `webDiscoverAction`; imported claims remain a separate result from registered supply rather than becoming durable provider truth.
4. The UI navigates to `src/routes/t.new.tsx` or a project-backed route; no browser thread is treated as the durable identity of a work tree.

**Answer Thread Turn:**

1. `POST /api/answer/turn` is handled by `src/routes/api.answer.turn.ts`, which bounds and parses JSON, resolves a pseudonymous session, checks idempotency/rate/access limits, and returns a typed SSE response.
2. `streamAnswerTurn` in `src/modules/answer-thread/public.ts` enters the turn orchestrator, which classifies intent, loads bounded prior context, prefers deterministic retrieval/boundary paths, or invokes the AI SDK model path.
3. The answer agent in `src/modules/answer/internal/answer-tool-use-agent.ts` exposes fixed read tools and current keyless capability tools. Dynamic tools are derived from `listKeylessExecutableDescriptors`; execution is routed through the shared `operation.execute` record seam and `executeOperation`.
4. `src/modules/answer/internal/answer-gate.ts` validates grounding, safety, and evidence before the answer is assembled into typed frames by `src/modules/answer/answer-ui-stream.ts` and sent through the AI SDK UI stream.
5. Finalization writes bounded answer-thread, turn, tool-call, and harness records through `src/modules/answer-thread/internal/answer-turn-finalization.ts` and `convex/answerThreads.ts`; subsequent SSR/API reads use a redacted public projection.

**Authenticated Customer Request:**

1. External agents enter through `src/routes/api.v1.requests.ts` and its request-family routes; handlers in `src/lib/server/customer-request-agent-api.ts` authenticate the agent, validate the request, and add navigation links to the response.
2. Boundary handlers call Convex actions such as `customerRequestApplication:submit`, `:provideFacts`, `:refine`, `:compare`, `:confirmRoute`, and `:runRoute` through `src/lib/server/convex-source.ts`.
3. `src/modules/customer-request/semantic-interpreter.ts` produces a typed capability proposal or an honest information/unsupported result. `src/modules/customer-request/compiler.ts` binds facts to registered supply, computes route steps/edges/digests, and emits a proposal-only aggregate.
4. Approval and execution are separate: route-mandate and preparation modules authorize bounded effects, then Convex route workers dispatch through `convex/customerRequestRouteTransportWorker.ts` and related execution/journal adapters.
5. Durable snapshots, evidence, route status, cancellation, recovery, and money references are read back as public agent contracts rather than exposing internal tables.

**Provider Supply and Publication:**

1. Provider/owner pages and agent endpoints submit supply descriptions and endpoint contracts to `src/modules/capability-supply/`.
2. Publication importers and `admit-provider-schema.ts` normalize OpenAPI/HTTP, MCP, x402, or AE-envelope inputs, apply bounded contract and provenance rules, and return typed admission refusals instead of fabricating unsupported capabilities.
3. Publication lifecycle commands under `src/modules/capability-supply/internal/publication/` validate, persist, refresh, withdraw, and promote publication/readiness state through Convex adapters such as `convex/capabilitySupply.ts` and `convex/capabilitySupplyOperations.ts`.
4. `src/modules/registry/internal/services-api-projection.ts` and related registry projections flatten admitted offerings/operations into public service and endpoint DTOs; operator views use separate readbacks.

**Keyless Operation Execution:**

1. Registry discovery returns an opaque `operation:v1:<digest>` reference and a contract/input schema from `src/modules/capability-supply/operation-projection.ts`.
2. `src/modules/capability-execution/operation-execute.actions.ts` reads a server-side descriptor through `capabilitySupplyOperations:readKeylessExecutable`; endpoint and credential details never come from the caller.
3. `executeOperation` validates that the descriptor is keyless, `http-json:v1`, GET-only, non-x402, schema-valid, and HTTPS before building the provider request.
4. The fetch response is bounded, JSON/content-type checked, optionally output-schema checked, and converted to either `{ kind: 'ok', ... evidenceHash }`, a typed refusal, or a typed provider/fetch/response error. The answer agent grounds live-data prose only on a recorded successful result and preserves refusal honesty.

**State Management:**
- Convex rows and functions are the durable state boundary; table bundles are declared in module internals and aggregated by `convex/schema.ts`.
- Domain aggregates, command keys, canonical digests, route generations, answer snapshots, evidence records, and action-invocation history provide replay/idempotency and conflict detection (`src/modules/customer-request/v2-write/`, `src/modules/action-invocation/`, `src/modules/answer-thread/internal/`).
- Browser SSE/replay sessions and some admission/idempotency guards are process-local transport state; they are not substitutes for Convex authority or durable evidence.
- Provider/network observations are external inputs. They become usable facts only after deterministic validation and projection; unavailability is represented explicitly rather than silently treated as success.

**Maintained Specialized Maps:**
- For prompt assembly, model/tool boundaries, answer persistence, and AI harness evidence, see [`PROMPT-DATA-FLOW.md`](./PROMPT-DATA-FLOW.md).
- For the complete route/schema/persona information architecture and source-grounded journey traces, see [`IA-DATA-FLOW.md`](./IA-DATA-FLOW.md).
- For source-authority decisions around Customer Request persistence, see [`docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md`](../../docs/architecture/CUSTOMER-REQUEST-SOURCE-AUTHORITY.md).

## Key Abstractions

**Module Public Seam:**
- Purpose: Keep domain ownership explicit and prevent routes/adapters from importing private implementation details.
- Examples: `src/modules/customer-request/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/answer-thread/public.ts`.
- Pattern: Public barrel plus private `internal/` implementations and explicit port types; import guardrails are exercised by `tests/imports/`.

**Typed Action Contract:**
- Purpose: Describe an executable operation once for validation, model/tool projection, effect/authority policy, retry semantics, and surface membership.
- Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/capability-execution/operation-execute.actions.ts`.
- Pattern: `defineAction` returns a typed discriminated-result action; the central registry checks unique IDs and projects the same action to UI, HTTP, answer-thread, CLI, or MCP surfaces.

**Convex Source Port:**
- Purpose: Isolate authenticated/public Convex transport and make queries, mutations, and actions callable from server-side adapters without embedding client setup everywhere.
- Examples: `src/lib/server/convex-source.ts`, `sourceQuery`/`sourceAction`, and `convex/*` function references.
- Pattern: Typed transport port over `ConvexHttpClient`; route/domain code supplies a function reference and arguments while Convex adapters own durable context and validators.

**Canonical Identity and Digest:**
- Purpose: Make operation, command, route, evidence, and projection identity stable and detect replay or conflicting writes.
- Examples: `src/modules/common/canonical-digest.ts`, `createPublicOperationRef` in `src/modules/capability-supply/public.ts`, and request compiler digests in `src/modules/customer-request/compiler.ts`.
- Pattern: Canonical serialization plus branded/validated opaque references; callers compare digests rather than trusting display labels.

**Deterministic Plan and Mandate:**
- Purpose: Separate interpretation/proposal from approval, preparation, dispatch, and completion of consequential work.
- Examples: `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/route-mandate.ts`, `src/modules/customer-request/action-preparation.ts`, and `src/modules/customer-request/route-execution/`.
- Pattern: Typed aggregates and route generations with explicit authority (`proposal_only` until approved), bounded inputs, expiry, per-step bindings, effects, data-use, evidence, and recovery policy.

**Projection and Readback:**
- Purpose: Expose stable, redacted contracts to buyers, agents, operators, and the UI without making raw persistence rows public.
- Examples: `src/modules/registry/internal/services-api-projection.ts`, `src/modules/customer-request/application/consumer-plan-projection.ts`, and `src/modules/answer-thread/internal/public-projection.ts`.
- Pattern: Domain-owned projection functions fed by Convex read ports; public API/SSR routes serialize the projection and omit private prompts, credentials, internal hashes, and authority records.

**Fail-Closed Capability Executor:**
- Purpose: Allow live keyless reads while refusing operations whose stored descriptor, provenance, endpoint, input, or output contract is not executable.
- Examples: `src/modules/capability-execution/operation-execute.functions.ts` and `src/modules/answer/internal/answer-tool-use-agent.ts`.
- Pattern: Server-side descriptor lookup, defence-in-depth admission checks, bounded fetch, schema validation, and typed result/refusal; endpoint/credential material is never caller-supplied.

## Entry Points

**TanStack Start Server:**
- Location: `src/start.ts`.
- Triggers: Server startup and every TanStack Start request.
- Responsibilities: Install non-standard method handling, observability, security headers, agent content negotiation, CSRF, source-write admission, and Clerk middleware.

**Browser Router:**
- Location: `src/router.tsx`, with generated route registration in `src/routeTree.gen.ts`.
- Triggers: Browser boot and client navigation.
- Responsibilities: Create the typed TanStack Router, preload routes on intent, restore scroll, and render the not-found component.

**File-Based Routes:**
- Location: `src/routes/`.
- Triggers: Browser URLs, HTTP methods, server functions, OAuth discovery, and API clients.
- Responsibilities: Validate route input, select loaders/actions/handlers, delegate to modules or `src/lib/server/`, and serialize public responses. Examples include `src/routes/index.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.v1.requests.ts`, and `src/routes/api.$.ts`.

**Convex Backend:**
- Location: `convex/schema.ts` and exported functions in `convex/*.ts`.
- Triggers: Typed source queries/mutations/actions, scheduled workers, and Convex HTTP calls.
- Responsibilities: Validate durable arguments, enforce source-write/authz policy, execute domain ports against `ctx.db`, schedule workflow/transport work, and return typed readbacks/results.

**External-Agent CLI:**
- Location: `tools/ae/cli.ts`, invoked by `npm run ae`.
- Triggers: `ae <command> ...` process invocation.
- Responsibilities: Parse command/options, call public HTTP or in-process action surfaces, format human/JSON output, and return stable exit status without claiming hosted evidence for local execution.

## Error Handling

**Strategy:** Validate and refuse at each boundary, use discriminated domain results for expected outcomes, and project failures into protocol-specific envelopes at the outer boundary.

**Patterns:**
- HTTP routes use explicit method handlers and `methodNotAllowed`; `src/routes/api.$.ts` catches unknown API paths and projects them with `src/lib/server/problem.ts` into RFC 9457 `application/problem+json` responses.
- `src/lib/errors.ts` centralizes problem kinds, status defaults, titles, and operation-result projection; route helpers such as `problem`, `jsonError`, and `no-store-response` preserve response headers and no-store policy.
- Domain commands and executors distinguish expected refusal, unavailable, conflict, invalid input, provider error, and success through typed `kind`/`reason` unions. Boundary handlers map those results to HTTP status and public copy rather than exposing internal exceptions.
- Answer streaming catches aborts and turn failures in `src/routes/api.answer.turn.ts`, writes typed error frames, and keeps a terminal SSE response contract separate from non-streaming HTTP problem details.
- `tools/ae/cli.ts` catches `CliFailure`, connection refusal, and unexpected errors, projecting either human stderr or JSON output with a stable kind/code/exit code.

## Cross-Cutting Concerns

**Logging and Observability:**
- `src/start.ts` installs request-scoped Sentry/PostHog handling when enabled; `src/lib/observability/` owns server/client adapters and funnel/event projections.
- Harness, answer-thread, action-invocation, and Convex audit records capture timing, status, evidence, and correlation data without treating telemetry as business authority.

**Validation and Bounds:**
- Zod schemas validate route/action/CLI payloads; Convex validators enforce durable function inputs; JSON Schema validators protect admitted capability inputs/outputs (`src/modules/capability-execution/operation-execute.functions.ts`).
- Boundary helpers such as `src/lib/server/bounded-request-body.ts`, `src/lib/server/rate-limit.ts`, and module-level maximum constants enforce byte, count, depth, time, and turn limits before expensive work.

**Authentication and Authorization:**
- Clerk middleware is installed in `src/start.ts` and providers are mounted conditionally in `src/routes/__root.tsx` for sign-in, sign-up, owner, admin, and claim surfaces.
- Agent customer-request routes use OAuth/bearer authentication in `src/lib/server/customer-request-agent-auth.ts` and `src/modules/customer-request/agent-access.ts`; operator routes apply membership/role checks through Convex authz adapters.
- Source writes carry origin/body-digest/operation-key admission from `src/lib/server/source-write-admission.ts` into `src/modules/security/source-write-admission.ts`; route mandates and action contracts add effect-specific authority requirements.

**Security and Protocol Policy:**
- `src/lib/http/security-headers.ts`, `src/lib/server/method-guard.ts`, CSRF middleware, content negotiation, constant-time helpers, and explicit OAuth discovery routes protect protocol boundaries.
- Credentials and endpoint internals stay in server-side descriptors or authenticated Convex paths; public projections and answer tools receive only the minimum contract needed for the caller.

**Canonicalization and Evidence:**
- `src/modules/common/canonical-digest.ts`, stable JSON helpers, operation refs, command keys, and source revisions bind decisions to immutable inputs.
- Evidence classes remain separate: source/fixture shape, named packets, hosted/provider receipts, and customer observations are represented by different module contracts and are not upgraded merely by a successful model call or local test.

---

*Architecture analysis: 2026-08-08*
*Update when major patterns change*
