---
phase: scope-03-handshake-identity-clearance
plan: "03-04"
type: execute
wave: 3
depends_on: ["03-03"]
files_modified:
  - src/modules/clearance/public.ts
  - src/modules/clearance/internal/evidence-binding.ts
  - src/modules/clearance/internal/clearance-schema.ts
  - src/modules/business-action/internal/schema.ts
  - src/modules/business-action/internal/business-action.ts
  - src/modules/business-action/public.ts
  - src/modules/protected-action/internal/contact-follow-up.ts
  - src/modules/protected-action/internal/gateway.ts
  - src/modules/protected-action/internal/schema.ts
  - src/modules/protected-action/public.ts
  - convex/businessActions.ts
  - convex/businessActionStore.ts
  - convex/protectedActions.ts
  - convex/protectedActionStore.ts
  - tests/unit/clearance/evidence-binding.test.ts
  - tests/unit/business-action/evidence-receipt-verifier.test.ts
  - tests/unit/business-action/mandate-request-checkpoint.test.ts
  - tests/unit/protected-action/selected-action-gateway.test.ts
  - tests/integration/business-action-route-readbacks.test.ts
  - tests/integration/protected-action-route-readbacks.test.ts
  - tests/copy/scope3-handshake-banned-copy.test.ts
  - .planning/scopes/scope-03-handshake-identity-clearance/03-04-EVIDENCE-BINDING-MAP.md
autonomous: true
requirements: [D2]
user_setup:
  - "03-03-SUMMARY.md exists and records the clearance module, mandate model, #20/#21 decisions, and D7 reshape/freeze path."
  - "If 03-03 selected local_hmac signing, the named local/dev Convex secret is configured before signer/binding tests run."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s3-bound-evidence-not-authority
      statement: "Kernel/clearance outputs are recorded as bound evidence in AE receipt chains; they never bypass P4/P6 checkpoint, owner approval, or reconstruction rules."
    - id: s3-term-map-resolved
      statement: "#18 produces a bidirectional term map between AE proposal/policy/checkpoint/receipt grammar and kernel ActionContract/PolicyDecision/Greenlight/GatewayCheck/Receipt/Refusal/ProofGap grammar."
    - id: s3-reconstruction-oracle-preserved
      statement: "P4 and P6 verifiers still reconstruct success/refusal/replay/proof-gap/expired-mandate/tamper outcomes from source-owned Convex state."
    - id: s3-private-evidence-redacted
      statement: "Private kernel/clearance payloads are represented by hashes/redacted refs in public readbacks; no secret, token, raw signature, key, or internal protocol copy leaks."
    - id: s3-public-vocabulary-clean
      statement: "Public human surfaces and agent JSON/tools/boundaries copy remain free of Handshake/HSK/kernel/greenlight/clearance/mandate/protocol/gateway/ActionContract vocabulary."
  artifacts:
    - path: .planning/scopes/scope-03-handshake-identity-clearance/03-04-EVIDENCE-BINDING-MAP.md
      provides: "Resolution of #18: exact field-level binding map and reconstruction outcomes for P4/P6."
    - path: src/modules/clearance/internal/evidence-binding.ts
      provides: "Internal helper for canonical bound-evidence hash values consumed by P4/P6 receipt payloads."
    - path: tests/unit/clearance/evidence-binding.test.ts
      provides: "Contract tests for deterministic evidence hashes, redaction, tamper detection, and refusal/proof-gap mapping."
    - path: tests/unit/business-action/evidence-receipt-verifier.test.ts
      provides: "P6 receipt reconstruction coverage with bound clearance evidence."
    - path: tests/unit/protected-action/selected-action-gateway.test.ts
      provides: "P4 gateway/receipt reconstruction coverage with bound clearance evidence."
  key_links:
    - from: resolution of #18
      to: P4/P6 receipt payload hash values
      via: "Only selected stable hashes/refs enter source-owned payload hashes; private payloads stay redacted."
    - from: 03-03 clearance store
      to: reconstruction verifier
      via: "Store outputs are evidence inputs; existing verifiers remain the tamper oracle."
    - from: D9 public-posture scan
      to: route readbacks and agent tools
      via: "Bound evidence labels are natural and neutral (for example, 'receipt details', 'checked evidence', 'needs review'); proof-scope wording stays in summaries/owner-admin/test assertions, never public human copy."
---

<objective>
Bind the clearance/kernel evidence produced by Scope 3 into the existing P4 and P6 receipt chains so third parties and operators can reconstruct what happened from AE-owned state — without turning any kernel verdict into authority and without leaking internal protocol vocabulary to public or agent-facing surfaces.

