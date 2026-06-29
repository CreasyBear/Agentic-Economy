---
phase: 02-human-inquiry-owner-inbox
plan: 03
type: execute
wave: 3
depends_on:
  - 02-02-human-inquiry-owner-inbox-source-closeout-gaps
files_modified:
  - src/modules/inquiries/public.ts
  - src/modules/inquiries/inquiry.functions.ts
  - src/modules/inquiries/route-readbacks.ts
  - src/routes/admin.inquiries.tsx
  - src/routes/owner.inquiries.$threadId.tsx
  - src/routes/owner.actions.tsx
  - src/routes/owner.billing.tsx
  - src/routes/owner.billing.activate.tsx
  - src/routes/owner.billing.cancel.tsx
  - src/routes/owner.billing.redirecting.tsx
  - src/routes/owner.billing.return.tsx
  - src/routes/owner.billing.receipts.$receiptId.tsx
  - src/routes/api.billing.webhook.ts
  - src/future-phases/04-owner-pending-protected-actions/routes/owner.actions.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/owner.billing.redirecting.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/owner.billing.return.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/owner.billing.receipts.$receiptId.tsx
  - src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts
  - src/routeTree.gen.ts
  - src/lib/ui/contract-scans.ts
  - tests/e2e/public-owner-ui.spec.ts
  - tests/e2e/a11y/public-owner-a11y.spec.ts
  - tests/unit/server/server-seams.test.ts
  - tests/unit/inquiries/inquiry-flow.test.ts
  - tests/unit/billing/owner-routes.test.ts
  - tests/unit/billing/rail.test.ts
  - output/playwright/phase2-ui/operator-reconstruction-compact.png
  - output/playwright/phase2-ui/operator-reconstruction-wide.png
  - output/playwright/phase2-ui/phase2-ui-proof.mjs
requirements:
  - P2-R3
  - P2-R4
  - P2-R6
  - P2-R7
  - P2-R8
autonomous: true
gap_closure: true
must_haves:
  truths:
    - P2-R7 has browser E2E/a11y coverage for public inquiry, owner inbox/detail, mark-read, reply/close, delivery readback, and operator reconstruction.
    - P2-R8 has an operator reconstruction route/surface that redacts private content and reconstructs inquiry -> message -> dispatch -> audit/funnel/operation refs.
    - Phase 4/5 routes are not visible in the Phase 2 route tree unless an owner-accepted override artifact exists.
  prohibitions:
    - Do not delete future Phase 4/5 work blindly; isolate it from active Phase 2 routes or stop for owner override acceptance.
    - Do not expose private inquiry body, contact, owner notes, provider payloads, secrets, raw provider errors, or deleted content in operator/customer public output.
    - Do not add future nav items for messages, actions, billing, payments, marketplace, request market, or developer platform as Phase 2 UI.
  artifacts:
    - src/routes/admin.inquiries.tsx provides the Phase 2 operator reconstruction surface.
    - tests/e2e/public-owner-ui.spec.ts includes Phase 2 flow coverage.
    - tests/e2e/a11y/public-owner-a11y.spec.ts includes Phase 2 mobile/keyboard/focus coverage.
    - output/playwright/phase2-ui/operator-reconstruction-compact.png and output/playwright/phase2-ui/operator-reconstruction-wide.png are produced by E2E evidence capture.
  key_links:
    - operator reconstruction route -> dispatch bindings from 02-02.
    - owner thread route -> markCurrentOwnerInquiryReadServer from 02-02.
    - routeTree.gen.ts -> Phase 2 active route isolation.
---

<objective>
Close Phase 2 route, UI, E2E, a11y, operator reconstruction, and future-route isolation gaps.

