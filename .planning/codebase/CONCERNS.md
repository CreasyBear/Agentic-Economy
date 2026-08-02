---
title: Codebase Concerns
analysis_date: 2026-08-02
refreshed: 2026-08-02
scope: Full repository security, reliability, performance, debt, and operational review
---

# Codebase Concerns

**Analysis Date:** 2026-08-02  
**Scope:** Full repository, including `src/`, `convex/`, route handlers, tests, tooling, and planning records.

## Reading this map

- **[Observed]** means the concern is directly visible in current source, configuration, or a repository record.
- **[Inference]** means the likely impact follows from the observed implementation and should be confirmed in a deployed environment.
- Severity is relative to the current source and evidence boundary: **P0** can compromise credentials or authoritative data; **P1** can expose private data, corrupt state, or create material cost/availability risk; **P2** is a significant scalability, reliability, or maintenance risk; **P3** is hardening or cleanup.

## Priority summary

1. **P1 — Inquiry source reconstruction is capped but not scope-filtered.** Every source table is read with a fixed `take(100)` or `take(200)` before stateful reads and writes.
2. **P1 — Public Convex admission and attribution seams remain caller-controlled.** The HTTP rate-limit mutation is public, its key is derived from spoofable request headers, and owner activation accepts caller-supplied business and session identifiers.
3. **P1 — OAuth read functions remain public while only writes have source-write admission.** Known client IDs and hashes can reach stored OAuth metadata without an owner or server identity check.
4. **P1/P2 — Catalog publish can leave durable source status ahead of projections after a returned error.** Repair attempts exist, but the command does not make the partial state explicit before returning.
5. **P2 — External route responses are checked after `response.text()` has already buffered them.** The nominal 64 KiB ceiling does not bound allocation at the fetch boundary.
6. **P2 — Source/local verification is green but hosted, provider, and customer evidence remains open.** The project state explicitly keeps those claims below production evidence.

## Tech Debt

**Inquiry source state reconstruction: [P1]**
- Issue: `loadInquirySourceState` applies one fixed row limit to every table and does not use the target, thread, owner, or business scope to constrain most of those queries.
- Files: `convex/inquirySourceStateLoad.ts:42-66`, `convex/inquiries.ts:737-784`, `convex/inquirySourceStatePersist.ts:32-172`
- Impact: [Observed] The resulting in-memory state silently omits rows after the first 100 (or 200 for operators). [Inference] Targeted inquiry operations can report missing data, rebuild incomplete projections, or persist a partial state once a table exceeds the cap.
- Fix approach: Replace broad reads with indexed, scope-specific loaders; paginate history and append-only records; make any intentionally bounded read return an explicit truncation marker instead of treating a partial state as complete.

**Uneven durable admission around model-backed customer-request actions: [P1/P2]**
- Issue: Preview and submit call the durable Convex rate limiter, but `refine`, `compare`, and resume/route-refresh actions authenticate a caller without an equivalent action-specific admission before potentially invoking interpretation or route refresh.
- Files: `convex/customerRequestApplication.ts:670-800`, `convex/customerRequestApplication.ts:827-875`, `src/modules/customer-request/application/compare-resume/refresh.ts:49-77`, `src/modules/customer-request/application/interpret-compile/interpreter.ts:27-60`
- Impact: [Observed] A valid service assertion or API key is enough to reach these action paths. [Inference] A key holder can create repeated provider calls and Convex action work through paths whose idempotency controls prevent duplicate effects but do not bound throughput or spend.
- Fix approach: Apply named durable budgets to every model-backed action and route refresh, keyed by the authenticated principal and request; record provider attempts and rejection reasons in durable operational readback.

**Duplicated discovery-origin policy: [P2]**
- Issue: Discovery code has its own environment/fallback resolver while HTTP routes use a separate canonical-origin resolver.
- Files: `convex/discovery.ts:487-520`, `convex/discovery.ts:1763-1765`, `src/lib/server/canonical-url.ts:10-26`, `src/modules/discovery/internal/discovery-files.ts:146-205`
- Impact: [Observed] The same public link can be built from a route-validated origin, an arbitrary query argument, or the `https://ae.example` fallback. [Inference] Origin drift can make generated manifests, SEO links, and route readbacks disagree.
- Fix approach: Share one production-required origin validator with Convex-facing discovery builders; do not accept a client-supplied base URL for public readbacks, and preserve fixture origins only in explicit test/dev adapters.

