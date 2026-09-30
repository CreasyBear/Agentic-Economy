# Build and dev loop — 29 September 2026

Static read of the root scripts, lockfile, Vite/TypeScript config, and CI workflows. No `npm run build`, `check`, `gate`, or `dev:local` was executed. Dependency versions come from `package-lock.json` (lockfileVersion 3), not `npm ls`.

The fast local loop is `check`. `gate` is a serial release proof: isolated Convex codegen, a production Vite/Nitro build, a clean typecheck, the full unit and integration suites, two Playwright invocations, and a CLI pack smoked on Node 20 and 22. `dev:local` is a long-running stack, not a compile.

## Script graph

Node 22 is required (`.nvmrc`, `package.json` `engines.node` `22.x`, `packageManager` `npm@11.5.1`). `require-supported-node.ts` exits before `dev:local`, `gate`, and Convex codegen when the major is not 22.

### `check` — local acceptance, serial

`package.json:25`: `lint` → `deps:check` → `typecheck` → `test:imports` → `test:ts-standards` → `test:ui-contract`.

| Step | What it runs |
|---|---|
| `lint` | `oxlint src convex tests tools --deny-warnings` |
| `deps:check` | `tools/dev/deps-ratchet.ts`: dependency-cruiser JSON over `src`, `convex`, `tools`, then ceiling checks (`no-circular` 0, `no-circular-via-barrel` 0, `no-circular-capability-supply-internal` 0) |
| `typecheck` | `tsc --noEmit --incremental --tsBuildInfoFile .cache/typecheck.tsbuildinfo` with a 4096 MB heap |
| `test:imports` | One esbuild CLI build unless `AE_CLI_PREBUILT=1`, then 30 listed Vitest files under `tests/imports/` with `AE_SCAN_MODE=clean` |
| `test:ts-standards` | `tests/imports/ts-standards.test.ts`, CLI rebuild skipped |
| `test:ui-contract` | `tests/ui-contract`, CLI rebuild skipped |

Not in `check`: env example, Convex codegen, Vite/Nitro build, unit/integration/eval suites, Playwright, CLI consumer pack, `dev:local`.

### `gate` — full source release proof, serial

`package.json:41` → Node 22 guard → `test:release:source` (`package.json:40`):

1. `mkdir -p output/release`
2. `verify:deployment-manifest --environment development`
3. `env:example:check` (`render-env-example.ts --check`)
4. `verify:convex-generated:anonymous` — copies `package.json`, lockfile, `tsconfig.json`, `convex.json`, `src`, and `convex` to a temp checkout, symlinks `node_modules`, deletes five `convex/_generated` sources, runs anonymous `convex init`, `env set`, and `codegen --typecheck=disable`. Each Convex command is capped at 180s. Fails if generated output drifts. Does not modify the real checkout.
5. `verify:release-integrity -- npm run build` — snapshots `convex/_generated` and `src/routeTree.gen.ts`, runs `build`, fails if those bytes or modes change. Also asserts the pinned `nitro-nightly`.
6. `AE_CLI_PREBUILT=1 test:release:source:after-codegen`

`build` (`package.json:22`) is `pack:cli:public` then `vite build`:

- `build:cli` → `scripts/build-cli.ts`: esbuild bundles `tools/ae/cli.ts` to `packages/cli/dist/ae.js` (Node 20 target, ESM, `@x402/svm` external).
- `npm pack ./packages/cli --ignore-scripts` into `public/downloads`. `--ignore-scripts` skips the package `prepack`, which would build the CLI again.
- `vite build` runs TanStack Start, Nitro preset `vercel` / `nodejs22.x`, React, and Tailwind. Source maps and the Sentry plugin turn on only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all set.

`test:release:source:after-codegen` (`package.json:42`), still one chain:

