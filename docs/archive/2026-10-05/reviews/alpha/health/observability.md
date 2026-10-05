> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../../README.md) for its successor and remaining limits.

# Observability and journey SLIs — 29 September 2026

**Scope.** Source audit of telemetry that exists in this checkout, whether errors are tracked or alerted, and whether each core journey records a success and a failure you could turn into an SLI (`good events / valid events`). Counts are production `src/` and `convex/` excluding tests and `_generated`. This is not a live Sentry, PostHog, Convex, or CloudWatch inspection: a DSN or log drain can be unset in deployment, and this pass does not prove those consoles receive events.

**Verdict.** The app has optional Sentry and PostHog, a client-error forwarder, three structured console prefixes, a daily admin Call/Quote snapshot, and liveness/readiness routes. It does not have journey alerts or a metric that is both a good/valid pair and exported for every core journey. Call and funding have durable terminal states you can query. Signed-in and agent chat turns do too. Search, Quote, and publish do not: successes are stored or returned, and failures mostly vanish or stay `in_progress`.

## Telemetry that exists

### Two observability modules

`src/lib/observability/` is the vendor and log seam. `src/modules/observability/` is domain audit, idempotency keys, and a funnel vocabulary. They are not one metrics pipeline.

| Piece | What it does | Evidence |
|---|---|---|
| Enablement | Off when `VITE_AE_DISABLE_OBSERVABILITY` or `AE_DISABLE_OBSERVABILITY` is `true`. Otherwise enabled only if a Sentry DSN or PostHog key is set. Default PostHog host is `https://us.i.posthog.com`. | `src/lib/observability/config.ts:23-78` |
| Sentry server | `tracesSampleRate` 0.1 in production, 1 otherwise. Events, transactions, and breadcrumbs pass `sanitizeTelemetryEvent`. Uncaught non-health requests are captured in request middleware, tagged `ae.path` and `ae.request_id`. | `src/lib/observability/sentry.server.ts:23-36`; `src/start.ts:37-78` |
| Sentry client | Same sample rates. Boot is dynamic-imported and skipped on private routes. Root boundary reports render errors and offers reload / Browse Tools. | `src/lib/observability/sentry.client.ts:29-34`; `src/lib/observability/boot-client-observability.ts:30-38`; `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx:34-40` |
| PostHog | Server funnel and `captureServerEvent`. Client funnel and `captureClientProductEvent`. Pageview and pageleave capture are off. | `src/lib/observability/posthog.server.ts:25-58`; `src/lib/observability/posthog.client.ts:32-79` |
| App `degrade()` | Caught fallbacks become a Sentry **warning**. No `[ae.*]` line. | `src/lib/observability/degrade.ts:9-15` |
| Convex `degradeBackend` / `captureBackendException` | Convex must not import TanStack or Sentry. Caught incidents go to `console.error` for Convex log streaming. Thrown exceptions are left to Convex's own Sentry integration; that integration is not configured in this repo. | `src/lib/observability/degrade-backend.ts:4-55` |
| Domain module | Audit events, `operationKeys` (`in_progress`, `succeeded`, `failed_retryable`, `failed_terminal`), invalidation outbox, 31 funnel event names. | `src/modules/observability/public.ts:1-39`; `src/modules/observability/internal/literals.ts:1-53` |

Funnel names include `registry_search`, `publish_succeeded`, `publish_failed`, `paid_activation_started`, and `checkout_returned`. Production emitters are two: `visitor_attributed` once per shell load, and `share_url_copied` from the public URL button. `emitRegistryResultClick` has no caller. `captureClientProductEvent` has no caller outside its wrapper. Admin PostHog events (`admin_command`, `admin_lookup`, `admin_queue_view`) are operator actions, not buyer journeys.

### Client-error endpoint

`POST /api/observability/client-error` (`src/routes/api.observability.client-error.ts:13-90`).

- Body cap 16 KiB. Content type must be JSON. Payload is a message plus optional name, stack, url, source, and a small metadata object (`src/lib/observability/client-error.ts:6-24`).
- Rate limit is the public-mutation bucket with suffix `client-error`. Admission failure is 503 `client_error_rate_limit_unavailable` and is itself sent to Sentry. Over limit is the normal rate-limit response.
- If observability is disabled or `SENTRY_DSN` is absent, the handler returns **204 and drops the body**. It does not store the error.
- Otherwise it sanitizes the URL down to a path, tags Sentry `ae.client_error`, and returns 204.

This is a browser-to-Sentry forwarder, not an error log you can query from AE.

