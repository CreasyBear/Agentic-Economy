---
phase: scope-02-capability-registry
plan: "02-03"
type: execute
wave: 3
depends_on: ["02-01", "02-02"]
files_modified:
  - src/modules/capabilities/internal/ingest-manifest.ts
  - src/modules/capabilities/internal/check-standard.ts
  - src/modules/capabilities/internal/capability-model.ts
  - src/modules/capabilities/capabilities.functions.ts
  - src/modules/capabilities/public.ts
  - convex/capabilities.ts
  - convex/capabilityCheck.ts
  - convex/crons.ts
  - tests/unit/capabilities/ingest-manifest.test.ts
  - tests/unit/capabilities/check-engine.test.ts
  - tests/deploy-smoke/scope2-capability-check-smoke.spec.ts
  - package.json
autonomous: true
requirements: [D5, D6, D7]
user_setup:
  - "Live business-origin fetch + the hourly recheck cron require a deployed/dev Convex deployment with node-action fetch enabled and a host allowlist configured. The fail-loud smoke stays red until that deployed evidence exists."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s2-ingest-checked-not-authority
      statement: "Business-origin manifests are ingested as checked input, not authority: strict-parse (no passthrough), all owner text through safePublicText, trust/capability claims stripped and pinned false, URLs host-allowlisted, read+describe only."
    - id: s2-runtime-split
      statement: "The fetch path is cron -> internal Convex node action (fetch+timeout+TLS+SSRF guard, GET/HEAD only) -> mutation (persist attempt + trust transition); the pure transition function is the reconstruction oracle."
    - id: s2-endpoint-standard
      statement: "ae-endpoint-check:v1 evaluates reachability/schema/freshness/contradiction and maps to checked/stale/contradicted/unsupported/business_supplied; a forbidden claim (callable/paymentRequired/verified/price) is a schema FAIL."
    - id: s2-degrade-visibly
      statement: "Backoff exhaustion degrades to unsupported and staleness degrades to stale; failures surface to owner health + operator admin, redacted, never public."
    - id: s2-check-smoke-fail-loud
      statement: "The capability-check smoke fails loudly without deployed base URL, host allowlist, and real attempt/facet/trust-state evidence, and cannot count as external proof unless it passes."
  artifacts:
    - path: src/modules/capabilities/internal/ingest-manifest.ts
      provides: "Strict-parse ae-ucp:v1 ingestion with claim-stripping, safePublicText, and host-allowlist checks."
    - path: convex/capabilityCheck.ts
      provides: "Internal node action performing the hardened fetch and handing facet inputs to the transition mutation."
    - path: tests/deploy-smoke/scope2-capability-check-smoke.spec.ts
      provides: "Fail-loud deployed check smoke that refuses to count absent evidence as proof."
  key_links:
    - from: internal fetch action
      to: trust-state mutation
      via: "action returns facet inputs; mutation calls computeCapabilityTrustState and persists the attempt + new trustState under capability_check scope."
    - from: cron selector
      to: due capabilities
      via: "crons.interval selects capabilityCheckAttempts/businessCapabilities with staleThresholdAt <= now and enqueues a check."
---

<objective>
Build the ae-endpoint-check:v1 check engine: hardened business-origin ingestion (checked input, never authority), the cron -> node-action -> mutation runtime split, the four-facet evaluation feeding the pure trust-state transition, backoff/degradation, redacted owner+operator surfacing, and a fail-loud deployed smoke.

Purpose: make per-capability trust states first-class so staleness/contradiction visibly degrade a listing (the Scope 2 "Done" criterion).
Output: ingestion + engine + cron code, unit tests for the pure paths, and a fail-loud provider-style smoke.
</objective>

<context>
@.planning/adr/ADR-002-capability-registry-agent-native-supply.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/SECURITY-SPEC.md
@.planning/codebase/CONVENTIONS.md
@src/modules/discovery/internal/ucp-manifest.ts
@src/modules/discovery/internal/manifest-attempts.ts
@convex/crons.ts
@convex/capabilities.ts
@src/modules/capabilities/public.ts
@tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts
</context>

