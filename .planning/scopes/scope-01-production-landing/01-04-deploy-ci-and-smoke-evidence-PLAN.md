---
phase: scope-01-production-landing
plan: "01-04"
type: execute
wave: 2
depends_on: ["01-01", "01-02", "01-03"]
files_modified:
  - vite.config.ts
  - .github/workflows/eval-gate.yml
  - .env.example
  - .planning/scopes/scope-01-production-landing/EVIDENCE-deploy-smokes.md
  - .planning/archive/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md
requirements: [D1, D2, D8, D9]
user_setup:
  - "Select and provision the Vercel project/deployment (deploy-target selection is a USER task)."
  - "Provision deployed Convex source state and set CONVEX_URL/VITE_CONVEX_URL + CLERK_SECRET_KEY + AE_CANONICAL_BASE_URL + AE_CANONICAL_HOST_ALLOWLIST on the deployment (names only recorded)."
  - "Create a real Resend account (RESEND_API_KEY, RESEND_FROM) and Novu account (NOVU_SECRET_KEY, NOVU_WORKFLOW_INQUIRY_OWNER); set AE_NOTIFICATION_OUTBOX_SECRET on server + shell."
  - "Provision sandbox Autumn + test-mode Stripe and the P5 (8) / P6 (10) smoke env vars, plus operator Clerk storage-state files (SMOKE_P5_OWNER_STORAGE_STATE)."
  - "Seed an eligible published business + complete human_inquiry_owner_inbox support row for SMOKE_PHASE2_BUSINESS_SLUG on the deployment."
execution_scope: deployed
production_executable: false
autonomous: false
must_haves:
  truths:
    - id: s1-vercel-pinned
      statement: "The Nitro preset is pinned to 'vercel' with a standardized server runtime confirmed to serve scope-3 signature verification (WebCrypto/HMAC + raw body)."
    - id: s1-smokes-ordered-evidence
      statement: "The Scope-1 deployed evidence suite runs in fixed order against a deployed sandbox/test-mode env and non-secret evidence is captured per the blocker-doc schema."
    - id: s1-pr-gate-extended
      statement: "The PR gate runs test:types, test:source-mining, test:ts-standards, test:seo; deploy-smokes and e2e/a11y stay OFF the PR gate."
    - id: s1-money-boundary
      statement: "Scope 1 stops at sandbox Autumn + test-mode Stripe; live money is gated on named money-rail decision records; no scope-1 copy implies live payment."
  artifacts:
    - path: .planning/scopes/scope-01-production-landing/EVIDENCE-deploy-smokes.md
      provides: "Non-secret deploy-smoke evidence: host, slug, refs, dispatch IDs, redacted provider refs, payload hashes, states, operator next action, 'no secret values recorded'."
    - path: .github/workflows/eval-gate.yml
      provides: "Extended PR gate with the four cheap deterministic scans."
    - path: vite.config.ts
      provides: "Pinned nitro preset + standardized runtime."
  key_links:
    - from: Scope-1 deployed evidence suite
      to: EVIDENCE-deploy-smokes.md
      via: "A smoke counts as external proof only when it passes with configured non-secret evidence; missing inputs fail loud, listing every required var."
    - from: deployed claim->publish->status->inquiry loop
      to: owner activation
      via: "Attribution readback intact; the five real owner packets remain GTM-side deferred debt (D9)."
---

