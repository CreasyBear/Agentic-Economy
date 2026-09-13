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

### Authentication defect readback — 13 September

Joel reported Google signup returning HTTP 400 `invalid_request`, missing
`client_id`. The app uses Clerk's maintained `SignIn` and `SignUp` components.
Exact production instance `ins_3JEJtsKq3rdCZG94s6tAkkut9Y7` showed both Google
and GitHub enabled with “Setup required” and empty client fields. Both were
reversibly disabled; Clerk readback shows Disabled. The live sign-in page loads
email/Continue without the broken social options. No source workaround was added.

Google Cloud project `agentic-economy-authentication` (Agentic Economy
Authentication) was created and selected. Consent branding is prepared for
Agentic Economy, external users, and the existing business notification address.
The required Google API Services User Data Policy checkbox remains unchecked
pending action-time user confirmation. No OAuth client or new Google secret
exists yet. The intended callback was read directly from Clerk:
`https://clerk.aecon.ai/v1/oauth_callback`; only OpenID, email and profile scopes
are planned. The Google and Clerk tabs are preserved for continuation.

### Testnet setup readback — 13 September

The existing Vercel project `prj_gyaX8fy0abiwTFfvfqnqrn71Al8p` is now
`agentic-economy-sandbox-tools`. Deployment `dpl_723RkHxkAupfvuDkktksEtdnw49b`
serves `https://agentic-economy-sandbox-tools.vercel.app`, attached as both a
project domain and deployment alias. Health, discovery and OpenAPI return 200;
unpaid x402 returns 402. Its previous empty configuration produced 500. The
public origin, controlled payee and official `https://x402.org/facilitator` are
bound. No signed payment was submitted. Source `61f6388e1` changes only public
descriptions; five provider tests and lint passed.

Coinbase project `929175ec-e74d-48ff-a03e-7396cf40dcc0` belongs to entity
`entity_13b783ca-e69b-51e7-bf52-e7794333a818`. User-approved key
`agentic-economy-alpha` (`4df9f508-2454-4b4a-9a2d-020b0bb6407d`) and Wallet
Secret were obtained through official provider downloads. The existing broad
key was not reused. Official SDK provisioning created buyer `ae-alpha-buyer`
(`0x2595AB56Be60CA38606d0c106583b7B7a33707ef`) and Provider `ae-alpha-provider`
(`0x9ec2cD9E2E2a7D93c426d98b48a745990972EE71`). A harmless wallet-control
message passed SDK signing and viem verification; it is not a Provider claim.

Existing AE generators produced project policy `32297a1f-ba27-4769-97b3-7563481966e4`
and account policy `d0797b09-f2a6-4815-bc17-c1259e9f6978`. Provider readback
matches digest `sha256:83dd997fb78d8a51ef5825cd93b3e915d164bd4950ccc71235784570ea00c724`.
Temporary policy-management permission was removed and SDK reads still pass.
The existing custody preflight is ready for identity, policies and balance.
Faucet transaction `0x2b8cfdfe8c51a7e5d38a62326bba9ef0a5a829f568bf50fbd1a27fe1fe3e4686`
supplied 1 test USDC. Only Base Sepolia RPC is configured; its chain ID is 84532.

All 13 custody settings match exact Convex alpha readback and are installed
as Vercel production variables; deployment `dpl_CuuoGmGstgb3VxCnwsdJarVYD7ZU` activates
them with no new custody configuration findings. All four temporary credential
files were deleted after binding and backend verification. The standard
`workloadCron:ensurePlatformWorkloadIdentities` initialized four missing system
records. Manual `workloadCron:observeX402Treasury {}` then ran successfully,
without enabling recurring jobs. Read-only query verified its sandbox record:
`cdp-balance:0x2595ab56be60ca38606d0c106583b7b7a33707ef:base-sepolia:1789281442248`,
network `eip155:84532`, 1,000,000 atomic USDC, 10,000 buffer, generation 1,
recorded at `1789281442686`. This is external balance evidence, not customer
funding or purchase proof. Full cold user-journey audits await the integration
baseline in [alpha-validation-plan.md](alpha-validation-plan.md).

The subsequent `npm run gate` attempt on application source `024f14067`
passed 4,658 unit and 1,251 integration tests, then stopped at one compact
Support keyboard E2E failure (23 browser tests passed, eight skipped).
Log: `/private/tmp/ae-alpha-plan-t6sl85yp/alpha-current-source-gate.log`.
The diagnostics accordion failure was a test hydration race compounded by
repeated Enter toggles. Commit `d47a0e872ae18e18bda581deacff145a3b554d06`
waits for the existing hydration marker and activates once. Ten repeated
compact checks, four full-file viewport checks and three Support unit tests
passed. The subsequent full `npm run gate` passed with 4,658 unit, 1,251
integration, 24 E2E and ten accessibility tests; eight authenticated E2E
cases remained skipped. Log:
`/private/tmp/ae-alpha-plan-t6sl85yp/alpha-verified-source-gate.log`.

