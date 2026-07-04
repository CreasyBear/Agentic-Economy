---
phase: 02-human-inquiry-owner-inbox
verified: 2026-06-29T06:30:00Z
status: gaps_found
score: 17/18 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 12/18
  gaps_closed:
    - "CSRF/Origin admission is present for public submit, owner mark-read, owner reply, owner close, operator retry, and operator no-repair, with unit coverage."
    - "Phase 2 public inquiry, owner inbox/detail, mark-read, reply/close, delivery readback, and operator reconstruction E2E/a11y coverage exists and passed in the orchestrator gate."
    - "The /admin/inquiries operator reconstruction route exists, is in the active route tree, and has redaction/source reconstruction coverage."
    - "At Phase 2 source closeout time, future Phase 4/5 owner action and billing routes were absent from active src/routes and src/routeTree.gen.ts; after Phase 4 execution, owner action routes are intentionally active while billing routes remain parked."
    - "Rendered compact/wide operator reconstruction screenshots exist and are non-empty."
    - "Owner inbox equal-updated ordering and no-longer-present owner non-leaking list/detail behavior are covered by a named Convex runtime unit test."
  gaps_remaining:
    - "Deployed support smoke is blocked by missing DEPLOY_BASE_URL and SMOKE_PHASE2_BUSINESS_SLUG."
    - "Resend provider smoke is blocked by missing DEPLOY_BASE_URL, AE_NOTIFICATION_OUTBOX_SECRET, and SMOKE_NOTIFICATION_DISPATCH_ID."
    - "Novu provider smoke is blocked by missing DEPLOY_BASE_URL, AE_NOTIFICATION_OUTBOX_SECRET, and SMOKE_NOVU_NOTIFICATION_DISPATCH_ID."
    - "Post-push route probes show the Vercel host now serves Phase 2 routes, but plumbing-demo and parramatta-emergency-plumbing render 'Inquiry unavailable' / 'This service page is not public', so deployed support readiness is still unproven."
    - "Final 02-SUMMARY.md, 02-UAT.md, and deploy-smoke evidence remain absent as required while smoke blockers are unresolved."
  regressions: []
gaps:
  - truth: "Phase 2 closeout proof reconstructs customer inquiry to owner read/reply/close to notification readback to audit/operator reconstruction from deployed source state."
    status: failed
    reason: "The deployed route set is now visible after sprint commit 82b8600, but the deployed inquiry pages for tested slugs render unavailable because the service page is not public. Provider smoke remains blocked by missing AE_NOTIFICATION_OUTBOX_SECRET, source-owned dispatch IDs, and deployed provider env. No deployed support/provider evidence exists."
    artifacts:
      - path: "tests/deploy-smoke/phase2-support-record-smoke.spec.ts"
        issue: "Routes are live, but the post-push smoke against DEPLOY_BASE_URL=https://agentic-economy-phi.vercel.app and SMOKE_PHASE2_BUSINESS_SLUG=plumbing-demo failed because the deployed page rendered Inquiry unavailable / This service page is not public instead of the human inquiry form."
      - path: "tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts"
        issue: "Fails preflight without DEPLOY_BASE_URL, AE_NOTIFICATION_OUTBOX_SECRET, and SMOKE_NOTIFICATION_DISPATCH_ID."
      - path: "tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts"
        issue: "Fails preflight without DEPLOY_BASE_URL, AE_NOTIFICATION_OUTBOX_SECRET, and SMOKE_NOVU_NOTIFICATION_DISPATCH_ID."
      - path: ".planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md"
        issue: "Authoritative blocker artifact remains unresolved."
      - path: "src/routeTree.gen.ts"
        issue: "Post-push route probes show /$slug/inquiry and notification dispatch routes are deployed; support/provider closeout is now blocked by deployed source state and env, not route visibility."
      - path: ".planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-EVIDENCE.md"
        issue: "Missing, correctly, because smokes are not green."
      - path: ".planning/phases/02-human-inquiry-owner-inbox/02-SUMMARY.md"
        issue: "Missing, correctly, because final closeout is blocked."
      - path: ".planning/phases/02-human-inquiry-owner-inbox/02-UAT.md"
        issue: "Missing, correctly, because final closeout is blocked."
    missing:
      - "Provide DEPLOY_BASE_URL and SMOKE_PHASE2_BUSINESS_SLUG for a deployed HTTPS app with a complete human_inquiry_owner_inbox support record on a published eligible service."
      - "Configure deployed source state so the smoke slug is a published eligible service with a complete human_inquiry_owner_inbox support record and renders the human inquiry form."
      - "Provide AE_NOTIFICATION_OUTBOX_SECRET and source-owned Resend/Novu owner dispatch IDs created by the deployed inquiry flow."
      - "Verify deployed server settings for Convex, Clerk, Resend, Novu, and matching AE_NOTIFICATION_OUTBOX_SECRET without recording secret values."
      - "Run npm run test:phase2-support-smoke, npm run test:provider-smoke:resend, and npm run test:provider-smoke:novu successfully."
      - "Record non-secret deploy/provider evidence, then create final 02-SUMMARY.md and 02-UAT.md only if still needed."