`lint` → `deps:check` → `typecheck:release` → `test:release:unit` → `test:release:integration` → `test:types` → `test:imports` → `test:ts-standards` → `test:seo` → `test:ui-contract` → `test:e2e` (with `AE_E2E_SKIP_A11Y=1`) → `test:e2e:a11y` → `test:cli-package`.

| Stage | Speed-relevant shape |
|---|---|
| `typecheck:release` | Same 4096 MB `tsc --noEmit`, **no** `--incremental` and no tsbuildinfo. A warm `check` does not pay this down. |
| `test:release:unit` | `vitest run tests/unit`, default plus JSON at `output/release/unit-vitest.json` |
| `test:release:integration` | `vitest run tests/integration convex --no-file-parallelism`, JSON at `output/release/integration-vitest.json` |
| `test:e2e` | Playwright `tests/e2e` on two projects (375×812 and 1440×1100). `AE_E2E_SKIP_A11Y=1` drops `tests/e2e/a11y`. No `PLAYWRIGHT_BASE_URL`, so Playwright boots `npm run dev -- --port 3020` with empty Convex URLs. Frontend-only; not the `dev:local` stack. `fullyParallel: true`; CI retries 2, local retries 0. |
| `test:e2e:a11y` | Playwright `tests/e2e/a11y --workers=1` **without** `AE_E2E_SKIP_A11Y`, so accessibility runs once here, and this invocation can boot a second Vite on 3020. |
| `test:cli-package` | `scripts/test-cli-package.ts`. Inherited `AE_CLI_PREBUILT=1` packs with `--ignore-scripts` (no second esbuild), then packs again and compares SHA-256. Installs the tarball into a temp consumer and runs `--help` on Node 20 and Node 22 via `npm exec --package=node@<major>`. |

`AE_CLI_PREBUILT=1` also makes Vitest global setup (`tests/setup/build-cli.global.ts`) skip esbuild. On `check`, only `test:imports` builds the CLI; the later two Vitest scripts set the same variable. Outside those paths, every Vitest process builds the CLI once in global setup.

`test:chat:conformance`, `test:release:architecture`, authenticated e2e, package5, and the paid gateway smoke are **not** in `gate`.

### `dev:local` — supervised stack, then optional work

`package.json:17` → Node 22 guard → `tools/dev/local-dev.ts`.

1. Merge `.env`, `.env.local`, `.env.development`, `.env.development.local` under the process env. Drop `CONVEX_DEPLOYMENT`.
2. Require `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `AE_E2E_OWNER_EMAIL`. Missing any of these exits before Vite. There is no auth bypass.
3. Probe `CONVEX_URL` / `VITE_CONVEX_URL`. If nothing local answers, start Convex. Anonymous (`CONVEX_AGENT_MODE=anonymous`, or `.convex/local/default/config.json` deployment `anonymous-agent`): `convex init`, `convex env set CLERK_JWT_ISSUER_DOMAIN` (real value or `https://release-proof.invalid`), then `convex dev --typecheck disable --local-force-upgrade`. Otherwise `convex deployment select local`, then the same `convex dev`.
4. Outer Convex ready budget is `CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS` (default **300**) plus 30s. The comment in `local-dev.ts` says a large local database can exceed the CLI’s own 30s default.
5. After the URL probes succeed, spawn `npm run dev -- --port 3024 --strictPort --host 127.0.0.1` (plain `npm run dev` is Vite on port **3000**). Inject the local source-write secret, Convex server-function token, and chat-share secret. Chat-share sync failure does not stop Vite.
6. Once Vite is ready, `runOptionalStages` runs identities, sandbox spending seed, directory scan start, sandbox Tool publish, and FX refresh. FX waits until identities finish; the others run together. A stage failure is logged and does **not** take Vite down. Scan completion is not required: an already-complete catalogue is skipped; otherwise only `x402DirectoryIndexRefresh:start` must succeed. `--no-doctor` is the only launcher flag; remaining args are Vite args. `--skip-scan` / `--skip-seed` are not implemented.
7. Unless `--no-doctor`, `ae doctor --json` runs with a 120s cap. Doctor failure leaves the stack up.

