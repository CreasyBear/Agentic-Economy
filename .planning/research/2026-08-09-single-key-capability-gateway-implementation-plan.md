# Single-Key Capability Gateway Implementation Plan

**Date:** 2026-08-09  
**Status:** approved; source implementation complete; hosted proof uncertified  
**Decision record:** [`../adr/ADR-035-single-key-capability-gateway.md`](../adr/ADR-035-single-key-capability-gateway.md)  
**Product authority:** [`../PROJECT.md`](../PROJECT.md)  
**Rules:** [`../../RULES.MD`](../../RULES.MD)  
**Contract context:** `local://agent-gateway-context.md`  
**Depends on:** T3 OAuth/device-code issuance, the Cloudflare OS production-readiness extraction, and current Action Invocation, Capability Supply, Money, and error kernels.

## 1. Decision

Model the consumer side after OpenRouter's useful invariant, not its LLM-specific API:

- one AE-issued bearer credential identifies one delegated agent/application;
- the same credential can discover and invoke many admitted Market Operations;
- AE resolves the selected operation, supplier transport, provider connection, current authority, budget, and evidence server-side;
- supplier credentials never cross the gateway boundary;
- the caller key identifies and constrains the caller; it is never provider authority, approval, a mandate, or permission to release an external effect.

Keep Clerk API Keys as the credential issuer and revocation authority. AE remains the authorization, policy, invocation, money, and evidence authority. Do not add an AE-owned token format beside Clerk.

Use one canonical application service and wire contract at `POST /api/v1/operations/execute`, then project it through `/mcp`, the CLI, and Answer tools. This matches the OpenRouter-style developer experience without duplicating execution policy: HTTP is the stable customer protocol; MCP is the agent-native adapter over the same registered action/application service. Existing `/api/v1/requests` remains the first-party Customer Request application over the same lower-level kernels.

The authenticated invocation contract is `operation.invoke:v1`. Existing `operation.execute:v1` remains the narrow public/keyless/read-only executor; it must not be silently widened to keyed, paid, or consequential work.

## 2. Product promise

> Give your agent one AE key. It can use any Market Operation admitted by your access policy. AE keeps supplier credentials private, enforces your budget and approval rules, and returns usage and evidence for every call.

“One key” means one default application credential, not one immortal secret. Owners may rotate, revoke, or create isolated keys later. The first-run path must not force that complexity.

## 3. Current source truth and evidence ceiling

The implementation extends existing source owners rather than introducing parallel authorities:

- **Historical pre-cutover seam (deleted):** `src/lib/server/customer-request-agent-auth.ts` was the Clerk API-key verification seam, rereading live revocation, expiry, subject, and scopes.
- **Historical pre-cutover seams (deleted):** `src/modules/customer-request/agent-access.ts`, `src/modules/customer-request/oauth-state.ts`, and `src/lib/server/customer-request-agent-oauth-api.ts` owned key issuance state, idempotent replay, expiry, owner revocation, PKCE, consent, one-time delivery, and redaction.
- `src/lib/server/mcp-api.ts`, `src/modules/common/action.ts`, and `src/modules/actions/index.ts` own MCP projection, action context, and the registered action contract.
- `src/modules/capability-execution/operation-execute.functions.ts` owns the fail-closed keyless descriptor reread, input validation, SSRF defense, bounded transport, output normalization, and evidence hash.
- `src/modules/capability-supply/public.ts` and
  `convex/capabilitySupplyOperations.ts` own admitted operation identity,
  publication/binding, provenance, conformance, readiness, and lifecycle
  projections that the gateway must reread.
- `src/modules/action-invocation/` owns standalone external-agent origin, durable claims, effect generations, idempotency, cancellation, uncertain outcomes, reconciliation, and durable continuation.
- `src/modules/capability-supply/provider-connection.ts` owns opaque provider credential references, scopes/resources, lifecycle, generation/digest, reauthorization, revocation, and cleanup; `src/modules/capability-supply/route-transport-runtime.ts` owns server-only credential resolution/injection and registered transport execution.
- `src/modules/capability-supply/provider-approval.ts` and
  `convex/capabilityProviderApprovals.ts` own provider approval/readiness
  decisions; the gateway consumes those decisions before reservation, lease
  acquisition, or credential resolution.
