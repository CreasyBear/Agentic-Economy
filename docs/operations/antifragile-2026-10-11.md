# Antifragile pass, 2026-10-11

Branch `codex/antifragile`. Goal: health that tells the truth, expected outcomes that stay out of Sentry, and fallback dependencies that fail fast and recover on their own.

## What changed

- Health: `api.ready` reports `disabled` with a 200 but `sellable=false`; a query throw or timeout reports `failed`.
- Expected refusals (unauthenticated chat and history, `thread_busy`, `turn_fenced`, rate-limit OCC exhaustion) return typed results instead of throwing.
- Money paths: the x402 `mark_possibly_submitted` mismatch returns false and is honored at `route-transport-x402.ts:297`, giving the same `payment_submission_fence_failed` refusal as before. Stripe requeue is idempotent inbox reprocessing with the 13-attempt schedule of the old workpool. Nothing changes who can pay.
- Convex: market flow refresh records failure as state; facilitator reconcile is chunked; open approval pagination uses a stable `now`; the rate limiter OCC guard fails closed (denial).
- Client: account funding validates the `port.begin` envelope; Convex client/backend skew prompts a reload.
- Review fixes in this round:
  - New `jevBreaker` (`src/modules/decision-engine/jev-breaker.ts`) used by both JEV rerankers. Caller-initiated `cancelled`, and `disabled` and `missing_key`, no longer count as JEV failures, so client disconnects cannot open the breaker for every user. `x402-directory` and `cdp-sql` keep the default `dependencyBreaker` policy. Caller-budget `timeout` still counts: a deadline that short against JEV is a real latency signal. Not done: ignoring upstream 4xx in `x402-directory-source.server.ts`, because the CDP SDK status shape is unverified.
  - `isSentryEnvironment` no longer throws `ReferenceError` in browser bundles where `process` is undefined.
  - `routeExpectedEvent` takes an `isServer` flag. The bare `status` 4xx rule and the Convex skew terms (`ArgumentValidationError`, `Could not find public function`, `Object is missing the required field`) apply on the client only. On the server they are real bugs or a bad deploy and stay issues.
- Gate fixes: `funding/constraints` closed-payments refusal now uses `problem()` (409, `payments_not_open`); the chat card projector tolerates model-text tool results that arrive JSON-encoded twice; Convex API kind snapshot regenerated for the new internal `requeue`; breaker gained `reset()` for test isolation; tests updated for warn-level degrade logs, the single environment scheme and the metered catalogue search; `space-y-*` in six settings components became `flex flex-col gap-*` to satisfy the UI contract.

## Error-handling rules

What reports to Sentry:
- Unexpected exceptions with a cause fingerprint (`code` tag or error `code`).
- Server-side 4xx from our own outbound calls, and server-side validation or missing-function errors.

What is a breadcrumb (never an issue):
- Typed refusals (`refusal` tag), `degraded` tag events, `thread_busy`, `turn_fenced`, `InvalidCursor`, `unauthenticated`, benign view-transition aborts.
- Client only: bare 4xx `status` and Convex version-skew errors.
- If server 4xx suppression is wanted later, require an explicit marker (`refusal` tag or `code`), never a bare `status`.

Health endpoint semantics:
- `ok` and `disabled` return 200; `disabled` sets `sellable=false`. `failed` is a query throw or timeout. Alert on symptoms (not sellable, failed) not causes.

Breaker and retry rules:
- Breaker: 5 consecutive counted failures open it for 30s, then one half-open probe. Per name, per isolate. Open means immediate fallback (lexical or original order), with one counted warning.
- Only dependency-health failures count. Caller cancellation and configuration states pass through uncounted.
- Retries belong to the owner of idempotency (Stripe inbox requeue, 13 attempts). Fallback dependencies do not retry in-request.

## Sentry issues to resolve after deploy

