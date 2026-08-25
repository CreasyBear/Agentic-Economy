# Package and distribution architecture review

**Evidence date:** 2026-08-25  
**Checkout:** `8c38b57b2`  
**Authority:** `PRODUCT.md`, current source and tests, recent Git history, and
`research/WHOP-AE-MATURITY.md`.

The product has two distribution units today: one private deployable application
and one public-facing, binary-only CLI package. Only the CLI presently meets the
threshold for an independently versioned package. The source domains that it
uses are application implementation, not candidate npm packages.

## Current package inventory

There are exactly two checked-in package manifests outside `node_modules`.

| Unit | Manifest and current contract | Consumer and lifecycle | Current gap |
|---|---|---|---|
| Agentic Economy application | The root manifest is `agentic-economy@0.1.0`, `private: true`, ESM, Node 22, npm 11.5.1 (`package.json:2-6`, `package.json:146-149`). It owns all runtime and development dependencies and the single lockfile. | Deployed website, catalogue, chat, HTTP API, MCP endpoint, authenticated invocation plane, and supplier surfaces. It is built and deployed as an application, not published to npm. | The root manifest has no `workspaces` field, and `package-lock.json` has no `packages/cli` entry. The root and CLI happen to share version `0.1.0`, but no checked-in rule couples or separates those versions. |
| Agentic Economy CLI | `@agentic-economy/cli@0.1.0` is ESM and advertises the `ae` binary at `dist/ae.js`; its allowlist is `dist/ae.js` plus `README.md`; it supports Node 20+ (`packages/cli/package.json:2-15`). | This is a real independent consumer boundary: docs tell agents to run it through `npx`, outside the application checkout (`README.md:72-78`; `src/routes/for-agents.tsx:82-101`). It therefore deserves its own package and release version. | It declares no `scripts`, `exports`, `publishConfig`, dependencies, or `private` flag (`packages/cli/package.json:1-17`). Direct deep imports are not deliberately closed. A clean direct pack can silently omit the advertised binary. |

The CLI is intentionally a self-contained executable. The source build imports
the CLI entry and commands under `tools/ae`, selected application contract and
formatting modules under `src`, and third-party dependencies. An esbuild metafile
probe using the checked-in build options observed 1,554 inputs: 19 under
`tools/ae`, 200 under `src`, and 1,335 under `node_modules`. This count describes
the current bundle graph; it does **not** justify extracting those inputs into
packages.

The external entry points are:

- npm/npx installation of `@agentic-economy/cli`, exposing only the `ae`
  executable (`packages/cli/package.json:6-11`); there is no supported
  programmatic JavaScript import.
- the CLI command contract: `manifest`, `search`, `inspect`, `compare`,
  `inspect-plan`, `connect`, `fund`, `call`, `status`, `cancel`, `recover`, and
  `revoke` (`tools/ae/cli.ts:158-188`).
- the deployed application's HTTP Operation endpoints and `/mcp`; these are
  network contracts, not npm library exports (`README.md:22-34`,
  `src/routes/mcp.ts:7-19`, `src/routes/api.v1.market-operations.search.ts:18-32`,
  `src/routes/api.v1.operations.call.ts:7-22`).

## Build and release flow

### Current build inputs and artifacts

`npm run build:cli` invokes `scripts/build-cli.mjs` (`package.json:8-11`). The
script bundles `tools/ae/cli.ts` with the root `tsconfig.json`, targets Node 20,
emits ESM with a Node shebang, suppresses source maps and legal comments, writes
`packages/cli/dist/ae.js`, and makes it executable
(`scripts/build-cli.mjs:1-18`). `dist/` is globally ignored
(`.gitignore:1-3`), so the output is correctly generated rather than committed.

On this checkout, the exact build produced an executable 3,121,462-byte
`dist/ae.js`. `npm pack ./packages/cli --json --dry-run` after the build reported
three files: `README.md` (501 bytes), `dist/ae.js` (3,121,462 bytes), and
`package.json` (324 bytes); the tarball was 555,639 bytes. These measurements are
diagnostic, not release budgets.

`npm run build` separately invokes Vite (`package.json:14-17`). TanStack Start
and Nitro build a Vercel Node 22 deployment (`vite.config.ts:61-84`). A clean
probe passed and emitted `.vercel/output/config.json`, `.vercel/output/nitro.json`,
static assets, and the `__server` function bundle. This deployable is an
application artifact and should remain distinct from the npm CLI tarball.

