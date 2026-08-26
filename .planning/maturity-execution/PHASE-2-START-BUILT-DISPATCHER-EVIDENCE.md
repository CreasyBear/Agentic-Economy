# Phase 2 Start/Clerk built-dispatcher evidence

Status: `SOURCE_GATE_GREEN_HOSTED_P9_01_OPEN`

This evidence is bounded to repair leaf 1.1.3. It does not establish hosted Clerk
issuance, live Clerk configuration, or final Phase 2 acceptance.

## Exact pre-fix reproducer

- Candidate source: `85486e84fb46c775c64b177f9ddd85d76146bc11`
- Retained clean artifact worktree:
  `/private/tmp/ae-p2-tanstack-probe.9fsKdm`
- Vercel function config:
  `.vercel/output/functions/__server.func/.vc-config.json`
- Generated handler: `index.mjs`
- Launcher/runtime: `Nodejs` / `nodejs22.x`
- Compiled server-function export: `readCanonicalBaseUrlServer`
- Full compiled server-function ID:
  `2fa85ed74b9e4c98162a6afc8fb5ce1293d3aeefc4038246a582c81f3cff8aa3`
- Compiled server-function chunk:
  `.vercel/output/functions/__server.func/_ssr/owner-status.functions-DN9WN7aB.mjs`
- Request: `GET /_serverFn/2fa85ed74b9e4c98162a6afc8fb5ce1293d3aeefc4038246a582c81f3cff8aa3`
  with `x-tsr-serverFn: true`, same-origin `Origin`, and
  `Accept: application/json`
- Response: HTTP 500 with
  `{"status":500,"unhandled":true,"message":"HTTPError"}`
- Root diagnostic:
  `ReferenceError: setErrorThrowerOptions is not defined`
- Failing generated chunk:
  `.vercel/output/functions/__server.func/_ssr/dist-CgNYPbvv.mjs`

Mechanical command:

```sh
AE_CANONICAL_BASE_URL=https://agentic-economy.test \
  /Users/joelchan/.nvm/versions/node/v22.22.0/bin/node \
  tools/maturity/phase-2-start-built-dispatcher.mjs \
  --artifact-root /private/tmp/ae-p2-tanstack-probe.9fsKdm \
  --server-fn readCanonicalBaseUrlServer \
  --expect-regression
```

Expected terminal marker: `START_BUILT_DISPATCHER_REGRESSION_REPRODUCED`.

The tool reads the actual `.vc-config.json`, resolves the full compiled function
ID and owning chunk, loads the generated production Node handler, sends the
actual server-function request, and reports every generated chunk that calls,
defines, or imports `setErrorThrowerOptions`.

## Primary cause

Installed versions at the failing candidate are:

- `@clerk/tanstack-react-start@1.4.9`
- `@clerk/backend@3.8.5`
- `@clerk/react@6.11.1`
- `@tanstack/react-start@1.168.26`
- `vite@8.1.0`
- `rolldown@1.1.3`

The installed Clerk source correctly imports
`setErrorThrowerOptions` from `@clerk/react/internal` before calling it. Direct
Node import, a raw Rolldown build, and a Vite build of the full Clerk package
entry preserve that import.

A bounded Vite SSR reproducer that bundles
`@clerk/tanstack-react-start` while selecting only `ClerkProvider` and
`useAuth` reproduces the generated defect with Vite 8.1.0/Rolldown 1.1.3: the
output retains the side-effect call but rewrites the internal import to contain
only `InternalClerkProvider`. The same invalid import/call pair exists in
Nitro's intermediate asset before final Vercel packaging:
`node_modules/.nitro/vite/services/ssr/assets/dist-CgNYPbvv.js`.

Therefore the primary defect is Vite 8.1.0/Rolldown 1.1.3 selected-export
tree-shaking of the Clerk framework barrel during the TanStack/Nitro SSR build.
It is not caused by the application handler, Clerk middleware ordering, or the
final Vercel adapter.

## Bounded repair probe

