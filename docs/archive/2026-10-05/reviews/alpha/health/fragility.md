> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../../README.md) for its successor and remaining limits.

# Fragility posture — 29 September 2026

**Lens.** What can still stop a journey on the request the user is waiting for. Protocol: [fragility elimination](../../../designs/2026-09-28-fragility-elimination-protocol.md), journeys J1–J8. Tracking artefact: [fragility worksheet](../fragility-worksheet.md). This pass reads current source. It does not inject faults, and a worksheet “closed” mark is not a new proof.

**Counts.** Production `src/`, `convex/`, and `tools/ae` only. Tests, `*.d.ts`, and `convex/_generated` are excluded. The `unavailable` count does not also count the spelling `source_unavailable`.

## Posture

FX refresh and telemetry are off the user request. The default Market page is not. Opening `/market` with no view (the discover default) issues **six live Coinbase Bazaar searches** and, when a Jev key is set, a Jev rerank on each page that comes back with two or more Tools. A Coinbase or Jev failure is caught for that rail, so the shell can still render, but the golden path still waits on those calls.

Quote and Call still wait on Formance and, unless the x402 requirement is already persisted, on a live Provider probe. Signing and the paid Provider call run in a worker the Call enqueues; they do not block the HTTP response. Production boot no longer demands model, Stripe, CDP, or Infisical keys. Route `errorComponent` coverage is 47 of 60 UI routes (78.3%). Of 56 worksheet rows, 21 are closed, 8 are only partly closed, and 27 are open.

## External calls on the request path

An external call is a `fetch` or a third-party SDK (Coinbase CDP, PayAI, OpenRouter / TypeSafe Jev, Clerk, Stripe, Formance, Infisical) reached from a server function, a route loader, or a Convex action the user request awaits. Convex queries are this app’s data plane and are not listed. Cron-only work is listed only to show it is off the request.

**Shared, every browser request when Clerk is configured.** `clerkMiddleware` runs when both `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` are set (`src/start.ts:146-147`, `src/lib/deployment/environment.ts:21-24`). Machine routes pass through the same middleware. Sentry setup is a detached import and does not hold the response (`src/start.ts:41-56`).

**Not on any user request.** `fetchCoinbaseReferenceRate` is called only from the reference-rate cron (`convex/referenceRateRefresh.ts:43`). Catalogue decoration and Quote read the persisted row. CDP SQL ingest is the market-flow cron (`convex/marketFlowRefresh.ts:135-144`). The public `lookupVolumes` action still fetches CDP on a cache miss (`convex/marketFlowRefresh.ts:103-127`), but no route loader calls it. The page read is `readMarketFlowCachedVolumes` (`src/modules/market/market-flow.server.ts:14-16`).

### J1 — Find and compare

| Call | When the request waits | Evidence |
|---|---|---|
| Coinbase CDP `searchX402Resources` via `readX402Directory`, then optional Jev `callJevSystemOne` | Default Market discover loader. Six collection queries run in parallel (research, finance, creative, developer, identity, commerce). Each non-empty query searches upstream. Jev runs only when a key is present and the page has 2–24 rows; a Jev failure returns the original page. The home promise is swallowed, so a total failure drops the rails rather than the route. | `src/modules/market/market-route-data.ts:225-257`; `src/modules/market/x402-marketplace-home.ts:4-11`; `src/modules/market/x402-marketplace-home.server.ts:16-18`; `src/modules/market/x402-directory.server.ts:33-48,265-267`; `src/modules/market/x402-directory-reranker.ts:29-68` |
| Indexed catalogue read, then Jev rerank; live CDP `listX402DiscoveryResources` / `searchX402Resources` only if the index returns `index_unavailable` and the filters are ones the SDK can express | Same Market loader, for tools, providers, and browse. Keyword search with `alternativeTo` unset skips this catalogue read (`canonical_search`). | `src/modules/market/market-route-data.ts:250-256`; `src/modules/market/x402-directory-index.server.ts:131-159` |
| Up to three more live `readX402Directory` pages | Tool page `/tools/$providerHost/$slug` when the index has no row for that slug. Upstream errors become `unavailable` inside `readX402Directory`; they do not throw out of the walk. | `src/modules/market/x402-directory-index.server.ts:199-221`; loader `src/routes/tools.$providerHost.$slug.tsx` |
| Jev `rankToolSearchForRegistry` (OpenRouter or TypeSafe). On `JevUnavailableError`, a lexical match keeps a result. | HTTP, MCP, and CLI search after an indexed `source: 'current'` read. | `src/modules/registry/tools.actions.ts:151-171`; `src/modules/registry/tool-reranker.ts:126-137` |
| Coinbase CDP SDK or PayAI `fetch` (`https://facilitator.payai.network/discovery/resources`) | `capabilityToolCatalog.search` when `source` is `coinbase` or `payai`. The for-providers loader always passes `source: "coinbase"`. The list action forwards a caller-supplied `source`. Chat search forces `source: 'current'` and does not take this branch. Default registry search uses `current`. | `convex/capabilityToolCatalog.ts:31-67,91-103`; `src/modules/market/server.ts:124-127`; `src/lib/server/supply-landing.functions.ts:16-18`; `src/routes/for-providers.tsx` loader |

