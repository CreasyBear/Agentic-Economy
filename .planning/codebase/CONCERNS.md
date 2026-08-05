---
title: Codebase Concerns
analysis_date: 2026-08-05
refreshed: 2026-08-05
scope: Full repository security, reliability, performance, debt, and operational review
---

# Codebase Concerns

**Analysis Date:** 2026-08-05  
**Scope:** Full repository, including `src/`, `convex/`, route handlers, tests, tooling, configuration, and planning records.

## Reading this map

- **[Observed]** means the concern is directly visible in current source, configuration, or a repository record.
- **[Inference]** means the likely impact follows from the observed implementation and should be confirmed in a deployed environment.
- Severity is relative to the current source and evidence boundary: **P0** can compromise credentials or authoritative data; **P1** can expose private data, corrupt state, or create material cost/availability risk; **P2** is a significant scalability, reliability, or maintenance risk; **P3** is hardening or cleanup.

> **Refresh note (2026-08-05):** This revision preserves still-valid concerns from the prior pass and re-verifies them against live source, and adds the newly-landed surfaces: the engine `planPreview`/interpreter (`src/modules/customer-request/application/interpret-compile/`), the curated 20-op catalog + admission normalizer (`convex/curatedProviders.ts`, `admit-provider-schema.ts`), tri-state provenance, `inputExamples`/`searchTerms`/`domain` teaching, and the cross-capability domain guard. A repo-wide scan found **zero** `TODO`/`FIXME`/`HACK`/`XXX`/`BUG` comments, no `@ts-ignore`, and no `as any` outside the generated router — the debt here is latent risk in live code, not marked stubs.

## Priority summary

1. **P1 — Engine live-catalog selection reliability has one unfixed teaching gap.** The `inputExamples` worked examples are threaded onto `ServerCapabilityDescriptor` but **stripped by `publicDescriptor`** before the model payload is built, so the model never sees them; `planPreview` always passes `finalAttempt: true` (no model retry), and the deterministic fallback caps at `MAXIMUM_SELECTIONS = 1`.
2. **P1 — Public Convex admission and attribution seams remain caller-controlled.** `rateLimit:admitHttp` derives its bucket/key from fully spoofable client headers, and owner-activation recording accepts caller-supplied attribution.
3. **P1 — OAuth and external-run read functions expose durable records without a verified reader.** `getGrantByHash`/`getClient` are public queries with no identity gate (their sibling `getGrantByRef` is gated).
4. **P1 — Provider-owned capability publication can select arbitrary deployment environment credentials.** A generic binding's `env:*` credential reference is resolved later and sent to the owner-selected endpoint.
5. **P1/P2 — Expensive customer-request actions are authenticated but not durably budgeted.** `refine`, `provideFacts`, `resume`, `compare`, and `confirmRoute` reach interpretation/comparison/route work with no per-principal admission (unlike `preview`/`submit`).
6. **P2 — Provenance is split: `observed_external` never persists.** Cluster C (observed x402) is recorded as `ae_curated_external`; `observed_external` exists in the enum/gate but the seed path never records it.
7. **P2 — External route responses and readiness probes are checked after `response.text()` has already buffered them.**
8. **P2 — Registry search pagination repeats the cursor item and is capped by fallback hydration; provider earnings readback truncates at 100 ledger rows.**
9. **P2 — Source/local verification is stronger than hosted, provider, and customer evidence.**

## Tech Debt

