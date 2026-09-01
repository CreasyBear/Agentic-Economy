# ARCHITECTURE.md

**Analysis Date:** 2026-09-01

## System Overview

Agentic-Economy is a Convex-authoritative marketplace for admitted, supplier-hosted callable Operations. The TanStack Start app (Vite) is a projection/gateway layer; all durable state and execution live in Convex. Modules are strictly layered, enforced by an import-boundary test suite (`tests/imports/module-boundaries.test.ts` driven by `src/modules/module-boundaries.ts`).

## Layer Breakdown (real dependency direction)

The authoritative table is the comment header of `src/modules/module-boundaries.ts:1-8`:

```
adapters/actions -> registry | capability-execution | capability-supply
registry -> catalog | capability-supply
capability-execution -> capability-supply | action-invocation | money | agent-access
capability-supply -> capability-contract | business | security
action-invocation -> money | capability-contract
all lower layers -> dependency-free common (and guarded I/O -> network-guard)
```

Each module declares `entrySurfaces` (the ONLY files importable cross-module) and `allowedDependencies` in `MODULE_BOUNDARY_MANIFEST` (`src/modules/module-boundaries.ts:60-95`; e.g. `capability-execution` entry surfaces include `operation-invoke.ts`, `operation-invoke.actions.ts`, `schema.ts`, `convex.ts` and it may depend on `capability-supply | action-invocation | money | agent-access | security | observability | principal-account | secrets | network-guard | capability-contract | common`). Currently `temporaryRuntimeExceptions: []` (`src/modules/module-boundaries.ts:96`); ~66 test-only white-box exceptions are enumerated (e.g. `test-whitebox-44`: `tests/unit/convex/capability-operation-worker-recover.test.ts` → `capability-execution/invocation-worker/charge.ts`).

### Layer 1 — HTTP gateway (src/lib/server/)
- `src/start.ts` — middleware chain: `requestCorrelationMiddleware`, `apiRequestBoundaryMiddleware`, `observabilityRequestMiddleware`, `securityHeadersRequestMiddleware`, `agentContentNegotiationMiddleware`, `csrfMiddleware`, `sourceWriteAdmissionMiddleware`, then Clerk (`clerkRequestMiddleware`, bypassed when `isLocalE2EAuthBypassEnabled()`). Order is significant: security headers before agent-content negotiation, both before auth.
- `src/lib/server/operation-invoke-api.ts` — `createOperationInvokeService(request, bodyText)` builds the `OperationInvokeService` (`invokeOperation`, `listInvocations`, `readInvocationStatus`, `cancelInvocation`, `reconcileInvocation`) by authenticating agent access, computing a `canonicalDigest` operationKey (`operation-invoke-api.ts:57-60`), obtaining source-write admission, and calling Convex public actions (`capabilityOperationInvocations:invoke|listInvocations|readInvocationStatus|cancelInvocation|reconcileInvocation`, lines 47-53). Body capped at `MAX_OPERATION_INVOKE_BODY_BYTES = 256 * 1024`. Telemetry mapping per result kind in `gatewayTelemetryForResult` (lines ~180-210).
- `src/lib/server/mcp-api.ts` — Streamable HTTP MCP host (`createAeMcpServer`). Anonymous tier admits only `surfaces.includes('mcp') && readOnly && credentialAdmission === undefined` actions; authenticated tier admits credential-scoped or authority-mode-allowed tools (lines ~250-260). Tool failures are converted to `ProblemDetails` via `mcpToolFailure`/`mcpToolError` (structured `isError` content). Server instructions (`AE_MCP_INSTRUCTIONS`) teach search → compare → detail → invoke → status/reconcile. Body cap 320 KiB.
- `src/lib/server/problem.ts` — `problem(input, headers)` builds an RFC 9457 `application/problem+json` Response via `buildProblem` from `src/lib/errors.ts`, stamps the request correlation header, and reserves `Content-Type`/`Cache-Control: no-store` (cannot be overridden).
- `src/lib/server/method-guard.ts` — `methodNotAllowed(allowed)` returns a 405 problem with `Allow` header; every API route registers explicit handlers for all unsupported methods so wrong methods never fall through to the SPA shell (see `src/routes/mcp.ts`, `src/routes/api.chat.anonymous.ts`, `src/routes/api.v1.market-operations.search.ts`).
- `src/lib/server/bounded-request-body.ts` — `readBoundedRequestText`/`readBoundedRequestJson` enforce a byte cap (checks `content-length` first, then streams and cancels on overflow) returning `{ok:false, code:'payload_too_large'}` or `invalid_json`.