Purpose: Source fixes are not enough for closeout unless browser flows and the route tree prove only the Phase 2 capability is live.
Output: Operator reconstruction surface, Phase 2 E2E/a11y coverage, compact/wide UI evidence, and isolated future Phase 4/5 route files.
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
@src/routes/owner.inquiries.tsx
@src/routes/owner.inquiries.$threadId.tsx
@src/routes/admin.audit-events.tsx
@src/routeTree.gen.ts
@tests/e2e/public-owner-ui.spec.ts
@tests/e2e/a11y/public-owner-a11y.spec.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add Phase 2 operator reconstruction route and readback</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md</item>
    <item>src/routes/admin.audit-events.tsx</item>
    <item>src/routes/owner.inquiries.$threadId.tsx</item>
    <item>src/modules/inquiries/public.ts</item>
    <item>src/modules/inquiries/inquiry.functions.ts</item>
    <item>src/modules/inquiries/route-readbacks.ts</item>
    <item>tests/unit/server/server-seams.test.ts</item>
    <item>tests/unit/inquiries/inquiry-flow.test.ts</item>
  </read_first>
  <files>
    <item>src/modules/inquiries/public.ts</item>
    <item>src/modules/inquiries/inquiry.functions.ts</item>
    <item>src/modules/inquiries/route-readbacks.ts</item>
    <item>src/routes/admin.inquiries.tsx</item>
    <item>src/routeTree.gen.ts</item>
    <item>tests/unit/server/server-seams.test.ts</item>
    <item>tests/unit/inquiries/inquiry-flow.test.ts</item>
  </files>
  <behavior>
    - `/admin/inquiries` renders denied readback with no private rows for unauthenticated/non-admin access.
    - Authorized operator reconstruction filters by thread ID, correlation ID, or dispatch ID and shows a redacted timeline.
    - Timeline includes inquiry thread/message hashes, dispatch IDs/statuses, provider-safe refs, webhook held/bound state, audit refs, funnel refs, operation-key refs, source hash, correlation ID, and next repair/no-repair action.
  </behavior>
  <action>
    Add a Phase 2 operator reconstruction route at `src/routes/admin.inquiries.tsx`, using `AeAdminShell` and existing admin denial patterns from `src/routes/admin.audit-events.tsx`. Add a source-owned reconstruction readback seam in the inquiry module/server layer that assembles inquiry thread, message hash, notification, notificationOutbox dispatch, attempt, webhook, audit, funnel, and operation-key references produced by plan 02-02. Keep raw inquiry body, customer contact, owner notes, provider payload, webhook secret, raw provider error, and deleted private content out of the operator route; expose hashes, redacted payload summaries, safe provider refs, source hash, correlation ID, timestamps, statuses, and operator next action only.

    Add unit tests for empty reconstruction, populated reconstruction, dispatch-bound reconstruction, held webhook reconstruction, wrong/denied admin readback, and redaction. Update `src/routeTree.gen.ts` through the project route generation/build path after adding the route.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 6 is closed: `src/routes/admin.inquiries.tsx` exists and is included in `src/routeTree.gen.ts` as `/admin/inquiries`.</item>
    <item>Operator reconstruction can prove customer inquiry to owner read/reply/close to notification readback to audit/operation/funnel from source state.</item>
    <item>Denied operator reads return no private rows and preserve safe denial copy.</item>
    <item>Redaction tests prove private inquiry body, contact, owner notes, provider payloads, webhook secrets, raw provider errors, and deleted content are absent from route readback and rendered text.</item>
  </acceptance_criteria>
  <verify>
    <automated>npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/server/server-seams.test.ts</automated>
    <automated>npm run typecheck</automated>
    <automated>npm run build -- --logLevel error</automated>
  </verify>
  <done>
    <criterion>The admin operator reconstruction route is source-backed, redacted, route-tree visible, and unit-tested.</criterion>
  </done>
</task>

