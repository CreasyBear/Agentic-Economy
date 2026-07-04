---
phase: scope-02-capability-registry
plan: "02-04"
type: execute
wave: 4
depends_on: ["02-01", "02-02", "02-03"]
files_modified:
  - src/modules/registry/registry.actions.ts
  - src/modules/registry/public.ts
  - src/modules/registry/registry.functions.ts
  - convex/registry.ts
  - src/modules/business/internal/schema.ts
  - src/modules/business/public.ts
  - src/modules/discovery/internal/ucp-manifest.ts
  - src/modules/discovery/internal/discovery-files.ts
  - src/lib/ui/contract-scans.ts
  - tests/unit/registry/capability-filter.test.ts
  - tests/copy/scope2-capability-copy.test.ts
  - tests/seo/capability-discovery.test.ts
  - tests/integration/agent-tools-snapshot.test.ts
autonomous: true
requirements: [D6, D8, D10]
user_setup: []
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s2-search-additive
      statement: "registry.search gains an OPTIONAL capability filter and the DTO gains a business-grain capabilities[] array; both additive, kind/status stay z.string(), output keeps passthrough, existing agentJson/http/agentTools callers are unaffected."
    - id: s2-agenttools-deliberate
      statement: "The agentTools snapshot is updated in one deliberate commit that the snapshot test verifies, not drifted."
    - id: s2-operation-mode-orthogonal
      statement: "operationMode (human_operated|agent_operated|hybrid) is an orthogonal business disclosure, business_supplied trust, never a fifth capability kind and never implying AE transacts."
    - id: s2-machine-surface-pins
      statement: "llms.txt/UCP add a per-business capability summary via safePublicText with callable:false/paymentRequired:false pinned; human copy maps kinds to plain labels."
    - id: s2-copy-green-zero-allowances
      statement: "Public human copy uses no banned words (capability/endpoint/manifest/gateway/operator/callable/autonomous/agent-native/verified) and trust labels stay the PRODUCT.md facts; copy scans pass with zero new allowances."
  artifacts:
    - path: src/modules/registry/registry.actions.ts
      provides: "Optional capability filter param and business-grain capabilities[] in the search DTO/outputSchema."
    - path: src/modules/discovery/internal/ucp-manifest.ts
      provides: "Per-business capability summary on machine surfaces with negative-capability flags pinned."
    - path: tests/copy/scope2-capability-copy.test.ts
      provides: "Copy scan proving plain labels on human surfaces and banned-word rejection with zero new allowances."
  key_links:
    - from: capability filter param
      to: agentTools snapshot
      via: "the additive optional param is reflected in the deliberately-updated agentTools snapshot test."
    - from: businessCapabilities trust state
      to: human plain label
      via: "a satisfies Record<Kind|TrustState,string> label map projects internal enums to PRODUCT.md-legal copy."
---

<objective>
Expose the capability model on read surfaces without breaking any consumer: an optional `capability` filter on registry.search + a business-grain `capabilities[]` DTO (additive, passthrough-safe), the orthogonal `operationMode` disclosure, per-business capability summaries on llms.txt/UCP with negative flags pinned, and copy/SEO scans proving plain human labels with zero new allowances.

Purpose: make capability sets and trust states discoverable and boundary-honest across human, JSON, discovery, and agent surfaces.
Output: search/DTO/discovery/disclosure code, a deliberate agentTools snapshot update, and copy/SEO/filter tests.
</objective>

<context>
@.planning/adr/ADR-002-capability-registry-agent-native-supply.md
@AGENTS.md
@.planning/SEO-AEO-SPEC.md
@.planning/GTM-READINESS.md
@.planning/codebase/CONVENTIONS.md
@src/modules/registry/registry.actions.ts
@src/modules/registry/public.ts
@src/modules/discovery/internal/ucp-manifest.ts
@src/modules/business/internal/schema.ts
@src/lib/ui/contract-scans.ts
@src/modules/capabilities/public.ts
</context>

