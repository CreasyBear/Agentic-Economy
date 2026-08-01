---
title: Codebase Concerns
analysis_date: 2026-08-01
refreshed: 2026-08-01
scope: Full repository security, reliability, performance, debt, and operational review
---

# Codebase Concerns

**Analysis date:** 2026-08-01  
**Scope:** Full repository, including `src/`, `convex/`, route handlers, tests, tooling, CI, and planning records.

## Reading this map

- **[Observed]** means the concern is directly visible in source, configuration, or a repository record.
- **[Inference]** means the likely impact follows from the observed implementation and should be confirmed in a deployed environment.
- Severity is relative to the current source and evidence boundary: **P0** can compromise credentials or authoritative data; **P1** can expose private data, corrupt state, or create material cost/availability risk; **P2** is a significant scalability, reliability, or maintenance risk; **P3** is hardening or cleanup.

## Priority summary

1. **P0 — Public OAuth persistence functions are not storage-internal.** The functions used as the OAuth state store are exported as public Convex queries and mutations without authorization.
2. **P1 — Private answer-thread records are readable through public Convex queries.** Several endpoints return raw queries, evidence, prose, and tool data without a session or owner check.
3. **P1 — Public, expensive, and weakly throttled write/action surfaces.** Preview/model calls, demand capture, funnel attribution, and customer-request paths can be invoked repeatedly without a durable server-side rate limit.
4. **P1/P2 — Whole-source-state hydration and rewrite is a scaling and consistency bottleneck.** Admin, security, and observability mutations read and then upsert every row in 24 tables.
5. **P2 — Production proof is incomplete.** The project state records uncommitted work, four known unit failures, and no hosted/provider/customer evidence.

## P0 security and data-integrity concerns

### 1. OAuth storage API is publicly callable

**Evidence:** `convex/customerRequestAgentOAuth.ts:35-96` exports `insertGrant`, `updateGrant`, `insertClient`, `getGrantByHash`, `getGrantByRef`, and `getClient` with public `mutation`/`query` wrappers. The application deliberately reaches them through public function references in `src/lib/server/customer-request-agent-oauth-store.ts:75-81`.

**Risk:** [Observed] The HTTP adapter validates redirect URIs and creates grants through `src/lib/server/customer-request-agent-oauth-api.ts`, but the Convex storage functions do not enforce that callers are the server OAuth adapter, an authenticated owner, or a trusted system. [Inference] A direct Convex caller can insert a client with an unvalidated redirect URI, forge grant status/ownership/key fields, race or overwrite grant transitions, or cause an arbitrary stored `keyId` to be delivered by `/oauth/token`. This bypasses the consent and PKCE state machine at the persistence boundary.

**Containment:** Make these functions `internalQuery`/`internalMutation` (or add an equivalent non-public capability), route all access through a trusted server seam, and add a direct-Convex authorization regression test. Do not rely on the route validator to protect a public storage API.

### 2. Full answer-thread data is exposed by public Convex queries

**Evidence:** `convex/answerThreads.ts:373-384` exposes tool-call results by `turnId`; `convex/answerThreads.ts:407-419` exposes all turns by `threadId`; `convex/answerThreads.ts:481-530` exposes thread metadata and full turns. `toTurnRecord` returns raw `query`, `evidenceJson`, `proseJson`, and `artifactKindsJson` at `convex/answerThreads.ts:567-581`. These are public source queries in `src/modules/answer-thread/answer-thread.functions.ts:175-205`.

**Risk:** [Observed] Only the application-level answer route checks the pseudonymous session in `src/modules/answer-thread/internal/turn-guard.ts:99-148`; the Convex query handlers themselves accept only a guessed identifier. [Inference] Anyone who obtains or guesses a thread/turn ID can bypass the intended session check and read private conversation evidence, prompts, and tool results directly from Convex. `getPublicThreadProjection` is the intentionally redacted public surface, so the raw query functions are an avoidable boundary leak.

**Containment:** Move raw reads to internal functions or require and verify the session/owner at the Convex boundary. Retain only the projection query as public. Add tests that call the generated Convex functions with a foreign session and assert denial.

## P1 abuse, cost, and availability concerns

