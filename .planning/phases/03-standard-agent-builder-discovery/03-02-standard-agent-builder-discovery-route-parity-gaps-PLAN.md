---
phase: 03
plan: 02
type: gap_closure
gap_closure: true
wave: 2
depends_on:
  - 03-01
files_modified:
  - src/modules/discovery/public.ts
  - src/routes/developers.discovery.tsx
  - src/routes/api.discovery.schema.ts
  - src/routes/api.discovery.examples.ts
  - src/routes/api.discovery.fixtures.ts
  - tests/unit/discovery/developer-discovery-route.test.ts
  - tests/unit/discovery/developer-discovery-parity.test.ts
  - tests/unit/discovery/developer-discovery-telemetry.test.ts
  - tests/integration/developer-discovery.test.ts
  - tests/integration/discovery-route-parity.test.ts
  - tests/e2e/developer-discovery.spec.ts
autonomous: true
requirements: [P3-R2, P3-R3, P3-R8]
user_setup: []
must_haves:
  truths:
    - id: gap-1-public-api-parity
      statement: "P3-R2, D-01, D-02, D-08, and D-10 are true when /developers/discovery and /api/discovery/{schema,examples,fixtures} read actual durable /api/businesses list/search/detail route results, and focused integration tests compare generated artifacts to those route bodies."
      maps_gap: "Live public API parity is not wired."
    - id: gap-2-route-health-readback
      statement: "P3-R3, D-01, D-02, D-03, D-08, D-09, D-10, D-14, and D-15 are true when route health rows are produced from route execution/readback for /api/businesses, /api/businesses/search, /api/businesses/{slug}, /{slug}/ucp, /llms.txt, /sitemap.xml, and /robots.txt, including failure/stale/missing/schema-drift cases."
      maps_gap: "Route health is synthetic."
    - id: gap-3-current-route-smoke
      statement: "P3-R8, D-01, D-02, D-03, D-11, D-12, and D-13 are true when the browser/API smoke proves current route-derived facts, unsupported/degraded capability states, schema parity, and route/cache freshness without claiming deployed proof."
      maps_gap: "Smoke does not prove current public facts from actual public routes."
    - id: p2-public-boundary
      statement: "Phase 2 remains public-status-only per D-14 and D-15: Phase 3 may expose only state, publicReason, source, and lastVerifiedAt, and no private inquiry, owner, notification, provider, or admin fields."
      maps_gap: "Preserve Phase 2 boundary while closing route parity."
  artifacts:
    - path: src/modules/discovery/public.ts
      provides: "Route-derived developer discovery readback, artifact parity metadata, and privacy-safe route-health statuses."
    - path: src/routes/developers.discovery.tsx
      provides: "Developer discovery loader and UI readback backed by actual route execution."
    - path: src/routes/api.discovery.schema.ts
      provides: "Schema endpoint generated from durable public route snapshot."
    - path: src/routes/api.discovery.examples.ts
      provides: "Examples endpoint generated from durable public route snapshot."
    - path: src/routes/api.discovery.fixtures.ts
      provides: "Fixture bundle endpoint generated from durable public route snapshot and actual route health."
    - path: tests/integration/developer-discovery.test.ts
      provides: "Focused parity tests between Phase 3 artifacts and durable public route handlers."
    - path: tests/integration/discovery-route-parity.test.ts
      provides: "Route execution/readback coverage for public API, UCP, llms, sitemap, and robots route health."
    - path: tests/e2e/developer-discovery.spec.ts
      provides: "Builder/agent smoke proving current public facts and no deployed proof claims."
  key_links:
    - from: src/routes/api.discovery.schema.ts
      to: src/routes/api.businesses.ts
      via: "Calls handleDurableListBusinessesRequest or an adapter that executes the same handler and records response status/body."
      pattern: "handleDurableListBusinessesRequest"
    - from: src/routes/api.discovery.examples.ts
      to: src/routes/api.businesses.search.ts
      via: "Calls handleDurableSearchBusinessesRequest for current search examples and encoded/empty query readbacks."
      pattern: "handleDurableSearchBusinessesRequest"
    - from: src/routes/api.discovery.fixtures.ts
      to: src/routes/api.businesses.$slug.ts
      via: "Calls handleDurableBusinessDetailRequest for detail parity and withheld/missing slug readback."
      pattern: "handleDurableBusinessDetailRequest"
    - from: src/routes/developers.discovery.tsx
      to: src/modules/discovery/public.ts
      via: "Loader awaits route-derived readback rather than default fixture/source-state generation."
      pattern: "readDeveloperDiscoveryRoute"