**Engine teaching surface is dropped before the model payload: [P1]**
- Issue: `inputExamples` (the AI SDK-style worked examples that teach input construction, e.g. "geocode a city name to `{latitude,longitude}`") are threaded onto `ServerCapabilityDescriptor` in `graph.ts:68,129,203`, but `createJsonCustomerRequestSemanticInterpreter` maps the model payload through `publicDescriptor` at `semantic-interpreter.ts:282`, and `publicDescriptor` (`semantic-interpreter.ts:936-946`) returns only `operationRef/name/description/inputs/evidence` — it **drops `inputExamples` (and `searchTerms`/`domain`)**. `searchTerms`/`domain` are intentionally server-side (verified comment at `semantic-interpreter.ts:620-631`), but `inputExamples` is teaching data that, like `searchTerms`, is only consumed server-side and never projected to the model.
- Files: `src/modules/customer-request/semantic-interpreter.ts:282,936-946`, `src/modules/customer-request/application/interpret-compile/graph.ts:68,129,203`
- Impact: [Observed] `inputExamples` added to the curated contracts never reaches the model, so the worked-example teaching intent is unrealized on the model path. [Inference] Model input construction (esp. the geocode `{latitude,longitude}` compose case) relies on schema + instruction prompts alone.
- Fix approach: Surface `inputExamples` on the model-facing descriptor (project them in `publicDescriptor`) so the AI SDK teaching surface actually reaches selection/input construction, or drop them from the curated source if they are serving only the deterministic side. Add a test asserting worked examples appear in the model payload.

**`planPreview` disables model retry: [P2]**
- Issue: `preview.ts:91` passes `finalAttempt: true`, while `interpret.ts:183` uses `finalAttempt: attempt === 1` (a retry loop when not final). The model interpreter at `interpreter.ts:142` throws a real provider error when `input.finalAttempt === true` rather than retrying, absorbing a transient model/transport blip into `preview_unavailable`.
- Files: `src/modules/customer-request/application/interpret-compile/preview.ts:91`, `interpret.ts:183`, `interpreter.ts:142`
- Impact: [Observed] A single transient OpenRouter completion failure during `planPreview` directly downgrades the preview rather than retrying up to the configured retries in `interpret.ts`. [Inference] Preview availability is lower than the submit path under provider churn.
- Fix approach: Pass `finalAttempt: attempt === 1` from the preview orchestration (or route the retry loop through `proposeThenCompile`) so previews get the same bounded retry as submits, while keeping deterministic recovery as the last-resort fallback.

**Deterministic fallback caps any plan at one selection: [P2]**
- Issue: `deterministic-interpreter.ts:15` sets `MAXIMUM_SELECTIONS = 1` and `:63` slices to the best single match. When the model returns zero/wrong selections, `recoverFromPool` (`interpreter.ts`) hands off and the composite can only ever produce a one-capability plan, so compose steps (e.g. geocode → lookup) are unreachable on the recovery path.
- Files: `src/modules/customer-request/application/interpret-compile/deterministic-interpreter.ts:15,63`
- Impact: [Observed] Multi-step plans work only when the model fully selects them; any fallback collapses to one capability. [Inference] Compound capability-eligible queries can surface as an incomplete plan on the recovery path.
- Fix approach: Allow the deterministic recovery to pick the highest-ranked slice of a bounded ordered list (with the cross-capability guard applied) or emit `needs_information` rather than a truncated plan when more than one capability is required.

**Uneven durable admission around customer-request actions: [P1/P2]**
- Issue: `preview` (`convex/customerRequestApplication.ts:675`) and `submit` (`:716`) apply durable rate-limit budgets; `refine` (`:780`), `provideFacts` (`:807`), `resume` (`:837`), `compare` (`:858`), and `confirmRoute` (`:880`) only authenticate a caller (service-assertion or API key) with no action-specific durable admission before model interpretation, comparison, or route-refresh work.
- Files: `convex/customerRequestApplication.ts:675-880`, `src/modules/customer-request/application/compare-resume/refresh.ts:49-77`, `src/modules/customer-request/application/interpret-compile/interpreter.ts:27-60`
- Impact: [Observed] A valid service assertion or API key reaches these paths. [Inference] A key holder can repeatedly create model-backed action work and provider attempts through paths whose idempotency controls prevent duplicate effects but do not bound throughput or spend.
- Fix approach: Apply named durable budgets to every model-backed action and route refresh, keyed by authenticated principal and request; record provider attempts and rejection reasons in durable operational readback.