### `[ae.*]` log sites

Three prefixes, all console JSON. Production emission sites, excluding the function definitions:

| Prefix | Level | Call sites | Sink |
|---|---|---|---|
| `[ae.degraded]` | `console.error` | **446** `degradeBackend(...)` | `operation` is the call's `site`; `reason` is `source_unavailable`, `timeout`, `not_found`, `forbidden`, or `invalid_response` |
| `[ae.exception]` | `console.error` | **47** `captureBackendException(...)` | optional context plus serialized cause; level tag `warning` or `error` |
| `[ae.inference]` | `console.info` | **4** `recordInferenceAttempt(...)` | Jev system-one and the secondary LLM adapter, each on the completed path and the failed path |

**497** emission sites. The only literal prefixes in production source are those three (`src/lib/observability/degrade-backend.ts:26`, `:51`; `src/modules/decision-engine/inference-observation.ts:27`). A test expects `[ae.exception]` from a tool card. These lines are failure-heavy: 446 of 497 fire only when a caller already caught an error and continued. `[ae.inference]` is the only prefix that records both `completed` and `failed`, and it covers model-gateway attempts, not search, Quote, Call, funding, chat answer, or publish.

### Admin metrics and export

Daily marketplace snapshot, not a live SLI.

- Cron `snapshot marketplace metrics day` at 16:10 UTC (`src/lib/deployment/scheduled-workloads.ts:36`), which is ten minutes after Perth midnight. It walks the previous Perth day (`convex/lib/adminConsole/metrics/collect.ts:87`).
- Source rows: `capabilityCalls` created that day, `capabilityQuotes` created that day, `purchaseResolutionRecords` resolved that day (`collect.ts:26-72`).
- Every Call row is an `attemptedCalls` increment. `completedCalls` increments only when state is `completed`. `refused` and `reconciliation_required` (stored as `outcome_unknown`) are attempts that are not successes. A row that is still non-terminal is also an attempt and not a success (`convex/lib/adminConsole/metrics/build.ts:124-134`).
- Headline and ratio success rate is `completedCalls / attemptedCalls`. Quote “conversion” is `quotesConvertedAtClose / quotesCreated` (a Quote later consumed by a Call, not Quote success). Range totals are withheld unless every requested day has a complete snapshot (`convex/lib/adminConsole/metrics/read.ts:184-218`).
- UI: `/admin/metrics`, ranges 7 / 30 / 90 days (`src/components/ae/admin/metrics/metrics.contracts.ts:48-72`).
- Export: `GET /api/admin/metrics-export?range=last_7|last_30|last_90`. Authenticated admin query; non-admin is 403. Body is CSV (`src/routes/api.admin.metrics-export.ts:20-64`; columns in `src/lib/operator/admin-console/metrics-csv.ts:4-11`). The CSV omits `uncertainCallsOpenAtClose`, `newTransactingWorkspaces`, and `newTransactingProviders`, which the snapshot does compute.

Separate from that export, `GET /api/v1/market-metrics?window=24h|7d|30d` returns public catalogue counts of `ae_invocation`, `ae_invocation_completed`, `ae_qualified_use`, `ae_settlement`, and `ae_reconciliation_required` (`convex/marketMetrics.ts:25-64`; `src/routes/api.v1.market-metrics.ts:11-29`). Those facts are written at Call admission and finalization, and at x402 settlement (`convex/lib/capabilityExecution/callLifecycle/admissionReserve.ts:285-287`; `dispatchFinalize.ts:66-75`). They are a market-page projection with a one-minute cache, not an admin export and not an alert.

### Health and ready

Deployment manifest names three probes (`src/lib/deployment/manifest.ts:250-254`): liveness `GET|HEAD /api/health` (no dependencies), readiness `GET|HEAD /api/ready` (deployment config, Convex, source authority), and release readback `GET /api/v1/release`. Request middleware skips Sentry setup on `/api/health` and `/api/ready` (`src/start.ts:37-39`).

**`/api/health`** (`src/routes/api.health.ts:22-29`). If the process handles the request, GET returns 200 `{ "status": "ok" }` and HEAD returns 200 with an empty body. `Cache-Control: no-store` and a correlation id. It does not check Convex, catalogue, money, or config.

**`/api/ready`** (`src/routes/api.ready.ts:31-51`; checks in `src/lib/server/readiness.ts`). HTTP status follows only `checks.config` and `checks.convex`. Commercial fields are included and **do not** flip the status (`readiness.ts:115-120`).