- `convex/customerRequestRouteTransportWorker.ts` is the canonical durable-before-I/O route-worker pattern.
- `src/modules/money/` and `convex/moneyLedger.ts` own principal/credential usage, credit, idempotent transactions, free-tier accounting, unknown outcomes, refunds, and payout facts.
- `convex/lib/rateLimit.ts` wraps the installed `@convex-dev/rate-limiter` seam.
- `src/lib/errors.ts`, `src/lib/server/problem.ts`, `src/lib/server/method-guard.ts`, `tools/ae/lib/output.ts`, `src/modules/common/canonical-digest.ts`, and `src/modules/common/stable-hash.ts` own error, transport, CLI, identity, and canonical serialization boundaries.

The declared packages already cover the relevant protocol/runtime responsibilities: `@clerk/tanstack-react-start`, `@convex-dev/rate-limiter`, `@convex-dev/workflow`, `@convex-dev/workpool`, and `@modelcontextprotocol/sdk`. Reuse `es-toolkit`, `@apidevtools/json-schema-ref-parser`, canonical digest/stable serialization, RFC 9457, and authoritative Convex validators where their current seams apply. No new generic verifier, token format, registry, billing ledger, queue, JSON-RPC parser, schema copy, or execution state machine is allowed. If a responsibility does not fit an existing owner, decompose it, search declared dependencies and internal seams, record the evidence-backed decision here, and stop rather than guessing.

The proof ceiling is equally explicit. PAPERCUTS GC-044 requires one canonical auth projection. PAPERCUTS ENV-001, ENV-003, and ENV-004 state that unavailable Convex/source, synthetic local Clerk identities, and source-only OAuth probes do not establish hosted or production proof. A refusal, fixture, mock, retained capture, or local bypass is not positive capability evidence. Hosted proof remains uncertified until the final gate in W8 is exercised against a real deployment and real provider credentials.

## 4. Canonical runtime flow

```text
Agent + AE bearer key
  -> POST /api/v1/operations/execute
     or /mcp -> operation.invoke adapter
  -> verify current Clerk key
  -> load current AE application principal + access grant
  -> invoke(operationRef, input, idempotencyKey)
  -> reread exact admitted operation/publication/binding
  -> classify consequence, spend, data and retry policy from server-owned contract
  -> enforce operation/environment/rate/concurrency/key-budget policy
  -> require explicit approval or current standing mandate where applicable
  -> reread provider approval/readiness/connection generation+digest
  -> reserve money/exposure/data and create durable invocation claim
  -> acquire generation-bound provider connection lease
  -> resolve supplier credential inside server transport only
  -> perform I/O once
  -> persist result | refusal | outcome_unknown before responding
  -> meter Qualified Use, reconcile/refund if needed
  -> return normalized output + evidence + usage; never supplier secrets
```

No automatic provider fallback is allowed after authority is prepared or an effect may have been released. A provider change creates a new invocation, authority, price, and evidence lineage.

## 5. Target contracts

### 5.1 Application principal

Generalize the current `CustomerRequestAgentPrincipal` into one canonical `AgentAccessPrincipal` in `src/modules/agent-access/`:

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

The raw key remains a Clerk secret shown only through the existing one-time OAuth delivery. AE persists identifiers and policy, never the bearer secret.

### 5.2 Access grant

Add one server-owned grant per active application credential. Keep the initial policy deliberately small while preserving the existing mandate vocabulary:

```ts
type AgentAccessGrant = Readonly<{
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: 'sandbox' | 'production'
  operationAccess: 'all_admitted'
  authorityMode: CustomerRequestAuthorityMode
  budgetPolicyRef: string
  ratePolicyRef: string
  lifecycle: 'active' | 'revoked' | 'expired'
  generation: number
  policyDigest: string
  createdAt: number
  expiresAt: number
}>
```