Purpose: finish the Handshake convergence by preserving the thing AE already owns: receipts as the source of reputation. The new clearance module adds signed/idempotent evidence, but the AE reconstruction verifier remains the tamper oracle.

Output: #18 resolved, deterministic evidence-binding helper, P4/P6 receipt payloads updated, reconstruction/readback tests proving success/refusal/replay/proof-gap/expired-mandate/tamper outcomes, and copy scans proving no public vocabulary leak.
</objective>

<how_to_execute>
Fresh session: read `SCOPE-03-INDEX.md`, `03-03-SUMMARY.md`, and then this plan. Execute tasks in order. TDD where marked; run each task's `<verify>` before moving on. Load skills per `<skill_usage>` before starting. On completion write the `SUMMARY.md` named in `<output>` and state source/local proof only; deployed proof is not claimed.
</how_to_execute>

<context>
@.planning/adr/ADR-003-handshake-agent-identity-clearance.md
@.planning/ENGINEERING-STANDARDS.md
@convex/_generated/ai/guidelines.md
@AGENTS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/ARCHITECTURE.md
@src/modules/clearance/public.ts
@src/modules/business-action/internal/schema.ts
@src/modules/business-action/internal/business-action.ts
@src/modules/protected-action/internal/contact-follow-up.ts
@src/modules/protected-action/internal/gateway.ts
@src/modules/protected-action/internal/schema.ts
@tests/unit/business-action/evidence-receipt-verifier.test.ts
@tests/unit/protected-action/selected-action-gateway.test.ts
</context>

<preflight_gates>
- **03-03 completion gate:** STOP if `03-03-SUMMARY.md` is absent or does not state table/store shape, #20 credential-custody decision, #21 signing posture, and D7 reshape/freeze path. This plan binds evidence from that exact module; do not invent a second mapping.
- **#18 gate:** resolve "Map kernel evidence into P4/P6 receipt hash chains" before changing receipt payload hashes. The term map is the acceptance contract for every later code change.
- **Receipt-history gate:** if 03-03 selected freeze-and-supersede because deployed receipt-bearing rows exist, this plan must preserve old verification for historical rows and bind evidence only to new rows. No in-place historical rehash.
- **Public-copy gate:** D9 scan from 03-02 must exist before route/readback labels are touched. If missing, run 03-02 Task 3 first.
- **Production posture:** this is source/local proof. It does not prove live signer attribution or deployed receipt verification until Scope 1 deploys and the relevant smokes run.
</preflight_gates>

