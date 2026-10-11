# Deployment handover, 12 October 2026

Takes production from `d3c9061f4` to `origin/main` (`616291e71` when written, about 406 commits, 1135 files). Re-resolve identities before any mutation, because `docs/operations/deployments.md` is dated 9 October. Production Convex is `upbeat-cricket-954` (Sydney). Never resume the paused Virginia deployment `cautious-zebra-473`.

## 0. What ships

**Email.** A full notification pipeline on Resend: transactional, alert and lifecycle streams, per-kind flags, suppression (bounces and complaints), a signed Resend webhook, signed unsubscribe links, an operator daily digest and stalled step emails. Phases 2 and 3 and stalled emails ship switched off.

**Terms and sign-up.** Terms version `2026-10-11` with an acceptance record (`termsAcceptances`). Existing owners have no acceptance row, so they read as not accepted until they accept.

**Payments and money.** Stripe dispute handling (`charge.dispute.*`), `checkout.session.expired`, refund events, automatic 3DS on card checkout, and x402 payment attempt binding. The paid calls switch stays the gate for real money.

**Agent access and OAuth.** Access token hash on grants for revocation, approval requirements, an `ae_invocation_refused` audit event and `set_payments_audience`. Approval emails carry UTM tags and land on `/agent-access`.

**Directory and search.** `external_listing` is removed from the access filter, directory rows carry an `admission` field, and registry search falls back to lexical ranking when the breaker is open. The 6-hourly facilitator discovery cron is removed; discovery is on demand.

**Observability.** `journeyEvents` table with hourly forward retry, an hourly stuck Stripe inbox alert, a six-row `/status` page, and Sentry noise cleanup.

**Routes.** `_operator/owner.*` moved to `/owner/settings/team` and `/owner/agent-keys`.

**Deploy mechanics.** `vercel.json` stops main auto-deploying and pins npm 11.19.1. GitHub workflows are manual or tag driven only.

**Marketing site.** `agentic-economy-website` PRs #46 and #48. Not in this repo and not verified here. Check them in that repo before releasing.

## 1. Pre-flight

1. Node 22 and npm 11.5.1 locally.
2. Clean tree on a fresh worktree of `origin/main`: `git status` shows nothing, then `git fetch origin && git pull --ff-only`.
3. Confirm the Convex CLI targets `upbeat-cricket-954` and Vercel targets the Sydney (`syd1`) project.
4. Record the current Vercel deployment id and Convex source revision for rollback (section 7).
5. Set the env vars below. `src/lib/deployment/manifest.ts` is unchanged since `d3c9061f4`, so Vercel needs no new required names.

### Must set before deploy

None are strictly required for the deploy to succeed, but without these three the email pipeline is partly dead. Set them in Convex production before deploy.

| Name | Where | New? | Secret? | How to generate | Rotation rule |
|---|---|---|---|---|---|
| `EMAIL_SUPPRESSION_HASH_SECRET` | Convex prod | Yes | Yes | `openssl rand -base64 32` | Never rotate. It keys the hash of suppressed addresses, so rotating un-suppresses everyone and bounced addresses get mailed again. Back it up in the password manager. |
| `EMAIL_UNSUBSCRIBE_SECRET` | Convex prod | Yes | Yes | `openssl rand -base64 32` | Rotation breaks outstanding unsubscribe links unless `UNSUBSCRIBE_KID` (`unsubscribe.ts:16`, now `v1`) is bumped in code first. |
| `RESEND_WEBHOOK_SECRET` | Convex prod | Yes | Yes | Copy the `whsec_...` signing secret from the Resend webhook | Rotate in Resend and update here at the same time. Unset, the webhook returns 400. |

Without `EMAIL_SUPPRESSION_HASH_SECRET` sends are skipped. Without `EMAIL_UNSUBSCRIBE_SECRET` the footer link is omitted and `/api/unsubscribe` shows an invalid page.

### Optional