`all_admitted` means all operations that pass current publication, binding, readiness, conformance, and environment gates. It does not mean all effects are authorized. Do not add speculative category/provider allowlists in this slice.

### 5.3 Authenticated invocation

Add `operation.invoke:v1` as one protected application contract exposed by authenticated HTTP and projected as a registered MCP action:

```ts
type OperationInvokeInput = Readonly<{
  operationRef: string
  input: Record<string, unknown>
  idempotencyKey: string
}>

type OperationInvokeResult =
  | Readonly<{ kind: 'completed'; invocationRef: string; operationRef: string; output: JsonValue; evidenceHash: string; usage: UsageSummary }>
  | Readonly<{ kind: 'pending'; invocationRef: string; operationRef: string; retryAfterMs: number }>
  | Readonly<{ kind: 'needs_authority'; invocationRef: string; operationRef: string; authorityRequest: PublicAuthorityRequest }>
  | Readonly<{ kind: 'reconciliation_required'; invocationRef: string; operationRef: string; evidence: PublicReconciliationState }>
  | Readonly<{ kind: 'refused'; operationRef?: string; code: StableInvocationRefusalCode; retryable: boolean; nextAction?: string }>
```

The only caller-controlled execution fields are `operationRef`, contract input, and a bounded idempotency key. Endpoint, method, headers, provider, connection, credential, price, payment recipient, authority generation, operation revision, readiness, approval, and evidence are server-resolved.

Add declarative credential admission to the existing Action contract instead of special-casing tool names in `mcp-api.ts`:

```ts
credentialAdmission?: Readonly<{
  scope: 'market_operations:invoke'
  authority: 'descriptor_classified'
}>
```

`descriptor_classified` means the HTTP/MCP boundary authenticates the base key and passes the server-derived principal; the operation application service derives the required authority mode from the current operation contract. Other actions keep their current static authority mapping.

### 5.4 Operation classes

Classify from server-owned operation/action metadata:

- free + read-only + keyless: `inspect_only`; existing `operation.execute` remains available;
- paid read-only: explicit per-call approval or a current bounded spend mandate;
- external effect: explicit approval or a current bounded effect/data/spend mandate;
- unsupported/ambiguous consequence, price, credential placement, schema, or retry contract: refuse before I/O.

A positive balance is not authority. An API key is not authority. A provider connection is not customer authority.

## 6. Implementation waves

### W0 — Record the architecture and freeze the contract

**Files:** `.planning/adr/ADR-035-single-key-capability-gateway.md`; `.planning/PROJECT.md`; `.planning/UBIQUITOUS_LANGUAGE.md`; maintained wayfinder maps where accepted terminology changes.

**Changes:** record Clerk as credential issuer, AE as authorization/policy authority, the HTTP operation contract as canonical, MCP as its agent-native projection, `operation.invoke:v1` as the protected protocol, and the separation between caller key, access grant, customer authority, provider connection, supplier credential, invocation claim, money ledger, and evidence. Reject a second token format, registry, billing ledger, per-provider action set, and blind fallback.

**Acceptance:** every later workstream cites one canonical contract; no public claim says the key grants approval or provider access. This plan and ADR are the W0 decision artifacts; they do not count as implementation proof.

### W1 — Generalize the credential/principal seam with a clean cutover

**Primary files:** `src/lib/server/customer-request-agent-auth.ts` *(historical pre-cutover; deleted)*; `src/modules/customer-request/agent-access.ts` *(historical pre-cutover; deleted)*; `src/modules/customer-request/oauth-state.ts` *(historical pre-cutover; deleted)*; customer-request schema files; `convex/customerRequestPrincipals.ts` *(historical pre-cutover; deleted)*; `convex/customerRequestAgentOAuth.ts` *(historical pre-cutover; deleted)*; OAuth API; exact schema tests.

**Changes:**

