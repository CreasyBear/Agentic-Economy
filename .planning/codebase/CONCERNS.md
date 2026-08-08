# Codebase Concerns

**Analysis Date:** 2026-08-08

The concerns below are grounded in the current working tree. Source-level behavior is called out as such; no runtime latency, production traffic, or deployment-state claim is inferred where the tree does not provide one.

## Tech Debt

**Two operation-reference and execution authorities:**
- Issue: `src/modules/capability-supply/operation-projection.ts` and Convex readers expose hash-shaped `operation:v1:<sha>` references, while `src/modules/capability-execution/seed-supply.ts` derives `operation:v1:<capabilityId>` references and `src/modules/answer/internal/keyless-data-ask.ts` intentionally maps by `capabilityId` between the two.
- Why: The answer path added an offline curated-seed fallback before every deployment had a reachable Convex reader.
- Impact: A capability ID is not the canonical identity of one publication/version. A selected operation can be rebound to a different publication, and evidence or replay records can carry a reference that the public registry does not recognize.
- Fix approach: Use one hash-based operation reference end to end; make any no-Convex seed mode explicit and non-production, rather than accepting a readable capability-ID alias in execution.

**Generic model-facing execution tool remains beside strict per-operation tools:**
- Issue: `src/modules/answer/internal/answer-tool-use-agent.ts` builds strict tools from operation schemas but also exposes a generic `operation.execute` path whose input is a free-form record.
- Why: The generic action was retained as a routing/fallback seam while dynamic tools were introduced.
- Impact: The model can select an underspecified tool instead of a schema-bound operation; strict-provider tool-schema requirements are weakened, and the executor must recover an operation reference after selection.
- Fix approach: Deterministically choose a bounded registry endpoint candidate, load its authoritative descriptor, expose only a strict tool for that operation, and retain `executeOperation` as the host-side executor rather than a free-form model contract.

**Large authoritative module boundaries:**
- Issue: `src/modules/capability-contract/public.ts`, `src/modules/discovery/developer-discovery.ts`, and `src/modules/capability-supply/operation-projection.ts` concentrate public schemas, normalization/projection rules, search, and wire-shape logic in files of roughly 1,434, 1,498, and 1,095 lines respectively (source inventory, not a performance measurement).
- Why: Stable public contracts accumulated implementation detail while preserving import compatibility and byte-identity rules.
- Impact: Small schema or projection edits have a wide blast radius across Convex adapters, registry routes, answer tools, and tests; reviewers must reason about unrelated policies in the same file.
- Fix approach: Split internal walkers, validators, search ranking, and wire projections behind the existing public exports. Preserve canonical digest inputs and add contract tests before moving code.

## Known Bugs

**Seed fallback can execute an operation without current registry readiness:**
- Symptoms: The answer path can still construct a keyless tool from curated in-process seed data when the Convex descriptor list is empty/unavailable; that descriptor does not carry a live publication lifecycle/readiness decision.
- Trigger: A live-data ask reaches `matchKeylessDataAsk` in `src/modules/answer/internal/keyless-data-ask.ts`, while `listKeylessExecutableDescriptors` cannot return the deployed DB result and `src/modules/capability-execution/seed-supply.ts` has the same curated operation. A withdrawn, expired, or unavailable publication can therefore be represented by the static seed path.
- Workaround: Keep the deployed capability-supply reader available and synchronize the curated seed; do not treat the offline fallback as a production authority.
- Root cause: `src/modules/capability-execution/operation-execute.actions.ts` falls through to `seededDescriptorFor`, and the seed descriptor is derived from static imports rather than readiness/readiness-probe state.
- Blocked by: A clean deployment policy decision for whether offline execution is allowed at all; fail-closed production behavior should not depend on that fallback.

