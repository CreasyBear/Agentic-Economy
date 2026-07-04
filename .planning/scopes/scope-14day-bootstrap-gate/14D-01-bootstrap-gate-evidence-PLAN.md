---
phase: scope-14day-bootstrap-gate
plan: "14D-01"
type: execute
wave: 1
depends_on: ["scope-01-deployed-env", "move-1-inquiry-submit-door-if-agent-submission-is-tested"]
files_modified:
  - .planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md
  - .planning/scopes/scope-14day-bootstrap-gate/14D-01-bootstrap-gate-evidence-PLAN.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
autonomous: false
requirements:
  - PLATFORM-ANATOMY §11
  - PLATFORM-ANATOMY §14 Move 2
execution_scope: planning_gate
production_executable: false
must_haves:
  truths:
    - id: bootstrap-gate-metrics
      statement: "The go/no-go gate is 30–50 source-backed profiles, 10 manually recruited providers, and 100 attributable targeted sessions over 14 days."
    - id: bootstrap-gate-pass
      statement: "GO requires at least 10 qualified inquiries, at least 5 voluntary provider corrections/maintenance/listing requests, and zero boundary overclaim."
    - id: bootstrap-gate-no-rungs
      statement: "No public platform rung beyond the storefront prototype and qualified inquiry ships before this gate has evidence."
    - id: bootstrap-gate-proof-level
      statement: "This plan creates a scaffold only; it records no deployed, provider, live, payment, booking, or dispatch proof."
---

<objective>
Run AE's first falsifiable bootstrap test as a gate before public platform widening.
The test validates whether source-backed storefront profiles and qualified inquiry
produce both demand and supplier maintenance in one narrow wedge.
</objective>

<context>
@.planning/vision/2026-07-04-PLATFORM-ANATOMY.md §11, §14
@local://research-demand.md §Single cheapest falsifiable test
@.planning/ROADMAP.md
@.planning/STATE.md
@src/lib/observability/funnel-attribution.ts
@src/lib/observability/funnel-client.ts
@src/routes/api.observability.funnel.ts
@src/modules/inquiries/internal/commands.ts
@src/modules/observability/internal/literals.ts
@src/routes/privacy.remove-business.tsx
</context>

<preflight_gates>
- Scope 1 deployed environment is required before public/deployed proof is claimed. Local/source setup is not market proof.
- Move 1's admitted `inquiry.submit` quiet-door path is required if the run asks an assistant to submit through `/api/agent/tools`; otherwise assistant traffic may only route humans to the existing qualified-inquiry UI.
- The 14-day clock does not start until attribution links, profile/source click measurement, inquiry receipts, and provider correction/listing evidence capture are verified on the target surface.
- No paid, quote-lock, booking, dispatch, automatic-fulfillment, broad-write, marketplace-liquidity, or autonomous-transaction copy may ship for this run.
</preflight_gates>

<tasks>

<task type="manual" tdd="false" status="planned">
  <name>Task 1: Prepare supply corpus</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md (later)</files>
  <action>Create 30–50 source-backed profile candidates in one metro and 2–3 high-intent categories. Record source URL, freshness date, public boundary, owner-confirmation status, and category extension notes. Do not add local-service-only fields to core schema.</action>
  <verify>Manual evidence review: every counted profile has a source pointer and boundary label.</verify>
  <acceptance_criteria>
    - 30–50 profiles exist before the clock starts.
    - Each profile is source-backed and freshness-labeled.
    - Owner-confirmed facts are distinguished from source-observed facts.
  </acceptance_criteria>
</task>

<task type="manual" tdd="false" status="planned">
  <name>Task 2: Recruit providers</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md (later)</files>
  <action>Manually recruit 10 providers. Offer free profile correction/listing for 30 days. Ask each provider to correct or maintain their profile before any paid promise.</action>
  <verify>Manual evidence review: 10 recruited providers with outreach date, channel, response status, and whether they corrected/maintained/asked to be listed.</verify>
  <acceptance_criteria>
    - 10 providers are recruited, not inferred from traffic.
    - Supplier pass counts only voluntary corrections, maintenance, or listing requests.
    - Polite interest without a profile action does not count toward the ≥5 supplier threshold.
  </acceptance_criteria>
