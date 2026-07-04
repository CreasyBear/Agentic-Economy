---
phase: 03
plan: 01
type: execution
slug: standard-agent-builder-discovery-production
status: ready_after_phase_1_public_truth_and_phase_2_status_contract
wave: 01
autonomous: true
depends_on:
  - .planning/phases/01-ten-star-spine-foundation/01-09-deploy-readback-closeout-PLAN.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
  - .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
  - .planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
  - .planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
  - .planning/AI-SPEC.md
  - .planning/SEO-AEO-SPEC.md
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
requirements: [R1, R2, R3, R4, R5, R6, R7, R8]
p2_dependency:
  execution_gate: "Before Phase 3 route/docs work, verify Phase 2 has a closeout summary or record an explicit public P2 inquiry-availability unavailable status contract."
  required_public_status_fields: [state, publicReason, source, lastVerifiedAt]
  allowed_states: [available, unavailable, degraded, not_shipped]
  prohibited_fields: [inquiryBody, ownerReply, claimantContact, ownerNotes, notificationPayload, providerPayload, adminEvidence]
files_modified:
  - src/modules/discovery/public.ts
  - src/modules/discovery/internal/schema.ts
  - src/modules/discovery/internal/developer-discovery.ts
  - src/modules/discovery/internal/developer-discovery-artifacts.ts
  - src/modules/discovery/internal/developer-discovery-telemetry.ts
  - src/modules/observability/public.ts
  - src/modules/observability/internal/schema.ts
  - src/modules/observability/internal/funnel.ts
  - src/lib/ui/contract-scans.ts
  - tests/imports/scan-targets.ts
  - tests/copy/phase1-banned-copy.test.ts
  - tests/copy/claims-register.test.ts
  - tests/fixtures/bad-copy/protocol-claims.fixture
  - tests/ui-contract/class-scan.test.ts
  - tests/unit/discovery/developer-discovery-support-matrix.test.ts
  - tests/unit/discovery/developer-discovery-parity.test.ts
  - tests/unit/discovery/developer-discovery-telemetry.test.ts
  - tests/unit/discovery/developer-discovery-kill-rules.test.ts
  - tests/integration/developer-discovery.test.ts
  - tests/e2e/developer-discovery.spec.ts
  - tests/e2e/a11y/developer-discovery-a11y.spec.ts
  - tests/seo/developer-discovery.test.ts
  - tests/types/domain-contracts.test.ts
  - src/routes/developers.discovery.tsx
  - src/routes/api.discovery.schema.ts
  - src/routes/api.discovery.examples.ts
  - src/routes/api.discovery.fixtures.ts
must_haves:
  truths:
    - statement: P3 ships read-only developer and agent discovery over existing public catalog facts only.
      status: resolved
      verification: Objective, execution gate, and P3-01 through P3-07 keep P3 tied to Phase 1 and P2 public status contracts.
    - statement: Discovery support matrix rows are limited to shipped/degraded base discovery surfaces until projection gates accept source-owned evidence.
      status: resolved
      verification: P3-02 and 03-UI-SPEC keep API keys, SDK, CLI, plugin, hosted MCP, Agent Router, payment, and protected-action rows out of shipped matrix rows.
    - statement: P3 telemetry is privacy-safe and API-key events remain conditional until the API-key gate accepts evidence.
      status: resolved
      verification: P3-06 and GTM-READINESS distinguish base discovery fetch events from conditional API-key events.
  prohibitions:
    - statement: P3 must not add AI runtime, payment, protected-action, booking, provider, request-market, mutation, API-key authority, or platform-launch authority.
      status: resolved
      verification: Non-goals, support matrix exclusions, and copy/source scans reject unsupported capability claims.
  artifacts:
    - path: src/modules/discovery/public.ts
      provides: Public discovery module for generated docs/schema/examples/readback.
    - path: .planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
      provides: P3 route and support-matrix UI contract that this plan executes.
  key_links:
    - from: .planning/GTM-READINESS.md
      to: developer_docs_viewed
      via: P3 base telemetry uses GTM canonical discovery event names.
    - from: .planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
      to: API keys, SDK, CLI
      via: P3 UI spec keeps future platform rows out of the shipped matrix by default.
    - from: .planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md
      to: evaluateDiscoveryProjectionGate
      via: P3 projection rows require source-owned gate acceptance.
