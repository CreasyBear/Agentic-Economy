# ADR-035 — Single-Key Capability Gateway

**Status:** Accepted; remediation campaign open; seven workstreams focused-verified; payout-period lifecycle blocked for lack of a trusted server-owned nonzero minimum-payout policy; full post-codegen source release gate not green and no later complete rerun; hosted certification blocked  
**Date:** 2026-08-09  
**Supersedes:** None. This decision refines the gateway boundary of ADR-019, ADR-025, ADR-028–031, ADR-033, and ADR-034 without weakening those authority, admission, evidence, lifecycle, money, or proof decisions.  
**Plan:** [`research/2026-08-09-single-key-capability-gateway-implementation-plan.md`](../research/2026-08-09-single-key-capability-gateway-implementation-plan.md)  
**Historical remediation closeout:** [`research/2026-08-11-goblin-source-remediation-plan.md`](../research/2026-08-11-goblin-source-remediation-plan.md)  
**Product authority:** [`PROJECT.md`](../PROJECT.md)  
**Rules:** [`RULES.MD`](../../RULES.MD)

## Context

Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy, and invoke admitted third-party Market Operations. Suppliers host implementations; AE owns admission, caller policy, invocation identity, money, evidence, Qualified Use, and recovery. A consuming developer needs one AE credential that can reach many eligible operations without receiving supplier credentials or silently acquiring consequential authority.

The current source already has the important kernels, but caller identity is still named around Customer Request and the generic keyless executor intentionally refuses keyed, paid, non-GET, x402, and effectful work. The gateway therefore needs one general AE principal/grant and one protected invocation application service, not a second token verifier, registry, billing ledger, or execution state machine.

The source and audit boundary is explicit. PAPERCUTS GC-044 identified inconsistent public auth vocabulary and requires one canonical scheme/issuer/scope projection. PAPERCUTS ENV-001, ENV-003, and ENV-004 record that missing configured Convex/source, synthetic local Clerk identities, and source-only OAuth probes cannot establish hosted or production proof. `PAPERCUTS.md` remains the evidence ledger; no fixture, refusal, mock, retained capture, or local bypass is promoted to positive hosted success.

## Decision

### One key, two authorities

Clerk API Keys remain the credential issuer and revocation authority. AE remains the authorization, operation policy, invocation, money, evidence, and recovery authority. The bearer key identifies and constrains a caller; it is never provider authority, customer approval, a mandate, a payment authorization, or permission to release an external effect.

AE persists only Clerk key identifiers and server-owned policy. The raw key is shown through the existing one-time OAuth/device-code delivery and never enters Convex rows, browser state, MCP output, logs, errors, usage, catalog projections, or evidence.

The general principal is the canonical module contract:

```ts
type AgentAccessPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
}>
```

The initial grant is deliberately broad in operation selection but narrow in authority:

```ts
type AgentAccessGrant = Readonly<{
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: 'sandbox' | 'production'
  operationAccess: 'all_admitted'
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
  budgetPolicyRef: string
  ratePolicyRef: string
  lifecycle: 'active' | 'revoked' | 'expired'
  generation: number
  policyDigest: string
  createdAt: number
  expiresAt: number
}>
```

`all_admitted` means operations that pass current publication, binding, readiness, conformance, and environment gates. It is not blanket effect authority and does not add speculative provider/category allowlists in this slice. A grant is rejected before action execution when it is missing, revoked, expired, owner/application/environment mismatched, or stale by generation.

### One canonical invocation service

The authenticated contract is `operation.invoke:v1`. Its application input is exactly `{ operationRef, input, idempotencyKey }`, plus the authenticated `AgentAccessPrincipal` and a server-generated correlation ID supplied by adapters. The caller cannot choose endpoint, method, headers, provider, connection, credential, price, recipient, authority generation, revision, readiness state, or evidence identity.

The stable customer protocol is:

```text
POST /api/v1/operations/execute
Authorization: Bearer <Clerk API key>
Idempotency-Key: <bounded command key>
{
  "operationRef": "...",
  "input": { ... }
}
```