<task type="auto">
  <name>Task 2: Isolate future Phase 4/5 routes from the Phase 2 route tree</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>.planning/ROADMAP.md</item>
    <item>src/routeTree.gen.ts</item>
    <item>src/lib/ui/contract-scans.ts</item>
    <item>src/routes/owner.actions.tsx</item>
    <item>src/routes/owner.billing.tsx</item>
    <item>src/routes/owner.billing.activate.tsx</item>
    <item>src/routes/owner.billing.cancel.tsx</item>
    <item>src/routes/owner.billing.redirecting.tsx</item>
    <item>src/routes/owner.billing.return.tsx</item>
    <item>src/routes/owner.billing.receipts.$receiptId.tsx</item>
    <item>src/routes/api.billing.webhook.ts</item>
    <item>tests/unit/billing/owner-routes.test.ts</item>
    <item>tests/unit/billing/rail.test.ts</item>
  </read_first>
  <files>
    <item>src/routes/owner.actions.tsx</item>
    <item>src/routes/owner.billing.tsx</item>
    <item>src/routes/owner.billing.activate.tsx</item>
    <item>src/routes/owner.billing.cancel.tsx</item>
    <item>src/routes/owner.billing.redirecting.tsx</item>
    <item>src/routes/owner.billing.return.tsx</item>
    <item>src/routes/owner.billing.receipts.$receiptId.tsx</item>
    <item>src/routes/api.billing.webhook.ts</item>
    <item>src/future-phases/04-owner-pending-protected-actions/routes/owner.actions.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/owner.billing.redirecting.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/owner.billing.return.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/owner.billing.receipts.$receiptId.tsx</item>
    <item>src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts</item>
    <item>src/routeTree.gen.ts</item>
    <item>src/lib/ui/contract-scans.ts</item>
    <item>tests/unit/billing/owner-routes.test.ts</item>
    <item>tests/unit/billing/rail.test.ts</item>
  </files>
  <action>
    Preserve the future Phase 4/5 route work but remove it from active Phase 2 file routing. Move the active future route files out of `src/routes` into the listed `src/future-phases/.../routes` paths, update intra-file imports after the move, and update tests that intentionally exercise future route helpers to import from the new future-phase paths. Do not delete the Phase 4/5 module code and do not remove tests that prove those future modules are internally consistent.

    Regenerate or rebuild `src/routeTree.gen.ts` so `/owner/actions`, `/owner/billing`, `/owner/billing/activate`, `/owner/billing/cancel`, `/owner/billing/redirecting`, `/owner/billing/return`, `/owner/billing/receipts/$receiptId`, and `/api/billing/webhook` are absent from the Phase 2 route tree. Update `src/lib/ui/contract-scans.ts` so Phase 2 clean scans fail if those routes reappear under `src/routes` or `src/routeTree.gen.ts`, while allowing explicitly parked future-phase files under `src/future-phases`.

    If any of these route files contain user-owned uncommitted work that cannot be safely moved, stop this task and write `.planning/phases/02-human-inquiry-owner-inbox/02-FUTURE-ROUTE-OVERRIDE-REQUEST.md` naming the exact files, route paths, and risk. Do not create an accepted override artifact unless the owner explicitly accepts it after seeing that request.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 8 is closed by source isolation: active Phase 2 route tree contains no Phase 4/5 owner action or billing routes.</item>
    <item>Future route implementation files are preserved under `src/future-phases/...`; they are not blindly deleted.</item>
    <item>Clean source/copy/route scans fail if future Phase 4/5 route files return to `src/routes` or `src/routeTree.gen.ts` before their owning phase.</item>
    <item>No owner-accepted override artifact exists unless the owner explicitly accepted the override after the request artifact was written.</item>
  </acceptance_criteria>
  <verify>
    <automated>npm run test:unit -- tests/unit/billing/owner-routes.test.ts tests/unit/billing/rail.test.ts</automated>
    <automated>npm run test:source-mining</automated>
    <automated>npm run test:copy</automated>
    <automated>npm run build -- --logLevel error</automated>
    <automated>node -e "const fs=require('fs'); const s=fs.readFileSync('src/routeTree.gen.ts','utf8'); if (/\\/owner\\/actions|\\/owner\\/billing|\\/api\\/billing\\/webhook/.test(s)) process.exit(1)"</automated>
  </verify>
  <done>
    <criterion>Future Phase 4/5 route surfaces are absent from the active route tree and preserved outside `src/routes`, or the task is blocked with an explicit owner override request artifact.</criterion>
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add Phase 2 E2E, a11y, and rendered operator evidence</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md</item>
    <item>tests/e2e/public-owner-ui.spec.ts</item>
    <item>tests/e2e/a11y/public-owner-a11y.spec.ts</item>
    <item>src/routes/$slug.inquiry.tsx</item>
    <item>src/routes/owner.inquiries.tsx</item>
    <item>src/routes/owner.inquiries.$threadId.tsx</item>
    <item>src/routes/admin.inquiries.tsx</item>
    <item>output/playwright/phase2-ui/phase2-ui-proof.mjs</item>
  </read_first>
  <files>
    <item>tests/e2e/public-owner-ui.spec.ts</item>
    <item>tests/e2e/a11y/public-owner-a11y.spec.ts</item>
    <item>output/playwright/phase2-ui/operator-reconstruction-compact.png</item>
    <item>output/playwright/phase2-ui/operator-reconstruction-wide.png</item>
    <item>output/playwright/phase2-ui/phase2-ui-proof.mjs</item>
  </files>
  <behavior>
    - E2E covers public inquiry submit, owner inbox/detail, mark-read, reply, close, delivery readback, and admin operator reconstruction.
    - A11y covers 375px mobile, keyboard path, focus after validation errors/success, labels, accessible names, and disabled normal-owner repair controls.
    - Rendered evidence includes compact and wide operator reconstruction screenshots plus existing public/owner surfaces.
  </behavior>
  <action>
    Extend `tests/e2e/public-owner-ui.spec.ts` with a named Phase 2 flow using `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`: navigate to `/plumbing-demo/inquiry`, submit a valid inquiry, assert saved-message receipt and safe delivery label, open `/owner/inquiries`, open the seeded thread, mark it read, submit a human owner reply, close the thread, assert delivery readback, then open `/admin/inquiries` and assert redacted operator reconstruction with dispatch binding, audit/operation/funnel refs, source hash, correlation ID, and operator next action.

    Extend `tests/e2e/a11y/public-owner-a11y.spec.ts` with Phase 2 keyboard and focus coverage at 375px for inquiry submit validation, owner mark-read/reply/close controls, delivery readback, and operator reconstruction. Capture compact and wide screenshots for `/admin/inquiries` into `output/playwright/phase2-ui/operator-reconstruction-compact.png` and `output/playwright/phase2-ui/operator-reconstruction-wide.png`. Ensure the proof script or E2E artifacts check that public/owner/operator text does not contain future-surface claims and does not reveal raw private contact/message/provider payload.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 7 is closed: Phase 2 E2E/a11y tests exist and execute through public inquiry, owner inbox/detail, mark-read, reply/close, delivery readback, and operator reconstruction.</item>
    <item>Verifier UI partial gap is closed: compact and wide operator reconstruction screenshots exist and are non-empty.</item>
    <item>E2E asserts no booking, payment, protected action, marketplace, request market, AI/autonomous reply, or provider execution claim in Phase 2 public/owner/operator surfaces.</item>
    <item>A11y test proves labels, keyboard-only path, focus restoration, disabled repair controls for normal owners, and no horizontal overflow at 375px.</item>
  </acceptance_criteria>
  <verify>
    <automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e</automated>
    <automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y</automated>
    <automated>sips -g pixelWidth -g pixelHeight output/playwright/phase2-ui/operator-reconstruction-compact.png output/playwright/phase2-ui/operator-reconstruction-wide.png</automated>
    <automated>npm run test:copy</automated>
    <automated>npm run test:ui-contract</automated>
  </verify>
  <done>
    <criterion>Phase 2 browser coverage and rendered operator evidence are green, non-empty, and free of private leakage or future-surface copy.</criterion>
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| owner/operator browser -> route/server function | Browser interactions trigger owner mark-read/reply/close and admin reconstruction reads. |
| admin reconstruction readback -> rendered UI | Private source data is summarized for operator use and must remain redacted. |
| route tree -> public runtime | File routes become reachable runtime surfaces unless isolated. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-02-03-01 | Information Disclosure | `/admin/inquiries` | high | mitigate | Redact private content and render only hashes, safe refs, statuses, and operator next action. |
| T-02-03-02 | Spoofing | owner mark-read UI | medium | mitigate | Route action calls server function; source owner authority remains server-derived. |
| T-02-03-03 | Tampering | future route tree | high | mitigate | Move future route files out of `src/routes`, rebuild route tree, and add clean scan gates. |
| T-02-03-04 | Repudiation | operator reconstruction evidence | medium | mitigate | Include audit, funnel, operation-key, dispatch, attempt, and webhook refs in reconstruction. |
| T-02-03-SC | Tampering | npm installs | high | mitigate | No package installs in this plan. If an executor adds one, stop for package legitimacy audit before install. |
</threat_model>

