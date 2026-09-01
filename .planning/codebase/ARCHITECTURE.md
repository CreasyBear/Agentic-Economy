# Architecture
**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

## Pattern Overview

Agentic Economy is a Convex-authoritative modular monolith with explicit ports, adapters, and feature-module boundaries. The product market is organized around an exact callable **Operation**, rather than a general-purpose agent runtime. An Operation has a contract, provider and transport authority, access requirements, price and terms, effects, readiness, and evidence. Imported registry metadata is not canonical until the capability-supply admission and publication path accepts it.

The system separates five control planes:

1. **Market** — discovery, operation revisions, catalog projections, price/evidence views, and private demand signals.
2. **Authority** — principals, accounts, credentials, grants, ownership, scopes, generations, expiry, and consequence admission.
3. **Execution** — current-operation validation, invocation reservation, idempotency, dispatch, provider calls, leases, results, and recovery.
4. **Economic** — exact money, budgets, reservations, charges, refunds, supplier payable, settlement, and payout evidence.
5. **Evidence** — source provenance, readiness observations, qualification, invocation receipts, terminal outcomes, and bounded projections.

The intended lifecycle is one continuous path: **gap → resolution → commitment → invocation → result → outcome**. A gap can be a user or agent need, an operation that is not yet available, or a private market-demand request. Resolution selects an exact admitted Operation. Commitment freezes the operation revision, material terms, authority and price basis. Invocation executes that commitment idempotently. Result returns a useful value or an explicit continuation. Outcome records what actually happened, including uncertainty and reconciliation requirements.

The current tree is a dirty working tree. In-flight work under `src/components/ae/command-panel/`, `src/components/ae/market/operation-detail/`, `src/components/ae/layout/`, `src/components/ae/settings/`, `convex/capabilitySupplyOperations.ts`, and `package.json` is part of the observed architecture and should not be treated as historical noise.

## Layers

### 1. Web presentation and route layer

TanStack Router/Start owns browser pages, route loaders, middleware, and HTTP route files. `src/start.ts` establishes request correlation, API boundary handling, observability, security headers, content negotiation, CSRF, source-write admission, and Clerk middleware. `src/routes/__root.tsx` provides the root UI providers and route-state shell. Public market pages and authenticated operator pages are composed from `src/components/ae/`.

Routes are deliberately thin. They parse bounded input, apply method and rate-limit guards, call a server adapter or registered action, validate the returned wire shape, and render either a response or a canonical problem. Business policy remains below the route layer.

### 2. Protocol and adapter layer

HTTP, MCP, CLI, chat, Convex, and callback surfaces adapt into the same action and domain seams. `src/lib/server/operation-invoke-api.ts` is the HTTP invocation gateway; `src/lib/server/mcp-api.ts` adapts the action registry to MCP; `tools/ae/cli.ts` and `tools/ae/commands/` expose the external-agent and operator CLI; `convex/http.ts` exposes Convex HTTP endpoints and provider consequence RPCs. These adapters own protocol details, authentication extraction, media types, response shaping, and telemetry, but do not become alternate policy engines.

### 3. Action and application-service layer

`src/modules/common/action.ts` defines the shared action model: stable action identity, credential admission, input schema, consequence class, authority requirement, retry class, effect class, surfaces, output schema, and invocation contract. `src/modules/actions/index.ts` is the action registry used by HTTP/MCP/agent surfaces. Feature application services such as `src/modules/capability-execution/operation-invoke.ts` compose domain ports and transactional commands into complete use cases.

### 4. Market, catalog, and registry layer

`src/modules/registry/` and `src/modules/catalog/` project public market and business/offering views. The canonical operation reads are backed by capability-supply snapshots through `src/modules/capability-supply/operation-source.ts`; `src/modules/registry/operations.actions.ts` provides the action-facing search, detail, compare, and inspect-plan operations. The public Service/Offering projections remain useful market views, but they are not allowed to silently replace the admitted Operation authority.

`src/modules/market/` adds windowed market evidence, availability, cards, rankings, and external/first-party observations. `src/modules/market-demand/` records private credential-owned demand when an existing current match is absent.

### 5. Capability contract and supply layer

`src/modules/capability-contract/` defines and validates the closed JSON input/output contract, customer annotations, data-use declarations, effects, evidence purposes, lifecycle idempotency/recovery, and optional AI SDK-shaped input examples. `src/modules/capability-supply/` owns provider admission, transport binding, source provenance, qualification, publication lifecycle, readiness, provider connections, leases, and runtime materialization.