---

# Phase 3 Plan — Standard Agent/Builder Discovery Production Slice

## Objective

Ship truthful read-only builder/agent discovery over Phase 1 public catalog routes and Phase 2 public inquiry availability status: generated docs, schemas, examples, fixtures, support/readback, freshness, and explicit unsupported/degraded states. Phase 3 helps builders understand current public facts without creating invocation, payment, protected-action, inquiry mutation, marketplace, SDK/CLI/plugin, Agent Router, or developer-platform authority.

## Execution rules

- This plan is a docs-only execution prompt. Do not paste full implementation code into the plan or hand-author protocol truth beside route-tested source truth.
- Phase 3 starts after Phase 1 public catalog/search/detail/UCP/llms/sitemap outputs are real and after the P2 dependency gate in frontmatter is satisfied.
- P3 may read only the public P2 inquiry availability status fields named in frontmatter. It must never read private inquiry messages, owner replies, claimant contact, owner notes, notification payloads, provider payloads, or admin evidence.
- The minimal support matrix is the product boundary: current public JSON/UCP/llms/schema/examples/route-health outputs plus an accepted read-only OpenAPI/MCP projection if it passes the gate. API keys, SDK, CLI, plugin, hosted MCP/BYO proxy, Agent Router, payment descriptors, and protected-action descriptors stay out of the base matrix and appear only as gated exclusions/negative-scan cases unless a later decision proves demand.
- API-key telemetry events are conditional. `api_key_created` and `api_key_revoked` are not base Phase 3 proof; they exist only if a separate accepted read-only API-key decision ships keys.

## Artifacts this phase produces

Source files and routes:

- `src/modules/discovery/internal/developer-discovery.ts`
- `src/modules/discovery/internal/developer-discovery-artifacts.ts`
- `src/modules/discovery/internal/developer-discovery-telemetry.ts`
- Extensions to `src/modules/discovery/public.ts` and `src/modules/discovery/internal/schema.ts`
- Extensions to `src/modules/observability/public.ts`, `src/modules/observability/internal/schema.ts`, and `src/modules/observability/internal/funnel.ts`
- `/developers/discovery`
- `/api/discovery/schema`
- `/api/discovery/examples`
- `/api/discovery/fixtures`
- Optional `/api/discovery/openapi.json` only if `evaluateDiscoveryProjectionGate("openapi_read_projection")` accepts it.
- Optional `/api/discovery/mcp.json` only if `evaluateDiscoveryProjectionGate("mcp_read_projection")` accepts it.

New public/internal identifiers:

- `DiscoverySupportSurfaceValues`
- `DiscoverySupportStateValues`
- `DeveloperDiscoveryArtifactKindValues`
- `DeveloperDiscoveryFetchStatusValues`
- `DeveloperDiscoveryFreshnessValues`
- `P2InquiryAvailabilityPublicStatus`
- `DiscoverySupportMatrixRow`
- `DeveloperDiscoveryRouteHealth`
- `DeveloperDiscoveryArtifactMetadata`
- `DeveloperDiscoveryFreshness`
- `DeveloperDiscoveryFetchEvent`
- `DeveloperDiscoveryProjectionGate`
- `readDeveloperDiscoverySupportMatrix`
- `readP2InquiryAvailabilityPublicStatus`
- `generateDeveloperDiscoverySchema`
- `generateDeveloperDiscoveryExamples`
- `generateDeveloperDiscoveryFixtureBundle`
- `readDeveloperDiscoveryRouteHealth`
- `readDeveloperDiscoveryFreshness`
- `recordDeveloperDiscoveryFetch`
- `evaluateDiscoveryProjectionGate`
- `withholdDeveloperDiscoveryArtifact`
- Optional `generateOpenApiReadProjection` only after the OpenAPI read-projection gate accepts.
- Optional `generateMcpReadProjection` only after the MCP read-projection gate accepts.