<preflight_gates>
- Requires 02-01 (model + resolution of #13, #15), 02-02 (tables + backfill), 02-03 (trust states populated by the engine).
- Named gate — "Define locality x capability filter composition for registry.search (#15)": the filter-composition rule (how capability composes with mode/location for non-local kinds) comes from #15; keep it backward-compatible with agentJson/http callers and the agentTools snapshot.
- Named gate — "Decide agent-operation disclosure proof bar (#13)": operationMode public copy and its proof bar come from #13; agent_operated stays business_supplied unless #13 required evidence.
- No public claim of booking/payment/dispatch/autonomous fulfillment; `verified` never appears unqualified; deployed public launch of these surfaces remains gated by Scope 1 / GTM readiness (production_executable false).
</preflight_gates>

<standards>
- Route/server-function boundary: registry.search stays an action with a strict `.inputValidator`; the new param is optional; output keeps the exported DTO/result union with `.passthrough()`; routes import only the module seam.
- Convex standards: the DTO builder in convex/registry.ts reads indexed capability rows (by_business/by_business_status); public queries return allowlisted DTOs only.
- UCP/discovery standard (AGENTS.md, AI-SPEC): machine surfaces pin `callable:false`/`paymentRequired:false`, pass owner text through `safePublicText`, every advertised URL route-tests or is omitted; `llms.txt` is a truth file, not authorization.
- Boundary posture (AGENTS.md:90-92): NO public human copy uses `capability`/`endpoint`/`manifest`/`gateway`/`operator`/`MCP`/`OpenAPI`/`callable`/`autonomous`/`agent-native`/`verified`; map kinds to plain labels ("Read business details", "Send an inquiry", "This business publishes machine-readable details", "Operated by an automated system"); trust states use PRODUCT.md labels only.
- TypeScript hard spec: `satisfies Record<Kind|TrustState,string>` for the label/copy projection; no broad string statuses; exact DTO returns; no literal widening in route loaders.
- `/ponytail full`: additive-only — no new action, no new route, no bespoke UI primitive; reuse the existing registry/discovery seams and Astryx surfaces.
</standards>

<antipatterns>
- Making the capability filter required or changing kind/status to enums (breaks callers, D8) -> `tests/unit/registry/capability-filter.test.ts` asserts existing callers pass with no capability param and kind/status remain z.string() with passthrough output.
- Undocumented agentTools snapshot drift (Scope 1 concern) -> `tests/integration/agent-tools-snapshot.test.ts` fails unless the snapshot is deliberately regenerated in this commit.
- operationMode as a fifth capability kind or upgrading trust (D10) -> type test asserts BusinessCapabilityKindValues is unchanged (still four) and operationMode is a separate business field with business_supplied trust.
- Banned public words / `verified` / protocol vocabulary on human surfaces (AGENTS.md, DESIGN.md §8/§13) -> `tests/copy/scope2-capability-copy.test.ts` + existing `test:copy` scans reject them; zero new allowances added to the claims register.
- Money-rail/provider fields on the business row via operationMode (money-rail quarantine :201) -> the wedge/quarantine scan from 02-02 stays green; operationMode carries no provider/payment data.
- A machine surface advertising a URL that is not route-tested (UCP standard) -> SEO test asserts every advertised capability URL route-tests or is omitted; callable:false/paymentRequired:false pinned.
</antipatterns>

<skill_usage>
- `tanstack-start-best-practices` + `tanstack-router-best-practices`: keep registry.search's input validator + DTO union exact and additive; routes remain thin adapters.
- `convex-best-practices` + `convex-performance-audit`: read capability rows through the D2 indexes; keep the DTO builder bounded.
- `seo-audit` + `ai-seo` + `schema`: add the per-business capability summary to llms.txt/UCP as a truth projection with negative-capability flags; ensure crawl/schema/URL contracts hold.
- `product-design` + `impeccable` + `make-interfaces-feel-better`: if any human surface renders capability/trust labels, use Astryx primitives + plain PRODUCT.md copy — no bespoke Ae*/CSS, no protocol vocabulary.
- `code-review` (Standards + Spec axes): review the additive-vs-breaking contract and the copy/boundary posture before finalizing the deliberate agentTools snapshot.
- `tdd`: filter-composition, copy scan, SEO, and snapshot tests first.
- `ponytail`: `/ponytail full` — additive only; delete any surface not required by D6/D8/D10.
</skill_usage>

<how_to_execute>
Fresh session: read `.planning/scopes/scope-02-capability-registry/SCOPE-02-INDEX.md`, then execute this plan's tasks in order. Load skills first: `tanstack-start-best-practices`, `convex-best-practices`, `seo-audit`, `ai-seo`, `schema`, `product-design`, `tdd`, `ponytail`. TDD where marked. Run each `<verify>` before moving on. On completion write the SUMMARY.md named in `<output>`.
</how_to_execute>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Optional capability filter + business-grain capabilities[] DTO + deliberate agentTools snapshot</name>
  <files>src/modules/registry/registry.actions.ts, src/modules/registry/public.ts, src/modules/registry/registry.functions.ts, convex/registry.ts, tests/unit/registry/capability-filter.test.ts, tests/integration/agent-tools-snapshot.test.ts</files>
  <read_first>resolution of #15, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D8), src/modules/registry/registry.actions.ts, src/modules/registry/public.ts, convex/registry.ts</read_first>
  <action>Add an OPTIONAL `capability` param to `registrySearchInputSchema` and compose it with `mode`/`location` per the #15 resolution (e.g. business_endpoint implies whole_catalogue / near_me ignored for non-local kinds / locality soft-rank). Add a business-grain `capabilities[]: { kind, status }` array to the search/detail DTO with `kind`/`status` as `z.string()` and output keeping `.passthrough()` (additive; existing values unaffected). Build the DTO in `convex/registry.ts` by reading `businessCapabilities` via the by_business/by_business_status indexes. Regenerate and commit the agentTools snapshot deliberately so `tests/integration/agent-tools-snapshot.test.ts` reflects the new optional param. Test: existing callers with no capability param behave identically; a capability filter narrows results per #15; kind/status stay strings with passthrough.</action>
  <verify>npx vitest run tests/unit/registry/capability-filter.test.ts && npm run test:integration && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - The capability param is optional and composes with mode/location per #15; no existing caller breaks.
    - The DTO exposes capabilities[] additively; kind/status remain z.string() with passthrough output.
    - The agentTools snapshot is updated in this one commit and the snapshot test passes.
  </acceptance_criteria>
  <done>Capability sets are filterable and readable through the registry action without consumer breakage.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: operationMode orthogonal disclosure + machine-surface capability summary</name>
  <files>src/modules/business/internal/schema.ts, src/modules/business/public.ts, src/modules/discovery/internal/ucp-manifest.ts, src/modules/discovery/internal/discovery-files.ts, tests/seo/capability-discovery.test.ts</files>
  <read_first>resolution of #13, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D6,D10), src/modules/business/internal/schema.ts, src/modules/discovery/internal/ucp-manifest.ts, AGENTS.md</read_first>
  <action>Add `OperationModeValues = ['human_operated','agent_operated','hybrid'] as const` (+ type + schema) to `business/public.ts` and an optional `operationMode` field to the `businesses` row in `business/internal/schema.ts` (business_supplied trust; NOT a capability kind; per #13 proof bar). Add a per-business capability summary to the machine surfaces (`ucp-manifest.ts` + `discovery-files.ts` for llms.txt): each capability's plain label + trust state through `safePublicText`, with `callable:false`/`paymentRequired:false` pinned and no `verified`. Ensure operationMode surfaces on machine outputs as a factual disclosure ("operated by an automated system") that never implies AE transacts. Test (SEO): every advertised capability URL route-tests or is omitted; negative flags pinned; no banned public words on the machine summary.</action>
  <verify>npx vitest run tests/seo/capability-discovery.test.ts && npm run check:convex-codegen && npm run test:seo && npm run typecheck</verify>
  <acceptance_criteria>
    - operationMode is a separate business field with business_supplied trust; BusinessCapabilityKindValues stays exactly four.
    - llms.txt/UCP show a per-business capability summary with callable:false/paymentRequired:false pinned and no verified.
    - Every advertised capability URL route-tests or is omitted.
  </acceptance_criteria>
  <done>Agent operation and capability sets are disclosed honestly on machine surfaces without upgrading trust or implying transaction.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Human plain-label projection + copy/source scans (zero new allowances)</name>
  <files>src/lib/ui/contract-scans.ts, src/modules/registry/public.ts, tests/copy/scope2-capability-copy.test.ts</files>
  <read_first>.planning/adr/ADR-002-capability-registry-agent-native-supply.md (boundary posture), AGENTS.md, .planning/GTM-READINESS.md, src/lib/ui/contract-scans.ts, tests/copy/claims-register.test.ts</read_first>
  <action>Add a `satisfies Record<BusinessCapabilityKind, string>` and `satisfies Record<CapabilityTrustState, string>` plain-label projection (PRODUCT.md-legal copy: "Read business details" / "Send an inquiry" / "This business publishes machine-readable details" / "Operated by an automated system"; trust: "supplied" / "checked" / "last checked" / "needs confirmation" / withheld). Extend `contract-scans.ts` so the copy scan rejects the banned public words (capability/endpoint/manifest/gateway/operator/callable/autonomous/agent-native/verified) in any Scope-2 human surface context and rejects `verified` as an unqualified trust label. Add `tests/copy/scope2-capability-copy.test.ts` proving the plain labels pass and the internal enum words fail on human surfaces. Add NO new positive allowance to the claims register.</action>
  <verify>npx vitest run tests/copy/scope2-capability-copy.test.ts && npm run test:copy && npm run test:ui-contract && npm run typecheck</verify>
  <acceptance_criteria>
    - The kind/trust label maps are exhaustive (satisfies Record over both unions).
    - Banned public words and unqualified `verified` fail the copy scan on human surfaces.
    - test:copy + test:ui-contract green with zero new positive allowances in the claims register.
  </acceptance_criteria>
  <done>Human surfaces speak plain PRODUCT.md language; the boundary vocabulary stays machine-only and scan-enforced.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/registry/capability-filter.test.ts tests/copy/scope2-capability-copy.test.ts tests/seo/capability-discovery.test.ts
- [ ] npm run test:integration
- [ ] npm run test:copy
- [ ] npm run test:seo
- [ ] npm run test:ui-contract
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npm run check:convex-codegen
</verification>

<success_criteria>
- registry.search + DTO changes are additive and passthrough-safe; no agentJson/http/agentTools caller breaks; the agentTools snapshot is updated deliberately.
- operationMode is an orthogonal business_supplied disclosure, never a capability kind, never implying AE transacts.
- llms.txt/UCP carry a boundary-honest per-business capability summary with negative flags pinned; every advertised URL route-tests or is omitted.
- Copy/SEO/UI-contract scans pass with zero new allowances; `verified` never appears unqualified; production public launch of these surfaces stays Scope-1/GTM gated (production proof not claimed).
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-02-capability-registry/02-04-SUMMARY.md` stating: search/DTO/discovery/disclosure/copy landed, source/local proof only, public launch of these surfaces remains deployed/GTM gated and production proof is not claimed.
</output>