| Check | Pass | Fail |
|---|---|---|
| `config` | `CONVEX_URL` or `VITE_CONVEX_URL` is an http(s) URL with no userinfo, query, or hash. Production also requires a valid `AE_CANONICAL_BASE_URL`. Production and preview run `validateDeploymentManifest` and fail on shared-scope findings (canonical, Convex, Clerk, source-write, browser security, runtime), forbidden env, invalid service mode, or ambiguous Convex URLs. | `convex_url_missing`, `convex_url_invalid`, `canonical_url_missing`, `canonical_url_invalid`, `deployment_environment_conflict`, `deployment_manifest_invalid`. Convex is then reported `convex_probe_skipped`. |
| `convex` | `GET` the Convex URL with `Accept: application/json`, redirects rejected, default timeout 2s (cap 5s). **Any status from 200 through 499 is ready**, including 401 and 404. | `convex_probe_failed` (5xx), `convex_probe_timeout`, `convex_unreachable`. |
| `commercial.catalogue` | Best-effort directory freshness: `absent`, `failed`, `stale`, or `fresh`. Timeout or throw becomes `absent`. | Does not fail the HTTP check. |
| `commercial.quoting` | Empty-query Tool search, limit 1, same surface as catalogue browse. `ready` only if the result is `ok` and has at least one item. | Timeout or failure becomes `unavailable`. |
| `commercial.funding` | `configured` if Stripe config is not a money refusal, or if the CDP/x402 custody bundle is present. Otherwise `missing`. | Does not fail the HTTP check. |
| `commercial.sellable` | Catalogue is `fresh` or `stale`, quoting is `ready`, and funding is `configured`. | `false` still returns HTTP 200 when config and Convex passed. |

Not ready is HTTP 503 `server_not_ready`, retryable, with projected check codes. Ready is `{ status: 'ready', checks: { config: 'ready', convex: 'ready' }, commercial }`. The names-only diagnostic payload (which env families are missing) is computed inside `readServerReadiness` and is **not** returned by the route.

**`/status`** calls the same readers in process (`src/routes/-status.functions.ts:27-97`). Five probes, each `operational` or `degraded`, 2s timeout:

| Probe | Operational when |
|---|---|
| `site` | The function runs. It does not fetch a page. Detail is always “Public pages are responding.” |
| `market` | `readServerReadiness().status === 'ready'`. That ignores `commercial`, so the page can say “Tool search and new Calls are ready” while quoting is `unavailable` or funding is `missing`. |
| `discovery` | Built UCP manifest has the expected schema version, name `Agentic Economy`, and an http(s) origin. |
| `release` | `AE_RELEASE_SOURCE_REVISION` matches 40 hex characters. |
| `catalogue` | Freshness status is `fresh` only. `stale` is degraded here, while `/api/ready` still treats `stale` as sellable. |

No probe pages an operator.

## Error tracking and alerting

Sentry is the application error tracker, and only when a DSN is configured. Client exceptions, server uncaught exceptions outside the two probe routes, `degrade()` warnings, admin invariant failures, and accepted client-error posts go there. Convex caught failures do not: they are `[ae.degraded]` / `[ae.exception]` lines. The code comment says Convex log streaming can pick those up, and that Convex’s native Sentry integration reports thrown exceptions only. This repository has no log-stream destination, no Sentry alert rule, no uptime check on `/api/health` or `/api/ready`, and no paging integration.

PostHog is product analytics for the two live funnel events and admin console events. It is not an error alerter. `capture_pageview` is false.

`infra/package4/modules/release-environment/` defines CloudWatch alarms to an email SNS topic: k3s disk above 80%, memory above 85%, CPU above 90% (`observability.tf:160-205`), and Formance RDS free storage, connections, CPU, and freeable memory (`database.tf:62-124`). Those are host and database alarms for that Package 4 k3s profile. They are not search, Quote, Call, funding, chat, or publish SLOs. No application error metric is attached to that topic.

## Journey SLIs

A usable SLI here means a stored event for a valid attempt and a distinguishable good outcome, so `good / valid` can be counted without inventing the missing side. HTTP 200 with `{ kind: 'refused' }` is a failure only if something records the attempt.