</task>

<task type="manual" tdd="false" status="planned">
  <name>Task 3: Verify instrumentation before the clock</name>
  <files>existing observability/inquiry/correction surfaces only unless a separate implementation ticket is opened</files>
  <action>Verify that session attribution, registry/answer journey events, profile/source click-through, qualified inquiry receipts, and correction/listing evidence are emitted or otherwise source-owned before day 1. If profile/source clicks are not emitted, open a narrow implementation ticket before starting the clock rather than counting them manually.</action>
  <verify>Dry-run one attributed session through registry/answer, one profile/source click, one qualified inquiry, and one correction/listing request in the target environment; record only non-secret IDs/counts.</verify>
  <acceptance_criteria>
    - `visitor_attributed` or equivalent attributed session evidence exists for test traffic.
    - `inquiry_submitted` receipt evidence exists for qualified inquiries.
    - Provider correction/listing evidence has a source row or explicit operator evidence ref.
    - Optional source/profile click-through is measurable or explicitly marked unavailable for the run.
  </acceptance_criteria>
</task>

<task type="manual" tdd="false" status="planned">
  <name>Task 4: Run 14-day traffic test</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md (later)</files>
  <action>Send 100 attributable targeted sessions over 14 days using narrow paid search, local posts, direct outreach, partner links, or assistant/referral prompts. Do not change thresholds mid-run. Fix only broken instrumentation or overclaiming copy.</action>
  <verify>At day 14, count targeted sessions, qualified inquiries, provider corrections/listing requests, trust scan result, and optional source/profile click-through.</verify>
  <acceptance_criteria>
    - 100 attributable sessions are counted once per pseudonymous session/campaign policy.
    - ≥10 qualified inquiries are required for consumer pass.
    - ≥5 provider corrections/maintenance/listing requests are required for supplier pass.
    - Trust pass remains zero overclaim across public and assistant-visible surfaces.
  </acceptance_criteria>
</task>

<task type="manual" tdd="false" status="planned">
  <name>Task 5: Record verdict and next move</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md (later), .planning/STATE.md (later if verdict changes active state), .planning/ROADMAP.md (later only if roadmap admission changes)</files>
  <action>Write the evidence artifact and choose GO, ADAPT, or STOP from the index rules. Do not claim deployed/provider/live proof unless the evidence actually came from deployed/provider/live surfaces.</action>
  <verify>npm run typecheck && npm run test:copy && npm run test:seo, plus the deployed outside-in agent audit if assistant-facing claims are used.</verify>
  <acceptance_criteria>
    - Verdict cites exact counts and source pointers.
    - GO admits only storefront/inquiry/freshness deepening; it does not admit paid, booking, dispatch, or broad autonomous rungs.
    - ADAPT or STOP blocks public platform widening until a new or revised gate passes.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- [ ] Scaffold verification: `npm run typecheck`
- [ ] Scaffold verification: `npm run test:copy`
- [ ] Scaffold verification: `npm run test:seo`
- [ ] Later gate run: dry-run instrumentation in the target environment before day 1
- [ ] Later gate run: day-14 evidence artifact with GO/ADAPT/STOP verdict
</verification>

<success_criteria>
- The active planning system contains a concrete 14-day gate with setup counts, pass thresholds, instrumentation paths, recruitment plan, and no-rung-widening rule.
- ROADMAP and STATE point to the gate as active before public platform widening.
- The scaffold introduces no public capability claim and touches no `src/` or `convex/` files.
</success_criteria>

<output>
When the 14-day run completes, write `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md` with setup counts, pass/fail metrics, trust evidence, optional click-through, and GO/ADAPT/STOP verdict.
</output>
