# Prompt & Data Flow

**Analysis Date:** 2026-09-01

How user prompts, agent requests, and market data actually flow through Agentic Economy. Every claim is anchored to real source read on 2026-09-01.

## 1. Route Inventory (src/routes)

All HTTP entries are TanStack Start file routes (`createFileRoute`) exposing `server.handlers`. Nearly every POST route enumerates every other method as `methodNotAllowed([...])` (e.g. `src/routes/api.chat.anonymous.ts:29-39`).

### Public market read API
| Route | Method | Handler | Adapter → Service |
|---|---|---|---|
| `/api/v1/market-operations/search` | POST | `handleMarketOperationSearchRequest` (src/routes/api.v1.market-operations.search.ts:26) | `readOperationReadRequest` parse → `withHttpRateLimit(request,'public-read')` → `registryOperationsSearchAction.run` → re-validate with `operationChoiceSearchOutputSchema` (lines 30-36) |
| `/api/v1/market-operations/detail` | POST | same pattern | `registryOperationsDetailAction` |
| `/api/v1/market-operations/compare` | POST | same pattern | `registryOperationsCompareAction` |
| `/api/v1/market-operations/inspect-plan` | POST | same pattern | `registryOperationsInspectPlanAction` |
| `/api/v1/services`, `/api/v1/services/search`, `/api/v1/services/$serviceId` | POST | analogous service-surface routes (files exist: src/routes/api.v1.services*.ts) | registry service projections (unverified detail) |
| `/api/v1/registry`, `/api/v1/discovery/examples`, `/api/v1/discovery/schema` | POST | discovery teaching surfaces (src/routes/api.v1.registry.ts, api.discovery.*.ts) | unverified detail |

### Invocation (authenticated) API
| Route | Method | Handler | Notes |
|---|---|---|---|
| `/api/v1/operations/call` | POST | `handleOperationInvokePost` (src/lib/server/operation-invoke-api.ts:412), wired via `OPERATION_INVOKE_ROUTE_CONTRACT` (src/routes/api.v1.operations.call.ts) | 256 KiB body cap (`MAX_OPERATION_INVOKE_BODY_BYTES`, operation-invoke-api.ts:46) |
| `/api/v1/operations` | GET (contract method) | `handleOperationInvokeListGet` (src/routes/api.v1.operations.ts:12) | list own invocations |
| `/api/v1/operations/$invocationRef` | GET | status handler (src/routes/api.v1.operations.$invocationRef.ts) | unverified detail |
| `/api/v1/operations/$invocationRef/cancel`, `/reconcile` | POST | cancel/reconcile handlers (files exist; `parseRecoveryBody` in operation-invoke-api.ts:501+) | recovery bodies capped at 64 KiB (operation-invoke-api.ts:505) |

### Chat surfaces
| Route | Method | Handler | Notes |
|---|---|---|---|
| `/api/chat/anonymous` | POST | `handleAnonymousChatProxyRequest` (src/routes/api.chat.anonymous.ts:82) | browser→Convex proxy; NOT a model endpoint |
| `/t/new` | page | `NewThreadPage` → `OperationChat` with `threadId=null`, `initialPrompt` from `?q=` (src/routes/t.new.tsx:34-45) | |
| `/t/$threadId` | page | `OperationChat` bound to durable thread (src/routes/t.$threadId.tsx) | |

### MCP
| Route | Method | Handler | Notes |
|---|---|---|---|
| `/mcp` | POST/DELETE | `handleMcpRouteRequest` (src/routes/mcp.ts:8) | `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse:true` (src/lib/server/mcp-api.ts:506-510); tools registered per admitted action with `mcpToolName(action)` (mcp-api.ts:292-343) |

### CLI (tools/ae/commands)
Command manifest `COMMANDS` in tools/ae/commands/manifest.ts:118-248; grouped `discover_compare` / `connect_account` / `call_recover` / `supply` / `reference`:
`manifest`, `config`, `search`, `request` (create/list/status), `inspect`, `compare`, `inspect-plan`, `connect`, `doctor`, `account` (status/balance/activity/connections/disconnect), `supply` (status/publish/withdraw/recheck/republish/earnings/connections/connection/connect/reconnect/revoke/retry-cleanup), `fund`, `call`, `history`, `status`, `wait`, `cancel`, `recover`, `revoke`. Entry: tools/ae/cli.ts:13 (`COMMANDS, ROOT_HELP_START` from './commands/manifest').

