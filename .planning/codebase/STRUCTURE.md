# Codebase Structure

**Analysis date:** 2026-07-14
**Inspected revision:** `63f7fac510915ca9ee88dd44e114b868b64fd5bc` plus the current shared dirty working tree

## Repository Layout

```text
Agentic-Economy/
├── .agents/                         # Repo-local skills and assistant guidance
├── .github/workflows/               # CI, evaluation, release, and hosted-proof workflows
├── .planning/                       # Derived planning, maps, research, state, and graph artifacts
├── convex/                          # Deployable Convex schema, functions, HTTP, cron, and effects
├── docs/architecture/               # Maintainer architecture documents
├── eval/answer/                     # Answer quality cases and evaluators
├── examples/                        # Non-authoritative integration/example programs
├── public/                          # Static browser assets
├── scripts/                         # Repository checks and operational helpers
├── src/
│   ├── app/                         # Residual/alternate application compositions
│   ├── components/                  # React product, Astryx, and answer primitives
│   ├── future-phases/               # Non-current future-facing source placeholders
│   ├── hooks/                       # Shared React hooks
│   ├── lib/                         # HTTP, server, observability, operator, and UI adapters
│   ├── modules/                     # Bounded domain contracts and implementation
│   ├── routes/                      # TanStack browser/resource/API routes
│   ├── server/                      # Server-only support code
│   ├── styles/                      # Global style entrypoints
│   └── views/                       # Route-facing view composition
├── tests/                           # Unit, integration, import, UI, E2E, and deployed smoke proof
├── tools/release/                   # Source and hosted release verifiers
├── vendor/                          # Vendored reference/provenance material
├── AGENTS.md                        # Product and assistant operating contract
├── DESIGN.md                        # UI/visual authority
├── PRODUCT.md                       # Product/trust authority
├── package.json                     # Commands and dependency surface
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # TanStack/Vite/Nitro/Vercel build
├── vitest.config.ts                 # Vitest configuration
└── playwright*.config.ts            # Browser and hosted-smoke configuration
```

## Current Customer Engine Spine

```text
src/routes/engine.tsx
└── src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx
    ├── POST /api/requests
    ├── POST /api/requests/:requestRef/messages
    ├── POST /api/requests/:requestRef/facts
    ├── POST /api/requests/:requestRef/options
    ├── POST /api/requests/:requestRef/authorization
    └── GET  /api/requests/:requestRef
         ↓
src/routes/api.requests*.ts
         ↓
src/lib/server/customer-request-*.ts
         ↓
src/lib/server/convex-source.ts
         ↓
convex/customerRequestApplication.ts
    ├── src/modules/customer-request/semantic-interpreter.ts
    ├── src/modules/customer-request/compiler.ts
    ├── src/modules/customer-request/evaluation.ts
    ├── convex/capabilitySupply.ts
    ├── convex/capabilityContractDocuments.ts
    ├── convex/customerRequestV2.ts
    └── convex/customerRequestV2Preparation*.ts
```

This is the production path to inspect when a query on `/engine` fails or feels inert. The older answer-thread, registry, routing-kernel, examples, and release-verifier paths are adjacent systems, not substitutes for this spine.

## `src/routes/`

**Role:** URL-owned adapters. Route files should parse and map requests, not own domain persistence or routing policy.

### Customer Request routes

- `src/routes/engine.tsx` — human front door; mounts one workspace component.
- `src/routes/api.requests.ts` — human submit.
- `src/routes/api.requests.$requestRef.ts` — human resume.
- `src/routes/api.requests.$requestRef.messages.ts` — natural-language clarification.
- `src/routes/api.requests.$requestRef.facts.ts` — typed fact answer.
- `src/routes/api.requests.$requestRef.options.ts` — single-action option preparation.
- `src/routes/api.requests.$requestRef.authorization.ts` — disclosure/preparation authorization.
- `src/routes/api.requests.$requestRef.approval.ts` — exact prepared-action spend approval; not called by `/engine`.
- `src/routes/api.requests.$requestRef.attempts.ts` — approved action admission; not called by `/engine`.
- `src/routes/api.v1.requests*.ts` — external-agent submit, clarify, facts, options, and resume.
- `src/routes/api.v1.release.ts` — exact revision/readback release surface.
- `src/routes/api.sandbox.capability.ts` — labelled sandbox provider endpoint, not real supply.

### Registry and inquiry routes