### Layer 2 — Actions / registry (src/modules/actions, src/modules/registry)
Actions are declared with `defineAction` (`src/modules/common/action`) carrying `{ id, schema, surfaces, name, outputSchema, run }`. Registry market reads: `registryOperationsSearchAction` etc. in `src/modules/registry/operations.actions.ts:16-43`, with contract ids `registry.operations.search|detail|compare|inspectPlan` (`src/modules/registry/operation-action-contracts.ts:89,112,135,158`).

### Layer 3 — Capability execution (src/modules/capability-execution)
- Route contract constants: `src/modules/capability-execution/operation-invoke-entry.ts:16-60` — invoke `operation.invoke` (POST via `CURRENT_OPERATION_CALL_VIA`), list `GET /api/v1/operations`, status `GET /api/v1/operations/{invocationRef}`, cancel/reconcile POSTs; scope `MARKET_OPERATIONS_INVOKE_SCOPE`; contractVersions like `operation.invoke:v1`.
- Application core `operation-invoke.ts`: `createOperationInvokeApplication(runtime)` composes `admitOperationInvoke` → `reserveOperationInvoke` (idempotency) → `invokeReservedOperation` (authority evaluation → dispatch). Refusals before dispatch attempt reservation abandonment (`refuseBeforeDispatch`); any post-dispatch unknown becomes `reconciliationRequiredAfterDispatch` with evidence `{attemptRef, effectGeneration, retry:'reconcile_before_retry'}`.
- Admission `operation-invoke-admit.ts`: parses `operationInvokeInputSchema` (strict: `operationRef`, `input`, `idempotencyKey`), validates public operation ref, computes `inputDigest`/`requestDigest` via `canonicalDigest`, reads grant via `policy.readGrant` (refusal codes `grant_not_found|grant_revoked|grant_expired|grant_generation_stale|environment_mismatch|rate_limited|concurrency_limited|budget_exceeded`), derives a deterministic `invocationRef` = `operation-invocation:v1:<digest>` (`canonicalOperationInvocationRef`), and preflights the current operation (digest match via `currentOperationDigest`, else `operation_not_current`/`operation_unsupported`/`source_unavailable`).

### Layer 4 — Canonical claim / durable action invocation (src/modules/action-invocation)
`src/modules/action-invocation/canonical-claim.ts` defines the single durable-before-I/O claim: `buildCanonicalClaimCommand(input)` (line ~140) produces a `PersistControlCommand` with `commandId = action-invocation-claim:v1:<invocationRef>:<attemptRef>`, an `AuthorityBindingSnapshot`, a `leased` control state, and history row `kind:'claim_before_effect'`; `claimCanonicalInvocation` transacts it and classifies duplicates as `claimed | active | terminal_replay | refused`. The release fence `buildCanonicalReleaseFenceCommand` flips release state to `possibly_released` before network I/O. `CanonicalTerminalOutcome` is `returned (released|possibly_released) | failed (not_released) | uncertain (possibly_released, reconciliationRequiredAt)` — the money/authority reconciliation fence.

### Layer 5 — Money (src/modules/money)
Layout: `public.ts` (22.5KB public API), `server.ts`, `schema.ts`, `money.functions.ts`, and `internal/` (`ledger.ts`, `exact-amount.ts`, `charge-contract.ts`, `funding-quote.ts`, `external-spend.ts`, `convex-schema.ts`, `payout-transfer-http.ts`, `payout-connect-http.ts`, `query-projections.ts`, `delivery.ts`, `payout-policy/`). Convex-side journals live in `convex/money*.ts` (`moneyLedger.ts`, `moneyChargeAdmission|Authorize|Journal.ts`, `moneyPayoutTransfer*.ts`, `moneyRefund.ts`, `moneyCreditTopup.ts`).

## Canonical Invocation Lifecycle (gap → resolution → commitment → invocation → result → outcome)

