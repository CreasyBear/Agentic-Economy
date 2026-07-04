---
phase: 02-human-inquiry-owner-inbox
status: blocked
last_updated: "2026-06-29T05:53:51Z"
phase1_deferred_debt: "Five owner activation evidence rows remain 0/5; user approved continuing Phase 2-5 execution on 2026-06-28."
phase2_closeout_blocker: "Deploy/provider smoke inputs are missing; final 02-SUMMARY.md and 02-UAT.md are intentionally absent."
---

# Phase 02 Execution Evidence

## 2026-06-28 Inquiry Idempotency Tightening

Scope:

- Continued Phase 2 execution after Phase 1 technical closeout with five owner activation rows recorded as deferred launch debt.
- Hardened the existing inquiry command seam in `src/modules/inquiries/internal/commands.ts`.
- Expanded `tests/unit/inquiries/inquiry-flow.test.ts` coverage for public submit replay/conflict and owner-action failure branches.

Behavior covered:

- Public inquiry submit replays same key plus same body without creating extra thread/message/notification rows.
- Public inquiry submit rejects same key plus changed body as `inquiry_duplicate_conflict`.
- Wrong-owner read/reply fails closed as `inquiry_not_found`.
- Stale owner read state changes return `inquiry_stale_version`.
- Owner reply retries replay the original effect before stale/terminal checks.
- Owner reply same key plus changed body returns `inquiry_duplicate_conflict`.
- Closed inquiries reject new owner replies as `inquiry_terminal`.
- Source-owned reply control disables first-time owner replies as `inquiry_owner_replies_disabled`.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts` | PASS: 31 files, 113 tests |
| `npm run typecheck` | PASS |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |

## 2026-06-28 Abuse Bucket Closure

Scope:

- Reused the Phase 1 source-owned `rateLimitClaim` helper for inquiry submission abuse buckets.
- Added inquiry source state for `abuseRateLimitBuckets`.
- Added operator controls for abuse window size and max public submissions per window.
- Added typed retryable `inquiry_rate_limited` submit failures with `retryAfter` metadata.

Behavior covered:

- Accepted public submissions write source-owned abuse bucket state.
- Same abuse bucket above the configured threshold returns `inquiry_rate_limited`.
- Rate-limited attempts do not add inquiry thread, message, or notification rows.
- Rate-limit state remains private source state and is not a public projection.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts` | PASS: 31 files, 114 tests |
| `npm run typecheck` | PASS |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |

## 2026-06-28 Durable Inquiry Schema Landing Pad

Scope:

- Added `src/modules/inquiries/internal/convex-schema.ts` as the Convex-only inquiry table fragment.
- Composed the inquiry table fragment into `convex/schema.ts`.
- Extended schema tests to require inquiry durable tables and indexes.
- Kept frontend-safe inquiry type/schema exports free of Convex imports.
- Narrowly updated the private-import guard so `convex/schema.ts` may compose `internal/convex-schema` fragments without opening route or sibling-module private imports.

Durable tables added:

- `inquiryThreads`
- `inquiryMessages`
- `inquiryNotifications`
- `inquiryReadStates`
- `inquiryAbuseBuckets`
- `inquiryPrivacyTombstones`

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/schema/convex-schema.test.ts tests/unit/inquiries/inquiry-flow.test.ts` | PASS: 31 files, 114 tests |
| `npm run typecheck` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings and ran TypeScript against configured Convex deployment |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:imports` | PASS: 3 files, 3 tests |

## 2026-06-29 Durable Inquiry Function Readbacks

Scope:

- Added `convex/inquiries.ts` as the first durable Convex adapter for the inquiry module.
- Added `submitPublicInquiry`, `listCurrentOwnerInbox`, and `readCurrentOwnerInquiry`.
- Kept inquiry domain behavior inside `src/modules/inquiries/public.ts`; Convex functions adapt source rows, derive owner authority, persist effects, and serialize safe readbacks.
- Added `tests/unit/convex/inquiries-runtime.test.ts` for durable submit/list/detail behavior.

Behavior covered:

- Anonymous public submit persists one inquiry thread, message, notification, operation key, audit event, and funnel event.
- Submit replay with the same operation key/body replays without duplicate durable rows.
- Public submit responses expose thread/notification status only, not raw contact.
- Audit/funnel/notification durable rows keep contact redacted.
- Current-owner inbox requires a Clerk-authenticated owner row.
- Wrong-owner detail reads fail closed as `inquiry_not_found`.
- Source-owned owner detail readback exposes the private message body only to the matching owner.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/convex/inquiries-runtime.test.ts tests/unit/inquiries/inquiry-flow.test.ts tests/unit/schema/convex-schema.test.ts` | PASS: 32 files, 115 tests |
| `npm run typecheck` | PASS |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings and ran TypeScript against configured Convex deployment |

## 2026-06-29 Durable Owner Inquiry Mutations

Scope:

- Extended `convex/inquiries.ts` with `markCurrentOwnerInquiryRead`, `replyToCurrentOwnerInquiry`, and `closeCurrentOwnerInquiry`.
- Reused the inquiry module state machine for owner action semantics.
- Persisted durable thread, owner-message, customer-notification, audit, funnel, and idempotency effects.
- Updated `tests/unit/convex/inquiries-runtime.test.ts` with owner mutation coverage.

Behavior covered:

- Wrong-owner owner actions fail closed as `inquiry_not_found`.
- Stale owner actions return `inquiry_stale_version`.
- Mark-read updates the durable thread once and replays same-key retries.
- Owner reply appends one private owner message and one customer notification.
- Same-key owner reply retry replays without duplicating message or notification rows.
- Same-key changed reply body returns `inquiry_duplicate_conflict`.
- Close updates the durable thread once and replays same-key retries.
- Terminal closed threads reject new replies.
- Inquiry operation keys persist with operation names for submit, mark-read, reply, and close.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/convex/inquiries-runtime.test.ts tests/unit/inquiries/inquiry-flow.test.ts tests/unit/schema/convex-schema.test.ts` | PASS: 32 files, 116 tests |
| `npm run typecheck` | PASS |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings and ran TypeScript against configured Convex deployment |

## 2026-06-29 Durable Delivery Readback and Privacy Tombstones

Scope:

- Added owner-scoped Convex readback functions for inquiry delivery state, inquiry export, private-content delete, and privacy tombstone readback.
- Extended the inquiry module with `requestInquiryExport`, `deleteInquiryPrivateContent`, and `readInquiryPrivacyTombstone`.
- Added `inquiry.private_content_deleted` to the existing audit union and state-changing audit gate instead of creating a side log.
- Persisted and rehydrated inquiry privacy tombstones, private-deleted message markers, and inquiry audit refs through the Convex runtime bridge.

Behavior covered:

- Current-owner delivery readback exposes notification status without making provider success the source of message truth.
- Owner export returns private owner-authorized inquiry data plus message hashes, notification projections, audit refs, and tombstones.
- Wrong-owner export/delete fails closed as `inquiry_not_found`.
- Privacy delete replaces raw customer and owner message bodies with `[private content deleted]`, marks messages with `privateDeletedAt`, and writes an applied tombstone.
- Export/detail readbacks after delete do not contain the original customer or owner message text while preserving hashes, tombstone metadata, and audit refs.
- Same-key privacy delete retries replay the original tombstone; same-key changed reason returns `inquiry_duplicate_conflict`.
- Operation keys persist privacy delete with operation name `deleteInquiryPrivateContent`.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/convex/inquiries-runtime.test.ts tests/unit/inquiries/inquiry-flow.test.ts tests/unit/observability/audit-redaction.test.ts tests/unit/schema/convex-schema.test.ts` | PASS: 32 files, 118 tests |
| `npm run typecheck` | PASS |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings and ran TypeScript against configured Convex deployment |

## 2026-06-29 Public Inquiry and Owner Thread Routes

Scope:

- Added the public `/{slug}/inquiry` route with availability, validation, pending, submitted, and unavailable states.
- Added a public inquiry server seam that calls the anonymous Convex `inquiries:submitPublicInquiry` mutation while generating operation/correlation keys server-side.
- Added the owner `/owner/inquiries/$threadId` route with detail, reply, close, delivery readback, and privacy tombstone panels.
- Updated `/owner/inquiries` to render child thread routes and link inbox cards to thread detail.
- Added pure route readback helpers for public inquiry affordance/submit receipts and owner thread detail reconstruction.
- Updated the copy guard to allow Phase 2 inquiry/delivery wording only in shipped Phase 2 runtime contexts and phase-owned planning/test contexts.

Behavior covered:

- Public inquiry affordance appears only when the public catalog has `inquiry_available`, available capability state, public-business-contact channel, `callable: false`, and `paymentRequired: false`.
- Public route submit helper persists exactly one inquiry thread/message/notification and returns a receipt that omits raw customer body/contact.
- Ineligible or degraded capability state renders the public inquiry route as unavailable.
- Owner thread route helper reconstructs source-owned messages, notifications, and tombstones for the matching owner.
- Closed owner threads disable reply and close controls in route readback.
- Privacy-deleted inquiry detail renders `[private content deleted]` plus tombstone state and does not leak original customer/owner message text.
- Production build bundles the new `/$slug/inquiry` and `/owner/inquiries/$threadId` route surfaces.

Command evidence:

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/convex/inquiries-runtime.test.ts` | PASS: 32 files, 119 tests |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run build` | PASS |
| Playwright local render smoke at 390px for `/parramatta-emergency-plumbing`, `/parramatta-emergency-plumbing/inquiry`, and `/owner/inquiries` | PASS: routes rendered without page errors; current local source returned safe unavailable state for the default public slug |

## 2026-06-29 Notification Outbox Domain and Durable Tables

Scope:

- Reviewed current official Resend and Novu docs before provider-bound work:
  - Resend documents Svix-signed webhooks with `svix-id`, `svix-timestamp`, and `svix-signature`, and warns webhook events may be delivered more than once.
  - Resend documents an `Idempotency-Key` header for sending emails.
  - Novu documents bearer-token authentication, trigger events, `transactionId`, and `Idempotency-Key`.
  - No current Novu public webhook signature mechanism was found during this pass; Novu webhook ingestion remains deferred unless official docs prove a verifiable raw-body signature path.
- Added `src/modules/notification-outbox/public.ts` and internal schema/commands for an AE-owned notification outbox seam.
- Added Convex durable table fragment for `notificationDispatches`, `notificationDispatchAttempts`, and `notificationWebhookEvents`.
- Added server-only `.env.example` placeholders for actually planned notification env vars: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, and `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
- Added branded IDs for notification dispatch, attempt, and webhook event refs.