Compare on the Market loader resolves each selected resource from the indexed catalogue server function, not from the live SDK (`src/modules/market/market-route-data.ts:232-236`).

### J2 — Chat answer

| Call | When the request waits | Evidence |
|---|---|---|
| OpenRouter via `openRouterModel` and `agent.streamText` | Signed-in turn and anonymous `POST /api/chat/anonymous`. The turn waits on the model stream. | `convex/lib/chat/generate/run.ts:82`; `convex/lib/chat/generate/stream.ts:95`; `convex/lib/chat/anonymous/http.ts:21`; `convex/lib/chat/anonymous/stream.ts:31` |
| Jev `presentSearch` | Chat tool search, after an indexed `source: 'current'` catalogue read. Failure keeps the unranked page. Bazaar rows come from the compact index query, not a live Coinbase call. | `convex/lib/chat/tools/search.ts:45-48,67-69,184-189`; `convex/capabilityToolCatalog.ts:136-143` |
| Clerk middleware | Signed-in `/t/$threadId`. Anonymous chat does not need a Clerk user, but the middleware still runs when Clerk is configured. | `src/start.ts:146-147` |

Share-link create is local HMAC (`AE_CHAT_SHARE_SECRET`). It is not an outbound call. A missing secret still fails that action.

### J3 — Sign-in and session

| Call | When the request waits | Evidence |
|---|---|---|
| Clerk middleware, and the Clerk SignIn / SignUp client SDK | `/sign-in`, `/sign-up`, and any session check. | `src/start.ts:146-147`; `src/routes/sign-in.$.tsx`; `src/routes/sign-up.$.tsx` |
| Clerk Backend `users.getUser`, plus organization invitation and update | Team & roles loader, and workspace profile save. | `src/components/ae/settings/team-roles/team-roles.functions.ts:17,39`; `src/lib/server/workspace-profile.functions.ts:44,80` |

`CLERK_JWT_ISSUER_DOMAIN` is required when the Convex auth module is evaluated (`convex/auth.config.ts:3-20`). That is deploy time, not a per-page fetch.

### J4 — Fund credit

| Call | When the request waits | Evidence |
|---|---|---|
| Stripe `checkout.sessions.create` | Owner starts Checkout. | `src/lib/server/stripe-checkout-evidence.ts:61` |
| Stripe `checkout.sessions.retrieve` | Authenticated return fulfilment. The return page does not treat the redirect as proof of payment. | `src/lib/server/stripe-checkout-evidence.ts:260`; `convex/lib/money/funding/returnFulfillment.ts:27` |
| Stripe `customers.create` | Customer portal when no Stripe customer exists yet. | `src/lib/server/stripe-customer-portal.ts:193` |
| Formance funding booking | The same once-only settlement path as the signed webhook, after Stripe reports the Session paid. | `convex/moneyStripeWebhookWorker.ts` (`fulfillReturn`); Formance actions in `convex/moneyFormance.ts` |