Resolve once the deploy is live and no new events arrive:
- Fixed on main: AGENTIC-ECONOMY-1N, 1P, 29, 27, 2C, 20, 1Z.
- Expected, now breadcrumbs or typed refusals: 25, 26, 1W, 1S, 22, 1X, 23, 24, 1R, 19, 1Y, 2D.
- Non-prod noise (resolve and set the environment filter): N, W, V, Z, 1H, 1B, 1A, 18, 16, X, Q, 1M, 1K, 1J, 1G, 1F, 1E, 1D, 17, 15, 14, 13, 12, 11, 10, Y, T, S, R, K.
- Keep open: P, M, 1Q (SDK misconfig), 2B, 2F, 2H, 2E, 2A (unlocated), 2G, 28, 21, 1V, 1T, 1C (verify against this branch's commits before closing).

## Sentry classification

| Issue | Class | Cause |
| --- | --- | --- |
| AGENTIC-ECONOMY-P | sdk_misconfig | Mixed @sentry/browser and @sentry/node in the server bundle via static @sentry/react imports in SSR-rendered components. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-25 | expected_should_not_report | Success journey outcomes sent as info captureMessage events; the ae.journey metric already covers the signal. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-M | sdk_misconfig | Same mixed Sentry SDK bundle as P, surfacing as a session-update TypeError on /api/ready. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-N | noise_non_prod | Local development run reporting a Sentry SDK error from a worktree node_modules. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-2B | present | Re-checked: the withSignal guard at request-with-signal.ts:9 builds a fresh Request from url/headers, and its own comment records that new Request(request) throws on Nitro/srvx NodeRequest. The reported 'reading window' throw is therefore plausibly the same runtime issue, and no code on main fixes it. Only data.window at market.functions.ts:31 reads .window, and that is a server-fn input. Class stays present, attribution remains low confidence. |
| AGENTIC-ECONOMY-2F | present | Client-side variant of the 'reading window' deserialize error on /market. Re-checked: no client-side .window read found in src/lib/server or src/routes. Class stays present; the site is unlocated and unverified. |
| AGENTIC-ECONOMY-26 | expected_should_not_report | Unauthenticated Convex call throws Error('unauthenticated') from requireChatOwner. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1N | fixed_on_main | Re-checked: convex/referenceRateRefresh.ts:15 exports public current, and 4e1e92226 is an ancestor of HEAD. The string-named caller in src/modules/money/reference-rate.server.ts:4 now resolves. Old events predate the deploy. |
| AGENTIC-ECONOMY-2D | expected_should_not_report | Deployment-paused state is operational, not a code defect. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-2H | present | Same undici Request construction 'reading window' error as 2B, on the tool-detail server-function path. Re-checked: same withSignal path applies; no fix on main. Attribution unlocated. |
| AGENTIC-ECONOMY-2E | present | EvalError from string eval blocked by CSP on /market. Re-checked: security-headers.ts script-src lists only 'self', 'unsafe-inline' and allowed origins, with no 'unsafe-eval' (grep finds no unsafe-eval in src). The eval source is a bundled dependency on the error-boundary path and remains unidentified. |
| AGENTIC-ECONOMY-1W | expected_should_not_report | resolveOwnerChatActor throws Error('unauthenticated') for signed-out callers. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-W | noise_non_prod | Vitest mock rejection 'transport unavailable' reaches Sentry from development. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-V | noise_non_prod | Same test-mock reporting as W at a different line. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1R | expected_should_not_report | Retryable funding_pending refusal re-thrown as an Error so the action retries, which reports each retry as an error event. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1Q | sdk_misconfig | Client-side TypeError inside a duplicate bundled @sentry/react ErrorBoundary copy. Same root cause as P. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-Z | noise_non_prod | Test run deliberately triggers provider_consequence_configuration_invalid and reports to Sentry. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-2G | present | OCC retry exhaustion on the rate-limiter component's rateLimits table under concurrent calls. Re-checked: rate-limiter is still mounted (convex/convex.config.ts:6; api.d.ts:1690), and convex/lib/platform/rateLimit.ts uses per-key token buckets such as account:${activeAccountRef} and agent-access:${principalRef}, which can be hot keys. Caller remains unlocated; no hot-key mitigation found. |
| AGENTIC-ECONOMY-1P | fixed_on_main | Re-checked: convex/chatAnonymous.ts:9 exports the public recipient query, and 7a0ca5628 is an ancestor of HEAD. Production ran an older deploy. |
| AGENTIC-ECONOMY-29 | fixed_on_main | Re-checked: convex/facilitatorDiscoveryAction.ts is removed. Discovery now runs through x402Directory.ts with a 10s deadline (x402Directory.ts:126-127 and nearby). |
| AGENTIC-ECONOMY-28 | present | Re-checked: dispatchWorkloadCronConsequenceHandler takes a MutationCtx and runs only the single handler for args.operation per call, not the whole declared set. The facilitatorDiscovery:reconcile and moneyTreasury:recordObservation handlers still run in that one mutation with no batch bound, so the 1s execution limit is still reachable with large payloads. Class stays present; the cause wording is narrowed. |
| AGENTIC-ECONOMY-27 | fixed_on_main | Re-checked: scheduled.ts has no refreshFacilitatorDiscoveryHandler; the job moved to x402Directory.ts, which was in turn dispatched from the cron that the 730fe354a commit removed. |
| AGENTIC-ECONOMY-22 | expected_should_not_report | Stale client omits required 'now' field (ArgumentValidationError). Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-21 | present | Re-checked: approvals.ts computes const now = Date.now() on every call and uses it in the by_status_and_expiresAt range (gt('expiresAt', now)), so a cursor from an earlier page no longer matches the range and Convex throws InvalidCursor. Confirmed on main. |
| AGENTIC-ECONOMY-1X | expected_should_not_report | Stale client omits required environment field (ArgumentValidationError). Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1V | present | Re-checked: run() in convex/marketFlowRefresh.ts calls workloadCron.reconcile via runQuery outside any try (lines 135-146). ingest() also calls checkpoint runQuery, the facilitator-set fail mutation and expireChunk runMutation outside try (lines 52-54, 65-70). Any of these failing escapes as a redacted error. Confirmed on main; Convex logs still needed to pin the exact call. |
| AGENTIC-ECONOMY-1T | present | Re-checked: refreshMarketFlowHandler calls runAdmittedAction, which awaits the action with no catch (scheduled.ts:7-16). The uncaught failure path is confirmed on main, and it is the same run() escape as 1V. |
| AGENTIC-ECONOMY-1H | noise_non_prod | Mocked 'refresh outage' in a vitest UI test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1B | noise_non_prod | Mocked 'quote source unavailable' in a demand-console test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1A | noise_non_prod | Injected 'status source unavailable' by a test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-18 | noise_non_prod | Injected 'response lost' by a test mock. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-16 | noise_non_prod | Test sends malformed body to readRequest's JSON.parse. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-X | noise_non_prod | Test fixture feeds malformed JSON to readAgentConsentDetails. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-Q | noise_non_prod | Test-only mock shape makes mapOwnerAgentReadback read .page of undefined. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-2C | fixed_on_main | Re-checked: OPTIONAL_DETAIL_TIMEOUT_MS = 3_000 at src/modules/market/tool-detail-route.functions.ts:24, applied via AbortSignal.any at :46. Fix is in d3c9061f4, an ancestor of HEAD. The prod event predates it. |
| AGENTIC-ECONOMY-2A | present | Convex serializer rejects a function value in args or return. Re-checked: no AsyncFunction or function-valued arg found in convex/ (non-generated). The defect is not located, so it cannot be confirmed as present in code. Kept as present only because no other class fits; treat as unverified until a symbolicated stack is obtained. |
| AGENTIC-ECONOMY-24 | expected_should_not_report | Non-JSON body on a non-ok anonymous chat response is captured as a warning event. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-23 | expected_should_not_report | thread_busy is an expected concurrency refusal surfaced as an uncaught ConvexError. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-20 | fixed_on_main | Re-checked: canonicalDigest throws canonical_digest_value_invalid on non-bounded JSON (src/modules/common/canonical-digest.ts:19-21). cashAudit.ts:221 and :243 now compare with null and use canonicalDigest on pinned checkpoints. Commits 590c6d1e0 and 93212b7e8 are ancestors of HEAD. The exact null-vs-undefined line was not separately proven. |
| AGENTIC-ECONOMY-1Z | fixed_on_main | Re-checked: same canonical_digest error as 20, through the reconcileTreasuryBalances wrapper, now at scheduled.ts:153-154. Fixed by 590c6d1e0 and 93212b7e8, both ancestors of HEAD. |
| AGENTIC-ECONOMY-1Y | expected_should_not_report | Attribution mismatch thrown as a plain Error for a stale or unknown-custody payment observation. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1S | expected_should_not_report | InteractiveAuthorityError identity_invalid thrown uncaught for signed-out invoice history. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1M | noise_non_prod | Benign View Transition abort when document hidden, development only. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1K | noise_non_prod | Deliberate acceptance-run exception in development. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1J | noise_non_prod | Test fixture sends malformed JSON to secret-lifecycle route. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1G | noise_non_prod | Test fixture sends malformed JSON to provider-consequence readAuthorization. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1F | noise_non_prod | Deliberate 'private identity outage' test error. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1E | noise_non_prod | Test env has no site origin configured for convexSiteOrigin. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1D | noise_non_prod | Test feeds malformed signed ticket; refusal thrown as TypeError. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-1C | present | Re-checked: use-account-funding.ts awaits port.begin and reads result.kind at line 276-280 with no guard for an undefined or malformed response. Confirmed on main. Trigger still unverified. |
| AGENTIC-ECONOMY-19 | expected_should_not_report | Blocked popup thrown as an Error and reported via captureClientExceptionOnClient. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-17 | noise_non_prod | Test passes malformed ticket; readRequest reports via captureRouteException warning. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-15 | noise_non_prod | Deliberate malformed pointer in test raises TypeError in pointerInput. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-14 | noise_non_prod | SecretPlaneError from mocked secret store in coverage-gap test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-13 | noise_non_prod | Test forces empty signing runtime. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-12 | noise_non_prod | Deliberately malformed secret pointer in coverage-gap test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-11 | noise_non_prod | Deliberately malformed generation in coverage-gap test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-10 | noise_non_prod | Test removes site origin config. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-Y | noise_non_prod | Vitest runner cancelling a pending promise. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-T | noise_non_prod | Mocked source failure in query spy. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-S | noise_non_prod | Mocked enrichment failure in test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-R | noise_non_prod | Mocked listAgentAccessKeysServer failure in test. Not in the checked set; unchanged. |
| AGENTIC-ECONOMY-K | noise_non_prod | One-off setup connectivity check event with no frames. Not in the checked set; unchanged. |
