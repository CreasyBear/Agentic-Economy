---
title: Codebase Concerns
analysis_date: 2026-08-04
refreshed: 2026-08-04
scope: Full repository security, reliability, performance, debt, and operational review
---

# Codebase Concerns

**Analysis Date:** 2026-08-04  
**Scope:** Full repository, including `src/`, `convex/`, route handlers, tests, tooling, configuration, and planning records.

## Reading this map

- **[Observed]** means the concern is directly visible in current source, configuration, or a repository record.
- **[Inference]** means the likely impact follows from the observed implementation and should be confirmed in a deployed environment.
- Severity is relative to the current source and evidence boundary: **P0** can compromise credentials or authoritative data; **P1** can expose private data, corrupt state, or create material cost/availability risk; **P2** is a significant scalability, reliability, or maintenance risk; **P3** is hardening or cleanup.

## Priority summary

1. **P1 — Inquiry source reconstruction is capped but not scope-filtered.** Target, thread, and owner operations hydrate every source table with a fixed `take(100)` or `take(200)` before stateful reads and writes.
2. **P1 — Public Convex admission and attribution seams remain caller-controlled.** The HTTP rate-limit mutation is public, its key can be derived from spoofable headers, and owner activation accepts caller-supplied attribution fields.
3. **P1 — Provider-owned capability publication can select arbitrary deployment environment credentials.** A business owner can publish a generic binding whose `env:*` credential reference is later resolved and sent to the owner-selected endpoint.
4. **P1 — OAuth and external-run read functions expose durable records without a verified reader.** Hash-addressed OAuth grants and run evidence are reachable through public Convex queries.
5. **P1/P2 — Catalog publish can leave durable source status ahead of projections after a returned error.** Repair/readback logic exists, but the source patches happen before every fan-out effect succeeds.
6. **P2 — Registry search pagination repeats the cursor item and is capped by fallback hydration.** Search results are hydrated in memory from at most 250 documents and the cursor calculation starts at the cursor rather than after it.
7. **P2 — External route responses are checked after `response.text()` has already buffered them.** The nominal 64 KiB ceiling does not bound allocation at the fetch boundary.
8. **P2 — Source/local verification is stronger than hosted, provider, and customer evidence.** Current planning state explicitly keeps those release claims open.

## Tech Debt

**Inquiry source state reconstruction: [P1]**
- Issue: `loadInquirySourceState` applies one fixed row limit to every table and does not use the target, thread, owner, or business scope to constrain most queries.
- Files: `convex/inquirySourceStateLoad.ts:41-73`, `convex/inquiries.ts:737-784`, `convex/inquirySourceStatePersist.ts:32-172`
- Impact: [Observed] Rows after the first 100 (or 200 for operator scope) are silently absent from the reconstructed aggregate. [Inference] A targeted operation can report missing data, rebuild incomplete projections, or persist a partial state once a table exceeds the cap.
- Fix approach: Replace broad reads with indexed, scope-specific loaders; paginate append-only history; make intentionally bounded reads return an explicit truncation marker instead of treating partial state as complete.

**Uneven durable admission around customer-request actions: [P1/P2]**
- Issue: `preview` and `submit` call the durable Convex limiter, but `refine`, `provideFacts`, `resume`, and `compare` authenticate a caller without an equivalent action-specific admission before interpretation, comparison, or route-refresh work.
- Files: `convex/customerRequestApplication.ts:670-875`, `src/modules/customer-request/application/compare-resume/refresh.ts:49-77`, `src/modules/customer-request/application/interpret-compile/interpreter.ts:27-60`
- Impact: [Observed] A valid service assertion or API key reaches these paths. [Inference] A key holder can repeatedly create action work and provider/model attempts through paths whose idempotency controls prevent duplicate effects but do not bound throughput or spend.
- Fix approach: Apply named durable budgets to every model-backed action and route refresh, keyed by authenticated principal and request; record provider attempts and rejection reasons in durable operational readback.