These calls are hard for funding only. They are not on Market or chat.

### J5 — Quote, Call, receipt

| Call | When the request waits | Evidence |
|---|---|---|
| Formance `adjustSpendingPeriod`, `syncCapacity`, `readDisplayBalance`, `readSpendingPeriod`, `readPeriodSpend` | Managed Quote, before a quote is issued. | `convex/lib/capabilityExecution/quotes/quoteAction.ts:43-75,146-175`; `convex/lib/capabilityExecution/quotes/environmentHelpers.ts:40` |
| Provider HTTP probe (`inspectX402SellerEndpoint` → `sendGuardedHttpRequest`) | Quote, unless `x402QuoteSource === 'persisted'` (then the stored requirement is bound). Call, when the quote already has an x402 digest, probes again before enqueue. | `convex/lib/capabilityExecution/quotes/quoteAction.ts:75-85`; `convex/lib/capabilityExecution/callLifecycle/agentCallExecution.ts:88-93`; `convex/capabilityCallLiveX402.ts:37`; `src/modules/capability-supply/internal/x402-seller-endpoint-inspector.ts` |
| Formance `reserveManagedCall` | Call admission, before the response. | `convex/lib/capabilityExecution/callLifecycle/callFinancialReservation.ts:75` |

The paid effect itself is not on the waiting request. `enqueueCallDispatch` queues `capabilityCallWorker.run` and the action returns pending (`convex/lib/capabilityExecution/callLifecycle/dispatchEnqueue.ts:33-55`). That worker is where CDP `CdpClient.evm.signTypedData` runs (`src/modules/capability-supply/internal/cdp-x402-payment-signing.ts:117-134,284`), along with the Provider call and the consequence bridge (`src/modules/capability-execution/call-worker/providerConsequenceBridge.ts:214-235`). Coinbase FX is not called here; Quote reads the persisted rate.

### J6 — Agent connect, CLI, MCP, HTTP

| Call | When the request waits | Evidence |
|---|---|---|
| Clerk `apiKeys.verify` / `apiKeys.get` | Every bearer-authenticated API or MCP request, behind the same Clerk middleware as the browser. | `src/lib/server/agent-access-auth.ts:185-217`; `src/start.ts:146-147` |
| Clerk `apiKeys` list, create, and revoke | Agent directory loader (3 second budget; failure degrades the key shelf) and OAuth credential issuance. | `src/routes/_operator/agent-access.tsx:43-47`; `src/modules/agent-access/agent-access-console.ts:144-163`; `src/modules/agent-access/agent-access.functions.ts:493-498`; `src/lib/server/agent-access-oauth/credential-issuance.ts` |
| Same Jev search as J1 | `ae find`, MCP tool search, and `/api/v1/market-tools/search`, after the indexed read. | `src/modules/registry/tools.actions.ts:170-171` |

The agent directory loader does not call Formance. OAuth consent is Clerk MFA in the browser, not a second catalogue client.

### J7 — Provider publish

| Call | When the request waits | Evidence |
|---|---|---|
| Guarded HTTP to the Provider OpenAPI, MCP, or x402 URL | Source preview and validation. A target that is not public HTTP is refused before the fetch. | `src/modules/capability-supply/source-preview.ts:656-668`; `src/modules/capability-supply/internal/mcp-source-discovery.ts:80-81` |
| Jev `callJevSystemOne` with `purpose: 'provider_source'` | Source review of a selected candidate in the supply funnel. | `src/modules/capability-supply/source-assessment.ts:69`; `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts:72` |
| Provider OAuth token HTTP, and Infisical | Connect or revoke of a credentialed source. | `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:534`; `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-revoke.ts:61`; `src/modules/secrets/infisical-cloud.ts:102-103` |
| Coinbase CDP catalogue search (`source: "coinbase"`) | `/for-providers` loader, via `readMarketRouteProjection`. A catalogue `unavailable` result throws, and the route error boundary renders. | `src/routes/for-providers.tsx`; `src/lib/server/supply-landing.functions.ts:16-18`; `src/modules/market/server.ts:124-127` |