---

<objective>
Close the Phase 3 verifier gaps by making the developer discovery page and discovery artifact endpoints derive their public facts, examples, parity status, and route health from actual public route execution instead of fixture/source-state defaults.

Purpose: Builders and agents can trust Phase 3 readbacks because the docs/schema/examples/fixtures are checked against the same durable public registry/discovery routes that external consumers call.

Output: Additive code and tests only. Do not rewrite the existing 03-01 plan. Do not update ROADMAP.md or STATE.md. Per sprint-commit policy, the executor must not stage, commit, or push.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
@.planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
@.planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
@.planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md
@.planning/phases/03-standard-agent-builder-discovery/03-01-SUMMARY.md
@.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md
@src/modules/discovery/public.ts
@src/routes/developers.discovery.tsx
@src/routes/api.discovery.schema.ts
@src/routes/api.discovery.examples.ts
@src/routes/api.discovery.fixtures.ts
@src/routes/api.businesses.ts
@src/routes/api.businesses.search.ts
@src/routes/api.businesses.$slug.ts
@src/routes/$slug.ucp.ts
@src/routes/llms[.]txt.ts
@src/routes/sitemap[.]xml.ts
@src/routes/robots[.]txt.ts
@tests/integration/developer-discovery.test.ts
@tests/integration/discovery-route-parity.test.ts
@tests/e2e/developer-discovery.spec.ts
</context>

<gap_context>
Verifier gaps to close:
- P3-R2 failed because Phase 3 artifacts default to createDefaultDiscoverySourceState while /api/businesses* uses the durable public registry client.
- P3-R3 failed because route health rows are static route names plus freshness, not route execution/readback.
- P3-R8 failed because smoke proves negative constraints but not current public facts from actual public routes, and no deployed Phase 3 proof exists.