### 3. Public preview action can spend model/provider resources without durable admission

**Evidence:** `convex/customerRequestApplication.ts:661-675` exports `preview` as a public action, takes user-controlled `customerJob` and `network`, and calls the interpreter with a 45-second provider timeout through `src/modules/customer-request/application/interpret-compile/interpreter.ts:27-43`. The action does not resolve a caller, service assertion, session, or rate-limit bucket. The UI action is also marked HTTP-capable in `src/modules/customer-request/plan-preview.actions.ts:46-69`.

**Risk:** [Observed] The request text is bounded at the UI/action schema, but there is no durable per-IP, per-session, or per-principal admission around the Convex action. [Inference] An attacker can repeatedly invoke preview to consume OpenRouter quota, Convex action capacity, and provider latency; instance-local guards elsewhere do not protect this path. Provider failure falls back to deterministic interpretation at `src/modules/customer-request/application/interpret-compile/interpreter.ts:44-60`, which preserves availability but can silently lower answer quality.

**Containment:** Put preview behind a server-owned admission/rate-limit seam, meter provider calls, and make the fallback visible in durable operational telemetry rather than only `console.error`.

### 4. Guest and agent customer-request flows have no durable request throttle

**Evidence:** `src/routes/api.requests.ts:5-7` sends guest submissions to `src/lib/server/customer-request-browser-api.ts`; guest sessions are HMAC-protected there, but no request rate limit is applied. Agent routes in `src/routes/api.v1.requests.ts:5-7` use `src/lib/server/customer-request-agent-api.ts:56-63`, which authenticates API keys but has no per-key or per-owner rate-limit check before invoking Convex actions. Submission triggers interpretation and compilation in `convex/customerRequestApplication.ts:680-744`.

**Risk:** [Inference] A valid guest session or API key can generate repeated expensive requests, and key ownership alone does not bound provider spend or action concurrency. Idempotency prevents some duplicate effects but is not a throughput control.

**Containment:** Add durable limits keyed by guest session, API-key ID, and owner, with explicit limits for model calls, retries, and active in-flight requests.

### 5. Anonymous demand capture is writeable without abuse controls

**Evidence:** `convex/demand.ts:27-74` exports `captureDemandSignal` as a public mutation. It validates field lengths but does not authenticate, require CSRF/source-write admission, or claim a rate-limit bucket before inserting `demandSignals`. The public action is intentionally exposed on both UI and HTTP surfaces in `src/modules/demand/demand.actions.ts:53-78`.

**Risk:** [Inference] Bots can fill the demand table with plausible bounded rows, pollute product/market signals, and create unbounded storage and downstream processing cost. Length validation limits individual records but not aggregate abuse.

**Containment:** Add an abuse bucket keyed by a server-derived session/IP/device signal, bot friction where appropriate, deduplication, retention/compaction, and an operator-visible blocked count.

### 6. Public funnel attribution can be forged and poison owner activation state

**Evidence:** `convex/observability.ts:325-375` accepts `businessId`, `actorRef`, `claimId`, `stage`, and event type from a public mutation with no source-write or actor check. `src/modules/observability/internal/record-funnel-event.ts:60-71` applies the event to `ownerActivationState`, while `src/modules/observability/internal/funnel.ts:67-104` changes the state to `blocked`, `published`, or `activated` based on event history.

**Risk:** [Inference] A direct caller can submit events for another business, force friction/failure events to block activation, or manufacture milestone events. This is analytics and operational state, not merely client telemetry, because the mutation updates authoritative activation readback.

**Containment:** Separate anonymous analytics from state-changing owner attribution. Bind business/claim identifiers to server-issued signed context, or accept only server-derived milestone events; rate-limit and deduplicate the public telemetry path.

## P1/P2 request-boundary and parser concerns

### 7. Several production-facing handlers parse unbounded request bodies

**Evidence:** `src/lib/server/business-tool-api.ts:186-191` calls `request.json()` directly for authenticated prepare/invoke calls. `src/routes/api.demo-provider.quote.ts:32-44` calls `request.json()` directly. OAuth form and registration bodies use `request.text()`/`request.json()` in `src/lib/server/customer-request-agent-oauth-api.ts:326-337`, and Stripe/Resend webhook adapters read raw bodies without an application limit in `src/modules/money/internal/stripe-webhook.ts:23-35` and `src/routes/api.notification.resend-webhook.ts:59-69`.