New or extended test/scan artifacts:

- `tests/unit/discovery/developer-discovery-support-matrix.test.ts`
- `tests/unit/discovery/developer-discovery-parity.test.ts`
- `tests/unit/discovery/developer-discovery-telemetry.test.ts`
- `tests/integration/developer-discovery.test.ts`
- `tests/e2e/developer-discovery.spec.ts`
- `tests/e2e/a11y/developer-discovery-a11y.spec.ts`
- `tests/seo/developer-discovery.test.ts`
- `tests/fixtures/bad-copy/protocol-claims.fixture`
- `src/lib/ui/contract-scans.ts` protocol-claim rules for `.well-known`, merchant-origin UCP, MCP tool, OpenAPI service/action descriptor, action endpoint, payment handler, callable/tool-call, and agent-callable claims.

  <task id="P3-01" title="Gate Phase 3 on Phase 1 public truth and public P2 status only">
    <name>Gate Phase 3 on Phase 1 public truth and public P2 status only</name>
    <read_first>
      .planning/phases/01-ten-star-spine-foundation/01-09-deploy-readback-closeout-PLAN.md
      .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md
      .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
      .planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
      .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
      src/modules/catalog/public.ts
      src/modules/discovery/public.ts
    </read_first>
    <files>
      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>
    </files>
    <action>
      Add the Phase 3 execution gate in source and tests before route work: `readP2InquiryAvailabilityPublicStatus` may expose only `state`, `publicReason`, `source`, and `lastVerifiedAt` with states `available`, `unavailable`, `degraded`, and `not_shipped`. If Phase 2 closeout is absent, record `not_shipped` or `unavailable` from an explicit source-owned status contract instead of reading private P2 tables. Do not reference `inquiryBody`, `ownerReply`, `claimantContact`, `ownerNotes`, `notificationPayload`, `providerPayload`, or `adminEvidence` in any Phase 3 docs, fixtures, telemetry, route props, or generated artifact.
    </action>
    <acceptance_criteria>
      - Phase 3 source has a single public P2 status adapter named `readP2InquiryAvailabilityPublicStatus`.
      - Unit tests prove `available`, `unavailable`, `degraded`, and `not_shipped` statuses render as public readback states.
      - Redaction tests fail if any prohibited P2 private field name appears in generated docs, examples, fixtures, telemetry, copied text, route props, or logs.
      - P3 route/docs work stops or renders P2 as unavailable when neither P2 closeout nor an explicit P2-unavailable status contract exists.
    </acceptance_criteria>
    <verify>
      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>
    </verify>
    <done>
      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>
    </done>
  </task>

  <task id="P3-02" title="Create the minimal support matrix and gated exclusions">

    <name>Create the minimal support matrix and gated exclusions</name>
    <read_first>
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
      .planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
      .planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
      .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
      src/modules/discovery/public.ts
      src/modules/discovery/internal/schema.ts
      src/modules/catalog/public.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Implement a source-owned support matrix with `DiscoverySupportSurfaceValues` limited to base shipped/degraded surfaces: `public_json_routes`, `ae_hosted_ucp_fallback`, `llms_txt`, `sitemap`, `robots`, `schema_examples`, and `route_health`. Allow `openapi_read_projection` and `mcp_read_projection` only when `evaluateDiscoveryProjectionGate` accepts them. Keep `api_keys`, `sdk`, `cli`, `plugin`, `hosted_mcp_byo_proxy`, `agent_router`, `developer_gallery`, `payment_descriptors`, and `protected_action_descriptors` out of shipped base rows; list them only in non-goals, gated-exclusion readback, and negative scan fixtures unless `evaluateDiscoveryProjectionGate` accepts source-owned route evidence for that projection. Each live matrix row must carry `state`, `evidence`, `owner`, `routeReadbackStatus`, `blocker`, and `nextAction`.
    </action>
    <acceptance_criteria>
      - Support matrix output contains base rows for public JSON routes, AE-hosted UCP fallback, llms.txt, sitemap, robots, schema/examples, and route health.
      - OpenAPI/MCP rows appear only after `evaluateDiscoveryProjectionGate` returns accepted for that projection.
      - API keys, SDK, CLI, plugin, hosted MCP/BYO proxy, Agent Router, developer gallery, payment descriptors, and protected-action descriptors are represented as unavailable/deferred gated exclusions, not as shipped support rows.
      - Tests prove every live support row has `state`, `evidence`, `owner`, `routeReadbackStatus`, `blocker`, and `nextAction`.
      - This explicitly closes M4 by removing first-class platform rows from the production support matrix.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P3-03" title="Generate schema, examples, and fixtures from public DTO parity">

    <name>Generate schema, examples, and fixtures from public DTO parity</name>
    <read_first>
      src/modules/catalog/public.ts
      src/modules/discovery/public.ts
      src/modules/discovery/internal/schema.ts
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
      .planning/AI-SPEC.md
      .planning/SEO-AEO-SPEC.md
      tests/unit/catalog/public-catalog-dto.test.ts
      tests/types/domain-contracts.test.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add `generateDeveloperDiscoverySchema`, `generateDeveloperDiscoveryExamples`, and `generateDeveloperDiscoveryFixtureBundle` as projections over `PublicCatalogContract`, `PublicServiceContract`, and documented derived subsets from `src/modules/catalog/public.ts`. Add schema version, cache version, generated timestamp, freshness, source route, and parity status metadata. `withholdDeveloperDiscoveryArtifact` must hide or mark stale artifacts when live route DTO fields, status variants, nullability, pagination, UCP/llms references, or optional projection fields drift from the public catalog DTO.
    </action>
    <acceptance_criteria>
      - Parity tests compare generated schema/examples/fixtures against `buildPublicCatalogDto` and public route DTOs for fields, status variants, nullability, pagination, and unsupported capability metadata.
      - Empty examples, encoded field values, long strings, and live docs/API drift are covered by tests.
      - Schema mismatch, stale cache, and route failure withhold or mark artifacts degraded; no hand-authored optimistic docs remain available.
      - Generated artifacts contain non-authority metadata and no mutation/payment/action/provider/request-market descriptors.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P3-04" title="Ship the developer discovery readback route and machine endpoints">

    <name>Ship the developer discovery readback route and machine endpoints</name>
    <read_first>
      .planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
      DESIGN.md
      .planning/FRONTEND-DESIGN-FRAMEWORK.md
      src/routes/__root.tsx
      src/routes/$slug.tsx
      src/routes/owner.status.tsx
      src/modules/discovery/public.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add `/developers/discovery` plus `/api/discovery/schema`, `/api/discovery/examples`, and `/api/discovery/fixtures` using the current TanStack Start route-file conventions. The human route must show read-only public facts, support matrix summary, generated schema/examples/fixtures links, route health, cache freshness, AE-hosted fallback explanation, business-origin UCP unavailable/degraded state, P2 public inquiry availability status, and unsupported/deferred capability reasons. Use existing AE shells/components and 03-UI-SPEC copy. Do not add global Developers/API Keys/MCP/SDK/CLI/Payments/Actions nav.
    </action>
    <acceptance_criteria>
      - `/developers/discovery` renders current, degraded, all-artifacts-unavailable, public-route-outage, no-generated-examples, long-route-name, and narrow 375px states.
      - Machine endpoints return only source-generated current artifacts or explicit withheld/degraded responses with reason codes.
      - Keyboard path covers skip link, anchors/tabs if present, copy/download controls, support rows, and route-health details.
      - Copy states `read-only public facts` and does not claim developer platform, invocation, payment, protected action, API-key platform, SDK/CLI/plugin, or standard merchant-origin UCP authority.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P3-05" title="Gate optional OpenAPI, MCP, and API-key surfaces">

    <name>Gate optional OpenAPI, MCP, and API-key surfaces</name>
    <read_first>
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
      .planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
      .planning/AI-SPEC.md
      .planning/SECURITY-SPEC.md
      .planning/GTM-READINESS.md
      src/modules/discovery/public.ts
      src/lib/ui/contract-scans.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Implement `evaluateDiscoveryProjectionGate` for `openapi_read_projection` and `mcp_read_projection`. Accepted projections may describe only route-tested read behavior for `/api/businesses`, `/api/businesses/search`, and `/api/businesses/{slug}` with non-authority/unsupported metadata; they must omit mutation, invoke, protected-action, request-market, payment, provider-operation, action endpoint, payment handler, callable, tool-call, and agent-callable descriptors. API keys remain unavailable/deferred by default. Only if a separate decision proves quotas or private readbacks require authenticated reads may a later task add read-only keys with reveal-once, hash-at-rest, prefix/last4 display, revocation, rate limit, last-used readback, audit, and mutation-denial tests.
    </action>
    <acceptance_criteria>
      - Optional OpenAPI/MCP artifacts are absent unless their gate records accepted evidence and route parity.
      - Accepted OpenAPI/MCP artifacts advertise only list/search/detail read paths and contain `nonAuthority` or equivalent unsupported metadata.
      - Descriptor scans fail on mutation, invoke, protected action, request market, payment, provider operation, action endpoint, payment handler, callable, tool-call, and agent-callable semantics.
      - API-key UI/routes/functions are absent in base Phase 3; unavailable/deferred copy is present.
      - `api_key_created` and `api_key_revoked` telemetry expectations are documented as conditional only if read-only keys ship, closing M6.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P3-06" title="Add privacy-safe telemetry and operator readback">

    <name>Add privacy-safe telemetry and operator readback</name>
    <read_first>
      src/modules/observability/public.ts
      src/modules/observability/internal/schema.ts
      src/modules/observability/internal/funnel.ts
      src/modules/observability/internal/redaction.ts
      src/modules/discovery/public.ts
      .planning/SECURITY-SPEC.md
      .planning/GTM-READINESS.md
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add `DeveloperDiscoveryFetchEvent`, `recordDeveloperDiscoveryFetch`, `readDeveloperDiscoveryRouteHealth`, and `readDeveloperDiscoveryFreshness`. Base GTM funnel events use the canonical launch names `developer_docs_viewed`, `schema_downloaded`, `example_fixture_downloaded`, and `discovery_health_viewed`; route-specific implementation names may exist only as internal readback types that map to one of those canonical `requiredFunnelEvent` values. `api_key_created` and `api_key_revoked` remain conditional P3 launch evidence only if the API-key gate accepts source-owned read-only key evidence; `developer_discovery_projection_fetched` remains conditional only if a projection ships. Event dimensions are limited to `route`, `status`, `schemaVersion`, `cacheVersion`, `freshness`, `errorCode`, `botClass`, `publicBusinessId`, `publicServiceId`, `correlationId`, and `timestamp`. Add operator-visible readbacks for successful, cached, stale, invalid, 404, route outage, and schema-version mismatch states.
    </action>
    <acceptance_criteria>
      - Tests prove successful, cached, stale, invalid, 404, route outage, and schema-version mismatch fetches emit privacy-safe readbacks.
      - Telemetry and readback payloads never contain private owner/contact/inquiry/admin/provider evidence or P2 notification/provider payloads.
      - API-key events are absent from base Phase 3 telemetry unless the API-key gate has accepted evidence.
      - GTM/readback assertions can distinguish shipped, degraded, unavailable, deferred, and withheld artifact states.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P3-06B" title="Create discovery support record and kill controls">

    <name>Create discovery support record and kill controls</name>
    <read_first>
      .planning/GTM-READINESS.md
      .planning/SECURITY-SPEC.md
      .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md
      src/modules/discovery/public.ts
      src/modules/discovery/internal/developer-discovery.ts
      src/modules/observability/public.ts
      src/modules/observability/internal/operator-controls.ts
      src/lib/ui/contract-scans.ts
      tests/copy/claims-register.test.ts
    </read_first>

    <files>
      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>
    </files>

    <action>
      Create the source-owned `capabilityLaunchSupportRecord` for Phase 3 developer discovery before any public docs/schema/examples/fixtures/route-health claim can become launch-ready. The record must name the support owner, claim-disable path, operator next action, support capacity threshold, and kill rules for stale docs/schema, route parity failure, accidental private data exposure, bot abuse, and API-key revoke/rotate only if the API-key gate ships. Wire `developer_discovery_publish_enabled` as the artifact publication/claim gate and `discovery_api_keys_enabled` as a separate API-key surface gate; disabled gates must withhold or mark artifacts unavailable/deferred rather than publishing stale "ready" claims.
    </action>

    <acceptance_criteria>
      - P3 cannot mark `developer_docs_viewed`, `schema_downloaded`, `example_fixture_downloaded`, or `discovery_health_viewed` claim evidence launch-ready without a live `capabilityLaunchSupportRecord`.
      - `developer_discovery_publish_enabled=false` prevents public developer-discovery artifacts and claims while preserving operator readback.
      - `discovery_api_keys_enabled=false` prevents only API-key artifacts/events and does not block base read-only docs/schema/examples/health readback.
      - Kill-rule tests cover stale schema/docs, route parity failure, accidental private field exposure, bot abuse, and API-key revoke/rotate when API keys ship.
    </acceptance_criteria>

    <verify>
      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>
    </verify>

    <done>
      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>
    </done>
  </task>

  <task id="P3-07" title="Expand protocol claim scans and copy controls">

    <name>Expand protocol claim scans and copy controls</name>
    <read_first>
      src/lib/ui/contract-scans.ts
      tests/imports/scan-targets.ts
      tests/copy/phase1-banned-copy.test.ts
      tests/copy/claims-register.test.ts
      .planning/GTM-READINESS.md
      .planning/SEO-AEO-SPEC.md
      .planning/AI-SPEC.md
      .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Expand `scanCopyClaims` protocol rules for H10. Positive live claims around `.well-known`, merchant-origin UCP, MCP tool, OpenAPI service descriptor, OpenAPI action descriptor, action endpoint, payment handler, callable endpoint, tool-call, and agent-callable behavior must fail outside readback-proven contexts. Negative/deferred wording must be explicit to the matched capability: `no X`, `X unavailable`, `X deferred`, `X out of scope`, or `X requires readback`. Extend clean scan targets to include generated discovery/API-doc outputs and public launch/protocol asset directories when those directories exist; keep phase-owned planning allowances separate from public asset scans.
    </action>
    <acceptance_criteria>
      - Fixture tests reject `MCP tools available`, `standard merchant-origin UCP is live`, `agent-callable endpoint`, `.well-known UCP available`, `OpenAPI action descriptor`, `payment handler`, and `callable tool-call` style claims without readback evidence.
      - Fixture tests allow explicit negative/deferred copy such as `MCP tool calls are unavailable`, `business-origin UCP requires merchant-origin readback`, and `OpenAPI mutation descriptors are out of scope`.
      - Copy scans include generated discovery/API-doc artifacts when present and do not rely on broad `without` or `unless` wording as the only negative context.
      - This visibly closes H10 for Phase 3 protocol claims.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P3-08" title="Add focused tests, smoke, and closeout proof">

    <name>Add focused tests, smoke, and closeout proof</name>
    <read_first>
      package.json
      tests/unit/catalog/public-catalog-dto.test.ts
      tests/unit/observability/funnel.test.ts
      tests/integration/claim-publish.test.ts
      tests/e2e/public-owner-ui.spec.ts
      tests/e2e/a11y/public-owner-a11y.spec.ts
      tests/seo/public-business-seo.test.ts
      tests/imports/scan-targets.ts
      tests/copy/phase1-banned-copy.test.ts
      tests/ui-contract/class-scan.test.ts
      .planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add narrow unit, integration, E2E, a11y, SEO, type, copy, source-mining, and UI-contract coverage for the Phase 3 surfaces. Builder/agent smoke must fetch `/developers/discovery`, `/api/discovery/schema`, `/api/discovery/examples`, and `/api/discovery/fixtures`, then prove a reader can identify current public facts, freshness, generated examples, unsupported/degraded capabilities, P2 public status, and no-private-data boundaries. Add optional projection/key tests only when the corresponding gate accepts.
    </action>
    <acceptance_criteria>
      - Unit tests cover support states, gated exclusions, DTO parity, artifact withholding, telemetry/readback fields, stale/cache/schema mismatch races, and concurrent fetch readbacks.
      - Integration tests cover route health across `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, sitemap, robots, and Phase 3 discovery endpoints.
      - E2E/a11y tests cover `/developers/discovery` compact 375px and wide layouts, keyboard/focus path, large examples, copy/download controls, current/degraded/unavailable states, and unsupported capability reasons.
      - SEO/copy/scan tests prove no standard merchant-origin UCP, protocol, platform, payment, protected-action, callable, SDK/CLI/plugin, hosted-agent, marketplace, or request-market overclaims ship.
      - Closeout evidence lists the exact verification commands in this plan and records optional OpenAPI/MCP/API-key gate outcomes.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

## must_haves

```yaml
must_haves:
  truths:
    - id: P3-R1-support-matrix-authority
      statement: "One source-owned support matrix controls concurrently evolving candidate surfaces and evidence states; live rows are limited to minimal public discovery outputs plus accepted read-only projections."
      verification: "Unit tests assert every live support row has state, evidence, owner, routeReadbackStatus, blocker, and nextAction; gated exclusions cover API keys, SDK, CLI, plugin, hosted MCP/BYO proxy, Agent Router, payment descriptors, and protected-action descriptors."
    - id: P3-R2-dto-parity-empty-encoding-drift
      statement: "Docs, schemas, examples, fixtures, UCP/llms references, optional projections, and live public API responses share the same public catalog DTO or documented subsets across empty examples, encoded values, and docs/API drift."
      verification: "Parity tests compare generated artifacts with PublicCatalogContract/PublicServiceContract route DTOs and withhold artifacts on mismatch."
    - id: P3-R5-read-vs-mutation-adjacency-and-ordering
      statement: "Optional projections preserve stable read operation ordering, omit absent/withheld projections, and distinguish adjacent read paths from mutation/action/payment paths."
      verification: "Descriptor scans and projection tests assert only list/search/detail read behavior appears and mutation/payment/action descriptors are absent."
    - id: P3-R6-api-key-boundary-precision-and-races
      statement: "API keys are unavailable by default; if a later accepted decision ships keys, tests cover exact read-only scope, reveal-once precision, hash-at-rest, revocation, rate-limit races, last-used readback, and mutation denial."
      verification: "Base tests assert absent-key/unavailable state; optional key tests are required only under an accepted API-key gate."
    - id: P3-R7-cache-schema-concurrency-readbacks
      statement: "Discovery fetch readbacks cover stale cache, schema mismatch, route outage, 404, invalid artifact, successful cached fetch, and concurrent fetch races without private payloads."
      verification: "Telemetry/readback tests assert privacy-safe dimensions and source-owned degraded/withheld states for each fetch outcome."
  prohibitions:
    - statement: "MUST NOT create invocation, protected-action, payment, booking, provider, request-market, or mutation authority through a docs, OpenAPI, MCP, API-key, or schema artifact."
      status: resolved
      verification: "Schema/projection scans, route tests, descriptor scans, and mutation-denial tests."
    - statement: "MUST NOT claim business-origin .well-known or standard UCP unless the merchant origin serves it and readback verifies it."
      status: resolved
      verification: "Copy/output scan plus origin readback fixture when supported; AE-hosted fallback remains labeled as fallback."
    - statement: "MUST NOT fork the public catalog into a second Agent Router/readiness model with divergent fields or statuses."
      status: resolved
      verification: "Schema parity tests, no Agent Router symbols/routes, and codebase-design review of public DTO use."
    - statement: "MUST NOT ship API keys as platform theatre when public unauthenticated docs/routes suffice."
      status: resolved
      verification: "Decision gate must prove quotas/private readbacks before any key route/function appears; absent-key tests prove unavailable state."
    - statement: "MUST NOT leak private owner/contact/inquiry/admin/provider evidence in docs, examples, fixtures, telemetry, or discovery logs."
      status: resolved
      verification: "Redaction tests and fixture scans for private field names and payload markers."
    - statement: "MUST NOT launch SDK, CLI, plugin, hosted-agent, developer gallery, or marketplace surfaces before measured demand and route-tested capability exist."
      status: resolved
      verification: "Support-matrix gated exclusions, source-mining scans, route scans, and public-copy scans."