**Standard wrong methods can fall through machine-only routes:**
- Symptoms: A route that declares only one standard method can receive another standard method without the route itself returning the RFC 9457 405 response; TanStack Start may then render a document/SPA fallback instead of a machine error.
- Trigger: Send `GET` to the POST-only `src/routes/$slug.tools.$toolId.ts` or `src/routes/$slug.tools.$toolId.prepare.ts`, or send an unsupported standard method to single-method manifest routes such as `src/routes/$slug.ucp.ts`, `src/routes/SKILL[.]md.ts`, `src/routes/llms[.]txt.ts`, `src/routes/robots[.]txt.ts`, and `src/routes/sitemap[.]xml.ts`.
- Workaround: Use only the method declared by each route.
- Root cause: `src/lib/server/method-guard.ts` deliberately rejects only non-standard methods globally and states that routes must add explicit handlers for other standard methods; the listed route files do not register those handlers.

**Top-ranked lexical match can force an ambiguous live-data operation:**
- Symptoms: `matchKeylessDataAsk` returns the first keyless item from a top-ten search result and the answer agent can force an execution step even when several operations share a token or the query lacks enough input to identify one operation.
- Trigger: Submit an underspecified or cross-domain query whose tokens match multiple seeded operations; `src/modules/capability-supply/operation-projection.ts` allows a filter when any token matches, and `src/modules/answer/internal/keyless-data-ask.ts` accepts the first intersecting result without an ambiguity threshold.
- Workaround: Use an exact operation search/detail path and provide all required inputs; do not rely on a generic natural-language query for a cross-provider choice.
- Root cause: Relevance ranking is deterministic lexical discovery, not disambiguation or input sufficiency checking. The forced execution path is intentionally host-driven but currently lacks a distinct ambiguity refusal.

## Security Considerations

**Direct keyless executor has no DNS/IP egress guard:**
- Risk: A curated or database-supplied HTTPS hostname can resolve to a private, loopback, link-local, or cloud-metadata address. `src/modules/capability-execution/operation-execute.functions.ts` checks only URL syntax, `https:`, and empty userinfo before calling `fetch`; a malicious or compromised endpoint could turn the keyless executor into an SSRF primitive.
- Current mitigation: Admission checks in `src/modules/capability-supply/internal/transport-adapters.ts` reject statically private hostnames, and `src/modules/capability-supply/route-transport-runtime.ts` plus `src/modules/network-guard/public.ts` provide guarded lookup for the Customer Request transport. Those controls do not wrap the direct `executeOperation` fetch.
- Recommendations: Route every direct execution through the shared guarded lookup/allowlist implementation, reject private and metadata ranges after DNS resolution (including IPv4-mapped IPv6), and add tests for private DNS answers, redirects, credentials, and timeout behavior.

**Provider output crosses into model instructions:**
- Risk: Raw JSON returned by a keyless provider is serialized into the answer tool record and later incorporated into model context. A provider-controlled string can contain prompt-injection instructions, causing the model to misstate evidence or request an unrelated tool.
- Current mitigation: `src/modules/capability-execution/operation-execute.functions.ts` validates the output schema and bounds response bytes; `src/modules/answer/internal/answer-gate.ts` and `src/modules/answer/internal/copy-guard-patterns.ts` gate final prose against live evidence and known injection patterns.
- Recommendations: Keep provider data in a clearly delimited untrusted tool-result channel, constrain or sanitize free-text fields before prompt interpolation, preserve the evidence hash, and add adversarial output fixtures that attempt to override system/tool instructions.

## Performance Bottlenecks

**Registry operation search hydrates bounded records and related entities per query:**
- Problem: `src/modules/capability-supply/operation-projection.ts` searches a source list and projects business, offering, contract, and availability data; `src/modules/capability-supply/operation-source.ts` and Convex readers perform the corresponding multi-document reads.
- Measurement: Static bounds are `MAX_SOURCE = 256`, `MAX_QUERY = 200`, `MAX_CURSOR = 512`, and `MAX_SCHEMA_BYTES = 65_536` in `src/modules/capability-supply/operation-projection.ts`; no p95 latency measurement is checked into the current tree.
- Cause: The bounded read model still does per-operation projection work and cannot use a single materialized routeable-operation row for every search/detail request.
- Improvement path: Maintain a canonical indexed operation projection containing routeability, business, pricing, and schema summaries; hydrate full schemas only for a selected detail/execute operation and retain cursor pagination.