Behavior covered:

- `enqueueInquiryNotification` creates one redacted queued dispatch and replays same-key/same-payload requests without duplicate rows.
- Same operation key with changed redacted payload returns `notification_duplicate_conflict`.
- Dispatch attempts record Resend provider-missing and Novu orchestrator-missing states without mutating inquiry/message truth.
- Successful Resend and Novu dispatch attempts store provider refs as readback fields, not public proof.
- Unsigned/rejected webhooks are rejected before mutating dispatch state.
- Verified but unbound provider events become held-for-operator readback.
- Duplicate provider events with the same payload hash return duplicate readback; same provider event key with changed payload hash is held for operator.
- Retry and no-repair controls are operator-only; normal owner readback remains read-only with `ownerCanRepair: false`.
- Convex schema now has exact durable notification outbox tables and required indexes.

Command evidence:

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:unit -- tests/unit/notification-outbox/readback.test.ts tests/unit/schema/convex-schema.test.ts tests/unit/observability/audit-redaction.test.ts tests/unit/observability/operator-controls.test.ts` | PASS: 33 files, 124 tests |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run build` | PASS |

## 2026-06-29 Notification Outbox Convex Runtime Adapters

Scope:

- Added `convex/notificationOutbox.ts` as the Convex runtime bridge for the AE-owned notification outbox.
- Added runtime functions for enqueue, dispatch-to-provider-missing readback, webhook event ingestion, current-owner readback, operator retry, and operator no-repair.
- Reused Clerk-derived owner authority plus source-owned owner/business rows for owner readback access.
- Reused source-owned active admin membership rows for operator repair authority.
- Kept actual Resend/Novu network calls and signed HTTP webhook route out of this slice; those remain open provider work, not simulated proof.

Behavior covered:

- Runtime enqueue persists exactly one redacted `notificationDispatches` row and replays same-key/same-payload requests without duplicates.
- System-side enqueue, dispatch, and webhook ingestion require `AE_NOTIFICATION_OUTBOX_SECRET`; wrong keys return `notification_system_denied`.
- Current-owner readback requires a Clerk-authenticated owner row and hides wrong-owner dispatches as `notification_not_found`.
- Dispatch without a configured provider persists a `provider_missing` attempt and does not create or mutate inquiry truth.
- Rejected webhook events persist as rejected without changing dispatch state.
- Verified but unbound webhook events persist as held-for-operator.
- Verified bound delivery events update only notification dispatch readback.
- Duplicate provider events with the same payload hash return duplicate readback without adding another durable event row.
- Operator retry is denied without active operator membership and allowed for active support membership.
- No-repair is denied for support and allowed for active owner-admin membership.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/convex/notification-outbox-runtime.test.ts tests/unit/notification-outbox/readback.test.ts` | PASS: 34 files, 128 tests |
| `npm run typecheck` | PASS |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:seo` | PASS: 2 files, 8 tests |
| `npm run test:integration` | PASS: 8 files, 26 tests |
| `npm run build` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Resend Signed Webhook Route and Ingress Guard

Scope:

- Added `src/lib/server/notification-provider.ts` as a server-only Resend webhook verifier.
- Added `src/routes/api.notification.resend-webhook.ts` for `/api/notification/resend-webhook`.
- Wired the route to verify raw-body Svix headers before forwarding redacted provider metadata into `notificationOutbox:ingestNotificationWebhookEvent`.
- Added `AE_NOTIFICATION_OUTBOX_SECRET` as the server-held guard for system-side Convex outbox writes.
- Updated route generation and copy-scan allow-lists for the shipped Phase 2 notification webhook route.
- Investigated actual Resend send wiring and found the source state had only `emailHash`/redacted contact hashes, not a deliverable owner email or provider subscriber reference. The later Clerk owner resolver section records the source-owned send-time fix.