```

<verification>
  <commands>
    npm run check:convex-codegen
    npm run typecheck
    npm run test:unit
    npm run test:integration
    npm run test:e2e
    npm run test:e2e:a11y
    npm run test:a11y
    npm run test:types
    npm run test:imports
    npm run test:source-mining
    npm run test:ts-standards
    npm run test:copy
    npm run test:seo
    npm run test:ui-contract
    npm run build
  </commands>
  <focused_smoke>
    Fetch `/developers/discovery`, `/api/discovery/schema`, `/api/discovery/examples`, and `/api/discovery/fixtures`; confirm current public facts, freshness, examples, unsupported/degraded capabilities, P2 public status, and no private data are visible. If OpenAPI or MCP gates accepted, fetch the accepted projection and prove read-only list/search/detail parity. If API-key gate accepted, prove reveal-once/hash/revoke/rate-limit/last-used/mutation-denial behavior; otherwise prove API keys are unavailable/deferred and `api_key_created`/`api_key_revoked` are absent from base required events.
  </focused_smoke>
</verification>

## Explicit review closures and deferrals

- H10: closed by Task P3-07 protocol claim regexes/fixtures for `.well-known`, merchant-origin UCP, MCP tool, OpenAPI service/action descriptor, action endpoint, payment handler, callable/tool-call, and agent-callable claims.
- M4: closed by Task P3-02 minimal matrix; API keys, SDK, CLI, plugin, hosted MCP/BYO proxy, Agent Router, developer gallery, payment descriptors, and protected-action descriptors move to gated exclusions/negative scans unless a later accepted decision proves demand.
- M6: closed by Tasks P3-05 and P3-06; API-key events are conditional only if read-only API keys ship.
- M11: closed in frontmatter and Task P3-01; P3 depends on the Phase 2 plan and has an explicit P2 public status execution gate.
- M12: closed in `<verification>`; closeout includes `npm run test:types`, `npm run test:ts-standards`, and `npm run test:seo` plus the current package guardrails.

## Acceptance

Phase 3 is complete only when a builder/agent can fetch/read source-generated public docs/schema/examples/support/readback, know exact current/degraded/unavailable states, see P2 inquiry availability only as public status, and no private data or unsupported authority leaks through docs, routes, generated artifacts, scans, telemetry, or copy.
