---
phase: scope-05-transactions-receipts
plan: "05-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/scopes/scope-05-transactions-receipts/05-DOOR-AMENDMENT-2026-07-04.md
  - .planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md
  - .planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md
  - .planning/scopes/scope-05-transactions-receipts/05-LIVE-MONEY-EVIDENCE-DRAFT.md
  - tests/unit/business-action/two-slug-hash-chain.spike.test.ts
autonomous: true
requirements: [D1, D2, D5, D6]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: s5-door-checklist-ratified
      statement: "The Phase 6 one-slug door is amended (in a dated scope-dir decision record, not a silent ROADMAP edit) to a closed typed set where each slug passes the D1 6-point admission checklist; no generic executeAction or caller-supplied slug is admitted."
    - id: s5-hash-chain-safe
      statement: "A throwaway two-value slug spike proves actionSlug can be threaded through the request/checkpoint/result/receipt hashes so verifyReceiptStatus still reconstructs complete + refused_no_consequence and still detects tamper/evidence_mismatch/stale_source/expired_mandate."
    - id: s5-nonpaid-card-locked
      statement: "The v1 non-paid slug publish-agent-intake-endpoint card fields are locked (resultArtifactRequirements, allowedExternalEvidenceProviders, no amount/currency, all D1 card invariants preserved) against a seeded demo business."
    - id: s5-verify-privacy-settled
      statement: "Public receipt verification exposure is settled: keyed on a held receiptId, no list/enumeration endpoint, hash-only PublicActionReceiptReadback, and any human copy stays free of protocol/epistemic vocabulary."
    - id: s5-live-money-gate-drafted
      statement: "The live-mode money-evidence decision-record contents are drafted as a gate only; scope 5 does not implement live mode and does not claim live money."
  artifacts:
    - path: .planning/scopes/scope-05-transactions-receipts/05-DOOR-AMENDMENT-2026-07-04.md
      provides: "Ratified D1 per-slug admission checklist + exact replacement ROADMAP door-row text (gate for all slug widening)."
    - path: .planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md
      provides: "Locked publish-agent-intake-endpoint card schema against the demo business."
    - path: .planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md
      provides: "Enumeration/privacy posture + human-surface copy rules for the public verifier."
    - path: tests/unit/business-action/two-slug-hash-chain.spike.test.ts
      provides: "Throwaway spike proving safe hash-chain widening across two slugs (superseded by 05-02)."
  key_links:
    - from: door-amendment record
      to: 05-02 widening tasks
      via: "Widening may not begin until the D1 checklist is ratified and the replacement door-row text is written."
    - from: two-slug spike
      to: 05-02 verifier threading
      via: "The spike's proven threading is the contract 05-02 makes permanent."
---

<objective>
Resolve every open scope-5 wayfinder ticket that must be settled before code, and write the governance/decision records the implementation plans reference as gates.

Purpose: prove the slug-set widening is safe-by-construction and boundary-honest before touching the load-bearing verifier, and pin the public-verify and live-money boundaries so no later task can drift into a marketplace/wallet/live-money relapse.
Output: a dated door-amendment decision record, a non-paid slug card-lock record, a public-verify privacy/copy record, a drafted (gate-only) live-money record, and a throwaway two-slug hash-chain spike.
</objective>

<context>
@.planning/adr/ADR-005-transactions-receipts.md
@AGENTS.md
@.planning/ROADMAP.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md
@.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md
@.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md
@src/modules/business-action/internal/schema.ts
@src/modules/business-action/internal/business-action.ts
</context>

<preflight_gates>
- Cross-scope: the non-paid card lock (Task 3) and the demo-kit loop (05-04) assume a scope-2 agent-operated demo business. If scope 2 has not landed one, lock the card against the local seeded fixture business (05-04 seed-business.ts) and record that substitution explicitly — do not block.
- Production public claims remain BLOCKED. This plan writes decision records and one spike; it implements no runtime widening.
- Live Stripe mode is NOT in scope; Task 5 drafts the gate contents only. No live keys, no live binding, no live claim.
- GitHub writes (resolution comments, issue close, map append) are part of each resolution task's action for the implementing session, not for the planning session.
</preflight_gates>