Behavior covered:

- Missing `RESEND_WEBHOOK_SECRET` and `AE_NOTIFICATION_OUTBOX_SECRET` fail closed with typed server errors.
- Valid Resend Svix signatures are verified from `svix-id`, `svix-timestamp`, `svix-signature`, and the raw request body.
- Stale, missing, or invalid signatures are rejected before Convex ingest is called.
- Verified route requests forward only provider event id, event type, logical object key, payload hash, signature status, system key, operation key, and correlation id.
- Raw recipient email, subject, and provider body details are not forwarded in `redactedPayloadJson`.
- The new route is included in `src/routeTree.gen.ts` and production build output.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/server/server-seams.test.ts tests/unit/convex/notification-outbox-runtime.test.ts` | PASS: 34 files, 133 tests |
| `npm run typecheck` | PASS |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run build` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Clerk Owner Resolver and Resend Send Handoff

Scope:

- Added server-only Clerk owner delivery address lookup in `src/lib/server/notification-provider.ts`.
- Added server-only Resend client config and owner inquiry send helpers using the notification outbox idempotency key.
- Added `readNotificationDispatchForSystemSend` in `convex/notificationOutbox.ts` so a system-keyed server sender can read dispatch, business, and owner Clerk identity without exposing raw email.
- Extended `dispatchNotificationOutbox` to accept a server-supplied provider result so Convex can record the Resend message id, response hash, attempt, and dispatch status after the provider call.
- Added `RESEND_API_BASE_URL` to `.env.example` because the server helper now reads it as an optional provider override.

Behavior covered:

- Missing `CLERK_SECRET_KEY`, `RESEND_API_KEY`, and `RESEND_FROM` fail closed with typed server errors.
- Clerk lookup uses `GET /users/{user_id}` with a server-only bearer key, selects the primary email address, normalizes it for immediate delivery, and derives a hash/redacted marker for safe metadata.
- Durable owner rows still store only `emailHash`; the new path does not add raw owner email to owner rows, notification dispatches, webhook events, or readbacks.
- Resend send uses `POST /emails`, the outbox `providerIdempotencyKey` as `Idempotency-Key`, and a conservative owner-inquiry email body that links to `/owner/inquiries/$threadId` without copying raw customer inquiry text.
- Resend send returns only `resendMessageId` and `providerResponseHash` to the outbox provider-result handoff.
- Source-owned system send readbacks require `AE_NOTIFICATION_OUTBOX_SECRET`, return owner Clerk user id plus business context, and do not include raw email.
- Convex provider-result handoff records a sent attempt and Resend message id without treating provider success as inquiry/message truth.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/server/server-seams.test.ts tests/unit/convex/notification-outbox-runtime.test.ts` | PASS: 34 files, 138 tests |
| `npm run typecheck` | PASS |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run build` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Guarded Resend Dispatch Route

Scope:

- Added `src/routes/api.notification.resend-dispatch.ts` for `/api/notification/resend-dispatch`.
- The route requires `Authorization: Bearer <AE_NOTIFICATION_OUTBOX_SECRET>` before it reads any dispatch, resolves any owner address, or sends any provider request.
- The route reads the system-keyed Convex dispatch snapshot, rejects unsupported non-owner/non-Resend dispatches, avoids re-sending dispatches that already have a Resend message id, resolves the Clerk owner email only at send time, calls Resend, and records the provider result back through `notificationOutbox:dispatchNotificationOutbox`.
- Updated `src/routeTree.gen.ts` so the route is part of the built application.

Behavior covered:

- Missing or wrong bearer secret returns `notification_dispatch_unauthorized` before Convex/Clerk/Resend calls.
- Invalid request bodies return `invalid_notification_dispatch_payload`.
- The dispatch bridge passes `systemKey` only server-to-Convex, uses the outbox idempotency key for the Resend send, and writes back only `resendMessageId` plus `providerResponseHash`.
- Route responses include dispatch id/status, provider response hash, owner address hash, and business slug; they do not include raw owner email or raw customer inquiry text.
- Unsupported Novu/customer dispatches are rejected before owner lookup/send.
- Already-recorded sent/delivered dispatches return `notification_resend_already_recorded` without sending another Resend request.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/server/server-seams.test.ts tests/unit/convex/notification-outbox-runtime.test.ts` | PASS: 34 files, 142 tests |
| `npm run typecheck` | PASS |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run build` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Resend Provider Smoke Harness

