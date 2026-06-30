# L6 Workflows Audit — End-to-End Ops (Claim → Publish → Inquiry → Notify → Owner Reply)

**Scope:** Cross-phase operational workflow from owner claim/publish through customer inquiry, owner notification delivery, owner read/reply/close, and operator reconstruction. Deploy smoke harnesses, runbooks, GTM funnel proof, and closeout artifacts.  
**Evidence base:** `.planning/STATE.md`, `.planning/GTM-READINESS.md`, `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`, `.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md`, `.planning/phases/01-ten-star-spine-foundation/01-DEPLOY-READBACK-EVIDENCE.md`, `tests/deploy-smoke/**`, `tests/e2e/public-owner-ui.spec.ts`, `.planning/codebase/CONCERNS.md`  
**Audit date:** 2026-06-30  
**Verdict:** Local/source loop is implemented and E2E-proven with fixtures; **deployed end-to-end workflow is unproven**. Phase 2 closeout remains blocked. No standalone operator runbook exists.

## Workflow stages vs proof

| Stage | Local/source proof | Deployed proof | Gap |
|---|---|---|---|
| Claim → publish | PASS — `tests/e2e/public-owner-ui.spec.ts` claim submission + public page | PASS — `test:deploy-smoke` on `/claim`, `/{slug}` (`agentic-economy-r10-smoke`) | Deploy slug ≠ inquiry-ready slug; publish does not auto-seed P2 support row |
| Publish → inquiry available | PASS — fixture `plumbing-demo` + support record in local/Convex tests | **FAIL** — `/plumbing-demo/inquiry` renders *Inquiry unavailable / This service page is not public* | Deployed Convex missing published eligible service + complete `human_inquiry_owner_inbox` support row |
| Inquiry submit | PASS — local E2E + Convex runtime | **FAIL** — `test:phase2-support-smoke` reaches route but form absent | Same deployed source-state gap |
| Notify (Resend/Novu) | PASS — unit/outbox tests; dispatch bindings on submit/reply | **FAIL** — dispatch routes return `500 missing_notification_outbox_secret`; provider smokes fail preflight | Missing `AE_NOTIFICATION_OUTBOX_SECRET`, Resend/Novu server env, inquiry-created dispatch IDs |
| Owner read/reply/close | PASS — local E2E on fixture thread | **None** — no deployed owner-session smoke for inbox/reply | Phase 2 deploy smokes omit owner Clerk session (unlike P5/P6 smokes) |
| Operator reconstruction | PASS — local E2E + PNG evidence | **None** — no deployed reconstruction artifact | Depends on live inquiry-created dispatch IDs |

## ROI tier key

| Tier | Meaning |
|:---:|---|
| **S** | Stop-ship — blocks production inquiry conversion or P2 closeout |
| **A** | High — unlocks repeatable ops once S blockers clear |
| **B** | Medium — important but downstream of deploy proof |
| **C** | Low — engineering/process debt |

## Findings