<standards>
Rules that bind this plan's files:
- Decision records must be one of the ENGINEERING-STANDARDS doc types (decision record / invariant / interface / acceptance gate). No narrative-only prose; the theatre detector rejects "later" without phase+non-goal and "payment-ready" without readback/idempotency/receipt/reversal.
- D1 6-point admission checklist is the authority: schema (closed BusinessActionSlugValues + per-slug card profile + preserved card invariants), owner-approval checkpoint, actionSlug-threaded receipt rigor, support/kill-rule record, copy scan, and the no-generic-executeAction / no-caller-supplied-slug guard.
- Door amendment is written to a dated scope-dir record ONLY. Do NOT edit `.planning/ROADMAP.md` in this plan; the record carries the exact replacement door-row text for a later, separate governance apply.
- TS hard spec binds the spike test: no `any`, no `as any`, no `as unknown as`, no non-null assertions; const tuple unions; discriminated result unions.
- The spike is a throwaway proof (`.spike.test.ts`), not a shipped contract; 05-02 supersedes it. It must not weaken or delete the existing business-action tests.
- Money-rail quarantine (ROADMAP.md §Money rail quarantine): no `stripe*`/`wallet`/`credits`/`balance`/`x402`/provider fields leak into core catalog/registry/discovery; the live-money draft stays in the scope dir as a future gate.
</standards>

<antipatterns>
Relapses this plan could cause and the guard that catches each:
- Generic `executeAction` / arbitrary or caller-supplied slug sneaking into the checklist → grilling review against ROADMAP.md bloat detector + P6 cut list; checklist item 6 forbids it explicitly (later enforced by `isBusinessActionSlug` closed-set guard test in 05-02).
- Silently amending `ROADMAP.md` instead of recording a reviewable decision → this plan writes to the scope dir only; ROADMAP edit is a separate governance step.
- Live-money creep ("just enable live Stripe for the demo") → D6 makes live mode an unmet, separate decision record; Task 5 drafts it as a gate, `production_executable: false`.
- Enumerable public receipt surface / raw-field leak in the verify record → Task 4 pins no-list + hash-only `PublicActionReceiptReadback` reuse; later enforced by `tests/copy` + route tests in 05-03.
- Protocol/epistemic vocab (`callable`, `autonomous`, `manifest`, `KNOWN`/`UNKNOWN`) in proposed human copy → AGENTS.md banned-vocab list; `npm run test:copy` guards it in 05-03/05-04.
</antipatterns>