| Journey | Good / valid pair? | What is actually recorded |
|---|---|---|
| Search | **No** | Catalogue and directory search return `ok` or an `unavailable` result. A thrown Bazaar fetch becomes `[ae.degraded]` with `site: 'search'` and still returns `source_unavailable` (`convex/capabilityToolCatalog.ts:103`). Invalid queries return `unavailable` with no log. Chat search failures have their own degrade sites (`chatToolSearch`, `chatToolSearchRerank`, `chatCompactBazaarSearch`) and no success line. `registry_search` is an unused funnel name. Nothing counts successful searches. |
| Quote | **No** | `refuse()` builds a result and does not insert (`convex/lib/capabilityExecution/quotes/refusalHelpers.ts:8-20`). `capabilityQuotes` is inserted on issue (`issueQuote.ts:248`). Admin `quotesCreated` is therefore successful inserts. `quotesConvertedAtClose` is later consumption, a different ratio. `POST /api/v1/tools/quote` does not call `recordGatewayTelemetry` (`src/lib/server/call-api.ts:381-434`). Refusals, bad JSON, and `tool_quote_unavailable` are responses only. |
| Call | **Partial, durable, not alerted** | A reserved Call inserts `capabilityCalls` and `ae_invocation` (`admissionReserve.ts:277-287`). Finalization writes `ae_invocation_completed` only for `completed`, and `ae_reconciliation_required` for unknown outcome (`dispatchFinalize.ts:66-75`). The daily admin ratio `completedCalls / attemptedCalls` is a real good/valid pair over **rows that exist**. Refusals before reserve, and HTTP rejects before a row, are outside the denominator. `recordGatewayTelemetry` would have covered those HTTP outcomes (`call-api.ts:461-514`), but it no-ops when `timing` is missing (`gateway-telemetry.ts:47-51`), and `POST /api/v1/tools/call` does not pass a sink (`src/routes/api.v1.tools.call.ts:8`). The same optional sink is the only MCP gateway recorder (`mcp-api.ts:396-397`). Pending rows on the snapshot day count as attempts and not successes, so the ratio moves if a Call is still open at 16:10 UTC. |
| Funding | **Partial, durable, not exported** | `moneyFundingCommands.state` is `pending`, `succeeded`, `failed`, `outcome_unknown`, or `reversed` (`convex/lib/money/funding/contracts.ts:15-20`). Stripe readback sets `failed` with `async_payment_failed` or `succeeded` after booking (`stripeEventPipeline.ts:176-186`, `:250-251`). Commands that were reserved are a good/valid set: succeeded over terminal states. Refusals before a command row (`funding_amount_invalid` and similar) are not stored. Admin metrics and the CSV do not include funding. Declared funnel events `paid_activation_started`, `checkout_returned`, and `checkout_cancelled` are not emitted. |
| Chat answer | **Partial for turns; no for anonymous** | Signed-in and agent-key sends insert `chatTurns` in `submitted` and schedule generation with `turnRef` (`convex/lib/chat/turns/handlers.ts:204-262`). The run marks `completed`, `input-required`, or `failed` (`convex/lib/chat/generate/run.ts:107-110`, `:163-166`). Those states are a pair if good is `completed` plus `input-required` (a clarification is a finished answer, not a failure) and valid is those plus `failed`. `canceled` is a separate user stop. Anonymous chat does not write a turn. Failure is `console.error('[chat-anonymous] stream failed', …)` and HTTP 503 `chat_stream_failed` (`convex/lib/chat/anonymous/http.ts:22-24`). There is no anonymous success counter. `[ae.inference]` is not this path; the answer stream does not call `recordInferenceAttempt`. No admin metric or alert reads `chatTurns.state`. |
| Publish | **No** | Success writes `operationKeys.status = 'succeeded'` for `publishPreparedCapability` or `republishPreparedCapability`, an audit `capability_publication.published`, and a publication row (`src/modules/capability-supply/internal/publication/publish.ts:709-808`). That file does not import `failOperation`. Validation refusals return before `beginOperation`, so they leave no key. After the key is inserted, a refused contract, offering, binding, or eligibility **throws** (`publish.ts:723-744`) and leaves the key `in_progress`, which is also the status of a publish still running. `publish_succeeded` and `publish_failed` are unused funnel names. Other supply commands (offering and binding registration) do mark `failed_terminal`; the publish journey itself does not. |

Gateway timing is not a hidden production SLI. `ActionTimingSink` is only constructed in unit tests (`tests/unit/server/call-api.test.ts`, `call-recovery-api.test.ts`). Production routes never pass `timing`.

## What would have to be true to call these SLIs

Call and funding already have the rows. They are not SLIs until something queries them on a window, excludes still-pending work or waits it out, and alerts. Chat turns are the same, and only for the signed-in and agent-key path. Search, Quote, and publish need a recorded attempt for the refusals that today return without a row. `[ae.degraded]` cannot supply the good side of any of those ratios.
