---
phase: scope-02-capability-registry
plan: "02-02"
type: execute
wave: 2
depends_on: ["02-01"]
files_modified:
  - src/modules/capabilities/internal/schema.ts
  - src/modules/capabilities/public.ts
  - src/modules/capabilities/internal/backfill.ts
  - src/modules/capabilities/capabilities.functions.ts
  - convex/schema.ts
  - convex/capabilities.ts
  - convex/sourceWriteAdmission.ts
  - src/modules/security/source-write-admission.ts
  - tests/unit/capabilities/backfill.test.ts
  - tests/types/capability-contracts.test.ts
  - tests/imports/wedge-agnostic-capability.test.ts
  - package.json
autonomous: true
requirements: [D2, D3, D4, D9, D11]
user_setup:
  - "A Convex dev deployment must be reachable to run the backfill mutation end-to-end (npx convex dev --once). Schema codegen and all pure/backfill logic tests run source-locally without it."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s2-new-tables-not-widened
      statement: "Capability state lives in NEW business-grain tables (businessCapabilities + capabilityCheckAttempts); no capability/endpoint/provider/payment field is added to business/registry/discovery rows."
    - id: s2-descriptor-union-schema
      statement: "The Convex schema encodes descriptor as a v.union discriminated by kind, not wide optional columns; action_card holds only a reference (actionSlug/cardRef), never copied provider/payment fields."
    - id: s2-derive-then-additive
      statement: "Migration derives businessCapabilities from published state idempotently; serviceCapabilities is untouched and reversible; public URL/slug/service rows are unchanged."
    - id: s2-wedge-invariant-enforced
      statement: "A scan/type gate fails if any local-services field (serviceArea/suburb/hours/urgency/emergency) appears in the capability tables."
    - id: s2-capability-check-scope
      statement: "A capability_check source-write scope exists in both the TS enum and convex/sourceWriteAdmission and is required for capability-state mutations."
  artifacts:
    - path: src/modules/capabilities/internal/schema.ts
      provides: "businessCapabilities + capabilityCheckAttempts table definitions with indexes, reusing literalUnion over the 02-01 value arrays."
    - path: src/modules/capabilities/internal/backfill.ts
      provides: "Pure derive-then-additive backfill computing businessCapabilities from published catalog state, keyed by logicalKey for idempotency."
    - path: tests/imports/wedge-agnostic-capability.test.ts
      provides: "The wedge-agnostic invariant scan guarding the capability schema against local-services fields."
  key_links:
    - from: 02-01 value arrays
      to: Convex schema
      via: "literalUnion(BusinessCapabilityKindValues/CapabilityTrustStateValues) so the schema and domain model share one source of truth."
    - from: published catalog state
      to: businessCapabilities rows
      via: "idempotent backfill keyed by logicalKey (business+kind+serviceRef)."
---

<objective>
Add the two new business-grain capability tables (source-owned `businessCapabilities` + idempotent `capabilityCheckAttempts`), the `capability_check` source-write scope, the derive-then-additive migration/backfill from published state, and the wedge-agnostic invariant gate — with zero widening of business/registry/discovery rows.

Purpose: give the capability model durable, indexed, wedge-clean storage and a reversible migration path.
Output: module + Convex schema fragments, backfill logic, source-write scope, invariant scan, tests, and package script wiring.
</objective>

<context>
@.planning/adr/ADR-002-capability-registry-agent-native-supply.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/ROADMAP.md
@.planning/codebase/CONVENTIONS.md
@src/modules/registry/internal/schema.ts
@src/modules/discovery/internal/schema.ts
@convex/schema.ts
@convex/sourceWriteAdmission.ts
@src/modules/security/source-write-admission.ts
@src/modules/business/internal/schema.ts
@src/modules/capabilities/public.ts
</context>

<preflight_gates>
- Requires 02-01 complete: the pure capability model + value arrays + resolution of "Decide capability-table naming and serviceCapabilities fold path (#12)".
- Running the backfill mutation end-to-end requires a reachable Convex dev deployment; schema `check:convex-codegen` and all pure backfill/invariant tests run source-locally.
- No public copy or route surface changes in this plan; public pages still read the existing service-shaped DTO until 02-04.
</preflight_gates>

<standards>
- Convex standards: every function validates input; retryable projection has a durable idempotency key (`logicalKey`); consequential mutations write typed audit; indexes exist for every query path; schema changes require codegen (`npm run check:convex-codegen`).
- Side-effect/outbox standard: `capabilityCheckAttempts` stores attemptId/logicalKey/sourceHash/sourceVersion/status/retryCount/retryAfter/lastErrorCode/lastErrorRedacted/startedAt/finishedAt-equivalents; readback alone is insufficient — every failed/stale readback needs a repair action or explicit no_repair.
- TypeScript hard spec: no `v.any()`; no broad `string` statuses (use `literalUnion` over 02-01 value arrays); exact Convex returns; branded IDs at boundaries.
- Money-rail quarantine (ROADMAP.md:201) + bloat detector (ROADMAP.md:236-237): no payment/provider/rail field in the new rows; action_card descriptor is reference-only.
- Source-of-truth: `capabilities/public.ts` owns the value arrays; schema imports them via the approved `literalUnion` helper (no second definition).
- `/ponytail full`: only the fields D2/D3/D4 require; no speculative columns; reuse the existing `VisibilityTargetTypeValues` `'capability'` suppression target — add no new suppression enum.
</standards>