The follow-up authority review corrected the initial testnet-seed assessment:
`publishSeededSandboxTestnetTool` uses the common seed publisher, which creates
workload-owned curated supply. `capabilitySupplyProbes` requires an active
human owner outside the narrowly defined facilitator-discovery path. Therefore
the testnet seed also fails real probing with `authority_stale`. Its integration
test directly simulates a readiness observation and does not prove that path.
The existing human-owner alternative supports a new Provider workspace, x402
preview, connection with an EIP-191 claim signed by the controlled payee,
and publication with source x402 pricing. It requires the source-writes flag
and a valid public Bazaar 402 declaration, but not Stripe Accounts v2. This is
source evidence, not a completed runtime journey. No authority exception,
ownership mutation or forged readiness was introduced.

The existing reference-provider project was renamed through the official CLI
to `agentic-economy-sandbox-tools`. Readback preserved exact project ID
`prj_gyaX8fy0abiwTFfvfqnqrn71Al8p`, root directory and Node 22. Public-origin
migration is verified with the new project domain and deployment alias.

The custody review found existing rule and digest generators:
`cdpX402SellerCanaryPolicyRules` and `cdpX402PolicyRulesDigest`. Provisioning
used these with official CDP SDK readback. The canary's per-payment cap
is 10,000 atomic USDC; daily configuration is 50,000. The CDP rules enforce
the per-payment cap, not an aggregate daily total or explicit chain ID.
AE's sandbox profile/domain and budget controls remain necessary. Wallets and both policies are now provisioned and verified. The review's 67 focused checks passed.

**Updated 13 September 2026.** The orchestrator verified the following provider
state and local checks. This receipt supersedes the earlier 12 September claims that the app is usable, that
Clerk/Infisical resources still need creating, that the previous Convex target
is current, and that the synthetic Formance stack can supply the new boundary.
Earlier commands and receipts remain historical, not an active runbook.

- **Authority:** `hosted_alpha`, sandbox only. Backend custody is enabled; web
  activation is verified. Writes and recurring workloads remain disabled.
- **Vercel:** project `agentic-economy`,
  `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`, scope `creasybears-projects`;
  `https://app.aecon.ai` points to `dpl_CuuoGmGstgb3VxCnwsdJarVYD7ZU`, also at
  `https://agentic-economy-aspmf70b8-creasybears-projects.vercel.app`, source
  `5c0081f1578576dba2e894cfe5784978ac49534c`. All six Formance settings are
  active in this deployment.
- **Convex:** team `joel-chan`, new project `agentic-economy`, development
  `cool-crab-306`, provider production `cautious-zebra-473`; source
  `fbd22a563f204312f26aa9b8a53c55ca5969e02f` deployed. Ten old projects were
  deleted with the user's approval. Previous targets are historical only.
- **Observed HTTP and pending fixes:** health/release return 200; readiness
  remains 503 `deployment_manifest_invalid`. Private logs now identify only
  `STRIPE_SECRET_KEY` with the wrong key type. Source `14fd68b`
  accepts the actual standard-Base64 Clerk format and registers the lifecycle
  RPC token; `5dce3419b` updates the generated environment example and valid
  synthetic Clerk fixture. These fixes are deployed. Vercel production
  custody is now enabled with the verified Base Sepolia RPC map. The other
  three readiness findings remain cleared. Deployment log:
  `/private/tmp/ae-alpha-plan-t6sl85yp/alpha-custody-web-deploy.log`.
  The restricted Stripe command-key handoff remains pending. The branch
  remains unmerged to main.
- **Exact Convex environment reads:** all 13 new custody values, including the
  Base Sepolia RPC map, match. Stripe command execution belongs to Vercel;
  Convex retains its separate readback credential.
- **Clerk:** production instance `ins_3JEJtsKq3rdCZG94s6tAkkut9Y7`, issuer
  `clerk.aecon.ai`; endpoint `ep_3JET0Um63P5BmiF8x6Guz5ToyUZ` created at
  `https://app.aecon.ai/api/clerk/webhook` for `session.created`,
  `session.ended`, `session.revoked`, `user.updated`. The user saved the signing
  secret in Vercel and it is deployed. The CSP fix is deployed and the Clerk
  form loads. User signup, password and email steps remain pending; signed
  delivery and the authenticated journey are unverified.
