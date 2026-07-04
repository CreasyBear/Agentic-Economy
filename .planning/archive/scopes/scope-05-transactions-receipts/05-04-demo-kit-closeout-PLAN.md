---
phase: scope-05-transactions-receipts
plan: "05-04"
type: execute
wave: 4
depends_on: ["05-02", "05-03"]
files_modified:
  - examples/receipt-backed-business-action/README.md
  - examples/receipt-backed-business-action/seed-business.ts
  - examples/receipt-backed-business-action/agent-script.ts
  - examples/receipt-backed-business-action/.env.example
  - tests/e2e/receipt-backed-business-action-demo.spec.ts
  - tests/copy/phase6-business-action-claims.test.ts
  - package.json
autonomous: true
requirements: [D7, D8]
user_setup:
  - "Local dev Convex reachable (npx convex dev) with test-mode STRIPE_* + CONVEX_URL from .env.example; the kit produces LOCAL/test-mode proof only."
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: s5-demo-kit-runs-loop
      statement: "The examples/ demo kit runs the full loop against a seeded local Convex business: propose (agent door) -> owner approves out-of-band -> Stripe test-mode / Hermes evidence -> result artifact -> read the public receipt, reconstructing success for the paid slug and refusal for the non-paid slug."
    - id: s5-demo-kit-no-route-fixtures
      statement: "The kit lives under examples/ as a top-level, non-route, non-src fixture tree; it reuses source seams and introduces no route-local fixtures and no hosted-agent runtime."
    - id: s5-demo-kit-copy-honest
      statement: "Kit README and all human copy say receipt-backed business operation, state Stripe test mode + owner approval, and never say autonomous business / agent marketplace / agent checkout / wallet for agents; copy scans enforce it."
    - id: s5-demo-fail-loud
      statement: "The demo e2e/smoke fails loudly listing every missing input (base URL, seeded ids, test-mode Stripe evidence) and is never counted as external/deployed proof."
    - id: s5-closeout-wording
      statement: "The scope SUMMARY states source/local proof only, production proof not claimed, live money not implemented, propose not exposed, and provider-smoke status not counted as external proof."
  artifacts:
    - path: examples/receipt-backed-business-action/agent-script.ts
      provides: "Hermes-skill-shaped external agent driving the loop against the seeded business."
    - path: examples/receipt-backed-business-action/seed-business.ts
      provides: "Seeds one agent-operated business + two action cards into dev Convex."
    - path: tests/e2e/receipt-backed-business-action-demo.spec.ts
      provides: "Fail-loud e2e proving the seeded loop reconstructs success + refusal."
  key_links:
    - from: locked non-paid card (05-01)
      to: seed-business.ts
      via: "The seeded business carries both the paid and locked non-paid action cards."
    - from: demo loop
      to: businessAction.verifyReceipt (05-03)
      via: "The kit reads the public receipt through the read-only verifier, reconstructing success + refusal."
---

<objective>
Ship the hackathon demo kit under `examples/` and close the scope honestly: a seeded agent-operated business, a Hermes-shaped external agent script that drives the full receipt loop for both slugs, a README, and a fail-loud e2e — all labeled local/test-mode, with copy and closeout wording gates that reject any production/autonomous/money claim.

Purpose: make safe non-execution and receipt reconstruction as memorable as the happy path, without turning AE into a marketplace or claiming production capability.
Output: demo kit files under examples/, a fail-loud demo e2e + package script, extended demo-kit copy scans, and the closeout SUMMARY wording gate.
</objective>

<context>
@.planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md
@.planning/scopes/scope-05-transactions-receipts/05-PUBLIC-VERIFY-PRIVACY-COPY.md
@.planning/adr/ADR-005-transactions-receipts.md
@src/modules/business-action/business-action.functions.ts
@src/modules/business-action/public.ts
@src/routes/api.business-actions.verify-receipt.ts
@tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts
@AGENTS.md
</context>

<preflight_gates>
- Requires 05-02 (widened two-slug loop) and 05-03 (verifyReceipt action + route). The kit exercises both slugs and reads receipts through the public verifier.
- Requires 05-01 resolution of "Lock the v1 non-paid slug card schema against the demo business (#31)" and "Settle public receipt-verification privacy and human-surface copy (#34)".
- Cross-scope: the kit assumes an agent-operated demo business. If scope 2 has not landed one, the kit SEEDS a local fixture business (seed-business.ts) and the README states this is a local seeded fixture, not a live scope-2 business. LOCAL proof, not deployed proof.
- The external agent is a Hermes-skill-shaped LOCAL script (per research-handshake host-activation profiles), NOT a hosted Hermes runtime — recorded in the README.
- Owner approval happens OUT-OF-BAND (the kit does not self-approve): the script pauses for an owner checkpoint acceptance recorded through the owner seam.
- Production/live-money claims remain BLOCKED. This is a LOCAL/test-mode kit; it never flips production acceptance state.
</preflight_gates>