<standards>
Rules that bind these files:
- **Prime directive / /ponytail full:** add one evidence-binding seam that P4/P6 share. Do not add generic receipt buses, marketplace ledger abstractions, OpenAPI/MCP surfaces, wallet settlement, or a new verifier framework.
- **codebase-design / module seams:** shared binding logic lives in `src/modules/clearance/internal/evidence-binding.ts` and is exported only as narrow functions/types through `src/modules/clearance/public.ts` if P4/P6 need it. P4/P6 keep their own domain schemas and pure verifier functions.
- **TypeScript hard spec:** evidence kinds/outcomes are const tuple unions; all required maps use `satisfies Record<Union, ...>`; tamper/refusal/proof-gap results are discriminated unions; no `any`/`as any`/non-null/broad status strings.
- **Audit standard:** bound evidence includes correlation ID, idempotency/operation key, actor/principal ref where available, redacted payload hash, before/after state when state changes, and exact source refs — never raw secrets or signatures.
- **Convex standards + Convex AI guidelines:** new persisted evidence refs use indexed query paths and validators; no array grows unbounded inside a document; no `.filter()`/unbounded `.collect()` on runtime readbacks; sensitive reads remain internal.
- **Source authority:** public readbacks show hashes/statuses from source-owned state. The kernel/clearance receipt is evidence, not source authority; `verifyReceiptStatus`/P4 reconstruction functions remain decisive.
- **Copy/discovery/GTM standards:** public labels use natural boundary-honest copy (`receipt details`, `checked evidence`, `needs review`, or terms selected in #18); proof-scope labels such as `source/local proof only` and `production proof not claimed` are reserved for planning summaries, owner/admin evidence assertions, and tests. No booking/payment/dispatch/autonomous/live-capability claim is introduced; Handshake vocabulary remains scan-forbidden.
- **PR review checklist:** summaries must answer module owner, state/result/audit variants changed, idempotency behavior, audit events, projection/readback/repair behavior, security boundary touched, copy/discovery claims affected, and exact commands run.
</standards>

<antipatterns>
Relapses this plan could cause, and the gate that catches each:
- **Kernel evidence becomes a bypass** — treating a Greenlight/Receipt as sufficient even when AE checkpoint/mandate/owner decision fails. Caught by tests where bound evidence exists but mandate/owner approval is absent and the write refuses.
- **Receipt hash drift without reconstruction** — adding fields to payload hashes without verifying expected hashes. Caught by tamper tests that flip each bound-evidence ref and expect `tampered`/`evidence_mismatch`.
- **Private evidence leak** — public readback includes raw signature, JWKS key, secret ref, full protocol payload, or internal module vocabulary. Caught by readback assertions + `npm run test:copy`.
- **Historical receipt breakage** — rehashing deployed rows. Caught by the receipt-history gate and tests that old-row verification remains stable under freeze-and-supersede.
- **One-off P4/P6 divergence** — duplicating two incompatible evidence maps. Caught by `evidence-binding.test.ts` asserting one shared map/hashing helper is used by both domains.
- **Theatre receipt proof** — declaring production proof from source/local tests. Caught by summary wording and copy scans requiring source/local/deployed distinction.
</antipatterns>

<skill_usage>
- **Task 1 (#18):** `grilling` (force the bidirectional term map and failure-mode table), `codebase-design` + `domain-modeling` (shared vocabulary without generic abstractions), `security-threat-model` (what evidence can be forged/replayed/leaked), `wayfinder` (resolution comment + close #18 + map #1 append).
- **Task 2:** `tdd`, `codebase-design`, `convex-best-practices` (persisted evidence refs/indexes), `security-best-practices` (redaction + tamper oracle), `ponytail` (one helper, no receipt bus).
- **Task 3:** `tdd`, `convex-security-audit`, `security-threat-model`, `code-review` (`/mattpocock-review` with Standards and Spec axes), `react-doctor` only if a route/component is touched (expected: no new UI).
- **Task 4:** `seo-audit`/`ai-seo` awareness for llms/agent payload surfaces, `security-best-practices` for redaction, `learn` for non-obvious reconstruction/signing decisions.
</skill_usage>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve #18 — term map and bound-evidence contract</name>
  <files>.planning/scopes/scope-03-handshake-identity-clearance/03-04-EVIDENCE-BINDING-MAP.md, src/modules/clearance/internal/evidence-binding.ts</files>
  <read_first>.planning/adr/ADR-003-handshake-agent-identity-clearance.md (D2, G2, open ticket #18), local://research-handshake.md §2/§3/§7, local://research-ae-seams.md divergences §1/§3/§4, 03-03-SUMMARY.md, src/modules/business-action/internal/business-action.ts, src/modules/protected-action/internal/contact-follow-up.ts</read_first>
  <action>Follow "Map kernel evidence into P4/P6 receipt hash chains" (#18). Produce `03-04-EVIDENCE-BINDING-MAP.md` with: (1) AE→kernel term map (`proposal`/`policy`/`ownerDecision`/`gatewayAdmission`/`checkpoint`/`receipt` ↔ `ActionContract`/`PolicyDecision`/`Greenlight`/`VerifiedGatewayCheck`/`Receipt`/`Refusal`/`ProofGap`); (2) exact stable hash inputs that bind into P4 and P6 receipt payloads; (3) which payloads stay private and are represented by hashes/refs; (4) failure outcome table for success/refusal/replay/proof-gap/expired-mandate/tamper/unbound-provider-event; (5) historical-row behavior from 03-03's D7 path. Add only type stubs/constants to `evidence-binding.ts` if needed for the later TDD tasks. Resolve #18 with the map as a comment and append map #1.</action>
  <verify>test -f .planning/scopes/scope-03-handshake-identity-clearance/03-04-EVIDENCE-BINDING-MAP.md</verify>
  <acceptance_criteria>
    - #18 has one field-level binding map for both P4 and P6; no code change guesses the map.
    - The map names every bound hash/ref and every private/redacted field.
    - The map states old-row behavior if 03-03 used freeze-and-supersede.
    - #18 is closed with a resolution comment and map #1 has a "Decisions so far" line.
  </acceptance_criteria>
  <done>The evidence-binding contract is explicit before receipt code changes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Shared evidence-binding helper + P4/P6 receipt payload hashes</name>
  <files>src/modules/clearance/internal/evidence-binding.ts, src/modules/clearance/public.ts, src/modules/business-action/internal/schema.ts, src/modules/business-action/internal/business-action.ts, src/modules/protected-action/internal/contact-follow-up.ts, src/modules/protected-action/internal/gateway.ts, src/modules/protected-action/internal/schema.ts, tests/unit/clearance/evidence-binding.test.ts, tests/unit/business-action/evidence-receipt-verifier.test.ts, tests/unit/protected-action/selected-action-gateway.test.ts</files>
  <read_first>03-04-EVIDENCE-BINDING-MAP.md, 03-03-SUMMARY.md, src/modules/common/stable-hash.ts, src/modules/business-action/internal/business-action.ts:801-1031, src/modules/protected-action/internal/contact-follow-up.ts receipt/gateway sections, src/modules/protected-action/internal/gateway.ts</read_first>
  <action>Implement the shared binding helper and thread it through P4/P6. Add canonical `BoundClearanceEvidence`/hash-value helpers that accept only stable, redacted inputs from the #18 map. P6: extend receipt/checkpoint/result payload hash values with `clearanceEvidenceRefHashes` (or the exact neutral name chosen in #18) and update `verifyReceiptStatus` to recompute and compare them. P4: bind the same neutral evidence refs into gateway admission/attempt/receipt hashes without changing public capability posture. Preserve existing externalEvidence/guardrail evidence behavior. Tests must prove deterministic hash ordering, exact tamper detection when any bound ref changes, and no route-around when clearance evidence exists but owner/mandate/checkpoint fails.</action>
  <verify>npx vitest run tests/unit/clearance/evidence-binding.test.ts tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/protected-action/selected-action-gateway.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - P4 and P6 use one shared binding helper; no duplicated incompatible term maps.
    - Bound evidence hashes participate in the receipt payload hash and reconstruction comparison.
    - Changing/removing a bound evidence ref yields `tampered`/`evidence_mismatch` as specified by #18.
    - Existing success/refusal/proof-gap paths still pass when bound evidence is absent only for historical/pre-Scope-3 rows allowed by the D7 path.
  </acceptance_criteria>
  <done>Clearance evidence is cryptographically bound into P4/P6 receipt hashes, not merely logged beside them.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Reconstruction verifier coverage across success/refusal/replay/proof-gap/expiry</name>
  <files>src/modules/business-action/internal/business-action.ts, src/modules/protected-action/internal/contact-follow-up.ts, convex/businessActions.ts, convex/businessActionStore.ts, convex/protectedActions.ts, convex/protectedActionStore.ts, tests/unit/business-action/evidence-receipt-verifier.test.ts, tests/unit/business-action/mandate-request-checkpoint.test.ts, tests/unit/protected-action/selected-action-gateway.test.ts, tests/unit/convex/business-actions-runtime.test.ts, tests/unit/convex/protected-actions-runtime.test.ts</files>
  <read_first>03-04-EVIDENCE-BINDING-MAP.md, src/modules/business-action/internal/business-action.ts verifyReceiptStatus, src/modules/protected-action/internal/contact-follow-up.ts reconstruction helpers, convex/_generated/ai/guidelines.md, convex/businessActionStore.ts, convex/protectedActionStore.ts</read_first>
  <action>Expand reconstruction tests and Convex persistence to prove the receipt chain remains the oracle. Cover P6: complete success with bound evidence, owner refusal => `refused_no_consequence`, proof-gap, expired mandate, stale/disabled card, unbound provider event, replay/idempotency conflict, and tamper by changed evidence/hash/signature. Cover P4: gateway admitted/consumed, replay rejected, expired gateway, proof-gap receipt, provider attempt readback, and tamper of bound refs. Ensure persisted rows round-trip through Convex stores with index-backed queries and bounded reads. If 03-03 selected freeze-and-supersede, include an old-row fixture proving historical receipts verify with their old payload contract.</action>
  <verify>npx vitest run tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/protected-action/selected-action-gateway.test.ts tests/unit/convex/business-actions-runtime.test.ts tests/unit/convex/protected-actions-runtime.test.ts && npm run check:convex-codegen && npm run typecheck</verify>
  <acceptance_criteria>
    - Reconstruction returns exact typed statuses for success, refusal, replay, proof-gap, expired mandate/gateway, unbound event, and tamper.
    - Convex store serialization/deserialization preserves bound evidence hashes and does not use unbounded scans.
    - Historical receipt behavior matches the 03-03 D7 path.
    - No private payload/secret/raw signature appears in public readback DTOs.
  </acceptance_criteria>
  <done>P4/P6 receipts are replay-safe and reconstructable from source-owned state with bound clearance evidence.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Neutral readbacks + public-copy/source scans stay green</name>
  <files>src/modules/business-action/internal/business-action.ts, src/modules/protected-action/internal/contact-follow-up.ts, tests/integration/business-action-route-readbacks.test.ts, tests/integration/protected-action-route-readbacks.test.ts, tests/copy/scope3-handshake-banned-copy.test.ts</files>
  <read_first>AGENTS.md (trust contract, banned words), .planning/adr/ADR-003-handshake-agent-identity-clearance.md (D9 boundary posture), 03-02-SUMMARY.md, 03-04-EVIDENCE-BINDING-MAP.md, tests/copy/scope3-handshake-banned-copy.test.ts</read_first>
  <action>Update route/public readbacks only as needed to expose natural receipt evidence and reconstruction statuses. Public labels must be human-natural and boundary-honest: use terms like `receipt details`, `checked evidence`, `needs review`, or other neutral natural copy from #18. Reserve `source/local proof only` / `production proof not claimed` wording for SUMMARY files, owner/admin evidence assertions, and tests — not public human readbacks. Do not expose Handshake/HSK/kernel/greenlight/clearance/mandate/protocol/gateway/ActionContract terms in human surfaces or agent JSON/tools/boundaries copy. Extend readback tests to assert redacted evidence refs only. Run the D9 copy test and full copy/source scans; if a scanner needs a planning/test allowance, keep it scoped to `.planning`/test fixtures and explain it in the summary.</action>
  <verify>npx vitest run tests/integration/business-action-route-readbacks.test.ts tests/integration/protected-action-route-readbacks.test.ts tests/copy/scope3-handshake-banned-copy.test.ts && npm run test:copy && npm run test:source-mining</verify>
  <acceptance_criteria>
    - Public readbacks use natural neutral copy and redacted/hashes-only evidence; owner/admin/test assertions may include proof-scope wording, but raw private evidence never appears.
    - Agent JSON/tools/boundaries copy and public human surfaces contain no D9 vocabulary and advertise no new verbs.
    - `npm run test:copy` and `npm run test:source-mining` are green with zero broad new allowances.
    - Summary states source/local proof only; deployed proof and live signer attribution remain unclaimed.
  </acceptance_criteria>
  <done>Receipt evidence is visible enough to audit but too redacted to leak internals, and public copy remains inside AE's trust contract.</done>
</task>

</tasks>

<verification>
- [ ] test -f .planning/scopes/scope-03-handshake-identity-clearance/03-04-EVIDENCE-BINDING-MAP.md
- [ ] npx vitest run tests/unit/clearance/evidence-binding.test.ts tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/protected-action/selected-action-gateway.test.ts
- [ ] npx vitest run tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/convex/business-actions-runtime.test.ts tests/unit/convex/protected-actions-runtime.test.ts
- [ ] npx vitest run tests/integration/business-action-route-readbacks.test.ts tests/integration/protected-action-route-readbacks.test.ts tests/copy/scope3-handshake-banned-copy.test.ts
- [ ] npm run check:convex-codegen
- [ ] npm run test:copy
- [ ] npm run test:source-mining
- [ ] npm run test:ts-standards
- [ ] npm run typecheck
</verification>

<success_criteria>
- #18 is resolved with a field-level evidence-binding map, GitHub resolution comment, closed ticket, and map #1 line.
- P4 and P6 receipt payload hashes include the selected bound evidence refs while preserving historical-row behavior from 03-03.
- `verifyReceiptStatus` and P4 reconstruction remain the tamper oracle and return exact typed outcomes for success/refusal/replay/proof-gap/expired/tampered/unbound cases.
- Public readbacks expose only natural neutral copy and redacted/hashes-only evidence; proof-scope wording stays in summaries/owner-admin/tests, and raw signatures/secrets/private payloads never leave internal state.
- D9 copy/source scans stay green with zero new public capability claims or Handshake vocabulary leaks.
- Summary answers the PR review checklist items for state/result/audit variants, idempotency, readback/repair, security boundary, copy/discovery claims, and exact commands run.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-03-handshake-identity-clearance/03-04-SUMMARY.md` stating: #18 map result, evidence fields bound into P4/P6, reconstruction statuses covered, historical-row behavior, commands run with exact results, source/local proof only, and production/deployed proof not claimed.
</output>