| ID | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|---|---|:---:|:---:|:---:|:---:|---|---|
| **WF-001** | Deployed inquiry path unreachable: tested slugs render *Inquiry unavailable* / *not public* | **Yes** | **High** | M | **S** | `02-DEPLOY-SMOKE-BLOCKERS.md` post-push probes; `02-VERIFICATION.md` P2-R8 FAILED | Seed deployed Convex with published eligible service + complete `human_inquiry_owner_inbox` `capabilityLaunchSupportRecords` row; re-run `test:phase2-support-smoke` |
| **WF-002** | Phase 2 closeout (P2-R8) blocked: no green deploy/provider smoke evidence | **Yes** | **High** | M | **S** | `02-VERIFICATION.md` 17/18; missing `02-DEPLOY-SMOKE-EVIDENCE.md`, `02-SUMMARY.md`, `02-UAT.md` | Execute unblock sequence in `02-DEPLOY-SMOKE-BLOCKERS.md` §Unblock Sequence; record non-secret evidence artifact |
| **WF-003** | Notification step dead on deploy: outbox secret + Resend/Novu env absent | **Yes** | **High** | S | **S** | Post-push probe `POST /api/notification/*-dispatch` → `500 missing_notification_outbox_secret`; `test:provider-smoke:resend/novu` fail preflight | Configure deployed `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`; match local smoke bearer |
| **WF-004** | Provider smokes require inquiry-created dispatch IDs with no scripted derivation | **Yes** | **High** | M | **S** | `02-DEPLOY-SMOKE-BLOCKERS.md` §Dispatch ID Requirements; `phase2-resend/novu-dispatch-smoke.spec.ts` | After WF-001 green: submit deploy inquiry → capture Resend/Novu dispatch IDs via `/admin/inquiries` → set `SMOKE_NOTIFICATION_DISPATCH_ID` / `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` |
| **WF-005** | No operator runbook for claim→publish→inquiry→notify→reply workflow | **Yes** | Medium | M | **A** | `ENGINEERING-STANDARDS.md` requires runbook doc type; only blocker artifact §Unblock Sequence exists | Author `.planning/runbooks/human-inquiry-owner-workflow.md`: env checklist, Convex seed steps, smoke order, rollback/kill rule |
| **WF-006** | No single deployed smoke spans full workflow chain | **Yes** | **High** | L | **A** | Phase 1 smoke stops at catalog/discovery; P2 support smoke stops at submit receipt; provider smokes hit dispatch routes only; no owner-reply step | Add `tests/deploy-smoke/phase2-workflow-smoke.spec.ts`: published slug → inquiry submit → owner session reply → dispatch trigger → admin reconstruction |
| **WF-007** | Phase 2 deploy smokes omit owner Clerk session (unlike P5/P6) | **Yes** | Medium | M | **A** | `phase1-deploy-smoke.spec.ts` has owner/admin storage states; `phase2-*-smoke.spec.ts` do not exercise `/owner/inquiries` or reply POST | Extend workflow smoke with `SMOKE_OWNER_STORAGE_STATE`; assert owner inbox thread + reply receipt on deploy |
| **WF-008** | Five owner activation rows remain 0/5 — internal-alpha / founder outreach blocked | **Yes** | **High** | L | **A** | `STATE.md` blockers; `GTM-READINESS.md` §Owner activation; `01-DEPLOY-READBACK-EVIDENCE.md` §Remaining Non-Deploy Evidence | Run founder-assisted claim→publish→status→share for five friendly owners; record in `01-ALPHA-EVIDENCE.md` |
| **WF-009** | Deploy smoke env fragmented across slugs and phases | Soft | Medium | S | **B** | P1 deploy slug `agentic-economy-r10-smoke`; P2 slug `plumbing-demo`; five command-side env vars undocumented in one place | Document canonical deploy smoke profile (base URL, slug, storage states, dispatch ID lifecycle) in runbook |
| **WF-010** | `test:all` omits E2E, a11y, and all deploy/provider smokes | Soft | Low | S | **B** | `.planning/codebase/CONCERNS.md` §test:all Omissions; `package.json` | Add CI/release checklist: `test:e2e`, `test:a11y`, `test:deploy-smoke`, P2/P5/P6 provider smokes before launch claims |
| **WF-011** | GTM P2 funnel events (`inquiry_submitted`, `owner_inquiry_replied`, `notification_delivered`) not proven queryable end-to-end on deploy | Soft | Medium | M | **B** | `GTM-READINESS.md` §Additional funnel events; observability types exist in `src/modules/observability/` | Wire admin funnel readback query; include non-secret event refs in deploy smoke evidence |
| **WF-012** | Publish path does not auto-provision `human_inquiry_owner_inbox` support record | Soft | Medium | M | **B** | `convex/inquiries.ts` loads `capabilityLaunchSupportRecords`; inquiry gate fails without row; no publish-side seed in claim flow | Decide: operator seed script vs publish hook when `firstRequest=inquiry_available`; document in runbook |
| **WF-013** | Resend webhook delivery path has no deploy smoke (dispatch trigger only) | Soft | Medium | M | **B** | `phase2-resend-dispatch-smoke.spec.ts` POSTs guarded dispatch; no deployed Svix webhook → outbox readback proof | Add optional webhook replay smoke or document manual operator verification step |
| **WF-014** | Phase 3 deployed discovery proof gap blocks builder leg of post-inquiry assistant routing | No | Low | M | **C** | `STATE.md`: Phase 3 local passed, no deployed smoke artifact | Capture deployed Phase 3 route/readback smoke separately; do not block P2 workflow on P3 |

## Top 5 ROI

1. **WF-001** — Deployed inquiry unavailable (blocks customer conversion at `/{slug}/inquiry`)
2. **WF-002** — P2-R8 closeout blocked (no production claim for human inquiry loop)
3. **WF-003** — Notification provider env missing (notify step fails on deploy)
4. **WF-006** — No end-to-end deployed workflow smoke (cannot repeat or regress-guard the full chain)
5. **WF-005** — Missing operator runbook (unblock sequence trapped in blocker artifact only)

## Recommended unblock order

1. Configure deployed server env (`CONVEX_URL`, Clerk, outbox secret, Resend, Novu) per `02-DEPLOY-SMOKE-BLOCKERS.md` §Required Deployed Setup.
2. Seed deployed Convex: published business + `inquiry_available` service + complete `human_inquiry_owner_inbox` support row for smoke slug.
3. Set command-side env: `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, `AE_NOTIFICATION_OUTBOX_SECRET`.
4. Run `npm run test:phase2-support-smoke` → capture inquiry-created dispatch IDs → set provider smoke env vars.
5. Run `npm run test:provider-smoke:resend` and `npm run test:provider-smoke:novu`.
6. Record `02-DEPLOY-SMOKE-EVIDENCE.md`; add operator runbook; then author `02-SUMMARY.md` / `02-UAT.md` if still required.
