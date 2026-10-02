# Identity slim-down: production release runbook

Human-run. No agent deploys. Every production command needs fresh consent per `skill://convex-deploy-guard`, an announced target, and an explicit `CONVEX_DEPLOY_KEY` (never ambient `CONVEX_DEPLOYMENT`; see `vocabulary-cutover-preflight.md`).

## What ships

**Release A** (branch `well-31/identity-slim`): everything an already-deployed browser bundle calls still exists; every Convex change is additive.

- Denying an approval releases the Formance hold. Undecided approvals expire after 60 minutes: the `expire stale pending approvals` workload (every 5 minutes) only selects stale approvals and schedules one isolated `expireStaleApproval` job per row, so one bad row cannot block the rest; a backlog drains in the same tick through `continueApprovalExpiry`. Approvals the sweep may not refuse (workId/authority present, or uncertain money) are never mutated and raise an `[ae.degraded] approval_expiry_blocked` operator signal while they exist.
- Owners get an email when an Agent needs approval. The intent is written in the same transaction that persists the pending Call and runs on a dedicated `notificationWorkpool` (bounded retries with backoff, no cron). At most 3 emails per hour per Account (`agent-approval-email` rate limit; further ones are recorded `suppressed: notification_rate_limited`). At send time the recipient (current owner), the opt-out and the approval age are rechecked.
- One tenant rule: Clerk active organization (bound Account) else the active Account the principal created else the oldest; suspended or pending Accounts never beat an active one; a principal with two Accounts is never locked out.
- Organization creation provisions the Business from Clerk's signed `organization.created` webhook with the Clerk creator as owner (`provisionOrganizationWorkspaceForServer` is a public, service-auth mutation returning typed refusals). A replayed `organization.created` for a closed Business is acknowledged and ignored (the revoked binding is a tombstone). `organizationMembership.created` for an unbound organization younger than 6 hours returns 503 so Svix retries until provisioning lands; older unbound organizations (legacy) are acknowledged and ignored.
- Clerk webhooks verify once in the route (256 KiB cap first); handler exceptions surface as 503 instead of being swallowed.
- Read-only Agents get `budget_exceeded` with a reason on paid quotes; manual key issuance needs strict re-verification (typed `reverification_required` refusal, Clerk modal, one shared `useTypedReverification` hook).
- Removed: the dead `/onboarding` route and UI, the unused `AccountRegistry`/`ExternalIdentityRegistry` classes, the drain/freeze choice, the hand-rolled notification queue.

**Release B** (branch `well-31/identity-slim-release-b`, stacked on A): retires the Convex functions and tables only the deleted UI used (`interactiveOnboarding`, `interactiveSession`, tables `interactiveOnboardingCompletions`, `interactiveSessionSelections`). Ship it only after Release A has been live for one further deploy. Removing a table from `schema.ts` leaves its documents orphaned and unvalidated; use the dashboard "Delete table" afterwards if wanted.

## 1. Prerequisites

1. Clerk production dashboard: Organizations enabled with **membership optional** (with membership required Clerk forces every sign-up to create an organization, so every user gets a Business Account and the personal Account is used only when no organization is active); the production webhook endpoint subscribed to `organization.created` in addition to the membership, invitation, session and user events; the `convex` JWT template includes `org_id`; admin organization deletion disabled (`admin_delete_enabled`), because a funded Business must be closed through aecon's close-workspace flow.
2. Resend: verified sending domain (SPF and DKIM published) and an API key.
3. Production Convex env: `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` (an address on the verified domain) and `CLERK_SECRET_KEY`. `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` are Convex-only. `CLERK_SECRET_KEY` is already required in the Vercel production Clerk group and must stay there; it must ALSO be set on the Convex deployment. `AE_SITE_URL` already exists.

## 2. Read-only production checks (Convex dashboard, Data tab)

- Counts of `interactiveSessionSelections` and `interactiveOnboardingCompletions`. Expected 0; non-zero means review, not stop.
- `capabilityCalls` rows with `state: 'pending'` and `result.kind: 'needs_authority'`. The first sweep after deploy refuses those older than 60 minutes and releases their holds: review each before deploy.

## 3. Rehearse

Per `skill://convex-migrate-rehearse`: export a production snapshot, create a preview from the previous release, import, push this branch, and confirm the push succeeds against real documents (new indexes build: `capabilityCalls.by_state_and_result_kind_and_createdAt`, `accounts.by_lastAction_actorPrincipalRef_and_lifecycle`; a new `notificationWorkpool` component installs). Run `npm run gate` on the release commit. Run the workload once with `npx convex run workloadCron:expireStalePendingApprovals`. Send one real approval email through the preview using Resend's `onboarding@resend.dev` sender to the Resend account owner's address.

## 4. Deploy Release A

1. `npx convex deploy` with an explicit `CONVEX_DEPLOY_KEY` first, then the Vercel app. Convex first is safe: old bundles only call functions that remain.
2. Immediately run `npx convex run workloadCron:ensurePlatformWorkloadIdentities` against production. The new workload is admitted through a platform workload principal; until that mutation has created it the cron fails with `workload_principal_missing` (it otherwise happens at the next hourly registry refresh).

## 5. Post-deploy smoke (read-only)

- `curl -s https://<host>/api/v1/release` returns the new `sourceRevision`.
- Sign in, open `/agent-access`, `/owner/settings/agent-keys` (Issue Agent key must open Clerk's verification modal when the last factor is older than 10 minutes) and `/owner/settings/notifications` (one email toggle).
- `npx convex logs --prod` shows no `[ae.degraded]` from `expireStalePendingApprovals` after 10 minutes. `[ae.degraded] notification_sender_credentials_missing` on an email attempt means a Convex env name from step 1.3 is missing (the delivery is recorded `suppressed: sender_not_configured`). `approval_expiry_blocked` means approvals exist that the sweep may not refuse: investigate them.
- Create a test Clerk organization; the Team page shows the invite form within 60 seconds (webhook delivery). Close it through aecon's close-workspace flow.

## 6. Rollback

Promote the previous Vercel deployment. Release A's Convex changes are additive and the previous app works against them. Refusals already made by the sweep stay refused (intended). Nothing to undo in data.