<preflight_gates>
- Requires 02-01 (pure model + facet evaluator + resolution of #9, #11, #14) and 02-02 (tables + capability_check scope).
- Named gate — "Resolve Convex-safe external-fetch path for capability checks (#9)": the cron->action->mutation split and SSRF/egress hardening rules from #9 are the authoritative runtime contract for this plan; do not invent a different split.
- Named gate — "Tune ae-endpoint-check:v1 freshness windows and timeouts (#14)": use the v1 window/timeout/retry/backoff constants from #14; empirical re-tune against real agent-native origins requires deployed candidate origins and stays a follow-up gate.
- Named gate — "Settle contradiction precedence: AE-held facts vs business manifest (#11)": facet (d) contradiction uses the #11 per-field precedence matrix.
- Named gate — "Prototype domain-control proof for business_endpoint admission (#10)": a `business_endpoint` capability may only be admitted for a claimed business whose origin passed the #10 domain-control proof; the host allowlist is bound to that proven origin.
- Live fetch + the hourly cron require a deployed/dev Convex deployment with node-action egress + host allowlist; the smoke is red until that deployed evidence exists. This plan's production_executable is false.
</preflight_gates>

<standards>
- UCP/discovery standard + injection precedent (src/modules/discovery/internal/ucp-manifest.ts): reuse `safePublicText` (NFKC, strip bidi/control, neutralize javascript:/"ignore previous instructions"/markdown/"endpoint"/"verified/callable/payable"); pin `callable:false`/`paymentRequired:false`; strict-parse with NO `.passthrough()` on ingest.
- Convex standards: node action isolates external fetch (actions never touch the DB directly); mutation validates input and derives actor; retryable attempts carry a durable idempotency key; consequential transitions write typed audit; indexed selection for the cron.
- Side-effect/outbox standard: every check attempt is a durable attempt row with retryCount/retryAfter/lastError*; every failed/stale readback has a repairAction or explicit no_repair; readback alone is insufficient.
- Admin/security standard + cso lens: SSRF hardening (host allowlist bound to the claimed/proven origin, blocked private/link-local ranges, redirect policy, per-request timeout, max body size, GET/HEAD only); failure messages redacted; never public.
- Boundary posture (AGENTS.md): a `checked` business_endpoint means AE fetched + schema-checked it (GET/HEAD), NOT that AE executes against it — read+describe only, never proxy/execute; `verified` is never emitted.
- `/ponytail full`: reuse the discovery attempt/repair/cron substrate; add no bespoke queue — express backoff via the Convex scheduler + retryAfter.
</standards>

<antipatterns>
- Treating the business manifest as authoritative / rewriting AE facts (ADR alternatives, ROADMAP.md:18) -> ingestion pins claims false and only raises/lowers trust state; test asserts a manifest declaring callable:true/paymentRequired:true/verified/price yields a schema FAIL, never an AE fact overwrite.
- Proxying/executing against the endpoint (five-scopes boundary) -> engine issues GET/HEAD only; test asserts no non-idempotent method and no response body is republished (only hash + facet results, per the ADR "cache body?" fog left to a later decision).
- Best-effort fetch without attempt/repair (ROADMAP.md:238) -> every fetch writes a durable attempt; backoff exhaustion sets repairAction:no_repair and degrades trustState to unsupported.
- Leaking raw provider/origin errors publicly (CONVENTIONS.md error handling) -> failures surface via failureCode + failureMessageRedacted to owner health + operator admin only.
- Emitting `verified` or public architecture words -> trust-state labels stay the five PRODUCT.md facts; no public copy is produced here (public labels land in 02-04).
- A silently-skipping smoke that fakes deployed proof (theatre detector) -> the smoke fails loudly listing every missing input and cannot count as external proof unless it passes with real evidence.
</antipatterns>

<skill_usage>
- `convex-cron-jobs`: add the hourly `crons.interval('recheck due business capabilities', { hours: 1 }, ...)` selecting `staleThresholdAt <= now`; express backoff via scheduler + retryAfter, no bespoke queue.
- `convex-functions`: implement the internal node action (fetch) + the transition mutation with argument validators and server-derived actor; keep DB access out of the action.
- `convex-security-audit` + `security-threat-model` + `cso` lens: threat-model the manifest fetch as the highest-value injection/SSRF surface; enforce host allowlist, blocked ranges, redirect/timeout/size limits, GET/HEAD only.
- `security-best-practices`: strict-parse (no passthrough), claim-stripping, `safePublicText` on all owner text, redaction of failure messages.
- `codebase-design`: keep facet evaluation + transition pure (02-01 seam), the fetch impure in the action, storage in Convex — one seam per concern.
- `tdd`: ingestion strip/parse tests + engine transition tests first; the live fetch/cron paths are exercised only by the deployed smoke.
- `ponytail`: `/ponytail full` — reuse the discovery attempt/repair/cron pattern verbatim in shape; no new primitive.
</skill_usage>

<how_to_execute>
Fresh session: read `.planning/scopes/scope-02-capability-registry/SCOPE-02-INDEX.md`, then execute this plan's tasks in order. Load skills first: `convex-cron-jobs`, `convex-functions`, `convex-security-audit`, `security-threat-model`, `codebase-design`, `tdd`, `ponytail`. TDD where marked. Run each `<verify>` before moving on. The live fetch/cron smoke stays red without deployed evidence — record that honestly. On completion write the SUMMARY.md named in `<output>`.
</how_to_execute>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hardened business-origin manifest ingestion (checked input, not authority)</name>
  <files>src/modules/capabilities/internal/ingest-manifest.ts, src/modules/capabilities/internal/check-standard.ts, src/modules/capabilities/public.ts, tests/unit/capabilities/ingest-manifest.test.ts</files>
  <read_first>resolution of #11, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D5,D6), src/modules/discovery/internal/ucp-manifest.ts, src/modules/discovery/internal/schema.ts</read_first>
  <action>Implement `parseBusinessOriginManifest(input, allowlistedOrigin)` in `internal/ingest-manifest.ts`: strict-parse the `ae-ucp:v1` schema family with NO `.passthrough()` (unknown fields dropped); run all owner free text through `safePublicText`; strip every trust/capability claim (callable/paymentRequired/verified/price/endpoint) and pin `callable:false`/`paymentRequired:false`; require endpoint + manifest URLs to be on the allowlisted origin (host allowlist), rejecting others; return a discriminated result union (parsed | rejected{reason}). Wire the schema-conformance and contradiction facets in `check-standard.ts` to consume the parsed manifest using the #11 precedence matrix (hard-contradiction fields -> contradicted; soft-refresh fields -> refresh). Export the ingestion + facet types from `public.ts`. Ingestion is data-only — never proxy/execute.</action>
  <verify>npx vitest run tests/unit/capabilities/ingest-manifest.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - A manifest with unknown fields drops them (strict-parse); owner text is safePublicText-cleaned.
    - A manifest asserting callable:true / paymentRequired:true / verified / price yields a schema FAIL and never overwrites AE facts.
    - Off-origin endpoint/manifest URLs are rejected; contradiction uses the #11 matrix.
  </acceptance_criteria>
  <done>AE ingests business-origin manifests as checked input with the injection surface hardened.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Check engine runtime split + trust-state transitions</name>
  <files>convex/capabilityCheck.ts, convex/capabilities.ts, src/modules/capabilities/capabilities.functions.ts, src/modules/capabilities/internal/capability-model.ts, tests/unit/capabilities/check-engine.test.ts</files>
  <read_first>resolution of #9, resolution of #14, resolution of #10, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D6,D7), convex/capabilities.ts, src/modules/discovery/internal/manifest-attempts.ts</read_first>
  <action>Implement the #9 runtime split: `convex/capabilityCheck.ts` internal node action performs the hardened fetch (per-request timeout, TLS validation, GET/HEAD only, redirect policy, max body size, host allowlist bound to the #10-proven origin, blocked private/link-local ranges) and returns facet inputs (never touching the DB). A mutation in `convex/capabilities.ts` receives facet inputs, calls the pure `computeCapabilityTrustState` oracle, persists the `capabilityCheckAttempts` row (attemptId idempotent, retryCount/retryAfter from #14 backoff, failureCode/failureMessageRedacted, latestReadback, repairAction) and updates `businessCapabilities.trustState` under the `capability_check` scope, writing a typed audit event. Backoff exhaustion -> repairAction:no_repair -> trustState:unsupported; window exceeded -> stale. Add owner-health + operator-admin readback helpers in `capabilities.functions.ts` (redacted). Test the pure transitions across all D6 branches with fixture facet inputs (the live fetch is covered only by the smoke).</action>
  <verify>npx vitest run tests/unit/capabilities/check-engine.test.ts && npm run check:convex-codegen && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - The action never accesses the DB; the mutation persists attempt + transition under capability_check; idempotent on attemptId.
    - All D6 transition branches (checked/stale/contradicted/unsupported/business_supplied) are covered by unit tests over the pure oracle.
    - Backoff exhaustion degrades to unsupported with repairAction:no_repair; readbacks are redacted.
  </acceptance_criteria>
  <done>The engine computes and persists per-capability trust states via a clean action/mutation split with the pure oracle as reconstruction source.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Hourly recheck cron + fail-loud deployed smoke</name>
  <files>convex/crons.ts, convex/capabilities.ts, tests/deploy-smoke/scope2-capability-check-smoke.spec.ts, package.json</files>
  <read_first>resolution of #14, .planning/adr/ADR-002-capability-registry-agent-native-supply.md (D7), convex/crons.ts, tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts</read_first>
  <action>Add `crons.interval('recheck due business capabilities', { hours: 1 }, internal.capabilities.<selector>, {})` selecting `businessCapabilities`/`capabilityCheckAttempts` with `staleThresholdAt <= now` (indexed, bounded) and enqueuing a check per due capability via the Convex scheduler. Add `npm run test:provider-smoke:capability-check` running `tests/deploy-smoke/scope2-capability-check-smoke.spec.ts`. The smoke must FAIL LOUDLY listing every missing input when the deployed base URL, host allowlist config, a seeded agent-operated demo business, a real attempt row, facet results, and a resulting trust state are absent; it must reject screenshots/dashboards/env vars/webhook arrival alone as proof; it must assert no `verified`/callable/payment language on any surface it touches.</action>
  <verify>npm run check:convex-codegen && npm run typecheck && npm run test:provider-smoke:capability-check</verify>
  <acceptance_criteria>
    - The cron selects only due capabilities via an index and enqueues bounded work.
    - Missing deployed evidence produces a clear failure enumerating all required inputs.
    - A passing smoke requires a real seeded business, attempt row, facet results, and trust-state transition; absence is never external proof.
  </acceptance_criteria>
  <done>Due capabilities re-check hourly and the deployed proof gate cannot silently pass.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/capabilities/ingest-manifest.test.ts tests/unit/capabilities/check-engine.test.ts
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npm run test:provider-smoke:capability-check  (fails loudly without deployed evidence; not counted as external proof unless it passes)
</verification>

<success_criteria>
- Business-origin ingestion is strict-parsed, claim-stripped, safePublicText-cleaned, host-allowlisted, read+describe only.
- The cron -> node-action -> mutation split matches the #9 resolution; the pure oracle reconstructs every trust state.
- ae-endpoint-check:v1 maps four facets to the five trust states; staleness/contradiction/backoff visibly degrade a listing; readbacks redacted, never public.
- Unit + codegen + ts-standards green source-locally; the deployed check smoke fails loudly and is not counted as external proof (production proof not claimed).
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-02-capability-registry/02-03-SUMMARY.md` stating: engine/ingestion/cron landed, source/local proof only, the capability-check provider smoke status is not external proof unless configured deployed evidence passes.
</output>