Canonical publish and withdraw are Convex mutations. They do not call Coinbase on that request. The directory projection still shares the publication transaction (worksheet U4). That coupling is local, not an outbound call.

### J8 — Operator

The admin overview loader does not call Formance. `readFormancePresence` only checks whether Formance config parses (`src/modules/money/server.ts:32-34`, used from `src/components/ae/admin/overview/readAdminOverview.functions.ts:7-16`). Operator pages wait on Clerk middleware and the operator `beforeLoad` entitlement read (`src/routes/_operator.tsx`, `src/lib/operator/route-options.ts:38-42`). A Formance or Stripe call happens only if the operator then runs a money action. That is the J4/J5 fence, not the queue page.

## Hedging states by module

Token counts in production source. `fallback` is split into React `fallback=` props (Suspense, error boundaries, Clerk sign-in placeholder) and every other `fallback` mention. Quoted literals are the string forms of the same word.

**Totals:** `unavailable` 1,354 (848 quoted); `source_unavailable` 583 (566 quoted); `degraded` 81 (52 quoted); `fallback` 97, of which 17 are React props and 80 are other mentions (2 quoted `'fallback'`).

Many `unavailable` literals are retained refusals (`inspection_unavailable`, authority, insufficient balance). The protocol does not treat those as hedging to delete. Worksheet W5 still names the hedging the redesigned paths were supposed to remove: cold-start upstream serving (F1), ranker `unavailable` (F2/C1), model retry over completed facts (C2), rollout refusal (U5), and enrichment `unavailable` modes.

| Module | unavailable | source_unavailable | degraded | fallback (other / React) |
|---|---:|---:|---:|---:|
| src/components | 370 | 82 | 16 | 7 / 17 |
| src/modules/capability-supply | 173 | 129 | 2 | 4 / 0 |
| src/lib | 83 | 96 | 8 | 29 / 0 |
| src/modules/market | 74 | 42 | 0 | 6 / 0 |
| convex/lib/capabilityExecution | 81 | 18 | 0 | 0 / 0 |
| src/modules/money | 80 | 16 | 0 | 1 / 0 |
| src/modules/discovery | 42 | 2 | 29 | 0 / 0 |
| src/modules/agent-access | 34 | 37 | 0 | 2 / 0 |
| src/routes | 40 | 21 | 8 | 2 / 0 |
| src/modules/registry | 55 | 8 | 5 | 0 / 0 |
| convex/lib/capabilitySupply | 54 | 9 | 0 | 0 / 0 |
| tools/ae | 43 | 7 | 3 | 7 / 0 |
| src/modules/capability-execution | 30 | 24 | 0 | 4 / 0 |
| convex (root actions) | 29 | 15 | 0 | 0 / 0 |
| src/modules/market-demand | 3 | 38 | 1 | 0 / 0 |
| convex/lib/market | 27 | 6 | 0 | 2 / 0 |
| convex/lib/money | 24 | 8 | 0 | 0 / 0 |
| src/modules/chat | 28 | 1 | 2 | 0 / 0 |
| convex/lib/chat | 13 | 3 | 2 | 5 / 0 |
| src/modules/catalog | 16 | 2 | 2 | 0 / 0 |
| src/content | 6 | 4 | 0 | 2 / 0 |
| convex/lib/agentAccess | 11 | 0 | 0 | 0 / 0 |
| src/modules/security | 3 | 6 | 0 | 1 / 0 |
| src/modules/decision-engine | 1 | 1 | 0 | 5 / 0 |
| convex/lib/capabilityContract | 6 | 0 | 0 | 0 / 0 |
| convex/lib/adminConsole | 5 | 1 | 0 | 0 / 0 |
| convex/lib/platform | 2 | 1 | 0 | 2 / 0 |
| src/modules/capability-contract-registry | 4 | 0 | 0 | 0 / 0 |
| src/modules/common | 1 | 0 | 3 | 0 / 0 |
| src/modules/seo | 4 | 0 | 0 | 0 / 0 |
| convex/lib/secrets | 4 | 0 | 0 | 0 / 0 |
| src/hooks | 3 | 0 | 0 | 0 / 0 |
| convex/lib/principalAccount | 0 | 2 | 0 | 1 / 0 |
| src/modules/secrets | 1 | 1 | 0 | 0 / 0 |
| src/modules/actions | 2 | 0 | 0 | 0 / 0 |
| src/modules/network-guard | 0 | 2 | 0 | 0 / 0 |
| src/modules/chat-sharing | 0 | 1 | 0 | 0 / 0 |
| src/modules/model-gateway | 1 | 0 | 0 | 0 / 0 |
| convex/lib/authority | 1 | 0 | 0 | 0 / 0 |