1. Create `src/modules/agent-access/` and move credential/principal/OAuth contracts there. Customer Request becomes a consumer.
2. Rename `customerRequestAgentPrincipals` to `agentAccessPrincipals`; add `applicationRef`, environment, grant generation/digest, and lifecycle indexes. Delete obsolete table/symbols and reseed labelled local data; no shim or migration.
3. Move OAuth client/grant state without changing PKCE, code hashing, single delivery, or redaction.
4. Add `market_operations:invoke`. Existing Customer Request and WorkTree scopes remain capability ceilings on the same key.
5. Rename `authenticateCustomerRequestAgent` to `authenticateAgentAccess` with LSP-assisted caller migration. Preserve live Clerk state reread and fail-closed 401/403 behavior.
6. Resolve the current AE access grant after Clerk verification; reject missing, stale-generation, revoked, expired, owner-, application-, or environment-mismatched grants.

**Acceptance:** one key authenticates MCP, Customer Request, and WorkTree through one verifier; revoke/generation change blocks before action execution; no raw key enters Convex/browser/log/error/inventory; exact schema tests prove clean cutover.

### W2 — Add application policy, budget, and rate admission

**Primary files:** new agent-access module; money module/Convex ports; `convex/lib/rateLimit.ts`; standing mandate validation/policy.

**Changes:**

1. Persist one `agentAccessGrants` row and minimal budget policy per credential.
2. Default to `all_admitted`; no per-operation ACL yet.
3. Add hard daily/monthly per-key spend and maximum concurrency. Enforce transactionally inside the existing money reservation path.
4. Reuse `@convex-dev/rate-limiter` with credential/application admission keys. Owners may lower, not exceed platform ceilings.
5. Reuse standing-mandate data/effect/provider/recipient/purpose/count/concurrency/expiry vocabulary.
6. Preserve distinct free-tier, credit, unknown-charge, refund, and payout facts.

**Acceptance:** concurrent calls cannot oversubscribe budget/concurrency; grant/budget generation changes invalidate unreleased work; balance/budget/authority/rate refusals remain distinct.

### W3 — Define and expose `operation.invoke:v1`

**Primary files:** `src/modules/common/action.ts`; action registry; new `operation-invoke.actions.ts`; new `src/lib/server/operation-invoke-api.ts`; new thin route `src/routes/api.v1.operations.execute.ts`; `src/lib/server/mcp-api.ts`; HTTP and MCP contract tests.

**Changes:** add declarative credential admission; expose the registered `operation.invoke` contract through one HTTP adapter and one MCP adapter; require `Authorization: Bearer` on both; use the HTTP `Idempotency-Key` header and the MCP action's bounded `idempotencyKey` field as projections of the same command identity; authenticate the base key and place the full `AgentAccessPrincipal` in `ActionContext`; delegate both transports to one application service; preserve structured domain results and use RFC 9457 only for transport/auth/server failures; retain anonymous MCP tools unchanged.

**Acceptance:** no/invalid key gets 401 plus the canonical challenge; insufficient grant gets 403 before operation lookup; HTTP and MCP return semantically identical invocation states; transport identity remains attribution only; endpoint/provider/credential/payment injection is rejected.

### W4 — Build the production standalone invocation application service

**Primary files:** new `src/modules/capability-execution/operation-invoke.ts`; existing keyless executor; action-invocation application service/dynamic adapter/Convex durable port; new `convex/capabilityOperationInvocations.ts`; existing supply/money ports.

**Changes:**

1. Reread exact current operation/publication/binding; reject stale, withdrawn, private, nonconformant, unready, environment-mismatched, or unsupported operations.
2. Validate input; never accept transport config.
3. Derive consequence/retry/spend/recipient/data policy server-side.
4. Resolve inspect/approve-each/standing-mandate authority.
5. Bind invocation to principal, credential, application, operation/revision/contract, input, grant generation, price, provider connection generation, and idempotency.
6. Use the existing Convex durable port and standalone external-agent origin; do not copy state machines.
7. Reserve budget/exposure/data/money before release and persist claim before I/O.
8. Use current keyless executor where applicable and registered route transport for provider-backed work.
9. Persist terminal/cancelled/timed-out/uncertain outcomes; `possibly_released` is never retryable.
10. Schedule bounded recovery at claim creation so a crash cannot lose identity or authorize a duplicate effect.