---

# Phase 2: Human Inquiry + Owner Inbox Verification Report

**Phase Goal:** One conservative customer inquiry path: customer message persists, owner sees it, owner can reply/close, notification failure/readback is visible, and message truth is not lost.
**Verified:** 2026-06-29T06:30:00Z
**Status:** gaps_found
**Re-verification:** Yes - refreshed after source/UI gap-closure execution.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | P2-R1 inquiry availability gate | VERIFIED (local) | Source support-record gate and route readbacks exist; unit tests cover missing/incomplete/capacity/failure support states. Deployed support smoke remains blocked under P2-R8. |
| 2 | P2-R2 inquiry submit command | VERIFIED | Unit and Convex runtime tests cover durable thread/message/audit/funnel/operation/notification effects, replay/conflict, rate limit, invalid, unavailable, and suppressed paths. |
| 3 | P2-R3 owner inbox projection | VERIFIED (local) | Owner inbox/detail source and route flows are wired; wrong-owner denial, buckets, owner E2E, route readbacks, and the equal-updated/no-longer-present owner invariant are covered. |
| 4 | P2-R4 owner reply state machine | VERIFIED | Owner mark-read/reply/close are POST/server-backed, versioned, idempotent, audited, and tested for wrong owner, stale, terminal, replay, empty, disabled, and CSRF/Origin paths. |
| 5 | P2-R5 notification outbox/readback | VERIFIED (local) | Inquiry submit/reply create source-owned Resend and Novu dispatch bindings; outbox tests cover provider-missing, sent/triggered, webhook held/bound, retry, no-repair, and operator readback. Real provider smokes remain blocked under P2-R8. |
| 6 | P2-R6 private content boundary | VERIFIED | Redaction tests and E2E assertions cover public/operator/provider response boundaries; admin reconstruction renders hashes/refs, not raw body/contact/provider payloads. |
| 7 | P2-R7 inquiry and inbox UI states | VERIFIED | Orchestrator gate reports local E2E PASS: 24 tests and a11y PASS: 6 tests with local dev-server permission. Test files cover public inquiry, owner inbox/detail, mark-read, reply/close, delivery readback, focus, mobile, and operator reconstruction. |
| 8 | P2-R8 closeout proof | FAILED | Deployed Phase 2 routes are now live on `https://agentic-economy-phi.vercel.app`, but the tested inquiry slugs render `Inquiry unavailable` / `This service page is not public`. Provider routes are present but fail with `missing_notification_outbox_secret`; final SUMMARY/UAT and deploy-smoke evidence remain absent by guard. |
| 9 | edge-R2 submit edge coverage | VERIFIED | Unit tests cover invalid, unavailable, suppressed, duplicate replay/conflict, rate limit, redaction, and no extra rows on rejected paths. |
| 10 | edge-R3 owner adjacency/order coverage | VERIFIED | `tests/unit/convex/inquiries-runtime.test.ts:155` covers equal-`updatedAt` ordering by thread id and no-longer-present owner list/detail denial without leaking thread id, body, or owner row id; named test passed in this refresh. |
| 11 | edge-R4 owner read/reply/close edge coverage | VERIFIED | Unit and Convex runtime tests cover read/reply/close replay, stale, terminal, wrong-owner, empty reply, and disabled owner replies. |
| 12 | edge-R6 privacy/concurrency/provider invariant | VERIFIED (local) | Privacy delete/export/tombstone and provider webhook/readback tests show provider events do not mutate inquiry/message truth. |
| 13 | edge-R7 UI acceptance coverage | VERIFIED | `tests/e2e/public-owner-ui.spec.ts` and `tests/e2e/a11y/public-owner-a11y.spec.ts` include Phase 2 flow, keyboard/focus, compact layout, and future-surface copy assertions. |
| 14 | inquiry-availability-truth | VERIFIED (local) | Support-readiness and public route readback code are implemented and tested. |
| 15 | notification-failure-truth | VERIFIED (local) | Notification failure/held/readback tests preserve inquiry/message rows and expose operator next action. |
| 16 | retention-truth | VERIFIED | Export/delete/tombstone behavior is implemented and tested; private-deleted content is replaced while hashes/refs persist. |
| 17 | support-truth | VERIFIED (local) | Support record shape, Convex mapping, and local gating are implemented and tested; deployed support-row smoke is still open under P2-R8. |
| 18 | authority-truth | VERIFIED | Owner/operator authority is source-derived; retry/no-repair and inquiry actions are guarded by Clerk/source authority and CSRF/Origin tests. |