The route is a thin transport adapter over the one application service. MCP exposes the collision-safe registered action name `operation.invoke`; CLI and Answer tools are clients of that same service, not direct executors. Existing anonymous MCP tools remain unchanged. Existing `operation.execute:v1` remains the public/keyless/read-only executor and must not be widened to keyed, paid, or consequential work.

HTTP protocol/auth/server failures use the canonical RFC 9457 `application/problem+json` seam. Valid invocation refusals and outcomes remain typed domain action results, including `completed`, `pending`, `needs_authority`, `reconciliation_required`, and `refused`; HTTP 200 is not converted into a transport problem merely because a domain operation was refused.

### Authority and operation classes

Server-owned operation/action metadata classifies consequence, price, data use, recipient, retry behavior, credential placement, and evidence requirements:

- free, read-only, keyless work is eligible for `inspect_only` and may continue through `operation.execute:v1`;
- paid read-only work requires one explicit approval or a current bounded spend mandate;
- external effects require one explicit approval or a current bounded effect/data/spend mandate;
- ambiguous consequence, price, credential, schema, retry, readiness, or evidence contracts refuse before credential resolution or I/O.

Positive balance, an API key, an admitted listing, and a provider connection are distinct from authority. Provider changes are never automatic fallback: they create a new invocation, authority, price, and evidence lineage.

The first-use screen asks exactly one material question: **How much may this agent do without asking you?** The choices are Browse only (`inspect_only`), Ask before paid or consequential work (`approve_each`, the default), and Work within limits I set (`bounded_mandate`). `full_yolo` remains an internal ceiling and is not a default public choice. Client scopes may narrow the owner's choice but never widen it.

### Durable runtime flow

```text
Agent + AE bearer key
  → POST /api/v1/operations/execute or /mcp operation.invoke
  → reread current Clerk key and AE principal/grant
  → invoke(operationRef, input, idempotencyKey)
  → reread exact admitted operation/publication/binding
  → classify consequence, spend, data, recipient, and retry policy
  → enforce grant, environment, budget, rate, and concurrency policy
  → require approval or a current standing mandate when applicable
  → reread provider approval/readiness/connection generation + digest
  → reserve money/exposure/data and persist durable invocation claim
  → acquire a short-lived generation-bound provider connection lease
  → resolve supplier credential inside server transport only
  → perform I/O once
  → persist result, refusal, or outcome_unknown before responding
  → meter Qualified Use only after contract-valid delivery; reconcile/refund when required
  → return normalized output, evidence, usage, and correlation ID; never secrets
```

No automatic provider fallback is allowed after authority is prepared or an effect may have been released. `possibly_released` and equivalent uncertain outcomes are never silently retried; recovery is explicit and idempotent.

## Reuse and no-handroll commitments

The gateway extends the following existing owners. The listed path is the source seam to reuse, not a suggestion to copy its behavior:

| Responsibility | Existing owner and seam | Gateway commitment |
|---|---|---|
| Clerk key verification, live revocation, expiry, subject, and scope reread | `src/lib/server/customer-request-agent-auth.ts` *(historical pre-cutover; deleted)* | Generalize to `authenticateAgentAccess` in `src/modules/agent-access/`; migrate callers cleanly; do not add a verifier or token format. |
| Key issuance, idempotent replay, inventory, expiry, and owner revocation | `src/modules/customer-request/agent-access.ts` *(historical pre-cutover; deleted)* | Move/generalize contracts into `src/modules/agent-access/`; retain Clerk as issuer/revoker and AE as grant owner. |
| OAuth/device-code, PKCE, consent, one-time delivery, and redaction | `src/modules/customer-request/oauth-state.ts` *(historical pre-cutover; deleted)*; `src/lib/server/customer-request-agent-oauth-api.ts` *(historical pre-cutover; deleted)* | Reuse the existing protocol and redaction; do not invent a gateway token or secret store. |
| Action contract, context, consequence, authority, material inputs, spend, approval, retry, and registry | `src/modules/common/action.ts`; `src/modules/actions/index.ts` | Add declarative `credentialAdmission: { scope: 'market_operations:invoke', authority: 'descriptor_classified' }`; do not special-case tool names. |
| MCP request-bound identity and action projection | `src/lib/server/mcp-api.ts` | Add the authenticated `operation.invoke` projection over the application service; preserve anonymous tools and SDK schema behavior. |
| Keyless read validation, SSRF defense, bounded transport, output normalization, and evidence hash | `src/modules/capability-execution/operation-execute.functions.ts` | Keep `operation.execute:v1` narrow; reuse it for eligible free reads rather than widening or cloning it. |
| Operation identity, publication, binding, provenance, readiness, conformance, and lifecycle | `src/modules/capability-supply/public.ts`; `src/modules/capability-supply/provider-connection.ts`; `convex/capabilitySupplyOperations.ts` | Reread exact current revision/binding/readiness; refuse stale, withdrawn, private, unready, nonconformant, or environment-mismatched work. |
| Provider approval/readiness and current approval decisions | `src/modules/capability-supply/provider-approval.ts`; `convex/capabilityProviderApprovals.ts` | Consume the current approval/readiness state before reservation, lease acquisition, or credential resolution; do not infer authority from connection existence. |
| Standalone claims, effect generations, attempts, leases, idempotency, cancellation, uncertain outcomes, and reconciliation | `src/modules/action-invocation/` (`application-service.ts`, `canonical-claim.ts`, `attempts.ts`, `lease-control.ts`, `convex-durable-port.ts`, `dynamic-published-adapter.ts`, `dynamic-published-execution.ts`, `reconciliation-evidence.ts`) | Adapt the existing durable state machine and external-agent origin; do not create a second invocation journal/FSM. |
| Standing-mandate authority and bounded effect/data/spend limits | `src/modules/action-invocation/standing-mandate.ts`; `src/modules/action-invocation/standing-mandate-policy.ts`; `src/modules/action-invocation/standing-mandate-validation.ts`; `src/modules/action-invocation/standing-mandate-grant.ts` | Reuse existing authority vocabulary and validation; do not infer approval from key scope, balance, or connection state. |
| Server-only credential resolution, injection, and registered route transport | `src/modules/capability-supply/route-transport-runtime.ts`; `convex/customerRequestRouteTransportWorker.ts` | Use the canonical durable-before-I/O worker and transport runtime; supplier credentials never cross an adapter boundary. |
| Provider connection lifecycle, generation/digest, approval/readiness, reauthorization, revoke, and cleanup | `src/modules/capability-supply/provider-connection.ts` and related Convex actions | Add only the bounded generation-bound lease required to close the check-to-send race; never store secrets in leases or projections. |
| Exact amounts, credit, usage, reservation, unknown charge, refund, payout facts, and idempotent transactions | `src/modules/money/public.ts`; `src/modules/money/server.ts`; `src/modules/money/internal/`; `convex/moneyLedger.ts` | Add per-key reservation/cap admission to the existing money path; do not add a billing ledger or conflate balance, authority, usage, or Qualified Use. |
| Rate and concurrency admission | `convex/lib/rateLimit.ts` with declared `@convex-dev/rate-limiter` | Reuse the mounted rate-limiter component with credential/application keys; owner limits can narrow platform ceilings only. |
| Durable scheduling/recovery | declared `@convex-dev/workflow` and `@convex-dev/workpool` plus existing Convex scheduling seams | Schedule bounded recovery at claim creation; do not use process-local retry maps or a second queue. |
| Canonical digests and stable serialization | `src/modules/common/canonical-digest.ts`; `src/modules/common/stable-hash.ts` | Bind command, policy, contract, provider, money, and evidence identity with existing canonical helpers; no ad hoc JSON/hash format. |
| HTTP errors, method guards, and CLI projection | `src/lib/errors.ts`; `src/lib/server/problem.ts`; `src/lib/server/method-guard.ts`; `tools/ae/lib/output.ts` | Reuse the RFC 9457 model/builders and stable kinds; do not introduce a gateway error vocabulary. |
| Convex transactional authority and generated validators | Convex functions/schema and generated `DataModel`/validators | Keep host validators authoritative; do not duplicate schemas or put Node-only internals in default Convex modules. |
| MCP protocol and schemas | declared `@modelcontextprotocol/sdk` 1.30.0 | Use the installed SDK's `AnySchema`/JSON-schema projection and error path; do not hand-roll JSON-RPC or tool schemas. |
| Clerk integration | declared `@clerk/tanstack-react-start` | Keep issuer/revocation integration at Clerk; no parallel AE credential issuer. |