**Answer tool construction scales with the entire keyless catalog:**
- Problem: `src/modules/answer/internal/answer-tool-use-agent.ts` builds operation tools from the available keyless descriptor list, and `src/modules/capability-execution/operation-execute.actions.ts` can list up to 512 descriptors before tool construction.
- Measurement: The current source cap is `MAX_KEYLESS_EXECUTABLE = 512`; each descriptor can carry input schema bytes up to the operation projection schema bound. This is a static worst-case bound, not observed prompt latency.
- Cause: Candidate discovery and model-facing tool construction are not separated; schemas for operations unrelated to the current query can enter one toolset.
- Improvement path: Search/rank first, retain a small candidate set, load strict schemas only for selected candidates, and enforce a total tool/schema byte budget before model invocation.

## Fragile Areas

**Convex host/domain adapter seams:**
- Why fragile: `convex/capabilitySupplyOperations.ts`, `convex/catalog.ts`, `convex/customerRequestApplication.ts`, and `convex/moneyLedger.ts` bridge generated Convex validators and transactions to `src/modules/*` ports. A validator, identity, or operation-reference change must stay byte- and type-compatible across both layers.
- Common failures: A source module accepts a shape that its Convex validator rejects; a host wrapper reads a stale field/index; or a new operation reference is accepted by one route but not by registry/answer execution.
- Safe modification: Change the authoritative `src/modules/*` contract first, update the corresponding `convex/*` validator/port adapter and `convex/schema.ts` in the same change, then exercise the affected host function and route-level contract.
- Test coverage: There are extensive module and integration tests, but `tests/unit/server/method-guard.test.ts` tests only the helper and not the full generated route tree; direct Convex deployment/schema drift is not proven by unit tests alone.

**Answer evidence and tool-loop state machine:**
- Why fragile: `src/modules/answer/internal/answer-tool-use-agent.ts` coordinates model retries, forced execution, dynamic tool registration, accounting, and final prose; `src/modules/answer/internal/answer-gate.ts` separately enforces grounding.
- Common failures: Catalog-only prose is emitted for a live-data ask, a model-selected operation differs from the forced operation, a refusal/error is omitted from evidence, or a provider string is treated as trusted instruction.
- Safe modification: Preserve the recorded `operation.execute` result/refusal, keep operation selection deterministic before tool construction, and update answer-loop, gate, and SSE tests together.
- Test coverage: `tests/unit/answer/answer-tool-dynamic-ops.test.ts` and answer pipeline tests cover selected happy paths; ambiguous operation selection, provider prompt injection, and DB-unavailable seed fallback are not covered.

**Exact-money and catalog-price boundary:**
- Why fragile: Catalog decimal prices, account exponents, and charge authorization are represented by different contracts in `src/modules/registry/internal/services-api-projection.ts`, `src/modules/money/internal/exact-amount.ts`, and `src/modules/action-invocation/dynamic-published-adapter.ts`.
- Common failures: A sub-cent catalog value is displayed as available but cannot be charged, exponents are compared too early, or a price digest changes when a presentation-only field is added.
- Safe modification: Keep persisted charge amounts as scale-aware integer units, compare with the exact-amount helpers, and preserve the hashed execution price separately from additive catalog presentation fields.
- Test coverage: Projection tests cover representation and refusal paths; no current test proves a real sub-cent settlement through the durable money ledger and authoritative payment receipt.

## Scaling Limits

**Capability operation source and search bounds:**
- Current capacity: The operation source caps a query at 256 records, 200 query characters, 512 cursor entries, 32 plan items, and 65,536 bytes of schema in `src/modules/capability-supply/operation-projection.ts`.
- Limit: A catalog larger than the bounded source or schema budget cannot be searched/planned in one request; the implementation returns a typed unavailable/invalid result rather than scanning unbounded data.
- Symptoms at limit: Search or plan preview returns an unavailable/refused result, or a large operation schema is excluded even when its operation would otherwise match.
- Scaling path: Move discovery to an indexed/materialized projection, keep bounded cursors, and fetch full contract schemas only after operation selection.