| Name | Where | New? | Secret? | Default if unset |
|---|---|---|---|---|
| `OPERATOR_EMAIL` | Convex prod | Yes | No | Operator alerts and digest are skipped. Set it, you want the digest. |
| `AE_STALLED_EMAILS_ENABLED` | Convex prod | Yes | No | Off. Only `true` enables. |
| `AE_EMAIL_TRANSACTIONAL_ENABLED` | Convex prod | Yes | No | On. Only `false` disables. |
| `AE_EMAIL_ALERT_ENABLED` | Convex prod | Yes | No | On. Only `false` disables. |
| `AE_EMAIL_LIFECYCLE_ENABLED` | Convex prod | Yes | No | On. Only `false` disables. |
| `AE_EMAIL_PHASE2_ENABLED` | Convex prod | Yes | No | Off. Only `true` enables, whatever the stream switch says. |
| `AE_EMAIL_PHASE3_ENABLED` | Convex prod | Yes | No | Off. Only `true` enables, whatever the stream switch says. |
| `AE_EMAIL_KIND_<KIND>_ENABLED` | Convex prod | Yes | No | Must be exactly `true` (`enqueue.ts:35`). |
| `POSTHOG_KEY` | Convex prod | Yes | No (public key) | Convex side analytics off (not verified against capture code). |
| `POSTHOG_HOST` | Convex prod | Yes | No | Default host (not verified). |

Existing and unchanged, confirm still set: Vercel `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_V2_WEBHOOK_SECRET`, `CLERK_WEBHOOK_SIGNING_SECRET`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT` and `VITE_SENTRY_ENVIRONMENT` (both `production`), and `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (all three together). Convex `STRIPE_READBACK_KEY`, `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`, `STRIPE_CHECKOUT_HOST`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`. Stripe keys in production use the `rk_live_` prefix.

## 2. Schema and data

Order of concern:

1. **Nothing blocks the deploy.** No required field is added to an existing table. New tables are empty on deploy: `journeyEvents`, `termsAcceptances`, `emailSuppressions`, `emailWebhookEvents`. New indexes on `emailDeliveries` (`by_vendorMessageId`, `by_state_and_updatedAt`) and the grants table build on deploy.
2. **Backfill gap (action or accept).** `accessTokenHash` is a new optional field on grants with index `by_accessTokenHash` (`oauth-convex-schema.ts:123, 135`). Existing grant rows have no hash. `refreshRevocation.ts:50` falls back to this index for device and non-offline grants, so revoking by access token returns `unknown` for grants created before deploy. No backfill exists and `convex/migrations.ts` is unchanged. A backfill needs a computed hash, so it cannot be derived from stored fields. Either write one, or accept the gap and revoke those grants from the owner screen or let them expire. Decision recorded in section 8.
3. **Product effect, not an error.** Existing owners show `accepted: false` for terms (`convex/termsAcceptance.ts:14`) until they accept the new version.
4. **Removed or narrowed validators.** `external_listing` is gone from the access filter and `searchCompactArgs`. These are arguments, not stored data. Old clients sending it will be refused.
5. **Crons.** Added: operator stalled digest (daily 22:00 UTC), stalled step emails (daily 22:30 UTC), stuck Stripe inbox alert (hourly), journey event forward retry (hourly). Removed: facilitator discovery refresh. The market flow refresh now swallows action errors.
6. No backfill for `signed_up` journey events (by design, `convex/attribution.ts:42`).

## 3. Deploy sequence

Convex first, then Vercel. Pushing to main does not deploy.

1. **Codegen.** `npm run check:convex-codegen`. If it fails, `npm run generate:convex` and review the diff. Check: no diff left.
2. **Verify.** `npm run check`, then the affected tests. Check: green.
3. **Gate.** `npm run gate` on the frozen tree. It runs the deployment manifest check, `.env.example` check, anonymous Convex generated check, release integrity, then lint, typecheck, unit, integration, e2e, a11y, CLI package and docs build. Check: green.
4. **Convex deploy.** Deploy the exact source revision to `upbeat-cricket-954` with the Convex CLI. Check: deploy finishes without schema errors, the new crons appear in the dashboard, the removed facilitator cron is gone, and `AE_RELEASE_SOURCE_REVISION` reads back the exact revision.
5. **Vercel build.** Build the candidate from the same revision (not by pushing to main). Check: state READY, region `syd1`, Node 22.
6. **Vercel promote.** Promote the READY deployment. A successful build alone is not enough. Check: the app serves the new revision.
7. **Release identity.** `curl -s https://app.aecon.ai/api/v1/release` must report the exact source revision. Check health and readiness separately (section 5).
8. **Marketing site.** Release `agentic-economy-website` PRs #46 and #48 from that repo after the app is live, so links from the site land on working routes. Check: site loads and its CTAs reach the app.

## 4. External services checklist