### Current verification and ordering

The source release workflow checks out clean source, installs Node from `.nvmrc`,
pins npm 11.5.1, runs `npm ci`, validates the deployment manifest, runs Operation
and chat conformance, generates and verifies Convex source, and then calls
`test:release:source:after-codegen` (`.github/workflows/kernel-release-gate.yml:46-93`).
That final script orders its relevant tail as:

```text
... test:types
-> test:imports
-> test:ts-standards / SEO / UI / browser tests
-> test:cli-package
-> build (web application)
```

This ordering is visible in `package.json:29-30`. It is wrong on a clean
checkout because `test:imports` reads the generated CLI before
`test:cli-package` builds it.

The CLI package verifier itself is valuable: it packs into a temporary
directory, rejects repository TypeScript, installs the tarball as a consumer,
runs the installed `ae --help --json`, checks the canonical command set, and
checks the installed `bin` mapping (`scripts/test-cli-package.mjs:7-42`). It
passed with `CLI_PACKAGE_PASS` after a build. There is no checked-in `npm publish`
command or CI publication job; the existing workflow proves source and deployed
gateway behavior, but does not publish the CLI.

Recent history confirms the boundary and the sequencing gap: commit
`76e31dc72` introduced the CLI manifest, build script, and packed-consumer test
together; commit `65959ec48` then added the import test's unconditional compiled
entry point. Neither commit added a CLI-local lifecycle script or moved the CLI
build before import verification.

## Clean-checkout release defect

The defect is reproduced, not inferred. A temporary tree was made from
`git archive HEAD`, followed by the workflow's exact `npm ci`; this excluded all
ignored build state while using the checked-in lockfile. The generated file was
absent immediately after install:

```text
AFTER_NPM_CI_ARTIFACT=absent
```

Running `npm run test:imports` then returned exit 1 with the exact deciding
output:

```text
Error: ENOENT: no such file or directory, open 'packages/cli/dist/ae.js'
 ❯ tests/imports/operation-product-legacy-independence.test.ts:28:31

Test Files  1 failed | 10 passed (11)
Tests       1 failed | 28 passed (29)
```

The test unconditionally includes `packages/cli/dist/ae.js` and reads every
listed entry point (`tests/imports/operation-product-legacy-independence.test.ts:5-12`,
`:16-29`). After `npm run build:cli`, the same clean tree returned exit 0:

```text
Test Files  11 passed (11)
Tests       29 passed (29)
CLI_PACKAGE_PASS
```

Build state therefore fully explains the 28/29 versus 29/29 result. The test is
not flaky and should not be weakened: it is checking the artifact agents will
actually run. The release graph must build that artifact before inspecting it.

There is a second manifestation of the same ownership defect. In a separate
clean archive, `npm pack ./packages/cli --json --dry-run` returned exit 0 but
reported only:

```text
README.md     501 bytes
package.json  324 bytes
entryCount    2
```

The tarball had no `dist/ae.js`, despite the manifest's `bin` declaration. The
root `prepack` script (`package.json:10`) does not belong to the nested CLI
package and is not invoked when that package is packed directly; the CLI
manifest has no lifecycle script. Thus the repository can currently create a
nominally successful but unusable publish candidate from clean source.

## Package extraction rule

A boundary becomes a package only when all of the following are true:

1. It has at least one independent consumer outside the application deployment
   **or** an independent build, release, and version lifecycle.
2. It can state a small, stable external contract (exports, binary, protocol, or
   artifact) and test that contract from the consumer side.
3. Its dependency direction and ownership are clearer after extraction, and it
   can be built reproducibly from clean source.

Folder size, internal reuse, a `public.ts` filename, or a domain boundary alone
is never sufficient. The current CLI qualifies because external agents install
and run it and because it needs publish/version decisions separate from a web
deployment. The application qualifies as a deployable, private root—not as a
registry library. No other current domain qualifies.

## Recommended distribution architecture

Keep one private application workspace and one publishable CLI workspace. Do
not create a monorepo of domain packages.

1. **Workspace and lock ownership.** Add only `packages/cli` to the root npm
   `workspaces` list so the single lockfile records the CLI manifest and npm can
   target it unambiguously. Keep the root `private: true`. The workspace is
   justified by the CLI's external consumer, not by the existence of a folder.