**Risk:** [Inference] Reverse proxies may impose limits, but the application itself can allocate and parse arbitrarily large bodies before schema validation or signature verification. Authenticated tool calls and public/demo/webhook routes become memory/CPU denial-of-service targets, and signed oversized payloads still consume verification work.

**Containment:** Use one bounded body reader for every HTTP body path, set provider-specific maximums before parse/signature verification, and reject oversized payloads with stable 413 responses.

## P2 scalability and performance concerns

### 8. Source-state mutations load and rewrite the whole control-plane dataset

**Evidence:** `convex/source_state.ts:141-232` runs `collect()` over 24 tables, including `funnelEvents`, `auditEvents`, `operationKeys`, registry projections, discovery attempts, and businesses. `persistPhaseOneSourceState` then upserts every row at `convex/source_state.ts:234-251`. This path is used by security mutations in `convex/security.ts:320-414`, visibility mutations in `convex/business.ts:279-340`, and operator controls in `convex/observability.ts:250-295`.

**Risk:** [Observed] Reads and writes are proportional to total historical state, not the target entity. [Inference] As audit/funnel/operation tables grow, these mutations approach Convex transaction/read limits, increase latency and cost, and create high optimistic-concurrency contention. A concurrent mutation that touches another row can force retries; stale in-memory state also increases the chance of fragile merge behavior.

**Containment:** Migrate hot mutations to entity/index-scoped reads and patches; treat append-only audit/funnel tables as append operations; page or archive history; reserve full snapshots for bounded migration/repair jobs.

### 9. Public registry search performs broad hydration on fallback paths

**Evidence:** `convex/registry.ts:314-359` scans published businesses for offering search, hydrates each business's supply, and filters in memory. The fallback is capped by `CATALOG_TOTAL_COUNT_LIMIT = 1_000` and related constants at `convex/registry.ts:470-473`, which prevents an unbounded read but still permits a large per-query fan-out.

**Risk:** [Inference] A public search can issue hundreds or up to roughly a thousand dependent reads and object allocations. Concurrent broad searches can consume Convex query budget and increase tail latency even though the result is bounded.

**Containment:** Prefer an indexed/search mirror for token and location queries, cap hydration lower when fallback is used, and expose fallback usage and latency as an operational metric.

### 10. Answer rate limits are process-local

**Evidence:** `src/modules/answer-thread/internal/turn-guard.ts:13-16` stores turn, follow-up, stream, and idempotency buckets in module-level arrays/maps. `checkAnswerTurnRateLimit` and related functions at `src/modules/answer-thread/internal/turn-guard.ts:55-97` read and mutate that in-memory state.

**Risk:** [Observed] The limit resets when a process restarts and is not shared between workers. [Inference] A client can distribute requests across serverless instances or wait for a restart to exceed the documented limit; autoscaling also makes enforcement inconsistent. The tests in `tests/integration/answer-rate-limits.test.ts` prove one process, not distributed enforcement.

**Containment:** Use a durable/shared rate-limit store or edge/provider limiter, while retaining the local guard only as a cheap first line.

### 11. OAuth records have no visible expiration cleanup

**Evidence:** `convex/customerRequestAgentOAuth.ts:35-96` provides insert/read/update operations but no cleanup mutation or scheduled deletion for `customerRequestAgentOAuthGrants` or `customerRequestAgentOAuthClients`. The state machine expires grants logically at `src/modules/customer-request/oauth-state.ts:299-318` and `src/modules/customer-request/oauth-state.ts:340-347`, but expired rows remain persisted.

**Risk:** [Inference] Open registration plus abandoned device grants creates unbounded client/grant storage and increases index/query maintenance. This compounds the whole-state and operational-history concerns.

**Containment:** Add internal, scheduled TTL cleanup with bounded batches, retention metrics, and a maximum client/redirect-URI payload size/count.

## P2 reliability and deployment concerns

### 12. Source and projections can intentionally diverge without a durable repair guarantee

