---
phase: 02-human-inquiry-owner-inbox
plan: 04
type: execute
wave: 4
depends_on:
  - 02-02-human-inquiry-owner-inbox-source-closeout-gaps
  - 02-03-human-inquiry-owner-inbox-ui-route-gaps
files_modified:
  - tests/deploy-smoke/phase2-support-record-smoke.spec.ts
  - tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts
  - tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts
  - .planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-SUMMARY.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-UAT.md
requirements:
  - P2-R1
  - P2-R5
  - P2-R6
  - P2-R7
  - P2-R8
autonomous: false
gap_closure: true
user_setup:
  - service: deployed_application
    why: "Phase 2 deployed support/provider smoke must run against real deployed source state."
    env_vars:
      - name: DEPLOY_BASE_URL
        source: "Deployed app HTTPS base URL"
      - name: SMOKE_PHASE2_BUSINESS_SLUG
        source: "Published eligible business slug with complete human_inquiry_owner_inbox support record"
      - name: AE_NOTIFICATION_OUTBOX_SECRET
        source: "Deployed server outbox bearer secret; pass only as environment variable"
      - name: SMOKE_NOTIFICATION_DISPATCH_ID
        source: "Source-owned owner Resend dispatch ID created by the deployed inquiry flow"
      - name: SMOKE_NOVU_NOTIFICATION_DISPATCH_ID
        source: "Source-owned owner Novu dispatch ID created by the deployed inquiry flow"
    dashboard_config:
      - task: "Ensure deployed server has CONVEX_URL or VITE_CONVEX_URL, CLERK_SECRET_KEY, RESEND_API_KEY, RESEND_FROM, AE_NOTIFICATION_OUTBOX_SECRET, NOVU_SECRET_KEY, and NOVU_WORKFLOW_INQUIRY_OWNER configured."
        location: "Deployment provider environment settings"
      - task: "Ensure deployed Convex source state has a complete capabilityLaunchSupportRecords row for capability human_inquiry_owner_inbox."
        location: "Convex deployment source state"
must_haves:
  truths:
    - Phase 2 deployed support smoke proves a published eligible service and complete support record through the public inquiry path.
    - Resend and Novu provider smokes use inquiry-created owner dispatch IDs and record redacted provider refs, hashes, final states, and operator next action.
    - SUMMARY/UAT/closeout artifacts are written only after source, E2E/a11y, future-route isolation, support smoke, and provider smoke blockers are resolved.
  prohibitions:
    - Do not mutate cloud/deployed provider state unless explicitly authorized by the owner.
    - Do not print or store secret values in evidence artifacts.
    - Do not create Phase 2 SUMMARY or UAT while deploy/provider smoke remains blocked or failing.
    - Do not accept manually fabricated dispatch IDs as provider smoke proof.
  artifacts:
    - .planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md records non-secret smoke evidence.
    - .planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md records missing setup when smoke cannot run.
    - .planning/phases/02-human-inquiry-owner-inbox/02-SUMMARY.md is created only after all blockers are green.
    - .planning/phases/02-human-inquiry-owner-inbox/02-UAT.md is created only if human verification remains required after green source and smoke evidence.
  key_links:
    - deployed support smoke -> source capabilityLaunchSupportRecords row.
    - provider smoke dispatch IDs -> operator reconstruction dispatch bindings from 02-02/02-03.
    - closeout artifacts -> green source/UI/smoke evidence.
---

<objective>
Route deployed support/provider smoke blockers and write Phase 2 closeout artifacts only after evidence is green.