**Acceptance:** same key runs two operations; idempotent replay returns same result and changed material conflicts; every stale preflight yields zero fetches; lost post-release response requires reconciliation; Customer Request and standalone paths share claim/transport/evidence/money semantics.

### W5 — Close provider authority and credential-custody gaps

**Primary files:** provider connection domain/schema/Convex actions; route transport runtime; Customer Request route worker; standalone worker.

**Changes:** consume current provider approval; add bounded server-only provider connection leases bound to generation/digest/invocation/expiry; block new leases on revoke/reauthorize; perform final authority check at lease acquisition; keep credentials inside server resolver; add redacted owner connection read/reauthorize/revoke/cleanup; make live public projection accept `now`.

**Acceptance:** stale/revoked/expired/scope-drifted/unapproved/unready connections refuse before credential resolution; credential refs are never sent as credentials; projections contain no secret/internal authority material; revoke races resolve as no-send or explicit bounded in-flight lease.

### W6 — Recovery, cancellation, errors, and observability

**Primary files:** canonical errors/problem builders; action-invocation recovery/read APIs; observability startup; money usage projections.

**Changes:** reuse stable error vocabularies; add bounded invocation read/cancel/reconcile MCP actions; propagate one correlation ID through admission/invocation/lease/transport/money/evidence; record per-credential/application operation, latency, spend, refusal, unknown/retry/reconciliation metrics; redact content by default; add names-only readiness diagnostics.

**Acceptance:** client-safe problems contain correlation ID and no internals; accepted invocations survive restart; cancel/reconcile are idempotent/cross-principal safe; metrics correlate identifiers without secrets.

### W7 — One-key first-use and settings experience

**Primary files:** agent access authorize/home routes; `AeAgentOperatorConsole`; `AeAssistantInstallFunnel`; supplier connection routes/components.

**Changes:** use the one-key Market Operations promise; ask only the authority question; keep secret in agent-side OAuth delivery only; show key/application/environment/authority/expiry/balance/budget/rate/concurrency/calls/spend/unknown/revoke/expiry; offer one HTTP SDK/curl example and one authenticated MCP setup path over the same contract; separate supplier connections from consumer keys; provide specific recovery copy.

**Acceptance:** one authority choice authorizes one key; same key discovers/invokes eligible operations; no provider credentials in consumer UI; revoke blocks new calls while history remains; browser proof covers responsive consent, empty/loading/error, issue/use/revoke/expiry.

### W8 — Discovery, examples, manifests, and release proof

**Primary files:** discovery agent skill/files/manifest; `.env.example`; deployment manifest; CLI; release workflow/hosted smoke.

**Changes:** publish one credential/OAuth/invocation contract and both official projections (`POST /api/v1/operations/execute` and `/mcp`); make CLI and Answer tools clients of the canonical application service rather than direct executors; add free/paid/effectful/idempotency/recovery examples; manifest config names only; hosted proof uses two real operations from distinct admitted suppliers/connection modes.

**Acceptance:** generated docs match live schemas/routes; no secret/endpoint overrides in examples; exact-revision proof covers issue → discover → invoke A → invoke B → usage → revoke → refused replay.

## 7. Deterministic verification matrix

- **Credential/grant:** create, replay, conflict, expiry, revoke, owner/org binding, wrong identity/scope/app/environment/generation/lifecycle, one-time secret delivery, cross-owner refusal.
- **Operation admission:** same key across two suppliers; stale/withdrawn/private/nonconformant/unready/environment mismatch; malformed input and transport injection; bind every revision/digest/price/connection/approval/readiness/grant gate.
- **Authority/money:** free read under inspect-only; paid/effectful refusal without authority; exact approve-each once; bounded provider/recipient/purpose/data/count/concurrency/spend/risk/expiry; atomic credit/budget/concurrency; distinct free/paid/unknown/reconciled/refunded/payout facts.
- **Durability:** stable idempotent replay; changed-material conflict; crash before release resumes; possible release requires reconciliation/no automatic retry; honest cancellation; cold readback.
- **Credential isolation:** no provider secret/ref in MCP/log/problem/usage/evidence/catalog/key UI; no credential read after earlier refusal; stale generation refuses; revoke race follows lease contract.
- **Regression:** anonymous MCP unchanged; keyless executor unchanged; Customer Request/WorkTree use generalized verifier without widening; Answer Flow keeps deterministic evidence; no parallel registry/ledger/token verifier/transport.

