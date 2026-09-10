# Lane M — bringing the stabilisation branch to main

Date: 2026-09-10. PR #221 `stabilisation/wells-0-3` → `main`. Plan: `~/.claude/plans/composed-wondering-puzzle.md` (Lane M).

## Outcome

- CI had never been green on this PR. Both Kernel release gate jobs failed on both prior runs (659694b0 at the Well 3 closeout and c00deba8 after Wells 1+2). The Well 3 closeout's "fresh-checkout CI proof" claim rested on local runs only; corrected here and in the Well 3 closeout pointer.
- Root causes were diagnosed from the CI logs and the installed Convex CLI source, then fixed at the cause. No timeout was raised, no scanner path was excluded, no compatibility shim was added.
- Result: (filled after merge) both jobs green on `<sha>`; merge commit `<sha>` on `origin/main`; `main` protected with both job contexts required.

## Root causes and fixes

| # | Symptom | Cause | Reference | Fix |
| --- | --- | --- | --- | --- |
| 1 | Fresh-checkout job: `No local deployment found` | The launcher decided anonymity only from `.convex/local/default/config.json`, absent on a fresh checkout, so it ran `convex deployment select local` (the non-anonymous path) | Convex CLI `chooseDeployment` (`cli.bundle.cjs:122847`) creates the `anonymous-agent` deployment when `CONVEX_AGENT_MODE=anonymous` | `isAnonymousLocalDeployment(env)` honours the env signal (commit b2a7daabb) |
| 2 | Fresh-checkout job: `Environment variable CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not set`, then a 120 s hang | The launcher set the placeholder on the child process env; `convex/auth.config.ts` reads the deployment env, which is empty on a new anonymous deployment. `convex dev` waits forever for the deployment env to change (`cli.bundle.cjs:120731-120837`) | Convex CLI agent bootstrap recipe (`cli.bundle.cjs:130776`): `init` → `env set` → `dev`; repo precedent `tools/release/verify-convex-generated-anonymous.ts` | Launcher runs `convex init` and `convex env set CLERK_JWT_ISSUER_DOMAIN <placeholder>` before `convex dev` in anonymous mode |
| 3 | Clean-source job: six CLI continuation tests time out at 5 s | Tests spawned `node --import tsx tools/ae/cli.ts`, transpiling the CLI per spawn (0.5–0.9 s); two spawns per test | Vercel CLI tests build then exec `dist`; vitest `globalSetup` | Build once in `globalSetup`, spawn `packages/cli/dist/ae.js` (0.10 s); tests now exercise the shipped artefact (commit 9082ac6f2) |
| 4 | Clean-source job: `XDG_CONFIG_HOME: false` assertion | GitHub runners export `XDG_CONFIG_HOME`; the test asserted the host's env | the harness's own controlled env | The spawn env removes the variable explicitly |
| 5 | Secret-scanning alert #1 | Stripe-shaped fixtures (`whsec_` + 29 characters) | Stripe docs placeholder convention; validators require only the prefix | Fixtures `sk_test_FIXTURE` / `whsec_FIXTURE`; alert resolved as used-in-tests |
| 6 | Local gate: three Playwright specs intermittently time out on `networkidle` | Vite dev mode serves hundreds of unbundled modules per route, so the network never idles within 15 s | Playwright docs: `networkidle` is discouraged for tests | All 34 waits replaced with web-first assertions across ten specs |

## Behavioural finding

The shipped CLI bakes its build revision in at build time. The old version test spoofed the revision through a runtime env var and only passed under the tsx interpreter. The test now asserts the mature property: provenance cannot be overridden at runtime.

## Smells register

| # | Smell | Disposition |
| --- | --- | --- |
| 1 | Closeouts claimed CI proof that CI never produced | Corrected here; Well 6 O6 fixes the Well 3 closeout text |
| 2 | Ad hoc `--test-timeout=15000/60000` flags remain on the integration and architecture scripts in `package.json` | Well 5 S7 removes them once those suites also spawn the built bundle |
| 3 | `convex dev` hangs silently on a missing deployment env var instead of exiting | Vendor behaviour; the launcher's fail-closed stage timeout is the guard; documented in the launcher comment |
| 4 | One e2e test needed a hover plus a wait for the destination route's lazy chunk before clicking, because the URL changes before the chunk loads | Recorded; a route-level readiness signal is a Well 6 candidate |
| 5 | The `/api/v1/registry` route and the integration test on `marketExternalRegistry:search` were not in the Well 4 draft's deletion scope | Caught by the outside voice; folded into Well 4 C3 |

## Convention from here

`main` is protected. Each remaining well lands as `well-N/<slug>` from `main`, one PR per well, merged with a merge commit once `npm run gate` and both CI jobs are green (`AGENTS.md`, "Branches and merges").