- **Stripe:** sandbox account `acct_1Tlni770N4UjLqHt`; existing snapshot
  `we_1UEgKx70N4UjLqHtxiYhgLAD` and thin destination
  `ed_test_61VO4O26zMNAz9Nn616UvBfU9V8SqsP28ZeVu4UQaSGu` are enabled at
  `https://app.aecon.ai/api/stripe/webhook` and
  `https://app.aecon.ai/api/stripe/webhook/accounts-v2`, respectively. Exact
  paths were verified. Fresh `agentic-economy-alpha-readback` restricted test
  key installed as `STRIPE_READBACK_KEY` in Vercel production and Convex
  `cautious-zebra-473`; both commands exited 0 and its temporary file was
  deleted. SDK tax, Checkout, PaymentIntent, Price and Refund reads passed.
  Tax rate `txr_1UBZhn70N4UjLqHtDjJ74oie` is installed in Convex. The user
  applied Core Read, the saved UI was verified, and the installed key matches
  the edited key's suffix. Nevertheless, `v2.core.accounts.list` returns 403
  missing `v2_account_storer_read`; platform account retrieval also returns
  403. Core Read has not established Accounts v2 access. There is no successful
  connected-account canary, delivery/replay or purchase proof. The existing
  restricted command key retains its old label ending `-command`; the rename
  attempt did not persist and no permissions changed. The user was asked to
  transfer it to `/private/tmp/ae-alpha-credentials/stripe-command.key`; that
  file is empty with mode `0600`, and transfer remains pending.
- **Infisical:** organization `8d09981b-9b5e-4a59-aa6d-5561c4f4642a` has two
  new dedicated alpha projects. Both machine identities have verified deletion
  protection. Platform project
  `8b470821-5cfc-4f9a-a37a-c0e80f6779c7` uses environment `dev`, path
  `/platform`, and identity `ae-alpha-platform`
  (`13040b65-e776-4e5c-9ad0-fccad1ccb79d`). Customer project
  `5c61916a-4cdd-4fdd-9067-a145291de7d9` uses environment `dev`, path
  `/customer`, and identity `ae-alpha-customer`
  (`bd5a7a70-01ba-43a4-a7ea-6a7482f87a2a`). Each identity is a member only of
  its dedicated project; project isolation was chosen because custom roles
  require a paid plan. Both saved OIDC trusts use issuer
  `https://oidc.vercel.com/creasybears-projects`, audience
  `https://vercel.com/creasybears-projects`, subject
  `owner:creasybears-projects:project:agentic-economy:environment:production`,
  and TTL 3,600 seconds. All nine `AE_INFISICAL_*` variables were bound in
  Vercel production with exit 0. The superseded unused No Access identity
  `18030256-9085-4e51-8758-5a0e60599def` was deleted and deletion verified;
  old staging projects were untouched. Hosted OIDC authentication and secret
  CRUD remain unverified: the local Vercel CLI token had a development subject,
  so the canary aborted before any secret creation.
- **Formance bindings:** all six `AE_FORMANCE_*` values were installed in
  Vercel production and Convex `cautious-zebra-473` through official CLIs,
  both exit 0. Values are sandbox environment, gateway
  `https://formance-alpha.aecon.ai`, ledger `agentic-economy-alpha` and
  10,000 ms timeout. The two Access credentials came from exact AWS secret
  ARN `arn:aws:secretsmanager:ap-southeast-2:197716152388:secret:ae-alpha/package4/cloudflare-access-application-718qYi`,
  owned by new KMS key `b5701c00-bda9-4e47-9061-dbfdfec48244`. Credentials
  were never printed; the temporary dotenv file was deleted in cleanup.
  Vercel bindings are now active. Convex `AE_SERVICE_MODE=hosted_alpha` and
  `AE_FORMANCE_ENVIRONMENT=sandbox` bindings were verified; purchase runtime
  proof remains pending.