|Phase|Where|
|---|---|
|**Gap** (NL/agent discovers a capability gap)|Discovery/MCP search: `ae_registry_operations_search` (`registry.operations.search`, `operation-action-contracts.ts:89`), MCP instructions in `mcp-api.ts`|
|**Resolution** (choose + admit operation)|`admitOperationInvoke` (`operation-invoke-admit.ts`): schema parse, grant read, invocationRef derivation, current-operation preflight|
|**Commitment** (idempotency reservation)|`reserveOperationInvoke` via `OperationInvokeIdempotencyPort` (`reserve → reserved|replayed|conflict`; `abandon → abandoned|dispatch_started`), `operation-invoke-admit.ts:150-175`|
|**Invocation** (authority + durable claim + dispatch)|`runtime.policy.evaluateAuthority` → approved/needs_authority/refused (`operation-invoke.ts:230-260`); `buildCanonicalClaimCommand`/`claimCanonicalInvocation` persist `leased` before I/O (`canonical-claim.ts:140,190`); then `runtime.dispatch` returns `enqueued|outcome_unknown|refused`|
|**Result** (typed result union)|`operationInvokeResultSchema`, `src/modules/capability-execution/operation-invoke-contracts.ts:236-290` (see below)|
|**Outcome** (settlement/reconciliation)|`CanonicalTerminalOutcome` (`canonical-claim.ts:56-73`); worker-side settlement/recovery in `capability-execution/invocation-worker/` (`charge.ts`, `recover.ts`, `x402Settlement.ts`, `x402Route.ts` — see white-box exceptions 44-47); reconciliation crons via `convex/crons.ts` → `internal.workloadCron.reconcileDueFacilitatorInvocations` every 15 min|

## Error Model

Single canonical model in `src/lib/errors.ts`, anchored to RFC 9457 and `google.rpc.Code`:

- `PROBLEM_KINDS` (`errors.ts:19-34`): `INVALID_ARGUMENT, FAILED_PRECONDITION, UNAUTHENTICATED, PERMISSION_DENIED, NOT_FOUND, ALREADY_EXISTS, METHOD_NOT_ALLOWED, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, RESOURCE_EXHAUSTED, UNAVAILABLE, INTERNAL, UNKNOWN` + repo-native `no_data` (a 200 ok-outcome, never an error).
- `DEFAULT_STATUS` map (400/401/403/404/405/409/413/415/429/500/503; `no_data`→200).
- `buildProblem(input)` projects `ProblemInput → ProblemDetails` (`type:'about:blank'`, `title`, `status`, `kind`, `code`, optional `detail/instance/reason/retryable` + extras spread FIRST so canonical members always win).
- `GATEWAY_PROBLEM_CODES` (41 stable tokens, `errors.ts:~150-190`) with `GATEWAY_CODE_KIND` mapping each to a kind; `gatewayFailureToProblem` deliberately drops provider/remote text — only stable `code`, canonical `kind`, `retryable` cross trust boundaries (`remoteProblemToProblem`).
- HTTP projection: `src/lib/server/problem.ts:problem()`; 405s: `method-guard.ts`; bounded-body errors: `payload_too_large|invalid_json`.

## Result Union

Defined once in `src/modules/capability-execution/operation-invoke-contracts.ts` — `operationInvokeResultKindValues` and `operationInvokeResultSchema: z.discriminatedUnion('kind', [...])` (lines ~236-290), mirrored by `OperationInvokeResult` type:

|kind|Fields|Meaning|
|---|---|---|
|`completed`|`invocationRef, operationRef, output, evidenceHash, usage, receipt?`|Terminal success with usage/receipt (x402 Base USDC receipt schema, `operationInvokeReceiptSchema`)|
|`pending`|`invocationRef, operationRef, retryAfterMs`|Enqueued, not yet terminal|
|`needs_authority`|`invocationRef, operationRef, authorityRequest`|`PublicAuthorityRequest` (`approve_each|bounded_mandate`, consequence, retryClass, maximumSpend)|
|`reconciliation_required`|`invocationRef, operationRef, evidence, receipt?`|`PublicReconciliationState` with `retry:'reconcile_before_retry'`|
|`refused`|`operationRef?, code, retryable, nextAction?, receipt?`|`code` ∈ 30-value `operationInvokeRefusalCodeValues` (`operation-invoke-contracts.ts:11-43`)|

Refusal codes span: operation validity (`operation_ref_invalid, operation_not_found, operation_not_current, operation_not_ready, operation_unsupported, input_invalid`), grants (`grant_*`, `environment_mismatch`), limits (`rate_limited, concurrency_limited, budget_exceeded, idempotency_conflict`), runtime (`invocation_runtime_unavailable, authority_reader_unavailable, source_unavailable, result_invalid`), authority (`authority_required, authority_denied`), provider (`provider_refused, provider_output_invalid, pre_release_failed, outcome_unknown, payment_lane_not_brokered, reconciliation_required`), recovery (`invocation_not_found, invocation_cancelled, lease_not_current`).