**Boundary exceptions are concentrated in persisted JSON and generated Convex seams: [P3]**
- Issue: Dynamic validator and cast exceptions remain at trust boundaries where model proposals, persisted JSON, and generated rows enter domain code.
- Files: `src/modules/customer-request/internal/convex-v2-schema.ts:115-116`, `src/modules/customer-request/internal/convex-v2-schema.ts:330-360`, `convex/customerRequestRouteExecution.ts:673-675`, `convex/registry.ts:301-365`, `src/modules/action-invocation/application-service.ts:240-241`
- Impact: [Observed] The exceptions are narrow but bypass some static guarantees. [Inference] Persisted schema drift or malformed external data can fail later than the boundary that accepted it, making repairs harder to diagnose.
- Fix approach: Keep each dynamic boundary behind a named parser, validate immediately, and add a focused fixture for every deliberate `v.any()` or cast rather than widening the exception.

## Known Bugs

**Public rate-limit bucket poisoning and key rotation: [P1]**
- Symptoms: The `admitHttp` Convex mutation accepts any caller-provided bucket name and key without authentication. HTTP callers also derive keys from request headers that may be supplied directly by a client.
- Files: `convex/rateLimit.ts:36-51`, `src/lib/server/rate-limit.ts:31-93`
- Trigger: Call `rateLimit:admitHttp` directly with arbitrary keys, or rotate `x-ae-session-id`, `x-real-ip`, or `x-forwarded-for` where the deployment edge does not overwrite those headers.
- Workaround: Rely on a trusted proxy to overwrite identity headers and keep the durable limiter as a best-effort perimeter; this does not close the direct Convex mutation.

**Catalog publish can return an error after marking source rows published: [P1]**
- Symptoms: The command patches the business and claim to `published`, then returns an error if offering persistence, supply projection rebuild, or public catalog readback fails. The operation key can remain `in_progress` while source status has advanced.
- Files: `convex/catalog.ts:509-562`
- Trigger: Submit a valid owner publish whose `persistPublishedOfferings`, `rebuildBusinessSupplyProjectionSnapshotCommand`, or `publicCatalogForBusiness` step returns an error.
- Workaround: Registry/discovery repair attempts can be retried, but callers must not interpret a returned publish error as an atomic rollback.

**Provider earnings readback truncates its ledger scan: [P1/P2]**
- Symptoms: `readProviderEarnings` sums only the newest 100 ledger entries for a business, so gross accruals, rake, refunds, and paid-out totals omit older rows.
- Files: `convex/moneyLedger.ts:456-466`
- Trigger: Accumulate more than 100 ledger rows for one business and call the internal earnings query.
- Workaround: Treat the account balance as the held amount and do not use the bounded aggregate as a complete historical statement until it is replaced by an indexed aggregate or paginated reconciliation.

## Security Considerations

**OAuth storage read boundary: [P1]**
- Risk: `getGrantByHash` and `getClient` are public Convex queries with no authenticated owner, source-read admission, or server identity check. They return OAuth grant/client metadata, including redirect URIs and optional key identifiers, to any caller that supplies a matching lookup value.
- Files: `convex/customerRequestAgentOAuth.ts:93-104`, `convex/customerRequestAgentOAuth.ts:146-152`, `src/lib/server/customer-request-agent-oauth-store.ts:82-128`
- Current mitigation: Public grant writes and `getGrantByRef` now require source-write/source-read arguments; token exchange still uses high-entropy hashes through the HTTP adapter.
- Recommendations: Move all OAuth storage reads behind internal functions or require a verified server capability; return only the minimum token-exchange result and add direct Convex foreign-caller tests.

**Owner activation attribution: [P1]**
- Risk: A public mutation accepts `businessId`, `claimId`, `actorRef`, activation stage, event type, and `pseudonymousSessionId`, then updates authoritative `ownerActivationState`. A caller can forge milestone or failure events for another business and rotate the caller-supplied rate-limit key.
- Files: `convex/observability.ts:335-389`, `src/modules/observability/internal/funnel.ts:67-104`
- Current mitigation: Input fields are schema-bounded and the mutation uses the durable `public-mutation` bucket.
- Recommendations: Separate anonymous analytics from state-changing activation readback; accept only server-derived or signed event context, bind business/claim ownership, and derive throttling identity from the transport rather than the payload.

**Discovery origin injection: [P1/P2]**
- Risk: Public discovery queries accept `canonicalBaseUrl` and `routingBaseUrl` directly, then interpolate them into manifests and `llms.txt` links. The public Convex boundary does not enforce the route resolver's production allowlist.
- Files: `convex/discovery.ts:487-520`, `convex/discovery.ts:1763-1765`, `src/modules/discovery/internal/discovery-files.ts:146-205`
- Current mitigation: Browser-facing routes call `resolveCanonicalBaseUrl`, which fails closed in production when no configured/allowlisted origin exists (`src/lib/server/canonical-url.ts:10-26`).
- Recommendations: Ignore untrusted origin arguments in public Convex queries, require one deployment-owned canonical origin, and test direct-function calls with attacker-controlled origins.