<verification>
Run UI/route gates after all tasks:
<automated>npm run typecheck</automated>
<automated>npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/server/server-seams.test.ts tests/unit/billing/owner-routes.test.ts tests/unit/billing/rail.test.ts</automated>
<automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e</automated>
<automated>VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y</automated>
<automated>npm run test:source-mining</automated>
<automated>npm run test:copy</automated>
<automated>npm run test:ui-contract</automated>
<automated>npm run build -- --logLevel error</automated>
</verification>

<success_criteria>
Phase 2 UI/route blockers are closed when `/admin/inquiries` reconstructs source state safely, future Phase 4/5 routes are absent from active routing, and E2E/a11y/rendered evidence covers the public inquiry to owner action to operator readback path.
</success_criteria>

## Artifacts this phase produces

- `src/routes/admin.inquiries.tsx`.
- `readInquiryOperatorReconstruction` or equivalent source-owned operator reconstruction seam.
- `markCurrentOwnerInquiryReadServer` route usage from the owner thread surface.
- Future-route parking paths under `src/future-phases/04-owner-pending-protected-actions/routes/` and `src/future-phases/05-paid-activation-money-rails/routes/`.
- Phase 2 E2E cases in `tests/e2e/public-owner-ui.spec.ts`.
- Phase 2 a11y cases in `tests/e2e/a11y/public-owner-a11y.spec.ts`.
- `output/playwright/phase2-ui/operator-reconstruction-compact.png`.
- `output/playwright/phase2-ui/operator-reconstruction-wide.png`.

<output>
Create `.planning/phases/02-human-inquiry-owner-inbox/02-03-SUMMARY.md` when done. Do not create Phase 2 closeout SUMMARY/UAT artifacts from this plan.
</output>
