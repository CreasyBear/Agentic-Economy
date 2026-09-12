# Hosted cutover, 2026-09-12

Historical hosted cutover notes and current alpha evidence. Earlier sections
are preserved as history; the [current alpha receipt](#current-hosted-alpha-evidence--12-september-2026)
supersedes their topology, identity, configuration and usability claims. The
current environment is sandbox-only `hosted_alpha` and is not alpha-ready or
production-ready. No secret values appear in this file.

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

The app is usable and the catalogue is live; readiness alone remains
gated by the four external items below.

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
## Go-live sequence

Preconditions: Convex deployment re-enabled by the owner (plan limits);
working tree committed. The external observability sweep is included only
once its Convex bundle import direction is fixed: shared modules import
`degrade-backend`, never `degrade`.

1. `npx tsc --noEmit -p convex/tsconfig.json` and `npm run typecheck`
   clean.
2. `npx convex deploy --typecheck disable` from the deploy worktree at the
   release commit.
3. Migrations in order, each followed by a status check until done:
   `backfillDirectoryEligibility` →
   `backfillEligibleFacetMembership` (refuses to run until the first is
   done; `convex/migrations.ts` checks the prerequisite's status itself
   before writing) → `backfillDirectorySourceRouteRefAndSlug` →
   `backfillDirectoryListingDigestAndLastSeenRunAt` (Well 8 Lane B;
   backfills the active generation only). Run each with `npx convex run
   --prod migrations:<name> '{}'`. Check status (installed migrations
   component, default name `migrations`) with
   `npx convex run --prod --component migrations lib:getStatus '{"migrations":["migrations:backfillDirectoryEligibility","migrations:backfillEligibleFacetMembership","migrations:backfillDirectorySourceRouteRefAndSlug","migrations:backfillDirectoryListingDigestAndLastSeenRunAt"]}'`
   (add `--watch` to live-update). The directory refresh now updates the
   one live generation in place (no generation swap), so
   `x402DirectoryIndex:status` stays `ready` throughout a refresh, including
   the one triggered in step 4 below. Record the first production
   refresh's Convex call count here after the run: TBC.
4. `npx convex run --prod x402DirectoryIndexRefresh:start '{}'` (returns
   `unchanged`/`refreshing`/`started`; the weekly cron now guards by
   upstream total), then
   `npx convex run --prod capabilitySupplyProjection:rebuildAllBusinessSupplyProjections '{}'`
   once — it self-schedules to completion.
5. Set `AE_RELEASE_SOURCE_REVISION` to the release sha on Vercel
   production and Convex prod; `vercel deploy --prod` from the worktree.
6. Probes: `/api/health`, `/api/ready` (still 503 until the four external
   items above: Stripe restricted key, Clerk webhook secret, Infisical,
   Formance), `/api/v1/release`, `/market`, `/tools/<host>/<slug>` from a
   card, MCP `tools/list`, `ae search "wallet balance" --base-url
   https://app.aecon.ai`, `ae describe <ref> --base-url ...` showing the
   `Page:` line.
7. Idle-cost check after 24 h: Convex dashboard function calls should be
   in the hundreds per day, not hundreds of thousands.

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
- A shared module reachable from `convex/` imported the browser-only
  `degrade` (`src/lib/observability/degrade.ts`, built on TanStack
  Start's `createIsomorphicFn`) instead of the zero-dependency
  `degradeBackend` (`src/lib/observability/degrade-backend.ts`), which
  broke the Convex bundle. Shared/server modules must import
  `degrade-backend`, never `degrade`.
- A `package.json` revert during the sweep silently dropped dependency
  changes; dependency hygiene had to be redone by hand before deploying.
- The installed migrations component's `lib:getStatus` (see the go-live
  sequence above) is the only way to see backfill progress; running a
  migration itself does not report completion.

## Later on 2026-09-12: catalogue live

### Symptom

Production `/market` showed "The market snapshot is being prepared" and
`POST /api/v1/market-tools/list` returned 503 `tool_read_unavailable`.

### Root cause 1: stale Vercel production environment

Vercel production still carried the previous Convex deployment URLs and
server-function token. Fixed by setting `CONVEX_URL`, `VITE_CONVEX_URL`,
`CONVEX_SITE_URL`, `VITE_CONVEX_SITE_URL` to `effervescent-bee-577`;
`AE_CONVEX_SERVER_FUNCTION_TOKEN` and `AE_SOURCE_WRITE_SECRET` aligned with
Convex prod; the Clerk trio (test instance) and `OPENROUTER_API_KEY`
aligned with the local env; `AE_CANONICAL_BASE_URL`/`AE_SITE_URL`/
`SITE_URL`/`VITE_SITE_URL` = `https://app.aecon.ai`; and
`AE_CANONICAL_HOST_ALLOWLIST` =
`app.aecon.ai,agentic-economy-phi.vercel.app`. Result: list endpoint 200
with count 0, freshness source `supply_projection` state absent.

### Root cause 2: supply projection crons had not run yet

The registry reads the supply projection that the workload crons build;
the crons had only just been scheduled. Ran by hand on Convex prod:
`workloadCron:refreshFacilitatorDiscovery`,
`refreshAgenticEconomyApiRegistry`, `refreshCurrentMarketPresence`,
`refreshCapabilitySupplyReadiness`,
`reconcileBusinessSupplyProjections`. Result: count 20 Tools.

### Deploy

Deployed the finished branch commit `f9f657779` (`well-7/app-shell`) to
production, replacing `5b8a423cf`; `AE_RELEASE_SOURCE_REVISION` updated on
both sides. Human routes 200; the analytics snapshot screen no longer
exists in this build.

### Smells

- `vercel link` rewrites `.gitignore` in the checkout it links, which
  blocks `git switch` in a worktree.
- `npx convex logs --prod` streams indefinitely.
- The `/api/v1/release` `sourceRevision` reads
  `AE_RELEASE_SOURCE_REVISION` rather than the build, so it must be
  updated on every deploy.


## Current hosted alpha evidence — 12 September 2026

The orchestrator verified the following provider state and local checks. This
receipt supersedes the earlier same-day claims that the app is usable, that
Clerk/Infisical resources still need creating, that the previous Convex target
is current, and that the synthetic Formance stack can supply the new boundary.
Earlier commands and receipts remain historical, not an active runbook.

- **Authority:** `hosted_alpha`, sandbox only. Custody, writes and recurring
  workloads are disabled; provider production labels do not change that scope.
- **Vercel:** project `agentic-economy`,
  `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`, scope `creasybears-projects`;
  `https://app.aecon.ai` points to `dpl_4v9d2G9cmbnHFbsDmubdkkbrfV5t`,
  source `a269f9b4ad863798d2ff79b91eed0014a3886f01`.
- **Convex:** team `joel-chan`, new project `agentic-economy`, development
  `cool-crab-306`, provider production `cautious-zebra-473`; source
  `fbd22a563f204312f26aa9b8a53c55ca5969e02f` deployed. Ten old projects were
  deleted with the user's approval. Previous targets are historical only.
- **Observed HTTP:** `/api/health` 200; `/api/ready` 503 with
  `deployment_manifest_invalid`; consecutive sign-in requests consistently
  return 500 and fail closed. The forbidden legacy `AE_SOURCE_WRITE_SECRET`
  was removed from Vercel production configuration through the official CLI.
  That removal requires a new deployment before it affects live requests; no
  secret read or external revocation occurred.
- **Clerk:** production instance `ins_3JEJtsKq3rdCZG94s6tAkkut9Y7`, issuer
  `clerk.aecon.ai`; endpoint `ep_3JET0Um63P5BmiF8x6Guz5ToyUZ` created at
  `https://app.aecon.ai/api/clerk/webhook` for `session.created`,
  `session.ended`, `session.revoked`, `user.updated`. The user saved the signing
  secret in Vercel and it is deployed. Signed delivery remains unverified.
- **Stripe:** sandbox account `acct_1Tlni770N4UjLqHt`; existing snapshot
  `we_1UEgKx70N4UjLqHtxiYhgLAD` and thin destination
  `ed_test_61VO4O26zMNAz9Nn616UvBfU9V8SqsP28ZeVu4UQaSGu` are enabled at
  `https://app.aecon.ai/api/stripe/webhook` and
  `https://app.aecon.ai/api/stripe/webhook/accounts-v2`, respectively. Exact
  paths were verified. `STRIPE_READBACK_KEY` remains missing; destination
  existence is not delivery, replay or purchase proof.
- **Infisical:** organization `8d09981b-9b5e-4a59-aa6d-5561c4f4642a` already
  contains platform project `7a7f4820-5412-4a0f-92b6-c4106051333f` and customer
  project `cae7a337-b1f1-4634-8302-cf36b60edf74`. Existing platform staging
  identity `3e45be0b-6907-4fe3-90bf-a4c2701e7e1b` trusts Vercel preview;
  new project-managed identity `ae-alpha-platform`
  (`18030256-9085-4e51-8758-5a0e60599def`) exists with No Access. Its exact
  Vercel production OIDC subject and 3,600-second TTL are prepared but not
  saved, pending mandatory browser confirmation. Alpha authentication and
  secret access are inactive; bindings remain incomplete.
- **Ledger and AWS:** all six required Formance variables remain missing and
  fresh isolated financial infrastructure is not deployed. Existing synthetic
  EC2/RDS remain stopped and must never be promoted in place. Fresh AWS
  forecast readback returned `DataUnavailable` with insufficient history.
  Historical restore RPO remains 308 seconds against a 300-second target.
- **Local verification:** Node 22.22.0/npm 11.5.1; build fixed with Rolldown
  1.2.7. Four focused test files passed 161/161 tests; diagnostics passed
  30/30. Lint, typecheck, dependency check, server build and
  `env:example:check` passed. Four temporary credential files were deleted
  after consumers were bound. The full
  gate, successful authenticated sign-in and live purchases are not proven.

Alpha remains blocked on current manifest/binding requirements, the fresh
isolated ledger boundary and end-to-end verification. Health 200 and passing
source checks do not establish alpha readiness.