**Stripe** (Dashboard, Developers, Webhooks)
- Endpoint URL ends `/api/stripe/webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `refund.created`, `refund.failed`, `refund.updated`.
- Accounts v2 destination ends `/api/stripe/webhook/accounts-v2`. Signing secrets match `STRIPE_WEBHOOK_SECRET` and `STRIPE_V2_WEBHOOK_SECRET`.
- Restricted keys (`rk_live_`) in `STRIPE_SECRET_KEY` and `STRIPE_READBACK_KEY`.
- Settings, Radar and automatic receipts: dashboard settings only, nothing in the repo. Check them by eye. Automatic tax is off in code.

**Resend** (Dashboard, Webhooks and Domains)
- Webhook endpoint is the Convex site URL plus `/resend/webhook` (64 KB cap). Events: `email.bounced`, `email.complained`, `email.sent`.
- Copy its signing secret to `RESEND_WEBHOOK_SECRET`.
- Sending domain verified for `NOTIFICATION_FROM_EMAIL`. Domain setup is not in the repo.

**Clerk** (Dashboard, Webhooks and JWT templates)
- Webhook points at `/api/clerk/webhook`, secret in `CLERK_WEBHOOK_SIGNING_SECRET`. No event filter is needed.
- JWT template `convex` includes the `fva` claim. Spending policy increases need step-up.
- Bot protection: nothing in the repo, check the dashboard.

**Sentry** (Project settings)
- Environment is `production` on both DSNs. Source map upload needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` together. Alert rules are not in the repo, check them.
- After deploy, triage issues (end of section 5).

**Vercel** (Project settings, Git and Environment Variables)
- Git: main auto-deploy is off (`vercel.json`). Install command pins npm 11.19.1. No Vercel cron; scheduled work is Convex.
- Confirm target bindings after the Sydney re-point of the Convex deployment and GitHub deploy key.

**GitHub** (Settings and Actions)
- `ci.yml` and `react-doctor.yml` are manual. `security.yml` is manual plus weekly (Monday 03:00 UTC). `cli-release.yml` and `kernel-release-gate.yml` run on `v*` tags. Release gate secrets (Clerk, Stripe, Sentry, gateway smoke) must be in Actions secrets.
- Dependabot version updates are off. Enable security updates in Settings, Code security.

## 5. Smoke tests

Set `SITE` to the production host. Read-only unless marked.

| # | Check | Expect | Failure means |
|---|---|---|---|
| 1 | `curl -s $SITE/api/ready` | 200, `status` `ready` or `disabled`, `commercial.sellable` false while payments are off | 503 `server_not_ready`: a required check failed. `disabled` is not an outage. |
| 2 | `curl -s $SITE/api/v1/availability` | 200 with `paidCalls` boolean and `statement` | 503 `availability_unavailable`: payments switch unreadable |
| 3 | `curl -s -o /dev/null -w '%{http_code}' $SITE/api/v1/funding/constraints` | 200 if payments open, 409 `payments_not_open` if closed | 503 `funding_constraints_unavailable` |
| 4 | `curl -s "$SITE/api/v1/registry?q=test"` | 200 with results, lexical fallback if breaker open | Any 5xx |
| 5 | `curl -s $SITE/status` | Six rows: site, market, discovery, release, catalogue, payments | A row stuck at `degraded`: check the `requestRef` |
| 6 | `curl -s $SITE/terms` | Version `2026-10-11`. Joel confirms sign-up shows the acceptance checkbox. | `terms_version_stale` on accept |
| 7 | `curl -s -o /dev/null -w '%{http_code}' $SITE/api/unsubscribe` | 404 for a missing token. A real token from a received email gives 200. | 500 |
| 8 | `curl -s -o /dev/null -w '%{http_code}' -X POST $SITE/api/resend/webhook` | 400 (no svix headers) | 503: `CONVEX_SITE_URL` or `CONVEX_URL` does not resolve to a `*.convex.site` origin |
| 9 | `curl -s $SITE/.well-known/oauth-authorization-server`, `.../oauth-protected-resource`, and `$SITE/mcp` | 200 JSON for the first two, 401 or a protocol response for `/mcp` | 404: OAuth or MCP surface broken |
| 10 | Joel, signed in: `$SITE/owner/settings/team` and `$SITE/owner/agent-keys` | Lists load | 404: missing redirect from the old `_operator/owner.*` routes |
| 11 | Joel: agent approval email "Review request" link | Has `utm_source`, `utm_medium`, `utm_campaign`, `utm_content=cta`, lands on `/agent-access` | 404 or missing `utm_campaign` |
| 12 | Joel, signed in: `$SITE/agent-access` | Pending requests show | 404, or empty while Convex shows pending approvals |
| 13 | `ae status` and `ae search <term>` against prod | Healthy status, results | `CliFailure` or 5xx |
| 14 | Convex dashboard logs after the first live charge | No errors in `stripeDisputePipeline` or `x402PaymentAttempt` | Errors. Not checkable by curl. |
| 15 | `npm run smoke:gateway:production` (needs `CONVEX_DEPLOYMENT_ID` and related env) | Passes | Any failure |