**Score:** 17/18 truths verified, 0 present-but-behavior-unverified, 1 failed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `convex/inquiries.ts` | Durable inquiry adapter | VERIFIED | Persists inquiry rows, support-record source state, CSRF/Origin admission, owner mutations, dispatch bindings, and operator reconstruction support. |
| `convex/notificationOutbox.ts` | Durable outbox adapter | VERIFIED | Persists notification dispatch/attempt/webhook state, CSRF/Origin operator admission, audit/funnel/operation reconstruction, retry, and no-repair. |
| `src/modules/inquiries/inquiry.functions.ts` | Route/server seam | VERIFIED | Exports public submit, owner mark-read/reply/close, delivery, privacy, and admin reconstruction route functions with server-supplied CSRF/Origin evidence. |
| `src/routes/$slug.inquiry.tsx` | Public inquiry UI | VERIFIED | Renders validation, saved-message receipt, and safe delivery state. |
| `src/routes/owner.inquiries.tsx` | Owner inbox UI | VERIFIED | Loads source-backed owner inbox instead of static local state. |
| `src/routes/owner.inquiries.$threadId.tsx` | Owner thread UI | VERIFIED | Renders mark-read, reply, close, delivery readback, privacy readback, and POST-backed actions. |
| `src/routes/admin.inquiries.tsx` | Operator reconstruction UI | VERIFIED | Exists and is registered in `src/routeTree.gen.ts` as `/admin/inquiries`. |
| `tests/e2e/public-owner-ui.spec.ts` | Phase 2 browser flow | VERIFIED | Contains named Phase 2 public/owner/operator flow and no-future-surface assertions. |
| `tests/e2e/a11y/public-owner-a11y.spec.ts` | Phase 2 a11y flow | VERIFIED | Contains compact 375px keyboard/focus/overflow checks for inquiry, owner controls, and operator reconstruction. |
| `output/playwright/phase2-ui/operator-reconstruction-compact.png` | Compact operator evidence | VERIFIED | PNG exists, 375 x 3532. |
| `output/playwright/phase2-ui/operator-reconstruction-wide.png` | Wide operator evidence | VERIFIED | PNG exists, 1440 x 2147. |
| `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` | Deployed support smoke | BLOCKED | Present and runs against deployed URL/slug. Post-push attempt against `plumbing-demo` reached the deployed route but failed because the page rendered `Inquiry unavailable` / `This service page is not public`. |
| `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts` | Resend provider smoke | BLOCKED | Present and fail-fast; cannot pass without deployed URL, outbox secret, and source-owned dispatch ID. |
| `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts` | Novu provider smoke | BLOCKED | Present and fail-fast; cannot pass without deployed URL, outbox secret, and source-owned Novu dispatch ID. |
| `02-DEPLOY-SMOKE-BLOCKERS.md` | Smoke blocker artifact | VERIFIED | Present and authoritative; records missing setup without secret values. |
| `02-DEPLOY-SMOKE-EVIDENCE.md` | Passing smoke evidence | MISSING/BLOCKED | Correctly absent while smokes fail. |
| `02-SUMMARY.md` | Final closeout summary | MISSING/BLOCKED | Correctly absent while smokes fail. |
| `02-UAT.md` | Final UAT if needed | MISSING/BLOCKED | Correctly absent while smokes fail. |