CI’s fresh-checkout job starts this with `--no-doctor` and gives up if `http://127.0.0.1:3024/api/ready` is silent for **180s**. That is tighter than the launcher’s 330s Convex budget. An empty anonymous CI database is the case that budget was sized for; a grown local database is not.

## Install size and duplicates

| Tree | `du -sh` | `du -sk` | In root `npm ci`? |
|---|---:|---:|---|
| `node_modules` | 1.4G | 1,420,928 KB (~1.36 GiB) | yes |
| `tools/release/package5-reference-provider/node_modules` | 131M | 134,224 KB | no — not a workspace |
| `packages/cli/node_modules` | absent | — | hoisted; the package declares no dependencies |

Largest root children: `@react-icons` 214M, `@sentry` 74M, `@biomejs` 58M, `viem` 53M, `@solana` 50M, `posthog-js` 40M, `lucide-react` 39M, `convex` 36M, `aislop` 26M, `@formance` 26M. `@react-icons/all-files@4.1.0` is about 15% of the tree; its only lockfile parent is `@rjsf/shadcn`. `@biomejs/biome@2.5.11` is pulled by devDependency `aislop`, not by `lint` (`oxlint`). `@solana/kit@5.5.1` is a non-optional dependency of `@coinbase/cdp-sdk`, with a large nested codec copy; the CLI bundle externalizes `@x402/svm` and still leaves this tree on disk.

Direct manifest: **69** `dependencies`, **26** `devDependencies`, **9** `overrides`. Lockfile install entries, excluding 1 workspace link: **1,279** (745 not flagged `dev`, 534 flagged `dev`, 224 `optional`) across **1,071** names. The 745 figure is not “production packages”: a package is unflagged when any production edge can see it. Hoisted `typescript@5.9.3` is a root devDependency but stays unflagged because `viem`, `ox`, `abitype`, Convex helpers, and `@solana/*` peer-depend on TypeScript.

**126** names resolve to more than one version. **75** are platform packages (`@esbuild/*`, `@oxc-parser/binding-*`, `@oxlint/binding-*`, `lightningcss-*`). **51** are libraries; **20** of those sit on the non-dev graph. The ones that matter for install weight or correctness:

| Package | Versions | Why it split |
|---|---|---|
| `zod` | 4.4.3 hoisted; 3.25.76 ×5 | nested under `@ag-ui/core`, `@coinbase/cdp-sdk`, `@x402/core`, `@x402/evm`, `@x402/extensions` |
| `typescript` | 5.9.3 hoisted; 6.0.3 | `aislop` depends on `^6.0.3` |
| `react` | 19.2.7 hoisted; 19.2.8 | nested under `aislop` |
| `@clerk/shared` | 4.30.2 direct pin; 4.31.1 | nested under `@clerk/backend` (`^4.31.1`) |
| `oxlint` | 1.80.0 direct; 1.66.0 | `react-doctor` pins `>=1.66.0 <1.67.0` |
| `esbuild` | 0.27.0 direct (also `convex`); 0.28.1 | nested under `tsx` |
| `@oxc-project/types` | 0.138.0, 0.146.0, 0.147.0 | only library name with three versions |

`npm ci` on a release job extracts every platform binding in the lockfile, not just linux-x64. That, plus the 214M icon pack and the Solana/Biome subtrees, is the install cost behind the 1.4G tree. The PR `check` job caches `node_modules` with key `node-modules-<os>-<arch>-node22-<lockfile hash>` and runs `npm ci` only on a miss. `source-proof`, `fresh-checkout-proof`, and `cli-release` still run a full `npm ci` every time. `setup-node` `cache: npm` stores tarballs, not `node_modules`.

## TypeScript and Vite settings that affect speed

