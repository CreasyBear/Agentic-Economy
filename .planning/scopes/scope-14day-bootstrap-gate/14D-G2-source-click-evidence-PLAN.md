---
phase: scope-14day-bootstrap-gate
plan: "14D-G2"
status: source-local-complete
wave: 0
blocker: "source-profile-click-instrumentation"
depends_on: ["14D-01-bootstrap-gate-evidence"]
files_modified:
  - .planning/scopes/scope-14day-bootstrap-gate/14D-G2-source-click-evidence-PLAN.md
  - .planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md
  - .planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md
  - .planning/scopes/SCOPE-EXECUTION-READINESS.md
  - src/modules/registry/internal/search.ts
  - convex/registry.ts
  - src/modules/registry/registry.actions.ts
  - src/modules/discovery/developer-discovery.ts
  - src/lib/observability/registry-click.ts
  - src/routes/registry.tsx
  - tests/unit/observability/funnel-client.test.ts
  - tests/unit/convex/registry-runtime.test.ts
  - tests/unit/discovery/developer-discovery-parity.test.ts
  - tests/unit/discovery/developer-discovery-route.test.ts
  - tests/unit/registry/registry-fallback.test.ts
  - tests/unit/registry/catalog-search-port.test.ts
  - tests/unit/registry/search-documents.test.ts
  - tests/seo/public-business-seo.test.ts
autonomous: false
requirements:
  - SCOPE-14DAY-INDEX instrumentation map
  - EVIDENCE-14DAY-GATE pre-clock blocker 14D-G2
execution_scope: narrow_pre_clock_instrumentation
production_executable: false
must_haves:
  truths:
    - id: g2-business-scoped-click
      statement: "A source/profile click-through counted for the 14-day gate must include businessId, session/correlation, and run attribution when present."
    - id: g2-behavior-only-ui
      statement: "This ticket changes registry click instrumentation only; it does not change public visual design, copy posture, or card affordance hierarchy."
    - id: g2-no-pass-without-target-run
      statement: "Source-local tests can unblock instrumentation only; the 14-day clock still requires target-environment dry-run evidence."
    - id: g2-no-scope-blend
      statement: "This ticket does not add supplier evidence, inquiries, agent writes, payments, booking, dispatch, or autonomous action claims."
---

<objective>
Resolve G2's optional source/profile click-through ambiguity by making the public registry details click emit a source-owned, business-scoped `service_registry_result_clicked` event without changing the user-visible registry design.
</objective>

<context>
`service_registry_result_clicked` already exists in the funnel event vocabulary, and registry pages already emit `registry_search`. The pre-implementation missing piece was the clicked provider/listing ref: slug-only client events did not satisfy the business-scoped metric. This ticket exposes the public catalog business ref through registry JSON/readback data and records it on the existing funnel endpoint when a visitor follows the primary registry "View details" action.
</context>

<preflight_gates>
- Do not count a click event unless it includes `businessId`.
- Do not add route-local styling, bespoke components, or copy changes.
- Do not rely on PostHog-only proof; the client emitter must also POST to `/api/observability/funnel`.
- Do not start the 14-day clock until target-environment click evidence attaches non-secret row/export refs.
</preflight_gates>

<tasks>

<task type="implementation" tdd="true" status="complete">
  <name>Task 1: Expose safe registry business ref</name>
  <files>src/modules/registry/internal/search.ts; convex/registry.ts; src/modules/registry/registry.actions.ts; src/modules/discovery/developer-discovery.ts; tests/unit/convex/registry-runtime.test.ts; tests/unit/discovery/developer-discovery-parity.test.ts; tests/unit/discovery/developer-discovery-route.test.ts; tests/unit/registry/registry-fallback.test.ts; tests/unit/registry/catalog-search-port.test.ts; tests/unit/registry/search-documents.test.ts; tests/seo/public-business-seo.test.ts</files>
  <action>Add `businessId` to `PublicBusinessCatalogApiDto` from the already-public `PublicCatalogContract.businessId` so registry route cards can emit business-scoped events. Keep the rest of the DTO shape unchanged.</action>
  <acceptance_criteria>
    - Registry API/readback items include `businessId` for published listings.
    - Existing slug, public URL, service, pagination, and search behavior remain unchanged.
  </acceptance_criteria>
</task>

<task type="implementation" tdd="true" status="complete">
  <name>Task 2: Emit source/profile click-through</name>
  <files>src/lib/observability/registry-click.ts; src/routes/registry.tsx; tests/unit/observability/funnel-client.test.ts</files>
  <action>Add a small client helper that emits `service_registry_result_clicked` with `businessId`, slug, query length, and result position, then call it from the existing registry primary "View details" action. The navigation must not wait on telemetry.</action>
  <acceptance_criteria>
    - Click event payload sent to `/api/observability/funnel` includes `eventType`, `businessId`, `pseudonymousSessionId`, `correlationId`, optional attribution fields, and non-sensitive payload fields.
    - The existing card visual structure and public copy stay unchanged.
    - The helper is no-op on the server and swallows telemetry failures like the existing funnel emitter.
  </acceptance_criteria>
</task>

<task type="documentation" tdd="false" status="complete">
  <name>Task 3: Mark G2 source-local readiness, not pass</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md; .planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md; .planning/scopes/SCOPE-EXECUTION-READINESS.md</files>
  <action>After source-local tests pass, update G2 rows to say source-local click instrumentation is implemented but target dry-run evidence remains open.</action>
  <acceptance_criteria>
    - `14D-G2` is not marked PASS.
    - The evidence row names target dry-run refs required before the clock.
    - Docs keep G1, G3, and G4 blockers visible.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- [x] Unit test proving the click helper posts `service_registry_result_clicked` with `businessId`, attribution, session, correlation, slug, query length, and position.
- [x] Registry/runtime test proving registry DTO items include `businessId`.
- [x] `npm run typecheck`
- [x] `npm run check:convex-codegen`
- [x] Focused observability and registry tests changed by this ticket.
- [x] `npm run test:copy`
- [x] `npm run test:seo`
</verification>

<success_criteria>
- G2 has a source-local, business-scoped source/profile click-through contract.
- The 14-day gate can later attach target-environment click rows/export refs without adding a new analytics platform.
- No public copy, visual styling, assistant action surface, payment, booking, dispatch, or schema-widening work is bundled into this ticket.
</success_criteria>

<output>
After execution, update `EVIDENCE-14DAY-GATE.md` row `14D-G2` with source-local status and the exact target dry-run evidence required. Do not start the 14-day clock until G1, G3, G4/trust, and any chosen G2 posture are resolved or explicitly accepted by the relevant plan.
</output>