<objective>
Make scope 1 deploy-provable and honest: pin the Vercel/Nitro target (ADR-001 D1) with a runtime confirmed for scope-3 signature verification (#3); extend the PR gate with the cheap deterministic scans (D8) after settling the CI boundary (#7); record the money boundary (#6); and stand up the deployed env to run the Scope-1 deployed evidence suite and capture non-secret evidence (D2/D9, #5). Clears the STATE.md deploy-smoke blockers; the five friendly-owner activation packets stay GTM-side deferred debt (D9).

Purpose: convert local proof into deployed, evidenced product and lock the CI/target/money boundaries.
Output: pinned preset, extended PR gate, money-boundary statement, deployed smoke evidence file, updated blocker doc closeout.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-01-INDEX.md`) and confirm 01-01/01-02/01-03 are landed AND deployed. Execute Tasks 1-3 (autonomous: pin/CI/decision) in order, then Task 4 only after the user_setup provisioning above is complete. Tasks 1-3 resolve tickets #3/#7/#6 first (post resolution comments, close, append to map issue #1). TDD is not the mode here (config/CI/evidence); run each task's `<verify>`. On completion write the SUMMARY.md named in `<output>`. The D5 authz NARROW step (from 01-03) runs after Task 4's first deploy establishes one dual-read window.
</how_to_execute>

<context>
@.planning/adr/ADR-001-scope1-production-landing.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@.planning/archive/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md
@AGENTS.md
@vite.config.ts
@.github/workflows/eval-gate.yml
@package.json
@tests/deploy-smoke/vercel-bypass.ts
@tests/deploy-smoke/phase1-deploy-smoke.spec.ts
@tests/deploy-smoke/phase2-support-record-smoke.spec.ts
@tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts
@tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts
@tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts
@tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts
@local://research-ae-seams.md
</context>

<standards>
- **Theatre detector + boundary posture:** a smoke is external proof ONLY when it passes with configured non-secret evidence; fail-loud absence never counts (ENGINEERING-STANDARDS §Theatre detector; blocker-doc discipline). No copy claims booking/payment/dispatch/autonomous fulfillment; live money stays gated (ROADMAP L22, L226).
- **Secret handling:** evidence records env var NAMES, receipt/dispatch IDs, and redacted refs only — never secret values (CONCERNS §"Secret-bearing environment files"; blocker-doc L125). Deploy-smokes keep localhost rejection and explicit required-env validation.
- **Testing standards:** the PR gate additions (`test:types`, `test:source-mining`, `test:ts-standards`, `test:seo`) are deterministic and fast; the D3/D6/D7 tests ride the existing `test:unit` step; deploy-smokes run in a separate manual/scheduled deployed job.
- **Dependencies at risk:** pin the Nitro preset in `vite.config.ts` (`nitro({ preset: 'vercel', ... })`) — a two-way door revisited only if scope-3 signature verification needs an unsupported runtime (#3). Keep framework/Nitro changes isolated; regenerate route tree only through project scripts.
- **/ponytail full:** smallest CI/config change that closes the gap; no new bespoke workflow scaffolding.
</standards>

<antipatterns>
- Counting a skipped/absent smoke as deployed proof → the smoke fails loud listing every missing input; EVIDENCE file only records passing, configured runs (ROADMAP bloat-relapse / theatre detector).
- Any scope-1 copy implying live payment/booking/dispatch → `npm run test:copy` + `npm run test:seo`; the #6 money-boundary statement + Phase-1 banned-copy scans hold the line.
- Putting deploy-smokes / e2e / a11y on the PR gate (stalls delivery on secrets/flake) → #7 resolution keeps them off the blocking gate; the workflow only adds the four cheap scans.
- Pinning a runtime that forecloses scope-3 signature verification → #3 confirms WebCrypto/HMAC + raw-body access first; if unsupported, D1 reopens (recorded, not silently overridden).
- Recording secret values in evidence → the EVIDENCE file template enforces names/refs/redacted-only + an explicit "no secret values recorded" line.
- Claiming Phase 2 closeout before green smokes → the blocker doc closeout guard stays until evidence is green.
</antipatterns>

<skill_usage>
- **grilling:** resolve #7 (CI PR-blocking vs nightly/manual matrix) and #6 (money posture boundary) — adversarial boundary-setting (maps to standards-table review/GTM intent).
- **tanstack-start-best-practices + sentry:** confirm and pin the Vercel/Nitro runtime; keep the Sentry release wiring (`VERCEL_GIT_COMMIT_SHA`) intact (#3, D1).
- **playwright:** run the Scope-1 deployed evidence suite against the deployed origin and capture readbacks via `/admin/inquiries` where applicable (D2, #5).
- **convex-performance-audit:** confirm the deployed source-state reads (seeded catalog + support row) do not exercise the guarded fallbacks under load.
- **security-best-practices (cso lens):** enforce redaction + secret handling in the evidence artifact.
- **code-review:** final Standards + Spec pass on the config/CI diff.
</skill_usage>

<preflight_gates>
- **Depends on 01-01, 01-02, 01-03 landed AND deployed** — the deployed smokes assert the security headers (01-02), canonical URLs (01-01), and tokenIdentifier dual-read authz (01-03).
- **Ticket #2 (CSP prototype) resolved (01-02)** — blocks #5 (per tickets-scope-1.json `blocked_by`).
- **Deployed env + provider secrets + seeded source state are USER SETUP** (see `user_setup`). Task 4 is BLOCKED until provisioning is complete; hence `production_executable: false` and `autonomous: false`.
- Live-mode money smokes stay OUT (sandbox Autumn + test-mode Stripe only); live money requires a named money-rail decision record first (#6, ROADMAP L22/L226).
</preflight_gates>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve ticket #3 (Vercel runtime for scope-3 signatures) and pin the Nitro preset (D1)</name>
  <files>vite.config.ts</files>
  <read_first>local://research-ae-seams.md, vite.config.ts, tests/deploy-smoke/vercel-bypass.ts, local://tickets-scope-1.json (#3 body)</read_first>
  <action>Confirm the Vercel runtime AE deploys on (node vs edge) exposes the WebCrypto/HMAC verify primitives and raw-body access scope 3 needs to verify agent HTTP Message Signatures / Web Bot Auth at `/api/agent/tools`, and that pinning does not foreclose scope 3. Pin `nitro({ preset: 'vercel', ... })` (and the chosen runtime) in `vite.config.ts`; keep the Sentry release wiring intact. If the runtime cannot serve scope-3 verification, record that D1 reopens (do NOT silently override). Post the resolution comment on issue #3, close it, and append one line to map issue #1 "Decisions so far".</action>
  <verify>npm run build && npm run typecheck</verify>
  <acceptance_criteria>
    - Nitro preset pinned to 'vercel' with a standardized runtime; build green.
    - Runtime confirmed for scope-3 signature verification (or D1-reopen recorded).
    - Issue #3 closed with resolution; map issue #1 updated.
  </acceptance_criteria>
  <done>The deploy target/runtime is pinned and scope-3-safe.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Resolve ticket #7 (CI gate boundary) and extend the PR gate (D8)</name>
  <files>.github/workflows/eval-gate.yml</files>
  <read_first>.github/workflows/eval-gate.yml, package.json, resolution of #6 (Task 3)</read_first>
  <action>Decide the exact job matrix: PR-blocking set = current gate + `test:types`, `test:source-mining`, `test:ts-standards`, `test:seo` (deterministic + fast; the D3/D6/D7 tests already ride `test:unit`); nightly/manual set = e2e, a11y, graph-freshness, and the deployed provider-smoke evidence job. Add the four scans to `eval-gate.yml`; keep deploy-smokes and e2e/a11y OFF the PR gate. Post the resolution comment on issue #7, close it, and append one line to map issue #1 "Decisions so far".</action>
  <verify>npm run test:types && npm run test:source-mining && npm run test:ts-standards && npm run test:seo</verify>
  <acceptance_criteria>
    - eval-gate.yml runs the four added scans on every PR.
    - Deploy-smokes/e2e/a11y remain off the blocking gate (documented in #7 resolution).
    - Issue #7 closed with resolution; map issue #1 updated.
  </acceptance_criteria>
  <done>The PR gate covers the cheap deterministic scans without stalling on flake/secrets.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Resolve ticket #6 (money-posture boundary for scope 1)</name>
  <files>.planning/scopes/scope-01-production-landing/EVIDENCE-deploy-smokes.md</files>
  <read_first>.planning/ROADMAP.md (L22, L226), AGENTS.md, tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts, local://tickets-scope-1.json (#6 body)</read_first>
  <action>Write the explicit boundary statement (default: sandbox Autumn + test-mode Stripe only; live money gated) into the EVIDENCE file header: scope 1's "deployed product" claim is satisfiable with test-mode/sandbox evidence; name the money-rail decision records (ROADMAP L22, L226) that must fire before any live-mode smoke; confirm no scope-1 copy implies live payment. Post the resolution comment on issue #6, close it, and append one line to map issue #1 "Decisions so far".</action>
  <verify>npm run test:copy && npm run test:seo</verify>
  <acceptance_criteria>
    - Money boundary recorded; live-mode decision records named as prerequisites.
    - Copy/SEO scans confirm no live-payment implication.
    - Issue #6 closed with resolution; map issue #1 updated.
  </acceptance_criteria>
  <done>Scope 1's money posture is explicit and gated.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Stand up deployed env, run the Scope-1 deployed evidence suite, capture evidence (D2, D9; #5)</name>
  <files>.planning/scopes/scope-01-production-landing/EVIDENCE-deploy-smokes.md, .planning/archive/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md</files>
  <read_first>.planning/archive/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md, .planning/scopes/SCOPE-EXECUTION-READINESS.md, tests/deploy-smoke/phase1-deploy-smoke.spec.ts, tests/deploy-smoke/phase2-support-record-smoke.spec.ts, tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts, tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts, resolution of #2 (01-02)</read_first>
  <action>After user_setup provisioning: run the suite in this order — (1) `test:deploy-smoke` for phase1 headers/canonical URLs; (2) `test:phase2-support-smoke`; (3) create a real inquiry via `/{slug}/inquiry` to mint owner Resend + Novu dispatch IDs, proven through `/admin/inquiries`; (4) `test:provider-smoke:resend`; (5) `test:provider-smoke:novu`; (6) seed a P5 billing operation then `test:provider-smoke:autumn-stripe`; (7) seed a P6 request->checkpoint->receipt + test-mode Stripe checkout/event then `test:provider-smoke:business-action-stripe`. Capture non-secret evidence per `.planning/scopes/SCOPE-EXECUTION-READINESS.md` into `EVIDENCE-deploy-smokes.md`, update the blocker-doc closeout, and note STATE.md blockers cleared. Every skipped/missing-input case is a failure, not proof.</action>
  <verify>npm run test:deploy-smoke && npm run test:phase2-support-smoke && npm run test:provider-smoke:resend && npm run test:provider-smoke:novu && npm run test:provider-smoke:autumn-stripe && npm run test:provider-smoke:business-action-stripe</verify>
  <acceptance_criteria>
    - All seven Scope-1 deployed evidence rows pass against the deployed sandbox/test-mode env.
    - EVIDENCE file records host/slug/refs/dispatch IDs/redacted refs/payload hashes/states/operator next action + "no secret values recorded".
    - Blocker-doc closeout updated; STATE.md deploy-smoke blockers cleared; five owner packets noted as GTM-side deferred debt.
  </acceptance_criteria>
  <done>Scope 1 is deploy-proven with non-secret evidence, sandbox/test-mode only.</done>
</task>
</tasks>

<verification>
- [ ] npm run build   # nitro preset pinned
- [ ] npm run test:types && npm run test:source-mining && npm run test:ts-standards && npm run test:seo
- [ ] npm run test:copy
- [ ] (deployed, after user_setup) npm run test:phase2-support-smoke
- [ ] (deployed) npm run test:provider-smoke:resend && npm run test:provider-smoke:novu
- [ ] (deployed) npm run test:provider-smoke:autumn-stripe && npm run test:provider-smoke:business-action-stripe
- [ ] (deployed) npm run test:deploy-smoke   # security headers + canonical URLs on served response
</verification>

<success_criteria>
- Nitro preset pinned to 'vercel'; runtime confirmed for scope-3 signatures (or D1-reopen recorded).
- PR gate extended with the four cheap scans; deploy-smokes/e2e/a11y off the blocking gate.
- Money boundary recorded (sandbox/test-mode only; live gated).
- Scope-1 deployed evidence suite green with non-secret evidence; STATE.md blockers cleared; owner packets remain GTM deferred debt.
- Tickets #3, #5, #6, #7 closed with resolutions linked from map issue #1.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-01-production-landing/01-04-SUMMARY.md`. It must state: deployed sandbox/test-mode proof captured (no live money); a smoke counts as external proof only when it passes with configured non-secret evidence; the five friendly-owner activation packets remain GTM-side deferred debt (not engineering scope).
</output>