### OAuth / agent access / well-known
`src/routes/oauth.authorize.ts`, `oauth.token.ts`, `oauth.device_authorization.ts`, `oauth.register.ts`; `src/routes/agent-access.authorize.tsx` (owner approval UI); `.well-known/` routes: `ucp.ts`, `api-catalog.ts`, `oauth-authorization-server.ts`, `oauth-protected-resource.ts`, `http-message-signatures-directory.ts` (src/routes/[.]well-known/). `ae connect` performs OAuth device registration (`AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST`, manifest.ts:3).

### Supply / account / webhooks
`/api/v1/supply.*` (connect, reconnect, retry-cleanup, revoke, detail, list, publish, recheck, republish, status, withdraw, earnings), `/api/v1/account*`, `/api/v1/funding.*`, `/api/v1/market-requests*`, `/api/v1/market-metrics`, `/api/v1/release`, `api.clerk.webhook.ts`, `api.stripe.webhook.ts`, `api.internal.provider-consequence.ts`, `api.internal.secret-lifecycle.ts`, `api.ready.ts`, `api.health.ts`. Convex-side HTTP router (convex/http.ts:15-23): `/chat/anonymous`, `/internal/provider-consequence/journal/{begin,attest,complete,abort}`, `/internal/provider-consequence/x402`, `/internal/secret-lifecycle`.

## 2. Chat Path End-to-End (authenticated)

```
User → /t/new or /t/$threadId → OperationChat.tsx
  submit() (src/components/ae/operation-chat/OperationChat.tsx:172-223)
   ├─ prompt trimmed; MAX_PROMPT_CHARACTERS = 2_000 (OperationChat.tsx:24,176)
   ├─ authenticated: useMutation(api.chatMessages.sendMessage) (OperationChat.tsx:86)
   └─ anonymous: sendAnonymous() → DefaultChatTransport POST /api/chat/anonymous (OperationChat.tsx:118-136)
```

Authenticated flow:
1. `convex/chatMessages.ts` `sendMessage` mutation: `requireChatOwner` → builds frozen `InteractiveBusinessAuthorityContext {principalRef, accountRef, revision, provenance}` (chatMessages.ts:57-63) → `normalizePrompt` (≤2,000 unicode chars, chatMessages.ts:26-31) → rate admission `assertAdmission(ctx,{name:'chat-submit',key:ownerId})` (chatMessages.ts:69-72) → creates thread via `createAgentThread` on `@convex-dev/agent` (`components.agent`) if absent → `saveMessage` prompt → auto-title → marks row `activePromptMessageId/activeStartedAt` → schedules `internal.chatGenerate.generate` (chatMessages.ts:95-110).
2. `convex/chatGenerate.ts` `generate` internalAction: re-authorizes via `internal.chatMessages.authorizeScheduledGeneration` — `resolveScheduledInteractiveAuthorityContext` must still match owner + active prompt, else `chat_generation_authority_invalid` (chatGenerate.ts:69-76) — requires `OPENROUTER_API_KEY`, builds `openRouterGatewayConfig`/`openRouterModel` (chatGenerate.ts:79-89), then `streamDurableChatResponse` → `createChatAgent(model, authority).streamText(...)` with `saveMessages:'promptAndOutput'`, word-chunked stream deltas at 100 ms (chatGenerate.ts:34-52). On any failure it persists a durable failure message and rethrows; `finally` clears the active generation (chatGenerate.ts:92-117). Failure copy: `DURABLE_CHAT_FAILURE_MESSAGE` (chatGenerate.ts:22).
3. `convex/chatTools.ts` `createChatAgent` registers the five model tools: `registry.operations.search|detail|compare|inspectPlan` (queries `api.capabilitySupplyOperations.*` via `ctx.runQuery`) and `operation.invoke` (only when `authority !== undefined`; runs `api.capabilityOperationInvocations.invoke`). Caps are closure-scoped: `MAX_CHAT_TOOL_CALLS = 4`, `MAX_CHAT_EXECUTE_CALLS = 1`, `MAX_CHAT_TOOL_RESULT_BYTES = 64*1024` (chatTools.ts:24-27); `reserve()` refuses with `tool_limit`/`execute_limit` (chatTools.ts:93-102). Every tool output passes `modelFacingOutput`: zod re-validate → strip prompt-injection-looking tags (`<system|assistant|user|tool>` → `[data-tag]`, `<`/`>` → `‹›`) → 64 KiB cap → re-parse (chatTools.ts:66-87). Chat invoke identity: `commandDigest = canonicalDigest({principalId, operationRef, input})`, `idempotencyKey = chat-invoke:<digest>`, principal is `applicationRef:'interactive-chat'`, `environment:'sandbox'`, `scopes:[MARKET_OPERATIONS_INVOKE_SCOPE]`, `authorityMode:'approve_each'` (chatTools.ts:228-243).
4. UI reads back through `api.chatMessages.listMessages` (`listUIMessages` + `syncStreams` on `components.agent`, chatMessages.ts:160-186) and threads via `chatThreads.listThreads/searchThreads` (OperationChat.tsx:70-80).

