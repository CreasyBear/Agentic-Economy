---
phase: scope-05-transactions-receipts
plan: "05-03"
type: execute
wave: 3
depends_on: ["05-02"]
files_modified:
  - src/modules/business-action/business-action.actions.ts
  - src/modules/business-action/business-action.functions.ts
  - src/modules/business-action/public.ts
  - src/routes/api.business-actions.verify-receipt.ts
  - src/modules/actions/index.ts
  - tests/unit/business-action/propose-action.test.ts
  - tests/integration/business-action-verify-receipt-route.test.ts
  - tests/copy/phase6-business-action-claims.test.ts
autonomous: true
requirements: [D3, D4, D5]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: s5-propose-authored-not-registered
      statement: "businessAction.propose is authored as a proposal-only defineAction with a discriminated approval_required | clarification_required | refused | proof_gap | error output union, but is NOT added to the action registry — exposure is gated on scope-3 attributed identity."
    - id: s5-propose-never-consequence
      statement: "businessAction.propose creates an owner-pending Capability Request and returns a readback; it never books, charges, dispatches, or executes, and requires an active mandate (cap/TTL/allowed slug/allowed business)."
    - id: s5-owner-only-approval
      statement: "v1 checkpoint approval is owner-side only; buyer/principal intent is the up-front mandate; no interactive buyer-approval verb is added."
    - id: s5-public-verify-hash-only
      statement: "businessAction.verifyReceipt (readOnly) and the JSON HTTP route return only the existing PublicActionReceiptReadback (hashes + outcome + reconstructionStatus + labels); no raw prompt/trace/provider payload/endpoint/key is reachable."
    - id: s5-verify-non-enumerable
      statement: "The public verifier is keyed on a held receiptId with no list/enumeration endpoint; epistemic vocabulary appears only in JSON/agent surfaces per the 05-01 privacy record."
  artifacts:
    - path: src/modules/business-action/business-action.actions.ts
      provides: "proposeBusinessActionAction (authored, unregistered) + verifyReceiptAction (registered, read-only)."
    - path: src/routes/api.business-actions.verify-receipt.ts
      provides: "Public read-only JSON receipt-verification route, keyed on receiptId, no enumeration."
    - path: src/modules/actions/index.ts
      provides: "Registry adds only businessAction.verifyReceipt; propose stays out."
  key_links:
    - from: 05-01 privacy record (#34)
      to: verify action + route
      via: "Enumeration/rate-limit posture and hash-only readback are the settled contract the route enforces."
    - from: widened slug set (05-02)
      to: propose input validation
      via: "propose validates actionSlug against the closed BusinessActionSlugValues set — no arbitrary slug."
---

<objective>
Author the headline agent-door capability and expose the public trust artifact, both boundary-honest: `businessAction.propose` (proposal-only, mandate-bound) is written but NOT registered (exposure gated on scope 3), and `businessAction.verifyReceipt` + a JSON HTTP route publish the existing hash-only receipt readback with no enumeration.

Purpose: deliver the "counterparty trust for businesses no human runs" surface — a verifiable receipt — while keeping the widened write unreachable at the anonymous door and the verify surface leak-free.
Output: propose action (authored, unregistered), verify read action (registered), public verify route, and copy coverage.
</objective>

<context>
@.planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md
@.planning/adr/ADR-005-transactions-receipts.md
@src/modules/business-action/internal/business-action.ts
@src/modules/business-action/internal/schema.ts
@src/modules/business-action/business-action.functions.ts
@src/modules/business-action/public.ts
@src/modules/actions/index.ts
@src/modules/inquiries/inquiry.actions.ts
@src/routes/api.business-actions.stripe-webhook.ts
@AGENTS.md
</context>

<preflight_gates>
- Requires 05-02: the closed two-slug set and threaded verifier must exist; propose validates `actionSlug` against `BusinessActionSlugValues`.
- Requires 05-01 resolution of "Settle public receipt-verification privacy and human-surface copy (#34)": the enumeration posture, hash-only field set, and human-copy rules are the contract this plan enforces.
- GATE — "Confirm mandate-at-door binding for businessAction.propose (#35)" (scope-3-coupled research): the seam between a scope-3 verified principal and `validateMandate` (mandate missing/expired/over-cap/wrong-slug/wrong-business refusal codes) CANNOT be finalized until scope 3's identity contract lands. This plan authors the propose contract shape only. Registering the action in `src/modules/actions/index.ts` or exposing it at `src/routes/api.agent.tools.ts` is EXPLICITLY OUT OF SCOPE and blocked by #35 — anonymous exposure of a widened write is forbidden (research-ae-seams risk 6). Leave #35 open.
- Production public claims remain BLOCKED; test-mode only.
</preflight_gates>

<standards>
Rules that bind this plan's files:
- Actions (CONVENTIONS §Actions): `businessAction.propose` and `businessAction.verifyReceipt` live in `src/modules/business-action/business-action.actions.ts`, each with a boundary-honest `summary`, explicit `boundaries[]`, strict Zod `schema` + `outputSchema`, `readOnly`, `surfaces`, and one source runner. Only `verifyReceipt` is imported into `src/modules/actions/index.ts`.
- TS hard spec: `outputSchema` is a discriminated union (`kind`/`code`), not broad strings; no `any`/`as any`/non-null; expected failures are result unions, not throws.
- Route/server-function boundary: `src/routes/api.business-actions.verify-receipt.ts` validates input, calls the module server seam / public seam, returns a JSON DTO; it must NOT import provider SDKs, `convex/schema`, Convex transport, or module `internal/`. It reuses the `PublicActionReceiptReadback` projection verbatim (no new field). No-store/JSON headers per the existing webhook/JSON route pattern.
- Redaction: reuse `verifyActionReceipt`'s `publicReadback` (hashes + outcome + reconstructionStatus + labels only). `includePrivate` is never set on the public path.
- AGENTS.md: epistemic vocabulary (KNOWN/UNKNOWN/success/refusal/proof-gap/tamper/expired-mandate) only in JSON/agent surfaces; no `callable`/`autonomous`/`manifest`/`gateway` on any human surface; the action `summary`/`boundaries` state proposal-only and never imply booking/payment/dispatch.
- Source-write admission: propose reuses the closed `protected_action` write scope (no new scope); `CommandOptions` may carry idempotency key + correlation id only, never caller-supplied owner/admin/business authority.
</standards>

<antipatterns>
- Registering `businessAction.propose` (or wiring it at the anonymous door) before scope 3 → the registry test / agentTools snapshot must show propose is ABSENT; #35 preflight gate; research-ae-seams risk 6.
- A `verifyReceipt` output that leaks raw prompt/trace/provider payload/endpoint/key, or adds a field beyond `PublicActionReceiptReadback` → integration test asserts the exact allowlisted field set; redaction inherited verbatim.
- A list/enumeration endpoint or a scan of receipts → route exposes single-`receiptId` lookup only; integration test asserts no list route.
- Epistemic/protocol vocabulary on a human surface → `npm run test:copy` (phase6-business-action-claims, phase1-banned-copy) + `npm run test:ui-contract`.
- Adding an interactive buyer-approval verb (Link-app analog) → D4 boundary recorded; no such verb; mandate carries buyer intent.
- A bespoke `Ae*` component or CSS file for a verify page → AGENTS.md/DESIGN.md Astryx-first; `npm run test:ui-contract` class-scan (only if a human page is admitted by #34).
</antipatterns>

<skill_usage>
- Task 1 (propose authored): `codebase-design` (action seam), `security-threat-model` (why exposure is gated; blast radius of an anonymous widened write), `tdd`, `ponytail` (author contract, no premature door wiring).
- Task 2 (verify read action): `tdd`, `convex-security-audit` (confirm no private field escapes), `stripe` (confirm Stripe-evidence hashes stay hash-only in the public readback).
- Task 3 (verify route): `tanstack-start-best-practices` + `tanstack-router-best-practices` (route-as-adapter, input validator, JSON headers), `security-threat-model` (enumeration/rate-limit), `tdd`.
- Task 4 (copy): `tdd`, `ai-seo`/`seo-audit` (agent-surface epistemic states), `product-design`/`impeccable`/`make-interfaces-feel-better` (only if #34 admits a human verify page).
</skill_usage>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author businessAction.propose (proposal-only, mandate-bound) — do NOT register</name>
  <files>src/modules/business-action/business-action.actions.ts, src/modules/business-action/business-action.functions.ts, src/modules/business-action/public.ts, tests/unit/business-action/propose-action.test.ts</files>
  <read_first>.planning/adr/ADR-005-transactions-receipts.md (D3 defineAction sketch, D4), src/modules/inquiries/inquiry.actions.ts (defineAction shape), src/modules/business-action/internal/business-action.ts (createCapabilityRequest :250, validateMandate :698), src/modules/common/action.ts (defineAction/ActionContext), #35 preflight gate</read_first>
  <action>Create `business-action.actions.ts` exporting `proposeBusinessActionAction = defineAction({ id: 'businessAction.propose', ... })` per ADR D3: input schema `{ cardId, cardVersion, mandateId, actionSlug, inputSummary, requestedAmountCents?, currency?, idempotencyKey?, correlationId? }` (actionSlug validated against `BusinessActionSlugValues`); `outputSchema` a discriminated union `approval_required | clarification_required | refused | proof_gap | error`; boundary-honest `summary` + `boundaries[]` (proposal only; requires active mandate; refuse instant execution/autonomous fulfillment/owner-approval bypass; never books/charges/dispatches). `run` calls a new `proposeBusinessActionThroughSource` in `business-action.functions.ts` that creates a Capability Request (owner-pending) via the existing source seam, reusing the `protected_action` write scope and passing only idempotency/correlation options. Set `surfaces: ['agentJson','agentTools']` in the definition but DO NOT import it into `src/modules/actions/index.ts` (exposure gated on scope 3). Export the action type from `public.ts`. Add a unit test asserting: proposal returns a readback (never a completed consequence), a missing/expired/over-cap/wrong-slug/wrong-business mandate returns the correct refusal, and the action is absent from `listActions()`/`listAgentToolActions()`. Pattern: `defineAction` contract (ARCHITECTURE §Action Contract), owner-pending Capability Request (createCapabilityRequest).</action>
  <verify>npx vitest run tests/unit/business-action/propose-action.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - propose returns approval_required/clarification_required/refused/proof_gap/error — never a completed consequence.
    - Mandate refusals (missing/expired/over-cap/wrong-slug/wrong-business) are covered.
    - propose is NOT in the action registry (asserted by test).
  </acceptance_criteria>
  <done>The headline capability is authored and inert until scope 3.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add businessAction.verifyReceipt read-only action + register it</name>
  <files>src/modules/business-action/business-action.actions.ts, src/modules/business-action/business-action.functions.ts, src/modules/actions/index.ts, src/modules/business-action/public.ts, tests/unit/business-action/propose-action.test.ts</files>
  <read_first>src/modules/business-action/internal/business-action.ts (verifyActionReceipt :638-696, PublicActionReceiptReadback build :666-681), .planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md, src/modules/registry/registry.actions.ts (read-only action shape)</read_first>
  <action>Add `verifyReceiptAction = defineAction({ id: 'businessAction.verifyReceipt', readOnly: true, surfaces: ['agentJson','agentTools'], ... })`. Input: `{ receiptId }`. Output: the existing `PublicActionReceiptReadback` (hash-only) plus a `not_found` result for an unheld/unknown id — NEVER `includePrivate`. `run` reads the receipt through a new read-only source seam (`readPublicBusinessActionReceiptThroughSource`) and returns `verifyActionReceipt(state, receipt)` public readback only. No identity required (hash-only output). Import `verifyReceiptAction` into `src/modules/actions/index.ts` (read-only; safe to expose). Add tests asserting the readback carries only the allowlisted fields and returns not_found for an unknown id. Pattern: read-only action + allowlisted DTO projection (registry.search/detail).</action>
  <verify>npx vitest run tests/unit/business-action/propose-action.test.ts && npm run typecheck && npm run test:imports</verify>
  <acceptance_criteria>
    - verifyReceipt is read-only, registered, and returns hash-only PublicActionReceiptReadback.
    - Unknown/unheld receiptId returns a typed not_found, not a leak.
    - No private field is reachable through the action.
  </acceptance_criteria>
  <done>The public receipt trust artifact is exposed to assistants, hash-only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add the public read-only receipt-verification JSON route</name>
  <files>src/routes/api.business-actions.verify-receipt.ts, tests/integration/business-action-verify-receipt-route.test.ts</files>
  <read_first>src/routes/api.business-actions.stripe-webhook.ts (route/JSON/header pattern), src/modules/business-action/public.ts, .planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md, .planning/codebase/ARCHITECTURE.md (Machine and API Routes)</read_first>
  <action>Add `src/routes/api.business-actions.verify-receipt.ts` handling `GET /api/business-actions/verify-receipt?receiptId=...` and/or `POST {receiptId}`, keyed on a held `receiptId`, with NO list/enumeration endpoint. Validate input, call the module verify seam, return the hash-only `PublicActionReceiptReadback` as JSON with no-store/JSON headers; map an unknown/unheld id to a JSON not_found (no existence oracle beyond what the 05-01 privacy record permits); enforce the rate-limit posture that record settled. Map `reconstructionStatus` to public epistemic states in the JSON body only. Add an integration test asserting: hash-only fields, no list route, no raw payload/endpoint/key, and correct not_found. Pattern: route-as-adapter (routes validate + call module seam + render; no provider SDK / Convex schema / module internal imports).</action>
  <verify>npx vitest run tests/integration/business-action-verify-receipt-route.test.ts && npm run test:imports && npm run typecheck</verify>
  <acceptance_criteria>
    - Route returns hash-only readback for a held receiptId; no list endpoint exists.
    - No raw prompt/trace/provider payload/endpoint/key is reachable.
    - Route imports respect the route boundary (no SDK/schema/internal).
  </acceptance_criteria>
  <done>The public receipt verifier is reachable as JSON, leak-free and non-enumerable.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Copy + agent-surface coverage for the verify surface</name>
  <files>tests/copy/phase6-business-action-claims.test.ts</files>
  <read_first>.planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md, tests/copy/phase6-business-action-claims.test.ts, AGENTS.md (:67-72, :90-92)</read_first>
  <action>Add copy coverage proving: the propose/verify action `summary` and `boundaries[]` state proposal-only and never imply booking/payment/dispatch/autonomous fulfillment; the verify surface uses epistemic vocabulary (success/refusal/proof-gap/tamper/expired-mandate) ONLY in JSON/agent payloads, never as labels on any human surface; and any admitted human "verify" copy (per #34) stays free of protocol vocabulary. Reject `verified` used unqualified for the receipt outcome. Pattern: claims-register copy scan (owned-context allowance only).</action>
  <verify>npm run test:copy</verify>
  <acceptance_criteria>
    - propose/verify copy is boundary-honest and protocol-free on human surfaces.
    - Epistemic states are confined to JSON/agent surfaces.
    - `verified` never appears unqualified.
  </acceptance_criteria>
  <done>The new surfaces cannot overclaim or leak protocol/epistemic vocabulary.</done>
</task>

</tasks>

<how_to_execute>
Fresh session: read the scope INDEX, then execute this plan's tasks in order; TDD where marked; run each task's `<verify>` after the task; write the SUMMARY.md named in `<output>`. Load `codebase-design`, `security-threat-model`, `tanstack-start-best-practices`, `tanstack-router-best-practices`, `stripe`, `tdd`, `ponytail` first. Keep `businessAction.propose` unregistered; leave #35 open. Do not run formatters/linters/full suites.
</how_to_execute>

<verification>
- [ ] npx vitest run tests/unit/business-action/propose-action.test.ts
- [ ] npx vitest run tests/integration/business-action-verify-receipt-route.test.ts
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npm run test:imports
- [ ] npm run test:copy
- [ ] businessAction.propose is confirmed ABSENT from the action registry; #35 remains open.
</verification>

<success_criteria>
- propose is authored, proposal-only, mandate-bound, and unregistered (exposure gated on scope 3 / #35).
- verifyReceipt (read-only) and the JSON route return hash-only PublicActionReceiptReadback with no enumeration and no private-field leak.
- Owner-only approval boundary is preserved; no buyer-approval verb added.
- Copy scans green; epistemic vocabulary confined to JSON/agent surfaces.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-05-transactions-receipts/05-03-SUMMARY.md` stating: source/local proof only; production proof not claimed; businessAction.propose authored but NOT exposed (gated on scope 3, #35 open); verify surface is hash-only/non-enumerable; provider-smoke status not counted as external proof.
</output>