**Sentry triage after deploy** (source: `docs/operations/antifragile-2026-10-11.md:37-43`). Project prefix `AGENTIC-ECONOMY-`.
- Resolve, fixed on main: 1N, 1P, 29, 27, 2C, 20, 1Z.
- Resolve, now breadcrumbs or typed refusals: 25, 26, 1W, 1S, 22, 1X, 23, 24, 1R, 19, 1Y, 2D.
- Resolve and set the environment filter, non-prod noise: N, W, V, Z, 1H, 1B, 1A, 18, 16, X, Q, 1M, 1K, 1J, 1G, 1F, 1E, 1D, 17, 15, 14, 13, 12, 11, 10, Y, T, S, R, K.
- Keep open and verify each against this branch before closing: P, M, 1Q (SDK misconfig), 2B, 2F, 2H, 2E, 2A, 2G, 28, 21, 1V, 1T, 1C.

## 6. Turning things on later

Do these one at a time, in order, and run the check before the next step. Each is a Convex prod env var or the admin switch, so none needs a deploy.

1. **Email baseline.** Set `OPERATOR_EMAIL`. Check: the 22:00 UTC digest arrives next day. Send one transactional email to yourself and confirm the unsubscribe link works (smoke 7) and a Resend `email.sent` event lands.
2. **Bounce handling.** Send to a Resend test bounce address. Check: an `emailSuppressions` row appears and a second send is skipped.
3. **Stalled emails.** Set `AE_STALLED_EMAILS_ENABLED=true`. Check the 22:30 UTC run the next day: the count of emails queued matches expectations before it reaches real users.
4. **Lifecycle.** Lifecycle is on by default. To pause it set `AE_EMAIL_LIFECYCLE_ENABLED=false`. Phase 2 (`AE_EMAIL_PHASE2_ENABLED=true`), then phase 3 (`AE_EMAIL_PHASE3_ENABLED=true`), each after a day of clean phase 1 delivery. Individual kinds need `AE_EMAIL_KIND_<KIND>_ENABLED=true`.
5. **Paid calls switch.** Last. Only after Stripe webhooks, 3DS, disputes handling (smoke 14) and the terms acceptance are confirmed. Open payments from the admin switch, then recheck smoke 1 to 3: `commercial.sellable` true, `paidCalls` true, constraints return 200. Run one small real charge and watch the logs.

## 7. Rollback

- **Vercel.** Promote a prior deployment. Retained references: `dpl_DWQJGdALwj3BhFWiN21W6YUPoZkb` (source `7d4eba16926e870fbe5dda4ab0999b18d4b04b7c`) and the PR #372 baseline `dpl_5ojMkJbKXCqwtHc9xzZt2xXhstHR`. The deployment live before this release is the one to preserve (`dpl_2qcjc45...` at the time of writing). Check backend compatibility before promoting old code.
- **Convex.** Redeploy the prior backend source (retained: `ce7a0e57e1fbc13a0bf8f0ff8d1bb5ecc99bab7a` and `31a06382c`). The schema is additive and must stay so. Do not remove the new tables or fields on rollback.
- **Fast switches.** Email: set the stream flag to `false`. Payments: close the admin switch.
- **Never restore a database or ledger to roll back code.** Financial correction is append only and fix forward (`docs/operations/incident-runbook.md`).

## 8. Known risks and accepted decisions

- Revocation by access token is `unknown` for grants created before deploy until a backfill is written or those grants expire.
- Existing owners must accept terms `2026-10-11` before they read as accepted.
- `EMAIL_SUPPRESSION_HASH_SECRET` is never rotated. Losing it un-suppresses everyone.
- Rotating `EMAIL_UNSUBSCRIBE_SECRET` breaks outstanding links unless `UNSUBSCRIBE_KID` is bumped.
- Facilitator discovery is on demand only, so the directory can go stale between runs.
- `POSTHOG_KEY` and `POSTHOG_HOST` behaviour on the Convex side is not verified.
- Marketing site PRs #46 and #48 were not verified from this repo.
- Stripe Radar, automatic receipts, Clerk bot protection and Sentry alert rules are dashboard only and unchecked by code.
- Deployment inventory in `deployments.md` is dated 9 October and may be stale.
- Main does not auto-deploy. Every release is a manual promote.