Authority touchpoints on chat path: `requireChatOwner`/`requireOwnedChatThread` (chatMessages.ts:12-16); frozen `InteractiveBusinessAuthorityContext` carries revision + provenance for scheduled re-authorization; `authorizeScheduledGeneration` re-validates the same context before generation (chatMessages.ts:127-149); `operation.invoke` tool inherits owner authority only via that context — anonymous sessions never get the invoke tool (chatTools.ts:218).

Anonymous flow: OperationChat caps the browser transcript at `MAX_ANONYMOUS_MESSAGES = 12` messages / `MAX_ANONYMOUS_BYTES = 16 KiB` locally (OperationChat.tsx:25-26), then POSTs to the Vite route `/api/chat/anonymous`, which is a pure proxy: resolves Convex site URL (`CONVEX_SITE_URL` or `.convex.cloud`→`.convex.site` rewrite, api.chat.anonymous.ts:63-78), requires `AE_CHAT_PROXY_SECRET` ≥32 chars, edge rate-limit `chat-anonymous-edge`, then fetches `{siteUrl}/chat/anonymous` with headers `x-ae-chat-proxy-secret` + `x-ae-chat-admission-key`, projecting only `SAFE_UPSTREAM_HEADERS` back (api.chat.anonymous.ts:46-49,120-148). Convex side: `anonymousChat` httpAction (convex/chatAnonymous.ts:180-212) re-verifies the proxy secret and admission (`internal.rateLimit.admit` name `chat-anonymous`), validates the body (≤ `MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES`, convex/chatAnonymous.ts:60-93), then `streamAnonymousChatResponse` → `createChatAgent(model)` **without authority** → `streamText({userId:'anonymous-ephemeral'})` — nothing persisted ("Agent 0.7.1 requires a user or thread scope even when storage is disabled", chatAnonymous.ts:171-173) — returns `toUIMessageStreamResponse()`.

## 3. Market / Search Path

```
Browser/CLI/MCP → POST /api/v1/market-operations/search
  → readOperationReadRequest (bounded JSON, 16 KiB cap) → operationSearchInputSchema parse
  → withHttpRateLimit(request, 'public-read')
  → registryOperationsSearchAction.run({data, context:{caller:'http', request}})
  → readCapabilityOperationSearch → sourceQuery('capabilitySupplyOperations:search') → Convex public query capabilitySupplyOperations.search
  → deserializeOperationSearchResult → projectOperationSearchChoices → operationChoiceSearchOutputSchema.safeParse → Response.json (no-store)
```
Anchors: route body `src/routes/api.v1.market-operations.search.ts:31-38`; action `src/modules/registry/operations.actions.ts:13-16`; source adapter `src/modules/capability-supply/operation-source.ts:13-42` (search/detail/compare/inspectPlan/offeringOperationMap all via `callPublicSourceQuery`); output contract `src/modules/registry/operation-choice-contracts.ts:48-55` — `operationChoiceSearchOutputSchema` is a union of `{kind:'ok', schemaVersion:'registry-operations:v1', query, items:PublicOperationChoice[], matchedCount, ranking, pagination, navigation}` | `no_candidates` | `unavailable` (reason: `query_invalid|source_unavailable|source_capacity_exceeded`). `PublicOperationChoice` (choice-contracts.ts:6-20) deliberately drops `navigation[].inputSchema` (`projectChoiceNavigation`) and exposes only operationRef/capabilityId/title/summary/supplier/price/authentication/payment/availability/parameters/navigation — supplier credentials and internal refs never appear.

Web detail page `/operations/$operationRef` runs a server loader calling `readPublicOperationDetailRouteServer` + `listAgentAccessKeysServer` + `readOperationListingEvidence` (src/routes/operations.$operationRef.tsx:43-62) — page data comes from the same registry projection seam, not a separate API.

