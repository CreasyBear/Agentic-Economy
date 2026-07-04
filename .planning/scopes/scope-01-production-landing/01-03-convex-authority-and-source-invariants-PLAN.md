---
phase: scope-01-production-landing
plan: "01-03"
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/authz.ts
  - convex/schema.ts
  - src/modules/security/internal/schema.ts
  - src/modules/security/internal/admin-authority.ts
  - convex/source_state.ts
  - convex/authzMigration.ts
  - convex/registry.ts
  - tests/unit/convex/authz.test.ts
  - tests/unit/actions/agent-tools-surface.test.ts
  - tests/unit/convex/source-state-index-guard.test.ts
  - tests/unit/registry/registry-fallback.test.ts
autonomous: true
requirements: [D5, D6, D7]
user_setup:
  - "The D5 tokenIdentifier NARROW step (drop subject-only reads) runs only after one deployed dual-read window has elapsed (see 01-04). Requires a deploy between the dual-read landing and the narrow."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s1-authz-token-identifier
      statement: "Authority identity canonicalizes to tokenIdentifier (documented issuer+subject) via widen+backfill+dual-read; the narrow-to-tokenIdentifier-only step is gated on one deployed dual-read window."
    - id: s1-agenttools-locked
      statement: "Exactly {registry.search, registry.detail, inquiry.submit} expose agentTools; registry.list is excluded; inquiry.submit is the only agentTools write; the answer-thread tool-runner rejects non-read tools."
    - id: s1-source-state-indexed
      statement: "Every source-state UpsertSpec table resolves an indexed lookup (no silent collect().find); registrySearchDocuments is the required search read model with a fallback-used metric."
  artifacts:
    - path: tests/unit/convex/authz.test.ts
      provides: "tokenIdentifier-keyed membership, dual-read (subject OR tokenIdentifier), and wrong-issuer rejection cases."
    - path: tests/unit/actions/agent-tools-surface.test.ts
      provides: "agentTools surface + write snapshot; boundary lock on future writes."
    - path: tests/unit/convex/source-state-index-guard.test.ts
      provides: "Guard failing when any persisted UpsertSpec table lacks a resolving indexedUpsertLookup."
  key_links:
    - from: pinned Clerk issuer (auth.config.ts)
      to: tokenIdentifier backfill
      via: "tokenIdentifier = `${issuer}|${subject}` is deterministic for every existing adminMemberships row."
    - from: source-state UpsertSpec set
      to: indexedUpsertLookups
      via: "The guard enumerates every spec and requires an index-backed lookup, forbidding collect().find for shipped tables."
---