The declared dependencies are evidence for reuse, not permission to add infrastructure: `@convex-dev/rate-limiter`, `@convex-dev/workflow`, `@convex-dev/workpool`, `@modelcontextprotocol/sdk`, and `@clerk/tanstack-react-start` are already present in `package.json`. The PAPERCUTS senior-maintainer finding also records `es-toolkit`, `@apidevtools/json-schema-ref-parser`, canonical digest/stable serialization, RFC 9457, and Convex validators as deliberate existing seams. Any genuinely uncovered responsibility must first be decomposed and searched against these owners; a new general-purpose mechanism requires evidence in the implementation plan and a stop/report if an existing owner can cover it.

## Implementation sequence and acceptance

The approved implementation plan fixes the order `W0 → W1 → W2 → W3 → W4 → W5 → W6 → W7 → W8` and names source files, contracts, gates, and stop conditions. The smallest vertical slice is generalized key → `POST /api/v1/operations/execute` → current free read → durable usage → revoke → refused replay, repeated through `/mcp` for projection parity.

Each wave must preserve the following gates from [`RULES.MD`](../../RULES.MD): no weakened validator/conformance gate, no proof-class inflation, no fixture/mock/refusal presented as live success, no hard-coded demo path, no tautological tests, no dependency smuggling, no second authority, and no refusal-only delivery. Plan changes are not implementation progress; any false close is reopened.

Positive production proof is deliberately stronger than source/local verification. The final gate requires the same real Clerk-issued key to discover and invoke two real operations from distinct admitted suppliers/connection modes on the hosted deployment, with current grant/policy, budget/approval, server-only supplier credentials, durable outcome/recovery, usage/evidence readback, and revocation followed by a refused replay. Hosted Convex/Clerk/provider credentials, canonical origin, money, and fresh-process readback must be configured and exercised. The remediation campaign remains open: seven workstreams are focused-verified, payout-period lifecycle is blocked for lack of a trusted server-owned nonzero minimum-payout policy, the full post-codegen source release gate is not green and has no later complete rerun, and hosted certification remains blocked. Until that exact-revision proof exists, this ADR and its plan remain **implementation in progress; hosted proof uncertified**.

## Consequences

Consumers get one stable bearer-key workflow while AE retains one policy and execution boundary. MCP, CLI, Answer, and HTTP cannot drift into separate provider or payment paths. A key can span many admitted operations, but every operation is independently re-read, classified, authorized, charged/metered, evidenced, and recovered.

The cost is a general grant/policy model, generation-bound lease, durable invocation records, and explicit recovery/readback. Existing keyless reads remain separate. Supplier connection management remains owner-facing and distinct from consumer-key management. No provider secret, credential reference, internal endpoint, payment recipient, or approval material is part of the public key contract.

This is an accepted source-linked architecture decision, not a current source-remediation completion claim. The 2026-08-11 closeout is historical and superseded for current status by the 2026-08-12 re-audit. The hosted proof ceiling and current blockers are maintained in [`PROJECT.md`](../PROJECT.md); the linked plan, [`ROADMAP.md`](../ROADMAP.md), [`STATE.md`](../STATE.md), and [`wayfinder/MAP.md`](../wayfinder/MAP.md) are derived or dated records.
