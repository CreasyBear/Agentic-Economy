---
phase: 02-human-inquiry-owner-inbox
status: blocked
created: "2026-06-29T03:10:27Z"
updated: "2026-06-29T06:30:00Z"
blocker: deploy-support-state-and-provider-smoke-inputs-missing
secret_handling: "Env var names and presence/absence only; no secret values recorded."
---

# Phase 2 Deploy/Provider Smoke Blockers

Phase 2 source and UI-route gaps are closed locally, but final Phase 2 closeout remains blocked because deploy/provider smoke inputs are missing. No final `02-SUMMARY.md` or `02-UAT.md` should be created until the deployed support smoke and both provider smokes pass with non-secret evidence.

## Command-Side Env Presence

Checked only for key presence in the shell and `.env.local`; no values were printed or recorded.

| Env var | Shell | `.env.local` | Needed for |
|---|---|---|---|
| `DEPLOY_BASE_URL` | missing | missing | All deploy/provider smokes; must be a deployed `https://` base URL, not localhost or `.local`. |
| `SMOKE_PHASE2_BUSINESS_SLUG` | missing | missing | Deployed support-record smoke; must be a published eligible service slug. |
| `AE_NOTIFICATION_OUTBOX_SECRET` | missing | missing | Guarded Resend and Novu dispatch smoke routes; must match deployed server config. |
| `SMOKE_NOTIFICATION_DISPATCH_ID` | missing | missing | Resend smoke; must be a source-owned owner Resend dispatch created by the inquiry flow. |
| `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` | missing | missing | Novu smoke; must be a source-owned owner Novu dispatch created by the inquiry flow. |

## 2026-06-29 Recheck

Key-presence recheck at 2026-06-29T05:57Z still found the required smoke keys missing from both shell and `.env.local`. `.env.local` contains `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, and `CLERK_SECRET_KEY` by key-name presence only, but does not contain `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOTIFICATION_DISPATCH_ID`, `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`, `RESEND_API_KEY`, `RESEND_FROM`, `NOVU_SECRET_KEY`, or `NOVU_WORKFLOW_INQUIRY_OWNER`.

Operator support-smoke attempts against `https://agentic-economy-phi.vercel.app` with `plumbing-demo` and `parramatta-emergency-plumbing` both returned body `Not found`. Local source contains the `/$slug/inquiry` route and generated route-tree entries, so deployed closeout also requires proving the target deployment is serving the current route set before provider evidence can count.

Live route probe distinction before the GitHub sprint push: the Vercel host was reachable, but the current Phase 2 route set was not visible there.

| Probe | Result |
|---|---|
| `GET https://agentic-economy-phi.vercel.app/` | `200` |
| `GET https://agentic-economy-phi.vercel.app/registry` | `200` |
| `GET /plumbing-demo/inquiry` | `404` |
| `GET /parramatta-emergency-plumbing/inquiry` | `404` |
| `GET /owner/inquiries` | `404` |
| `GET /admin/inquiries` | `404` |
| `POST /api/notification/resend-dispatch` | `404` |
| `POST /api/notification/novu-dispatch` | `404` |

## 2026-06-29 Post-Push Deployment Recheck

After sprint commit `82b8600` reached `origin/main`, the Vercel host began serving the current route set. Route availability is no longer the blocker.

| Probe | Result |
|---|---|
| `GET https://agentic-economy-phi.vercel.app/` | `200` |
| `GET /registry` | `200` |
| `GET /developers/discovery` | `200` |
| `GET /api/discovery/schema` | `200` |
| `GET /api/discovery/examples` | `200` |
| `GET /plumbing-demo/inquiry` | `200`, renders `Inquiry unavailable` / `This service page is not public` |
| `GET /parramatta-emergency-plumbing/inquiry` | `200`, renders `Inquiry unavailable` / `This service page is not public` |
| `GET /owner/inquiries` | `200` |
| `GET /admin/inquiries` | `200` |
| `GET /owner/actions` | `200` |
| `GET /admin/protected-actions` | `200` |
| `POST /api/notification/resend-dispatch` | `500`, `missing_notification_outbox_secret` |
| `POST /api/notification/novu-dispatch` | `500`, `missing_notification_outbox_secret` |

`DEPLOY_BASE_URL=https://agentic-economy-phi.vercel.app SMOKE_PHASE2_BUSINESS_SLUG=plumbing-demo npm run test:phase2-support-smoke` was rerun after route deployment. It reached the deployed route but failed because the required `Send a human inquiry to the owner` heading was absent; the deployed page rendered `Inquiry unavailable` with reason `This service page is not public`.