Root `tsconfig.json`: `skipLibCheck: true`, `isolatedModules: true`, `noEmit: true`, `moduleResolution: Bundler`, `allowImportingTsExtensions: true`. `incremental` is **not** in the config. Only the `typecheck` script passes `--incremental --tsBuildInfoFile .cache/typecheck.tsbuildinfo`. `gate` uses `typecheck:release`, which does not. `.cache/` is gitignored.

A local info file is present: `.cache/typecheck.tsbuildinfo`, 1,994,248 bytes, mtime `2026-09-29T03:49:38Z`. Repeat local `check` typechecks can reuse it. CI `check` does not cache `.cache`, so its incremental flag still typechecks from scratch and only writes an info file that the job discards. `isolatedModules` is what lets esbuild and Vite transpile a file at a time; `skipLibCheck` keeps `tsc` out of `.d.ts` under `node_modules`. The include list is still wide (`src`, `convex`, `tests`, both Vite configs, Playwright, selected `scripts` and `tools/dev`). `tools/ae/**` is on `tools/tsconfig.json`, not the root include, so `typecheck` does not own that tree unless an included file imports it. Convex’s own `convex/tsconfig.json` repeats `skipLibCheck` and `isolatedModules` and has no incremental flag; `convex dev` and codegen are invoked with `--typecheck=disable`.

`vite.config.ts` speed-related choices:

- `optimizeDeps.include` prebundles a fixed Clerk, TanStack, `h3-v2`, and `seroval` set so the first SSR request does not discover them one at a time.
- `server.watch.ignored` skips `test-results`, `playwright-report`, and `.output`.
- `ssr.external` is `@clerk/tanstack-react-start`. `ssr.noExternal` is `/@visx\//` because those packages’ extensionless ESM re-exports fail under Node and block the dev server.
- `resolve.tsconfigPaths: true` (also set in `vitest.config.ts`).
- Production source maps are off unless the Sentry plugin is enabled. Nitro’s `preset: "vercel"` makes `vite build` a Node server bundle, which is the slow half of `build`; the CLI esbuild is the fast half.
- No `server.warmup`, no custom `optimizeDeps` hold, no Vite cache override.

Vitest (`vitest.config.ts`) sets `watch: false` and a CLI global setup. It does not set pool, isolation, `fileParallelism`, or `maxWorkers`. The integration script’s `--no-file-parallelism` is the explicit serial choice. Playwright’s one-worker accessibility run is the other.

## CI shape

Three workflows. This pass did not query GitHub Actions. `docs/reviews/2026-09-28-ci-gate-profile.md` said the push-triggered workflows were disabled until billing on 1 October. The YAML below is newer than that profile (see drift).

**Kernel release gate** (`.github/workflows/kernel-release-gate.yml`):

- Triggers: pull requests to `main`, tags `v*`, `workflow_dispatch`. No `push` to `main`.
- Concurrency group `kernel-release-<workflow>-<ref>`, `cancel-in-progress: true`.
- `check` — pull requests only, 15-minute cap. Checkout, Node from `.nvmrc`, global `npm@11.5.1`, lockfile-keyed `node_modules` cache, `npm ci` on miss, `npm run check`. No browser, no Convex.
- `source-proof` — dispatch or `v*` tag, 45-minute cap. Uncached `npm ci`, Chromium cache at `~/.cache/ms-playwright`, `npm run gate`, `git diff --exit-code -- convex/_generated`, upload unit/integration JSON.
- `fresh-checkout-proof` — same trigger, **no `needs`**, so it runs beside source-proof. 30-minute cap. Own `npm ci`, Convex binary cache, `dev:local --no-doctor`, 180s ready poll, one discovery Playwright spec against `:3024`, `ae doctor`, then stop the stack.
- `chat-staging-proof` and `live-gateway-proof` — manual, `main` only, extra confirmations, `needs: source-proof`. `npm ci --ignore-scripts`.
- `authenticated-platform-proof` — any manual dispatch, `needs: source-proof`.