The live upstream branch is still in the Market module: `src/modules/market/x402-directory-index.server.ts:142` logs `using upstream fallback`, and `readX402Directory` returns `reason: 'source_unavailable'` (`src/modules/market/x402-directory.server.ts:61`).

## Route `errorComponent`

TanStack Router inherits `errorComponent` from the nearest ancestor that defines one. Counts are from `src/routeTree.gen.ts` (155 file routes plus `__root__` = 156). “Own” means the route module contains `errorComponent:` or spreads `operatorRouteOptions` / `operatorLayoutRouteOptions`.

| Set | With own or inherited | Own | Inherited only | Missing | Share with a boundary |
|---|---:|---:|---:|---:|---:|
| UI routes (`component:`) | 47 / 60 | 47 | 0 | 13 | **78.3%** |
| All generated routes | 52 / 156 | 51 | 1 | 104 | **33.3%** |

The inherited-only route is `/$slug/ucp` (`src/routes/$slug.ucp.ts`), a JSON handler under `/$slug`, which does define `errorComponent`. That inheritance does not change the HTTP handler. Four redirect-only operator routes (`/owner/`, `/owner/market`, `/owner/team`, `/owner/workspace`) set `errorComponent` via `operatorRouteOptions` but have no `component`, so they sit in the all-routes figure and not in the UI figure.

Every covered UI route sets its own `errorComponent`. The pathless `/_operator` layout also sets one (`src/routes/_operator.tsx`, `src/lib/operator/route-options.ts:38-42`), so a future operator leaf would inherit it. `/t/new` does not inherit from `/t/$threadId`; they are siblings. `__root__` wraps the outlet in `AeObservabilityErrorBoundary` (`src/routes/__root.tsx:101`) and does not set `errorComponent`, so a loader failure on the routes below is not a route boundary.

UI routes with neither an own nor an inherited `errorComponent`:

- `__root__` — `src/routes/__root.tsx`
- `/about` — `src/routes/about.tsx`
- `/developers/api` — `src/routes/developers.api.tsx`
- `/developers/discovery` — `src/routes/developers.discovery.tsx`
- `/onboarding` — `src/routes/onboarding.tsx`
- `/privacy` and `/remove-business` — `src/routes/privacy.tsx`, `src/routes/privacy.remove-business.tsx` (the child inherits nothing, because privacy defines none)
- `/sign-in/$`, `/sign-up/$` — `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`
- `/status` — `src/routes/status.tsx`
- `/support` — `src/routes/support.tsx`
- `/t/new` — `src/routes/t.new.tsx`
- `/terms` — `src/routes/terms.tsx`

`/` (`src/routes/index.tsx`) is a redirect with no `component` and no `errorComponent`. It is outside the UI list. The other missing routes are server handlers (`/api/v1/…`, `/mcp`, `/oauth/…`, webhooks, `.well-known`). They return problem JSON and do not use a React `errorComponent`.

## Env vars required at boot

Three different boots exist. Optional model, Stripe, CDP, Formance, Infisical, and Sentry names are not on the request-boundary list.

**Production first request** (`ensureBootEnvironmentValidated` in `src/start.ts:19-22`). `bootValidationClass` is `production` only when the deployment mode is production (`src/lib/deployment/environment.ts:17-18`). `validateEnvironment` then requires `DEPLOYMENT_MANIFEST.configuration.requiredProduction` (`src/lib/deployment/env-schema.ts:57-81`, groups in `src/lib/deployment/manifest.ts:56-62`):