**Duplicated discovery-origin policy: [P2]**
- Issue: Convex discovery builders use their own environment/fallback resolver while HTTP routes use a separate canonical-origin resolver.
- Files: `convex/discovery.ts:482-524`, `convex/discovery.ts:1886-1888`, `src/lib/server/canonical-url.ts:10-26`, `src/modules/discovery/internal/discovery-files.ts:146-205`
- Impact: [Observed] The same public link can be built from a route-validated origin, a caller-provided origin, or the `https://ae.example` fallback. [Inference] Manifests, SEO links, and route readbacks can disagree, and direct Convex callers can cause misleading link generation.
- Fix approach: Share one production-required origin validator with Convex-facing builders; ignore client-supplied base URLs for public readbacks and keep fixture origins in explicit test/dev adapters.

**Boundary exceptions are concentrated in persisted JSON and generated Convex seams: [P3]**
- Issue: Dynamic validator and cast exceptions remain where model proposals, persisted JSON, generated rows, and transport observations enter domain code.
- Files: `src/modules/customer-request/internal/convex-v2-schema.ts:115-116`, `src/modules/customer-request/internal/convex-v2-schema.ts:330-360`, `convex/customerRequestRouteExecution.ts:673-675`, `convex/registry.ts:301-365`, `src/modules/action-invocation/application-service.ts:240-241`
- Impact: [Observed] The exceptions are narrow but bypass some static guarantees. [Inference] Persisted schema drift or malformed external data can fail later than the accepting boundary, making diagnosis and repair harder.
- Fix approach: Keep each dynamic boundary behind a named parser, validate immediately, and add a focused fixture for every deliberate `v.any()` or cast rather than widening the exception.

**Source/projection fan-out remains hand-assembled: [P2]**
- Issue: Catalog publication, capability supply, registry, discovery, audit, and index effects are coordinated in one mutation command rather than through a durable fan-out protocol.
- Files: `convex/catalog.ts:570-623`, `convex/registry.ts:360-483`, `convex/discovery.ts:318-365`, `convex/businessSupplyProjectionSnapshot.ts:230-255`
- Impact: [Observed] The command performs multiple writes and readbacks in sequence. [Inference] Convex mutation limits or an intermediate exception can leave repair state spread across projections with no single atomic status for consumers.
- Fix approach: Persist a source revision and per-projection state machine first, then process bounded idempotent projection jobs with explicit retry/readback status.

## Known Bugs

**Public rate-limit bucket poisoning and key rotation: [P1]**
- Symptoms: `rateLimit:admitHttp` accepts any caller-provided bucket name and key without authentication. HTTP callers also derive keys from request headers that may be supplied directly by a client.
- Files: `convex/rateLimit.ts:36-51`, `src/lib/server/rate-limit.ts:31-93`
- Trigger: Call `rateLimit:admitHttp` directly with arbitrary keys, or rotate `x-ae-session-id`, `x-real-ip`, or `x-forwarded-for` where the deployment edge does not overwrite those headers.
- Workaround: Rely on a trusted proxy to overwrite identity headers and keep the durable limiter as a best-effort perimeter; this does not close the direct Convex mutation.

