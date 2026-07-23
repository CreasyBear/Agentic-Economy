---
phase: 03c-hosted-paid-operation-product-trial
plan: 06
type: execute
wave: 6
depends_on: [03C-05]
files_modified:
  - .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md
  - docs/hosted-paid-operation-trial.md
  - tools/dev/score-paid-operation-comprehension.ts
  - .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json
autonomous: false
requirements: [P3C-R4, P3C-R8, P3C-R10]
must_haves:
  truths:
    - "Evaluators complete the forward golden path and understand consequence, payment/result truth, provider-switch boundary, and every sampled goblin rejoin/stop without technical disclosure."
    - "Every participant answers questions 3, 5, 7, 8, 9 and 10 correctly; total accuracy is at least 90%; any retry choice during uncertainty is a hard fail."
    - "The result is recorded as a human comprehension session, not customer value, real screen-reader, provider, settlement, or production evidence."
  artifacts:
    - path: ".planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md"
      provides: "Predeclared instrument, participant answers, scoring and claim ceiling"
  key_links:
    - from: "03C-COMPREHENSION-EVAL.md"
      to: "03C-UI-SPEC.md"
      via: "Exact ten-question rubric and hard-fail rule"
---
<objective>
Run the declared human comprehension eval against the protected sandbox UI.

Purpose: Decide whether the product projection communicates the only safe continuation rather than merely passing code checks.
Output: Auditable evaluator responses and a pass/fail decision under D-01 and D-08.
</objective>
<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>
<context>
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
</context>
<tasks>
<task type="auto">
  <name>Task 1: Freeze and prepare the comprehension instrument</name>
  <files>.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md, docs/hosted-paid-operation-trial.md, tools/dev/score-paid-operation-comprehension.ts, .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json</files>
  <action>Freeze a SHA-256-hashed instrument before answers. Minimum cohort: three independent evaluators, excluding Phase 3C implementers, reviewers with answer-key exposure and coached participants. Every participant runs the forward golden path from protected `/actions/paid/new` Sandbox setup through paid Action Detail; then counterbalance human/structured-agent goblin scenarios. Incomplete golden paths are non-pass. Questions must confirm that setup is evaluator-only rather than canonical IA, provider selection stays outside the card, public reconcile carries intent only, and each goblin safely rejoins or stops. Keep the 90% threshold; retry or provider change during uncertainty is a hard fail. Store raw anonymous answers separately; independent scoring refuses drift. Create `docs/hosted-paid-operation-trial.md` with account/config placeholders, setup/detail URLs, agent create/inspect/command endpoints, one golden tape, branch-point goblin matrix, explicit local-versus-hosted evidence labels, friction measures and a non-mutating preflight. Do not add generic discovery. Owned paths exactly the four listed. Forbidden: source/UI/tests/package changes, external calls, PII, secrets, retroactive rubric edits, fabricated participants, customer-value or real-provider claims. RED/falsifier: fewer than three eligible completed sessions, incomplete golden path, uncovered goblin family, setup mistaken for product IA, caller evidence supplied to reconcile, local evidence called hosted, exposed answer key, coaching, hash mismatch, unsafe retry/switch passes, or scorer disagreement. Commands remain focused. Evidence: predeclared design/local fixture until actual sessions; never hosted readback. Stop if fixtures diverge, cohort cannot be recruited, or preflight needs an external call. Follow the runbook handoff.</action>
  <verify><automated>npm run test:ui-contract</automated></verify>
  <done>The unscored instrument is frozen with exact scenarios, questions, thresholds, hard-fail rule and claim ceiling.</done>
</task>
<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 2: Run and record the founder-observed comprehension session</name>
  <files>.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md, .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json</files>
  <action>Run the frozen human and structured-agent journeys exactly as documented, preserve anonymous raw answers separately, and invoke the independent scorer. Do not change instrument, UI, thresholds, cohort rules, or ceiling after answers begin. Report friction separately from correctness. The only positive claim is declared-evaluator comprehension and semantic parity; it is not usability, population, demand, or customer-value evidence.</action>
  <what-built>A protected hosted-sandbox-shaped local UI covering the five comprehension scenarios and a frozen ten-question instrument.</what-built>
  <how-to-verify>1. Recruit the declared evaluator set and record participant identifiers without personal data. 2. For each scenario, keep Technical details closed and ask all ten questions verbatim. 3. Record each answer before showing corrections. 4. Score required questions 3, 5, 7, 8, 9 and 10 as all-participant gates, total accuracy at 90% or above, and any retry choice during uncertainty as a hard fail. 5. Write actual answers and the computed result to 03C-COMPREHENSION-EVAL.md. 6. Label the evidence `declared_human_comprehension_session_on_hosted_sandbox_projection` and retain the D-01/D-08 ceiling.</how-to-verify>
  <resume-signal>Type `comprehension passed` with the completed result path, or `comprehension failed` with the first failed question/state. Do not continue on a fail.</resume-signal>
  <verify><automated>npm run test:ui-contract &amp;&amp; npx tsx tools/dev/score-paid-operation-comprehension.ts --instrument .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md --results .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json</automated></verify>
  <done>Actual evaluator answers are recorded and independently score to PASS, or the plan stops at the first failed state/question without a completion claim.</done>
</task>
</tasks>
<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| UI → evaluator judgment | Technical disclosure and coaching must not influence answers |
| Recorded answers → pass claim | Predeclared scoring prevents manufactured PASS |
## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-21 | Repudiation | Human answers | high | mitigate | Preserve per-participant answers and scoring |
| T-03C-22 | Tampering | Eval threshold | high | mitigate | Freeze rubric before session |
| T-03C-23 | Information disclosure | Participant record | low | mitigate | Use non-personal participant identifiers |
</threat_model>
<verification>Recompute the score from recorded answers and confirm every mandatory item, total threshold, and hard-fail rule independently.</verification>
<success_criteria>Pass only from actual recorded answers meeting all declared gates. On failure, stop with the first misunderstood state and smallest UI decision required; do not manufacture PASS.</success_criteria>
<output>Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-06-SUMMARY.md` with the required handoff schema and actual comprehension evidence ceiling.</output>