CLI/MCP reach the same actions: MCP registers every admitted action with `inputSchema: action.schema, outputSchema:{result: action.outputSchema}` (src/lib/server/mcp-api.ts:292-343); the CLI `manifest` command walks `OPERATION_MARKET_ACTION_ENTRIES` (manifest.ts:301+).

## 4. Invocation Path (HTTP gateway → Convex → worker)

```
POST /api/v1/operations/call (or MCP ae_operation_invoke / CLI ae call / Chat tool)
  → handleOperationInvokePost (src/lib/server/operation-invoke-api.ts:412-500)
     readBoundedRequestText ≤256KiB → authenticateOperationGateway (:384-409)
        authenticateAgentAccess (src/lib/server/agent-access-auth.ts:118-244)
           Clerk api_key token → scopes/claims (aeApplicationRef, aeEnvironment)
           key-state re-verify via clerkClient().apiKeys.get
           authorityMode = agentAuthorityModeForScopes(…, {allowCustomerDefault:true})
           resolveAgentAccessPrincipal → Convex mutation authorityBoundary:resolveAgentBinding
              (convex/authorityBoundary.ts:333; consequenceResource 'surface:http:operations-call')
     → operationInvokeAction.schema.safeParse → createOperationInvokeService(request, bodyText)
        operationKey = canonicalDigest({contract:OPERATION_INVOKE_ACTION_ID, principal…, command}) (:54-56)
        sourceWriteAdmissionFromRequest(scope:'protected_action') → callPublicSourceAction('capabilityOperationInvocations:invoke')
  → convex capabilityOperationInvocations.invoke (canonicalAgentInvokeHandler, convex/lib/operationInvocations/authorityHandlers.ts:495-503)
     canonicalAgentPrincipal → resolveInvocationAgentAuthorityHandler (grant binding check)
     → invokeHandler (convex/lib/operationInvocations/invokeActions.ts:307-495):
        1. admit  → internal.capabilityOperationInvocations.admit (admission.ts:157)
        2. canInvokeOperation(args, principal) else refused grant_not_found (:313)
        3. readCurrentOperation → internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot
           → parsePublishedOperationSnapshot + materializeRuntimePublishedOperation (:318-345)
        4. runtime.policy.readGrant → internal.agentAccessPolicy.readActiveGrant (:350-366)
        5. runtime.policy.evaluateAuthority (:368-403):
             full_yolo / bounded_mandate → approved basis standing_mandate_use (mandateRef agent-access-grant:<grantRef>)
             free read (read_only + authorityRequirement none + fixed 0 price) → approved inspect-only
             otherwise → needs_authority with authorityRequest {approve_each, consequence, retryClass, maximumSpend, dataFields}
        6. idempotency.reserve → internal.capabilityOperationInvocations.reserve
             (admission.ts:344-398: idempotency replay via by_credentialId_and_idempotencyKey index,
              loadReservationGrant → assertAgentAccessRateAdmission (per-minute/hour policy) →
              concurrencyAdmissionRefusal (budget.maximumConcurrentInvocations) → insert row state 'pending' +
              recordMarketEvidenceFact 'ae_invocation')
        7. dispatch → internal.capabilityOperationInvocations.dispatch →
             enqueueInvocationDispatch (dispatch.ts:227) → marketDispatchWorkpool.enqueueAction(
             internal.capabilityOperationInvocationWorker.run, {invocationRef}) (dispatch.ts:245-248)
        8. projectOperationResult + persistProjectedInvokeResult → structuredClone(projectedResult) (:495-500)
```

Worker (`convex/capabilityOperationInvocationWorker.ts:92-101`): `run` = `runCapabilityOperationInvocationWithAuthority` (src/modules/capability-execution/invocation-runtime.ts:27-36) which re-admits authority before AND after `prepareInvocationRun` (claim dispatch, provider lease, charge reservation — src/modules/capability-execution/invocation-worker/runPreparation.ts:199) then `releaseInvocationRun` (runRelease.ts:55) performs the provider transport (`routeInvocation` / `runBrokeredX402Transport`, x402Route.ts:163 / brokeredX402.ts:115) and settles: claim/finalize via `claimDispatchHandler`/`finalizeDispatchHandler` (convex/lib/operationInvocations/dispatch.ts:1386/1484), provider lease `issueProviderLease`/`settleProviderLease` (lease.ts:27/92), charge `reserveBrokeredInvocationCharge`/`finalizeBrokeredInvocationCharge` (charge.ts:453/564), then `completeWorkHandler` (workComplete.ts:136) to the Workpool.

