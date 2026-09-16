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

## Waitlist alpha integration — Codex handoff

Recorded 2026-09-12. Session target: an invite-only, waitlist-ready alpha.
Initially allow sandbox Tools only, with Stripe sandbox and production Clerk
at `app.aecon.ai`. Joel explicitly approved production Clerk creation and primary
domain scope `clerk.aecon.ai`, `email@aecon.ai`; creation and DNS setup completed.

Observed during this session:
- Vercel project `agentic-economy` (`prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`),
  deployment `dpl_FkqWifyGH7GnnmCahnroQ4mj83so`: Ready; alias `app.aecon.ai`.
- `/api/health`: 200. `/api/ready`: 503, `deployment_manifest_invalid` and
  `convex_probe_skipped`. `commercial.sellable: true` is not readiness proof.
- `/api/v1/release` reports `06a89ebe3cf4747589a7d98c869cad35e1fa3fe6`;
  this is configured metadata, not proof of the actual build. Checkout: `d427cd75c`.
- Convex team Starter and deployment `effervescent-bee-577` were present.
- Created production Clerk instance `ins_3JEJtsKq3rdCZG94s6tAkkut9Y7` in existing
  Agentic Economy application `app_3FlYUN4Gx0gEhuuDMp4gxDSfnNA`.
- Approved five DNS-only records through native Clerk/Cloudflare Domain Connect;
  configured callback observed; public DNS CNAME readback matched all five.
  Clerk reports Frontend API Verified, Account portal Verified, Email 3/3 Verified;
  SSL is Issuing. Runtime credentials/webhook remain unbound; copied settings
  require Google/GitHub production credentials. No paid upgrade or deployment.
- Vercel variable-name inventory lacked `CLERK_WEBHOOK_SECRET`, Infisical scope
  names, and `AE_FORMANCE_*`; this establishes names only, not credential validity.
  No hosted runtime credentials were changed in this session.

Continue using the existing integrations and source patterns:
1. Separate hosted-alpha payment mode from Clerk identity; the manifest's current
   sandbox exception applies only to the synthetic deployment profile.
2. Enforce sandbox principals at authority admission and before worker custody,
   using the existing environment checks.
   The existing Formance release ledger is `fixture_only`, not an alpha user store;
   validate an isolated alpha ledger target before binding.
3. Wire the provider integrations, then verify successful and recovery journeys
   through the browser, CLI and MCP; complete the required final CI checks.

## Convex cloud reset — 2026-09-12

Joel approved deletion of all ten temporary Convex projects in team `joel-chan`.
The dashboard showed an empty team before creation of one fresh `agentic-economy` project.
All earlier Convex identifiers, deployment targets and backfill commands in this
record are historical and invalid after this reset; the history is retained.

- Development: `cool-crab-306`; `https://cool-crab-306.convex.cloud`, `https://cool-crab-306.convex.site`.
- Production (intended alpha): `cautious-zebra-473`; `https://cautious-zebra-473.convex.cloud`, `https://cautious-zebra-473.convex.site`.
- Both deployments: US East (N. Virginia), S16, dashboard status **Never deployed**.
- Neither deployment has code/schema, environment variables or secrets configured.
  Deploy current code/schema to the fresh empty backend; do not run the four historical backfills.
- Vercel has not been rebound and still targets deleted `effervescent-bee-577`.
- No local database folders were deleted. Primary Clerk instance
  `ins_3JEJtsKq3rdCZG94s6tAkkut9Y7` remains unchanged.
- The alpha remains sandbox-only; Convex's **Production** label does not change that decision.

## Fresh backend hookup — 2026-09-12

This evidence supersedes the reset section's **Never deployed**, unconfigured,
and Vercel-unbound observations. Implementation and local configuration are in
the isolated checkout `/private/tmp/ae-alpha-convex`, branch
`codex/alpha-convex-hookup`, source
`fbd22a563f204312f26aa9b8a53c55ca5969e02f`. The original checkout was not
changed by this hookup except for this documentation update; unrelated work
was preserved.

- Both fresh backends were deployed using the official Convex CLI:
  development `cool-crab-306` and hosted alpha `cautious-zebra-473`.
- Development uses Clerk issuer
  `https://composed-stallion-40.clerk.accounts.dev`; alpha uses
  `https://clerk.aecon.ai`. Both Clerk JWT templates were confirmed with
  audience `convex`. Fresh, independent service secrets were configured.
- Alpha's explicit `hosted_alpha` mode rejects production purchases at Quote
  issuance, Call admission and worker preparation. Consumed-Call replay and
  recovery of possibly released effects remain available. Crons, custody and
  feature writes are disabled.
- Bounded live queries on both backends reported zero businesses and zero
  scheduled jobs. Unauthenticated owner reads returned `not_found` or
  `not_public`; this is access-refusal evidence, not authenticated journey proof.
- Lint and typechecks passed. Verification included 51 configuration tests,
  109 tests across three backend suites, and the expanded Quote suite with
  the environment-drift regression: 15/15 passed.
- Vercel project `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9` is bound to the fresh
  alpha backend and production Clerk. Its Node setting was corrected from
  24 to 22; installation selects npm 11.5.1 and runs `npm ci`.
- At this observation, Vercel deployment `G1UW25F9wvNmnY4469126ehhDecM`
  was **BUILDING**, with deployment URL
  `https://agentic-economy-4axej422a-creasybears-projects.vercel.app`.
  A successful web deployment or live alias cutover is not established here.

Stripe, the alpha ledger, Infisical integration and authenticated browser
journey proof remain incomplete. Backend deployment and passing tests do not
establish these remaining integrations or end-to-end readiness.