The supply path is deliberately staged: import or owner draft → normalize and admit contract/transport → bind business, offering, operation and provider authority → qualify the candidate → observe readiness and evidence → publish → materialize a runtime descriptor/current commitment. `src/modules/capability-supply/internal/graph/qualify-candidate.ts` is the full supplied-operation eligibility authority. `src/modules/capability-supply/published-operation.ts` and `src/modules/capability-supply/current-operation.ts` bind the immutable material and its digest, terms, price, readiness, qualification, evidence, and provider connection generation.

### 6. Identity and authority layer

`src/modules/principal-account/` is the canonical identity/ownership model. Principals (`prn_*`) represent humans, organizations, agents, and workloads; Accounts own authority and money. Credentials authenticate a caller but do not themselves establish ownership. `src/modules/agent-access/` models agent principals, API keys, owner-bound grants, scopes, authority modes, expiry, rotation, and OAuth consent.

`src/modules/authority/` resolves consequence authority across HTTP, Convex, MCP, CLI, callback, worker, job, cron, and reconciliation surfaces. `src/modules/authority/context/consequence-authority.ts` re-resolves server-side principal/account/grant facts, checks scope and generation, and passes an immutable admission snapshot to the consequence. `convex/interactiveAuthority.ts` materializes and re-derives Clerk-backed interactive authority; it is not a client-trusted identity cache.

### 7. Invocation and execution layer

`src/modules/capability-execution/` is the canonical Operation call application layer. `operation-invoke-admit.ts` validates strict input, current operation material, grant policy, readiness, binding/configuration and environment; it computes request/input digests and the canonical invocation identity. `operation-invoke.ts` reserves or replays idempotently, evaluates authority, persists the accepted basis, and dispatches only after the reservation and authority checks succeed.

`src/modules/action-invocation/` owns lower-level durable claim, attempt, lease, release-fence, terminal-outcome, status, cancellation, and reconciliation mechanics. `src/modules/capability-execution/invocation-runtime.ts` runs a capability with authority checks before preparation and before release. Retry classes are explicit: replayable, attributable retry, or reconcile-before-retry. An outcome that is not known after dispatch becomes `reconciliation_required`; the system never turns an unknown provider result into a blind retry.

The Convex hosts in `convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationInvocationWorker.ts`, and related identity/runtime files persist and execute these ports. They are hosts and transaction boundaries, not a second domain implementation.

### 8. Economic layer

`src/modules/money/` keeps exact amount arithmetic, pricing digests, budget admission, external-spend reservation, ledger transactions, usage, refunds, supplier payable, reconciliation, and payout separate from invocation control. Convex hosts such as `convex/moneyChargeAdmission.ts`, `convex/moneyChargeJournal.ts`, `convex/moneyChargeReconcile.ts`, and the credit/Stripe/payout hosts expose transactional operations. Economic facts are linked to operation/invocation/evidence references and preserve unknown, pending, reversed, or disputed states instead of collapsing them to a success or zero.

### 9. Convex persistence and workload layer

`convex/schema.ts` composes the feature table bundles. Each feature keeps its schema and domain code under `src/modules/<feature>/`; the `convex/` files expose typed queries, mutations, and actions as thin hosts. `convex/convex.config.ts` registers the Workpool, Rate Limiter, Aggregate, and Agent components.

`convex/workloadCron.ts` is the controlled background boundary. It admits only declared workload identities and consequence operations, binds resource attribution to a canonical workload context, and dispatches through an exact operation switch. `convex/crons.ts` schedules reconciliation, discovery, snapshots, readiness, cleanup, and settlement. Background work therefore uses the same authority and evidence planes rather than an untracked scheduler path.

### 10. Model gateway and chat layer

The chat is a thin product surface for operation discovery and, where authority permits, one controlled execution. `convex/chatMessages.ts` owns authenticated thread/message persistence and schedules generation. `convex/chatGenerate.ts` authorizes the scheduled generation and uses the OpenRouter-only model gateway from `src/modules/model-gateway/`. `convex/chatTools.ts` registers bounded search, detail, compare, inspect-plan, and conditional invoke tools over the canonical operation source. Tool output is inert until the normal operation admission path accepts it; the agent may not invent references, prices, results, approval, or provider facts.

The anonymous edge route `src/routes/api.chat.anonymous.ts` authenticates the edge proxy and rate limit, then forwards to `convex/chatAnonymous.ts`, which has no authority and cannot execute an Operation. `src/modules/chat/tool-card.ts` projects live/stored tool calls and results without erasing execution state.