| Group | Names | Rule |
|---|---|---|
| canonical | `AE_CANONICAL_BASE_URL` | all |
| convex | `CONVEX_URL`, `VITE_CONVEX_URL` | one of |
| convex-auth | `AE_CONVEX_SERVER_FUNCTION_TOKEN` | all |
| clerk | `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SIGNING_SECRET` | all |
| source-write | `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CATALOG`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, `AE_SOURCE_WRITE_KEY_SESSION` | all |

That is 14 names, 13 of which must be present (either Convex URL satisfies the pair). The same function rejects production if a forbidden name is set: `AE_SOURCE_WRITE_SECRET`, `AE_DEV_WBA_SMOKE_ENABLED`, `AE_DEV_WBA_SMOKE_SECRET`, `AE_DEV_WBA_SIGNATURE_AGENT`, `AE_LOCAL_DEV_VITE_ARGS`, `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, `AE_API_KEY`. Development, test, and preview skip this check. Preview readiness still validates the shared manifest scopes (`src/lib/server/readiness.ts:310-330`). A missing Stripe key does not flip `/api/ready` to `not_ready`.

**Convex module evaluation.** `convex/auth.config.ts:3-20` throws if `CLERK_JWT_ISSUER_DOMAIN` is empty. A Convex push does not boot without it.

**`dev:local`, before Vite.** The launcher exits if any of `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, or `AE_E2E_OWNER_EMAIL` is missing (`tools/dev/local-dev.ts:320-329,1185-1189`). The name is `CLERK_PUBLISHABLE_KEY`, not `VITE_CLERK_PUBLISHABLE_KEY`. Convex dev must become ready or the launcher stops. `AE_CHAT_SHARE_SECRET` is written into the local Convex env when absent; a present secret shorter than 32 characters aborts that seed (`tools/dev/local-dev.ts:1018-1019`). It does not have to be set before the process starts.

## Worksheet rows: closed vs open

56 data rows in [fragility-worksheet.md](../fragility-worksheet.md) (gates G1–G8 and the J1–J8 rows). **Closed** means the row states the defect is closed, source-fixed, or explicitly not an open blocker, and it does not leave a named remainder. **Partial** means a subpath is closed and the same row names work still unproved. **Open** is everything else, including retained hard fences that were never a deletion.

| | Rows | Share |
|---|---:|---:|
| Closed | 21 | 37.5% |
| Partial | 8 | 14.3% |
| Open | 27 | 48.2% |

**Closed (21).** G1, G2, G3, G4, G5, G7, F4, F5, F6, F7, F9, C4, P2, P3, P4, Q1, U3, U6, U7, O2, O3.

P2’s return-credit path is marked source-fixed. The worksheet still says a late signed webhook replay was not verified against the local placeholder `STRIPE_WEBHOOK_SECRET`. F7’s search blocker is marked closed; an internal facet-query fault is still untested. G4 closes the global cron switch only; a failed reconciliation run was not injected.

**Partial (8).** F10 (a bad page advances; aggregate and backlog are unmeasured), Q3 (the bridge deadline was injected; Provider and custody were not), Q4 (the cron is registered; an admission failure was not injected), Q6 (receipt, Activity, and Help were observed; the ledger walk was not), Q7 (a duplicate Call was observed; back and refresh were not), U1 (source correction is closed; completed-identity re-entry is not), O1 (a missing MFA claim now explains itself; a real approval mutation was not run), O4 (an interrupted snapshot kept the prior total; a large live backlog was not).

**Open (27).** G6, G8, F1, F2, F3, F8, C1, C2, C3, C5, C6, C7, I1, I2, I3, P1, Q2, Q5, A1, A2, A3, A4, A5, A6, U2, U4, U5.

Q2 is a retained Formance and x402 fence, not a hedging branch to delete. The open rows that match the live request-path calls above are F1 and F3 (upstream catalogue is still served on the request), F2 and C1 (Jev is still on search and chat), and G6 (Clerk still wraps public reads).