**Evidence:** `convex/catalog.ts:421-434` publishes source status first and comments that projection failure never rolls back source publication; the last safe snapshot remains visible and marked stale. Registry/discovery attempts are recorded for repair, but the roadmap says evidence remains local/mock only in `.planning/ROADMAP.md:77-81`.

**Risk:** [Observed] A successful owner publish can leave registry, discovery, or supply projections stale. [Inference] Public surfaces can disagree about the same business until repair runs, while source success may be interpreted as complete by callers.

**Containment:** Make projection freshness and repair state explicit in every public read, alert on stale thresholds, and exercise retry/rebuild from a deployed backend before treating publication as production-ready.

### 13. Billing provider path is deliberately non-functional

**Evidence:** Every money action in `convex/moneyStripe.ts:14-50` returns `stripe_setup_required`. `src/routes/api.stripe.webhook.ts:22-29` defaults both verifier and applier to the same refusal when no implementation is injected.

**Risk:** [Observed] Stripe payment, payout, and webhook paths are scaffolding, not a live commercial integration. [Inference] Any UI or capability that assumes money readiness can fail at runtime or leave a false impression of paid-operation support unless operator controls remain closed.

**Containment:** Keep billing controls disabled until a real provider verifier/applier, replay ledger, and hosted smoke evidence exist; avoid advertising the path as available from source presence alone.

### 14. Repository state records unshipped work and known failures

**Evidence:** `.planning/STATE.md:20` records a dirty working tree with 137 modified, 11 deleted, and 45 untracked files as of 2026-07-29. `.planning/STATE.md:57-76` records `npm run test:unit` at 2,433 passed / 4 failed and names failures in `tests/unit/schema/convex-schema.test.ts`, `tests/unit/customer-request/direct-agent-baseline.test.ts`, `tests/unit/answer/inquiry-deep-link.test.ts`, and `tests/unit/action-invocation/development-host-parity.test.ts`. `.planning/STATE.md:75-95` says live Convex, hosted, provider, demand, and customer evidence remain unproven.

**Risk:** [Observed] The source map should not be read as a shipped production baseline. [Inference] Known contract drift can hide regressions, and the absence of hosted/provider/customer evidence leaves deployment-only failures undiscovered.

**Containment:** Reconcile the four failures, establish a clean revision baseline, then run focused Convex/browser/hosted/provider smoke paths and record their exact evidence ceiling.

## P2/P3 configuration and security hardening

### 15. Canonical URL fallbacks can publish invalid or inconsistent origins

**Evidence:** `src/lib/server/canonical-url.ts:6-20` falls back to `http://localhost:3000`. Other runtime paths independently fall back to `https://ae.example`, including `src/lib/server/customer-request-agent-api.ts:299-303`, `src/modules/catalog/owner-claim.functions.ts:396-398`, `src/modules/inquiries/inquiry.functions.ts:914-916`, and `convex/discovery.ts:1439-1445`. Public URL generation also uses `src/components/ae/forms/AeCopyPublicUrlButton.tsx:46-48` and `src/components/ae/chat/AeExportPreview.tsx:190-196`.

**Risk:** [Inference] A missing or incorrectly named deployment URL can emit localhost/example links, wrong OAuth challenges, or mismatched CSRF origins. The separate fallbacks can disagree in one response, making failures intermittent and hard to diagnose.

**Containment:** Require one validated canonical origin in production, fail deployment/startup when absent, and route all URL/CSRF/SEO/OAuth generation through one resolver.

### 16. CSP still permits inline scripts and styles

**Evidence:** `src/lib/http/security-headers.ts:31-55` explicitly allows `'unsafe-inline'` for `script-src` and `style-src`; the comment says nonce/hash plumbing is a follow-up. Production enforcement is conditional on `AE_CSP_REPORT_ONLY` at `src/lib/http/security-headers.ts:114-126`.

**Risk:** [Observed] The policy has a deliberate XSS-hardening exception and broad third-party wildcards. [Inference] If an injection reaches an inline-capable context, CSP provides less containment than a nonce/hash policy; an accidental report-only setting also removes enforcement.

**Containment:** Thread per-request nonces or stable hashes through SSR and narrow third-party origins. Make report-only opt-in auditable in deployment configuration.