Purpose: Phase 2 cannot close on local source tests alone; deployed support state and real/sandbox Resend/Novu readbacks must be proven or explicitly held for operator setup.
Output: Non-secret deploy-smoke evidence or blocker artifact, then SUMMARY/UAT only after all source and smoke blockers are resolved.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md
@.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
@.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md
@.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md
@.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md
@tests/deploy-smoke/phase2-support-record-smoke.spec.ts
@tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts
@tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run or route deployed support and provider smoke evidence</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md</item>
    <item>tests/deploy-smoke/phase2-support-record-smoke.spec.ts</item>
    <item>tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts</item>
    <item>tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts</item>
    <item>package.json</item>
  </read_first>
  <files>
    <item>tests/deploy-smoke/phase2-support-record-smoke.spec.ts</item>
    <item>tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts</item>
    <item>tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md</item>
  </files>
  <action>
    First verify that plans 02-02 and 02-03 completed and that source tests/E2E/a11y passed. Then inspect the required local environment variable names only; never print secret values. Required command-side env names are `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOTIFICATION_DISPATCH_ID`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`. Required deployed server env names are `CONVEX_URL` or `VITE_CONVEX_URL`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER`; `RESEND_WEBHOOK_SECRET`, `NOVU_API_BASE_URL`, and `RESEND_API_BASE_URL` are optional only where the existing provider helpers treat them as optional.

    Do not mutate cloud/deployed provider/source state unless the owner explicitly authorizes that action. If any required env/setup/smoke ID is missing, write `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md` with the missing env names, the non-secret deployed setup required, and the exact commands that remain blocked. Stop before writing SUMMARY/UAT/closeout.

    If all inputs exist, run the support smoke first. Use the public inquiry path to create or verify a source-owned inquiry for `SMOKE_PHASE2_BUSINESS_SLUG`. Confirm through `/admin/inquiries` or equivalent operator reconstruction evidence that the Resend and Novu smoke dispatch IDs are bound to that inquiry-created owner notification. Then run Resend and Novu provider smokes. Record `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md` with command, timestamp, deployed host, business slug, inquiry/thread ID if non-secret, AE dispatch IDs, provider family, redacted provider refs, payload hashes, final dispatch states, webhook/readback state, operator next action, and explicit statement that no secret values were recorded.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 9 is routed honestly: missing deploy/provider inputs produce a blocker artifact with exact env names and no secrets, not a passing closeout claim.</item>
    <item>Support smoke passes only against an HTTPS deployed URL and a published eligible service with a complete `human_inquiry_owner_inbox` support row.</item>
    <item>Resend smoke uses `SMOKE_NOTIFICATION_DISPATCH_ID` that is proven by source/operator reconstruction to come from an inquiry-created owner dispatch.</item>
    <item>Novu smoke uses `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` that is proven by source/operator reconstruction to come from an inquiry-created owner dispatch.</item>
    <item>Evidence records redacted provider refs, payload hashes, final dispatch states, readback state, and operator next action; it records env var names but no secret values.</item>
  </acceptance_criteria>
  <verify>
    <automated>npm run test:phase2-support-smoke</automated>
    <automated>npm run test:provider-smoke:resend</automated>
    <automated>npm run test:provider-smoke:novu</automated>
  </verify>
  <done>
    <criterion>Either all Phase 2 deploy/provider smokes pass with non-secret evidence, or the blocker artifact precisely names the missing operator setup and closeout remains unwritten.</criterion>
  </done>
</task>