A disposable detached worktree at
`/private/tmp/ae-p2-vite-upgrade-probe.ET6SG3` was used only to test the
dependency boundary. After the driver landed the verified dependency delta and
the shared candidate passed the same real-dispatcher check, this disposable
worktree was removed through `git worktree remove --force`. It is no longer an
evidence dependency. The separately retained pre-fix evidence worktree
`/private/tmp/ae-p2-tanstack-probe.9fsKdm` remains untouched.

Changing only the pinned Vite development dependency from `8.1.0` to `8.2.2`
and regenerating the lockfile resolved Vite 8.2.2 with Rolldown 1.2.5. The full
production `npm run build` succeeded. The rebuilt Vercel function retained the
same `.vc-config` handler and full compiled server-function ID, with compiled
function chunk
`.vercel/output/functions/__server.func/_ssr/owner-status.functions-CMcgCGu2.mjs`.
No generated chunk called `setErrorThrowerOptions` without importing or
defining it.

The authorized production delta is limited to driver-owned `package.json` and
`package-lock.json`, and is now present in the shared worktree. It changes no Clerk or TanStack package, no
`src/start.ts`, no Vite configuration, no middleware ordering, and no generated
file. Lockfile regeneration currently measures 355 insertions and 96 deletions,
principally Vite 8.2.2, Rolldown 1.2.5 and platform bindings,
`@oxc-project/types` 0.146.0, `picomatch` 4.0.7, and Vite-local
`lightningcss` 1.33.0 packages. That lock churn must be reviewed by the driver
as dependency resolution, not described as application-source change.

## Source versus hosted evidence

After the dependency repair, the real generated dispatcher request progresses
past the missing symbol and reaches the unchanged production Clerk middleware.
Without Clerk development-instance configuration, installed Clerk 1.4.9 then
fails closed with `Clerk: no secret key provided`.

This is the strongest credential-free source result supported by the installed
production SDK boundary:

- the built dispatcher loads;
- the generated bundle contains no unbound Clerk call;
- production Clerk middleware is still present and reached;
- missing Clerk configuration fails closed rather than bypassing middleware.

It is not a successful public-function response and is not positive
multi-identity Clerk evidence. A genuine positive Clerk session/token chain
requires Clerk development-instance configuration and remains assigned to
hosted gate P9-01 with candidate/deployed revision binding and freshness rules.
This leaf will not invent locally signed Clerk tokens, fake a Clerk protocol, or
add a test-only middleware branch.

The integration driver reconciled the source gate with the accepted
source/hosted split. GREEN now requires the generated handler to load, no
unbound Clerk call to exist, the exact server-function request to reach
unchanged production Clerk middleware, missing configuration and a
caller-shaped invalid-token request to fail closed, the production middleware
order to remain exact, and caller-shaped principal/account headers not to be
accepted. Edits outside this leaf's four owned files remain prohibited.

## Official mechanism references

- Clerk TanStack Start middleware:
  <https://clerk.com/docs/reference/tanstack-react-start/clerk-middleware>
- TanStack Start middleware:
  <https://tanstack.com/start/latest/docs/framework/react/guide/middleware>
- TanStack Start server functions:
  <https://tanstack.com/start/latest/docs/framework/react/guide/server-functions>
- TanStack Start server entry point:
  <https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point>

The Clerk documentation describes `jwtKey` as networkless verification for an
already issued token. It does not provide a credential-free mechanism for
issuing a positive Clerk identity, and it is not used here as one.

## Current TDD boundary

RED command:

```sh
AE_P2_START_ARTIFACT_ROOT=/private/tmp/ae-p2-tanstack-probe.9fsKdm \
  /Users/joelchan/.nvm/versions/node/v22.22.0/bin/npx vitest run \
  tests/maturity/phase-2-start-built-dispatcher.test.ts
```

The test fails with `start_built_dispatcher_not_fixed` against the retained
pre-fix artifact. The driver has authorized and landed the exact dependency
delta and the source-gate wording.

## Verified shared-candidate result

Source base at verification:
`85486e84fb46c775c64b177f9ddd85d76146bc11`, with the driver-owned Vite
8.2.2/package-lock delta present and not yet committed. The leaf does not claim
that base hash alone contains the repair; the integration driver owns the exact
candidate commit/ref after composition.

The fresh shared build reports:

- `.vc-config` handler: `index.mjs`
- launcher/runtime: `Nodejs` / `nodejs22.x`
- full compiled server-function ID:
  `2fa85ed74b9e4c98162a6afc8fb5ce1293d3aeefc4038246a582c81f3cff8aa3`
- compiled function chunk:
  `.vercel/output/functions/__server.func/_ssr/owner-status.functions-CMcgCGu2.mjs`
- middleware composition chunk:
  `.vercel/output/functions/__server.func/_chunks/start.mjs`
- unbound `setErrorThrowerOptions` call chunks: `[]`
- production Clerk registration present: `true`
- Clerk library and configuration fail-closed path present: `true`
- production local-E2E switch fails loud: `true`
- exact request middleware order:
  `requestCorrelationMiddleware`, `apiRequestBoundaryMiddleware`,
  `observabilityRequestMiddleware`, `securityHeadersRequestMiddleware`,
  `agentContentNegotiationMiddleware`, `csrfMiddleware`,
  `sourceWriteAdmissionMiddleware`, `...clerkRequestMiddleware`

The actual no-credential request and the actual caller-shaped request carrying
an invalid bearer plus spoofed principal/account/authority headers both return
HTTP 500 at unchanged Clerk configuration validation with
`Clerk: no secret key provided`. No caller-supplied authority value appears in
the response or diagnostics. The test does not treat this 500 as a successful
public result; it treats it as credential-free proof that production Clerk
composition is reached and fails closed.

## Measured checks

- `npm run test:phase2:start-built-dispatcher` -> fresh Vite production build
  passed; `START_BUILT_DISPATCHER_PASS`; Vitest 1 file / 1 test passed.
- `npx vitest run tests/maturity/phase-2-start-built-dispatcher.test.ts` with no
  artifact override -> 1 file / 1 test passed against the build in the project
  root. This is the mode used when unchanged release coverage selects all of
  `tests/maturity`.
- Raw pre-fix checker with `--expect-regression` ->
  `START_BUILT_DISPATCHER_REGRESSION_REPRODUCED`.
- Raw pre-fix checker with `--expect-source-fixed` -> nonzero with
  `start_built_dispatcher_not_fixed` and the exact missing-symbol diagnostic.
- `npm run typecheck` -> pass.
- `npm run test:imports` -> 11 files / 29 tests passed, including route and
  client/server import boundaries.
- `npx vitest run tests/unit/security/ssrf-surface-drift.test.ts` -> 1 file / 1
  test passed.
- `npx prettier --check` on all four leaf-owned files -> pass.
- `npx oxlint` on the owned tool/test -> pass.
- Generated artifact plus owned test/tool Clerk-key-material scan -> none.
- Owned test/tool TODO/FIXME/skipped/focused-test scan -> none.

The unchanged release chain already runs `test:maturity:coverage`, whose input
includes the entire `tests/maturity` directory. The regression therefore joins
the existing release chain without editing `test:release:source`; its default
artifact root is the project root produced earlier by release source
generation. The named leaf command rebuilds immediately before the same test.

## Four Unlazy passes

1. Broad defect pass: reproduced the original generated handler failure,
   isolated the first invalid intermediate bundle, and reduced the cause to the
   exact Vite/Rolldown version boundary with direct-import/full-barrel controls.
2. Integration-seam pass: drove the real `.vc-config` handler for both missing
   configuration and caller-shaped invalid-token requests, checked the exact
   compiled middleware order, and confirmed the unchanged Clerk boundary
   dominates the server-function call.
3. Polish/regression pass: ran the fresh named build gate, typecheck, import and
   route boundaries, SSRF drift, Prettier, and Oxlint. The only finding was that
   unchanged release selection supplies no artifact environment variable; the
   owned test now safely defaults to the release-built project artifact.
4. Adversarial pass: proved the original artifact fails the fixed expectation,
   retained the exact regression marker, injected caller-shaped identity
   headers without acceptance, and found no key material, stub, skipped test,
   focused test, fake token, or test-only middleware branch.

No additional defect or polish finding remains in leaf-owned scope. The only
production/shared changes are the integration-driver-owned Vite 8.2.2
dependency/lockfile refresh and the named package script. There is no config,
application-source, generated-source, Clerk, or TanStack package delta from
this leaf.