- **Ledger infrastructure:** apply completed with exit 0: 80 added, zero
  changed, zero destroyed. Saved plan
  `/private/tmp/ae-alpha-plan-t6sl85yp/alpha-fixed-storage.tfplan`, source
  `535598cb5a32b7e3c1bc976f0eeb18ef6fa995f1`, proposes 80 creates and six reads,
  with no existing-resource updates or deletes. Database storage is fixed at
  50 GiB with no autoscaling. Saved-plan SHA-256 is
  `1813729a1f92934c7fb1334361f4a3dc326485c48674b218a265ba03064abd38`.
  Initial apply log: `/private/tmp/ae-alpha-plan-t6sl85yp/alpha-apply.log`. The
  initial host `i-03783779db01d90fc` was replaced by the bootstrap repair below;
  current host is `i-073197e0346d83010`. RDS is `ae-alpha-formance`, ARN
  `arn:aws:rds:ap-southeast-2:197716152388:db:ae-alpha-formance`, internal
  resource ID `db-HXOLD5NCUPK4Y4EA67D62PPTDI`. VPC
  `vpc-0580eee94c9ef6255` uses `10.44.0.0/16`. Cloudflare tunnel is
  `c4f07700-e347-4f34-9d64-1f0992e7a863`; Access application is
  `55ab1c32-4663-44be-ae70-d239c8a3c7e9`. Alert topic is
  `arn:aws:sns:ap-southeast-2:197716152388:ae-alpha-package4-alerts`.
  Its email subscription is `PendingConfirmation`.
- **Bootstrap and Formance:** repair source
  `b949f94dd1ee495e1e36286742de2a0343e1df69` was applied through reviewed
  `alpha-bootstrap-fix.tfplan`, SHA-256
  `087b01c953879ddf8a0c6853798c83436363df176249e7360426c5a3ff8cbfc9`:
  one added, 46 changed, one destroyed. SSM command
  `df918365-90b6-441e-8510-ea879d0bc9af` succeeded: cloud-init done, k3s active,
  reconcile successful and timer active. Ready replicas: gateway one, ledger
  one, worker one, cloudflared two and operator one. Final pinned OpenTofu plan
  exited 0 with no changes; tunnel healthy with eight connections. Formance
  health is ready (gateway v2.3.1, ledger v2.4.12). `installSchema` completed
  and its repeat returned `replayed: true`; schema v1.3.0 digest is
  `sha256:881851b2348fc64af08df3245030ebdb3fdb5bcfd5de9e7f0ffe14f169082953`.
  This verifies bootstrap and schema installation, not an alpha purchase.
- **Old AWS retirement:** the user approved snapshots and retirement. Pinned
  OpenTofu 1.12.6 applied saved, reviewed plans in
  `/private/tmp/ae-old-retirement-9ia9rysy`: all 24 resources were removed
  (five drill, 19 main), following one source deletion-protection update.
  Exact drill cleanup SSM command `b8167267-2bbb-45d6-b47b-f67f66b8296d`
  returned `SUCCESS`, source verification `PASS` and cleanup `PASS`; digest
  `616c676cf13d38237c8716813a9141a32185ec307eb186f46bb2c8f628ade01d`.
  EC2 `i-063c00d935d85d74f` is terminated, root volume
  `vol-0a36f198a069d1d45` absent; both `package4-release-formance` and
  `package4-release-restore-20260904` return `DBInstanceNotFound`. NAT
  `nat-0aabc2385d7704d2d` is deleted and EIP `eipalloc-06be89467efa6ced9`
  absent. Available encrypted RDS snapshots are
  `package4-release-formance-retirement-20260913`,
  `package4-release-restore-20260904-retirement` and the additional final
  `package4-release-formance-final`. EBS snapshot `snap-04e41acaa13daaf60`
  completed at 100%. All use retained, enabled KMS key
  `5979d934-bd8d-4809-bd2e-5cf22092922e`. VPC, subnets, logs, vaults, state,
  audit, keys, roles and Cloudflare remain; dependent runtime grants, alarms,
  associations and routes were removed. The old root and drill are retired:
  an ordinary apply would recreate resources and must not be run.
- **Budget:** the retirement decision is resolved. Fresh low-traffic alpha
  remains estimated at USD 311.29/month before tax, plus retained storage and
  account costs. The former USD 390.45 combined paused-runtime assumption is
  superseded by completed retirement. Historical restore RPO remains 308
  seconds against the 300-second target; retained snapshots alone do not
  establish a new restore result.
- **Deployer access:** standalone CloudFormation stack
  `ae-alpha-deployer-access` is `CREATE_COMPLETE`. Exact prepared change set
  `alpha-runtime-access-20260913` was executed once through the user-authorized
  root browser. Its grant covers only two alpha runtime roles and one instance
  profile. Subsequent routine CLI identity was verified as assumed role
  `Package4ReleaseOpenTofu`; no root CLI was used. The Cloudflare deployment
  credential has recorded expiry `2026-09-20T23:59:59Z`; its temporary file
  was deleted, together with six superseded old preview artifacts. Reviewed
  applied plans and snapshots remain retained.