**Registry search cursor repeats an item: [P2]**
- Symptoms: A search page's `nextCursor` is the next item's slug, but the next request starts at that item's index, returning it again; an unknown cursor also silently restarts at the first item.
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:333-338`
- Trigger: Issue a search with a result set larger than `limit`, then call the next page with the returned `nextCursor`.
- Workaround: Consumers can de-duplicate by `businessId`/slug, but this hides missing or repeated-page accounting rather than fixing the contract.

**Catalog publish can return an error after marking source rows published: [P1]**
- Symptoms: The command patches the business and claim to `published`, then returns an error if offering persistence, supply projection rebuild, or public catalog readback fails. The operation key can remain `in_progress` while source status has advanced.
- Files: `convex/catalog.ts:570-623`
- Trigger: Submit a valid owner publish whose `persistPublishedOfferings`, projection rebuild, or `publicCatalogForBusiness` step returns an error.
- Workaround: Registry/discovery repair attempts can be retried, but callers must not interpret a returned publish error as an atomic rollback.

**Provider earnings readback truncates its ledger scan: [P1/P2]**
- Symptoms: `readProviderEarnings` sums only the newest 100 ledger entries for a business, so gross accruals, rake, refunds, and paid-out totals omit older rows.
- Files: `convex/moneyLedger.ts:456-466`
- Trigger: Accumulate more than 100 ledger rows for one business and call the internal earnings query.
- Workaround: Treat the account balance as the held amount and do not use the bounded aggregate as a complete historical statement until it is replaced by an indexed aggregate or paginated reconciliation.

## Security Considerations

**OAuth storage read boundary: [P1]**
- Risk: `getGrantByHash` and `getClient` are public Convex queries with no authenticated owner, source-read admission, or server identity check. They return grant/client metadata, redirect URIs, hashes, and optional delivery/key identifiers to any caller supplying a matching lookup value.
- Files: `convex/customerRequestAgentOAuth.ts:93-104`, `convex/customerRequestAgentOAuth.ts:146-152`, `src/lib/server/customer-request-agent-oauth-store.ts:82-128`
- Current mitigation: Public grant writes and `getGrantByRef` require source-write/source-read arguments; token exchange uses hash lookups and the HTTP adapter controls the normal route.
- Recommendations: Move all OAuth storage reads behind internal functions or a verified server capability; return only the minimum token-exchange result and add direct Convex foreign-caller tests.

**External-run evidence read boundary: [P1/P2]**
- Risk: `inspectManifest` and `readReport` are public Convex queries with no caller identity or possession proof. A holder or guesser of a `runId` can read provider declarations, attribution/consent records, evidence signals, and gate results.
- Files: `convex/externalRuns.ts:117-132`, `convex/externalRuns.ts:320-357`, `src/modules/external-run/internal/contract.ts:89-165`
- Current mitigation: Mutations require source-write admission and admin/operator authority; integrity digests detect tampering but do not provide confidentiality.
- Recommendations: Require an authenticated operator or signed report capability for private runs, separate public decision summaries from private evidence, and use high-entropy run references.

**Provider-owned credential reference selection: [P1]**
- Risk: Generic owner publication accepts a binding with an arbitrary `credentialRef`; transport admission accepts any `env:NAME`; runtime then resolves that deployment environment variable and sends it to the owner-selected HTTPS endpoint. [Inference] Any compromised or malicious business owner could use this as a secret-confusion or exfiltration path if platform-wide variables are in the same environment.
- Files: `convex/capabilitySupply.ts:638-683`, `src/modules/capability-supply/internal/transport-adapters.ts:87-110`, `src/modules/capability-supply/route-transport-runtime.ts:340-344`, `convex/customerRequestRouteTransportWorker.ts:100-110`
- Current mitigation: Owner authentication, HTTPS-only endpoint admission, static private-host checks, and runtime DNS guarding reduce unauthorized use and SSRF risk; owner-supply funnel explicitly publishes `credentialRef: 'none'`.
- Recommendations: Use a managed credential namespace bound to an admitted provider/binding, prohibit arbitrary environment references on owner/provider paths, and separate provider credentials from platform/model secrets.

**Owner activation attribution: [P1]**
- Risk: A public mutation accepts `businessId`, `claimId`, `actorRef`, activation stage, event type, and pseudonymous session identifiers, then updates authoritative `ownerActivationState`. A caller can forge milestone/failure events for another business and rotate the caller-supplied rate-limit key.
- Files: `convex/observability.ts:335-389`, `src/modules/observability/internal/funnel.ts:67-104`
- Current mitigation: Input fields are schema-bounded and the mutation uses the durable `public-mutation` bucket.
- Recommendations: Separate anonymous analytics from state-changing activation readback; accept only server-derived or signed event context, bind business/claim ownership, and derive throttling identity from trusted transport identity.

**Discovery origin injection: [P1/P2]**
- Risk: Public discovery queries accept `canonicalBaseUrl` and `routingBaseUrl` directly, then interpolate them into manifests and `llms.txt` links. The public Convex boundary does not enforce the route resolver's production allowlist.
- Files: `convex/discovery.ts:490-524`, `convex/discovery.ts:1886-1888`, `src/modules/discovery/internal/discovery-files.ts:146-205`
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
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:297-307`
- Cause: Search-document matching and supply projection matching are separate stages without one indexed query covering the final public result.
- Improvement path: Maintain a searchable public Offering projection, push location/price predicates into indexes where possible, and expose fallback usage/latency before increasing caps.