<skill_usage>
- Task 1 (#29 spike): `tdd` (spike is TDD-shaped), `codebase-design` (respect the deep business-action seam), `convex-schema-validator` (literalUnion validator shape), `security-threat-model` (the verifier is the tamper oracle — reason about what threading breaks).
- Task 2 (#30 door record): `wayfinder` (author the decision record), `grilling` (stress the 6-point checklist against the bloat detector + cut list), `domain-modeling` (ubiquitous language for "slug set" vs "generic action").
- Task 3 (#31 card lock): `grilling` (is this the most demo-worthy money-free op?), `domain-modeling` (card field vocabulary), `stripe` (confirm the non-paid mirror is genuinely money-free).
- Task 4 (#34 verify privacy/copy): `security-threat-model` (enumeration risk), `grilling` (is revealing "an action happened" acceptable?), `product-design` + `ui-craft` (plain-language human copy without epistemic labels).
- Task 5 (#32 live-money draft): `stripe` (refund/dispute/chargeback + reconciliation posture), `security-best-practices` (server-only live credential ownership), `wayfinder` (record contents).
</skill_usage>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Resolve #29 — prove the per-slug hash chain across two slugs (throwaway spike)</name>
  <files>tests/unit/business-action/two-slug-hash-chain.spike.test.ts</files>
  <read_first>src/modules/business-action/internal/business-action.ts (createCapabilityRequest :250, recordAuthorizationCheckpoint :327, verifyActionReceipt :638, validateMandate :698, verifyReceiptStatus :910-1002), src/modules/business-action/internal/schema.ts (BusinessActionSlugValues :21-24), tests/unit/business-action/evidence-receipt-verifier.test.ts, .planning/adr/ADR-005-transactions-receipts.md (D1.3, Q1/Q2)</read_first>
  <action>Write a THROWAWAY spike test that threads a two-value slug set (`provision-paid-intake-endpoint`, `publish-agent-intake-endpoint`) through a local copy of the request/checkpoint/result/receipt hash builders (the sites that today hardcode the `BusinessActionSlug` constant: `business-action.ts:276`, `:307`, `:357`, receipt payload, and the `receipt.actionSlug !== BusinessActionSlug` verifier guard at `:984`). Prove: (a) `verifyReceiptStatus` reconstructs `complete` for a success receipt and `refused_no_consequence` for a refused checkpoint for BOTH slugs; (b) tamper (mutated hash), `evidence_mismatch` (missing source card), `stale_source` (disabled/stale card), and `expired_mandate` are still detected for BOTH slugs. Run the existing business-action suite to confirm no regression. Record the proven threading in the door-amendment record (Task 2). Then resolve #29: post a resolution comment ("Prove per-slug hash chain and receipt verifier across two slugs (#29)"), close the issue, append one line to wayfinder map issue #1. Pattern: mirrors the existing `verifyReceiptStatus` recompute-from-source test in `evidence-receipt-verifier.test.ts` (source-truth recomputation, not field trust).</action>
  <verify>npx vitest run tests/unit/business-action/two-slug-hash-chain.spike.test.ts && npx vitest run tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/business-action/hermes-evidence.test.ts tests/unit/business-action/stripe-checkout-evidence.test.ts</verify>
  <acceptance_criteria>
    - Both slugs reconstruct complete + refused_no_consequence through the threaded hashes.
    - Tamper/evidence_mismatch/stale_source/expired_mandate still fail loudly for both slugs.
    - The existing business-action tests still pass unchanged.
  </acceptance_criteria>
  <done>The load-bearing widening risk (research-ae-seams splice v) is proven safe before 05-02 makes it permanent.</done>
</task>

<task type="auto">
  <name>Task 2: Resolve #30 — write the dated door-amendment decision record</name>
  <files>.planning/scopes/scope-05-transactions-receipts/05-DOOR-AMENDMENT-2026-07-04.md</files>
  <read_first>.planning/ROADMAP.md (decision-door register :11-24, cut list :224, bloat detector :228-240), .planning/adr/ADR-005-transactions-receipts.md (D1), src/modules/business-action/internal/schema.ts (:21-24, card invariants :125-151)</read_first>
  <action>Author the dated decision record. Contents: (1) the ratified D1 6-point per-slug admission checklist (schema/closed union + card profile + preserved `proposal_only`/`callable:false`/`paymentRequired:false`/`ownerApprovalRequired:true`/`receiptRequired:true` invariants; owner-approval checkpoint; actionSlug-threaded receipt rigor; support/kill-rule record; copy scan; no-generic-executeAction / no-caller-supplied-slug guard); (2) the EXACT replacement ROADMAP door-row text from ADR-005 D1 (closed, typed, per-slug two-way within the admitted set); (3) a grilling record confirming no checklist item leaves a gap for a generic action, arbitrary slug, or marketplace/wallet/provider relapse; (4) an explicit statement that this record does NOT edit ROADMAP.md and that the door-row apply is a separate governance step. Then resolve #30: post a resolution comment, close the issue, append one line to map issue #1. Pattern: decision record doc type per ENGINEERING-STANDARDS source-authority + theatre detector.</action>
  <verify>test -f .planning/scopes/scope-05-transactions-receipts/05-DOOR-AMENDMENT-2026-07-04.md && grep -q "per-slug" .planning/scopes/scope-05-transactions-receipts/05-DOOR-AMENDMENT-2026-07-04.md</verify>
  <acceptance_criteria>
    - The 6-point checklist is complete and cites the schema/checkpoint/receipt/support/copy/guard pin sites.
    - The exact replacement door-row text is present and matches ADR-005 D1.
    - The record states ROADMAP.md is not silently edited.
  </acceptance_criteria>
  <done>Slug widening has a ratified, reviewable governance gate.</done>
</task>

<task type="auto">
  <name>Task 3: Resolve #31 — lock the v1 non-paid slug card schema</name>
  <files>.planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md</files>
  <read_first>src/modules/business-action/internal/schema.ts (BusinessActionResultArtifactRequirementValues :80-84, BusinessActionExternalEvidenceProviderValues :61-66, BusinessActionCard :136-151, BusinessActionCardDefaults :125-132), .planning/adr/ADR-005-transactions-receipts.md (D2), local://five-scopes.md (scope 2 demo business)</read_first>
  <action>Lock the exact card fields for `publish-agent-intake-endpoint`: `resultArtifactRequirements = [endpoint_descriptor, json_schema]` (no payment-gate ref), `allowedExternalEvidenceProviders = [hermes, endpoint_host]` (no Stripe), no `maxAdvertisedAmountCents`/`currency`, `paymentRequired:false`, plus readiness/visibility posture, TTL, and policyFlags — preserving ALL D1 card invariants. Grill whether this is the most demo-worthy money-free operation for the seeded business or whether a different software-scoped op reads better; record the answer. If scope 2's demo business is not yet confirmed, lock against the 05-04 seeded fixture business and record the substitution. Then resolve #31: post a resolution comment, close the issue, append one line to map issue #1. Pattern: versioned action-descriptor card profile (06-ENGINEERING-REQUIREMENTS "Keep 1: versioned action descriptors").</action>
  <verify>test -f .planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md && grep -q "publish-agent-intake-endpoint" .planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md</verify>
  <acceptance_criteria>
    - The non-paid card is money-free (no Stripe provider, no amount/currency, no payment-gate artifact ref).
    - All D1 card invariants are explicitly preserved.
    - The demo-business (or fixture substitution) basis is recorded.
  </acceptance_criteria>
  <done>05-02 and 05-04 have an exact second-slug card to implement and seed.</done>
</task>

<task type="auto">
  <name>Task 4: Resolve #34 — settle public-verify privacy + human-surface copy</name>
  <files>.planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md</files>
  <read_first>src/modules/business-action/internal/schema.ts (PublicActionReceiptReadback :299-314), src/modules/business-action/internal/business-action.ts (verifyActionReceipt publicReadback :666-681), AGENTS.md (epistemic vocabulary :67-72, banned human words :90-92), .planning/adr/ADR-005-transactions-receipts.md (D5)</read_first>
  <action>Settle the public receipt-verifier exposure: (1) whether keying on a held `receiptId` with no list endpoint is sufficient privacy or whether an unguessable receipt hash + rate limiting is required; (2) exactly what a hash-only `PublicActionReceiptReadback` reveals about a business (that an action happened, its outcome, reconstruction status, hashes, labels — and confirm that is acceptable); (3) whether a human "verify" page is in v1, and if so, plain-language copy that presents success/refusal/proof-gap/tamper/expired-mandate truthfully WITHOUT epistemic vocabulary or the labelled-ledger words (epistemic states appear only in JSON/agent surfaces). Record the enumeration/rate-limit posture the 05-03 route must enforce. Then resolve #34: post a resolution comment, close the issue, append one line to map issue #1. Pattern: allowlisted public DTO projection (`PublicActionReceiptReadback`) reused verbatim; no new field.</action>
  <verify>test -f .planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md && grep -q "no list" .planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md</verify>
  <acceptance_criteria>
    - Enumeration posture (held receiptId + no list; rate-limit decision) is explicit.
    - The hash-only readback field set is confirmed to leak no raw prompt/trace/provider payload/endpoint/key.
    - Any human copy is free of protocol/epistemic vocabulary.
  </acceptance_criteria>
  <done>05-03's verify action + route have a settled privacy contract and copy rules.</done>
</task>

<task type="auto">
  <name>Task 5: Resolve #32 — draft the live-money-evidence decision-record contents (gate only)</name>
  <files>.planning/scopes/scope-05-transactions-receipts/05-LIVE-MONEY-EVIDENCE-DRAFT.md</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md, .planning/ROADMAP.md (Money rails door :22, quarantine :201), .planning/adr/ADR-005-transactions-receipts.md (D6)</read_first>
  <action>Draft the contents a future `06-LIVE-MONEY-EVIDENCE-DECISION.md` must carry to satisfy the ROADMAP money-rails door and the D6 gate chain: named decision owner + date; live credential ownership (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` as live, server-only, no `VITE_`); the exact live binding contract (request/checkpoint/receipt refs via `client_reference_id` + metadata); refund/dispute/chargeback posture; reconciliation states (`matched|missing|mismatched|provider_unavailable|retry_available|retry_exhausted|no_repair`); support/kill-rule rows; the copy-scan allowlist; and an explicit statement that live money does NOT create AE-owned wallet/credits/custody/Connect/x402/settlement. Mark the file clearly as a GATE DRAFT: scope 5 does not implement live mode; this only prepares the gate. Then resolve #32: post a resolution comment, close the issue, append one line to map issue #1. Pattern: decision-record gate (ENGINEERING-STANDARDS theatre detector — "payment-ready without readback/idempotency/receipt/reversal" is rejected).</action>
  <verify>test -f .planning/scopes/scope-05-transactions-receipts/05-LIVE-MONEY-EVIDENCE-DRAFT.md && grep -q "GATE DRAFT" .planning/scopes/scope-05-transactions-receipts/05-LIVE-MONEY-EVIDENCE-DRAFT.md</verify>
  <acceptance_criteria>
    - All D6 required contents are enumerated.
    - The file states scope 5 does not implement live mode and claims no live money.
    - No AE-owned wallet/credits/custody/Connect/x402/settlement is introduced.
  </acceptance_criteria>
  <done>The live-money door has a drafted, unmet gate; no live code exists.</done>
</task>

</tasks>

<how_to_execute>
Fresh session: read the scope INDEX (SCOPE-05-INDEX.md), then execute this plan's tasks in order; TDD where marked (Task 1); run each task's `<verify>` after the task; write the SUMMARY.md named in `<output>`. Load `wayfinder`, `grilling`, `security-threat-model`, `tdd`, `stripe`, `domain-modeling` before starting. Do not run formatters/linters/full suites.
</how_to_execute>

<verification>
- [ ] npx vitest run tests/unit/business-action/two-slug-hash-chain.spike.test.ts
- [ ] npx vitest run tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/business-action/hermes-evidence.test.ts tests/unit/business-action/stripe-checkout-evidence.test.ts
- [ ] All four scope-dir decision records exist and pass their grep checks.
- [ ] #29, #30, #31, #34, #32 closed with resolution comments and map issue #1 updated.
</verification>

<success_criteria>
- The two-slug hash-chain spike proves safe widening for both slugs (success + refusal + tamper detection).
- The dated door-amendment record carries the ratified 6-point checklist and the exact replacement door-row text without editing ROADMAP.md.
- The non-paid slug card, public-verify privacy/copy, and live-money gate contents are all recorded.
- All five wave-1 tickets are resolved, closed, and reflected in the wayfinder map.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-05-transactions-receipts/05-01-SUMMARY.md` stating: source/local proof only; production proof not claimed; live money not implemented; `businessAction.propose` not yet exposed; provider-smoke status not counted as external proof.
</output>