**CSP containment remains permissive: [P2]**
- Risk: The security header builder permits `'unsafe-inline'` for scripts and styles, and enforcement is conditional on report-only configuration.
- Files: `src/lib/http/security-headers.ts:31-55`, `src/lib/http/security-headers.ts:114-126`
- Current mitigation: A static CSP is emitted with explicit origin lists and can be switched to enforcement.
- Recommendations: Thread per-request nonces or stable hashes through SSR, narrow third-party origins, and make report-only an explicit audited non-production choice.

## Performance Bottlenecks

**Registry search fallback hydration: [P2]**
- Problem: A public search reads up to 250 search documents, keeps up to 100 unique business slugs, then hydrates each business's offering supply concurrently and filters in memory.
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:294-295`
- Cause: Search-document matching and supply projection matching are separate stages without one indexed query covering the final public result.
- Improvement path: Maintain a searchable public Offering projection, push location/price predicates into the index where possible, and expose fallback usage/latency before increasing caps.

**Route transport buffers oversized provider responses before rejecting them: [P2]**
- Problem: `readBoundedText` checks `content-length`, then calls `response.text()` and checks the encoded byte length afterward.
- Files: `src/modules/capability-supply/route-transport-runtime.ts:873-900`
- Cause: Chunked responses without a trustworthy length header are fully materialized before the nominal 64 KiB ceiling is applied.
- Improvement path: Read the response stream incrementally, cancel as soon as the byte ceiling is crossed, and use the same bounded-reader primitive as readiness and webhook adapters.

**Inquiry persistence performs many row-level reads and writes after broad hydration: [P2]**
- Problem: `persistInquirySourceState` loops through each loaded bucket, thread, grant, message, notification, receipt, commitment, operation, audit, and funnel record and performs a lookup before each insert or patch.
- Files: `convex/inquirySourceStatePersist.ts:32-172`, `convex/inquirySourceStatePersist.ts:194-318`
- Cause: A domain-state adapter reconstructs a large aggregate for operations that are often single-thread or single-target changes.
- Improvement path: Use entity-scoped native patches for hot paths, retain aggregate reconstruction for bounded repair jobs, and add read/write counts to operational evidence.

## Fragile Areas

**Pseudonymous answer-thread bearer boundary: [P2]**
- Files: `convex/answerThreads.ts:381-465`, `convex/answerThreads.ts:531-595`, `src/modules/answer-thread/internal/session-cookie.ts:6-20`, `src/routes/api.answer.turn.ts:47-95`
- Why fragile: Raw public queries authorize by equality with a caller-supplied pseudonymous session string rather than by Convex identity. The normal HTTP route supplies an `httpOnly` random cookie, but a leaked session value is a bearer credential at the public function boundary.
- Safe modification: Keep the public redacted projection separate, bind raw reads to a server-issued assertion or authenticated identity, and preserve foreign-session denial at both the route and direct-Convex seams.
- Test coverage: Route tests cover cookie/session behavior; direct-function tests should also cover guessed thread IDs, leaked session values, pagination, and projection-vs-raw payload separation.

**Publication and projection repair state: [P2]**
- Files: `convex/catalog.ts:522-575`, `convex/registry.ts:360-483`, `convex/discovery.ts:318-365`
- Why fragile: A source publication fans out into offerings, supply snapshots, registry attempts, discovery manifests, audit rows, and index health. Each projection has its own retry/readback state, so a failure can leave public surfaces at different revisions.
- Safe modification: Make source revision, projection revision, and repair status explicit in one readback; change one projection at a time and exercise replay from a deployed snapshot.
- Test coverage: Source-level tests cover individual projection builders, but an end-to-end failure between each fan-out step and subsequent public readback is still needed.

**External and persisted JSON boundaries: [P3]**
- Files: `src/modules/customer-request/internal/convex-v2-schema.ts:115-116`, `convex/customerRequestRouteExecution.ts:673-675`, `src/modules/capability-supply/route-transport-runtime.ts:896-900`
- Why fragile: Model output, persisted JSON, and external provider responses cross several parser/cast boundaries with different limits and error taxonomies.
- Safe modification: Preserve one bounded parser per boundary, record the rejected digest/reason without raw payloads, and do not widen generated validators to make a fixture pass.
- Test coverage: Unit fixtures cover normal and malformed model proposals; oversized chunked provider responses and persisted-schema drift need explicit regression cases.

## Scaling Limits

**Answer-thread turn history: [P2]**
- Current capacity: Writes cap a thread at `ANSWER_THREAD_MAX_TURNS = 25` and snapshot reads take at most 26 rows.
- Limit: `convex/answerThreads.ts:24-27`, `convex/answerThreads.ts:543-577`
- Scaling path: Long-running sessions need archival/summarization or a documented rollover protocol before the hard cap is raised; keep public readback pagination bounded.

**Capability and registry projection slices: [P2]**
- Current capacity: Registry detail/health paths and capability supply reads use fixed `take(100)`/`take(50)` slices for projection items, revisions, access paths, publications, offerings, and events.
- Limit: `convex/registry.ts:500-502`, `convex/capabilitySupply.ts:1295-1301`
- Scaling path: Use indexed current-revision queries and explicit pagination/overflow markers; never present a truncated health or offering list as complete.

**Durable inquiry state tables: [P1/P2]**
- Current capacity: The loader reads at most 100 rows per table for normal scopes and 200 for operator scope.
- Limit: `convex/inquirySourceStateLoad.ts:42-66`
- Scaling path: Scope every table by business/thread/owner, page append-only history, and reserve full-table repair for scheduled bounded jobs.

## Dependencies at Risk

**`nitro-nightly`: [P2]**
- Risk: The production build depends on an npm alias to a dated `nitro-nightly` package rather than a stable Nitro release.
- Impact: `package.json:136` makes framework/runtime changes, reproducibility, and deployment failures depend on nightly publication and transitive behavior.
- Migration plan: Pin a reviewed stable Nitro release when it supports the current TanStack Start/Vercel Node 22 preset; until then, keep the exact lockfile and run the production build as a release gate.

## Missing Critical Features

**Anonymous inspect-only comparison agent surface: [P1/P2]**
- Problem: The product requirement calls for a fixed anonymous `POST /api/compare` and a registered inspect-only comparison action, but neither exists in the current route/action surface.
- Blocks: Agents cannot use the same bounded comparison object as the human journey without entering a different or unavailable path.
- Files: `.planning/ROADMAP.md:142-169`, `.planning/STATE.md:144-150`

**Hosted/provider/customer evidence packet: [P1/P2]**
- Problem: Source tests and labelled local smoke are green, but the current state explicitly keeps hosted readback, provider, browser, demand, and customer runs open.
- Blocks: A release claim cannot establish deployment configuration, external provider behavior, real transport, or customer journey correctness from source-only evidence.
- Files: `.planning/STATE.md:22-24`, `.planning/STATE.md:139-152`, `package.json:23-37`

## Test Coverage Gaps

**Direct Convex OAuth and rate-limit authorization: [High]**
- What's not tested: A foreign direct Convex caller reading `getGrantByHash`/`getClient`, or invoking `rateLimit:admitHttp` with arbitrary bucket keys and spoofed identity headers.
- Files: `convex/customerRequestAgentOAuth.ts:93-152`, `convex/rateLimit.ts:36-51`, `tests/integration`, `tests/unit`
- Risk: Route-level OAuth and HTTP tests can stay green while the public function boundary remains callable in a way the server adapters did not intend.
- Priority: High

**Inquiry overflow and scope completeness: [High]**
- What's not tested: More than 100 businesses, messages, operations, or audit rows with a target/thread operation that must see the row outside the first page.
- Files: `convex/inquirySourceStateLoad.ts:42-66`, `convex/inquirySourceStatePersist.ts:32-172`, `tests/unit`, `tests/integration`
- Risk: Truncated state can look like a legitimate empty/missing source and produce partial readbacks or writes without a failing typecheck.
- Priority: High

**Projection-failure readback and oversized chunked responses: [Medium]**
- What's not tested: Catalog failure after source-status patches, a stale projection followed by repair/replay, and a chunked provider response with no content length that exceeds 64 KiB.
- Files: `convex/catalog.ts:509-562`, `convex/registry.ts:360-483`, `src/modules/capability-supply/route-transport-runtime.ts:896-900`, `tests/unit`, `tests/integration`
- Risk: Silent source/projection divergence or memory growth can evade the currently green source suites.
- Priority: Medium

**Hosted evidence boundary: [Medium]**
- What's not tested: The deployed Convex/HTTP/provider/customer journey represented by the release scripts, as distinct from source and labelled-local fixtures.
- Files: `.planning/STATE.md:119-152`, `package.json:23-37`, `tests/deploy-smoke`
- Risk: Deployment-only origin, auth, provider, and browser failures remain undiscovered while local evidence is mistaken for production readiness.
- Priority: Medium

---

*Concerns audit: 2026-08-02*