- `src/routes/registry.tsx` — human registry.
- `src/routes/$slug.tsx` — published business detail.
- `src/routes/$slug.inquiry.tsx` — qualified inquiry.
- `src/routes/api.businesses.ts`, `api.businesses.search.ts`, and `api.businesses.$slug.ts` — published catalog JSON.
- `src/routes/$slug.ucp.ts` — per-listing machine-readable resource.

### Assistant discovery and answer routes

- `src/routes/llms[.]txt.ts` — assistant index.
- `src/routes/SKILL[.]md.ts` — assistant-use instructions.
- `src/routes/api.answer.turn.ts` — answer-thread SSE turn.
- `src/routes/api.answer.threads*.ts` — answer-thread persistence/readback.

The answer-thread tool runner reads registry actions. It is not the Customer Request compiler or RoutePlan engine.

### Route mechanics

- `src/router.tsx` loads generated `src/routeTree.gen.ts`.
- `src/routes/__root.tsx` owns the Astryx document shell and selective Clerk provider.
- `src/start.ts` composes observability, security headers, CSRF, source-write admission, and Clerk middleware for all Start requests.

## `src/components/`

**Role:** Reusable React presentation.

- `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` — complete current `/engine` UI state machine. It uses component-local state and does not persist `requestRef` in route search/path.
- `src/components/ae/inquiries/` — inquiry and customer-record presentation.
- `src/components/ae/listing/`, `registry/`, and `layout/` — public discovery presentation.
- `src/components/ae/chat/` and `src/components/ai-elements/` — answer-thread presentation, not Request routing.
- `src/components/astryx/` — router/runtime adapters around Astryx primitives.

New visual work follows `DESIGN.md` and Astryx. Presentation files must not become authority for Request state, capability matching, price, or provider outcomes.

## `src/lib/server/`

**Role:** Web-to-application adapters.

### Customer Request adapters

- `customer-request-api.ts` — human submission mapping.
- `customer-request-messages-api.ts` — natural-language refinement.
- `customer-request-facts-api.ts` — current typed requirement answer.
- `customer-options-api.ts` — compare/prepare mapping.
- `customer-request-authorization-api.ts` — preparation disclosure authority.
- `customer-request-approval-api.ts` — exact prepared-action approval.
- `customer-request-action-attempt-api.ts` — exact attempt admission.
- `customer-request-inspect-api.ts` — resumable readback.
- `customer-request-agent-api.ts` — external-agent wrapper over the shared application.
- `customer-request-agent-auth.ts` — Clerk user API-key and scope enforcement.
- `customer-request-release-readback-api.ts` — revision/readback proof.

### Shared server infrastructure

- `convex-source.ts` — authenticated/public Convex HTTP clients and typed function references.
- `bounded-request-body.ts` — request-size enforcement.
- `source-write-admission.ts` — web source-write admission context.
- `sandbox-capability-provider.ts` — labelled sandbox-only provider behavior.

These adapters should remain thin. Customer matching and lifecycle behavior belong in `src/modules/customer-request/` and `convex/customerRequest*.ts`.

## `src/modules/customer-request/`

**Role:** Canonical Request types, interpretation, compilation, evaluation, projection, authority, and provider-result logic.

### Current V2 core

- `public.ts` — supported cross-module exports.
- `agent-contract.ts` — human/agent JSON schemas and `CustomerRequestView`.
- `semantic-interpreter.ts` — model proposal grammar constrained to registered descriptors.
- `openrouter-transport.ts` — OpenRouter JSON transport.
- `compiler.ts` — snapshots, actions, plan revisions, and dirty-tree RoutePlan compilation.
- `evaluation.ts` — facts, candidates, missing information, disclosure, and completion evidence.
- `customer-projection.ts` — customer state projection.
- `internal/convex-v2-schema.ts` — durable V2 validators/table values.
- `runtime.ts` — re-export seam for Convex validators.

### Preparation, approval, and execution domain logic

- `action-preparation.ts` — disclosure/authority projection.
- `preparation.ts` and `preparation-authority.ts` — route candidate and authority rules.
- `customer-option-set.ts` and `option-inspection.ts` — comparable provider option projection.
- `prepared-action-v2.ts` — exact prepared action and selection.
- `approval-grant-v2.ts` — approval material.
- `action-attempt-v2.ts` — attempt admission and reservations.
- `provider-execution-v2.ts` — provider invocation/result validation.
- `provider-reconciliation-v2.ts` — unknown-outcome recovery.
- `service-auth-envelope.ts` — signed external-agent service assertions.

### Support and historical files