## Data Flow

### Canonical operation lifecycle

1. **Gap** — A browser, chat user, CLI agent, MCP client, or private demand signal expresses a need. `src/modules/market-demand/market-demand.actions.ts` is used only when no current match is available; it does not create an unverified Operation.
2. **Resolution** — Public search/detail/compare/inspect-plan routes (`src/routes/api.v1.market-operations.search.ts`, `src/routes/api.v1.market-operations.detail.ts`, `src/routes/api.v1.market-operations.compare.ts`, and `src/routes/api.v1.market-operations.inspect-plan.ts`) call the canonical operation source. Search results can be `ok`, `no_candidates`, or an unavailable result; exact detail and comparison preserve typed availability and readiness reasons.
3. **Commitment** — Inspect and invocation preparation freeze the exact `operationRef`, revision/material digest, contract, binding, provider authority, price/priceDigest, effects, terms, qualification, readiness and evidence basis. `src/modules/capability-supply/current-operation.ts` represents this current-operation commitment. A commitment is not permission to dispatch by itself; authority and freshness are checked again at invocation.
4. **Invocation admission** — The caller presents a credential/grant and idempotency key. `src/modules/capability-execution/operation-invoke-admit.ts` resolves canonical authority, parses the contract input, verifies the current commitment and environment, computes digests, and creates or replays the canonical invocation identity.
5. **Execution** — `src/modules/capability-execution/operation-invoke.ts` persists the accepted authority/economic basis and invokes the lower claim/lease/worker runtime. Provider transport and credentials are selected from admitted source-owned material, never from arbitrary request-body credentials.
6. **Result** — The application returns `completed` with literal output, evidence hash, usage and receipt; `pending` with a continuation; `needs_authority`; `reconciliation_required`; or a typed `refused` result. `src/modules/capability-execution/operation-invoke-contracts.ts` is the stable result union.
7. **Outcome** — Terminal output, failure, cancellation, uncertainty and reconciliation are persisted as invocation/evidence facts. Owner/public status projections from `src/modules/action-invocation/operation-public.ts` redact secrets, owner inputs, and provider-sensitive material while retaining the control state and next action.

### HTTP request path

A request enters `src/start.ts`, receives a correlation context and global boundary handling, then reaches a method-guarded route. The route bounds and validates the body with Zod, applies the relevant public or authenticated rate limit, and calls a server adapter. `src/lib/server/convex-source.ts` provides typed sourceQuery/sourceMutation/sourceAction transport. The adapter invokes a registered action or Convex function, validates the wire result, and returns JSON or `application/problem+json` with the correlation header. Unknown methods do not fall through to the SPA: `src/lib/server/method-guard.ts` returns 405 with `Allow`.

The operation invocation gateway in `src/lib/server/operation-invoke-api.ts` handles invoke, list, status, cancel, and reconcile protocol operations. It maps domain results and failures into the common problem model and retains request correlation, authentication, telemetry, idempotency and body bounds.

### CLI and MCP paths

`tools/ae/cli.ts` discovers command modules under `tools/ae/commands/` and shared formatting/config/continuation/policy helpers under `tools/ae/lib/`. Its manifest separates discovery, comparison, inspection, connection/account, call/recovery, supply and reference surfaces. Search/inspect/compare are public reads; call uses either an eligible free keyless path or a connected gateway and then follows the canonical invocation/status/recovery contract.

`src/routes/mcp.ts` accepts only the MCP methods that are meaningful for the mounted server and delegates to `src/lib/server/mcp-api.ts`. The MCP adapter exposes action-registry descriptors, allows anonymous read-only actions, and requires the correct authority scope/mode for consequence actions. MCP tool errors use the same problem vocabulary rather than a separate ad-hoc refusal format.

### Chat path

The authenticated UI in `src/components/ae/operation-chat/OperationChat.tsx` uses `/t/new` and `/t/$threadId` routes. `convex/chatMessages.ts` normalizes and stores the prompt, marks the active message, and schedules `internal.chatGenerate.generate`. `convex/chatGenerate.ts` verifies the scheduled authority, loads the configured model, and calls `convex/chatTools.ts`. Tool calls are capped (`MAX_CHAT_TOOL_CALLS` and one execution call), inspect the exact Operation before execution, and feed typed output back into the durable stream. The UI card projection preserves pending, refused, completed, and recovery states.