Result union (`operationResultValue`): `refused {operationRef, code, retryable, nextAction?}` | `needs_authority` | `pending` | `completed {operationRef, usage{chargeState free_tier|paid|outcome_unknown, amount}}` | `reconciliation_required {invocationRef, operationRef, evidence}` — surfaced in telemetry mapping `gatewayTelemetryForResult` (operation-invoke-api.ts:162-185) and detail copy `gatewayDetail` (:340-358).

Public status projection (`src/modules/action-invocation/operation-public.ts`): `readPublicInvocationStatus` refuses `invocation_not_found` / `cross_principal_refused` before projecting (lines 60-86); `PublicInvocationStatus` exposes only invocationRef/version/action/origin/control/freshness/authority kind/attempts (ref, number, effectGeneration, release, outcome, retry)/history — never owner, source, input, or provider material (comment at lines 53-55). Cancel of a started release is never `cancelled`: it projects `reconciliation_required` with `effect:'possibly_released'` (lines 89-125).

## 5. Authority Touchpoints per Path

| Path | Touchpoint | Anchor |
|---|---|---|
| HTTP/MCP invoke | `authenticateAgentAccess` + `authorityBoundary:resolveAgentBinding` mutation with `consequenceResource:'surface:http:operations-call'` / `surface:mcp:tools-list` / per-action | src/lib/server/agent-access-auth.ts:126-131,227-232; src/lib/server/mcp-api.ts:435-442; convex/authorityBoundary.ts:333 |
| Invoke admission | `canInvokeOperation` + `readActiveGrant` + `evaluateAuthority` (approve_each vs standing_mandate vs free-read) | convex/lib/operationInvocations/invokeActions.ts:313,350-403 |
| Reservation gates | rate policy, concurrency budget, canary envelope | convex/lib/operationInvocations/admission.ts:356-373 |
| Workload continuity | `reconcileInvocationWorkloadAuthority` re-validated by worker run/recover/reconcileScheduled | convex/capabilityOperationInvocationWorker.ts:96,110,148; convex/lib/operationInvocations/authorityHandlers.ts:121,391-455; stale grant → `refuseInvocationBeforeEffectForInvalidAuthority` writes refused `grant_not_found` (:459-481) |
| Chat submit | `requireChatOwner`, `assertAdmission('chat-submit')`, scheduled `resolveScheduledInteractiveAuthorityContext` | convex/chatMessages.ts:57-72,127-149; convex/interactiveAuthority.ts:1-83 (identity binding error taxonomy, 60 s session window :43-46) |
| Owner approvals | `listPendingOperationApprovals` / `decideOperationApproval` via `canonicalOwnerActor` (`resolveBusinessActor`) | convex/capabilityOperationInvocations.ts:152-161; convex/lib/operationInvocations/authorityHandlers.ts:568-584 |
| Supply/provider connections | `ConsequenceAuthorityBoundary` + DelegationService | convex/lib/ownerConsequence.ts:86; convex/lib/providerConnections/owner.ts:587,1453; convex/agentAccessOAuth.ts:923 |
| Anonymous chat | proxy secret `AE_CHAT_PROXY_SECRET` (≥32) + double admission (`chat-anonymous-edge` edge, `chat-anonymous` Convex) + no invoke tool (no authority) | src/routes/api.chat.anonymous.ts:118-148; convex/chatAnonymous.ts:130-159,217-222; chatTools.ts:226 |

## 6. Data Transformations