2. **Package exports.** Keep `@agentic-economy/cli` binary-only. Retain
   `bin.ae = dist/ae.js` and the narrow `files` allowlist, and set an explicit
   empty `exports` map so deep JavaScript imports are not a supported contract.
   Do not add a speculative SDK export; API and MCP remain the programmatic
   interfaces. Add `publishConfig.access = public` to make the documented public
   `npx` installation the enforced registry policy.
3. **Build ownership and ordering.** Make the CLI package's own `prepack` invoke
   a path-independent build rooted at the repository, while retaining an
   explicit root `build:cli` command for CI. In the source release graph, run
   `build:cli` **before** `test:imports`; then run the installed-tarball contract
   test before the web `build`. Do not rely on an implicit lifecycle hook to
   repair CI ordering.
4. **Publication.** The publish job should require the clean source gate, build
   from the exact revision, run `npm pack --workspace @agentic-economy/cli`,
   verify the exact file allowlist and digest, install and test that same
   tarball, then publish the tarball file (not a newly packed directory) with
   public access and npm provenance. The package-local `prepack` may defensively
   rebuild before packing; the resulting tarball is the sole candidate. A
   publish command must never be reachable before these checks. Application
   deployment and CLI publication may share source proof, but neither should
   silently trigger the other.
5. **Versioning.** Version the CLI independently with SemVer in
   `packages/cli/package.json` and a CLI-specific tag such as `cli-v0.1.0`.
   Changes to commands, flags, JSON output, credential storage behavior, retry
   behavior, Node support, or the binary entry point are CLI contract changes.
   A web-only deployment need not bump the CLI. Record the source revision and
   tarball digest in release evidence; reject an already-published version.
6. **Consumer contract tests.** Preserve the present temporary-install test and
   expand it to assert the exact three-file allowlist, executable/shebang,
   blocked library imports, manifest version/bin/engine, and `--help --json` on
   Node 20 and Node 22. Add deterministic consumer tests for public
   search/inspect and authenticated call/status/cancel/recover request shapes
   against a stub or local contract server. A post-publish smoke should install
   the exact version into a fresh directory and rerun the offline help contract.

The intended clean release order is therefore:

```text
npm ci
-> source/conformance/codegen checks
-> build:cli
-> import and remaining source tests
-> pack exact CLI tarball
-> installed-tarball consumer contract tests
-> web application build
-> publish CLI only on a CLI release tag
-> deploy application through its existing deployment lifecycle
```

This preserves externally observable CLI and network behavior while making
clean-checkout and publishability properties that the release system proves.

## Keep internal

Reject package-per-domain. Keep the following application-local:

- Operation supply, execution, invocation, receipt, money, registry, agent
  access, observability, and catalogue modules under `src/modules`, including
  their current `public.ts` repository seams;
- Convex schema, functions, generated bindings, and persistence projections;
- HTTP and MCP route implementations, web UI, chat, supplier publication, and
  administrative surfaces;
- `tools/ae` TypeScript sources and shared application contracts used to compile
  the CLI—the published boundary is the binary, not those source modules;
- development fixtures, conformance harnesses, release smoke tooling, research,
  and tests.

If a future independent consumer genuinely requires an in-process JavaScript
API and commits to its own compatibility lifecycle, that evidence can justify a
new package then. Until that consumer exists, agents already have the supported
CLI, API, and MCP entry points, and extracting domain libraries would increase
release coupling without adding a real market surface.

## Verification commands

These commands prove the current and proposed boundaries without publishing or
performing live work:

```sh
# Clean source (run in a temporary git archive after npm ci)
test ! -e packages/cli/dist/ae.js
npm run test:imports                    # current defect: 28/29

# Correct artifact order
npm run build:cli
test -x packages/cli/dist/ae.js
npm run test:imports                    # 29/29
npm run test:cli-package                # CLI_PACKAGE_PASS
npm pack ./packages/cli --json --dry-run

# Application distribution
npm run build                           # emits .vercel/output

# Full checked-in source release gate after ordering is repaired
npm run test:release:source
```

Publishing and production smoke commands are deliberately excluded from this
read-only review. No current checkout evidence proves that a CLI version has
been published; the recommendation makes publication conditional on the
consumer and artifact checks above.