- **Source verification:** full `npm run gate` passed with exit 0 on
  `df0e62862731c9d9f6c8f7b8eaeda77581540b51`: 4,643 unit, 1,251 integration,
  24 E2E and ten accessibility; log `alpha-final-integration-gate.log`.
  Later fixes `14fd68b` and `5dce3419b` passed 125 focused tests and the
  environment-example check. The full gate is not claimed for latest HEAD.
  Runtime remains Node 22.22.0/npm 11.5.1.
- **Sandbox publication and paid-path correction:**
  `capability-offering:sandbox-aecon-reference:v1` was created, but its probe
  returned `authority_stale`; it remains unlisted. Public
  `POST market-tools/search`, source `current`, query `sandbox`, returned
  200 `no_candidates`. An ordinary fixed AUD $1 HTTP Tool can publish and
  quote, but Call reservation requires x402 financial booking and returns
  `commercial_policy_unavailable` without it. Only zero-price Calls are
  allowed without booking; a free HTTP demo cannot prove a paid purchase.
  Paid alpha needs the existing testnet x402 reference path, whose endpoint is deployed but human-owner admission remains pending. No cleanup wrapper or ownership bypass was written;
  seeded history is retained.

Bootstrap, Formance schema, testnet treasury and business Google signup are
verified. The official Clerk–Convex integration is enabled; authenticated
Account & security, Credit and Provider operations load. Six missing backend
source-write keys were repaired together and the app redeployed as
`dpl_CUppxcpy5G9c2vedJdf3Cp37wbbS`, source
`18f070720614cda20b5ad27176638f1893ca4487`; health and release return 200.
The genuine sandbox Provider workspace and source draft now exist, and live
x402 inspection verifies its controlled testnet payee. A replayed real Clerk
session event is recorded and visible in security history.

Stripe's restricted command-key transfer still blocks web readiness (503).
Google external publishing is verified as In production in the business project.
Clerk key configuration has user and organisation self-service disabled, matching
the approved backend-only scope. The authenticated Agent directory loads without
a newly observed key-list Forbidden log; actual credential issuance remains
unverified. Payee-control connection/publication, hosted Infisical, SNS
confirmation and supported paid-purchase proof remain incomplete. Alpha is not
ready. Full UX audits remain gated on that integration baseline.


### CLI activation follow-up — 13 September

The compiled CLI's no-flag default still targeted the superseded Vercel alias.
The source default now targets `https://app.aecon.ai`; CLI environment and flag
overrides retain their precedence. The origin/error and credential-store suites
passed 38 tests, focused lint passed, and the rebuilt CLI reports the canonical
origin. This source correction is not yet in the hosted downloadable archive;
the next verified web build must include it.

A real sandbox Provider CLI device request reached the signed-in business
owner's consent page, with `market_supply:manage`, seven-day expiry and no buyer
spending authority. Browser-required consent remains pending. The CLI stopped
polling after its hard-coded 60-second window. Its instruction to rerun does
not resume the outstanding device request: current `runConnectCommand` creates
a new registration and device request and does not persist the pending device
code. Record this as an activation recovery defect, not a completed connection.
No Provider credential was received or stored by this attempt.

The existing supply connection API supports an external EVM signer: its x402
branch re-inspects the endpoint, checks the observation and expiry, then calls
`verifyEip191Message` against the declared payee before admitting a connection.
The official Coinbase SDK can sign that existing claim message. No custom
signer adapter, fabricated ownership or browser-state injection is required.


### CLI approval recovery correction — 13 September

Pending device requests now persist privately across CLI runs, keyed by exact
origin, Provider/market profile and requested environment. The existing
`proper-lockfile` library excludes simultaneous polling. Expired, denied and
consumed requests are removed; token validation failure cannot leave a consumed
device code available for reuse. No new dependency or authentication protocol
was introduced. A cold Luna/max review found consumed-code and in-process expiry
edge cases; both were corrected with observable regression tests.

The focused CLI suites pass 73 tests and lint passes. Type checking and the
reproducible packaged-CLI check passed before the final two review corrections;
the full release gate is still running and is not yet claimed for the final
source. Its log is `alpha-cli-resume-gate.log`.

Two real hosted CLI runs returned pending with the same client reference
`ae_XfpUp4jxWyBNLDjXbdaEUfT2`, establishing that rerun resumes the existing device
request. The owner has not approved Provider access, and no credential was
issued or stored by these attempts. The private pending request remains locally
for the authorised continuation and expires according to the server deadline.
This CLI source correction still awaits the next hosted deployment.