| Stage | Transformation | Function |
|---|---|---|
| Chat prompt in | trim + whitespace collapse + ≤2,000 unicode chars | `normalizePrompt` convex/chatMessages.ts:23-25 |
| Chat prompt out | persistent thread + promptMessageId | `saveMessage` on `components.agent` (chatMessages.ts:89-94) |
| Anonymous body | exact `{messages:[{role,content}]}` + transcript byte cap | `validateAnonymousChatBody` convex/chatAnonymous.ts:60-93 |
| Model-facing tool output | zod parse → tag sanitize → byte cap → reparse | `modelFacingOutput` convex/chatTools.ts:66-90 |
| Search input parse | bounded JSON ≤16 KiB + `operationSearchInputSchema` | `readOperationReadRequest` (src/lib/server/operation-read-request.ts) |
| Search output projection | descriptor → PublicOperationChoice (drops `navigation[].inputSchema`) | `projectOperationChoice` src/modules/registry/operation-choice-contracts.ts:23-33 |
| Wire ↔ typed result | deserialize/serialize split (Convex returns wire JSON) | `deserializeOperationSearchResult` etc., src/modules/capability-supply/operation-projection.ts |
| Invoke command identity | canonical digest over {contract, principalId, credentialId, applicationRef, environment, command} | `operationKeyFor` src/lib/server/operation-invoke-api.ts:54-59 |
| Chat invoke identity | digest over {principalId, operationRef, input} → `chat-invoke:<digest>` idempotency + correlation | chatTools.ts:232-236 |
| Reservation identity | by_credentialId_and_idempotencyKey unique row; replay of existing | `reserveHandler` admission.ts:347-352 |
| invocationRef | minted with reservation (`reservation.invocationRef`, `invocation:v1`-shaped) and persisted in `capabilityOperationInvocations` | admission.ts:379-392 |
| Invocation → dispatch | `invocationRef` → open dispatch → workId (Workpool) | `dispatchHandler`/`enqueueInvocationDispatch` dispatch.ts:1361,227 |
| Result persistence | projected result JSON assert + persist with reservation cleanup state | `persistProjectedInvokeResult` invokeActions.ts:495-500 |
| Public projection | control/attempt/history rows → PublicInvocationStatus (no owner/source/input) | `projectPublicInvocationStatus` operation-public.ts:196-219 |
| Provider consequence identity | digest of route transport invocation / ticket claims | `providerConsequenceInvocationDigest`, `providerConsequenceTicketClaimsDigest` invocation-worker/jitProviderConsequence.ts:559,603 |
| Recovery evidence | canonical material + `digest = canonicalDigest(material)` | tools/ae/commands/manifest.ts:26-37 |

## 7. Verified Flow Diagram (ASCII)

```
                       BROWSER/CLI/MCP/AGENT
                               │
  /t/new? /t/$threadId?        │        /api/v1/market-operations/search|detail|compare|inspect-plan
        │                       │                       │  (bounded JSON, public-read rate limit)
  OperationChat.tsx             │                       ▼
        │  sendMessage mutation          registry.operations.*Action (src/modules/registry/operations.actions.ts)
        │                       │                       ▼
        ▼                       │             callPublicSourceQuery('capabilitySupplyOperations:*')
  chatMessages.sendMessage ─────┤                       ▼
   (owner authz, rate limit)    │            Convex public query (registry projection)
   schedule chatGenerate ───────┤
        │                       │
  chatGenerate.generate ────────┤   POST /api/chat/anonymous (proxy: AE_CHAT_PROXY_SECRET,
   authorizeScheduledGeneration │        edge admission) → Convex /chat/anonymous (http.ts:15)
   createChatAgent(model,auth)  │        → streamAnonymousChatResponse (NO authority, ephemeral)
   ┌──────────┬───────────────┐ │
   │ search   │ detail/compare│ │   /api/v1/operations/call  (POST ≤256KiB)
   │ inspectPlan (queries)    │ │   authenticateAgentAccess → authorityBoundary.resolveAgentBinding
   └──────────┴───────────────┘ │        │
        │  operation.invoke (≤1) │        ▼
        ▼                        │   capabilityOperationInvocations.invoke (canonicalAgentInvokeHandler)
  api.capabilityOperationInvocations.invoke        │
        │                        │   admit → readCurrentOperation(snapshot) → readGrant
        │                        │   → evaluateAuthority (approve_each / standing_mandate / free-read)
        │                        │   → reserve (rate+concurrency, row 'pending') → dispatch
        │                        │   → marketDispatchWorkpool.enqueueAction(worker.run)
        │                        │        │
        │                        │        ▼
        │                        │   capabilityOperationInvocationWorker.run
        │                        │   reconcileInvocationWorkloadAuthority (re-check)
        │                        │   → prepareInvocationRun (claimDispatch, provider lease, charge reserve)
        │                        │   → releaseInvocationRun (routeInvocation / brokered x402 → provider HTTP)
        │                        │   → finalizeDispatch / record / completeWork
        │                        │        │
        │                        ▼        ▼
        └──── result union: refused | needs_authority | pending | completed{usage} | reconciliation_required
                                 │
                  projectOperationResult → persistProjectedInvokeResult
                  public status projection (operation-public.ts): owner/source/input never returned
```

All anchors above were read from source on 2026-09-01; items marked "unverified detail" were not opened.