<antipatterns>
- Widening `businesses`/`registry`/`discovery` rows with capability/endpoint/provider columns (bloat detector :236, money-rail quarantine :201) -> `tests/imports/wedge-agnostic-capability.test.ts` asserts those files gain no capability/endpoint/provider/payment field; route-boundary + ts-standards scans stay green.
- Boolean/optional-column state soup instead of the descriptor union (ROADMAP.md:239, D3) -> `tests/types/capability-contracts.test.ts` asserts the Convex validator infers the exact discriminated descriptor type.
- Local-services fields (serviceArea/suburb/hours/urgency/emergency) on the capability tables (wedge veto, D11) -> the new invariant scan greps the capability schema file and fails on any of those tokens.
- Best-effort backfill without attempt/repair state (ROADMAP.md:238) -> backfill writes a projection attempt keyed by logicalKey; test asserts a second run is a no-op (idempotent).
- Copying P6 provider/payment fields into action_card rows (ROADMAP.md:237, D2) -> schema test asserts action_card descriptor contains only actionSlug + cardRef.
</antipatterns>

<skill_usage>
- `convex-schema-validator`: define `businessCapabilities` + `capabilityCheckAttempts` with `literalUnion` unions, discriminated descriptor via `v.union`, and required indexes; keep validators synchronized with the 02-01 value arrays.
- `convex-migration-helper`: apply widen-migrate-narrow — this plan is the "widen" (additive tables) + "migrate" (idempotent backfill); the narrow/fold stays deferred per the #12 resolution.
- `convex-best-practices`: indexed reads only, bounded queries, `internal*` for the backfill mutation, server-derived actor.
- `codebase-design`: keep the backfill pure in `internal/backfill.ts`, transport in `capabilities.functions.ts`, storage in `convex/capabilities.ts`.
- `security-best-practices`: the `capability_check` source-write scope must gate every capability-state mutation.
- `tdd`: backfill idempotency + descriptor type + wedge invariant tests first.
- `ponytail`: `/ponytail full` — smallest table shape satisfying D2/D3/D4.
</skill_usage>