### Supplier and background path

Supplier material enters the capability-supply import/admission boundary, where contract and transport shapes are normalized, network access is guarded, credentials/provider connections are controlled, and the candidate is qualified. Publication and readiness state are observed before the Operation is visible as current/routeable. Facilitator discovery, readiness probes, external snapshots, invocation reconciliation, source-write cleanup, OAuth cleanup, and settlement are scheduled by `convex/crons.ts` through the declared workload context in `convex/workloadCron.ts`.

## Key Abstractions

- **Operation revision** — An exact callable market unit identified by an `operationRef`, operation ID and revision/material digest. It is the unit resolved, priced, inspected and invoked.
- **Capability contract** — `defineCapabilityContract` output from `src/modules/capability-contract/define-contract.ts`; a closed input/output schema plus annotations for request construction, comparison, commitment, completion evidence, data use, effects and recovery.
- **Published operation** — `PublishedOperation` in `src/modules/capability-supply/published-operation.ts`; immutable-ish source-owned development evidence with admitted transport, credentials/configuration, price, terms, effects, readiness and provenance.
- **Runtime descriptor/current commitment** — `RuntimePublishedOperationDescriptor` and `CurrentOperationCommitment` bind the exact schemas, target, validators, material pointers, provider authority, price digest, qualification, readiness and retry class used at runtime.
- **Action** — `src/modules/common/action.ts` definition shared across UI, HTTP, agent JSON, chat, CLI and MCP; it declares input/output, effect, authority and invocation behavior instead of letting each surface invent a contract.
- **Principal, Account, Credential and Grant** — Principal is the actor identity; Account owns resources and authority; Credential authenticates; `agentAccessGrant` delegates bounded account authority to an agent principal with scope, generation, expiry, policy and budget.
- **Consequence authority admission** — `src/modules/authority/context/consequence-authority.ts` resolves a surface-specific authority binding and creates an immutable, generation-aware admission basis before a consequence runs.
- **Invocation/claim/attempt/lease** — The durable execution identity, pre-dispatch claim, worker attempt and release fence that make retries and provider uncertainty explicit. `src/modules/action-invocation/canonical-claim.ts` is the lower reusable claim seam.
- **Exact economic facts** — Amounts, pricing digests, reservations, charges, ledger entries, usage, refunds, payable and payouts in `src/modules/money/`; these are not inferred from UI price strings.
- **Evidence and observation** — Source digests, readiness observations, qualification evidence, invocation receipts, settlement evidence and bounded market projections. Unavailable or insufficient evidence is represented as unknown/unavailable, not fabricated health.
- **Typed source ports and projections** — `src/lib/server/convex-source.ts` and feature `*-source.ts` adapters isolate Convex transport; `*-projection.ts` files serialize/deserialise stable public and UI shapes without becoming authority.

## Entry Points

| Surface | Entry point | Responsibility |
|---|---|---|
| Web server | `src/start.ts` | TanStack Start middleware, request boundary, security, observability, auth and content negotiation. |
| Browser router | `src/router.tsx` and `src/routes/__root.tsx` | Router creation, route tree, root providers, pending/error/not-found states and interactive authority materialization. |
| Public market HTTP | `src/routes/api.v1.market-operations.search.ts`, `src/routes/api.v1.market-operations.detail.ts`, `src/routes/api.v1.market-operations.compare.ts`, `src/routes/api.v1.market-operations.inspect-plan.ts` | Method-guarded, bounded, rate-limited operation discovery and inspection. |
| Invocation HTTP | `src/lib/server/operation-invoke-api.ts` and the `/api/v1/operations` route family | Invoke/list/status/cancel/reconcile gateway over the canonical execution service. |
| MCP | `src/routes/mcp.ts` and `src/lib/server/mcp-api.ts` | MCP protocol adapter over the action registry. |
| Anonymous chat | `src/routes/api.chat.anonymous.ts` and `convex/chatAnonymous.ts` | Secret-admitted, rate-limited, no-authority chat proxy and generation path. |
| Authenticated chat | `convex/chatMessages.ts`, `convex/chatGenerate.ts`, `convex/chatTools.ts` | Durable owner thread, scheduled model generation, bounded canonical operation tools. |
| Convex HTTP | `convex/http.ts` | Convex-side anonymous chat, provider consequence RPCs and other backend HTTP endpoints. |
| Convex schema/config | `convex/schema.ts` and `convex/convex.config.ts` | Composed table validators plus Workpool, rate limiter, agent and aggregate components. |
| CLI | `tools/ae/cli.ts` and `tools/ae/commands/` | Machine-readable discovery, connection, call, recovery, supply and operator commands. |
| Background work | `convex/crons.ts` and `convex/workloadCron.ts` | Scheduled maintenance through declared workload authority and resource attribution. |
| Supplier adapters | `src/modules/capability-supply/server.ts` and `convex/capabilitySupply.ts` | Server-side provider import, admission, publication, readiness, qualification and connection ports/hosts. |