**Duplicated discovery-origin policy: [P2]**
- Issue: Convex discovery builders use their own environment/fallback resolver while HTTP routes use a separate canonical-origin resolver.
- Files: `convex/discovery.ts:482-524`, `convex/discovery.ts:1886-1888`, `src/lib/server/canonical-url.ts:10-26`, `src/modules/discovery/internal/discovery-files.ts:146-205`
- Impact: [Observed] The same public link can be built from a route-validated origin, a caller-provided origin, or the `https://ae.example` fallback. [Inference] Manifests, SEO links, and route readbacks can disagree, and direct Convex callers can cause misleading link generation.
- Fix approach: Share one production-required origin validator with Convex-facing builders; ignore client-supplied base URLs for public readbacks and keep fixture origins in explicit test/dev adapters.

**Admission normalizer hand-rolls JSON-Schema unwrapping: [P2/P3]**
- Issue: `admit-provider-schema.ts` deterministically normalizes provider OpenAPI/JSON-Schema by hand-rolling `$ref`/`allOf`/`oneOf` dereferencing, output-evidence extraction, credential stripping, and metadata derivation, with four named refusal reasons (`schema_profile_unsupported` and kin).
- Files: `src/modules/capability-supply/internal/admit-provider-schema.ts`, `src/modules/capability-supply/internal/publication-importers.ts`
- Impact: [Observed] Deterministic and self-contained. [Inference] Re-implements a problem a maintained JSON-Schema dereference library already solves, so edge cases (deep/cyclic `$ref`, exotic combinators) are only as robust as the hand-rolled walker.
- Fix approach: Reuse an existing JSON-Schema dereferencer from the installed dependency graph (per lean rule #6) and keep only the AE-specific normalization (credential strip, output-evidence, metadata) on top; add regression fixtures for cyclic and nested `$ref`.

**Boundary exceptions are concentrated in persisted JSON and generated Convex seams: [P3]**
- Issue: Dynamic validator and cast exceptions remain where model proposals, persisted JSON, generated rows, and transport observations enter domain code.
- Files: `src/modules/customer-request/internal/convex-v2-schema.ts:115-116`, `src/modules/customer-request/internal/convex-v2-schema.ts:330-360`, `convex/customerRequestRouteExecution.ts:673-675`, `convex/registry.ts:301-365`, `src/modules/action-invocation/application-service.ts:240-241`
- Impact: [Observed] The exceptions are narrow but bypass some static guarantees. [Inference] Persisted schema drift or malformed external data can fail later than the accepting boundary, making diagnosis and repair harder.
- Fix approach: Keep each dynamic boundary behind a named parser, validate immediately, and add a focused fixture for every deliberate `v.any()` or cast rather than widening the exception.

**Projection fan-out is atomic in the transaction but ambient projections are queued out-of-band: [P2]**
- Issue: `publishBusinessCatalogCommand` performs the source patches, projection snapshot, and registry search-document writes **inside one Convex transaction** (atomic), but the ambient registry/discovery projection attempts and discovery manifests are recorded as "queued" attempts and processed out-of-band (scheduler). Replay can return a `catalog_publish_replayed` status from attempt rows before the ambient projection has actually landed.
- Files: `convex/catalog.ts:522-623`, `convex/capabilitySupplyProjection.ts`, `convex/registry.ts:360-483`, `convex/discovery.ts:318-365`
- Impact: [Observed] The authoritative projection snapshot is consistent with source (same transaction), but public registry/discovery surfaces are updated asynchronously. [Inference] A consumer can read a `replayed` attempt status and treat it as "projected" while the public surface lags, and a scheduler failure can leave ambient surfaces at a stale revision.
- Fix approach: Expose source revision, in-transaction projection revision, and ambient projection/repair status as one explicit readback; make replay idempotent and return `pending` until the ambient surface actually reflects the source revision, not just that an attempt row exists.

## Known Bugs

**Registry search cursor repeats an item and unknown cursors silently restart: [P2]**
- Symptoms: A search page's `nextCursor` is the next item's slug, but the next request starts at that item's index, returning it again; an unknown cursor also silently restarts at the first item. Results are hydrated in memory from at most 250 search documents / 100 unique businesses.
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:297-338`
- Trigger: Issue a search with a result set larger than `limit`, then call the next page with the returned `nextCursor`.
- Workaround: Consumers can de-duplicate by `businessId`/slug, but this hides missing or repeated-page accounting rather than fixing the contract.
- Note: `registry.ts:164-166` carries a dated comment acknowledging the search documents are async-backfilled.

**Provider earnings readback truncates its ledger scan: [P1/P2]**
- Symptoms: `readProviderEarnings` sums only the newest 100 ledger entries for a business, so gross accruals, rake, refunds, and paid-out totals omit older rows. No `complete` marker distinguishes a full from a bounded aggregate.
- Files: `convex/moneyLedger.ts:456-466`
- Trigger: Accumulate more than 100 ledger rows for one business and call the internal earnings query.
- Workaround: Treat the account balance as the held amount and do not use the bounded aggregate as a complete historical statement until it is replaced by an indexed aggregate or paginated reconciliation.

**`observed_external` provenance is never persisted: [P2]**
- Symptoms: Cluster C (`curated-cluster-c-publications.ts`) describes itself as "observed Agentic-Market x402 listings" in prose, but the seed path derives `authorityMode` at `publish.ts:62` as `provider_owned` (owner actor) else `ae_curated_external` (everything else). The seed actor is the curated/system path, so every curated publication — including the observed cluster — is recorded as `ae_curated_external`; `observed_external` exists in the enum (`provenance.ts:8-10`) and gate (`:39`) but is never written.
- Files: `src/modules/capability-supply/internal/publication/publish.ts:62`, `src/modules/capability-supply/internal/publication/provenance.ts:8-10,39`, `src/modules/capability-supply/curated-cluster-c-publications.ts`
- Trigger: Inspect the persisted `authorityMode` of any cluster-C publication.
- Workaround: The distinction is currently represented only in description/label text; a consumer cannot assert "this capability was observed, never executed/paid" from the persisted provenance alone.

**Public rate-limit bucket poisoning and key rotation: [P1]**
- Symptoms: `rateLimit:admitHttp` (`convex/rateLimit.ts:36-51`) accepts any caller-provided bucket name and key without authentication. HTTP callers also derive keys from request headers (`src/lib/server/rate-limit.ts:31-93`) that a client can set directly (session cookies, `x-api-key`, bearer, or `x-forwarded-for`/`x-real-ip` where the edge does not overwrite them).
- Files: `convex/rateLimit.ts:36-51`, `src/lib/server/rate-limit.ts:31-93`
- Trigger: Call `rateLimit:admitHttp` directly with arbitrary keys, or rotate identity headers the edge does not overwrite.
- Workaround: Rely on a trusted proxy to overwrite identity headers and treat the durable limiter as a best-effort perimeter; this does not close the direct Convex mutation.

**Owner activation attribution / funnel forgery: [P1]**
- Symptoms: `recordOwnerActivationEvent` (`convex/observability.ts:335-389`) is a public mutation with no owner authority (only a rate limit); stage, `businessId`, `consentFlag`, and `actorRef` are all caller-supplied and drive authoritative `ownerActivationState`, so milestone/failure events for another business are forgeable.
- Files: `convex/observability.ts:335-389`, `src/modules/observability/internal/funnel.ts:67-104`
- Workaround: Fields are schema-bounded and the mutation uses the durable `public-mutation` bucket, but this does not bind event attribution to a verified owner.
- Fix approach: Separate anonymous analytics from state-changing activation readback; accept only server-derived or signed event context; bind business/claim ownership; derive throttling identity from trusted transport identity.

## Security Considerations

**OAuth storage read boundary: [P1]**
- Risk: `getGrantByHash` and `getClient` are public Convex queries with no authenticated owner, source-read admission, or server identity check. They return grant/client metadata, redirect URIs, hashes, and optional delivery/key identifiers to any caller supplying a matching lookup value. The sibling `getGrantByRef` is gated via `requireOAuthSourceRead`.
- Files: `convex/customerRequestAgentOAuth.ts:93-104`, `convex/customerRequestAgentOAuth.ts:146-152`, `src/lib/server/customer-request-agent-oauth-store.ts:82-128`
- Current mitigation: Public grant writes and `getGrantByRef` require source-write/source-read arguments; token exchange uses hash lookups and the HTTP adapter controls the normal route.
- Recommendations: Move all OAuth storage reads behind internal functions or a verified server capability (as `getGrantByRef` already is); return only the minimum token-exchange result and add direct Convex foreign-caller tests.

**External-run evidence read boundary: [P1/P2]**
- Risk: `inspectManifest` and `readReport` are public Convex queries with no caller identity or possession proof. A holder or guesser of a `runId` can read provider declarations, attribution/consent records, evidence signals, and gate results.
- Files: `convex/externalRuns.ts:117-132`, `convex/externalRuns.ts:320-357`, `src/modules/external-run/internal/contract.ts:89-165`
- Current mitigation: Mutations require source-write admission and admin/operator authority; integrity digests detect tampering but do not provide confidentiality.
- Recommendations: Require an authenticated operator or signed report capability for private runs, separate public decision summaries from private evidence, and use high-entropy run references.

**Provider-owned credential reference selection: [P1]**
- Risk: Generic owner publication accepts a binding with an arbitrary `credentialRef`; transport admission accepts any `env:NAME`; runtime then resolves that deployment environment variable and sends it to the owner-selected HTTPS endpoint. [Inference] Any compromised or malicious business owner could use this as a secret-confusion or exfiltration path if platform-wide variables are in the same environment.
- Files: `convex/capabilitySupply.ts:638-683`, `src/modules/capability-supply/internal/transport-adapters.ts:87-110`, `src/modules/capability-supply/route-transport-runtime.ts:340-344`, `convex/customerRequestRouteTransportWorker.ts:100-110`
- Current mitigation: Owner authentication, HTTPS-only endpoint admission, static private-host checks, and runtime DNS guarding reduce unauthorized use and SSRF risk; the owner-supply funnel explicitly publishes `credentialRef: 'none'`; cluster B keyed publications use `env:*` credential refs.
- Recommendations: Use a managed credential namespace bound to an admitted provider/binding, prohibit arbitrary environment references on owner/provider paths, and separate provider credentials from platform/model secrets.

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

**Guarded non-null assertions in authority/data-validity paths (hardening): [P3]**
- The only non-null `!` assertions in hand-written code are control-flow-guarded (typecheck passes under strict mode): `src/modules/common/ed25519-attestation.ts:77-78`, `src/modules/action-invocation/application-service.ts:241`, `src/modules/capability-supply/internal/publication-importers.ts:210`, `src/modules/customer-request/legacy-v1.ts:382`, `src/modules/customer-request/route-execution/journal/export-evidence.ts:160`, `src/modules/action-invocation/durable.ts:253-254`, `src/components/ae/chat/turn-stream-session.ts:54-87`. None are bugs today; converting them to explicit flow-narrowing (throw on impossible null) would reduce the chance a future refactor turns a guarded invariant into a crash. All `as any`/`@ts-nocheck` live only in the generated `src/routeTree.gen.ts`.

## Performance Bottlenecks

**Route transport buffers oversized provider responses before rejecting them: [P2]**
- Problem: `readBoundedText` (`route-transport-runtime.ts:915-920`) checks `content-length`, then calls `response.text()` and checks encoded byte length afterward. Chunked responses without a trustworthy length header are fully materialized before the nominal 64 KiB ceiling is applied. Used at lines 361, 788, 896.
- Files: `src/modules/capability-supply/route-transport-runtime.ts:892-920`
- Improvement path: Read the response stream incrementally, cancel as soon as the byte ceiling is crossed, and use the same bounded-reader primitive as the readiness and webhook adapters.

**Readiness probes have the same post-buffering response check: [P2]**
- Problem: The readiness probe buffers `await response.text()` (`readiness-probe.ts:110`) then applies `MAX_RESPONSE_BYTES` (`:111`), so a provider can return a large chunked response and consume memory before the probe classifies it as too large.
- Files: `src/modules/capability-supply/internal/readiness-probe.ts:79-120`
- Improvement path: Reuse a streaming bounded reader and retain only the bounded prefix needed for schema validation.

**Registry search fallback hydration: [P2]**
- Problem: A public search reads up to 250 search documents, keeps up to 100 unique business slugs, then hydrates each business's offering supply concurrently and filters in memory.
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:297-307`
- Cause: Search-document matching and supply projection matching are separate stages without one indexed query covering the final public result.
- Improvement path: Maintain a searchable public Offering projection, push location/price predicates into indexes where possible, and expose fallback usage/latency before increasing caps.

**Inquiry persistence performs many row-level reads and writes after broad hydration: [P2]**
- Problem: `persistInquirySourceState` loops through each loaded bucket, thread, grant, message, notification, receipt, commitment, operation, audit, and funnel record and performs a lookup before each insert or patch.
- Files: `convex/inquirySourceStatePersist.ts:32-172`, `convex/inquirySourceStatePersist.ts:194-318`
- Cause: A domain-state adapter reconstructs a large aggregate for operations that are often a single-thread or single-target change.
- Improvement path: Use entity-scoped native patches for hot paths, retain aggregate reconstruction for bounded repair jobs, and add read/write counts to operational evidence.

## Fragile Areas

**Pseudonymous answer-thread bearer boundary: [P2]**
- Files: `convex/answerThreads.ts:381-465`, `convex/answerThreads.ts:531-621`, `src/modules/answer-thread/internal/session-cookie.ts:6-20`, `src/routes/api.answer.turn.ts:47-95`
- Why fragile: Public reads authorize by equality with a caller-supplied pseudonymous session string rather than by Convex identity. The normal HTTP route supplies an `httpOnly` random cookie, but a leaked session value is a bearer credential at the public function boundary.
- Safe modification: Keep the public redacted projection separate, bind raw reads to a server-issued assertion or authenticated identity, and preserve foreign-session denial at both route and direct-Convex seams.
- Test coverage: Route tests cover cookie/session behavior; direct-function tests should cover guessed thread IDs, leaked session values, pagination, and projection-vs-raw payload separation.

**Engine live-catalog selection reliability: [P1/P2]**
- Files: `src/modules/customer-request/application/interpret-compile/interpreter.ts`, `deterministic-interpreter.ts`, `capability-domain.ts`, `preview.ts`, `semantic-interpreter.ts:282,936-946`
- Why fragile: The interpreter chain (model → deterministic fallback → `recoverFromPool`) is the only thing standing between a registered capability and a usable preview. It is now well-guarded (domain guard prevents crypto↔fiat cross-selection; `needs_information` is reachable; deterministic recovery matches the same `searchTerms` vocabulary as discovery), but: `inputExamples` never reaches the model (`publicDescriptor` strips it), `planPreview` disables the retry loop (`finalAttempt: true`), the deterministic fallback caps at one selection, and any model output that is wrong-but-domain-valid survives as a false-positive selection.
- Safe modification: Change one guard/recovery branch at a time; keep the deterministic interpreter honest (never fabricate an unmatched selection); add per-branch tests for model-zero-selection, model-wrong-selection, provider-error, and ambiguous (needs_information) cases.
- Test coverage: Curated-admission and preview tests exist; add explicit regression cases for a model returning a wrong-but-domain-valid selection and for provider-error during preview with retries enabled.

**Curated catalog drift and idempotency: [P2]**
- Files: `convex/curatedProviders.ts` (seed + `retireStaleCuratedSupply` + `retireLegacyExaV1`), `src/modules/capability-supply/internal/publication/publish.ts:92`, `src/modules/capability-supply/curated-cluster-{a,b,c}-publications.ts`, `curated-provider-publications.ts`
- Why fragile: The canonical seed is now idempotent across its own source drift (retire-and-replace via `retireStaleCuratedSupply`), and the `contract_identity_conflict` guard at `publish.ts:92` remains intact and correct. But the cluster files are large, hand-maintained schema blobs with hardcoded evidence URLs and dated observation markers; retirement performs broad `ctx.db.delete` across many row families; and `devSeed.ts` hardcodes a production-site URL fallback in ~8 spots. Drift risk concentrates in these hand-authored blobs.
- Safe modification: Never weaken the identity guard; exercise the retire-and-replace path from a real drifted snapshot; keep seed fixtures' provenance dates source-consistent.
- Test coverage: Add a regression that re-runs the seed after a source-drift edit (e.g. enriched `searchTerms` or `inputExamples`) and asserts no `contract_identity_conflict` and a single current revision.

**External and persisted JSON boundaries: [P3]**
- Files: `src/modules/customer-request/internal/convex-v2-schema.ts:115-116`, `convex/customerRequestRouteExecution.ts:673-675`, `src/modules/capability-supply/route-transport-runtime.ts:892-920`
- Why fragile: Model output, persisted JSON, and external provider responses cross several parser/cast boundaries with different limits and error taxonomies.
- Safe modification: Preserve one bounded parser per boundary, record rejected digests/reasons without raw payloads, and do not widen generated validators to make a fixture pass.
- Test coverage: Unit fixtures cover normal and malformed model proposals; oversized chunked provider responses and persisted-schema drift need explicit regression cases.

**Large Convex host modules: [P2]**
- Files: `convex/catalog.ts` (~2,198), `convex/capabilitySupply.ts` (~2,034), `convex/customerRequestApplication.ts` (~1,919), `convex/discovery.ts` (~1,901), `convex/workTrees.ts` (~1,561)
- Why fragile: These files combine public schemas, authority checks, state reconstruction, durable writes, projection repair, and transport orchestration in ~1,500-2,200 lines each. Small edits can cross source/projection or auth/effect boundaries.
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
- Current capacity: The loader reads at most 100 rows per table for normal scopes, 200 for operator scope, and 20 for some sub-scopes — **with no truncation marker**, so partial state can look complete.
- Limit: `convex/inquirySourceStateLoad.ts:41-73`
- Scaling path: Scope every table by business/thread/owner, page append-only history, reserve full-table repair for scheduled bounded jobs, and emit an explicit "truncated" flag when a read hits a cap.

**External-run cohort and evidence: [P2]**
- Current capacity: A run admits 12 starts and 64 evidence rows per start, with a 768-row aggregate read cap.
- Limit: `convex/externalRuns.ts:24-26`, `convex/externalRuns.ts:182-185`, `convex/externalRuns.ts:232-235`, `convex/externalRuns.ts:289-295`
- Scaling path: Keep the gate bounded but use indexed counters/aggregates and explicit overflow state if cohorts or evidence classes grow; do not make a report look complete when a read is truncated.

**Provider earnings ledger readback: [P2]**
- Current capacity: `readProviderEarnings` sums only the newest 100 `moneyLedgerEntries` and returns no completeness marker.
- Limit: `convex/moneyLedger.ts:456-466`
- Scaling path: Use an indexed aggregate or paginated reconciliation and expose `complete`/`truncated` so a bounded sum is never presented as the full statement.

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

**Engine teaching surface and selection recovery: [High]**
- What's not tested: That `inputExamples` actually reaches the model payload; that preview retries on a transient provider error; that the deterministic fallback's one-selection cap / wrong-but-domain-valid model selections are handled consistently.
- Files: `src/modules/customer-request/application/interpret-compile/{interpreter,deterministic-interpreter,preview,interpret}.ts`, `src/modules/customer-request/semantic-interpreter.ts:282,936-946`
- Risk: A curated capability can stay registered yet produce wrong/empty previews (or a silently one-capability plan) without a failing suite.
- Priority: High

**Owner binding credential isolation: [High]**
- What's not tested: A provider-owned publication using a valid `env:*` credential reference, followed by readiness or route execution, and verification that only the intended managed credential is sent.
- Files: `convex/capabilitySupply.ts:638-683`, `src/modules/capability-supply/internal/transport-adapters.ts:87-110`, `src/modules/capability-supply/internal/readiness-probe.ts:125-141`, `tests/integration/capability-supply-registration.test.ts`
- Risk: A secret-confusion path can pass source-level validation while exposing deployment credentials to an admitted external endpoint.
- Priority: High

**Seed drift idempotency re-run: [High]**
- What's not tested: Re-running the canonical seed after a source-drift edit (enriched `searchTerms`/`inputExamples`, a capabilityId collision fix) on an already-populated deployment, asserting no `contract_identity_conflict` and a single current revision.
- Files: `convex/curatedProviders.ts`, `src/modules/capability-supply/internal/publication/publish.ts:92`, `src/modules/capability-supply/curated-cluster-{a,b,c}-publications.ts`
- Risk: A future curated edit reintroduces the drift conflict and the seed stops being rerunnable, undoing the retire-and-replace fix.
- Priority: High

**Inquiry overflow and scope completeness: [High]**
- What's not tested: More than 100 businesses, messages, operations, or audit rows with a target/thread operation that must see a row outside the first page.
- Files: `convex/inquirySourceStateLoad.ts:41-66`, `convex/inquirySourceStatePersist.ts:32-172`, `tests/unit`, `tests/integration`
- Risk: Truncated state can look like a legitimate empty/missing source and produce partial readbacks or writes without a failing typecheck (no truncation marker exists).
- Priority: High

**Search cursor, fallback overflow, and earnings truncation: [Medium]**
- What's not tested: A search page followed by its returned cursor, an unknown cursor, more than 250 search documents or 100 hydrated businesses, and more than 100 ledger rows in `readProviderEarnings`.
- Files: `convex/registry.ts:146-166`, `convex/registry.ts:297-338`, `convex/moneyLedger.ts:456-466`, `tests/integration`, `tests/unit`
- Risk: Agents can repeat listings, skip results, or read a partial catalogue/statement while the response reports a normal contract.
- Priority: Medium

**Projection-failure readback and oversized chunked responses: [Medium]**
- What's not tested: Catalog failure after source-status patches, a stale ambient projection followed by repair/replay, a chunked provider response with no content length that exceeds 64 KiB, and an oversized readiness response.
- Files: `convex/catalog.ts:522-623`, `convex/registry.ts:360-483`, `src/modules/capability-supply/route-transport-runtime.ts:892-920`, `src/modules/capability-supply/internal/readiness-probe.ts:79-120`, `tests/unit`, `tests/integration`
- Risk: Silent source/projection divergence or memory growth can evade source suites.
- Priority: Medium

**Hosted evidence boundary: [Medium]**
- What's not tested: The deployed Convex/HTTP/provider/customer journey represented by release scripts, as distinct from source and labelled-local fixtures.
- Files: `.planning/STATE.md:119-152`, `package.json:23-37`, `tests/deploy-smoke`
- Risk: Deployment-only origin, auth, provider, and browser failures remain undiscovered while local evidence is mistaken for production readiness.
- Priority: Medium

---

*Concerns audit: 2026-08-05*
