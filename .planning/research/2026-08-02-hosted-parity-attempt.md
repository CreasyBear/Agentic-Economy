# T51 hosted parity attempt — 2026-08-02

**Status:** blocked; no hosted WorkTree parity proof was established.

**Evidence boundary:** this report records command output, deployment readiness, and refusal/blocker observations only. It does not upgrade a preview deployment, a local Convex deployment, or a protected-edge response into hosted parity evidence.

## What was attempted

1. Checked the linked Vercel project, CLI identity, and the local OIDC token state.
2. Attempted the requested non-interactive Vercel preview deployment.
3. Ran the Convex deploy dry-run only; no Convex cloud deployment was created.
4. Probed the hosted WorkTree setup URL.
5. Ran the mandated T51 Playwright invocation with the available target values.

## Vercel checks

Project metadata in `.vercel/project.json` identifies project `agentic-economy`, project ID `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`, and team `team_O85TtPPdPANw2OCjrj4dEpxp`.

Command:

```text
npx vercel ls agentic-economy
```

Observed output:

```text
Vercel CLI 50.4.0
Fetching deployments in creasybears-projects
> Deployments for creasybears-projects/agentic-economy
```

No deployment rows were printed by the initial listing. The optional JSON attempt was not supported by this CLI:

```text
npx vercel ls agentic-economy --json
Vercel CLI 50.4.0
Error: unknown or unexpected option: --json
```

Command:

```text
npx vercel whoami
```

Observed output:

```text
Vercel CLI 50.4.0
creasybear
```

`VERCEL_OIDC_TOKEN` is present in `.env.local`, but its decoded JWT claims show `project_id=prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`, `environment=development`, `iat=1783978866`, and `exp=1784022066`. At the check time (`1785641216`), `exp` was in the past. The token value is intentionally not reproduced here.

## Preview deployment result

Command:

```text
npx vercel deploy --yes
```

This command was possible without an interactive login and completed successfully. The CLI uploaded 10.8 MB, ran the remote `npm run build`, and reported `Build Completed` and `Deployment completed`.

The resulting preview coordinates were verified with:

```text
npx vercel inspect agentic-economy-g3mwaxqeh-creasybears-projects.vercel.app
```

Observed deployment readback:

```text
id        dpl_F83yP9wsudjvVqrLQjB6Z65iVbYp
name      agentic-economy
target    preview
status    Ready
url       https://agentic-economy-g3mwaxqeh-creasybears-projects.vercel.app
```

The deployment is protected by Vercel Authentication. No protection-bypass secret was available in `.env.local`.

## Convex hosted preflight

Command:

```text
npx convex deploy --dry-run
```

Observed output and exit status 1:

```text
You are currently developing anonymously with a locally running project.
To deploy your Convex app to the cloud, log in by running `npx convex login`.
See https://docs.convex.dev/production for more information on how Convex cloud works and instructions on how to set up hosting.
```

This was a dry-run refusal, not a deployment. No Convex hosted deployment ID exists from this attempt; no ID is invented in this report.

## Hosted setup seam probe

The deployed preview was probed with a non-secret temporary setup-token placeholder (not a real credential):

```text
curl -sS -i -X POST "$DEPLOY_BASE_URL/api/v1/work-tree/setup" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <temporary-probe-token>' \
  --data '<T51 setup JSON with the verified source revision and Vercel deployment ID>'
```

Observed response:

```text
HTTP/2 401
content-type: application/json
{"error":{"message":"Protected deployment","code":"401"},"protection":{"vercel_auth_enabled":true}}
```

The request stopped at Vercel's protection layer. Therefore this probe did **not** establish the source route's expected `work_tree_setup_seam_missing` response. It established the earlier protection blocker only.

## Mandated T51 hosted spec attempt

The exact harness invocation was attempted with the preview URL, the verified Vercel deployment ID, the current source revision, a non-secret Convex-unavailable marker, and Clerk values read from `.env.local` (the secret itself is not reproduced):

```text
DEPLOY_BASE_URL='https://agentic-economy-g3mwaxqeh-creasybears-projects.vercel.app' \
DEPLOY_CONVEX_URL='https://agentic-economy-g3mwaxqeh-creasybears-projects.vercel.app' \
AE_RELEASE_SOURCE_REVISION='74054fa84562aa3580d9e9453189fc683a47d1cc' \
AE_RELEASE_DEPLOYMENT_ID='dpl_F83yP9wsudjvVqrLQjB6Z65iVbYp' \
AE_RELEASE_CONVEX_DEPLOYMENT_ID='UNAVAILABLE_NOT_DEPLOYED' \
AE_WORK_TREE_SETUP_TOKEN='<temporary-probe-token>' \
CLERK_SECRET_KEY='<redacted value from .env.local>' \
AE_WORK_TREE_CLERK_INSTANCE_ID='<value from .env.local>' \
AE_WORK_TREE_CLERK_SUBJECT='<value from .env.local>' \
npx playwright test --config=playwright.deploy-smoke.config.ts tests/deploy-smoke/work-tree-parity-release-proof.spec.ts
```