- `hosted-agent-journey.ts` — executable hosted verification; not runtime ownership.
- `release-readback.ts` — release evidence projection.
- `legacy-v1.ts`, `legacy-compiler-v1.ts`, `interpreter.ts`, and `internal/convex-schema.ts` — retained V1 compatibility/history.
- `kernel-router.ts` — earlier routing adapter; do not confuse it with the new dirty-tree `compileRoutePlans()` or the separate routing kernel.

## `src/modules/capability-contract/`

**Role:** Mandatory neutral grammar.

- `public.ts` defines exact contract refs, JSON-compatible schemas, customer input annotations, semantic identities, data use, effects, evidence, lifecycle, and the opened `CapabilityDecisionModel`.
- No business-specific vertical type belongs here.
- Contract documents are inert registered data; provider code does not enter the compiler.

## `src/modules/capability-contract-registry/`

**Role:** Exact immutable contract registration, document encoding, schema ownership, and active-version state.

- `public.ts` is the domain seam.
- `internal/convex-schema.ts` contributes registry tables.
- `convex/capabilityContractDocuments.ts` is the durable function implementation.

## `src/modules/capability-supply/`

**Role:** Neutral provider supply registration.

- `public.ts` defines offering, price, commercial relationship, binding, continuation, cancellation, eligibility hashes, and exports import/probe functions.
- `internal/publication-importers.ts` converts AE envelope, OpenAPI, MCP, and x402 descriptions into one canonical publication draft.
- `internal/transport-adapters.ts` validates `http-json:v1` and `mcp-jsonrpc:v1` configuration as data.
- `internal/readiness-probe.ts` defines transport-neutral probe results.
- `internal/convex-schema.ts` owns publication, offering, and binding tables.

The admission registry and the runtime dispatcher registry are separate. Admission of an adapter does not prove that customer preparation can dispatch it.

## `src/modules/provider-integrations/`

**Role:** Provider-specific adapters outside the neutral engine.

The current shared dirty tree contains shipping integration work here. It must remain an adapter/registration concern and must not introduce shipping vocabulary into capability contracts, Customer Request kernel types, ranking, or UI choreography.

## `convex/`

**Role:** Deployed durable backend and effect boundary.

### Composition and platform entrypoints

- `schema.ts` — composes domain-owned table fragments.
- `http.ts` — Convex-hosted routing protocol and MCP endpoints.
- `crons.ts` — scheduled work.
- `auth.config.ts`, `authz.ts` — Clerk JWT and authority resolution.
- `sourceWriteAdmission.ts` — durable write admission.
- `_generated/` — generated Convex bindings, not source authority.

### Capability graph

- `capabilityContractDocuments.ts` — exact contract documents.
- `capabilitySupply.ts` — publication lifecycle, graph query, offering/binding registration, eligibility, and internal eligible-supply query.
- `capabilitySupplyReadiness.ts` — guarded readiness action and rescheduling.
- `business.ts` and `registry.ts` — business registration/publication used by supply eligibility.

### Customer Request aggregate

- `customerRequestApplication.ts` — public application actions and orchestration.
- `customerRequestPrincipals.ts` — external-agent principal ownership.
- `customerRequestV2.ts` — revisions, heads, command replay, and aggregate integrity.
- `customerRequestV2Preparation.ts` — action preparation and disclosure authority.
- `customerRequestV2PreparationEgress.ts` — effectful HTTP option request and reconciliation.
- `customerRequestV2PreparationEgressState.ts` — durable egress allocations/operations.
- `customerRequestV2PreparedAction.ts` — provider-option validation and prepared choice.
- `customerRequestV2ApprovalGrant.ts` — exact human approval.
- `customerRequestV2ActionAttempt.ts` — cumulative spend/data admission.
- `customerRequestV2ProviderExecution.ts` — provider execution.
- `customerRequestV2ProviderReconciliation.ts` — evidence-led recovery.

### Adjacent systems

- `answerThreads.ts` — answer SSE/thread state.
- `inquiries.ts` and `notificationOutbox.ts` — qualified inquiries and delivery.
- `routingKernel*.ts` — separate signed routing-kernel plane.
- `discovery.ts` — `llms.txt`, skill, and discovery resources.
- `devSeed.ts`, `devSeedStore.ts`, `sandboxAcceptanceSupply.ts` — development/sandbox support.

## Persistence Ownership

Table definitions live beside domains and are composed in `convex/schema.ts`:

- `src/modules/capability-contract-registry/internal/convex-schema.ts` — exact contracts;
- `src/modules/capability-supply/internal/convex-schema.ts` — publications, offerings, bindings;
- `src/modules/customer-request/internal/convex-schema.ts` — legacy and V2 Request, preparation, approval, attempt, execution, and reconciliation tables;
- `src/modules/routing-kernel/internal/convex-schema.ts` — separate routing kernel;
- other module schema fragments own registry, inquiry, answer, security, observability, and settings state.