<how_to_execute>
Fresh session: read `.planning/scopes/scope-02-capability-registry/SCOPE-02-INDEX.md`, then execute this plan's tasks in order. Load skills first: `convex-schema-validator`, `convex-migration-helper`, `convex-best-practices`, `codebase-design`, `tdd`, `ponytail`. TDD where marked. Run each `<verify>` before moving on. On completion write the SUMMARY.md named in `<output>`.
</how_to_execute>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add capability tables + capability_check source-write scope</name>
  <files>src/modules/capabilities/internal/schema.ts, src/modules/capabilities/public.ts, convex/schema.ts, convex/sourceWriteAdmission.ts, src/modules/security/source-write-admission.ts, tests/types/capability-contracts.test.ts</files>
  <read_first>resolution of #12, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D2,D3,D4), src/modules/registry/internal/schema.ts, src/modules/discovery/internal/schema.ts, convex/schema.ts, src/modules/security/source-write-admission.ts</read_first>
  <action>Create `capabilities/internal/schema.ts` exporting `capabilityTables` with: `businessCapabilities` (businessId, capabilityId, kind via literalUnion(BusinessCapabilityKindValues), trustState via literalUnion(CapabilityTrustStateValues), descriptor as a v.union discriminated by kind matching the 02-01 CapabilityDescriptor, optional serviceId as migration link only, sourceHash, sourceVersion, timestamps; indexes by_business, by_business_kind, by_business_status) and `capabilityCheckAttempts` (attemptId, businessId, capabilityId, checkStandardVersion, status via literalUnion, facet results, retryCount, retryAfter, failureCode, failureMessageRedacted, staleThresholdAt, latestReadback, repairAction, repairResult; indexes by_business_status, by_capability_status, by_attemptId). Compose `...capabilityTables` in `convex/schema.ts`. Add `'capability_check'` to `SourceWriteAdmissionScopeValues` (src/modules/security/source-write-admission.ts) so it flows through `convex/sourceWriteAdmission.ts` `literalUnion`. Reuse the existing `VisibilityTargetTypeValues` `'capability'` suppression target — add no new suppression enum. Extend `tests/types/capability-contracts.test.ts` to assert the Convex descriptor validator infers the exact discriminated type and action_card carries only actionSlug/cardRef.</action>
  <verify>npm run check:convex-codegen && npm run typecheck && npm run test:ts-standards && npx vitest run tests/types/capability-contracts.test.ts</verify>
  <acceptance_criteria>
    - Both tables exist with the D2 indexes; descriptor is a discriminated v.union (no wide optional columns); no v.any().
    - `capability_check` scope is present in the TS enum and the Convex admission validator.
    - Codegen + typecheck + ts-standards green; the `'capability'` suppression target is reused, not re-added.
  </acceptance_criteria>
  <done>Durable, indexed, wedge-clean capability storage exists behind a source-write scope.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Derive-then-additive backfill from published state</name>
  <files>src/modules/capabilities/internal/backfill.ts, src/modules/capabilities/capabilities.functions.ts, convex/capabilities.ts, tests/unit/capabilities/backfill.test.ts</files>
  <read_first>.planning/adr/ADR-002-capability-registry-agent-native-supply.md (D9), src/modules/catalog/internal/catalog-model.ts, src/modules/registry/registry.functions.ts, src/modules/discovery/internal/manifest-attempts.ts</read_first>
  <action>In `internal/backfill.ts` implement a PURE `deriveBusinessCapabilities(publishedState)` producing: every published business -> one `informational_page` (business_supplied) with {publicUrl}; any phone_inquiry/quote_request/emergency_callout serviceCapability -> one `inquiry_intake` capability whose descriptor references the serviceId (emergency_callout_interest is NOT promoted, it migrates to generic inquiry_intake); ae_hosted_discovery -> informational_page. Key each derived row by `logicalKey` (business+kind+serviceRef) for idempotency. In `capabilities.functions.ts` add the server/source transport; in `convex/capabilities.ts` add an internal backfill mutation that upserts by logicalKey under the `capability_check` scope and writes a projection attempt row. `serviceCapabilities` is untouched. Test: a run over a fixture published state yields the expected derived set; a second run is a no-op (same logicalKeys); emergency_callout maps to inquiry_intake, never a promoted kind.</action>
  <verify>npx vitest run tests/unit/capabilities/backfill.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - Backfill derives the D9 mapping and is idempotent (second run no-op).
    - `serviceCapabilities` rows are unchanged; derived rows carry a serviceId link only.
    - emergency_callout_interest never becomes a new kind; it maps to inquiry_intake.
  </acceptance_criteria>
  <done>Existing service-shaped listings gain business-grain capabilities with zero public breakage and a reversible path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wedge-agnostic invariant scan + gate wiring</name>
  <files>tests/imports/wedge-agnostic-capability.test.ts, package.json</files>
  <read_first>.planning/adr/ADR-002-capability-registry-agent-native-supply.md (D11), src/modules/capabilities/internal/schema.ts, tests/imports/source-mining.test.ts, package.json</read_first>
  <action>Add `tests/imports/wedge-agnostic-capability.test.ts` that reads `src/modules/capabilities/internal/schema.ts` (and the capabilities public/backfill files) and FAILS if any local-services field token appears — `serviceArea`, `suburb`, `stateTerritory`, `hoursOrUnknown`, `hours`, `urgency`, `jobSuburb`, `emergency_callout` — in the capability table definitions (the optional `serviceId` migration link is explicitly allowed). Also assert the money-rail quarantine holds for the new files (no wallet/x402/autumn/stripe/paymentHandler/credits/balance tokens). Append the new test file to the `test:imports` npm script so it runs with the guardrail suite (keep AE_SCAN_MODE=clean semantics).</action>
  <verify>npx vitest run tests/imports/wedge-agnostic-capability.test.ts && npm run test:imports</verify>
  <acceptance_criteria>
    - The scan fails loudly if a local-services field is introduced into the capability tables (verify by a temporary local edit, then revert).
    - The money-rail quarantine tokens are also rejected in the new files.
    - The test runs as part of `npm run test:imports`.
  </acceptance_criteria>
  <done>The wedge-agnostic veto is a standing, command-verifiable gate on the capability tables.</done>
</task>

</tasks>

<verification>
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npx vitest run tests/unit/capabilities tests/types/capability-contracts.test.ts
- [ ] npx vitest run tests/imports/wedge-agnostic-capability.test.ts
- [ ] npm run test:imports
</verification>

<success_criteria>
- Two new capability tables with D2 indexes and a discriminated descriptor union; no widening of business/registry/discovery rows.
- Idempotent derive-then-additive backfill from published state; serviceCapabilities untouched and reversible.
- `capability_check` source-write scope added end to end; wedge-agnostic invariant scan is part of `test:imports`.
- Codegen + typecheck + ts-standards + imports green (source/local proof; backfill against dev Convex is a preflight-gated run, production proof not claimed).
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-02-capability-registry/02-02-SUMMARY.md` stating: tables/scope/backfill/invariant landed, source/local proof only, backfill-against-deployed-Convex not counted as external proof unless a dev deployment run is recorded.
</output>