Scope:

- Added `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts` as the real-provider smoke for `/api/notification/resend-dispatch`.
- Added `npm run test:provider-smoke:resend` for the Phase 2 Resend provider smoke.
- The smoke requires deployed inputs instead of inventing local proof: `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID`.
- The deployed server must also have `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, and `AE_NOTIFICATION_OUTBOX_SECRET` configured before the smoke can produce a real send/readback result.

Behavior covered:

- The smoke fails before any network call when real deployed inputs are missing.
- `DEPLOY_BASE_URL` must be a deployed `https://` URL, not localhost or `.local`.
- The smoke sends the dispatch id to the guarded route with the outbox bearer secret.
- Accepted responses are limited to `notification_resend_dispatched` or `notification_resend_already_recorded`.
- Successful responses must include `Cache-Control: no-store`, matching dispatch id, business slug, `sent`/`delivered` dispatch status, and a Resend message id.
- Response-body assertions reject raw-looking email addresses and obvious raw/private customer text markers.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:provider-smoke:resend` | EXPECTED FAIL pre-flight: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID`; no provider send attempted |
| `npm run typecheck` | PASS |
| `npm run test:unit -- tests/unit/server/server-seams.test.ts tests/unit/convex/notification-outbox-runtime.test.ts` | PASS: 34 files, 142 tests |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:seo` | PASS: 2 files, 8 tests |
| `npm run test:integration` | PASS: 8 files, 26 tests |
| `npm run build` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Novu Trigger and Authenticated Readback Helpers

Scope:

- Rechecked current official Novu docs for API authentication, event trigger, idempotency, and message readback before touching source.
- Extended `src/lib/server/notification-provider.ts` with server-only Novu client config, owner-inquiry trigger helper, and transaction message readback helper.
- Added `NOVU_API_BASE_URL` to `.env.example` because the source now reads it as an optional provider override; `NOVU_SECRET_KEY` remains server-only.
- Kept the helper narrow: no public webhook claim, no multi-channel notification framework, and no message content/contact returned from readback.

Behavior covered:

- Missing `NOVU_SECRET_KEY` or `NOVU_WORKFLOW_INQUIRY_OWNER` fails closed with typed server errors.
- Novu trigger calls use `Authorization: ApiKey <secret>`, `POST /v1/events/trigger`, a workflow name, `transactionId`, and `Idempotency-Key` derived from the AE outbox idempotency key.
- Trigger payload contains only AE dispatch/inquiry/business refs and owner inbox URL; it does not include raw customer inquiry text or owner contact.
- Successful trigger results return only Novu transaction/workflow/message/subscriber refs plus a provider response hash for outbox persistence.
- Authenticated readback calls `GET /v1/messages?transactionId=...` and returns redacted message metadata only: Novu message id, subscriber id, transaction id, channel, status, and timestamp.
- Readback drops provider message content, subject, and recipient contact from the returned shape.

Command evidence:

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:unit -- tests/unit/server/server-seams.test.ts` | PASS: 34 files, 144 tests |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run build` | PASS |

## 2026-06-29 Guarded Novu Dispatch Route and Provider Smoke Harness

Scope:

- Added `src/routes/api.notification.novu-dispatch.ts` for `/api/notification/novu-dispatch`.
- The route requires `Authorization: Bearer <AE_NOTIFICATION_OUTBOX_SECRET>` before it reads any dispatch, triggers Novu, records provider result, or performs authenticated readback.
- The route reads the system-keyed Convex dispatch snapshot, rejects unsupported non-owner/non-Novu dispatches, triggers the Novu workflow with the AE outbox idempotency key, records the provider result through `notificationOutbox:dispatchNotificationOutbox`, and reads back transaction-scoped Novu messages.
- Added `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts` and `npm run test:provider-smoke:novu` for the real deployed Novu trigger/readback smoke.
- Updated `src/routeTree.gen.ts` so the route is part of the built application.

Behavior covered:

- Missing or wrong bearer secret returns `notification_dispatch_unauthorized` before Convex/Novu calls.
- Invalid request bodies return `invalid_notification_dispatch_payload`.
- Unsupported Resend/customer dispatches are rejected before trigger/readback.
- Triggered dispatches persist only redacted Novu refs and provider response hashes; route responses expose dispatch/business/status/readback refs only.
- Already-recorded Novu transactions return `notification_novu_already_recorded` without retriggering while still performing authenticated transaction readback.
- The smoke fails before any network call when real deployed inputs are missing.
- `DEPLOY_BASE_URL` must be a deployed `https://` URL, not localhost or `.local`.
- Successful smoke responses must include `Cache-Control: no-store`, matching dispatch id, business slug, `triggered`/`sent`/`delivered` dispatch status, a Novu transaction id, a readback provider response hash, and a numeric Novu message count.
- Response-body assertions reject raw-looking email addresses and obvious raw/private customer text markers.