The `DEPLOY_CONVEX_URL` and `AE_RELEASE_CONVEX_DEPLOYMENT_ID` values above were **not** hosted Convex coordinates. They were explicit stand-ins solely to pass the release-config shape far enough to attempt the requested target; the run must not be interpreted as hosted Convex parity.

Observed output and exit status 1:

```text
Error: No tests found.
Make sure that arguments are regular expressions matching test files.
You may need to escape symbols like "$" or "*" and quote the argument.
```

The test runner stopped during test discovery, before the T51 test body ran. Consequently this invocation did not produce a Playwright assertion for `work_tree_setup_seam_missing`, nor a hosted evidence packet.

## Full environment contract for the next operator

`workTreeParityReleaseConfigFromEnvironment` requires the following values:

| Variable | Required | Contract |
| --- | --- | --- |
| `DEPLOY_BASE_URL` | yes | Deployed HTTPS Vercel URL; localhost, loopback, and `.local` URLs are rejected. |
| `DEPLOY_CONVEX_URL` | yes | Deployed HTTPS Convex URL; use the real hosted Convex URL, not the stand-in used in this attempt. |
| `AE_RELEASE_SOURCE_REVISION` | yes (or `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`) | Exactly 40 hexadecimal characters. The attempted source revision was `74054fa84562aa3580d9e9453189fc683a47d1cc`. |
| `AE_RELEASE_DEPLOYMENT_ID` | yes (or `VERCEL_DEPLOYMENT_ID`) | Actual Vercel deployment ID. The verified preview ID is `dpl_F83yP9wsudjvVqrLQjB6Z65iVbYp`. |
| `AE_RELEASE_CONVEX_DEPLOYMENT_ID` | yes (or `CONVEX_DEPLOYMENT_ID` / `CONVEX_DEPLOYMENT`) | Actual hosted Convex deployment ID. None was available in this attempt. |
| `AE_WORK_TREE_SETUP_TOKEN` | yes | Real setup-seam credential for the hosted target; do not use the probe placeholder. |
| `CLERK_SECRET_KEY` | yes | Clerk backend secret for the expected instance; keep it out of evidence files and command logs where possible. |
| `AE_WORK_TREE_CLERK_INSTANCE_ID` | yes (or `AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID`) | Clerk instance ID matching `CLERK_SECRET_KEY`. |
| `AE_WORK_TREE_CLERK_SUBJECT` | yes (or `AE_CUSTOMER_REQUEST_CLERK_SUBJECT`) | Existing Clerk acceptance subject for the cold human/agent journey. |
| `AE_WORK_TREE_SETUP_PATH` | no | Defaults to `/api/v1/work-tree/setup`; must remain a single absolute path without query, fragment, `..`, or `//`. |
| `AE_WORK_TREE_CHARTER` | no | Defaults to `My BAS is overdue and my books are a mess`; non-empty and at most 4,000 characters. |
| `AE_WORK_TREE_EVIDENCE_DIR` | no | Defaults to `output/release/work-tree-parity`. |
| `AE_WORK_TREE_TIMEOUT_MS` | no | Defaults to 180000; accepted range is 5000–900000 milliseconds. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | no | Needed when the preview is protected (the code also accepts `AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET`). No value was available in this attempt. |

For the separate Convex cloud preflight/deploy path, the CLI requires either an authenticated `npx convex login` session or a valid `CONVEX_DEPLOY_KEY`; the current `.env.local` points to an anonymous local deployment.

## Next operator steps

1. Renew or replace the expired Vercel OIDC/session credential and retain the verified preview deployment ID only if it remains reachable.
2. Supply a Vercel protection-bypass secret, or use an intentionally public hosted target, so the setup request can reach the application route rather than Vercel's 401 edge.
3. Obtain an authorized hosted Convex deployment URL and deployment ID. Do not treat `UNAVAILABLE_NOT_DEPLOYED` as an ID and do not create paid resources without authorization.
4. Confirm that the hosted `/api/v1/work-tree/setup` seam is actually present. Once the protected edge is bypassed, the current source contract expects the named missing-seam refusal `work_tree_setup_seam_missing` because that setup seam is not implemented yet.
5. Run the exact Playwright command above with real values and a working test-discovery configuration; preserve the resulting named failure or the complete hosted evidence packet.

## Blocker list

- The local `VERCEL_OIDC_TOKEN` is expired, although the cached Vercel CLI identity still permitted the preview deploy.
- Convex is anonymous/local; `npx convex deploy --dry-run` refused cloud deployment and no hosted Convex ID exists.
- The Vercel preview is protected; the setup probe received HTTP 401 `Protected deployment` before application routing.
- The mandated Playwright invocation exited 1 with `Error: No tests found` before the spec body executed.
- Because of those blockers, this attempt did not observe `work_tree_setup_seam_missing` and does not claim T51 hosted parity.