**Route transport buffers oversized provider responses before rejecting them: [P2]**
- Problem: `readBoundedText` checks `content-length`, then calls `response.text()` and checks encoded byte length afterward.
- Files: `src/modules/capability-supply/route-transport-runtime.ts:892-920`
- Cause: Chunked responses without a trustworthy length header are fully materialized before the nominal 64 KiB ceiling is applied.
- Improvement path: Read the response stream incrementally, cancel as soon as the byte ceiling is crossed, and use the same bounded-reader primitive as readiness and webhook adapters.

**Readiness probes have the same post-buffering response check: [P2]**
- Problem: The readiness probe calls `response.text()` before applying its 64 KiB body check.
- Files: `src/modules/capability-supply/internal/readiness-probe.ts:79-120`
- Cause: A provider can return a large chunked response and consume memory before the probe classifies it as too large.
- Improvement path: Reuse a streaming bounded reader and retain only the bounded prefix needed for schema validation.

**Inquiry persistence performs many row-level reads and writes after broad hydration: [P2]**
- Problem: `persistInquirySourceState` loops through each loaded bucket, thread, grant, message, notification, receipt, commitment, operation, audit, and funnel record and performs a lookup before each insert or patch.
- Files: `convex/inquirySourceStatePersist.ts:32-172`, `convex/inquirySourceStatePersist.ts:194-318`
- Cause: A domain-state adapter reconstructs a large aggregate for operations that are often a single-thread or single-target change.
- Improvement path: Use entity-scoped native patches for hot paths, retain aggregate reconstruction for bounded repair jobs, and add read/write counts to operational evidence.

## Fragile Areas

**Pseudonymous answer-thread bearer boundary: [P2]**
- Files: `convex/answerThreads.ts:381-465`, `convex/answerThreads.ts:531-621`, `src/modules/answer-thread/internal/session-cookie.ts:6-20`, `src/routes/api.answer.turn.ts:47-95`
- Why fragile: Raw public queries authorize by equality with a caller-supplied pseudonymous session string rather than by Convex identity. The normal HTTP route supplies an `httpOnly` random cookie, but a leaked session value is a bearer credential at the public function boundary.
- Safe modification: Keep the public redacted projection separate, bind raw reads to a server-issued assertion or authenticated identity, and preserve foreign-session denial at both route and direct-Convex seams.
- Test coverage: Route tests cover cookie/session behavior; direct-function tests should cover guessed thread IDs, leaked session values, pagination, and projection-vs-raw payload separation.

**Publication and projection repair state: [P2]**
- Files: `convex/catalog.ts:522-623`, `convex/registry.ts:360-483`, `convex/discovery.ts:318-365`
- Why fragile: A source publication fans out into offerings, supply snapshots, registry attempts, discovery manifests, audit rows, and index health. Each projection has its own retry/readback state, so a failure can leave public surfaces at different revisions.
- Safe modification: Make source revision, projection revision, and repair status explicit in one readback; change one projection at a time and exercise replay from a deployed snapshot.
- Test coverage: Source-level tests cover individual projection builders, but an end-to-end failure between each fan-out step and subsequent public readback is still needed.

**External and persisted JSON boundaries: [P3]**
- Files: `src/modules/customer-request/internal/convex-v2-schema.ts:115-116`, `convex/customerRequestRouteExecution.ts:673-675`, `src/modules/capability-supply/route-transport-runtime.ts:892-920`
- Why fragile: Model output, persisted JSON, and external provider responses cross several parser/cast boundaries with different limits and error taxonomies.
- Safe modification: Preserve one bounded parser per boundary, record rejected digests/reasons without raw payloads, and do not widen generated validators to make a fixture pass.
- Test coverage: Unit fixtures cover normal and malformed model proposals; oversized chunked provider responses and persisted-schema drift need explicit regression cases.

**Large Convex host modules: [P2]**
- Files: `convex/catalog.ts`, `convex/capabilitySupply.ts`, `convex/customerRequestApplication.ts`, `convex/customerRequestRouteExecution.ts`, `convex/workTrees.ts`
- Why fragile: These files combine public schemas, authority checks, state reconstruction, durable writes, projection repair, and transport orchestration in roughly 1,100-2,200 lines each. Small edits can cross source/projection or auth/effect boundaries.
- Safe modification: Change one domain command or port at a time, preserve generated `DataModel` types, and add a failure-path readback before moving code between hosts.
- Test coverage: Focused unit and integration suites cover many command paths, but cross-module mutation failure and deployed Convex transaction-limit behavior remain under-observed.