Current blocker: deploy/source state must expose a published eligible service with a complete `human_inquiry_owner_inbox` support row, then provider smoke inputs and server env must be configured.

## Required Deployed Setup

The deployed application must have these server-side settings configured before the smokes can produce closeout evidence:

| Setting | Status in this run | Notes |
|---|---|---|
| `CONVEX_URL` or `VITE_CONVEX_URL` | not verified | Deployment provider setting required for deployed source state access. |
| `CLERK_SECRET_KEY` | not verified | Required for owner identity lookup and provider dispatch handoff. |
| `RESEND_API_KEY` | not verified | Required for real or sandbox Resend send. |
| `RESEND_FROM` | not verified | Required for Resend sender identity. |
| `AE_NOTIFICATION_OUTBOX_SECRET` | missing locally, deployed presence not verified | Required both locally for smoke authorization and on the deployed server. |
| `NOVU_SECRET_KEY` | not verified | Required for Novu trigger/readback. |
| `NOVU_WORKFLOW_INQUIRY_OWNER` | not verified | Required for the owner inquiry Novu workflow. |

Optional settings remain optional only where the existing helpers treat them as optional: `RESEND_WEBHOOK_SECRET`, `NOVU_API_BASE_URL`, and `RESEND_API_BASE_URL`.

The deployed Convex source state must also include a complete `capabilityLaunchSupportRecords` row for capability `human_inquiry_owner_inbox`, attached to the published eligible service named by `SMOKE_PHASE2_BUSINESS_SLUG`.

## Dispatch ID Requirements

Provider smoke dispatch IDs must not be fabricated. Before running provider smokes, prove through `/admin/inquiries` or equivalent operator reconstruction that:

| Dispatch ID env var | Required proof |
|---|---|
| `SMOKE_NOTIFICATION_DISPATCH_ID` | Bound to an inquiry-created owner Resend notification dispatch in the configured deployment. |
| `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` | Bound to an inquiry-created owner Novu notification dispatch in the configured deployment. |

## Blocked Commands

These are the exact commands that remain blocked until the missing inputs and deployed setup are available:

```bash
npm run test:phase2-support-smoke
npm run test:provider-smoke:resend
npm run test:provider-smoke:novu
```

Observed fail-fast results from the prior Plan 04 blocker-routing run:

| Command | Result |
|---|---|
| `npm run test:phase2-support-smoke` | Expected preflight failure: missing `DEPLOY_BASE_URL` and `SMOKE_PHASE2_BUSINESS_SLUG`; no deployed browser navigation attempted. |
| `npm run test:provider-smoke:resend` | Expected preflight failure: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID`; no provider send attempted. |
| `npm run test:provider-smoke:novu` | Expected preflight failure: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`; no provider trigger/readback attempted. |

Current typed-executor rerun at `2026-06-29T05:53:51Z` checked key presence only. `.env.local` exists, but all five required command-side smoke names are still missing in both the shell and `.env.local`; no values were printed or recorded. The smoke commands were not rerun in this attempt because the plan routes missing required inputs directly to this blocker artifact before deployed/provider command execution.

## Unblock Sequence

1. Configure the five command-side env vars above in the shell or approved local secret mechanism without committing or recording values.
2. Verify the deployed server has the required runtime settings listed above.
3. Verify deployed Convex source state has a published eligible service and complete `human_inquiry_owner_inbox` support record for the target smoke slug.
4. Verify `/{slug}/inquiry` renders the human inquiry form, not the unavailable state.
5. Use the public inquiry path to create or identify source-owned owner Resend and Novu dispatch IDs.
6. Prove those dispatch IDs are bound to inquiry-created owner notifications through `/admin/inquiries` or equivalent operator reconstruction.
7. Run the blocked commands in this order: support smoke, Resend provider smoke, Novu provider smoke.
8. Record non-secret deploy/provider evidence, including timestamps, deployed host, business slug, non-secret inquiry/thread refs, dispatch IDs, provider family, redacted provider refs, payload hashes, final dispatch states, readback state, operator next action, and a statement that no secret values were recorded.

## Closeout Guard

Final Phase 2 closeout remains blocked. Do not create final `02-SUMMARY.md` or `02-UAT.md` until the deploy/provider smoke evidence is green.