### Key Link Verification

| From | To | Status | Details |
|---|---|---|---|
| Public inquiry route | `submitPublicInquiryServer` / Convex inquiry mutation | WIRED | `src/routes/$slug.inquiry.tsx` calls the route-facing submit seam; server functions pass CSRF/Origin evidence. |
| Owner thread route | mark-read/reply/close server functions | WIRED | `src/routes/owner.inquiries.$threadId.tsx` imports and calls `markCurrentOwnerInquiryReadServer`, reply, and close functions. |
| Inquiry effects | notification outbox dispatches | WIRED | `convex/inquiries.ts` calls `enqueueInquiryNotificationModule` for Resend and Novu and stores dispatch bindings on inquiry notifications. |
| Resend webhook route | notification outbox ingest | WIRED | `src/routes/api.notification.resend-webhook.ts` verifies Svix raw-body signatures before forwarding redacted metadata. |
| Guarded provider routes | deployed provider smokes | WIRED/BLOCKED | `/api/notification/resend-dispatch` and `/api/notification/novu-dispatch` are in `src/routeTree.gen.ts`; smoke execution is blocked by missing env/smoke IDs. |
| Route tree | future route isolation | WIRED | `src/routeTree.gen.ts` contains `/admin/inquiries` and notification routes. The prior Phase 2 isolation check predated Phase 4; after Phase 4, `/owner/actions` is intentionally active, while `/owner/billing*` and `/api/billing/webhook` remain parked outside active routes. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/routes/$slug.inquiry.tsx` | Public inquiry readback and receipt | `readPublicInquiryRouteReadback` / `submitPublicInquiryServer` | Yes, local/E2E source fixture and Convex seam | FLOWING (local) |
| `src/routes/owner.inquiries.tsx` | Owner inbox readback | `readCurrentOwnerInboxServer` | Yes, source-backed owner inbox route seam | FLOWING (local) |
| `src/routes/owner.inquiries.$threadId.tsx` | Thread/detail/delivery/tombstone readbacks | Owner server functions and route helper | Yes, source-backed route seam and local E2E fixture | FLOWING (local) |
| `src/routes/admin.inquiries.tsx` | Operator reconstruction rows | `readInquiryOperatorReconstructionServer` | Yes, source rows assemble thread/message/notification/dispatch/audit/funnel/operation refs | FLOWING (local) |
| Deploy/provider smokes | Deployed support and provider readbacks | Deployed app, Convex source state, Resend, Novu | Routes are deployed, but no passing deployed support/provider evidence exists; tested deployed slugs render unavailable and provider routes lack outbox secret/env | BLOCKED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| TypeScript | `npm run typecheck` | Orchestrator reported PASS | PASS |
| Convex codegen validation | `npm run check:convex-codegen` | Orchestrator reported PASS with network permission: dry-run bindings, uploaded functions to Convex for validation, ran TypeScript | PASS |
| Unit suite | `npm run test:unit -- tests/unit/convex/inquiries-runtime.test.ts` | Orchestrator reported PASS: 34 files / 159 tests | PASS |
| Owner inbox equal-timestamp/no-leak invariant | `npm run test:unit -- tests/unit/convex/inquiries-runtime.test.ts -t "lists equal-updated owner inquiries by thread id and denies no-longer-present owner readbacks without leaking rows"` | Ran in this refresh: 1 passed, 158 skipped, 34 files enumerated. | PASS |
| Integration suite | `npm run test:integration` | Orchestrator reported PASS: 8 files / 26 tests | PASS |
| Types/imports/source/copy/SEO/UI-contract gates | `npm run test:types`, `test:imports`, `test:source-mining`, `test:ts-standards`, `test:copy`, `test:seo`, `test:ui-contract` | Orchestrator reported all PASS | PASS |
| Production build | `npm run build -- --logLevel error` | Orchestrator reported PASS | PASS |
| Local E2E | `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e` | First sandbox run failed with local listen EPERM; rerun with dev-server permission PASS: 24 tests | PASS |
| Local a11y | `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y` | Orchestrator reported PASS with dev-server permission: 6 tests | PASS |
| Command-side env presence | key-presence-only shell/.env.local check | Rerun 2026-06-29T05:57Z: `.env.local` has `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, and `CLERK_SECRET_KEY`; shell is missing those names. Shell and `.env.local` are missing `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOTIFICATION_DISPATCH_ID`, `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`, `RESEND_API_KEY`, `RESEND_FROM`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER`. No values printed. | BLOCKED |
| Deployed route observation | external operator smoke attempt | Post-push probes against `https://agentic-economy-phi.vercel.app` returned `200` for inquiry, owner/admin inquiry, discovery, and protected-action routes; provider dispatch routes returned `500 missing_notification_outbox_secret`, proving route presence but missing provider env. | PARTIAL |
| Deployed support smoke | `DEPLOY_BASE_URL=https://agentic-economy-phi.vercel.app SMOKE_PHASE2_BUSINESS_SLUG=plumbing-demo npm run test:phase2-support-smoke` | Reran post-push; failed because deployed page rendered `Inquiry unavailable` / `This service page is not public` instead of the required human inquiry form. | FAIL |
| Resend provider smoke | `npm run test:provider-smoke:resend` | Reran 2026-06-29T05:57Z; fail-fast missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOTIFICATION_DISPATCH_ID`; no provider send attempted | FAIL (expected blocker) |
| Novu provider smoke | `npm run test:provider-smoke:novu` | Reran 2026-06-29T05:57Z; fail-fast missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`; no provider trigger/readback attempted | FAIL (expected blocker) |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| Conventional probes | `find scripts -path '*/tests/probe-*.sh' -type f` | No phase-declared probe scripts were used for this closeout; deploy/provider smokes are Playwright commands listed above. | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| P2-R1 | 02-04 | Inquiry availability gate | VERIFIED local, blocked deployed | Source/unit support-readiness gates pass; deployed support smoke still blocked. |
| P2-R2 | 02-02/02-03 | Inquiry submit command | VERIFIED | Unit/Convex/E2E evidence covers submit and failure paths. |
| P2-R3 | 02-02/02-03 | Owner inbox projection | VERIFIED local | Owner inbox/detail route and tests exist; named Convex runtime test covers equal-`updatedAt` ordering and no-longer-present owner list/detail denial without leaking rows. |
| P2-R4 | 02-02/02-03 | Owner reply state machine | VERIFIED | Server route, CSRF/Origin, state transition, and E2E owner action coverage exist. |
| P2-R5 | 02-02/02-04 | Notification outbox/readback | VERIFIED local, blocked provider | Source dispatch binding and redacted provider helper tests pass; Resend/Novu deployed provider smokes are blocked. |
| P2-R6 | 02-02/02-03/02-04 | Private content boundary | VERIFIED local | Redaction/copy/import/E2E assertions exist; deploy smoke evidence still absent. |
| P2-R7 | 02-03/02-04 | Inquiry and inbox UI states | VERIFIED local | E2E/a11y gate passed and screenshots are non-empty. |
| P2-R8 | 02-02/02-03/02-04 | Phase 2 closeout proof | FAILED | Source/UI reconstruction exists locally and deployed routes are now present, but deployed support/provider smoke evidence and final closeout artifacts are blocked because the tested deployed slugs are not public inquiry-ready and provider env/dispatch IDs are missing. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| none | n/a | n/a | n/a | No unresolved TODO/FIXME/XXX blocker was found in the inspected Phase 2 source/test files. Empty array/null returns found by grep are parser/default/readback branches, not user-visible stubs. |

### Gaps Summary

The old source and UI blocker set is closed in the current worktree: source mutations are CSRF/Origin admitted, inquiry-created dispatch bindings exist, owner mark-read is route/server backed, the owner inbox ordering/non-leak invariant has a passing named runtime test, the operator reconstruction route is active, Phase 5 billing routes remain parked outside the active route tree, and local E2E/a11y evidence is green.

Phase 2 still cannot pass or close. The roadmap exit proof requires deployed support/provider evidence. The latest operator observations show the target deployed host is serving the current route set, but the tested support-smoke slugs render unavailable because the service page is not public, and provider dispatch routes are blocked by missing outbox secret/provider env/dispatch IDs. `02-DEPLOY-SMOKE-BLOCKERS.md` remains authoritative; final `02-SUMMARY.md`, `02-UAT.md`, and `02-DEPLOY-SMOKE-EVIDENCE.md` correctly remain absent until those smokes are green.

---

_Verified: 2026-06-29T06:30:00Z_
_Verifier: the agent (gsd-verifier)_