**Public CLI release** (`.github/workflows/cli-release.yml`): tags `v*` or manual, concurrency does not cancel, 90-minute cap. Tag must equal `packages/cli` version. `npm ci`, Chromium, **`npm run gate` again**, pack, `test:cli-package` (Node 20 and 22), cosign, publish to `CreasyBear/aecon-cli`. A tag push can therefore run the kernel source gate and this gate as two full proofs.

**React Doctor** (`.github/workflows/react-doctor.yml`): pull request opened/synchronize/reopened/ready_for_review only. Cancels in progress. Checkout v5 with full history, action pinned to `013f7373f91a3b9e68bd1dc7d4d354f4b041b117`, `blocking: error`, 15-minute cap. Separate from `npm run doctor` (`react-doctor` offline).

The 28 September profile disagrees with current files: it describes a hand-expanded source job that skipped `env:example:check` (current source-proof is `npm run gate`, which includes it), `push` to `main` with cancel only on PRs (current trigger has no main push, and cancel is on), no `node_modules` cache and no PR `check` job (both exist now), no incremental typecheck (the local `typecheck` script has it; release typecheck still does not), and React Doctor on main pushes (current workflow is PR-only). Treat that profile as yesterday’s measurement and proposal, not as a map of this YAML.

## Recent timing

No full `gate` log is in the tree. Two local release JSON files sit next to each other and match after-codegen order (unit, then integration):

| File | Wall span | Result | When |
|---|---:|---|---|
| `output/release/unit-vitest.json` | 56.3s (`19:20:46.398Z`–`19:21:42.728Z`) | success; 6,578 tests, 6,577 passed, 1 pending; 650 files | 2026-09-28 |
| `output/release/integration-vitest.json` | 123.4s (`19:21:43.196Z`–`19:23:46.550Z`) | success; 2,061 tests, 2,027 passed, 31 pending, 3 todo; 188 files; `--no-file-parallelism` | 2026-09-28, ~0.5s after unit |
| `output/release/chat-conformance-vitest.json` | 7.1s | success; 89/89 | 2026-09-28 13:49Z; **not** part of `check` or `gate` |

Those two spans are about **3.0 minutes** of local Vitest for unit plus serial integration. They do not include lint, dependency-cruiser, either `tsc`, codegen, Vite build, Playwright, or the CLI pack. The typecheck info file was rewritten at `2026-09-29T03:49:38Z`; nothing recorded how long that `tsc` took.

GitHub Actions medians in `docs/reviews/2026-09-28-ci-gate-profile.md`, from ten earlier successful kernel runs, not re-measured here: about **43 runner-minutes** per run (source job median ~39.4, fresh-checkout ~3.9, parallel). One run’s log (`36389507077`) attributed ~13.8 min to release unit, ~5.0 to serial integration, ~3.0 to browser e2e, ~1.9 to the second accessibility pass, and ~1.5 to TypeScript. Local unit-plus-integration at 3.0 min versus that runner’s ~18.8 min is a different machine and possibly a different suite; it is not a claim that today’s `gate` is 3 minutes.

## What dominates the loop

Repeat work on one `gate` invocation: `lint` and `deps:check` run in `check` and again after codegen; `test:imports`, `test:ts-standards`, and `test:ui-contract` likewise; `typecheck:release` ignores the incremental cache `check` just wrote; accessibility is a second Playwright command with its own Vite; `test:cli-package` packs the CLI twice. `cli-release` then runs `gate` again on a tag that already ran `source-proof`.

Install weight is the 1.4G tree, especially `@react-icons/all-files` (214M), nested Solana (50M), and dev-only Biome via `aislop` (58M), multiplied by 126 duplicate versions of which 75 are unused platform bindings on any single OS. PR `check` is the only job that caches the extracted tree.

Dev-server cold start is Convex, not Vite: default ready budget 300s plus 30s, with `optimizeDeps.include` covering the known SSR deps once the app process is up. CI will not wait that long (180s to `/api/ready`).