Do not add tables directly to `convex/schema.ts`; add them to the owning module fragment and compose them.

## Customer-Used vs Inert/Supporting Source

### Directly customer-used by `/engine`

- `src/routes/engine.tsx`;
- `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`;
- human `api.requests*` routes;
- customer-request server adapters;
- `convex/customerRequestApplication.ts` submit/refine/facts/resume/compare/authorization;
- semantic interpreter, evaluator, compiler, projection;
- eligible capability supply and exact contracts;
- single-action preparation and HTTP provider option egress.

### Production source but not reached by `/engine`

- external-agent `/api/v1/requests*` routes;
- `capabilitySupply:queryCapabilityGraph`;
- capability publication/owner registration mutations;
- exact approval and attempt HTTP APIs;
- provider execution/reconciliation beyond the absent UI controls;
- the signed routing kernel in `convex/http.ts`;
- MCP transport admission/probing without an egress dispatcher.

### Supporting or proof-only

- `tests/`;
- `eval/answer/`;
- `examples/`;
- `tools/release/`;
- `scripts/`;
- `.planning/` and generated `.planning/graphs/`;
- `docs/`;
- `src/modules/customer-request/hosted-agent-journey.ts`;
- dev seed and sandbox supply/provider files.

### Uncommitted current work

RoutePlan/compiler work is committed at `59dbf7f6`. The shared tree still contains uncommitted planning, governed-inquiry, provider-integration and related collaboration work. These files are live collaboration state but are not exact-revision production proof. Inspect `git diff` before planning or staging, and preserve ownership of unrelated changes.

## Key Diagnostic Locations

When `/engine` fails at the first query:

1. `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` — request payload and generic error projection.
2. `src/lib/server/customer-request-api.ts` — HTTP validation/status mapping.
3. `src/lib/server/convex-source.ts` — Clerk token and Convex URL requirements.
4. `convex/customerRequestApplication.ts:submit` and `interpretCompileCommit` — auth, graph, model, compile.
5. `convex/customerRequestApplication.ts:loadRequestGraph` — eligible supply and exact descriptor construction.
6. `convex/capabilitySupply.ts:listEligible` — business/contract/offering/binding/publication readiness.
7. `src/modules/customer-request/semantic-interpreter.ts` — allowed model result.
8. `src/modules/customer-request/compiler.ts` and `evaluation.ts` — deterministic outcome.

When compare/options fails:

1. `convex/customerRequestApplication.ts:prepareCurrentAction` — one-action gate.
2. `convex/customerRequestV2Preparation.ts` — disclosure and authority.
3. `convex/customerRequestV2PreparationEgressState.ts` — allocations and durable state.
4. `convex/customerRequestV2PreparationEgress.ts` — adapter dispatch and network outcome.
5. `convex/customerRequestV2PreparedAction.ts` — response/evidence validation.

When external-agent requests fail:

1. `src/lib/server/customer-request-agent-auth.ts` — Clerk API-key token type and scope.
2. `src/modules/customer-request/service-auth-envelope.ts` — service assertion.
3. `src/lib/server/customer-request-agent-api.ts` — operation mapping.
4. The same Customer Request application spine used by the human API.

## Naming and Placement Conventions

- `public.ts` — supported module façade.
- `internal/` — module-private policy/schema/commands.
- `*.actions.ts` — reusable action declarations registered in `src/modules/actions/index.ts`.
- `*.functions.ts` — application/server-function adapters.
- `camelCase.ts` — common Convex function-module naming.
- `kebab-case.ts` — common domain utility naming.
- `PascalCase.tsx` — React components.
- TanStack dots encode route nesting, `$name` encodes dynamic segments, and `[.]` escapes literal dots.
- `*.test.ts(x)` — Vitest; `*.spec.ts` — primarily Playwright/browser tests.

## Structural Guardrails

- Read `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` before changing product behavior or UI.
- Read `convex/_generated/ai/guidelines.md` before Convex changes.
- Keep vertical/provider nouns in registered data or `provider-integrations/`, never the neutral compiler.
- Add reusable operations in an owning module action file and explicitly register them in `src/modules/actions/index.ts`.
- Keep routes thin and persistence in Convex.
- Preserve the distinction between admission, readiness, dispatch support, and customer reachability.
- Preserve shared dirty work; stage only files owned by the active ticket.
- Treat maps, tests, examples, fixtures, and scripts as evidence/support, never product completion.
