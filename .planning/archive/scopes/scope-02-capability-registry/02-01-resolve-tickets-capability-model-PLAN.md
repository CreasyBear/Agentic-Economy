---
phase: scope-02-capability-registry
plan: "02-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/capabilities/public.ts
  - src/modules/capabilities/internal/capability-model.ts
  - src/modules/capabilities/internal/check-standard.ts
  - tests/unit/capabilities/capability-model.test.ts
  - tests/unit/capabilities/check-standard.test.ts
  - tests/types/capability-contracts.test.ts
autonomous: true
requirements: [D1, D3, D4, D6]
user_setup: []
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s2-closed-capability-enum
      statement: "The capability axis is a closed four-kind literal union (informational_page | inquiry_intake | business_endpoint | action_card) with no generic other/open kind."
    - id: s2-descriptor-discriminated
      statement: "Per-kind payload is a discriminated descriptor union keyed by kind, never wide optional columns."
    - id: s2-trust-state-labels
      statement: "Per-capability trust state is exactly the five PRODUCT.md fact labels (business_supplied|checked|stale|contradicted|unsupported); verified is never emitted."
    - id: s2-transition-oracle
      statement: "A pure module function computes the next trust state from source + facet inputs and is the single reconstruction oracle for the check engine."
    - id: s2-tickets-resolved
      statement: "All seven Scope-2 wayfinder tickets (#9-#15) are resolved with a resolution comment, closed, and one line appended to the wayfinder map issue #1 before schema/engine work begins."
  artifacts:
    - path: src/modules/capabilities/public.ts
      provides: "Closed capability-kind + trust-state value arrays, descriptor contract types, and ae-endpoint-check:v1 version constant, exported as the capabilities module seam."
    - path: src/modules/capabilities/internal/capability-model.ts
      provides: "Pure trust-state transition function (reconstruction oracle) and descriptor constructors."
    - path: src/modules/capabilities/internal/check-standard.ts
      provides: "Pure ae-endpoint-check:v1 facet evaluation (reachability/schema/freshness/contradiction) producing a typed facet result union."
  key_links:
    - from: facet evaluation
      to: trust-state transition
      via: "check-standard facet result union feeds the pure transition function which maps facets -> trust state."
    - from: resolution of #9/#14/#11/#10/#12/#13/#15
      to: schema/engine/search plans (02-02..02-04)
      via: "Each downstream plan reads a named ticket resolution as its authoritative input."
---