**Registry document hydration bounds:**
- Current capacity: `convex/registry.ts` uses `SEARCH_DOCUMENT_CANDIDATE_LIMIT = 250` and `SEARCH_HYDRATION_BUSINESS_LIMIT = 100` for registry search.
- Limit: More matching documents/businesses than these caps are not hydrated into one response, even if the underlying search index contains them.
- Symptoms at limit: Results are incomplete or relevance is biased toward the first bounded candidate set; operators cannot distinguish an empty result from a truncated one unless the response metadata is inspected.
- Scaling path: Expose explicit truncation/cursor metadata and replace broad hydration with a typed indexed read model keyed by operation/business and query cursor.

## Dependencies at Risk

**`nitro-nightly` build adapter:**
- Risk: `package.json` aliases `nitro` to `nitro-nightly@^3.0.1-20260628-090458-3df69609`, while `vite.config.ts` imports the Nitro Vite plugin. A nightly dependency can introduce unreviewed route/build/runtime changes through semver-compatible updates.
- Impact: Vite/TanStack Start builds, server route generation, or deployment output can change independently of application source; method fallthrough and server-only imports may surface only at build/deploy time.
- Migration plan: Pin and validate a supported stable Nitro/TanStack-compatible release (or pin the exact nightly artifact with a documented reason), then run the repository’s release build gate before upgrading again.

## Missing Critical Features

**Fail-closed production policy for no-Convex keyless execution:**
- Problem: The seed-derived executor in `src/modules/capability-execution/seed-supply.ts` is intentionally able to build descriptors without Convex, but there is no visible environment-level policy in the execution seam that distinguishes local bootstrap from production authority.
- Current workaround: Rely on deployment availability and curated seed synchronization; `operation-execute.actions.ts` falls back to the seed descriptor.
- Blocks: A production operator cannot prove from an execution record whether the operation was selected from current DB publication/readiness state or static seed data.
- Implementation complexity: [INFERENCE] Medium; requires an explicit runtime mode, fail-closed production branch, and evidence metadata without changing the canonical operation contract.

**Executable exact sub-cent settlement:**
- Problem: The registry can represent decimal catalog prices, but `src/modules/action-invocation/dynamic-published-adapter.ts` requires the configured paid amount to match the executable fixed price currency and exponent before authorizing a charge; exact sub-cent settlement is not yet a supported money-ledger path.
- Current workaround: Mark the presentation as catalog-only/unpriced or refuse the published operation rather than silently round.
- Blocks: Providers cannot safely charge and reconcile an operation priced below the account’s current minor-unit exponent.
- Implementation complexity: [INFERENCE] High; requires a scale-aware persisted settlement amount, payment-provider token conversion, durable receipt reconciliation, and migration/backfill gates.

## Test Coverage Gaps

**Direct keyless HTTP egress safety:**
- What's not tested: `tests/unit/capability-execution/operation-execute.test.ts` tests non-HTTPS refusal, but no current test exercises DNS resolution to private/metadata ranges, IPv4-mapped IPv6, or redirect handling for the direct executor.
- Risk: A future endpoint-validation change can reintroduce SSRF without a failing test, and the current implementation can already bypass the guarded transport path.
- Priority: High
- Difficulty to test: Requires injecting a resolver/guarded fetch seam and asserting both network policy decisions and no-fetch behavior.

**Full route method matrix and API catch-all behavior:**
- What's not tested: `tests/unit/server/method-guard.test.ts` covers `unsupportedMethodResponse`/`methodNotAllowed`, not each file-based route’s wrong standard methods or the `/api/*` unknown-path response.
- Risk: A route can return HTML/SPA content or a legacy envelope for a wrong method/unknown API path while helper tests remain green.
- Priority: High
- Difficulty to test: Requires starting the TanStack server and probing every machine-only route with declared, wrong-standard, and non-standard methods.

**Answer ambiguity, injection, and degraded-authority paths:**
- What's not tested: No focused test combines an ambiguous lexical match, malicious provider output, and unavailable Convex descriptor source through the complete answer tool loop.
- Risk: The answer may claim a catalog result, select the wrong operation, or execute a static seed after lifecycle state is unavailable without a regression signal.
- Priority: High
- Difficulty to test: Requires deterministic model/fetch fixtures plus an explicit DB-reader failure/refusal seam and assertions over persisted tool evidence and final prose.

---

*Concerns audit: 2026-08-08*
*Update as issues are fixed or new ones discovered*