### 17. Convex environment declarations and runtime reads are not one inventory

**Evidence:** `convex/convex.config.ts:7-15` declares a small typed environment set, while runtime code reads additional process variables such as `CLERK_JWT_ISSUER_DOMAIN` in `convex/authz.ts:147-150` and dynamic `env:*` references in `convex/capabilitySupplyReadiness.ts:88-94`. `.env.example:1-125` lists substantially more provider, URL, observability, and source-write variables.

**Risk:** [Inference] Deployment configuration can be accepted by one seam and silently absent from another; names such as `SITE_URL`, `AE_CANONICAL_BASE_URL`, and provider secrets have multiple fallback/read paths. This is a configuration-drift risk rather than evidence that every variable is currently broken.

**Containment:** Maintain one reviewed env contract, validate required production values at startup/deploy, and test the actual deployment environment rather than only local fixtures.

## P3 maintainability, standards, and generated-artifact debt

### 18. Dynamic validator and cast exceptions remain concentrated at trust boundaries

**Evidence:** The architecture scanner forbids explicit `any`, double casts, non-null assertions, and undocumented `v.any()` in `src/lib/ui/contract-scans.ts:119-142`. Production exceptions remain in `src/modules/customer-request/internal/convex-v2-schema.ts:115-116,330-330,360-360`, `convex/customerRequestRouteExecution.ts:673-675`, `convex/registry.ts:301-365`, and double/non-null casts such as `src/modules/action-invocation/application-service.ts:240-241`.

**Risk:** [Observed] Some exceptions are documented JSON boundaries, but the same patterns can hide missing-state or schema drift. [Inference] Changes at these seams are harder to review and may fail only after persisted data or external payloads change.

**Containment:** Keep dynamic boundaries narrow, validate immediately after crossing them, and add a named adapter/test for each deliberate exception rather than expanding `v.any()` or cast usage.

### 19. Generated files are large, overwrite-prone, and part of the review surface

**Evidence:** `src/routeTree.gen.ts:7-10` states that TanStack Router generated the file and that it must not be edited; the file is 2,846 lines. `convex/_generated/` contains generated Convex API/server declarations and runtime bindings. `.gitignore:1-49` ignores many build outputs but does not ignore these generated source artifacts.

**Risk:** [Inference] Stale route/codegen output can compile against a different function or route graph than source, while accidental generated diffs obscure behavioral changes. The known schema test drift in `.planning/STATE.md:69-73` shows that generated/schema expectations can fall out of sync.

**Containment:** Regenerate in a controlled step, review generated diffs separately, add drift checks to release gates, and keep generated artifacts out of hand-edited change sets.

## Evidence and test gaps to close

- The visible OAuth tests (`tests/unit/customer-request-agent-oauth-state.test.ts`, `tests/server/customer-request-agent-oauth-api.test.ts`, and `tests/routes/oauth-store-wiring.test.ts`) exercise the state machine, HTTP adapter, and wiring with test stores; they do not establish that the public Convex storage functions reject direct callers.
- `tests/integration/answer-rate-limits.test.ts` establishes in-process limits, but no distributed/shared-store proof is present for serverless deployment behavior.
- `.planning/ROADMAP.md:160-169` records that `P5-AGENT` has no `POST /api/compare` or registered comparison action and `P5-EVIDENCE` has no hosted readback or frozen evidence packet. These are accepted product gaps, not hidden implementation details.
- `.planning/STATE.md:88-95` records that Phase 05 browser, hosted, provider, and customer evidence do not exist; source-level green tests cannot substitute for those environments.

## Recommended order of work

1. Close the public OAuth storage boundary and raw answer-thread query exposure before any external deployment.
2. Add durable admission/rate limiting for preview, customer requests, demand capture, funnel writes, and provider/webhook bodies.
3. Replace whole-source-state read/rewrite mutations with scoped/indexed transactions and schedule OAuth/history cleanup.
4. Require and unify production URL/environment configuration; tighten CSP after nonce/hash plumbing lands.
5. Rebaseline known test failures, then capture hosted/provider/browser evidence and update the claim ceiling in `.planning/STATE.md`.

> Completion: concerns mapping written for the full repository on 2026-08-01; line count: 208.