<objective>
Resolve every open Scope-2 wayfinder ticket (#9-#15) and author the pure capability domain model (closed kind enum, discriminated descriptor union, five trust-state labels, the transition oracle, and the ae-endpoint-check:v1 facet evaluator) with no schema, Convex, or network code yet.

Purpose: settle the seven pre-implementation questions and lay a deep, testable capability seam so 02-02/02-03/02-04 build on decided inputs.
Output: capabilities module public seam + two pure internal files, unit + type tests, and seven closed tickets with map-issue #1 updated.
</objective>

<context>
@.planning/adr/ADR-002-capability-registry-agent-native-supply.md
@.planning/ENGINEERING-STANDARDS.md
@AGENTS.md
@.planning/ROADMAP.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/ARCHITECTURE.md
@src/modules/discovery/public.ts
@src/modules/catalog/internal/catalog-model.ts
@src/modules/common/result.ts
@convex/crons.ts
</context>

<preflight_gates>
- Scope 1 must be complete: deployed env, canonical base-URL helper, and authz tokenIdentifier canonicalization landed. This plan writes no route/Convex code, so it may proceed on source before Scope 1 fully closes, but 02-02+ must not begin until Scope 1 is green.
- Ticket "Resolve Convex-safe external-fetch path for capability checks (#9)" blocks the freshness/timeout constants in "Tune ae-endpoint-check:v1 freshness windows and timeouts (#14)"; resolve #9 first.
- Ticket "Prototype domain-control proof for business_endpoint admission (#10)" blocks "Decide agent-operation disclosure proof bar (#13)"; resolve #10 first.
- Empirical re-tuning of freshness windows in #14 against real agent-native origins requires deployed candidate origins; adopting the ADR draft windows as v1 constants is source-local, but the empirical re-tune stays a preflight gate for 02-03.
</preflight_gates>

<standards>
Binds these ENGINEERING-STANDARDS.md / AGENTS.md rules to this plan's files:
- TypeScript hard spec: no `any`/`as any`/`as unknown as`/non-null; no TS `enum`; exact unions from `as const` value arrays; discriminated result unions for expected failures; `satisfies Record<Union,...>` for any label/transition map.
- Validator/source-of-truth pattern: `capabilities/public.ts` owns `BusinessCapabilityKindValues`, `CapabilityTrustStateValues`, and the check-standard version as exported `as const` arrays/constants; no global validators dumping ground.
- Module/interface rules (codebase-design): `public.ts` is the only cross-module seam; the transition + facet logic lives in `internal/` behind it; tests exercise behavior through the seam.
- Boundary posture (AGENTS.md): internal enum names may use `capability`/`endpoint`; NO public human copy is produced in this plan.
- `/ponytail full`: no schema/table, no Convex runtime, no adapter-for-later in this plan — pure model only; delete any speculative field not required by D1/D3/D4/D6.
</standards>

<antipatterns>
Relapses this plan could cause and the gate that catches each:
- Generic/open capability kind or an `other` slug (bloat detector "one-implementation adapter for later", ROADMAP.md:234; P6 `other` ban :224) -> `tests/types/capability-contracts.test.ts` asserts the union is exactly the four kinds and an invalid kind fails to compile.
- Wide optional columns instead of a discriminated descriptor (D3) -> type test asserts each descriptor variant carries only its own fields; a cross-kind field fails to compile.
- Emitting `verified` as a trust state (AGENTS.md:17-19) -> value-array test asserts `verified` is absent from `CapabilityTrustStateValues`.
- Local-services shape leaking into the model (standing wedge veto, D11) -> model test asserts descriptors carry no serviceArea/suburb/hours/urgency/emergency fields.
- Throwing for expected check failures instead of a result union (CONVENTIONS.md error handling) -> facet evaluator returns a discriminated facet-result union; test covers each branch.
</antipatterns>

<skill_usage>
- `domain-modeling` + `codebase-design`: shape the capability seam as a deep module — small public surface (value arrays + contract types), the transition oracle and facet evaluator hidden in `internal/`, tests through the seam. This is the "Module/interface design -> codebase-design" row of the standards table.
- `convex-best-practices`: even though no Convex code lands here, keep the value arrays runtime-safe so 02-02 can convert them via the `literalUnion` helper without rework.
- `tdd`: author `capability-model.test.ts` / `check-standard.test.ts` / `capability-contracts.test.ts` first (red), then implement.
- `grilling`: use the grilling posture to write the resolution rationale for the four grilling tickets (#11, #12, #13, #15) — force the strongest counter-argument before recording each decision.
- `ponytail`: `/ponytail full` posture on every file — smallest model that satisfies D1/D3/D4/D6.
</skill_usage>

<how_to_execute>
Fresh session: read `.planning/scopes/scope-02-capability-registry/SCOPE-02-INDEX.md`, then execute this plan's tasks in order. Load skills first: `domain-modeling`, `codebase-design`, `tdd`, `ponytail`, `grilling`. TDD where marked. Run each task's `<verify>` before moving on. On completion write the SUMMARY.md named in `<output>`.
</how_to_execute>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve the check-engine runtime + freshness tickets (#9, #14)</name>
  <files>(no source edits; investigation + GitHub ticket writes)</files>
  <read_first>.planning/adr/ADR-002-capability-registry-agent-native-supply.md (D5,D6,D7), convex/crons.ts, src/modules/discovery/internal/manifest-attempts.ts, convex/_generated/ai/guidelines.md</read_first>
  <action>Resolve "Resolve Convex-safe external-fetch path for capability checks (#9)": document the runtime split — cron -> internal Convex action (node runtime: fetch + per-request timeout + TLS validation + max body size + GET/HEAD only + redirect policy) -> mutation (persist attempt + trust transition), with the pure transition function as the reconstruction oracle; specify SSRF/egress hardening (host allowlist bound to the business's claimed origin, blocked private/link-local IP ranges) and confirm Convex scheduler + `retryAfter` express backoff without a bespoke queue. Then resolve "Tune ae-endpoint-check:v1 freshness windows and timeouts (#14)" (blocked_by #9): adopt the ADR D6 draft windows (informational_page 24h, inquiry_intake 24h, business_endpoint 1h, action_card not cron-checked) as v1 constants, set a v1 reachability timeout, max retry count, and backoff curve, and RECORD that empirical re-tune against real agent-native origins is a 02-03 preflight gate requiring deployed candidate origins (do not claim measurement not performed). For each ticket: post a resolution comment capturing the decision + rationale, close the issue, and append one line to the wayfinder map issue #1 "Decisions so far".</action>
  <verify>gh issue view 9 --json state -q .state | grep -qi closed && gh issue view 14 --json state -q .state | grep -qi closed</verify>
  <acceptance_criteria>
    - #9 records the cron->action->mutation split, SSRF/egress hardening rules, and backoff-via-scheduler confirmation.
    - #14 records v1 window/timeout/retry/backoff constants and flags empirical re-tune as a deployed preflight gate.
    - Both issues closed; map issue #1 has one appended decision line each.
  </acceptance_criteria>
  <done>The check-engine runtime path and freshness constants are decided and recorded as authoritative inputs for 02-03.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Resolve the trust/admission grilling tickets (#10, #11, #13)</name>
  <files>(no source edits; investigation + GitHub ticket writes)</files>
  <read_first>.planning/adr/ADR-002-capability-registry-agent-native-supply.md (D5,D6,D10), AGENTS.md, src/modules/discovery/internal/ucp-manifest.ts (safePublicText), src/modules/business/internal/claim.ts</read_first>
  <action>Resolve "Prototype domain-control proof for business_endpoint admission (#10)": compare DNS TXT challenge vs signed token at `/.well-known/ae-challenge` vs reusing the claim-flow evidence; choose the strongest that fits the no-ABN low-friction posture; define its failure/expiry semantics, re-verification cadence, and how loss of control degrades the capability trust state; state where it slots into the claim/publish flow. Then "Settle contradiction precedence: AE-held facts vs business manifest (#11)": define the per-field precedence matrix (hard-contradiction fields where AE-held state wins -> `contradicted` + owner re-confirm, vs soft-refresh fields), the contradiction-clear path, and the guard against a compromised origin silently rewriting AE facts. Then "Decide agent-operation disclosure proof bar (#13)" (blocked_by #10): decide whether `agent_operated` stays self-declared `business_supplied` or requires evidence (e.g. a checked `business_endpoint`), and the boundary-honest public copy that never implies autonomy AE cannot back and never implies AE transacts. For each: resolution comment, close, one appended line to map issue #1.</action>
  <verify>gh issue view 10 --json state -q .state | grep -qi closed && gh issue view 11 --json state -q .state | grep -qi closed && gh issue view 13 --json state -q .state | grep -qi closed</verify>
  <acceptance_criteria>
    - #10 names the chosen domain-control proof, its expiry/failure semantics, and its slot in claim/publish.
    - #11 records the per-field contradiction precedence matrix + clear path + compromised-origin guard.
    - #13 records the disclosure proof bar and the boundary-honest copy rule; all three closed with map lines.
  </acceptance_criteria>
  <done>Endpoint admission, contradiction precedence, and agent-operation disclosure are decided for 02-03 (#10,#11) and 02-04 (#13).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Resolve the model-shape grilling tickets (#12, #15)</name>
  <files>(no source edits; investigation + GitHub ticket writes)</files>
  <read_first>.planning/adr/ADR-002-capability-registry-agent-native-supply.md (D1,D2,D8), src/modules/catalog/internal/catalog-model.ts, src/modules/registry/registry.actions.ts</read_first>
  <action>Resolve "Decide capability-table naming and serviceCapabilities fold path (#12)": decide the v1 naming for the two `capabilit*` tables (keep both / rename one) and a go/no-go on a later fold of `serviceCapabilities` into the `inquiry_intake` descriptor, with the trigger condition, weighed against zero-public-breakage (Q7) and the wedge veto. Resolve "Define locality x capability filter composition for registry.search (#15)": decide how `capability` composes with `mode: near_me|whole_catalogue` + `location` for non-local kinds (e.g. `business_endpoint` implies whole_catalogue, or locality becomes soft rank, or near_me is ignored for non-local kinds) while staying backward-compatible with agentJson/http callers and the agentTools snapshot. For each: resolution comment, close, one appended line to map issue #1.</action>
  <verify>gh issue view 12 --json state -q .state | grep -qi closed && gh issue view 15 --json state -q .state | grep -qi closed</verify>
  <acceptance_criteria>
    - #12 records the v1 table naming decision and the fold go/no-go + trigger.
    - #15 records the filter-composition rule and its DTO/agentTools contract effect.
    - Both closed; map issue #1 has an appended decision line each.
  </acceptance_criteria>
  <done>Table naming and search-filter composition are decided as inputs for 02-02 (#12) and 02-04 (#15).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Author the pure capability domain model + check-standard evaluator</name>
  <files>src/modules/capabilities/public.ts, src/modules/capabilities/internal/capability-model.ts, src/modules/capabilities/internal/check-standard.ts, tests/unit/capabilities/capability-model.test.ts, tests/unit/capabilities/check-standard.test.ts, tests/types/capability-contracts.test.ts</files>
  <read_first>resolution of #11, resolution of #14, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D1,D3,D4,D6), src/modules/discovery/public.ts, src/modules/common/result.ts, .planning/codebase/CONVENTIONS.md</read_first>
  <action>In `public.ts` export `BusinessCapabilityKindValues = ['informational_page','inquiry_intake','business_endpoint','action_card'] as const` (+ type), `CapabilityTrustStateValues = ['business_supplied','checked','stale','contradicted','unsupported'] as const` (+ type), the `AeEndpointCheckStandardVersion = 'ae-endpoint-check:v1'` constant, and the discriminated `CapabilityDescriptor` contract union (informational_page {publicUrl}; inquiry_intake {serviceId?, firstRequestMode, publicChannel} reusing catalog enums; business_endpoint {originUrl, manifestUrl, schemaRef}; action_card {actionSlug, cardRef}). In `internal/check-standard.ts` implement pure facet evaluators (reachability, schema conformance, freshness, contradiction) returning a discriminated facet-result union, with the per-kind freshness windows/timeout/backoff constants from the #14 resolution and the contradiction precedence from the #11 resolution. In `internal/capability-model.ts` implement the pure `computeCapabilityTrustState(...)` transition oracle mapping facet results -> trust state (all pass+fresh->checked; window exceeded->stale; reachability/schema fail after backoff->unsupported; contradiction->contradicted; never checked->business_supplied), plus descriptor constructors. Use `satisfies Record<...>` for any facet/state map.</action>
  <verify>npx vitest run tests/unit/capabilities tests/types/capability-contracts.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - The kind and trust-state unions are exactly the closed sets from D1/D4; `verified` is absent; invalid kinds/states fail to compile.
    - The descriptor union is discriminated by kind with no wide optional columns; cross-kind fields fail to compile.
    - `computeCapabilityTrustState` covers every D6 mapping branch and is deterministic (same inputs -> same state).
    - Facet evaluators return a typed result union and never throw for expected check outcomes.
  </acceptance_criteria>
  <done>A deep, tested pure capability seam exists for 02-02/02-03/02-04 to build on.</done>
</task>

</tasks>

<verification>
- [ ] gh issue view 9/10/11/12/13/14/15 all report state closed
- [ ] wayfinder map issue #1 "Decisions so far" has one appended line per resolved ticket
- [ ] npx vitest run tests/unit/capabilities tests/types/capability-contracts.test.ts
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
</verification>

<success_criteria>
- All seven Scope-2 tickets resolved, commented, closed, and reflected in map issue #1.
- The pure capability model (closed enum, discriminated descriptor, five trust states, transition oracle, facet evaluator) compiles and is unit + type tested.
- No schema, Convex, route, or public-copy code was introduced; `verified` is never emitted.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-02-capability-registry/02-01-SUMMARY.md` stating: tickets resolved (7/7), the model seam files, source/local proof only, production proof not claimed.
</output>