<task type="auto">
  <name>Task 2: Write final Phase 2 closeout artifacts only after blockers are green</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md</item>
    <item>.planning/REQUIREMENTS.md</item>
    <item>package.json</item>
  </read_first>
  <files>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-SUMMARY.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-UAT.md</item>
  </files>
  <action>
    Before writing SUMMARY or UAT, prove all source blockers from 02-02, route/UI blockers from 02-03, and deploy/provider smoke blockers from Task 1 are resolved. If `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md` exists with unresolved items, do not create SUMMARY or UAT. Instead append the current blocker status to `02-EXECUTION-EVIDENCE.md` without claiming closeout.

    When all gates are green, update `02-EXECUTION-EVIDENCE.md` to `status: complete` and create `02-SUMMARY.md` with the implemented source changes, exact commands, source-to-provider evidence, non-secret dispatch/readback refs, route isolation result, E2E/a11y evidence paths, and requirements traceability for P2-R1 through P2-R8. Create `02-UAT.md` only if human verification remains required by the executor after automated evidence is green; otherwise state in `02-SUMMARY.md` that no separate UAT artifact was required because automated source, UI, and deployed smoke evidence covered the closeout gates.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 10 is closed: SUMMARY/UAT/closeout artifacts are absent until source, E2E/a11y, future-route isolation, support smoke, and provider smoke blockers are resolved.</item>
    <item>`02-SUMMARY.md` is created only after all Phase 2 smoke commands pass and includes non-secret evidence for source dispatch bindings and provider readbacks.</item>
    <item>Requirements traceability maps P2-R1 through P2-R8 to source tests, E2E/a11y, deploy smoke, provider smoke, and operator reconstruction evidence.</item>
    <item>If any smoke/setup blocker remains, `02-DEPLOY-SMOKE-BLOCKERS.md` remains the authoritative artifact and closeout artifacts are not created.</item>
  </acceptance_criteria>
  <verify>
    <automated>npm run typecheck</automated>
    <automated>npm run check:convex-codegen</automated>
    <automated>npm run test:unit</automated>
    <automated>npm run test:integration</automated>
    <automated>npm run test:types</automated>
    <automated>npm run test:imports</automated>
    <automated>npm run test:source-mining</automated>
    <automated>npm run test:ts-standards</automated>
    <automated>npm run test:copy</automated>
    <automated>npm run test:seo</automated>
    <automated>npm run test:ui-contract</automated>
    <automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e</automated>
    <automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y</automated>
    <automated>npm run build -- --logLevel error</automated>
    <automated>npm run test:phase2-support-smoke</automated>
    <automated>npm run test:provider-smoke:resend</automated>
    <automated>npm run test:provider-smoke:novu</automated>
  </verify>
  <done>
    <criterion>Final closeout artifacts exist only after all listed automated and deployed smoke gates are green; otherwise only blocker evidence exists.</criterion>
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| local executor -> deployed app | Smoke commands send public inquiry and provider dispatch requests to deployed HTTPS runtime. |
| local evidence artifact -> operator/user | Non-secret evidence is written to planning files for closeout review. |
| bearer secret -> dispatch routes | `AE_NOTIFICATION_OUTBOX_SECRET` authorizes provider dispatch routes and must not be logged. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-02-04-01 | Information Disclosure | deploy-smoke evidence | high | mitigate | Record env var names, dispatch IDs, hashes, provider-safe refs, and statuses only; never record secret values or raw contacts/messages. |
| T-02-04-02 | Spoofing | provider smoke dispatch IDs | high | mitigate | Require operator reconstruction proof that smoke dispatch IDs came from inquiry-created source dispatches. |
| T-02-04-03 | Repudiation | closeout artifacts | medium | mitigate | SUMMARY must list exact commands, timestamps, final states, and evidence file paths. |
| T-02-04-04 | Tampering | deployed state | high | mitigate | Do not mutate cloud/provider/source state unless owner explicitly authorizes; otherwise write blocker artifact. |
| T-02-04-SC | Tampering | npm installs | high | mitigate | No package installs in this plan. If an executor adds one, stop for package legitimacy audit before install. |
</threat_model>

<verification>
Closeout gates:
<automated>npm run typecheck</automated>
<automated>npm run check:convex-codegen</automated>
<automated>npm run test:unit</automated>
<automated>npm run test:integration</automated>
<automated>npm run test:types</automated>
<automated>npm run test:imports</automated>
<automated>npm run test:source-mining</automated>
<automated>npm run test:ts-standards</automated>
<automated>npm run test:copy</automated>
<automated>npm run test:seo</automated>
<automated>npm run test:ui-contract</automated>
<automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e</automated>
<automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y</automated>
<automated>npm run build -- --logLevel error</automated>
<automated>npm run test:phase2-support-smoke</automated>
<automated>npm run test:provider-smoke:resend</automated>
<automated>npm run test:provider-smoke:novu</automated>
</verification>

<success_criteria>
Phase 2 can close only when source, UI, route isolation, deployed support smoke, provider smoke, and non-secret evidence artifacts are green. If setup is missing, the accepted output is a precise blocker artifact and no closeout claim.
</success_criteria>

## Artifacts this phase produces

- `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md`.
- `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md` only when deployed/provider setup remains missing.
- `.planning/phases/02-human-inquiry-owner-inbox/02-SUMMARY.md` only after all source and smoke blockers are resolved.
- `.planning/phases/02-human-inquiry-owner-inbox/02-UAT.md` only if human verification remains required after automated and smoke evidence is green.
- Updated `.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md` with final or blocked status.

<output>
Create `.planning/phases/02-human-inquiry-owner-inbox/02-04-SUMMARY.md` when this plan completes. Create Phase 2 `02-SUMMARY.md` only under the acceptance criteria above.
</output>