<objective>
Lock three Convex-side invariants before scopes 2-5 attach agent identity and supply: (D5) canonicalize authority identity from Clerk `subject` to `tokenIdentifier` via widen-migrate-narrow; (D6) snapshot the `agentTools` write surface; (D7) guard source-state index coverage and enforce `registrySearchDocuments` as the required search read model. Resolves the source-state fallback grilling (#8) and the Convex rollout-safety research (#4).

Purpose: authority, agent-door write surface, and source-state scale invariants are locked and CI-guarded before later scopes build on them.
Output: authz migration + tests, agentTools snapshot test, source-state index guard + registry fallback metric.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-01-INDEX.md`), then execute this plan's tasks in order; Tasks 1-2 resolve tickets #4 and #8 first (their answers feed Tasks 3 and 5). TDD where marked; run each task's `<verify>` after the task; write the SUMMARY.md named in `<output>` on completion. The D5 narrow step is deferred to a deployed dual-read window (01-04) — do NOT drop subject reads in this plan.
</how_to_execute>

<context>
@.planning/adr/ADR-001-scope1-production-landing.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/ARCHITECTURE.md
@AGENTS.md
@convex/authz.ts
@convex/auth.config.ts
@convex/source_state.ts
@convex/registry.ts
@src/modules/security/internal/admin-authority.ts
@src/modules/actions/index.ts
@src/modules/registry/registry.actions.ts
@src/modules/inquiries/inquiry.actions.ts
@src/modules/answer-thread/internal/tool-runner.ts
@tests/unit/convex/authz.test.ts
@tests/unit/actions/registry.test.ts
@tests/integration/agent-tools-api.test.ts
@tests/unit/convex/source-state.test.ts
@tests/unit/registry/registry-fallback.test.ts
</context>

<standards>
- **Convex standards + convex-best-practices:** actor/admin authority derived inside the Convex boundary (never from browser payload); every query path has an index; schema changes require codegen (`npm run check:convex-codegen`); no unbounded `collect()` on shipped runtime paths.
- **convex-migration-helper (widen-migrate-narrow):** add the field + index, backfill deterministically, dual-read for one deploy, narrow after — no atomic subject→tokenIdentifier switch (rejected alternative; rolling deploy can interleave versions).
- **TypeScript hard spec:** no `v.any()` outside a documented boundary adapter; no broad `string` status/id; `satisfies Record<Union, ...>` for surface/write maps; no `any`/`as`/non-null; expected failures return discriminated results.
- **Admin/security standard:** admin membership read from source-owned records; owner-only inquiry actions stay OUT of `agentTools`; suppression fail-closed unaffected.
- **Side-effect standard:** the backfill is a retryable, idempotent migration mutation (durable key), not a best-effort loop.
- **/ponytail full:** smallest migration that proves the invariant; the #8 decision prefers fail-loud (delete the silent collect().find branch) unless a table legitimately lacks a stable lookup.
</standards>

<antipatterns>
- A future action silently gaining `surfaces: ['agentTools']` (esp. a write) → `tests/unit/actions/agent-tools-surface.test.ts` snapshot fails; boundary test required for any new agentTools write (AGENTS.md §Actions).
- Adding a source-owned table without an index lookup → `tests/unit/convex/source-state-index-guard.test.ts` fails (CONCERNS §"Generic source-state persistence hides table-specific invariants").
- Atomic subject→tokenIdentifier switch that orphans admin memberships on a rolling deploy → dual-read window (ticket #4 resolution) + authz.test.ts dual-read/wrong-issuer cases.
- `v.any()` / broad `string` on the new `tokenIdentifier` field or migration args → `npm run test:ts-standards`, `npm run check:convex-codegen`.
- Registry search silently falling back to full-table scan in production → the fallback-used metric + `tests/unit/registry/registry-fallback.test.ts` failing when the seeded catalog exercises the scan (CONCERNS §"Registry search fallback").
- Reintroducing any Phase-1-banned identifier (payment/wallet/marketplace) while editing convex/registry.ts → `npm run test:source-mining`.
</antipatterns>

<skill_usage>
- **convex-security-audit + clerk-tanstack-patterns:** D5 tokenIdentifier canonicalization — Clerk identity → Convex authority mapping, issuer pinning, wrong-issuer rejection (maps to standards-table "Clerk auth" + "Security" modes).
- **convex-migration-helper + convex-schema-validator:** widen+backfill+dual-read sequence, schema field + index, deterministic backfill; codegen after schema change.
- **convex-best-practices + convex-performance-audit:** D7 index-guard + registry read-model + fallback metric (no unbounded collect).
- **grilling:** resolve #8 (keep-guarded vs delete the collect().find fallback) with the confirm-every-spec-has-a-lookup check.
- **codebase-design:** keep authz + agentTools surface behind the existing module seams (tests through the seam, not internals).
- **tdd:** write authz dual-read/wrong-issuer cases, the agentTools snapshot, and the index guard before implementation.
- **code-review:** final Standards + Spec pass.
</skill_usage>

<preflight_gates>
- **Ticket #4 — Convex rollout safety for tokenIdentifier authz migration:** resolved in Task 1 before Task 3 implements the migration.
- **Ticket #8 — delete the source-state collect() fallback:** resolved in Task 2 before Task 5 implements the guard (confirm every current UpsertSpec table has a lookup so removal is non-breaking).
- No deployed env is required for source proof. The D5 **narrow** step (drop subject reads) is BLOCKED until one deployed dual-read window elapses (01-04) — hence `production_executable: false`.
- No public copy/vocabulary change; authority remains server-derived only.
</preflight_gates>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve ticket #4 (Convex rollout safety for tokenIdentifier migration)</name>
  <files>tests/unit/convex/authz.test.ts</files>
  <read_first>convex/auth.config.ts, convex/authz.ts, convex/_generated/ai/guidelines.md, local://tickets-scope-1.json (#4 body)</read_first>
  <action>Determine Convex function-version cutover atomicity: can old (subject-writing) and new (tokenIdentifier-reading) function versions run concurrently against `adminMemberships` during a rolling Vercel/Convex deploy? Confirm the backfill `${issuer}|${subject}` is deterministic for every existing row and that no row predates the pinned issuer. Output the safe sequence (dual-read window length, backfill ordering, the narrow step) and the exact authz.test.ts cases that prove it. Stub the failing test cases (dual-read, wrong-issuer) now. Post the resolution comment on issue #4, close it, and append one line to map issue #1 "Decisions so far".</action>
  <verify>npx vitest run tests/unit/convex/authz.test.ts</verify>
  <acceptance_criteria>
    - Safe migration sequence documented (dual-read window + backfill order + narrow step).
    - Deterministic backfill confirmed for all existing rows; no pre-issuer rows.
    - Issue #4 closed with resolution; map issue #1 updated.
  </acceptance_criteria>
  <done>The rollout sequence and its proving tests are decided.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Resolve ticket #8 (delete vs guard the source-state collect() fallback)</name>
  <files>tests/unit/convex/source-state-index-guard.test.ts</files>
  <read_first>convex/source_state.ts, .planning/codebase/CONCERNS.md, local://tickets-scope-1.json (#8 body)</read_first>
  <action>Enumerate every `UpsertSpec` table built in `source_state.ts` (byFields/byDomainId) and confirm each has a resolving entry in `indexedUpsertLookups`. Decide keep-guarded vs delete the `findExistingUpsertRow` collect().find branch: prefer fail-loud (throw when no indexed lookup exists) if every current spec resolves; document the bounded-migration-helper path for any table that legitimately cannot define a stable lookup. Encode the decision as the D7 index-guard test skeleton. Post the resolution comment on issue #8, close it, and append one line to map issue #1 "Decisions so far".</action>
  <verify>npx vitest run tests/unit/convex/source-state-index-guard.test.ts</verify>
  <acceptance_criteria>
    - Every current UpsertSpec table confirmed to have an indexed lookup (removal non-breaking).
    - keep-guarded vs delete decision recorded with the migration path for lookup-less tables.
    - Issue #8 closed with resolution; map issue #1 updated.
  </acceptance_criteria>
  <done>The fallback policy is decided and encoded as a guard test.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Widen + backfill + dual-read authz to tokenIdentifier (D5)</name>
  <files>convex/authz.ts, convex/schema.ts, src/modules/security/internal/schema.ts, src/modules/security/internal/admin-authority.ts, convex/source_state.ts, convex/authzMigration.ts, tests/unit/convex/authz.test.ts</files>
  <read_first>resolution of #4, convex/authz.ts, convex/schema.ts, src/modules/security/internal/admin-authority.ts, convex/source_state.ts</read_first>
  <action>Add `tokenIdentifier` to the `adminMemberships` table (`convex/schema.ts` + `src/modules/security/internal/schema.ts`) with a `by_tokenIdentifier_state` index, and register the matching `indexedUpsertLookups` + UpsertSpec fields in `source_state.ts`. Add an idempotent internal backfill mutation `convex/authzMigration.ts` writing `${issuer}|${subject}` for existing rows (documented issuer+subject). In `convex/authz.ts`, store `tokenIdentifier` and DUAL-READ authority (accept subject OR tokenIdentifier) for one deploy; update `admin-authority.ts` membership lookup accordingly. Add authz.test.ts cases: tokenIdentifier-keyed membership, dual-read acceptance, wrong-issuer rejection. Do NOT remove subject reads (narrow step is deferred to 01-04).</action>
  <verify>npx vitest run tests/unit/convex/authz.test.ts && npm run check:convex-codegen && npm run typecheck</verify>
  <acceptance_criteria>
    - tokenIdentifier field + index added; deterministic backfill mutation is idempotent.
    - Dual-read accepts subject OR tokenIdentifier; wrong-issuer rejected.
    - No v.any()/broad string; codegen clean; subject reads still present (dual-read window).
  </acceptance_criteria>
  <done>Authority is tokenIdentifier-canonical with a safe dual-read window.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: agentTools surface snapshot test (D6)</name>
  <files>tests/unit/actions/agent-tools-surface.test.ts</files>
  <read_first>src/modules/actions/index.ts, src/modules/registry/registry.actions.ts, src/modules/inquiries/inquiry.actions.ts, src/modules/answer-thread/internal/tool-runner.ts, tests/unit/actions/registry.test.ts</read_first>
  <action>Add `tests/unit/actions/agent-tools-surface.test.ts` asserting: exactly `{registry.search, registry.detail, inquiry.submit}` expose `agentTools`; `registry.list` is explicitly excluded; among agentTools actions only `inquiry.submit` has `readOnly: false` (the sole write); and the answer-thread tool-runner rejects non-read tools. The test must fail if any future action gains agentTools without an explicit boundary test.</action>
  <verify>npx vitest run tests/unit/actions/agent-tools-surface.test.ts</verify>
  <acceptance_criteria>
    - Snapshot locks the three agentTools actions and the single write.
    - registry.list exclusion and tool-runner non-read rejection asserted.
  </acceptance_criteria>
  <done>The agent-door write surface is snapshot-locked.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Source-state index guard + registry read-model fallback metric (D7)</name>
  <files>tests/unit/convex/source-state-index-guard.test.ts, convex/source_state.ts, convex/registry.ts, tests/unit/registry/registry-fallback.test.ts</files>
  <read_first>resolution of #8, convex/source_state.ts, convex/registry.ts, tests/unit/registry/registry-fallback.test.ts</read_first>
  <action>Implement the D7 guard: `tests/unit/convex/source-state-index-guard.test.ts` enumerates every UpsertSpec table and asserts an indexed lookup resolves (failing when any would fall to collect().find). Apply the #8 decision in `source_state.ts` (fail-loud throw vs guarded escape hatch). Enforce `registrySearchDocuments` as the required search read model: emit a "search fallback used" metric in `convex/registry.ts` when the bounded published-business fallback scan is exercised, and make `tests/unit/registry/registry-fallback.test.ts` fail when the seeded catalog triggers the fallback.</action>
  <verify>npx vitest run tests/unit/convex/source-state-index-guard.test.ts tests/unit/registry/registry-fallback.test.ts && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - Guard fails for any lookup-less persisted table.
    - Fallback-used metric emitted; seeded-catalog fallback fails the test.
    - Codegen clean; no unbounded collect on shipped runtime path.
  </acceptance_criteria>
  <done>Source-state index coverage and the registry read model are guarded.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/convex/authz.test.ts
- [ ] npx vitest run tests/unit/actions/agent-tools-surface.test.ts
- [ ] npx vitest run tests/unit/convex/source-state-index-guard.test.ts tests/unit/registry/registry-fallback.test.ts
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npm run test:source-mining
</verification>

<success_criteria>
- Authority is tokenIdentifier-canonical (widen+backfill+dual-read, wrong-issuer rejected); narrow step gated on a deployed dual-read window.
- agentTools stays exactly {registry.search, registry.detail, inquiry.submit} with inquiry.submit the only write.
- Every source-state UpsertSpec table is index-backed; registry search read model enforced with a fallback metric.
- Tickets #4 and #8 closed with resolutions linked from map issue #1.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-01-production-landing/01-03-SUMMARY.md` stating source/local proof only; the D5 tokenIdentifier NARROW step is completed after one deployed dual-read window in 01-04 (production authz-narrow proof NOT claimed here).
</output>