## 8. Test and release gates

Focused tests and the complete repository gates are owned by the Main agent after all source edits settle. This documentation slice runs no formatter, lint, typecheck, codegen, test, build, or validation command.

The eventual release gate must include codegen, typecheck, lint, conformance, release unit/integration, imports, TypeScript standards, SEO, UI contract, build, and `npm run test:release:source`, plus labelled local browser/CLI smoke. The final hosted proof is an exact-revision, fresh-process sequence after deployment consent/configuration. Capture only sanitized request IDs, invocation refs, operation refs, statuses, usage, and revocation; never keys or provider secrets.

No local fixture, mock provider, refusal-only branch, source inspection, or generated manifest can satisfy the hosted proof gate. A positive claim requires two real operations, real Clerk-issued authentication, current provider connection authority, server-only credentials, durable terminal/readback, usage/evidence, and revoke/refused replay.

### 8.1 Source implementation evidence — 2026-08-09

W0-W8 source work is complete. The final source gate passed lint, typecheck,
kernel retirement, 3,378 unit tests, 293 integration tests,
type/import/TypeScript-standard/SEO/UI-contract gates, the 13-case/15-turn
answer evaluation (minimum 9.5/9), and the Nitro/Vercel build. Labelled-local
browser/HTTP proof covered the responsive Assistant access settings surface,
public `SKILL.md` and OAuth metadata, MCP initialization/tool discovery, and
canonical unauthenticated refusal at the protected HTTP gateway. The live
probe found one escaped Clerk-provider exception; `authenticateAgentAccess`
now fails closed to the canonical 401 challenge and has a regression test.

The production manifest remains invalid until the hosted environment provides
the seven scoped source-write key families, canonical origin/allowlist, Clerk,
Convex/source-function, and model-gateway configuration. The linked Vercel
project is currently configured for Node 24.x while the deployment manifest
requires Node 22. Exact-revision issue → discover → invoke A → invoke B → usage
→ revoke → refused replay therefore remains uncertified and must not be
replaced by the labelled-local evidence above.

## 9. Stop conditions

Stop and report rather than guess if:

1. Clerk cannot issue/revoke/reread the required key in the target environment.
2. Provider-backed operations cannot reuse existing transport/action-invocation state without a second execution state machine.
3. Existing money transactions cannot atomically reserve per-key caps.
4. Provider revocation cannot be generation/lease-safe without supplier changes.
5. A consequential operation lacks exact effect/data/recipient/price/retry/evidence metadata.
6. Hosted suppliers cannot satisfy declared credential/readiness/reconciliation behavior.

Never weaken a gate, special-case a provider, add blind fallback, or call local/mock evidence production proof.

## 10. Execution order

`W0 → W1 → W2 → W3 → W4 → W5 → W6 → W7 → W8`.

After W1, W2 and static W3 may run in parallel against the fixed interfaces. W5 may begin beside W4, but its lease contract must land before real provider I/O. UI/docs follow stable runtime contracts. Hosted proof is last.

Smallest vertical slice: generalized key → `POST /api/v1/operations/execute` → current free read → durable usage → revoke → refused replay, with the same call repeated through `/mcp` to prove projection parity.

Production gate: the same key invokes a second provider-backed operation through current server-side connection authority, with budget, approval, credential isolation, durable outcome, usage, and recovery intact. Source implementation is complete. Until this is exercised against a configured hosted deployment and produces the strict validated receipt, hosted proof remains **uncertified**.