<standards>
Rules that bind this plan's files:
- `examples/**` is the ONE non-`.planning` write tree admitted for this scope (D7); files are NEW. The kit reuses source seams (`business-action.functions.ts` / `public.ts` / the verify route) — it does NOT reach into module `internal/` and adds NO route-local demo fixtures (06-ENGINEERING-REQUIREMENTS.md:88).
- TS hard spec applies to `seed-business.ts` / `agent-script.ts` (no `any`/`as any`/non-null; typed results). `console` is permitted here because the kit is CLI/test tooling (CONVENTIONS §Logging), unlike runtime code.
- Fail-loud smoke discipline (06-VERIFICATION follow-ons): the demo e2e throws with a clear list of every missing input and cannot be counted as external/deployed proof; mirror the existing `phase6-business-action-stripe-smoke.spec.ts` fail-loud contract.
- AGENTS.md/DESIGN.md: any human copy in the README/kit output is free of protocol vocabulary and never claims booking/payment/dispatch/autonomous fulfillment; uses `receipt-backed business operation`, states `Stripe test mode` + `owner approval required`.
- D8 hackathon/production separation: kit output + README are labeled hackathon/test-mode/local; the kit never mutates production acceptance state.
</standards>

<antipatterns>
- "receipt-backed business operation" drifting into "autonomous business" / "agent marketplace" / "agent checkout" / "AI checkout" / "wallet for agents" in README/output → `npm run test:copy` (phase6-business-action-claims) rejects the banned phrases.
- Route-local demo fixtures or a hosted-agent runtime → the kit lives only under `examples/` and reuses source seams; `npm run test:source-mining` + `npm run test:imports` guard route/module boundaries.
- The demo e2e silently skipping or being read as deployed proof → the spec fails loud listing missing inputs and its SUMMARY line states it is not external/deployed proof.
- Enabling Stripe live mode "for the demo" → `.env.example` carries test-mode placeholders only; D6 live gate stays unmet; copy scans forbid live/production payment language.
- Claiming production/verified capability in the closeout → the SUMMARY wording gate requires `source/local proof only` + `production proof not claimed`; `verified` never used unqualified.
</antipatterns>