## Key Abstractions

- **Module boundary manifest** — `ModuleDeclaration { name, entrySurfaces, allowedDependencies }` + typed exceptions; enforced by tests/imports.
- **Action** — `defineAction({ id, schema, surfaces, name, outputSchema, run })` (`src/modules/common/action.ts`); surfaces include `http`, `mcp`, `cli`; read-only + `credentialAdmission` gate MCP tool admission.
- **OperationInvokeRuntime** — ports (`currentOperation`, `policy`, `idempotency`, `dispatch`, optional `recovery`) injected into the pure application core; Convex adapter in `convex/capabilityOperationInvocations.ts` + worker `convex/capabilityOperationInvocationWorker.ts`.
- **Canonical claim command** — digest-stamped durable transition (`commandId`, `commandDigest`, `expectedInvocationVersion`, `expectedEffectGeneration`) persisted before any provider I/O.
- **Source-write admission** — middleware `src/start.ts` + `sourceWriteAdmissionFromRequest` on every protected action call (`operation-invoke-api.ts:78-90`).
- **Workload context admission for crons** — `convex/workloadCron.ts`: every scheduled handler admits through `WorkloadContextAdmission` with fixed system refs (`ensurePlatformWorkloadIdentities` self-heals the cron fleet identity); grant-chain re-verification (`attributeInvocationResourceAccount`) is the only account authority for cross-account attribution.
- **Convex components** (`convex/convex.config.ts`): `@convex-dev/workpool`, `rate-limiter`, `agent`, plus 6 named `@convex-dev/aggregate` instances (`ownerActivationByStage`, `marketEvidence`, `marketOperationEvidence`, `marketOperationRatings`, `marketActiveOperations`, `marketActiveSuppliers`); typed env vars incl. x402/CDP custody settings.

## Schema Composition

`convex/schema.ts` is pure aggregation: `defineSchema({ ...chatTables, ...chatSharingTables, ...actionInvocationTables, ...capabilityOperationInvocationTables, ...businessTables, ...catalogTables, ...capabilityContractRegistryTables, ...capabilitySupplyTables, ...agentAccessPrincipalTables, ...agentAccessPolicyTables, ...agentAccessOAuthTables, ...registryTables, ...observabilityTables, ...securityTables, ...moneyTables, ...marketTables, ...principalAccountTables, ...authorityDelegationTables, ...secretReferenceTables, ...recoveryProductionTables, ...marketDemandTables })` — each module owns its tables in `src/modules/<m>/schema.ts` (authority/secrets via `internal/convex-schema.ts`).

## Crons

`convex/crons.ts`: reconcile due facilitator invocations (15 min), facilitator discovery refresh (12 h), Agentic Market snapshots (6 h), API registry refresh (24 h), current market presence (1 h), capability supply readiness (1 h), source-write nonce cleanup (1 h), agent-access OAuth grant cleanup (1 h), daily supplier settlement (`0 0 * * *`) — all routed through `internal.workloadCron.*`.

## Entry-Point Table

|Surface|File|Notes|
|---|---|---|
|App middleware|`src/start.ts`|8-middleware request pipeline|
|MCP|`src/routes/mcp.ts` → `src/lib/server/mcp-api.ts`|POST/DELETE only; all others 405|
|Operation invoke/status/cancel/reconcile|`src/routes/operations.$operationRef.tsx`, `operations.invocations.$invocationRef.tsx`, `api.v1.operations.ts`|gateway via `operation-invoke-api.ts`|
|Market reads|`src/routes/api.v1.market-operations.{search,detail,compare,inspect-plan}.ts`|anonymous POST reads through registry actions (`api.v1.market-operations.search.ts`: bounded body 16 KiB, rate-limited public-read, output re-validated with `operationChoiceSearchOutputSchema`)|
|Anonymous chat|`src/routes/api.chat.anonymous.ts`|18 KiB JSON cap, rate limit, proxies to Convex site `/chat/anonymous` with `AE_CHAT_PROXY_SECRET`; strict origin validation; only 3 safe upstream headers pass back|
|CLI|`tools/ae/cli.ts` (`npm run ae`)|external-agent surface: anonymous HTTP reads, OAuth device flow connect, canonical gateway call/status/wait/cancel/reconcile|
|Convex|`convex/schema.ts`, `convex/crons.ts`, `convex/workloadCron.ts`, `convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationInvocationWorker.ts`|authoritative state + scheduled work|
