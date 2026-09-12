# Hosted cutover, 2026-09-12

Status of the first production cutover to the hosted stack. Work below was
done by the orchestrator under the owner's authorisation on 2026-09-12.
No secret values appear in this file.

## Topology

| Surface | Vercel project | Convex |
| --- | --- | --- |
| https://app.aecon.ai (app) | `agentic-economy` (team creasybears-projects) | prod deployment `effervescent-bee-577` (project agentic-economy-ea30d) |
| https://aecon.ai (marketing) | `agentic-economy-website` | none |

Deploys are CLI based (`vercel deploy --prod` from a checkout). The
release-gate workflow only runs tests; it does not deploy.

## Deploy candidate

Commit `5b8a423cf` (head of `well-7/app-shell`). Gate green 2026-09-10,
Convex `tsc` clean. `main` (`0b6e2c799`) currently has a flaky integration
test timeout and two Convex type errors that this commit fixes.

## Done today

### Convex

- Backup taken before any change (empty deployment, 906 bytes; sha256
  recorded separately, not in this file).
- Deployed functions and schema with `--typecheck disable`, after
  `tsc -p convex/tsconfig.json` passed cleanly first.
- Ran the runbook's post-deploy steps:
  - `scheduledFunctionRetirement:cancelByName` (0 cancelled)
  - `x402DirectoryIndexRefresh:start` (new generation started)
  - `capabilitySupplyProjection:rebuildAllBusinessSupplyProjections` (0 rows)
- Set required environment variables on the prod deployment, including the
  shared secrets described below, the CDP/AE_X402 custody set (test
  custody, sourced from the local env), OpenRouter model config, the
  Stripe readback key (test mode), the Stripe AU inclusive GST tax rate
  ID, the four package5 rollout flags (all `true`), and the release
  source revision.

### Vercel

- Added the same shared secrets to production: six
  `AE_SOURCE_WRITE_KEY_*` values (keyId family `prod-<family>-2026-09`),
  the chat proxy secret, the chat share key ID/secret pair, and the route
  call signing key ID/secret pair. These were generated once and set
  identically on both platforms.
- Added the 13 custody values, the Stripe AU tax rate ID, and the four
  rollout flags.
- Added `STRIPE_SECRET_KEY` as an `sk_test` key. This is a placeholder;
  the deployment manifest rejects `sk_` keys (see Smells) and the owner
  must replace it with a restricted `rk_test` key.
- Added `STRIPE_WEBHOOK_SECRET` from a new test-mode v1 endpoint
  (`we_1UEgKx70N4UjLqHtxiYhgLAD`, six events) at
  `https://app.aecon.ai/api/stripe/webhook`.
- Removed ten legacy variable names that the closed manifest rejects
  (six `AE_AUTUMN_*`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`,
  `AE_NOTIFICATION_OUTBOX_SECRET`, `AE_PROVIDER_AUTUMN_MODE`,
  `AE_SANDBOX_PROVIDER_KEY`). Confirmed zero code references to any of
  these at `5b8a423cf` before removal.
- Redeployed production from the worktree.

### Current probe result

- `/status`, `/market`, `/llms.txt`: 200.
- `/api/ready`: 503. `config=deployment_manifest_invalid`,
  `convex=convex_probe_skipped`, `commercial funding=configured`,
  `catalogue=absent` (probe skipped because config is invalid).

Generated secrets exist only in a 0600 tmp file for this job and on the
two platforms. None are in the repository.

## Remaining for /api/ready 200 (owner actions)

1. **Stripe, test mode.** Create a restricted key with Checkout Session,
   Transfer, Accounts v2 and Account Link permissions. This replaces the
   placeholder `STRIPE_SECRET_KEY` (the manifest expects `rk_test_...`).
   Also create an Accounts v2 thin event destination for
   `https://app.aecon.ai/api/stripe/webhook/accounts-v2`, pinned to API
   version `2026-07-29.dahlia`, with the five declared `v2.core.account`
   events; copy its signing secret to `STRIPE_V2_WEBHOOK_SECRET`. Prefer
   the Stripe CLI for this; fall back to the dashboard if it fails.
2. **Clerk.** Add a webhook endpoint at
   `https://app.aecon.ai/api/clerk/webhook` for `session.created`,
   `session.ended`, `session.revoked`, `user.updated`. Copy the signing
   secret to `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel.
3. **Infisical Cloud** (`https://app.infisical.com`). Nothing exists yet.
   Create two projects, `platform` and `customer`, each with a
   `production` environment and a non-root folder (for example
   `/platform`, `/customer`; paths must start with `/`, no trailing
   slash, segments `[A-Za-z0-9._-]+`). Create two machine identities using
   OIDC auth trusting Vercel: discovery URL
   `https://oidc.vercel.com/creasybears-projects`, bound issuer the same
   URL, bound audience `https://vercel.com/creasybears-projects`, bound
   subject
   `owner:creasybears-projects:project:agentic-economy:environment:production`.
   Grant each identity access to its own project. Record
   `AE_INFISICAL_BASE_URL=https://app.infisical.com` and the eight
   `*_PROJECT_ID` / `*_ENVIRONMENT` / `*_SECRET_PATH` /
   `*_MACHINE_IDENTITY_ID` values.
4. **Formance.** Self-hosted via `infra/package4` in the AWS account
   (ap-southeast-2), behind Cloudflare Tunnel at
   `formance-release.aecon.ai` (release) and `formance.aecon.ai`
   (production). RDS is paused with auto-restart on 2026-09-13 09:44
   Perth. Steps: sign in to AWS, confirm RDS is running, read the
   Cloudflare Access service token from the Secrets Manager ARN in the
   tofu output, then set on both Vercel and Convex:
   `AE_FORMANCE_ENVIRONMENT=sandbox`, `AE_FORMANCE_GATEWAY_URL`,
   `AE_FORMANCE_LEDGER` (from `deployment-registry.yaml`),
   `AE_FORMANCE_REQUEST_TIMEOUT_MS=10000`, and the Formance access
   client ID/secret pair. Verify with an unauthenticated GET to the
   gateway, which should return 401.
5. **Apply and verify.** Place the values above in
   `/Users/joelchan/.claude/jobs/9c5caaff/tmp/human-secrets.env` (mode
   600, `NAME=value` lines), then run
   `bash /Users/joelchan/.claude/jobs/9c5caaff/tmp/cutover-3.sh`. This
   pushes the values to Vercel (and to Convex for the Formance names),
   redeploys, and probes `/api/ready`.

## Smells

- The manifest rejects `sk_` Stripe keys, but the credentials doc still
  shows an `sk_*` row in one place; that row needs updating to match the
  restricted-key rule.
- `AE_SECRET_LIFECYCLE_RPC_TOKEN` is read by the server but is not
  declared in the closed manifest, so today it is set on Convex only.
- `vercel env pull` masks sensitive values as `[SENSITIVE]`, so manifest
  format validation must run against real values, not a pulled copy.
- The Convex CLI's `function-spec --prod` times out against this module
  set (its internal query has a 1 second budget).
- The seeded sandbox Tool fixture requires an `https` source URL, so
  local seeding does not work against it.
- The marketing site at aecon.ai serves the same readiness route and
  reports 503 with no environment configured at all, which can be
  mistaken for an app outage by probes that do not distinguish surfaces.