<skill_usage>
- Task 1 (kit build + run): `playwright` (drive/verify the loop), `stripe` (test-mode Checkout/webhook evidence wiring), `convex-best-practices` (seed via source seams), `tdd`, `ponytail` (smallest kit that proves the loop — no hosted runtime).
- Task 2 (demo copy gate): `tdd`, `ai-seo`/`seo-audit` (agent vs human surface), `product-design` (plain README copy).
- Task 3 (fail-loud e2e + script): `playwright`, `security-threat-model` (what must be present before the loop can claim anything), `tdd`.
- Closeout: `code-review` (final diff review), `learn` (capture durable scope-5 learnings).
</skill_usage>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build the examples/ demo kit and run the full loop (resolve #33)</name>
  <files>examples/receipt-backed-business-action/README.md, examples/receipt-backed-business-action/seed-business.ts, examples/receipt-backed-business-action/agent-script.ts, examples/receipt-backed-business-action/.env.example</files>
  <read_first>.planning/adr/ADR-005-transactions-receipts.md (D7, D8), resolution of #31 (05-NONPAID-SLUG-CARD-LOCK.md), src/modules/business-action/business-action.functions.ts (source seams :193-401), src/routes/api.business-actions.verify-receipt.ts, .planning/phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md (minimum demo story :156-171)</read_first>
  <action>Create `examples/receipt-backed-business-action/`: (1) `seed-business.ts` seeds one agent-operated business plus BOTH action cards (paid `provision-paid-intake-endpoint` + locked non-paid `publish-agent-intake-endpoint`) into dev Convex through the existing source seams (no route-local fixture); (2) `agent-script.ts`, a Hermes-skill-shaped LOCAL external agent that runs the loop for BOTH slugs: propose (through the agent-door contract shape) -> owner approves OUT-OF-BAND (recorded via the owner checkpoint seam) -> external evidence (Stripe test-mode Checkout evidence for the paid slug via the signed webhook; Hermes/endpoint_host evidence for the non-paid slug) -> result artifact -> read the public receipt via `businessAction.verifyReceipt` / the verify route, printing the reconstructed status; (3) `.env.example` with test-mode `STRIPE_*` + `CONVEX_URL` placeholders (no secrets committed); (4) `README.md` with run steps, explicit test-mode/hackathon/local labeling, the local-fixture-vs-scope-2 note, and the Hermes-shaped-local-script note. Run it to confirm the paid slug reconstructs success and the non-paid slug reconstructs refusal. Then resolve #33: post a resolution comment ("Run the full demo-kit receipt loop against a seeded fixture (#33)"), close the issue, append one line to wayfinder map issue #1. Pattern: seed via source seams (devSeed-style) + read-only verifier readback; no hosted-agent runtime.</action>
  <verify>npm run seed:dev && node --import tsx examples/receipt-backed-business-action/seed-business.ts && node --import tsx examples/receipt-backed-business-action/agent-script.ts</verify>
  <acceptance_criteria>
    - The loop runs end-to-end for both slugs against seeded local Convex.
    - Paid slug reconstructs success; non-paid slug reconstructs refusal.
    - The kit uses source seams only; no route-local fixture; no hosted runtime; no committed secrets.
  </acceptance_criteria>
  <done>The hackathon proof artifact exists and runs locally in test mode.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Demo-kit copy scan + closeout wording gate</name>
  <files>tests/copy/phase6-business-action-claims.test.ts</files>
  <read_first>tests/copy/phase6-business-action-claims.test.ts, examples/receipt-backed-business-action/README.md, AGENTS.md (:14-19, :90-92), .planning/adr/ADR-005-transactions-receipts.md (D7 copy rules, D8)</read_first>
  <action>Extend the Phase-6 copy scan to cover `examples/receipt-backed-business-action/**` human copy: allow `receipt-backed business operation`; require the `Stripe test mode` + `owner approval required` disclosures; FAIL on `autonomous business`, `agent marketplace`, `agent checkout`, `AI checkout`, `wallet for agents`, live/production payment claims, and protocol/epistemic vocabulary. Add/extend the closeout-wording rule requiring scope-5 summaries to state `source/local proof only`, `production proof not claimed`, and that provider-smoke status is not external proof unless configured evidence passes. Pattern: claims-register copy scan (owned-context allowance + closeout wording gate, mirroring 06-06 Task 2).</action>
  <verify>npm run test:copy</verify>
  <acceptance_criteria>
    - README/kit copy passes the allowed phrase + required disclosures and fails the banned phrases.
    - The closeout wording rule is test-covered.
  </acceptance_criteria>
  <done>Demo-kit copy and closeout wording cannot overclaim.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fail-loud demo e2e + package script</name>
  <files>tests/e2e/receipt-backed-business-action-demo.spec.ts, package.json</files>
  <read_first>tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts (fail-loud contract), examples/receipt-backed-business-action/agent-script.ts, package.json (scripts)</read_first>
  <action>Add `tests/e2e/receipt-backed-business-action-demo.spec.ts`: it drives the seeded loop (or asserts the agent-script output) and reconstructs success (paid slug) + refusal (non-paid slug) through the public verify route, and it FAILS LOUD listing every missing input (local base URL, seeded card/request/receipt ids, test-mode Stripe evidence refs) when the env is not configured — it must reject screenshots/return URLs/dashboards/webhook-arrival-alone as proof. Add a `test:demo-kit` script to `package.json` (`playwright test tests/e2e/receipt-backed-business-action-demo.spec.ts`). Do NOT duplicate the existing `test:provider-smoke:business-action-stripe`; this e2e is the local demo-loop check, distinct from the deployed provider smoke. Pattern: fail-loud smoke discipline (06-VERIFICATION follow-ons; mirrors phase6 stripe smoke).</action>
  <verify>npm run test:demo-kit</verify>
  <acceptance_criteria>
    - Missing inputs produce a clear failure listing every required input.
    - A configured local run reconstructs success + refusal for the two slugs.
    - The spec states it is local proof, not external/deployed proof.
  </acceptance_criteria>
  <done>The demo loop has a fail-loud e2e that cannot create false deployed proof.</done>
</task>

</tasks>

<how_to_execute>
Fresh session: read the scope INDEX, then execute this plan's tasks in order; TDD where marked; run each task's `<verify>` after the task; write the SUMMARY.md named in `<output>`. Load `playwright`, `stripe`, `convex-best-practices`, `tdd`, `ponytail`, `code-review`, `learn` first. Bring up local dev Convex (`npx convex dev`) and seed before running the loop. Do not run formatters/linters/full suites.
</how_to_execute>

<verification>
- [ ] npm run seed:dev && node --import tsx examples/receipt-backed-business-action/seed-business.ts && node --import tsx examples/receipt-backed-business-action/agent-script.ts
- [ ] npm run test:demo-kit
- [ ] npm run test:copy
- [ ] #33 closed with a resolution comment and map issue #1 updated.
- [ ] npm run test:provider-smoke:business-action-stripe still fails loud (deployed proof not configured) — confirmed NOT counted as external proof.
</verification>

<success_criteria>
- The demo kit runs the full loop against a seeded local business, reconstructing success (paid) + refusal (non-paid).
- The kit is under examples/ only, reuses source seams, adds no route-local fixture or hosted runtime, and commits no secrets.
- Demo-kit copy + closeout wording gates reject autonomous/marketplace/wallet/checkout/live-money claims and require the honest disclosures.
- The demo e2e fails loud on missing inputs and is never counted as external/deployed proof.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-05-transactions-receipts/05-04-SUMMARY.md` stating: source/local proof only; production proof not claimed; Stripe test mode only, live money not implemented (D6 gate unmet); businessAction.propose authored but NOT exposed (scope 3 / #35 open); demo kit is a local seeded fixture, not deployed proof; provider-smoke status not counted as external proof unless configured evidence passes.
</output>