## Scaling Limits

**Answer-thread turn history: [P2]**
- Current capacity: Writes cap a thread at `ANSWER_THREAD_MAX_TURNS = 25`; snapshot reads take at most 26 rows and public reads at most 25.
- Limit: `convex/answerThreads.ts:24-27`, `convex/answerThreads.ts:543-621`
- Scaling path: Long-running sessions need archival/summarization or a documented rollover protocol before raising the cap; keep public readback pagination bounded.

**Capability and registry projection slices: [P2]**
- Current capacity: Registry detail/health paths and capability supply reads use fixed `take(100)`/`take(50)` slices for projection items, revisions, access paths, publications, offerings, and events.
- Limit: `convex/registry.ts:500-502`, `convex/capabilitySupply.ts:1295-1301`
- Scaling path: Use indexed current-revision queries and explicit pagination/overflow markers; never present a truncated health or offering list as complete.

**Durable inquiry state tables: [P1/P2]**
- Current capacity: The loader reads at most 100 rows per table for normal scopes and 200 for operator scope.
- Limit: `convex/inquirySourceStateLoad.ts:41-66`
- Scaling path: Scope every table by business/thread/owner, page append-only history, and reserve full-table repair for scheduled bounded jobs.

**External-run cohort and evidence: [P2]**
- Current capacity: A run admits 12 starts and 64 evidence rows per start, with a 768-row aggregate read cap.
- Limit: `convex/externalRuns.ts:24-26`, `convex/externalRuns.ts:182-185`, `convex/externalRuns.ts:232-235`, `convex/externalRuns.ts:289-295`
- Scaling path: Keep the gate bounded but use indexed counters/aggregates and explicit overflow state if cohorts or evidence classes grow; do not make a report look complete when a read is truncated.

## Dependencies at Risk

**`nitro-nightly`: [P2]**
- Risk: The production build depends on an npm alias to a dated `nitro-nightly` package rather than a stable Nitro release.
- Impact: `package.json:136` makes framework/runtime changes, reproducibility, and deployment failures depend on nightly publication and transitive behavior.
- Migration plan: Pin a reviewed stable Nitro release when it supports the current TanStack Start/Vercel Node 22 preset; until then, keep the exact lockfile and run the production build as a release gate.

**Node runtime metadata drift: [P2]**
- Risk: Source configuration declares Node `>=22` and Nitro functions `nodejs22.x`, while Vercel project metadata records Node `24.x`.
- Impact: `package.json:153-156`, `vite.config.ts:57-67`, `.vercel/project.json:5-15` can select different runtime behavior for local, build, and hosted execution.
- Migration plan: Choose one supported Node major, update source and project metadata together, and add a deployment readback that proves the selected runtime rather than relying on configuration inspection.

**AI SDK/provider surface churn: [P2]**
- Risk: `ai@7`, OpenRouter, TanStack AI, MCP SDK, x402 packages, and Convex components are updated on independent cadences; the deferred `@convex-dev/agent` integration is not available in the installed dependency graph.
- Impact: `package.json:60-123` leaves transport, tool, payment, and workflow compatibility dependent on several moving contracts.
- Migration plan: Keep provider transports behind existing ports, pin lockfile versions, and record compatibility evidence before adopting a component that peers against another AI SDK major.

## Missing Critical Features

**Anonymous inspect-only comparison agent surface: [P1/P2]**
- Problem: The current roadmap/state requirement calls for a fixed anonymous `POST /api/compare` and a registered inspect-only comparison action, but neither exists in the current route/action surface.
- Blocks: Agents cannot use the same bounded comparison object as the human journey without entering a different or unavailable path.
- Files: `.planning/ROADMAP.md:142-169`, `.planning/STATE.md:144-150`, `convex/customerRequestApplication.ts:852-875`