Preserve boundaries:
- P2 public status fields are only state, publicReason, source, and lastVerifiedAt.
- Do not introduce private inquiry fields, owner replies, claimant contact, owner notes, notification payloads, provider payloads, admin evidence, mutation, invocation, protected-action, payment, SDK, CLI, plugin, hosted-agent, marketplace, or API-key authority.
- Do not claim deployed proof. Local and integration proof may pass; deployed evidence can be recorded only after a real deployed route/readback smoke exists outside this plan.
</gap_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wire Phase 3 artifacts to durable public route snapshots</name>
  <files>src/modules/discovery/public.ts, src/routes/developers.discovery.tsx, src/routes/api.discovery.schema.ts, src/routes/api.discovery.examples.ts, src/routes/api.discovery.fixtures.ts, tests/unit/discovery/developer-discovery-route.test.ts, tests/unit/discovery/developer-discovery-parity.test.ts, tests/integration/developer-discovery.test.ts</files>
  <behavior>
    - Generated schema/examples/fixtures use current /api/businesses list/search/detail route response bodies for public facts, examples, empty cases, pagination, status variants, nullability, and withheld/drift states.
    - The /developers/discovery loader and /api/discovery/* handlers no longer rely on default fixture/source-state generation when no test state is injected.
    - Phase 2 readback remains limited to state, publicReason, source, and lastVerifiedAt.
  </behavior>
  <action>
    Add a route-snapshot contract in src/modules/discovery/public.ts that can represent public list, search, detail, missing detail, and artifact parity readbacks without importing route files into the module. Extend readDeveloperDiscoveryRoute, generateDeveloperDiscoverySchema, generateDeveloperDiscoveryExamples, and generateDeveloperDiscoveryFixtureBundle so callers can pass this snapshot and the artifacts derive examples/publicFacts/parity from those route bodies. Preserve the existing source-state overloads only for unit fixtures and explicit tests; route handlers must use the route snapshot path per D-01, D-02, D-08, D-09, and D-10.

    In src/routes/developers.discovery.tsx and the three src/routes/api.discovery.* handlers, make the loader/handlers async and build the route snapshot by executing the same public handlers that external consumers call: handleDurableListBusinessesRequest, handleDurableSearchBusinessesRequest, and handleDurableBusinessDetailRequest. Use the request origin for canonical URLs and select the first returned public slug for detail/UCP examples; if the list is empty, preserve an explicit empty example and unavailable/degraded parity reason rather than manufacturing fixture facts. Keep test-only injection seams available so focused tests can install setPublicRegistryQueryClientForTests data and assert non-default durable business facts.

    Preserve the Phase 2 boundary exactly: generated artifacts and readbacks may include only state, publicReason, source, and lastVerifiedAt. Add tests that fail if inquiryBody, ownerReply, claimantContact, ownerNotes, notificationPayload, providerPayload, adminEvidence, ownerId, clerk, sourceHash, rawContact, callable true, paymentRequired true, mutation true, payment true, protectedAction true, providerOperation true, or requestMarket true appears in serialized artifacts.
  </action>
  <verify>
    <automated>npm run test:unit -- tests/unit/discovery/developer-discovery-route.test.ts tests/unit/discovery/developer-discovery-parity.test.ts</automated>
    <automated>npm run test:integration -- tests/integration/developer-discovery.test.ts</automated>
  </verify>
  <done>Schema/examples/fixtures and the page loader prove parity with durable /api/businesses list/search/detail route bodies, including empty, encoded, drift, and withheld cases; fixture/default source-state generation is not the default runtime path for Phase 3 artifacts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Replace synthetic route health with actual route execution/readback</name>
  <files>src/modules/discovery/public.ts, src/routes/developers.discovery.tsx, src/routes/api.discovery.fixtures.ts, tests/unit/discovery/developer-discovery-telemetry.test.ts, tests/integration/discovery-route-parity.test.ts, tests/integration/developer-discovery.test.ts</files>
  <behavior>
    - Route health rows are based on executed route outcomes, not static names plus global freshness.
    - Health readback distinguishes healthy, stale, 404/missing, route outage, schema mismatch, unavailable, and withheld states.
    - The fixture bundle includes the executed route-health evidence used by the page.
  </behavior>
  <action>
    Extend DeveloperDiscoveryRouteHealth in src/modules/discovery/public.ts with route execution evidence: route, label, status, freshness, reason, httpStatus, checkedAt, cacheControl when present, schemaVersion when present, and a public errorCode for not_found, route_outage, stale, schema_version_mismatch, unavailable, or withheld. Add a pure mapper that converts executed route results into these rows and maps successful/cached/stale/invalid/not_found/route_outage/schema_version_mismatch to existing telemetry/operator states per D-03, D-14, and D-15.

    In the route-layer snapshot builder, execute/read back /api/businesses, /api/businesses/search, /api/businesses/{slug}, /{slug}/ucp, /llms.txt, /sitemap.xml, and /robots.txt. For /api/businesses/{slug} and /{slug}/ucp, use the first public slug from the list response; when no slug exists, record missing/unavailable health rather than substituting a fixture slug. Treat non-2xx responses, thrown route handlers, missing schemaVersion, mismatched schemaVersion, stale/degraded artifacts, and 404s as explicit health states with safe public reasons.

    Update /developers/discovery and /api/discovery/fixtures rendering/serialization to display the executed route-health rows. Keep business-origin UCP unavailable unless merchant-origin readback proves it per D-11; keep OpenAPI/MCP/API-key/SDK/CLI/plugin/platform exclusions unchanged per D-04, D-05, D-06, D-07, D-12, and D-13.
  </action>
  <verify>
    <automated>npm run test:unit -- tests/unit/discovery/developer-discovery-telemetry.test.ts tests/unit/discovery/developer-discovery-route.test.ts</automated>
    <automated>npm run test:integration -- tests/integration/discovery-route-parity.test.ts tests/integration/developer-discovery.test.ts</automated>
  </verify>
  <done>Route health changes when a public route succeeds, returns 404, is missing, throws, is stale/degraded, or returns schema drift; fixture bundle and page readback expose those actual route outcomes without private fields or authority claims.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Expand builder/agent smoke and closeout gates without deployed-proof claims</name>
  <files>tests/e2e/developer-discovery.spec.ts, tests/integration/developer-discovery.test.ts, tests/integration/discovery-route-parity.test.ts, src/routes/developers.discovery.tsx, src/modules/discovery/public.ts</files>
  <behavior>
    - Browser/API smoke proves current public facts from actual public routes and checks discovery artifacts against route-derived bodies.
    - Smoke proves unsupported/degraded capabilities, schema parity, route/cache freshness, and no future authority/private-field leakage.
    - The implementation does not create or claim deployed Phase 3 proof.
  </behavior>
  <action>
    Expand tests/e2e/developer-discovery.spec.ts so the request smoke fetches /api/businesses, /api/businesses/search, /api/businesses/{slug}, /api/discovery/schema, /api/discovery/examples, and /api/discovery/fixtures in one run, then asserts the same public slug/name/schemaVersion/pagination or explicit empty/unavailable reason appears across public routes and Phase 3 artifacts. The page smoke must assert visible route-health statuses, freshness/cache/schema labels, unsupported/degraded capability reasons, and P2 public status fields only.

    Expand integration tests to assert durable non-default route facts flow through Phase 3 artifacts by installing setPublicRegistryQueryClientForTests with a non-default published business and comparing generated artifacts to handleDurableListBusinessesRequest, handleDurableSearchBusinessesRequest, and handleDurableBusinessDetailRequest. Include encoded query/search, empty list/search, missing detail, stale/degraded route health, schema drift, and withheld artifact cases. Keep deployed proof out of assertions and closeout wording; tests may say local route smoke or route-handler smoke, but must not state deployed proof exists.

    Run focused gates first, then relevant full gates. If check:convex-codegen requires network or Playwright needs a local dev server permission, request approval during execution and record the actual result. Do not stage, commit, push, update ROADMAP.md, update STATE.md, or create deployed evidence artifacts as part of this gap plan.
  </action>
  <verify>
    <automated>npm run test:integration -- tests/integration/developer-discovery.test.ts tests/integration/discovery-route-parity.test.ts tests/integration/registry-api.test.ts</automated>
    <automated>npm run test:e2e -- tests/e2e/developer-discovery.spec.ts --project=compact-chromium</automated>
    <automated>npm run typecheck</automated>
    <automated>npm run test:unit -- tests/unit/discovery</automated>
    <automated>npm run test:seo -- tests/seo/developer-discovery.test.ts tests/seo/discovery-files.test.ts</automated>
    <automated>npm run test:copy</automated>
    <automated>npm run test:source-mining</automated>
    <automated>npm run test:ts-standards</automated>
    <automated>npm run test:ui-contract</automated>
    <automated>npm run test:integration</automated>
    <automated>npm run test:e2e -- tests/e2e/developer-discovery.spec.ts</automated>
    <automated>npm run build</automated>
    <automated>npm run check:convex-codegen</automated>
  </verify>
  <done>Builder/agent smoke proves current route-derived public facts, schema/example parity, route/cache/freshness readback, unsupported/degraded states, and no private/future authority leakage; no deployed Phase 3 proof is claimed unless a separate real deployed route/readback smoke is run and recorded later.</done>
</task>

</tasks>

<source_audit>
| SOURCE | ID | Feature/Requirement | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | phase-03 | Builders and agents discover current public facts, schema shape, freshness, and unsupported capabilities through read-only docs/schemas/readbacks. | 03-02 | COVERED | Tasks 1-3 close route-derived parity and smoke gaps. |
| REQ | P3-R2 | Docs, schemas, examples, fixtures, live API responses, UCP/llms references, and optional projections share public catalog DTO or documented subsets. | 03-02 | COVERED | Task 1 wires artifacts to durable public route snapshots. |
| REQ | P3-R3 | Developer/agent readback shows real route health, schema version, cache freshness, blockers, unsupported capabilities, examples, and operational readbacks. | 03-02 | COVERED | Task 2 replaces synthetic route health with route execution. |
| REQ | P3-R8 | Builder/agent smoke proves current public facts, unsupported/degraded capabilities, schema parity, route/cache readback, and no platform bloat. | 03-02 | COVERED | Task 3 expands integration/E2E smoke and keeps deployed proof unclaimed. |
| CONTEXT | D-01 | Completed Phase 3 means deployed, route-tested, schema-parity-checked discovery surface, not drifting docs. | 03-02 | COVERED | Route-tested/schema-parity local closure; deployed proof remains unclaimed until real deployed smoke exists. |
| CONTEXT | D-02 | Every advertised URL/path/schema/example resolves in local/integration/deploy smoke or is omitted. | 03-02 | COVERED | Tasks 1-3 execute public routes and withhold on failures. |
| CONTEXT | D-03 | Builders determine current public facts, freshness, unsupported capability, and next action without private conversation. | 03-02 | COVERED | Tasks 2-3 expose route health and smoke visible current facts. |
| CONTEXT | D-04 | Source-owned support matrix controls candidate surfaces. | 03-02 | COVERED | Task 2 preserves existing support matrix while changing health evidence. |
| CONTEXT | D-05 | Matrix rows carry evidence, owner, route/readback status, blocker, and next action. | 03-02 | COVERED | Task 2 keeps rows evidence-backed by executed route health. |
| CONTEXT | D-06 | OpenAPI read projection ships only if useful and route parity passes; MCP only if it adds real read-only value. | 03-02 | COVERED | Task 2 preserves projection gates and does not add projection authority. |
| CONTEXT | D-07 | API keys ship only if production quotas, abuse posture, or private developer readbacks require authenticated reads. | 03-02 | COVERED | Task 2/3 keep API keys unavailable in base Phase 3. |
| CONTEXT | D-08 | Public catalog DTO or documented subsets are the single schema source. | 03-02 | COVERED | Task 1 compares artifacts to durable public route DTO bodies. |
| CONTEXT | D-09 | No Agent Router, second registry, or readiness model forks catalog fields/statuses. | 03-02 | COVERED | Task 1 adds a route snapshot, not a second registry model. |
| CONTEXT | D-10 | Docs/projections are withheld when route/schema parity fails. | 03-02 | COVERED | Tasks 1-2 add drift and withheld states. |
| CONTEXT | D-11 | Business-origin UCP remains unavailable unless merchant-origin route/readback proves it. | 03-02 | COVERED | Task 2 preserves unavailable business-origin UCP state. |
| CONTEXT | D-12 | OpenAPI/MCP artifacts are read-only list/search/detail with non-authority metadata. | 03-02 | COVERED | Task 3 smoke rejects mutation/action/payment descriptors. |
| CONTEXT | D-13 | SDK, CLI, plugin, hosted MCP/BYO proxy, streamable transport, developer gallery, and devrel launch stay excluded until measured demand and route-tested capability justify them. | 03-02 | COVERED | Task 2 preserves gated exclusions; Task 3 scans for bloat. |
| CONTEXT | D-14 | Discovery telemetry may record only route/status/schema/cache/freshness/error/bot/public IDs. | 03-02 | COVERED | Task 2 maps route execution to privacy-safe health/telemetry fields. |
| CONTEXT | D-15 | Private owner/contact/inquiry/admin/provider evidence never enters artifacts/logs/telemetry/examples. | 03-02 | COVERED | Tasks 1-3 include private-field negative assertions. |
| VERIFICATION | gap-1 | Live public API parity is not wired. | 03-02 | COVERED | Task 1 direct closure. |
| VERIFICATION | gap-2 | Route health is synthetic. | 03-02 | COVERED | Task 2 direct closure. |
| VERIFICATION | gap-3 | Smoke does not prove current public facts from actual public routes; no deployed proof should be claimed. | 03-02 | COVERED | Task 3 direct closure. |
</source_audit>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| public HTTP client -> discovery routes | Untrusted users and bots call /developers/discovery and /api/discovery/* endpoints. |
| discovery routes -> public business/discovery route handlers | Phase 3 route snapshot executes public route handlers and consumes their status/body as evidence. |
| public route body -> generated artifacts/UI | Route bodies become examples, schema parity evidence, route health, and visible readback. |
| Phase 2 public status -> Phase 3 readback | Only the public P2 status contract crosses into Phase 3. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03-02-01 | Tampering | Route snapshot builder | high | mitigate | Execute durable route handlers and withhold artifacts on non-2xx, schema mismatch, drift, or missing public slug rather than trusting fixture/default state. |
| T-03-02-02 | Information Disclosure | Generated artifacts and route health | high | mitigate | Preserve allowlisted public DTO fields and negative tests for private P2/admin/provider identifiers per D-15. |
| T-03-02-03 | Spoofing | Deployed proof wording | medium | mitigate | Tests and closeout wording must not claim deployed Phase 3 proof without a real DEPLOY_BASE_URL route/readback smoke artifact. |
| T-03-02-04 | Denial of Service | Route health execution | medium | mitigate | Focused route-health execution is read-only and bounded to named public routes; record route_outage/unavailable states instead of retry loops. |
| T-03-02-05 | Elevation of Privilege | Optional surfaces/API keys | high | mitigate | Preserve unavailable/gated exclusions for API keys, MCP/OpenAPI mutation, SDK/CLI/plugin, payment, protected action, and invocation surfaces. |
| T-03-02-SC | Tampering | npm installs | high | accept | This plan adds no package installs; if executor attempts package-manager installs, stop and run the package legitimacy gate first. |
</threat_model>

<verification>
Focused closure checks:
- npm run test:unit -- tests/unit/discovery/developer-discovery-route.test.ts tests/unit/discovery/developer-discovery-parity.test.ts tests/unit/discovery/developer-discovery-telemetry.test.ts
- npm run test:integration -- tests/integration/developer-discovery.test.ts tests/integration/discovery-route-parity.test.ts tests/integration/registry-api.test.ts
- npm run test:e2e -- tests/e2e/developer-discovery.spec.ts --project=compact-chromium

Relevant full gates:
- npm run typecheck
- npm run test:unit -- tests/unit/discovery
- npm run test:integration
- npm run test:seo -- tests/seo/developer-discovery.test.ts tests/seo/discovery-files.test.ts
- npm run test:copy
- npm run test:source-mining
- npm run test:ts-standards
- npm run test:ui-contract
- npm run test:e2e -- tests/e2e/developer-discovery.spec.ts
- npm run build
- npm run check:convex-codegen
</verification>

<success_criteria>
The verifier gaps are closed when Phase 3 artifacts and page readback use durable public route execution by default, route health is based on actual route outcomes, focused tests compare artifacts to /api/businesses list/search/detail route bodies, E2E proves current route-derived public facts and unsupported/degraded states, P2 private fields remain absent, and no deployed Phase 3 proof is claimed without a separate deployed smoke.
</success_criteria>

<output>
Create `.planning/phases/03-standard-agent-builder-discovery/03-02-SUMMARY.md` when done. Do not stage, commit, push, or update `.planning/ROADMAP.md` or `.planning/STATE.md` while executing this gap-closure plan.
</output>