Command evidence:

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/server/server-seams.test.ts` | PASS: 34 files, 148 tests |
| `npm run typecheck` | PASS |
| `npm run test:provider-smoke:novu` | EXPECTED FAIL pre-flight: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`; no provider trigger/readback attempted |
| `npm run test:provider-smoke:resend` | EXPECTED FAIL pre-flight: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID`; no provider send attempted |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:seo` | PASS: 2 files, 8 tests |
| `npm run test:integration` | PASS: 8 files, 26 tests |
| `npm run build -- --logLevel error` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Rendered Inquiry UI Evidence and Owner Inbox Source Route

Scope:

- Changed `/owner/inquiries` from an empty in-memory loader to `readCurrentOwnerInboxServer`, the same authenticated Convex source seam used by owner thread detail.
- Preserved `readOwnerInquiriesRouteReadback` as a pure helper for source-state unit coverage while real route loading now fails closed on owner auth/source errors.
- Added an explicit local-only `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` inquiry fixture so rendered evidence can exercise a coherent `plumbing-demo` public service, public inquiry form, owner inbox, owner thread, delivery readback, reply, and close loop without claiming production auth proof.
- Fixed `/$slug` route composition so child routes such as `/$slug/inquiry` render through `Outlet` instead of being masked by the parent service page.
- Fixed the public inquiry textarea change handler so typing no longer crashes the form after validation.
- Added focus restoration for empty owner replies so validation returns keyboard focus to `#ownerReply`.

Rendered artifacts:

| Surface | Compact proof | Wide proof |
|---|---|---|
| Service inquiry affordance | `output/playwright/phase2-ui/service-affordance-compact.png` | `output/playwright/phase2-ui/service-affordance-wide.png` |
| Public inquiry form | `output/playwright/phase2-ui/public-inquiry-compact.png` | `output/playwright/phase2-ui/public-inquiry-wide.png` |
| Owner inbox | `output/playwright/phase2-ui/owner-inbox-compact.png` | `output/playwright/phase2-ui/owner-inbox-wide.png` |
| Owner thread and delivery readback | `output/playwright/phase2-ui/owner-thread-compact.png` | `output/playwright/phase2-ui/owner-thread-wide.png` |
| Public validation focus | `output/playwright/phase2-ui/public-validation-focus.png` | n/a |
| Owner reply validation focus | `output/playwright/phase2-ui/owner-reply-focus.png` | n/a |

Behavior covered:

- `/plumbing-demo` renders a source-owned human inquiry affordance and explicitly says it is not a booking, payment, or automated action.
- `/plumbing-demo/inquiry` renders the actual public inquiry form at compact and wide sizes.
- Empty public submit focuses the first invalid field (`body`) and shows body/contact validation.
- Successful public submit shows a receipt that separates saved-message truth from held delivery state.
- `/owner/inquiries` renders a populated owner inbox from the local source fixture through the server route seam.
- `/owner/inquiries/inquiry_thread%3Ahash%3Af3e29153` renders customer/owner messages, reply/close controls, failed owner delivery readback, queued customer delivery readback, and privacy readback.
- Empty owner reply focuses `ownerReply`.
- Owner reply and close controls return source-state receipts.
- Browser proof found no `book now`, `pay now`, `guaranteed response`, `AI reply`, or `agent handled` copy.

Command evidence:

| Command | Result |
|---|---|
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run dev -- --port 5178` | PASS: local server started at `http://127.0.0.1:5178/` |
| `npx playwright screenshot ...` | PASS: captured compact/wide service affordance, public inquiry form, owner inbox, and owner thread/readback screenshots under `output/playwright/phase2-ui/` |
| `node output/playwright/phase2-ui/phase2-ui-proof.mjs` | PASS: public focus `body`, public saved/delivery receipt true, owner focus `ownerReply`, owner reply/close receipts true, banned future-surface copy match `null` |
| `sips -g pixelWidth -g pixelHeight output/playwright/phase2-ui/*.png` | PASS: ten non-empty PNG artifacts with expected compact/wide dimensions |
| `npm run typecheck` | PASS |
| `npm run test:unit -- tests/unit/server/server-seams.test.ts tests/unit/inquiries/inquiry-flow.test.ts` | PASS: 34 files, 149 tests |
| `npm run test:imports` | PASS: 3 files, 3 tests |
| `npm run test:source-mining` | PASS: 1 file, 2 tests |
| `npm run test:ts-standards` | PASS: 1 file, 1 test |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:ui-contract` | PASS: 2 files, 2 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run test:seo` | PASS: 2 files, 8 tests |
| `npm run test:integration` | PASS: 8 files, 26 tests |
| `npm run build -- --logLevel error` | PASS |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |

## 2026-06-29 Capability Launch Support Record Gate

Scope:

- Added a source-owned `capabilityLaunchSupportRecord` shape for Phase 2 human inquiry support readiness.
- Wired `submitInquiry` to fail closed when the support record is missing, incomplete, over capacity, over failed-delivery threshold, over backlog-age threshold, or carrying unresolved retry-exhausted/no-repair incidents.
- Wired state-backed public inquiry route readbacks to suppress `inquiry_available` when the same support-readiness check fails.
- Preserved idempotent submit replay before readiness/capacity gates so already-saved receipts can be read back after support posture changes.
- Extended the shared Convex `capabilityLaunchSupportRecords` table with optional Phase 2 fields and mapped only `capability: human_inquiry_owner_inbox` rows into the inquiry source state.
- Added support-record fixtures to the local rendered-evidence source state and Convex inquiry runtime tests.
- Added `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` and `npm run test:phase2-support-smoke` so deployed support-row readiness is proven through the real public inquiry form rather than a write-only seed path.

Behavior covered:

- Missing support record suppresses public inquiry availability and blocks new inquiry submit with `inquiry_target_not_ready`.
- A complete support record names primary/backup owner and admin/operator refs, supported stage/channels, capacity threshold, backlog-age threshold, incident counts, escalation path, claim-disable path, kill rules, evidence refs, source hash, correlation ID, and last-reviewed timestamp.
- Open-thread capacity threshold blocks new public inquiry submissions before creating another thread.
- Failed-delivery threshold suppresses public claims separately from saved-message truth.
- Retry-exhausted/no-repair incident counts suppress public inquiry claims until reviewed.
- Convex runtime submit/list/detail paths now require a Phase 2 support record row in source state.

Command evidence:

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/server/server-seams.test.ts` | PASS: 34 files, 150 tests |
| `npm run test:copy` | PASS: 3 files, 28 tests |
| `npm run test:types` | PASS: 1 file, 4 tests |
| `npm run check:convex-codegen` | PASS: dry-run generated bindings, uploaded functions to configured Convex deployment for validation, and ran TypeScript; Convex CLI emitted the known localStorage warning only |
| `npm run test:phase2-support-smoke` | EXPECTED FAIL pre-flight: missing `DEPLOY_BASE_URL` and `SMOKE_PHASE2_BUSINESS_SLUG`; no deployed browser navigation attempted |

Remaining Phase 2 gaps before closeout:

- Durable Convex-backed owner delivery readback, privacy export/delete/tombstones, public inquiry route, owner thread route, notification outbox domain/schema, notification outbox Convex runtime adapters, Resend signed webhook route, Clerk owner resolver, Resend provider-result handoff, guarded Resend dispatch route, guarded Novu dispatch route, Resend/Novu smoke harnesses, and the Phase 2 support-record gate have local/build/codegen evidence where applicable.
- Actual Resend provider smoke still needs `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID`, plus deployed server `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, and matching `AE_NOTIFICATION_OUTBOX_SECRET`; then run `npm run test:provider-smoke:resend`.
- Actual Novu provider smoke still needs `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`, plus deployed server `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, and matching `AE_NOTIFICATION_OUTBOX_SECRET`; then run `npm run test:provider-smoke:novu`.
- Deployed support-record smoke still needs `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, and a complete deployed `human_inquiry_owner_inbox` support row; then run `npm run test:phase2-support-smoke`.
- Deployed provider smoke remains open until provider smoke env values and target dispatch ids are available.

## 2026-06-29 Plan 04 Deploy Smoke Blocker Routing

Scope:

- Re-read the Phase 02 Plan 04 closeout instructions, existing Plan 02 and Plan 03 summaries, canonical verification report, execution evidence, deploy-smoke specs, deploy-smoke Playwright config, and `package.json`.
- Confirmed Plan 02 source gaps are documented as locally closed in `02-02-SUMMARY.md`, with inquiry-created notification dispatch bindings, CSRF/Origin mutation admission, owner mark-read routing, and local source/unit verification.
- Confirmed Plan 03 UI/route gaps are documented as locally closed in `02-03-SUMMARY.md`, with `/admin/inquiries` operator reconstruction, future-route isolation, E2E/a11y coverage, and rendered operator evidence.
- Confirmed final Phase 2 closeout remains blocked on deployed support/provider smoke inputs and non-secret provider evidence.
- Created `02-DEPLOY-SMOKE-BLOCKERS.md` as the authoritative blocker artifact for the missing deploy/provider setup.
- Did not create final `02-SUMMARY.md` or `02-UAT.md`.

Command evidence:

| Command | Result |
|---|---|
| `for key in DEPLOY_BASE_URL SMOKE_PHASE2_BUSINESS_SLUG AE_NOTIFICATION_OUTBOX_SECRET SMOKE_NOTIFICATION_DISPATCH_ID SMOKE_NOVU_NOTIFICATION_DISPATCH_ID; do ...; done` | PASS: checked key presence only. All five names were missing in both shell and `.env.local`; no values were printed or recorded. |
| `npm run test:phase2-support-smoke` | EXPECTED FAIL preflight: missing `DEPLOY_BASE_URL` and `SMOKE_PHASE2_BUSINESS_SLUG`; no deployed browser navigation attempted. |
| `npm run test:provider-smoke:resend` | EXPECTED FAIL preflight: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID`; no provider send attempted. |
| `npm run test:provider-smoke:novu` | EXPECTED FAIL preflight: missing `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`; no provider trigger/readback attempted. |
| `git status --short` | PASS: inspected worktree state only. No staging, commits, pushes, branch switches, or remote/cloud/provider mutations were performed. |

Remaining blocker:

- Command-side env vars are absent: `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOTIFICATION_DISPATCH_ID`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`.
- Deployed server env/setup still needs operator verification: `CONVEX_URL` or `VITE_CONVEX_URL`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER`.
- Deployed Convex source state still needs a complete `capabilityLaunchSupportRecords` row for capability `human_inquiry_owner_inbox` attached to the published eligible service used for smoke.
- Resend and Novu smoke dispatch IDs must be source-owned owner dispatches created by the inquiry flow and proven through `/admin/inquiries` or equivalent operator reconstruction.

Final closeout state:

- Source/UI gaps: closed locally according to `02-02-SUMMARY.md` and `02-03-SUMMARY.md`.
- Deploy/provider smoke: blocked on missing setup.
- Final `02-SUMMARY.md`: intentionally absent.
- Final `02-UAT.md`: intentionally absent.
- Secret handling: env var names and presence/absence only; no secret values recorded.

## 2026-06-29 Plan 04 Typed Executor Rerun

Scope:

- Re-read the Plan 04 closeout plan, GSD execution context, project state, current verification report, existing blocker/evidence artifacts, smoke specs, and package scripts.
- Confirmed source/UI gap artifacts still document local closure in `02-02-SUMMARY.md`, `02-03-SUMMARY.md`, and `02-VERIFICATION.md`.
- Checked command-side smoke env-name presence only in the shell and `.env.local`; no values were printed or recorded.
- Confirmed final `02-SUMMARY.md`, `02-UAT.md`, and `02-DEPLOY-SMOKE-EVIDENCE.md` are absent and must remain absent while smoke inputs are missing.
- Did not stage, commit, push, tag, switch branches, install packages, or mutate remote/cloud/provider/deployed state.

Command evidence:

| Command | Result |
|---|---|
| `node .codex/gsd-core/bin/gsd-tools.cjs query init.execute-phase 02-human-inquiry-owner-inbox` | PASS: Phase 2 plan context loaded; 02-04 summary exists, 02-01 remains incomplete in init metadata. |
| `node .codex/gsd-core/bin/gsd-tools.cjs query state.load` | PASS: State confirms Phase 2 closeout remains blocked on deployed support/provider smokes. |
| Shell env-name presence check for `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`, `AE_NOTIFICATION_OUTBOX_SECRET`, `SMOKE_NOTIFICATION_DISPATCH_ID`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` | BLOCKED: all five names missing; no values printed or recorded. |
| `.env.local` env-name presence check for the same five names | BLOCKED: `.env.local` exists, but all five required names are missing; no values printed or recorded. |
| `test -e` checks for final closeout artifacts | PASS: `02-SUMMARY.md`, `02-UAT.md`, and `02-DEPLOY-SMOKE-EVIDENCE.md` are absent. |
| `git status --short` | PASS: inspected worktree state only; unrelated dirty worktree changes preserved. |

Commands not run in this rerun:

| Command | Reason |
|---|---|
| `npm run test:phase2-support-smoke` | Not run after preflight because `DEPLOY_BASE_URL` and `SMOKE_PHASE2_BUSINESS_SLUG` are missing. |
| `npm run test:provider-smoke:resend` | Not run after preflight because `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID` are missing. |
| `npm run test:provider-smoke:novu` | Not run after preflight because `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` are missing. |

Current verdict:

- Phase 2 closeout remains blocked.
- `02-DEPLOY-SMOKE-BLOCKERS.md` remains the authoritative artifact.
- Final `02-SUMMARY.md`, `02-UAT.md`, and `02-DEPLOY-SMOKE-EVIDENCE.md` remain intentionally absent.
- No secret values were printed, stored, or recorded.