**Hosted/provider/customer evidence packet: [P1/P2]**
- Problem: Source tests and labelled local smoke may verify code paths, but the current state explicitly keeps hosted readback, provider, browser, demand, and customer runs open.
- Blocks: A release claim cannot establish deployment configuration, external provider behavior, real transport, or customer journey correctness from source-only evidence.
- Files: `.planning/STATE.md:20-32`, `.planning/STATE.md:139-152`, `package.json:23-37`, `tests/deploy-smoke`

**Durable cleanup and retention policy for append-only evidence: [P2]**
- Problem: OAuth cleanup and source-write nonce cleanup are bounded jobs, but broad inquiry, answer, harness, audit, and external-run evidence retention/archival is not represented as a single operational policy.
- Blocks: Long-lived deployments can accumulate private records and projection history until fixed row caps become correctness limits or storage cost drivers.
- Files: `convex/customerRequestAgentOAuth.ts:44-78`, `convex/sourceWriteAdmission.ts:195-234`, `convex/inquirySourceStateLoad.ts:41-66`, `convex/harnessSessions.ts:448-499`, `convex/externalRuns.ts:320-357`

## Test Coverage Gaps

**Direct Convex OAuth, external-run, and rate-limit authorization: [High]**
- What's not tested: A foreign direct Convex caller reading OAuth grants/clients or external-run reports, or invoking `rateLimit:admitHttp` with arbitrary bucket keys and spoofed identity headers.
- Files: `convex/customerRequestAgentOAuth.ts:93-152`, `convex/externalRuns.ts:117-132`, `convex/externalRuns.ts:320-357`, `convex/rateLimit.ts:36-51`, `tests/integration`, `tests/unit`
- Risk: Route-level tests can stay green while a public function boundary remains callable in a way the server adapters did not intend.
- Priority: High

**Owner binding credential isolation: [High]**
- What's not tested: A provider-owned publication using a valid `env:*` credential reference, followed by readiness or route execution, and verification that only the intended managed credential is sent.
- Files: `convex/capabilitySupply.ts:638-683`, `src/modules/capability-supply/internal/transport-adapters.ts:87-110`, `src/modules/capability-supply/internal/readiness-probe.ts:125-141`, `tests/integration/capability-supply-registration.test.ts`
- Risk: A secret-confusion path can pass source-level validation while exposing deployment credentials to an admitted external endpoint.
- Priority: High

**Inquiry overflow and scope completeness: [High]**
- What's not tested: More than 100 businesses, messages, operations, or audit rows with a target/thread operation that must see a row outside the first page.
- Files: `convex/inquirySourceStateLoad.ts:41-66`, `convex/inquirySourceStatePersist.ts:32-172`, `tests/unit`, `tests/integration`
- Risk: Truncated state can look like a legitimate empty/missing source and produce partial readbacks or writes without a failing typecheck.
- Priority: High

**Search cursor and fallback overflow: [Medium]**
- What's not tested: A search page followed by its returned cursor, an unknown cursor, and more than 250 search documents or 100 hydrated businesses.
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:297-338`, `tests/integration`, `tests/unit`
- Risk: Agents can repeat listings, skip results, or receive a partial catalogue while the response reports a normal page contract.
- Priority: Medium

**Projection-failure readback and oversized chunked responses: [Medium]**
- What's not tested: Catalog failure after source-status patches, a stale projection followed by repair/replay, a chunked provider response with no content length that exceeds 64 KiB, and an oversized readiness response.
- Files: `convex/catalog.ts:570-623`, `convex/registry.ts:360-483`, `src/modules/capability-supply/route-transport-runtime.ts:892-920`, `src/modules/capability-supply/internal/readiness-probe.ts:79-120`, `tests/unit`, `tests/integration`
- Risk: Silent source/projection divergence or memory growth can evade source suites.
- Priority: Medium

**Hosted evidence boundary: [Medium]**
- What's not tested: The deployed Convex/HTTP/provider/customer journey represented by release scripts, as distinct from source and labelled-local fixtures.
- Files: `.planning/STATE.md:119-152`, `package.json:23-37`, `tests/deploy-smoke`
- Risk: Deployment-only origin, auth, provider, and browser failures remain undiscovered while local evidence is mistaken for production readiness.
- Priority: Medium

---

*Concerns audit: 2026-08-04*