## Error Handling

The canonical error model is `src/lib/errors.ts`. Domain and transport failures use a stable kind/code/detail model, canonical `google.rpc.Code`-style kinds and HTTP status mapping. `src/lib/server/problem.ts` serializes it as `application/problem+json`, adds `Cache-Control: no-store`, and carries the correlation ID. Routes and protocol adapters do not invent `{ error: ... }` envelopes for failures.

Method mismatches are handled by `src/lib/server/method-guard.ts` with a 405 and `Allow`; API catch-all/boundary logic prevents incorrect methods and unknown API paths from being interpreted as successful SPA HTML. Request bodies are bounded before parsing through `src/lib/server/bounded-request-body.ts` and route-specific limits.

Capability reads preserve typed states such as no candidates, source unavailable, capacity exceeded, not found, setup required, readiness expired, withdrawn, under review, changed terms, and unsupported input. Invocation preserves `completed`, `pending`, `needs_authority`, `reconciliation_required`, and typed `refused` outcomes. A refusal includes retryability and a next action; an unknown external outcome is never represented as a completed result or silently retried.

Validation fails closed at several boundaries: strict Zod input/output parsing, capability-contract schema checks, operation reference and digest checks, provider/network guards, authority generation checks, readiness/qualification checks, and economic admission. `src/lib/server/remote-problem.ts`/remote mapping and the operation result mapper keep external failures from leaking untrusted provider payloads into the public contract. Observability in `src/start.ts` captures sanitized exceptions while preserving the correlation needed to diagnose them.

## Cross-Cutting Concerns

- **Authority and ownership** — Resolve identity server-side from `src/modules/principal-account/`, `src/modules/agent-access/`, Clerk-backed `convex/interactiveAuthority.ts`, and the authority-boundary adapters. Never infer ownership from a credential ID or request body.
- **Schema and contract validation** — Use Zod and the capability-contract validators at every public boundary. Keep Convex validators and public projections aligned with the canonical module contracts.
- **Revision and integrity** — Operation, publication, binding, contract, price, terms, effect, qualification and authority digests make stale or substituted material observable. Current-operation validation must happen at the point of invocation, not only during discovery.
- **Idempotency and retries** — Invocation identity, reservations, claims, attempt leases and release fences make replay and uncertainty explicit. Retry only under the operation's declared retry class and reconcile before retrying an unknown effect.
- **Network safety** — `src/modules/network-guard/public.ts` and the capability-supply server adapters guard DNS, private/link-local/reserved addresses, redirects, credentials and transport bounds before provider I/O.
- **Request safety** — `src/lib/server/request-correlation.ts`, `src/lib/server/rate-limit.ts`, `src/lib/server/bounded-request-body.ts`, `src/lib/server/api-request-boundary.ts`, and `src/lib/server/source-write-admission.ts` centralize correlation, abuse limits, bounded parsing and privileged source-write checks.
- **Security and telemetry** — `src/start.ts` installs security headers/CSP and sanitized Sentry/PostHog exception/request instrumentation. Secret-bearing credentials and provider inputs stay in server-side/Convex-owned paths.
- **Background attribution** — `convex/lib/workloadCron/context.ts` supplies fixed workload principal/account/ownership/membership facts. Scheduled actions must use declared consequence operations and preserve account/resource attribution.
- **Privacy and projection** — Public operation/search/market projections expose only the evidence, terms and state needed for decision-making. Owner/operator views may expose more control detail; invocation status intentionally redacts input, provider and owner-sensitive fields.
- **Configuration and runtime** — Node `22.x` is required by `package.json`; Convex environment and component configuration live in `convex/convex.config.ts`; server adapters resolve required Convex URLs and secrets centrally rather than from browser-controlled input.
- **Module boundaries** — `src/modules/module-boundaries.ts` enforces direction from adapters/actions through registry/execution/supply to contracts, business and security, with lower layers depending only on common utilities and guarded I/O. Convex hosts should remain thin and feature-owned.
